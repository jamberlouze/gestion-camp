// Confirmation des informations du séjour par le client (règles de
// confirmation.ts) et lien du formulaire d'une organisation (preRemplissage
// de demande.ts, route /api/reservations/demande avec `lien`).

import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { champsDe, confirmationOuverte, differences, evaluer, joursAvantArrivee, resumeChangement, texteRaison, valeur } from '../../src/modules/reservations/confirmation.ts'
import { jetonLien, preRemplissage } from '../../src/modules/reservations/demande.ts'
import { routeReservations } from './api.js'

const cn = {
  date_arrivee: '2027-03-10',
  date_depart: '2027-03-12',
  heure_arrivee: '10:00',
  heure_depart: '14:00',
  nb_participants: 40,
  nb_accompagnateurs: 4,
  ages: '10-11 ans',
  langue: 'Français',
  ratio: '1:15',
  service_repas: true,
  nb_dejeuners: 2,
  nb_diners: 3,
  nb_soupers: 2,
}

test('±10 % des participants jusqu’à 21 jours avant : dans les règles', () => {
  assert.equal(evaluer('classe_nature', cn, { ...cn, nb_participants: 43 }, '2026-10-14').dansRegles, true)
  // Exactement 10 % : encore dans les règles.
  assert.equal(evaluer('classe_nature', cn, { ...cn, nb_participants: 44 }, '2026-10-14').dansRegles, true)
  assert.equal(evaluer('classe_nature', cn, { ...cn, nb_participants: 36 }, '2026-10-14').dansRegles, true)
  const trop = evaluer('classe_nature', cn, { ...cn, nb_participants: 45 }, '2026-10-14')
  assert.equal(trop.dansRegles, false)
  assert.deepEqual(trop.raisons.map((r) => r.code), ['nombre'])
  assert.match(texteRaison(trop.raisons[0]), /de 40 à 45 \(\+13 %\)/)
})

test('délai : 21 jours avant l’arrivée (le jour même compte), sauf âges et langue', () => {
  assert.equal(joursAvantArrivee('2027-03-10', '2027-02-17'), 21)
  assert.equal(evaluer('classe_nature', cn, { ...cn, nb_participants: 41 }, '2027-02-17').dansRegles, true)
  const tard = evaluer('classe_nature', cn, { ...cn, nb_participants: 41 }, '2027-02-18')
  assert.deepEqual(tard.raisons, [{ code: 'delai', jours: 20, limite: 21, automne: false }])
  // Changements de dernière minute qui ne touchent pas la facture.
  assert.equal(evaluer('classe_nature', cn, { ...cn, ages: '11-12 ans', langue: 'Anglais' }, '2027-03-09').dansRegles, true)
  // Repas et heures comptent.
  assert.equal(evaluer('classe_nature', cn, { ...cn, nb_soupers: 3 }, '2027-03-01').dansRegles, false)
})

test('écoles de l’automne (août-septembre) : jusqu’à 3 jours avant', () => {
  const automne = { ...cn, date_arrivee: '2027-09-10', date_depart: '2027-09-12' }
  const v = evaluer('classe_nature', automne, { ...automne, nb_participants: 42 }, '2027-09-07')
  assert.equal(v.dansRegles, true)
  assert.equal(v.automne, true)
  assert.deepEqual(evaluer('journee_plein_air', automne, { ...automne, nb_participants: 42 }, '2027-09-08').raisons.map((r) => r.code), ['delai'])
  // Un groupe qui n'est pas une école : la règle des 21 jours.
  assert.equal(evaluer('accueil_groupe', automne, { ...automne, nb_participants: 42 }, '2027-09-07').dansRegles, false)
  // Le gros changement reste hors règle (ex. 30 → 130).
  assert.equal(evaluer('classe_nature', automne, { ...automne, nb_participants: 130 }, '2027-08-01').dansRegles, false)
})

test('dates et ratio : toujours à évaluer', () => {
  assert.deepEqual(evaluer('classe_nature', cn, { ...cn, date_depart: '2027-03-13' }, '2026-10-14').raisons.map((r) => r.code), ['dates'])
  assert.deepEqual(evaluer('classe_nature', cn, { ...cn, ratio: '1:10' }, '2026-10-14').raisons.map((r) => r.code), ['ratio'])
})

