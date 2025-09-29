from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone
from django.core.exceptions import ValidationError


# ✅ Holiday Model
class Holiday(models.Model):
    hdid = models.AutoField(primary_key=True)
    holiday_date = models.DateField()
    holiday_name = models.CharField(max_length=255)
    holiday_day = models.CharField(max_length=50)

    class Meta:
        db_table = "holiday"

    def __str__(self):
        return self.holiday_name

# ✅ User Profile Model
class UserProfile(models.Model):
    profileid = models.AutoField(primary_key=True)  # Explicit primary key

    # Link to auth_user.id - note db_column="id" ensures it maps correctly
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="profile",
        db_column="id"  # Important: links to the "id" column in your table
    )

    phone = models.CharField(max_length=255, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    city = models.CharField(max_length=255, blank=True, null=True)
    state = models.CharField(max_length=255, blank=True, null=True)
    country = models.CharField(max_length=255, blank=True, null=True)
    profile_picture = models.ImageField(upload_to="profile_pictures/", null=True, blank=True)
    bio = models.TextField(blank=True, null=True)
    social_links = models.JSONField(blank=True, null=True)

    created_at = models.DateTimeField(db_column="createdat", auto_now_add=True)
    updated_at = models.DateTimeField(db_column="updatedat", auto_now=True)

    class Meta:
        db_table = "user_profiles"

    def __str__(self):
        return self.user.username

class Module(models.Model):
    moduleid = models.AutoField(primary_key=True)
    name = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(db_column="createdat", auto_now_add=True)
    updated_at = models.DateTimeField(db_column="updatedat", auto_now=True)
    updated_by = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        db_column="updatedby"  # ✅ Use the correct column name from the database
    )

    class Meta:
        db_table = "api_module"  # ✅ Explicitly set table name

    def __str__(self):
        return self.name

class Menu(models.Model):
    menuid = models.AutoField(primary_key=True)
    module = models.ForeignKey(
        Module, 
        on_delete=models.CASCADE, 
        db_column="moduleid"  # ✅ Ensure correct column reference
    )
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(db_column="createdat", auto_now_add=True)  # ✅ Fix column name
    updated_at = models.DateTimeField(db_column="updatedat", auto_now=True)  # ✅ Fix column name
    updated_by = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        db_column="updatedby"  # ✅ Correct column name
    )

    class Meta:
        db_table = "api_menu"  # ✅ Explicitly set table name

    def __str__(self):
        return f"{self.module.name} - {self.name}"

class UserPermission(models.Model):
    permitid = models.AutoField(primary_key=True)
    user = models.ForeignKey(
        User, 
        on_delete=models.CASCADE, 
        db_column="userid"  # ✅ Correct column reference
    )
    module = models.ForeignKey(
        Module, 
        on_delete=models.CASCADE, 
        null=True, 
        blank=True, 
        db_column="moduleid"  # ✅ Correct column reference
    )
    menu = models.ForeignKey(
        Menu, 
        on_delete=models.CASCADE, 
        null=True, 
        blank=True, 
        db_column="menuid"  # ✅ Correct column reference
    )
    
    # ✅ Fix column names to match database
    can_view = models.BooleanField(default=False, db_column="canview")
    can_edit = models.BooleanField(default=False, db_column="canedit")
    can_delete = models.BooleanField(default=False, db_column="candelete")
    can_create = models.BooleanField(default=False, db_column="cancreate")
    
    created_at = models.DateTimeField(db_column="createdat", auto_now_add=True)
    updated_at = models.DateTimeField(db_column="updatedat", auto_now=True)

    class Meta:
        db_table = "api_userpermissions"  # ✅ Explicitly set table name
        unique_together = ('user', 'module', 'menu')  # Prevent duplicate entries

    def __str__(self):
        if self.menu:
            return f"{self.user.username} - {self.module.name} - {self.menu.name}"
        else:
            return f"{self.user.username} - {self.module.name} (Full Module Access)"
# ✅ Institute Model
from django.contrib.auth.models import User
from django.db import models

# Institute Model (as you shared earlier, looks fine)
class Institute(models.Model):
    institute_id = models.IntegerField(primary_key=True)
    institute_code = models.CharField(max_length=255, unique=True, db_index=True)
    institute_name = models.CharField(max_length=255, null=True, blank=True)
    
    # New columns
    institute_campus = models.CharField(max_length=255, null=True, blank=True)
    institute_address = models.TextField(null=True, blank=True)
    institute_city = models.CharField(max_length=255, null=True, blank=True)

    created_at = models.DateTimeField(db_column="createdat", auto_now_add=True)
    updated_at = models.DateTimeField(db_column="updatedat", auto_now=True)
    updated_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        db_column="updatedby", related_name="updated_institutes"
    )

    class Meta:
        db_table = "institute"

    def __str__(self):
        return self.institute_name or "Unnamed Institute"



