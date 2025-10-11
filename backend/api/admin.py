from django.contrib import admin
from .domain_emp import EmpProfile, LeaveType, LeaveEntry, LeavePeriod, LeaveAllocation
from .domain_emp import LeaveBalanceSnapshot

@admin.register(EmpProfile)
class EmpProfileAdmin(admin.ModelAdmin):
    list_display = ('emp_id', 'emp_name', 'emp_designation', 'status', 'userid', 'el_balance', 'sl_balance', 'cl_balance', 'vacation_balance')
    search_fields = ('emp_id', 'emp_name', 'userid')
    list_filter = ('status', 'leave_group', 'department_joining', 'institute_id')
    # allow inline management of allocations and leave entries from the employee page
    # Inlines are defined later and injected here via ModelAdmin.inlines assignment below.

@admin.register(LeaveType)
class LeaveTypeAdmin(admin.ModelAdmin):
    list_display = ('leave_code', 'leave_name', 'main_type', 'annual_allocation', 'is_half', 'is_active')
    search_fields = ('leave_code', 'leave_name')
    list_filter = ('main_type', 'is_active')

@admin.register(LeaveEntry)
class LeaveEntryAdmin(admin.ModelAdmin):
    list_display = ('leave_report_no', 'emp', 'leave_type', 'start_date', 'end_date', 'total_days', 'status', 'created_by', 'approved_by')
    search_fields = ('leave_report_no', 'emp__emp_name', 'leave_type__leave_name')
    list_filter = ('status', 'leave_type', 'emp')


@admin.register(LeavePeriod)
class LeavePeriodAdmin(admin.ModelAdmin):
    list_display = ('period_name', 'start_date', 'end_date', 'is_active')
    search_fields = ('period_name',)
    list_filter = ('is_active',)


@admin.register(LeaveAllocation)
class LeaveAllocationAdmin(admin.ModelAdmin):
    list_display = ('profile', 'leave_type', 'period', 'allocated')
    search_fields = ('profile__emp_name', 'leave_type__leave_name')
    list_filter = ('period', 'leave_type')


@admin.register(LeaveBalanceSnapshot)
class LeaveBalanceSnapshotAdmin(admin.ModelAdmin):
    list_display = ('profile', 'balance_date', 'el_balance', 'sl_balance', 'cl_balance', 'vacation_balance')
    search_fields = ('profile__emp_id', 'profile__emp_name')
    list_filter = ('balance_date',)


# Inline admin registrations so allocations and leave entries can be edited on EmpProfile page
from .domain_emp import LeaveEntry, LeaveAllocation


class LeaveAllocationInline(admin.TabularInline):
    model = LeaveAllocation
    extra = 0
    fields = ('leave_type', 'period', 'allocated')
    readonly_fields = ()


class LeaveEntryInline(admin.TabularInline):
    model = LeaveEntry
    extra = 0
    fields = ('leave_report_no', 'leave_type', 'start_date', 'end_date', 'total_days', 'status')
    readonly_fields = ('leave_report_no', 'total_days')


# Attach inlines to EmpProfileAdmin (ensure tuple concatenation)
EmpProfileAdmin.inlines = getattr(EmpProfileAdmin, 'inlines', ()) + (LeaveAllocationInline, LeaveEntryInline)
"""
File: backend/api/admin.py
Purpose: Django admin registrations + reusable AJAX Excel import logic.

Notes:
 - This file was de-duplicated and cleaned (multiple earlier duplicate @admin.register
     sections removed). Only one registration per model now.
 - Business logic unchanged; only structural / cosmetic cleanup for maintainability.
 - ExcelUploadMixin provides secure, whitelisted bulk import (AJAX only).
 - Further refactors (splitting per-domain admin modules) can be done in a later phase
     without breaking current imports.
"""

import base64
from io import BytesIO
from datetime import datetime, date, timedelta
from typing import Any, Dict, List

from django.contrib import admin, messages
from django.contrib.auth import get_user_model
from django.http import JsonResponse, HttpResponse
from django.shortcuts import render
from django.urls import path, reverse
from django.views.decorators.csrf import csrf_exempt

try:  # Optional pandas (Excel support)
    import pandas as pd  # type: ignore
except Exception:  # pragma: no cover
    pd = None  # type: ignore

from .models import (
    MainBranch, SubBranch, Module, Menu, UserPermission, Institute, Enrollment,
    DocRec, PayPrefixRule, Eca, InstVerificationMain, InstVerificationStudent,
    MigrationRecord, ProvisionalRecord, StudentProfile, Verification
)

User = get_user_model()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sanitize(v: Any) -> str:
    if v is None:
        return ""
    return str(v).replace("\r", " ").replace("\n", " ")

