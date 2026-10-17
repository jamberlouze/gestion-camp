// Pipeline de la Vigie de subventions (section 4 de la feuille de route,
// révisée le 2026-10-14).
//
// Quatre fois par année (début d'octobre, janvier, avril et juillet : les
// trimestres de l'année fiscale), le cron fait la recherche en deux temps,
// UN travail par passage (une recherche dure plusieurs minutes ; un appel du
// cron est limité à 15 minutes) :
//   a) recherche large, une entreprise active à la fois (rechercherEntreprise) ;
//   b) mise à jour ciblée des subventions retenues ou obtenues de chaque
//      entreprise (mettreAJourRetenues) : champ vide rempli, champ rempli qui
//      changerait = proposition à valider sur la fiche.
// Une panne est écrite dans le journal et n'empêche pas le reste.
//
// Aucun courriel jusqu'à nouvel ordre (décision de Maxime, 2026-10-14) : le
// rappel (courriel.js) reste dans le code, éteint par COURRIELS.

import { synchroniserAgenda } from './agenda.js'
import { base } from './base.js'
import { clientClaude, modele, rechercher, reparer, synthetiser } from './claude.js'
import { construireRappel, envoyerGmail, gmailConfigure } from './courriel.js'
import { invitationMemoire, invitationMiseAJour, invitationRecherche } from './invites.js'
import { extraireTableau, validerMisesAJour, validerProgrammes } from './resultats.js'

/** Courriels du module : aucun jusqu'à nouvel ordre. Le remettre = true (et revoir le texte du rappel). */
export const COURRIELS = false

export const rechercheConfiguree = (env) => !!(env.ANTHROPIC_API_KEY && env.SUPABASE_SECRET_KEY)

const messageDe = (e) => (e instanceof Error ? e.message : String(e))

function aujourdhui() {
  return new Intl.DateTimeFormat('fr-CA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Toronto',
  }).format(new Date())
}

/** 1er jour (0 h UTC) du trimestre de l'année fiscale : octobre, janvier, avril ou juillet. */
export function debutTrimestre(maintenant = new Date()) {
  return new Date(Date.UTC(maintenant.getUTCFullYear(), Math.floor(maintenant.getUTCMonth() / 3) * 3, 1))
}

/**
 * Passage du cron (aux 15 min) qui fait la recherche du trimestre : du 1er au
 * 7 octobre, janvier, avril et juillet, à l'heure pile de 8 h à 11 h UTC
 * (tôt le matin à Montréal). Tout est d'ordinaire fait le premier jour ;
 * les jours suivants rattrapent une panne du cron.
 */
export const estTourTrimestriel = (moment) =>
  moment.getUTCMonth() % 3 === 0 &&
  moment.getUTCDate() <= 7 &&
  moment.getUTCHours() >= 8 &&
  moment.getUTCHours() <= 11 &&
  moment.getUTCMinutes() < 15

/**
 * Étape 1 : mémoire. Résume tout le feedback du groupe en règles apprises
 * pour cette entreprise. Rien de neuf depuis le dernier résumé : on le
 * réutilise. Une panne ici n'empêche pas la recherche (dernier résumé).
 */
async function mettreAJourMemoire(db, claude, nom, entreprise) {
  const [derniere] = await db.lire(
    `grant_learned_rules?company_id=eq.${entreprise.id}&order=generated_at.desc&limit=1&select=id,summary,based_on_feedback_count,generated_at`,
  )
  try {
    const feedback = await db.rpc('feedback_pour_memoire')
    if (!feedback.length) return derniere ?? null
    const plusRecent = new Date(feedback[0].decided_at)
    if (derniere && derniere.based_on_feedback_count === feedback.length && plusRecent <= new Date(derniere.generated_at)) {
      return derniere
    }
    const summary = await synthetiser(claude, nom, invitationMemoire({ feedback, entreprise }))
    return await db.inserer('grant_learned_rules', {
      company_id: entreprise.id,
      summary,
      based_on_feedback_count: feedback.length,
    })
  } catch (e) {
    console.error(`Mémoire (${entreprise.name}) : ${messageDe(e)}`)
    return derniere ?? null
  }
}

