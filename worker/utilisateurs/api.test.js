import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { rolesCreables } from '../../src/core/comptes.ts'
import { lireAjout, routeUtilisateurs } from './api.js'

const fetchOriginal = globalThis.fetch
afterEach(() => {
  globalThis.fetch = fetchOriginal
})

const env = { SUPABASE_URL: 'https://base.test', SUPABASE_SECRET_KEY: 'sb_secret_x', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' }
const ID = '11111111-1111-4111-8111-111111111111'

/**
 * Réseau simulé. `role` : réponse de core.role_actuel (null = pas de compte
 * actif) ; `profils` : lignes déjà dans core.profils ; `invite` / `creer` :
 * [statut, corps] de Supabase Auth.
 */
function simuler({ role = 'admin', profils = [], invite = [200, { id: ID, email: 'dom@camp.test' }], creer = [200, { id: ID }] } = {}) {
  const appels = []
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    const methode = init.method ?? 'GET'
    appels.push({ url: u, methode, init, corps: init.body ? JSON.parse(init.body) : undefined })
    if (u === 'https://base.test/rest/v1/rpc/role_actuel') return Response.json(role)
    if (u.startsWith('https://base.test/rest/v1/profils?') && methode === 'GET') return Response.json(profils)
    if (u.startsWith('https://base.test/rest/v1/profils?') && methode === 'PATCH') return new Response(null, { status: 204 })
    if (u === 'https://base.test/auth/v1/invite') return Response.json(invite[1], { status: invite[0] })
    if (u === 'https://base.test/auth/v1/admin/users') return Response.json(creer[1], { status: creer[0] })
    throw new Error(`Appel inattendu : ${methode} ${u}`)
  }
  return appels
}

const requete = (corps, jeton = 'jeton-de-session') =>
  new Request('https://app.test/api/utilisateurs/ajouter', {
    method: 'POST',
    body: JSON.stringify(corps),
    headers: jeton ? { Authorization: `Bearer ${jeton}` } : {},
  })

const versAuth = (appels) => appels.filter((a) => a.url.includes('/auth/v1/'))
const majProfil = (appels) => appels.filter((a) => a.methode === 'PATCH')

test('champs : courriel nettoyé, rôle Terrain par défaut, rôle inconnu refusé', () => {
  assert.deepEqual(lireAjout({ courriel: '  Dom@Camp.TEST ', prenom: ' Dom ', nom_famille: '' }), {
    courriel: 'dom@camp.test',
    prenom: 'Dom',
    nom_famille: null,
    role: 'terrain',
  })
  assert.equal(lireAjout({ courriel: 'dom@camp.test', role: 'direction' }).role, 'direction')
  assert.ok(lireAjout({ courriel: 'pas-un-courriel' }).erreur)
  assert.ok(lireAjout({ courriel: '' }).erreur)
  assert.ok(lireAjout({ courriel: 'dom@camp.test', role: 'patron' }).erreur)
})

test('rôles permis : admin tout, direction Terrain ou Coordonnateur, les autres rien', () => {
  assert.deepEqual([...rolesCreables('admin')].sort(), ['admin', 'coordo', 'developpeur', 'direction', 'terrain'])
  assert.deepEqual([...rolesCreables('direction')].sort(), ['coordo', 'terrain'])
  for (const role of ['coordo', 'terrain', 'developpeur', null, undefined, '']) assert.deepEqual(rolesCreables(role), [], String(role))
})

test('sans session : refusé, rien n’est créé', async () => {
  const appels = simuler()
  const res = await routeUtilisateurs(requete({ courriel: 'dom@camp.test' }, null), env, 'ajouter')
  assert.equal(res.status, 403)
  assert.equal(appels.length, 0)
})

