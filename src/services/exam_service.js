import API from "../api/axiosInstance";

const API_BASE = "/api/exam-schedule";

export const fetchExamScheduleEmployees = async ({ search = "" } = {}) => {
  const params = search ? { q: search } : undefined;
  const response = await API.get(`${API_BASE}/employees/`, { params });
  return Array.isArray(response.data?.employees) ? response.data.employees : [];
};

export const generateExamSchedule = async (payload) => {
  const response = await API.post(`${API_BASE}/generate/`, payload);
  return response.data || { rows: [], skipped_dates: [], holidays: [], metadata: null };
};