import type { Diete, Etape, FicheParticipant, Reservation } from './types'

// Fiches participants : règles pures de la section de la fiche, du rapport
// pour la cuisine et de la page client (sans import d'exécution : testé
// sous Node, `npm run test:fiches`).

const SIGNEE: Etape[] = ['confirmee', 'pre_arrivee', 'terminee', 'facture_finale', 'soldee']

/**
 * Le client voit-il ses fiches participants sur sa page ? Même règle que
 * `reservations.page_client` : Classe nature ou Journée plein air, contrat
 * signé (`signe_le`, ou étape Confirmée et suivantes pour un contrat signé à
 * la main ou importé), dossier ouvert.
 */
export const fichesSurPageClient = (r: Pick<Reservation, 'forfait' | 'fermeture' | 'signe_le' | 'etape'>) =>
  (r.forfait === 'classe_nature' || r.forfait === 'journee_plein_air') && !r.fermeture && (!!r.signe_le || SIGNEE.includes(r.etape))

/** Ce que le responsable du groupe et la cuisine lisent d'une fiche. */
export type FicheAllergies = Pick<FicheParticipant, 'prenom' | 'nom' | 'genre' | 'groupe' | 'allergies' | 'diete' | 'diete_autre'> &
  Partial<Pick<FicheParticipant, 'epipen' | 'effacee_le'>>

/** Fiches attendues (élèves + accompagnateurs) moins les reçues, jamais négatif. */
export const fichesManquantes = (recues: number, attendues: number) => Math.max(0, attendues - recues)

export const aDesAllergies = (f: Pick<FicheAllergies, 'allergies'>) => !!f.allergies?.trim()

/** Diète à signaler : tout sauf « régulière » (une diète « autre » sans précision compte). */
export const dieteParticuliere = (f: Pick<FicheAllergies, 'diete'>) => !!f.diete && f.diete !== 'reguliere'

/** Libellé d'une diète : la précision pour « autre ». */
export const libelleDiete = (f: Pick<FicheAllergies, 'diete' | 'diete_autre'>, libelles: Record<Diete, string>) =>
  !f.diete ? '' : f.diete === 'autre' ? f.diete_autre?.trim() || libelles.autre : libelles[f.diete]

/** Jour de réception à Montréal (AAAA-MM-JJ ; la base rend l'heure en UTC). */
export const jourRecue = (f: Pick<FicheParticipant, 'recue_le'>) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(f.recue_le))

/** « Nom, Prénom » ; une fiche effacée (Loi 25) n'a plus de nom. */
export const nomFiche = (f: Pick<FicheAllergies, 'prenom' | 'nom'>) => [f.nom?.trim(), f.prenom?.trim()].filter(Boolean).join(', ')

const cle = (s: string | null | undefined) => (s ?? '').trim().toLocaleLowerCase('fr')

/** Ordre des listes : nom de famille puis prénom, sans tenir compte de la casse ni des accents. */
export function parNom<T extends Pick<FicheAllergies, 'prenom' | 'nom'>>(fiches: T[]): T[] {
  return [...fiches].sort((a, b) => cle(a.nom).localeCompare(cle(b.nom), 'fr') || cle(a.prenom).localeCompare(cle(b.prenom), 'fr'))
}

export interface RapportCuisine<T extends FicheAllergies> {
  /** Fiches avec allergies, par nom (Epipen d'abord : les cas graves en tête). */
  allergies: T[]
  /** Une entrée par diète particulière, dans l'ordre de `ordreDietes`, avec ses fiches par nom. */
  dietes: { diete: Diete; fiches: T[] }[]
  /** Fiches lues (non effacées). */
  lues: number
}

/**
 * Rapport allergies et diètes pour la cuisine : seulement les fiches qui
 * ont quelque chose à signaler ; les fiches effacées (Loi 25) sont ignorées.
 */
export function rapportCuisine<T extends FicheAllergies>(fiches: T[], ordreDietes: Diete[]): RapportCuisine<T> {
  const lues = fiches.filter((f) => !f.effacee_le)
  const allergies = parNom(lues.filter(aDesAllergies)).sort((a, b) => Number(!!b.epipen) - Number(!!a.epipen))
  const dietes = ordreDietes
    .filter((d) => d !== 'reguliere')
    .map((diete) => ({ diete, fiches: parNom(lues.filter((f) => f.diete === diete)) }))
    .filter((x) => x.fiches.length > 0)
  return { allergies, dietes, lues: lues.length }
}

/** Champ CSV pour Excel (séparateur « ; ») : guillemets au besoin. */
const champ = (v: string | null | undefined) => {
  const t = (v ?? '').replace(/\r?\n/g, ' ').trim()
  return /[;"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}
const ouiNon = (v: boolean | null | undefined) => (v === true ? 'Oui' : v === false ? 'Non' : '')

/**
 * Export des fiches (accès « Fiches participants » seulement) : CSV pour
 * Excel, séparateur « ; », BOM pour les accents. Jamais le courriel.
 */
export function csvFiches(fiches: FicheParticipant[], libelles: Record<Diete, string>): string {
  const entete = ['Nom', 'Prénom', 'Type', 'Classe ou groupe', 'Matricule', 'Reçue le', 'Allergies', 'Problèmes de santé', 'Epipen', 'Diète', 'Médicaments en vente libre']
  const lignes = parNom(fiches.filter((f) => !f.effacee_le)).map((f) => [
    champ(f.nom),
    champ(f.prenom),
    f.genre === 'adulte' ? 'Adulte' : 'Élève',
    champ(f.groupe),
    champ(f.matricule),
    jourRecue(f),
    champ(f.allergies),
    champ(f.problemes_sante),
    ouiNon(f.epipen),
    champ(libelleDiete(f, libelles)),
    ouiNon(f.medicaments),
  ])
  return '﻿' + [entete, ...lignes].map((l) => l.join(';')).join('\r\n')
}
