import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { defaultShouldDehydrateQuery, QueryClient, type Query } from '@tanstack/react-query'
import { enregistrerMutationsEmbarcations } from '@/modules/embarcations/donnees'
import { enregistrerMutationsTravaux } from '@/modules/travaux/donnees'
import { oublierToutesLesPhotos } from '@/modules/travaux/photosLocales'

/** Durée de conservation du cache sur l'appareil (lecture hors ligne). */
const TRENTE_JOURS = 30 * 24 * 60 * 60 * 1000

/** Clé du cache gardé dans le navigateur (localStorage). */
const CLE_CACHE = 'gestion-camp-cache'

export const clientRequetes = new QueryClient({
  defaultOptions: {
    // gcTime infini : les données restent en mémoire pour être conservées sur
    // l'appareil. Ne pas mettre une durée > 24,8 jours : les navigateurs
    // déclenchent aussitôt une minuterie plus longue, ce qui effacerait le
    // cache restauré dès son chargement.
    queries: { staleTime: 30_000, gcTime: Infinity, refetchOnWindowFocus: true },
  },
})

// Doit précéder la restauration du cache : les envois restés en attente
// retrouvent ainsi leur fonction d'envoi.
enregistrerMutationsEmbarcations(clientRequetes)
enregistrerMutationsTravaux(clientRequetes)

/**
 * Cache conservé dans le navigateur : données lues et modifications pas
 * encore envoyées. Changer `version` invalide les caches existants (à faire
 * si la forme des données change).
 */
export const persistance = {
  persister: createSyncStoragePersister({
    storage: typeof window === 'undefined' ? undefined : window.localStorage,
    key: CLE_CACHE,
    throttleTime: 500,
  }),
  maxAge: TRENTE_JOURS,
  buster: 'v1',
  // Feuilles de temps, petite caisse et coût par assiette : jamais gardés sur
  // l'appareil (renseignements personnels, argent, noms des clients, salaires).
  dehydrateOptions: {
    shouldDehydrateQuery: (q: Query) => defaultShouldDehydrateQuery(q) && !['temps', 'caisse', 'cuisine-couts', 'mastertimeline-adresses'].includes(String(q.queryKey[0])),
  },
}

/** À la déconnexion : rien des données du camp ne reste sur l'appareil. */
export async function viderCache() {
  clientRequetes.getMutationCache().clear()
  clientRequetes.clear()
  await persistance.persister.removeClient()
  await oublierToutesLesPhotos()
}

type FiltreCle = (cle: readonly unknown[]) => boolean
type CopieGardee = { clientState?: { queries?: { queryKey: readonly unknown[] }[] } } | null

function lireCopieGardee(): CopieGardee {
  try {
    return JSON.parse(localStorage.getItem(CLE_CACHE) ?? 'null')
  } catch {
    return null
  }
}

/** Nombre de requêtes de la copie gardée sur l'appareil qui répondent au filtre. */
export function compterRequetesGardees(filtre: FiltreCle) {
  return (lireCopieGardee()?.clientState?.queries ?? []).filter((q) => filtre(q.queryKey)).length
}

/**
 * Oublie des requêtes (en mémoire et dans la copie gardée sur l'appareil) pour
 * qu'elles soient relues du serveur, ex. une copie d'avant une migration qui
 * fait planter une page. Le reste du cache, les modifications pas encore
 * envoyées et le `buster` ne sont pas touchés.
 */
export function oublierRequetes(filtre: FiltreCle) {
  // En mémoire d'abord : la sauvegarde différée (throttleTime) écrira l'état filtré.
  clientRequetes.removeQueries({ predicate: (q) => filtre(q.queryKey) })
  // Puis la copie de l'appareil tout de suite, sans attendre cette sauvegarde.
  const copie = lireCopieGardee()
  if (!copie?.clientState?.queries) return
  copie.clientState.queries = copie.clientState.queries.filter((q) => !filtre(q.queryKey))
  try {
    localStorage.setItem(CLE_CACHE, JSON.stringify(copie))
  } catch {
    // Stockage indisponible : rien de plus à faire.
  }
}
