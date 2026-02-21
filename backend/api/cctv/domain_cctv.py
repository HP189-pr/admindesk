from django.db import models
from django.db.models import Max

__all__ = [
    "CCTVExam",
    "CCTVCentreEntry",
    "CCTVDVD",
    "CCTVOutward",
]


# ============================
# 1️⃣ CCTV Exam Master
# ============================

class CCTVExam(models.Model):
    exam_date = models.CharField(max_length=50)
    exam_time = models.CharField(max_length=100)
    course = models.CharField(max_length=50)
    sem = models.CharField(max_length=10)
    subject_code = models.CharField(max_length=50)
    subject_name = models.CharField(max_length=200)
    no_of_students = models.IntegerField(default=0)
    institute_remarks = models.CharField(max_length=200, blank=True, null=True)
    exam_year_session = models.CharField(max_length=20)
    raw_row = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-exam_date"]

    def __str__(self):
        return f"{self.exam_date} - {self.subject_code}"


# ============================
# 2️⃣ Centre-wise CD Entry
# ============================

class CCTVCentreEntry(models.Model):
    SESSION_CHOICES = (
        ("A", "A"),
        ("B", "B"),
        ("C", "C"),
        ("D", "D"),
    )

    exam = models.ForeignKey(
        CCTVExam,
        on_delete=models.CASCADE,
    )

    session = models.CharField(max_length=1, choices=SESSION_CHOICES)
    place = models.CharField(max_length=100)
    no_of_cd = models.IntegerField()

    start_number = models.IntegerField(blank=True, null=True)
    end_number = models.IntegerField(blank=True, null=True)

    start_label = models.CharField(max_length=20, blank=True, null=True)
    end_label = models.CharField(max_length=20, blank=True, null=True)

    cc_total = models.IntegerField(default=0)
    cc_start_label = models.CharField(max_length=20, blank=True, null=True)
    cc_end_label = models.CharField(max_length=20, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.pk:
            last = CCTVCentreEntry.objects.filter(
                session=self.session,
            ).aggregate(max_end=Max("end_number"))

            last_number = last["max_end"] or 0
            self.start_number = last_number + 1
            self.end_number = last_number + self.no_of_cd

            self.start_label = f"{self.session}-{self.start_number}"
            self.end_label = f"{self.session}-{self.end_number}"

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.place} - {self.exam.subject_code}"




# ============================
# 3️⃣ Individual DVD Tracking
# ============================

class CCTVDVD(models.Model):
    centre = models.ForeignKey(
        CCTVCentreEntry,
        on_delete=models.CASCADE,
        related_name="dvds"
    )

    number = models.IntegerField()
    label = models.CharField(max_length=20)  # A-1

    objection_found = models.BooleanField(default=False)

    cc_number = models.IntegerField(null=True, blank=True)
    cc_label = models.CharField(max_length=20, blank=True)

    sent_to_college = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["number"]


# ============================
# 4️⃣ Outward Register
# ============================

class CCTVOutward(models.Model):
    cctv_record_no = models.CharField(max_length=50, unique=True, null=True, blank=True)

    outward_no = models.CharField(max_length=50, unique=True)
    outward_date = models.DateField()

    college_name = models.CharField(max_length=200)
    centre_name = models.CharField(max_length=200)

    exam_on = models.CharField(max_length=200)
    last_date = models.DateField()

    cc_start_label = models.CharField(max_length=20)
    cc_end_label = models.CharField(max_length=20)

    no_of_dvd = models.IntegerField(default=0)
    no_of_report = models.IntegerField(default=0)

    return_received = models.BooleanField(default=False)

    case_found = models.BooleanField(default=False)

    CASE_TYPE_CHOICES = [
        ("CCTV", "CCTV"),
        ("Physical", "Physical"),
    ]

    case_type = models.CharField(
        max_length=20,
        choices=CASE_TYPE_CHOICES,
        null=True,
        blank=True
    )

    case_details = models.TextField(blank=True)
    remark = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-outward_date"]

    def __str__(self):
        return f"{self.cctv_record_no} - {self.outward_no}"

