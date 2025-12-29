"""Serializers and viewsets for the Accounts & Finance cash register."""
from __future__ import annotations

from datetime import date, datetime
import io
import pandas as pd
from typing import Any, Dict, Optional

from django.db import transaction
from django.db.models import Q, QuerySet
from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .domain_cash_register import CashRegister, FeeType, Receipt, ReceiptItem
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
    "BANK": "1471",
    "UPI": "8785",
}


def _normalize(value: Optional[str]) -> str:
    return (value or "").strip().lower()


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


class CashRegisterSerializer(serializers.ModelSerializer):
    fee_type_name = serializers.CharField(source="fee_type.name", read_only=True)
    fee_type_code = serializers.CharField(source="fee_type.code", read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CashRegister
        fields = [
            "id",
            "date",
            "payment_mode",
            "receipt_no_full",
            "rec_ref",
            "rec_no",
            "fee_type",
            "fee_type_name",
            "fee_type_code",
            "amount",
            "remark",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["rec_ref", "rec_no", "receipt_no_full", "created_by", "created_at", "updated_at"]

    def get_created_by_name(self, obj) -> str:
        full_name = obj.created_by.get_full_name().strip()
        return full_name or obj.created_by.username

    def validate_payment_mode(self, value: str) -> str:
        if value not in dict(CashRegister.PAYMENT_MODE_CHOICES):
            raise serializers.ValidationError("Invalid payment mode")
        return value

    def validate_amount(self, value):
        if value is None:
            raise serializers.ValidationError("Amount is required")
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero")
        return value


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
    def _prefix(payment_mode: str, entry_date: date) -> str:
        base = _PAYMENT_PREFIX[payment_mode]
        year = (entry_date or timezone.now().date()).year % 100
        return f"{base}/{year:02d}/R/"

    @classmethod
    def next_numbers(cls, payment_mode: str, entry_date: date, *, lock: bool = False) -> Dict[str, Any]:
        rec_ref = cls._prefix(payment_mode, entry_date)
        legacy_ref = rec_ref.rstrip('/')
        qs = CashRegister.objects.filter(payment_mode=payment_mode).filter(
            Q(rec_ref=rec_ref)
            | Q(rec_ref=legacy_ref)
            | Q(receipt_no_full__istartswith=rec_ref)
            | Q(receipt_no_full__istartswith=legacy_ref)
        )
        if lock:
            qs = qs.select_for_update()
        last_no = (
            qs.exclude(rec_no__isnull=True)
            .order_by("-rec_no")
            .values_list("rec_no", flat=True)
            .first()
        )
        if last_no is None:
            max_from_receipts = 0
            for receipt in qs.values_list("receipt_no_full", flat=True):
                _, parsed = CashRegister.split_receipt(receipt)
                if parsed and parsed > max_from_receipts:
                    max_from_receipts = parsed
            if max_from_receipts:
                last_no = max_from_receipts
        seq = (last_no or 0) + 1
        receipt_no_full = CashRegister.normalize_receipt_no(f"{rec_ref}{seq:06d}")
        return {
            "rec_ref": rec_ref,
            "rec_no": seq,
            "receipt_no_full": receipt_no_full,
        }


class CashRegisterViewSet(FinancePermissionMixin, viewsets.ModelViewSet):
    queryset = CashRegister.objects.select_related("fee_type", "created_by").all()
    serializer_class = CashRegisterSerializer
    permission_classes = [IsAuthenticated]
    finance_menu_name = "Cash Register"
    permission_action_map = {
        **FinancePermissionMixin.permission_action_map,
        "next_receipt": "can_create",
    }

    def get_queryset(self) -> QuerySet[CashRegister]:  # type: ignore[override]
        qs = super().get_queryset()
        date_str = self.request.query_params.get("date")
        if date_str:
            qs = qs.filter(date=date_str)
        payment_mode = self.request.query_params.get("payment_mode")
        if payment_mode:
            qs = qs.filter(payment_mode=payment_mode.upper())
        fee_type_id = self.request.query_params.get("fee_type")
        if fee_type_id:
            qs = qs.filter(fee_type_id=fee_type_id)
        fee_type_code = self.request.query_params.get("fee_type_code")
        if fee_type_code:
            qs = qs.filter(fee_type__code__iexact=fee_type_code)
        receipt_full = self.request.query_params.get("receipt_no_full")
        if receipt_full:
            normalized_full = CashRegister.normalize_receipt_no(receipt_full)
            if normalized_full:
                qs = qs.filter(receipt_no_full__iexact=normalized_full)
            else:
                return qs.none()
        rec_ref = self.request.query_params.get("rec_ref")
        if rec_ref:
            qs = qs.filter(rec_ref__iexact=rec_ref.strip())
        rec_no = self.request.query_params.get("rec_no")
        if rec_no:
            try:
                qs = qs.filter(rec_no=int(rec_no))
            except ValueError:
                return qs.none()
        return qs.order_by("-date", "-rec_ref", "-rec_no")

    @transaction.atomic
    def perform_create(self, serializer):
        payment_mode = serializer.validated_data["payment_mode"]
        entry_date = serializer.validated_data.get("date") or timezone.now().date()
        next_numbers = ReceiptNumberService.next_numbers(payment_mode, entry_date, lock=True)
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
        next_numbers = ReceiptNumberService.next_numbers(payment_mode, entry_date, lock=False)
        return Response({
            "rec_ref": next_numbers["rec_ref"],
            "rec_no": next_numbers["rec_no"],
            "receipt_no_full": next_numbers["receipt_no_full"],
        })


class UploadCashExcelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
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

        # Load fee types cache (by code and name)
        fee_types = list(FeeType.objects.all())
        fee_by_code = {ft.code.strip().lower(): ft for ft in fee_types if ft.code}
        fee_by_name = {ft.name.strip().lower(): ft for ft in fee_types if ft.name}

        results = {"created": 0, "errors": []}

        try:
            with transaction.atomic():
                # Decide format: rows-as-items if columns include fee_type/fee_code & amount
                lower_keys = set(k.lower() for k in orig_cols)
                if ("fee_type" in lower_keys or "fee_code" in lower_keys) and "amount" in lower_keys:
                    # Prefer grouping by normalized receipt_no_full when present to ensure one header per receipt
                    receipt_col = lower_cols.get("receipt_no_full") if "receipt_no_full" in lower_keys else None

                    if receipt_col:
                        # create a normalized receipt key column for robust grouping
                        df["_receipt_key"] = df[receipt_col].apply(lambda v: CashRegister.normalize_receipt_no(v) or "")
                        grouped = df.groupby("_receipt_key")
                    elif "rec_no" in lower_keys:
                        grouped = df.groupby(lower_cols.get("rec_no"))
                    else:
                        grouped = [(None, df)]

                    for key, group in grouped:
                        first = group.iloc[0]
                        date_val = first.get(lower_cols.get("date") if "date" in lower_cols else "date")
                        payment_mode = (first.get(lower_cols.get("payment_mode")) or "CASH").upper()
                        remark = first.get(lower_cols.get("remark")) if "remark" in lower_cols else ""

                        # Respect Excel-provided receipt_no_full when available
                        receipt_full = None
                        if receipt_col:
                            # key is normalized receipt; prefer original first cell if available, else use normalized
                            raw_val = first.get(receipt_col)
                            receipt_full = CashRegister.normalize_receipt_no(raw_val) or (key if key else None)

                        header_kwargs = {"date": date_val, "payment_mode": payment_mode, "remark": remark, "created_by": request.user}
                        if receipt_full:
                            header_kwargs["receipt_no_full"] = receipt_full

                        header = Receipt(**header_kwargs)
                        header.save()
                        total = 0
                        for _, row in group.iterrows():
                            ft_code = (
                                row.get(lower_cols.get("fee_code"))
                                or row.get(lower_cols.get("fee_type"))
                            )
                            amt = row.get(lower_cols.get("amount"))
                            if pd.isna(amt) or amt == "":
                                continue
                            fee_obj = None
                            if isinstance(ft_code, str) and ft_code.strip().lower() in fee_by_code:
                                fee_obj = fee_by_code[ft_code.strip().lower()]
                            elif isinstance(ft_code, str) and ft_code.strip().lower() in fee_by_name:
                                fee_obj = fee_by_name[ft_code.strip().lower()]
                            else:
                                # try numeric id
                                try:
                                    fid = int(ft_code)
                                    fee_obj = FeeType.objects.filter(id=fid).first()
                                except Exception:
                                    fee_obj = None
                            if not fee_obj:
                                raise ValueError(f"Fee type not found for value: {ft_code}")
                            ReceiptItem.objects.create(receipt=header, fee_type=fee_obj, amount=float(amt), remark="")
                            total += float(amt)
                        header.total_amount = total
                        header.save()
                        results["created"] += 1
                else:
                    # Treat each row as a receipt header with multiple fee columns
                    # Identify primary columns
                    date_col = lower_cols.get("date") or next((c for c in orig_cols if c.lower().startswith("date")), None)
                    receipt_col = lower_cols.get("receipt_no_full") or lower_cols.get("rec_no") or lower_cols.get("receipt_no")
                    payment_col = lower_cols.get("payment_mode")
                    remark_col = lower_cols.get("remark")

                    # Fee columns are those not in known set
                    known = {date_col, receipt_col, payment_col, remark_col, None}
                    fee_cols = [c for c in orig_cols if c not in known]

                    for idx, row in df.iterrows():
                        date_val = row.get(date_col) if date_col else None
                        payment_mode = (row.get(payment_col) or "CASH").upper() if payment_col else "CASH"
                        remark = row.get(remark_col) if remark_col else ""
                        header = Receipt(date=date_val, payment_mode=payment_mode, remark=remark, created_by=request.user)
                        header.save()
                        total = 0
                        for col in fee_cols:
                            val = row.get(col)
                            if pd.isna(val) or val == "":
                                continue
                            # map column header to fee type by code or name
                            col_key = str(col).strip().lower()
                            fee_obj = fee_by_code.get(col_key) or fee_by_name.get(col_key)
                            if not fee_obj:
                                # try to find by partial match
                                fee_obj = next((v for k, v in fee_by_name.items() if col_key in k), None)
                            if not fee_obj:
                                raise ValueError(f"Fee type column not recognized: {col}")
                            ReceiptItem.objects.create(receipt=header, fee_type=fee_obj, amount=float(val), remark="")
                            total += float(val)
                        header.total_amount = total
                        header.save()
                        results["created"] += 1
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
            "created_by",
            "created_by_name",
            "items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["rec_ref", "rec_no", "receipt_no_full", "created_by", "created_at", "updated_at"]

    def get_created_by_name(self, obj) -> str:
        full_name = obj.created_by.get_full_name().strip()
        return full_name or obj.created_by.username


class ReceiptViewSet(FinancePermissionMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = Receipt.objects.select_related("created_by").prefetch_related("items__fee_type").all()
    serializer_class = ReceiptSerializer
    permission_classes = [IsAuthenticated]
    finance_menu_name = "Cash Register"

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
            normalized_full = CashRegister.normalize_receipt_no(receipt_full)
            if normalized_full:
                qs = qs.filter(receipt_no_full__iexact=normalized_full)
            else:
                return qs.none()
        return qs.order_by("-date", "-rec_ref", "-rec_no")

    @action(detail=False, methods=["post"], url_path="bulk-create")
    def bulk_create(self, request):
        """Accepts JSON payload of receipts with items and creates them atomically.

        Expected payload: { "receipts": [ { "date": "YYYY-MM-DD", "payment_mode": "CASH", "items": [ { "fee_type_code": "PGREG", "amount": 1000 }, ... ] }, ... ] }
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
                    if payment_mode not in dict(CashRegister.PAYMENT_MODE_CHOICES):
                        raise ValueError("Invalid payment_mode")
                    items = rec.get("items") or []
                    if not items:
                        raise ValueError("No items for receipt")

                    # Create receipt header
                    header = Receipt(
                        date=date_val,
                        payment_mode=payment_mode,
                        remark=rec.get("remark") or "",
                        created_by=request.user,
                    )
                    # assign rec_ref/rec_no/receipt_no_full via save hooks
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
