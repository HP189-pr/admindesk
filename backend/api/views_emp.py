from rest_framework import viewsets, permissions
from .domain_emp import EmpProfile, LeaveType, LeaveEntry
from .serializers_emp import EmpProfileSerializer, LeaveTypeSerializer, LeaveEntrySerializer
from django.db.models import Q
from .domain_emp import LeavePeriod, LeaveAllocation
from .serializers_emp import LeavePeriodSerializer, LeaveAllocationSerializer
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated


class IsLeaveManager(permissions.BasePermission):
	"""Allow access if user is staff/superuser or belongs to leave_management group."""
	def has_permission(self, request, view):
		user = request.user
		if not user or not user.is_authenticated:
			return False
		if user.is_staff or user.is_superuser:
			return True
		return user.groups.filter(name__iexact='leave_management').exists()


class IsOwnerOrHR(permissions.BasePermission):
	def has_permission(self, request, view):
		# HR/Admin: is_staff or is_superuser
		return request.user and (request.user.is_staff or request.user.is_superuser or request.user.is_authenticated)

	def has_object_permission(self, request, view, obj):
		# Employees: can only see own leaves
		if hasattr(obj, 'userid'):
			return obj.userid == getattr(request.user, 'username', None) or request.user.is_staff or request.user.is_superuser
		if hasattr(obj, 'emp'):
			return obj.emp.userid == getattr(request.user, 'username', None) or request.user.is_staff or request.user.is_superuser
		return request.user.is_staff or request.user.is_superuser


class LeavePeriodListView(generics.ListCreateAPIView):
	queryset = LeavePeriod.objects.all().order_by('-start_date')
	serializer_class = LeavePeriodSerializer
	permission_classes = [IsLeaveManager]


class LeaveAllocationListView(generics.ListAPIView):
	serializer_class = LeaveAllocationSerializer
	permission_classes = [IsLeaveManager]

	def get_queryset(self):
		qs = LeaveAllocation.objects.select_related('profile', 'leave_type', 'period').all()
		period = self.request.query_params.get('period')
		institute = self.request.query_params.get('institute')
		if period:
			qs = qs.filter(period_id=period)
		else:
			active = LeavePeriod.objects.filter(is_active=True).first()
			if active:
				qs = qs.filter(period=active)
		if institute:
			qs = qs.filter(profile__institute_id__iexact=institute)
		return qs


class MyLeaveBalanceView(generics.GenericAPIView):
	permission_classes = [IsAuthenticated]

	def get(self, request, *args, **kwargs):
		# find profile by userid
		user = request.user
		try:
			profile = EmpProfile.objects.get(userid=getattr(user, 'username', None))
		except EmpProfile.DoesNotExist:
			return Response({'detail': 'Profile not found'}, status=status.HTTP_404_NOT_FOUND)

		period = LeavePeriod.objects.filter(is_active=True).first()
		if not period:
			return Response({'detail': 'No active leave period.'}, status=status.HTTP_404_NOT_FOUND)

		# helper: get the most recent snapshot on or before a date
		from .domain_emp import LeaveBalanceSnapshot

		def get_snapshot_before(profile, as_of_date):
			snap = LeaveBalanceSnapshot.objects.filter(profile=profile, balance_date__lte=as_of_date).order_by('-balance_date').first()
			return snap

		# load allocations for the active period
		allocs = LeaveAllocation.objects.filter(profile=profile, period=period).select_related('leave_type')
		data = []
		for a in allocs:
			lt = a.leave_type
			# previous balance snapshot (if any) taken before period start or as provided
			snap = get_snapshot_before(profile, period.start_date)
			prev_bal = 0.0
			if snap:
				# map leave code to snapshot field
				if lt.leave_code.lower().startswith('el'):
					prev_bal = float(snap.el_balance)
				elif lt.leave_code.lower().startswith('sl'):
					prev_bal = float(snap.sl_balance)
				elif lt.leave_code.lower().startswith('cl'):
					prev_bal = float(snap.cl_balance)
				else:
					prev_bal = float(snap.vacation_balance)

			# joining year allocation (special one-time allocations stored on profile)
			joining_alloc = 0.0
			code = lt.leave_code.lower()
			if 'el' in code:
				joining_alloc = float(profile.joining_year_allocation_el or 0)
			elif 'sl' in code:
				joining_alloc = float(profile.joining_year_allocation_sl or 0)
			elif 'cl' in code:
				joining_alloc = float(profile.joining_year_allocation_cl or 0)
			else:
				joining_alloc = float(profile.joining_year_allocation_vac or 0)

			# compute prorated allocation: if the employee joined after period start or transferred
			period_days = (period.end_date - period.start_date).days + 1
			prorated = float(a.allocated)
			if profile.actual_joining:
				# if joined after period start, prorate remaining
				if profile.actual_joining > period.start_date and profile.actual_joining <= period.end_date:
					remaining_days = (period.end_date - profile.actual_joining).days + 1
					prorated = round(float(a.allocated) * (remaining_days / period_days), 2)

			# used days for allocation (already considers overlap)
			used = a.used_days()
			final_balance = prev_bal + joining_alloc + prorated - used

			data.append({
				'leave_type': lt.leave_code,
				'leave_type_name': lt.leave_name,
				'previous_balance': prev_bal,
				'joining_allocation': joining_alloc,
				'period_allocation': float(a.allocated),
				'prorated_allocation': prorated,
				'used': used,
				'final_balance': round(float(final_balance), 2)
			})

		return Response(data)

 

