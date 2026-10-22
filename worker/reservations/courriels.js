// Courriels aux clients des Réservations (plan §9, phase 5 ; fenêtre et fil
// Gmail : réunion du 2026-10-21) :
// - préparer : d'après l'état des réservations (reservations.courriels_etat)
//   et les règles de courriels.ts, un courriel par événement, rendu avec son
//   modèle ; aux 15 minutes (cron) et à la demande de la fiche. L'estimé et
//   le contrat n'y sont plus : ils partent par la fenêtre de la fiche ;
// - fenêtre : brouillon du modèle (brouillonCourriel), puis envoi de ce que
//   l'équipe a écrit (expedierFenetre) — l'estimé ne devient « envoyé » que
//   quand le courriel est parti ;
// - envoyer : d'un clic (mode « à approuver », le défaut) ou tout seul (mode
//   automatique), depuis inscriptions@ par l'API Gmail, avec ses pièces
//   jointes (PDF de l'estimé, de la pré-arrivée, de la facture QBO) ;
// - un seul fil Gmail par réservation (reservations.fils_courriel) : même
//   sujet, threadId, In-Reply-To / References ;
// - après l'envoi, reservations.courriel_parti note tout d'un coup (statut,
//   fil, journal, échange du CRM, estimé envoyé, PDF gardé, contrat envoyé).
//
// En DEV (base locale), rien ne part chez un client : avec COURRIELS_MAILPIT
// (.dev.vars), tout arrive dans Mailpit ; sans lui, l'envoi est refusé.
// En PROD : GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET (le client OAuth de la
// Vigie), GMAIL_INSCRIPTIONS_REFRESH_TOKEN (autorisé depuis inscriptions@,
// portées gmail.send ET gmail.metadata : le Message-ID se relit après
// l'envoi), COURRIELS_EXPEDITEUR (variable, inscriptions@camptremblant.com).

import {
  adresseInvalide,
  aPreparer,
  brouillonFenetre,
  champsCourriel,
  cleFenetre,
  destinataires,
  encoreUtile,
  enTetesFil,
  jourMontreal,
  langueCourriel,
  listeAdresses,
  NOMS_COURRIEL,
  refusFenetre,
  rendreCourriel,
  versHtml,
} from '../../src/modules/reservations/courriels.ts'
import { envoyerGmailFil, envoyerMailpitFil, messageMime } from '../commun/courriel.js'
import { clientQbo } from '../qbo/client.js'
import { telecharger } from '../qbo/operations.js'
import { base } from '../subventions/base.js'
import { deposerPdf, retirerFichier } from './documents.js'
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

/** Raison lisible quand rien ne peut partir (sinon null). */
export function refusEnvoi(mode) {
  if (mode === 'bloque') return 'Base locale : les courriels partent seulement dans Mailpit (COURRIELS_MAILPIT dans .dev.vars).'
  if (mode === 'non_configure') return 'Gmail n’est pas configuré pour inscriptions@ (secrets GMAIL_* et COURRIELS_EXPEDITEUR : README, section 13).'
  return null
}

const filDe = async (db, reservationId) => un(await db.lire(`fils_courriel?reservation_id=eq.${reservationId}&select=*`)) ?? null

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
  const [etats, modeles, compagnies, reglages, fils] = await Promise.all([
    db.rpc('courriels_etat', { p_reservation: reservationId }),
    db.lire('modeles_courriels?select=*'),
    db.lire('compagnies?select=entreprise_id,raison_sociale,nom_court,courriel,telephone,reponse_interac'),
    db.lire('reglages?cle=eq.courriels_depuis&select=valeur'),
    db.lire(`fils_courriel?select=reservation_id,sujet${reservationId ? `&reservation_id=eq.${reservationId}` : ''}`),
  ])
  const depuis = un(reglages)?.valeur
  if (!depuis) return { prepares: 0, annules: 0, envoyes: 0 }
  const auj = aujourdhui()
  const parGenre = new Map(modeles.map((m) => [m.genre, m]))
  const parCompagnie = new Map(compagnies.map((c) => [c.entreprise_id, c]))
  const sujetDuFil = new Map((fils ?? []).map((f) => [f.reservation_id, f.sujet]))
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
        // Déjà un fil pour la réservation : son sujet (le modèle ne sert qu'au premier courriel).
        sujet: sujetDuFil.get(e.r.id) ?? sujet,
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
// Fenêtre d'envoi (estimé, contrat)
// ------------------------------------------------------------------

