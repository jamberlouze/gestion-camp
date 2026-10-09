import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { spawn, type ChildProcess } from 'node:child_process'
import { connect } from 'node:net'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const PORT_WORKER = 8787

/** Vrai si quelque chose écoute déjà sur ce port (ex. un Worker lancé ailleurs). */
const portOccupe = (port: number) =>
  new Promise<boolean>((resolve) => {
    const s = connect(port, '127.0.0.1')
    s.once('connect', () => {
      s.destroy()
      resolve(true)
    })
    s.once('error', () => resolve(false))
  })

/**
 * En DEV, le Worker local (routes /api/* : formulaire public, documents de la
 * page client) démarre avec `npm run dev`, sauf s'il roule déjà (npm run
 * worker:dev, autre serveur de dev). Il survit aux redémarrages de Vite
 * (changement de configuration) et s'arrête avec lui (Ctrl-C).
 */
function workerLocal(): Plugin {
  return {
    name: 'worker-local',
    apply: 'serve',
    async configureServer() {
      const g = globalThis as { workerLocal?: ChildProcess }
      if (g.workerLocal && g.workerLocal.exitCode === null) return
      if (await portOccupe(PORT_WORKER)) return
      // Sans le menu clavier de Wrangler : le clavier du terminal reste à Vite.
      const enfant = spawn('npx', ['wrangler', 'dev', '--port', String(PORT_WORKER), '--log-level', 'error', '--show-interactive-dev-session=false'], {
        cwd: fileURLToPath(new URL('.', import.meta.url)),
        stdio: ['ignore', 'inherit', 'inherit'],
      })
      g.workerLocal = enfant
      process.once('exit', () => enfant.kill())
    },
  }
}

export default defineConfig({
  plugins: [
    // En DEV (npm run dev), icône orange « DEV » pour ne pas confondre l'onglet avec la PROD.
    {
      name: 'icone-dev',
      apply: 'serve',
      transformIndexHtml: (html) =>
        html
          .replace('href="/favicon.svg"', 'href="/favicon-dev.svg"')
          .replace('content="#0f5132"', 'content="#e8590c"')
          .replace('<title>Gestion du camp</title>', '<title>DEV · Gestion du camp</title>'),
    },
    workerLocal(),
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
        navigateFallbackDenylist: [/^\/_ping/, /^\/api\//],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // En DEV, les routes /api/* vont au Worker local (voir workerLocal).
  server: {
    proxy: { '/api': `http://127.0.0.1:${PORT_WORKER}` },
  },
})
