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

// ─── Users (receiver dropdown) ─────────────────────────────────────────────

export const getUsers = () => API.get(`${BASE}/users/`);
