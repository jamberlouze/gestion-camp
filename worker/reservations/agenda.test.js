import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { actionsAgenda, calendrierDe, evenementAgenda } from '../../src/modules/reservations/agenda.ts'
import { chevauchements, conflitsAirbnb, conflitsAirbnbDe, estConfirmee, nuits, seChevauchent } from '../../src/modules/reservations/disponibilite.ts'
import { modeAgenda, synchroniserAgenda } from './agenda.js'
import { importerAirbnb, lireIcal, reservationsAirbnb } from './airbnb.js'

const resa = (modif = {}) => ({
  id: 'r1',
  numero: '27-G-055',
  nom: 'Collège Citoyen',
  forfait: 'classe_nature',
  date_arrivee: '2026-10-21',
  date_depart: '2026-10-23',
  heure_arrivee: '09:30:00',
  heure_depart: '13:00:00',
  nb_participants: 256,
  nb_accompagnateurs: 10,
  etages: ['CH', 'CB'],
  salles: [],
  etape: 'confirmee',
  fermeture: null,
  origine: 'app',
  ...modif,
})

test('calendrier selon l’étape ; Confirmée VF dès qu’une section ou salle de la VF ; rien pour Airbnb ni une réservation fermée', () => {
  assert.equal(calendrierDe(resa({ etape: 'nouvelle' })), 'demande')
  assert.equal(calendrierDe(resa({ etape: 'contact' })), 'demande')
  assert.equal(calendrierDe(resa({ etape: 'estime_accepte' })), 'estime')
  assert.equal(calendrierDe(resa({ etape: 'contrat_envoye' })), 'contrat')
  assert.equal(calendrierDe(resa()), 'confirmee_pp')
  assert.equal(calendrierDe(resa({ etape: 'soldee', etages: ['VFH'] })), 'confirmee_vf')
  assert.equal(calendrierDe(resa({ salles: ['CVF'] })), 'confirmee_vf')
  assert.equal(calendrierDe(resa({ fermeture: 'en_attente' })), null)
  assert.equal(calendrierDe(resa({ origine: 'airbnb', etages: ['VFB'] })), null)
})

test('événement : journée entière, nuits [arrivée, départ) ; journée sans nuit = son jour ; rien de personnel', () => {
  const e = evenementAgenda(resa(), 'https://app.test/reservations/r/r1')
  assert.deepEqual([e.summary, e.start.date, e.end.date], ['27-G-055 · Collège Citoyen (266)', '2026-10-21', '2026-10-23'])
  assert.equal(e.description, 'Classe nature · 256 + 10 personnes\nArrivée 21 oct. 9h30 · départ 23 oct. 13h\nSections : CH, CB\nhttps://app.test/reservations/r/r1')
  const jpa = evenementAgenda(resa({ forfait: 'journee_plein_air', date_arrivee: '2027-05-01', date_depart: '2027-05-01', nb_participants: null, nb_accompagnateurs: null }), 'x')
  assert.deepEqual([jpa.summary, jpa.end.date], ['27-G-055 · Collège Citoyen', '2027-05-02'])
  assert.match(jpa.description, /Arrivée 1er mai/)
})

test('actions : créer, modifier si le contenu change, déplacer de calendrier, retirer ; Confirmée VF d’abord', () => {
  const lien = (id) => `https://app.test/${id}`
  const a = resa({ id: 'a', etape: 'nouvelle' })
  const b = resa({ id: 'b' })
  const c = resa({ id: 'c', etages: ['VFB'] })
  const d = resa({ id: 'd', fermeture: 'closed_lost' })
  const contenuB = JSON.stringify(evenementAgenda(b, lien('b')))
  const lignes = [
    { reservation_id: 'b', calendrier: 'confirmee_pp', google_id: 'g-b', contenu: contenuB },
    { reservation_id: 'c', calendrier: 'contrat', google_id: 'g-c', contenu: 'ancien' },
    { reservation_id: 'd', calendrier: 'estime', google_id: 'g-d', contenu: 'ancien' },
  ]
  const actions = actionsAgenda([a, b, c, d], lignes, lien)
  assert.deepEqual(
    actions.map((x) => [x.genre, x.reservation_id, x.calendrier ?? null]),
    [
      ['deplacer', 'c', 'confirmee_vf'],
      ['creer', 'a', 'demande'],
      ['retirer', 'd', null],
    ],
  )
  // Le contenu change (nouvelle date) : on le réécrit.
  assert.equal(actionsAgenda([{ ...b, date_depart: '2026-10-24' }], lignes, lien)[0].genre, 'modifier')
})

