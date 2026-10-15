// Termes d'un contrat du module RH (plan-rh.md §6) : ce qui est figé à la
// préparation, choix du modèle, champs des modèles. Fichier pur sans PDF :
// l'app s'en sert sans charger pdf-lib ; contrat.ts (PDF) le reprend.

export type GenreSaisonContrat = 'ete' | 'hors_ete'

/** Termes figés à la préparation du contrat (rh.contrats.termes). */
export interface TermesContrat {
  poste: string
  saison: string
  genre_saison: GenreSaisonContrat
  debut: string | null
  fin: string | null
  remuneration: 'heure' | 'semaine' | null
  taux: number | null
  echelon: number | null
  compagnie: { nom: string; raison_sociale: string; nom_court: string; adresse: string; courriel: string; telephone: string }
  taches: string | null
  /** Personne de la direction qui prépare (pré-signe) le contrat */
  signataire: string
  prepare_le: string
}

export interface Employe {
  prenom: string
  nom_famille: string
  courriel: string | null
  telephone: string | null
  adresse: string | null
  ville: string | null
  province: string | null
  code_postal: string | null
}

export interface ModeleContrat {
  id: string
  genre: 'contrat' | 'consentement'
  entreprise_id: string | null
  genre_saison: GenreSaisonContrat | null
  titre: string
  contenu: string
  a_valider: boolean
}

/** Le modèle le plus précis : compagnie et genre de saison, compagnie, genre de saison, commun. */
export function modeleContratPour<M extends Pick<ModeleContrat, 'genre' | 'entreprise_id' | 'genre_saison'>>(
  modeles: M[],
  genre: ModeleContrat['genre'],
  entrepriseId: string | null,
  genreSaison: GenreSaisonContrat,
) {
  const candidats = modeles.filter(
    (m) => m.genre === genre && (!m.entreprise_id || m.entreprise_id === entrepriseId) && (!m.genre_saison || m.genre_saison === genreSaison),
  )
  const rang = (m: M) => (m.entreprise_id ? 2 : 0) + (m.genre_saison ? 1 : 0)
  return candidats.sort((a, b) => rang(b) - rang(a))[0] ?? null
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
/** « 1er septembre 2026 ». */
export function dateLongue(iso: string | null | undefined) {
  if (!iso) return ''
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number)
  return `${j === 1 ? '1er' : j} ${MOIS[m - 1]} ${a}`
}
/** « 664,00 $ ». */
export const argent = (n: number | null | undefined) =>
  n === null || n === undefined ? '' : `${n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} $`

/** Ce qui manque pour préparer un contrat (messages lisibles). */
export function manquesContrat(t: Partial<TermesContrat>) {
  const m: string[] = []
  if (!t.poste) m.push('le poste')
  if (!t.debut || !t.fin) m.push('les dates de début et de fin')
  if (!t.remuneration) m.push('la rémunération (à l’heure ou à la semaine)')
  if (t.taux === null || t.taux === undefined) m.push('le taux')
  if (!t.compagnie?.raison_sociale) m.push('la raison sociale de la compagnie (Courriels › Compagnies)')
  if (!t.compagnie?.adresse) m.push('l’adresse de la compagnie (Courriels › Compagnies)')
  return m
}

export function champsContrat(t: TermesContrat, e: Employe | null, aujourdhui: string): Record<string, string> {
  return {
    poste: t.poste,
    saison: t.saison,
    echelon: t.echelon ? String(t.echelon) : '',
    compagnie: t.compagnie.raison_sociale || t.compagnie.nom,
    compagnie_court: t.compagnie.nom_court || t.compagnie.nom,
    debut: dateLongue(t.debut),
    fin: dateLongue(t.fin),
    taux: argent(t.taux),
    taux_jour: t.remuneration === 'semaine' && t.taux !== null ? argent(Math.round((t.taux / 5) * 100) / 100) : '',
    a_la_semaine: t.remuneration === 'semaine' ? 'Oui' : '',
    a_l_heure: t.remuneration === 'heure' ? 'Oui' : '',
    taches: t.taches?.trim() ? 'Oui' : '',
    employe: e ? `${e.prenom} ${e.nom_famille}`.trim() : '',
    signataire: t.signataire,
    date: dateLongue(aujourdhui),
  }
}
