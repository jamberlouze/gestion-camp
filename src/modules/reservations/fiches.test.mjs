// Fiches participants : rapport cuisine, export, page client. Lancer : npm run test:fiches
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { csvFiches, dieteParticuliere, fichesManquantes, fichesSurPageClient, libelleDiete, nomFiche, parNom, rapportCuisine } from './fiches.ts'

const LIBELLES = {
  reguliere: 'Régulière',
  vegetarienne: 'Végétarienne',
  sans_porc: 'Sans porc',
  halal: 'Halal',
  sans_lactose: 'Sans lactose',
  sans_gluten: 'Sans gluten',
  autre: 'Autre',
}
const ORDRE = Object.keys(LIBELLES)

const fiche = (champs) => ({
  id: crypto.randomUUID(),
  reservation_id: 'r1',
  genre: 'participant',
  prenom: 'Léa',
  nom: 'Tremblay',
  groupe: '5e A',
  matricule: null,
  sante: false,
  allergies: null,
  problemes_sante: null,
  epipen: null,
  diete: 'reguliere',
  diete_autre: null,
  medicaments: true,
  courriel: 'parent@exemple.test',
  nouvelles: false,
  langue: 'fr',
  recue_le: '2027-03-01T14:00:00Z',
  effacee_le: null,
  ...champs,
})

test('page client : fiches seulement à partir de la signature (comme page_client)', () => {
  const r = { forfait: 'classe_nature', fermeture: null, signe_le: null, etape: 'nouvelle' }
  for (const etape of ['nouvelle', 'contact', 'estime_envoye', 'estime_accepte', 'contrat_envoye']) assert.equal(fichesSurPageClient({ ...r, etape }), false, etape)
  for (const etape of ['confirmee', 'pre_arrivee', 'terminee', 'facture_finale', 'soldee']) assert.equal(fichesSurPageClient({ ...r, etape }), true, etape)
  assert.equal(fichesSurPageClient({ ...r, etape: 'contrat_envoye', signe_le: '2026-10-21' }), true)
  assert.equal(fichesSurPageClient({ ...r, forfait: 'journee_plein_air', etape: 'confirmee' }), true)
  assert.equal(fichesSurPageClient({ ...r, forfait: 'accueil_groupe', etape: 'confirmee' }), false)
  assert.equal(fichesSurPageClient({ ...r, etape: 'confirmee', fermeture: 'annulee' }), false)
})

test('fiches manquantes : jamais négatif', () => {
  assert.equal(fichesManquantes(40, 44), 4)
  assert.equal(fichesManquantes(46, 44), 0)
  assert.equal(fichesManquantes(0, 0), 0)
})

test('diète particulière et libellé', () => {
  assert.equal(dieteParticuliere({ diete: 'reguliere' }), false)
  assert.equal(dieteParticuliere({ diete: null }), false)
  assert.equal(dieteParticuliere({ diete: 'halal' }), true)
  assert.equal(libelleDiete({ diete: 'autre', diete_autre: ' Sans œufs ' }, LIBELLES), 'Sans œufs')
  assert.equal(libelleDiete({ diete: 'autre', diete_autre: '' }, LIBELLES), 'Autre')
  assert.equal(libelleDiete({ diete: 'sans_porc', diete_autre: null }, LIBELLES), 'Sans porc')
  assert.equal(libelleDiete({ diete: null, diete_autre: null }, LIBELLES), '')
})

test('nom et ordre : nom de famille, prénom, sans casse ni accents', () => {
  const l = parNom([
    { prenom: 'Zoé', nom: 'émond' },
    { prenom: 'Adam', nom: 'Bélanger' },
    { prenom: 'Alex', nom: 'bélanger' },
    { prenom: 'Léo', nom: 'Côté' },
  ])
  assert.deepEqual(l.map(nomFiche), ['Bélanger, Adam', 'bélanger, Alex', 'Côté, Léo', 'émond, Zoé'])
  assert.equal(nomFiche({ prenom: null, nom: null }), '')
})

test('rapport cuisine : allergies (Epipen en tête), diètes dans l’ordre, fiches effacées ignorées', () => {
  const fiches = [
    fiche({ prenom: 'Léa', nom: 'Tremblay', sante: true, allergies: 'Arachides', epipen: false }),
    fiche({ prenom: 'Noah', nom: 'Roy', sante: true, allergies: 'Noix', epipen: true }),
    fiche({ prenom: 'Emma', nom: 'Gagnon', diete: 'vegetarienne' }),
    fiche({ prenom: 'Liam', nom: 'Côté', diete: 'autre', diete_autre: 'Sans œufs', sante: true, allergies: '  ', epipen: false }),
    fiche({ prenom: 'Mia', nom: 'Bouchard', diete: 'halal', sante: true, allergies: 'Lactose' }),
    fiche({ prenom: null, nom: null, diete: null, allergies: null, effacee_le: '2027-07-01T08:30:00Z' }),
    fiche({ prenom: 'Zack', nom: 'Morin' }),
  ]
  const r = rapportCuisine(fiches, ORDRE)
  assert.equal(r.lues, 6)
  assert.deepEqual(r.allergies.map(nomFiche), ['Roy, Noah', 'Bouchard, Mia', 'Tremblay, Léa'])
  assert.deepEqual(
    r.dietes.map((d) => [d.diete, d.fiches.map(nomFiche)]),
    [
      ['vegetarienne', ['Gagnon, Emma']],
      ['halal', ['Bouchard, Mia']],
      ['autre', ['Côté, Liam']],
    ],
  )
})

test('export CSV : BOM, « ; », guillemets, sans courriel ni fiche effacée', () => {
  const csv = csvFiches(
    [
      fiche({ prenom: 'Léa', nom: 'Tremblay', sante: true, allergies: 'Arachides; noix "graves"', epipen: true, medicaments: false }),
      fiche({ genre: 'adulte', prenom: 'Marc', nom: 'Aubin', groupe: null, diete: 'autre', diete_autre: 'Sans œufs' }),
      fiche({ prenom: null, nom: null, effacee_le: '2027-07-01T08:30:00Z' }),
    ],
    LIBELLES,
  )
  assert.ok(csv.startsWith('﻿Nom;Prénom;Type;'))
  const lignes = csv.slice(1).split('\r\n')
  assert.equal(lignes.length, 3)
  assert.equal(lignes[1], 'Aubin;Marc;Adulte;;;2027-03-01;;;;Sans œufs;Oui')
  assert.equal(lignes[2], 'Tremblay;Léa;Élève;5e A;;2027-03-01;"Arachides; noix ""graves""";;Oui;Régulière;Non')
  assert.ok(!csv.includes('parent@exemple.test'))
})
