// src/report/Degreereport.jsx
import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FaFileExcel, FaFilePdf } from 'react-icons/fa6';
import { getAllConvocations, getDegreeReport, getDegreeFilterOptions } from '../services/degreeService';

const defaultFilters = {
    convocation_no: '',
    last_exam_year: '',
    institute_code: '',
    degree_name: '',
    subcourse_name: ''
};

const emptyFilterOptions = {
    years: [],
    instituteCodes: [],
    institutes: [],
    courses: [],
    subcourses: []
};

const EXPORT_EXCEL_BUTTON_CLASS = 'inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-100 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50';
const EXPORT_PDF_BUTTON_CLASS = 'inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 shadow-sm shadow-rose-100 transition duration-200 hover:-translate-y-0.5 hover:bg-rose-100 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50';

const makeParams = (filters = {}) => Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
);

const withSelectedValue = (options = [], selectedValue = '') => {
    const cleanOptions = Array.isArray(options) ? options : [];
    const selected = String(selectedValue || '').trim();
    if (!selected || cleanOptions.some((option) => String(option) === selected)) {
        return cleanOptions;
    }
    return [selected, ...cleanOptions];
};

const formatCount = (value) => Number(value || 0).toLocaleString();

const buildReportExportTables = (report, institutionSummaryRows) => ([
    {
        title: 'Convocation Summary',
        columns: ['Convocation', 'Title', 'Month/Year', 'Degree Count'],
        rows: (report?.convocations || []).map((row) => [
            row.convocation_no || '',
            row.convocation_title || '',
            row.month_year || '',
            row.total || 0,
        ]),
    },
    {
        title: 'Institution-wise Summary',
        columns: ['Institute', 'Degree Count'],
        rows: (institutionSummaryRows || []).map((row) => [
            row.institute_name_dg || '',
            row.total || 0,
        ]),
    },
    {
        title: 'Course-wise Summary',
        columns: ['Course / Degree', 'Degree Count'],
        rows: (report?.courses || []).map((row) => [
            row.degree_name || '',
            row.total || 0,
        ]),
    },
    {
        title: 'Institution Course Matrix',
        columns: ['Institute', 'Course', 'Degrees'],
        rows: (report?.institution_course || []).map((row) => [
            row.institute_name_dg || '',
            row.degree_name || '',
            row.total || 0,
        ]),
    },
]);

