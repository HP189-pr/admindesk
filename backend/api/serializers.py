"""File: backend/api/serializers.py
Central DRF serializers (auth, navigation, courses, enrollment, documents, verification, profiles).

Refactor Plan (Phase 2 – future): split into multiple files mirroring planned view split:
  auth_serializers.py, navigation_serializers.py, course_serializers.py, enrollment_serializers.py,
  document_serializers.py, verification_serializers.py, profile_serializers.py.

Backward compatibility: keep existing import paths until all references updated.
This header addition introduces no functional change.
"""

from rest_framework import serializers
from django.contrib.auth.hashers import check_password
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.utils import timezone
from django.db import transaction
from .models import Holiday, UserProfile, User, Module, Menu, UserPermission,Enrollment, Institute, MainBranch, SubBranch, InstituteCourseOffering, Verification, VerificationStatus, DocRec, MigrationRecord, ProvisionalRecord, InstVerificationMain, InstVerificationStudent, Eca, StudentProfile
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
    # Read-only convenience fields coming from related Enrollment rows
    enrollment_no = serializers.CharField(source="enrollment.enrollment_no", read_only=True)
    second_enrollment_no = serializers.CharField(source="second_enrollment.enrollment_no", read_only=True)
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
            "date",
            "vr_done_date",
            "enrollment", "enrollment_no",
            "second_enrollment", "second_enrollment_no",
            "student_name",
            "tr_count", "ms_count", "dg_count", "moi_count", "backlog_count",
            "pay_rec_no",
            "status",
            "final_no",
            "mail_status",
            "eca_required", "eca_name", "eca_ref_no", "eca_submit_date",
            "eca_mail_status", "eca_resend_count", "eca_last_action_at", "eca_last_to_email",
            "eca_history",
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
            "enrollment_no", "second_enrollment_no",
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
        eca_fields = ("eca_name", "eca_ref_no", "eca_submit_date", "eca_history")
        if not eca_required:
            for ef in eca_fields:
                if attrs.get(ef) is not None:
                    raise serializers.ValidationError("ECA details present but eca_required=False.")

        return attrs

    def create(self, validated):
        # Auto-fill student_name from Enrollment if omitted
        if not validated.get("student_name") and validated.get("enrollment"):
            enr = validated["enrollment"]
            validated["student_name"] = enr.student_name or ""
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
        # If student_name edited, also update Enrollment copy
        new_name = validated.get("student_name")
        resp = super().update(instance, validated)
        try:
            if new_name and instance.enrollment and instance.enrollment.student_name != new_name:
                enr = instance.enrollment
                enr.student_name = new_name
                enr.save(update_fields=["student_name", "updated_at"])
        except Exception:
            pass
        return resp

    def get_eca(self, obj):
        try:
            if not obj.doc_rec:
                return None
            e = Eca.objects.filter(doc_rec=obj.doc_rec).order_by("id").first()
            if not e:
                return None
            return {
                "id": e.id,
                "doc_rec_id": e.doc_rec.doc_rec_id if e.doc_rec else None,
                "eca_name": e.eca_name,
                "eca_ref_no": e.eca_ref_no,
                "eca_send_date": e.eca_send_date,
                "eca_remark": e.eca_remark,
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
    # Allow binding doc_rec by its public doc_rec_id string
    doc_rec_key = serializers.SlugRelatedField(
        slug_field='doc_rec_id', queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False
    )
    # Expose public doc_rec id string
    doc_rec = serializers.CharField(source='doc_rec.doc_rec_id', read_only=True)
    class Meta:
        model = MigrationRecord
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by']

    def create(self, validated):
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated['created_by'] = request.user
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
    doc_rec_key = serializers.SlugRelatedField(
        slug_field='doc_rec_id', queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False
    )
    doc_rec = serializers.CharField(source='doc_rec.doc_rec_id', read_only=True)
    class Meta:
        model = ProvisionalRecord
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by']

    def create(self, validated):
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated['created_by'] = request.user
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


class InstVerificationStudentSerializer(serializers.ModelSerializer):
    # Bind to doc_rec via slug
    doc_rec_key = serializers.SlugRelatedField(
        slug_field='doc_rec_id', queryset=DocRec.objects.all(), source='doc_rec', write_only=True, required=False
    )
    doc_rec = serializers.CharField(source='doc_rec.doc_rec_id', read_only=True)

    class Meta:
        model = InstVerificationStudent
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