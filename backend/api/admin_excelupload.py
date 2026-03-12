"""Excel upload mixin and helper functions extracted from admin.py."""

import base64
import csv
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from io import BytesIO, StringIO
from typing import Any, Dict, List, Optional

from django.contrib import messages
from django.db import models
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.urls import path, reverse
from django.views.decorators.csrf import csrf_exempt

try:  # Optional pandas (Excel support)
    import pandas as pd  # type: ignore
except Exception:  # pragma: no cover
    pd = None  # type: ignore

from .cash_register import ReceiptNumberService
from .domain_cash_register import Receipt, ReceiptItem, FeeType, normalize_receipt_no, split_receipt
from .domain_degree import StudentDegree
from .domain_emp import EmpProfile, LeaveEntry
from .domain_fees_ledger import StudentFeesLedger
from .models import (
    AdmissionCancel,
    DocRec,
    Enrollment,
    Institute,
    MainBranch,
    MigrationRecord,
    ProvisionalRecord,
    ProvisionalStatus,
    StudentProfile,
    SubBranch,
    Verification,
)


def _assign_user_field(obj, user, field_name: str):
    """Set `field_name` on `obj` to `user` or `user.username` depending on field type."""
    try:
        field = obj._meta.get_field(field_name)
        ftype = field.get_internal_type()
        if ftype in ('CharField', 'TextField'):
            try:
                setattr(obj, field_name, getattr(user, 'username', str(user)))
            except Exception:
                setattr(obj, field_name, str(user))
        else:
            setattr(obj, field_name, user)
    except Exception:
        try:
            setattr(obj, field_name, getattr(user, 'username', str(user)))
        except Exception:
            pass


def _safe_num(val, default=0):
    """Coerce a value to float but treat NaN-like values as missing."""
    if val is None:
        return default
    if isinstance(val, str):
        text = val.strip()
        if text == '' or text.lower() in ('nan', 'nat', 'none', '<na>'):
            return default
    try:
        if pd is not None and pd.isna(val):
            return default
    except Exception:
        pass
    try:
        number = float(val)
        import math
        if math.isnan(number) or number == float('inf') or number == float('-inf'):
            return default
        return number
    except Exception:
        return default

def _sanitize(v: Any) -> str:
    if v is None:
        return ""
    return str(v).replace("\r", " ").replace("\n", " ")


def _excel_engine_order(file_ext: Optional[str]) -> List[Optional[str]]:
    ext = (file_ext or '').lower().strip()
    if ext == '.xlsx':
        return ['openpyxl', None, 'xlrd']
    if ext == '.xls':
        return ['xlrd', 'openpyxl', None]
    return [None, 'openpyxl', 'xlrd']


def _read_excel_compat(source: Any, file_ext: Optional[str] = None, **kwargs):
    """Read Excel with engine fallbacks so admin upload supports .xlsx/.xls robustly."""
    # Convert to bytes once so retries don't depend on a mutable file pointer.
    if isinstance(source, (bytes, bytearray)):
        raw = bytes(source)
    elif hasattr(source, 'read'):
        raw = source.read()
        try:
            source.seek(0)
        except Exception:
            pass
    elif hasattr(source, 'getvalue'):
        raw = source.getvalue()
    else:
        raw = bytes(source)

    if not raw:
        raise ValueError('Uploaded file is empty')

    def _read_delimited_fallback(raw_bytes: bytes):
        """Parse text-delimited content uploaded with Excel extensions."""
        head_bytes = raw_bytes[:4096]
        has_delimiter_hint = any(d in head_bytes for d in (b'\t', b',', b';', b'|'))
        has_utf16_bom = raw_bytes.startswith((b'\xff\xfe', b'\xfe\xff'))
        if not has_delimiter_hint and not has_utf16_bom:
            return None

        def _decode_delimited_text(data: bytes) -> str:
            if data.startswith(b'\xef\xbb\xbf'):
                try:
                    return data.decode('utf-8-sig')
                except Exception:
                    pass
            if data.startswith((b'\xff\xfe', b'\xfe\xff')):
                for enc in ('utf-16', 'utf-16-le', 'utf-16-be'):
                    try:
                        return data.decode(enc)
                    except Exception:
                        continue

            try:
                return data.decode('utf-8-sig')
            except Exception:
                pass

            if b'\x00' in data[:4096]:
                for enc in ('utf-16-le', 'utf-16-be', 'utf-16'):
                    try:
                        return data.decode(enc)
                    except Exception:
                        continue

            return data.decode('latin-1', errors='replace')

        decoded_text = _decode_delimited_text(raw_bytes)
        if not decoded_text or not decoded_text.strip():
            return None

        sample = decoded_text[:8192]
        lines = [ln for ln in sample.splitlines() if ln.strip()]
        if not lines:
            return None

        delimiter = None
        try:
            sniff_sample = '\n'.join(lines[:20])
            dialect = csv.Sniffer().sniff(sniff_sample, delimiters='\t,;|')
            delimiter = dialect.delimiter
        except Exception:
            probe = '\n'.join(lines[:20])
            counts = {
                '\t': probe.count('\t'),
                ',': probe.count(','),
                ';': probe.count(';'),
                '|': probe.count('|'),
            }
            delimiter = max(counts, key=counts.get)
            if counts[delimiter] == 0:
                delimiter = None

        if not delimiter:
            return None

        allowed_csv_args = {
            'header', 'names', 'index_col', 'usecols', 'dtype', 'skiprows',
            'nrows', 'na_values', 'keep_default_na', 'parse_dates', 'dayfirst',
        }
        csv_kwargs = {k: v for k, v in kwargs.items() if k in allowed_csv_args}

        parse_kwargs = {
            'sep': delimiter,
            'engine': 'python',
            'on_bad_lines': 'skip',
            **csv_kwargs,
        }
        try:
            df_text = pd.read_csv(StringIO(decoded_text), **parse_kwargs)
        except TypeError:
            parse_kwargs.pop('on_bad_lines', None)
            df_text = pd.read_csv(StringIO(decoded_text), **parse_kwargs)

        sheet_name = kwargs.get('sheet_name', None)
        if sheet_name is None:
            return {'Sheet1': df_text}
        return df_text

    last_err = None
    for engine in _excel_engine_order(file_ext):
        try:
            bio = BytesIO(raw)
            read_kwargs = dict(kwargs)
            if engine:
                read_kwargs['engine'] = engine
            return pd.read_excel(bio, **read_kwargs)
        except Exception as exc:
            last_err = exc
            continue

    try:
        text_result = _read_delimited_fallback(raw)
        if text_result is not None:
            return text_result
    except Exception as exc:
        last_err = exc

    raise ValueError(str(last_err) if last_err else 'Unable to read Excel workbook')

from .excel_import.helpers import parse_excel_date, clean_cell, row_value, parse_boolean_cell
_clean_cell = clean_cell
_parse_boolean_cell = parse_boolean_cell


def resolve_docrec(raw_doc_rec_id: Any):
    """Try to resolve a DocRec object from a raw imported doc_rec_id.

    Strategies (in order):
    - exact stripped match
    - case-insensitive match (`iexact`)
    - normalized alphanumeric lowercase match against recent DocRec rows

    Returns DocRec instance or None.
    """
    if raw_doc_rec_id is None:
        return None
    try:
        k = str(raw_doc_rec_id).strip()
    except Exception:
        k = str(raw_doc_rec_id)
    if not k:
        return None
    try:
        dr = DocRec.objects.filter(doc_rec_id=k).first()
        if dr:
            return dr
    except Exception:
        dr = None
    try:
        dr = DocRec.objects.filter(doc_rec_id__iexact=k).first()
        if dr:
            return dr
    except Exception:
        dr = None
    # Fallback: normalized alphanumeric comparison (best-effort)
    try:
        import re
        norm = re.sub(r'[^0-9a-zA-Z]', '', k).lower()
        if norm:
            for cand in DocRec.objects.all()[:20000]:
                try:
                    if re.sub(r'[^0-9a-zA-Z]', '', str(cand.doc_rec_id)).lower() == norm:
                        return cand
                except Exception:
                    continue
    except Exception:
        pass
    return None


def _normalize_choice(raw: Any, choices_cls):
    """Map a raw incoming status/choice string to a valid internal choice value.

    Accepts either the stored value (e.g. 'DONE') or the human label (e.g. 'Done'),
    case-insensitive, and with a best-effort alphanumeric-normalized match.
    Returns the internal choice value (e.g. 'DONE') or None if no match.
    """
    if raw is None:
        return None
    try:
        s = str(raw).strip()
        if not s:
            return None
    except Exception:
        s = str(raw)
    try:
        import re
        cand_norm = re.sub(r'[^0-9a-zA-Z]', '', s).lower()
        # Accept either a choices class with .choices or a raw sequence of tuples
        choices_seq = None
        if hasattr(choices_cls, 'choices'):
            choices_seq = choices_cls.choices
        else:
            choices_seq = choices_cls
        for val, label in choices_seq:
            try:
                if s.lower() == str(val).lower() or s.lower() == str(label).lower():
                    return val
                # normalized compare
                lab_norm = re.sub(r'[^0-9a-zA-Z]', '', str(label)).lower()
                if cand_norm and lab_norm and cand_norm == lab_norm:
                    return val
            except Exception:
                continue
        # final fallback: compare against value uppercased
        su = s.upper()
        for val, _ in choices_cls.choices:
            try:
                if su == str(val):
                    return val
            except Exception:
                continue
    except Exception:
        return None
    return None

