import { useEffect, useMemo, useState } from 'react'
import { ChoixEtiquettes } from '@/lib/Etiquettes'
import { IconeImprimer } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { useTitreImpression } from '@/lib/useTitreImpression'
import { BandeauATrier } from './BandeauATrier'
import { Section, type Montrer } from './commun'
import type { Donnees } from './donnees'
import { decrireFiltres, FenetreImpression, ListeImprimee, type Groupe, type OptionsImpression } from './Impression'
import { comparerFaites, filtrer, FILTRES_VIDES, jourAujourdhui, trier, TRIS, type Filtres, type Tri } from './outils'
import { COULEURS_PRIORITE, PRIORITES, type Priorite, type Tache } from './types'

type Regroupement = 'priorite' | 'lieu' | 'categorie' | 'personne' | 'etiquette' | 'aucun'

/** Bouton du regroupement, et nom d'un groupe dans « Une page par … ». */
const REGROUPEMENTS: [Regroupement, string, string | null][] = [
  ['priorite', 'Urgence', "niveau d'urgence"],
  ['lieu', 'Lieu', 'lieu'],
  ['categorie', 'Catégorie', 'catégorie'],
  ['personne', 'Personne', 'personne'],
  ['etiquette', 'Étiquette', 'étiquette'],
  ['aucun', 'Aucun', null],
]

const CLE = 'travaux-taches'
const menu = 'rounded-lg border border-pierre-300 bg-white px-2.5 py-1.5 text-sm text-pierre-800'

/** Choix gardés sur l'appareil (regroupement, tri et filtres, sauf la recherche). */
function lireChoix(): { regroupement: Regroupement; tri: Tri; filtres: Filtres } {
  try {
    const c = JSON.parse(localStorage.getItem(CLE) ?? '{}')
    const etiquettes = Array.isArray(c.filtres?.etiquettes) ? c.filtres.etiquettes.filter((x: unknown) => typeof x === 'string') : []
    return {
      regroupement: REGROUPEMENTS.some(([r]) => r === c.regroupement) ? c.regroupement : 'lieu',
      tri: c.tri in TRIS ? c.tri : 'urgence',
      filtres: { ...FILTRES_VIDES, ...c.filtres, etiquettes, texte: '' },
    }
  } catch {
    return { regroupement: 'lieu', tri: 'urgence', filtres: FILTRES_VIDES }
  }
}

/**
 * Onglet Tâches (accueil du module) : signalements à trier dans le bandeau,
 * puis les tâches à faire, une par ligne, regroupées, filtrées et triées.
 * « Imprimer » met sur papier ce qui est affiché.
 */
