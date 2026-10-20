// Soumission automatique des feuilles (echeance.ts). Lancer : npm run test:temps
// Mêmes cas que les essais SQL de temps.echeance_soumission.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { echeancePassee, echeanceSoumission, heureMontreal, libelleEcheance } from './echeance.ts'

test('heure de Montréal, avec ou sans heure avancée', () => {
  assert.equal(heureMontreal(new Date('2026-10-20T16:00:00Z')), '2026-10-20T12:00:00')
  assert.equal(heureMontreal(new Date('2026-11-03T17:00:00Z')), '2026-11-03T12:00:00')
  assert.equal(heureMontreal(new Date('2026-10-21T03:30:00Z')), '2026-10-20T23:30:00')
})

test("échéance d'une période : le mardi qui suit sa fin", () => {
  assert.equal(echeanceSoumission('2026-10-04'), '2026-10-20') // PP21
  assert.equal(echeanceSoumission('2026-10-18'), '2026-11-03') // PP22
  assert.equal(echeanceSoumission('2026-10-25'), '2026-11-03') // n'importe quel jour de la période
  assert.equal(echeanceSoumission('2026-12-27'), '2027-01-12') // à cheval sur deux années
})

test('renvoyée : premier mardi midi au moins 24 h après le renvoi', () => {
  // Renvoi avant l'échéance de la période : l'échéance tient.
  assert.equal(echeanceSoumission('2026-10-04', '2026-10-15T15:00:00Z'), '2026-10-20')
  // Lundi 26 oct. 10 h : le mardi 27 à midi.
  assert.equal(echeanceSoumission('2026-10-04', '2026-10-26T14:00:00Z'), '2026-10-27')
  // Mardi 27 oct. 11 h : moins de 24 h avant midi, donc le mardi suivant.
  assert.equal(echeanceSoumission('2026-10-04', '2026-10-27T15:00:00Z'), '2026-11-03')
  // Lundi 26 oct. midi pile : 24 h plus tard = mardi midi, encore à temps.
  assert.equal(echeanceSoumission('2026-10-04', '2026-10-26T16:00:00Z'), '2026-10-27')
  assert.equal(echeanceSoumission('2026-10-04', '2026-10-26T16:00:01Z'), '2026-11-03')
  assert.equal(echeanceSoumission('2026-10-04', null), '2026-10-20')
})

test('échéance passée à midi pile, heure de Montréal', () => {
  assert.equal(echeancePassee('2026-10-20', new Date('2026-10-20T15:59:59Z')), false)
  assert.equal(echeancePassee('2026-10-20', new Date('2026-10-20T16:00:00Z')), true)
  assert.equal(echeancePassee('2026-11-03', new Date('2026-11-03T16:30:00Z')), false) // 11 h 30, heure normale
  assert.equal(echeancePassee('2026-11-03', new Date('2026-11-03T17:00:00Z')), true)
})

test('libellé', () => {
  assert.equal(libelleEcheance('2026-11-03'), 'mardi 3 nov. à midi')
  assert.equal(libelleEcheance('2026-12-01'), 'mardi 1er déc. à midi')
})
