// Courriels du module RH (plan-rh.md §5), côté Worker :
// - envoyer un courriel préparé (seul le Worker envoie) : de la boîte de sa
//   compagnie par l'API Gmail (jeton d'actualisation chiffré dans la base,
//   rh.jeton_boite), ou dans Mailpit en DEV ;
// - connecter la boîte d'une compagnie (OAuth Google : envoi seulement +
//   adresse, vérifiée contre l'adresse d'envoi réglée dans l'app) ;
// - préparer seul l'accusé de réception d'une candidature, les rappels de
//   dossier dus et le résumé quotidien (cron), et envoyer ceux dont le
//   modèle est en mode automatique.
//
// Règles et rendu : src/modules/rh/courriels.ts (commun avec l'app).
// Secrets : GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET (client OAuth Google) ;
// en DEV, COURRIELS_MAILPIT (.dev.vars).

import { champsCourriel, compagnieDeCandidature, listeNouveautes, modeDuGenre, modelePour, rendreCourriel, versHtml, versTexte } from '../../src/modules/rh/courriels.ts'
import { envoyerGmail, envoyerMailpit } from '../commun/courriel.js'
import { signer, verifier } from '../commun/etat.js'
import { base } from '../subventions/base.js'

export class ErreurCourriel extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const un = (l) => (Array.isArray(l) ? (l[0] ?? null) : null)
const racinePublique = (env) => (env.HOTE_EMPLOIS ? `https://${env.HOTE_EMPLOIS}` : env.APP_URL)
const jourMontreal = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montreal' }).format(d)
const heureMontreal = (d = new Date()) => Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montreal', hour: '2-digit', hour12: false }).format(d)) % 24

/** Où partent les courriels : Mailpit (DEV), Gmail (PROD), ou nulle part. */
export function modeEnvoi(env) {
  if (env.COURRIELS_MAILPIT) return 'mailpit'
  if (/127\.0\.0\.1|localhost/.test(env.SUPABASE_URL ?? '')) return 'bloque'
  return env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET ? 'gmail' : 'non_configure'
}

/** Réglages, modèles et compagnies (avec le nom du référentiel). */
async function contexte(env) {
  const db = base(env, 'rh')
  const [reglages, modeles, compagnies, entreprises] = await Promise.all([
    db.lire('reglages?select=cle,valeur'),
    db.lire('modeles_courriels?select=*'),
    db.lire('compagnies?select=*'),
    base(env, 'core').lire('entreprises?select=id,nom,abreviation'),
  ])
  const r = Object.fromEntries((reglages ?? []).map((x) => [x.cle, x.valeur]))
  const noms = new Map((entreprises ?? []).map((e) => [e.id, e.nom]))
  const parCompagnie = new Map((compagnies ?? []).map((c) => [c.entreprise_id, { ...c, nom: noms.get(c.entreprise_id) ?? '' }]))
  return { db, r, modeles: modeles ?? [], parCompagnie, entreprises: entreprises ?? [] }
}

// ------------------------------------------------------------------
// Envoyer
// ------------------------------------------------------------------

