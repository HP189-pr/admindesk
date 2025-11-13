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
}


def _render_transcript_status(value: object) -> str:
    normalized = TranscriptRequest.normalize_status(str(value)) if value is not None else None
    if normalized == TranscriptRequest.STATUS_DONE:
        return "Sent"
    if normalized == TranscriptRequest.STATUS_PROGRESS:
        return "In Progress"
    if normalized == TranscriptRequest.STATUS_PENDING:
        return "Pending"
    return str(value or "")


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
        for range_name, value in pending.items():
            worksheet.update(range_name, [[value]])
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
            ("request_ref_no", "enrollment_no", "submit_mail"),
        )
        if row_number:
            _persist_row_number(instance, row_number)
    if not row_number:
        logger.debug("Skipping sheet sync for transcript request %s: row number unavailable", instance.pk)
        return
    updates: Dict[str, object] = {}
    if "mail_status" in changed_fields:
        updates["mail_status"] = _render_transcript_status(instance.mail_status)
    if "transcript_remark" in changed_fields:
        updates["transcript_remark"] = getattr(instance, "transcript_remark", "")
    if updates:
        _apply_updates(sheet_id, gid, row_number, updates, TRANSCRIPT_FIELD_ALIASES)


def import_transcript_requests_from_sheet(sheet_id: Optional[str] = None, worksheet_gid: Optional[int] = None, limit: Optional[int] = None) -> Dict[str, int]:
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
        request_ref_no = pick(norm_row, 'request_ref_no', 'trn_reqest_ref_no', 'request ref no', 'ref no', 'reference', 'ref')
        enrollment_no = pick(norm_row, 'enrollment_no', 'enrollment', 'enroll no', 'enroll')
        student_name = pick(norm_row, 'student_name', 'name', 'student')
        institute_name = pick(norm_row, 'institute_name', 'institute')
        transcript_receipt = pick(norm_row, 'transcript_receipt', 'receipt', 'transcript receipt')
        transcript_remark = pick(norm_row, 'transcript_remark', 'remark', 'remarks', 'comment')
        submit_mail = pick(norm_row, 'submit_mail', 'submit mail', 'email', 'mail')
        pdf_generate = pick(norm_row, 'pdf_generate', 'pdf', 'pdf generate')
        mail_status_raw = pick(norm_row, 'mail_status', 'status', 'mail status')
        requested_at_raw = pick(norm_row, 'requested_at', 'date', 'request date', 'trn_reqest_date')

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
        if request_ref_no:
            instance = TranscriptRequest.objects.filter(request_ref_no__iexact=str(request_ref_no)).first()
        if not instance and enrollment_no:
            instance = TranscriptRequest.objects.filter(enrollment_no__iexact=str(enrollment_no)).first()
        if not instance and submit_mail:
            instance = TranscriptRequest.objects.filter(submit_mail__iexact=str(submit_mail)).first()

        if instance:
            changed = {}
            # map and update fields if changed
            if (getattr(instance, 'request_ref_no', '') or '') != (str(request_ref_no) if request_ref_no else ''):
                instance.request_ref_no = str(request_ref_no or '')
                changed['request_ref_no'] = instance.request_ref_no
            if (instance.enrollment_no or '') != (str(enrollment_no) if enrollment_no else ''):
                instance.enrollment_no = str(enrollment_no or '')
                changed['enrollment_no'] = instance.enrollment_no
            if (instance.student_name or '') != (str(student_name) if student_name else ''):
                instance.student_name = str(student_name or '')
                changed['student_name'] = instance.student_name
            if (instance.institute_name or '') != (str(institute_name) if institute_name else ''):
                instance.institute_name = str(institute_name or '')
                changed['institute_name'] = instance.institute_name
            if (instance.transcript_receipt or '') != (str(transcript_receipt) if transcript_receipt else ''):
                instance.transcript_receipt = str(transcript_receipt or '')
                changed['transcript_receipt'] = instance.transcript_receipt
            if (instance.transcript_remark or '') != (str(transcript_remark) if transcript_remark else ''):
                instance.transcript_remark = str(transcript_remark or '')
                changed['transcript_remark'] = instance.transcript_remark
            if (instance.submit_mail or '') != (str(submit_mail) if submit_mail else ''):
                instance.submit_mail = str(submit_mail or '')
                changed['submit_mail'] = instance.submit_mail
            if (instance.pdf_generate or '') != (str(pdf_generate) if pdf_generate else ''):
                instance.pdf_generate = str(pdf_generate or '')
                changed['pdf_generate'] = instance.pdf_generate
            norm_status = TranscriptRequest.normalize_status(mail_status_raw)
            if norm_status and instance.mail_status != norm_status:
                instance.mail_status = norm_status
                changed['mail_status'] = instance.mail_status
            elif not norm_status and not (instance.mail_status):
                # When the sheet has no explicit status and the DB value is empty,
                # treat it as In Progress by default rather than Pending.
                instance.mail_status = TranscriptRequest.STATUS_PROGRESS
                changed['mail_status'] = instance.mail_status

            # persist raw_row row number
            raw_copy = dict(raw) if isinstance(raw, Mapping) else {}
            raw_copy.update({'__row_number': row_number, 'row_number': row_number})
            if instance.raw_row != raw_copy:
                instance.raw_row = raw_copy
                changed['raw_row'] = instance.raw_row

            if changed:
                try:
                    # save changed fields
                    instance.save()
                    _persist_row_number(instance, row_number)
                    updated += 1
                except Exception:
                    logger.exception('Failed to update transcript request from sheet for row %s', row_number)
            else:
                # still ensure we store the row number if missing
                _persist_row_number(instance, row_number)
        else:
            try:
                obj = TranscriptRequest(
                    requested_at=requested_at,
                    request_ref_no=str(request_ref_no or ''),
                    enrollment_no=str(enrollment_no or ''),
                    student_name=str(student_name or ''),
                    institute_name=str(institute_name or ''),
                    transcript_receipt=str(transcript_receipt or ''),
                    transcript_remark=str(transcript_remark or ''),
                    submit_mail=str(submit_mail or ''),
                    pdf_generate=str(pdf_generate or ''),
                    mail_status=TranscriptRequest.normalize_status(mail_status_raw) or TranscriptRequest.STATUS_PROGRESS,
                    raw_row=(dict(raw) if isinstance(raw, Mapping) else {}),
                )
                obj.raw_row = obj.raw_row or {}
                obj.raw_row.update({'__row_number': row_number, 'row_number': row_number})
                obj.save()
                created += 1
            except Exception:
                logger.exception('Failed to create transcript request from sheet row %s', row_number)

    return {"created": created, "updated": updated, "total": total}