/**
 * Recherche complète pour une entreprise : mémoire, journal, recherche,
 * validation, dédoublonnage et insertion. Renvoie le bilan ; en cas de
 * panne, l'erreur est écrite dans le journal puis relancée.
 */
export async function rechercherEntreprise(env, { entrepriseId, declencheur = 'cron', sansMemoire = false }) {
  const db = base(env)
  const [entreprise] = await db.lire(`grant_companies?id=eq.${entrepriseId}&select=*`)
  if (!entreprise) throw new Error('Entreprise introuvable.')
  const nom = modele(env)
  const claude = clientClaude(env)

  const regles = sansMemoire ? null : await mettreAJourMemoire(db, clientClaude(env, { delai: 5 * 60 * 1000, essais: 2 }), nom, entreprise)

  const run = await db.inserer('grant_search_runs', {
    company_id: entreprise.id,
    kind: 'large',
    trigger_source: declencheur,
    memory_version_id: regles?.id ?? null,
    model: nom,
  })

  let texte = null
  try {
    const [reglages, groupe, connus] = await Promise.all([
      db.lire('grant_settings?select=key,value'),
      db.lire('grant_companies?active=is.true&order=sort_order,name&select=id,name,legal_status'),
      // Une carte par programme pour tout le groupe, avec ses entreprises.
      db.lire('grants?select=program_name,source_url,status,program_key,discovered_fy,company_ids&order=discovered_at.desc&limit=400'),
    ])
    const consignes = reglages.find((r) => r.key === 'consignes_groupe')?.value
    const invite = invitationRecherche({
      entreprise,
      groupe,
      consignes: typeof consignes === 'string' ? consignes : '',
      regles: regles?.summary ?? null,
      connus,
      aujourdhui: aujourdhui(),
    })

    const reponse = await rechercher(claude, nom, invite)
    texte = reponse.texte

    let elements
    try {
      elements = extraireTableau(texte)
    } catch (e) {
      // Sortie mal formée : une tentative de remise au format.
      console.warn(`Réponse illisible (${entreprise.name}) : ${messageDe(e)} — rattrapage`)
      elements = await reparer(clientClaude(env, { delai: 5 * 60 * 1000, essais: 2 }), nom, texte)
    }
    const { valides, invalides } = validerProgrammes(elements)
    const bilan = await db.rpc('inserer_resultats', { p_run: run.id, p_items: valides })

    await db.modifier('grant_search_runs', `id=eq.${run.id}`, {
      finished_at: new Date().toISOString(),
      invalid_count: invalides.length,
      input_tokens: reponse.usage.input_tokens,
      output_tokens: reponse.usage.output_tokens,
      web_search_count: reponse.usage.web_search_requests,
      error: reponse.fin === 'max_tokens' ? 'Réponse coupée (limite de longueur) : liste peut-être incomplète.' : null,
      raw_output: invalides.length ? `Éléments écartés : ${invalides.join(' ; ')}\n\n${texte}`.slice(0, 20000) : null,
    })
    return { run: run.id, entreprise: entreprise.name, ...bilan, invalid: invalides.length }
  } catch (e) {
    await db
      .modifier('grant_search_runs', `id=eq.${run.id}`, {
        finished_at: new Date().toISOString(),
        error: messageDe(e).slice(0, 2000),
        raw_output: texte ? texte.slice(0, 20000) : null,
      })
      .catch((e2) => console.error(`Journal (${entreprise.name}) : ${messageDe(e2)}`))
    throw e
  }
}

/** Contenu du rappel : nouvelles trouvées par Claude depuis `depuis`. */
async function preparerRappel(env, db, depuis, { essai = false } = {}) {
  const iso = encodeURIComponent(depuis.toISOString())
  const [entreprises, nouvelles, erreurs] = await Promise.all([
    db.lire('grant_companies?active=is.true&order=sort_order,name&select=id,name'),
    db.lire(
      `grants?origin=eq.claude&discovered_at=gte.${iso}&select=program_name,grant_type,company_ids,potential_amount_min,potential_amount_max,deadline_date&order=discovered_at`,
    ),
    db.lire(
      `grant_search_runs?started_at=gte.${iso}&error=not.is.null${essai ? '' : '&trigger_source=eq.cron'}&select=company_id,error&order=started_at.desc`,
    ),
  ])
  const lien = `${(env.APP_URL ?? '').replace(/\/+$/, '')}/subventions`
  return { ...construireRappel({ entreprises, nouvelles, erreurs, lien, essai }), nouvelles: nouvelles.length }
}

