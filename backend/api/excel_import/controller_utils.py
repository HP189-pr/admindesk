# backend/api/excel_import/controller_utils.py
"""Shared controller-level helpers for Excel upload UIs."""

from datetime import date
from typing import Any, Callable, Optional


def is_truthy(value: Any) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "y", "t"}


def build_bulk_sample_row(columns) -> dict[str, Any]:
    today = date.today()
    example = {}
    for column in columns:
        lowered = str(column).lower()
        if "emp_id" in lowered:
            example[column] = "EMP001"
        elif "student_no" in lowered or "enrollment_no" in lowered:
            example[column] = "ENR001"
        elif "temp_enroll_no" in lowered:
            example[column] = "TEMP001"
        elif "enrollment_id" in lowered:
            example[column] = 1
        elif "receipt_no" in lowered:
            example[column] = "RCPT-001"
        elif "receipt_date" in lowered:
            example[column] = today.strftime("%Y-%m-%d")
        elif lowered == "term":
            example[column] = "1st Term"
        elif lowered == "amount":
            example[column] = 1200.00
        elif "remark" in lowered:
            example[column] = "Initial payment"
        elif "emp_name" in lowered or lowered == "name" or lowered.endswith("_name"):
            example[column] = "John Doe"
        elif "designation" in lowered:
            example[column] = "Manager"
        elif "username" in lowered:
            example[column] = "jdoe"
        elif "usercode" in lowered:
            example[column] = "EMP001"
        elif ("joining" in lowered and "date" in lowered) or lowered == "actual_joining":
            example[column] = today.strftime("%Y-%m-%d")
        elif ("birth" in lowered and "date" in lowered) or lowered.endswith("birth_date"):
            example[column] = today.replace(year=today.year - 30).strftime("%Y-%m-%d")
        elif "department" in lowered:
            example[column] = "HR"
        elif "institute" in lowered:
            example[column] = "INST01"
        elif "prv_degree_name" in lowered or "degree" in lowered:
            example[column] = "B.Sc Computer Science"
        elif lowered == "status":
            example[column] = "Active"
        elif any(token in lowered for token in ("balance", "el_", "sl_", "cl_", "vacation")):
            example[column] = 0
        elif "joining_year_allocation" in lowered:
            example[column] = 1
        elif "leave_calculation_date" in lowered:
            example[column] = today.strftime("%Y-%m-%d")
        elif "emp_short" in lowered:
            example[column] = 0
        else:
            example[column] = ""
    return example


def extract_selected_columns(request_data) -> Optional[list[str]]:
    if hasattr(request_data, "getlist"):
        return request_data.getlist("columns[]") or request_data.getlist("columns") or None

    selected = request_data.get("columns[]") or request_data.get("columns")
    if isinstance(selected, list):
        return selected
    if isinstance(selected, str):
        return [selected]
    return None


def prepare_bulk_dataframe(df, request_data, resolve_column_name: Callable[[Any], Optional[str]]):
    try:
        rename_map = {}
        for column in list(df.columns):
            canonical = resolve_column_name(column)
            if canonical and canonical != column and canonical not in df.columns:
                rename_map[column] = canonical
        if rename_map:
            df = df.rename(columns=rename_map)
    except Exception:
        pass

    selected_cols = extract_selected_columns(request_data)
    if not selected_cols:
        return df, None

    force_keys = [
        "enrollment_no",
        "temp_enroll_no",
        "enrollment_id",
        "doc_rec_id",
        "prv_number",
        "mg_number",
        "final_no",
        "student_no",
    ]

    def resolve_selected_name(name: Any):
        canonical = resolve_column_name(name)
        if canonical and canonical in df.columns:
            return canonical
        if name in df.columns:
            return name
        lowered = str(name).strip().lower()
        for column in df.columns:
            try:
                if str(column).strip().lower() == lowered:
                    return column
            except Exception:
                continue
        return None

    keep = []
    for selected in selected_cols:
        resolved = resolve_selected_name(selected)
        if resolved and resolved not in keep:
            keep.append(resolved)
    for key in force_keys:
        if key in df.columns and key not in keep:
            keep.append(key)

    if keep:
        df = df.loc[:, [column for column in keep if column in df.columns]]
        selected_cols = [column for column in keep if column in df.columns]

    return df, selected_cols


def normalize_preview_number_columns(df):
    try:
        import pandas as pd
    except Exception:
        return df

    for column in list(df.columns):
        if not str(column).endswith("_number"):
            continue
        try:
            df[column] = df[column].apply(
                lambda value: int(value)
                if (
                    isinstance(value, int)
                    or (isinstance(value, float) and not pd.isna(value) and float(value).is_integer())
                )
                else value
            )
        except Exception:
            def format_value(value):
                try:
                    if value is None:
                        return value
                    text = str(value).strip()
                    if text.replace(".", "", 1).isdigit():
                        as_float = float(text)
                        if as_float.is_integer():
                            return int(as_float)
                except Exception:
                    return value
                return value

            df[column] = df[column].apply(format_value)

    return df


def sanitize_preview_value(value: Any) -> str:
    if value is None:
        return ""
    return str(value).replace("\r", " ").replace("\n", " ")


def build_preview_rows(df, selected_columns, limit: int = 50, pad_rec_no: bool = False):
    preview_df = df[selected_columns].head(limit).fillna("")
    if pad_rec_no and "rec_no" in preview_df.columns:
        def pad_rec_no_value(value):
            try:
                if value is None or (isinstance(value, str) and str(value).strip() == ""):
                    return ""
                number = int(float(value))
                return f"{number:06d}"
            except Exception:
                return sanitize_preview_value(value)

        preview_df["rec_no"] = preview_df["rec_no"].apply(pad_rec_no_value)

    return [list(map(sanitize_preview_value, row)) for row in preview_df.values.tolist()]


def detect_best_header_row(
    encoded_bytes: bytes,
    file_ext: Optional[str],
    sheet_name: Optional[str],
    read_workbook: Callable[..., Any],
    resolve_column_name: Callable[[Any], Optional[str]],
    max_header_row: int = 2,
):
    best_header = 0
    best_score = -1
    frames = None

    for try_header in range(max_header_row + 1):
        try:
            frames_try = read_workbook(encoded_bytes, file_ext=file_ext, sheet_name=None, header=try_header, nrows=0)
        except Exception:
            continue
        if sheet_name not in frames_try:
            continue

        columns = [str(column).strip() for column in frames_try[sheet_name].columns]
        usable = [column for column in columns if resolve_column_name(column)]
        score = len(usable)
        if score > best_score:
            best_score = score
            best_header = try_header
            frames = frames_try

    return best_header, frames