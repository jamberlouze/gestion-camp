// Courriels et signatures du module RH (phase 3), réseau simulé : rien ne
// part, ni vers Supabase, ni vers Google, ni vers Mailpit.
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { PDFDocument } from 'pdf-lib'
import { champsCourriel, champsManquants, compagnieDeCandidature, listeNouveautes, modelePour, remplirTexte, rendreCourriel, versHtml } from '../../src/modules/rh/courriels.ts'
import { erreursConsentement, erreursSignature } from '../../src/modules/rh/dossierEmbauche.ts'
import { signer } from '../commun/etat.js'
import { routeRh } from './api.js'
import { accuserReception, envoyerCourriel, modeEnvoi, preparerAutomatiques } from './courriels.js'

const GBPA = '10000000-0000-4000-8000-000000000001'
const OPI = '10000000-0000-4000-8000-000000000002'
const JETON = 'cd'.repeat(24)
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
// Un vrai PNG 1×1 est trop court pour la règle « signature tracée » (> 200 caractères) : on l'allonge par un bloc tEXt inoffensif.
const PNG_SIGNATURE = (() => {
  const b = Buffer.from(PNG, 'base64')
  const texte = Buffer.from('Comment\0' + 'x'.repeat(300))
  const long = Buffer.alloc(4)
  long.writeUInt32BE(texte.length)
  const type = Buffer.from('tEXt')
  const crc = Buffer.alloc(4) // CRC ignoré par pdf-lib
  const fin = b.length - 12
  return `data:image/png;base64,${Buffer.concat([b.subarray(0, fin), long, type, texte, crc, b.subarray(fin)]).toString('base64')}`
})()

// ------------------------------------------------------------------
// Règles pures
// ------------------------------------------------------------------
test('modèles : celui de la compagnie l’emporte sur le commun', () => {
  const modeles = [
    { genre: 'entrevue', entreprise_id: null, id: 'commun' },
    { genre: 'entrevue', entreprise_id: OPI, id: 'opikawa' },
  ]
  assert.equal(modelePour(modeles, 'entrevue', OPI).id, 'opikawa')
  assert.equal(modelePour(modeles, 'entrevue', GBPA).id, 'commun')
  assert.equal(modelePour(modeles, 'refus_equipe', GBPA), null)
})

test('rendu : champs, sections {{#si}}, champ vide signalé « [champ ?] »', () => {
  const champs = champsCourriel({ personne: { prenom: 'Léa', surnom: 'Pivoine' }, compagnie: { nom_expediteur: 'Opikawa', lien_rendez_vous: '' }, postes: ['A', 'B', 'C'] })
  const t = remplirTexte('Bonjour {{appel}},\n{{#si lien_rendez_vous}}\nRéservez : {{lien_rendez_vous}}\n{{/si}}\nPostes : {{postes}} — {{inconnu}}', champs)
  assert.equal(t, 'Bonjour Pivoine,\nPostes : A, B et C — [inconnu ?]')
  assert.deepEqual(champsManquants(t), ['inconnu'])
  const en = rendreCourriel({ sujet: 'Merci', corps: 'Bonjour', sujet_en: 'Thanks', corps_en: 'Hi {{prenom}}' }, 'en', champs)
  assert.deepEqual(en, { langue: 'en', sujet: 'Thanks', corps: 'Hi Léa' })
  const sansEn = rendreCourriel({ sujet: 'Merci', corps: 'Bonjour', sujet_en: null, corps_en: null }, 'en', champs)
  assert.equal(sansEn.langue, 'fr')
})

test('HTML : gras, liens, puces, texte échappé', () => {
  const h = versHtml('**Bienvenue** <b>\n- un\n- deux\nVoir https://exemple.ca/x et [ici](https://a.ca)')
  assert.match(h, /<strong>Bienvenue<\/strong> &lt;b&gt;/)
  assert.match(h, /<ul[^>]*>\n<li>un<\/li>\n<li>deux<\/li>\n<\/ul>/)
  assert.match(h, /<a href="https:\/\/exemple.ca\/x">/)
  assert.match(h, /<a href="https:\/\/a.ca">ici<\/a>/)
})

