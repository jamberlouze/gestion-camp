#!/usr/bin/env node
// Prix d'un exercice passé dans la liste de prix des Réservations, tirés de
// l'onglet « Liste de prix » d'un chiffrier « Estimés | Accueil de groupe »
// (export CSV de cet onglet : Fichier › Télécharger › CSV). Produit un fichier
// SQL à appliquer sur la base visée (DEV : psql ; PROD : à la bascule, comme
// l'import des Sheets). Rien de personnel : seulement des prix.
//
//   node scripts/migration/reservations-prix-historique.mjs \
//     --liste scripts/migration/sauvegarde/reservations-liste-prix-2025-26.csv \
//     --exercice 2026 --sortie <prix-2025-26.sql>
//
// Méthode (révision du 2026-10-14) : les estimés 2025-26 importés en DEV
// n'ont qu'une ligne au montant des Sheets, sans prix unitaires ; les prix
// viennent donc de la liste du chiffrier 2025-26 (la même que ses onglets
// 26-G utilisaient), et on a vérifié qu'ils refont au cent près les montants
// des estimés importés (docs/verification-prix-2026-10-14.md). Le supplément
// d'une seule nuit (CN-N1, 5 $) n'est pas dans la liste : il était dans la
// formule du chiffrier, confirmé par les estimés. Les trous restent vides :
// billets de Tremblant à 0 $, pêche et traîneau sans prix, sections (calculées :
// lits × prix du lit). Prix importés = validés (ce sont les prix de l'année),
// signés « Chiffrier AAAA-AA (import) ». Une ligne déjà modifiée dans l'app
// n'est jamais réécrite (rejouable).

import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const args = process.argv.slice(2)
const arg = (nom) => (args.indexOf(nom) >= 0 ? args[args.indexOf(nom) + 1] : null)
const fichier = arg('--liste')
const exercice = Number(arg('--exercice'))
const sortie = arg('--sortie')
if (!fichier || !sortie || !Number.isInteger(exercice) || exercice < 2021) {
  console.error('Usage : --liste <csv> --exercice <2026> --sortie <sql>')
  process.exit(1)
}
const libelleEx = `${exercice - 1}-${String(exercice).slice(2)}`

// Libellé de la liste (sans accents ni ponctuation) → code du catalogue.
// Classe nature et Journée plein air ont les mêmes libellés : le bloc
// (colonne A) décide.
const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9:]+/g, ' ')
    .trim()

