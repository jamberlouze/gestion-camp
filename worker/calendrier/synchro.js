// Calendrier des opérations : synchro à sens unique Airtable → Supabase
// (calendrier.sejours). Jamais d'écriture dans Airtable.
//
// Source : base « Réservation Groupes » (table Réservations). Les champs
// sont lus par leur identifiant (fld…) : renommer un champ dans Airtable ne
// casse rien ; le supprimer ou le remplacer, oui — mettre CHAMPS à jour.
// Secrets Cloudflare : AIRTABLE_TOKEN (jeton personnel, droit
// data.records:read sur la base) et SUPABASE_SECRET_KEY.

import { base } from '../subventions/base.js'

export const AIRTABLE = {
  base: 'appJLHSRSayvzzSST',
  reservations: 'tblOFT5bIV6gG9W2N',
  clients: 'tbldOmSW4gDgWsbT2',
  typesSejour: 'tblu1djxG6SnQE2gA',
  listePrix: 'tbl4Hm5ANF0tGeIPw',
}

export const CHAMPS = {
  numero: 'fldqkN4A5erhl5WHI', // Numéro de la réservation (« 26-G-54 »)
  typeSejour: 'fldXkXwF9ZRySRqFh', // lien → Type de séjour
  client: 'fldPuFu1m9Qv53HkM', // lien → Client
  arrivee: 'fldXJUSM5QOCVXeiF', // date et heure (fuseau America/Toronto)
  depart: 'fldZV2Elvr9Wsfl4l',
  participants: 'fld1F9kHaMBiQVJEZ',
  serviceRepas: 'fldIl21Go6RpOZ6rL', // Oui / Non
  hebergement: 'fldvfwr4pLv2qLcO4', // lien → Liste de prix
  batiment: 'fldhgRUGh1ZVrrZvU', // Bâtiment (from Hébergement) : PP, VF…
  animateurs: 'fldJsGAMxLdD5QKyZ', // Nombre d'animateur requis
  notes: 'fldNgb9wzmv3MF9fQ', // Commentaires / Notes internes
  etat: 'fldSF6dCFXHelpruk', // État de la réservation
  // Tables liées
  nomClient: 'fldkj0OXK0mp8O0Ew',
  nomTypeSejour: 'fldhYFyp6Cou9Mvxw',
  typeAvecAnimation: 'fldcGYVCoXdbyZKQQ', // Animation? (case)
  nomHebergement: 'fldn9DlCzaAxNWdi4', // Item : « Cèdres haut (36 lits - 7 chambres) »
}

const FUSEAU = 'America/Toronto'

/** Lit toutes les lignes d'une table (pages de 100), champs par identifiant. */
async function lireTable(env, table, champs) {
  const lignes = []
  let offset
  do {
    const params = new URLSearchParams({ returnFieldsByFieldId: 'true', pageSize: '100' })
    for (const c of champs) params.append('fields[]', c)
    if (offset) params.set('offset', offset)
    const res = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID || AIRTABLE.base}/${table}?${params}`, {
      headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` },
    })
    if (!res.ok) throw new Error(`Airtable a répondu ${res.status} : ${(await res.text()).slice(0, 300)}`)
    const page = await res.json()
    lignes.push(...page.records)
    offset = page.offset
  } while (offset)
  return lignes
}

/** « 2026-10-14T20:00:00.000Z » → date et heure locales (« 2026-10-14 », « 16:00 »). */
export function dateLocale(iso) {
  if (!iso) return { date: null, heure: null }
  const parties = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: FUSEAU,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  )
  return { date: `${parties.year}-${parties.month}-${parties.day}`, heure: `${parties.hour}:${parties.minute}` }
}

const texte = (v) => {
  if (v == null) return null
  if (typeof v === 'object' && 'name' in v) return v.name
  const t = String(v).trim()
  return t || null
}
const nombre = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null)
const unique = (liste) => [...new Set(liste.filter(Boolean))]
/** « Cèdres haut (36 lits - 7 chambres) » → « Cèdres haut » */
const sansCapacite = (nom) => nom.replace(/\s*\([^)]*\)\s*$/, '').trim()

/**
 * Réservation Airtable → ligne de calendrier.sejours (fonction pure).
 * `liens` : noms des fiches liées, par identifiant de fiche.
 * Renvoie null si la réservation n'a pas de dates (pas affichable).
 */
