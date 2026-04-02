// src/report/cash_report.jsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PageTopbar from '../components/PageTopbar';
import {
  fetchCashOnHandReport,
  fetchCashOutward,
  closeCashDay,
  updateCashDay,
  createCashOutward,
  updateCashOutward,
  deleteCashOutward,
  fetchFeesAggregate,
  fetchRecRange,
} from '../services/cashRegisterService';

const DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1];

const TABS = [
  { key: 'entry', label: 'Cash Entry' },
  { key: 'deposit', label: 'Deposit' },
  { key: 'expense', label: 'Expense' },
  { key: 'cash_on_hand', label: 'Cash on Hand' },
];

const formatDateDisplay = (dateStr) => {
  if (!dateStr) return '--';
  const raw = String(dateStr).trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) {
    return raw;
  }
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return String(dateStr);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yy = dt.getFullYear();
  return `${dd}-${mm}-${yy}`;
};

const normalizeDateValue = (dateStr) => {
  if (!dateStr) return '';
  const raw = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  const match = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }
  return raw;
};

const extractReceiptShort = (receiptFull) => {
  if (!receiptFull) return '--';
  const match = String(receiptFull).match(/R\/?(\d{6})$/i);
  return match ? `R${match[1]}` : String(receiptFull);
};

const isCashReceiptRef = (receiptFull) => {
  if (!receiptFull) return false;
  const value = String(receiptFull).trim().toUpperCase();
  return value.startsWith('C01/') || /^R\/?\d{6}$/.test(value);
};

