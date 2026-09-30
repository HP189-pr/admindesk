import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, ArrowDownUp } from 'lucide-react';
import { normalizeDisplayValue as display } from './analyticsDisplay';
const number = value => Number(value || 0).toLocaleString();

export function FilterDialog({ open, onClose, children, active, count, loading, error, onClear }) {
  const ref = useRef(null);
  useEffect(() => { if (open && !ref.current.open) ref.current.showModal(); else if (!open && ref.current.open) ref.current.close(); }, [open]);
  return <dialog ref={ref} className="ea-filter-dialog" aria-labelledby="ea-filter-title" onCancel={onClose} onClose={onClose} onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')].filter(node => node.getClientRects().length);
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="ea-dialog-content"><header><div><h2 id="ea-filter-title">Refine your analysis</h2><p>Active filters: {active}. Changes apply instantly.</p></div><button className="ea-icon-button" onClick={onClose} aria-label="Close filters"><X size={20} /></button></header>
      <div className="ea-dialog-scroll">{children}</div><footer><span className="ea-dialog-summary" role="status">{loading ? 'Updating analytics...' : error ? 'Unable to update results' : count !== null ? `Showing ${number(count)} students` : 'Loading records...'}</span><button className="ea-button" onClick={onClear}>Clear all</button><button className="ea-button ea-button-dark" onClick={onClose}>View results</button></footer>
    </div>
  </dialog>;
}

export function DocumentTimeline({ data, types, filters, applyFilters }) {
  const [showAll, setShowAll] = useState(false);
  const allRows = data?.rows || [];
  const rows = showAll ? allRows : allRows.slice(-10);
  const datedTypes = types.filter(type => type.date_available);
  const max = Math.max(...rows.map(row => datedTypes.reduce((sum, type) => sum + (row[type.value] || 0), 0)), 1);
  return <div className="ea-document-timeline">
    <p className="ea-footnote">Provisional and migration use issue dates. Verification uses completion date. Degree records have no issue date.</p>
    {rows.length ? <div className="ea-timeline-scroll"><div className="ea-timeline-bars">{rows.map(row => {
      const total = datedTypes.reduce((sum, type) => sum + (row[type.value] || 0), 0);
      const selected = filters.issueDateFrom === `${String(row.year).padStart(4, '0')}-01-01` && filters.issueDateTo === `${String(row.year).padStart(4, '0')}-12-31`;
      return <button key={row.year} aria-pressed={selected} className={selected ? 'is-selected' : ''} title={datedTypes.map(type => `${type.label}: ${number(row[type.value])}`).join('\n')} aria-label={`${String(row.year).padStart(4, '0')}: ${number(total)} dated records. Filter event year.`} onClick={() => applyFilters({ issueDateFrom: `${String(row.year).padStart(4, '0')}-01-01`, issueDateTo: `${String(row.year).padStart(4, '0')}-12-31` })}><span>{number(total)}</span><span className="ea-event-bar" style={{ height: `${Math.max(2, total / max * 130)}px` }} /><strong>{String(row.year).padStart(4, '0')}</strong></button>;
    })}</div></div> : <div className="ea-empty">No dated document events match these filters.</div>}
    {allRows.length > 10 && <button className="ea-text-button ea-timeline-toggle" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>{showAll ? 'Show latest 10 event years' : `View all ${allRows.length} event years`}</button>}
    {allRows.some(row => row.year < 1900) && <p className="ea-footnote">Legacy dates before 1900 are present in the source records and remain included. Use View all to inspect their recorded years.</p>}
    <p className="ea-footnote">{number(Object.values(data?.undated || {}).reduce((sum, value) => sum + value, 0))} records have no recorded issue/completion date and remain in totals: {types.map(type => `${type.short}: ${number(data?.undated?.[type.value])}`).join(' / ')}</p>
  </div>;
}

