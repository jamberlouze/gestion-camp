// Ce que l'app fait dans QuickBooks Online, selon le SOP de la comptable
// (plan §6, façon A) : client, devis tiré de l'estimé accepté (avec le
// contrat signé et le spécimen de chèque joints), relances de facturation,
// factures séparées, notes de crédit, synchro des factures et des soldes.

import {
  annulation,
  avantTaxesPour,
  clientQbo as payloadClient,
  ecart,
  echeancier,
  lignesQbo,
  pourcent,
  seuilsEcheancier,
  tachesFacturation,
} from '../../src/modules/reservations/facturation.ts'
import { base } from '../subventions/base.js'
import { clientQbo, ErreurQbo } from './client.js'

const SEAU = 'reservations-documents'
const aujourdhui = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date())
const echapper = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
const un = (lignes) => (Array.isArray(lignes) ? lignes[0] : undefined)

// ------------------------------------------------------------------
// Données de l'app
// ------------------------------------------------------------------

async function contexteReservation(env, reservationId) {
  const db = base(env, 'reservations')
  const crm = base(env, 'crm')
  const r = un(await db.lire(`reservations?id=eq.${reservationId}&select=*`))
  if (!r) throw new ErreurQbo('introuvable', 'Réservation introuvable.')
  const compagnie = un(await db.lire(`compagnies?entreprise_id=eq.${r.compagnie_id}&select=*`))
  if (!compagnie) throw new ErreurQbo('compagnie', 'Compagnie qui facture introuvable (Modèles et compagnies).')
  const org = r.organisation_id ? un(await crm.lire(`organisations?id=eq.${r.organisation_id}&select=*`)) : null
  const idsContacts = [r.contact_facturation_id, r.contact_reservation_id].filter(Boolean)
  const contacts = idsContacts.length ? await crm.lire(`contacts?id=in.(${idsContacts.join(',')})&select=*`) : []
  const contact = contacts.find((c) => c.id === r.contact_facturation_id) ?? contacts.find((c) => c.id === r.contact_reservation_id) ?? null
  const lien = r.organisation_id ? un(await db.lire(`qbo_clients?organisation_id=eq.${r.organisation_id}&compagnie_id=eq.${r.compagnie_id}&select=*`)) : null
  const devis = un(await db.lire(`qbo_devis?reservation_id=eq.${r.id}&select=*`))
  return { db, r, compagnie, org, contact, lien, devis }
}

function reglagesQbo(compagnie) {
  const q = compagnie.qbo ?? {}
  if (!q.article?.id || !q.taxes?.id) {
    throw new ErreurQbo(
      'reglages',
      `Choisissez l'article et le code de taxes QBO de ${compagnie.nom_court} (Modèles et compagnies › QuickBooks).`,
    )
  }
  return q
}

// ------------------------------------------------------------------
// Listes du dossier QBO (réglages de la compagnie)
// ------------------------------------------------------------------

export async function listes(env, compagnieId) {
  const qbo = await clientQbo(env, compagnieId)
  const [articles, taxes, termes] = await Promise.all([
    qbo.requete("select Id, Name, Type from Item where Active = true and Type in ('Service', 'NonInventory') maxresults 1000"),
    qbo.requete('select Id, Name, Description from TaxCode where Active = true maxresults 200'),
    qbo.requete('select Id, Name, DueDays from Term where Active = true maxresults 200'),
  ])
  return {
    articles: (articles.Item ?? []).map((x) => ({ id: x.Id, nom: x.Name })),
    taxes: (taxes.TaxCode ?? []).map((x) => ({ id: x.Id, nom: x.Name, description: x.Description ?? null })),
    termes: (termes.Term ?? []).map((x) => ({ id: x.Id, nom: x.Name, jours: x.DueDays ?? null })),
  }
}

// ------------------------------------------------------------------
// Client QBO
// ------------------------------------------------------------------