/** Envoie un courriel préparé, de la boîte de sa compagnie. */
export async function envoyerCourriel(env, id, auteur) {
  const db = base(env, 'rh')
  const c = un(await db.lire(`courriels?id=eq.${id}&select=*`))
  if (!c) throw new ErreurCourriel('introuvable', 'Courriel introuvable.')
  if (c.statut !== 'prepare') throw new ErreurCourriel('deja', c.statut === 'envoye' ? 'Ce courriel est déjà parti.' : 'Ce courriel est annulé.')
  if (!c.a?.length) throw new ErreurCourriel('destinataire', 'Ajoutez au moins un destinataire.')
  if (/\[\w+ \?\]/.test(`${c.sujet}\n${c.corps}`)) throw new ErreurCourriel('champ', 'Un champ du courriel est resté vide (« [champ ?] ») : corrigez le texte avant l’envoi.')
  const mode = modeEnvoi(env)
  if (mode === 'bloque') throw new ErreurCourriel('configuration', 'Base locale : les courriels partent seulement dans Mailpit (COURRIELS_MAILPIT dans .dev.vars).')
  if (mode === 'non_configure') throw new ErreurCourriel('configuration', 'Gmail n’est pas configuré (secrets GMAIL_CLIENT_ID et GMAIL_CLIENT_SECRET).')
  const compagnie = c.entreprise_id ? un(await db.lire(`compagnies?entreprise_id=eq.${c.entreprise_id}&select=*`)) : null
  if (!compagnie?.adresse_envoi) throw new ErreurCourriel('boite', 'Aucune adresse d’envoi pour cette compagnie (Courriels › Compagnies).')

  const message = {
    de: compagnie.adresse_envoi,
    nomDe: compagnie.nom_expediteur ?? '',
    a: c.a,
    sujet: c.sujet,
    texte: versTexte(c.corps),
    html: versHtml(c.corps),
  }
  let messageId
  try {
    if (mode === 'mailpit') messageId = await envoyerMailpit(env, message)
    else {
      const boite = await db.rpc('jeton_boite', { p_entreprise: c.entreprise_id })
      if (!boite?.jeton) throw new ErreurCourriel('boite', `La boîte ${compagnie.adresse_envoi} n’est pas connectée (Courriels › Compagnies).`)
      if (boite.adresse.toLowerCase() !== compagnie.adresse_envoi.toLowerCase())
        throw new ErreurCourriel('boite', `La boîte connectée (${boite.adresse}) n’est plus l’adresse d’envoi (${compagnie.adresse_envoi}) : reconnectez-la.`)
      try {
        messageId = await envoyerGmail(env, message, boite.jeton)
        await db.rpc('noter_boite', { p_entreprise: c.entreprise_id, p_erreur: null })
      } catch (e) {
        await db.rpc('noter_boite', { p_entreprise: c.entreprise_id, p_erreur: e.message }).catch(() => {})
        throw e.code === 'reconnecter' ? new ErreurCourriel('boite', `Google refuse la boîte ${compagnie.adresse_envoi} : reconnectez-la (Courriels › Compagnies).`) : e
      }
    }
  } catch (e) {
    await db.modifier('courriels', `id=eq.${id}`, { erreur: String(e.message ?? e).slice(0, 500) }).catch(() => {})
    throw e
  }
  await db.rpc('courriel_envoye', { p_courriel: id, p_message_id: messageId, p_par: auteur ?? null, p_mailpit: mode === 'mailpit' })
  return { ok: true, mode }
}

/** Envoie plusieurs courriels ; rend le résultat de chacun. */
export async function envoyerLot(env, ids, auteur) {
  const res = []
  for (const id of ids) {
    try {
      res.push({ id, ...(await envoyerCourriel(env, id, auteur)) })
    } catch (e) {
      res.push({ id, ok: false, erreur: e.message })
    }
  }
  return res
}

// ------------------------------------------------------------------
// Préparer seul : accusé, rappels, résumé
// ------------------------------------------------------------------

/** Ajoute des courriels préparés (sans doublon) puis envoie ceux du mode automatique. */
async function ajouter(env, ctx, courriels) {
  if (!courriels.length) return { prepares: 0, envoyes: 0 }
  const ajoutes = (await ctx.db.rpc('courriels_ajouter', { p_courriels: courriels })) ?? []
  let envoyes = 0
  for (const c of ajoutes) {
    if (modeDuGenre(ctx.modeles, c.genre) !== 'automatique') continue
    try {
      await envoyerCourriel(env, c.id, 'Envoi automatique')
      envoyes++
    } catch (e) {
      // L'erreur reste sur le courriel ; il est à envoyer à la main.
      console.error(`Courriel RH ${c.id} non envoyé :`, e.message)
    }
  }
  return { prepares: ajoutes.length, envoyes }
}

/** Accusé de réception d'une candidature reçue par le formulaire public. */
export async function accuserReception(env, candidatureId) {
  const ctx = await contexte(env)
  if (modeDuGenre(ctx.modeles, 'accuse') === 'desactive') return { prepares: 0, envoyes: 0 }
  const c = un(await ctx.db.lire(`candidatures?id=eq.${candidatureId}&select=id,personne_id,entreprise_id,saison_ids,poste_ids,reponses`))
  if (!c) return { prepares: 0, envoyes: 0 }
  const [p, saisons, postes] = await Promise.all([
    ctx.db.lire(`personnes?id=eq.${c.personne_id}&select=prenom,surnom,courriel`).then(un),
    c.saison_ids.length ? ctx.db.lire(`saisons?id=in.(${c.saison_ids.join(',')})&select=nom,rang,debut&order=debut.nullslast,rang`) : [],
    c.poste_ids.length ? ctx.db.lire(`postes?id=in.(${c.poste_ids.join(',')})&select=id,nom,entreprise_id`) : [],
  ])
  if (!p?.courriel) return { prepares: 0, envoyes: 0 }
  const entreprise = compagnieDeCandidature(c, postes)
  const m = modelePour(ctx.modeles, 'accuse', entreprise)
  if (!m) return { prepares: 0, envoyes: 0 }
  const langue = c.reponses?.langue === 'Anglais' ? 'en' : 'fr'
  const champs = champsCourriel({
    personne: p,
    compagnie: ctx.parCompagnie.get(entreprise) ?? undefined,
    saisons: saisons.map((s) => s.nom),
    postes: postes.map((x) => x.nom),
    langue,
  })
  const rendu = rendreCourriel(m, langue, champs)
  return ajouter(env, ctx, [
    { genre: 'accuse', cle: `accuse:${c.id}`, personne_id: c.personne_id, candidature_id: c.id, entreprise_id: entreprise, a: [p.courriel], ...rendu },
  ])
}

