import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');
  // Default to host:8000 if running preview on 8081, else fall back to local 127.0.0.1:8000
  let apiBaseUrl = env.VITE_API_BASE_URL;
  if (!apiBaseUrl) {
    apiBaseUrl = 'http://127.0.0.1:8000';
    if (env.VITE_HOST) {
      apiBaseUrl = `http://${env.VITE_HOST}:8000`;
    }
  }

  // WebSocket backend can be separate (ASGI/Daphne)
  let wsBaseUrl = env.VITE_WS_BASE_URL;
  if (!wsBaseUrl) {
    wsBaseUrl = 'http://127.0.0.1:8001';
    if (env.VITE_HOST) {
      wsBaseUrl = `http://${env.VITE_HOST}:8001`;
    }
  }

  // Guardrail for local dev: avoid proxying API calls back to frontend ports.
  // If .env points to localhost:3000/8081 by mistake, force Django backend target.
  if (mode === 'development') {
    try {
      const parsed = new URL(apiBaseUrl);
      const isLocalHost = ['127.0.0.1', 'localhost'].includes(parsed.hostname);
      if (isLocalHost && ['3000', '8081'].includes(parsed.port)) {
        apiBaseUrl = 'http://127.0.0.1:8000';
      }
    } catch (_) {
      apiBaseUrl = 'http://127.0.0.1:8000';
    }
  }

  return {
    plugins: [react()],
    base: '/',
    server: {
      port: 3000,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiBaseUrl,
          changeOrigin: true,
        },
        '/media': {
          target: apiBaseUrl,
          changeOrigin: true,
        },
        '/ws': {
          target: wsBaseUrl,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    preview: {
      port: 8081,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiBaseUrl,
          changeOrigin: true,
        },
        '/media': {
          target: apiBaseUrl,
          changeOrigin: true,
        },
        '/ws': {
          target: wsBaseUrl,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
  };
});