export function Taches({ d }: { d: Donnees }) {
  const [choix, setChoix] = useState(lireChoix)
  const [voirFaites, setVoirFaites] = useState(false)
  const [fenetreImpression, setFenetreImpression] = useState(false)
  const [aImprimer, setAImprimer] = useState<OptionsImpression | null>(null)
  const { regroupement, tri, filtres } = choix
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

  // Une étiquette retirée de la liste de Mastertimeline ne filtre plus rien.
  const etiquettes = useMemo(() => filtres.etiquettes.filter((id) => d.etiquettes.some((e) => e.id === id)), [filtres.etiquettes, d.etiquettes])
  const filtrees = useMemo(() => filtrer(d.taches, { ...filtres, etiquettes }), [d.taches, filtres, etiquettes])
  const ouvertes = useMemo(() => trier(filtrees.filter((t) => t.statut === 'a_faire'), tri), [filtrees, tri])
  const faites = filtrees.filter((t) => t.statut === 'terminee').sort(comparerFaites)

  const groupes = useMemo(() => regrouper(ouvertes, regroupement, d, etiquettes), [ouvertes, regroupement, d, etiquettes])
  const montrer: Montrer = { lieu: regroupement !== 'lieu', categorie: regroupement !== 'categorie', chantier: true, personne: regroupement !== 'personne' }
  const actifs = filtres.lieu || filtres.categorie || filtres.personne || filtres.chantier || filtres.priorite || etiquettes.length > 0 || filtres.texte

  // Impression : ⌘P aussi donne la liste (options par défaut).
  const nomGroupe = REGROUPEMENTS.find(([r]) => r === regroupement)?.[2] ?? null
  const optionsParDefaut: OptionsImpression = { pageParGroupe: regroupement === 'personne' || regroupement === 'etiquette', descriptions: true }
  const portee = decrireFiltres({ ...filtres, etiquettes }, d)
  useTitreImpression(`Travaux - ${portee || 'tâches à faire'} - ${jourAujourdhui()}`)
  useEffect(() => {
    if (!aImprimer) return
    const minuterie = setTimeout(() => {
      window.print()
      setAImprimer(null)
    }, 50)
    return () => clearTimeout(minuterie)
  }, [aImprimer])

  return (
    <>
      <div className="space-y-4 print:hidden">
        <BandeauATrier d={d} />
        <div className="flex flex-wrap items-center gap-2">
          <div className="sans-barre inline-flex max-w-full overflow-x-auto rounded-lg border border-pierre-300 bg-white p-0.5 text-sm" role="group" aria-label="Regrouper par">
            {REGROUPEMENTS.filter(([r]) => r !== 'etiquette' || d.etiquettes.length > 0).map(([r, nom]) => (
              <button
                key={r}
                className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 ${regroupement === r ? 'bg-foret-100 font-medium text-foret-800' : 'text-pierre-600 hover:text-pierre-900'}`}
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
          {d.etiquettes.length > 0 && (
            <ChoixEtiquettes petit libelle="Filtrer par étiquette" liste={d.etiquettes} choisies={etiquettes} changer={(ids) => changerFiltres({ etiquettes: ids })} />
          )}
          {actifs && (
            <button className="text-sm text-pierre-500 underline hover:text-pierre-800" onClick={() => changer({ filtres: FILTRES_VIDES })}>
              Tout afficher
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm text-pierre-500">
            {ouvertes.length} tâche{ouvertes.length > 1 ? 's' : ''} à faire
            {actifs ? ' (filtrées)' : ''}.
          </p>
          <label className="ml-auto flex items-center gap-1.5 text-sm text-pierre-500">
            Trier par
            <select className={menu} value={tri} onChange={(e) => changer({ tri: e.target.value as Tri })}>
              {Object.entries(TRIS).map(([t, nom]) => (
                <option key={t} value={t}>
                  {nom}
                </option>
              ))}
            </select>
          </label>
          {/* Sur ordinateur et tablette seulement. */}
          {ouvertes.length > 0 && (
            <button className={`${ui.boutonSecondaire} py-1.5 max-sm:hidden`} onClick={() => setFenetreImpression(true)}>
              <IconeImprimer /> Imprimer
            </button>
          )}
        </div>

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

      <ListeImprimee
        groupes={groupes}
        regroupe={regroupement !== 'aucun'}
        d={d}
        colonnes={{ lieu: !!montrer.lieu, categorie: !!montrer.categorie, personne: !!montrer.personne, priorite: regroupement !== 'priorite' }}
        options={aImprimer ?? optionsParDefaut}
        portee={portee}
        tri={tri}
      />
      {fenetreImpression && (
        <FenetreImpression
          nombre={ouvertes.length}
          portee={portee}
          tri={tri}
          groupe={nomGroupe}
          defauts={optionsParDefaut}
          fermer={() => setFenetreImpression(false)}
          imprimer={(o) => {
            setFenetreImpression(false)
            setAImprimer(o)
          }}
        />
      )}
    </>
  )
}

function regrouper(taches: Tache[], r: Regroupement, d: Donnees, etiquettesFiltrees: string[]) {
  const groupes: Groupe[] = []
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
  } else if (r === 'personne') {
    for (const p of d.personnes) ajouter(p.id, p.nom, taches.filter((t) => t.assigne_a === p.id))
    ajouter('libre', 'À assigner', taches.filter((t) => !t.assigne_a || !d.personne.has(t.assigne_a)))
  } else if (r === 'etiquette') {
    // Une tâche à deux étiquettes paraît dans les deux groupes ; avec le filtre, seulement ceux des étiquettes choisies.
    for (const e of d.etiquettes) {
      if (etiquettesFiltrees.length && !etiquettesFiltrees.includes(e.id)) continue
      ajouter(e.id, e.nom, taches.filter((t) => t.etiquette_ids.includes(e.id)), e.couleur ?? undefined)
    }
    ajouter('aucune', 'Sans étiquette', taches.filter((t) => !d.etiquettes.some((e) => t.etiquette_ids.includes(e.id))))
  } else {
    ajouter('toutes', 'Tâches à faire', taches)
  }
  return groupes
}
