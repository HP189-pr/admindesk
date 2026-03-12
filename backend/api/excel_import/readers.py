"""Shared Excel workbook readers for admin and API bulk-upload flows."""

import csv
from io import BytesIO, StringIO
from typing import Any, Optional


def _decode_delimited_text(data: bytes) -> str:
    if data.startswith(b"\xef\xbb\xbf"):
        try:
            return data.decode("utf-8-sig")
        except Exception:
            pass
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        for encoding in ("utf-16", "utf-16-le", "utf-16-be"):
            try:
                return data.decode(encoding)
            except Exception:
                continue

    try:
        return data.decode("utf-8-sig")
    except Exception:
        pass

    if b"\x00" in data[:4096]:
        for encoding in ("utf-16-le", "utf-16-be", "utf-16"):
            try:
                return data.decode(encoding)
            except Exception:
                continue

    return data.decode("latin-1", errors="replace")


def _read_delimited_fallback(raw_bytes: bytes, **kwargs):
    try:
        import pandas as pd
    except Exception as exc:
        raise ValueError("pandas is required on server for Excel/CSV operations.") from exc

    head_bytes = raw_bytes[:4096]
    has_delimiter_hint = any(delimiter in head_bytes for delimiter in (b"\t", b",", b";", b"|"))
    has_utf16_bom = raw_bytes.startswith((b"\xff\xfe", b"\xfe\xff"))
    if not has_delimiter_hint and not has_utf16_bom:
        return None

    decoded_text = _decode_delimited_text(raw_bytes)
    if not decoded_text or not decoded_text.strip():
        return None

    sample = decoded_text[:8192]
    lines = [line for line in sample.splitlines() if line.strip()]
    if not lines:
        return None

    delimiter = None
    try:
        sniff_sample = "\n".join(lines[:20])
        dialect = csv.Sniffer().sniff(sniff_sample, delimiters="\t,;|")
        delimiter = dialect.delimiter
    except Exception:
        probe = "\n".join(lines[:20])
        counts = {
            "\t": probe.count("\t"),
            ",": probe.count(","),
            ";": probe.count(";"),
            "|": probe.count("|"),
        }
        delimiter = max(counts, key=counts.get)
        if counts[delimiter] == 0:
            delimiter = None

    if not delimiter:
        return None

    allowed_csv_args = {
        "header", "names", "index_col", "usecols", "dtype", "skiprows",
        "nrows", "na_values", "keep_default_na", "parse_dates", "dayfirst",
    }
    csv_kwargs = {key: value for key, value in kwargs.items() if key in allowed_csv_args}
    parse_kwargs = {
        "sep": delimiter,
        "engine": "python",
        "on_bad_lines": "skip",
        **csv_kwargs,
    }
    try:
        df_text = pd.read_csv(StringIO(decoded_text), **parse_kwargs)
    except TypeError:
        parse_kwargs.pop("on_bad_lines", None)
        df_text = pd.read_csv(StringIO(decoded_text), **parse_kwargs)

    sheet_name = kwargs.get("sheet_name", None)
    if sheet_name is None:
        return {"Sheet1": df_text}
    return df_text


def read_excel_compat(source: Any, file_ext: Optional[str] = None, **kwargs):
    """Read Excel bytes or file-like objects with deterministic engine fallbacks."""
    try:
        import pandas as pd
    except Exception as exc:
        raise ValueError("pandas is required on server for Excel/CSV operations.") from exc

    if isinstance(source, (bytes, bytearray)):
        raw = bytes(source)
    elif hasattr(source, "read"):
        raw = source.read()
        try:
            source.seek(0)
        except Exception:
            pass
    elif hasattr(source, "getvalue"):
        raw = source.getvalue()
    else:
        raw = bytes(source)

    if not raw:
        raise ValueError("Uploaded file is empty")

    ext = (file_ext or "").lower().strip()
    is_zip_container = raw[:4] == b"PK\x03\x04"
    is_ole_container = raw[:8] == b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1"

    if ext == ".xlsx":
        engine_order = ("xlrd", "openpyxl") if is_ole_container else ("openpyxl", "xlrd")
    elif ext == ".xls":
        engine_order = ("openpyxl", "xlrd") if is_zip_container else ("xlrd", "openpyxl")
    else:
        engine_order = ("openpyxl", "xlrd")

    errors = []
    for engine in engine_order:
        try:
            bio = BytesIO(raw)
            read_kwargs = dict(kwargs)
            read_kwargs["engine"] = engine
            return pd.read_excel(bio, **read_kwargs)
        except Exception as exc:
            errors.append((engine, exc))
            continue

    text_result = _read_delimited_fallback(raw, **kwargs)
    if text_result is not None:
        return text_result

    if ext == ".xls":
        for engine, exc in errors:
            message = str(exc).lower()
            if engine == "xlrd" and ("missing optional dependency" in message or "xlrd" in message):
                raise ValueError("Cannot read .xls files because 'xlrd' is not installed on the server. Install xlrd or upload .xlsx/.csv.")

    details = "; ".join(f"{engine}: {type(exc).__name__}: {exc}" for engine, exc in errors[:2])
    raise ValueError(details or "Unable to read Excel workbook")