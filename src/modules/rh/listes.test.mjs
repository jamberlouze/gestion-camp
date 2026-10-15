// Liste de la saison, export ACQ (listes.ts) et correspondance avec le
// référentiel Employés (referentiel.ts).
// Lancer : node --test src/modules/rh/listes.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ENTETES_ACQ, ENTETES_LISTE, rangeesAcq, rangeesListe } from './listes.ts'
import { correspondance, nomFiche } from './referentiel.ts'

test('rangeesListe : en-têtes, libellés (genre, statut, diète), contacts d’urgence, disponibilités ; jamais de NAS', () => {
  const r = rangeesListe([
    {
      embauche: { genre: 'emploi', echelon: 2, statut: 'complete' },
      personne: { prenom: 'Thomas', nom_famille: 'Pelletier', surnom: 'Hibou', courriel: 'thomas@essai.test', telephone: '819 555-0202', date_naissance: '2004-09-03' },
      dossier: { diete: 'vegetarienne', allergies: 'Arachides', taille_tshirt: 'L', taille_hoodie: null, urgence1_nom: 'Nathalie Pelletier', urgence1_lien: 'Mère', urgence1_telephone: '819 555-0299' },
      compagnie: 'GBPA+',
      poste: 'Animateur',
      disponibilites: ['Formation 1', 'Semaine 1'],
    },
    {
      embauche: { genre: 'benevolat', echelon: null, statut: 'dossier_recu' },
      personne: { prenom: 'Maya', nom_famille: 'Nguyen', surnom: null, courriel: null, telephone: null, date_naissance: null },
      dossier: null,
      compagnie: 'GBPA+',
      poste: '',
      disponibilites: [],
    },
  ])
  assert.deepEqual(r[0], ENTETES_LISTE)
  assert.equal(r[0].length, 18)
  assert.ok(!r[0].some((x) => /NAS|compte/i.test(x)))
  assert.deepEqual(r[1], [
    'Pelletier',
    'Thomas',
    'Hibou',
    'GBPA+',
    'Animateur',
    2,
    'Emploi',
    'Complète',
    'thomas@essai.test',
    '819 555-0202',
    '2004-09-03',
    'Végétarienne',
    'Arachides',
    'L',
    '',
    'Nathalie Pelletier (Mère) 819 555-0299',
    '',
    'Formation 1, Semaine 1',
  ])
  assert.equal(r[2][6], 'Bénévolat')
  assert.equal(r[2][7], 'Dossier reçu')
  assert.equal(r[2][11], '')
})

test('rangeesAcq : oui/non, cartes (expiration la plus lointaine)', () => {
  const r = rangeesAcq([
    {
      personne: { prenom: 'Thomas', nom_famille: 'Pelletier', courriel: 'thomas@essai.test' },
      dossier: { etudiant_temps_plein: true, pays: 'Canada', etudes: 'Techniques de loisir' },
      compagnie: 'GBPA+',
      poste: 'Animateur',
      ancien: true,
      documents: [
        { personne_id: 'p', genre: 'cv', expire_le: null },
        { personne_id: 'p', genre: 'premiers_soins', expire_le: '2026-05-01' },
        { personne_id: 'p', genre: 'premiers_soins', expire_le: '2028-05-01' },
        { personne_id: 'p', genre: 'sauveteur', expire_le: null },
      ],
    },
    { personne: { prenom: 'Maya', nom_famille: 'Nguyen', courriel: null }, dossier: null, compagnie: 'GBPA+', poste: 'Animateur', ancien: false, documents: [] },
  ])
  assert.deepEqual(r[0], ENTETES_ACQ)
  assert.deepEqual(r[1], ['Thomas', 'Pelletier', 'thomas@essai.test', 'GBPA+', 'Animateur', 'Oui', 'Canada', 'Oui', 'Techniques de loisir', 'Oui', 'Non', '2028-05-01', 'Oui (sans date)'])
  assert.deepEqual(r[2], ['Maya', 'Nguyen', '', 'GBPA+', 'Animateur', '', '', 'Non', '', 'Non', 'Non', '', ''])
})

test('correspondance : même courriel (sûre), sinon même nom (à vérifier), jamais une fiche déjà reliée', () => {
  const fiche = (id, surnom, prenom, nom, courriel = null) => ({ id, surnom, nom_complet: nom ? `${nom}, ${prenom}` : null, prenom, nom_famille: nom, courriel, actif: true, entreprise_ids: [], matricule_employeur_d: null })
  const fiches = [fiche('a', 'Hibou', 'Thomas', 'Pelletier', 'Thomas@Essai.test'), fiche('b', 'Pinson', 'Léa', 'Morin'), fiche('c', 'Plume', 'Léa', 'Morin'), fiche('d', 'Loutre', 'Rosalie', 'Gauthier')]
  const p = (prenom, nom, courriel = null) => ({ prenom, nom_famille: nom, courriel })
  assert.deepEqual(correspondance(p('T', 'X', 'thomas@essai.test'), fiches, new Set()), { employe: fiches[0], sure: true })
  assert.equal(correspondance(p('T', 'X', 'thomas@essai.test'), fiches, new Set(['a'])), null)
  assert.deepEqual(correspondance(p('rosalie', 'GAUTHIER'), fiches, new Set()), { employe: fiches[3], sure: false })
  assert.deepEqual(correspondance(p('Rosalie', 'Gauthier', 'autre@x.ca'), fiches, new Set()), { employe: fiches[3], sure: false })
  // Deux fiches au même nom : rien de proposé ; une des deux reliée ailleurs : l'autre.
  assert.equal(correspondance(p('Lea', 'Morin'), fiches, new Set()), null)
  assert.deepEqual(correspondance(p('Lea', 'Morin'), fiches, new Set(['b'])), { employe: fiches[2], sure: false })
  // Sans nom de famille : pas de correspondance par le nom.
  assert.equal(correspondance(p('Rosalie', ''), fiches, new Set()), null)
  assert.equal(nomFiche(fiches[0]), 'Hibou (Pelletier, Thomas)')
  assert.equal(nomFiche({ surnom: 'Brindille', nom_complet: null }), 'Brindille')
})
