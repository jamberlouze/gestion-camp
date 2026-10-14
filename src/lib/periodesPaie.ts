// Périodes de paie, communes aux modules (Feuilles de temps, Calendrier…).
// Fonctions pures, sans import : testées sous Node (npm run test:periodes).
//
// Règles (Employeur D) :
//   - une période = 14 jours, du dimanche au samedi ; le cycle est calé sur
//     le dimanche 4 octobre 2026, première période des Feuilles de temps
//     (temps.debut_periode en SQL : mêmes règles). Le cycle se prolonge
//     aussi avant cette date (ex. 20 sept. – 3 oct. 2026 = PP20) ;
//   - date de paie = le jeudi qui suit la fin de la période (samedi + 5 jours) ;
//   - numéro (PP) = rang de la date de paie dans son année civile. Une paie
//     qui tombe le 1er janvier est versée le 31 décembre et compte dans
//     l'année précédente : une année a 26 ou parfois 27 paies (2025 : 27).
//
// Dates « AAAA-MM-JJ ». Calculs en jours entiers (UTC) : aucun décalage
// selon le fuseau ou l'heure avancée. Toute fonction qui prend `debut`
// accepte aussi n'importe quel jour de la période.

/** Dimanche de la première période des Feuilles de temps (rien n'y est saisi avant). */
export const PREMIERE_PERIODE_PAIE = '2026-10-04'
export const DUREE_PERIODE_PAIE = 14
/** Jours entre la fin de la période (samedi) et la paie (jeudi). */
const DELAI_PAIE = 5

const MS_JOUR = 86_400_000
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const deux = (n: number) => String(n).padStart(2, '0')
const modulo = (a: number, n: number) => ((a % n) + n) % n

/** « 2026-10-04 » → nombre de jours depuis le 1er janvier 1970. */
function versJour(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new RangeError(`Date invalide : ${iso}`)
  const [a, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = Date.UTC(a, mo - 1, j)
  const d = new Date(t)
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== j) throw new RangeError(`Date invalide : ${iso}`)
  return Math.round(t / MS_JOUR)
}

function depuisJour(n: number): string {
  const d = new Date(n * MS_JOUR)
  return `${d.getUTCFullYear()}-${deux(d.getUTCMonth() + 1)}-${deux(d.getUTCDate())}`
}

const ANCRE = versJour(PREMIERE_PERIODE_PAIE)

/** Dimanche qui commence la période de paie qui contient `iso` (aussi avant le 4 oct. 2026). */
export function debutPeriodePaie(iso: string): string {
  const n = versJour(iso)
  return depuisJour(n - modulo(n - ANCRE, DUREE_PERIODE_PAIE))
}

/** Samedi qui termine la période. */
export function finPeriodePaie(debut: string): string {
  return depuisJour(versJour(debutPeriodePaie(debut)) + DUREE_PERIODE_PAIE - 1)
}

/** Date de paie : le jeudi qui suit la fin de la période. */
export function datePaie(debut: string): string {
  return depuisJour(versJour(finPeriodePaie(debut)) + DELAI_PAIE)
}

/** Jour où la paie est versée : la date de paie, sauf un 1er janvier, versé le 31 décembre. */
export function dateVersementPaie(debut: string): string {
  const paie = datePaie(debut)
  return paie.endsWith('-01-01') ? depuisJour(versJour(paie) - 1) : paie
}

/**
 * Numéro de la période (PP) et année de paie : rang de la date de paie
 * dans l'année civile où elle est versée.
 * 4 – 17 oct. 2026 → { numero: 21, annee: 2026 } ; 27 déc. 2026 – 9 janv. 2027 → { numero: 1, annee: 2027 }.
 */
export function numeroPeriodePaie(debut: string): { numero: number; annee: number } {
  const paie = versJour(datePaie(debut))
  const annee = Number(dateVersementPaie(debut).slice(0, 4))
  // Paies de l'année : du 2 janvier au 1er janvier suivant (versé le 31 décembre).
  const deuxJanvier = versJour(`${annee}-01-02`)
  const premiere = deuxJanvier + modulo(paie - deuxJanvier, DUREE_PERIODE_PAIE)
  return { numero: (paie - premiere) / DUREE_PERIODE_PAIE + 1, annee }
}

/** « PP23 » */
export function codePeriodePaie(debut: string): string {
  return `PP${numeroPeriodePaie(debut).numero}`
}

/** « 1er nov. », « 14 nov. 2026 » */
export function dateCourtePaie(iso: string, avecAnnee = false): string {
  const [a, m, j] = iso.split('-').map(Number)
  return `${j === 1 ? '1er' : j} ${MOIS_COURTS[m - 1]}${avecAnnee ? ` ${a}` : ''}`
}

/**
 * « PP23 · 1er au 14 nov. », « PP22 · 18 au 31 oct. », « PP25 · 29 nov. au 12 déc. ».
 * `annee` : ajoute l'année (« PP23 · 1er au 14 nov. 2026 », « PP1 · 27 déc. 2026 au 9 janv. 2027 »),
 * utile dans une liste qui couvre plus d'une année.
 */
export function libellePeriodePaie(debut: string, options: { annee?: boolean } = {}): string {
  const d = debutPeriodePaie(debut)
  const f = finPeriodePaie(d)
  const [ad, md] = d.split('-').map(Number)
  const [af, mf] = f.split('-').map(Number)
  const avecAnnee = !!options.annee
  let dates: string
  if (ad !== af) dates = `${dateCourtePaie(d, avecAnnee)} au ${dateCourtePaie(f, avecAnnee)}`
  else if (md !== mf) dates = `${dateCourtePaie(d)} au ${dateCourtePaie(f, avecAnnee)}`
  else dates = `${dateCourtePaie(d).replace(/ \S+$/, '')} au ${dateCourtePaie(f, avecAnnee)}`
  return `${codePeriodePaie(d)} · ${dates}`
}

/** Débuts des périodes qui touchent l'intervalle [du, au], du plus ancien au plus récent. */
export function periodesPaieEntre(du: string, au: string): string[] {
  const liste: string[] = []
  const fin = versJour(au)
  for (let n = versJour(debutPeriodePaie(du)); n <= fin; n += DUREE_PERIODE_PAIE) liste.push(depuisJour(n))
  return liste
}
