"""Helpers to push mail and transcript updates back to Google Sheets."""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Dict, Iterable, Mapping, Optional

import gspread
from django.conf import settings
from gspread.utils import rowcol_to_a1
from django.utils import timezone
from datetime import datetime

from .domain_transcript_generate import TranscriptRequest
from .cctv.domain_cctv import CCTVExam, CCTVCentreEntry, CCTVDVD
from django.db.models import Max

logger = logging.getLogger(__name__)

MAIL_FIELD_ALIASES: Dict[str, tuple[str, ...]] = {
    "mail_status": (
        "mail status",
        "status",
        "mail_status",
    ),
    "remark": (
        "remark",
        "remarks",
        "mail remark",
    ),
}

TRANSCRIPT_FIELD_ALIASES: Dict[str, tuple[str, ...]] = {
    "mail_status": (
        "mail status",
        "status",
        "mail_status",
    ),
    "transcript_remark": (
        "transcript remark",
        "remark",
        "remarks",
    ),
    # allow writing back TR No to the sheet
    "tr_request_no": (
        "tr_request_no",
        "tr no",
        "trn_request_no",
        "tr_requestno",
        "trn req no",
        "trn_req_no",
        "tr-request-no",
    ),
    # allow writing back pdf_generate to the sheet
    "pdf_generate": (
        "pdf_generate",
        "pdf_generated",
        "pdf generate",
        "pdf",
    ),
}

# =====================================
# CCTV FIELD ALIASES (NEW - SAFE ADD)
# =====================================

CCTV_FIELD_ALIASES: Dict[str, tuple[str, ...]] = {
    "start_label": (
        "startdvd",
        "start dvd",
        "start",
    ),
    "end_label": (
        "enddvd",
        "end dvd",
        "end",
    ),
    "cc_start_label": (
        "ccstart",
        "cc start",
    ),
    "cc_end_label": (
        "ccend",
        "cc end",
    ),
    "objection_found": (
        "objection",
        "objection_found",
    ),
}


def _render_transcript_status(value: object) -> str:
    # When pushing status back to the sheet, prefer human readable labels.
    # Treat empty/blank DB value as In Progress (the UI shows 'In Progress').
    if value is None:
        return "In Progress"
    text = str(value).strip()
    if not text:
        return "In Progress"
    normalized = TranscriptRequest.normalize_status(text)
    if normalized == TranscriptRequest.STATUS_DONE:
        return "Sent"
    if normalized == TranscriptRequest.STATUS_PROGRESS:
        return "In Progress"
    if normalized == TranscriptRequest.STATUS_PENDING:
        return "Pending"
    # otherwise return the raw text
    return text


def _get_setting(key: str) -> Optional[str]:
    if hasattr(settings, key):
        value = getattr(settings, key)
        if value:
            return str(value)
    value = os.getenv(key)
    return str(value) if value else None


def _service_account_path() -> str:
    sa_file = _get_setting("GOOGLE_SERVICE_ACCOUNT_FILE")
    if not sa_file:
        raise RuntimeError("GOOGLE_SERVICE_ACCOUNT_FILE is not configured.")
    return sa_file


@lru_cache(maxsize=None)
def _get_client(sa_path: str) -> gspread.Client:
    return gspread.service_account(filename=sa_path)


def _open_sheet(sheet_id: str) -> gspread.Spreadsheet:
    client = _get_client(_service_account_path())
    try:
        return client.open_by_url(sheet_id)
    except gspread.SpreadsheetNotFound:
        return client.open_by_key(sheet_id)
    except Exception:
        # If the caller passed an ID instead of a URL, retry open_by_key.
        return client.open_by_key(sheet_id)


@lru_cache(maxsize=None)
def _get_worksheet(sheet_id: str, worksheet_gid: Optional[int]) -> gspread.Worksheet:
    sheet = _open_sheet(sheet_id)
    if worksheet_gid is not None:
        try:
            return sheet.get_worksheet_by_id(worksheet_gid)
        except gspread.WorksheetNotFound:
            logger.warning("Worksheet with GID %s not found in sheet %s; falling back to first worksheet.", worksheet_gid, sheet_id)
        except AttributeError:
            for candidate in sheet.worksheets():
                if getattr(candidate, "id", None) == worksheet_gid:
                    return candidate
    worksheet = sheet.get_worksheet(0)
    if worksheet is None:
        raise RuntimeError(f"Sheet {sheet_id!r} does not contain any worksheets.")
    return worksheet


# =====================================
# CCTV DYNAMIC WORKSHEET ACCESS
# =====================================

def _get_worksheet_by_name(sheet_id: str, sheet_name: str) -> gspread.Worksheet:
    sheet = _open_sheet(sheet_id)
    try:
        return sheet.worksheet(sheet_name)
    except Exception:
        raise RuntimeError(f"Worksheet {sheet_name!r} not found in sheet {sheet_id}")


