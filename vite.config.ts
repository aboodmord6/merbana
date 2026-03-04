import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
  // Prevent Vite from pre-bundling sql.js — its WASM loader breaks under dep optimisation
  optimizeDeps: {
    exclude: ['sql.js'],
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
