// Planification de la saison et diètes (src/modules/rh/planification.ts).
// Lancer : node --test src/modules/rh/planification.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  champCsv,
  codeParLettres,
  comptesParDate,
  csvPlanification,
  datesAffichees,
  dietesParDate,
  ecart,
  etatCase,
  groupesPlanification,
  lignesDesGroupes,
  nomPlanification,
  pilotageDe,
  saisonPlanification,
} from './planification.ts'

const S = 'ete27'
const date = (id, genre, debut, ordre = 0, saison = S) => ({ id, saison_id: saison, genre, nom: id, debut, fin: debut, obligatoire: false, note: null, ordre })
const code = (id, c, present, besoin, ordre, actif = true) => ({ id, code: c, nom: c, couleur: 'vert', present, besoin, ordre, actif })
const CODES = [
  code('anim', 'Anim', true, true, 1),
  code('remp', 'Remp', true, true, 2),
  code('cdj', 'CDJ', true, false, 3),
  code('cuis', 'Cuis', true, false, 5),
  code('conge', 'Congé', false, false, 10),
  code('non', 'Non', false, false, 11),
  code('coupe', 'Coupé', false, false, 13),
  code('vieux', 'Ancien', true, false, 20, false),
]
const codeParId = new Map(CODES.map((c) => [c.id, c]))
const personne = (id, prenom, nom, surnom = null) => ({ id, prenom, nom_famille: nom, surnom, nom_complet: `${nom}, ${prenom}` })
const embauche = (id, personne_id, entreprise_id, poste_id, statut = 'complete', extra = {}) => ({
  id,
  personne_id,
  saison_id: S,
  entreprise_id,
  poste_id,
  statut,
  genre: 'emploi',
  disponibilites: [],
  dossier_recu_le: null,
  ...extra,
})

test('datesAffichees : saison et genres demandés, ordre chronologique (sans date à la fin)', () => {
  const dates = [
    date('s2', 'semaine', '2027-07-04'),
    date('f1', 'formation', '2027-05-01'),
    date('cv', 'sejour', '2027-05-10'),
    date('s1', 'semaine', '2027-06-27'),
    date('x', 'autre', null, 9),
    date('autre-saison', 'semaine', '2027-06-27', 0, 'ete26'),
  ]
  assert.deepEqual(
    datesAffichees(dates, S, ['formation', 'semaine', 'autre']).map((d) => d.id),
    ['f1', 's1', 's2', 'x'],
  )
  assert.deepEqual(
    datesAffichees(dates, S, ['sejour']).map((d) => d.id),
    ['cv'],
  )
})

test('groupesPlanification : compagnie (ordre du référentiel), poste, nom ; annulées et autres saisons exclues', () => {
  const personnes = new Map(
    [personne('p1', 'Thomas', 'Pelletier', 'Hibou'), personne('p2', 'Rosalie', 'Gauthier'), personne('p3', 'Maya', 'Nguyen', 'Abeille'), personne('p4', 'Léo', 'Roy')].map((p) => [p.id, p]),
  )
  const postes = new Map([
    ['anim', { id: 'anim', nom: 'Animateur', ordre: 2 }],
    ['coord', { id: 'coord', nom: 'Coordonnateur', ordre: 1 }],
    ['sauv', { id: 'sauv', nom: 'Sauveteur', ordre: 31 }],
  ])
  const compagnies = [
    { id: 'aqb', nom: 'Aquabounga', ordre: 3 },
    { id: 'bpa', nom: 'GBPA+', ordre: 1 },
  ]
  const embauches = [
    embauche('e1', 'p1', 'bpa', 'anim'),
    embauche('e2', 'p2', 'bpa', 'anim'),
    embauche('e3', 'p3', 'bpa', 'coord'),
    embauche('e4', 'p4', 'aqb', 'sauv'),
    embauche('e5', 'p4', 'bpa', 'anim', 'annulee'),
    { ...embauche('e6', 'p2', 'bpa', 'anim'), saison_id: 'autre' },
    embauche('e7', 'p4', null, null, 'a_envoyer', { genre: 'benevolat' }),
  ]
  const g = groupesPlanification({ embauches, saisonId: S, personneParId: personnes, posteParId: postes, compagnies })
  assert.deepEqual(
    g.map((x) => x.compagnie?.id ?? null),
    ['bpa', 'aqb', null],
  )
  assert.deepEqual(
    g[0].postes.map((x) => x.poste.id),
    ['coord', 'anim'],
  )
  // « Hibou » (nom de camp) avant « Rosalie » (prénom).
  assert.deepEqual(
    g[0].postes[1].lignes.map((e) => e.id),
    ['e1', 'e2'],
  )
  assert.deepEqual(
    lignesDesGroupes(g).map((e) => e.id),
    ['e3', 'e1', 'e2', 'e4', 'e7'],
  )
  assert.equal(nomPlanification(personnes.get('p2')), 'Rosalie')
  assert.equal(nomPlanification(personnes.get('p1')), 'Hibou')
})

