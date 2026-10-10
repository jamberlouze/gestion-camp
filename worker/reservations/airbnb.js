// Réservations Airbnb de la Vieille-France (plan §10, phase 6) : les deux
// annonces (VF complète, VF étage du bas) sont lues dans leur iCal aux 15
// minutes. Seuls les événements « Reserved » sont des réservations ; les
// « Airbnb (Not available) » sont des blocages (dont ceux qui viennent de
// notre propre calendrier Confirmée VF) et sont ignorés.
// Secrets : AIRBNB_ICAL_VF_COMPLET, AIRBNB_ICAL_VF_BAS (adresses d'export
// iCal des annonces ; .dev.vars en DEV, Cloudflare en PROD).

import { base } from '../subventions/base.js'

const ANNONCES = [
  ['vf_complet', 'AIRBNB_ICAL_VF_COMPLET'],
  ['vf_bas', 'AIRBNB_ICAL_VF_BAS'],
]

export const airbnbConfigure = (env) => ANNONCES.some(([, cle]) => env[cle])

const jour = (v) => (/^(\d{4})(\d{2})(\d{2})/.exec(v ?? '') ?? []).slice(1, 4).join('-') || null

/** Événements d'un iCal (lignes dépliées, propriétés sans paramètres). */
export function lireIcal(texte) {
  const lignes = String(texte).replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n')
  const evenements = []
  let courant = null
  for (const ligne of lignes) {
    if (ligne === 'BEGIN:VEVENT') courant = {}
    else if (ligne === 'END:VEVENT') {
      if (courant) evenements.push(courant)
      courant = null
    } else if (courant) {
      const i = ligne.indexOf(':')
      if (i > 0) courant[ligne.slice(0, i).split(';')[0]] = ligne.slice(i + 1)
    }
  }
  return evenements.map((e) => ({
    uid: e.UID ?? null,
    arrivee: jour(e.DTSTART),
    depart: jour(e.DTEND),
    resume: e.SUMMARY ?? '',
    description: (e.DESCRIPTION ?? '').replace(/\\n/g, '\n').replace(/\\([,;\\])/g, '$1'),
  }))
}

/** Les vraies réservations (« Reserved »), avec le lien de la réservation dans Airbnb. */
export const reservationsAirbnb = (evenements) =>
  evenements
    .filter((e) => e.uid && e.arrivee && e.depart && /^reserved$/i.test(e.resume.trim()))
    .map((e) => ({
      uid: e.uid,
      arrivee: e.arrivee,
      depart: e.depart,
      lien: /https:\/\/www\.airbnb\.[a-z.]+\/hosting\/reservations\/details\/[A-Za-z0-9]+/.exec(e.description)?.[0] ?? null,
    }))

/** Lit les deux annonces et met les réservations Airbnb à jour ; garde le bilan dans le réglage « airbnb_lecture ». */
export async function importerAirbnb(env) {
  const db = base(env, 'reservations')
  const bilan = { quand: new Date().toISOString(), annonces: {}, erreurs: [] }
  for (const [annonce, cle] of ANNONCES) {
    if (!env[cle]) continue
    try {
      const res = await fetch(env[cle], { headers: { Accept: 'text/calendar' } })
      if (!res.ok) throw new Error(`Airbnb a répondu ${res.status}`)
      const texte = await res.text()
      // Une réponse qui n'est pas un calendrier n'annule rien.
      if (!texte.includes('BEGIN:VCALENDAR')) throw new Error('réponse sans calendrier')
      const evenements = reservationsAirbnb(lireIcal(texte))
      bilan.annonces[annonce] = { reservations: evenements.length, ...(await db.rpc('recevoir_airbnb', { p_annonce: annonce, p_evenements: evenements })) }
    } catch (e) {
      bilan.erreurs.push(`${annonce} : ${e.message}`)
    }
  }
  const [deja] = await db.lire('reglages?cle=eq.airbnb_lecture&select=cle')
  if (deja) await db.modifier('reglages', 'cle=eq.airbnb_lecture', { valeur: bilan })
  else await db.inserer('reglages', { cle: 'airbnb_lecture', valeur: bilan })
  return bilan
}
