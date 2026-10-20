// Banque d'heures des feuilles de temps (banques.ts). Lancer : npm run test:temps
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  alerteBanque,
  attenduPeriode,
  banqueAffichee,
  etatBanqueHeures,
  heuresTirees,
  libelleSeuil,
  mouvementsBanqueHeures,
  resumePeriode,
  seuilSemaine,
} from './banques.ts'

const semaine = (dimanche, heuresParJour, type = 'regulieres') => {
  const [a, m, j] = dimanche.split('-').map(Number)
  return heuresParJour.map((h, i) => {
    const d = new Date(Date.UTC(a, m - 1, j + i))
    return { jour: d.toISOString().slice(0, 10), type, heures: h }
  })
}
const pleine = (dimanche) => semaine(dimanche, [0, 8, 8, 8, 8, 8, 0])
// Mise en banque activée dès PP21 (sans ligne : désactivée, pour tout le monde).
const ACTIF = [{ depuis: '2026-10-04', active: true }]

test('maladie : plus de banque dans l’app (Employeur D), ni octroi ni retrait ; ses heures comptent dans la période', () => {
  // PP21 : 28 h + 32 h régulières et 12 h de maladie = 72 h sur 72 : rien ; l'ancien ajustement « maladie » est ignoré.
  const heures = [
    ...semaine('2026-10-04', [0, 0, 0, 7, 7, 7, 7]),
    { jour: '2026-10-05', type: 'maladie', heures: 8 },
    { jour: '2026-10-06', type: 'maladie', heures: 4 },
    ...semaine('2026-10-11', [0, 0, 8, 8, 8, 8, 0]),
  ]
  const ajustements = [{ id: 'm', banque: 'maladie', jour: '2026-10-03', heures: 16, note: 'Ancien solde maladie', auteur_nom: 'Admin', created_at: '' }]
  assert.deepEqual(mouvementsBanqueHeures({ heures, ajustements, au: '2027-02-01', etatsHeures: ACTIF }), [])
})

test('heures accumulées : régulières de la période au-delà des heures attendues, à 1×', () => {
  const heures = [
    // PP21 (72 h attendues) : 45 h + 30 h = 75 h régulières → +3 ; woofing, vacances et maladie n'en créent pas.
    ...semaine('2026-10-04', [0, 9, 9, 9, 9, 9, 0]),
    { jour: '2026-10-10', type: 'woofing', heures: 6 },
    { jour: '2026-10-05', type: 'vacances', heures: 8 },
    { jour: '2026-10-09', type: 'maladie', heures: 4 },
    ...semaine('2026-10-11', [0, 0, 8, 8, 8, 6, 0]),
    { jour: '2026-10-16', type: 'banque', heures: 2 }, // ancienne heure prise à la main : déduite
    // PP22 (80 h attendues) : 80 h → rien.
    ...pleine('2026-10-18'),
    ...pleine('2026-10-25'),
  ].filter((h) => h.heures > 0)
  const m = mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-10-31', etatsHeures: ACTIF })
  assert.deepEqual(m.map((x) => [x.jour, x.genre, x.heures, x.solde]), [
    ['2026-10-17', 'accumulees', 3, 3],
    ['2026-10-17', 'prises', -2, 1],
  ])
  assert.equal(m[0].libelle, 'Accumulées, PP21 · 4 au 17 oct.')
  const r = resumePeriode(m, '2026-10-04', '2026-10-17')
  assert.deepEqual([r.avant, r.ajouts, r.retraits, r.apres], [0, 3, -2, 1])
  const suivante = resumePeriode(m, '2026-10-18', '2026-10-31')
  assert.deepEqual([suivante.avant, suivante.apres, suivante.mouvements.length], [1, 1, 0])
})

test('période complète : une semaine longue et une semaine courte s’annulent', () => {
  // PP21 de la direction : 31 h, puis 1 h + 40 h de vacances = 72 h sur 72 → rien (pas −9 puis +9).
  const vacances = [
    ...semaine('2026-10-04', [0, 1, 7, 8, 6, 8, 1]),
    { jour: '2026-10-11', type: 'regulieres', heures: 1 },
    ...semaine('2026-10-11', [0, 8, 8, 8, 8, 8, 0], 'vacances'),
  ]
  assert.deepEqual(mouvementsBanqueHeures({ heures: vacances, ajustements: [], au: '2026-10-31', etatsHeures: ACTIF }), [])
  // PP22 : 50 h puis 30 h = 80 h sur 80 → rien.
  const inegales = [...semaine('2026-10-18', [0, 10, 10, 10, 10, 10, 0]), ...semaine('2026-10-25', [0, 6, 6, 6, 6, 6, 0])]
  assert.deepEqual(mouvementsBanqueHeures({ heures: inegales, ajustements: [], au: '2026-11-07', etatsHeures: ACTIF }), [])
})

