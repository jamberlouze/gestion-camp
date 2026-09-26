import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // App installable + disponible hors ligne (service worker généré au build).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Gestion du camp',
        short_name: 'Camp',
        description: 'Outils de gestion du camp',
        lang: 'fr-CA',
        // Sur téléphone, seul le module Embarcations sert : on y ouvre directement.
        start_url: '/embarcations',
        scope: '/',
        display: 'standalone',
        background_color: '#f8f8f6',
        theme_color: '#0f5132',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone-masquable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // SheetJS ne sert qu'à l'import/export Excel de l'Horaire (ordinateur) :
        // inutile de le télécharger d'avance sur les téléphones.
        globIgnores: ['**/xlsx-*.js'],
        // Toute page de l'app s'ouvre hors ligne (le routeur React prend le relais).
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/_ping/],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
