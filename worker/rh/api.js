// Routes publiques du module RH (aucun compte ; plan-rh.md §4). L'anonyme
// n'a aucun droit sur le schéma rh : tout passe ici, puis par les fonctions
// rh.* appelées avec la clé secrète (service_role seulement).
//
//   GET  /api/rh/emplois            saisons ouvertes, postes et compagnies du formulaire
//   POST /api/rh/candidature        multipart : `donnees` (JSON : cle, langue, turnstile,
//        piege, reponses) + `cv`. Turnstile, champ piège, clé anti-doublon, mêmes
//        vérifications que la page (candidature.ts), CV déposé dans rh-documents,
//        puis rh.recevoir_candidature (CV retiré si la base refuse ou si c'est un doublon).
//   GET  /api/rh/retour?jeton=…     intention de retour d'une personne invitée
//   POST /api/rh/retour             {jeton, reponses} → rh.repondre_retour
//   GET  /api/rh/dossier?jeton=…    dossier d'embauche pré-rempli (jamais le NAS ni le compte)
//   POST /api/rh/dossier            multipart : `jeton`, `donnees` (JSON) et un fichier par
//        genre (specimen, cv, premiers_soins, sauveteur, piece_identite,
//        consentement_parental, photo). Mêmes vérifications que la page
//        (dossierEmbauche.ts), fichiers déposés (spécimen dans rh-paie), puis
//        rh.recevoir_dossier ; fichiers retirés si la base refuse.
//   GET  /api/rh/contrat, POST /api/rh/signer, GET|POST /api/rh/consentement
//        contrat et consentement parental signés en ligne : rh/contrats.js
//
// Routes de l'équipe (jeton de session + droit d'écrire dans RH, rh.peut_envoyer) :
//   POST /api/rh/etat        {envoi} : où partent les courriels (Mailpit, Gmail…)
//   POST /api/rh/envoyer     {courriels: [id]} : envoie des courriels préparés (rh/courriels.js)
//   POST /api/rh/connexion   {compagnie} → adresse de Google pour connecter sa boîte d'envoi
//   POST /api/rh/tester      {compagnie} : courriel d'essai de la boîte, à soi-même
//   POST /api/rh/preparer    prépare tout de suite les rappels de dossier dus
//   GET  /api/rh/retourgoogle retour de Google après la connexion (state signé)
//
// Secrets : SUPABASE_SECRET_KEY et TURNSTILE_SECRET (Cloudflare en PROD,
// .dev.vars en DEV) ; GMAIL_CLIENT_ID et GMAIL_CLIENT_SECRET pour les boîtes
// d'envoi (COURRIELS_MAILPIT en DEV).

import { aujourdhui, erreurs, lireReponses, nettoyer, TEXTES, versCandidature } from '../../src/modules/rh/candidature.ts'
import { erreursDossier, estEte, GENRES_FICHIERS, lireDossier, MESSAGES_DOSSIER, versDossier } from '../../src/modules/rh/dossierEmbauche.ts'
import { extensionDe, TAILLE_MAX_ENVOI, typeMime } from '../../src/modules/rh/fichiersPublics.ts'
import { erreursRetour, lireRetour, nettoyerRetour } from '../../src/modules/rh/retour.ts'
import { verifierTurnstile } from '../commun/turnstile.js'
import { base } from '../subventions/base.js'
import { ErreurSignature, signerConsentement, signerContrat, voirConsentement, voirContrat } from './contrats.js'
import { accuserReception, envoyerLot, ErreurCourriel, essaiBoite, modeEnvoi, preparerAutomatiques, retourGoogle, urlConnexion } from './courriels.js'
import { deposer, retirer, SEAU_DOCUMENTS, SEAU_PAIE } from './fichiers.js'

const json = (corps, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const JETON = /^[0-9a-f]{48}$/

/** Un fichier reçu dans un formulaire multipart (pas une simple valeur texte). */
const estFichier = (v) => !!v && typeof v === 'object' && typeof v.arrayBuffer === 'function' && typeof v.name === 'string'

/** Code levé par une fonction rh.* (raise exception 'CODE'), sinon null. */
function codeErreur(e) {
  const m = /"message"\s*:\s*"([A-Z_]+)(?::[^"]*)?"/.exec(String(e?.message ?? ''))
  return m ? m[1] : null
}

