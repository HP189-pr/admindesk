from django.test import SimpleTestCase

from api.sheets_sync import _format_google_sheets_connection_error


class GoogleSheetsErrorFormattingTests(SimpleTestCase):
    def test_formats_dns_resolution_failure_for_google_auth(self):
        root = RuntimeError(
            "HTTPSConnectionPool(host='oauth2.googleapis.com', port=443): Max retries exceeded with url: /token "
            "(Caused by NameResolutionError(\"<urllib3.connection.HTTPSConnection object>: Failed to resolve "
            "'oauth2.googleapis.com' ([Errno 11001] getaddrinfo failed)\"))"
        )
        wrapper = RuntimeError("Unable to open sheet '1rlE1AAyL2ACodxFOG1CJz8yROxO3yBCT_p10lfih--o'")
        wrapper.__cause__ = root

        message = _format_google_sheets_connection_error(wrapper)

        self.assertIsNotNone(message)
        self.assertIn("oauth2.googleapis.com", message)
        self.assertIn("DNS resolution", message)

    def test_ignores_non_network_errors(self):
        message = _format_google_sheets_connection_error(RuntimeError("Worksheet not found."))

        self.assertIsNone(message)
