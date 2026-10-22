import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  aPreparer,
  champsCourriel,
  destinataires,
  echeanceFacture,
  encoreUtile,
  enTetesFil,
  joursRappelsPaiement,
  remplirCourriel,
  rendreCourriel,
  versHtml,
} from '../../src/modules/reservations/courriels.ts'
import { chiffrer } from '../qbo/chiffre.js'
import { envoyerGmailFil } from '../commun/courriel.js'
import { brouillonCourriel, envoyerCourriel, expedierFenetre, messageMime, modeEnvoi, preparerCourriels } from './courriels.js'

const DEPUIS = '2026-10-10'

/** Réservation de Classe nature signée, 25 / 50 / 25, arrivée le 19 mai 2027. */
function etat(modif = {}) {
  return {
    r: {
      id: 'r1',
      numero: '27-G-592',
      nom: 'École des Érables',
      forfait: 'classe_nature',
      langue: 'Français',
      date_arrivee: '2027-05-19',
      date_depart: '2027-05-21',
      signe_le: '2026-10-12',
      fermeture: null,
      nb_participants: 48,
      nb_accompagnateurs: 4,
      acompte1_part: null,
      acompte2_part: null,
      compagnie_id: 'c1',
      organisation_id: 'o1',
      jeton_client: 'jc',
      jeton_fiches: 'jf',
      courriel_direction: 'direction@ecole.ca',
      ...modif.r,
    },
    contact_reservation: { id: 'k1', nom: 'Sophie Tremblay', courriel: 'sophie@ecole.ca' },
    contact_facturation: { id: 'k2', nom: 'Secrétariat', courriel: 'compta@ecole.ca' },
    demande: null,
    estimes: [],
    signatures: [],
    factures: [],
    devis_total: 15553.02,
    fiches_recues: 0,
    courriels: [],
    ...modif,
    ...(modif.r ? { r: { ...etat().r, ...modif.r } } : {}),
  }
}
const cles = (l) => l.map((x) => x.cle)

test('accusé : un par événement ; estimé et contrat jamais dans la file (fenêtre) ; rappel de signature 5 jours après l’envoi réel du contrat', () => {
  const e = etat({
    demande: { id: 'd1', recue_le: '2026-10-11T14:00:00Z', langue: 'fr', courriel: 'prof@ecole.ca', nom: 'Prof' },
    estimes: [
      { id: 'e0', version: 1, statut: 'envoye', envoye_le: '2026-10-01T12:00:00Z', total: 100 },
      { id: 'e1', version: 2, statut: 'envoye', envoye_le: '2026-10-11T12:00:00Z', total: 15553.02 },
    ],
    signatures: [{ id: 's1', statut: 'en_attente', envoye_le: '2026-10-12T15:00:00Z', echeance: '2026-10-19', jeton: 'js' }],
  })
  assert.deepEqual(cles(aPreparer(e, '2026-10-12', DEPUIS)), ['accuse:d1'])
  // Contrat préparé mais pas encore envoyé : pas de rappel.
  assert.ok(!cles(aPreparer(e, '2026-10-17', DEPUIS)).includes('rappel_signature:s1'))
  // Envoyé par la fenêtre : rappel au 5e jour, pas avant.
  const parti = { ...e, courriels: [{ id: 'k', cle: 'contrat:s1', genre: 'contrat', statut: 'envoye', ref: 's1' }] }
  assert.ok(!cles(aPreparer(parti, '2026-10-16', DEPUIS)).includes('rappel_signature:s1'))
  assert.ok(cles(aPreparer(parti, '2026-10-17', DEPUIS)).includes('rappel_signature:s1'))
  // Déjà préparés (même annulés) : jamais deux fois.
  const deja = { ...e, courriels: [{ id: 'x', cle: 'accuse:d1', genre: 'accuse', statut: 'annule', ref: null }] }
  assert.ok(!cles(aPreparer(deja, '2026-10-12', DEPUIS)).includes('accuse:d1'))
  // Courriel de la fenêtre en cours d'envoi (estimé encore brouillon) : pas annulé par la file.
  const brouillon = etat({ estimes: [{ id: 'e2', version: 3, statut: 'brouillon', envoye_le: null, total: 10 }] })
  assert.equal(encoreUtile({ genre: 'estime', ref: 'e2' }, brouillon), true)
})

