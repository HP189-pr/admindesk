"""File: backend/api/serializers.py
Legacy aggregated serializer module.

Status: Split into modular files:
    - serializers_core.py
    - serializers_courses.py
    - serializers_documents.py

For backward compatibility existing imports still work; new code should import
from the modular files where practical.
"""

# Re-export all for backward compatibility
from .serializers_core import *  # noqa: F401,F403
from .serializers_courses import *  # noqa: F401,F403
from .serializers_documents import *  # noqa: F401,F403
from .serializers_mail_request import *  # noqa: F401,F403


from rest_framework import serializers
from django.contrib.auth.hashers import check_password
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.utils import timezone
from django.db import transaction
from .models import Holiday, UserProfile, User, Module, Menu, UserPermission, DashboardPreference, Enrollment, Institute, MainBranch, SubBranch, InstituteCourseOffering, Verification, VerificationStatus, DocRec, MigrationRecord, ProvisionalRecord, InstVerificationMain, InstVerificationStudent, Eca, StudentProfile, ProvisionalStatus
from django.conf import settings

# --- Holiday Serializer ---
class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = "__all__"

# --- Login Serializer (Uses `username` as identifier) ---
class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        try:
            user = User.objects.get(username__iexact=data["username"].strip())
        except User.DoesNotExist:
            raise serializers.ValidationError("Invalid username or password.")  # Generic error

        if not user.check_password(data["password"]):  # Use the built-in `check_password`
            raise serializers.ValidationError("Invalid username or password.")

        return {
            "id": user.id,
            "username": user.username,
            "name": user.get_full_name(),  # Use the built-in `get_full_name` method
            "usertype": user.usertype
        }

# --- User Serializer ---
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        exclude = ["password"]  # Never expose passwords in API responses

# --- Change Password Serializer ---
class ChangePasswordSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate(self, data):
        try:
            user = User.objects.get(id=data["id"])
        except User.DoesNotExist:
            raise serializers.ValidationError("Invalid user credentials.")

        if not user.check_password(data["old_password"]):  # Use the built-in `check_password`
            raise serializers.ValidationError("Invalid user credentials.")

        if len(data["new_password"]) < 8:
            raise serializers.ValidationError("New password must be at least 8 characters long.")

        return data

    def save(self):
        user = User.objects.get(id=self.validated_data["id"])
        user.set_password(self.validated_data["new_password"])  # Use the built-in `set_password`
        user.updated_at = timezone.now()

        with transaction.atomic():
            user.save()

        return user

# --- User Profile Serializer (kept similar but adapted) ---
class UserProfileSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(source="user.first_name", required=False)
    last_name = serializers.CharField(source="user.last_name", required=False)
    email = serializers.EmailField(source="user.email", required=False)
    username = serializers.CharField(source="user.username", read_only=True)
    is_admin = serializers.SerializerMethodField()
    profile_picture = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = [
            "username", "first_name", "last_name", "email",
            "phone", "address", "city", "profile_picture",
            "state", "country", "bio", "social_links", "is_admin"
        ]
        extra_kwargs = {
            "profile_picture": {"required": False},
        }

    def get_profile_picture(self, obj):
            if obj.profile_picture:
                request = self.context.get('request')
                if request:
                    # Use settings.MEDIA_URL to stay flexible
                    media_url = settings.MEDIA_URL  # usually "/media/"
                    full_url = request.build_absolute_uri(f"{media_url}{obj.profile_picture}")
                    return full_url
                # Fallback if request is missing (rare)
                return f"{settings.MEDIA_URL}{obj.profile_picture}"

            return None

    def get_is_admin(self, obj):
        """Determine admin status based on Django user flags/groups."""
        user = obj.user
        try:
            # Treat either superuser, staff, or membership in an "Admin" group as admin
            return bool(
                getattr(user, "is_superuser", False)
                or getattr(user, "is_staff", False)
                or user.groups.filter(name__iexact="Admin").exists()
                or user.groups.filter(id=1).exists()
            )
        except Exception:
            return False

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})

        # Update auth_user fields (first_name, last_name, email)
        user = instance.user
        for attr, value in user_data.items():
            setattr(user, attr, value)
        user.save()

        # Update UserProfile fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save()
        return instance

