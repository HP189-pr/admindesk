from rest_framework import viewsets, permissions
from rest_framework.views import APIView
from .domain_emp import EmpProfile, LeaveType, LeaveEntry
from .serializers_emp import EmpProfileSerializer, LeaveTypeSerializer, LeaveEntrySerializer
from django.db.models import Q
from .domain_emp import LeavePeriod, LeaveAllocation
from .serializers_emp import LeavePeriodSerializer, LeaveAllocationSerializer
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from datetime import timedelta, date
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from django.utils import timezone
from .domain_leave_balance import compute_leave_balances, computeLeaveBalances, LeaveComputationConfig


def _user_identifiers(user):
	values = []
	for attr in ('username', 'usercode'):
		try:
			val = getattr(user, attr, None)
		except Exception:
			val = None
		if val:
			values.append(str(val))
	return values


def _profiles_matching_identifiers(qs, identifiers):
	valid = [i for i in identifiers if i]
	if not valid:
		return qs.none()
	lookup = Q()
	for ident in valid:
		lookup |= Q(username__iexact=ident) | Q(usercode__iexact=ident)
	return qs.filter(lookup)


def _first_profile_for_user(user):
	return _profiles_matching_identifiers(EmpProfile.objects.all(), _user_identifiers(user)).first()


def _profile_matches_user(profile, user):
	identifiers = {i.lower() for i in _user_identifiers(user)}
	if not identifiers:
		return False
	for attr in ('username', 'usercode'):
		val = getattr(profile, attr, None)
		if val and str(val).lower() in identifiers:
			return True
	return False


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
		user = request.user
		if not user or not user.is_authenticated:
			return False
		if user.is_staff or user.is_superuser:
			return True
		if isinstance(obj, EmpProfile):
			return _profile_matches_user(obj, user)
		if hasattr(obj, 'emp') and isinstance(getattr(obj, 'emp'), EmpProfile):
			return _profile_matches_user(getattr(obj, 'emp'), user)
		identifiers = {i.lower() for i in _user_identifiers(user)}
		if not identifiers:
			return False
		for attr in ('username', 'usercode'):
			if hasattr(obj, attr):
				val = getattr(obj, attr)
				if val and str(val).lower() in identifiers:
					return True
		return False


class LeavePeriodListView(generics.ListCreateAPIView):
	queryset = LeavePeriod.objects.all().order_by('-start_date')
	serializer_class = LeavePeriodSerializer
	permission_classes = [IsLeaveManager]


