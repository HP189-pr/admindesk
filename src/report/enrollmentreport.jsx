// src/report/enrollmentreport.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ArrowLeft, RotateCcw, Rows3, Users } from "lucide-react";
import { FaFileExcel, FaFilePdf } from "react-icons/fa6";
import { getEnrollmentReportSummary, getEnrollments } from "../services/enrollmentservice";

const GROUP_OPTIONS = [
  { value: "batch", label: "Batch Wise" },
  { value: "institute", label: "Institute Wise" },
  { value: "course", label: "Course Wise" },
  { value: "status", label: "Status Wise" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "cancelled", label: "Cancelled" },
];

const GROUP_LABELS = {
  batch: "Batch",
  institute: "Institute",
  course: "Course",
  status: "Status",
};

const TOOLBAR_CARD_CLASS = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";
const CONTROL_LABEL_CLASS = "mb-1 block text-sm font-medium text-slate-700";
const SELECT_CLASS = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/15";
const ACTION_BUTTON_BASE_CLASS = "inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold shadow-sm transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50";
const REFRESH_BUTTON_CLASS = "refresh-icon-button";
const BACK_BUTTON_CLASS = `${ACTION_BUTTON_BASE_CLASS} border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200`;
const RESET_BUTTON_CLASS = "reset-button w-full";
const EXPORT_EXCEL_BUTTON_CLASS = "inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 shadow-sm shadow-emerald-100 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-100 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50";
const EXPORT_PDF_BUTTON_CLASS = "inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 shadow-sm shadow-rose-100 transition duration-200 hover:-translate-y-0.5 hover:bg-rose-100 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50";

const normalizeOption = (item) => {
  if (!item) return null;
  if (typeof item === "string" || typeof item === "number") {
    const value = String(item);
    return { value, label: value };
  }
  const value = String(item.value ?? "");
  const label = String(item.label ?? value);
  if (!value) return null;
  return { value, label };
};

const normalizeSummaryRow = (item) => ({
  group: String(item?.group ?? "-"),
  total: Number(item?.total || 0),
  active: Number(item?.active || 0),
  cancelled: Number(item?.cancelled || 0),
});

const pickEnrollmentInstituteId = (enrollment) =>
  enrollment?.institute?.institute_id
  || enrollment?.institute?.id
  || enrollment?.institute_id
  || "";

const pickEnrollmentMaincourseId = (enrollment) =>
  enrollment?.maincourse?.maincourse_id
  || enrollment?.maincourse?.id
  || enrollment?.maincourse_id
  || "";

const pickEnrollmentSubcourseId = (enrollment) =>
  enrollment?.subcourse?.subcourse_id
  || enrollment?.subcourse?.id
  || enrollment?.subcourse_id
  || "";

