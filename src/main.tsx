import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'
import { Confirmations } from './lib/Confirmation'
import { clientRequetes, persistance } from './lib/requetes'
import { FournisseurAuth } from './shell/auth'

// Service worker : garde l'app disponible sans réseau et se met à jour seul.
registerSW({ immediate: true })

// Après une mise en ligne, un onglet resté ouvert peut réclamer les fichiers
// d'un module qui n'existent plus (nouveaux noms) : au lieu d'une page
// blanche, on recharge pour prendre la nouvelle version. Une seule fois par
// minute, pour ne pas boucler si le réseau est vraiment coupé.
window.addEventListener('vite:preloadError', (evenement) => {
  const cle = 'rechargement-apres-mise-a-jour'
  let dernier = 0
  try {
    dernier = Number(sessionStorage.getItem(cle) ?? 0)
  } catch {
    // Stockage indisponible : on recharge quand même.
  }
  if (Date.now() - dernier < 60_000) return
  try {
    sessionStorage.setItem(cle, String(Date.now()))
  } catch {
    // Idem.
  }
  evenement.preventDefault()
  location.reload()
})

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
          <Confirmations />
        </BrowserRouter>
      </FournisseurAuth>
    </PersistQueryClientProvider>
  </StrictMode>,
)
