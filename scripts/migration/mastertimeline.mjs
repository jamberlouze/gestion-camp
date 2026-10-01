// Import unique de la base Airtable « Mastertimeline - LÜTRA » dans le
// module Mastertimeline.
//
//   node scripts/migration/mastertimeline.mjs --essai      → affiche le bilan (n'écrit rien)
//   node scripts/migration/mastertimeline.mjs              → écrit sauvegarde/mastertimeline.sql
//   node scripts/migration/mastertimeline.mjs --remplacer  → idem, en vidant d'abord le module
//   npx supabase db query --linked -f scripts/migration/sauvegarde/mastertimeline.sql
//
// Sources (hors dépôt, dans sauvegarde/mastertimeline/) :
//   annees.json  — les tables 2024-25, 2025-26 et 2026-27 (lues le 2026-09-30)
//   autres.json  — Fournisseurs, Achats, Travaux printemps 2026 (déjà nettoyés)
//
// Règles (liste de fusions validée par la direction le 2026-09-30) :
//   - La table 2026-27 devient le modèle ; 2024-25 et 2025-26 deviennent
//     l'historique (Complétée → faite, Annulée → pas cette année).
//   - La couche Dossier disparaît ; l'activité est ajoutée au titre quand il
//     ne la nomme pas (« Disque golf : Installer le parcours »).
//   - Tâches répétées sur plusieurs mois → une tâche qui revient ces mois-là.
//   - Projets dédoublonnés (Ouverture été, Fermeture été…), Entretien séparé
//     en véhicules et bâtiment.
//   - Notes : la note permanente vient de 2026-27, sauf les notes qui racontent
//     une année ; « CORVÉE » devient une case ; « METTRE EN OCTOBRE » est appliqué.
//
// Les identifiants sont dérivés des identifiants Airtable : relancer le script
// produit les mêmes lignes.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const dossier = path.join(import.meta.dirname, 'sauvegarde')
const essai = process.argv.includes('--essai')
const remplacer = process.argv.includes('--remplacer')
const annees = JSON.parse(fs.readFileSync(path.join(dossier, 'mastertimeline', 'annees.json'), 'utf8'))
const autres = JSON.parse(fs.readFileSync(path.join(dossier, 'mastertimeline', 'autres.json'), 'utf8'))

// ------------------------------------------------------------ outils ---

/** UUID stable tiré d'une clé (même principe qu'un UUID v5). */
function uuid(cle) {
  const h = crypto.createHash('sha1').update(`mastertimeline:${cle}`).digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}

const norm = (s) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Texte propre : espaces en trop, « / » laissé en fin de cellule. */
const propre = (s) =>
  (s ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/(\s*\/\s*)+$/, '')
    .replace(/\n{2,}/g, '\n')
    .trim()

const un = (x) => (Array.isArray(x) ? x.join(', ') : (x ?? ''))

const NUMERO_MOIS = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 }
/** « 01 - Octobre » → 10. Le nom fait foi (« 12 - Août » est en août). */
function moisDe(texte) {
  const m = /\d+\s*-\s*([^\s/]+)/.exec(texte ?? '')
  return m ? (NUMERO_MOIS[norm(m[1])] ?? null) : null
}
/** Position dans l'exercice (octobre = 0). */
const rangMois = (m) => (m + 2) % 12

