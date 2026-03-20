# backend/api/exam/views_assessment.py
"""
Assessment System – DRF ViewSets
"""
from datetime import date

from django.db.models import Q
from django.utils import timezone
from ..domain_core import Menu, Module, UserPermission
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from .domain_assessment import (
    AssessmentEntry,
    AssessmentOutward,
    AssessmentOutwardDetails,
)
from .serializers_assessment import (
    AssessmentEntrySerializer,
    AssessmentOutwardDetailsSerializer,
    AssessmentOutwardSerializer,
)
from .services_assessment import generate_outward_no, generate_return_outward_no


def _is_admin_like(user):
    return bool(
        getattr(user, "is_superuser", False)
        or getattr(user, "is_staff", False)
        or user.groups.filter(name__iexact="Admin").exists()
    )


def _assessment_rights(user):
    if _is_admin_like(user):
        return {
            "can_view": True,
            "can_create": True,
            "can_edit": True,
            "can_delete": True,
        }

    module = Module.objects.filter(name__iexact="Exam").first()
    if not module:
        return {
            "can_view": False,
            "can_create": False,
            "can_edit": False,
            "can_delete": False,
        }

    assessment_menu = Menu.objects.filter(
        module=module,
        name__icontains="assessment",
    ).order_by("menuid").first()

    perm = None
    if assessment_menu:
        perm = UserPermission.objects.filter(
            user=user,
            module=module,
            menu=assessment_menu,
        ).first()

    if not perm:
        perm = UserPermission.objects.filter(
            user=user,
            module=module,
            menu__isnull=True,
        ).first()

    if not perm:
        return {
            "can_view": False,
            "can_create": False,
            "can_edit": False,
            "can_delete": False,
        }

    return {
        "can_view": bool(perm.can_view),
        "can_create": bool(perm.can_create),
        "can_edit": bool(perm.can_edit),
        "can_delete": bool(perm.can_delete),
    }


def _is_receiver_only(user):
    rights = _assessment_rights(user)
    return bool(
        rights["can_view"]
        and not rights["can_create"]
        and not _is_admin_like(user)
    )


# ─────────────────────────────────────────────
# Assessment Entry ViewSet
# ─────────────────────────────────────────────

