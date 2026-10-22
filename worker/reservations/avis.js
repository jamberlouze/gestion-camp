// Avis à l'équipe (décision de Maxime du 2026-10-21 : à inscriptions@) pour
// toute nouvelle demande (formulaire /demande) et toute demande de changement
// du client (page client, reservations.confirmations genre « changement »).
// Courriel interne, court, hors du fil du client : groupe, dates, ce qui est
// demandé (pour un changement : avant → après), lien vers la fiche dans
// l'app (APP_URL : admin.camptremblant.com en PROD, localhost en DEV).
//
// Déclencheur : la colonne avis_envoye_le, prise d'un coup par
// reservations.avis_prendre (deux passages n'envoient jamais deux fois ;
// rendue si l'envoi rate), à la réception d'une demande, à l'ouverture d'une
// fiche ou de l'onglet Courriels (POST /api/reservations/preparer) et aux 15
// minutes (cron) — un changement proposé sur la page client part donc au
// plus tard 15 minutes après. Rien de plus de 2 jours (pas de rafale le jour où Gmail
// est configuré) ; rien tant que les courriels ne peuvent pas partir.

import { datesSejour, NOMS_FORFAIT } from '../../src/modules/reservations/courriels.ts'
import { base } from '../subventions/base.js'
import { envoyerInterne, expediteur, modeEnvoi, refusEnvoi } from './courriels.js'

const lienFiche = (env, id) => `${String(env.APP_URL ?? '').replace(/\/$/, '')}/reservations/r/${id}`
const dates = (r) => (r.date_arrivee && r.date_depart ? datesSejour(r.date_arrivee, r.date_depart, 'fr') : 'à préciser')
const ligne = (etiquette, valeur) => (valeur ? `${etiquette} : ${valeur}` : null)
const court = (t, n = 600) => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim()
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

/** Nouvelle demande reçue par le formulaire. */
export function avisDemande(env, d) {
  const r = d.r
  const q = d.reponses ?? {}
  const personnes =
    r.nb_participants !== null && r.nb_participants !== undefined
      ? `${r.nb_participants}${r.nb_accompagnateurs ? ` + ${r.nb_accompagnateurs} accompagnateurs` : ''}`
      : null
  const responsable = [`${q.resp_prenom ?? ''} ${q.resp_nom ?? ''}`.trim(), q.resp_courriel, q.resp_telephone].filter(Boolean).join(' · ')
  const texte = [
    `Nouvelle demande de réservation reçue par le formulaire${d.par_lien ? " (lien de l'organisation)" : ''}${d.langue === 'en' ? ', en anglais' : ''}.`,
    '',
    ligne('Groupe', `${r.nom}${q.organisation && q.organisation !== r.nom ? ` (${q.organisation})` : ''}`),
    ligne('Forfait', NOMS_FORFAIT[r.forfait] ?? r.forfait),
    ligne('Dates', dates(r)),
    ligne('Participants', personnes),
    ligne('Responsable', responsable),
    ligne('Description', court(q.description)),
    ligne('Commentaires', court(q.commentaires)),
    '',
    `Fiche : ${lienFiche(env, r.id)}`,
  ]
    .filter((x) => x !== null)
    .join('\n')
  return { sujet: `Nouvelle demande · ${r.numero} · ${r.nom}`, texte }
}

/** Changement proposé par le client sur sa page. */
export function avisChangement(env, c) {
  const r = c.r
  const texte = [
    `${c.nom} (client) propose un changement au séjour sur sa page.`,
    '',
    ligne('Groupe', r.nom),
    ligne('Forfait', NOMS_FORFAIT[r.forfait] ?? r.forfait),
    ligne('Dates actuelles', dates(r)),
    `Changement demandé :\n${(c.texte || '—')
      .split(' ; ')
      .map((x) => `  · ${x}`)
      .join('\n')}`,
    ligne('Message du client', c.message ? `« ${court(c.message, 1500)} »` : null),
    '',
    `À accepter ou refuser sur la fiche : ${lienFiche(env, r.id)}`,
  ]
    .filter((x) => x !== null)
    .join('\n')
  return { sujet: `Changement demandé · ${r.numero} · ${r.nom}`, texte }
}

/** Envoie les avis dus. Rend { envoyes, erreurs }. */
export async function envoyerAvis(env) {
  if (refusEnvoi(modeEnvoi(env)) || !env.SUPABASE_SECRET_KEY) return { envoyes: 0, erreurs: 0 }
  const db = base(env, 'reservations')
  const pris = await db.rpc('avis_prendre')
  const a = [expediteur(env)]
  let envoyes = 0
  let erreurs = 0
  const envoyer = async (avis, rendre) => {
    try {
      await envoyerInterne(env, { a, ...avis })
      envoyes++
    } catch (e) {
      erreurs++
      console.error('Avis à l’équipe non envoyé :', e)
      await db.rpc('avis_rendre', rendre).catch(() => {})
    }
  }
  for (const d of pris?.demandes ?? []) await envoyer(avisDemande(env, d), { p_demande: d.id, p_changement: null })
  for (const c of pris?.changements ?? []) await envoyer(avisChangement(env, c), { p_demande: null, p_changement: c.id })
  return { envoyes, erreurs }
}
