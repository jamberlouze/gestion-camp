// Banque d'heures des feuilles de temps (banques.ts). Lancer : npm run test:temps
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { alerteBanque, banqueAffichee, etatBanqueHeures, heuresTirees, libelleSeuil, mouvementsBanqueHeures, resumePeriode, seuilSemaine } from './banques.ts'

const semaine = (dimanche, heuresParJour, type = 'regulieres') => {
  const [a, m, j] = dimanche.split('-').map(Number)
  return heuresParJour.map((h, i) => {
    const d = new Date(Date.UTC(a, m - 1, j + i))
    return { jour: d.toISOString().slice(0, 10), type, heures: h }
  })
}

test('maladie : plus de banque dans l’app (Employeur D), ni octroi ni retrait ; ses heures comblent la semaine', () => {
  // 28 h régulières + 12 h de maladie = 40 h : rien de tiré ; l'ancien ajustement « maladie » est ignoré.
  const heures = [...semaine('2026-10-04', [0, 0, 0, 7, 7, 7, 7]), { jour: '2026-10-05', type: 'maladie', heures: 8 }, { jour: '2026-10-06', type: 'maladie', heures: 4 }]
  const ajustements = [{ id: 'm', banque: 'maladie', jour: '2026-10-03', heures: 16, note: 'Ancien solde maladie', auteur_nom: 'Admin', created_at: '' }]
  assert.deepEqual(mouvementsBanqueHeures({ heures, ajustements, au: '2027-02-01' }), [])
})

test('heures accumulées : au-delà de 40 h par semaine, à 1×, déduites quand on les prend', () => {
  const heures = [
    // Semaine du 4 oct. : 5 × 9 h = 45 h → +5 h ; woofing, vacances et maladie ne comptent pas.
    ...semaine('2026-10-04', [0, 9, 9, 9, 9, 9, 0]),
    { jour: '2026-10-10', type: 'woofing', heures: 6 },
    { jour: '2026-10-05', type: 'vacances', heures: 8 },
    { jour: '2026-10-09', type: 'maladie', heures: 4 },
    // Semaine du 11 oct. (Action de grâces : 32 h) : 30 h régulières + 2 h prises en banque → rien d'ajouté, −2 h.
    ...semaine('2026-10-11', [0, 0, 8, 8, 8, 6, 0]),
    { jour: '2026-10-16', type: 'banque', heures: 2 },
    // Semaine du 18 oct. : exactement 40 h → rien.
    ...semaine('2026-10-18', [0, 8, 8, 8, 8, 8, 0]),
  ].filter((h) => h.heures > 0)
  const m = mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-10-31' })
  assert.deepEqual(m.map((x) => [x.jour, x.genre, x.heures, x.solde]), [
    ['2026-10-10', 'accumulees', 5, 5],
    ['2026-10-17', 'prises', -2, 3],
  ])
  const r = resumePeriode(m, '2026-10-04', '2026-10-17')
  assert.deepEqual([r.avant, r.ajouts, r.retraits, r.apres], [0, 5, -2, 3])
  const suivante = resumePeriode(m, '2026-10-18', '2026-10-31')
  assert.deepEqual([suivante.avant, suivante.apres, suivante.mouvements.length], [3, 3, 0])
})

test('employé de deux compagnies : toutes ses heures comptent pour les 40 h', () => {
  const heures = [...semaine('2026-10-04', [0, 6, 6, 6, 6, 6, 0]), ...semaine('2026-10-04', [0, 3, 3, 3, 3, 0, 0])]
  const m = mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-10-17' })
  assert.equal(m.find((x) => x.genre === 'accumulees').heures, 2)
})

test('ajustements : solde de départ, heures payées, triés par date ; rien après « au » ; anciens « maladie » ignorés', () => {
  const ajustements = [
    { id: 'a', banque: 'heures', jour: '2026-10-03', heures: 12, note: 'Solde de départ', auteur_nom: 'Admin', created_at: '' },
    { id: 'b', banque: 'heures', jour: '2026-10-22', heures: -10, note: 'Heures payées', auteur_nom: 'Admin', created_at: '' },
    { id: 'c', banque: 'maladie', jour: '2026-10-05', heures: -16, note: 'Non pris, perdu', auteur_nom: 'Admin', created_at: '' },
    { id: 'd', banque: 'heures', jour: '2026-11-05', heures: 3, note: 'Après « au »', auteur_nom: 'Admin', created_at: '' },
  ]
  const heures = semaine('2026-10-04', [0, 10, 10, 10, 10, 2, 0])
  const m = mouvementsBanqueHeures({ heures, ajustements, au: '2026-10-31' })
  assert.deepEqual(m.map((x) => [x.jour, x.heures, x.solde]), [
    ['2026-10-03', 12, 12],
    ['2026-10-10', 2, 14],
    ['2026-10-22', -10, 4],
  ])
  const r = resumePeriode(m, '2026-10-18', '2026-10-31')
  assert.deepEqual([r.avant, r.retraits, r.apres], [14, -10, 4])
  // Solde négatif possible (affiché en rouge) : pas de blocage.
  const neg = mouvementsBanqueHeures({ heures: [{ jour: '2026-10-05', type: 'banque', heures: 8 }], ajustements: [], au: '2026-10-17', heuresActivesParDefaut: false })
  assert.equal(neg.at(-1).solde, -8)
})