/** Client QBO déjà relié, ou candidats du dossier QBO (même nom, nom semblable). */
export async function candidatsClients(env, reservationId) {
  const { r, org, lien } = await contexteReservation(env, reservationId)
  if (!org) throw new ErreurQbo('organisation', "Reliez d'abord la réservation à une organisation du CRM.")
  if (lien) return { lie: { id: lien.qbo_id, nom: lien.nom }, candidats: [] }
  const qbo = await clientQbo(env, r.compagnie_id)
  const nom = payloadClient(org, null, null).DisplayName
  const mot = nom.split(/\s+/).filter((m) => m.length > 3).sort((a, b) => b.length - a.length)[0] ?? nom
  const [exacts, semblables] = await Promise.all([
    qbo.requete(`select * from Customer where DisplayName = '${echapper(nom)}'`),
    qbo.requete(`select * from Customer where DisplayName like '%${echapper(mot)}%' maxresults 20`),
  ])
  const vus = new Map()
  for (const c of [...(exacts.Customer ?? []), ...(semblables.Customer ?? [])]) {
    if (!vus.has(c.Id)) {
      vus.set(c.Id, {
        id: c.Id,
        nom: c.DisplayName,
        courriel: c.PrimaryEmailAddr?.Address ?? null,
        ville: c.BillAddr?.City ?? null,
        exact: c.DisplayName.toLowerCase() === nom.toLowerCase(),
      })
    }
  }
  return { lie: null, nom, candidats: [...vus.values()].sort((a, b) => Number(b.exact) - Number(a.exact)) }
}

/** Relie l'organisation à un client QBO existant, ou le crée. */
async function relierClient(env, qbo, ctx, choix) {
  if (ctx.lien) return ctx.lien.qbo_id
  if (!ctx.org) throw new ErreurQbo('organisation', "Reliez d'abord la réservation à une organisation du CRM.")
  let client
  if (choix?.qbo_id) {
    client = await qbo.lire('Customer', choix.qbo_id)
  } else if (choix?.creer) {
    try {
      client = await qbo.creer('Customer', payloadClient(ctx.org, ctx.contact, ctx.compagnie.qbo?.terme ?? null))
    } catch (e) {
      if (e.code === '6240') throw new ErreurQbo('doublon', 'Un client QBO porte déjà ce nom : choisissez-le dans la liste.')
      throw e
    }
  } else {
    throw new ErreurQbo('client', 'Choisissez le client QBO, ou créez-le.')
  }
  await ctx.db.inserer('qbo_clients', { organisation_id: ctx.org.id, compagnie_id: ctx.r.compagnie_id, qbo_id: client.Id, nom: client.DisplayName })
  return client.Id
}

// ------------------------------------------------------------------
// Devis QBO
// ------------------------------------------------------------------

