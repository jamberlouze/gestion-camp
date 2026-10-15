import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useRh } from './contexte'
import { useValiditeVaj, useVajFaite } from './donneesConformite'
import { ligneVaj, periodeEmbauche, vajAFaire, type PastilleConformite } from './conformite'
import { dateCourte, nomAffiche } from './outils'
import type { Embauche } from './types'

export function PucesConformite({ pastilles }: { pastilles: PastilleConformite[] | undefined }) {
  if (!pastilles?.length) return null
  return (
    <span className="inline-flex flex-wrap gap-1">
      {pastilles.map((x) => (
        <span
          key={x.cle}
          className={`inline-flex whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-medium ${x.ton === 'alerte' ? 'bg-red-50 text-red-800 ring-1 ring-red-200' : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'}`}
        >
          {x.texte}
        </span>
      ))}
    </span>
  )
}

/**
 * VAJ de la saison : qui en a besoin (18 ans ou plus au début, VAJ absente
 * ou échue), lignes à coller (« AAAAMMJJ,Nom,Prénom », comme « Info VAJ »
 * d'Airtable) et « VAJ faite le … » en lot (journal de chaque personne).
 */
export function FenetreVaj({ embauches, titre, fermer }: { embauches: Embauche[]; titre: string; fermer: () => void }) {
  const { personneParId, saisonParId, ecriture, auj } = useRh()
  const validite = useValiditeVaj()
  const faite = useVajFaite()
  const [le, setLe] = useState(auj)
  const [copie, setCopie] = useState<'' | 'ok' | 'manuel'>('')

  // Une ligne par personne (début le plus tôt de ses embauches de la liste).
  const besoins = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of embauches) {
      if (e.statut === 'annulee') continue
      const { debut } = periodeEmbauche(e, saisonParId.get(e.saison_id), auj)
      const avant = m.get(e.personne_id)
      if (!avant || debut < avant) m.set(e.personne_id, debut)
    }
    return [...m]
      .map(([id, debut]) => ({ p: personneParId.get(id)!, debut }))
      .filter(({ p, debut }) => p && vajAFaire(p, debut, validite))
      .sort((a, b) => a.p.nom_complet.localeCompare(b.p.nom_complet, 'fr'))
  }, [embauches, personneParId, saisonParId, auj, validite])
  const [coches, setCoches] = useState<Set<string>>(() => new Set(besoins.map((b) => b.p.id)))
  const choisis = besoins.filter((b) => coches.has(b.p.id))
  const lignes = choisis.map((b) => ligneVaj(b.p)).filter((x): x is string => !!x)
  const texte = lignes.join('\n')

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(texte)
      setCopie('ok')
      setTimeout(() => setCopie(''), 2000)
    } catch {
      setCopie('manuel')
    }
  }

  return (
    <Dialogue titre={`VAJ — ${titre}`} fermer={fermer} large>
      <div className="space-y-3 text-sm">
        <p className="text-pierre-600">
          Personnes de 18 ans ou plus au début de leur embauche, sans VAJ ou avec une VAJ de plus de {validite} ans (réglage). Lignes au format « AAAAMMJJ,Nom,Prénom ».
        </p>
        {besoins.length === 0 ? (
          <p className="rounded-lg bg-foret-50 px-3 py-2 text-foret-800">Personne n'a besoin d'une VAJ pour cette liste.</p>
        ) : (
          <>
            <div className={`${ui.carte} max-h-80 overflow-y-auto`}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-pierre-50 text-left text-xs text-pierre-500">
                  <tr>
                    <th className="w-8 px-3 py-1.5">
                      <input
                        type="checkbox"
                        aria-label="Tout cocher"
                        checked={choisis.length === besoins.length}
                        onChange={(ev) => setCoches(new Set(ev.target.checked ? besoins.map((b) => b.p.id) : []))}
                      />
                    </th>
                    <th className="px-2 py-1.5 font-medium">Nom</th>
                    <th className="px-2 py-1.5 font-medium">Naissance</th>
                    <th className="px-2 py-1.5 font-medium">Dernière VAJ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pierre-100">
                  {besoins.map(({ p }) => (
                    <tr key={p.id}>
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          aria-label={nomAffiche(p)}
                          checked={coches.has(p.id)}
                          onChange={() => {
                            const n = new Set(coches)
                            if (n.has(p.id)) n.delete(p.id)
                            else n.add(p.id)
                            setCoches(n)
                          }}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Link to={`/rh/p/${p.id}`} className="text-pierre-900 hover:underline" onClick={fermer}>
                          {p.nom_complet}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">{p.date_naissance ?? <span className="text-red-700">à demander</span>}</td>
                      <td className="px-2 py-1.5 text-pierre-600">{p.vaj_le ? dateCourte(p.vaj_le) : 'aucune'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className={ui.bouton} disabled={!lignes.length} onClick={copier}>
                {copie === 'ok' ? 'Copié ✓' : lignes.length === 1 ? 'Copier la ligne' : `Copier les ${lignes.length || ''} lignes`.replace('  ', ' ')}
              </button>
              {choisis.length > lignes.length && <span className="text-xs text-red-700">{choisis.length - lignes.length} sans date de naissance (pas dans les lignes).</span>}
            </div>
            {copie === 'manuel' && <textarea readOnly autoFocus rows={Math.min(8, lignes.length)} className={`${ui.champ} font-mono text-xs`} value={texte} onFocus={(ev) => ev.target.select()} />}
            {ecriture && (
              <div className="flex flex-wrap items-center gap-2 border-t border-pierre-100 pt-3">
                <span>VAJ faite le</span>
                <input type="date" className="rounded-lg border border-pierre-300 px-2 py-1.5 text-sm" value={le} max={auj} onChange={(ev) => setLe(ev.target.value)} />
                <button
                  className={ui.boutonSecondaire}
                  disabled={!choisis.length || !le || faite.isPending}
                  onClick={() => faite.mutate({ personnes: choisis.map((b) => b.p.id), le }, { onSuccess: () => setCoches(new Set()) })}
                >
                  {choisis.length === 1 ? 'Noter pour la personne cochée' : `Noter pour les ${choisis.length || ''} personnes cochées`.replace('  ', ' ')}
                </button>
              </div>
            )}
            {faite.error && <p className={ui.erreur}>{messageErreur(faite.error)}</p>}
          </>
        )}
        <div className="flex justify-end">
          <button className={ui.boutonSecondaire} onClick={fermer}>
            Fermer
          </button>
        </div>
      </div>
    </Dialogue>
  )
}
