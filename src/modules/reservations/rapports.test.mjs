// Rapports des réservations (phase 7). Lancer : npm run test:rapports
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  anPasse,
  delais,
  entonnoir,
  grilleOccupation,
  groupesParMois,
  joursUsagers,
  mediane,
  occupationParMois,
  parForfait,
  prevision,
  raisonsPerte,
  revenusParMois,
  revenusReference,
  rythme,
  troisMesures,
} from './rapports.ts'

let n = 0
const r = (champs) => ({
  id: `r${++n}`,
  numero: `27-G-${String(n).padStart(3, '0')}`,
  nom: `Groupe ${n}`,
  forfait: 'accueil_groupe',
  variante: null,
  etape: 'nouvelle',
  fermeture: null,
  origine: 'app',
  exercice: 2027,
  date_arrivee: '2026-11-10',
  date_depart: '2026-11-12',
  demande_le: '2026-09-01T14:00:00+00:00',
  signe_le: null,
  montant_estime: 1000,
  nb_participants: 20,
  nb_accompagnateurs: 2,
  organisation_id: null,
  raison_perte: null,
  etages: [],
  salles: [],
  ...champs,
})

test('jours-usagers = (participants + accompagnateurs) × (nuits + 1), comme le Sheets', () => {
  assert.equal(joursUsagers(r({ nb_participants: 20, nb_accompagnateurs: 2, date_arrivee: '2026-11-10', date_depart: '2026-11-12' })), 66)
  // Journée plein air ou location de salle : un jour.
  assert.equal(joursUsagers(r({ nb_participants: 100, nb_accompagnateurs: null, date_arrivee: '2026-11-10', date_depart: '2026-11-10' })), 100)
})

test('revenus par mois : signés seulement, mois d’arrivée, octobre en premier, Airbnb et perdus exclus', () => {
  const rs = [
    r({ signe_le: '2026-09-01', date_arrivee: '2026-10-05', date_depart: '2026-10-07', montant_estime: 500 }),
    r({ signe_le: '2026-09-01', date_arrivee: '2027-09-20', date_depart: '2027-09-21', montant_estime: 300 }),
    r({ signe_le: null, date_arrivee: '2026-10-05', montant_estime: 9999 }),
    r({ signe_le: '2026-09-01', fermeture: 'annulee', montant_estime: 9999 }),
    r({ signe_le: '2026-09-01', origine: 'airbnb', montant_estime: 9999 }),
    r({ signe_le: '2025-09-01', exercice: 2026, montant_estime: 9999 }),
  ]
  const m = revenusParMois(rs, 2027)
  assert.equal(m.length, 12)
  assert.equal(m[0], 500)
  assert.equal(m[11], 300)
  assert.equal(m.reduce((a, b) => a + b, 0), 800)
})

test('revenus de référence : 12 mois d’octobre à septembre, null sans données', () => {
  const lignes = [
    { exercice: 2025, mois: 10, montant: '49006.50' },
    { exercice: 2025, mois: 9, montant: 23126.34 },
  ]
  const m = revenusReference(lignes, 2025)
  assert.equal(m[0], 49006.5)
  assert.equal(m[11], 23126.34)
  assert.equal(revenusReference(lignes, 2024), null)
})

test('groupes par mois et par forfait', () => {
  const rs = [
    r({ signe_le: '2026-09-01', forfait: 'classe_nature', variante: 'verte', date_arrivee: '2026-11-03', date_depart: '2026-11-05', montant_estime: 1000 }),
    r({ signe_le: '2026-09-02', forfait: 'classe_nature', variante: 'verte', date_arrivee: '2026-11-01', date_depart: '2026-11-03', montant_estime: 2000 }),
    r({ signe_le: '2026-09-03', forfait: 'accueil_groupe', variante: null, date_arrivee: '2027-01-10', date_depart: '2027-01-11', montant_estime: 500 }),
  ]
  const mois = groupesParMois(rs, 2027)
  const nov = mois.find((m) => m.mois === 11)
  assert.equal(nov.groupes.length, 2)
  assert.equal(nov.groupes[0].date_arrivee, '2026-11-01')
  assert.equal(nov.montant, 3000)
  const f = parForfait(rs, 2027)
  assert.deepEqual(
    f.map((l) => [l.forfait, l.variante, l.groupes, l.montant]),
    [
      ['classe_nature', 'verte', 2, 3000],
      ['accueil_groupe', null, 1, 500],
    ],
  )
})