class AssessmentEntryViewSet(ModelViewSet):
    """CRUD for AssessmentEntry. Non-admin users see only their own entries."""

    permission_classes = [IsAuthenticated]
    serializer_class = AssessmentEntrySerializer

    def _deny(self, message="Permission denied."):
        return Response({"detail": message}, status=status.HTTP_403_FORBIDDEN)

    def _ensure_view_access(self):
        rights = _assessment_rights(self.request.user)
        if not rights["can_view"]:
            return self._deny("Assessment module access denied.")
        if _is_receiver_only(self.request.user):
            return self._deny("Receiver role cannot access entry records.")
        return None

    def list(self, request, *args, **kwargs):
        denied = self._ensure_view_access()
        if denied:
            return denied
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        denied = self._ensure_view_access()
        if denied:
            return denied
        return super().retrieve(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        rights = _assessment_rights(request.user)
        if not rights["can_create"]:
            return self._deny("You do not have permission to create assessment entries.")
        if _is_receiver_only(request.user):
            return self._deny("Receiver role cannot create entries.")
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        denied = self._ensure_view_access()
        if denied:
            return denied
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        denied = self._ensure_view_access()
        if denied:
            return denied
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        denied = self._ensure_view_access()
        if denied:
            return denied
        return super().destroy(request, *args, **kwargs)

    def get_queryset(self):
        user = self.request.user
        qs = AssessmentEntry.objects.select_related("added_by", "outward").prefetch_related(
            "outward_details__returned_by",
            "outward_details__received_by",
            "outward_details__final_received_by",
        )

        # Superusers / admins see everything
        if user.is_superuser or user.is_staff:
            pass
        else:
            qs = qs.filter(added_by=user)

        # Optional filters
        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        return qs.order_by("-created_at")

    def perform_create(self, serializer):
        remark = self.request.data.get("remark", "")
        if remark is None:
            remark = ""
        serializer.save(added_by=self.request.user, status="Pending", remark=remark)

    # GET /api/assessment-entry/pending/
    @action(detail=False, methods=["get"], url_path="pending")
    def pending(self, request):
        """Return all entries not yet attached to an outward (status=Pending)."""
        if not _is_admin_like(request.user):
            return self._deny("Only authorized controller can access pending entries.")
        qs = AssessmentEntry.objects.filter(outward__isnull=True).order_by("-created_at")
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    # GET /api/assessment-entry/all/  (superuser / officer helper)
    @action(detail=False, methods=["get"], url_path="all")
    def all_entries(self, request):
        user = request.user
        if not _is_admin_like(user):
            return Response(
                {"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN
            )
        qs = AssessmentEntry.objects.select_related("added_by", "outward").prefetch_related(
            "outward_details__returned_by",
            "outward_details__received_by",
            "outward_details__final_received_by",
        ).order_by("-created_at")
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)


# ─────────────────────────────────────────────
# Assessment Outward ViewSet
# ─────────────────────────────────────────────

class AssessmentOutwardViewSet(ModelViewSet):
    """Outward dispatch management."""

    permission_classes = [IsAuthenticated]
    serializer_class = AssessmentOutwardSerializer

    def _deny(self, message="Permission denied."):
        return Response({"detail": message}, status=status.HTTP_403_FORBIDDEN)

    def list(self, request, *args, **kwargs):
        rights = _assessment_rights(request.user)
        if not rights["can_view"]:
            return self._deny("Assessment module access denied.")
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        rights = _assessment_rights(request.user)
        if not rights["can_view"]:
            return self._deny("Assessment module access denied.")
        return super().retrieve(request, *args, **kwargs)

    def get_queryset(self):
        user = self.request.user

        # Receiver-only users: STRICTLY only outwards assigned to them
        if _is_receiver_only(user):
            return AssessmentOutward.objects.filter(
                receiver_user=user
            ).prefetch_related(
                "details__entry",
                "details__received_by",
                "details__returned_by",
                "details__final_received_by",
            ).select_related("generated_by", "receiver_user").order_by("-created_at")

        # Admin / staff / controllers: everything
        if _is_admin_like(user):
            return AssessmentOutward.objects.prefetch_related(
                "details__entry",
                "details__received_by",
                "details__returned_by",
                "details__final_received_by",
            ).select_related("generated_by", "receiver_user").order_by("-created_at")

        # Other authenticated users: outwards they generated OR are assigned to receive
        return AssessmentOutward.objects.filter(
            Q(generated_by=user) | Q(receiver_user=user)
        ).prefetch_related(
            "details__entry",
            "details__received_by",
            "details__returned_by",
            "details__final_received_by",
        ).select_related("generated_by", "receiver_user").order_by("-created_at")

    # ─── POST /api/assessment-outward/generate/ ──────────────────────────────
    @action(detail=False, methods=["post"], url_path="generate")
    def generate(self, request):
        """
        Create an AssessmentOutward for a set of pending entries.

        Payload:
            {
                "entry_ids": [1, 2, 3],
                "receiver_user": <user_id>,
                "remarks": "optional text"
            }
        """
        if not _is_admin_like(request.user):
            return self._deny("Only authorized controller can generate outward.")

        entry_ids = request.data.get("entry_ids", [])
        receiver_id = request.data.get("receiver_user")
        remarks = request.data.get("remarks", "")

        if not entry_ids:
            return Response(
                {"detail": "entry_ids is required."}, status=status.HTTP_400_BAD_REQUEST
            )
        if not receiver_id:
            return Response(
                {"detail": "receiver_user is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate entries are still pending
        entries = AssessmentEntry.objects.filter(
            id__in=entry_ids, outward__isnull=True
        )
        if entries.count() != len(entry_ids):
            return Response(
                {"detail": "One or more entries are not in Pending state or do not exist."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        outward_no = generate_outward_no()

        outward = AssessmentOutward.objects.create(
            outward_no=outward_no,
            outward_date=date.today(),
            generated_by=request.user,
            receiver_user_id=receiver_id,
            remarks=remarks,
        )

        for entry in entries:
            entry.outward = outward
            entry.status = "Outward"
            entry.save(update_fields=["outward", "status"])

            AssessmentOutwardDetails.objects.create(
                outward=outward,
                entry=entry,
            )

        serializer = self.get_serializer(outward)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    # ─── GET /api/assessment-outward/my/ ────────────────────────────────────
    @action(detail=False, methods=["get"], url_path="my")
    def my_outward(self, request):
        """Return outwards assigned to the current user (receiver view)."""
        rights = _assessment_rights(request.user)
        if not rights["can_view"]:
            return self._deny("Assessment module access denied.")
        qs = AssessmentOutward.objects.filter(
            receiver_user=request.user
        ).prefetch_related(
            "details__entry",
            "details__received_by",
            "details__returned_by",
            "details__final_received_by",
        ).select_related("generated_by", "receiver_user").order_by("-created_at")
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    # ─── GET /api/assessment-outward/my-role/ ────────────────────────────────
    @action(detail=False, methods=["get"], url_path="my-role")
    def my_role(self, request):
        """
        Return the requesting user's assessment role.
        Used by the frontend to render the correct panel.
          controller  – admin / staff
          receiver    – assigned as receiver_user on any outward,
                        OR has view-only permission (can_view && !can_create)
          entry       – everyone else with can_view
        """
        if _is_admin_like(request.user):
            return Response({"role": "controller"})

        rights = _assessment_rights(request.user)
        if not rights["can_view"]:
            return Response({"role": "entry"})

        # Most reliable receiver signal: user is actually assigned in an outward
        is_assigned_receiver = AssessmentOutward.objects.filter(
            receiver_user=request.user
        ).exists()

        if is_assigned_receiver or not rights["can_create"]:
            return Response({"role": "receiver"})

        return Response({"role": "entry"})

    # ─── POST /api/assessment-outward/receive-entry/ ─────────────────────────
    @action(detail=False, methods=["post"], url_path="receive-entry")
    def receive_entry(self, request):
        """
        Mark a single OutwardDetails row as received.

        Payload:
            {
                "detail_id": <int>,
                "remark": "optional text"
            }
        """
        detail_id = request.data.get("detail_id")
        remark = request.data.get("remark", "")

        rights = _assessment_rights(request.user)
        if not rights["can_view"]:
            return self._deny("Assessment module access denied.")

        if not detail_id:
            return Response(
                {"detail": "detail_id is required."}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            detail = AssessmentOutwardDetails.objects.select_related(
                "outward", "entry"
            ).get(id=detail_id)
        except AssessmentOutwardDetails.DoesNotExist:
            return Response(
                {"detail": "Detail record not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # Only the assigned receiver or admin may mark received.
        if not (
            _is_admin_like(request.user)
            or detail.outward.receiver_user == request.user
        ):
            return Response(
                {"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN
            )
        # Extra lock: receiver-only users cannot act on outwards not assigned to them
        if _is_receiver_only(request.user) and detail.outward.receiver_user != request.user:
            return Response({"detail": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        if detail.receive_status == "Received":
            return Response(
                {"detail": "Already received."}, status=status.HTTP_400_BAD_REQUEST
            )

        detail.receive_status = "Received"
        detail.received_by = request.user
        detail.received_date = timezone.now()
        detail.receive_remark = remark
        detail.save()

        # Update parent entry status
        entry = detail.entry
        entry.status = "InProgress"
        entry.save(update_fields=["status"])

        # Mark outward as completed when all details received
        any_pending = AssessmentOutwardDetails.objects.filter(
            outward=detail.outward, receive_status="Pending"
        ).exists()
        if not any_pending:
            detail.outward.status = "Completed"
            detail.outward.save(update_fields=["status"])

        return Response({"message": "Received successfully."})

    # ─── POST /api/assessment-outward/return-entry/ ─────────────────────────
    @action(detail=False, methods=["post"], url_path="return-entry")
    def return_entry(self, request):
        """
        Mark one or more received detail rows as returned by receiver (D user).

        Payload:
            {
                "detail_id": <int>,
                "remark": "optional text"
            }

            OR

            {
                "items": [
                    {"detail_id": 12, "remark": "ok"},
                    {"detail_id": 13, "remark": "check"}
                ]
            }
        """
        rights = _assessment_rights(request.user)
        if not rights["can_view"]:
            return self._deny("Assessment module access denied.")

        items = request.data.get("items")
        if isinstance(items, list) and items:
            normalized = []
            for item in items:
                detail_id = item.get("detail_id")
                if detail_id is None:
                    continue
                try:
                    parsed_id = int(detail_id)
                except (TypeError, ValueError):
                    continue
                normalized.append(
                    {
                        "detail_id": parsed_id,
                        "remark": item.get("remark", ""),
                    }
                )
        else:
            detail_id = request.data.get("detail_id")
            if detail_id is None:
                normalized = []
            else:
                try:
                    parsed_id = int(detail_id)
                except (TypeError, ValueError):
                    parsed_id = None
                normalized = [
                    {
                        "detail_id": parsed_id,
                        "remark": request.data.get("remark", ""),
                    }
                ] if parsed_id is not None else []

        if not normalized:
            return Response(
                {"detail": "detail_id or items is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        detail_ids = [it["detail_id"] for it in normalized]
        details = list(
            AssessmentOutwardDetails.objects.select_related(
                "entry", "entry__added_by", "outward", "outward__receiver_user"
            ).filter(id__in=detail_ids)
        )
        details_by_id = {d.id: d for d in details}

        if len(details_by_id) != len(set(detail_ids)):
            return Response(
                {"detail": "One or more detail records were not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Extra lock: receiver-only users may only return from their assigned outwards
        if _is_receiver_only(request.user):
            for d in details:
                if d.outward.receiver_user != request.user:
                    return Response(
                        {"detail": "Access denied."},
                        status=status.HTTP_403_FORBIDDEN,
                    )

        return_no = generate_return_outward_no()
        now = timezone.now()

        for payload in normalized:
            detail = details_by_id[payload["detail_id"]]
            remark = payload["remark"]

            if not (
                _is_admin_like(request.user)
                or detail.outward.receiver_user == request.user
            ):
                return Response(
                    {"detail": "Permission denied."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            if detail.receive_status != "Received":
                return Response(
                    {"detail": f"Detail {detail.id} must be received before return."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if detail.return_status == "Returned":
                return Response(
                    {"detail": f"Detail {detail.id} already returned."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            detail.return_status = "Returned"
            detail.returned_by = request.user
            detail.returned_date = now
            detail.return_remark = remark
            detail.return_outward_no = return_no
            detail.save(
                update_fields=[
                    "return_status",
                    "returned_by",
                    "returned_date",
                    "return_remark",
                    "return_outward_no",
                ]
            )

            entry = detail.entry
            if entry.status != "Completed":
                entry.status = "Returned"
                entry.save(update_fields=["status"])

        return Response(
            {
                "message": "Returned successfully.",
                "return_outward_no": return_no,
                "count": len(normalized),
            }
        )

    # ─── POST /api/assessment-outward/final-receive/ ───────────────────────
    @action(detail=False, methods=["post"], url_path="final-receive")
    def final_receive(self, request):
        """
        Mark a returned entry as finally received by original entry owner (A user).

        Payload:
            {
                "detail_id": <int>,
                "remark": "optional text"
            }
        """
        detail_id = request.data.get("detail_id")
        remark = request.data.get("remark", "")

        rights = _assessment_rights(request.user)
        if not rights["can_view"]:
            return self._deny("Assessment module access denied.")

        if not detail_id:
            return Response(
                {"detail": "detail_id is required."}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            detail = AssessmentOutwardDetails.objects.select_related(
                "entry", "entry__added_by"
            ).get(id=detail_id)
        except AssessmentOutwardDetails.DoesNotExist:
            return Response(
                {"detail": "Detail record not found."}, status=status.HTTP_404_NOT_FOUND
            )

        if not (
            _is_admin_like(request.user)
            or detail.entry.added_by == request.user
        ):
            return Response(
                {"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN
            )

        if detail.return_status != "Returned":
            return Response(
                {"detail": "Not returned yet."}, status=status.HTTP_400_BAD_REQUEST
            )

        if detail.entry.status == "Completed":
            return Response(
                {"detail": "Already completed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        detail.final_received_by = request.user
        detail.final_received_date = timezone.now()
        detail.final_receive_remark = remark
        detail.final_receive_status = "Received"
        detail.save(
            update_fields=[
                "final_received_by",
                "final_received_date",
                "final_receive_remark",
                "final_receive_status",
            ]
        )

        detail.entry.status = "Completed"
        detail.entry.save(update_fields=["status"])

        return Response({"message": "Final received successfully."})