test('disponibilité : nuits, chevauchements de sections et salles entre réservations confirmées, conflit Airbnb', () => {
  assert.deepEqual(nuits({ date_arrivee: '2027-05-01', date_depart: '2027-05-01' }), ['2027-05-01', '2027-05-02'])
  // Le jour du départ reste libre : départ le 23, arrivée suivante le 23.
  assert.equal(seChevauchent({ date_arrivee: '2026-10-21', date_depart: '2026-10-23' }, { date_arrivee: '2026-10-23', date_depart: '2026-10-25' }), false)
  assert.equal(estConfirmee({ etape: 'contrat_envoye', fermeture: null, origine: 'app' }), false)
  assert.equal(estConfirmee({ etape: 'confirmee', fermeture: null, origine: 'airbnb' }), true)
  const groupe = resa({ id: 'g', etages: ['VFB', 'CH'], etape: 'contrat_envoye' })
  const airbnb = resa({ id: 'x', numero: '27-A-001', origine: 'airbnb', etages: ['VFB'], date_arrivee: '2026-10-22', date_depart: '2026-10-24' })
  const autre = resa({ id: 'o', numero: '27-G-099', etages: ['CH'], date_arrivee: '2026-10-20', date_depart: '2026-10-22' })
  const nonConfirmee = resa({ id: 'n', etape: 'estime_envoye', etages: ['CH'] })
  const c = chevauchements(groupe, [groupe, airbnb, autre, nonConfirmee])
  assert.deepEqual(c.map((x) => [x.autre.id, x.communs]), [['o', ['CH']], ['x', ['VFB']]])
  assert.deepEqual(conflitsAirbnbDe(groupe, [airbnb, autre]).map((x) => x.autre.id), ['x'])
  // Étage du haut seulement : l'annonce « étage du bas » ne le touche pas.
  assert.equal(conflitsAirbnbDe({ ...groupe, etages: ['VFH'] }, [airbnb]).length, 0)
  // La liste ne signale que les groupes confirmés.
  assert.equal(conflitsAirbnb([groupe, airbnb]).length, 0)
  assert.deepEqual(conflitsAirbnb([{ ...groupe, etape: 'confirmee' }, airbnb]).map((x) => [x.groupe.id, x.airbnb.id]), [['g', 'x']])
})

const ICAL = [
  'BEGIN:VCALENDAR',
  'PRODID:-//Airbnb Inc//Hosting Calendar 1.0//EN',
  'BEGIN:VEVENT',
  'DTSTAMP:20261010T171006Z',
  'DTSTART;VALUE=DATE:20270102',
  'DTEND;VALUE=DATE:20270103',
  'SUMMARY:Reserved',
  'UID:1418fb94e984-abc@airbnb.com',
  'DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMABC123\\nPhone Num',
  ' ber (Last 4 Digits): 1234',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20261101',
  'DTEND;VALUE=DATE:20261130',
  'SUMMARY:Airbnb (Not available)',
  'UID:bloc@airbnb.com',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

test('iCal d’Airbnb : seulement « Reserved » (les blocages sont ignorés), lignes dépliées, lien de la réservation, pas le téléphone', () => {
  const evenements = lireIcal(ICAL)
  assert.equal(evenements.length, 2)
  assert.match(evenements[0].description, /Phone Number \(Last 4 Digits\)/)
  assert.deepEqual(reservationsAirbnb(evenements), [
    { uid: '1418fb94e984-abc@airbnb.com', arrivee: '2027-01-02', depart: '2027-01-03', lien: 'https://www.airbnb.com/hosting/reservations/details/HMABC123' },
  ])
})

// ------------------------------------------------------------------
// Worker, réseau simulé
// ------------------------------------------------------------------

const fetchOriginal = globalThis.fetch
afterEach(() => {
  globalThis.fetch = fetchOriginal
})

function simuler({ reglage = null, reservations = [], lignes = [], ical = ICAL } = {}) {
  const appels = []
  const rep = (corps, status = 200) => (corps === null ? new Response(null, { status }) : Response.json(corps, { status }))
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    const m = init.method ?? 'GET'
    appels.push({ u, m, corps: init.body && typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : init.body ?? null })
    if (u.startsWith('https://ical.test/')) return new Response(u.includes('panne') ? 'Service Unavailable' : ical, { status: u.includes('panne') ? 503 : 200 })
    if (u.endsWith('/rpc/recevoir_airbnb')) return rep({ ajoutees: 1, modifiees: 0, annulees: 0 })
    if (u.includes('/reglages?cle=eq.agenda')) return rep(reglage ? [{ valeur: reglage }] : [])
    if (u.includes('/reglages?cle=eq.airbnb_lecture')) return rep([])
    if (u.endsWith('/rest/v1/reglages') && m === 'POST') return rep([{}], 201)
    if (u.includes('/reservations?select=')) return rep(reservations)
    if (u.includes('/agenda?select=')) return rep(lignes)
    if (u.includes('/rest/v1/agenda')) return rep(m === 'POST' ? [{}] : null, m === 'POST' ? 201 : 204)
    if (u === 'https://oauth2.googleapis.com/token') return rep({ access_token: 'AT' })
    if (u.startsWith('https://www.googleapis.com/calendar/v3/')) return m === 'DELETE' ? rep(null, 204) : rep({ id: 'g-nouveau' })
    throw new Error(`Appel inattendu : ${m} ${u}`)
  }
  return appels
}