test('comptesParDate : présents (codes « besoin »), tous présents, embauches affichées seulement ; écart', () => {
  const cases = [
    { embauche_id: 'e1', date_id: 's1', code_id: 'anim', note: null },
    { embauche_id: 'e2', date_id: 's1', code_id: 'remp', note: null },
    { embauche_id: 'e3', date_id: 's1', code_id: 'cdj', note: null },
    { embauche_id: 'e4', date_id: 's1', code_id: 'conge', note: null },
    { embauche_id: 'annulee', date_id: 's1', code_id: 'anim', note: null },
    { embauche_id: 'e1', date_id: 's2', code_id: 'cuis', note: null },
  ]
  const c = comptesParDate(cases, codeParId, new Set(['e1', 'e2', 'e3', 'e4']))
  assert.deepEqual(c.get('s1'), { presents: 2, tousPresents: 3 })
  assert.deepEqual(c.get('s2'), { presents: 0, tousPresents: 1 })
  assert.equal(c.get('s3'), undefined)
  assert.equal(ecart(2, 4), -2)
  assert.equal(ecart(5, 4), 1)
  assert.equal(ecart(3, null), null)
  assert.deepEqual(pilotageDe([{ date_id: 's1', besoin: 20, reel_an_passe: 16 }], 's2'), { date_id: 's2', besoin: null, reel_an_passe: null })
})

test('etatCase : disponibilité dans une case vide, code « présent » hors disponibilités une fois le dossier reçu', () => {
  const recu = { disponibilites: ['s1'], dossier_recu_le: '2027-03-01T10:00:00Z' }
  const pasRecu = { disponibilites: [], dossier_recu_le: null }
  assert.deepEqual(etatCase(recu, 's1', undefined), { dispo: true, horsDispo: false })
  assert.deepEqual(etatCase(recu, 's2', undefined), { dispo: false, horsDispo: false })
  assert.deepEqual(etatCase(recu, 's1', codeParId.get('anim')), { dispo: false, horsDispo: false })
  assert.deepEqual(etatCase(recu, 's2', codeParId.get('anim')), { dispo: false, horsDispo: true })
  assert.deepEqual(etatCase(recu, 's2', codeParId.get('conge')), { dispo: false, horsDispo: false })
  assert.deepEqual(etatCase(pasRecu, 's2', codeParId.get('anim')), { dispo: false, horsDispo: false })
})

test('codeParLettres : début du code sans accents, une lettre fait tourner, codes retirés ignorés', () => {
  assert.equal(codeParLettres(CODES, 'a', null), 'anim')
  assert.equal(codeParLettres(CODES, 'A', 'anim'), 'anim') // seul code actif en A (« Ancien » est retiré)
  assert.equal(codeParLettres(CODES, 'c', null), 'cdj')
  assert.equal(codeParLettres(CODES, 'c', 'cdj'), 'cuis')
  assert.equal(codeParLettres(CODES, 'c', 'cuis'), 'conge')
  assert.equal(codeParLettres(CODES, 'c', 'coupe'), 'cdj')
  assert.equal(codeParLettres(CODES, 'cou', null), 'coupe')
  assert.equal(codeParLettres(CODES, 'conge', null), 'conge')
  assert.equal(codeParLettres(CODES, 'CONGÉ', null), 'conge')
  assert.equal(codeParLettres(CODES, 'cc', 'cdj'), 'cuis') // même lettre répétée : on tourne
  assert.equal(codeParLettres(CODES, 'z', null), null)
  assert.equal(codeParLettres(CODES, '', null), null)
})

