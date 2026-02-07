// EmpLeavePage.jsx
import React, { useEffect, useState, Suspense, useMemo } from 'react';
import axios from '../api/axiosInstance';
import { useAuth } from '../hooks/AuthContext';
import { FaUserTie, FaChevronUp, FaChevronDown } from 'react-icons/fa';
import { parseDMY, fmtDate, toISO } from '../report/utils';
import PageTopbar from "../components/PageTopbar";

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

// Removed duplicate local definition of parseDMY. Using imported version from '../report/utils'.

// Removed duplicate local definition of fmtDate. Using imported version from '../report/utils'.


function EmpLeavePage() {
    // Panel names for topbar navigation
    const PANELS = ['Entry Leave', 'Leave Report', 'Balance Certificate', 'Calander View'];
    const [selectedPanel, setSelectedPanel] = useState('Entry Leave');
    const [panelOpen, setPanelOpen] = useState(true);
  // Field classnames for consistent styling
  const baseFieldClass = "border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";
  const readOnlyFieldClass = "border rounded px-2 py-1 text-sm bg-gray-100 text-gray-500 cursor-not-allowed";
  // parseDMY, fmtDate, toISO are now imported from '../report/utils'
  const { user } = useAuth();

  // FILTER STATES (must be top-level)
  const [yearFilter, setYearFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [recordSearch, setRecordSearch] = useState('');
  const [filterEmp, setFilterEmp] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);

  // DATA STATES
  const [leaveEntries, setLeaveEntries] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [profile, setProfile] = useState(null);

  // FORM STATE ONLY HOLDS FORM DATA
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

  // Load leave types
  useEffect(() => {
    axios.get('/api/leavetype/')
      .then(r => setLeaveTypes(normalize(r.data)))
      .catch(() => setLeaveTypes([]));
  }, []);

  // Load periods (auto-select active if present)
  useEffect(() => {
    axios.get('/api/leave-periods/')
      .then(r => {
        const pd = normalize(r.data);
        setPeriods(pd);
        if (pd.length) setSelectedPeriod(String(pd[0].id));
      })
      .catch(() => setPeriods([]));
  }, []);

  // Load employee profiles
  useEffect(() => {
    axios.get('/api/empprofile/')
      .then(r => setProfiles(normalize(r.data)))
      .catch(() => setProfiles([]));
  }, []);

  // Load leave entries
  useEffect(() => {
    axios.get('/api/leaveentry/')
      .then(r => setLeaveEntries(normalize(r.data)))
      .catch(() => setLeaveEntries([]));
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => {
      const n = { ...f, [name]: value };
      if (name === 'start_date' || name === 'end_date') {
        n.total_days = computeDays(n.start_date, n.end_date);
      }
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
              : null,
      };
      if (editingId) {
        await axios.patch(`/api/leaveentry/${editingId}/`, payload);
      } else {
        await axios.post('/api/leaveentry/', payload);
      }
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

  function getReportOrderValue(reportNo) {
    // Implement your report ordering logic here if needed
    // For now, just parse as int if possible
    const n = parseInt(reportNo, 10);
    return isNaN(n) ? 0 : n;
  }


  const handleTopbar = (p) => {
    if (selectedPanel === p) {
      setPanelOpen(o => !o);
    } else {
      setSelectedPanel(p);
      setPanelOpen(true);
    }
  };
  // ...existing return statement and JSX...
  // Filter by period date range
  const filteredEntries = useMemo(() => {
    const selectedPeriodObj = periods.find(p => String(p.id) === String(selectedPeriod));
    
    return (leaveEntries || [])
      .filter(le => {
        if (filterEmp && String(le.emp) !== String(filterEmp)) return false;

        // PERIOD FILTER (date range)
        if (selectedPeriod && selectedPeriodObj) {
          const leaveStart = parseDMY(le.start_date);
          if (!leaveStart) return false;
          
          const periodStart = new Date(selectedPeriodObj.start_date);
          const periodEnd = new Date(selectedPeriodObj.end_date);
          
          // Check if leave start date falls within period range
          if (leaveStart < periodStart || leaveStart > periodEnd) return false;
        }

        // SEARCH
        if (recordSearch.trim()) {
          const q = recordSearch.trim().toLowerCase();
          if (
            !String(le.leave_report_no || '').toLowerCase().includes(q) &&
            !String(le.emp || '').toLowerCase().includes(q) &&
            !String(le.emp_name || '').toLowerCase().includes(q)
          ) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Sort by report number (latest/highest first)
        const reportA = parseInt(a.leave_report_no, 10) || 0;
        const reportB = parseInt(b.leave_report_no, 10) || 0;
        
        if (reportB !== reportA) {
          return reportB - reportA; // Descending order (latest on top)
        }
        
        // If report numbers are equal, sort by start date (most recent first)
        const dateA = parseDMY(a.start_date)?.getTime() || 0;
        const dateB = parseDMY(b.start_date)?.getTime() || 0;
        return dateB - dateA;
      });
  }, [leaveEntries, filterEmp, selectedPeriod, periods, recordSearch]);

  const PANEL_LABELS = {
    'Entry Leave': 'Add',
    'Leave Report': 'Report',
    'Balance Certificate': 'Balance',
    'Calander View': 'Calendar',
  };

  const ACTION_TO_PANEL = Object.entries(PANEL_LABELS).reduce((acc, [panel, label]) => {
    acc[label] = panel;
    return acc;
  }, {});

  const topbarActions = Object.values(PANEL_LABELS);

  return (
    <div className="p-4 space-y-4">
      <PageTopbar
        title="Leave Management"
        leftSlot={<FaUserTie className="text-indigo-700 text-2xl" />}
        actions={topbarActions}
        selected={PANEL_LABELS[selectedPanel]}
        onSelect={(action) => {
          const panel = ACTION_TO_PANEL[action];
          if (panel) {
            handleTopbar(panel);
          }
        }}
      />

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
          <LeaveBalance user={user} selectedPeriod={selectedPeriod} setSelectedPeriod={setSelectedPeriod} />
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
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">Period:</label>
                  <select 
                    value={selectedPeriod} 
                    onChange={e => setSelectedPeriod(e.target.value)} 
                    className="border p-2 rounded text-sm min-w-[250px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">All Periods</option>
                    {periods.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.period_name} ({p.start_date} to {p.end_date})
                      </option>
                    ))}
                  </select>
                </div>

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
}

export default EmpLeavePage;
