import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PageTopbar from '../components/PageTopbar';
import {
  fetchCashOnHandReport,
  fetchCashOutward,
  closeCashDay,
  createCashOutward,
  fetchFeesAggregate,
  fetchRecRange,
} from '../services/cashRegisterService';

const DENOMS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

const TABS = [
  { key: 'entry', label: 'Cash Entry' },
  { key: 'deposit', label: 'Deposit' },
  { key: 'expense', label: 'Expense' },
  { key: 'cash_on_hand', label: 'Cash on Hand' },
];

const formatDateDisplay = (dateStr) => {
  if (!dateStr) return '--';
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return String(dateStr);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yy = dt.getFullYear();
  return `${dd}-${mm}-${yy}`;
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
  const [denoms, setDenoms] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [cashOnHandRows, setCashOnHandRows] = useState([]);
  // For deposit/expense entry forms
  const [depositForm, setDepositForm] = useState({ amount: '', ref_no: '', note: '' });
  const [expenseForm, setExpenseForm] = useState({ amount: '', ref_no: '', note: '' });
  const [formSaving, setFormSaving] = useState(false);
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
          note: depositForm.note,
        });
        setDepositForm({ amount: '', ref_no: '', note: '' });
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
          note: expenseForm.note,
        });
        setExpenseForm({ amount: '', ref_no: '', note: '' });
        load();
      } finally {
        setFormSaving(false);
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
      : (outwardRows ? Object.values(outwardRows) : []);
    const rangeRows = (Array.isArray(recRange) ? recRange : []).filter(
      (row) => isCashReceiptRef(row?.rec_start) || isCashReceiptRef(row?.rec_end)
    );

    setOutward(outwardAll);

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

    outwardAll.forEach((row) => {
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

  const handleClose = async () => {
    setSaving(true);
    try {
      const items = DENOMS
        .filter(d => denoms[d] > 0)
        .map(d => ({
          denomination: d,
          qty: denoms[d],
          is_coin: d < 10,
        }));

      await closeCashDay({ date: dateTo || today, items });
      setMsg('Cash day closed successfully');
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
              {report && (
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded shadow-sm mb-4">
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
                  <h2 className="font-semibold mb-2">Denomination</h2>
                  <div className="grid grid-cols-2 gap-2">
                    {DENOMS.map(d => (
                      <div key={d} className="flex justify-between">
                        <span>₹ {d}</span>
                        <input
                          type="number"
                          min="0"
                          className="w-20 border px-2 py-1"
                          value={denoms[d] || ''}
                          onChange={e =>
                            setDenoms({ ...denoms, [d]: e.target.value })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Summary */}
                <div className="bg-white p-4 rounded shadow space-y-2 mb-4">
                  <div>Physical Cash: ₹ {physicalCash}</div>
                  <div className="font-bold">Difference: ₹ {difference}</div>
                </div>
                {!report?.closed && (
                  <button
                    onClick={handleClose}
                    disabled={saving}
                    className="bg-blue-600 text-white px-4 py-2 rounded"
                  >
                    {saving ? 'Closing...' : 'Close Cash Day'}
                  </button>
                )}
                {msg && <p className="text-green-600">{msg}</p>}
              </>
            )}
            {selectedTab === 'deposit' && (
              <div className="bg-white p-4 rounded shadow">
                <h2 className="font-semibold mb-2">Add Deposit</h2>
                <form className="flex flex-wrap gap-3 mb-4" onSubmit={handleDepositSubmit}>
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
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-4 py-2 rounded"
                    disabled={formSaving}
                  >
                    {formSaving ? 'Saving...' : 'Add'}
                  </button>
                </form>
                <h2 className="font-semibold mb-2">Deposit Records</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th>Date</th>
                      <th>Type</th>
                      <th>Ref</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const depositRows = outward.filter(o => o && o.txn_type === 'DEPOSIT');
                      if (depositRows.length === 0) {
                        return (
                          <tr>
                            <td colSpan="4" className="text-center text-gray-400 py-3">No records found</td>
                          </tr>
                        );
                      }
                      return depositRows.map(o => (
                        <tr key={o.id}>
                          <td>{o.date}</td>
                          <td>Deposit</td>
                          <td>{o.ref_no}</td>
                          <td className="text-right">₹ {o.amount}</td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            )}
            {selectedTab === 'expense' && (
              <div className="bg-white p-4 rounded shadow">
                <h2 className="font-semibold mb-2">Add Expense</h2>
                <form className="flex flex-wrap gap-3 mb-4" onSubmit={handleExpenseSubmit}>
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
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-4 py-2 rounded"
                    disabled={formSaving}
                  >
                    {formSaving ? 'Saving...' : 'Add'}
                  </button>
                </form>
                <h2 className="font-semibold mb-2">Expense Records</h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th>Date</th>
                      <th>Type</th>
                      <th>Ref</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const expenseRows = outward.filter(o => o && o.txn_type === 'EXPENSE');
                      if (expenseRows.length === 0) {
                        return (
                          <tr>
                            <td colSpan="4" className="text-center text-gray-400 py-3">No records found</td>
                          </tr>
                        );
                      }
                      return expenseRows.map(o => (
                        <tr key={o.id}>
                          <td>{o.date}</td>
                          <td>Expense</td>
                          <td>{o.ref_no}</td>
                          <td className="text-right">₹ {o.amount}</td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
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
