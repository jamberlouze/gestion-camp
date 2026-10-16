import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { modeDrive, nomCompare } from '../commun/drive.js'
import { aTourDeRole, copierVersDrive } from './copie.js'

const ENV = { SUPABASE_URL: 'https://projet.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_x' }
const GOOGLE = { ...ENV, DRIVE_CLIENT_ID: 'id', DRIVE_CLIENT_SECRET: 's', DRIVE_REFRESH_TOKEN: 'rt' }

const doc = (modif = {}) => ({
  module: 'vehicules',
  document_id: 'd1',
  seau: 'vehicules-documents',
  chemin: 'v1/d1.pdf',
  nom_fichier: 'Certificat SAAQ.pdf',
  dossiers: [
    { cle: 'racine:vehicules', id: 'RACINE' },
    { cle: 'vehicules:v1', nom: 'Disco van' },
    { cle: 'vehicules:v1:immatriculation', nom: 'Immatriculation' },
  ],
  essais: 0,
  ...modif,
})

const fetchOriginal = globalThis.fetch
afterEach(() => {
  globalThis.fetch = fetchOriginal
})

/** Réseau simulé : Supabase (file, dossiers connus, fichier) et Google Drive. */
function simuler({ aCopier = [doc()], connus = [], dossiers = {}, fichier = 200, envoi = 200 } = {}) {
  const appels = []
  let n = 0
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    const m = init.method ?? 'GET'
    let corps = init.body
    if (typeof corps === 'string' && corps.startsWith('{')) corps = JSON.parse(corps)
    appels.push({ u, m, corps, entetes: init.headers ?? {} })
    if (u.endsWith('/rest/v1/rpc/drive_a_copier')) return Response.json(aCopier)
    if (u.includes('/rest/v1/drive_dossiers') && m === 'GET') return Response.json(connus)
    if (u.includes('/rest/v1/drive_dossiers')) return Response.json([{}], { status: 201 })
    if (u.endsWith('/rest/v1/rpc/drive_noter')) return new Response(null, { status: 204 })
    if (u.includes('/storage/v1/object/authenticated/')) {
      if (fichier !== 200) return new Response('introuvable', { status: fichier })
      return new Response(new TextEncoder().encode('%PDF-essai'), { headers: { 'content-type': 'application/pdf', 'content-length': '10' } })
    }
    if (u === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'jeton' })
    if (u.startsWith('https://www.googleapis.com/drive/v3/files?') && m === 'GET') {
      const parent = new URL(u).searchParams.get('q').match(/^'([^']+)'/)[1]
      return Response.json({ files: dossiers[parent] ?? [] })
    }
    if (u.startsWith('https://www.googleapis.com/drive/v3/files?') && m === 'POST') {
      if (envoi === 404) return new Response('File not found', { status: 404 })
      return Response.json({ id: `dossier-${++n}` })
    }
    if (u.startsWith('https://www.googleapis.com/upload/drive/v3/files?')) {
      if (envoi !== 200) return new Response('File not found', { status: envoi })
      return new Response('', { headers: { location: 'https://upload.test/session' } })
    }
    if (u === 'https://upload.test/session') return Response.json({ id: 'fichier-drive' })
    throw new Error(`Appel inattendu : ${m} ${u}`)
  }
  return appels
}

const noter = (appels) => appels.filter((a) => a.u.endsWith('/rpc/drive_noter')).map((a) => a.corps)

test('mode : simulé en DEV, Google seulement avec les trois secrets DRIVE_*', () => {
  assert.equal(modeDrive({ ...GOOGLE, SUPABASE_URL: 'http://127.0.0.1:54321' }), 'simule')
  assert.equal(modeDrive(ENV), 'non_configure')
  assert.equal(modeDrive({ ...GOOGLE, DRIVE_REFRESH_TOKEN: '' }), 'non_configure')
  assert.equal(modeDrive(GOOGLE), 'google')
})

test('noms comparés sans casse, accents ni espaces en trop', () => {
  assert.equal(nomCompare('  Disco   Van '), nomCompare('disco van'))
  assert.equal(nomCompare('Étobus'), nomCompare('etobus'))
  assert.notEqual(nomCompare('Tyrex Noir'), nomCompare('Teryx Noir'))
})

test('pas configuré : rien lu, rien envoyé', async () => {
  const appels = simuler()
  assert.deepEqual(await copierVersDrive(ENV), { mode: 'non_configure', faites: 0, erreurs: 0 })
  assert.equal(appels.length, 0)
})

test('DEV : le fichier est lu dans l’app, rien ne part vers Google, la copie est notée « simule: »', async () => {
  const appels = simuler()
  const r = await copierVersDrive({ ...ENV, SUPABASE_URL: 'http://127.0.0.1:54321' })
  assert.deepEqual([r.mode, r.faites, r.erreurs], ['simule', 1, 0])
  assert.ok(!appels.some((a) => a.u.includes('googleapis')))
  assert.ok(appels.some((a) => a.u.endsWith('/storage/v1/object/authenticated/vehicules-documents/v1/d1.pdf')))
  assert.match(noter(appels)[0].p_drive_id, /^simule:/)
})