def parse_excel_date(val: Any):  # Robust NaT/variant-safe parser (kept lightweight)
    """Parse diverse Excel/CSV cell date values into a python date.

    Handles:
      - pandas.Timestamp (tz-aware or naive)
      - pandas.NaT or other NA markers => None
      - Excel serial numbers (>25000 heuristic)
      - Common string formats (Y-m-d, d-m-Y, d/m/Y, Y/m/d)
      - datetime / date objects
    Guaranteed to return either a date instance or None (never pandas NaT), preventing
    downstream Django DateField assignment errors like 'NaTType does not support utcoffset'.
    """
    if val is None:
        return None
    # Fast-path for already-correct types
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    if isinstance(val, datetime):
        # Strip tz if present then take .date()
        if getattr(val, 'tzinfo', None) is not None:
            try:
                val = val.replace(tzinfo=None)
            except Exception:
                pass
        return val.date()

    # Optional pandas handling
    try:  # pragma: no cover (environment conditional)
        import pandas as pd  # type: ignore
    except Exception:  # pragma: no cover
        pd = None  # type: ignore

    if pd is not None:
        try:
            if pd.isna(val):  # Covers NaTType, numpy.nan, <NA>
                return None
        except Exception:
            pass
        # pandas.Timestamp
        if isinstance(val, pd.Timestamp):  # type: ignore[attr-defined]
            try:
                py_dt = val.to_pydatetime()
                if getattr(py_dt, 'tzinfo', None) is not None:
                    py_dt = py_dt.replace(tzinfo=None)
                return py_dt.date()
            except Exception:
                return None

    # Excel serial number (rough heuristic) - only if numeric and large enough
    if isinstance(val, (int, float)):
        try:
            if val > 25000:  # ~1958-07-22 onward
                origin = datetime(1899, 12, 30)
                return (origin + timedelta(days=int(val))).date()
        except Exception:
            pass

    # Text normalization & sentinel markers
    sval = str(val).strip()
    if sval.lower() in ("nat", "nan", "null", "none", "<na>") or sval == "":
        return None

    # Try common explicit formats (day-first and year-first variants)
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%m/%d/%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(sval, fmt).date()
        except Exception:
            continue
    return None

# ---------------------------------------------------------------------------
# Import spec (whitelist + required keys)
# ---------------------------------------------------------------------------

def get_import_spec(model) -> Dict[str, Any]:
    specs: Dict[type, Dict[str, Any]] = {
        MainBranch: {"allowed_columns": ["maincourse_id", "course_code", "course_name"], "required_keys": ["maincourse_id"], "create_requires": ["maincourse_id"]},
        SubBranch: {"allowed_columns": ["subcourse_id", "subcourse_name", "maincourse_id"], "required_keys": ["subcourse_id", "maincourse_id"], "create_requires": ["subcourse_id", "maincourse_id"]},
        Institute: {"allowed_columns": ["institute_id", "institute_code", "institute_name", "institute_campus", "institute_address", "institute_city"], "required_keys": ["institute_id"], "create_requires": ["institute_id", "institute_code"]},
        Enrollment: {"allowed_columns": ["enrollment_no", "student_name", "batch", "institute_id", "subcourse_id", "maincourse_id", "temp_enroll_no", "enrollment_date", "admission_date"], "required_keys": ["enrollment_no"], "create_requires": ["enrollment_no", "student_name", "batch", "institute_id", "subcourse_id", "maincourse_id"]},
        StudentProfile: {"allowed_columns": ["enrollment_no", "gender", "birth_date", "address1", "address2", "city1", "city2", "contact_no", "email", "fees", "hostel_required", "aadhar_no", "abc_id", "mobile_adhar", "name_adhar", "mother_name", "category", "photo_uploaded", "is_d2d", "program_medium"], "required_keys": ["enrollment_no"], "create_requires": ["enrollment_no"]},
        DocRec: {"allowed_columns": ["apply_for", "doc_rec_id", "pay_by", "pay_rec_no_pre", "pay_rec_no", "pay_amount", "doc_rec_date"], "required_keys": ["apply_for", "doc_rec_id", "pay_by"], "create_requires": ["apply_for", "doc_rec_id", "pay_by"]},
        MigrationRecord: {"allowed_columns": ["doc_rec_id", "enrollment_no", "student_name", "institute_id", "maincourse_id", "subcourse_id", "mg_number", "mg_date", "exam_year", "admission_year", "exam_details", "mg_status", "pay_rec_no"], "required_keys": ["doc_rec_id"], "create_requires": ["doc_rec_id"]},
        ProvisionalRecord: {"allowed_columns": ["doc_rec_id", "enrollment_no", "student_name", "institute_id", "maincourse_id", "subcourse_id", "prv_number", "prv_date", "class_obtain", "passing_year", "prv_status", "pay_rec_no"], "required_keys": ["doc_rec_id"], "create_requires": ["doc_rec_id"]},
        Verification: {"allowed_columns": ["doc_rec_id", "date", "enrollment_no", "second_enrollment_no", "student_name", "no_of_transcript", "no_of_marksheet", "no_of_degree", "no_of_moi", "no_of_backlog", "status", "final_no", "pay_rec_no"], "required_keys": ["doc_rec_id"], "create_requires": ["doc_rec_id"]},
    }
    for klass, spec in specs.items():
        if issubclass(model, klass):
            return spec
    return {"allowed_columns": [], "required_keys": [], "create_requires": []}