@lru_cache(maxsize=None)
def _header_map(sheet_id: str, worksheet_gid: Optional[int]) -> Dict[str, int]:
    worksheet = _get_worksheet(sheet_id, worksheet_gid)
    headers = worksheet.row_values(1)
    mapping: Dict[str, int] = {}
    for index, header in enumerate(headers, start=1):
        if not header:
            continue
        mapping[header.strip().lower()] = index
    return mapping


def _resolve_column(column_map: Mapping[str, int], aliases: Iterable[str]) -> Optional[int]:
    for alias in aliases:
        key = alias.strip().lower()
        if key in column_map:
            return column_map[key]
    return None


def _extract_row_number(raw_row: Mapping[str, object]) -> Optional[int]:
    for candidate in ("__row_number", "_row_number", "row_number"):
        value = raw_row.get(candidate) if isinstance(raw_row, Mapping) else None
        if isinstance(value, int):
            return value
        if isinstance(value, str):
            try:
                return int(value)
            except ValueError:
                continue
    return None


def _coerce_value(value: object) -> object:
    if value is None:
        return ""
    return value


def _persist_row_number(instance, row_number: int) -> None:
    if not hasattr(instance, "raw_row"):
        return
    raw_row = getattr(instance, "raw_row") or {}
    if not isinstance(raw_row, dict):
        raw_row = dict(raw_row)
    if raw_row.get("__row_number") == row_number:
        return
    raw_row["__row_number"] = row_number
    raw_row["row_number"] = row_number
    instance.raw_row = raw_row
    try:
        instance.save(update_fields=["raw_row"])
    except Exception:  # pragma: no cover
        logger.debug("Unable to persist row number for instance %s", getattr(instance, "pk", None))


def _locate_row_number(
    sheet_id: str,
    worksheet_gid: Optional[int],
    instance,
    raw_row: Mapping[str, object],
    reference_keys: Iterable[str],
) -> Optional[int]:
    worksheet = _get_worksheet(sheet_id, worksheet_gid)
    candidates = []
    for key in reference_keys:
        value = getattr(instance, key, None)
        if not value and isinstance(raw_row, Mapping):
            value = raw_row.get(key)
        if value in (None, ""):
            continue
        candidates.append(str(value).strip())
    for value in candidates:
        if not value:
            continue
        try:
            cell = worksheet.find(value)
        except gspread.GSpreadException:
            continue
        except Exception as exc:  # pragma: no cover
            logger.debug("Error while searching sheet %s for value %s: %s", sheet_id, value, exc)
            continue
        if cell:
            return cell.row
    return None


def _apply_updates(
    sheet_id: str,
    worksheet_gid: Optional[int],
    row_number: int,
    updates: Dict[str, object],
    alias_map: Dict[str, Iterable[str]],
) -> None:
    if not updates:
        return
    worksheet = _get_worksheet(sheet_id, worksheet_gid)
    columns = _header_map(sheet_id, worksheet_gid)
    pending: Dict[str, object] = {}

    for field, value in updates.items():
        aliases = alias_map.get(field)
        if not aliases:
            continue
        col_index = _resolve_column(columns, aliases)
        if col_index is None:
            logger.debug("No column found for field %s in sheet %s", field, sheet_id)
            continue
        cell = rowcol_to_a1(row_number, col_index)
        pending[cell] = _coerce_value(value)

    if not pending:
        return

    try:
        import time
        max_retries = 3
        retry_delay = 2  # Start with 2 seconds
        
        for attempt in range(max_retries):
            try:
                # BATCH UPDATE: Use batch_update instead of individual updates
                # This reduces API calls from N to 1, dramatically reducing quota usage
                batch_data = [
                    {
                        'range': range_name,
                        'values': [[value]]
                    }
                    for range_name, value in pending.items()
                ]
                
                if len(batch_data) == 1:
                    # Single cell - use simple update
                    worksheet.update(batch_data[0]['range'], batch_data[0]['values'])
                else:
                    # Multiple cells - use batch update (1 API call instead of N)
                    worksheet.batch_update(batch_data)
                
                break  # Success, exit retry loop
            except Exception as exc:
                # Check if it's a rate limit error (429)
                if "429" in str(exc) or "Quota exceeded" in str(exc):
                    if attempt < max_retries - 1:
                        logger.info(f"Rate limit hit, waiting {retry_delay}s before retry {attempt + 2}/{max_retries}")
                        time.sleep(retry_delay)
                        retry_delay *= 2  # Exponential backoff: 2s, 4s, 8s
                        continue
                    else:
                        # Max retries reached, log and fail gracefully
                        logger.warning(f"Rate limit exceeded after {max_retries} retries, dropping update")
                        return  # Don't raise, just skip this update
                # Re-raise if not rate limit error
                raise
    except Exception as exc:  # pragma: no cover
        logger.warning("Failed to push updates %s to sheet %s: %s", pending, sheet_id, exc)


