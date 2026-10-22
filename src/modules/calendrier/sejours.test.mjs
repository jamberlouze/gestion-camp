// Séjours du Calendrier lus dans les réservations. Lancer : npm run test:calendrier
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { phaseDe, PHASES, sejourDe } from './sejours.ts'

const ligne = (r = {}) => ({
  id: 'r1',
  numero: '27-G-595',
  nom: 'École Essai',
  forfait: 'classe_nature',
  etape: 'confirmee',
  fermeture: null,
  origine: 'formulaire',
  date_arrivee: '2027-03-10',
  date_depart: '2027-03-12',
  heure_arrivee: '09:30:00',
  heure_depart: null,
  etages: [],
  salles: [],
  nb_participants: 50,
  nb_accompagnateurs: 5,
  service_repas: true,
  ...r,
})

test('une phase par calendrier Google, plus Airbnb', () => {
  assert.deepEqual(
    PHASES.map((p) => p.libelle),
    ['Demande', 'Estimé', 'Contrat', 'Confirmée PP', 'Confirmée VF', 'Airbnb'],
  )
})

test('phase selon l’étape, comme le calendrier Google', () => {
  const phase = (etape, r = {}) => phaseDe(ligne({ etape, ...r }))
  assert.equal(phase('nouvelle'), 'demande')
  assert.equal(phase('contact'), 'demande')
  assert.equal(phase('estime_envoye'), 'estime')
  assert.equal(phase('estime_accepte'), 'estime')
  assert.equal(phase('contrat_envoye'), 'contrat')
  for (const e of ['confirmee', 'pre_arrivee', 'terminee', 'facture_finale', 'soldee']) assert.equal(phase(e), 'confirmee_pp')
  assert.equal(phase('confirmee', { etages: ['CH', 'VFB'] }), 'confirmee_vf')
  assert.equal(phase('pre_arrivee', { salles: ['SVF'] }), 'confirmee_vf')
  assert.equal(phase('confirmee', { origine: 'airbnb', etages: ['VFB'] }), 'airbnb')
})

test('bâtiment : Vieille-France dès une section ou une salle de la VF, sinon Pavillon principal', () => {
  assert.equal(sejourDe(ligne()).batiment, 'PP')
  assert.equal(sejourDe(ligne({ etages: ['CH', 'CB'] })).batiment, 'PP')
  assert.equal(sejourDe(ligne({ etape: 'nouvelle', etages: ['VFH'] })).batiment, 'VF')
  assert.equal(sejourDe(ligne({ salles: ['CVF'] })).batiment, 'VF')
})

test('séjour affiché : personnes, forfait, sections, repas', () => {
  const s = sejourDe(ligne({ etages: ['CH'], salles: ['SMB'], service_repas: false }))
  assert.equal(s.nom_groupe, 'École Essai')
  assert.equal(s.type_sejour, 'Classe nature')
  assert.equal(s.etat, 'Confirmée')
  assert.equal(s.nb_participants, 55)
  assert.deepEqual(s.sections, ['CH', 'SMB'])
  assert.equal(s.avec_repas, false)
  assert.equal(sejourDe(ligne({ nb_participants: null, nb_accompagnateurs: null })).nb_participants, null)
  assert.equal(sejourDe(ligne({ nb_participants: null, nb_accompagnateurs: 3 })).nb_participants, 3)
})

test('Airbnb : « Airbnb », à la Vieille-France', () => {
  const s = sejourDe(ligne({ origine: 'airbnb', nom: 'Airbnb — Vieille-France', forfait: 'accueil_groupe', etages: ['VFB', 'VFH'], nb_participants: null, nb_accompagnateurs: null }))
  assert.equal(s.phase, 'airbnb')
  assert.equal(s.etat, 'Airbnb')
  assert.equal(s.batiment, 'VF')
})
