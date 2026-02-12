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