def sync_mail_submission_to_sheet(instance, changed_fields: Mapping[str, object]) -> None:
    sheet_id = _get_setting("GOOGLE_SHEETS_SPREADSHEET_ID")
    if not sheet_id:
        return
    worksheet_gid = _get_setting("GOOGLE_SHEETS_WORKSHEET_GID")
    gid = int(worksheet_gid) if worksheet_gid and worksheet_gid.isdigit() else None
    raw_row = getattr(instance, "raw_row", {}) or {}
    row_number = _extract_row_number(raw_row)
    if not row_number:
        row_number = _locate_row_number(
            sheet_id,
            gid,
            instance,
            raw_row,
            ("rec_ref_id", "enrollment_no", "rec_official_mail"),
        )
        if row_number:
            _persist_row_number(instance, row_number)
    if not row_number:
        logger.debug("Skipping sheet sync for mail request %s: row number unavailable", instance.pk)
        return
    updates: Dict[str, object] = {}
    if "mail_status" in changed_fields:
        updates["mail_status"] = instance.mail_status
    if "remark" in changed_fields:
        updates["remark"] = getattr(instance, "remark", "")
    if updates:
        _apply_updates(sheet_id, gid, row_number, updates, MAIL_FIELD_ALIASES)


def sync_transcript_request_to_sheet(instance, changed_fields: Mapping[str, object]) -> None:
    sheet_id = _get_setting("GOOGLE_TRANSCRIPT_SPREADSHEET_ID")
    if not sheet_id:
        return
    worksheet_gid = _get_setting("GOOGLE_TRANSCRIPT_WORKSHEET_GID")
    gid = int(worksheet_gid) if worksheet_gid and worksheet_gid.isdigit() else None
    raw_row = getattr(instance, "raw_row", {}) or {}
    row_number = _extract_row_number(raw_row)
    if not row_number:
        row_number = _locate_row_number(
            sheet_id,
            gid,
            instance,
            raw_row,
            ("tr_request_no", "request_ref_no", "enrollment_no", "submit_mail"),
        )
        if row_number:
            _persist_row_number(instance, row_number)
    if not row_number:
        logger.debug("Skipping sheet sync for transcript request %s: row number unavailable", instance.pk)
        return
    updates: Dict[str, object] = {}
    if "tr_request_no" in changed_fields:
        updates["tr_request_no"] = getattr(instance, "tr_request_no", "")
    if "mail_status" in changed_fields:
        updates["mail_status"] = _render_transcript_status(instance.mail_status)
    if "transcript_remark" in changed_fields:
        updates["transcript_remark"] = getattr(instance, "transcript_remark", "")
    if "pdf_generate" in changed_fields:
        updates["pdf_generate"] = getattr(instance, "pdf_generate", "")
    if updates:
        _apply_updates(sheet_id, gid, row_number, updates, TRANSCRIPT_FIELD_ALIASES)