async function telecharger(env, chemin) {
  const cle = env.SUPABASE_SECRET_KEY
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${SEAU}/${chemin.split('/').map(encodeURIComponent).join('/')}`, {
    headers: { apikey: cle, ...(cle?.startsWith('eyJ') ? { Authorization: `Bearer ${cle}` } : {}) },
  })
  if (!res.ok) throw new Error(`Fichier ${chemin} introuvable (${res.status}).`)
  return { octets: await res.arrayBuffer(), type: res.headers.get('content-type') ?? 'application/pdf' }
}

const articleDe = (produits, compagnie) => (code) => {
  const p = code ? produits.find((x) => x.code === code) : null
  return p?.qbo_articles?.[compagnie.entreprise_id] ?? compagnie.qbo.article
}

const estimeAccepte = async (db, r) =>
  un(await db.lire(`estimes?reservation_id=eq.${r.id}&statut=eq.accepte&select=*&order=version.desc&limit=1`))

/**
 * Crée ou met à jour le devis QBO (client relié ou créé, lignes, contrôle du
 * total) ; pièces jointes à la création seulement.
 */
async function envoyerDevis(env, ctx, { lignes, estime, totalApp, annulation, choixClient, auteur }) {
  const { db, r, compagnie } = ctx
  const reglages = reglagesQbo(compagnie)
  const produits = await db.lire('produits?select=code,qbo_articles')
  const qbo = await clientQbo(env, r.compagnie_id)
  const clientId = await relierClient(env, qbo, ctx, choixClient)

  const contenu = {
    CustomerRef: { value: clientId },
    DocNumber: r.numero,
    TxnStatus: 'Accepted',
    ...(estime.accepte_par ? { AcceptedBy: estime.accepte_par.slice(0, 100) } : {}),
    ...(estime.accepte_le ? { AcceptedDate: estime.accepte_le.slice(0, 10) } : {}),
    GlobalTaxCalculation: 'TaxExcluded',
    Line: lignesQbo(lignes, articleDe(produits, compagnie), reglages.taxes),
    CustomerMemo: { value: `Réservation ${r.numero} — ${r.nom}`.slice(0, 1000) },
    PrivateNote: annulation
      ? `Frais d'annulation calculés par l'app de gestion (${r.numero}).`
      : `Créé par l'app de gestion à partir de l'estimé v${estime.version} accepté (${r.numero}).`,
    ...(ctx.contact?.courriel ? { BillEmail: { Address: ctx.contact.courriel } } : {}),
    ...(reglages.terme?.id ? { SalesTermRef: { value: reglages.terme.id } } : {}),
  }

  let resultat
  const creation = !ctx.devis
  if (creation) {
    resultat = await qbo.creer('Estimate', { ...contenu, TxnDate: aujourdhui() })
  } else {
    const actuel = await qbo.lire('Estimate', ctx.devis.qbo_id)
    // Sans TxnTaxDetail vide, une mise à jour partielle garde les taxes des anciennes lignes (vérifié en compagnie d'essai).
    resultat = await qbo.modifier('Estimate', { ...contenu, TxnTaxDetail: {}, Id: actuel.Id, SyncToken: actuel.SyncToken })
  }

  const ligneDevis = {
    reservation_id: r.id,
    compagnie_id: r.compagnie_id,
    qbo_id: resultat.Id,
    numero: resultat.DocNumber ?? r.numero,
    estime_id: estime.id,
    estime_version: estime.version,
    total: Number(resultat.TotalAmt ?? 0),
    total_app: Number(totalApp),
    statut: resultat.TxnStatus ?? null,
    annulation,
    maj_le: new Date().toISOString(),
    ...(creation ? { cree_par_nom: auteur ?? null } : {}),
  }
  if (creation) await db.inserer('qbo_devis', ligneDevis)
  else await db.modifier('qbo_devis', `reservation_id=eq.${r.id}`, ligneDevis)

  const avertissements = []
  if (creation) {
    // Contrat signé et spécimens de chèque joints au devis (SOP).
    const signe = un(await db.lire(`documents?reservation_id=eq.${r.id}&genre=eq.contrat_signe&select=titre,chemin&order=cree_le.desc&limit=1`))
    const fichiers = [...(signe ? [{ titre: signe.titre, chemin: signe.chemin }] : []), ...(compagnie.annexes ?? [])]
    if (!signe) avertissements.push("Pas de contrat signé gardé dans l'app : rien n'a été joint pour le contrat.")
    for (const f of fichiers) {
      try {
        const { octets, type } = await telecharger(env, f.chemin)
        const ext = type.includes('pdf') ? 'pdf' : type.includes('png') ? 'png' : 'jpg'
        await qbo.joindre('Estimate', resultat.Id, `${f.titre}.${ext}`.replace(/[\\/]/g, '-'), type, octets)
      } catch (e) {
        avertissements.push(`Pièce jointe « ${f.titre} » non ajoutée : ${e.message}`)
      }
    }
  }
  return { qbo, ligneDevis, avertissements }
}

/** Relances de l'échéancier et seuils gardés avec le devis (montants d'après son total). */
async function poserEcheancier(db, r, total) {
  if (!r.signe_le) return
  const etapes = echeancier({ ...r, total, signe_le: r.signe_le })
  await db.modifier('qbo_devis', `reservation_id=eq.${r.id}`, { echeancier: seuilsEcheancier(etapes, r.date_depart) })
  await db.rpc('qbo_taches', { p_reservation: r.id, p_taches: tachesFacturation(r.numero, etapes) })
  await db.rpc('qbo_fermer_taches', { p_reservation: r.id })
}

/**
 * Crée (ou met à jour) le devis QBO de la réservation à partir de son
 * estimé accepté : client relié ou créé, lignes identiques, contrôle du
 * total, pièces jointes et relances de l'échéancier à la création.
 * Réservation annulée : c'est le devis des frais d'annulation (F17).
 */
export async function devis(env, reservationId, choixClient, auteur) {
  const ctx = await contexteReservation(env, reservationId)
  if (ctx.r.fermeture === 'annulee') return traiterAnnulation(env, ctx, choixClient, auteur)
  const { db, r } = ctx
  const estime = await estimeAccepte(db, r)
  if (!estime) throw new ErreurQbo('estime', "Il faut un estimé accepté par le client pour faire le devis QBO.")
  const lignes = await db.lire(`lignes?estime_id=eq.${estime.id}&select=*&order=ordre,created_at`)
  const { ligneDevis, avertissements } = await envoyerDevis(env, ctx, {
    lignes: lignes.filter((l) => Number(l.montant) !== 0 || l.auto),
    estime,
    totalApp: estime.total,
    annulation: false,
    choixClient,
    auteur,
  })
  await poserEcheancier(db, r, ligneDevis.total)
  return { devis: ligneDevis, ecart: ecart(ligneDevis.total, ligneDevis.total_app), avertissements }
}

/** Échéancier changé dans la fiche (F2) : relances et seuils refaits d'après le devis. */
export async function majEcheancier(env, reservationId) {
  const { db, r, devis: d } = await contexteReservation(env, reservationId)
  if (!d || d.annulation || r.fermeture === 'annulee') return { ok: true }
  await poserEcheancier(db, r, Number(d.total))
  return { ok: true }
}

const jourCourt = (jour) => new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${jour}T00:00:00Z`))
const argent = (n) => new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(n)