test('compagnie qui écrit : celle de la candidature, sinon celle du premier poste', () => {
  assert.equal(compagnieDeCandidature({ entreprise_id: OPI, poste_ids: ['p'] }, [{ id: 'p', entreprise_id: GBPA }]), OPI)
  assert.equal(compagnieDeCandidature({ entreprise_id: null, poste_ids: ['p'] }, [{ id: 'p', entreprise_id: GBPA }]), GBPA)
})

test('résumé : vide quand rien n’est nouveau', () => {
  assert.equal(listeNouveautes({ candidatures: [], retours: [], dossiers: [] }), '')
  const l = listeNouveautes({ candidatures: [{ nom: 'Léa Essai' }], retours: [{ nom: 'Max', reponse: 'non', saison: 'Été 2027' }], dossiers: [] })
  assert.match(l, /Nouvelles candidatures \(1\) :\n- Léa Essai/)
  assert.match(l, /- Max : Non \(Été 2027\)/)
})

test('signatures : nom, image tracée, case cochée, lien du parent', () => {
  const ok = { jeton: JETON, contrat: crypto.randomUUID(), nom: 'Léa Essai', image: PNG_SIGNATURE, accepte: true }
  assert.deepEqual(erreursSignature(ok), {})
  assert.ok(erreursSignature({ ...ok, image: 'data:image/jpeg;base64,xx' }).image)
  assert.ok(erreursSignature({ ...ok, accepte: 'oui' }).accepte)
  assert.ok(erreursSignature({ ...ok, nom: ' L ' }).nom)
  assert.ok(erreursSignature({ ...ok, jeton: 'x' }).accepte)
  assert.deepEqual(erreursConsentement({ jeton: JETON, nom: 'Marie Essai', lien: 'Mère', image: PNG_SIGNATURE, accepte: true }), {})
  assert.ok(erreursConsentement({ jeton: JETON, nom: 'Marie Essai', lien: 'Cousine', image: PNG_SIGNATURE, accepte: true }).lien)
})

test('mode d’envoi : Mailpit en DEV, jamais Gmail depuis une base locale', () => {
  assert.equal(modeEnvoi({ COURRIELS_MAILPIT: 'http://127.0.0.1:54324', SUPABASE_URL: 'http://127.0.0.1:54321' }), 'mailpit')
  assert.equal(modeEnvoi({ SUPABASE_URL: 'http://127.0.0.1:54321', GMAIL_CLIENT_ID: 'a', GMAIL_CLIENT_SECRET: 'b' }), 'bloque')
  assert.equal(modeEnvoi({ SUPABASE_URL: 'https://x.supabase.co' }), 'non_configure')
  assert.equal(modeEnvoi({ SUPABASE_URL: 'https://x.supabase.co', GMAIL_CLIENT_ID: 'a', GMAIL_CLIENT_SECRET: 'b' }), 'gmail')
})

// ------------------------------------------------------------------
// Réseau simulé
// ------------------------------------------------------------------
const fetchOriginal = globalThis.fetch
afterEach(() => {
  globalThis.fetch = fetchOriginal
})

const ENV_DEV = { SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SECRET_KEY: 'sb_secret_x', SUPABASE_PUBLISHABLE_KEY: 'pub', COURRIELS_MAILPIT: 'http://127.0.0.1:54324', APP_URL: 'http://localhost:5173' }
const ENV_PROD = { SUPABASE_URL: 'https://base.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_x', SUPABASE_PUBLISHABLE_KEY: 'pub', GMAIL_CLIENT_ID: 'client', GMAIL_CLIENT_SECRET: 'secret', APP_URL: 'https://gestion.test' }

/**
 * `tables` : réponses des lectures (table → lignes, ou fonction(adresse)) ;
 * `rpc` : réponses des fonctions (valeur, ou fonction(corps) qui rend ou lève) ;
 * `externe` : adresse → réponse (Google, Mailpit).
 */