def import_transcript_requests_from_sheet(sheet_id: Optional[str] = None, worksheet_gid: Optional[int] = None, limit: Optional[int] = None, no_prune: bool = False, force_overwrite_status: bool = False) -> Dict[str, int]:
    """Import transcript request rows from the Google Sheet into the database.

    The function attempts to match rows to existing TranscriptRequest instances by
    request_ref_no, enrollment_no or submit_mail. If no match is found a new
    instance is created. The raw_row field is preserved and the discovered
    sheet row number is persisted into raw_row.__row_number.

    Returns a summary dict with counts: created, updated, total.
    """
    sheet_id = sheet_id or _get_setting("GOOGLE_TRANSCRIPT_SPREADSHEET_ID")
    if not sheet_id:
        return {"created": 0, "updated": 0, "total": 0}
    worksheet_gid = worksheet_gid or _get_setting("GOOGLE_TRANSCRIPT_WORKSHEET_GID")
    gid = int(worksheet_gid) if worksheet_gid and isinstance(worksheet_gid, str) and worksheet_gid.isdigit() else worksheet_gid

    worksheet = _get_worksheet(sheet_id, gid)
    try:
        records = worksheet.get_all_records()
    except Exception:
        # Fall back to reading values if get_all_records is not available
        values = worksheet.get_all_values()
        if not values or len(values) < 2:
            return {"created": 0, "updated": 0, "total": 0}
        headers = [h.strip().lower() for h in values[0]]
        records = []
        for row in values[1:]:
            rec = {headers[i]: (row[i] if i < len(row) else "") for i in range(len(headers))}
            records.append(rec)

    created = 0
    updated = 0
    total = 0
    # collect tr_request_no values seen in the sheet so we can optionally prune DB rows
    seen_tr_request_nos: set = set()
    created_trs: list = []
    updated_trs: list = []

    def pick(norm_row, *keys):
        for k in keys:
            if k and k in norm_row:
                v = norm_row.get(k)
                if v is not None and str(v).strip() != "":
                    return v
        return None

    for idx, raw in enumerate(records):
        if limit and total >= limit:
            break
        total += 1
        # row numbers in sheets: header row is 1 -> first data row is 2
        row_number = idx + 2
        # normalize keys to lowercase stripped
        norm_row = {str(k).strip().lower(): v for k, v in (raw.items() if isinstance(raw, Mapping) else {})}

        # common header candidates
        # accept several possible header names for the transcript reference/number
        # parse explicit numeric transcript request number (TR No) separately
        tr_request_no_raw = pick(norm_row, 'tr_request_no', 'tr no', 'trn_request_no', 'trn_req_no', 'trn request no')

        request_ref_no = pick(
            norm_row,
            'request_ref_no',
            'trn_reqest_ref_no',
            'trn_request_ref_no',
            'request ref no',
            'ref no',
            'reference',
            'ref',
        )
        enrollment_no = pick(norm_row, 'enrollment_no', 'enrollment', 'enroll no', 'enroll')
        student_name = pick(norm_row, 'student_name', 'name', 'student')
        institute_name = pick(norm_row, 'institute_name', 'institute')
        transcript_receipt = pick(norm_row, 'transcript_receipt', 'receipt', 'transcript receipt')
        transcript_remark = pick(norm_row, 'transcript_remark', 'remark', 'remarks', 'comment')
        submit_mail = pick(norm_row, 'submit_mail', 'submit mail', 'email', 'mail')
        pdf_generate = pick(norm_row, 'pdf_generate', 'pdf', 'pdf generate')
        mail_status_raw = pick(norm_row, 'mail_status', 'status', 'mail status')
        requested_at_raw = pick(norm_row, 'requested_at', 'date', 'request date', 'trn_reqest_date', 'trn_request_date')

        # parse date if possible
        requested_at = None
        if requested_at_raw:
            try:
                if isinstance(requested_at_raw, datetime):
                    requested_at = requested_at_raw
                else:
                    # try common ISO / dd-mm / mm/dd formats
                    txt = str(requested_at_raw).strip()
                    try:
                        requested_at = datetime.fromisoformat(txt)
                    except Exception:
                        try:
                            # try day-first common format
                            requested_at = datetime.strptime(txt, '%d-%m-%Y')
                        except Exception:
                            try:
                                requested_at = datetime.strptime(txt, '%d/%m/%Y')
                            except Exception:
                                requested_at = None
            except Exception:
                requested_at = None

        if requested_at is None:
            requested_at = timezone.now()

        # try to find existing instance
        instance = None
        # Primary matching strategy: Try to match by composite key (tr_request_no + requested_at)
        # This ensures we correctly identify records even when TR numbers are reused
        if tr_request_no_raw and requested_at:
            try:
                tr_lookup = int(str(tr_request_no_raw).strip())
                if tr_lookup > 0:  # Only match on valid TR numbers (not 0)
                    # Try to find by TR number AND requested date
                    instance = TranscriptRequest.objects.filter(
                        tr_request_no=tr_lookup,
                        requested_at=requested_at
                    ).first()
            except Exception:
                instance = None
        
        # Fallback 1: Match by tr_request_no only if no date match found
        if not instance and tr_request_no_raw:
            try:
                tr_lookup = int(str(tr_request_no_raw).strip())
                if tr_lookup > 0:
                    instance = TranscriptRequest.objects.filter(tr_request_no=tr_lookup).first()
            except Exception:
                instance = None
        
        # Fallback 2: Match by request_ref_no (unique reference)
        if not instance and request_ref_no:
            ref_str = str(request_ref_no).strip()
            if ref_str:
                instance = TranscriptRequest.objects.filter(request_ref_no__iexact=ref_str).first()
        
        # Fallback 3: Match by composite of enrollment + date (more specific than enrollment alone)
        if not instance and enrollment_no and requested_at:
            enroll_str = str(enrollment_no).strip()
            if enroll_str:
                instance = TranscriptRequest.objects.filter(
                    enrollment_no__iexact=enroll_str,
                    requested_at=requested_at
                ).first()
        
        # Fallback 4: Match by enrollment only (last resort, may be ambiguous)
        if not instance and enrollment_no:
            enroll_str = str(enrollment_no).strip()
            if enroll_str:
                # Only use this if we don't have tr_request_no (to avoid wrong matches)
                if not tr_request_no_raw or int(str(tr_request_no_raw).strip() or 0) == 0:
                    instance = TranscriptRequest.objects.filter(enrollment_no__iexact=enroll_str).first()

        if instance:
            changed = {}
            # map and update fields if changed
            if (getattr(instance, 'request_ref_no', '') or '') != (str(request_ref_no) if request_ref_no else ''):
                instance.request_ref_no = str(request_ref_no or '')
                changed['request_ref_no'] = instance.request_ref_no
            
            # Ensure NOT NULL fields are never empty
            new_enrollment = str(enrollment_no or '').strip()
            if new_enrollment and (instance.enrollment_no or '') != new_enrollment:
                instance.enrollment_no = new_enrollment
                changed['enrollment_no'] = instance.enrollment_no
            
            new_student_name = str(student_name or '').strip()
            if new_student_name and (instance.student_name or '') != new_student_name:
                instance.student_name = new_student_name
                changed['student_name'] = instance.student_name
            
            new_institute = str(institute_name or '').strip()
            if new_institute and (instance.institute_name or '') != new_institute:
                instance.institute_name = new_institute
                changed['institute_name'] = instance.institute_name
            
            # treat receipt and remark as nullable: store None when sheet cell blank
            new_receipt = None
            if transcript_receipt is not None and str(transcript_receipt).strip() != '':
                new_receipt = str(transcript_receipt).strip()
            if (instance.transcript_receipt or '') != (new_receipt or ''):
                instance.transcript_receipt = new_receipt
                changed['transcript_receipt'] = instance.transcript_receipt

            new_remark = None
            if transcript_remark is not None and str(transcript_remark).strip() != '':
                new_remark = str(transcript_remark).strip()
            if (instance.transcript_remark or '') != (new_remark or ''):
                instance.transcript_remark = new_remark
                changed['transcript_remark'] = instance.transcript_remark
            
            new_submit_mail = str(submit_mail or '').strip()
            if new_submit_mail and (instance.submit_mail or '') != new_submit_mail:
                instance.submit_mail = new_submit_mail
                changed['submit_mail'] = instance.submit_mail
            
            # Normalize pdf_generate: nullable field, store 'Yes' or None
            pdf_val = None
            if pdf_generate is not None and str(pdf_generate).strip().lower() == 'yes':
                pdf_val = 'Yes'
            if (instance.pdf_generate or '') != (pdf_val or ''):
                instance.pdf_generate = pdf_val
                changed['pdf_generate'] = instance.pdf_generate

            # For sync, treat the Google Sheet as source of truth. Store the
            # raw sheet value (trimmed) in the DB. If the sheet cell is blank,
            # store 'pending' as default. When not forcing, only update when the
            # sheet provides a non-empty value; when forcing, always overwrite
            # to exactly match the sheet (including blank -> pending).
            mail_raw = None
            if mail_status_raw is not None:
                mail_raw = str(mail_status_raw).strip()

            if force_overwrite_status:
                final_status = mail_raw or TranscriptRequest.STATUS_PENDING
                if instance.mail_status != final_status:
                    instance.mail_status = final_status
                    changed['mail_status'] = instance.mail_status
            else:
                if mail_raw is not None and mail_raw != "":
                    if instance.mail_status != mail_raw:
                        instance.mail_status = mail_raw
                        changed['mail_status'] = instance.mail_status
                elif not instance.mail_status:
                    # Ensure mail_status is never empty (NOT NULL constraint)
                    instance.mail_status = TranscriptRequest.STATUS_PENDING
                    changed['mail_status'] = instance.mail_status

            # persist raw_row row number
            raw_copy = dict(raw) if isinstance(raw, Mapping) else {}
            raw_copy.update({'__row_number': row_number, 'row_number': row_number})
            if instance.raw_row != raw_copy:
                instance.raw_row = raw_copy
                changed['raw_row'] = instance.raw_row

            # handle transcript request number updates (tr_request_no)
            # Always update tr_request_no from the sheet (sheet is source of truth)
            try:
                tr_val = 0
                if tr_request_no_raw:
                    tr_val = int(str(tr_request_no_raw).strip())
                # Always update tr_request_no if different, even if it was previously set
                # This handles cases where TR number changes in the sheet
                if instance.tr_request_no != tr_val:
                    instance.tr_request_no = tr_val
                    changed['tr_request_no'] = instance.tr_request_no
                    logger.info(f"Updated tr_request_no for record {instance.id} from {instance.tr_request_no} to {tr_val}")
            except Exception as e:
                # Log parse errors but keep existing tr_request_no or default to 0
                logger.warning(f"Failed to parse tr_request_no '{tr_request_no_raw}' for row {row_number}: {e}")
                if not instance.tr_request_no:
                    instance.tr_request_no = 0
                    changed['tr_request_no'] = instance.tr_request_no

            if changed:
                try:
                    # save changed fields
                    instance.save()
                    _persist_row_number(instance, row_number)
                    # record updated TR identifier when possible
                    updated += 1
                    try:
                        updated_trs.append(instance.tr_request_no or instance.request_ref_no)
                    except Exception:
                        updated_trs.append(instance.request_ref_no)
                except Exception:
                    logger.exception('Failed to update transcript request from sheet for row %s', row_number)
            else:
                # still ensure we store the row number if missing
                _persist_row_number(instance, row_number)
        else:
            try:
                # determine tr_request_no for new object (default to 0 if not provided)
                tr_val = 0
                if tr_request_no_raw:
                    try:
                        tr_val = int(str(tr_request_no_raw).strip())
                    except Exception:
                        tr_val = 0

                # Normalize pdf_generate for storage: store 'Yes' when sheet
                # contains a yes-like value (case-insensitive); otherwise store empty string or None
                pdf_val = ''
                if pdf_generate is not None and str(pdf_generate).strip().lower() == 'yes':
                    pdf_val = 'Yes'

                # Determine mail_status: store raw sheet value (default to 'pending' if empty)
                ms = str(mail_status_raw).strip() if mail_status_raw is not None else ""
                if not ms:
                    ms = TranscriptRequest.STATUS_PENDING

                # Ensure required NOT NULL fields have valid values
                enrollment_no_val = str(enrollment_no or '').strip()
                if not enrollment_no_val:
                    logger.warning(f"Skipping row {row_number}: enrollment_no is required but empty")
                    continue
                
                student_name_val = str(student_name or '').strip()
                if not student_name_val:
                    logger.warning(f"Skipping row {row_number}: student_name is required but empty")
                    continue
                
                institute_name_val = str(institute_name or '').strip()
                if not institute_name_val:
                    logger.warning(f"Skipping row {row_number}: institute_name is required but empty")
                    continue

                # tr_request_no is required (NOT NULL)
                # request_ref_no, submit_mail, transcript_receipt, transcript_remark, pdf_generate, mail_status can be NULL
                
                obj = TranscriptRequest(
                    requested_at=requested_at,
                    request_ref_no=(str(request_ref_no).strip() if request_ref_no not in (None, '') and str(request_ref_no).strip() != '' else None),
                    tr_request_no=tr_val,
                    enrollment_no=enrollment_no_val,
                    student_name=student_name_val,
                    institute_name=institute_name_val,
                    transcript_receipt=(str(transcript_receipt).strip() if transcript_receipt not in (None, '') and str(transcript_receipt).strip() != '' else None),
                    transcript_remark=(str(transcript_remark).strip() if transcript_remark not in (None, '') and str(transcript_remark).strip() != '' else None),
                    submit_mail=(str(submit_mail).strip() if submit_mail not in (None, '') and str(submit_mail).strip() != '' else None),
                    pdf_generate=(pdf_val if pdf_val else None),
                    mail_status=(ms if ms else None),
                    raw_row=(dict(raw) if isinstance(raw, Mapping) else {}),
                )
                obj.raw_row = obj.raw_row or {}
                obj.raw_row.update({'__row_number': row_number, 'row_number': row_number})
                obj.save()
                created += 1
                try:
                    created_trs.append(obj.tr_request_no or obj.request_ref_no)
                except Exception:
                    created_trs.append(obj.request_ref_no)
            except Exception:
                logger.exception('Failed to create transcript request from sheet row %s', row_number)
        # record the tr_request_no / request_ref_no seen for potential pruning
        # if a numeric tr_request_no is present use that for pruning collection
        if tr_request_no_raw:
            try:
                seen_tr_request_nos.add(int(str(tr_request_no_raw).strip()))
            except Exception:
                seen_tr_request_nos.add(str(tr_request_no_raw).strip())
        elif request_ref_no:
            try:
                seen_tr_request_nos.add(int(str(request_ref_no).strip()))
            except Exception:
                seen_tr_request_nos.add(str(request_ref_no).strip())

    # After processing rows, auto-assign missing tr_request_no values and write them back to sheet
    # Determine next tr_request_no
    try:
        from django.db.models import Max

        max_val = TranscriptRequest.objects.aggregate(max_tr=Max('tr_request_no'))['max_tr'] or 0
        next_tr = int(max_val) + 1
    except Exception:
        next_tr = 1

    # Build header map to find TR column for write-back
    headers = worksheet.row_values(1)
    header_map = {h.strip().lower(): i + 1 for i, h in enumerate(headers) if h}
    def _find_tr_col():
        for alias in TRANSCRIPT_FIELD_ALIASES.get('tr_request_no', ()): 
            key = alias.strip().lower()
            if key in header_map:
                return header_map[key]
        return None
    tr_col = _find_tr_col()

    # collect rows that need write-back
    write_back: list = []  # tuples (row_number, assigned_tr)
    for idx, raw in enumerate(records):
        row_number = idx + 2
        # check if the sheet row already contained a TR value
        norm_row = {str(k).strip().lower(): v for k, v in (raw.items() if isinstance(raw, Mapping) else {})}
        tr_val_raw = None
        for key in ('tr_request_no', 'tr no', 'trn_request_no', 'trn_req_no'):
            if key in norm_row and str(norm_row.get(key)).strip():
                tr_val_raw = norm_row.get(key)
                break
        if tr_val_raw:
            continue
        # locate DB instance and assign if it has no tr_request_no
        # try matching by request_ref_no / enrollment / submit_mail
        rr = None
        for key in ('request_ref_no', 'trn_reqest_ref_no', 'reference'):
            if key in norm_row and str(norm_row.get(key)).strip():
                rr = norm_row.get(key)
                break
        inst = None
        if rr:
            inst = TranscriptRequest.objects.filter(request_ref_no__iexact=str(rr)).first()
        if not inst and norm_row.get('enrollment_no'):
            inst = TranscriptRequest.objects.filter(enrollment_no__iexact=str(norm_row.get('enrollment_no'))).first()
        if not inst and norm_row.get('submit_mail'):
            inst = TranscriptRequest.objects.filter(submit_mail__iexact=str(norm_row.get('submit_mail'))).first()
        if inst and (inst.tr_request_no is None):
            assigned = next_tr
            next_tr += 1
            inst.tr_request_no = assigned
            try:
                inst.save(update_fields=['tr_request_no'])
                write_back.append((row_number, assigned))
            except Exception:
                logger.exception('Failed to persist assigned tr_request_no for instance %s', getattr(inst, 'pk', None))

    # Write assigned tr_request_no values back to sheet if possible
    if tr_col and write_back:
        for row_num, assigned in write_back:
            try:
                worksheet.update_cell(row_num, tr_col, str(assigned))
            except Exception:
                logger.debug('Failed to write tr_request_no back to sheet at row %s', row_num)

    # Optionally prune DB rows that have a tr_request_no but are not present in the sheet
    pruned = 0
    try:
        if not no_prune:
            # only prune if we saw at least one tr_request_no in the sheet
            int_ids = {x for x in seen_tr_request_nos if isinstance(x, int)}
            if int_ids:
                to_delete = TranscriptRequest.objects.filter(tr_request_no__isnull=False).exclude(tr_request_no__in=int_ids)
                pruned = to_delete.count()
                to_delete.delete()
    except Exception:
        logger.exception('Failed during pruning of transcript requests')

    return {
        "created": created,
        "updated": updated,
        "total": total,
        "pruned": pruned,
        "created_trs": created_trs,
        "updated_trs": updated_trs,
    }


