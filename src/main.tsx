import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'
import { Confirmations } from './lib/Confirmation'
import { estPagePublique } from './lib/pagesPubliques'
import { clientRequetes, persistance } from './lib/requetes'
import { FournisseurAuth } from './shell/auth'
import { FrontiereErreur } from './shell/FrontiereErreur'

// Service worker : garde l'app disponible sans réseau et se met à jour seul.
// Pas sur les pages publiques : un visiteur n'a pas à télécharger toute l'app.
if (!estPagePublique()) {
  registerSW({
    immediate: true,
    // Le navigateur ne cherche une nouvelle version qu'en ouvrant l'app : un
    // onglet resté ouvert gardait l'ancienne après une mise en ligne (base
    // changée → erreurs). On la cherche aussi au retour sur l'onglet ou la
    // fenêtre, au plus une fois par minute ; trouvée, elle s'installe et la
    // page se recharge seule (autoUpdate).
    onRegisteredSW(_adresse, enregistrement) {
      if (!enregistrement) return
      let derniere = Date.now()
      const chercher = () => {
        if (document.visibilityState !== 'visible' || !navigator.onLine || Date.now() - derniere < 60_000) return
        derniere = Date.now()
        enregistrement.update().catch(() => {
          // Réseau coupé ou serveur injoignable : on réessaiera au prochain retour.
        })
      }
      document.addEventListener('visibilitychange', chercher)
      window.addEventListener('focus', chercher)
    },
  })
}

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
    {/* Dernier recours (chaque page a aussi la sienne, dans le cadre) : un
        écran d'erreur plutôt qu'une page blanche. */}
    <FrontiereErreur>
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
    </FrontiereErreur>
  </StrictMode>,
)
