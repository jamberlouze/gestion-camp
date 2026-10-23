import { useState, type ReactNode } from 'react'
import { sortirCarte } from '@/lib/sortieCarte'
import { ui } from '@/lib/ui'
import { useModifier } from './donnees'
import { menu } from './outils'
import { CATEGORIES, nomTypeSejour, SAISONS, TYPES_SEJOUR, type Categorie, type Programme, type Saison, type TypeSejour } from './types'

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

/** Puces de choix (une seule allumée, ou « tout »), comme dans le CRM et les Réservations. */
export function Puces<T extends string>({
  options,
  valeur,
  changer,
  tout = 'Tous',
  compte,
  libelle,
}: {
  options: { id: T; nom: string }[]
  valeur: T | ''
  changer: (v: T | '') => void
  tout?: string
  compte?: (id: T | '') => number
  libelle?: string
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-pierre-300 bg-white p-0.5 text-sm" role="group" aria-label={libelle}>
      {[{ id: '' as T | '', nom: tout }, ...options].map((o) => (
        <button
          key={o.id || 'tout'}
          aria-pressed={valeur === o.id}
          className={`rounded-md px-2.5 py-1 ${valeur === o.id ? 'bg-foret-100 font-medium text-foret-800' : 'text-pierre-600 hover:text-pierre-900'}`}
          onClick={() => changer(o.id)}
        >
          {o.nom}
          {compte && <span className="ml-1 tabular-nums text-pierre-400">{compte(o.id)}</span>}
        </button>
      ))}
    </div>
  )
}

const COULEURS_TYPE: Record<TypeSejour, string> = {
  camp_vacances: 'bg-emerald-50 text-emerald-800',
  camp_familial: 'bg-violet-50 text-violet-800',
  classe_nature: 'bg-sky-50 text-sky-800',
  groupe: 'bg-orange-50 text-orange-800',
}

export function PastilleTypeSejour({ type, aVerifier }: { type: TypeSejour | null; aVerifier?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className={`rounded-full px-2 py-0.5 text-xs ${type ? COULEURS_TYPE[type] : 'bg-pierre-100 text-pierre-500'}`}>{nomTypeSejour(type)}</span>
      {aVerifier && <span className="text-xs text-amber-700">à vérifier</span>}
    </span>
  )
}

/**
 * Type de séjour d'un programme : menu pour le changer et, s'il vient de Claude
 * (à vérifier), ✓ pour le confirmer tel quel. Changer ou confirmer = vérifié.
 */
/** `sortie` : liste « à vérifier » que le programme quitte une fois confirmé ; sa rangée sort d'abord. */
export function ChoixTypeSejour({ programme: p, ecriture, sortie }: { programme: Programme; ecriture: boolean; sortie?: boolean }) {
  const modifier = useModifier<Programme>('programmes')
  if (!ecriture) return <PastilleTypeSejour type={p.type_sejour} aVerifier={p.type_a_verifier} />
  return (
    <span className="inline-flex items-center gap-1">
      <select
        aria-label={`Type de séjour de ${p.nom}`}
        title={p.type_a_verifier ? 'Proposé par Claude, à vérifier' : undefined}
        // Pas `menu` : ses couleurs l'emporteraient sur celles d'« à vérifier ».
        className={`fleche-serree rounded-lg border px-2.5 py-1 text-xs ${
          p.type_a_verifier
            ? 'border-amber-400 bg-amber-50 text-amber-900'
            : `border-pierre-300 bg-white ${p.type_sejour ? 'text-pierre-800' : 'text-pierre-500'}`
        }`}
        value={p.type_sejour ?? ''}
        onChange={(e) => modifier.mutate({ id: p.id, type_sejour: (e.target.value || null) as TypeSejour | null, type_a_verifier: false })}
      >
        <option value="">Pas classé</option>
        {TYPES_SEJOUR.map((t) => (
          <option key={t.id} value={t.id}>
            {t.libelle}
          </option>
        ))}
      </select>
      {p.type_a_verifier && (
        <button
          className="rounded-md px-1.5 py-0.5 text-sm font-medium text-foret-700 ring-1 ring-foret-200 hover:bg-foret-50"
          title={p.type_sejour ? `Confirmer « ${nomTypeSejour(p.type_sejour)} »` : 'Confirmer : aucun de ces types'}
          aria-label={`Confirmer le type de ${p.nom}`}
          onClick={(e) => {
            const confirmer = () => modifier.mutate({ id: p.id, type_a_verifier: false })
            if (sortie) sortirCarte(e.currentTarget.closest('tr, li'), confirmer)
            else confirmer()
          }}
        >
          ✓
        </button>
      )}
    </span>
  )
}
