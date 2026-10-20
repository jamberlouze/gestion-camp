// Jours fériés du Québec, liste de la CNESST (Loi sur les normes du
// travail), communs aux modules. Fonctions pures, sans import : testées
// sous Node (npm run test:periodes).
//
//   - 1er janvier (jour de l'An) ;
//   - Vendredi saint ou lundi de Pâques, au choix de l'employeur : PAQUES ;
//   - lundi qui précède le 25 mai (Journée nationale des patriotes) ;
//   - 24 juin (Fête nationale), le 25 si le 24 tombe un dimanche ;
//   - 1er juillet (fête du Canada), le 2 si le 1er tombe un dimanche ;
//   - 1er lundi de septembre (fête du Travail) ;
//   - 2e lundi d'octobre (Action de grâces) ;
//   - 25 décembre (Noël).
//
// Dates « AAAA-MM-JJ », calculs en jours entiers (UTC) comme periodesPaie.ts.

/** Férié de Pâques retenu par le camp (la loi laisse le choix à l'employeur). */
export const PAQUES: 'vendredi' | 'lundi' = 'lundi'

export interface Ferie {
  jour: string
  nom: string
}

const MS_JOUR = 86_400_000
const deux = (n: number) => String(n).padStart(2, '0')
const versJour = (a: number, m: number, j: number) => Math.round(Date.UTC(a, m - 1, j) / MS_JOUR)
function depuisJour(n: number): string {
  const d = new Date(n * MS_JOUR)
  return `${d.getUTCFullYear()}-${deux(d.getUTCMonth() + 1)}-${deux(d.getUTCDate())}`
}
/** 0 = dimanche … 6 = samedi (le 1er janvier 1970 était un jeudi). */
const jourSemaine = (n: number) => (((n + 4) % 7) + 7) % 7

/** Dimanche de Pâques (calendrier grégorien, algorithme de Meeus). */
function paques(a: number): number {
  const g = a % 19
  const s = Math.floor(a / 100)
  const r = a % 100
  const h = (19 * g + s - Math.floor(s / 4) - Math.floor((s - Math.floor((s + 8) / 25) + 1) / 3) + 15) % 30
  const l = (32 + 2 * (s % 4) + 2 * Math.floor(r / 4) - h - (r % 4)) % 7
  const m = Math.floor((g + 11 * h + 22 * l) / 451)
  const mois = Math.floor((h + l - 7 * m + 114) / 31)
  const jour = ((h + l - 7 * m + 114) % 31) + 1
  return versJour(a, mois, jour)
}

/** `rang`-ième lundi du mois (1 = premier). */
function lundi(a: number, mois: number, rang: number): number {
  const premier = versJour(a, mois, 1)
  return premier + ((8 - jourSemaine(premier)) % 7) + 7 * (rang - 1)
}

/** Reporté au lundi si la date tombe un dimanche (Fête nationale, fête du Canada). */
const saufDimanche = (n: number) => (jourSemaine(n) === 0 ? n + 1 : n)

const cache = new Map<number, Ferie[]>()

/** Les fériés de l'année, dans l'ordre. */
export function feriesAnnee(a: number): Ferie[] {
  let liste = cache.get(a)
  if (!liste) {
    const veille25Mai = versJour(a, 5, 24)
    liste = (
      [
        [versJour(a, 1, 1), "Jour de l'An"],
        PAQUES === 'vendredi' ? [paques(a) - 2, 'Vendredi saint'] : [paques(a) + 1, 'Lundi de Pâques'],
        [veille25Mai - ((jourSemaine(veille25Mai) + 6) % 7), 'Journée nationale des patriotes'],
        [saufDimanche(versJour(a, 6, 24)), 'Fête nationale'],
        [saufDimanche(versJour(a, 7, 1)), 'Fête du Canada'],
        [lundi(a, 9, 1), 'Fête du Travail'],
        [lundi(a, 10, 2), 'Action de grâces'],
        [versJour(a, 12, 25), 'Noël'],
      ] as [number, string][]
    ).map(([n, nom]) => ({ jour: depuisJour(n), nom }))
    cache.set(a, liste)
  }
  return liste
}

/** Nom du férié de ce jour-là, sinon null. */
export function ferie(iso: string): string | null {
  return feriesAnnee(Number(iso.slice(0, 4))).find((f) => f.jour === iso)?.nom ?? null
}
