import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchCashEntries,
  createCashEntry,
  updateCashEntry,
  deleteCashEntry,
  fetchNextReceiptNumber,
} from '../services/cashRegisterService';
import { fetchFeeTypes } from '../services/feeTypeService';

const PAYMENT_MODES = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK', label: 'Bank' },
  { value: 'UPI', label: 'UPI' },
];

const EmptyState = ({ title, message }) => (
  <div className="rounded border border-dashed border-gray-300 p-6 text-center text-gray-600">
    <h4 className="text-lg font-semibold text-gray-700">{title}</h4>
    <p className="mt-1 text-sm text-gray-500">{message}</p>
  </div>
);

const DEFAULT_RIGHTS = { can_view: true, can_create: true, can_edit: true, can_delete: true };

const CashRegister = ({ rights = DEFAULT_RIGHTS }) => {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [filters, setFilters] = useState({ date: today, payment_mode: '' });
  const [entries, setEntries] = useState([]);
  const [feeTypes, setFeeTypes] = useState([]);
  const [formState, setFormState] = useState({
    date: today,
    payment_mode: 'CASH',
    fee_type: '',
    amount: '',
    remark: '',
  });
  const [receiptPreview, setReceiptPreview] = useState('--');
  const [editingEntry, setEditingEntry] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [pageError, setPageError] = useState('');

  const setFlash = useCallback((type, message) => {
    setStatus({ type, message });
    if (message) {
      setTimeout(() => setStatus(null), 4000);
    }
  }, []);

  const loadFeeTypes = useCallback(async () => {
    try {
      const data = await fetchFeeTypes({ active: true });
      setFeeTypes(Array.isArray(data) ? data : data?.results || []);
      if (!editingEntry && data.length && !formState.fee_type) {
        setFormState((prev) => ({ ...prev, fee_type: data[0].id?.toString() || '' }));
      }
    } catch (err) {
      setFlash('error', 'Unable to load fee types');
    }
  }, [editingEntry, formState.fee_type, setFlash]);

  const loadEntries = useCallback(async () => {
    if (!rights.can_view || !filters.date) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setPageError('');
    try {
      const payload = {
        date: filters.date,
      };
      if (filters.payment_mode) payload.payment_mode = filters.payment_mode;
      const data = await fetchCashEntries(payload);
      setEntries(Array.isArray(data) ? data : data?.results || []);
    } catch (err) {
      setPageError('Failed to load cash register entries.');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [rights.can_view, filters.date, filters.payment_mode]);

  useEffect(() => {
    loadFeeTypes();
  }, [loadFeeTypes]);

  useEffect(() => {
    if (rights.can_view) {
      loadEntries();
    }
  }, [rights.can_view, loadEntries]);

  useEffect(() => {
    if (editingEntry) {
      setReceiptPreview(editingEntry.receipt_no);
      return;
    }
    if (!rights.can_create) {
      setReceiptPreview('--');
      return;
    }
    if (!formState.date) {
      setReceiptPreview('--');
      return;
    }
    let isActive = true;
    const preview = async () => {
      try {
        const data = await fetchNextReceiptNumber({
          payment_mode: formState.payment_mode,
          date: formState.date,
        });
        if (isActive) {
          setReceiptPreview(data?.next_receipt_no || '--');
        }
      } catch (err) {
        if (isActive) setReceiptPreview('--');
      }
    };
    preview();
    return () => {
      isActive = false;
    };
  }, [formState.date, formState.payment_mode, editingEntry, rights.can_create]);

  useEffect(() => {
    if (!editingEntry && filters.date) {
      setFormState((prev) => ({ ...prev, date: filters.date }));
    }
  }, [filters.date, editingEntry]);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleFormChange = (field, value) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setEditingEntry(null);
    setFormState({
      date: filters.date || today,
      payment_mode: 'CASH',
      fee_type: feeTypes[0]?.id?.toString() || '',
      amount: '',
      remark: '',
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!formState.date || !formState.fee_type || !formState.amount) {
      setFlash('error', 'Date, Fee Type, and Amount are required.');
      return;
    }
    if (!editingEntry && !rights.can_create) {
      setFlash('error', 'You do not have permission to add entries.');
      return;
    }
    if (editingEntry && !rights.can_edit) {
      setFlash('error', 'You do not have permission to edit entries.');
      return;
    }
    const parsedAmount = Number(formState.amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setFlash('error', 'Amount must be greater than zero.');
      return;
    }
    const payload = {
      date: formState.date,
      payment_mode: formState.payment_mode,
      fee_type: Number(formState.fee_type),
      amount: parsedAmount,
      remark: formState.remark?.trim() || '',
    };
    setSaving(true);
    try {
      if (editingEntry) {
        await updateCashEntry(editingEntry.id, payload);
        setFlash('success', 'Entry updated successfully');
      } else {
        await createCashEntry(payload);
        setFlash('success', 'Entry added successfully');
      }
      resetForm();
      loadEntries();
    } catch (err) {
      const detail = err?.response?.data?.detail || 'Operation failed';
      setFlash('error', detail);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (entry) => {
    setEditingEntry(entry);
    setFormState({
      date: entry.date,
      payment_mode: entry.payment_mode,
      fee_type: entry.fee_type?.toString() || '',
      amount: entry.amount,
      remark: entry.remark || '',
    });
  };

  const handleDelete = async (entry) => {
    if (!rights.can_delete) return;
    if (!window.confirm(`Delete receipt ${entry.receipt_no}?`)) return;
    setSaving(true);
    try {
      await deleteCashEntry(entry.id);
      setFlash('success', 'Entry deleted');
      if (editingEntry?.id === entry.id) {
        resetForm();
      }
      loadEntries();
    } catch (err) {
      setFlash('error', err?.response?.data?.detail || 'Unable to delete entry');
    } finally {
      setSaving(false);
    }
  };

  if (!rights.can_view) {
    return (
      <EmptyState
        title="Access Restricted"
        message={'You do not have permission to view the Cash Register.'}
      />
    );
  }

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <p className="text-sm uppercase tracking-wide text-blue-700">Accounts &amp; Finance</p>
          <h1 className="text-3xl font-semibold text-gray-900">Cash Register (Daily Ledger)</h1>
          <p className="text-sm text-gray-600">Every row equals a receipt. Manual entry, no auto roll-ups.</p>
        </header>

        {status && (
          <div
            className={`rounded border px-4 py-3 text-sm ${
              status.type === 'success'
                ? 'border-green-200 bg-green-50 text-green-800'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {status.message}
          </div>
        )}

        {/* Filters */}
        <section className="rounded-lg bg-white p-4 shadow">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">Filter by date</h2>
            <button
              type="button"
              className="text-sm text-blue-600 hover:underline"
              onClick={() => setFilters({ date: today, payment_mode: '' })}
            >
              Reset to today
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm font-medium text-gray-700">
              Date
              <input
                type="date"
                value={filters.date || ''}
                onChange={(e) => handleFilterChange('date', e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Payment Mode
              <select
                value={filters.payment_mode}
                onChange={(e) => handleFilterChange('payment_mode', e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              >
                <option value="">All modes</option>
                {PAYMENT_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {/* Entry form */}
        <section className="rounded-lg bg-white p-4 shadow">
          <div className="mb-4 flex flex-col gap-3 border-b border-gray-100 pb-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                {editingEntry ? `Update receipt ${editingEntry.receipt_no}` : 'New entry'}
              </h2>
              <p className="text-sm text-gray-500">Receipt number is generated by the backend and cannot be edited.</p>
            </div>
            <div className="text-sm text-gray-600">
              Next number preview:
              <span className="ml-2 font-mono text-slate-900">{receiptPreview || '--'}</span>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-3">
            <label className="text-sm font-medium text-gray-700">
              Date
              <input
                type="date"
                value={formState.date}
                onChange={(e) => handleFormChange('date', e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                required
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Receipt No
              <input
                type="text"
                value={editingEntry ? editingEntry.receipt_no : receiptPreview}
                readOnly
                className="mt-1 w-full rounded border border-dashed border-gray-300 bg-gray-100 px-3 py-2 font-mono"
              />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Payment Mode
              <select
                value={formState.payment_mode}
                onChange={(e) => handleFormChange('payment_mode', e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              >
                {PAYMENT_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-gray-700">
              Fee Type
              <select
                value={formState.fee_type}
                onChange={(e) => handleFormChange('fee_type', e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                required
              >
                <option value="" disabled>
                  Select fee type
                </option>
                {feeTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.code} - {type.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-gray-700">
              Amount
              <input
                type="number"
                min="0"
                step="0.01"
                value={formState.amount}
                onChange={(e) => handleFormChange('amount', e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                required
              />
            </label>
            <label className="text-sm font-medium text-gray-700 md:col-span-2">
              Remark
              <input
                type="text"
                value={formState.remark}
                onChange={(e) => handleFormChange('remark', e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                placeholder="Optional notes"
              />
            </label>
            <div className="md:col-span-3 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving || (!editingEntry && !rights.can_create) || (editingEntry && !rights.can_edit)}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {saving ? 'Saving...' : editingEntry ? 'Update Entry' : 'Save Entry'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Clear form
              </button>
            </div>
          </form>
        </section>

        {/* Table */}
        <section className="rounded-lg bg-white p-4 shadow">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Entries for {filters.date || 'selected date'}</h2>
              {pageError && <p className="text-sm text-red-600">{pageError}</p>}
            </div>
            <span className="text-sm text-gray-500">{entries.length} receipt(s)</span>
          </div>
          {loading ? (
            <div className="py-10 text-center text-gray-500">Loading...</div>
          ) : !filters.date ? (
            <EmptyState title="Select a date" message="Pick a date to see cash register rows." />
          ) : entries.length === 0 ? (
            <EmptyState title="No receipts" message="No rows match the selected date and filters." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Receipt No</th>
                    <th className="px-4 py-2 text-left">Payment Mode</th>
                    <th className="px-4 py-2 text-left">Fee Type</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-left">Remark</th>
                    <th className="px-4 py-2 text-left">Created By</th>
                    <th className="px-4 py-2 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-sm text-gray-900">{entry.receipt_no}</td>
                      <td className="px-4 py-2 capitalize text-gray-700">{entry.payment_mode.toLowerCase()}</td>
                      <td className="px-4 py-2 text-gray-700">
                        {entry.fee_type_code ? `${entry.fee_type_code} - ${entry.fee_type_name}` : entry.fee_type_name}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-gray-900">Rs. {Number(entry.amount).toFixed(2)}</td>
                      <td className="px-4 py-2 text-gray-600">{entry.remark || '--'}</td>
                      <td className="px-4 py-2 text-gray-700">{entry.created_by_name}</td>
                      <td className="px-4 py-2 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {rights.can_edit && (
                            <button
                              type="button"
                              onClick={() => startEdit(entry)}
                              className="rounded border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                            >
                              Edit
                            </button>
                          )}
                          {rights.can_delete && (
                            <button
                              type="button"
                              onClick={() => handleDelete(entry)}
                              className="rounded border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default CashRegister;
