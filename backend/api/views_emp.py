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
from datetime import timedelta
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from django.utils import timezone


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
		qs = LeaveAllocation.objects.select_related('profile', 'leave_type', 'period').all()
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
			# Determine previous balance -- for CL carry-forward is not allowed (reset to 0)
			prev_bal = 0.0
			if snap:
				if lt.leave_code.lower().startswith('el'):
					prev_bal = float(snap.el_balance)
				elif lt.leave_code.lower().startswith('sl'):
					prev_bal = float(snap.sl_balance)
				elif lt.leave_code.lower().startswith('cl'):
					# CL does not carry forward per general rules
					prev_bal = 0.0
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

			# Determine period allocation considering several scenarios
			period_days = (period.end_date - period.start_date).days + 1
			base_alloc = float(a.allocated)
			period_alloc = base_alloc

			# Case A: transfer or snapshot exists before period start -> treat as existing employee (no 365 rule)
			has_prior_snapshot = snap is not None

			# Case B: fresh join after leave management started (no snapshot and actual_joining > period.start_date)
			if profile.actual_joining and (not has_prior_snapshot) and profile.actual_joining > period.start_date:
				# For EL/SL apply 365-day waiting period (no EL/SL until 1 year after joining)
				if lt.leave_code.lower().startswith(('el', 'sl')):
					wait_until = profile.actual_joining + timedelta(days=365)
					# If waiting period extends beyond the period end, allocation this period is 0
					if wait_until > period.end_date:
						period_alloc = 0.0
					else:
						# prorate from wait_until (or period.start) to period.end_date
						eff_start = max(period.start_date, wait_until)
						remaining_days = (period.end_date - eff_start).days + 1
						period_alloc = round(base_alloc * (remaining_days / period_days), 2)
				else:
					# For other leave types (CL/VAC), prorate from actual_joining to period end if needed
					if profile.actual_joining > period.start_date and profile.actual_joining <= period.end_date:
						rema = (period.end_date - profile.actual_joining).days + 1
						period_alloc = round(base_alloc * (rema / period_days), 2)

			# Case C: Joined before or on period.start_date OR has prior snapshot -> full allocation (or prorated by joining within period)
			if profile.actual_joining and profile.actual_joining > period.start_date and profile.actual_joining <= period.end_date and has_prior_snapshot:
				# If they have a snapshot and joined within the period window (unlikely), allow prorated allocation from actual_joining
				effective_days = (period.end_date - profile.actual_joining).days + 1
				period_alloc = round(base_alloc * (effective_days / period_days), 2)

			# Final used days for allocation (overlap-aware)
			used = a.used_days()

			# Final balance = previous balance (subject to CL reset) + joining special allocation + period allocation - used
			final_balance = prev_bal + joining_alloc + period_alloc - used

			data.append({
				'leave_type': lt.leave_code,
				'leave_type_name': lt.leave_name,
				'previous_balance': round(float(prev_bal), 2),
				'joining_allocation': round(float(joining_alloc), 2),
				'period_allocation': round(float(base_alloc), 2),
				'computed_period_allocation': round(float(period_alloc), 2),
				'used': round(float(used), 2),
				'final_balance': round(float(final_balance), 2),
			})

		return Response(data)


