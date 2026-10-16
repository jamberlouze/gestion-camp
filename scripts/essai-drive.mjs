#!/usr/bin/env node
// Essai réel de la copie vers un Drive partagé, avec le client du Worker
// lui-même (worker/commun/drive.js) : jeton d'actualisation → jeton d'accès,
// liste des sous-dossiers, création d'un dossier, envoi « resumable », le
// tout avec supportsAllDrives. Avant la mise en ligne, ou pour vérifier un
// nouveau jeton.
//
// Demande DRIVE_CLIENT_ID, DRIVE_CLIENT_SECRET et DRIVE_REFRESH_TOKEN sans les
// afficher (ou les lit dans l'environnement). Dans le dossier donné, retrouve
// ou crée « Essai copie de l'app (à supprimer) », y crée un sous-dossier
// daté et y dépose un petit PDF, puis affiche son lien. Rien n'est effacé :
// supprimer le dossier d'essai à la main.
//
// Depuis gestion-camp :
//   node scripts/essai-drive.mjs [--client <client_secret_….json>] [id du dossier cible]
// --client : fichier JSON téléchargé de Google (identifiant et secret du client
// lus dedans : seul le jeton d'actualisation reste à coller).
// Dossier par défaut : Opérations › Véhicules du Drive partagé.

import { readFileSync } from 'node:fs'
import readline from 'node:readline'
import { clientDrive, nomCompare } from '../worker/commun/drive.js'

const DOSSIER_PAR_DEFAUT = '1FNxIaZxPcxx3DMnToNvLn7yN4DMcuAoA'
const DOSSIER_ESSAI = 'Essai copie de l’app (à supprimer)'

function demanderCache(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    rl._writeToOutput = (texte) => {
      if (texte.startsWith(question)) rl.output.write(texte)
    }
    rl.question(question, (valeur) => {
      rl.close()
      process.stdout.write('\n')
      resolve(valeur.trim())
    })
  })
}

const valeur = async (nom, aide) => process.env[nom]?.trim() || (await demanderCache(`${nom} (${aide}) : `))

/** Petit PDF d'une page, avec une table xref exacte. */
function petitPdf(texte) {
  const objets = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  const flux = `BT /F1 18 Tf 72 700 Td (${texte}) Tj ET`
  objets[3] = `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`
  let pdf = '%PDF-1.4\n'
  const positions = objets.map((corps, i) => {
    const position = pdf.length
    pdf += `${i + 1} 0 obj\n${corps}\nendobj\n`
    return position
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`
  pdf += positions.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

async function main() {
  const args = process.argv.slice(2)
  const iClient = args.indexOf('--client')
  const fichierClient = iClient >= 0 ? args.splice(iClient, 2)[1] : null
  const dossierCible = args[0] || DOSSIER_PAR_DEFAUT
  const client = fichierClient ? JSON.parse(readFileSync(fichierClient, 'utf8')).web : null
  const env = {
    DRIVE_CLIENT_ID: client?.client_id || (await valeur('DRIVE_CLIENT_ID', 'identifiant du client OAuth')),
    DRIVE_CLIENT_SECRET: client?.client_secret || (await valeur('DRIVE_CLIENT_SECRET', 'secret du client OAuth')),
    DRIVE_REFRESH_TOKEN: await valeur('DRIVE_REFRESH_TOKEN', 'Refresh token de l’OAuth Playground'),
  }

  const drive = await clientDrive(env, 'google')
  console.log('✓ Jeton d’accès obtenu')

  const freres = await drive.sousDossiers(dossierCible)
  console.log(`✓ ${freres.length} sous-dossiers lus dans le dossier cible`)
  const existant = freres.find((f) => nomCompare(f.name) === nomCompare(DOSSIER_ESSAI))
  const essai = existant?.id ?? (await drive.creerDossier(dossierCible, DOSSIER_ESSAI))
  console.log(existant ? '✓ Dossier d’essai retrouvé par son nom' : '✓ Dossier d’essai créé')

  const sous = await drive.creerDossier(essai, `Rubrique ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`)
  console.log('✓ Sous-dossier créé')

  const octets = petitPdf('Essai de copie - Gestion du camp')
  const id = await drive.envoyer(sous, 'Essai.pdf', 'application/pdf', octets.length, octets.buffer)
  console.log(`✓ PDF envoyé dans le Drive partagé : https://drive.google.com/file/d/${id}/view`)
  console.log('\nTout fonctionne. Le dossier « Essai copie de l’app (à supprimer) » peut être supprimé.')
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}`)
  process.exit(1)
})
