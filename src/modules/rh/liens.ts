import { urlEmplois } from '@/lib/pagesPubliques'

// Liens personnels des pages publiques du module RH (à copier pour l'instant ;
// les courriels viendront en phase 3). Sous-domaine des emplois en PROD.

export const lienRetour = (i: { jeton: string }) => urlEmplois(`/retour/${i.jeton}`)
export const lienDossier = (jeton: string) => urlEmplois(`/dossier/${jeton}`)
export const lienEmplois = () => urlEmplois('/emplois')
