import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  annulation,
  avantTaxesPour,
  avecTaxes,
  bilanFactures,
  clientQbo as payloadClient,
  CODE_MINIMUM,
  echeancier,
  estimeDeReference,
  lignesQbo,
  minimum90,
  seuilsEcheancier,
  tachesFacturation,
} from '../../src/modules/reservations/facturation.ts'
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

test('échéancier convenu (F2) : parts de la réservation, part à 0 = pas d’acompte, seuils gardés avec le devis', () => {
  const base = { forfait: 'classe_nature', total: 1000, signe_le: '2026-10-01', date_arrivee: '2027-05-19', date_depart: '2027-05-21' }
  const e = echeancier({ ...base, acompte1_part: 0.1, acompte2_part: 0.4 })
  assert.deepEqual(e.map((x) => [x.cle, x.libelle, x.montant, x.cumul]), [
    ['acompte1', 'Acompte 1 (10 %)', 100, 0.1],
    ['acompte2', 'Acompte 2 (40 %)', 400, 0.5],
    ['finale', 'Facture finale (solde)', null, 1],
  ])
  const sansAcompte1 = echeancier({ ...base, acompte1_part: 0, acompte2_part: 0.5 })
  assert.deepEqual(sansAcompte1.map((x) => [x.cle, x.libelle]), [['acompte2', 'Acompte (50 %)'], ['finale', 'Facture finale (solde)']])
  const tardive = echeancier({ ...base, signe_le: '2027-05-01', acompte1_part: 0.3333, acompte2_part: 0 })
  assert.equal(tardive[0].libelle, 'Acompte (33,33 %, réservation tardive)')
  assert.deepEqual(seuilsEcheancier(e, base.date_depart), [
    { cle: 'acompte1', cumul: 0.1, apres: null },
    { cle: 'acompte2', cumul: 0.5, apres: null },
    { cle: 'finale', cumul: 1, apres: '2027-05-21' },
  ])
  // Une seule part posée : l'échéancier standard reste (les deux vont ensemble).
  assert.equal(echeancier({ ...base, acompte1_part: 0.1, acompte2_part: null })[0].libelle, 'Acompte 1 (25 %)')
})

test('minimum de 90 % (F10) : sous 90 % des élèves → au moins 90 % du sous-total de la référence', () => {
  const ligne = (quantite, prix, extra = {}) => ({ code: null, description: 'Forfait Classe nature (1:15) | 2 nuits', quantite, montant: quantite * prix, ...extra })
  const ref = [ligne(100, 300), { code: null, description: 'Professeur / accompagnateur supplémentaire', quantite: 2, montant: 200 }]
  // 85 élèves sur 100 : 25 700 $ < 90 % de 30 200 $ = 27 180 $.
  const m = minimum90('classe_nature', ref, [ligne(85, 300), ref[1]])
  assert.equal(m.regle, 'F10')
  assert.equal(m.ajustement, 1480)
  assert.match(m.explication, /85 élèves sur 100/)
  // La ligne d'ajustement déjà là ne compte pas dans le calcul.
  assert.equal(minimum90('classe_nature', ref, [ligne(85, 300), ref[1], { code: CODE_MINIMUM, description: 'x', quantite: 1, montant: 1480 }]).ajustement, 1480)
  // 92 élèves : au-dessus du seuil, rien à ajouter.
  assert.equal(minimum90('classe_nature', ref, [ligne(92, 300), ref[1]]).ajustement, 0)
  // Estimé importé (une ligne globale) : comparaison des sous-totaux.
  assert.equal(minimum90('classe_nature', [{ code: null, description: 'Estimé importé', quantite: 1, montant: 1000 }], [ligne(2, 400)]).ajustement, 100)
})

test('minimum de 90 % (F11) : repas facturés ≥ 90 % des repas de la référence', () => {
  const ref = [{ code: 'AG-VF', description: 'Vieille-France', quantite: 2, montant: 2000 }, { code: 'REPAS', description: 'Repas', quantite: 6, montant: 3000 }]
  const m = minimum90('accueil_groupe', ref, [ref[0], { code: 'REPAS', description: 'Repas', quantite: 6, montant: 2400 }])
  assert.deepEqual([m.regle, m.ajustement], ['F11', 300])
  assert.equal(minimum90('accueil_groupe', [ref[0]], [ref[0]]), null)
})