/**
 * Cron : rappels de dossier dus et résumé quotidien. Rien pour ce qui
 * précède le réglage « courriels_depuis » (données importées).
 */
export async function preparerAutomatiques(env, maintenant = new Date()) {
  const ctx = await contexte(env)
  const depuis = ctx.r.courriels_depuis
  if (!depuis) return { prepares: 0, envoyes: 0 }
  const nouveaux = []

  // Rappels de dossier incomplet.
  if (modeDuGenre(ctx.modeles, 'rappel_dossier') !== 'desactive') {
    const dus = (await ctx.db.rpc('rappels_dus', { p_jours: Number(ctx.r.rappel_jours ?? 7), p_depuis: depuis })) ?? []
    for (const e of dus) {
      const m = modelePour(ctx.modeles, 'rappel_dossier', e.entreprise_id)
      if (!m) continue
      const champs = champsCourriel({
        personne: e,
        compagnie: ctx.parCompagnie.get(e.entreprise_id) ?? undefined,
        saison: e.saison,
        poste: e.poste,
        lienDossier: `${racinePublique(env)}/dossier/${e.jeton}`,
      })
      nouveaux.push({
        genre: 'rappel_dossier',
        cle: `rappel:${e.embauche_id}`,
        personne_id: e.personne_id,
        candidature_id: e.candidature_id,
        embauche_id: e.embauche_id,
        entreprise_id: e.entreprise_id,
        a: [e.courriel],
        ...rendreCourriel(m, 'fr', champs),
      })
    }
  }

  // Résumé quotidien à la direction, pendant l'heure réglée (Montréal) ; rien
  // de nouveau = pas de résumé ce jour-là. Nouveautés depuis le résumé d'avant.
  const jour = jourMontreal(maintenant)
  const destinataires = Array.isArray(ctx.r.resume_destinataires) ? ctx.r.resume_destinataires.filter(Boolean) : []
  if (modeDuGenre(ctx.modeles, 'resume') !== 'desactive' && destinataires.length && heureMontreal(maintenant) === Number(ctx.r.resume_heure ?? 7)) {
    const deja = un(await ctx.db.lire(`courriels?cle=eq.resume:${jour}&select=id`))
    if (!deja) {
      const avant = un(await ctx.db.lire('courriels?genre=eq.resume&select=cree_le&order=cree_le.desc&limit=1'))
      const dernier = avant?.cree_le ?? new Date(maintenant.getTime() - 86_400_000).toISOString()
      const liste = listeNouveautes(await ctx.db.rpc('nouveautes', { p_depuis: dernier }))
      // Compagnie qui envoie le résumé : la GBPA+ (ou la première qui a une adresse).
      const gbpa = ctx.entreprises.find((x) => x.abreviation === 'GBPA+' || x.nom === 'GBPA+')?.id
      const compagnie = (gbpa && ctx.parCompagnie.get(gbpa)?.adresse_envoi ? gbpa : null) ?? [...ctx.parCompagnie.values()].find((x) => x.adresse_envoi)?.entreprise_id
      const m = modelePour(ctx.modeles, 'resume', compagnie ?? null)
      if (liste && m && compagnie) {
        nouveaux.push({
          genre: 'resume',
          cle: `resume:${jour}`,
          entreprise_id: compagnie,
          a: destinataires,
          ...rendreCourriel(m, 'fr', champsCourriel({ liste, lienApp: `${env.APP_URL}/rh`, compagnie: ctx.parCompagnie.get(compagnie) })),
        })
      }
    }
  }
  return ajouter(env, ctx, nouveaux)
}

// ------------------------------------------------------------------
// Connexion d'une boîte (OAuth Google)
// ------------------------------------------------------------------

const GOOGLE = {
  autoriser: 'https://accounts.google.com/o/oauth2/v2/auth',
  jetons: 'https://oauth2.googleapis.com/token',
}
const PORTEE = 'openid email https://www.googleapis.com/auth/gmail.send'
const urlRetour = (env) => `${env.APP_URL}/api/rh/retourgoogle`

