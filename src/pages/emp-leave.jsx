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
  const [form, setForm] = useState({ emp_id: '', leave_type: '', leave_type_code: '', start_date: '', end_date: '', reason: '', total_days: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterEmp, setFilterEmp] = useState('');
  const [myBalances, setMyBalances] = useState([]);
  const [allocations, setAllocations] = useState([]);

  const PANELS = ['Entry Leave', 'Leave Report', 'Balance Certificate'];
  const [selectedPanel, setSelectedPanel] = useState(PANELS[0]);
  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => {
    // Load leave types (prefer normal API, fall back to compat SQL-backed endpoint)
    axios.get('/api/leavetype/').then(r => {
      const data = r.data || [];
      // normalize shape: ensure leave_code & leave_name exist
      setLeaveTypes(data.map(lt => ({ leave_code: lt.leave_code || lt.id || lt.code, leave_name: lt.leave_name || lt.leave_name || lt.name, annual_allocation: lt.annual_allocation || lt.annual_limit || lt.allocation, day_value: lt.day_value || lt.leave_unit || 1 })));
    }).catch(async () => {
      try {
        const r2 = await axios.get('/api/leavetype-compat/');
        const data = r2.data || [];
        setLeaveTypes(data.map(lt => ({ leave_code: lt.leave_code || lt.id || lt.code, leave_name: lt.leave_name || lt.leave_name || lt.name, annual_allocation: lt.annual_allocation || lt.annual_limit || lt.allocation, day_value: lt.day_value || lt.leave_unit || 1 })));
      } catch (e) {
        setLeaveTypes([]);
      }
    });

    // Load leave periods with fallback
    axios.get('/api/leaveperiods/').then(r => { const pd = r.data || []; setPeriods(pd); const active = pd.find(p => p.is_active); if (active) setSelectedPeriod(String(active.id)); }).catch(async () => {
      try {
        const r2 = await axios.get('/api/leaveperiods-compat/'); const pd = r2.data || []; setPeriods(pd); const active = pd.find(p => p.is_active); if (active) setSelectedPeriod(String(active.id));
      } catch (e) { setPeriods([]); }
    });

    // Load employee profiles
    axios.get('/api/empprofile/').then(r => { setProfiles(r.data || []); const me = (r.data || []).find(p => p.userid === user?.username || String(p.emp_id) === String(user?.username)); setProfile(me || null); }).catch(() => setProfiles([]));

    // Load leave entries with a fallback to legacy table endpoint
    axios.get('/api/leaveentry/').then(r => setLeaveEntries(r.data || [])).catch(async () => {
      try {
        const r2 = await axios.get('/api/leave_entry/'); setLeaveEntries(r2.data || []);
      } catch (e) {
        setLeaveEntries([]);
      }
    });

    axios.get('/api/my-leave-balance/').then(r => setMyBalances(r.data || [])).catch(() => setMyBalances([]));
  }, [user]);

  useEffect(() => {
    // load allocations only when report panel is active
    if (selectedPanel === 'Leave Report') {
      const params = selectedPeriod ? `?period=${selectedPeriod}` : '';
      axios.get(`/api/leave-allocations/${params}`).then(r => setAllocations(r.data || [])).catch(async () => {
        try {
          // try legacy allocations endpoint
          const r2 = await axios.get(`/api/leavea_llocation_general/${params}`);
          setAllocations(r2.data || []);
        } catch (e) {
          setAllocations([]);
        }
      });
    }
  }, [selectedPanel]);

  // Reload allocations when period changes while report panel active
  useEffect(() => {
    if (selectedPanel === 'Leave Report') {
      const params = selectedPeriod ? `?period=${selectedPeriod}` : '';
      axios.get(`/api/leave-allocations/${params}`).then(r => setAllocations(r.data || [])).catch(async () => {
        try {
          const r2 = await axios.get(`/api/leavea_llocation_general/${params}`);
          setAllocations(r2.data || []);
        } catch (e) {
          setAllocations([]);
        }
      });
    }
  }, [selectedPeriod, selectedPanel]);

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

  const computeTotalDays = (startStr, endStr) => {
    const a = parseDMY(startStr);
    const b = parseDMY(endStr);
    if (!a || !b) return '';
    const days = Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1;
    return String(Math.max(0, days));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => {
      const next = { ...f, [name]: value };
      if (name === 'start_date' || name === 'end_date') {
        next.total_days = computeTotalDays(next.start_date, next.end_date);
      }
      return next;
    });
  };

  const toISO = (s) => {
    const d = parseDMY(s);
    if (!d) return s; // if invalid, return raw
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const handleApply = async (e) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const empValue = form.emp_id || profile?.emp_id || profile?.id || '';
      // pick leave_type_code if provided else leave_type
      const leaveTypeValue = form.leave_type_code || form.leave_type;
      const payload = {
        emp: empValue,
        leave_type: leaveTypeValue,
        start_date: toISO(form.start_date),
        end_date: toISO(form.end_date),
        reason: form.reason
      };
      await axios.post('/api/leaveentry/', payload);
      setForm({ emp_id: '', leave_type: '', leave_type_code: '', start_date: '', end_date: '', reason: '', total_days: '' });
      const r = await axios.get('/api/leaveentry/'); setLeaveEntries(r.data || []);
    } catch (err) { setError('Failed to apply for leave.'); }
    setLoading(false);
  };

  const filteredEntries = filterEmp ? leaveEntries.filter(le => String(le.emp) === String(filterEmp)) : leaveEntries;

  return (
    <div className="p-4 md:p-6 space-y-4">
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

        {panelOpen && selectedPanel && (
          <div className="p-3">
            {selectedPanel === 'Entry Leave' && (
              <form onSubmit={handleApply} className="flex items-end gap-4 flex-wrap md:flex-nowrap">
                <div className="flex flex-col">
                  <label className="text-xs mb-1">Emp ID</label>
                  <input type="text" name="emp_id" value={form.emp_id} onChange={handleChange} className="border rounded-lg p-2 text-sm w-20" maxLength={3} placeholder="123" pattern="\\d{1,3}" />
                </div>

                <div className="flex-1 min-w-[220px] flex flex-col">
                  <label className="text-xs mb-1">Employee Name</label>
                  <input type="text" value={profile?.emp_name || ''} readOnly className="w-full border rounded-lg p-2 text-sm bg-gray-100" />
                </div>

                <div className="flex flex-col w-36">
                  <label className="text-xs mb-1">Start Date</label>
                  <input type="date" name="start_date" value={form.start_date} onChange={handleChange} className="w-full border rounded-lg p-2 text-sm" />
                </div>

                <div className="flex flex-col w-36">
                  <label className="text-xs mb-1">End Date</label>
                  <input type="date" name="end_date" value={form.end_date} onChange={handleChange} className="w-full border rounded-lg p-2 text-sm" />
                </div>

                <div className="flex flex-col w-28">
                  <label className="text-xs mb-1">Leave Type</label>
                  <input type="text" name="leave_type_code" value={form.leave_type_code} onChange={handleChange} className="w-full border rounded-lg p-2 text-sm" placeholder="00001" maxLength={5} pattern="\d{1,5}" />
                </div>

                <div className="flex flex-col w-20">
                  <label className="text-xs mb-1">Total Days</label>
                  <input type="text" name="total_days" value={form.total_days} readOnly className="border rounded-lg p-2 text-sm bg-gray-100 w-full text-center" maxLength={3} />
                </div>

                <div className="flex flex-col w-48">
                  <label className="text-xs mb-1">Reason</label>
                  <input type="text" name="reason" value={form.reason} onChange={handleChange} className="w-full border rounded-lg p-2 text-sm" />
                </div>

                <div className="flex items-center">
                  {error && <div className="text-red-500 mr-3 text-sm">{error}</div>}
                  <button type="submit" className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm h-10 w-20 flex items-center justify-center" disabled={loading}>{loading ? 'Applying...' : 'Apply'}</button>
                </div>
              </form>
            )}

            {selectedPanel === 'Leave Report' && (
              <div>
                <div className="mb-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm block mb-1">Filter by Employee</label>
                    <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} className="w-full border rounded-lg p-2">
                      <option value="">All Employees</option>
                      {profiles.map(emp => <option key={emp.id} value={emp.id}>{emp.emp_name} ({emp.emp_id})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm block mb-1">Select Period</label>
                    <select value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)} className="w-full border rounded-lg p-2">
                      <option value="">Active Period</option>
                      {periods.map(p => <option key={p.id} value={p.id}>{p.period_name} ({p.start_date} - {p.end_date})</option>)}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button onClick={() => {
                      const params = selectedPeriod ? `?period=${selectedPeriod}` : '';
                      axios.get(`/api/leave-allocations/${params}`).then(r => setAllocations(r.data || [])).catch(() => setAllocations([]));
                    }} className="px-3 py-2 bg-blue-600 text-white rounded">Refresh</button>
                  </div>
                </div>

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
                        {/* For each leave type we will have 4 sub-columns: Start, Alloc, Used, End */}
                        {leaveTypes.map(lt => (
                          <th key={lt.leave_code} colSpan={4} className="p-2 text-center">{lt.leave_name} ({lt.leave_code})</th>
                        ))}
                      </tr>
                      <tr className="bg-gray-50">
                        {leaveTypes.map(lt => (
                          <React.Fragment key={lt.leave_code}>
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
                        // For each leave type, find allocation for this emp
                        const rowCells = leaveTypes.map(lt => {
                          // match allocation by several possible shapes from compat/legacy APIs
                          const alloc = allocations.find(a => (
                            String(a.profile) === String(emp.id) || String(a.profile) === String(emp.emp_id) || String(a.profile_id) === String(emp.id) || String(a.profile_id) === String(emp.emp_id)
                          ) && (
                            String(a.leave_type) === String(lt.leave_code) || String(a.leave_code) === String(lt.leave_code)
                          ));
                          // start balance from profile fields
                          let start = 0;
                          const code = String(lt.leave_code || '').toLowerCase();
                          if (code.startsWith('el')) start = Number(emp.el_balance || 0);
                          else if (code.startsWith('sl')) start = Number(emp.sl_balance || 0);
                          else if (code.startsWith('cl')) start = Number(emp.cl_balance || 0);
                          else start = Number(emp.vacation_balance || 0);
                          // derive allocated from multiple possible fields
                          let allocated = 0;
                          if (alloc) {
                            allocated = Number(alloc.allocated ?? alloc.allocated_amount ?? alloc.allocated_el ?? alloc.allocated_cl ?? alloc.allocated_sl ?? alloc.allocated_vac ?? 0);
                          }
                          // derive used similarly
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
              </div>
            )}

            {selectedPanel === 'Balance Certificate' && (
              <div>
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
        )}
      </div>

      {selectedPanel !== 'Entry Leave' && (
        <div className="border rounded-2xl overflow-hidden flex flex-col mt-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
            <div className="font-semibold">Last Leave Records</div>
            <div className="text-sm text-gray-500">{leaveEntries.length} record(s)</div>
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
                {leaveEntries.length === 0 ? (
                  <tr><td colSpan={6} className="py-6 text-center text-gray-500">No records</td></tr>
                ) : leaveEntries.map((le) => (
                  <tr key={le.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => { setForm({ leave_type: le.leave_type, start_date: le.start_date, end_date: le.end_date, reason: le.reason || '' }); setProfile(profiles.find(p => p.id === le.emp) || profile); setSelectedPanel('Entry Leave'); setPanelOpen(true); }}>
                    <td className="py-2 px-3">{le.leave_report_no}</td>
                    <td className="py-2 px-3">{le.emp_name}</td>
                    <td className="py-2 px-3">{le.leave_type_name}</td>
                    <td className="py-2 px-3">{le.start_date} - {le.end_date}</td>
                    <td className="py-2 px-3">{le.total_days}</td>
                    <td className="py-2 px-3">{le.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-gray-50 flex items-center justify-between">
            <div className="text-xs text-gray-500">Tip: use the Report panel to filter quickly.</div>
            <div className="text-xs text-gray-500">Showing latest records first.</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmpLeavePage;
