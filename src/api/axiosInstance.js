import axios from 'axios';

// Default to localhost backend when VITE_API_BASE_URL isn't provided
const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

const API = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
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
