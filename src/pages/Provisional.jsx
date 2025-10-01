import React, { useMemo, useState, useEffect } from "react";
import { isoToDMY, dmyToISO } from "../utils/date";
import PageTopbar from "../components/PageTopbar";

const ACTIONS = ["➕", "✏️ Edit", "🔍", "📄 Report"];

const Provisional = ({ onToggleSidebar, onToggleChatbox }) => {
  const [selectedTopbarMenu, setSelectedTopbarMenu] = useState("🔍");
  const [panelOpen, setPanelOpen] = useState(true);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [currentRow, setCurrentRow] = useState(null);

  const [form, setForm] = useState({
    id: null,
    doc_rec: "",
    doc_rec_key: "",
    enrollment: "",
    student_name: "",
    institute: "",
    subcourse: "",
    maincourse: "",
    class_obtain: "",
    prv_number: "",
  prv_date: "",
    passing_year: "",
    prv_status: "Pending",
    pay_rec_no: "",
  });

  const authHeaders = () => {
    const token = localStorage.getItem("access_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadList = async () => {
    setLoading(true);
    try {
      const url = q ? `/api/provisional/?search=${encodeURIComponent(q)}` : `/api/provisional/`;
      const res = await fetch(url, { headers: { ...authHeaders() } });
      const data = await res.json();
      setList(Array.isArray(data) ? data : data.results || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(()=>{ loadList(); }, []);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const fetchEnrollment = async (enrollNo) => {
    if (!enrollNo || String(enrollNo).trim().length < 2) return;
    try {
      const res = await fetch(`/api/enrollments/?search=${encodeURIComponent(enrollNo)}&limit=1&page=1`, { headers: { ...authHeaders() } });
      const data = await res.json();
      const item = data?.items?.[0];
      if (item) {
        setForm((f)=>({
          ...f,
          enrollment: item.enrollment_no,
          student_name: item.student_name || "",
          institute: item.institute?.id || item.institute || "",
          subcourse: item.subcourse?.id || item.subcourse || "",
          maincourse: item.maincourse?.id || item.maincourse || "",
        }));
      }
    } catch {}
  };

  const save = async () => {
    const payload = {
      doc_rec_key: form.doc_rec || form.doc_rec_key || undefined,
      enrollment: form.enrollment || null,
      student_name: form.student_name || null,
      institute: form.institute || null,
      subcourse: form.subcourse || null,
      maincourse: form.maincourse || null,
      class_obtain: form.class_obtain || null,
      prv_number: form.prv_number || null,
  prv_date: dmyToISO(form.prv_date) || null,
      passing_year: form.passing_year || null,
      prv_status: form.prv_status || "Pending",
      pay_rec_no: form.pay_rec_no || null,
    };
    if (form.id) {
      const res = await fetch(`/api/provisional/${form.id}/`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(await res.text());
    } else {
      const res = await fetch(`/api/provisional/`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(await res.text());
    }
    await loadList();
  };

  return (
  <div className="p-4 md:p-6 space-y-4 h-full">
      <PageTopbar
        title="Provisional"
        actions={ACTIONS}
        selected={selectedTopbarMenu}
        onSelect={(action)=>{ setSelectedTopbarMenu(action); setPanelOpen(true);} }
        actionsOnLeft
        rightSlot={<a href="/" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 text-white ml-2">🏠 Home</a>}
      />

      {/* Collapsible Action Box */}
      <div className="border rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
          <div className="font-semibold">{selectedTopbarMenu || 'Panel'}</div>
          <button onClick={()=>setPanelOpen((o)=>!o)} className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50">{panelOpen ? 'Collapse':'Expand'}</button>
        </div>

        {panelOpen && (selectedTopbarMenu === '➕' || selectedTopbarMenu === '✏️ Edit') && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-sm">Doc Rec</label>
              <input className="w-full border rounded-lg p-2" placeholder="pr_25_0001" value={form.doc_rec} onChange={(e)=>setF('doc_rec', e.target.value)} />
            </div>
            <div>
              <label className="text-sm">Enrollment</label>
              <input className="w-full border rounded-lg p-2" value={form.enrollment} onChange={(e)=>setF('enrollment', e.target.value)} onBlur={()=>fetchEnrollment(form.enrollment)} />
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
              <label className="text-sm">Class Obtain</label>
              <input className="w-full border rounded-lg p-2" value={form.class_obtain} onChange={(e)=>setF('class_obtain', e.target.value)} />
            </div>
            <div>
              <label className="text-sm">PRV Number</label>
              <input className="w-full border rounded-lg p-2" value={form.prv_number} onChange={(e)=>setF('prv_number', e.target.value)} />
            </div>
            <div>
              <label className="text-sm">PRV Date</label>
              <input className="w-full border rounded-lg p-2" placeholder="dd-mm-yyyy" value={form.prv_date} onChange={(e)=>setF('prv_date', e.target.value)} />
            </div>
            <div>
              <label className="text-sm">Passing Year</label>
              <input className="w-full border rounded-lg p-2" value={form.passing_year} onChange={(e)=>setF('passing_year', e.target.value)} />
            </div>
            <div>
              <label className="text-sm">Status</label>
              <select className="w-full border rounded-lg p-2" value={form.prv_status} onChange={(e)=>setF('prv_status', e.target.value)}>
                <option>Pending</option>
                <option>Issued</option>
                <option>Cancelled</option>
              </select>
            </div>
            <div>
              <label className="text-sm">Pay Rec No</label>
              <input className="w-full border rounded-lg p-2" value={form.pay_rec_no} onChange={(e)=>setF('pay_rec_no', e.target.value)} />
            </div>
            <div className="md:col-span-4 flex justify-end">
              <button className="px-4 py-2 rounded-lg bg-emerald-600 text-white" onClick={async()=>{ try{ await save(); alert('Saved'); setSelectedTopbarMenu('🔍'); setPanelOpen(false);}catch(e){ alert(e.message||'Failed'); } }}>Save</button>
            </div>
          </div>
        )}

        {panelOpen && selectedTopbarMenu === '🔍' && (
          <div className="p-4 flex gap-2">
            <input className="flex-1 border rounded-lg p-2" placeholder="Search by PRV No / Enrollment / Name" value={q} onChange={(e)=>setQ(e.target.value)} />
            <button className="px-3 py-2 rounded-lg bg-blue-600 text-white" onClick={loadList}>Search</button>
          </div>
        )}
      </div>

      {/* Records Section */}
      <div className="bg-white shadow rounded-2xl p-4 h-[calc(100vh-260px)] overflow-auto">
        <div className="overflow-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-2 px-3">Doc Rec</th>
                <th className="text-left py-2 px-3">Enroll</th>
                <th className="text-left py-2 px-3">Name</th>
                <th className="text-left py-2 px-3">Inst</th>
                <th className="text-left py-2 px-3">Main</th>
                <th className="text-left py-2 px-3">Sub</th>
                <th className="text-left py-2 px-3">Class</th>
                <th className="text-left py-2 px-3">PRV No</th>
                <th className="text-left py-2 px-3">PRV Date</th>
                <th className="text-left py-2 px-3">Pass Year</th>
                <th className="text-left py-2 px-3">Status</th>
                <th className="text-left py-2 px-3">Pay Rec</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && !loading && (
                <tr><td colSpan={12} className="py-6 text-center text-gray-500">No records</td></tr>
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
                    class_obtain: r.class_obtain || '',
                    prv_number: r.prv_number || '',
                    prv_date: r.prv_date || '',
                    passing_year: r.passing_year || '',
                    prv_status: r.prv_status || 'Pending',
                    pay_rec_no: r.pay_rec_no || '',
                  });
                }}>
                  <td className="py-2 px-3">{r.doc_rec || r.doc_rec_id || '-'}</td>
                  <td className="py-2 px-3">{r.enrollment || r.enrollment_no || '-'}</td>
                  <td className="py-2 px-3">{r.student_name || '-'}</td>
                  <td className="py-2 px-3">{r.institute || r.institute_id || '-'}</td>
                  <td className="py-2 px-3">{r.maincourse || r.maincourse_id || '-'}</td>
                  <td className="py-2 px-3">{r.subcourse || r.subcourse_id || '-'}</td>
                  <td className="py-2 px-3">{r.class_obtain || '-'}</td>
                  <td className="py-2 px-3">{r.prv_number || '-'}</td>
                  <td className="py-2 px-3">{r.prv_date || '-'}</td>
                  <td className="py-2 px-3">{r.passing_year || '-'}</td>
                  <td className="py-2 px-3">{r.prv_status || '-'}</td>
                  <td className="py-2 px-3">{r.pay_rec_no || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Provisional;