# --- Verify Password Serializer ---
class VerifyPasswordSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        request = self.context.get('request')
        user = request.user

        if not user.check_password(data['password']):  # Use the built-in `check_password`
            raise serializers.ValidationError("Invalid password.")

        return data

# --- Custom TokenObtainPairSerializer (For JWT Login) ---
class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data['user_id'] = self.user.id  # Use `id` (not `userid`) for the user ID
        return data


class DashboardPreferenceSerializer(serializers.ModelSerializer):
    """Serialize per-user dashboard module selections.

    Only exposes the list of selected module keys; user is always the
    authenticated request.user and is not writable from the client.
    """

    class Meta:
        model = DashboardPreference
        fields = ["selected_modules"]

# ✅ Module Serializer
class ModuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Module
        fields = "__all__"

# ✅ Menu Serializer
class MenuSerializer(serializers.ModelSerializer):
    module_name = serializers.CharField(source="module.name", read_only=True)  # Fetch module name

    class Meta:
        model = Menu
        fields = "__all__"

# ✅ User Permission Serializer
class UserPermissionSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    module_name = serializers.CharField(source="module.name", read_only=True)
    menu_name = serializers.CharField(source="menu.name", read_only=True)

    class Meta:
        model = UserPermission
        fields = "__all__"

# ✅ Institute Serializer
class InstituteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Institute
        fields = '__all__'

# ✅ Main Branch Serializer
class MainBranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = MainBranch
        fields = '__all__'

# ✅ Sub Branch Serializer
class SubBranchSerializer(serializers.ModelSerializer):
    # Expose the raw FK value (varchar) to filter on the frontend
    maincourse_id = serializers.CharField(source="maincourse.maincourse_id", read_only=True)

    class Meta:
        model = SubBranch
        fields = ['id', 'subcourse_id', 'subcourse_name', 'maincourse', 'maincourse_id', 'updated_by', 'created_at', 'updated_at']

# ✅ Enrollment Serializer
class EnrollmentSerializer(serializers.ModelSerializer):
    # Write-only fields for IDs
    institute_id = serializers.PrimaryKeyRelatedField(
        queryset=Institute.objects.all(),
        source='institute',
        write_only=True
    )
    maincourse_id = serializers.PrimaryKeyRelatedField(
        queryset=MainBranch.objects.all(),
        source='maincourse',
        write_only=True
    )
    subcourse_id = serializers.PrimaryKeyRelatedField(
        queryset=SubBranch.objects.all(),
        source='subcourse',
        write_only=True
    )
    
    class Meta:
        model = Enrollment
        fields = [
            'enrollment_no', 'student_name', 
            'institute', 'institute_id',
            'batch', 'enrollment_date', 'admission_date',
            'subcourse', 'subcourse_id',
            'maincourse', 'maincourse_id',
            'updated_by', 'created_at', 'updated_at', 'temp_enroll_no'
        ]
        read_only_fields = [
            'enrollment_date', 'created_at', 'updated_at',
            'institute', 'subcourse', 'maincourse', 'updated_by'
        ]
        extra_kwargs = {
            'enrollment_no': {'required': True},
            'student_name': {'required': True},
            'batch': {'required': True}
        }

    def to_representation(self, instance):
        """Enhanced representation with related object details"""
        data = super().to_representation(instance)
        
        # Add detailed representation of related objects
        representation_map = {
            # Use pk to be agnostic of primary key field name (e.g., institute_id)
            'institute': lambda x: {'id': x.pk, 'name': str(x)} if x else None,
            'subcourse': lambda x: {'id': x.pk, 'name': str(x)} if x else None,
            'maincourse': lambda x: {'id': x.pk, 'name': str(x)} if x else None,
            'updated_by': lambda x: {'id': x.pk, 'username': x.username} if x else None
        }

        for field, transform in representation_map.items():
            if field in data:
                data[field] = transform(getattr(instance, field))
        
        return data

