// Notes de l'équipe (haut de la fiche, réunion du 2026-10-21) : quels
// échanges du CRM y sont montrés plutôt que dans le Suivi. Fichier pur.

import type { Echange } from '@/modules/crm/types'

/**
 * Échange « note » du CRM d'une réservation montré dans les Notes (notes
 * faites avant dans le Suivi, imports compris) ; ceux qu'écrivent la page
 * client (signés « Nom (client) ») et la décision sur un changement du
 * client (reservations.decider_changement) restent dans le Suivi, avec le
 * journal qui dit la même chose.
 */
export const estNoteEquipe = (e: Pick<Echange, 'genre' | 'auteur_nom' | 'texte'>) =>
  e.genre === 'note' && !/\(client\)\s*$/.test(e.auteur_nom ?? '') && !/^Changement demandé par le client /.test(e.texte)
