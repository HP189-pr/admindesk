// src/report/Paymentreport.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FaFileExcel, FaFilePdf } from 'react-icons/fa6';
import PageTopbar from "../components/PageTopbar";
import { fetchCashEntries, fetchCashOutward, fetchFeesAggregate, fetchRecRange } from "../services/cashRegisterService";

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
const RECEIPT_SUFFIX_REGEX = /(\d{6})$/;

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

const parseReceiptSortParts = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return { prefix: '', fiscalYear: -1, sequence: -1, raw: '' };
  }

  let match = raw.match(/^(.+?)\/(\d{4})(\d{6})$/);
  if (match) {
    return {
      prefix: match[1].toUpperCase(),
      fiscalYear: Number(match[2].slice(-2)),
      sequence: Number(match[3]),
      raw,
    };
  }

  match = raw.match(/^(.+?)\/(\d{2})\/R\/?(\d{6})$/i);
  if (match) {
    return {
      prefix: match[1].toUpperCase(),
      fiscalYear: Number(match[2]),
      sequence: Number(match[3]),
      raw,
    };
  }

  match = raw.match(/^(.+?)\/(\d{2})\/(\d{6})$/);
  if (match) {
    return {
      prefix: match[1].toUpperCase(),
      fiscalYear: Number(match[2]),
      sequence: Number(match[3]),
      raw,
    };
  }

  const suffixMatch = raw.match(RECEIPT_SUFFIX_REGEX);
  return {
    prefix: raw.replace(RECEIPT_SUFFIX_REGEX, '').toUpperCase(),
    fiscalYear: -1,
    sequence: suffixMatch ? Number(suffixMatch[1]) : -1,
    raw,
  };
};

const compareReceiptSequence = (leftValue, rightValue) => {
  const left = parseReceiptSortParts(leftValue);
  const right = parseReceiptSortParts(rightValue);

  if (left.prefix !== right.prefix) {
    return left.prefix.localeCompare(right.prefix);
  }
  if (left.fiscalYear !== right.fiscalYear) {
    return left.fiscalYear - right.fiscalYear;
  }
  if (left.sequence !== right.sequence) {
    return left.sequence - right.sequence;
  }
  return left.raw.localeCompare(right.raw);
};

const buildReceiptWiseRows = (flatRows) => {
  const grouped = {};

  (Array.isArray(flatRows) ? flatRows : []).forEach((row) => {
    if (!row || row.is_cancelled) return;

    const receiptNo = String(row.receipt_no_full || '').trim();
    const groupKey = receiptNo || `__${row.receipt_id || row.id}`;
    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        PERIOD: row.date,
        RECEIPT_NO: receiptNo,
        PAYMENT_MODE: String(row.payment_mode || '').toUpperCase(),
        TOTAL: 0,
        feeMap: {},
      };
    }

    const amount = Number(row.amount || 0);
    grouped[groupKey].TOTAL += amount;

    const feeCode = String(row.fee_type_code || '').trim();
    if (!feeCode) return;

    if (!grouped[groupKey].feeMap[feeCode]) {
      grouped[groupKey].feeMap[feeCode] = {
        code: feeCode,
        name: String(row.fee_type_name || '').trim(),
        amount: 0,
      };
    }
    grouped[groupKey].feeMap[feeCode].amount += amount;
  });

  return Object.values(grouped)
    .map((row) => {
      const feeEntries = Object.values(row.feeMap).sort((left, right) => left.code.localeCompare(right.code));
      let feeDetails = '--';

      if (feeEntries.length === 1) {
        const fee = feeEntries[0];
        feeDetails = fee.name ? `${fee.code} - ${fee.name}` : fee.code;
      } else if (feeEntries.length > 1) {
        feeDetails = feeEntries
          .map((fee) => `${fee.code}=${Number(fee.amount || 0).toFixed(2)}`)
          .join(', ');
      }

      return {
        PERIOD: row.PERIOD,
        RECEIPT_NO: row.RECEIPT_NO,
        PAYMENT_MODE: row.PAYMENT_MODE,
        FEE_DETAILS: feeDetails,
        TOTAL: row.TOTAL,
      };
    })
    .sort((left, right) => {
      const receiptCompare = compareReceiptSequence(left.RECEIPT_NO, right.RECEIPT_NO);
      if (receiptCompare !== 0) return receiptCompare;
      return String(left.PERIOD || '').localeCompare(String(right.PERIOD || ''));
    });
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

const normalizeDateValue = (value) => {
  const parts = parseDateParts(value);
  if (!parts) return '';
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
};

