// src/report/Degreereport.jsx
import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FaFileExcel, FaFilePdf } from 'react-icons/fa6';
import { getAllConvocations, getDegreeReport, getDegreeFilterOptions, getDegreeReportStudents } from '../services/degreeService';

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

const STUDENT_EXPORT_COLUMNS = [
    { key: 'enrollment_no', label: 'Enrollment' },
    { key: 'student_name_dg', label: 'Student Name' },
    { key: 'institute_name_dg', label: 'Institute' },
    { key: 'degree_name', label: 'Degree' },
    { key: 'specialisation', label: 'Specialisation' },
    { key: 'last_exam', label: 'Last Exam' },
    { key: 'class_obtain', label: 'Class' },
    { key: 'convocation_no', label: 'Conv.No' },
    { key: 'convocation_month_year', label: 'Conv-On' },
    { key: 'seat_last_exam', label: 'Seat No' },
];

const getLastExam = (row = {}) => {
    if (row.last_exam_month && row.last_exam_year) return `${row.last_exam_month}-${row.last_exam_year}`;
    return row.last_exam_month || row.last_exam_year || '';
};

const buildStudentExportRows = (students = []) => students.map((student) => ({
    ...student,
    last_exam: getLastExam(student),
}));

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

const StudentListSection = ({ students = [], total = 0, loading = false, error = '' }) => (
    <div className="bg-white rounded-2xl shadow-sm border">
        <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-semibold text-slate-800">Student List</h3>
            <span className="text-xs text-slate-400">
                {loading ? 'Loading...' : `${students.length.toLocaleString()} of ${total.toLocaleString()} records`}
            </span>
        </div>
        <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
                <thead className="bg-indigo-50">
                    <tr>
                        {STUDENT_EXPORT_COLUMNS.map((column) => (
                            <th key={column.key} className="text-left px-4 py-3 font-semibold text-indigo-900 uppercase text-[11px] tracking-wide border-b">
                                {column.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        <tr>
                            <td colSpan={STUDENT_EXPORT_COLUMNS.length} className="px-4 py-8 text-center text-slate-500">
                                Loading student records...
                            </td>
                        </tr>
                    ) : error ? (
                        <tr>
                            <td colSpan={STUDENT_EXPORT_COLUMNS.length} className="px-4 py-8 text-center text-red-600">
                                {error}
                            </td>
                        </tr>
                    ) : students.length === 0 ? (
                        <tr>
                            <td colSpan={STUDENT_EXPORT_COLUMNS.length} className="px-4 py-8 text-center text-slate-400">
                                No student records match the selected filters
                            </td>
                        </tr>
                    ) : (
                        students.map((student, idx) => {
                            const row = { ...student, last_exam: getLastExam(student) };
                            return (
                                <tr key={student.id || `${student.enrollment_no}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-indigo-50/40'}>
                                    {STUDENT_EXPORT_COLUMNS.map((column) => (
                                        <td key={column.key} className="px-4 py-3 border-b border-indigo-100 text-slate-700">
                                            {row[column.key] || '-'}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>
        {total > students.length && !loading && (
            <div className="px-4 py-3 text-xs text-amber-700 bg-amber-50 border-t border-amber-100">
                Showing first {students.length.toLocaleString()} records. Apply more filters to narrow the list before export.
            </div>
        )}
    </div>
);

const DegreeReport = () => {
    const [filters, setFilters] = useState(defaultFilters);
    const [convocations, setConvocations] = useState([]);
    const [filterOptions, setFilterOptions] = useState(emptyFilterOptions);
    const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);
    const [report, setReport] = useState(null);
    const [students, setStudents] = useState([]);
    const [studentCount, setStudentCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [studentsLoading, setStudentsLoading] = useState(false);
    const [error, setError] = useState('');
    const [studentError, setStudentError] = useState('');

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

    useEffect(() => {
        const controller = new AbortController();
        const params = {
            ...makeParams(filters),
            page: 1,
            page_size: 10000,
        };

        const fetchStudents = async () => {
            setStudentsLoading(true);
            setStudentError('');
            try {
                const data = await getDegreeReportStudents(params, { signal: controller.signal });
                setStudents(Array.isArray(data?.results) ? data.results : []);
                setStudentCount(Number(data?.count || 0));
            } catch (err) {
                if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
                    setStudents([]);
                    setStudentCount(0);
                    setStudentError(err.response?.data?.detail || 'Unable to load student list');
                }
            } finally {
                if (!controller.signal.aborted) {
                    setStudentsLoading(false);
                }
            }
        };

        fetchStudents();
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
    const studentExportRows = useMemo(() => buildStudentExportRows(students), [students]);

    const handleInput = (event) => {
        const { name, value } = event.target;
        setFilters((prev) => ({ ...prev, [name]: value }));
    };

    const resetFilters = () => setFilters(defaultFilters);

    const exportExcel = () => {
        if (!studentExportRows.length) return;

        const workbook = XLSX.utils.book_new();
        const rows = studentExportRows.map((row) => (
            Object.fromEntries(STUDENT_EXPORT_COLUMNS.map((column) => [column.label, row[column.key] || '']))
        ));
        const worksheet = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Student List');
        XLSX.writeFile(workbook, buildExportFilename('xlsx'));
    };

    const exportPDF = () => {
        if (!studentExportRows.length) return;

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        doc.setFontSize(16);
        doc.text('Degree Student List', 14, 16);
        doc.setFontSize(9);
        doc.text(`Generated: ${new Date().toLocaleString()} | Records: ${studentCount.toLocaleString()}`, 14, 22);
        autoTable(doc, {
            startY: 28,
            head: [STUDENT_EXPORT_COLUMNS.map((column) => column.label)],
            body: studentExportRows.map((row) => STUDENT_EXPORT_COLUMNS.map((column) => row[column.key] || '')),
            theme: 'striped',
            styles: { fontSize: 7, cellPadding: 1.6, overflow: 'linebreak' },
            headStyles: { fillColor: [15, 23, 42] },
            columnStyles: {
                1: { cellWidth: 38 },
                2: { cellWidth: 45 },
                3: { cellWidth: 38 },
                4: { cellWidth: 34 },
            },
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
                        disabled={!studentExportRows.length || studentsLoading}
                        title="Export Excel"
                        aria-label="Export Excel"
                        className={EXPORT_EXCEL_BUTTON_CLASS}
                    >
                        <FaFileExcel size={20} color="#1D6F42" />
                    </button>
                    <button
                        type="button"
                        onClick={exportPDF}
                        disabled={!studentExportRows.length || studentsLoading}
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
                    Filters drive the student list and the Excel/PDF exports.
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

                    <StudentListSection
                        students={students}
                        total={studentCount}
                        loading={studentsLoading}
                        error={studentError}
                    />
                </div>
            )}
        </div>
    );
};

export default DegreeReport;
