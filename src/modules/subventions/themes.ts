// Thèmes de la recherche de nouvelles subventions (décision de Maxime du
// 2026-10-17, après l'essai par thème) : une recherche par thème pour tout
// le groupe, dans cet ordre. Partagé par l'app (onglet Recherches) et le
// Worker (consignes : `worker/subventions/invites.js`, budgets :
// `pipeline.js`). La base reçoit la liste en paramètre
// (`prochaine_tache_trimestre`) : un thème s'ajoute ici, sans migration.

export const THEMES = [
  { cle: 'salarial', libelle: 'Salarial' },
  { cle: 'batiments', libelle: 'Bâtiments, énergie et environnement' },
  { cle: 'tourisme', libelle: 'Tourisme, plein air et loisir' },
  { cle: 'numerique', libelle: 'Numérique, R-D et formation' },
  { cle: 'regional', libelle: 'Régional, OBNL et dons' },
  { cle: 'marketing', libelle: 'Marketing et exportation' },
] as const

export type CleTheme = (typeof THEMES)[number]['cle']

export const libelleTheme = (cle: string | null) => THEMES.find((t) => t.cle === cle)?.libelle ?? cle ?? ''
