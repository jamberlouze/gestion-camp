// Import unique des données des deux anciens projets Supabase vers le
// nouveau projet.
//
//   node scripts/migration/importer.mjs --essai   → lit les anciennes bases et
//                                                   affiche les décomptes
//                                                   (aucune écriture)
//   node scripts/migration/importer.mjs           → importe pour de vrai
//   node scripts/migration/importer.mjs --sauvegarder → copie les anciennes
//                                                   bases dans sauvegarde/
//                                                   (fichiers JSON)
//
// Si une sauvegarde existe pour une table, elle est lue à la place de
// l'ancienne base (utile une fois l'ancien projet mis en pause).
//
// Sources : les config.js des anciens projets (dossiers voisins), lus avec
// leur clé publique (les anciennes bases sont en lecture publique).
// Destination : .env.migration à la racine du dépôt (non versionné) :
//   SUPABASE_URL=https://xxxx.supabase.co
//   SUPABASE_SECRET_KEY=sb_secret_xxxx   (Project Settings > API Keys > Secret keys)
// La clé secrète contourne la RLS : ne jamais la mettre dans le site ni la versionner.
//
// Le script peut être relancé sans créer de doublons : chaque ligne est
// insérée ou mise à jour selon sa clé primaire.

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const racine = path.resolve(import.meta.dirname, '../..')
const essai = process.argv.includes('--essai')
const sauvegarder = process.argv.includes('--sauvegarder')
const dossierSauvegarde = path.join(import.meta.dirname, 'sauvegarde')
const fichierSauvegarde = (etape) => path.join(dossierSauvegarde, `${etape.source}.${etape.de}.json`)

function lireAncienneConfig(dossier) {
  const fichier = path.join(racine, '..', dossier, 'config.js')
  if (!fs.existsSync(fichier)) return null
  const bac = { window: {} }
  vm.runInNewContext(fs.readFileSync(fichier, 'utf8'), bac)
  const { url, anonKey } = bac.window.SUPABASE_CONFIG ?? {}
  if (!url || !anonKey) throw new Error(`Configuration illisible : ${fichier}`)
  return createClient(url, anonKey, { auth: { persistSession: false } })
}

function lireDestination() {
  const fichier = path.join(racine, '.env.migration')
  if (!fs.existsSync(fichier)) throw new Error(`Fichier manquant : ${fichier}`)
  const env = Object.fromEntries(
    fs
      .readFileSync(fichier, 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  )
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new Error('.env.migration doit définir SUPABASE_URL et SUPABASE_SECRET_KEY')
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
}

async function toutLire(client, table) {
  const lignes = []
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await client.from(table).select('*').range(debut, debut + 999)
    // Table jamais créée dans l'ancien projet (ex. sorties) : rien à importer.
    if (error?.code === 'PGRST205') return []
    if (error) throw new Error(`Lecture ${table} : ${error.message}`)
    lignes.push(...data)
    if (data.length < 1000) return lignes
  }
}

// Ordre important : les tables référencées d'abord.
const PLAN = [
  // updated_at n'existait pas : on part de la date de création d'origine.
  {
    source: 'embarcations',
    de: 'modeles',
    vers: ['embarcations', 'modeles'],
    cle: 'id',
    transformer: (l) => ({ ...l, updated_at: l.created_at }),
  },
  {
    source: 'embarcations',
    de: 'embarcations',
    vers: ['embarcations', 'embarcations'],
    cle: 'id',
    transformer: (l) => ({ ...l, updated_at: l.date_creation }),
  },
  { source: 'commande', de: 'recipes', vers: ['commande', 'recettes'], cle: 'id' },
  { source: 'commande', de: 'consumables', vers: ['commande', 'consommables'], cle: 'id' },
  { source: 'commande', de: 'ingredients_bank', vers: ['commande', 'banque_ingredients'], cle: 'id' },
  { source: 'commande', de: 'groups', vers: ['commande', 'groupes_repas'], cle: 'id' },
  { source: 'commande', de: 'plan_cells', vers: ['commande', 'plan_cells'], cle: 'day,meal' },
  { source: 'commande', de: 'saved_menus', vers: ['commande', 'menus_sauves'], cle: 'id' },
  { source: 'commande', de: 'ajouts_cons', vers: ['commande', 'ajouts_consommables'], cle: 'cons_id' },
  // Les id bigserial ne sont référencés nulle part : on vide puis on réinsère.
  { source: 'commande', de: 'ajouts_recipes', vers: ['commande', 'ajouts_recettes'], cle: null },
  { source: 'commande', de: 'sorties', vers: ['commande', 'sorties'], cle: 'id' },
]

const sources = {
  embarcations: lireAncienneConfig('Suivi des embarcations'),
  commande: lireAncienneConfig('Outils de commande'),
}
const destination = essai || sauvegarder ? null : lireDestination()

console.log(sauvegarder ? 'SAUVEGARDE\n' : essai ? 'MODE ESSAI — aucune écriture\n' : 'IMPORT\n')

async function lireEtape(etape) {
  if (!sauvegarder && fs.existsSync(fichierSauvegarde(etape))) {
    return { lignes: JSON.parse(fs.readFileSync(fichierSauvegarde(etape), 'utf8')), origine: 'sauvegarde' }
  }
  const client = sources[etape.source]
  if (!client) throw new Error(`Ni sauvegarde ni config.js pour ${etape.source}.${etape.de}`)
  return { lignes: await toutLire(client, etape.de), origine: 'ancienne base' }
}

for (const etape of PLAN) {
  const { lignes: brutes, origine } = await lireEtape(etape)

  if (sauvegarder) {
    fs.mkdirSync(dossierSauvegarde, { recursive: true })
    fs.writeFileSync(fichierSauvegarde(etape), JSON.stringify(brutes, null, 2))
    console.log(`${etape.source}.${etape.de}`.padEnd(32), `${brutes.length} ligne(s) → sauvegarde/`)
    continue
  }

  const lignes = etape.transformer ? brutes.map(etape.transformer) : brutes
  const [schema, table] = etape.vers
  const libelle = `${etape.source}.${etape.de} → ${schema}.${table}`.padEnd(62)

  if (essai) {
    const colonnes = [...new Set(lignes.flatMap((l) => Object.keys(l)))].join(', ')
    console.log(`${libelle} ${lignes.length} ligne(s) (${origine})${colonnes ? `\n    colonnes : ${colonnes}` : ''}`)
    continue
  }

  const cible = destination.schema(schema).from(table)
  if (etape.cle === null) {
    const { error: e1 } = await cible.delete().gte('id', 0)
    if (e1) throw new Error(`${table} (vidage) : ${e1.message}`)
    const sansId = lignes.map(({ id: _id, ...reste }) => reste)
    if (sansId.length) {
      const { error: e2 } = await destination.schema(schema).from(table).insert(sansId)
      if (e2) throw new Error(`${table} : ${e2.message}`)
    }
  } else if (lignes.length) {
    for (let i = 0; i < lignes.length; i += 500) {
      const { error } = await destination
        .schema(schema)
        .from(table)
        .upsert(lignes.slice(i, i + 500), { onConflict: etape.cle })
      if (error) throw new Error(`${table} : ${error.message}`)
    }
  }

  const { count, error } = await destination.schema(schema).from(table).select('*', { count: 'exact', head: true })
  if (error) throw new Error(`${table} (vérification) : ${error.message}`)
  const ok = count === lignes.length ? '✓' : '⚠ écart'
  console.log(`${libelle} ${lignes.length} lue(s), ${count} dans la nouvelle base ${ok}`)
}

console.log('\nTerminé.')