function simuler({ tables = {}, rpc = {}, externe = {} } = {}) {
  const appels = []
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    const methode = init.method ?? 'GET'
    appels.push({ url: u, init, methode })
    for (const [debut, r] of Object.entries(externe)) if (u.startsWith(debut)) return typeof r === 'function' ? r(init) : Response.json(r)
    const f = /\/rest\/v1\/rpc\/(\w+)$/.exec(u)
    if (f) {
      if (!(f[1] in rpc)) throw new Error(`Appel inattendu : ${u}`)
      try {
        const r = rpc[f[1]]
        return Response.json(typeof r === 'function' ? r(JSON.parse(init.body)) : r)
      } catch (e) {
        return new Response(JSON.stringify({ code: 'P0001', message: e.message }), { status: 400 })
      }
    }
    const t = /\/rest\/v1\/(\w+)\?/.exec(u)
    if (t) {
      if (methode === 'PATCH') return new Response(null, { status: 204 })
      const r = tables[t[1]]
      return Response.json(typeof r === 'function' ? r(u) : (r ?? []))
    }
    if (u.includes('/storage/v1/object/')) return Response.json({ Key: 'ok' })
    throw new Error(`Appel inattendu : ${u}`)
  }
  return appels
}
const rpcs = (appels, nom) => appels.filter((a) => a.url.endsWith(`/rpc/${nom}`)).map((a) => JSON.parse(a.init.body))
const vers = (appels, debut) => appels.filter((a) => a.url.startsWith(debut))

const compagnies = [
  { entreprise_id: GBPA, adresse_envoi: 'inscriptions@camptremblant.com', nom_expediteur: 'Base de plein air Mont-Tremblant', signature: 'L’équipe', lien_rendez_vous: 'https://rdv.test', attrait: 'notre camp' },
  { entreprise_id: OPI, adresse_envoi: 'messages@opikawa.com', nom_expediteur: 'Opikawa', signature: 'Opikawa', lien_rendez_vous: null, attrait: 'nos voyages' },
]
const modeles = [
  { id: 'm1', genre: 'accuse', entreprise_id: null, sujet: 'Candidature reçue', corps: 'Bonjour {{prenom}}, merci pour {{postes}}.\n{{signature}}', sujet_en: 'Application received', corps_en: 'Hi {{prenom}}', mode: 'automatique' },
  { id: 'm2', genre: 'rappel_dossier', entreprise_id: null, sujet: 'Ton dossier', corps: 'Bonjour {{appel}}, ton dossier : {{lien_dossier}}', sujet_en: null, corps_en: null, mode: 'approuver' },
  { id: 'm3', genre: 'resume', entreprise_id: null, sujet: 'Résumé RH', corps: '{{liste}}\n{{lien_app}}', sujet_en: null, corps_en: null, mode: 'automatique' },
]
const entreprises = [
  { id: GBPA, nom: 'Base de plein air', abreviation: 'GBPA+' },
  { id: OPI, nom: 'Opikawa', abreviation: 'OPI' },
]
const reglages = [
  { cle: 'courriels_depuis', valeur: '2026-10-15' },
  { cle: 'rappel_jours', valeur: 7 },
  { cle: 'resume_destinataires', valeur: ['direction@camp.test'] },
  { cle: 'resume_heure', valeur: 7 },
]
const contexte = (x = {}) => ({ reglages, modeles_courriels: modeles, compagnies, entreprises, ...x })

const courriel = (x = {}) => ({ id: 'c0000000-0000-4000-8000-000000000001', genre: 'entrevue', statut: 'prepare', entreprise_id: OPI, a: ['lea@exemple.ca'], sujet: 'Entrevue', corps: 'Bonjour Léa', ...x })

