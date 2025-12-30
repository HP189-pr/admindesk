import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchCashEntries,
  createCashEntry,
  updateCashEntry,
  deleteCashEntry,
  fetchNextReceiptNumber,
  createReceiptsBulk,
} from '../services/cashRegisterService';
import { fetchFeeTypes } from '../services/feeTypeService';
import PageTopbar from '../components/PageTopbar';
import PaymentReport from '../report/Paymentreport';

const PAYMENT_MODES = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK', label: 'Bank' },
  { value: 'UPI', label: 'UPI' },
];

const MODE_CARD_STYLES = {
  CASH: 'border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100',
  UPI: 'border-lime-200 bg-lime-50 text-lime-800 hover:bg-lime-100',
  BANK: 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100',
};

const RECEIPT_SUFFIX_REGEX = /(\d{6})$/;

const TOPBAR_ACTIONS = ['➕ Add', '🔍 Search', '📄 Report'];
const ACTION_DESCRIPTIONS = {
  '➕ Add': 'Capture new cash receipts for the selected day while seeing the live next number preview.',
  '🔍 Search': 'Filter totals by date and payment mode, then review every receipt in the ledger below.',
  '📄 Report': 'Use the day ledger to export or print official cash register summaries.',
};

const extractSequenceFromFull = (full) => {
  if (!full) {
    return null;
  }
  const match = String(full).match(RECEIPT_SUFFIX_REGEX);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isNaN(parsed) ? null : parsed;
};

