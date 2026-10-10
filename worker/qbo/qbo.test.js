import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { clientQbo as payloadClient, echeancier, lignesQbo, tachesFacturation } from '../../src/modules/reservations/facturation.ts'
import { chiffrer, dechiffrer, signer, verifier } from './chiffre.js'
import { routeQbo } from './api.js'
import { lireCdc, normaliser } from './operations.js'

const CLE = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1)))
const env = {
  SUPABASE_URL: 'https://base.test',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
  SUPABASE_SECRET_KEY: 'sb_secret_x',
  QBO_CLIENT_ID: 'client',
  QBO_CLIENT_SECRET: 'secret',
  QBO_CLE: CLE,
  APP_URL: 'https://app.test',
}

// ------------------------------------------------------------------
// Règles de facturation (fonctions pures)
// ------------------------------------------------------------------

test('échéancier Classe nature : 25 / 50 / 25, acompte 2 facturé 35 jours avant, dû 21 jours avant', () => {
  const e = echeancier({ forfait: 'classe_nature', total: 15553.02, signe_le: '2026-10-09', date_arrivee: '2027-05-19', date_depart: '2027-05-21' })
  assert.deepEqual(e.map((x) => x.cle), ['acompte1', 'acompte2', 'finale'])
  assert.equal(e[0].montant, 3888.26)
  assert.equal(e[0].echeance, null)
  assert.equal(e[1].montant, 7776.51)
  assert.equal(e[1].facturer_le, '2027-04-14')
  assert.equal(e[1].echeance, '2027-04-28')
  assert.equal(e[2].facturer_le, '2027-05-22')
  assert.equal(e[2].montant, null)
})

test('échéancier Accueil de groupe : 25 / 75 ; réservation tardive : acomptes réunis (F8)', () => {
  const ag = echeancier({ forfait: 'accueil_groupe', total: 1000, signe_le: '2026-10-01', date_arrivee: '2027-01-15', date_depart: '2027-01-17' })
  assert.equal(ag[1].part, 0.75)
  assert.equal(ag[1].montant, 750)
  const tardive = echeancier({ forfait: 'journee_plein_air', total: 1000, signe_le: '2027-05-01', date_arrivee: '2027-05-20', date_depart: '2027-05-20' })
  assert.deepEqual(tardive.map((x) => x.cle), ['acompte1', 'finale'])
  assert.equal(tardive[0].montant, 750)
  const taches = tachesFacturation('27-G-900', tardive)
  assert.match(taches[0].titre, /^27-G-900 : facturer acomptes 1 et 2 \(75 %, réservation tardive\) du devis 27-G-900 dans QBO, 750,00\s\$ \(payable sur réception\)$/)
})

test('lignes QBO : mêmes montants ; quantité 1 quand quantité × prix ne tombe pas juste', () => {
  const l = lignesQbo(
    [
      { code: 'CN-N', description: 'Forfait Classe nature', note: '2 nuits', quantite: 48, prix_unitaire: 271.3, montant: 13022.4 },
      { code: 'RABAIS', description: 'Rabais 5 %', note: null, quantite: 1, prix_unitaire: -651.12, montant: -651.12 },
      { code: 'X', description: 'Ligne arrondie', note: null, quantite: 3, prix_unitaire: 33.33, montant: 100 },
    ],
    (code) => (code === 'CN-N' ? { id: '7', nom: 'Classe nature' } : { id: '1', nom: 'Services' }),
    { id: '9', nom: 'TPS/TVQ QC' },
  )
  assert.equal(l[0].SalesItemLineDetail.ItemRef.value, '7')
  assert.equal(l[0].SalesItemLineDetail.Qty, 48)
  assert.equal(l[0].Description, 'Forfait Classe nature\n2 nuits')
  assert.equal(l[1].Amount, -651.12)
  assert.deepEqual([l[2].SalesItemLineDetail.Qty, l[2].SalesItemLineDetail.UnitPrice, l[2].Amount], [1, 100, 100])
  assert.equal(l[2].SalesItemLineDetail.TaxCodeRef.value, '9')
})

test('client QBO : pas de deux-points dans le nom, payable sur réception', () => {
  const c = payloadClient(
    { nom: 'École A : campus B', adresse: '1 rue X', ville: 'Laval', province: 'QC', code_postal: 'H7A 1A1', telephone: null },
    { nom: 'Marc', courriel: 'compta@x.ca', telephone: '450' },
    { id: '3', nom: 'Payable dès réception' },
  )
  assert.equal(c.DisplayName, 'École A - campus B')
  assert.equal(c.SalesTermRef.value, '3')
  assert.equal(c.BillAddr.City, 'Laval')
  assert.equal(c.PrimaryEmailAddr.Address, 'compta@x.ca')
})

