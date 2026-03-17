import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { FaSave } from 'react-icons/fa';
import PanelToggleButton from '../components/PanelToggleButton';
import PageTopbar from '../components/PageTopbar';
import SearchField from '../components/SearchField';
import {
  fetchMailRequests,
  updateMailRequest,
  refreshMailRequest,
  bulkRefreshMailRequests,
  syncMailRequestsFromSheet,
  isMailRequestMaybeCompletedError,
} from '../services/mailRequestService';

const ACTIONS = ['🔍 Filter', '🧰 Tools', '📝 Edit'];

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'progress', label: 'In Progress' },
  { value: 'done', label: 'Sent' },
  { value: 'cancel', label: 'Cancel' },
];

const RIGHTS_FALLBACK = { can_view: false, can_create: false, can_edit: false, can_delete: false };
const RIGHTS_DEFAULT = { can_view: true, can_create: false, can_edit: true, can_delete: false };
const AUTO_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeComparableValue = (value) => (value ?? '').toString().trim();

const rowMatchesPayload = (row, payload = {}) =>
  Object.entries(payload).every(([key, value]) => normalizeComparableValue(row?.[key]) === normalizeComparableValue(value));

const MailRequestPage = ({ onToggleSidebar, onToggleChatbox }) => {
  const [statusFilter, setStatusFilter] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedAction, setSelectedAction] = useState(ACTIONS[0]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [rows, setRows] = useState([]);
  const [rawResponse, setRawResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [safeRefresh, setSafeRefresh] = useState(true);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncModalContent, setSyncModalContent] = useState('');
  const [sheetSyncing, setSheetSyncing] = useState(false);
  const [flash, setFlash] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [updatingId, setUpdatingId] = useState(null);
  const [bulkRefreshing, setBulkRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [rights, setRights] = useState(RIGHTS_FALLBACK);
  const [rightsLoaded, setRightsLoaded] = useState(false);
  const [activeRow, setActiveRow] = useState(null);
  const [editForm, setEditForm] = useState({ mail_status: 'pending', remark: '' });
  const activeRowRef = useRef(null);
  const autoRefreshInFlightRef = useRef(false);
  const initialAutoRefreshDoneRef = useRef(false);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
    return () => clearTimeout(handle);
  }, [searchTerm]);

  useEffect(() => {
    activeRowRef.current = activeRow;
  }, [activeRow]);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setRights(RIGHTS_FALLBACK);
      setRightsLoaded(true);
      return;
    }
    const loadRights = async () => {
      try {
        const { data } = await axios.get(`/api/my-navigation/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const modules = data?.modules || [];
        const targetKeywords = ['official mail status', 'mail request', 'mail requests'];
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

  const loadRows = useCallback(async ({ silent = false } = {}) => {
    if (!rights.can_view) return [];
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const { rows: dataRows, raw } = await fetchMailRequests({
        status: statusFilter || undefined,
        search: debouncedSearch || undefined,
      });
      setRows(dataRows);
      setRawResponse(raw);
      setLastLoadedAt(new Date());
      const currentActive = activeRowRef.current;
      if (currentActive) {
        const match = dataRows.find((row) => row.id === currentActive.id);
        if (match) {
          setActiveRow(match);
          setEditForm({
            mail_status: match.mail_status || 'pending',
            remark: match.remark || '',
          });
        } else {
          setActiveRow(null);
        }
      }
      setDrafts((prevDrafts) => {
        const nextDrafts = { ...prevDrafts };
        const ids = new Set(dataRows.map((row) => row.id));
        Object.keys(nextDrafts).forEach((id) => {
          if (!ids.has(Number(id)) && !ids.has(id)) {
            delete nextDrafts[id];
          }
        });
        return nextDrafts;
      });
      return dataRows;
    } catch (err) {
      const message = err.message || 'Failed to load mail requests.';
      if (!silent) {
        setError(message);
        setRows([]);
      }
      return null;
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [rights.can_view, statusFilter, debouncedSearch]);

  const reloadRowsWithRetry = useCallback(
    async ({ attempts = 3, delayMs = 1500 } = {}) => {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (attempt > 0) {
          await wait(delayMs);
        }
        const latestRows = await loadRows({ silent: true });
        if (Array.isArray(latestRows)) {
          return latestRows;
        }
      }
      return null;
    },
    [loadRows]
  );

  const recoverUpdatedRow = useCallback(
    async (rowId, payload) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (attempt > 0) {
          await wait(1500);
        }
        const latestRows = await loadRows({ silent: true });
        const latestRow = Array.isArray(latestRows) ? latestRows.find((candidate) => candidate.id === rowId) : null;
        if (latestRow && rowMatchesPayload(latestRow, payload)) {
          return latestRow;
        }
      }
      return null;
    },
    [loadRows]
  );

  useEffect(() => {
    if (!rightsLoaded || !rights.can_view) {
      if (rightsLoaded && !rights.can_view) {
        setRows([]);
      }
      return;
    }
    loadRows();
  }, [loadRows, rightsLoaded, rights.can_view]);

  const runSheetSyncRefresh = useCallback(
    async ({ silent = false, showModal = true } = {}) => {
      if (!rights.can_view || autoRefreshInFlightRef.current) return;
      autoRefreshInFlightRef.current = true;
      setSheetSyncing(true);

      if (!silent) {
        setLoading(true);
        setError('');
        setFlashMessage('info', 'Syncing from Google Sheet...');
      }

      try {
        const result = await syncMailRequestsFromSheet({ noPrune: safeRefresh });
        if (showModal && result && result.output) {
          const lines = String(result.output).split('\n').filter(Boolean);
          const snippet = lines.slice(0, 3).join(' | ');
          setFlashMessage('info', `Sync output: ${snippet}`);
          setSyncModalContent(result.output);
          setSyncModalOpen(true);
          // eslint-disable-next-line no-console
          console.info('Sheet sync output:\n', result.output);
        }

        await loadRows({ silent: true });
        setError('');

        if (!silent) {
          setFlashMessage('success', 'Sheet sync completed. List reloaded.');
        }
      } catch (err) {
        const msg = err.message || 'Failed to sync from sheet.';
        if (isMailRequestMaybeCompletedError(err)) {
          const latestRows = await reloadRowsWithRetry({ attempts: 2, delayMs: 2000 });
          if (latestRows) {
            setError('');
            const recoveryMessage = 'The sheet sync response was delayed. Reloaded the latest available data.';
            setFlashMessage('info', recoveryMessage);
            if (showModal) {
              setSyncModalContent(`${msg}\n\n${recoveryMessage}`);
              setSyncModalOpen(true);
            }
          } else {
            setError(msg);
            setFlashMessage('error', msg);
            if (showModal) {
              setSyncModalContent(msg);
              setSyncModalOpen(true);
            }
          }
        } else {
          setError(msg);
          setFlashMessage('error', msg);
          if (showModal) {
            setSyncModalContent(msg);
            setSyncModalOpen(true);
          }
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
        setSheetSyncing(false);
        autoRefreshInFlightRef.current = false;
      }
    },
    [rights.can_view, safeRefresh, loadRows, reloadRowsWithRetry, setFlashMessage]
  );

  useEffect(() => {
    if (!rightsLoaded || !rights.can_view || initialAutoRefreshDoneRef.current) {
      return;
    }
    initialAutoRefreshDoneRef.current = true;
    runSheetSyncRefresh({ silent: true, showModal: false });
  }, [rightsLoaded, rights.can_view, runSheetSyncRefresh]);

  useEffect(() => {
    if (!rightsLoaded || !rights.can_view) {
      return undefined;
    }
    const intervalId = setInterval(() => {
      runSheetSyncRefresh({ silent: true, showModal: false });
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [rightsLoaded, rights.can_view, runSheetSyncRefresh]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  const toggleSelectAll = () => {
    if (!rows.length) return;
    const selectableIds = rows.map((row) => row.id);
    const allSelected = selectableIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !selectableIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...selectableIds])));
    }
  };

  const handleRowSelect = (row) => {
    setActiveRow(row);
    setEditForm({
      mail_status: row.mail_status || 'pending',
      remark: row.remark || '',
    });
    activeRowRef.current = row;
    setSelectedAction(ACTIONS[2]);
    setPanelOpen(true);
  };

  const handleDraftChange = (id, field, value) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [field]: value,
      },
    }));
  };

  const applyUpdate = async (rowId, overrideDraft = null) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    const draftSource = overrideDraft !== null ? overrideDraft : drafts[rowId] || {};
    const payload = {};
    const nextStatus = draftSource.mail_status ?? row.mail_status;
    const nextRemark = draftSource.remark ?? row.remark;
    if (nextStatus !== row.mail_status) payload.mail_status = nextStatus;
    if ((nextRemark || '') !== (row.remark || '')) payload.remark = nextRemark || '';
    if (Object.keys(payload).length === 0) {
      setFlashMessage('info', 'No changes to save.');
      return;
    }

    setUpdatingId(rowId);
    try {
      const updated = await updateMailRequest(rowId, payload);
      setRows((prev) => prev.map((item) => (item.id === rowId ? updated : item)));
      setDrafts((prev) => {
        const copy = { ...prev };
        delete copy[rowId];
        return copy;
      });
      if (activeRowRef.current && activeRowRef.current.id === rowId) {
        setActiveRow(updated);
        setEditForm({
          mail_status: updated.mail_status || 'pending',
          remark: updated.remark || '',
        });
        activeRowRef.current = updated;
      }

      let autoRefreshed = false;
      try {
        const refreshed = await refreshMailRequest(rowId);
        autoRefreshed = true;
        setRows((prev) => prev.map((item) => (item.id === rowId ? refreshed : item)));
        if (activeRowRef.current && activeRowRef.current.id === rowId) {
          setActiveRow(refreshed);
          setEditForm({
            mail_status: refreshed.mail_status || 'pending',
            remark: refreshed.remark || '',
          });
          activeRowRef.current = refreshed;
        }
      } catch {
        autoRefreshed = false;
      }

      await loadRows({ silent: true });
      setFlashMessage('success', autoRefreshed ? 'Mail request saved and refreshed.' : 'Mail request saved.');
    } catch (err) {
      if (isMailRequestMaybeCompletedError(err)) {
        setFlashMessage('info', 'Save response was delayed. Checking latest data...');
        const recoveredRow = await recoverUpdatedRow(rowId, payload);
        if (recoveredRow) {
          setDrafts((prev) => {
            const copy = { ...prev };
            delete copy[rowId];
            return copy;
          });
          setFlashMessage('success', 'Mail request updated after delayed server response.');
          return;
        }
      }
      setFlashMessage('error', err.message || 'Failed to update mail request.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleBulkRefresh = async () => {
    if (!selectedIds.length) {
      setFlashMessage('info', 'Select at least one submission.');
      return;
    }
    setBulkRefreshing(true);
    try {
      await bulkRefreshMailRequests(selectedIds);
      await loadRows();
      setFlashMessage('success', 'Verification refreshed for selected submissions.');
    } catch (err) {
      setFlashMessage('error', err.message || 'Bulk refresh failed.');
    } finally {
      setBulkRefreshing(false);
      setSelectedIds([]);
    }
  };

  const handleReload = () => loadRows();

  // Sync from Google Sheet then reload rows
  const handleSyncAndReload = useCallback(() => {
    runSheetSyncRefresh({ silent: false, showModal: true });
  }, [runSheetSyncRefresh]);

  const statusCounts = useMemo(() => {
    const counts = { pending: 0, progress: 0, done: 0, cancel: 0 };
    rows.forEach((row) => {
      const key = (row.mail_status || '').toLowerCase() || 'pending';
      if (counts[key] !== undefined) counts[key] += 1;
    });
    return counts;
  }, [rows]);

  // sort rows for display: prefer status priority (pending first), then numeric `mail_req_no` (higher = newer),
  // fall back to submitted_at desc.
  const sortedRows = useMemo(() => {
    const copy = Array.isArray(rows) ? [...rows] : [];
    const statusOrder = { pending: 0, progress: 1, done: 2, cancel: 3 };
    copy.sort((a, b) => {
      const aStatus = (a?.mail_status || '').toLowerCase() || 'pending';
      const bStatus = (b?.mail_status || '').toLowerCase() || 'pending';
      const sa = statusOrder[aStatus] ?? 99;
      const sb = statusOrder[bStatus] ?? 99;
      if (sa !== sb) return sa - sb;

      const aNo = a?.mail_req_no ?? NaN;
      const bNo = b?.mail_req_no ?? NaN;
      const aNoN = Number.isFinite(Number(aNo)) ? Number(aNo) : NaN;
      const bNoN = Number.isFinite(Number(bNo)) ? Number(bNo) : NaN;
      if (Number.isFinite(aNoN) || Number.isFinite(bNoN)) {
        if (!Number.isFinite(aNoN)) return 1;
        if (!Number.isFinite(bNoN)) return -1;
        return bNoN - aNoN; // higher numbers first
      }

      const da = a?.submitted_at ? new Date(a.submitted_at).getTime() : 0;
      const db = b?.submitted_at ? new Date(b.submitted_at).getTime() : 0;
      return db - da;
    });
    return copy;
  }, [rows]);

  const formatDate = (value) => {
    if (!value) return 'N/A';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) {
      // If incoming string has time (e.g., "25-01-2026 09:09:50"), return the date part only
      const parts = String(value).split(/\s+/);
      return parts[0] || value;
    }
    return dt.toLocaleDateString('en-GB'); // dd/mm/yyyy
  };

  return (
    <div className="p-4 md:p-6 space-y-4 h-full">
      <PageTopbar
        title="Official Mail Status"
        leftSlot={<div className="h-10 w-10 flex items-center justify-center rounded-xl bg-indigo-600 text-white text-xl">📧</div>}
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
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={safeRefresh}
                  onChange={(e) => setSafeRefresh(e.target.checked)}
                  className="form-checkbox h-4 w-4 text-indigo-600"
                  title="When checked, the import will skip pruning DB rows (safe refresh)."
                />
                <span className="text-xs text-gray-700">Safe refresh</span>
              </label>
              <button
                onClick={handleSyncAndReload}
                className="refresh-icon-button"
                disabled={loading || sheetSyncing}
                title={sheetSyncing ? 'Refreshing' : 'Refresh'}
                aria-label={sheetSyncing ? 'Refreshing' : 'Refresh'}
              >
                <span className={`refresh-symbol ${sheetSyncing ? 'animate-spin' : ''}`} aria-hidden="true">↻</span>
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
          <div className="action-panel-shell">
            <div className="action-panel-header">
              <div className="action-panel-title">{selectedAction}</div>
              <PanelToggleButton open={panelOpen} onClick={() => setPanelOpen((open) => !open)} />
            </div>

            {panelOpen && selectedAction === ACTIONS[0] && (
              <div className="action-panel-body grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Search</label>
                  <SearchField
                    className="w-full"
                    placeholder="Enrollment number, student name, or email"
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
                <div className="md:col-span-3 flex flex-wrap gap-3 text-sm text-gray-600">
                  <span>Pending: {statusCounts.pending}</span>
                  <span>In Progress: {statusCounts.progress}</span>
                  <span>Sent: {statusCounts.done}</span>
                  <span>Cancel: {statusCounts.cancel}</span>
                  <span className="text-xs text-gray-500">Selected rows: {selectedIds.length}</span>
                </div>
              </div>
            )}

            {panelOpen && selectedAction === ACTIONS[1] && (
              <div className="action-panel-body space-y-3 text-sm text-gray-700">
                <p>
                  Use bulk tools to refresh multiple submissions at once. Select the rows from the records table below
                  and run a bulk refresh to re-check enrollment and student name verification.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleBulkRefresh}
                    className="refresh-icon-button"
                    disabled={!rights.can_edit || !selectedIds.length || loading || bulkRefreshing}
                    title={bulkRefreshing ? 'Refreshing selected records' : 'Bulk Refresh'}
                    aria-label={bulkRefreshing ? 'Refreshing selected records' : 'Bulk Refresh'}
                  >
                    <span className={`refresh-symbol ${bulkRefreshing ? 'animate-spin' : ''}`} aria-hidden="true">↻</span>
                  </button>
                  <span className="text-xs text-gray-500">Currently selected: {selectedIds.length} submission(s).</span>
                </div>
                <ul className="list-disc pl-5 text-xs text-gray-500 space-y-1">
                  <li>Select rows using the checkboxes in the records table.</li>
                  <li>Bulk refresh re-runs the verification logic for each selected submission.</li>
                  <li>Status or remark edits still require saving row by row.</li>
                </ul>
              </div>
            )}

            {panelOpen && selectedAction === ACTIONS[2] && (
              <div className="action-panel-body space-y-4 text-sm text-gray-700">
                {activeRow ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Submitted At</label>
                      <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
                        {formatDate(activeRow.submitted_at)}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Enrollment No</label>
                      <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
                        {activeRow.enrollment_no || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Student Name</label>
                      <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
                        {activeRow.student_name || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Official Mail</label>
                      <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 break-all">
                        {activeRow.rec_official_mail || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Institute</label>
                      <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
                        {activeRow.rec_institute_name || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Document Type</label>
                      <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
                        {activeRow.send_doc_type || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Status</label>
                      <select
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={editForm.mail_status}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, mail_status: e.target.value }))}
                        disabled={!rights.can_edit}
                      >
                        {STATUS_OPTIONS.filter((opt) => opt.value).map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">Remark</label>
                      <textarea
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[3.5rem]"
                        value={editForm.remark}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, remark: e.target.value }))}
                        disabled={!rights.can_edit}
                      />
                    </div>
                    <div className="md:col-span-2 flex justify-end">
                      <button
                        onClick={() => activeRow && applyUpdate(activeRow.id, editForm)}
                        className="save-button"
                        disabled={!rights.can_edit || updatingId === activeRow.id}
                      >
                        {updatingId === activeRow?.id ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-600">Select a record from the table to view details and edit.</div>
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

          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 px-4 py-3 bg-gray-50 border-b">
              <div className="font-semibold text-gray-800">Mail Request Records</div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span>Selected: {selectedIds.length}</span>
                <button
                  onClick={handleBulkRefresh}
                  className="refresh-icon-button"
                  disabled={!rights.can_edit || !selectedIds.length || loading || bulkRefreshing}
                  title={bulkRefreshing ? 'Refreshing selected records' : 'Bulk Refresh'}
                  aria-label={bulkRefreshing ? 'Refreshing selected records' : 'Bulk Refresh'}
                >
                  <span className={`refresh-symbol ${bulkRefreshing ? 'animate-spin' : ''}`} aria-hidden="true">↻</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-white">
                  <tr className="bg-gray-100 text-gray-700 uppercase text-xs">
                    <th className="px-3 py-2 text-left">
                      <input
                        type="checkbox"
                        onChange={toggleSelectAll}
                        checked={rows.length > 0 && rows.every((row) => selectedIds.includes(row.id))}
                        aria-label="Select all"
                      />
                    </th>
                    <th className="px-3 py-2 text-left">REQ NO</th>
                    <th className="px-3 py-2 text-left">ENROLLMENT</th>
                    <th className="px-3 py-2 text-left">STUDENT</th>
                    <th className="px-3 py-2 text-left">INSTITUTE</th>
                    <th className="px-3 py-2 text-left">OFFICIAL EMAIL</th>
                    <th className="px-3 py-2 text-left">REF ID</th>
                    <th className="px-3 py-2 text-left">DOC TYPE</th>
                    <th className="px-3 py-2 text-left">STATUS</th>
                    <th className="px-3 py-2 text-left">REMARK</th>
                    <th className="px-3 py-2 text-left">SUBMITTED</th>
                    <th className="px-3 py-2 text-left">FORM EMAIL</th>
                    <th className="px-3 py-2 text-left">VERIFICATION</th>
                    <th className="px-3 py-2 text-left">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={14} className="px-4 py-8 text-center text-gray-500">
                        Loading mail requests...
                      </td>
                    </tr>
                  )}

                  {!loading && error && (
                    <tr>
                      <td colSpan={14} className="px-4 py-6 text-center text-red-600">
                        {error}
                      </td>
                    </tr>
                  )}

                  {!loading && !error && rows.length === 0 && (
                    <tr>
                      <td colSpan={14} className="px-4 py-6 text-center text-gray-500">
                        No submissions found.
                      </td>
                    </tr>
                  )}

                  {!loading && !error && sortedRows.map((row) => {
                    const draft = drafts[row.id] || {};
                    const mailStatus = draft.mail_status ?? row.mail_status ?? '';
                    const remark = draft.remark ?? row.remark ?? '';
                    const disabled = updatingId === row.id;
                    const selected = selectedIds.includes(row.id);

                    return (
                      <tr
                        key={row.id}
                        className={`border-t border-gray-100 align-top cursor-pointer ${activeRow?.id === row.id ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                        onClick={() => handleRowSelect(row)}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleSelect(row.id)}
                            disabled={disabled}
                            aria-label={`Select submission ${row.id}`}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td className="px-3 py-2 text-gray-800">{row.mail_req_no ?? 'N/A'}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-900">{row.enrollment_no || 'N/A'}</div>
                        </td>
                        <td className="px-3 py-2 text-gray-800">{row.student_name || 'N/A'}</td>
                        <td className="px-3 py-2 text-gray-800">{row.rec_institute_name || 'N/A'}</td>
                        <td className="px-3 py-2 break-all text-gray-700">{row.rec_official_mail || 'N/A'}</td>
                        <td className="px-3 py-2 text-gray-800">{row.rec_ref_id || 'N/A'}</td>
                        <td className="px-3 py-2 text-gray-800">{row.send_doc_type || 'N/A'}</td>
                        <td className="px-3 py-2">
                          <select
                            className="border border-gray-300 rounded px-2 py-1 text-sm"
                            value={mailStatus}
                            onChange={(e) => handleDraftChange(row.id, 'mail_status', e.target.value)}
                            disabled={!rights.can_edit || disabled}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {STATUS_OPTIONS.filter((opt) => opt.value).map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <textarea
                            rows={2}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm min-h-[2.25rem]"
                            value={remark}
                            onChange={(e) => handleDraftChange(row.id, 'remark', e.target.value)}
                            disabled={!rights.can_edit || disabled}
                            placeholder="Add remark"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{formatDate(row.submitted_at)}</td>
                        <td className="px-3 py-2 break-all text-gray-700">{row.form_submit_mail || 'N/A'}</td>
                        <td className="px-3 py-2 text-sm text-gray-600 align-middle">
                          {row.student_verification || 'N/A'}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <div className="flex flex-col gap-2 items-end justify-center h-full">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                applyUpdate(row.id);
                              }}
                              className="save-icon-button"
                              disabled={!rights.can_edit || disabled}
                              title={disabled ? 'Saving' : 'Save and auto-refresh'}
                              aria-label={disabled ? 'Saving' : 'Save and auto-refresh'}
                            >
                              {updatingId === row.id ? (
                                <span className="save-symbol animate-pulse" aria-hidden="true">⏳</span>
                              ) : (
                                <FaSave className="save-symbol" size={14} aria-hidden="true" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500 flex items-center justify-between">
              <div>
                Showing {sortedRows.length} submissions
                {rawResponse?.count ? ` of ${rawResponse.count}` : ''}.
              </div>
              <div>
                Last updated:{' '}
                {lastLoadedAt
                  ? lastLoadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : 'Not loaded yet'}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MailRequestPage;