test('factures : acompte, facture finale, rappels de paiement (sur réception : 7 jours ; acompte 2 : 21 jours avant l’arrivée)', () => {
  const f1 = { id: 'f1', qbo_type: 'Invoice', qbo_id: '41', genre: 'progressive', numero: '1041', date_facture: '2026-10-12', echeance: '2026-10-12', total: 3888.26, solde: 3888.26 }
  const f2 = { id: 'f2', qbo_type: 'Invoice', qbo_id: '42', genre: 'progressive', numero: '1042', date_facture: '2027-04-14', echeance: '2027-04-14', total: 7776.51, solde: 7776.51 }
  const f3 = { id: 'f3', qbo_type: 'Invoice', qbo_id: '43', genre: 'progressive', numero: '1043', date_facture: '2027-05-22', echeance: '2027-05-22', total: 3888.25, solde: 0 }
  const e = etat({ factures: [f1, f2, f3] })
  assert.deepEqual(
    aPreparer(e, '2026-10-12', DEPUIS).map((x) => [x.genre, x.cle]),
    [
      ['facture', 'facture:f1'],
      ['facture', 'facture:f2'],
      ['facture_finale', 'facture:f3'],
    ],
  )
  assert.equal(echeanceFacture(e, f1), null)
  assert.equal(echeanceFacture(e, f2), '2027-04-28')
  assert.deepEqual(joursRappelsPaiement(e, f1), ['2026-10-19'])
  assert.deepEqual(joursRappelsPaiement(e, f2), ['2027-04-25', '2027-04-28'])
  assert.ok(cles(aPreparer(e, '2026-10-19', DEPUIS)).includes('rappel_paiement:f1:1'))
  assert.ok(cles(aPreparer(e, '2027-04-28', DEPUIS)).includes('rappel_paiement:f2:2'))
  // Payée : plus de rappel ; un rappel préparé n'est plus utile.
  const payee = etat({ factures: [{ ...f1, solde: 0 }] })
  assert.ok(!cles(aPreparer(payee, '2026-10-19', DEPUIS)).some((c) => c.startsWith('rappel_paiement')))
  assert.equal(encoreUtile({ genre: 'rappel_paiement', ref: 'f1' }, payee), false)
  // Réservation annulée : les factures (frais d'annulation) suivent quand même.
  const annulee = etat({ r: { fermeture: 'annulee' }, factures: [f1] })
  assert.deepEqual(cles(aPreparer(annulee, '2026-10-12', DEPUIS)), ['facture:f1'])
})

test('pré-arrivée à 30 jours, rappel des fiches à 25 jours (après la pré-arrivée, s’il en manque), suivi à 2 jours du départ', () => {
  const e = etat()
  assert.ok(!cles(aPreparer(e, '2027-04-18', DEPUIS)).includes('pre_arrivee:r1'))
  assert.ok(cles(aPreparer(e, '2027-04-19', DEPUIS)).includes('pre_arrivee:r1'))
  assert.ok(!cles(aPreparer(e, '2027-04-24', DEPUIS)).includes('rappel_fiches:r1'))
  const pre = etat({ courriels: [{ id: 'p', cle: 'pre_arrivee:r1', genre: 'pre_arrivee', statut: 'envoye', ref: null }], fiches_recues: 30 })
  assert.ok(cles(aPreparer(pre, '2027-04-24', DEPUIS)).includes('rappel_fiches:r1'))
  assert.ok(!cles(aPreparer({ ...pre, fiches_recues: 52 }, '2027-04-24', DEPUIS)).includes('rappel_fiches:r1'))
  assert.ok(cles(aPreparer(e, '2027-05-23', DEPUIS)).includes('suivi:r1'))
  // Accueil de groupe : pas de pré-arrivée ni de fiches.
  const ag = etat({ r: { forfait: 'accueil_groupe' } })
  assert.ok(!cles(aPreparer(ag, '2027-04-19', DEPUIS)).includes('pre_arrivee:r1'))
  // Réservation tardive signée après J−30 : la pré-arrivée part à la signature.
  const tardive = etat({ r: { signe_le: '2027-05-01' } })
  assert.ok(!cles(aPreparer(tardive, '2027-04-30', DEPUIS)).includes('pre_arrivee:r1'))
  assert.ok(cles(aPreparer(tardive, '2027-05-01', DEPUIS)).includes('pre_arrivee:r1'))
})

test('destinataires : facture au responsable de la facturation (copie au responsable), contrat avec la direction en copie, accusé à qui a rempli la demande', () => {
  const e = etat({ demande: { id: 'd1', recue_le: '2026-10-11T14:00:00Z', langue: 'en', courriel: 'prof@ecole.ca', nom: 'Prof Ross' } })
  assert.deepEqual(destinataires(e, 'facture'), { a: ['compta@ecole.ca'], cc: ['sophie@ecole.ca'], nom: 'Secrétariat' })
  assert.deepEqual(destinataires(e, 'contrat'), { a: ['sophie@ecole.ca'], cc: ['direction@ecole.ca'], nom: 'Sophie Tremblay' })
  assert.deepEqual(destinataires(e, 'accuse'), { a: ['prof@ecole.ca'], cc: [], nom: 'Prof Ross' })
  assert.deepEqual(destinataires({ ...e, contact_reservation: { nom: 'X', courriel: 'pas un courriel' }, contact_facturation: null }, 'estime').a, [])
})