# ✅ Main Branch Model (Main Course)
class MainBranch(models.Model):
    id = models.AutoField(primary_key=True)
    maincourse_id = models.CharField(max_length=255, unique=True, db_index=True)
    course_name = models.CharField(max_length=255, null=True, blank=True)  # ✅ allow null
    course_code = models.CharField(max_length=50, null=True, blank=True)  # allow null for existing rows

    created_at = models.DateTimeField(db_column="createdat", auto_now_add=True)
    updated_at = models.DateTimeField(db_column="updatedat", auto_now=True)
    updated_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, db_column="updatedby"
    )

    class Meta:
        db_table = "main_branch"

    def __str__(self):
        return self.course_name or f"MainBranch {self.maincourse_id}"  # ✅ fallback


class SubBranch(models.Model):
    id = models.AutoField(primary_key=True)
    subcourse_id = models.CharField(max_length=255, unique=True, db_index=True)
    subcourse_name = models.CharField(max_length=255, null=True, blank=True)

    maincourse = models.ForeignKey(
        MainBranch,
        to_field="maincourse_id",  # <-- use the varchar column, not PK
        on_delete=models.CASCADE,
        db_column="maincourse_id",
        related_name="sub_branches"
    )
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, db_column="updatedby")

    created_at = models.DateTimeField(db_column="createdat", auto_now_add=True)
    updated_at = models.DateTimeField(db_column="updatedat", auto_now=True)

    class Meta:
        db_table = "sub_branch"

    def __str__(self):
        return self.subcourse_name or f"SubBranch {self.subcourse_id}"


class Enrollment(models.Model):
    id = models.AutoField(primary_key=True, db_column="id")  # Matches existing table PK
    student_name = models.CharField(max_length=100, db_index=True, verbose_name="Student Name")
    enrollment_date = models.DateField(null=True, blank=True)  # allow blank values
    admission_date = models.DateField(null=True, blank=True)

    institute = models.ForeignKey(
        "Institute",
        on_delete=models.CASCADE,
        db_column="institute_id",
        related_name="enrollments",
        verbose_name="Institute"
    )
    batch = models.IntegerField(verbose_name="Batch")
    subcourse = models.ForeignKey(
    "SubBranch",
    to_field="subcourse_id",  # <-- important
    on_delete=models.CASCADE,
    db_column="subcourse_id",
    related_name="enrollments",
    )
    maincourse = models.ForeignKey(
        "MainBranch",
        to_field="maincourse_id",  # <-- join using varchar column
        on_delete=models.CASCADE,
        db_column="maincourse_id",
        related_name="enrollments",
        verbose_name="Main Course"
    )
    enrollment_no = models.CharField(
        max_length=50,
        unique=True,
        null=True, blank=True,
        db_column="enrollment_no",
        verbose_name="Enrollment Number"
    )
    temp_enroll_no = models.CharField(
        max_length=50,
        null=True, blank=True,
        db_column="temp_enroll_no",
        verbose_name="Temporary Enrollment Number"
    )
    created_at = models.DateTimeField(db_column="created_at", auto_now_add=True, verbose_name="Created At")
    updated_at = models.DateTimeField(db_column="updated_at", auto_now=True, verbose_name="Updated At")
    updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        db_column="updated_by",
        related_name="updated_enrollments",
        verbose_name="Updated By"
    )

    class Meta:
        db_table = "enrollment"
        indexes = [
            models.Index(fields=["institute", "subcourse", "maincourse"]),
        ]

    def __str__(self):
        return f"{self.student_name or 'Unknown'} - {self.enrollment_no or self.temp_enroll_no or 'No Number'}"

# ✅ Institute-wise Course Offering / Placement
class InstituteCourseOffering(models.Model):
    id = models.AutoField(primary_key=True)
    institute = models.ForeignKey(
        Institute,
        on_delete=models.CASCADE,
        related_name="course_offerings",
        db_column="institute_id",
    )
    # Link via varchar identifiers (consistent with Enrollment usage)
    maincourse = models.ForeignKey(
        MainBranch,
        to_field="maincourse_id",
        on_delete=models.CASCADE,
        db_column="maincourse_id",
        related_name="institute_offerings",
    )
    subcourse = models.ForeignKey(
        SubBranch,
        to_field="subcourse_id",
        on_delete=models.CASCADE,
        db_column="subcourse_id",
        related_name="institute_offerings",
        null=True,
        blank=True,
    )
    # Campus / Place where this course is offered (free text to allow A/B switches)
    campus = models.CharField(max_length=255, null=True, blank=True)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)  # null => still running

    created_at = models.DateTimeField(db_column="createdat", auto_now_add=True)
    updated_at = models.DateTimeField(db_column="updatedat", auto_now=True)
    updated_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, db_column="updatedby"
    )

    class Meta:
        db_table = "institute_course_offering"
        indexes = [
            models.Index(fields=["institute", "maincourse", "subcourse"]),
        ]

    def __str__(self):
        mc = getattr(self.maincourse, "course_name", None) or getattr(self.maincourse, "maincourse_id", "")
        sc = getattr(self.subcourse, "subcourse_name", None) or getattr(self.subcourse, "subcourse_id", "")
        return f"{self.institute} - {mc}{' / ' + sc if sc else ''} @ {self.campus or '-'}"