# =====================================
# CCTV SYNC FUNCTION (NEW - SAFE ADD)
# =====================================

def sync_cctv_centre_to_sheet(instance, changed_fields: Mapping[str, object]) -> None:
    """Sync CCTV centre updates to Google Sheet.

    Uses dynamic worksheet name (exam_year_session).
    Does NOT interfere with mail or transcript sync.
    """

    sheet_id = _get_setting("GOOGLE_CCTV_SPREADSHEET_ID")
    if not sheet_id:
        return

    # Use dynamic worksheet like "2026-1"
    sheet_name = getattr(instance.exam, "exam_year_session", None)
    if not sheet_name:
        return

    try:
        worksheet = _get_worksheet_by_name(sheet_id, sheet_name)
    except Exception as exc:
        logger.warning("CCTV worksheet not found: %s", exc)
        return

    # Try locating row using subject_code + place
    try:
        search_key = f"{instance.exam.subject_code}"
        cell = worksheet.find(search_key)
        row_number = cell.row if cell else None
    except Exception:
        row_number = None

    if not row_number:
        logger.debug("CCTV sync skipped: row not found for %s", instance.exam.subject_code)
        return

    # Build header map dynamically
    headers = worksheet.row_values(1)
    header_map = {
        header.strip().lower(): index + 1
        for index, header in enumerate(headers)
        if header
    }

    updates = {}

    for field in changed_fields:
        aliases = CCTV_FIELD_ALIASES.get(field)
        if not aliases:
            continue

        col_index = _resolve_column(header_map, aliases)
        if not col_index:
            continue

        cell_ref = rowcol_to_a1(row_number, col_index)
        updates[cell_ref] = _coerce_value(getattr(instance, field))

    if not updates:
        return

    try:
        batch_data = [
            {
                "range": cell,
                "values": [[value]],
            }
            for cell, value in updates.items()
        ]

        if len(batch_data) == 1:
            worksheet.update(batch_data[0]["range"], batch_data[0]["values"])
        else:
            worksheet.batch_update(batch_data)

    except Exception as exc:
        logger.warning("Failed to push CCTV updates %s: %s", updates, exc)


