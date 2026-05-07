// src/pages/Migration.jsx
import React, { useMemo, useState, useEffect } from "react";
import { dmyToISO, toDateInput } from "../utils/date";
import PanelToggleButton from '../components/PanelToggleButton';
import PageTopbar from "../components/PageTopbar";
import SearchField from '../components/SearchField';
import useEnrollmentLookup from '../hooks/useEnrollmentLookup';
import MigrationReport from '../report/migration_report';
import { getMigrations } from '../services/migrationservice';

const ACTIONS = ["➕", "✏️ Edit", "🔍", "📄 Report"];
const LEGACY_MIGRATION_STATUSES = new Set(['RECEIVED']);
const MIGRATION_LIST_LIMIT = 200;
const MIGRATION_NUMBER_MODES = ['ERP', 'OLD'];

const isCancelledMigrationRecord = (record = {}) => {
  const cancelled = String(record.mg_cancelled || '').trim().toLowerCase();
  const status = String(record.mg_status || '').trim().toLowerCase();
  return cancelled === 'yes' || status === 'cancelled';
};

const pickMappedId = (value, primaryKey, fallbackKey = 'id') => {
  if (value && typeof value === 'object') {
    return value[primaryKey] ?? value[fallbackKey] ?? '';
  }
  return value ?? '';
};

const getTodayIso = () => new Date().toISOString().slice(0, 10);

const getMigrationNumberMode = (record = {}) => (
  String(record.book_no || '').trim() ? 'OLD' : 'ERP'
);

const createEmptyMigrationForm = (overrides = {}) => ({
  id: null,
  doc_rec: "",
  doc_rec_key: "",
  enrollment: "",
  student_name: "",
  institute: "",
  subcourse: "",
  maincourse: "",
  mg_number: "",
  mg_date: getTodayIso(),
  exam_year: "",
  admission_year: "",
  exam_details: "",
  mg_status: "Issued",
  mg_cancelled: "No",
  mg_remark: "",
  book_no: "",
  doc_remark: "",
  pay_rec_no: "",
  ...overrides,
});

