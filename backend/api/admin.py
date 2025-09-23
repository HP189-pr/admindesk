import base64
from io import BytesIO
from django.urls import path, reverse
from django import forms
from django.shortcuts import redirect, render
from django.contrib import messages
from django.http import HttpResponse
from django.contrib import admin

# make pandas optional to avoid import-time crash if it's not installed
try:
    import pandas as pd
except Exception:
    pd = None  # pandas not available; Excel features will be disabled

from .models import MainBranch, SubBranch, Module, Menu, UserPermission, Institute, Enrollment

# ------------------- Excel Upload Form -------------------
class ExcelUploadForm(forms.Form):
    file = forms.FileField(label="Select Excel File")

# ------------------- Excel Upload Mixin -------------------
class ExcelUploadMixin:
    """
    Adds an 'Upload Excel' feature for MainBranch and SubBranch.
    Detects which admin is calling and updates DB dynamically.
    """
    def get_urls(self):
        urls = super().get_urls()
        # if pandas is not installed, don't register custom upload URLs
        if pd is None:
            return urls

        # register name with app_label to make it unique and easy to reverse:
        name = f'{self.model._meta.app_label}_{self.model._meta.model_name}_upload_excel'
        custom_urls = [
            path(
                'upload-excel/',
                self.admin_site.admin_view(self.upload_excel),
                name=name
            ),
            path(
                'download-template/',
                self.admin_site.admin_view(self.download_template),
                name=f'{self.model._meta.app_label}_{self.model._meta.model_name}_download_template'
            ),
        ]
        return custom_urls + urls

    def download_template(self, request):
        # If pandas isn't available, inform the admin and redirect back
        if pd is None:
            messages.error(request, "Pandas is not installed on the server. Install it to download templates.")
            return redirect("../")

        if issubclass(self.model, MainBranch):
            df = pd.DataFrame(columns=["maincourse_id", "course_code", "course_name"])
        elif issubclass(self.model, SubBranch):
            df = pd.DataFrame(columns=["subcourse_id", "maincourse_id", "subcourse_name"])
        else:
            df = pd.DataFrame()

        output = BytesIO()
        df.to_excel(output, index=False)
        output.seek(0)

        response = HttpResponse(
            output,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response['Content-Disposition'] = f'attachment; filename="{self.model._meta.model_name}_template.xlsx"'
        return response

    def upload_excel(self, request):
        # If pandas isn't available, show error and redirect so admin doesn't see traceback
        if pd is None:
            messages.error(request, "Excel upload requires pandas. Install pandas and openpyxl to enable this feature.")
            return redirect("../")

        preview = None

        if request.method == "POST":
            if "confirm" in request.POST:
                # Update DB
                encoded_data = request.session.get("excel_data")
                if not encoded_data:
                    messages.error(request, "Session expired. Please upload again.")
                    return redirect(request.path)

                try:
                    excel_bytes = base64.b64decode(encoded_data)
                    excel_file_like = BytesIO(excel_bytes)
                    df_sheets = pd.read_excel(excel_file_like, sheet_name=None)

                    for sheet_name, sheet_data in df_sheets.items():
                        if sheet_name.lower() == "maincourse" and issubclass(self.model, MainBranch):
                            for _, row in sheet_data.iterrows():
                                self.model.objects.update_or_create(
                                    maincourse_id=str(row["maincourse_id"]),
                                    defaults={
                                        "course_name": row.get("course_name"),
                                        "updated_by": request.user
                                    }
                                )
                        elif sheet_name.lower() == "subcourse" and issubclass(self.model, SubBranch):
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

                    del request.session["excel_data"]
                    messages.success(request, "Database updated successfully!")
                    return redirect("../")
                except Exception as e:
                    messages.error(request, f"Error updating DB: {e}")
                    return redirect(request.path)

            else:
                # Preview
                excel_file = request.FILES.get("file")
                if not excel_file:
                    messages.error(request, "Please select a file!")
                    return redirect(request.path)

                # Store in session
                request.session["excel_data"] = base64.b64encode(excel_file.read()).decode('utf-8')

                excel_file.seek(0)
                df_sheets = pd.read_excel(excel_file, sheet_name=None)
                preview_sheet = None

                for sheet_name, sheet_data in df_sheets.items():
                    if issubclass(self.model, MainBranch) and sheet_name.lower() == "maincourse":
                        preview_sheet = sheet_data
                    elif issubclass(self.model, SubBranch) and sheet_name.lower() == "subcourse":
                        preview_sheet = sheet_data

                if preview_sheet is not None:
                    preview = {
                        "columns": list(preview_sheet.columns),
                        "rows": preview_sheet.values.tolist()
                    }

        form = ExcelUploadForm()
        context = {
            "form": form,
            "title": f"Upload Excel for {self.model._meta.verbose_name}",
            "preview": preview,
            "template_url": "download-template/" if pd is not None else None
        }
        return render(request, "subbranch/upload_excel.html", context)


# ------------------- MainBranch Admin -------------------
@admin.register(MainBranch)
class MainBranchAdmin(ExcelUploadMixin, admin.ModelAdmin):
    list_display = ("id", "maincourse_id", "course_name", "created_at", "updated_at")
    search_fields = ("maincourse_id", "course_name")
    change_list_template = "subbranch/main_change_list.html"
    change_form_template = "subbranch/main_change_form.html"

    def add_view(self, request, form_url='', extra_context=None):
        extra_context = extra_context or {}
        # only expose upload URL when pandas is available (route registered)
        if pd is not None:
            upload_name = f'admin:{self.model._meta.app_label}_{self.model._meta.model_name}_upload_excel'
            try:
                extra_context["upload_excel_url"] = reverse(upload_name)
            except Exception:
                extra_context["upload_excel_url"] = "../upload-excel/"
        return super().add_view(request, form_url, extra_context=extra_context)

    def changelist_view(self, request, extra_context=None):
        extra_context = extra_context or {}
        if pd is not None:
            upload_name = f'admin:{self.model._meta.app_label}_{self.model._meta.model_name}_upload_excel'
            try:
                extra_context["upload_excel_url"] = reverse(upload_name)
            except Exception:
                extra_context["upload_excel_url"] = "upload-excel/"
        return super().changelist_view(request, extra_context=extra_context)


# ------------------- SubBranch Admin -------------------
@admin.register(SubBranch)
class SubBranchAdmin(ExcelUploadMixin, admin.ModelAdmin):
    list_display = ("id", "subcourse_id", "subcourse_name", "maincourse", "created_at", "updated_at")
    search_fields = ("subcourse_id", "subcourse_name")
    change_list_template = "subbranch/sub_change_list.html"


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
class InstituteAdmin(admin.ModelAdmin):
    list_display = ('institute_id', 'institute_code', 'institute_name', 'created_at', 'updated_at', 'updated_by')


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = (
        "student_name",
        "institute",
        "batch",
        "subcourse",
        "maincourse",
        "enrollment_no",
        "temp_enroll_no",
        "created_at",
        "updated_at",
        "updated_by",
    )
    search_fields = ("student_name", "enrollment_no", "temp_enroll_no")
    list_filter = ("institute", "batch", "maincourse", "subcourse")
