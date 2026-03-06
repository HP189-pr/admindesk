import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);
const FRONTEND_PORTS = new Set(['3000', '5173', '5174', '8081']);

const getLocalOrigin = (host, port) => `http://${host}:${port}`;

const normalizeLocalTarget = (target, fallbackHost, fallbackPort) => {
  try {
    const parsed = new URL(target);
    const isLocalHost = LOCAL_HOSTS.has(parsed.hostname);

    if (isLocalHost && FRONTEND_PORTS.has(parsed.port)) {
      parsed.port = fallbackPort;
    }

    if (isLocalHost && !parsed.port) {
      parsed.port = fallbackPort;
    }

    return parsed.origin;
  } catch {
    return getLocalOrigin(fallbackHost, fallbackPort);
  }
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isDevelopment = mode === 'development';
  const defaultHost = env.VITE_HOST || '127.0.0.1';
  const defaultApiPort = isDevelopment ? '8001' : '8000';
  const defaultWsPort = isDevelopment ? '8001' : '8000';

  const apiBaseUrl = normalizeLocalTarget(
    env.VITE_API_BASE_URL || getLocalOrigin(defaultHost, defaultApiPort),
    defaultHost,
    defaultApiPort
  );

  const wsBaseUrl = normalizeLocalTarget(
    env.VITE_WS_BASE_URL || getLocalOrigin(defaultHost, defaultWsPort),
    defaultHost,
    defaultWsPort
  );

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