test('semaine en cours : datée de « au », pas du samedi à venir', () => {
  const heures = semaine('2026-10-18', [0, 11, 11, 11, 11, 0, 0])
  const m = mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-10-22' })
  assert.deepEqual(m.map((x) => [x.jour, x.heures]), [['2026-10-22', 4]])
})

test('semaine avec un férié : 8 h de moins par férié du lundi au vendredi', () => {
  // PP21 de la direction : 52 h la semaine du 4 oct. (+12), 33 h celle de l'Action de grâces, rien le lundi 12 (+1).
  const heures = [...semaine('2026-10-04', [12, 8, 10, 8, 8, 6, 0]), ...semaine('2026-10-11', [0, 0, 8, 8, 5, 8, 4])]
  const m = mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-10-17' })
  assert.deepEqual(m.map((x) => [x.jour, x.heures, x.detail]), [
    ['2026-10-10', 12, '52 h régulières, au-delà de 40 h'],
    ['2026-10-17', 1, '33 h régulières, au-delà de 32 h (férié : Action de grâces)'],
  ])
  // Heures faites le férié : elles comptent comme les autres (40 h → +8).
  const travaille = mouvementsBanqueHeures({ heures: semaine('2026-10-11', [0, 8, 8, 8, 8, 8, 0]), ajustements: [], au: '2026-10-17' })
  assert.equal(travaille.at(-1).solde, 8)
  assert.deepEqual(seuilSemaine('2026-10-14'), { seuil: 32, feries: [{ jour: '2026-10-12', nom: 'Action de grâces' }] })
  // Noël (ven.) puis le jour de l'An (ven.) : deux semaines à 32 h.
  assert.equal(seuilSemaine('2026-12-20').seuil, 32)
  assert.equal(seuilSemaine('2026-12-27').seuil, 32)
  // Noël 2027 et le jour de l'An 2028 tombent un samedi : rien ne change.
  assert.equal(seuilSemaine('2027-12-19').seuil, 40)
  assert.equal(seuilSemaine('2027-12-26').seuil, 40)
  assert.equal(libelleSeuil('2026-10-04'), 'au-delà de 40 h')
})

test('interrupteur « Heures en banque » : défaut oui pour la direction, non pour un employé', () => {
  const heures = semaine('2026-10-04', [0, 9, 9, 9, 9, 9, 0]) // 45 h → 5 h de surplus
  const direction = mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-10-17' })
  assert.equal(direction.at(-1).solde, 5)
  const employe = mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-10-17', heuresActivesParDefaut: false })
  assert.equal(employe.length, 0)
  const active = mouvementsBanqueHeures({
    heures, ajustements: [], au: '2026-10-17',
    heuresActivesParDefaut: false, etatsHeures: [{ depuis: '2026-10-04', active: true }],
  })
  assert.equal(active.at(-1).solde, 5)
})

test('désactivée : plus d’accumulation, le solde reste et se prend ; réactivée : le passé désactivé ne compte pas', () => {
  const heures = [
    ...semaine('2026-10-04', [0, 9, 9, 9, 9, 9, 0]), // PP21 : +5
    ...semaine('2026-10-18', [0, 9, 9, 9, 9, 9, 0]), // PP22 : désactivée → rien
    { jour: '2026-10-20', type: 'banque', heures: 2 }, // pris quand même : −2
    ...semaine('2026-11-01', [0, 9, 9, 9, 9, 9, 0]), // PP23 : désactivée → rien
    ...semaine('2026-11-15', [0, 9, 9, 9, 9, 10, 0]), // PP24 : réactivée → +6
  ]
  const etatsHeures = [
    { depuis: '2026-10-18', active: false },
    { depuis: '2026-11-15', active: true },
  ]
  const m = mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-11-28', etatsHeures })
  assert.deepEqual(m.map((x) => [x.genre, x.heures, x.solde]), [
    ['accumulees', 5, 5],
    ['prises', -2, 3],
    ['accumulees', 6, 9],
  ])
  // Ajustement permis pendant que c'est désactivé.
  const ajustements = [{ id: 'p', banque: 'heures', jour: '2026-11-05', heures: -3, note: 'Heures payées', auteur_nom: 'Admin', created_at: '' }]
  const m2 = mouvementsBanqueHeures({ heures, ajustements, au: '2026-11-28', etatsHeures })
  assert.equal(m2.at(-1).solde, 6)
  assert.deepEqual(etatBanqueHeures(etatsHeures, true, '2026-10-10'), { active: true, depuis: null })
  assert.deepEqual(etatBanqueHeures(etatsHeures, true, '2026-11-01'), { active: false, depuis: '2026-10-18' })
  assert.deepEqual(etatBanqueHeures(etatsHeures, true, '2026-11-20'), { active: true, depuis: '2026-11-15' })
})

