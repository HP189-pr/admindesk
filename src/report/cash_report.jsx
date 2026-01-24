import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageTopbar from '../components/PageTopbar';
import {
  fetchCashOnHandReport,
  fetchCashOutward,
  closeCashDay,
  createCashOutward,
} from '../services/cashRegisterService';

const DENOMS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

const TABS = [
  { key: 'entry', label: 'Cash Entry' },
  { key: 'deposit', label: 'Deposit' },
  { key: 'expense', label: 'Expense' },
];

const CashReport = ({ onBack }) => {
    const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [report, setReport] = useState(null);
  const [outward, setOutward] = useState([]);
  const [denoms, setDenoms] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
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
          date,
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
          date,
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
    // Always pass a date argument to fetchCashOnHandReport
    const reportDate = date || today;
    const r = await fetchCashOnHandReport({ date: reportDate });
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

    const o = await fetchCashOutward({ date: reportDate });
    setOutward(Array.isArray(o) ? o : (o ? Object.values(o) : []));
  };

  useEffect(() => {
    load();
  }, [date]);

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

      await closeCashDay({ date, items });
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
      <div className="w-full max-w-3xl mx-auto space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Select Date</h2>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="border px-3 py-2 rounded"
            />
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
          {/* Tabs content */}
          <div className="mt-4">
            {selectedTab === 'entry' && (
              <>
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
          </div>
        </section>
      </div>
    </div>
  );
};

export default CashReport;
