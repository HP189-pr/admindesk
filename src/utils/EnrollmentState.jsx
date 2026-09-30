import React, { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BarChart3, BookOpen, Building2, CalendarRange, Download, Filter, Layers3, RefreshCw, RotateCcw, Search, Table2, TrendingUp, Users, ArrowUpRight, ArrowDownUp, Award, Check, ChevronDown, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, SlidersHorizontal, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import API from '../api/axiosInstance';
import './EnrollmentState.css';
import { getEnrollmentAnalytics } from '../services/enrollmentservice';

const numberFormat = new Intl.NumberFormat();
const DEFAULT_FILTERS = { mainCourse: '', subCourse: '', department: '', yearFrom: '', yearTo: '', batches: [], search: '', gender: '', category: '', certificate: '', status: '' };
const EMPTY = {
  breakdowns: {},
  summary: { total: 0, main_courses: 0, sub_courses: 0, departments: 0, active_batches: 0, year_from: null, year_to: null },
  issuance: { degree: 0, provisional: 0, migration: 0, verification: 0 },
  options: { batches: [], courses: [], subcourses: [], departments: [], genders: [], categories: [] },
  trend: [], courses: [], subcourses: [], departments: [], years: [], heatmap: [], matrix: [],
  records: { results: [], count: 0, page: 1, page_size: 25, pages: 0 },
};
const VIEWS = [
  ['overview', 'Overview'], ['certificates', 'Certificates'], ['trend', 'Year Trend'], ['course', 'Main Course'],
  ['subcourse', 'Sub Course'], ['department', 'Institute'], ['records', 'Records'],
];

const buildParams = (filters, page = 1, pageSize = 25) => {
  const params = new URLSearchParams();
  const values = {
    main_course: filters.mainCourse, sub_course: filters.subCourse, department: filters.department,
    year_from: filters.yearFrom, year_to: filters.yearTo, gender: filters.gender, category: filters.category, search: filters.search, certificate: filters.certificate, status: filters.status,
  };
  Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value); });
  (filters.batches || []).forEach((batch) => params.append('batch', batch));
  params.set('page', String(page));
  params.set('page_size', String(pageSize));
  return params;
};
const formatTotal = (value) => numberFormat.format(Number(value || 0));
const findLabel = (options, value) => options.find((item) => String(item.value) === String(value))?.label || value;

