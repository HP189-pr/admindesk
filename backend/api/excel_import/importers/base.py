"""Base types shared by service-specific Excel importers."""

from dataclasses import dataclass
from typing import Any, Iterable, Optional, Protocol


@dataclass
class ImportContext:
    user: Any
    active_fields: Optional[Iterable[str]] = None
    request: Any = None
    selected_cols: Optional[Iterable[str]] = None
    auto_create_docrec: bool = False
    service: Optional[str] = None
    model: Any = None
    sheet_name: Optional[str] = None


@dataclass
class RowImportResult:
    status: str
    message: str
    ref: Any = None
    row_number: Optional[int] = None


class RowImporter(Protocol):
    def __call__(self, row: Any, context: ImportContext) -> RowImportResult:
        ...