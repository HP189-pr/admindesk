"""
Assessment System – DRF ViewSets
"""
from datetime import date

from django.db.models import Q
from django.utils import timezone
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
from .services_assessment import generate_outward_no


# ─────────────────────────────────────────────
# Assessment Entry ViewSet
# ─────────────────────────────────────────────

class AssessmentEntryViewSet(ModelViewSet):
    """CRUD for AssessmentEntry. Non-admin users see only their own entries."""

    permission_classes = [IsAuthenticated]
    serializer_class = AssessmentEntrySerializer

    def get_queryset(self):
        user = self.request.user
        qs = AssessmentEntry.objects.select_related("added_by", "outward")

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
        serializer.save(added_by=self.request.user, status="Pending")

    # GET /api/assessment-entry/pending/
    @action(detail=False, methods=["get"], url_path="pending")
    def pending(self, request):
        """Return all entries not yet attached to an outward (status=Pending)."""
        qs = AssessmentEntry.objects.filter(outward__isnull=True).order_by("-created_at")
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    # GET /api/assessment-entry/all/  (superuser / officer helper)
    @action(detail=False, methods=["get"], url_path="all")
    def all_entries(self, request):
        user = request.user
        if not (user.is_superuser or user.is_staff):
            return Response(
                {"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN
            )
        qs = AssessmentEntry.objects.select_related("added_by", "outward").order_by(
            "-created_at"
        )
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)


# ─────────────────────────────────────────────
# Assessment Outward ViewSet
# ─────────────────────────────────────────────

class AssessmentOutwardViewSet(ModelViewSet):
    """Outward dispatch management."""

    permission_classes = [IsAuthenticated]
    serializer_class = AssessmentOutwardSerializer

    def get_queryset(self):
        user = self.request.user
        if user.is_superuser or user.is_staff:
            return AssessmentOutward.objects.prefetch_related(
                "details__entry", "details__received_by"
            ).select_related("generated_by", "receiver_user").order_by("-created_at")

        # Regular users see outwards they generated OR are assigned to receive
        return AssessmentOutward.objects.filter(
            Q(generated_by=user) | Q(receiver_user=user)
        ).prefetch_related(
            "details__entry", "details__received_by"
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
        qs = AssessmentOutward.objects.filter(
            receiver_user=request.user
        ).prefetch_related(
            "details__entry", "details__received_by"
        ).select_related("generated_by", "receiver_user").order_by("-created_at")
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

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

        # Only the assigned receiver (or admin) can mark received
        if not (
            request.user.is_superuser
            or request.user.is_staff
            or detail.outward.receiver_user == request.user
        ):
            return Response(
                {"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN
            )

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
        still_pending = AssessmentOutwardDetails.objects.filter(
            outward=detail.outward, receive_status="Pending"
        ).exists()

        if still_pending:
            entry.status = "PartiallyReceived"
        else:
            entry.status = "Received"
        entry.save(update_fields=["status"])

        # Mark outward as completed when all details received
        if not still_pending:
            # check ALL details under this outward
            any_pending = AssessmentOutwardDetails.objects.filter(
                outward=detail.outward, receive_status="Pending"
            ).exists()
            if not any_pending:
                detail.outward.status = "Completed"
                detail.outward.save(update_fields=["status"])

        return Response({"message": "Received successfully."})
