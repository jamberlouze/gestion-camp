import { useState, type InputHTMLAttributes } from 'react'

/** Champ enregistré à la sortie (ou Entrée), seulement si la valeur a changé. */
export function ChampTexte({
  valeur,
  enregistrer,
  obligatoire,
  ...props
}: {
  valeur: string
  enregistrer: (v: string) => void
  /** Un champ vidé reprend sa valeur au lieu d'être enregistré vide. */
  obligatoire?: boolean
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value'>) {
  const [texte, setTexte] = useState(valeur)
  const [base, setBase] = useState(valeur)
  if (valeur !== base) {
    setBase(valeur)
    setTexte(valeur)
  }
  return (
    <input
      {...props}
      value={texte}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={() => {
        const propre = texte.trim()
        if (obligatoire && !propre) setTexte(valeur)
        else if (propre !== valeur) enregistrer(propre)
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}
