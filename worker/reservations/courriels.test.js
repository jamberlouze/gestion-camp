import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  aPreparer,
  champsCourriel,
  destinataires,
  echeanceFacture,
  encoreUtile,
  joursRappelsPaiement,
  remplirCourriel,
  rendreCourriel,
  versHtml,
} from '../../src/modules/reservations/courriels.ts'
import { chiffrer } from '../qbo/chiffre.js'
import { envoyerCourriel, messageMime, modeEnvoi, preparerCourriels } from './courriels.js'

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

test('accusé, estimé, contrat : un par événement, à partir de la mise en service seulement', () => {
  const e = etat({
    demande: { id: 'd1', recue_le: '2026-10-11T14:00:00Z', langue: 'fr', courriel: 'prof@ecole.ca', nom: 'Prof' },
    estimes: [
      { id: 'e0', version: 1, statut: 'envoye', envoye_le: '2026-10-01T12:00:00Z', total: 100 },
      { id: 'e1', version: 2, statut: 'envoye', envoye_le: '2026-10-11T12:00:00Z', total: 15553.02 },
    ],
    signatures: [{ id: 's1', statut: 'en_attente', envoye_le: '2026-10-12T15:00:00Z', echeance: '2026-10-19', jeton: 'js' }],
  })
  assert.deepEqual(cles(aPreparer(e, '2026-10-12', DEPUIS)), ['accuse:d1', 'estime:e1', 'contrat:s1'])
  // Rappel de signature au 5e jour, pas avant.
  assert.ok(!cles(aPreparer(e, '2026-10-16', DEPUIS)).includes('rappel_signature:s1'))
  assert.ok(cles(aPreparer(e, '2026-10-17', DEPUIS)).includes('rappel_signature:s1'))
  // Déjà préparés (même annulés) : jamais deux fois.
  const deja = { ...e, courriels: [{ id: 'x', cle: 'estime:e1', genre: 'estime', statut: 'annule', ref: 'e1' }] }
  assert.ok(!cles(aPreparer(deja, '2026-10-12', DEPUIS)).includes('estime:e1'))
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

async function simuler({ e = etat(), courriel = null } = {}) {
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
    if (u.includes('/courriels?id=eq.') && m === 'GET') return rep(courriel ? [courriel] : [])
    if (u.includes('/courriels?') && m === 'PATCH') return rep(null, 204)
    if (u.includes('/qbo_connexions?')) return rep([{ compagnie_id: 'c1', realm_id: '9', environnement: 'sandbox', jetons }])
    if (u.includes('sandbox-quickbooks.api.intuit.com') && u.includes('/invoice/41/pdf')) return new Response(new TextEncoder().encode('%PDF-facture'), { headers: { 'content-type': 'application/pdf' } })
    if (u === 'http://mailpit.test/api/v1/send') return rep({ ID: 'mp1' })
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

test('envoyer (DEV) : Mailpit, PDF de QBO joint, journal et CRM', async () => {
  const c = { id: 'c9', reservation_id: 'r1', genre: 'facture', cle: 'facture:f1', ref: 'f1', statut: 'prepare', a: ['compta@ecole.ca'], cc: ['sophie@ecole.ca'], sujet: 'Facture 1041', corps: 'Bonjour https://app.test/x' }
  const appels = await simuler({ e: etat({ factures: [facture] }), courriel: c })
  assert.deepEqual(await envoyerCourriel(ENV, 'c9', 'Adjointe'), { ok: true, mode: 'mailpit' })
  const envoi = appels.find((a) => a.u === 'http://mailpit.test/api/v1/send').corps
  assert.deepEqual([envoi.From.Email, envoi.To[0].Email, envoi.Cc[0].Email], ['inscriptions@camptremblant.com', 'compta@ecole.ca', 'sophie@ecole.ca'])
  assert.equal(Buffer.from(envoi.Attachments[0].Content, 'base64').toString(), '%PDF-facture')
  assert.equal(envoi.Attachments[0].Filename, 'Facture 1041.pdf')
  const statut = appels.filter((a) => a.u.includes('/courriels?id=eq.c9') && a.m === 'PATCH').map((a) => a.corps)
  assert.deepEqual([statut[0].statut, statut[0].envoye_par_nom, statut[0].message_id], ['envoye', 'Adjointe', 'mp1'])
  assert.match(appels.find((a) => a.u.endsWith('/rest/v1/journal')).corps.texte, /« Facture 1041 » envoyé à compta@ecole.ca, sophie@ecole.ca \(DEV : Mailpit\)/)
  assert.equal(appels.find((a) => a.u.endsWith('/rest/v1/echanges')).corps.genre, 'courriel')
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