test('rendu : champs dans la langue du courriel, {{#si}}, HTML échappé et liens cliquables', () => {
  assert.equal(remplirCourriel('A{{#si x}} [{{x}}]{{/si}}{{#si y}} non{{/si}} {{z}}', { x: '1', y: '', z: 'fin' }), 'A [1] fin')
  const e = etat({ factures: [{ id: 'f1', qbo_type: 'Invoice', qbo_id: '41', genre: 'separee', numero: '1041', date_facture: '2026-10-12', echeance: '2026-10-12', total: 141.93, solde: 141.93 }] })
  const compagnie = { raison_sociale: 'GBPA+ inc.', nom_court: 'GBPA+', courriel: 'inscriptions@camptremblant.com', telephone: '819', reponse_interac: 'BPAMT' }
  const fr = champsCourriel(e, { genre: 'facture', ref: 'f1', langue: 'fr', compagnie, racine: 'https://groupes.test' })
  assert.deepEqual([fr.dates, fr.facture_montant, fr.facture_sur_reception, fr.lien_client], ['du 19 au 21 mai 2027', '141,93\u00a0$', 'oui', 'https://groupes.test/client/jc'])
  const en = champsCourriel(e, { genre: 'facture', ref: 'f1', langue: 'en', compagnie, racine: 'https://groupes.test/' })
  assert.deepEqual([en.dates, en.facture_montant, en.lien_client, en.forfait], ['from May 19 to 21, 2027', '$141.93', 'https://groupes.test/client/jc?lang=en', 'Nature class'])
  const m = { genre: 'facture', mode: 'approuver', sujet_fr: 'Facture {{facture_numero}}', corps_fr: 'Payable {{#si facture_sur_reception}}sur réception{{/si}}.\n\n\n\nLien : {{lien_client}}', sujet_en: 'x', corps_en: 'y' }
  assert.deepEqual(rendreCourriel(m, 'fr', fr), { sujet: 'Facture 1041', corps: 'Payable sur réception.\n\nLien : https://groupes.test/client/jc' })
  const html = versHtml('Bonjour <b>toi</b> & **vous**\nligne 2\n\nVoir https://groupes.test/client/jc.')
  assert.match(html, /Bonjour &lt;b&gt;toi&lt;\/b&gt; &amp; <strong>vous<\/strong><br>ligne 2/)
  assert.match(html, /<a href="https:\/\/groupes.test\/client\/jc">https:\/\/groupes.test\/client\/jc<\/a>\./)
})

// ------------------------------------------------------------------
// Worker, réseau simulé
// ------------------------------------------------------------------

const ENV = {
  SUPABASE_URL: 'https://base.test',
  SUPABASE_SECRET_KEY: 'sb_secret_x',
  APP_URL: 'https://app.test',
  COURRIELS_MAILPIT: 'http://mailpit.test',
  QBO_CLE: Buffer.alloc(32, 7).toString('base64'),
  QBO_CLIENT_ID: 'id',
  QBO_CLIENT_SECRET: 'secret',
}
const fetchOriginal = globalThis.fetch
afterEach(() => {
  globalThis.fetch = fetchOriginal
})

const MODELE = { genre: 'facture', mode: 'approuver', sujet_fr: 'Facture {{facture_numero}} — {{groupe}}', corps_fr: 'Bonjour {{responsable}},\n\n{{facture_montant}} : {{lien_client}}', sujet_en: 'Invoice', corps_en: 'Hello' }

