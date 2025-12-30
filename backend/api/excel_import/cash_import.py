# CashRegister and Receipt Excel import logic

from .helpers import parse_excel_date, clean_cell

# Helper to safely cast to int for formatting
def safe_int(val, default=0):
    try:
        return int(float(val))
    except Exception:
        return default

# --- CashRegister Excel import logic extracted from admin.py ---
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from .helpers import parse_excel_date, clean_cell, row_value

def import_cash_register(df, eff, request, Receipt, ReceiptItem, FeeType, ReceiptNumberService, PAYMENT_MODE_CHOICES, normalize_receipt_no, merge_reference_and_number, split_receipt):
    """
    Import CashRegister Excel data as Receipts and ReceiptItems.
    Args:
        df: pandas DataFrame of the sheet
        eff: set of effective/selected columns
        request: Django request (for user)
        Receipt, ReceiptItem, FeeType, CashRegister, ReceiptNumberService: models/services
    Returns:
        counts: dict of created/updated/skipped
        log: list of row logs
    """
    valid_modes = {choice[0] for choice in PAYMENT_MODE_CHOICES}
    raw_cols = [str(c).strip() for c in list(df.columns)]
    normalized_chosen = set(eff)
    standard_keys = {"date", "payment_mode", "remark", "rec_ref", "rec_no", "receipt_no_full", "fee_type", "fee_type_code", "amount"}
    fee_cols = [c for c in raw_cols if c not in standard_keys and c not in normalized_chosen]
    fee_types = list(FeeType.objects.all())
    fee_by_code = {ft.code.strip().lower(): ft for ft in fee_types if ft.code}
    fee_by_name = {ft.name.strip().lower(): ft for ft in fee_types if ft.name}

    def resolve_fee_by_header(header_name, cell_val=None):
        # Try by header first (for multi-column layout)
        fee_obj = None
        code_candidate = None
        name_candidate = None
        if header_name:
            hk = str(header_name).strip().lower()
            code_candidate = hk
            if hk in fee_by_code:
                fee_obj = fee_by_code[hk]
            elif hk in fee_by_name:
                fee_obj = fee_by_name[hk]
            else:
                for k, v in fee_by_name.items():
                    if hk in k or k in hk:
                        fee_obj = v
                        break
        if not fee_obj and cell_val:
            try:
                cv = str(cell_val).strip()
            except Exception:
                cv = None
            if cv:
                low = cv.lower()
                code_candidate = code_candidate or low
                name_candidate = name_candidate or low
                if low in fee_by_code:
                    fee_obj = fee_by_code[low]
                elif low in fee_by_name:
                    fee_obj = fee_by_name[low]
                else:
                    try:
                        fid = int(float(cv))
                        fee_obj = FeeType.objects.filter(pk=fid).first()
                    except Exception:
                        pass
        # Auto-create FeeType if not found
        if not fee_obj and (code_candidate or name_candidate):
            code_val = code_candidate or (name_candidate or "AUTO")[:20]
            name_val = name_candidate or code_candidate or "Auto Fee"
            fee_obj = FeeType.objects.create(code=code_val[:20], name=name_val[:255], is_active=True)
            # Update cache for this session
            fee_by_code[code_val] = fee_obj
            fee_by_name[name_val] = fee_obj
        return fee_obj

    counts = {"created": 0, "updated": 0, "skipped": 0}
    log = []
    def add_log(rn, status, msg, ref=None):
        log.append({"row": rn, "status": status, "message": msg, "ref": ref})

    if fee_cols:
        # Multi-fee-column per-row format
        for i, (_, r) in enumerate(df.iterrows(), start=2):
            payment_raw = clean_cell(row_value(r, "payment_mode")) if "payment_mode" in eff else None
            payment_mode = (payment_raw or "").upper()
            if payment_mode not in valid_modes:
                counts["skipped"] += 1; add_log(i, "skipped", "Invalid payment_mode"); continue
            entry_date = parse_excel_date(row_value(r, "date")) if "date" in eff else None
            if not entry_date:
                counts["skipped"] += 1; add_log(i, "skipped", "Missing/invalid date"); continue
            remark = clean_cell(row_value(r, "remark")) if "remark" in eff else ""
            rec_ref = clean_cell(row_value(r, "rec_ref")) if "rec_ref" in eff else None
            rec_no_raw = clean_cell(row_value(r, "rec_no")) if "rec_no" in eff else None
            rec_no_value = None
            if rec_no_raw not in (None, ""):
                try:
                    rec_no_value = int(str(rec_no_raw).strip())
                except Exception:
                    counts["skipped"] += 1; add_log(i, "skipped", "Invalid rec_no"); continue
            full_from_column = normalize_receipt_no(clean_cell(row_value(r, "receipt_no_full"))) if "receipt_no_full" in eff else None
            receipt_no_full = full_from_column
            if not receipt_no_full and rec_ref and rec_no_value is not None:
                receipt_no_full = merge_reference_and_number(rec_ref, f"{safe_int(rec_no_value):06d}")
            header = None
            if receipt_no_full:
                header = Receipt.objects.filter(receipt_no_full=receipt_no_full).first()
            if not header and rec_ref and rec_no_value is not None:
                rec_no_int = safe_int(rec_no_value)
                header = Receipt.objects.filter(rec_ref=rec_ref, rec_no=rec_no_int).first()
            try:
                # Use a savepoint per-row so DB errors rollback the row only
                with transaction.atomic():
                    if not header:
                        # If caller provided a full receipt string, try to extract series and number
                        if receipt_no_full and (rec_ref is None or rec_no_value is None):
                                    parsed_ref, parsed_no = split_receipt(receipt_no_full)
                            if parsed_no is not None:
                                rec_ref = rec_ref or (parsed_ref or "")
                                rec_no_value = rec_no_value if rec_no_value is not None else parsed_no
                        if rec_ref is None or rec_no_value is None:
                            auto_vals = ReceiptNumberService.next_numbers(payment_mode, entry_date, lock=True)
                            rec_ref = rec_ref or auto_vals["rec_ref"]
                            rec_no_value = rec_no_value if rec_no_value is not None else auto_vals["rec_no"]
                            receipt_no_full = receipt_no_full or auto_vals["receipt_no_full"]
                        rec_no_int = safe_int(rec_no_value)
                        header_kwargs = {
                            "rec_ref": rec_ref or "",
                            "rec_no": rec_no_int,
                            "receipt_no_full": receipt_no_full or merge_reference_and_number(rec_ref or "", f"{safe_int(rec_no_int):06d}"),
                            "date": entry_date,
                            "payment_mode": payment_mode,
                            "remark": remark or "",
                            "created_by": request.user,
                        }
                        # Rely on model `auto_now` for `updated_at` (no manual injection)
                        header = Receipt.objects.create(**header_kwargs)
                    total = Decimal(0)
                    created_any = False
                    for col in fee_cols:
                        val = row_value(r, col)
                        if val is None or (isinstance(val, str) and not val.strip()):
                            continue
                        fee_obj = resolve_fee_by_header(col, val)
                        if not fee_obj:
                            counts["skipped"] += 1; add_log(i, "skipped", f"Fee type not found for column {col}"); continue
                        try:
                            amt = Decimal(str(val))
                        except Exception:
                            counts["skipped"] += 1; add_log(i, "skipped", f"Invalid amount in column {col}"); continue
                        ReceiptItem.objects.create(receipt=header, fee_type=fee_obj, amount=amt, remark="")
                        total += amt
                        created_any = True
                    if created_any:
                        header.total_amount = total
                        header.save()
                        counts["created"] += 1; add_log(i, "created", "Created", header.receipt_no_full)
                    else:
                        header.delete()
                        counts["skipped"] += 1; add_log(i, "skipped", "No fee columns with values")
            except Exception as row_err:
                counts["skipped"] += 1; add_log(i, "skipped", f"Row error: {row_err}"); continue
    else:
        # Single-row-per-fee format (one fee per row)
        for i, (_, r) in enumerate(df.iterrows(), start=2):
            payment_mode = (clean_cell(row_value(r, "payment_mode")) or "").upper()
            if payment_mode not in valid_modes:
                counts["skipped"] += 1; add_log(i, "skipped", "Invalid payment_mode"); continue
            entry_date = parse_excel_date(row_value(r, "date")) if "date" in eff else None
            if not entry_date:
                counts["skipped"] += 1; add_log(i, "skipped", "Missing/invalid date"); continue
            remark = clean_cell(row_value(r, "remark")) if "remark" in eff else ""
            rec_ref = clean_cell(row_value(r, "rec_ref")) if "rec_ref" in eff else None
            rec_no_raw = clean_cell(row_value(r, "rec_no")) if "rec_no" in eff else None
            rec_no_value = None
            if rec_no_raw not in (None, ""):
                try:
                    rec_no_value = int(str(rec_no_raw).strip())
                except Exception:
                    counts["skipped"] += 1; add_log(i, "skipped", "Invalid rec_no"); continue
            full_from_column = normalize_receipt_no(clean_cell(row_value(r, "receipt_no_full"))) if "receipt_no_full" in eff else None
            receipt_no_full = full_from_column
            if not receipt_no_full and rec_ref and rec_no_value is not None:
                receipt_no_full = merge_reference_and_number(rec_ref, f"{safe_int(rec_no_value):06d}")
            header = None
            if receipt_no_full:
                header = Receipt.objects.filter(receipt_no_full=receipt_no_full).first()
            if not header and rec_ref and rec_no_value is not None:
                rec_no_int = safe_int(rec_no_value)
                header = Receipt.objects.filter(rec_ref=rec_ref, rec_no=rec_no_int).first()
            try:
                with transaction.atomic():
                    if not header:
                        # If caller provided a full receipt string, try to extract series and number
                        if receipt_no_full and (rec_ref is None or rec_no_value is None):
                            parsed_ref, parsed_no = split_receipt(receipt_no_full)
                            if parsed_no is not None:
                                rec_ref = rec_ref or (parsed_ref or "")
                                rec_no_value = rec_no_value if rec_no_value is not None else parsed_no
                        if rec_ref is None or rec_no_value is None:
                            auto_vals = ReceiptNumberService.next_numbers(payment_mode, entry_date, lock=True)
                            rec_ref = rec_ref or auto_vals["rec_ref"]
                            rec_no_value = rec_no_value if rec_no_value is not None else auto_vals["rec_no"]
                            receipt_no_full = receipt_no_full or auto_vals["receipt_no_full"]
                        rec_no_int = safe_int(rec_no_value)
                        header_kwargs = {
                            "rec_ref": rec_ref or "",
                            "rec_no": rec_no_int,
                            "receipt_no_full": receipt_no_full or merge_reference_and_number(rec_ref or "", f"{safe_int(rec_no_int):06d}"),
                            "date": entry_date,
                            "payment_mode": payment_mode,
                            "remark": remark or "",
                            "created_by": request.user,
                        }
                        # Model has auto_now for `updated_at`; no manual injection
                        header = Receipt.objects.create(**header_kwargs)
                    # Resolve fee type for this row
                    fee_val = clean_cell(row_value(r, "fee_code")) if "fee_code" in eff else (clean_cell(row_value(r, "fee_type")) if "fee_type" in eff else None)
                    fee_obj = None
                    if fee_val:
                        fee_obj = resolve_fee_by_header(fee_val, fee_val)
                    if not fee_obj and "fee_type_code" in eff:
                        fee_code = clean_cell(row_value(r, "fee_type_code"))
                        if fee_code:
                            fee_obj = resolve_fee_by_header(fee_code, fee_code)
                    if not fee_obj:
                        counts["skipped"] += 1; add_log(i, "skipped", f"Fee type not found for value {fee_val}"); continue
                    amount_val = row_value(r, "amount") if "amount" in eff else None
                    try:
                        amt = Decimal(str(amount_val))
                    except Exception:
                        counts["skipped"] += 1; add_log(i, "skipped", "Invalid amount"); continue
                    ReceiptItem.objects.create(receipt=header, fee_type=fee_obj, amount=amt, remark=remark)
                    header.total_amount = (header.total_amount or Decimal(0)) + amt
                    header.save()
                    counts["created"] += 1; add_log(i, "created", "Created", header.receipt_no_full)
            except Exception as row_err:
                counts["skipped"] += 1; add_log(i, "skipped", f"Row error: {row_err}")
                continue
        return counts, log