const CERTIFICATES = [
  { key: 'degree', label: 'Degree records', short: 'Degree', icon: Award, tone: 'violet' },
  { key: 'provisional', label: 'Provisional issued', short: 'Provisional', icon: FileText, tone: 'blue' },
  { key: 'migration', label: 'Migration issued', short: 'Migration', icon: ArrowUpRight, tone: 'teal' },
  { key: 'verification', label: 'Verification completed', short: 'Verification', icon: CheckCircle2, tone: 'amber' },
];
const CERTIFICATE_OPTIONS = [...CERTIFICATES.map(({ key, label }) => ({ value: key, label })), { value: 'any', label: 'Any certificate record' }, { value: 'none', label: 'No certificate records' }];
const Panel = ({ title, subtitle, icon: Icon, children, className = '', action }) => (
  <section className={`ea-panel ${className}`}>
    {title && <div className="ea-panel-heading"><div className="ea-heading-copy">
      {Icon && <span className="ea-heading-icon"><Icon size={18} aria-hidden="true" /></span>}
      <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
    </div>{action}</div>}
    {children}
  </section>
);
const EmptyState = ({ message = 'No students match these filters.' }) => <div className="ea-empty"><Search size={25} aria-hidden="true" /><p>{message}</p></div>;
const Skeleton = () => <div className="ea-skeleton" aria-hidden="true"><div /><div /><div /></div>;
const FilterSelect = ({ label, value, onChange, options, allowAll = true }) => (
  <label className="ea-field"><span>{label}</span><select value={value} onChange={event => onChange(event.target.value)}>
    {allowAll && <option value="">All</option>}{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select></label>
);

const TrendChart = ({ points, mode, setMode, selectYear }) => {
  if (!points.length) return <EmptyState />;
  const max = Math.max(...points.map((point) => point.total), 1);
  const peak = points.reduce((best, point) => point.total > best.total ? point : best, points[0]);
  const average = Math.round(points.reduce((sum, point) => sum + point.total, 0) / points.length);
  const width = 760; const height = 220; const left = 42; const right = 18; const top = 18; const bottom = 34;
  const chartWidth = width - left - right; const chartHeight = height - top - bottom;
  const x = (index) => left + (points.length === 1 ? chartWidth / 2 : index / (points.length - 1) * chartWidth);
  const y = (value) => top + chartHeight - value / max * chartHeight;
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(point.total)}`).join(' ');
  return <div className="p-4"><div className="mb-2 flex justify-end"><div className="inline-flex rounded-lg border border-slate-200 p-0.5" role="group" aria-label="Chart type">{['line', 'bar'].map((item) => <button type="button" key={item} aria-pressed={mode === item} onClick={() => setMode(item)} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${mode === item ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>{item === 'line' ? 'Line' : 'Bar'}</button>)}</div></div><div className="overflow-x-auto"><svg viewBox={`0 0 ${width} ${height}`} className="h-auto min-w-[560px] w-full" role="group" aria-label="Enrollment by year. Select a point to filter.">
    {[0, 0.5, 1].map((fraction) => <line key={fraction} x1={left} x2={width - right} y1={y(max * fraction)} y2={y(max * fraction)} stroke="#e2e8f0" strokeDasharray="4 5" />)}
    <text x="8" y={y(max) + 4} className="fill-slate-400 text-[10px]">{formatTotal(max)}</text><text x="14" y={y(0) + 4} className="fill-slate-400 text-[10px]">0</text>
    {mode === 'bar' && points.map((point, index) => <rect key={point.year} x={x(index) - Math.max(3, chartWidth / points.length / 3)} y={y(point.total)} width={Math.max(6, chartWidth / points.length / 1.8)} height={Math.max(1, y(0) - y(point.total))} rx="4" className="cursor-pointer fill-sky-500 hover:fill-sky-700" role="button" tabIndex={0} aria-label={`${point.year}: ${formatTotal(point.total)} students. Filter this year.`} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectYear(point.year); } }} onClick={() => selectYear(point.year)}><title>{`${point.year}: ${formatTotal(point.total)}`}</title></rect>)}
    {mode === 'line' && <path d={path} fill="none" stroke="#0284c7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
    {mode === 'line' && points.map((point, index) => <circle key={point.year} cx={x(index)} cy={y(point.total)} r="5" className="cursor-pointer fill-white stroke-sky-600 stroke-2 hover:fill-sky-100" role="button" tabIndex={0} aria-label={`${point.year}: ${formatTotal(point.total)} students. Filter this year.`} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectYear(point.year); } }} onClick={() => selectYear(point.year)}><title>{`${point.year}: ${formatTotal(point.total)}`}</title></circle>)}
    {points.map((point, index) => <text key={`label-${point.year}`} x={x(index)} y={height - 10} textAnchor="middle" className="cursor-pointer fill-slate-500 text-[10px]" role="button" tabIndex={0} aria-label={`${point.year}: ${formatTotal(point.total)} students. Filter this year.`} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectYear(point.year); } }} onClick={() => selectYear(point.year)}>{point.year}</text>)}
  </svg></div><div className="ea-trend-insights"><button onClick={() => selectYear(peak.year)}><span>Largest admission batch</span><strong>{peak.year}<ArrowUpRight size={14} /></strong><small>{formatTotal(peak.total)} students</small></button><div><span>Average batch size</span><strong>{formatTotal(average)}</strong><small>Across {points.length} admission years in view</small></div></div></div>;
};

const Distribution = ({ items, onSelect, emptyLabel }) => {
  const [expanded, setExpanded] = useState(false);
  if (!items.length) return <EmptyState message={emptyLabel} />;
  const max = Math.max(...items.map(item => item.total), 1);
  const total = items.reduce((sum, item) => sum + item.total, 0);
  return <div className="ea-distribution">{(expanded ? items : items.slice(0, 6)).map((item, index) => (
    <button key={item.value} type="button" onClick={() => onSelect(item.value)} className="ea-rank" title={`Filter by ${item.label}`}>
      <span className="ea-rank-number">{String(index + 1).padStart(2, '0')}</span>
      <span className="ea-rank-content"><span className="ea-rank-label"><span>{item.label}</span><strong>{formatTotal(item.total)} <small>{total ? (item.total / total * 100).toFixed(1) : 0}%</small></strong></span>
        <span className="ea-track"><span style={{ width: `${Math.max(1, item.total / max * 100)}%` }} /></span>
      </span><ChevronRight size={15} aria-hidden="true" />
    </button>
  ))}{items.length > 6 && <button className="ea-text-button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>{expanded ? 'Show less' : `Explore all ${items.length} groups`}<ChevronDown size={14} /></button>}</div>;
};

const Heatmap = ({ mainRows, matrixRows, years, mode, setMode, selectCell }) => {
  const rows = mode === 'main' ? mainRows : matrixRows.map((row) => ({ value: row.subcourse_name, label: row.subcourse_name, values: row.values }));
  if (!rows.length || !years.length) return <EmptyState />;
  const max = Math.max(...rows.flatMap((row) => years.map((year) => Number(row.values?.[year] || 0))), 1);
  return <div className="overflow-auto p-4"><div className="mb-3 flex justify-end"><div className="inline-flex rounded-lg border border-slate-200 p-0.5" role="group" aria-label="Heatmap dimension"><button type="button" aria-pressed={mode === 'main'} onClick={() => setMode('main')} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${mode === 'main' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>Main Course</button><button type="button" aria-pressed={mode === 'sub'} onClick={() => setMode('sub')} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${mode === 'sub' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>Sub Course</button></div></div><table className="min-w-max border-separate border-spacing-1 text-xs"><thead><tr><th className="sticky left-0 z-10 bg-white px-2 py-1 text-left font-semibold text-slate-600">{mode === 'main' ? 'Course' : 'Sub Course'}</th>{years.map((year) => <th key={year} className="px-2 py-1 font-semibold text-slate-500">{year}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.value}><th className="sticky left-0 z-10 whitespace-nowrap bg-white px-2 py-1 text-left font-medium text-slate-700">{row.label}</th>{years.map((year) => { const value = Number(row.values?.[year] || 0); return <td key={year}><button type="button" title={`${row.label}, ${year}: ${value}`} onClick={() => selectCell(mode, row.value, year)} className="h-8 min-w-10 rounded-md px-2 tabular-nums transition hover:ring-2 hover:ring-sky-400" style={{ backgroundColor: `rgba(14, 116, 144, ${value ? 0.12 + value / max * 0.75 : 0.04})`, color: value / max > 0.5 ? 'white' : '#334155' }}>{value}</button></td>; })}</tr>)}</tbody></table></div>;
};

const EnrollmentState = () => {
  const [exporting, setExporting] = useState('');
  const [notice, setNotice] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pageSize, setPageSize] = useState(25);
  const [expandedStudent, setExpandedStudent] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [groupSearch, setGroupSearch] = useState('');
  const [groupMetric, setGroupMetric] = useState('students');
  const [groupBy, setGroupBy] = useState('Institute');
  const [analytics, setAnalytics] = useState(EMPTY);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState(''); const [page, setPage] = useState(1); const [view, setView] = useState('overview');
  const [recordsView, setRecordsView] = useState('records'); const [trendMode, setTrendMode] = useState('line'); const [heatmapMode, setHeatmapMode] = useState('main');
  const [sort, setSort] = useState({ key: 'batch', direction: 'desc' }); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [refreshKey, setRefreshKey] = useState(0);
  const [visibleColumns, setVisibleColumns] = useState({ enrollment_no: true, student_name: true, main_course: true, sub_course: true, department: true, batch: true, status: true, gender: false, category: false, degree: true, provisional: true, migration: true, verification: true });

  useEffect(() => {
    if (searchInput.trim() === filters.search) return;
    const timer = setTimeout(() => { setPage(1); setFilters(current => ({ ...current, search: searchInput.trim() })); }, 350);
    return () => clearTimeout(timer);
  }, [searchInput, filters.search]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    getEnrollmentAnalytics(buildParams(filters, page, pageSize), { signal: controller.signal })
      .then((data) => { if (controller.signal.aborted) return; setUpdatedAt(new Date()); setAnalytics({ ...EMPTY, ...data, options: { ...EMPTY.options, ...(data.options || {}) }, records: { ...EMPTY.records, ...(data.records || {}) } }); })
      .catch((err) => { if (err?.code === 'ERR_CANCELED' || controller.signal.aborted) return; setError(err?.response?.status === 404 ? 'Analytics endpoint is unavailable. Restart the backend to load the updated route.' : err?.response?.data?.detail || 'Unable to load enrollment analytics. Please retry.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, page, pageSize, refreshKey]);

  const setFilter = (key, value) => { setPage(1); setFilters((current) => ({ ...current, [key]: value, ...(key === 'mainCourse' ? { subCourse: '' } : {}) })); };
  const resetFilters = () => { setPage(1); setSearchInput(''); setFilters(DEFAULT_FILTERS); };
  const selectYear = (year) => { setFilter('yearFrom', String(year)); setFilter('yearTo', String(year)); };
  const selectCell = (mode, value, year) => { if (mode === 'main') setFilter('mainCourse', value); else { const option = analytics.options.subcourses.find((item) => item.label === value); if (option) setFilter('subCourse', option.value); } selectYear(year); };
  const exportReport = async (format) => {
    setExporting(format); setNotice(null);
    try {
      const params = buildParams(filters, 1);
      params.set('export', format === 'excel' ? 'excel' : 'json');
      if (format === 'excel') {
        const response = await API.get('/api/enrollment-analytics/', { params, responseType: 'blob', timeout: 120000 });
        const url = window.URL.createObjectURL(response.data);
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'Enrollment_Analytics.xlsx';
        document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      } else {
        const data = await getEnrollmentAnalytics(params);
        const doc = new jsPDF({ orientation: 'landscape', format: 'a3' });
        doc.text('Student and Certificate Analytics', 14, 14);
        const filterText = doc.splitTextToSize(`Filters: ${Array.from(buildParams(filters).entries()).filter(([key]) => !['page', 'page_size'].includes(key)).map(([key, value]) => `${key}: ${value}`).join(', ') || 'All records'}`, 390);
        doc.setFontSize(9); doc.text(filterText, 14, 22);
        autoTable(doc, { startY: 26 + filterText.length * 4, head: [['Students', 'Degree records', 'Provisional issued', 'Migration issued', 'Verification completed']], body: [[data.summary.total, ...['degree', 'provisional', 'migration', 'verification'].map(key => data.issuance[key])]] });
        for (const [name, rows] of Object.entries(data.breakdowns || {})) {
          doc.addPage(); doc.text(name, 14, 14);
          autoTable(doc, { startY: 20, head: [[name, 'Students', 'Degree', 'Provisional', 'Migration', 'Verification']], body: rows.map(row => [row.group, row.students, row.degree, row.provisional, row.migration, row.verification]), styles: { fontSize: 8 } });
        }
        doc.addPage(); doc.text('Filtered Student Records', 14, 14);
        autoTable(doc, { startY: 20, head: [columns.map(([, label]) => label)], body: data.records.results.map(row => columns.map(([key]) => row[key] ?? 'NA')), styles: { fontSize: 7 } });
        doc.save('Enrollment_Analytics.pdf');
      }
          setNotice({ type: 'success', text: `${format === 'excel' ? 'Excel' : 'PDF'} report prepared. Your download is ready.` });
    } catch { setNotice({ type: 'error', text: 'Export could not be prepared. Please try again.' }); }
    finally { setExporting(''); }
  };
  const exportExcel = () => exportReport('excel');
  const updateSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }));
  const sortedRecords = useMemo(() => [...(analytics.records.results || [])].sort((left, right) => { const a = String(left[sort.key] ?? '').toLowerCase(); const b = String(right[sort.key] ?? '').toLowerCase(); const result = a.localeCompare(b, undefined, { numeric: true }); return sort.direction === 'asc' ? result : -result; }), [analytics.records.results, sort]);
  const chips = [...['gender', 'category', 'certificate', 'status', 'search'].map(key => filters[key] && [key[0].toUpperCase() + key.slice(1), key === 'certificate' ? findLabel(CERTIFICATE_OPTIONS, filters[key]) : filters[key], key]), filters.mainCourse && ['Main Course', findLabel(analytics.options.courses, filters.mainCourse), 'mainCourse'], filters.subCourse && ['Sub Course', findLabel(analytics.options.subcourses, filters.subCourse), 'subCourse'], filters.department && ['Institute', findLabel(analytics.options.departments, filters.department), 'department'], (filters.yearFrom || filters.yearTo) && ['Years', `${filters.yearFrom || 'All'} - ${filters.yearTo || 'All'}`, 'years'], filters.batches.length && ['Batch', filters.batches.join(', '), 'batches']].filter(Boolean);
  const columns = [['enrollment_no', 'Enrollment No'], ['student_name', 'Student'], ['main_course', 'Main Course'], ['sub_course', 'Sub Course'], ['department', 'Institute'], ['batch', 'Year'], ['status', 'Admission Status'], ['gender', 'Gender'], ['category', 'Category'], ['degree', 'Degree Records'], ['provisional', 'Provisional Issued'], ['migration', 'Migration Issued'], ['verification', 'Verification Completed']];

  const removeFilter = key => {
    if (key === 'search') { setSearchInput(''); setFilter('search', ''); }
    else if (key === 'years') { setFilter('yearFrom', ''); setFilter('yearTo', ''); }
    else setFilter(key, key === 'batches' ? [] : '');
  };
  const pendingSearch = searchInput.trim() !== filters.search;
  const busy = loading || pendingSearch;
  const canExport = !busy && !exporting && !error && analytics.summary.total > 0;
  const showData = !error && updatedAt && analytics.summary.total > 0;
  const displayedColumns = columns.filter(([key]) => visibleColumns[key]);
  const groupedRows = [...(analytics.breakdowns[groupBy] || [])]
    .filter(row => String(row.group).toLowerCase().includes(groupSearch.toLowerCase()))
    .sort((a, b) => Number(b[groupMetric]) - Number(a[groupMetric]));
  const yearOptions = analytics.options.batches.map(value => ({ value, label: value }));
  const demographicItems = name => (analytics.breakdowns[name] || []).map(row => ({ value: row.group, label: String(row.group), total: row.students }));
  const groupMaximum = Math.max(...groupedRows.map(item => Number(item[groupMetric])), 1);
  const selectView = next => { setView(next); setExpandedStudent(null); };

  return <div className="enrollment-analytics">
    <header className="ea-hero">
      <div className="ea-hero-copy"><span className="ea-eyebrow"><span />Office records / Intelligence</span>
        <h1>Enrollment analytics<span>.</span></h1>
        <p>A closer look at your students, admissions and certificates.</p>
        <div className="ea-hero-meta"><span><CalendarRange size={14} />{analytics.summary.year_from ? `${analytics.summary.year_from} - ${analytics.summary.year_to}` : 'All admission years'}</span><span><Building2 size={14} />{updatedAt ? `${formatTotal(analytics.summary.departments)} institutes in view` : 'Connecting to records'}</span></div>
      </div>
      <div className="ea-hero-actions"><div className="ea-actions">
        <button type="button" className="ea-button ea-button-light" disabled={loading} onClick={() => setRefreshKey(value => value + 1)}><RefreshCw size={15} className={loading ? 'ea-spin' : ''} />Refresh</button>
        <button type="button" className="ea-button ea-button-light" disabled={!canExport} onClick={() => exportReport('pdf')}><FileText size={15} />{exporting === 'pdf' ? 'Preparing PDF...' : 'PDF'}</button>
        <button type="button" className="ea-button ea-button-mint" disabled={!canExport} onClick={exportExcel}><FileSpreadsheet size={16} />{exporting === 'excel' ? 'Preparing Excel...' : 'Export Excel'}</button>
      </div><p role="status" aria-live="polite">{busy ? 'Updating your view...' : error ? 'Unable to update records' : updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} / Exports include all filtered students` : 'Loading records...'}</p></div>
    </header>

    {notice && <div className={`ea-notice ${notice.type}`} role="status"><span>{notice.type === 'success' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}{notice.text}</span><button className="ea-icon-button" aria-label="Dismiss export message" onClick={() => setNotice(null)}><X size={16} /></button></div>}

    <section className="ea-panel ea-filter-panel" aria-label="Filter students">
      <div className="ea-primary-filters">
        <label className="ea-search"><Search size={18} /><input className="search-field-input" aria-label="Search students by name or enrollment" placeholder="Search name or enrollment number" value={searchInput} onChange={event => setSearchInput(event.target.value)} />{searchInput && <button className="ea-icon-button" onClick={() => setSearchInput('')} aria-label="Clear search"><X size={15} /></button>}</label>
        <FilterSelect label="Institute" value={filters.department} onChange={value => setFilter('department', value)} options={analytics.options.departments} />
        <FilterSelect label="Main course" value={filters.mainCourse} onChange={value => setFilter('mainCourse', value)} options={analytics.options.courses} />
        <button className={`ea-button ea-filter-toggle ${filtersOpen ? 'is-active' : ''}`} onClick={() => setFiltersOpen(value => !value)} aria-expanded={filtersOpen} aria-controls="analytics-filters"><SlidersHorizontal size={17} />More filters{chips.length > 0 && <span className="ea-count">{chips.length}</span>}<ChevronDown size={14} /></button>
      </div>
      {filtersOpen && <div id="analytics-filters" className="ea-advanced-filters">
        <div className="ea-filter-grid">
          <FilterSelect label="Sub course" value={filters.subCourse} onChange={value => setFilter('subCourse', value)} options={analytics.options.subcourses} />
          <FilterSelect label="Gender" value={filters.gender} onChange={value => setFilter('gender', value)} options={analytics.options.genders.map(value => ({ value, label: value }))} />
          <FilterSelect label="Category" value={filters.category} onChange={value => setFilter('category', value)} options={analytics.options.categories.map(value => ({ value, label: value }))} />
          <FilterSelect label="Certificate" value={filters.certificate} onChange={value => setFilter('certificate', value)} options={CERTIFICATE_OPTIONS} />
          <FilterSelect label="Admission status" value={filters.status} onChange={value => setFilter('status', value)} options={[{ value: 'active', label: 'Active' }, { value: 'cancelled', label: 'Cancelled' }]} />
          <FilterSelect label="Admission year from" value={filters.yearFrom} onChange={value => setFilter('yearFrom', value)} options={yearOptions} />
          <FilterSelect label="Admission year to" value={filters.yearTo} onChange={value => setFilter('yearTo', value)} options={yearOptions} />
          <details className="ea-batch-picker"><summary>Admission batches <span>{filters.batches.length ? `${filters.batches.length} selected` : 'All batches'}<ChevronDown size={14} /></span></summary><div className="ea-batch-options">{analytics.options.batches.map(batch => <label key={batch}><input type="checkbox" checked={filters.batches.includes(String(batch))} onChange={event => setFilter('batches', event.target.checked ? [...filters.batches, String(batch)] : filters.batches.filter(value => value !== String(batch)))} />{batch}</label>)}</div></details>
        </div><p className="ea-filter-hint">Filters apply together. Years refer to admission batches; gender uses enrollment data first, then linked degree data. Missing values appear as NA.</p>
      </div>}
      {chips.length > 0 && <div className="ea-filter-chips"><span>Filtered by</span>{chips.map(([label, value, key]) => <button key={key} className="ea-chip" title={`Remove ${label} filter`} onClick={() => removeFilter(key)}>{label}: {value}<X size={12} /></button>)}<button className="ea-text-button" onClick={resetFilters}><RotateCcw size={13} />Reset all</button></div>}
    </section>

    {error && <div className="ea-notice error" role="alert"><span><AlertCircle size={19} />{error}</span><button className="ea-button" onClick={() => setRefreshKey(value => value + 1)}>Try again</button></div>}
    <div className="ea-workspace" aria-busy={busy}>
      <div className="ea-stats">
        <button className="ea-stat ea-stat-primary" onClick={() => { selectView('records'); setRecordsView('records'); }} disabled={!showData || busy}>
          <span className="ea-stat-top"><span>Students in view</span><Users size={19} /></span><strong>{error ? '--' : updatedAt ? formatTotal(analytics.summary.total) : '...'}</strong>
          <span className="ea-stat-foot">{chips.length ? 'Matching your filters' : 'Across all admissions'}<ArrowUpRight size={17} /></span>
        </button>
        {CERTIFICATES.map(({ key, label, icon: Icon, tone }) => <button key={key} className={`ea-stat ea-stat-${tone} ${filters.certificate === key ? 'is-selected' : ''}`} disabled={!updatedAt || busy || !!error} aria-pressed={filters.certificate === key} onClick={() => setFilter('certificate', filters.certificate === key ? '' : key)}>
          <span className="ea-stat-top"><span>{label}</span><Icon size={19} /></span><strong>{error ? '--' : updatedAt ? formatTotal(analytics.issuance[key]) : '...'}</strong><span className="ea-stat-foot">{filters.certificate === key ? 'Selected - click to clear' : 'Filter students'}{filters.certificate === key ? <Check size={15} /> : <ArrowUpRight size={15} />}</span>
        </button>)}
      </div>
      <div className="ea-viewbar"><nav aria-label="Analytics sections">{VIEWS.map(([value, label]) => <button key={value} onClick={() => selectView(value)} aria-current={view === value ? 'page' : undefined} className={view === value ? 'is-active' : ''}>{label}{value === 'records' && updatedAt && <span>{formatTotal(analytics.records.count)}</span>}</button>)}</nav><span className="ea-update-indicator" role="status">{busy ? <><RefreshCw size={13} className="ea-spin" />Updating</> : <><span />{chips.length ? 'Filtered view' : 'All records'}</>}</span></div>

      {loading ? <div className="ea-chart-grid"><Skeleton /><Skeleton /></div> : error ? null : !analytics.summary.total ? <Panel><EmptyState /><div className="ea-empty-action"><p>Try a different search or remove a filter to broaden your results.</p><button className="ea-button ea-button-dark" onClick={resetFilters}><RotateCcw size={15} />Clear all filters</button></div></Panel> : <>
        {view === 'overview' && <div className="ea-context-strip"><span><BookOpen size={16} /><strong>{analytics.summary.main_courses}</strong> main courses</span><span><Layers3 size={16} /><strong>{analytics.summary.sub_courses}</strong> sub courses</span><span><CalendarRange size={16} /><strong>{analytics.summary.active_batches}</strong> admission batches</span><button className="ea-text-button" onClick={() => selectView('certificates')}>Compare certificate activity<ArrowUpRight size={14} /></button></div>}
        {(view === 'overview' || view === 'trend' || view === 'course') && <div className={view === 'overview' ? 'ea-chart-grid' : ''}>
          {(view === 'overview' || view === 'trend') && <Panel title="Admissions over time" subtitle="Select a year to explore its students." icon={TrendingUp}><TrendChart points={analytics.trend} mode={trendMode} setMode={setTrendMode} selectYear={selectYear} /></Panel>}
          {(view === 'overview' || view === 'course') && <Panel title="Main course distribution" subtitle="Select any course to narrow your view." icon={BookOpen}><Distribution items={analytics.courses} onSelect={value => setFilter('mainCourse', value)} /></Panel>}
        </div>}
        {(view === 'overview' || view === 'department' || view === 'subcourse') && <div className={view === 'overview' ? 'ea-chart-grid' : ''}>
          {(view === 'overview' || view === 'department') && <Panel title="Institute comparison" subtitle="Ranked by students in the current view." icon={Building2}><Distribution items={analytics.departments} onSelect={value => setFilter('department', value)} /></Panel>}
          {(view === 'overview' || view === 'subcourse') && <Panel title="Sub course distribution" subtitle="Explore the courses behind your admissions." icon={Layers3}><Distribution items={analytics.subcourses} onSelect={value => setFilter('subCourse', value)} /></Panel>}
        </div>}
        {view === 'overview' && <div className="ea-chart-grid"><Panel title="Gender distribution" subtitle="Enrollment gender first, then degree records. NA if neither is available." icon={Users}><Distribution items={demographicItems('Gender')} onSelect={value => setFilter('gender', value)} /></Panel><Panel title="Category distribution" subtitle="Select a category to explore its students." icon={BarChart3}><Distribution items={demographicItems('Category')} onSelect={value => setFilter('category', value)} /></Panel></div>}
        {['trend', 'course', 'subcourse'].includes(view) && <Panel title="Course & year explorer" subtitle="Select a cell to apply both filters." icon={Table2}><Heatmap mainRows={analytics.heatmap} matrixRows={analytics.matrix} years={analytics.years} mode={heatmapMode} setMode={setHeatmapMode} selectCell={selectCell} /></Panel>}

        {view === 'certificates' && <Panel title="Certificate comparison" subtitle="Compare recorded certificates alongside student totals." icon={Award}>
          <div className="ea-comparison-controls"><FilterSelect label="Group by" value={groupBy} allowAll={false} onChange={value => { setGroupBy(value); setGroupSearch(''); }} options={Object.keys(analytics.breakdowns).map(value => ({ value, label: value }))} /><FilterSelect label="Rank by" value={groupMetric} allowAll={false} onChange={setGroupMetric} options={[{ value: 'students', label: 'Students' }, ...CERTIFICATES.map(({ key, label }) => ({ value: key, label }))]} /><label className="ea-search"><Search size={16} /><input className="search-field-input" aria-label="Search comparison groups" placeholder={`Find ${groupBy.toLowerCase()}...`} value={groupSearch} onChange={event => setGroupSearch(event.target.value)} /></label></div>
          <div className="ea-table-scroll"><table className="ea-table"><thead><tr><th>{groupBy}</th><th className="ea-numeric">Students</th>{CERTIFICATES.map(({ key, label }) => <th key={key} className="ea-numeric">{label}</th>)}</tr></thead><tbody>{groupedRows.map(row => <tr key={row.group}><th><span className="ea-group-label">{row.group}</span><span className="ea-track"><span style={{ width: `${Math.max(1, row[groupMetric] / groupMaximum * 100)}%` }} /></span></th>{['students', ...CERTIFICATES.map(item => item.key)].map(key => <td key={key} className={`ea-numeric ${groupMetric === key ? 'ea-emphasis' : ''}`}>{formatTotal(row[key])}</td>)}</tr>)}</tbody><tfoot><tr><th>{groupSearch ? 'Matching groups total' : 'Total'}</th>{['students', ...CERTIFICATES.map(item => item.key)].map(key => <td key={key} className="ea-numeric">{formatTotal(groupedRows.reduce((sum, row) => sum + Number(row[key] || 0), 0))}</td>)}</tr></tfoot></table>{!groupedRows.length && <EmptyState message="No groups match your search." />}</div>
          <p className="ea-footnote">One student can have multiple certificates. Degree totals count registered degree records; issuance status is not available in the degree register.</p>
        </Panel>}

        {view === 'records' && <Panel title="Student records" subtitle="Explore individual students and their linked certificates." icon={Table2} action={<span className="ea-total-badge">{formatTotal(analytics.records.count)} students</span>}>
          <div className="ea-record-toolbar"><div className="ea-segment" aria-label="Record display">{[['records', 'Student list'], ['matrix', 'Year / course matrix']].map(([key, label]) => <button key={key} aria-pressed={recordsView === key} onClick={() => setRecordsView(key)} className={recordsView === key ? 'is-active' : ''}>{label}</button>)}</div>
            {recordsView === 'records' && <details className="ea-column-picker"><summary><SlidersHorizontal size={14} />Columns</summary><div>{columns.map(([key, label]) => <label key={key}><input type="checkbox" checked={visibleColumns[key]} disabled={visibleColumns[key] && displayedColumns.length === 1} onChange={() => setVisibleColumns(current => ({ ...current, [key]: !current[key] }))} />{label}</label>)}</div></details>}
          </div>
          {recordsView === 'matrix' ? <div className="ea-table-scroll"><table className="ea-table"><thead><tr><th>Sub course</th>{analytics.years.map(year => <th key={year} className="ea-numeric">{year}</th>)}<th className="ea-numeric">Total</th></tr></thead><tbody>{analytics.matrix.map(row => <tr key={row.subcourse_name}><th>{row.subcourse_name}</th>{analytics.years.map(year => <td key={year} className="ea-numeric"><button className="ea-cell-button" onClick={() => selectCell('sub', row.subcourse_name, year)} title={`Filter ${row.subcourse_name}, ${year}`}>{formatTotal(row.values?.[year])}</button></td>)}<td className="ea-numeric ea-emphasis">{formatTotal(row.total)}</td></tr>)}</tbody><tfoot><tr><th>Total</th>{analytics.years.map(year => <td key={year} className="ea-numeric">{formatTotal(analytics.matrix.reduce((sum, row) => sum + Number(row.values?.[year] || 0), 0))}</td>)}<td className="ea-numeric">{formatTotal(analytics.summary.total)}</td></tr></tfoot></table></div> : <>
            <div className="ea-table-hint"><ArrowDownUp size={13} />Column sorting applies to this page. Select a student name for more details.</div>
            <div className="ea-table-scroll"><table className="ea-table ea-student-table"><thead><tr>{displayedColumns.map(([key, label]) => <th key={key} aria-sort={sort.key === key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button onClick={() => updateSort(key)}>{label}<span>{sort.key === key ? sort.direction === 'asc' ? '\u2191' : '\u2193' : <ArrowDownUp size={12} />}</span></button></th>)}</tr></thead><tbody>{sortedRecords.map(record => <React.Fragment key={record.id}><tr className={expandedStudent === record.id ? 'is-expanded' : ''}>{displayedColumns.map(([key]) => <td key={key}>{key === 'student_name' ? <button className="ea-student-link" aria-expanded={expandedStudent === record.id} onClick={() => setExpandedStudent(current => current === record.id ? null : record.id)}><span className="ea-avatar">{(record.student_name || '?').trim().slice(0, 1).toUpperCase()}</span><span>{record.student_name || 'NA'}</span><ChevronDown size={14} /></button> : key === 'status' ? <span className={`ea-status ${record.status === 'Active' ? 'active' : 'cancelled'}`}><span />{record.status}</span> : CERTIFICATES.some(item => item.key === key) ? <span className={`ea-certificate-count ${record[key] > 0 ? 'has-record' : ''}`}>{record[key] > 0 && <Check size={12} />}{record[key] ?? 0}</span> : record[key] || 'NA'}</td>)}</tr>{expandedStudent === record.id && <tr className="ea-detail-row"><td colSpan={displayedColumns.length}><div className="ea-student-details">{columns.map(([key, label]) => <div key={key}><span>{label}</span><strong>{record[key] ?? 'NA'}</strong></div>)}</div></td></tr>}</React.Fragment>)}</tbody></table></div>
            <div className="ea-pagination"><span>{formatTotal((page - 1) * pageSize + 1)} - {formatTotal(Math.min(page * pageSize, analytics.records.count))} of {formatTotal(analytics.records.count)} students</span><div><label>Rows <select aria-label="Rows per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[25, 50, 100].map(size => <option key={size}>{size}</option>)}</select></label><button className="ea-icon-button" disabled={page <= 1 || busy} onClick={() => setPage(value => value - 1)} aria-label="Previous page"><ChevronLeft size={17} /></button><span>Page {page} / {analytics.records.pages || 1}</span><button className="ea-icon-button" disabled={page >= analytics.records.pages || busy} onClick={() => setPage(value => value + 1)} aria-label="Next page"><ChevronRight size={17} /></button></div></div>
          </>}
        </Panel>}
      </>}
    </div>
    <footer className="ea-footer"><span><CheckCircle2 size={13} />Student & certificate records</span><span>All charts and exports follow your active filters.</span></footer>
  </div>;
};

export default EnrollmentState;
