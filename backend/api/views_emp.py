from rest_framework import viewsets, permissions, generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Q
from django.utils import timezone
from datetime import date

from .domain_emp import (
    EmpProfile,
    LeaveType,
    LeaveEntry,
    LeavePeriod,
    LeaveAllocation,
)

from .serializers_emp import (
    EmpProfileSerializer,
    LeaveTypeSerializer,
    LeaveEntrySerializer,
    LeavePeriodSerializer,
    LeaveAllocationSerializer,
)

from .domain_leave_balance import computeLeaveBalances


# ============================================================
# USER IDENTIFICATION HELPERS
# ============================================================

def _user_identifiers(user):
    """Match user → EmpProfile.username / usercode."""
    vals = []
    for f in ("username", "usercode"):
        try:
            v = getattr(user, f, None)
            if v:
                vals.append(str(v))
        except:
            pass
    return vals


def _profiles_matching_identifiers(qs, identifiers):
    """Return profiles whose username/usercode matches user."""
    valid = [i for i in identifiers if i]
    if not valid:
        return qs.none()

    q = Q()
    for ident in valid:
        q |= Q(username__iexact=ident) | Q(usercode__iexact=ident)

    return qs.filter(q)


def _first_profile_for_user(user):
    """Return logged-in user's EmpProfile."""
    return _profiles_matching_identifiers(
        EmpProfile.objects.all(),
        _user_identifiers(user)
    ).first()


def _profile_matches_user(profile, user):
    """Check if this profile belongs to the logged-in employee."""
    identifiers = set(i.lower() for i in _user_identifiers(user) if i)
    if not identifiers:
        return False

    for f in ("username", "usercode"):
        v = getattr(profile, f, None)
        if v and str(v).lower() in identifiers:
            return True

    return False


# ============================================================
# PERMISSIONS
# ============================================================

class IsLeaveManager(permissions.BasePermission):
    """Admin / Staff / HR (leave_management group)"""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_staff or user.is_superuser:
            return True
        return user.groups.filter(name__iexact="leave_management").exists()


class IsOwnerOrHR(permissions.BasePermission):
    """Employees see own data. HR/Managers/Admin see all."""

    def has_permission(self, request, view):
        user = request.user
        return user and user.is_authenticated

    def has_object_permission(self, request, view, obj):
        user = request.user

        # Admin / HR / Manager
        if user.is_staff or user.is_superuser or IsLeaveManager().has_permission(request, view):
            return True

        # If object contains an employee reference
        if isinstance(obj, EmpProfile):
            return _profile_matches_user(obj, user)

        if hasattr(obj, "emp") and isinstance(obj.emp, EmpProfile):
            return _profile_matches_user(obj.emp, user)

        return False


# ============================================================
# LEAVE PERIOD API
# ============================================================

class LeavePeriodListView(generics.ListCreateAPIView):
    queryset = LeavePeriod.objects.all().order_by("-start_date")
    serializer_class = LeavePeriodSerializer
    permission_classes = [IsLeaveManager]


# ============================================================
# LEAVE ALLOCATION API (YOU APPROVED FINAL RULES)
# ============================================================

class LeaveAllocationListView(generics.ListCreateAPIView):
    serializer_class = LeaveAllocationSerializer
    permission_classes = [IsLeaveManager]

    def get_queryset(self):
        """Return only allocations for selected period."""
        period_id = self.request.query_params.get("period")
        qs = LeaveAllocation.objects.select_related("period").all()

        if period_id:
            qs = qs.filter(period_id=period_id)

        return qs

    def post(self, request, *args, **kwargs):
        data = request.data

        leave_code = data.get("leave_code")
        period_id = data.get("period")
        apply_to = data.get("apply_to", "ALL")
        allocated = data.get("allocated")
        emp_id = data.get("emp_id")  # only for particular

        # --- VALIDATION ---
        if not leave_code:
            return Response({"detail": "leave_code is required"}, status=400)
        if not period_id:
            return Response({"detail": "period is required"}, status=400)
        if allocated is None:
            return Response({"detail": "allocated is required"}, status=400)

        try:
            allocated_val = float(allocated)
        except:
            return Response({"detail": "allocated must be a number"}, status=400)

        period = LeavePeriod.objects.filter(id=period_id).first()
        if not period:
            return Response({"detail": "LeavePeriod not found"}, status=404)

        lt = LeaveType.objects.filter(leave_code=leave_code).first()
        if not lt:
            return Response({"detail": "LeaveType not found"}, status=404)

        # =======================================================
        # APPLY_TO = PARTICULAR
        # =======================================================
        if apply_to == "PARTICULAR":
            if not emp_id:
                return Response({"detail": "emp_id required for PARTICULAR allocation"}, status=400)

            prof = EmpProfile.objects.filter(emp_id=str(emp_id)).first()
            if not prof:
                return Response({"detail": "Employee not found"}, status=404)

            obj, created = LeaveAllocation.objects.get_or_create(
                leave_code=leave_code,
                period=period,
                emp=prof,
                defaults={"allocated": allocated_val},
            )
            if not created:
                obj.allocated = allocated_val
                obj.save()

            return Response(LeaveAllocationSerializer(obj).data, status=201)

        # =======================================================
        # APPLY_TO = ALL
        # =======================================================
        obj = LeaveAllocation.objects.create(
            leave_code=leave_code,
            apply_to="ALL",
            period=period,
            emp=None,
            allocated=allocated_val
        )

        return Response(LeaveAllocationSerializer(obj).data, status=201)


