// src/pages/Migration.jsx
import React, { useMemo, useState, useEffect } from "react";
import { dmyToISO, isoToDMY } from "../utils/date";
import { useNavigate } from 'react-router-dom';
import PanelToggleButton from '../components/PanelToggleButton';
import PageTopbar from "../components/PageTopbar";
import SearchField from '../components/SearchField';
import useEnrollmentLookup from '../hooks/useEnrollmentLookup';

const ACTIONS = ["➕", "✏️ Edit", "🔍", "📄 Report"];

const Migration = ({ onToggleSidebar, onToggleChatbox }) => {
  const navigate = useNavigate();
  const [selectedTopbarMenu, setSelectedTopbarMenu] = useState("🔍");
  const [panelOpen, setPanelOpen] = useState(true);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [error, setError] = useState(null);
  const [currentRow, setCurrentRow] = useState(null);
  const [instCodeById, setInstCodeById] = useState({});

  const [form, setForm] = useState({
    id: null,
    doc_rec: "", // public id string of doc_rec
    doc_rec_key: "", // write key for payload
    enrollment: "", // enrollment_no
    student_name: "",
    institute: "",
    subcourse: "",
    maincourse: "",
    mg_number: "",
  mg_date: "",
    exam_year: "",
    admission_year: "",
    exam_details: "",
    mg_status: "Pending",
    doc_remark: "",
    pay_rec_no: "",
  });

  useEffect(() => {
    try {
      const nav = window.__admindesk_initial_nav;
      if (nav && nav.nav === 'migration' && nav.docrec) {
        setForm((f)=>({ ...f, doc_rec: nav.docrec }));
        delete window.__admindesk_initial_nav;
      }
    } catch (e) {}
  }, []);

  const authHeaders = () => {
    const token = localStorage.getItem("access_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadList = async (queryValue = q) => {
    setLoading(true);
    setError(null);
    try {
      const trimmedQuery = (queryValue || '').trim();
      const url = trimmedQuery ? `/api/migration/?search=${encodeURIComponent(trimmedQuery)}` : `/api/migration/`;
      const res = await fetch(url, { headers: { ...authHeaders() } });
      if (!res.ok) {
        throw new Error(`Server error: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      setList(Array.isArray(data) ? data : data.results || []);
    } catch (e) {
      console.error(e);
      setError("Failed to load records. Please check the server logs.");
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

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Centralized enrollment lookup using useEnrollmentLookup
  useEnrollmentLookup(form.enrollment, (item) => {
    if (item) {
      setForm((f) => ({
        ...f,
        enrollment: item.enrollment_no,
        student_name: item.student_name || '',
        institute: item.institute?.id || item.institute || '',
        subcourse: item.subcourse?.id || item.subcourse || '',
        maincourse: item.maincourse?.id || item.maincourse || '',
      }));
    } else {
      setForm((f) => ({
        ...f,
        student_name: '',
        institute: '',
        subcourse: '',
        maincourse: '',
      }));
    }
  });

  const save = async () => {
    const payload = {
      doc_rec_key: form.doc_rec || form.doc_rec_key || undefined,
      enrollment: form.enrollment || null,
      student_name: form.student_name || null,
      institute: form.institute || null,
      subcourse: form.subcourse || null,
      maincourse: form.maincourse || null,
      mg_number: form.mg_number || null,
  mg_date: dmyToISO(form.mg_date) || null,
      exam_year: form.exam_year || null,
      admission_year: form.admission_year || null,
      exam_details: form.exam_details || null,
      mg_status: (String(form.mg_status || 'Pending')).toUpperCase().includes('CANCEL') ? 'CANCEL' : (form.mg_status || 'Pending'),
      pay_rec_no: form.pay_rec_no || null,
      doc_remark: form.doc_remark || null,
    };
    if (form.id) {
      const res = await fetch(`/api/migration/${form.id}/`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(await res.text());
    } else {
      const res = await fetch(`/api/migration/`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(await res.text());
    }
    await loadList();
  };

  const loadByDocRec = async (docRecKey) => {
    if (!docRecKey) return;
    try {
      const res = await fetch(`/api/migration/?doc_rec=${encodeURIComponent(docRecKey)}`, { headers: { ...authHeaders() } });
      const data = await res.json();
      setList(Array.isArray(data) ? data : data.results || []);
    } catch (e) { console.error(e); }
  };

  const addEntry = async (entry) => {
    // duplicate mg_number check
    const sibling = list.find((r) => (r.mg_number || '').trim() === (entry.mg_number || '').trim());
    if (sibling) {
      if ((entry.mg_status || '').toLowerCase() !== 'cancelled') {
        alert('Duplicate MG number for this document is not allowed unless status is Cancelled.');
        return;
      }
    }
    // only one non-cancelled per doc_rec
    const statusNonCancel = list.filter(r => (r.mg_status||'').toLowerCase() !== 'cancelled');
    if ((entry.mg_status||'').toLowerCase() !== 'cancelled') {
      const hasDoneOrNull = statusNonCancel.find(r => !r.mg_status || ['issued','pending','done'].includes((r.mg_status||'').toLowerCase()));
      if (hasDoneOrNull) {
        alert('Only one non-cancelled migration entry allowed per document.');
        return;
      }
    }
    const payload = {
      doc_rec_key: form.doc_rec || form.doc_rec_key || undefined,
      enrollment: entry.enrollment || null,
      student_name: entry.student_name || null,
      institute: entry.institute || null,
      subcourse: entry.subcourse || null,
      maincourse: entry.maincourse || null,
      mg_number: entry.mg_number || null,
      mg_date: entry.mg_date || null,
      exam_year: entry.exam_year || null,
      admission_year: entry.admission_year || null,
      exam_details: entry.exam_details || null,
      mg_status: (String(entry.mg_status || 'Pending')).toUpperCase().includes('CANCEL') ? 'CANCEL' : (entry.mg_status || 'Pending'),
      pay_rec_no: entry.pay_rec_no || null,
      doc_remark: entry.doc_remark || form.doc_remark || null,
    };
    const res = await fetch(`/api/migration/`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(await res.text());
    await loadByDocRec(form.doc_rec || form.doc_rec_key);
  };

  return (
  <div className="p-2 md:p-3 space-y-4 h-full bg-slate-100">
      <PageTopbar
        title="Migration"
        actions={ACTIONS}
        selected={selectedTopbarMenu}
        onSelect={(action)=>{ setSelectedTopbarMenu(action); setPanelOpen(true);} }
        actionsOnLeft
      />

      {/* Collapsible Action Box */}
      <div className="action-panel-shell">
        <div className="action-panel-header">
          <div className="action-panel-title">{selectedTopbarMenu || 'Panel'}</div>
          <PanelToggleButton open={panelOpen} onClick={() => setPanelOpen((o) => !o)} />
        </div>

        {panelOpen && (selectedTopbarMenu === '➕' || selectedTopbarMenu === '✏️ Edit') && (
          <div className="action-panel-body grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-sm">Doc Rec</label>
              <input className="w-full border rounded-lg p-2" placeholder="mg25000001" value={form.doc_rec} onChange={(e)=>setF('doc_rec', e.target.value)} />
            </div>
            <div>
              <label className="text-sm">Enrollment</label>
                <input className="w-full border rounded-lg p-2" value={form.enrollment} onChange={(e)=>{ setF('enrollment', e.target.value); }} />
            </div>
            <div>
              <label className="text-sm">Student Name</label>
              <input className="w-full border rounded-lg p-2" value={form.student_name} onChange={(e)=>setF('student_name', e.target.value)} />
            </div>
            <div>
              <label className="text-sm">Institute Id</label>
              <input className="w-full border rounded-lg p-2" value={form.institute} onChange={(e)=>setF('institute', e.target.value)} />
            </div>
            <div>
              <label className="text-sm">Main Course</label>
              <input className="w-full border rounded-lg p-2" value={form.maincourse} onChange={(e)=>setF('maincourse', e.target.value)} />
            </div>
            <div>
              <label className="text-sm">Sub Course</label>
              <input className="w-full border rounded-lg p-2" value={form.subcourse} onChange={(e)=>setF('subcourse', e.target.value)} />
            </div>

            <div>
              <label className="text-sm">MG Number</label>
              <input className="w-full border rounded-lg p-2" value={form.mg_number} onChange={(e)=>setF('mg_number', e.target.value)} />
            </div>
            <div>
              <label className="text-sm">MG Date</label>
              <input className="w-full border rounded-lg p-2" placeholder="dd-mm-yyyy" value={form.mg_date} onChange={(e)=>setF('mg_date', e.target.value)} />
            </div>
            <div>
              <label className="text-sm">Exam Year</label>
              <input className="w-full border rounded-lg p-2" value={form.exam_year} onChange={(e)=>setF('exam_year', e.target.value)} />
            </div>
            <div>
              <label className="text-sm">Admission Year</label>
              <input className="w-full border rounded-lg p-2" value={form.admission_year} onChange={(e)=>setF('admission_year', e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm">Exam Details</label>
              <input className="w-full border rounded-lg p-2" value={form.exam_details} onChange={(e)=>setF('exam_details', e.target.value)} />
            </div>
            <div>
              <label className="text-sm">Status</label>
              <select className="w-full border rounded-lg p-2" value={form.mg_status} onChange={(e)=>setF('mg_status', e.target.value)}>
                <option>Pending</option>
                <option>Issued</option>
                <option>Cancelled</option>
              </select>
            </div>
            <div>
              <label className="text-sm">Pay Rec No</label>
              <input className="w-full border rounded-lg p-2" value={form.pay_rec_no} onChange={(e)=>setF('pay_rec_no', e.target.value)} />
            </div>
            <div>
              <label className="text-sm">Doc Rec Remark</label>
              <input className="w-full border rounded-lg p-2" value={form.doc_remark} onChange={(e)=>setF('doc_remark', e.target.value)} />
            </div>

            <div className="md:col-span-4 flex justify-end">
              <button className="save-button" onClick={async()=>{ try{ await save(); alert('Saved'); setSelectedTopbarMenu('🔍'); setPanelOpen(false); }catch(e){ alert(e.message||'Failed'); } }}>Save</button>
            </div>
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
            <p className="text-xs text-slate-500">Results update automatically while you type.</p>
          </div>
        )}
      </div>

      {/* Records Section */}
      <div className="bg-white shadow rounded-2xl p-4 h-[calc(100vh-260px)] overflow-auto">
        {error && (
          <div className="mb-4 p-3 text-sm text-red-700 bg-red-100 border border-red-200 rounded-lg">{error}</div>
        )}
        <div className="overflow-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-2 px-3 whitespace-nowrap">MG No</th>
                <th className="text-left py-2 px-3">Enroll</th>
                <th className="text-left py-2 px-3">Name</th>
                <th className="text-left py-2 px-3 whitespace-nowrap">Inst Code</th>
                <th className="text-left py-2 px-3">MG Date</th>
                <th className="text-left py-2 px-3">Status</th>
                <th className="text-left py-2 px-3">Pay Rec</th>
                <th className="text-left py-2 px-3 whitespace-nowrap">Doc Rec</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && !loading && (
                <tr><td colSpan={8} className="py-6 text-center text-gray-500">No records</td></tr>
              )}
              {list.map((r)=> (
                <tr key={r.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={()=>{
                  setCurrentRow(r);
                  setSelectedTopbarMenu('✏️ Edit');
                  setPanelOpen(true);
                  setForm({
                    id: r.id,
                    doc_rec: r.doc_rec || r.doc_rec_id || '',
                    enrollment: r.enrollment || r.enrollment_no || '',
                    student_name: r.student_name || '',
                    institute: r.institute || r.institute_id || '',
                    subcourse: r.subcourse || r.subcourse_id || '',
                    maincourse: r.maincourse || r.maincourse_id || '',
                    mg_number: r.mg_number || '',
                    mg_date: r.mg_date || '',
                    exam_year: r.exam_year || '',
                    admission_year: r.admission_year || '',
                    exam_details: r.exam_details || '',
                    mg_status: r.mg_status || 'Pending',
                    pay_rec_no: r.pay_rec_no || '',
                    doc_rec_remark: r.doc_rec_remark || '',
                  });
                }}>
                  <td className="py-2 px-3 whitespace-nowrap">{r.mg_number || '-'}</td>
                  <td className="py-2 px-3">{r.enrollment || r.enrollment_no || '-'}</td>
                  <td className="py-2 px-3">{r.student_name || '-'}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{r.institute_code || instCodeById[String(r.institute_id || r.institute || '')] || '-'}</td>
                  <td className="py-2 px-3">{r.mg_date || '-'}</td>
                  <td className="py-2 px-3">{r.mg_status || '-'}</td>
                  <td className="py-2 px-3">{r.pay_rec_no || '-'}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{r.doc_rec || r.doc_rec_id || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Migration;
