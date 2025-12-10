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

// Round leave values according to business rules
const roundLeave = (value, leaveType) => {
  const num = Number(value) || 0;
  
  if (leaveType === 'EL' || leaveType === 'el') {
    // EL: Round to whole numbers only (no decimals)
    return Math.round(num);
  } else {
    // CL, SL, VC: Round to nearest 0.5
    return Math.round(num * 2) / 2;
  }
};

const LeaveReport = ({ user, defaultPeriod = '', mode = 'report', onPeriodChange }) => {
  // mode: 'report' (full) or 'balance' (show certificate with 4 sub-modes)
  const { user: authUser } = useAuth() || {};
  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod || '');
  const [allocations, setAllocations] = useState([]);
  const [computedReport, setComputedReport] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [myBalances, setMyBalances] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // NEW: Balance mode options
  const [balanceMode, setBalanceMode] = useState('all-employees'); // 'employee-summary', 'employee-range', 'multi-year', 'all-employees'
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [balanceData, setBalanceData] = useState(null);

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
        const r1 = await axios.get(`/api/leave-allocations/${params}`);
        setAllocations(normalize(r1.data));
      } catch (e) {
        setAllocations([]);
      }

      try {
        const r2 = await axios.get(`/api/leave-report/${params}`);
        setComputedReport(r2.data);
      } catch (e) {
        try {
          const r3 = await axios.get(`/api/reports/leave-balance${params}`);
          setComputedReport(r3.data);
        } catch (_) {
          setComputedReport(null);
        }
      }

      // my balances (only needed for Balance mode, not Report mode)
      if (mode === 'balance' && !hasMgmt) {
        try {
          const r4 = await axios.get('/api/my-leave-balance/');
          setMyBalances(Array.isArray(r4.data) ? r4.data : []);
        } catch (_) {
          setMyBalances([]);
        }
      }

      setLoading(false);
    };

    load();
    if (onPeriodChange) onPeriodChange(selectedPeriod);
  }, [selectedPeriod]);

  // NEW: Load balance data based on selected mode
  const loadBalanceData = async () => {
    if (!hasMgmt) return; // Only managers can use balance modes
    
    setLoading(true);
    setBalanceData(null);
    
    try {
      let url = '';
      let params = {};
      
      switch (balanceMode) {
        case 'employee-summary':
          if (!selectedEmpId || !selectedPeriod) {
            setLoading(false);
            return;
          }
          url = '/api/leave-report/employee-summary/';
          params = { emp_id: selectedEmpId, period_id: selectedPeriod };
          break;
          
        case 'employee-range':
          if (!selectedEmpId || !fromDate || !toDate) {
            setLoading(false);
            return;
          }
          url = '/api/leave-report/employee-range/';
          params = { emp_id: selectedEmpId, from: fromDate, to: toDate };
          break;
          
        case 'multi-year':
          if (!selectedEmpId) {
            setLoading(false);
            return;
          }
          url = '/api/leave-report/multi-year/';
          params = { emp_id: selectedEmpId };
          break;
          
        case 'all-employees':
          if (!selectedPeriod) {
            setLoading(false);
            return;
          }
          url = '/api/leave-report/all-employees-balance/';
          params = { period_id: selectedPeriod };
          break;
          
        default:
          setLoading(false);
          return;
      }
      
      const response = await axios.get(url, { params });
      setBalanceData(response.data);
    } catch (error) {
      console.error('Failed to load balance data:', error);
      setBalanceData(null);
    }
    
    setLoading(false);
  };

  // Convert backend codes format to flat row format
  const convertFromCodes = (row) => {
    // Check if row already has flat structure (from LeaveReportView)
    if (row.alloc_cl !== undefined || row.alloc_sl !== undefined || row.alloc_el !== undefined) {
      // Already flat - just ensure all fields exist
      return {
        ...row,
        emp_short: row.emp_short || row.emp_id,
        emp_name: row.emp_name || '',
        emp_designation: row.emp_designation || row.designation || '',
        leave_group: row.leave_group || '',
        actual_joining: row.actual_joining || row.start_date || '',
        left_date: row.left_date || 'Cont',
      };
    }

    // Otherwise, convert from codes structure
    const get = (code, key) => row?.codes?.[code]?.[key] ?? 0;

    return {
      ...row,
      emp_short: row.emp_short || row.emp_id,
      emp_name: row.emp_name || '',
      emp_designation: row.emp_designation || row.designation || '',
      actual_joining: row.actual_joining || row.start_date || '',
      left_date: row.left_date || '',

      // starting balance
      start_sl: get("SL", "starting") || get("SL", "start") || 0,
      start_el: get("EL", "starting") || get("EL", "start") || 0,

      // allocations
      alloc_cl: get("CL", "allocated"),
      alloc_sl: get("SL", "allocated"),
      alloc_el: get("EL", "allocated"),
      alloc_vac: get("VAC", "allocated"),

      // used
      used_cl: get("CL", "used"),
      used_sl: get("SL", "used"),
      used_el: get("EL", "used"),
      used_vac: get("VAC", "used"),
      used_dl: get("DL", "used"),
      used_lwp: get("LWP", "used"),
      used_ml: get("ML", "used"),
      used_pl: get("PL", "used"),

      // end balance
      end_cl: get("CL", "balance"),
      end_sl: get("SL", "balance"),
      end_el: get("EL", "balance"),
      end_vac: get("VAC", "balance"),
    };
  };

  // Build rows for table using computedReport if available, else try derived from profiles & allocations
  const rows = (() => {
    if (computedReport && Array.isArray(computedReport.rows) && computedReport.rows.length > 0) {
      // Use convertFromCodes to handle backend's codes structure
      return computedReport.rows.map(convertFromCodes);
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

  // Get current period object
  const period = periods.find(p => String(p.id) === String(selectedPeriod));
  const periodLabel = period ? `${fmtDate(period.start_date)} to ${fmtDate(period.end_date)}` : '';

  // Filter rows based on period dates
  const filteredRows = (() => {
    if (!period || !period.start_date || !period.end_date) {
      return rows;
    }

    const periodStart = parseDMY(period.start_date);
    const periodEnd = parseDMY(period.end_date);

    if (!periodStart || !periodEnd) {
      return rows;
    }

    return rows.filter(r => {
      // Check joining date - exclude if joined after period end
      if (r.actual_joining) {
        const joinDate = parseDMY(r.actual_joining);
        if (joinDate && joinDate > periodEnd) {
          return false; // Employee joined after this period ended
        }
      }

      // Check leaving date - exclude if left before period start
      if (r.left_date && r.left_date !== 'Cont' && r.left_date !== '') {
        const leftDate = parseDMY(r.left_date);
        if (leftDate && leftDate < periodStart) {
          return false; // Employee left before this period started
        }
      }

      return true; // Include employee in report
    });
  })();

  // sort rows by emp_short numeric when possible
  const sorted = [...filteredRows].sort((a, b) => {
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
            // Manager: show multi-mode balance report
            <div>
              <div className="font-semibold mb-3">Balance Certificate</div>
              
              {/* Mode Selector */}
              <div className="mb-4 p-4 bg-gray-50 rounded border">
                <label className="block text-sm font-medium mb-2">Select Report Mode</label>
                <select 
                  value={balanceMode} 
                  onChange={e => setBalanceMode(e.target.value)}
                  className="block w-full md:w-1/2 p-2 border rounded mb-3"
                >
                  <option value="employee-summary">1. Employee Yearly Summary</option>
                  <option value="employee-range">2. Employee Date Range</option>
                  <option value="multi-year">3. Multi-Year Employee Report</option>
                  <option value="all-employees">4. All Employees for Year</option>
                </select>
                
                {/* Mode 1: Employee Summary */}
                {balanceMode === 'employee-summary' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Employee ID *</label>
                      <input 
                        type="text" 
                        value={selectedEmpId} 
                        onChange={e => setSelectedEmpId(e.target.value)}
                        placeholder="Enter Employee ID"
                        className="w-full p-2 border rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Period *</label>
                      <select 
                        value={selectedPeriod} 
                        onChange={e => setSelectedPeriod(e.target.value)}
                        className="w-full p-2 border rounded"
                      >
                        <option value="">Select Period</option>
                        {periods.map(p => (
                          <option key={p.id} value={p.id}>{p.period_name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                
                {/* Mode 2: Employee Range */}
                {balanceMode === 'employee-range' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Employee ID *</label>
                      <input 
                        type="text" 
                        value={selectedEmpId} 
                        onChange={e => setSelectedEmpId(e.target.value)}
                        placeholder="Enter Employee ID"
                        className="w-full p-2 border rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">From Date *</label>
                      <input 
                        type="date" 
                        value={fromDate} 
                        onChange={e => setFromDate(e.target.value)}
                        className="w-full p-2 border rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">To Date *</label>
                      <input 
                        type="date" 
                        value={toDate} 
                        onChange={e => setToDate(e.target.value)}
                        className="w-full p-2 border rounded"
                      />
                    </div>
                  </div>
                )}
                
                {/* Mode 3: Multi-Year */}
                {balanceMode === 'multi-year' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Employee ID *</label>
                      <input 
                        type="text" 
                        value={selectedEmpId} 
                        onChange={e => setSelectedEmpId(e.target.value)}
                        placeholder="Enter Employee ID"
                        className="w-full p-2 border rounded"
                      />
                    </div>
                  </div>
                )}
                
                {/* Mode 4: All Employees */}
                {balanceMode === 'all-employees' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Period *</label>
                      <select 
                        value={selectedPeriod} 
                        onChange={e => setSelectedPeriod(e.target.value)}
                        className="w-full p-2 border rounded"
                      >
                        <option value="">Select Period</option>
                        {periods.map(p => (
                          <option key={p.id} value={p.id}>{p.period_name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                
                <button 
                  onClick={loadBalanceData}
                  disabled={loading}
                  className="mt-3 px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {loading ? 'Loading...' : 'Show Report'}
                </button>
              </div>
              
              {/* Display Results */}
              {balanceData && (
                <div className="mt-4">
                  {/* Mode 1 & 2: Single Employee Summary */}
                  {(balanceMode === 'employee-summary' || balanceMode === 'employee-range') && (
                    <div className="bg-white border rounded p-4">
                      <div className="mb-4">
                        <h3 className="text-lg font-semibold">{balanceData.emp_name} (#{balanceData.emp_short})</h3>
                        <p className="text-sm text-gray-600">
                          {balanceData.period.name} • {balanceData.period.start} to {balanceData.period.end}
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Opening Balance */}
                        <div className="border rounded p-3 bg-blue-50">
                          <h4 className="font-semibold mb-2">Opening Balance</h4>
                          <div className="space-y-1 text-sm">
                            <div>CL: {balanceData.opening.CL}</div>
                            <div>SL: {balanceData.opening.SL}</div>
                            <div>EL: {balanceData.opening.EL}</div>
                            <div>VAC: {balanceData.opening.VAC}</div>
                          </div>
                        </div>
                        
                        {/* Allocated */}
                        <div className="border rounded p-3 bg-green-50">
                          <h4 className="font-semibold mb-2">Allocated</h4>
                          <div className="space-y-1 text-sm">
                            <div>CL: {balanceData.allocated.CL}</div>
                            <div>SL: {balanceData.allocated.SL}</div>
                            <div>EL: {balanceData.allocated.EL}</div>
                            <div>VAC: {balanceData.allocated.VAC}</div>
                          </div>
                        </div>
                        
                        {/* Used */}
                        <div className="border rounded p-3 bg-orange-50">
                          <h4 className="font-semibold mb-2">Used Leaves</h4>
                          <div className="space-y-1 text-sm">
                            <div>CL: {balanceData.used.CL}</div>
                            <div>SL: {balanceData.used.SL}</div>
                            <div>EL: {balanceData.used.EL}</div>
                            <div>VAC: {balanceData.used.VAC}</div>
                            <div>DL: {balanceData.used.DL}</div>
                            <div>LWP: {balanceData.used.LWP}</div>
                            <div>ML: {balanceData.used.ML}</div>
                            <div>PL: {balanceData.used.PL}</div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Closing Balance */}
                      <div className="mt-4 border rounded p-3 bg-purple-50">
                        <h4 className="font-semibold mb-2">Closing Balance</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                          <div>CL: <span className="font-semibold">{balanceData.closing.CL}</span></div>
                          <div>SL: <span className="font-semibold">{balanceData.closing.SL}</span></div>
                          <div>EL: <span className="font-semibold">{balanceData.closing.EL}</span></div>
                          <div>VAC: <span className="font-semibold">{balanceData.closing.VAC}</span></div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Mode 3: Multi-Year */}
                  {balanceMode === 'multi-year' && (
                    <div className="bg-white border rounded p-4">
                      <h3 className="text-lg font-semibold mb-4">{balanceData.emp_name} (#{balanceData.emp_short})</h3>
                      
                      <div className="space-y-4">
                        {balanceData.years.map((year, idx) => (
                          <div key={idx} className="border rounded p-3 bg-gray-50">
                            <h4 className="font-semibold mb-2">{year.period.name}</h4>
                            <p className="text-xs text-gray-600 mb-2">{year.period.start} to {year.period.end}</p>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                              <div>
                                <div className="font-medium text-blue-600">Opening</div>
                                <div>SL: {year.opening.SL}</div>
                                <div>EL: {year.opening.EL}</div>
                              </div>
                              <div>
                                <div className="font-medium text-green-600">Allocated</div>
                                <div>CL: {year.allocated.CL}</div>
                                <div>SL: {year.allocated.SL}</div>
                                <div>EL: {year.allocated.EL}</div>
                              </div>
                              <div>
                                <div className="font-medium text-orange-600">Used</div>
                                <div>CL: {year.used.CL}</div>
                                <div>SL: {year.used.SL}</div>
                                <div>EL: {year.used.EL}</div>
                              </div>
                              <div>
                                <div className="font-medium text-purple-600">Closing</div>
                                <div>CL: {year.closing.CL}</div>
                                <div>SL: {year.closing.SL}</div>
                                <div>EL: {year.closing.EL}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Mode 4: All Employees */}
                  {balanceMode === 'all-employees' && (
                    <div className="bg-white border rounded">
                      <div className="p-3 bg-gray-50 border-b">
                        <h3 className="font-semibold">Balance Certificate (All Employees)</h3>
                        <p className="text-sm text-gray-600">{balanceData.period.name} • {balanceData.period.start} to {balanceData.period.end}</p>
                      </div>
                      
                      <div className="overflow-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="p-2 border">Emp ID</th>
                              <th className="p-2 border">Name</th>
                              <th className="p-2 border">Leave Type</th>
                              <th className="p-2 border">Allocated</th>
                              <th className="p-2 border">Used</th>
                              <th className="p-2 border">Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {balanceData.employees.map((emp, idx) => (
                              emp.leave_types.map((lt, ltIdx) => (
                                <tr key={`${idx}-${ltIdx}`} className="border-b hover:bg-gray-50">
                                  {ltIdx === 0 && (
                                    <>
                                      <td className="p-2 border text-center" rowSpan={emp.leave_types.length}>{emp.emp_short}</td>
                                      <td className="p-2 border" rowSpan={emp.leave_types.length}>{emp.emp_name}</td>
                                    </>
                                  )}
                                  <td className="p-2 border text-center font-semibold">{lt.code}</td>
                                  <td className="p-2 border text-right">{lt.allocated}</td>
                                  <td className="p-2 border text-right">{lt.used}</td>
                                  <td className="p-2 border text-right font-semibold">{lt.balance}</td>
                                </tr>
                              ))
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
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
                <div className="text-4xl font-bold text-blue-600">
                  {period && period.period_name && period.period_name.match(/\d{4}/) 
                    ? (period.period_name.match(/\d{4}/) || [''])[0] 
                    : ''}
                </div>
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
                      <th className="p-2 border font-semibold bg-green-50">VC</th>

                      <th className="p-2 border font-semibold bg-orange-50">CL</th>
                      <th className="p-2 border font-semibold bg-orange-50">SL</th>
                      <th className="p-2 border font-semibold bg-orange-50">EL</th>
                      <th className="p-2 border font-semibold bg-orange-50">VC</th>
                      <th className="p-2 border font-semibold bg-orange-50">DL</th>
                      <th className="p-2 border font-semibold bg-orange-50">LWP</th>
                      <th className="p-2 border font-semibold bg-orange-50">ML</th>
                      <th className="p-2 border font-semibold bg-orange-50">PL</th>

                      <th className="p-2 border font-semibold bg-purple-50">CL</th>
                      <th className="p-2 border font-semibold bg-purple-50">SL</th>
                      <th className="p-2 border font-semibold bg-purple-50">EL</th>
                      <th className="p-2 border font-semibold bg-purple-50">VC</th>
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

                        <td className="p-2 border text-right">{roundLeave(r.start_sl, 'SL')}</td>
                        <td className="p-2 border text-right">{roundLeave(r.start_el, 'EL')}</td>

                        <td className="p-2 border text-right">{roundLeave(r.alloc_cl, 'CL')}</td>
                        <td className="p-2 border text-right">{roundLeave(r.alloc_sl, 'SL')}</td>
                        <td className="p-2 border text-right">{roundLeave(r.alloc_el, 'EL')}</td>
                        <td className="p-2 border text-right">{roundLeave(r.alloc_vac, 'VC')}</td>

                        <td className="p-2 border text-right">{roundLeave(r.used_cl, 'CL')}</td>
                        <td className="p-2 border text-right">{roundLeave(r.used_sl, 'SL')}</td>
                        <td className="p-2 border text-right">{roundLeave(r.used_el, 'EL')}</td>
                        <td className="p-2 border text-right">{roundLeave(r.used_vac, 'VC')}</td>
                        <td className="p-2 border text-right">{roundLeave(r.used_dl, 'DL')}</td>
                        <td className="p-2 border text-right">{roundLeave(r.used_lwp, 'LWP')}</td>
                        <td className="p-2 border text-right">{roundLeave(r.used_ml, 'ML')}</td>
                        <td className="p-2 border text-right">{roundLeave(r.used_pl, 'PL')}</td>

                        <td className="p-2 border text-right">{roundLeave(r.end_cl, 'CL')}</td>
                        <td className="p-2 border text-right">{roundLeave(r.end_sl, 'SL')}</td>
                        <td className="p-2 border text-right">{roundLeave(r.end_el, 'EL')}</td>
                        <td className="p-2 border text-right">{roundLeave(r.end_vac, 'VC')}</td>
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
