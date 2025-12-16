"""Serializers and viewsets for the Accounts & Finance cash register."""
from __future__ import annotations

from datetime import date, datetime
from typing import Dict, Optional

from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .domain_cash_register import CashRegister, FeeType
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
            "receipt_no",
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
        read_only_fields = ["receipt_no", "created_by", "created_at", "updated_at"]

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
    def next_number(cls, payment_mode: str, entry_date: date, *, lock: bool = False) -> str:
        prefix = cls._prefix(payment_mode, entry_date)
        qs = CashRegister.objects.filter(payment_mode=payment_mode, receipt_no__startswith=prefix)
        if lock:
            qs = qs.select_for_update()
        last = qs.order_by("-receipt_no").first()
        if last:
            try:
                seq = int(last.receipt_no.split("/")[-1]) + 1
            except (ValueError, IndexError):
                seq = 1
        else:
            seq = 1
        return f"{prefix}{seq:06d}"


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
        return qs.order_by("-date", "-receipt_no")

    @transaction.atomic
    def perform_create(self, serializer):
        payment_mode = serializer.validated_data["payment_mode"]
        entry_date = serializer.validated_data.get("date") or timezone.now().date()
        receipt_no = ReceiptNumberService.next_number(payment_mode, entry_date, lock=True)
        serializer.save(created_by=self.request.user, receipt_no=receipt_no)

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
        next_no = ReceiptNumberService.next_number(payment_mode, entry_date, lock=False)
        return Response({"next_receipt_no": next_no})
