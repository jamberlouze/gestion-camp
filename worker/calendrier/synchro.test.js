import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CHAMPS, dateLocale, synchroniser, versSejour } from './synchro.js'

const liens = {
  clients: new Map([['recClient', 'Tremblant'], ['recClient2', 'Regina']]),
  types: new Map([
    ['recClasse', { nom: 'Classe nature', animation: true }],
    ['recSalle', { nom: 'Location de salle', animation: false }],
  ]),
  hebergements: new Map([
    ['recCedres', 'Cèdres haut (36 lits - 7 chambres)'],
    ['recPP', 'Pavillon Principal (133 lits - 28 chambres)'],
  ]),
}

test('dateLocale : heure de Toronto, y compris le changement de jour', () => {
  assert.deepEqual(dateLocale('2026-10-14T20:00:00.000Z'), { date: '2026-10-14', heure: '16:00' })
  // Minuit UTC = la veille au soir à Toronto (comme Airtable l'affiche).
  assert.deepEqual(dateLocale('2026-10-14T00:00:00.000Z'), { date: '2026-10-13', heure: '20:00' })
  // Heure normale (UTC−5) en février.
  assert.deepEqual(dateLocale('2027-02-01T15:00:00.000Z'), { date: '2027-02-01', heure: '10:00' })
  assert.deepEqual(dateLocale(undefined), { date: null, heure: null })
})

test('versSejour : champs de la réservation', () => {
  const s = versSejour(
    {
      id: 'rec1',
      fields: {
        [CHAMPS.numero]: '27-G-52',
        [CHAMPS.client]: ['recClient2'],
        [CHAMPS.typeSejour]: ['recClasse'],
        [CHAMPS.arrivee]: '2027-02-01T15:00:00.000Z',
        [CHAMPS.depart]: '2027-02-05T19:00:00.000Z',
        [CHAMPS.participants]: 35,
        [CHAMPS.serviceRepas]: 'Oui',
        [CHAMPS.hebergement]: ['recCedres', 'recPP'],
        [CHAMPS.batiment]: ['PP', 'PP'],
        [CHAMPS.animateurs]: 2,
        [CHAMPS.etat]: 'Confirmée',
      },
    },
    liens,
  )
  assert.equal(s.airtable_record_id, 'rec1')
  assert.equal(s.nom_groupe, 'Regina')
  assert.equal(s.type_sejour, 'Classe nature')
  assert.equal(s.date_arrivee, '2027-02-01')
  assert.equal(s.date_depart, '2027-02-05')
  assert.equal(s.heure_arrivee, '10:00')
  assert.equal(s.heure_depart, '14:00')
  assert.equal(s.section_batiment, 'Cèdres haut, Pavillon Principal')
  assert.equal(s.batiment, 'PP')
  assert.equal(s.nb_participants, 35)
  assert.equal(s.avec_animation, true)
  assert.equal(s.avec_repas, true)
  assert.equal(s.etat, 'Confirmée')
})

test('versSejour : sans client, sans animation, sans dates', () => {
  const s = versSejour(
    {
      id: 'rec2',
      fields: {
        [CHAMPS.numero]: '26-G-57',
        [CHAMPS.typeSejour]: ['recSalle'],
        [CHAMPS.arrivee]: '2026-10-14T13:00:00.000Z',
        [CHAMPS.serviceRepas]: 'Non',
      },
    },
    liens,
  )
  assert.equal(s.nom_groupe, '26-G-57')
  assert.equal(s.date_depart, '2026-10-14')
  assert.equal(s.avec_animation, false)
  assert.equal(s.avec_repas, false)
  assert.equal(s.section_batiment, null)
  assert.equal(versSejour({ id: 'rec3', fields: { [CHAMPS.numero]: 'x' } }, liens), null)
})

test('synchroniser : lit les 4 tables et envoie les séjours en un appel', async () => {
  const appels = []
  const avant = globalThis.fetch
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url)
    appels.push({ url: u, options })
    if (u.startsWith('https://api.airtable.com/')) {
      assert.equal(options.headers.Authorization, 'Bearer jeton-airtable')
      const table = u.split('/')[5].split('?')[0]
      const records =
        table === 'tblOFT5bIV6gG9W2N'
          ? [{ id: 'recA', fields: { [CHAMPS.client]: ['recC'], [CHAMPS.arrivee]: '2026-11-02T14:00:00.000Z' } }]
          : table === 'tbldOmSW4gDgWsbT2'
            ? [{ id: 'recC', fields: { [CHAMPS.nomClient]: 'École Test' } }]
            : []
      return new Response(JSON.stringify({ records }))
    }
    assert.match(u, /rest\/v1\/rpc\/synchroniser_sejours$/)
    const corps = JSON.parse(options.body)
    assert.equal(corps.p_source, 'app')
    assert.equal(corps.p_sejours.length, 1)
    assert.equal(corps.p_sejours[0].nom_groupe, 'École Test')
    return new Response(JSON.stringify({ recus: 1, ajoutes: 1, modifies: 0, retires: 0 }))
  }
  try {
    const bilan = await synchroniser(
      { AIRTABLE_TOKEN: 'jeton-airtable', SUPABASE_SECRET_KEY: 'sb_secret_x', SUPABASE_URL: 'https://exemple.supabase.co' },
      'app',
    )
    assert.deepEqual(bilan, { recus: 1, ajoutes: 1, modifies: 0, retires: 0 })
    assert.equal(appels.filter((a) => a.url.startsWith('https://api.airtable.com/')).length, 4)
  } finally {
    globalThis.fetch = avant
  }
})
