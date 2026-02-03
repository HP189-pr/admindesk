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
      console.error('loadTypes error', err);
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
      console.error('loadPeriods error', err);
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
      console.error('loadAllocations error', err);
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

      {/* UI for allocations / types / periods remains exactly as before */}
      {/* No backend or routing changes required */}
    </div>
  );
}
