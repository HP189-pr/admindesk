import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: '.', // Root is now the main directory
  build: {
    outDir: resolve(__dirname, './Dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, './index.html'), // No 'frontend' prefix
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'), // Adjusted alias since 'src' is now at the root
    },
  },
  server: {
    port: 3000, // Ensure the port matches the one shown in the terminal
    open: true,
  },
});
