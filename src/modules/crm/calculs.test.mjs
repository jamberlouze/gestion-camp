// Statut et relances du CRM d'après les réservations. Lancer : node --test src/modules/crm/calculs.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculer, etatReservation, relancesAuto, typeReservation } from './calculs.ts'

const AUJ = '2026-10-21'

const org = (o = {}) => ({
  id: 'o1',
  nom: 'École Essai',
  genre: 'ecole_primaire',
  etape: null,
  cycle_ans: 1,
  conseiller_id: null,
  statut_depart: null,
  statut_depart_le: null,
  ...o,
})

let n = 0
const resa = (r = {}) => ({
  id: `r${++n}`,
  organisation_id: 'o1',
  numero: `27-G-${n}`,
  nom: 'École Essai',
  forfait: 'classe_nature',
  variante: 'verte',
  etape: 'confirmee',
  fermeture: null,
  raison_perte: null,
  origine: 'import',
  date_arrivee: '2026-05-12',
  date_depart: '2026-05-14',
  nb_participants: 50,
  ...r,
})

const calc = (reservations, o = {}) => calculer(org(o), { reservations, visites: [], echanges: [], relances: [] }, AUJ)

test('venu = contrat signé ou plus loin, jamais fermée', () => {
  for (const etape of ['confirmee', 'pre_arrivee', 'terminee', 'facture_finale', 'soldee']) {
    const c = calc([resa({ etape })])
    assert.equal(c.statut, 'client', etape)
    assert.equal(c.derniere?.depart, '2026-05-14')
  }
  for (const etape of ['nouvelle', 'contact', 'estime_envoye', 'estime_accepte', 'contrat_envoye']) {
    assert.equal(calc([resa({ etape })]).statut, 'cible', etape)
  }
  assert.equal(calc([resa({ fermeture: 'en_attente' })]).statut, 'cible')
})

test('demande en cours = prospect, en attente comprise', () => {
  const futur = { date_arrivee: '2027-03-15', date_depart: '2027-03-17' }
  assert.equal(calc([resa({ etape: 'estime_envoye', ...futur })]).statut, 'prospect')
  const c = calc([resa({ etape: 'contrat_envoye', fermeture: 'en_attente', ...futur })])
  assert.equal(c.statut, 'prospect')
  assert.equal(c.demandes[0].etat, 'En attente')
})

test('perdues et annulées : hors calculs, gardées pour la fiche', () => {
  const c = calc([
    resa({ etape: 'estime_envoye', fermeture: 'closed_lost', raison_perte: 'prix', date_arrivee: '2027-03-15', date_depart: '2027-03-17' }),
    resa({ etape: 'confirmee', fermeture: 'annulee', date_arrivee: '2027-05-11', date_depart: '2027-05-13' }),
  ])
  assert.equal(c.statut, 'cible')
  assert.equal(c.passages.length, 0)
  assert.deepEqual(
    c.fermees.map((p) => p.etat),
    ['Closed lost (Prix ou budget)', 'Annulée après signature'],
  )
})

test("réservation d'une autre organisation ignorée ; prochain séjour = client", () => {
  const c = calc([resa({ organisation_id: 'o2' }), resa({ date_arrivee: '2027-05-11', date_depart: '2027-05-13' })])
  assert.equal(c.passages.length, 1)
  assert.equal(c.statut, 'client')
  assert.equal(c.prochaine?.arrivee, '2027-05-11')
})

test('relance automatique liée à la réservation', () => {
  const r = resa()
  const [relance, ...autres] = relancesAuto(calc([r]), [], AUJ)
  assert.equal(autres.length, 0)
  assert.equal(relance.source_cle, `reservation:${r.id}`)
  assert.equal(relance.titre, 'Relancer pour le printemps 2027')
  assert.equal(relance.echeance, '2026-11-12')
  // Une demande déjà faite pour le printemps suivant : pas de relance.
  const demande = resa({ etape: 'estime_envoye', date_arrivee: '2027-05-11', date_depart: '2027-05-13' })
  assert.deepEqual(relancesAuto(calc([r, demande]), [], AUJ), [])
  // Une demande perdue ne l'empêche pas.
  const perdue = { ...demande, id: 'perdue', fermeture: 'closed_lost' }
  assert.equal(relancesAuto(calc([r, perdue]), [], AUJ).length, 1)
})

test('libellés', () => {
  assert.equal(typeReservation({ forfait: 'classe_nature', variante: 'blanche' }), 'Classe blanche')
  assert.equal(typeReservation({ forfait: 'classe_nature', variante: null }), 'Classe nature')
  assert.equal(typeReservation({ forfait: 'location_salle', variante: 'soir' }), 'Location de salle')
  assert.equal(etatReservation({ etape: 'pre_arrivee', fermeture: null, raison_perte: null }), 'Pré-arrivée envoyée')
})
