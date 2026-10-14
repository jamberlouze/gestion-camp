import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { ChoixTypeSejour, Chargement, Puces } from './commun'
import { argent, duType, ecartMediane, estComparable, lienCamp, medianesParType, menu, resumeStats, useTypeChoisi } from './outils'
import { useCamps, useConfirmerTypes, useEcriture, useProgrammes } from './donnees'
import { nomTypeSejour, TYPES_SEJOUR, type Camp, type Programme, type TypeSejour } from './types'

type Tri = 'camp' | 'prix'

const OPTIONS_TYPE: { id: TypeSejour | 'aucun'; nom: string }[] = [
  ...TYPES_SEJOUR.map((t) => ({ id: t.id, nom: t.libelle })),
  { id: 'aucun', nom: 'Pas classé' },
]

/**
 * Tous les programmes des camps (sauf exclus), pour comparer les prix entre
 * programmes du même type de séjour et confirmer les types proposés par Claude
 * (« À vérifier », ?verifier=1).
 */
export function ListeProgrammes() {
  const ecriture = useEcriture()
  const camps = useCamps()
  const programmes = useProgrammes()
  const confirmerTypes = useConfirmerTypes()
  const [type, setType] = useTypeChoisi(true)
  const [params, setParams] = useSearchParams()
  const verifier = params.get('verifier') === '1'
  const setVerifier = (v: boolean) => {
    const p = new URLSearchParams(params)
    if (v) p.set('verifier', '1')
    else p.delete('verifier')
    setParams(p, { replace: true })
  }
  const [texte, setTexte] = useState('')
  const [tri, setTri] = useState<Tri>('camp')

  const camp = useMemo(() => new Map((camps.data ?? []).map((c) => [c.id, c])), [camps.data])
  const medianes = useMemo(() => medianesParType(camps.data ?? [], programmes.data ?? []), [camps.data, programmes.data])

  const erreur = camps.error ?? programmes.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!camps.data || !programmes.data) return <Chargement />

  const recherche = texte.trim().toLowerCase()
  // Programmes actifs des camps suivis ou proposés (un camp exclu ne compte plus).
  const tous = programmes.data.filter((p) => p.actif && camp.has(p.camp_id) && camp.get(p.camp_id)!.statut_inclusion !== 'exclu')
  const cherches = tous.filter((p) => !recherche || `${p.nom} ${p.description ?? ''} ${camp.get(p.camp_id)!.nom}`.toLowerCase().includes(recherche))
  const aVerifier = cherches.filter((p) => p.type_a_verifier)
  const base = verifier ? aVerifier : cherches
  const nomCamp = (p: Programme) => camp.get(p.camp_id)!.nom
  const liste = duType(base, type).sort((a, b) =>
    tri === 'prix'
      ? (a.prix_par_nuit == null ? Infinity : Number(a.prix_par_nuit)) - (b.prix_par_nuit == null ? Infinity : Number(b.prix_par_nuit)) ||
        nomCamp(a).localeCompare(nomCamp(b), 'fr')
      : nomCamp(a).localeCompare(nomCamp(b), 'fr') || a.nom.localeCompare(b.nom, 'fr'),
  )
  const visiblesAVerifier = liste.filter((p) => p.type_a_verifier)
  const stats = type && type !== 'aucun' ? medianes.get(type) : null

  const toutConfirmer = async () => {
    const n = visiblesAVerifier.length
    if (
      !(await confirmer({
        titre: `Confirmer le type des ${n} programme${n > 1 ? 's' : ''} affiché${n > 1 ? 's' : ''} ?`,
        message: 'Chacun garde le type proposé par Claude (ou « Pas classé ») et quitte la liste « À vérifier ».',
        libelleOk: 'Tout confirmer',
        danger: false,
      }))
    )
      return
    confirmerTypes.mutate(visiblesAVerifier.map((p) => p.id))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Puces
          libelle="Type de séjour"
          options={OPTIONS_TYPE}
          valeur={type}
          changer={setType}
          tout="Tous les types"
          compte={(t) => duType(base, t).length}
        />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={verifier} onChange={(e) => setVerifier(e.target.checked)} />
          À vérifier seulement
          <span className={`rounded-full px-1.5 text-xs tabular-nums ${aVerifier.length ? 'bg-amber-100 text-amber-900' : 'bg-pierre-100 text-pierre-500'}`}>
            {aVerifier.length}
          </span>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Trier" className={menu} value={tri} onChange={(e) => setTri(e.target.value as Tri)}>
          <option value="camp">Trier par camp</option>
          <option value="prix">Trier par prix par nuit</option>
        </select>
        <input className={`${menu} w-48`} placeholder="Rechercher…" value={texte} onChange={(e) => setTexte(e.target.value)} />
        <span className="text-sm text-pierre-500">
          {liste.length} programme{liste.length > 1 ? 's' : ''}
        </span>
        {ecriture && verifier && visiblesAVerifier.length > 1 && (
          <button className="ml-auto text-sm text-foret-700 underline" onClick={toutConfirmer}>
            Tout confirmer ({visiblesAVerifier.length})
          </button>
        )}
      </div>
      {type && type !== 'aucun' && (
        <p className="text-sm text-pierre-600">
          {nomTypeSejour(type)}, camps comparables : {resumeStats(stats ?? null)}.
        </p>
      )}
      {verifier && (
        <p className="text-sm text-pierre-500">
          Types proposés par Claude d'après le nom et la description : ✓ confirme le type tel quel, le menu le change. « Pas classé » à vérifier = aucun
          des quatre types ne semblait convenir (camp de jour, séjour pour adultes…).
        </p>
      )}

      <div className={`${ui.carte} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="border-b border-pierre-200 text-left text-xs uppercase tracking-wide text-pierre-500">
            <tr>
              <th className="px-3 py-2 font-medium">Camp</th>
              <th className="px-3 py-2 font-medium">Programme</th>
              <th className="px-3 py-2 font-medium">Type de séjour</th>
              <th className="px-3 py-2 text-right font-medium">Durée</th>
              <th className="px-3 py-2 text-right font-medium">Prix</th>
              <th className="px-3 py-2 text-right font-medium">Prix / nuit</th>
              <th className="px-3 py-2 font-medium">Saison du prix</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pierre-100 align-top">
            {liste.map((p) => {
              const c = camp.get(p.camp_id)!
              const ecart = ecartMediane(p, medianes)
              return (
                <tr key={p.id} className="hover:bg-pierre-50">
                  <td className="px-3 py-2">
                    <Link to={lienCamp(c.id, type)} className="font-medium hover:underline">
                      {c.nom}
                    </Link>
                    <div className="text-xs text-pierre-500">{etatCamp(c)}</div>
                  </td>
                  <td className="min-w-56 px-3 py-2">
                    {p.nom}
                    {p.description && (
                      <div className="line-clamp-2 text-xs text-pierre-500" title={p.description}>
                        {p.description}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <ChoixTypeSejour programme={p} ecriture={ecriture} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-pierre-700">
                    {[p.duree_jours ? `${p.duree_jours} j` : null, p.duree_nuits != null ? `${p.duree_nuits} n` : null].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{argent(p.prix)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">
                    {argent(p.prix_par_nuit)}
                    {ecart && (
                      <div className="text-xs font-normal text-pierre-500" title={ecart.titre}>
                        {ecart.court}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-pierre-600">{p.annee ?? '—'}</td>
                </tr>
              )
            })}
            {!liste.length && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-pierre-500">
                  {verifier ? 'Aucun type à vérifier.' : 'Aucun programme.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-pierre-500">
        Écart (sous le prix par nuit) : par rapport à la médiane des programmes du même type chez les camps comparables (leaders et références suivis).
      </p>
    </div>
  )
}

function etatCamp(c: Camp) {
  const morceaux = [c.region]
  if (c.statut_inclusion === 'propose') morceaux.push('proposé')
  else if (!estComparable(c)) morceaux.push('pas un comparable')
  else if (c.categorie === 'leader') morceaux.push('★ leader')
  return morceaux.filter(Boolean).join(' · ')
}