/**
 * Annulation après signature (F16, F17 ; F18 retirée) :
 * - frais à facturer : le devis ne porte plus que les frais d'annulation,
 *   l'adjointe en facture le solde dans QBO (relance) ;
 * - trop facturé : note de crédit de l'excédent, devis fermé, relance pour
 *   l'appliquer et rembourser ce qui a été payé en trop ;
 * - rien à facturer : devis fermé, relance faite.
 */
async function traiterAnnulation(env, ctx, choixClient, auteur) {
  const { db, r } = ctx
  if (!r.annule_le) throw new ErreurQbo('annulation', "Indiquez le jour de l'avis d'annulation.")
  const estime = await estimeAccepte(db, r)
  if (!estime) throw new ErreurQbo('estime', "Il faut l'estimé accepté (contrat) pour calculer les frais d'annulation.")
  const factures = await db.lire(`factures?reservation_id=eq.${r.id}&supprimee=eq.false&select=qbo_type,genre,total,solde,numero`)
  const a = annulation({ annule_le: r.annule_le, date_arrivee: r.date_arrivee, sous_total: Number(estime.sous_total), factures })
  const cle = 'annulation'
  const avis = `avis du ${jourCourt(r.annule_le)}, ${a.jours} jours avant l'arrivée`
  const tache = (titre) => db.rpc('qbo_taches', { p_reservation: r.id, p_taches: [{ cle, titre, echeance: aujourdhui() }] })

  if (a.ecart > 0) {
    const montant = a.retenu_avant_taxes
    const { ligneDevis, avertissements } = await envoyerDevis(env, ctx, {
      lignes: [{ code: null, description: `Frais d'annulation : ${pourcent(a.part)} du séjour (${avis})`, note: null, quantite: 1, prix_unitaire: montant, montant }],
      estime,
      totalApp: a.retenu,
      annulation: true,
      choixClient,
      auteur,
    })
    await db.modifier('qbo_devis', `reservation_id=eq.${r.id}`, { echeancier: [{ cle, cumul: 1, apres: null }] })
    await tache(`${r.numero} : annulée — facturer le solde du devis ${r.numero} dans QBO (frais d'annulation), ${argent(a.ecart)} (payable sur réception)`)
    await db.rpc('qbo_fermer_taches', { p_reservation: r.id })
    return { annulation: a, devis: ligneDevis, ecart: ecart(ligneDevis.total, ligneDevis.total_app), avertissements, message: `Devis QBO ajusté aux frais d'annulation (${argent(a.retenu)}) : il reste ${argent(a.ecart)} à facturer dans QBO.` }
  }

  let note = null
  if (a.ecart < 0) {
    note = await document(env, r.id, 'note_credit', [{ description: `Annulation (${avis}) : facturé au-delà des frais retenus (${pourcent(a.part)})`, quantite: 1, prix_unitaire: avantTaxesPour(-a.ecart) }], null)
  }
  // Plus rien à facturer sur ce devis.
  if (ctx.devis) {
    const qbo = await clientQbo(env, r.compagnie_id)
    const actuel = await qbo.lire('Estimate', ctx.devis.qbo_id)
    if (actuel.TxnStatus !== 'Closed') await qbo.modifier('Estimate', { Id: actuel.Id, SyncToken: actuel.SyncToken, TxnStatus: 'Closed' })
    await db.modifier('qbo_devis', `reservation_id=eq.${r.id}`, { statut: 'Closed', annulation: true, echeancier: [], maj_le: new Date().toISOString() })
  }
  if (note) {
    const paye = factures.filter((f) => f.genre === 'progressive').reduce((t, f) => t + Number(f.total) - Number(f.solde), 0)
    const rembourser = Math.round((paye - a.retenu) * 100) / 100
    await tache(
      `${r.numero} : annulée — appliquer la note de crédit n° ${note.numero ?? '?'} (${argent(note.total)}) dans QBO` +
        (rembourser > 0 ? ` et rembourser ${argent(rembourser)} au client (payé au-delà des frais retenus de ${argent(a.retenu)})` : ' aux factures impayées'),
    )
    return { annulation: a, facture: note, ecart: 0, avertissements: [], message: `Note de crédit n° ${note.numero ?? '?'} créée : ${argent(note.total)} taxes comprises.` }
  }
  await base(env, 'crm').modifier('relances', `source_cle=eq.qbo:${r.id}:${cle}&statut=eq.a_faire`, { statut: 'faite' })
  return { annulation: a, ecart: 0, avertissements: [], message: a.part === 0 ? "Acompte jamais payé : annulation sans frais (rien à facturer)." : 'Déjà facturé : rien de plus à facturer.' }
}

