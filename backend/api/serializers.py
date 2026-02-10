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
from .serializers_enrollment import *  # noqa: F401,F403
from .serializers_documents import *  # noqa: F401,F403
from .serializers_mail_request import *  # noqa: F401,F403


from rest_framework import serializers
from django.contrib.auth.hashers import check_password
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.utils import timezone
from django.db import transaction
from .models import Holiday, UserProfile, User, Module, Menu, UserPermission, DashboardPreference, Enrollment, Institute, MainBranch, SubBranch, InstituteCourseOffering, Verification, VerificationStatus, DocRec, MigrationRecord, ProvisionalRecord, Eca, StudentProfile, ProvisionalStatus
from .domain_letter import InstLetterMain, InstLetterStudent
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
    # Write-only: link DocRec by PK
    doc_rec_id = serializers.PrimaryKeyRelatedField(
        queryset=DocRec.objects.all(),
        source='doc_rec',
        write_only=True,
        required=False
    )

    # Read-only: public DocRec ID like "vr26000090"
    doc_rec_key = serializers.CharField(
        source="doc_rec.doc_rec_id",
        read_only=True
    )

    # 🔥 Payment passthrough from DocRec
    pay_by = serializers.CharField(
        source="doc_rec.pay_by",
        read_only=True
    )
    pay_rec_no_pre = serializers.CharField(
        source="doc_rec.pay_rec_no_pre",
        read_only=True
    )
    pay_rec_no = serializers.CharField(
        source="doc_rec.pay_rec_no",
        read_only=True
    )
    pay_amount = serializers.DecimalField(
        source="doc_rec.pay_amount",
        max_digits=12,
        decimal_places=2,
        read_only=True
    )

    # Nested ECA info
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

            # verification-level
            "status",
            "final_no",
            "mail_status",

            # ECA
            "eca_required", "eca_name", "eca_ref_no", "eca_send_date",
            "eca_status", "eca_resubmit_date",

            "replaces_verification",
            "doc_remark",
            "last_resubmit_date", "last_resubmit_status",
            "createdat", "updatedat", "updatedby",

            # 🔥 DocRec + payment (READ)
            "doc_rec_key",
            "pay_by",
            "pay_rec_no_pre",
            "pay_rec_no",
            "pay_amount",

            # 🔥 DocRec (WRITE)
            "doc_rec_id",

            "eca",
        ]

        read_only_fields = [
            "id", "createdat", "updatedat", "updatedby",
            "last_resubmit_date", "last_resubmit_status",
        ]

    def validate(self, attrs):
        status = attrs.get("status", getattr(self.instance, "status", None))
        final_no = attrs.get("final_no", getattr(self.instance, "final_no", None))
        eca_required = attrs.get("eca_required", getattr(self.instance, "eca_required", False))

        for f in ("tr_count", "ms_count", "dg_count", "moi_count", "backlog_count"):
            val = attrs.get(f, getattr(self.instance, f, 0) if self.instance else 0)
            if val is not None and (val < 0 or val > 999):
                raise serializers.ValidationError({f: "Must be between 0 and 999."})

        if status == VerificationStatus.DONE and not final_no:
            raise serializers.ValidationError({"final_no": "Required when status is DONE."})
        if status in (VerificationStatus.PENDING, VerificationStatus.CANCEL) and final_no:
            raise serializers.ValidationError({"final_no": "Must be empty for PENDING or CANCEL."})

        if not eca_required:
            for ef in ("eca_name", "eca_ref_no", "eca_send_date", "eca_resubmit_date"):
                if attrs.get(ef) is not None:
                    raise serializers.ValidationError("ECA details present but eca_required=False.")
            if attrs.get("eca_status") not in (None, ""):
                attrs["eca_status"] = ""

        return attrs

    def create(self, validated):
        request = self.context.get("request")
        if request and request.user and request.user.is_authenticated:
            validated["updatedby"] = request.user
        return super().create(validated)

    def update(self, instance, validated):
        request = self.context.get("request")
        if request and request.user and request.user.is_authenticated:
            validated["updatedby"] = request.user
        return super().update(instance, validated)

    def get_eca(self, obj):
        if not obj or not obj.doc_rec:
            return None
        return {
            "id": None,
            "doc_rec_id": obj.doc_rec.doc_rec_id,
            "eca_name": obj.eca_name,
            "eca_ref_no": obj.eca_ref_no,
            "eca_send_date": obj.eca_send_date,
            "eca_remark": None,
        }



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
    doc_rec_id = serializers.CharField(write_only=True, required=False, allow_null=True, allow_blank=True)
    # Expose the stored doc_rec_id (string) on read
    doc_rec = serializers.CharField(read_only=True)
    # Expose related codes/names for UI consumption
    institute_code = serializers.CharField(source='institute.institute_code', read_only=True, allow_null=True)
    maincourse_code = serializers.CharField(source='maincourse.course_code', read_only=True, allow_null=True)
    maincourse_name = serializers.CharField(source='maincourse.course_name', read_only=True, allow_null=True)
    subcourse_name = serializers.CharField(source='subcourse.subcourse_name', read_only=True, allow_null=True)
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

        # 🔑 Normalize doc_rec from either key
        doc_rec_val = None
        if 'doc_rec_key' in validated:
            doc_rec_val = validated.pop('doc_rec_key')
        elif 'doc_rec_id' in validated:
            doc_rec_val = validated.pop('doc_rec_id')
        if doc_rec_val not in (None, ''):
            validated['doc_rec'] = doc_rec_val
        else:
            validated['doc_rec'] = None

        # Auto-populate from enrollment
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

        # Default status
        if not validated.get('prv_status'):
            try:
                validated['prv_status'] = ProvisionalStatus.ISSUED
            except Exception:
                validated['prv_status'] = 'Issued'

        return super().create(validated)

    def update(self, instance, validated):
        doc_rec_val = None
        if 'doc_rec_key' in validated:
            doc_rec_val = validated.pop('doc_rec_key')
        elif 'doc_rec_id' in validated:
            doc_rec_val = validated.pop('doc_rec_id')
        if doc_rec_val not in (None, ''):
            instance.doc_rec = doc_rec_val
        return super().update(instance, validated)


from .serializers_Letter import InstLetterMainSerializer, InstLetterStudentSerializer
# Backward-compatible aliases
InstVerificationMainSerializer = InstLetterMainSerializer
InstVerificationStudentSerializer = InstLetterStudentSerializer


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