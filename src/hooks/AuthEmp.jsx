import React, { useEffect, useState } from 'react';
import axios from '../api/axiosInstance';
import { useAuth } from './AuthContext';

// Helpers for safe display and date handling
const cleanValue = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' && v.toLowerCase() === 'nan') return '';
  return v;
};

// For input[type="date"] values (YYYY-MM-DD)
const toISODate = (v) => {
  if (!v) return '';
  return String(v).split('T')[0].split(' ')[0];
};

// For read-only display (dd-MMM-yyyy)
const toDisplayDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export default function AuthEmp() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { fetchUsers } = useAuth();
  const [editing, setEditing] = useState(null);
  const [readOnly, setReadOnly] = useState(false);   // true = view mode, false = edit/add

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await axios.get('/empprofile/');
      const data = r.data;
      if (Array.isArray(data)) {
        setProfiles(data);
      } else if (data && Array.isArray(data.results)) {
        setProfiles(data.results);
      } else {
        setProfiles([]);
      }
    } catch (e) {
      const msg = e?.response?.data ? JSON.stringify(e.response.data) : (e.message || 'Failed to fetch employee profiles');
      setError(`Failed to fetch employee profiles: ${msg}`);
      setProfiles([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Open a profile in view or edit mode. We fetch the
  // full detail record to ensure all fields (like left_date)
  // are present and up to date.
  const openProfile = async (profile, editable) => {
    try {
      if (profile?.id) {
        const resp = await axios.get(`/empprofile/${profile.id}/`);
        setEditing(resp.data);
      } else {
        setEditing(profile || {});
      }
    } catch (e) {
      // Fallback: at least show whatever we already have
      setEditing(profile || {});
    }
    setReadOnly(!editable);
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-3">Employee Profiles</h3>

      <div className="mb-3">
        <button onClick={load} className="px-3 py-1 bg-blue-600 text-white rounded">Refresh</button>
        <button
            onClick={() => { openProfile({}, true); }}
          className="ml-2 px-3 py-1 bg-green-600 text-white rounded"
        >
          Add
        </button>
      </div>

      {editing && (
        <div className="mb-4 bg-white p-6 rounded shadow max-h-[80vh] overflow-y-auto">
          <h4 className="text-xl font-semibold mb-4 pb-2 border-b">
            {editing.id ? (readOnly ? 'View Employee' : 'Edit Employee') : 'Add Employee'}
          </h4>

          <form
            key={editing?.id || 'new'}
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.target);
              const payload = {
                emp_id: fd.get('emp_id'),
                emp_name: fd.get('emp_name'),
                emp_short: fd.get('emp_short') ? Number(fd.get('emp_short')) : null,
                emp_designation: fd.get('emp_designation') || null,
                leave_group: fd.get('leave_group') || null,

                ...(fd.get('actual_joining') && { actual_joining: fd.get('actual_joining') }),
                ...(fd.get('department_joining') && { department_joining: fd.get('department_joining') }),
                ...(fd.get('leave_calculation_date') && { leave_calculation_date: fd.get('leave_calculation_date') }),
                ...(fd.get('left_date') && { left_date: fd.get('left_date') }),
                ...(fd.get('emp_birth_date') && { emp_birth_date: fd.get('emp_birth_date') }),
                ...(fd.get('usr_birth_date') && { usr_birth_date: fd.get('usr_birth_date') }),

                institute_id: fd.get('institute_id') || null,
                username: fd.get('username') || null,
                usercode: fd.get('usercode') || null,
                status: fd.get('status'),

                el_balance: fd.get('el_balance') ? Number(fd.get('el_balance')) : 0,
                sl_balance: fd.get('sl_balance') ? Number(fd.get('sl_balance')) : 0,
                cl_balance: fd.get('cl_balance') ? Number(fd.get('cl_balance')) : 0,
                vacation_balance: fd.get('vacation_balance') ? Number(fd.get('vacation_balance')) : 0,

                joining_year_allocation_el: fd.get('joining_year_allocation_el') ? Number(fd.get('joining_year_allocation_el')) : 0,
                joining_year_allocation_sl: fd.get('joining_year_allocation_sl') ? Number(fd.get('joining_year_allocation_sl')) : 0,
                joining_year_allocation_cl: fd.get('joining_year_allocation_cl') ? Number(fd.get('joining_year_allocation_cl')) : 0,
                joining_year_allocation_vac: fd.get('joining_year_allocation_vac') ? Number(fd.get('joining_year_allocation_vac')) : 0,
              };

              Object.keys(payload).forEach((k) => {
                if (payload[k] === null || payload[k] === '') delete payload[k];
              });

              try {
                if (editing.id) {
                  await axios.put(`/empprofile/${editing.id}/`, payload);
                } else {
                  await axios.post('/empprofile/', payload);
                }
                setEditing(null);
                setReadOnly(false);
                await load();
              } catch (err) {
                const msg = err?.response?.data ? JSON.stringify(err.response.data) : err.message;
                setError(`Save failed: ${msg}`);
              }
            }}
          >
          <fieldset disabled={readOnly}>

            {/* ================= BASIC EMPLOYEE INFORMATION ================= */}
            <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <h5 className="text-sm font-semibold text-gray-700 mb-3">Basic Employee Information</h5>
              
              {/* Row 1: Emp ID, Employee Name (wide center), Designation */}
              <div className="grid grid-cols-6 gap-4 items-end mb-3">
                <div className="flex flex-col col-span-1">
                  <label className="text-xs text-gray-600 mb-1">Emp ID</label>
                  <input
                    name="emp_id"
                    maxLength={15}
                    defaultValue={cleanValue(editing.emp_id)}
                    className="h-10 w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="flex flex-col col-span-3">
                  <label className="text-xs text-gray-600 mb-1">Employee Name</label>
                  <input
                    name="emp_name"
                    defaultValue={cleanValue(editing.emp_name)}
                    className="h-10 w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex flex-col col-span-2">
                  <label className="text-xs text-gray-600 mb-1">Designation</label>
                  <input
                    name="emp_designation"
                    defaultValue={cleanValue(editing.emp_designation)}
                    className="h-10 w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Row 2: Status, Leave Group, Institute ID, Emp Short, Username, Usercode */}
              <div className="grid grid-cols-6 gap-4 items-end">
                <div className="flex flex-col">
                  <label className="text-xs text-gray-600 mb-1">Status</label>
                  <select
                    name="status"
                    defaultValue={editing.status || 'Cont'}
                    className="h-10 w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="Cont">Cont</option>
                    <option value="Active">Active</option>
                    <option value="Left">Left</option>
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-gray-600 mb-1">Leave Group</label>
                  <input
                    name="leave_group"
                    defaultValue={cleanValue(editing.leave_group)}
                    className="h-10 w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-gray-600 mb-1">Institute ID</label>
                  <input
                    name="institute_id"
                    maxLength={10}
                    defaultValue={cleanValue(editing.institute_id)}
                    className="h-10 w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-gray-600 mb-1">Emp Short</label>
                  <input
                    name="emp_short"
                    maxLength={10}
                    defaultValue={cleanValue(editing.emp_short)}
                    className="h-10 w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-gray-600 mb-1">Username</label>
                  <input
                    name="username"
                    defaultValue={cleanValue(editing.username)}
                    className="h-10 w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-gray-600 mb-1">Usercode</label>
                  <input
                    name="usercode"
                    maxLength={10}
                    defaultValue={cleanValue(editing.usercode)}
                    className="h-10 w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* ================= EMPLOYMENT & DATES + LEAVE INFO (SIDE BY SIDE) ================= */}
            <div className="mb-6 grid grid-cols-2 gap-6 items-stretch">

              {/* EMPLOYMENT & DATES */}
              <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 h-full flex flex-col">
                <h5 className="text-sm font-semibold text-gray-700 mb-3">Employment & Dates</h5>
                
                <div className="grid grid-cols-3 gap-4 items-end mb-3">
                  <div className="flex flex-col">
                    <label className="text-xs text-gray-600 mb-1">Actual Joining</label>
                    {readOnly ? (
                      <input
                        type="text"
                        disabled
                        defaultValue={toDisplayDate(editing.actual_joining)}
                        className="h-10 w-full px-3 py-2 border border-gray-300 rounded bg-gray-100"
                      />
                    ) : (
                      <input
                        type="date"
                        name="actual_joining"
                        defaultValue={toISODate(editing.actual_joining)}
                        className="h-10 w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs text-gray-600 mb-1">Department Joining</label>
                    {readOnly ? (
                      <input
                        type="text"
                        disabled
                        defaultValue={toDisplayDate(editing.department_joining)}
                        className="h-10 w-full px-3 py-2 border border-gray-300 rounded bg-gray-100"
                      />
                    ) : (
                      <input
                        type="date"
                        name="department_joining"
                        defaultValue={toISODate(editing.department_joining)}
                        className="h-10 w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs text-gray-600 mb-1">Leave Calculation Start Date</label>
                    {readOnly ? (
                      <input
                        type="text"
                        disabled
                        defaultValue={toDisplayDate(editing.leave_calculation_date)}
                        className="h-10 w-full px-3 py-2 border border-gray-300 rounded bg-gray-100"
                      />
                    ) : (
                      <input
                        type="date"
                        name="leave_calculation_date"
                        defaultValue={toISODate(editing.leave_calculation_date)}
                        className="h-10 w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 items-end mt-auto">
                  <div className="flex flex-col">
                    <label className="text-xs text-gray-600 mb-1">Left Date</label>
                    {readOnly ? (
                      <input
                        type="text"
                        disabled
                        defaultValue={toDisplayDate(editing.left_date)}
                        className="h-10 w-full px-3 py-2 border border-gray-300 rounded bg-gray-100"
                      />
                    ) : (
                      <input
                        type="date"
                        name="left_date"
                        defaultValue={toISODate(editing.left_date)}
                        className="h-10 w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <label className="text-xs text-gray-600 mb-1">Emp Birth Date</label>
                    {readOnly ? (
                      <input
                        type="text"
                        disabled
                        defaultValue={toDisplayDate(editing.emp_birth_date)}
                        className="h-10 w-full px-3 py-2 border border-gray-300 rounded bg-gray-100"
                      />
                    ) : (
                      <input
                        type="date"
                        name="emp_birth_date"
                        defaultValue={toISODate(editing.emp_birth_date)}
                        className="h-10 w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* LEAVE INFORMATION */}
              <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 h-full flex flex-col">
                <h5 className="text-sm font-semibold text-gray-700 mb-3">Leave Information</h5>
                
                <div className="grid grid-cols-2 gap-6 flex-grow">
                  {/* LEAVE BALANCES */}
                  <div>
                    <div className="text-xs font-semibold text-gray-600 mb-2">Leave Balances</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col">
                        <label className="text-xs text-gray-600 mb-1">EL Balance</label>
                        <input 
                          name="el_balance" 
                          type="number" 
                          step="0.01"
                          defaultValue={editing.el_balance || 0}
                          className="h-10 w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-xs text-gray-600 mb-1">SL Balance</label>
                        <input 
                          name="sl_balance" 
                          type="number" 
                          step="0.01"
                          defaultValue={editing.sl_balance || 0}
                          className="h-10 w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-xs text-gray-600 mb-1">CL Balance</label>
                        <input 
                          name="cl_balance" 
                          type="number" 
                          step="0.01"
                          defaultValue={editing.cl_balance || 0}
                          className="h-10 w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-xs text-gray-600 mb-1">VAC Balance</label>
                        <input 
                          name="vacation_balance" 
                          type="number" 
                          step="0.01"
                          defaultValue={editing.vacation_balance || 0}
                          className="h-10 w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        />
                      </div>
                    </div>
                  </div>

                  {/* JOINING YEAR ALLOCATION */}
                  <div>
                    <div className="text-xs font-semibold text-gray-600 mb-2">Joining Year Allocation</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col">
                        <label className="text-xs text-gray-600 mb-1">EL Allocation</label>
                        <input 
                          name="joining_year_allocation_el" 
                          type="number" 
                          step="0.01"
                          defaultValue={editing.joining_year_allocation_el || 0}
                          className="h-10 w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-xs text-gray-600 mb-1">SL Allocation</label>
                        <input 
                          name="joining_year_allocation_sl" 
                          type="number" 
                          step="0.01"
                          defaultValue={editing.joining_year_allocation_sl || 0}
                          className="h-10 w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-xs text-gray-600 mb-1">CL Allocation</label>
                        <input 
                          name="joining_year_allocation_cl" 
                          type="number" 
                          step="0.01"
                          defaultValue={editing.joining_year_allocation_cl || 0}
                          className="h-10 w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-xs text-gray-600 mb-1">VAC Allocation</label>
                        <input 
                          name="joining_year_allocation_vac" 
                          type="number" 
                          step="0.01"
                          defaultValue={editing.joining_year_allocation_vac || 0}
                          className="h-10 w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>

          </fieldset>

            {/* Bottom actions: only show when in edit mode.
                View mode is controlled by clicking rows / table Edit button. */}
            {!readOnly && (
              <div className="flex gap-2 mt-4">
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Save</button>
                <button
                  type="button"
                  onClick={() => { setEditing(null); setReadOnly(false); }}
                  className="px-4 py-2 bg-gray-300 rounded"
                >
                  Cancel
                </button>
              </div>
            )}

          </form>
        </div>
      )}

      {loading && <div>Loading...</div>}
      {error && <div className="text-red-500">{error}</div>}

      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-2 px-3 text-left">Emp ID</th>
              <th className="py-2 px-3 text-left">Name</th>
              <th className="py-2 px-3 text-left">Username / Usercode</th>
              <th className="py-2 px-3 text-left">Status</th>
              <th className="py-2 px-3 text-left">Institute</th>
            </tr>
          </thead>
          <tbody>
            {profiles.length === 0 ? (
              <tr><td colSpan={5} className="py-6 text-center text-gray-500">No employee profiles found</td></tr>
            ) : profiles.map(p => (
              <tr
                key={p.id}
                className="border-b hover:bg-gray-50 cursor-pointer"
                onClick={() => { openProfile(p, false); }}
              >
                <td className="py-2 px-3">{p.emp_id}</td>
                <td className="py-2 px-3">{p.emp_name}</td>
                <td className="py-2 px-3">{p.username || p.usercode}</td>
                <td className="py-2 px-3">{p.status}</td>
                <td className="py-2 px-3">{p.institute_id}</td>
                <td className="py-2 px-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); openProfile(p, true); }}
                    className="px-2 py-1 bg-yellow-500 text-white rounded"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