# ---------------------------------------------------------------------------
# AJAX Excel Upload Mixin
# ---------------------------------------------------------------------------

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
                # ---- init ----
                if action == "init":
                    up = request.FILES.get("file")
                    if not up:
                        return JsonResponse({"error": "No file uploaded"}, status=400)
                    # Basic guards (size + extension)
                    MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20MB
                    if up.size > MAX_UPLOAD_BYTES:
                        return JsonResponse({"error": f"File too large (> {MAX_UPLOAD_BYTES // (1024*1024)}MB)"}, status=413)
                    allowed_ext = {".xlsx", ".xls"}
                    ext = ("." + up.name.rsplit(".", 1)[-1].lower()) if "." in up.name else ""
                    if ext not in allowed_ext:
                        return JsonResponse({"error": "Unsupported file type. Use .xlsx or .xls"}, status=415)
                    request.session["excel_data"] = base64.b64encode(up.read()).decode("utf-8")
                    up.seek(0)
                    try:
                        sheets = list(pd.read_excel(up, sheet_name=None, nrows=0).keys())
                    except Exception as e:
                        return JsonResponse({"error": f"Read error: {e}"}, status=400)
                    return JsonResponse({"sheets": sheets})

                # ---- columns ----
                if action == "columns":
                    sheet = request.POST.get("sheet")
                    encoded = request.session.get("excel_data")
                    if not encoded:
                        return JsonResponse({"error": "Session expired"}, status=400)
                    try:
                        frames = pd.read_excel(BytesIO(base64.b64decode(encoded)), sheet_name=None, nrows=0)
                    except Exception as e:
                        return JsonResponse({"error": f"Read error: {e}"}, status=400)
                    if sheet not in frames:
                        return JsonResponse({"error": "Sheet not found"}, status=404)
                    spec = get_import_spec(self.model)
                    allowed = set(spec["allowed_columns"])
                    required_keys = spec["required_keys"]
                    cols_present = [str(c).strip() for c in frames[sheet].columns]
                    usable = [c for c in cols_present if c in allowed]
                    unrecognized = [c for c in cols_present if c not in allowed]
                    required_missing = [rk for rk in required_keys if rk not in cols_present]
                    return JsonResponse({
                        "columns": usable,
                        "unrecognized": unrecognized,
                        "required_keys": required_keys,
                        "required_missing": required_missing,
                    })

                # ---- preview ----
                if action == "preview":
                    sheet = request.POST.get("sheet")
                    selected = request.POST.getlist("columns[]")
                    if not selected:
                        return JsonResponse({"error": "Select at least one column"}, status=400)
                    encoded = request.session.get("excel_data")
                    if not encoded:
                        return JsonResponse({"error": "Session expired"}, status=400)
                    try:
                        frames = pd.read_excel(BytesIO(base64.b64decode(encoded)), sheet_name=None)
                    except Exception as e:
                        return JsonResponse({"error": f"Read error: {e}"}, status=400)
                    if sheet not in frames:
                        return JsonResponse({"error": "Sheet not found"}, status=404)
                    df = frames[sheet]
                    total = len(df.index)
                    preview_df = df[selected].head(50).fillna("")
                    rows = [list(map(_sanitize, r)) for r in preview_df.values.tolist()]
                    return JsonResponse({
                        "columns": selected,
                        "rows": rows,
                        "preview_rows": len(rows),
                        "total_rows": total,
                    })

                # ---- commit ----
                if action == "commit":
                    sheet = request.POST.get("sheet")
                    selected = request.POST.getlist("columns[]")
                    if not selected:
                        return JsonResponse({"error": "No columns selected"}, status=400)
                    encoded = request.session.get("excel_data")
                    if not encoded:
                        return JsonResponse({"error": "Session expired"}, status=400)
                    try:
                        frames = pd.read_excel(BytesIO(base64.b64decode(encoded)), sheet_name=None)
                    except Exception as e:
                        return JsonResponse({"error": f"Read error: {e}"}, status=400)
                    if sheet not in frames:
                        return JsonResponse({"error": "Sheet not found"}, status=404)
                    spec = get_import_spec(self.model)
                    allowed = set(spec["allowed_columns"])
                    required = set(spec["required_keys"])
                    chosen = [c for c in selected if c in allowed]
                    if not required.issubset(chosen):
                        return JsonResponse({"error": "All required columns must be selected"}, status=400)
                    df = frames[sheet].fillna("")
                    # Vectorized date normalization to plain date objects (prevents NaTType tz issues)
                    if pd is not None:
                        def _normalize(col_names):
                            for c in col_names:
                                if c in df.columns:
                                    try:
                                        df[c] = pd.to_datetime(df[c], errors='coerce', dayfirst=True).dt.date
                                    except Exception:
                                        pass
                        # sheet_norm not yet defined here; derive directly
                        sheet_lc = (sheet or "").lower().replace(" ", "")
                        # Generic date columns across sheets
                        _normalize(["doc_rec_date","date","birth_date"])  # safe no-op if absent
                        if sheet_lc == "enrollment":
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
                                iid = r.get("institute_id")
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
                        elif issubclass(self.model, Enrollment) and sheet_norm == "enrollment":
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                try:
                                    en = str(r.get("enrollment_no") or "").strip()
                                    if not en:
                                        counts["skipped"] += 1; add_log(i, "skipped", "Missing enrollment_no"); continue
                                    inst = Institute.objects.filter(institute_id=r.get("institute_id")).first() if "institute_id" in eff else None
                                    sub = SubBranch.objects.filter(subcourse_id=r.get("subcourse_id")).first() if "subcourse_id" in eff else None
                                    main = MainBranch.objects.filter(maincourse_id=r.get("maincourse_id")).first() if "maincourse_id" in eff else None
                                    if ("institute_id" in eff and not inst) or ("subcourse_id" in eff and not sub) or ("maincourse_id" in eff and not main):
                                        counts["skipped"] += 1; add_log(i, "skipped", "Related FK missing"); continue
                                    # Parse dates robustly; skip problematic conversions (NaTType etc.)
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
                                    enroll_dt = _safe_date(r.get("enrollment_date")) if "enrollment_date" in eff else None
                                    adm_dt = _safe_date(r.get("admission_date")) if "admission_date" in eff else None
                                    obj, created = Enrollment.objects.update_or_create(
                                        enrollment_no=en,
                                        defaults={
                                            **({"student_name": r.get("student_name")} if "student_name" in eff else {}),
                                            **({"batch": r.get("batch")} if "batch" in eff else {}),
                                            **({"institute": inst} if inst and "institute_id" in eff else {}),
                                            **({"subcourse": sub} if sub and "subcourse_id" in eff else {}),
                                            **({"maincourse": main} if main and "maincourse_id" in eff else {}),
                                            **({"temp_enroll_no": r.get("temp_enroll_no")} if "temp_enroll_no" in eff else {}),
                                            **({"enrollment_date": enroll_dt} if enroll_dt and "enrollment_date" in eff else {}),
                                            **({"admission_date": adm_dt} if adm_dt and "admission_date" in eff else {}),
                                            "updated_by": request.user,
                                        }
                                    )
                                    if created: counts["created"] += 1; add_log(i, "created", "Created", en)
                                    else: counts["updated"] += 1; add_log(i, "updated", "Updated", en)
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
                                                    **({"institute": inst} if 'inst' in locals() and inst and "institute_id" in eff else {}),
                                                    **({"subcourse": sub} if 'sub' in locals() and sub and "subcourse_id" in eff else {}),
                                                    **({"maincourse": main} if 'main' in locals() and main and "maincourse_id" in eff else {}),
                                                    **({"temp_enroll_no": r.get("temp_enroll_no")} if "temp_enroll_no" in eff else {}),
                                                    # intentionally omit enrollment_date / admission_date
                                                    "updated_by": request.user,
                                                }
                                            )
                                            if created: counts["created"] += 1; add_log(i, "created", "Recovered without dates", r.get("enrollment_no"))
                                            else: counts["updated"] += 1; add_log(i, "updated", "Recovered without dates", r.get("enrollment_no"))
                                            continue
                                        except Exception as recover_err:
                                            counts["skipped"] += 1; add_log(i, "skipped", f"Row error: {recover_err}", str(r.get("enrollment_no") or '').strip()); continue
                                    counts["skipped"] += 1; add_log(i, "skipped", f"Row error: {row_err}", str(r.get("enrollment_no") or '').strip())
                                    continue
                        elif issubclass(self.model, DocRec) and sheet_norm in ("docrec", "doc_rec"):
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                apply_for = str(r.get("apply_for") or "").strip().upper()
                                pay_by = str(r.get("pay_by") or "").strip().upper()
                                doc_rec_id = str(r.get("doc_rec_id") or "").strip()
                                if not (apply_for and pay_by and doc_rec_id):
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing apply_for/pay_by/doc_rec_id"); continue
                                pay_rec_no_pre = str(r.get("pay_rec_no_pre") or "").strip()
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
                                obj, created = DocRec.objects.get_or_create(
                                    doc_rec_id=doc_rec_id,
                                    defaults={
                                        **({"apply_for": apply_for} if "apply_for" in eff else {}),
                                        **({"pay_by": pay_by} if "pay_by" in eff else {}),
                                        **({"pay_rec_no_pre": pay_rec_no_pre} if "pay_rec_no_pre" in eff else {}),
                                        **({"pay_rec_no": pay_rec_no} if "pay_rec_no" in eff else {}),
                                        **({"pay_amount": pay_amount or 0} if "pay_amount" in eff else {}),
                                        **({"doc_rec_date": doc_date} if doc_date and "doc_rec_date" in eff else {}),
                                        "created_by": request.user,
                                    }
                                )
                                if not created:
                                    if "apply_for" in eff: obj.apply_for = apply_for
                                    if "pay_by" in eff: obj.pay_by = pay_by
                                    if "pay_rec_no_pre" in eff: obj.pay_rec_no_pre = pay_rec_no_pre
                                    if "pay_rec_no" in eff: obj.pay_rec_no = pay_rec_no
                                    if "pay_amount" in eff: obj.pay_amount = pay_amount or 0
                                    if "doc_rec_date" in eff and doc_date: obj.doc_rec_date = doc_date
                                    obj.save()
                                if created: counts["created"] += 1; add_log(i, "created", "Created", doc_rec_id)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", doc_rec_id)
                        elif issubclass(self.model, MigrationRecord) and sheet_norm == "migration":
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                dr = DocRec.objects.filter(doc_rec_id=str(r.get("doc_rec_id")).strip()).first()
                                if not dr:
                                    counts["skipped"] += 1; add_log(i, "skipped", "doc_rec_id not found"); continue
                                enr = Enrollment.objects.filter(enrollment_no=str(r.get("enrollment_no")).strip()).first() if "enrollment_no" in eff else None
                                inst = Institute.objects.filter(institute_id=r.get("institute_id")).first() if "institute_id" in eff else None
                                main = MainBranch.objects.filter(maincourse_id=r.get("maincourse_id")).first() if "maincourse_id" in eff else None
                                sub = SubBranch.objects.filter(subcourse_id=r.get("subcourse_id")).first() if "subcourse_id" in eff else None
                                mg_date = parse_excel_date(r.get("mg_date")) if "mg_date" in eff else None
                                if "mg_date" in eff and not mg_date:  # required non-null
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing mg_date"); continue
                                obj, created = MigrationRecord.objects.get_or_create(doc_rec=dr, defaults={})
                                if "enrollment_no" in eff: obj.enrollment = enr
                                if "student_name" in eff: obj.student_name = r.get("student_name") or (enr.student_name if enr else getattr(obj, 'student_name', ''))
                                if "institute_id" in eff: obj.institute = inst
                                if "maincourse_id" in eff: obj.maincourse = main
                                if "subcourse_id" in eff: obj.subcourse = sub
                                if "mg_number" in eff: obj.mg_number = str(r.get("mg_number") or "").strip()
                                if "mg_date" in eff and mg_date: obj.mg_date = mg_date
                                if "exam_year" in eff: obj.exam_year = r.get("exam_year")
                                if "admission_year" in eff: obj.admission_year = r.get("admission_year")
                                if "exam_details" in eff: obj.exam_details = r.get("exam_details")
                                if "mg_status" in eff: obj.mg_status = r.get("mg_status") or getattr(obj, 'mg_status', None)
                                if "pay_rec_no" in eff: obj.pay_rec_no = r.get("pay_rec_no") or (dr.pay_rec_no if dr else getattr(obj, 'pay_rec_no', ''))
                                if not obj.created_by: obj.created_by = request.user
                                obj.save()
                                if created: counts["created"] += 1; add_log(i, "created", "Created", dr.doc_rec_id)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", dr.doc_rec_id)
                        elif issubclass(self.model, ProvisionalRecord) and sheet_norm == "provisional":
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                dr = DocRec.objects.filter(doc_rec_id=str(r.get("doc_rec_id")).strip()).first()
                                if not dr:
                                    counts["skipped"] += 1; add_log(i, "skipped", "doc_rec_id not found"); continue
                                enr = Enrollment.objects.filter(enrollment_no=str(r.get("enrollment_no")).strip()).first() if "enrollment_no" in eff else None
                                inst = Institute.objects.filter(institute_id=r.get("institute_id")).first() if "institute_id" in eff else None
                                main = MainBranch.objects.filter(maincourse_id=r.get("maincourse_id")).first() if "maincourse_id" in eff else None
                                sub = SubBranch.objects.filter(subcourse_id=r.get("subcourse_id")).first() if "subcourse_id" in eff else None
                                prv_date = parse_excel_date(r.get("prv_date")) if "prv_date" in eff else None
                                if "prv_date" in eff and not prv_date:  # required non-null
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing prv_date"); continue
                                obj, created = ProvisionalRecord.objects.get_or_create(doc_rec=dr, defaults={})
                                if "enrollment_no" in eff: obj.enrollment = enr
                                if "student_name" in eff: obj.student_name = r.get("student_name") or (enr.student_name if enr else getattr(obj, 'student_name', ''))
                                if "institute_id" in eff: obj.institute = inst
                                if "maincourse_id" in eff: obj.maincourse = main
                                if "subcourse_id" in eff: obj.subcourse = sub
                                if "prv_number" in eff: obj.prv_number = str(r.get("prv_number") or "").strip()
                                if "prv_date" in eff and prv_date: obj.prv_date = prv_date
                                if "class_obtain" in eff: obj.class_obtain = r.get("class_obtain")
                                if "passing_year" in eff: obj.passing_year = r.get("passing_year")
                                if "prv_status" in eff: obj.prv_status = r.get("prv_status") or getattr(obj, 'prv_status', None)
                                if "pay_rec_no" in eff: obj.pay_rec_no = r.get("pay_rec_no") or (dr.pay_rec_no if dr else getattr(obj, 'pay_rec_no', ''))
                                if not obj.created_by: obj.created_by = request.user
                                obj.save()
                                if created: counts["created"] += 1; add_log(i, "created", "Created", dr.doc_rec_id)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", dr.doc_rec_id)
                        elif issubclass(self.model, Verification) and sheet_norm == "verification":
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                dr = DocRec.objects.filter(doc_rec_id=str(r.get("doc_rec_id")).strip()).first()
                                if not dr:
                                    counts["skipped"] += 1; add_log(i, "skipped", "doc_rec_id not found"); continue
                                enr = Enrollment.objects.filter(enrollment_no=str(r.get("enrollment_no")).strip()).first() if "enrollment_no" in eff else None
                                senr = Enrollment.objects.filter(enrollment_no=str(r.get("second_enrollment_no")).strip()).first() if "second_enrollment_no" in eff and str(r.get("second_enrollment_no") or '').strip() else None
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
                                if "status" in eff: obj.status = r.get("status") or getattr(obj, 'status', None)
                                if "final_no" in eff: obj.final_no = (str(r.get("final_no")).strip() or obj.final_no)
                                if "pay_rec_no" in eff: obj.pay_rec_no = r.get("pay_rec_no") or (dr.pay_rec_no if dr else getattr(obj, 'pay_rec_no', ''))
                                obj.updatedby = request.user
                                obj.save()
                                if created: counts["created"] += 1; add_log(i, "created", "Created", dr.doc_rec_id)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", dr.doc_rec_id)
                        elif issubclass(self.model, StudentProfile) and sheet_norm == "studentprofile":
                            for i, (_, r) in enumerate(df.iterrows(), start=2):
                                en_no = str(r.get("enrollment_no", "")).strip()
                                if not en_no:
                                    counts["skipped"] += 1; add_log(i, "skipped", "Missing enrollment_no"); continue
                                enrollment = Enrollment.objects.filter(enrollment_no=en_no).first()
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
                                        **({"category": r.get("category") or None} if "category" in eff else {}),
                                        **({"photo_uploaded": _to_bool(r.get("photo_uploaded"))} if "photo_uploaded" in eff else {}),
                                        **({"is_d2d": _to_bool(r.get("is_d2d"))} if "is_d2d" in eff else {}),
                                        **({"program_medium": r.get("program_medium") or None} if "program_medium" in eff else {}),
                                        "updated_by": request.user,
                                    }
                                )
                                if created: counts["created"] += 1; add_log(i, "created", "Created", en_no)
                                else: counts["updated"] += 1; add_log(i, "updated", "Updated", en_no)
                        else:
                            return JsonResponse({"error": "Sheet name does not match expected for this model."}, status=400)
                    except Exception as e:
                        return JsonResponse({"error": f"Import error: {e}"}, status=500)
                    if "excel_data" in request.session:
                        del request.session["excel_data"]
                    return JsonResponse({"success": True, "counts": counts, "log": log})

                return JsonResponse({"error": "Unknown action"}, status=400)
            except Exception as e:
                return JsonResponse({"error": f"Unhandled error: {e}"}, status=500)
        elif request.method == "POST":
            # Non-AJAX POST (likely missing X-Requested-With header) -> clarify error instead of rendering HTML
            return JsonResponse({"error": "Invalid POST. Expected AJAX with X-Requested-With header."}, status=400)

        return render(request, self.upload_template, {
            "title": f"Upload Excel for {self.model._meta.verbose_name}",
            "download_url": reverse(f"admin:{self.model._meta.app_label}_{self.model._meta.model_name}_download_template"),
        })

