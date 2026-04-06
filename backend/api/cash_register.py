# backend/api/cash_register.py
from __future__ import annotations
from django.utils.dateparse import parse_date
from django.db.models import Sum, Min, Max, F, Func
from django.db.models.functions import TruncMonth, TruncYear
from decimal import Decimal
from django.db.models import Sum
from django.utils import timezone

from .domain_cash_register import (
    CashOutward,
    CashOnHand,
    CashOnHandItem,
)

# --- Period grouping helpers ---
class Quarter(Func):
    function = 'DATE_TRUNC'
    template = "%(function)s('quarter', %(expressions)s)"

class HalfYear(Func):
    function = 'DATE_TRUNC'
    template = ("%(function)s('year', %(expressions)s) + interval '6 months' * ((extract(month from %(expressions)s)-1)/6)")
"""Serializers and viewsets for the Accounts & Finance cash register."""

from datetime import date, datetime
import io
import pandas as pd
from typing import Any, Dict, Optional

from django.db import transaction
from django.db.models import Q, QuerySet, Sum
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .domain_cash_register import (
    FeeType,
    Receipt,
    ReceiptItem,
    normalize_receipt_no,
    split_receipt,
    PAYMENT_MODE_CHOICES,
    FEE_ALIAS,
)
from .excel_import.helpers import parse_excel_date
from .domain_core import Menu, Module, UserPermission

FINANCE_MODULE_NAME = "Accounts & Finance"
DEFAULT_RIGHTS = {
    "can_view": False,
    "can_create": False,
    "can_edit": False,
    "can_delete": False,
}
FULL_RIGHTS = {k: True for k in DEFAULT_RIGHTS}
_PAYMENT_PREFIX = {
    "CASH": "C01",
    "BANK": "1471",  # default bank account prefix
    "UPI": "8785",
}

# Allowed bank prefixes (multi-account support)
_BANK_PREFIX_CHOICES = {"1471", "138", "B16"}
_AUTO_CANCEL_REASON = "Cancelled from new entry panel"


def _fiscal_year_suffix(entry_date: date) -> int:
    """Return the two-digit start-year of the fiscal year (Apr–Mar).

    Example: Jan 2026 -> fiscal start year 2025 -> returns 25
    """
    if not entry_date:
        entry_date = timezone.now().date()
    start_year = entry_date.year if entry_date.month >= 4 else entry_date.year - 1
    return start_year % 100


