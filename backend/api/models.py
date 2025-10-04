from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.db import transaction


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

# ✅ Student Profile (One-to-One with Enrollment via enrollment_no)
class StudentProfile(models.Model):
    id = models.BigAutoField(primary_key=True)

    # Link to Enrollment by its public enrollment_no (varchar)
    enrollment = models.OneToOneField(
        "Enrollment",
        to_field="enrollment_no",
        db_column="enrollment_no",
        on_delete=models.CASCADE,
        related_name="student_profile",
        db_constraint=False,
    )

    # Profile fields (kept flexible to match Excel upload)
    gender = models.CharField(max_length=20, null=True, blank=True, db_column="gender")
    birth_date = models.DateField(null=True, blank=True, db_column="birth_date")

    address1 = models.CharField(max_length=255, null=True, blank=True, db_column="address1")
    address2 = models.CharField(max_length=255, null=True, blank=True, db_column="address2")
    city1 = models.CharField(max_length=100, null=True, blank=True, db_column="city1")
    city2 = models.CharField(max_length=100, null=True, blank=True, db_column="city2")

    contact_no = models.CharField(max_length=50, null=True, blank=True, db_column="contact_no")
    email = models.EmailField(null=True, blank=True, db_column="email")

    fees = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, default=0, db_column="fees")
    hostel_required = models.BooleanField(default=False, db_column="hostel_required")

    aadhar_no = models.CharField(max_length=20, null=True, blank=True, db_column="aadhar_no")
    abc_id = models.CharField(max_length=50, null=True, blank=True, db_column="abc_id")
    mobile_adhar = models.CharField(max_length=20, null=True, blank=True, db_column="mobile_adhar")
    name_adhar = models.CharField(max_length=255, null=True, blank=True, db_column="name_adhar")
    mother_name = models.CharField(max_length=255, null=True, blank=True, db_column="mother_name")
    category = models.CharField(max_length=50, null=True, blank=True, db_column="category")

    photo_uploaded = models.BooleanField(default=False, db_column="photo_uploaded")
    is_d2d = models.BooleanField(default=False, db_column="is_d2d")
    program_medium = models.CharField(max_length=50, null=True, blank=True, db_column="program_medium")

    created_at = models.DateTimeField(auto_now_add=True, db_column="created_at")
    updated_at = models.DateTimeField(auto_now=True, db_column="updated_at")
    updated_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, db_column="updated_by", related_name="updated_student_profiles"
    )

    class Meta:
        db_table = "student_profile"
        indexes = [
            models.Index(fields=["enrollment"], name="idx_sp_enrollment"),
        ]

    def __str__(self):
        return f"Profile for {getattr(self.enrollment, 'enrollment_no', None) or '-'}"
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
    # Renamed column per new schema
    date = models.DateField(default=timezone.now, db_column="doc_rec_date", verbose_name="Doc Record Date")

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
    # Column names updated per new schema (python names retained for code stability)
    tr_count = models.PositiveSmallIntegerField(default=0, db_column="no_of_transcript")
    ms_count = models.PositiveSmallIntegerField(default=0, db_column="no_of_marksheet")
    dg_count = models.PositiveSmallIntegerField(default=0, db_column="no_of_degree")
    moi_count = models.PositiveSmallIntegerField(default=0, db_column="no_of_moi")
    backlog_count = models.PositiveSmallIntegerField(default=0, db_column="no_of_backlog")

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
        default=MailStatus.NOT_SENT, db_column="mail_send_status"
    )

    # --- ECA integrated into same row ---
    eca_required     = models.BooleanField(default=False, db_column="eca_required")
    eca_name         = models.CharField(max_length=255, null=True, blank=True, db_column="eca_name")
    eca_ref_no       = models.CharField(max_length=100, null=True, blank=True, db_column="eca_ref_no")
    eca_submit_date  = models.DateField(null=True, blank=True, db_column="eca_submit_date")

    eca_mail_status  = models.CharField(
        max_length=20, choices=MailStatus.choices,
        default=MailStatus.NOT_SENT, db_column="eca_status"
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
    remark = models.TextField(null=True, blank=True, db_column="vr_remark")
    # Completed date when verification DONE
    vr_done_date = models.DateField(null=True, blank=True, db_column="vr_done_date")

    # Link to Document Receipt by doc_rec_id (varchar) if present
    doc_rec = models.ForeignKey(
        'DocRec', on_delete=models.SET_NULL, null=True, blank=True,
        to_field='doc_rec_id', db_column='doc_rec_id', related_name='verifications'
    )
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
            models.Index(fields=["doc_rec"], name="idx_verification_doc_rec"),
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


# ---------- Document Receipt (doc_rec) ----------
class ApplyFor(models.TextChoices):
    VERIFICATION = "VR", "Verification"
    INST_VERIFICATION = "IV", "Institutional Verification"
    PROVISIONAL  = "PR", "Provisional"
    MIGRATION    = "MG", "Migration"
    GRADE_TRANS  = "GT", "Grade To Marks"


class PayBy(models.TextChoices):
    CASH = "CASH", "Cash"
    BANK = "BANK", "Bank"
    UPI  = "UPI", "UPI"
    NA   = "NA", "Not Applicable"


class PayPrefixRule(models.Model):
        """
        Admin-managed mapping for how to build pay_rec_no_pre per payment method and year.
        pattern supports tokens:
            - {yy}   two-digit year, e.g., 25
            - {yyyy} four-digit year, e.g., 2025

        Examples:
            CASH, 2025, pattern="C01/{yy}/R"  -> C01/25/R
            BANK, 2025, pattern="1471/{yy}/R" -> 1471/25/R
            UPI,  any,  pattern="UPI/{yy}/R"  -> UPI/25/R
        If multiple rules exist, the most specific one (matching the current 4-digit year)
        is preferred; otherwise a rule with year_full=NULL acts as a fallback.
        """
        id = models.BigAutoField(primary_key=True)
        pay_by = models.CharField(max_length=10, choices=PayBy.choices, db_column="pay_by")
        year_full = models.PositiveIntegerField(null=True, blank=True, db_column="year_full")
        pattern = models.CharField(max_length=50, db_column="pattern")
        is_active = models.BooleanField(default=True, db_column="is_active")
        priority = models.IntegerField(default=0, db_column="priority")  # higher wins if tie

        createdat = models.DateTimeField(auto_now_add=True, db_column="createdat")
        updatedat = models.DateTimeField(auto_now=True, db_column="updatedat")

        class Meta:
                db_table = "pay_prefix_rule"
                indexes = [
                        models.Index(fields=["pay_by", "year_full"], name="idx_payprefix_by_year"),
                        models.Index(fields=["is_active"], name="idx_payprefix_active"),
                ]

        def __str__(self):
                y = self.year_full or "*"
                return f"{self.pay_by} {y}: {self.pattern} ({'on' if self.is_active else 'off'})"


class DocRec(models.Model):
    id = models.BigAutoField(primary_key=True)

    apply_for = models.CharField(
        max_length=2,
        choices=ApplyFor.choices,
        db_column="apply_for",
    )

    # e.g. vr_25_0025, pr_25_0001 (auto-generated)
    doc_rec_id = models.CharField(
        max_length=20,
        unique=True,
        db_column="doc_rec_id",
    )

    pay_by = models.CharField(
        max_length=10,
        choices=PayBy.choices,
        db_column="pay_by",
    )

    # e.g. C01/25/R or 1471/24/R (auto-generated from pay_by)
    pay_rec_no_pre = models.CharField(
        max_length=20,
        db_column="pay_rec_no_pre",
        null=True,
        blank=True,
    )

    pay_rec_no = models.CharField(
        max_length=50,
        db_column="pay_rec_no",
        null=True,
        blank=True,
    )

    pay_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        db_column="pay_amount",
        default=0,
    )

    # user who created this record (optional)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column="created_by",
        related_name="doc_recs_created",
    )

    createdat = models.DateTimeField(auto_now_add=True, db_column="createdat")
    updatedat = models.DateTimeField(auto_now=True, db_column="updatedat")
    # Optional explicit date of document receipt (separate from createdat)
    doc_rec_date = models.DateField(null=True, blank=True, db_column="doc_rec_date")

    class Meta:
        db_table = "doc_rec"
        indexes = [
            models.Index(fields=["doc_rec_id"], name="idx_doc_rec_id"),
            models.Index(fields=["pay_rec_no"], name="idx_doc_pay_rec"),
        ]

    def __str__(self):
        return f"{self.doc_rec_id} - {self.apply_for} - {self.pay_by}"

    def _prefix_for_apply(self) -> str:
        mapping = {
            ApplyFor.VERIFICATION: "vr",
            ApplyFor.INST_VERIFICATION: "iv",
            ApplyFor.PROVISIONAL: "pr",
            ApplyFor.MIGRATION: "mg",
            ApplyFor.GRADE_TRANS: "gt",
        }
        return mapping.get(self.apply_for, "vr")

    def _pay_prefix_for_payby(self, yy: int) -> str:
        # Try admin-configured rule first; prefer exact 4-digit year rule, else fallback to NULL-year rule
        now = timezone.now()
        yyyy = now.year
        year_str = f"{yy:02d}"
        try:
            rule = (
                PayPrefixRule.objects
                .filter(pay_by=self.pay_by, is_active=True)
                .filter(models.Q(year_full=yyyy) | models.Q(year_full__isnull=True))
                .order_by(
                    models.Case(
                        models.When(year_full=yyyy, then=models.Value(0)),
                        models.When(year_full__isnull=True, then=models.Value(1)),
                        default=models.Value(2),
                        output_field=models.IntegerField(),
                    ),
                    -models.F("priority"),
                    -models.F("id"),
                )
                .first()
            )
        except Exception:
            rule = None

        if rule and rule.pattern:
            try:
                return (
                    rule.pattern
                    .replace("{yy}", year_str)
                    .replace("{yyyy}", str(yyyy))
                )
            except Exception:
                pass

        # Fallback to code defaults
        mapping = {
            PayBy.CASH: f"C01/{year_str}/R",
            PayBy.BANK: f"1471/{year_str}/R",
            PayBy.UPI: f"UPI/{year_str}/R",
            PayBy.NA: None,
        }
        return mapping.get(self.pay_by, f"NA/{year_str}/R")

    def clean(self):
        if self.pay_amount is not None and self.pay_amount < 0:
            raise ValidationError({"pay_amount": "Amount cannot be negative."})

    def save(self, *args, **kwargs):
        # Auto-generate doc_rec_id and pay_rec_no_pre if not supplied
        now = timezone.now()
        yy = now.year % 100

        # If NA, no prefixes/receipt numbers
        if self.pay_by == PayBy.NA:
            self.pay_rec_no_pre = None
            self.pay_rec_no = None
        else:
            if not self.pay_rec_no_pre:
                self.pay_rec_no_pre = self._pay_prefix_for_payby(yy)

        if not self.doc_rec_id:
            prefix = self._prefix_for_apply()
            year_str = f"{yy:02d}"
            base = f"{prefix}_{year_str}_"
            with transaction.atomic():
                last = (
                    DocRec.objects
                    .select_for_update(skip_locked=True)
                    .filter(doc_rec_id__startswith=base)
                    .order_by("-doc_rec_id")
                    .first()
                )
                next_num = 1
                if last and last.doc_rec_id:
                    try:
                        next_num = int(last.doc_rec_id.split("_")[-1]) + 1
                    except Exception:
                        next_num = 1
                self.doc_rec_id = f"{prefix}_{year_str}_{next_num:04d}"

        # Default doc_rec_date to today if not provided
        if not self.doc_rec_date:
            self.doc_rec_date = timezone.now().date()

        super().save(*args, **kwargs)


