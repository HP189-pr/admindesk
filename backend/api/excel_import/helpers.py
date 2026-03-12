# Shared Excel parsing and cleaning helpers for import logic

# --- Excel/CSV helpers moved from admin.py ---
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Any

def parse_excel_date(val: Any):
    """Parse diverse Excel/CSV cell date values into a python date.
    Handles:
      - pandas.Timestamp (tz-aware or naive)
      - pandas.NaT or other NA markers => None
      - Excel serial numbers (>25000 heuristic)
      - Common string formats (Y-m-d, d-m-Y, d/m/Y, Y/m/d)
      - datetime / date objects
    Guaranteed to return either a date instance or None (never pandas NaT), preventing
    downstream Django DateField assignment errors like 'NaTType does not support utcoffset'.
    """
    if val is None:
        return None
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    if isinstance(val, datetime):
        if getattr(val, 'tzinfo', None) is not None:
            try:
                val = val.replace(tzinfo=None)
            except Exception:
                pass
        return val.date()
    try:
        import pandas as pd
    except Exception:
        pd = None
    if pd is not None:
        try:
            if pd.isna(val):
                return None
        except Exception:
            pass
        if isinstance(val, pd.Timestamp):
            try:
                py_dt = val.to_pydatetime()
                if getattr(py_dt, 'tzinfo', None) is not None:
                    py_dt = py_dt.replace(tzinfo=None)
                return py_dt.date()
            except Exception:
                return None
    if isinstance(val, (int, float)):
        try:
            if val > 25000:
                origin = datetime(1899, 12, 30)
                return (origin + timedelta(days=int(val))).date()
        except Exception:
            pass
    sval = str(val).strip()
    low = sval.lower()
    if low in ("nat", "nan", "null", "none", "<na>", "", "-", "--", "na", "n/a", "nil"):
        return None

    # Numeric strings from CSV/Excel (e.g. "45230", "45230.0")
    try:
        snum = float(str(sval).replace(",", ""))
        if snum > 25000:
            origin = datetime(1899, 12, 30)
            return (origin + timedelta(days=int(snum))).date()
    except Exception:
        pass

    for fmt in (
        "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%m/%d/%Y", "%d.%m.%Y",
        "%Y-%m-%d %H:%M:%S", "%d-%m-%Y %H:%M:%S", "%d/%m/%Y %H:%M:%S", "%d.%m.%Y %H:%M:%S",
        "%Y-%m-%d %H:%M", "%d-%m-%Y %H:%M", "%d/%m/%Y %H:%M", "%d.%m.%Y %H:%M",
        "%d-%m-%Y %I:%M:%S %p", "%d/%m/%Y %I:%M:%S %p", "%Y-%m-%d %I:%M:%S %p",
    ):
        try:
            return datetime.strptime(sval, fmt).date()
        except Exception:
            continue

    # Final tolerant fallback (dayfirst handles dd-mm-yyyy / dd/mm/yyyy naturally)
    if pd is not None:
        try:
            parsed = pd.to_datetime(sval, errors='coerce', dayfirst=True)
            if not pd.isna(parsed):
                if hasattr(parsed, 'to_pydatetime'):
                    parsed = parsed.to_pydatetime()
                if isinstance(parsed, datetime):
                    if getattr(parsed, 'tzinfo', None) is not None:
                        parsed = parsed.replace(tzinfo=None)
                    return parsed.date()
                if isinstance(parsed, date):
                    return parsed
        except Exception:
            pass

    return None

def clean_cell(val: Any):
    """Normalize a cell value from pandas/Excel into a safe Python value.
    - Converts pandas NaN/NaT and common sentinel strings to None
    - Strips strings and returns None for empty strings
    - Returns the original value for non-string values (after NaN check)
    """
    if val is None:
        return None
    try:
        import pandas as _pd
        if _pd is not None:
            try:
                if _pd.isna(val):
                    return None
            except Exception:
                pass
    except Exception:
        pass
    s = str(val).strip()
    if s == "" or s.lower() in ("nan", "none", "<na>"):
        return None
    return s