// ------------------------------------------------------------------
// Jetons et state OAuth
// ------------------------------------------------------------------

test('jetons chiffrés : aller-retour, et rien de lisible en clair', async () => {
  const c = await chiffrer(env, { refresh: 'RT-secret', access: 'AT' })
  assert.ok(!c.includes('RT-secret'))
  assert.deepEqual(await dechiffrer(env, c), { refresh: 'RT-secret', access: 'AT' })
})

test('state OAuth : signé, falsifié refusé', async () => {
  const s = await signer(env, { c: 'abc', n: 'Admin' })
  assert.equal((await verifier(env, s)).c, 'abc')
  const [corps, sig] = s.split('.')
  assert.equal(await verifier(env, `${corps}x.${sig}`), null)
  assert.equal(await verifier(env, 'n.importe'), null)
})

// ------------------------------------------------------------------
// Synchro : lecture du CDC
// ------------------------------------------------------------------

test('CDC : factures liées au devis, supprimées, notes de crédit', () => {
  const changes = lireCdc({
    CDCResponse: [
      {
        QueryResponse: [
          { Invoice: [{ Id: '41', DocNumber: '1041', TxnDate: '2026-10-10', DueDate: '2026-10-10', TotalAmt: 3888.26, Balance: 0, LinkedTxn: [{ TxnId: '12', TxnType: 'Estimate' }] }, { Id: '40', status: 'Deleted' }] },
          { CreditMemo: [{ Id: '5', TotalAmt: 50, Balance: 50 }] },
        ],
      },
    ],
  })
  assert.equal(changes.Invoice.length, 2)
  const f = normaliser('Invoice', changes.Invoice[0])
  assert.deepEqual([f.devis_qbo_id, f.total, f.solde, f.supprimee], ['12', 3888.26, 0, false])
  assert.equal(normaliser('Invoice', changes.Invoice[1]).supprimee, true)
  assert.equal(normaliser('CreditMemo', changes.CreditMemo[0]).solde, 50)
})

// ------------------------------------------------------------------
// Création du devis, réseau simulé (Supabase + QuickBooks)
// ------------------------------------------------------------------

const fetchOriginal = globalThis.fetch
afterEach(() => {
  globalThis.fetch = fetchOriginal
})

async function simuler({ lien = null, devisExistant = null } = {}) {
  const jetons = await chiffrer(env, { access: 'AT', refresh: 'RT', access_expire: Date.now() + 3_600_000 })
  const appels = []
  const rep = (corps, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } })
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    const m = init.method ?? 'GET'
    appels.push({ u, m, corps: init.body })
    if (u.endsWith('/rpc/peut_facturer')) return rep({ ok: true, nom: 'Adjointe' })
    if (u.includes('/rest/v1/reservations?id=eq.')) return rep([{ id: 'r1', numero: '27-G-592', nom: 'École', compagnie_id: 'c1', organisation_id: 'o1', contact_reservation_id: 'k1', contact_facturation_id: null, forfait: 'classe_nature', signe_le: '2026-10-09', date_arrivee: '2027-05-19', date_depart: '2027-05-21' }])
    if (u.includes('/rest/v1/compagnies?')) return rep([{ entreprise_id: 'c1', nom_court: 'GBPA+', annexes: [], qbo: { article: { id: '1', nom: 'Services' }, taxes: { id: '9', nom: 'TPS/TVQ QC' }, terme: { id: '3', nom: 'Sur réception' } } }])
    if (u.includes('/rest/v1/organisations?')) return rep([{ id: 'o1', nom: 'École des Érables', adresse: '1 rue', ville: 'Laval', province: 'QC', code_postal: 'H7A 1A1', telephone: null }])
    if (u.includes('/rest/v1/contacts?')) return rep([{ id: 'k1', nom: 'Sophie', courriel: 'sophie@x.ca', telephone: '450' }])
    if (u.includes('/rest/v1/qbo_clients?') && m === 'GET') return rep(lien ? [lien] : [])
    if (u.includes('/rest/v1/qbo_clients') && m === 'POST') return rep([{}], 201)
    if (u.includes('/rest/v1/qbo_devis?') && m === 'GET') return rep(devisExistant ? [devisExistant] : [])
    if (u.includes('/rest/v1/qbo_devis') && (m === 'POST' || m === 'PATCH')) return rep([{}], m === 'POST' ? 201 : 200)
    if (u.includes('/rest/v1/estimes?')) return rep([{ id: 'e1', version: 1, total: 15553.02, accepte_par: 'Sophie', accepte_le: '2026-10-09T12:00:00Z' }])
    if (u.includes('/rest/v1/lignes?')) return rep([{ code: 'CN-N', description: 'Forfait', note: null, quantite: 48, prix_unitaire: 271.3, montant: 13022.4, auto: true }, { code: 'GRAT', description: 'Gratuité', note: null, quantite: 2, prix_unitaire: 0, montant: 0, auto: true }])
    if (u.includes('/rest/v1/produits?')) return rep([{ code: 'CN-N', qbo_articles: { c1: { id: '7', nom: 'Classe nature' } } }])
    if (u.includes('/rest/v1/documents?')) return rep([])
    if (u.includes('/rest/v1/qbo_connexions?')) return rep(m === 'GET' ? [{ compagnie_id: 'c1', realm_id: '999', environnement: 'sandbox', jetons }] : [])
    if (u.includes('/rest/v1/rpc/qbo_taches')) return rep(null)
    if (u.includes('sandbox-quickbooks.api.intuit.com') && u.includes('/customer') && m === 'POST') return rep({ Customer: { Id: '55', DisplayName: 'École des Érables' } })
    if (u.includes('sandbox-quickbooks.api.intuit.com') && u.includes('/estimate/') && m === 'GET') return rep({ Estimate: { Id: '12', SyncToken: '3' } })
    if (u.includes('sandbox-quickbooks.api.intuit.com') && u.includes('/estimate') && m === 'POST') {
      const e = JSON.parse(init.body)
      const sousTotal = e.Line.reduce((t, l) => t + l.Amount, 0)
      return rep({ Estimate: { Id: '12', DocNumber: e.DocNumber, TxnStatus: 'Accepted', TotalAmt: Math.round(sousTotal * 1.14975 * 100) / 100 } })
    }
    throw new Error(`Appel inattendu : ${m} ${u}`)
  }
  return appels
}

