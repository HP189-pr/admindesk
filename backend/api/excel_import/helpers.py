# Shared Excel parsing and cleaning helpers for import logic

# --- Excel/CSV helpers moved from admin.py ---
from datetime import datetime, date, timedelta
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
    if sval.lower() in ("nat", "nan", "null", "none", "<na>") or sval == "":
        return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%m/%d/%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(sval, fmt).date()
        except Exception:
            continue
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
