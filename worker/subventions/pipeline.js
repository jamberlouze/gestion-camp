// Pipeline hebdomadaire (section 4 de la feuille de route).
//
// Le cron du lundi (8 h, 9 h, 10 h et 11 h UTC, soit tôt le matin à
// l'heure de l'Est) appelle tourHebdomadaire : chaque appel traite UNE
// entreprise (une recherche dure plusieurs minutes ; un appel du cron est
// limité à 15 minutes). Quand toutes les entreprises actives ont leur
// recherche de la semaine, le courriel de rappel part (une fois).
// Une panne sur une entreprise est écrite dans son journal et n'empêche
// pas les autres.

import { base } from './base.js'
import { clientClaude, modele, rechercher, reparer, synthetiser } from './claude.js'
import { construireRappel, envoyerGmail, gmailConfigure } from './courriel.js'
import { invitationMemoire, invitationRecherche } from './invites.js'
import { extraireTableau, validerProgrammes } from './resultats.js'

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

/** Lundi 0 h UTC de la semaine (même borne que date_trunc('week', now())). */
export function debutSemaine(maintenant = new Date()) {
  const jour = (maintenant.getUTCDay() + 6) % 7
  return new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate() - jour))
}

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
    trigger_source: declencheur,
    memory_version_id: regles?.id ?? null,
    model: nom,
  })

  let texte = null
  try {
    const [reglages, groupe, connus] = await Promise.all([
      db.lire('grant_settings?select=key,value'),
      db.lire('grant_companies?active=is.true&order=sort_order,name&select=name,legal_status'),
      db.lire(
        `grants?target_company_id=eq.${entreprise.id}&select=program_name,source_url,status,program_key,discovered_fy&order=discovered_at.desc&limit=400`,
      ),
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
      `grants?origin=eq.claude&discovered_at=gte.${iso}&select=program_name,grant_type,target_company_id,potential_amount_min,potential_amount_max,deadline_date&order=discovered_at`,
    ),
    db.lire(
      `grant_search_runs?started_at=gte.${iso}&error=not.is.null${essai ? '' : '&trigger_source=eq.cron'}&select=company_id,error&order=started_at.desc`,
    ),
  ])
  const lien = `${(env.APP_URL ?? '').replace(/\/+$/, '')}/subventions`
  return { ...construireRappel({ entreprises, nouvelles, erreurs, lien, essai }), nouvelles: nouvelles.length }
}

/**
 * Étape 6 : le courriel de la semaine, une seule fois (la ligne de
 * grant_digests est créée avant l'envoi : deux appels ne peuvent pas
 * l'envoyer deux fois). Les subventions échues sont d'abord expirées.
 */
export async function envoyerRappelHebdo(env) {
  const db = base(env)
  const semaine = debutSemaine()
  const cle = semaine.toISOString().slice(0, 10)
  const [deja] = await db.lire(`grant_digests?week_start=eq.${cle}&select=week_start`)
  if (deja) return 'déjà envoyé'

  await db.rpc('expirer_echues')
  const [rappel, destinataires] = await Promise.all([preparerRappel(env, db, semaine), db.rpc('destinataires')])
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

/** Courriel d'essai (bouton de l'onglet Recherches) : 7 derniers jours, à une seule personne. */
export async function envoyerRappelEssai(env, courriel) {
  const db = base(env)
  const rappel = await preparerRappel(env, db, new Date(Date.now() - 7 * 24 * 3600 * 1000), { essai: true })
  await envoyerGmail(env, { a: [courriel], ...rappel })
}

/** Un appel du cron du lundi : la prochaine entreprise, puis le courriel si la semaine est finie. */
export async function tourHebdomadaire(env) {
  if (!rechercheConfiguree(env)) {
    console.log('Vigie de subventions : secrets ANTHROPIC_API_KEY ou SUPABASE_SECRET_KEY manquants, rien à faire.')
    return
  }
  const db = base(env)
  const [actif] = await db.lire('grant_settings?key=eq.recherche_active&select=value')
  if (actif?.value === false) {
    console.log('Vigie de subventions : recherche hebdomadaire en pause (Réglages).')
    return
  }

  const id = await db.rpc('prochaine_entreprise_hebdo')
  if (id) {
    try {
      const bilan = await rechercherEntreprise(env, { entrepriseId: id, declencheur: 'cron' })
      console.log(`Vigie de subventions : ${JSON.stringify(bilan)}`)
    } catch (e) {
      console.error(`Vigie de subventions : ${messageDe(e)}`)
    }
  }

  if (await db.rpc('semaine_terminee')) {
    if (!gmailConfigure(env)) console.log('Vigie de subventions : Gmail non configuré, le rappel sera noté en erreur.')
    try {
      console.log(`Vigie de subventions, rappel : ${await envoyerRappelHebdo(env)}`)
    } catch (e) {
      console.error(`Vigie de subventions, rappel : ${messageDe(e)}`)
    }
  }
}
