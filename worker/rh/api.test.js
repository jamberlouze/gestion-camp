import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { erreurs, nettoyer, REPONSES_VIDES, versCandidature } from '../../src/modules/rh/candidature.ts'
import { depuisPage, erreursDossier, lireDossier, nasValide, versDossier } from '../../src/modules/rh/dossierEmbauche.ts'
import { erreurFichier } from '../../src/modules/rh/fichiersPublics.ts'
import { erreursRetour, nettoyerRetour, RETOUR_VIDE } from '../../src/modules/rh/retour.ts'
import { routeRh } from './api.js'

const S_ETE = '11111111-1111-4111-8111-111111111111'
const S_HIVER = '22222222-2222-4222-8222-222222222222'
const P = (n) => `aaaaaaaa-0000-4000-8000-00000000000${n}`
const offre = {
  saisons: [
    { id: S_ETE, nom: 'Été 2027', genre: 'ete' },
    { id: S_HIVER, nom: 'Hiver 2027', genre: 'hiver' },
  ],
  postes: [
    { id: P(1), nom: 'Animateur - Camp d’été', compagnie: 'c', genres: ['ete'], description_url: null },
    { id: P(2), nom: 'Sauveteur plage', compagnie: 'c', genres: ['ete'], description_url: null },
    { id: P(3), nom: 'Aide de camp', compagnie: 'c', genres: ['ete'], description_url: null },
    { id: P(4), nom: 'Spécialiste escalade', compagnie: 'c', genres: ['ete'], description_url: null },
    { id: P(5), nom: 'Accompagnateur de groupe en ski', compagnie: 'c', genres: ['hiver'], description_url: null },
  ],
  compagnies: [{ id: 'c', nom: 'GBPA+' }],
}

const candidature = {
  ...REPONSES_VIDES,
  prenom: ' Léa ',
  nom_famille: 'Essai',
  courriel: 'Lea@Exemple.ca',
  telephone: '514 555-1234',
  niveau_etudes: 'cegep_cours',
  citoyennete: 'permis',
  motivation: 'J’adore le plein air.',
  saison_ids: [S_ETE],
  poste_ids: [P(1), P(2)],
  date_debut: '2027-06-01',
  francais: 'maternelle',
  anglais: 'intermediaire',
  connu_par: 'site',
  refere_par: 'Caché par la condition',
}
const cv = { nom: 'cv.pdf', taille: 120_000 }

// ------------------------------------------------------------------
// Règles pures
// ------------------------------------------------------------------
test('candidature : complète, réponses gardées avec les libellés français d’Airtable', () => {
  assert.deepEqual(erreurs(candidature, 'fr', offre, cv), {})
  const n = nettoyer(candidature)
  assert.equal(n.prenom, 'Léa')
  assert.equal(n.courriel, 'lea@exemple.ca')
  assert.equal(n.refere_par, '', 'réponse cachée par la condition')
  const c = versCandidature(n, 'en')
  assert.equal(c.reponses.citoyennete, 'Étranger·ère avec un permis de travail valide au Canada')
  assert.equal(c.reponses.niveau_etudes, 'Cégep - En cours')
  assert.equal(c.reponses.francais, 'Langue maternelle')
  assert.equal(c.reponses.connu_par, "J'ai trouvé l'offre d'emploi directement sur le site web de l'entreprise")
  assert.equal(c.reponses.langue, 'Anglais')
  assert.equal(c.reponses.refere_par, undefined)
})

test('candidature : trois postes au plus, postes de la saison, CV obligatoire', () => {
  const quatre = erreurs({ ...candidature, poste_ids: [P(1), P(2), P(3), P(4)] }, 'fr', offre, cv)
  assert.equal(quatre.poste_ids, 'Trois postes au maximum.')
  const hiver = erreurs({ ...candidature, poste_ids: [P(5)] }, 'en', offre, cv)
  assert.ok(hiver.poste_ids, 'poste d’hiver refusé pour l’été')
  assert.equal(erreurs(candidature, 'en', offre, null).cv, 'Please attach your résumé.')
  assert.ok(erreurs({ ...candidature, saison_ids: ['33333333-3333-4333-8333-333333333333'] }, 'fr', offre, cv).saison_ids, 'saison fermée')
  const vide = erreurs(REPONSES_VIDES, 'fr', offre, cv)
  for (const cle of ['prenom', 'nom_famille', 'courriel', 'telephone', 'niveau_etudes', 'citoyennete', 'motivation', 'saison_ids', 'poste_ids', 'date_debut', 'francais', 'anglais'])
    assert.ok(vide[cle], cle)
  assert.equal(vide.connu_par, undefined, 'facultatif')
})