export function versSejour(fiche, liens) {
  const f = fiche.fields ?? {}
  const arrivee = dateLocale(f[CHAMPS.arrivee])
  const depart = dateLocale(f[CHAMPS.depart] ?? f[CHAMPS.arrivee])
  if (!arrivee.date) return null

  const ids = (champ) => (Array.isArray(f[champ]) ? f[champ] : [])
  const clients = unique(ids(CHAMPS.client).map((id) => liens.clients.get(id)))
  const types = ids(CHAMPS.typeSejour).map((id) => liens.types.get(id)).filter(Boolean)
  const hebergements = unique(ids(CHAMPS.hebergement).map((id) => liens.hebergements.get(id)).map((n) => n && sansCapacite(n)))
  const batiments = unique((Array.isArray(f[CHAMPS.batiment]) ? f[CHAMPS.batiment] : [f[CHAMPS.batiment]]).map(texte))
  const numero = texte(f[CHAMPS.numero])
  const animateurs = nombre(f[CHAMPS.animateurs])

  return {
    airtable_record_id: fiche.id,
    numero,
    nom_groupe: clients.join(', ') || numero || 'Réservation sans client',
    type_sejour: types.map((t) => t.nom).join(', ') || null,
    etat: texte(f[CHAMPS.etat]),
    date_arrivee: arrivee.date,
    // Départ avant l'arrivée (saisie en cours) : séjour d'un jour.
    date_depart: depart.date && depart.date >= arrivee.date ? depart.date : arrivee.date,
    heure_arrivee: arrivee.heure,
    heure_depart: depart.heure,
    section_batiment: hebergements.join(', ') || null,
    batiment: batiments.join(', ') || null,
    nb_participants: nombre(f[CHAMPS.participants]),
    nb_animateurs: animateurs,
    avec_animation: types.some((t) => t.animation) || (animateurs ?? 0) > 0,
    avec_repas: texte(f[CHAMPS.serviceRepas]) === 'Oui',
    notes: texte(f[CHAMPS.notes]),
    raw: f,
  }
}

export const synchroConfiguree = (env) => !!env.AIRTABLE_TOKEN && !!env.SUPABASE_SECRET_KEY

/** Lit Airtable au complet et met calendrier.sejours à jour (une transaction). */
export async function synchroniser(env, source = 'cron') {
  const db = base(env, 'calendrier')
  try {
    const [reservations, clients, types, prix] = await Promise.all([
      lireTable(env, AIRTABLE.reservations, [
        CHAMPS.numero, CHAMPS.typeSejour, CHAMPS.client, CHAMPS.arrivee, CHAMPS.depart, CHAMPS.participants,
        CHAMPS.serviceRepas, CHAMPS.hebergement, CHAMPS.batiment, CHAMPS.animateurs, CHAMPS.notes, CHAMPS.etat,
      ]),
      lireTable(env, AIRTABLE.clients, [CHAMPS.nomClient]),
      lireTable(env, AIRTABLE.typesSejour, [CHAMPS.nomTypeSejour, CHAMPS.typeAvecAnimation]),
      lireTable(env, AIRTABLE.listePrix, [CHAMPS.nomHebergement]),
    ])
    const liens = {
      clients: new Map(clients.map((r) => [r.id, texte(r.fields[CHAMPS.nomClient])])),
      types: new Map(
        types.map((r) => [r.id, { nom: texte(r.fields[CHAMPS.nomTypeSejour]), animation: !!r.fields[CHAMPS.typeAvecAnimation] }]),
      ),
      hebergements: new Map(prix.map((r) => [r.id, texte(r.fields[CHAMPS.nomHebergement])])),
    }
    const sejours = reservations.map((r) => versSejour(r, liens)).filter(Boolean)
    const bilan = await db.rpc('synchroniser_sejours', { p_sejours: sejours, p_source: source })
    console.log(`Calendrier : synchro Airtable (${source}) ${JSON.stringify(bilan)}`)
    return bilan
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`Calendrier : échec de la synchro Airtable (${source}) : ${message}`)
    await db.rpc('noter_echec', { p_source: source, p_erreur: message }).catch(() => {})
    throw e
  }
}