test('envoi : Mailpit en DEV, de la boîte de la compagnie, puis rh.courriel_envoye', async () => {
  const appels = simuler({
    tables: { courriels: [courriel()], compagnies: (u) => compagnies.filter((c) => u.includes(c.entreprise_id)) },
    rpc: { courriel_envoye: null },
    externe: { 'http://127.0.0.1:54324/api/v1/send': { ID: 'mp1' } },
  })
  const r = await envoyerCourriel(ENV_DEV, courriel().id, 'Julie')
  assert.deepEqual(r, { ok: true, mode: 'mailpit' })
  const [envoi] = vers(appels, 'http://127.0.0.1:54324')
  const m = JSON.parse(envoi.init.body)
  assert.deepEqual(m.From, { Email: 'messages@opikawa.com', Name: 'Opikawa' })
  assert.deepEqual(m.To, [{ Email: 'lea@exemple.ca' }])
  assert.match(m.HTML, /Bonjour Léa/)
  assert.deepEqual(rpcs(appels, 'courriel_envoye'), [{ p_courriel: courriel().id, p_message_id: 'mp1', p_par: 'Julie', p_mailpit: true }])
})

test('envoi : refusé si un champ est resté vide, déjà parti, ou base locale sans Mailpit', async () => {
  simuler({ tables: { courriels: [courriel({ corps: 'Lien : [lien_dossier ?]' })] } })
  await assert.rejects(envoyerCourriel(ENV_DEV, courriel().id, 'Julie'), { code: 'champ' })
  simuler({ tables: { courriels: [courriel({ statut: 'envoye' })] } })
  await assert.rejects(envoyerCourriel(ENV_DEV, courriel().id, 'Julie'), { code: 'deja' })
  const appels = simuler({ tables: { courriels: [courriel()] } })
  await assert.rejects(envoyerCourriel({ ...ENV_DEV, COURRIELS_MAILPIT: '' }, courriel().id, 'Julie'), { code: 'configuration' })
  assert.equal(appels.filter((a) => !a.url.includes('/rest/v1/courriels')).length, 0)
})

test('envoi Gmail : boîte non connectée, ou connectée à une autre adresse → refusé sans appel à Google', async () => {
  const sans = simuler({ tables: { courriels: [courriel()], compagnies: [compagnies[1]] }, rpc: { jeton_boite: null } })
  await assert.rejects(envoyerCourriel(ENV_PROD, courriel().id, 'Julie'), { code: 'boite' })
  assert.equal(vers(sans, 'https://oauth2').length, 0)
  const autre = simuler({ tables: { courriels: [courriel()], compagnies: [compagnies[1]] }, rpc: { jeton_boite: { adresse: 'vieux@opikawa.com', jeton: 'r' } } })
  await assert.rejects(envoyerCourriel(ENV_PROD, courriel().id, 'Julie'), /reconnectez/)
  assert.equal(vers(autre, 'https://oauth2').length, 0)
})

test('envoi Gmail : jeton de la boîte de la compagnie ; Google refuse le jeton → boîte notée « à reconnecter »', async () => {
  const appels = simuler({
    tables: { courriels: [courriel()], compagnies: [compagnies[1]] },
    rpc: { jeton_boite: { adresse: 'messages@opikawa.com', jeton: 'actualisation-opi' }, noter_boite: null, courriel_envoye: null },
    externe: {
      'https://oauth2.googleapis.com/token': { access_token: 'acces' },
      'https://gmail.googleapis.com/': { id: 'g1' },
    },
  })
  assert.deepEqual(await envoyerCourriel(ENV_PROD, courriel().id, 'Julie'), { ok: true, mode: 'gmail' })
  assert.match(String(vers(appels, 'https://oauth2')[0].init.body), /refresh_token=actualisation-opi/)
  const raw = JSON.parse(vers(appels, 'https://gmail')[0].init.body).raw
  assert.match(Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(), /From: .*messages@opikawa.com/)
  assert.deepEqual(rpcs(appels, 'noter_boite'), [{ p_entreprise: OPI, p_erreur: null }])
  assert.equal(rpcs(appels, 'courriel_envoye')[0].p_mailpit, false)

  const refus = simuler({
    tables: { courriels: [courriel()], compagnies: [compagnies[1]] },
    rpc: { jeton_boite: { adresse: 'messages@opikawa.com', jeton: 'perime' }, noter_boite: null },
    externe: { 'https://oauth2.googleapis.com/token': () => new Response('{"error":"invalid_grant"}', { status: 400 }) },
  })
  await assert.rejects(envoyerCourriel(ENV_PROD, courriel().id, 'Julie'), { code: 'boite' })
  assert.match(rpcs(refus, 'noter_boite')[0].p_erreur, /invalid_grant/)
  assert.equal(rpcs(refus, 'courriel_envoye').length, 0)
})