# ---------------------------------------------------------------------------
# Common Admin Mixin (adds upload link)
# ---------------------------------------------------------------------------

class CommonAdminMixin(ExcelUploadMixin, admin.ModelAdmin):
    """Adds reusable change templates + Excel upload link (if pandas installed)."""
    change_list_template = "subbranch/reusable_change_list.html"
    change_form_template = "subbranch/reusable_change_form.html"

    def add_view(self, request, form_url='', extra_context=None):  # type: ignore[override]
        extra_context = extra_context or {}
        if pd:
            try:
                extra_context["upload_excel_url"] = reverse(
                    f"admin:{self.model._meta.app_label}_{self.model._meta.model_name}_upload_excel"
                )
            except Exception:
                extra_context["upload_excel_url"] = "../upload-excel/"
        return super().add_view(request, form_url, extra_context=extra_context)

    def changelist_view(self, request, extra_context=None):  # type: ignore[override]
        extra_context = extra_context or {}
        if pd:
            extra_context["upload_excel_url"] = reverse(
                f"admin:{self.model._meta.app_label}_{self.model._meta.model_name}_upload_excel"
            )
        return super().changelist_view(request, extra_context=extra_context)

# ---------------------------------------------------------------------------
# Registrations
# ---------------------------------------------------------------------------

