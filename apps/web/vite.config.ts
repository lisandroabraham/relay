import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Necesario para abrir la app desde la URL reenviada de GitHub Codespaces.
    host: true,
    allowedHosts: ['.app.github.dev'],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