test('accusé de réception : préparé de la boîte de la compagnie du poste, en anglais si postulé en anglais, envoyé seul', async () => {
  const cand = { id: 'd0000000-0000-4000-8000-000000000001', personne_id: 'e0000000-0000-4000-8000-000000000001', entreprise_id: null, saison_ids: ['s1'], poste_ids: ['p1'], reponses: { langue: 'Anglais' } }
  const appels = simuler({
    tables: {
      ...contexte(),
      candidatures: [cand],
      personnes: [{ prenom: 'Lea', surnom: null, courriel: 'lea@exemple.ca' }],
      saisons: [{ nom: 'Été 2027' }],
      postes: [{ id: 'p1', nom: 'Animateur', entreprise_id: OPI }],
      courriels: [courriel({ id: 'c1', genre: 'accuse', a: ['lea@exemple.ca'], sujet: 'Application received', corps: 'Hi Lea' })],
    },
    rpc: { courriels_ajouter: (c) => c.p_courriels.map((x) => ({ ...x, id: 'c1' })), courriel_envoye: null },
    externe: { 'http://127.0.0.1:54324/api/v1/send': { ID: 'mp' } },
  })
  assert.deepEqual(await accuserReception(ENV_DEV, cand.id), { prepares: 1, envoyes: 1 })
  const [{ p_courriels }] = rpcs(appels, 'courriels_ajouter')
  assert.equal(p_courriels[0].cle, `accuse:${cand.id}`)
  assert.equal(p_courriels[0].entreprise_id, OPI)
  assert.equal(p_courriels[0].langue, 'en')
  assert.equal(p_courriels[0].corps, 'Hi Lea')
})

test('accusé désactivé : rien de préparé', async () => {
  const appels = simuler({ tables: contexte({ modeles_courriels: [{ ...modeles[0], mode: 'desactive' }] }), rpc: {} })
  assert.deepEqual(await accuserReception(ENV_DEV, 'x'), { prepares: 0, envoyes: 0 })
  assert.equal(rpcs(appels, 'courriels_ajouter').length, 0)
})

test('cron : rappel préparé (à approuver, pas envoyé) ; résumé seulement pendant l’heure réglée, s’il y a du nouveau', async () => {
  const du = { embauche_id: 'emb1', personne_id: 'per1', candidature_id: null, entreprise_id: GBPA, jeton: JETON, saison: 'Été 2027', poste: 'Animateur', prenom: 'Léa', surnom: 'Pivoine', courriel: 'lea@exemple.ca' }
  const nouveautes = { candidatures: [{ nom: 'Max Essai' }], retours: [], dossiers: [] }
  const a7h = new Date('2026-10-16T11:20:00Z') // 7 h 20 à Montréal
  const appels = simuler({
    tables: contexte(),
    rpc: { rappels_dus: [du], nouveautes, courriels_ajouter: (c) => c.p_courriels.map((x, i) => ({ ...x, id: `n${i}` })) },
  })
  // Le résumé (automatique) ne trouve pas son courriel (lecture simulée vide) : son envoi échoue sans bloquer le reste.
  const r = await preparerAutomatiques({ ...ENV_DEV, COURRIELS_MAILPIT: '' }, a7h)
  assert.equal(r.prepares, 2)
  const [{ p_courriels }] = rpcs(appels, 'courriels_ajouter')
  const rappel = p_courriels.find((c) => c.genre === 'rappel_dossier')
  assert.equal(rappel.cle, 'rappel:emb1')
  assert.match(rappel.corps, new RegExp(`Bonjour Pivoine, ton dossier : http://localhost:5173/dossier/${JETON}`))
  const resume = p_courriels.find((c) => c.genre === 'resume')
  assert.equal(resume.cle, 'resume:2026-10-16')
  assert.deepEqual(resume.a, ['direction@camp.test'])
  assert.equal(resume.entreprise_id, GBPA)
  assert.match(resume.corps, /- Max Essai/)
  assert.deepEqual(rpcs(appels, 'rappels_dus'), [{ p_jours: 7, p_depuis: '2026-10-15' }])

  // 9 h : pas l'heure du résumé.
  const plusTard = simuler({ tables: contexte(), rpc: { rappels_dus: [], courriels_ajouter: [] } })
  await preparerAutomatiques(ENV_DEV, new Date('2026-10-16T13:00:00Z'))
  assert.equal(rpcs(plusTard, 'nouveautes').length, 0)
  // Rien de nouveau : pas de résumé.
  const rien = simuler({ tables: contexte(), rpc: { rappels_dus: [], nouveautes: { candidatures: [], retours: [], dossiers: [] }, courriels_ajouter: [] } })
  assert.deepEqual(await preparerAutomatiques(ENV_DEV, a7h), { prepares: 0, envoyes: 0 })
  assert.equal(rpcs(rien, 'courriels_ajouter').length, 0)
})

