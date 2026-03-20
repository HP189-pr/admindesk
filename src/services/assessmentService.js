// src/services/assessmentService.js
import API from "../api/axiosInstance";

const BASE = "/api";

// ─── Assessment Entry ──────────────────────────────────────────────────────

export const getAssessmentEntries = (params) =>
  API.get(`${BASE}/assessment-entry/`, { params });

export const getAllAssessmentEntries = (params) =>
  API.get(`${BASE}/assessment-entry/all/`, { params });

export const getPendingAssessmentEntries = () =>
  API.get(`${BASE}/assessment-entry/pending/`);

export const createAssessmentEntry = (data) =>
  API.post(`${BASE}/assessment-entry/`, data);

export const updateAssessmentEntry = (id, data) =>
  API.patch(`${BASE}/assessment-entry/${id}/`, data);

export const deleteAssessmentEntry = (id) =>
  API.delete(`${BASE}/assessment-entry/${id}/`);

// ─── Assessment Outward ────────────────────────────────────────────────────

export const getAssessmentOutwards = (params) =>
  API.get(`${BASE}/assessment-outward/`, { params });

export const getMyAssessmentOutwards = () =>
  API.get(`${BASE}/assessment-outward/my/`);

export const generateAssessmentOutward = (data) =>
  API.post(`${BASE}/assessment-outward/generate/`, data);

export const receiveAssessmentEntry = (data) =>
  API.post(`${BASE}/assessment-outward/receive-entry/`, data);

// Single-item return — payload: { detail_id, remark }
// Backend also accepts batch via `items` array; both use the same endpoint.
export const returnAssessmentEntry = (data) =>
  API.post(`${BASE}/assessment-outward/return-entry/`, data);

// Batch return — send items: [{ detail_id, remark }, ...] from any outward.
// Returns { return_outward_no, count } for a single shared return number.
export const generateReturnAssessmentOutward = (items) =>
  API.post(`${BASE}/assessment-outward/return-entry/`, { items });

export const finalReceiveAssessmentEntry = (data) =>
  API.post(`${BASE}/assessment-outward/final-receive/`, data);

// ─── Users (receiver dropdown) ─────────────────────────────────────────────

export const getUsers = () => API.get(`${BASE}/users/`);
