import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/AuthContext';

const INSTITUTION_NAME = 'Kadi Sarva Vishwavidyalaya';
// Serve logo from Django MEDIA - adjust path if your MEDIA_URL differs.
// When the frontend runs on a different origin (Vite dev server) we must request the
// media from the backend host. Use VITE_BACKEND_URL to override in development.
// Default to the local Django dev server used in this project.
const BACKEND_URL = (import.meta && import.meta.env && import.meta.env.VITE_BACKEND_URL) || 'http://127.0.0.1:8000';
const LOGO_PATH = '/media/logo/ksv.png';
const LOGO_URL = `${BACKEND_URL}${LOGO_PATH}`;

const MODULES = [
  {
    key: 'verification',
    label: '📜 Verification',
    openMenuLabel: 'Verification',
    endpoint: '/api/admin/verifications',
    statuses: ['pending', 'done', 'cancel'],
    fields: (row) => `${row.student_name || '-'} - ${row.verification_no || '—'} - ${row.status || row.verification_status || ''}`,
  },
  {
    key: 'migration',
    label: '🚀 Migration',
    openMenuLabel: 'Migration',
    endpoint: '/api/admin/migrations',
    statuses: ['pending', 'done', 'cancel', 'correction'],
    fields: (row) => `${row.student_name || '-'} - ${row.migration_no || '—'} - ${row.status || ''}`,
  },
  {
    key: 'provisional',
    label: '📄 Provisional',
    openMenuLabel: 'Provisional',
    endpoint: '/api/admin/provisionals',
    statuses: ['pending', 'done', 'cancel', 'correction'],
    fields: (row) => `${row.student_name || '-'} - ${row.provisional_no || '—'} - ${row.status || ''}`,
  },
  {
    key: 'institutional',
    label: '🏛️ Institutional Verification',
    openMenuLabel: 'Inst-Verification',
    endpoint: '/api/admin/institutionals',
    statuses: ['pending', 'done', 'cancel', 'correction', 'fake'],
    fields: (row) => `${row.student_name || '-'} - ${row.enrollment_no || '—'} - ${row.verification_status || row.status || ''}`,
  },
  {
    key: 'mailrequests',
    label: '📧 Mail Requests',
    openMenuLabel: 'Official Mail Status',
    endpoint: '/api/mail-requests/',
    statuses: ['pending', 'progress', 'done'],
    fields: (row) => `${row.rec_institute_name || '-'} - ${row.enrollment_no || '—'} - ${(row.mail_status || '').toUpperCase()}`,
  },
];

function ModuleCard({ mod, authFetch, onOpen }) {
  const [statusFilter, setStatusFilter] = useState(mod.statuses[0]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      params.set('limit', '5');
      const url = `${mod.endpoint}?${params.toString()}`;
      const res = await authFetch(url);
      if (!res.ok) throw new Error('Load failed');
      const data = await res.json();
      const arr = data.items || data.rows || data || [];
      setItems(Array.isArray(arr) ? arr.slice(0, 5) : []);
    } catch (e) {
      setError('Could not load');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">{mod.label}</h3>
        <div className="flex items-center gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border rounded px-2 py-1 text-sm">
            {mod.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={onOpen} className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm">Open</button>
        </div>
      </div>
      <div className="text-sm text-gray-600 mb-2">Recent ({statusFilter})</div>
      {loading ? <div className="text-gray-500 text-sm">Loading…</div> : error ? <div className="text-red-500 text-sm">{error}</div> : (
        <ul className="space-y-2">
          {items.map((row) => (
            <li key={row.id || row.pk || JSON.stringify(row)} className="flex items-center justify-between border rounded px-2 py-1">
              <span className="truncate mr-2">{mod.fields(row)}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-gray-100 border capitalize">{(row.status || row.verification_status || row.mail_status || '').toString()}</span>
            </li>
          ))}
          {!items.length && <li className="text-gray-500 text-sm">No items</li>}
        </ul>
      )}
    </div>
  );
}

function ModuleSelector({ selected, setSelected }) {
  const toggle = (key) => {
    setSelected((prev) => {
      const exists = prev.includes(key);
      if (exists) return prev.filter((k) => k !== key);
      if (prev.length >= 5) return prev; // cap selections to avoid overcrowding
      return [...prev, key];
    });
  };
  return (
    <div className="flex flex-wrap gap-2">
      {MODULES.map((m) => {
        const isOn = selected.includes(m.key);
        return (
          <button key={m.key} onClick={() => toggle(m.key)} className={`px-3 py-1 rounded-full border ${isOn ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'} text-sm`}>
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

export default function CustomDashboardClean({ selectedMenuItem, setSelectedMenuItem, isSidebarOpen, setSidebarOpen }) {
  const { user } = useAuth();
  const [selectedModuleKeys, setSelectedModuleKeys] = useState(['verification', 'migration', 'provisional', 'institutional', 'mailrequests']);

  // simple authFetch using fetch + bearer token
  const authFetch = async (url, opts = {}) => {
    const token = localStorage.getItem('access_token');
    const headers = Object.assign({}, opts.headers || {}, { Authorization: token ? `Bearer ${token}` : '' });
    return fetch(url, Object.assign({}, opts, { headers }));
  };

  const handleOpenModule = (openMenuLabel) => setSelectedMenuItem(openMenuLabel);

  // Render only the dashboard content — parent `Dashboard` provides the Sidebar/Topbar/Chatbox layout.
  return (
    <div className="flex flex-col bg-white" style={{ paddingRight: 'var(--chat-rail-width, calc(4rem + 10px))' }}>
      <div className="h-[10px] bg-white" />
      <div className="p-4 overflow-auto">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white mb-6">
          <div className="px-6 py-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-white/20 overflow-hidden flex items-center justify-center">
                <img src={LOGO_URL} alt="logo" className="w-full h-full object-cover" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-wide">{INSTITUTION_NAME}</h1>
                <p className="text-white/80 text-sm">Welcome back{user?.first_name ? `, ${user.first_name}` : ''}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-white/80">Current User</div>
              <div className="text-lg font-semibold">{user?.first_name || user?.username || 'Guest'}</div>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-gray-800">Quick Status</h2>
            <div className="text-sm text-gray-500">Select up to 5 modules</div>
          </div>
          <ModuleSelector selected={selectedModuleKeys} setSelected={setSelectedModuleKeys} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 pb-2">
          {MODULES.filter((m) => selectedModuleKeys.includes(m.key)).map((mod) => (
            <ModuleCard key={mod.key} mod={mod} authFetch={authFetch} onOpen={() => handleOpenModule(mod.openMenuLabel)} />
          ))}
        </div>
      </div>
    </div>
  );
}
