import React, { useEffect, useState } from 'react';
import axios from '../api/axiosInstance';
import {
  getLeaveAllocations,
  createLeaveAllocation,
  updateLeaveAllocation,
  deleteLeaveAllocation,
  seedLeaveAllocations,
} from '../services/empLeaveService';

export default function AuthLeave() {
  const [tab, setTab] = useState('allocations');
  const [allocs, setAllocs] = useState([]);
  const [types, setTypes] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [editingTypeId, setEditingTypeId] = useState(null);
  const [typeForm, setTypeForm] = useState({ leave_code: '', leave_name: '', annual_allocation: '' });
  const [editingPeriodId, setEditingPeriodId] = useState(null);
  const [periodForm, setPeriodForm] = useState({ period_name: '', start_date: '', end_date: '', is_active: false });
  const [showAllocForm, setShowAllocForm] = useState(false);
  const [allocForm, setAllocForm] = useState({ emp_id: '', leave_code: '', period_id: '', allocated: '', applies_to_all: true, allocated_cl: '', allocated_sl: '', allocated_el: '', allocated_vac: '', allocated_start_date: '', allocated_end_date: '' });
  const [editingAllocId, setEditingAllocId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { loadAllocations(); loadTypes(); loadPeriods(); }, []);

  const loadAllocations = async () => {
    setLoading(true); setError(null);
    try {
      const data = await getLeaveAllocations();
      setAllocs(data || []);
    } catch (e) {
      setError('Failed to fetch allocations');
      setAllocs([]);
    }
    setLoading(false);
  };

  const loadTypes = async () => {
    try {
      const r = await axios.get('/api/leavetype/');
      setTypes((r.data && r.data.results) ? r.data.results : (r.data || []));
    } catch (e) {
      try {
        const r2 = await axios.get('/api/leavetype-compat/');
        setTypes((r2.data && r2.data.results) ? r2.data.results : (r2.data || []));
      } catch (e2) {
        setTypes([]);
      }
    }
  };

  // Only allow allocation for core leave types
  const allocationTypes = (types || []).filter(t => {
    const code = (t.leave_code || '').toString().toLowerCase();
    const name = (t.leave_name || '').toString().toLowerCase();
    return code.startsWith('cl') || code.startsWith('sl') || code.startsWith('el') || name.includes('vac');
  });

  const loadPeriods = async () => {
    try {
      const r = await axios.get('/api/leaveperiods/');
      const data = (r.data && r.data.results) ? r.data.results : (r.data || []);
      setPeriods(data);
      const active = Array.isArray(data) ? (data.find(p => p.is_active) || data[0]) : (data || undefined);
      if (active) setPeriodForm(p => ({...p, period_name: active.period_name, start_date: active.start_date, end_date: active.end_date, is_active: !!active.is_active}));
    } catch (e) {
      try {
        const r2 = await axios.get('/api/leaveperiods-compat/');
        const data = (r2.data && r2.data.results) ? r2.data.results : (r2.data || []);
        setPeriods(data);
        const active = Array.isArray(data) ? (data.find(p => p.is_active) || data[0]) : (data || undefined);
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
      const applies = allocForm.applies_to_all;
      const payload = {
        emp_id: applies ? null : (form.get('emp_id') || allocForm.emp_id || null),
        leave_type_code: applies ? null : (form.get('leave_code') || allocForm.leave_code || null),
        period_id: form.get('period_id') || allocForm.period_id || null,
      };
      if (applies) {
        payload.allocated_cl = Number(form.get('allocated_cl') || allocForm.allocated_cl || 0);
        payload.allocated_sl = Number(form.get('allocated_sl') || allocForm.allocated_sl || 0);
        payload.allocated_el = Number(form.get('allocated_el') || allocForm.allocated_el || 0);
        payload.allocated_vac = Number(form.get('allocated_vac') || allocForm.allocated_vac || 0);
      } else {
        payload.allocated = Number(form.get('allocated') || allocForm.allocated || 0);
      }
      const start = form.get('allocated_start_date') || allocForm.allocated_start_date;
      const end = form.get('allocated_end_date') || allocForm.allocated_end_date;
      if (start) payload.allocated_start_date = start;
      if (end) payload.allocated_end_date = end;
      await createLeaveAllocation(payload);
      e.target.reset();
      setAllocForm({ emp_id: '', leave_code: '', period_id: '', allocated: '', applies_to_all: true, allocated_cl: '', allocated_sl: '', allocated_el: '', allocated_vac: '', allocated_start_date: '', allocated_end_date: '' });
      loadAllocations();
    } catch (err) {
      alert('Failed to create allocation: ' + (err.response?.data?.detail || err.message));
    }
  };

  const openEditAllocation = (a) => {
    setEditingAllocId(a.id || null);
    const appliesToAll = !a.emp_id;
    setAllocForm({
      emp_id: appliesToAll ? '' : (a.emp_id || ''),
      leave_code: appliesToAll ? '' : (a.leave_code || ''),
      period_id: a.period_id || a.period || '',
      allocated: appliesToAll ? '' : (a.allocated ?? ''),
      applies_to_all: appliesToAll,
      allocated_cl: a.allocated_cl ?? '',
      allocated_sl: a.allocated_sl ?? '',
      allocated_el: a.allocated_el ?? '',
      allocated_vac: a.allocated_vac ?? '',
      allocated_start_date: a.allocated_start_date || a.allocation_start_date || '',
      allocated_end_date: a.allocated_end_date || a.allocation_end_date || '',
    });
    setShowAllocForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEditAllocation = () => {
    setEditingAllocId(null);
    setAllocForm({ emp_id: '', leave_code: '', period_id: '', allocated: '', applies_to_all: true, allocated_cl: '', allocated_sl: '', allocated_el: '', allocated_vac: '', allocated_start_date: '', allocated_end_date: '' });
    setShowAllocForm(false);
  };

  const saveAllocation = async (e) => {
    e && e.preventDefault();
    try {
      const payload = {
        emp_id: allocForm.applies_to_all ? null : (allocForm.emp_id || null),
        leave_type_code: allocForm.applies_to_all ? null : (allocForm.leave_code || null),
        period_id: allocForm.period_id || null,
      };
      if (allocForm.applies_to_all) {
        payload.allocated_cl = Number(allocForm.allocated_cl || 0);
        payload.allocated_sl = Number(allocForm.allocated_sl || 0);
        payload.allocated_el = Number(allocForm.allocated_el || 0);
        payload.allocated_vac = Number(allocForm.allocated_vac || 0);
      } else {
        payload.allocated = Number(allocForm.allocated || 0);
      }
      if (allocForm.allocated_start_date) payload.allocated_start_date = allocForm.allocated_start_date;
      if (allocForm.allocated_end_date) payload.allocated_end_date = allocForm.allocated_end_date;
      if (editingAllocId) {
        await updateLeaveAllocation(editingAllocId, payload);
      } else {
        await createLeaveAllocation(payload);
      }
      cancelEditAllocation();
      loadAllocations();
    } catch (err) {
      alert('Failed to save allocation: ' + (err.response?.data?.detail || err.message));
    }
  };

  const deleteAllocation = async (a) => {
    if (!window.confirm('Delete this allocation?')) return;
    const id = a.id;
    if (!id) {
      alert('Cannot delete allocation: missing id');
      return;
    }
    try {
      await deleteLeaveAllocation(id);
      loadAllocations();
    } catch (err) {
      alert('Failed to delete allocation: ' + (err.response?.data?.detail || err.message));
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
                  <th className="text-left py-2 px-3">Emp ID</th>
                  <th className="text-left py-2 px-3">Leave Code</th>
                  <th className="text-left py-2 px-3">Period ID</th>
                  <th className="text-left py-2 px-3">CL</th>
                  <th className="text-left py-2 px-3">SL</th>
                  <th className="text-left py-2 px-3">EL</th>
                  <th className="text-left py-2 px-3">VAC</th>
                  <th className="text-left py-2 px-3">Start Date</th>
                  <th className="text-left py-2 px-3">End Date</th>
                  <th className="text-left py-2 px-3">Allocated</th>
                  <th className="text-left py-2 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allocs.length === 0 ? (
                  <tr><td colSpan={11} className="py-6 text-center text-gray-500">No allocations or insufficient privileges</td></tr>
                ) : allocs.map(a => (
                  <tr key={a.id || `${a.emp_id || 'all'}-${a.period_id || 'period'}-${a.leave_code || 'leave'}`} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3">{a.emp_id || 'All'}</td>
                    <td className="py-2 px-3">{a.emp_id ? (a.leave_code || '') : ''}</td>
                    <td className="py-2 px-3">{a.period_id ? `${a.period_id}${a.period_name ? ` (${a.period_name})` : ''}` : (a.period_name || '')}</td>
                    <td className="py-2 px-3">{a.allocated_cl ?? ''}</td>
                    <td className="py-2 px-3">{a.allocated_sl ?? ''}</td>
                    <td className="py-2 px-3">{a.allocated_el ?? ''}</td>
                    <td className="py-2 px-3">{a.allocated_vac ?? ''}</td>
                    <td className="py-2 px-3">{a.allocated_start_date || a.allocation_start_date || ''}</td>
                    <td className="py-2 px-3">{a.allocated_end_date || a.allocation_end_date || ''}</td>
                    <td className="py-2 px-3">{a.emp_id ? (a.allocated ?? '') : ''}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center space-x-2">
                        <button onClick={() => openEditAllocation(a)} className="px-2 py-1 bg-gray-200 rounded text-xs">Edit</button>
                        <button onClick={() => deleteAllocation(a)} className="px-2 py-1 bg-red-600 text-white rounded text-xs">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add / Edit allocation form */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold">Create / Edit Allocation</h4>
              <div>
                <button onClick={() => { setShowAllocForm(s => !s); if (showAllocForm) cancelEditAllocation(); }} className="px-3 py-1 bg-blue-600 text-white rounded">{showAllocForm ? 'Close' : 'Add Allocation'}</button>
              </div>
            </div>
            {showAllocForm && (
              <form onSubmit={saveAllocation} className="max-w-2xl">
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    name="emp_id"
                    placeholder="Emp ID (leave blank for all)"
                    className="p-2 border rounded w-40"
                    value={allocForm.emp_id}
                    onChange={e => {
                      const value = e.target.value;
                      setAllocForm(f => ({
                        ...f,
                        emp_id: value,
                        applies_to_all: value.trim() === '',
                        ...(value.trim() === '' ? { leave_code: '', allocated: '' } : {}),
                      }));
                    }}
                  />
                  <select
                    name="leave_code"
                    value={allocForm.leave_code}
                    onChange={e => setAllocForm(f => ({ ...f, leave_code: e.target.value }))}
                    className="p-2 border rounded w-44"
                    disabled={allocForm.applies_to_all}
                  >
                    <option value="">Select leave type</option>
                    {types.map(t => <option key={t.id || t.leave_code} value={t.leave_code || t.id}>{t.leave_name || t.leave_code}</option>)}
                  </select>
                  <select
                    name="period_id"
                    value={allocForm.period_id}
                    onChange={e => setAllocForm(f => ({ ...f, period_id: e.target.value }))}
                    className="p-2 border rounded w-52"
                  >
                    <option value="">Select period</option>
                    {periods.map(p => <option key={p.id} value={p.id}>{p.period_name} ({p.start_date} - {p.end_date})</option>)}
                  </select>
                  {allocForm.applies_to_all ? (
                    <>
                      <input name="allocated_cl" placeholder="CL" className="p-2 border rounded w-20" type="number" step="0.5" value={allocForm.allocated_cl} onChange={e => setAllocForm(f => ({ ...f, allocated_cl: e.target.value }))} />
                      <input name="allocated_sl" placeholder="SL" className="p-2 border rounded w-20" type="number" step="0.5" value={allocForm.allocated_sl} onChange={e => setAllocForm(f => ({ ...f, allocated_sl: e.target.value }))} />
                      <input name="allocated_el" placeholder="EL" className="p-2 border rounded w-20" type="number" step="0.5" value={allocForm.allocated_el} onChange={e => setAllocForm(f => ({ ...f, allocated_el: e.target.value }))} />
                      <input name="allocated_vac" placeholder="VAC" className="p-2 border rounded w-20" type="number" step="0.5" value={allocForm.allocated_vac} onChange={e => setAllocForm(f => ({ ...f, allocated_vac: e.target.value }))} />
                    </>
                  ) : (
                    <input
                      name="allocated"
                      placeholder="Allocated"
                      className="p-2 border rounded w-24"
                      type="number"
                      step="0.5"
                      value={allocForm.allocated}
                      onChange={e => setAllocForm(f => ({ ...f, allocated: e.target.value }))}
                      disabled={allocForm.applies_to_all}
                    />
                  )}
                  <input
                    name="allocated_start_date"
                    type="date"
                    className="p-2 border rounded w-36"
                    value={allocForm.allocated_start_date}
                    onChange={e => setAllocForm(f => ({ ...f, allocated_start_date: e.target.value }))}
                  />
                  <input
                    name="allocated_end_date"
                    type="date"
                    className="p-2 border rounded w-36"
                    value={allocForm.allocated_end_date}
                    onChange={e => setAllocForm(f => ({ ...f, allocated_end_date: e.target.value }))}
                  />
                  <div className="flex items-center space-x-2">
                    <button type="submit" className="bg-green-600 text-white px-3 py-1 rounded">{editingAllocId ? 'Save' : 'Create'}</button>
                    <button type="button" onClick={cancelEditAllocation} className="px-3 py-1 rounded border">Cancel</button>
                  </div>
                </div>
              </form>
            )}
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
                  const resp = await seedLeaveAllocations(period_id);
                  alert(`Seed result: created=${resp.created} skipped=${resp.skipped}`);
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
