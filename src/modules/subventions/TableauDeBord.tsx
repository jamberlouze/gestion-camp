import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { messageErreur } from '@/lib/donnees'
import { PuceCompagnie } from '@/lib/PuceCompagnie'
import { ui } from '@/lib/ui'
import { menu, PastilleStatut, PastilleType } from './commun'
import { useCompagnies, useEntreprises, useHeures, useSubventions, useSuivis } from './donnees'
import { anneeFiscaleCourante, argent, dateCourte, heures as formatHeures, libelleAnneeFiscale, STATUTS_SUIVI } from './outils'
import type { StatutSuivi, Subvention, Suivi } from './types'

const FILTRES: { id: string; libelle: string; statuts: StatutSuivi[] }[] = [
  { id: 'demandes', libelle: 'Toutes les demandes', statuts: STATUTS_SUIVI },
  { id: 'en_cours', libelle: 'En cours seulement', statuts: ['en_cours'] },
  { id: 'obtenues', libelle: 'Obtenues seulement', statuts: ['obtenu'] },
  { id: 'refusees', libelle: "Refusées par l'organisme", statuts: ['refuse'] },
]

/**
 * Suivi par année fiscale (1er octobre au 30 septembre) et par compagnie :
 * une ligne par compagnie qui dépose une demande (lignes de suivi des
 * subventions retenues). Une subvention appartient à son année fiscale
 * (fiscal_year : proposée d'après la période financée, sinon la date limite ;
 * modifiable sur la fiche).
 */
export function TableauDeBord() {
  const navigate = useNavigate()
  const subventions = useSubventions()
  const suivis = useSuivis()
  const entreprises = useEntreprises()
  const heures = useHeures()
  const { de } = useCompagnies()
  const [annee, setAnnee] = useState(anneeFiscaleCourante)
  const [entreprise, setEntreprise] = useState('')
  const [filtre, setFiltre] = useState('demandes')

  const annees = useMemo(() => {
    const avecSuivi = new Set((suivis.data ?? []).map((l) => l.grant_id))
    const s = new Set([anneeFiscaleCourante(), ...(subventions.data ?? []).filter((g) => avecSuivi.has(g.id)).map((g) => g.fiscal_year)])
    return [...s].sort((a, b) => b - a)
  }, [subventions.data, suivis.data])

  const donnees = useMemo(() => {
    const carte = new Map((subventions.data ?? []).map((g) => [g.id, g]))
    const deLAnnee = (suivis.data ?? [])
      .map((l) => ({ l, g: carte.get(l.grant_id) }))
      .filter((x): x is { l: Suivi; g: Subvention } => !!x.g && x.g.fiscal_year === annee && (!entreprise || x.l.company_id === entreprise))
    const obtenues = deLAnnee.filter((x) => x.l.status === 'obtenu')
    const somme = (l: typeof deLAnnee, f: (l: Suivi) => number | null) => l.reduce((s, x) => s + Number(f(x.l) ?? 0), 0)
    // Heures investies : notées pour la subvention (toutes compagnies), comptées une fois.
    const ids = new Set(deLAnnee.map((x) => x.g.id))
    const totalHeures = (heures.data ?? []).filter((h) => ids.has(h.grant_id)).reduce((s, h) => s + Number(h.hours), 0)
    const statuts = FILTRES.find((f) => f.id === filtre)!.statuts
    return {
      obtenu: somme(obtenues, (l) => l.amount_granted),
      nbObtenues: obtenues.length,
      demande: somme(deLAnnee, (l) => l.amount_requested),
      recu: somme(deLAnnee, (l) => l.amount_received),
      totalHeures,
      liste: deLAnnee
        .filter((x) => statuts.includes(x.l.status))
        .sort(
          (a, b) =>
            STATUTS_SUIVI.indexOf(a.l.status) - STATUTS_SUIVI.indexOf(b.l.status) ||
            (b.g.deadline_date ?? '').localeCompare(a.g.deadline_date ?? '') ||
            a.g.program_name.localeCompare(b.g.program_name, 'fr') ||
            de(a.l.company_id).ordre - de(b.l.company_id).ordre,
        ),
    }
  }, [subventions.data, suivis.data, heures.data, annee, entreprise, filtre, de])

  const erreur = subventions.error ?? suivis.error ?? entreprises.error ?? heures.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!subventions.data || !suivis.data || !entreprises.data || !heures.data)
    return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

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
          <p className="text-sm text-pierre-500">Demandes obtenues</p>
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
            {donnees.liste.length} demande{donnees.liste.length > 1 ? 's' : ''}
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
          <p className="px-3 py-6 text-center text-sm text-pierre-500">
            Aucune demande pour ces critères. Une subvention retenue (onglet À valider) a une ligne par compagnie qui dépose.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-pierre-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Programme</th>
                  <th className="px-3 py-2 font-medium">Compagnie</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Statut</th>
                  <th className="px-3 py-2 text-right font-medium">Demandé</th>
                  <th className="px-3 py-2 text-right font-medium">Accordé</th>
                  <th className="px-3 py-2 text-right font-medium">Reçu</th>
                  <th className="px-3 py-2 font-medium">Date limite</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pierre-100">
                {donnees.liste.map(({ l, g }) => (
                  <tr key={l.id} className="cursor-pointer hover:bg-pierre-50" onClick={() => navigate(`/subventions/fiche/${g.id}`)}>
                    <td className="px-3 py-2 font-medium">{g.program_name}</td>
                    <td className="px-3 py-2">
                      <PuceCompagnie compagnie={de(l.company_id)} />
                    </td>
                    <td className="px-3 py-2">
                      <PastilleType type={g.grant_type} />
                    </td>
                    <td className="px-3 py-2">
                      <PastilleStatut statut={l.status} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{montant(l.amount_requested)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{montant(l.amount_granted)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{montant(l.amount_received)}</td>
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