def get_import_spec(model) -> Dict[str, Any]:
    specs: Dict[type, Dict[str, Any]] = {
        MainBranch: {"allowed_columns": ["maincourse_id", "course_code", "course_name"], "required_keys": ["maincourse_id"], "create_requires": ["maincourse_id"]},
        SubBranch: {"allowed_columns": ["subcourse_id", "subcourse_name", "maincourse_id"], "required_keys": ["subcourse_id", "maincourse_id"], "create_requires": ["subcourse_id", "maincourse_id"]},
        Institute: {"allowed_columns": ["institute_id", "institute_code", "institute_name", "institute_campus", "institute_address", "institute_city"], "required_keys": ["institute_id"], "create_requires": ["institute_id", "institute_code"]},
        Enrollment: {
            "allowed_columns": [
                "enrollment_no", "student_name", "batch", "institute_id", "subcourse_id", "maincourse_id", "temp_enroll_no", "enrollment_date", "admission_date",
                "gender", "birth_date", "address1", "address2", "city1", "city2", "contact_no", "email", "fees", "hostel_required",
                "aadhar_no", "abc_id", "mobile_adhar", "name_adhar", "mother_name", "father_name", "category", "photo_uploaded", "is_d2d", "program_medium",
            ],
            "required_keys": ["enrollment_no"],
            "create_requires": ["enrollment_no", "student_name", "batch", "institute_id", "subcourse_id", "maincourse_id"],
        },
        AdmissionCancel: {"allowed_columns": ["enrollment_no", "student_name", "inward_no", "inward_date", "outward_no", "outward_date", "can_remark", "status"], "required_keys": ["enrollment_no"], "create_requires": ["enrollment_no"]},
            EmpProfile: {"allowed_columns": ["emp_id", "emp_name", "emp_designation", "username", "usercode", "actual_joining", "emp_birth_date", "usr_birth_date", "department_joining", "institute_id", "status", "el_balance", "sl_balance", "cl_balance", "vacation_balance", "joining_year_allocation_el", "joining_year_allocation_cl", "joining_year_allocation_sl", "joining_year_allocation_vac", "leave_calculation_date", "emp_short"], "required_keys": ["emp_id"], "create_requires": ["emp_id", "emp_name"]},
            LeaveEntry: {"allowed_columns": ["leave_report_no", "emp_id", "leave_code", "start_date", "end_date", "total_days", "reason", "status", "created_by", "approved_by", "approved_at"], "required_keys": ["leave_report_no"], "create_requires": ["leave_report_no", "emp_id", "leave_code", "start_date"]},
        StudentProfile: {"allowed_columns": ["enrollment_no", "gender", "birth_date", "address1", "address2", "city1", "city2", "contact_no", "email", "fees", "hostel_required", "aadhar_no", "abc_id", "mobile_adhar", "name_adhar", "mother_name", "father_name", "category", "photo_uploaded", "is_d2d", "program_medium"], "required_keys": ["enrollment_no"], "create_requires": ["enrollment_no"]},
    FeeType: {"allowed_columns": ["code", "name", "is_active"], "required_keys": ["code", "name"], "create_requires": ["code", "name"]},
    Receipt: {
        "allowed_columns": [
            "receipt_no_full", "rec_ref", "rec_no", "date", "payment_mode",
            "fee_type_code", "fee_type", "amount", "total_amount", "remark",
            "is_cancelled", "cancel_reason", "cancelled_by"
        ],
        "required_keys": ["date", "payment_mode"],
        "create_requires": ["date", "payment_mode"],
    },
    DocRec: {"allowed_columns": ["apply_for", "doc_rec_id", "pay_by", "pay_rec_no_pre", "pay_rec_no", "pay_amount", "doc_rec_date", "doc_rec_remark"], "required_keys": ["apply_for", "doc_rec_id", "pay_by"], "create_requires": ["apply_for", "doc_rec_id", "pay_by"]},
    MigrationRecord: {"allowed_columns": ["doc_rec_id", "enrollment_no", "student_name", "institute_id", "maincourse_id", "subcourse_id", "mg_number", "mg_date", "exam_year", "admission_year", "exam_details", "mg_status", "pay_rec_no"], "required_keys": ["doc_rec_id"], "create_requires": ["doc_rec_id"]},
    ProvisionalRecord: {"allowed_columns": ["doc_rec_id", "enrollment_no", "student_name", "institute_id", "maincourse_id", "subcourse_id", "prv_number", "prv_date", "class_obtain", "prv_degree_name", "passing_year", "prv_status", "pay_rec_no"], "required_keys": ["doc_rec_id"], "create_requires": ["doc_rec_id"]},
    Verification: {"allowed_columns": ["doc_rec_id", "date", "enrollment_no", "second_enrollment_no", "student_name", "no_of_transcript", "no_of_marksheet", "no_of_degree", "no_of_moi", "no_of_backlog", "status", "final_no", "pay_rec_no", "vr_done_date", "mail_status", "eca_required", "eca_name", "eca_ref_no", "eca_submit_date", "eca_remark", "doc_rec_remark"], "required_keys": ["doc_rec_id"], "create_requires": ["doc_rec_id"]},
    StudentDegree: {"allowed_columns": ["dg_sr_no", "enrollment_no", "student_name_dg", "dg_address", "institute_name_dg", "degree_name", "specialisation", "seat_last_exam", "last_exam_month", "last_exam_year", "class_obtain", "course_language", "dg_rec_no", "dg_gender", "convocation_no"], "required_keys": ["enrollment_no"], "create_requires": ["enrollment_no"]},
    StudentFeesLedger: {"allowed_columns": ["enrollment_no", "temp_enroll_no", "enrollment_id", "receipt_no", "receipt_date", "term", "amount", "remark"], "required_keys": [], "create_requires": []},
    }
    for klass, spec in specs.items():
        if issubclass(model, klass):
            return spec
    return {"allowed_columns": [], "required_keys": [], "create_requires": []}


COLUMN_ALIAS_MAP: Dict[type, Dict[str, str]] = {
    Receipt: {
        "fee_code": "fee_type_code",
        "feecode": "fee_type_code",
        "fee code": "fee_type_code",
        "fee_type": "fee_type_code",
        "fee type": "fee_type_code",
        "cash_rec_no": "receipt_no_full",
        "cash rec no": "receipt_no_full",
        "cashrecno": "receipt_no_full",
        "receipt_no": "receipt_no_full",
        "receipt no": "receipt_no_full",
        "is cancelled": "is_cancelled",
        "cancelled": "is_cancelled",
        "cancel reason": "cancel_reason",
        "cancelled by": "cancelled_by",
    },
    Enrollment: {
        "enrollment": "enrollment_no",
        "enrollment no": "enrollment_no",
        "roll no": "enrollment_no",
        "roll number": "enrollment_no",
        "temp enrollment": "temp_enroll_no",
        "temp enrollment no": "temp_enroll_no",
        "temp student id": "temp_enroll_no",
        "student name": "student_name",
        "studentname": "student_name",
        "registration date": "enrollment_date",
        "enrollment date": "enrollment_date",
        "admission date": "admission_date",
        "institute": "institute_id",
        "institute id": "institute_id",
        "main": "maincourse_id",
        "main course": "maincourse_id",
        "maincourse id": "maincourse_id",
        "sub": "subcourse_id",
        "sub course": "subcourse_id",
        "subcourse id": "subcourse_id",
        "birth date": "birth_date",
        "admission cast category": "category",
        "admission caste category": "category",
        "local address": "address1",
        "permanent address": "address2",
        "local city": "city1",
        "permanent city": "city2",
        "mobile no": "contact_no",
        "mobile number": "contact_no",
        "total fees": "fees",
        "abc id": "abc_id",
        "aadhaar number": "aadhar_no",
        "aadhar number": "aadhar_no",
        "name as per aadhar": "name_adhar",
        "name as per aadhaar": "name_adhar",
        "mobile no as per aadhar": "mobile_adhar",
        "mobile no as per aadhaar": "mobile_adhar",
        "mothername": "mother_name",
        "father name": "father_name",
        "is d2d": "is_d2d",
        "program medium": "program_medium",
        "photo uploaded": "photo_uploaded",
        "use hostel": "hostel_required",
    },
    StudentProfile: {
        "enrollment": "enrollment_no",
        "enrollment no": "enrollment_no",
        "roll no": "enrollment_no",
        "roll number": "enrollment_no",
        "birth date": "birth_date",
        "admission cast category": "category",
        "admission caste category": "category",
        "local address": "address1",
        "permanent address": "address2",
        "local city": "city1",
        "permanent city": "city2",
        "mobile no": "contact_no",
        "mobile number": "contact_no",
        "total fees": "fees",
        "abc id": "abc_id",
        "aadhaar number": "aadhar_no",
        "aadhar number": "aadhar_no",
        "name as per aadhar": "name_adhar",
        "name as per aadhaar": "name_adhar",
        "mobile no as per aadhar": "mobile_adhar",
        "mobile no as per aadhaar": "mobile_adhar",
        "mothername": "mother_name",
        "father name": "father_name",
        "is d2d": "is_d2d",
        "program medium": "program_medium",
        "photo uploaded": "photo_uploaded",
        "use hostel": "hostel_required",
    },
    StudentFeesLedger: {
        "enrollment": "enrollment_no",
        "enrollment no": "enrollment_no",
        "enrollment_no": "enrollment_no",
        "temp_enroll_no": "temp_enroll_no",
        "temp enrollment": "temp_enroll_no",
        "temp enrollment no": "temp_enroll_no",
        "enrollment id": "enrollment_id",
        "enrollment_id": "enrollment_id",
        "receipt": "receipt_no",
        "receipt no": "receipt_no",
        "receipt_no": "receipt_no",
        "receipt date": "receipt_date",
        "receipt_date": "receipt_date",
        "amount paid": "amount",
        "fees": "amount",
        "fee": "amount",
        "remarks": "remark",
    },
}


def _build_allowed_maps(model):
    spec = get_import_spec(model)
    allowed_set = set(spec["allowed_columns"])
    allowed_map = {str(col).lower(): col for col in allowed_set}
    allowed_norm_map = {
        re.sub(r"[^0-9a-zA-Z]", "", str(col).lower()): col
        for col in allowed_set
    }
    alias_map: Dict[str, str] = {}
    alias_norm_map: Dict[str, str] = {}
    for klass, aliases in COLUMN_ALIAS_MAP.items():
        if issubclass(model, klass):
            for alias, target in aliases.items():
                if target in allowed_set:
                    alias_map[alias.lower()] = target
                    alias_norm_map[re.sub(r"[^0-9a-zA-Z]", "", alias.lower())] = target
    return spec, allowed_set, allowed_map, alias_map, allowed_norm_map, alias_norm_map


def _resolve_column_name(raw, allowed_map, alias_map, allowed_norm_map=None, alias_norm_map=None):
    key = str(raw).strip().lower()
    if not key:
        return None
    resolved = allowed_map.get(key) or alias_map.get(key)
    if resolved:
        return resolved
    norm_key = re.sub(r"[^0-9a-zA-Z]", "", key)
    if not norm_key:
        return None
    if allowed_norm_map:
        resolved = allowed_norm_map.get(norm_key)
        if resolved:
            return resolved
    if alias_norm_map:
        resolved = alias_norm_map.get(norm_key)
        if resolved:
            return resolved
    return None

