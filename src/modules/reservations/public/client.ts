import { schemaAnonyme } from '@/lib/public/client'

// Client anonyme du socle commun (src/lib/public/client.ts), sur le schéma
// des Réservations : ce que le client fait reste à son nom.
export const db = () => schemaAnonyme('reservations')

export { messageDe } from '@/lib/public/client'
