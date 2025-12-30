import React, { useEffect, useMemo, useState, useRef } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import PageTopbar from "../components/PageTopbar";
import { fetchAllCashEntries } from "../services/cashRegisterService";
import { printElement } from "../utils/print";

/**
 * DATE-WISE TOTAL FEES SUMMARY REPORT
 * A4 Landscape – Daily Audit / Closing
 */

const FEE_COLUMNS = [
  { key: "SVF", label: "SVF" },
  { key: "PDF", label: "PDF" },
  { key: "MIGRA", label: "MIGRA" },
  { key: "CORR", label: "CORR" },
  { key: "ENROL", label: "ENROL" },
  { key: "PG REG", label: "PG REG" },
  { key: "RECHECK", label: "RECHECK" },
  { key: "DEGREE", label: "DEGREE" },
  { key: "EXAM", label: "EXAM FEES" },
  { key: "THESIS", label: "THESIS" },
  { key: "LIB", label: "LIB" },
  { key: "PEC", label: "PEC" },
  { key: "MSW", label: "MSW" },
  { key: "PHD", label: "PHD" },
  { key: "UNI DEV", label: "UNI DEV" },
  { key: "OTHER", label: "OTHER / PHD FORM" },
  { key: "EXT", label: "EXTENSION" },
  { key: "KYA", label: "KYA FEES" },
];