test('ni admin ni direction (ou compte désactivé) : refusé par la base, rien n’est créé', async () => {
  for (const role of ['coordo', 'terrain', 'developpeur', null]) {
    const appels = simuler({ role })
    const res = await routeUtilisateurs(requete({ courriel: 'dom@camp.test', role: 'terrain' }), env, 'ajouter')
    assert.equal(res.status, 403, String(role))
    assert.equal((await res.json()).erreur, 'Réservé aux administrateurs et à la direction.')
    assert.equal(versAuth(appels).length, 0)
    const [verif] = appels
    assert.equal(verif.url, 'https://base.test/rest/v1/rpc/role_actuel')
    assert.equal(verif.init.headers.Authorization, 'Bearer jeton-de-session', 'vérifié avec le jeton de la personne')
    assert.equal(verif.init.headers.apikey, 'sb_publishable_x', 'jamais la clé secrète pour la vérification')
    assert.equal(verif.init.headers['Content-Profile'], 'core')
  }
})

test('direction : crée un compte Terrain ou Coordonnateur', async () => {
  for (const role of ['terrain', 'coordo']) {
    const appels = simuler({ role: 'direction' })
    const res = await routeUtilisateurs(requete({ courriel: 'dom@camp.test', prenom: 'Dom', role }), env, 'ajouter')
    assert.equal(res.status, 200, role)
    assert.equal((await res.json()).role, role)
    assert.equal(majProfil(appels)[0].corps.role, role)
  }
  // Rôle absent = Terrain.
  const appels = simuler({ role: 'direction' })
  assert.equal((await routeUtilisateurs(requete({ courriel: 'dom@camp.test' }), env, 'ajouter')).status, 200)
  assert.equal(majProfil(appels)[0].corps.role, 'terrain')
})

test('direction : jamais un compte Admin, Direction ou Développeur', async () => {
  for (const role of ['admin', 'direction', 'developpeur']) {
    const appels = simuler({ role: 'direction' })
    const res = await routeUtilisateurs(requete({ courriel: 'dom@camp.test', role }), env, 'ajouter')
    assert.equal(res.status, 403, role)
    assert.match((await res.json()).erreur, /Terrain ou Coordonnateur seulement/)
    assert.equal(versAuth(appels).length, 0)
    assert.equal(majProfil(appels).length, 0)
  }
})

test('admin : crée aussi un compte Admin, Direction ou Développeur', async () => {
  for (const role of ['admin', 'direction', 'developpeur']) {
    const appels = simuler({ role: 'admin' })
    const res = await routeUtilisateurs(requete({ courriel: 'dom@camp.test', role }), env, 'ajouter')
    assert.equal(res.status, 200, role)
    assert.equal(majProfil(appels)[0].corps.role, role)
  }
})

test('admin : invitation avec la clé secrète, puis prénom, nom de famille et rôle (jamais `nom`)', async () => {
  const appels = simuler()
  const res = await routeUtilisateurs(
    requete({ courriel: ' Dom@Camp.test ', prenom: 'Dom', nom_famille: 'Tremblay', role: 'coordo' }),
    env,
    'ajouter',
  )
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, id: ID, courriel: 'dom@camp.test', role: 'coordo', courriel_envoye: true })
  const [invite] = versAuth(appels)
  assert.equal(invite.url, 'https://base.test/auth/v1/invite')
  assert.deepEqual(invite.corps, { email: 'dom@camp.test' })
  assert.equal(invite.init.headers.apikey, 'sb_secret_x')
  const [maj] = majProfil(appels)
  assert.equal(maj.url, `https://base.test/rest/v1/profils?id=eq.${ID}`)
  assert.deepEqual(maj.corps, { prenom: 'Dom', nom_famille: 'Tremblay', role: 'coordo' })
  assert.equal(maj.init.headers['Content-Profile'], 'core')
})

test('adresse déjà dans les comptes (sans égard à la casse) : 409, rien de créé', async () => {
  const appels = simuler({ profils: [{ id: ID, nom: 'Dom Tremblay', actif: true, courriel: 'DOM@camp.test' }] })
  const res = await routeUtilisateurs(requete({ courriel: 'dom@camp.test' }), env, 'ajouter')
  assert.equal(res.status, 409)
  assert.equal((await res.json()).erreur, 'Un compte existe déjà pour cette adresse (Dom Tremblay).')
  assert.equal(versAuth(appels).length, 0)
  assert.equal(majProfil(appels).length, 0)
})