/**
 * Mise à jour ciblée des subventions retenues (en cours) ou obtenues d'une
 * entreprise : 10 au plus par appel, les moins récemment vérifiées d'abord
 * (`trimestre` : seulement celles pas encore vérifiées ce trimestre). Rien à
 * vérifier : aucun appel à Claude. Renvoie le bilan ; en cas de panne,
 * l'erreur est écrite dans le journal puis relancée.
 */
export async function mettreAJourRetenues(env, { entrepriseId, declencheur = 'cron', trimestre = false }) {
  const db = base(env)
  const [entreprise] = await db.lire(`grant_companies?id=eq.${entrepriseId}&select=*`)
  if (!entreprise) throw new Error('Entreprise introuvable.')
  const aVerifier = await db.rpc('retenues_a_verifier', {
    p_company: entreprise.id,
    p_depuis: trimestre ? debutTrimestre().toISOString() : null,
    p_max: 10,
  })
  if (!aVerifier.length) return { run: null, entreprise: entreprise.name, checked: 0, filled: 0, proposed: 0, new: 0, duplicate: 0, invalid: 0 }

  const nom = modele(env)
  const run = await db.inserer('grant_search_runs', {
    company_id: entreprise.id,
    kind: 'ciblee',
    trigger_source: declencheur,
    model: nom,
  })

  let texte = null
  try {
    const subventions = aVerifier.map((g, i) => ({ ...g, ref: `S${i + 1}` }))
    const parRef = new Map(subventions.map((g) => [g.ref, g]))
    const reponse = await rechercher(clientClaude(env), nom, invitationMiseAJour({ entreprise, subventions, aujourdhui: aujourdhui() }))
    texte = reponse.texte

    let elements
    try {
      elements = extraireTableau(texte)
    } catch (e) {
      console.warn(`Réponse illisible (${entreprise.name}, mise à jour) : ${messageDe(e)} — rattrapage`)
      elements = await reparer(clientClaude(env, { delai: 5 * 60 * 1000, essais: 2 }), nom, texte, 'mises_a_jour')
    }
    const { valides, invalides } = validerMisesAJour(elements, parRef)
    const bilan = await db.rpc('appliquer_mise_a_jour', {
      p_run: run.id,
      p_items: valides,
      p_grants: aVerifier.map((g) => g.id),
    })

    await db.modifier('grant_search_runs', `id=eq.${run.id}`, {
      finished_at: new Date().toISOString(),
      invalid_count: invalides.length,
      input_tokens: reponse.usage.input_tokens,
      output_tokens: reponse.usage.output_tokens,
      web_search_count: reponse.usage.web_search_requests,
      error: reponse.fin === 'max_tokens' ? 'Réponse coupée (limite de longueur) : mise à jour peut-être incomplète.' : null,
      raw_output: invalides.length ? `Éléments écartés : ${invalides.join(' ; ')}\n\n${texte}`.slice(0, 20000) : null,
    })
    return { run: run.id, entreprise: entreprise.name, ...bilan, invalid: invalides.length }
  } catch (e) {
    await db
      .modifier('grant_search_runs', `id=eq.${run.id}`, {
        finished_at: new Date().toISOString(),
        error: messageDe(e).slice(0, 2000),
        raw_output: texte ? texte.slice(0, 20000) : null,
      })
      .catch((e2) => console.error(`Journal (${entreprise.name}) : ${messageDe(e2)}`))
    throw e
  }
}

/**
 * Rappel du trimestre, une seule fois (la ligne de grant_digests, clé = 1er
 * jour du trimestre, est créée avant l'envoi). ÉTEINT : COURRIELS = false.
 */
