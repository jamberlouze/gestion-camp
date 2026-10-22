import { useState } from 'react'
import { useSemaine } from './contexte'
import { activitesDeCategorie } from './logique'
import { CATEGORIES, META_CATEGORIE, type Categorie } from './types'

/** Pastille de la catégorie d'un horaire (liste des semaines et modèles). */
export function PuceCategorie({ categorie }: { categorie: Categorie }) {
  const m = META_CATEGORIE[categorie]
  if (!m) return null
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs" style={{ background: m.clair, color: m.couleur }}>
      <span aria-hidden>{m.icone}</span>
      {m.libelle}
    </span>
  )
}

const CLE_OUVERT = 'horaire-activites-ouvert'
const lireOuvert = () => {
  try {
    return localStorage.getItem(CLE_OUVERT) === '1'
  } catch {
    return false
  }
}

/**
 * Catégorie de l'horaire (saison) et activités qu'elle propose dans les
 * cases. Un clic sur une activité la grise pour cet horaire seulement : elle
 * n'est plus proposée (une case peut toujours la contenir, tapée à la main).
 */
export function ActivitesProposees() {
  const { etat, horaire, reglages, modifier, ecriture } = useSemaine()
  const [ouvert, setOuvert] = useState(lireOuvert)
  const liste = activitesDeCategorie(reglages, etat)
  const retirees = new Set(etat.activitesRetirees ?? [])
  const nbRetirees = liste.filter((a) => retirees.has(a.name)).length
  const meta = etat.categorie ? META_CATEGORIE[etat.categorie] : null

  function basculerOuvert() {
    setOuvert(!ouvert)
    try {
      localStorage.setItem(CLE_OUVERT, ouvert ? '0' : '1')
    } catch {
      /* préférence non conservée */
    }
  }

  const basculer = (nom: string) =>
    modifier((e) => {
      const l = e.activitesRetirees ?? []
      const n = l.includes(nom) ? l.filter((x) => x !== nom) : [...l, nom]
      if (n.length) e.activitesRetirees = n
      else delete e.activitesRetirees
    })

  return (
    <div className="mb-3 rounded-lg border border-pierre-200 bg-pierre-50/70 px-3 py-2 print:hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <label className="inline-flex items-center gap-1.5">
          <span className="text-pierre-600">Catégorie</span>
          <select
            className="rounded-md border border-pierre-300 bg-white py-1 pl-2 text-sm font-medium"
            style={meta ? { background: meta.clair, borderColor: meta.couleur } : undefined}
            value={etat.categorie ?? ''}
            disabled={!ecriture}
            onChange={(e) =>
              modifier((x) => {
                if (e.target.value) x.categorie = e.target.value as Categorie
                else delete x.categorie
              })
            }
          >
            <option value="">Toutes les activités</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {META_CATEGORIE[c].icone} {META_CATEGORIE[c].libelle}
              </option>
            ))}
          </select>
        </label>
        <span className="text-pierre-600">
          {liste.length - nbRetirees} activité{liste.length - nbRetirees > 1 ? 's' : ''} proposée{liste.length - nbRetirees > 1 ? 's' : ''}
          {nbRetirees > 0 && ` · ${nbRetirees} retirée${nbRetirees > 1 ? 's' : ''}`}
        </span>
        <button className="text-foret-700 hover:underline" aria-expanded={ouvert} onClick={basculerOuvert}>
          {ouvert ? 'Masquer la liste' : ecriture ? 'Choisir les activités' : 'Voir les activités'}
        </button>
      </div>
      {ouvert && (
        <>
          {ecriture && (
            <p className="mt-2 text-xs text-pierre-500">
              Cliquez une activité pour la retirer de {horaire.modele ? 'ce modèle' : 'cet horaire'} : grisée, elle n'est plus proposée
              dans les cases. Un autre clic la remet. Les catégories de chaque activité se règlent dans les Réglages.
            </p>
          )}
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Activités de cet horaire">
            {liste.map((a) => {
              const retiree = retirees.has(a.name)
              return (
                <li key={a.name}>
                  <button
                    aria-pressed={!retiree}
                    disabled={!ecriture}
                    title={ecriture ? (retiree ? 'Retirée : cliquer pour la remettre' : 'Proposée : cliquer pour la retirer') : undefined}
                    className={`rounded-full border px-2.5 py-0.5 text-xs ${
                      retiree
                        ? 'border-dashed border-pierre-300 bg-pierre-100 text-pierre-400 line-through'
                        : 'border-pierre-300 bg-white text-pierre-800 enabled:hover:border-pierre-500'
                    }`}
                    onClick={() => basculer(a.name)}
                  >
                    {a.name}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
