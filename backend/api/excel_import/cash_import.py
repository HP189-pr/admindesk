# CashRegister and Receipt Excel import logic (FINAL – PRODUCTION SAFE)

from decimal import Decimal
from django.db import transaction

from .helpers import parse_excel_date, clean_cell, row_value
from ..domain_cash_register import PAYMENT_MODE_CHOICES


# --------------------------------------------------
# Helper
# --------------------------------------------------
def safe_int(val, default=None):
    try:
        return int(float(val))
    except Exception:
        return default


def is_blank_or_nan(val) -> bool:
    if val is None:
        return True
    try:
        if val != val:  # NaN check (works for float/numpy nan)
            return True
    except Exception:
        pass
    text = str(val).strip().lower()
    return text in {"", "nan", "none", "null", "<na>", "nat"}


# Normalize fee keys to a canonical form for lookups
def normalize_fee_key(val: str) -> str:
    if not val:
        return ""
    return str(val).strip().lower().replace(" ", "").replace("_", "")


def parse_cancel_flag(val):
    if val is None:
        return None
    text = str(val).strip().lower()
    if text in {"", "null", "none", "nan"}:
        return None
    if text in {"yes", "y", "true", "1", "cancel", "cancelled", "canceled"}:
        return True
    return None


# --------------------------------------------------
# MAIN IMPORT FUNCTION
# --------------------------------------------------
def import_cash_register(
    df,
    eff,
    request,
    Receipt,
    ReceiptItem,
    FeeType,
    ReceiptNumberService,
    # PAYMENT_MODE_CHOICES is now imported at the module level
    normalize_receipt_no,
    split_receipt,
):
    """
    Import Cash Register Excel data as Receipt + ReceiptItem.

    ✔ STRICT Excel header → FeeType.code
    ✔ No FeeType auto-create
    ✔ Multi-fee-column supported
    ✔ TOTAL column ignored automatically
    """

    valid_modes = {choice[0] for choice in PAYMENT_MODE_CHOICES}

    raw_cols = [str(c).strip() for c in df.columns]
    raw_cols_norm = [normalize_fee_key(c) for c in raw_cols]

    standard_keys = {
        "date", "paymentmode", "remark",
        "recref", "recno", "receiptnofull",
        "iscancelled", "cancelreason", "cancelledby",
        "feetype", "feetypecode", "feecode", "amount",
        "total", "totalamount"
    }

    # Fee columns = everything except known system columns
    fee_cols = [
        c for c in raw_cols
        if normalize_fee_key(c) not in standard_keys
    ]

    # Detect ROW-WISE fee format (fee_code OR fee_type_code OR fee_type) + amount/total_amount
    is_row_wise = (
        ("feecode" in raw_cols_norm or "feetypecode" in raw_cols_norm or "feetype" in raw_cols_norm)
        and ("amount" in raw_cols_norm or "totalamount" in raw_cols_norm)
    )

    # --------------------------------------------------
    # Load FeeType cache
    # --------------------------------------------------
    fee_types = list(FeeType.objects.filter(is_active=True))
    fee_by_code = {
        normalize_fee_key(ft.code): ft
        for ft in fee_types
        if getattr(ft, "code", None)
    }
    fee_by_name = {
        normalize_fee_key(ft.name): ft
        for ft in fee_types
        if getattr(ft, "name", None)
    }

    # --------------------------------------------------
    # EXCEL HEADER → DB FEE CODE MAP
    # --------------------------------------------------
    ALIAS_TO_CODE = {
        "svf": "STU_VER_FEES",
        "pdf": "PROV_DEGREE_FEES",

        "migra": "MIGRA",
        "correction": "CORRECTION",

        "enrolment": "ENROLMENT",
        "pg reg": "PGREG",

        "degree": "DEGREE",
        "exam fees": "EXAM_FEES",
        "thesis": "THESIS",
        "msw": "MSW",

        "rechecking": "RECHECK",
        "reassessment": "REASSESSMENT",
        "rechecking & reassessment": "REASSESSMENT",

        "other / phd form": "PHD_FORM",

        "lib": "LIB",
        "pec": "PEC",
        "kya": "KYA",

        "uni dev": "UNI_DEV_FEES",
        "extension fees": "OTH_EXTENTION_FEES",

        "other fees": "OTHER_FEES",

        # Added aliases for Excel fee codes
        "rechking": "RECHECK",
        "kyafes": "KYA",
        "phd": "PHD_TUTION",  # Change to PHD_FORM if needed
        "extentionfees": "OTH_EXTENTION_FEES",
    }

    # --------------------------------------------------
    # Fee resolver (STRICT)
    # --------------------------------------------------
    # Normalize alias map keys for reliable matching
    ALIAS_TO_CODE_NORM = {
        normalize_fee_key(k): v for k, v in ALIAS_TO_CODE.items()
    }

    def resolve_fee_by_header(header_name):
        if not header_name:
            return None

        raw = normalize_fee_key(header_name)

        # direct code match
        if raw in fee_by_code:
            return fee_by_code[raw]

        # alias -> canonical code -> fee_by_code
        if raw in ALIAS_TO_CODE_NORM:
            return fee_by_code.get(normalize_fee_key(ALIAS_TO_CODE_NORM[raw]))

        # match by name
        if raw in fee_by_name:
            return fee_by_name[raw]

        return None


    counts = {"created": 0, "skipped": 0}
    log = []

    def add_log(row, status, msg, ref=None):
        log.append({
            "row": row,
            "status": status,
            "message": msg,
            "receipt": ref,
        })


    # --------------------------------------------------
    # MULTI-FEE COLUMN IMPORT
    # --------------------------------------------------

    for i, (_, r) in enumerate(df.iterrows(), start=2):
        payment_mode = (clean_cell(row_value(r, "payment_mode")) or "").upper()
        if payment_mode not in valid_modes:
            counts["skipped"] += 1
            add_log(i, "skipped", "Invalid payment_mode")
            continue

        entry_date = parse_excel_date(row_value(r, "date"))
        if not entry_date:
            counts["skipped"] += 1
            add_log(i, "skipped", "Invalid date")
            continue

        remark = clean_cell(row_value(r, "remark")) or ""
        is_cancelled = parse_cancel_flag(row_value(r, "is_cancelled")) if "is_cancelled" in eff else None
        cancel_reason = clean_cell(row_value(r, "cancel_reason")) if "cancel_reason" in eff else None

        rec_ref = clean_cell(row_value(r, "rec_ref"))
        rec_no = safe_int(clean_cell(row_value(r, "rec_no")))

        receipt_no_full = normalize_receipt_no(
            clean_cell(row_value(r, "receipt_no_full"))
        )

        if not receipt_no_full:
            counts["skipped"] += 1
            add_log(i, "skipped", "Missing receipt_no_full")
            continue

        parsed_ref, parsed_no = split_receipt(receipt_no_full)
        if rec_no is None:
            rec_no = parsed_no
        if not rec_ref:
            rec_ref = parsed_ref
        if rec_no is None:
            counts["skipped"] += 1
            add_log(i, "skipped", "Invalid receipt_no_full (rec_no missing)")
            continue

        # Try to fetch existing receipt (dual entry allowed)
        header = Receipt.objects.filter(receipt_no_full=receipt_no_full).first()

        try:
            with transaction.atomic():
                # Always use Excel as source of truth for receipt numbers
                if not header:
                    header = Receipt.objects.create(
                        date=entry_date,
                        payment_mode=payment_mode,
                        rec_ref=rec_ref or "",
                        rec_no=rec_no,
                        receipt_no_full=receipt_no_full,
                        remark=remark,
                        is_cancelled=True if is_cancelled else None,
                        cancel_reason=cancel_reason if is_cancelled else None,
                        cancelled_by=request.user if is_cancelled else None,
                        created_by=request.user,
                    )
                else:
                    if "is_cancelled" in eff:
                        header.is_cancelled = True if is_cancelled else None
                    if "cancel_reason" in eff:
                        header.cancel_reason = cancel_reason if (header.is_cancelled or is_cancelled) else None
                    if "cancelled_by" in eff and (header.is_cancelled or is_cancelled):
                        header.cancelled_by = request.user
                    header.save(update_fields=["is_cancelled", "cancel_reason", "cancelled_by", "updated_at"])

                # --------------------------------------------------
                # ROW-WISE FEE IMPORT (fee_code + amount)
                # --------------------------------------------------
                if is_row_wise:
                    fee_code_val = (
                        clean_cell(row_value(r, "fee_code"))
                        or clean_cell(row_value(r, "fee_type_code"))
                        or clean_cell(row_value(r, "fee_type"))
                    )
                    amount_val = row_value(r, "amount")
                    if is_blank_or_nan(amount_val):
                        amount_val = row_value(r, "total_amount")

                    if not fee_code_val or is_blank_or_nan(amount_val) or amount_val == 0:
                        if is_cancelled:
                            header.total_amount = Decimal("0")
                            header.save(update_fields=["total_amount"])
                            counts["created"] += 1
                            add_log(i, "created", "Created cancelled receipt without fee amount", header.receipt_no_full)
                            continue
                        header.delete()
                        counts["skipped"] += 1
                        add_log(i, "skipped", "Missing fee_code/fee_type or amount/total_amount")
                        continue

                    fee_key = normalize_fee_key(fee_code_val)
                    fee_obj = (
                        fee_by_code.get(fee_key)
                        or fee_by_name.get(fee_key)
                        or fee_by_code.get(normalize_fee_key(ALIAS_TO_CODE_NORM.get(fee_key, "")))
                    )

                    if not fee_obj:
                        header.delete()
                        counts["skipped"] += 1
                        add_log(i, "skipped", f"Unknown fee code: {fee_code_val}")
                        continue

                    try:
                        amt = Decimal(str(amount_val))
                    except Exception:
                        if is_cancelled:
                            header.total_amount = Decimal("0")
                            header.save(update_fields=["total_amount"])
                            counts["created"] += 1
                            add_log(i, "created", "Created cancelled receipt without fee amount", header.receipt_no_full)
                            continue
                        header.delete()
                        counts["skipped"] += 1
                        add_log(i, "skipped", f"Invalid amount: {amount_val}")
                        continue
                    ReceiptItem.objects.create(
                        receipt=header,
                        fee_type=fee_obj,
                        amount=amt,
                        remark=""
                    )

                    header.total_amount = amt
                    header.save(update_fields=["total_amount"])

                    counts["created"] += 1
                    add_log(i, "created", "Created", header.receipt_no_full)
                    continue

                # ---------------------------
                # MULTI-FEE COLUMN IMPORT (legacy)
                # ---------------------------
                total = Decimal("0")
                used = False
                for col in fee_cols:
                    val = row_value(r, col)
                    if is_blank_or_nan(val) or val == 0:
                        continue

                    fee_obj = resolve_fee_by_header(col)
                    if not fee_obj:
                        counts["skipped"] += 1
                        add_log(i, "skipped", f"Unknown fee column: {col}")
                        continue

                    try:
                        amt = Decimal(str(val))
                    except Exception:
                        counts["skipped"] += 1
                        add_log(i, "skipped", f"Invalid amount in column {col}: {val}")
                        continue
                    ReceiptItem.objects.create(
                        receipt=header,
                        fee_type=fee_obj,
                        amount=amt,
                        remark=""
                    )
                    total += amt
                    used = True

                if not used:
                    if is_cancelled:
                        header.total_amount = Decimal("0")
                        header.save(update_fields=["total_amount"])
                        counts["created"] += 1
                        add_log(i, "created", "Created cancelled receipt without fee values", header.receipt_no_full)
                        continue
                    header.delete()
                    counts["skipped"] += 1
                    add_log(i, "skipped", "No fee values")
                    continue

                header.total_amount = total
                header.save(update_fields=["total_amount"])

                counts["created"] += 1
                add_log(i, "created", "Created", header.receipt_no_full)

        except Exception as e:
            counts["skipped"] += 1
            add_log(i, "skipped", str(e))

    return counts, log
