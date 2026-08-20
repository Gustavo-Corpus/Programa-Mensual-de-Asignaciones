import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // IMPORTANTE: este valor DEBE coincidir exactamente con el nombre del
  // repositorio de GitHub ("Programa-Mensual-de-Asignaciones"), porque el
  // sitio se publica en GitHub Pages bajo
  // https://<usuario>.github.io/Programa-Mensual-de-Asignaciones/.
  // Si el repositorio cambia de nombre, hay que actualizar este valor.
  base: '/Programa-Mensual-de-Asignaciones/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
