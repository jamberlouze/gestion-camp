// Jours fériés (src/lib/feries.ts). Lancer : npm run test:periodes
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ferie, feriesAnnee } from './feries.ts'

test('liste de la CNESST, 2026 et 2027', () => {
  assert.deepEqual(feriesAnnee(2026), [
    { jour: '2026-01-01', nom: "Jour de l'An" },
    { jour: '2026-04-06', nom: 'Lundi de Pâques' },
    { jour: '2026-05-18', nom: 'Journée nationale des patriotes' },
    { jour: '2026-06-24', nom: 'Fête nationale' },
    { jour: '2026-07-01', nom: 'Fête du Canada' },
    { jour: '2026-09-07', nom: 'Fête du Travail' },
    { jour: '2026-10-12', nom: 'Action de grâces' },
    { jour: '2026-12-25', nom: 'Noël' },
  ])
  assert.deepEqual(
    feriesAnnee(2027).map((f) => f.jour),
    ['2027-01-01', '2027-03-29', '2027-05-24', '2027-06-24', '2027-07-01', '2027-09-06', '2027-10-11', '2027-12-25'],
  )
})

test('Pâques : dimanche de Pâques connu → lundi de Pâques', () => {
  // Pâques : 20 avr. 2025, 5 avr. 2026, 28 mars 2027, 16 avr. 2028, 1er avr. 2029.
  assert.deepEqual(
    [2025, 2026, 2027, 2028, 2029].map((a) => feriesAnnee(a)[1].jour),
    ['2025-04-21', '2026-04-06', '2027-03-29', '2028-04-17', '2029-04-02'],
  )
})

test('patriotes : le lundi avant le 25 mai, même quand le 25 est un lundi', () => {
  assert.equal(feriesAnnee(2026)[2].jour, '2026-05-18') // 25 mai 2026 = lundi
  assert.equal(feriesAnnee(2027)[2].jour, '2027-05-24') // 25 mai 2027 = mardi
  assert.equal(feriesAnnee(2025)[2].jour, '2025-05-19') // 25 mai 2025 = dimanche
})

test('Fête nationale et fête du Canada un dimanche : reportées au lundi', () => {
  assert.equal(ferie('2029-06-24'), null)
  assert.equal(ferie('2029-06-25'), 'Fête nationale')
  assert.equal(ferie('2029-07-01'), null)
  assert.equal(ferie('2029-07-02'), 'Fête du Canada')
  // Un samedi : pas de report (2028).
  assert.equal(ferie('2028-07-01'), 'Fête du Canada')
})

test('ferie : un jour ordinaire → null', () => {
  assert.equal(ferie('2026-10-13'), null)
  assert.equal(ferie('2026-10-12'), 'Action de grâces')
})