def import_cctv_centres_from_sheet(
    sheet_name: str,
    sheet_id: Optional[str] = None,
    limit: Optional[int] = None,
) -> Dict[str, int]:
    """Import CCTV centre rows from a Google Sheet into the database.

    The sheet name is expected to match CCTVExam.exam_year_session.
    Rows are matched by (exam_year_session + subject_code + place + session).
    The function is conservative and will only create missing entries.
    """
    sheet_id = sheet_id or _get_setting("GOOGLE_CCTV_SPREADSHEET_ID")
    if not sheet_id or not sheet_name:
        return {"created": 0, "updated": 0, "total": 0, "skipped": 0}

    worksheet = _get_worksheet_by_name(sheet_id, sheet_name)
    try:
        records = worksheet.get_all_records()
    except Exception:
        values = worksheet.get_all_values()
        if not values or len(values) < 2:
            return {"created": 0, "updated": 0, "total": 0, "skipped": 0}
        headers = [h.strip().lower() for h in values[0]]
        records = []
        for row in values[1:]:
            rec = {headers[i]: (row[i] if i < len(row) else "") for i in range(len(headers))}
            records.append(rec)

    created = 0
    updated = 0
    total = 0
    skipped = 0

    def pick(norm_row, *keys):
        for k in keys:
            if k and k in norm_row:
                v = norm_row.get(k)
                if v is not None and str(v).strip() != "":
                    return v
        return None

    def to_int(value: object) -> Optional[int]:
        if value is None:
            return None
        try:
            return int(str(value).strip())
        except Exception:
            return None

    def to_bool(value: object) -> bool:
        if value is None:
            return False
        txt = str(value).strip().lower()
        return txt in {"yes", "y", "true", "1", "on"}

    for raw in records:
        if limit and total >= limit:
            break
        total += 1

        norm_row = {str(k).strip().lower(): v for k, v in (raw.items() if isinstance(raw, Mapping) else {})}

        subject_code = pick(norm_row, "subject_code", "subject code", "subject", "sub code")
        place = pick(norm_row, "place", "centre", "center")
        session = pick(norm_row, "session")
        no_of_cd_raw = pick(norm_row, "no_of_cd", "no of cd", "no of dvd", "no_of_dvd", "dvd", "cd")

        if not (subject_code and place and session and no_of_cd_raw):
            skipped += 1
            continue

        no_of_cd = to_int(no_of_cd_raw)
        if not no_of_cd or no_of_cd <= 0:
            skipped += 1
            continue

        exam = CCTVExam.objects.filter(
            exam_year_session__iexact=str(sheet_name).strip(),
            subject_code__iexact=str(subject_code).strip(),
        ).first()
        if not exam:
            skipped += 1
            continue

        place_str = str(place).strip()
        session_str = str(session).strip()

        centre = CCTVCentreEntry.objects.filter(
            exam=exam,
            place__iexact=place_str,
            session__iexact=session_str,
        ).first()

        if centre:
            updated += 1
            continue

        centre = CCTVCentreEntry.objects.create(
            exam=exam,
            place=place_str,
            session=session_str,
            no_of_cd=no_of_cd,
        )

        if centre.start_number is not None and centre.end_number is not None:
            for i in range(centre.start_number, centre.end_number + 1):
                CCTVDVD.objects.create(
                    centre=centre,
                    number=i,
                    label=f"{session_str}-{i}",
                )

        created += 1

    return {
        "created": created,
        "updated": updated,
        "total": total,
        "skipped": skipped,
    }