# ---------- ECA table (related via doc_rec_id) ----------
class Eca(models.Model):
    id = models.BigAutoField(primary_key=True)

    # Link to DocRec by its string identifier (doc_rec_id)
    doc_rec = models.ForeignKey(
        DocRec,
        to_field='doc_rec_id',
        db_column='doc_rec_id',
        on_delete=models.RESTRICT,
        related_name='eca_entries',
        null=True,
        blank=True,
    )

    eca_name = models.CharField(max_length=255, null=True, blank=True, db_column='eca_name')
    eca_ref_no = models.CharField(max_length=100, null=True, blank=True, db_column='eca_ref_no')
    eca_send_date = models.DateField(null=True, blank=True, db_column='eca_send_date')
    eca_remark = models.TextField(null=True, blank=True, db_column='eca_remark')

    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='createdby',
        related_name='eca_created'
    )

    createdat = models.DateTimeField(auto_now_add=True, db_column='createdat')
    updatedat = models.DateTimeField(auto_now=True, db_column='updatedat')

    class Meta:
        db_table = 'eca'
        indexes = [
            models.Index(fields=["doc_rec"], name="idx_eca_doc_rec"),
        ]

    def __str__(self):
        return f"ECA {self.id} for {getattr(self.doc_rec, 'doc_rec_id', None) or '-'}"


