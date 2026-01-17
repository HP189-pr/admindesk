# CashRegister and Receipt Excel import logic (FINAL – PRODUCTION SAFE)

from decimal import Decimal
from django.db import transaction

from .helpers import parse_excel_date, clean_cell, row_value


# --------------------------------------------------
# Helper
# --------------------------------------------------
def safe_int(val, default=None):
    try:
        return int(float(val))
    except Exception:
        return default


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
    PAYMENT_MODE_CHOICES,
    normalize_receipt_no,
    merge_reference_and_number,
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

    standard_keys = {
        "date", "payment_mode", "remark",
        "rec_ref", "rec_no", "receipt_no_full",
        "fee_type", "fee_type_code", "amount",
        "total", "TOTAL"
    }

    # Fee columns = everything except known system columns
    fee_cols = [c for c in raw_cols if c not in standard_keys]

    # --------------------------------------------------
    # Load FeeType cache
    # --------------------------------------------------
    fee_types = list(FeeType.objects.filter(is_active=True))
    fee_by_code = {ft.code.strip().lower(): ft for ft in fee_types}
    fee_by_name = {ft.name.strip().lower(): ft for ft in fee_types}

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
    }

    # --------------------------------------------------
    # Fee resolver (STRICT)
    # --------------------------------------------------
    def resolve_fee_by_header(header_name):
        if not header_name:
            return None

        key = str(header_name).strip().lower()

        if key in fee_by_code:
            return fee_by_code[key]

        if key in ALIAS_TO_CODE:
            return fee_by_code.get(ALIAS_TO_CODE[key].lower())

        if key in fee_by_name:
            return fee_by_name[key]

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

        rec_ref = clean_cell(row_value(r, "rec_ref"))
        rec_no = safe_int(clean_cell(row_value(r, "rec_no")))

        receipt_no_full = normalize_receipt_no(
            clean_cell(row_value(r, "receipt_no_full"))
        )

        header = None
        if receipt_no_full:
            header = Receipt.objects.filter(receipt_no_full=receipt_no_full).first()

        try:
            with transaction.atomic():

                # ---------------------------
                # Create Receipt Header
                # ---------------------------
                if not header:

                    if not rec_ref or rec_no is None:
                        nums = ReceiptNumberService.next_numbers(
                            payment_mode, entry_date, lock=True
                        )
                        rec_ref = nums["rec_ref"]
                        rec_no = nums["rec_no"]
                        receipt_no_full = nums["receipt_no_full"]
                    else:
                        receipt_no_full = receipt_no_full or merge_reference_and_number(
                            rec_ref, f"{rec_no:06d}"
                        )

                    header = Receipt.objects.create(
                        date=entry_date,
                        payment_mode=payment_mode,
                        rec_ref=rec_ref,
                        rec_no=rec_no,
                        receipt_no_full=receipt_no_full,
                        remark=remark,
                        created_by=request.user,
                    )

                total = Decimal("0")
                used = False

                # ---------------------------
                # Receipt Items
                # ---------------------------
                for col in fee_cols:
                    val = row_value(r, col)
                    if val in (None, "", 0):
                        continue

                    fee_obj = resolve_fee_by_header(col)
                    if not fee_obj:
                        counts["skipped"] += 1
                        add_log(i, "skipped", f"Unknown fee column: {col}")
                        continue

                    amt = Decimal(str(val))
                    ReceiptItem.objects.create(
                        receipt=header,
                        fee_type=fee_obj,
                        amount=amt,
                        remark=""
                    )
                    total += amt
                    used = True

                if not used:
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