export async function routeRh(request, env, chemin, ctx) {
  if (!env.SUPABASE_SECRET_KEY) return json({ erreur: 'serveur' }, 503)
  const url = new URL(request.url)
  try {
    if (chemin === 'emplois' && request.method === 'GET') return json(await base(env, 'rh').rpc('formulaire_emplois'))
    if (chemin === 'candidature' && request.method === 'POST') return await recevoirCandidature(request, env, ctx)
    if (chemin === 'retour' && request.method === 'GET') return await pageRetour(url.searchParams.get('jeton') ?? '', env)
    if (chemin === 'retour' && request.method === 'POST') return await repondreRetour(request, env)
    if (chemin === 'dossier' && request.method === 'GET') return await pageDossier(url.searchParams.get('jeton') ?? '', env)
    if (chemin === 'dossier' && request.method === 'POST') return await recevoirDossier(request, env)
    if (['contrat', 'signer', 'consentement'].includes(chemin)) return await routeSignatures(request, env, url, chemin)
    if (chemin === 'retourgoogle' && request.method === 'GET') return await retourGoogle(url, env)
    if (['etat', 'envoyer', 'connexion', 'tester', 'preparer'].includes(chemin) && request.method === 'POST') return await routeEquipe(request, env, chemin)
  } catch (e) {
    console.error(`RH ${chemin} :`, e)
    return json({ erreur: 'serveur' }, 502)
  }
  return json({ erreur: 'introuvable' }, 404)
}

// ------------------------------------------------------------------
// Contrat et consentement parental (page du dossier)
// ------------------------------------------------------------------
async function routeSignatures(request, env, url, chemin) {
  try {
    if (request.method === 'GET') {
      const jeton = url.searchParams.get('jeton') ?? ''
      const id = url.searchParams.get('id') ?? ''
      if (!JETON.test(jeton) || (id && !UUID.test(id))) return json({ erreur: 'introuvable' }, 404)
      if (chemin === 'contrat' && id) return await voirContrat(env, jeton, id)
      if (chemin === 'consentement') return await voirConsentement(env, jeton, id || null, url.searchParams.get('naissance'))
      return json({ erreur: 'introuvable' }, 404)
    }
    if (request.method !== 'POST' || chemin === 'contrat') return json({ erreur: 'introuvable' }, 404)
    let corps
    try {
      corps = await request.json()
    } catch {
      return json({ erreur: 'requete' }, 400)
    }
    if (!corps || typeof corps !== 'object') return json({ erreur: 'requete' }, 400)
    const res = chemin === 'signer' ? await signerContrat(request, env, corps) : await signerConsentement(request, env, corps)
    return json(res, res.erreur ? 422 : 200)
  } catch (e) {
    if (e instanceof ErreurSignature) return json({ erreur: e.code }, e.status)
    throw e
  }
}

// ------------------------------------------------------------------
// Routes de l'équipe (session)
// ------------------------------------------------------------------

/** Personne connectée qui écrit dans RH : {ok, nom, courriel}, sinon null. */
export async function session(request, env) {
  const jeton = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jeton) return null
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/peut_envoyer`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${jeton}`, 'Content-Profile': 'rh', 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) return null
  const r = await res.json()
  return r?.ok ? r : null
}

async function routeEquipe(request, env, chemin) {
  const s = await session(request, env)
  if (!s) return json({ erreur: 'Accès refusé.' }, 403)
  let corps = {}
  try {
    corps = await request.json()
  } catch {
    // Corps vide : vérifié plus bas.
  }
  try {
    if (chemin === 'etat') return json({ envoi: modeEnvoi(env) })
    if (chemin === 'envoyer') {
      const ids = Array.isArray(corps.courriels) ? corps.courriels.filter((x) => UUID.test(String(x))).slice(0, 200) : []
      if (!ids.length) return json({ erreur: 'Aucun courriel à envoyer.' }, 400)
      return json({ resultats: await envoyerLot(env, ids, s.nom), envoi: modeEnvoi(env) })
    }
    if (chemin === 'preparer') return json({ ...(await preparerAutomatiques(env)), envoi: modeEnvoi(env) })
    if (!UUID.test(String(corps.compagnie ?? ''))) return json({ erreur: 'Compagnie inconnue.' }, 400)
    if (chemin === 'connexion') return json({ url: await urlConnexion(env, corps.compagnie, s.nom) })
    return json(await essaiBoite(env, corps.compagnie, s.courriel, s.nom))
  } catch (e) {
    if (e instanceof ErreurCourriel) return json({ erreur: e.message, code: e.code }, 409)
    throw e
  }
}

