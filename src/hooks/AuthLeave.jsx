// src/components/AuthLeave.jsx
import React, { useEffect, useState } from 'react';
import axios from '../api/axiosInstance';

/**
 * AuthLeave component
 *
 * API base: /api
 * Works in DEV (3000) + PROD (8081)
 */

const API = '/api';

export default function AuthLeave() {
  const [tab, setTab] = useState('allocations');

  // Data stores
  const [allocs, setAllocs] = useState([]);
  const [types, setTypes] = useState([]);
  const [periods, setPeriods] = useState([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Forms
  const [showAllocForm, setShowAllocForm] = useState(false);
  const [editingAllocId, setEditingAllocId] = useState(null);
  const [allocForm, setAllocForm] = useState({
    emp_id: '',
    leave_code: '',
    period_id: '',
    allocated: '',
    allocated_start_date: '',
    allocated_end_date: '',
    apply_to: 'PARTICULAR',
  });

  const [typeForm, setTypeForm] = useState({
    leave_code: '',
    leave_name: '',
    main_type: '',
    day_value: '1',
    session: '',
    annual_allocation: '',
    is_half: false,
  });
  const [editingTypeId, setEditingTypeId] = useState(null);

  const [periodForm, setPeriodForm] = useState({
    period_name: '',
    start_date: '',
    end_date: '',
    description: '',
  });
  const [editingPeriodId, setEditingPeriodId] = useState(null);

  const [selectedPeriod, setSelectedPeriod] = useState(null);

  /* ========================= INITIAL LOAD ========================= */

  useEffect(() => {
    loadTypes();
    loadPeriods();
  }, []);

  useEffect(() => {
    loadAllocations(selectedPeriod);
  }, [selectedPeriod]);

  /* ========================= API: LEAVE TYPES ========================= */

  async function loadTypes() {
    try {
      const res = await axios.get(`${API}/leavetype/`);
      const data = Array.isArray(res.data)
        ? res.data
        : res.data?.results || [];
      setTypes(data);
    } catch (err) {
      console.error('loadTypes error:', err.response?.status, err.response?.data || err.message);
      setTypes([]);
    }
  }

  /* ========================= API: PERIODS ========================= */

  async function loadPeriods() {
    try {
      const res = await axios.get(`${API}/leave-periods/`);
      const data = Array.isArray(res.data)
        ? res.data
        : res.data?.results || [];
      const sorted = data.slice().sort(
        (a, b) => new Date(b.start_date) - new Date(a.start_date)
      );
      setPeriods(sorted);
      if (!selectedPeriod && sorted.length) {
        setSelectedPeriod(sorted[0].id);
      }
    } catch (err) {
      console.error('loadPeriods error:', err.response?.status, err.response?.data || err.message);
      setPeriods([]);
    }
  }

  /* ========================= API: ALLOCATIONS ========================= */

  async function loadAllocations(periodId = null) {
    setLoading(true);
    setError(null);
    try {
      let url = `${API}/leave-allocations/`;
      if (periodId) url += `?period=${encodeURIComponent(periodId)}`;
      const res = await axios.get(url);
      const data = Array.isArray(res.data)
        ? res.data
        : res.data?.results || [];
      setAllocs(data.map(normalizeAlloc));
    } catch (err) {
      console.error('loadAllocations error:', err.response?.status, err.response?.data || err.message);
      setError('Failed to load allocations');
      setAllocs([]);
    } finally {
      setLoading(false);
    }
  }

  function normalizeAlloc(a) {
    return {
      id: a.id,
      emp_id: a.emp_id ?? null,
      leave_code: a.leave_code || a.leave_type?.leave_code,
      leave_name: a.leave_type?.leave_name || '',
      period_id: a.period?.id || a.period,
      period_name: a.period?.period_name || '',
      allocated: a.allocated ?? 0,
      allocated_start_date: a.allocated_start_date,
      allocated_end_date: a.allocated_end_date,
      apply_to: a.emp_id ? 'PARTICULAR' : 'ALL',
      used: a.used ?? 0,
      balance: a.balance ?? '',
      // Display fields for table rendering
      emp_display: a.emp_id || 'All Employees',
      leave_display: `${a.leave_type?.leave_name || ''} (${a.leave_code || a.leave_type?.leave_code || ''})`,
      period_display: a.period?.period_name || '',
    };
  }

  /* ========================= CREATE / UPDATE / DELETE ========================= */

  async function createAllocation(payload) {
    const body = {
      leave_code: payload.leave_code,
      period: payload.period_id,
      allocated: Number(payload.allocated) || 0,
      allocated_start_date: payload.allocated_start_date || null,
      allocated_end_date: payload.allocated_end_date || null,
      apply_to: payload.apply_to,
      emp_id: payload.apply_to === 'ALL' ? null : payload.emp_id,
    };
    await axios.post(`${API}/leave-allocations/`, body);
  }

  async function updateAllocation(id, payload) {
    const body = {
      allocated: Number(payload.allocated) || 0,
      allocated_start_date: payload.allocated_start_date || null,
      allocated_end_date: payload.allocated_end_date || null,
    };
    await axios.patch(`${API}/leave-allocations/${id}/`, body);
  }

  async function deleteAllocation(id) {
    await axios.delete(`${API}/leave-allocations/${id}/`);
  }

  /* ========================= SAVE HANDLER ========================= */

  async function saveAllocation(e) {
    e.preventDefault();
    if (!allocForm.leave_code || !allocForm.period_id) {
      alert('Leave type and period are required');
      return;
    }
    setLoading(true);
    try {
      if (editingAllocId) {
        await updateAllocation(editingAllocId, allocForm);
      } else {
        await createAllocation(allocForm);
      }
      setShowAllocForm(false);
      setEditingAllocId(null);
      await loadAllocations(selectedPeriod);
    } catch (err) {
      alert('Save failed');
    } finally {
      setLoading(false);
    }
  }

  // Wrapper functions for UI
  const submitAlloc = saveAllocation;

  function editAlloc(allocation) {
    setAllocForm({
      emp_id: allocation.emp_id || '',
      leave_code: allocation.leave_code || '',
      period_id: allocation.period_id || '',
      allocated: allocation.allocated || '',
      allocated_start_date: allocation.allocated_start_date || '',
      allocated_end_date: allocation.allocated_end_date || '',
      apply_to: allocation.apply_to || 'PARTICULAR',
    });
    setEditingAllocId(allocation.id);
    setShowAllocForm(true);
  }

  async function deleteAlloc(id) {
    if (!confirm('Are you sure you want to delete this allocation?')) return;
    setLoading(true);
    try {
      await deleteAllocation(id);
      await loadAllocations(selectedPeriod);
    } catch (err) {
      alert('Delete failed');
    } finally {
      setLoading(false);
    }
  }

  /* ========================= TYPES & PERIODS ========================= */

  async function submitType(e) {
    e.preventDefault();
    const url = editingTypeId
      ? `${API}/leavetype/${editingTypeId}/`
      : `${API}/leavetype/`;
    const method = editingTypeId ? axios.put : axios.post;
    await method(url, typeForm);
    setTypeForm({
      leave_code: '',
      leave_name: '',
      main_type: '',
      day_value: '1',
      session: '',
      annual_allocation: '',
      is_half: false,
    });
    setEditingTypeId(null);
    loadTypes();
  }

  async function submitPeriod(e) {
    e.preventDefault();
    const url = editingPeriodId
      ? `${API}/leave-periods/${editingPeriodId}/`
      : `${API}/leave-periods/`;
    const method = editingPeriodId ? axios.put : axios.post;
    await method(url, periodForm);
    setPeriodForm({ period_name: '', start_date: '', end_date: '', description: '' });
    setEditingPeriodId(null);
    loadPeriods();
  }

  /* ========================= RENDER ========================= */

  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-3">Leave Management</h3>

      <div className="mb-4 space-x-2">
        <button onClick={() => setTab('allocations')} className={tab === 'allocations' ? 'bg-blue-600 text-white px-3 py-1' : 'bg-gray-200 px-3 py-1'}>Allocations</button>
        <button onClick={() => setTab('types')} className={tab === 'types' ? 'bg-blue-600 text-white px-3 py-1' : 'bg-gray-200 px-3 py-1'}>Leave Types</button>
        <button onClick={() => setTab('periods')} className={tab === 'periods' ? 'bg-blue-600 text-white px-3 py-1' : 'bg-gray-200 px-3 py-1'}>Leave Periods</button>
      </div>

      {error && <div className="text-red-600 mb-2">{error}</div>}
      {loading && <div className="mb-2">Loading...</div>}

      {/* ========================= ALLOCATIONS TAB ========================= */}
      {tab === 'allocations' && (
        <div>
          <div className="mb-4">
            <label className="text-sm font-semibold mr-2">Filter by Period:</label>
            <select
              value={selectedPeriod || ''}
              onChange={(e) => setSelectedPeriod(e.target.value ? Number(e.target.value) : null)}
              className="border rounded px-2 py-1"
            >
              <option value="">All Periods</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.period_name} ({p.start_date} to {p.end_date})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowAllocForm(!showAllocForm)}
            className="mb-3 px-3 py-1 bg-green-600 text-white rounded"
          >
            {showAllocForm ? 'Cancel' : 'Add Allocation'}
          </button>

          {showAllocForm && (
            <div className="border p-3 mb-3 bg-gray-50">
              <h4 className="font-semibold mb-2">{editingAllocId ? 'Edit' : 'Create'} Allocation</h4>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input
                  placeholder="Employee ID"
                  value={allocForm.emp_id}
                  onChange={(e) => setAllocForm({ ...allocForm, emp_id: e.target.value })}
                  className="border px-2 py-1"
                />
                <select
                  value={allocForm.leave_code}
                  onChange={(e) => setAllocForm({ ...allocForm, leave_code: e.target.value })}
                  className="border px-2 py-1"
                >
                  <option value="">Select Leave Type</option>
                  {types.map((t) => (
                    <option key={t.leave_code} value={t.leave_code}>
                      {t.leave_name} ({t.leave_code})
                    </option>
                  ))}
                </select>
                <select
                  value={allocForm.period_id}
                  onChange={(e) => setAllocForm({ ...allocForm, period_id: e.target.value })}
                  className="border px-2 py-1"
                >
                  <option value="">Select Period</option>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.period_name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Allocated Days"
                  value={allocForm.allocated}
                  onChange={(e) => setAllocForm({ ...allocForm, allocated: e.target.value })}
                  className="border px-2 py-1"
                />
              </div>
              <button onClick={submitAlloc} className="px-3 py-1 bg-blue-600 text-white rounded">
                Save
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border p-2">Employee</th>
                  <th className="border p-2">Leave Type</th>
                  <th className="border p-2">Period</th>
                  <th className="border p-2">Allocated</th>
                  <th className="border p-2">Used</th>
                  <th className="border p-2">Balance</th>
                  <th className="border p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allocs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="border p-4 text-center text-gray-500">
                      No allocations found
                    </td>
                  </tr>
                ) : (
                  allocs.map((a) => (
                    <tr key={a.id}>
                      <td className="border p-2">{a.emp_display}</td>
                      <td className="border p-2">{a.leave_display}</td>
                      <td className="border p-2">{a.period_display}</td>
                      <td className="border p-2">{a.allocated}</td>
                      <td className="border p-2">{a.used || 0}</td>
                      <td className="border p-2">{a.balance || a.allocated}</td>
                      <td className="border p-2">
                        <button
                          onClick={() => editAlloc(a)}
                          className="text-blue-600 hover:underline mr-2"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteAlloc(a.id)}
                          className="text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================= LEAVE TYPES TAB ========================= */}
      {tab === 'types' && (
        <div>
          <div className="border p-3 mb-3 bg-gray-50">
            <h4 className="font-semibold mb-2">{editingTypeId ? 'Edit' : 'Create'} Leave Type</h4>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                placeholder="Leave Code"
                value={typeForm.leave_code}
                onChange={(e) => setTypeForm({ ...typeForm, leave_code: e.target.value })}
                className="border px-2 py-1"
              />
              <input
                placeholder="Leave Name"
                value={typeForm.leave_name}
                onChange={(e) => setTypeForm({ ...typeForm, leave_name: e.target.value })}
                className="border px-2 py-1"
              />
              <input
                placeholder="Main Type"
                value={typeForm.main_type}
                onChange={(e) => setTypeForm({ ...typeForm, main_type: e.target.value })}
                className="border px-2 py-1"
              />
              <input
                type="number"
                placeholder="Annual Allocation"
                value={typeForm.annual_allocation}
                onChange={(e) => setTypeForm({ ...typeForm, annual_allocation: e.target.value })}
                className="border px-2 py-1"
              />
            </div>
            <button onClick={submitType} className="px-3 py-1 bg-blue-600 text-white rounded">
              Save
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border p-2">Code</th>
                  <th className="border p-2">Name</th>
                  <th className="border p-2">Main Type</th>
                  <th className="border p-2">Annual Allocation</th>
                  <th className="border p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {types.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="border p-4 text-center text-gray-500">
                      No leave types found
                    </td>
                  </tr>
                ) : (
                  types.map((t) => (
                    <tr key={t.leave_code}>
                      <td className="border p-2">{t.leave_code}</td>
                      <td className="border p-2">{t.leave_name}</td>
                      <td className="border p-2">{t.main_type}</td>
                      <td className="border p-2">{t.annual_allocation || '-'}</td>
                      <td className="border p-2">
                        <button
                          onClick={() => {
                            setTypeForm(t);
                            setEditingTypeId(t.id);
                          }}
                          className="text-blue-600 hover:underline"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================= LEAVE PERIODS TAB ========================= */}
      {tab === 'periods' && (
        <div>
          <div className="border p-3 mb-3 bg-gray-50">
            <h4 className="font-semibold mb-2">{editingPeriodId ? 'Edit' : 'Create'} Leave Period</h4>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                placeholder="Period Name"
                value={periodForm.period_name}
                onChange={(e) => setPeriodForm({ ...periodForm, period_name: e.target.value })}
                className="border px-2 py-1"
              />
              <input
                type="date"
                placeholder="Start Date"
                value={periodForm.start_date}
                onChange={(e) => setPeriodForm({ ...periodForm, start_date: e.target.value })}
                className="border px-2 py-1"
              />
              <input
                type="date"
                placeholder="End Date"
                value={periodForm.end_date}
                onChange={(e) => setPeriodForm({ ...periodForm, end_date: e.target.value })}
                className="border px-2 py-1"
              />
              <input
                placeholder="Description"
                value={periodForm.description}
                onChange={(e) => setPeriodForm({ ...periodForm, description: e.target.value })}
                className="border px-2 py-1"
              />
            </div>
            <button onClick={submitPeriod} className="px-3 py-1 bg-blue-600 text-white rounded">
              Save
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border p-2">Period Name</th>
                  <th className="border p-2">Start Date</th>
                  <th className="border p-2">End Date</th>
                  <th className="border p-2">Description</th>
                  <th className="border p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {periods.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="border p-4 text-center text-gray-500">
                      No leave periods found
                    </td>
                  </tr>
                ) : (
                  periods.map((p) => (
                    <tr key={p.id}>
                      <td className="border p-2">{p.period_name}</td>
                      <td className="border p-2">{p.start_date}</td>
                      <td className="border p-2">{p.end_date}</td>
                      <td className="border p-2">{p.description || '-'}</td>
                      <td className="border p-2">
                        <button
                          onClick={() => {
                            setPeriodForm(p);
                            setEditingPeriodId(p.id);
                          }}
                          className="text-blue-600 hover:underline"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
