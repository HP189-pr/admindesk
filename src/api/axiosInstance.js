import axios from 'axios';

// Resolve backend origin with sensible fallbacks for prod and dev
const resolveApiBase = () => {
  const envBase = import.meta.env.VITE_API_BASE_URL?.trim();
  if (envBase) return envBase.replace(/\/$/, '');

  const defaultBackendPort = import.meta.env.PROD ? '8000' : '8001';

  if (typeof window === 'undefined') return `http://127.0.0.1:${defaultBackendPort}`;

  const url = new URL(window.location.href);
  const localHost = ['127.0.0.1', 'localhost'].includes(url.hostname);
  const frontendPorts = new Set(['3000', '5173', '5174', '8081']);
  // If frontend runs locally on known UI ports, map to configured backend port.
  if (localHost && frontendPorts.has(url.port)) {
    url.port = defaultBackendPort;
    return url.origin;
  }
  if (localHost && !url.port) {
    url.port = defaultBackendPort;
    return url.origin;
  }
  return url.origin;
};

const apiBaseUrl = resolveApiBase();
export const API_BASE_URL = apiBaseUrl;

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
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ✅ OPTIONAL but recommended: auto logout on 401
API.interceptors.response.use(
  (response) => response,
  (error) => {
    // Skip redirect when the refresh endpoint itself returns 401 (avoids double-logout loop)
    if (error.response?.status === 401 && !error.config?.url?.includes('/api/token/refresh/')) {
      console.warn('401 detected — logging out');
      localStorage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// LONG_API — identical to API but with a 2-minute timeout for bulk uploads and large reports
export const LONG_API = axios.create({
  baseURL: apiBaseUrl,
  headers: { 'Content-Type': 'application/json' },
  timeout: 120000,
});

LONG_API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

LONG_API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/api/token/refresh/')) {
      console.warn('401 detected on LONG_API — logging out');
      localStorage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default API;