@admin.register(DocRec)
class DocRecAdmin(CommonAdminMixin):
    list_display = ("id", "apply_for", "doc_rec_id", "pay_by", "pay_rec_no_pre", "pay_rec_no", "pay_amount", "createdat")
    list_filter = ("apply_for", "pay_by", "createdat")
    search_fields = ("doc_rec_id", "pay_rec_no", "pay_rec_no_pre")
    readonly_fields = ("doc_rec_id", "pay_rec_no_pre", "createdat", "updatedat")

@admin.register(PayPrefixRule)
class PayPrefixRuleAdmin(admin.ModelAdmin):
    list_display = ("id", "pay_by", "year_full", "pattern", "is_active", "priority", "createdat", "updatedat")
    list_filter = ("pay_by", "year_full", "is_active")
    search_fields = ("pattern",)
    ordering = ("-is_active", "pay_by", "-year_full", "-priority", "-id")

@admin.register(Eca)
class EcaAdmin(admin.ModelAdmin):
    list_display = ("id", "doc_rec", "eca_name", "eca_ref_no", "eca_send_date", "created_by", "createdat")
    list_filter = ("eca_send_date", "created_by", "createdat")
    search_fields = ("eca_name", "eca_ref_no", "doc_rec__doc_rec_id")
    autocomplete_fields = ("doc_rec", "created_by")
    readonly_fields = ("createdat", "updatedat")
    def save_model(self, request, obj, form, change):  # type: ignore[override]
        if not change and not obj.created_by:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)

