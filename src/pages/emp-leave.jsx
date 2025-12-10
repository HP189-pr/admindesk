/** FINAL UPDATED EmpLeavePage.jsx — NEW LEAVE SYSTEM READY **/

import React, { useEffect, useState } from 'react';
import axios from '../api/axiosInstance';
import { useAuth } from '../hooks/AuthContext';
import { FaUserTie, FaChevronUp, FaChevronDown } from 'react-icons/fa';

/* ----------------------------------------
   Helper: Normalize backend arrays
---------------------------------------- */
const normalize = (data) => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.results && Array.isArray(data.results)) return data.results;
  return [];
};

/* ----------------------------------------
   Date Helpers
---------------------------------------- */
const parseDMY = (s) => {
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); // yyyy-mm-dd
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/); // dd-mm-yyyy
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

const EmpLeavePage = () => {
  const { user } = useAuth();

  /* ----------------------------------------
     State
  ---------------------------------------- */
  const [leaveEntries, setLeaveEntries] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');

  const [profile, setProfile] = useState(null);

  const [allocations, setAllocations] = useState([]);
  const [computedReport, setComputedReport] = useState(null);
  const [allocEdits, setAllocEdits] = useState({});

  const [form, setForm] = useState({
    report_no: '',
    emp_id: '',
    emp_name: '',
    leave_type: '',
    start_date: '',
    end_date: '',
    remark: '',
    total_days: '',
    status: ''
  });

  const [filterEmp, setFilterEmp] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [editingId, setEditingId] = useState(null);

  const [myBalances, setMyBalances] = useState([]);

  const PANELS = ['Entry Leave', 'Leave Report', 'Balance Certificate'];
  const [selectedPanel, setSelectedPanel] = useState('Entry Leave');
  const [panelOpen, setPanelOpen] = useState(true);

  /* ----------------------------------------
     Load Leave Types
  ---------------------------------------- */
  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get('/api/leavetype/');
        setLeaveTypes(normalize(r.data));
      } catch (e) {
        const r2 = await axios.get('/api/leavetype-compat/');
        setLeaveTypes(normalize(r2.data));
      }
    })();
  }, []);

  /* ----------------------------------------
     Load Leave Periods
  ---------------------------------------- */
  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get('/api/leaveperiods/');
        const pd = normalize(r.data);
        setPeriods(pd);
        if (pd.length > 0) setSelectedPeriod(String(pd[0].id));
      } catch (e) {
        const r2 = await axios.get('/api/leaveperiods-compat/');
        const pd = normalize(r2.data);
        setPeriods(pd);
        if (pd.length > 0) setSelectedPeriod(String(pd[0].id));
      }
    })();
  }, []);

  /* ----------------------------------------
     Load Profiles
  ---------------------------------------- */
  useEffect(() => {
    axios.get('/api/empprofile/')
      .then((r) => {
        const arr = normalize(r.data);
        setProfiles(arr);
        const me = arr.find(
          (p) =>
            String(p.username) === String(user?.username) ||
            String(p.usercode) === String(user?.username) ||
            String(p.emp_id) === String(user?.username)
        );
        setProfile(me || null);
      })
      .catch(() => setProfiles([]));
  }, [user]);

  /* ----------------------------------------
     Load Leave Entries
  ---------------------------------------- */
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

  /* ----------------------------------------
     Load My Balances Once Profile Exists
  ---------------------------------------- */
  useEffect(() => {
    if (!profile) return;
    (async () => {
      try {
        const r = await axios.get('/api/my-leave-balance/');
        // server gives object, not array → wrap into array
        setMyBalances(Array.isArray(r.data) ? r.data : []);
      } catch (_) {
        setMyBalances([]);
      }
    })();
  }, [profile]);

  /* ----------------------------------------
     Load Allocations + Computed Report when period/panel changes
  ---------------------------------------- */
  useEffect(() => {
    const loadAlloc = async () => {
      let params = selectedPeriod ? `?period=${selectedPeriod}` : '';
      try {
        const r = await axios.get(`/api/leave-allocations${params}`);
        setAllocations(normalize(r.data));
      } catch (e) {
        setAllocations([]);
      }
    };

    const loadReport = async () => {
      let params = selectedPeriod ? `?period=${selectedPeriod}` : '';
      try {
        const r = await axios.get(`/api/leave-report${params}`);
        setComputedReport(r.data);
      } catch (e) {
        try {
          const r2 = await axios.get(`/api/reports/leave-balance${params}`);
          setComputedReport(r2.data);
        } catch (_) {
          setComputedReport(null);
        }
      }
    };

    loadAlloc();
    if (selectedPanel === 'Leave Report') loadReport();
  }, [selectedPanel, selectedPeriod]);

  /* ----------------------------------------
     Handle Form Change
  ---------------------------------------- */
  const computeDays = (s, e) => {
    const a = parseDMY(s);
    const b = parseDMY(e);
    if (!a || !b) return '';
    return Math.max(1, Math.round((b - a) / 86400000) + 1);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => {
      const n = { ...f, [name]: value };
      if (name === 'start_date' || name === 'end_date') {
        n.total_days = computeDays(n.start_date, n.end_date);
      }
      return n;
    });
  };

  /* ----------------------------------------
     Save Leave Entry
  ---------------------------------------- */
  const handleApply = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        leave_report_no: form.report_no || null,
        emp: form.emp_id,
        leave_type: form.leave_type,
        start_date: toISO(form.start_date),
        end_date: toISO(form.end_date),
        remark: form.remark,
        status: form.status,
      };

      if (editingId) await axios.patch(`/api/leaveentry/${editingId}/`, payload);
      else await axios.post('/api/leaveentry/', payload);

      const r = await axios.get('/api/leaveentry/');
      setLeaveEntries(normalize(r.data));

      setForm({ report_no: '', emp_id: '', emp_name: '', leave_type: '', start_date: '', end_date: '', remark: '', total_days: '', status: '' });
      setEditingId(null);
    } catch (err) {
      alert('Failed to save leave entry');
    }
  };

  /* ----------------------------------------
     Filtering Entries
  ---------------------------------------- */
  const parseReport = (rrn) => {
    if (!rrn) return { year: null, seq: 0 };
    const s = String(rrn);

    let m = s.match(/^(\d{2})[_-](\d+)$/);
    if (m) return { year: 2000 + Number(m[1]), seq: Number(m[2]) };

    m = s.match(/^(\d{2})(\d+)$/);
    if (m) return { year: 2000 + Number(m[1]), seq: Number(m[2]) };

    return { year: null, seq: 0 };
  };

  const filteredEntries = (leaveEntries || [])
    .filter((le) => {
      if (filterEmp && String(le.emp) !== String(filterEmp)) return false;
      if (yearFilter) {
        const y = parseReport(le.leave_report_no).year;
        if (String(y) !== String(yearFilter)) return false;
      }
      if (monthFilter) {
        const m = (new Date(le.start_date)).getMonth() + 1;
        if (String(m) !== String(monthFilter)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const A = parseReport(a.leave_report_no);
      const B = parseReport(b.leave_report_no);
      if (A.year !== B.year) return B.year - A.year;
      return B.seq - A.seq;
    });

  /* ----------------------------------------
     UI Panels
  ---------------------------------------- */

  const LastLeaveRecords = () => (
    <div className="border rounded-xl overflow-hidden mt-4">
      <div className="p-3 border-b bg-gray-50 flex justify-between">
        <div className="font-semibold">Last Leave Records</div>
        <button
          onClick={() => axios.get('/api/leaveentry/').then(r => setLeaveEntries(normalize(r.data)))}
          className="text-sm px-3 py-1 bg-blue-600 text-white rounded"
        >
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="p-3 bg-white border-b flex gap-3">
        <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} className="border p-1 rounded text-sm">
          <option value="">All Years</option>
          {[...new Set(leaveEntries.map(le => parseReport(le.leave_report_no).year).filter(Boolean))]
            .sort((a, b) => b - a)
            .map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="border p-1 rounded text-sm">
          <option value="">All Months</option>
          {Array.from({ length: 12 }).map((_, i) => (
            <option key={i} value={i + 1}>{i + 1}</option>
          ))}
        </select>
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
              <tr
                key={le.id}
                className="border-b cursor-pointer hover:bg-gray-50"
                onClick={() => {
                  const p = profiles.find(p => String(p.emp_id) === String(le.emp));
                  setForm({
                    report_no: le.leave_report_no,
                    emp_id: p?.emp_id || '',
                    emp_name: le.emp_name,
                    leave_type: le.leave_type,
                    start_date: le.start_date,
                    end_date: le.end_date,
                    remark: le.remark || le.reason || '',
                    total_days: le.total_days,
                    status: le.status
                  });
                  setEditingId(le.id);
                  setSelectedPanel('Entry Leave');
                  setPanelOpen(true);
                }}
              >
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

      <div className="text-xs p-2 bg-gray-50 text-gray-500">
        Click a row to edit it in the Add panel.
      </div>
    </div>
  );

  /* ----------------------------------------
     Report View — Uses Allocations + Computed Report
  ---------------------------------------- */
  const ReportView = () => {
    return (
      <div className="p-4">
        {/* Period Selector */}
        <div className="flex justify-between items-center mb-4">
          <div className="font-semibold text-lg">Leave Report</div>

          <div className="flex gap-2 items-center">
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="border p-1 rounded text-sm"
            >
              <option value="">All</option>
              {periods.map(p => (
                <option key={p.id} value={p.id}>{p.period_name}</option>
              ))}
            </select>

            <button onClick={() => window.print()} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">
              Generate PDF
            </button>
          </div>
        </div>

        {/* Aggregated Table */}
        <div className="overflow-auto">
          <table className="min-w-full text-sm border">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2">Emp ID</th>
                <th className="p-2">Name</th>
                <th className="p-2">Designation</th>
                <th className="p-2">Leave Group</th>
                <th className="p-2">Joining</th>
                <th className="p-2">Leaving</th>
                <th className="p-2">CL Alloc</th>
                <th className="p-2">SL Alloc</th>
                <th className="p-2">EL Alloc</th>
                <th className="p-2">VAC Alloc</th>
              </tr>
            </thead>
            <tbody>
              {(profiles || []).map((emp) => {
                const empAllocs = allocations.filter(
                  a =>
                    String(a.emp_id) === String(emp.emp_id) &&
                    (!selectedPeriod || String(a.period) === String(selectedPeriod))
                );

                const getAlloc = (code) => {
                  const x = empAllocs.find(a => a.leave_code?.toLowerCase().startsWith(code.toLowerCase()));
                  return x ? x.allocated : 0;
                };

                return (
                  <tr key={emp.id} className="border-b hover:bg-gray-50">
                    <td className="p-2">{emp.emp_id}</td>
                    <td className="p-2">{emp.emp_name}</td>
                    <td className="p-2">{emp.emp_designation}</td>
                    <td className="p-2">{emp.leave_group}</td>
                    <td className="p-2">{emp.actual_joining}</td>
                    <td className="p-2">{emp.left_date || 'Cont'}</td>

                    <td className="p-2 text-right">{getAlloc('CL')}</td>
                    <td className="p-2 text-right">{getAlloc('SL')}</td>
                    <td className="p-2 text-right">{getAlloc('EL')}</td>
                    <td className="p-2 text-right">{getAlloc('VAC')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Editable Allocations Section */}
        <div className="mt-6">
          <div className="font-semibold mb-2">Allocations (Manager Editable)</div>

          <div className="overflow-auto">
            <table className="min-w-full text-sm border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 text-left">Emp ID</th>
                  <th className="p-2 text-left">Leave Code</th>
                  <th className="p-2 text-left">Period</th>
                  <th className="p-2 text-left">Allocated</th>
                  <th className="p-2 text-left">Start</th>
                  <th className="p-2 text-left">End</th>
                  <th className="p-2 text-left">Save</th>
                </tr>
              </thead>

              <tbody>
                {allocations.map((a) => {
                  const edit = allocEdits[a.id] || {};
                  const cur = {
                    allocated: edit.allocated ?? a.allocated ?? '',
                    allocated_start_date: edit.allocated_start_date ?? a.allocated_start_date ?? '',
                    allocated_end_date: edit.allocated_end_date ?? a.allocated_end_date ?? ''
                  };

                  return (
                    <tr key={a.id} className="border-b hover:bg-gray-50">
                      <td className="p-2">{a.emp_id || 'All'}</td>
                      <td className="p-2">{a.leave_code}</td>
                      <td className="p-2">{a.period}</td>

                      <td className="p-2">
                        <input
                          type="number"
                          step="0.5"
                          className="border rounded p-1 w-24"
                          value={cur.allocated}
                          onChange={(e) =>
                            setAllocEdits((pr) => ({
                              ...pr,
                              [a.id]: { ...(pr[a.id] || {}), allocated: e.target.value },
                            }))
                          }
                        />
                      </td>

                      <td className="p-2">
                        <input
                          placeholder="dd-mm-yyyy"
                          className="border rounded p-1 w-28"
                          value={cur.allocated_start_date}
                          onChange={(e) =>
                            setAllocEdits((pr) => ({
                              ...pr,
                              [a.id]: { ...(pr[a.id] || {}), allocated_start_date: e.target.value },
                            }))
                          }
                        />
                      </td>

                      <td className="p-2">
                        <input
                          placeholder="dd-mm-yyyy"
                          className="border rounded p-1 w-28"
                          value={cur.allocated_end_date}
                          onChange={(e) =>
                            setAllocEdits((pr) => ({
                              ...pr,
                              [a.id]: { ...(pr[a.id] || {}), allocated_end_date: e.target.value },
                            }))
                          }
                        />
                      </td>

                      <td className="p-2">
                        {user?.is_staff || user?.is_superuser ? (
                          <button
                            onClick={async () => {
                              try {
                                await axios.patch(`/api/leave-allocations/${a.id}/`, {
                                  allocated: Number(cur.allocated || 0),
                                  allocated_start_date: toISO(cur.allocated_start_date),
                                  allocated_end_date: toISO(cur.allocated_end_date)
                                });
                                const r = await axios.get(`/api/leave-allocations?period=${selectedPeriod}`);
                                setAllocations(normalize(r.data));
                                setAllocEdits((pr) => {
                                  const nx = { ...pr };
                                  delete nx[a.id];
                                  return nx;
                                });
                              } catch (_) {
                                alert('Failed to update allocation');
                              }
                            }}
                            className="px-2 py-1 bg-green-600 text-white rounded text-xs"
                          >
                            Save
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">No Access</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    );
  };

  /* ----------------------------------------
     Balance Certificate View
  ---------------------------------------- */
  const BalanceCertificate = () => {
    return (
      <div className="p-4">
        <div className="font-semibold mb-2">Balance Certificate</div>
        {myBalances.length === 0 ? (
          <div className="text-gray-500 text-sm">No leave data.</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {myBalances.map((b) => (
              <div key={b.leave_type} className="border rounded p-3 text-sm bg-white shadow-sm">
                <div className="font-semibold">{b.leave_type_name}</div>
                <div>Allocated: {b.allocated}</div>
                <div>Used: {b.used}</div>
                <div>Balance: {b.balance}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  /* ----------------------------------------
     PAGE RETURN
  ---------------------------------------- */
  const handleTopbar = (p) => {
    if (selectedPanel === p) setPanelOpen((o) => !o);
    else {
      setSelectedPanel(p);
      setPanelOpen(true);
    }
  };

  return (
    <div className="p-4">
      {/* TOPBAR */}
      <div className="sticky top-0 bg-white border-b z-30 flex justify-between items-center py-2 px-3">
        <div className="flex gap-2 items-center">
          <FaUserTie className="text-indigo-700 text-2xl" />
          <span className="font-bold text-lg">Leave Management</span>

          {PANELS.map((p) => (
            <button
              key={p}
              onClick={() => handleTopbar(p)}
              className={`px-3 py-1.5 rounded border text-sm ${
                selectedPanel === p
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white border-gray-300 hover:bg-gray-50'
              }`}
            >
              {p === 'Entry Leave' ? 'Add' : p === 'Leave Report' ? 'Report' : 'Balance'}
            </button>
          ))}
        </div>

        <a href="/" className="px-4 py-2 rounded bg-gray-800 text-white">🏠 Home</a>
      </div>

      {/* PANEL CONTAINER */}
      <div className="mt-4 border rounded-xl shadow-sm">
        <div className="flex justify-between items-center px-3 py-2 bg-gray-50 border-b">
          <div className="font-semibold">{selectedPanel} Panel</div>
          <button
            onClick={() => setPanelOpen((o) => !o)}
            className="px-2 py-1 text-sm border rounded bg-white hover:bg-gray-50 flex items-center gap-1"
          >
            {panelOpen ? <FaChevronUp /> : <FaChevronDown />} {panelOpen ? 'Collapse' : 'Expand'}
          </button>
        </div>

        {/* MAIN CONTENT */}
        {selectedPanel === 'Leave Report'
          ? <ReportView />
          : selectedPanel === 'Balance Certificate'
          ? <BalanceCertificate />
          : <LastLeaveRecords />
        }

        {/* ENTRY FORM */}
        {selectedPanel === 'Entry Leave' && panelOpen && (
          <div className="p-4 bg-white border-t">
            <form onSubmit={handleApply} className="grid grid-cols-1 md:grid-cols-3 gap-3">

              <div>
                <label className="text-xs">Report No</label>
                <input
                  name="report_no"
                  value={form.report_no}
                  onChange={handleChange}
                  className="w-full border rounded p-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs">Employee ID</label>
                <select
                  name="emp_id"
                  value={form.emp_id}
                  onChange={(e) => {
                    handleChange(e);
                    const p = profiles.find((pp) => String(pp.emp_id) === String(e.target.value));
                    if (p) setForm((f) => ({ ...f, emp_name: p.emp_name }));
                  }}
                  className="w-full border rounded p-2 text-sm"
                >
                  <option value="">-- select --</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.emp_id}>
                      {p.emp_id} - {p.emp_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs">Employee Name</label>
                <input
                  name="emp_name"
                  value={form.emp_name}
                  onChange={handleChange}
                  className="w-full border rounded p-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs">Start Date</label>
                <input
                  name="start_date"
                  value={form.start_date}
                  onChange={handleChange}
                  placeholder="dd-mm-yyyy"
                  className="w-full border rounded p-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs">End Date</label>
                <input
                  name="end_date"
                  value={form.end_date}
                  onChange={handleChange}
                  placeholder="dd-mm-yyyy"
                  className="w-full border rounded p-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs">Leave Type</label>
                <select
                  name="leave_type"
                  value={form.leave_type}
                  onChange={handleChange}
                  className="w-full border rounded p-2 text-sm"
                >
                  <option value="">-- select --</option>
                  {leaveTypes.map((lt) => (
                    <option key={lt.leave_code} value={lt.leave_code}>
                      {lt.leave_name} ({lt.leave_code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs">Total Days</label>
                <input
                  name="total_days"
                  value={form.total_days}
                  readOnly
                  className="w-full border rounded p-2 text-sm bg-gray-50"
                />
              </div>

              <div>
                <label className="text-xs">Status</label>
                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  className="w-full border rounded p-2 text-sm"
                >
                  <option value="">Draft</option>
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="text-xs">Remark</label>
                <input
                  name="remark"
                  value={form.remark}
                  onChange={handleChange}
                  className="w-full border rounded p-2 text-sm"
                />
              </div>

              <div className="md:col-span-3 flex gap-3">
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">
                  {editingId ? 'Save' : 'Add'}
                </button>
                <button
                  type="button"
                  className="px-4 py-2 border rounded"
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
                      status: ''
                    });
                    setEditingId(null);
                  }}
                >
                  Clear
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmpLeavePage;