export async function envoyerRappel(env) {
  if (!COURRIELS) return 'courriels désactivés'
  const db = base(env)
  const debut = debutTrimestre()
  const cle = debut.toISOString().slice(0, 10)
  const [deja] = await db.lire(`grant_digests?week_start=eq.${cle}&select=week_start`)
  if (deja) return 'déjà envoyé'
  const [rappel, destinataires] = await Promise.all([preparerRappel(env, db, debut), db.rpc('destinataires')])
  try {
    await db.inserer('grant_digests', { week_start: cle, recipients: destinataires, new_count: rappel.nouvelles })
  } catch (e) {
    if (messageDe(e).includes('duplicate key')) return 'déjà envoyé'
    throw e
  }
  try {
    await envoyerGmail(env, { a: destinataires, ...rappel })
    return `envoyé à ${destinataires.length} personne(s)`
  } catch (e) {
    await db.modifier('grant_digests', `week_start=eq.${cle}`, { error: messageDe(e).slice(0, 1000) })
    throw e
  }
}

/** Courriel d'essai (route /api/subventions/courriel) : 7 derniers jours, à une seule personne. ÉTEINT avec COURRIELS. */
export async function envoyerRappelEssai(env, courriel) {
  if (!COURRIELS) throw new Error('Ce module n’envoie aucun courriel (jusqu’à nouvel ordre).')
  const db = base(env)
  const rappel = await preparerRappel(env, db, new Date(Date.now() - 7 * 24 * 3600 * 1000), { essai: true })
  await envoyerGmail(env, { a: [courriel], ...rappel })
}

/** Un passage du cron du trimestre : le travail suivant (recherche large, puis mises à jour ciblées). */
export async function tourTrimestriel(env) {
  if (!rechercheConfiguree(env)) {
    console.log('Vigie de subventions : secrets ANTHROPIC_API_KEY ou SUPABASE_SECRET_KEY manquants, rien à faire.')
    return
  }
  const db = base(env)
  const [actif] = await db.lire('grant_settings?key=eq.recherche_active&select=value')
  if (actif?.value === false) {
    console.log('Vigie de subventions : recherche automatique en pause (Réglages).')
    return
  }

  const tache = await db.rpc('prochaine_tache_trimestre')
  if (tache?.company_id) {
    try {
      const bilan =
        tache.kind === 'ciblee'
          ? await mettreAJourRetenues(env, { entrepriseId: tache.company_id, declencheur: 'cron', trimestre: true })
          : await rechercherEntreprise(env, { entrepriseId: tache.company_id, declencheur: 'cron' })
      console.log(`Vigie de subventions (${tache.kind}) : ${JSON.stringify(bilan)}`)
    } catch (e) {
      console.error(`Vigie de subventions (${tache.kind}) : ${messageDe(e)}`)
    }
    return
  }
  if (COURRIELS) {
    if (!gmailConfigure(env)) console.log('Vigie de subventions : Gmail non configuré, le rappel sera noté en erreur.')
    try {
      console.log(`Vigie de subventions, rappel : ${await envoyerRappel(env)}`)
    } catch (e) {
      console.error(`Vigie de subventions, rappel : ${messageDe(e)}`)
    }
  }
}

/**
 * Chaque passage du cron (aux 15 min, worker/index.js) : l'agenda Google
 * (rien si le réglage est inactif), les subventions échues expirées une
 * fois par jour (8 h UTC), et la recherche du trimestre à ses passages.
 */
export async function passageSubventions(env, moment = new Date()) {
  if (!env.SUPABASE_SECRET_KEY) return
  const travaux = [
    synchroniserAgenda(env).then((r) => {
      if (r.faites || r.erreurs) console.log(`Vigie de subventions, agenda : ${JSON.stringify(r)}`)
    }),
  ]
  if (moment.getUTCHours() === 8 && moment.getUTCMinutes() < 15) travaux.push(base(env).rpc('expirer_echues'))
  if (estTourTrimestriel(moment)) travaux.push(tourTrimestriel(env))
  await Promise.all(travaux.map((t) => t.catch((e) => console.error(`Vigie de subventions : ${messageDe(e)}`))))
}
