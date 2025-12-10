// empLeaveService.js
// Centralized API calls for leave allocations and leave periods.

import API from '../api/axiosInstance';

// ------------------------------------------------------------
// Helper: Normalize allocation object from backend.
// Ensures frontend receives consistent field names.
// ------------------------------------------------------------
export function normalizeAllocation(a) {
  if (!a) return {};

  return {
    id: a.id || null,
    emp_id: a.emp_id ?? null,
    leave_code: a.leave_code || a.leave_type || null,
    leave_name: a.leave_type_name || null,
    apply_to: a.apply_to || (a.emp_id ? "PARTICULAR" : "ALL"),
    period_id: a.period_id || (a.period?.id ?? null),
    period_name: a.period_name || a.period?.period_name || null,
    allocated: a.allocated ?? 0,
    allocated_start_date: a.allocated_start_date || null,
    allocated_end_date: a.allocated_end_date || null,
    used: a.used ?? 0,
    balance: a.balance ?? 0,
    raw: a,
  };
}

// ------------------------------------------------------------
// GET allocations (supports ?period=ID)
// ------------------------------------------------------------
export async function getLeaveAllocations(params = "") {
  const url = `/api/leave-allocations${params}`;
  const res = await API.get(url);

  const data = res.data?.results ? res.data.results : res.data || [];
  return Array.isArray(data) ? data.map(normalizeAllocation) : [];
}

// ------------------------------------------------------------
// GET single allocation
// ------------------------------------------------------------
export async function getLeaveAllocation(id) {
  const res = await API.get(`/api/leave-allocations/${id}/`);
  return normalizeAllocation(res.data);
}

// ------------------------------------------------------------
// CREATE allocation (backend expects)
// {
//   leave_code,
//   period,
//   apply_to: "ALL" | "PARTICULAR",
//   emp_id: null | string,
//   allocated,
//   allocated_start_date,
//   allocated_end_date
// }
// ------------------------------------------------------------
export async function createLeaveAllocation(payload) {
  const body = {};

  // Required fields
  body.leave_code = payload.leave_code;
  body.period = payload.period_id || payload.period;

  // Apply_to handling
  if (payload.apply_to === "ALL") {
    body.apply_to = "ALL";
    body.emp_id = null;
  } else {
    body.apply_to = "PARTICULAR";
    if (payload.emp_id) body.emp_id = payload.emp_id;
  }

  // Allocation numbers
  body.allocated = Number(payload.allocated || 0);

  // Optional dates
  if (payload.allocated_start_date) body.allocated_start_date = payload.allocated_start_date;
  if (payload.allocated_end_date) body.allocated_end_date = payload.allocated_end_date;

  const res = await API.post("/api/leave-allocations/", body);
  return normalizeAllocation(res.data);
}

// ------------------------------------------------------------
// UPDATE allocation (PATCH)
// Allowed fields: allocated, allocated_start_date, allocated_end_date
// ------------------------------------------------------------
export async function updateLeaveAllocation(id, payload) {
  const body = {};

  if (payload.allocated !== undefined) {
    body.allocated = Number(payload.allocated || 0);
  }

  if ("allocated_start_date" in payload) {
    body.allocated_start_date = payload.allocated_start_date || null;
  }

  if ("allocated_end_date" in payload) {
    body.allocated_end_date = payload.allocated_end_date || null;
  }

  const res = await API.patch(`/api/leave-allocations/${id}/`, body);
  return normalizeAllocation(res.data);
}

// ------------------------------------------------------------
// DELETE allocation
// ------------------------------------------------------------
export async function deleteLeaveAllocation(id) {
  await API.delete(`/api/leave-allocations/${id}/`);
  return true;
}

// ------------------------------------------------------------
// GET leave periods
// ------------------------------------------------------------
export async function getLeavePeriods() {
  const res = await API.get("/api/leaveperiods/");
  return res.data?.results || res.data || [];
}

// ------------------------------------------------------------
// Build query string helper
// Example: buildQuery({ period: 5 }) → "?period=5"
// ------------------------------------------------------------
export function buildQuery(obj) {
  const parts = [];
  for (const key in obj) {
    const val = obj[key];
    if (val !== undefined && val !== null && val !== "") {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
    }
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export default {
  getLeaveAllocations,
  getLeaveAllocation,
  createLeaveAllocation,
  updateLeaveAllocation,
  deleteLeaveAllocation,
  getLeavePeriods,
  buildQuery,
  normalizeAllocation,
};
