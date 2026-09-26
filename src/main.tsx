import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'
import { clientRequetes, persistance } from './lib/requetes'
import { FournisseurAuth } from './shell/auth'

// Service worker : garde l'app disponible sans réseau et se met à jour seul.
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={clientRequetes}
      persistOptions={persistance}
      // Relance les modifications faites hors ligne avant la fermeture de l'app.
      onSuccess={() => clientRequetes.resumePausedMutations()}
    >
      <FournisseurAuth>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </FournisseurAuth>
    </PersistQueryClientProvider>
  </StrictMode>,
)
