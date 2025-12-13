// EmpLeavePage.jsx
import React, { useEffect, useState, Suspense, useMemo } from 'react';
import axios from '../api/axiosInstance';
import { useAuth } from '../hooks/AuthContext';
import { FaUserTie, FaChevronUp, FaChevronDown } from 'react-icons/fa';

// Lazy load the report page (keeps main bundle smaller)
const LeaveReport = React.lazy(() => import('../report/LeaveReport'));
const LeaveBalance = React.lazy(() => import('../report/LeaveBalance'));
const LeaveCalendar = React.lazy(() => import('../report/LeaveCalendar'));

const normalize = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.results && Array.isArray(data.results)) return data.results;
  return [];
};

const parseDMY = (s) => {
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return null;
};

const fmtDate = (d) => {
  if (!d) return '';
  const dt = parseDMY(d) || new Date(d);
  if (!dt || dt.toString() === 'Invalid Date') return '';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yy = dt.getFullYear();
  return `${dd}-${mm}-${yy}`;
};

const toISO = (s) => {
  const d = parseDMY(s);
  return d ? d.toISOString().slice(0, 10) : null;
};

function getFiscalYear(dateInput) {
  const dt = dateInput instanceof Date ? dateInput : parseDMY(dateInput) || new Date(dateInput);
  if (!dt || dt.toString() === 'Invalid Date') return null;
  return (dt.getMonth() + 1) >= 6 ? dt.getFullYear() : dt.getFullYear() - 1;
}

function formatFiscalLabel(year) {
  if (year == null) return '';
  const next = String(year + 1).slice(-2);
  return `${year}-${next}`;
}