test('employé sans compte : heures accumulées si activée', () => {
  const heures = [...semaine('2026-10-04', [0, 9, 9, 9, 9, 9, 0]), ...semaine('2026-10-11', [0, 0, 8, 8, 8, 6.5, 0]), { jour: '2026-10-13', type: 'banque', heures: 1.5 }]
  const m = mouvementsBanqueHeures({
    heures, ajustements: [], au: '2027-02-01',
    heuresActivesParDefaut: false, etatsHeures: [{ depuis: '2026-10-04', active: true }],
  })
  assert.equal(m.at(-1).solde, 3.5)
})

test('sommes par semaine (onglet Banques) : même résultat que les heures par jour', () => {
  const parJour = [...semaine('2026-10-04', [0, 9, 9, 9, 9, 9, 0]), { jour: '2026-10-12', type: 'banque', heures: 8 }]
  const parSemaine = [
    { jour: '2026-10-04', type: 'regulieres', heures: 45 },
    { jour: '2026-10-11', type: 'banque', heures: 8 },
  ]
  const a = mouvementsBanqueHeures({ heures: parJour, ajustements: [], au: '2026-10-17' })
  const b = mouvementsBanqueHeures({ heures: parSemaine, ajustements: [], au: '2026-10-17' })
  assert.deepEqual(b.map((x) => [x.cle, x.heures, x.solde]), a.map((x) => [x.cle, x.heures, x.solde]))
})

test('ligne « Prises en banque » d’un employé : banque activée, solde ou heures déjà prises dans la période', () => {
  const [debut, fin] = ['2026-10-18', '2026-10-31']
  const employe = (heures, ajustements = []) => mouvementsBanqueHeures({ heures, ajustements, au: fin, heuresActivesParDefaut: false })
  // Désactivée, rien en banque : pas de ligne ; activée : la ligne.
  assert.equal(banqueAffichee(employe(semaine('2026-10-18', [0, 9, 9, 9, 9, 9, 0])), false, debut, fin), false)
  assert.equal(banqueAffichee([], true, debut, fin), true)
  // Désactivée avec un solde de départ (ajustement d'une période passée) : la ligne, pour le prendre.
  const depart = [{ id: 'd', banque: 'heures', jour: '2026-10-10', heures: 6, note: 'Solde de départ', auteur_nom: 'Admin', created_at: '' }]
  assert.equal(banqueAffichee(employe([], depart), false, debut, fin), true)
  // Tout pris dans la période : le solde de fin est nul, la ligne reste.
  assert.equal(banqueAffichee(employe([{ jour: '2026-10-20', type: 'banque', heures: 6 }], depart), false, debut, fin), true)
  // Heures prises sans solde (par erreur) : solde négatif, la ligne reste pour les corriger.
  assert.equal(banqueAffichee(employe([{ jour: '2026-10-20', type: 'banque', heures: 2 }]), false, debut, fin), true)
  // Solde remis à zéro par un ajustement dans une période passée : plus de ligne.
  const remis = [...depart, { id: 'r', banque: 'heures', jour: '2026-10-15', heures: -6, note: 'Heures payées', auteur_nom: 'Admin', created_at: '' }]
  assert.equal(banqueAffichee(employe([], remis), false, debut, fin), false)
})

