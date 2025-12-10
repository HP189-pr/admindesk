// src/components/AuthLeave.jsx
import React, { useEffect, useState } from 'react';
import axios from '../api/axiosInstance';

/**
 * AuthLeave component
 *
 * - Works with new backend endpoints (see README snippet in conversation).
 * - Endpoints used:
 *   GET  /api/leavetype/
 *   GET  /api/leave-periods/
 *   GET  /api/leave-allocations/?period=<id>
 *   POST /api/leave-allocations/
 *   PATCH /api/leave-allocations/<id>/
 *   DELETE /api/leave-allocations/<id>/
 *
 * Notes:
 * - For "All employees" allocation, send emp_id = null (leave emp_id empty).
 * - Date format for backend: YYYY-MM-DD
 */

export default function AuthLeave() {
  const [tab, setTab] = useState('allocations');

  // Data stores
  const [allocs, setAllocs] = useState([]);
  const [types, setTypes] = useState([]);
  const [periods, setPeriods] = useState([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Forms & editing
  const [showAllocForm, setShowAllocForm] = useState(false);
  const [editingAllocId, setEditingAllocId] = useState(null);
  const [allocForm, setAllocForm] = useState({
    emp_id: '',
    leave_code: '',
    period_id: '',
    allocated: '',
    allocated_start_date: '',
    allocated_end_date: '',
    apply_to: '', // "ALL" or "PARTICULAR" (frontend convenience)
  });

  const [typeForm, setTypeForm] = useState({ 
    leave_code: '', 
    leave_name: '', 
    main_type: '', 
    day_value: '1', 
    session: '', 
    annual_allocation: '', 
    is_half: false 
  });
  const [editingTypeId, setEditingTypeId] = useState(null);

  const [periodForm, setPeriodForm] = useState({ period_name: '', start_date: '', end_date: '' });
  const [editingPeriodId, setEditingPeriodId] = useState(null);

  // Selected period filter (default to latest)
  const [selectedPeriod, setSelectedPeriod] = useState(null);

  useEffect(() => {
    loadTypes();
    loadPeriods();
  }, []);

  useEffect(() => {
    // Load allocations whenever selectedPeriod changes
    loadAllocations(selectedPeriod);
  }, [selectedPeriod]);

  // ----------------------------
  // API: Leave Types
  // ----------------------------
  async function loadTypes() {
    try {
      const res = await axios.get('/api/leavetype/');
      
      // DRF ViewSet returns array directly for list endpoint
      let data = [];
      if (Array.isArray(res.data)) {
        data = res.data;
      } else if (res.data && res.data.results) {
        data = res.data.results;
      } else if (res.data && typeof res.data === 'object') {
        // If it's an object, try to get an array property
        data = Object.values(res.data);
      }
      
      setTypes(data);
    } catch (err) {
      console.error('loadTypes error', err);
      setTypes([]);
    }
  }

  // ----------------------------
  // API: Periods
  // ----------------------------
  async function loadPeriods() {
    try {
      const res = await axios.get('/api/leave-periods/');
      const data = Array.isArray(res.data) ? res.data : res.data.results || res.data || [];
      // sort newest first by start_date
      const sorted = data.slice().sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
      setPeriods(sorted);
      // pick latest as default if none selected
      if (!selectedPeriod && sorted.length) {
        setSelectedPeriod(sorted[0].id);
      }
    } catch (err) {
      console.error('loadPeriods error', err);
      setPeriods([]);
    }
  }

  // ----------------------------
  // API: Allocations
  // ----------------------------
  async function loadAllocations(periodId = null) {
    setLoading(true);
    setError(null);
    try {
      let url = '/api/leave-allocations/';
      if (periodId) {
        url += `?period=${encodeURIComponent(periodId)}`;
      }
      const res = await axios.get(url);
      const data = Array.isArray(res.data) ? res.data : res.data.results || res.data || [];
      // Normalize each item so component can use consistent fields
      const normalized = data.map(normalizeAlloc);
      setAllocs(normalized);
    } catch (err) {
      console.error('loadAllocations error', err);
      setError('Failed to load allocations');
      setAllocs([]);
    } finally {
      setLoading(false);
    }
  }

  // Normalize allocation object from backend to expected fields
  function normalizeAlloc(a) {
    return {
      id: a.id || a.pk || null,
      emp_id: (a.emp_id ?? (a.emp ? (a.emp.emp_id || a.emp) : null)) || (a.emp === null ? null : a.emp),
      leave_code: a.leave_code || a.leave_type || (a.leave_type && a.leave_type.leave_code) || null,
      leave_name: a.leave_type_name || (a.leave_type && a.leave_type.leave_name) || null,
      period_id: (a.period_id ?? (a.period && (a.period.id || a.period))) || null,
      period_name: a.period_name || (a.period && a.period.period_name) || null,
      allocated: a.allocated ?? a.allotted ?? 0,
      allocated_start_date: a.allocated_start_date || a.allocation_start_date || null,
      allocated_end_date: a.allocated_end_date || a.allocation_end_date || null,
      apply_to: a.apply_to || (a.emp_id ? 'PARTICULAR' : 'ALL'),
      used: a.used ?? 0,
      balance: a.balance ?? null,
      raw: a,
    };
  }

  // ----------------------------
  // Create Allocation
  // ----------------------------
  async function createAllocation(payload) {
    // payload should have: leave_code, period (or period_id), emp_id (optional), allocated, allocated_start_date, allocated_end_date, apply_to (optional)
    const body = {};
    // prefer leave_code explicitly
    if (payload.leave_code) body.leave_code = payload.leave_code;
    // period: backend expects 'period' or 'period_id' — we'll send period (id)
    if (payload.period_id) body.period = payload.period_id;
    else if (payload.period) body.period = payload.period;
    // emp_id: for ALL leave, send null/omit; for particular, send emp_id (string)
    if (payload.apply_to && payload.apply_to.toUpperCase() === 'ALL') {
      body.apply_to = 'ALL';
      // leave emp_id out / null to mark "All"
      // some backends expect emp_id null explicitly:
      body.emp_id = null;
    } else {
      body.apply_to = 'PARTICULAR';
      if (payload.emp_id) body.emp_id = payload.emp_id;
    }
    if (payload.allocated !== undefined && payload.allocated !== '') {
      body.allocated = Number(payload.allocated) || 0;
    }
    if (payload.allocated_start_date) body.allocated_start_date = payload.allocated_start_date;
    if (payload.allocated_end_date) body.allocated_end_date = payload.allocated_end_date;

    const res = await axios.post('/api/leave-allocations/', body);
    return res.data;
  }

  // ----------------------------
  // Update Allocation (PATCH)
  // ----------------------------
  async function updateAllocation(id, payload) {
    const body = {};
    if (payload.allocated !== undefined) body.allocated = Number(payload.allocated) || 0;
    if ('allocated_start_date' in payload) body.allocated_start_date = payload.allocated_start_date || null;
    if ('allocated_end_date' in payload) body.allocated_end_date = payload.allocated_end_date || null;
    // patch
    const res = await axios.patch(`/api/leave-allocations/${id}/`, body);
    return res.data;
  }

  // ----------------------------
  // Delete Allocation
  // ----------------------------
  async function deleteAllocationRequest(id) {
    const res = await axios.delete(`/api/leave-allocations/${id}/`);
    return res.status === 204 || res.status === 200;
  }

  // ----------------------------
  // UI actions: allocation form
  // ----------------------------
  function openCreateAllocForm() {
    setEditingAllocId(null);
    
    // Find the selected period to auto-populate dates
    const selectedPeriodObj = periods.find(p => String(p.id) === String(selectedPeriod));
    
    // prefill period if selected
    setAllocForm({
      emp_id: '',
      leave_code: '',
      period_id: selectedPeriod || '',
      allocated: '',
      allocated_start_date: selectedPeriodObj?.start_date || '',
      allocated_end_date: selectedPeriodObj?.end_date || '',
      apply_to: 'PARTICULAR',
    });
    setShowAllocForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openEditAllocation(a) {
    setEditingAllocId(a.id);
    
    // Find the period to auto-populate dates if not set
    const selectedPeriodObj = periods.find(p => String(p.id) === String(a.period_id));
    
    setAllocForm({
      emp_id: a.emp_id || '',
      leave_code: a.leave_code || '',
      period_id: a.period_id || '',
      allocated: a.allocated ?? '',
      allocated_start_date: a.allocated_start_date || selectedPeriodObj?.start_date || '',
      allocated_end_date: a.allocated_end_date || selectedPeriodObj?.end_date || '',
      apply_to: a.apply_to || (a.emp_id ? 'PARTICULAR' : 'ALL'),
    });
    setShowAllocForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEditAllocation() {
    setEditingAllocId(null);
    setAllocForm({
      emp_id: '',
      leave_code: '',
      period_id: '',
      allocated: '',
      allocated_start_date: '',
      allocated_end_date: '',
      apply_to: '',
    });
    setShowAllocForm(false);
  }

  async function saveAllocation(e) {
    e && e.preventDefault();
    // validation
    if (!allocForm.leave_code) {
      alert('Choose leave type');
      return;
    }
    if (!allocForm.period_id) {
      alert('Choose period');
      return;
    }
    if (allocForm.apply_to === 'PARTICULAR' && !allocForm.emp_id) {
      // allow creating particular with emp_id
      if (!window.confirm('You did not enter Emp ID. If you intend to create allocation for ALL employees choose Apply To = ALL. Proceed as ALL?')) {
        return;
      }
      // if confirm, switch to ALL
      setAllocForm(f => ({ ...f, apply_to: 'ALL', emp_id: '' }));
    }

    setLoading(true);
    try {
      if (editingAllocId) {
        await updateAllocation(editingAllocId, allocForm);
      } else {
        await createAllocation(allocForm);
      }
      cancelEditAllocation();
      await loadAllocations(selectedPeriod);
    } catch (err) {
      console.error('saveAllocation error', err);
      alert('Failed to save allocation: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  }

  async function confirmDeleteAllocation(a) {
    if (!a || !a.id) {
      alert('Allocation missing id');
      return;
    }
    if (!window.confirm(`Delete allocation ${a.leave_code} for ${a.emp_id || 'All'} (period ${a.period_id})?`)) return;
    setLoading(true);
    try {
      await deleteAllocationRequest(a.id);
      await loadAllocations(selectedPeriod);
    } catch (err) {
      console.error('delete alloc', err);
      alert('Failed to delete allocation: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  }

  // ----------------------------
  // Leave Type create / update (uses /api/leavetype/)
  // ----------------------------
  async function submitType(e) {
    e.preventDefault();
    const payload = {
      leave_code: typeForm.leave_code,
      leave_name: typeForm.leave_name,
      main_type: typeForm.main_type || null,
      day_value: typeForm.day_value || 1,
      session: typeForm.session || null,
      annual_allocation: typeForm.annual_allocation || null,
      is_half: typeForm.is_half || false,
    };
    try {
      if (editingTypeId) {
        await axios.put(`/api/leavetype/${editingTypeId}/`, payload);
      } else {
        await axios.post('/api/leavetype/', payload);
      }
      setTypeForm({ leave_code: '', leave_name: '', main_type: '', day_value: '1', session: '', annual_allocation: '', is_half: false });
      setEditingTypeId(null);
      await loadTypes();
    } catch (err) {
      console.error('submitType', err);
      alert('Failed to save leave type: ' + (err.response?.data?.detail || err.message));
    }
  }

  // ----------------------------
  // Leave Period create / update (uses /api/leaveperiods/)
  // ----------------------------
  async function submitPeriod(e) {
    e.preventDefault();
    const payload = {
      period_name: periodForm.period_name,
      start_date: periodForm.start_date,
      end_date: periodForm.end_date,
      description: periodForm.description || '',
    };
    try {
      if (editingPeriodId) {
        await axios.put(`/api/leave-periods/${editingPeriodId}/`, payload);
      } else {
        await axios.post('/api/leave-periods/', payload);
      }
      setPeriodForm({ period_name: '', start_date: '', end_date: '' });
      setEditingPeriodId(null);
      await loadPeriods();
    } catch (err) {
      console.error('submitPeriod', err);
      alert('Failed to save period: ' + (err.response?.data?.detail || err.message));
    }
  }

  // ----------------------------
  // Helpers & rendering utils
  // ----------------------------
  const allocationTypes = (types || []).filter(t => {
    const code = (t.leave_code || '').toString().toLowerCase();
    const name = (t.leave_name || '').toString().toLowerCase();
    return code.startsWith('cl') || code.startsWith('sl') || code.startsWith('el') || name.includes('vac');
  });

  function text(val) {
    return val === null || val === undefined ? '' : String(val);
  }

  // ----------------------------
  // Render
  // ----------------------------
  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-3">Leave Management</h3>

      <div className="mb-4">
        <button className={`px-3 py-1 mr-2 ${tab === 'allocations' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`} onClick={() => setTab('allocations')}>Allocations</button>
        <button className={`px-3 py-1 mr-2 ${tab === 'types' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`} onClick={() => setTab('types')}>Leave Types</button>
        <button className={`px-3 py-1 ${tab === 'periods' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`} onClick={() => setTab('periods')}>Leave Periods</button>
      </div>

      {tab === 'allocations' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <label className="text-sm mr-2">Filter period:</label>
              <select value={selectedPeriod || ''} onChange={e => setSelectedPeriod(e.target.value || null)} className="p-2 border rounded">
                <option value="">-- All periods --</option>
                {periods.map(p => <option key={p.id} value={p.id}>{p.period_name} ({p.start_date} - {p.end_date})</option>)}
              </select>
              <button className="px-3 py-1 bg-gray-200 rounded" onClick={() => loadAllocations(selectedPeriod)}>Refresh</button>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={openCreateAllocForm} className="px-3 py-1 bg-green-600 text-white rounded">Add Allocation</button>
            </div>
          </div>

          {loading && <div className="mb-2">Loading...</div>}
          {error && <div className="mb-2 text-red-600">{error}</div>}

          <div className="overflow-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-2 px-3">Emp ID</th>
                  <th className="text-left py-2 px-3">Leave Code</th>
                  <th className="text-left py-2 px-3">Leave Name</th>
                  <th className="text-left py-2 px-3">Period</th>
                  <th className="text-left py-2 px-3">Allocated</th>
                  <th className="text-left py-2 px-3">Start</th>
                  <th className="text-left py-2 px-3">End</th>
                  <th className="text-left py-2 px-3">Used</th>
                  <th className="text-left py-2 px-3">Balance</th>
                  <th className="text-left py-2 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allocs.length === 0 ? (
                  <tr><td colSpan={10} className="py-6 text-center text-gray-500">No allocations found</td></tr>
                ) : allocs.map(a => (
                  <tr key={a.id || `${a.emp_id || 'all'}-${a.period_id}-${a.leave_code}`} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3">{a.emp_id || 'All'}</td>
                    <td className="py-2 px-3">{a.leave_code}</td>
                    <td className="py-2 px-3">{a.leave_name || ''}</td>
                    <td className="py-2 px-3">{a.period_id ? `${a.period_id}${a.period_name ? ` (${a.period_name})` : ''}` : (a.period_name || '')}</td>
                    <td className="py-2 px-3">{a.allocated ?? ''}</td>
                    <td className="py-2 px-3">{a.allocated_start_date || ''}</td>
                    <td className="py-2 px-3">{a.allocated_end_date || ''}</td>
                    <td className="py-2 px-3">{a.used ?? ''}</td>
                    <td className="py-2 px-3">{a.balance ?? ''}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center space-x-2">
                        <button onClick={() => openEditAllocation(a)} className="px-2 py-1 bg-gray-200 rounded text-xs">Edit</button>
                        <button onClick={() => confirmDeleteAllocation(a)} className="px-2 py-1 bg-red-600 text-white rounded text-xs">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Create/Edit allocation form */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold">Create / Edit Allocation</h4>
              <div>
                <button onClick={() => { setShowAllocForm(s => !s); if (showAllocForm) cancelEditAllocation(); }} className="px-3 py-1 bg-blue-600 text-white rounded">{showAllocForm ? 'Close' : 'Add Allocation'}</button>
              </div>
            </div>

            {showAllocForm && (
              <form onSubmit={saveAllocation} className="max-w-3xl p-3 border rounded">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs">Apply To</label>
                    <select value={allocForm.apply_to} onChange={e => setAllocForm(f => ({ ...f, apply_to: e.target.value }))} className="p-2 border rounded w-full">
                      <option value="PARTICULAR">Particular Employee</option>
                      <option value="ALL">All Employees</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs">Emp ID (leave empty for All)</label>
                    <input name="emp_id" placeholder="Emp ID" className="p-2 border rounded w-full" value={allocForm.emp_id} onChange={e => setAllocForm(f => ({ ...f, emp_id: e.target.value }))} disabled={allocForm.apply_to === 'ALL'} />
                  </div>

                  <div>
                    <label className="block text-xs">Leave Type</label>
                    <select name="leave_code" value={allocForm.leave_code} onChange={e => setAllocForm(f => ({ ...f, leave_code: e.target.value }))} className="p-2 border rounded w-full" required>
                      <option value="">Select leave type</option>
                      {types.map(t => <option key={t.id || t.leave_code} value={t.leave_code || t.id}>{t.leave_name || t.leave_code}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs">Period</label>
                    <select name="period_id" value={allocForm.period_id} onChange={e => {
                      const periodId = e.target.value;
                      const selectedPeriodObj = periods.find(p => String(p.id) === String(periodId));
                      setAllocForm(f => ({ 
                        ...f, 
                        period_id: periodId,
                        allocated_start_date: selectedPeriodObj?.start_date || f.allocated_start_date,
                        allocated_end_date: selectedPeriodObj?.end_date || f.allocated_end_date
                      }));
                    }} className="p-2 border rounded w-full" required>
                      <option value="">Select period</option>
                      {periods.map(p => <option key={p.id} value={p.id}>{p.period_name} ({p.start_date} - {p.end_date})</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs">Allocated</label>
                    <input name="allocated" placeholder="Allocated (e.g. 12)" className="p-2 border rounded w-full" type="number" step="0.5" value={allocForm.allocated} onChange={e => setAllocForm(f => ({ ...f, allocated: e.target.value }))} />
                  </div>

                  <div>
                    <label className="block text-xs">Allocated Start Date</label>
                    <input name="allocated_start_date" type="date" className="p-2 border rounded w-full" value={allocForm.allocated_start_date} onChange={e => setAllocForm(f => ({ ...f, allocated_start_date: e.target.value }))} />
                  </div>

                  <div>
                    <label className="block text-xs">Allocated End Date</label>
                    <input name="allocated_end_date" type="date" className="p-2 border rounded w-full" value={allocForm.allocated_end_date} onChange={e => setAllocForm(f => ({ ...f, allocated_end_date: e.target.value }))} />
                  </div>

                  <div className="md:col-span-3 flex items-center space-x-2 mt-2">
                    <button type="submit" className="bg-green-600 text-white px-3 py-1 rounded">{editingAllocId ? 'Save' : 'Create'}</button>
                    <button type="button" onClick={cancelEditAllocation} className="px-3 py-1 rounded border">Cancel</button>
                    <div className="text-sm text-gray-600 ml-3">Tip: choose <strong>All</strong> in Apply To to create a global allocation for everyone.</div>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {tab === 'types' && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-semibold">Leave Types - All Fields (v2)</h4>
            <span className="text-xs text-gray-500">Showing: Code, Name, Main Type, Day Value, Session, Annual, Half Day | Records: {types.length}</span>
          </div>
          <div className="mb-4">
            <form onSubmit={submitType} className="border rounded p-4 bg-gray-50">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Code *</label>
                  <input name="leave_code" placeholder="Code" className="p-2 border rounded w-full" required value={typeForm.leave_code} onChange={e => setTypeForm(f => ({ ...f, leave_code: e.target.value }))} disabled={!!editingTypeId} />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium mb-1">Name *</label>
                  <input name="leave_name" placeholder="Name" className="p-2 border rounded w-full" required value={typeForm.leave_name} onChange={e => setTypeForm(f => ({ ...f, leave_name: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Main Type</label>
                  <input name="main_type" placeholder="Parent" className="p-2 border rounded w-full" value={typeForm.main_type} onChange={e => setTypeForm(f => ({ ...f, main_type: e.target.value }))} maxLength="10" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Day Value</label>
                  <input name="day_value" placeholder="1.00" className="p-2 border rounded w-full" type="number" step="0.01" min="0" max="9999" value={typeForm.day_value} onChange={e => setTypeForm(f => ({ ...f, day_value: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Session</label>
                  <input name="session" placeholder="Mode" className="p-2 border rounded w-full" value={typeForm.session} onChange={e => setTypeForm(f => ({ ...f, session: e.target.value }))} maxLength="10" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Annual Allocation</label>
                  <input name="annual_allocation" placeholder="Annual" className="p-2 border rounded w-full" type="number" step="0.01" value={typeForm.annual_allocation} onChange={e => setTypeForm(f => ({ ...f, annual_allocation: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center space-x-3 mb-3">
                <label className="flex items-center space-x-2">
                  <input type="checkbox" checked={typeForm.is_half} onChange={e => setTypeForm(f => ({ ...f, is_half: e.target.checked }))} className="w-4 h-4" />
                  <span className="text-sm">Is Half Day Leave</span>
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded">{editingTypeId ? 'Save' : 'Create'}</button>
                {editingTypeId && <button type="button" className="px-4 py-2 rounded border" onClick={() => { setEditingTypeId(null); setTypeForm({ leave_code: '', leave_name: '', main_type: '', day_value: '1', session: '', annual_allocation: '', is_half: false }); }}>Cancel</button>}
              </div>
            </form>
          </div>

          <div className="overflow-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 text-left">Code</th>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Main Type</th>
                  <th className="p-2 text-left">Day Value</th>
                  <th className="p-2 text-left">Session</th>
                  <th className="p-2 text-left">Annual</th>
                  <th className="p-2 text-center">Half Day</th>
                </tr>
              </thead>
              <tbody>
                {loading && types.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-4 text-center text-gray-500">
                      Loading leave types...
                    </td>
                  </tr>
                ) : types.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-4 text-center text-gray-500">
                      No leave types found. Click "Create" to add a new leave type.
                      <br />
                      <small className="text-xs">Check browser console (F12) for API errors.</small>
                    </td>
                  </tr>
                ) : (
                  types.map(t => {
                  const key = t.leave_code || t.id;
                  return (
                    <tr key={key} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => { 
                      setEditingTypeId(t.id || t.leave_code); 
                      setTypeForm({ 
                        leave_code: t.leave_code, 
                        leave_name: t.leave_name, 
                        main_type: t.main_type || '', 
                        day_value: t.day_value || '1', 
                        session: t.session || '', 
                        annual_allocation: t.annual_allocation ?? t.annual_limit ?? '', 
                        is_half: t.is_half || false 
                      }); 
                      setTab('types'); 
                    }}>
                      <td className="p-2">{t.leave_code}</td>
                      <td className="p-2">{t.leave_name}</td>
                      <td className="p-2">{t.main_type || '-'}</td>
                      <td className="p-2">{t.day_value || '1'}</td>
                      <td className="p-2">{t.session || '-'}</td>
                      <td className="p-2">{t.annual_allocation ?? t.annual_limit ?? '-'}</td>
                      <td className="p-2 text-center">{t.is_half ? '✓' : ''}</td>
                    </tr>
                  );
                })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'periods' && (
        <div>
          <h4 className="font-semibold mb-2">Leave Periods</h4>
          <div className="mb-4">
            <form onSubmit={submitPeriod} className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-xl">
              <input name="period_name" placeholder="Name" className="p-2 border rounded" required value={periodForm.period_name} onChange={e => setPeriodForm(f => ({ ...f, period_name: e.target.value }))} />
              <input name="start_date" placeholder="Start" type="date" className="p-2 border rounded" required value={periodForm.start_date} onChange={e => setPeriodForm(f => ({ ...f, start_date: e.target.value }))} />
              <input name="end_date" placeholder="End" type="date" className="p-2 border rounded" required value={periodForm.end_date} onChange={e => setPeriodForm(f => ({ ...f, end_date: e.target.value }))} />
              <textarea name="description" placeholder="Description (optional)" className="p-2 border rounded md:col-span-3" value={periodForm.description || ''} onChange={e => setPeriodForm(f => ({ ...f, description: e.target.value }))} />
              <div className="md:col-span-3 flex items-center space-x-2">
                <button className="bg-green-600 text-white px-3 py-1 rounded">{editingPeriodId ? 'Save' : 'Create Period'}</button>
                {editingPeriodId && <button type="button" className="px-3 py-1 rounded border" onClick={() => { setEditingPeriodId(null); setPeriodForm({ period_name: '', start_date: '', end_date: '' }); }}>Cancel</button>}
              </div>
            </form>
          </div>

          <div className="overflow-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="p-2">Name</th><th className="p-2">Start</th><th className="p-2">End</th></tr></thead>
              <tbody>
                {periods.map(p => (
                  <tr key={p.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => { setEditingPeriodId(p.id); setPeriodForm({ period_name: p.period_name, start_date: p.start_date, end_date: p.end_date, description: p.description || '' }); setTab('periods'); }}>
                    <td className="p-2">{p.period_name}</td>
                    <td className="p-2">{p.start_date}</td>
                    <td className="p-2">{p.end_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
