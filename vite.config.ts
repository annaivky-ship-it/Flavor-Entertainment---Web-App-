/// <reference types="vitest/config" />
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode: _mode }) => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(), 
        tailwindcss(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['brand/monogram-favicon.svg', 'brand/monogram.svg', 'brand/wordmark.svg'],
          manifest: {
            name: 'The Private Book',
            short_name: 'Private Book',
            description: 'By invitation only.',
            theme_color: '#000000',
            background_color: '#000000',
            display: 'standalone',
            icons: [
              {
                src: 'pwa-192x192.svg',
                sizes: '192x192',
                type: 'image/svg+xml'
              },
              {
                src: 'pwa-512x512.svg',
                sizes: '512x512',
                type: 'image/svg+xml'
              },
              {
                src: 'pwa-512x512.svg',
                sizes: '512x512',
                type: 'image/svg+xml',
                purpose: 'any maskable'
              }
            ]
          }
        })
      ],
      css: {
        transformer: 'lightningcss',
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/functions'],
              vendor: ['react', 'react-dom'],
            },
          },
        },
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./tests/setup.ts'],
        include: ['tests/**/*.test.{ts,tsx}'],
        coverage: {
          provider: 'v8' as any,
          include: ['utils/**', 'components/**', 'services/**'],
        },
      },
    };
});
