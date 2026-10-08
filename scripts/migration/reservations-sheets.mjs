#!/usr/bin/env node
// Import des Sheets « Demande de réservation BPA » (INFOS Demandes + JOTFORM /
// DONNÉES) vers le module Réservations et le CRM. Produit un fichier SQL à
// appliquer sur la base visée (DEV : psql ; PROD : API Management, comme
// l'import Copper). Le SQL contient des coordonnées de clients : il se garde
// hors du dépôt (scratchpad), comme les exports .xlsx.
//
//   node scripts/migration/reservations-sheets.mjs \
//     --fichier <demandes-2026-27.xlsx> [--fichier <historique-2025-26.xlsx>] \
//     --sortie <import.sql>
//
// Le premier fichier l'emporte : un numéro déjà importé (dossier repris d'une
// année à l'autre) est sauté dans les fichiers suivants.
//
// Organisations : reliées à celle du CRM qui a le même nom normalisé, sinon
// créées (type tiré du formulaire). Contacts : rattachés par courriel ou nom.
// Notes internes : une note par ligne datée (« jj-mm : … (N) ») devient un
// échange du CRM lié à la réservation. Étape et fermeture : déduites des
// cases ✅/❌ et des mots des notes. Estimé : une seule ligne au montant des
// Sheets (le détail est dans le chiffrier d'estimés et dans les PDF).

import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const args = process.argv.slice(2)
const fichiers = args.flatMap((a, i) => (a === '--fichier' ? [args[i + 1]] : []))
const sortie = args[args.indexOf('--sortie') + 1]
if (!fichiers.length || !sortie || args.indexOf('--sortie') < 0) {
  console.error('Usage : --fichier <xlsx> [--fichier <xlsx>] --sortie <sql>')
  process.exit(1)
}

// ------------------------------------------------------------------
// Lecture et conversions
// ------------------------------------------------------------------
const q = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const n = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? 'null' : String(Number(v)))
// Nombre positif (les Sheets ont des « -5 » et des « ❌ »).
const pos = (v) => (typeof v === 'number' && v >= 0 ? String(v) : 'null')
const ok = (v) => String(v ?? '').includes('✅')
const non = (v) => String(v ?? '').includes('❌')
const texte = (v) => {
  const s = String(v ?? '').trim()
  return s && s !== '❌' && s !== 'NA' ? s : null
}