// ------------------------------------------------------------------
// Factures séparées et notes de crédit
// ------------------------------------------------------------------

const normaliserLignes = (lignes) =>
  (Array.isArray(lignes) ? lignes : [])
    .map((l) => {
      const quantite = Number(l.quantite) || 0
      const prix = Number(l.prix_unitaire) || 0
      return { code: l.code ?? null, description: String(l.description ?? '').trim(), note: null, quantite, prix_unitaire: prix, montant: Math.round(quantite * prix * 100) / 100 }
    })
    .filter((l) => l.description && l.montant > 0)

/** Facture séparée (bris, hors forfait : F6) ou note de crédit (F15, F17). */
export async function document(env, reservationId, genre, lignesBrutes, note) {
  const ctx = await contexteReservation(env, reservationId)
  const { r, compagnie } = ctx
  const reglages = reglagesQbo(compagnie)
  if (!ctx.lien) throw new ErreurQbo('client', "Le client QBO n'est pas encore relié : créez d'abord le devis QBO.")
  const lignes = normaliserLignes(lignesBrutes)
  if (!lignes.length) throw new ErreurQbo('lignes', 'Ajoutez au moins une ligne avec un montant.')
  const produits = await ctx.db.lire('produits?select=code,qbo_articles')
  const qbo = await clientQbo(env, r.compagnie_id)
  const entite = genre === 'note_credit' ? 'CreditMemo' : 'Invoice'
  const resultat = await qbo.creer(entite, {
    CustomerRef: { value: ctx.lien.qbo_id },
    // Numéros personnalisés activés (pour le devis) : sans ça, la facture n'aurait pas de numéro (Q10).
    AutoDocNumber: true,
    TxnDate: aujourdhui(),
    GlobalTaxCalculation: 'TaxExcluded',
    Line: lignesQbo(lignes, articleDe(produits, compagnie), reglages.taxes),
    CustomerMemo: { value: `Réservation ${r.numero} — ${r.nom}${note ? ` : ${note}` : ''}`.slice(0, 1000) },
    PrivateNote: `${genre === 'note_credit' ? 'Note de crédit' : 'Facture séparée (bris, hors forfait)'} créée par l'app de gestion (${r.numero}).`,
    ...(ctx.contact?.courriel ? { BillEmail: { Address: ctx.contact.courriel } } : {}),
    ...(entite === 'Invoice' && reglages.terme?.id ? { SalesTermRef: { value: reglages.terme.id } } : {}),
  })
  const facture = { ...normaliser(entite, resultat), reservation_id: r.id, genre }
  await ctx.db.rpc('qbo_recevoir_factures', { p_compagnie: r.compagnie_id, p_factures: [facture] })
  return facture
}

