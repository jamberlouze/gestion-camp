// Pages publiques des Réservations (clients sans compte) : formulaire de
// demande, page client, signature du contrat, fiches participants. Ni
// connexion, ni menu, ni service worker : un visiteur ne télécharge pas
// l'app au complet.

/**
 * Sous-domaine public (ex. groupes.camptremblant.com, VITE_HOTE_PUBLIC) :
 * on n'y sert que ces pages ; les liens envoyés aux clients y mènent.
 */
export const HOTE_PUBLIC = ((import.meta.env.VITE_HOTE_PUBLIC as string | undefined) ?? '').trim()

const CHEMINS = /^\/(demande\/?$|client\/|signer\/|fiches\/)/

export const surHotePublic = () => !!HOTE_PUBLIC && window.location.hostname === HOTE_PUBLIC

export const estPagePublique = (chemin = window.location.pathname) => surHotePublic() || CHEMINS.test(chemin)

/** Adresse complète d'une page publique (lien à envoyer au client). */
export const urlPublique = (chemin: string) => `${HOTE_PUBLIC ? `https://${HOTE_PUBLIC}` : window.location.origin}${chemin}`