const buildExportFilename = (extension) => (
    `degree_report_${new Date().toISOString().slice(0, 10)}.${extension}`
);

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
    const [filterOptions, setFilterOptions] = useState(emptyFilterOptions);
    const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let isMounted = true;

        getAllConvocations()
            .then((data) => {
                if (isMounted) setConvocations(data);
            })
            .catch(() => {
                if (isMounted) setConvocations([]);
            });

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        const params = makeParams(filters);
        let isMounted = true;

        const loadFilterOptions = async () => {
            setFilterOptionsLoading(true);
            try {
                const data = await getDegreeFilterOptions(params, { signal: controller.signal });
                if (!isMounted) return;
                setFilterOptions({
                    years: Array.isArray(data?.years) ? data.years : [],
                    instituteCodes: Array.isArray(data?.institute_codes) ? data.institute_codes : [],
                    institutes: Array.isArray(data?.institutes) ? data.institutes : [],
                    courses: Array.isArray(data?.courses) ? data.courses : [],
                    subcourses: Array.isArray(data?.subcourses) ? data.subcourses : [],
                });
            } catch (err) {
                if (isMounted && err.name !== 'CanceledError' && err.name !== 'AbortError') {
                    setFilterOptions(emptyFilterOptions);
                }
            } finally {
                if (isMounted) setFilterOptionsLoading(false);
            }
        };

        loadFilterOptions();
        return () => {
            isMounted = false;
            controller.abort();
        };
    }, [filters]);

    useEffect(() => {
        const controller = new AbortController();
        const params = makeParams(filters);

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
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        };

        fetchReport();
        return () => controller.abort();
    }, [filters]);

    const topConvocation = useMemo(() => report?.convocations?.[0], [report]);
    const topInstitution = useMemo(() => report?.institutions?.[0], [report]);
    const topCourse = useMemo(() => report?.courses?.[0], [report]);
    const yearOptions = useMemo(
        () => withSelectedValue(filterOptions.years, filters.last_exam_year),
        [filterOptions.years, filters.last_exam_year]
    );
    const instituteCodeOptions = useMemo(
        () => withSelectedValue(filterOptions.instituteCodes, filters.institute_code),
        [filterOptions.instituteCodes, filters.institute_code]
    );
    const courseOptions = useMemo(
        () => withSelectedValue(filterOptions.courses, filters.degree_name),
        [filterOptions.courses, filters.degree_name]
    );
    const subcourseOptions = useMemo(
        () => withSelectedValue(filterOptions.subcourses, filters.subcourse_name),
        [filterOptions.subcourses, filters.subcourse_name]
    );
    const institutionSummaryRows = useMemo(() => {
        const rows = Array.isArray(report?.institutions) ? report.institutions : [];
        return [...rows].sort((a, b) => {
            const left = String(a?.institute_name_dg || '').trim();
            const right = String(b?.institute_name_dg || '').trim();
            return left.localeCompare(right, undefined, { sensitivity: 'base' });
        });
    }, [report]);

    const exportTables = useMemo(
        () => buildReportExportTables(report, institutionSummaryRows),
        [report, institutionSummaryRows]
    );

    const handleInput = (event) => {
        const { name, value } = event.target;
        setFilters((prev) => ({ ...prev, [name]: value }));
    };

    const resetFilters = () => setFilters(defaultFilters);

    const exportExcel = () => {
        if (!report) return;

        const workbook = XLSX.utils.book_new();
        const overviewRows = [
            ['Metric', 'Value'],
            ['Total Degrees', report.overall_total || 0],
            ['Convocation Buckets', report.convocations?.length || 0],
            ['Institutions', report.institutions?.length || 0],
            ['Courses', report.courses?.length || 0],
        ];

        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(overviewRows), 'Overview');
        exportTables.forEach((table) => {
            const rows = table.rows.length ? table.rows : [['No data available']];
            XLSX.utils.book_append_sheet(
                workbook,
                XLSX.utils.aoa_to_sheet([table.columns, ...rows]),
                table.title.slice(0, 31)
            );
        });
        XLSX.writeFile(workbook, buildExportFilename('xlsx'));
    };

    const exportPDF = () => {
        if (!report) return;

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        doc.setFontSize(16);
        doc.text('Degree Report', 14, 16);
        doc.setFontSize(9);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);
        autoTable(doc, {
            startY: 28,
            head: [['Metric', 'Value']],
            body: [
                ['Total Degrees', formatCount(report.overall_total)],
                ['Convocation Buckets', formatCount(report.convocations?.length)],
                ['Institutions', formatCount(report.institutions?.length)],
                ['Courses', formatCount(report.courses?.length)],
            ],
            theme: 'grid',
            styles: { fontSize: 9 },
            headStyles: { fillColor: [15, 23, 42] },
        });

        exportTables.forEach((table) => {
            doc.addPage('a4', 'landscape');
            doc.setFontSize(13);
            doc.text(table.title, 14, 16);
            autoTable(doc, {
                startY: 22,
                head: [table.columns],
                body: table.rows.length ? table.rows : [table.columns.map(() => '')],
                theme: 'striped',
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [15, 23, 42] },
            });
        });

        doc.save(buildExportFilename('pdf'));
    };

    return (
        <div className="space-y-4">
            <div className="bg-slate-50 border rounded-2xl p-4">
                <div className="mb-3 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={exportExcel}
                        disabled={!report || loading}
                        title="Export Excel"
                        aria-label="Export Excel"
                        className={EXPORT_EXCEL_BUTTON_CLASS}
                    >
                        <FaFileExcel size={20} color="#1D6F42" />
                    </button>
                    <button
                        type="button"
                        onClick={exportPDF}
                        disabled={!report || loading}
                        title="Export PDF"
                        aria-label="Export PDF"
                        className={EXPORT_PDF_BUTTON_CLASS}
                    >
                        <FaFilePdf size={20} color="#D32F2F" />
                    </button>
                </div>
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
                        <select
                            name="last_exam_year"
                            value={filters.last_exam_year}
                            onChange={handleInput}
                            className="w-full mt-1 px-3 py-2 border rounded-lg"
                            disabled={filterOptionsLoading}
                        >
                            <option value="">All Years</option>
                            {yearOptions.map((year) => (
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
                            {instituteCodeOptions.map((code) => (
                                <option key={code} value={code}>{code}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="text-xs text-slate-500">Course / Degree</label>
                        <select
                            name="degree_name"
                            value={filters.degree_name}
                            onChange={handleInput}
                            className="w-full mt-1 px-3 py-2 border rounded-lg"
                            disabled={filterOptionsLoading}
                        >
                            <option value="">All Courses</option>
                            {courseOptions.map((name) => (
                                <option key={name} value={name}>{name}</option>
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
                            {subcourseOptions.map((name) => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
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
                    {filterOptionsLoading && ' Loading filter lists…'}
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
                        rows={institutionSummaryRows}
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
