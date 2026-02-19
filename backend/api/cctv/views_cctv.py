from typing import Dict, Optional

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from django.db import OperationalError, ProgrammingError
from django.db import transaction
from django.db.models import Max

from .domain_cctv import (
    CCTVExam,
    CCTVCentreEntry,
    CCTVDVD,
    CCTVOutward
)

from .serializers_cctv import (
    CCTVExamSerializer,
    CCTVCentreEntrySerializer,
    CCTVDVDSerializer,
    CCTVOutwardSerializer
)
from ..sheets_sync import import_cctv_centres_from_sheet, import_cctv_exams_from_sheet

from ..domain_core import Menu, Module, UserPermission

OFFICE_MODULE_NAME = "Office Management"
CCTV_MENU_NAME = "CCTV Monitoring"

DEFAULT_RIGHTS = {
    "can_view": False,
    "can_create": False,
    "can_edit": False,
    "can_delete": False,
}
FULL_RIGHTS = {k: True for k in DEFAULT_RIGHTS}


def _user_is_admin(user) -> bool:
    return bool(
        getattr(user, "is_superuser", False)
        or getattr(user, "is_staff", False)
        or user.groups.filter(name__iexact="Admin").exists()
    )


def _perm_to_dict(record: UserPermission) -> Dict[str, bool]:
    return {
        "can_view": bool(record.can_view),
        "can_create": bool(record.can_create),
        "can_edit": bool(record.can_edit),
        "can_delete": bool(record.can_delete),
    }


def _fetch_permission_from_db(user, menu_name: str) -> Optional[Dict[str, bool]]:
    try:
        module = Module.objects.filter(name__iexact=OFFICE_MODULE_NAME).first()
        if not module:
            return None
        menu = None
        if menu_name:
            menu = Menu.objects.filter(module=module, name__iexact=menu_name).first()
        if menu:
            record = UserPermission.objects.filter(user=user, module=module, menu=menu).first()
            if record:
                return _perm_to_dict(record)
        module_level = UserPermission.objects.filter(user=user, module=module, menu__isnull=True).first()
        if module_level:
            return _perm_to_dict(module_level)
    except Exception:
        return None
    return None


def get_cctv_rights(user, menu_name: str) -> Dict[str, bool]:
    if not user or not user.is_authenticated:
        return DEFAULT_RIGHTS.copy()
    if _user_is_admin(user):
        return FULL_RIGHTS.copy()
    rights = _fetch_permission_from_db(user, menu_name)
    if rights:
        return rights
    return DEFAULT_RIGHTS.copy()


class CctvPermissionMixin:
    cctv_menu_name: str = CCTV_MENU_NAME
    permission_action_map = {
        "list": "can_view",
        "retrieve": "can_view",
        "create": "can_create",
        "update": "can_edit",
        "partial_update": "can_edit",
        "destroy": "can_delete",
        "sync_from_sheet": "can_view",
        "assign_cc": "can_edit",
    }

    def _required_flag(self, action: Optional[str]) -> Optional[str]:
        if not action:
            return None
        return self.permission_action_map.get(action)

    def check_permissions(self, request):  # noqa: D401
        super().check_permissions(request)
        required = self._required_flag(getattr(self, "action", None))
        if required:
            rights = get_cctv_rights(request.user, self.cctv_menu_name)
            if not rights.get(required):
                raise PermissionDenied("You do not have permission to perform this action.")

    def list(self, request, *args, **kwargs):
        try:
            return super().list(request, *args, **kwargs)
        except (OperationalError, ProgrammingError) as exc:
            return Response(
                {
                    "detail": "CCTV tables are not ready. Run migrations and retry.",
                    "error": str(exc),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


# ============================
# Exam
# ============================

class CCTVExamViewSet(CctvPermissionMixin, viewsets.ModelViewSet):
    queryset = CCTVExam.objects.all().order_by("exam_date")
    serializer_class = CCTVExamSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["post"], url_path="sync-from-sheet")
    def sync_from_sheet(self, request):
        sheet_name = (request.data or {}).get("sheet_name") or request.query_params.get("sheet_name")
        if not sheet_name:
            return Response({"detail": "sheet_name is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            summary = import_cctv_exams_from_sheet(sheet_name=str(sheet_name).strip())
            return Response({"summary": summary})
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


# ============================
# Centre Entry (Auto DVD + CC)
# ============================

class CCTVCentreEntryViewSet(CctvPermissionMixin, viewsets.ModelViewSet):
    queryset = CCTVCentreEntry.objects.all()
    serializer_class = CCTVCentreEntrySerializer
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["post"], url_path="sync-from-sheet")
    def sync_from_sheet(self, request):
        sheet_name = (request.data or {}).get("sheet_name") or request.query_params.get("sheet_name")
        if not sheet_name:
            return Response({"detail": "sheet_name is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            summary = import_cctv_centres_from_sheet(sheet_name=str(sheet_name).strip())
            return Response({"summary": summary})
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    def perform_create(self, serializer):
        centre = serializer.save()
        start = centre.start_number
        end = centre.end_number
        session = centre.session

        if start is not None and end is not None:
            for i in range(start, end + 1):
                CCTVDVD.objects.create(
                    centre=centre,
                    number=i,
                    label=f"{session}-{i}"
                )


# ============================
# DVD
# ============================

class CCTVDVDViewSet(CctvPermissionMixin, viewsets.ModelViewSet):
    queryset = CCTVDVD.objects.all()
    serializer_class = CCTVDVDSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["post"], url_path="assign-cc")
    def assign_cc(self, request):
        data = request.data or {}
        centre_id = data.get("centre_id")
        try:
            total = int(data.get("total", 0))
        except (TypeError, ValueError):
            total = 0

        if not centre_id or total <= 0:
            return Response({"detail": "Invalid data."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            centre = CCTVCentreEntry.objects.select_for_update().get(id=centre_id)
            last = CCTVDVD.objects.aggregate(max_cc=Max("cc_number"))
            last_number = last["max_cc"] or 0

            start_number = last_number + 1
            end_number = last_number + total

            dvds = list(
                CCTVDVD.objects.filter(
                    centre=centre,
                    cc_number__isnull=True,
                ).order_by("id")[:total]
                )

            if not dvds:
                return Response(
                    {"detail": "No DVDs available for CC assignment."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if len(dvds) < total:
                return Response(
                    {"detail": "Not enough DVDs available for CC assignment."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            next_number = start_number
            for dvd in dvds:
                dvd.objection_found = True
                dvd.cc_number = next_number
                dvd.cc_label = f"CC-{next_number}"
                dvd.save()
                next_number += 1

            centre.cc_total = total
            centre.cc_start_label = f"CC-{start_number}"
            centre.cc_end_label = f"CC-{end_number}"
            centre.save()

        return Response(
            {
                "status": "CC assigned",
                "assigned": len(dvds),
                "cc_start": centre.cc_start_label,
                "cc_end": centre.cc_end_label,
                "total": total,
            }
        )


# ============================
# Outward
# ============================

class CCTVOutwardViewSet(CctvPermissionMixin, viewsets.ModelViewSet):
    queryset = CCTVOutward.objects.all()
    serializer_class = CCTVOutwardSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        last = CCTVOutward.objects.order_by("-id").first()
        next_no = (int(last.outward_no.split("-")[-1]) + 1) if last else 1

        outward_no = f"KSV-SE-CCTV-{str(next_no).zfill(3)}"

        serializer.save(outward_no=outward_no)
