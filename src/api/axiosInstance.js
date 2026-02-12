import axios from 'axios';

// Resolve backend origin with sensible fallbacks for prod and dev
const resolveApiBase = () => {
  const envBase = import.meta?.env?.VITE_API_BASE_URL?.trim();
  if (envBase) return envBase.replace(/\/$/, '');

  if (typeof window === 'undefined') return 'http://127.0.0.1:8000';

  const url = new URL(window.location.href);
  // If frontend runs on 8081, assume backend on same host port 8000
  if (url.port === '8081') {
    url.port = '8000';
    return url.origin;
  }
  return url.origin;
};

const apiBaseUrl = resolveApiBase();

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