test('employé de deux compagnies : toutes ses heures comptent', () => {
  const heures = [...semaine('2026-10-04', [0, 6, 6, 6, 6, 6, 0]), ...semaine('2026-10-04', [0, 3, 3, 3, 3, 0, 0]), ...semaine('2026-10-11', [0, 0, 8, 8, 8, 8, 0])]
  const m = mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-10-17', etatsHeures: ACTIF })
  assert.equal(m.find((x) => x.genre === 'accumulees').heures, 2) // 74 h sur 72
})

test('ajustements : solde de départ, heures payées, triés par date ; rien après « au » ; anciens « maladie » ignorés', () => {
  const ajustements = [
    { id: 'a', banque: 'heures', jour: '2026-10-03', heures: 12, note: 'Solde de départ', auteur_nom: 'Admin', created_at: '' },
    { id: 'b', banque: 'heures', jour: '2026-10-22', heures: -10, note: 'Heures payées', auteur_nom: 'Admin', created_at: '' },
    { id: 'c', banque: 'maladie', jour: '2026-10-05', heures: -16, note: 'Non pris, perdu', auteur_nom: 'Admin', created_at: '' },
    { id: 'd', banque: 'heures', jour: '2026-11-05', heures: 3, note: 'Après « au »', auteur_nom: 'Admin', created_at: '' },
  ]
  const heures = [...semaine('2026-10-04', [0, 10, 10, 10, 10, 2, 0]), ...semaine('2026-10-11', [0, 0, 8, 8, 8, 8, 0])] // 74 h sur 72
  const m = mouvementsBanqueHeures({ heures, ajustements, au: '2026-10-31', etatsHeures: ACTIF })
  assert.deepEqual(m.map((x) => [x.jour, x.heures, x.solde]), [
    ['2026-10-03', 12, 12],
    ['2026-10-17', 2, 14],
    ['2026-10-22', -10, 4],
  ])
  const r = resumePeriode(m, '2026-10-18', '2026-10-31')
  assert.deepEqual([r.avant, r.retraits, r.apres], [14, -10, 4])
  // Solde négatif possible (affiché en rouge) : pas de blocage.
  const neg = mouvementsBanqueHeures({ heures: [{ jour: '2026-10-05', type: 'banque', heures: 8 }], ajustements: [], au: '2026-10-17' })
  assert.equal(neg.at(-1).solde, -8)
})

test('période en cours : un surplus déjà atteint se montre, daté de « au »', () => {
  const heures = [...semaine('2026-10-18', [0, 11, 11, 11, 11, 0, 0]), ...semaine('2026-10-25', [0, 11, 11, 11, 11, 0, 0])] // 88 h sur 80
  const m = mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-10-29', aujourdhui: '2026-10-29', etatsHeures: ACTIF })
  assert.deepEqual(m.map((x) => [x.jour, x.genre, x.heures]), [['2026-10-29', 'accumulees', 8]])
})

