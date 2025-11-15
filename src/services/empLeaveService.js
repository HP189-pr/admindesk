// empLeaveService.js
// Centralized API calls for leave allocations and leave periods.
// Import this from components/hooks to avoid duplicating axios calls.

import API from '../api/axiosInstance';

const base = '';

export async function getLeaveAllocations(params = '') {
  // params can be a query string like '?period=1' or ''
  const url = `/api/leave-allocations${params}`;
  const res = await API.get(url);
  return res.data;
}

export async function getLeaveAllocation(id) {
  const res = await API.get(`/api/leave-allocations/${id}/`);
  return res.data;
}

export async function createLeaveAllocation(payload) {
  // payload: { emp_id, period_id, leave_type_code, allocated, allocated_cl, allocated_sl, allocated_el, allocated_vac, allocated_start_date, allocated_end_date }
  const res = await API.post('/api/leave-allocations/', payload);
  return res.data;
}

export async function updateLeaveAllocation(id, payload) {
  const res = await API.patch(`/api/leave-allocations/${id}/`, payload);
  return res.data;
}

export async function deleteLeaveAllocation(id) {
  const res = await API.delete(`/api/leave-allocations/${id}/`);
  return res.data;
}

export async function getLeavePeriods() {
  const res = await API.get('/api/leaveperiods/');
  return res.data;
}

export async function seedLeaveAllocations(period_id) {
  // POST to seed allocations for a period (optional payload)
  const res = await API.post('/api/seed-leave-allocations/', period_id ? { period_id } : {});
  return res.data;
}

// small helper to build query string from object { period: 1, institute: 'X' }
export function buildQuery(paramsObj) {
  const parts = [];
  for (const k in paramsObj) {
    if (paramsObj[k] !== undefined && paramsObj[k] !== null && paramsObj[k] !== '') {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(paramsObj[k])}`);
    }
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

export default {
  getLeaveAllocations,
  getLeaveAllocation,
  createLeaveAllocation,
  updateLeaveAllocation,
  deleteLeaveAllocation,
  getLeavePeriods,
  seedLeaveAllocations,
  buildQuery,
};