class EmpProfileViewSet(viewsets.ModelViewSet):
	queryset = EmpProfile.objects.all()
	serializer_class = EmpProfileSerializer
	permission_classes = [IsOwnerOrHR]

	def get_queryset(self):
		user = self.request.user
		qs = super().get_queryset()
		# Managers/staff see all profiles
		if user.is_staff or user.is_superuser or IsLeaveManager().has_permission(self.request, self):
			return qs
		# Regular users see only their own profile
		return qs.filter(userid=getattr(user, 'username', None))

class LeaveTypeViewSet(viewsets.ModelViewSet):
	queryset = LeaveType.objects.all()
	serializer_class = LeaveTypeSerializer
	permission_classes = [IsOwnerOrHR]

	def get_queryset(self):
		qs = super().get_queryset()
		active = self.request.query_params.get('active')
		if active == '1':
			qs = qs.filter(is_active=True)
		return qs

class LeaveEntryViewSet(viewsets.ModelViewSet):
	queryset = LeaveEntry.objects.select_related('emp', 'leave_type').all()
	serializer_class = LeaveEntrySerializer
	permission_classes = [IsOwnerOrHR]

	def get_queryset(self):
		user = self.request.user
		qs = super().get_queryset()
		# HR/Admin/leave managers: see all
		if user.is_staff or user.is_superuser or IsLeaveManager().has_permission(self.request, self):
			return qs
		# Employees: see own leaves only
		return qs.filter(emp__userid=getattr(user, 'username', None))

	def perform_create(self, serializer):
		# Managers can create entries for any employee. Regular users may create only for themselves.
		user = self.request.user
		is_manager = (user.is_staff or user.is_superuser or IsLeaveManager().has_permission(self.request, self))
		if is_manager:
			serializer.save(created_by=getattr(user, 'username', None))
			return
		# regular user: ensure emp in payload matches their profile
		from rest_framework.exceptions import PermissionDenied
		try:
			my_profile = EmpProfile.objects.get(userid=getattr(user, 'username', None))
		except EmpProfile.DoesNotExist:
			raise PermissionDenied('Profile not found for current user')
		emp_payload = serializer.validated_data.get('emp')
		# emp_payload might be EmpProfile instance or emp_id string
		if isinstance(emp_payload, EmpProfile):
			emp_id_val = emp_payload.emp_id
		else:
			emp_id_val = str(emp_payload)
		if emp_id_val != my_profile.emp_id:
			raise PermissionDenied('Cannot create leave for other employees')
		serializer.save(created_by=getattr(user, 'username', None))

	def perform_update(self, serializer):
		if not (self.request.user.is_staff or self.request.user.is_superuser or IsLeaveManager().has_permission(self.request, self)):
			from rest_framework.exceptions import PermissionDenied
			raise PermissionDenied('Not allowed to update leave entries')
		serializer.save()

	def perform_destroy(self, instance):
		if not (self.request.user.is_staff or self.request.user.is_superuser or IsLeaveManager().has_permission(self.request, self)):
			from rest_framework.exceptions import PermissionDenied
			raise PermissionDenied('Not allowed to delete leave entries')
		instance.delete()
