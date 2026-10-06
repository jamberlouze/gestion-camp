import type { ReactNode } from 'react'
import { ui } from '@/lib/ui'
import { useMajTache, type Donnees } from './donnees'
import { dateCourte, enRetard, useDroits, useOuvrir } from './outils'
import { PRIORITES, type Tache } from './types'

export function Pastille({ couleur }: { couleur: string | null }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: couleur ?? 'var(--color-pierre-300)' }} aria-hidden />
}

type Ton = 'retard' | 'urgent' | 'trier' | 'libre'
const TONS: Record<Ton, string> = {
  retard: 'bg-red-50 text-red-800',
  urgent: 'bg-red-600 text-white',
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
          {!faite && t.priorite === 3 && <Puce>{PRIORITES[3]}</Puce>}
          {!faite && t.echeance && <Puce ton={retard ? 'retard' : undefined}>{retard ? 'En retard · ' : ''}{dateCourte(t.echeance)}</Puce>}
          {montrer.lieu && lieu && <Puce>📍 {lieu.nom}</Puce>}
          {montrer.categorie && categorie && <Puce>{categorie.nom}</Puce>}
          {montrer.chantier && chantier && <Puce couleur={chantier.couleur}>{chantier.nom}</Puce>}
          {montrer.personne && t.statut === 'a_faire' && (assigne ? <Puce>👤 {assigne.nom}</Puce> : <Puce ton="libre">Libre</Puce>)}
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
}: {
  titre: string
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
        <h2 className="text-sm font-semibold text-pierre-800">{titre}</h2>
        <span className="text-xs tabular-nums text-pierre-500">{nombre}</span>
        {sous && <span className="text-xs text-pierre-500">· {sous}</span>}
        {actions && <div className="ml-auto">{actions}</div>}
      </div>
      {taches.length ? (
        <ul className="divide-y divide-pierre-100">
          {taches.map((t) => (
            <LigneTache key={t.id} tache={t} d={d} montrer={montrer} />
          ))}
        </ul>
      ) : (
        <p className="px-3 py-5 text-center text-sm text-pierre-500">{vide}</p>
      )}
    </section>
  )
}

export function Chargement() {
  return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
}
