# Robust, case-insensitive fee code alias mapping for Excel uploads
# Always use .lower() on input before lookup
FEE_ALIAS = {
    # --- Exam Fees ---
    "examfees": "EXAM_FEES",
    "examfee": "EXAM_FEES",
    "exam fees": "EXAM_FEES",
    "exam fee": "EXAM_FEES",
    "exmfees": "EXAM_FEES",
    "exmfee": "EXAM_FEES",

    # --- Rechecking ---
    "rechking": "RECHECK",
    "rechecking": "RECHECK",
    "rechk": "RECHECK",

    # --- Provisional Degree ---
    "pdf": "PROV_DEGREE_FEES",
    "provisional degree": "PROV_DEGREE_FEES",
    "prov degree": "PROV_DEGREE_FEES",
    "prov_deg": "PROV_DEGREE_FEES",

    # --- Student Verification ---
    "svf": "STU_VER_FEES",
    "stuverfees": "STU_VER_FEES",
    "stu ver fees": "STU_VER_FEES",

    # --- PhD Tuition / General PhD Fees ---
    "phd": "PHD_TUTION",
    "phdfees": "PHD_TUTION",
    "phd fee": "PHD_TUTION",

    # --- PhD Form Fees ---
    "phdform": "PHD_FORM",
    "phd form": "PHD_FORM",

    # --- University Development ---
    "unidev": "UNI_DEV_FEES",
    "unidevfees": "UNI_DEV_FEES",
    "uni dev": "UNI_DEV_FEES",

    # --- KYA ---
    "kyafes": "KYA",
    "kya fees": "KYA",

    # --- OTHER FEES (ONLY OTHER FEES) ---
    "other fees": "OTHER_FEES",
    "other": "OTHER_FEES",
    "misc": "OTHER_FEES",
}

"""
Accounts & Finance cash register domain models.

Includes:
✔ FeeType master
✔ Receipt ledger
✔ Receipt items
✔ Cash outward (Deposit / Expense)
✔ Cash on hand (automatic daily snapshot)
✔ Cash on hand denomination details
"""

from typing import Optional
from django.contrib.auth import get_user_model
from django.db import models

User = get_user_model()

__all__ = [
    "FeeType",
    "Receipt",
    "ReceiptItem",
    "CashOutward",
    "CashOnHand",
    "CashOnHandItem",
    "PAYMENT_MODE_CHOICES",
    "normalize_receipt_no",
    "split_receipt",
    "merge_reference_and_number",
]

# ---------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------

def format_rec_no(val) -> Optional[str]:
    """Return zero-padded 6 digit receipt number or None on error."""
    if val is None:
        return None
    try:
        return f"{int(float(val)):06d}"
    except Exception:
        return None


def normalize_receipt_no(value: Optional[str]) -> Optional[str]:
    """Normalize a receipt string by stripping spaces and trimming."""
    if not value:
        return None
    return str(value).replace(" ", "").strip()


def merge_reference_and_number(reference: Optional[str], number: Optional[str]) -> Optional[str]:
    if not reference and not number:
        return None
    ref = str(reference or "").strip()
    num = str(number or "").strip()
    return normalize_receipt_no(f"{ref}{num}")


def split_receipt(value: Optional[str]) -> tuple[Optional[str], Optional[int]]:
    if not value or len(value) < 6:
        return value, None
    try:
        return value[:-6], int(value[-6:])
    except Exception:
        return value, None


# ---------------------------------------------------------------------
# Fee Type Master
# ---------------------------------------------------------------------

class FeeType(models.Model):
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "fee_type"
        ordering = ["code"]

    def save(self, *args, **kwargs):
        if self.code:
            self.code = self.code.strip().upper()
        if self.name:
            self.name = self.name.strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.code} - {self.name}"


# ---------------------------------------------------------------------
# Receipt Ledger
# ---------------------------------------------------------------------

PAYMENT_MODE_CHOICES = (
    ("CASH", "Cash"),
    ("BANK", "Bank"),
    ("UPI", "UPI"),
)


class Receipt(models.Model):
    date = models.DateField()
    payment_mode = models.CharField(max_length=10, choices=PAYMENT_MODE_CHOICES)
    rec_ref = models.CharField(max_length=32)
    rec_no = models.PositiveIntegerField()
    receipt_no_full = models.CharField(max_length=64, editable=False, db_index=True)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    remark = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "receipt"
        ordering = ["-date", "-rec_ref", "-rec_no"]

    def save(self, *args, **kwargs):
        self.rec_no = int(float(self.rec_no))
        if not self.receipt_no_full:
            self.receipt_no_full = f"{self.rec_ref}{format_rec_no(self.rec_no)}"
        super().save(*args, **kwargs)

    def __str__(self):
        return self.receipt_no_full


class ReceiptItem(models.Model):
    receipt = models.ForeignKey(Receipt, on_delete=models.CASCADE, related_name="items")
    fee_type = models.ForeignKey(FeeType, on_delete=models.PROTECT)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    remark = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "receipt_item"
        ordering = ["id"]

    def __str__(self):
        return f"{self.receipt} - {self.fee_type} - {self.amount}"


# =====================================================================
# CASH OUTWARD & CASH ON HAND
# =====================================================================

class CashOutward(models.Model):
    TXN_TYPE_CHOICES = (
        ("DEPOSIT", "Deposit"),
        ("EXPENSE", "Expense"),
    )

    date = models.DateField(db_index=True)
    txn_type = models.CharField(max_length=10, choices=TXN_TYPE_CHOICES)
    ref_no = models.CharField(max_length=50, blank=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    remark = models.TextField(blank=True)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "cash_outward"
        ordering = ["-date", "-id"]

    def __str__(self):
        return f"{self.date} {self.txn_type} ₹{self.amount}"


class CashOnHand(models.Model):
    STATUS_CHOICES = (
        ("OPEN", "Open"),
        ("CLOSED", "Closed"),
    )

    date = models.DateField(unique=True, db_index=True)

    # Auto-calculated snapshot values
    system_cash = models.DecimalField(max_digits=14, decimal_places=2)
    total_deposit = models.DecimalField(max_digits=14, decimal_places=2)
    total_expense = models.DecimalField(max_digits=14, decimal_places=2)
    expected_cash = models.DecimalField(max_digits=14, decimal_places=2)

    physical_cash = models.DecimalField(max_digits=14, decimal_places=2)
    difference = models.DecimalField(max_digits=14, decimal_places=2)

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="OPEN")
    closed_by = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "cash_on_hand"
        ordering = ["-date"]

    def __str__(self):
        return f"Cash On Hand {self.date}"


class CashOnHandItem(models.Model):
    cash_on_hand = models.ForeignKey(
        CashOnHand,
        on_delete=models.CASCADE,
        related_name="items"
    )
    denomination = models.PositiveIntegerField()
    is_coin = models.BooleanField(default=False)
    qty = models.PositiveIntegerField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = "cash_on_hand_item"
        ordering = ["-denomination"]
        unique_together = ("cash_on_hand", "denomination", "is_coin")

    def save(self, *args, **kwargs):
        self.amount = self.denomination * self.qty
        super().save(*args, **kwargs)

    def __str__(self):
        return f"₹{self.denomination} × {self.qty}"