test('fichiers : type et taille', () => {
  assert.equal(erreurFichier({ nom: 'cv.docx', taille: 10 }, 'cv'), null)
  assert.ok(erreurFichier({ nom: 'cv.docx', taille: 10 }, 'document'))
  assert.ok(erreurFichier({ nom: 'cv.exe', taille: 10 }, 'cv'))
  assert.ok(erreurFichier({ nom: 'gros.pdf', taille: 21 * 1024 * 1024 }, 'cv'))
  assert.ok(erreurFichier({ nom: 'vide.pdf', taille: 0 }, 'cv'))
  assert.ok(erreurFichier({ nom: 'cheque.docx', taille: 10 }, 'specimen'))
})

test('intention de retour : « Oui » exige saisons, postes et date ; « Non » ne garde que le commentaire', () => {
  const page = { saisons: offre.saisons, postes: offre.postes }
  assert.ok(erreursRetour(RETOUR_VIDE, page).reponse)
  const oui = erreursRetour({ ...RETOUR_VIDE, reponse: 'oui' }, page)
  assert.ok(oui.saison_ids && oui.poste_ids && oui.date_debut)
  assert.deepEqual(erreursRetour({ ...RETOUR_VIDE, reponse: 'oui', saison_ids: [S_ETE], poste_ids: [P(1)], date_debut: '2027-06-01' }, page), {})
  const non = nettoyerRetour({ reponse: 'non', saison_ids: [S_ETE], poste_ids: [P(1)], date_debut: '2027-06-01', empechements: 'x', autre: ' Merci ! ' })
  assert.deepEqual(non, { ...RETOUR_VIDE, reponse: 'non', autre: 'Merci !' })
})

test('NAS : clé de Luhn', () => {
  assert.equal(nasValide('046 454 286'), true)
  assert.equal(nasValide('046454287'), false)
  assert.equal(nasValide('12345678'), false)
})

const D1 = '44444444-4444-4444-8444-444444444444'
const pageDossier = (x = {}) => ({
  ferme: false,
  statut: 'envoyee',
  dossier_recu_le: null,
  genre: 'emploi',
  poste: 'Animateur - Camp d’été',
  compagnie: { nom: 'GBPA+', abreviation: 'GBPA+' },
  debut: '2027-05-01',
  fin: '2027-08-27',
  saison: { nom: 'Été 2027', genre: 'ete', debut: '2027-05-01', fin: '2027-08-27' },
  dates: [{ id: D1, genre: 'semaine', nom: 'Semaine 1', debut: '2027-06-27', fin: '2027-07-04', obligatoire: false, note: null }],
  personne: { prenom: 'Léa', nom_famille: 'Essai', surnom: null, courriel: 'lea@exemple.ca', telephone: '514 555-1234', date_naissance: '2005-03-02' },
  dossier: null,
  paie: { nas_fin: null, compte_fin: null, specimen: false },
  documents: [],
  disponibilites: [],
  disponibilites_note: null,
  presentation: {},
  commentaires: null,
  ethique: { id: '55555555-5555-4555-8555-555555555555', version: 1, texte: 'Je dois :' },
  ethique_accepte_le: null,
  entente: null,
  entente_acceptee_le: null,
  personne_id: '66666666-6666-4666-8666-666666666666',
  embauche_id: '77777777-7777-4777-8777-777777777777',
  ...x,
})
const dossierRempli = (page) => ({
  ...depuisPage(page),
  assurance_maladie: 'ESSL 0503 0212',
  adresse: '1 rue des Pins',
  code_postal: 'j8e 1a1',
  ville: 'Mont-Tremblant',
  province: 'QC',
  pays: 'Canada',
  etudiant_temps_plein: 'oui',
  allergies_oui: 'non',
  nas: '046 454 286',
  transit: '12345',
  institution: '815',
  compte: '1234567',
  disponibilites: [D1],
  ethique: true,
})

