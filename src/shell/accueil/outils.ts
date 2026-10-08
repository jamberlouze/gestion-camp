// Nouvel accueil à l'essai (maquette A « Ma journée » + alertes, 2026-10-08) :
// seulement ces comptes en PROD ; tout le monde en DEV.
const COMPTES_ESSAI = ['maxime@camptremblant.com']

export const voitNouvelAccueil = (courriel: string | undefined) =>
  import.meta.env.DEV || (!!courriel && COMPTES_ESSAI.includes(courriel.toLowerCase()))

/** « 13 h 30 » à partir de « 13:30:00 ». */
export function heureLisible(heure: string | null) {
  if (!heure) return null
  const [h, m] = heure.split(':')
  return `${Number(h)} h ${m}`
}
