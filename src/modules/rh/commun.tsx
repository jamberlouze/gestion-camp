import { useState, type ReactNode } from 'react'
import { PuceCompagnie } from '@/lib/PuceCompagnie'
import { ui } from '@/lib/ui'
import { useRh } from './contexte'
import { postesParCompagnie } from './outils'
import {
  PRE_DECISIONS,
  statutDe,
  statutEmbaucheDe,
  type Poste,
  type PreDecision,
  type Statut,
  type StatutEmbauche,
} from './types'

export function PuceStatut({ statut }: { statut: Statut }) {
  const s = statutDe(statut)
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${s.couleur}`}>{s.nom}</span>
}

export function PuceStatutEmbauche({ statut }: { statut: StatutEmbauche }) {
  const s = statutEmbaucheDe(statut)
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${s.couleur}`}>{s.nom}</span>
}

export function PucePreDecision({ valeur }: { valeur: PreDecision | null }) {
  const p = PRE_DECISIONS.find((x) => x.id === valeur)
  if (!p) return null
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${p.couleur}`}>{p.nom}</span>
}

export const PuceAncien = () => (
  <span title="A déjà travaillé avec nous" className="inline-flex rounded-full bg-foret-50 px-1.5 py-0.5 text-[11px] font-medium text-foret-700 ring-1 ring-foret-200">
    Ancien
  </span>
)

export function Section({ titre, action, children, className = '' }: { titre: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${ui.carte} p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-pierre-900">{titre}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Zone de texte enregistrée à la sortie, seulement si elle a changé. */
export function ZoneTexte({
  valeur,
  enregistrer,
  rangees = 3,
  ...props
}: {
  valeur: string
  enregistrer: (v: string) => void
  rangees?: number
  disabled?: boolean
  placeholder?: string
  'aria-label'?: string
}) {
  const [texte, setTexte] = useState(valeur)
  const [base, setBase] = useState(valeur)
  if (valeur !== base) {
    setBase(valeur)
    setTexte(valeur)
  }
  return (
    <textarea
      {...props}
      rows={rangees}
      className={ui.champ}
      value={texte}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={() => texte.trim() !== valeur && enregistrer(texte.trim())}
    />
  )
}

/** Petit champ étiqueté (fiches). */
export function Champ({ etiquette, children, className = '' }: { etiquette: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className={ui.etiquette}>{etiquette}</span>
      {children}
    </label>
  )
}

/** Nom d'un poste avec l'abréviation de sa compagnie. */
export function NomPoste({ poste, court = true }: { poste: Poste | undefined; court?: boolean }) {
  const { compagnieParId } = useRh()
  if (!poste) return <span className="text-pierre-400">Poste à préciser</span>
  const c = compagnieParId.get(poste.entreprise_id)
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span>{poste.nom}</span>
      {c && <PuceCompagnie compagnie={c} court={court} />}
    </span>
  )
}

/** Choix de plusieurs saisons en pastilles. */
export function ChoixSaisons({ valeur, changer, disabled }: { valeur: string[]; changer: (ids: string[]) => void; disabled?: boolean }) {
  const { saisons } = useRh()
  const visibles = saisons.filter((s) => s.ouverte || valeur.includes(s.id))
  const autres = saisons.filter((s) => !visibles.includes(s))
  const [toutes, setToutes] = useState(false)
  const bascule = (id: string) => changer(valeur.includes(id) ? valeur.filter((x) => x !== id) : [...valeur, id])
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(toutes ? saisons : visibles).map((s) => (
        <button
          key={s.id}
          type="button"
          disabled={disabled}
          onClick={() => bascule(s.id)}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
            valeur.includes(s.id) ? 'border-foret-600 bg-foret-50 text-foret-800' : 'border-pierre-200 text-pierre-600 hover:bg-pierre-50'
          }`}
        >
          {s.nom}
        </button>
      ))}
      {!toutes && autres.length > 0 && !disabled && (
        <button type="button" className="text-xs text-pierre-500 underline" onClick={() => setToutes(true)}>
          Autres saisons…
        </button>
      )}
    </div>
  )
}

