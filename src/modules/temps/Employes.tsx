import { Fragment, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { ferie } from '@/lib/feries'
import { IconeTableur } from '@/lib/icones'
import { PuceCompagnie } from '@/lib/PuceCompagnie'
import { ui } from '@/lib/ui'
import { useTitreImpression } from '@/lib/useTitreImpression'
import { useAuth } from '@/shell/auth'
import { ChoixPeriode } from './commun'
import { banqueAffichee, etatBanqueHeures } from './banques'
import { lignesDirection, type LigneDirection } from './direction'
import { nomCompagnie } from './employeurD'
import {
  nomDe,
  banqueDe,
  useBanquesTous,
  useDossiersAFermer,
  useFeuillesPlage,
  useFermerDossier,
  useHeuresPlage,
  useMembres,
  type DossierAFermer,
  type Statut,
} from './donnees'
import {
  nomEmploye,
  useEmployesFeuille,
  useFeuillesEmployes,
  useFeuillesPropres,
  useHeuresEmployes,
  useNoterEmploye,
  useNotesEmployes,
  useEntreprises,
  useSaisirEmploye,
  type EmployeFeuille,
  type Entreprise,
} from './donneesEmployes'
import { usePaieDirection } from './donneesEmployeurD'
import { ExportEmployeurD } from './ExportEmployeurD'
import { Case } from './Feuille'
import { RangeesDirection } from './SectionDirection'
import { PastilleStatut } from './Statut'
import { menu, usePeriode } from './outils'
import {
  aujourdhui,
  codeAnneePeriode,
  datePaie,
  depuisIso,
  finPeriode,
  formatHeures,
  jourCourt,
  joursPeriode,
  JOURS_COURTS,
  libellePaie,
  libellePeriode,
  numeroPeriodePaie,
} from './periodes'

/** Filtres « secteur » et « compagnie » : '' = tous, SANS = sans secteur ou sans compagnie. */
const SANS = '-'
/** Filtre « secteur » : la section Direction seulement (admins). */
const DIRECTION = '@direction'
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
  /** Heures de maladie et prises en banque (employé qui remplit sa feuille), payées à part. */
  maladie: number
  banque: number
  /** Heures prises en banque, par jour (ligne « Prises en banque » d'un employé sans compte). */
  banqueParJour: Map<string, number>
  /** Mise en banque des heures activée pour cette période (interrupteur de l'onglet Banques). */
  banqueActive: boolean
  /** Employé sans compte : ligne « Prises en banque » (activée, un solde ou des heures prises dans la période : banqueAffichee). */
  banqueAffichee: boolean
  note: string
  /** État de sa feuille s'il remplit la sienne (ou si elle a un état) ; null sinon. */
  statut: Statut | null
  /** Aucune heure depuis 2 périodes : retiré de la saisie (réaffichable), relevé d'emploi à produire. */
  aFermer: boolean
}

const LIBELLES_ETAT: Record<Statut, string> = { ouverte: 'En cours', soumise: 'Soumise', approuvee: 'Approuvée' }

