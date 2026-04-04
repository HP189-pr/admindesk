// src/config/env.js
/**
 * Environment Configuration
 * Centralized configuration for API and media URLs
 */

const FRONTEND_PORTS = new Set(['3000', '5173', '5174', '8081']);
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

const resolveDefaultBackendOrigin = () => {
  const localPort = import.meta.env.VITE_LOCAL_BACKEND_PORT?.trim() || '8001';
  const productionPort = import.meta.env.VITE_PROD_BACKEND_PORT?.trim() || '8001';

  if (typeof window === 'undefined') {
    return `http://127.0.0.1:${import.meta.env.PROD ? productionPort : localPort}`;
  }

  const url = new URL(window.location.href);
  const protocol = url.protocol || 'http:';
  const hostname = url.hostname || '127.0.0.1';

  const defaultBackendPort = import.meta.env.PROD ? productionPort : localPort;

  if (!url.port || FRONTEND_PORTS.has(url.port)) {
    return `${protocol}//${hostname}:${defaultBackendPort}`;
  }

  return `${protocol}//${hostname}${url.port ? `:${url.port}` : ''}`;
};

const defaultBackendOrigin = resolveDefaultBackendOrigin();

// When env var is explicitly '' (production/nginx), use '' for relative paths.
const pickBase = (envVar, fallback) =>
  (envVar !== undefined ? envVar.trim() : null) ?? fallback;

const config = {
  // API base URL — empty string in production = relative, nginx proxies /api/
  apiBaseUrl: pickBase(import.meta.env.VITE_API_BASE_URL, defaultBackendOrigin),

  // Media base URL
  mediaBaseUrl: pickBase(import.meta.env.VITE_MEDIA_BASE_URL, defaultBackendOrigin),
  
  // Helper to build media URLs
  getMediaUrl: (path) => {
    if (!path) return null;
    // If path already includes http/https, return as-is
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    // Remove leading slash if present to avoid double slashes
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return `${config.mediaBaseUrl}/${cleanPath}`;
  },
  
  // Helper to build API URLs
  getApiUrl: (endpoint) => {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    return `${config.apiBaseUrl}/${cleanEndpoint}`;
  }
};

export default config;