test('Google : dossier existant retrouvé par son nom, rubrique créée dessous, fichier envoyé dans le Drive partagé', async () => {
  const appels = simuler({ dossiers: { RACINE: [{ id: 'DISCO', name: 'Disco Van' }, { id: 'AUTRE', name: 'Étobus' }] } })
  const r = await copierVersDrive(GOOGLE)
  assert.deepEqual([r.mode, r.faites, r.erreurs], ['google', 1, 0])
  // Le véhicule : son dossier existant (« Disco Van ») ; la rubrique : créée dans ce dossier.
  const creations = appels.filter((a) => a.u.startsWith('https://www.googleapis.com/drive/v3/files?') && a.m === 'POST')
  assert.equal(creations.length, 1)
  assert.deepEqual(creations[0].corps, { name: 'Immatriculation', mimeType: 'application/vnd.google-apps.folder', parents: ['DISCO'] })
  assert.match(creations[0].u, /supportsAllDrives=true/)
  // Envoi : nom et parent, dans un Drive partagé, avec la taille du fichier.
  const session = appels.find((a) => a.u.startsWith('https://www.googleapis.com/upload/'))
  assert.match(session.u, /uploadType=resumable/)
  assert.match(session.u, /supportsAllDrives=true/)
  assert.deepEqual(session.corps, { name: 'Certificat SAAQ.pdf', parents: ['dossier-1'] })
  assert.equal(session.entetes['X-Upload-Content-Type'], 'application/pdf')
  assert.equal(session.entetes['X-Upload-Content-Length'], '10')
  // Dossiers gardés pour la prochaine fois (le nom du Drive pour celui retrouvé).
  const gardes = appels.filter((a) => a.u.endsWith('/rest/v1/drive_dossiers') && a.m === 'POST').map((a) => a.corps)
  assert.deepEqual(gardes, [
    { cle: 'vehicules:v1', drive_id: 'DISCO', nom: 'Disco Van' },
    { cle: 'vehicules:v1:immatriculation', drive_id: 'dossier-1', nom: 'Immatriculation' },
  ])
  assert.deepEqual(noter(appels), [{ p_module: 'vehicules', p_document: 'd1', p_drive_id: 'fichier-drive', p_erreur: null }])
  // Jamais d'effacement dans le Drive.
  assert.ok(!appels.some((a) => a.u.includes('googleapis') && ['DELETE', 'PATCH'].includes(a.m)))
})

test('Google : dossiers déjà connus → ni liste ni création ; deux documents du même dossier lisent la liste une fois', async () => {
  const connus = [
    { cle: 'vehicules:v1', drive_id: 'DISCO' },
    { cle: 'vehicules:v1:immatriculation', drive_id: 'IMMAT' },
  ]
  let appels = simuler({ connus })
  await copierVersDrive(GOOGLE)
  assert.ok(!appels.some((a) => a.u.startsWith('https://www.googleapis.com/drive/v3/files')))
  assert.deepEqual(appels.find((a) => a.u.startsWith('https://www.googleapis.com/upload/')).corps.parents, ['IMMAT'])

  appels = simuler({ aCopier: [doc(), doc({ document_id: 'd2', chemin: 'v1/d2.jpg', nom_fichier: 'Immatriculation 2026-10-16.jpg' })] })
  const r = await copierVersDrive(GOOGLE)
  assert.equal(r.faites, 2)
  assert.equal(appels.filter((a) => a.u.startsWith('https://www.googleapis.com/drive/v3/files?') && a.m === 'GET').length, 2)
  assert.equal(appels.filter((a) => a.u.startsWith('https://www.googleapis.com/drive/v3/files?') && a.m === 'POST').length, 2)
})

test('au plus 3 documents par passage', async () => {
  const appels = simuler({ aCopier: [1, 2, 3, 4, 5].map((i) => doc({ document_id: `d${i}` })) })
  const r = await copierVersDrive(GOOGLE)
  assert.equal(r.faites, 3)
  assert.equal(appels.find((a) => a.u.endsWith('/rpc/drive_a_copier')).corps.p_limite, 3)
})

test('un module à tour de rôle : l’arriéré de RH ne bloque pas les véhicules', () => {
  const lignes = [
    ...['b1', 'b2'].map((id) => doc({ module: 'batiments', document_id: id })),
    ...['r1', 'r2', 'r3'].map((id) => doc({ module: 'rh', document_id: id })),
    doc({ module: 'vehicules', document_id: 'v1' }),
  ]
  assert.deepEqual(aTourDeRole(lignes, 3).map((l) => l.document_id), ['b1', 'r1', 'v1'])
  assert.deepEqual(aTourDeRole(lignes, 5).map((l) => l.document_id), ['b1', 'r1', 'v1', 'b2', 'r2'])
  assert.deepEqual(aTourDeRole([], 3), [])
})

test('erreurs : fichier absent de l’app → notée ; dossier introuvable dans le Drive → notée et dossiers oubliés', async () => {
  let appels = simuler({ fichier: 404 })
  let r = await copierVersDrive(GOOGLE)
  assert.deepEqual([r.faites, r.erreurs], [0, 1])
  assert.match(noter(appels)[0].p_erreur, /Fichier introuvable dans l’app \(vehicules-documents, 404\)/)
  assert.ok(!appels.some((a) => a.u.startsWith('https://www.googleapis.com/upload/')))

  appels = simuler({ connus: [{ cle: 'vehicules:v1', drive_id: 'DISCO' }, { cle: 'vehicules:v1:immatriculation', drive_id: 'PARTI' }], envoi: 404 })
  r = await copierVersDrive(GOOGLE)
  assert.equal(r.erreurs, 1)
  assert.match(noter(appels)[0].p_erreur, /Google Drive a refusé l’envoi de « Certificat SAAQ\.pdf » \(404\)/)
  const oubli = appels.find((a) => a.u.includes('/rest/v1/drive_dossiers') && a.m === 'DELETE')
  assert.match(decodeURIComponent(oubli.u), /cle=in\.\("vehicules:v1","vehicules:v1:immatriculation"\)/)
})
