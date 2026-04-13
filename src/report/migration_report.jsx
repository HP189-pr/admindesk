import React, { useEffect, useMemo, useState } from 'react';
import { getMigrationFilterOptions, getMigrationReport } from '../services/migrationservice';

const defaultFilters = {
  year: '',
  exam_year: '',
  institute_code: '',
  mg_status: '',
  subcourse_name: '',
};

const emptyFilterOptions = {
  years: [],
  examYears: [],
  instituteCodes: [],
  statuses: [],
  subcourses: [],
};

const SummaryCard = ({ title, value = 0, sublabel }) => (
  <div className="border rounded-2xl p-4 bg-white shadow-sm">
    <p className="text-sm text-slate-500">{title}</p>
    <p className="text-3xl font-semibold text-slate-900 mt-1">{value.toLocaleString()}</p>
    {sublabel ? <p className="text-xs text-slate-400 mt-1">{sublabel}</p> : null}
  </div>
);

const TableSection = ({ title, columns, rows = [], emptyLabel }) => (
  <div className="bg-white rounded-2xl shadow-sm border">
    <div className="flex items-center justify-between px-4 py-3 border-b">
      <h3 className="font-semibold text-slate-800">{title}</h3>
      <span className="text-xs text-slate-400">{rows.length} rows</span>
    </div>
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="text-left px-4 py-2 font-medium text-slate-600 border-b">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-400">
                {emptyLabel || 'No data available'}
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr key={`${title}-${idx}`} className="odd:bg-white even:bg-slate-50">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-2 border-b border-slate-100">
                    {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '-')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </div>
);

const MigrationReport = () => {
  const [filters, setFilters] = useState(defaultFilters);
  const [filterOptions, setFilterOptions] = useState(emptyFilterOptions);
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const loadFilterOptions = async () => {
      setFilterOptionsLoading(true);
      try {
        const data = await getMigrationFilterOptions();
        if (!isMounted) return;
        setFilterOptions({
          years: Array.isArray(data?.years) ? data.years : [],
          examYears: Array.isArray(data?.exam_years) ? data.exam_years : [],
          instituteCodes: Array.isArray(data?.institute_codes) ? data.institute_codes : [],
          statuses: Array.isArray(data?.statuses) ? data.statuses : [],
          subcourses: Array.isArray(data?.subcourses) ? data.subcourses : [],
        });
      } catch {
        if (isMounted) setFilterOptions(emptyFilterOptions);
      } finally {
        if (isMounted) setFilterOptionsLoading(false);
      }
    };

    loadFilterOptions();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    );

    const fetchReport = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getMigrationReport(params, { signal: controller.signal });
        setReport(data);
      } catch (err) {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
          setError(err.response?.data?.detail || 'Unable to load migration report');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
    return () => controller.abort();
  }, [filters]);

  const topYear = useMemo(() => report?.years?.[0], [report]);
  const topInstitution = useMemo(() => report?.institutions?.[0], [report]);
  const topStatus = useMemo(() => report?.statuses?.[0], [report]);

  const handleInput = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const resetFilters = () => setFilters(defaultFilters);

  return (
    <div className="space-y-4">
      <div className="bg-slate-50 border rounded-2xl p-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs text-slate-500">Migration Year</label>
            <select
              name="year"
              value={filters.year}
              onChange={handleInput}
              className="w-full mt-1 px-3 py-2 border rounded-lg"
              disabled={filterOptionsLoading}
            >
              <option value="">All Years</option>
              {filterOptions.years.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs text-slate-500">Exam Year</label>
            <select
              name="exam_year"
              value={filters.exam_year}
              onChange={handleInput}
              className="w-full mt-1 px-3 py-2 border rounded-lg"
              disabled={filterOptionsLoading}
            >
              <option value="">All Exam Years</option>
              {filterOptions.examYears.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-slate-500">Institute Code</label>
            <select
              name="institute_code"
              value={filters.institute_code}
              onChange={handleInput}
              className="w-full mt-1 px-3 py-2 border rounded-lg"
              disabled={filterOptionsLoading}
            >
              <option value="">All Codes</option>
              {filterOptions.instituteCodes.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="text-xs text-slate-500">Status</label>
            <select
              name="mg_status"
              value={filters.mg_status}
              onChange={handleInput}
              className="w-full mt-1 px-3 py-2 border rounded-lg"
              disabled={filterOptionsLoading}
            >
              <option value="">All Statuses</option>
              {filterOptions.statuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-slate-500">Subcourse</label>
            <select
              name="subcourse_name"
              value={filters.subcourse_name}
              onChange={handleInput}
              className="w-full mt-1 px-3 py-2 border rounded-lg"
              disabled={filterOptionsLoading}
            >
              <option value="">All Subcourses</option>
              {filterOptions.subcourses.map((subcourse) => (
                <option key={subcourse} value={subcourse}>{subcourse}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={resetFilters} className="px-4 py-2 rounded-lg border bg-white text-sm">
              Reset
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Filters refresh the migration report automatically.
          {filterOptionsLoading ? ' Loading filter lists…' : ''}
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
          Generating report…
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {report && !loading && !error ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <SummaryCard title="Total Migrations" value={report.overall_total || 0} />
            <SummaryCard title="Year Buckets" value={report.years?.length || 0} sublabel={topYear ? `Top: ${topYear.year}` : undefined} />
            <SummaryCard title="Institutions" value={report.institutions?.length || 0} sublabel={topInstitution ? `${topInstitution.institute_code} - ${topInstitution.institute_name || ''}` : undefined} />
            <SummaryCard title="Statuses" value={report.statuses?.length || 0} sublabel={topStatus?.mg_status} />
          </div>

          <TableSection
            title="Year-wise Summary"
            columns={[
              { key: 'year', label: 'Year' },
              { key: 'total', label: 'Migration Count', render: (val) => (val || 0).toLocaleString() },
            ]}
            rows={report.years || []}
            emptyLabel="No migration rows match the current filters"
          />

          <TableSection
            title="Institution-wise Summary"
            columns={[
              { key: 'institute_code', label: 'Institute Code' },
              { key: 'institute_name', label: 'Institute Name' },
              { key: 'total', label: 'Migration Count', render: (val) => (val || 0).toLocaleString() },
            ]}
            rows={report.institutions || []}
            emptyLabel="No institutions match the current filters"
          />

          <TableSection
            title="Status Summary"
            columns={[
              { key: 'mg_status', label: 'Status' },
              { key: 'total', label: 'Migration Count', render: (val) => (val || 0).toLocaleString() },
            ]}
            rows={report.statuses || []}
            emptyLabel="No status data for the current slice"
          />

          <TableSection
            title="Subcourse Summary"
            columns={[
              { key: 'subcourse_name', label: 'Subcourse' },
              { key: 'total', label: 'Migration Count', render: (val) => (val || 0).toLocaleString() },
            ]}
            rows={report.subcourses || []}
            emptyLabel="No subcourse data for the current slice"
          />

          <TableSection
            title="Institute × Year Matrix"
            columns={[
              { key: 'institute_code', label: 'Institute Code' },
              { key: 'institute_name', label: 'Institute Name' },
              { key: 'year', label: 'Year' },
              { key: 'total', label: 'Migrations', render: (val) => (val || 0).toLocaleString() },
            ]}
            rows={report.institute_year || []}
            emptyLabel="No institute/year combinations for the current filters"
          />
        </div>
      ) : null}
    </div>
  );
};

export default MigrationReport;
