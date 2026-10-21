import { useInfiniteQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { Chargement } from './commun'
import { dateCourte, heure } from './dates'
import { lireJournal, useNomsPersonnel } from './donnees'
import { META_SECTEUR, STATUTS_PRESENCE, type EntreeJournal, type Secteur, type StatutPresence } from './types'

const TABLES: Record<string, string> = {
  // Anciens séjours, d'avant les réservations de l'app : gardés pour l'historique.
  sejours: 'Séjours',
  evenements: 'Événements',
  presences_simples: 'Présences',
  personnel: 'Personnel',
}

const ACTIONS: Record<EntreeJournal['action'], { libelle: string; classe: string }> = {
  ajout: { libelle: 'Ajout', classe: 'bg-foret-50 text-foret-800' },
  modification: { libelle: 'Modification', classe: 'bg-sky-50 text-sky-900' },
  suppression: { libelle: 'Suppression', classe: 'bg-red-50 text-red-800' },
  restauration: { libelle: 'Rétablissement', classe: 'bg-amber-50 text-amber-900' },
  effacement: { libelle: 'Effacement', classe: 'bg-red-50 text-red-800' },
}

const CHAMPS: Record<string, string> = {
  titre: 'titre',
  type: 'type',
  date_debut: 'début',
  date_fin: 'fin',
  heure_debut: 'heure de début',
  heure_fin: 'heure de fin',
  regle_recurrence: 'répétition',
  fin_recurrence: 'fin de la répétition',
  exceptions: 'occurrences retirées',
  lieu: 'lieu',
  notes: 'notes',
  description: 'note',
  personnel_id: 'personne',
  date: 'date',
  secteur: 'secteur',
  nom: 'nom',
  secteur_principal: 'secteur',
  actif: 'actif',
  ordre: 'ordre',
  statut: 'choix',
  courriel: 'courriel',
  personne_cuisine_id: 'horaire de cuisine',
}
const AUCUN_NOM = new Map<string, string>()
const IGNORES = new Set(['id', 'created_at', 'updated_at', 'updated_by', 'deleted_at'])

const valeurLisible = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '∅'
  if (typeof v === 'boolean') return v ? 'oui' : 'non'
  if (Array.isArray(v)) return v.length ? v.join(', ') : '∅'
  const t = String(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return dateCourte(t)
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(t)) return heure(t)
  return t.length > 60 ? `${t.slice(0, 60)}…` : t
}

/** Qui a modifié quoi, quand (rien n'est effacé : on peut tout retrouver). */
export function Journal() {
  const [table, setTable] = useState('')
  // Personnes retirées comprises : leurs présences gardent leur nom.
  const noms = useNomsPersonnel().data ?? AUCUN_NOM
  const journal = useInfiniteQuery({
    queryKey: ['calendrier', 'journal', table],
    queryFn: ({ pageParam }) => lireJournal(pageParam, table || null),
    initialPageParam: null as number | null,
    getNextPageParam: (derniere) => (derniere.length === 100 ? derniere[derniere.length - 1].id : undefined),
  })
  const entrees = useMemo(() => journal.data?.pages.flat() ?? [], [journal.data])

  /** Ce que la ligne désigne : « Livraison Colabor », « Julie, 4 oct. »… */
  function sujet(e: EntreeJournal): string {
    const l = (e.nouveau ?? e.ancien ?? {}) as Record<string, unknown>
    if (e.table_name === 'evenements') return String(l.titre ?? '')
    if (e.table_name === 'sejours') return String(l.nom_groupe ?? '')
    if (e.table_name === 'personnel') return String(l.nom ?? '')
    const qui = noms.get(String(l.personnel_id)) ?? 'quelqu’un'
    const detail = l.secteur ? ` (${META_SECTEUR[l.secteur as Secteur]?.libelle ?? l.secteur})` : ''
    return `${qui}, ${l.date ? dateCourte(String(l.date)) : ''}${detail}`
  }

  function changements(e: EntreeJournal): string[] {
    if (e.action !== 'modification' || !e.ancien || !e.nouveau) return []
    const avant = e.ancien
    const apres = e.nouveau
    return Object.keys(apres)
      .filter((k) => !IGNORES.has(k) && JSON.stringify(avant[k]) !== JSON.stringify(apres[k]))
      .map((k) => {
        const lisible = (v: unknown) =>
          k === 'personnel_id'
            ? (noms.get(String(v)) ?? '?')
            : k === 'statut' && typeof v === 'string' && v in STATUTS_PRESENCE
              ? `${STATUTS_PRESENCE[v as StatutPresence].emoji} ${STATUTS_PRESENCE[v as StatutPresence].libelle}`
              : k === 'personne_cuisine_id'
                ? v
                  ? 'oui'
                  : 'non'
                : valeurLisible(v)
        return `${CHAMPS[k] ?? k} : ${lisible(avant[k])} → ${lisible(apres[k])}`
      })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Filtrer" className={`${ui.champ} w-auto!`} value={table} onChange={(e) => setTable(e.target.value)}>
          <option value="">Tout</option>
          {Object.entries(TABLES).map(([cle, libelle]) => (
            <option key={cle} value={cle}>
              {libelle}
            </option>
          ))}
        </select>
        <p className="text-sm text-pierre-500">Pour revoir une journée passée telle quelle, changez simplement la date dans l'onglet Calendrier.</p>
      </div>
      {journal.error && <p className={ui.erreur}>{messageErreur(journal.error)}</p>}
      {!journal.data ? (
        <Chargement />
      ) : !entrees.length ? (
        <p className="text-sm text-pierre-500">Aucune modification pour l'instant.</p>
      ) : (
        <ul className={`${ui.carte} divide-y divide-pierre-100`}>
          {entrees.map((e) => {
            const quand = new Date(e.modifie_le)
            const details = changements(e)
            return (
              <li key={e.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className="w-32 shrink-0 tabular-nums text-pierre-500">
                  {quand.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })}{' '}
                  {quand.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${ACTIONS[e.action].classe}`}>{ACTIONS[e.action].libelle}</span>
                <span className="min-w-0 flex-1">
                  <span className="text-pierre-500">{TABLES[e.table_name] ?? e.table_name} · </span>
                  <span className="font-medium">{sujet(e)}</span>
                  {details.length > 0 && <span className="block text-xs text-pierre-600">{details.join(' ; ')}</span>}
                </span>
                <span className="shrink-0 text-pierre-600">{e.modifie_par_nom ?? 'Système'}</span>
              </li>
            )
          })}
        </ul>
      )}
      {journal.hasNextPage && (
        <button className={ui.boutonSecondaire} disabled={journal.isFetchingNextPage} onClick={() => journal.fetchNextPage()}>
          {journal.isFetchingNextPage ? 'Chargement…' : 'Plus ancien'}
        </button>
      )}
    </div>
  )
}