class ExcelUploadMixin:
    upload_template = "subbranch/upload_excel_page.html"

    def get_urls(self):  # type: ignore[override]
        urls = super().get_urls()  # type: ignore
        # Wrap upload view with csrf_exempt but still enforce admin auth via admin_view.
        # This avoids "CSRF token incorrect length" errors for JS FormData posts when the
        # front-end script fails to include the token, while still restricting to staff users.
        secured_upload = self.admin_site.admin_view(csrf_exempt(self.upload_excel))
        my = [
            path("upload-excel/", secured_upload, name=f"{self.model._meta.app_label}_{self.model._meta.model_name}_upload_excel"),
            path("download-template/", self.admin_site.admin_view(self.download_template), name=f"{self.model._meta.app_label}_{self.model._meta.model_name}_download_template"),
        ]
        return my + urls

    def download_template(self, request):  # type: ignore
        spec = get_import_spec(self.model)
        header = ",".join(spec["allowed_columns"]) + "\n"
        resp = HttpResponse(header, content_type="text/csv")
        resp["Content-Disposition"] = f"attachment; filename={self.model._meta.model_name}_template.csv"
        return resp

    def upload_excel(self, request):  # type: ignore
        if not pd:
            messages.error(request, "Pandas not installed. Excel upload disabled.")
            return render(request, self.upload_template, {
                "title": f"Upload Excel for {self.model._meta.verbose_name}",
                "download_url": reverse(f"admin:{self.model._meta.app_label}_{self.model._meta.model_name}_download_template"),
            })

        if request.method == "POST" and request.headers.get("X-Requested-With") == "XMLHttpRequest":
            action = request.POST.get("action")
            try:
                if action == "init":
                    up = request.FILES.get("file")
                    if not up:
                        return JsonResponse({"error": "No file uploaded"}, status=400)
                    MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20MB
                    if up.size > MAX_UPLOAD_BYTES:
                        return JsonResponse({"error": f"File too large (> {MAX_UPLOAD_BYTES // (1024*1024)}MB)"}, status=413)
                    allowed_ext = {".xlsx", ".xls"}
                    ext = ("." + up.name.rsplit(".", 1)[-1].lower()) if "." in up.name else ""
                    if ext not in allowed_ext:
                        return JsonResponse({"error": "Unsupported file type. Use .xlsx or .xls"}, status=415)
                    request.session["excel_data"] = base64.b64encode(up.read()).decode("utf-8")
                    request.session["excel_file_ext"] = ext
                    up.seek(0)
                    try:
                        sheets = list(_read_excel_compat(up, file_ext=ext, sheet_name=None, nrows=0).keys())
                    except Exception as e:
                        return JsonResponse({"error": f"Read error: {e}"}, status=400)
                    return JsonResponse({"sheets": sheets})

                if action == "columns":
                    sheet = request.POST.get("sheet")
                    encoded = request.session.get("excel_data")
                    file_ext = request.session.get("excel_file_ext")
                    if not encoded:
                        return JsonResponse({"error": "Session expired"}, status=400)
                    spec, allowed, allowed_map, alias_map, allowed_norm_map, alias_norm_map = _build_allowed_maps(self.model)
                    required_keys = spec["required_keys"]

                    # Try to detect the correct header row. Some Excel files include title rows
                    # above the real header which causes pandas to read columns as Unnamed.
                    # We'll try header rows 0..2 and pick the one that yields the most matches
                    # against the allowed whitelist.
                    best_header = 0
                    best_score = -1
                    frames = None
                    read_err = None
                    for try_h in (0, 1, 2):
                        try:
                            frames_try = _read_excel_compat(base64.b64decode(encoded), file_ext=file_ext, sheet_name=None, header=try_h, nrows=0)
                        except Exception as e:
                            read_err = e
                            continue
                        if sheet not in frames_try:
                            continue
                        cols_try = [str(c).strip() for c in frames_try[sheet].columns]
                        usable_try = [c for c in cols_try if _resolve_column_name(c, allowed_map, alias_map, allowed_norm_map, alias_norm_map)]
                        score = len(usable_try)
                        if score > best_score:
                            best_score = score
                            best_header = try_h
                            frames = frames_try

                    if frames is None:
                        try:
                            frames = _read_excel_compat(base64.b64decode(encoded), file_ext=file_ext, sheet_name=None, nrows=0)
                        except Exception as e:
                            return JsonResponse({"error": f"Read error: {e}"}, status=400)

                    if sheet not in frames:
                        return JsonResponse({"error": "Sheet not found"}, status=404)

                    header_map = request.session.get('excel_header_rows', {})
                    header_map[str(sheet)] = int(best_header)
                    request.session['excel_header_rows'] = header_map

                    cols_present = [str(c).strip() for c in frames[sheet].columns]
                    usable: List[str] = []
                    unrecognized: List[str] = []
                    mapped_seen = set()
                    for col in cols_present:
                        resolved = _resolve_column_name(col, allowed_map, alias_map, allowed_norm_map, alias_norm_map)
                        if resolved:
                            usable.append(col)
                            mapped_seen.add(resolved)
                        else:
                            unrecognized.append(col)
                    required_missing = [rk for rk in required_keys if rk not in mapped_seen]
                    return JsonResponse({
                        "columns": usable,
                        "unrecognized": unrecognized,
                        "required_keys": required_keys,
                        "required_missing": required_missing,
                        "detected_header": header_map.get(str(sheet), 0),
                    })

                if action == "debug_columns":
                    sheet = request.POST.get("sheet")
                    encoded = request.session.get("excel_data")
                    file_ext = request.session.get("excel_file_ext")
                    if not encoded:
                        return JsonResponse({"error": "Session expired"}, status=400)
                    try:
                        header_map = request.session.get('excel_header_rows', {})
                        header_row = header_map.get(str(sheet), 0)
                        frames = _read_excel_compat(base64.b64decode(encoded), file_ext=file_ext, sheet_name=None, header=header_row)
                    except Exception:
                        try:
                            frames = _read_excel_compat(base64.b64decode(encoded), file_ext=file_ext, sheet_name=None)
                        except Exception as e:
                            return JsonResponse({"error": f"Read error: {e}"}, status=400)
                    if sheet not in frames:
                        return JsonResponse({"error": "Sheet not found"}, status=404)
                    raw_cols = [str(c) for c in frames[sheet].columns]
                    return JsonResponse({"raw_columns": raw_cols, "detected_header": header_map.get(str(sheet), 0)})

                if action == "preview":
                    sheet = request.POST.get("sheet")
                    selected = request.POST.getlist("columns[]")
                    if not selected:
                        return JsonResponse({"error": "Select at least one column"}, status=400)
                    encoded = request.session.get("excel_data")
                    file_ext = request.session.get("excel_file_ext")
                    if not encoded:
                        return JsonResponse({"error": "Session expired"}, status=400)
                    header_map = request.session.get('excel_header_rows', {})
                    header_row = header_map.get(str(sheet), 0)
                    try:
                        frames = _read_excel_compat(base64.b64decode(encoded), file_ext=file_ext, sheet_name=None, header=header_row)
                    except Exception as e:
                        return JsonResponse({"error": f"Read error: {e}"}, status=400)
                    if sheet not in frames:
                        return JsonResponse({"error": "Sheet not found"}, status=404)
                    df = frames[sheet]
                    try:
                        df.columns = [str(c).strip() for c in df.columns]
                    except Exception:
                        pass

                    try:
                        if pd is not None:
                            df = df.replace({r'^\s*nan\s*$': None, r'^\s*NaN\s*$': None, r'^\s*None\s*$': None, '<NA>': None}, regex=True)
                    except Exception:
                        pass
                    total = len(df.index)
                    preview_df = df[selected].head(50).fillna("")
                    if "rec_no" in preview_df.columns:
                        def _pad_rec_no(v):
                            try:
                                if v is None or (isinstance(v, str) and str(v).strip() == ""):
                                    return ""
                                n = int(float(v))
                                return f"{n:06d}"
                            except Exception:
                                return _sanitize(v)
                        try:
                            preview_df["rec_no"] = preview_df["rec_no"].apply(_pad_rec_no)
                        except Exception:
                            pass
                    rows = [list(map(_sanitize, r)) for r in preview_df.values.tolist()]
                    return JsonResponse({
                        "columns": selected,
                        "rows": rows,
                        "preview_rows": len(rows),
                        "total_rows": total,
                    })

                if action == "commit":
                    sheet = request.POST.get("sheet")
                    selected = request.POST.getlist("columns[]")
                    if not selected:
                        return JsonResponse({"error": "No columns selected"}, status=400)
                    encoded = request.session.get("excel_data")
                    file_ext = request.session.get("excel_file_ext")
                    if not encoded:
                        return JsonResponse({"error": "Session expired"}, status=400)
                    header_map = request.session.get('excel_header_rows', {})
                    header_row = header_map.get(str(sheet), 0)
                    try:
                        frames = _read_excel_compat(base64.b64decode(encoded), file_ext=file_ext, sheet_name=None, header=header_row)
                    except Exception as e:
                        return JsonResponse({"error": f"Read error: {e}"}, status=400)
                    if sheet not in frames:
                        return JsonResponse({"error": "Sheet not found"}, status=404)
                    spec, allowed, allowed_map, alias_map, allowed_norm_map, alias_norm_map = _build_allowed_maps(self.model)
                    required = set(spec["required_keys"])
                    normalized_selection: List[str] = []
                    for raw in selected:
                        resolved = _resolve_column_name(raw, allowed_map, alias_map, allowed_norm_map, alias_norm_map)
                        if resolved:
                            normalized_selection.append(resolved)
                    chosen = normalized_selection
                    if not required.issubset(chosen):
                        return JsonResponse({"error": "All required columns must be selected"}, status=400)
                    df = frames[sheet]
                    try:
                        df.columns = [str(c).strip() for c in df.columns]
                    except Exception:
                        pass
                    if allowed_map:
                        try:
                            rename_map = {}
                            for col in list(df.columns):
                                resolved = _resolve_column_name(col, allowed_map, alias_map, allowed_norm_map, alias_norm_map)
                                if resolved and resolved != col:
                                    rename_map[col] = resolved
                            if rename_map:
                                df.rename(columns=rename_map, inplace=True)
                        except Exception:
                            pass
                    # Clean numeric/foreign-key like id columns so pandas.nan does not get passed
                    try:
                        if pd is not None:
                            for fk_col in ("institute_id", "maincourse_id", "subcourse_id"):
                                if fk_col in df.columns:
                                    # Replace NA/NaN/None with Python None
                                    df[fk_col] = df[fk_col].apply(lambda v: None if (pd.isna(v) or (isinstance(v, str) and str(v).strip().lower() in ("nan","none","<na>"))) else v)
                    except Exception:
                        # be tolerant: proceed without vectorized cleaning if something fails
                        pass
                    # Clean decimal-like numeric columns (avoid passing 'nan' strings to DecimalField)
                    try:
                        if pd is not None:
                            decimal_cols = [
                                "el_balance", "sl_balance", "cl_balance", "vacation_balance",
                                "joining_year_allocation_el", "joining_year_allocation_cl", "joining_year_allocation_sl", "joining_year_allocation_vac",
                                "total_days", "pay_amount", "allocated",
                            ]
                            for c in decimal_cols:
                                if c in df.columns:
                                    try:
                                        df[c] = pd.to_numeric(df[c], errors='coerce')
                                        df[c] = df[c].fillna(0)
                                    except Exception:
                                        def _clean_num(v):
                                            try:
                                                if pd.isna(v):
                                                    return 0
                                            except Exception:
                                                pass
                                            try:
                                                s = str(v).strip()
                                                if s.lower() in ("", "nan", "none", "<na>"):
                                                    return 0
                                                return float(s)
                                            except Exception:
                                                return 0
                                        df[c] = df[c].apply(_clean_num)
                    except Exception:
                        pass
                    if pd is not None:
                        def _normalize(col_names):
                            for c in col_names:
                                if c in df.columns:
                                    try:
                                        df[c] = pd.to_datetime(df[c], errors='coerce', dayfirst=True).dt.date
                                    except Exception:
                                        pass
                        sheet_lc = (sheet or "").lower().replace(" ", "")
                        _normalize(["doc_rec_date","date","birth_date"])  # safe no-op if absent
                        if issubclass(self.model, Enrollment) or sheet_lc == "enrollment":
                            _normalize(["enrollment_date","admission_date"])
                        elif sheet_lc == "migration":
                            _normalize(["mg_date"])
                        elif sheet_lc == "provisional":
                            _normalize(["prv_date"])
                    counts = {"created": 0, "updated": 0, "skipped": 0}
                    log: List[Dict[str, Any]] = []
                    def add_log(rn, status, msg, ref=None):
                        log.append({"row": rn, "status": status, "message": msg, "ref": ref})
                    sheet_norm = sheet.lower().replace(" ", "")
                    eff = set(chosen)
                    try:
                        if issubclass(self.model, MainBranch) and sheet_norm == "maincourse":
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                mc = str(r.get("maincourse_id") or "").strip()
                                if not mc:
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing maincourse_id"); continue
                                obj, created = MainBranch.objects.update_or_create(
                                    maincourse_id=mc,
                                    defaults={
                                        **({"course_code": r.get("course_code")} if "course_code" in eff else {}),
                                        **({"course_name": r.get("course_name")} if "course_name" in eff else {}),
                                        "updated_by": request.user,
                                    }
                                )
                                if created: counts["created"] += 1; add_log(i, "created", "Created", mc)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", mc)
                        elif issubclass(self.model, SubBranch) and sheet_norm == "subcourse":
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                sb = str(r.get("subcourse_id") or "").strip()
                                mc = str(r.get("maincourse_id") or "").strip()
                                if not (sb and mc):
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing subcourse_id/maincourse_id"); continue
                                main = MainBranch.objects.filter(maincourse_id=mc).first()
                                if not main:
                                    counts["skipped"] += 1; add_log(i, "skipped", f"maincourse {mc} not found"); continue
                                obj, created = SubBranch.objects.update_or_create(
                                    subcourse_id=sb,
                                    defaults={
                                        **({"subcourse_name": r.get("subcourse_name")} if "subcourse_name" in eff else {}),
                                        **({"maincourse": main} if "maincourse_id" in eff else {}),
                                        "updated_by": request.user,
                                    }
                                )
                                if created: counts["created"] += 1; add_log(i, "created", "Created", sb)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", sb)
                        elif issubclass(self.model, Institute):  # relax sheet name requirement
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                iid = _clean_cell(r.get("institute_id"))
                                if iid in (None, ""):
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing institute_id"); continue
                                obj, created = Institute.objects.update_or_create(
                                    institute_id=iid,
                                    defaults={
                                        **({"institute_code": r.get("institute_code")} if "institute_code" in eff else {}),
                                        **({"institute_name": r.get("institute_name")} if "institute_name" in eff else {}),
                                        **({"institute_campus": r.get("institute_campus")} if "institute_campus" in eff else {}),
                                        **({"institute_address": r.get("institute_address")} if "institute_address" in eff else {}),
                                        **({"institute_city": r.get("institute_city")} if "institute_city" in eff else {}),
                                        "updated_by": request.user,
                                    }
                                )
                                if created: counts["created"] += 1; add_log(i, "created", "Created", iid)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", iid)
                        elif issubclass(self.model, Enrollment):  # relax sheet name requirement
                            profile_cols = {
                                "gender", "birth_date", "address1", "address2", "city1", "city2", "contact_no", "email", "fees",
                                "hostel_required", "aadhar_no", "abc_id", "mobile_adhar", "name_adhar", "mother_name", "father_name",
                                "category", "photo_uploaded", "is_d2d", "program_medium",
                            }

                            def _safe_date(cell):
                                try:
                                    d = parse_excel_date(cell)
                                    if hasattr(d, 'to_pydatetime'):
                                        d = d.to_pydatetime()
                                    if isinstance(d, datetime):
                                        if d.tzinfo is not None:
                                            d = d.replace(tzinfo=None)
                                        return d.date()
                                    return d if isinstance(d, date) else None
                                except Exception:
                                    return None

                            def _to_bool(v):
                                try:
                                    s = str(v).strip().lower()
                                except Exception:
                                    return False
                                return s in ("1", "true", "yes", "y", "t")

                            def _normalize_fk_token(raw):
                                val = _clean_cell(raw)
                                if val in (None, ""):
                                    return None
                                s = str(val).strip()
                                if not s:
                                    return None
                                import re as _re
                                if _re.fullmatch(r"[0-9]+(?:\.0+)?", s):
                                    try:
                                        return str(int(float(s)))
                                    except Exception:
                                        return s
                                return s

                            def _resolve_institute(raw):
                                token = _normalize_fk_token(raw)
                                if not token:
                                    return None, None
                                obj = None
                                try:
                                    obj = Institute.objects.filter(institute_id=int(token)).first()
                                except Exception:
                                    obj = None
                                if not obj:
                                    obj = Institute.objects.filter(institute_code__iexact=token).first()
                                if not obj:
                                    obj = Institute.objects.filter(institute_name__iexact=token).first()
                                return obj, token

                            def _resolve_maincourse(raw):
                                token = _normalize_fk_token(raw)
                                if not token:
                                    return None, None
                                obj = MainBranch.objects.filter(maincourse_id__iexact=token).first()
                                if not obj:
                                    obj = MainBranch.objects.filter(course_code__iexact=token).first()
                                if not obj:
                                    obj = MainBranch.objects.filter(course_name__iexact=token).first()
                                return obj, token

                            def _resolve_subcourse(raw, main_obj=None):
                                token = _normalize_fk_token(raw)
                                if not token:
                                    return None, None
                                obj = SubBranch.objects.filter(subcourse_id__iexact=token).first()
                                if not obj and main_obj is not None:
                                    obj = SubBranch.objects.filter(subcourse_name__iexact=token, maincourse=main_obj).first()
                                if not obj:
                                    obj = SubBranch.objects.filter(subcourse_name__iexact=token).first()
                                return obj, token

                            def _upsert_profile_from_row(enrollment_obj, row):
                                # Only run if at least one profile column was selected.
                                if not any(c in eff for c in profile_cols):
                                    return None

                                fees_val = None
                                if "fees" in eff:
                                    try:
                                        raw_fees = row.get("fees")
                                        if raw_fees not in (None, ""):
                                            fees_val = float(raw_fees)
                                    except Exception:
                                        fees_val = None

                                birth_date = _safe_date(row.get("birth_date")) if "birth_date" in eff else None
                                _, created_profile = StudentProfile.objects.update_or_create(
                                    enrollment=enrollment_obj,
                                    defaults={
                                        **({"gender": row.get("gender") or None} if "gender" in eff else {}),
                                        **({"birth_date": birth_date} if "birth_date" in eff else {}),
                                        **({"address1": row.get("address1") or None} if "address1" in eff else {}),
                                        **({"address2": row.get("address2") or None} if "address2" in eff else {}),
                                        **({"city1": row.get("city1") or None} if "city1" in eff else {}),
                                        **({"city2": row.get("city2") or None} if "city2" in eff else {}),
                                        **({"contact_no": row.get("contact_no") or None} if "contact_no" in eff else {}),
                                        **({"email": row.get("email") or None} if "email" in eff else {}),
                                        **({"fees": fees_val} if "fees" in eff else {}),
                                        **({"hostel_required": _to_bool(row.get("hostel_required"))} if "hostel_required" in eff else {}),
                                        **({"aadhar_no": row.get("aadhar_no") or None} if "aadhar_no" in eff else {}),
                                        **({"abc_id": row.get("abc_id") or None} if "abc_id" in eff else {}),
                                        **({"mobile_adhar": row.get("mobile_adhar") or None} if "mobile_adhar" in eff else {}),
                                        **({"name_adhar": row.get("name_adhar") or None} if "name_adhar" in eff else {}),
                                        **({"mother_name": row.get("mother_name") or None} if "mother_name" in eff else {}),
                                        **({"father_name": row.get("father_name") or None} if "father_name" in eff else {}),
                                        **({"category": row.get("category") or None} if "category" in eff else {}),
                                        **({"photo_uploaded": _to_bool(row.get("photo_uploaded"))} if "photo_uploaded" in eff else {}),
                                        **({"is_d2d": _to_bool(row.get("is_d2d"))} if "is_d2d" in eff else {}),
                                        **({"program_medium": row.get("program_medium") or None} if "program_medium" in eff else {}),
                                        "updated_by": request.user,
                                    }
                                )
                                return created_profile

                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                try:
                                    en = str(r.get("enrollment_no") or "").strip()
                                    if not en:
                                        counts["skipped"] += 1; add_log(i, "skipped", "Missing enrollment_no"); continue

                                    existing_enrollment = Enrollment.objects.filter(enrollment_no=en).first()
                                    if not existing_enrollment:
                                        existing_enrollment = Enrollment.objects.filter(enrollment_no__iexact=en).first()
                                    if not existing_enrollment:
                                        try:
                                            norm_en = ''.join(str(en).split()).lower()
                                            existing_enrollment = (
                                                Enrollment.objects
                                                .annotate(_norm=Replace(Lower(models.F('enrollment_no')), Value(' '), Value('')))
                                                .filter(_norm=norm_en)
                                                .first()
                                            )
                                        except Exception:
                                            existing_enrollment = None

                                    inst = sub = main = None
                                    inst_key = sub_key = main_key = None

                                    if "institute_id" in eff:
                                        inst, inst_key = _resolve_institute(r.get("institute_id"))
                                    if "maincourse_id" in eff:
                                        main, main_key = _resolve_maincourse(r.get("maincourse_id"))
                                    if "subcourse_id" in eff:
                                        sub, sub_key = _resolve_subcourse(r.get("subcourse_id"), main)

                                    missing_fk = []
                                    if "institute_id" in eff and inst_key and not inst:
                                        missing_fk.append(("institute_id", inst_key))
                                    if "subcourse_id" in eff and sub_key and not sub:
                                        missing_fk.append(("subcourse_id", sub_key))
                                    if "maincourse_id" in eff and main_key and not main:
                                        missing_fk.append(("maincourse_id", main_key))

                                    # For existing enrollment rows, unresolved FK inputs are ignored so
                                    # profile-only updates can still be applied.
                                    if missing_fk and not existing_enrollment:
                                        fk_detail = ', '.join([f"{field}='{value}'" for field, value in missing_fk])
                                        counts["skipped"] += 1; add_log(i, "skipped", f"Related FK missing: {fk_detail}"); continue

                                    enroll_dt = _safe_date(r.get("enrollment_date")) if "enrollment_date" in eff else None
                                    adm_dt = _safe_date(r.get("admission_date")) if "admission_date" in eff else None

                                    obj, created = Enrollment.objects.update_or_create(
                                        enrollment_no=en,
                                        defaults={
                                            **({"student_name": r.get("student_name")} if "student_name" in eff else {}),
                                            **({"batch": r.get("batch")} if "batch" in eff else {}),
                                            **({"institute": inst} if getattr(inst, 'pk', None) is not None and "institute_id" in eff else {}),
                                            **({"subcourse": sub} if getattr(sub, 'pk', None) is not None and "subcourse_id" in eff else {}),
                                            **({"maincourse": main} if getattr(main, 'pk', None) is not None and "maincourse_id" in eff else {}),
                                            **({"temp_enroll_no": r.get("temp_enroll_no")} if "temp_enroll_no" in eff else {}),
                                            **({"enrollment_date": enroll_dt} if "enrollment_date" in eff else {}),
                                            **({"admission_date": adm_dt} if "admission_date" in eff else {}),
                                            "updated_by": request.user,
                                        }
                                    )

                                    profile_created = _upsert_profile_from_row(obj, r)
                                    profile_msg = ""
                                    if profile_created is True:
                                        profile_msg = " + profile created"
                                    elif profile_created is False:
                                        profile_msg = " + profile updated"

                                    if created: counts["created"] += 1; add_log(i, "created", f"Created{profile_msg}", en)
                                    else: counts["updated"] += 1; add_log(i, "updated", f"Updated{profile_msg}", en)
                                except Exception as row_err:
                                    # Attempt recovery for NaTType/utcoffset errors by retrying without date fields
                                    err_txt = str(row_err)
                                    if 'NaTType' in err_txt or 'utcoffset' in err_txt:
                                        try:
                                            obj, created = Enrollment.objects.update_or_create(
                                                enrollment_no=str(r.get("enrollment_no") or '').strip(),
                                                defaults={
                                                    **({"student_name": r.get("student_name")} if "student_name" in eff else {}),
                                                    **({"batch": r.get("batch")} if "batch" in eff else {}),
                                                    **({"institute": inst} if 'inst' in locals() and getattr(inst, 'pk', None) is not None and "institute_id" in eff else {}),
                                                    **({"subcourse": sub} if 'sub' in locals() and getattr(sub, 'pk', None) is not None and "subcourse_id" in eff else {}),
                                                    **({"maincourse": main} if 'main' in locals() and getattr(main, 'pk', None) is not None and "maincourse_id" in eff else {}),
                                                    **({"temp_enroll_no": r.get("temp_enroll_no")} if "temp_enroll_no" in eff else {}),
                                                    # intentionally omit enrollment_date / admission_date
                                                    "updated_by": request.user,
                                                }
                                            )

                                            profile_created = _upsert_profile_from_row(obj, r)
                                            profile_msg = ""
                                            if profile_created is True:
                                                profile_msg = " + profile created"
                                            elif profile_created is False:
                                                profile_msg = " + profile updated"

                                            if created: counts["created"] += 1; add_log(i, "created", f"Recovered without dates{profile_msg}", r.get("enrollment_no"))
                                            else: counts["updated"] += 1; add_log(i, "updated", f"Recovered without dates{profile_msg}", r.get("enrollment_no"))
                                            continue
                                        except Exception as recover_err:
                                            counts["skipped"] += 1; add_log(i, "skipped", f"Row error: {recover_err}", str(r.get("enrollment_no") or '').strip()); continue
                                    counts["skipped"] += 1; add_log(i, "skipped", f"Row error: {row_err}", str(r.get("enrollment_no") or '').strip())
                                    continue
                        elif issubclass(self.model, AdmissionCancel):  # relax sheet name requirement
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                en_no = str(row_value(r, "enrollment_no") or "").strip()
                                if not en_no:
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing enrollment_no"); continue

                                enrollment = (
                                    Enrollment.objects.filter(enrollment_no__iexact=en_no).first()
                                    or Enrollment.objects.filter(temp_enroll_no__iexact=en_no).first()
                                )
                                if not enrollment:
                                    counts["skipped"] += 1; add_log(i, "skipped", f"Enrollment {en_no} not found"); continue

                                status_raw = _clean_cell(row_value(r, "status")) if "status" in eff else AdmissionCancel.STATUS_CANCELLED
                                if status_raw in (None, ""):
                                    status_raw = AdmissionCancel.STATUS_CANCELLED
                                status_val = _normalize_choice(status_raw, AdmissionCancel.STATUS_CHOICES)
                                if not status_val:
                                    norm_status = str(status_raw).strip().upper()
                                    if norm_status.startswith("CANCEL"):
                                        status_val = AdmissionCancel.STATUS_CANCELLED
                                    elif norm_status.startswith("REVOKE"):
                                        status_val = AdmissionCancel.STATUS_REVOKED
                                if not status_val:
                                    counts["skipped"] += 1; add_log(i, "skipped", f"Invalid status: {status_raw}", en_no); continue

                                inward_date_raw = row_value(r, "inward_date")
                                inward_date = None
                                if "inward_date" in eff:
                                    inward_text = str(inward_date_raw).strip() if inward_date_raw is not None else ""
                                    if inward_text and inward_text.lower() not in {"-", "--", "na", "n/a", "none", "null", "<na>"}:
                                        inward_date = parse_excel_date(inward_date_raw)
                                        if not inward_date:
                                            counts["skipped"] += 1; add_log(i, "skipped", f"Invalid inward_date: {inward_text}", en_no); continue

                                outward_date_raw = row_value(r, "outward_date")
                                outward_date = None
                                if "outward_date" in eff:
                                    outward_text = str(outward_date_raw).strip() if outward_date_raw is not None else ""
                                    if outward_text and outward_text.lower() not in {"-", "--", "na", "n/a", "none", "null", "<na>"}:
                                        outward_date = parse_excel_date(outward_date_raw)
                                        if not outward_date:
                                            counts["skipped"] += 1; add_log(i, "skipped", f"Invalid outward_date: {outward_text}", en_no); continue

                                student_name_val = _clean_cell(row_value(r, "student_name")) if "student_name" in eff else None
                                if not student_name_val:
                                    student_name_val = enrollment.student_name or ""

                                defaults = {
                                    "student_name": student_name_val,
                                    "status": status_val,
                                }
                                if "inward_no" in eff:
                                    defaults["inward_no"] = _clean_cell(row_value(r, "inward_no")) or None
                                if "inward_date" in eff:
                                    defaults["inward_date"] = inward_date
                                if "outward_no" in eff:
                                    defaults["outward_no"] = _clean_cell(row_value(r, "outward_no")) or None
                                if "outward_date" in eff:
                                    defaults["outward_date"] = outward_date
                                if "can_remark" in eff:
                                    defaults["can_remark"] = _clean_cell(row_value(r, "can_remark")) or None

                                obj, created = AdmissionCancel.objects.update_or_create(
                                    enrollment=enrollment,
                                    defaults=defaults,
                                )
                                if created: counts["created"] += 1; add_log(i, "created", "Created", en_no)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", en_no)
                        elif issubclass(self.model, DocRec) and sheet_norm in ("docrec", "doc_rec"):
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                apply_for = str(r.get("apply_for") or "").strip().upper()
                                pay_by = str(r.get("pay_by") or "").strip().upper()
                                doc_rec_id = str(r.get("doc_rec_id") or "").strip()
                                if not (apply_for and pay_by and doc_rec_id):
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing apply_for/pay_by/doc_rec_id"); continue
                                pay_rec_no_pre = str(r.get("pay_rec_no") or "").strip()
                                pay_rec_no = str(r.get("pay_rec_no") or "").strip() or None
                                pay_amount = None
                                if "pay_amount" in eff:
                                    try:
                                        raw_pay = r.get("pay_amount")
                                        if str(raw_pay).strip() not in ("", "None"):
                                            pay_amount = float(raw_pay)
                                    except Exception:
                                        pay_amount = None
                                doc_date = parse_excel_date(r.get("doc_rec_date")) if "doc_rec_date" in eff else None
                                # Resolve existing DocRec robustly to avoid duplicate doc_rec_id variants
                                obj = resolve_docrec(doc_rec_id)
                                created = False
                                if not obj:
                                    try:
                                        obj = DocRec.objects.create(
                                            doc_rec_id=doc_rec_id,
                                            doc_rec_date=doc_date,
                                            apply_for=apply_for,
                                            created_by=request.user,
                                        )
                                        created = True
                                        # If additional fields were in the selected columns, set them now
                                        if "pay_rec_no_pre" in eff: obj.pay_rec_no_pre = pay_rec_no_pre
                                        if "pay_rec_no" in eff: obj.pay_rec_no = pay_rec_no
                                        if "pay_amount" in eff and (pay_amount is not None): obj.pay_amount = pay_amount or 0
                                        if "doc_rec_date" in eff and doc_date: obj.doc_rec_date = doc_date
                                        obj.save()
                                    except Exception as e:
                                        counts["skipped"] += 1; add_log(i, "skipped", f"Failed create docrec: {e}"); continue
                                else:
                                    if "apply_for" in eff: obj.apply_for = apply_for
                                    if "pay_by" in eff: obj.pay_by = pay_by
                                    if "pay_rec_no_pre" in eff: obj.pay_rec_no_pre = pay_rec_no_pre
                                    if "pay_rec_no" in eff: obj.pay_rec_no = pay_rec_no
                                    if "pay_amount" in eff and (pay_amount is not None): obj.pay_amount = pay_amount or 0
                                    if "doc_rec_date" in eff and doc_date: obj.doc_rec_date = doc_date
                                    try:
                                        obj.save()
                                    except Exception:
                                        pass
                                if created: counts["created"] += 1; add_log(i, "created", "Created", doc_rec_id)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", doc_rec_id)
                        elif issubclass(self.model, FeeType):
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                code = _clean_cell(r.get("code")) if "code" in eff else None
                                name = _clean_cell(r.get("name")) if "name" in eff else None
                                if code:
                                    code = str(code).strip().upper()
                                if name:
                                    name = str(name).strip().upper()
                                if not code or not name:
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing code/name"); continue
                                try:
                                    is_active = _parse_boolean_cell(r.get("is_active")) if "is_active" in eff else None
                                except ValueError as bool_err:
                                    counts["skipped"] += 1; add_log(i, "skipped", f"Invalid is_active: {bool_err}"); continue
                                defaults = {"name": name}
                                if is_active is not None:
                                    defaults["is_active"] = is_active
                                obj, created = FeeType.objects.update_or_create(code=code, defaults=defaults)
                                if created: counts["created"] += 1; add_log(i, "created", "Created", code)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", code)
                        elif issubclass(self.model, Receipt):
                            # Use extracted import_cash_register logic. The importer manages
                            # per-row transactions (savepoints) itself, so avoid wrapping
                            # the whole import in a single outer transaction which can
                            # leave the connection in a broken state on errors.
                            from .excel_import.cash_import import import_cash_register
                            counts, log = import_cash_register(
                                df,
                                eff,
                                request,
                                Receipt,
                                ReceiptItem,
                                FeeType,
                                ReceiptNumberService,
                                normalize_receipt_no,
                                split_receipt,
                            )
                        elif issubclass(self.model, MigrationRecord) and sheet_norm == "migration":
                            auto_create = bool(str(request.POST.get('auto_create_docrec', '')).strip())
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                doc_rec_id_raw = _clean_cell(r.get("doc_rec_id"))
                                dr = resolve_docrec(doc_rec_id_raw)
                                if not dr:
                                    if auto_create:
                                        doc_date = parse_excel_date(r.get("doc_rec_date")) if "doc_rec_date" in eff else None
                                        try:
                                            dr = DocRec.objects.create(
                                                doc_rec_date=doc_date,
                                                apply_for='MG',
                                                created_by=request.user,
                                            )
                                            add_log(i, "created", "Auto-created DocRec", dr.doc_rec_id)
                                        except Exception as e:
                                            counts["skipped"] += 1; add_log(i, "skipped", f"Failed create docrec: {e}"); continue
                                    else:
                                        counts["skipped"] += 1; add_log(i, "skipped", "doc_rec_id not found"); continue
                                enr_key = _clean_cell(r.get("enrollment_no")) if "enrollment_no" in eff else None
                                enr = Enrollment.objects.filter(enrollment_no__iexact=str(enr_key).strip()).first() if enr_key else None
                                inst_key = _clean_cell(r.get("institute_id")) if "institute_id" in eff else None
                                main_key = _clean_cell(r.get("maincourse_id")) if "maincourse_id" in eff else None
                                sub_key = _clean_cell(r.get("subcourse_id")) if "subcourse_id" in eff else None
                                inst = Institute.objects.filter(institute_id=inst_key).first() if inst_key else None
                                main = MainBranch.objects.filter(maincourse_id=main_key).first() if main_key else None
                                sub = SubBranch.objects.filter(subcourse_id=sub_key).first() if sub_key else None
                                if enr:
                                    # Try to auto-fill fk relations from enrollment if not provided explicitly
                                    try:
                                        if not inst and getattr(enr, 'institute', None):
                                            inst = enr.institute
                                    except Exception:
                                        pass
                                    try:
                                        if not main and getattr(enr, 'maincourse', None):
                                            main = enr.maincourse
                                    except Exception:
                                        pass
                                    try:
                                        if not sub and getattr(enr, 'subcourse', None):
                                            sub = enr.subcourse
                                    except Exception:
                                        pass

                                mg_status_raw = _clean_cell(r.get("mg_status")) or ''
                                mg_status = str(mg_status_raw).strip().upper()
                                mg_date = parse_excel_date(r.get("mg_date")) if "mg_date" in eff and _clean_cell(r.get("mg_date")) is not None else None
                                if mg_status == '':
                                    mg_status = 'ISSUED'
                                    mg_status_raw = 'ISSUED'

                                is_cancel = mg_status == 'CANCEL'
                                mn = _clean_cell(r.get("mg_number"))
                                if not mn:
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing mg_number"); continue
                                # For non-cancel records: require enrollment_no / student_name only if the
                                # corresponding columns were selected by the user (in `eff`). If the user did
                                # not include these FK columns (they are expected to exist in Enrollment table),
                                # don't fail the row just because the sheet omitted them.
                                if not is_cancel:
                                    if "enrollment_no" in eff:
                                        enr_key_present = bool(_clean_cell(r.get("enrollment_no")))
                                        if not enr_key_present:
                                            counts["skipped"] += 1; add_log(i, "skipped", "Missing enrollment_no for non-cancel record"); continue
                                    if "student_name" in eff:
                                        student_name_present = bool(_clean_cell(r.get("student_name")))
                                        if not student_name_present:
                                            counts["skipped"] += 1; add_log(i, "skipped", "Missing student_name for non-cancel record"); continue
                                if not is_cancel and "mg_date" in eff and not mg_date:
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing mg_date"); continue

                                if enr and not is_cancel:
                                    existing_for_enr = MigrationRecord.objects.filter(enrollment=enr).first()
                                    if existing_for_enr:
                                        counts["skipped"] += 1; add_log(i, "skipped", f"Migration already exists for enrollment {enr.enrollment_no}"); continue

                                obj, created = MigrationRecord.objects.get_or_create(doc_rec=(dr.doc_rec_id if dr else None), defaults={})
                                # Populate fields (keep tolerant): for CANCEL store only minimal fields
                                if "enrollment_no" in eff and enr:
                                    obj.enrollment = enr
                                if not is_cancel:
                                    if "student_name" in eff:
                                        obj.student_name = (_clean_cell(r.get("student_name")) or (enr.student_name if enr else getattr(obj, 'student_name', '')))
                                else:
                                    # For CANCEL rows ensure student_name is at least empty string so
                                    # model.full_clean() (which runs on save) does not reject the row.
                                    try:
                                        if not getattr(obj, 'student_name', None):
                                            obj.student_name = ''
                                    except Exception:
                                        obj.student_name = ''
                                    if inst: obj.institute = inst
                                    if main: obj.maincourse = main
                                    if sub: obj.subcourse = sub
                                    if "exam_year" in eff:
                                        obj.exam_year = _clean_cell(r.get("exam_year"))
                                    if "admission_year" in eff:
                                        obj.admission_year = _clean_cell(r.get("admission_year"))
                                    if "exam_details" in eff:
                                        obj.exam_details = _clean_cell(r.get("exam_details"))
                                    if mg_date: obj.mg_date = mg_date
                                obj.mg_number = str(mn).strip()
                                if "mg_status" in eff and mg_status_raw not in (None, ''):
                                    obj.mg_status = mg_status_raw or getattr(obj, 'mg_status', None)
                                if "pay_rec_no" in eff:
                                    obj.pay_rec_no = _clean_cell(r.get("pay_rec_no")) or (dr.pay_rec_no if dr else getattr(obj, 'pay_rec_no', None))

                                if "doc_rec_remark" in eff:
                                    remark_val = r.get("doc_rec_remark")
                                    if remark_val is not None:
                                        try:
                                            dr.doc_rec_remark = remark_val
                                            dr.save(update_fields=['doc_rec_remark'])
                                        except Exception:
                                            pass

                                # Ensure FK fields are valid model instances / PKs (defensive against NaN from Excel)
                                try:
                                    for fk in ('institute', 'maincourse', 'subcourse'):
                                        pk_attr = fk + '_id'
                                        try:
                                            val = getattr(obj, pk_attr, None)
                                        except Exception:
                                            val = None
                                        if val is None:
                                            setattr(obj, fk, None)
                                        else:
                                            try:
                                                int(val)
                                            except Exception:
                                                setattr(obj, fk, None)
                                except Exception:
                                    # if anything goes wrong, clear the FK fields to avoid type errors
                                    try:
                                        obj.institute = None
                                    except Exception:
                                        pass
                                    try:
                                        obj.maincourse = None
                                    except Exception:
                                        pass
                                    try:
                                        obj.subcourse = None
                                    except Exception:
                                        pass
                                if not obj.created_by: _assign_user_field(obj, request.user, 'created_by')
                                obj.save()
                                if created: counts["created"] += 1; add_log(i, "created", "Created", dr.doc_rec_id)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", dr.doc_rec_id)
                        elif issubclass(self.model, ProvisionalRecord) and sheet_norm == "provisional":
                            auto_create = bool(str(request.POST.get('auto_create_docrec', '')).strip())
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                dr = resolve_docrec(str(r.get("doc_rec_id")))
                                if not dr:
                                    if auto_create:
                                        doc_date = parse_excel_date(r.get("doc_rec_date")) if "doc_rec_date" in eff else None
                                        try:
                                            dr = DocRec.objects.create(
                                                doc_rec_date=doc_date,
                                                apply_for='PR',
                                                created_by=request.user,
                                            )
                                            add_log(i, "created", "Auto-created DocRec", dr.doc_rec_id)
                                        except Exception as e:
                                            counts["skipped"] += 1; add_log(i, "skipped", f"Failed create docrec: {e}"); continue
                                    else:
                                        counts["skipped"] += 1; add_log(i, "skipped", "doc_rec_id not found"); continue
                                enr = Enrollment.objects.filter(enrollment_no__iexact=str(r.get("enrollment_no")).strip()).first() if "enrollment_no" in eff and str(r.get("enrollment_no") or '').strip() else None
                                inst_key = _clean_cell(r.get("institute_id")) if "institute_id" in eff else None
                                main_key = _clean_cell(r.get("maincourse_id")) if "maincourse_id" in eff else None
                                sub_key = _clean_cell(r.get("subcourse_id")) if "subcourse_id" in eff else None
                                inst = Institute.objects.filter(institute_id=inst_key).first() if inst_key else None
                                main = MainBranch.objects.filter(maincourse_id=main_key).first() if main_key else None
                                sub = SubBranch.objects.filter(subcourse_id=sub_key).first() if sub_key else None
                                prv_date = parse_excel_date(r.get("prv_date")) if "prv_date" in eff else None
                                if "prv_date" in eff and not prv_date:  # required non-null
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing prv_date"); continue
                                # store doc_rec as the doc_rec_id string (DB stores varchar)
                                obj, created = ProvisionalRecord.objects.get_or_create(doc_rec=(dr.doc_rec_id if dr else None), defaults={})
                                if "enrollment_no" in eff: obj.enrollment = enr
                                if "student_name" in eff: obj.student_name = r.get("student_name") or (enr.student_name if enr else getattr(obj, 'student_name', ''))
                                if "institute_id" in eff: obj.institute = inst
                                if "maincourse_id" in eff: obj.maincourse = main
                                if "subcourse_id" in eff: obj.subcourse = sub
                                if "prv_number" in eff: obj.prv_number = str(r.get("prv_number") or "").strip()
                                if "prv_date" in eff and prv_date: obj.prv_date = prv_date
                                if "class_obtain" in eff: obj.class_obtain = r.get("class_obtain")
                                if "passing_year" in eff: obj.passing_year = r.get("passing_year")
                                # Normalize prv_status: treat blank as ISSUED, map CANCEL synonyms
                                prv_status_raw = _clean_cell(r.get("prv_status")) or ''
                                try:
                                    prv_status_norm = str(prv_status_raw).strip().upper()
                                except Exception:
                                    prv_status_norm = ''
                                if prv_status_norm == '':
                                    prv_status_norm = 'ISSUED'
                                    prv_status_raw = 'ISSUED'
                                if prv_status_norm.startswith('CANCEL') or prv_status_norm in ('CANCELED','CANCELLED'):
                                    try:
                                        if not getattr(obj, 'student_name', None):
                                            obj.student_name = ''
                                    except Exception:
                                        obj.student_name = ''
                                    obj.prv_status = ProvisionalStatus.CANCELLED
                                else:
                                    if "prv_status" in eff:
                                        obj.prv_status = (prv_status_raw or getattr(obj, 'prv_status', None))
                                if "pay_rec_no" in eff: obj.pay_rec_no = r.get("pay_rec_no") or (dr.pay_rec_no if dr else getattr(obj, 'pay_rec_no', ''))
                                # Defensive FK coercion similar to migration block
                                try:
                                    for fk in ('institute', 'maincourse', 'subcourse'):
                                        pk_attr = fk + '_id'
                                        try:
                                            val = getattr(obj, pk_attr, None)
                                        except Exception:
                                            val = None
                                        if val is None:
                                            setattr(obj, fk, None)
                                        else:
                                            try:
                                                int(val)
                                            except Exception:
                                                setattr(obj, fk, None)
                                except Exception:
                                    try:
                                        obj.institute = None
                                    except Exception:
                                        pass
                                    try:
                                        obj.maincourse = None
                                    except Exception:
                                        pass
                                    try:
                                        obj.subcourse = None
                                    except Exception:
                                        pass
                                if not obj.created_by: _assign_user_field(obj, request.user, 'created_by')
                                obj.save()
                                if created: counts["created"] += 1; add_log(i, "created", "Created", dr.doc_rec_id)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", dr.doc_rec_id)
                        elif issubclass(self.model, Verification) and sheet_norm == "verification":
                            auto_create = bool(str(request.POST.get('auto_create_docrec', '')).strip())
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                dr = resolve_docrec(str(r.get("doc_rec_id")))
                                if not dr:
                                    if auto_create:
                                        doc_date = parse_excel_date(r.get("doc_rec_date")) if "doc_rec_date" in eff else None
                                        try:
                                            dr = DocRec.objects.create(
                                                doc_rec_date=doc_date,
                                                apply_for='VR',
                                                created_by=request.user,
                                            )
                                            add_log(i, "created", "Auto-created DocRec", dr.doc_rec_id)
                                        except Exception as e:
                                            counts["skipped"] += 1; add_log(i, "skipped", f"Failed create docrec: {e}"); continue
                                    else:
                                        counts["skipped"] += 1; add_log(i, "skipped", "doc_rec_id not found"); continue
                                enr = Enrollment.objects.filter(enrollment_no__iexact=str(r.get("enrollment_no")).strip()).first() if "enrollment_no" in eff else None
                                senr = Enrollment.objects.filter(enrollment_no__iexact=str(r.get("second_enrollment_no")).strip()).first() if "second_enrollment_no" in eff and str(r.get("second_enrollment_no") or '').strip() else None
                                date_v = parse_excel_date(r.get("date")) if "date" in eff else None
                                obj, created = Verification.objects.get_or_create(doc_rec=dr, defaults={})
                                if "date" in eff and date_v: obj.date = date_v
                                if "enrollment_no" in eff: obj.enrollment = enr
                                if "second_enrollment_no" in eff: obj.second_enrollment = senr
                                if "student_name" in eff: obj.student_name = r.get("student_name") or (enr.student_name if enr else getattr(obj, 'student_name', ''))
                                if "no_of_transcript" in eff: obj.tr_count = int(r.get("no_of_transcript") or 0)
                                if "no_of_marksheet" in eff: obj.ms_count = int(r.get("no_of_marksheet") or 0)
                                if "no_of_degree" in eff: obj.dg_count = int(r.get("no_of_degree") or 0)
                                if "no_of_moi" in eff: obj.moi_count = int(r.get("no_of_moi") or 0)
                                if "no_of_backlog" in eff: obj.backlog_count = int(r.get("no_of_backlog") or 0)
                                if "status" in eff:
                                    raw_status = _clean_cell(r.get("status")) or ''
                                    mapped = _normalize_choice(raw_status, Verification._meta.get_field('status').choices)
                                    if mapped:
                                        obj.status = mapped
                                    else:
                                        try:
                                            obj.status = str(raw_status).upper() or getattr(obj, 'status', None)
                                        except Exception:
                                            obj.status = getattr(obj, 'status', None)
                                if "final_no" in eff: obj.final_no = (str(r.get("final_no")).strip() or obj.final_no)
                                if "pay_rec_no" in eff: obj.pay_rec_no = r.get("pay_rec_no") or (dr.pay_rec_no if dr else getattr(obj, 'pay_rec_no', ''))
                                if "vr_done_date" in eff:
                                    vr_done = parse_excel_date(r.get("vr_done_date"))
                                    if vr_done:
                                        obj.vr_done_date = vr_done
                                if "mail_status" in eff:
                                    obj.mail_status = r.get("mail_status") or getattr(obj, 'mail_status', None)
                                if "doc_rec_remark" in eff:
                                    remark_val = r.get("doc_rec_remark")
                                    if remark_val is not None and dr:
                                        dr.doc_rec_remark = remark_val
                                        dr.save(update_fields=['doc_rec_remark'])
                                # ECA handling: populate Verification's own eca_* fields (denormalized single-row mode)
                                try:
                                    if "eca_required" in eff and str(r.get("eca_required") or '').strip().lower() in ('1','true','yes','y'):
                                        obj.eca_required = True
                                    if 'eca_name' in eff:
                                        obj.eca_name = r.get('eca_name') or None
                                    if 'eca_ref_no' in eff:
                                        obj.eca_ref_no = r.get('eca_ref_no') or None
                                    if 'eca_submit_date' in eff or 'eca_send_date' in eff:
                                        eca_send = parse_excel_date(r.get('eca_submit_date') or r.get('eca_send_date'))
                                        if eca_send:
                                            obj.eca_send_date = eca_send
                                    if 'eca_resubmit_date' in eff:
                                        eca_resub = parse_excel_date(r.get('eca_resubmit_date'))
                                        if eca_resub:
                                            obj.eca_resubmit_date = eca_resub
                                    if 'eca_status' in eff:
                                        raw = _clean_cell(r.get('eca_status'))
                                        if raw:
                                            mapped_eca = _normalize_choice(raw, Verification._meta.get_field('eca_status').choices)
                                            if mapped_eca:
                                                obj.eca_status = mapped_eca
                                            else:
                                                try:
                                                    obj.eca_status = str(raw).upper()
                                                except Exception:
                                                    pass
                                    if 'eca_remark' in eff:
                                        try:
                                            hist = list(getattr(obj, 'eca_history', []) or [])
                                            hist.append({'imported_remark': _sanitize(r.get('eca_remark'))})
                                            obj.eca_history = hist
                                        except Exception:
                                            obj.eca_history = [{'imported_remark': _sanitize(r.get('eca_remark'))}]
                                except Exception:
                                    pass
                                _assign_user_field(obj, request.user, 'updatedby')
                                obj.save()
                                if created: counts["created"] += 1; add_log(i, "created", "Created", dr.doc_rec_id)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", dr.doc_rec_id)
                        elif issubclass(self.model, StudentProfile) and sheet_norm == "studentprofile":
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                en_no = str(r.get("enrollment_no", "")).strip()
                                if not en_no:
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing enrollment_no"); continue
                                enrollment = Enrollment.objects.filter(enrollment_no__iexact=en_no).first()
                                if not enrollment:
                                    counts["skipped"] += 1; add_log(i, "skipped", f"Enrollment {en_no} not found"); continue
                                birth_date = parse_excel_date(r.get("birth_date")) if "birth_date" in eff else None
                                fees_val = None
                                if "fees" in eff:
                                    try:
                                        raw_fees = r.get("fees")
                                        if raw_fees not in (None, ""):
                                            fees_val = float(raw_fees)
                                    except Exception:
                                        fees_val = None
                                def _to_bool(v):
                                    s = str(v).strip().lower(); return s in ("1", "true", "yes", "y", "t")
                                obj, created = StudentProfile.objects.update_or_create(
                                    enrollment=enrollment,
                                    defaults={
                                        **({"gender": r.get("gender") or None} if "gender" in eff else {}),
                                        **({"birth_date": birth_date} if birth_date and "birth_date" in eff else {}),
                                        **({"address1": r.get("address1") or None} if "address1" in eff else {}),
                                        **({"address2": r.get("address2") or None} if "address2" in eff else {}),
                                        **({"city1": r.get("city1") or None} if "city1" in eff else {}),
                                        **({"city2": r.get("city2") or None} if "city2" in eff else {}),
                                        **({"contact_no": r.get("contact_no") or None} if "contact_no" in eff else {}),
                                        **({"email": r.get("email") or None} if "email" in eff else {}),
                                        **({"fees": fees_val} if "fees" in eff else {}),
                                        **({"hostel_required": _to_bool(r.get("hostel_required"))} if "hostel_required" in eff else {}),
                                        **({"aadhar_no": r.get("aadhar_no") or None} if "aadhar_no" in eff else {}),
                                        **({"abc_id": r.get("abc_id") or None} if "abc_id" in eff else {}),
                                        **({"mobile_adhar": r.get("mobile_adhar") or None} if "mobile_adhar" in eff else {}),
                                        **({"name_adhar": r.get("name_adhar") or None} if "name_adhar" in eff else {}),
                                        **({"mother_name": r.get("mother_name") or None} if "mother_name" in eff else {}),
                                        **({"father_name": r.get("father_name") or None} if "father_name" in eff else {}),
                                        **({"category": r.get("category") or None} if "category" in eff else {}),
                                        **({"photo_uploaded": _to_bool(r.get("photo_uploaded"))} if "photo_uploaded" in eff else {}),
                                        **({"is_d2d": _to_bool(r.get("is_d2d"))} if "is_d2d" in eff else {}),
                                        **({"program_medium": r.get("program_medium") or None} if "program_medium" in eff else {}),
                                        "updated_by": request.user,
                                    }
                                )
                                if created: counts["created"] += 1; add_log(i, "created", "Created", en_no)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", en_no)
                        elif issubclass(self.model, StudentDegree) and sheet_norm in ("studentdegree", "degree"):
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                en_no = str(r.get("enrollment_no", "")).strip()
                                if not en_no:
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing enrollment_no"); continue
                                
                                last_exam_year = None
                                if "last_exam_year" in eff:
                                    try:
                                        year_val = r.get("last_exam_year")
                                        if year_val not in (None, ""):
                                            last_exam_year = int(year_val)
                                    except Exception:
                                        last_exam_year = None

                                convocation_no = None
                                if "convocation_no" in eff:
                                    try:
                                        conv_val = r.get("convocation_no")
                                        if conv_val not in (None, ""):
                                            convocation_no = int(conv_val)
                                    except Exception:
                                        convocation_no = None

                                dg_sr_no = str(r.get("dg_sr_no", "")).strip() or None

                                if dg_sr_no:
                                    obj, created = StudentDegree.objects.update_or_create(
                                        dg_sr_no=dg_sr_no,
                                        defaults={
                                            "enrollment_no": en_no,
                                            **({"student_name_dg": r.get("student_name_dg") or None} if "student_name_dg" in eff else {}),
                                            **({"dg_address": r.get("dg_address") or None} if "dg_address" in eff else {}),
                                            **({"institute_name_dg": r.get("institute_name_dg") or None} if "institute_name_dg" in eff else {}),
                                            **({"degree_name": r.get("degree_name") or None} if "degree_name" in eff else {}),
                                            **({"specialisation": r.get("specialisation") or None} if "specialisation" in eff else {}),
                                            **({"seat_last_exam": r.get("seat_last_exam") or None} if "seat_last_exam" in eff else {}),
                                            **({"last_exam_month": r.get("last_exam_month") or None} if "last_exam_month" in eff else {}),
                                            **({"last_exam_year": last_exam_year} if "last_exam_year" in eff else {}),
                                            **({"class_obtain": r.get("class_obtain") or None} if "class_obtain" in eff else {}),
                                            **({"course_language": r.get("course_language") or None} if "course_language" in eff else {}),
                                            **({"dg_rec_no": r.get("dg_rec_no") or None} if "dg_rec_no" in eff else {}),
                                            **({"dg_gender": r.get("dg_gender") or None} if "dg_gender" in eff else {}),
                                            **({"convocation_no": convocation_no} if "convocation_no" in eff else {}),
                                        }
                                    )
                                else:
                                    try:
                                        obj = StudentDegree.objects.create(
                                            enrollment_no=en_no,
                                            **({"dg_sr_no": None}),
                                            **({"student_name_dg": r.get("student_name_dg") or None} if "student_name_dg" in eff else {}),
                                            **({"dg_address": r.get("dg_address") or None} if "dg_address" in eff else {}),
                                            **({"institute_name_dg": r.get("institute_name_dg") or None} if "institute_name_dg" in eff else {}),
                                            **({"degree_name": r.get("degree_name") or None} if "degree_name" in eff else {}),
                                            **({"specialisation": r.get("specialisation") or None} if "specialisation" in eff else {}),
                                            **({"seat_last_exam": r.get("seat_last_exam") or None} if "seat_last_exam" in eff else {}),
                                            **({"last_exam_month": r.get("last_exam_month") or None} if "last_exam_month" in eff else {}),
                                            **({"last_exam_year": last_exam_year} if "last_exam_year" in eff else {}),
                                            **({"class_obtain": r.get("class_obtain") or None} if "class_obtain" in eff else {}),
                                            **({"course_language": r.get("course_language") or None} if "course_language" in eff else {}),
                                            **({"dg_rec_no": r.get("dg_rec_no") or None} if "dg_rec_no" in eff else {}),
                                            **({"dg_gender": r.get("dg_gender") or None} if "dg_gender" in eff else {}),
                                            **({"convocation_no": convocation_no} if "convocation_no" in eff else {}),
                                        )
                                        created = True
                                    except Exception as e:
                                        counts["skipped"] += 1; add_log(i, "skipped", f"Failed to create: {e}"); continue

                                if created: counts["created"] += 1; add_log(i, "created", "Created", dg_sr_no or en_no)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", dg_sr_no or en_no)
                        elif issubclass(self.model, StudentFeesLedger) and sheet_norm in ("studentfees", "student_fees", "feesledger"):
                            from decimal import Decimal, InvalidOperation

                            def _parse_amount(val):
                                try:
                                    if val in (None, ""):
                                        return None
                                    amt = Decimal(str(val)).quantize(Decimal('0.01'))
                                    if amt <= 0:
                                        return None
                                    return amt
                                except (InvalidOperation, ValueError):
                                    return None

                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                student_key = _clean_cell(
                                    r.get("enrollment_no") or r.get("temp_enroll_no")
                                )
                                enrollment_id_raw = r.get("enrollment_id") or r.get("enrollment") or r.get("enrollment_pk")
                                enrollment_id = _safe_num(enrollment_id_raw, None)
                                enrollment_id = int(enrollment_id) if enrollment_id is not None else None

                                if not student_key and not enrollment_id:
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing enrollment_no/temp_enroll_no or enrollment_id"); continue

                                enrollment = None
                                if student_key:
                                    enrollment = (
                                        Enrollment.objects.filter(enrollment_no__iexact=student_key).first()
                                        or Enrollment.objects.filter(temp_enroll_no__iexact=student_key).first()
                                    )
                                if not enrollment and enrollment_id is not None:
                                    enrollment = Enrollment.objects.filter(id=enrollment_id).first()
                                if not enrollment:
                                    display_key = student_key or str(enrollment_id)
                                    counts["skipped"] += 1; add_log(i, "skipped", f"Enrollment not found for '{display_key}'"); continue

                                receipt_no = _clean_cell(r.get("receipt_no"))
                                receipt_date_raw = r.get("receipt_date")
                                receipt_date = parse_excel_date(receipt_date_raw) if "receipt_date" in eff else None
                                if receipt_date_raw not in (None, "") and not receipt_date:
                                    counts["skipped"] += 1; add_log(i, "skipped", "Invalid receipt_date", receipt_no or student_key); continue

                                term_val = _clean_cell(r.get("term"))
                                if not term_val:
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing term", receipt_no); continue

                                amount_raw = r.get("amount")
                                try:
                                    if pd is not None and pd.isna(amount_raw):
                                        amount_raw = None
                                except Exception:
                                    pass
                                if isinstance(amount_raw, float):
                                    try:
                                        import math
                                        if math.isnan(amount_raw):
                                            amount_raw = None
                                    except Exception:
                                        pass
                                if isinstance(amount_raw, str) and amount_raw.strip().lower() in ("", "nan", "none", "<na>"):
                                    amount_raw = None
                                amount_val = _parse_amount(amount_raw) if "amount" in eff else None
                                if amount_raw not in (None, "") and amount_val is None:
                                    counts["skipped"] += 1; add_log(i, "skipped", "Invalid amount", receipt_no or student_key); continue

                                if not receipt_no and not receipt_date and amount_val is None:
                                    counts["skipped"] += 1; continue

                                remark_val = _clean_cell(r.get("remark")) if "remark" in eff else None

                                if receipt_no:
                                    obj, created = StudentFeesLedger.objects.update_or_create(
                                        receipt_no=receipt_no,
                                        defaults={
                                            "enrollment": enrollment,
                                            "receipt_date": receipt_date,
                                            "term": term_val,
                                            "amount": amount_val,
                                            "remark": remark_val,
                                        }
                                    )
                                else:
                                    obj = StudentFeesLedger.objects.create(
                                        enrollment=enrollment,
                                        receipt_no=None,
                                        receipt_date=receipt_date,
                                        term=term_val,
                                        amount=amount_val,
                                        remark=remark_val,
                                    )
                                    created = True
                                try:
                                    if created and getattr(obj, 'created_by', None) != request.user:
                                        _assign_user_field(obj, request.user, 'created_by')
                                        obj.save(update_fields=['created_by'])
                                    elif not created and getattr(obj, 'created_by', None) is None:
                                        _assign_user_field(obj, request.user, 'created_by')
                                        obj.save(update_fields=['created_by'])
                                except Exception:
                                    pass

                                ref_key = receipt_no or student_key
                                if created: counts["created"] += 1; add_log(i, "created", "Created", ref_key)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", ref_key)
                        else:
                            return JsonResponse({"error": "Sheet name does not match expected for this model."}, status=400)
                    except Exception as e:
                        return JsonResponse({"error": f"Import error: {e}"}, status=500)
                    log_xlsx_b64 = None
                    log_name = None
                    failed_rows = []
                    try:
                        for entry in log:
                            if entry.get('status') and str(entry.get('status')).lower() == 'skipped':
                                try:
                                    row_no = int(entry.get('row') or 0)
                                except Exception:
                                    row_no = 0
                                idx = row_no - 2
                                if idx >= 0 and df is not None and idx < len(df.index):
                                    row_series = df.iloc[idx]
                                    row_data = {str(c): (row_series.get(c) if c in row_series.index else None) for c in df.columns}
                                else:
                                    row_data = {}
                                row_data['error'] = entry.get('message')
                                failed_rows.append(row_data)
                    except Exception:
                        failed_rows = []

                    summary_df = None
                    error_df = None
                    if pd is not None:
                        try:
                            summary_df = pd.DataFrame([{'total': (len(df.index) if df is not None else 0), 'created': counts.get('created',0), 'updated': counts.get('updated',0), 'skipped': counts.get('skipped',0)}])
                            if failed_rows:
                                error_df = pd.DataFrame(failed_rows)
                            bio = BytesIO()
                            with pd.ExcelWriter(bio, engine='openpyxl') as writer:
                                summary_df.to_excel(writer, index=False, sheet_name='Summary')
                                if error_df is not None:
                                    error_df.to_excel(writer, index=False, sheet_name='Errors')
                            bio.seek(0)
                            log_xlsx_b64 = base64.b64encode(bio.read()).decode('utf-8')
                            log_name = f"import_log_{sheet_norm}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
                        except Exception:
                            log_xlsx_b64 = None

                    if "excel_data" in request.session:
                        del request.session["excel_data"]
                    resp = {"success": True, "counts": counts, "log": log, "total_rows": (len(df.index) if df is not None else 0)}
                    if log_xlsx_b64:
                        resp['log_xlsx'] = log_xlsx_b64
                        resp['log_name'] = log_name
                    return JsonResponse(resp)

                return JsonResponse({"error": "Unknown action"}, status=400)
            except Exception as e:
                return JsonResponse({"error": f"Unhandled error: {e}"}, status=500)
        elif request.method == "POST":
            return JsonResponse({"error": "Invalid POST. Expected AJAX with X-Requested-With header."}, status=400)

        return render(request, self.upload_template, {
            "title": f"Upload Excel for {self.model._meta.verbose_name}",
            "download_url": reverse(f"admin:{self.model._meta.app_label}_{self.model._meta.model_name}_download_template"),
        })


