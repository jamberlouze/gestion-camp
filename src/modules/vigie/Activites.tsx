import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { messageErreur } from '@/lib/donnees'
import { IconePlus } from '@/lib/icones'
import { Bulle, SaisieNom } from '@/lib/SaisieNom'
import { ui } from '@/lib/ui'
import { Chargement, Saisons } from './commun'
import { argent, estComparable, estLeader, indexer, menu } from './outils'
import { useActivites, useCamps, useEcriture, useLiens, useMaquettes, useModifier, usePhotos, useProgrammes } from './donnees'
import { SAISONS, type Activite, type Saison } from './types'

type Tri = 'competiteurs' | 'nom' | 'implantation'

/** Liste candidate commune des activités. */
export function Activites() {
  const ecriture = useEcriture()
  const activites = useActivites()
  const camps = useCamps()
  const liens = useLiens()
  const programmes = useProgrammes()
  const photos = usePhotos()
  const maquettes = useMaquettes()
  const modifier = useModifier<Activite>('activites')
  const [params, setParams] = useSearchParams()
  const [texte, setTexte] = useState('')
  const [tri, setTri] = useState<Tri>('competiteurs')
  const [ajout, setAjout] = useState(false)
  const manquantes = params.get('manquantes') === '1'
  const saison = (params.get('saison') ?? '') as Saison | ''
  const changer = (cle: string, valeur: string) => {
    const p = new URLSearchParams(params)
    if (valeur) p.set(cle, valeur)
    else p.delete(cle)
    setParams(p, { replace: true })
  }

  const idx = useMemo(
    () => indexer(camps.data ?? [], activites.data ?? [], liens.data ?? [], programmes.data ?? []),
    [camps.data, activites.data, liens.data, programmes.data],
  )
  const nbPhotos = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of photos.data ?? []) m.set(p.activite_id, (m.get(p.activite_id) ?? 0) + 1)
    return m
  }, [photos.data])
  const avecMaquette = new Set((maquettes.data ?? []).map((m) => m.activite_id))

  const erreur = activites.error ?? camps.error ?? liens.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!activites.data || !camps.data || !liens.data || !programmes.data) return <Chargement />

  const compte = (a: Activite) => {
    const offrent = idx.campsParActivite.get(a.id) ?? []
    return { leaders: offrent.filter(estLeader).length, comparables: offrent.filter(estComparable).length }
  }
  const recherche = texte.trim().toLowerCase()
  const liste = activites.data
    .map((a) => ({ a, ...compte(a) }))
    .filter((x) => !manquantes || (!x.a.offert_bpa && x.comparables > 0))
    .filter((x) => !saison || x.a.saisons.includes(saison))
    .filter((x) => !recherche || x.a.nom.toLowerCase().includes(recherche))
    .sort((x, y) =>
      tri === 'nom'
        ? x.a.nom.localeCompare(y.a.nom, 'fr')
        : tri === 'implantation'
          ? (x.a.cout_implantation ?? Infinity) - (y.a.cout_implantation ?? Infinity)
          : y.leaders - x.leaders || y.comparables - x.comparables || x.a.nom.localeCompare(y.a.nom, 'fr'),
    )

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={manquantes} onChange={(e) => changer('manquantes', e.target.checked ? '1' : '')} />
          Absentes à la BPA, offertes par des camps comparables
        </label>
        <select aria-label="Saison" className={menu} value={saison} onChange={(e) => changer('saison', e.target.value)}>
          <option value="">Toutes les saisons</option>
          {SAISONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.libelle}
            </option>
          ))}
        </select>
        <select aria-label="Trier" className={menu} value={tri} onChange={(e) => setTri(e.target.value as Tri)}>
          <option value="competiteurs">Trier par leaders, puis camps comparables</option>
          <option value="nom">Trier par nom</option>
          <option value="implantation">Trier par coût d'implantation</option>
        </select>
        <input className={`${menu} w-48`} placeholder="Rechercher…" value={texte} onChange={(e) => setTexte(e.target.value)} />
        <span className="text-sm text-pierre-500">{liste.length} activité{liste.length > 1 ? 's' : ''}</span>
        {ecriture && (
          <span className="relative ml-auto">
            <button className={`${ui.boutonSecondaire} py-1.5`} onClick={() => setAjout(true)}>
              <IconePlus /> Activité
            </button>
            {ajout && (
              <Bulle fermer={() => setAjout(false)}>
                <p className="mb-2 text-sm font-medium">Nouvelle activité candidate</p>
                <SaisieNom
                  compact
                  libelleOk="Ajouter"
                  annuler={() => setAjout(false)}
                  valider={async (nom) => {
                    try {
                      await modifier.mutateAsync({ nom })
                      setAjout(false)
                      return null
                    } catch (e) {
                      return messageErreur(e)
                    }
                  }}
                />
              </Bulle>
            )}
          </span>
        )}
      </div>

      <div className={`${ui.carte} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="border-b border-pierre-200 text-left text-xs uppercase tracking-wide text-pierre-500">
            <tr>
              <th className="px-3 py-2 font-medium">Activité</th>
              <th className="px-3 py-2 font-medium">Saisons</th>
              <th className="px-3 py-2 text-center font-medium">À la BPA</th>
              <th className="px-3 py-2 text-right font-medium" title="Leaders de l'industrie qui l'offrent">
                ★ Leaders
              </th>
              <th className="px-3 py-2 text-right font-medium" title="Camps comparables suivis (leaders et références) qui l'offrent">
                Camps comparables
              </th>
              <th className="px-3 py-2 text-right font-medium">Implantation</th>
              <th className="px-3 py-2 text-right font-medium">Opération / an</th>
              <th className="px-3 py-2 font-medium">Visuels</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pierre-100">
            {liste.map(({ a, leaders, comparables }) => (
              <tr key={a.id} className="hover:bg-pierre-50">
                <td className="px-3 py-2">
                  <Link to={`/vigie/activites/${a.id}`} className="font-medium hover:underline">
                    {a.nom}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <Saisons saisons={a.saisons} />
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    aria-label="Offerte à la BPA"
                    checked={a.offert_bpa}
                    disabled={!ecriture}
                    onChange={(e) => modifier.mutate({ id: a.id, offert_bpa: e.target.checked })}
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{leaders ? <b className="text-amber-900">{leaders}</b> : <span className="text-pierre-400">0</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums">{comparables}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{argent(a.cout_implantation)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{argent(a.cout_operation_annuel)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-pierre-500">
                  {nbPhotos.get(a.id) ? `${nbPhotos.get(a.id)} photo${nbPhotos.get(a.id)! > 1 ? 's' : ''}` : ''}
                  {avecMaquette.has(a.id) && <span className="ml-1.5 rounded bg-pierre-100 px-1 text-pierre-700">3D</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-pierre-500">Coûts : estimés de Claude (ordre de grandeur, dollars canadiens, taxes en sus), à raffiner.</p>
    </div>
  )
}
