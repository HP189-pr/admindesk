"""Small shared validation and row-scope helpers for importers."""

from typing import Any, Iterable, Optional, Set


def field_scope(row: Any, active_fields: Optional[Iterable[str]] = None) -> Set[str]:
    if active_fields is not None:
        return {str(field) for field in active_fields}
    return {str(field) for field in getattr(row, "index", [])}


def has_field(field_name: str, row: Any, active_fields: Optional[Iterable[str]] = None) -> bool:
    return field_name in field_scope(row, active_fields)