test('entonnoir : demandes → estimé envoyé → signé → séjour fait, par clé et au total', () => {
  const rs = [
    r({ etape: 'nouvelle', fermeture: 'closed_lost' }),
    r({ etape: 'estime_envoye', fermeture: 'closed_lost' }),
    r({ etape: 'contrat_envoye' }),
    r({ etape: 'confirmee', signe_le: '2026-09-01', date_depart: '2026-10-01' }),
    r({ etape: 'confirmee', signe_le: '2026-09-01', fermeture: 'annulee', date_depart: '2026-10-01' }),
    r({ etape: 'confirmee', signe_le: '2026-09-01', forfait: 'classe_nature', date_depart: '2027-05-01' }),
    r({ origine: 'airbnb', etape: 'confirmee' }),
  ]
  const e = entonnoir(rs, 2027, (x) => x.forfait, '2026-10-12')
  assert.deepEqual(e.get(''), { demandes: 6, estimes: 5, signees: 3, faites: 1 })
  assert.deepEqual(e.get('classe_nature'), { demandes: 1, estimes: 1, signees: 1, faites: 0 })
})

test('prévision : signé + estimés en cours × taux de leur étape sur l’exercice précédent', () => {
  const avant = [
    // 2026 : 4 arrivés à « estimé envoyé », 2 signés → 50 % ; contrat envoyé : 2 sur 2 → 100 %.
    r({ exercice: 2026, etape: 'estime_envoye', fermeture: 'closed_lost' }),
    r({ exercice: 2026, etape: 'estime_envoye', fermeture: 'closed_lost' }),
    r({ exercice: 2026, etape: 'facture_finale', signe_le: '2025-09-01' }),
    r({ exercice: 2026, etape: 'facture_finale', signe_le: '2025-09-01' }),
  ]
  const ouverts = [
    r({ etape: 'estime_envoye', montant_estime: 1000 }),
    r({ etape: 'contrat_envoye', montant_estime: 400 }),
    r({ etape: 'estime_envoye', fermeture: 'closed_lost', montant_estime: 9999 }),
    r({ etape: 'confirmee', signe_le: '2026-09-01', montant_estime: 2000 }),
  ]
  const p = prevision([...avant, ...ouverts], 2027)
  assert.equal(p.signe, 2000)
  const envoye = p.lignes.find((l) => l.etape === 'estime_envoye')
  assert.equal(envoye.taux, 0.5)
  assert.equal(envoye.pondere, 500)
  assert.equal(p.lignes.find((l) => l.etape === 'contrat_envoye').pondere, 400)
  assert.equal(p.pondere, 900)
})

test('rythme : signé à ce jour comparé au même jour l’an passé', () => {
  assert.equal(anPasse('2026-10-12'), '2025-10-12')
  assert.equal(anPasse('2028-02-29'), '2027-02-28')
  const rs = [
    r({ exercice: 2027, signe_le: '2026-06-01', montant_estime: 1000 }),
    r({ exercice: 2027, signe_le: '2026-11-01', montant_estime: 5000 }),
    r({ exercice: 2026, signe_le: '2025-05-01', montant_estime: 700 }),
    r({ exercice: 2026, signe_le: '2025-10-20', montant_estime: 300 }),
  ]
  const ry = rythme(rs, 2027, '2026-10-12')
  assert.equal(ry.aCeJour.courant, 1000)
  assert.equal(ry.aCeJour.precedent, 700)
  assert.equal(ry.aCeJour.groupes, 1)
  assert.equal(ry.jours[0], '2025-10-01')
  assert.equal(ry.jours.at(-1), '2027-09-30')
  // Pas de valeurs futures pour l'exercice en cours ; l'an passé va jusqu'au bout.
  assert.ok(Number.isNaN(ry.courant.at(-1)))
  assert.equal(ry.precedent.at(-1), 1000)
})

