/**
 * DEMO BUILD CONFIG
 * ─────────────────
 * Runs on port 3001 so demo and live can run side-by-side.
 * Key differences from the live config:
 *   1. VITE_APP_MODE=demo injected at build time
 *   2. data/mockData aliased to data/demoData (richer seed data, no real Firebase)
 *   3. No Firebase env vars needed — app falls back to in-memory mock data
 *   4. Output goes to dist-demo/ to keep build artifacts separate
 */
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  // Load any .env.demo overrides (optional — demo works without Firebase config)
  const env = loadEnv(mode, '.', '');

  return {
    // ── Dev server ────────────────────────────────────────────────────────────
    server: {
      port: 3001,
      host: '0.0.0.0',
    },

    // ── Build output ──────────────────────────────────────────────────────────
    build: {
      outDir: 'dist-demo',
      emptyOutDir: true,
    },

    // ── Compile-time constants ────────────────────────────────────────────────
    define: {
      // Inject VITE_APP_MODE so IS_DEMO checks work across the codebase
      'import.meta.env.VITE_APP_MODE': JSON.stringify('demo'),
    },

    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'Flavor Entertainers — Demo',
          short_name: 'Flavor Demo',
          description: 'Interactive demo of the Flavor Entertainers booking platform',
          theme_color: '#EA580C',   // Orange to visually distinguish from live
          background_color: '#0A0A0A',
          display: 'standalone',
        },
      }),
    ],

    resolve: {
      alias: {
        // ── Core path alias ───────────────────────────────────────────────────
        '@': path.resolve(__dirname, '.'),

        // ── Demo data alias ───────────────────────────────────────────────────
        // All imports of ./data/mockData or ../data/mockData resolve to demoData.
        // This means api.ts, App.tsx, and any component automatically uses the
        // richer demo dataset with 12 performers and 20+ bookings — zero code changes.
        [path.resolve(__dirname, 'data/mockData.ts')]:
          path.resolve(__dirname, 'data/demoData.ts'),
      },
    },
  };
});
