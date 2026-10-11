import { useState } from 'react'

/**
 * Nombre à compter : − [nombre] +, gros boutons pour le pouce sur téléphone.
 * `valeur` null = pas encore compté (affiché « — ») : − donne 0, + donne 1.
 */
export function Compteur({
  valeur,
  changer,
  libelle,
  grand,
  desactive,
}: {
  valeur: number | null
  changer: (n: number) => void
  libelle: string
  grand?: boolean
  desactive?: boolean
}) {
  const [texte, setTexte] = useState(valeur == null ? '' : String(valeur))
  const [base, setBase] = useState(valeur)
  // Une valeur venue d'ailleurs (bouton, autre appareil) remplace le texte.
  if (valeur !== base) {
    setBase(valeur)
    setTexte(valeur == null ? '' : String(valeur))
  }
  const bouton = `flex shrink-0 items-center justify-center rounded-lg border border-pierre-300 bg-white font-semibold text-pierre-700 hover:bg-pierre-50 active:bg-pierre-100 disabled:opacity-40 ${
    grand ? 'size-12 text-2xl' : 'size-8 text-lg'
  }`
  // Chaque chiffre tapé compte tout de suite (fermer la fenêtre sans quitter
  // le champ ne perd rien) ; un champ laissé vide reprend sa valeur.
  const taper = (brut: string) => {
    const propre = brut.replace(/[^\d]/g, '')
    setTexte(propre)
    if (propre !== '' && Number(propre) !== valeur) changer(Number(propre))
  }
  const valider = () => setTexte(valeur == null ? '' : String(valeur))
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={libelle}>
      <button type="button" className={bouton} disabled={desactive || valeur === 0} aria-label={`${libelle} : un de moins`} onClick={() => changer(Math.max(0, (valeur ?? 1) - 1))}>
        −
      </button>
      <input
        aria-label={libelle}
        inputMode="numeric"
        disabled={desactive}
        className={`min-w-0 rounded-lg border border-pierre-300 bg-white text-center tabular-nums focus:border-foret-600 focus:outline-none focus:ring-2 focus:ring-foret-600/20 disabled:bg-pierre-50 ${
          grand ? 'h-12 w-20 text-xl font-semibold' : 'h-8 w-14 text-sm'
        }`}
        value={texte}
        placeholder="—"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => taper(e.target.value)}
        onBlur={valider}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <button type="button" className={bouton} disabled={desactive} aria-label={`${libelle} : un de plus`} onClick={() => changer((valeur ?? 0) + 1)}>
        +
      </button>
    </div>
  )
}