class LeaveReportView(APIView):
	"""Return aggregated leave report per employee for a given period.

	Query params: ?period=<id> (optional, defaults to active period)

	Rules implemented (pragmatic approximation):
	- Start balances come from latest LeaveBalanceSnapshot before period.start_date or from EmpProfile fields.
	- Allocations are read from legacy table `leavea_llocation_general` (profile-specific first, then profile_id IS NULL as defaults).
	- If no allocation row exists, fallback to LeaveType.annual_allocation.
	- Used days are summed from `leave_entry` for Approved entries overlapping the period.
	- CL does not carry forward (previous balance zeroed). EL/SL may carry forward from snapshot.
	- New joiners: EL/SL subject to 365-day waiting rule (no EL/SL until 1 year after actual_joining) unless snapshot exists.
	- Prorating and rounding: allocations prorated by days in period and rounded to nearest 0.5.
	"""

	permission_classes = [IsLeaveManager]

	def get(self, request, *args, **kwargs):
		from django.db import connection
		period_id = request.query_params.get('period')
		if period_id:
			period = LeavePeriod.objects.filter(id=period_id).first()
		else:
			period = LeavePeriod.objects.filter(is_active=True).first()
		if not period:
			return Response({'detail': 'Leave period not found'}, status=status.HTTP_404_NOT_FOUND)

		# helper rounding to 0.5
		def round_half(x):
			try:
				return round(float(x) * 2) / 2.0
			except Exception:
				return 0.0

		# load leave types
		ltypes = list(LeaveType.objects.all())
		# map code -> LeaveType
		lt_map = {lt.leave_code: lt for lt in ltypes}

		# fetch all employee profiles (respect permissions: managers can see all)
		profiles = EmpProfile.objects.all()

		report = []

		for p in profiles:
			emp_row = {
				'emp_id': p.emp_id,
				'emp_name': p.emp_name,
				'position': p.emp_designation,
				'leave_group': p.leave_group,
				'joining_date': str(p.actual_joining) if p.actual_joining else None,
				'leaving_date': str(p.left_date) if p.left_date else None,
			}

			# baseline start date for iterative calculation
			base_date = p.leave_calculation_date or None
			# if no explicit calculation date, fallback to earliest snapshot before period.start_date
			if not base_date:
				from .domain_emp import LeaveBalanceSnapshot
				snap = LeaveBalanceSnapshot.objects.filter(profile=p).order_by('balance_date').first()
				if snap:
					base_date = snap.balance_date
			# final fallback: use the earliest period start
			if not base_date:
				first_period = LeavePeriod.objects.order_by('start_date').first()
				base_date = first_period.start_date if first_period else period.start_date

			# initialize balances from profile values at base_date (use profile fields as snapshot)
			bal_el = float(p.el_balance or 0)
			bal_sl = float(p.sl_balance or 0)
			bal_cl = float(p.cl_balance or 0)
			bal_vac = float(p.vacation_balance or 0)

			# iterate ordered periods from base_date up to and including the requested period
			periods_seq = list(LeavePeriod.objects.filter(start_date__lte=period.start_date).order_by('start_date'))
			# keep only those starting at or after base_date
			periods_seq = [pr for pr in periods_seq if pr.start_date >= base_date]

			# if no periods found in range, include the requested period only
			if not periods_seq:
				periods_seq = [period]

			# helper: find allocation value for a profile, period and leave type
			def get_alloc_for(prof, per, lt_obj):
				# try ORM first
				try:
					al = LeaveAllocation.objects.filter(profile=prof, period=per, leave_type=lt_obj).first()
					if al:
						return float(al.allocated)
				except Exception:
					pass
				# fallback: try legacy table
				from django.db import connection
				with connection.cursor() as cur:
					cur.execute("SELECT allocated_el, allocated_cl, allocated_sl, allocated_vac FROM leavea_llocation_general WHERE period_id=%s AND leave_code=%s AND (profile_id=%s OR profile_id IS NULL) ORDER BY profile_id IS NOT NULL DESC LIMIT 1", [per.id, lt_obj.leave_code, prof.id])
					row = cur.fetchone()
					if row:
						# pick appropriate column based on lt
						code = (lt_obj.leave_code or '').lower()
						if code.startswith('el'):
							return float(row[2] or row[0] or 0)
						if code.startswith('sl'):
							return float(row[1] or row[0] or 0)
						if code.startswith('cl'):
							return float(row[1] or 0)
						return float(row[3] or 0)
				# final fallback: LeaveType annual allocation
				try:
					return float(lt_obj.annual_allocation or 0)
				except Exception:
					return 0.0

			# iterate
			for per in periods_seq:
				# CL resets to 0 at start of each period per rules
				bal_cl = 0.0
				period_days = (per.end_date - per.start_date).days + 1
				# compute used for this profile during this period per leave code
				entries = LeaveEntry.objects.filter(emp__emp_id=p.emp_id, status__iexact='Approved', end_date__gte=per.start_date, start_date__lte=per.end_date).select_related('leave_type')
				used_this = {}
				for e in entries:
					start_clamped = max(e.start_date, per.start_date)
					end_clamped = min(e.end_date, per.end_date)
					if end_clamped >= start_clamped:
						overlap_days = (end_clamped - start_clamped).days + 1
						day_value = float(e.leave_type.day_value if getattr(e, 'leave_type', None) else 1)
						used_days = overlap_days * day_value
						code = (getattr(e.leave_type, 'leave_code', '') or '').lower()
						used_this[code] = used_this.get(code, 0.0) + float(used_days)

				# for each leave type compute allocation, apply joiner rules and update balances
				for lt in ltypes:
					code = (lt.leave_code or '').lower()
					alloc_val = get_alloc_for(p, per, lt)
					computed_alloc = float(alloc_val or 0)
					# joining & waiting rules for EL/SL
					if p.actual_joining and code.startswith(('el', 'sl')):
						wait_until = p.actual_joining + timedelta(days=365)
						if wait_until > per.end_date:
							computed_alloc = 0.0
						else:
							eff_start = max(per.start_date, wait_until)
							remaining_days = (per.end_date - eff_start).days + 1
							computed_alloc = round(float(alloc_val or 0) * (remaining_days / period_days), 2)
							computed_alloc = round_half(computed_alloc)

					# joining-year special allocation from profile fields
					joining_alloc = 0.0
					if 'el' in code:
						joining_alloc = float(p.joining_year_allocation_el or 0)
					elif 'sl' in code:
						joining_alloc = float(p.joining_year_allocation_sl or 0)
					elif 'cl' in code:
						joining_alloc = float(p.joining_year_allocation_cl or 0)
					else:
						joining_alloc = float(p.joining_year_allocation_vac or 0)

					used_val = 0.0
					for k, v in used_this.items():
						if k.startswith(code):
							used_val += v

					# update running balances
					if code.startswith('el'):
						bal_el = round_half(bal_el + joining_alloc + computed_alloc - used_val)
					elif code.startswith('sl'):
						bal_sl = round_half(bal_sl + joining_alloc + computed_alloc - used_val)
					elif code.startswith('cl'):
						bal_cl = round_half(bal_cl + joining_alloc + computed_alloc - used_val)
					else:
						bal_vac = round_half(bal_vac + joining_alloc + computed_alloc - used_val)

			# capture used values from the last iterated period (used_last)
			try:
				used_last
			except NameError:
				used_last = {}

			# compute allocation values for the requested period
			alloc_cl = 0.0
			alloc_sl = 0.0
			alloc_el = 0.0
			alloc_vac = 0.0
			for lt in ltypes:
				code = (lt.leave_code or '').lower()
				val = get_alloc_for(p, period, lt)
				if code.startswith('cl') and alloc_cl == 0.0:
					alloc_cl = val
				elif code.startswith('sl') and alloc_sl == 0.0:
					alloc_sl = val
				elif code.startswith('el') and alloc_el == 0.0:
					alloc_el = val
				elif not code.startswith(('el', 'sl', 'cl')) and alloc_vac == 0.0:
					alloc_vac = val

			used_cl_val = sum(v for k, v in (used_last or {}).items() if k.startswith('cl'))
			used_sl_val = sum(v for k, v in (used_last or {}).items() if k.startswith('sl'))
			used_el_val = sum(v for k, v in (used_last or {}).items() if k.startswith('el'))

			emp_row.update({
				'balance_start': {'CL': 0.0, 'SL': float(p.sl_balance or 0), 'EL': float(p.el_balance or 0)},
				'allocation': {'CL': alloc_cl, 'SL': alloc_sl, 'EL': alloc_el, 'VAC': alloc_vac},
				'used': {'CL': used_cl_val, 'SL': used_sl_val, 'EL': used_el_val},
				'balance_end': {'CL': bal_cl, 'SL': bal_sl, 'EL': bal_el},
			})

			report.append(emp_row)

		return Response({'period': {'id': period.id, 'start_date': str(period.start_date), 'end_date': str(period.end_date)}, 'report': report})

 

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