test('dietesParDate : présents seulement, « Non précisée » sans dossier, pourcentages, allergies par nom', () => {
  const personnes = new Map([personne('p1', 'Thomas', 'Pelletier', 'Hibou'), personne('p2', 'Rosalie', 'Gauthier'), personne('p3', 'Maya', 'Nguyen', 'Abeille')].map((p) => [p.id, p]))
  const embauches = [embauche('e1', 'p1', 'bpa', 'anim'), embauche('e2', 'p2', 'bpa', 'anim'), embauche('e3', 'p3', 'bpa', 'anim')]
  const dossierDe = new Map([
    ['p1', { diete: 'vegetarienne', allergies: 'Arachides' }],
    ['p3', { diete: 'reguliere', allergies: '  ' }],
  ])
  const cases = [
    { embauche_id: 'e1', date_id: 's1', code_id: 'anim', note: null },
    { embauche_id: 'e2', date_id: 's1', code_id: 'cdj', note: null },
    { embauche_id: 'e3', date_id: 's1', code_id: 'conge', note: null },
    { embauche_id: 'e3', date_id: 's2', code_id: 'cuis', note: null },
  ]
  const [s1, s2, s3] = dietesParDate({ dates: [date('s1', 'semaine', '2027-06-27'), date('s2', 'semaine', '2027-07-04'), date('s3', 'semaine', '2027-07-11')], cases, codeParId, embauches, personneParId: personnes, dossierDe })
  assert.equal(s1.total, 2)
  assert.equal(s1.parDiete.vegetarienne, 1)
  assert.equal(s1.parDiete.non_precisee, 1)
  assert.equal(s1.parDiete.reguliere, 0)
  assert.equal(s1.pourcents.vegetarienne, 50)
  assert.deepEqual(s1.allergies, [{ nom: 'Hibou', allergie: 'Arachides' }])
  assert.equal(s2.total, 1)
  assert.equal(s2.parDiete.reguliere, 1)
  assert.deepEqual(s2.allergies, [])
  assert.equal(s3.total, 0)
  assert.equal(s3.pourcents.reguliere, 0)
})

test('csvPlanification : « ; », guillemets au besoin, pilotage puis lignes, indicateur UTF-8', () => {
  assert.equal(champCsv('a;b'), '"a;b"')
  assert.equal(champCsv('dit "Hibou"'), '"dit ""Hibou"""')
  assert.equal(champCsv(null), '')
  assert.equal(champCsv(12), '12')
  const csv = csvPlanification({
    dates: [
      { id: 's1', libelle: 'Semaine 1' },
      { id: 's2', libelle: 'Semaine 2' },
    ],
    pilotage: [{ libelle: 'Besoin prévu', valeurs: { s1: 20, s2: null } }],
    lignes: [
      { compagnie: 'GBPA+', poste: 'Animateur', nom: 'Hibou', prenom: 'Thomas', nomFamille: 'Pelletier', statut: 'Complète', codes: { s1: 'Anim' }, diete: 'Végétarienne', allergies: 'Arachides; noix', tshirt: 'L', hoodie: '' },
    ],
  })
  assert.ok(csv.startsWith('﻿'))
  const lignes = csv.slice(1).split('\r\n')
  assert.equal(lignes.length, 3)
  assert.equal(lignes[0], 'Compagnie;Poste;Nom de camp;Prénom;Nom;Statut;Semaine 1;Semaine 2;Diète;Allergies;T-shirt;Hoodie')
  assert.equal(lignes[1], 'Besoin prévu;;;;;;20;;;;;')
  assert.equal(lignes[2], 'GBPA+;Animateur;Hibou;Thomas;Pelletier;Complète;Anim;;Végétarienne;"Arachides; noix";L;')
})

test('saisonPlanification : la prochaine saison avec embauches et dates, sinon la plus récente', () => {
  const saisons = [
    { id: 'ete26', rang: 20263 },
    { id: 'aut26', rang: 20264 },
    { id: 'ete27', rang: 20273 },
    { id: 'aut27', rang: 20274 },
  ]
  const embauches = [{ saison_id: 'ete26' }, { saison_id: 'aut26' }, { saison_id: 'ete27' }]
  // Automne 2026 a des embauches mais aucune date : l'été 2027.
  assert.equal(saisonPlanification(saisons, embauches, [{ saison_id: 'ete26' }, { saison_id: 'ete27' }], '2026-10-15'), 'ete27')
  // Après l'été 2027 : la plus récente avec dates.
  assert.equal(saisonPlanification(saisons, embauches, [{ saison_id: 'ete26' }, { saison_id: 'ete27' }], '2027-10-15'), 'ete27')
  assert.equal(saisonPlanification(saisons, embauches, [{ saison_id: 'ete26' }], '2026-10-15'), 'ete26')
  // Aucune date nulle part : comme l'onglet Employés.
  assert.equal(saisonPlanification(saisons, embauches, [], '2026-10-15'), 'aut26')
  assert.equal(saisonPlanification(saisons, [], [], '2026-10-15'), 'aut27')
})
