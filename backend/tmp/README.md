Temporary files, inspection scripts, and one-off utilities
=========================================================

Place any temporary scripts, diagnostic tools, dry-run files, and ad-hoc utilities here.

Rules and conventions
- Keep only development or non-production files in this folder.
- Do NOT commit secrets, credentials, or service account JSONs. Place secrets in a secure secret manager instead.
- File names should be descriptive and prefixed when helpful, e.g. `tmp-`, `inspect-`, `diagnose-`, or `oneoff-`.
- If a file becomes stable/used by the app, move it to the appropriate source folder and update imports.

Example usage
- `backend/tmp/inspect_db_schema.py`
- `backend/tmp/tmp_migration_dryrun.csv`

If you want me to create or inspect temporary files in future, I'll always put them here by default.
