from rest_framework import viewsets, permissions
from .domain_emp import EmpProfile, LeaveType, LeaveEntry
from .serializers_emp import EmpProfileSerializer, LeaveTypeSerializer, LeaveEntrySerializer
from django.db.models import Q

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

class EmpProfileViewSet(viewsets.ModelViewSet):
	queryset = EmpProfile.objects.all()
	serializer_class = EmpProfileSerializer
	permission_classes = [IsOwnerOrHR]

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
		# HR/Admin: see all
		if user.is_staff or user.is_superuser:
			return qs
		# Employees: see own leaves only
		return qs.filter(emp__userid=getattr(user, 'username', None))
