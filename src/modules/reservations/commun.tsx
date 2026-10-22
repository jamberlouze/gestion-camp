import { useState, type ReactNode } from 'react'
import { ui } from '@/lib/ui'
import { nomEtape } from './format'
import { FERMETURES, type Reservation } from './types'

const STYLE_ETAPE: Record<Reservation['etape'], string> = {
  nouvelle: 'border-sky-300 bg-sky-50 text-sky-800',
  contact: 'border-sky-300 bg-sky-50 text-sky-800',
  estime_envoye: 'border-amber-300 bg-amber-50 text-amber-800',
  estime_accepte: 'border-amber-300 bg-amber-50 text-amber-800',
  contrat_envoye: 'border-teal-300 bg-teal-50 text-teal-800',
  confirmee: 'border-foret-300 bg-foret-50 text-foret-800',
  pre_arrivee: 'border-foret-300 bg-foret-50 text-foret-800',
  terminee: 'border-pierre-300 bg-pierre-50 text-pierre-700',
  facture_finale: 'border-pierre-300 bg-pierre-50 text-pierre-700',
  soldee: 'border-pierre-300 bg-pierre-50 text-pierre-700',
}

/** Étape, ou la fermeture si la réservation est hors parcours. */
export function PuceEtape({ r }: { r: Pick<Reservation, 'etape' | 'fermeture'> }) {
  const [texte, style] = r.fermeture
    ? [
        FERMETURES[r.fermeture],
        r.fermeture === 'closed_lost' ? 'border-red-200 bg-red-50 text-red-700' : 'border-pierre-300 bg-pierre-100 text-pierre-600',
      ]
    : [nomEtape(r.etape), STYLE_ETAPE[r.etape]]
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${style}`}>{texte}</span>
}

export function Section({ titre, action, children, className = '' }: { titre: string; action?: ReactNode; children: ReactNode; className?: string }) {
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


/** Texte de la réservation sur plusieurs lignes, enregistré en quittant le champ. */
export function ZoneTexte({
  libelle,
  valeur,
  enregistrer,
  aide,
  disabled,
}: {
  libelle: string
  valeur: string | null
  enregistrer: (v: string | null) => void
  aide?: string
  disabled?: boolean
}) {
  const [texte, setTexte] = useState(valeur ?? '')
  const [base, setBase] = useState(valeur ?? '')
  if ((valeur ?? '') !== base) {
    setBase(valeur ?? '')
    setTexte(valeur ?? '')
  }
  return (
    <label className="block min-w-0">
      <span className={ui.etiquette}>{libelle}</span>
      <textarea
        rows={3}
        className={ui.champ}
        disabled={disabled}
        value={texte}
        placeholder={aide}
        onChange={(e) => setTexte(e.target.value)}
        onBlur={() => texte.trim() !== (valeur ?? '') && enregistrer(texte.trim() || null)}
      />
    </label>
  )
}

/** Puces de choix (une seule allumée). */
export function Puces<T extends string>({
  options,
  valeur,
  changer,
  compte,
}: {
  options: { id: T; nom: string }[]
  valeur: T
  changer: (v: T) => void
  compte?: (id: T) => number
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-pierre-300 bg-white p-0.5 text-sm" role="group">
      {options.map((o) => (
        <button
          key={o.id}
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
