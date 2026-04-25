# backend/api/admin_excelupload.py
"""Excel upload mixin and controller helpers for Django admin imports."""

import base64
import logging
from datetime import datetime
from io import BytesIO
from typing import Any, Dict, List

from django.contrib import messages
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.urls import path, reverse
from django.views.decorators.csrf import csrf_exempt

try:  # Optional pandas (Excel support)
    import pandas as pd  # type: ignore
except Exception:  # pragma: no cover
    pd = None  # type: ignore

from .cash_register import ReceiptNumberService
from .domain_cash_register import FeeType, Receipt, ReceiptItem, normalize_receipt_no, split_receipt
from .models import Enrollment, MigrationRecord, ProvisionalRecord
from .excel_import.column_mapper import _build_allowed_maps, _resolve_column_name
from .excel_import.controller_utils import build_preview_rows, detect_best_header_row, is_truthy
from .excel_import.engine import ImportContext, run_row_importer
from .excel_import.import_specs import get_import_spec
from .excel_import.readers import read_excel_compat
from .excel_import.registry import get_admin_importer


logger = logging.getLogger(__name__)


class ExcelUploadMixin:
    upload_template = "subbranch/upload_excel_page.html"

    def get_urls(self):  # type: ignore[override]
        urls = super().get_urls()  # type: ignore
        secured_upload = self.admin_site.admin_view(csrf_exempt(self.upload_excel))
        custom_urls = [
            path(
                "upload-excel/",
                secured_upload,
                name=f"{self.model._meta.app_label}_{self.model._meta.model_name}_upload_excel",
            ),
            path(
                "download-template/",
                self.admin_site.admin_view(self.download_template),
                name=f"{self.model._meta.app_label}_{self.model._meta.model_name}_download_template",
            ),
        ]
        return custom_urls + urls

    def download_template(self, request):  # type: ignore
        spec = get_import_spec(self.model)
        header_columns = spec.get("template_columns") or spec["allowed_columns"]
        header = ",".join(header_columns) + "\n"
        response = HttpResponse(header, content_type="text/csv")
        response["Content-Disposition"] = f"attachment; filename={self.model._meta.model_name}_template.csv"
        return response

    def _render_upload_page(self, request):
        return render(
            request,
            self.upload_template,
            {
                "title": f"Upload Excel for {self.model._meta.verbose_name}",
                "download_url": reverse(
                    f"admin:{self.model._meta.app_label}_{self.model._meta.model_name}_download_template"
                ),
            },
        )

    @staticmethod
    def _json_error(detail, status_code=400):
        return JsonResponse({"error": detail}, status=status_code)

    def _get_session_upload(self, request):
        encoded = request.session.get("excel_data")
        file_ext = request.session.get("excel_file_ext")
        if not encoded:
            return None, None, self._json_error("Session expired", status_code=400)
        return encoded, file_ext, None

    def _read_session_frames(self, encoded, file_ext, **kwargs):
        return read_excel_compat(base64.b64decode(encoded), file_ext=file_ext, sheet_name=None, **kwargs)

    def _handle_init_action(self, request):
        upload = request.FILES.get("file")
        if not upload:
            return self._json_error("No file uploaded", status_code=400)

        max_upload_bytes = 20 * 1024 * 1024
        if upload.size > max_upload_bytes:
            max_mb = max_upload_bytes // (1024 * 1024)
            return self._json_error(f"File too large (> {max_mb}MB)", status_code=413)

        extension = ("." + upload.name.rsplit(".", 1)[-1].lower()) if "." in upload.name else ""
        if extension not in {".xlsx", ".xls"}:
            return self._json_error("Unsupported file type. Use .xlsx or .xls", status_code=415)

        payload = upload.read()
        request.session["excel_data"] = base64.b64encode(payload).decode("utf-8")
        request.session["excel_file_ext"] = extension
        try:
            sheets = list(read_excel_compat(payload, file_ext=extension, sheet_name=None, nrows=0).keys())
        except Exception as exc:
            return self._json_error(f"Read error: {exc}", status_code=400)
        return JsonResponse({"sheets": sheets})

    def _handle_columns_action(self, request):
        sheet = request.POST.get("sheet")
        encoded, file_ext, error = self._get_session_upload(request)
        if error:
            return error

        spec, _allowed, allowed_map, alias_map, allowed_norm_map, alias_norm_map = _build_allowed_maps(self.model)
        required_keys = spec["required_keys"]
        resolver = lambda column: _resolve_column_name(
            column,
            allowed_map,
            alias_map,
            allowed_norm_map,
            alias_norm_map,
        )

        try:
            best_header, frames = detect_best_header_row(
                base64.b64decode(encoded),
                file_ext,
                sheet,
                read_excel_compat,
                resolver,
            )
        except Exception as exc:
            return self._json_error(f"Read error: {exc}", status_code=400)

        if frames is None:
            try:
                frames = self._read_session_frames(encoded, file_ext, nrows=0)
            except Exception as exc:
                return self._json_error(f"Read error: {exc}", status_code=400)

        if sheet not in frames:
            return self._json_error("Sheet not found", status_code=404)

        header_map = request.session.get("excel_header_rows", {})
        header_map[str(sheet)] = int(best_header)
        request.session["excel_header_rows"] = header_map

        columns_present = [str(column).strip() for column in frames[sheet].columns]
        usable: List[str] = []
        unrecognized: List[str] = []
        mapped_seen = set()
        for column in columns_present:
            resolved = resolver(column)
            if resolved:
                usable.append(column)
                mapped_seen.add(resolved)
            else:
                unrecognized.append(column)

        required_missing = [required_key for required_key in required_keys if required_key not in mapped_seen]
        return JsonResponse(
            {
                "columns": usable,
                "unrecognized": unrecognized,
                "required_keys": required_keys,
                "required_missing": required_missing,
                "detected_header": header_map.get(str(sheet), 0),
            }
        )

    def _handle_debug_columns_action(self, request):
        sheet = request.POST.get("sheet")
        encoded, file_ext, error = self._get_session_upload(request)
        if error:
            return error

        header_map = request.session.get("excel_header_rows", {})
        header_row = header_map.get(str(sheet), 0)
        try:
            frames = self._read_session_frames(encoded, file_ext, header=header_row)
        except Exception:
            logger.debug(
                "Stored header-row read failed for debug_columns sheet=%s header=%s",
                sheet,
                header_row,
                exc_info=True,
            )
            try:
                frames = self._read_session_frames(encoded, file_ext)
            except Exception as exc:
                logger.warning(
                    "debug_columns read failed for model=%s sheet=%s",
                    self.model.__name__,
                    sheet,
                    exc_info=True,
                )
                return self._json_error(f"Read error: {exc}", status_code=400)

        if sheet not in frames:
            return self._json_error("Sheet not found", status_code=404)

        raw_columns = [str(column) for column in frames[sheet].columns]
        return JsonResponse({"raw_columns": raw_columns, "detected_header": header_row})

    def _handle_preview_action(self, request):
        sheet = request.POST.get("sheet")
        selected = request.POST.getlist("columns[]")
        if not selected:
            return self._json_error("Select at least one column", status_code=400)

        encoded, file_ext, error = self._get_session_upload(request)
        if error:
            return error

        header_row = request.session.get("excel_header_rows", {}).get(str(sheet), 0)
        try:
            frames = self._read_session_frames(encoded, file_ext, header=header_row)
        except Exception as exc:
            return self._json_error(f"Read error: {exc}", status_code=400)
        if sheet not in frames:
            return self._json_error("Sheet not found", status_code=404)

        df = frames[sheet]
        try:
            df.columns = [str(column).strip() for column in df.columns]
        except Exception:
            logger.debug(
                "Failed to normalize preview column names for model=%s sheet=%s",
                self.model.__name__,
                sheet,
                exc_info=True,
            )

        try:
            if pd is not None:
                df = df.replace(
                    {
                        r"^\s*nan\s*$": None,
                        r"^\s*NaN\s*$": None,
                        r"^\s*None\s*$": None,
                        "<NA>": None,
                    },
                    regex=True,
                )
        except Exception:
            logger.debug(
                "Failed to normalize preview sentinel values for model=%s sheet=%s",
                self.model.__name__,
                sheet,
                exc_info=True,
            )

        try:
            rows = build_preview_rows(df, selected, limit=50, pad_rec_no=True)
        except Exception as exc:
            return self._json_error(f"Preview error: {exc}", status_code=400)

        return JsonResponse(
            {
                "columns": selected,
                "rows": rows,
                "preview_rows": len(rows),
                "total_rows": len(df.index),
            }
        )

    def _normalize_commit_dataframe(self, df, sheet, allowed_map, alias_map, allowed_norm_map, alias_norm_map):
        try:
            df.columns = [str(column).strip() for column in df.columns]
        except Exception:
            logger.debug(
                "Failed to normalize commit column names for model=%s sheet=%s",
                self.model.__name__,
                sheet,
                exc_info=True,
            )

        try:
            rename_map = {}
            for column in list(df.columns):
                resolved = _resolve_column_name(column, allowed_map, alias_map, allowed_norm_map, alias_norm_map)
                if resolved and resolved != column:
                    rename_map[column] = resolved
            if rename_map:
                df.rename(columns=rename_map, inplace=True)
        except Exception:
            logger.debug(
                "Failed to apply commit column aliases for model=%s sheet=%s",
                self.model.__name__,
                sheet,
                exc_info=True,
            )

        try:
            if pd is not None:
                for foreign_key_column in ("institute_id", "maincourse_id", "subcourse_id"):
                    if foreign_key_column in df.columns:
                        df[foreign_key_column] = df[foreign_key_column].apply(
                            lambda value: None
                            if (
                                pd.isna(value)
                                or (
                                    isinstance(value, str)
                                    and str(value).strip().lower() in ("nan", "none", "<na>")
                                )
                            )
                            else value
                        )
        except Exception:
            logger.debug(
                "Failed to normalize FK columns for model=%s sheet=%s",
                self.model.__name__,
                sheet,
                exc_info=True,
            )

        try:
            if pd is not None:
                decimal_columns = [
                    "el_balance",
                    "sl_balance",
                    "cl_balance",
                    "vacation_balance",
                    "joining_year_allocation_el",
                    "joining_year_allocation_cl",
                    "joining_year_allocation_sl",
                    "joining_year_allocation_vac",
                    "total_days",
                    "pay_amount",
                    "allocated",
                ]
                for column in decimal_columns:
                    if column not in df.columns:
                        continue
                    try:
                        df[column] = pd.to_numeric(df[column], errors="coerce").fillna(0)
                    except Exception:
                        def clean_number(value):
                            try:
                                if pd.isna(value):
                                    return 0
                            except Exception:
                                pass
                            try:
                                text = str(value).strip()
                                if text.lower() in ("", "nan", "none", "<na>"):
                                    return 0
                                return float(text)
                            except Exception:
                                return 0

                        df[column] = df[column].apply(clean_number)
        except Exception:
            logger.debug(
                "Failed to normalize decimal columns for model=%s sheet=%s",
                self.model.__name__,
                sheet,
                exc_info=True,
            )

        if pd is not None:
            def normalize_dates(column_names):
                for column in column_names:
                    if column in df.columns:
                        try:
                            df[column] = pd.to_datetime(df[column], errors="coerce", dayfirst=True).dt.date
                        except Exception:
                            logger.debug(
                                "Failed to normalize date column %s for model=%s sheet=%s",
                                column,
                                self.model.__name__,
                                sheet,
                                exc_info=True,
                            )

            sheet_norm = (sheet or "").lower().replace(" ", "")
            normalize_dates(["doc_rec_date", "date", "birth_date"])
            if issubclass(self.model, Enrollment) or sheet_norm == "enrollment":
                normalize_dates(["enrollment_date", "admission_date"])
            elif issubclass(self.model, MigrationRecord) or sheet_norm == "migration":
                normalize_dates(["mg_date"])
            elif issubclass(self.model, ProvisionalRecord) or sheet_norm == "provisional":
                normalize_dates(["prv_date"])

        return df

    def _run_commit_import(self, request, df, eff, sheet_norm):
        counts = {"created": 0, "updated": 0, "skipped": 0}
        log: List[Dict[str, Any]] = []

        def add_log(row_number, status_name, message, ref=None):
            log.append({"row": row_number, "status": status_name, "message": message, "ref": ref})

        shared_importer = get_admin_importer(self.model, sheet_norm)
        if shared_importer is not None:
            def record_shared_result(result, _processed):
                counts[result.status] = counts.get(result.status, 0) + 1
                add_log(result.row_number, result.status, result.message, result.ref)

            context = ImportContext(
                user=request.user,
                active_fields=eff,
                auto_create_docrec=is_truthy(request.POST.get("auto_create_docrec", "")),
                request=request,
                model=self.model,
                sheet_name=sheet_norm,
            )
            run_row_importer(df, shared_importer, context, start_row=2, on_result=record_shared_result)
            return counts, log

        if issubclass(self.model, Receipt):
            from .excel_import.cash_import import import_cash_register

            return import_cash_register(
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

        raise ValueError("Sheet name does not match expected for this model.")

    def _build_log_workbook(self, df, counts, log, sheet_norm):
        if pd is None:
            return None, None

        failed_rows = []
        try:
            for entry in log:
                if str(entry.get("status", "")).lower() != "skipped":
                    continue
                try:
                    row_number = int(entry.get("row") or 0)
                except Exception:
                    row_number = 0
                index = row_number - 2
                if index >= 0 and df is not None and index < len(df.index):
                    row_series = df.iloc[index]
                    row_data = {
                        str(column): (row_series.get(column) if column in row_series.index else None)
                        for column in df.columns
                    }
                else:
                    row_data = {}
                row_data["error"] = entry.get("message")
                failed_rows.append(row_data)
        except Exception:
            logger.debug(
                "Failed to build skipped-row error summary for model=%s sheet=%s",
                self.model.__name__,
                sheet_norm,
                exc_info=True,
            )
            failed_rows = []

        try:
            summary_df = pd.DataFrame(
                [
                    {
                        "total": len(df.index) if df is not None else 0,
                        "created": counts.get("created", 0),
                        "updated": counts.get("updated", 0),
                        "skipped": counts.get("skipped", 0),
                    }
                ]
            )
            error_df = pd.DataFrame(failed_rows) if failed_rows else None
            workbook = BytesIO()
            with pd.ExcelWriter(workbook, engine="openpyxl") as writer:
                summary_df.to_excel(writer, index=False, sheet_name="Summary")
                if error_df is not None:
                    error_df.to_excel(writer, index=False, sheet_name="Errors")
            workbook.seek(0)
            encoded = base64.b64encode(workbook.read()).decode("utf-8")
            filename = f"import_log_{sheet_norm}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            return encoded, filename
        except Exception:
            logger.debug(
                "Failed to build import log workbook for model=%s sheet=%s",
                self.model.__name__,
                sheet_norm,
                exc_info=True,
            )
            return None, None

    def _handle_commit_action(self, request):
        sheet = request.POST.get("sheet")
        selected = request.POST.getlist("columns[]")
        if not selected:
            return self._json_error("No columns selected", status_code=400)

        encoded, file_ext, error = self._get_session_upload(request)
        if error:
            return error

        header_row = request.session.get("excel_header_rows", {}).get(str(sheet), 0)
        try:
            frames = self._read_session_frames(encoded, file_ext, header=header_row)
        except Exception as exc:
            return self._json_error(f"Read error: {exc}", status_code=400)
        if sheet not in frames:
            return self._json_error("Sheet not found", status_code=404)

        spec, _allowed, allowed_map, alias_map, allowed_norm_map, alias_norm_map = _build_allowed_maps(self.model)
        required = set(spec["required_keys"])
        chosen: List[str] = []
        for raw_name in selected:
            resolved = _resolve_column_name(raw_name, allowed_map, alias_map, allowed_norm_map, alias_norm_map)
            if resolved:
                chosen.append(resolved)
        if not required.issubset(chosen):
            return self._json_error("All required columns must be selected", status_code=400)

        df = self._normalize_commit_dataframe(
            frames[sheet],
            sheet,
            allowed_map,
            alias_map,
            allowed_norm_map,
            alias_norm_map,
        )
        sheet_norm = (sheet or "").lower().replace(" ", "")
        eff = set(chosen)

        try:
            counts, log = self._run_commit_import(request, df, eff, sheet_norm)
        except Exception as exc:
            logger.warning(
                "Excel import failed for model=%s sheet=%s",
                self.model.__name__,
                sheet,
                exc_info=True,
            )
            return self._json_error(f"Import error: {exc}", status_code=500)

        log_xlsx_b64, log_name = self._build_log_workbook(df, counts, log, sheet_norm)

        for session_key in ("excel_data", "excel_file_ext", "excel_header_rows"):
            request.session.pop(session_key, None)

        response = {
            "success": True,
            "counts": counts,
            "log": log,
            "total_rows": len(df.index) if df is not None else 0,
        }
        if log_xlsx_b64:
            response["log_xlsx"] = log_xlsx_b64
            response["log_name"] = log_name
        return JsonResponse(response)

    def upload_excel(self, request):  # type: ignore
        if not pd:
            messages.error(request, "Pandas not installed. Excel upload disabled.")
            return self._render_upload_page(request)

        if request.method == "POST" and request.headers.get("X-Requested-With") == "XMLHttpRequest":
            action = request.POST.get("action")
            handlers = {
                "init": self._handle_init_action,
                "columns": self._handle_columns_action,
                "debug_columns": self._handle_debug_columns_action,
                "preview": self._handle_preview_action,
                "commit": self._handle_commit_action,
            }
            handler = handlers.get(action)
            if handler is None:
                return self._json_error("Unknown action", status_code=400)
            try:
                return handler(request)
            except Exception as exc:
                logger.warning(
                    "Unhandled ExcelUploadMixin error for model=%s action=%s",
                    self.model.__name__,
                    action,
                    exc_info=True,
                )
                return self._json_error(f"Unhandled error: {exc}", status_code=500)

        if request.method == "POST":
            return self._json_error(
                "Invalid POST. Expected AJAX with X-Requested-With header.",
                status_code=400,
            )

        return self._render_upload_page(request)
