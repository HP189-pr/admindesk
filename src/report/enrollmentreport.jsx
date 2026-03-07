import React, { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getEnrollmentReportSummary } from "../services/enrollmentservice";

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

const EnrollmentReport = ({ onBack }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  const handleExportExcel = () => {
    if (!summaryRows.length) return;

    const groupLabel = GROUP_LABELS[groupBy] || "Group";
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

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "EnrollmentReport");
    XLSX.writeFile(wb, `enrollment_report_${groupBy}.xlsx`);
  };

  const handleExportPdf = () => {
    if (!summaryRows.length) return;

    const groupLabel = GROUP_LABELS[groupBy] || "Group";
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    doc.setFontSize(14);
    doc.text("Enrollment Report", 14, 12);
    doc.setFontSize(10);
    doc.text(`Grouped By: ${GROUP_OPTIONS.find((o) => o.value === groupBy)?.label || groupBy}`, 14, 18);
    doc.text(`Status: ${STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label || statusFilter}`, 14, 23);

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

    doc.save(`enrollment_report_${groupBy}.pdf`);
  };

  const handleResetFilters = () => {
    setGroupBy("batch");
    setStatusFilter("all");
    setBatchFilter("");
    setInstituteFilter("");
    setCourseFilter("");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Enrollment Report</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => loadReportSummary()}
            className="rounded bg-slate-700 px-4 py-2 text-white"
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={!summaryRows.length}
            className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
          >
            Export PDF
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={!summaryRows.length}
            className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
          >
            Export Excel
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="rounded bg-gray-200 px-4 py-2 text-gray-800"
            >
              Back
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3 bg-white border border-slate-200 rounded-xl p-3">
        <label className="text-sm">
          <span className="block mb-1 font-medium">Group By</span>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            className="w-full border rounded px-3 py-2"
          >
            {GROUP_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="block mb-1 font-medium">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full border rounded px-3 py-2"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="block mb-1 font-medium">Batch</span>
          <select
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            className="w-full border rounded px-3 py-2"
          >
            <option value="">All</option>
            {batchOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="block mb-1 font-medium">Institute</span>
          <select
            value={instituteFilter}
            onChange={(e) => setInstituteFilter(e.target.value)}
            className="w-full border rounded px-3 py-2"
          >
            <option value="">All</option>
            {instituteOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="block mb-1 font-medium">Course</span>
          <select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className="w-full border rounded px-3 py-2"
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
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Filtered Enrollment Rows</p>
          <p className="text-xl font-semibold">{totals.total}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Active</p>
          <p className="text-xl font-semibold text-emerald-600">{totals.active}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Cancelled</p>
          <p className="text-xl font-semibold text-red-600">{totals.cancelled}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
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