// ------------------------------------------------------------------
// Candidature (/emplois)
// ------------------------------------------------------------------
async function recevoirCandidature(request, env, ctx) {
  let form
  let corps
  try {
    form = await request.formData()
    corps = JSON.parse(String(form.get('donnees') ?? ''))
  } catch {
    return json({ erreur: 'requete' }, 400)
  }
  // Champ piège invisible : un robot le remplit. On fait comme si de rien n'était.
  if (corps?.piege) return json({ ok: true })
  const langue = corps?.langue === 'en' ? 'en' : 'fr'
  const cle = String(corps?.cle ?? '')
  if (!UUID.test(cle)) return json({ erreur: 'requete' }, 400)

  const ip = request.headers.get('CF-Connecting-IP') ?? ''
  if (!(await verifierTurnstile(env, corps.turnstile, ip))) return json({ erreur: 'robot' }, 403)

  const cv = estFichier(form.get('cv')) ? form.get('cv') : null
  const db = base(env, 'rh')
  const offre = await db.rpc('formulaire_emplois')
  const reponses = nettoyer(lireReponses(corps.reponses))
  const champs = erreurs(reponses, langue, offre, cv ? { nom: cv.name, taille: cv.size } : null)
  if (Object.keys(champs).length) return json({ erreur: 'champs', champs }, 422)

  const id = crypto.randomUUID()
  const extension = extensionDe(cv.name)
  const chemin = `candidatures/${id}.${extension}`
  await deposer(env, SEAU_DOCUMENTS, chemin, cv, typeMime(extension))
  try {
    const res = await db.rpc('recevoir_candidature', {
      p: { ...versCandidature(reponses, langue), cle, cv: { id, chemin, nom: cv.name.slice(0, 200), type_mime: typeMime(extension), taille: cv.size } },
    })
    // Même clé déjà reçue (double envoi) : la première candidature reste, ce CV-ci part.
    if (res?.deja) await retirer(env, SEAU_DOCUMENTS, [chemin])
    // Accusé de réception au candidat (après la réponse : une panne d'envoi ne bloque rien).
    else if (res?.id) {
      const accuse = accuserReception(env, res.id).catch((e) => console.error('Accusé de réception RH :', e))
      if (ctx?.waitUntil) ctx.waitUntil(accuse)
      else await accuse
    }
    return json({ ok: true })
  } catch (e) {
    await retirer(env, SEAU_DOCUMENTS, [chemin]).catch(() => {})
    // Saison fermée ou poste retiré entre la vérification et l'envoi.
    if (codeErreur(e) === 'SAISONS') return json({ erreur: 'champs', champs: { saison_ids: TEXTES[langue].une_saison } }, 422)
    if (codeErreur(e) === 'POSTES') return json({ erreur: 'champs', champs: { poste_ids: TEXTES[langue].poste_hors_saison } }, 422)
    throw e
  }
}

// ------------------------------------------------------------------
// Intention de retour (/retour/<jeton>)
// ------------------------------------------------------------------
async function pageRetour(jeton, env) {
  if (!JETON.test(jeton)) return json({ erreur: 'introuvable' }, 404)
  const page = await base(env, 'rh').rpc('retour_public', { p_jeton: jeton })
  return page ? json(page) : json({ erreur: 'introuvable' }, 404)
}

async function repondreRetour(request, env) {
  let corps
  try {
    corps = await request.json()
  } catch {
    return json({ erreur: 'requete' }, 400)
  }
  const jeton = String(corps?.jeton ?? '')
  if (!JETON.test(jeton)) return json({ erreur: 'introuvable' }, 404)
  const db = base(env, 'rh')
  const page = await db.rpc('retour_public', { p_jeton: jeton })
  if (!page) return json({ erreur: 'introuvable' }, 404)
  if (!page.modifiable) return json({ erreur: 'deja_traitee' }, 409)
  const r = nettoyerRetour(lireRetour(corps.reponses))
  const champs = erreursRetour(r, page)
  if (Object.keys(champs).length) return json({ erreur: 'champs', champs }, 422)
  try {
    await db.rpc('repondre_retour', { p_jeton: jeton, p: r })
  } catch (e) {
    if (codeErreur(e) === 'DEJA_TRAITEE') return json({ erreur: 'deja_traitee' }, 409)
    throw e
  }
  return json({ ok: true, reponse: r.reponse })
}

