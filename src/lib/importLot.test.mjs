// Import de tâches en lot (importLot.ts). Lancer : npm run test:import
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  aCreerPour,
  CREER,
  devinerColonnes,
  lireChoix,
  lireDate,
  lireLignes,
  lireMois,
  lireNombre,
  lireTsv,
  remplacerCrees,
  resoudre,
  VIDE,
} from './importLot.ts'

const COLONNES = [
  { cle: 'titre', entete: 'Titre', synonymes: ['Tâche', 'Quoi'], obligatoire: true, type: 'texte', aide: '' },
  {
    cle: 'projet',
    entete: 'Projet',
    type: 'liste',
    options: [
      { id: 'p1', nom: 'Ouverture été' },
      { id: 'p2', nom: 'Fermeture hiver' },
    ],
    creer: async () => 'nouveau',
    lot: true,
    aide: '',
  },
  { cle: 'mois', entete: 'Mois', obligatoire: true, type: 'valeur', lire: lireMois, afficher: String, lot: true, aide: '' },
  {
    cle: 'compagnie',
    entete: 'Compagnie',
    synonymes: ['Entreprise'],
    type: 'liste',
    options: [{ id: 'c1', nom: 'Base de Plein Air', alias: ['GBPA+'] }],
    aide: '',
  },
  {
    cle: 'etiquettes',
    entete: 'Étiquettes',
    type: 'liste',
    multiple: true,
    options: [
      { id: 'e1', nom: 'Corvée' },
      { id: 'e2', nom: 'Woofing' },
    ],
    aide: '',
  },
]

const sansChoix = { defauts: {}, correspondances: {} }

test('collage Excel : tabulations, cellule entre guillemets avec retour à la ligne, guillemet dans le texte', () => {
  const texte = 'Titre\tNote\r\nLaver\t"ligne 1\nligne 2"\r\n"Sabler" le quai\tdit ""ok""\r\n\r\n'
  assert.deepEqual(lireTsv(texte), [
    ['Titre', 'Note'],
    ['Laver', 'ligne 1\nligne 2'],
    ['"Sabler" le quai', 'dit ""ok""'],
  ])
})

test('simple liste de titres : une colonne, pas d’en-tête', () => {
  const r = lireTsv('Nettoyer les gouttières\nVérifier les extincteurs\n')
  assert.deepEqual(devinerColonnes(r, COLONNES), { entete: false, associations: ['titre'] })
  assert.equal(lireLignes(r, devinerColonnes(r, COLONNES)).length, 2)
})

test('en-tête reconnu sans égard à la casse, aux accents ni aux précisions ; colonne inconnue ignorée', () => {
  const r = [['TACHE', 'Mois (oct, avr)', 'Commentaire perso', 'entreprise', 'Titre'], ['Laver', 'oct', 'x', 'GBPA+', 'doublon']]
  const d = devinerColonnes(r, COLONNES)
  assert.equal(d.entete, true)
  // « Titre » vient après « TACHE » : la colonne n'est prise qu'une fois.
  assert.deepEqual(d.associations, ['titre', 'mois', null, 'compagnie', null])
})

test('plusieurs colonnes sans en-tête : ordre du gabarit', () => {
  const r = [['Laver', 'Ouverture été', 'oct']]
  assert.deepEqual(devinerColonnes(r, COLONNES).associations, ['titre', 'projet', 'mois'])
})

test('mois : noms, abréviations, nombres, plages, « tous »', () => {
  assert.deepEqual(lireMois('oct').valeur, [10])
  assert.deepEqual(lireMois('Octobre, avril').valeur, [4, 10])
  assert.deepEqual(lireMois('10; 4').valeur, [4, 10])
  assert.deepEqual(lireMois('mai à août').valeur, [5, 6, 7, 8])
  assert.deepEqual(lireMois('nov-fév').valeur, [1, 2, 11, 12])
  assert.deepEqual(lireMois('juil. et sept').valeur, [7, 9])
  assert.deepEqual(lireMois('oct avr').valeur, [4, 10])
  assert.deepEqual(lireMois('10.4').valeur, [4, 10]) // « 10,4 » devenu un nombre dans Excel
  assert.equal(lireMois('Tous les mois').valeur.length, 12)
  assert.ok('erreur' in lireMois('jui')) // juin ou juillet ?
  assert.ok('erreur' in lireMois('13'))
  assert.ok('erreur' in lireMois('bientôt'))
})

