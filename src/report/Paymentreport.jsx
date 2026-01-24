import React, { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from 'react-router-dom';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import PageTopbar from "../components/PageTopbar";
import { fetchFeesAggregate, fetchRecRange } from "../services/cashRegisterService";

/**
 * PAYMENT REPORT (AUDIT SAFE)
 * Daily / Monthly / Quarterly / Half-Yearly / Yearly
 * Backend aggregated → frontend pivot only
 */

const REPORT_META = {
  Daily: { title: "Daily Fees Summary Report", column: "DATE", summaryWord: "days" },
  Monthly: { title: "Monthly Fees Summary Report", column: "MONTH", summaryWord: "months" },
  Quarterly: { title: "Quarterly Fees Summary Report", column: "QUARTER", summaryWord: "quarters" },
  "Half-Yearly": { title: "Half-Yearly Fees Summary Report", column: "HALF YEAR", summaryWord: "periods" },
  Yearly: { title: "Yearly Fees Summary Report", column: "YEAR", summaryWord: "years" },
};

const PaymentReport = ({ onBack }) => {
  const navigate = useNavigate();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const thirtyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [paymentMode, setPaymentMode] = useState("");
  const [reportBy, setReportBy] = useState("Daily");
  const [rows, setRows] = useState([]);
  const [feeCodes, setFeeCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const tableRef = useRef(null);

  // Receipt number filters
  const [recNoStart, setRecNoStart] = useState("");
  const [recNoEnd, setRecNoEnd] = useState("");

  /* ---------------- LOAD DATA ---------------- */

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line
  }, [dateFrom, dateTo, paymentMode, reportBy]);

  const loadReport = async () => {
    setLoading(true);
    setPageError("");
    try {
      const params = { date_from: dateFrom, date_to: dateTo, report_by: reportBy };
      if (paymentMode) params.payment_mode = paymentMode;

      // 1️⃣ Fetch period-based fee data
      const feeData = await fetchFeesAggregate(params);

      // 2️⃣ Fetch period-based receipt ranges
      const recRanges = await fetchRecRange(params);

      // Build map: period → {start, end}
      const recMap = {};
      recRanges.forEach(r => {
        recMap[r.period] = {
          REC_START: r.rec_start,
          REC_END: r.rec_end,
        };
      });

      if (!Array.isArray(feeData)) {
        setRows([]);
        setFeeCodes([]);
        return;
      }

      const codes = [...new Set(feeData.map(r => r.fee_type__code))].sort();
      setFeeCodes(codes);

      const map = {};
      feeData.forEach(r => {
        const period = r.period;
        if (!map[period]) {
          map[period] = {
            PERIOD: period,
            TOTAL: 0,
            DEPOSIT_BANK: 0,
            DAY_CLOSING: 0,
            REC_START: recMap[period]?.REC_START || "-",
            REC_END: recMap[period]?.REC_END || "-",
          };
          codes.forEach(c => (map[period][c] = 0));
        }
        map[period][r.fee_type__code] += Number(r.amount || 0);
        map[period].TOTAL += Number(r.amount || 0);
        map[period].DAY_CLOSING = map[period].TOTAL;
      });

      setRows(Object.values(map));
    } catch (err) {
      console.error(err);
      setPageError("Failed to load report data.");
      setRows([]);
      setFeeCodes([]);
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- PRINT & PDF ---------------- */
  const handlePdfExport = () => {
    if (!rows.length) return;

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    doc.setFontSize(12);
    doc.text(REPORT_META[reportBy].title, 14, 10);
    doc.setFontSize(9);
    doc.text(`Period: ${dateFrom} to ${dateTo}`, 14, 16);

    const head = [[
      REPORT_META[reportBy].column,
      ...feeCodes,
      "TOTAL",
      "REC START",
      "REC END",
      "DEPOSIT IN BANK",
      "DAY CLOSING",
    ]];

    const body = rows.map(r => [
      r.DATE,
      ...feeCodes.map(c => r[c] || 0),
      r.TOTAL,
      r.REC_START || "-",
      r.REC_END || "-",
      r.DEPOSIT_BANK,
      r.DAY_CLOSING,
    ]);

    autoTable(doc, {
      head,
      body,
      startY: 20,
      styles: { fontSize: 8, halign: "right" },
      headStyles: { fillColor: [100, 116, 139], halign: "center" },
    });

    doc.save(`Payment_Report_${dateFrom}_to_${dateTo}.pdf`);
  };

  const formatAmount = (v) =>
    Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });


  // Helper to format period label
  const formatPeriodLabel = (period) => {
    if (!period) return "";
    const d = new Date(period);
    if (isNaN(d)) return period;
    if (reportBy === "Monthly") return d.toLocaleString("en-IN", { month: "short", year: "numeric" });
    if (reportBy === "Yearly") return d.getFullYear();
    if (reportBy === "Quarterly") {
      const q = Math.floor(d.getMonth() / 3) + 1;
      return `Q${q}-${d.getFullYear()}`;
    }
    if (reportBy === "Half-Yearly") {
      const h = d.getMonth() < 6 ? 1 : 2;
      return `H${h}-${d.getFullYear()}`;
    }
    // Default: Daily
    const day = d.getDate().toString().padStart(2, '0');
    const month = d.toLocaleString('en-US', { month: 'short' });
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  };

  /* ---------------- UI ---------------- */
  return (
    <div className="p-4 md:p-6 bg-slate-100 min-h-screen space-y-4">
      <PageTopbar
        title={REPORT_META[reportBy].title}
        rightSlot={
          <div className="flex gap-2">
            <button
              onClick={handlePdfExport}
              disabled={loading || rows.length === 0}
              className="rounded bg-indigo-600 px-4 py-2 text-white"
            >
              📄 Export PDF
            </button>
            {onBack ? (
              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-200 px-3 py-2 text-sm font-semibold text-gray-800 shadow border border-gray-300"
              >
                ← Back to Cash Register
              </button>
            ) : (
              <a
                href="/cash-register"
                className="inline-flex items-center gap-2 rounded-lg bg-gray-200 px-3 py-2 text-sm font-semibold text-gray-800 shadow border border-gray-300"
              >
                ← Back to Cash Register
              </a>
            )}
            {onBack && (
              <button
                onClick={onBack}
                className="rounded bg-slate-600 px-4 py-2 text-white"
              >
                ← Back
              </button>
            )}
          </div>
        }
      />

      {/* Report Type Text */}
      <div className="px-1 text-sm text-gray-600 font-medium">
        Report Type:
        <span className="ml-1 font-semibold text-gray-900">
          {reportBy}
        </span>
      </div>

      {/* Filter Card - Exact Match UI */}
      <section className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-6">

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              From Date
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm min-w-[150px]"
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
              className="rounded-md border border-gray-300 px-3 py-2 text-sm min-w-[150px]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Payment Mode
            </label>
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm min-w-[160px]"
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
              className="rounded-md border border-gray-300 px-3 py-2 text-sm min-w-[160px]"
            >
              <option value="Daily">Daily</option>
              <option value="Monthly">Monthly</option>
              <option value="Quarterly">Quarterly</option>
              <option value="Half-Yearly">Half-Yearly</option>
              <option value="Yearly">Yearly</option>
            </select>
          </div>

          <div className="ml-auto">
            <button
              onClick={() => {
                setDateFrom(thirtyDaysAgo);
                setDateTo(today);
                setPaymentMode("");
                setReportBy("Daily");
              }}
              className="rounded-md border border-gray-300 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              Reset Filters
            </button>
          </div>

        </div>
      </section>

      {pageError && <div className="text-red-600">{pageError}</div>}

      {/* Table - Sticky & Professional, with dd-mmm-yyyy date */}
      <div className="overflow-x-auto">
        {loading ? (
          <p className="text-center">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-center">No data found</p>
        ) : (
          <table
            ref={tableRef}
            className="min-w-full border-collapse border border-gray-200 text-xs"
          >
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="sticky left-0 z-20 bg-slate-800 border px-3 py-2">
                  {REPORT_META[reportBy].column}
                </th>
                {feeCodes.map((c) => {
                  // Wrap and shrink for specific columns
                  let label = c;
                  let thClass = "border px-2 py-2 text-center";
                  if (c.toLowerCase().includes("phd") || c.toLowerCase().includes("form")) {
                    label = c.replace(/\//g, '/<br/>');
                    thClass += " whitespace-normal min-w-[60px] max-w-[80px] text-xs";
                  } else if (c.toLowerCase().includes("recheck") || c.toLowerCase().includes("reasse")) {
                    label = c.replace(/\//g, '/<br/>');
                    thClass += " whitespace-normal min-w-[60px] max-w-[80px] text-xs";
                  } else {
                    thClass += " whitespace-nowrap min-w-[50px] max-w-[100px] text-xs";
                  }
                  return (
                    <th key={c} className={thClass} dangerouslySetInnerHTML={{__html: label}} />
                  );
                })}
                <th className="border px-3 py-2 text-center">TOTAL</th>
                <th className="border px-3 py-2 text-center">REC START</th>
                <th className="border px-3 py-2 text-center">REC END</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="even:bg-slate-50 hover:bg-slate-100">
                  <td className="sticky left-0 z-10 bg-white border px-1 py-1 font-semibold min-w-[90px] max-w-[110px] text-center">
                    {formatPeriodLabel(r.PERIOD)}
                  </td>
                  {feeCodes.map((c) => (
                    <td key={c} className="border px-3 py-1 text-right">
                      {Number(r[c] || 0).toLocaleString("en-IN")}
                    </td>
                  ))}
                  <td className="border px-3 py-1 text-right font-semibold bg-blue-50">
                    {Number(r.TOTAL || 0).toLocaleString("en-IN")}
                  </td>
                  <td className="border px-3 py-1 text-center">
                    {r.REC_START || "-"}
                  </td>
                  <td className="border px-3 py-1 text-center">
                    {r.REC_END || "-"}
                  </td>
                </tr>
              ))}

              {/* TOTAL ROW */}
              <tr className="bg-slate-800 text-white font-bold">
                <td className="sticky left-0 z-20 bg-slate-800 border px-3 py-2">
                  TOTAL
                </td>
                {feeCodes.map((c) => (
                  <td key={c} className="border px-3 py-2 text-right">
                    {rows.reduce((s, r) => s + (Number(r[c]) || 0), 0).toLocaleString("en-IN")}
                  </td>
                ))}
                <td className="border px-3 py-2 text-right">
                  {rows.reduce((s, r) => s + (Number(r.TOTAL) || 0), 0).toLocaleString("en-IN")}
                </td>
                <td className="border px-3 py-2 text-center">-</td>
                <td className="border px-3 py-2 text-center">-</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default PaymentReport;
