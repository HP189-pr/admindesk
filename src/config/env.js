/**
 * Environment Configuration
 * Centralized configuration for API and media URLs
 */

const config = {
  // API base URL - where Django backend runs
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  
  // Media base URL - where Django serves media files
  mediaBaseUrl: import.meta.env.VITE_MEDIA_BASE_URL || 'http://localhost:8000',
  
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
