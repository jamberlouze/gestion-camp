import { useState, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { IconeCorbeille } from '@/lib/icones'
import { PuceCompagnie } from '@/lib/PuceCompagnie'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { useCompagnies, useEnregistrer, useNotes, useProfils, useResponsables, useSupprimer } from './donnees'
import { moment, nomPersonne, STATUTS, TYPES } from './outils'
import type { Note, Statut, Suivi, TypeSubvention } from './types'

export const menu = 'rounded-lg border border-pierre-300 bg-white px-2.5 py-1.5 text-sm text-pierre-800'

export function Pastille({ children, classe = 'bg-pierre-100 text-pierre-700' }: { children: ReactNode; classe?: string }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${classe}`}>{children}</span>
}

export const PastilleStatut = ({ statut }: { statut: Statut }) => (
  <Pastille classe={STATUTS[statut].classe}>{STATUTS[statut].libelle}</Pastille>
)

export const PastilleType = ({ type }: { type: TypeSubvention }) => (
  <Pastille classe={type === 'salarial' ? 'bg-foret-700 text-white' : undefined}>{TYPES[type]}</Pastille>
)

/** Étiquettes des compagnies d'une carte, dans l'ordre des Réglages. */
export function PucesCompagnies({ ids, court = false }: { ids: string[]; court?: boolean }) {
  const { de, trier } = useCompagnies()
  if (!ids.length) return <Pastille>—</Pastille>
  return (
    <>
      {trier(ids).map((id) => (
        <PuceCompagnie key={id} compagnie={de(id)} court={court} />
      ))}
    </>
  )
}

/**
 * Cases à cocher des compagnies (entreprises de recherche), en pastilles de
 * leur couleur ; `verrouillees` : cochées et pas décochables.
 */
export function ChoixCompagnies({
  choisies,
  changer,
  verrouillees = [],
  ids,
}: {
  choisies: string[]
  changer: (ids: string[]) => void
  verrouillees?: string[]
  /** Compagnies offertes (toutes par défaut), dans cet ordre. */
  ids: string[]
}) {
  const { de } = useCompagnies()
  return (
    <div className="flex flex-wrap gap-1.5">
      {ids.map((id) => {
        const coche = choisies.includes(id)
        const fixe = verrouillees.includes(id)
        const c = de(id)
        return (
          <label
            key={id}
            title={fixe ? 'A une ligne de suivi : retirez-la d’abord.' : undefined}
            className={`inline-flex select-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm ${
              coche ? 'border-foret-600 bg-foret-50 font-medium text-pierre-900' : 'border-pierre-300 bg-white text-pierre-600 hover:border-pierre-400'
            } ${fixe ? 'cursor-default' : 'cursor-pointer'}`}
          >
            {/* Verrouillée : reste cochée (pas « disabled », qui la grise comme si elle ne l'était pas). */}
            <input
              type="checkbox"
              className="accent-foret-700"
              checked={coche}
              aria-disabled={fixe || undefined}
              onChange={() => !fixe && changer(coche ? choisies.filter((x) => x !== id) : [...choisies, id])}
            />
            <span className="size-2 rounded-full" style={{ background: c.couleur ?? 'var(--color-pierre-400)' }} aria-hidden />
            {c.nom}
          </label>
        )
      })}
    </div>
  )
}

/**
 * Responsable d'une demande (ligne de suivi), enregistré dès qu'il change.
 * Les personnes qui écrivent dans Subventions, plus la responsable actuelle
 * si elle n'y a plus accès.
 */
export function ChoixResponsable({ l, className = 'text-sm' }: { l: Pick<Suivi, 'id' | 'responsible_id'>; className?: string }) {
  const responsables = useResponsables().data ?? []
  const enregistrer = useEnregistrer<Suivi>('grant_applications')
  const choix = responsables.filter((r) => r.choisissable || r.id === l.responsible_id)
  return (
    <select
      aria-label="Responsable"
      className={`rounded-lg border border-pierre-300 bg-white px-2 py-1 ${l.responsible_id ? 'text-pierre-800' : 'text-pierre-400'} ${className}`}
      value={l.responsible_id ?? ''}
      onChange={(e) => enregistrer.mutate({ id: l.id, responsible_id: e.target.value || null })}
    >
      <option value="">À assigner</option>
      {choix.map((r) => (
        <option key={r.id} value={r.id}>
          {r.nom}
          {r.choisissable ? '' : ' (plus accès)'}
        </option>
      ))}
    </select>
  )
}

/** Lien vers la page officielle, toujours dans un nouvel onglet. */
export function LienOfficiel({ url, children = 'Page officielle' }: { url: string | null; children?: ReactNode }) {
  if (!url) return <span className="text-sm text-pierre-400">Pas de lien</span>
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-foret-700 underline hover:text-foret-800">
      {children} ↗
    </a>
  )
}

/** Zone de texte enregistrée à la sortie, seulement si la valeur a changé. */
export function ZoneTexte({
  valeur,
  enregistrer,
  ...props
}: { valeur: string; enregistrer: (v: string) => void } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value'>) {
  const [texte, setTexte] = useState(valeur)
  const [base, setBase] = useState(valeur)
  if (valeur !== base) {
    setBase(valeur)
    setTexte(valeur)
  }
  return (
    <textarea
      {...props}
      value={texte}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={() => {
        if (texte.trim() !== valeur.trim()) enregistrer(texte.trim())
      }}
    />
  )
}

/** Montant en dollars (vide = inconnu), enregistré à la sortie. */
export function ChampMontant({
  valeur,
  enregistrer,
  ...props
}: { valeur: number | null; enregistrer: (v: number | null) => void } & { 'aria-label'?: string; placeholder?: string; className?: string }) {
  return (
    <ChampTexte
      type="number"
      min={0}
      step="0.01"
      inputMode="decimal"
      {...props}
      valeur={valeur == null ? '' : String(valeur)}
      enregistrer={(v) => {
        const n = v === '' ? null : Number(v)
        enregistrer(n != null && Number.isFinite(n) && n >= 0 ? n : null)
      }}
    />
  )
}

/** Date (vide = aucune), enregistrée dès qu'elle change. */
export function ChampDate({
  valeur,
  enregistrer,
  className = ui.champ,
  ...props
}: { valeur: string | null; enregistrer: (v: string | null) => void; className?: string; 'aria-label'?: string }) {
  return (
    <input
      type="date"
      className={className}
      {...props}
      value={valeur ?? ''}
      onChange={(e) => e.target.value !== (valeur ?? '') && enregistrer(e.target.value || null)}
    />
  )
}

export function Section({ titre, action, children }: { titre: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={`${ui.carte} p-4`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{titre}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/**
 * Notes internes d'une subvention : visibles par tous les utilisateurs du
 * module ; chacun modifie ou supprime seulement les siennes.
 */
/** Notes d'une subvention en lecture seule (carte en attente, fenêtre « Mettre en attente »). */
export function NotesLues({ notes }: { notes: Note[] }) {
  const profils = useProfils().data
  return (
    <ul className="space-y-1.5">
      {notes.map((n) => (
        <li key={n.id} className="text-sm">
          <span className="text-xs text-pierre-500">
            <b className="font-medium text-pierre-700">{nomPersonne(profils, n.author_id)}</b> · {moment(n.created_at)}
          </span>
          <p className="whitespace-pre-wrap">{n.body}</p>
        </li>
      ))}
    </ul>
  )
}

export function FilNotes({ grantId }: { grantId: string }) {
  const { session } = useAuth()
  const moi = session?.user.id ?? null
  const notes = (useNotes().data ?? []).filter((n) => n.grant_id === grantId)
  const profils = useProfils().data
  const enregistrer = useEnregistrer<Note>('grant_notes')
  const supprimer = useSupprimer('grant_notes')
  const [texte, setTexte] = useState('')

  const ajouter = async () => {
    const body = texte.trim()
    if (!body) return
    try {
      await enregistrer.mutateAsync({ grant_id: grantId, body })
      setTexte('')
    } catch {
      /* erreur dans le bandeau du module ; le texte reste dans le champ */
    }
  }

  return (
    <div className="space-y-2">
      {notes.length === 0 && <p className="text-sm text-pierre-500">Aucune note pour l’instant.</p>}
      <ul className="space-y-2">
        {notes.map((n) => (
          <li key={n.id} className="rounded-lg bg-pierre-50 px-3 py-2">
            <div className="flex items-center justify-between gap-2 text-xs text-pierre-500">
              <span>
                <b className="font-medium text-pierre-700">{nomPersonne(profils, n.author_id)}</b> · {moment(n.created_at)}
              </span>
              {n.author_id === moi && (
                <button
                  className="text-pierre-400 hover:text-red-700"
                  aria-label="Supprimer la note"
                  onClick={async () => {
                    if (await confirmer({ titre: 'Supprimer cette note ?' })) supprimer.mutate(n.id)
                  }}
                >
                  <IconeCorbeille />
                </button>
              )}
            </div>
            {n.author_id === moi ? (
              <ZoneTexte
                className="mt-1 w-full resize-y bg-transparent text-sm focus:outline-none"
                rows={Math.min(6, n.body.split('\n').length)}
                valeur={n.body}
                enregistrer={(body) => body && enregistrer.mutate({ id: n.id, body })}
              />
            ) : (
              <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>
            )}
          </li>
        ))}
      </ul>
      <div className="flex items-end gap-2">
        <textarea
          className={`${ui.champ} min-h-10`}
          rows={2}
          placeholder="Ajouter une note ou poser une question à un collègue…"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ajouter()
          }}
        />
        <button className={ui.boutonSecondaire} disabled={!texte.trim() || enregistrer.isPending} onClick={ajouter}>
          Ajouter
        </button>
      </div>
    </div>
  )
}
