#!/usr/bin/env node
// Envoie les pièces jointes d'Airtable (manifeste produit par rh-airtable.mjs
// --fichiers) dans les seaux privés du module RH : rh-documents (CV,
// contrats, cartes…) et rh-paie (spécimens de chèque).
//
//   node scripts/migration/rh-fichiers.mjs --fichiers <dossier> [--prod]
//
// Base visée : la base LOCALE par défaut (SUPABASE_URL et SUPABASE_SECRET_KEY
// de .dev.vars). --prod exige SUPABASE_URL_PROD et SUPABASE_SECRET_KEY_PROD
// dans l'environnement (jamais écrits dans un fichier du dépôt).
//
// Les adresses d'Airtable expirent après quelques heures : lancer ce script
// juste après rh-airtable.mjs. Un fichier déjà envoyé est sauté (relançable).

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ici = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const dossier = args.includes('--fichiers') ? args[args.indexOf('--fichiers') + 1] : null
const prod = args.includes('--prod')
if (!dossier) {
  console.error('Usage : --fichiers <dossier> [--prod]')
  process.exit(1)
}

function devVars() {
  const f = join(ici, '..', '..', '.dev.vars')
  if (!existsSync(f)) return {}
  return Object.fromEntries(
    readFileSync(f, 'utf8')
      .split('\n')
      .map((l) => /^([A-Z_]+)=(.*)$/.exec(l.trim()))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  )
}

const env = prod ? { url: process.env.SUPABASE_URL_PROD, cle: process.env.SUPABASE_SECRET_KEY_PROD } : { url: devVars().SUPABASE_URL, cle: devVars().SUPABASE_SECRET_KEY }
if (!env.url || !env.cle) {
  console.error(prod ? 'SUPABASE_URL_PROD et SUPABASE_SECRET_KEY_PROD manquent.' : 'SUPABASE_URL et SUPABASE_SECRET_KEY manquent dans .dev.vars.')
  process.exit(1)
}
if (!prod && !/127\.0\.0\.1|localhost/.test(env.url)) {
  console.error(`Sans --prod, la base doit être locale (${env.url}).`)
  process.exit(1)
}

const manifeste = JSON.parse(readFileSync(join(dossier, 'manifeste.json'), 'utf8'))
let envoyes = 0
let sautes = 0
let erreurs = 0
for (const m of manifeste) {
  const existe = await fetch(`${env.url}/storage/v1/object/info/${m.seau}/${m.chemin}`, { headers: { Authorization: `Bearer ${env.cle}`, apikey: env.cle } })
  if (existe.ok) {
    sautes++
    continue
  }
  const res = await fetch(m.url)
  if (!res.ok) {
    console.error(`Téléchargement refusé (${res.status}) : ${m.nom}`)
    erreurs++
    continue
  }
  const corps = Buffer.from(await res.arrayBuffer())
  const envoi = await fetch(`${env.url}/storage/v1/object/${m.seau}/${m.chemin}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.cle}`, apikey: env.cle, 'Content-Type': m.type || 'application/octet-stream', 'x-upsert': 'false' },
    body: corps,
  })
  if (!envoi.ok) {
    console.error(`Envoi refusé (${envoi.status}) : ${m.nom} — ${await envoi.text()}`)
    erreurs++
    continue
  }
  envoyes++
}
console.error(`${envoyes} envoyé(s), ${sautes} déjà là, ${erreurs} erreur(s).`)
