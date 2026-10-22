// Agenda Google « Subventions » : les dates des subventions retenues
// (ouverture, date limite) et les échéances de reddition des lignes de suivi
// acceptées (règles dans src/modules/subventions/agenda.ts). À chaque passage du cron
// (15 min) et tout de suite depuis la fiche (POST /api/subventions/agenda).
// Ce qui a été écrit est gardé dans subventions.grant_calendar_events.
//
// - Rien tant que le réglage « agenda » n'est pas actif (Réglages).
// - En DEV (base locale), jamais Google : simulé (agenda « essai-… »).
// - En PROD : GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET et un jeton de portée
//   calendar.events, SUBVENTIONS_AGENDA_REFRESH_TOKEN (sinon celui des
//   Réservations, GOOGLE_AGENDA_REFRESH_TOKEN), autorisé par un compte qui
//   peut modifier l'agenda « Subventions » (README, section 8).

import { actionsAgenda, evenementsVoulus, REGLAGE_AGENDA_DEFAUT, STATUTS_AGENDA } from '../../src/modules/subventions/agenda.ts'
import { clientAgenda, modeAgenda as modeGoogle } from '../commun/agendaGoogle.js'
import { base } from './base.js'

export const JETONS_AGENDA = ['SUBVENTIONS_AGENDA_REFRESH_TOKEN', 'GOOGLE_AGENDA_REFRESH_TOKEN']
export const modeAgenda = (env) => modeGoogle(env, JETONS_AGENDA)

const CHAMPS = 'id,program_name,status,open_date,deadline_date,source_url,potential_amount_min,potential_amount_max'

/**
 * Met l'agenda à jour : une subvention (`grantId`, depuis la fiche) ou
 * toutes (cron). Au plus `max` appels à Google par passage ; le reste
 * attend le passage suivant.
 */
export async function synchroniserAgenda(env, { grantId = null, max = 25 } = {}) {
  const db = base(env)
  const mode = modeAgenda(env)
  const [reglage] = await db.lire('grant_settings?key=eq.agenda&select=value')
  const config = { ...REGLAGE_AGENDA_DEFAUT, ...(reglage?.value ?? {}) }
  const calendrier = String(config.calendrier ?? '').trim()
  if (!config.actif) return { actif: false, mode, faites: 0, restantes: 0 }
  if (!calendrier) return { actif: true, mode, faites: 0, restantes: 0, erreur: 'Identifiant de l’agenda pas encore réglé (Réglages).' }
  if (mode === 'non_configure') {
    return { actif: true, mode, faites: 0, restantes: 0, erreur: 'Google Agenda n’est pas configuré (secret SUBVENTIONS_AGENDA_REFRESH_TOKEN : README, section 8).' }
  }

  const [subventions, suivis, etapes, entreprises, lignes] = await Promise.all([
    db.lire(`grants?select=${CHAMPS}&${grantId ? `id=eq.${grantId}` : `status=in.(${STATUTS_AGENDA.join(',')})`}`),
    db.lire(`grant_applications?select=id,grant_id,company_id,status,amount_granted&order=created_at${grantId ? `&grant_id=eq.${grantId}` : ''}`),
    db.lire(`grant_reporting_steps?select=id,application_id,description,due_date,status${grantId ? `&grant_id=eq.${grantId}` : ''}`),
    db.lire('grant_companies?select=id,name'),
    db.lire(`grant_calendar_events?select=*${grantId ? `&grant_id=eq.${grantId}` : ''}`),
  ])
  const noms = new Map(entreprises.map((e) => [e.id, e.name]))
  const racine = (env.APP_URL ?? '').replace(/\/+$/, '')
  const voulus = evenementsVoulus(subventions, suivis, etapes, {
    entreprise: (id) => noms.get(id),
    lien: (id) => `${racine}/subventions/fiche/${id}`,
    depuis: String(config.depuis ?? REGLAGE_AGENDA_DEFAUT.depuis),
  })
  const actions = actionsAgenda(voulus, lignes, calendrier)
  if (!actions.length) return { actif: true, mode, faites: 0, restantes: 0 }

  const google = await clientAgenda(env, mode, JETONS_AGENDA)
  const ecrire = async (cle, grant, champs) => {
    const ligne = { ...champs, synced_at: new Date().toISOString() }
    if (lignes.some((l) => l.event_key === cle)) await db.modifier('grant_calendar_events', `event_key=eq.${encodeURIComponent(cle)}`, ligne)
    else await db.inserer('grant_calendar_events', { event_key: cle, grant_id: grant, ...ligne })
  }

  let faites = 0
  let erreurs = 0
  for (const a of actions.slice(0, max)) {
    const cle = a.genre === 'retirer' ? a.ligne.event_key : a.voulu.cle
    try {
      if (a.genre === 'retirer') {
        if (a.ligne.google_id && a.ligne.calendar_id) await google.retirer(a.ligne.calendar_id, a.ligne.google_id)
        await db.supprimer('grant_calendar_events', `event_key=eq.${encodeURIComponent(cle)}`)
      } else {
        let id
        if (a.genre === 'creer') id = await google.creer(calendrier, a.voulu.evenement)
        else if (a.genre === 'modifier') id = await google.remplacer(calendrier, a.ligne.google_id, a.voulu.evenement)
        else {
          await google.retirer(a.ligne.calendar_id, a.ligne.google_id)
          id = await google.creer(calendrier, a.voulu.evenement)
        }
        await ecrire(cle, a.voulu.grant_id, { calendar_id: calendrier, google_id: id, content: a.contenu, error: null })
      }
      faites++
    } catch (e) {
      erreurs++
      const message = String(e?.message ?? e).slice(0, 500)
      if (a.genre === 'retirer') await db.modifier('grant_calendar_events', `event_key=eq.${encodeURIComponent(cle)}`, { error: message }).catch(() => {})
      else await ecrire(cle, a.voulu.grant_id, { error: message }).catch(() => {})
    }
  }
  return { actif: true, mode, faites, erreurs, restantes: Math.max(0, actions.length - max) }
}