test('dates, nombres et choix', () => {
  assert.deepEqual(lireDate('2026-11-15'), { valeur: '2026-11-15' })
  assert.deepEqual(lireDate('15/11/2026'), { valeur: '2026-11-15' })
  assert.deepEqual(lireDate('5-3-27'), { valeur: '2027-03-05' })
  assert.deepEqual(lireDate('11/15/2026'), { valeur: '2026-11-15' }) // seule lecture possible
  assert.match(lireDate('2026-02-30').erreur, /invalide/)
  assert.match(lireDate('31/02/2026').erreur, /invalide/)
  assert.ok('erreur' in lireDate('demain'))
  assert.deepEqual(lireNombre('1,5'), { valeur: 1.5 })
  assert.deepEqual(lireNombre('2 h'), { valeur: 2 })
  assert.ok('erreur' in lireNombre('-1'))
  const priorite = lireChoix(
    [
      { texte: '1', libelle: 'Urgent' },
      { texte: '2', libelle: 'Prioritaire' },
      { texte: '3', libelle: 'Éventuellement' },
    ],
    Number,
  )
  assert.deepEqual(priorite('URGENT'), { valeur: 1 })
  assert.deepEqual(priorite('eventuel'), { valeur: 3 })
  assert.deepEqual(priorite('2'), { valeur: 2 })
  assert.ok('erreur' in priorite('pressant'))
})

test('résolution : options par nom ou alias, valeurs communes du lot, obligatoires, doublons', () => {
  const lignes = [
    { numero: 2, cellules: { titre: 'Laver le quai', projet: 'ouverture ETE', compagnie: 'gbpa+', etiquettes: 'corvée, Woofing' } },
    { numero: 3, cellules: { titre: 'Peinturer', mois: 'avr' } },
    { numero: 4, cellules: { projet: 'Fermeture hiver', mois: 'oct' } },
  ]
  const { lignes: lues } = resoudre(lignes, COLONNES, { defauts: { mois: '10', projet: 'p2' }, correspondances: {} }, new Set(['peinturer']))
  assert.deepEqual(lues[0].valeurs, { titre: 'Laver le quai', projet: 'p1', mois: [10], compagnie: 'c1', etiquettes: ['e1', 'e2'] })
  assert.deepEqual(lues[0].erreurs, {})
  // La cellule l'emporte sur la valeur commune.
  assert.deepEqual(lues[1].valeurs, { titre: 'Peinturer', projet: 'p2', mois: [4] })
  assert.equal(lues[1].doublon, true)
  assert.deepEqual(lues[2].erreurs, { titre: 'Obligatoire' })
})

test('noms inconnus : à associer, puis associés, ajoutés ou laissés vides', () => {
  const lignes = [
    { numero: 1, cellules: { titre: 'A', projet: 'Ouverture 2027', mois: 'oct', etiquettes: 'Corvée, Bénévoles' } },
    { numero: 2, cellules: { titre: 'B', projet: 'ouverture 2027', mois: 'oct', compagnie: 'Opikawa' } },
  ]
  const avant = resoudre(lignes, COLONNES, sansChoix)
  assert.equal(avant.lignes[0].erreurs.projet, '« Ouverture 2027 » à associer')
  assert.deepEqual(avant.inconnus.projet, [{ cle: 'ouverture 2027', texte: 'Ouverture 2027', lignes: 2 }])
  assert.equal(avant.inconnus.etiquettes[0].texte, 'Bénévoles')

  const choix = {
    defauts: {},
    correspondances: { projet: { 'ouverture 2027': CREER }, etiquettes: { benevoles: VIDE }, compagnie: { opikawa: 'c1' } },
  }
  const apres = resoudre(lignes, COLONNES, choix)
  assert.deepEqual(apres.lignes.map((l) => l.erreurs), [{}, {}])
  assert.deepEqual(apres.lignes[0].valeurs.etiquettes, ['e1'])
  assert.equal(apres.lignes[1].valeurs.compagnie, 'c1')

  // Un seul ajout pour les deux lignes, puis l'id reçu remplace le nom.
  const aCreer = aCreerPour(apres.lignes, apres.inconnus)
  assert.deepEqual([...aCreer.projet], [['ouverture 2027', 'Ouverture 2027']])
  const crees = { projet: new Map([['ouverture 2027', 'p9']]) }
  assert.equal(remplacerCrees(apres.lignes[0].valeurs, crees).projet, 'p9')
})

test('une valeur illisible bloque la ligne ; une valeur commune illisible aussi', () => {
  const { lignes } = resoudre([{ numero: 1, cellules: { titre: 'A', mois: 'bientôt' } }, { numero: 2, cellules: { titre: 'B' } }], COLONNES, {
    defauts: { mois: 'xx' },
    correspondances: {},
  })
  assert.match(lignes[0].erreurs.mois, /Mois illisible/)
  assert.match(lignes[1].erreurs.mois, /Mois illisible/)
})
