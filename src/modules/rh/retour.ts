// Intention de retour (/retour/<jeton>) : remplace le formulaire
// « Intention de retour » d'Airtable (docs/rh-existant.md §2.2). La personne
// est identifiée par son lien personnel : plus de nom ni de courriel à
// donner, fini le rattachement par courriel. Français seulement.
//
// Fichier pur : la page vérifie, le Worker revérifie avant
// rh.repondre_retour.

import { dateValide } from './candidature.ts'

export type OuiNon = 'oui' | 'non' | ''

export interface ReponsesRetour {
  reponse: OuiNon
  saison_ids: string[]
  poste_ids: string[]
  date_debut: string
  empechements: string
  autre: string
}

export const RETOUR_VIDE: ReponsesRetour = { reponse: '', saison_ids: [], poste_ids: [], date_debut: '', empechements: '', autre: '' }

/** Ce que rh.retour_public renvoie. */
export interface PageRetour {
  prenom: string
  surnom: string | null
  saison: { id: string; nom: string; genre: string }
  saisons: { id: string; nom: string; genre: string }[]
  postes: { id: string; nom: string; compagnie: string; genres: string[] }[]
  compagnies: { id: string; nom: string }[]
  intro: { id: string; version: number; texte: string } | null
  reponse: 'oui' | 'non' | null
  repondu_le: string | null
  modifiable: boolean
  precedent: { saison_ids: string[]; poste_ids: string[]; date_debut: string | null; empechements: string | null; autre: string | null } | null
}

export const TEXTES_RETOUR = {
  titre: 'Intention de retour',
  revenir: "J'aimerais revenir comme employé·e",
  oui: 'Oui',
  non: 'Non',
  saisons: 'Pour quelle(s) saison(s) souhaites-tu revenir ?',
  postes: 'Pour quel(s) poste(s) souhaites-tu appliquer ?',
  plusieurs: 'Tu peux faire plusieurs choix.',
  date_debut: 'À partir de quelle date es-tu disponible pour travailler avec nous ?',
  empechements: 'As-tu des empêchements qui vont jouer sur tes disponibilités ?',
  autre: 'As-tu des questions ou commentaires à nous partager ?',
  envoyer: 'Envoyer ma réponse',
  modifier: 'Modifier ma réponse',
  envoi: 'Envoi…',
  requis: 'Réponse obligatoire.',
  une_saison: 'Choisis au moins une saison.',
  un_poste: 'Choisis au moins un poste.',
  date_invalide: 'Date invalide.',
  a_corriger: 'Quelques réponses sont à compléter (en rouge).',
  erreur_envoi: "L'envoi n'a pas fonctionné. Vérifie ta connexion et réessaie.",
  deja_traitee: 'Ta réponse a déjà été traitée par la direction : écris-nous pour la changer.',
  introuvable: "Ce lien n'est pas valide. Vérifie que tu as copié l'adresse au complet, ou écris-nous.",
  merci_oui: 'Merci ! On est content·es de te savoir partant·e. On te revient très vite pour la suite.',
  merci_non: 'Merci de nous avoir répondu. Bonne continuation, et au plaisir de te recroiser !',
  deja_repondu: 'Tu as répondu « {reponse} » le {date}.',
}

/** Postes affichés pour les saisons choisies (tous les postes actifs si aucune saison). */
export function postesPourSaisons(page: Pick<PageRetour, 'saisons' | 'postes'>, saisonIds: string[]) {
  const genres = new Set(page.saisons.filter((s) => saisonIds.includes(s.id)).map((s) => s.genre))
  return genres.size ? page.postes.filter((p) => p.genres.some((g) => genres.has(g))) : page.postes
}

/** Réponses à corriger, par champ (vide = tout est bon). */
export function erreursRetour(r: ReponsesRetour, page: Pick<PageRetour, 'saisons' | 'postes'>) {
  const t = TEXTES_RETOUR
  const e: Partial<Record<keyof ReponsesRetour, string>> = {}
  if (r.reponse !== 'oui' && r.reponse !== 'non') e.reponse = t.requis
  if (r.reponse === 'oui') {
    const saisons = new Set(page.saisons.map((s) => s.id))
    const postes = new Set(page.postes.map((p) => p.id))
    if (!r.saison_ids.length || r.saison_ids.some((id) => !saisons.has(id))) e.saison_ids = t.une_saison
    if (!r.poste_ids.length || r.poste_ids.some((id) => !postes.has(id))) e.poste_ids = t.un_poste
    if (!r.date_debut.trim()) e.date_debut = t.requis
    else if (!dateValide(r.date_debut)) e.date_debut = t.date_invalide
  }
  return e
}

/** Réponses envoyées : « Non » ne garde que le commentaire. */
export function nettoyerRetour(r: ReponsesRetour): ReponsesRetour {
  const autre = r.autre.trim().slice(0, 5000)
  if (r.reponse !== 'oui') return { ...RETOUR_VIDE, reponse: r.reponse, autre }
  return {
    reponse: 'oui',
    saison_ids: [...new Set(r.saison_ids)],
    poste_ids: [...new Set(r.poste_ids)],
    date_debut: r.date_debut.trim(),
    empechements: r.empechements.trim().slice(0, 2000),
    autre,
  }
}

/** Réponses reçues (JSON non fiable) → ReponsesRetour. */
export function lireRetour(brutes: unknown): ReponsesRetour {
  const r: ReponsesRetour = { ...RETOUR_VIDE, saison_ids: [], poste_ids: [] }
  if (!brutes || typeof brutes !== 'object') return r
  const b = brutes as Record<string, unknown>
  if (b.reponse === 'oui' || b.reponse === 'non') r.reponse = b.reponse
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 30) : [])
  r.saison_ids = ids(b.saison_ids)
  r.poste_ids = ids(b.poste_ids)
  for (const cle of ['date_debut', 'empechements', 'autre'] as const) if (typeof b[cle] === 'string') r[cle] = (b[cle] as string).slice(0, 5000)
  return r
}
