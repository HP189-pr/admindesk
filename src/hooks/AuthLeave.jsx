import React, { useEffect, useState } from 'react';
import axios from '../api/axiosInstance';

export default function AuthLeave() {
  const [tab, setTab] = useState('allocations');
  const [allocs, setAllocs] = useState([]);
  const [types, setTypes] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [editingTypeId, setEditingTypeId] = useState(null);
  const [typeForm, setTypeForm] = useState({ leave_code: '', leave_name: '', annual_allocation: '' });
  const [editingPeriodId, setEditingPeriodId] = useState(null);
  const [periodForm, setPeriodForm] = useState({ period_name: '', start_date: '', end_date: '', is_active: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { loadAllocations(); loadTypes(); loadPeriods(); }, []);

  const loadAllocations = async () => {
    setLoading(true); setError(null);
    try {
      const r = await axios.get('/api/leave-allocations/');
      setAllocs(r.data || []);
    } catch (e) {
      setError('Failed to fetch allocations');
      setAllocs([]);
    }
    setLoading(false);
  };

  const loadTypes = async () => {
    try {
      const r = await axios.get('/api/leavetype/');
      setTypes(r.data || []);
    } catch (e) {
      try {
        const r2 = await axios.get('/api/leavetype-compat/');
        setTypes(r2.data || []);
      } catch (e2) {
        setTypes([]);
      }
    }
  };

  const loadPeriods = async () => {
    try {
      const r = await axios.get('/api/leaveperiods/');
      const data = r.data || [];
      setPeriods(data);
      const active = data.find(p => p.is_active) || data[0];
      if (active) setPeriodForm(p => ({...p, period_name: active.period_name, start_date: active.start_date, end_date: active.end_date, is_active: !!active.is_active}));
    } catch (e) {
      try {
        const r2 = await axios.get('/api/leaveperiods-compat/');
        const data = r2.data || [];
        setPeriods(data);
        const active = data.find(p => p.is_active) || data[0];
        if (active) setPeriodForm(p => ({...p, period_name: active.period_name, start_date: active.start_date, end_date: active.end_date, is_active: !!active.is_active}));
      } catch (e2) {
        setPeriods([]);
      }
    }
  };

  const createType = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        leave_code: typeForm.leave_code,
        leave_name: typeForm.leave_name,
        annual_allocation: typeForm.annual_allocation || 0,
      };
      // Use compatibility endpoints (SQL-backed) which are stable when ORM model differs
      if (editingTypeId) {
        await axios.put(`/api/leavetype-compat/${editingTypeId}/`, payload);
      } else {
        await axios.post('/api/leavetype-compat/', payload);
      }
      setTypeForm({ leave_code: '', leave_name: '', annual_allocation: '' });
      setEditingTypeId(null);
      loadTypes();
    } catch (err) {
      alert('Failed to save leave type: ' + (err.response?.data?.detail || err.message));
    }
  };

  const createPeriod = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        period_name: periodForm.period_name,
        start_date: periodForm.start_date,
        end_date: periodForm.end_date,
        is_active: !!periodForm.is_active,
      };
      if (editingPeriodId) {
        await axios.put(`/api/leaveperiods/${editingPeriodId}/`, payload);
      } else {
        await axios.post('/api/leaveperiods/', payload);
      }
      setPeriodForm({ period_name: '', start_date: '', end_date: '', is_active: false });
      setEditingPeriodId(null);
      loadPeriods();
    } catch (err) {
      alert('Failed to save period: ' + (err.response?.data?.detail || err.message));
    }
  };

  const createAllocation = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      await axios.post('/api/leave-allocations/', {
        profile: form.get('profile'),
        leave_type: form.get('leave_type'),
        period: form.get('period'),
        allocated: form.get('allocated') || 0,
      });
      e.target.reset();
      loadAllocations();
    } catch (err) {
      alert('Failed to create allocation');
    }
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-3">Leave Management</h3>
      <div className="mb-4">
        <button className={`px-3 py-1 mr-2 ${tab==='allocations'?'bg-blue-600 text-white':'bg-gray-200'}`} onClick={() => setTab('allocations')}>Allocations</button>
        <button className={`px-3 py-1 mr-2 ${tab==='types'?'bg-blue-600 text-white':'bg-gray-200'}`} onClick={() => setTab('types')}>Leave Types</button>
        <button className={`px-3 py-1 ${tab==='periods'?'bg-blue-600 text-white':'bg-gray-200'}`} onClick={() => setTab('periods')}>Leave Periods</button>
      </div>

      {tab === 'allocations' && (
        <div>
          <div className="mb-3"><button onClick={loadAllocations} className="px-3 py-1 bg-blue-600 text-white rounded">Refresh</button></div>
          {loading && <div>Loading...</div>}
          {error && <div className="text-red-500">{error}</div>}
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-2 px-3">Employee</th>
                  <th className="text-left py-2 px-3">Leave Type</th>
                  <th className="text-left py-2 px-3">Period</th>
                  <th className="text-left py-2 px-3">Allocated</th>
                  <th className="text-left py-2 px-3">Used</th>
                  <th className="text-left py-2 px-3">Balance</th>
                </tr>
              </thead>
              <tbody>
                {allocs.length === 0 ? (
                  <tr><td colSpan={6} className="py-6 text-center text-gray-500">No allocations or insufficient privileges</td></tr>
                ) : allocs.map(a => (
                  <tr key={`${a.profile}-${a.leave_type}`} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3">{a.profile}</td>
                    <td className="py-2 px-3">{a.leave_type_name}</td>
                    <td className="py-2 px-3">{a.period}</td>
                    <td className="py-2 px-3">{a.allocated}</td>
                    <td className="py-2 px-3">{a.used}</td>
                    <td className="py-2 px-3">{a.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6">
            <h4 className="font-semibold mb-2">Allocations (period-level)</h4>
            <p className="text-sm text-gray-600">Allocations are seeded automatically from active leave period using Leave Type annual allocation. Use the button below to (re-)seed allocations for the active period or a specific period.</p>
            <div className="mt-3 flex items-center space-x-3">
              <select id="seed-period" className="p-2 border rounded">
                <option value="">Active period</option>
                {periods.map(p => <option key={p.id} value={p.id}>{p.period_name} ({p.start_date} - {p.end_date})</option>)}
              </select>
              <button onClick={async () => {
                const sel = document.getElementById('seed-period');
                const period_id = sel ? sel.value : null;
                try {
                  const resp = await axios.post('/api/seed-leave-allocations/', period_id ? { period_id } : {});
                  alert(`Seed result: created=${resp.data.created} skipped=${resp.data.skipped}`);
                  loadAllocations();
                } catch (err) {
                  alert('Failed to seed allocations: ' + (err.response?.data?.detail || err.message));
                }
              }} className="bg-yellow-600 text-white px-3 py-1 rounded">Seed Allocations</button>
            </div>
          </div>
        </div>
      )}

          {tab === 'types' && (
        <div>
          <h4 className="font-semibold mb-2">Leave Types</h4>
          <div className="mb-4">
            <form onSubmit={createType} className="grid grid-cols-3 gap-3 max-w-xl">
              <input name="leave_code" placeholder="Code" className="p-2 border rounded" required value={typeForm.leave_code} onChange={e => setTypeForm(f => ({...f, leave_code: e.target.value}))} disabled={!!editingTypeId} />
              <input name="leave_name" placeholder="Name" className="p-2 border rounded" required value={typeForm.leave_name} onChange={e => setTypeForm(f => ({...f, leave_name: e.target.value}))} />
              <input name="annual_allocation" placeholder="Annual" className="p-2 border rounded" type="number" step="0.01" value={typeForm.annual_allocation} onChange={e => setTypeForm(f => ({...f, annual_allocation: e.target.value}))} />
              <div />
              <div />
              <div className="flex items-center space-x-2">
                <button type="submit" className="bg-green-600 text-white px-3 py-1 rounded">{editingTypeId ? 'Save' : 'Create'}</button>
                {editingTypeId && <button type="button" className="px-3 py-1 rounded border" onClick={() => { setEditingTypeId(null); setTypeForm({ leave_code: '', leave_name: '', annual_allocation: '' }); }}>Cancel</button>}
              </div>
            </form>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="p-2">Code</th><th className="p-2">Name</th><th className="p-2">Annual</th></tr></thead>
              <tbody>{types.map(t => {
                const key = t.leave_code || t.id;
                return (
                  <tr key={key} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => { setEditingTypeId(t.id || t.leave_code); setTypeForm({ leave_code: t.leave_code, leave_name: t.leave_name, annual_allocation: t.annual_allocation || t.annual_limit || '' }); setTab('types'); }}>
                    <td className="p-2">{t.leave_code}</td><td className="p-2">{t.leave_name}</td><td className="p-2">{t.annual_allocation ?? t.annual_limit}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'periods' && (
        <div>
          <h4 className="font-semibold mb-2">Leave Periods</h4>
          <div className="mb-4">
            <form onSubmit={createPeriod} className="grid grid-cols-3 gap-3 max-w-xl">
              <input name="period_name" placeholder="Name" className="p-2 border rounded" required value={periodForm.period_name} onChange={e => setPeriodForm(f => ({...f, period_name: e.target.value}))} />
              <input name="start_date" placeholder="Start" type="date" className="p-2 border rounded" required value={periodForm.start_date} onChange={e => setPeriodForm(f => ({...f, start_date: e.target.value}))} />
              <input name="end_date" placeholder="End" type="date" className="p-2 border rounded" required value={periodForm.end_date} onChange={e => setPeriodForm(f => ({...f, end_date: e.target.value}))} />
              <label className="col-span-2"><input type="checkbox" name="is_active" checked={!!periodForm.is_active} onChange={e => setPeriodForm(f => ({...f, is_active: e.target.checked}))} /> Active</label>
              <div className="flex items-center space-x-2">
                <button className="bg-green-600 text-white px-3 py-1 rounded">{editingPeriodId ? 'Save' : 'Create Period'}</button>
                {editingPeriodId && <button type="button" className="px-3 py-1 rounded border" onClick={() => { setEditingPeriodId(null); setPeriodForm({ period_name: '', start_date: '', end_date: '', is_active: false }); }}>Cancel</button>}
              </div>
            </form>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="p-2">Name</th><th className="p-2">Start</th><th className="p-2">End</th><th className="p-2">Active</th></tr></thead>
              <tbody>{periods.map(p => (
                <tr key={p.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => { setEditingPeriodId(p.id); setPeriodForm({ period_name: p.period_name, start_date: p.start_date, end_date: p.end_date, is_active: !!p.is_active }); setTab('periods'); }}>
                  <td className="p-2">{p.period_name}</td><td className="p-2">{p.start_date}</td><td className="p-2">{p.end_date}</td><td className="p-2">{p.is_active ? 'Yes' : 'No'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