const ENV = { SUPABASE_URL: 'https://base.test', SUPABASE_SECRET_KEY: 'sb_secret_x', APP_URL: 'https://app.test' }

test('import Airbnb : une annonce en panne n’annule rien, l’autre est reçue ; bilan gardé', async () => {
  const appels = simuler()
  const bilan = await importerAirbnb({ ...ENV, AIRBNB_ICAL_VF_COMPLET: 'https://ical.test/complet', AIRBNB_ICAL_VF_BAS: 'https://ical.test/panne' })
  const recus = appels.filter((a) => a.u.endsWith('/rpc/recevoir_airbnb')).map((a) => a.corps)
  assert.deepEqual(recus.map((c) => [c.p_annonce, c.p_evenements.length]), [['vf_complet', 1]])
  assert.match(bilan.erreurs[0], /vf_bas : Airbnb a répondu 503/)
  assert.ok(appels.some((a) => a.u.endsWith('/rest/v1/reglages') && a.m === 'POST' && a.corps.cle === 'airbnb_lecture'))
})

test('agenda : rien tant que le réglage est inactif ; simulé sur une base locale ; Google en PROD (jeton, création)', async () => {
  let appels = simuler({ reglage: { actif: false, calendriers: {} } })
  assert.equal((await synchroniserAgenda(ENV)).actif, false)
  assert.ok(!appels.some((a) => a.u.includes('googleapis')))

  const reglage = { actif: true, calendriers: { demande: 'cal-demande', estime: 'e', contrat: 'c', confirmee_pp: 'cal-pp', confirmee_vf: 'cal-vf' } }
  assert.equal(modeAgenda({ SUPABASE_URL: 'http://127.0.0.1:54321' }), 'simule')
  appels = simuler({ reglage, reservations: [resa()] })
  const simule = await synchroniserAgenda({ ...ENV, SUPABASE_URL: 'http://127.0.0.1:54321' })
  assert.deepEqual([simule.mode, simule.faites], ['simule', 1])
  assert.ok(!appels.some((a) => a.u.includes('googleapis')))
  assert.match(appels.find((a) => a.u.endsWith('/rest/v1/agenda') && a.m === 'POST').corps.google_id, /^simule:/)

  assert.equal((await synchroniserAgenda(ENV)).mode, 'non_configure')
  appels = simuler({ reglage, reservations: [resa()] })
  const google = await synchroniserAgenda({ ...ENV, GMAIL_CLIENT_ID: 'id', GMAIL_CLIENT_SECRET: 's', GOOGLE_AGENDA_REFRESH_TOKEN: 'rt' })
  assert.deepEqual([google.mode, google.faites], ['google', 1])
  const creation = appels.find((a) => a.u.startsWith('https://www.googleapis.com/calendar/v3/'))
  assert.equal(creation.u, 'https://www.googleapis.com/calendar/v3/calendars/cal-pp/events')
  assert.equal(creation.corps.summary, '27-G-055 · Collège Citoyen (266)')
  assert.equal(appels.find((a) => a.u.endsWith('/rest/v1/agenda') && a.m === 'POST').corps.google_id, 'g-nouveau')
})

test('agenda : calendrier pas réglé → erreur gardée sur la ligne, rien d’écrit dans Google', async () => {
  const appels = simuler({ reglage: { actif: true, calendriers: { confirmee_pp: '' } }, reservations: [resa()] })
  const res = await synchroniserAgenda({ ...ENV, GMAIL_CLIENT_ID: 'id', GMAIL_CLIENT_SECRET: 's', GOOGLE_AGENDA_REFRESH_TOKEN: 'rt' })
  assert.equal(res.faites, 0)
  assert.match(appels.find((a) => a.u.endsWith('/rest/v1/agenda') && a.m === 'POST').corps.erreur, /Calendrier « Confirmée PP » pas encore réglé/)
  assert.ok(!appels.some((a) => a.u.startsWith('https://www.googleapis.com/calendar')))
})