/** Note sans les marques reprises ailleurs (corvée, fréquence, consigne déjà appliquée). */
function nettoyerNote(s) {
  let t = propre(s)
    .replace(/METTRE EN OCTOBRE/gi, '')
    .replace(/[*+]?\s*corv[ée]e\s*\??/gi, '')
    .replace(/(à faire )?\d+\s*x par (mois|année|an)( l'automne)?( \(annulé\))?/gi, '')
    .replace(/\((trappe à graisse, poste de pompage, et (fosse|fausse) sceptique)\)/gi, '')
  t = t
    .split('\n')
    .map((l) => l.replace(/[\s+,/-]+$/, '').replace(/^[\s+:,/-]+/, '').trim())
    .filter(Boolean)
    .join('\n')
  const entoure = /^\((.*)\)$/s.exec(t)
  if (entoure) t = entoure[1].trim()
  // Devenu le responsable de la tâche.
  if (norm(t) === 'sylvie responsable') return null
  return t || null
}

// --------------------------------------------------------- référentiel ---

const ENTREPRISES = [
  ['GBPA+', '#19774a'],
  ['Opikawa', '#567E96'],
  ['BPA inc.', '#8A7B62'],
  ['Aquabounga', '#2b8cc4'],
  ['Rouge & Diable', '#c0392b'],
].map(([nom, couleur], i) => ({ id: uuid(`entreprise:${nom}`), nom, couleur, ordre: i + 1 }))
const entreprise = (nom) => ENTREPRISES.find((e) => e.nom === nom)?.id ?? null

const PROJETS_ANNUELS = [
  ['Planification', '#7A6AA8'],
  ['RH', '#B0607A'],
  ['Camp de vacances', '#19774a'],
  ['Préparation été', '#5E7C3F'],
  ['Classes vertes', '#6aa84f'],
  ['Classes rouges', '#c0392b'],
  ['Classes blanches', '#8fb3c9'],
  ['Ouverture été', '#E38B45'],
  ['Fermeture été', '#c0812b'],
  ['Ouverture hiver', '#567E96'],
  ['Fermeture hiver', '#3d5a6c'],
  ['Entretien véhicules', '#8A7B62'],
  ['Entretien bâtiment', '#a29e93'],
  ['Site web et logiciels', '#2b8cc4'],
]
const PROJETS_PONCTUELS = [
  'Trembloc',
  'Chambre Motel',
  "Nouveau site de tag-à-l'arc",
  'Rafraîchissement du bâtiment',
  'Travaux forestiers',
  "Nouveau site de tir à l'arc",
  'Aménagement paysager',
  'Travaux bâtiment',
]
const COULEURS_PONCTUELS = ['#567E96', '#5E7C3F', '#B0607A', '#E38B45', '#8A7B62', '#7A6AA8', '#19774a', '#c0812b']
const PROJETS = [
  ...PROJETS_ANNUELS.map(([nom, couleur], i) => ({ id: uuid(`projet:${nom}`), nom, couleur, ordre: i + 1, ponctuel: false })),
  ...PROJETS_PONCTUELS.map((nom, i) => ({ id: uuid(`projet:${nom}`), nom, couleur: COULEURS_PONCTUELS[i], ordre: 101 + i, ponctuel: true })),
]
const projet = (nom) => {
  const p = PROJETS.find((x) => x.nom === nom)
  if (!p) throw new Error(`Projet inconnu : ${nom}`)
  return p.id
}

// Pogo et Sarah ne sont pas repris (décision du 2026-09-30) ; courriels plus tard.
const RESPONSABLES = ['Maxime', 'Marco', 'Charlotte', 'Vickie', 'Frédérique', 'Dom', 'Sylvie'].map((nom) => ({ id: uuid(`responsable:${nom}`), nom }))
const responsable = (nom) => RESPONSABLES.find((r) => r.nom === nom)?.id ?? null

const FOURNISSEURS = autres.fournisseurs.map((f) => ({ ...f, uid: uuid(`fournisseur:${f.id}`) }))
function fournisseur(nom) {
  if (!nom) return null
  const f = FOURNISSEURS.find((x) => norm(x.nom) === norm(nom) || x.alias?.some((a) => norm(a) === norm(nom)))
  if (!f) throw new Error(`Fournisseur inconnu : ${nom}`)
  return f.uid
}

// ------------------------------------------------ projets des tâches ---

const PROJET_AIRTABLE = {
  'ouverture terrain ete': 'Ouverture été',
  'ouverture terrain': 'Ouverture été',
  ouverture: 'Ouverture été',
  'fermeture terrain ete': 'Fermeture été',
  'fermeture terrain': 'Fermeture été',
  fermeture: 'Fermeture été',
  'ouverture terrain hiver': 'Ouverture hiver',
  'fermeture hiver': 'Fermeture hiver',
  'camp de vacances': 'Camp de vacances',
  'camp de vacances camp de jour': 'Camp de vacances',
  'peparation ete': 'Préparation été',
  planification: 'Planification',
  marketing: 'Planification',
  rh: 'RH',
  'site web et logiciels': 'Site web et logiciels',
  'classes blanche': 'Classes blanches',
  'classes rouges': 'Classes rouges',
  'classes vertes': 'Classes vertes',
}
const SANS_PROJET = [
  ['faire le tour des reservation du printemps', 'Classes vertes'],
  ['envoi infos classes vertes', 'Classes vertes'],
  ['decision sur items de merch', 'Planification'],
  ['demander a glissade aventure', 'Planification'],
  ['envoyer le formulaire de verification', 'Camp de vacances'],
]
const VEHICULE = /(vehicul|pneu|autobus|remorque|assurance|remis|mecaniq|conduite|uhaul)/

function projetDe(ligne, titre) {
  const p = norm(un(ligne.projet))
  if (p.startsWith('entretien')) return projet(VEHICULE.test(norm(titre)) ? 'Entretien véhicules' : 'Entretien bâtiment')
  if (p) {
    if (!PROJET_AIRTABLE[p]) throw new Error(`Projet Airtable sans correspondance : ${un(ligne.projet)}`)
    return projet(PROJET_AIRTABLE[p])
  }
  const n = norm(titre)
  const regle = SANS_PROJET.find(([debut]) => n.startsWith(debut))
  return regle ? projet(regle[1]) : null
}

// ---------------------------------------------------------- titres ---

/** Nom de l'activité (ancien Dossier) et mots qui montrent que le titre la nomme déjà. */
const ACTIVITES = {
  accrobranche: ['Accrobranche', ['accrobranche']],
  acrobranche: ['Accrobranche', ['acrobranche', 'accrobranche']],
  'baignade beach party': ['Plage', ['plage', 'baignade', 'beach', 'bouee', 'sauveteur', 'quai']],
  camping: ['Camping', ['camping', 'tente', 'glaciere']],
  'canot camping': ['Canot-Camping', ['canot']],
  canot: ['Canot', ['canot']],
  'chasse au tresor': ['Chasse au trésor', ['tresor']],
  'disque golf': ['Disque golf', ['disque']],
  escalade: ['Escalade', ['escalade', 'paroi']],
  'jeux coop': ['Jeux coop', ['jeux coop']],
  kayak: ['Kayak', ['kayak', 'vfi', 'pagaie']],
  'kayak de riviere': ['Kayak de rivière', ['riviere', 'kayak']],
  paddleboard: ['Paddleboard', ['sup', 'paddle']],
  rabaska: ['Rabaska', ['rabaska']],
  'rando camping': ['Rando-Camping', ['rando']],
  'sports collectifs': ['Sports collectifs', ['basket', 'volley', 'ballon', 'hockey', 'balai']],
  'sports collectif': ['Sports collectifs', ['hockey', 'balai', 'ballon']],
  'survie en foret': ['Survie en forêt', ['abri', 'feu', 'briquet', 'survie', 'sentier', 'aire']],
  'tag a l arc': ["Tag à l'arc", ['tag']],
  'tir a l arc': ["Tir à l'arc", ['tir', 'foin', 'cible']],
  'trou de bouette': ['Trou de bouette', ['bouette']],
  glissade: ['Glissade', ['glissade', 'crazy', 'traineau']],
  raquette: ['Raquette', ['raquette']],
}

const PNEUS = 'mettre les pneus d hiver'
const ASSURANCES = ['inspecter remiser retirer des assurances', 'inspecter deremiser remettre sur les assurances']

/** Titre du modèle : véhicule pris dans la note, activité devant le titre. */
function titreDe(ligne) {
  let titre = propre(ligne.titre)
  const n = norm(titre)
  const note = propre(ligne.notes)
  if (n === PNEUS) return { titre: `${titre} : ${note.startsWith('Sur l') ? "autobus qui fait l'hiver" : note}`, noteVehicule: true }
  if (ASSURANCES.includes(n) && note) return { titre: `${note} : ${titre.charAt(0).toLowerCase()}${titre.slice(1)}`, noteVehicule: true }
  const d = norm(un(ligne.dossier))
  const activite = ACTIVITES[d]
  if (activite && !activite[1].some((mot) => n.includes(mot))) titre = `${activite[0]} : ${titre}`
  return { titre, noteVehicule: false }
}

/** Clé qui retrouve une même tâche d'une année à l'autre. */
const cleLigne = (l) => [un(l.ent), norm(propre(l.titre)), moisDe(l.mois), norm(un(l.dossier)), ASSURANCES.includes(norm(propre(l.titre))) || norm(propre(l.titre)) === PNEUS ? norm(l.notes) : ''].join('|')

// ----------------------------------------------- règles de fréquence ---

const RETIREES = (l) => {
  const n = norm(propre(l.titre))
  return (
    n.startsWith('analyse eau batiment') || // → note sur la fiche Pierre Bertrand
    n.startsWith('preparation du budget de chaque compagnie') || // retirée pour l'instant
    (n.startsWith('verifier les remorques plaque') && moisDe(l.mois) === 9) // doublon de mai (« Printemps »)
  )
}

/** Fusions : plusieurs lignes Airtable → une tâche qui revient plusieurs mois. */
const FUSIONS = [
  { cle: 'gouttieres', ent: 'GBPA+', titres: ['vider les gouttieres'], mois: [9, 10, 11], note: null },
  {
    cle: 'debouchage',
    ent: 'BPA inc.',
    titres: ['debouchage complet des tuyaux'],
    mois: [11, 4],
    note: 'Eau chaude + savon dans toutes les douches en même temps. À faire avant la première neige.',
  },
  { cle: 'inspection-maison', ent: 'GBPA+', titres: ['inspection maison ou garage des vehicules'], mois: [10, 5] },
  { cle: 'entrevues', ent: 'GBPA+', titres: ['entrevues pour les differents postes'], mois: [2, 3] },
  {
    cle: 'fosse',
    ent: 'GBPA+',
    titres: ['vidange trappe a graisse', 'vidange de la fosse septique', 'pompage sanitaire'],
    mois: [5, 11],
    titre: 'Vidange fosse septique + trappe à graisse + poste de pompage',
    note: 'Fosse septique, trappe à graisse et poste de pompage.',
    fournisseur: 'Pompage Sanitaire',
  },
]
const fusionDe = (l) => FUSIONS.find((f) => f.ent === un(l.ent) && f.titres.includes(norm(propre(l.titre))))

/** Une seule ligne, mais une autre fréquence que « chaque année, ce mois-là ». */
const REGLAGES = [
  { ent: 'BPA inc.', titre: 'nettoyer filtres nouvelles fenetres', mois: [10], note: null },
  { ent: 'GBPA+', titre: 'inspection mecanique des vehicules', mois: [10, 4] },
  { ent: 'BPA inc.', titre: 'scellant grout ceramique douches aux 2 ans', mois: [3], intervalle: 2, depart: 2026, nouveauTitre: 'Scellant grout céramique douches' },
]
const reglageDe = (l) => REGLAGES.find((r) => r.ent === un(l.ent) && norm(propre(l.titre)) === r.titre)

/** Notes de 2026-27 qui racontent une année passée : elles restent dans l'historique. */
const NOTES_D_UNE_ANNEE = [
  'faire une liste des achats necessaire pour l an prochain',
  'payer mathieu prud homme 250',
  'ranger les pagaies r d dans une cabine d essayage',
  'ranger toutes les pagaies dans la cabane nautique',
  'ramener les tables a picnique a cote du container aquabounga',
  'ranger le set up du feu anim',
  'ranger les easy up',
  'ranger les kayaks en plusieurs batch sur le parking r d sous une bache',
  'ranger les chaises et les parasols',
  'ranger les meubles rd container',
]
const noteDUneAnnee = (l) =>
  NOTES_D_UNE_ANNEE.includes(norm(propre(l.titre))) ||
  (norm(propre(l.titre)) === 'jeter le materiel qui n est plus fonctionnel' && norm(un(l.dossier)) === 'acrobranche')

/** Fournisseur déduit du titre quand Airtable n'avait pas de lien. */
const FOURNISSEUR_PAR_TITRE = [
  [/payer mathieu prud homme|louer le terrain pour escalade/, 'Mathieu Prudhomme'],
  [/montagne d argent/, "Montagne d'argent"],
  [/commander des cordes de bois/, 'Mike Cordes de Bois'],
  [/uhaul/, 'U-Haul'],
  [/promeneur/, 'Le Promeneur'],
  [/appeler pompage sanitaire/, 'Pompage Sanitaire'],
  [/securite incendie/, 'Sécurité incendie Saint-Constant'],
  [/\bfh\b/, 'Fare Harbour'],
  [/bertholdi/, 'Bertholdi'],
]

// ------------------------------------------------------- le modèle ---

const modele = annees['2026-27']
const annee2526 = new Map(annees['2025-26'].map((l) => [cleLigne(l), l]))
const taches = new Map() // id → tâche
const tacheDeCle = new Map() // cleLigne(2026-27) → id de la tâche
const rapport = { fusions: [], retirees: [], prefixes: [], deplaceesOctobre: [], corvee: 0, notesAnnee: [] }

for (const l of modele) {
  if (RETIREES(l)) {
    rapport.retirees.push(propre(l.titre))
    continue
  }
  const fusion = fusionDe(l)
  const reglage = reglageDe(l)
  const id = uuid(fusion ? `tache:fusion:${fusion.cle}` : `tache:${l.id}`)
  tacheDeCle.set(cleLigne(l), id)
  const jumelle = annee2526.get(cleLigne(l))
  const notesBrutes = `${l.notes ?? ''}\n${jumelle?.notes ?? ''}`
  const corvee = /corv/i.test(notesBrutes)
  const enOctobre = /METTRE EN OCTOBRE/i.test(jumelle?.notes ?? '')

  if (taches.has(id)) {
    // Ligne de plus d'une fusion : responsable ou fournisseur manquant pris ici.
    const t = taches.get(id)
    t.responsable_id ??= responsable(un(l.resp))
    t.corvee ||= corvee
    continue
  }

  const { titre, noteVehicule } = titreDe(l)
  if (titre !== propre(l.titre) && !noteVehicule) rapport.prefixes.push(titre)
  let note = noteVehicule ? null : nettoyerNote(l.notes)
  let resp = responsable(un(l.resp))
  if (norm(l.notes) === 'sylvie responsable') resp = responsable('Sylvie')
  if (noteDUneAnnee(l)) {
    if (note) rapport.notesAnnee.push(`${titre} — « ${note.split('\n')[0]} »`)
    note = null
  }
  const nap = propre(l.nap)
  if (/premiere neige/.test(norm(nap))) note = [note, nap].filter(Boolean).join(' ')

  let mois = [moisDe(l.mois)]
  if (fusion) {
    mois = fusion.mois
    if ('note' in fusion) note = fusion.note
    rapport.fusions.push(`${fusion.titre ?? titre} : ${fusion.mois.join(', ')}`)
  } else if (reglage) {
    mois = reglage.mois
    if ('note' in reglage) note = reglage.note
  } else if (enOctobre) {
    mois = [10]
    rapport.deplaceesOctobre.push(titre)
  }
  if (corvee) rapport.corvee++

  const fourn =
    fusion?.fournisseur ??
    (un(l.fourn) || FOURNISSEUR_PAR_TITRE.find(([motif]) => motif.test(norm(l.titre)))?.[1] || null)

  taches.set(id, {
    id,
    titre: fusion?.titre ?? reglage?.nouveauTitre ?? titre,
    entreprise_id: entreprise(un(l.ent)),
    projet_id: projetDe(l, propre(l.titre)),
    responsable_id: resp,
    fournisseur_id: fournisseur(fourn),
    note,
    corvee,
    mois,
    intervalle_ans: reglage?.intervalle ?? 1,
    exercice_depart: reglage?.depart ?? 2024,
  })
}

// Projets ponctuels (Travaux printemps 2026, plus le Woofing d'automne).
autres.travaux.forEach((w, i) => {
  const id = uuid(`tache:${w.id}`)
  taches.set(id, {
    id,
    titre: w.titre,
    projet_id: projet(w.projet),
    responsable_id: responsable(w.responsable),
    fournisseur_id: fournisseur(w.fournisseur),
    note: w.note ?? null,
    priorite: w.priorite ?? null,
    heures_prevues: w.heures ?? null,
    debut: w.debut ?? null,
    echeance: w.echeance ?? null,
    position: i + 1,
    mois: null,
    intervalle_ans: 1,
    exercice_depart: null,
  })
})

// --------------------------------------------------------- historique ---

/** Tâche du modèle pour une ligne d'une autre année : même clé, sinon titre semblable. */
function retrouver(l) {
  const exacte = tacheDeCle.get(cleLigne(l))
  if (exacte) return exacte
  const [ent, titre, , dossierL] = cleLigne(l).split('|')
  const candidats = [...tacheDeCle.entries()].filter(([k]) => k.startsWith(`${ent}|`))
  const memeTitre = candidats.filter(([k]) => k.split('|')[1] === titre && (!dossierL || k.split('|')[3] === dossierL))
  if (memeTitre.length === 1) return memeTitre[0][1]
  // Titre retouché d'une année à l'autre : mots en commun.
  const mots = new Set(titre.split(' ').filter((m) => m.length > 2))
  let meilleur = null
  for (const [k, id] of candidats) {
    const autresMots = new Set(k.split('|')[1].split(' ').filter((m) => m.length > 2))
    const communs = [...mots].filter((m) => autresMots.has(m)).length
    const score = communs / Math.max(mots.size, autresMots.size)
    if (score >= 0.7 && (!meilleur || score > meilleur.score)) meilleur = { id, score }
  }
  return meilleur?.id ?? null
}

/** Mois du passage : celui de la ligne, ou le plus proche des mois de la tâche. */
function moisDuPassage(t, m) {
  if (t.mois.includes(m)) return m
  return [...t.mois].sort((a, b) => Math.abs(rangMois(a) - rangMois(m)) - Math.abs(rangMois(b) - rangMois(m)))[0]
}

const coches = new Map() // `${tache}|${periode}` → coche
const RANG = { faite: 2, sautee: 1 }
function ajouterCoche(c) {
  const cle = `${c.tache_id}|${c.periode}`
  const avant = coches.get(cle)
  if (!avant) return coches.set(cle, c)
  const notes = [...new Set([avant.note, c.note].filter(Boolean))]
  const gagnante = (RANG[c.statut] ?? 0) > (RANG[avant.statut] ?? 0) ? c : avant
  coches.set(cle, { ...gagnante, note: notes.join(' · ') || null })
}

const STATUT = { Complétée: 'faite', Annulée: 'sautee' }
const nonRetrouvees = []
for (const [libelle, debut] of [
  ['2024-25', 2024],
  ['2025-26', 2025],
]) {
  for (const l of annees[libelle]) {
    if (RETIREES(l)) continue
    const id = retrouver(l)
    const t = id && taches.get(id)
    const m = moisDe(l.mois)
    if (!t || !m) {
      if (STATUT[un(l.statut)] || l.notes) nonRetrouvees.push(`${libelle} · ${un(l.ent)} · ${propre(l.titre)}`)
      continue
    }
    const mois = moisDuPassage(t, m)
    const periode = `${mois >= 10 ? debut : debut + 1}-${String(mois).padStart(2, '0')}`
    // La note de la ligne devient la note de l'année, sauf si elle est déjà
    // dans la note permanente ou si c'est le nom du véhicule (passé au titre).
    const vehicule = norm(propre(l.titre)) === PNEUS || ASSURANCES.includes(norm(propre(l.titre)))
    let note = vehicule ? null : nettoyerNote(l.notes)
    if (note && t.note && norm(t.note).includes(norm(note))) note = null
    const nap = libelle === '2024-25' ? propre(un(l.nap)) : ''
    if (nap) note = [note, `Pour l'an prochain : ${nap}`].filter(Boolean).join('\n')
    const statut = STATUT[un(l.statut)] ?? null
    if (!statut && !note) continue
    ajouterCoche({ tache_id: id, periode, statut, note, fait_le: statut ? (l.reelle ?? null) : null })
  }
}

// Registre des travaux : faits par Sylvie en septembre 2026.
const goudron = [...taches.values()].find((t) => norm(t.titre) === 'scellant goudron toit des cedres polymere')
ajouterCoche({ tache_id: goudron.id, periode: '2026-10', statut: 'faite', note: 'Fait par Sylvie en septembre 2026 (registre des travaux).', fait_le: null })
for (const w of autres.travaux) {
  if (w.faite) ajouterCoche({ tache_id: uuid(`tache:${w.id}`), periode: 'unique', statut: 'faite', note: w.noteFaite ?? null, fait_le: null })
}

const achats = autres.achats.map((a) => ({ id: uuid(`achat:${a.id}`), item: a.item, fournisseur_id: fournisseur(a.fournisseur), note: a.note ?? null }))

// ------------------------------------------------------------- bilan ---

const annuelles = [...taches.values()].filter((t) => t.mois)
console.log(`Entreprises ${ENTREPRISES.length} · projets ${PROJETS.length} · responsables ${RESPONSABLES.length} · fournisseurs ${FOURNISSEURS.length}`)
console.log(`Tâches annuelles ${annuelles.length} · tâches de projets ponctuels ${taches.size - annuelles.length} · achats ${achats.length}`)
const parStatut = [...coches.values()].reduce((n, c) => ((n[c.statut ?? 'note seule'] = (n[c.statut ?? 'note seule'] ?? 0) + 1), n), {})
console.log(`Coches ${coches.size}`, parStatut)
console.log(`\nFusions (${rapport.fusions.length}) :\n  ${rapport.fusions.join('\n  ')}`)
console.log(`\nRetirées (${rapport.retirees.length}) :\n  ${rapport.retirees.join('\n  ')}`)
console.log(`\nDéplacées en octobre (${rapport.deplaceesOctobre.length}) :\n  ${rapport.deplaceesOctobre.join('\n  ')}`)
console.log(`\nTitres avec l'activité (${rapport.prefixes.length}) :\n  ${rapport.prefixes.join('\n  ')}`)
console.log(`\nNotes d'une année sorties du modèle (${rapport.notesAnnee.length}) :\n  ${rapport.notesAnnee.join('\n  ')}`)
console.log(`\nCorvée : ${rapport.corvee} tâches`)
const parProjet = annuelles.reduce((n, t) => {
  const nom = PROJETS.find((p) => p.id === t.projet_id)?.nom ?? '(aucun)'
  n[nom] = (n[nom] ?? 0) + 1
  return n
}, {})
console.log('\nTâches annuelles par projet :', parProjet)
if (nonRetrouvees.length) console.log(`\nLignes d'historique sans tâche correspondante (${nonRetrouvees.length}, ignorées) :\n  ${nonRetrouvees.join('\n  ')}`)
if (essai) process.exit(0)

// --------------------------------------------------------------- SQL ---

const q = (v) => {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return `'{${v.join(',')}}'`
  return `'${String(v).replace(/'/g, "''")}'`
}
function inserer(table, colonnes, lignes) {
  if (!lignes.length) return ''
  const valeurs = lignes.map((l) => `  (${colonnes.map((c) => q(l[c])).join(', ')})`).join(',\n')
  return `insert into mastertimeline.${table} (${colonnes.join(', ')}) values\n${valeurs};\n\n`
}

let sql = `-- Généré par scripts/migration/mastertimeline.mjs le ${new Date().toISOString()}\nbegin;\n\n`
if (remplacer) sql += 'delete from mastertimeline.coches;\ndelete from mastertimeline.achats;\ndelete from mastertimeline.taches;\ndelete from mastertimeline.projets;\ndelete from mastertimeline.entreprises;\ndelete from mastertimeline.responsables;\ndelete from mastertimeline.fournisseurs;\n\n'
sql += inserer('entreprises', ['id', 'nom', 'couleur', 'ordre'], ENTREPRISES)
sql += inserer('projets', ['id', 'nom', 'couleur', 'ordre', 'ponctuel'], PROJETS)
sql += inserer('responsables', ['id', 'nom'], RESPONSABLES)
sql += inserer(
  'fournisseurs',
  ['id', 'nom', 'personne_ressource', 'telephone', 'courriel', 'site_web', 'service', 'notes'],
  FOURNISSEURS.map((f) => ({ ...f, id: f.uid })),
)
const colonnesTache = ['id', 'titre', 'entreprise_id', 'projet_id', 'responsable_id', 'fournisseur_id', 'note', 'corvee', 'mois', 'intervalle_ans', 'exercice_depart', 'debut', 'echeance', 'priorite', 'heures_prevues', 'position']
sql += inserer('taches', colonnesTache, [...taches.values()].map((t) => ({ corvee: false, ...t })))
sql += inserer('coches', ['tache_id', 'periode', 'statut', 'note', 'fait_le'], [...coches.values()])
sql += inserer('achats', ['id', 'item', 'fournisseur_id', 'note'], achats)
sql += 'commit;\n'

const fichier = path.join(dossier, 'mastertimeline.sql')
fs.writeFileSync(fichier, sql)
console.log(`\nÉcrit : ${path.relative(process.cwd(), fichier)} (${Math.round(sql.length / 1024)} ko)`)