const EmpLeavePage = () => {
  const { user } = useAuth();
  const baseFieldClass = 'w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';
  const readOnlyFieldClass = `${baseFieldClass} bg-gray-50`;

  // state
  const [leaveEntries, setLeaveEntries] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    report_no: '',
    emp_id: '',
    emp_name: '',
    leave_type: '',
    start_date: '',
    end_date: '',
    remark: '',
    total_days: '',
    status: '',
    sandwich_leave: ''
  });
  const [filterEmp, setFilterEmp] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recordSearch, setRecordSearch] = useState('');

  const currentFiscalYear = useMemo(() => getFiscalYear(new Date()), []);

  const availableYears = useMemo(() => {
    const ys = new Set();
    if (currentFiscalYear) ys.add(currentFiscalYear);
    (leaveEntries || []).forEach((le) => {
      const fy = getFiscalYear(le.start_date);
      if (fy) ys.add(fy);
    });
    return Array.from(ys).sort((a, b) => b - a);
  }, [leaveEntries, currentFiscalYear]);

  useEffect(() => {
    if (yearFilter) return;
    if (availableYears.includes(currentFiscalYear)) {
      setYearFilter(String(currentFiscalYear));
    } else if (availableYears.length) {
      setYearFilter(String(availableYears[0]));
    }
  }, [availableYears, yearFilter, currentFiscalYear]);

  const PANELS = ['Entry Leave', 'Leave Report', 'Balance Certificate', 'Calander View'];
  const [selectedPanel, setSelectedPanel] = useState('Entry Leave');
  const [panelOpen, setPanelOpen] = useState(true);

  // load leave types
  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get('/api/leavetype/');
        setLeaveTypes(normalize(r.data));
      } catch (e) {
        try {
          const r2 = await axios.get('/api/leavetype-compat/');
          setLeaveTypes(normalize(r2.data));
        } catch (_) {
          setLeaveTypes([]);
        }
      }
    })();
  }, []);

  // periods (auto-select active if present)
  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get('/api/leave-periods/');
        const pd = normalize(r.data);
        setPeriods(pd);
        // Auto-select first period
        if (pd.length) setSelectedPeriod(String(pd[0].id));
      } catch (e) {
        console.error('Failed to load periods:', e);
        setPeriods([]);
      }
    })();
  }, []);

  // profiles
  useEffect(() => {
    axios.get('/api/empprofile/').then(r => {
      const arr = normalize(r.data);
      setProfiles(arr);
      const me = arr.find(
        (p) => String(p.username) === String(user?.username) ||
               String(p.usercode) === String(user?.username) ||
               String(p.emp_id) === String(user?.username)
      );
      setProfile(me || null);
    }).catch(() => setProfiles([]));
  }, [user]);

  // leave entries
  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get('/api/leaveentry/');
        setLeaveEntries(normalize(r.data));
      } catch (e) {
        try {
          const r2 = await axios.get('/api/leave_entry/');
          setLeaveEntries(normalize(r2.data));
        } catch (_) {
          setLeaveEntries([]);
        }
      }
    })();
  }, []);

  // form helpers
  const computeDays = (s, e) => {
    const a = parseDMY(s);
    const b = parseDMY(e);
    if (!a || !b) return '';
    return Math.max(1, Math.round((b - a) / 86400000) + 1);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => {
      const n = { ...f, [name]: value };
      if (name === 'start_date' || name === 'end_date') n.total_days = computeDays(n.start_date, n.end_date);
      return n;
    });
  };

  const handleApply = async (ev) => {
    ev.preventDefault();
    setLoading(true);
    try {
      const payload = {
        leave_report_no: form.report_no || null,
        emp: form.emp_id || null,
        leave_type: form.leave_type || null,
        start_date: toISO(form.start_date),
        end_date: toISO(form.end_date),
        remark: form.remark || null,
        status: form.status || null,
        sandwich_leave:
          form.sandwich_leave === 'yes'
            ? true
            : form.sandwich_leave === 'no'
              ? false
              : null
      };
      if (editingId) await axios.patch(`/api/leaveentry/${editingId}/`, payload);
      else await axios.post('/api/leaveentry/', payload);

      const r = await axios.get('/api/leaveentry/');
      setLeaveEntries(normalize(r.data));
      setForm({
        report_no: '',
        emp_id: '',
        emp_name: '',
        leave_type: '',
        start_date: '',
        end_date: '',
        remark: '',
        total_days: '',
        status: '',
        sandwich_leave: ''
      });
      setEditingId(null);
    } catch (err) {
      console.error(err);
      alert('Failed to save leave entry');
    } finally {
      setLoading(false);
    }
  };

  // filtering and parsed report helpers
  function parseReport(rrn) {
    if (!rrn) return { year: null, seq: 0 };
    const s = String(rrn);
    let m = s.match(/^(\d{2})[_-](\d+)$/);
    if (m) return { year: 2000 + Number(m[1]), seq: Number(m[2]) };
    m = s.match(/^(\d{2})(\d+)$/);
    if (m) return { year: 2000 + Number(m[1]), seq: Number(m[2]) };
    return { year: null, seq: 0 };
  }

  const getReportOrderValue = (rrn) => {
    if (!rrn) return 0;
    const numeric = Number(String(rrn).replace(/[^0-9]/g, ''));
    if (!Number.isNaN(numeric) && numeric > 0) return numeric;
    const parsed = parseReport(rrn);
    if (parsed.year && parsed.seq) return parsed.year * 10000 + parsed.seq;
    return 0;
  };

  const filteredEntries = useMemo(() => {
    return (leaveEntries || [])
      .filter((le) => {
        if (filterEmp && String(le.emp) !== String(filterEmp)) return false;
        if (yearFilter) {
          const fy = getFiscalYear(le.start_date);
          if (String(fy) !== String(yearFilter)) return false;
        }
        if (monthFilter) {
          const m = (new Date(le.start_date)).getMonth() + 1;
          if (String(m) !== String(monthFilter)) return false;
        }
        if (recordSearch.trim()) {
          const q = recordSearch.trim().toLowerCase();
          const reportHit = String(le.leave_report_no || '').toLowerCase().includes(q);
          const empIdHit = String(le.emp || '').toLowerCase().includes(q);
          const empNameHit = String(le.emp_name || '').toLowerCase().includes(q);
          if (!reportHit && !empIdHit && !empNameHit) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const orderA = getReportOrderValue(a.leave_report_no);
        const orderB = getReportOrderValue(b.leave_report_no);
        if (orderA !== orderB) return orderB - orderA;
        const startA = new Date(a.start_date).getTime() || 0;
        const startB = new Date(b.start_date).getTime() || 0;
        return startB - startA;
      });
  }, [leaveEntries, filterEmp, yearFilter, monthFilter, recordSearch]);

  const handleTopbar = (p) => {
    if (selectedPanel === p) setPanelOpen(o => !o);
    else {
      setSelectedPanel(p);
      setPanelOpen(true);
    }
  };

  return (
    <div className="p-4">
      {/* topbar */}
      <div className="sticky top-0 bg-white border-b z-30 flex justify-between items-center py-2 px-3">
        <div className="flex gap-2 items-center">
          <FaUserTie className="text-indigo-700 text-2xl" />
          <span className="font-bold text-lg">Leave Management</span>
          {PANELS.map((p) => (
            <button
              key={p}
              onClick={() => handleTopbar(p)}
              className={`px-3 py-1.5 rounded border text-sm ${selectedPanel === p ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-300 hover:bg-gray-50'}`}
            >
              {p === 'Entry Leave'
                ? 'Add'
                : p === 'Leave Report'
                  ? 'Report'
                  : p === 'Calander View'
                    ? 'Calendar'
                    : 'Balance'}
            </button>
          ))}
        </div>
        <a href="/" className="px-4 py-2 rounded bg-gray-800 text-white">🏠 Home</a>
      </div>

      {/* panel container */}
      <div className="mt-4 border rounded-xl shadow-sm">
        <div className="flex justify-between items-center px-3 py-2 bg-gray-50 border-b">
          <div className="font-semibold">{selectedPanel} Panel</div>
          <button onClick={() => setPanelOpen(o => !o)} className="px-2 py-1 text-sm border rounded bg-white hover:bg-gray-50 flex items-center gap-1">
            {panelOpen ? <FaChevronUp /> : <FaChevronDown />} {panelOpen ? 'Collapse' : 'Expand'}
          </button>
        </div>

        {/* main content */}
        {selectedPanel === 'Leave Report' ? (
          <Suspense fallback={<div className="p-4">Loading report...</div>}>
            <LeaveReport user={user} defaultPeriod={selectedPeriod} onPeriodChange={setSelectedPeriod} />
          </Suspense>
        ) : selectedPanel === 'Balance Certificate' ? (
          <Suspense fallback={<div className="p-4">Loading balance...</div>}>
            <LeaveBalance user={user} defaultPeriod={selectedPeriod} onPeriodChange={setSelectedPeriod} />
          </Suspense>
        ) : selectedPanel === 'Calander View' ? (
          <Suspense fallback={<div className="p-4">Loading calendar...</div>}>
            <LeaveCalendar user={user} />
          </Suspense>
        ) : (
          // LastLeaveRecords (Entry Leave selected by default)
          <div>
            {/* Entry form moved to top */}
            <div className="bg-white border-b">
              <div className="p-4">
                <div className="flex flex-col gap-1">
                  <div className="text-lg font-semibold">Add Leave Entry</div>
                </div>

                <form onSubmit={handleApply} className="mt-4 space-y-4">
                  <div className="flex flex-col gap-3 md:flex-row">
                    <div className="flex flex-col gap-1 md:w-28">
                      <label className="text-xs text-gray-600">Report No</label>
                      <input
                        name="report_no"
                        value={form.report_no}
                        onChange={handleChange}
                        className={baseFieldClass}
                        placeholder="Auto"
                        maxLength={9}
                      />
                    </div>

                    <div className="flex flex-col gap-1 md:w-32">
                      <label className="text-xs text-gray-600">Employee ID</label>
                      <select
                        name="emp_id"
                        value={form.emp_id}
                        onChange={(e) => {
                          handleChange(e);
                          const p = profiles.find(pp => String(pp.emp_id) === String(e.target.value));
                          if (p) setForm(f => ({ ...f, emp_name: p.emp_name }));
                        }}
                        className={baseFieldClass}
                      >
                        <option value="">-- select --</option>
                        {profiles.map(p => (
                          <option key={p.id} value={p.emp_id} title={`${p.emp_id} - ${p.emp_name}`}>
                            {p.emp_id}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1 md:flex-1">
                      <label className="text-xs text-gray-600">Employee Name</label>
                      <input name="emp_name" value={form.emp_name} onChange={handleChange} className={baseFieldClass} />
                    </div>

                    <div className="flex flex-col gap-1 md:w-24">
                      <label className="text-xs text-gray-600">Sandwich Leave</label>
                      <select name="sandwich_leave" value={form.sandwich_leave} onChange={handleChange} className={baseFieldClass}>
                        <option value="">-- select --</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 md:flex-row">
                    <div className="flex flex-col gap-1 md:w-28">
                      <label className="text-xs text-gray-600">Start Date</label>
                      <input name="start_date" value={form.start_date} onChange={handleChange} placeholder="dd-mm-yyyy" className={baseFieldClass} />
                    </div>

                    <div className="flex flex-col gap-1 md:w-28">
                      <label className="text-xs text-gray-600">End Date</label>
                      <input name="end_date" value={form.end_date} onChange={handleChange} placeholder="dd-mm-yyyy" className={baseFieldClass} />
                    </div>

                    <div className="flex flex-col gap-1 md:w-40">
                      <label className="text-xs text-gray-600">Leave Type</label>
                      <select name="leave_type" value={form.leave_type} onChange={handleChange} className={baseFieldClass}>
                        <option value="">-- select --</option>
                        {leaveTypes.map(lt => (
                          <option key={lt.leave_code || lt.id} value={lt.leave_code || lt.id}>
                            {lt.leave_name || lt.name} ({lt.leave_code || lt.id})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1 md:w-24">
                      <label className="text-xs text-gray-600">Total Days</label>
                      <input
                        name="total_days"
                        value={form.total_days}
                        readOnly
                        className={readOnlyFieldClass}
                        maxLength={4}
                      />
                    </div>

                    <div className="flex flex-col gap-1 md:w-24">
                      <label className="text-xs text-gray-600">Status</label>
                      <select name="status" value={form.status} onChange={handleChange} className={`${baseFieldClass} border-gray-900 text-gray-900`}>
                        <option value="">Draft</option>
                        <option value="Pending">Pending</option>
                        <option value="Approved">Approved</option>
                        <option value="Rejected">Rejected</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1 md:flex-[1.2]">
                      <label className="text-xs text-gray-600">Remark</label>
                      <input name="remark" value={form.remark} onChange={handleChange} className={baseFieldClass} />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2 border-t border-gray-100">
                    <button type="submit" className="px-5 py-2 bg-indigo-600 text-white rounded shadow-sm hover:bg-indigo-500">{editingId ? 'Save' : 'Add'}</button>
                    <button
                      type="button"
                      className="px-5 py-2 border border-gray-300 rounded hover:bg-gray-50"
                      onClick={() => {
                        setForm({
                          report_no: '',
                          emp_id: '',
                          emp_name: '',
                          leave_type: '',
                          start_date: '',
                          end_date: '',
                          remark: '',
                          total_days: '',
                          status: '',
                          sandwich_leave: ''
                        });
                        setEditingId(null);
                      }}
                    >
                      Clear
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Last Leave Records panel */}
            <div className="border rounded-xl overflow-hidden mt-4">
              <div className="p-3 border-b bg-gray-50 flex justify-between">
                <div className="font-semibold">Last Leave Records</div>
                <button onClick={() => axios.get('/api/leaveentry/').then(r => setLeaveEntries(normalize(r.data)))} className="text-sm px-3 py-1 bg-blue-600 text-white rounded">Refresh</button>
              </div>

              <div className="p-3 bg-white border-b flex flex-col gap-3 md:flex-row md:items-center">
                <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} className="border p-1 rounded text-sm">
                  <option value="">All Years</option>
                  {availableYears.map((y) => (
                    <option key={y} value={y}>{formatFiscalLabel(y)}</option>
                  ))}
                </select>

                <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="border p-1 rounded text-sm">
                  <option value="">All Months</option>
                  {Array.from({ length: 12 }).map((_, i) => <option key={i} value={i+1}>{i+1}</option>)}
                </select>

                <input
                  type="text"
                  className="border rounded p-2 text-sm flex-1"
                  placeholder="Search by Report No or Employee ID"
                  value={recordSearch}
                  onChange={(e) => setRecordSearch(e.target.value)}
                />
              </div>

              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2">Report No</th>
                      <th className="p-2">Employee</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Dates</th>
                      <th className="p-2">Days</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-6 text-gray-500">No records</td></tr>
                    ) : filteredEntries.map((le) => (
                      <tr key={le.id} className="border-b cursor-pointer hover:bg-gray-50"
                        onClick={() => {
                          const p = profiles.find(px => String(px.emp_id) === String(le.emp));
                          setForm({
                            report_no: le.leave_report_no,
                            emp_id: p?.emp_id || '',
                            emp_name: le.emp_name,
                            leave_type: le.leave_type,
                            start_date: le.start_date,
                            end_date: le.end_date,
                            remark: le.remark || le.reason || '',
                            total_days: le.total_days,
                            status: le.status,
                            sandwich_leave:
                              le.sandwich_leave === true
                                ? 'yes'
                                : le.sandwich_leave === false
                                  ? 'no'
                                  : ''
                          });
                          setEditingId(le.id);
                          setSelectedPanel('Entry Leave');
                          setPanelOpen(true);
                        }}>
                        <td className="p-2">{le.leave_report_no}</td>
                        <td className="p-2">{le.emp_name}</td>
                        <td className="p-2">{le.leave_type_name || le.leave_type}</td>
                        <td className="p-2">{fmtDate(le.start_date)} - {fmtDate(le.end_date)}</td>
                        <td className="p-2">{le.total_days}</td>
                        <td className="p-2">{le.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="text-xs p-2 bg-gray-50 text-gray-500">Click a row to open it in the Add panel.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmpLeavePage;
