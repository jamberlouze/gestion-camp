// Routes de la page Utilisateurs. Rôle de la personne connectée lu par la base
// (core.role_actuel() avec son jeton de session) : un admin crée n'importe quel
// rôle, la direction Terrain ou Coordonnateur seulement (rolesCreables de
// src/core/comptes.ts, la même règle que la page) ; tout autre rôle est refusé.
//
//   POST /api/utilisateurs/ajouter  {courriel, prenom, nom_famille, role}
//        Invite la personne dans Supabase Auth (courriel de bienvenue
//        supabase/templates/invitation.html, adresse confirmée d'office par
//        core.confirmer_invitation : le code par courriel marche tout de suite,
//        même sans cliquer sur le lien). Si le courriel ne peut pas partir
//        (envoi en panne, limite par heure), le compte est créé quand même,
//        adresse confirmée, sans courriel : `courriel_envoye: false`.
//        Le profil (core.profils) est créé par le déclencheur core.creer_profil ;
//        on y pose ensuite prénom, nom de famille et rôle (jamais `nom`, refait
//        par core.poser_nom_profil). Adresse déjà connue = 409, rien de créé.
//
// Secret : SUPABASE_SECRET_KEY (Cloudflare en PROD, .dev.vars en DEV).

import { rolesCreables } from '../../src/core/comptes.ts'
import { base } from '../subventions/base.js'

const json = (corps, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })

export const ROLES = rolesCreables('admin')
const COURRIEL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Rôle du compte actif lié au jeton de session (lu par la base), sinon null. */
export async function roleDe(request, env) {
  const jeton = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jeton) return null
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/role_actuel`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${jeton}`, 'Content-Profile': 'core', 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) return null
  const role = await res.json()
  return typeof role === 'string' ? role : null
}

/** Champs reçus, nettoyés ; `erreur` si un champ ne va pas. */
export function lireAjout(corps) {
  const texte = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  const courriel = texte(corps?.courriel, 254).toLowerCase()
  const role = corps?.role || 'terrain'
  if (!COURRIEL.test(courriel)) return { erreur: 'Adresse courriel invalide.' }
  if (!ROLES.includes(role)) return { erreur: 'Rôle inconnu.' }
  return { courriel, prenom: texte(corps?.prenom, 100) || null, nom_famille: texte(corps?.nom_famille, 100) || null, role }
}

export async function routeUtilisateurs(request, env, chemin) {
  if (!env.SUPABASE_SECRET_KEY) return json({ erreur: 'Le serveur n’est pas configuré.' }, 503)
  if (chemin !== 'ajouter' || request.method !== 'POST') return json({ erreur: 'introuvable' }, 404)
  try {
    const moi = await roleDe(request, env)
    const permis = rolesCreables(moi)
    if (!permis.length) return json({ erreur: 'Réservé aux administrateurs et à la direction.' }, 403)
    let corps
    try {
      corps = await request.json()
    } catch {
      return json({ erreur: 'Requête invalide.' }, 400)
    }
    const a = lireAjout(corps)
    if (a.erreur) return json({ erreur: a.erreur }, 400)
    if (!permis.includes(a.role))
      return json({ erreur: 'La direction peut créer un compte Terrain ou Coordonnateur seulement ; demandez à un administrateur.' }, 403)
    return await ajouter(env, a, moi)
  } catch (e) {
    console.error(`Utilisateurs ${chemin} :`, e)
    return json({ erreur: 'Le compte n’a pas pu être créé (erreur du serveur).' }, 502)
  }
}

async function ajouter(env, a, moi) {
  const db = base(env, 'core')
  const deja = await compteExistant(db, a.courriel)
  if (deja) return json({ erreur: messageDeja(deja, moi) }, 409)

  let { res, corps } = await auth(env, 'invite', { email: a.courriel })
  let courrielEnvoye = true
  if (!res.ok && courrielEnPanne(res, corps)) {
    // L'invitation est annulée en entier quand le courriel ne part pas : on crée
    // le compte sans courriel (la personne demandera son code sur l'app).
    console.error('Utilisateurs : courriel de bienvenue pas envoyé :', res.status, corps)
    ;({ res, corps } = await auth(env, 'admin/users', { email: a.courriel, email_confirm: true }))
    courrielEnvoye = false
  }
  if (!res.ok) {
    if (adresseDejaPrise(res, corps)) {
      const autre = await compteExistant(db, a.courriel)
      return json({ erreur: autre ? messageDeja(autre, moi) : 'Un compte existe déjà pour cette adresse dans Supabase Auth, sans ligne dans cette page.' }, 409)
    }
    throw new Error(`Supabase Auth a répondu ${res.status} : ${JSON.stringify(corps).slice(0, 300)}`)
  }

  const id = corps?.id ?? corps?.user?.id
  if (!id) throw new Error(`Réponse de Supabase Auth sans identifiant : ${JSON.stringify(corps).slice(0, 300)}`)
  try {
    await db.modifier('profils', `id=eq.${id}`, { prenom: a.prenom, nom_famille: a.nom_famille, role: a.role })
  } catch (e) {
    console.error('Utilisateurs : profil pas complété :', e)
    const qui = moi === 'admin' ? 'complétez sa ligne dans la liste' : 'demandez à un administrateur de compléter sa ligne'
    return json({ erreur: `Compte créé, mais prénom, nom de famille ou rôle pas enregistrés : ${qui}.`, id }, 502)
  }
  return json({ ok: true, id, courriel: a.courriel, role: a.role, courriel_envoye: courrielEnvoye })
}

/** Appel à l'API d'administration de Supabase Auth avec la clé secrète. */
async function auth(env, chemin, corps) {
  const cle = env.SUPABASE_SECRET_KEY
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/${chemin}`, {
    method: 'POST',
    headers: { apikey: cle, ...(cle?.startsWith('eyJ') ? { Authorization: `Bearer ${cle}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  })
  const texte = await res.text()
  let lu = null
  try {
    lu = texte ? JSON.parse(texte) : null
  } catch {
    lu = { message: texte }
  }
  return { res, corps: lu }
}

const codeAuth = (corps) => String(corps?.error_code ?? corps?.code ?? '')
const messageAuth = (corps) => String(corps?.msg ?? corps?.message ?? corps?.error_description ?? '')

const adresseDejaPrise = (res, corps) =>
  codeAuth(corps) === 'email_exists' || /already (been )?registered|already exists/i.test(messageAuth(corps)) || (res.status === 422 && !codeAuth(corps))

const courrielEnPanne = (res, corps) =>
  res.status === 429 || codeAuth(corps) === 'over_email_send_rate_limit' || (res.status >= 500 && /mail|smtp/i.test(messageAuth(corps)))

/** Profil déjà lié à cette adresse (sans égard à la casse), sinon null. */
async function compteExistant(db, courriel) {
  // `ilike` traite « _ » comme un joker : on revérifie l'égalité exacte ici.
  const lignes = await db.lire(`profils?select=id,nom,actif,courriel&courriel=ilike.${encodeURIComponent(courriel)}`)
  return (lignes ?? []).find((p) => String(p.courriel).toLowerCase() === courriel) ?? null
}

/** Seul un admin réactive un compte (« Actif » de la page). */
function messageDeja(p, moi) {
  const qui = p.nom ? ` (${p.nom})` : ''
  if (p.actif) return `Un compte existe déjà pour cette adresse${qui}.`
  const reactiver = moi === 'admin' ? 'cochez « Actif » sur sa ligne' : 'demandez à un administrateur de le réactiver'
  return `Un compte existe déjà pour cette adresse${qui}, mais il est désactivé : ${reactiver}.`
}