test('fériés : 8 h de moins par férié du lundi au vendredi dans les heures attendues de la période', () => {
  // PP21 de la direction : 52 h puis 33 h (rien le lundi 12) = 85 h sur 72 → +13.
  const heures = [...semaine('2026-10-04', [12, 8, 10, 8, 8, 6, 0]), ...semaine('2026-10-11', [0, 0, 8, 8, 5, 8, 4])]
  const m = mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-10-17', etatsHeures: ACTIF })
  assert.deepEqual(m.map((x) => [x.jour, x.heures, x.detail]), [['2026-10-17', 13, '85 h régulières, au-delà de 72 h (férié : Action de grâces)']])
  // Heures faites le férié : elles comptent comme les autres (80 h → +8).
  const travaille = mouvementsBanqueHeures({ heures: [...pleine('2026-10-04'), ...pleine('2026-10-11')], ajustements: [], au: '2026-10-17', etatsHeures: ACTIF })
  assert.equal(travaille.at(-1).solde, 8)
  assert.deepEqual(seuilSemaine('2026-10-14'), { seuil: 32, feries: [{ jour: '2026-10-12', nom: 'Action de grâces' }] })
  assert.deepEqual(attenduPeriode('2026-10-14'), { attendu: 72, feries: [{ jour: '2026-10-12', nom: 'Action de grâces' }] })
  // Noël (ven.) dans PP26, le jour de l'An (ven.) dans PP1 : 72 h chacune.
  assert.equal(attenduPeriode('2026-12-20').attendu, 72)
  assert.equal(attenduPeriode('2026-12-27').attendu, 72)
  // Noël 2027 et le jour de l'An 2028 tombent un samedi : 80 h.
  assert.equal(seuilSemaine('2027-12-19').seuil, 40)
  assert.equal(attenduPeriode('2027-12-25').attendu, 80)
  assert.equal(libelleSeuil('2026-10-18'), 'au-delà de 80 h')
})