const CashReport = ({ onBack }) => {
    const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [countFrom, setCountFrom] = useState(today);
  const [previousBalance, setPreviousBalance] = useState(0);
  const [report, setReport] = useState(null);
  const [outward, setOutward] = useState([]);
  const [outwardSingle, setOutwardSingle] = useState([]);
  const [outwardSingleLoading, setOutwardSingleLoading] = useState(false);
  const [denoms, setDenoms] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [cashOnHandRows, setCashOnHandRows] = useState([]);
  // For deposit/expense entry forms
  const [depositForm, setDepositForm] = useState({ amount: '', ref_no: '', note: '' });
  const [expenseForm, setExpenseForm] = useState({ amount: '', ref_no: '', note: '' });
  const [formSaving, setFormSaving] = useState(false);
  // Edit state for outward records
  const [editingOutward, setEditingOutward] = useState(null);
  const [editOutwardForm, setEditOutwardForm] = useState({ date: '', amount: '', ref_no: '', note: '' });
  const [editingCashDay, setEditingCashDay] = useState(false);

  const loadSingleOutward = useCallback(async (date) => {
    if (!date) { setOutwardSingle([]); return; }
    setOutwardSingleLoading(true);
    try {
      const data = await fetchCashOutward({ date });
      const rows = Array.isArray(data) ? data : (data?.results || []);
      setOutwardSingle(rows.map((row) => ({
        ...row,
        date: normalizeDateValue(row?.date),
      })));
    } finally {
      setOutwardSingleLoading(false);
    }
  }, []);

  // Handlers for deposit/expense entry
  const handleDepositSubmit = async (e) => {
    e.preventDefault();
    if (!depositForm.amount) return;
    setFormSaving(true);
    try {
      await createCashOutward({
        date: dateTo,
        txn_type: 'DEPOSIT',
        amount: depositForm.amount,
        ref_no: depositForm.ref_no,
        remark: depositForm.note,
      });
      setDepositForm({ amount: '', ref_no: '', note: '' });
      loadSingleOutward(dateTo);
      load();
    } finally {
      setFormSaving(false);
    }
  };
  const handleExpenseSubmit = async (e) => {
    e.preventDefault();
    if (!expenseForm.amount) return;
    setFormSaving(true);
    try {
      await createCashOutward({
        date: dateTo,
        txn_type: 'EXPENSE',
        amount: expenseForm.amount,
        ref_no: expenseForm.ref_no,
        remark: expenseForm.note,
      });
      setExpenseForm({ amount: '', ref_no: '', note: '' });
      loadSingleOutward(dateTo);
      load();
    } finally {
      setFormSaving(false);
    }
  };

  const handleEditOutward = (record) => {
    setEditingOutward(record);
    setEditOutwardForm({ date: normalizeDateValue(record.date) || dateTo, amount: record.amount, ref_no: record.ref_no || '', note: record.note || record.remark || '' });
  };

  const handleEditOutwardSubmit = async (e) => {
    e.preventDefault();
    if (!editingOutward) return;
    setFormSaving(true);
    try {
      await updateCashOutward(editingOutward.id, {
        date: editOutwardForm.date || editingOutward.date,
        txn_type: editingOutward.txn_type,
        amount: editOutwardForm.amount,
        ref_no: editOutwardForm.ref_no,
        remark: editOutwardForm.note,
      });
      setEditingOutward(null);
      loadSingleOutward(dateTo);
      load();
    } catch (err) {
      setMsg(err?.response?.data?.detail || 'Update failed');
    } finally {
      setFormSaving(false);
    }
  };

  const handleDeleteOutward = async (record) => {
    const typeLabel = record.txn_type === 'DEPOSIT' ? 'deposit' : 'expense';
    if (!window.confirm(`Delete this ${typeLabel} of ₹${record.amount}?`)) return;
    try {
      await deleteCashOutward(record.id);
      if (editingOutward?.id === record.id) setEditingOutward(null);
      loadSingleOutward(dateTo);
      load();
    } catch (err) {
      setMsg(err?.response?.data?.detail || 'Delete failed');
    }
  };
  const [selectedTab, setSelectedTab] = useState('entry');

  const exportColumns = [
    'Date',
    'Rec No From',
    'Rec No To',
    'Total Fees',
    'Deposit',
    'Deposit Ref',
    'Expense',
    'Expense Ref',
    'Cash on Hand',
  ];

  const exportRows = cashOnHandRows.map((row) => ([
    formatDateDisplay(row.date),
    row.recFrom || '--',
    row.recTo || '--',
    Number(row.totalFees || 0).toFixed(2),
    Number(row.deposit || 0).toFixed(2),
    row.depositRef || '--',
    Number(row.expense || 0).toFixed(2),
    row.expenseRef || '--',
    Number(row.cashOnHand || 0).toFixed(2),
  ]));

  const handleExportExcel = () => {
    const data = [exportColumns, ...exportRows];
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'CashOnHand');
    XLSX.writeFile(workbook, `cash_on_hand_${dateFrom || today}_to_${dateTo || today}.xlsx`);
  };

  const handleExportPdf = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(14);
    doc.text('Cash On Hand Report', 14, 12);
    doc.setFontSize(10);
    doc.text(`From: ${formatDateDisplay(dateFrom)}   To: ${formatDateDisplay(dateTo)}   Count From: ${formatDateDisplay(countFrom)}   Previous Cash: ${Number(previousBalance || 0).toFixed(2)}`, 14, 18);
    autoTable(doc, {
      startY: 24,
      head: [exportColumns],
      body: exportRows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] },
    });
    doc.save(`cash_on_hand_${dateFrom || today}_to_${dateTo || today}.pdf`);
  };

  const physicalCash = useMemo(() => {
    return DENOMS.reduce(
      (sum, d) => sum + (Number(denoms[d] || 0) * d),
      0
    );
  }, [denoms]);

  const difference = useMemo(() => {
    if (!report) return 0;
    return physicalCash - Number(report.expected_cash || 0);
  }, [physicalCash, report]);

  // Range-wide aggregates computed from the running-balance table (for Cash on Hand summary panel)
  const rangeTotalFees = useMemo(
    () => cashOnHandRows.reduce((s, r) => s + Number(r.totalFees || 0), 0),
    [cashOnHandRows]
  );
  const rangeTotalDeposit = useMemo(
    () => cashOnHandRows.reduce((s, r) => s + Number(r.deposit || 0), 0),
    [cashOnHandRows]
  );
  const rangeTotalExpense = useMemo(
    () => cashOnHandRows.reduce((s, r) => s + Number(r.expense || 0), 0),
    [cashOnHandRows]
  );
  const rangeFinalCashOnHand = useMemo(
    () =>
      cashOnHandRows.length
        ? cashOnHandRows[cashOnHandRows.length - 1].cashOnHand
        : Number(previousBalance || 0),
    [cashOnHandRows, previousBalance]
  );

  const load = async () => {
    const safeFrom = dateFrom || today;
    const safeTo = dateTo || safeFrom;
    const safeCountFrom = countFrom || safeFrom;

    const [r, outwardRows, feeAgg, recRange] = await Promise.all([
      fetchCashOnHandReport({ date: safeTo }),
      fetchCashOutward({ date_from: safeFrom, date_to: safeTo }),
      fetchFeesAggregate({ date_from: safeFrom, date_to: safeTo, report_by: 'Daily', payment_mode: 'CASH' }),
      fetchRecRange({ date_from: safeFrom, date_to: safeTo, report_by: 'Daily', payment_mode: 'CASH' }),
    ]);
    setReport(r);

    // If the report is closed and has denomination data, set denoms from it
    if (r && r.closed && Array.isArray(r.items)) {
      const denomObj = {};
      r.items.forEach(item => {
        denomObj[item.denomination] = item.qty;
      });
      setDenoms(denomObj);
    } else {
      setDenoms({}); // Clear if not closed or no data
    }

    const feeRows = Array.isArray(feeAgg) ? feeAgg : [];
    const outwardAll = Array.isArray(outwardRows)
      ? outwardRows
      : (Array.isArray(outwardRows?.results) ? outwardRows.results : []);
    const normalizedOutward = outwardAll.map((row) => ({
      ...row,
      date: normalizeDateValue(row?.date),
    }));
    const rangeRows = (Array.isArray(recRange) ? recRange : []).filter(
      (row) => isCashReceiptRef(row?.rec_start) || isCashReceiptRef(row?.rec_end)
    );

    setOutward(normalizedOutward);

    const dateMap = {};

    feeRows.forEach((row) => {
      const dt = row?.period?.slice(0, 10);
      if (!dt) return;
      if (!dateMap[dt]) {
        dateMap[dt] = {
          date: dt,
          totalFees: 0,
          deposit: 0,
          expense: 0,
          depositRef: [],
          expenseRef: [],
          recFrom: '--',
          recTo: '--',
        };
      }
      dateMap[dt].totalFees += Number(row?.amount) || 0;
    });

    normalizedOutward.forEach((row) => {
      if (!row?.date) return;
      const dt = row.date;
      if (!dateMap[dt]) {
        dateMap[dt] = {
          date: dt,
          totalFees: 0,
          deposit: 0,
          expense: 0,
          depositRef: [],
          expenseRef: [],
          recFrom: '--',
          recTo: '--',
        };
      }

      if (dt >= safeCountFrom) {
        if (row.txn_type === 'DEPOSIT') {
          dateMap[dt].deposit += Number(row.amount) || 0;
          if (row.ref_no) dateMap[dt].depositRef.push(row.ref_no);
        }
        if (row.txn_type === 'EXPENSE') {
          dateMap[dt].expense += Number(row.amount) || 0;
          if (row.ref_no) dateMap[dt].expenseRef.push(row.ref_no);
        }
      }
    });

    rangeRows.forEach((row) => {
      const dt = row?.period?.slice(0, 10);
      if (!dt) return;
      if (!dateMap[dt]) {
        dateMap[dt] = {
          date: dt,
          totalFees: 0,
          deposit: 0,
          expense: 0,
          depositRef: [],
          expenseRef: [],
          recFrom: '--',
          recTo: '--',
        };
      }
      dateMap[dt].recFrom = extractReceiptShort(row.rec_start);
      dateMap[dt].recTo = extractReceiptShort(row.rec_end);
    });

    const sortedDates = Object.keys(dateMap)
      .filter((dt) => dt >= safeFrom && dt <= safeTo)
      .sort();

    let runningBalance = Number(previousBalance) || 0;
    const finalRows = sortedDates.map((dt) => {
      const row = dateMap[dt];
      runningBalance = runningBalance + row.totalFees - row.deposit - row.expense;
      const hasData =
        Number(row.totalFees || 0) !== 0 ||
        Number(row.deposit || 0) !== 0 ||
        Number(row.expense || 0) !== 0 ||
        row.recFrom !== '--' ||
        row.recTo !== '--';

      if (!hasData) {
        return null;
      }

      return {
        ...row,
        depositRef: row.depositRef.join(', ') || '--',
        expenseRef: row.expenseRef.join(', ') || '--',
        cashOnHand: runningBalance,
      };
    }).filter(Boolean);

    setCashOnHandRows(finalRows);
  };

  useEffect(() => {
    load();
  }, [dateFrom, dateTo, countFrom, previousBalance]);

  // Fetch exact-date outward records when on Deposit or Expense tab, or when dateTo changes
  useEffect(() => {
    if (selectedTab === 'deposit' || selectedTab === 'expense') {
      loadSingleOutward(dateTo);
    }
  }, [selectedTab, dateTo, loadSingleOutward]);

  const handleClose = async () => {
    setSaving(true);
    try {
      const items = DENOMS
        .filter(d => Number(denoms[d]) > 0)
        .map(d => ({
          denomination: d,
          qty: Number(denoms[d]),
          is_coin: d < 10,
        }));

      const payload = { date: dateTo || today, items };
      if (editingCashDay) {
        await updateCashDay(payload);
        setMsg('Cash day updated successfully');
        setEditingCashDay(false);
      } else {
        await closeCashDay(payload);
        setMsg('Cash day closed successfully');
      }
      load();
    } catch (e) {
      setMsg(e?.response?.data?.detail || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 h-full bg-slate-100 min-h-screen">
      <PageTopbar
        title="Cash Report"
        actions={TABS.map(t => t.label)}
        selected={TABS.find(t => t.key === selectedTab)?.label}
        onSelect={label => {
          const found = TABS.find(t => t.label === label);
          if (found) setSelectedTab(found.key);
        }}
        actionsOnLeft={true}
        rightSlot={
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (typeof onBack === 'function') {
                  onBack();
                } else {
                  navigate('/cash-register');
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-200 px-3 py-2 text-sm font-semibold text-gray-800 shadow border border-gray-300"
            >
              ← Back to Cash Register
            </button>
          </div>
        }
      />
      <div className="w-full max-w-6xl mx-auto space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {selectedTab === 'cash_on_hand' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-semibold text-gray-800">Select Date</h2>
                <div className="flex gap-3 items-center flex-wrap">
                  <div>
                    <label className="text-sm">From</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                      className="border px-3 py-2 rounded"
                    />
                  </div>

                  <div>
                    <label className="text-sm">To</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      className="border px-3 py-2 rounded"
                    />
                  </div>

                  <div>
                    <label className="text-sm">Count From</label>
                    <input
                      type="date"
                      value={countFrom}
                      onChange={e => setCountFrom(e.target.value)}
                      className="border px-3 py-2 rounded"
                    />
                  </div>

                  <div>
                    <label className="text-sm">Previous Cash</label>
                    <input
                      type="number"
                      value={previousBalance}
                      onChange={e => setPreviousBalance(Number(e.target.value) || 0)}
                      className="border px-3 py-2 rounded w-32"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded shadow-sm mb-4">
                <div className="text-gray-600">Opening Balance</div>
                <div className="font-semibold">₹ {Number(previousBalance || 0).toFixed(2)}</div>
                <div className="text-gray-600">Total Cash Received</div>
                <div className="font-semibold">₹ {rangeTotalFees.toFixed(2)}</div>
                <div className="text-gray-600">Total Deposit</div>
                <div className="text-red-600 font-semibold">- ₹ {rangeTotalDeposit.toFixed(2)}</div>
                <div className="text-gray-600">Total Expense</div>
                <div className="text-red-600 font-semibold">- ₹ {rangeTotalExpense.toFixed(2)}</div>
                <div className="font-bold border-t pt-2">Cash on Hand</div>
                <div className={`font-bold border-t pt-2 ${rangeFinalCashOnHand < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  ₹ {rangeFinalCashOnHand.toFixed(2)}
                </div>
              </div>
            </>
          )}
          {/* Tabs content */}
          <div className="mt-4">
            {selectedTab === 'entry' && (
              <>
                <div className="bg-white p-4 rounded shadow mb-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h2 className="text-lg font-semibold text-gray-800">Select Date</h2>
                    <div>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        className="border px-3 py-2 rounded"
                      />
                    </div>
                  </div>
                  {report && (
                    <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded shadow-sm">
                      <div>System Cash</div>
                      <div className="font-semibold">₹ {report.system_cash}</div>
                      <div>Deposit</div>
                      <div>₹ {report.total_deposit}</div>
                      <div>Expense</div>
                      <div>₹ {report.total_expense}</div>
                      <div className="font-bold">Expected Cash</div>
                      <div className="font-bold">₹ {report.expected_cash}</div>
                    </div>
                  )}
                </div>
                {/* Denomination */}
                <div className="bg-white p-4 rounded shadow mb-4">
                  <h2 className="font-semibold mb-3">Denomination</h2>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-0">
                    {/* Left column: 500, 200, 100, 50 */}
                    <div>
                      <div className="grid grid-cols-4 gap-2 mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b pb-1">
                        <span>Note</span>
                        <span className="text-center">Qty</span>
                        <span></span>
                        <span className="text-right">Total</span>
                      </div>
                      {[500, 200, 100, 50].map(d => {
                        const qty = Number(denoms[d] || 0);
                        const total = qty * d;
                        return (
                          <div key={d} className="grid grid-cols-4 items-center gap-2 py-1.5 border-b border-gray-100">
                            <span className="font-medium text-gray-700">₹ {d}</span>
                            <input
                              type="number"
                              min="0"
                              className="w-full border rounded px-2 py-1 text-center text-sm"
                              value={denoms[d] || ''}
                              readOnly={report?.closed && !editingCashDay}
                              disabled={report?.closed && !editingCashDay}
                              onChange={e => setDenoms({ ...denoms, [d]: e.target.value })}
                            />
                            <span className="text-gray-400 text-center text-xs">=</span>
                            <span className="text-right font-semibold text-gray-800 text-sm">
                              {total > 0 ? `₹ ${total.toLocaleString('en-IN')}` : '--'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {/* Right column: 20, 10, 5, 2, 1 */}
                    <div>
                      <div className="grid grid-cols-4 gap-2 mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b pb-1">
                        <span>Note</span>
                        <span className="text-center">Qty</span>
                        <span></span>
                        <span className="text-right">Total</span>
                      </div>
                      {[20, 10, 5, 2, 1].map(d => {
                        const qty = Number(denoms[d] || 0);
                        const total = qty * d;
                        return (
                          <div key={d} className="grid grid-cols-4 items-center gap-2 py-1.5 border-b border-gray-100">
                            <span className="font-medium text-gray-700">₹ {d}</span>
                            <input
                              type="number"
                              min="0"
                              className="w-full border rounded px-2 py-1 text-center text-sm"
                              value={denoms[d] || ''}
                              readOnly={report?.closed && !editingCashDay}
                              disabled={report?.closed && !editingCashDay}
                              onChange={e => setDenoms({ ...denoms, [d]: e.target.value })}
                            />
                            <span className="text-gray-400 text-center text-xs">=</span>
                            <span className="text-right font-semibold text-gray-800 text-sm">
                              {total > 0 ? `₹ ${total.toLocaleString('en-IN')}` : '--'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                {/* Summary */}
                <div className="bg-white p-4 rounded shadow space-y-2 mb-4">
                  <div>Physical Cash: ₹ {physicalCash}</div>
                  <div className="font-bold">Difference: ₹ {difference}</div>
                </div>
                {!report?.closed ? (
                  <button
                    onClick={handleClose}
                    disabled={saving}
                    className="bg-blue-600 text-white px-4 py-2 rounded"
                  >
                    {saving ? 'Closing...' : 'Close Cash Day'}
                  </button>
                ) : !editingCashDay ? (
                  <button
                    type="button"
                    onClick={() => setEditingCashDay(true)}
                    className="inline-flex items-center gap-1 rounded border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    ✏️ Edit Cash Day
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={handleClose}
                      disabled={saving}
                      className="bg-blue-600 text-white px-4 py-2 rounded"
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingCashDay(false)}
                      className="reset-button"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {msg && <p className="text-green-600">{msg}</p>}
              </>
            )}
            {selectedTab === 'deposit' && (
              <div className="bg-white p-4 rounded shadow">
                <h2 className="font-semibold mb-2">
                  {editingOutward && editingOutward.txn_type === 'DEPOSIT' ? 'Edit Deposit' : 'Add Deposit'}
                </h2>
                {editingOutward && editingOutward.txn_type === 'DEPOSIT' ? (
                  <form className="flex flex-wrap gap-3 mb-4" onSubmit={handleEditOutwardSubmit}>
                    <input
                      type="date"
                      className="border px-3 py-2 rounded"
                      value={editOutwardForm.date}
                      onChange={e => setEditOutwardForm(f => ({ ...f, date: e.target.value }))}
                      required
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Amount"
                      className="border px-3 py-2 rounded w-32"
                      value={editOutwardForm.amount}
                      onChange={e => setEditOutwardForm(f => ({ ...f, amount: e.target.value }))}
                      required
                    />
                    <input
                      type="text"
                      placeholder="Reference"
                      className="border px-3 py-2 rounded w-40"
                      value={editOutwardForm.ref_no}
                      onChange={e => setEditOutwardForm(f => ({ ...f, ref_no: e.target.value }))}
                    />
                    <input
                      type="text"
                      placeholder="Note (optional)"
                      className="border px-3 py-2 rounded flex-1"
                      value={editOutwardForm.note}
                      onChange={e => setEditOutwardForm(f => ({ ...f, note: e.target.value }))}
                    />
                    <button type="submit" className="save-button" disabled={formSaving}>
                      {formSaving ? 'Saving...' : 'Update'}
                    </button>
                    <button
                      type="button"
                      className="reset-button"
                      onClick={() => setEditingOutward(null)}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <form className="flex flex-wrap gap-3 mb-4" onSubmit={handleDepositSubmit}>
                    <input
                      type="date"
                      className="border px-3 py-2 rounded"
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      required
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Amount"
                      className="border px-3 py-2 rounded w-32"
                      value={depositForm.amount}
                      onChange={e => setDepositForm(f => ({ ...f, amount: e.target.value }))}
                      required
                    />
                    <input
                      type="text"
                      placeholder="Reference"
                      className="border px-3 py-2 rounded w-40"
                      value={depositForm.ref_no}
                      onChange={e => setDepositForm(f => ({ ...f, ref_no: e.target.value }))}
                    />
                    <input
                      type="text"
                      placeholder="Note (optional)"
                      className="border px-3 py-2 rounded flex-1"
                      value={depositForm.note}
                      onChange={e => setDepositForm(f => ({ ...f, note: e.target.value }))}
                    />
                    <button type="submit" className="save-button" disabled={formSaving}>
                      {formSaving ? 'Saving...' : 'Add'}
                    </button>
                  </form>
                )}
                <h2 className="font-semibold mb-2">Deposit Records ({formatDateDisplay(dateTo)})</h2>
                {outwardSingleLoading ? (
                  <p className="text-gray-400 py-3 text-sm">Loading...</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left px-2 py-1">Date</th>
                        <th className="text-left px-2 py-1">Ref</th>
                        <th className="text-left px-2 py-1">Note</th>
                        <th className="text-right px-2 py-1">Amount</th>
                        <th className="text-center px-2 py-1">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outwardSingle.filter(o => o.txn_type === 'DEPOSIT').length === 0 ? (
                        <tr>
                          <td colSpan="5" className="text-center text-gray-400 py-3">No records found</td>
                        </tr>
                      ) : outwardSingle.filter(o => o.txn_type === 'DEPOSIT').map(o => (
                        <tr key={o.id} className={`border-b ${editingOutward?.id === o.id ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}>
                          <td className="px-2 py-2">{formatDateDisplay(o.date)}</td>
                          <td className="px-2 py-2">{o.ref_no || '--'}</td>
                          <td className="px-2 py-2">{o.note || '--'}</td>
                          <td className="px-2 py-2 text-right font-semibold">₹ {o.amount}</td>
                          <td className="px-2 py-2 text-center">
                            <div className="flex justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleEditOutward(o)}
                                className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteOutward(o)}
                                className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
            {selectedTab === 'expense' && (
              <div className="bg-white p-4 rounded shadow">
                <h2 className="font-semibold mb-2">
                  {editingOutward && editingOutward.txn_type === 'EXPENSE' ? 'Edit Expense' : 'Add Expense'}
                </h2>
                {editingOutward && editingOutward.txn_type === 'EXPENSE' ? (
                  <form className="flex flex-wrap gap-3 mb-4" onSubmit={handleEditOutwardSubmit}>
                    <input
                      type="date"
                      className="border px-3 py-2 rounded"
                      value={editOutwardForm.date}
                      onChange={e => setEditOutwardForm(f => ({ ...f, date: e.target.value }))}
                      required
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Amount"
                      className="border px-3 py-2 rounded w-32"
                      value={editOutwardForm.amount}
                      onChange={e => setEditOutwardForm(f => ({ ...f, amount: e.target.value }))}
                      required
                    />
                    <input
                      type="text"
                      placeholder="Reference"
                      className="border px-3 py-2 rounded w-40"
                      value={editOutwardForm.ref_no}
                      onChange={e => setEditOutwardForm(f => ({ ...f, ref_no: e.target.value }))}
                    />
                    <input
                      type="text"
                      placeholder="Note (optional)"
                      className="border px-3 py-2 rounded flex-1"
                      value={editOutwardForm.note}
                      onChange={e => setEditOutwardForm(f => ({ ...f, note: e.target.value }))}
                    />
                    <button type="submit" className="save-button" disabled={formSaving}>
                      {formSaving ? 'Saving...' : 'Update'}
                    </button>
                    <button
                      type="button"
                      className="reset-button"
                      onClick={() => setEditingOutward(null)}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <form className="flex flex-wrap gap-3 mb-4" onSubmit={handleExpenseSubmit}>
                    <input
                      type="date"
                      className="border px-3 py-2 rounded"
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      required
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Amount"
                      className="border px-3 py-2 rounded w-32"
                      value={expenseForm.amount}
                      onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
                      required
                    />
                    <input
                      type="text"
                      placeholder="Reference"
                      className="border px-3 py-2 rounded w-40"
                      value={expenseForm.ref_no}
                      onChange={e => setExpenseForm(f => ({ ...f, ref_no: e.target.value }))}
                    />
                    <input
                      type="text"
                      placeholder="Note (optional)"
                      className="border px-3 py-2 rounded flex-1"
                      value={expenseForm.note}
                      onChange={e => setExpenseForm(f => ({ ...f, note: e.target.value }))}
                    />
                    <button type="submit" className="save-button" disabled={formSaving}>
                      {formSaving ? 'Saving...' : 'Add'}
                    </button>
                  </form>
                )}
                <h2 className="font-semibold mb-2">Expense Records ({formatDateDisplay(dateTo)})</h2>
                {outwardSingleLoading ? (
                  <p className="text-gray-400 py-3 text-sm">Loading...</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left px-2 py-1">Date</th>
                        <th className="text-left px-2 py-1">Ref</th>
                        <th className="text-left px-2 py-1">Note</th>
                        <th className="text-right px-2 py-1">Amount</th>
                        <th className="text-center px-2 py-1">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outwardSingle.filter(o => o.txn_type === 'EXPENSE').length === 0 ? (
                        <tr>
                          <td colSpan="5" className="text-center text-gray-400 py-3">No records found</td>
                        </tr>
                      ) : outwardSingle.filter(o => o.txn_type === 'EXPENSE').map(o => (
                        <tr key={o.id} className={`border-b ${editingOutward?.id === o.id ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}>
                          <td className="px-2 py-2">{formatDateDisplay(o.date)}</td>
                          <td className="px-2 py-2">{o.ref_no || '--'}</td>
                          <td className="px-2 py-2">{o.note || '--'}</td>
                          <td className="px-2 py-2 text-right font-semibold">₹ {o.amount}</td>
                          <td className="px-2 py-2 text-center">
                            <div className="flex justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleEditOutward(o)}
                                className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteOutward(o)}
                                className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
            {selectedTab === 'cash_on_hand' && (
              <div className="bg-white p-4 rounded shadow">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="font-semibold">Cash On Hand Count</h2>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleExportExcel}
                      className="rounded border border-green-300 px-3 py-1 text-xs font-semibold text-green-700 hover:bg-green-50"
                    >
                      Export Excel
                    </button>
                    <button
                      type="button"
                      onClick={handleExportPdf}
                      className="rounded border border-blue-300 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      Export PDF
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="px-2 py-2 text-left">Date</th>
                        <th className="px-2 py-2 text-left" colSpan={2}>Rec No</th>
                        <th className="px-2 py-2 text-right">Total Fees</th>
                        <th className="px-2 py-2 text-right">Deposit</th>
                        <th className="px-2 py-2 text-left">Deposit Ref</th>
                        <th className="px-2 py-2 text-right">Expanse</th>
                        <th className="px-2 py-2 text-left">Expnese Ref</th>
                        <th className="px-2 py-2 text-right">Cash on Hand</th>
                      </tr>
                      <tr className="border-b bg-gray-50">
                        <th className="px-2 py-2 text-left">Date</th>
                        <th className="px-2 py-2 text-left">From</th>
                        <th className="px-2 py-2 text-left">To</th>
                        <th className="px-2 py-2" colSpan={6}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashOnHandRows.length === 0 ? (
                        <tr>
                          <td colSpan="9" className="text-center py-4 text-gray-400">
                            No records found
                          </td>
                        </tr>
                      ) : (
                        cashOnHandRows.map((row, index) => (
                          <tr key={`${row.date}-${index}`} className="border-b">
                            <td className="px-2 py-2">{formatDateDisplay(row.date)}</td>
                            <td className="px-2 py-2">{row.recFrom}</td>
                            <td className="px-2 py-2">{row.recTo}</td>
                            <td className="px-2 py-2 text-right">{row.totalFees.toFixed(2)}</td>
                            <td className="px-2 py-2 text-right">{row.deposit.toFixed(2)}</td>
                            <td className="px-2 py-2">{row.depositRef}</td>
                            <td className="px-2 py-2 text-right">{row.expense.toFixed(2)}</td>
                            <td className="px-2 py-2">{row.expenseRef}</td>
                            <td className="px-2 py-2 text-right font-semibold">{row.cashOnHand.toFixed(2)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default CashReport;