test('dossier : premier dossier d’un emploi (NAS, compte, spécimen et CV exigés)', () => {
  const page = pageDossier()
  const vide = erreursDossier(depuisPage(page), page, {}, '2026-10-12')
  for (const cle of ['assurance_maladie', 'adresse', 'nas', 'transit', 'institution', 'compte', 'specimen', 'cv', 'ethique', 'etudiant_temps_plein']) assert.ok(vide[cle], cle)
  const d = dossierRempli(page)
  assert.deepEqual(erreursDossier(d, page, { specimen: { nom: 'cheque.jpg', taille: 1000 }, cv: cv }, '2026-10-12'), {})
  const envoi = versDossier(d, page)
  assert.equal(envoi.nas, '046454286')
  assert.deepEqual(envoi.banque, { transit: '12345', institution: '815', compte: '1234567' })
  assert.equal(envoi.dossier.code_postal, 'J8E 1A1')
  assert.equal(envoi.ethique_texte, page.ethique.id)
  assert.deepEqual(envoi.disponibilites, [D1])
})

test('dossier : fiche médicale facultative, pré-remplie l’année suivante', () => {
  const page = pageDossier()
  const d = dossierRempli(page)
  assert.equal(d.auto_injecteur, '')
  assert.equal(versDossier(d, page).dossier.auto_injecteur, null)
  const envoi = versDossier({ ...d, sante_conditions: ' Asthme ', medicaments: 'Ventolin', auto_injecteur: 'oui', sante_notes: '' }, page)
  assert.equal(envoi.dossier.sante_conditions, 'Asthme')
  assert.equal(envoi.dossier.medicaments, 'Ventolin')
  assert.equal(envoi.dossier.auto_injecteur, true)
  assert.equal(versDossier({ ...d, auto_injecteur: 'non' }, page).dossier.auto_injecteur, false)
  const ancien = depuisPage(pageDossier({ dossier: { sante_conditions: 'Asthme', auto_injecteur: false } }))
  assert.equal(ancien.sante_conditions, 'Asthme')
  assert.equal(ancien.auto_injecteur, 'non')
  // Une réponse inconnue ne passe pas pour un oui.
  assert.equal(versDossier(lireDossier({ ...d, auto_injecteur: 'peut-être' }), page).dossier.auto_injecteur, null)
})

test('dossier : un ancien garde son NAS et son compte (jamais réaffichés) sauf s’il les change', () => {
  const page = pageDossier({ paie: { nas_fin: '286', compte_fin: '567', specimen: true }, documents: [{ genre: 'cv', nom: 'cv.pdf', le: '2026-01-01' }] })
  const d = { ...dossierRempli(page), nas: '', transit: '', institution: '', compte: '' }
  assert.deepEqual(erreursDossier(d, page, {}, '2026-10-12'), {})
  const envoi = versDossier(d, page)
  assert.equal(envoi.nas, null)
  assert.equal(envoi.banque, null)
  // Nouveau compte : nouveau spécimen exigé.
  const change = erreursDossier({ ...d, changer_banque: true, transit: '54321', institution: '006', compte: '7654321' }, page, {}, '2026-10-12')
  assert.ok(change.specimen)
})

test('dossier : bénévole hors été (pas de paie, entente exigée, ni t-shirt ni présentation)', () => {
  const page = pageDossier({
    genre: 'benevolat',
    paie: null,
    saison: { nom: 'Hiver 2027', genre: 'hiver', debut: null, fin: null },
    dates: [],
    entente: { id: '88888888-8888-4888-8888-888888888888', version: 1, texte: '- Je donne mon temps.' },
  })
  const d = { ...dossierRempli(page), nas: '', taille_tshirt: 'M', campeur: '3 ans', disponibilites: [] }
  const e = erreursDossier(d, page, { cv }, '2026-10-12')
  assert.deepEqual(Object.keys(e), ['entente'])
  const envoi = versDossier({ ...d, entente: true }, page)
  assert.equal(envoi.nas, null)
  assert.equal(envoi.banque, null)
  assert.equal(envoi.entente_texte, page.entente.id)
  assert.equal(envoi.dossier.taille_tshirt, '')
  assert.deepEqual(envoi.presentation, {})
})

// ------------------------------------------------------------------
// Routes, réseau simulé
// ------------------------------------------------------------------
const fetchOriginal = globalThis.fetch
afterEach(() => {
  globalThis.fetch = fetchOriginal
})