export function CrossAnalysis({ data, types, years, filters, applyFilters }) {
  const [dimension, setDimension] = useState('Institute');
  const [axis, setAxis] = useState('years');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState('10');
  const [order, setOrder] = useState('total');
  const rows = useMemo(() => {
    const result = [...(data?.[dimension] || [])].filter(row => String(row.label).toLowerCase().includes(search.toLowerCase()));
    result.sort((a, b) => order === 'name' ? String(a.label).localeCompare(String(b.label)) : b.total - a.total);
    return limit === 'all' ? result : result.slice(0, Number(limit));
  }, [data, dimension, search, limit, order]);
  const columns = axis === 'years' ? years.map(year => ({ value: String(year), label: year })) : types.map(type => ({ value: type.value, label: type.short }));
  const max = Math.max(...rows.flatMap(row => columns.map(column => row[axis]?.[column.value] || 0)), 1);
  return <>
    <div className="ea-cross-controls">
      <label className="ea-field"><span>Rows</span><select value={dimension} onChange={event => setDimension(event.target.value)}>{Object.keys(data || {}).map(key => <option key={key}>{key}</option>)}</select></label>
      <label className="ea-field"><span>Columns</span><select value={axis} onChange={event => setAxis(event.target.value)}><option value="years">Admission year</option><option value="documents">Document / process type</option></select></label>
      <label className="ea-field"><span>Sort</span><select value={order} onChange={event => setOrder(event.target.value)}><option value="total">Most students</option><option value="name">Name</option></select></label>
      <label className="ea-field"><span>Show</span><select value={limit} onChange={event => setLimit(event.target.value)}><option value="10">Top 10</option><option value="25">Top 25</option><option value="all">View all</option></select></label>
      <label className="ea-field"><span>Find group</span><input aria-label="Search cross analysis" value={search} onChange={event => setSearch(event.target.value)} /></label>
    </div>
    <div className="ea-table-scroll" tabIndex={0} role="region" aria-label="Scrollable analytics table"><table className="ea-table ea-cross-table"><thead><tr><th>{dimension}</th>{columns.map(column => <th key={column.value}>{column.label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.value}><th>{display(row.label)}</th>{columns.map(column => {
      const count = row[axis]?.[column.value] || 0;
      const selected = Object.entries(row.filters).every(([key, value]) => String(filters[key]) === value) && (axis === 'years' ? filters.yearFrom === column.value && filters.yearTo === column.value : filters.certificate === column.value);
      return <td key={column.value}><button className={`ea-heat-cell ${selected ? 'is-selected' : ''}`} aria-pressed={selected} aria-label={`${row.label}, ${column.label}: ${number(count)}. Apply filters.`} title={`${row.label} / ${column.label}: ${number(count)}`} style={{ '--cell-strength': .08 + count / max * .45 }} onClick={() => applyFilters({ ...row.filters, ...(axis === 'years' ? { yearFrom: column.value, yearTo: column.value } : { certificate: column.value }) })}>{number(count)}</button></td>;
    })}</tr>)}</tbody></table>{!rows.length && <div className="ea-empty">No groups match this view.</div>}</div>
    <p className="ea-footnote">Year cells count students by admission batch. Document cells count registered/issued certificates and completed verification processes. Selecting a cell adds both filters to the global view.</p>
  </>;
}

export function DocumentRecords({ data, types, pageSize, setPageSize, setPage, loading, kind, onClear }) {
  const [sort, setSort] = useState({ key: 'document_number', direction: 1 });
  const [visible, setVisible] = useState({ document_type: true, document_number: true, student: true, enrollment_number: true, event_date: true, record_status: true });
  const columns = [['document_type', 'Type'], ['document_number', 'Document number'], ['student', 'Student'], ['enrollment_number', 'Enrollment'], ['event_date', 'Issue / completion date'], ['record_status', 'Status']];
  const rows = useMemo(() => [...(data?.results || [])].sort((a,b) => String(a[sort.key]).localeCompare(String(b[sort.key]), undefined, { numeric: true }) * sort.direction), [data, sort]);
  const shown = columns.filter(([key]) => visible[key]);
  return <><div className="ea-record-toolbar"><span className="ea-table-hint"><span role="status">{loading ? 'Updating records...' : 'Global filters apply. Sorting applies to this page.'}</span></span><details className="ea-column-picker"><summary>Columns</summary><div>{columns.map(([key,label]) => <label key={key}><input type="checkbox" checked={visible[key]} disabled={visible[key] && shown.length===1} onChange={() => setVisible(current=>({...current,[key]:!current[key]}))} />{label}</label>)}</div></details></div>
    <div className="ea-table-scroll" tabIndex={0} role="region" aria-label="Scrollable analytics table"><table className="ea-table"><thead><tr>{shown.map(([key,label]) => <th key={key} aria-sort={sort.key===key ? sort.direction===1?'ascending':'descending':'none'}><button onClick={() => setSort({key,direction:sort.key===key?-sort.direction:1})}>{label} {sort.key === key ? sort.direction === 1 ? '\u2191' : '\u2193' : <ArrowDownUp size={12} className="inline" />}</button></th>)}</tr></thead><tbody>{rows.map(row => <tr key={`${row.document_type}-${row.record_id}`}>{shown.map(([key]) => <td key={key}>{key==='document_type' ? types.find(type=>type.value===row[key])?.short || display(row[key]) : display(row[key])}</td>)}</tr>)}</tbody></table>{!rows.length && <div className="ea-empty"><p>No {kind === 'verification' ? 'verification' : 'certificate'} records match these filters.</p><button className="ea-button" onClick={onClear}>Clear filters</button></div>}</div>
    <div className="ea-pagination"><span>{number(data?.count)} records</span><div><label>Rows <select value={pageSize} onChange={event=>{setPageSize(Number(event.target.value));setPage(1);}}>{[25,50,100].map(size=><option key={size}>{size}</option>)}</select></label><button className="ea-icon-button" aria-label="Previous document page" disabled={loading || (data?.page || 1)<=1} onClick={()=>setPage(data.page-1)}><ChevronLeft size={17}/></button><span>Page {data?.page || 1} / {data?.pages || 1}</span><button className="ea-icon-button" aria-label="Next document page" disabled={loading || !data?.pages || data.page>=data.pages} onClick={()=>setPage(data.page+1)}><ChevronRight size={17}/></button></div></div>
  </>;
}
