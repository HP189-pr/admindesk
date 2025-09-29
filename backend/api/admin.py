import base64
from io import BytesIO
from urllib import request
from django.urls import path, reverse
from django import forms
from django.shortcuts import redirect, render
from django.contrib import messages
from django.http import HttpResponse
from django.contrib import admin
from datetime import datetime, date



# make pandas optional to avoid import-time crash if it's not installed
try:
    import pandas as pd
except Exception:
    pd = None  # pandas not available; Excel features will be disabled

from .models import MainBranch, SubBranch, Module, Menu, UserPermission, Institute, Enrollment

# ------------------- Excel Date Parser -------------------
def parse_excel_date(value):
    """
    Safely parse Excel / pandas date-like values to a Python date.
    Returns None for blanks, NaT, or invalid values.
    Works when pandas is missing as well.
    """
    # quick None / empty guard
    if value is None:
        return None
    if isinstance(value, str) and value.strip() == "":
        return None

    # If pandas is available, treat pandas NA/NaT as None
    if pd is not None:
        try:
            if pd.isna(value):
                return None
        except Exception:
            # fallback if pd.isna errors for some type
            pass

    # native Python date/datetime
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        try:
            # drop tzinfo safely
            if value.tzinfo is not None:
                return value.replace(tzinfo=None).date()
            return value.date()
        except Exception:
            try:
                return datetime.fromtimestamp(value.timestamp()).date()
            except Exception:
                return None

    # pandas Timestamp or other pandas-parsable values
    if pd is not None:
        try:
            # pandas Timestamp handling
            if isinstance(value, pd.Timestamp):
                try:
                    py_dt = value.to_pydatetime()
                except Exception:
                    py_dt = value.to_datetime().to_pydatetime() if hasattr(value, "to_datetime") else None
                if py_dt is None:
                    return None
                if getattr(py_dt, "tzinfo", None) is not None:
                    py_dt = py_dt.replace(tzinfo=None)
                return py_dt.date()

            # try to parse with pandas (coerce invalid -> NaT)
            parsed = pd.to_datetime(value, errors="coerce", dayfirst=True)
            if pd.isna(parsed):
                return None
            py_dt = parsed.to_pydatetime()
            if getattr(py_dt, "tzinfo", None) is not None:
                py_dt = py_dt.replace(tzinfo=None)
            return py_dt.date()
        except Exception:
            # fall through to python parsing attempts
            pass

    # final fallback: common string formats
    try:
        for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
            try:
                return datetime.strptime(str(value), fmt).date()
            except Exception:
                continue
    except Exception:
        pass

    return None


# ------------------- Excel Upload Form -------------------
class ExcelUploadForm(forms.Form):
    file = forms.FileField(label="Select Excel File")

# Add this sanitizer so no pandas.NaT / Timestamp ends up in templates
def _sanitize_for_template(value):
    if value is None:
        return ""
    try:
        if pd is not None:
            if pd.isna(value):
                return ""
            if isinstance(value, pd.Timestamp):
                py_dt = value.to_pydatetime()
                if getattr(py_dt, "tzinfo", None) is not None:
                    py_dt = py_dt.replace(tzinfo=None)
                return py_dt.isoformat()
    except Exception:
        pass

    if isinstance(value, datetime):
        try:
            if getattr(value, "tzinfo", None) is not None:
                value = value.replace(tzinfo=None)
            return value.isoformat()
        except Exception:
            return str(value)
    if isinstance(value, date):
        return value.isoformat()
    return str(value)