const env = { SUPABASE_URL: 'https://base.test', SUPABASE_SECRET_KEY: 'sb_secret_x', TURNSTILE_SECRET: 'secret' }

/** Réseau simulé : `rpc` = réponses des fonctions rh.* (valeur, ou fonction(corps) qui rend une valeur ou lève). */
function simuler({ turnstile = true, rpc = {} } = {}) {
  const appels = []
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    appels.push({ url: u, init, methode: init.method ?? 'GET' })
    if (u.includes('turnstile')) return Response.json({ success: turnstile })
    const m = /\/rest\/v1\/rpc\/(\w+)$/.exec(u)
    if (m) {
      const r = m[1] in rpc ? rpc[m[1]] : m[1] === 'formulaire_emplois' ? offre : undefined
      if (r === undefined) throw new Error(`Appel inattendu : ${u}`)
      try {
        return Response.json(typeof r === 'function' ? r(JSON.parse(init.body)) : r)
      } catch (e) {
        return new Response(JSON.stringify({ code: 'P0001', message: e.message }), { status: 400 })
      }
    }
    if (u.includes('/storage/v1/object/')) return Response.json({ Key: 'ok' })
    // Lectures de tables (accusé de réception) : rien, donc pas de courriel.
    if (u.includes('/rest/v1/') && (init.method ?? 'GET') === 'GET') return Response.json([])
    throw new Error(`Appel inattendu : ${u}`)
  }
  return appels
}

const depots = (appels) => appels.filter((a) => a.url.includes('/storage/v1/object/') && a.methode === 'POST').map((a) => a.url.replace('https://base.test/storage/v1/object/', ''))
const retraits = (appels) => appels.filter((a) => a.methode === 'DELETE').flatMap((a) => JSON.parse(a.init.body).prefixes)
const rpcs = (appels, nom) => appels.filter((a) => a.url.endsWith(`/rpc/${nom}`)).map((a) => JSON.parse(a.init.body))

function requeteCandidature(donnees, fichier = new File(['%PDF-1.4'], 'Mon CV.pdf', { type: 'application/pdf' })) {
  const fd = new FormData()
  fd.set('donnees', JSON.stringify(donnees))
  if (fichier) fd.set('cv', fichier)
  return new Request('https://app.test/api/rh/candidature', { method: 'POST', body: fd, headers: { 'CF-Connecting-IP': '1.2.3.4' } })
}

test('candidature : Turnstile refusé → 403, rien de déposé ni d’enregistré', async () => {
  const appels = simuler({ turnstile: false })
  const res = await routeRh(requeteCandidature({ cle: crypto.randomUUID(), turnstile: 'x', reponses: candidature }), env, 'candidature')
  assert.equal(res.status, 403)
  assert.equal(depots(appels).length, 0)
  assert.equal(rpcs(appels, 'recevoir_candidature').length, 0)
})

test('candidature : le champ piège fait semblant de réussir', async () => {
  const appels = simuler()
  const res = await routeRh(requeteCandidature({ cle: crypto.randomUUID(), piege: 'http://spam', reponses: candidature }), env, 'candidature')
  assert.equal(res.status, 200)
  assert.equal(appels.length, 0)
})

test('candidature : quatre postes ou pas de CV → 422, rien de déposé', async () => {
  const appels = simuler()
  const quatre = await routeRh(requeteCandidature({ cle: crypto.randomUUID(), turnstile: 'x', reponses: { ...candidature, poste_ids: [P(1), P(2), P(3), P(4)] } }), env, 'candidature')
  assert.equal(quatre.status, 422)
  assert.equal((await quatre.json()).champs.poste_ids, 'Trois postes au maximum.')
  const sansCv = await routeRh(requeteCandidature({ cle: crypto.randomUUID(), turnstile: 'x', reponses: candidature }, null), env, 'candidature')
  assert.equal(sansCv.status, 422)
  assert.ok((await sansCv.json()).champs.cv)
  assert.equal(depots(appels).length, 0)
})