const PAR_BLOC = {
  cn: { nuitee: 'CN-N', repas: 'REPAS', 'animation 1:10': 'CN-1:10', 'animation 1:15': 'CN-1:15', 'animation 1:20': 'CN-1:20', 'animation 1:x': 'CN-1:X' },
  jpa: { repas: 'REPAS', 'animation 1:10': 'JPA-1:10', 'animation 1:15': 'JPA-1:15', 'animation 1:20': 'JPA-1:20', 'animation 1:x': 'JPA-1:X' },
}
const LIBELLES = Object.fromEntries(
  [
    ['Surveillance de nuit (par nuit, par section)', 'SURV-NUIT'],
    ['Surveillance de soirée 20h à 22h (par soirée, par section)', 'SURV-SOIR'],
    ['Matériel nautique (VFI + canot, kayak, planche à pagaie)', 'MAT-NAUT'],
    ["Matériel d'hiver (raquette, luge)", 'MAT-HIVER'],
    ["Matériel spécialisé (tir à l'arc, tag à l'arc, boussoles)", 'MAT-SPEC'],
    ['Forfait | Soirée régulier (16h - 23h)', 'LS-SR'],
    ['Forfait | Journée régulier (9h - 17h)', 'LS-JR'],
    ['Forfait | Journée complète (9h - 23h)', 'LS-JC'],
    ['Heures supplémentaires | Facturées selon les heures réelles', 'LS-HS'],
    ['Repas régulier', 'REPAS'],
    ['Repas festif | Par personne', 'REPAS-FESTIF'],
    ['Cocktail dinatoire (17h00 à 19h00, sans service) | Par personne', 'COCKTAIL'],
    ['Collation du soir | Par personne (Délicookie et fruits frais)', 'COLLATION'],
    ['Accès chambre froide uniquement (4 étagères) | Par jour', 'CH-FROIDE'],
    ['Location de cuisine commerciale avec production | Bloc 5h', 'CUIS-5H'],
    ['Location de cuisine commerciale avec production | Bloc 10h', 'CUIS-10H'],
    ['Location cuisinette Vieille France | Par jour', 'CUISINETTE-VF'],
    ['Location cuisine commerciale | Par repas', 'CUIS-REPAS'],
    ['Arrivée hâtive | Par heure', 'ARRIVEE-HATIVE'],
    ['Départ tardif | Par heure', 'DEPART-TARDIF'],
    ['Chambre supplémentaire | Section Motel | Par nuitée', 'CHAMBRE-MOTEL'],
    ['Bac de buche supplémentaire', 'BUCHES'],
    ['Location audiovisuel | Par jour', 'AUDIOVISUEL'],
    ["Location d'embarcation nautique | Par personne et par jour", 'EMBARCATION'],
    ["Animation (1 employé dédié à l'animation du groupe, de 9h à 17h)", 'ANIMATEUR'],
    ['Location de salle avec hébergement (50% de rabais) | Soirée', 'SALLE-HEBERG'],
    ['Tremblant | Semaine | Billet Adulte 18 ans et + (min. 20 billets)', 'TR-SEM-ADU'],
    ['Tremblant | Semaine | Billet Étudiants 18-25 ans (min. 20 billets)', 'TR-SEM-ETU'],
    ['Tremblant | Semaine | Billet Jeunes 5-17 ans (min. 20 billets)', 'TR-SEM-JEU'],
    ['Tremblant | Weekend | Billet Adulte 18 ans et + (min. 20 billets)', 'TR-WE-ADU'],
    ['Tremblant | Weekend | Billet Étudiants 18-25 ans (min. 20 billets)', 'TR-WE-ETU'],
    ['Tremblant | Weekend | Billet Jeunes 5-17 ans (min. 20 billets)', 'TR-WE-JEU'],
    ['Tremblant | Haute saison | Billet Adulte 18 ans et + (min. 20 billets)', 'TR-HS-ADU'],
    ['Tremblant | Haute saison | Billet Étudiants 18-25 ans (min. 20 billets)', 'TR-HS-ETU'],
    ['Tremblant | Haute saison | Billet Jeunes 5-17 ans (min. 20 billets)', 'TR-HS-JEU'],
    ['Ski Mont-Blanc | Semaine | Billet', 'MB-SEM-BILLET'],
    ['Ski Mont-Blanc | Semaine | Cours initiation SKI/SNOW 90 min (min. 6 - max. 8 pers.)', 'MB-SEM-COURS'],
    ['Ski Mont-Blanc | Semaine | Billet étudiant 18-24 ans', 'MB-SEM-ETU'],
    ['Ski Mont-Blanc | Weekend/HS | Billet', 'MB-WE-BILLET'],
    ['Ski Mont-Blanc | Weekend/HS | Cours initiation SKI/SNOW 60 min (min. 6 - max. 8 pers.)', 'MB-WE-COURS'],
    ['Ski Mont-Blanc | Soirée (15h à 20h) | Billet', 'MB-SOIR'],
    ['Ski Mont-Blanc | Location équipement (ski, bottes et casque)', 'MB-LOCATION'],
    ['Transport | Semaine | Mont-Blanc (par voyage)', 'TRANS-SEM-MB'],
    ['Transport | Semaine | Tremblant Sud (par voyage)', 'TRANS-SEM-TS'],
    ['Transport | Semaine | Tremblant Nord (par voyage)', 'TRANS-SEM-TN'],
    ['Transport | Semaine | Domaine St-Bernard (par voyage)', 'TRANS-SEM-DSB'],
    ['Transport | Semaine | St-sauveur (location de 8 heures)', 'TRANS-SEM-STS'],
    ['Transport | Semaine | Saint-Jovite (24 passagers - par voyage)', 'TRANS-SEM-SJ'],
    ['Transport | Semaine | Glissades Aventure-Neige (18h à 20h30)', 'TRANS-SEM-GAN'],
    ['Transport | Semaine | Sentier des Cimes (13h à 16h)', 'TRANS-SEM-CIMES'],
    ['Transport | Semaine | Sentier des Cimes (13h à 17h)', 'TRANS-SEM-CIMES'],
    ['Transport | Weekend | Mont-Blanc (aller-retour)', 'TRANS-WE-MB'],
    ['Transport | Weekend | Tremblant Sud (aller-retour)', 'TRANS-WE-TS'],
    ['Transport | Weekend | Domaine St-Bernard (aller-retour)', 'TRANS-WE-DSB'],
    ['Transport | Weekend | Saint-Jovite (24 passagers - par voyage)', 'TRANS-WE-SJ'],
    ["Transport | Montage d'argent (aller-retour)", 'TRANS-MA'],
    ['Transport | Station Tremblant (13h à 16h15)', 'TRANS-ST'],
    ['Glissade sur tube', 'TUBE'],
    ['Location de vélo', 'VELO'],
    ['Aquabounga - Bloc de 2h (tarif de groupe)', 'AQUA-GROUPE'],
    ['Aquabounga - Bloc de 2h (tarif spécial)', 'AQUA-SPECIAL'],
    ['Pêche sur glace', 'PECHE'],
    ['Traîneau à chien', 'TRAINEAU'],
    ['Domaine St-Bernard | Entrée sur le site (15+ personnes)', 'DSB-ENTREE'],
    ["Domaine St-Bernard | Location d'équipement ski classique", 'DSB-SKI'],
    ["Montagne d'argent", 'MONT-ARGENT'],
    ['Sentier des cimes', 'CIMES'],
    ['Matelas à remplacer', 'MATELAS'],
  ].map(([l, c]) => [norm(l), c]),
)
// Libellés connus qui ne sont pas des prix du catalogue.
const IGNORES = new Set(['produit', 'sans animation'].map(norm))
// Règles des produits de fournisseurs (catalogue) : ajout et arrondi.
const AJOUT = { VELO: 1 }
const AU_DOLLAR = (code) => code.startsWith('MB-')

