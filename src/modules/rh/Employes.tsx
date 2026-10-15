import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { PuceCompagnie } from '@/lib/PuceCompagnie'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { MenuCompagnie, MenuSaison, PuceAncien, PuceStatutEmbauche } from './commun'
import { FenetreVaj, PucesConformite } from './ConformiteEmployes'
import { useRh } from './contexte'
import { useConformite } from './donneesConformite'
import { ExportEmployeurD } from './ExportEmployeurD'
import { MenuExporter } from './Exports'
import { FenetreRetour } from './IntentionRetour'
import { correspond, estAncien, saisonParDefaut, texteRecherche } from './outils'
import { STATUTS_EMBAUCHE, type StatutEmbauche } from './types'
import { champPetit } from './styles'

/** Les embauches d'une saison : qui travaille, à quel poste, où en est son dossier. */
export function Employes() {
  const { saisons, embauches, personneParId, posteParId, compagnieParId, saisonParId, embauchesDe, compagnies, ecriture, paie, auj } = useRh()
  const [params, setParams] = useSearchParams()
  const saison = params.get('saison') || saisonParDefaut(saisons, embauches, auj)
  const compagnie = params.get('compagnie')
  const statut = params.get('statut') as StatutEmbauche | 'actives' | null
  const genre = params.get('genre')
  const regler = params.get('regler') === '1'
  const [recherche, setRecherche] = useState('')
  const [retour, setRetour] = useState(false)
  const [fenetre, setFenetre] = useState<'vaj' | 'employeur_d' | null>(null)

  const changer = (cle: string, valeur: string | null) => {
    const p = new URLSearchParams(params)
    if (valeur) p.set(cle, valeur)
    else p.delete(cle)
    setParams(p, { replace: true })
  }

  // Dossiers d'embauche reçus par la page publique, à valider, par saison.
  const recus = new Map<string, number>()
  for (const e of embauches) if (e.statut === 'dossier_recu') recus.set(e.saison_id, (recus.get(e.saison_id) ?? 0) + 1)

  const rang = saison ? saisonParId.get(saison)?.rang : undefined
  const base = embauches.filter((e) => {
    if (e.saison_id !== saison) return false
    if (compagnie && e.entreprise_id !== compagnie) return false
    if (genre && e.genre !== genre) return false
    const p = personneParId.get(e.personne_id)
    if (!p) return false
    return !recherche.trim() || correspond(texteRecherche(p), recherche)
  })
  const garde = (s: StatutEmbauche) => (!statut || statut === 'actives' ? s !== 'annulee' : s === statut)
  // Saison et compagnie choisies : conformité et exports (sans les autres filtres).
  const deLaSaison = embauches.filter((e) => e.saison_id === saison && (!compagnie || e.entreprise_id === compagnie))
  const conformite = useConformite(deLaSaison)
  const nAregler = base.filter((e) => e.statut !== 'annulee' && conformite.parEmbauche.get(e.id)?.length).length
  const s = saison ? saisonParId.get(saison) : undefined
  const nomCompagnie = compagnie ? (compagnieParId.get(compagnie)?.nom ?? null) : null
  const titre = [s?.nom, nomCompagnie].filter(Boolean).join(' · ')

  // Tri : compagnie (ordre du référentiel), poste, nom.
  const ordreCompagnie = new Map(compagnies.map((c) => [c.id, c.ordre]))
  const lignes = base.filter((e) => garde(e.statut) && (!regler || !!conformite.parEmbauche.get(e.id)?.length)).toSorted((a, b) => {
    const pa = a.poste_id ? posteParId.get(a.poste_id) : undefined
    const pb = b.poste_id ? posteParId.get(b.poste_id) : undefined
    return (
      (ordreCompagnie.get(a.entreprise_id ?? '') ?? 99) - (ordreCompagnie.get(b.entreprise_id ?? '') ?? 99) ||
      (pa?.ordre ?? 999) - (pb?.ordre ?? 999) ||
      personneParId.get(a.personne_id)!.nom_complet.localeCompare(personneParId.get(b.personne_id)!.nom_complet, 'fr')
    )
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <MenuSaison className={champPetit} valeur={saison} changer={(v) => changer('saison', v)} />
        <MenuCompagnie className={champPetit} valeur={compagnie} changer={(v) => changer('compagnie', v)} vide="Toutes les compagnies" />
        <select className={champPetit} value={genre ?? ''} onChange={(e) => changer('genre', e.target.value || null)}>
          <option value="">Employés et bénévoles</option>
          <option value="emploi">Employés</option>
          <option value="benevolat">Bénévoles</option>
        </select>
        <input className={`${champPetit} w-64`} placeholder="Chercher un nom…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        <div className="flex-1" />
        {ecriture && (
          <button className={ui.boutonSecondaire} onClick={() => setRetour(true)}>
            Intention de retour…
          </button>
        )}
        {s && <MenuExporter embauches={deLaSaison} titre={titre} ouvrirVaj={() => setFenetre('vaj')} ouvrirEmployeurD={paie.lecture ? () => setFenetre('employeur_d') : null} />}
      </div>

      {recus.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>Dossiers d'embauche reçus, à valider :</span>
          {[...recus]
            .sort(([a], [b]) => (saisonParId.get(a)?.rang ?? 0) - (saisonParId.get(b)?.rang ?? 0))
            .map(([id, n]) => (
              <button
                key={id}
                className="rounded-full border border-amber-300 bg-white px-2.5 py-0.5 text-xs font-medium hover:bg-amber-100"
                onClick={() => {
                  const p = new URLSearchParams(params)
                  p.set('saison', id)
                  p.set('statut', 'dossier_recu')
                  setParams(p, { replace: true })
                }}
              >
                {saisonParId.get(id)?.nom} · {n}
              </button>
            ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {[{ id: 'actives', nom: 'Toutes (sans les annulées)' }, ...STATUTS_EMBAUCHE].map((f) => {
          const n = base.filter((e) => (f.id === 'actives' ? e.statut !== 'annulee' : e.statut === f.id)).length
          const actif = (statut ?? 'actives') === f.id
          if (!n && !actif && f.id !== 'actives') return null
          return (
            <button
              key={f.id}
              onClick={() => changer('statut', f.id === 'actives' ? null : f.id)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${actif ? 'border-foret-700 bg-foret-700 text-white' : 'border-pierre-200 bg-white text-pierre-700 hover:bg-pierre-50'}`}
            >
              {f.nom} <span className="opacity-70">{n}</span>
            </button>
          )
        })}
        <button
          onClick={() => changer('regler', regler ? null : '1')}
          aria-pressed={regler}
          title="Dossier, contrat, consentement parental, VAJ, premiers soins, carte SN"
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${regler ? 'border-red-700 bg-red-700 text-white' : 'border-red-200 bg-white text-red-800 hover:bg-red-50'}`}
        >
          À régler <span className="opacity-70">{conformite.pret ? nAregler : '…'}</span>
        </button>
      </div>
      {conformite.erreur && <p className={ui.erreur}>{messageErreur(conformite.erreur)}</p>}

      {lignes.length === 0 ? (
        <p className="py-8 text-center text-sm text-pierre-500">Aucune embauche pour cette saison. Une embauche se crée en acceptant une candidature.</p>
      ) : (
        <div className={`${ui.carte} overflow-x-auto`}>
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-pierre-50 text-left text-xs uppercase tracking-wide text-pierre-500">
              <tr>
                <th className="px-3 py-2 font-medium">Nom</th>
                <th className="px-3 py-2 font-medium">Nom de camp</th>
                <th className="px-3 py-2 font-medium">Poste</th>
                <th className="px-3 py-2 font-medium">Échelon</th>
                <th className="px-3 py-2 font-medium">Paie</th>
                <th className="px-3 py-2 font-medium">Dossier</th>
                <th className="px-3 py-2 font-medium">À régler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pierre-100">
              {lignes.map((e) => {
                const p = personneParId.get(e.personne_id)!
                const poste = e.poste_id ? posteParId.get(e.poste_id) : undefined
                const c = e.entreprise_id ? compagnieParId.get(e.entreprise_id) : undefined
                const paieComplete = !!(e.remuneration && e.taux !== null && e.vacances && e.type_employe)
                return (
                  <tr key={e.id} className="hover:bg-pierre-50">
                    <td className="px-3 py-2">
                      <Link to={`/rh/p/${p.id}`} className="font-medium text-pierre-900 hover:underline">
                        {p.nom_complet}
                      </Link>{' '}
                      {estAncien(p, embauchesDe.get(p.id) ?? [], saisonParId, rang) && <PuceAncien />}
                      {e.genre === 'benevolat' && <span className="ml-1 rounded-full bg-teal-50 px-1.5 py-0.5 text-[11px] font-medium text-teal-800 ring-1 ring-teal-200">Bénévole</span>}
                    </td>
                    <td className="px-3 py-2 text-pierre-700">{p.surnom}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex flex-wrap items-center gap-1">
                        {poste?.nom ?? <span className="text-pierre-400">{e.genre === 'benevolat' ? '—' : 'À préciser'}</span>}
                        {c && <PuceCompagnie compagnie={c} court />}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-pierre-700">{e.echelon ?? ''}</td>
                    <td className="px-3 py-2">
                      {e.genre === 'benevolat' ? (
                        <span className="text-pierre-400">—</span>
                      ) : paieComplete ? (
                        <span className="text-foret-700">✓</span>
                      ) : (
                        <span className="text-xs text-amber-700">À compléter</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <PuceStatutEmbauche statut={e.statut} />
                    </td>
                    <td className="px-3 py-2">
                      <PucesConformite pastilles={conformite.parEmbauche.get(e.id)} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-pierre-500">{lignes.length} personne(s).</p>
      {retour && <FenetreRetour saisonSource={saison} fermer={() => setRetour(false)} />}
      {fenetre === 'vaj' && <FenetreVaj embauches={deLaSaison} titre={titre} fermer={() => setFenetre(null)} />}
      {fenetre === 'employeur_d' && s && (
        <ExportEmployeurD embauches={deLaSaison} titre={titre} saisonNom={s.nom} compagnieNom={nomCompagnie} fermer={() => setFenetre(null)} />
      )}
    </div>
  )
}
