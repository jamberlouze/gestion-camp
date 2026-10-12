import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { ChoixPostes, ChoixSaisons, MenuCompagnie, MenuSaison, PuceAncien, PucePreDecision, PuceStatut } from './commun'
import { useRh } from './contexte'
import { useAjouterCandidature, useAjouterPersonne } from './donnees'
import { correspond, dateCourte, estAncien, nomAffiche, texteRecherche, viseSaison } from './outils'
import { STATUTS, type Candidature, type Personne, type Statut } from './types'
import { champPetit } from './styles'

/** Filtres de statut : « ouvertes » = il reste quelque chose à faire. */
const FILTRES: { id: string; nom: string; garde: (s: Statut) => boolean }[] = [
  { id: 'ouvertes', nom: 'À faire', garde: (s) => STATUTS.find((x) => x.id === s)!.ouvert },
  ...STATUTS.map((s) => ({ id: s.id, nom: s.nom, garde: (x: Statut) => x === s.id })),
  { id: 'toutes', nom: 'Toutes', garde: () => true },
]

/** Accueil du module : les candidatures, filtrées par saison, statut et compagnie. */
export function Candidatures() {
  const { candidatures, personneParId, embauchesDe, saisonParId, posteParId, ecriture, auj } = useRh()
  const [params, setParams] = useSearchParams()
  const filtre = params.get('statut') ?? 'ouvertes'
  const saison = params.get('saison')
  const compagnie = params.get('compagnie')
  const provenance = params.get('provenance') ?? ''
  const [recherche, setRecherche] = useState('')
  const [ajout, setAjout] = useState(false)
  const naviguer = useNavigate()

  const changer = (cle: string, valeur: string | null) => {
    const p = new URLSearchParams(params)
    if (valeur) p.set(cle, valeur)
    else p.delete(cle)
    setParams(p, { replace: true })
  }

  // Avant le filtre de statut (pour les compteurs).
  const base = useMemo(() => {
    return candidatures
      .filter((c) => {
        const p = personneParId.get(c.personne_id)
        if (!p) return false
        if (saison && !viseSaison(c, saison)) return false
        if (compagnie && c.entreprise_id !== compagnie && !c.poste_ids.some((id) => posteParId.get(id)?.entreprise_id === compagnie)) return false
        const ancien = c.source === 'retour' || estAncien(p, embauchesDe.get(p.id) ?? [], saisonParId)
        if (provenance === 'anciens' && !ancien) return false
        if (provenance === 'nouveaux' && ancien) return false
        if (recherche.trim() && !correspond(texteRecherche(p), recherche)) return false
        return true
      })
      .sort((a, b) => b.recue_le.localeCompare(a.recue_le))
  }, [candidatures, personneParId, saison, compagnie, posteParId, provenance, embauchesDe, saisonParId, recherche])

  const garde = FILTRES.find((f) => f.id === filtre) ?? FILTRES[0]
  const lignes = base.filter((c) => garde.garde(c.statut))
  const compte = (id: string) => base.filter((c) => (FILTRES.find((f) => f.id === id) ?? FILTRES[0]).garde(c.statut)).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <input className={`${champPetit} w-64`} placeholder="Chercher un nom, un courriel…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        <MenuSaison className={champPetit} valeur={saison} changer={(v) => changer('saison', v)} vide="Toutes les saisons" />
        <MenuCompagnie className={champPetit} valeur={compagnie} changer={(v) => changer('compagnie', v)} vide="Toutes les compagnies" />
        <select className={champPetit} value={provenance} onChange={(e) => changer('provenance', e.target.value || null)}>
          <option value="">Nouveaux et anciens</option>
          <option value="nouveaux">Nouveaux seulement</option>
          <option value="anciens">Anciens seulement</option>
        </select>
        <div className="flex-1" />
        {ecriture && (
          <button className={ui.bouton} onClick={() => setAjout(true)}>
            + Candidature
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTRES.map((f) => {
          const n = compte(f.id)
          if (!n && f.id !== filtre && !['ouvertes', 'toutes'].includes(f.id)) return null
          return (
            <button
              key={f.id}
              onClick={() => changer('statut', f.id === 'ouvertes' ? null : f.id)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                f.id === garde.id ? 'border-foret-700 bg-foret-700 text-white' : 'border-pierre-200 bg-white text-pierre-700 hover:bg-pierre-50'
              }`}
            >
              {f.nom} <span className="opacity-70">{n}</span>
            </button>
          )
        })}
      </div>

      {lignes.length === 0 ? (
        <p className="py-8 text-center text-sm text-pierre-500">Aucune candidature.</p>
      ) : (
        <div className={`${ui.carte} overflow-hidden`}>
          <table className="w-full text-sm">
            <thead className="hidden bg-pierre-50 text-left text-xs uppercase tracking-wide text-pierre-500 md:table-header-group">
              <tr>
                <th className="px-3 py-2 font-medium">Personne</th>
                <th className="px-3 py-2 font-medium">Reçue</th>
                <th className="px-3 py-2 font-medium">Saisons</th>
                <th className="px-3 py-2 font-medium">Postes demandés</th>
                <th className="px-3 py-2 font-medium">Tri</th>
                <th className="px-3 py-2 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pierre-100">
              {lignes.map((c) => (
                <LigneCandidature key={c.id} c={c} auj={auj} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ajout && <NouvelleCandidature fermer={() => setAjout(false)} ouvrir={(id) => naviguer(`/rh/c/${id}`)} />}
    </div>
  )
}

function LigneCandidature({ c, auj }: { c: Candidature; auj: string }) {
  const { personneParId, embauchesDe, saisonParId, posteParId, compagnieParId } = useRh()
  const p = personneParId.get(c.personne_id)!
  const ancien = c.source === 'retour' || estAncien(p, embauchesDe.get(p.id) ?? [], saisonParId)
  const postes = c.poste_ids.map((id) => posteParId.get(id)).filter((x) => !!x)
  const decision = c.statut === 'acceptee' && c.poste_id ? posteParId.get(c.poste_id) : undefined
  return (
    <tr className="block px-3 py-2 hover:bg-pierre-50 md:table-row md:p-0">
      <td className="block md:table-cell md:px-3 md:py-2">
        <Link to={`/rh/c/${c.id}`} className="font-medium text-pierre-900 hover:underline">
          {nomAffiche(p)}
        </Link>{' '}
        {ancien && <PuceAncien />}
        {p.ne_pas_reembaucher && <span title={p.raison_ne_pas ?? 'Ne pas réembaucher'}> ⛔</span>}
      </td>
      <td className="inline md:table-cell md:px-3 md:py-2 md:text-pierre-600">
        <span className="text-xs text-pierre-500 md:text-sm">{dateCourte(c.recue_le, auj)}</span>
      </td>
      <td className="inline pl-2 md:table-cell md:px-3 md:py-2">
        <span className="text-xs text-pierre-600">
          {c.saison_ids
            .map((id) => saisonParId.get(id))
            .filter((s) => !!s)
            .sort((a, b) => a.rang - b.rang)
            .map((s) => s.nom)
            .join(', ')}
        </span>
      </td>
      <td className="block text-xs text-pierre-600 md:table-cell md:px-3 md:py-2">
        {decision ? (
          <span className="font-medium text-foret-800">
            ✓ {decision.nom} {compagnieParId.get(decision.entreprise_id)?.abreviation ?? ''}
          </span>
        ) : (
          <>
            {postes
              .slice(0, 2)
              .map((x) => x.nom)
              .join(' · ')}
            {postes.length > 2 && <span className="text-pierre-400"> +{postes.length - 2}</span>}
          </>
        )}
      </td>
      <td className="inline md:table-cell md:px-3 md:py-2">
        <PucePreDecision valeur={c.pre_decision} />
        {c.entrevue_le && <span className="ml-1 text-xs text-violet-700">Entrevue {dateCourte(c.entrevue_le, auj)}</span>}
      </td>
      <td className="inline pl-2 md:table-cell md:px-3 md:py-2">
        <PuceStatut statut={c.statut} />
      </td>
    </tr>
  )
}

/** Ajouter une candidature à la main : une personne connue ou une nouvelle. */
function NouvelleCandidature({ fermer, ouvrir }: { fermer: () => void; ouvrir: (id: string) => void }) {
  const { personnes } = useRh()
  const ajouterPersonne = useAjouterPersonne()
  const ajouterCandidature = useAjouterCandidature()
  const [recherche, setRecherche] = useState('')
  const [personne, setPersonne] = useState<Personne | null>(null)
  const [nouvelle, setNouvelle] = useState({ prenom: '', nom_famille: '', courriel: '', telephone: '' })
  const [saisons, setSaisons] = useState<string[]>([])
  const [postes, setPostes] = useState<string[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  const trouvees = recherche.trim().length >= 2 ? personnes.filter((p) => correspond(texteRecherche(p), recherche)).slice(0, 6) : []
  // Même courriel qu'une fiche existante : on la propose plutôt qu'un doublon.
  const memeCourriel = !personne && nouvelle.courriel.trim() ? personnes.find((p) => p.courriel === nouvelle.courriel.trim().toLowerCase()) : undefined

  const creer = async () => {
    setErreur(null)
    setEnvoi(true)
    try {
      let pid = personne?.id
      if (!pid) {
        if (!nouvelle.prenom.trim()) throw new Error('Le prénom est obligatoire.')
        pid = crypto.randomUUID()
        await ajouterPersonne.mutateAsync({
          id: pid,
          prenom: nouvelle.prenom.trim(),
          nom_famille: nouvelle.nom_famille.trim(),
          courriel: nouvelle.courriel.trim() || null,
          telephone: nouvelle.telephone.trim() || null,
        })
      }
      const id = crypto.randomUUID()
      await ajouterCandidature.mutateAsync({ id, personne_id: pid, source: 'manuel', saison_ids: saisons, poste_ids: postes, recue_le: new Date().toISOString() })
      fermer()
      ouvrir(id)
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Dialogue titre="Nouvelle candidature" fermer={fermer} large>
      <div className="space-y-4 text-sm">
        {personne ? (
          <div className="flex items-center justify-between rounded-lg bg-pierre-50 px-3 py-2">
            <span>
              <strong className="font-medium">{nomAffiche(personne)}</strong>
              {personne.courriel && <span className="text-pierre-500"> · {personne.courriel}</span>}
            </span>
            <button className="text-xs text-pierre-500 underline" onClick={() => setPersonne(null)}>
              Changer
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className={ui.etiquette}>Une personne déjà connue</p>
              <input className={ui.champ} autoFocus placeholder="Nom, courriel…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
              <div className="mt-1 space-y-1">
                {trouvees.map((p) => (
                  <button key={p.id} className="block w-full rounded-md border border-pierre-200 px-2 py-1 text-left hover:bg-pierre-50" onClick={() => setPersonne(p)}>
                    {nomAffiche(p)} {p.courriel && <span className="text-pierre-500">· {p.courriel}</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className={ui.etiquette}>Ou une nouvelle personne</p>
              <div className="grid grid-cols-2 gap-2">
                <input className={ui.champ} placeholder="Prénom" value={nouvelle.prenom} onChange={(e) => setNouvelle({ ...nouvelle, prenom: e.target.value })} />
                <input className={ui.champ} placeholder="Nom de famille" value={nouvelle.nom_famille} onChange={(e) => setNouvelle({ ...nouvelle, nom_famille: e.target.value })} />
              </div>
              <input className={ui.champ} type="email" placeholder="Courriel" value={nouvelle.courriel} onChange={(e) => setNouvelle({ ...nouvelle, courriel: e.target.value })} />
              <input className={ui.champ} placeholder="Téléphone" value={nouvelle.telephone} onChange={(e) => setNouvelle({ ...nouvelle, telephone: e.target.value })} />
              {memeCourriel && (
                <p className="text-amber-700">
                  Ce courriel est déjà celui de {nomAffiche(memeCourriel)}.{' '}
                  <button className="underline" onClick={() => setPersonne(memeCourriel)}>
                    Choisir cette fiche
                  </button>
                </p>
              )}
            </div>
          </div>
        )}
        <div>
          <p className={ui.etiquette}>Saisons demandées</p>
          <ChoixSaisons valeur={saisons} changer={setSaisons} />
        </div>
        <div>
          <p className={ui.etiquette}>Postes demandés</p>
          <ChoixPostes valeur={postes} changer={setPostes} />
        </div>
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex justify-end gap-2">
          <button className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button className={ui.bouton} disabled={envoi || (!personne && !nouvelle.prenom.trim()) || !!memeCourriel} onClick={creer}>
            Ajouter
          </button>
        </div>
      </div>
    </Dialogue>
  )
}