/** Adresse de Google où la personne autorise l'envoi depuis la boîte de la compagnie. */
export async function urlConnexion(env, entrepriseId, nom) {
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET) throw new ErreurCourriel('configuration', 'Gmail n’est pas configuré (secrets GMAIL_CLIENT_ID et GMAIL_CLIENT_SECRET).')
  const compagnie = un(await base(env, 'rh').lire(`compagnies?entreprise_id=eq.${entrepriseId}&select=adresse_envoi`))
  if (!compagnie?.adresse_envoi) throw new ErreurCourriel('boite', 'Inscrivez d’abord l’adresse d’envoi de la compagnie.')
  const p = new URLSearchParams({
    client_id: env.GMAIL_CLIENT_ID,
    redirect_uri: urlRetour(env),
    response_type: 'code',
    scope: PORTEE,
    access_type: 'offline',
    prompt: 'consent',
    login_hint: compagnie.adresse_envoi,
    state: await signer(env, 'gmail-rh', { e: entrepriseId, n: nom }),
  })
  return `${GOOGLE.autoriser}?${p}`
}

/** Adresse courriel d'un id_token de Google (reçu directement de Google). */
function courrielDuJeton(idToken) {
  try {
    const corps = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(corps + '==='.slice((corps.length + 3) % 4)), (c) => c.charCodeAt(0)))).email ?? null
  } catch {
    return null
  }
}

/** Retour de Google : garde le jeton si la boîte autorisée est bien l'adresse d'envoi. */
export async function retourGoogle(url, env) {
  const page = (p) => Response.redirect(`${env.APP_URL}/rh/courriels?vue=compagnies&${new URLSearchParams(p)}`, 302)
  const etat = await verifier(env, 'gmail-rh', url.searchParams.get('state'))
  if (!etat) return page({ boite: 'erreur', message: 'Lien de connexion expiré : recommencez.' })
  if (url.searchParams.get('error')) return page({ boite: 'erreur', message: `Connexion refusée par Google (${url.searchParams.get('error')}).` })
  const code = url.searchParams.get('code')
  if (!code) return page({ boite: 'erreur', message: 'Réponse incomplète de Google.' })
  try {
    const res = await fetch(GOOGLE.jetons, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET, redirect_uri: urlRetour(env), grant_type: 'authorization_code' }),
    })
    const r = await res.json().catch(() => ({}))
    if (!res.ok) return page({ boite: 'erreur', message: `Google a refusé : ${r.error_description ?? r.error ?? res.status}.` })
    if (!r.refresh_token) return page({ boite: 'erreur', message: 'Google n’a pas donné d’accès durable : retirez l’app des accès du compte Google, puis recommencez.' })
    const courriel = courrielDuJeton(r.id_token ?? '')
    const db = base(env, 'rh')
    const compagnie = un(await db.lire(`compagnies?entreprise_id=eq.${etat.e}&select=adresse_envoi`))
    if (!courriel || courriel.toLowerCase() !== (compagnie?.adresse_envoi ?? '').toLowerCase())
      return page({ boite: 'erreur', message: `Vous avez autorisé ${courriel ?? 'une autre boîte'} ; il faut autoriser ${compagnie?.adresse_envoi}.`, compagnie: etat.e })
    await db.rpc('enregistrer_boite', { p_entreprise: etat.e, p_adresse: courriel, p_jeton: r.refresh_token, p_par: etat.n ?? null })
    return page({ boite: 'ok', compagnie: etat.e })
  } catch (e) {
    console.error('Connexion Gmail RH :', e)
    return page({ boite: 'erreur', message: 'Connexion impossible pour le moment.' })
  }
}

/** Courriel d'essai depuis la boîte d'une compagnie (vers la personne connectée). */
export async function essaiBoite(env, entrepriseId, destinataire, nom) {
  if (!destinataire) throw new ErreurCourriel('destinataire', 'Votre compte n’a pas de courriel.')
  const db = base(env, 'rh')
  const compagnie = un(await db.lire(`compagnies?entreprise_id=eq.${entrepriseId}&select=*`))
  const [c] = await db.rpc('courriels_ajouter', {
    p_courriels: [
      {
        genre: 'autre',
        cle: `essai:${entrepriseId}:${Date.now()}`,
        entreprise_id: entrepriseId,
        a: [destinataire],
        sujet: `Essai d'envoi — ${compagnie?.nom_expediteur ?? ''}`.trim(),
        corps: `Bonjour,\n\nCeci est un courriel d'essai envoyé par l'app depuis ${compagnie?.adresse_envoi ?? 'la boîte de la compagnie'}. S'il est arrivé, la boîte fonctionne.\n\n${nom ?? ''}`,
        cree_par_nom: nom,
      },
    ],
  })
  return envoyerCourriel(env, c.id, nom)
}
