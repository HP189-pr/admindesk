import React, { useEffect, useState } from 'react';
import axios from '../api/axiosInstance';
import { useAuth } from '../hooks/AuthContext';
import { FaUserTie, FaChevronUp, FaChevronDown } from 'react-icons/fa';

const EmpLeavePage = () => {
  const { user } = useAuth();
  const [leaveEntries, setLeaveEntries] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ report_no: '', emp_id: '', emp_name: '', leave_type: '', leave_type_code: '', start_date: '', end_date: '', remark: '', total_days: '', status: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterEmp, setFilterEmp] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [editingId, setEditingId] = useState(null);
  // debug panel removed
  const [myBalances, setMyBalances] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [allocEdits, setAllocEdits] = useState({}); // local edits keyed by allocation id: { [id]: { allocated, allocated_cl, allocated_sl, allocated_el, allocated_vac, allocated_start_date, allocated_end_date } }
  const [selectedEmp, setSelectedEmp] = useState(null);

  const PANELS = ['Entry Leave', 'Leave Report', 'Balance Certificate'];
  const [selectedPanel, setSelectedPanel] = useState(PANELS[0]);
  const [panelOpen, setPanelOpen] = useState(true);

  // helper to build query string
  const q = (obj) => {
    const params = new URLSearchParams();
    Object.entries(obj).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') params.set(k, v); });
    const s = params.toString();
    return s ? `?${s}` : '';
  };

  const toISODateString = (s) => {
    const d = parseDMY(s);
    if (!d) return null;
    return d.toISOString().slice(0, 10);
  };

  const handleSaveAllocation = async (allocId) => {
    const edits = allocEdits[allocId] || {};
    if (!edits || Object.keys(edits).length === 0) {
      alert('No changes to save');
      return;
    }
    const payload = {};
    ['allocated','allocated_cl','allocated_sl','allocated_el','allocated_vac'].forEach(k => {
      if (typeof edits[k] !== 'undefined') {
        const v = edits[k];
        payload[k] = v === '' ? null : (isNaN(Number(v)) ? v : Number(v));
      }
    });
    if (typeof edits.allocated_start_date !== 'undefined') payload.allocated_start_date = toISODateString(edits.allocated_start_date);
    if (typeof edits.allocated_end_date !== 'undefined') payload.allocated_end_date = toISODateString(edits.allocated_end_date);
    try {
      await axios.patch(`/api/leave-allocations/${allocId}/`, payload);
      // refresh allocations
      if (selectedPanel === 'Leave Report') {
        const params = q({ period: selectedPeriod });
        const r = await axios.get(`/api/leave-allocations${params}`);
        setAllocations(r.data || []);
      } else {
        const r = await axios.get('/api/leave-allocations');
        setAllocations(r.data || []);
      }
      setAllocEdits(prev => { const next = { ...prev }; delete next[allocId]; return next; });
    } catch (e) {
      console.error(e);
      alert('Failed to update allocation');
    }
  };

  useEffect(() => {
    // Load leave types (prefer normal API, fall back to compat SQL-backed endpoint)
    axios.get('/api/leavetype/').then(r => {
      const data = r.data || [];
      setLeaveTypes(data.map(lt => ({
        leave_code: lt.leave_code ?? lt.id ?? lt.code,
        leave_name: lt.leave_name ?? lt.name,
        annual_allocation: lt.annual_allocation ?? lt.annual_limit ?? lt.allocation ?? 0,
        day_value: lt.day_value ?? lt.leave_unit ?? 1
      })));
    }).catch(async () => {
      try {
        const r2 = await axios.get('/api/leavetype-compat/');
        const data = r2.data || [];
        setLeaveTypes(data.map(lt => ({
          leave_code: lt.leave_code ?? lt.id ?? lt.code,
          leave_name: lt.leave_name ?? lt.name,
          annual_allocation: lt.annual_allocation ?? lt.annual_limit ?? lt.allocation ?? 0,
          day_value: lt.day_value ?? lt.leave_unit ?? 1
        })));
      } catch (e) {
        setLeaveTypes([]);
      }
    });

    // Load leave periods with fallback
    axios.get('/api/leaveperiods/').then(r => {
      const pd = r.data || [];
      setPeriods(pd);
      const active = pd.find(p => p.is_active);
      if (active) setSelectedPeriod(String(active.id));
    }).catch(async () => {
      try {
        const r2 = await axios.get('/api/leaveperiods-compat/');
        const pd = r2.data || [];
        setPeriods(pd);
        const active = pd.find(p => p.is_active);
        if (active) setSelectedPeriod(String(active.id));
      } catch (e) { setPeriods([]); }
    });

    // Load employee profiles
    axios.get('/api/empprofile/').then(r => {
      const data = r.data || [];
      setProfiles(data);
      const me = data.find(p => (p.username === user?.username) || (p.usercode === user?.username) || String(p.emp_id) === String(user?.username));
      setProfile(me || null);
    }).catch(() => setProfiles([]));

    // Load leave entries with a fallback to legacy table endpoint
    axios.get('/api/leaveentry/').then(r => { console.debug('leaveentry:', r.data); setLeaveEntries(r.data || []); }).catch(async () => {
      try {
        const r2 = await axios.get('/api/leave_entry/'); console.debug('leave_entry (legacy):', r2.data); setLeaveEntries(r2.data || []);
      } catch (e) {
        console.debug('leaveentry fetch failed', e);
        setLeaveEntries([]);
      }
    });

    if (user) {
      axios.get('/api/my-leave-balance/').then(r => setMyBalances(r.data || [])).catch(() => setMyBalances([]));
    } else {
      // no authenticated user available yet
      setMyBalances([]);
    }
  }, [user]);

  // load allocations when report panel is active OR period changes
  useEffect(() => {
    // When viewing the Leave Report, fetch allocations for the selected period (or all if empty).
    if (selectedPanel === 'Leave Report') {
      const params = q({ period: selectedPeriod });
      axios.get(`/api/leave-allocations${params}`).then(r => setAllocations(r.data || [])).catch(async () => {
        try {
          const r2 = await axios.get(`/api/leavea_llocation_general${params}`);
          setAllocations(r2.data || []);
        } catch (e) {
          setAllocations([]);
        }
      });
      return;
    }

    // When not on the Leave Report (e.g. manager allocations panel), show all allocations
    // across periods by default so admins see every seeded/default allocation like Django admin.
    (async () => {
      try {
        const r = await axios.get('/api/leave-allocations');
        setAllocations(r.data || []);
      } catch (err) {
        try {
          const r2 = await axios.get('/api/leavea_llocation_general');
          setAllocations(r2.data || []);
        } catch (e) {
          setAllocations([]);
        }
      }
    })();
  }, [selectedPanel, selectedPeriod]);

  const handleTopbarSelect = (panel) => {
    if (selectedPanel === panel) setPanelOpen(p => !p);
    else { setSelectedPanel(panel); setPanelOpen(true); }
  };

  const parseDMY = (s) => {
    if (!s) return null;
    // yyyy-mm-dd (from date input)
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
      const dt = new Date(y, mo, d);
      if (dt && dt.getDate() === d && dt.getMonth() === mo && dt.getFullYear() === y) return dt;
      return null;
    }
    // dd-mm-yyyy or dd/mm/yyyy
    m = s.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/);
    if (m) {
      const d = Number(m[1]), mo = Number(m[2]) - 1, y = Number(m[3]);
      const dt = new Date(y, mo, d);
      if (dt && dt.getDate() === d && dt.getMonth() === mo && dt.getFullYear() === y) return dt;
    }
    return null;
  };

  // small helpers and UI actions for the report view
  const clearSelected = () => setSelectedEmp(null);

  const handleGeneratePdf = () => {
    try {
      // basic print fallback — callers can replace with a better export if needed
      window.print();
    } catch (e) {
      console.debug('PDF generation not supported in this environment', e);
    }
  };

  const fmtDate = (s) => {
    if (!s) return '';
    const d = parseDMY(s) || (s ? new Date(s) : null);
    if (!d) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  };

  const computeTotalDays = (startStr, endStr) => {
    const a = parseDMY(startStr);
    const b = parseDMY(endStr);
    if (!a || !b) return '';
    const days = Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1;
    return String(Math.max(0, days));
  };

  const handleChange = (e) => {
    if (!e || !e.target) return;
    const { name, value } = e.target;
    setForm(f => {
      const next = { ...f, [name]: value };
      if (name === 'start_date' || name === 'end_date') {
        next.total_days = computeTotalDays(next.start_date, next.end_date);
      }
      return next;
    });
  };

  const handleApply = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        leave_report_no: form.report_no || null,
        emp: form.emp_id || null,
        emp_name: form.emp_name || null,
        leave_type: form.leave_type || form.leave_type_code || null,
        start_date: toISODateString(form.start_date) || form.start_date || null,
        end_date: toISODateString(form.end_date) || form.end_date || null,
        total_days: form.total_days || null,
        status: form.status || null,
        remark: form.remark || null
      };

      if (editingId) {
        await axios.patch(`/api/leaveentry/${editingId}/`, payload);
      } else {
        await axios.post('/api/leaveentry/', payload);
      }

      // refresh list
      const r = await axios.get('/api/leaveentry/');
      setLeaveEntries(r.data || []);
      // clear form
      setForm({ report_no: '', emp_id: '', emp_name: '', leave_type: '', leave_type_code: '', start_date: '', end_date: '', remark: '', total_days: '', status: '' });
      setEditingId(null);
    } catch (err) {
      console.error('Failed to save leave entry', err);
      alert('Failed to save leave entry');
    } finally {
      setLoading(false);
    }
  };
  // derive year and sequence from leave_report_no
  // supports formats like '25_001', '25-001', '25001', '25_1' or '25-1'
  const parseReportYearSeq = (rrn) => {
    if (!rrn) return { year: null, seq: 0 };
    const s = String(rrn).trim();

    // common pattern: two-digit year then separator then sequence, e.g. 25_001 or 25-001
    let m = s.match(/^(\d{2})[_-](0*)(\d+)$/);
    if (m) {
      const two = parseInt(m[1], 10);
      const seq = parseInt(m[3], 10) || 0;
      return { year: 2000 + two, seq };
    }

    // single string containing only digits like 25001 -> take first two as year and rest as seq
    m = s.match(/^(\d{2})(\d+)$/);
    if (m) {
      const two = parseInt(m[1], 10);
      const seq = parseInt(m[2], 10) || 0;
      return { year: 2000 + two, seq };
    }

    // fallback: if there's an underscore, take prefix as year and remainder as seq
    const parts = s.split(/[_-]/);
    if (parts.length >= 2 && /^\d+$/.test(parts[0])) {
      const prefix = parts[0];
      const seq = parseInt(parts.slice(1).join(''), 10) || 0;
      const year = 2000 + (parseInt(prefix, 10) || 0);
      return { year, seq };
    }

    return { year: null, seq: 0 };
  };

  const filteredEntries = (leaveEntries || []).filter(le => {
    if (filterEmp && String(le.emp) !== String(filterEmp)) return false;
    if (yearFilter) {
      const p = parseReportYearSeq(le.leave_report_no);
      if (String(p.year) !== String(yearFilter)) return false;
    }
    if (monthFilter) {
      const sd = le.start_date;
      if (!sd) return false;
      const m = (new Date(sd)).getMonth() + 1;
      if (String(m) !== String(monthFilter)) return false;
    }
    return true;
  }).sort((a, b) => {
    const pa = parseReportYearSeq(a.leave_report_no);
    const pb = parseReportYearSeq(b.leave_report_no);
    if (pa.year !== pb.year) return pb.year - pa.year;
    return pb.seq - pa.seq;
  });

  const LastLeaveRecords = () => (
    <div className="border rounded-2xl overflow-hidden flex flex-col mt-4">
      <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
        <div className="font-semibold">Last Leave Records</div>
        <div className="text-sm text-gray-500">{leaveEntries.length} record(s)</div>
      </div>

      <div className="p-3 bg-white border-b flex items-center gap-3">
        <div>
          <label className="text-xs block">Year</label>
          <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} className="border rounded p-1 text-sm">
            <option value="">All</option>
            {[...new Set((leaveEntries||[]).map(le => parseReportYearSeq(le.leave_report_no).year).filter(Boolean))].sort((a,b)=>b-a).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs block">Month</label>
          <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="border rounded p-1 text-sm">
            <option value="">All</option>
            {Array.from({length:12}).map((_,i)=>{ const val = i+1; return <option key={val} value={val}>{val}</option>; })}
          </select>
        </div>

        <div className="ml-auto">
          <button onClick={async ()=>{ try { const r = await axios.get('/api/leaveentry/'); setLeaveEntries(r.data || []); } catch(e){ } }} className="px-3 py-1 rounded bg-blue-600 text-white text-sm">Refresh</button>
        </div>
      </div>

      <div className="overflow-auto flex-1">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left py-2 px-3">Report No</th>
              <th className="text-left py-2 px-3">Employee</th>
              <th className="text-left py-2 px-3">Type</th>
              <th className="text-left py-2 px-3">Dates</th>
              <th className="text-left py-2 px-3">Days</th>
              <th className="text-left py-2 px-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.length === 0 ? (
              <tr><td colSpan={6} className="py-6 text-center text-gray-500">No records</td></tr>
            ) : filteredEntries.map((le) => (
              <tr key={le.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => {
                setForm({ report_no: le.leave_report_no || '', emp_id: '', emp_name: le.emp_name || '', leave_type: le.leave_type, leave_type_code: le.leave_type_code || '', start_date: le.start_date, end_date: le.end_date, remark: le.remark || le.reason || '', total_days: le.total_days || '' });
                const p = profiles.find(p => String(p.id) === String(le.emp) || String(p.emp_id) === String(le.emp));
                if (p) setProfile(p);
                setForm(f => ({ ...f, emp_id: (p?.emp_id || f.emp_id) }));
                setSelectedPanel('Entry Leave'); setPanelOpen(true);
                setEditingId(le.id);
              }}>
                <td className="py-2 px-3">{le.leave_report_no}</td>
                <td className="py-2 px-3">{le.emp_name}</td>
                <td className="py-2 px-3">{le.leave_type_name || le.leave_type}</td>
                <td className="py-2 px-3">{le.start_date} - {le.end_date}</td>
                <td className="py-2 px-3">{le.total_days}</td>
                <td className="py-2 px-3">{le.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-3 bg-gray-50 flex items-center justify-between">
        <div className="text-xs text-gray-500">Tip: click a record to open it in the Add panel for editing. Use Refresh after external uploads.</div>
        <div className="text-xs text-gray-500">Showing filtered records (latest first).</div>
      </div>
    </div>
  );

  // Report view: shows aggregated allocations and balances per employee
  const ReportView = () => {
    const empAllocations = selectedEmp ? (allocations || []).filter(a => {
      const pid = String(a.emp_id ?? a.profile ?? '');
      return pid === String(selectedEmp.id) || pid === String(selectedEmp.emp_id);
    }) : [];

    const empEntries = selectedEmp ? (leaveEntries || []).filter(le => (String(le.emp) === String(selectedEmp.id) || String(le.emp) === String(selectedEmp.emp_id))) : [];

    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
            <div className="font-semibold">Leave Report</div>
            <div className="flex items-center gap-3">
              <button onClick={async () => {
                try {
                  const params = q({ period: selectedPeriod });
                  const r = await axios.get(`/api/leave-allocations${params}`);
                  setAllocations(r.data || []);
                } catch (e) { console.error(e); }
              }} className="px-3 py-1 rounded bg-blue-600 text-white text-sm">Refresh Allocations</button>

              <div>
                <label className="text-xs block">Period</label>
                <select value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)} className="border rounded p-1 text-sm">
                  <option value="">All</option>
                  {(periods||[]).map(p => <option key={p.id} value={p.id}>{p.name || p.label || p.id}</option>)}
                </select>
              </div>

              <div className="ml-auto flex items-center gap-2">
                {selectedEmp && <button onClick={clearSelected} className="px-3 py-1 rounded border text-sm">Back</button>}
                <button onClick={handleGeneratePdf} className="px-3 py-1 rounded bg-blue-600 text-white text-sm">Generate PDF</button>
              </div>
            </div>
          </div>

        {/* Detailed aggregated report view (per-employee aggregates, allocations, editable allocations) */}
        {!selectedEmp ? (
          <div className="overflow-auto">
            {/* Detailed aggregated report table (start balances, allocations, used, end balances) */}
            <table className="min-w-full text-sm table-auto">
              <thead>
                <tr className="bg-gray-50">
                  <th rowSpan={2} className="p-2">Emp ID</th>
                  <th rowSpan={2} className="p-2">Emp Name</th>
                  <th rowSpan={2} className="p-2">Position</th>
                  <th rowSpan={2} className="p-2">Leave Group</th>
                  <th rowSpan={2} className="p-2">Joining Date</th>
                  <th rowSpan={2} className="p-2">Leaving Date</th>
                  {/* Starting balances (example: SL, EL) */}
                  <th colSpan={2} className="p-2 text-center bg-amber-100">Balance: {periods.find(p=>String(p.id)===String(selectedPeriod))?.name || ''}</th>
                  {/* Allocations for period */}
                  <th colSpan={4} className="p-2 text-center bg-green-100">Leave Allocation for ({periods.find(p=>String(p.id)===String(selectedPeriod))?.name || ''})</th>
                  {/* Used columns */}
                  <th colSpan={8} className="p-2 text-center bg-sky-100">Used Leave (Period)</th>
                  {/* Ending balances */}
                  <th colSpan={4} className="p-2 text-center bg-orange-100">Balance: {periods.find(p=>String(p.id)===String(selectedPeriod))?.end_date ? '' : ''}</th>
                </tr>
                <tr className="bg-gray-50">
                  <th className="p-1 text-xs">SL</th>
                  <th className="p-1 text-xs">EL</th>
                  <th className="p-1 text-xs">CL</th>
                  <th className="p-1 text-xs">SL</th>
                  <th className="p-1 text-xs">EL</th>
                  <th className="p-1 text-xs">VAC</th>
                  <th className="p-1 text-xs">CL</th>
                  <th className="p-1 text-xs">SL</th>
                  <th className="p-1 text-xs">EL</th>
                  <th className="p-1 text-xs">Vacation</th>
                  <th className="p-1 text-xs">DL</th>
                  <th className="p-1 text-xs">LWP</th>
                  <th className="p-1 text-xs">ML</th>
                  <th className="p-1 text-xs">PL</th>
                  <th className="p-1 text-xs">CL</th>
                  <th className="p-1 text-xs">SL</th>
                  <th className="p-1 text-xs">EL</th>
                  <th className="p-1 text-xs">Vacation</th>
                </tr>
              </thead>
              <tbody>
                {profiles.length === 0 ? (
                  <tr><td colSpan={20} className="py-6 text-center text-gray-500">No employees</td></tr>
                ) : profiles.filter(emp => !filterEmp || String(emp.id) === String(filterEmp)).map(emp => {
                  // helpers to get allocation and used values for this employee and a leave code
                  const normaliseAllocValue = (allocObj) => {
                    if (!allocObj) return 0;
                    const numericCandidates = [
                      allocObj.allocated,
                      allocObj.allocated_amount,
                      allocObj.allocated_el,
                      allocObj.allocated_cl,
                      allocObj.allocated_sl,
                      allocObj.allocated_vac,
                    ];
                    for (const candidate of numericCandidates) {
                      if (candidate === null || typeof candidate === 'undefined') continue;
                      const parsed = Number(candidate);
                      if (!Number.isNaN(parsed)) return parsed;
                    }
                    return 0;
                  };

                  const findAlloc = (codes) => {
                    const codeList = Array.isArray(codes) ? codes : [codes];
                    const matchesCode = (allocObj) => {
                      const ltRaw = (allocObj.leave_type || allocObj.leave_code || '').toString().toLowerCase();
                      if (!ltRaw) return false;
                      return codeList.some((codePrefix) => ltRaw.startsWith(String(codePrefix).toLowerCase()));
                    };
                    const matchesProfile = (allocObj) => {
                      const profileToken = String(allocObj.emp_id ?? allocObj.profile ?? '').trim();
                      if (!profileToken) return false;
                      return profileToken === String(emp.id) || profileToken === String(emp.emp_id);
                    };

                    const specific = allocations.find((allocObj) => matchesProfile(allocObj) && matchesCode(allocObj));
                    if (specific) return normaliseAllocValue(specific);

                    const fallback = allocations.find((allocObj) => {
                      if (!matchesCode(allocObj)) return false;
                      const profileToken = String(allocObj.emp_id ?? allocObj.profile ?? '').trim().toLowerCase();
                      return profileToken === '' || profileToken === 'none' || profileToken === 'null';
                    });
                    if (fallback) return normaliseAllocValue(fallback);

                    return 0;
                  };

                  const sumUsed = (codes) => {
                    const c = Array.isArray(codes) ? codes : [codes];
                    const periodObj = periods.find(p => String(p.id) === String(selectedPeriod));
                    const pstart = periodObj ? (parseDMY(periodObj.start_date) || new Date(periodObj.start_date)) : null;
                    const pend = periodObj ? (parseDMY(periodObj.end_date) || new Date(periodObj.end_date)) : null;
                    let total = 0;
                    (leaveEntries || []).forEach(le => {
                      const matchesEmp = String(le.emp) === String(emp.id) || String(le.emp) === String(emp.emp_id);
                      if (!matchesEmp) return;
                      if (!le.status || String(le.status).toLowerCase() !== 'approved') return;
                      const lcode = (le.leave_type || le.leave_type_code || '').toString().toLowerCase();
                      if (!c.some(cc => lcode.startsWith(cc))) return;
                      const ls = parseDMY(le.start_date) || new Date(le.start_date);
                      const ledd = parseDMY(le.end_date) || new Date(le.end_date);
                      if (!ls || !ledd) return;
                      const s = pstart ? (ls < pstart ? pstart : ls) : ls;
                      const e = pend ? (ledd > pend ? pend : ledd) : ledd;
                      if (e >= s) {
                        const days = Math.round((e - s) / (1000*60*60*24)) + 1;
                        // find day_value for this leave type
                        const ltObj = leaveTypes.find(t => String(t.leave_code) === String(le.leave_type) || String(t.leave_code) === String(le.leave_type_code));
                        const dayVal = ltObj ? Number(ltObj.day_value || 1) : 1;
                        total += days * dayVal;
                      }
                    });
                    return total;
                  };

                  // start balances
                  const start_sl = Number(emp.sl_balance || 0);
                  const start_el = Number(emp.el_balance || 0);

                  // allocation columns (CL, SL, EL, VAC)
                  const alloc_cl = findAlloc('cl');
                  const alloc_sl = findAlloc('sl');
                  const alloc_el = findAlloc('el');
                  const alloc_vac = findAlloc('vac');

                  // used columns
                  const used_cl = sumUsed('cl');
                  const used_sl = sumUsed('sl');
                  const used_el = sumUsed('el');
                  const used_vac = sumUsed('vac');

                  const used_dl = sumUsed('dl');
                  const used_lwp = sumUsed('lwp');
                  const used_ml = sumUsed('ml');
                  const used_pl = sumUsed('pl');

                  // end balances (CL, SL, EL, VAC)
                  const end_cl = +( (Number(emp.cl_balance || 0) + alloc_cl) - used_cl ).toFixed(2);
                  const end_sl = +( (start_sl + alloc_sl) - used_sl ).toFixed(2);
                  const end_el = +( (start_el + alloc_el) - used_el ).toFixed(2);
                  const end_vac = +( (Number(emp.vacation_balance || 0) + alloc_vac) - used_vac ).toFixed(2);

                  return (
                    <tr key={emp.id} className="border-b hover:bg-gray-50">
                      <td className="p-2">{emp.emp_id}</td>
                      <td className="p-2">{emp.emp_name}</td>
                      <td className="p-2">{emp.emp_designation}</td>
                      <td className="p-2">{emp.leave_group}</td>
                      <td className="p-2">{emp.actual_joining || ''}</td>
                      <td className="p-2">{emp.left_date || 'Cont'}</td>
                      <td className="p-1 text-right">{start_sl}</td>
                      <td className="p-1 text-right">{start_el}</td>
                      <td className="p-1 text-right">{alloc_cl}</td>
                      <td className="p-1 text-right">{alloc_sl}</td>
                      <td className="p-1 text-right">{alloc_el}</td>
                      <td className="p-1 text-right">{alloc_vac}</td>
                      <td className="p-1 text-right">{used_cl}</td>
                      <td className="p-1 text-right">{used_sl}</td>
                      <td className="p-1 text-right">{used_el}</td>
                      <td className="p-1 text-right">{used_vac}</td>
                      <td className="p-1 text-right">{used_dl}</td>
                      <td className="p-1 text-right">{used_lwp}</td>
                      <td className="p-1 text-right">{used_ml}</td>
                      <td className="p-1 text-right">{used_pl}</td>
                      
                      <td className="p-1 text-right">{end_cl}</td>
                      <td className="p-1 text-right">{end_sl}</td>
                      <td className="p-1 text-right">{end_el}</td>
                      <td className="p-1 text-right">{end_vac}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="font-semibold">{selectedEmp.emp_name} ({selectedEmp.emp_id})</div>
                <div className="text-xs text-gray-500">{selectedEmp.emp_designation}</div>
              </div>
              <div className="text-sm text-gray-600">Period: {periods.find(p=>String(p.id)===String(selectedPeriod))?.name || 'All'}</div>
            </div>

            <div className="mb-3">
              <div className="font-semibold text-sm">Leave Balances</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                {empAllocations.map(a => (
                  <div key={a.id} className="border rounded p-2 text-xs">
                    <div className="font-semibold">{a.leave_type_name || a.leave_type}</div>
                    <div>Allocated: {a.allocated ?? a.allocated_amount}</div>
                    <div>Used: {a.used ?? a.used_days ?? 0}</div>
                    <div>Balance: {(a.allocated ?? a.allocated_amount ?? 0) - (a.used ?? a.used_days ?? 0)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="font-semibold text-sm mb-2">Leave Entries</div>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="py-2 px-3 text-left">Report No</th>
                      <th className="py-2 px-3 text-left">Type</th>
                      <th className="py-2 px-3 text-left">Dates</th>
                      <th className="py-2 px-3 text-left">Days</th>
                      <th className="py-2 px-3 text-left">Status</th>
                      <th className="py-2 px-3 text-left">Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(empEntries||[]).map(le => (
                      <tr key={le.id} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3">{le.leave_report_no}</td>
                        <td className="py-2 px-3">{le.leave_type_name || le.leave_type}</td>
                        <td className="py-2 px-3">{fmtDate(le.start_date)} - {fmtDate(le.end_date)}</td>
                        <td className="py-2 px-3">{le.total_days}</td>
                        <td className="py-2 px-3">{le.status}</td>
                        <td className="py-2 px-3">{le.remark || le.reason || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };
  return (
    <div className="p-4 md:p-6">
      {/* Debug panel removed - simplified header */}

      <div className="sticky top-0 z-30 flex items-center justify-between bg-white border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl text-indigo-700"><FaUserTie /></span>
          <span className="text-lg font-bold">Leave Management</span>
          {PANELS.map(panel => (
            <button
              key={panel}
              className={`px-3 py-1.5 rounded border text-sm ${selectedPanel === panel ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white hover:bg-gray-50 border-gray-300'}`}
              onClick={() => handleTopbarSelect(panel)}
            >{panel === 'Entry Leave' ? 'Add' : panel === 'Leave Report' ? 'Report' : 'Balance'}</button>
          ))}
        </div>
        <a href="/" className="px-4 py-2 rounded bg-gray-800 text-white">🏠 Home</a>
      </div>

      <div className="mt-4 border rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
          <div className="font-semibold">{selectedPanel ? `${selectedPanel} Panel` : 'Action Panel'}</div>
          <button onClick={() => setPanelOpen(o => !o)} className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50">
            {panelOpen ? <FaChevronUp /> : <FaChevronDown />} {panelOpen ? 'Collapse' : 'Expand'}
          </button>
        </div>

        {selectedPanel === 'Leave Report' ? (
          <ReportView />
        ) : (
          <LastLeaveRecords />
        )}

        {/* Entry / Add form - shown when Add panel is active */}
        {selectedPanel === 'Entry Leave' && panelOpen && (
          <div className="p-4 bg-white border-b">
            <form onSubmit={handleApply} className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs">Report No</label>
                <input name="report_no" value={form.report_no || ''} onChange={handleChange} className="w-full border rounded p-2 text-sm" />
              </div>
              <div>
                <label className="text-xs">Employee ID</label>
                <select name="emp_id" value={form.emp_id || ''} onChange={e => { handleChange(e); const sel = profiles.find(p => String(p.emp_id) === String(e.target.value) || String(p.id) === String(e.target.value)); if (sel) setForm(f=>({...f, emp_name: sel.emp_name || ''})); }} className="w-full border rounded p-2 text-sm">
                  <option value="">-- select --</option>
                  {profiles.map(p => <option key={p.id} value={p.emp_id || p.id}>{p.emp_id} - {p.emp_name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs">Employee Name</label>
                <input name="emp_name" value={form.emp_name || ''} onChange={handleChange} className="w-full border rounded p-2 text-sm" />
              </div>

              <div>
                <label className="text-xs">Start Date</label>
                <input name="start_date" value={form.start_date || ''} onChange={handleChange} placeholder="dd-mm-YYYY" className="w-full border rounded p-2 text-sm" />
              </div>
              <div>
                <label className="text-xs">End Date</label>
                <input name="end_date" value={form.end_date || ''} onChange={handleChange} placeholder="dd-mm-YYYY" className="w-full border rounded p-2 text-sm" />
              </div>
              <div>
                <label className="text-xs">Leave Type</label>
                <select name="leave_type" value={form.leave_type || ''} onChange={handleChange} className="w-full border rounded p-2 text-sm">
                  <option value="">-- select --</option>
                  {leaveTypes.map(lt => <option key={lt.leave_code} value={lt.leave_code}>{lt.leave_name} ({lt.leave_code})</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs">Total Days</label>
                <input name="total_days" value={form.total_days || ''} readOnly className="w-full border rounded p-2 text-sm bg-gray-50" />
              </div>
              <div>
                <label className="text-xs">Status</label>
                <select name="status" value={form.status || ''} onChange={handleChange} className="w-full border rounded p-2 text-sm">
                  <option value="">Draft</option>
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>
              <div className="md:col-span-3">
                <label className="text-xs">Remark</label>
                <input name="remark" value={form.remark || ''} onChange={handleChange} className="w-full border rounded p-2 text-sm" />
              </div>

              <div className="md:col-span-3 flex items-center gap-2">
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">{editingId ? 'Save' : 'Add'}</button>
                <button type="button" onClick={() => { setForm({ report_no: '', emp_id: '', emp_name: '', leave_type: '', leave_type_code: '', start_date: '', end_date: '', remark: '', total_days: '' }); setEditingId(null); }} className="px-3 py-2 border rounded">Clear</button>
              </div>
            </form>
          </div>
        )}

  {selectedPanel !== 'Leave Report' && (
    <>
      <div className="overflow-auto">
        {/* Build a wide table aggregated by employee and leave type */}
        <table className="min-w-full text-sm table-auto">
          <thead>
            <tr className="bg-gray-50">
              <th rowSpan={2} className="p-2">Emp ID</th>
              <th rowSpan={2} className="p-2">Emp Name</th>
              <th rowSpan={2} className="p-2">Position</th>
              <th rowSpan={2} className="p-2">Leave Group</th>
              <th rowSpan={2} className="p-2">Joining Date</th>
              <th rowSpan={2} className="p-2">Leaving Date</th>
              {leaveTypes.map(lt => (
                <th key={lt.leave_code} colSpan={4} className="p-2 text-center">{lt.leave_name} ({lt.leave_code})</th>
              ))}
            </tr>
            <tr className="bg-gray-50">
              {leaveTypes.map(lt => (
                <React.Fragment key={lt.leave_code + '_sub'}>
                  <th className="p-1 text-xs">Start</th>
                  <th className="p-1 text-xs">Alloc</th>
                  <th className="p-1 text-xs">Used</th>
                  <th className="p-1 text-xs">End</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {profiles.length === 0 ? (
              <tr><td colSpan={6 + leaveTypes.length * 4} className="py-6 text-center text-gray-500">No employees</td></tr>
            ) : profiles.filter(emp => !filterEmp || String(emp.id) === String(filterEmp)).map(emp => {
              const rowCells = leaveTypes.map(lt => {
                const alloc = allocations.find(a => (
                  String(a.emp_id ?? a.profile ?? '') === String(emp.id) || String(a.emp_id ?? a.profile ?? '') === String(emp.emp_id)
                ) && (
                  String(a.leave_type) === String(lt.leave_code) || String(a.leave_code) === String(lt.leave_code)
                ));

                let start = 0;
                const code = String(lt.leave_code || '').toLowerCase();
                if (code.startsWith('el')) start = Number(emp.el_balance || 0);
                else if (code.startsWith('sl')) start = Number(emp.sl_balance || 0);
                else if (code.startsWith('cl')) start = Number(emp.cl_balance || 0);
                else start = Number(emp.vacation_balance || 0);

                let allocated = 0;
                if (alloc) {
                  allocated = Number(alloc.allocated ?? alloc.allocated_amount ?? alloc.allocated_el ?? alloc.allocated_cl ?? alloc.allocated_sl ?? alloc.allocated_vac ?? 0);
                }

                let used = 0;
                if (alloc) {
                  used = Number(alloc.used ?? alloc.used_days ?? 0);
                }

                const end = +(start + allocated - used).toFixed(2);
                return { start, allocated, used, end };
              });
              return (
                <tr key={emp.id} className="border-b hover:bg-gray-50">
                  <td className="p-2">{emp.emp_id}</td>
                  <td className="p-2">{emp.emp_name}</td>
                  <td className="p-2">{emp.emp_designation}</td>
                  <td className="p-2">{emp.leave_group}</td>
                  <td className="p-2">{emp.actual_joining || emp.emp_birth_date || ''}</td>
                  <td className="p-2">{emp.left_date || 'Cont'}</td>
                  {rowCells.map((c, idx) => (
                    <React.Fragment key={idx}>
                      <td className="p-1 text-right">{c.start}</td>
                      <td className="p-1 text-right">{c.allocated}</td>
                      <td className="p-1 text-right">{c.used}</td>
                      <td className="p-1 text-right">{c.end}</td>
                    </React.Fragment>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Editable allocations list for managers */}
      <div className="mt-4 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Allocations (editable)</div>
          <div className="text-sm text-gray-500">{allocations.length} allocation(s)</div>
        </div>

        {allocations.length === 0 ? (
          <div className="text-gray-500">No allocations for selected period</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-2 px-3 text-left">Emp ID</th>
                  <th className="py-2 px-3 text-left">Leave Code</th>
                  <th className="py-2 px-3 text-left">Period ID</th>
                  <th className="py-2 px-3 text-left">CL</th>
                  <th className="py-2 px-3 text-left">SL</th>
                  <th className="py-2 px-3 text-left">EL</th>
                  <th className="py-2 px-3 text-left">VAC</th>
                  <th className="py-2 px-3 text-left">Start Date</th>
                  <th className="py-2 px-3 text-left">End Date</th>
                  <th className="py-2 px-3 text-left">Allocated</th>
                  <th className="py-2 px-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {allocations.map((a) => {
                  const edit = allocEdits[a.id] || {};
                  const cur = {
                    allocated: typeof edit.allocated !== 'undefined' ? edit.allocated : (a.allocated ?? a.allocated_amount ?? ''),
                    allocated_cl: typeof edit.allocated_cl !== 'undefined' ? edit.allocated_cl : (a.allocated_cl ?? ''),
                    allocated_sl: typeof edit.allocated_sl !== 'undefined' ? edit.allocated_sl : (a.allocated_sl ?? ''),
                    allocated_el: typeof edit.allocated_el !== 'undefined' ? edit.allocated_el : (a.allocated_el ?? ''),
                    allocated_vac: typeof edit.allocated_vac !== 'undefined' ? edit.allocated_vac : (a.allocated_vac ?? ''),
                    allocated_start_date: typeof edit.allocated_start_date !== 'undefined' ? edit.allocated_start_date : (a.allocated_start_date ?? ''),
                    allocated_end_date: typeof edit.allocated_end_date !== 'undefined' ? edit.allocated_end_date : (a.allocated_end_date ?? ''),
                  };
                  const empIdRaw = a.emp_id || (typeof a.profile === 'string' ? a.profile : a.profile?.emp_id) || null;
                  const isForAll = !empIdRaw;
                  const empIdDisplay = isForAll ? 'All' : empIdRaw;

                  // For employee-specific allocations: show emp_id, leave_code, allocated, start/end dates
                  // For default allocations (emp_id=null/All): show only CL/SL/EL/VAC and start/end dates
                  return (
                    <tr key={a.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3">{empIdDisplay}</td>
                      <td className="py-2 px-3">{isForAll ? '' : (a.leave_type?.leave_code || a.leave_code || a.leave_type_name || a.leave_type || '')}</td>
                      <td className="py-2 px-3">{a.period_id || a.period?.id || a.period}</td>
                      <td className="py-2 px-3">
                        <input placeholder="CL" type="number" step="0.5" value={cur.allocated_cl ?? ''} onChange={e => setAllocEdits(prev => ({ ...prev, [a.id]: { ...(prev[a.id]||{}), allocated_cl: e.target.value } }))} className="border rounded p-1 w-20 text-sm" />
                      </td>
                      <td className="py-2 px-3">
                        <input placeholder="SL" type="number" step="0.5" value={cur.allocated_sl ?? ''} onChange={e => setAllocEdits(prev => ({ ...prev, [a.id]: { ...(prev[a.id]||{}), allocated_sl: e.target.value } }))} className="border rounded p-1 w-20 text-sm" />
                      </td>
                      <td className="py-2 px-3">
                        <input placeholder="EL" type="number" step="0.5" value={cur.allocated_el ?? ''} onChange={e => setAllocEdits(prev => ({ ...prev, [a.id]: { ...(prev[a.id]||{}), allocated_el: e.target.value } }))} className="border rounded p-1 w-20 text-sm" />
                      </td>
                      <td className="py-2 px-3">
                        <input placeholder="VAC" type="number" step="0.5" value={cur.allocated_vac ?? ''} onChange={e => setAllocEdits(prev => ({ ...prev, [a.id]: { ...(prev[a.id]||{}), allocated_vac: e.target.value } }))} className="border rounded p-1 w-20 text-sm" />
                      </td>
                      <td className="py-2 px-3">
                        <input placeholder="Start dd-mm-yyyy" type="text" value={cur.allocated_start_date ?? ''} onChange={e => setAllocEdits(prev => ({ ...prev, [a.id]: { ...(prev[a.id]||{}), allocated_start_date: e.target.value } }))} className="border rounded p-1 w-32 text-sm" />
                      </td>
                      <td className="py-2 px-3">
                        <input placeholder="End dd-mm-yyyy" type="text" value={cur.allocated_end_date ?? ''} onChange={e => setAllocEdits(prev => ({ ...prev, [a.id]: { ...(prev[a.id]||{}), allocated_end_date: e.target.value } }))} className="border rounded p-1 w-32 text-sm" />
                      </td>
                      <td className="py-2 px-3">
                        {isForAll ? '' : (
                          <input type="number" step="0.5" value={cur.allocated ?? ''} onChange={e => setAllocEdits(prev => ({ ...prev, [a.id]: { ...(prev[a.id]||{}), allocated: e.target.value } }))} className="border rounded p-1 w-28 text-sm" />
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {(user && (user.is_staff || user.is_superuser)) ? (
                          <button onClick={() => handleSaveAllocation(a.id)} className="px-2 py-1 rounded bg-green-600 text-white text-sm">Save</button>
                        ) : (<span className="text-xs text-gray-400">No access</span>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )}

  {selectedPanel === 'Balance Certificate' && (
          <div className="p-4">
            {myBalances.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {myBalances.map(b => (
                  <div key={b.leave_type} className="border rounded p-2">
                    <div className="text-sm font-semibold">{b.leave_type_name} ({b.leave_type})</div>
                    <div className="text-xs">Allocated: {b.allocated}</div>
                    <div className="text-xs">Used: {b.used}</div>
                    <div className="text-xs">Balance: {b.balance}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500">No leave allocations found for current period</div>
            )}
          </div>
        )}

      </div>

    </div>
  );
};

export default EmpLeavePage;
