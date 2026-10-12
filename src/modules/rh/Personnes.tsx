import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useRh } from './contexte'
import { useAjouterPersonne } from './donnees'
import { correspond, nomAffiche, texteRecherche } from './outils'
import { champPetit } from './styles'

const PAR_PAGE = 100

/** Toutes les personnes connues : candidats, employés, anciens. */
export function Personnes() {
  const { personnes, embauchesDe, candidaturesDe, saisonParId, ecriture } = useRh()
  const [recherche, setRecherche] = useState('')
  const [filtre, setFiltre] = useState<'' | 'employes' | 'jamais' | 'ne_pas'>('')
  const [nombre, setNombre] = useState(PAR_PAGE)
  const [ajout, setAjout] = useState(false)

  const lignes = useMemo(() => {
    return personnes
      .map((p) => {
        const emb = (embauchesDe.get(p.id) ?? []).filter((e) => e.statut !== 'annulee')
        const derniere = emb.map((e) => saisonParId.get(e.saison_id)).filter((s) => !!s).sort((a, b) => b.rang - a.rang)[0]
        return { p, derniere, candidatures: (candidaturesDe.get(p.id) ?? []).length, embauches: emb.length }
      })
      .filter(({ p, embauches }) => {
        if (filtre === 'employes' && !embauches) return false
        if (filtre === 'jamais' && embauches) return false
        if (filtre === 'ne_pas' && !p.ne_pas_reembaucher) return false
        return !recherche.trim() || correspond(texteRecherche(p), recherche)
      })
  }, [personnes, embauchesDe, candidaturesDe, saisonParId, filtre, recherche])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <input className={`${champPetit} w-64`} placeholder="Chercher un nom, un courriel, un téléphone…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        <select className={champPetit} value={filtre} onChange={(e) => setFiltre(e.target.value as typeof filtre)}>
          <option value="">Tout le monde</option>
          <option value="employes">Déjà embauchés</option>
          <option value="jamais">Jamais embauchés</option>
          <option value="ne_pas">Ne pas réembaucher</option>
        </select>
        <div className="flex-1" />
        {ecriture && (
          <button className={ui.bouton} onClick={() => setAjout(true)}>
            + Personne
          </button>
        )}
      </div>

      <div className={`${ui.carte} overflow-x-auto`}>
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-pierre-50 text-left text-xs uppercase tracking-wide text-pierre-500">
            <tr>
              <th className="px-3 py-2 font-medium">Nom</th>
              <th className="px-3 py-2 font-medium">Nom de camp</th>
              <th className="px-3 py-2 font-medium">Courriel</th>
              <th className="px-3 py-2 font-medium">Dernière embauche</th>
              <th className="px-3 py-2 font-medium">Candidatures</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pierre-100">
            {lignes.slice(0, nombre).map(({ p, derniere, candidatures }) => (
              <tr key={p.id} className="hover:bg-pierre-50">
                <td className="px-3 py-2">
                  <Link to={`/rh/p/${p.id}`} className="font-medium text-pierre-900 hover:underline">
                    {p.nom_complet}
                  </Link>
                  {p.ne_pas_reembaucher && <span title={p.raison_ne_pas ?? 'Ne pas réembaucher'}> ⛔</span>}
                </td>
                <td className="px-3 py-2 text-pierre-700">{p.surnom}</td>
                <td className="px-3 py-2 text-pierre-600">{p.courriel}</td>
                <td className="px-3 py-2 text-pierre-700">{derniere?.nom}</td>
                <td className="px-3 py-2 text-pierre-600">{candidatures || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {lignes.length === 0 && <p className="py-8 text-center text-sm text-pierre-500">Personne.</p>}
      </div>
      <div className="flex items-center gap-3 text-xs text-pierre-500">
        <span>{lignes.length} personne(s).</span>
        {lignes.length > nombre && (
          <button className="underline" onClick={() => setNombre(nombre + PAR_PAGE * 5)}>
            Voir plus
          </button>
        )}
      </div>
      {ajout && <NouvellePersonne fermer={() => setAjout(false)} />}
    </div>
  )
}

function NouvellePersonne({ fermer }: { fermer: () => void }) {
  const { personnes } = useRh()
  const ajouter = useAjouterPersonne()
  const naviguer = useNavigate()
  const [f, setF] = useState({ prenom: '', nom_famille: '', surnom: '', courriel: '', telephone: '' })
  const memeCourriel = f.courriel.trim() ? personnes.find((p) => p.courriel === f.courriel.trim().toLowerCase()) : undefined
  const champ = (cle: keyof typeof f, placeholder: string, type = 'text') => (
    <input className={ui.champ} type={type} placeholder={placeholder} value={f[cle]} onChange={(e) => setF({ ...f, [cle]: e.target.value })} />
  )
  return (
    <Dialogue titre="Nouvelle personne" fermer={fermer}>
      <form
        className="space-y-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault()
          const id = crypto.randomUUID()
          ajouter.mutate(
            {
              id,
              prenom: f.prenom.trim(),
              nom_famille: f.nom_famille.trim(),
              surnom: f.surnom.trim() || null,
              courriel: f.courriel.trim() || null,
              telephone: f.telephone.trim() || null,
            },
            {
              onSuccess: () => {
                fermer()
                naviguer(`/rh/p/${id}`)
              },
            },
          )
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          {champ('prenom', 'Prénom')}
          {champ('nom_famille', 'Nom de famille')}
        </div>
        {champ('surnom', 'Nom de camp')}
        {champ('courriel', 'Courriel', 'email')}
        {champ('telephone', 'Téléphone')}
        {memeCourriel && (
          <p className="text-amber-700">
            Ce courriel est déjà celui de{' '}
            <Link className="underline" to={`/rh/p/${memeCourriel.id}`} onClick={fermer}>
              {nomAffiche(memeCourriel)}
            </Link>
            .
          </p>
        )}
        {ajouter.error && <p className={ui.erreur}>{messageErreur(ajouter.error)}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button className={ui.bouton} disabled={!f.prenom.trim() || !!memeCourriel || ajouter.isPending}>
            Ajouter
          </button>
        </div>
      </form>
    </Dialogue>
  )
}