@admin.register(InstVerificationMain)
class InstVerificationMainAdmin(admin.ModelAdmin):
    list_display = ("id", "doc_rec", "inst_veri_number", "inst_veri_date", "institute", "rec_inst_city")
    list_filter = ("inst_veri_date", "institute")

@admin.register(MigrationRecord)
class MigrationRecordAdmin(admin.ModelAdmin):
    list_display = ("id", "mg_number", "mg_date", "student_name", "enrollment", "institute", "maincourse", "subcourse", "mg_status", "doc_rec", "pay_rec_no", "created_by", "created_at")
    list_filter = ("mg_status", "mg_date", "institute")
    search_fields = ("mg_number", "student_name", "enrollment__enrollment_no", "doc_rec__doc_rec_id")
    autocomplete_fields = ("doc_rec", "enrollment", "institute", "maincourse", "subcourse", "created_by")
    readonly_fields = ("created_at", "updated_at")
    def save_model(self, request, obj, form, change):  # type: ignore[override]
        if not change and not obj.created_by:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)

@admin.register(ProvisionalRecord)
class ProvisionalRecordAdmin(admin.ModelAdmin):
    list_display = ("id", "prv_number", "prv_date", "student_name", "enrollment", "institute", "maincourse", "subcourse", "prv_status", "doc_rec", "pay_rec_no", "created_by", "created_at")
    list_filter = ("prv_status", "prv_date", "institute")
    search_fields = ("prv_number", "student_name", "enrollment__enrollment_no", "doc_rec__doc_rec_id")
    autocomplete_fields = ("doc_rec", "enrollment", "institute", "maincourse", "subcourse", "created_by")
    readonly_fields = ("created_at", "updated_at")
    def save_model(self, request, obj, form, change):  # type: ignore[override]
        if not change and not obj.created_by:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)

