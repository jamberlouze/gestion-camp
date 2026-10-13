/** Bâtiment (Vieille-France, Pavillon principal…) : liste du module, onglet Réglages. */
export interface Batiment {
  id: string
  nom: string
  ordre: number
}

/** Panneau électrique. `nom` court, devant le numéro : « A » → A #13-2. */
export interface Panneau {
  id: string
  batiment_id: string | null
  nom: string
  /** Où il est (« Sous-sol de la Vieille-France »). */
  emplacement: string | null
  /** Nombre d'emplacements ; null = jusqu'au plus haut numéro noté. */
  positions: number | null
  note: string | null
  ordre: number
  created_at: string
  updated_at: string
}

/** Une chose qu'un disjoncteur alimente : « VFB 3 » + « Lumière » (l'un des deux peut manquer). */
export interface Ligne {
  piece: string | null
  quoi: string | null
}

export interface Disjoncteur {
  id: string
  panneau_id: string
  /** Emplacement numéroté : impairs à gauche, pairs à droite. */
  position: number
  /** Demi-disjoncteur 1 ou 2 (A #13-1, A #13-2) ; null = pleine largeur. */
  demi: 1 | 2 | null
  /** Occupe aussi l'emplacement du dessous (A #36-38). */
  bipolaire: boolean
  /** Liste vide = à identifier. */
  alimente: Ligne[]
  /** Noté, mais à vérifier sur place. */
  a_verifier: boolean
  note: string | null
  created_at: string
  updated_at: string
}

export type ChampsDisjoncteur = Pick<Disjoncteur, 'id' | 'panneau_id' | 'position' | 'demi' | 'bipolaire' | 'alimente' | 'a_verifier' | 'note'>

/** Eau coupée par une valve ; null = autre chose (entrée d'eau, arrosage…). */
export type Eau = 'chaude' | 'froide' | 'les_deux'

export interface Valve {
  id: string
  batiment_id: string | null
  /** Ce qu'elle coupe (« Pins Bas + Pins Haut »). */
  coupe: string
  eau: Eau | null
  /** Où elle est (« Garde-robe de la balayeuse (cuisine) »). */
  emplacement: string | null
  a_verifier: boolean
  note: string | null
  ordre: number
  created_at: string
  updated_at: string
}

export type ChampsValve = Pick<Valve, 'id' | 'batiment_id' | 'coupe' | 'eau' | 'emplacement' | 'a_verifier' | 'note' | 'ordre'>

/** Photo ou PDF d'un panneau (carte de la porte) ou d'une valve (où elle est). */
export interface Fichier {
  id: string
  panneau_id: string | null
  valve_id: string | null
  /** Chemin dans le seau : <panneau ou valve>/<id>.jpg ou .pdf */
  chemin: string
  /** Nom d'origine d'un PDF (null pour une photo). */
  nom: string | null
  created_at: string
}

export const EAUX: { id: Eau; libelle: string }[] = [
  { id: 'chaude', libelle: 'Eau chaude' },
  { id: 'froide', libelle: 'Eau froide' },
  { id: 'les_deux', libelle: 'Chaude et froide' },
]