const orderDateRange = (firstDate, secondDate) => {
  const left = normalizeDateValue(firstDate);
  const right = normalizeDateValue(secondDate);

  if (!left && !right) {
    return { start: '', end: '' };
  }
  if (!left) {
    return { start: right, end: right };
  }
  if (!right) {
    return { start: left, end: left };
  }

  return left <= right
    ? { start: left, end: right }
    : { start: right, end: left };
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
  const [receiptRows, setReceiptRows] = useState([]);
  const [feeCodes, setFeeCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const tableRef = useRef(null);
  const [receiptWise, setReceiptWise] = useState(false);
  const orderedRange = useMemo(
    () => orderDateRange(dateFrom || today, dateTo || dateFrom || today),
    [dateFrom, dateTo, today]
  );
  const safeDateFrom = orderedRange.start || today;
  const safeDateTo = orderedRange.end || safeDateFrom;

  // Receipt number filters
  const [recNoStart, setRecNoStart] = useState("");
  const [recNoEnd, setRecNoEnd] = useState("");

  const reportRows = useMemo(
    () => rows.filter((row) => hasPeriodActivity(row)),
    [rows]
  );

  const visibleReceiptRows = useMemo(
    () => receiptRows.filter((row) => {
      const rowDate = normalizeDateValue(row?.PERIOD);
      if (!rowDate || rowDate < safeDateFrom || rowDate > safeDateTo) {
        return false;
      }
      return Number(row?.TOTAL || 0) !== 0 || String(row?.FEE_DETAILS || '').trim() !== '--';
    }),
    [receiptRows, safeDateFrom, safeDateTo]
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
  }, [dateFrom, dateTo, paymentMode, reportBy, receiptWise, safeDateFrom, safeDateTo]);

  const loadReport = async () => {
    setLoading(true);
    setPageError("");
    try {
      if (receiptWise) {
        const receiptData = await fetchCashEntries({
          date_from: safeDateFrom,
          date_to: safeDateTo,
          ...(paymentMode ? { payment_mode: paymentMode } : {}),
        });
        const flatRows = Array.isArray(receiptData)
          ? receiptData
          : (Array.isArray(receiptData?.results) ? receiptData.results : []);

        setReceiptRows(buildReceiptWiseRows(flatRows));
        setRows([]);
        setFeeCodes([]);
        return;
      }

      const params = { date_from: safeDateFrom, date_to: safeDateTo, report_by: reportBy };
      if (paymentMode) params.payment_mode = paymentMode;

      const shouldIncludeCashDeposit = !paymentMode || paymentMode === 'CASH';
      const [feeData, recRanges, outwardData] = await Promise.all([
        fetchFeesAggregate(params),
        fetchRecRange(params),
        shouldIncludeCashDeposit ? fetchCashOutward({ date_from: safeDateFrom, date_to: safeDateTo }) : Promise.resolve([]),
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
          .filter((row) => isPeriodWithinSelectedRange(row.PERIOD, safeDateFrom, safeDateTo, reportBy))
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
      setReceiptRows([]);
    } catch (err) {
      console.error(err);
      setPageError("Failed to load report data.");
      setRows([]);
      setReceiptRows([]);
      setFeeCodes([]);
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- PRINT & PDF ---------------- */
  const handleExcelExport = () => {
    if (receiptWise) {
      if (!visibleReceiptRows.length) return;

      const headers = ['DATE', 'RECEIPT NO', 'PAYMENT MODE', 'FEE DETAILS', 'TOTAL'];
      const dataRows = visibleReceiptRows.map((row) => ([
        formatPeriodLabel(row.PERIOD),
        formatReceiptDisplay(row.RECEIPT_NO),
        row.PAYMENT_MODE,
        row.FEE_DETAILS,
        Number(row.TOTAL || 0),
      ]));

      const totalsRow = [
        'TOTAL',
        `${visibleReceiptRows.length} receipt(s)`,
        '-',
        '-',
        visibleReceiptRows.reduce((sum, row) => sum + (Number(row.TOTAL) || 0), 0),
      ];

      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows, totalsRow]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'ReceiptStatement');
      XLSX.writeFile(workbook, `payment_statement_receipt_wise_${dateFrom}_to_${dateTo}.xlsx`);
      return;
    }

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
    if (receiptWise) {
      if (!visibleReceiptRows.length) return;

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const statementTitle = PAYMENT_MODE_TITLES[paymentMode] || 'All Payment Mode Statement';
      const periodLabel = `${formatDateSlash(dateFrom)} to ${formatDateSlash(dateTo)}`;
      const body = visibleReceiptRows.map((row) => ([
        formatPeriodLabel(row.PERIOD),
        formatReceiptDisplay(row.RECEIPT_NO),
        row.PAYMENT_MODE,
        row.FEE_DETAILS,
        formatReportAmount(row.TOTAL),
      ]));

      doc.setFontSize(12);
      doc.text(`${statementTitle} - Receipt Wise`, 14, 10);
      doc.setFontSize(9);
      doc.text(`Period: ${periodLabel}`, 14, 16);

      autoTable(doc, {
        head: [['DATE', 'RECEIPT NO', 'PAYMENT MODE', 'FEE DETAILS', 'TOTAL']],
        body,
        startY: 22,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 1.8, overflow: 'linebreak', valign: 'middle' },
        headStyles: { fillColor: [100, 116, 139], textColor: [255, 255, 255], halign: 'center' },
        columnStyles: {
          0: { cellWidth: 24, halign: 'left' },
          1: { cellWidth: 34, halign: 'left' },
          2: { cellWidth: 22, halign: 'center' },
          3: { cellWidth: 160, halign: 'left' },
          4: { cellWidth: 22, halign: 'right' },
        },
        foot: [[
          'TOTAL',
          `${visibleReceiptRows.length} receipt(s)`,
          '',
          '',
          formatReportAmount(visibleReceiptRows.reduce((sum, row) => sum + (Number(row.TOTAL) || 0), 0)),
        ]],
        footStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
      });

      doc.save(`Payment_Report_Receipt_Wise_${dateFrom}_to_${dateTo}.pdf`);
      return;
    }

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
          {receiptWise ? 'Daily (Receipt Wise)' : reportBy}
        </span>
      </div>

      {/* Filter Card - Exact Match UI */}
      <section className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-4 xl:flex-nowrap">

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
              disabled={receiptWise}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm min-w-[160px] disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
            >
              <option value="Daily">Daily</option>
              <option value="Monthly">Monthly</option>
              <option value="Quarterly">Quarterly</option>
              <option value="Half-Yearly">Half-Yearly</option>
              <option value="Yearly">Yearly</option>
            </select>
          </div>

          <div className="min-w-[170px] shrink-0">
            <label className="mb-1 block text-xs font-semibold text-gray-600">
              View Mode
            </label>
            <label className={`flex h-[42px] cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm shadow-sm transition ${receiptWise ? 'border-slate-900 bg-slate-900 text-white' : 'border-gray-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'}`}>
              <span className="font-semibold">Receipt Wise</span>
              <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${receiptWise ? 'bg-white/20' : 'bg-slate-200'}`}>
                <input
                  type="checkbox"
                  checked={receiptWise}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setReceiptWise(checked);
                    if (checked) {
                      setReportBy('Daily');
                    }
                  }}
                  className="sr-only"
                />
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${receiptWise ? 'translate-x-5' : 'translate-x-0.5'}`}
                />
              </span>
            </label>
          </div>

          <div className="flex items-center gap-3 xl:ml-auto">
            <button
              onClick={handleExcelExport}
              disabled={loading || (receiptWise ? visibleReceiptRows.length === 0 : reportRows.length === 0)}
              title="Export Excel"
              aria-label="Export Excel"
              className={EXPORT_EXCEL_BUTTON_CLASS}
            >
              <FaFileExcel size={20} color="#1D6F42" />
            </button>
            <button
              onClick={handlePdfExport}
              disabled={loading || (receiptWise ? visibleReceiptRows.length === 0 : reportRows.length === 0)}
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
                setReceiptWise(false);
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
        ) : receiptWise ? (
          visibleReceiptRows.length === 0 ? (
            <p className="text-center">No data found</p>
          ) : (
            <table
              ref={tableRef}
              className="min-w-full border-collapse border border-gray-200 text-xs"
            >
              <thead className="bg-slate-800 text-white">
                <tr>
                  <th className="border px-3 py-2 text-center">DATE</th>
                  <th className="border px-3 py-2 text-center">RECEIPT NO</th>
                  <th className="border px-3 py-2 text-center">PAYMENT MODE</th>
                  <th className="border px-3 py-2 text-center">FEE DETAILS</th>
                  <th className="border px-3 py-2 text-center">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {visibleReceiptRows.map((row, index) => (
                  <tr key={`${row.RECEIPT_NO || row.PERIOD}-${index}`} className="even:bg-slate-50 hover:bg-slate-100">
                    <td className="border px-3 py-2 text-center font-semibold">
                      {formatPeriodLabel(row.PERIOD)}
                    </td>
                    <td className="border px-3 py-2 font-mono text-center text-[12px] font-semibold text-slate-900">
                      {formatReceiptDisplay(row.RECEIPT_NO)}
                    </td>
                    <td className="border px-3 py-2 text-center font-semibold">
                      {row.PAYMENT_MODE}
                    </td>
                    <td className="border px-3 py-2 text-left text-[12px] leading-relaxed text-slate-700">
                      {row.FEE_DETAILS}
                    </td>
                    <td className="border bg-blue-50 px-3 py-2 text-right font-semibold text-slate-900">
                      Rs. {Number(row.TOTAL || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}

                <tr className="bg-slate-800 text-white font-bold">
                  <td className="border px-3 py-2">TOTAL</td>
                  <td className="border px-3 py-2 text-center">{visibleReceiptRows.length} receipt(s)</td>
                  <td className="border px-3 py-2 text-center">-</td>
                  <td className="border px-3 py-2 text-center">-</td>
                  <td className="border px-3 py-2 text-right">
                    {formatReportAmount(visibleReceiptRows.reduce((sum, row) => sum + (Number(row.TOTAL) || 0), 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          )
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