# ============================================================
# LEAVE ALLOCATION DETAIL API
# ============================================================

class LeaveAllocationDetailView(APIView):
    permission_classes = [IsLeaveManager]

    def patch(self, request, pk):
        obj = LeaveAllocation.objects.filter(id=pk).first()
        if not obj:
            return Response({"detail": "Not found"}, status=404)

        data = request.data

        if "allocated" in data:
            try:
                obj.allocated = float(data["allocated"])
            except:
                return Response({"detail": "allocated must be numeric"}, status=400)

        if "allocated_start_date" in data:
            obj.allocated_start_date = data["allocated_start_date"] or None

        if "allocated_end_date" in data:
            obj.allocated_end_date = data["allocated_end_date"] or None

        obj.updated_at = timezone.now()
        obj.save()

        return Response(LeaveAllocationSerializer(obj).data)

    def delete(self, request, pk):
        obj = LeaveAllocation.objects.filter(id=pk).first()
        if not obj:
            return Response({"detail": "Not found"}, status=404)
        obj.delete()
        return Response(status=204)


# ============================================================
# LEAVE ENTRY API
# ============================================================

class LeaveEntryViewSet(viewsets.ModelViewSet):
    queryset = LeaveEntry.objects.select_related("emp", "leave_type").all()
    serializer_class = LeaveEntrySerializer
    permission_classes = [IsOwnerOrHR]

    def get_queryset(self):
        """Employees see only their own leaves."""
        user = self.request.user
        qs = super().get_queryset()

        if user.is_staff or user.is_superuser or IsLeaveManager().has_permission(self.request, self):
            return qs

        ids = _user_identifiers(user)
        if not ids:
            return qs.none()

        q = Q()
        for ident in ids:
            q |= Q(emp__username__iexact=ident) | Q(emp__usercode__iexact=ident) | Q(emp__emp_id__iexact=ident)

        return qs.filter(q)

    def perform_create(self, serializer):
        """Managers create anything. Employees only their own leaves."""
        user = self.request.user

        is_manager = (
            user.is_staff or user.is_superuser or IsLeaveManager().has_permission(self.request, self)
        )

        if not is_manager:
            profile = _first_profile_for_user(user)
            if not profile:
                raise PermissionError("Profile not found")

            emp = serializer.validated_data.get("emp")
            if isinstance(emp, EmpProfile):
                if emp.emp_id != profile.emp_id:
                    raise PermissionError("Not allowed to create for other users")
            else:
                if str(emp) != profile.emp_id:
                    raise PermissionError("Not allowed to create for other users")

        serializer.save(created_by=user.username)


# ============================================================
# MY LEAVE BALANCE VIEW
# ============================================================

class MyLeaveBalanceView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        profile = _first_profile_for_user(request.user)
        if not profile:
            return Response({"detail": "Profile not found"}, status=404)

        period = LeavePeriod.objects.order_by("-start_date").first()
        if not period:
            return Response({"detail": "No leave periods found"}, status=404)

        result = computeLeaveBalances(
            leaveCalculationDate=None,
            selectedPeriodId=period.id
        )

        # Find this employee in payload
        emp_data = next(
            (e for e in result["employees"] if str(e["emp_id"]) == str(profile.emp_id)),
            None
        )
        if not emp_data:
            return Response({"detail": "Employee not included"}, status=404)

        return Response(emp_data)


# ============================================================
# LEAVE REPORT VIEW
# ============================================================

class LeaveReportView(APIView):
    permission_classes = [IsLeaveManager]

    def get(self, request):
        period_param = request.query_params.get("period")
        try:
            period_id = int(period_param) if period_param else None
        except:
            return Response({"detail": "Invalid period id"}, status=400)

        payload = computeLeaveBalances(None, period_id)
        return Response(payload)


# ============================================================
# EMP PROFILE API
# ============================================================

class EmpProfileViewSet(viewsets.ModelViewSet):
    queryset = EmpProfile.objects.all()
    serializer_class = EmpProfileSerializer
    permission_classes = [IsOwnerOrHR]

    def get_queryset(self):
        user = self.request.user

        if user.is_staff or user.is_superuser or IsLeaveManager().has_permission(self.request, self):
            return EmpProfile.objects.all()

        return _profiles_matching_identifiers(
            EmpProfile.objects.all(),
            _user_identifiers(user)
        )
