// Date cible des achats (src/modules/achats/outils.ts).
// Lancer : node --test src/modules/achats/outils.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aCommanderBientot, comparerParDate, dateValide, etatCible, joursAvant, libelleCible } from './outils.ts'

const JOUR = '2026-10-14'
const achat = (item, statut, date_cible) => ({ item, statut, date_cible })

test('joursAvant compte les jours entiers, passé négatif', () => {
  assert.equal(joursAvant('2026-10-19', JOUR), 5)
  assert.equal(joursAvant('2026-10-11', JOUR), -3)
  assert.equal(joursAvant('2026-11-02', '2026-10-31'), 2) // changement d'heure
})

test('etatCible : rouge passé, ambre à 7 jours ou moins, rien après la commande', () => {
  assert.equal(etatCible(achat('a', 'a_commander', '2026-10-13'), JOUR), 'retard')
  assert.equal(etatCible(achat('a', 'a_commander', JOUR), JOUR), 'proche')
  assert.equal(etatCible(achat('a', 'a_commander', '2026-10-21'), JOUR), 'proche')
  assert.equal(etatCible(achat('a', 'a_commander', '2026-10-22'), JOUR), 'plus_tard')
  assert.equal(etatCible(achat('a', 'commande', '2026-10-01'), JOUR), null)
  assert.equal(etatCible(achat('a', 'recu', '2026-10-15'), JOUR), null)
  assert.equal(etatCible(achat('a', 'a_commander', null), JOUR), null)
})

test('aCommanderBientot : en retard + 30 jours, sans date jamais', () => {
  const r = aCommanderBientot(
    [
      achat('60 jours', 'a_commander', '2026-12-13'),
      achat('20 jours', 'a_commander', '2026-11-03'),
      achat('sans date', 'a_commander', null),
      achat('retard', 'a_commander', '2026-10-11'),
      achat('5 jours', 'a_commander', '2026-10-19'),
      achat('30 jours', 'a_commander', '2026-11-13'),
      achat('31 jours', 'a_commander', '2026-11-14'),
      achat('commandé en retard', 'commande', '2026-10-04'),
      achat('vieux retard', 'a_commander', '2026-09-01'),
    ],
    JOUR,
  )
  assert.deepEqual(r.enRetard.map((a) => a.item), ['vieux retard', 'retard'])
  assert.deepEqual(r.aVenir.map((a) => a.item), ['5 jours', '20 jours', '30 jours'])
  assert.equal(r.nombre, 5)
})

test('libelleCible', () => {
  assert.equal(libelleCible('2026-10-13', JOUR), 'En retard de 1 jour')
  assert.equal(libelleCible('2026-10-11', JOUR), 'En retard de 3 jours')
  assert.equal(libelleCible(JOUR, JOUR), "Aujourd'hui")
  assert.equal(libelleCible('2026-10-15', JOUR), 'Demain')
  assert.equal(libelleCible('2026-10-19', JOUR), 'Dans 5 jours')
  assert.equal(libelleCible('2026-11-01', JOUR), "D'ici le 1er nov.")
  assert.equal(libelleCible('2027-01-03', JOUR), "D'ici le 3 janv. 2027")
})

test('dateValide refuse une date en cours de frappe', () => {
  assert.equal(dateValide('2026-10-14'), true)
  assert.equal(dateValide('0002-10-14'), false)
  assert.equal(dateValide('0202-10-14'), false)
  assert.equal(dateValide(''), false)
})

test('comparerParDate : la plus proche d’abord, sans date à la fin', () => {
  const liste = [
    achat('Zèbre', 'a_commander', null),
    achat('Arc', 'recu', null),
    achat('Tente', 'a_commander', '2026-11-03'),
    achat('Quai', 'commande', '2026-10-04'),
  ].sort(comparerParDate)
  assert.deepEqual(liste.map((a) => a.item), ['Quai', 'Tente', 'Zèbre', 'Arc'])
})
