import { lazy, Suspense, useEffect } from 'react'
import { surHoteEmplois } from '@/lib/pagesPubliques'
import { Chargement } from '@/shell/Gardes'
import { Message } from './commun'

// Pages publiques du module RH (sans compte), chargées à part de l'app :
//   /emplois          formulaire de candidature (remplace « Dépôt de candidatures »)
//   /retour/<jeton>   intention de retour, par lien personnel
//   /dossier/<jeton>  dossier d'embauche d'une embauche
// Sur le sous-domaine des emplois, toute autre adresse mène au formulaire.

const Emplois = lazy(() => import('./Emplois'))
const Retour = lazy(() => import('./Retour'))
const Dossier = lazy(() => import('./Dossier'))

export default function PagesRh() {
  const chemin = window.location.pathname
  const jeton = chemin.split('/')[2] ?? ''
  const page = chemin.startsWith('/retour/') ? (
    <Retour jeton={jeton} />
  ) : chemin.startsWith('/dossier/') ? (
    <Dossier jeton={jeton} />
  ) : chemin.replace(/\/$/, '') === '/emplois' ? (
    <Emplois />
  ) : surHoteEmplois() ? (
    <VersEmplois />
  ) : (
    <Message titre="Page introuvable" />
  )
  return <Suspense fallback={<Chargement />}>{page}</Suspense>
}

function VersEmplois() {
  useEffect(() => {
    window.location.replace(`/emplois${window.location.search}`)
  }, [])
  return <Chargement />
}
