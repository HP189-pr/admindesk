API Architecture Overview (Modularization Progress)
=================================================

Context
-------
The monolithic `views.py` file has been split incrementally to improve maintainability, testability, and clarity.

Completed Steps (1–4)
---------------------
1. Auth / User / Navigation Extraction
   - Moved login, JWT issuance, password change/verify, profile operations, admin panel password check,
     navigation (module/menu/rights aggregation), and basic user CRUD into `views_auth.py`.
   - Original names (e.g. `userlogin`, `my-navigation`) preserved in `api/urls.py`.

2. Course / Enrollment Domain Extraction
   - Created `views_courses.py` with module/menu/user-permission, institute, course (main/sub), course offering,
     and enrollment viewsets.
   - Router now imports these viewsets from `views_courses` instead of the transitional `views`.

3. Legacy / Unused File Removal
   - Removed deprecated: `views_pages.py`, `urls_page.py`, `ChangePasswordForm.py`, `auth_backends.py`.
   - Confirmed no references remained in `settings.py`, `urls.py`, or codebase before deletion.

4. Basic API Smoke Tests Added
   - `tests_api_basic.py` verifies login, navigation shape, and enrollment listing (pagination wrapper keys).
   - Complements existing model-level smoke tests in `tests_smoke.py`.

Current File Roles
------------------
`views_auth.py`      : Authentication, profile, navigation, and user CRUD endpoints.
`views_courses.py`   : Course/institute/enrollment related viewsets.
`views.py`           : Remaining domains (DocRec, Verification, Migration, Provisional, InstVerification, ECA,
                       bulk upload, data analysis, student profile) – slated for further extraction.
`serializers_*.py`   : Domain‑segmented serializer modules re-exported via `serializers.py`.
`domain_*.py`        : Domain‑segmented model definitions re-exported via `models.py` facade.

Planned Next Extractions
------------------------
`views_records.py`   : DocRec, MigrationRecord, ProvisionalRecord, Eca, StudentProfile.
`views_verification.py` : Verification + institutional verification (main & student) viewsets.
`views_bulk.py`      : Bulk upload & data analysis services (with hardened validation & size limits).

Backward Compatibility Strategy
--------------------------------
- `api/urls.py` imports each new module explicitly; route names unchanged.
- `views.py` re-imports extracted classes for any legacy imports relying on `from api import views` (until a
  final cleanup removes that requirement).

Testing
-------
Run both smoke suites:
  python manage.py test api.tests_smoke -v 2
  python manage.py test api.tests_api_basic -v 2

Guidelines for Future Modules
-----------------------------
1. Keep each thematic file below ~400 lines.
2. Co-locate only tightly-related viewsets (avoid grab-bags).
3. Minimize cross-module imports; prefer shared utilities placed in `utils.py` (or a new `services/` package) if reused.
4. Add a minimal test for every new public endpoint (status code + essential response keys).

Bulk Upload Hardening (Upcoming)
--------------------------------
Planned enhancements once moved to `views_bulk.py`:
  - Enforce max file size (e.g., 5MB) server-side before reading.
  - Restrict accepted content types to Excel (xlsx) only.
  - Column whitelist & reject unexpected columns early.
  - Row cap on preview (already 100) plus configurable upper limit on confirm.
  - Structured per-row error codes for easier frontend mapping.

Changelog (Recent)
------------------
2025-10-04: Initial modularization (auth + courses), removed deprecated files, added basic API tests.

Ownership & Maintenance
-----------------------
Maintain consistency by following these naming conventions:
  View modules: `views_<domain>.py`
  Serializer modules: `serializers_<domain>.py`
  Domain models: `domain_<domain>.py`

Questions / Improvements
------------------------
Potential next improvements: rate limiting login attempts, caching navigation payload, adding OpenAPI schema generation.

End of document.