# ---------- Institutional Verification Main (inst_verification_main) ----------
class InstVerificationMain(models.Model):
    id = models.BigAutoField(primary_key=True)

    # Link to DocRec by its public identifier
    doc_rec = models.ForeignKey(
        DocRec,
        to_field='doc_rec_id',
        db_column='doc_rec_id',
        on_delete=models.SET_NULL,
        related_name='inst_verifications',
        null=True,
        blank=True,
    )

    # Institutional verification fields
    inst_veri_number = models.CharField(max_length=100, null=True, blank=True, db_column='inst_veri_number')
    inst_veri_date = models.DateField(null=True, blank=True, db_column='inst_veri_date')

    institute = models.ForeignKey(
        'Institute',
        on_delete=models.SET_NULL,
        db_column='institute_id',
        related_name='inst_verification_main',
        null=True,
        blank=True,
    )

    rec_inst_name = models.CharField(max_length=255, null=True, blank=True, db_column='rec_inst_name')
    rec_inst_address_1 = models.CharField(max_length=255, null=True, blank=True, db_column='rec_inst_address_1')
    rec_inst_address_2 = models.CharField(max_length=255, null=True, blank=True, db_column='rec_inst_address_2')
    rec_inst_location = models.CharField(max_length=255, null=True, blank=True, db_column='rec_inst_location')
    rec_inst_city = models.CharField(max_length=255, null=True, blank=True, db_column='rec_inst_city')
    rec_inst_pin = models.CharField(max_length=20, null=True, blank=True, db_column='rec_inst_pin')
    rec_inst_email = models.EmailField(null=True, blank=True, db_column='rec_inst_email')
    rec_by = models.CharField(max_length=255, null=True, blank=True, db_column='rec_by')

    doc_rec_date = models.DateField(null=True, blank=True, db_column='doc_rec_date')
    inst_ref_no = models.CharField(max_length=100, null=True, blank=True, db_column='inst_ref_no')
    ref_date = models.DateField(null=True, blank=True, db_column='ref_date')

    class Meta:
        db_table = 'inst_verification_main'
        indexes = [
            models.Index(fields=['doc_rec'], name='idx_ivm_doc_rec'),
            models.Index(fields=['institute'], name='idx_ivm_institute'),
            models.Index(fields=['inst_veri_number'], name='idx_ivm_veri_no'),
        ]

    def __str__(self):
        return f"InstVeri {self.inst_veri_number or '-'} for {getattr(self.doc_rec, 'doc_rec_id', None) or '-'}"