test('champs et différences selon le forfait', () => {
  assert.ok(!champsDe('classe_nature').includes('service_repas'))
  assert.ok(!champsDe('journee_plein_air').includes('date_depart'))
  assert.ok(!champsDe('journee_plein_air').includes('nb_diners'))
  assert.ok(!champsDe('accueil_groupe').includes('ratio'))
  // Mêmes valeurs écrites autrement (nombre en texte) : aucun changement.
  assert.deepEqual(differences(cn, { ...cn, nb_participants: '40' }, 'classe_nature'), [])
  const d = differences(cn, { ...cn, nb_participants: 42, date_depart: '2027-03-13' }, 'classe_nature')
  assert.equal(resumeChangement(d, 'classe_nature'), 'Départ : 12 mars 2027 → 13 mars 2027 ; Élèves : 40 → 42')
  assert.equal(resumeChangement(d, 'classe_nature', 'en'), 'Departure : March 12, 2027 → March 13, 2027 ; Students : 40 → 42')
  // Langue du groupe gardée en français, montrée dans la langue de la page.
  const l = differences(cn, { ...cn, langue: 'Anglais' }, 'classe_nature')
  assert.equal(resumeChangement(l, 'classe_nature'), 'Langue du groupe : Français → Anglais')
  assert.equal(resumeChangement(l, 'classe_nature', 'en'), 'Group language : French → English')
  assert.equal(valeur('langue', 'Français et anglais', 'en'), 'English and French')
  assert.equal(valeur('langue', 'Espagnol', 'en'), 'Espagnol')
})

test('fenêtre de confirmation : contrat signé, pas fermée, jusqu’au départ', () => {
  const r = { fermeture: null, signe_le: '2026-10-11', etape: 'confirmee', date_depart: '2027-03-12', origine: 'app' }
  assert.equal(confirmationOuverte(r, '2026-10-14'), true)
  assert.equal(confirmationOuverte({ ...r, signe_le: null, etape: 'estime_envoye' }, '2026-10-14'), false)
  assert.equal(confirmationOuverte({ ...r, fermeture: 'annulee' }, '2026-10-14'), false)
  assert.equal(confirmationOuverte(r, '2027-03-13'), false)
  assert.equal(confirmationOuverte({ ...r, origine: 'airbnb' }, '2026-10-14'), false)
})

// ------------------------------------------------------------------
// Lien du formulaire d'une organisation
// ------------------------------------------------------------------

const source = {
  organisation: { nom: 'École Saint-Paul-de-la-Croix', genre: 'ecole_primaire', adresse: '12 rue des Pins', ville: 'Montréal', province: 'QC', code_postal: 'H1A 1A1' },
  derniere: {
    forfait: 'classe_nature',
    nb_participants: 54,
    nb_accompagnateurs: 6,
    ages: '10-11 ans, 5e année',
    langue: 'Français',
    description: 'Deux classes de 5e année',
    service_repas: true,
    courriel_direction: 'direction@exemple.ca',
  },
  demande: { type_groupe: 'ecole', type_autre: '', langue: 'fr', pays: 'Canada', resp_prenom: 'Marie-Ève', resp_nom: 'De La Fontaine', resp_courriel: 'mev@exemple.ca' },
  responsable: { nom: 'Marie-Ève De La Fontaine', courriel: 'MEV@exemple.ca', telephone: '514 555-1234' },
  facturation: null,
}

