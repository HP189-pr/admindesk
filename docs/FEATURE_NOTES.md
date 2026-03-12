# Feature and Schema Notes

Last updated: March 12, 2026

This file keeps short implementation notes that were previously spread across separate root and backend markdown files.

## Student Search

The student search feature is implemented as:

- backend search view exposed through `/api/student-search/`
- frontend service helper in `src/services/studentSearchService.js`
- frontend page in `src/pages/student-search.jsx`
- dashboard and work-area integration so search can open from the dashboard shell

The feature is intended to surface general student information, service records, and fee context from one enrollment-based lookup flow.

## Enrollment Search Fix

Enrollment search behavior was improved by moving to a case-insensitive full-text-search setup that:

- normalizes tokens to lowercase
- uses prefix matching across tokens
- uses the PostgreSQL `simple` config for case-insensitive matching
- supports rebuilding enrollment search vectors through a management command when needed

This matters when search behavior is changed again, because token normalization and the search-vector config must stay aligned.

## Degree `dg_contact` Field

The degree module includes a `dg_contact` field for student contact numbers.

The change affected:

- the degree domain model
- serializers and bulk upload handling
- the Degree frontend page and table layout

If degree import or table rendering changes again, keep this field in both the API and UI shapes.

## Verification Model Alignment

The verification model was aligned with the live database schema to support:

- nullable document-count fields
- current varchar/nullability behavior
- `doc_rec_date` as a required sync-aware field
- serializer and view behavior that respects the aligned schema

This matters for bulk upload code, sync code, and any compatibility logic that still assumes the older field contract.

## Related Docs

- [docs/DATA_ANALYSIS.md](./DATA_ANALYSIS.md)
- [docs/MODELS_SCHEMA.md](./MODELS_SCHEMA.md)
- [docs/SYNC_PATTERNS.md](./SYNC_PATTERNS.md)