/**
 * Feuille partagée des employés (hors direction) : toute la direction voit
 * et remplit les heures de tout le monde, une ligne par employé et par
 * compagnie (deux compagnies dans la même paie = deux lignes) et une
 * colonne par jour de la période, comme l'ancien Google Sheets. Un seul
 * nombre d'heures par jour (pas de vacances ni de maladie). Filtres par
 * secteur et par compagnie (réglés dans le référentiel).
 * Un employé qui remplit sa feuille (compte relié à sa fiche dans la page
 * Utilisateurs) : sa ligne reprend ses heures régulières, avec l'état de sa
 * feuille ; elle ne se modifie pas ici, on ouvre sa feuille (clic sur son nom).
 * Ses heures de maladie et prises en banque paraissent sous son nom et dans
 * l'export. Employé sans compte qui a une banque (activée dans l'onglet
 * Banques, un solde ou des heures déjà prises dans la période) : une ligne
 * « Prises en banque » sous la sienne, saisie ici.
 * Dossier à fermer : un employé sans heures depuis 2 périodes disparaît de
 * la saisie (« Afficher les dossiers masqués ») et la direction voit
 * « Produire le relevé d'emploi » ; confirmer désactive sa fiche.
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
  const feuilles = useFeuillesEmployes(debut)
  const propres = useFeuillesPropres()
  const saisir = useSaisirEmploye(debut)
  const noter = useNoterEmploye(debut)
  const [erreurNote, setErreurNote] = useState<string | null>(null)
  // Dossiers à fermer pour la période affichée (masqués) et pour la période en cours (alertes).
  const masques = useDossiersAFermer(debut)
  const [afficherMasques, setAfficherMasques] = useState(false)
  const banques = useBanquesTous(finPeriode(debut))
  const [employeurD, setEmployeurD] = useState(false)
  // Section Direction (admins seulement, qui préparent la paie) : feuilles de la direction, lues ici, jamais saisies.
  const { estAdmin } = useAuth()
  const membres = useMembres(estAdmin)
  const heuresDirection = useHeuresPlage(debut, finPeriode(debut), estAdmin)
  const feuillesDirection = useFeuillesPlage(debut, debut, estAdmin)
  const paieDirection = usePaieDirection(estAdmin)

  const compagnieChoisie = entreprises.data?.find((x) => x.id === compagnie)
  const nomChoisie = compagnie === SANS ? 'Sans compagnie' : compagnieChoisie ? nomCompagnie(compagnieChoisie) : null
  const sousTitre = [
    secteur ? (secteur === SANS ? 'Sans secteur' : secteur === DIRECTION ? 'Direction' : secteur) : null,
    compagnie ? nomChoisie : null,
  ]
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
    if (!employes.data || !entreprises.data || !heures.data || !notes.data || !feuilles.data || !propres.data || !masques.data || !banques.data)
      return null
    // Banque d'heures de chaque employé (toutes compagnies) pour la période : interrupteur et ligne « Prises en banque ».
    const fin = finPeriode(debut)
    const banqueEmploye = (employeId: string) => {
      const { mouvements, etats } = banqueDe(banques.data, { employeId }, fin)
      const active = etatBanqueHeures(etats, false, debut).active
      return { active, affichee: banqueAffichee(mouvements, active, debut, fin) }
    }
    const banqueParLigne = new Map<string, Map<string, number>>()
    const statutDe = new Map(feuilles.data.map((f) => [`${f.employe_id}|${f.entreprise_id}`, f.statut]))
    const parCompagnie = new Map(entreprises.data.map((x) => [x.id, x]))
    const aFermer = new Set(masques.data.map((d) => d.employe_id))
    const parLigne = new Map<string, Map<string, number>>()
    const autres = new Map<string, { maladie: number; banque: number }>()
    for (const h of heures.data) {
      const cle = `${h.employe_id}|${h.entreprise_id}`
      if (h.type === 'maladie' || h.type === 'banque') {
        const a = autres.get(cle) ?? { maladie: 0, banque: 0 }
        a[h.type] += h.heures
        autres.set(cle, a)
        if (h.type === 'banque') {
          if (!banqueParLigne.has(cle)) banqueParLigne.set(cle, new Map())
          banqueParLigne.get(cle)!.set(h.jour, h.heures)
        }
        continue
      }
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
        if (e.actif)
          resultat.push({
            cle: `${e.id}|`,
            employe: e,
            entreprise: null,
            parJour: new Map(),
            sem1: 0,
            sem2: 0,
            total: 0,
            maladie: 0,
            banque: 0,
            banqueParJour: new Map(),
            banqueActive: false,
            banqueAffichee: false,
            note: '',
            statut: null,
            aFermer: aFermer.has(e.id),
          })
        continue
      }
      const banque = banqueEmploye(e.id)
      for (const x of compagnies) {
        const cle = `${e.id}|${x.id}`
        const parJour = parLigne.get(cle) ?? new Map<string, number>()
        let sem1 = 0
        let sem2 = 0
        for (const [jour, h] of parJour) {
          if (jour < milieu) sem1 += h
          else sem2 += h
        }
        const statut = statutDe.get(cle) ?? (propres.data.has(e.id) ? 'ouverte' : null)
        const a = autres.get(cle) ?? { maladie: 0, banque: 0 }
        resultat.push({
          cle,
          employe: e,
          entreprise: x,
          parJour,
          sem1,
          sem2,
          total: sem1 + sem2,
          maladie: a.maladie,
          banque: a.banque,
          banqueParJour: banqueParLigne.get(cle) ?? new Map(),
          banqueActive: banque.active,
          banqueAffichee: banque.affichee,
          note: noteDe.get(cle) ?? '',
          statut,
          aFermer: aFermer.has(e.id),
        })
      }
    }
    return resultat.sort(
      (a, b) =>
        (a.employe.secteur == null ? 1 : 0) - (b.employe.secteur == null ? 1 : 0) ||
        (a.employe.secteur ?? '').localeCompare(b.employe.secteur ?? '', 'fr') ||
        nomEmploye(a.employe).localeCompare(nomEmploye(b.employe), 'fr') ||
        a.employe.id.localeCompare(b.employe.id) ||
        (a.entreprise?.ordre ?? 0) - (b.entreprise?.ordre ?? 0) ||
        (a.entreprise ? nomCompagnie(a.entreprise) : '').localeCompare(b.entreprise ? nomCompagnie(b.entreprise) : '', 'fr'),
    )
  }, [employes.data, entreprises.data, heures.data, notes.data, feuilles.data, propres.data, masques.data, banques.data, milieu, debut])

  const direction = useMemo(() => {
    if (!estAdmin) return []
    if (!membres.data || !heuresDirection.data || !feuillesDirection.data || !paieDirection.data || !entreprises.data) return null
    return lignesDirection({
      membres: membres.data,
      heures: heuresDirection.data,
      feuilles: feuillesDirection.data,
      paie: paieDirection.data,
      entreprises: entreprises.data,
      milieu,
    })
  }, [estAdmin, membres.data, heuresDirection.data, feuillesDirection.data, paieDirection.data, entreprises.data, milieu])

  const erreur =
    employes.error ??
    entreprises.error ??
    heures.error ??
    notes.error ??
    feuilles.error ??
    propres.error ??
    masques.error ??
    banques.error ??
    (estAdmin ? (membres.error ?? heuresDirection.error ?? feuillesDirection.error ?? paieDirection.error) : null)
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!toutes || !direction) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const secteurs = [...new Set(toutes.map((l) => l.employe.secteur).filter((s): s is string => !!s))]
  const aSansSecteur = toutes.some((l) => !l.employe.secteur)
  const compagnies = (entreprises.data ?? []).filter(
    (x) => toutes.some((l) => l.entreprise?.id === x.id) || direction.some((d) => d.compagnie?.id === x.id),
  )
  const aSansCompagnie = toutes.some((l) => !l.entreprise) || direction.some((d) => !d.compagnie)
  const mots = recherche.trim().toLocaleLowerCase('fr')
  // Dossier à fermer sans rien dans la période : retiré de la saisie, sauf si on demande à le voir.
  const masquee = (l: Ligne) => l.aFermer && !l.total && !l.maladie && !l.banque && !l.note
  const nbMasques = new Set(toutes.filter(masquee).map((l) => l.employe.id)).size
  const lignes = toutes.filter((l) => {
    const e = l.employe
    if (!afficherMasques && masquee(l)) return false
    if (secteur === SANS ? e.secteur : secteur && e.secteur !== secteur) return false
    if (compagnie === SANS ? l.entreprise : compagnie && l.entreprise?.id !== compagnie) return false
    if (avecHeures && !l.total && !l.maladie && !l.banque && !l.note) return false
    if (mots && ![e.surnom, e.nom_complet, e.poste].some((t) => t?.toLocaleLowerCase('fr').includes(mots))) return false
    return true
  })
  // Section Direction : avec tous les secteurs ou « Direction » ; compagnie = sa compagnie de paie.
  const directionVisibles = direction.filter((d) => {
    if (secteur && secteur !== DIRECTION) return false
    if (compagnie === SANS ? d.compagnie : compagnie && d.compagnie?.id !== compagnie) return false
    if (avecHeures && !d.total && !d.vacances && !d.maladie && !d.banque && !d.note) return false
    if (mots && ![d.membre.nom, d.membre.courriel].some((t) => t?.toLocaleLowerCase('fr').includes(mots))) return false
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

  // Totaux : employés et direction affichés (heures régulières).
  const totalJour = (jour: string) =>
    lignes.reduce((s, l) => s + (l.parJour.get(jour) ?? 0), 0) + directionVisibles.reduce((s, d) => s + (d.parJour.get(jour) ?? 0), 0)
  const somme = (f: (l: Ligne | LigneDirection) => number) =>
    lignes.reduce((s, l) => s + f(l), 0) + directionVisibles.reduce((s, d) => s + f(d), 0)
  // Total par compagnie (pour la paie), quand plusieurs compagnies sont affichées ; la direction à sa compagnie de paie.
  const parCompagnie = (entreprises.data ?? [])
    .map((x) => ({
      nom: nomCompagnie(x),
      total:
        lignes.filter((l) => l.entreprise?.id === x.id).reduce((s, l) => s + l.total, 0) +
        directionVisibles.filter((d) => d.compagnie?.id === x.id).reduce((s, d) => s + d.total, 0),
    }))
    .filter((x) => x.total)
  const auj = aujourdhui()
  const fond = (jour: string) =>
    jour === auj ? 'bg-foret-50' : ferie(jour) ? 'bg-amber-50' : depuisIso(jour).getDay() % 6 === 0 ? 'bg-pierre-50' : ''
  const coupure = (i: number) => (i === 7 ? 'border-l-2 border-pierre-300' : '')
  let numero = 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <ChoixPeriode debut={debut} onChange={setDebut} />
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={ui.boutonSecondaire}
            onClick={() => exporter(debut, jours, lignes, directionVisibles)}
            disabled={!lignes.length && !directionVisibles.length}
          >
            <IconeTableur className="size-4" />
            Exporter
          </button>
          <button className={ui.boutonSecondaire} onClick={() => setEmployeurD(true)} title="Fichier de saisie de la paie pour Employeur D (Desjardins)">
            <IconeTableur className="size-4" />
            Employeur D
          </button>
          <button className={ui.boutonSecondaire} onClick={() => window.print()}>
            Imprimer
          </button>
        </div>
      </div>
      {employeurD && (
        <ExportEmployeurD debut={debut} compagnieDepart={compagnie === SANS ? '' : compagnie} fermer={() => setEmployeurD(false)} />
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 print:hidden">
        <select aria-label="Secteur" className={menu} value={secteur} onChange={(e) => choisir('secteur', e.target.value)}>
          <option value="">Tous les secteurs</option>
          {secteurs.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          {aSansSecteur && <option value={SANS}>Sans secteur</option>}
          {estAdmin && <option value={DIRECTION}>Direction</option>}
          {/* Secteur de l'adresse qui n'existe plus : reste choisi, liste vide. */}
          {secteur && secteur !== SANS && secteur !== DIRECTION && !secteurs.includes(secteur) && <option value={secteur}>{secteur}</option>}
        </select>
        <select aria-label="Compagnie" className={menu} value={compagnie} onChange={(e) => choisir('compagnie', e.target.value)}>
          <option value="">Toutes les compagnies</option>
          {compagnies.map((x) => (
            <option key={x.id} value={x.id}>
              {nomCompagnie(x)}
            </option>
          ))}
          {aSansCompagnie && <option value={SANS}>Sans compagnie</option>}
          {compagnie && compagnie !== SANS && !compagnies.some((x) => x.id === compagnie) && (
            <option value={compagnie}>{nomChoisie ?? 'Compagnie retirée'}</option>
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
        {(nbMasques > 0 || afficherMasques) && (
          <label className="flex items-center gap-2 text-sm text-pierre-700">
            <input type="checkbox" checked={afficherMasques} onChange={(e) => setAfficherMasques(e.target.checked)} />
            Afficher les dossiers masqués ({nbMasques})
          </label>
        )}
        <Link to="/referentiel/employes" className="text-sm text-foret-700 underline">
          Gérer les employés (secteurs, compagnies)
        </Link>
      </div>

      <div className="hidden print:block">
        <h2 className="text-lg font-semibold">Heures des employés{sousTitre}</h2>
        <p className="text-sm">
          {libellePeriode(debut)} · {libellePaie(debut)}
        </p>
      </div>

      <AlertesReleve />

      {erreurNote && <p className={ui.erreur}>{erreurNote}</p>}

      {!toutes.length && !direction.length ? (
        <p className={`${ui.carte} px-4 py-8 text-center text-sm text-pierre-500`}>
          Aucun employé actif dans le référentiel.{' '}
          <Link to="/referentiel/employes" className="text-foret-700 underline">
            Ajouter des employés
          </Link>
        </p>
      ) : !lignes.length && !directionVisibles.length ? (
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
                    title={ferie(j) ?? undefined}
                  >
                    <span className="block">{JOURS_COURTS[depuisIso(j).getDay()]}</span>
                    <span className="block">{depuisIso(j).getDate()}</span>
                    {ferie(j) && <span className="block font-semibold text-amber-800">Férié</span>}
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
                    // Remplie par l'employé : on corrige dans sa feuille. Approuvée : gelée.
                    const parSaFeuille = !!propres.data?.has(e.id) || (l.statut != null && l.statut !== 'ouverte')
                    const saFeuille = l.entreprise ? `/temps/employe/${e.id}/${l.entreprise.id}?periode=${debut}` : null
                    // Employé sans compte qui a une banque (banqueAffichee) : ses heures prises en banque se saisissent ici.
                    const ligneBanque = !!l.entreprise && !parSaFeuille && (l.banqueAffichee || l.banque > 0)
                    const nb = ligneBanque ? numero++ : -1
                    let semBanque1 = 0
                    let semBanque2 = 0
                    for (const [jour, h] of l.banqueParJour) {
                      if (jour < milieu) semBanque1 += h
                      else semBanque2 += h
                    }
                    return (
                      <Fragment key={l.cle}>
                      <tr className="break-inside-avoid">
                        <th className="sticky left-0 z-10 min-w-40 bg-white px-3 py-1 text-left font-normal whitespace-nowrap">
                          <span className="flex items-center gap-1.5 font-medium text-pierre-900">
                            {parSaFeuille && saFeuille ? (
                              <Link to={saFeuille} className="underline decoration-pierre-300 hover:text-foret-700" title="Ouvrir sa feuille">
                                {nomEmploye(e)}
                              </Link>
                            ) : (
                              nomEmploye(e)
                            )}
                            {!e.actif && <span className="text-xs font-normal text-pierre-400">(inactif)</span>}
                            {parSaFeuille && l.statut && <PastilleStatut statut={l.statut} className="px-1.5! py-px!" />}
                            {l.aFermer && (
                              <span className="rounded-full bg-amber-100 px-1.5 py-px text-xs font-medium text-amber-800" title="Aucune heure depuis 2 périodes">
                                Dossier à fermer
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-pierre-500">
                            {l.entreprise ? (
                              <PuceCompagnie compagnie={l.entreprise} court className="px-1.5! py-px!" />
                            ) : (
                              <Link to="/referentiel/employes" className="rounded-full bg-amber-100 px-1.5 py-px font-medium text-amber-800 print:hidden">
                                Aucune compagnie
                              </Link>
                            )}
                            {details}
                          </span>
                          {(l.maladie > 0 || (l.banque > 0 && !ligneBanque)) && (
                            <span className="block text-xs font-medium text-amber-800">
                              {[l.maladie ? `Maladie ${formatHeures(l.maladie)} h` : null, l.banque && !ligneBanque ? `Prises en banque ${formatHeures(l.banque)} h` : null]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          )}
                        </th>
                        {jours.map((j, i) => (
                          <td key={j} className={`px-0.5 py-1 text-center ${fond(j)} ${coupure(i)}`}>
                            <Case
                              etroite
                              modifiable={!!l.entreprise && !parSaFeuille}
                              ligne={n}
                              colonne={i}
                              valeur={l.parJour.get(j) ?? null}
                              libelle={`${nomEmploye(e)}${l.entreprise ? `, ${nomCompagnie(l.entreprise)}` : ''}, ${jourCourt(j)}`}
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
                              libelle={`Note de paie, ${nomEmploye(e)}, ${nomCompagnie(l.entreprise)}`}
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
                      {ligneBanque && (
                        <tr className="break-inside-avoid bg-amber-50/40">
                          <th className="sticky left-0 z-10 bg-amber-50 px-3 py-1 pl-6 text-left text-xs font-medium whitespace-nowrap text-amber-900">
                            ↳ Prises en banque
                            {!l.banqueActive && <span className="block font-normal text-amber-800/80">mise en banque désactivée</span>}
                          </th>
                          {jours.map((j, i) => (
                            <td key={j} className={`px-0.5 py-1 text-center ${coupure(i)}`}>
                              <Case
                                etroite
                                modifiable
                                ligne={nb}
                                colonne={i}
                                valeur={l.banqueParJour.get(j) ?? null}
                                libelle={`Prises en banque, ${nomEmploye(e)}, ${nomCompagnie(l.entreprise!)}, ${jourCourt(j)}`}
                                onSaisir={(h) =>
                                  saisir.mutate({ employeId: e.id, entrepriseId: l.entreprise!.id, jour: j, heures: h, type: 'banque' })
                                }
                              />
                            </td>
                          ))}
                          <td className="border-l-2 border-pierre-300 px-2 py-1 text-right text-xs tabular-nums text-amber-900">
                            {formatHeures(semBanque1)}
                          </td>
                          <td className="px-2 py-1 text-right text-xs tabular-nums text-amber-900">{formatHeures(semBanque2)}</td>
                          <td className="px-2 py-1 text-right text-xs font-semibold tabular-nums text-amber-900">{formatHeures(l.banque)}</td>
                          <td className="px-3 py-1 text-xs text-amber-900/80">payées, déduites de sa banque</td>
                        </tr>
                      )}
                      </Fragment>
                    )
                  })}
                </Fragment>
              ))}
              <RangeesDirection
                lignes={directionVisibles}
                jours={jours}
                debut={debut}
                avecTitre={secteur === ''}
                classeJour={fond}
                coupure={coupure}
              />
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
        Un employé avec un état (En cours, Soumise, Approuvée) remplit sa propre feuille : ses heures régulières
        s’affichent ici (maladie et heures prises en banque sous son nom), et on les corrige dans sa feuille (clic sur son
        nom). Un employé sans compte qui a une banque (mise en banque activée dans l’onglet Banques, ou un solde) a une
        ligne « Prises en banque » sous la sienne. Un employé sans heures depuis 2 périodes est retiré de la saisie (dossier à fermer).
        {estAdmin &&
          ' Section Direction (admins seulement) : les heures de la feuille de chaque personne de la direction, lues ici (on les corrige dans sa feuille : clic sur son nom) ; sa compagnie de paie et son matricule se règlent dans Employeur D › Réglages.'}
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

/**
 * CSV pour Excel (séparateur « ; », virgule décimale, BOM pour les accents),
 * lignes affichées seulement, la section Direction (admins) comprise.
 */
function exporter(debut: string, jours: string[], lignes: Ligne[], direction: LigneDirection[]) {
  const nombre = (n: number) => (n ? String(Math.round(n * 100) / 100).replace('.', ',') : '')
  const champ = (t: string | null) => (t && /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : (t ?? ''))
  const entete = [
    'Période de paie',
    'Date de paie',
    'Employé',
    'Nom de camp',
    'Compagnie',
    'Secteur',
    'Poste',
    ...jours,
    'Semaine 1',
    'Semaine 2',
    'Total',
    'Vacances',
    'Maladie',
    'Prises en banque',
    'Note',
    'État',
  ]
  const pp = codeAnneePeriode(debut)
  const rangees = lignes.map((l) => [
    pp,
    datePaie(debut),
    champ(l.employe.nom_complet ?? l.employe.surnom),
    champ(l.employe.surnom),
    champ(l.entreprise ? nomCompagnie(l.entreprise) : null),
    champ(l.employe.secteur),
    champ(l.employe.poste),
    ...jours.map((j) => nombre(l.parJour.get(j) ?? 0)),
    nombre(l.sem1) || '0',
    nombre(l.sem2) || '0',
    nombre(l.total) || '0',
    '',
    nombre(l.maladie),
    nombre(l.banque),
    champ(l.note),
    l.statut ? LIBELLES_ETAT[l.statut] : '',
  ])
  for (const d of direction)
    rangees.push([
      pp,
      datePaie(debut),
      champ(nomDe(d.membre)),
      '',
      champ(d.compagnie ? nomCompagnie(d.compagnie) : null),
      'Direction',
      d.membre.role === 'admin' ? 'Admin' : 'Direction',
      ...jours.map((j) => nombre(d.parJour.get(j) ?? 0)),
      nombre(d.sem1) || '0',
      nombre(d.sem2) || '0',
      nombre(d.total) || '0',
      nombre(d.vacances),
      nombre(d.maladie),
      nombre(d.banque),
      champ(d.note),
      d.statut ? LIBELLES_ETAT[d.statut] : '',
    ])
  const csv = '﻿' + [entete, ...rangees].map((r) => r.join(';')).join('\r\n')
  const lien = document.createElement('a')
  lien.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const { numero, annee } = numeroPeriodePaie(debut)
  lien.download = `Heures des employés PP${numero}-${annee} (${debut} au ${finPeriode(debut)}).csv`
  lien.click()
  setTimeout(() => URL.revokeObjectURL(lien.href), 1000)
}

/**
 * « Produire le relevé d'emploi » (période en cours) : employés sans heures
 * depuis 2 périodes. Confirmer = fiche désactivée (temps.fermer_dossier),
 * jamais sans confirmation.
 */
function AlertesReleve() {
  const alertes = useDossiersAFermer()
  const fermer = useFermerDossier()
  const [erreur, setErreur] = useState<string | null>(null)
  if (!alertes.data?.length) return null

  const confirmerFermeture = async (d: DossierAFermer) => {
    const nom = d.nom_complet || d.surnom
    if (
      !(await confirmer({
        titre: `Relevé d’emploi produit pour ${nom} ?`,
        message:
          'Sa fiche sera désactivée dans le référentiel (on peut la réactiver dans Référentiel › Employés). Ses heures restent.',
        libelleOk: 'Désactiver la fiche',
        danger: false,
      }))
    )
      return
    setErreur(null)
    fermer.mutate(d.employe_id, { onError: (e) => setErreur(messageErreur(e)) })
  }

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 print:hidden">
      <h2 className="font-semibold text-amber-900">Produire le relevé d’emploi</h2>
      <p className="text-sm text-amber-900/80">
        Aucune heure depuis 2 périodes de paie : produisez le relevé d’emploi dans Employeur D, puis confirmez pour désactiver la
        fiche.
      </p>
      <ul className="mt-2 divide-y divide-amber-200/70">
        {alertes.data.map((d) => (
          <li key={d.employe_id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5 text-sm">
            <span>
              <b className="text-pierre-900">{d.nom_complet || d.surnom}</b>
              <span className="text-pierre-600"> · dernières heures : {libellePeriode(d.derniere_periode)}</span>
            </span>
            <button className={ui.boutonSecondaire} disabled={fermer.isPending} onClick={() => confirmerFermeture(d)}>
              Relevé produit : désactiver la fiche
            </button>
          </li>
        ))}
      </ul>
      {erreur && <p className={`${ui.erreur} mt-2`}>{erreur}</p>}
    </section>
  )
}
