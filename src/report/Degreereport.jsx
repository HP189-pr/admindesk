import React, { useEffect, useMemo, useState } from 'react';
import { getAllConvocations, getDegreeReport } from '../services/degreeService';

const defaultFilters = {
    convocation_no: '',
    last_exam_year: '',
    institute_name_dg: '',
    degree_name: ''
};

const SummaryCard = ({ title, value = 0, sublabel }) => (
    <div className="border rounded-2xl p-4 bg-white shadow-sm">
        <p className="text-sm text-slate-500">{title}</p>
        <p className="text-3xl font-semibold text-slate-900 mt-1">{value.toLocaleString()}</p>
        {sublabel && <p className="text-xs text-slate-400 mt-1">{sublabel}</p>}
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
                            <tr key={idx} className="odd:bg-white even:bg-slate-50">
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

const DegreeReport = () => {
    const [filters, setFilters] = useState(defaultFilters);
    const [convocations, setConvocations] = useState([]);
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        getAllConvocations().then(setConvocations).catch(() => setConvocations([]));
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
                const data = await getDegreeReport(params, { signal: controller.signal });
                setReport(data);
            } catch (err) {
                if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
                    setError(err.response?.data?.detail || 'Unable to load degree report');
                }
            } finally {
                setLoading(false);
            }
        };

        fetchReport();
        return () => controller.abort();
    }, [filters]);

    const topConvocation = useMemo(() => report?.convocations?.[0], [report]);
    const topInstitution = useMemo(() => report?.institutions?.[0], [report]);
    const topCourse = useMemo(() => report?.courses?.[0], [report]);

    const handleInput = (event) => {
        const { name, value } = event.target;
        setFilters((prev) => ({ ...prev, [name]: value }));
    };

    const resetFilters = () => setFilters(defaultFilters);

    return (
        <div className="space-y-4">
            <div className="bg-slate-50 border rounded-2xl p-4">
                <div className="flex flex-wrap gap-3">
                    <div className="flex-1 min-w-[160px]">
                        <label className="text-xs text-slate-500">Convocation</label>
                        <select
                            name="convocation_no"
                            value={filters.convocation_no}
                            onChange={handleInput}
                            className="w-full mt-1 px-3 py-2 border rounded-lg"
                        >
                            <option value="">All Convocations</option>
                            {convocations.map((conv) => (
                                <option key={conv.id} value={conv.convocation_no}>
                                    Conv {conv.convocation_no} - {conv.convocation_title}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[140px]">
                        <label className="text-xs text-slate-500">Exam Year</label>
                        <input
                            type="number"
                            name="last_exam_year"
                            value={filters.last_exam_year}
                            onChange={handleInput}
                            placeholder="e.g., 2024"
                            className="w-full mt-1 px-3 py-2 border rounded-lg"
                        />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="text-xs text-slate-500">Institute</label>
                        <input
                            type="text"
                            name="institute_name_dg"
                            value={filters.institute_name_dg}
                            onChange={handleInput}
                            placeholder="Filter by institute"
                            className="w-full mt-1 px-3 py-2 border rounded-lg"
                        />
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="text-xs text-slate-500">Course / Degree</label>
                        <input
                            type="text"
                            name="degree_name"
                            value={filters.degree_name}
                            onChange={handleInput}
                            placeholder="Filter by course"
                            className="w-full mt-1 px-3 py-2 border rounded-lg"
                        />
                    </div>
                    <div className="flex items-end">
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="px-4 py-2 rounded-lg border bg-white text-sm"
                        >
                            Reset
                        </button>
                    </div>
                </div>
                <p className="text-xs text-slate-400 mt-3">
                    Filters drive both the visual report and the downstream data-analysis exports.
                </p>
            </div>

            {loading && (
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
                    Generating report…
                </div>
            )}

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
            )}

            {report && !loading && !error && (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <SummaryCard title="Total Degrees" value={report.overall_total || 0} />
                        <SummaryCard title="Convocation Buckets" value={report.convocations?.length || 0} sublabel={topConvocation ? `Top: Conv ${topConvocation.convocation_no}` : undefined} />
                        <SummaryCard title="Institutions" value={report.institutions?.length || 0} sublabel={topInstitution?.institute_name_dg} />
                        <SummaryCard title="Courses" value={report.courses?.length || 0} sublabel={topCourse?.degree_name} />
                    </div>

                    <TableSection
                        title="Convocation Summary"
                        columns={[
                            { key: 'convocation_no', label: 'Convocation' },
                            { key: 'convocation_title', label: 'Title' },
                            { key: 'month_year', label: 'Month/Year' },
                            { key: 'total', label: 'Degree Count', render: (val) => (val || 0).toLocaleString() }
                        ]}
                        rows={report.convocations || []}
                        emptyLabel="No convocation data for selected filters"
                    />

                    <TableSection
                        title="Institution-wise Summary"
                        columns={[
                            { key: 'institute_name_dg', label: 'Institute' },
                            { key: 'total', label: 'Degree Count', render: (val) => (val || 0).toLocaleString() }
                        ]}
                        rows={report.institutions || []}
                        emptyLabel="No institutions match the current filters"
                    />

                    <TableSection
                        title="Course-wise Summary"
                        columns={[
                            { key: 'degree_name', label: 'Course / Degree' },
                            { key: 'total', label: 'Degree Count', render: (val) => (val || 0).toLocaleString() }
                        ]}
                        rows={report.courses || []}
                        emptyLabel="No course data for selected filters"
                    />

                    <TableSection
                        title="Institution × Course Matrix"
                        columns={[
                            { key: 'institute_name_dg', label: 'Institute' },
                            { key: 'degree_name', label: 'Course' },
                            { key: 'total', label: 'Degrees', render: (val) => (val || 0).toLocaleString() }
                        ]}
                        rows={report.institution_course || []}
                        emptyLabel="No combined rows for the current slice"
                    />
                </div>
            )}
        </div>
    );
};

export default DegreeReport;
