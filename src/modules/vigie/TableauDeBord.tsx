import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { messageErreur } from '@/lib/donnees'
import { IconeAttention } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { ChoixCategorie, Chargement, PastilleCategorie } from './commun'
import { dateCourte, estComparable, estLeader, fourchetteParNuit, indexer, menu, rangCategorie } from './outils'
import { useActivites, useAValider, useCamps, useEcriture, useLiens, useModifier, useProgrammes } from './donnees'
import type { Camp, Categorie, StatutInclusion } from './types'

type Tri = 'nom' | 'region' | 'prix' | 'activites'

/** Métriques en haut, puis la liste des camps (filtres catégorie et région). */
export function TableauDeBord() {
  const ecriture = useEcriture()
  const camps = useCamps()
  const activites = useActivites()
  const liens = useLiens()
  const programmes = useProgrammes()
  const aValider = useAValider()
  const modifier = useModifier<Camp>('camps')
  // Catégorie dans l'adresse (?categorie=leader) : la métrique des leaders y mène.
  const [params, setParams] = useSearchParams()
  const categorie = (params.get('categorie') ?? '') as '' | Categorie
  const setCategorie = (c: '' | Categorie) => {
    const p = new URLSearchParams(params)
    if (c) p.set('categorie', c)
    else p.delete('categorie')
    setParams(p, { replace: true })
  }
  const [region, setRegion] = useState('')
  const [statut, setStatut] = useState<StatutInclusion>('inclus')
  const [texte, setTexte] = useState('')
  const [tri, setTri] = useState<Tri>('nom')

  const idx = useMemo(
    () => indexer(camps.data ?? [], activites.data ?? [], liens.data ?? [], programmes.data ?? []),
    [camps.data, activites.data, liens.data, programmes.data],
  )

  const metriques = useMemo(() => {
    const suivis = camps.data ?? []
    // n = camps comparables (leaders et références) qui l'offrent ; l = dont leaders.
    const manquantes = (activites.data ?? [])
      .filter((a) => !a.offert_bpa)
      .map((a) => {
        const offrent = idx.campsParActivite.get(a.id) ?? []
        return { a, n: offrent.filter(estComparable).length, l: offrent.filter(estLeader).length }
      })
      .filter((x) => x.n > 0)
      .sort((x, y) => y.l - x.l || y.n - x.n || x.a.nom.localeCompare(y.a.nom))
    // Activités propres à l'hiver d'abord (pas d'été), puis celles de toute l'année.
    const propre = (x: (typeof manquantes)[number]) => !x.a.saisons.includes('ete')
    const hiver = manquantes
      .filter((x) => x.a.saisons.includes('hiver'))
      .sort((x, y) => Number(propre(y)) - Number(propre(x)) || y.l - x.l || y.n - x.n)
    return {
      leaders: suivis.filter(estLeader).length,
      references: suivis.filter((c) => estComparable(c) && c.categorie === 'reference').length,
      manquantes,
      chezLeaders: manquantes.filter((x) => x.l > 0).length,
      hiver,
      propresHiver: hiver.filter(propre).length,
    }
  }, [camps.data, activites.data, idx])

  const erreur = camps.error ?? activites.error ?? liens.error ?? programmes.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!camps.data || !activites.data || !liens.data || !programmes.data) return <Chargement />

  const regions = [...new Set(camps.data.map((c) => c.region).filter((r): r is string => !!r))].sort((a, b) => a.localeCompare(b, 'fr'))
  const prixMin = (c: Camp) => Math.min(...(idx.programmesParCamp.get(c.id) ?? []).map((p) => (p.prix_par_nuit == null ? Infinity : Number(p.prix_par_nuit))))
  const recherche = texte.trim().toLowerCase()
  const liste = camps.data
    .filter((c) => c.statut_inclusion === statut)
    .filter((c) => !categorie || c.categorie === categorie)
    .filter((c) => !region || c.region === region)
    .filter((c) => !recherche || `${c.nom} ${c.ville ?? ''}`.toLowerCase().includes(recherche))
    .sort((a, b) => {
      if (tri === 'region') return (a.region ?? '~').localeCompare(b.region ?? '~', 'fr') || a.nom.localeCompare(b.nom, 'fr')
      if (tri === 'prix') return prixMin(a) - prixMin(b) || a.nom.localeCompare(b.nom, 'fr')
      if (tri === 'activites') return (idx.activitesParCamp.get(b.id)?.length ?? 0) - (idx.activitesParCamp.get(a.id)?.length ?? 0)
      return rangCategorie(a) - rangCategorie(b) || a.nom.localeCompare(b.nom, 'fr')
    })
  const nbAValider = (aValider.data?.length ?? 0) + camps.data.filter((c) => c.statut_inclusion === 'propose').length

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metrique
          valeur={metriques.leaders}
          libelle={`leaders de l'industrie suivis, et ${metriques.references} camps de référence`}
          lien="/vigie?categorie=leader"
        />
        <Metrique
          valeur={metriques.manquantes.length}
          libelle={`activités absentes à la BPA mais offertes par des camps comparables, dont ${metriques.chezLeaders} chez des leaders`}
          lien="/vigie/activites?manquantes=1"
        />
        <div className={`${ui.carte} border-sky-200 bg-sky-50/60 p-4`}>
          <div className="flex items-center gap-2 text-sky-900">
            <IconeAttention className="size-5" />
            <span className="text-2xl font-semibold tabular-nums">{metriques.hiver.length}</span>
            <span className="text-sm font-medium">activités d'hiver manquantes</span>
          </div>
          <p className="mt-1 text-xs text-sky-900/80">
            Possibles l'hiver, offertes par des camps comparables et pas à la BPA (qui accueille pourtant des classes neige) ; dont{' '}
            {metriques.propresHiver} propres à l'hiver. Après le nom : nombre de camps (★ = leaders).
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {metriques.hiver.slice(0, 6).map(({ a, n, l }) => (
              <Link key={a.id} to={`/vigie/activites/${a.id}`} className="rounded-full bg-white px-2 py-0.5 text-xs text-sky-900 ring-1 ring-sky-200 hover:ring-sky-400">
                {a.nom} · {n}
                {l > 0 && ` · ★${l}`}
              </Link>
            ))}
            {metriques.hiver.length > 6 && (
              <Link to="/vigie/activites?manquantes=1&saison=hiver" className="px-1 text-xs text-sky-900 underline">
                + {metriques.hiver.length - 6}
              </Link>
            )}
          </div>
        </div>
        <Metrique valeur={nbAValider} libelle="éléments à valider (changements et camps proposés)" lien="/vigie/a-valider" accent={nbAValider > 0} />
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-2 font-semibold">Camps</h2>
          <select aria-label="Statut" className={menu} value={statut} onChange={(e) => setStatut(e.target.value as StatutInclusion)}>
            <option value="inclus">Suivis</option>
            <option value="propose">Proposés</option>
            <option value="exclu">Exclus</option>
          </select>
          <select aria-label="Catégorie" className={menu} value={categorie} onChange={(e) => setCategorie(e.target.value as typeof categorie)}>
            <option value="">Toutes les catégories</option>
            <option value="leader">Leaders de l'industrie</option>
            <option value="reference">Références</option>
            <option value="non_comparable">Pas des comparables</option>
          </select>
          <select aria-label="Région" className={menu} value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">Toutes les régions</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select aria-label="Trier" className={menu} value={tri} onChange={(e) => setTri(e.target.value as Tri)}>
            <option value="nom">Leaders d'abord, puis par nom</option>
            <option value="region">Trier par région</option>
            <option value="prix">Trier par prix par nuit</option>
            <option value="activites">Trier par nombre d'activités</option>
          </select>
          <input className={`${menu} w-48`} placeholder="Rechercher…" value={texte} onChange={(e) => setTexte(e.target.value)} />
          <span className="text-sm text-pierre-500">{liste.length} camp{liste.length > 1 ? 's' : ''}</span>
        </div>

        <div className={`${ui.carte} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className="border-b border-pierre-200 text-left text-xs uppercase tracking-wide text-pierre-500">
              <tr>
                <th className="px-3 py-2 font-medium">Camp</th>
                <th className="px-3 py-2 font-medium">Région</th>
                <th className="px-3 py-2 font-medium">Catégorie</th>
                <th className="px-3 py-2 font-medium">Programmes</th>
                <th className="px-3 py-2 text-right font-medium">Prix / nuit</th>
                <th className="px-3 py-2 text-right font-medium">Activités</th>
                <th className="px-3 py-2 text-right font-medium">Web /10</th>
                <th className="px-3 py-2 font-medium">Vérifié</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pierre-100">
              {liste.map((c) => {
                const progs = idx.programmesParCamp.get(c.id) ?? []
                return (
                  <tr key={c.id} className="hover:bg-pierre-50">
                    <td className="px-3 py-2">
                      <Link to={`/vigie/camps/${c.id}`} className="font-medium hover:underline">
                        {c.nom}
                      </Link>
                      <div className="text-xs text-pierre-500">
                        {c.ville}
                        {c.membre_acq ? ' · ACQ' : ' · non-membre ACQ'}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-pierre-700">{c.region ?? '—'}</td>
                    <td className="px-3 py-2">
                      {ecriture ? (
                        <ChoixCategorie valeur={c.categorie} changer={(categorie) => modifier.mutate({ id: c.id, categorie })} />
                      ) : (
                        <PastilleCategorie categorie={c.categorie} />
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-pierre-700">{progs.length || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fourchetteParNuit(progs) ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{idx.activitesParCamp.get(c.id)?.length ?? 0}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-pierre-700">{c.site_web_score ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-pierre-500">{c.verifie_le ? dateCourte(c.verifie_le) : 'jamais'}</td>
                  </tr>
                )
              })}
              {!liste.length && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-pierre-500">
                    Aucun camp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Metrique({ valeur, libelle, lien, accent }: { valeur: number; libelle: string; lien?: string; accent?: boolean }) {
  const contenu = (
    <>
      <div className={`text-2xl font-semibold tabular-nums ${accent ? 'text-amber-700' : ''}`}>{valeur}</div>
      <div className="mt-0.5 text-sm text-pierre-600">{libelle}</div>
    </>
  )
  return lien ? (
    <Link to={lien} className={`${ui.carte} block p-4 transition hover:border-foret-600`}>
      {contenu}
    </Link>
  ) : (
    <div className={`${ui.carte} p-4`}>{contenu}</div>
  )
}