# ------------------- Excel Upload Mixin -------------------
class ExcelUploadMixin:
    def get_urls(self):
        urls = super().get_urls()
        if pd is None:
            return urls

        name_upload = f'{self.model._meta.app_label}_{self.model._meta.model_name}_upload_excel'
        name_download = f'{self.model._meta.app_label}_{self.model._meta.model_name}_download_template'

        custom_urls = [
            path(
                'upload-excel/',
                self.admin_site.admin_view(self.upload_excel),
                name=name_upload
            ),
            path(
                'download-template/',
                self.admin_site.admin_view(self.download_template),
                name=name_download
            ),
        ]
        return custom_urls + urls

    def download_template(self, request):
        if pd is None:
            messages.error(request, "Install pandas to download template")
            return redirect("../")

        if issubclass(self.model, MainBranch):
            df = pd.DataFrame(columns=["maincourse_id", "course_code", "course_name"])
        elif issubclass(self.model, SubBranch):
            df = pd.DataFrame(columns=["subcourse_id", "maincourse_id", "subcourse_name"])
        elif issubclass(self.model, Institute):
            df = pd.DataFrame(columns=[
                "institute_id",
                "institute_code",
                "institute_name",
                "institute_campus",
                "institute_address",
                "institute_city"
            ])
        elif issubclass(self.model, Enrollment):
            df = pd.DataFrame(columns=[
                "student_name",
                "institute_id",
                "batch",
                "enrollment_date",
                "subcourse_id",
                "maincourse_id",
                "enrollment_no",
                "temp_enroll_no",
                "admission_date",
            ])
        else:
            df = pd.DataFrame()

        output = BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
                # Use model name as sheet name (or customize)
                sheet_name = self.model._meta.verbose_name.title()  # e.g. "Enrollment"
                df.to_excel(writer, index=False, sheet_name=sheet_name)

        output.seek(0)
        response = HttpResponse(
                output,
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        response['Content-Disposition'] = f'attachment; filename="{self.model._meta.model_name}_template.xlsx"'
        return response


    def upload_excel(self, request):
        preview = None
        form = ExcelUploadForm(request.POST or None, request.FILES or None)

        if request.method == "POST":
            if "upload_preview" in request.POST:
                excel_file = request.FILES.get("file")
                if not excel_file:
                    messages.error(request, "Please select a file!")
                else:
                    # Save file content in session for confirm step
                    request.session["excel_data"] = base64.b64encode(excel_file.read()).decode("utf-8")
                    excel_file.seek(0)

                    # Load preview
                    try:
                        df_sheets = pd.read_excel(excel_file, sheet_name=None)
                    except Exception as e:
                        messages.error(request, f"Error reading Excel file: {e}")
                        df_sheets = {}

                    for sheet_name, sheet_data in df_sheets.items():
                        sheet_lower = sheet_name.lower()
                        # Preview for all models
                        if (
                            (issubclass(self.model, MainBranch) and sheet_lower == "maincourse") or
                            (issubclass(self.model, SubBranch) and sheet_lower == "subcourse") or
                            (issubclass(self.model, Institute) and sheet_lower == "institute") or
                            (issubclass(self.model, Enrollment) and sheet_lower == "enrollment")
                        ):
                            rows = sheet_data.fillna("").values.tolist()
                            sanitized_rows = [[ _sanitize_for_template(cell) for cell in row ] for row in rows]
                            preview = {
                                "columns": list(sheet_data.columns),
                                "rows": sanitized_rows
                            }

            elif "confirm" in request.POST:
                encoded_data = request.session.get("excel_data")
                if not encoded_data:
                    messages.error(request, "Session expired. Upload again.")
                else:
                    excel_bytes = base64.b64decode(encoded_data)
                    excel_file_like = BytesIO(excel_bytes)
                    df_sheets = pd.read_excel(excel_file_like, sheet_name=None)

                    for sheet_name, sheet_data in df_sheets.items():
                        sheet_lower = sheet_name.lower()

                        # MainBranch
                        if issubclass(self.model, MainBranch) and sheet_lower == "maincourse":
                            for _, row in sheet_data.iterrows():
                                course_code = str(row.get("course_code", "")).strip()
                                if not course_code:
                                    messages.warning(request, f"Skipped row with missing course_code: {row.to_dict()}")
                                    continue
                                self.model.objects.update_or_create(
                                    maincourse_id=str(row["maincourse_id"]).strip(),
                                    defaults={
                                        "course_code": course_code,
                                        "course_name": str(row.get("course_name", "")).strip(),
                                        "updated_by": request.user
                                    }
                                )

                        # SubBranch
                        elif issubclass(self.model, SubBranch) and sheet_lower == "subcourse":
                            for _, row in sheet_data.iterrows():
                                main = MainBranch.objects.filter(maincourse_id=str(row["maincourse_id"])).first()
                                if main:
                                    self.model.objects.update_or_create(
                                        subcourse_id=str(row["subcourse_id"]),
                                        defaults={
                                            "subcourse_name": row.get("subcourse_name"),
                                            "maincourse": main,
                                            "updated_by": request.user
                                        }
                                    )

                        # Institute
                        elif issubclass(self.model, Institute) and sheet_lower == "institute":
                            for _, row in sheet_data.iterrows():
                                self.model.objects.update_or_create(
                                    institute_id=row.get("institute_id"),
                                    defaults={
                                        "institute_code": row.get("institute_code"),
                                        "institute_name": row.get("institute_name"),
                                        "institute_campus": row.get("institute_campus"),
                                        "institute_address": row.get("institute_address"),
                                        "institute_city": row.get("institute_city"),
                                        "updated_by": request.user
                                    }
                                )

                        # Enrollment
                        # Enrollment
                        elif issubclass(self.model, Enrollment) and sheet_lower == "enrollment":
                            for _, row in sheet_data.iterrows():
                                institute = Institute.objects.filter(institute_id=row.get("institute_id")).first()
                                subcourse = SubBranch.objects.filter(subcourse_id=row.get("subcourse_id")).first()
                                maincourse = MainBranch.objects.filter(maincourse_id=row.get("maincourse_id")).first()

                                if not (institute and subcourse and maincourse):
                                    messages.warning(request, f"Skipped row with missing related data: {row.to_dict()}")
                                    continue

                                enrollment_date = parse_excel_date(row.get("enrollment_date"))
                                admission_date = parse_excel_date(row.get("admission_date"))

                                self.model.objects.update_or_create(
                                    enrollment_no=row.get("enrollment_no"),
                                    defaults={
                                        "student_name": row.get("student_name"),
                                        "institute": institute,
                                        "batch": row.get("batch"),
                                        "enrollment_date": enrollment_date,   # safe date
                                        "admission_date": admission_date,     # safe date
                                        "subcourse": subcourse,
                                        "maincourse": maincourse,
                                        "temp_enroll_no": row.get("temp_enroll_no"),
                                        "updated_by": request.user
                                    }
                                )


                    messages.success(request, "Database updated successfully!")
                    del request.session["excel_data"]

        context = {
            "form": form,
            "preview": preview,
            "download_url": reverse(f"admin:{self.model._meta.app_label}_{self.model._meta.model_name}_download_template"),
            "title": f"Upload Excel for {self.model._meta.verbose_name}"
        }
        return render(request, "subbranch/upload_excel_page.html", context)


class CommonAdminMixin(ExcelUploadMixin, admin.ModelAdmin):
    change_list_template = "subbranch/reusable_change_list.html"
    change_form_template = "subbranch/reusable_change_form.html"

    search_fields = ()
    list_filter = ()
    readonly_fields = ()
    autocomplete_fields = ()

    def add_view(self, request, form_url='', extra_context=None):
        extra_context = extra_context or {}
        if pd:
            try:
                upload_name = f'admin:{self.model._meta.app_label}_{self.model._meta.model_name}_upload_excel'
                extra_context["upload_excel_url"] = reverse(upload_name)
            except Exception:
                extra_context["upload_excel_url"] = "../upload-excel/"
        return super().add_view(request, form_url, extra_context=extra_context)

    def changelist_view(self, request, extra_context=None):
        extra_context = extra_context or {}
        if pd:
            extra_context["upload_excel_url"] = reverse(
                f"admin:{self.model._meta.app_label}_{self.model._meta.model_name}_upload_excel"
            )
        return super().changelist_view(request, extra_context=extra_context)

# ------------------- MainBranch Admin -------------------
@admin.register(MainBranch)
class MainBranchAdmin(CommonAdminMixin):
    list_display = ("id", "maincourse_id", "course_code", "course_name", "created_at", "updated_at")
    search_fields = ("maincourse_id", "course_name", "course_code")
    list_filter = ("created_at", "updated_at")
    readonly_fields = ("created_at", "updated_at")
# ------------------- SubBranch Admin -------------------
@admin.register(SubBranch)
class SubBranchAdmin(CommonAdminMixin):
    list_display = ("id", "subcourse_id", "subcourse_name", "maincourse", "created_at", "updated_at")
    search_fields = ("subcourse_id", "subcourse_name", "maincourse__course_name")
    list_filter = ("maincourse", "created_at", "updated_at")
    readonly_fields = ("created_at", "updated_at")
    autocomplete_fields = ("maincourse",)



# ------------------- Other Admins (No change) -------------------
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
    # Add new columns to list_display
    list_display = (
        "institute_id",
        "institute_code",
        "institute_name",
        "institute_campus",   # new
        "institute_address",  # new
        "institute_city",     # new
        "created_at",
        "updated_at",
        "updated_by"
    )

    # Add new columns to search
    search_fields = (
        "institute_code",
        "institute_name",
        "institute_campus",   # new
        "institute_city"      # new
    )

    # You can filter by city or campus if needed
    list_filter = (
        "created_at",
        "updated_at",
        "institute_campus",   # optional
        "institute_city"      # optional
    )

    readonly_fields = ("created_at", "updated_at")

@admin.register(Enrollment)
class EnrollmentAdmin(CommonAdminMixin):
    list_display = (
        "student_name",
        "institute",
        "batch",
        "subcourse",
        "maincourse",
        "enrollment_no",
        "temp_enroll_no",
        "enrollment_date",   # new
        "admission_date",    # new
        "created_at",
        "updated_at",
        "updated_by",
    )
    search_fields = ("student_name", "enrollment_no", "temp_enroll_no")
    list_filter = ("institute", "batch", "maincourse", "subcourse", "enrollment_date", "admission_date")  # optional
    readonly_fields = ("created_at", "updated_at")
    autocomplete_fields = ("institute", "subcourse", "maincourse")
