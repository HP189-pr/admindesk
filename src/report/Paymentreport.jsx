// src/report/Paymentreport.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FaFileExcel, FaFilePdf } from 'react-icons/fa6';
import PageTopbar from "../components/PageTopbar";
import { fetchCashOutward, fetchFeesAggregate, fetchRecRange } from "../services/cashRegisterService";

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

const PAYMENT_MODE_TITLES = {
  CASH: 'Cash Statement',
  BANK: 'Bank Statement',
  UPI: 'UPI Statement',
};

const EXPORT_EXCEL_BUTTON_CLASS = 'inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-100 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50';
const EXPORT_PDF_BUTTON_CLASS = 'inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 shadow-sm shadow-rose-100 transition duration-200 hover:-translate-y-0.5 hover:bg-rose-100 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50';

const getFiscalYearStart = (baseDate = new Date()) => {
  const current = new Date(baseDate);
  const startYear = current.getMonth() >= 3 ? current.getFullYear() : current.getFullYear() - 1;
  return `${startYear}-04-01`;
};

const formatReceiptDisplay = (value) => {
  if (!value) return "-";
  const raw = String(value).trim();
  if (!raw) return "-";

  // 1471/2025000762 -> 1471/25/R000762
  const yearSeqMatch = raw.match(/^(.+?)\/(\d{4})(\d{6})$/);
  if (yearSeqMatch) {
    const prefix = yearSeqMatch[1];
    const fy = yearSeqMatch[2].slice(-2);
    const seq = yearSeqMatch[3];
    return `${prefix}/${fy}/R${seq}`;
  }

  // B16/25/000001 -> B16/25/R000001
  const missingRMatch = raw.match(/^(.+?)\/(\d{2})\/(\d{6})$/);
  if (missingRMatch) {
    const prefix = missingRMatch[1];
    const fy = missingRMatch[2];
    const seq = missingRMatch[3];
    return `${prefix}/${fy}/R${seq}`;
  }

  // 1471/25/R/000001 -> 1471/25/R000001
  return raw.replace(/\/R\/(\d{6})$/i, "/R$1");
};

const parseDateParts = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    };
  }

  match = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) {
    return {
      year: Number(match[3]),
      month: Number(match[2]),
      day: Number(match[1]),
    };
  }

  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  return {
    year: dt.getFullYear(),
    month: dt.getMonth() + 1,
    day: dt.getDate(),
  };
};

const formatDateSlash = (value) => {
  if (!value) return '';
  const parts = parseDateParts(value);
  if (!parts) return String(value);
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
};