test('candidature : CV déposé dans le seau privé, puis rh.recevoir_candidature avec la clé', async () => {
  const appels = simuler({ rpc: { recevoir_candidature: { id: 'x', deja: false } } })
  const cle = crypto.randomUUID()
  const res = await routeRh(requeteCandidature({ cle, langue: 'fr', turnstile: 'x', reponses: candidature }), env, 'candidature')
  assert.equal(res.status, 200)
  const [depot] = depots(appels)
  assert.match(depot, /^rh-documents\/candidatures\/[0-9a-f-]{36}\.pdf$/)
  const [{ p }] = rpcs(appels, 'recevoir_candidature')
  assert.equal(p.cle, cle)
  assert.equal(p.courriel, 'lea@exemple.ca')
  assert.equal(p.cv.chemin, depot.replace('rh-documents/', ''))
  assert.equal(p.cv.nom, 'Mon CV.pdf')
  assert.equal(p.cv.type_mime, 'application/pdf')
  assert.equal(p.reponses.citoyennete, 'Étranger·ère avec un permis de travail valide au Canada')
  assert.deepEqual(p.poste_ids, [P(1), P(2)])
  assert.equal(retraits(appels).length, 0)
  const rpc = appels.find((a) => a.url.endsWith('/rpc/recevoir_candidature'))
  assert.equal(rpc.init.headers.apikey, 'sb_secret_x')
})

test('candidature : double envoi (même clé) ou refus de la base → le CV déposé est retiré', async () => {
  const deja = simuler({ rpc: { recevoir_candidature: { id: 'x', deja: true } } })
  assert.equal((await routeRh(requeteCandidature({ cle: crypto.randomUUID(), turnstile: 'x', reponses: candidature }), env, 'candidature')).status, 200)
  assert.deepEqual(retraits(deja), depots(deja).map((d) => d.replace('rh-documents/', '')))
  const refus = simuler({
    rpc: {
      recevoir_candidature: () => {
        throw new Error('POSTES')
      },
    },
  })
  const res = await routeRh(requeteCandidature({ cle: crypto.randomUUID(), turnstile: 'x', reponses: candidature }), env, 'candidature')
  assert.equal(res.status, 422)
  assert.equal(retraits(refus).length, 1)
})

// ------------------------------------------------------------------
const JETON = 'ab'.repeat(24)
const pageRetour = { saisons: offre.saisons, postes: offre.postes, modifiable: true, reponse: null }

test('retour : jeton mal formé → 404 sans appel à la base', async () => {
  const appels = simuler()
  const res = await routeRh(new Request('https://app.test/api/rh/retour?jeton=abc'), env, 'retour')
  assert.equal(res.status, 404)
  assert.equal(appels.length, 0)
})

test('retour : réponse enregistrée ; déjà traitée → 409', async () => {
  const appels = simuler({ rpc: { retour_public: pageRetour, repondre_retour: { ok: true } } })
  const corps = { jeton: JETON, reponses: { reponse: 'oui', saison_ids: [S_ETE], poste_ids: [P(1)], date_debut: '2027-06-01', empechements: '', autre: '' } }
  const req = () => new Request('https://app.test/api/rh/retour', { method: 'POST', body: JSON.stringify(corps) })
  assert.equal((await routeRh(req(), env, 'retour')).status, 200)
  const [{ p_jeton, p }] = rpcs(appels, 'repondre_retour')
  assert.equal(p_jeton, JETON)
  assert.deepEqual(p.poste_ids, [P(1)])
  simuler({ rpc: { retour_public: { ...pageRetour, modifiable: false } } })
  assert.equal((await routeRh(req(), env, 'retour')).status, 409)
  simuler({ rpc: { retour_public: null } })
  assert.equal((await routeRh(req(), env, 'retour')).status, 404)
})

// ------------------------------------------------------------------
test('dossier : la page ne reçoit jamais les identifiants internes', async () => {
  simuler({ rpc: { dossier_public: pageDossier() } })
  const res = await routeRh(new Request(`https://app.test/api/rh/dossier?jeton=${JETON}`), env, 'dossier')
  const page = await res.json()
  assert.equal(page.personne_id, undefined)
  assert.equal(page.embauche_id, undefined)
  assert.equal(page.genre, 'emploi')
})

function requeteDossier(donnees, fichiers = {}) {
  const fd = new FormData()
  fd.set('jeton', JETON)
  fd.set('donnees', JSON.stringify(donnees))
  for (const [g, f] of Object.entries(fichiers)) fd.set(g, f)
  return new Request('https://app.test/api/rh/dossier', { method: 'POST', body: fd })
}
const fichier = (nom, type = 'application/pdf') => new File(['contenu'], nom, { type })