// « 1 092,00 $ » → 1092 ; vide, « - », « #REF! » → null.
function montant(v) {
  if (typeof v === 'number') return v
  const s = String(v ?? '').replace(/[\s $]/g, '').replace(',', '.')
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null
}

const texte = readFileSync(fichier, 'utf8')
const wb = XLSX.read(texte, { type: 'string', raw: true })
const rangees = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' })

const prix = new Map() // code → { prix, cout, marge, source }
const inconnus = []
const sautes = []
let bloc = null
for (let i = 0; i < rangees.length; i++) {
  const [a, b, c, d] = rangees[i]
  const na = norm(a)
  if (na === 'classe nature') bloc = 'cn'
  else if (na === 'journee plein air') bloc = 'jpa'
  else if (na) bloc = /animation/.test(norm(b)) ? bloc : null
  // Prix du lit : sous « Prix par lit par nuit : », dans la colonne A.
  if (na.startsWith('prix par lit par nuit')) {
    const lit = montant(rangees[i + 1]?.[0])
    if (lit !== null) prix.set('LIT', { prix: lit, cout: null, marge: null })
    continue
  }
  const nb = norm(b)
  if (!nb || IGNORES.has(nb)) continue
  const code = (bloc && PAR_BLOC[bloc][nb]) || LIBELLES[nb]
  if (!code) {
    // Sections d'hébergement (« Cèdres haut (34 lits - 7 chambres) ») : calculées.
    if (/\d+ lits/.test(nb)) continue
    inconnus.push(String(b).trim())
    continue
  }
  const p = montant(d)
  if (p === null || p === 0) {
    sautes.push(`${code} (${String(d).trim() || 'vide'})`)
    continue
  }
  if (prix.has(code) && prix.get(code).prix !== p) {
    console.error(`Deux prix différents pour ${code} : ${prix.get(code).prix} et ${p}`)
    process.exit(1)
  }
  const cout = montant(c)
  const avecCout = cout !== null && cout > 0
  const ajout = AJOUT[code] ?? 0
  const marge = !avecCout ? null : AU_DOLLAR(code) ? 15 : Math.round(((p - ajout) / cout - 1) * 10_000) / 100
  prix.set(code, { prix: p, cout: avecCout ? cout : null, marge })
}
if (!prix.has('CN-N1')) prix.set('CN-N1', { prix: 5, cout: null, marge: null })

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const n = (v) => (v === null || v === undefined ? 'null' : String(v))
const lignes = [...prix].map(([code, v]) => `  (${q(code)}, ${n(v.prix)}, ${n(v.cout)}, ${n(v.marge)})`)
const signe = `Chiffrier ${libelleEx} (import)`
const sql = `-- Prix ${libelleEx} (exercice ${exercice}) tirés de la liste de prix du chiffrier
-- (généré par scripts/migration/reservations-prix-historique.mjs).
begin;
insert into reservations.prix (produit_id, exercice, prix, cout, marge, valide, valide_par_nom, modifie_le, modifie_par_nom)
select p.id, ${exercice}, v.prix, v.cout, v.marge, true, ${q(signe)}, now(), ${q(signe)}
from (values
${lignes.join(',\n')}
) as v(code, prix, cout, marge)
join reservations.produits p on p.code = v.code
on conflict (produit_id, exercice) do update
  set prix = excluded.prix, cout = excluded.cout, marge = excluded.marge, valide = true,
      valide_par_nom = excluded.valide_par_nom, modifie_le = excluded.modifie_le, modifie_par_nom = excluded.modifie_par_nom
  where reservations.prix.modifie_par is null and reservations.prix.valide_par is null;
commit;
`
writeFileSync(sortie, sql)
console.log(`${prix.size} prix ${libelleEx} : ${[...prix.keys()].join(', ')}`)
if (sautes.length) console.log(`Sans prix (laissés vides) : ${sautes.join(', ')}`)
if (inconnus.length) console.log(`Libellés inconnus (à ajouter à LIBELLES) : ${inconnus.join(' ; ')}`)
console.log(`SQL écrit : ${sortie}`)