# ---------- Institutional Verification Student (inst_verification_student) ----------
class InstVerificationStudent(models.Model):
    id = models.BigAutoField(primary_key=True)

    # Link to DocRec by its public identifier
    doc_rec = models.ForeignKey(
        DocRec,
        to_field='doc_rec_id',
        db_column='doc_rec_id',
        on_delete=models.SET_NULL,
        related_name='inst_verification_students',
        null=True,
        blank=True,
    )

    sr_no = models.PositiveIntegerField(null=True, blank=True, db_column='sr_no')

    # Link to Enrollment by its enrollment_no string
    enrollment = models.ForeignKey(
        Enrollment,
        to_field='enrollment_no',
        db_column='enrollment_no',
        on_delete=models.SET_NULL,
        related_name='inst_verification_students',
        null=True,
        blank=True,
    )

    student_name = models.CharField(max_length=255, null=True, blank=True, db_column='student_name')

    institute = models.ForeignKey(
        'Institute',
        on_delete=models.SET_NULL,
        db_column='institute_id',
        related_name='inst_verification_students',
        null=True,
        blank=True,
    )

    # Use varchar links to course identifiers
    sub_course = models.ForeignKey(
        'SubBranch',
        to_field='subcourse_id',
        db_column='sub_course',
        on_delete=models.SET_NULL,
        related_name='inst_verification_students',
        null=True,
        blank=True,
    )
    main_course = models.ForeignKey(
        'MainBranch',
        to_field='maincourse_id',
        db_column='main_course',
        on_delete=models.SET_NULL,
        related_name='inst_verification_students',
        null=True,
        blank=True,
    )

    type_of_credential = models.CharField(max_length=50, null=True, blank=True, db_column='type_of_credential')
    month_year = models.CharField(max_length=20, null=True, blank=True, db_column='month_year')
    verification_status = models.CharField(max_length=20, null=True, blank=True, db_column='verification_status', choices=VerificationStatus.choices)

    class Meta:
        db_table = 'inst_verification_student'
        indexes = [
            models.Index(fields=['doc_rec'], name='idx_ivs_doc_rec'),
            models.Index(fields=['enrollment'], name='idx_ivs_enrollment'),
            models.Index(fields=['institute'], name='idx_ivs_institute'),
        ]

    def __str__(self):
        return f"IVS {self.sr_no or '-'} - {getattr(self.doc_rec, 'doc_rec_id', None) or '-'}"


