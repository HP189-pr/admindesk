import axios from 'axios';

// Prefer explicit backend origin when provided, otherwise fall back to local backend for dev
// This avoids accidental proxying to the Vite preview server when a standalone backend is on 127.0.0.1:8000
const rawApiBase = import.meta?.env?.VITE_API_BASE_URL?.trim() || 'http://127.0.0.1:8000';
const apiBaseUrl = rawApiBase.replace(/\/$/, '');

// NOTE: API calls across the app already include the `/api/*` path.
// Keep baseURL as the backend origin to avoid duplicating `/api` in requests.
const API = axios.create({
  baseURL: apiBaseUrl,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

// ✅ ALWAYS attach access_token
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ✅ OPTIONAL but recommended: auto logout on 401
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn('401 detected — logging out');
      localStorage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default API;