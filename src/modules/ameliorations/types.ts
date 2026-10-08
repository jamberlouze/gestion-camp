import { estEntree, MODULES } from '@/shell/modules'

export type Genre = 'module' | 'fonctionnalite' | 'commentaire'
export type Statut = 'a_faire' | 'fait' | 'ecarte'

export const GENRES: { id: Genre; nom: string; pluriel: string; icone: string; style: string }[] = [
  { id: 'module', nom: 'Nouveau module', pluriel: 'Nouveaux modules', icone: '🧩', style: 'border-violet-200 bg-violet-50 text-violet-900' },
  { id: 'fonctionnalite', nom: 'Fonctionnalité', pluriel: 'Fonctionnalités', icone: '✨', style: 'border-sky-200 bg-sky-50 text-sky-900' },
  { id: 'commentaire', nom: "Commentaire de l'équipe", pluriel: 'Commentaires', icone: '💬', style: 'border-amber-200 bg-amber-50 text-amber-900' },
]
export const genre = (id: Genre) => GENRES.find((g) => g.id === id)!

export const STATUTS: { id: Statut; nom: string }[] = [
  { id: 'a_faire', nom: 'À faire' },
  { id: 'fait', nom: 'Fait' },
  { id: 'ecarte', nom: 'Écarté' },
]

export interface Idee {
  id: string
  genre: Genre
  titre: string
  details: string | null
  /** Id d'un module (ou d'une partie commune) ; null = l'app en général. */
  module: string | null
  de_qui: string | null
  statut: Statut
  important: boolean
  ferme_le: string | null
  created_at: string
}

/**
 * Ce à quoi une idée peut s'appliquer : les modules du menu, puis les
 * parties communes de l'app.
 */
export const CIBLES: { id: string; nom: string; icone: string }[] = [
  ...MODULES.filter(estEntree).map((m) => ({ id: m.id as string, nom: m.nom, icone: m.icone })),
  { id: 'referentiel', nom: 'Référentiel', icone: '📇' },
  { id: 'utilisateurs', nom: 'Utilisateurs et accès', icone: '👥' },
  { id: 'poke', nom: 'Poke', icone: '👉' },
  { id: 'cadre', nom: 'Menu, accueil et connexion', icone: '🧭' },
]

/** Une cible retirée de l'app garde son id brut à l'écran. */
export const cible = (id: string) => CIBLES.find((c) => c.id === id) ?? { id, nom: id, icone: '·' }
