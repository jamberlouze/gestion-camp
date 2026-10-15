// Courriels aux clients des Réservations (plan §9, phase 5) :
// - préparer : d'après l'état des réservations (reservations.courriels_etat)
//   et les règles de courriels.ts, un courriel par événement, rendu avec son
//   modèle ; aux 15 minutes (cron) et à la demande de la fiche ;
// - envoyer : d'un clic (mode « à approuver », le défaut) ou tout seul (mode
//   automatique), depuis inscriptions@ par l'API Gmail, avec ses pièces
//   jointes (PDF de l'estimé, de la pré-arrivée, de la facture QBO) ; noté
//   au journal de la réservation et dans les échanges du CRM.
//
// En DEV (base locale), rien ne part chez un client : avec COURRIELS_MAILPIT
// (.dev.vars), tout arrive dans Mailpit ; sans lui, l'envoi est refusé.
// En PROD : GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET (le client OAuth de la
// Vigie), GMAIL_INSCRIPTIONS_REFRESH_TOKEN (autorisé depuis inscriptions@),
// COURRIELS_EXPEDITEUR (variable, inscriptions@camptremblant.com).

import {
  aPreparer,
  champsCourriel,
  destinataires,
  encoreUtile,
  jourMontreal,
  langueCourriel,
  rendreCourriel,
  versHtml,
} from '../../src/modules/reservations/courriels.ts'
import { envoyerGmail as envoyerGmailCommun, envoyerMailpit as envoyerMailpitCommun, messageMime } from '../commun/courriel.js'
import { clientQbo } from '../qbo/client.js'
import { telecharger } from '../qbo/operations.js'
import { base } from '../subventions/base.js'
import { produirePreArrivee } from './preArrivee.js'

export class ErreurCourriel extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const aujourdhui = () => jourMontreal(new Date())
const racinePublique = (env) => (env.HOTE_PUBLIC ? `https://${env.HOTE_PUBLIC}` : env.APP_URL)
const un = (l) => (Array.isArray(l) ? l[0] : undefined)

/** Où partent les courriels : Mailpit (DEV), Gmail (PROD), ou nulle part (base locale sans Mailpit, Gmail pas configuré). */
export function modeEnvoi(env) {
  if (env.COURRIELS_MAILPIT) return 'mailpit'
  if (/127\.0\.0\.1|localhost/.test(env.SUPABASE_URL ?? '')) return 'bloque'
  return env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_INSCRIPTIONS_REFRESH_TOKEN && env.COURRIELS_EXPEDITEUR ? 'gmail' : 'non_configure'
}

// ------------------------------------------------------------------
// Préparer
// ------------------------------------------------------------------

/**
 * Prépare les courriels dus (une réservation, ou toutes celles en cours) et
 * annule ceux qui ne servent plus ; envoie ceux dont le type est en mode
 * automatique (quelques-uns par passage).
 */
