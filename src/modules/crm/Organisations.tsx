import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ui } from '@/lib/ui'
import { dateCourte, depuis, triInactifs } from './calculs'
import { champPetit, ChoixConseiller, Echeance, NouvelleOrganisation, PucesSaisons, PuceStatut, Puces } from './commun'
import { useDonnees } from './contexte'
import { GENRES, nomGenre, SAISONS, STATUTS, type Genre, type Saison, type Statut } from './types'

/**
 * Liste des organisations, triée par jours inactifs (le plus long silence en
 * haut, comme la vue de Copper que Vickie appelait de haut en bas). Filtres
 * gardés dans l'adresse.
 */
export function Organisations() {
  const { calculs, ecriture, auj } = useDonnees()
  const [params, setParams] = useSearchParams()
  const [nouvelle, setNouvelle] = useState(false)
  const statut = (params.get('statut') ?? '') as Statut | ''
  const saison = (params.get('saison') ?? '') as Saison | ''
  const genre = (params.get('type') ?? '') as Genre | ''
  const conseiller = params.get('conseiller')
  const tri = params.get('tri') ?? 'inactifs'
  const [recherche, setRecherche] = useState('')

  const regler = (cle: string, v: string | null) =>
    setParams(
      (p) => {
        if (v) p.set(cle, v)
        else p.delete(cle)
        return p
      },
      { replace: true },
    )

  const sansStatut = useMemo(() => {
    const mots = recherche.trim().toLowerCase()
    return calculs.filter(
      (c) =>
        (!saison || c.saisons.includes(saison)) &&
        (!genre || c.org.genre === genre) &&
        (!conseiller || c.org.conseiller_id === conseiller) &&
        (!mots || `${c.org.nom} ${c.org.ville ?? ''}`.toLowerCase().includes(mots)),
    )
  }, [calculs, saison, genre, conseiller, recherche])

  const liste = useMemo(() => {
    const l = sansStatut.filter((c) => !statut || c.statut === statut)
    return tri === 'nom' ? l : [...l].sort(triInactifs)
  }, [sansStatut, statut, tri])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Puces
          options={STATUTS}
          valeur={statut}
          changer={(v) => regler('statut', v)}
          compte={(id) => (id ? sansStatut.filter((c) => c.statut === id).length : sansStatut.length)}
        />
        <Puces options={SAISONS} valeur={saison} changer={(v) => regler('saison', v)} tout="Toutes saisons" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" placeholder="Rechercher…" className={`${champPetit} w-56`} value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        <select aria-label="Type" className={champPetit} value={genre} onChange={(e) => regler('type', e.target.value)}>
          <option value="">Tous les types</option>
          {GENRES.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nom}
            </option>
          ))}
        </select>
        <ChoixConseiller valeur={conseiller} changer={(v) => regler('conseiller', v)} vide="Tous les conseillers" />
        <select aria-label="Tri" className={champPetit} value={tri} onChange={(e) => regler('tri', e.target.value === 'inactifs' ? null : e.target.value)}>
          <option value="inactifs">Tri : jours inactifs</option>
          <option value="nom">Tri : nom</option>
        </select>
        {ecriture && (
          <button className={`${ui.bouton} ml-auto`} onClick={() => setNouvelle(true)}>
            + Organisation
          </button>
        )}
      </div>

      <div className={`${ui.carte} overflow-x-auto`}>
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="border-b border-pierre-200 bg-pierre-50 text-left text-xs font-medium uppercase tracking-wide text-pierre-500">
            <tr>
              <th className="px-3 py-2">Organisation</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2">Saisons</th>
              <th className="px-3 py-2">Dernier contact</th>
              <th className="px-3 py-2">Prochaine relance</th>
              <th className="px-3 py-2">Conseiller</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pierre-100">
            {liste.map((c) => (
              <Rangee key={c.org.id} id={c.org.id} />
            ))}
          </tbody>
        </table>
        {liste.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-pierre-500">
            {calculs.length === 0 ? 'Aucune organisation pour l’instant.' : 'Aucune organisation ne correspond aux filtres.'}
          </p>
        )}
      </div>
      <p className="text-xs text-pierre-500">
        Statut calculé d'après les séjours et les échanges (aujourd'hui : {dateCourte(auj)}). Un client qui a un séjour prévu est en bas de la liste.
      </p>

      {nouvelle && <NouvelleOrganisation fermer={() => setNouvelle(false)} />}
    </div>
  )
}

function Rangee({ id }: { id: string }) {
  const { parId, nomConseiller, auj } = useDonnees()
  const c = parId.get(id)!
  const o = c.org
  return (
    <tr className="align-top hover:bg-pierre-50">
      <td className="px-3 py-2">
        <Link to={`/crm/o/${o.id}`} className="font-medium text-pierre-900 hover:text-foret-800 hover:underline">
          {o.prioritaire && <span title="Cible prioritaire">⭐ </span>}
          {o.nom}
        </Link>
        <p className="text-xs text-pierre-500">
          {nomGenre(o.genre)}
          {o.ville && ` · ${o.ville}`}
        </p>
      </td>
      <td className="px-3 py-2">
        <PuceStatut statut={c.statut} />
      </td>
      <td className="px-3 py-2">
        <PucesSaisons saisons={c.saisons} />
      </td>
      <td className="px-3 py-2">
        {c.prochaine ? (
          <span className="text-foret-800">Vient le {dateCourte(c.prochaine.arrivee, auj)}</span>
        ) : (
          <span className={c.joursInactifs == null || c.joursInactifs > 180 ? 'text-red-700' : 'text-pierre-700'}>{depuis(c.joursInactifs)}</span>
        )}
        {c.demandes.length > 0 && <p className="text-xs text-amber-700">Demande en cours ({c.demandes[0].etat})</p>}
      </td>
      <td className="px-3 py-2">{c.relance ? <Echeance jour={c.relance.echeance} /> : <span className="text-pierre-300">—</span>}</td>
      <td className="px-3 py-2 text-pierre-600">{nomConseiller(o.conseiller_id) ?? <span className="text-pierre-300">—</span>}</td>
    </tr>
  )
}