const MOIS = { janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12 }
const iso = (a, m, j) => `${a}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`
function date(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10)
  const s = String(v ?? '').trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) return iso(m[1], m[2], m[3])
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(s)
  if (m) return iso(m[3], m[2], m[1])
  m = /^(\d{1,2})\s+([a-zéèûô]+)\s+(\d{4})/i.exec(s)
  if (m && MOIS[m[2].toLowerCase()]) return iso(m[3], MOIS[m[2].toLowerCase()], m[1])
  return null
}
function heure(v) {
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const t = Math.round(v * 24 * 60)
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
  }
  const m = /^(\d{1,2})\s*[h:]\s*(\d{2})?/i.exec(String(v ?? '').trim())
  return m && Number(m[1]) < 24 ? `${m[1].padStart(2, '0')}:${m[2] ?? '00'}` : null
}
const ajouterJours = (jour, k) => {
  const d = new Date(`${jour}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + k)
  return d.toISOString().slice(0, 10)
}

function forfaitDe(type) {
  const t = String(type ?? '')
  if (/classe verte/i.test(t)) return ['classe_nature', 'verte']
  if (/classe blanche/i.test(t)) return ['classe_nature', 'blanche']
  if (/classe rouge/i.test(t)) return ['classe_nature', 'rouge']
  if (/classe nature/i.test(t)) return ['classe_nature', null]
  if (/journ[ée]e plein air/i.test(t)) return ['journee_plein_air', null]
  if (/accueil/i.test(t)) return ['accueil_groupe', null]
  if (/location de salle/i.test(t)) return ['location_salle', /soir/i.test(t) ? 'soir' : /jour/i.test(t) ? 'jour' : /mesure/i.test(t) ? 'sur_mesure' : null]
  return [null, null]
}

const RATIO = { '1:10': '1:10', '1:15': '1:15', '1:20': '1:20', '1:30': '1:30', '1:X': '1:X', 'Aucune animation': 'aucun' }

function genreOrganisation(typeGroupe, nom, ages) {
  const t = String(typeGroupe ?? '')
  if (/c[ée]gep|coll[eè]ge/i.test(nom)) return 'cegep'
  if (/universit/i.test(nom)) return 'universite'
  if (/^[ÉE]cole/i.test(t)) return /second|sec\b|\bsec\.|polyvalente/i.test(`${ages ?? ''} ${nom}`) ? 'ecole_secondaire' : 'ecole_primaire'
  if (/particulier/i.test(t)) return 'particulier'
  if (/OSBL|OBNL|sans but/i.test(t)) return 'organisme'
  if (/entreprise/i.test(t)) return 'entreprise'
  if (/club/i.test(t)) return 'club_sportif'
  if (/ville|municip/i.test(t)) return 'municipalite'
  if (/association/i.test(t)) return 'association_etudiante'
  return 'autre'
}

function raisonPerte(notes) {
  const t = String(notes ?? '')
  if (/airbnb/i.test(t)) return 'airbnb'
  if (/opikawa/i.test(t)) return 'opikawa'
  if (/ghost|pas de r[ée]ponse|aucune r[ée]ponse|sans r[ée]ponse/i.test(t)) return 'aucune_reponse'
  if (/cher|budget|prix/i.test(t)) return 'prix'
  if (/ailleurs|autre (camp|endroit|site)|choisi un autre/i.test(t)) return 'ailleurs'
  if (/dates?|complet|disponib/i.test(t)) return 'dates'
  if (/cuisine|accessib|installation/i.test(t)) return 'installations'
  if (/annul|approuv|\bC[ÉE]\b|\bCSS\b|report/i.test(t)) return 'projet_annule'
  if (/info/i.test(t)) return 'information'
  if (/loin/i.test(t)) return 'distance'
  return 'autre'
}

function genreEchange(t) {
  if (/\bMV\b|message vocal|boîte vocale|boite vocale/i.test(t)) return 'message_vocal'
  if (/texto|sms/i.test(t)) return 'texto'
  if (/courriel|email|e-mail|envoy[ée]/i.test(t)) return 'courriel'
  if (/visite/i.test(t)) return 'visite'
  if (/rencontre/i.test(t)) return 'rencontre'
  if (/appel|t[ée]l[ée]phon|parl[ée]/i.test(t)) return 'appel'
  return 'note'
}

/** « 12-09 : MV (N) » → échanges datés ; l'année suit la date de la demande. */
function echanges(notes, demande) {
  const resultat = []
  const an = Number((demande ?? '2026').slice(0, 4))
  const moisDemande = Number((demande ?? '2026-09').slice(5, 7))
  for (const brute of String(notes ?? '').split(/\n+/)) {
    const ligne = brute.trim()
    if (!ligne) continue
    const m = /^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?\s*[:\-–]?\s*(.+)$/.exec(ligne)
    if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[1]) >= 1 && Number(m[1]) <= 31) {
      const mois = Number(m[2])
      const annee = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : mois < moisDemande - 1 ? an + 1 : an
      const initiale = /\(([A-Z]{1,3})\)\s*$/.exec(m[4])?.[1] ?? null
      resultat.push({ jour: iso(annee, mois, m[1]), texte: m[4].trim(), genre: genreEchange(m[4]), auteur: initiale })
    } else {
      resultat.push({ jour: demande, texte: ligne, genre: 'note', auteur: null })
    }
  }
  return resultat
}

// ------------------------------------------------------------------
// SQL
// ------------------------------------------------------------------
const sql = [
  '-- Import des Sheets « Demande de réservation BPA » (généré par scripts/migration/reservations-sheets.mjs).',
  'begin;',
  // Nom comparable : sans accents, ponctuation ni mots courants.
  `create function pg_temp.norm(t text) returns text language sql immutable as $$
  select btrim(regexp_replace(regexp_replace(
    translate(lower(coalesce(t, '')), 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœ', 'aaaaaaceeeeiiiinooooouuuuyyo'),
    '\\m(ecole|college|cegep|secondaire|primaire|l|la|le|les|de|du|des)\\M', ' ', 'g'), '[^a-z0-9]+', ' ', 'g'))
$$;`,
]
const deja = new Set()
const bilan = []

for (const fichier of fichiers) {
  const wb = XLSX.readFile(fichier)
  const infos = XLSX.utils.sheet_to_json(wb.Sheets['INFOS Demandes'], { header: 1, raw: true, defval: null })
  const entetes = infos[1].map((h) => String(h ?? '').trim())
  const col = (nom) => entetes.indexOf(nom)
  const feuilleJotform = wb.Sheets.JOTFORM ?? wb.Sheets['DONNÉES']
  const jotform = XLSX.utils.sheet_to_json(feuilleJotform, { header: 1, raw: true, defval: null })
  const jEntetes = jotform[0].map((h) => String(h ?? '').trim())
  const jcol = (nom) => jEntetes.indexOf(nom)
  const exerciceFichier = /2025-26/.test(fichier) ? 2026 : 2027
  const compte = { lignes: 0, importees: 0, sautees: 0, doublons: 0, echanges: 0 }

  for (let i = 2; i < infos.length; i++) {
    const L = infos[i]
    const v = (nom) => (col(nom) >= 0 ? L[col(nom)] : null)
    const nom = texte(v('Nom du groupe'))
    const numero = texte(v('Numéro de réservation'))
    if (!nom || !numero || !/^\d{2}-G-\d{3}$/.test(numero) || /^(NA|XXX|pas)$/i.test(nom)) continue
    compte.lignes++
    if (deja.has(numero)) {
      compte.doublons++
      continue
    }
    const [forfait, varianteType] = forfaitDe(v('Type de séjour'))
    const [forfaitDemande] = forfaitDe(v('Type de groupe JOTFORM'))
    const f = forfait ?? forfaitDemande
    if (!f) {
      compte.sautees++
      continue
    }
    deja.add(numero)
    compte.importees++

    // Ligne JOTFORM / DONNÉES alignée (ligne r d'INFOS = ligne r-1 du formulaire).
    const J = jotform[i - 1] ?? []
    const jv = (nom) => (jcol(nom) >= 0 ? J[jcol(nom)] : null)
    const typeGroupe = texte(jv('Type de groupe'))

    const arrivee = date(v('DateVal arrivée')) ?? date(v('Date arrivée'))
    if (!arrivee) {
      compte.sautees++
      deja.delete(numero)
      compte.importees--
      continue
    }
    const unJour = f === 'journee_plein_air' || f === 'location_salle'
    let depart = date(v('DateVal départ')) ?? date(v('Date départ'))
    const nuits = Number(v('Nb de nuits'))
    if (!depart && Number.isFinite(nuits) && nuits >= 0 && nuits <= 60) depart = ajouterJours(arrivee, nuits)
    if (unJour || !depart || depart < arrivee || depart > ajouterJours(arrivee, 60)) depart = arrivee

    const demande = date(v('Date de la demande')) ?? arrivee
    const notes = texte(v('Notes internes'))
    const signe = ok(v('Contrat signé'))
    const montant = typeof v("Montant de l'estimé") === 'number' ? v("Montant de l'estimé") : null

    // Étape d'après les cases (la dernière cochée).
    let etape = 'nouvelle'
    if (ok(v('Contact établi'))) etape = 'contact'
    if (ok(v('Estimé envoyé'))) etape = 'estime_envoye'
    if (ok(v('Estimé accepté'))) etape = 'estime_accepte'
    if (ok(v('Contrat envoyé'))) etape = 'contrat_envoye'
    if (signe) etape = depart < new Date().toISOString().slice(0, 10) ? 'terminee' : 'confirmee'
    if (signe && ok(v('Email pré-arrivée envoyé')) && etape === 'confirmee') etape = 'pre_arrivee'
    if (ok(v('Facture finale envoyé'))) etape = 'facture_finale'
    // Fermeture : ❌ dans « Facture finale envoyé » = dossier fermé.
    let fermeture = null
    let raison = null
    if (non(v('Facture finale envoyé')) || /clos?ed? lost|\bCL\b/i.test(notes ?? '')) {
      fermeture = signe ? 'annulee' : 'closed_lost'
      raison = signe ? null : raisonPerte(notes)
    } else if (/stand ?by|report[ée]/i.test(notes ?? '')) fermeture = 'en_attente'

    const genre = genreOrganisation(typeGroupe, nom, v('Âges et niveaux scolaires des élèves'))
    const ville = texte(jv('Adresse de facturation - Ville'))
    const adresse = texte(jv('Adresse de facturation - Adresse'))
    const province = texte(jv('Adresse de facturation - Province'))
    const codePostal = texte(jv('Adresse de facturation - Code postal'))

    // Organisation : celle du CRM au même nom normalisé, sinon nouvelle.
    sql.push(`insert into crm.organisations (nom, genre, ville, adresse, province, code_postal)
select ${q(nom)}, ${q(genre)}, ${q(ville)}, ${q(adresse)}, ${q(province)}, ${q(codePostal)}
where not exists (select 1 from crm.organisations o where pg_temp.norm(o.nom) = pg_temp.norm(${q(nom)}));`)
    const org = `(select o.id from crm.organisations o where pg_temp.norm(o.nom) = pg_temp.norm(${q(nom)}) order by o.created_at limit 1)`

    const contact = (nomC, courriel, tel) => {
      const nc = texte(nomC)
      if (!nc) return 'null'
      sql.push(`insert into crm.contacts (organisation_id, nom, courriel, telephone)
select ${org}, ${q(nc)}, ${q(texte(courriel))}, ${q(texte(tel))}
where not exists (select 1 from crm.contacts c where c.organisation_id = ${org}
  and (lower(c.courriel) = lower(${q(texte(courriel))}) or pg_temp.norm(c.nom) = pg_temp.norm(${q(nc)})));`)
      return `(select c.id from crm.contacts c where c.organisation_id = ${org}
  and (lower(c.courriel) = lower(${q(texte(courriel))}) or pg_temp.norm(c.nom) = pg_temp.norm(${q(nc)})) order by c.created_at limit 1)`
    }
    const cRes = contact(v('Responsable réservation'), v('Courriel réservation'), v('Téléphone réservation'))
    const cFac = contact(v('Responsable facturation'), v('Courriel facturation'), v('Téléphone facturation'))

    const etages = ['CH', 'CB', 'PB', 'PH', 'VFB', 'VFH'].filter((c) => ok(v(c)))
    const salles = ['SMB', 'SV', 'CU', 'SC', 'SVF', 'CVF'].filter((c) => ok(v(c)))
    const ratio = RATIO[String(v('Ratio') ?? '').trim()] ?? null
    const repas = (k) => (typeof v(k) === 'number' && v(k) >= 0 ? v(k) : 0)
    const exercice = 2000 + Number(numero.slice(0, 2))
    const opikawa = ok(v('Opikawa ? (Vide ou ✅)'))
    const id = randomUUID()

    sql.push(`insert into reservations.reservations (
  id, numero, exercice, numero_seq, nom, compagnie_id, organisation_id, contact_reservation_id, contact_facturation_id,
  courriel_direction, forfait, variante, forfait_demande, date_arrivee, date_depart, heure_arrivee, heure_depart,
  heures_regulieres, nb_participants, nb_accompagnateurs, ages, langue, description, commentaires_client, ratio,
  service_repas, nb_dejeuners, nb_diners, nb_soupers, nb_collations, etages, salles, etape, fermeture, raison_perte,
  notes_contrat, retroaction, demande_le, signe_le, origine, ref_externe)
values (
  ${q(id)}, ${q(numero)}, ${exercice}, ${Number(numero.slice(5))}, ${q(nom)},
  (select id from core.entreprises where nom = ${q(opikawa ? 'Opikawa' : 'GBPA+')}), ${org}, ${cRes}, ${cFac === 'null' ? 'null' : cFac},
  ${q(texte(v('Courriel direction/secrétariat')))}, ${q(f)}, ${q(varianteType)}, ${q(forfaitDemande)}, ${q(arrivee)}, ${q(depart)},
  ${q(heure(v('Heure arrivée')))}, ${q(heure(v('Heure départ')))}, ${String(v('Heures régulières ?') ?? '') === 'Oui' ? 'true' : String(v('Heures régulières ?') ?? '') === 'Non' ? 'false' : 'null'},
  ${pos(v('Nb de participants'))}, ${pos(v("Nb d'accompagnateurs"))}, ${q(texte(v('Âges et niveaux scolaires des élèves')))}, ${q(texte(v('Langue du groupe')))},
  ${q(texte(v('Courte description du groupe')))}, ${q(texte(v('Commentaires')))}, ${q(ratio)},
  ${f === 'classe_nature' || /oui/i.test(String(v('Service de repas ?') ?? '')) ? 'true' : 'false'},
  ${repas('Déjeuner')}, ${repas('Dîner')}, ${repas('Souper')}, ${repas('Collation')},
  ${q(`{${etages.join(',')}}`)}, ${q(`{${salles.join(',')}}`)}, ${q(etape)}, ${q(fermeture)}, ${q(raison)},
  ${q(texte(v('Notes au contrat')))}, ${q(texte(v('Feedback / Rétroaction')))}, ${q(`${demande} 12:00:00-04`)}, ${q(date(v('Date de signature')))},
  'import', ${q(`sheets-${exerciceFichier}:${i + 1}`)}
) on conflict (numero) do nothing;`)

    // Estimé : une ligne au montant des Sheets (brouillon, puis son statut).
    if (montant !== null && montant > 0) {
      const e = randomUUID()
      const st = Math.round(montant * 100) / 100
      const tps = Math.round(st * 5) / 100
      const tvq = Math.round(st * 9.975) / 100
      sql.push(`insert into reservations.estimes (id, reservation_id, version, statut, exercice_prix, sous_total, tps, tvq, total, importe, notes)
values (${q(e)}, ${q(id)}, 1, 'brouillon', ${exercice}, ${st}, ${tps}, ${tvq}, ${Math.round((st + tps + tvq) * 100) / 100}, true, 'Importé des Sheets : détail dans le chiffrier d''estimés et le PDF.');
insert into reservations.lignes (estime_id, ordre, description, quantite, prix_unitaire, montant)
values (${q(e)}, 0, ${q(`Estimé ${numero} (importé des Sheets)`)}, 1, ${st}, ${st});`)
      const statut = ok(v('Estimé accepté')) || signe ? 'accepte' : ok(v('Estimé envoyé')) ? 'envoye' : null
      if (statut) sql.push(`update reservations.estimes set statut = ${q(statut)} where id = ${q(e)};`)
    }

    // Notes internes → échanges du CRM liés à la réservation.
    for (const x of echanges(notes, demande)) {
      if (!x.jour) continue
      compte.echanges++
      sql.push(`insert into crm.echanges (organisation_id, reservation_id, genre, jour, texte, auteur_nom)
select r.organisation_id, r.id, ${q(x.genre)}, ${q(x.jour)}, ${q(x.texte)}, ${q(x.auteur)}
from reservations.reservations r where r.id = ${q(id)} and r.organisation_id is not null;`)
    }
  }
  bilan.push(`${fichier.split('/').pop()} : ${JSON.stringify(compte)}`)
}

sql.push('commit;')
writeFileSync(sortie, sql.join('\n') + '\n')
console.log(bilan.join('\n'))
console.log(`SQL écrit : ${sortie}`)