class MailStatus(models.TextChoices):
    NOT_SENT = "NOT_SENT", "Not Sent"
    SENT     = "SENT", "Sent"
    FAILED   = "FAILED", "Failed"


class VerificationStatus(models.TextChoices):
    IN_PROGRESS = "IN_PROGRESS", "In Progress"
    PENDING     = "PENDING", "Pending"
    CORRECTION  = "CORRECTION", "Correction"
    CANCEL      = "CANCEL", "Cancel"
    DONE        = "DONE", "Done"


class Verification(models.Model):
    id = models.BigAutoField(primary_key=True, db_column="id")

    # Basic info
    date = models.DateField(default=timezone.now, db_column="date")

    # Enrollment relations
    enrollment = models.ForeignKey(
        Enrollment, on_delete=models.RESTRICT, db_column="enrollment_id",
        related_name="verifications"
    )
    second_enrollment = models.ForeignKey(
        Enrollment, on_delete=models.RESTRICT, null=True, blank=True,
        db_column="second_enrollment_id", related_name="secondary_verifications"
    )

    # Student name snapshot
    student_name = models.CharField(max_length=255, db_column="student_name")

    # Document counts (0..999)
    tr_count = models.PositiveSmallIntegerField(default=0, db_column="tr_count")
    ms_count = models.PositiveSmallIntegerField(default=0, db_column="ms_count")
    dg_count = models.PositiveSmallIntegerField(default=0, db_column="dg_count")
    moi_count = models.PositiveSmallIntegerField(default=0, db_column="moi_count")
    backlog_count = models.PositiveSmallIntegerField(default=0, db_column="backlog_count")

    # Payment / REC linkage
    pay_rec_no = models.CharField(max_length=100, null=True, blank=True, db_column="pay_rec_no")

    # Workflow
    status = models.CharField(
        max_length=20, choices=VerificationStatus.choices,
        default=VerificationStatus.IN_PROGRESS, db_column="status"
    )

    # Final number
    final_no = models.CharField(
        max_length=50, unique=True, null=True, blank=True, db_column="final_no"
    )

    # Mail status for verification workflow
    mail_status = models.CharField(
        max_length=20, choices=MailStatus.choices,
        default=MailStatus.NOT_SENT, db_column="mail_status"
    )

    # --- ECA integrated into same row ---
    eca_required     = models.BooleanField(default=False, db_column="eca_required")
    eca_name         = models.CharField(max_length=255, null=True, blank=True, db_column="eca_name")
    eca_ref_no       = models.CharField(max_length=100, null=True, blank=True, db_column="eca_ref_no")
    eca_submit_date  = models.DateField(null=True, blank=True, db_column="eca_submit_date")

    eca_mail_status  = models.CharField(
        max_length=20, choices=MailStatus.choices,
        default=MailStatus.NOT_SENT, db_column="eca_mail_status"
    )
    eca_resend_count = models.PositiveSmallIntegerField(default=0, db_column="eca_resend_count")
    eca_last_action_at = models.DateTimeField(null=True, blank=True, db_column="eca_last_action_at")
    eca_last_to_email  = models.EmailField(null=True, blank=True, db_column="eca_last_to_email")

    # JSON array of resend actions
    # Example element: { "action":"RESEND", "at":"2025-09-29T10:00:00Z", "to":"x@y.com", "notes":"..." }
    eca_history = models.JSONField(null=True, blank=True, db_column="eca_history")

    # New final number supersedes an older case
    replaces_verification = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True,
        db_column="replaces_verification_id", related_name="superseded_by"
    )

    # Remarks & correction/resubmission tracking (last snapshot)
    remark = models.TextField(null=True, blank=True, db_column="remark")
    last_resubmit_date = models.DateField(null=True, blank=True, db_column="last_resubmit_date")
    last_resubmit_status = models.CharField(max_length=20, null=True, blank=True, db_column="last_resubmit_status")

    # Audit fields
    createdat = models.DateTimeField(auto_now_add=True, db_column="createdat")
    updatedat = models.DateTimeField(auto_now=True, db_column="updatedat")
    updatedby = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, db_column="updatedby"
    )

    class Meta:
        db_table = "verification"
        indexes = [
            models.Index(fields=["enrollment"], name="idx_verification_enrollment"),
            models.Index(fields=["second_enrollment"], name="idx_verif_sec_enroll"),
            models.Index(fields=["status"], name="idx_verification_status"),
            models.Index(fields=["final_no"], name="idx_verification_final_no"),
            models.Index(fields=["pay_rec_no"], name="idx_verification_pay_rec_no"),
        ]
        constraints = [
            # counts 0..999
            models.CheckConstraint(
                check=models.Q(tr_count__gte=0) & models.Q(tr_count__lte=999),
                name="ck_tr_0_999",
            ),
            models.CheckConstraint(
                check=models.Q(ms_count__gte=0) & models.Q(ms_count__lte=999),
                name="ck_ms_0_999",
            ),
            models.CheckConstraint(
                check=models.Q(dg_count__gte=0) & models.Q(dg_count__lte=999),
                name="ck_dg_0_999",
            ),
            models.CheckConstraint(
                check=models.Q(moi_count__gte=0) & models.Q(moi_count__lte=999),
                name="ck_moi_0_999",
            ),
            models.CheckConstraint(
                check=models.Q(backlog_count__gte=0) & models.Q(backlog_count__lte=999),
                name="ck_backlog_0_999",
            ),
            # final_no rules: DONE => required
            models.CheckConstraint(
                check=models.Q(status=VerificationStatus.DONE, final_no__isnull=False) |
                      ~models.Q(status=VerificationStatus.DONE),
                name="ck_finalno_done",
            ),
            # PENDING/CANCEL => final_no must be null
            models.CheckConstraint(
                check=(models.Q(status__in=[VerificationStatus.PENDING, VerificationStatus.CANCEL], final_no__isnull=True) |
                       ~models.Q(status__in=[VerificationStatus.PENDING, VerificationStatus.CANCEL])),
                name="ck_finalno_pending_cancel",
            ),
        ]

    # --- Validation mirroring DB rules (nice errors before hitting DB) ---
    def clean(self):
        for f in ("tr_count", "ms_count", "dg_count", "moi_count", "backlog_count"):
            v = getattr(self, f) or 0
            if v < 0 or v > 999:
                raise ValidationError({f: "Must be between 0 and 999."})

        if self.status == VerificationStatus.DONE and not self.final_no:
            raise ValidationError({"final_no": "final_no is required when status is DONE."})

        if self.status in (VerificationStatus.PENDING, VerificationStatus.CANCEL) and self.final_no:
            raise ValidationError({"final_no": "final_no must be empty for PENDING or CANCEL."})

        if not self.eca_required and any([
            self.eca_name, self.eca_ref_no, self.eca_submit_date,
            self.eca_resend_count, self.eca_last_action_at, self.eca_last_to_email, self.eca_history
        ]):
            raise ValidationError("ECA details present but eca_required=False.")

    def save(self, *args, **kwargs):
        # If you want to auto-copy student_name from Enrollment when blank:
        if self.enrollment and not self.student_name:
            self.student_name = self.enrollment.student_name or ""
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Verification #{self.id} - {self.student_name} - {self.status}"

    # ---------- Helper methods you can call from views/serializers ----------

    def record_resubmit(self, status_note: str | None = None):
        """
        Convenience to stamp last resubmit info.
        Does NOT create a version table; just updates the snapshot fields.
        """
        self.last_resubmit_date = timezone.now().date()
        self.last_resubmit_status = VerificationStatus.CORRECTION
        if status_note:
            self.remark = (self.remark + "\n" if self.remark else "") + f"[Resubmit] {status_note}"
        self.status = VerificationStatus.IN_PROGRESS
        self.full_clean()
        self.save(update_fields=["last_resubmit_date", "last_resubmit_status", "remark", "status", "updatedat"])

    def eca_push_history(self, action: str, to_email: str | None = None, notes: str | None = None, mark_sent: bool = True):
        """
        Append an item to eca_history (JSON array), bump counters, and update mail status.
        action: "SUBMIT" or "RESEND"
        """
        now = timezone.now()
        entry = {
            "action": action,
            "at": now.isoformat(),
            "to": to_email,
            "notes": notes,
        }
        hist = list(self.eca_history or [])
        hist.append(entry)
        self.eca_history = hist
        self.eca_last_action_at = now
        self.eca_last_to_email = to_email or self.eca_last_to_email
        if action == "RESEND":
            self.eca_resend_count = (self.eca_resend_count or 0) + 1
        if mark_sent:
            self.eca_mail_status = MailStatus.SENT
        self.full_clean()
        self.save(update_fields=[
            "eca_history", "eca_last_action_at", "eca_last_to_email",
            "eca_resend_count", "eca_mail_status", "updatedat"
        ])