# ---------- Migration Certificate (migration) ----------
class MigrationStatus(models.TextChoices):
    PENDING = "Pending", "Pending"
    ISSUED = "Issued", "Issued"
    CANCELLED = "Cancelled", "Cancelled"


class MigrationRecord(models.Model):
    id = models.BigAutoField(primary_key=True)

    # Link to DocRec by PK id (column name will be doc_rec_id)
    doc_rec = models.ForeignKey(
        DocRec,
        on_delete=models.CASCADE,
        db_column="doc_rec_id",
        related_name="migration_records",
    )

    # Link to Enrollment by its public enrollment_no (varchar)
    enrollment = models.ForeignKey(
        Enrollment,
        to_field="enrollment_no",
        db_column="enrollment_no",
        on_delete=models.CASCADE,
        related_name="migration_records",
        db_constraint=False,
    )

    student_name = models.CharField(max_length=255, db_column="student_name")

    # Institute via its numeric/varchar PK column name in our schema (institute_id)
    institute = models.ForeignKey(
        Institute,
        to_field="institute_id",
        db_column="institute_id",
        on_delete=models.CASCADE,
        related_name="migration_records",
    )

    # Use varchar identifiers for course linkage to align with existing models
    subcourse = models.ForeignKey(
        SubBranch,
        to_field="subcourse_id",
        db_column="subcourse_id",
        on_delete=models.CASCADE,
        related_name="migration_records",
    )
    maincourse = models.ForeignKey(
        MainBranch,
        to_field="maincourse_id",
        db_column="maincourse_id",
        on_delete=models.CASCADE,
        related_name="migration_records",
    )

    # Migration certificate details
    mg_number = models.CharField(max_length=50, unique=True, db_column="mg_number")
    mg_date = models.DateField(db_column="mg_date")

    exam_year = models.CharField(max_length=20, db_column="exam_year")
    admission_year = models.CharField(max_length=20, db_column="admission_year")
    exam_details = models.TextField(null=True, blank=True, db_column="exam_details")

    mg_status = models.CharField(
        max_length=20,
        choices=MigrationStatus.choices,
        default=MigrationStatus.PENDING,
        db_column="mg_status",
    )

    # Denormalized copy from DocRec; will be auto-copied on save if missing
    pay_rec_no = models.CharField(max_length=50, db_column="pay_rec_no")

    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='createdby',
        related_name='migration_created'
    )

    created_at = models.DateTimeField(auto_now_add=True, db_column="created_at")
    updated_at = models.DateTimeField(auto_now=True, db_column="updated_at")

    class Meta:
        db_table = "migration"
        indexes = [
            models.Index(fields=["doc_rec"], name="idx_mg_doc_rec"),
            models.Index(fields=["enrollment"], name="idx_mg_enrollment"),
            models.Index(fields=["institute"], name="idx_mg_institute"),
            models.Index(fields=["mg_number"], name="idx_mg_number"),
        ]

    def clean(self):
        # Ensure pay_rec_no will be present
        if not self.pay_rec_no and self.doc_rec and self.doc_rec.pay_rec_no:
            self.pay_rec_no = self.doc_rec.pay_rec_no
        if not self.pay_rec_no:
            raise ValidationError({"pay_rec_no": "pay_rec_no is required (copied from related DocRec)."})

    def save(self, *args, **kwargs):
        # Auto-copy pay_rec_no from DocRec if not explicitly provided
        if not self.pay_rec_no and self.doc_rec and self.doc_rec.pay_rec_no:
            self.pay_rec_no = self.doc_rec.pay_rec_no
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"Migration {self.mg_number} ({self.student_name})"