const Migration = ({ onToggleSidebar, onToggleChatbox }) => {
  const [selectedTopbarMenu, setSelectedTopbarMenu] = useState("🔍");
  const [panelOpen, setPanelOpen] = useState(true);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [error, setError] = useState(null);
  const [currentRow, setCurrentRow] = useState(null);
  const [instCodeById, setInstCodeById] = useState({});
  const [migrationNumberMode, setMigrationNumberMode] = useState('ERP');
  const [form, setForm] = useState(() => createEmptyMigrationForm());

  const isMigrationCancelled = isCancelledMigrationRecord(form);
  const isEditMode = selectedTopbarMenu === '✏️ Edit' && Boolean(form.id);
  const panelTitle = selectedTopbarMenu === '🔍'
    ? 'Search Panel'
    : selectedTopbarMenu === '📄 Report'
      ? 'Report Panel'
      : isEditMode
        ? 'Edit Panel'
        : 'Add Panel';

  const instituteCodeValue = useMemo(() => {
    const key = String(form.institute || '').trim();
    return (key && instCodeById[key]) || key;
  }, [form.institute, instCodeById]);

  const authHeaders = () => {
    const token = localStorage.getItem("access_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadNextMigrationPreview = async (mode = migrationNumberMode) => {
    const params = new URLSearchParams({ mode });
    const res = await fetch(`/api/migration/next-number/?${params.toString()}`, { headers: { ...authHeaders() } });
    if (!res.ok) {
      throw new Error(`Failed to load next migration number: ${res.status}`);
    }
    return res.json();
  };

  const populateFormFromRecord = (record) => {
    if (!record) return;

    setMigrationNumberMode(getMigrationNumberMode(record));
    setForm(createEmptyMigrationForm({
      id: record.id,
      doc_rec: record.doc_rec || record.doc_rec_id || '',
      doc_rec_key: record.doc_rec || record.doc_rec_id || '',
      enrollment: record.enrollment || record.enrollment_no || '',
      student_name: record.student_name || '',
      institute: pickMappedId(record.institute, 'institute_id') || record.institute_id || '',
      subcourse: pickMappedId(record.subcourse, 'subcourse_id') || record.subcourse_id || '',
      maincourse: pickMappedId(record.maincourse, 'maincourse_id') || record.maincourse_id || '',
      mg_number: record.mg_number || '',
      mg_date: toDateInput(record.mg_date) || record.mg_date || getTodayIso(),
      exam_year: record.exam_year || '',
      admission_year: record.admission_year || '',
      exam_details: record.exam_details || '',
      mg_status: record.mg_status || 'Issued',
      mg_cancelled: record.mg_cancelled || 'No',
      mg_remark: record.mg_remark || '',
      book_no: record.book_no ? String(record.book_no).replace(/\.0$/, '') : '',
      pay_rec_no: record.pay_rec_no || '',
      doc_remark: record.doc_remark || record.doc_rec_remark || '',
    }));
  };

  const resetForm = async (mode = selectedTopbarMenu, numberMode = migrationNumberMode) => {
    if (mode === '✏️ Edit' && currentRow) {
      populateFormFromRecord(currentRow);
      return;
    }

    try {
      const preview = await loadNextMigrationPreview(numberMode);
      setForm(createEmptyMigrationForm({
        doc_rec: preview?.doc_rec || '',
        doc_rec_key: preview?.doc_rec || '',
        mg_number: preview?.mg_number || '',
        mg_date: preview?.mg_date || getTodayIso(),
      }));
    } catch (e) {
      console.error(e);
      setForm(createEmptyMigrationForm());
    }
  };

  const handleFormKeyDown = (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.target.tagName === 'BUTTON') {
      return;
    }

    const container = e.currentTarget;
    const fields = Array.from(
      container.querySelectorAll('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])')
    ).filter((node) => node.offsetParent !== null);

    const index = fields.indexOf(e.target);
    if (index === -1) {
      return;
    }

    e.preventDefault();
    const next = fields[index + 1];
    if (next) {
      next.focus();
      if (typeof next.select === 'function') {
        next.select();
      }
    }
  };

  const handleTopbarSelect = (action) => {
    setSelectedTopbarMenu(action);
    setPanelOpen(true);

    if (action === '➕') {
      setCurrentRow(null);
      setMigrationNumberMode('ERP');
      resetForm('➕', 'ERP');
      return;
    }

    if (action === '✏️ Edit' && currentRow) {
      populateFormFromRecord(currentRow);
    }
  };

  const loadList = async (queryValue = q) => {
    setLoading(true);
    setError(null);
    try {
      const trimmedQuery = (queryValue || '').trim();
      const data = await getMigrations({
        limit: MIGRATION_LIST_LIMIT,
        ...(trimmedQuery ? { search: trimmedQuery } : {}),
      });
      const rows = Array.isArray(data) ? data : data.results || [];
      setList(rows);
      return rows;
    } catch (e) {
      console.error(e);
      setError("Failed to load records. Please check the server logs.");
      setList([]);
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handle = setTimeout(() => {
      loadList(q);
    }, 300);

    return () => clearTimeout(handle);
  }, [q]);

  useEffect(() => {
    const loadInstituteCodes = async () => {
      try {
        let url = '/api/institutes/';
        const codeMap = {};
        let safety = 0;

        while (url && safety < 20) {
          const res = await fetch(url, { headers: { ...authHeaders() } });
          if (!res.ok) break;

          const data = await res.json();
          const rows = Array.isArray(data) ? data : data.results || [];

          rows.forEach((item) => {
            const key = item.institute_id ?? item.id;
            const code = item.institute_code;
            if (key != null && code) {
              codeMap[String(key)] = code;
            }
          });

          if (Array.isArray(data)) {
            url = null;
          } else {
            const next = data.next;
            if (next) {
              const nextUrl = new URL(next, window.location.origin);
              url = `${nextUrl.pathname}${nextUrl.search}`;
            } else {
              url = null;
            }
          }

          safety += 1;
        }

        setInstCodeById(codeMap);
      } catch (e) {
        console.error(e);
      }
    };

    loadInstituteCodes();
  }, []);

  useEffect(() => {
    try {
      const nav = window.__admindesk_initial_nav;
      if (nav && nav.nav === 'migration' && nav.docrec) {
        setForm((current) => ({ ...current, doc_rec: nav.docrec, doc_rec_key: nav.docrec }));
        delete window.__admindesk_initial_nav;
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEnrollmentLookup(form.enrollment, (item) => {
    if (isMigrationCancelled) {
      return;
    }
    if (item) {
      setForm((current) => ({
        ...current,
        enrollment: item.enrollment_no,
        student_name: item.student_name || '',
        institute: pickMappedId(item.institute, 'institute_id'),
        subcourse: pickMappedId(item.subcourse, 'subcourse_id'),
        maincourse: pickMappedId(item.maincourse, 'maincourse_id'),
      }));
    } else {
      setForm((current) => ({
        ...current,
        student_name: '',
        institute: '',
        subcourse: '',
        maincourse: '',
      }));
    }
  });

  useEffect(() => {
    if (!isMigrationCancelled) {
      return;
    }
    setForm((current) => {
      if (!current.enrollment && !current.student_name && current.mg_status === 'Cancelled') {
        return current;
      }
      return {
        ...current,
        mg_status: 'Cancelled',
        enrollment: '',
        student_name: '',
      };
    });
  }, [isMigrationCancelled]);

  useEffect(() => {
    if (isMigrationCancelled) {
      return;
    }
    setForm((current) => {
      if (current.mg_status && current.mg_status !== 'Cancelled') {
        return current;
      }
      return {
        ...current,
        mg_status: 'Issued',
      };
    });
  }, [isMigrationCancelled]);

  const setF = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const refreshMigrationNumberForMode = async (mode) => {
    try {
      const preview = await loadNextMigrationPreview(mode);
      setForm((current) => ({
        ...current,
        doc_rec: preview?.doc_rec || current.doc_rec,
        doc_rec_key: preview?.doc_rec || current.doc_rec_key,
        mg_number: preview?.mg_number || current.mg_number,
        mg_date: preview?.mg_date || current.mg_date || getTodayIso(),
      }));
    } catch (e) {
      console.error(e);
    }
  };

  const handleMigrationNumberModeChange = (mode) => {
    if (!MIGRATION_NUMBER_MODES.includes(mode) || mode === migrationNumberMode) {
      return;
    }
    setMigrationNumberMode(mode);
    if (mode === 'ERP') {
      setForm((current) => ({ ...current, book_no: '' }));
    }
    refreshMigrationNumberForMode(mode);
  };

  const save = async () => {
    const normalizedBookNo = String(form.book_no || '').trim();
    if (migrationNumberMode === 'OLD' && !normalizedBookNo) {
      alert('Book No is required for OLD MG series.');
      return;
    }

    const payload = {
      doc_rec_key: form.doc_rec || form.doc_rec_key || undefined,
      enrollment: isMigrationCancelled ? null : (form.enrollment || null),
      student_name: isMigrationCancelled ? '' : (form.student_name || null),
      institute: form.institute || null,
      subcourse: (form.subcourse && !isNaN(Number(form.subcourse)) && String(form.subcourse).trim() !== '') ? Number(form.subcourse) : null,
      maincourse: (form.maincourse && !isNaN(Number(form.maincourse)) && String(form.maincourse).trim() !== '') ? Number(form.maincourse) : null,
      mg_number: form.mg_number || null,
      mg_date: toDateInput(form.mg_date) || dmyToISO(form.mg_date) || null,
      exam_year: form.exam_year || null,
      admission_year: form.admission_year || null,
      exam_details: form.exam_details || null,
      mg_status: isMigrationCancelled ? 'Cancelled' : (form.mg_status || 'Issued'),
      mg_cancelled: form.mg_cancelled || 'No',
      mg_remark: form.mg_remark || null,
      book_no: migrationNumberMode === 'ERP' ? null : normalizedBookNo,
      pay_rec_no: form.pay_rec_no || null,
      doc_remark: form.doc_remark || null,
    };

    if (form.id) {
      const res = await fetch(`/api/migration/${form.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
    } else {
      const res = await fetch(`/api/migration/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
    }
  };

  return (
    <div className="p-2 md:p-3 space-y-4 h-full bg-slate-100">
      <PageTopbar
        title="Migration"
        actions={ACTIONS}
        selected={selectedTopbarMenu}
        onSelect={handleTopbarSelect}
        onToggleSidebar={onToggleSidebar}
        onToggleChatbox={onToggleChatbox}
        actionsOnLeft
      />

      <div className="action-panel-shell">
        <div className="action-panel-header">
          <div className="action-panel-title">{panelTitle}</div>
          <PanelToggleButton open={panelOpen} onClick={() => setPanelOpen((open) => !open)} />
        </div>

        {panelOpen && (selectedTopbarMenu === '➕' || selectedTopbarMenu === '✏️ Edit') && (
          <div className="action-panel-body space-y-2" data-migration-form="true" onKeyDownCapture={handleFormKeyDown}>
            <div className="flex items-end gap-3">
              <div>
                <label className="text-xs">MG Series</label>
                <div className="relative mt-1 grid w-[172px] grid-cols-2 rounded-xl border border-slate-300 bg-slate-100 p-1 text-sm font-semibold shadow-inner">
                  <span
                    className={`absolute inset-y-1 w-[78px] rounded-lg bg-indigo-600 shadow transition-transform duration-200 ${
                      migrationNumberMode === 'OLD' ? 'translate-x-[84px]' : 'translate-x-0'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                    &#8596;
                  </span>
                  {MIGRATION_NUMBER_MODES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`relative z-20 rounded-lg px-3 py-2 transition-colors ${
                        migrationNumberMode === mode ? 'text-white' : 'text-slate-700 hover:text-slate-950'
                      }`}
                      aria-pressed={migrationNumberMode === mode}
                      onClick={() => handleMigrationNumberModeChange(mode)}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div
              className="grid gap-2 items-end text-sm"
              style={{ gridTemplateColumns: '14ch 14ch 17ch 31ch minmax(8ch,1fr)' }}
            >
              <div>
                <label className="text-xs">Doc Rec</label>
                <input
                  className="w-full border rounded-lg p-2"
                  placeholder="mg26000001"
                  value={form.doc_rec}
                  onChange={(e) => setF('doc_rec', e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs">MG No</label>
                <input
                  className="w-full border rounded-lg p-2"
                  placeholder="2026/000001"
                  value={form.mg_number}
                  onChange={(e) => setF('mg_number', e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs">Date</label>
                <input
                  type="date"
                  className="w-full border rounded-lg p-2"
                  value={toDateInput(form.mg_date)}
                  onChange={(e) => setF('mg_date', e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs">Enrollment</label>
                <input
                  className="w-full border rounded-lg p-2 disabled:bg-gray-100"
                  disabled={isMigrationCancelled}
                  value={form.enrollment}
                  onChange={(e) => setF('enrollment', e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs">Student Name</label>
                <input
                  className="w-full border rounded-lg p-2 disabled:bg-gray-100"
                  disabled={isMigrationCancelled}
                  value={form.student_name}
                  onChange={(e) => setF('student_name', e.target.value)}
                />
              </div>
            </div>

            <div
              className="grid gap-2 items-end text-sm"
              style={{ gridTemplateColumns: '12ch 12ch minmax(20ch,1fr) 12ch 12ch 14ch' }}
            >
              <div>
                <label className="text-xs">Admission Year</label>
                <input className="w-full border rounded-lg p-2" value={form.admission_year} onChange={(e) => setF('admission_year', e.target.value)} />
              </div>
              <div>
                <label className="text-xs">Exam Year</label>
                <input className="w-full border rounded-lg p-2" value={form.exam_year} onChange={(e) => setF('exam_year', e.target.value)} />
              </div>
              <div>
                <label className="text-xs">Exam Details</label>
                <input className="w-full border rounded-lg p-2" value={form.exam_details} onChange={(e) => setF('exam_details', e.target.value)} />
              </div>
              <div>
                <label className="text-xs">Book No</label>
                <input
                  className="w-full border rounded-lg p-2 disabled:bg-gray-100"
                  value={migrationNumberMode === 'ERP' ? '' : form.book_no}
                  disabled={migrationNumberMode === 'ERP'}
                  required={migrationNumberMode === 'OLD'}
                  onChange={(e) => setF('book_no', e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs">Pay Rec</label>
                <input className="w-full border rounded-lg p-2" value={form.pay_rec_no} onChange={(e) => setF('pay_rec_no', e.target.value)} />
              </div>
              <div>
                <label className="text-xs">Status</label>
                <select className="w-full border rounded-lg p-2" value={form.mg_status} onChange={(e) => setF('mg_status', e.target.value)}>
                  <option value="Issued">Issued</option>
                  <option value="Pending">Pending</option>
                  <option value="NOT COLLECTED">Not Collected</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            <div
              className="grid gap-2 items-end text-sm"
              style={{ gridTemplateColumns: '12ch 10ch 10ch 10ch minmax(16ch,1fr) minmax(18ch,1fr) auto auto' }}
            >
              <div>
                <label className="text-xs">Cancelled</label>
                <select className="w-full border rounded-lg p-2" value={form.mg_cancelled} onChange={(e) => setF('mg_cancelled', e.target.value)}>
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>
              <div>
                <label className="text-xs">Main</label>
                <input className="w-full border rounded-lg p-2" value={form.maincourse} onChange={(e) => setF('maincourse', e.target.value)} />
              </div>
              <div>
                <label className="text-xs">Sub</label>
                <input className="w-full border rounded-lg p-2" value={form.subcourse} onChange={(e) => setF('subcourse', e.target.value)} />
              </div>
              <div>
                <label className="text-xs">Inst</label>
                <input className="w-full border rounded-lg p-2 bg-slate-50" value={instituteCodeValue} readOnly />
              </div>
              <div>
                <label className="text-xs">MG Remark</label>
                <input className="w-full border rounded-lg p-2" value={form.mg_remark} onChange={(e) => setF('mg_remark', e.target.value)} />
              </div>
              <div>
                <label className="text-xs">Doc Remark</label>
                <input className="w-full border rounded-lg p-2" value={form.doc_remark} onChange={(e) => setF('doc_remark', e.target.value)} />
              </div>
              <div className="self-end pb-[1px]">
                <button type="button" className="reset-button" onClick={() => resetForm()}>
                  {isEditMode ? 'Refresh' : 'Clear'}
                </button>
              </div>
              <div className="self-end pb-[1px]">
                <button
                  type="button"
                  className={isEditMode ? 'edit-button' : 'save-button'}
                  onClick={async () => {
                    try {
                      await save();
                      const refreshedRows = await loadList(q);
                      alert(isEditMode ? 'Updated' : 'Added');

                      if (isEditMode) {
                        const refreshedCurrent = refreshedRows.find((row) => row.id === currentRow?.id);
                        if (refreshedCurrent) {
                          setCurrentRow(refreshedCurrent);
                          populateFormFromRecord(refreshedCurrent);
                        }
                      } else {
                        setCurrentRow(null);
                        setMigrationNumberMode('ERP');
                        await resetForm('➕', 'ERP');
                      }
                    } catch (e) {
                      alert(e.message || 'Failed');
                    }
                  }}
                >
                  {isEditMode ? 'Update' : 'Add'}
                </button>
              </div>
            </div>

            {(isMigrationCancelled || LEGACY_MIGRATION_STATUSES.has(form.mg_status)) && (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {isMigrationCancelled && (
                  <div className="text-sm text-amber-700">Cancelled migration skips enrollment and student name.</div>
                )}
                {LEGACY_MIGRATION_STATUSES.has(form.mg_status) && (
                  <div className="text-xs text-slate-500">Legacy status retained for compatibility with existing records.</div>
                )}
              </div>
            )}
          </div>
        )}

        {panelOpen && selectedTopbarMenu === '🔍' && (
          <div className="action-panel-body space-y-2">
            <SearchField
              className="w-full"
              placeholder="Search by MG No / Enrollment / Name"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <p className="text-xs text-slate-500">
              Showing first {MIGRATION_LIST_LIMIT} records by MG date and MG number. Search finds matching records beyond the first page.
            </p>
          </div>
        )}

        {panelOpen && selectedTopbarMenu === '📄 Report' && (
          <div className="action-panel-body">
            <MigrationReport />
          </div>
        )}
      </div>

      {selectedTopbarMenu !== '📄 Report' && (
      <div className="bg-white shadow rounded-2xl p-4 h-[calc(100vh-260px)] overflow-auto">
        {error && (
          <div className="mb-4 p-3 text-sm text-red-700 bg-red-100 border border-red-200 rounded-lg">{error}</div>
        )}
        <div className="overflow-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-2 px-3 whitespace-nowrap w-[11ch]">Date</th>
                <th className="text-left py-2 px-3 whitespace-nowrap">MG No</th>
                <th className="text-left py-2 px-3">Enroll</th>
                <th className="text-left py-2 px-3">Name</th>
                <th className="text-left py-2 px-3">Book No</th>
                <th className="text-left py-2 px-3 whitespace-nowrap">Inst Code</th>
                <th className="text-left py-2 px-3">Status</th>
                <th className="text-left py-2 px-3">Pay Rec</th>
                <th className="text-left py-2 px-3">MG Remark</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && !loading && (
                <tr><td colSpan={9} className="py-6 text-center text-gray-500">No records</td></tr>
              )}
              {[...list].sort((a, b) => {
                const dateA = toDateInput(a.mg_date) || '';
                const dateB = toDateInput(b.mg_date) || '';
                if (dateA !== dateB) return dateB.localeCompare(dateA);
                const numA = a.mg_number || '';
                const numB = b.mg_number || '';
                return numB.localeCompare(numA);
              }).map((row) => (
                <tr
                  key={row.id}
                  className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() => {
                    setCurrentRow(row);
                    setSelectedTopbarMenu('✏️ Edit');
                    setPanelOpen(true);
                    populateFormFromRecord(row);
                  }}
                >
                  <td className="py-2 px-3 whitespace-nowrap w-[11ch]">{row.mg_date || '-'}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{row.mg_number || '-'}</td>
                  <td className="py-2 px-3">{row.enrollment || row.enrollment_no || '-'}</td>
                  <td className="py-2 px-3">{row.student_name || '-'}</td>
                  <td className="py-2 px-3">{row.book_no ? String(row.book_no).replace(/\.0$/, '') : '-'}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{row.institute_code || instCodeById[String(row.institute_id || row.institute || '')] || '-'}</td>
                  <td className="py-2 px-3">{row.mg_status || '-'}</td>
                  <td className="py-2 px-3">{row.pay_rec_no || '-'}</td>
                  <td className="py-2 px-3">{row.mg_remark || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
};

export default Migration;
