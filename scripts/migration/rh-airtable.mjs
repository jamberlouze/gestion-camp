#!/usr/bin/env node
// Import de la base Airtable « RH » (appzxLZ4ZO0kb65xU) vers le module RH.
// Produit un fichier SQL à appliquer sur la base visée (DEV : psql dans
// Docker ; PROD : API Management, comme l'import Copper). Le SQL contient
// des renseignements personnels : il se garde HORS du dépôt (scratchpad).
//
//   AIRTABLE_TOKEN_RH=… node scripts/migration/rh-airtable.mjs --sortie <import.sql>
//     [--depuis <dossier>]   lit des extraits JSON au lieu de l'API (réponses du
//                            connecteur Airtable de Claude : candidatures-*.json,
//                            humains.json, embauches.json, banque.json, au format
//                            {records: [{id, createdTime, cellValuesByFieldId}]})
//     [--avec-paie]          NAS et comptes bancaires (chiffrés par la base) ;
//                            jamais en DEV, seulement pour l'import final en PROD
//     [--fichiers <dossier>] télécharge les pièces jointes (CV, contrats, cartes,
//                            spécimens si --avec-paie) dans ce dossier, avec un
//                            manifeste ; envoyées ensuite par rh-fichiers.mjs
//
// Jeton : jeton personnel Airtable en LECTURE seule (data.records:read) sur la
// base RH seulement. Lu dans l'environnement ou dans scripts/migration/.env.rh
// (jamais dans Git).
//
// Relançable : chaque ligne garde son identifiant Airtable (airtable_id,
// airtable_ids) ; une personne fusionnée dans l'app n'est pas recréée.
// Champs lus par identifiant (fld…) : un champ renommé dans Airtable ne
// casse pas l'import.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ici = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const option = (nom) => (args.includes(nom) ? args[args.indexOf(nom) + 1] : null)
const sortie = option('--sortie')
const avecPaie = args.includes('--avec-paie')
const dossierFichiers = option('--fichiers')
const depuis = option('--depuis')
if (!sortie) {
  console.error('Usage : --sortie <import.sql> [--avec-paie] [--fichiers <dossier>]')
  process.exit(1)
}

function jeton() {
  if (depuis) return null
  if (process.env.AIRTABLE_TOKEN_RH) return process.env.AIRTABLE_TOKEN_RH
  const f = join(ici, '.env.rh')
  if (existsSync(f)) {
    const m = /^AIRTABLE_TOKEN_RH=(.+)$/m.exec(readFileSync(f, 'utf8'))
    if (m) return m[1].trim()
  }
  console.error('Jeton absent : AIRTABLE_TOKEN_RH (environnement ou scripts/migration/.env.rh).')
  process.exit(1)
}

const BASE = 'appzxLZ4ZO0kb65xU'
const TABLES = {
  humains: 'tblui6KOaxvy01Ezj',
  candidatures: 'tblP3UhfHkWcvaaKu',
  embauches: 'tblac0ROT0ROPSYye',
  banque: 'tbldztPhR7k9y7ptL',
}

/** Extraits du connecteur : {records: [{id, createdTime, cellValuesByFieldId}]}, un ou plusieurs fichiers par table. */
function lireExtraits(nom) {
  const fichiers = readdirSync(depuis).filter((f) => f === `${nom}.json` || (f.startsWith(`${nom}-`) && f.endsWith('.json')))
  if (!fichiers.length) throw new Error(`Extrait absent : ${nom}.json dans ${depuis}`)
  return fichiers.flatMap((f) => JSON.parse(readFileSync(join(depuis, f), 'utf8')).records.map((r) => ({ id: r.id, createdTime: r.createdTime, fields: r.cellValuesByFieldId ?? r.fields ?? {} })))
}

async function lire(table) {
  if (depuis) return lireExtraits(Object.keys(TABLES).find((k) => TABLES[k] === table))
  const lignes = []
  let offset
  do {
    const params = new URLSearchParams({ pageSize: '100', returnFieldsByFieldId: 'true' })
    if (offset) params.set('offset', offset)
    const res = await fetch(`https://api.airtable.com/v0/${BASE}/${table}?${params}`, { headers: { Authorization: `Bearer ${jeton()}` } })
    if (!res.ok) throw new Error(`Airtable ${table} : ${res.status} ${await res.text()}`)
    const json = await res.json()
    lignes.push(...json.records)
    offset = json.offset
  } while (offset)
  return lignes
}

