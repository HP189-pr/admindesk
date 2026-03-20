# backend/api/view_bulkupload.py
"""Bulk upload API adapter built on the shared Excel import engine."""

import logging
import os
import threading
import uuid
from io import BytesIO

from django.conf import settings
from django.core.cache import cache
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.authentication import BasicAuthentication, SessionAuthentication
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .excel_import.column_mapper import resolve_bulk_service_column_name
from .excel_import.controller_utils import build_bulk_sample_row, is_truthy, normalize_preview_number_columns, prepare_bulk_dataframe
from .excel_import.engine import ImportContext, run_row_importer
from .excel_import.helpers import normalize_dataframe_nulls
from .excel_import.readers import read_excel_compat
from .excel_import.registry import get_bulk_importer, get_bulk_service_template_columns


class BulkService(str):
    ENROLLMENT = "ENROLLMENT"
    DOCREC = "DOCREC"
    MIGRATION = "MIGRATION"
    PROVISIONAL = "PROVISIONAL"
    VERIFICATION = "VERIFICATION"
    INSTITUTE = "INSTITUTE"
    DEGREE = "DEGREE"
    EMP_PROFILE = "EMP_PROFILE"
    LEAVE = "LEAVE"
    INSTITUTIONAL_VERIFICATION = "INSTITUTIONAL_VERIFICATION"
    STUDENT_FEES = "STUDENT_FEES"
    STUDENT_PROFILE = "STUDENT_PROFILE"


class _CsrfExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):  # pragma: no cover
        return


