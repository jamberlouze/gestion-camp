// Conformité d'une embauche (plan-rh.md §14.3) : dossier, contrat,
// consentement parental, VAJ, premiers soins et carte SN. Fonctions pures,
// sans React ni Supabase, testées sous Node : node --test src/modules/rh/conformite.test.mjs

import { age } from './outils.ts'
import type { Certification, Contrat, DocumentConformite, Embauche, Personne, Poste, Saison } from './types.ts'

/** Validité d'une VAJ par défaut (réglage `vaj_validite_ans`, à confirmer). */
export const VAJ_VALIDITE_DEFAUT = 3

/** Début et fin d'une embauche : les siennes, sinon celles de la saison, sinon aujourd'hui (début). */
export function periodeEmbauche(e: Pick<Embauche, 'debut' | 'fin'>, s: Pick<Saison, 'debut' | 'fin'> | undefined, auj: string) {
  return { debut: e.debut ?? s?.debut ?? auj, fin: e.fin ?? s?.fin ?? null }
}

/** « 2026-05-01 » + n années (le 29 février devient le 28). */
export function plusAns(iso: string, n: number) {
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number)
  const jour = m === 2 && j === 29 ? 28 : j
  return `${a + n}-${String(m).padStart(2, '0')}-${String(jour).padStart(2, '0')}`
}

/**
 * VAJ à faire : 18 ans ou plus au début de l'embauche (âge inconnu = on la
 * demande) et aucune VAJ, ou une VAJ échue à cette date (plus vieille que
 * `validiteAns`).
 */
export function vajAFaire(p: Pick<Personne, 'date_naissance' | 'vaj_le'>, debut: string, validiteAns: number) {
  const ans = age(p.date_naissance, debut)
  if (ans !== null && ans < 18) return false
  return !p.vaj_le || plusAns(p.vaj_le, validiteAns) <= debut
}

/** Ligne à coller pour la VAJ : « AAAAMMJJ,Nom,Prénom » (comme « Info VAJ » d'Airtable) ; null sans date de naissance. */
export function ligneVaj(p: Pick<Personne, 'date_naissance' | 'nom_famille' | 'prenom'>) {
  if (!p.date_naissance) return null
  return `${p.date_naissance.slice(0, 10).replaceAll('-', '')},${p.nom_famille},${p.prenom}`
}

export type EtatCarte = 'ok' | 'expiree' | 'expire_pendant' | 'manquante' | 'sans_date'

/**
 * Carte de premiers soins ou SN : la plus récente (expiration la plus
 * lointaine). Expirée avant le début, ou qui expire avant la fin de
 * l'embauche ; « manquante » seulement si le poste l'exige. Rend null s'il
 * n'y a rien à signaler ni à afficher.
 */
export function etatCarte(docs: DocumentConformite[], genre: Certification, exigee: boolean, debut: string, fin: string | null) {
  const siens = docs.filter((d) => d.genre === genre)
  if (!siens.length) return exigee ? { etat: 'manquante' as EtatCarte, expire_le: null } : null
  const dates = siens.map((d) => d.expire_le).filter((x): x is string => !!x).sort()
  const expire_le = dates.at(-1) ?? null
  if (!expire_le) return { etat: (exigee ? 'sans_date' : 'ok') as EtatCarte, expire_le: null }
  const etat: EtatCarte = expire_le < debut ? 'expiree' : fin && expire_le < fin ? 'expire_pendant' : 'ok'
  return { etat, expire_le }
}

const TEXTES_CARTES: Record<Certification, Record<Exclude<EtatCarte, 'ok'>, string>> = {
  premiers_soins: { expiree: 'Premiers soins expirés', expire_pendant: 'Premiers soins expirent pendant', manquante: 'Premiers soins manquants', sans_date: 'Premiers soins sans date' },
  sauveteur: { expiree: 'Carte SN expirée', expire_pendant: 'Carte SN expire pendant', manquante: 'Carte SN manquante', sans_date: 'Carte SN sans date' },
}

export type CleConformite = 'dossier' | 'contrat' | 'consentement' | 'vaj' | 'premiers_soins' | 'sauveteur'

export interface PastilleConformite {
  cle: CleConformite
  texte: string
  /** `alerte` : rouge ; `attente` : ambre (en cours, rien à faire tout de suite) */
  ton: 'alerte' | 'attente'
}

/** Ce qui reste à régler pour une embauche (rien pour une embauche annulée). */
export function pastillesConformite(p: {
  embauche: Embauche
  personne: Pick<Personne, 'date_naissance' | 'vaj_le'>
  saison: Pick<Saison, 'debut' | 'fin'> | undefined
  poste: Pick<Poste, 'certifications'> | undefined
  contrats: Pick<Contrat, 'embauche_id' | 'genre' | 'statut'>[]
  documents: DocumentConformite[]
  auj: string
  validiteVaj: number
}): PastilleConformite[] {
  const e = p.embauche
  if (e.statut === 'annulee') return []
  const { debut, fin } = periodeEmbauche(e, p.saison, p.auj)
  const r: PastilleConformite[] = []

  if (e.statut === 'a_envoyer') r.push({ cle: 'dossier', texte: 'Lien à envoyer', ton: 'alerte' })
  else if (e.statut === 'envoyee') r.push({ cle: 'dossier', texte: 'Dossier attendu', ton: 'attente' })
  else if (e.statut === 'dossier_recu') r.push({ cle: 'dossier', texte: 'Dossier à valider', ton: 'alerte' })

  // Contrat et consentement : seulement avant la validation (les embauches
  // complètes d'Airtable n'ont pas de contrat dans l'app).
  const siens = p.contrats.filter((c) => c.embauche_id === e.id && c.statut !== 'annule')
  if (e.statut !== 'complete') {
    if (e.genre === 'emploi' && !siens.some((c) => c.genre === 'contrat' && c.statut === 'signe'))
      r.push({ cle: 'contrat', texte: siens.some((c) => c.genre === 'contrat') ? 'Contrat à signer' : 'Contrat à préparer', ton: 'alerte' })
    const ans = age(p.personne.date_naissance, debut)
    if (ans !== null && ans < 18 && !siens.some((c) => c.genre === 'consentement' && c.statut === 'signe'))
      r.push({ cle: 'consentement', texte: 'Consentement parental', ton: 'alerte' })
  }

  if (vajAFaire(p.personne, debut, p.validiteVaj)) r.push({ cle: 'vaj', texte: 'VAJ à faire', ton: 'alerte' })

  for (const genre of ['premiers_soins', 'sauveteur'] as const) {
    const carte = etatCarte(p.documents, genre, !!p.poste?.certifications.includes(genre), debut, fin)
    if (!carte || carte.etat === 'ok') continue
    const texte = TEXTES_CARTES[genre][carte.etat]
    r.push({ cle: genre, texte, ton: carte.etat === 'sans_date' ? 'attente' : 'alerte' })
  }
  return r
}