export async function preparerCourriels(env, reservationId = null, { envoisMax = 3 } = {}) {
  const db = base(env, 'reservations')
  const [etats, modeles, compagnies, reglages] = await Promise.all([
    db.rpc('courriels_etat', { p_reservation: reservationId }),
    db.lire('modeles_courriels?select=*'),
    db.lire('compagnies?select=entreprise_id,raison_sociale,nom_court,courriel,telephone,reponse_interac'),
    db.lire('reglages?cle=eq.courriels_depuis&select=valeur'),
  ])
  const depuis = un(reglages)?.valeur
  if (!depuis) return { prepares: 0, annules: 0, envoyes: 0 }
  const auj = aujourdhui()
  const parGenre = new Map(modeles.map((m) => [m.genre, m]))
  const parCompagnie = new Map(compagnies.map((c) => [c.entreprise_id, c]))
  const nouveaux = []
  const perimes = []

  for (const e of etats ?? []) {
    for (const c of e.courriels) if (c.statut === 'prepare' && !encoreUtile(c, e)) perimes.push(c.id)
    const compagnie = parCompagnie.get(e.r.compagnie_id)
    if (!compagnie) continue
    for (const p of aPreparer(e, auj, depuis)) {
      const m = parGenre.get(p.genre)
      if (!m || m.mode === 'desactive') continue
      const langue = langueCourriel(e, p.genre)
      const { a, cc } = destinataires(e, p.genre)
      const { sujet, corps } = rendreCourriel(m, langue, champsCourriel(e, { genre: p.genre, ref: p.ref, langue, compagnie, racine: racinePublique(env) }))
      nouveaux.push({
        reservation_id: e.r.id,
        genre: p.genre,
        cle: p.cle,
        ref: p.ref,
        langue,
        a,
        cc,
        sujet,
        corps,
        erreur: a.length ? null : 'Aucun destinataire : ajoutez un courriel au contact de la réservation (CRM).',
      })
    }
  }

  const ajoutes = nouveaux.length ? await db.rpc('courriels_ajouter', { p_courriels: nouveaux }) : []
  if (perimes.length) {
    await db.modifier('courriels', `id=in.(${perimes.join(',')})&statut=eq.prepare`, { statut: 'annule', raison: 'Plus nécessaire', annule_le: new Date().toISOString() })
  }

  let envoyes = 0
  for (const c of ajoutes ?? []) {
    if (envoyes >= envoisMax || parGenre.get(c.genre)?.mode !== 'automatique') continue
    try {
      await envoyerCourriel(env, c.id, 'Envoi automatique')
      envoyes++
    } catch {
      // L'erreur est gardée sur le courriel ; il reste à envoyer à la main.
    }
  }
  return { prepares: ajoutes?.length ?? 0, annules: perimes.length, envoyes }
}

// ------------------------------------------------------------------
// Envoyer
// ------------------------------------------------------------------

async function documentGarde(env, db, filtre, nom) {
  const d = un(await db.lire(`documents?${filtre}&select=titre,chemin&order=cree_le.desc&limit=1`))
  if (!d) return null
  const { octets } = await telecharger(env, d.chemin)
  return { nom: `${(nom ?? d.titre).replace(/[\\/]/g, '-')}.pdf`, type: 'application/pdf', octets: new Uint8Array(octets) }
}

/** Pièces jointes selon le type : PDF de l'estimé, de la pré-arrivée (produite ici), de la facture (QBO). */
async function piecesJointes(env, db, c, e, auteur) {
  if (c.genre === 'estime') {
    const p = await documentGarde(env, db, `reservation_id=eq.${c.reservation_id}&genre=eq.estime&estime_id=eq.${c.ref}`)
    if (!p) throw new ErreurCourriel('piece', "Le PDF de l'estimé envoyé n'est pas gardé : Documents › « Garder le PDF », puis envoyez.")
    return [p]
  }
  if (c.genre === 'pre_arrivee') {
    // Produite au moment de l'envoi (horaire et nombres à jour), gardée dans Documents.
    let pre
    try {
      pre = await produirePreArrivee(env, c.reservation_id, auteur)
    } catch (err) {
      throw new ErreurCourriel('piece', `PDF de pré-arrivée impossible : ${err.message}`)
    }
    return [{ nom: `${pre.doc.titre}.pdf`, type: 'application/pdf', octets: pre.octets }]
  }
  if (c.genre === 'facture' || c.genre === 'facture_finale' || c.genre === 'rappel_paiement') {
    const f = e.factures.find((x) => x.id === c.ref)
    if (!f) throw new ErreurCourriel('piece', 'Facture introuvable (supprimée dans QBO ?).')
    const qbo = await clientQbo(env, e.r.compagnie_id)
    const octets = await qbo.pdf('Invoice', f.qbo_id)
    return [{ nom: `Facture ${f.numero ?? f.qbo_id}.pdf`, type: 'application/pdf', octets: new Uint8Array(octets) }]
  }
  return []
}