const extractSequenceNumber = (entry) => {
  if (!entry) {
    return null;
  }
  if (typeof entry.rec_no === 'number') {
    return entry.rec_no;
  }
  if (entry.rec_no) {
    const parsed = Number(entry.rec_no);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  const full = entry.receipt_no_full ? String(entry.receipt_no_full).trim() : '';
  const match = full.match(RECEIPT_SUFFIX_REGEX);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isNaN(parsed) ? null : parsed;
};

const extractReferencePrefix = (entry) => {
  if (!entry) {
    return '';
  }
  if (entry.rec_ref) {
    return String(entry.rec_ref).trim();
  }
  const full = entry.receipt_no_full ? String(entry.receipt_no_full).trim() : '';
  if (!full) {
    return '';
  }
  return RECEIPT_SUFFIX_REGEX.test(full) ? full.replace(RECEIPT_SUFFIX_REGEX, '') : '';
};

const EmptyState = ({ title, message }) => (
  <div className="rounded border border-dashed border-gray-300 p-6 text-center text-gray-600">
    <h4 className="text-lg font-semibold text-gray-700">{title}</h4>
    <p className="mt-1 text-sm text-gray-500">{message}</p>
  </div>
);

const DEFAULT_RIGHTS = { can_view: true, can_create: true, can_edit: true, can_delete: true };

const CashRegister = ({ rights = DEFAULT_RIGHTS, onToggleSidebar, onToggleChatbox }) => {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const formatReceiptDisplay = useCallback((full) => {
    if (!full) return '--';
    // Remove the slash right before the 6-digit sequence (e.g. C01/25/R/000001 -> C01/25/R000001)
    return String(full).replace(/\/(?=\d{6}$)/, '');
  }, []);
  const [filters, setFilters] = useState({ date: today, payment_mode: '' });
  const [selectedTopbarMenu, setSelectedTopbarMenu] = useState('➕ Add');
  const [entries, setEntries] = useState([]);
  const [feeTypes, setFeeTypes] = useState([]);
  const [formState, setFormState] = useState({
    date: today,
    payment_mode: 'CASH',
    remark: '',
  });
  const [feeItems, setFeeItems] = useState([{ fee_type: '', amount: '' }]);
  const [receiptPreview, setReceiptPreview] = useState('--');
  const [receiptPreviewRaw, setReceiptPreviewRaw] = useState('');
  const [previewNonce, setPreviewNonce] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [editingEntry, setEditingEntry] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [pageError, setPageError] = useState('');
  const actionSummary = ACTION_DESCRIPTIONS[selectedTopbarMenu] || ACTION_DESCRIPTIONS['➕ Add'];
  const formatAmount = useCallback((value) => {
    const num = Number(value || 0);
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, []);

  const applyPreview = useCallback(
    (full) => {
      const safeFull = full || '';
      setReceiptPreviewRaw(safeFull);
      setReceiptPreview(safeFull ? formatReceiptDisplay(safeFull) : '--');
    },
    [formatReceiptDisplay]
  );

  const recNumberDisplay = useMemo(() => {
    if (editingEntry) {
      const seq = extractSequenceNumber(editingEntry);
      return seq != null ? String(seq).padStart(6, '0') : '';
    }
    if (!receiptPreviewRaw) {
      return '';
    }
    const match = String(receiptPreviewRaw).match(RECEIPT_SUFFIX_REGEX);
    return match ? match[1] : '';
  }, [editingEntry, receiptPreviewRaw]);

  const filteredEntries = useMemo(() => {
    if (!filters.payment_mode) {
      return entries;
    }
    return entries.filter((entry) => entry.payment_mode?.toUpperCase() === filters.payment_mode);
  }, [entries, filters.payment_mode]);

  const receiptFeesMap = useMemo(() => {
    const map = {};
    filteredEntries.forEach((e) => {
      const key = e.receipt_no_full || `__${e.id}`;
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    const summary = {};
    Object.keys(map).forEach((k) => {
      const arr = map[k];
      if (arr.length === 1) {
        const single = arr[0];
        summary[k] = single.fee_type_code ? `${single.fee_type_code} - ${single.fee_type_name}` : single.fee_type_name || '--';
      } else {
        summary[k] = arr
          .map((a) => {
            const label = a.fee_type_code || a.fee_type_name || 'UNKNOWN';
            const amt = Number(a.amount || 0).toFixed(2);
            return `${label}=${amt}`;
          })
          .join(', ');
      }
    });
    return summary;
  }, [filteredEntries]);

  // Group flattened rows into one row per receipt (aggregate amount and keep header fields)
  const displayedEntries = useMemo(() => {
    const grouped = {};
    filteredEntries.forEach((e) => {
      const key = e.receipt_no_full || `__${e.id}`;
      if (!grouped[key]) {
        grouped[key] = {
          id: key,
          date: e.date,
          payment_mode: e.payment_mode,
          receipt_no_full: e.receipt_no_full,
          rec_ref: e.rec_ref,
          rec_no: e.rec_no,
          fee_type_code: e.fee_type_code,
          fee_type_name: e.fee_type_name,
          amount: 0,
          remark: e.remark || '',
          created_by: e.created_by,
          created_by_name: e.created_by_name,
          created_at: e.created_at,
          updated_at: e.updated_at,
        };
      }
      grouped[key].amount = Number(grouped[key].amount || 0) + Number(e.amount || 0);
    });
    return Object.values(grouped).sort((a, b) => (a.receipt_no_full || '').localeCompare(b.receipt_no_full || ''));
  }, [filteredEntries]);

  const totalsByMode = useMemo(() => {
    // Sum amounts per payment mode and count distinct receipts (not items)
    const base = PAYMENT_MODES.reduce((acc, mode) => {
      acc[mode.value] = { amount: 0, count: 0 };
      return acc;
    }, {});
    const seen = {};
    entries.forEach((entry) => {
      const key = entry.payment_mode?.toUpperCase();
      if (!key) return;
      if (!base[key]) base[key] = { amount: 0, count: 0 };
      const amt = Number(entry.amount) || 0;
      base[key].amount += amt;
      const receiptKey = entry.receipt_no_full || `__${entry.id}`;
      if (!seen[key]) seen[key] = new Set();
      if (!seen[key].has(receiptKey)) {
        seen[key].add(receiptKey);
        base[key].count += 1;
      }
    });
    return base;
  }, [entries]);

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
      if (!editingEntry && data.length && !feeItems[0].fee_type) {
        setFeeItems([{ fee_type: data[0].id?.toString() || '', amount: '' }]);
      }
    } catch (err) {
      setFlash('error', 'Unable to load fee types');
    }
  }, [editingEntry, feeItems, setFlash]);

  const loadEntries = useCallback(async () => {
    if (!rights.can_view || !filters.date) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setPageError('');
    try {
      const data = await fetchCashEntries({ date: filters.date });
      setEntries(Array.isArray(data) ? data : data?.results || []);
    } catch (err) {
      setPageError('Failed to load cash register entries.');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [rights.can_view, filters.date]);

  const computeFallbackReceipt = useCallback(
    (mode, date) => {
      if (!mode || !date) {
        return null;
      }
      const normalizedMode = mode.toUpperCase();
      const sameDayEntries = entries.filter(
        (entry) =>
          entry.payment_mode?.toUpperCase() === normalizedMode && entry.date === date
      );
      const candidates = sameDayEntries.filter((entry) => {
        const prefix = extractReferencePrefix(entry);
        const sequence = extractSequenceNumber(entry);
        return Boolean(prefix) && sequence !== null;
      });
      if (!candidates.length) {
        return null;
      }
      let best = candidates[0];
      for (let idx = 1; idx < candidates.length; idx += 1) {
        const entry = candidates[idx];
        const bestSeq = extractSequenceNumber(best) || 0;
        const entrySeq = extractSequenceNumber(entry) || 0;
        if (entrySeq > bestSeq) {
          best = entry;
        }
      }
      const prefix = extractReferencePrefix(best);
      const nextSeq = (extractSequenceNumber(best) || 0) + 1;
      return prefix ? `${prefix}${String(nextSeq).padStart(6, '0')}` : null;
    },
    [entries]
  );

  useEffect(() => {
    loadFeeTypes();
  }, [loadFeeTypes]);

  useEffect(() => {
    if (rights.can_view) {
      loadEntries();
    }
  }, [rights.can_view, loadEntries]);

  useEffect(() => {
    if (!formState.date) {
      applyPreview('');
      setPreviewError('Select a date to generate the next number.');
      setPreviewLoading(false);
      return;
    }
    setPreviewError('');
    if (!rights.can_create) {
      const fallbackFull = computeFallbackReceipt(formState.payment_mode, formState.date);
      if (fallbackFull) {
        applyPreview(fallbackFull);
        setPreviewError('View-only mode: showing estimated next number.');
      } else {
        applyPreview('');
        setPreviewError('View-only mode: unable to estimate next number.');
      }
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    let isActive = true;
    const preview = async () => {
      try {
        const data = await fetchNextReceiptNumber({ payment_mode: formState.payment_mode, date: formState.date });
        if (isActive) {
          const serverFull = data?.receipt_no_full || data?.next_receipt_no;
          const fallbackFull = computeFallbackReceipt(formState.payment_mode, formState.date);
          const serverSeq = extractSequenceFromFull(serverFull);
          const fallbackSeq = extractSequenceFromFull(fallbackFull);
          let resolvedFull = serverFull;
          if (fallbackFull && fallbackSeq !== null && (serverSeq === null || fallbackSeq >= serverSeq)) {
            resolvedFull = fallbackFull;
          }
          applyPreview(resolvedFull || '');
        }
      } catch (err) {
        if (!isActive) {
          return;
        }
        const fallbackFull = computeFallbackReceipt(formState.payment_mode, formState.date);
        if (fallbackFull) {
          applyPreview(fallbackFull);
          setPreviewError('Live preview unavailable. Showing the next estimated number.');
        } else {
          applyPreview('');
          setPreviewError('Unable to fetch next receipt number.');
        }
      } finally {
        if (isActive) {
          setPreviewLoading(false);
        }
      }
    };
    preview();
    return () => {
      isActive = false;
    };
  }, [formState.date, formState.payment_mode, rights.can_create, computeFallbackReceipt, previewNonce, applyPreview]);

  useEffect(() => {
    if (!rights.can_create || editingEntry) {
      return;
    }
    const fallbackFull = computeFallbackReceipt(formState.payment_mode, formState.date);
    if (!fallbackFull) {
      return;
    }
    const fallbackSeq = extractSequenceFromFull(fallbackFull);
    const currentSeq = extractSequenceFromFull(receiptPreviewRaw);
    if (fallbackSeq !== null && (currentSeq === null || fallbackSeq > currentSeq)) {
      applyPreview(fallbackFull);
    }
  }, [
    rights.can_create,
    editingEntry,
    computeFallbackReceipt,
    formState.payment_mode,
    formState.date,
    receiptPreviewRaw,
    applyPreview,
  ]);

  useEffect(() => {
    if (!editingEntry && filters.date) {
      setFormState((prev) => ({ ...prev, date: filters.date }));
    }
  }, [filters.date, editingEntry]);

  useEffect(() => {
    if (editingEntry) {
      return;
    }
    if (filters.payment_mode) {
      setFormState((prev) => ({ ...prev, payment_mode: filters.payment_mode }));
    } else {
      setFormState((prev) => ({ ...prev, payment_mode: 'CASH' }));
    }
  }, [filters.payment_mode, editingEntry]);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleTopbarSelect = (action) => {
    setSelectedTopbarMenu(action);
  };

  const handleModeCardClick = (modeValue) => {
    setFilters((prev) => ({
      ...prev,
      payment_mode: prev.payment_mode === modeValue ? '' : modeValue,
    }));
  };

  const handleFormChange = (field, value) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setEditingEntry(null);
    setFormState({
      date: filters.date || today,
      payment_mode: filters.payment_mode || 'CASH',
      remark: '',
    });
    setFeeItems([{ fee_type: feeTypes[0]?.id?.toString() || '', amount: '' }]);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    // Validate items
    const validItems = feeItems.filter(item => item.fee_type && item.amount);
    if (!formState.date || validItems.length === 0) {
      setFlash('error', 'Date and at least one Fee Type with Amount are required.');
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
    
    // Validate amounts
    for (const item of validItems) {
      const parsedAmount = Number(item.amount);
      if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        setFlash('error', 'All amounts must be greater than zero.');
        return;
      }
    }
    
    setSaving(true);
    try {
      if (editingEntry) {
        // For editing, use old single-entry API
        const payload = {
          date: formState.date,
          payment_mode: formState.payment_mode,
          fee_type: Number(validItems[0].fee_type),
          amount: Number(validItems[0].amount),
          remark: formState.remark?.trim() || '',
        };
        await updateCashEntry(editingEntry.id, payload);
        setFlash('success', 'Entry updated successfully');
      } else {
        // For new entries, use bulk-create endpoint to handle multiple items
        const payload = {
          receipts: [{
            date: formState.date,
            payment_mode: formState.payment_mode,
            remark: formState.remark?.trim() || '',
            items: validItems.map(item => ({
              fee_type: Number(item.fee_type),
              amount: Number(item.amount),
            })),
          }],
        };
        await createReceiptsBulk(payload);
        setFlash('success', `Receipt added with ${validItems.length} item(s)`);
        setPreviewNonce((prev) => prev + 1);
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
      remark: entry.remark || '',
    });
    setFeeItems([{ fee_type: entry.fee_type?.toString() || '', amount: entry.amount }]);
  };

  const handleDelete = async (entry) => {
    if (!rights.can_delete) return;
    const displayNumber = formatReceiptDisplay(entry.receipt_no_full);
    if (!window.confirm(`Delete receipt ${displayNumber}?`)) return;
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

  // Show Payment Report when Report button is clicked
  if (selectedTopbarMenu === '📄 Report') {
    return (
      <PaymentReport 
        onBack={() => setSelectedTopbarMenu('➕ Add')}
      />
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 h-full bg-slate-100">
      <PageTopbar
        title="Cash Register"
        actions={TOPBAR_ACTIONS}
        selected={selectedTopbarMenu}
        onSelect={handleTopbarSelect}
        onToggleSidebar={onToggleSidebar}
        onToggleChatbox={onToggleChatbox}
        actionsOnLeft
        rightSlot={(
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow"
          >
            🏠 Home
          </a>
        )}
      />
      <div className="w-full space-y-5">
        {status && (
          <section
            className={`rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm ${
              status.type === 'success'
                ? 'border-green-200 bg-green-50 text-green-800'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {status.message}
          </section>
        )}

        {/* Filters */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-800">Filter by date</h2>
            <button
              type="button"
              className="text-sm font-semibold text-blue-600 hover:underline"
              onClick={() => setFilters({ date: today, payment_mode: '' })}
            >
              Reset to today
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex flex-col text-xs font-medium text-gray-600">
              <span>Date</span>
              <input
                type="date"
                value={filters.date || ''}
                onChange={(e) => handleFilterChange('date', e.target.value)}
                className="mt-1 min-w-[170px] rounded border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="flex flex-col text-xs font-medium text-gray-600">
              <span>Payment mode</span>
              <select
                value={filters.payment_mode}
                onChange={(e) => handleFilterChange('payment_mode', e.target.value)}
                className="mt-1 min-w-[150px] rounded border border-gray-300 px-3 py-2"
              >
                <option value="">All modes</option>
                {PAYMENT_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-1 flex-wrap justify-end gap-3">
              {PAYMENT_MODES.map((mode) => {
                const summary = totalsByMode[mode.value] || { amount: 0, count: 0 };
                const isActive = filters.payment_mode === mode.value;
                const style = MODE_CARD_STYLES[mode.value] || 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100';
                return (
                  <button
                    type="button"
                    key={mode.value}
                    onClick={() => handleModeCardClick(mode.value)}
                    className={`min-w-[150px] flex-1 rounded-lg border px-4 py-3 text-left text-sm font-semibold shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${style} ${isActive ? 'ring-2 ring-blue-500' : ''}`}
                  >
                    <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide">
                      <span>{mode.label}</span>
                      <span>{summary.count} receipt(s)</span>
                    </div>
                    <div className="mt-2 text-2xl font-semibold">₹ {formatAmount(summary.amount)}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Entry form */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 border-b border-gray-100 pb-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">
                {editingEntry ? `Update receipt ${formatReceiptDisplay(editingEntry.receipt_no_full)}` : 'New entry'}
              </h2>
            </div>
            <div className="text-center text-sm font-semibold uppercase tracking-wide text-gray-500 md:text-right">
              <span className="text-xs">Next number:</span>
              <div className="font-mono text-xl text-gray-900">
                {previewLoading ? 'Fetching...' : (receiptPreview || '--')}
              </div>
              {previewError && <p className="text-xs text-red-600">{previewError}</p>}
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-wrap items-end gap-4 lg:flex-nowrap">
              <label className="text-sm font-medium text-gray-700 w-full sm:w-[190px] lg:w-[200px]">
              Date
              <input
                type="date"
                value={formState.date}
                onChange={(e) => handleFormChange('date', e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                required
              />
            </label>
              <label className="text-sm font-medium text-gray-700 w-full sm:w-[170px] lg:w-[140px]">
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
              <label className="text-sm font-medium text-gray-700 w-full sm:w-[150px] lg:w-[130px]">
              Rec No
              <input
                type="text"
                value={recNumberDisplay || ''}
                readOnly
                placeholder="Auto"
                className="mt-1 w-full rounded border border-gray-300 bg-gray-100 px-3 py-2 font-mono"
              />
            </label>
              <label className="text-sm font-medium text-gray-700 flex-1 min-w-[200px] lg:flex-[1_1_220px]">
              Receipt No
              <input
                type="text"
                value={editingEntry ? formatReceiptDisplay(editingEntry.receipt_no_full) : receiptPreview}
                readOnly
                className="mt-1 w-full rounded border border-dashed border-gray-300 bg-gray-100 px-3 py-2 font-mono"
              />
            </label>
            </div>
            
            {/* Fee Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-gray-700">Fee Type(s) & Amount(s)</label>
                {!editingEntry && (
                  <button
                    type="button"
                    onClick={() => setFeeItems([...feeItems, { fee_type: feeTypes[0]?.id?.toString() || '', amount: '' }])}
                    className="rounded bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700"
                  >
                    ➕ Add More
                  </button>
                )}
              </div>
              {feeItems.map((item, index) => (
                <div key={index} className="flex flex-wrap items-end gap-3">
                  <label className="text-sm font-medium text-gray-700 flex-1 min-w-[220px] lg:flex-[1_1_300px]">
                    {index === 0 ? 'Fee Type' : ''}
                    <select
                      value={item.fee_type}
                      onChange={(e) => {
                        const updated = [...feeItems];
                        updated[index].fee_type = e.target.value;
                        setFeeItems(updated);
                      }}
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
                  <label className="text-sm font-medium text-gray-700 w-full sm:w-[160px] lg:w-[180px]">
                    {index === 0 ? 'Amount' : ''}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.amount}
                      onChange={(e) => {
                        const updated = [...feeItems];
                        updated[index].amount = e.target.value;
                        setFeeItems(updated);
                      }}
                      className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                      required
                    />
                  </label>
                  {!editingEntry && feeItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setFeeItems(feeItems.filter((_, i) => i !== index))}
                      className="rounded border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      ✖
                    </button>
                  )}
                </div>
              ))}
            </div>
            
            <div className="flex flex-wrap items-end gap-4">
              <label className="text-sm font-medium text-gray-700 flex-1 min-w-[260px] lg:w-1/2">
                Remark
                <input
                  type="text"
                  value={formState.remark}
                  onChange={(e) => handleFormChange('remark', e.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                  placeholder="Optional notes"
                />
              </label>
              <div className="flex flex-wrap gap-3 lg:flex-1 lg:justify-start">
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
            </div>
          </form>
        </section>

        {/* Table */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Entries for {filters.date || 'selected date'}</h2>
              {pageError && <p className="text-sm text-red-600">{pageError}</p>}
            </div>
            <span className="text-sm text-gray-500">{displayedEntries.length} receipt(s)</span>
          </div>
          {loading ? (
            <div className="py-10 text-center text-gray-500">Loading...</div>
          ) : !filters.date ? (
            <EmptyState title="Select a date" message="Pick a date to see cash register rows." />
          ) : displayedEntries.length === 0 ? (
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
                  {displayedEntries.map((entry) => {
                    const formattedReceipt = formatReceiptDisplay(entry.receipt_no_full);
                    return (
                      <tr key={entry.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-mono text-sm text-gray-900">
                          <div>{formattedReceipt}</div>
                        </td>
                      <td className="px-4 py-2 capitalize text-gray-700">{entry.payment_mode.toLowerCase()}</td>
                      <td
                        className="px-4 py-2 text-gray-700 break-words max-w-[20rem]"
                        title={receiptFeesMap[entry.receipt_no_full || entry.id]}
                      >
                        {receiptFeesMap[entry.receipt_no_full || entry.id] || (entry.fee_type_code ? `${entry.fee_type_code} - ${entry.fee_type_name}` : entry.fee_type_name || '--')}
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
                    );
                  })}
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