@admin.register(MainBranch)
class MainBranchAdmin(CommonAdminMixin):
    list_display = ("id", "maincourse_id", "course_code", "course_name", "created_at", "updated_at")
    search_fields = ("maincourse_id", "course_name", "course_code")
    list_filter = ("created_at", "updated_at")
    readonly_fields = ("created_at", "updated_at")

@admin.register(SubBranch)
class SubBranchAdmin(CommonAdminMixin):
    list_display = ("id", "subcourse_id", "subcourse_name", "maincourse", "created_at", "updated_at")
    search_fields = ("subcourse_id", "subcourse_name", "maincourse__course_name")
    list_filter = ("maincourse", "created_at", "updated_at")
    readonly_fields = ("created_at", "updated_at")
    autocomplete_fields = ("maincourse",)

@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ('moduleid', 'name', 'created_at', 'updated_at', 'updated_by')
    search_fields = ('name__icontains',)
    list_filter = ('created_at', 'updated_at')
    readonly_fields = ('created_at', 'updated_at')

@admin.register(Menu)
class MenuAdmin(admin.ModelAdmin):
    list_display = ('menuid', 'name', 'module', 'created_at', 'updated_at', 'updated_by')
    search_fields = ('name__icontains',)
    list_filter = ('module', 'created_at')
    readonly_fields = ('created_at', 'updated_at')
    autocomplete_fields = ('module',)