// ------------------------------------------------------------------
// Synchro (cron aux 15 minutes, et bouton « Mettre à jour »)
// ------------------------------------------------------------------

/** Facture ou note de crédit de QBO → ligne de reservations.factures. */
export function normaliser(entite, x) {
  return {
    qbo_type: entite,
    qbo_id: String(x.Id),
    numero: x.DocNumber ?? null,
    date_facture: x.TxnDate ?? null,
    echeance: x.DueDate ?? null,
    total: Number(x.TotalAmt ?? 0),
    solde: Number(x.Balance ?? x.RemainingCredit ?? 0),
    supprimee: x.status === 'Deleted',
    devis_qbo_id: (x.LinkedTxn ?? []).find((t) => t.TxnType === 'Estimate')?.TxnId ?? null,
  }
}

/** Entités changées d'une réponse de CDC : { Invoice: [...], CreditMemo: [...], Estimate: [...] }. */
export function lireCdc(reponse) {
  const sortie = {}
  for (const bloc of reponse?.CDCResponse ?? []) {
    for (const qr of bloc.QueryResponse ?? []) {
      for (const [cle, valeur] of Object.entries(qr)) {
        if (Array.isArray(valeur)) sortie[cle] = [...(sortie[cle] ?? []), ...valeur]
      }
    }
  }
  return sortie
}

/** Synchronise une compagnie : factures liées aux devis de l'app, soldes, devis modifiés dans QBO. */
export async function synchroniserCompagnie(env, compagnieId) {
  const db = base(env, 'reservations')
  const debut = new Date()
  try {
    const qbo = await clientQbo(env, compagnieId)
    const derniere = qbo.connexion.derniere_synchro ? Date.parse(qbo.connexion.derniere_synchro) - 10 * 60_000 : 0
    const plusTot = Date.now() - 29 * 86_400_000
    const depuis = new Date(Math.max(derniere, plusTot)).toISOString()
    const changes = lireCdc(await qbo.cdc(['Invoice', 'CreditMemo', 'Estimate'], depuis))
    const factures = [
      ...(changes.Invoice ?? []).map((x) => normaliser('Invoice', x)),
      ...(changes.CreditMemo ?? []).map((x) => normaliser('CreditMemo', x)),
    ]
    const recues = factures.length ? await db.rpc('qbo_recevoir_factures', { p_compagnie: compagnieId, p_factures: factures }) : 0
    // Devis modifiés à la main dans QBO : total et statut à jour (contrôle d'écart).
    for (const e of changes.Estimate ?? []) {
      if (e.status === 'Deleted') continue
      await db.modifier('qbo_devis', `compagnie_id=eq.${compagnieId}&qbo_id=eq.${e.Id}`, {
        total: Number(e.TotalAmt ?? 0),
        statut: e.TxnStatus ?? null,
        maj_le: new Date().toISOString(),
      })
    }
    await db.modifier('qbo_connexions', `compagnie_id=eq.${compagnieId}`, { derniere_synchro: debut.toISOString(), erreur: null })
    return { compagnie: compagnieId, factures: recues, devis: (changes.Estimate ?? []).length }
  } catch (e) {
    await db.modifier('qbo_connexions', `compagnie_id=eq.${compagnieId}`, { erreur: e.message.slice(0, 500) }).catch(() => {})
    throw e
  }
}

export async function synchroniserTout(env) {
  const connexions = await base(env, 'reservations').lire('qbo_connexions?select=compagnie_id')
  const bilans = []
  for (const c of connexions) {
    try {
      bilans.push(await synchroniserCompagnie(env, c.compagnie_id))
    } catch (e) {
      bilans.push({ compagnie: c.compagnie_id, erreur: e.message })
    }
  }
  return bilans
}
