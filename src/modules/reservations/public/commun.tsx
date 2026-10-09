import type { ReactNode } from 'react'
import type { Langue } from '../demande'

// Habillage commun des pages publiques (formulaire, page client, fiches).

export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-pierre-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-5">{children}</div>
    </div>
  )
}

export function Entete({
  surtitre,
  titre,
  logo = '/reservations/logo-gbpa.png',
  nomLogo = 'Base de plein air Mont-Tremblant',
  langue,
  changerLangue,
}: {
  surtitre?: string
  titre: string
  logo?: string | null
  nomLogo?: string | null
  langue?: Langue
  changerLangue?: (l: Langue) => void
}) {
  return (
    <header className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        {logo ? <img src={logo} alt={nomLogo ?? ''} className="h-9 w-auto sm:h-10" /> : <span />}
        {langue && changerLangue && <ChoixLangue langue={langue} changer={changerLangue} />}
      </div>
      <div>
        {surtitre && <p className="text-sm text-pierre-500">{surtitre}</p>}
        <h1 className="text-2xl font-semibold text-pierre-900">{titre}</h1>
      </div>
    </header>
  )
}

export function ChoixLangue({ langue, changer }: { langue: Langue; changer: (l: Langue) => void }) {
  return (
    <div className="flex rounded-lg border border-pierre-200 bg-white p-0.5 text-xs font-medium" role="group" aria-label="Langue / Language">
      {(['fr', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={langue === l}
          className={`rounded-md px-2 py-1 ${langue === l ? 'bg-foret-700 text-white' : 'text-pierre-600 hover:text-pierre-900'}`}
          onClick={() => changer(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

export function Pied({ compagnie }: { compagnie?: { nom: string | null; courriel: string | null; telephone: string | null } | null }) {
  const nom = compagnie?.nom ?? 'Gestion Base de Plein Air Mont-Tremblant +'
  const courriel = compagnie?.courriel ?? 'inscriptions@camptremblant.com'
  return (
    <footer className="pb-4 text-center text-xs text-pierre-500">
      {nom} · <a className="underline" href={`mailto:${courriel}`}>{courriel}</a>
      {compagnie?.telephone && ` · ${compagnie.telephone}`}
    </footer>
  )
}

// ------------------------------------------------------------------
// Questions de formulaire
// ------------------------------------------------------------------

export function Question({
  libelle,
  aide,
  requis,
  erreur,
  id,
  children,
}: {
  libelle: string
  aide?: string
  requis?: boolean
  erreur?: string
  id?: string
  children: ReactNode
}) {
  return (
    <div id={id} className="scroll-mt-6">
      <p className="mb-1 text-sm font-medium text-pierre-900">
        {libelle}
        {requis && <span className="text-red-600"> *</span>}
      </p>
      {aide && <p className="mb-1.5 text-xs text-pierre-500">{aide}</p>}
      {children}
      {erreur && <p className="mt-1 text-xs text-red-700">{erreur}</p>}
    </div>
  )
}

export function Choix<T extends string>({
  nom,
  options,
  valeur,
  changer,
}: {
  nom: string
  options: { valeur: T; libelle: string }[]
  valeur: T | ''
  changer: (v: T) => void
}) {
  return (
    <div className="grid gap-1.5">
      {options.map((o) => (
        <label
          key={o.valeur}
          className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
            valeur === o.valeur ? 'border-foret-600 bg-foret-50' : 'border-pierre-200 bg-white hover:border-pierre-300'
          }`}
        >
          <input type="radio" className="mt-0.5" name={nom} checked={valeur === o.valeur} onChange={() => changer(o.valeur)} />
          <span>{o.libelle}</span>
        </label>
      ))}
    </div>
  )
}