const getReportPeriodKey = (value, reportBy) => {
  if (!value) return '';
  const parts = parseDateParts(value);
  if (!parts) return '';

  if (reportBy === 'Yearly') {
    return `${parts.year}-01-01`;
  }

  if (reportBy === 'Half-Yearly') {
    const month = parts.month <= 6 ? 1 : 7;
    return `${parts.year}-${String(month).padStart(2, '0')}-01`;
  }

  if (reportBy === 'Quarterly') {
    const quarterStartMonth = Math.floor((parts.month - 1) / 3) * 3 + 1;
    return `${parts.year}-${String(quarterStartMonth).padStart(2, '0')}-01`;
  }

  if (reportBy === 'Monthly') {
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-01`;
  }

  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
};

const hasPeriodActivity = (row) => {
  if (!row) return false;
  if (Number(row.TOTAL || 0) !== 0) return true;
  if (Number(row.DEPOSIT_BANK || 0) !== 0) return true;
  if (Array.isArray(row.ACCOUNT_RANGES) && row.ACCOUNT_RANGES.length > 0) return true;
  if (row.REC_START && row.REC_START !== '-') return true;
  if (row.REC_END && row.REC_END !== '-') return true;
  return false;
};

const hasMeaningfulReceiptValue = (value) => {
  const text = String(value || '').trim();
  return Boolean(text) && text !== '-' && text !== '--';
};

const isPeriodWithinSelectedRange = (period, dateFrom, dateTo, reportBy) => {
  const periodKey = getReportPeriodKey(period, reportBy);
  const startKey = getReportPeriodKey(dateFrom, reportBy);
  const endKey = getReportPeriodKey(dateTo, reportBy);

  if (!periodKey || !startKey || !endKey) return false;
  return periodKey >= startKey && periodKey <= endKey;
};

const formatReportAmount = (value) =>
  Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

const formatPdfHeading = (label) => {
  const text = String(label || '').trim();
  if (!text) return '';
  if (text.length <= 10) return text;
  if (text.includes('/')) return text.replace(/\//g, '/\n');
  if (text.includes(' ')) return text.replace(/\s+/g, '\n');
  return text;
};

const getMaxTextLength = (values) =>
  (Array.isArray(values) ? values : []).reduce((maxLength, value) => {
    const text = String(value ?? '').trim();
    if (!text) return maxLength;
    const segmentLengths = text
      .split(/,\s*|\n/)
      .map((segment) => segment.trim().length)
      .filter(Boolean);
    const longestSegment = segmentLengths.length ? Math.max(...segmentLengths) : text.length;
    return Math.max(maxLength, text.length, longestSegment);
  }, 0);

const getPdfColumnWidth = (values, minWidth, maxWidth, widthPerChar = 1.7) => {
  const longest = getMaxTextLength(values);
  if (!longest) return minWidth;
  return Math.max(minWidth, Math.min(maxWidth, Math.ceil(longest * widthPerChar)));
};

const PaymentReport = ({ onBack }) => {
  const navigate = useNavigate();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const fiscalYearStart = useMemo(() => getFiscalYearStart(), []);

  const [dateFrom, setDateFrom] = useState(fiscalYearStart);
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

  const reportRows = useMemo(
    () => rows.filter((row) => hasPeriodActivity(row)),
    [rows]
  );

  const visibleScreenRows = useMemo(
    () => reportRows.filter((row) => {
      const hasFeeAmount = feeCodes.some((code) => Number(row?.[code] || 0) !== 0);
      const hasReceiptRange = hasMeaningfulReceiptValue(row?.REC_START) || hasMeaningfulReceiptValue(row?.REC_END);
      const hasAccountRanges = Array.isArray(row?.ACCOUNT_RANGES)
        && row.ACCOUNT_RANGES.some((range) => hasMeaningfulReceiptValue(range?.rec_start) || hasMeaningfulReceiptValue(range?.rec_end));

      return hasFeeAmount || Number(row?.TOTAL || 0) !== 0 || hasReceiptRange || hasAccountRanges;
    }),
    [feeCodes, reportRows]
  );

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

      const shouldIncludeCashDeposit = !paymentMode || paymentMode === 'CASH';
      const [feeData, recRanges, outwardData] = await Promise.all([
        fetchFeesAggregate(params),
        fetchRecRange(params),
        shouldIncludeCashDeposit ? fetchCashOutward({ date_from: dateFrom, date_to: dateTo }) : Promise.resolve([]),
      ]);

      // Build map: period → {start, end}
      const recMap = {};
      recRanges.forEach(r => {
        recMap[r.period] = {
          REC_START: r.rec_start,
          REC_END: r.rec_end,
          ACCOUNT_RANGES: Array.isArray(r.account_ranges) ? r.account_ranges : [],
        };
      });

      const outwardRows = Array.isArray(outwardData)
        ? outwardData
        : (Array.isArray(outwardData?.results) ? outwardData.results : []);

      const depositMap = {};
      outwardRows.forEach((row) => {
        if (String(row?.txn_type || '').toUpperCase() !== 'DEPOSIT') return;
        const periodKey = getReportPeriodKey(row?.date, reportBy);
        if (!periodKey) return;
        depositMap[periodKey] = (depositMap[periodKey] || 0) + (Number(row?.amount) || 0);
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
            ACCOUNT_RANGES: recMap[period]?.ACCOUNT_RANGES || [],
          };
          codes.forEach(c => (map[period][c] = 0));
        }
        map[period][r.fee_type__code] += Number(r.amount || 0);
        map[period].TOTAL += Number(r.amount || 0);
      });

      Object.keys(depositMap).forEach((period) => {
        if (!map[period]) {
          map[period] = {
            PERIOD: period,
            TOTAL: 0,
            DEPOSIT_BANK: 0,
            DAY_CLOSING: 0,
            REC_START: recMap[period]?.REC_START || "-",
            REC_END: recMap[period]?.REC_END || "-",
            ACCOUNT_RANGES: recMap[period]?.ACCOUNT_RANGES || [],
          };
          codes.forEach(c => (map[period][c] = 0));
        }
      });

      Object.keys(map).forEach((period) => {
        map[period].DEPOSIT_BANK = Number(depositMap[period] || 0);
        map[period].DAY_CLOSING = null;
      });

      const sortedRows = Object.values(map)
          .filter((row) => isPeriodWithinSelectedRange(row.PERIOD, dateFrom, dateTo, reportBy))
          .filter((row) => hasPeriodActivity(row))
          .sort((left, right) => String(left.PERIOD || '').localeCompare(String(right.PERIOD || '')));

      if (paymentMode === 'CASH') {
        let runningClosingBalance = 0;
        sortedRows.forEach((row) => {
          runningClosingBalance += Number(row.TOTAL || 0) - Number(row.DEPOSIT_BANK || 0);
          row.DAY_CLOSING = runningClosingBalance;
        });
      }

      setRows(sortedRows);
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
  const handleExcelExport = () => {
    if (!reportRows.length) return;

    const showCashDayClosing = paymentMode === 'CASH';
    const headers = [
      REPORT_META[reportBy].column,
      ...feeCodes,
      'TOTAL',
      'REC START',
      'REC END',
      'CASH DEPOSIT',
      'DAY CLOSING',
    ];

    const dataRows = reportRows.map((row) => [
      formatPeriodLabel(row.PERIOD),
      ...feeCodes.map((code) => Number(row[code] || 0)),
      Number(row.TOTAL || 0),
      row.ACCOUNT_RANGES?.length
        ? row.ACCOUNT_RANGES.map((range) => formatReceiptDisplay(range.rec_start)).join(', ')
        : formatReceiptDisplay(row.REC_START),
      row.ACCOUNT_RANGES?.length
        ? row.ACCOUNT_RANGES.map((range) => formatReceiptDisplay(range.rec_end)).join(', ')
        : formatReceiptDisplay(row.REC_END),
      Number(row.DEPOSIT_BANK || 0),
      showCashDayClosing ? Number(row.DAY_CLOSING || 0) : '--',
    ]);

    const totalsRow = [
      'TOTAL',
      ...feeCodes.map((code) => reportRows.reduce((sum, row) => sum + (Number(row[code]) || 0), 0)),
      reportRows.reduce((sum, row) => sum + (Number(row.TOTAL) || 0), 0),
      '-',
      '-',
      reportRows.reduce((sum, row) => sum + (Number(row.DEPOSIT_BANK) || 0), 0),
      showCashDayClosing && reportRows.length ? Number(reportRows[reportRows.length - 1].DAY_CLOSING || 0) : '--',
    ];

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows, totalsRow]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Statement');
    XLSX.writeFile(workbook, `payment_statement_${dateFrom}_to_${dateTo}.xlsx`);
  };

  const handlePdfExport = () => {
    if (!reportRows.length) return;

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    const statementTitle = PAYMENT_MODE_TITLES[paymentMode] || 'All Payment Mode Statement';
    const periodLabel = `${formatDateSlash(dateFrom)} to ${formatDateSlash(dateTo)}`;
    const depositColumnIndex = feeCodes.length + 4;
    const dayClosingColumnIndex = feeCodes.length + 5;
    const showCashDayClosing = paymentMode === 'CASH';

    doc.setFontSize(12);
    doc.text(statementTitle, 14, 10);
    doc.setFontSize(9);
    doc.text(`Period: ${periodLabel}`, 14, 16);
    doc.text(`Report By: ${reportBy}`, 14, 21);

    const head = [[
      formatPdfHeading(REPORT_META[reportBy].column),
      ...feeCodes.map((code) => formatPdfHeading(code)),
      "TOTAL",
      "REC\nSTART",
      "REC\nEND",
      "CASH\nDEPOSIT",
      "DAY\nCLOSING",
    ]];

    const body = reportRows.map(r => [
      formatPeriodLabel(r.PERIOD),
      ...feeCodes.map(c => formatReportAmount(r[c])),
      formatReportAmount(r.TOTAL),
      (r.ACCOUNT_RANGES?.length
        ? r.ACCOUNT_RANGES.map(a => formatReceiptDisplay(a.rec_start)).join(", ")
        : formatReceiptDisplay(r.REC_START)),
      (r.ACCOUNT_RANGES?.length
        ? r.ACCOUNT_RANGES.map(a => formatReceiptDisplay(a.rec_end)).join(", ")
        : formatReceiptDisplay(r.REC_END)),
      formatReportAmount(r.DEPOSIT_BANK),
      showCashDayClosing
        ? formatReportAmount(r.DAY_CLOSING)
        : '--',
    ]);

    const amountColumnWidth = getPdfColumnWidth(
      body.flatMap((row) => row.slice(1, feeCodes.length + 2).concat(row[depositColumnIndex], row[dayClosingColumnIndex])),
      13,
      21,
      1.35
    );
    const periodColumnWidth = getPdfColumnWidth(
      body.map((row) => row[0]),
      reportBy === 'Daily' ? 24 : 18,
      30,
      1.8
    );
    const recStartColumnWidth = getPdfColumnWidth(
      body.map((row) => row[feeCodes.length + 2]),
      28,
      44,
      1.35
    );
    const recEndColumnWidth = getPdfColumnWidth(
      body.map((row) => row[feeCodes.length + 3]),
      28,
      44,
      1.35
    );

    const columnStyles = {
      0: { halign: 'left', cellWidth: periodColumnWidth },
      [feeCodes.length + 1]: { halign: 'right', cellWidth: amountColumnWidth },
      [feeCodes.length + 2]: { halign: 'left', cellWidth: recStartColumnWidth },
      [feeCodes.length + 3]: { halign: 'left', cellWidth: recEndColumnWidth },
      [depositColumnIndex]: { halign: 'right', cellWidth: amountColumnWidth },
      [dayClosingColumnIndex]: { halign: 'right', cellWidth: amountColumnWidth },
    };

    feeCodes.forEach((_, index) => {
      columnStyles[index + 1] = { halign: 'right', cellWidth: amountColumnWidth };
    });

    autoTable(doc, {
      head,
      body,
      startY: 26,
      theme: 'grid',
      tableWidth: 'auto',
      styles: { fontSize: 7.2, halign: "right", valign: 'middle', cellPadding: 1.4, overflow: 'linebreak' },
      headStyles: { fillColor: [100, 116, 139], halign: "center", valign: 'middle', textColor: [255, 255, 255], fontSize: 7 },
      columnStyles,
    });

    doc.save(`Payment_Report_${dateFrom}_to_${dateTo}.pdf`);
  };

  const formatAmount = (v) =>
    formatReportAmount(v);


  // Helper to format period label
  const formatPeriodLabel = (period) => {
    if (!period) return "";
    const parts = parseDateParts(period);
    if (!parts) return period;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (reportBy === "Monthly") return `${monthNames[parts.month - 1]} ${parts.year}`;
    if (reportBy === "Yearly") return parts.year;
    if (reportBy === "Quarterly") {
      const q = Math.floor((parts.month - 1) / 3) + 1;
      return `Q${q}-${parts.year}`;
    }
    if (reportBy === "Half-Yearly") {
      const h = parts.month <= 6 ? 1 : 2;
      return `H${h}-${parts.year}`;
    }
    return `${String(parts.day).padStart(2, '0')}-${monthNames[parts.month - 1]}-${parts.year}`;
  };

  /* ---------------- UI ---------------- */
  return (
    <div className="p-4 md:p-6 bg-slate-100 min-h-screen space-y-4">
      <PageTopbar
        title={REPORT_META[reportBy].title}
        rightSlot={
          <div className="flex gap-2">
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

          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={handleExcelExport}
              disabled={loading || reportRows.length === 0}
              title="Export Excel"
              aria-label="Export Excel"
              className={EXPORT_EXCEL_BUTTON_CLASS}
            >
              <FaFileExcel size={20} color="#1D6F42" />
            </button>
            <button
              onClick={handlePdfExport}
              disabled={loading || reportRows.length === 0}
              title="Export PDF"
              aria-label="Export PDF"
              className={EXPORT_PDF_BUTTON_CLASS}
            >
              <FaFilePdf size={20} color="#D32F2F" />
            </button>
            <button
              onClick={() => {
                setDateFrom(fiscalYearStart);
                setDateTo(today);
                setPaymentMode("");
                setReportBy("Daily");
              }}
              className="reset-button"
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
        ) : visibleScreenRows.length === 0 ? (
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
              {visibleScreenRows.map((r, i) => (
                <tr key={i} className="even:bg-slate-50 hover:bg-slate-100">
                  <td className="sticky left-0 z-10 bg-white border px-1 py-1 font-semibold min-w-[90px] max-w-[110px] text-center">
                    {formatPeriodLabel(r.PERIOD)}
                  </td>
                  {feeCodes.map((c) => (
                    <td key={c} className="border px-3 py-1 text-right">
                        {formatReportAmount(r[c])}
                    </td>
                  ))}
                  <td className="border px-3 py-1 text-right font-semibold bg-blue-50">
                      {formatReportAmount(r.TOTAL)}
                  </td>
                  <td className="border px-3 py-1 text-center">
                    {r.ACCOUNT_RANGES?.length ? (
                      <div className="space-y-1 text-left">
                        {r.ACCOUNT_RANGES.map((a, idx) => (
                          <div key={`${a.account}-${idx}`} className="font-mono text-[11px] leading-tight">
                            {formatReceiptDisplay(a.rec_start)}
                          </div>
                        ))}
                      </div>
                    ) : (
                      formatReceiptDisplay(r.REC_START)
                    )}
                  </td>
                  <td className="border px-3 py-1 text-center">
                    {r.ACCOUNT_RANGES?.length ? (
                      <div className="space-y-1 text-left">
                        {r.ACCOUNT_RANGES.map((a, idx) => (
                          <div key={`${a.account}-${idx}`} className="font-mono text-[11px] leading-tight">
                            {formatReceiptDisplay(a.rec_end)}
                          </div>
                        ))}
                      </div>
                    ) : (
                      formatReceiptDisplay(r.REC_END)
                    )}
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
                    {formatReportAmount(visibleScreenRows.reduce((s, r) => s + (Number(r[c]) || 0), 0))}
                  </td>
                ))}
                <td className="border px-3 py-2 text-right">
                  {formatReportAmount(visibleScreenRows.reduce((s, r) => s + (Number(r.TOTAL) || 0), 0))}
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