async function simuler({ e = etat(), courriel = null, fil = null } = {}) {
  const jetons = await chiffrer(ENV, { access: 'AT', refresh: 'RT', access_expire: Date.now() + 3_600_000 })
  const appels = []
  const rep = (corps, status = 200) => (corps === null ? new Response(null, { status }) : new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } }))
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    const m = init.method ?? 'GET'
    appels.push({ u, m, corps: init.body ? JSON.parse(init.body) : null })
    if (u.endsWith('/rpc/courriels_etat')) return rep([e])
    if (u.endsWith('/rpc/courriels_ajouter')) return rep(JSON.parse(init.body).p_courriels.map((c, i) => ({ id: `n${i}`, genre: c.genre })))
    if (u.includes('/modeles_courriels?')) return rep([MODELE])
    if (u.includes('/compagnies?')) return rep([{ entreprise_id: 'c1', raison_sociale: 'GBPA+ inc.', nom_court: 'GBPA+', courriel: 'inscriptions@camptremblant.com', telephone: '819', reponse_interac: 'BPAMT' }])
    if (u.includes('/reglages?')) return rep([{ valeur: DEPUIS }])
    if (u.includes('/fils_courriel?')) return rep(fil ? [fil] : [])
    if (u.endsWith('/rpc/courriel_parti')) return rep(null, 204)
    if (u.includes('/courriels?id=eq.') && m === 'GET') return rep(courriel ? [courriel] : [])
    if (u.includes('/courriels?') && m === 'PATCH') return rep(null, 204)
    if (u.includes('/qbo_connexions?')) return rep([{ compagnie_id: 'c1', realm_id: '9', environnement: 'sandbox', jetons }])
    if (u.includes('sandbox-quickbooks.api.intuit.com') && u.includes('/invoice/41/pdf')) return new Response(new TextEncoder().encode('%PDF-facture'), { headers: { 'content-type': 'application/pdf' } })
    if (u === 'http://mailpit.test/api/v1/send') return rep({ ID: 'mp1' })
    if (u === 'http://mailpit.test/api/v1/message/mp1/headers') return rep({ 'Message-Id': ['<mp1@mailpit>'], Subject: ['x'] })
    if (u.endsWith('/rest/v1/journal') || u.endsWith('/rest/v1/echanges')) return rep([{}], 201)
    throw new Error(`Appel inattendu : ${m} ${u}`)
  }
  return appels
}

const facture = { id: 'f1', qbo_type: 'Invoice', qbo_id: '41', genre: 'separee', numero: '1041', date_facture: '2026-10-12', echeance: '2026-10-12', total: 141.93, solde: 141.93 }

test('préparer : courriel rendu avec son modèle, destinataires, clé', async () => {
  const appels = await simuler({ e: etat({ factures: [facture] }) })
  const res = await preparerCourriels(ENV, 'r1')
  assert.equal(res.prepares, 1)
  const ajout = appels.find((a) => a.u.endsWith('/rpc/courriels_ajouter')).corps.p_courriels[0]
  assert.deepEqual([ajout.genre, ajout.cle, ajout.a, ajout.cc, ajout.sujet], ['facture', 'facture:f1', ['compta@ecole.ca'], ['sophie@ecole.ca'], 'Facture 1041 — École des Érables'])
  assert.equal(ajout.corps, 'Bonjour Secrétariat,\n\n141,93\u00a0$ : https://app.test/client/jc')
})

test('envoyer (DEV) : Mailpit, PDF de QBO joint ; premier courriel = début du fil, noté d’un coup (courriel_parti)', async () => {
  const c = { id: 'c9', reservation_id: 'r1', genre: 'facture', cle: 'facture:f1', ref: 'f1', statut: 'prepare', a: ['compta@ecole.ca'], cc: ['sophie@ecole.ca'], sujet: 'Facture 1041', corps: 'Bonjour https://app.test/x' }
  const appels = await simuler({ e: etat({ factures: [facture] }), courriel: c })
  assert.deepEqual(await envoyerCourriel(ENV, 'c9', 'Adjointe'), { ok: true, mode: 'mailpit', fil: false })
  const envoi = appels.find((a) => a.u === 'http://mailpit.test/api/v1/send').corps
  assert.deepEqual([envoi.From.Email, envoi.To[0].Email, envoi.Cc[0].Email, envoi.Subject], ['inscriptions@camptremblant.com', 'compta@ecole.ca', 'sophie@ecole.ca', 'Facture 1041'])
  assert.equal(envoi.Headers, undefined)
  assert.equal(Buffer.from(envoi.Attachments[0].Content, 'base64').toString(), '%PDF-facture')
  assert.equal(envoi.Attachments[0].Filename, 'Facture 1041.pdf')
  const p = appels.find((a) => a.u.endsWith('/rpc/courriel_parti')).corps.p
  assert.deepEqual(
    [p.courriel_id, p.sujet, p.auteur, p.transport, p.message_id, p.thread_id, p.message_rfc, p.nom_genre, p.document],
    ['c9', 'Facture 1041', 'Adjointe', 'mailpit', 'mp1', null, '<mp1@mailpit>', 'Facture (acompte, facture séparée)', null],
  )
  assert.ok(!appels.some((a) => a.m === 'PATCH' && a.u.includes('/courriels?')))
})

