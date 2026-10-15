// Exports de l'onglet Employés (plan-rh.md §14.4) : liste de la saison et
// ACQ (reprend la table « ACQ » de la base Airtable « RH - ACQ », à
// confirmer avec Charlotte). Jamais de NAS ni de compte. Fonctions pures,
// testées sous Node : node --test src/modules/rh/listes.test.mjs

import { DIETES, STATUTS_EMBAUCHE } from './types.ts'
import type { DocumentConformite, Dossier, Embauche, Personne } from './types.ts'

export interface SourceListe {
  embauche: Pick<Embauche, 'genre' | 'echelon' | 'statut'>
  personne: Pick<Personne, 'prenom' | 'nom_famille' | 'surnom' | 'courriel' | 'telephone' | 'date_naissance'>
  dossier: Partial<Dossier> | null
  compagnie: string
  poste: string
  /** Libellés des dates où la personne s'est dite disponible */
  disponibilites: string[]
}

const diete = (d: Partial<Dossier> | null) => DIETES.find((x) => x.id === d?.diete)?.nom ?? ''
/** « Nathalie Pelletier (Mère) 819 555-0299 » */
function urgence(d: Partial<Dossier> | null, n: 1 | 2) {
  const [nom, lien, tel] = n === 1 ? [d?.urgence1_nom, d?.urgence1_lien, d?.urgence1_telephone] : [d?.urgence2_nom, d?.urgence2_lien, d?.urgence2_telephone]
  return [nom, lien && `(${lien})`, tel].filter(Boolean).join(' ')
}

export const ENTETES_LISTE = [
  'Nom',
  'Prénom',
  'Nom de camp',
  'Compagnie',
  'Poste',
  'Échelon',
  'Genre',
  'Statut',
  'Courriel',
  'Téléphone',
  'Date de naissance',
  'Diète',
  'Allergies',
  'T-shirt',
  'Hoodie',
  "Contact d'urgence 1",
  "Contact d'urgence 2",
  'Disponibilités',
]

/** Liste de la saison : en-têtes puis une rangée par embauche. */
export function rangeesListe(lignes: SourceListe[]): (string | number)[][] {
  return [
    ENTETES_LISTE,
    ...lignes.map((l) => [
      l.personne.nom_famille,
      l.personne.prenom,
      l.personne.surnom ?? '',
      l.compagnie,
      l.poste,
      l.embauche.echelon ?? '',
      l.embauche.genre === 'benevolat' ? 'Bénévolat' : 'Emploi',
      STATUTS_EMBAUCHE.find((s) => s.id === l.embauche.statut)?.nom ?? l.embauche.statut,
      l.personne.courriel ?? '',
      l.personne.telephone ?? '',
      l.personne.date_naissance ?? '',
      diete(l.dossier),
      l.dossier?.allergies ?? '',
      l.dossier?.taille_tshirt ?? '',
      l.dossier?.taille_hoodie ?? '',
      urgence(l.dossier, 1),
      urgence(l.dossier, 2),
      l.disponibilites.join(', '),
    ]),
  ]
}

export interface SourceAcq {
  personne: Pick<Personne, 'prenom' | 'nom_famille' | 'courriel'>
  dossier: Pick<Dossier, 'etudiant_temps_plein' | 'pays' | 'etudes'> | null
  compagnie: string
  poste: string
  ancien: boolean
  /** Documents de la personne (genre et expiration seulement) */
  documents: DocumentConformite[]
}

export const ENTETES_ACQ = [
  'Prénom',
  'Nom',
  'Courriel',
  'Compagnie',
  'Poste',
  'Étudiant à temps plein',
  'Pays',
  'Ancien',
  'Études',
  'CV',
  "Pièce d'identité",
  'Premiers soins (expiration)',
  'Carte SN (expiration)',
]

const ouiNon = (b: boolean | null | undefined) => (b == null ? '' : b ? 'Oui' : 'Non')
/** Expiration la plus lointaine d'une carte ; « Oui (sans date) » si elle n'en a pas ; vide sans carte. */
const expiration = (docs: DocumentConformite[], genre: string) => {
  const siens = docs.filter((d) => d.genre === genre)
  if (!siens.length) return ''
  return siens.map((d) => d.expire_le ?? '').sort().at(-1) || 'Oui (sans date)'
}

/** Export ACQ : en-têtes puis une rangée par embauche. */
export function rangeesAcq(lignes: SourceAcq[]): string[][] {
  return [
    ENTETES_ACQ,
    ...lignes.map((l) => [
      l.personne.prenom,
      l.personne.nom_famille,
      l.personne.courriel ?? '',
      l.compagnie,
      l.poste,
      ouiNon(l.dossier?.etudiant_temps_plein),
      l.dossier?.pays ?? '',
      ouiNon(l.ancien),
      l.dossier?.etudes ?? '',
      ouiNon(l.documents.some((d) => d.genre === 'cv')),
      ouiNon(l.documents.some((d) => d.genre === 'piece_identite')),
      expiration(l.documents, 'premiers_soins'),
      expiration(l.documents, 'sauveteur'),
    ]),
  ]
}
