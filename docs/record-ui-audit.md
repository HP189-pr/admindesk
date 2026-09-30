# Record page UI audit

Date: 2026-09-30
Scope: `src/pages/Record.jsx`, its `EnrollmentState` component, and scoped styles.

| Finding | Change |
| --- | --- |
| The full certificate table appeared before section navigation, pushing charts down the page. | Overview now leads with student and certificate cards; the comparison table has its own Certificates section. |
| Eleven filters competed for attention, and the batch multi-select was difficult to operate. | Search, institute, and main course remain visible. More filters expands the remaining fields, with checkbox selection for batches and removable filter chips. |
| Certificate cards were passive totals. | Each card toggles a certificate filter and displays its selected state. |
| Distributions stopped at ten groups. | Ranked distributions initially show six groups, with an option to explore every group. Gender and category distributions support filtering. |
| Long tables were difficult to scan. | Comparison groups support search and ranking. Student records have column controls, status badges, expandable details, bounded scrolling, and 25/50/100-row pagination. |
| Clickable chart marks and sorting headers lacked keyboard controls. | Chart points accept Enter/Space; sorting uses buttons with aria-sort. Focus indicators and reduced-motion support are included. |
| Search chips did not clear the text input. | Removing the search chip now clears the input and restores results. |
| Export failures shared the data-loading error state. | Export feedback is independent; failed downloads preserve the dashboard. |
| Controls inherited conflicting global styles. | Scoped styling and the existing search-field exemption keep the page consistent. |

## Verification

- Production build: `npm run build`.
- Headless Chrome checks at 1440px desktop and 390px mobile widths, using synthetic data in an isolated temporary preview.
- Verified filters expand, search debounces, chips clear, certificate cards filter, student details expand, pagination changes page size and page, and error retry recovers.
- Verified empty-result recovery, keyboard-focusable chart points, comparison navigation, PDF download, and export failure feedback without hiding data.
- No browser runtime exceptions or horizontal document overflow at the checked sizes. Wide student tables scroll within their own container.
- Existing authenticated API and export contracts are retained. Browser checks used synthetic data, not a signed-in production session. Existing table sorting remains limited to the current page and is explicitly labeled.

## Gender data follow-up

Gender now uses the enrollment profile first, then the latest linked degree record with an available gender (matched by enrollment number). Null, blank, whitespace, and NA/N/A/null/none/0 placeholders are treated as missing. If neither source has a value, the result is NA. M/Male, F/Female, and observed legacy spelling variants are normalized so charts and filters agree. The same resolved value drives filter options, breakdowns, student details, and Excel/PDF exports. This is a read-time fallback; stored enrollment/profile data is not overwritten.

Validation: focused tests cover profile priority, degree-only fallback, missing values, multiple degree rows, and normalization. Read-only integration checks verify gender filters and resolved gender in student details, Excel, and PDF source data.
