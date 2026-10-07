import { Fragment, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { messageErreur } from '@/lib/donnees'
import { IconeTableur } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { useTitreImpression } from '@/lib/useTitreImpression'
import { ChoixPeriode } from './commun'
import {
  nomEmploye,
  useEmployesFeuille,
  useHeuresEmployes,
  useNoterEmploye,
  useNotesEmployes,
  useEntreprises,
  useSaisirEmploye,
  type EmployeFeuille,
  type Entreprise,
} from './donneesEmployes'
import { Case } from './Feuille'
import { menu, usePeriode } from './outils'
import { aujourdhui, depuisIso, finPeriode, formatHeures, jourCourt, joursPeriode, JOURS_COURTS, libellePeriode } from './periodes'

/** Filtres « secteur » et « compagnie » : '' = tous, SANS = sans secteur ou sans compagnie. */
const SANS = '-'
const libelleSecteur = (s: string | null) => s ?? 'Sans secteur'

/** Une ligne = un employé pour une compagnie (null : employé actif sans compagnie, rien à saisir). */
interface Ligne {
  cle: string
  employe: EmployeFeuille
  entreprise: Entreprise | null
  parJour: Map<string, number>
  sem1: number
  sem2: number
  total: number
  note: string
}

/**
 * Feuille partagée des employés (hors direction) : toute la direction voit
 * et remplit les heures de tout le monde, une ligne par employé et par
 * compagnie (deux compagnies dans la même paie = deux lignes) et une
 * colonne par jour de la période, comme l'ancien Google Sheets. Un seul
 * nombre d'heures par jour (pas de vacances ni de maladie). Filtres par
 * secteur et par compagnie (réglés dans le référentiel).
 */
export function FeuilleEmployes() {
  const [debut, setDebut] = usePeriode()
  const [params, setParams] = useSearchParams()
  const secteur = params.get('secteur') ?? ''
  const compagnie = params.get('compagnie') ?? ''
  const choisir = (cle: 'secteur' | 'compagnie', v: string) =>
    setParams(
      (avant) => {
        const suivants = new URLSearchParams(avant)
        if (v) suivants.set(cle, v)
        else suivants.delete(cle)
        return suivants
      },
      { replace: true },
    )
  const [recherche, setRecherche] = useState('')
  const [avecHeures, setAvecHeures] = useState(false)

  const employes = useEmployesFeuille()
  const entreprises = useEntreprises()
  const heures = useHeuresEmployes(debut)
  const notes = useNotesEmployes(debut)
  const saisir = useSaisirEmploye(debut)
  const noter = useNoterEmploye(debut)
  const [erreurNote, setErreurNote] = useState<string | null>(null)

  const nomCompagnie =
    compagnie === SANS ? 'Sans compagnie' : (entreprises.data?.find((x) => x.id === compagnie)?.nom ?? null)
  const sousTitre = [secteur ? (secteur === SANS ? 'Sans secteur' : secteur) : null, compagnie ? nomCompagnie : null]
    .filter(Boolean)
    .map((t) => ` - ${t}`)
    .join('')
  const titre = `Heures des employés${sousTitre} - ${libellePeriode(debut)}`
  useTitreImpression(employes.data && entreprises.data ? titre : null)

  const jours = joursPeriode(debut)
  const milieu = jours[7]

  // Toutes les lignes de la période (avant les filtres) : pour chaque employé, une ligne par compagnie
  // assignée (s'il est actif) ou qui a des heures ou une note ; un employé actif sans compagnie a une
  // ligne vide pour le signaler.
  const toutes = useMemo(() => {
    if (!employes.data || !entreprises.data || !heures.data || !notes.data) return null
    const parCompagnie = new Map(entreprises.data.map((x) => [x.id, x]))
    const parLigne = new Map<string, Map<string, number>>()
    for (const h of heures.data) {
      const cle = `${h.employe_id}|${h.entreprise_id}`
      if (!parLigne.has(cle)) parLigne.set(cle, new Map())
      parLigne.get(cle)!.set(h.jour, h.heures)
    }
    const noteDe = new Map(notes.data.map((n) => [`${n.employe_id}|${n.entreprise_id}`, n.note]))
    const avecDonnees = (employeId: string) =>
      [...heures.data.filter((h) => h.employe_id === employeId), ...notes.data.filter((n) => n.employe_id === employeId)].map(
        (x) => x.entreprise_id,
      )

    const resultat: Ligne[] = []
    for (const e of employes.data) {
      const ids = new Set([...(e.actif ? e.entreprise_ids.filter((id) => parCompagnie.get(id)?.actif) : []), ...avecDonnees(e.id)])
      const compagnies = [...ids].map((id) => parCompagnie.get(id)).filter((x): x is Entreprise => !!x)
      if (!compagnies.length) {
        if (e.actif) resultat.push({ cle: `${e.id}|`, employe: e, entreprise: null, parJour: new Map(), sem1: 0, sem2: 0, total: 0, note: '' })
        continue
      }
      for (const x of compagnies) {
        const cle = `${e.id}|${x.id}`
        const parJour = parLigne.get(cle) ?? new Map<string, number>()
        let sem1 = 0
        let sem2 = 0
        for (const [jour, h] of parJour) {
          if (jour < milieu) sem1 += h
          else sem2 += h
        }
        resultat.push({ cle, employe: e, entreprise: x, parJour, sem1, sem2, total: sem1 + sem2, note: noteDe.get(cle) ?? '' })
      }
    }
    return resultat.sort(
      (a, b) =>
        (a.employe.secteur == null ? 1 : 0) - (b.employe.secteur == null ? 1 : 0) ||
        (a.employe.secteur ?? '').localeCompare(b.employe.secteur ?? '', 'fr') ||
        nomEmploye(a.employe).localeCompare(nomEmploye(b.employe), 'fr') ||
        a.employe.id.localeCompare(b.employe.id) ||
        (a.entreprise?.ordre ?? 0) - (b.entreprise?.ordre ?? 0) ||
        (a.entreprise?.nom ?? '').localeCompare(b.entreprise?.nom ?? '', 'fr'),
    )
  }, [employes.data, entreprises.data, heures.data, notes.data, milieu])

  const erreur = employes.error ?? entreprises.error ?? heures.error ?? notes.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!toutes) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const secteurs = [...new Set(toutes.map((l) => l.employe.secteur).filter((s): s is string => !!s))]
  const aSansSecteur = toutes.some((l) => !l.employe.secteur)
  const compagnies = (entreprises.data ?? []).filter((x) => toutes.some((l) => l.entreprise?.id === x.id))
  const aSansCompagnie = toutes.some((l) => !l.entreprise)
  const mots = recherche.trim().toLocaleLowerCase('fr')
  const lignes = toutes.filter((l) => {
    const e = l.employe
    if (secteur === SANS ? e.secteur : secteur && e.secteur !== secteur) return false
    if (compagnie === SANS ? l.entreprise : compagnie && l.entreprise?.id !== compagnie) return false
    if (avecHeures && !l.total && !l.note) return false
    if (mots && ![e.surnom, e.nom_complet, e.poste].some((t) => t?.toLocaleLowerCase('fr').includes(mots))) return false
    return true
  })
  // Regroupées par secteur seulement quand on les voit tous.
  const groupes: { secteur: string | null; lignes: Ligne[] }[] = []
  for (const l of lignes) {
    const dernier = groupes[groupes.length - 1]
    if (secteur === '' && (!dernier || dernier.secteur !== l.employe.secteur)) groupes.push({ secteur: l.employe.secteur, lignes: [l] })
    else if (dernier) dernier.lignes.push(l)
    else groupes.push({ secteur: null, lignes: [l] })
  }

  const totalJour = (jour: string) => lignes.reduce((s, l) => s + (l.parJour.get(jour) ?? 0), 0)
  const somme = (f: (l: Ligne) => number) => lignes.reduce((s, l) => s + f(l), 0)
  // Total par compagnie (pour la paie), quand plusieurs compagnies sont affichées.
  const parCompagnie = (entreprises.data ?? [])
    .map((x) => ({ nom: x.nom, total: lignes.filter((l) => l.entreprise?.id === x.id).reduce((s, l) => s + l.total, 0) }))
    .filter((x) => x.total)
  const auj = aujourdhui()
  const fond = (jour: string) => (jour === auj ? 'bg-foret-50' : depuisIso(jour).getDay() % 6 === 0 ? 'bg-pierre-50' : '')
  const coupure = (i: number) => (i === 7 ? 'border-l-2 border-pierre-300' : '')
  let numero = 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <ChoixPeriode debut={debut} onChange={setDebut} />
        <div className="flex flex-wrap items-center gap-2">
          <button className={ui.boutonSecondaire} onClick={() => exporter(debut, jours, lignes)} disabled={!lignes.length}>
            <IconeTableur className="size-4" />
            Exporter
          </button>
          <button className={ui.boutonSecondaire} onClick={() => window.print()}>
            Imprimer
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 print:hidden">
        <select aria-label="Secteur" className={menu} value={secteur} onChange={(e) => choisir('secteur', e.target.value)}>
          <option value="">Tous les secteurs</option>
          {secteurs.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          {aSansSecteur && <option value={SANS}>Sans secteur</option>}
          {/* Secteur de l'adresse qui n'existe plus : reste choisi, liste vide. */}
          {secteur && secteur !== SANS && !secteurs.includes(secteur) && <option value={secteur}>{secteur}</option>}
        </select>
        <select aria-label="Compagnie" className={menu} value={compagnie} onChange={(e) => choisir('compagnie', e.target.value)}>
          <option value="">Toutes les compagnies</option>
          {compagnies.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nom}
            </option>
          ))}
          {aSansCompagnie && <option value={SANS}>Sans compagnie</option>}
          {compagnie && compagnie !== SANS && !compagnies.some((x) => x.id === compagnie) && (
            <option value={compagnie}>{nomCompagnie ?? 'Compagnie retirée'}</option>
          )}
        </select>
        <input
          type="search"
          aria-label="Chercher un employé"
          placeholder="Chercher un employé…"
          className={`${menu} w-56`}
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-pierre-700">
          <input type="checkbox" checked={avecHeures} onChange={(e) => setAvecHeures(e.target.checked)} />
          Seulement ceux qui ont des heures
        </label>
        <Link to="/referentiel/employes" className="text-sm text-foret-700 underline">
          Gérer les employés (secteurs, compagnies)
        </Link>
      </div>

      <div className="hidden print:block">
        <h2 className="text-lg font-semibold">Heures des employés{sousTitre}</h2>
        <p className="text-sm">Période du {libellePeriode(debut)}</p>
      </div>

      {erreurNote && <p className={ui.erreur}>{erreurNote}</p>}

      {!toutes.length ? (
        <p className={`${ui.carte} px-4 py-8 text-center text-sm text-pierre-500`}>
          Aucun employé actif dans le référentiel.{' '}
          <Link to="/referentiel/employes" className="text-foret-700 underline">
            Ajouter des employés
          </Link>
        </p>
      ) : !lignes.length ? (
        <p className={`${ui.carte} px-4 py-8 text-center text-sm text-pierre-500`}>Aucun employé ne correspond aux filtres.</p>
      ) : (
        <div className={`${ui.carte} overflow-x-auto`}>
          <table className="w-full min-w-[66rem] text-sm">
            <thead>
              <tr className="border-b border-pierre-200 text-xs text-pierre-500">
                <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-semibold text-pierre-800">Employé</th>
                {jours.map((j, i) => (
                  <th
                    key={j}
                    className={`px-0.5 py-2 text-center font-medium ${fond(j)} ${coupure(i)} ${j === auj ? 'text-foret-800' : ''}`}
                  >
                    <span className="block">{JOURS_COURTS[depuisIso(j).getDay()]}</span>
                    <span className="block">{depuisIso(j).getDate()}</span>
                  </th>
                ))}
                <th className="border-l-2 border-pierre-300 px-2 py-2 text-right font-medium">Sem. 1</th>
                <th className="px-2 py-2 text-right font-medium">Sem. 2</th>
                <th className="px-2 py-2 text-right font-semibold text-pierre-800">Total</th>
                <th className="px-3 py-2 text-left font-medium">Note de paie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pierre-100">
              {groupes.map((g) => (
                <Fragment key={g.secteur ?? SANS}>
                  {secteur === '' && (
                    <tr className="bg-pierre-50">
                      {/* Titre dans la colonne figée : reste visible quand la grille défile. */}
                      <th className="sticky left-0 z-10 bg-pierre-50 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-pierre-600">
                        {libelleSecteur(g.secteur)}
                      </th>
                      <td colSpan={jours.length + 4} />
                    </tr>
                  )}
                  {g.lignes.map((l) => {
                    const n = numero++
                    const e = l.employe
                    const details = [e.nom_complet ? e.surnom : null, e.poste].filter(Boolean).join(' · ')
                    return (
                      <tr key={l.cle} className="break-inside-avoid">
                        <th className="sticky left-0 z-10 min-w-40 bg-white px-3 py-1 text-left font-normal whitespace-nowrap">
                          <span className="block font-medium text-pierre-900">
                            {nomEmploye(e)}
                            {!e.actif && <span className="ml-1.5 text-xs font-normal text-pierre-400">(inactif)</span>}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-pierre-500">
                            {l.entreprise ? (
                              <span title={l.entreprise.nom} className="rounded-full bg-foret-100 px-1.5 py-px font-medium text-foret-800">
                                {l.entreprise.abreviation ?? l.entreprise.nom}
                              </span>
                            ) : (
                              <Link to="/referentiel/employes" className="rounded-full bg-amber-100 px-1.5 py-px font-medium text-amber-800 print:hidden">
                                Aucune compagnie
                              </Link>
                            )}
                            {details}
                          </span>
                        </th>
                        {jours.map((j, i) => (
                          <td key={j} className={`px-0.5 py-1 text-center ${fond(j)} ${coupure(i)}`}>
                            <Case
                              etroite
                              modifiable={!!l.entreprise}
                              ligne={n}
                              colonne={i}
                              valeur={l.parJour.get(j) ?? 0}
                              libelle={`${nomEmploye(e)}${l.entreprise ? `, ${l.entreprise.nom}` : ''}, ${jourCourt(j)}`}
                              onSaisir={(h) => l.entreprise && saisir.mutate({ employeId: e.id, entrepriseId: l.entreprise.id, jour: j, heures: h })}
                            />
                          </td>
                        ))}
                        <td className="border-l-2 border-pierre-300 px-2 py-1 text-right tabular-nums text-pierre-700">
                          {formatHeures(l.sem1)}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-pierre-700">{formatHeures(l.sem2)}</td>
                        <td className="px-2 py-1 text-right font-semibold tabular-nums">{formatHeures(l.total)}</td>
                        <td className="px-3 py-1">
                          {l.entreprise && (
                            <CaseNote
                              valeur={l.note}
                              libelle={`Note de paie, ${nomEmploye(e)}, ${l.entreprise.nom}`}
                              onEnregistrer={(note) =>
                                noter.mutate(
                                  { employeId: e.id, entrepriseId: l.entreprise!.id, note },
                                  { onSuccess: () => setErreurNote(null), onError: (err) => setErreurNote(messageErreur(err)) },
                                )
                              }
                            />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </Fragment>
              ))}
              <tr className="bg-pierre-50 font-semibold">
                <th className="sticky left-0 z-10 bg-pierre-50 px-3 py-1.5 text-left">
                  Total
                </th>
                {jours.map((j, i) => (
                  <td key={j} className={`px-0.5 py-1.5 text-center tabular-nums ${coupure(i)}`}>
                    {totalJour(j) ? formatHeures(totalJour(j)) : ''}
                  </td>
                ))}
                <td className="border-l-2 border-pierre-300 px-2 py-1.5 text-right tabular-nums">{formatHeures(somme((l) => l.sem1))}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatHeures(somme((l) => l.sem2))}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatHeures(somme((l) => l.total))}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {parCompagnie.length > 1 && (
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-pierre-700">
          <span className="font-semibold">Total par compagnie</span>
          {parCompagnie.map((x) => (
            <span key={x.nom}>
              {x.nom} : <b className="tabular-nums">{formatHeures(x.total)} h</b>
            </span>
          ))}
        </p>
      )}
      <p className="text-xs text-pierre-500 print:hidden">
        Feuille partagée : toute la direction voit et modifie ces heures. Saisie au quart d’heure (7,5 ou 7h30) ; Entrée
        passe à la ligne suivante, Tab au jour suivant. Un employé qui travaille pour deux compagnies a une ligne pour chacune.
      </p>
    </div>
  )
}

/** Note de paie : enregistrée en quittant la case. */
function CaseNote({ valeur, libelle, onEnregistrer }: { valeur: string; libelle: string; onEnregistrer: (note: string) => void }) {
  const [texte, setTexte] = useState(valeur)
  const [enSaisie, setEnSaisie] = useState(false)
  // Valeur venue de la base (quelqu'un d'autre, relecture…).
  const [precedente, setPrecedente] = useState(valeur)
  if (precedente !== valeur) {
    setPrecedente(valeur)
    if (!enSaisie) setTexte(valeur)
  }
  return (
    <input
      aria-label={libelle}
      title={texte || undefined}
      className="w-36 rounded-md border border-pierre-200 bg-white px-2 py-1 text-sm hover:border-pierre-300 focus:border-foret-600 focus:outline-none focus:ring-2 focus:ring-foret-600/20"
      value={texte}
      onFocus={() => setEnSaisie(true)}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={() => {
        setEnSaisie(false)
        if (texte.trim() !== valeur.trim()) onEnregistrer(texte)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setTexte(valeur)
          setEnSaisie(false)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

/** CSV pour Excel (séparateur « ; », virgule décimale, BOM pour les accents), lignes affichées seulement. */
function exporter(debut: string, jours: string[], lignes: Ligne[]) {
  const nombre = (n: number) => (n ? String(Math.round(n * 100) / 100).replace('.', ',') : '')
  const champ = (t: string | null) => (t && /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : (t ?? ''))
  const entete = ['Employé', 'Nom de camp', 'Compagnie', 'Secteur', 'Poste', ...jours, 'Semaine 1', 'Semaine 2', 'Total', 'Note']
  const rangees = lignes.map((l) => [
    champ(l.employe.nom_complet ?? l.employe.surnom),
    champ(l.employe.surnom),
    champ(l.entreprise?.nom ?? null),
    champ(l.employe.secteur),
    champ(l.employe.poste),
    ...jours.map((j) => nombre(l.parJour.get(j) ?? 0)),
    nombre(l.sem1) || '0',
    nombre(l.sem2) || '0',
    nombre(l.total) || '0',
    champ(l.note),
  ])
  const csv = '﻿' + [entete, ...rangees].map((r) => r.join(';')).join('\r\n')
  const lien = document.createElement('a')
  lien.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  lien.download = `Heures des employés ${debut} au ${finPeriode(debut)}.csv`
  lien.click()
  setTimeout(() => URL.revokeObjectURL(lien.href), 1000)
}