test('pertes par raison et délais médians', () => {
  const rs = [
    r({ fermeture: 'closed_lost', raison_perte: 'prix', montant_estime: 100 }),
    r({ fermeture: 'closed_lost', raison_perte: 'prix', montant_estime: 100 }),
    r({ fermeture: 'closed_lost', raison_perte: null }),
    r({ signe_le: '2026-09-11', demande_le: '2026-09-01T10:00:00+00:00', date_arrivee: '2026-10-11', date_depart: '2026-10-12' }),
    r({ signe_le: '2026-09-21', demande_le: '2026-09-01T10:00:00+00:00', date_arrivee: '2026-10-21', date_depart: '2026-10-22' }),
    // Signature saisie avant la demande : écartée.
    r({ signe_le: '2012-11-25', demande_le: '2026-09-01T10:00:00+00:00', date_arrivee: '2026-10-21', date_depart: '2026-10-22' }),
  ]
  const p = raisonsPerte(rs, 2027)
  assert.deepEqual(p[0], { raison: 'prix', groupes: 2, montant: 200 })
  assert.equal(p[1].raison, null)
  const d = delais(rs, 2027).get('')
  assert.equal(d.groupes, 3)
  assert.equal(d.demandeSignature, 15)
  assert.equal(mediane([1, 2, 3, 4]), 2.5)
})

test('occupation : nuits [arrivée, départ), confirmées seulement, Airbnb compris', () => {
  const rs = [
    r({ etape: 'confirmee', etages: ['VFB'], date_arrivee: '2026-11-10', date_depart: '2026-11-12' }),
    r({ origine: 'airbnb', etape: 'confirmee', etages: ['VFH'], date_arrivee: '2026-11-11', date_depart: '2026-11-12' }),
    r({ etape: 'estime_envoye', etages: ['CH'], date_arrivee: '2026-11-10', date_depart: '2026-11-12' }),
    r({ etape: 'confirmee', etages: [], salles: [], date_arrivee: '2026-11-20', date_depart: '2026-11-22' }),
  ]
  const g = grilleOccupation(rs, 2026, 11)
  const vfb = g.sections.find((s) => s.code === 'VFB')
  assert.ok(vfb.nuits[9]) // 10 novembre
  assert.ok(vfb.nuits[10]) // 11
  assert.equal(vfb.nuits[11], null) // 12 : jour du départ, libre
  assert.ok(g.sections.find((s) => s.code === 'VFH').nuits[10])
  assert.equal(g.sections.find((s) => s.code === 'CH').nuits[9], null)
  const lits = [
    { code: 'VFB', lits: 23 },
    { code: 'VFH', lits: 36 },
  ]
  const nov = occupationParMois(rs, lits, 2027).find((m) => m.mois === 11)
  assert.equal(nov.litsNuits, 23 * 2 + 36)
  assert.equal(nov.capacite, (23 + 36) * 30)
  assert.equal(nov.sansSection, 1)
})

test('trois mesures : signé (estimé accepté), facturé (crédits déduits), encaissé', () => {
  const a = r({ signe_le: '2026-09-01' })
  const b = r({ signe_le: '2026-09-01' })
  const m = troisMesures(
    [a, b],
    2027,
    new Map([
      [a.id, 1149.75],
      [b.id, 2299.5],
    ]),
    [
      { reservation_id: a.id, qbo_type: 'Invoice', total: 1149.75, solde: 149.75, supprimee: false },
      { reservation_id: a.id, qbo_type: 'CreditMemo', total: 100, solde: 0, supprimee: false },
      { reservation_id: a.id, qbo_type: 'Invoice', total: 500, solde: 500, supprimee: true },
    ],
  )
  assert.equal(m.signe, 3449.25)
  assert.equal(m.facture, 1049.75)
  assert.equal(m.encaisse, 900)
  assert.equal(m.avecFactures, 1)
})
