import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { aujourdhui, erreurs, genreSuggere, nettoyer, REPONSES_VIDES, versReservation } from '../../src/modules/reservations/demande.ts'
import { routeReservations } from './api.js'

const reglages = {
  heuresNormales: {
    classe_nature: ['10:00', '14:00'],
    journee_plein_air: ['09:00', '15:00'],
    accueil_groupe: ['16:00', '10:00'],
    location_salle_jour: ['09:00', '17:00'],
    location_salle_soir: ['16:00', '23:00'],
  },
  heuresRepas: { dejeuner: '08:00', diner: '12:00', souper: '17:30' },
  gratuitePar: 20,
  ratioDefaut: '1:15',
  diviseurHeuresExtra: 8,
  variantesClasse: { 5: 'verte', 6: 'verte', 12: 'blanche', 1: 'blanche' },
}

const classeNature = {
  ...REPONSES_VIDES,
  type_groupe: 'ecole',
  forfait: 'classe_nature',
  arrivee: '2027-05-12',
  depart: '2027-05-14',
  heures_ok: 'oui',
  nb_eleves: '54',
  ages: '10-11 ans, 5e année',
  nb_accompagnateurs: '6',
  langue: 'fr',
  organisation: 'École des Érables',
  adresse: '12 rue des Pins',
  ville: 'Laval',
  province: 'QC',
  code_postal: 'H7A 1A1',
  description: 'Deux classes de 5e année',
  resp_prenom: 'Julie',
  resp_nom: 'Essai',
  resp_courriel: 'julie@exemple.ca',
  resp_telephone: '450 555-1234',
  facturation_meme: 'oui',
  courriel_direction: 'direction@exemple.ca',
}

test('Classe nature : variante du mois, heures normales, ratio par défaut, repas proposés', () => {
  assert.deepEqual(erreurs(classeNature, 'fr', '2026-10-09'), {})
  const r = versReservation(nettoyer(classeNature), reglages)
  assert.equal(r.variante, 'verte')
  assert.equal(r.heure_arrivee, '10:00')
  assert.equal(r.heure_depart, '14:00')
  assert.equal(r.heures_regulieres, true)
  assert.equal(r.ratio, '1:15')
  assert.equal(r.service_repas, true)
  // 10 h → 14 h, 3 jours : dîner + souper, puis 3 repas, puis déjeuner + dîner.
  assert.deepEqual([r.nb_dejeuners, r.nb_diners, r.nb_soupers], [2, 3, 2])
  assert.equal(r.nb_participants, 54)
  assert.equal(r.nb_accompagnateurs, 6)
  assert.equal(r.langue, 'Français')
  assert.equal(r.courriel_direction, 'direction@exemple.ca')
})

test('Location de salle de soir, heures sur mesure, sans repas', () => {
  const r = {
    ...REPONSES_VIDES,
    type_groupe: 'particulier',
    forfait: 'location_salle',
    date: '2027-02-20',
    location: 'sur_mesure',
    heure_arrivee: '18:00',
    heure_depart: '23:30',
    nb_personnes: '80',
    repas: 'non',
    langue: 'en',
    organisation: 'Famille Essai',
    adresse: '1 rue A',
    ville: 'Mont-Tremblant',
    province: 'QC',
    code_postal: 'J8E 1A1',
    description: 'Fête',
    resp_prenom: 'A',
    resp_nom: 'B',
    resp_courriel: 'a@b.ca',
    resp_telephone: '819',
    facturation_meme: 'non',
    fact_prenom: 'C',
    fact_nom: 'D',
    fact_courriel: 'c@d.ca',
    fact_telephone: '819',
    // Réponses cachées par les conditions : jamais gardées.
    nb_eleves: '30',
    courriel_direction: 'x@y.ca',
  }
  assert.deepEqual(erreurs(r, 'en', '2026-10-09'), {})
  const n = nettoyer(r)
  assert.equal(n.nb_eleves, '')
  assert.equal(n.courriel_direction, '')
  const res = versReservation(n, reglages)
  assert.equal(res.date_arrivee, '2027-02-20')
  assert.equal(res.date_depart, '2027-02-20')
  assert.equal(res.variante, 'sur_mesure')
  assert.equal(res.heures_regulieres, false)
  assert.equal(res.heure_depart, '23:30')
  assert.equal(res.service_repas, false)
  assert.equal(res.nb_participants, 80)
  assert.equal(res.nb_accompagnateurs, null)
  assert.equal(res.ratio, null)
  assert.equal(res.langue, 'Anglais')
})

test('erreurs : champs obligatoires selon les conditions, dates et courriels', () => {
  const e = erreurs({ ...REPONSES_VIDES, forfait: 'journee_plein_air', type_groupe: 'ecole' }, 'fr', '2026-10-09')
  for (const cle of ['date', 'heures_ok', 'nb_eleves', 'ages', 'nb_accompagnateurs', 'courriel_direction', 'organisation']) assert.ok(e[cle], cle)
  assert.equal(e.arrivee, undefined)
  assert.equal(e.nb_personnes, undefined)
  const passe = erreurs({ ...classeNature, arrivee: '2026-10-01', resp_courriel: 'pas-un-courriel' }, 'en', '2026-10-09')
  assert.equal(passe.arrivee, 'Choose a future date.')
  assert.equal(passe.resp_courriel, 'Invalid email address.')
  const inverse = erreurs({ ...classeNature, depart: '2027-05-10' }, 'fr', '2026-10-09')
  assert.ok(inverse.depart)
})