class LeaveAllocationListView(generics.ListCreateAPIView):
	"""List and create LeaveAllocation records.

	POST payload expects fields (profile_id nullable), period_id, leave_type_code (or leave_type), allocated.
	If profile_id is blank/null the implementation will insert a NULL profile allocation (legacy default row) using SQL.
	"""
	serializer_class = LeaveAllocationSerializer
	permission_classes = [IsLeaveManager]

	def get_queryset(self):
		# Avoid joining the `profile` relation by default because some legacy
		# databases store mixed types in `api_leaveallocation.emp_id` (bigint)
		# while `EmpProfile.emp_id` may be varchar — that causes SQL type
		# mismatch errors when Django emits a JOIN. Selectively include
		# `leave_type` and `period` relations which are safe, and if the DB
		# still fails, fall back to an un-joined queryset to prevent 500s.
		try:
			qs = LeaveAllocation.objects.select_related('leave_type', 'period').all()
		except Exception:
			import traceback
			print("[WARN] LeaveAllocationListView.select_related failed, falling back to non-joined queryset")
			traceback.print_exc()
			qs = LeaveAllocation.objects.all()
		# DEBUG: log caller identity and auth headers to help diagnose admin UI visibility issues
		try:
			user = getattr(self.request, 'user', None)
			uname = getattr(user, 'username', None) if user else None
			is_auth = bool(user and user.is_authenticated)
			is_staff = bool(user and getattr(user, 'is_staff', False))
			groups = []
			try:
				groups = [g.name for g in user.groups.all()] if user else []
			except Exception:
				groups = []
			auth_hdr = self.request.META.get('HTTP_AUTHORIZATION') if hasattr(self.request, 'META') else None
			print(f"[DEBUG] LeaveAllocationListView called by: user={uname} authenticated={is_auth} is_staff={is_staff} groups={groups} Authorization={'present' if auth_hdr else 'missing'})")
		except Exception:
			# avoid breaking the view on debug logging failures
			pass
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

	def post(self, request, *args, **kwargs):
		data = request.data or {}
		profile_id = data.get('profile_id')
		period_id = data.get('period_id') or data.get('period')
		leave_code = data.get('leave_type_code') or data.get('leave_type')
		allocated = data.get('allocated')

		# validation
		if not period_id:
			return Response({'detail': 'period_id is required'}, status=status.HTTP_400_BAD_REQUEST)
		if not leave_code:
			return Response({'detail': 'leave_type_code is required'}, status=status.HTTP_400_BAD_REQUEST)

		try:
			# ensure period exists
			period = LeavePeriod.objects.filter(id=period_id).first()
			if not period:
				return Response({'detail': 'LeavePeriod not found'}, status=status.HTTP_404_NOT_FOUND)

			# ensure leave type exists
			lt = LeaveType.objects.filter(leave_code=leave_code).first()
			if not lt:
				return Response({'detail': 'LeaveType not found'}, status=status.HTTP_404_NOT_FOUND)

			# parse allocated
			try:
				allocated_val = float(allocated) if allocated is not None and allocated != '' else 0.0
			except Exception:
				return Response({'detail': 'allocated must be a number'}, status=status.HTTP_400_BAD_REQUEST)

			# if profile_id provided and not blank, create via ORM
			if profile_id not in (None, '', 'null'):
				# accept numeric id
				try:
					prof = EmpProfile.objects.filter(id=int(profile_id)).first()
				except Exception:
					prof = EmpProfile.objects.filter(emp_id=str(profile_id)).first()
				if not prof:
					return Response({'detail': 'EmpProfile not found'}, status=status.HTTP_404_NOT_FOUND)

				# create or update existing allocation
				obj, created = LeaveAllocation.objects.get_or_create(profile=prof, leave_type=lt, period=period, defaults={'allocated': allocated_val})
				if not created:
					obj.allocated = allocated_val
					obj.save()
				return Response({'id': obj.id, 'profile': obj.profile.id if obj.profile else None, 'leave_type': getattr(obj.leave_type, 'leave_code', obj.leave_type), 'allocated': float(obj.allocated), 'period': obj.period.id})

			# profile_id is null/blank -> insert a default allocation row with NULL profile_id using SQL (legacy table structure)
			from django.db import connection
			with connection.cursor() as cur:
				# Attempt to insert into the underlying table. Columns may vary across deployments; use common columns.
				# use empty-string for leave_code when none provided to avoid NOT NULL constraint errors on some schemas
				lc_param = leave_code if leave_code is not None else ''
				cur.execute("INSERT INTO api_leaveallocation (profile_id, leave_code, allocated, period_id, created_at, updated_at) VALUES (NULL, %s, %s, %s, now(), now()) RETURNING id", [lc_param, allocated_val, period.id])
				new_id = cur.fetchone()[0]
			return Response({'id': new_id, 'profile': None, 'leave_type': leave_code, 'allocated': allocated_val, 'period': period.id}, status=status.HTTP_201_CREATED)
		except Exception as e:
			return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class LeaveAllocationDetailView(APIView):
	"""Allow authorized managers to update a single LeaveAllocation (allocated amount)."""
	permission_classes = [IsLeaveManager]

	def patch(self, request, pk, *args, **kwargs):
		from django.db import connection
		val = request.data.get('allocated')
		if val is None:
			return Response({'detail': 'allocated is required'}, status=status.HTTP_400_BAD_REQUEST)
		try:
			# use numeric cast safety
			allocated = float(val)
		except Exception:
			return Response({'detail': 'allocated must be a number'}, status=status.HTTP_400_BAD_REQUEST)
		try:
			# update via ORM update to avoid managed=False save issues
			updated = LeaveAllocation.objects.filter(pk=pk).update(allocated=allocated, updated_at=timezone.now())
			if not updated:
				return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
			return Response({'id': pk, 'allocated': allocated})
		except Exception as e:
			return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

	def get(self, request, pk, *args, **kwargs):
		try:
			obj = LeaveAllocation.objects.select_related('profile', 'leave_type', 'period').get(pk=pk)
			data = {
				'id': obj.id,
				'profile': obj.profile.id if obj.profile else None,
				'leave_type': getattr(obj.leave_type, 'leave_code', obj.leave_type),
				'allocated': float(obj.allocated),
				'period': obj.period.id if obj.period else None,
			}
			return Response(data)
		except LeaveAllocation.DoesNotExist:
			return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

	def delete(self, request, pk, *args, **kwargs):
		# allow managers to delete an allocation row
		try:
			# attempt ORM delete first
			deleted, _ = LeaveAllocation.objects.filter(pk=pk).delete()
			if deleted:
				return Response(status=status.HTTP_204_NO_CONTENT)
			# fallback: try raw SQL delete for legacy table name
			from django.db import connection
			with connection.cursor() as cur:
				cur.execute("DELETE FROM api_leaveallocation WHERE id=%s", [pk])
				if cur.rowcount:
					return Response(status=status.HTTP_204_NO_CONTENT)
			return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
		except Exception as e:
			return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class MyLeaveBalanceView(generics.GenericAPIView):
	permission_classes = [IsAuthenticated]

	def get(self, request, *args, **kwargs):
		# find profile linked to the authenticated user via userid/username/usercode
		profile = _first_profile_for_user(request.user)
		if not profile:
			return Response({'detail': 'Profile not found'}, status=status.HTTP_404_NOT_FOUND)

		period = LeavePeriod.objects.filter(is_active=True).first()
		if not period:
			return Response({'detail': 'No active leave period.'}, status=status.HTTP_404_NOT_FOUND)

		# Use the centralized computation so business rules (prorating, waiting periods,
		# split-across-periods) are consistent with reports and persisted snapshots.
		try:
			payload = computeLeaveBalances(leaveCalculationDate=None, selectedPeriodId=period.id)
		except Exception:
			# fallback: if computation fails, return a helpful error
			import traceback
			traceback.print_exc()
			return Response({'detail': 'Failed to compute leave balances'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

		metadata = payload.get('metadata', {})
		tracked_codes = list(metadata.get('tracked_leave_codes', ())) or ['EL', 'CL', 'SL', 'VAC']

		# find the employee entry matching this profile
		emp_entry = None
		for e in payload.get('employees', []):
			if e.get('emp_id') == profile.emp_id or str(e.get('emp_id')) == str(profile.emp_id):
				emp_entry = e
				break

		if not emp_entry:
			# no computed entry for this user (possible if not in scope); return empty structured payload
			codes_payload = {code: {
				'starting_balance': 0.0,
				'period_allocation': 0.0,
				'used_in_period': 0.0,
				'ending_balance': 0.0,
				'allocation_applied': False,
				'allocation_reason': None,
				'original_allocation': 0.0,
				'effective_allocation': 0.0,
			} for code in tracked_codes}
			return Response({
				'period': {'id': period.id, 'name': period.period_name, 'start': period.start_date.isoformat(), 'end': period.end_date.isoformat()},
				'tracked_codes': tracked_codes,
				'codes': codes_payload,
				'emp_id': profile.emp_id,
				'emp_name': profile.emp_name,
			})

		# pick the period entry for the active period
		period_entry = next((p for p in emp_entry.get('periods', []) if p.get('period_id') == period.id), None)
		if not period_entry:
			# ensure we return something consistent even if the period data is missing
			period_entry = {
				'period_id': period.id,
				'period_name': period.period_name,
				'period_start': period.start_date,
				'period_end': period.end_date,
				'starting': {code: 0.0 for code in tracked_codes},
				'allocation': {code: 0.0 for code in tracked_codes},
				'used': {code: 0.0 for code in tracked_codes},
				'ending': {code: 0.0 for code in tracked_codes},
				'allocation_meta': {code: {'original_allocation': 0.0, 'effective_allocation': 0.0, 'applied': False, 'reason': None} for code in tracked_codes},
			}

		codes_payload = {}
		for code in tracked_codes:
			alloc_meta = period_entry.get('allocation_meta', {}).get(code) or {}
			codes_payload[code] = {
				'starting_balance': float(period_entry.get('starting', {}).get(code, 0.0)),
				'period_allocation': float(period_entry.get('allocation', {}).get(code, 0.0)),
				'used_in_period': float(period_entry.get('used', {}).get(code, 0.0)),
				'ending_balance': float(period_entry.get('ending', {}).get(code, 0.0)),
				'allocation_applied': bool(alloc_meta.get('applied', False)),
				'allocation_reason': alloc_meta.get('reason'),
				'original_allocation': float(alloc_meta.get('original_allocation', period_entry.get('allocation', {}).get(code, 0.0))),
				'effective_allocation': float(alloc_meta.get('effective_allocation', period_entry.get('allocation', {}).get(code, 0.0))),
			}

		return Response({
			'period': {'id': period.id, 'name': period.period_name, 'start': period.start_date.isoformat(), 'end': period.end_date.isoformat()},
			'tracked_codes': tracked_codes,
			'codes': codes_payload,
			'emp_id': profile.emp_id,
			'emp_name': profile.emp_name,
			'position': getattr(profile, 'emp_designation', None),
			'joining_date': getattr(profile, 'actual_joining', None).isoformat() if getattr(profile, 'actual_joining', None) else None,
			'leaving_date': getattr(profile, 'left_date', None).isoformat() if getattr(profile, 'left_date', None) else None,
		})

class LeaveReportView(APIView):
		"""Return per-employee leave balances for a selected period."""

		permission_classes = [IsLeaveManager]

		def get(self, request, *args, **kwargs):
			period_param = request.query_params.get('period')
			emp_param = request.query_params.get('emp_id')

			# Use the new computeLeaveBalances backend function which implements
			# effective-joining and prorated CL rules exactly. Fall back to the
			# older compute_leave_balances if necessary.
			try:
				period_id = int(period_param) if period_param else None
			except Exception:
				period_id = None
			payload = computeLeaveBalances(leaveCalculationDate=None, selectedPeriodId=period_id)
			metadata = payload.get('metadata', {})
			periods_meta = metadata.get('periods', [])
			tracked_codes = list(metadata.get('tracked_leave_codes', ())) or ['EL', 'CL', 'SL', 'VAC']

			def _serialise_period(period_dict):
				if not period_dict:
					return None
				return {
					'id': period_dict.get('id'),
					'name': period_dict.get('name'),
					'start': period_dict.get('start').isoformat() if isinstance(period_dict.get('start'), date) else period_dict.get('start'),
					'end': period_dict.get('end').isoformat() if isinstance(period_dict.get('end'), date) else period_dict.get('end'),
				}

			selected_period = None
			if period_param:
				try:
					period_id = int(period_param)
				except ValueError:
					return Response({'detail': 'Invalid period parameter'}, status=status.HTTP_400_BAD_REQUEST)
				selected_period = next((p for p in periods_meta if p['id'] == period_id), None)
			else:
				selected_period = periods_meta[-1] if periods_meta else None

			if not selected_period:
				return Response({'detail': 'No leave periods found'}, status=status.HTTP_404_NOT_FOUND)

			selected_period_id = selected_period['id']
			employee_payload = payload.get('employees', [])
			emp_ids = [emp['emp_id'] for emp in employee_payload if emp.get('emp_id')]
			profiles = EmpProfile.objects.filter(emp_id__in=emp_ids)
			profile_map = {prof.emp_id: prof for prof in profiles}

			default_meta = {
				'original_allocation': 0.0,
				'effective_allocation': 0.0,
				'applied': False,
				'reason': None,
			}

			rows = []
			for emp_data in employee_payload:
				period_entry = next((p for p in emp_data.get('periods', []) if p['period_id'] == selected_period_id), None)
				if not period_entry:
					period_entry = {
						'period_id': selected_period_id,
						'period_name': selected_period.get('name'),
						'period_start': selected_period.get('start'),
						'period_end': selected_period.get('end'),
						'starting': {code: 0.0 for code in tracked_codes},
						'allocation': {code: 0.0 for code in tracked_codes},
						'used': {code: 0.0 for code in tracked_codes},
						'ending': {code: 0.0 for code in tracked_codes},
						'allocation_meta': {code: default_meta.copy() for code in tracked_codes},
					}

				codes_payload = {}
				for code in tracked_codes:
					alloc_meta = period_entry.get('allocation_meta', {}).get(code)
					if not alloc_meta:
						alloc_meta = default_meta
					codes_payload[code] = {
						'starting_balance': float(period_entry['starting'].get(code, 0.0)),
						'period_allocation': float(period_entry['allocation'].get(code, 0.0)),
						'used_in_period': float(period_entry['used'].get(code, 0.0)),
						'ending_balance': float(period_entry['ending'].get(code, 0.0)),
						'allocation_applied': bool(alloc_meta.get('applied', False)),
						'allocation_reason': alloc_meta.get('reason'),
						'original_allocation': float(alloc_meta.get('original_allocation', period_entry['allocation'].get(code, 0.0))),
						'effective_allocation': float(alloc_meta.get('effective_allocation', period_entry['allocation'].get(code, 0.0))),
					}

				profile = profile_map.get(emp_data.get('emp_id'))
				rows.append({
					'emp_id': emp_data.get('emp_id'),
					'emp_name': emp_data.get('emp_name'),
					'position': getattr(profile, 'emp_designation', None) if profile else None,
					'leave_group': getattr(profile, 'leave_group', None) if profile else None,
					'joining_date': getattr(profile, 'actual_joining', None).isoformat() if profile and getattr(profile, 'actual_joining', None) else None,
					'leaving_date': getattr(profile, 'left_date', None).isoformat() if profile and getattr(profile, 'left_date', None) else None,
					'period': {
						'id': period_entry['period_id'],
						'name': period_entry.get('period_name'),
						'start': period_entry.get('period_start').isoformat() if isinstance(period_entry.get('period_start'), date) else period_entry.get('period_start'),
						'end': period_entry.get('period_end').isoformat() if isinstance(period_entry.get('period_end'), date) else period_entry.get('period_end'),
					},
					'codes': codes_payload,
				})

			rows.sort(key=lambda r: (r['emp_id'] or ""))

			return Response({
				'period': _serialise_period(selected_period),
				'periods': [_serialise_period(p) for p in periods_meta],
				'tracked_codes': tracked_codes,
				'rows': rows,
				'overdrawn': metadata.get('overdrawn', []),
				'generated_at': timezone.now().isoformat(),
				'employee_count': len(rows),
			})
class EmpProfileViewSet(viewsets.ModelViewSet):
	queryset = EmpProfile.objects.all()
	serializer_class = EmpProfileSerializer
	permission_classes = [IsOwnerOrHR]

	def create(self, request, *args, **kwargs):
		# Temporary debug logging for incoming create requests from Admin UI
		try:
			user = request.user
			print(f"[DEBUG] EmpProfile create requested by: {getattr(user, 'username', None)} (is_staff={getattr(user, 'is_staff', None)})")
			print("[DEBUG] Payload:", request.data)
		except Exception as e:
			print("[DEBUG] Failed to print request debug info:", e)

		# Also persist debug info to a file for easier retrieval
		try:
			import json, os
			log_path = os.path.join(os.path.dirname(__file__), '..', 'debug_empprofile_create.log')
			# ensure directory exists (backend/api) and append
			with open(log_path, 'a', encoding='utf-8') as f:
				f.write(json.dumps({'user': getattr(user, 'username', None), 'payload': request.data}) + "\n")
		except Exception:
			# ignore file write issues
			pass

		# Proceed with normal create but capture serializer errors to log
		serializer = self.get_serializer(data=request.data)
		if not serializer.is_valid():
			print("[DEBUG] Serializer errors:", serializer.errors)
			return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
		self.perform_create(serializer)
		# After create, synchronize usr_birth_date/usercode into auth_user and set default password if needed
		try:
			profile = EmpProfile.objects.get(emp_id=serializer.data.get('emp_id') or serializer.data.get('emp_id'))
			birth = profile.usr_birth_date or profile.emp_birth_date
			identifiers = [i for i in (profile.username, profile.usercode) if i]
			if identifiers:
				from django.db import connection
				try:
					with connection.cursor() as cur:
						cur.execute("SELECT 1 FROM information_schema.columns WHERE table_name='auth_user' AND column_name='usr_birth_date'")
						has_birth_column = bool(cur.fetchone())
						cur.execute("SELECT 1 FROM information_schema.columns WHERE table_name='auth_user' AND column_name='usercode'")
						has_usercode_column = bool(cur.fetchone())
						for ident in identifiers:
							if has_birth_column:
								if birth:
									cur.execute("UPDATE auth_user SET usr_birth_date = %s WHERE username = %s", [birth, ident])
								else:
									cur.execute("UPDATE auth_user SET usr_birth_date = NULL WHERE username = %s", [ident])
							if has_usercode_column:
								cur.execute("UPDATE auth_user SET usercode = %s WHERE username = %s", [profile.usercode, ident])
				except Exception:
					# ignore DB sync errors for auth_user updates
					pass
				from django.contrib.auth import get_user_model
				User = get_user_model()
				u = User.objects.filter(username__in=identifiers).first()
				if u:
					try:
						needs = (not u.has_usable_password()) or (not u.password)
					except Exception:
						needs = not u.password
					if needs and birth:
						pw = birth.strftime('%d%m%y')
						u.set_password(pw)
						u.save()
		except Exception as e:
			print("[DEBUG] Post-create sync failed:", e)
		headers = self.get_success_headers(serializer.data)
		print("[DEBUG] Created EmpProfile:", serializer.data)
		return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

	def get_queryset(self):
		user = self.request.user
		qs = super().get_queryset()
		# Managers/staff see all profiles
		if user.is_staff or user.is_superuser or IsLeaveManager().has_permission(self.request, self):
			return qs
		# Regular users see only their own profile
		return _profiles_matching_identifiers(qs, _user_identifiers(user))

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


class LeavePeriodViewSet(viewsets.ModelViewSet):
	"""Full CRUD for leave periods so frontend can edit/activate periods.
	Activating a period will trigger allocation seeding via signal (server-side).
	"""
	queryset = LeavePeriod.objects.all().order_by('-start_date')
	serializer_class = LeavePeriodSerializer
	permission_classes = [IsLeaveManager]


from rest_framework.views import APIView


class SeedLeaveAllocationsView(APIView):
	"""Admin endpoint to seed allocations for a given period (or active period if none provided).

	POST payload: { "period_id": <int> } (optional)
	Returns created_count and skipped_count.
	"""
	permission_classes = [IsLeaveManager]

	def post(self, request, *args, **kwargs):
		period_id = request.data.get('period_id') or request.query_params.get('period_id')
		try:
			if period_id:
				period = LeavePeriod.objects.filter(id=int(period_id)).first()
			else:
				period = LeavePeriod.objects.filter(is_active=True).first()
			if not period:
				return Response({'detail': 'LeavePeriod not found'}, status=status.HTTP_404_NOT_FOUND)

			types = LeaveType.objects.filter(is_active=True)
			profiles = EmpProfile.objects.all()
			created = 0
			skipped = 0
			for p in profiles:
				for lt in types:
					if not LeaveAllocation.objects.filter(profile=p, leave_type=lt, period=period).exists():
						try:
							LeaveAllocation.objects.create(profile=p, leave_type=lt, period=period, allocated=(lt.annual_allocation or 0))
							created += 1
						except Exception:
							skipped += 1
					else:
						skipped += 1
			return Response({'created': created, 'skipped': skipped}, status=status.HTTP_200_OK)
		except Exception as e:
			return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class LeaveTypeCompatView(APIView):
	"""Compatibility endpoint: read leave types via raw SQL and return normalized fields.
	This avoids ORM errors when the model and DB schema differ in column names.
	"""
	permission_classes = [IsOwnerOrHR]

	def get(self, request, *args, **kwargs):
		from django.db import connection
		try:
			with connection.cursor() as cur:
				cur.execute("SELECT leave_code, leave_name, parent_leave, leave_unit, leave_mode, annual_limit, is_half, id FROM api_leavetype")
				rows = cur.fetchall()
				cols = [c[0] for c in cur.description]
			data = []
			for r in rows:
				obj = dict(zip(cols, r))
				# normalize names expected by frontend
				data.append({
					'leave_code': obj.get('leave_code'),
					'leave_name': obj.get('leave_name'),
					'main_type': obj.get('parent_leave'),
					'day_value': obj.get('leave_unit'),
					'session': obj.get('leave_mode'),
					'annual_allocation': obj.get('annual_limit'),
					'is_half': obj.get('is_half'),
					'id': obj.get('id'),
				})
			return Response(data)
		except Exception as e:
			return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class LeavePeriodCompatView(APIView):
	"""Return leave periods with a relaxed permission check so frontend can list periods for editing UI.
	"""
	permission_classes = [IsOwnerOrHR]

	def get(self, request, *args, **kwargs):
		try:
			qs = LeavePeriod.objects.all().order_by('-start_date')
			data = []
			for p in qs:
				data.append({
					'id': p.id,
					'period_name': p.period_name,
					'start_date': str(p.start_date),
					'end_date': str(p.end_date),
					'description': p.description,
					'is_active': p.is_active,
				})
			return Response(data)
		except Exception as e:
			return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

	def post(self, request, *args, **kwargs):
		# create a new leave type via SQL
		data = request.data or {}
		leave_code = data.get('leave_code')
		leave_name = data.get('leave_name')
		parent = data.get('main_type') or data.get('parent_leave') or leave_code
		day_value = data.get('day_value') or data.get('leave_unit') or 1
		session = data.get('session') or data.get('leave_mode')
		annual = data.get('annual_allocation') or data.get('annual_limit')
		is_half = bool(data.get('is_half'))
		from django.db import connection
		try:
			with connection.cursor() as cur:
				cur.execute(
					"INSERT INTO api_leavetype (leave_code, leave_name, parent_leave, leave_unit, leave_mode, annual_limit, is_half, created_at, updated_at) VALUES (%s,%s,%s,%s,%s,%s,%s,now(),now()) RETURNING id",
					[leave_code, leave_name, parent, day_value, session, annual, is_half]
				)
				new_id = cur.fetchone()[0]
			return Response({'id': new_id, 'leave_code': leave_code, 'leave_name': leave_name}, status=status.HTTP_201_CREATED)
		except Exception as e:
			return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class LeaveTypeCompatDetailView(APIView):
	permission_classes = [IsOwnerOrHR]

	def put(self, request, pk, *args, **kwargs):
		data = request.data or {}
		leave_name = data.get('leave_name')
		parent = data.get('main_type') or data.get('parent_leave')
		day_value = data.get('day_value') or data.get('leave_unit')
		session = data.get('session') or data.get('leave_mode')
		annual = data.get('annual_allocation') or data.get('annual_limit')
		is_half = bool(data.get('is_half'))
		from django.db import connection
		try:
			with connection.cursor() as cur:
				cur.execute(
					"UPDATE api_leavetype SET leave_name=%s, parent_leave=%s, leave_unit=%s, leave_mode=%s, annual_limit=%s, is_half=%s, updated_at=now() WHERE id=%s",
					[leave_name, parent, day_value, session, annual, is_half, pk]
				)
			return Response({'id': pk, 'leave_name': leave_name})
		except Exception as e:
			return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

	def delete(self, request, pk, *args, **kwargs):
		from django.db import connection
		try:
			with connection.cursor() as cur:
				cur.execute("DELETE FROM api_leavetype WHERE id=%s", [pk])
			return Response(status=status.HTTP_204_NO_CONTENT)
		except Exception as e:
			return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

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
		identifiers = _user_identifiers(user)
		if not identifiers:
			return qs.none()
		lookup = Q()
		for ident in identifiers:
			# Match by linked EmpProfile fields: username, usercode or emp_id
			lookup |= Q(emp__username__iexact=ident) | Q(emp__usercode__iexact=ident) | Q(emp__emp_id__iexact=ident)
		return qs.filter(lookup)

	def perform_create(self, serializer):
		# Managers can create entries for any employee. Regular users may create only for themselves.
		user = self.request.user
		is_manager = (user.is_staff or user.is_superuser or IsLeaveManager().has_permission(self.request, self))
		if is_manager:
			# Managers may create entries directly; but if dates span multiple periods we will split into one-per-period rows
			start = serializer.validated_data.get('start_date')
			end = serializer.validated_data.get('end_date')
			if start and end and end >= start:
				# find overlapping periods and split
				periods = LeavePeriod.objects.filter(end_date__gte=start, start_date__lte=end).order_by('start_date')
				if periods.count() <= 1:
					serializer.save(created_by=getattr(user, 'username', None))
					return
				# otherwise split per period
				for per in periods:
					s = max(start, per.start_date)
					e = min(end, per.end_date)
					data = dict(serializer.validated_data)
					data['start_date'] = s
					data['end_date'] = e
					# create individual entry
					from .serializers_emp import LeaveEntrySerializer
					ss = LeaveEntrySerializer(data=data)
					ss.is_valid(raise_exception=True)
					ss.save(created_by=getattr(user, 'username', None))
				return
			# fallback
			serializer.save(created_by=getattr(user, 'username', None))
			return
		# regular user: ensure emp in payload matches their profile
		from rest_framework.exceptions import PermissionDenied
		my_profile = _first_profile_for_user(user)
		if not my_profile:
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