test('cron : rien avant le réglage « courriels_depuis »', async () => {
  const appels = simuler({ tables: contexte({ reglages: [] }) })
  assert.deepEqual(await preparerAutomatiques(ENV_DEV), { prepares: 0, envoyes: 0 })
  assert.equal(appels.filter((a) => a.url.includes('/rpc/')).length, 0)
})

// ------------------------------------------------------------------
// Routes de l'équipe
// ------------------------------------------------------------------
const requete = (chemin, corps, jeton = 'session') =>
  new Request(`https://gestion.test/api/rh/${chemin}`, { method: 'POST', body: JSON.stringify(corps), headers: jeton ? { Authorization: `Bearer ${jeton}` } : {} })

test('équipe : sans session ou sans droit d’écrire dans RH → 403', async () => {
  simuler({ rpc: { peut_envoyer: { ok: false } } })
  assert.equal((await routeRh(requete('envoyer', { courriels: [courriel().id] }), ENV_DEV, 'envoyer')).status, 403)
  const appels = simuler()
  assert.equal((await routeRh(requete('envoyer', { courriels: [courriel().id] }, null), ENV_DEV, 'envoyer')).status, 403)
  assert.equal(appels.length, 0)
})

test('connexion d’une boîte : Google demande l’envoi seulement, pour l’adresse d’envoi ; retour vérifié', async () => {
  simuler({ rpc: { peut_envoyer: { ok: true, nom: 'Julie', courriel: 'julie@camp.test' } }, tables: { compagnies: [compagnies[1]] } })
  const res = await routeRh(requete('connexion', { compagnie: OPI }), ENV_PROD, 'connexion')
  const { url } = await res.json()
  const u = new URL(url)
  assert.equal(u.searchParams.get('scope'), 'openid email https://www.googleapis.com/auth/gmail.send')
  assert.equal(u.searchParams.get('login_hint'), 'messages@opikawa.com')
  assert.equal(u.searchParams.get('access_type'), 'offline')
  assert.equal(u.searchParams.get('redirect_uri'), 'https://gestion.test/api/rh/retourgoogle')

  // Retour : la personne a autorisé une autre boîte → rien d'enregistré.
  const idToken = (email) => `x.${Buffer.from(JSON.stringify({ email })).toString('base64url')}.y`
  const etat = await signer(ENV_PROD, 'gmail-rh', { e: OPI, n: 'Julie' })
  const retour = (q) => routeRh(new Request(`https://gestion.test/api/rh/retourgoogle?${new URLSearchParams(q)}`), ENV_PROD, 'retourgoogle')
  const mauvais = simuler({
    tables: { compagnies: [compagnies[1]] },
    externe: { 'https://oauth2.googleapis.com/token': { refresh_token: 'r', id_token: idToken('perso@gmail.com') } },
  })
  const r1 = await retour({ code: 'c', state: etat })
  assert.equal(r1.status, 302)
  assert.match(decodeURIComponent(r1.headers.get('location')), /boite=erreur.*perso@gmail.com/)
  assert.equal(rpcs(mauvais, 'enregistrer_boite').length, 0)
  // La bonne boîte : jeton enregistré (chiffré par la base).
  const bon = simuler({
    tables: { compagnies: [compagnies[1]] },
    rpc: { enregistrer_boite: null },
    externe: { 'https://oauth2.googleapis.com/token': { refresh_token: 'r-opi', id_token: idToken('Messages@Opikawa.com') } },
  })
  const r2 = await retour({ code: 'c', state: etat })
  assert.match(r2.headers.get('location'), /boite=ok/)
  assert.deepEqual(rpcs(bon, 'enregistrer_boite'), [{ p_entreprise: OPI, p_adresse: 'Messages@Opikawa.com', p_jeton: 'r-opi', p_par: 'Julie' }])
  // State falsifié : refusé sans appeler Google.
  const faux = simuler()
  const r3 = await retour({ code: 'c', state: etat.slice(0, -2) + 'xx' })
  assert.match(decodeURIComponent(r3.headers.get('location')), /expiré/)
  assert.equal(faux.length, 0)
})

