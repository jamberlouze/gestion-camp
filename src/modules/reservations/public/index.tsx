import { lazy, Suspense, useEffect } from 'react'
import { Chargement } from '@/shell/Gardes'

// Pages publiques (clients sans compte), chargées à part de l'app :
//   /demande          formulaire de demande (remplace Jotform)
//   /client/<jeton>   page client (estimé, contrat, documents, fiches, message)
//   /signer/<jeton>   signature du contrat
//   /fiches/<jeton>   fiches participants
// Sur le sous-domaine public, toute autre adresse mène au formulaire.

const Demande = lazy(() => import('./Demande'))
const PageClient = lazy(() => import('./PageClient'))
const SignaturePublique = lazy(() => import('./SignaturePublique'))
const Fiches = lazy(() => import('./Fiches'))

export default function PagesPubliques() {
  const chemin = window.location.pathname
  const page = chemin.startsWith('/client/')
    ? <PageClient />
    : chemin.startsWith('/signer/')
      ? <SignaturePublique />
      : chemin.startsWith('/fiches/')
        ? <Fiches />
        : chemin.replace(/\/$/, '') === '/demande'
          ? <Demande />
          : <VersDemande />
  return <Suspense fallback={<Chargement />}>{page}</Suspense>
}

function VersDemande() {
  useEffect(() => {
    window.location.replace(`/demande${window.location.search}`)
  }, [])
  return <Chargement />
}