// ------------------------------------------------------------------
// Dossier d'embauche (/dossier/<jeton>)
// ------------------------------------------------------------------
async function pageDossier(jeton, env) {
  if (!JETON.test(jeton)) return json({ erreur: 'introuvable' }, 404)
  const page = await base(env, 'rh').rpc('dossier_public', { p_jeton: jeton })
  if (!page) return json({ erreur: 'introuvable' }, 404)
  // Identifiants internes : utiles au Worker seulement.
  delete page.personne_id
  delete page.embauche_id
  return json(page)
}

/** Erreurs de la base qui visent un champ du formulaire (filet : la page et le Worker vérifient avant). */
const m = MESSAGES_DOSSIER
const CHAMP_DE_CODE = {
  NAS_INVALIDE: ['nas', m.nas],
  NAS_REQUIS: ['nas', m.requis],
  BANQUE_INVALIDE: ['compte', m.compte],
  BANQUE_REQUISE: ['compte', m.requis],
  SPECIMEN_REQUIS: ['specimen', m.specimen],
  CV_REQUIS: ['cv', m.cv],
  ETHIQUE: ['ethique', m.ethique],
  ENTENTE: ['entente', m.entente],
  DISPONIBILITES: ['disponibilites', m.requis],
}

async function recevoirDossier(request, env) {
  let form
  let donnees
  try {
    form = await request.formData()
    donnees = JSON.parse(String(form.get('donnees') ?? ''))
  } catch {
    return json({ erreur: 'requete' }, 400)
  }
  const jeton = String(form.get('jeton') ?? '')
  if (!JETON.test(jeton)) return json({ erreur: 'introuvable' }, 404)
  const db = base(env, 'rh')
  const page = await db.rpc('dossier_public', { p_jeton: jeton })
  if (!page) return json({ erreur: 'introuvable' }, 404)
  if (page.ferme) return json({ erreur: 'ferme' }, 409)

  // Fichiers reçus ; ceux qui ne s'appliquent pas à ce dossier sont ignorés.
  const fichiers = {}
  for (const genre of GENRES_FICHIERS) {
    const f = form.get(genre)
    if (!estFichier(f)) continue
    if (genre === 'specimen' && page.genre !== 'emploi') continue
    if (genre === 'photo' && !estEte(page)) continue
    fichiers[genre] = f
  }
  const total = Object.values(fichiers).reduce((s, f) => s + f.size, 0)
  if (total > TAILLE_MAX_ENVOI) return json({ erreur: 'trop_gros' }, 413)

  const d = lireDossier(donnees)
  const tailles = Object.fromEntries(Object.entries(fichiers).map(([g, f]) => [g, { nom: f.name, taille: f.size }]))
  const champs = erreursDossier(d, page, tailles, aujourdhui())
  if (Object.keys(champs).length) return json({ erreur: 'champs', champs }, 422)

  const deposes = []
  const liste = []
  let specimen = null
  try {
    for (const [genre, f] of Object.entries(fichiers)) {
      const id = crypto.randomUUID()
      const extension = extensionDe(f.name)
      const chemin = `${page.personne_id}/${id}.${extension}`
      const seau = genre === 'specimen' ? SEAU_PAIE : SEAU_DOCUMENTS
      await deposer(env, seau, chemin, f, typeMime(extension))
      deposes.push({ seau, chemin })
      const ligne = { id, genre, chemin, nom: f.name.slice(0, 200), type_mime: typeMime(extension), taille: f.size }
      if (genre === 'specimen') specimen = ligne
      else
        liste.push({
          ...ligne,
          expire_le: genre === 'premiers_soins' ? d.expire_premiers_soins || null : genre === 'sauveteur' ? d.expire_sauveteur || null : null,
        })
    }
    const res = await db.rpc('recevoir_dossier', { p_jeton: jeton, p: { ...versDossier(d, page), specimen, fichiers: liste } })
    // Nouveau spécimen : l'ancien fichier part.
    if (res?.specimen_ancien) await retirer(env, SEAU_PAIE, [res.specimen_ancien]).catch(() => {})
    return json({ ok: true })
  } catch (e) {
    for (const x of deposes) await retirer(env, x.seau, [x.chemin]).catch(() => {})
    const code = codeErreur(e)
    if (code === 'FERME') return json({ erreur: 'ferme' }, 409)
    if (code === 'JETON') return json({ erreur: 'introuvable' }, 404)
    if (code && CHAMP_DE_CODE[code]) return json({ erreur: 'champs', champs: { [CHAMP_DE_CODE[code][0]]: CHAMP_DE_CODE[code][1] } }, 422)
    throw e
  }
}
