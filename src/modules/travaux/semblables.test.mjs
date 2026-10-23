// Tâches semblables (semblables.ts). Lancer : npm run test:travaux
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { comparateur, mots, racine } from './semblables.ts'

// Tirées des tâches de la base DEV (copie de la PROD, 2026-10-23).
const BP = 'bp'
const VF = 'vf'
const QUAI = 'quai'
const SENTIERS = 'sentiers'
const taches = [
  ['Peinturer les volets verts', BP],
  ['Peinturer sous les lits', BP],
  ['Vider les gouttières', BP],
  ['Terminer plancher flotant', 'motel'],
  ['Planche brisée sur le quai', QUAI],
  ['Lumière du sentier éteinte', SENTIERS],
  ['Renettoyer les sentiers dans la forêt', SENTIERS],
  ['Laveuse : bearing à changer (ou acheter une industrielle)', BP],
  ['PH10 lavabo bouché : prochaine étape, ouvrir', BP],
  ['PH9 le lavabo branle', BP],
  ['Fuite d’eau plafond VF', VF],
  ['Changer le robinet du bain VFB', VF],
  ['Remplacer l\'extincteur de la cuisine', 'cuisine'],
].map(([titre, lieu_id], i) => ({ id: String(i), titre, lieu_id }))
const chercher = comparateur(taches)
const titres = (titre, lieu = null, options) => chercher(titre, lieu, options).map((s) => s.tache.titre)

test('racine : casse, accents, pluriel, lettres doublées, terminaisons', () => {
  assert.equal(racine('Gouttières'), racine('gouttiere'))
  assert.equal(racine('flottant'), racine('flotant'))
  assert.equal(racine('nettoyage'), racine('nettoyer'))
  assert.equal(racine('Sentiers'), racine('sentier'))
  assert.equal(racine('PH10'), 'ph10')
})

test('mots : sans mots vides ni doublons', () => {
  assert.deepEqual(mots('Peinturer tous les volets verts'), ['peintur', 'volet', 'vert'])
  assert.deepEqual(mots('Il y a de la boue'), ['bou'])
  assert.deepEqual(mots('  '), [])
})

test('retrouve une tâche écrite autrement', () => {
  assert.equal(titres('Peinturer volets verts')[0], 'Peinturer les volets verts')
  assert.equal(titres('Les gouttières sont pleines', BP)[0], 'Vider les gouttières')
  assert.equal(titres('plancher flottant motel')[0], 'Terminer plancher flotant')
  assert.equal(titres('Planche cassée quai', QUAI)[0], 'Planche brisée sur le quai')
  assert.equal(titres('nettoyer sentiers')[0], 'Renettoyer les sentiers dans la forêt')
  assert.equal(titres('lavabo PH10 bouché')[0], 'PH10 lavabo bouché : prochaine étape, ouvrir')
  assert.equal(titres('Fuite plafond Vieille-France', VF)[0], 'Fuite d’eau plafond VF')
  assert.equal(titres('Extincteur cuisine')[0], "Remplacer l'extincteur de la cuisine")
})

test("l'objet compte plus que ce qui ne va pas", () => {
  assert.deepEqual(titres('Laveuse brisée'), ['Laveuse : bearing à changer (ou acheter une industrielle)'])
})

test('rien de semblable : rien', () => {
  assert.deepEqual(titres('Tondre le gazon'), [])
  assert.deepEqual(titres(''), [])
  assert.deepEqual(titres('le la les'), [])
})

test('un autre lieu compte moins, le même lieu plus', () => {
  const [ici] = chercher('Fuite plafond', VF)
  const [ailleurs] = chercher('Fuite plafond', BP, { seuil: 0 })
  assert.ok(ici.score > ailleurs.score)
})

test('exclure, max et seuil', () => {
  assert.ok(!titres('Peinturer les volets verts', BP, { exclure: '0' }).includes('Peinturer les volets verts'))
  assert.equal(titres('Peinturer', null, { seuil: 0, max: 1 }).length, 1)
  assert.equal(titres('Peinturer', null, { seuil: 0 }).length, 2)
})
