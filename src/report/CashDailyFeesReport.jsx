import React, { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import "jspdf-autotable";
import PageTopbar from "../components/PageTopbar";
import { fetchFeesAggregate } from "../services/cashRegisterService";

/**
 * DAILY FEES-WISE SUMMARY REPORT
 * A4 Landscape – Audit / Closing
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

const CashDailyFeesReport = ({ onBack }) => {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const thirtyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [paymentMode, setPaymentMode] = useState("");
  const [recNoStart, setRecNoStart] = useState("");
  const [recNoEnd, setRecNoEnd] = useState("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  /* ---------------- LOAD DATA ---------------- */
  useEffect(() => {
    loadReport();
  }, [dateFrom, dateTo, paymentMode, recNoStart, recNoEnd]);

  // Normalize arbitrary date values (ISO string, Date object, or dd-mm-yyyy)
  const normalizeDate = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
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

  const loadReport = async () => {
    setLoading(true);
    try {
      // Use backend-safe parameter names `date_from` / `date_to`
      // Normalize dates to YYYY-MM-DD to match backend expectations
      const params = { date_from: normalizeDate(dateFrom), date_to: normalizeDate(dateTo) };
      if (paymentMode) params.payment_mode = paymentMode.toUpperCase();
      const resp = await fetchFeesAggregate(params);
      console.log("FEES AGG RESPONSE", resp);

      // Support multiple backend shapes:
      // - { receipts: [...] }
      // - { results: [...] } (paginated)
      // - Array of receipts or flat rows
      let receipts = [];
      if (resp == null) {
        receipts = [];
      } else if (Array.isArray(resp)) {
        // might be already grouped receipts or flat rows
        receipts = resp;
      } else if (resp.receipts && Array.isArray(resp.receipts)) {
        receipts = resp.receipts;
      } else if (resp.results && Array.isArray(resp.results)) {
        receipts = resp.results;
      } else if (resp.data && Array.isArray(resp.data)) {
        receipts = resp.data;
      } else {
        // fallback: try to use resp as records container
        receipts = [];
      }

      // If receipts look like flat rows (each row is one item), group them by receipt_no_full
      const looksFlat = receipts.length > 0 && !receipts[0].items && (receipts[0].fee_type_code || receipts[0].fee_type || receipts[0].amount);
      if (looksFlat) {
        const grouped = {};
        receipts.forEach((row) => {
          const key = row.receipt_no_full || `__${row.id || Math.random()}`;
          if (!grouped[key]) {
            grouped[key] = {
              date: row.date,
              payment_mode: row.payment_mode,
              receipt_no_full: row.receipt_no_full,
              rec_ref: row.rec_ref,
              rec_no: row.rec_no,
              items: [],
            };
          }
          grouped[key].items.push({ code: row.fee_type_code || row.code || (row.fee_type && String(row.fee_type)), amount: row.amount });
        });
        receipts = Object.values(grouped);
      }

      // Optionally filter by recNo range
      let filteredReceipts = receipts;
      if (recNoStart || recNoEnd) {
        const start = recNoStart ? parseInt(recNoStart, 10) : null;
        const end = recNoEnd ? parseInt(recNoEnd, 10) : null;
        filteredReceipts = receipts.filter((r) => {
          const seqMatch = String(r.receipt_no_full || '').match(/(\d{6})$/);
          const seq = seqMatch ? parseInt(seqMatch[1], 10) : null;
          if (seq === null) return false;
          if (start !== null && seq < start) return false;
          if (end !== null && seq > end) return false;
          return true;
        });
      }

      // Group receipts by normalized YYYY-MM-DD date
      const grouped = {};
      filteredReceipts.forEach((r) => {
        const d = normalizeDate(r.date);
        if (!d) return;
        if (!grouped[d]) grouped[d] = [];
        grouped[d].push(r);
      });

      const summaryRows = Object.keys(grouped)
        .sort((a, b) => a.localeCompare(b))
        .map((d) => {
          const entries = grouped[d];
          const summary = {
            DATE: new Date(d + 'T00:00:00').toLocaleDateString('en-GB'),
            TOTAL: 0,
            REC_START: null,
            REC_END: null,
            DEPOSIT_BANK: 0,
            DAY_CLOSING: 0,
          };
          FEE_COLUMNS.forEach((c) => (summary[c.key] = 0));

          const seqList = [];
          entries.forEach((rec) => {
            // each receipt has items with code and amount
            const items = rec.items || (rec.fee_type_code || rec.amount ? [{ code: rec.fee_type_code || rec.code || (rec.name && rec.name.toUpperCase()), amount: rec.amount }] : []);
            (items || []).forEach((it) => {
              const code = it.code || (it.name ? it.name.toUpperCase() : null);
              if (code && summary[code] !== undefined) {
                summary[code] += Number(it.amount || 0);
              } else if (code) {
                // Unknown codes accumulate into OTHER
                summary['OTHER'] = (summary['OTHER'] || 0) + Number(it.amount || 0);
              }
              summary.TOTAL += Number(it.amount || 0);
            });
            seqList.push({ seq: extractSeqFromFull(rec.receipt_no_full), full: rec.receipt_no_full });
          });

          const validSeqs = seqList.filter(s => s.seq !== null).sort((x, y) => x.seq - y.seq);
          if (validSeqs.length) {
            summary.REC_START = formatReceiptDisplay(validSeqs[0].full);
            summary.REC_END = formatReceiptDisplay(validSeqs[validSeqs.length - 1].full);
          }
          summary.DAY_CLOSING = summary.TOTAL;
          return summary;
        });

      console.log('SUMMARY ROWS', summaryRows);

      setRows(summaryRows);
    } catch (err) {
      console.error('Error loading report:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- PDF EXPORT ---------------- */
  const printPdf = () => {
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    doc.setFontSize(12);
    doc.text("Daily Fees Summary Report", 14, 10);
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

    doc.autoTable({
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
      margin: { left: 5, right: 5 },
    });

    doc.save(`Daily_Fees_Summary_${date}.pdf`);
  };

  /* ---------------- UI RENDER ---------------- */
  return (
    <div className="p-4 md:p-6 bg-slate-100 min-h-screen space-y-4">
      <PageTopbar
        title="Daily Fees Summary Report"
        rightSlot={
          <div className="flex items-center gap-3">
            <button
              onClick={printPdf}
              disabled={loading || rows.length === 0}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              📄 Print / PDF
            </button>
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

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Filters</h2>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <label className="text-sm font-medium text-gray-700">
            From Date
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1 rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            To Date
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-1 rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Payment Mode
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              className="mt-1 rounded border border-gray-300 px-3 py-2"
            >
              <option value="">All Modes</option>
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
              <option value="UPI">UPI</option>
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Start Rec No
            <input
              type="number"
              min="0"
              value={recNoStart}
              onChange={(e) => setRecNoStart(e.target.value)}
              placeholder="From"
              className="mt-1 rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            End Rec No
            <input
              type="number"
              min="0"
              value={recNoEnd}
              onChange={(e) => setRecNoEnd(e.target.value)}
              placeholder="To"
              className="mt-1 rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <button
            onClick={() => {
              setDateFrom(thirtyDaysAgo);
              setDateTo(today);
              setPaymentMode("");
              setRecNoStart("");
              setRecNoEnd("");
            }}
            className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Reset Filters
          </button>
        </div>

        {loading ? (
          <div className="py-20 text-center text-gray-600 font-semibold">
            Loading configuration…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-20 text-center text-gray-500">
            <h4 className="text-lg font-semibold text-gray-700">No Data</h4>
            <p className="mt-1 text-sm text-gray-500">No entries found for the selected date.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse border border-gray-300 text-xs">
              <thead className="bg-slate-700 text-white">
                <tr>
                  <th className="border border-gray-300 px-2 py-2 text-left">DATE</th>
                  {FEE_COLUMNS.map((c) => (
                    <th key={c.key} className="border border-gray-300 px-2 py-2 whitespace-nowrap text-right">
                      {c.label}
                    </th>
                  ))}
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold">TOTAL</th>
                  <th className="border border-gray-300 px-2 py-2 text-right">REC START</th>
                  <th className="border border-gray-300 px-2 py-2 text-right">REC END</th>
                  <th className="border border-gray-300 px-2 py-2 text-right">DEPOSIT IN BANK</th>
                  <th className="border border-gray-300 px-2 py-2 text-right font-semibold">DAY CLOSING</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="even:bg-slate-50 hover:bg-slate-100">
                    <td className="border border-gray-300 px-2 py-1 font-semibold text-left">{r.DATE}</td>
                    {FEE_COLUMNS.map((c) => (
                      <td key={c.key} className="border border-gray-300 px-2 py-1 text-right">
                        {Number(r[c.key] || 0).toLocaleString('en-IN')}
                      </td>
                    ))}
                    <td className="border border-gray-300 px-2 py-1 text-right font-semibold bg-yellow-50">
                      {Number(r.TOTAL || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="border border-gray-300 px-2 py-1 text-right">{r.REC_START || '—'}</td>
                    <td className="border border-gray-300 px-2 py-1 text-right">{r.REC_END || '—'}</td>
                    <td className="border border-gray-300 px-2 py-1 text-right">
                      {Number(r.DEPOSIT_BANK || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="border border-gray-300 px-2 py-1 text-right font-semibold bg-green-50">
                      {Number(r.DAY_CLOSING || 0).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default CashDailyFeesReport;
