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
      setProfiles(r.data || []);
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
              <th className="text-left py-2 px-3">UserID</th>
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
                <td className="py-2 px-3">{p.userid}</td>
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
        <div className="mt-4 bg-white p-4 rounded shadow">
          <h4 className="font-semibold mb-2">{editing && editing.id ? 'Edit Employee' : 'Add Employee'}</h4>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const payload = {
              emp_id: fd.get('emp_id'), emp_name: fd.get('emp_name'), userid: fd.get('userid'), institute_id: fd.get('institute_id'), status: fd.get('status')
            };
            try {
              if (editing.id) {
                await axios.put(`/api/empprofile/${editing.id}/`, payload);
              } else {
                await axios.post('/api/empprofile/', payload);
              }
              setEditing(null);
              await load();
            } catch (err) {
              // surface server validation or error details for easier debugging
              const serverMsg = err?.response?.data ? JSON.stringify(err.response.data) : (err.message || 'Save failed');
              setError(`Save failed: ${serverMsg}`);
            }
          }}>
            <input name="emp_id" defaultValue={editing.emp_id || ''} placeholder="Emp ID" className="block w-full p-2 border rounded mb-2" />
            <input name="emp_name" defaultValue={editing.emp_name || ''} placeholder="Name" className="block w-full p-2 border rounded mb-2" />
            <input name="userid" defaultValue={editing.userid || ''} placeholder="UserID" className="block w-full p-2 border rounded mb-2" />
            <input name="institute_id" defaultValue={editing.institute_id || ''} placeholder="Institute" className="block w-full p-2 border rounded mb-2" />
            <select name="status" defaultValue={editing.status || 'Active'} className="block w-full p-2 border rounded mb-2">
              <option>Active</option>
              <option>Left</option>
            </select>
            <div className="flex gap-2">
              <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded">Save</button>
              <button type="button" onClick={() => setEditing(null)} className="px-3 py-1 bg-gray-300 rounded">Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
