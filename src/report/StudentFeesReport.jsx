import React, { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import PageTopbar from "../components/PageTopbar";
import { printElement } from "../utils/print";
import { getStudentFees } from "../services/studentFeesService";

const BATCH_OPTIONS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

const todayISO = () => new Date().toISOString().slice(0, 10);

const normalizeIsoDate = (value) => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{2}-\d{2}-\d{4}$/.test(value)) {
    const [day, month, year] = value.split("-");
    return `${year}-${month}-${day}`;
  }
  return value;
};

const formatDate = (value) => {
  if (!value) return "-";
  const normalized = normalizeIsoDate(value);
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatCurrency = (amount) =>
  Number(amount || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });

const parseBatchFromEnrollment = (value) => {
  if (!value) return "-";
  const match = String(value).trim().match(/^\d{2}/);
  if (!match) return "-";
  const year = Number(match[0]);
  if (Number.isNaN(year)) return "-";
  return 2000 + year;
};

const StudentFeesReport = ({ onBack }) => {
  const today = useMemo(() => todayISO(), []);
  const thirtyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);

  const [batch, setBatch] = useState("");
  const [reportMode, setReportMode] = useState("batch");
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const printRef = useRef(null);

  const fetchAllFees = async (params) => {
    const all = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const response = await getStudentFees({ ...params, page });
      const result = response?.results || [];
      all.push(...result);
      totalPages = response?.num_pages || 1;
      page += 1;
    }

    return all;
  };

  const loadReport = async () => {
    setLoading(true);
    setError("");
    try {
      const params = {
        page_size: 1000,
        start_date: reportMode === "date" ? dateFrom || undefined : undefined,
        end_date: reportMode === "date" ? dateTo || undefined : undefined,
        batch: reportMode === "batch" ? batch || undefined : undefined,
      };

      const fees = await fetchAllFees(params);

      const latestByStudent = new Map();
      fees.forEach((fee) => {
        const key = fee.enrollment_no || fee.temp_enroll_no || "-";
        const dateStr = normalizeIsoDate(fee.receipt_date || "");
        const dateValue = dateStr ? new Date(dateStr).getTime() : 0;
        const prev = latestByStudent.get(key);

        if (!prev || dateValue > prev._dateValue) {
          latestByStudent.set(key, {
            ...fee,
            _dateValue: dateValue,
          });
        }
      });

      const tableRows = Array.from(latestByStudent.values()).map((fee) => ({
        batch: fee.batch || parseBatchFromEnrollment(fee.enrollment_no || fee.temp_enroll_no),
        enrollment_no: fee.enrollment_no || fee.temp_enroll_no || "-",
        student_name: fee.student_name || "-",
        last_paid_date: fee.receipt_date || "-",
        term: fee.term || "-",
        amount: fee.amount || 0,
        receipt_no: fee.receipt_no || "-",
      }));

      tableRows.sort((a, b) => {
        const batchA = Number(a.batch || 0);
        const batchB = Number(b.batch || 0);
        if (batchA !== batchB) return batchB - batchA;
        const dateA = new Date(normalizeIsoDate(a.last_paid_date)).getTime() || 0;
        const dateB = new Date(normalizeIsoDate(b.last_paid_date)).getTime() || 0;
        if (dateA !== dateB) return dateB - dateA;
        return a.student_name.localeCompare(b.student_name);
      });

      setRows(tableRows);
    } catch (err) {
      setError("Failed to load report data.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    printElement(printRef.current, { orientation: "landscape" });
  };

  const handlePdfExport = () => {
    if (!rows.length) return;

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(12);
    doc.text("Student Fees Last Paid Report", 14, 12);
    doc.setFontSize(9);
    if (reportMode === "batch") {
      doc.text(`Batch: ${batch || "All"}`, 14, 18);
    } else {
      doc.text(`Date: ${dateFrom} to ${dateTo}`, 14, 18);
    }

    const head = [["BATCH", "ENROLLMENT", "NAME", "LAST PAID", "TERM", "AMOUNT", "REC NO"]];
    const body = rows.map((r) => [
      r.batch,
      r.enrollment_no,
      r.student_name,
      formatDate(r.last_paid_date),
      r.term,
      Number(r.amount || 0).toFixed(2),
      r.receipt_no,
    ]);

    autoTable(doc, {
      head,
      body,
      startY: 24,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [100, 116, 139] },
    });

    doc.save(`Student_Fees_Last_Paid_${dateFrom}_to_${dateTo}.pdf`);
  };

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-4 md:p-6 bg-slate-100 min-h-screen space-y-4">
      <PageTopbar
        title="Student Fees Report"
        rightSlot={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="rounded bg-slate-700 px-4 py-2 text-white"
            >
              🖨️ Print
            </button>
            <button
              type="button"
              onClick={handlePdfExport}
              disabled={!rows.length}
              className="rounded bg-indigo-600 px-4 py-2 text-white"
            >
              📄 Export PDF
            </button>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="rounded bg-gray-200 px-4 py-2 text-gray-800"
              >
                ← Back
              </button>
            )}
          </div>
        }
      />

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Report By</label>
            <select
              value={reportMode}
              onChange={(e) => setReportMode(e.target.value)}
              className="border rounded px-3 py-2 bg-white"
            >
              <option value="batch">Batch</option>
              <option value="date">Date Range</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Batch</label>
            <select
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              className="border rounded px-3 py-2 bg-white"
              disabled={reportMode !== "batch"}
            >
              <option value="">All</option>
              {BATCH_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border rounded px-3 py-2"
              disabled={reportMode !== "date"}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border rounded px-3 py-2"
              disabled={reportMode !== "date"}
            />
          </div>
          <button
            type="button"
            onClick={loadReport}
            className="h-10 px-4 rounded bg-indigo-600 text-white"
            disabled={loading}
          >
            {loading ? "Loading..." : "Run Report"}
          </button>
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
      </div>

      <div ref={printRef} className="print-area report-wide">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b font-semibold text-slate-800">
            {reportMode === "batch" ? "Batch-wise Last Paid Fees" : "Date Range Last Paid Fees"}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-fixed">
              <colgroup>
                <col style={{ width: "8%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "30%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "8%" }} />
              </colgroup>
              <thead className="bg-gray-100 text-left text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-3 py-2 whitespace-nowrap">Batch</th>
                  <th className="px-3 py-2 whitespace-nowrap">Enrollment</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2 whitespace-nowrap">Last Paid</th>
                  <th className="px-3 py-2 whitespace-nowrap">Term</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Amount</th>
                  <th className="px-3 py-2 whitespace-nowrap">Rec No</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row, idx) => (
                  <tr key={`${row.enrollment_no}-${idx}`}>
                    <td className="px-3 py-2 whitespace-nowrap">{row.batch}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.enrollment_no}</td>
                    <td className="px-3 py-2 break-words">{row.student_name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.last_paid_date)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.term}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {formatCurrency(row.amount)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.receipt_no}</td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-center text-sm text-gray-500" colSpan={7}>
                      No report data available.
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td className="px-3 py-6 text-center text-sm text-gray-500" colSpan={7}>
                      Loading...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentFeesReport;