// ------------------------------------------------------------------
// Contrat et consentement (page du dossier)
// ------------------------------------------------------------------
const CONTRAT = 'f0000000-0000-4000-8000-000000000001'
const termes = {
  poste: 'Animateur',
  saison: 'Été 2027',
  genre_saison: 'ete',
  debut: '2027-06-20',
  fin: '2027-08-20',
  remuneration: 'semaine',
  taux: 664,
  echelon: 2,
  compagnie: { nom: 'GBPA+', raison_sociale: 'Base de plein air Mont-Tremblant', nom_court: 'la BPA', adresse: '1 chemin du Lac', courriel: 'inscriptions@camptremblant.com', telephone: '819 555-1234' },
  taches: '- Animer',
  signataire: 'Julie Tremblay',
  prepare_le: '2026-10-15',
}
const aProduire = (x = {}) => ({
  id: CONTRAT,
  statut: 'en_attente',
  titre: 'Contrat de travail',
  contenu: '# CONTRAT\n[[entete]]\nLe taux est de {{taux}}.\n[[signatures]]',
  termes,
  chemin_signe: null,
  embauche_id: 'emb1',
  personne_id: 'aaaaaaaa-0000-4000-8000-000000000001',
  embauche_ouverte: true,
  employe: { prenom: 'Léa', nom_famille: 'Essai', courriel: 'lea@exemple.ca', telephone: null, adresse: '1 rue', ville: 'Mont-Tremblant', province: 'QC', code_postal: 'J8E 1A1' },
  ...x,
})
const corpsSignature = (x = {}) => ({ jeton: JETON, contrat: CONTRAT, nom: 'Léa Essai', image: PNG_SIGNATURE, accepte: true, ...x })
const signerReq = (corps, chemin = 'signer') =>
  new Request(`https://gestion.test/api/rh/${chemin}`, { method: 'POST', body: JSON.stringify(corps), headers: { 'CF-Connecting-IP': '9.8.7.6', 'User-Agent': 'Essai' } })

test('contrat : à lire, produit tel qu’il sera signé', async () => {
  simuler({ rpc: { contrat_a_produire: aProduire() } })
  const res = await routeRh(new Request(`https://gestion.test/api/rh/contrat?jeton=${JETON}&id=${CONTRAT}`), ENV_DEV, 'contrat')
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'application/pdf')
  const doc = await PDFDocument.load(new Uint8Array(await res.arrayBuffer()))
  assert.ok(doc.getPageCount() >= 1)
})

test('contrat : signature incomplète → 422 sans rien produire ; contrat déjà signé → 409', async () => {
  const appels = simuler()
  const res = await routeRh(signerReq(corpsSignature({ accepte: false })), ENV_DEV, 'signer')
  assert.equal(res.status, 422)
  assert.ok((await res.json()).champs.accepte)
  assert.equal(appels.length, 0)
  simuler({ rpc: { contrat_a_produire: aProduire({ statut: 'signe' }) } })
  assert.equal((await routeRh(signerReq(corpsSignature()), ENV_DEV, 'signer')).status, 409)
  simuler({ rpc: { contrat_a_produire: aProduire({ embauche_ouverte: false }) } })
  assert.equal((await (await routeRh(signerReq(corpsSignature()), ENV_DEV, 'signer')).json()).erreur, 'ferme')
  simuler({
    rpc: {
      contrat_a_produire: () => {
        throw new Error('JETON')
      },
    },
  })
  assert.equal((await routeRh(signerReq(corpsSignature()), ENV_DEV, 'signer')).status, 404)
})

