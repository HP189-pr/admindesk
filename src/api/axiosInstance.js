// src/api/axiosInstance.js
import axios from 'axios';

const FRONTEND_PORTS = new Set(['3000', '5173', '5174', '8081']);
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

const resolveBackendOriginFromWindow = (defaultBackendPort) => {
  if (typeof window === 'undefined') {
    return `http://127.0.0.1:${defaultBackendPort}`;
  }

  const url = new URL(window.location.href);
  const protocol = url.protocol || 'http:';
  const hostname = url.hostname || '127.0.0.1';

  if (!url.port || FRONTEND_PORTS.has(url.port)) {
    return `${protocol}//${hostname}:${defaultBackendPort}`;
  }

  return `${protocol}//${hostname}${url.port ? `:${url.port}` : ''}`;
};

// Resolve backend origin with sensible fallbacks for prod and dev.
// When VITE_API_BASE_URL is explicitly set to '' (production behind nginx),
// return '' so axios uses relative paths and nginx proxies /api/ → backend.
const resolveApiBase = () => {
  const envBase = import.meta.env.VITE_API_BASE_URL?.trim();
  if (envBase !== undefined) return envBase.replace(/\/$/, '');

  // Env var absent entirely → local dev fallback
  const localPort = import.meta.env.VITE_LOCAL_BACKEND_PORT?.trim() || '8001';
  const productionPort = import.meta.env.VITE_PROD_BACKEND_PORT?.trim() || '8001';
  const fallbackPort = import.meta.env.PROD ? productionPort : localPort;
  if (typeof window === 'undefined') {
    return `http://127.0.0.1:${fallbackPort}`;
  }
  return resolveBackendOriginFromWindow(fallbackPort);
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

let pendingTokenRefresh = null;

const clearAuthAndRedirect = () => {
  localStorage.clear();
  window.location.href = '/login';
};

const refreshAccessToken = async () => {
  if (pendingTokenRefresh) return pendingTokenRefresh;

  const refresh = localStorage.getItem('refresh_token');
  if (!refresh) {
    clearAuthAndRedirect();
    return null;
  }

  pendingTokenRefresh = axios
    .post(`${apiBaseUrl}/api/token/refresh/`, { refresh }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    })
    .then((response) => {
      const access = response.data?.access;
      if (!access) throw new Error('No access token returned');
      localStorage.setItem('access_token', access);
      return access;
    })
    .catch((error) => {
      console.warn('Token refresh failed — logging out', error.response?.data || error.message);
      clearAuthAndRedirect();
      return null;
    })
    .finally(() => {
      pendingTokenRefresh = null;
    });

  return pendingTokenRefresh;
};

const handleUnauthorized = async (error, client, label = 'API') => {
  const originalRequest = error.config;
  const isUnauthorized = error.response?.status === 401;
  const isRefreshRequest = originalRequest?.url?.includes('/api/token/refresh/');

  if (!isUnauthorized || isRefreshRequest || originalRequest?._retry) {
    return Promise.reject(error);
  }

  originalRequest._retry = true;
  const access = await refreshAccessToken();
  if (!access) {
    return Promise.reject(error);
  }

  console.warn(`401 detected on ${label} — refreshed token and retried request`);
  originalRequest.headers = originalRequest.headers || {};
  originalRequest.headers.Authorization = `Bearer ${access}`;
  return client(originalRequest);
};

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

// Refresh once on 401 so active users are not logged out when the access token expires.
API.interceptors.response.use(
  (response) => response,
  (error) => handleUnauthorized(error, API)
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
  (error) => handleUnauthorized(error, LONG_API, 'LONG_API')
);

export default API;