async function etatPourFenetre(env, db, reservationId, genre, ref) {
  if (genre !== 'estime' && genre !== 'contrat') throw new ErreurCourriel('genre', 'Courriel inconnu.')
  const e = un(await db.rpc('courriels_etat', { p_reservation: reservationId }))
  if (!e) throw new ErreurCourriel('introuvable', 'Réservation introuvable.')
  const refus = refusFenetre(e, genre, ref)
  if (refus) throw new ErreurCourriel('refus', refus)
  return e
}

/**
 * Courriel proposé dans la fenêtre : modèle rendu dans la langue de la
 * réservation (ou le courriel déjà préparé par l'ancienne file), sujet du
 * fil s'il y en a un, mode d'envoi.
 */
export async function brouillonCourriel(env, { reservation, genre, ref }) {
  const db = base(env, 'reservations')
  const e = await etatPourFenetre(env, db, reservation, genre, ref)
  const [modeles, compagnies, fil] = await Promise.all([
    db.lire(`modeles_courriels?genre=eq.${genre}&select=*`),
    db.lire(`compagnies?entreprise_id=eq.${e.r.compagnie_id}&select=raison_sociale,nom_court,courriel,telephone,reponse_interac`),
    filDe(db, reservation),
  ])
  const modele = un(modeles)
  const compagnie = un(compagnies)
  if (!modele) throw new ErreurCourriel('modele', `Pas de modèle « ${NOMS_COURRIEL[genre]} » (Réservations › Courriels).`)
  if (!compagnie) throw new ErreurCourriel('compagnie', 'Coordonnées de la compagnie introuvables (Réglages › Compagnies).')
  const b = brouillonFenetre(e, { genre, ref, modele, compagnie, racine: racinePublique(env), auj: aujourdhui() })
  // Préparé par l'ancienne file (et peut-être corrigé) : on le reprend tel quel.
  const ancien = e.courriels.find((c) => c.cle === b.cle && c.statut === 'prepare')
  const prepare = ancien ? un(await db.lire(`courriels?id=eq.${ancien.id}&select=a,cc,sujet,corps`)) : null
  const mode = modeEnvoi(env)
  const filActif = fil && fil.transport === mode ? fil : null
  return {
    genre,
    ref,
    langue: b.langue,
    a: prepare?.a ?? b.a,
    cc: prepare?.cc ?? b.cc,
    sujet: filActif?.sujet ?? prepare?.sujet ?? b.sujet,
    corps: prepare?.corps ?? b.corps,
    fil: filActif ? { sujet: filActif.sujet, courriels: filActif.courriels } : null,
    envoi: mode,
    refus: refusEnvoi(mode),
  }
}

const decoder64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0))

/** PDF joint par la fenêtre (estimé produit dans le navigateur, comme son aperçu). */
function lirePiece(piece) {
  if (!piece || typeof piece.contenu !== 'string' || typeof piece.nom !== 'string') return null
  let octets
  try {
    octets = decoder64(piece.contenu)
  } catch {
    return null
  }
  // Un vrai PDF, 15 Mo au plus.
  if (octets.length < 5 || octets.length > 15_000_000 || new TextDecoder().decode(octets.subarray(0, 5)) !== '%PDF-') return null
  return { nom: piece.nom.replace(/[\\/]/g, '-').slice(0, 150), octets }
}

/**
 * Envoie le courriel de la fenêtre (ce que l'équipe a écrit). Seulement
 * quand il est parti : l'estimé passe « envoyé », son PDF est gardé, le
 * contrat passe « Contrat envoyé ». Si l'envoi rate, rien ne change.
 */
