import type { ReactNode } from 'react'

// Habillage commun des pages publiques (sans compte) : Réservations
// (formulaire de demande, page client, fiches) et RH (candidature,
// intention de retour, dossier d'embauche). Pensé téléphone d'abord.

export type Langue = 'fr' | 'en'

/**
 * Erreurs par champ, fusionnées : une erreur effacée (undefined, ex. le
 * champ vient d'être corrigé) ne masque pas celle calculée par la page.
 */
export function fusionnerErreurs<K extends string>(...sources: Partial<Record<K, string | undefined>>[]): Partial<Record<K, string>> {
  const res: Partial<Record<K, string>> = {}
  for (const s of sources) for (const [k, v] of Object.entries(s) as [K, string | undefined][]) if (v) res[k] = v
  return res
}

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
  logo = null,
  nomLogo = null,
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
  libelle: ReactNode
  aide?: ReactNode
  requis?: boolean
  erreur?: string
  id?: string
  children: ReactNode
}) {
  return (
    <div id={id} className="scroll-mt-6">
      {libelle && (
        <p className="mb-1 text-sm font-medium text-pierre-900">
          {libelle}
          {requis && <span className="text-red-600"> *</span>}
        </p>
      )}
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

/** Cases à cocher (plusieurs valeurs) ; `bloquer` grise les cases non cochées (ex. trois postes au plus). */
export function Cases({
  options,
  valeur,
  changer,
  bloquer = false,
}: {
  options: { valeur: string; libelle: ReactNode }[]
  valeur: string[]
  changer: (v: string[]) => void
  bloquer?: boolean
}) {
  return (
    <div className="grid gap-1.5">
      {options.map((o) => {
        const coche = valeur.includes(o.valeur)
        const gris = bloquer && !coche
        return (
          <label
            key={o.valeur}
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
              coche ? 'border-foret-600 bg-foret-50' : gris ? 'border-pierre-100 bg-pierre-50 text-pierre-400' : 'cursor-pointer border-pierre-200 bg-white hover:border-pierre-300'
            }`}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={coche}
              disabled={gris}
              onChange={() => changer(coche ? valeur.filter((x) => x !== o.valeur) : [...valeur, o.valeur])}
            />
            <span className="min-w-0 flex-1">{o.libelle}</span>
          </label>
        )
      })}
    </div>
  )
}

/** Champ piège : invisible pour une personne, rempli par les robots. */
export function ChampPiege({ valeur, changer }: { valeur: string; changer: (v: string) => void }) {
  return (
    <input
      type="text"
      name="site_web"
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      className="absolute -left-[9999px] h-0 w-0 opacity-0"
      value={valeur}
      onChange={(e) => changer(e.target.value)}
    />
  )
}