class BulkUploadView(APIView):
    logger = logging.getLogger("bulk_upload")

    permission_classes = [IsAuthenticated]
    authentication_classes = [JWTAuthentication, _CsrfExemptSessionAuthentication, BasicAuthentication]
    parser_classes = [MultiPartParser, FormParser]
    MAX_UPLOAD_BYTES = 50 * 1024 * 1024

    def get(self, request):
        upload_id = request.query_params.get("upload_id")
        if upload_id:
            data = cache.get(f"bulk:{upload_id}")
            if not data:
                return Response({"error": True, "detail": "upload_id not found or expired"}, status=404)
            if data.get("log_url") and not str(data["log_url"]).startswith("http"):
                try:
                    data["log_url"] = request.build_absolute_uri(data["log_url"])
                except Exception:
                    self.logger.debug("Failed to build absolute bulk log_url for upload_id=%s", upload_id, exc_info=True)
            return Response({"error": False, "upload_id": upload_id, **data})

        service = request.query_params.get("service", "").upper().strip()
        custom_sheet = (request.query_params.get("sheet_name") or "").strip() or None

        try:
            import pandas as pd
        except Exception:
            return Response({"detail": "pandas is required on server for Excel operations."}, status=500)

        columns = get_bulk_service_template_columns(service)
        if not columns:
            return Response({"detail": f"Template not available for {service or 'service'}"}, status=501)

        sample_flag = is_truthy(request.query_params.get("sample", ""))
        if sample_flag:
            df = pd.DataFrame([build_bulk_sample_row(columns)])
        else:
            df = pd.DataFrame(columns=columns)

        output = BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name=custom_sheet or service.title())
            if sample_flag:
                try:
                    summary = pd.DataFrame([
                        {"sheet": custom_sheet or service.title(), "sample_rows": len(df.index)}
                    ])
                    summary.to_excel(writer, index=False, sheet_name="summary")
                except Exception:
                    self.logger.debug("Failed to add summary sheet to bulk template for service=%s", service, exc_info=True)

        output.seek(0)
        filename = f"template_{service.lower()}_{timezone.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        response = HttpResponse(
            output.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    def _process_confirm(self, service, df, user, track_id=None, auto_create_docrec=False, selected_cols=None):
        df = normalize_dataframe_nulls(df)
        total_rows = len(df.index)
        results = []
        ok_count = 0
        fail_count = 0

        def cache_progress(processed):
            if not track_id:
                return
            cache.set(
                f"bulk:{track_id}",
                {
                    "status": "running",
                    "service": service,
                    "processed": processed,
                    "total": total_rows,
                    "ok": ok_count,
                    "fail": fail_count,
                },
                timeout=3600,
            )

        def log_result(row_idx, key, message, ok):
            nonlocal ok_count, fail_count
            if ok:
                ok_count += 1
            else:
                fail_count += 1
            safe_row = int(row_idx) if row_idx is not None else 0
            results.append(
                {
                    "row": safe_row,
                    "key": key,
                    "status": "OK" if ok else "FAIL",
                    "message": message,
                }
            )

        def make_json_safe(value):
            try:
                import math
                import numpy as np
                import pandas as pd
            except Exception:
                np = None
                pd = None
                import math

            if value is None or isinstance(value, (str, bool, int)):
                return value
            if isinstance(value, float):
                try:
                    if math.isnan(value) or value in (float("inf"), float("-inf")):
                        return None
                except Exception:
                    return None
                return value
            try:
                if np is not None and isinstance(value, np.generic):
                    return make_json_safe(value.item())
            except Exception:
                pass
            try:
                if pd is not None and isinstance(value, pd.Timestamp):
                    return str(value.to_pydatetime())
                if pd is not None and pd.isna(value):
                    return None
            except Exception:
                pass
            if isinstance(value, dict):
                return {str(key): make_json_safe(item) for key, item in value.items()}
            if isinstance(value, (list, tuple)):
                return [make_json_safe(item) for item in value]
            try:
                import datetime as dt

                if isinstance(value, (dt.date, dt.datetime)):
                    return value.isoformat()
            except Exception:
                pass
            try:
                return str(value)
            except Exception:
                return None

        def finalize_payload(error=False, detail=None):
            local_results = results or []
            if error and detail and not local_results:
                local_results.append(
                    {"row": 0, "key": service or "-", "status": "FAIL", "message": detail}
                )

            file_url = None
            log_xlsx_b64 = None
            log_name = None
            try:
                import base64
                import pandas as pd

                logs_dir = os.path.join(settings.MEDIA_ROOT, "logs")
                os.makedirs(logs_dir, exist_ok=True)
                df_log = pd.DataFrame(
                    local_results
                    or [{"row": None, "key": None, "status": "INFO", "message": detail or "No rows processed"}]
                )
                output = BytesIO()
                with pd.ExcelWriter(output, engine="openpyxl") as writer:
                    df_log.to_excel(writer, index=False, sheet_name="result")
                output.seek(0)
                filename = f"upload_log_{service.lower()}_{timezone.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
                path = os.path.join(logs_dir, filename)
                with open(path, "wb") as handle:
                    handle.write(output.getvalue())
                file_url = settings.MEDIA_URL + "logs/" + filename
                log_xlsx_b64 = base64.b64encode(output.getvalue()).decode("utf-8")
                log_name = filename
            except Exception:
                self.logger.warning("Failed to build finalize payload workbook for service=%s", service, exc_info=True)

            payload = {
                "error": bool(error),
                "mode": "confirm",
                "summary": {"ok": ok_count, "fail": fail_count, "total": total_rows},
                "log_url": file_url,
                "results": local_results,
            }
            if detail:
                payload["detail"] = detail
            if log_xlsx_b64:
                payload["log_xlsx"] = log_xlsx_b64
                payload["log_name"] = log_name

            safe_payload = make_json_safe(payload)
            if track_id:
                cache_status = "error" if error else "done"
                try:
                    cache.set(
                        f"bulk:{track_id}",
                        {"status": cache_status, **safe_payload},
                        timeout=3600,
                    )
                except Exception:
                    logging.exception("Failed to cache bulk result for %s", track_id)
            return safe_payload

        try:
            importer = get_bulk_importer(service)
            if importer is None:
                return finalize_payload(error=True, detail=f"Service {service} not implemented")

            context = ImportContext(
                user=user,
                active_fields=selected_cols,
                selected_cols=selected_cols,
                auto_create_docrec=auto_create_docrec,
                service=service,
            )

            def record_shared_result(result, processed):
                log_result(result.row_number, result.ref, result.message, result.status != "skipped")
                cache_progress(processed)

            run_row_importer(df, importer, context, start_row=0, on_result=record_shared_result)
        except Exception as exc:
            self.logger.warning("Bulk confirm processing failed for service=%s", service, exc_info=True)
            return finalize_payload(error=True, detail=str(exc))

        return finalize_payload()

    def post(self, request):
        action = request.query_params.get("action", "preview")
        service = request.data.get("service", "").upper().strip()
        preferred_sheet = (request.data.get("sheet_name") or "").strip()
        upload = request.FILES.get("file")
        async_mode = request.query_params.get("async") == "1"
        track = async_mode and action != "preview"

        def err(detail, code=status.HTTP_400_BAD_REQUEST):
            return Response({"error": True, "detail": detail}, status=code)

        if not service:
            return err("service is required")
        if not upload:
            return err("file is required")
        if upload.size > self.MAX_UPLOAD_BYTES:
            max_mb = self.MAX_UPLOAD_BYTES // (1024 * 1024)
            return err(f"File too large (> {max_mb}MB)", status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

        extension = os.path.splitext(upload.name.lower())[1]
        is_excel = extension in {".xlsx", ".xls"}
        is_csv = extension == ".csv"
        if not (is_excel or is_csv):
            return err("Unsupported file type. Use .xlsx, .xls, or .csv", status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)

        try:
            import pandas as pd
        except Exception:
            return Response({"error": True, "detail": "pandas is required on server for Excel/CSV operations."}, status=500)

        try:
            if is_excel:
                sheets = read_excel_compat(upload, file_ext=extension, sheet_name=None)
                if not sheets:
                    return err("No sheets found in workbook")
                if preferred_sheet and preferred_sheet in sheets:
                    sheet_name = preferred_sheet
                    df = sheets[preferred_sheet]
                else:
                    sheet_name, df = next(iter(sheets.items()))
            else:
                sheet_name = None
                df = pd.read_csv(upload)
        except Exception as exc:
            self.logger.exception(
                "Error reading uploaded file for service=%s filename=%s",
                service,
                getattr(upload, "name", None),
            )
            return err(f"Error reading file: {exc}")

        if df is None:
            return err("No data found")

        df, selected_cols = prepare_bulk_dataframe(
            df,
            request.data,
            lambda column: resolve_bulk_service_column_name(column, service),
        )

        if action == "preview":
            df = normalize_preview_number_columns(df)
            preview_rows = df.fillna("").head(100).to_dict(orient="records")
            return Response(
                {
                    "error": False,
                    "mode": "preview",
                    "sheet": sheet_name,
                    "count": int(len(df)),
                    "preview": preview_rows,
                }
            )

        auto_create_docrec = is_truthy(
            request.data.get("auto_create_docrec") or request.query_params.get("auto_create_docrec", "")
        )

        if track:
            upload_id = str(uuid.uuid4())
            try:
                cache.set(
                    f"bulk:{upload_id}",
                    {"status": "queued", "service": service, "processed": 0, "total": len(df.index)},
                    timeout=3600,
                )
            except Exception:
                self.logger.warning(
                    "Failed to initialize async bulk cache for upload_id=%s service=%s",
                    upload_id,
                    service,
                    exc_info=True,
                )

            def background_worker():
                from django.contrib.auth import get_user_model

                user_model = get_user_model()
                try:
                    user_obj = user_model.objects.filter(id=request.user.id).first()
                    payload = self._process_confirm(
                        service,
                        df,
                        user_obj,
                        track_id=upload_id,
                        auto_create_docrec=auto_create_docrec,
                        selected_cols=selected_cols,
                    )
                    if payload.get("error"):
                        self.logger.warning(
                            "Async bulk processing completed with errors for upload_id=%s service=%s",
                            upload_id,
                            service,
                        )
                except Exception as exc:
                    self.logger.exception(
                        "Async bulk worker crashed for upload_id=%s service=%s",
                        upload_id,
                        service,
                    )
                    try:
                        cache.set(f"bulk:{upload_id}", {"status": "error", "detail": str(exc)}, timeout=3600)
                    except Exception:
                        self.logger.warning(
                            "Failed to persist async bulk worker crash for upload_id=%s service=%s",
                            upload_id,
                            service,
                            exc_info=True,
                        )

            threading.Thread(target=background_worker, daemon=True).start()
            return Response({"error": False, "mode": "started", "upload_id": upload_id, "total": len(df.index)})

        payload = self._process_confirm(
            service,
            df,
            request.user,
            auto_create_docrec=auto_create_docrec,
            selected_cols=selected_cols,
        )
        status_code = 200 if not payload.get("error") else 500
        if payload.get("log_url") and not payload["log_url"].startswith("http"):
            try:
                payload["log_url"] = request.build_absolute_uri(payload["log_url"])
            except Exception:
                self.logger.warning("Failed to build absolute log_url for service=%s", service, exc_info=True)
        return Response(payload, status=status_code)