export async function expedierFenetre(env, corps, auteur) {
  const { reservation, genre, ref } = corps
  const db = base(env, 'reservations')
  const mode = modeEnvoi(env)
  const refus = refusEnvoi(mode)
  if (refus) throw new ErreurCourriel('configuration', refus)
  const e = await etatPourFenetre(env, db, reservation, genre, ref)

  const champA = Array.isArray(corps.a) ? corps.a.join(', ') : String(corps.a ?? '')
  const champCc = Array.isArray(corps.cc) ? corps.cc.join(', ') : String(corps.cc ?? '')
  const invalide = adresseInvalide(`${champA} ${champCc}`)
  if (invalide) throw new ErreurCourriel('destinataire', `Adresse invalide : ${invalide}`)
  const a = listeAdresses(champA)
  const cc = listeAdresses(champCc).filter((x) => !a.some((y) => y.toLowerCase() === x.toLowerCase()))
  if (!a.length) throw new ErreurCourriel('destinataire', 'Ajoutez au moins un destinataire.')
  const sujet = String(corps.sujet ?? '').replace(/\s+/g, ' ').trim().slice(0, 250)
  const texte = String(corps.corps ?? '').trim().slice(0, 20_000)
  if (!sujet) throw new ErreurCourriel('sujet', 'Le sujet est vide.')
  if (!texte) throw new ErreurCourriel('texte', 'Le texte du courriel est vide.')

  let piece = null
  if (genre === 'estime') {
    piece = lirePiece(corps.piece)
    if (!piece) throw new ErreurCourriel('piece', "Le PDF de l'estimé manque : fermez la fenêtre et recommencez.")
    const x = e.estimes.find((y) => y.id === ref)
    piece.titre = `Estimé ${e.r.numero}${x && x.version > 1 ? ` v${x.version}` : ''}`
    piece.estimeId = ref
  }

  const { id, nouveau } = await db.rpc('courriel_fenetre', {
    p: { reservation_id: reservation, genre, cle: cleFenetre(genre, ref), ref, langue: langueCourriel(e, genre), a, cc, sujet, corps: texte },
  })
  try {
    return await envoyerCourriel(env, id, auteur, { piece })
  } catch (err) {
    // Rien n'est parti : le courriel de la fenêtre ne reste pas dans la file.
    if (nouveau && err.code !== 'apres') await db.supprimer('courriels', `id=eq.${id}&statut=eq.prepare`).catch(() => {})
    throw err
  }
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

/**
 * Envoie un courriel préparé (vérifie d'abord qu'il sert encore), dans le
 * fil de la réservation. `options.piece` : PDF de la fenêtre (estimé), à
 * joindre et à garder dans les documents une fois le courriel parti.
 */
export async function envoyerCourriel(env, id, auteur, options = {}) {
  const db = base(env, 'reservations')
  const c = un(await db.lire(`courriels?id=eq.${id}&select=*`))
  if (!c) throw new ErreurCourriel('introuvable', 'Courriel introuvable.')
  if (c.statut !== 'prepare') throw new ErreurCourriel('deja', c.statut === 'envoye' ? 'Ce courriel est déjà parti.' : 'Ce courriel est annulé.')
  if (!c.a?.length) throw new ErreurCourriel('destinataire', 'Ajoutez au moins un destinataire.')
  const mode = modeEnvoi(env)
  const refus = refusEnvoi(mode)
  if (refus) throw new ErreurCourriel('configuration', refus)

  const e = un(await db.rpc('courriels_etat', { p_reservation: c.reservation_id }))
  if (!e) throw new ErreurCourriel('introuvable', 'Réservation introuvable.')
  if (!encoreUtile(c, e)) {
    await db.modifier('courriels', `id=eq.${id}&statut=eq.prepare`, { statut: 'annule', raison: 'Plus nécessaire', annule_le: new Date().toISOString() })
    throw new ErreurCourriel('perime', 'Ce courriel n’est plus nécessaire (déjà signé, payé ou accepté) : il est annulé.')
  }
  const [compagnie, fil] = await Promise.all([
    db.lire(`compagnies?entreprise_id=eq.${e.r.compagnie_id}&select=raison_sociale,nom_court`).then(un),
    filDe(db, c.reservation_id),
  ])
  // Fil de la réservation (même transport) : même sujet, threadId, In-Reply-To / References.
  const filActif = fil && fil.transport === mode ? fil : null
  const sujet = filActif?.sujet ?? c.sujet

  let depose = null
  let envoi
  try {
    let pieces
    if (options.piece) {
      depose = await deposerPdf(env, { reservationId: c.reservation_id, genre: 'estime', octets: options.piece.octets })
      pieces = [{ nom: options.piece.nom, type: 'application/pdf', octets: options.piece.octets }]
    } else {
      pieces = await piecesJointes(env, db, c, e, auteur)
    }
    const message = {
      nomDe: compagnie?.raison_sociale ?? compagnie?.nom_court ?? '',
      a: c.a,
      cc: c.cc ?? [],
      sujet,
      texte: c.corps,
      html: versHtml(c.corps),
      pieces,
      enTetes: enTetesFil(filActif),
      threadId: filActif?.thread_id ?? null,
    }
    envoi = mode === 'mailpit' ? await envoyerMailpit(env, message) : await envoyerGmail(env, message)
  } catch (err) {
    if (depose) await retirerFichier(env, depose.chemin).catch(() => {})
    await db.modifier('courriels', `id=eq.${id}`, { erreur: String(err.message ?? err).slice(0, 500) }).catch(() => {})
    throw err
  }

  // Parti : tout est noté d'un coup (deux essais ; le courriel ne repart jamais).
  const apres = {
    courriel_id: id,
    sujet,
    auteur: auteur ?? null,
    transport: mode,
    message_id: envoi.id,
    thread_id: envoi.threadId,
    message_rfc: envoi.messageId,
    nom_genre: NOMS_COURRIEL[c.genre] ?? null,
    document: depose ? { id: depose.id, chemin: depose.chemin, empreinte: depose.empreinte, titre: options.piece.titre, estime_id: options.piece.estimeId } : null,
  }
  try {
    await db.rpc('courriel_parti', { p: apres }).catch(() => db.rpc('courriel_parti', { p: apres }))
  } catch (err) {
    console.error('Courriel parti, mais pas noté :', id, err)
    throw new ErreurCourriel('apres', `Le courriel est parti, mais l'app n'a pas pu le noter (${String(err.message ?? err).slice(0, 200)}). Ne le renvoyez pas : prévenez Maxime.`)
  }
  return { ok: true, mode, fil: !!filActif }
}

// ------------------------------------------------------------------
// Transports (communs : worker/commun/courriel.js)
// ------------------------------------------------------------------

export { messageMime }

const expediteur = (env) => env.COURRIELS_EXPEDITEUR ?? 'inscriptions@camptremblant.com'

/** DEV : Mailpit (http://localhost:54324). Rend { id, threadId, messageId }. */
const envoyerMailpit = (env, m) => envoyerMailpitFil(env, { de: expediteur(env), ...m })

/** PROD : API Gmail du compte inscriptions@ (jeton d'actualisation autorisé depuis ce compte). */
const envoyerGmail = (env, m) => envoyerGmailFil(env, { de: expediteur(env), ...m }, env.GMAIL_INSCRIPTIONS_REFRESH_TOKEN)

/** Courriel interne (avis à l'équipe) : hors du fil du client. */
export async function envoyerInterne(env, { a, sujet, texte }) {
  const mode = modeEnvoi(env)
  const refus = refusEnvoi(mode)
  if (refus) throw new ErreurCourriel('configuration', refus)
  const m = { nomDe: "Réservations (app de l'équipe)", a, cc: [], sujet, texte, html: versHtml(texte), pieces: [] }
  return mode === 'mailpit' ? envoyerMailpit(env, m) : envoyerGmail(env, m)
}

export { expediteur }
