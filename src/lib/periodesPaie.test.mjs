// Périodes de paie (src/lib/periodesPaie.ts). Lancer : npm run test:periodes
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  codePeriodePaie,
  datePaie,
  dateVersementPaie,
  debutPeriodePaie,
  finPeriodePaie,
  libellePeriodePaie,
  numeroPeriodePaie,
  periodesPaieEntre,
  PREMIERE_PERIODE_PAIE,
} from './periodesPaie.ts'

const jourSemaine = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay()

test('périodes de 14 jours, du dimanche au samedi, calées sur le 4 octobre 2026', () => {
  assert.equal(debutPeriodePaie(PREMIERE_PERIODE_PAIE), '2026-10-04')
  assert.equal(debutPeriodePaie('2026-10-14'), '2026-10-04')
  assert.equal(debutPeriodePaie('2026-10-17'), '2026-10-04')
  assert.equal(debutPeriodePaie('2026-10-18'), '2026-10-18')
  assert.equal(finPeriodePaie('2026-10-04'), '2026-10-17')
  // N'importe quel jour de la période.
  assert.equal(finPeriodePaie('2026-10-10'), '2026-10-17')
  // Le cycle se prolonge avant la première période du module.
  assert.equal(debutPeriodePaie('2026-10-03'), '2026-09-20')
  assert.equal(debutPeriodePaie('2026-09-20'), '2026-09-20')
  assert.equal(debutPeriodePaie('2025-12-25'), '2025-12-14')
  for (const d of periodesPaieEntre('2024-01-01', '2029-12-31')) {
    assert.equal(jourSemaine(d), 0, `${d} doit être un dimanche`)
    assert.equal(jourSemaine(finPeriodePaie(d)), 6)
    assert.equal(jourSemaine(datePaie(d)), 4, `paie de ${d} : un jeudi`)
  }
})

test('repères donnés par Maxime (Employeur D)', () => {
  // 20 sept. – 3 oct. 2026 = PP20, payée le 8 oct. (première paie de l'exercice 2026-27).
  assert.equal(finPeriodePaie('2026-09-20'), '2026-10-03')
  assert.equal(datePaie('2026-09-20'), '2026-10-08')
  assert.deepEqual(numeroPeriodePaie('2026-09-20'), { numero: 20, annee: 2026 })
  // 4 – 17 oct. = PP21.
  assert.deepEqual(numeroPeriodePaie('2026-10-04'), { numero: 21, annee: 2026 })
  assert.equal(datePaie('2026-10-04'), '2026-10-22')
  // 1er – 14 nov. = PP23.
  assert.deepEqual(numeroPeriodePaie('2026-11-01'), { numero: 23, annee: 2026 })
  // 13 – 26 déc. 2026 = PP26, payée le 31 déc.
  assert.equal(finPeriodePaie('2026-12-13'), '2026-12-26')
  assert.equal(datePaie('2026-12-13'), '2026-12-31')
  assert.deepEqual(numeroPeriodePaie('2026-12-13'), { numero: 26, annee: 2026 })
  // 27 déc. 2026 – 9 janv. 2027 = PP1 de 2027, payée le 14 janv. 2027.
  assert.equal(finPeriodePaie('2026-12-27'), '2027-01-09')
  assert.equal(datePaie('2026-12-27'), '2027-01-14')
  assert.deepEqual(numeroPeriodePaie('2026-12-27'), { numero: 1, annee: 2027 })
  // 2025 avait 27 paies : celle du 1er janv. 2026, versée le 31 déc. 2025 = PP27 de 2025.
  assert.equal(datePaie('2025-12-14'), '2026-01-01')
  assert.equal(dateVersementPaie('2025-12-14'), '2025-12-31')
  assert.deepEqual(numeroPeriodePaie('2025-12-14'), { numero: 27, annee: 2025 })
  // La suivante ouvre 2026.
  assert.deepEqual(numeroPeriodePaie('2025-12-28'), { numero: 1, annee: 2026 })
  assert.equal(datePaie('2025-12-28'), '2026-01-15')
})

test('numéros consécutifs dans chaque année, 26 ou 27 paies', () => {
  const parAnnee = new Map()
  for (const d of periodesPaieEntre('2023-01-01', '2040-12-31')) {
    const { numero, annee } = numeroPeriodePaie(d)
    if (!parAnnee.has(annee)) parAnnee.set(annee, [])
    parAnnee.get(annee).push(numero)
  }
  for (const [annee, numeros] of parAnnee) {
    if (annee < 2024 || annee > 2039) continue // années coupées par l'intervalle
    assert.deepEqual(numeros, numeros.map((_, i) => i + 1), `numéros de ${annee}`)
    assert.ok(numeros.length === 26 || numeros.length === 27, `${annee} : ${numeros.length} paies`)
  }
  assert.equal(parAnnee.get(2025).length, 27)
  assert.equal(parAnnee.get(2026).length, 26)
  // Prochaine année à 27 paies : la paie tombe de nouveau un 1er janvier (2026 + 11 ans = 1er janv. 2037).
  assert.equal(parAnnee.get(2036).length, 27)
  assert.equal(dateVersementPaie(debutPeriodePaie('2036-12-20')), '2036-12-31')
})

test('libellés', () => {
  assert.equal(libellePeriodePaie('2026-11-01'), 'PP23 · 1er au 14 nov.')
  assert.equal(libellePeriodePaie('2026-11-05'), 'PP23 · 1er au 14 nov.')
  assert.equal(libellePeriodePaie('2026-10-04'), 'PP21 · 4 au 17 oct.')
  assert.equal(libellePeriodePaie('2026-10-18'), 'PP22 · 18 au 31 oct.')
  assert.equal(libellePeriodePaie('2026-11-29'), 'PP25 · 29 nov. au 12 déc.')
  assert.equal(libellePeriodePaie('2026-12-27'), 'PP1 · 27 déc. au 9 janv.')
  assert.equal(libellePeriodePaie('2026-11-01', { annee: true }), 'PP23 · 1er au 14 nov. 2026')
  assert.equal(libellePeriodePaie('2026-11-29', { annee: true }), 'PP25 · 29 nov. au 12 déc. 2026')
  assert.equal(libellePeriodePaie('2026-12-27', { annee: true }), 'PP1 · 27 déc. 2026 au 9 janv. 2027')
  // Fin un 1er du mois.
  assert.equal(libellePeriodePaie('2027-04-18'), 'PP9 · 18 avr. au 1er mai')
  assert.equal(codePeriodePaie('2026-10-04'), 'PP21')
})

test('liste des périodes et dates invalides', () => {
  assert.deepEqual(periodesPaieEntre('2026-10-10', '2026-11-01'), ['2026-10-04', '2026-10-18', '2026-11-01'])
  assert.deepEqual(periodesPaieEntre('2026-10-04', '2026-10-04'), ['2026-10-04'])
  assert.throws(() => debutPeriodePaie('2026-02-30'), RangeError)
  assert.throws(() => debutPeriodePaie('4 oct.'), RangeError)
})
