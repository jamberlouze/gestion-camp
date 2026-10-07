import type { ReactNode } from 'react'
import { PucesEtiquettes } from '@/lib/Etiquettes'
import { ui } from '@/lib/ui'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useMajTache, type Donnees } from './donnees'
import { dateCourte, enRetard, useDroits, useOuvrir } from './outils'
import { PRIORITES, type Tache } from './types'

export function Pastille({ couleur }: { couleur: string | null }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: couleur ?? 'var(--color-pierre-300)' }} aria-hidden />
}

type Ton = 'retard' | 'urgent' | 'prioritaire' | 'trier' | 'libre'
const TONS: Record<Ton, string> = {
  retard: 'bg-red-50 text-red-800',
  urgent: 'bg-red-600 text-white',
  prioritaire: 'bg-orange-100 text-orange-800',
  trier: 'bg-amber-100 text-amber-900',
  libre: 'border border-dashed border-pierre-300 text-pierre-500',
}

export function Puce({ children, couleur, ton }: { children: ReactNode; couleur?: string | null; ton?: Ton }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${ton ? TONS[ton] : 'bg-pierre-100 text-pierre-700'}`}>
      {couleur !== undefined && <Pastille couleur={couleur} />}
      {children}
    </span>
  )
}

/** Case à cocher d'une tâche : cochée = terminée. */
export function CaseTache({ tache: t }: { tache: Tache }) {
  const droits = useDroits()
  const maj = useMajTache()
  const faite = t.statut === 'terminee'
  const permis = droits.cocher(t)
  const retard = enRetard(t)
  const basculer = () =>
    maj.mutate({
      id: t.id,
      champs: faite
        ? { statut: 'a_faire', fait_le: null, fait_par: null }
        : { statut: 'terminee', fait_le: new Date().toISOString(), fait_par: droits.moi },
    })
  const style = faite
    ? 'border-foret-700 bg-foret-700 text-white'
    : t.statut === 'a_trier'
      ? 'border-dashed border-amber-400 bg-amber-50'
      : retard
        ? 'border-red-500 bg-white hover:bg-red-50'
        : 'border-pierre-400 bg-white hover:border-foret-600'
  return (
    <button
      type="button"
      aria-label={faite ? 'Décocher' : 'Cocher comme faite'}
      title={t.statut === 'a_trier' ? 'Pas encore triée par la direction' : t.annualisee_vers ? 'Envoyée dans Mastertimeline' : undefined}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 text-sm font-bold disabled:cursor-default ${style}`}
      onClick={basculer}
      disabled={!permis}
    >
      {faite ? '✓' : ''}
    </button>
  )
}

export interface Montrer {
  lieu?: boolean
  categorie?: boolean
  chantier?: boolean
  personne?: boolean
}

/** Une tâche dans une liste : case, titre (ouvre la fiche) et étiquettes. */
export function LigneTache({ tache: t, d, montrer = { lieu: true, chantier: true, personne: true } }: { tache: Tache; d: Donnees; montrer?: Montrer }) {
  const ouvrir = useOuvrir()
  const faite = t.statut === 'terminee'
  const retard = enRetard(t)
  const lieu = t.lieu_id ? d.lieu.get(t.lieu_id) : null
  const categorie = t.categorie_id ? d.categorie.get(t.categorie_id) : null
  const chantier = t.chantier_id ? d.chantier.get(t.chantier_id) : null
  const assigne = t.assigne_a ? d.personne.get(t.assigne_a) : null
  const fait = t.fait_par ? d.personne.get(t.fait_par) : null
  const nbPhotos = d.photos.get(t.id)?.length ?? 0
  const nbCommentaires = d.commentaires.get(t.id)?.length ?? 0

  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <CaseTache tache={t} />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          className={`text-left text-sm hover:underline ${faite ? 'text-pierre-500 line-through decoration-pierre-300' : 'font-medium text-pierre-900 decoration-pierre-300'}`}
          onClick={() => ouvrir({ type: 'fiche', id: t.id })}
        >
          {t.titre}
        </button>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {t.statut === 'a_trier' && <Puce ton="trier">À trier</Puce>}
          {!faite && t.priorite === 1 && <Puce ton="urgent">Urgent</Puce>}
          {!faite && t.priorite === 2 && <Puce ton="prioritaire">{PRIORITES[2]}</Puce>}
          {!faite && t.echeance && <Puce ton={retard ? 'retard' : undefined}>{retard ? 'En retard · ' : ''}{dateCourte(t.echeance)}</Puce>}
          {montrer.lieu && lieu && <Puce>📍 {lieu.nom}</Puce>}
          {montrer.categorie && categorie && <Puce>{categorie.nom}</Puce>}
          {montrer.chantier && chantier && <Puce couleur={chantier.couleur}>{chantier.nom}</Puce>}
          {montrer.personne && t.statut === 'a_faire' && (assigne ? <Puce>👤 {assigne.nom}</Puce> : <Puce ton="libre">À assigner</Puce>)}
          <PucesEtiquettes ids={t.etiquette_ids} liste={d.etiquettes} />
          {faite && t.annualisee_vers && <Puce>↻ Dans Mastertimeline</Puce>}
          {faite && !t.annualisee_vers && t.fait_le && (
            <span className="text-xs text-pierre-500">
              Faite le {dateCourte(t.fait_le)}
              {fait ? ` par ${fait.nom}` : ''}
            </span>
          )}
          {nbPhotos > 0 && <span className="text-xs text-pierre-500">📷 {nbPhotos}</span>}
          {nbCommentaires > 0 && <span className="text-xs text-pierre-500">💬 {nbCommentaires}</span>}
        </div>
      </div>
    </li>
  )
}