@admin.register(UserPermission)
class UserPermissionAdmin(admin.ModelAdmin):
    list_display = ('permitid', 'user', 'module', 'menu', 'can_view', 'can_edit', 'can_delete', 'can_create', 'created_at')
    search_fields = ('user__username__icontains', 'module__name__icontains', 'menu__name__icontains')
    list_filter = ('module', 'menu', 'can_view', 'can_edit', 'can_delete', 'can_create')
    readonly_fields = ('created_at',)
    autocomplete_fields = ('user', 'module', 'menu')

@admin.register(Institute)
class InstituteAdmin(CommonAdminMixin):
    list_display = ("institute_id", "institute_code", "institute_name", "institute_campus", "institute_address", "institute_city", "created_at", "updated_at", "updated_by")
    search_fields = ("institute_code", "institute_name", "institute_campus", "institute_city")
    list_filter = ("created_at", "updated_at", "institute_campus", "institute_city")
    readonly_fields = ("created_at", "updated_at")

@admin.register(Enrollment)
class EnrollmentAdmin(CommonAdminMixin):
    list_display = ("student_name", "institute", "batch", "subcourse", "maincourse", "enrollment_no", "temp_enroll_no", "enrollment_date", "admission_date", "created_at", "updated_at", "updated_by")
    search_fields = ("student_name", "enrollment_no", "temp_enroll_no")
    list_filter = ("institute", "batch", "maincourse", "subcourse", "enrollment_date", "admission_date")
    readonly_fields = ("created_at", "updated_at")
    autocomplete_fields = ("institute", "subcourse", "maincourse")

@admin.register(InstVerificationStudent)
class InstVerificationStudentAdmin(admin.ModelAdmin):
    list_display = ("id", "doc_rec", "sr_no", "enrollment", "student_name", "institute", "verification_status")
    list_filter = ("verification_status", "institute")
    search_fields = ("doc_rec__doc_rec_id", "enrollment__enrollment_no", "student_name")
    autocomplete_fields = ("doc_rec", "enrollment", "institute", "sub_course", "main_course")

@admin.register(StudentProfile)
class StudentProfileAdmin(CommonAdminMixin):
    list_display = ("id", "enrollment", "gender", "birth_date", "city1", "city2", "contact_no", "abc_id", "photo_uploaded", "is_d2d", "updated_at")
    search_fields = ("enrollment__enrollment_no", "enrollment__student_name", "abc_id", "aadhar_no", "mobile_adhar", "name_adhar", "mother_name", "category")
    list_filter = ("gender", "city1", "city2", "photo_uploaded", "is_d2d", "category")
    readonly_fields = ("created_at", "updated_at")
    autocomplete_fields = ("enrollment",)

@admin.register(Verification)
class VerificationAdmin(admin.ModelAdmin):
    list_display = ("id", "doc_rec", "date", "enrollment", "student_name", "status", "final_no")
    search_fields = ("doc_rec__doc_rec_id", "enrollment__enrollment_no", "student_name", "final_no")
    list_filter = ("status", "date")
    autocomplete_fields = ("doc_rec", "enrollment", "second_enrollment")
    readonly_fields = ("createdat", "updatedat")

    def save_model(self, request, obj, form, change):  # type: ignore[override]
        # Keep parity with other create-by patterns
        if not change and not getattr(obj, 'updatedby', None):
            try:
                obj.updatedby = request.user  # type: ignore[attr-defined]
            except Exception:
                pass
        super().save_model(request, obj, form, change)

