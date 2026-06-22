import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/dvtoken': 'http://localhost:3000',
      '/widget-config': 'http://localhost:3000',
    },
  },
});
