import axios from 'axios';

// Use provided API base URL; otherwise use a relative URL so Vite dev
// server proxy can forward `/api` to the backend during development.
const baseURL = import.meta.env.VITE_API_BASE_URL ?? '';

const API = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Attach Authorization header automatically when access token is present
API.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (e) {
    // ignore localStorage errors in SSR or restricted environments
  }
  return config;
});

export default API;