test('fil (DEV) : les suivants gardent le sujet du fil, In-Reply-To et References', async () => {
  const c = { id: 'c9', reservation_id: 'r1', genre: 'facture', cle: 'facture:f1', ref: 'f1', statut: 'prepare', a: ['compta@ecole.ca'], cc: [], sujet: 'Facture 1041', corps: 'Bonjour' }
  const fil = { reservation_id: 'r1', transport: 'mailpit', thread_id: null, sujet: 'Réservation 27-G-592 · École des Érables', premier_message_id: '<a@mailpit>', dernier_message_id: '<b@mailpit>', courriels: 2 }
  const appels = await simuler({ e: etat({ factures: [facture] }), courriel: c, fil })
  assert.equal((await envoyerCourriel(ENV, 'c9', 'Adjointe')).fil, true)
  const envoi = appels.find((a) => a.u === 'http://mailpit.test/api/v1/send').corps
  assert.equal(envoi.Subject, 'Réservation 27-G-592 · École des Érables')
  assert.deepEqual(envoi.Headers, { 'In-Reply-To': '<b@mailpit>', References: '<a@mailpit> <b@mailpit>' })
  assert.equal(appels.find((a) => a.u.endsWith('/rpc/courriel_parti')).corps.p.sujet, 'Réservation 27-G-592 · École des Érables')
  // Un fil Mailpit n'est jamais repris par Gmail (et l'inverse).
  assert.deepEqual(enTetesFil(null), null)
  assert.deepEqual(enTetesFil({ premier_message_id: '<a@x>', dernier_message_id: '<a@x>' }), { 'In-Reply-To': '<a@x>', References: '<a@x>' })
})

test('envoyer : refusé sur une base locale sans Mailpit ; rappel d’une facture payée annulé', async () => {
  assert.equal(modeEnvoi({ SUPABASE_URL: 'http://127.0.0.1:54321' }), 'bloque')
  assert.equal(modeEnvoi({ SUPABASE_URL: 'https://x.supabase.co' }), 'non_configure')
  const c = { id: 'c9', reservation_id: 'r1', genre: 'facture', cle: 'facture:f1', ref: 'f1', statut: 'prepare', a: ['compta@ecole.ca'], cc: [], sujet: 'S', corps: 'C' }
  await simuler({ courriel: c })
  await assert.rejects(envoyerCourriel({ ...ENV, COURRIELS_MAILPIT: '', SUPABASE_URL: 'http://127.0.0.1:54321' }, 'c9', 'A'), /Mailpit/)
  const rappel = { ...c, genre: 'rappel_paiement', cle: 'rappel_paiement:f1:1' }
  const appels = await simuler({ e: etat({ factures: [{ ...facture, solde: 0 }] }), courriel: rappel })
  await assert.rejects(envoyerCourriel(ENV, 'c9', 'A'), /plus nécessaire/)
  assert.ok(!appels.some((a) => a.u.includes('mailpit')))
  assert.equal(appels.find((a) => a.m === 'PATCH').corps.statut, 'annule')
})

test('MIME de Gmail : texte, HTML et pièce jointe, en-têtes encodés', () => {
  const raw = messageMime({
    de: 'inscriptions@camptremblant.com',
    nomDe: 'Base de plein air',
    a: ['a@x.ca'],
    cc: ['b@x.ca'],
    sujet: 'Facture — été',
    texte: 'Bonjour',
    html: '<p>Bonjour</p>',
    pieces: [{ nom: 'Facture 1.pdf', type: 'application/pdf', octets: new TextEncoder().encode('%PDF') }],
  })
  const mime = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
  assert.match(mime, /^From: =\?UTF-8\?B\?.+\?= <inscriptions@camptremblant.com>\r\nTo: a@x.ca\r\nCc: b@x.ca\r\nSubject: =\?UTF-8\?B\?/)
  assert.match(mime, /multipart\/mixed/)
  assert.match(mime, /Content-Disposition: attachment/)
  assert.ok(mime.includes(Buffer.from('%PDF').toString('base64')))
})

test('MIME : en-têtes du fil (In-Reply-To, References), sans saut de ligne injecté', () => {
  const raw = messageMime({
    de: 'inscriptions@camptremblant.com',
    a: ['a@x.ca'],
    sujet: 'Réservation 27-G-083 · École',
    texte: 'x',
    html: '<p>x</p>',
    enTetes: { 'In-Reply-To': '<b@mail.gmail.com>', References: '<a@mail.gmail.com> <b@mail.gmail.com>\r\nBcc: pirate@x.ca' },
  })
  const mime = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
  assert.match(mime, /\r\nIn-Reply-To: <b@mail\.gmail\.com>\r\n/)
  assert.match(mime, /\r\nReferences: <a@mail\.gmail\.com> <b@mail\.gmail\.com> Bcc: pirate@x\.ca\r\n/)
  assert.ok(!/\r\nBcc:/.test(mime))
})