def _normalize(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def _parse_is_cancelled(value) -> Optional[bool]:
    if value is None:
        return None
    text = str(value).strip().lower()
    if text in {"", "null", "none", "nan"}:
        return None
    if text in {"yes", "y", "true", "1", "cancel", "cancelled", "canceled"}:
        return True
    return None


def _user_is_admin(user) -> bool:
    return bool(
        getattr(user, "is_superuser", False)
        or getattr(user, "is_staff", False)
        or user.groups.filter(name__iexact="Admin").exists()
    )


def _perm_to_dict(record: UserPermission) -> Dict[str, bool]:
    return {
        "can_view": bool(record.can_view),
        "can_create": bool(record.can_create),
        "can_edit": bool(record.can_edit),
        "can_delete": bool(record.can_delete),
    }


def _fetch_permission_from_db(user, menu_name: str) -> Optional[Dict[str, bool]]:
    try:
        module = Module.objects.filter(name__iexact=FINANCE_MODULE_NAME).first()
        if not module:
            return None

        menu = None
        if menu_name:
            menu = Menu.objects.filter(module=module, name__iexact=menu_name).first()
            if not menu:
                # Allow emoji/prefix variants like "🧾 Fee Type Master"
                menu = Menu.objects.filter(module=module, name__icontains=menu_name).first()

        if menu:
            record = UserPermission.objects.filter(user=user, module=module, menu=menu).first()
            if record:
                return _perm_to_dict(record)

        module_level = UserPermission.objects.filter(user=user, module=module, menu__isnull=True).first()
        if module_level:
            return _perm_to_dict(module_level)
    except Exception:
        return None
    return None


def _fallback_group_rights(user, menu_name: str) -> Optional[Dict[str, bool]]:
    menu_name = _normalize(menu_name)
    if not menu_name:
        return None
    if user.groups.filter(name__iexact="Accounts Staff").exists():
        if "cash register" in menu_name or "daily register" in menu_name:
            return {"can_view": True, "can_create": True, "can_edit": True, "can_delete": False}
        if "fee type" in menu_name:
            return {"can_view": True, "can_create": False, "can_edit": False, "can_delete": False}
    if user.groups.filter(name__iexact="Viewer").exists():
        if "cash register" in menu_name or "fee type" in menu_name:
            return {"can_view": True, "can_create": False, "can_edit": False, "can_delete": False}
    return None


def get_finance_rights(user, menu_name: str) -> Dict[str, bool]:
    if not user or not user.is_authenticated:
        return DEFAULT_RIGHTS.copy()
    if _user_is_admin(user):
        return FULL_RIGHTS.copy()
    rights = _fetch_permission_from_db(user, menu_name)
    if rights:
        return rights
    fallback = _fallback_group_rights(user, menu_name)
    if fallback:
        return fallback
    return DEFAULT_RIGHTS.copy()


class FinancePermissionMixin:
    """Mixin that resolves Accounts & Finance menu permissions per action."""

    finance_menu_name: str = ""
    permission_action_map = {
        "list": "can_view",
        "retrieve": "can_view",
        "create": "can_create",
        "update": "can_edit",
        "partial_update": "can_edit",
        "destroy": "can_delete",
    }

    def get_menu_name(self) -> str:
        return self.finance_menu_name

    def _required_flag(self, action: Optional[str]) -> Optional[str]:
        if not action:
            return None
        return self.permission_action_map.get(action)

    def _set_rights_cache(self, rights: Dict[str, bool]) -> None:
        self._finance_rights_cache = rights

    def _get_rights_cache(self) -> Optional[Dict[str, bool]]:
        return getattr(self, "_finance_rights_cache", None)

    def get_finance_rights(self, user) -> Dict[str, bool]:
        cached = self._get_rights_cache()
        if cached is not None:
            return cached
        rights = get_finance_rights(user, self.get_menu_name())
        self._set_rights_cache(rights)
        return rights

    def check_permissions(self, request):  # noqa: D401
        super().check_permissions(request)
        required = self._required_flag(getattr(self, "action", None))
        if required:
            rights = self.get_finance_rights(request.user)
            if not rights.get(required):
                raise PermissionDenied("You do not have permission to perform this action.")


class FeeTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeeType
        fields = ["id", "code", "name", "is_active", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]

    def validate_code(self, value: str) -> str:
        if not value:
            raise serializers.ValidationError("Code is required")
        return value.strip().upper()

    def validate_name(self, value: str) -> str:
        if not value:
            raise serializers.ValidationError("Name is required")
        return value.strip()





class FeeTypeViewSet(FinancePermissionMixin, mixins.ListModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    queryset = FeeType.objects.all().order_by("code")
    serializer_class = FeeTypeSerializer
    permission_classes = [IsAuthenticated]
    finance_menu_name = "Fee Type Master"

    def get_queryset(self) -> QuerySet[FeeType]:  # type: ignore[override]
        qs = super().get_queryset()
        active_only = self.request.query_params.get("active")
        if active_only in {"1", "true", "True"}:
            qs = qs.filter(is_active=True)
        return qs


class ReceiptNumberService:
    @staticmethod
    def _series_prefix(prefix: str) -> str:
        """Normalize a receipt series prefix to end with '/R'."""
        normalized = (normalize_receipt_no(prefix) or "").rstrip("/")
        if normalized and not normalized.endswith("/R"):
            normalized = f"{normalized}/R"
        return normalized

    @staticmethod
    def _prefix(payment_mode: str, entry_date: date, bank_base: Optional[str] = None) -> str:
        # Allow overriding bank prefix when multiple bank accounts are supported
        if payment_mode == "BANK" and bank_base:
            base = bank_base.strip().upper()
        else:
            base = _PAYMENT_PREFIX[payment_mode]
        year = _fiscal_year_suffix(entry_date)
        return ReceiptNumberService._series_prefix(f"{base}/{year:02d}/R")

    @classmethod
    def next_numbers(cls, payment_mode: str, entry_date: date, *, lock: bool = False, bank_base: Optional[str] = None) -> Dict[str, Any]:
        # Support mixed historical formats for the same fiscal series, e.g.:
        # - PREFIX/25/R
        # - PREFIX/2025
        # - PREFIX/2025/R
        if payment_mode == "BANK" and bank_base:
            base = bank_base.strip().upper()
            if base not in _BANK_PREFIX_CHOICES:
                base = _PAYMENT_PREFIX[payment_mode]
        else:
            base = _PAYMENT_PREFIX[payment_mode]

        fiscal_start_year = entry_date.year if entry_date.month >= 4 else entry_date.year - 1
        fiscal_start_date = date(fiscal_start_year, 4, 1)
        fiscal_end_date = date(fiscal_start_year + 1, 3, 31)
        short_prefix = cls._series_prefix(f"{base}/{_fiscal_year_suffix(entry_date):02d}/R")

        qs = Receipt.objects.filter(
            payment_mode=payment_mode,
            date__gte=fiscal_start_date,
            date__lte=fiscal_end_date,
        )
        if payment_mode == "BANK" and base in _BANK_PREFIX_CHOICES:
            qs = qs.filter(
                Q(rec_ref__startswith=f"{base}/")
                | Q(receipt_no_full__startswith=f"{base}/")
            )

        if lock:
            qs = qs.select_for_update()

        max_seq = 0
        best_prefix = ""
        for rec in qs.only("rec_ref", "rec_no", "receipt_no_full"):
            full_prefix_candidate, parsed_from_full = split_receipt(rec.receipt_no_full)
            parsed_seq = rec.rec_no if rec.rec_no is not None else parsed_from_full
            if parsed_seq is None:
                continue
            seq_val = int(parsed_seq)
            if seq_val > max_seq:
                max_seq = seq_val
                # Prefer prefix from receipt_no_full because it is closest to displayed series.
                if full_prefix_candidate:
                    best_prefix = cls._series_prefix(full_prefix_candidate)
                elif rec.rec_ref:
                    best_prefix = cls._series_prefix(rec.rec_ref)

        # Use the canonical series format for new numbers (account/yy/R).
        rec_ref = short_prefix
        seq = max_seq + 1
        receipt_no_full = normalize_receipt_no(f"{rec_ref}{seq:06d}")
        return {
            "rec_ref": rec_ref,
            "rec_no": seq,
            "receipt_no_full": receipt_no_full,
        }

    @classmethod
    def next_numbers_latest(cls, payment_mode: str, *, lock: bool = False, bank_base: Optional[str] = None, fallback_date: Optional[date] = None) -> Dict[str, Any]:
        qs = Receipt.objects.filter(payment_mode=payment_mode)
        if payment_mode == "BANK" and bank_base:
            qs = qs.filter(rec_ref__startswith=f"{bank_base}/")

        if lock:
            qs = qs.select_for_update()

        last_receipt = qs.order_by("-created_at", "-id").first()
        if last_receipt and (last_receipt.rec_ref or last_receipt.receipt_no_full):
            rec_ref = last_receipt.rec_ref or ""
            rec_no = last_receipt.rec_no
            if rec_no is None and last_receipt.receipt_no_full:
                _, parsed = split_receipt(last_receipt.receipt_no_full)
                rec_no = parsed
            if rec_ref and rec_no:
                seq = int(rec_no) + 1
                receipt_no_full = normalize_receipt_no(f"{rec_ref}{seq:06d}")
                return {
                    "rec_ref": rec_ref,
                    "rec_no": seq,
                    "receipt_no_full": receipt_no_full,
                }

        entry_date = fallback_date or timezone.now().date()
        return cls.next_numbers(payment_mode, entry_date, lock=lock, bank_base=bank_base)



class CashRegisterViewSet(FinancePermissionMixin, viewsets.ModelViewSet):
    # Back the legacy `cash-register` endpoint with Receipt as the canonical source.
    queryset = Receipt.objects.select_related("created_by").prefetch_related("items__fee_type").all()
    serializer_class = None
    permission_classes = [IsAuthenticated]
    finance_menu_name = "Cash Register"
    permission_action_map = {
        **FinancePermissionMixin.permission_action_map,
        "next_receipt": "can_create",
        "cancel_receipt": "can_edit",
        "cancel_current_number": "can_create",
        "sync_to_sheet": "can_view",
    }

    @action(detail=True, methods=["put"], url_path="update-with-items")
    @transaction.atomic
    def update_with_items(self, request, pk=None):
        receipt = self.get_object()
        is_auto_cancelled = bool(
            receipt.is_cancelled
            and (receipt.cancel_reason or "").strip().lower() == _AUTO_CANCEL_REASON.lower()
        )
        if receipt.is_cancelled and not is_auto_cancelled:
            return Response({"detail": "Cancelled receipt cannot be edited"}, status=400)

        items = request.data.get("items", [])
        if not items:
            return Response({"detail": "Items are required"}, status=400)

        # Update header fields — use queryset update() to bypass Receipt.save() custom logic
        update_kwargs = {
            "payment_mode": request.data.get("payment_mode", receipt.payment_mode),
            "remark": request.data.get("remark") or receipt.remark or "",
        }
        raw_date = request.data.get("date")
        if raw_date:
            parsed_dt = parse_date(str(raw_date))
            if parsed_dt:
                update_kwargs["date"] = parsed_dt
        Receipt.objects.filter(pk=receipt.pk).update(**update_kwargs)
        receipt.refresh_from_db()

        # DELETE old items
        receipt.items.all().delete()

        total = 0
        for it in items:
            fee_id = it.get("fee_type")
            amount = it.get("amount")

            if not fee_id or not amount:
                return Response({"detail": "Invalid item data"}, status=400)

            fee = FeeType.objects.get(id=fee_id)
            ReceiptItem.objects.create(
                receipt=receipt,
                fee_type=fee,
                amount=amount,
            )
            total += float(amount)

        receipt.total_amount = total
        if is_auto_cancelled:
            # Re-open placeholder receipts once real items are entered.
            receipt.is_cancelled = None
            receipt.cancel_reason = None
            receipt.cancelled_by = None
            receipt.save(update_fields=["total_amount", "is_cancelled", "cancel_reason", "cancelled_by", "updated_at"])
        else:
            receipt.save(update_fields=["total_amount", "updated_at"])

        return Response({"detail": "Receipt updated successfully"})

    def get_queryset(self) -> QuerySet[Receipt]:  # type: ignore[override]
        # Align behaviour with `ReceiptViewSet` — filter receipts by date, payment_mode, receipt_no_full
        qs = super().get_queryset()
        date_str = self.request.query_params.get("date")
        if date_str:
            qs = qs.filter(date=date_str)
        payment_mode = self.request.query_params.get("payment_mode")
        if payment_mode:
            qs = qs.filter(payment_mode=payment_mode.upper())
        receipt_full = self.request.query_params.get("receipt_no_full")
        if receipt_full:
            normalized_full = normalize_receipt_no(receipt_full)
            if normalized_full:
                qs = qs.filter(receipt_no_full__iexact=normalized_full)
            else:
                return qs.none()
        return qs.order_by("-date", "-rec_ref", "-rec_no")

    def list(self, request, *args, **kwargs):
        # Always return receipt-backed rows for the legacy endpoint.
        date_str = request.query_params.get("date")
        payment_mode = request.query_params.get("payment_mode")
        receipt_full = request.query_params.get("receipt_no_full")

        rq = Receipt.objects.select_related("created_by").prefetch_related("items__fee_type").all()
        if date_str:
            rq = rq.filter(date=date_str)
        if payment_mode:
            rq = rq.filter(payment_mode=payment_mode.upper())
        if receipt_full:
            normalized_full = normalize_receipt_no(receipt_full)
            if normalized_full:
                rq = rq.filter(receipt_no_full__iexact=normalized_full)
            else:
                return Response([], status=200)

        out = []
        for r in rq.order_by("-date", "-rec_ref", "-rec_no"):
            items = []
            for it in getattr(r, "items", []).all() if hasattr(r, "items") else []:
                items.append({
                    "id": it.id,
                    "fee_type": getattr(it.fee_type, "id", None),
                    "fee_type_code": getattr(it.fee_type, "code", None),
                    "fee_type_name": getattr(it.fee_type, "name", None),
                    "amount": str(it.amount),
                    "remark": it.remark,
                    "created_at": it.created_at,
                })
            out.append({
                "id": r.id,
                "date": r.date,
                "payment_mode": r.payment_mode,
                "receipt_no_full": r.receipt_no_full,
                "rec_ref": r.rec_ref,
                "rec_no": r.rec_no,
                "total_amount": str(r.total_amount),
                "remark": r.remark,
                "is_cancelled": r.is_cancelled,
                "cancel_reason": r.cancel_reason,
                "cancelled_by": r.cancelled_by.id if getattr(r, "cancelled_by", None) else None,
                "cancelled_by_name": r.cancelled_by.get_full_name().strip() if getattr(r, "cancelled_by", None) else None,
                "created_by": r.created_by.id if r.created_by else None,
                "created_by_name": r.created_by.get_full_name().strip() if r.created_by else None,
                "items": items,
                "created_at": r.created_at,
                "updated_at": r.updated_at,
            })

        return Response(out)

    @transaction.atomic
    def perform_create(self, serializer):
        payment_mode = serializer.validated_data["payment_mode"]
        entry_date = serializer.validated_data.get("date") or timezone.now().date()
        bank_base = None
        if payment_mode == "BANK":
            raw_base = (self.request.data.get("bank_prefix") or self.request.data.get("rec_ref_base") or "").strip().upper()
            if raw_base in _BANK_PREFIX_CHOICES:
                bank_base = raw_base
        next_numbers = ReceiptNumberService.next_numbers(payment_mode, entry_date, lock=True, bank_base=bank_base)
        serializer.save(
            created_by=self.request.user,
            rec_ref=next_numbers["rec_ref"],
            rec_no=next_numbers["rec_no"],
            receipt_no_full=next_numbers["receipt_no_full"],
        )

    @action(detail=False, methods=["get"], url_path="next-receipt")
    def next_receipt(self, request):
        payment_mode = request.query_params.get("payment_mode", "CASH").upper()
        if payment_mode not in _PAYMENT_PREFIX:
            return Response({"detail": "Invalid payment_mode"}, status=400)
        date_param = request.query_params.get("date")
        if date_param:
            try:
                entry_date = datetime.strptime(date_param, "%Y-%m-%d").date()
            except ValueError:
                return Response({"detail": "Invalid date format"}, status=400)
        else:
            entry_date = timezone.now().date()
        bank_base = None
        if payment_mode == "BANK":
            raw_base = (request.query_params.get("bank_prefix") or request.query_params.get("rec_ref_base") or "").strip().upper()
            if raw_base in _BANK_PREFIX_CHOICES:
                bank_base = raw_base
        next_numbers = ReceiptNumberService.next_numbers(payment_mode, entry_date, lock=False, bank_base=bank_base)
        return Response({
            "rec_ref": next_numbers["rec_ref"],
            "rec_no": next_numbers["rec_no"],
            "receipt_no_full": next_numbers["receipt_no_full"],
        })

    @action(detail=False, methods=["post"], url_path="cancel-current-number")
    @transaction.atomic
    def cancel_current_number(self, request):
        """Create a cancelled placeholder receipt for the current next number.

        This lets users skip a receipt number without entering fee items.
        """
        payment_mode = (request.data.get("payment_mode") or "CASH").upper()
        if payment_mode not in _PAYMENT_PREFIX:
            return Response({"detail": "Invalid payment_mode"}, status=400)

        date_param = request.data.get("date")
        if date_param:
            try:
                entry_date = datetime.strptime(date_param, "%Y-%m-%d").date()
            except ValueError:
                return Response({"detail": "Invalid date format"}, status=400)
        else:
            entry_date = timezone.now().date()

        bank_base = None
        if payment_mode == "BANK":
            raw_base = (request.data.get("bank_prefix") or request.data.get("rec_ref_base") or "").strip().upper()
            if raw_base and raw_base not in _BANK_PREFIX_CHOICES:
                return Response({"detail": "Invalid bank_prefix"}, status=400)
            if raw_base in _BANK_PREFIX_CHOICES:
                bank_base = raw_base

        next_numbers = ReceiptNumberService.next_numbers(payment_mode, entry_date, lock=True, bank_base=bank_base)
        cancel_reason = (request.data.get("cancel_reason") or "").strip() or _AUTO_CANCEL_REASON

        receipt = Receipt.objects.create(
            date=entry_date,
            payment_mode=payment_mode,
            rec_ref=next_numbers["rec_ref"],
            rec_no=next_numbers["rec_no"],
            receipt_no_full=next_numbers["receipt_no_full"],
            total_amount=Decimal("0.00"),
            remark="",
            is_cancelled=True,
            cancel_reason=cancel_reason,
            cancelled_by=request.user,
            created_by=request.user,
        )

        return Response(
            {
                "detail": "Receipt number cancelled successfully",
                "id": receipt.id,
                "rec_ref": receipt.rec_ref,
                "rec_no": receipt.rec_no,
                "receipt_no_full": receipt.receipt_no_full,
            },
            status=201,
        )

    @action(detail=True, methods=["post"], url_path="cancel")
    @transaction.atomic
    def cancel_receipt(self, request, pk=None):
        receipt = self.get_object()
        if receipt.is_cancelled:
            return Response({"detail": "Receipt already cancelled"}, status=400)
        cancel_reason = (request.data.get("cancel_reason") or "").strip()
        if not cancel_reason:
            return Response({"detail": "cancel_reason is required"}, status=400)

        receipt.is_cancelled = True
        receipt.cancel_reason = cancel_reason
        receipt.cancelled_by = request.user
        receipt.save(update_fields=["is_cancelled", "cancel_reason", "cancelled_by", "updated_at"])
        return Response({"detail": "Receipt cancelled successfully"})

    @action(detail=False, methods=["post"], url_path="sync-to-sheet")
    def sync_to_sheet(self, request):
        """Push receipts for a given date range to the Google Sheet."""
        from .sheets_sync import sync_cash_register_to_sheet
        date_from = (request.data.get("date_from") or "").strip() or None
        date_to = (request.data.get("date_to") or "").strip() or None
        try:
            result = sync_cash_register_to_sheet(date_from=date_from, date_to=date_to)
        except Exception as exc:
            return Response({"detail": str(exc)}, status=500)
        return Response(result)


class UploadCashExcelView(APIView):
    permission_classes = [IsAuthenticated]


    def post(self, request):
        from decimal import Decimal
        # Only allow staff or finance creators
        if not getattr(request.user, "is_staff", False) and not _user_is_admin(request.user):
            return Response({"detail": "Permission denied"}, status=403)

        uploaded = request.FILES.get("file") or request.FILES.get("excel")
        if not uploaded:
            return Response({"detail": "No file uploaded. Send under form field 'file' or 'excel'."}, status=400)

        try:
            # Read Excel into pandas
            content = uploaded.read()
            df = pd.read_excel(io.BytesIO(content))
        except Exception as exc:
            return Response({"detail": f"Failed to read Excel: {exc}"}, status=400)

        # Normalize columns
        orig_cols = list(df.columns)
        col_map = {c: str(c).strip() for c in orig_cols}
        lower_cols = {c.lower(): c for c in orig_cols}

        # Load fee types cache (by code and name, all lowercased for case-insensitive matching)
        fee_types = list(FeeType.objects.all())
        fee_by_code = {ft.code.strip().lower(): ft for ft in fee_types if ft.code}
        fee_by_name = {ft.name.strip().lower(): ft for ft in fee_types if ft.name}

        results = {"created": 0, "skipped": 0, "errors": []}
        MAX_ERRORS = 200
        error_count = 0

        try:
            with transaction.atomic():
                lower_keys = set(k.lower() for k in orig_cols)
                if ("fee_type" in lower_keys or "fee_code" in lower_keys) and "amount" in lower_keys:
                    receipt_col = lower_cols.get("receipt_no_full") if "receipt_no_full" in lower_keys else None

                    if receipt_col:
                        df["_receipt_key"] = df[receipt_col].apply(lambda v: normalize_receipt_no(v) or "")
                        grouped = df.groupby("_receipt_key")
                    elif "rec_no" in lower_keys:
                        grouped = df.groupby(lower_cols.get("rec_no"))
                    else:
                        grouped = [(None, df)]

                    for key, group in grouped:
                        first = group.iloc[0]
                        date_val = parse_excel_date(first.get(lower_cols.get("date") if "date" in lower_cols else "date"))
                        payment_mode = (first.get(lower_cols.get("payment_mode")) or "CASH").upper()
                        remark = first.get(lower_cols.get("remark")) if "remark" in lower_cols else ""
                        is_cancelled = _parse_is_cancelled(first.get(lower_cols.get("is_cancelled"))) if "is_cancelled" in lower_cols else None
                        cancel_reason = first.get(lower_cols.get("cancel_reason")) if "cancel_reason" in lower_cols else None

                        # Always use receipt_no_full, rec_ref, rec_no from Excel if present
                        receipt_full = normalize_receipt_no(first.get(lower_cols.get("receipt_no_full"))) if "receipt_no_full" in lower_cols else None
                        rec_no = None
                        rec_ref = None
                        if receipt_full:
                            rec_ref, rec_no = split_receipt(receipt_full)
                        if rec_no is None:
                            rec_no = first.get(lower_cols.get("rec_no")) if "rec_no" in lower_cols else None
                        if rec_ref is None:
                            rec_ref = first.get(lower_cols.get("rec_ref")) if "rec_ref" in lower_cols else None
                        if not receipt_full and rec_ref and rec_no:
                            receipt_full = f"{rec_ref}{int(float(rec_no)):06d}"
                        if not receipt_full:
                            # fallback to auto
                            try:
                                numbers = ReceiptNumberService.next_numbers(payment_mode, date_val, lock=True)
                            except Exception as e:
                                err_txt = str(e)
                                if 'NaTType' in err_txt or 'utcoffset' in err_txt:
                                    numbers = ReceiptNumberService.next_numbers(payment_mode, None, lock=True)
                                else:
                                    raise
                            rec_ref = numbers["rec_ref"]
                            rec_no = numbers["rec_no"]
                            receipt_full = numbers["receipt_no_full"]

                        # Always create new Receipt, allow duplicates
                        header = Receipt.objects.create(
                            date=date_val,
                            payment_mode=payment_mode,
                            rec_ref=rec_ref or "",
                            rec_no=int(float(rec_no)) if rec_no is not None else None,
                            receipt_no_full=receipt_full,
                            remark=remark,
                            is_cancelled=True if is_cancelled else None,
                            cancel_reason=cancel_reason if is_cancelled else None,
                            cancelled_by=request.user if is_cancelled else None,
                            created_by=request.user,
                        )

                        total = Decimal("0")
                        item_count = 0
                        for idx, row in group.iterrows():
                            ft_code = (
                                row.get(lower_cols.get("fee_code"))
                                or row.get(lower_cols.get("fee_type"))
                            )
                            amt = row.get(lower_cols.get("amount"))
                            if pd.isna(amt) or amt == "":
                                continue
                            fee_obj = None
                            if isinstance(ft_code, str):
                                key = ft_code.strip().lower()
                                # Always normalize using FEE_ALIAS (case-insensitive)
                                key = FEE_ALIAS.get(key, key)
                                fee_obj = fee_by_code.get(key) or fee_by_name.get(key)
                            if not fee_obj:
                                if error_count < MAX_ERRORS:
                                    results["errors"].append({"row": int(idx) + 2, "receipt": receipt_full, "error": f"Fee type not found: {ft_code}"})
                                error_count += 1
                                results["skipped"] += 1
                                continue
                            amt_decimal = Decimal(str(amt))
                            ReceiptItem.objects.create(receipt=header, fee_type=fee_obj, amount=amt_decimal, remark="")
                            total += amt_decimal
                            item_count += 1
                        header.total_amount = total
                        header.save()
                        if item_count > 0:
                            results["created"] += 1
                        else:
                            results["skipped"] += 1
                        # Truncate error log if too many
                        if error_count == MAX_ERRORS:
                            results["errors"].append({"info": "Too many errors, truncated"})
                else:
                    # --- FIX: Add fee_code to standard keys and support row-wise mode ---
                    date_col = lower_cols.get("date") or next((c for c in orig_cols if c.lower().startswith("date")), None)
                    receipt_col = lower_cols.get("receipt_no_full") or lower_cols.get("rec_no") or lower_cols.get("receipt_no")
                    payment_col = lower_cols.get("payment_mode")
                    remark_col = lower_cols.get("remark")

                    # Add fee_code to standard keys
                    standard_keys = {
                        "date", "payment_mode", "remark",
                        "rec_ref", "rec_no", "receipt_no_full",
                        "is_cancelled", "cancel_reason", "cancelled_by",
                        "fee_type", "fee_type_code", "fee_code",  # <-- added fee_code
                        "amount",
                        "total", "TOTAL"
                    }
                    raw_cols = [str(c).strip() for c in orig_cols]
                    fee_cols = [c for c in orig_cols if str(c).strip().lower() not in standard_keys]

                    # Detect row-wise mode
                    is_row_wise = "fee_code" in [c.lower() for c in raw_cols] and "amount" in [c.lower() for c in raw_cols]

                    for idx, row in df.iterrows():
                        date_val = parse_excel_date(row.get(date_col) if date_col else None)
                        payment_mode = (row.get(payment_col) or "CASH").upper() if payment_col else "CASH"
                        remark = row.get(remark_col) if remark_col else ""
                        is_cancelled = _parse_is_cancelled(row.get(lower_cols.get("is_cancelled"))) if lower_cols.get("is_cancelled") else None
                        cancel_reason = row.get(lower_cols.get("cancel_reason")) if lower_cols.get("cancel_reason") else None
                        try:
                            numbers = ReceiptNumberService.next_numbers(payment_mode, date_val, lock=True)
                        except Exception as e:
                            err_txt = str(e)
                            if 'NaTType' in err_txt or 'utcoffset' in err_txt:
                                numbers = ReceiptNumberService.next_numbers(payment_mode, None, lock=True)
                            else:
                                raise

                        header, created = Receipt.objects.get_or_create(
                            rec_ref=numbers["rec_ref"],
                            rec_no=numbers["rec_no"],
                            defaults={
                                "date": (date_val or timezone.now().date()),
                                "payment_mode": payment_mode,
                                "remark": remark,
                                "is_cancelled": True if is_cancelled else None,
                                "cancel_reason": cancel_reason if is_cancelled else None,
                                "cancelled_by": request.user if is_cancelled else None,
                                "created_by": request.user,
                            }
                        )
                        if not created:
                            results["skipped"] += 1
                            results["errors"].append({"row": idx, "error": f"Duplicate receipt: {header.receipt_no_full}"})
                            continue

                        total = Decimal("0")
                        used = False
                        if is_row_wise:
                            fee_code_val = row.get(lower_cols.get("fee_code")) if lower_cols.get("fee_code") else None
                            amount_val = row.get(lower_cols.get("amount")) if lower_cols.get("amount") else None
                            fee_code_clean = str(fee_code_val).strip() if fee_code_val else None
                            if fee_code_clean and amount_val not in (None, "", float('nan')):
                                # Normalize fee code using FEE_ALIAS (case-insensitive)
                                fee_code_norm = FEE_ALIAS.get(fee_code_clean.lower(), fee_code_clean.lower())
                                fee_obj = fee_by_code.get(fee_code_norm) or fee_by_name.get(fee_code_norm)
                                if not fee_obj:
                                    results["skipped"] += 1
                                    results["errors"].append({"row": idx, "error": f"Unknown fee code: {fee_code_clean}", "receipt": row.get(receipt_col)})
                                    header.total_amount = total
                                    header.save()
                                    continue
                                amt = Decimal(str(amount_val))
                                ReceiptItem.objects.create(
                                    receipt=header,
                                    fee_type=fee_obj,
                                    amount=amt,
                                    remark=""
                                )
                                total += amt
                                used = True
                        else:
                            for col in fee_cols:
                                val = row.get(col)
                                if pd.isna(val) or val == "":
                                    continue
                                col_key = str(col).strip().lower()
                                fee_obj = fee_by_code.get(col_key) or fee_by_name.get(col_key)
                                if not fee_obj:
                                    fee_obj = next((v for k, v in fee_by_name.items() if col_key in k), None)
                                if not fee_obj:
                                    results["skipped"] += 1
                                    results["errors"].append({"row": idx, "error": f"Fee type column not recognized: {col}"})
                                    continue
                                val_decimal = Decimal(str(val))
                                ReceiptItem.objects.create(receipt=header, fee_type=fee_obj, amount=val_decimal, remark="")
                                total += val_decimal
                                used = True
                        if not used:
                            if error_count < MAX_ERRORS:
                                results["errors"].append({"row": int(idx) + 2, "error": "No fee values", "receipt": row.get(receipt_col)})
                            error_count += 1
                            results["skipped"] += 1
                        else:
                            results["created"] += 1
                        if error_count == MAX_ERRORS:
                            results["errors"].append({"info": "Too many errors, truncated"})
        except Exception as exc:
            return Response({"detail": f"Upload failed: {exc}", "results": results}, status=400)

        return Response({"detail": "Upload completed", "results": results})


class ReceiptItemSerializer(serializers.ModelSerializer):
    fee_type_code = serializers.CharField(source="fee_type.code", read_only=True)
    fee_type_name = serializers.CharField(source="fee_type.name", read_only=True)

    class Meta:
        model = ReceiptItem
        fields = ["id", "fee_type", "fee_type_code", "fee_type_name", "amount", "remark", "created_at"]
        read_only_fields = ["created_at"]


class ReceiptSerializer(serializers.ModelSerializer):
    items = ReceiptItemSerializer(many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()
    cancelled_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Receipt
        fields = [
            "id",
            "date",
            "payment_mode",
            "rec_ref",
            "rec_no",
            "receipt_no_full",
            "total_amount",
            "remark",
            "is_cancelled",
            "cancel_reason",
            "cancelled_by",
            "cancelled_by_name",
            "created_by",
            "created_by_name",
            "items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["rec_ref", "rec_no", "receipt_no_full", "created_by", "cancelled_by", "created_at", "updated_at"]

    def get_created_by_name(self, obj) -> str:
        full_name = obj.created_by.get_full_name().strip()
        return full_name or obj.created_by.username

    def get_cancelled_by_name(self, obj) -> Optional[str]:
        if not getattr(obj, "cancelled_by", None):
            return None
        full_name = obj.cancelled_by.get_full_name().strip()
        return full_name or obj.cancelled_by.username


# Keep the legacy `CashRegisterSerializer` name as an alias to the Receipt serializer
CashRegisterSerializer = ReceiptSerializer

# Ensure the CashRegisterViewSet uses the Receipt-backed serializer
CashRegisterViewSet.serializer_class = CashRegisterSerializer



from django.db import transaction
from rest_framework.decorators import action
from rest_framework.response import Response

class ReceiptViewSet(FinancePermissionMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = Receipt.objects.select_related("created_by").prefetch_related("items__fee_type").all()
    serializer_class = ReceiptSerializer
    permission_classes = [IsAuthenticated]
    finance_menu_name = "Cash Register"

    @action(detail=True, methods=["put"], url_path="update-with-items")
    @transaction.atomic
    def update_with_items(self, request, pk=None):
        """
        Update an existing receipt's fee items.
        ✔ receipt_no_full, rec_ref, rec_no NEVER change
        ✔ multiple fee rows allowed
        """
        receipt = self.get_object()

        items = request.data.get("items", [])
        remark = request.data.get("remark", "")

        if not items:
            return Response(
                {"detail": "At least one fee item is required"},
                status=400
            )

        # 🔒 DO NOT TOUCH receipt numbers
        receipt.remark = remark
        receipt.save(update_fields=["remark"])

        # Remove existing items
        receipt.items.all().delete()

        total = 0
        for it in items:
            fee_id = it.get("fee_type")
            amount = it.get("amount")

            if not fee_id or amount in (None, "", 0):
                continue

            fee = FeeType.objects.filter(id=fee_id, is_active=True).first()
            if not fee:
                return Response(
                    {"detail": f"Invalid fee type: {fee_id}"},
                    status=400
                )

            ReceiptItem.objects.create(
                receipt=receipt,
                fee_type=fee,
                amount=amount,
                remark=""
            )
            total += float(amount)

        receipt.total_amount = total
        receipt.save(update_fields=["total_amount"])

        return Response({"detail": "Receipt updated successfully"})


    # ✅ FINAL PERIODIC FEES AGGREGATE API
    @action(detail=False, methods=["get"], url_path="fees-aggregate")
    def fees_aggregate(self, request):
        """
        Returns period-based fee aggregates for report_by: Daily, Monthly, Quarterly, Half-Yearly, Yearly.
        """
        date_from = parse_date(request.query_params.get("date_from"))
        date_to = parse_date(request.query_params.get("date_to"))
        payment_mode = request.query_params.get("payment_mode")
        report_by = request.query_params.get("report_by", "Daily")

        qs = ReceiptItem.objects.select_related("receipt", "fee_type").filter(receipt__is_cancelled__isnull=True)
        if date_from:
            qs = qs.filter(receipt__date__gte=date_from)
        if date_to:
            qs = qs.filter(receipt__date__lte=date_to)
        if payment_mode:
            qs = qs.filter(receipt__payment_mode=payment_mode.upper())

        # Grouping logic
        if report_by == "Monthly":
            period = TruncMonth("receipt__date")
        elif report_by == "Quarterly":
            period = Quarter(F("receipt__date"))
        elif report_by == "Half-Yearly":
            period = HalfYear(F("receipt__date"))
        elif report_by == "Yearly":
            period = TruncYear("receipt__date")
        else:
            period = F("receipt__date")

        data = (
            qs.annotate(period=period)
            .values("period", "fee_type__code")
            .annotate(amount=Sum("amount"))
            .order_by("period", "fee_type__code")
        )
        return Response(list(data))


    # ✅ FINAL PERIODIC RECEIPT RANGE API
    @action(detail=False, methods=["get"], url_path="rec-range")
    def rec_range(self, request):
        """
        Return min/max receipt numbers per period (Daily, Monthly, Quarterly, Half-Yearly, Yearly).
        """
        report_by = request.query_params.get("report_by", "Daily")
        payment_mode = request.query_params.get("payment_mode")
        date_from = parse_date(request.query_params.get("date_from"))
        date_to = parse_date(request.query_params.get("date_to"))

        qs = Receipt.objects.filter(is_cancelled__isnull=True)
        if payment_mode:
            qs = qs.filter(payment_mode=payment_mode.upper())
        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)

        if report_by == "Monthly":
            period = TruncMonth("date")
        elif report_by == "Quarterly":
            period = Quarter(F("date"))
        elif report_by == "Half-Yearly":
            period = HalfYear(F("date"))
        elif report_by == "Yearly":
            period = TruncYear("date")
        else:
            period = F("date")

        data = (
            qs.annotate(period=period)
            .values("period", "rec_ref")
            .annotate(
                min_rec_no=Min("rec_no"),
                max_rec_no=Max("rec_no"),
            )
            .order_by("period", "rec_ref")
        )

        period_map = {}
        for r in data:
            min_no = r.get("min_rec_no")
            max_no = r.get("max_rec_no")
            rec_ref = r.get("rec_ref")
            if min_no is None or max_no is None or not rec_ref:
                continue

            period_value = r.get("period")
            if period_value not in period_map:
                period_map[period_value] = []

            rec_start = f"{rec_ref}{int(min_no):06d}"
            rec_end = f"{rec_ref}{int(max_no):06d}"
            account = str(rec_ref).split("/")[0]
            period_map[period_value].append({
                "account": account,
                "rec_start": rec_start,
                "rec_end": rec_end,
            })

        out = []
        for period_value, account_rows in period_map.items():
            if not account_rows:
                continue
            out.append({
                "period": period_value,
                "rec_start": " | ".join(row["rec_start"] for row in account_rows),
                "rec_end": " | ".join(row["rec_end"] for row in account_rows),
                "account_ranges": account_rows,
            })

        return Response(out)

    def get_queryset(self) -> QuerySet[Receipt]:  # type: ignore[override]
        qs = super().get_queryset()
        date_str = self.request.query_params.get("date")
        if date_str:
            qs = qs.filter(date=date_str)
        payment_mode = self.request.query_params.get("payment_mode")
        if payment_mode:
            qs = qs.filter(payment_mode=payment_mode.upper())
        receipt_full = self.request.query_params.get("receipt_no_full")
        if receipt_full:
            normalized_full = normalize_receipt_no(receipt_full)
            if normalized_full:
                qs = qs.filter(receipt_no_full__iexact=normalized_full)
            else:
                return qs.none()
        return qs.order_by("-date", "-rec_ref", "-rec_no")

    @action(detail=False, methods=["get"], url_path="flattened")
    def flattened(self, request):
        """Return receipts flattened: one row per ReceiptItem with receipt header fields.
        
        This endpoint mimics the old cash_register table structure for backward compatibility.
        """
        qs = self.get_queryset()
        
        flat_rows = []
        for receipt in qs:
            items = list(receipt.items.all())
            if items:
                for item in items:
                    flat_rows.append({
                        "id": f"{receipt.id}-{item.id}",
                        "receipt_id": receipt.id,  # <-- Add real DB id for frontend
                        "date": receipt.date,
                        "payment_mode": receipt.payment_mode,
                        "receipt_no_full": receipt.receipt_no_full,
                        "rec_ref": receipt.rec_ref,
                        "rec_no": receipt.rec_no,
                        "is_cancelled": receipt.is_cancelled,
                        "cancel_reason": receipt.cancel_reason,
                        "cancelled_by": receipt.cancelled_by.id if getattr(receipt, "cancelled_by", None) else None,
                        "cancelled_by_name": (receipt.cancelled_by.get_full_name().strip() or receipt.cancelled_by.username) if getattr(receipt, "cancelled_by", None) else None,
                        "fee_type": item.fee_type.id,
                        "fee_type_code": item.fee_type.code,
                        "fee_type_name": item.fee_type.name,
                        "amount": str(item.amount),
                        "remark": item.remark or receipt.remark or "",
                        "created_by": receipt.created_by.id,
                        "created_by_name": receipt.created_by.get_full_name().strip() or receipt.created_by.username,
                        "created_at": receipt.created_at,
                        "updated_at": receipt.updated_at,
                    })
            else:
                # Keep cancelled placeholder receipts visible in list view.
                flat_rows.append({
                    "id": f"{receipt.id}-0",
                    "receipt_id": receipt.id,
                    "date": receipt.date,
                    "payment_mode": receipt.payment_mode,
                    "receipt_no_full": receipt.receipt_no_full,
                    "rec_ref": receipt.rec_ref,
                    "rec_no": receipt.rec_no,
                    "is_cancelled": receipt.is_cancelled,
                    "cancel_reason": receipt.cancel_reason,
                    "cancelled_by": receipt.cancelled_by.id if getattr(receipt, "cancelled_by", None) else None,
                    "cancelled_by_name": (receipt.cancelled_by.get_full_name().strip() or receipt.cancelled_by.username) if getattr(receipt, "cancelled_by", None) else None,
                    "fee_type": None,
                    "fee_type_code": None,
                    "fee_type_name": None,
                    "amount": None,
                    "remark": receipt.remark or "",
                    "created_by": receipt.created_by.id,
                    "created_by_name": receipt.created_by.get_full_name().strip() or receipt.created_by.username,
                    "created_at": receipt.created_at,
                    "updated_at": receipt.updated_at,
                })
        return Response(flat_rows)

    @action(detail=False, methods=["post"], url_path="bulk-create")
    def bulk_create(self, request):
        """Accepts JSON payload of receipts with items and creates them atomically.

        Expected payload: { "receipts": [ { "date": "YYYY-MM-DD", "payment_mode": "CASH", "items": [ { "fee_type": id, "amount": 1000 }, ... ] }, ... ] }
        """
        payload = request.data or {}
        receipts = payload.get("receipts")
        if not receipts or not isinstance(receipts, list):
            return Response({"detail": "Invalid payload, receipts list required."}, status=400)

        created = []
        errors = []
        with transaction.atomic():
            for idx, rec in enumerate(receipts, start=1):
                try:
                    date_val = rec.get("date")
                    payment_mode = (rec.get("payment_mode") or "CASH").upper()
                    if payment_mode not in dict(PAYMENT_MODE_CHOICES):
                        raise ValueError("Invalid payment_mode")
                    items = rec.get("items") or []
                    if not items:
                        raise ValueError("No items for receipt")

                    # Get next receipt number or accept manual receipt when using the OTHER bank option
                    entry_date = datetime.strptime(date_val, "%Y-%m-%d").date() if date_val else timezone.now().date()
                    bank_base = None
                    receipt_full = normalize_receipt_no(rec.get("receipt_no_full") or "")
                    if payment_mode == "BANK":
                        raw_base = (rec.get("bank_prefix") or rec.get("rec_ref_base") or "").strip().upper()
                        if raw_base and raw_base not in _BANK_PREFIX_CHOICES and raw_base != "OTHER":
                            raise ValueError("Invalid bank_prefix")
                        if raw_base in _BANK_PREFIX_CHOICES:
                            bank_base = raw_base

                    if payment_mode == "BANK" and raw_base == "OTHER":
                        if not receipt_full:
                            raise ValueError("receipt_no_full is required for manual bank receipt entries")
                        rec_ref, rec_no = split_receipt(receipt_full)
                        if rec_no is None:
                            raise ValueError("Invalid receipt_no_full")
                        if Receipt.objects.filter(receipt_no_full=receipt_full).exists():
                            raise ValueError("Duplicate receipt_no_full")
                        header = Receipt(
                            date=entry_date,
                            payment_mode=payment_mode,
                            rec_ref=rec_ref or "",
                            rec_no=rec_no,
                            receipt_no_full=receipt_full,
                            remark=rec.get("remark") or "",
                            created_by=request.user,
                        )
                    else:
                        next_numbers = ReceiptNumberService.next_numbers(payment_mode, entry_date, lock=True, bank_base=bank_base)

                        # Create receipt header
                        header = Receipt(
                            date=entry_date,
                            payment_mode=payment_mode,
                            rec_ref=next_numbers["rec_ref"],
                            rec_no=next_numbers["rec_no"],
                            remark=rec.get("remark") or "",
                            created_by=request.user,
                        )
                    header.save()

                    total = 0
                    for it in items:
                        fee_code = it.get("fee_type_code")
                        fee_id = it.get("fee_type")
                        fee_obj = None
                        if fee_id:
                            fee_obj = FeeType.objects.filter(id=fee_id).first()
                        elif fee_code:
                            fee_obj = FeeType.objects.filter(code__iexact=fee_code).first()
                        if not fee_obj:
                            raise ValueError(f"Fee type not found for item: {it}")
                        amount = it.get("amount")
                        if amount is None:
                            raise ValueError("Item amount required")
                        ReceiptItem.objects.create(receipt=header, fee_type=fee_obj, amount=amount, remark=it.get("remark") or "")
                        total += float(amount)

                    header.total_amount = total
                    header.save()
                    created.append(header)
                except Exception as exc:  # capture and continue/rollback
                    errors.append({"index": idx, "error": str(exc)})
                    raise

        serializer = self.get_serializer(created, many=True)
        return Response({"created": serializer.data, "errors": errors})

# ============================================================
# CASH OUTWARD (DEPOSIT / EXPENSE)
# ============================================================

class CashOutwardSerializer(serializers.ModelSerializer):
    def validate(self, attrs):
        txn_type = attrs.get("txn_type") or getattr(self.instance, "txn_type", None)
        outward_date = attrs.get("date") or getattr(self.instance, "date", None)
        cash_date = attrs.get("cash_date")

        if txn_type == "DEPOSIT":
            attrs["cash_date"] = cash_date or getattr(self.instance, "cash_date", None) or outward_date
        else:
            attrs["cash_date"] = None

        return attrs

    class Meta:
        model = CashOutward
        fields = "__all__"
        read_only_fields = ["created_by", "created_at"]


class CashOutwardViewSet(
    FinancePermissionMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet
):
    queryset = CashOutward.objects.all()
    serializer_class = CashOutwardSerializer
    permission_classes = [IsAuthenticated]
    finance_menu_name = "Cash Register"

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def get_queryset(self):
        qs = super().get_queryset()
        date_str = self.request.query_params.get("date")
        date_from_str = self.request.query_params.get("date_from")
        date_to_str = self.request.query_params.get("date_to")
        cash_date_str = self.request.query_params.get("cash_date")
        cash_date_from_str = self.request.query_params.get("cash_date_from")
        cash_date_to_str = self.request.query_params.get("cash_date_to")
        txn_type = (self.request.query_params.get("txn_type") or "").strip().upper()
        include_cash_date = str(self.request.query_params.get("include_cash_date") or "").strip().lower() in {"1", "true", "yes"}

        if txn_type in {"DEPOSIT", "EXPENSE"}:
            qs = qs.filter(txn_type=txn_type)

        # Exact date filter takes precedence for single-day views.
        if date_str:
            date_exact = parse_date(date_str)
            if date_exact:
                if include_cash_date:
                    qs = qs.filter(
                        Q(date=date_exact)
                        | Q(txn_type="DEPOSIT", cash_date=date_exact)
                    ).distinct()
                else:
                    qs = qs.filter(date=date_exact)
            return qs.order_by("-date", "-id")

        date_from = parse_date(date_from_str) if date_from_str else None
        date_to = parse_date(date_to_str) if date_to_str else None
        cash_date_exact = parse_date(cash_date_str) if cash_date_str else None
        cash_date_from = parse_date(cash_date_from_str) if cash_date_from_str else None
        cash_date_to = parse_date(cash_date_to_str) if cash_date_to_str else None

        if cash_date_exact:
            qs = qs.filter(cash_date=cash_date_exact)
        else:
            if cash_date_from:
                qs = qs.filter(cash_date__gte=cash_date_from)
            if cash_date_to:
                qs = qs.filter(cash_date__lte=cash_date_to)

        if include_cash_date and (date_from or date_to):
            window_q = Q()
            primary_q = Q()
            cash_q = Q(txn_type="DEPOSIT")

            if date_from:
                primary_q &= Q(date__gte=date_from)
                cash_q &= Q(cash_date__gte=date_from)
            if date_to:
                primary_q &= Q(date__lte=date_to)
                cash_q &= Q(cash_date__lte=date_to)

            window_q |= primary_q
            window_q |= cash_q
            qs = super().get_queryset().filter(window_q)
            if txn_type in {"DEPOSIT", "EXPENSE"}:
                qs = qs.filter(txn_type=txn_type)
            if cash_date_exact:
                qs = qs.filter(cash_date=cash_date_exact)
            else:
                if cash_date_from:
                    qs = qs.filter(cash_date__gte=cash_date_from)
                if cash_date_to:
                    qs = qs.filter(cash_date__lte=cash_date_to)
            qs = qs.distinct()
        else:
            if date_from:
                qs = qs.filter(date__gte=date_from)
            if date_to:
                qs = qs.filter(date__lte=date_to)
        return qs.order_by("-date", "-id")


# ============================================================
# CASH ON HAND – REPORT & CLOSE
# ============================================================

class CashOnHandItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = CashOnHandItem
        fields = ["denomination", "is_coin", "qty", "amount"]


class CashOnHandSerializer(serializers.ModelSerializer):
    items = CashOnHandItemSerializer(many=True, read_only=True)

    class Meta:
        model = CashOnHand
        fields = "__all__"


class CashOnHandReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        date_str = request.query_params.get("date")

        if not date_str:
            return Response(
                {"detail": "date query parameter is required (YYYY-MM-DD)"},
                status=400
            )

        report_date = parse_date(date_str)
        if not report_date:
            return Response(
                {"detail": "Invalid date format. Use YYYY-MM-DD"},
                status=400
            )

        # 1️⃣ System cash
        system_cash = (
            Receipt.objects
            .filter(date=report_date, payment_mode="CASH", is_cancelled__isnull=True)
            .aggregate(total=Sum("total_amount"))["total"]
            or Decimal("0")
        )

        # 2️⃣ Deposit / Expense
        outward_on_date = CashOutward.objects.filter(date=report_date)
        deposits_made_today = outward_on_date.filter(txn_type="DEPOSIT")
        deposit_for_cash_date = CashOutward.objects.filter(txn_type="DEPOSIT", cash_date=report_date)
        deposit_subtracted = (
            deposits_made_today
            .filter(cash_date=report_date)
            .aggregate(s=Sum("amount"))["s"]
            or Decimal("0")
        )
        total_deposit = (
            deposits_made_today
            .aggregate(s=Sum("amount"))["s"]
            or Decimal("0")
        )
        total_expense = outward_on_date.filter(txn_type="EXPENSE").aggregate(s=Sum("amount"))["s"] or Decimal("0")

        expected_cash = system_cash - deposit_subtracted - total_expense

        cash_close = CashOnHand.objects.filter(date=report_date).first()
        live_difference = None
        if cash_close:
            live_difference = (cash_close.physical_cash or Decimal("0")) - expected_cash

        return Response({
            "date": report_date,
            "system_cash": system_cash,
            "total_deposit": total_deposit,
            "deposit_subtracted": deposit_subtracted,
            "deposit_not_subtracted": total_deposit - deposit_subtracted,
            "total_expense": total_expense,
            "expected_cash": expected_cash,
            "deposit_applied_rows": CashOutwardSerializer(
                deposit_for_cash_date.exclude(date=report_date).order_by("date", "id"),
                many=True,
            ).data,
            "deposit_made_rows": CashOutwardSerializer(
                deposits_made_today.order_by("id"),
                many=True,
            ).data,
            "expense_rows": CashOutwardSerializer(
                outward_on_date.filter(txn_type="EXPENSE").order_by("id"),
                many=True,
            ).data,
            "closed": bool(cash_close),
            "physical_cash": cash_close.physical_cash if cash_close else None,
            "difference": live_difference,
            "items": CashOnHandItemSerializer(
                cash_close.items.all(), many=True
            ).data if cash_close else [],
        })


class CloseCashDayView(APIView):
    """
    Saves CashOnHand snapshot with denomination items.
    """
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        data = request.data
        report_date = parse_date(data.get("date"))
        items = data.get("items", [])

        if not report_date:
            return Response({"detail": "date is required"}, status=400)

        if CashOnHand.objects.filter(date=report_date).exists():
            return Response({"detail": "Cash already closed for this date"}, status=400)

        # Calculate system values
        system_cash = (
            Receipt.objects
            .filter(date=report_date, payment_mode="CASH", is_cancelled__isnull=True)
            .aggregate(total=Sum("total_amount"))["total"]
            or Decimal("0")
        )

        total_deposit = (
            CashOutward.objects
            .filter(txn_type="DEPOSIT", date=report_date, cash_date=report_date)
            .aggregate(s=Sum("amount"))["s"]
            or Decimal("0")
        )
        total_expense = (
            CashOutward.objects
            .filter(txn_type="EXPENSE", date=report_date)
            .aggregate(s=Sum("amount"))["s"]
            or Decimal("0")
        )

        expected_cash = system_cash - total_deposit - total_expense

        # Physical cash
        physical_cash = Decimal("0")

        cash_on_hand = CashOnHand.objects.create(
            date=report_date,
            system_cash=system_cash,
            total_deposit=total_deposit,
            total_expense=total_expense,
            expected_cash=expected_cash,
            physical_cash=Decimal("0"),  # temp
            difference=Decimal("0"),     # temp
            status="CLOSED",
            closed_by=request.user,
            closed_at=timezone.now(),
        )

        for row in items:
            denom = int(row["denomination"])
            qty = int(row["qty"])
            is_coin = bool(row.get("is_coin", False))
            amt = Decimal(denom) * qty
            physical_cash += amt

            CashOnHandItem.objects.create(
                cash_on_hand=cash_on_hand,
                denomination=denom,
                qty=qty,
                is_coin=is_coin,
                amount=amt,
            )

        cash_on_hand.physical_cash = physical_cash
        cash_on_hand.difference = physical_cash - expected_cash
        cash_on_hand.save(update_fields=["physical_cash", "difference"])

        return Response({"detail": "Cash day closed successfully"})

    @transaction.atomic
    def put(self, request):
        """Update denomination items for an already-closed cash day."""
        data = request.data
        report_date = parse_date(data.get("date"))
        items = data.get("items", [])

        if not report_date:
            return Response({"detail": "date is required"}, status=400)

        cash_on_hand = CashOnHand.objects.filter(date=report_date).first()
        if not cash_on_hand:
            return Response({"detail": "No closed record found for this date. Use POST to close first."}, status=404)

        # Delete old items and recalculate
        cash_on_hand.items.all().delete()

        system_cash = (
            Receipt.objects
            .filter(date=report_date, payment_mode="CASH", is_cancelled__isnull=True)
            .aggregate(total=Sum("total_amount"))["total"]
            or Decimal("0")
        )
        total_deposit = (
            CashOutward.objects
            .filter(txn_type="DEPOSIT", date=report_date, cash_date=report_date)
            .aggregate(s=Sum("amount"))["s"]
            or Decimal("0")
        )
        total_expense = (
            CashOutward.objects
            .filter(txn_type="EXPENSE", date=report_date)
            .aggregate(s=Sum("amount"))["s"]
            or Decimal("0")
        )
        expected_cash = system_cash - total_deposit - total_expense

        physical_cash = Decimal("0")
        for row in items:
            denom = int(row["denomination"])
            qty = int(row["qty"])
            is_coin = bool(row.get("is_coin", False))
            amt = Decimal(denom) * qty
            physical_cash += amt
            CashOnHandItem.objects.create(
                cash_on_hand=cash_on_hand,
                denomination=denom,
                qty=qty,
                is_coin=is_coin,
                amount=amt,
            )

        cash_on_hand.system_cash = system_cash
        cash_on_hand.total_deposit = total_deposit
        cash_on_hand.total_expense = total_expense
        cash_on_hand.expected_cash = expected_cash
        cash_on_hand.physical_cash = physical_cash
        cash_on_hand.difference = physical_cash - expected_cash
        cash_on_hand.save(update_fields=["system_cash", "total_deposit", "total_expense", "expected_cash", "physical_cash", "difference"])

        return Response({"detail": "Cash day updated successfully"})