test('retrait automatique : le manque d’une semaine finie est tiré de la banque, dès PP21', () => {
  const heures = [
    ...semaine('2026-10-04', [0, 6, 6, 6, 6, 7, 0]), // PP21, 31 h → −9
    ...semaine('2026-10-18', [0, 7, 6, 6, 6, 6, 0]), // 31 h → −9
    ...semaine('2026-10-25', [0, 8, 8, 8, 8, 0, 0]), // 32 h + 8 h de vacances → rien (vacances et maladie comblent)
    { jour: '2026-10-30', type: 'vacances', heures: 8 },
    ...semaine('2026-12-20', [0, 8, 8, 6, 8, 0, 0]), // Noël : 30 h sur 32 → −2
  ]
  const ajustements = [{ id: 'o', banque: 'heures', jour: '2026-10-04', heures: 30, note: 'Solde d’ouverture', auteur_nom: 'Admin', created_at: '' }]
  const m = mouvementsBanqueHeures({ heures, ajustements, au: '2026-12-31', aujourdhui: '2027-01-05' })
  assert.deepEqual(m.map((x) => [x.jour, x.genre, x.heures, x.solde]), [
    ['2026-10-04', 'ajustement', 30, 30],
    ['2026-10-10', 'tirees', -9, 21],
    ['2026-10-24', 'tirees', -9, 12],
    ['2026-12-26', 'tirees', -2, 10],
  ])
  assert.equal(m[1].detail, '31 h payées sur 40 h attendues')
  assert.equal(m[3].detail, '30 h payées sur 32 h attendues (férié : Noël)')
  assert.equal(heuresTirees(m, '2026-10-04', '2026-10-17'), 9)
  assert.equal(heuresTirees(m, '2026-10-18', '2026-10-31'), 9)
  assert.equal(heuresTirees(m, '2026-12-20', '2027-01-02'), 2)
})

test('retrait automatique : rien pour une semaine en cours, vide, ou banque désactivée', () => {
  const heures = semaine('2026-10-18', [0, 8, 8, 4, 0, 0, 0]) // 20 h
  // Semaine en cours (samedi 24 pas passé) : rien de tiré, même avec « au » à la fin de la période.
  assert.deepEqual(mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-10-31', aujourdhui: '2026-10-22' }), [])
  assert.deepEqual(mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-10-31', aujourdhui: '2026-10-24' }), [])
  assert.equal(mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-10-31', aujourdhui: '2026-10-25' }).at(-1).heures, -20)
  // Semaine sans heure, ou seulement des « 0 » : pas remplie, rien de tiré (ex. un admin sans feuille).
  const zeros = [0, 0, 0, 0, 0].map((h, i) => ({ jour: `2026-10-2${i}`, type: 'regulieres', heures: h }))
  assert.deepEqual(mouvementsBanqueHeures({ heures: zeros, ajustements: [], au: '2026-11-07', aujourdhui: '2026-11-08' }), [])
  // Banque désactivée (ou employé, désactivé par défaut) : rien.
  const etatsHeures = [{ depuis: '2026-10-18', active: false }]
  assert.deepEqual(mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-10-31', aujourdhui: '2026-11-01', etatsHeures }), [])
  assert.deepEqual(mouvementsBanqueHeures({ heures, ajustements: [], au: '2026-10-31', aujourdhui: '2026-11-01', heuresActivesParDefaut: false }), [])
  // Anciennes heures « banque » saisies à la main : déduites, et elles comblent le manque (pas de double retrait).
  const anciennes = [...semaine('2026-10-18', [0, 8, 8, 8, 8, 0, 0]), { jour: '2026-10-23', type: 'banque', heures: 8 }]
  const m = mouvementsBanqueHeures({ heures: anciennes, ajustements: [], au: '2026-10-31', aujourdhui: '2026-11-01' })
  assert.deepEqual(m.map((x) => [x.genre, x.heures]), [['prises', -8]])
})

test('avertissement sous 20 h : banque utilisée et sous 20 h, ou négative ; jamais une banque jamais utilisée', () => {
  const ouverture = (h) => [{ id: 'o', banque: 'heures', jour: '2026-10-04', heures: h, note: 'Ouverture', auteur_nom: 'Admin', created_at: '' }]
  const semaineDe = (h) => semaine('2026-10-18', [0, h, 8, 8, 8, 8, 0])
  const m = (h, ajustements) => mouvementsBanqueHeures({ heures: semaineDe(h), ajustements, au: '2026-10-31', aujourdhui: '2026-11-01' })
  assert.equal(alerteBanque(m(8, ouverture(25)), true), false) // 40 h : rien de tiré, 25 h
  assert.equal(alerteBanque(m(4, ouverture(25)), true), false) // −4 → 21 h
  assert.equal(alerteBanque(m(0, ouverture(25)), true), true) // −8 → 17 h
  assert.equal(alerteBanque(m(0, ouverture(25)), false), false) // désactivée : rien de tiré, 25 h
  assert.equal(alerteBanque([], true), false) // admin sans feuille, 0 h
  assert.equal(alerteBanque(mouvementsBanqueHeures({ heures: [], ajustements: ouverture(-3), au: '2026-10-31' }), false), true) // négative
})
