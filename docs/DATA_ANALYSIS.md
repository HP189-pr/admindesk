# Data Analysis and Reporting

Last updated: March 12, 2026

AdminDesk includes reporting and analysis workflows across student search, degree analysis, admin tooling, and PDF/export features.

## Current Analysis Surfaces

| Surface | Main files | Purpose |
| --- | --- | --- |
| Student search | `src/pages/student-search.jsx`, matching backend search endpoints | Search across student records and service-linked data |
| Dashboard quick status | `src/pages/Dashboard.jsx` | Surface recent operational counts and shortcuts |
| Admin analysis tools | `src/components/AdminDashboard.jsx` and child panels | Uploads, user tools, and analysis-oriented admin actions |
| Leave and operational reports | `backend/reports/`, leave-related pages, PDF exports | Reporting APIs and printable outputs |
| Degree-focused analysis | Degree page and related backend services | Filtering, deduplication, and academic output review |

## Student Search

The frontend exposes both an in-page search experience and a floating popup search. These rely on backend search endpoints and are intended for quick record lookup rather than batch analytics.

Use this area when you need:

- student profile lookup
- enrollment lookup
- service-record lookup tied to a student identifier

The current implementation and related search-fix history are summarized in [docs/FEATURE_NOTES.md](./FEATURE_NOTES.md).

## Degree and Service Analysis

The degree and related service modules support filtering and data review workflows that are closer to operational analytics than pure CRUD. Focused feature and schema notes are summarized in [docs/FEATURE_NOTES.md](./FEATURE_NOTES.md).

## Admin Dashboard Tools

`src/components/AdminDashboard.jsx` acts as the container for several heavy internal tools, such as:

- user management
- user-rights management
- module and course setup
- upload consoles
- analysis-oriented admin utilities

This area was one of the main frontend chunk hotspots and is now lazy-loaded through the dashboard shell.

## Exports and PDFs

Reporting outputs are split across frontend and backend responsibilities.

- Backend-generated PDFs: institutional verification and CCTV-style reports
- Frontend-generated exports: `jspdf`, `jspdf-autotable`, and spreadsheet helpers on relevant pages

## When To Update This Guide

Update this file when:

- a new reporting surface is added
- a heavy admin analysis tool is introduced
- export libraries or reporting ownership move between frontend and backend
- search behavior changes in a way that affects how operations teams find records

## Related Docs

- [docs/FRONTEND_GUIDE.md](./FRONTEND_GUIDE.md)
- [docs/BACKEND_API.md](./BACKEND_API.md)
- [docs/GOOGLE_SHEETS_SYNC.md](./GOOGLE_SHEETS_SYNC.md)
- [docs/FEATURE_NOTES.md](./FEATURE_NOTES.md)
