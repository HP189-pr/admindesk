import API from "../api/axiosInstance";

const API_BASE = "/api";

// =========================
// EXAM
// =========================

export const getExams = () => API.get(`${API_BASE}/exam/`);

export const createExam = (data) =>
  API.post(`${API_BASE}/exam/`, data);

export const syncCctvExamsFromSheet = (sheetName) =>
  API.post(`${API_BASE}/exam/sync-from-sheet/`, {
    sheet_name: sheetName,
  });

// =========================
// CENTRE ENTRY
// =========================

export const getCentres = () =>
  API.get(`${API_BASE}/centre/`);

export const createCentre = (data) =>
  API.post(`${API_BASE}/centre/`, data);

export const updateCentre = (id, data) =>
  API.patch(`${API_BASE}/centre/${id}/`, data);

// =========================
// DVD
// =========================

export const getDVDs = () =>
  API.get(`${API_BASE}/dvd/`);

export const updateDVD = (id, data) =>
  API.patch(`${API_BASE}/dvd/${id}/`, data);

export const assignCcNumbers = (data) =>
  API.post(`${API_BASE}/dvd/assign-cc/`, data);

// =========================
// OUTWARD
// =========================

export const getOutward = () =>
  API.get(`${API_BASE}/cctv-outward/`);

export const createOutward = (data) =>
  API.post(`${API_BASE}/cctv-outward/`, data);

export const updateOutward = (id, data) =>
  API.patch(`${API_BASE}/cctv-outward/${id}/`, data);

export const deleteOutward = (id) =>
  API.delete(`${API_BASE}/cctv-outward/${id}/`);

export const syncCctvFromSheet = (sheetName) =>
  API.post(`${API_BASE}/centre/sync-from-sheet/`, {
    sheet_name: sheetName,
  });
