import axios from 'axios';

// Prefer explicit backend origin when provided, otherwise fall back to relative URL for proxy setups
const apiBaseUrl = import.meta?.env?.VITE_API_BASE_URL?.trim() || '/';

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