/** Liste de tâches dans une carte, avec un titre et un message si vide. */
export function Section({
  titre,
  sous,
  taches,
  d,
  vide,
  montrer,
  actions,
  nombre = taches.length,
  couleur,
}: {
  titre: string
  /** Pastille devant le titre (ex. couleur d'un niveau d'urgence). */
  couleur?: string
  sous?: string
  taches: Tache[]
  d: Donnees
  vide?: string
  montrer?: Montrer
  actions?: ReactNode
  /** Total affiché à côté du titre, si la liste est coupée. */
  nombre?: number
}) {
  if (!taches.length && !vide) return null
  return (
    <section className={ui.carte}>
      <div className="flex flex-wrap items-center gap-2 border-b border-pierre-100 px-3 py-2">
        {couleur && <Pastille couleur={couleur} />}
        <h2 className="text-sm font-semibold text-pierre-800">{titre}</h2>
        <span className="text-xs tabular-nums text-pierre-500">{nombre}</span>
        {sous && <span className="text-xs text-pierre-500">· {sous}</span>}
        {actions && <div className="ml-auto">{actions}</div>}
      </div>
      {taches.length ? (
        <ListeTaches taches={taches} d={d} montrer={montrer} />
      ) : (
        <p className="px-3 py-5 text-center text-sm text-pierre-500">{vide}</p>
      )}
    </section>
  )
}

// ------------------------------------------------------- une par ligne ---

/**
 * Tâches une par ligne : tableau à colonnes alignées sur ordinateur (comme
 * Mastertimeline), liste compacte sur téléphone.
 */
