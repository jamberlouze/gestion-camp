/** Teinte d'une étiquette à partir d'une couleur (fond pâle, texte foncé lisible, même pour le jaune). */
export function teinte(couleur: string | null | undefined) {
  const c = couleur || 'var(--color-pierre-500)'
  return { background: `color-mix(in srgb, ${c} 16%, white)`, color: `color-mix(in srgb, ${c} 55%, black)` }
}

/**
 * Étiquette d'une compagnie (core.entreprises), teintée de sa couleur, la
 * même dans tous les modules. `court` : l'abréviation si elle existe (nom
 * complet au survol).
 */
export function PuceCompagnie({
  compagnie,
  court = false,
  className = '',
}: {
  compagnie: { nom: string; couleur: string | null; abreviation?: string | null }
  court?: boolean
  className?: string
}) {
  const texte = court && compagnie.abreviation ? compagnie.abreviation : compagnie.nom
  return (
    <span
      title={texte !== compagnie.nom ? compagnie.nom : undefined}
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
      style={teinte(compagnie.couleur)}
    >
      {texte}
    </span>
  )
}