test('dossier : fermé (complet) → 409, rien de déposé', async () => {
  const appels = simuler({ rpc: { dossier_public: { ferme: true, statut: 'complete', prenom: 'Léa' } } })
  const res = await routeRh(requeteDossier(dossierRempli(pageDossier()), { cv: fichier('cv.pdf') }), env, 'dossier')
  assert.equal(res.status, 409)
  assert.equal(depots(appels).length, 0)
})

test('dossier : incomplet → 422, rien de déposé', async () => {
  const appels = simuler({ rpc: { dossier_public: pageDossier() } })
  const res = await routeRh(requeteDossier({ ...dossierRempli(pageDossier()), nas: '123456789' }, { cv: fichier('cv.pdf'), specimen: fichier('cheque.jpg', 'image/jpeg') }), env, 'dossier')
  assert.equal(res.status, 422)
  assert.ok((await res.json()).champs.nas)
  assert.equal(depots(appels).length, 0)
})

test('dossier : fichiers déposés (spécimen dans rh-paie), puis rh.recevoir_dossier ; l’ancien spécimen part', async () => {
  const page = pageDossier()
  const appels = simuler({ rpc: { dossier_public: page, recevoir_dossier: { ok: true, specimen_ancien: `${page.personne_id}/ancien.jpg` } } })
  const d = { ...dossierRempli(page), expire_premiers_soins: '2028-04-30' }
  const res = await routeRh(
    requeteDossier(d, { cv: fichier('CV.PDF'), specimen: fichier('cheque.jpg', 'image/jpeg'), premiers_soins: fichier('carte.png', 'image/png') }),
    env,
    'dossier',
  )
  assert.equal(res.status, 200)
  const lieux = depots(appels)
  assert.equal(lieux.filter((x) => x.startsWith(`rh-paie/${page.personne_id}/`)).length, 1)
  assert.equal(lieux.filter((x) => x.startsWith(`rh-documents/${page.personne_id}/`)).length, 2)
  const [{ p_jeton, p }] = rpcs(appels, 'recevoir_dossier')
  assert.equal(p_jeton, JETON)
  assert.equal(p.nas, '046454286')
  assert.match(p.specimen.chemin, new RegExp(`^${page.personne_id}/[0-9a-f-]{36}\\.jpg$`))
  assert.deepEqual(p.fichiers.map((f) => f.genre).sort(), ['cv', 'premiers_soins'])
  assert.equal(p.fichiers.find((f) => f.genre === 'premiers_soins').expire_le, '2028-04-30')
  assert.equal(p.fichiers.find((f) => f.genre === 'cv').chemin.endsWith('.pdf'), true)
  assert.deepEqual(retraits(appels), [`${page.personne_id}/ancien.jpg`])
})

test('dossier : la base refuse → les fichiers déposés sont retirés', async () => {
  const page = pageDossier()
  const appels = simuler({
    rpc: {
      dossier_public: page,
      recevoir_dossier: () => {
        throw new Error('NAS_INVALIDE')
      },
    },
  })
  const res = await routeRh(requeteDossier(dossierRempli(page), { cv: fichier('cv.pdf'), specimen: fichier('cheque.pdf') }), env, 'dossier')
  assert.equal(res.status, 422)
  assert.ok((await res.json()).champs.nas)
  assert.deepEqual(retraits(appels).sort(), depots(appels).map((x) => x.replace(/^rh-(documents|paie)\//, '')).sort())
})

test('dossier : bénévole, un spécimen envoyé quand même est ignoré', async () => {
  const page = pageDossier({ genre: 'benevolat', paie: null })
  const appels = simuler({ rpc: { dossier_public: page, recevoir_dossier: { ok: true, specimen_ancien: null } } })
  const res = await routeRh(requeteDossier(dossierRempli(page), { cv: fichier('cv.pdf'), specimen: fichier('cheque.pdf') }), env, 'dossier')
  assert.equal(res.status, 200)
  assert.equal(depots(appels).filter((x) => x.startsWith('rh-paie/')).length, 0)
  const [{ p }] = rpcs(appels, 'recevoir_dossier')
  assert.equal(p.specimen, null)
  assert.equal(p.nas, null)
})
