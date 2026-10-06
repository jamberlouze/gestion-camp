import { useMemo, useState } from 'react'
import { BandeauATrier } from './BandeauATrier'
import { Section, type Montrer } from './commun'
import type { Donnees } from './donnees'
import { comparer, comparerFaites, filtrer, FILTRES_VIDES, type Filtres } from './outils'
import { COULEURS_PRIORITE, PRIORITES, type Priorite, type Tache } from './types'

type Regroupement = 'priorite' | 'lieu' | 'categorie' | 'personne'

const CLE = 'travaux-taches'
const menu = 'rounded-lg border border-pierre-300 bg-white px-2.5 py-1.5 text-sm text-pierre-800'

/** Choix gardés sur l'appareil (regroupement et filtres). */
function lireChoix(): { regroupement: Regroupement; filtres: Filtres } {
  try {
    const c = JSON.parse(localStorage.getItem(CLE) ?? '{}')
    return { regroupement: c.regroupement ?? 'lieu', filtres: { ...FILTRES_VIDES, ...c.filtres, texte: '' } }
  } catch {
    return { regroupement: 'lieu', filtres: FILTRES_VIDES }
  }
}

/**
 * Onglet Tâches (accueil du module) : signalements à trier dans le bandeau,
 * puis les tâches à faire, une par ligne, regroupées et filtrées.
 */