test('genreSuggere : type du CRM proposé', () => {
  assert.equal(genreSuggere({ type_groupe: 'ecole', type_autre: '', ages: '10-11 ans', organisation: 'École A' }), 'ecole_primaire')
  assert.equal(genreSuggere({ type_groupe: 'ecole', type_autre: '', ages: '13-18 ans, secondaire', organisation: 'X' }), 'ecole_secondaire')
  assert.equal(genreSuggere({ type_groupe: 'ecole', type_autre: '', ages: '', organisation: 'Dawson College' }), 'cegep')
  assert.equal(genreSuggere({ type_groupe: 'osbl', type_autre: '', ages: '', organisation: '' }), 'organisme')
  assert.equal(genreSuggere({ type_groupe: 'autre', type_autre: 'Association étudiante', ages: '', organisation: '' }), 'association_etudiante')
})

test('aujourdhui : date de Montréal', () => {
  assert.equal(aujourdhui(new Date('2026-10-10T03:00:00Z')), '2026-10-09')
})

// ------------------------------------------------------------------
// Route /api/reservations/demande, réseau simulé
// ------------------------------------------------------------------
const fetchOriginal = globalThis.fetch
afterEach(() => {
  globalThis.fetch = fetchOriginal
})

const env = { SUPABASE_URL: 'https://base.test', SUPABASE_SECRET_KEY: 'sb_secret_x', TURNSTILE_SECRET: 'secret' }

function simuler({ turnstile = true } = {}) {
  const appels = []
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    appels.push({ url: u, init })
    if (u.includes('turnstile')) return Response.json({ success: turnstile })
    if (u.includes('/rest/v1/reglages')) return Response.json([{ cle: 'ratio_defaut', valeur: '1:10' }])
    if (u.includes('/rest/v1/rpc/recevoir_demande')) return Response.json({ id: 'x', numero: '27-G-200', deja: false })
    // Accusé de réception préparé tout de suite (phase 5) : rien à préparer ici.
    if (u.includes('/rest/v1/rpc/courriels_etat')) return Response.json([])
    if (u.includes('/rest/v1/modeles_courriels') || u.includes('/rest/v1/compagnies') || u.includes('/rest/v1/reglages')) return Response.json([])
    throw new Error(`Appel inattendu : ${u}`)
  }
  return appels
}

const requete = (corps) =>
  new Request('https://app.test/api/reservations/demande', { method: 'POST', body: JSON.stringify(corps), headers: { 'CF-Connecting-IP': '1.2.3.4' } })

test('demande : Turnstile refusé → 403, rien d’enregistré', async () => {
  const appels = simuler({ turnstile: false })
  const res = await routeReservations(requete({ cle: crypto.randomUUID(), turnstile: 'jeton', reponses: classeNature }), env, 'demande')
  assert.equal(res.status, 403)
  assert.ok(!appels.some((a) => a.url.includes('recevoir_demande')))
})

test('demande : réponses incomplètes → 422 avec les champs', async () => {
  simuler()
  const res = await routeReservations(requete({ cle: crypto.randomUUID(), turnstile: 'jeton', reponses: { ...classeNature, organisation: '' } }), env, 'demande')
  assert.equal(res.status, 422)
  assert.ok((await res.json()).champs.organisation)
})

test('demande : enregistrée avec la réservation préparée et l’adresse IP', async () => {
  const appels = simuler()
  const cle = crypto.randomUUID()
  const res = await routeReservations(requete({ cle, langue: 'fr', turnstile: 'jeton', reponses: { ...classeNature, arrivee: '2099-05-12', depart: '2099-05-14' } }), env, 'demande')
  assert.equal(res.status, 200)
  assert.equal((await res.json()).numero, '27-G-200')
  const rpc = appels.find((a) => a.url.includes('recevoir_demande'))
  const corps = JSON.parse(rpc.init.body)
  assert.equal(corps.p_reservation.ratio, '1:10')
  assert.equal(corps.p_reservation.forfait, 'classe_nature')
  assert.equal(corps.p_demande.cle, cle)
  assert.equal(corps.p_demande.adresse_ip, '1.2.3.4')
  assert.equal(corps.p_demande.reponses.organisation, 'École des Érables')
  assert.equal(rpc.init.headers.apikey, 'sb_secret_x')
})

test('demande : le champ piège fait semblant de réussir', async () => {
  const appels = simuler()
  const res = await routeReservations(requete({ cle: crypto.randomUUID(), piege: 'http://spam', reponses: classeNature }), env, 'demande')
  assert.equal(res.status, 200)
  assert.equal(appels.length, 0)
})
