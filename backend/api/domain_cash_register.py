"""Accounts & Finance cash register domain models.

This module stores the FeeType master and ledger-style CashRegister entries.
"""
from __future__ import annotations

from typing import Optional

from django.contrib.auth import get_user_model
from django.db import models

User = get_user_model()

__all__ = ["FeeType", "CashRegister", "Receipt", "ReceiptItem"]


class FeeType(models.Model):
    """Master table representing a fee / receipt head."""

    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "fee_type"
        ordering = ["code"]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"{self.code} - {self.name}" if self.code else self.name


class CashRegister(models.Model):
    """Cash register entry representing a single receipt."""

    PAYMENT_MODE_CHOICES = [
        ("CASH", "Cash"),
        ("BANK", "Bank"),
        ("UPI", "UPI"),
    ]

    date = models.DateField()
    payment_mode = models.CharField(max_length=8, choices=PAYMENT_MODE_CHOICES)
    rec_ref = models.CharField(max_length=32, blank=True, default="")
    rec_no = models.PositiveIntegerField(blank=True, null=True)
    receipt_no_full = models.CharField(
        max_length=64,
        unique=True,
        editable=False,
        db_index=True,
        blank=True,
        null=False,
    )
    fee_type = models.ForeignKey(
        FeeType,
        on_delete=models.PROTECT,
        related_name="cash_entries",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    remark = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="cash_register_entries",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cash_register"
        ordering = ["-date", "-rec_ref", "-rec_no"]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        if self.receipt_no_full:
            return self.receipt_no_full
        number = "" if self.rec_no is None else str(self.rec_no)
        return f"{self.rec_ref}{number}".strip()

    @staticmethod
    def normalize_receipt_no(value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        try:
            cleaned = (
                str(value)
                .replace("\t", "")
                .replace("\n", "")
                .replace("\r", "")
                .replace(" ", "")
            )
        except Exception:
            cleaned = str(value)
        cleaned = cleaned.strip()
        return cleaned or None

    @staticmethod
    def merge_reference_and_number(reference: Optional[str], number: Optional[str]) -> Optional[str]:
        if not reference and not number:
            return None
        ref = str(reference or "").strip()
        num = str(number or "").strip()
        combined = f"{ref}{num}"
        return CashRegister.normalize_receipt_no(combined)

    @staticmethod
    def split_receipt(value: Optional[str]):
        normalized = CashRegister.normalize_receipt_no(value)
        if not normalized or len(normalized) < 6:
            return normalized, None
        tail = normalized[-6:]
        try:
            number = int(tail)
        except Exception:
            return normalized, None
        reference = normalized[:-6]
        return reference, number

    def save(self, *args, **kwargs):  # type: ignore[override]
        if not self.receipt_no_full:
            number_part = None
            if self.rec_no is not None:
                number_part = f"{self.rec_no:06d}"
            normalized = self.merge_reference_and_number(self.rec_ref, number_part)
        else:
            normalized = self.normalize_receipt_no(self.receipt_no_full)
        if normalized:
            self.receipt_no_full = normalized
        if (not getattr(self, "rec_ref", None) or getattr(self, "rec_no", None) is None) and self.receipt_no_full:
            ref_guess, num_guess = self.split_receipt(self.receipt_no_full)
            if ref_guess and not getattr(self, "rec_ref", None):
                self.rec_ref = ref_guess
            if num_guess is not None and getattr(self, "rec_no", None) is None:
                self.rec_no = num_guess
        super().save(*args, **kwargs)


class Receipt(models.Model):
    """Receipt header representing a single receipt with multiple line items."""

    PAYMENT_MODE_CHOICES = CashRegister.PAYMENT_MODE_CHOICES

    date = models.DateField()
    payment_mode = models.CharField(max_length=8, choices=PAYMENT_MODE_CHOICES)
    rec_ref = models.CharField(max_length=32, blank=True, default="")
    rec_no = models.PositiveIntegerField(blank=True, null=True)
    receipt_no_full = models.CharField(
        max_length=64,
        unique=True,
        editable=False,
        db_index=True,
        blank=True,
        null=False,
    )
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    remark = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="receipts",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "receipt"
        ordering = ["-date", "-rec_ref", "-rec_no"]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        if self.receipt_no_full:
            return self.receipt_no_full
        number = "" if self.rec_no is None else str(self.rec_no)
        return f"{self.rec_ref}{number}".strip()

    def save(self, *args, **kwargs):  # type: ignore[override]
        if not self.receipt_no_full:
            number_part = None
            if self.rec_no is not None:
                number_part = f"{self.rec_no:06d}"
            normalized = CashRegister.merge_reference_and_number(self.rec_ref, number_part)
        else:
            normalized = CashRegister.normalize_receipt_no(self.receipt_no_full)
        if normalized:
            self.receipt_no_full = normalized
        if (not getattr(self, "rec_ref", None) or getattr(self, "rec_no", None) is None) and self.receipt_no_full:
            ref_guess, num_guess = CashRegister.split_receipt(self.receipt_no_full)
            if ref_guess and not getattr(self, "rec_ref", None):
                self.rec_ref = ref_guess
            if num_guess is not None and getattr(self, "rec_no", None) is None:
                self.rec_no = num_guess
        super().save(*args, **kwargs)


class ReceiptItem(models.Model):
    """Line item for a Receipt linking to FeeType."""

    receipt = models.ForeignKey(Receipt, on_delete=models.CASCADE, related_name="items")
    fee_type = models.ForeignKey(
        FeeType,
        on_delete=models.PROTECT,
        related_name="receipt_items",
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    remark = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "receipt_item"
        ordering = ["id"]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return f"{self.receipt} - {self.fee_type} - {self.amount}"

