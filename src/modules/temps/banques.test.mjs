// Banques des feuilles de temps (banques.ts). Lancer : npm run test:temps
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { enJours, joursMaladiePour, mouvementsBanques, resumePeriode } from './banques.ts'

const semaine = (dimanche, heuresParJour, type = 'regulieres') => {
  const [a, m, j] = dimanche.split('-').map(Number)
  return heuresParJour.map((h, i) => {
    const d = new Date(Date.UTC(a, m - 1, j + i))
    return { jour: d.toISOString().slice(0, 10), type, heures: h }
  })
}

test('jours de maladie : 2 par défaut, réglage à partir d’une année', () => {
  assert.equal(joursMaladiePour(2026, []), 2)
  const r = [{ annee: 2027, jours: 3 }, { annee: 2029, jours: 5 }]
  assert.equal(joursMaladiePour(2026, r), 2)
  assert.equal(joursMaladiePour(2027, r), 3)
  assert.equal(joursMaladiePour(2028, r), 3)
  assert.equal(joursMaladiePour(2030, r), 5)
})

test('maladie : accordée le 1er janvier, 8 h par jour, déduite, reportée', () => {
  const heures = [{ jour: '2026-10-06', type: 'maladie', heures: 8 }, { jour: '2026-10-07', type: 'maladie', heures: 4 }]
  const m = mouvementsBanques({ heures, ajustements: [], reglagesMaladie: [], au: '2026-10-17' })
  const maladie = m.filter((x) => x.banque === 'maladie')
  assert.deepEqual(maladie.map((x) => [x.jour, x.heures, x.solde]), [
    ['2026-01-01', 16, 16],
    ['2026-10-10', -12, 4],
  ])
  assert.equal(enJours(4), 0.5)
  // 2027 : 2 jours de plus, le solde de 2026 reste (jamais remis à zéro tout seul).
  const m2 = mouvementsBanques({ heures, ajustements: [], reglagesMaladie: [{ annee: 2027, jours: 3 }], au: '2027-02-01' })
  assert.equal(m2.filter((x) => x.banque === 'maladie').at(-1).solde, 4 + 24)
})

test('heures accumulées : au-delà de 40 h par semaine, à 1×, déduites quand on les prend', () => {
  const heures = [
    // Semaine du 4 oct. : 5 × 9 h = 45 h → +5 h ; woofing, vacances et maladie ne comptent pas.
    ...semaine('2026-10-04', [0, 9, 9, 9, 9, 9, 0]),
    { jour: '2026-10-10', type: 'woofing', heures: 6 },
    { jour: '2026-10-05', type: 'vacances', heures: 8 },
    { jour: '2026-10-09', type: 'maladie', heures: 4 },
    // Semaine du 11 oct. : 38 h régulières + 2 h prises en banque → rien d'ajouté, −2 h.
    ...semaine('2026-10-11', [0, 8, 8, 8, 8, 6, 0]),
    { jour: '2026-10-16', type: 'banque', heures: 2 },
    // Semaine du 18 oct. : exactement 40 h → rien.
    ...semaine('2026-10-18', [0, 8, 8, 8, 8, 8, 0]),
  ].filter((h) => h.heures > 0)
  const m = mouvementsBanques({ heures, ajustements: [], reglagesMaladie: [], au: '2026-10-31' })
  const banque = m.filter((x) => x.banque === 'heures')
  assert.deepEqual(banque.map((x) => [x.jour, x.genre, x.heures, x.solde]), [
    ['2026-10-10', 'accumulees', 5, 5],
    ['2026-10-17', 'prises', -2, 3],
  ])
  const r = resumePeriode(m, 'heures', '2026-10-04', '2026-10-17')
  assert.deepEqual([r.avant, r.ajouts, r.retraits, r.apres], [0, 5, -2, 3])
  const suivante = resumePeriode(m, 'heures', '2026-10-18', '2026-10-31')
  assert.deepEqual([suivante.avant, suivante.apres, suivante.mouvements.length], [3, 3, 0])
})

test('employé de deux compagnies : toutes ses heures comptent pour les 40 h', () => {
  const heures = [...semaine('2026-10-04', [0, 6, 6, 6, 6, 6, 0]), ...semaine('2026-10-04', [0, 3, 3, 3, 3, 0, 0])]
  const m = mouvementsBanques({ heures, ajustements: [], reglagesMaladie: [], au: '2026-10-17' })
  assert.equal(m.find((x) => x.genre === 'accumulees').heures, 2)
})

test('ajustements : solde de départ, heures payées, triés par date ; rien après « au »', () => {
  const ajustements = [
    { id: 'a', banque: 'heures', jour: '2026-10-03', heures: 12, note: 'Solde de départ', auteur_nom: 'Admin', created_at: '' },
    { id: 'b', banque: 'heures', jour: '2026-10-22', heures: -10, note: 'Heures payées', auteur_nom: 'Admin', created_at: '' },
    { id: 'c', banque: 'maladie', jour: '2026-12-31', heures: -16, note: 'Non pris, perdu', auteur_nom: 'Admin', created_at: '' },
  ]
  const heures = semaine('2026-10-04', [0, 10, 10, 10, 10, 2, 0])
  const m = mouvementsBanques({ heures, ajustements, reglagesMaladie: [], au: '2026-10-31' })
  const banque = m.filter((x) => x.banque === 'heures')
  assert.deepEqual(banque.map((x) => [x.jour, x.heures, x.solde]), [
    ['2026-10-03', 12, 12],
    ['2026-10-10', 2, 14],
    ['2026-10-22', -10, 4],
  ])
  assert.equal(m.filter((x) => x.banque === 'maladie').at(-1).solde, 16)
  const r = resumePeriode(m, 'heures', '2026-10-18', '2026-10-31')
  assert.deepEqual([r.avant, r.retraits, r.apres], [14, -10, 4])
  // Solde négatif possible (affiché en rouge) : pas de blocage.
  const neg = mouvementsBanques({ heures: [{ jour: '2026-10-05', type: 'banque', heures: 8 }], ajustements: [], reglagesMaladie: [], au: '2026-10-17' })
  assert.equal(neg.at(-1).solde, -8)
})

test('semaine en cours : datée de « au », pas du samedi à venir', () => {
  const heures = semaine('2026-10-11', [0, 11, 11, 11, 11, 0, 0])
  const m = mouvementsBanques({ heures, ajustements: [], reglagesMaladie: [], au: '2026-10-15' })
  assert.deepEqual(m.filter((x) => x.banque === 'heures').map((x) => [x.jour, x.heures]), [['2026-10-15', 4]])
})