export function ListeTaches({ taches, d, montrer = { lieu: true, chantier: true, personne: true } }: { taches: Tache[]; d: Donnees; montrer?: Montrer }) {
  const large = useMediaQuery('(min-width: 768px)')
  if (!large) {
    return (
      <ul className="divide-y divide-pierre-100">
        {taches.map((t) => (
          <LigneTache key={t.id} tache={t} d={d} montrer={montrer} />
        ))}
      </ul>
    )
  }
  return (
    <table className="w-full table-fixed text-sm">
      <colgroup>
        <col className="w-12" />
        <col />
        {montrer.lieu && <col className="w-36 xl:w-44" />}
        {montrer.categorie && <col className="w-36 xl:w-44" />}
        {montrer.chantier && <col className="w-36 xl:w-48" />}
        {montrer.personne && <col className="w-32 xl:w-40" />}
      </colgroup>
      <thead className="border-b border-pierre-100">
        <tr>
          <th className="sr-only">Fait</th>
          <th className={entete}>Tâche</th>
          {montrer.lieu && <th className={entete}>Lieu</th>}
          {montrer.categorie && <th className={entete}>Catégorie</th>}
          {montrer.chantier && <th className={entete}>Chantier</th>}
          {montrer.personne && <th className={entete}>Assignée à</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-pierre-100">
        {taches.map((t) => (
          <RangeeTache key={t.id} tache={t} d={d} montrer={montrer} />
        ))}
      </tbody>
    </table>
  )
}

const entete = 'px-2 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-pierre-400'

function RangeeTache({ tache: t, d, montrer }: { tache: Tache; d: Donnees; montrer: Montrer }) {
  const ouvrir = useOuvrir()
  const droits = useDroits()
  const faite = t.statut === 'terminee'
  const retard = enRetard(t)
  const lieu = t.lieu_id ? d.lieu.get(t.lieu_id) : null
  const categorie = t.categorie_id ? d.categorie.get(t.categorie_id) : null
  const chantier = t.chantier_id ? d.chantier.get(t.chantier_id) : null
  const assigne = t.assigne_a ? d.personne.get(t.assigne_a) : null
  const fait = t.fait_par ? d.personne.get(t.fait_par) : null
  const nbPhotos = d.photos.get(t.id)?.length ?? 0
  const nbCommentaires = d.commentaires.get(t.id)?.length ?? 0
  const secondaire = faite ? 'text-pierre-400' : 'text-pierre-600'

  return (
    <tr className="align-top hover:bg-pierre-50/60">
      <td className="px-3 py-1.5">
        <CaseTache tache={t} />
      </td>
      <td className="px-2 py-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <button
            type="button"
            className={`text-left hover:underline ${faite ? 'text-pierre-500 line-through decoration-pierre-300' : 'text-pierre-900 decoration-pierre-300'}`}
            onClick={() => ouvrir({ type: 'fiche', id: t.id })}
          >
            {t.titre}
          </button>
          {!faite && t.priorite === 1 && <Puce ton="urgent">Urgent</Puce>}
          {!faite && t.priorite === 2 && <Puce ton="prioritaire">{PRIORITES[2]}</Puce>}
          {!faite && t.echeance && <Puce ton={retard ? 'retard' : undefined}>{retard ? 'En retard · ' : ''}{dateCourte(t.echeance)}</Puce>}
          <PucesEtiquettes ids={t.etiquette_ids} liste={d.etiquettes} />
          {faite && t.annualisee_vers && <Puce>↻ Dans Mastertimeline</Puce>}
          {faite && !t.annualisee_vers && t.fait_le && (
            <span className="text-xs text-pierre-400">
              Faite le {dateCourte(t.fait_le)}
              {fait ? ` par ${fait.nom}` : ''}
            </span>
          )}
          {nbPhotos > 0 && <span className="text-xs text-pierre-500">📷 {nbPhotos}</span>}
          {nbCommentaires > 0 && <span className="text-xs text-pierre-500">💬 {nbCommentaires}</span>}
        </div>
      </td>
      {montrer.lieu && <td className={`truncate px-2 py-2 ${secondaire}`}>{lieu?.nom}</td>}
      {montrer.categorie && <td className={`truncate px-2 py-2 ${secondaire}`}>{categorie?.nom}</td>}
      {montrer.chantier && (
        <td className={`px-2 py-2 ${secondaire}`}>
          {chantier && (
            <span className="flex items-center gap-1.5">
              <Pastille couleur={chantier.couleur} />
              <span className="truncate">{chantier.nom}</span>
            </span>
          )}
        </td>
      )}
      {montrer.personne && (
        <td className="px-2 py-1.5">
          {droits.trieur && t.statut === 'a_faire' ? (
            <ChoixAssigne tache={t} d={d} />
          ) : (
            <span className={`block truncate py-0.5 ${secondaire}`}>{faite ? '' : (assigne?.nom ?? 'À assigner')}</span>
          )}
        </td>
      )}
    </tr>
  )
}

/** Petit menu en forme d'étiquette : change la personne assignée (direction). */
export function ChoixAssigne({ tache: t, d }: { tache: Tache; d: Donnees }) {
  const maj = useMajTache()
  const actuel = t.assigne_a
  return (
    <select
      aria-label={`Assignée à : « ${t.titre} »`}
      className={`fleche-serree max-w-full rounded-full border py-0.5 pl-2 text-xs ${
        actuel ? 'border-pierre-200 bg-pierre-100 text-pierre-700' : 'border-dashed border-pierre-300 bg-white text-pierre-500'
      }`}
      value={actuel ?? ''}
      onChange={(e) => maj.mutate({ id: t.id, champs: { assigne_a: e.target.value || null } })}
    >
      <option value="">À assigner</option>
      {d.personnes
        .filter((p) => p.peut_assigner || p.id === actuel)
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.nom}
          </option>
        ))}
    </select>
  )
}

export function Chargement() {
  return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
}
