import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ui } from '@/lib/ui'
import { useAjouterOrganisation } from '@/modules/crm/donnees'
import type { Organisation } from '@/modules/crm/types'
import { useDonnees } from './contexte'
import { normaliser } from './format'

/**
 * Organisation du CRM : recherche par nom, ou création sur place. Rien
 * n'est relié tout seul (décision de Maxime) : on choisit dans la liste.
 */
export function ChoixOrganisation({
  valeur,
  changer,
  disabled,
  autoFocus,
}: {
  valeur: string | null
  changer: (id: string | null, org?: Organisation) => void
  disabled?: boolean
  autoFocus?: boolean
}) {
  const { organisations, orgParId, moi } = useDonnees()
  const ajouter = useAjouterOrganisation()
  const [texte, setTexte] = useState('')
  const [ouvert, setOuvert] = useState(false)
  const choisie = valeur ? orgParId.get(valeur) : undefined

  const resultats = useMemo(() => {
    const q = normaliser(texte)
    if (!q) return []
    return organisations
      .filter((o) => normaliser(o.nom).includes(q) || (o.ville && normaliser(o.ville).includes(q)))
      .slice(0, 8)
  }, [organisations, texte])

  if (choisie) {
    return (
      <div className="flex items-center gap-2">
        <Link to={`/crm/o/${choisie.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-foret-800 hover:underline">
          {choisie.nom}
          {choisie.ville && <span className="font-normal text-pierre-500"> · {choisie.ville}</span>}
        </Link>
        {!disabled && (
          <button type="button" className="text-xs text-pierre-500 underline hover:text-pierre-800" onClick={() => changer(null)}>
            Changer
          </button>
        )}
      </div>
    )
  }

  const creer = () => {
    const nom = texte.trim()
    if (!nom) return
    const org = {
      id: crypto.randomUUID(),
      nom,
      genre: 'autre' as const,
      ville: null,
      adresse: null,
      province: null,
      code_postal: null,
      telephone: null,
      site_web: null,
      notes: null,
      conseiller_id: moi.id,
      etape: null,
      prioritaire: false,
      cycle_ans: 1,
      airtable_client_id: null,
      copper_id: null,
      statut_depart: null,
      statut_depart_le: null,
      created_at: new Date().toISOString(),
    }
    ajouter.mutate(org, { onSuccess: () => changer(org.id, org) })
    setTexte('')
    setOuvert(false)
  }

  return (
    <div className="relative">
      <input
        className={ui.champ}
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder="Chercher une organisation du CRM…"
        value={texte}
        onChange={(e) => {
          setTexte(e.target.value)
          setOuvert(true)
        }}
        onFocus={() => setOuvert(true)}
        onBlur={() => setTimeout(() => setOuvert(false), 150)}
      />
      {ouvert && texte.trim() && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-pierre-200 bg-white py-1 text-sm shadow-lg">
          {resultats.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left hover:bg-foret-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  changer(o.id, o)
                  setTexte('')
                  setOuvert(false)
                }}
              >
                {o.nom}
                {o.ville && <span className="text-pierre-500"> · {o.ville}</span>}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="block w-full border-t border-pierre-100 px-3 py-1.5 text-left text-foret-800 hover:bg-foret-50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={creer}
            >
              + Créer « {texte.trim()} » dans le CRM
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
