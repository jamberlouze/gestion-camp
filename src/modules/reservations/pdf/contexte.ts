// Contexte d'un document (réservation, compagnie, client, contact, estimé,
// étages) à partir des données déjà lues. Pur, sans Supabase ni navigateur :
// l'app (productionPdf.ts) et le Worker (pré-arrivée) s'en servent.

import type { Contact, Organisation } from '@/modules/crm/types'
import type { Compagnie, EtageRooming, Reservation } from '../types'
import type { Contexte } from './champs'

export interface Sources {
  r: Reservation
  compagnies: Compagnie[]
  orgParId: Map<string, Organisation>
  contactParId: Map<string, Contact>
  etages: EtageRooming[]
}

export function contexte(s: Sources, estime: Contexte['estime']): Contexte {
  const { r } = s
  const compagnie = s.compagnies.find((c) => c.entreprise_id === r.compagnie_id) ?? s.compagnies[0]
  if (!compagnie) throw new Error('Coordonnées de la compagnie introuvables (Réglages › Compagnies).')
  const org = r.organisation_id ? s.orgParId.get(r.organisation_id) : undefined
  const contact = r.contact_reservation_id ? s.contactParId.get(r.contact_reservation_id) : undefined
  return {
    r,
    compagnie,
    client: org ? { nom: org.nom, adresse: org.adresse, ville: org.ville, province: org.province, code_postal: org.code_postal } : null,
    contact: contact ? { nom: contact.nom, courriel: contact.courriel, telephone: contact.telephone } : null,
    estime,
    etages: s.etages,
    maintenant: new Date(),
  }
}
