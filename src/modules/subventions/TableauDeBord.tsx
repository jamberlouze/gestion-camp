import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { menu, PastilleStatut, PastilleType } from './commun'
import { useEntreprises, useHeures, useSubventions } from './donnees'
import {
  anneeFiscale,
  anneeFiscaleCourante,
  argent,
  dateCourte,
  dateRattachement,
  entrepriseDe,
  heures as formatHeures,
  libelleAnneeFiscale,
  ORDRE_STATUTS,
} from './outils'
import type { Statut } from './types'

const FILTRES: { id: string; libelle: string; statuts: Statut[] }[] = [
  { id: 'demandes', libelle: 'Demandes (en cours, obtenues, refusées)', statuts: ['en_cours', 'obtenu', 'refuse'] },
  { id: 'obtenues', libelle: 'Obtenues seulement', statuts: ['obtenu'] },
  { id: 'actives', libelle: 'Toutes sauf rejetées et expirées', statuts: ['nouveau', 'a_valider', 'en_cours', 'obtenu', 'refuse'] },
  { id: 'toutes', libelle: 'Toutes', statuts: ORDRE_STATUTS },
]

/**
 * Suivi par année fiscale (1er octobre au 30 septembre) et par entreprise.
 * Une subvention appartient à l'année de son octroi (sinon réception, date
 * limite, découverte) et à l'entreprise qui dépose (sinon celle pour qui
 * elle a été trouvée).
 */
export function TableauDeBord() {
  const navigate = useNavigate()
  const subventions = useSubventions()
  const entreprises = useEntreprises()
  const heures = useHeures()
  const [annee, setAnnee] = useState(anneeFiscaleCourante)
  const [entreprise, setEntreprise] = useState('')
  const [filtre, setFiltre] = useState('demandes')

  const annees = useMemo(() => {
    const s = new Set([anneeFiscaleCourante(), ...(subventions.data ?? []).map((g) => anneeFiscale(dateRattachement(g)))])
    return [...s].sort((a, b) => b - a)
  }, [subventions.data])

  const donnees = useMemo(() => {
    const deLAnnee = (subventions.data ?? []).filter(
      (g) => anneeFiscale(dateRattachement(g)) === annee && (!entreprise || entrepriseDe(g) === entreprise),
    )
    const obtenues = deLAnnee.filter((g) => g.status === 'obtenu')
    const somme = (l: typeof deLAnnee, f: (g: (typeof deLAnnee)[number]) => number | null) => l.reduce((s, g) => s + Number(f(g) ?? 0), 0)
    const ids = new Set(deLAnnee.map((g) => g.id))
    const totalHeures = (heures.data ?? []).filter((h) => ids.has(h.grant_id)).reduce((s, h) => s + Number(h.hours), 0)
    const statuts = FILTRES.find((f) => f.id === filtre)!.statuts
    return {
      obtenu: somme(obtenues, (g) => g.amount_granted),
      nbObtenues: obtenues.length,
      demande: somme(deLAnnee.filter((g) => ['en_cours', 'obtenu', 'refuse'].includes(g.status)), (g) => g.amount_requested),
      recu: somme(deLAnnee, (g) => g.amount_received),
      totalHeures,
      liste: deLAnnee
        .filter((g) => statuts.includes(g.status))
        .sort((a, b) => ORDRE_STATUTS.indexOf(a.status) - ORDRE_STATUTS.indexOf(b.status) || dateRattachement(b).localeCompare(dateRattachement(a))),
    }
  }, [subventions.data, heures.data, annee, entreprise, filtre])

  const erreur = subventions.error ?? entreprises.error ?? heures.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!subventions.data || !entreprises.data || !heures.data)
    return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const nomEntreprise = new Map(entreprises.data.map((e) => [e.id, e.name]))
  const montant = (n: number | null) => (n == null ? <span className="text-pierre-400">—</span> : argent(Number(n)))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Année fiscale" className={menu} value={annee} onChange={(e) => setAnnee(Number(e.target.value))}>
          {annees.map((a) => (
            <option key={a} value={a}>
              Année fiscale {libelleAnneeFiscale(a)}
            </option>
          ))}
        </select>
        <select aria-label="Entreprise" className={menu} value={entreprise} onChange={(e) => setEntreprise(e.target.value)}>
          <option value="">Toutes les entreprises</option>
          {entreprises.data.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-pierre-500">
          1er octobre {annee - 1} au 30 septembre {annee}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={`${ui.carte} p-5`}>
          <p className="text-sm text-pierre-500">Montant total obtenu</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums text-foret-800">{argent(donnees.obtenu)}</p>
        </div>
        <div className={`${ui.carte} p-5`}>
          <p className="text-sm text-pierre-500">Subventions obtenues</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums text-foret-800">{donnees.nbObtenues}</p>
        </div>
      </div>
      <p className="text-sm text-pierre-600">
        Demandé : <b>{argent(donnees.demande)}</b> · Reçu : <b>{argent(donnees.recu)}</b> · Heures investies :{' '}
        <b>{formatHeures(donnees.totalHeures)}</b>
        {donnees.totalHeures > 0 && donnees.recu > 0 && (
          <>
            {' '}
            · Retour : <b>{argent(donnees.recu / donnees.totalHeures)} reçus par heure</b>
          </>
        )}
      </p>

      <div className={ui.carte}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-pierre-100 px-3 py-2">
          <h2 className="text-sm font-semibold">
            {donnees.liste.length} subvention{donnees.liste.length > 1 ? 's' : ''}
          </h2>
          <select aria-label="Statuts affichés" className={menu} value={filtre} onChange={(e) => setFiltre(e.target.value)}>
            {FILTRES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.libelle}
              </option>
            ))}
          </select>
        </div>
        {donnees.liste.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-pierre-500">Aucune subvention pour ces critères.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-pierre-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Programme</th>
                  <th className="px-3 py-2 font-medium">Entreprise</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Statut</th>
                  <th className="px-3 py-2 text-right font-medium">Demandé</th>
                  <th className="px-3 py-2 text-right font-medium">Accordé</th>
                  <th className="px-3 py-2 text-right font-medium">Reçu</th>
                  <th className="px-3 py-2 font-medium">Date limite</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pierre-100">
                {donnees.liste.map((g) => (
                  <tr key={g.id} className="cursor-pointer hover:bg-pierre-50" onClick={() => navigate(`/subventions/fiche/${g.id}`)}>
                    <td className="px-3 py-2 font-medium">{g.program_name}</td>
                    <td className="px-3 py-2 text-pierre-600">{nomEntreprise.get(entrepriseDe(g))}</td>
                    <td className="px-3 py-2">
                      <PastilleType type={g.grant_type} />
                    </td>
                    <td className="px-3 py-2">
                      <PastilleStatut statut={g.status} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{montant(g.amount_requested)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{montant(g.amount_granted)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{montant(g.amount_received)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-pierre-600">{g.deadline_date ? dateCourte(g.deadline_date) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