test('compte désactivé : l’admin le réactive, la direction le demande à un admin', async () => {
  const profils = [{ id: ID, nom: 'Dom Tremblay', actif: false, courriel: 'dom@camp.test' }]
  simuler({ profils })
  const admin = await routeUtilisateurs(requete({ courriel: 'dom@camp.test' }), env, 'ajouter')
  assert.equal(admin.status, 409)
  assert.match((await admin.json()).erreur, /désactivé : cochez « Actif »/)
  simuler({ role: 'direction', profils })
  const direction = await routeUtilisateurs(requete({ courriel: 'dom@camp.test' }), env, 'ajouter')
  assert.equal(direction.status, 409)
  assert.match((await direction.json()).erreur, /désactivé : demandez à un administrateur de le réactiver/)
})

test('« _ » de l’adresse n’est pas un joker : une autre adresse ne bloque pas', async () => {
  const appels = simuler({ profils: [{ id: 'x', nom: 'Autre', actif: true, courriel: 'domxtremblay@camp.test' }] })
  const res = await routeUtilisateurs(requete({ courriel: 'dom_tremblay@camp.test' }), env, 'ajouter')
  assert.equal(res.status, 200)
  assert.equal(versAuth(appels).length, 1)
})

test('adresse déjà dans Supabase Auth (sans profil) : 409', async () => {
  const appels = simuler({ invite: [422, { code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' }] })
  const res = await routeUtilisateurs(requete({ courriel: 'dom@camp.test' }), env, 'ajouter')
  assert.equal(res.status, 409)
  assert.match((await res.json()).erreur, /existe déjà/)
  assert.equal(majProfil(appels).length, 0)
})

test('courriel de bienvenue en panne : compte créé quand même, adresse confirmée, sans courriel', async () => {
  for (const invite of [
    [500, { code: 500, error_code: 'unexpected_failure', msg: 'Error sending invite email' }],
    [429, { code: 429, error_code: 'over_email_send_rate_limit', msg: 'Email rate limit exceeded' }],
  ]) {
    const appels = simuler({ invite })
    const res = await routeUtilisateurs(requete({ courriel: 'dom@camp.test', prenom: 'Dom' }), env, 'ajouter')
    assert.equal(res.status, 200)
    assert.equal((await res.json()).courriel_envoye, false)
    const [, creer] = versAuth(appels)
    assert.equal(creer.url, 'https://base.test/auth/v1/admin/users')
    assert.deepEqual(creer.corps, { email: 'dom@camp.test', email_confirm: true })
    assert.equal(majProfil(appels).length, 1)
  }
})

test('autre panne de Supabase Auth : 502, pas de compte à moitié', async () => {
  const appels = simuler({ invite: [500, { code: 500, msg: 'Database error saving new user' }] })
  const res = await routeUtilisateurs(requete({ courriel: 'dom@camp.test' }), env, 'ajouter')
  assert.equal(res.status, 502)
  assert.equal(versAuth(appels).length, 1, 'pas de deuxième essai sans courriel')
  assert.equal(majProfil(appels).length, 0)
})

test('courriel invalide ou rôle inconnu : 400 ; autre chemin ou GET : 404', async () => {
  const appels = simuler()
  assert.equal((await routeUtilisateurs(requete({ courriel: 'dom' }), env, 'ajouter')).status, 400)
  assert.equal((await routeUtilisateurs(requete({ courriel: 'dom@camp.test', role: 'patron' }), env, 'ajouter')).status, 400)
  assert.equal(versAuth(appels).length, 0)
  assert.equal((await routeUtilisateurs(requete({}), env, 'supprimer')).status, 404)
  assert.equal((await routeUtilisateurs(new Request('https://app.test/api/utilisateurs/ajouter'), env, 'ajouter')).status, 404)
})

test('Worker sans clé secrète : 503', async () => {
  simuler()
  const res = await routeUtilisateurs(requete({ courriel: 'dom@camp.test' }), { ...env, SUPABASE_SECRET_KEY: '' }, 'ajouter')
  assert.equal(res.status, 503)
})
