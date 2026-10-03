import pandas as pd
from datetime import date

from django.test import SimpleTestCase

from api.excel_import.helpers import parse_excel_date


class ExcelImportHelperTests(SimpleTestCase):
    def test_parse_excel_date_converts_nat_to_none(self):
        self.assertIsNone(parse_excel_date(pd.NaT))

    def test_parse_excel_date_keeps_valid_date_after_pandas_normalization(self):
        values = pd.Series([pd.Timestamp("2023-01-01"), pd.NaT])
        normalized = pd.to_datetime(values, errors="coerce", dayfirst=True).dt.date

        self.assertEqual(parse_excel_date(normalized.iloc[0]), date(2023, 1, 1))
        self.assertIsNone(parse_excel_date(normalized.iloc[1]))