test('Gmail : threadId dans l’envoi, Message-ID relu par messages.get (metadata) ; fil retiré de la boîte = nouveau fil', async () => {
  const appels = []
  let fois = 0
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    appels.push({ u, m: init.method ?? 'GET', corps: init.body && typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : null })
    if (u === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'AT' }))
    if (u.endsWith('/messages/send')) {
      fois++
      if (JSON.parse(init.body).threadId === 'mort') return new Response('{"error":{"code":404,"message":"Requested entity was not found."}}', { status: 404 })
      return new Response(JSON.stringify({ id: `m${fois}`, threadId: JSON.parse(init.body).threadId ?? 't-nouveau', labelIds: ['SENT'] }))
    }
    if (u.includes('/messages/m') && u.includes('format=metadata')) {
      assert.match(u, /metadataHeaders=Message-ID/)
      return new Response(JSON.stringify({ id: 'm', payload: { headers: [{ name: 'Message-Id', value: '<CAxyz@mail.gmail.com>' }] } }))
    }
    throw new Error(`Appel inattendu : ${u}`)
  }
  const env = { GMAIL_CLIENT_ID: 'i', GMAIL_CLIENT_SECRET: 's' }
  const m = { de: 'inscriptions@camptremblant.com', a: ['a@x.ca'], sujet: 'S', texte: 't', html: '<p>t</p>', threadId: 't1', enTetes: { 'In-Reply-To': '<a@x>', References: '<a@x>' } }
  assert.deepEqual(await envoyerGmailFil(env, m, 'RT'), { id: 'm1', threadId: 't1', messageId: '<CAxyz@mail.gmail.com>' })
  assert.equal(appels.find((a) => a.u.endsWith('/messages/send')).corps.threadId, 't1')
  // Fil introuvable : un seul nouvel envoi, sans threadId.
  const r = await envoyerGmailFil(env, { ...m, threadId: 'mort' }, 'RT')
  assert.deepEqual([r.threadId, r.messageId], ['t-nouveau', '<CAxyz@mail.gmail.com>'])
  assert.equal(appels.filter((a) => a.u.endsWith('/messages/send')).length, 3)
})

// ------------------------------------------------------------------
// Fenêtre d'envoi (estimé, contrat)
// ------------------------------------------------------------------

const MODELE_ESTIME = { genre: 'estime', mode: 'approuver', sujet_fr: 'Réservation {{numero}} · {{groupe}}', corps_fr: 'Bonjour {{responsable}},\n\nTotal : {{total}}\n{{lien_client}}', sujet_en: 'Reservation {{numero}} · {{groupe}}', corps_en: 'Hello {{responsable}}' }
const MODELE_CONTRAT = { genre: 'contrat', mode: 'approuver', sujet_fr: 'Réservation {{numero}} · {{groupe}}', corps_fr: 'Signez d’ici le {{echeance_signature}} : {{lien_signature}}', sujet_en: 'x', corps_en: 'y' }
const PDF = Buffer.from('%PDF-1.7 estimé').toString('base64')

function simulerFenetre({ e, fil = null, mailpitRefuse = false, courriels = [] }) {
  const appels = []
  const rep = (corps, status = 200) => (corps === null ? new Response(null, { status }) : new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } }))
  const lignes = new Map(courriels.map((c) => [c.id, c]))
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    const m = init.method ?? 'GET'
    appels.push({ u, m, corps: typeof init.body === 'string' ? JSON.parse(init.body) : init.body ?? null })
    if (u.endsWith('/rpc/courriels_etat')) return rep([e])
    if (u.includes('/modeles_courriels?genre=eq.estime')) return rep([MODELE_ESTIME])
    if (u.includes('/modeles_courriels?genre=eq.contrat')) return rep([MODELE_CONTRAT])
    if (u.includes('/compagnies?')) return rep([{ entreprise_id: 'c1', raison_sociale: 'GBPA+ inc.', nom_court: 'GBPA+', courriel: 'inscriptions@camptremblant.com', telephone: '819', reponse_interac: 'BPAMT' }])
    if (u.includes('/fils_courriel?')) return rep(fil ? [fil] : [])
    if (u.endsWith('/rpc/courriel_fenetre')) {
      const p = JSON.parse(init.body).p
      lignes.set('cf', { id: 'cf', reservation_id: p.reservation_id, genre: p.genre, cle: p.cle, ref: p.ref, statut: 'prepare', a: p.a, cc: p.cc, sujet: p.sujet, corps: p.corps })
      return rep({ id: 'cf', nouveau: true })
    }
    if (u.includes('/courriels?id=eq.') && m === 'GET') return rep([lignes.get(u.match(/id=eq\.([^&]+)/)[1])].filter(Boolean))
    if (u.includes('/courriels?') && (m === 'PATCH' || m === 'DELETE')) return rep(null, 204)
    if (u.includes('/storage/v1/object/reservations-documents/r1/estime-') && m === 'POST') return rep({ Key: 'x' })
    if (u.endsWith('/storage/v1/object/reservations-documents') && m === 'DELETE') return rep([])
    if (u === 'http://mailpit.test/api/v1/send') return mailpitRefuse ? new Response('panne', { status: 500 }) : rep({ ID: 'mp7' })
    if (u === 'http://mailpit.test/api/v1/message/mp7/headers') return rep({ 'Message-Id': ['<mp7@mailpit>'] })
    if (u.endsWith('/rpc/courriel_parti')) return rep(null, 204)
    throw new Error(`Appel inattendu : ${m} ${u}`)
  }
  return appels
}

