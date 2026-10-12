// Pages publiques (visiteurs sans compte) : ni connexion, ni menu, ni
// service worker (un visiteur ne télécharge pas l'app au complet).
//   Réservations : formulaire de demande, page client, signature du
//                  contrat, fiches participants ;
//   RH :           candidature, intention de retour, dossier d'embauche.
// Le code commun de ces pages est dans src/lib/public/.

/**
 * Sous-domaine des groupes (ex. groupes.camptremblant.com, VITE_HOTE_PUBLIC) :
 * on n'y sert que les pages des Réservations ; les liens envoyés aux clients
 * y mènent.
 */
export const HOTE_PUBLIC = ((import.meta.env.VITE_HOTE_PUBLIC as string | undefined) ?? '').trim()

/**
 * Sous-domaine des emplois (emplois.camptremblant.com, VITE_HOTE_EMPLOIS ;
 * décision de Maxime du 2026-10-12) : on n'y sert que les pages du module
 * RH ; les liens envoyés aux candidats et aux employés y mènent.
 */
export const HOTE_EMPLOIS = ((import.meta.env.VITE_HOTE_EMPLOIS as string | undefined) ?? '').trim()

const CHEMINS_RESERVATIONS = /^\/(demande\/?$|client\/|signer\/|fiches\/)/
const CHEMINS_RH = /^\/(emplois\/?$|retour\/|dossier\/)/

export const surHotePublic = () => !!HOTE_PUBLIC && window.location.hostname === HOTE_PUBLIC
export const surHoteEmplois = () => !!HOTE_EMPLOIS && window.location.hostname === HOTE_EMPLOIS

/** Page publique du module RH (sur le sous-domaine des emplois : toute adresse, sauf celles des Réservations). */
export const estPageRh = (chemin = window.location.pathname) =>
  CHEMINS_RH.test(chemin) || (surHoteEmplois() && !CHEMINS_RESERVATIONS.test(chemin))

export const estPagePublique = (chemin = window.location.pathname) => estPageRh(chemin) || surHotePublic() || CHEMINS_RESERVATIONS.test(chemin)

/** Adresse complète d'une page publique des Réservations (lien à envoyer au client). */
export const urlPublique = (chemin: string) => `${HOTE_PUBLIC ? `https://${HOTE_PUBLIC}` : window.location.origin}${chemin}`

/** Adresse complète d'une page publique du module RH (lien à envoyer au candidat ou à l'employé). */
export const urlEmplois = (chemin: string) => `${HOTE_EMPLOIS ? `https://${HOTE_EMPLOIS}` : window.location.origin}${chemin}`
