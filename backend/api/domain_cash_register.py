"""Accounts & Finance cash register domain models.

This module stores the FeeType master and ledger-style CashRegister entries.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import models

User = get_user_model()

__all__ = ["FeeType", "CashRegister"]


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
    receipt_no = models.CharField(max_length=32, unique=True, editable=False)
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
        ordering = ["-date", "-receipt_no"]

    def __str__(self) -> str:  # pragma: no cover - repr helper
        return self.receipt_no