test('interrupteur « Heures en banque » : désactivé par défaut pour tout le monde, activé par une ligne', () => {
  const heures = [...semaine('2026-10-04', [0, 9, 9, 9, 9, 9, 0]), ...semaine('2026-10-11', [0, 0, 4, 4, 0, 0, 0])] // 53 h sur 72
  // Sans ligne : rien ne s'ajoute ni ne se retire, quel que soit le rôle.
  assert.deepEqual(mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-10-17' }), [])
  const active = mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-10-17', etatsHeures: ACTIF })
  assert.deepEqual(active.map((x) => [x.genre, x.heures]), [['tirees', -19]])
  assert.deepEqual(etatBanqueHeures([], '2026-10-10'), { active: false, depuis: null })
})

test('désactivée : plus rien ne s’ajoute ni ne se retire, le solde reste ; réactivée : le passé désactivé ne compte pas', () => {
  const heures = [
    ...semaine('2026-10-04', [0, 9, 9, 9, 9, 9, 0]), // PP21 : 90 h sur 72 → +18
    ...semaine('2026-10-11', [0, 9, 9, 9, 9, 9, 0]),
    ...semaine('2026-10-18', [0, 9, 9, 9, 9, 9, 0]), // PP22 : désactivée → rien
    { jour: '2026-10-20', type: 'banque', heures: 2 }, // ancienne heure prise à la main : déduite quand même
    ...semaine('2026-11-01', [0, 4, 4, 4, 4, 4, 0]), // PP23 : désactivée → rien de tiré
    ...semaine('2026-11-15', [0, 9, 9, 9, 9, 10, 0]), // PP24 : réactivée, 91 h sur 80 → +11
    ...semaine('2026-11-22', [0, 9, 9, 9, 9, 9, 0]),
  ]
  const etatsHeures = [
    ...ACTIF,
    { depuis: '2026-10-18', active: false },
    { depuis: '2026-11-15', active: true },
  ]
  const m = mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-11-28', etatsHeures })
  assert.deepEqual(m.map((x) => [x.genre, x.heures, x.solde]), [
    ['accumulees', 18, 18],
    ['prises', -2, 16],
    ['accumulees', 11, 27],
  ])
  // Ajustement permis pendant que c'est désactivé.
  const ajustements = [{ id: 'p', banque: 'heures', jour: '2026-11-05', heures: -3, note: 'Heures payées', auteur_nom: 'Admin', created_at: '' }]
  const m2 = mouvementsBanqueHeures({ heures, ajustements, au: '2026-11-28', etatsHeures })
  assert.equal(m2.at(-1).solde, 24)
  assert.deepEqual(etatBanqueHeures(etatsHeures, '2026-10-10'), { active: true, depuis: '2026-10-04' })
  assert.deepEqual(etatBanqueHeures(etatsHeures, '2026-11-01'), { active: false, depuis: '2026-10-18' })
  assert.deepEqual(etatBanqueHeures(etatsHeures, '2026-11-20'), { active: true, depuis: '2026-11-15' })
})

test('employé sans compte : heures accumulées si activée', () => {
  const heures = [
    ...semaine('2026-10-04', [0, 9, 9, 9, 9, 9, 0]),
    ...semaine('2026-10-11', [0, 0, 8, 8, 8, 6.5, 0]),
    { jour: '2026-10-13', type: 'banque', heures: 1.5 },
  ] // 75,5 h régulières sur 72 → +3,5, puis −1,5 prises à la main
  const m = mouvementsBanqueHeures({ heures, ajustements: [], au: '2027-02-01', etatsHeures: ACTIF })
  assert.equal(m.at(-1).solde, 2)
})

test('sommes par semaine (onglet Banques) : même résultat que les heures par jour', () => {
  const parJour = [...semaine('2026-10-04', [0, 9, 9, 9, 9, 9, 0]), { jour: '2026-10-12', type: 'banque', heures: 8 }, ...semaine('2026-10-11', [0, 0, 6, 6, 6, 0, 0], 'vacances')]
  const parSemaine = [
    { jour: '2026-10-04', type: 'regulieres', heures: 45 },
    { jour: '2026-10-11', type: 'banque', heures: 8 },
    { jour: '2026-10-11', type: 'vacances', heures: 18 },
  ]
  const a = mouvementsBanqueHeures({ heures: parJour, ajustements: [], au: '2026-10-17', etatsHeures: ACTIF })
  const b = mouvementsBanqueHeures({ heures: parSemaine, ajustements: [], au: '2026-10-17', etatsHeures: ACTIF })
  assert.ok(a.length > 0)
  assert.deepEqual(b.map((x) => [x.cle, x.heures, x.solde]), a.map((x) => [x.cle, x.heures, x.solde]))
})

test('banque d’un employé : affichée si activée, avec un solde, ou des heures prises ou tirées dans la période', () => {
  const [debut, fin] = ['2026-10-18', '2026-10-31']
  const employe = (heures, ajustements = []) => mouvementsBanqueHeures({ heures, ajustements, au: fin })
  // Désactivée, rien en banque : pas affichée ; activée : affichée.
  assert.equal(banqueAffichee(employe(semaine('2026-10-18', [0, 9, 9, 9, 9, 9, 0])), false, debut, fin), false)
  assert.equal(banqueAffichee([], true, debut, fin), true)
  // Désactivée avec un solde de départ (ajustement d'une période passée) : affichée.
  const depart = [{ id: 'd', banque: 'heures', jour: '2026-10-10', heures: 6, note: 'Solde de départ', auteur_nom: 'Admin', created_at: '' }]
  assert.equal(banqueAffichee(employe([], depart), false, debut, fin), true)
  // Tout pris dans la période : le solde de fin est nul, elle reste affichée.
  assert.equal(banqueAffichee(employe([{ jour: '2026-10-20', type: 'banque', heures: 6 }], depart), false, debut, fin), true)
  // Heures prises sans solde (par erreur) : solde négatif, affichée pour les corriger.
  assert.equal(banqueAffichee(employe([{ jour: '2026-10-20', type: 'banque', heures: 2 }]), false, debut, fin), true)
  // Solde remis à zéro par un ajustement dans une période passée : plus affichée.
  const remis = [...depart, { id: 'r', banque: 'heures', jour: '2026-10-15', heures: -6, note: 'Heures payées', auteur_nom: 'Admin', created_at: '' }]
  assert.equal(banqueAffichee(employe([], remis), false, debut, fin), false)
})

test('retrait automatique : le manque d’une période finie est tiré de la banque, dès PP21', () => {
  const heures = [
    ...semaine('2026-10-04', [0, 6, 6, 6, 6, 7, 0]), // PP21 : 31 h + 32 h = 63 h sur 72 → −9
    ...semaine('2026-10-11', [0, 0, 8, 8, 8, 8, 0]),
    ...pleine('2026-10-18'), // PP22 : 40 h + 32 h + 8 h de vacances = 80 h → rien (vacances et maladie comblent)
    ...semaine('2026-10-25', [0, 8, 8, 8, 8, 0, 0]),
    { jour: '2026-10-30', type: 'vacances', heures: 8 },
    ...pleine('2026-12-13'), // PP26 (Noël) : 40 h + 30 h = 70 h sur 72 → −2
    ...semaine('2026-12-20', [0, 8, 8, 6, 8, 0, 0]),
  ]
  const ajustements = [{ id: 'o', banque: 'heures', jour: '2026-10-04', heures: 30, note: 'Solde d’ouverture', auteur_nom: 'Admin', created_at: '' }]
  const m = mouvementsBanqueHeures({ heures, ajustements, au: '2026-12-31', aujourdhui: '2027-01-05', etatsHeures: ACTIF })
  assert.deepEqual(m.map((x) => [x.jour, x.genre, x.heures, x.solde]), [
    ['2026-10-04', 'ajustement', 30, 30],
    ['2026-10-17', 'tirees', -9, 21],
    ['2026-12-26', 'tirees', -2, 19],
  ])
  assert.equal(m[1].libelle, 'Tirées de la banque, PP21 · 4 au 17 oct.')
  assert.equal(m[1].detail, '63 h payées sur 72 h attendues (férié : Action de grâces)')
  assert.equal(m[2].detail, '70 h payées sur 72 h attendues (férié : Noël)')
  assert.equal(heuresTirees(m, '2026-10-04', '2026-10-17'), 9)
  assert.equal(heuresTirees(m, '2026-12-13', '2026-12-26'), 2)
})

test('retrait automatique : rien pour une période en cours, vide, ou banque désactivée', () => {
  const heures = semaine('2026-10-18', [0, 8, 8, 4, 0, 0, 0]) // PP22 : 20 h sur 80
  // Période en cours (samedi 31 pas passé) : rien de tiré, même avec « au » à la fin de la période.
  assert.deepEqual(mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-10-31', aujourdhui: '2026-10-25', etatsHeures: ACTIF }), [])
  assert.deepEqual(mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-10-31', aujourdhui: '2026-10-31', etatsHeures: ACTIF }), [])
  assert.equal(mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-10-31', aujourdhui: '2026-11-01', etatsHeures: ACTIF }).at(-1).heures, -60)
  // Période sans heure, ou seulement des « 0 » : pas remplie, rien de tiré (ex. un admin sans feuille).
  const zeros = [0, 0, 0, 0, 0].map((h, i) => ({ jour: `2026-10-2${i}`, type: 'regulieres', heures: h }))
  assert.deepEqual(mouvementsBanqueHeures({ heures: zeros, ajustements: [], au: '2026-11-07', aujourdhui: '2026-11-08', etatsHeures: ACTIF }), [])
  // Banque désactivée (ou sans ligne : désactivée par défaut) : rien.
  const etatsHeures = [...ACTIF, { depuis: '2026-10-18', active: false }]
  assert.deepEqual(mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-10-31', aujourdhui: '2026-11-01', etatsHeures }), [])
  assert.deepEqual(mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-10-31', aujourdhui: '2026-11-01' }), [])
  // Anciennes heures « banque » saisies à la main : déduites, et elles comblent le manque (pas de double retrait).
  const anciennes = [...pleine('2026-10-18'), ...semaine('2026-10-25', [0, 8, 8, 8, 8, 0, 0]), { jour: '2026-10-30', type: 'banque', heures: 8 }]
  const m = mouvementsBanqueHeures({ heures: anciennes, ajustements: [], au: '2026-10-31', aujourdhui: '2026-11-01', etatsHeures: ACTIF })
  assert.deepEqual(m.map((x) => [x.genre, x.heures]), [['prises', -8]])
})

test('avertissement sous 20 h : banque utilisée et sous 20 h, ou négative ; jamais une banque jamais utilisée', () => {
  const ouverture = (h) => [{ id: 'o', banque: 'heures', jour: '2026-10-04', heures: h, note: 'Ouverture', auteur_nom: 'Admin', created_at: '' }]
  const periodeDe = (h) => [...semaine('2026-10-18', [0, h, 8, 8, 8, 8, 0]), ...pleine('2026-10-25')]
  const m = (h, ajustements, etatsHeures = ACTIF) =>
    mouvementsBanqueHeures({ heures: periodeDe(h), ajustements, au: '2026-10-31', aujourdhui: '2026-11-01', etatsHeures })
  assert.equal(alerteBanque(m(8, ouverture(25)), true), false) // 80 h : rien de tiré, 25 h
  assert.equal(alerteBanque(m(4, ouverture(25)), true), false) // −4 → 21 h
  assert.equal(alerteBanque(m(0, ouverture(25)), true), true) // −8 → 17 h
  assert.equal(alerteBanque(m(0, ouverture(25), []), false), false) // désactivée : rien de tiré, 25 h
  assert.equal(alerteBanque([], true), false) // admin sans feuille, 0 h
  assert.equal(alerteBanque(mouvementsBanqueHeures({ heures: [], ajustements: ouverture(-3), au: '2026-10-31' }), false), true) // négative
})
