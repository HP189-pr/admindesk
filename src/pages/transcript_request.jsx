import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import PageTopbar from '../components/PageTopbar';
import {
  fetchTranscriptRequests,
  updateTranscriptRequest,
  bulkUpdateTranscriptStatus,
  deleteTranscriptRequest,
  bulkDeleteTranscriptRequests,
  syncTranscriptRequestsFromSheet,
} from '../services/transcriptreqService';

const API_BASE_URL = 'http://127.0.0.1:8000';
const ACTIONS = ['🔍 Filter', '🧰 Tools', '📝 Edit'];

const STATUS_LABELS = {
  pending: 'Pending',
  progress: 'In Progress',
  done: 'Sent',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'pending', label: STATUS_LABELS.pending },
  { value: 'progress', label: STATUS_LABELS.progress },
  { value: 'done', label: STATUS_LABELS.done },
];

const RIGHTS_FALLBACK = { can_view: false, can_create: false, can_edit: false, can_delete: false };
const RIGHTS_DEFAULT = { can_view: true, can_create: false, can_edit: true, can_delete: false };

const TranscriptRequestPage = ({ onToggleSidebar, onToggleChatbox }) => {
  const [statusFilter, setStatusFilter] = useState('');
  const [instituteFilter, setInstituteFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedAction, setSelectedAction] = useState(ACTIONS[0]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [rows, setRows] = useState([]);
  const [rawResponse, setRawResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeRow, setActiveRow] = useState(null);
  const [editForm, setEditForm] = useState({ mail_status: 'pending', transcript_remark: '', email: '', submit_mail: '', pdf_generate: '', institute_name: '', request_ref_no: '' });
  const activeRowRef = useRef(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [bulkStatus, setBulkStatus] = useState('');
  const [polling, setPolling] = useState(false);
  // Refresh will perform a sheet sync (sheet is source of truth)
  const [safeRefresh] = useState(true);
  const [forceStatus] = useState(true);
  const [rights, setRights] = useState(RIGHTS_FALLBACK);
  const [rightsLoaded, setRightsLoaded] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncModalContent, setSyncModalContent] = useState('');

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
    return () => clearTimeout(handle);
  }, [searchTerm]);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setRights(RIGHTS_FALLBACK);
      setRightsLoaded(true);
      return;
    }
    const loadRights = async () => {
      try {
        const { data } = await axios.get(`${API_BASE_URL}/api/my-navigation/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const modules = data?.modules || [];
        const targetKeywords = ['transcript request', 'transcript'];
        let match = RIGHTS_FALLBACK;
        for (const mod of modules) {
          for (const menu of mod?.menus || []) {
            const name = (menu?.name || '').toLowerCase();
            if (targetKeywords.some((kw) => name.includes(kw))) {
              match = {
                can_view: !!menu?.rights?.can_view || !!menu?.rights?.view,
                can_create: !!menu?.rights?.can_create || !!menu?.rights?.add,
                can_edit: !!menu?.rights?.can_edit || !!menu?.rights?.edit,
                can_delete: !!menu?.rights?.can_delete || !!menu?.rights?.delete,
              };
              break;
            }
          }
          if (match !== RIGHTS_FALLBACK) break;
        }
        if (match === RIGHTS_FALLBACK) {
          match = RIGHTS_DEFAULT;
        }
        setRights(match);
      } catch (err) {
        setRights(RIGHTS_DEFAULT);
      } finally {
        setRightsLoaded(true);
      }
    };
    loadRights();
  }, []);

  const setFlashMessage = useCallback((type, text) => {
    setFlash({ type, text });
    if (text) {
      setTimeout(() => setFlash(null), 3500);
    }
  }, []);

  const loadRows = useCallback(async () => {
    if (!rights.can_view) return;
    setLoading(true);
    setError('');
    try {
      const { rows: dataRows, raw } = await fetchTranscriptRequests({
        status: statusFilter || undefined,
        search: debouncedSearch || undefined,
        institute: instituteFilter || undefined,
      });
      setRows(dataRows);
      setRawResponse(raw);
      setSelectedIds((prev) => prev.filter((id) => dataRows.some((row) => row.id === id)));
      setActiveRow((prev) => {
        if (!dataRows.length) return null;
        if (!prev) return dataRows[0];
        const match = dataRows.find((row) => row.id === prev.id);
        return match || dataRows[0];
      });
    } catch (err) {
      setError(err.message || 'Failed to load transcript requests.');
      setRows([]);
      setActiveRow(null);
    } finally {
      setLoading(false);
    }
  }, [rights.can_view, statusFilter, debouncedSearch, instituteFilter]);

  useEffect(() => {
    if (!rightsLoaded || !rights.can_view) {
      if (rightsLoaded && !rights.can_view) setRows([]);
      return;
    }
    loadRows();
  }, [loadRows, rightsLoaded, rights.can_view]);

  useEffect(() => {
    if (rightsLoaded && !rights.can_view) {
      setActiveRow(null);
      setSelectedIds([]);
    }
  }, [rightsLoaded, rights.can_view]);

  useEffect(() => {
    if (!activeRow) {
      setEditForm({ mail_status: 'pending', transcript_remark: '', email: '' });
      return;
    }
    activeRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const normalizeMailStatus = (value) => {
      if (!value || String(value).trim() === '') return 'progress';
      const txt = String(value).trim().toLowerCase();
      if (['yes', 'done', 'sent'].includes(txt)) return 'done';
      if (txt === 'pending') return 'pending';
      if (['progress', 'in progress', 'in-progress', 'processing'].includes(txt)) return 'progress';
      return 'progress';
    };

    setEditForm({
      mail_status: normalizeMailStatus(activeRow.mail_status),
      transcript_remark: activeRow.transcript_remark || '',
      email: activeRow.email || '',
      submit_mail: activeRow.submit_mail || '',
      pdf_generate: activeRow.pdf_generate || '',
      institute_name: activeRow.institute_name || '',
      request_ref_no: activeRow.request_ref_no || '',
    });
  }, [activeRow]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (!rows.length) return;
    const selectableIds = rows.map((row) => row.id);
    const allSelected = selectableIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !selectableIds.includes(id)));
    } else {
      setSelectedIds(Array.from(new Set([...selectedIds, ...selectableIds])));
    }
  };

  const handleRowSelect = useCallback((row) => {
    if (!row) return;
    setActiveRow(row);
    const normalizeMailStatus = (value) => {
      if (!value || String(value).trim() === '') return 'progress';
      const txt = String(value).trim().toLowerCase();
      if (['yes', 'done', 'sent'].includes(txt)) return 'done';
      if (txt === 'pending') return 'pending';
      if (['progress', 'in progress', 'in-progress', 'processing'].includes(txt)) return 'progress';
      return 'progress';
    };

    setEditForm({
      mail_status: normalizeMailStatus(row.mail_status),
      transcript_remark: row.transcript_remark || '',
      email: row.email || '',
    });
    setSelectedAction(ACTIONS[2]);
    setPanelOpen(true);
  }, []);

  const applyUpdate = async (rowId, overrideForm) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    const form = overrideForm || editForm;
    
    // Validate required NOT NULL fields before building payload
    const enrollment = form.enrollment_no ?? row.enrollment_no ?? '';
    if (!enrollment.trim()) {
      setFlashMessage('error', 'Enrollment number is required and cannot be empty.');
      return;
    }
    
    const studentName = form.student_name ?? row.student_name ?? '';
    if (!studentName.trim()) {
      setFlashMessage('error', 'Student name is required and cannot be empty.');
      return;
    }
    
    const instituteName = form.institute_name ?? row.institute_name ?? '';
    if (!instituteName.trim()) {
      setFlashMessage('error', 'Institute name is required and cannot be empty.');
      return;
    }
    
    const submitMail = form.submit_mail ?? row.submit_mail ?? '';
    if (!submitMail.trim()) {
      setFlashMessage('error', 'Submit mail is required and cannot be empty.');
      return;
    }
    
    const payload = {};
    const normalizeMailStatus = (value) => {
      if (!value || String(value).trim() === '') return 'progress';
      const txt = String(value).trim().toLowerCase();
      if (['yes', 'done', 'sent'].includes(txt)) return 'done';
      if (txt === 'pending') return 'pending';
      if (['progress', 'in progress', 'in-progress', 'processing'].includes(txt)) return 'progress';
      return 'progress';
    };

    const originalStatus = normalizeMailStatus(row.mail_status);
    const nextStatus = form.mail_status ?? originalStatus ?? 'pending';
    const nextRemark = form.transcript_remark ?? row.transcript_remark ?? '';
    if (nextStatus !== originalStatus) payload.mail_status = nextStatus;
    if ((nextRemark || '') !== (row.transcript_remark || '')) payload.transcript_remark = nextRemark || '';

    // contact field (email) — phone and address editing removed
    const nextEmail = form.email ?? row.email ?? '';
    if ((nextEmail || '') !== (row.email || '')) payload.email = nextEmail || '';

    const nextSubmitMail = form.submit_mail ?? row.submit_mail ?? '';
    if ((nextSubmitMail || '') !== (row.submit_mail || '')) payload.submit_mail = nextSubmitMail || '';

    const nextPdf = form.pdf_generate ?? row.pdf_generate ?? '';
    if ((nextPdf || '') !== (row.pdf_generate || '')) payload.pdf_generate = nextPdf || '';

    const nextInstitute = form.institute_name ?? row.institute_name ?? '';
    if ((nextInstitute || '') !== (row.institute_name || '')) payload.institute_name = nextInstitute || '';

    const nextRef = form.request_ref_no ?? row.request_ref_no ?? '';
    if ((nextRef || '') !== (row.request_ref_no || '')) payload.request_ref_no = nextRef || '';
    if (Object.keys(payload).length === 0) {
      setFlashMessage('info', 'No changes to save.');
      return;
    }

    setUpdatingId(rowId);
    try {
      const updated = await updateTranscriptRequest(rowId, payload);
      setRows((prev) => prev.map((item) => (item.id === rowId ? updated : item)));
      if (rowId === activeRow?.id) {
        setActiveRow(updated);
        setEditForm({
          mail_status: normalizeMailStatus(updated.mail_status),
          transcript_remark: updated.transcript_remark || '',
          email: updated.email || '',
        });
      }
      setFlashMessage('success', 'Transcript request updated.');
    } catch (err) {
      setFlashMessage('error', err.message || 'Failed to update transcript request.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleBulkStatusUpdate = async () => {
    if (!selectedIds.length) {
      setFlashMessage('info', 'Select at least one request.');
      return;
    }
    if (!bulkStatus) {
      setFlashMessage('info', 'Choose a status to apply.');
      return;
    }
    try {
      await bulkUpdateTranscriptStatus(selectedIds, bulkStatus);
      await loadRows();
      setSelectedIds([]);
      setBulkStatus('');
      setFlashMessage('success', 'Status updated for selected requests.');
    } catch (err) {
      setFlashMessage('error', err.message || 'Bulk update failed.');
    }
  };

  const handleDelete = async (id) => {
    if (!rights.can_delete) {
      setFlashMessage('error', 'No permission to delete.');
      return;
    }
    if (!confirm('Delete this transcript request? This cannot be undone.')) return;
    try {
      await deleteTranscriptRequest(id);
      setFlashMessage('success', 'Request deleted.');
      await loadRows();
    } catch (err) {
      setFlashMessage('error', err.message || 'Delete failed.');
    }
  };

  const handleBulkDelete = async () => {
    if (!rights.can_delete) {
      setFlashMessage('error', 'No permission to delete.');
      return;
    }
    if (!selectedIds.length) return setFlashMessage('info', 'Select at least one request to delete.');
    if (!confirm(`Delete ${selectedIds.length} selected requests? This cannot be undone.`)) return;
    try {
      await bulkDeleteTranscriptRequests(selectedIds);
      setFlashMessage('success', 'Selected requests deleted.');
      setSelectedIds([]);
      await loadRows();
    } catch (err) {
      setFlashMessage('error', err.message || 'Bulk delete failed.');
    }
  };

  // optional polling to auto-refresh list (every 10s) when enabled
  useEffect(() => {
    if (!polling || !rights.can_view) return undefined;
    const id = setInterval(async () => {
      try {
        // first ask server to import any new rows from the sheet, then reload
        await syncTranscriptRequestsFromSheet();
        await loadRows();
      } catch (err) {
        // swallow errors; show a flash for the first error could be noisy so keep silent
      }
    }, 10000);
    return () => clearInterval(id);
  }, [polling, rights.can_view, loadRows]);

  const handleReload = () => loadRows();

  const statusCounts = useMemo(() => {
    const counts = { pending: 0, progress: 0, done: 0 };
    rows.forEach((row) => {
      const raw = (row.mail_status || '').toString().trim().toLowerCase();
      let key = 'progress';
      if (!raw) key = 'progress';
      else if (['yes', 'done', 'sent'].includes(raw)) key = 'done';
      else if (raw === 'pending') key = 'pending';
      else if (['progress', 'in progress', 'processing'].includes(raw)) key = 'progress';
      if (counts[key] !== undefined) counts[key] += 1;
    });
    return counts;
  }, [rows]);

  // sort rows for display: prefer numeric `tr_request_no` (higher = newer),
  // sort rows for display: first by mail_status priority (done > progress > pending),
  // then by numeric `tr_request_no` (higher numbers first), then by requested_at desc.
  const sortedRows = useMemo(() => {
    const copy = Array.isArray(rows) ? [...rows] : [];
    const statusRank = (s) => {
      const v = (s || '').toString().toLowerCase();
      if (v === 'done') return 0;
      if (v === 'progress') return 1;
      if (v === 'pending') return 2;
      return 3;
    };

    const parseNumeric = (val) => {
      if (val === null || val === undefined) return NaN;
      const n = Number(val);
      if (Number.isFinite(n)) return n;
      const txt = String(val || '').replace(/[^0-9]/g, '');
      const m = txt ? Number(txt) : NaN;
      return Number.isFinite(m) ? m : NaN;
    };

    copy.sort((a, b) => {
      const sa = statusRank(a?.mail_status);
      const sb = statusRank(b?.mail_status);
      if (sa !== sb) return sa - sb; // lower rank = higher priority

      const aNo = parseNumeric(a?.tr_request_no ?? a?.request_ref_no);
      const bNo = parseNumeric(b?.tr_request_no ?? b?.request_ref_no);
      const aHas = Number.isFinite(aNo);
      const bHas = Number.isFinite(bNo);
      if (aHas || bHas) {
        if (!aHas) return 1;
        if (!bHas) return -1;
        if (bNo !== aNo) return bNo - aNo; // higher numbers first
      }

      // fallback to requested_at desc
      const da = a?.requested_at ? new Date(a.requested_at).getTime() : 0;
      const db = b?.requested_at ? new Date(b.requested_at).getTime() : 0;
      return db - da;
    });
    return copy;
  }, [rows]);

  const formatDateTime = (value) => {
    if (!value) return 'N/A';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return `${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const formatStatus = (value) => {
    // If sheet value is blank -> show In Progress
    if (!value || String(value).trim() === '') return STATUS_LABELS.progress;
    const text = String(value).trim().toLowerCase();
    // treat yes/done/sent as Sent
    if (['yes', 'done', 'sent'].includes(text)) return STATUS_LABELS.done;
    if (['progress', 'in progress', 'in-progress', 'processing'].includes(text)) return STATUS_LABELS.progress;
    if (['pending', 'pending approval'].includes(text)) return STATUS_LABELS.pending;
    // fallback: if matches known labels
    const lookup = STATUS_LABELS[text];
    return lookup || STATUS_LABELS.progress;
  };

  const statusBadgeClass = (value) => {
    const base = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';
    const label = formatStatus(value);
    if (label === STATUS_LABELS.done) return `${base} bg-green-100 text-green-700`;
    if (label === STATUS_LABELS.progress) return `${base} bg-blue-100 text-blue-700`;
    return `${base} bg-yellow-100 text-yellow-700`;
  };

  return (
    <div className="p-4 md:p-6 space-y-4 h-full">
      <PageTopbar
        title="Transcript Requests"
        leftSlot={<div className="h-10 w-10 flex items-center justify-center rounded-xl bg-purple-600 text-white text-xl">📜</div>}
        actions={ACTIONS}
        selected={selectedAction}
        onSelect={(action) => {
          setSelectedAction(action);
          setPanelOpen(true);
        }}
        actionsOnLeft
        onToggleSidebar={onToggleSidebar}
        onToggleChatbox={onToggleChatbox}
        rightSlot={
              rights.can_view ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        // Refresh should sync from Google Sheet (sheet is source of truth)
                        setLoading(true);
                        setError('');
                        try {
                          setFlashMessage('info', 'Syncing from Google Sheet...');
                          const result = await syncTranscriptRequestsFromSheet({ no_prune: true, force_overwrite_status: true });
                          if (result && result.summary) {
                            const summary = result.summary;
                            setFlashMessage('info', `Imported: ${summary.created} created, ${summary.updated} updated, total ${summary.total}`);
                            // build concise modal content with sample TR numbers
                            const take = (arr, n = 20) => (Array.isArray(arr) ? arr.slice(0, n) : []);
                            const createdSample = take(summary.created_trs).join(', ') || '—';
                            const updatedSample = take(summary.updated_trs).join(', ') || '—';
                            const modal = `Imported: ${summary.created} created\nUpdated: ${summary.updated}\nTotal rows in sheet: ${summary.total}\nPruned: ${summary.pruned || 0}\n\nCreated TRs (sample): ${createdSample}\nUpdated TRs (sample): ${updatedSample}`;
                            setSyncModalContent(modal);
                          }
                          setSyncModalOpen(true);
                          await loadRows();
                          setFlashMessage('success', 'Refresh completed.');
                        } catch (err) {
                          setFlashMessage('error', err.message || 'Refresh and sync failed.');
                          setSyncModalContent(err.message || 'Refresh and sync failed.');
                          setSyncModalOpen(true);
                        } finally {
                          setLoading(false);
                        }
                      }}
                      className="px-3 py-1.5 rounded bg-purple-600 text-white hover:bg-purple-700 text-sm"
                      disabled={loading}
                    >
                      ↻ Refresh
                    </button>
                  </div>
                ) : null
        }
      />

      {!rightsLoaded && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 text-gray-600">
          Loading permissions...
        </div>
      )}

      {rightsLoaded && !rights.can_view && (
        <div className="bg-white border border-red-200 text-red-700 px-4 py-3 rounded-2xl shadow-sm">
          You do not have permission to view this page.
        </div>
      )}

      {rightsLoaded && rights.can_view && (
        <>
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
              <div className="font-semibold text-gray-800">{selectedAction}</div>
              <button
                onClick={() => setPanelOpen((open) => !open)}
                className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50"
              >
                {panelOpen ? 'Collapse' : 'Expand'}
              </button>
            </div>

            {panelOpen && selectedAction === ACTIONS[0] && (
              <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Search</label>
                  <input
                    type="search"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="TR No, Enrollment number, student name, or email"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Mail Status</label>
                  <select
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Institute</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="Institute name"
                    value={instituteFilter}
                    onChange={(e) => setInstituteFilter(e.target.value)}
                  />
                </div>
                <div className="md:col-span-4 flex flex-wrap gap-3 text-sm text-gray-600">
                  <span>Pending: {statusCounts.pending}</span>
                  <span>In Progress: {statusCounts.progress}</span>
                  <span>Sent: {statusCounts.done}</span>
                  <span className="text-xs text-gray-500">Selected rows: {selectedIds.length}</span>
                </div>
              </div>
            )}

            {panelOpen && selectedAction === ACTIONS[1] && (
              <div className="p-4 space-y-3 text-sm text-gray-700">
                <p>
                  Apply a status to every selected request. Pick the status below and click Update after choosing the
                  rows in the table.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={bulkStatus}
                    onChange={(e) => setBulkStatus(e.target.value)}
                    disabled={!rights.can_edit}
                  >
                    <option value="">Choose status</option>
                    {STATUS_OPTIONS.filter((opt) => opt.value).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleBulkStatusUpdate}
                    className="px-3 py-2 rounded-lg bg-purple-600 text-white text-sm disabled:bg-purple-300"
                    disabled={!rights.can_edit || !selectedIds.length || loading}
                  >
                    Update Selected
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm disabled:bg-red-300"
                    disabled={!rights.can_delete || !selectedIds.length || loading}
                  >
                    Delete Selected
                  </button>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={polling} onChange={(e) => setPolling(e.target.checked)} /> Auto-sync
                  </label>
                  <span className="text-xs text-gray-500">Currently selected: {selectedIds.length} request(s).</span>
                </div>
                <ul className="list-disc pl-5 text-xs text-gray-500 space-y-1">
                  <li>Select rows using the checkboxes in the records table.</li>
                  <li>Bulk update only modifies the mail status field.</li>
                </ul>
              </div>
            )}

            {panelOpen && selectedAction === ACTIONS[2] && (
              <div ref={activeRowRef} className="p-4 space-y-4 text-sm text-gray-700">
                {activeRow ? (
                  <>
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-semibold text-gray-800">
                          {activeRow.student_name || 'Transcript Request'}
                        </h2>
                        <p className="text-xs text-gray-500">
                          Enrollment: {activeRow.enrollment_no || 'N/A'} • Reference: {activeRow.request_ref_no || 'N/A'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={statusBadgeClass(activeRow.mail_status)}>
                          {formatStatus(activeRow.mail_status)}
                        </span>
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          Row #{activeRow.sheet_row_number ?? '—'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-12 gap-4 items-start">
                      <div className="col-span-12 md:col-span-3">
                        <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Requested At</div>
                        <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-sm">{formatDateTime(activeRow.requested_at)}</div>
                      </div>

                      <div className="col-span-12 md:col-span-2">
                        <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">TR No</div>
                        <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-sm text-center font-mono">
                          {(() => {
                            const t = String(activeRow.tr_request_no ?? activeRow.request_ref_no ?? 'N/A');
                            if (t === 'N/A') return t;
                            return t.length > 8 ? t.slice(0, 8) + '…' : t;
                          })()}
                        </div>
                      </div>

                      <div className="col-span-12 md:col-span-3">
                        <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Enrollment</div>
                        <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-sm">{activeRow.enrollment_no || 'N/A'}</div>
                      </div>

                      <div className="col-span-12 md:col-span-4">
                        <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Student Name</div>
                        <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-sm">{activeRow.student_name || ''}</div>
                      </div>
                      
                    </div>

                    <div className="mt-3">
                      <div className="grid grid-cols-12 gap-3 items-end">
                        <div className="col-span-12 md:col-span-2">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Mail Status</label>
                          <select
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                            value={editForm.mail_status}
                            onChange={(e) => setEditForm((s) => ({ ...s, mail_status: e.target.value }))}
                          >
                            {STATUS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value || ''}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="col-span-12 md:col-span-2">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Submit Mail</label>
                          <input
                            type="text"
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                            value={editForm.submit_mail}
                            onChange={(e) => setEditForm((s) => ({ ...s, submit_mail: e.target.value }))}
                            placeholder="Submit mail"
                          />
                        </div>

                        <div className="col-span-12 md:col-span-2">
                          <label className="block text-xs font-medium text-gray-500 mb-1">PDF Generated</label>
                          <select
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                            value={editForm.pdf_generate}
                            onChange={(e) => setEditForm((s) => ({ ...s, pdf_generate: e.target.value }))}
                          >
                            <option value="">No</option>
                            <option value="Yes">Yes</option>
                          </select>
                        </div>

                        <div className="col-span-12 md:col-span-3">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Institute</label>
                          <input
                            type="text"
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                            value={editForm.institute_name}
                            onChange={(e) => setEditForm((s) => ({ ...s, institute_name: e.target.value }))}
                            placeholder="Institute"
                          />
                        </div>

                        <div className="col-span-12 md:col-span-2">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Reference</label>
                          <input
                            type="text"
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                            value={editForm.request_ref_no}
                            onChange={(e) => setEditForm((s) => ({ ...s, request_ref_no: e.target.value }))}
                            placeholder="Ref #"
                          />
                        </div>

                        <div className="col-span-12 md:col-span-1 flex md:justify-end">
                          <button
                            onClick={() => applyUpdate(activeRow.id)}
                            className="px-3 py-2 rounded bg-purple-600 text-white text-sm disabled:bg-purple-300 w-full"
                            disabled={!rights.can_edit || updatingId === activeRow.id}
                          >
                            {updatingId === activeRow.id ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
                        <span>Last updated: {formatDateTime(activeRow.updated_at || activeRow.modified_at)}</span>
                        {rights.can_delete && (
                          <button
                            onClick={() => handleDelete(activeRow.id)}
                            className="px-3 py-2 rounded bg-red-600 text-white text-sm"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-gray-600">Select a request from the table to review and edit details.</div>
                )}
              </div>
            )}
          </div>

          {flash && (
            <div
              className={`px-4 py-2 rounded-2xl border text-sm shadow-sm ${
                flash.type === 'success'
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : flash.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-blue-50 border-blue-200 text-blue-700'
              }`}
            >
              {flash.text}
            </div>
          )}

          {error && (
            <div className="bg-white border border-red-200 text-red-700 px-4 py-3 rounded-2xl shadow-sm">
              {error}
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 px-4 py-3 bg-gray-50 border-b">
              <div className="font-semibold text-gray-800">Transcript Request Records</div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span>Selected: {selectedIds.length}</span>
                <button
                  onClick={handleBulkStatusUpdate}
                  className="px-3 py-1.5 rounded bg-purple-600 text-white disabled:bg-purple-300"
                  disabled={!rights.can_edit || !selectedIds.length || loading || !bulkStatus}
                >
                  Apply Status
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100 text-gray-700 uppercase text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left">
                      <input
                        type="checkbox"
                        onChange={toggleSelectAll}
                        checked={rows.length > 0 && rows.every((row) => selectedIds.includes(row.id))}
                        aria-label="Select all"
                      />
                    </th>
                      <th className="px-3 py-2 text-left">TR No</th>
                      <th className="px-3 py-2 text-left">Enrollment No</th>
                      <th className="px-3 py-2 text-left">Student</th>
                      <th className="px-3 py-2 text-left">Reference</th>
                      <th className="px-3 py-2 text-left">Institute</th>
                      <th className="px-3 py-2 text-left">Receipt</th>
                      <th className="px-3 py-2 text-left">Transcript Remark</th>
                      <th className="px-3 py-2 text-left">PDF Generated</th>
                      <th className="px-3 py-2 text-left">Mail Status</th>
                      <th className="px-3 py-2 text-left">Submit Mail</th>
                    <th className="px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={12} className="px-4 py-6 text-center text-gray-500">
                        Loading transcript requests...
                      </td>
                    </tr>
                  )}
                  {!loading && rows.length === 0 && (
                    <tr>
                      <td colSpan={12} className="px-4 py-6 text-center text-gray-500">
                        No transcript requests found.
                      </td>
                    </tr>
                  )}
                  {!loading && sortedRows.map((row) => {
                    const isActive = activeRow?.id === row.id;
                    return (
                      <tr
                        key={row.id}
                        onClick={() => handleRowSelect(row)}
                        className={`border-b last:border-b-0 cursor-pointer transition-colors ${
                          isActive ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-3 py-2 align-top">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(row.id)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleSelect(row.id)}
                            aria-label={`Select request ${row.id}`}
                          />
                        </td>
                        <td className="px-3 py-2 align-top">{row.tr_request_no ?? row.request_ref_no ?? 'N/A'}</td>
                        <td className="px-3 py-2 align-top">{row.enrollment_no || 'N/A'}</td>
                        <td className="px-3 py-2 align-top">{row.student_name || 'N/A'}</td>
                        <td className="px-3 py-2 align-top">{row.request_ref_no || 'N/A'}</td>
                        <td className="px-3 py-2 align-top">{row.institute_name || 'N/A'}</td>
                        <td className="px-3 py-2 align-top">{row.transcript_receipt || ''}</td>
                        <td className="px-3 py-2 align-top text-xs text-gray-600 max-w-[18rem]">
                          {row.transcript_remark ? row.transcript_remark : ''}
                        </td>
                        <td className="px-3 py-2 align-top">{row.pdf_generate || ''}</td>
                        <td className="px-3 py-2 align-top">
                          <span className={statusBadgeClass(row.mail_status)}>{formatStatus(row.mail_status)}</span>
                        </td>
                        <td className="px-3 py-2 align-top">{row.submit_mail || 'N/A'}</td>
                        <td className="px-3 py-2 align-top">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRowSelect(row);
                            }}
                            className="px-3 py-1.5 rounded bg-purple-600 text-white text-xs hover:bg-purple-700"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {rawResponse && (
            <details className="bg-white border border-gray-200 rounded-2xl shadow-sm">
              <summary className="cursor-pointer px-4 py-3 text-sm text-gray-600">Raw API response (debug)</summary>
              <pre className="px-4 py-3 text-xs text-gray-600 overflow-auto max-h-60 bg-gray-50">
                {JSON.stringify(rawResponse, null, 2)}
              </pre>
            </details>
          )}
          {syncModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black opacity-40" onClick={() => setSyncModalOpen(false)} />
              <div className="relative bg-white rounded-lg shadow-lg w-11/12 max-w-3xl p-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-semibold">Sheet Sync Output</h3>
                  <button
                    onClick={() => setSyncModalOpen(false)}
                    className="text-gray-500 hover:text-gray-700 text-sm px-2 py-1"
                  >
                    Close
                  </button>
                </div>
                <pre className="whitespace-pre-wrap max-h-96 overflow-auto text-xs bg-gray-50 p-3 rounded">{syncModalContent}</pre>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TranscriptRequestPage;
