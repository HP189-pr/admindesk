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
  const [balanceError, setBalanceError] = useState(null);
  const [leaveGroupFilter, setLeaveGroupFilter] = useState('all'); // for All Employees filter: 'all' | 'vc' | 'el'

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
    setBalanceError(null);
    
    try {
      let url = '';
      let params = {};
      
      switch (balanceMode) {
        case 'employee-summary':
          if (!selectedEmpId || !selectedPeriod) {
            setBalanceError('Please enter Employee ID and select a Period');
            setLoading(false);
            return;
          }
          url = '/api/leave-report/employee-summary/';
          params = { emp_id: selectedEmpId, period_id: selectedPeriod };
          break;
          
        case 'employee-range':
        case 'certificate-range':
          if (!selectedEmpId || !fromDate || !toDate) {
            setBalanceError('Please enter Employee ID and select both dates');
            setLoading(false);
            return;
          }
          // Both employee-range and certificate-range use the same backend date-range endpoint
          url = '/api/leave-report/employee-range/';
          params = { emp_id: selectedEmpId, from: fromDate, to: toDate };
          break;
          
        case 'multi-year':
          if (!selectedEmpId) {
            setBalanceError('Please enter Employee ID');
            setLoading(false);
            return;
          }
          url = '/api/leave-report/multi-year/';
          params = { emp_id: selectedEmpId };
          break;
          
        case 'all-employees':
          if (!selectedPeriod) {
            setBalanceError('Please select a Period');
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
      setBalanceError(null);
    } catch (error) {
      console.error('Failed to load balance data:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Failed to load balance data';
      setBalanceError(errorMsg);
      setBalanceData(null);
    }
    
    setLoading(false);
  };

  // Print helper: open a new window containing only the .print-area and print it
  const handlePrintClick = (e) => {
    try {
      // find closest printable area relative to the clicked button, otherwise pick the first VISIBLE .print-area
      const btn = e && e.currentTarget;
      const area = (btn && btn.closest) ? btn.closest('.print-area') : null;
      let printEl = area || null;
      if (!printEl) {
        const all = Array.from(document.querySelectorAll('.print-area'));
        // prefer the first visible print-area
        printEl = all.find(el => {
          try {
            return el && (el.offsetParent !== null || el.getClientRects().length > 0) && (el.clientWidth > 0 || el.clientHeight > 0);
          } catch (_) { return false; }
        }) || all[0] || null;
      }
      if (!printEl) {
        // fallback to browser print if nothing found
        console.warn('No .print-area found; calling window.print() fallback');
        window.print();
        return;
      }

      // Diagnostic: log size of the printable content
      try {
        console.debug('LeaveReport: chosen print element length', (printEl && printEl.innerHTML && printEl.innerHTML.length) || 0);
      } catch (_) {}

      // Create a top-level temporary host and append a cloned copy of the print content there.
      const hostId = 'admindesk-print-host';
      // remove any existing host
      const prevHost = document.getElementById(hostId);
      if (prevHost) prevHost.remove();

      const host = document.createElement('div');
      host.id = hostId;
      // keep it out of flow, but visible to print
      host.style.position = 'relative';
      host.style.zIndex = '999999';

      const cloned = printEl.cloneNode(true);
      // ensure cloned root has print-area class so CSS targets it
      cloned.classList.add('print-area');
      host.appendChild(cloned);
      document.body.appendChild(host);

      // create temporary style to hide everything except our host during print
      const tempId = 'admindesk-temp-print-style';
      const existing = document.getElementById(tempId);
      if (existing) existing.remove();

      const style = document.createElement('style');
      style.id = tempId;
      style.type = 'text/css';
      style.appendChild(document.createTextNode(`
        @media print {
          html, body { height: auto !important; }
          body > * { display: none !important; }
          #${hostId} { display: block !important; }
          #${hostId} .print-area { display: block !important; margin: 0 auto !important; width: calc(210mm - 40mm) !important; }
          #${hostId} .print-area * { display: initial !important; }
          #${hostId} .no-print { display: none !important; }
        }
        /* ensure quick on-screen preview in some browsers */
        #${hostId} { display: none; }
        body.printing-temp > * { display: none !important; }
        body.printing-temp #${hostId} { display: block !important; }
      `));

      document.head.appendChild(style);
      // add helper class to body so some browsers immediately reflect the layout change
      document.body.classList.add('printing-temp');

      // Diagnostic: log cloned content length
      try { console.debug('LeaveReport: cloned print host length', cloned.innerHTML.length); } catch (_) {}

      // call native print for current window
      try {
        window.print();
      } finally {
        // cleanup after short delay to allow print dialog to open
        setTimeout(() => {
          try { document.body.classList.remove('printing-temp'); } catch (_) {}
          try { const s = document.getElementById(tempId); if (s) s.remove(); } catch (_) {}
          try { const h = document.getElementById(hostId); if (h) h.remove(); } catch (_) {}
        }, 600);
      }
    } catch (err) {
      console.error('Print failed, falling back to window.print()', err);
      try { window.print(); } catch (_) {}
    }
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

  // Safe defaults for balanceData to avoid crashing when API returns unexpected shape
  const opening = (balanceData && balanceData.opening) ? balanceData.opening : { CL: 0, SL: 0, EL: 0, VAC: 0 };
  const allocated = (balanceData && balanceData.allocated) ? balanceData.allocated : { CL: 0, SL: 0, EL: 0, VAC: 0 };
  const used = (balanceData && balanceData.used) ? balanceData.used : { CL: 0, SL: 0, EL: 0, VAC: 0, DL: 0, LWP: 0, ML: 0, PL: 0 };
  const closing = (balanceData && balanceData.closing) ? balanceData.closing : { CL: 0, SL: 0, EL: 0, VAC: 0 };
  const yearsArr = (balanceData && Array.isArray(balanceData.years)) ? balanceData.years : [];
  const employeesArr = (balanceData && Array.isArray(balanceData.employees)) ? balanceData.employees : [];

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
      <style>{`@media print {
        /* Use A4 paper and reasonable margins */
        @page { size: A4 portrait; margin: 20mm; }
        -webkit-print-color-adjust: exact;

        /* Hide all top-level content by default to avoid printing nav/menus */
        html, body { height: auto !important; }
        body > * { display: none !important; }

        /* Show only the printable container */
        .print-area { display: block !important; }
        .print-area * { display: initial !important; }

        /* Center printable content horizontally within A4 page margins */
        .print-area {
          margin: 0 auto !important;
          width: calc(210mm - 40mm) !important; /* A4 width minus left/right margins */
          box-sizing: border-box !important;
          position: static !important;
          transform: none !important;
          top: auto !important;
        }

        /* Hide interactive controls when printing */
        .no-print { display: none !important; }

        /* Table break handling */
        table { page-break-inside: auto; }
        tr { page-break-inside: avoid; page-break-after: auto; }
      }`}</style>
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
          <button onClick={(e) => handlePrintClick(e)} className="px-4 py-2 bg-blue-600 text-white rounded text-sm no-print">Generate PDF</button>
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
                  <option value="certificate-range">5. Certificate (From → To)</option>
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
                
                {/* Mode 2: Employee Range (also used for Certificate From→To) */}
                  {(balanceMode === 'employee-range' || balanceMode === 'certificate-range') && (
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
                    <div>
                      <label className="block text-sm font-medium mb-1">Leave Group Filter</label>
                      <select value={leaveGroupFilter} onChange={e => setLeaveGroupFilter(e.target.value)} className="w-full p-2 border rounded">
                        <option value="all">All (VC & EL)</option>
                        <option value="vc">Vacation (VC) only</option>
                        <option value="el">EL only</option>
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
              
              {/* Error Message */}
              {balanceError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                  {balanceError}
                </div>
              )}
              
              {/* Display Results */}
              {balanceData && (
                <div className="mt-4">
                  {/* Mode 1 & 2: Single Employee Summary */}
                  {/* Certificate (From→To) - print-style single employee layout */}
                  {balanceMode === 'certificate-range' && balanceData && balanceData.period && (
                    <div className="bg-white border rounded p-6 max-w-3xl mx-auto print-area">
                      <div className="flex justify-between items-start mb-4">
                        <div className="text-center w-full">
                          <div className="text-2xl font-bold">Balance Certificate</div>
                          <div className="text-sm text-gray-600 mt-1">{balanceData?.period?.name || ''} • {balanceData?.period?.start || ''} to {balanceData?.period?.end || ''}</div>
                        </div>
                        <div className="ml-4">
                          <button onClick={(e) => handlePrintClick(e)} className="px-3 py-1 bg-blue-600 text-white rounded text-sm no-print">Print / Save PDF</button>
                        </div>
                      </div>

                      <div className="mb-4 text-sm">
                        <div><strong>Employee:</strong> {balanceData?.emp_name || ''} (#{balanceData?.emp_short || ''})</div>
                        <div><strong>Designation:</strong> {balanceData?.emp_designation || ''}</div>
                        <div><strong>Joining:</strong> {balanceData?.actual_joining || ''} &nbsp; <strong>Leaving:</strong> {balanceData?.left_date || 'Cont'}</div>
                      </div>

                      <div className="overflow-auto">
                        <table className="min-w-full text-sm border-collapse">
                          <thead>
                            <tr className="bg-gray-100">
                              <th className="p-2 border text-left">Leave Type</th>
                              <th className="p-2 border text-right">Start (Allocated)</th>
                              <th className="p-2 border text-right">Allocated</th>
                              <th className="p-2 border text-right">Used</th>
                              <th className="p-2 border text-right">Closing</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const lg = (balanceData && (balanceData.leave_group || balanceData.emp_leave_group || balanceData.emp?.leave_group)) || null;
                              const codes = lg === 'el' || lg === 'EL' ? ['CL','SL','EL'] : (lg === 'vc' || lg === 'VC' ? ['CL','SL','VAC'] : ['CL','SL','EL','VAC']);
                              return codes.map(code => (
                                <tr key={code} className="border-b hover:bg-gray-50">
                                  <td className="p-2 border font-semibold">{code}</td>
                                  <td className="p-2 border text-right">{roundLeave(opening[code] ?? 0, code)} {allocated[code] ? <span className="text-xs text-gray-600">({roundLeave(allocated[code], code)})</span> : null}</td>
                                  <td className="p-2 border text-right">{roundLeave(allocated[code] ?? 0, code)}</td>
                                  <td className="p-2 border text-right">{roundLeave(used[code] ?? 0, code)}</td>
                                  <td className="p-2 border text-right font-semibold">{roundLeave(closing[code] ?? 0, code)}</td>
                                </tr>
                              ));
                            })()}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-6 text-xs text-gray-600">This certificate shows opening balances with allocations in parentheses for the selected date range.</div>
                    </div>
                  )}

                  {/* Default single-employee display (employee-summary and employee-range) */}
                  {(balanceMode === 'employee-summary' || balanceMode === 'employee-range') && balanceData && balanceData.period && (
                    <div className="bg-white border rounded p-4 print-area">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-lg font-semibold">{balanceData?.emp_name || ''} (#{balanceData?.emp_short || ''})</h3>
                          <p className="text-sm text-gray-600">{balanceData?.period?.name || ''} • {balanceData?.period?.start || ''} to {balanceData?.period?.end || ''}</p>
                        </div>
                        <div>
                          <button onClick={(e) => handlePrintClick(e)} className="px-3 py-1 bg-blue-600 text-white rounded text-sm no-print">Print / Save PDF</button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Opening Balance */}
                        <div className="border rounded p-3 bg-blue-50">
                          <h4 className="font-semibold mb-2">Opening Balance</h4>
                          <div className="space-y-1 text-sm">
                            {(() => {
                              const lg = (balanceData && (balanceData.leave_group || balanceData.emp_leave_group || balanceData.emp?.leave_group)) || null;
                              return (
                                <>
                                  <div>CL: {roundLeave(opening.CL ?? 0, 'CL')} {allocated.CL ? `(${roundLeave(allocated.CL ?? 0, 'CL')})` : ''}</div>
                                  <div>SL: {roundLeave(opening.SL ?? 0, 'SL')} {allocated.SL ? `(${roundLeave(allocated.SL ?? 0, 'SL')})` : ''}</div>
                                  {(lg === 'vc' || lg === 'VC') ? null : <div>EL: {roundLeave(opening.EL ?? 0, 'EL')} {allocated.EL ? `(${roundLeave(allocated.EL ?? 0, 'EL')})` : ''}</div>}
                                  {(lg === 'el' || lg === 'EL') ? null : <div>VAC: {roundLeave(opening.VAC ?? 0, 'VAC')} {allocated.VAC ? `(${roundLeave(allocated.VAC ?? 0, 'VAC')})` : ''}</div>}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                        
                        {/* Allocated */}
                        <div className="border rounded p-3 bg-green-50">
                          <h4 className="font-semibold mb-2">Allocated</h4>
                          <div className="space-y-1 text-sm">
                            {(() => {
                              const lg = (balanceData && (balanceData.leave_group || balanceData.emp_leave_group || balanceData.emp?.leave_group)) || null;
                              return (
                                <>
                                  <div>CL: {roundLeave(allocated.CL ?? 0, 'CL')}</div>
                                  <div>SL: {roundLeave(allocated.SL ?? 0, 'SL')}</div>
                                  {(lg === 'vc' || lg === 'VC') ? null : <div>EL: {roundLeave(allocated.EL ?? 0, 'EL')}</div>}
                                  {(lg === 'el' || lg === 'EL') ? null : <div>VAC: {roundLeave(allocated.VAC ?? 0, 'VAC')}</div>}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                        
                        {/* Used */}
                        <div className="border rounded p-3 bg-orange-50">
                          <h4 className="font-semibold mb-2">Used Leaves</h4>
                          <div className="space-y-1 text-sm">
                            {(() => {
                              const lg = (balanceData && (balanceData.leave_group || balanceData.emp_leave_group || balanceData.emp?.leave_group)) || null;
                              return (
                                <>
                                  <div>CL: {roundLeave(used.CL ?? 0, 'CL')}</div>
                                  <div>SL: {roundLeave(used.SL ?? 0, 'SL')}</div>
                                  {(lg === 'vc' || lg === 'VC') ? null : <div>EL: {roundLeave(used.EL ?? 0, 'EL')}</div>}
                                  {(lg === 'el' || lg === 'EL') ? null : <div>VAC: {roundLeave(used.VAC ?? 0, 'VAC')}</div>}
                                  <div>DL: {used.DL}</div>
                                  <div>LWP: {used.LWP}</div>
                                  <div>ML: {used.ML}</div>
                                  <div>PL: {used.PL}</div>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                      
                      {/* Closing Balance */}
                      <div className="mt-4 border rounded p-3 bg-purple-50">
                        <h4 className="font-semibold mb-2">Closing Balance</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                          {(() => {
                            const lg = (balanceData && (balanceData.leave_group || balanceData.emp_leave_group || balanceData.emp?.leave_group)) || null;
                            return (
                              <>
                                <div>CL: <span className="font-semibold">{roundLeave(closing.CL ?? 0, 'CL')}</span></div>
                                <div>SL: <span className="font-semibold">{roundLeave(closing.SL ?? 0, 'SL')}</span></div>
                                {(lg === 'vc' || lg === 'VC') ? <></> : <div>EL: <span className="font-semibold">{roundLeave(closing.EL ?? 0, 'EL')}</span></div>}
                                {(lg === 'el' || lg === 'EL') ? <></> : <div>VAC: <span className="font-semibold">{roundLeave(closing.VAC ?? 0, 'VAC')}</span></div>}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Mode 3: Multi-Year */}
                  {balanceMode === 'multi-year' && yearsArr.length > 0 && (
                    <div className="bg-white border rounded p-4 print-area">
                      <div className="flex justify-end mb-3">
                        <button onClick={(e) => handlePrintClick(e)} className="px-3 py-1 bg-blue-600 text-white rounded text-sm no-print">Print / Save PDF</button>
                      </div>
                      <h3 className="text-lg font-semibold mb-4">{balanceData?.emp_name || ''} (#{balanceData?.emp_short || ''})</h3>
                      
                      <div className="space-y-4">
                        {yearsArr.map((year, idx) => (
                          <div key={idx} className="border rounded p-3 bg-gray-50">
                            <h4 className="font-semibold mb-2">{(year.period && year.period.name) || ''}</h4>
                            <p className="text-xs text-gray-600 mb-2">{(year.period && year.period.start) || ''} to {(year.period && year.period.end) || ''}</p>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                              <div>
                                <div className="font-medium text-blue-600">Opening</div>
                                {(() => {
                                  const lg = (balanceData && (balanceData.leave_group || balanceData.emp_leave_group || balanceData.emp?.leave_group)) || null;
                                  return (
                                    <>
                                      <div>SL: {roundLeave((year.opening && year.opening.SL) || 0, 'SL')} {((year.allocated && year.allocated.SL) ? `(${roundLeave(year.allocated.SL || 0, 'SL')})` : '')}</div>
                                      {(lg === 'vc' || lg === 'VC') ? <div>VAC: {roundLeave((year.opening && year.opening.VAC) || 0, 'VAC')} {((year.allocated && year.allocated.VAC) ? `(${roundLeave(year.allocated.VAC || 0, 'VAC')})` : '')}</div> : <div>EL: {roundLeave((year.opening && year.opening.EL) || 0, 'EL')} {((year.allocated && year.allocated.EL) ? `(${roundLeave(year.allocated.EL || 0, 'EL')})` : '')}</div>}
                                    </>
                                  );
                                })()}
                              </div>
                              <div>
                                <div className="font-medium text-green-600">Allocated</div>
                                {(() => {
                                  const lg = (balanceData && (balanceData.leave_group || balanceData.emp_leave_group || balanceData.emp?.leave_group)) || null;
                                  return (
                                    <>
                                      <div>CL: {roundLeave((year.allocated && year.allocated.CL) || 0, 'CL')}</div>
                                      <div>SL: {roundLeave((year.allocated && year.allocated.SL) || 0, 'SL')}</div>
                                      {(lg === 'vc' || lg === 'VC') ? <div>VAC: {roundLeave((year.allocated && year.allocated.VAC) || 0, 'VAC')}</div> : <div>EL: {roundLeave((year.allocated && year.allocated.EL) || 0, 'EL')}</div>}
                                    </>
                                  );
                                })()}
                              </div>
                              <div>
                                <div className="font-medium text-orange-600">Used</div>
                                {(() => {
                                  const lg = (balanceData && (balanceData.leave_group || balanceData.emp_leave_group || balanceData.emp?.leave_group)) || null;
                                  return (
                                    <>
                                      <div>CL: {roundLeave((year.used && year.used.CL) || 0, 'CL')}</div>
                                      <div>SL: {roundLeave((year.used && year.used.SL) || 0, 'SL')}</div>
                                      {(lg === 'vc' || lg === 'VC') ? <div>VAC: {roundLeave((year.used && year.used.VAC) || 0, 'VAC')}</div> : <div>EL: {roundLeave((year.used && year.used.EL) || 0, 'EL')}</div>}
                                    </>
                                  );
                                })()}
                              </div>
                              <div>
                                <div className="font-medium text-purple-600">Closing</div>
                                {(() => {
                                  const lg = (balanceData && (balanceData.leave_group || balanceData.emp_leave_group || balanceData.emp?.leave_group)) || null;
                                  return (
                                    <>
                                      <div>CL: {roundLeave((year.closing && year.closing.CL) || 0, 'CL')}</div>
                                      <div>SL: {roundLeave((year.closing && year.closing.SL) || 0, 'SL')}</div>
                                      {(lg === 'vc' || lg === 'VC') ? <div>VAC: {roundLeave((year.closing && year.closing.VAC) || 0, 'VAC')}</div> : <div>EL: {roundLeave((year.closing && year.closing.EL) || 0, 'EL')}</div>}
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Mode 4: All Employees */}
                  {balanceMode === 'all-employees' && balanceData && balanceData.period && employeesArr.length > 0 && (
                    <div className="bg-white border rounded print-area">
                      {/* --- REPLACED HEADING: center-aligned simplified heading to match screenshot-2 --- */}
                      <div className="p-3 bg-gray-50 border-b">
                        <div className="text-center">
                          <div className="text-2xl font-bold">{balanceData?.org_name || 'Organization Name'}</div>
                          <div className="text-4xl font-bold text-blue-600 mt-2">
                            {(() => {
                              const p = balanceData && balanceData.period ? balanceData.period : period || null;
                              const name = p && p.name ? p.name : (p && p.period_name ? p.period_name : '');
                              const m = name && name.match ? name.match(/\d{4}/) : null;
                              return m ? (m[0] || '') : '';
                            })()}
                          </div>
                          <div className="text-sm text-red-600 mt-1">
                            {(() => {
                              const p = balanceData && balanceData.period ? balanceData.period : period || null;
                              if (!p) return '';
                              const start = p.start || p.start_date || '';
                              const end = p.end || p.end_date || '';
                              return `${start ? fmtDate(start) : ''}${start && end ? ' to ' : ''}${end ? fmtDate(end) : ''}`;
                            })()}
                          </div>
                          <h3 className="font-semibold mt-2">Balance Certificate (All Employees)</h3>
                        </div>
                        <div className="text-right">
                          <button onClick={(e) => handlePrintClick(e)} className="px-3 py-1 bg-blue-600 text-white rounded text-sm no-print">Print / Save PDF</button>
                        </div>
                      </div>
                      
                      <div className="overflow-auto">
                        {/* --- REPLACED TABLE HEADER: grouped header layout matching screenshot-2 --- */}
                        <table className="min-w-full text-sm">
                          <thead>
                            {/* TOP GROUP HEADER ROW */}
                            <tr className="bg-gray-100 text-center font-semibold">
                              <th rowSpan={2} className="p-2 border">Emp ID</th>
                              <th rowSpan={2} className="p-2 border">Name</th>

                              {/* Balance Start */}
                              <th colSpan={2} className="p-2 border bg-blue-50">Balance Start (Allocated)</th>

                              {/* Allocation */}
                              <th colSpan={4} className="p-2 border bg-green-50">Leave Allocation</th>

                              {/* Used Leave */}
                              <th colSpan={8} className="p-2 border bg-orange-50">Used Leave</th>

                              {/* End Balance */}
                              <th colSpan={4} className="p-2 border bg-purple-50">Balance (End)</th>
                            </tr>

                            {/* SECOND ROW → INDIVIDUAL COLUMNS */}
                            <tr className="bg-gray-50 text-center text-xs">
                              {/* Balance Start (SL, EL) */}
                              <th className="p-2 border bg-blue-50">SL</th>
                              <th className="p-2 border bg-blue-50">EL</th>

                              {/* Leave Allocation */}
                              <th className="p-2 border bg-green-50">CL</th>
                              <th className="p-2 border bg-green-50">SL</th>
                              <th className="p-2 border bg-green-50">EL</th>
                              <th className="p-2 border bg-green-50">VAC</th>

                              {/* Used Leave */}
                              <th className="p-2 border bg-orange-50">CL</th>
                              <th className="p-2 border bg-orange-50">SL</th>
                              <th className="p-2 border bg-orange-50">EL</th>
                              <th className="p-2 border bg-orange-50">VAC</th>
                              <th className="p-2 border bg-orange-50">DL</th>
                              <th className="p-2 border bg-orange-50">LWP</th>
                              <th className="p-2 border bg-orange-50">ML</th>
                              <th className="p-2 border bg-orange-50">PL</th>

                              {/* End Balance */}
                              <th className="p-2 border bg-purple-50">CL</th>
                              <th className="p-2 border bg-purple-50">SL</th>
                              <th className="p-2 border bg-purple-50">EL</th>
                              <th className="p-2 border bg-purple-50">VAC</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const list = Array.isArray(employeesArr) ? (() => {
                                // Defensive normalization: support multiple possible field names and trim/case-normalize
                                const beforeCount = employeesArr.length;
                                const filtered = employeesArr.filter(emp => {
                                  if (!leaveGroupFilter || leaveGroupFilter === 'all') return true;
                                  const raw = emp?.leave_group ?? emp?.emp_leave_group ?? emp?.leaveGroup ?? emp?.group ?? '';
                                  let lg = (raw === null || raw === undefined) ? '' : String(raw).trim().toLowerCase();
                                  if (!lg) return false;
                                  // normalize separators and multiple values (e.g. "vc & el", "vc,el", "vacation & el")
                                  const normalized = lg.replace(/[&,]/g, ' ').replace(/\s+/g, ' ').trim();
                                  if (leaveGroupFilter === 'vc') return normalized.includes('vc') || normalized.includes('vac');
                                  if (leaveGroupFilter === 'el') return normalized.includes('el');
                                  return true;
                                });
                                try { console.debug('LeaveReport: employeesArr before/after filter', beforeCount, filtered.length, 'filter=', leaveGroupFilter); } catch (_) {}
                                return filtered;
                              })() : [];

                              return list.map((emp, idx) => {
                              const types = Array.isArray(emp.leave_types) ? emp.leave_types : [];
                              const byCode = types.reduce((acc, lt) => {
                                const code = (lt.code || lt.leave_type || '').toString().toUpperCase();
                                acc[code] = lt;
                                return acc;
                              }, {});

                              const safe = (c, k) => {
                                const v = byCode[c];
                                return v && (v[k] !== undefined && v[k] !== null) ? v[k] : 0;
                              };

                              return (
                                <tr key={idx} className="border-b hover:bg-gray-50">
                                  <td className="p-2 border text-center">{emp.emp_short || emp.emp_id}</td>
                                  <td className="p-2 border">{emp.emp_name}</td>

                                  <td className="p-2 border text-right">{roundLeave(safe('SL', 'starting') || safe('SL', 'start') || 0, 'SL')}</td>
                                  <td className="p-2 border text-right">{roundLeave(safe('EL', 'starting') || safe('EL', 'start') || 0, 'EL')}</td>

                                  <td className="p-2 border text-right">{roundLeave(safe('CL', 'allocated'), 'CL')}</td>
                                  <td className="p-2 border text-right">{roundLeave(safe('SL', 'allocated'), 'SL')}</td>
                                  <td className="p-2 border text-right">{roundLeave(safe('EL', 'allocated'), 'EL')}</td>
                                  <td className="p-2 border text-right">{roundLeave(safe('VAC', 'allocated'), 'VAC')}</td>

                                  <td className="p-2 border text-right">{roundLeave(safe('CL', 'used'), 'CL')}</td>
                                  <td className="p-2 border text-right">{roundLeave(safe('SL', 'used'), 'SL')}</td>
                                  <td className="p-2 border text-right">{roundLeave(safe('EL', 'used'), 'EL')}</td>
                                  <td className="p-2 border text-right">{roundLeave(safe('VAC', 'used'), 'VAC')}</td>
                                  <td className="p-2 border text-right">{roundLeave(safe('DL', 'used') || 0, 'CL')}</td>
                                  <td className="p-2 border text-right">{roundLeave(safe('LWP', 'used') || 0, 'CL')}</td>
                                  <td className="p-2 border text-right">{roundLeave(safe('ML', 'used') || 0, 'CL')}</td>
                                  <td className="p-2 border text-right">{roundLeave(safe('PL', 'used') || 0, 'CL')}</td>

                                  <td className="p-2 border text-right font-semibold">{roundLeave(safe('CL', 'balance'), 'CL')}</td>
                                  <td className="p-2 border text-right font-semibold">{roundLeave(safe('SL', 'balance'), 'SL')}</td>
                                  <td className="p-2 border text-right font-semibold">{roundLeave(safe('EL', 'balance'), 'EL')}</td>
                                  <td className="p-2 border text-right font-semibold">{roundLeave(safe('VAC', 'balance'), 'VAC')}</td>
                                </tr>
                              );
                              });
                            })()}
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
          <div className="print-area">
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

                      <th colSpan={2} className="p-2 border text-center font-semibold bg-blue-50">Balance: Start (Allocated)</th>

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

                        <td className="p-2 border text-right">{roundLeave(r.start_sl, 'SL')} {r.alloc_sl ? <span className="text-xs text-gray-600">({roundLeave(r.alloc_sl, 'SL')})</span> : null}</td>
                        <td className="p-2 border text-right">{roundLeave(r.start_el, 'EL')} {r.alloc_el ? <span className="text-xs text-gray-600">({roundLeave(r.alloc_el, 'EL')})</span> : null}</td>

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
