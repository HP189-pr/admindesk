"""Viewset exposing transcript generation requests."""

from __future__ import annotations

import logging

from django.db import models
from django.db.models import Q, Value
from django.db.models.functions import Lower, Replace
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .domain_transcript_generate import TranscriptRequest
from .serializers_transcript_generate import TranscriptRequestSerializer
from .sheets_sync import sync_transcript_request_to_sheet

__all__ = [
    "TranscriptRequestViewSet",
]


logger = logging.getLogger(__name__)


class TranscriptRequestViewSet(viewsets.ModelViewSet):
    """CRUD endpoint for transcript PDF generation requests."""

    queryset = TranscriptRequest.objects.all().order_by("-requested_at", "-id")
    serializer_class = TranscriptRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        params = getattr(self.request, "query_params", {})

        status_param_raw = (params.get("mail_status") or params.get("status") or "").strip()
        status_param = TranscriptRequest.normalize_status(status_param_raw)
        if status_param:
            qs = qs.filter(mail_status=status_param)

        search_param = (params.get("search") or "").strip()
        if search_param:
            norm = "".join(search_param.split()).lower()
            qs = qs.annotate(
                n_enrollment=Replace(Lower(models.F("enrollment_no")), Value(" "), Value("")),
                n_name=Replace(Lower(models.F("student_name")), Value(" "), Value("")),
                n_mail=Replace(Lower(models.F("submit_mail")), Value(" "), Value("")),
            ).filter(
                Q(n_enrollment__contains=norm) | Q(n_name__contains=norm) | Q(n_mail__contains=norm)
            )

        institute = (params.get("institute_name") or "").strip()
        if institute:
            qs = qs.filter(institute_name__icontains=institute)

        return qs

    @action(detail=False, methods=["post"], url_path="bulk-status")
    def bulk_status(self, request):
        ids = request.data.get("ids")
        status_value = TranscriptRequest.normalize_status(request.data.get("mail_status"))
        if not isinstance(ids, list) or not ids:
            return Response({"detail": "Provide a non-empty list of ids."}, status=status.HTTP_400_BAD_REQUEST)
        allowed = {choice[0] for choice in TranscriptRequest.STATUS_CHOICES}
        if status_value not in allowed:
            alias_keys = sorted(
                set(TranscriptRequest.STATUS_ALIASES.keys()) - allowed
            )
            allowed_text = ", ".join(sorted(allowed))
            if alias_keys:
                allowed_text = f"{allowed_text} (aliases: {', '.join(alias_keys)})"
            return Response(
                {"detail": f"Invalid mail_status. Use one of: {allowed_text}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        updated = 0
        for item in TranscriptRequest.objects.filter(pk__in=ids):
            if item.mail_status == status_value:
                continue
            item.mail_status = status_value
            item.save(update_fields=["mail_status"])
            updated += 1
            try:
                sync_transcript_request_to_sheet(item, {"mail_status": item.mail_status})
            except Exception:  # pragma: no cover
                logger.exception("Failed to sync transcript request %s during bulk status update", item.pk)
        return Response({"updated": updated}, status=status.HTTP_200_OK)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        original_status = instance.mail_status
        original_remark = instance.transcript_remark

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        instance.refresh_from_db()
        changed = {}
        if instance.mail_status != original_status:
            changed["mail_status"] = instance.mail_status
        if (instance.transcript_remark or "") != (original_remark or ""):
            changed["transcript_remark"] = instance.transcript_remark

        if changed:
            try:
                sync_transcript_request_to_sheet(instance, changed)
            except Exception:  # pragma: no cover
                logger.exception("Failed to sync transcript request %s to Google Sheet", instance.pk)

        if getattr(instance, "_prefetched_objects_cache", None):  # pragma: no cover
            instance._prefetched_objects_cache = {}

        return Response(self.get_serializer(instance).data)
