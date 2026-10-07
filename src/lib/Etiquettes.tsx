// Étiquettes (Corvée, Woofing…) : liste de Mastertimeline, posée aussi sur
// les tâches de Travaux. Même apparence partout : teintées de leur couleur.

export interface EtiquetteAffichee {
  id: string
  nom: string
  couleur: string | null
}

const teinte = (couleur: string | null) => {
  const c = couleur ?? 'var(--color-pierre-500)'
  return { borderColor: c, background: `color-mix(in srgb, ${c} 14%, white)`, color: `color-mix(in srgb, ${c} 70%, black)` }
}

/** Étiquettes posées (ids), dans l'ordre de la liste ; un id disparu est ignoré. */
export function PucesEtiquettes({ ids, liste }: { ids: string[] | undefined; liste: EtiquetteAffichee[] }) {
  if (!ids?.length) return null
  return liste
    .filter((e) => ids.includes(e.id))
    .map((e) => {
      const { background, color } = teinte(e.couleur)
      return (
        <span key={e.id} className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs" style={{ background, color }}>
          {e.nom}
        </span>
      )
    })
}

/**
 * Sélecteur d'étiquettes : une puce par étiquette, allumée ou non.
 * Sert à poser les étiquettes d'une tâche comme à filtrer une liste.
 */
export function ChoixEtiquettes({
  liste,
  choisies,
  changer,
  desactive,
  petit,
  libelle = 'Étiquettes',
}: {
  liste: EtiquetteAffichee[]
  choisies: string[]
  changer: (ids: string[]) => void
  desactive?: boolean
  /** Format des barres de filtres. */
  petit?: boolean
  libelle?: string
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={libelle}>
      {liste.map((e) => {
        const choisie = choisies.includes(e.id)
        return (
          <button
            key={e.id}
            type="button"
            disabled={desactive}
            aria-pressed={choisie}
            className={`rounded-full border text-xs disabled:cursor-default ${petit ? 'px-2.5 py-1.5' : 'px-3 py-1'} ${
              choisie ? 'font-medium' : 'border-pierre-300 bg-white text-pierre-600 hover:border-pierre-400'
            }`}
            style={choisie ? teinte(e.couleur) : undefined}
            onClick={() => changer(choisie ? choisies.filter((x) => x !== e.id) : [...choisies, e.id])}
          >
            {choisie ? '✓ ' : ''}
            {e.nom}
          </button>
        )
      })}
    </div>
  )
}
