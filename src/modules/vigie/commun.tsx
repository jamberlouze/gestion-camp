import { useState, type ReactNode } from 'react'
import { ui } from '@/lib/ui'
import { menu } from './outils'
import { CATEGORIES, SAISONS, type Categorie, type Saison } from './types'

export function Chargement() {
  return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
}

export function Carte({ titre, children, action }: { titre?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className={`${ui.carte} p-4`}>
      {(titre || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {titre && <h2 className="font-semibold">{titre}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

const COULEURS_SAISON: Record<Saison, string> = {
  hiver: 'bg-sky-50 text-sky-800',
  printemps: 'bg-lime-50 text-lime-800',
  ete: 'bg-amber-50 text-amber-800',
  automne: 'bg-orange-50 text-orange-800',
}

export function Saisons({ saisons }: { saisons: Saison[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {SAISONS.filter((s) => saisons.includes(s.id)).map((s) => (
        <span key={s.id} className={`rounded-full px-1.5 py-0.5 text-xs ${COULEURS_SAISON[s.id]}`}>
          {s.libelle}
        </span>
      ))}
    </span>
  )
}

const COULEURS_CATEGORIE: Record<Categorie, string> = {
  leader: 'bg-amber-100 text-amber-900',
  reference: 'bg-indigo-50 text-indigo-800',
  non_comparable: 'bg-pierre-100 text-pierre-500',
}

export function PastilleCategorie({ categorie }: { categorie: Categorie }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${COULEURS_CATEGORIE[categorie]}`}>
      {categorie === 'leader' ? '★ Leader' : CATEGORIES[categorie]}
    </span>
  )
}

export function ChoixCategorie({
  valeur,
  changer,
  desactive,
}: {
  valeur: Categorie
  changer: (c: Categorie) => void
  desactive?: boolean
}) {
  return (
    <select
      aria-label="Catégorie"
      className={`${menu} fleche-serree py-1 text-xs ${valeur === 'leader' ? 'font-medium text-amber-900' : valeur === 'non_comparable' ? 'text-pierre-500' : ''}`}
      value={valeur}
      disabled={desactive}
      onChange={(e) => changer(e.target.value as Categorie)}
    >
      {Object.entries(CATEGORIES).map(([id, libelle]) => (
        <option key={id} value={id}>
          {libelle}
        </option>
      ))}
    </select>
  )
}

export function LienExterne({ href, children }: { href: string | null | undefined; children?: ReactNode }) {
  if (!href) return null
  let texte = children
  if (!texte) {
    try {
      texte = new URL(href).hostname.replace(/^www\./, '')
    } catch {
      texte = href
    }
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-foret-700 underline decoration-foret-700/30 hover:decoration-foret-700">
      {texte}
    </a>
  )
}

/** Zone de texte enregistrée à la sortie, seulement si elle a changé (vide = null). */
export function TexteLibre({
  valeur,
  enregistrer,
  desactive,
  placeholder,
}: {
  valeur: string | null
  enregistrer: (v: string | null) => void
  desactive: boolean
  placeholder?: string
}) {
  const [texte, setTexte] = useState(valeur ?? '')
  const [base, setBase] = useState(valeur)
  if (valeur !== base) {
    setBase(valeur)
    setTexte(valeur ?? '')
  }
  return (
    <textarea
      className={`${ui.champ} min-h-20`}
      value={texte}
      placeholder={placeholder}
      disabled={desactive}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={() => texte.trim() !== (valeur ?? '') && enregistrer(texte.trim() || null)}
    />
  )
}