test('contrat : signé → PDF avec la signature et le certificat déposé chez la personne, puis rh.contrat_signe', async () => {
  const appels = simuler({ rpc: { contrat_a_produire: aProduire(), contrat_signe: null } })
  const res = await routeRh(signerReq(corpsSignature()), ENV_DEV, 'signer')
  assert.equal(res.status, 200)
  const depot = appels.find((a) => a.url.includes('/storage/v1/object/rh-documents/') && a.methode === 'POST')
  assert.match(depot.url, /rh-documents\/aaaaaaaa-0000-4000-8000-000000000001\/[0-9a-f-]{36}\.pdf$/)
  const pdf = await PDFDocument.load(new Uint8Array(await new Response(depot.init.body).arrayBuffer()))
  assert.ok(pdf.getPageCount() >= 2, 'contrat + certificat')
  const [{ p_jeton, p_contrat, p }] = rpcs(appels, 'contrat_signe')
  assert.equal(p_jeton, JETON)
  assert.equal(p_contrat, CONTRAT)
  assert.equal(p.nom, 'Léa Essai')
  assert.equal(p.adresse_ip, '9.8.7.6')
  assert.match(p.empreinte, /^[0-9a-f]{64}$/)
  assert.equal(p.document.chemin, depot.url.split('/rh-documents/')[1])
})

test('contrat : la base refuse (signé entre-temps) → le PDF déposé est retiré', async () => {
  const appels = simuler({
    rpc: {
      contrat_a_produire: aProduire(),
      contrat_signe: () => {
        throw new Error('CONTRAT_INTROUVABLE')
      },
    },
  })
  const res = await routeRh(signerReq(corpsSignature()), ENV_DEV, 'signer')
  assert.equal(res.status, 409)
  const retrait = appels.find((a) => a.methode === 'DELETE')
  assert.equal(JSON.parse(retrait.init.body).prefixes.length, 1)
})

test('consentement : seulement pour une personne mineure au début de l’embauche', async () => {
  const c = (naissance) => ({
    embauche_id: 'emb1',
    personne_id: 'aaaaaaaa-0000-4000-8000-000000000001',
    modele: { titre: 'Consentement parental', contenu: '# Consentement\nJe, {{parent}}, autorise {{employe}}.\n[[signature_parent]]' },
    employe: { prenom: 'Léa', nom_famille: 'Essai', date_naissance: naissance },
    compagnie: 'Base de plein air Mont-Tremblant',
    saison: 'Été 2027',
    debut: '2027-06-20',
  })
  const corps = { jeton: JETON, nom: 'Marie Essai', lien: 'Mère', image: PNG_SIGNATURE, accepte: true }
  simuler({ rpc: { consentement_a_produire: c('2005-01-01') } })
  assert.equal((await (await routeRh(signerReq(corps, 'consentement'), ENV_DEV, 'consentement')).json()).erreur, 'majeur')
  // Date de naissance pas encore au dossier : celle que la page vient de saisir.
  const appels = simuler({ rpc: { consentement_a_produire: c(null), consentement_signe: null } })
  const res = await routeRh(signerReq({ ...corps, date_naissance: '2010-07-01' }, 'consentement'), ENV_DEV, 'consentement')
  assert.equal(res.status, 200)
  const [{ p }] = rpcs(appels, 'consentement_signe')
  assert.equal(p.nom, 'Marie Essai')
  assert.equal(p.lien, 'Mère')
  assert.match(p.document.chemin, /^aaaaaaaa-0000-4000-8000-000000000001\/[0-9a-f-]{36}\.pdf$/)
})