const etatFenetre = (modif = {}) =>
  etat({
    r: { signe_le: null },
    estimes: [{ id: '11111111-1111-4111-8111-111111111111', version: 2, statut: 'brouillon', envoye_le: null, total: 15553.02 }],
    signatures: [{ id: '22222222-2222-4222-8222-222222222222', statut: 'en_attente', envoye_le: '2026-10-01T12:00:00Z', echeance: '2026-10-08', jeton: 'js' }],
    ...modif,
  })
const E2 = '11111111-1111-4111-8111-111111111111'
const S1 = '22222222-2222-4222-8222-222222222222'

test('fenêtre : brouillon du modèle (langue, destinataires), contrat à signer d’ici l’envoi + 7 jours, sujet du fil', async () => {
  simulerFenetre({ e: etatFenetre() })
  const b = await brouillonCourriel(ENV, { reservation: 'r1', genre: 'estime', ref: E2 })
  assert.deepEqual([b.a, b.cc, b.sujet, b.fil, b.envoi, b.refus], [['sophie@ecole.ca'], [], 'Réservation 27-G-592 · École des Érables', null, 'mailpit', null])
  assert.match(b.corps, /^Bonjour Sophie Tremblay,\n\nTotal : 15 553,02 \$/)
  const fil = { reservation_id: 'r1', transport: 'mailpit', thread_id: null, sujet: 'Sujet du fil', premier_message_id: '<a@m>', dernier_message_id: '<a@m>', courriels: 1 }
  simulerFenetre({ e: etatFenetre(), fil })
  const c = await brouillonCourriel(ENV, { reservation: 'r1', genre: 'contrat', ref: S1 })
  assert.deepEqual([c.a, c.cc, c.sujet, c.fil], [['sophie@ecole.ca'], ['direction@ecole.ca'], 'Sujet du fil', { sujet: 'Sujet du fil', courriels: 1 }])
  const dans7 = new Date(Date.now() + 7 * 86_400_000)
  assert.ok(c.corps.includes(String(new Intl.DateTimeFormat('fr-CA', { day: 'numeric', timeZone: 'America/Toronto' }).format(dans7))))
  // Refus : estimé déjà envoyé, contrat déjà parti.
  simulerFenetre({ e: etatFenetre({ estimes: [{ id: E2, version: 2, statut: 'envoye', envoye_le: '2026-10-12T00:00:00Z', total: 1 }] }) })
  await assert.rejects(brouillonCourriel(ENV, { reservation: 'r1', genre: 'estime', ref: E2 }), /Seul un brouillon/)
  simulerFenetre({ e: etatFenetre({ courriels: [{ id: 'k', cle: `contrat:${S1}`, genre: 'contrat', statut: 'envoye', ref: S1 }] }) })
  await assert.rejects(brouillonCourriel(ENV, { reservation: 'r1', genre: 'contrat', ref: S1 }), /déjà envoyé/)
})

test('fenêtre : l’estimé part avec son PDF ; gardé et « envoyé » seulement une fois le courriel parti', async () => {
  const appels = simulerFenetre({ e: etatFenetre() })
  const res = await expedierFenetre(
    ENV,
    { reservation: 'r1', genre: 'estime', ref: E2, a: 'sophie@ecole.ca, Sophie@ecole.ca', cc: ['prof@ecole.ca'], sujet: ' Réservation  27-G-592 ', corps: 'Allô Sophie, contente de savoir que vous revenez !', piece: { nom: 'Estimé 27-G-592 v2.pdf', contenu: PDF } },
    'Coordo',
  )
  assert.deepEqual(res, { ok: true, mode: 'mailpit', fil: false })
  const fen = appels.find((a) => a.u.endsWith('/rpc/courriel_fenetre')).corps.p
  assert.deepEqual([fen.cle, fen.a, fen.cc, fen.sujet, fen.langue], [`estime:${E2}`, ['sophie@ecole.ca'], ['prof@ecole.ca'], 'Réservation 27-G-592', 'fr'])
  const ordre = appels.map((a) => (a.u.includes('/storage/') ? 'pdf' : a.u.includes('/api/v1/send') ? 'envoi' : a.u.endsWith('/rpc/courriel_parti') ? 'note' : null)).filter(Boolean)
  assert.deepEqual(ordre, ['pdf', 'envoi', 'note'])
  const envoi = appels.find((a) => a.u.endsWith('/api/v1/send')).corps
  assert.equal(envoi.Text, 'Allô Sophie, contente de savoir que vous revenez !')
  assert.deepEqual([envoi.Attachments[0].Filename, Buffer.from(envoi.Attachments[0].Content, 'base64').toString()], ['Estimé 27-G-592 v2.pdf', '%PDF-1.7 estimé'])
  const p = appels.find((a) => a.u.endsWith('/rpc/courriel_parti')).corps.p
  assert.deepEqual([p.courriel_id, p.auteur, p.nom_genre, p.message_rfc, p.document.titre, p.document.estime_id], ['cf', 'Coordo', 'Estimé', '<mp7@mailpit>', 'Estimé 27-G-592 v2', E2])
  assert.match(p.document.chemin, /^r1\/estime-.*\.pdf$/)
  assert.match(p.document.empreinte, /^[0-9a-f]{64}$/)
})