test('estimé de référence : dernier accepté au plus tard 21 jours avant l’arrivée, sinon le premier', () => {
  const v = (version, statut, accepte_le) => ({ id: `e${version}`, version, statut, accepte_le, envoye_le: null, date_estime: '2026-10-01' })
  const liste = [v(1, 'remplace', '2026-10-05T12:00:00Z'), v(2, 'remplace', '2027-04-20T12:00:00Z'), v(3, 'accepte', '2027-05-18T12:00:00Z'), v(4, 'brouillon', null)]
  assert.equal(estimeDeReference(liste, '2027-05-19').id, 'e2')
  assert.equal(estimeDeReference([v(1, 'accepte', '2027-05-10T12:00:00Z')], '2027-05-19').id, 'e1')
  assert.equal(estimeDeReference([v(1, 'accepte', null)], '2027-05-19').id, 'e1')
  assert.equal(estimeDeReference([v(1, 'envoye', null)], '2027-05-19'), null)
})

test('annulation (F16, F17) : paliers, déjà facturé, sans frais si l’acompte n’a jamais été payé', () => {
  const p = { date_arrivee: '2027-05-19', sous_total: 10000 }
  const acompte = (solde) => ({ qbo_type: 'Invoice', genre: 'progressive', total: 2874.38, solde })
  // 45 jours avant : 60 % de 11 497,50 $ = 6 898,50 $ ; 2 874,38 $ déjà facturé.
  const a = annulation({ ...p, annule_le: '2027-04-04', factures: [acompte(0)] })
  assert.deepEqual([a.jours, a.part, a.retenu_avant_taxes, a.retenu, a.deja, a.ecart], [45, 0.6, 6000, 6898.5, 2874.38, 4024.12])
  assert.equal(annulation({ ...p, annule_le: '2027-03-20', factures: [acompte(0)] }).part, 0.25)
  assert.equal(annulation({ ...p, annule_le: '2027-05-01', factures: [acompte(0)] }).part, 0.8)
  // Acompte facturé, jamais payé : rien de retenu, tout est à créditer.
  const impaye = annulation({ ...p, annule_le: '2027-04-04', factures: [acompte(2874.38)] })
  assert.deepEqual([impaye.acompte_paye, impaye.part, impaye.ecart], [false, 0, -2874.38])
  // Aucune facture d'acompte : on ne sait pas, le palier s'applique.
  const inconnu = annulation({ ...p, annule_le: '2027-04-04', factures: [] })
  assert.deepEqual([inconnu.acompte_paye, inconnu.part, inconnu.ecart], [null, 0.6, 6898.5])
  // 75 % facturés et payés, avis à 45 jours : 15 % à créditer, note de crédit comprise ensuite.
  const trop = annulation({ ...p, annule_le: '2027-04-04', factures: [{ qbo_type: 'Invoice', genre: 'progressive', total: 8623.13, solde: 0 }] })
  assert.equal(trop.ecart, -1724.63)
  const apres = annulation({ ...p, annule_le: '2027-04-04', factures: [{ qbo_type: 'Invoice', genre: 'progressive', total: 8623.13, solde: 0 }, { qbo_type: 'CreditMemo', genre: 'note_credit', total: 1724.63, solde: 0 }] })
  assert.equal(apres.ecart, 0)
})