// ------------------------------------------------------------------
// Champs (identifiants Airtable)
// ------------------------------------------------------------------
const H = { courriel: 'fldzAKz6brAdrNO5L', prenom: 'fld2RaThP5CZPFUL5', nom: 'fldTpZcSjZ8Y2PylI', sexe: 'fldkKLQ3wje5qAJ1Q', dateVaj: 'fldU8uxLuvFbvJtqz', vaj: 'fldan0cSRcAjDVrFR', naissance: 'fldoBwzWcQ6MMK8uo' }
const C = {
  courriel: 'fldPtIgkB0kjHFqdM', nom: 'fldf9erIgpFfNIoBT', prenom: 'flddBB6EzgB9GI9gf', surnom: 'fldoqFjKQ6fPYLh4h', telephone: 'fldO0ZauPH5v7olam',
  etudes: 'fldyVrfLSflS3gxF6', citoyennete: 'fldlwWeX3ADeW8CdW', intention: 'fldhj0FFagL9CPWbk', saisons: 'fldRy17EJLKw1lCb2',
  postesEte: 'fldLdBfxO8v7WfnMV', postesAutomne: 'fldwGY8kYpOoSACRL', postesHiver: 'fld2BqQdW0aLImgxl', postesPrintemps: 'fldcWtLQLhoCuDTiK',
  dateDebut: 'fld0gCl9ZiXKwHxLc', empechements: 'fldQ1PIyyIyoBEahJ', francais: 'fldeTrAG0FjRjndrz', anglais: 'fld0vprLQUs5Iq4v7', cv: 'fldOoz2Gtu3LH89j3',
  motivation: 'fldFCn6On652TUUXX', incite: 'fldWQcVpFQL80GnBC', referePar: 'fldvTI3Q73eHUKL9I', autre: 'fldnuakFpOEveaeWb',
  commentaires: 'fldaYIk93p6da6sJ3', dateEntrevue: 'fld7j3bt4wCNCeuiB', notesEntrevue: 'fldRmxrMiemZB2Rl9', preDecision: 'fldaOLDY3V82bO1nm',
  saisonDecision: 'fldjva5C6TRoAdHk9', compagnieDecision: 'fldE9Xo5IYwery0n3', posteDecision: 'fldjVAn57jsIBDXe9', echelon: 'fldnudGMBw71UlPrq',
  statut: 'fldJzmwhKrXHNi0gd', dernierCourriel: 'fldnVHxPOP2T63a1i', humains: 'fldi8OcCa6rS0KARi',
}
const E = {
  surnom: 'fldacpf4NJx1xfCtB', courriel: 'fldLrCTpx46puVVY3', prenom: 'fldcs4qY562TE6bNe', nom: 'fldsuhxBZJCQR5Ys5', indicatif: 'fldOLpPzyECAbZpv8', telephone: 'flde88LCc5OzTPbd0',
  naissance: 'fld3iAOcuJjVVPe4y', nam: 'fld5UrNDxDwgotYcD', adresse: 'fldBbOYGDx1OkSrel', codePostal: 'fldf7GPFMCmsRAXRW', ville: 'fldWwNXDyoSPXTKx6', province: 'fldVtxBvUUNM5QcZd', pays: 'fldpUl7pE21Ooeel8',
  etudiant: 'fldPS3uFXrBFqf0im', ancien: 'fldsL0mz6hc1G16mI', remuneration: 'fldV0jiXtRqK0RmcO', vacances: 'fldKlFkihWbeCgLLt', action: 'fldWsSxv35eSfB3FG',
  dateEmbauche: 'fldYKLsRqf03ZZCwD', typeEmploye: 'fldFi4Kh7qoR1Pkf0', etudes: 'fldRyrBLv2AM9aBrQ', specimen: 'fldpnmyxXikfNnuK0', transit: 'fldn8qLx4RIeSUkqo',
  institution: 'fld4E9tYIj1Piz7RH', compte: 'fldDs5OLBGZ6Mba32', nas: 'fldkc2QRQJjXDQBj9', allergiesOui: 'fldzZ9iK1n2vKsLAa', allergies: 'fldVTRwzWDtipBDZs', diete: 'fld79kFDl4qpDxFDF',
  tshirt: 'fldZAoKxsfSgRFzme', hoodie: 'fldn21PuLei0s3hea', u1nom: 'fldjdHV7bDrnNNq72', u1lien: 'fldHhOw4N5XR37NWV', u1tel: 'fldtD6KW8SKFxeoTz',
  u2nom: 'fldPT76xK123ybWJ0', u2lien: 'fldyaFyRb7gb5ff7n', u2tel: 'fldwf6BALv8k4rUMp', dispos: 'fldI8RFdZ6DlOM3rj', disposNote: 'fldBasZk16s6K107o', ethique: 'fldeqmA12iB1dwRA5',
  cv: 'fldqbwnZBo6fkb1xZ', contrat: 'fld87FTP9GkHxNsX9', premiersSoins: 'fldyjdETLJLocr8pf', consentement: 'fldTArMqjIfzC5GJO', sn: 'flddutM9CyBCJTVsY', identite: 'fld7Gg6VkFMvG7Vul',
  commentaires: 'fld95OQqfMzwGZsIe', photo: 'fldHmJWmKg4dqpqbI', campeur: 'fldv6oCTbpuB8EjJ3', activite: 'fldnydxZl9PF8IQ2X', repas: 'fldxvQFPRPrdWwKBU', karaoke: 'fldZ6V10kLBhh9uFK',
  humains: 'fldp3CVK7g9LCOgw7',
}
const B = { courriel: 'fldDg6JzPnvk4MtbE', surnom: 'fldZ1qKND610ZsbHs', dejaTravaille: 'flddUC3rYp7iPc2ar', saisons: 'fld6FdavKvWvetoiU', nePas: 'fldMzNGhCXNJU6sBn', notes: 'fldYZRUnQR5PQjuef', prenom: 'fldrSzd1DsPYWuA1b', nom: 'fldDXZeNl57G8HwrB', telephone: 'fldbYv9BS1mrtohb4', compagnies: 'fldw2eFGieUhcMfDE', postes: 'fldPVrXZWEa405zEh' }