# ---------- Provisional Certificate (provisional) ----------
class ProvisionalStatus(models.TextChoices):
    PENDING = "Pending", "Pending"
    ISSUED = "Issued", "Issued"
    CANCELLED = "Cancelled", "Cancelled"


class ProvisionalRecord(models.Model):
    id = models.BigAutoField(primary_key=True)

    # Link to DocRec by PK id (column name will be doc_rec_id)
    doc_rec = models.ForeignKey(
        DocRec,
        on_delete=models.CASCADE,
        db_column="doc_rec_id",
        related_name="provisional_records",
    )

    # Link to Enrollment by its public enrollment_no (varchar)
    enrollment = models.ForeignKey(
        Enrollment,
        to_field="enrollment_no",
        db_column="enrollment_no",
        on_delete=models.CASCADE,
        related_name="provisional_records",
        db_constraint=False,
    )

    student_name = models.CharField(max_length=255, db_column="student_name")

    # Institute via its PK column name in our schema (institute_id)
    institute = models.ForeignKey(
        Institute,
        to_field="institute_id",
        db_column="institute_id",
        on_delete=models.CASCADE,
        related_name="provisional_records",
    )

    # Use varchar identifiers for course linkage to align with existing models
    subcourse = models.ForeignKey(
        SubBranch,
        to_field="subcourse_id",
        db_column="subcourse_id",
        on_delete=models.CASCADE,
        related_name="provisional_records",
    )
    maincourse = models.ForeignKey(
        MainBranch,
        to_field="maincourse_id",
        db_column="maincourse_id",
        on_delete=models.CASCADE,
        related_name="provisional_records",
    )

    # Provisional certificate details
    class_obtain = models.CharField(max_length=100, null=True, blank=True, db_column="class_obtain")
    prv_number = models.CharField(max_length=50, unique=True, db_column="prv_number")
    prv_date = models.DateField(db_column="prv_date")

    passing_year = models.CharField(max_length=20, db_column="passing_year")
    prv_status = models.CharField(
        max_length=20,
        choices=ProvisionalStatus.choices,
        default=ProvisionalStatus.PENDING,
        db_column="prv_status",
    )

    # Denormalized copy from DocRec; will be auto-copied on save if missing
    pay_rec_no = models.CharField(max_length=50, db_column="pay_rec_no")

    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column='createdby',
        related_name='provisional_created'
    )

    created_at = models.DateTimeField(auto_now_add=True, db_column="created_at")
    updated_at = models.DateTimeField(auto_now=True, db_column="updated_at")

    class Meta:
        db_table = "provisional"
        indexes = [
            models.Index(fields=["doc_rec"], name="idx_prv_doc_rec"),
            models.Index(fields=["enrollment"], name="idx_prv_enrollment"),
            models.Index(fields=["institute"], name="idx_prv_institute"),
            models.Index(fields=["prv_number"], name="idx_prv_number"),
        ]

    def clean(self):
        # Ensure pay_rec_no will be present
        if not self.pay_rec_no and self.doc_rec and self.doc_rec.pay_rec_no:
            self.pay_rec_no = self.doc_rec.pay_rec_no
        if not self.pay_rec_no:
            raise ValidationError({"pay_rec_no": "pay_rec_no is required (copied from related DocRec)."})

    def save(self, *args, **kwargs):
        # Auto-copy pay_rec_no from DocRec if not explicitly provided
        if not self.pay_rec_no and self.doc_rec and self.doc_rec.pay_rec_no:
            self.pay_rec_no = self.doc_rec.pay_rec_no
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"Provisional {self.prv_number} ({self.student_name})"