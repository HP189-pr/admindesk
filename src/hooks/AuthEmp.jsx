import React, { useEffect, useState } from 'react';
import axios from '../api/axiosInstance';
import { useAuth } from './AuthContext';

export default function AuthEmp() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { fetchUsers } = useAuth();
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await axios.get('/api/empprofile/');
      // Normalize response - handle both array and object with results property
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

  return (
    <div>
      <h3 className="text-lg font-semibold mb-3">Employee Profiles</h3>
      <div className="mb-3">
        <button onClick={load} className="px-3 py-1 bg-blue-600 text-white rounded">Refresh</button>
        <button onClick={() => setEditing({})} className="ml-2 px-3 py-1 bg-green-600 text-white rounded">Add</button>
      </div>
      {loading && <div>Loading...</div>}
      {error && <div className="text-red-500">{error}</div>}
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
                <th className="text-left py-2 px-3">Emp ID</th>
                <th className="text-left py-2 px-3">Name</th>
                <th className="text-left py-2 px-3">Username / Usercode</th>
                <th className="text-left py-2 px-3">Status</th>
                <th className="text-left py-2 px-3">Institute</th>
              </tr>
          </thead>
          <tbody>
            {profiles.length === 0 ? (
              <tr><td colSpan={5} className="py-6 text-center text-gray-500">No employee profiles found</td></tr>
            ) : profiles.map(p => (
              <tr key={p.id} className="border-b hover:bg-gray-50">
                <td className="py-2 px-3">{p.emp_id}</td>
                <td className="py-2 px-3">{p.emp_name}</td>
                <td className="py-2 px-3">{p.username || p.usercode}</td>
                <td className="py-2 px-3">{p.status}</td>
                <td className="py-2 px-3">{p.institute_id}</td>
                <td className="py-2 px-3">
                  <button onClick={() => setEditing(p)} className="px-2 py-1 bg-yellow-500 text-white rounded">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <div className="mt-4 bg-white p-4 rounded shadow max-h-[70vh] overflow-y-auto">
          <h4 className="font-semibold mb-2">{editing && editing.id ? 'Edit Employee' : 'Add Employee'}</h4>
            <form onSubmit={async (e) => {
            e.preventDefault();
              const fd = new FormData(e.target);
              const payload = {
                emp_id: fd.get('emp_id'),
                emp_name: fd.get('emp_name'),
                emp_short: fd.get('emp_short') ? Number(fd.get('emp_short')) : null,
                emp_designation: fd.get('emp_designation') || null,
                leave_group: fd.get('leave_group') || null,
                // Date fields - only include if they have valid values
                ...(fd.get('actual_joining') && { actual_joining: fd.get('actual_joining') }),
                ...(fd.get('left_date') && { left_date: fd.get('left_date') }),
                ...(fd.get('emp_birth_date') && { emp_birth_date: fd.get('emp_birth_date') }),
                ...(fd.get('usr_birth_date') && { usr_birth_date: fd.get('usr_birth_date') }),
                ...(fd.get('leave_calculation_date') && { leave_calculation_date: fd.get('leave_calculation_date') }),
                department_joining: fd.get('department_joining') || null,
                institute_id: fd.get('institute_id') || null,
                username: fd.get('username') || null,
                usercode: fd.get('usercode') || null,
                status: fd.get('status'),
                el_balance: fd.get('el_balance') ? Number(fd.get('el_balance')) : 0,
                sl_balance: fd.get('sl_balance') ? Number(fd.get('sl_balance')) : 0,
                cl_balance: fd.get('cl_balance') ? Number(fd.get('cl_balance')) : 0,
                vacation_balance: fd.get('vacation_balance') ? Number(fd.get('vacation_balance')) : 0,
                joining_year_allocation_el: fd.get('joining_year_allocation_el') ? Number(fd.get('joining_year_allocation_el')) : 0,
                joining_year_allocation_cl: fd.get('joining_year_allocation_cl') ? Number(fd.get('joining_year_allocation_cl')) : 0,
                joining_year_allocation_sl: fd.get('joining_year_allocation_sl') ? Number(fd.get('joining_year_allocation_sl')) : 0,
                joining_year_allocation_vac: fd.get('joining_year_allocation_vac') ? Number(fd.get('joining_year_allocation_vac')) : 0,
              };              // Remove null/empty values to avoid validation errors
              Object.keys(payload).forEach(key => {
                if (payload[key] === null || payload[key] === '') {
                  delete payload[key];
                }
              });
              
            try {
              if (editing.id) {
                await axios.put(`/api/empprofile/${editing.id}/`, payload);
              } else {
                await axios.post('/api/empprofile/', payload);
              }
              setEditing(null);
              await load();
              setError(null); // Clear any previous errors
            } catch (err) {
              // surface server validation or error details for easier debugging
              const serverMsg = err?.response?.data ? JSON.stringify(err.response.data) : (err.message || 'Save failed');
              setError(`Save failed: ${serverMsg}`);
              console.error('Save error:', err.response?.data); // Log detailed error
            }
          }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Basic Info */}
              <div>
                <label className="block text-sm font-medium mb-1">Emp ID *</label>
                <input name="emp_id" defaultValue={editing.emp_id || ''} placeholder="Emp ID" required className="block w-full p-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Emp Short</label>
                <input name="emp_short" type="number" defaultValue={editing.emp_short || ''} placeholder="Emp Short ID" className="block w-full p-2 border rounded" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input name="emp_name" defaultValue={editing.emp_name || ''} placeholder="Full Name" required className="block w-full p-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Designation</label>
                <input name="emp_designation" defaultValue={editing.emp_designation || ''} placeholder="Designation" className="block w-full p-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Leave Group</label>
                <input name="leave_group" defaultValue={editing.leave_group || ''} placeholder="Leave Group" className="block w-full p-2 border rounded" />
              </div>
              
              {/* Dates */}
              <div>
                <label className="block text-sm font-medium mb-1">Actual Joining Date</label>
                <input name="actual_joining" type="date" defaultValue={editing.actual_joining || ''} className="block w-full p-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Left Date</label>
                <input name="left_date" type="date" defaultValue={editing.left_date || ''} className="block w-full p-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Employee Birth Date</label>
                <input name="emp_birth_date" type="date" defaultValue={editing.emp_birth_date || ''} className="block w-full p-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">User Birth Date</label>
                <input name="usr_birth_date" type="date" defaultValue={editing.usr_birth_date || ''} className="block w-full p-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Leave Calculation Date</label>
                <input name="leave_calculation_date" type="date" defaultValue={editing.leave_calculation_date || ''} className="block w-full p-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Department Joining</label>
                <input name="department_joining" defaultValue={editing.department_joining || ''} placeholder="Department" className="block w-full p-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Institute ID</label>
                <input name="institute_id" defaultValue={editing.institute_id || ''} placeholder="Institute" className="block w-full p-2 border rounded" />
              </div>
              
              {/* Auth Info */}
              <div>
                <label className="block text-sm font-medium mb-1">Username</label>
                <input name="username" defaultValue={editing.username || ''} placeholder="Username" className="block w-full p-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Usercode</label>
                <input name="usercode" defaultValue={editing.usercode || ''} placeholder="Usercode" className="block w-full p-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status *</label>
                <select name="status" defaultValue={editing.status || 'Cont'} required className="block w-full p-2 border rounded">
                  <option value="Cont">Cont (Currently Working)</option>
                  <option value="Left">Left</option>
                  <option value="Active">Active</option>
                </select>
              </div>
              
              {/* Leave Balances */}
              <div className="md:col-span-2 mt-3">
                <h5 className="font-semibold text-sm mb-2">Leave Balances</h5>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">EL Balance</label>
                <input name="el_balance" type="number" step="0.01" defaultValue={editing.el_balance || 0} className="block w-full p-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">SL Balance</label>
                <input name="sl_balance" type="number" step="0.01" defaultValue={editing.sl_balance || 0} className="block w-full p-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">CL Balance</label>
                <input name="cl_balance" type="number" step="0.01" defaultValue={editing.cl_balance || 0} className="block w-full p-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Vacation Balance</label>
                <input name="vacation_balance" type="number" step="0.01" defaultValue={editing.vacation_balance || 0} className="block w-full p-2 border rounded" />
              </div>
              
              {/* Joining Year Allocations */}
              <div className="md:col-span-2 mt-3">
                <h5 className="font-semibold text-sm mb-2">Joining Year Allocations</h5>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">EL Allocation</label>
                <input name="joining_year_allocation_el" type="number" step="0.01" defaultValue={editing.joining_year_allocation_el || 0} className="block w-full p-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">SL Allocation</label>
                <input name="joining_year_allocation_sl" type="number" step="0.01" defaultValue={editing.joining_year_allocation_sl || 0} className="block w-full p-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">CL Allocation</label>
                <input name="joining_year_allocation_cl" type="number" step="0.01" defaultValue={editing.joining_year_allocation_cl || 0} className="block w-full p-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">VAC Allocation</label>
                <input name="joining_year_allocation_vac" type="number" step="0.01" defaultValue={editing.joining_year_allocation_vac || 0} className="block w-full p-2 border rounded" />
              </div>
            </div>
            
            <div className="flex gap-2 mt-4">
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Save</button>
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 bg-gray-300 rounded">Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