const requete = (chemin, corps) =>
  new Request(`https://app.test/api/qbo/${chemin}`, { method: 'POST', body: JSON.stringify(corps), headers: { Authorization: 'Bearer session' } })

test('devis : client créé, lignes de l’estimé accepté, total contrôlé, relances posées', async () => {
  const appels = await simuler()
  const res = await routeQbo(requete('devis', { reservation: 'r1', client: { creer: true } }), env, 'devis')
  const corps = await res.json()
  assert.equal(res.status, 200, JSON.stringify(corps))
  const creationClient = appels.find((a) => a.u.includes('/customer') && a.m === 'POST')
  assert.equal(JSON.parse(creationClient.corps).SalesTermRef.value, '3')
  const devis = JSON.parse(appels.find((a) => a.u.includes('/estimate') && a.m === 'POST').corps)
  assert.equal(devis.DocNumber, '27-G-592')
  assert.equal(devis.CustomerRef.value, '55')
  assert.equal(devis.GlobalTaxCalculation, 'TaxExcluded')
  assert.equal(devis.Line[0].SalesItemLineDetail.ItemRef.value, '7')
  assert.equal(devis.Line[1].SalesItemLineDetail.ItemRef.value, '1')
  assert.equal(corps.devis.total, 14972.5)
  assert.equal(corps.ecart, -580.52)
  assert.ok(appels.some((a) => a.u.endsWith('/rpc/qbo_taches')))
  assert.ok(appels.every((a) => !a.u.includes('/estimate/12') || a.m !== 'POST'))
})

test('devis existant : mise à jour (SyncToken), pas de nouvelles pièces jointes', async () => {
  const appels = await simuler({ lien: { qbo_id: '55', nom: 'École' }, devisExistant: { qbo_id: '12' } })
  const res = await routeQbo(requete('devis', { reservation: 'r1' }), env, 'devis')
  assert.equal(res.status, 200)
  const maj = JSON.parse(appels.find((a) => a.u.includes('/estimate') && a.m === 'POST').corps)
  assert.deepEqual([maj.Id, maj.SyncToken, maj.sparse], ['12', '3', true])
  assert.ok(!appels.some((a) => a.u.includes('/customer')))
  assert.ok(!appels.some((a) => a.u.includes('/upload')))
})

test('sans session de l’équipe : refusé', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false }), { status: 200 })
  const res = await routeQbo(requete('devis', { reservation: 'r1' }), env, 'devis')
  assert.equal(res.status, 403)
})
