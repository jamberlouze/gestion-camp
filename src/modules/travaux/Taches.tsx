import { useEffect, useMemo, useState } from 'react'
import { ChoixEtiquettes } from '@/lib/Etiquettes'
import { IconeImprimer } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { useTitreImpression } from '@/lib/useTitreImpression'
import { BandeauATrier } from './BandeauATrier'
import { ChoixRegroupement, Section, type Montrer } from './commun'
import type { Donnees } from './donnees'
import { colonnesPour, decrireFiltres, FenetreImpression, ListeImprimee, pageParGroupeParDefaut, type ChoixImpression } from './Impression'
import { comparerFaites, filtrer, FILTRES_VIDES, jourAujourdhui, regrouper, REGROUPEMENTS, trier, TRIS, useDroits, type Filtres, type Regroupement, type Tri } from './outils'
import { PRIORITES } from './types'

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
 * « Imprimer » met sur papier les tâches affichées, groupes au choix.
 */
export function Taches({ d }: { d: Donnees }) {
  const droits = useDroits()
  const [choix, setChoix] = useState(lireChoix)
  const [voirFaites, setVoirFaites] = useState(false)
  const [fenetreImpression, setFenetreImpression] = useState(false)
  const [aImprimer, setAImprimer] = useState<ChoixImpression | null>(null)
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
  // Terrain ne voit que ses tâches et ses signalements pas encore assignés : pas de filtre par personne (un choix gardé d'avant tombe).
  const personne = droits.terrain ? '' : filtres.personne
  const filtrees = useMemo(() => filtrer(d.taches, { ...filtres, personne, etiquettes }), [d.taches, filtres, personne, etiquettes])
  const ouvertes = useMemo(() => trier(filtrees.filter((t) => t.statut === 'a_faire'), tri), [filtrees, tri])
  const faites = filtrees.filter((t) => t.statut === 'terminee').sort(comparerFaites)

  const groupes = useMemo(() => regrouper(ouvertes, regroupement, d, etiquettes), [ouvertes, regroupement, d, etiquettes])
  const montrer: Montrer = { lieu: regroupement !== 'lieu', categorie: regroupement !== 'categorie', chantier: true, personne: regroupement !== 'personne' }
  const actifs = filtres.lieu || filtres.categorie || personne || filtres.chantier || filtres.priorite || etiquettes.length > 0 || filtres.texte

  // Impression : les groupes cochés dans la fenêtre ; ⌘P sans la fenêtre = ce qui est affiché.
  const imprime: ChoixImpression = aImprimer ?? {
    regroupement,
    cles: groupes.map((g) => g.cle),
    pageParGroupe: pageParGroupeParDefaut(regroupement),
    descriptions: true,
  }
  const groupesImprimes = useMemo(
    () => (aImprimer ? regrouper(ouvertes, aImprimer.regroupement, d, etiquettes).filter((g) => aImprimer.cles.includes(g.cle)) : groupes),
    [aImprimer, ouvertes, d, etiquettes, groupes],
  )
  const portee = decrireFiltres({ ...filtres, personne, etiquettes }, d)
  // Nom du PDF : le groupe s'il n'y en a qu'un (« Travaux - Léa - 2026-10-22 »).
  const sujet = imprime.regroupement !== 'aucun' && groupesImprimes.length === 1 ? groupesImprimes[0].nom : portee || 'tâches à faire'
  useTitreImpression(`Travaux - ${sujet} - ${jourAujourdhui()}`)
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
          <ChoixRegroupement valeur={regroupement} changer={(r) => changer({ regroupement: r })} d={d} />
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
          {!droits.terrain && (
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
          )}
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
        {ouvertes.length === 0 && (
          <p className="py-6 text-center text-sm text-pierre-500">{droits.terrain && !actifs ? "Rien à faire pour toi pour l'instant." : 'Aucune tâche à faire.'}</p>
        )}

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
        groupes={groupesImprimes}
        regroupe={imprime.regroupement !== 'aucun'}
        d={d}
        colonnes={colonnesPour(imprime.regroupement)}
        options={imprime}
        portee={portee}
        tri={tri}
      />
      {fenetreImpression && (
        <FenetreImpression
          taches={ouvertes}
          d={d}
          regroupementEcran={regroupement}
          etiquettesFiltrees={etiquettes}
          portee={portee}
          tri={tri}
          fermer={() => setFenetreImpression(false)}
          imprimer={(c) => {
            setFenetreImpression(false)
            setAImprimer(c)
          }}
        />
      )}
    </>
  )
}