// ------------------------------------------------------------------
// Conversions
// ------------------------------------------------------------------
const q = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const choix = (v) => (v && typeof v === 'object' && 'name' in v ? v.name : v)
const txt = (v) => {
  const s = String(choix(v) ?? '').trim()
  return s || null
}
const liste = (v) => (Array.isArray(v) ? v.map((x) => txt(x)).filter(Boolean) : [])
// Un courriel invalide (« n.a », « - ») est ignoré : sinon toutes ces fiches seraient réunies en une.
const courriel = (v) => {
  const c = txt(v)?.toLowerCase().replace(/\s+/g, '')
  return c && /^[^@]+@[^@]+\.[a-z]{2,}$/.test(c) ? c : null
}
const date = (v) => (txt(v) && /^\d{4}-\d{2}-\d{2}/.test(txt(v)) ? txt(v).slice(0, 10) : null)
const chiffres = (v) => (v === null || v === undefined ? null : String(v).replace(/\D/g, '') || null)
const arr = (ids) => (ids.length ? `array[${ids.join(',')}]::uuid[]` : `'{}'::uuid[]`)
const json = (o) => q(JSON.stringify(Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ''))))

/** Identifiant stable tiré d'une clé (relancer l'import donne les mêmes). */
function uuid(cle) {
  const h = createHash('md5').update(`rh:${cle}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

const GENRES = { Hiver: 'hiver', Printemps: 'printemps', Été: 'ete', Automne: 'automne' }
/** « Été 2026 » (ou « Été 2026 ») → { genre, annee }. */
function saisonDe(libelle) {
  const m = /^(Hiver|Printemps|Été|Automne)\s+(\d{4})$/.exec(String(libelle ?? '').trim())
  return m ? { genre: GENRES[m[1]], annee: Number(m[2]) } : null
}
const exprSaison = (s) => `(select id from rh.saisons where genre = ${q(s.genre)} and annee = ${s.annee})`
const saisonsVues = new Map()
const noterSaison = (s) => s && saisonsVues.set(`${s.genre}-${s.annee}`, s)

/** Saison d'un dossier d'embauche d'après sa date de création. */
function saisonDuMois(iso) {
  const [a, m] = iso.slice(0, 10).split('-').map(Number)
  if (m >= 2 && m <= 7) return { genre: 'ete', annee: a }
  if (m >= 8 && m <= 11) return { genre: 'automne', annee: a }
  return { genre: 'hiver', annee: m === 12 ? a + 1 : a }
}

// Postes : libellés d'Airtable → (nom du poste dans l'app, code de compagnie).
const POSTES = {
  'Aide de camp': ['Aide de camp', 'GBPA+'],
  "Animateur - Camp d'été": ["Animateur - Camp d'été", 'GBPA+'],
  'Animateur - Classe nature': ['Animateur - Classe nature', 'GBPA+'],
  'Animateur - Programme EXPÉ': ['Animateur - Programme EXPÉ', 'GBPA+'],
  'Coordonnateur de Camp de vacances': ['Coordonnateur', 'GBPA+'],
  'Formateur - Programme sauvetage': ['Formateur - Programme sauvetage', 'GBPA+'],
  'Formateur PAM DAFA - Programme ASPI': ['Formateur PAM DAFA - Programme ASPI', 'GBPA+'],
  'Sauveteur plage': ['Sauveteur plage', 'GBPA+'],
  'Spécialiste escalade': ['Spécialiste escalade', 'GBPA+'],
  'Spécialiste photos & vidéos': ['Spécialiste photos et vidéos', 'GBPA+'],
  'Spécialiste transport (conducteur minibus)': ['Spécialiste transport (conducteur minibus)', 'GBPA+'],
  'Spécialiste transport': ['Spécialiste transport (conducteur minibus)', 'GBPA+'],
  'Chef cuisinier': ['Chef cuisinier', 'GBPA+'],
  'Aide cuisinier': ['Aide cuisinier', 'GBPA+'],
  "Préposé à l'entretien": ["Préposé à l'entretien", 'GBPA+'],
  'Employé polyvalent': ['Employé polyvalent', 'GBPA+'],
  'Accompagnateur de groupe en ski': ['Accompagnateur de groupe en ski', 'GBPA+'],
  'Aquabounga : Coordonnateur': ['Coordonnateur', 'AQB'],
  'Aquabounga : Sauveteur sur structure gonflable': ['Sauveteur sur structure gonflable', 'AQB'],
  'Sauveteur sur structure gonflable': ['Sauveteur sur structure gonflable', 'AQB'],
  'Opikawa : Coordonnateur': ['Coordonnateur', 'OPI'],
  "Opikawa : Professeur d'anglais langue seconde": ["Professeur d'anglais langue seconde", 'OPI'],
  'Opikawa : Professeur de français langue seconde': ['Professeur de français langue seconde', 'OPI'],
  "Prof d'anglais langue seconde": ["Professeur d'anglais langue seconde", 'OPI'],
  'Prof de français langue seconde': ['Professeur de français langue seconde', 'OPI'],
  'Rouge & Diable : Coordonnateur': ['Coordonnateur', 'R&D'],
  'Rouge & Diable : Conducteur minibus': ['Conducteur minibus', 'R&D'],
  'Conducteur minibus': ['Conducteur minibus', 'R&D'],
  "Rouge & Diable : Préposé à l'accueil": ["Préposé à l'accueil", 'R&D'],
  "Préposé à l'accueil": ["Préposé à l'accueil", 'R&D'],
  Coordonateur: ['Coordonnateur', 'GBPA+'],
  Coordonnateur: ['Coordonnateur', 'GBPA+'],
}
const COMPAGNIES = { Aquabounga: 'AQB', 'Base de Plein Air Mont-Tremblant': 'GBPA+', Opikawa: 'OPI', 'Rouge&Diable': 'R&D', 'Rouge & Diable': 'R&D', Trembloc: 'TRB' }
const postesVus = new Map()
/** Poste (nom, compagnie) : la compagnie de la décision l'emporte sur celle du libellé. */
function poste(libelle, code) {
  const p = POSTES[String(libelle ?? '').trim()]
  if (!p) return null
  const c = code ?? p[1]
  postesVus.set(`${p[0]}|${c}`, [p[0], c])
  return `(select id from rh.postes where nom = ${q(p[0])} and entreprise_id = rh.entreprise(${q(c)}))`
}

const STATUTS = {
  Application: 'recue',
  "Proposition d'entrevue": 'entrevue_proposee',
  'Candidature acceptée': 'acceptee',
  'Candidature rejetée (équipe complète)': 'refusee_equipe_complete',
  'Candidature rejetée (après entrevue)': 'refusee_apres_entrevue',
  'A refusé le poste': 'a_refuse',
  'En attente': 'en_attente',
  'Proposition ASPI': 'aspi_proposee',
  'Question permis de travail': 'permis_travail',
}
const PRE = { Oui: 'oui', Maybe: 'peut_etre', Bof: 'bof', Non: 'non', 'Proposer ASPI': 'aspi' }
const DIETES = { 'Régulier, aucune restriction alimentaire': 'reguliere', Végétarienne: 'vegetarienne', 'Sans lactose': 'sans_lactose', 'Sans porc': 'sans_porc', 'Sans gluten': 'sans_gluten' }
const TAILLE = (v) => (['XS', 'S', 'M', 'L', 'XL', 'XXL'].includes(txt(v)) ? txt(v) : null)
const REMU = { 'À la semaine': 'semaine', "À l'heure": 'heure' }
const VAC = { '0%': 'aucun', '4% sur chaque paie': 'chaque_paie', '4% banque vacances': 'banque' }

// Disponibilités de l'été 2026 : libellé → (nom, début, fin) des dates de la saison.
const MOIS = { mai: 5, juin: 6, juillet: 7, août: 8 }
function dispo(libelle) {
  const s = String(libelle ?? '')
  let m = /^Formation (\d)/.exec(s)
  if (m) return ['Formation ' + m[1], null, null]
  m = /^Été - Semaine (\d)/.exec(s)
  if (m) return ['Semaine ' + m[1], null, null]
  m = /^(Classe verte|Journée plein air) - (\d{1,2})(?:er)?(?:\s+(?:et|au)\s+(\d{1,2}))?\s+([a-zéû]+)$/.exec(s)
  if (!m) return null
  const jour = (j) => `2026-${String(MOIS[m[4]]).padStart(2, '0')}-${j.padStart(2, '0')}`
  return [m[1], jour(m[2]), jour(m[3] ?? m[2])]
}
const exprDispo = (libelle) => {
  const d = dispo(libelle)
  if (!d) return null
  return `(select id from rh.saisons_dates where saison_id = ${exprSaison({ genre: 'ete', annee: 2026 })} and nom = ${q(d[0])}${d[1] ? ` and debut = ${q(d[1])} and fin = ${q(d[2])}` : ''} limit 1)`
}

// ------------------------------------------------------------------
// Fichiers (manifeste pour rh-fichiers.mjs)
// ------------------------------------------------------------------
const manifeste = []
// Fichiers importés : rangés sous import/ (la personne peut changer par fusion).
function fichiers(pieces, { personne, genre, candidature = null, embauche = null, seau = 'rh-documents' }) {
  const lignes = []
  for (const a of pieces ?? []) {
    const id = uuid(`fichier:${a.id}`)
    const ext = (a.filename.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
    const chemin = `import/${id}.${ext}`
    manifeste.push({ id, url: a.url, nom: a.filename, type: a.type, taille: a.size, seau, chemin })
    if (seau === 'rh-documents') {
      lignes.push(
        `insert into rh.documents (id, personne_id, candidature_id, embauche_id, genre, nom, chemin, type_mime, taille, ajoute_par_nom, airtable_id) values (${q(id)}, ${personne.expr}, ${candidature ?? 'null'}, ${embauche ?? 'null'}, ${q(genre)}, ${q(a.filename)}, ${q(chemin)}, ${q(a.type)}, ${a.size ?? 'null'}, 'Airtable', ${q(a.id)}) on conflict (airtable_id) do nothing;`,
      )
    } else lignes.push(`update rh.paie set specimen = ${q(chemin)} where personne_id = ${personne.expr};`)
  }
  return lignes
}

// ------------------------------------------------------------------
// Import
// ------------------------------------------------------------------
const [humains, candidatures, embauches, banque] = await Promise.all([
  lire(TABLES.humains),
  lire(TABLES.candidatures),
  lire(TABLES.embauches),
  lire(TABLES.banque),
])
console.error(`Airtable : ${humains.length} humains, ${candidatures.length} candidatures, ${embauches.length} embauches, ${banque.length} anciens (banque 2025).`)

// Personnes : une par courriel (ou par fiche Humains sans courriel).
// `cle` = identifiant Airtable qui sert à la retrouver (airtable_ids).
const personnes = new Map() // cle → { cle, ids, prenom, nom, courriel, … }
const parCourriel = new Map()
const parHumain = new Map()
function personnePour({ cle, courriel: c, prenom, nom }) {
  let p = (c && parCourriel.get(c)) || null
  if (!p) {
    p = { cle, ids: new Set([cle]), courriel: c, prenom: prenom || '?', nom: nom || '', notes: [], banque: null }
    personnes.set(cle, p)
    if (c) parCourriel.set(c, p)
  } else p.ids.add(cle)
  return p
}

for (const h of humains) {
  const f = h.fields
  const p = personnePour({ cle: h.id, courriel: courriel(f[H.courriel]), prenom: txt(f[H.prenom]), nom: txt(f[H.nom]) })
  parHumain.set(h.id, p)
  p.sexe = { Féminin: 'f', Masculin: 'm' }[txt(f[H.sexe])] ?? p.sexe ?? null
  p.vaj_le = date(f[H.dateVaj]) ?? p.vaj_le ?? null
  if (f[H.vaj] && !p.vaj_le) p.vaj_note = 'Case « VAJ ? » cochée dans Airtable'
  p.naissance = date(f[H.naissance]) ?? p.naissance ?? null
}

const personneDeCandidature = (r) => {
  const f = r.fields
  const lien = (f[C.humains] ?? []).map((x) => parHumain.get(x?.id ?? x)).find(Boolean)
  const p = lien ?? personnePour({ cle: r.id, courriel: courriel(f[C.courriel]), prenom: txt(f[C.prenom]), nom: txt(f[C.nom]) })
  p.surnom = p.surnom ?? txt(f[C.surnom])
  p.telephone = p.telephone ?? txt(f[C.telephone])
  if (!p.courriel && courriel(f[C.courriel])) {
    p.courriel = courriel(f[C.courriel])
    parCourriel.set(p.courriel, p)
  }
  return p
}
const personneDEmbauche = (r) => {
  const f = r.fields
  const lien = (f[E.humains] ?? []).map((x) => parHumain.get(x?.id ?? x)).find(Boolean)
  return lien ?? personnePour({ cle: r.id, courriel: courriel(f[E.courriel]), prenom: txt(f[E.prenom]), nom: txt(f[E.nom]) })
}

const sql = []
const apres = [] // lignes qui dépendent des personnes
const personneExpr = (p) => `rh.personne_airtable(${q(p.cle)})`

// Candidatures
const accepteesParPersonne = new Map()
for (const r of candidatures) {
  const f = r.fields
  const p = personneDeCandidature(r)
  const id = uuid(`candidature:${r.id}`)
  const intention = txt(f[C.intention])
  const saisons = liste(f[C.saisons]).map(saisonDe).filter(Boolean)
  saisons.forEach(noterSaison)
  const libellesPostes = [...liste(f[C.postesEte]), ...liste(f[C.postesAutomne]), ...liste(f[C.postesHiver]), ...liste(f[C.postesPrintemps])]
  const postes = [...new Set(libellesPostes.map((l) => poste(l)).filter(Boolean))]
  const inconnus = libellesPostes.filter((l) => !POSTES[l])
  const statut = STATUTS[txt(f[C.statut])] ?? (intention === 'Non' ? 'ne_revient_pas' : 'recue')
  const codeCompagnie = COMPAGNIES[txt(f[C.compagnieDecision])] ?? null
  const saisonDecision = saisonDe(txt(f[C.saisonDecision]))
  noterSaison(saisonDecision)
  const posteDecision = txt(f[C.posteDecision]) ? poste(txt(f[C.posteDecision]), codeCompagnie) : null
  const echelon = Number(txt(f[C.echelon])) || null
  const reponses = {
    intention: intention ? (intention === 'Oui' ? 'Oui, veut revenir' : 'Non') : null,
    niveau_etudes: txt(f[C.etudes]),
    citoyennete: txt(f[C.citoyennete]),
    francais: txt(f[C.francais]),
    anglais: txt(f[C.anglais]),
    date_debut: date(f[C.dateDebut]),
    empechements: txt(f[C.empechements]),
    motivation: txt(f[C.motivation]),
    connu_par: txt(f[C.incite]),
    refere_par: txt(f[C.referePar]),
    autre: txt(f[C.autre]),
    postes_texte: inconnus.length ? inconnus.join(', ') : null,
  }
  sql.push(
    `insert into rh.candidatures (id, personne_id, source, recue_le, saison_ids, poste_ids, reponses, statut, pre_decision, commentaires, entrevue_le, notes_entrevue, entreprise_id, saison_id, poste_id, echelon, airtable_id) values (` +
      [
        q(id),
        personneExpr(p),
        q(intention ? 'retour' : 'formulaire'),
        q(r.createdTime),
        `array_remove(array[${saisons.map(exprSaison).join(',') || 'null'}]::uuid[], null)`,
        `array_remove(array[${postes.join(',') || 'null'}]::uuid[], null)`,
        json(reponses),
        q(statut),
        q(PRE[txt(f[C.preDecision])] ?? null),
        q(txt(f[C.commentaires])),
        q(date(f[C.dateEntrevue])),
        q(txt(f[C.notesEntrevue])),
        codeCompagnie ? `rh.entreprise(${q(codeCompagnie)})` : 'null',
        saisonDecision ? exprSaison(saisonDecision) : 'null',
        posteDecision ?? 'null',
        echelon ?? 'null',
        q(r.id),
      ].join(', ') +
      `) on conflict (airtable_id) do update set statut = excluded.statut, pre_decision = excluded.pre_decision, commentaires = excluded.commentaires, entrevue_le = excluded.entrevue_le, notes_entrevue = excluded.notes_entrevue, entreprise_id = excluded.entreprise_id, saison_id = excluded.saison_id, poste_id = excluded.poste_id, echelon = excluded.echelon;`,
  )
  const dernier = txt(f[C.dernierCourriel])
  if (dernier) {
    const quand = /(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/.exec(dernier)?.[1] ?? r.createdTime
    apres.push(
      `insert into rh.journal (id, personne_id, candidature_id, genre, texte, auteur_nom, le) values (${q(uuid(`journal:${r.id}`))}, ${personneExpr(p)}, ${q(id)}, 'import', ${q(`Airtable, « Dernier courriel envoyé » : ${dernier.replace(/\*\*/g, '')}`)}, 'Airtable', ${q(quand)}) on conflict (id) do nothing;`,
    )
  }
  if (dossierFichiers) apres.push(...fichiers(f[C.cv], { personne: { expr: personneExpr(p) }, genre: 'cv', candidature: q(id) }))
  if (statut === 'acceptee') {
    const s = saisonDecision ?? saisons[0] ?? null
    if (s) {
      noterSaison(s)
      const l = accepteesParPersonne.get(p) ?? []
      l.push({ candidature: id, saison: s, compagnie: codeCompagnie, poste: posteDecision, echelon, envoye: /accept/i.test(dernier ?? '') || /embauche envoy/i.test(dernier ?? '') })
      accepteesParPersonne.set(p, l)
    }
  }
}

// Dossiers d'embauche : rattachés à l'acceptation de la même saison, sinon embauche à part.
const dossiersParPersonne = new Map()
for (const r of embauches) {
  const p = personneDEmbauche(r)
  dossiersParPersonne.set(p, [...(dossiersParPersonne.get(p) ?? []), r])
}

const saisonsEmbauchees = new Map() // personne → Set('ete-2026')
const embaucheSql = (cle, p, champs) => {
  saisonsEmbauchees.set(p, (saisonsEmbauchees.get(p) ?? new Set()).add(`${champs.saison.genre}-${champs.saison.annee}`))
  return `insert into rh.embauches (id, personne_id, saison_id, entreprise_id, poste_id, echelon, candidature_id, statut, remuneration, vacances, type_employe, action_paie, date_embauche, disponibilites, disponibilites_note, code_ethique_le, commentaires, presentation, dossier_recu_le, airtable_id) values (` +
  [
    q(uuid(`embauche:${cle}`)),
    personneExpr(p),
    exprSaison(champs.saison),
    champs.compagnie ? `rh.entreprise(${q(champs.compagnie)})` : 'null',
    champs.poste ?? 'null',
    champs.echelon ?? 'null',
    champs.candidature ? q(champs.candidature) : 'null',
    q(champs.statut),
    q(champs.remuneration ?? null),
    q(champs.vacances ?? null),
    q(champs.type ?? null),
    q(champs.action ?? null),
    q(champs.dateEmbauche ?? null),
    champs.dispos ?? `'{}'::uuid[]`,
    q(champs.disposNote ?? null),
    q(champs.ethique ?? null),
    q(champs.commentaires ?? null),
    champs.presentation ?? `'{}'::jsonb`,
    q(champs.recu ?? null),
    q(champs.airtable ?? null),
  ].join(', ') +
  `) on conflict (id) do update set statut = excluded.statut, remuneration = excluded.remuneration, vacances = excluded.vacances, type_employe = excluded.type_employe, action_paie = excluded.action_paie, date_embauche = excluded.date_embauche, disponibilites = excluded.disponibilites, disponibilites_note = excluded.disponibilites_note;`
}

// « Ancien = Oui » d'un dossier : a travaillé avec nous avant (saisons pas toujours connues).
for (const [p, ds] of dossiersParPersonne) if (ds.some((d) => txt(d.fields[E.ancien]) === 'Oui')) p.deja = true

const personnesTouchees = new Set([...accepteesParPersonne.keys(), ...dossiersParPersonne.keys()])
for (const p of personnesTouchees) {
  const acceptees = accepteesParPersonne.get(p) ?? []
  const dossiers = [...(dossiersParPersonne.get(p) ?? [])].sort((a, b) => a.createdTime.localeCompare(b.createdTime))
  const libres = [...dossiers]
  for (const a of acceptees) {
    const i = libres.findIndex((d) => {
      const s = saisonDuMois(d.createdTime)
      return s.genre === a.saison.genre && s.annee === a.saison.annee
    })
    const d = i >= 0 ? libres.splice(i, 1)[0] : null
    sql.push(embaucheSql(a.candidature, p, { ...a, ...(d ? champsDossier(d) : { statut: a.envoye ? 'envoyee' : 'a_envoyer' }) }))
    if (d && dossierFichiers) apres.push(...fichiersDossier(d, p, q(uuid(`embauche:${a.candidature}`))))
  }
  for (const d of libres) {
    const s = saisonDuMois(d.createdTime)
    noterSaison(s)
    sql.push(embaucheSql(d.id, p, { saison: s, ...champsDossier(d) }))
    if (dossierFichiers) apres.push(...fichiersDossier(d, p, q(uuid(`embauche:${d.id}`))))
  }
  // Dossier durable et coordonnées : la confirmation la plus récente.
  const dernier = dossiers.at(-1)
  if (dernier) {
    const f = dernier.fields
    p.naissance = date(f[E.naissance]) ?? p.naissance
    p.surnom = txt(f[E.surnom]) ?? p.surnom
    const tel = [txt(f[E.indicatif]), txt(f[E.telephone])].filter(Boolean).join(' ')
    if (tel) p.telephone = tel
    const allergies = txt(f[E.allergiesOui]) === 'Oui' ? txt(f[E.allergies]) || 'Oui (non précisé)' : null
    apres.push(
      `insert into rh.dossiers (personne_id, adresse, ville, province, code_postal, pays, assurance_maladie, etudiant_temps_plein, etudes, allergies, diete, taille_tshirt, taille_hoodie, urgence1_nom, urgence1_lien, urgence1_telephone, urgence2_nom, urgence2_lien, urgence2_telephone) values (` +
        [
          personneExpr(p),
          q(txt(f[E.adresse])),
          q(txt(f[E.ville])),
          q(txt(f[E.province])),
          q(txt(f[E.codePostal])),
          q(txt(f[E.pays])),
          q(txt(f[E.nam])),
          { Oui: 'true', Non: 'false' }[txt(f[E.etudiant])] ?? 'null',
          q(txt(f[E.etudes])),
          q(allergies),
          q(DIETES[txt(f[E.diete])] ?? null),
          q(TAILLE(f[E.tshirt])),
          q(TAILLE(f[E.hoodie])),
          q(txt(f[E.u1nom])),
          q(txt(f[E.u1lien])),
          q(txt(f[E.u1tel])),
          q(txt(f[E.u2nom])),
          q(txt(f[E.u2lien])),
          q(txt(f[E.u2tel])),
        ].join(', ') +
        `) on conflict (personne_id) do update set adresse = excluded.adresse, ville = excluded.ville, province = excluded.province, code_postal = excluded.code_postal, pays = excluded.pays, assurance_maladie = excluded.assurance_maladie, etudiant_temps_plein = excluded.etudiant_temps_plein, etudes = excluded.etudes, allergies = excluded.allergies, diete = excluded.diete, taille_tshirt = excluded.taille_tshirt, taille_hoodie = excluded.taille_hoodie, urgence1_nom = excluded.urgence1_nom, urgence1_lien = excluded.urgence1_lien, urgence1_telephone = excluded.urgence1_telephone, urgence2_nom = excluded.urgence2_nom, urgence2_lien = excluded.urgence2_lien, urgence2_telephone = excluded.urgence2_telephone;`,
    )
    if (avecPaie) {
      const nas = chiffres(f[E.nas])?.padStart(9, '0') ?? null
      const compte = chiffres(f[E.compte])
      apres.push(
        `insert into rh.paie (personne_id, nas, nas_fin, transit, institution, compte, compte_fin, updated_by_nom) values (${personneExpr(p)}, ${nas ? `rh.chiffrer(${q(nas)})` : 'null'}, ${q(nas?.slice(-3))}, ${q(chiffres(f[E.transit]))}, ${q(chiffres(f[E.institution]))}, ${compte ? `rh.chiffrer(${q(compte)})` : 'null'}, ${q(compte?.slice(-3))}, 'Airtable') on conflict (personne_id) do update set nas = excluded.nas, nas_fin = excluded.nas_fin, transit = excluded.transit, institution = excluded.institution, compte = excluded.compte, compte_fin = excluded.compte_fin;`,
      )
      if (dossierFichiers) apres.push(...fichiers(f[E.specimen], { personne: { expr: personneExpr(p) }, genre: 'specimen', seau: 'rh-paie' }))
    }
  }
}

function champsDossier(d) {
  const f = d.fields
  const remuneration = REMU[txt(f[E.remuneration])] ?? null
  const vacances = VAC[txt(f[E.vacances])] ?? null
  const dispos = liste(f[E.dispos]).map(exprDispo).filter(Boolean)
  return {
    statut: remuneration && vacances ? 'complete' : 'dossier_recu',
    remuneration,
    vacances,
    type: /^[BCEPRT]/.exec(txt(f[E.typeEmploye]) ?? '')?.[0] ?? null,
    action: /^[AM]/.exec(txt(f[E.action]) ?? '')?.[0] ?? null,
    dateEmbauche: date(f[E.dateEmbauche]),
    dispos: dispos.length ? `array_remove(array[${dispos.join(',')}]::uuid[], null)` : null,
    disposNote: txt(f[E.disposNote]),
    ethique: f[E.ethique] ? d.createdTime : null,
    commentaires: txt(f[E.commentaires]),
    presentation: json({
      'Campeur ou anim avant à la BPA': txt(f[E.campeur]),
      'Activité préférée': txt(f[E.activite]),
      'Repas préféré': txt(f[E.repas]),
      'Chanson de karaoké': txt(f[E.karaoke]),
    }),
    recu: d.createdTime,
    airtable: d.id,
  }
}

function fichiersDossier(d, p, embaucheExpr) {
  const f = d.fields
  const personne = { expr: personneExpr(p) }
  return [
    ...fichiers(f[E.cv], { personne, genre: 'cv', embauche: embaucheExpr }),
    ...fichiers(f[E.contrat], { personne, genre: 'contrat', embauche: embaucheExpr }),
    ...fichiers(f[E.premiersSoins], { personne, genre: 'premiers_soins', embauche: embaucheExpr }),
    ...fichiers(f[E.sn], { personne, genre: 'sauveteur', embauche: embaucheExpr }),
    ...fichiers(f[E.identite], { personne, genre: 'piece_identite', embauche: embaucheExpr }),
    ...fichiers(f[E.consentement], { personne, genre: 'consentement_parental', embauche: embaucheExpr }),
    ...fichiers(f[E.photo], { personne, genre: 'photo', embauche: embaucheExpr }),
  ]
}

// Banque d'employés (2025) : anciens, saisons actives, « ne reprendrait pas ».
for (const r of banque) {
  const f = r.fields
  const c = courriel(f[B.courriel])
  const p = personnePour({ cle: r.id, courriel: c, prenom: txt(f[B.prenom]), nom: txt(f[B.nom]) })
  p.surnom = p.surnom ?? txt(f[B.surnom])
  p.telephone = p.telephone ?? txt(f[B.telephone])
  if (txt(f[B.nePas])) p.nePas = true
  // La banque ne garde que la dernière saison : « a déjà travaillé » dit qu'il y en a eu d'autres.
  if (txt(f[B.dejaTravaille]) === 'Oui') p.deja = true
  const saisons = liste(f[B.saisons]).map(saisonDe).filter(Boolean)
  const compagnies = liste(f[B.compagnies]).map((x) => COMPAGNIES[x]).filter(Boolean)
  const postes = liste(f[B.postes])
  p.notes.push(
    [
      'Banque d’employés 2025 (Airtable)',
      txt(f[B.dejaTravaille]) && `a déjà travaillé avec nous : ${txt(f[B.dejaTravaille])}`,
      saisons.length && `saisons actives : ${liste(f[B.saisons]).filter((x) => saisonDe(x)).join(', ')}`,
      postes.length && `postes : ${postes.join(', ')}`,
      txt(f[B.notes]),
    ]
      .filter(Boolean)
      .join(' — '),
  )
  for (const s of saisons) {
    noterSaison(s)
    // Une saison déjà couverte par une candidature acceptée ou un dossier n'est pas recréée.
    if (saisonsEmbauchees.get(p)?.has(`${s.genre}-${s.annee}`)) continue
    sql.push(embaucheSql(`banque:${r.id}:${s.genre}${s.annee}`, p, { saison: s, compagnie: compagnies.length === 1 ? compagnies[0] : null, statut: 'complete', airtable: null }))
  }
}

// ------------------------------------------------------------------
// Écriture du SQL
// ------------------------------------------------------------------
const entete = [
  '-- Import Airtable « RH » — renseignements personnels : ne jamais mettre dans Git.',
  `-- Produit le ${new Date().toISOString()} ${avecPaie ? '(AVEC NAS et comptes, chiffrés par la base)' : '(sans paie)'}`,
  'begin;',
  // Retrouve une personne par une de ses fiches Airtable (même après une fusion dans l'app).
  `create function pg_temp.pa(p text) returns uuid language sql stable as $$ select id from rh.personnes where airtable_ids @> array[p] limit 1 $$;`,
  ...[...saisonsVues.values()].map((s) => `insert into rh.saisons (genre, annee) values (${q(s.genre)}, ${s.annee}) on conflict (genre, annee) do nothing;`),
  // Postes vus dans Airtable mais absents des listes de départ : ajoutés, retirés (actif = false).
  ...[...postesVus.values()].map(
    ([nom, code]) =>
      `insert into rh.postes (nom, entreprise_id, genres, actif, ordre) select ${q(nom)}, rh.entreprise(${q(code)}), '{ete}', false, 900 where not exists (select 1 from rh.postes where nom = ${q(nom)} and entreprise_id = rh.entreprise(${q(code)}));`,
  ),
]

const sqlPersonnes = [...personnes.values()].map((p) => {
  const ids = [...p.ids]
  const notes = p.notes.filter(Boolean).join('\n\n') || null
  return (
    `insert into rh.personnes (id, prenom, nom_famille, surnom, courriel, telephone, date_naissance, sexe, notes, ne_pas_reembaucher, raison_ne_pas, deja_travaille, vaj_le, vaj_note, airtable_ids) ` +
    `select ${q(uuid(`personne:${p.cle}`))}, ${q(p.prenom)}, ${q(p.nom)}, ${q(p.surnom ?? null)}, ${q(p.courriel)}, ${q(p.telephone ?? null)}, ${q(p.naissance ?? null)}, ${q(p.sexe ?? null)}, ${q(notes)}, ${p.nePas ? 'true' : 'false'}, ${q(p.nePas ? 'Ne reprendrait pas (banque d’employés 2025)' : null)}, ${p.deja ? 'true' : 'false'}, ${q(p.vaj_le ?? null)}, ${q(p.vaj_note ?? null)}, array[${ids.map(q).join(',')}] ` +
    `where not exists (select 1 from rh.personnes where airtable_ids && array[${ids.map(q).join(',')}] or (courriel is not null and courriel = ${q(p.courriel)}));\n` +
    // Une fiche déjà là (même courriel, ou fusionnée) reçoit les identifiants Airtable.
    `update rh.personnes set airtable_ids = array(select distinct unnest(airtable_ids || array[${ids.map(q).join(',')}])), deja_travaille = deja_travaille or ${p.deja ? 'true' : 'false'} where airtable_ids && array[${ids.map(q).join(',')}] or (courriel is not null and courriel = ${q(p.courriel)});`
  )
})

const texteSql = [
  ...entete,
  ...sqlPersonnes,
  ...sql,
  ...apres,
  `select 'personnes' as quoi, count(*) from rh.personnes union all select 'candidatures', count(*) from rh.candidatures union all select 'embauches', count(*) from rh.embauches union all select 'dossiers', count(*) from rh.dossiers;`,
  'commit;',
]
  .join('\n')
  .replaceAll('rh.personne_airtable(', 'pg_temp.pa(')

writeFileSync(sortie, texteSql + '\n')
console.error(`SQL écrit : ${sortie} (${personnes.size} personnes).`)

if (dossierFichiers) {
  mkdirSync(dossierFichiers, { recursive: true })
  writeFileSync(join(dossierFichiers, 'manifeste.json'), JSON.stringify(manifeste, null, 1))
  console.error(`Manifeste : ${manifeste.length} fichiers à télécharger (rh-fichiers.mjs).`)
}