def import_cctv_exams_from_sheet(
    sheet_name: str,
    sheet_id: Optional[str] = None,
    limit: Optional[int] = None,
) -> Dict[str, int]:
    """Import CCTV exams from a Google Sheet (header-driven)."""
    sheet_id = sheet_id or _get_setting("GOOGLE_CCTV_SPREADSHEET_ID")
    if not sheet_id or not sheet_name:
        return {"created": 0, "updated": 0, "total": 0, "skipped": 0}

    worksheet = _get_worksheet_by_name(sheet_id, sheet_name)
    try:
        records = worksheet.get_all_records()
    except Exception:
        values = worksheet.get_all_values()
        if not values or len(values) < 2:
            return {"created": 0, "updated": 0, "total": 0, "skipped": 0}
        headers = [h.strip().lower() for h in values[0]]
        records = []
        for row in values[1:]:
            rec = {headers[i]: (row[i] if i < len(row) else "") for i in range(len(headers))}
            records.append(rec)

    created = 0
    updated = 0
    total = 0
    skipped = 0

    def pick(norm_row, *keys):
        for k in keys:
            if k and k in norm_row:
                v = norm_row.get(k)
                if v is not None and str(v).strip() != "":
                    return v
        return None

    def to_int(value: object) -> int:
        try:
            return int(str(value).strip())
        except Exception:
            return 0

    for raw in records:
        if limit and total >= limit:
            break
        total += 1
        norm_row = {str(k).strip().lower(): v for k, v in (raw.items() if isinstance(raw, Mapping) else {})}

        exam_date = pick(norm_row, "exam date", "exam_date", "date")
        exam_time = pick(norm_row, "exam time", "exam_time", "time")
        course = pick(norm_row, "course")
        sem = pick(norm_row, "sem", "semester")
        subject_code = pick(norm_row, "subject code", "subject_code", "subject")
        subject_name = pick(norm_row, "subject name", "subject_name")
        no_of_students = pick(norm_row, "no of students", "no_of_students", "students")
        institute_remarks = pick(
            norm_row,
            "institute remarks",
            "institute remark",
            "inst remarks",
            "inst remark",
            "institute_remarks",
            "instituteremarks",
            "remarks",
            "remark",
        )

        if not (exam_date and subject_code):
            skipped += 1
            continue

        payload = {
            "exam_date": str(exam_date).strip(),
            "exam_time": str(exam_time or "").strip(),
            "course": str(course or "").strip(),
            "sem": str(sem or "").strip(),
            "subject_code": str(subject_code).strip(),
            "subject_name": str(subject_name or "").strip(),
            "no_of_students": to_int(no_of_students),
            "institute_remarks": str(institute_remarks or "").strip() or None,
            "exam_year_session": str(sheet_name).strip(),
            "raw_row": dict(raw) if isinstance(raw, Mapping) else {},
        }

        instance = CCTVExam.objects.filter(
            exam_year_session__iexact=str(sheet_name).strip(),
            subject_code__iexact=str(subject_code).strip(),
            exam_date=str(exam_date).strip(),
        ).first()

        if instance:
            changed = False
            for key, val in payload.items():
                if getattr(instance, key) != val:
                    setattr(instance, key, val)
                    changed = True
            if changed:
                instance.save()
                updated += 1
            continue

        CCTVExam.objects.create(**payload)
        created += 1

    return {
        "created": created,
        "updated": updated,
        "total": total,
        "skipped": skipped,
    }
