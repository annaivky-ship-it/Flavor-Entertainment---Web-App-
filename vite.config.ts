import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
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
          includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
          workbox: {
            navigateFallback: '/index.html',
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'firebase-storage-cache',
                  expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
                },
              },
            ],
          },
          manifest: {
            name: 'Flavor Entertainers',
            short_name: 'Flavor',
            description: 'Premium Entertainment Booking',
            theme_color: '#F97316',
            background_color: '#0A0A0A',
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
              'firebase-core': ['firebase/app', 'firebase/auth'],
              'firebase-db': ['firebase/firestore'],
              'firebase-storage': ['firebase/storage', 'firebase/functions'],
              'react-vendor': ['react', 'react-dom'],
            }
          }
        }
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