export function Taches({ d }: { d: Donnees }) {
  const [choix, setChoix] = useState(lireChoix)
  const [voirFaites, setVoirFaites] = useState(false)
  const { regroupement, filtres } = choix
  const changer = (c: Partial<typeof choix>) => {
    const suivant = { ...choix, ...c }
    setChoix(suivant)
    try {
      localStorage.setItem(CLE, JSON.stringify(suivant))
    } catch {
      // Stockage indisponible : le choix vaut pour la session.
    }
  }
  const changerFiltres = (f: Partial<Filtres>) => changer({ filtres: { ...filtres, ...f } })

  const filtrees = useMemo(() => filtrer(d.taches, filtres), [d.taches, filtres])
  const ouvertes = filtrees.filter((t) => t.statut === 'a_faire').sort(comparer)
  const faites = filtrees.filter((t) => t.statut === 'terminee').sort(comparerFaites)

  const groupes = useMemo(() => regrouper(ouvertes, regroupement, d), [ouvertes, regroupement, d])
  const montrer: Montrer = { lieu: regroupement !== 'lieu', categorie: regroupement !== 'categorie', chantier: true, personne: regroupement !== 'personne' }
  const actifs = filtres.lieu || filtres.categorie || filtres.personne || filtres.chantier || filtres.priorite || filtres.texte

  return (
    <div className="space-y-4">
      <BandeauATrier d={d} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-pierre-300 bg-white p-0.5 text-sm" role="group" aria-label="Regrouper par">
          {(
            [
              ['priorite', 'Urgence'],
              ['lieu', 'Lieu'],
              ['categorie', 'Catégorie'],
              ['personne', 'Personne'],
            ] as const
          ).map(([r, nom]) => (
            <button
              key={r}
              className={`rounded-md px-2.5 py-1 ${regroupement === r ? 'bg-foret-100 font-medium text-foret-800' : 'text-pierre-600 hover:text-pierre-900'}`}
              onClick={() => changer({ regroupement: r })}
            >
              {nom}
            </button>
          ))}
        </div>
        <input
          type="search"
          className={`${menu} w-44`}
          placeholder="Chercher…"
          aria-label="Chercher"
          value={filtres.texte}
          onChange={(e) => changerFiltres({ texte: e.target.value })}
        />
        <select aria-label="Lieu" className={menu} value={filtres.lieu} onChange={(e) => changerFiltres({ lieu: e.target.value })}>
          <option value="">Tous les lieux</option>
          {d.lieux.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nom}
            </option>
          ))}
          <option value="aucun">Sans lieu</option>
        </select>
        <select aria-label="Catégorie" className={menu} value={filtres.categorie} onChange={(e) => changerFiltres({ categorie: e.target.value })}>
          <option value="">Toutes les catégories</option>
          {d.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
          <option value="aucune">Sans catégorie</option>
        </select>
        <select aria-label="Personne" className={menu} value={filtres.personne} onChange={(e) => changerFiltres({ personne: e.target.value })}>
          <option value="">Tout le monde</option>
          <option value="libre">À assigner</option>
          {d.personnes
            .filter((p) => p.peut_assigner || p.id === filtres.personne)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
        </select>
        <select aria-label="Priorité" className={menu} value={filtres.priorite} onChange={(e) => changerFiltres({ priorite: e.target.value })}>
          <option value="">Toutes les priorités</option>
          {Object.entries(PRIORITES).map(([n, nom]) => (
            <option key={n} value={n}>
              {nom}
            </option>
          ))}
        </select>
        <select aria-label="Chantier" className={menu} value={filtres.chantier} onChange={(e) => changerFiltres({ chantier: e.target.value })}>
          <option value="">Tous les chantiers</option>
          {d.chantiers
            .filter((c) => !c.termine_le || c.id === filtres.chantier)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
        </select>
        {actifs && (
          <button className="text-sm text-pierre-500 underline hover:text-pierre-800" onClick={() => changer({ filtres: FILTRES_VIDES })}>
            Tout afficher
          </button>
        )}
      </div>

      <p className="text-sm text-pierre-500">
        {ouvertes.length} tâche{ouvertes.length > 1 ? 's' : ''} à faire
        {actifs ? ' (filtrées)' : ''}.
      </p>

      <div className="space-y-4">
        {groupes.map((g) => (
          <Section key={g.cle} titre={g.nom} couleur={g.couleur} taches={g.taches} d={d} montrer={montrer} />
        ))}
      </div>
      {ouvertes.length === 0 && <p className="py-6 text-center text-sm text-pierre-500">Aucune tâche à faire.</p>}

      {faites.length > 0 && (
        <div>
          <button className="text-sm text-pierre-600 underline" onClick={() => setVoirFaites(!voirFaites)}>
            {voirFaites ? 'Cacher' : 'Voir'} les tâches terminées ({faites.length})
          </button>
          {voirFaites && (
            <div className="mt-3">
              <Section titre="Terminées" sous="les plus récentes d'abord" taches={faites.slice(0, 100)} d={d} montrer={{ lieu: true, chantier: true }} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function regrouper(taches: Tache[], r: Regroupement, d: Donnees) {
  const groupes: { cle: string; nom: string; couleur?: string; taches: Tache[] }[] = []
  const ajouter = (cle: string, nom: string, liste: Tache[], couleur?: string) => {
    if (liste.length) groupes.push({ cle, nom, couleur, taches: liste })
  }
  if (r === 'priorite') {
    for (const n of [1, 2, 3] as Priorite[]) ajouter(String(n), PRIORITES[n], taches.filter((t) => t.priorite === n), COULEURS_PRIORITE[n])
  } else if (r === 'lieu') {
    for (const l of d.lieux) ajouter(l.id, l.nom, taches.filter((t) => t.lieu_id === l.id))
    ajouter('aucun', 'Sans lieu', taches.filter((t) => !t.lieu_id || !d.lieu.has(t.lieu_id)))
  } else if (r === 'categorie') {
    for (const c of d.categories) ajouter(c.id, c.nom, taches.filter((t) => t.categorie_id === c.id))
    ajouter('aucune', 'Sans catégorie', taches.filter((t) => !t.categorie_id || !d.categorie.has(t.categorie_id)))
  } else {
    for (const p of d.personnes) ajouter(p.id, p.nom, taches.filter((t) => t.assigne_a === p.id))
    ajouter('libre', 'À assigner', taches.filter((t) => !t.assigne_a || !d.personne.has(t.assigne_a)))
  }
  return groupes
}