test('fenêtre : envoi raté = rien ne change (PDF retiré, courriel de la fenêtre retiré, rien de noté) ; refus avant tout envoi', async () => {
  const appels = simulerFenetre({ e: etatFenetre(), mailpitRefuse: true })
  const corps = { reservation: 'r1', genre: 'estime', ref: E2, a: 'sophie@ecole.ca', cc: '', sujet: 'S', corps: 'Texte', piece: { nom: 'E.pdf', contenu: PDF } }
  await assert.rejects(expedierFenetre(ENV, corps, 'Coordo'), /Mailpit a refusé/)
  assert.ok(appels.some((a) => a.m === 'DELETE' && a.u.endsWith('/storage/v1/object/reservations-documents')))
  assert.ok(appels.some((a) => a.m === 'DELETE' && a.u.includes('/courriels?id=eq.cf')))
  assert.ok(!appels.some((a) => a.u.endsWith('/rpc/courriel_parti')))
  // Adresse invalide, sans PDF, Gmail pas configuré : refusés avant d'écrire quoi que ce soit.
  for (const [modif, env, motif] of [
    [{ a: 'pas-un-courriel' }, ENV, /Adresse invalide/],
    [{ piece: { nom: 'E.pdf', contenu: Buffer.from('pas un pdf').toString('base64') } }, ENV, /PDF de l'estimé manque/],
    [{}, { ...ENV, COURRIELS_MAILPIT: '', SUPABASE_URL: 'https://x.supabase.co' }, /Gmail n’est pas configuré/],
  ]) {
    const a2 = simulerFenetre({ e: etatFenetre() })
    await assert.rejects(expedierFenetre(env, { ...corps, ...modif }, 'Coordo'), motif)
    assert.ok(!a2.some((a) => a.u.endsWith('/rpc/courriel_fenetre') || a.u.includes('/storage/')))
  }
})

test('fenêtre : le contrat part sans pièce jointe, dans le fil existant', async () => {
  const fil = { reservation_id: 'r1', transport: 'mailpit', thread_id: null, sujet: 'Réservation 27-G-592 · École des Érables', premier_message_id: '<a@m>', dernier_message_id: '<b@m>', courriels: 2 }
  const appels = simulerFenetre({ e: etatFenetre(), fil })
  await expedierFenetre(ENV, { reservation: 'r1', genre: 'contrat', ref: S1, a: 'sophie@ecole.ca', cc: 'direction@ecole.ca', sujet: 'ignoré (fil)', corps: 'Signez ici' }, 'Coordo')
  const envoi = appels.find((a) => a.u.endsWith('/api/v1/send')).corps
  assert.deepEqual([envoi.Subject, envoi.Attachments, envoi.Headers['In-Reply-To']], ['Réservation 27-G-592 · École des Érables', [], '<b@m>'])
  assert.ok(!appels.some((a) => a.u.includes('/storage/')))
  assert.equal(appels.find((a) => a.u.endsWith('/rpc/courriel_parti')).corps.p.document, null)
})

test('champ {{fiches_participants}} : seulement pour les séjours scolaires (phrase des fiches dans le contrat)', () => {
  const compagnie = { raison_sociale: 'GBPA+ inc.', nom_court: 'GBPA+', courriel: 'x@y.ca', telephone: '1', reponse_interac: 'R' }
  const corps = '{{#si fiches_participants}}Une fois le contrat signé, le lien des fiches participants paraîtra aussi sur votre page.\n\n{{/si}}La réservation est confirmée.'
  const pour = (forfait) => remplirCourriel(corps, champsCourriel(etat({ r: { forfait } }), { genre: 'contrat', ref: null, langue: 'fr', compagnie, racine: 'https://g.test' }))
  assert.match(pour('classe_nature'), /^Une fois le contrat signé/)
  assert.match(pour('journee_plein_air'), /^Une fois le contrat signé/)
  assert.equal(pour('accueil_groupe'), 'La réservation est confirmée.')
})