test('montant avant taxes qui donne un total taxes comprises exact', () => {
  for (const ttc of [1724.63, 57.49, 141.93, 4024.13]) assert.equal(avecTaxes(avantTaxesPour(ttc)), ttc)
  // Pas toujours atteignable au cent (pas de 1,15 ¢ par cent avant taxes) : le plus proche.
  assert.ok(Math.abs(avecTaxes(avantTaxesPour(4024.12)) - 4024.12) <= 0.011)
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

test('bilan des factures : crédit non appliqué retranché, crédit appliqué pas compté comme paiement', () => {
  const facture = (solde) => ({ qbo_type: 'Invoice', total: 141.93, solde })
  const credit = (solde) => ({ qbo_type: 'CreditMemo', total: 57.49, solde })
  assert.deepEqual(bilanFactures([facture(141.93), credit(57.49)]), { facture: 141.93, credits: 57.49, paye: 0, solde: 84.44 })
  assert.deepEqual(bilanFactures([facture(84.44), credit(0)]), { facture: 141.93, credits: 57.49, paye: 0, solde: 84.44 })
  assert.deepEqual(bilanFactures([facture(0), credit(0)]), { facture: 141.93, credits: 57.49, paye: 84.44, solde: 0 })
  assert.equal(bilanFactures([facture(0), { qbo_type: 'CreditMemo', total: 200, solde: '200' }]).solde, -200)
})

// ------------------------------------------------------------------
// Création du devis, réseau simulé (Supabase + QuickBooks)
// ------------------------------------------------------------------

const fetchOriginal = globalThis.fetch
afterEach(() => {
  globalThis.fetch = fetchOriginal
})

async function simuler({ lien = null, devisExistant = null, pieces = false, reservation = {}, factures = [] } = {}) {
  const jetons = await chiffrer(env, { access: 'AT', refresh: 'RT', access_expire: Date.now() + 3_600_000 })
  const appels = []
  const rep = (corps, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } })
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    const m = init.method ?? 'GET'
    appels.push({ u, m, corps: init.body })
    if (u.endsWith('/rpc/peut_facturer')) return rep({ ok: true, nom: 'Adjointe' })
    if (u.includes('/rest/v1/reservations?id=eq.')) return rep([{ id: 'r1', numero: '27-G-592', nom: 'École', compagnie_id: 'c1', organisation_id: 'o1', contact_reservation_id: 'k1', contact_facturation_id: null, forfait: 'classe_nature', signe_le: '2026-10-09', date_arrivee: '2027-05-19', date_depart: '2027-05-21', fermeture: null, annule_le: null, acompte1_part: null, acompte2_part: null, ...reservation }])
    if (u.includes('/rest/v1/factures?')) return rep(factures)
    if (u.includes('/rest/v1/relances?') && m === 'PATCH') return rep(null)
    if (u.includes('/rest/v1/compagnies?')) return rep([{ entreprise_id: 'c1', nom_court: 'GBPA+', annexes: pieces ? [{ titre: 'Spécimen chèque', chemin: 'compagnies/c1/specimen.pdf' }] : [], qbo: { article: { id: '1', nom: 'Services' }, taxes: { id: '9', nom: 'TPS/TVQ QC' }, terme: { id: '3', nom: 'Sur réception' } } }])
    if (u.includes('/rest/v1/organisations?')) return rep([{ id: 'o1', nom: 'École des Érables', adresse: '1 rue', ville: 'Laval', province: 'QC', code_postal: 'H7A 1A1', telephone: null }])
    if (u.includes('/rest/v1/contacts?')) return rep([{ id: 'k1', nom: 'Sophie', courriel: 'sophie@x.ca', telephone: '450' }])
    if (u.includes('/rest/v1/qbo_clients?') && m === 'GET') return rep(lien ? [lien] : [])
    if (u.includes('/rest/v1/qbo_clients') && m === 'POST') return rep([{}], 201)
    if (u.includes('/rest/v1/qbo_devis?') && m === 'GET') return rep(devisExistant ? [devisExistant] : [])
    if (u.includes('/rest/v1/qbo_devis') && (m === 'POST' || m === 'PATCH')) return rep([{}], m === 'POST' ? 201 : 200)
    if (u.includes('/rest/v1/estimes?')) return rep([{ id: 'e1', version: 1, sous_total: 13527, total: 15553.02, accepte_par: 'Sophie', accepte_le: '2026-10-09T12:00:00Z' }])
    if (u.includes('/rest/v1/lignes?')) return rep([{ code: 'CN-N', description: 'Forfait', note: null, quantite: 48, prix_unitaire: 271.3, montant: 13022.4, auto: true }, { code: 'GRAT', description: 'Gratuité', note: null, quantite: 2, prix_unitaire: 0, montant: 0, auto: true }])
    if (u.includes('/rest/v1/produits?')) return rep([{ code: 'CN-N', qbo_articles: { c1: { id: '7', nom: 'Classe nature' } } }])
    if (u.includes('/rest/v1/documents?')) return rep(pieces ? [{ titre: 'Contrat 27-G-592 signé', chemin: 'r1/contrat_signe.pdf' }] : [])
    if (u.includes('/storage/v1/object/reservations-documents/')) return new Response(new TextEncoder().encode('%PDF-essai'), { headers: { 'content-type': 'application/pdf' } })
    if (u.includes('sandbox-quickbooks.api.intuit.com') && u.includes('/upload') && m === 'POST') return rep({ AttachableResponse: [{ Attachable: { Id: '1' } }] })
    if (u.includes('/rest/v1/qbo_connexions?')) return rep(m === 'GET' ? [{ compagnie_id: 'c1', realm_id: '999', environnement: 'sandbox', jetons }] : [])
    if (u.includes('/rest/v1/rpc/qbo_taches') || u.includes('/rest/v1/rpc/qbo_fermer_taches')) return rep(null)
    if (u.includes('/rest/v1/rpc/qbo_recevoir_factures')) return rep(1)
    if (u.includes('sandbox-quickbooks.api.intuit.com') && /\/(invoice|creditmemo)\?/.test(u) && m === 'POST') {
      const x = JSON.parse(init.body)
      const corps = { Id: '77', DocNumber: x.AutoDocNumber ? '1017' : undefined, TxnDate: x.TxnDate, TotalAmt: 141.93, Balance: 141.93 }
      return rep(u.includes('/creditmemo') ? { CreditMemo: corps } : { Invoice: corps })
    }
    if (u.includes('sandbox-quickbooks.api.intuit.com') && u.includes('/customer') && m === 'POST') return rep({ Customer: { Id: '55', DisplayName: 'École des Érables' } })
    if (u.includes('sandbox-quickbooks.api.intuit.com') && u.includes('/estimate/') && m === 'GET') return rep({ Estimate: { Id: '12', SyncToken: '3', TxnStatus: 'Accepted' } })
    if (u.includes('sandbox-quickbooks.api.intuit.com') && u.includes('/estimate') && m === 'POST') {
      const e = JSON.parse(init.body)
      if (!e.Line) return rep({ Estimate: { Id: e.Id, TxnStatus: e.TxnStatus } })
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

test('devis : contrat signé et spécimen joints (fichiers reçus en ArrayBuffer)', async () => {
  const appels = await simuler({ pieces: true })
  const res = await routeQbo(requete('devis', { reservation: 'r1', client: { creer: true } }), env, 'devis')
  const corps = await res.json()
  assert.equal(res.status, 200, JSON.stringify(corps))
  assert.deepEqual(corps.avertissements, [])
  const envois = appels.filter((a) => a.u.includes('/upload'))
  assert.equal(envois.length, 2)
  for (const e of envois) assert.ok(new TextDecoder().decode(e.corps).includes('%PDF-essai'))
  assert.ok(new TextDecoder().decode(envois[0].corps).includes('filename="Contrat 27-G-592 signé.pdf"'))
})

test('devis existant : mise à jour (SyncToken), pas de nouvelles pièces jointes', async () => {
  const appels = await simuler({ lien: { qbo_id: '55', nom: 'École' }, devisExistant: { qbo_id: '12' } })
  const res = await routeQbo(requete('devis', { reservation: 'r1' }), env, 'devis')
  assert.equal(res.status, 200)
  const maj = JSON.parse(appels.find((a) => a.u.includes('/estimate') && a.m === 'POST').corps)
  assert.deepEqual([maj.Id, maj.SyncToken, maj.sparse], ['12', '3', true])
  // Taxes recalculées sur les nouvelles lignes.
  assert.deepEqual(maj.TxnTaxDetail, {})
  assert.ok(!appels.some((a) => a.u.includes('/customer')))
  assert.ok(!appels.some((a) => a.u.includes('/upload')))
})

test('facture séparée : numérotée par QBO, client relié, reçue dans l’app', async () => {
  const appels = await simuler({ lien: { qbo_id: '55', nom: 'École' } })
  const res = await routeQbo(requete('document', { reservation: 'r1', genre: 'separee', lignes: [{ description: 'Bris', quantite: 1, prix_unitaire: 123.45 }, { description: '', quantite: 1, prix_unitaire: 5 }] }), env, 'document')
  const corps = await res.json()
  assert.equal(res.status, 200, JSON.stringify(corps))
  const f = JSON.parse(appels.find((a) => a.u.includes('/invoice?') && a.m === 'POST').corps)
  assert.equal(f.AutoDocNumber, true)
  assert.equal(f.CustomerRef.value, '55')
  assert.equal(f.Line.length, 1)
  assert.equal(f.SalesTermRef.value, '3')
  assert.deepEqual([corps.numero, corps.genre, corps.qbo_type], ['1017', 'separee', 'Invoice'])
  assert.ok(appels.some((a) => a.u.endsWith('/rpc/qbo_recevoir_factures')))
})

test('annulation, frais à facturer : le devis ne porte plus que les frais, relance du solde', async () => {
  const appels = await simuler({
    lien: { qbo_id: '55', nom: 'École' },
    devisExistant: { qbo_id: '12' },
    reservation: { fermeture: 'annulee', annule_le: '2027-04-04' },
    factures: [{ qbo_type: 'Invoice', genre: 'progressive', total: 3888.26, solde: 0 }],
  })
  const res = await routeQbo(requete('devis', { reservation: 'r1' }), env, 'devis')
  const corps = await res.json()
  assert.equal(res.status, 200, JSON.stringify(corps))
  const maj = JSON.parse(appels.find((a) => a.u.includes('/estimate') && a.m === 'POST').corps)
  // 45 jours avant l'arrivée : 60 % de 13 527 $ avant taxes.
  assert.equal(maj.Line.length, 1)
  assert.equal(maj.Line[0].Amount, 8116.2)
  assert.match(maj.Line[0].Description, /Frais d'annulation : 60 % du séjour \(avis du 4 avril 2027, 45 jours avant l'arrivée\)/)
  const ligne = JSON.parse(appels.find((a) => a.u.includes('/qbo_devis?') && a.m === 'PATCH').corps)
  assert.equal(ligne.annulation, true)
  assert.equal(ligne.total_app, 9331.6)
  const taches = JSON.parse(appels.find((a) => a.u.endsWith('/rpc/qbo_taches')).corps)
  assert.equal(taches.p_taches[0].cle, 'annulation')
  assert.match(taches.p_taches[0].titre, /facturer le solde du devis 27-G-592 dans QBO \(frais d'annulation\), 5\u00a0443,34\u00a0\$/)
})

test('annulation, trop facturé : note de crédit de l’excédent, devis fermé, relance de remboursement', async () => {
  const appels = await simuler({
    lien: { qbo_id: '55', nom: 'École' },
    devisExistant: { qbo_id: '12' },
    reservation: { fermeture: 'annulee', annule_le: '2027-04-04' },
    factures: [{ qbo_type: 'Invoice', genre: 'progressive', total: 11664.77, solde: 0 }],
  })
  const res = await routeQbo(requete('devis', { reservation: 'r1' }), env, 'devis')
  const corps = await res.json()
  assert.equal(res.status, 200, JSON.stringify(corps))
  const note = JSON.parse(appels.find((a) => a.u.includes('/creditmemo?') && a.m === 'POST').corps)
  assert.equal(note.AutoDocNumber, true)
  assert.match(note.Line[0].Description, /facturé au-delà des frais retenus \(60 %\)/)
  const fermeture = appels.filter((a) => a.u.includes('/estimate') && a.m === 'POST').map((a) => JSON.parse(a.corps))
  assert.deepEqual(fermeture.map((x) => x.TxnStatus), ['Closed'])
  const taches = JSON.parse(appels.find((a) => a.u.endsWith('/rpc/qbo_taches')).corps)
  assert.match(taches.p_taches[0].titre, /rembourser 2\u00a0333,17\u00a0\$ au client/)
})

test('sans session de l’équipe : refusé', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false }), { status: 200 })
  const res = await routeQbo(requete('devis', { reservation: 'r1' }), env, 'devis')
  assert.equal(res.status, 403)
})