def safe_num(val: Any, default=0):
    """Coerce a value to float while treating NaN-like inputs as missing."""
    if val is None:
        return default
    if isinstance(val, str):
        sval = val.strip()
        if sval == "" or sval.lower() in ("nan", "nat", "none", "<na>"):
            return default
    try:
        import pandas as _pd
    except Exception:
        _pd = None
    try:
        if _pd is not None and _pd.isna(val):
            return default
    except Exception:
        pass
    try:
        import math
        number = float(val)
        if math.isnan(number) or number in (float("inf"), float("-inf")):
            return default
        return number
    except Exception:
        return default

def normalize_month_year(val: Any):
    """Normalize a month-year value to `MON-YYYY` when possible."""
    if val is None:
        return None
    try:
        import pandas as _pd
    except Exception:
        _pd = None
    try:
        if _pd is not None and isinstance(val, _pd.Timestamp):
            return val.to_pydatetime().strftime("%b-%Y").upper()
        if isinstance(val, (date, datetime)):
            return val.strftime("%b-%Y").upper()
        if isinstance(val, (int, float)):
            try:
                if float(val) > 1000:
                    if _pd is not None:
                        parsed = _pd.to_datetime(val, unit="D", origin="1899-12-30", errors="coerce")
                        if not _pd.isna(parsed):
                            return parsed.to_pydatetime().strftime("%b-%Y").upper()
                    else:
                        origin = datetime(1899, 12, 30)
                        return (origin + timedelta(days=int(val))).strftime("%b-%Y").upper()
            except Exception:
                pass
        sval = str(val).strip()
        if sval == "" or sval.lower() in ("nan", "none", "<na>"):
            return None
        for fmt in ("%b-%y", "%b-%Y", "%B-%Y", "%m-%Y", "%Y-%m-%d", "%Y"):
            try:
                return datetime.strptime(sval, fmt).strftime("%b-%Y").upper()
            except Exception:
                continue
        if _pd is not None:
            try:
                parsed = _pd.to_datetime(sval, errors="coerce", dayfirst=True)
                if not _pd.isna(parsed):
                    return parsed.to_pydatetime().strftime("%b-%Y").upper()
            except Exception:
                pass
        import re
        match = re.search(r"([A-Za-z]{3,9})[\s\-_/]*(\d{2,4})", sval)
        if match:
            mon = match.group(1)[:3].upper()
            year = match.group(2)
            if len(year) == 2:
                year = f"{2000 + int(year):04d}"
            return f"{mon}-{year}"
    except Exception:
        pass
    return str(val)

def normalize_dataframe_nulls(df: Any):
    """Replace pandas null-like values in a DataFrame with Python None."""
    try:
        import pandas as pd
        if isinstance(df, pd.DataFrame):
            return df.where(pd.notnull(df), None)
    except Exception:
        pass
    return df

def coerce_decimal_or_none(val: Any):
    """Convert numeric-like input to Decimal, returning None for missing/invalid values."""
    cleaned = clean_cell(val)
    if cleaned is None:
        return None
    try:
        return Decimal(str(cleaned))
    except Exception:
        return None

def row_value(row, column_name: str):
    """Return the scalar value for a column in a DataFrame row.
    When alias renames create duplicate column headers pandas exposes the row
    values as a Series. We collapse those duplicates by picking the last
    non-empty value so we always feed scalars into downstream parsers.
    """
    if row is None or not column_name:
        return None
    try:
        value = row.get(column_name)
    except Exception:
        return None
    try:
        import pandas as pd
    except Exception:
        pd = None
    if pd is not None:
        try:
            series_cls = getattr(pd, "Series", None)
        except Exception:
            series_cls = None
        if series_cls is not None and isinstance(value, series_cls):
            try:
                seq = list(value.tolist())
            except Exception:
                seq = list(value)
            for item in reversed(seq):
                if item is None:
                    continue
                if isinstance(item, str) and not item.strip():
                    continue
                return item
            return None
    if isinstance(value, (list, tuple)):
        for item in value:
            if item is None:
                continue
            if isinstance(item, str) and not item.strip():
                continue
            return item
        return None
    return value

def parse_boolean_cell(val: Any):
    """Best-effort bool parser for Excel uploads."""
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    try:
        sval = str(val).strip()
    except Exception:
        sval = str(val)
    if sval == "":
        return None
    lowered = sval.lower()
    if lowered in {"1", "true", "t", "yes", "y", "active", "enabled"}:
        return True
    if lowered in {"0", "false", "f", "no", "n", "inactive", "disabled"}:
        return False
    raise ValueError(f"Unrecognized boolean value: {val}")