# ✅ Institute-wise Course Offering Serializer
class InstituteCourseOfferingSerializer(serializers.ModelSerializer):
    institute_id = serializers.PrimaryKeyRelatedField(
        queryset=Institute.objects.all(), source="institute", write_only=True
    )
    maincourse_id = serializers.PrimaryKeyRelatedField(
        queryset=MainBranch.objects.all(), source="maincourse", write_only=True
    )
    subcourse_id = serializers.PrimaryKeyRelatedField(
        queryset=SubBranch.objects.all(), source="subcourse", write_only=True, allow_null=True, required=False
    )

    class Meta:
        model = InstituteCourseOffering
        fields = [
            "id", "institute", "institute_id",
            "maincourse", "maincourse_id",
            "subcourse", "subcourse_id",
            "campus", "start_date", "end_date",
            "created_at", "updated_at", "updated_by",
        ]
        read_only_fields = ["created_at", "updated_at", "updated_by", "institute", "maincourse", "subcourse"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["institute"] = {"id": instance.institute.id, "name": str(instance.institute)} if instance.institute else None
        data["maincourse"] = {
            "id": instance.maincourse.id,
            "maincourse_id": instance.maincourse.maincourse_id,
            "name": instance.maincourse.course_name,
        } if instance.maincourse else None
        data["subcourse"] = {
            "id": instance.subcourse.id if instance.subcourse else None,
            "subcourse_id": instance.subcourse.subcourse_id if instance.subcourse else None,
            "name": instance.subcourse.subcourse_name if instance.subcourse else None,
        } if instance.subcourse else None
        if instance.updated_by:
            data["updated_by"] = {"id": instance.updated_by.id, "username": instance.updated_by.username}
        return data
class VerificationSerializer(serializers.ModelSerializer):
    # enrollment_no and second_enrollment_id are now CharField (not FK)
    # Write-only: allow linking to DocRec by its primary key id
    doc_rec_id = serializers.PrimaryKeyRelatedField(
        queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False
    )
    # Read-only: expose doc_rec public id (string) if linked
    doc_rec_key = serializers.CharField(source="doc_rec.doc_rec_id", read_only=True)
    # Nested ECA info for this verification (by same doc_rec)
    eca = serializers.SerializerMethodField()

    class Meta:
        model = Verification
        fields = [
            "id",
            "doc_rec_date",
            "vr_done_date",
            "enrollment_no",
            "second_enrollment_id",
            "student_name",
            "tr_count", "ms_count", "dg_count", "moi_count", "backlog_count",
            "pay_rec_no",
            "status",
            "final_no",
            "mail_status",
            "eca_required", "eca_name", "eca_ref_no", "eca_send_date",
            "eca_status", "eca_resubmit_date",
            "replaces_verification",
            "remark",
            "last_resubmit_date", "last_resubmit_status",
            "createdat", "updatedat", "updatedby",
            "doc_rec_id", "doc_rec_key",
            "eca",
        ]
        read_only_fields = [
            "id", "createdat", "updatedat", "updatedby",
            "eca_resend_count", "eca_last_action_at", "eca_last_to_email",
            "last_resubmit_date", "last_resubmit_status",
        ]

    def validate(self, attrs):
        # pull current + incoming
        status = attrs.get("status", getattr(self.instance, "status", None))
        final_no = attrs.get("final_no", getattr(self.instance, "final_no", None))
        eca_required = attrs.get("eca_required", getattr(self.instance, "eca_required", False))

        # 3-digit caps (extra guard; DB also enforces)
        for f in ("tr_count", "ms_count", "dg_count", "moi_count", "backlog_count"):
            val = attrs.get(f, getattr(self.instance, f, 0) if self.instance else 0)
            if val is not None and (val < 0 or val > 999):
                raise serializers.ValidationError({f: "Must be between 0 and 999."})

        # Final number rules
        if status == VerificationStatus.DONE and not final_no:
            raise serializers.ValidationError({"final_no": "Required when status is DONE."})
        if status in (VerificationStatus.PENDING, VerificationStatus.CANCEL) and final_no:
            raise serializers.ValidationError({"final_no": "Must be empty for PENDING or CANCEL."})

        # ECA details must be empty if not required
        eca_fields = ("eca_name", "eca_ref_no", "eca_send_date", "eca_resubmit_date")
        if not eca_required:
            for ef in eca_fields:
                if attrs.get(ef) is not None:
                    raise serializers.ValidationError("ECA details present but eca_required=False.")
            # Enforce ECA status blank/null if not required
            if attrs.get("eca_status") not in (None, ""):
                attrs["eca_status"] = ""

        return attrs

    def create(self, validated):
        # enrollment_no is now a CharField, no FK to auto-fill student_name from
        # Stamp audit
        request = self.context.get("request")
        if request and request.user and request.user.is_authenticated:
            validated["updatedby"] = request.user
        return super().create(validated)

    def update(self, instance, validated):
        # Stamp audit
        request = self.context.get("request")
        if request and request.user and request.user.is_authenticated:
            validated["updatedby"] = request.user
        # enrollment_no is now a CharField, no FK relationship to sync
        return super().update(instance, validated)

    def get_eca(self, obj):
        try:
            # Return ECA info from verification's denormalized fields
            if not obj:
                return None
            return {
                "id": None,
                "doc_rec_id": obj.doc_rec.doc_rec_id if getattr(obj, 'doc_rec', None) else None,
                "eca_name": getattr(obj, 'eca_name', None),
                "eca_ref_no": getattr(obj, 'eca_ref_no', None),
                "eca_send_date": getattr(obj, 'eca_submit_date', None),
                "eca_remark": None,
            }
        except Exception:
            return None


class EcaResendSerializer(serializers.Serializer):
    to_email = serializers.EmailField(required=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class AssignFinalSerializer(serializers.Serializer):
    final_no = serializers.CharField(required=True, max_length=50)


class ResubmitSerializer(serializers.Serializer):
    status_note = serializers.CharField(required=False, allow_blank=True)


# ---------- DocRec / Migration / Provisional / InstVerification serializers ----------

class DocRecSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocRec
        fields = [
            'id', 'apply_for', 'doc_rec_id', 'pay_by', 'pay_rec_no_pre', 'pay_rec_no', 'pay_amount', 'doc_rec_date', 'created_by', 'createdat', 'updatedat'
        ]
        read_only_fields = ['id', 'doc_rec_id', 'created_by', 'createdat', 'updatedat']

    def create(self, validated):
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated['created_by'] = request.user
        return super().create(validated)


class MigrationRecordSerializer(serializers.ModelSerializer):
    # Allow binding doc_rec by its public doc_rec_id string (raw string input)
    doc_rec_key = serializers.CharField(write_only=True, required=False, allow_null=True, allow_blank=True)
    # Expose stored doc_rec_id (string)
    doc_rec = serializers.CharField(read_only=True)
    class Meta:
        model = MigrationRecord
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by']

    def create(self, validated):
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated['created_by'] = request.user
        # Copy raw doc_rec_key into stored doc_rec string if provided
        if 'doc_rec_key' in validated:
            val = validated.pop('doc_rec_key')
            validated['doc_rec'] = val if val not in (None, '') else None
        # Auto-populate from enrollment when provided
        enr = validated.get('enrollment')
        if enr:
            if not validated.get('student_name'):
                validated['student_name'] = enr.student_name or ''
            if not validated.get('institute'):
                validated['institute'] = enr.institute
            if not validated.get('subcourse'):
                validated['subcourse'] = enr.subcourse
            if not validated.get('maincourse'):
                validated['maincourse'] = enr.maincourse
        return super().create(validated)


class ProvisionalRecordSerializer(serializers.ModelSerializer):
    # Accept a raw doc_rec_id string on write (uploads or API clients may send the public key)
    doc_rec_key = serializers.CharField(write_only=True, required=False, allow_null=True, allow_blank=True)
    # Expose the stored doc_rec_id (string) on read
    doc_rec = serializers.CharField(read_only=True)
    # Allow blank/nullable student_name from uploads
    student_name = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    # Allow binding enrollment using its enrollment_no (slug) when creating via API
    enrollment_no = serializers.SlugRelatedField(
        slug_field='enrollment_no', queryset=Enrollment.objects.all(), source='enrollment', write_only=True, required=False, allow_null=True
    )
    enrollment = serializers.CharField(source='enrollment.enrollment_no', read_only=True)
    class Meta:
        model = ProvisionalRecord
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by']

    def create(self, validated):
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated['created_by'] = request.user
        # If the client supplied a doc_rec_key (string), store it into doc_rec (raw string)
        if 'doc_rec_key' in validated:
            val = validated.pop('doc_rec_key')
            # allow None/blank
            validated['doc_rec'] = val if val not in (None, '') else None
        # Auto-populate from enrollment when provided
        enr = validated.get('enrollment')
        if enr:
            if not validated.get('student_name'):
                validated['student_name'] = enr.student_name or ''
            if not validated.get('institute'):
                validated['institute'] = enr.institute
            if not validated.get('subcourse'):
                validated['subcourse'] = enr.subcourse
            if not validated.get('maincourse'):
                validated['maincourse'] = enr.maincourse
        # Treat blank/NULL status as ISSUED by default
        if not validated.get('prv_status'):
            try:
                validated['prv_status'] = ProvisionalStatus.ISSUED
            except Exception:
                validated['prv_status'] = 'Issued'
        return super().create(validated)


class InstVerificationMainSerializer(serializers.ModelSerializer):
    # Accept doc_rec id directly
    doc_rec_id = serializers.PrimaryKeyRelatedField(
        queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False
    )
    # Or accept doc_rec public key (string) directly
    doc_rec_key = serializers.SlugRelatedField(
        slug_field='doc_rec_id', queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False
    )
    doc_rec = serializers.CharField(source='doc_rec.doc_rec_id', read_only=True)
    class Meta:
        model = InstVerificationMain
        fields = '__all__'

    def to_representation(self, instance):
        """Sanitize commonly-used header fields so templates don't print importer
        placeholders like numeric ids or 'nan'. This mirrors behaviour in
        serializers_documents.py and keeps output consistent across APIs.
        """
        import re
        def _sanitize(val):
            try:
                if val is None:
                    return ''
                if isinstance(val, (list, tuple)):
                    return '' if len(val) == 0 else str(val)
                s = str(val).strip()
                if not s:
                    return ''
                s2 = re.sub(r'^\[\s*|\s*\]$', '', s)
                if re.fullmatch(r'\d+', s2):
                    return ''
                if s2.strip().lower() in ('nan', 'none', 'null', 'n/a'):
                    return ''
                return s2
            except Exception:
                return ''

        data = super().to_representation(instance)
        for k in ('rec_inst_sfx_name','rec_inst_name','rec_inst_address_1','rec_inst_address_2','rec_inst_location','rec_inst_city','rec_inst_pin','rec_inst_email','doc_types','inst_ref_no','rec_by'):
            if k in data:
                data[k] = _sanitize(data.get(k))
        # ensure date fields are string/blank
        for df in ('inst_veri_date','ref_date','doc_rec_date'):
            v = data.get(df)
            try:
                data[df] = '' if not v else str(v)
            except Exception:
                data[df] = ''
        return data


class InstVerificationStudentSerializer(serializers.ModelSerializer):
    # Bind to doc_rec via slug
    doc_rec_key = serializers.SlugRelatedField(
        slug_field='doc_rec_id', queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False
    )
    doc_rec = serializers.CharField(source='doc_rec.doc_rec_id', read_only=True)
    # Expose iv_degree_name if present in the DB/model
    iv_degree_name = serializers.CharField(allow_null=True, allow_blank=True, required=False)
    enrollment_no_text = serializers.CharField(allow_null=True, allow_blank=True, required=False)

    class Meta:
        model = InstVerificationStudent
        # include all model fields; explicit iv_degree_name added above to ensure
        # serializer reads/writes it even if the model was recently changed in DB.
        fields = '__all__'


class EcaSerializer(serializers.ModelSerializer):
    # Bind ECA to DocRec via its public identifier (doc_rec_id string)
    doc_rec_key = serializers.SlugRelatedField(
        slug_field='doc_rec_id', queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False
    )
    doc_rec_id = serializers.CharField(source='doc_rec.doc_rec_id', read_only=True)

    class Meta:
        model = Eca
        fields = [
            'id', 'doc_rec_id', 'doc_rec_key', 'eca_name', 'eca_ref_no', 'eca_send_date', 'eca_remark', 'createdat', 'updatedat'
        ]
        read_only_fields = ['id', 'doc_rec_id', 'createdat', 'updatedat']


class StudentProfileSerializer(serializers.ModelSerializer):
    # Bind profile to Enrollment via its enrollment_no (slug)
    enrollment_no = serializers.SlugRelatedField(
        slug_field='enrollment_no', queryset=Enrollment.objects.all(), source='enrollment', write_only=True
    )
    # Expose linked enrollment number read-only
    enrollment = serializers.CharField(source='enrollment.enrollment_no', read_only=True)

    class Meta:
        model = StudentProfile
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'updated_by', 'enrollment']

    def create(self, validated):
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated['updated_by'] = request.user
        return super().create(validated)

    def update(self, instance, validated):
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated['updated_by'] = request.user
        return super().update(instance, validated)