const PaymentReport = ({ onBack }) => {
  const REPORT_META = {
    Daily: {
      title: "Daily Fees Summary Report",
      column: "DATE",
      summaryWord: "days",
    },
    Monthly: {
      title: "Monthly Fees Summary Report",
      column: "MONTH",
      summaryWord: "months",
    },
    Quarterly: {
      title: "Quarterly Fees Summary Report",
      column: "QUARTER",
      summaryWord: "quarters",
    },
    "Half-Yearly": {
      title: "Half-Yearly Fees Summary Report",
      column: "HALF YEAR",
      summaryWord: "periods",
    },
    Yearly: {
      title: "Yearly Fees Summary Report",
      column: "YEAR",
      summaryWord: "years",
    },
  };

  const reportTitleMap = {
    Daily: "Daily Fees Summary Report",
    Monthly: "Monthly Fees Summary Report",
    Quarterly: "Quarterly Fees Summary Report",
    "Half-Yearly": "Half-Yearly Fees Summary Report",
    Yearly: "Yearly Fees Summary Report",
  };

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const thirtyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [recNoStart, setRecNoStart] = useState("");
  const [recNoEnd, setRecNoEnd] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [reportBy, setReportBy] = useState("Daily");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [pageError, setPageError] = useState("");
  const tableRef = useRef(null);

  /* ---------------- LOAD DATA FOR DATE RANGE & FILTERS ---------------- */
  useEffect(() => {
    loadReport();
  }, [dateFrom, dateTo, recNoStart, recNoEnd, paymentMode, reportBy]);

  const loadReport = async () => {
    if (!dateFrom || !dateTo) return;
    
    setLoading(true);
    setPageError("");
    
    try {
      // Fetch ALL pages of entries (handle pagination)
      let allData = [];
      let nextUrl = null;
      const response = await fetchAllCashEntries();
      
      // Parse response - fetchAllCashEntries returns array directly
      if (Array.isArray(response)) {
        allData = response;
      } else {
        allData = [];
      }
      
      // Ensure data is an array
      if (!Array.isArray(allData)) {
        allData = [];
      }
      
      // Helper function to convert DD-MM-YYYY to YYYY-MM-DD for comparison
      const convertDateFormat = (dateStr) => {
        if (!dateStr) return "";
        // Check if it's DD-MM-YYYY format
        if (dateStr.includes('-') && dateStr.length === 10) {
          const parts = dateStr.split('-');
          if (parts.length === 3 && parts[0].length === 2) {
            // DD-MM-YYYY format -> convert to YYYY-MM-DD
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
        }
        return dateStr; // Already in correct format or unknown
      };
      
      // Filter entries by date range, receipt number, and payment mode
      const filtered = allData.filter((e) => {
        // Date range filter
        const entryDate = e.date ? convertDateFormat(e.date) : "";
        const isInDateRange = entryDate >= dateFrom && entryDate <= dateTo;
        if (!isInDateRange) return false;
        
        // Payment mode filter - case insensitive
        if (paymentMode) {
          const entryMode = e.payment_mode ? String(e.payment_mode).trim().toUpperCase() : "";
          const filterMode = String(paymentMode).trim().toUpperCase();
          if (entryMode !== filterMode) {
            return false;
          }
        }
        
        // Receipt number range filter
        if (recNoStart || recNoEnd) {
          const recNoMatch = e.receipt_no_full ? String(e.receipt_no_full).match(/(\d{6})$/) : null;
          const recSeq = recNoMatch ? parseInt(recNoMatch[1], 10) : null;
          
          if (recSeq !== null) {
            if (recNoStart && recSeq < parseInt(recNoStart, 10)) return false;
            if (recNoEnd && recSeq > parseInt(recNoEnd, 10)) return false;
          }
        }
        
        return true;
      });

      // Group entries according to `reportBy` (Daily, Monthly, Quarterly, Half-Yearly, Yearly)
      const getGroupKey = (isoDate) => {
        if (!isoDate) return '';
        const d = new Date(isoDate + 'T00:00:00');
        const y = d.getFullYear();
        const m = d.getMonth() + 1; // 1-12
        switch (reportBy) {
          case 'Monthly':
            return `${y}-${String(m).padStart(2, '0')}`; // YYYY-MM
          case 'Quarterly': {
            const q = Math.floor((m - 1) / 3) + 1;
            return `${y}-Q${q}`;
          }
          case 'Half-Yearly': {
            const h = m <= 6 ? 'H1' : 'H2';
            return `${y}-${h}`;
          }
          case 'Yearly':
            return `${y}`;
          default:
            return isoDate; // Daily -> YYYY-MM-DD
        }
      };

      const formatGroupLabel = (key) => {
        if (!key) return '';
        if (reportBy === 'Daily') {
          return new Date(key + 'T00:00:00').toLocaleDateString('en-GB');
        }
        if (reportBy === 'Monthly') {
          const [y, mm] = key.split('-');
          const d = new Date(`${y}-${mm}-01T00:00:00`);
          return d.toLocaleString('en-GB', { month: 'short', year: 'numeric' });
        }
        if (reportBy === 'Quarterly') {
          const [y, q] = key.split('-Q');
          return `Q${q} ${y}`;
        }
        if (reportBy === 'Half-Yearly') {
          const [y, h] = key.split('-');
          return `${h} ${y}`;
        }
        // Yearly
        return key;
      };

      const extractSeqFromFull = (full) => {
        if (!full) return null;
        const m = String(full).match(/(\d{6})$/);
        return m ? parseInt(m[1], 10) : null;
      };

      const formatReceiptDisplay = (full) => {
        if (!full) return '';
        return String(full).replace(/\/(?=\d{6}$)/, '');
      };

      const grouped = {};
      filtered.forEach((entry) => {
        const entryIso = entry.date ? convertDateFormat(entry.date) : '';
        const key = getGroupKey(entryIso);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(entry);
      });

      // Build summary rows for each group key
      const summaryRows = Object.keys(grouped)
        .sort((a, b) => a.localeCompare(b))
        .map((key) => {
          const entries = grouped[key];
          const summary = {
            DATE: formatGroupLabel(key),
            GROUP_KEY: key,
            TOTAL: 0,
            REC_START: null,
            REC_END: null,
            DEPOSIT_BANK: 0,
            DAY_CLOSING: 0,
          };
          FEE_COLUMNS.forEach((c) => (summary[c.key] = 0));

          entries.forEach((e) => {
            // Convert amount to number (handle string amounts from API)
            const amountValue = parseFloat(String(e.amount || 0).trim()) || 0;
            const fee = e.fee_type_code;
            if (summary[fee] !== undefined) summary[fee] += amountValue;
            summary.TOTAL += amountValue;
          });

          const seqList = entries
            .map((e) => ({ seq: extractSeqFromFull(e.receipt_no_full), full: e.receipt_no_full }))
            .filter((s) => s.seq !== null)
            .sort((a, b) => a.seq - b.seq);

          if (seqList.length) {
            summary.REC_START = formatReceiptDisplay(seqList[0].full);
            summary.REC_END = formatReceiptDisplay(seqList[seqList.length - 1].full);
          }

          summary.DAY_CLOSING = summary.TOTAL;
          return summary;
        });

      setRows(summaryRows);
      
      if (summaryRows.length === 0) {
        setPageError("No entries found for the selected date range.");
      }
    } catch (err) {
      console.error("Error loading report:", err);
      setPageError("Failed to load report data. Please try again.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- PDF EXPORT & BROWSER PRINT ---------------- */
  const handlePrintAction = (action) => {
    if (rows.length === 0) {
      alert("No data to export");
      return;
    }

    if (action === "print") {
      // Browser print (uses print.js utility)
      if (tableRef.current) {
        const wrapper = document.createElement("div");
        wrapper.className = "report-wide print-area";
        wrapper.style.padding = "10mm";
        
        // Create title section
        const titleDiv = document.createElement("div");
        titleDiv.style.marginBottom = "15px";
        titleDiv.style.textAlign = "center";
        
        const titleH1 = document.createElement("h1");
        titleH1.textContent = REPORT_META[reportBy].title;
        titleH1.style.fontSize = "14px";
        titleH1.style.margin = "0 0 5px 0";
        titleH1.style.fontWeight = "bold";
        titleDiv.appendChild(titleH1);
        
        const periodP = document.createElement("p");
        periodP.textContent = `Period: ${dateFrom} to ${dateTo}`;
        periodP.style.fontSize = "11px";
        periodP.style.margin = "0";
        titleDiv.appendChild(periodP);
        
        wrapper.appendChild(titleDiv);
        
        // Clone table
        const tableClone = tableRef.current.cloneNode(true);
        wrapper.appendChild(tableClone);
        
        // Temporarily add to DOM for printing
        document.body.appendChild(wrapper);
        printElement(wrapper);
        document.body.removeChild(wrapper);
      }
    } else if (action === "pdf") {
      // PDF export (uses jsPDF)
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      doc.setFontSize(12);
      doc.text(REPORT_META[reportBy].title, 14, 10);
      doc.setFontSize(9);
      doc.text(`Period: ${dateFrom} to ${dateTo}`, 14, 16);

      const head = [
        [
          "DATE",
          ...FEE_COLUMNS.map((c) => c.label),
          "TOTAL",
          "REC START",
          "REC END",
          "DEPOSIT IN BANK",
          "DAY CLOSING",
        ],
      ];

      const body = rows.map((r) => [
        r.DATE,
        ...FEE_COLUMNS.map((c) => r[c.key] || 0),
        r.TOTAL,
        r.REC_START ?? "",
        r.REC_END ?? "",
        r.DEPOSIT_BANK,
        r.DAY_CLOSING,
      ]);

      // Add totals row
      const totalsRow = [
        "TOTAL",
        ...FEE_COLUMNS.map((c) => {
          return rows.reduce((sum, r) => sum + (parseFloat(r[c.key] || 0) || 0), 0);
        }),
        rows.reduce((sum, r) => sum + (parseFloat(r.TOTAL || 0) || 0), 0),
        "",
        "",
        rows.reduce((sum, r) => sum + (parseFloat(r.DEPOSIT_BANK || 0) || 0), 0),
        rows.reduce((sum, r) => sum + (parseFloat(r.DAY_CLOSING || 0) || 0), 0),
      ];

      body.push(totalsRow);

      // Use autoTable plugin with jsPDF v3
      autoTable(doc, {
        head,
        body,
        startY: 20,
        theme: "grid",
        styles: {
          fontSize: 7,
          cellPadding: 1.5,
          halign: "right",
        },
        headStyles: {
          fillColor: [100, 116, 139],
          halign: "center",
        },
        bodyStyles: {
          fillColor: [255, 255, 255],
        },
        didDrawPage: (data) => {
          // Footer
          const pageCount = doc.internal.pages.length - 1;
          doc.setFontSize(7);
          doc.text(
            `Page ${data.pageNumber} of ${pageCount}`,
            doc.internal.pageSize.getWidth() / 2,
            doc.internal.pageSize.getHeight() - 5,
            { align: "center" }
          );
        },
        margin: { left: 5, right: 5 },
      });

      doc.save(`Payment_Report_${dateFrom}_to_${dateTo}.pdf`);
    }
  };

  /* ---------------- CALCULATE TOTALS ---------------- */
  const columnTotals = useMemo(() => {
    const totals = {};
    FEE_COLUMNS.forEach((c) => (totals[c.key] = 0));
    totals.TOTAL = 0;
    totals.DEPOSIT_BANK = 0;
    totals.DAY_CLOSING = 0;

    rows.forEach((r) => {
      FEE_COLUMNS.forEach((c) => {
        // Ensure numeric conversion
        totals[c.key] += parseFloat(r[c.key] || 0) || 0;
      });
      totals.TOTAL += parseFloat(r.TOTAL || 0) || 0;
      totals.DEPOSIT_BANK += parseFloat(r.DEPOSIT_BANK || 0) || 0;
      totals.DAY_CLOSING += parseFloat(r.DAY_CLOSING || 0) || 0;
    });

    return totals;
  }, [rows]);

  const formatAmount = (value) => {
    return Number(value || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  /* ---------------- UI RENDER ---------------- */
  return (
    <div className="p-4 md:p-6 bg-slate-100 min-h-screen space-y-4">
      <PageTopbar
        title={REPORT_META[reportBy].title}
        rightSlot={
          <div className="flex items-center gap-3">
            <div className="relative group">
              <button
                disabled={loading || rows.length === 0}
                className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                📄 Print / PDF ▼
              </button>
              <div className="absolute right-0 mt-1 w-40 rounded border border-gray-200 bg-white shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <button
                  onClick={() => handlePrintAction("print")}
                  disabled={loading || rows.length === 0}
                  className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100 first:rounded-t disabled:text-gray-400"
                >
                  🖨️ Print to Paper
                </button>
                <button
                  onClick={() => handlePrintAction("pdf")}
                  disabled={loading || rows.length === 0}
                  className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100 last:rounded-b disabled:text-gray-400"
                >
                  📥 Export as PDF
                </button>
              </div>
            </div>
            {onBack && (
              <button
                onClick={onBack}
                className="rounded bg-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                ← Back
              </button>
            )}
          </div>
        }
      />

      <div className="px-1 text-sm text-gray-600 font-medium">
        Report Type:
        <span className="ml-1 font-semibold text-gray-900">
          {reportBy}
        </span>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              From Date
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              To Date
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Payment Mode
            </label>
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm min-w-[140px]"
            >
              <option value="">All Modes</option>
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
              <option value="UPI">UPI</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Report By
            </label>
            <select
              value={reportBy}
              onChange={(e) => setReportBy(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm min-w-[140px]"
            >
              <option value="Daily">Daily</option>
              <option value="Monthly">Monthly</option>
              <option value="Quarterly">Quarterly</option>
              <option value="Half-Yearly">Half-Yearly</option>
              <option value="Yearly">Yearly</option>
            </select>
          </div>

          <button
            onClick={() => {
              setDateFrom(thirtyDaysAgo);
              setDateTo(today);
              setPaymentMode("");
              setRecNoStart("");
              setRecNoEnd("");
              setReportBy("Daily");
            }}
            className="ml-auto rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
          >
            Reset Filters
          </button>
        </div>
      </section>

      {pageError && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {pageError}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-md font-semibold text-gray-800">
            {reportBy} Summary ({rows.length} {REPORT_META[reportBy].summaryWord})
          </h2>
        </div>

        {loading ? (
          <div className="py-20 text-center text-gray-500 font-semibold">
            Loading data…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded border border-dashed border-gray-300 p-6 text-center text-gray-600">
            <h4 className="text-lg font-semibold text-gray-700">No data available</h4>
            <p className="mt-1 text-sm text-gray-500">
              No entries found for the selected date range.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table ref={tableRef} className="min-w-full border border-gray-200 text-xs">
              <thead className="bg-slate-700 text-white">
                <tr>
                  <th className="border border-gray-200 px-2 py-2 font-semibold sticky left-0 z-10 bg-slate-700">
                    {REPORT_META[reportBy].column}
                  </th>
                  {FEE_COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      className={`border border-gray-200 px-2 py-2 font-semibold text-center ${
                        c.key === "OTHER" ? "whitespace-normal max-w-[80px]" : "whitespace-nowrap"
                      }`}
                    >
                      {c.label}
                    </th>
                  ))}
                  <th className="border border-gray-200 px-2 py-2 font-semibold text-center">
                    TOTAL
                  </th>
                  <th className="border border-gray-200 px-2 py-2 font-semibold text-center">
                    REC START
                  </th>
                  <th className="border border-gray-200 px-2 py-2 font-semibold text-center">
                    REC END
                  </th>
                  <th className="border border-gray-200 px-2 py-2 font-semibold text-center">
                    DEPOSIT IN BANK
                  </th>
                  <th className="border border-gray-200 px-2 py-2 font-semibold text-center">
                    DAY CLOSING
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50 even:bg-slate-50">
                    <td className="border border-gray-200 px-2 py-1 font-medium sticky left-0 z-10 bg-slate-100 even:bg-slate-50">
                      {r.DATE}
                    </td>
                    {FEE_COLUMNS.map((c) => (
                      <td
                        key={c.key}
                        className={`border border-gray-200 px-2 py-1 text-right ${
                          c.key === "OTHER" ? "max-w-[80px]" : ""
                        }`}
                      >
                        {formatAmount(r[c.key] || 0)}
                      </td>
                    ))}
                    <td className="border border-gray-200 px-2 py-1 text-right font-semibold bg-blue-50">
                      {formatAmount(r.TOTAL)}
                    </td>
                    <td className="border border-gray-200 px-2 py-1 text-center">
                      {r.REC_START || "-"}
                    </td>
                    <td className="border border-gray-200 px-2 py-1 text-center">
                      {r.REC_END || "-"}
                    </td>
                    <td className="border border-gray-200 px-2 py-1 text-right">
                      {formatAmount(r.DEPOSIT_BANK)}
                    </td>
                    <td className="border border-gray-200 px-2 py-1 text-right font-semibold bg-green-50">
                      {formatAmount(r.DAY_CLOSING)}
                    </td>
                  </tr>
                ))}
                {/* Totals Row */}
                <tr className="bg-slate-700 text-white font-bold">
                  <td className="border border-gray-200 px-2 py-2 sticky left-0 z-10 bg-slate-700">
                    {REPORT_META[reportBy].column === "DATE" ? "TOTAL" : "TOTAL"}
                  </td>
                  {FEE_COLUMNS.map((c) => (
                    <td
                      key={c.key}
                      className={`border border-gray-200 px-2 py-2 text-right ${
                        c.key === "OTHER" ? "max-w-[80px]" : ""
                      }`}
                    >
                      {formatAmount(columnTotals[c.key])}
                    </td>
                  ))}
                  <td className="border border-gray-200 px-2 py-2 text-right">
                    {formatAmount(columnTotals.TOTAL)}
                  </td>
                  <td className="border border-gray-200 px-2 py-2 text-center">-</td>
                  <td className="border border-gray-200 px-2 py-2 text-center">-</td>
                  <td className="border border-gray-200 px-2 py-2 text-right">
                    {formatAmount(columnTotals.DEPOSIT_BANK)}
                  </td>
                  <td className="border border-gray-200 px-2 py-2 text-right">
                    {formatAmount(columnTotals.DAY_CLOSING)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default PaymentReport;