const EnrollmentReport = ({ onBack }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [includeStudentList, setIncludeStudentList] = useState(false);
  const [fetchingStudents, setFetchingStudents] = useState(false);

  const [groupBy, setGroupBy] = useState("batch");
  const [statusFilter, setStatusFilter] = useState("all");
  const [batchFilter, setBatchFilter] = useState("");
  const [instituteFilter, setInstituteFilter] = useState("");
  const [courseFilter, setCourseFilter] = useState("");

  const [batchOptions, setBatchOptions] = useState([]);
  const [instituteOptions, setInstituteOptions] = useState([]);
  const [courseOptions, setCourseOptions] = useState([]);

  const [summaryRows, setSummaryRows] = useState([]);
  const [totals, setTotals] = useState({ total: 0, active: 0, cancelled: 0 });

  const activeControllerRef = useRef(null);
  const runIdRef = useRef(0);

  const loadReportSummary = useCallback(async (externalSignal) => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;

    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }

    const localController = new AbortController();
    if (externalSignal) {
      if (externalSignal.aborted) {
        localController.abort();
      } else {
        externalSignal.addEventListener("abort", () => localController.abort(), { once: true });
      }
    }
    const signal = localController.signal;
    activeControllerRef.current = localController;

    const isRunStale = () => runIdRef.current !== runId;

    setLoading(true);
    setError("");

    try {
      const params = {
        group_by: groupBy,
        status: statusFilter,
      };

      if (batchFilter) params.batch = batchFilter;
      if (instituteFilter) params.institute = instituteFilter;
      if (courseFilter) params.course = courseFilter;

      const data = await getEnrollmentReportSummary(params, { signal });
      if (signal?.aborted || isRunStale()) return;

      const rows = Array.isArray(data?.rows) ? data.rows.map(normalizeSummaryRow) : [];
      const nextTotals = {
        total: Number(data?.totals?.total || 0),
        active: Number(data?.totals?.active || 0),
        cancelled: Number(data?.totals?.cancelled || 0),
      };

      const nextBatchOptions = Array.isArray(data?.options?.batches)
        ? data.options.batches.map(normalizeOption).filter(Boolean)
        : [];

      const nextInstituteOptions = Array.isArray(data?.options?.institutes)
        ? data.options.institutes.map(normalizeOption).filter(Boolean)
        : [];

      const nextCourseOptions = Array.isArray(data?.options?.courses)
        ? data.options.courses.map(normalizeOption).filter(Boolean)
        : [];

      setSummaryRows(rows);
      setTotals(nextTotals);
      setBatchOptions(nextBatchOptions);
      setInstituteOptions(nextInstituteOptions);
      setCourseOptions(nextCourseOptions);
    } catch (err) {
      if (err?.code === "ERR_CANCELED" || signal?.aborted || isRunStale()) {
        return;
      }
      console.error("Failed to load enrollment report summary:", err);
      setSummaryRows([]);
      setTotals({ total: 0, active: 0, cancelled: 0 });
      setError("Failed to load enrollment report data.");
    } finally {
      if (!signal?.aborted && !isRunStale()) {
        setLoading(false);
      }
      if (activeControllerRef.current === localController) {
        activeControllerRef.current = null;
      }
    }
  }, [groupBy, statusFilter, batchFilter, instituteFilter, courseFilter]);

  useEffect(() => {
    const controller = new AbortController();
    loadReportSummary(controller.signal);
    return () => {
      controller.abort();
      runIdRef.current += 1;
    };
  }, [loadReportSummary]);

  const fetchStudentListData = useCallback(async () => {
    try {
      // Fetch all enrollments with a large page size
      const response = await getEnrollments("", 1, 10000);
      let enrollments = response.results || response || [];

      // Apply filters on client side
      enrollments = enrollments.filter((enrollment) => {
        // Status filter
        if (statusFilter === "active" && enrollment.cancel) return false;
        if (statusFilter === "cancelled" && !enrollment.cancel) return false;

        // Batch filter
        if (batchFilter && String(enrollment.batch) !== String(batchFilter)) return false;

        // Institute filter
        if (instituteFilter && String(pickEnrollmentInstituteId(enrollment)) !== String(instituteFilter)) return false;

        // Course filter
        if (courseFilter && String(pickEnrollmentMaincourseId(enrollment)) !== String(courseFilter)) return false;

        return true;
      });

      return enrollments;
    } catch (err) {
      console.error("Failed to fetch student list:", err);
      return [];
    }
  }, [statusFilter, batchFilter, instituteFilter, courseFilter]);

  const handleExportExcel = async () => {
    if (!summaryRows.length) return;

    setFetchingStudents(true);
    try {
      const groupLabel = GROUP_LABELS[groupBy] || "Group";
      let worksheets = {};

      // First sheet: Summary
      const aoa = [
        ["Enrollment Report"],
        ["Grouped By", GROUP_OPTIONS.find((o) => o.value === groupBy)?.label || groupBy],
        ["Status Filter", STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label || statusFilter],
        ["Batch Filter", batchFilter || "All"],
        ["Institute Filter", instituteFilter || "All"],
        ["Course Filter", courseFilter || "All"],
        [],
        [groupLabel, "Total", "Active", "Cancelled"],
        ...summaryRows.map((row) => [row.group, row.total, row.active, row.cancelled]),
        ["GRAND TOTAL", totals.total, totals.active, totals.cancelled],
      ];

      const summaryWs = XLSX.utils.aoa_to_sheet(aoa);
      worksheets["Summary"] = summaryWs;

      // Second sheet: Student List (if checkbox is checked)
      if (includeStudentList) {
        const students = await fetchStudentListData();
        if (students.length > 0) {
          const studentAoa = [
            ["Student List"],
            ["Total Students", students.length],
            [],
            ["Enrollment No", "Student Name", "Batch", "institute_id", "maincourse_id", "subcourse_id", "Institute", "Course", "Subcourse", "Status"],
            ...students.map((enrollment) => [
              enrollment.enrollment_no || "N/A",
              enrollment.student_name || "N/A",
              enrollment.batch || "N/A",
              pickEnrollmentInstituteId(enrollment) || "N/A",
              pickEnrollmentMaincourseId(enrollment) || "N/A",
              pickEnrollmentSubcourseId(enrollment) || "N/A",
              enrollment.institute?.institute_code ? `${enrollment.institute.institute_code} - ${enrollment.institute.institute_name}` : "N/A",
              enrollment.maincourse?.course_code ? `${enrollment.maincourse.course_code} - ${enrollment.maincourse.course_name}` : "N/A",
              enrollment.subcourse?.subcourse_name || enrollment.subcourse?.name || "N/A",
              enrollment.cancel ? "Cancelled" : "Active",
            ]),
          ];

          const studentWs = XLSX.utils.aoa_to_sheet(studentAoa);
          worksheets["Students"] = studentWs;
        }
      }

      const wb = XLSX.utils.book_new();
      Object.keys(worksheets).forEach((sheetName) => {
        XLSX.utils.book_append_sheet(wb, worksheets[sheetName], sheetName);
      });
      XLSX.writeFile(wb, `enrollment_report_${groupBy}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } finally {
      setFetchingStudents(false);
    }
  };

  const handleExportPdf = async () => {
    if (!summaryRows.length) return;

    setFetchingStudents(true);
    try {
      const groupLabel = GROUP_LABELS[groupBy] || "Group";
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      doc.setFontSize(14);
      doc.text("Enrollment Report", 14, 12);
      doc.setFontSize(10);
      doc.text(`Grouped By: ${GROUP_OPTIONS.find((o) => o.value === groupBy)?.label || groupBy}`, 14, 18);
      doc.text(`Status: ${STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label || statusFilter}`, 14, 23);

      // Summary Table
      autoTable(doc, {
        startY: 28,
        head: [[groupLabel, "Total", "Active", "Cancelled"]],
        body: [
          ...summaryRows.map((row) => [row.group, row.total, row.active, row.cancelled]),
          ["GRAND TOTAL", totals.total, totals.active, totals.cancelled],
        ],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [79, 70, 229] },
        columnStyles: {
          1: { halign: "right" },
          2: { halign: "right" },
          3: { halign: "right" },
        },
      });

      // Student List (if checkbox is checked)
      if (includeStudentList) {
        const students = await fetchStudentListData();
        if (students.length > 0) {
          const currentPageHeight = doc.internal.pageSize.getHeight();
          const currentY = doc.lastAutoTable?.finalY || 28;

          // Add new page if needed
          if (currentY > currentPageHeight - 40) {
            doc.addPage();
            doc.setFontSize(14);
            doc.text("Student List - Enrollment Report", 14, 12);
          } else {
            doc.setFontSize(12);
            doc.text("Student List", 14, currentY + 10);
          }

          autoTable(doc, {
            startY: doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : 40,
            head: [["Enrollment No", "Student Name", "Batch", "Institute", "Course", "Status"]],
            body: students.map((enrollment) => [
              enrollment.enrollment_no || "N/A",
              enrollment.student_name || "N/A",
              enrollment.batch || "N/A",
              enrollment.institute?.institute_code ? `${enrollment.institute.institute_code}` : "N/A",
              enrollment.maincourse?.course_code ? `${enrollment.maincourse.course_code}` : "N/A",
              enrollment.cancel ? "Cancelled" : "Active",
            ]),
            styles: { fontSize: 8 },
            headStyles: { fillColor: [79, 70, 229] },
            columnStyles: {
              2: { halign: "right" },
              4: { halign: "right" },
            },
          });
        }
      }

      doc.save(`enrollment_report_${groupBy}_${new Date().toISOString().split('T')[0]}.pdf`);
    } finally {
      setFetchingStudents(false);
    }
  };

  const handleResetFilters = () => {
    setGroupBy("batch");
    setStatusFilter("all");
    setBatchFilter("");
    setInstituteFilter("");
    setCourseFilter("");
  };

  const canExport = summaryRows.length > 0 && !fetchingStudents;

  return (
    <div className="space-y-4">
      <div className={TOOLBAR_CARD_CLASS}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
              <Rows3 size={18} className="text-blue-600" />
              Enrollment Report
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Review grouped enrollment totals and export the current report view.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <label
              className={`inline-flex h-11 items-center gap-2 rounded-2xl border px-3 text-sm font-medium shadow-sm transition ${
                includeStudentList
                  ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              <Users size={16} className={includeStudentList ? "text-indigo-600" : "text-slate-400"} />
            <input
              type="checkbox"
              checked={includeStudentList}
              onChange={(e) => setIncludeStudentList(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium">Report with student list</span>
          </label>
          <button
            type="button"
            onClick={() => loadReportSummary()}
            className={REFRESH_BUTTON_CLASS}
            disabled={loading}
            title={loading ? "Loading" : "Refresh"}
            aria-label={loading ? "Loading" : "Refresh"}
          >
            <span className={`refresh-symbol ${loading ? "animate-spin" : ""}`} aria-hidden="true">↻</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={!canExport}
            className={EXPORT_PDF_BUTTON_CLASS}
            aria-label="Export PDF"
            title={fetchingStudents ? "Preparing export" : "Export PDF"}
          >
            <FaFilePdf size={20} color="#D32F2F" />
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={!canExport}
            className={EXPORT_EXCEL_BUTTON_CLASS}
            aria-label="Export Excel"
            title={fetchingStudents ? "Preparing export" : "Export Excel"}
          >
            <FaFileExcel size={20} color="#1D6F42" />
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className={BACK_BUTTON_CLASS}
            >
              <ArrowLeft size={16} />
              Back
            </button>
          )}
        </div>
      </div>

        {fetchingStudents && (
          <div className="mt-3 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            Preparing export using the current filters...
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3 xl:grid-cols-6">
        <label className="text-sm">
          <span className={CONTROL_LABEL_CLASS}>Group By</span>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            className={SELECT_CLASS}
          >
            {GROUP_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className={CONTROL_LABEL_CLASS}>Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={SELECT_CLASS}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className={CONTROL_LABEL_CLASS}>Batch</span>
          <select
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">All</option>
            {batchOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className={CONTROL_LABEL_CLASS}>Institute</span>
          <select
            value={instituteFilter}
            onChange={(e) => setInstituteFilter(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">All</option>
            {instituteOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className={CONTROL_LABEL_CLASS}>Course</span>
          <select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">All</option>
            {courseOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <div className="flex items-end">
          <button
            type="button"
            onClick={handleResetFilters}
            className={RESET_BUTTON_CLASS}
          >
            <RotateCcw size={16} />
            Reset Filters
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Filtered Enrollment Rows</p>
          <p className="text-xl font-semibold">{totals.total}</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm shadow-emerald-100/60">
          <p className="text-xs text-slate-500">Active</p>
          <p className="text-xl font-semibold text-emerald-600">{totals.active}</p>
        </div>
        <div className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm shadow-rose-100/60">
          <p className="text-xs text-slate-500">Cancelled</p>
          <p className="text-xl font-semibold text-red-600">{totals.cancelled}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="px-3 py-2 text-left">{GROUP_LABELS[groupBy]}</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Active</th>
              <th className="px-3 py-2 text-right">Cancelled</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.map((row) => (
              <tr key={row.group} className="border-t">
                <td className="px-3 py-2">{row.group}</td>
                <td className="px-3 py-2 text-right">{row.total}</td>
                <td className="px-3 py-2 text-right text-emerald-700">{row.active}</td>
                <td className="px-3 py-2 text-right text-red-700">{row.cancelled}</td>
              </tr>
            ))}

            {!loading && summaryRows.length === 0 && (
              <tr>
                <td className="px-3 py-5 text-center text-gray-500" colSpan={4}>
                  No data available for the selected filters.
                </td>
              </tr>
            )}

            {loading && (
              <tr>
                <td className="px-3 py-5 text-center text-gray-500" colSpan={4}>
                  Loading report data...
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 border-t font-semibold">
              <td className="px-3 py-2">GRAND TOTAL</td>
              <td className="px-3 py-2 text-right">{totals.total}</td>
              <td className="px-3 py-2 text-right">{totals.active}</td>
              <td className="px-3 py-2 text-right">{totals.cancelled}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default EnrollmentReport;