/** Envoie un courriel préparé (vérifie d'abord qu'il sert encore). */
export async function envoyerCourriel(env, id, auteur) {
  const db = base(env, 'reservations')
  const c = un(await db.lire(`courriels?id=eq.${id}&select=*`))
  if (!c) throw new ErreurCourriel('introuvable', 'Courriel introuvable.')
  if (c.statut !== 'prepare') throw new ErreurCourriel('deja', c.statut === 'envoye' ? 'Ce courriel est déjà parti.' : 'Ce courriel est annulé.')
  if (!c.a?.length) throw new ErreurCourriel('destinataire', 'Ajoutez au moins un destinataire.')
  const mode = modeEnvoi(env)
  if (mode === 'bloque') throw new ErreurCourriel('configuration', 'Base locale : les courriels partent seulement dans Mailpit (COURRIELS_MAILPIT dans .dev.vars).')
  if (mode === 'non_configure') throw new ErreurCourriel('configuration', 'Gmail n’est pas configuré (secrets GMAIL_* et COURRIELS_EXPEDITEUR : README, section 13).')

  const e = un(await db.rpc('courriels_etat', { p_reservation: c.reservation_id }))
  if (!e) throw new ErreurCourriel('introuvable', 'Réservation introuvable.')
  if (!encoreUtile(c, e)) {
    await db.modifier('courriels', `id=eq.${id}&statut=eq.prepare`, { statut: 'annule', raison: 'Plus nécessaire', annule_le: new Date().toISOString() })
    throw new ErreurCourriel('perime', 'Ce courriel n’est plus nécessaire (déjà signé, payé ou accepté) : il est annulé.')
  }
  const compagnie = un(await db.lire(`compagnies?entreprise_id=eq.${e.r.compagnie_id}&select=raison_sociale,nom_court`))

  try {
    const pieces = await piecesJointes(env, db, c, e, auteur)
    const message = { nomDe: compagnie?.raison_sociale ?? compagnie?.nom_court ?? '', a: c.a, cc: c.cc ?? [], sujet: c.sujet, texte: c.corps, html: versHtml(c.corps), pieces }
    const messageId = mode === 'mailpit' ? await envoyerMailpit(env, message) : await envoyerGmail(env, message)
    await db.modifier('courriels', `id=eq.${id}`, {
      statut: 'envoye',
      envoye_le: new Date().toISOString(),
      envoye_par_nom: auteur ?? null,
      message_id: messageId,
      erreur: null,
    })
  } catch (err) {
    await db.modifier('courriels', `id=eq.${id}`, { erreur: String(err.message ?? err).slice(0, 500) }).catch(() => {})
    throw err
  }

  const destinataires = [...c.a, ...(c.cc ?? [])].join(', ')
  await db.inserer('journal', {
    reservation_id: c.reservation_id,
    genre: 'courriel',
    texte: `Courriel « ${c.sujet} » envoyé à ${destinataires}${mode === 'mailpit' ? ' (DEV : Mailpit)' : ''}`,
    auteur_nom: auteur ?? null,
  })
  if (e.r.organisation_id) {
    await base(env, 'crm').inserer('echanges', {
      organisation_id: e.r.organisation_id,
      contact_id: e.contact_reservation?.id ?? null,
      reservation_id: c.reservation_id,
      genre: 'courriel',
      jour: aujourdhui(),
      texte: `${c.sujet} — envoyé par l'app à ${destinataires}.`,
      auteur_nom: auteur ?? null,
    })
  }
  return { ok: true, mode }
}

// ------------------------------------------------------------------
// Transports (communs : worker/commun/courriel.js)
// ------------------------------------------------------------------

export { messageMime }

const expediteur = (env) => env.COURRIELS_EXPEDITEUR ?? 'inscriptions@camptremblant.com'

/** DEV : Mailpit (http://localhost:54324). */
const envoyerMailpit = (env, m) => envoyerMailpitCommun(env, { de: expediteur(env), ...m })

/** PROD : API Gmail du compte inscriptions@ (jeton d'actualisation autorisé depuis ce compte). */
const envoyerGmail = (env, m) => envoyerGmailCommun(env, { de: expediteur(env), ...m }, env.GMAIL_INSCRIPTIONS_REFRESH_TOKEN)