/** Choix de plusieurs postes (cases groupées par compagnie). */
export function ChoixPostes({ valeur, changer, disabled }: { valeur: string[]; changer: (ids: string[]) => void; disabled?: boolean }) {
  const { postes, compagnies, compagnieParId } = useRh()
  const liste = postesParCompagnie(postes, compagnies, valeur)
  const groupes = new Map<string, Poste[]>()
  for (const p of liste) groupes.set(p.entreprise_id, [...(groupes.get(p.entreprise_id) ?? []), p])
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[...groupes].map(([cid, ps]) => (
        <div key={cid}>
          <p className="mb-1 text-xs font-medium text-pierre-500">{compagnieParId.get(cid)?.nom}</p>
          {ps.map((p) => (
            <label key={p.id} className="flex items-center gap-2 py-0.5 text-sm">
              <input
                type="checkbox"
                disabled={disabled}
                checked={valeur.includes(p.id)}
                onChange={() => changer(valeur.includes(p.id) ? valeur.filter((x) => x !== p.id) : [...valeur, p.id])}
              />
              <span className={p.actif ? '' : 'text-pierre-400 line-through'}>{p.nom}</span>
            </label>
          ))}
        </div>
      ))}
    </div>
  )
}

/** Menu d'un poste (une seule valeur), groupé par compagnie. */
export function MenuPoste({
  valeur,
  changer,
  compagnie,
  className = ui.champ,
  disabled,
}: {
  valeur: string | null
  changer: (id: string | null) => void
  /** Seulement les postes de cette compagnie */
  compagnie?: string | null
  className?: string
  disabled?: boolean
}) {
  const { postes, compagnies, compagnieParId } = useRh()
  const liste = postesParCompagnie(postes, compagnies, valeur ? [valeur] : []).filter((p) => !compagnie || p.entreprise_id === compagnie)
  const groupes = new Map<string, Poste[]>()
  for (const p of liste) groupes.set(p.entreprise_id, [...(groupes.get(p.entreprise_id) ?? []), p])
  return (
    <select className={className} disabled={disabled} value={valeur ?? ''} onChange={(e) => changer(e.target.value || null)}>
      <option value="">—</option>
      {[...groupes].map(([cid, ps]) => (
        <optgroup key={cid} label={compagnieParId.get(cid)?.nom ?? ''}>
          {ps.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

/** Menu des compagnies actives du référentiel. */
export function MenuCompagnie({ valeur, changer, className = ui.champ, disabled, vide = '—' }: { valeur: string | null; changer: (id: string | null) => void; className?: string; disabled?: boolean; vide?: string }) {
  const { compagnies } = useRh()
  return (
    <select className={className} disabled={disabled} value={valeur ?? ''} onChange={(e) => changer(e.target.value || null)}>
      <option value="">{vide}</option>
      {compagnies
        .filter((c) => c.actif || c.id === valeur)
        .map((c) => (
          <option key={c.id} value={c.id}>
            {c.nom}
          </option>
        ))}
    </select>
  )
}

/** Menu des saisons (une seule valeur), de la plus récente à la plus ancienne. */
export function MenuSaison({ valeur, changer, className = ui.champ, disabled, vide }: { valeur: string | null; changer: (id: string | null) => void; className?: string; disabled?: boolean; vide?: string }) {
  const { saisons } = useRh()
  return (
    <select className={className} disabled={disabled} value={valeur ?? ''} onChange={(e) => changer(e.target.value || null)}>
      {vide !== undefined && <option value="">{vide}</option>}
      {[...saisons].reverse().map((s) => (
        <option key={s.id} value={s.id}>
          {s.nom}
        </option>
      ))}
    </select>
  )
}
