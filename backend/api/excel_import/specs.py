# backend/api/excel_import/specs.py
"""Backward-compatible facade for Excel import specs and registry helpers."""

from .column_mapper import (
    COLUMN_ALIAS_MAP,
    GENERIC_BULK_COLUMN_ALIAS_MAP,
    _build_allowed_maps,
    _normalize_name_key,
    _resolve_column_name,
    resolve_bulk_service_column_name,
    resolve_generic_bulk_column_name,
)
from .import_specs import IMPORT_SPECS, get_import_spec
from .registry import (
    BULK_SERVICE_MODEL_MAP,
    BULK_SERVICE_TEMPLATE_COLUMNS,
    get_admin_importer,
    get_bulk_importer,
    get_bulk_service_model,
    get_bulk_service_template_columns,
)

__all__ = [
    "IMPORT_SPECS",
    "COLUMN_ALIAS_MAP",
    "BULK_SERVICE_MODEL_MAP",
    "BULK_SERVICE_TEMPLATE_COLUMNS",
    "GENERIC_BULK_COLUMN_ALIAS_MAP",
    "_normalize_name_key",
    "get_import_spec",
    "_build_allowed_maps",
    "_resolve_column_name",
    "get_bulk_service_model",
    "get_bulk_service_template_columns",
    "resolve_generic_bulk_column_name",
    "resolve_bulk_service_column_name",
    "get_bulk_importer",
    "get_admin_importer",
]