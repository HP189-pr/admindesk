// LeaveReport.jsx
import React, { useEffect, useState } from 'react';
import axios from '../api/axiosInstance';
import { useAuth } from '../hooks/AuthContext';

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

const LeaveReport = ({ user, defaultPeriod = '', mode = 'report', onPeriodChange }) => {
  // mode: 'report' (full) or 'balance' (show only certificate)
  const { user: authUser } = useAuth() || {};
  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod || '');
  const [allocations, setAllocations] = useState([]);
  const [computedReport, setComputedReport] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [myBalances, setMyBalances] = useState([]);
  const [loading, setLoading] = useState(false);

  // permission check - show full report only to admin users (Leave Management module access)
  const currentUser = user || authUser;
  const hasMgmt = currentUser?.is_admin || currentUser?.is_staff || currentUser?.is_superuser;

  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get('/api/leave-periods/');
        const pd = normalize(r.data);
        setPeriods(pd);
        // Auto-select first period if none selected
        if (!selectedPeriod && pd.length > 0) {
          setSelectedPeriod(String(pd[0].id));
        }
      } catch (e) {
        console.error('Failed to load periods:', e);
        setPeriods([]);
      }
    })();
  }, []);

  // load profiles (for name/emp_short)
  useEffect(() => {
    axios.get('/api/empprofile/').then(r => setProfiles(normalize(r.data))).catch(() => setProfiles([]));
  }, []);

  // load allocations and computed report for selectedPeriod
  useEffect(() => {
    const load = async () => {
      if (!selectedPeriod) return;
      setLoading(true);
      const params = `?period=${selectedPeriod}`;
      try {
        const r1 = await axios.get(`/api/leave-allocations${params}`);
        setAllocations(normalize(r1.data));
      } catch (e) {
        setAllocations([]);
      }

      try {
        const r2 = await axios.get(`/api/leave-report${params}`);
        setComputedReport(r2.data);
      } catch (e) {
        try {
          const r3 = await axios.get(`/api/reports/leave-balance${params}`);
          setComputedReport(r3.data);
        } catch (_) {
          setComputedReport(null);
        }
      }

      // my balances (for non-managers or Balance mode)
      try {
        const r4 = await axios.get('/api/my-leave-balance/');
        setMyBalances(Array.isArray(r4.data) ? r4.data : []);
      } catch (_) {
        setMyBalances([]);
      }

      setLoading(false);
    };

    load();
    if (onPeriodChange) onPeriodChange(selectedPeriod);
  }, [selectedPeriod]);

  // Build rows for table using computedReport if available, else try derived from profiles & allocations
  const rows = (() => {
    if (computedReport && Array.isArray(computedReport.rows) && computedReport.rows.length > 0) {
      return computedReport.rows.map(r => {
        // ensure fields used by template exist
        return {
          ...r,
          emp_short: r.emp_short || r.emp_id,
          emp_name: r.emp_name || '',
          emp_designation: r.emp_designation || '',
          actual_joining: r.actual_joining || r.start_date || '',
          left_date: r.left_date || '',
          // normalization for older keys (alloc_cl etc.)
          alloc_cl: r.alloc_cl ?? r.allocated_cl ?? r.allocated_cl_amount ?? 0,
          alloc_sl: r.alloc_sl ?? r.allocated_sl ?? r.allocated_sl_amount ?? 0,
          alloc_el: r.alloc_el ?? r.allocated_el ?? r.allocated_el_amount ?? 0,
          alloc_vac: r.alloc_vac ?? r.allocated_vac ?? 0,
          start_sl: r.start_sl ?? r.starting_sl ?? r.starting_sl_balance ?? 0,
          start_el: r.start_el ?? r.starting_el ?? 0,
          used_cl: r.used_cl ?? r.used_cl_days ?? 0,
          used_sl: r.used_sl ?? r.used_sl_days ?? 0,
          used_el: r.used_el ?? r.used_el_days ?? 0,
          used_vac: r.used_vac ?? 0,
          used_dl: r.used_dl ?? 0,
          used_lwp: r.used_lwp ?? 0,
          used_ml: r.used_ml ?? 0,
          used_pl: r.used_pl ?? 0,
          end_cl: r.end_cl ?? r.balance_cl ?? 0,
          end_sl: r.end_sl ?? r.balance_sl ?? 0,
          end_el: r.end_el ?? r.balance_el ?? 0,
          end_vac: r.end_vac ?? r.balance_vac ?? 0
        };
      });
    }

    // fallback: build rows from profiles + allocations (basic)
    if (profiles && profiles.length > 0) {
      return profiles.map(p => {
        const empAllocs = allocations.filter(a => String(a.emp_id) === String(p.emp_id) || String(a.profile) === String(p.id));
        const findAlloc = (codeStarts) => {
          const found = empAllocs.find(a => (a.leave_code || a.leave_type || '').toString().toLowerCase().startsWith(codeStarts.toString().toLowerCase()));
          return found ? (found.allocated ?? 0) : 0;
        };
        const start_sl = Number(p.sl_balance || 0);
        const start_el = Number(p.el_balance || 0);
        const alloc_cl = findAlloc('cl');
        const alloc_sl = findAlloc('sl');
        const alloc_el = findAlloc('el');
        const alloc_vac = findAlloc('vac');

        // used values require leave entries; we'll leave used = 0 here (computedReport preferred)
        const used_cl = 0, used_sl = 0, used_el = 0, used_vac = 0, used_dl = 0, used_lwp = 0, used_ml = 0, used_pl = 0;
        const end_cl = +(start_sl + alloc_cl - used_cl).toFixed(2);
        const end_sl = +(start_sl + alloc_sl - used_sl).toFixed(2);
        const end_el = +(start_el + alloc_el - used_el).toFixed(2);
        const end_vac = +(Number(p.vacation_balance || 0) + alloc_vac - used_vac).toFixed(2);

        return {
          emp_short: p.emp_short || p.emp_id || p.id,
          emp_id: p.emp_id || p.id,
          emp_name: p.emp_name,
          emp_designation: p.emp_designation || '',
          leave_group: p.leave_group || '',
          actual_joining: p.actual_joining || p.emp_birth_date || '',
          left_date: p.left_date || 'Cont',
          start_sl, start_el,
          alloc_cl, alloc_sl, alloc_el, alloc_vac,
          used_cl, used_sl, used_el, used_vac,
          used_dl, used_lwp, used_ml, used_pl,
          end_cl, end_sl, end_el, end_vac
        };
      });
    }

    return [];
  })();

  // sort rows by emp_short numeric when possible
  const sorted = [...rows].sort((a, b) => {
    const nA = Number(String(a.emp_short || a.emp_id || '').replace(/\D/g, '')) || 0;
    const nB = Number(String(b.emp_short || b.emp_id || '').replace(/\D/g, '')) || 0;
    return nA - nB;
  });

  // If user is not manager & mode === 'report', block access (but allow Balance mode for own view)
  if (!hasMgmt && mode === 'report') {
    return (
      <div className="p-4">
        <div className="text-sm text-red-600 font-semibold">Access denied</div>
        <div className="text-xs text-gray-600 mt-2">You don't have permission to view the full leave report. You can view your own leave balance in Balance Certificate.</div>
      </div>
    );
  }

  // Render
  const period = periods.find(p => String(p.id) === String(selectedPeriod));
  const periodLabel = period ? `${fmtDate(period.start_date)} to ${fmtDate(period.end_date)}` : '';

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <div className="text-lg font-semibold">{mode === 'balance' ? 'Leave Balance' : 'Leave Report'}</div>
        <div className="flex gap-2 items-center">
          <label className="text-sm font-medium">Period</label>
          <select 
            value={selectedPeriod} 
            onChange={e => setSelectedPeriod(e.target.value)} 
            className="border px-3 py-2 rounded text-sm min-w-[160px]"
            disabled={loading || periods.length === 0}
          >
            <option value="">Select Period</option>
            {periods.map(p => (
              <option key={p.id} value={p.id}>
                {p.period_name || `Period ${p.id}`}
              </option>
            ))}
          </select>
          {periods.length === 0 && <span className="text-xs text-gray-500">(No periods available)</span>}
          <button onClick={() => window.print()} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">Generate PDF</button>
        </div>
      </div>

      {mode === 'balance' && (
        <div className="mb-4">
          {(!hasMgmt) ? (
            // Normal user: show own balances
            <div>
              <div className="font-semibold mb-2">My Leave Balance</div>
              {myBalances.length === 0 ? <div className="text-gray-500">No leave data available.</div> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {myBalances.map(b => (
                    <div key={b.leave_type} className="border rounded p-3 bg-white">
                      <div className="font-semibold">{b.leave_type_name} ({b.leave_type})</div>
                      <div>Allocated: {b.allocated}</div>
                      <div>Used: {b.used}</div>
                      <div>Balance: {b.balance}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // Manager: show aggregated balances optionally by period (use computedReport)
            <div>
              <div className="font-semibold mb-2">Balance Certificate (All Employees)</div>
              <div className="text-sm text-gray-600 mb-2">{period ? `${period.period_name} • ${periodLabel}` : 'Select period'}</div>
              <div className="overflow-auto">
                <table className="min-w-full text-sm border">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2">Emp ID</th>
                      <th className="p-2">Name</th>
                      <th className="p-2">Leave Type</th>
                      <th className="p-2">Allocated</th>
                      <th className="p-2">Used</th>
                      <th className="p-2">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(computedReport && Array.isArray(computedReport.rows) && computedReport.rows.length > 0) ? (
                      computedReport.rows.map((r, i) => (
                        <tr key={i} className="border-b hover:bg-gray-50">
                          <td className="p-2">{r.emp_short || r.emp_id}</td>
                          <td className="p-2">{r.emp_name}</td>
                          {/* try to print aggregated leave types if server returned codes map */}
                          <td className="p-2">{/* empty: manager will use PDF / full report for details */}</td>
                          <td className="p-2">{/* aggregated value if any */}</td>
                          <td className="p-2">{/* used */}</td>
                          <td className="p-2">{/* balance */}</td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={6} className="p-4 text-gray-500">No data</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full screenshot-like report table (shown in report mode OR managers in balance mode if they want detail) */}
      {mode !== 'balance' && (
        <div>
          {(!selectedPeriod) ? (
            <div className="text-center py-8 text-gray-500">Please select a period to view report</div>
          ) : (
            <>
              <div className="flex flex-col items-center mb-4">
                <div className="text-4xl font-bold text-blue-600">{(period && (period.period_name || '')).match(/\d{4}/) ? (period.period_name.match(/\d{4}/) || [''])[0] : ''}</div>
                <div className="text-sm text-red-600 mt-1">{periodLabel}</div>
              </div>

              <div className="overflow-auto border rounded">
                <table className="min-w-full text-xs table-auto border-collapse">
                  <thead>
                    <tr className="bg-yellow-50">
                      <th rowSpan={2} className="p-2 border font-semibold">Emp ID</th>
                      <th rowSpan={2} className="p-2 border font-semibold">Emp Name</th>
                      <th rowSpan={2} className="p-2 border font-semibold">Position</th>
                      <th rowSpan={2} className="p-2 border font-semibold">Leave Group</th>
                      <th rowSpan={2} className="p-2 border font-semibold">Joining Date</th>
                      <th rowSpan={2} className="p-2 border font-semibold">Leaving Date</th>

                      <th colSpan={2} className="p-2 border text-center font-semibold bg-blue-50">Balance: Start</th>

                      <th colSpan={4} className="p-2 border text-center font-semibold bg-green-50">Leave Allocation</th>

                      <th colSpan={8} className="p-2 border text-center font-semibold bg-orange-50">Used Leave</th>

                      <th colSpan={4} className="p-2 border text-center font-semibold bg-purple-50">Balance (End)</th>
                    </tr>

                    <tr className="bg-yellow-50">
                      <th className="p-2 border font-semibold bg-blue-50">SL</th>
                      <th className="p-2 border font-semibold bg-blue-50">EL</th>

                      <th className="p-2 border font-semibold bg-green-50">CL</th>
                      <th className="p-2 border font-semibold bg-green-50">SL</th>
                      <th className="p-2 border font-semibold bg-green-50">EL</th>
                      <th className="p-2 border font-semibold bg-green-50">VAC</th>

                      <th className="p-2 border font-semibold bg-orange-50">CL</th>
                      <th className="p-2 border font-semibold bg-orange-50">SL</th>
                      <th className="p-2 border font-semibold bg-orange-50">EL</th>
                      <th className="p-2 border font-semibold bg-orange-50">Vacation</th>
                      <th className="p-2 border font-semibold bg-orange-50">DL</th>
                      <th className="p-2 border font-semibold bg-orange-50">LWP</th>
                      <th className="p-2 border font-semibold bg-orange-50">ML</th>
                      <th className="p-2 border font-semibold bg-orange-50">PL</th>

                      <th className="p-2 border font-semibold bg-purple-50">CL</th>
                      <th className="p-2 border font-semibold bg-purple-50">SL</th>
                      <th className="p-2 border font-semibold bg-purple-50">EL</th>
                      <th className="p-2 border font-semibold bg-purple-50">Vacation</th>
                    </tr>
                  </thead>

                  <tbody>
                    {sorted.length === 0 ? (
                      <tr><td colSpan={24} className="text-center p-6 text-gray-500">No report data available</td></tr>
                    ) : sorted.map((r, idx) => (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="p-2 border text-center">{r.emp_short || r.emp_id}</td>
                        <td className="p-2 border">{r.emp_name}</td>
                        <td className="p-2 border">{r.emp_designation || ''}</td>
                        <td className="p-2 border text-center">{r.leave_group || ''}</td>
                        <td className="p-2 border text-center">{fmtDate(r.actual_joining) || ''}</td>
                        <td className="p-2 border text-center">{r.left_date || 'Cont'}</td>

                        <td className="p-2 border text-right">{r.start_sl ?? 0}</td>
                        <td className="p-2 border text-right">{r.start_el ?? 0}</td>

                        <td className="p-2 border text-right">{r.alloc_cl ?? 0}</td>
                        <td className="p-2 border text-right">{r.alloc_sl ?? 0}</td>
                        <td className="p-2 border text-right">{r.alloc_el ?? 0}</td>
                        <td className="p-2 border text-right">{r.alloc_vac ?? 0}</td>

                        <td className="p-2 border text-right">{r.used_cl ?? 0}</td>
                        <td className="p-2 border text-right">{r.used_sl ?? 0}</td>
                        <td className="p-2 border text-right">{r.used_el ?? 0}</td>
                        <td className="p-2 border text-right">{r.used_vac ?? 0}</td>
                        <td className="p-2 border text-right">{r.used_dl ?? 0}</td>
                        <td className="p-2 border text-right">{r.used_lwp ?? 0}</td>
                        <td className="p-2 border text-right">{r.used_ml ?? 0}</td>
                        <td className="p-2 border text-right">{r.used_pl ?? 0}</td>

                        <td className="p-2 border text-right">{r.end_cl ?? 0}</td>
                        <td className="p-2 border text-right">{r.end_sl ?? 0}</td>
                        <td className="p-2 border text-right">{r.end_el ?? 0}</td>
                        <td className="p-2 border text-right">{r.end_vac ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default LeaveReport;