test('preRemplissage : coordonnées et groupe de la dernière réservation, séjour à choisir', () => {
  const r = preRemplissage(source)
  assert.equal(r.organisation, 'École Saint-Paul-de-la-Croix')
  assert.equal(r.type_groupe, 'ecole')
  assert.equal(r.adresse, '12 rue des Pins')
  assert.equal(r.code_postal, 'H1A 1A1')
  // Même courriel que la dernière demande : prénom et nom tels qu'elle les a donnés.
  assert.equal(r.resp_prenom, 'Marie-Ève')
  assert.equal(r.resp_nom, 'De La Fontaine')
  assert.equal(r.resp_courriel, 'MEV@exemple.ca')
  assert.equal(r.facturation_meme, 'oui')
  assert.equal(r.nb_eleves, '54')
  assert.equal(r.nb_accompagnateurs, '6')
  assert.equal(r.nb_personnes, '60')
  assert.equal(r.langue, 'fr')
  assert.equal(r.courriel_direction, 'direction@exemple.ca')
  for (const cle of ['forfait', 'date', 'arrivee', 'depart', 'heures_ok', 'commentaires']) assert.equal(r[cle], '', cle)
})

test('preRemplissage : sans demande, type d’après le CRM, nom séparé, facturation à part', () => {
  const r = preRemplissage({
    ...source,
    organisation: { ...source.organisation, genre: 'organisme' },
    demande: null,
    derniere: { ...source.derniere, forfait: 'accueil_groupe', nb_accompagnateurs: null, langue: 'Anglais' },
    facturation: { nom: 'Paul Comptable', courriel: 'paie@exemple.ca', telephone: null },
  })
  assert.equal(r.type_groupe, 'osbl')
  assert.equal(r.resp_prenom, 'Marie-Ève')
  assert.equal(r.resp_nom, 'De La Fontaine')
  assert.equal(r.nb_personnes, '54')
  assert.equal(r.nb_eleves, '')
  assert.equal(r.langue, 'en')
  assert.equal(r.facturation_meme, 'non')
  assert.equal(r.fact_prenom, 'Paul')
  assert.equal(r.fact_courriel, 'paie@exemple.ca')
  // Organisation sans réservation ni contact : seulement ses coordonnées.
  const vide = preRemplissage({ ...source, derniere: null, demande: null, responsable: null })
  assert.equal(vide.nb_eleves, '')
  assert.equal(vide.facturation_meme, '')
  assert.equal(vide.pays, 'Canada')
})

test('jetonLien : 48 caractères hexadécimaux seulement', () => {
  const j = 'a'.repeat(48)
  assert.equal(jetonLien(`?lien=${j}&lang=en`), j)
  assert.equal(jetonLien('?lien=abc'), null)
  assert.equal(jetonLien(''), null)
})

const fetchOriginal = globalThis.fetch
afterEach(() => {
  globalThis.fetch = fetchOriginal
})

test('demande par le lien d’une organisation : le jeton va à recevoir_demande', async () => {
  const appels = []
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    appels.push({ url: u, init })
    if (u.includes('turnstile')) return Response.json({ success: true })
    if (u.includes('/rest/v1/rpc/recevoir_demande')) return Response.json({ id: 'x', numero: '27-G-201', deja: false })
    if (u.includes('/rest/v1/rpc/courriels_etat')) return Response.json([])
    return Response.json([])
  }
  const env = { SUPABASE_URL: 'https://base.test', SUPABASE_SECRET_KEY: 'sb_secret_x', TURNSTILE_SECRET: 'secret' }
  const reponses = {
    ...preRemplissage(source),
    forfait: 'classe_nature',
    arrivee: '2099-05-12',
    depart: '2099-05-14',
    heures_ok: 'oui',
  }
  const envoyer = (lien) =>
    routeReservations(
      new Request('https://app.test/api/reservations/demande', { method: 'POST', body: JSON.stringify({ cle: crypto.randomUUID(), turnstile: 'j', reponses, lien }) }),
      env,
      'demande',
    )
  assert.equal((await envoyer('b'.repeat(48))).status, 200)
  let corps = JSON.parse(appels.filter((a) => a.url.includes('recevoir_demande')).at(-1).init.body)
  assert.equal(corps.p_demande.lien, 'b'.repeat(48))
  // Jeton mal formé : ignoré (la demande arrive « à valider »).
  assert.equal((await envoyer('pas-un-jeton')).status, 200)
  corps = JSON.parse(appels.filter((a) => a.url.includes('recevoir_demande')).at(-1).init.body)
  assert.equal(corps.p_demande.lien, undefined)
})
