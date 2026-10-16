// Copie des documents de l'app vers les Drive partagés (demande de Maxime,
// 2026-10-16). À chaque passage du cron, au plus MAX documents pas encore
// copiés (core.drive_a_copier : modules actifs de core.drive_reglages), chacun
// rangé dans ses dossiers : un dossier connu (core.drive_dossiers), sinon
// celui du même nom sous son parent (sans casse ni accents : les dossiers
// existants des véhicules), sinon un nouveau. Résultat noté par
// core.drive_noter ; une erreur est réessayée de plus en plus tard.
//
// Forfait gratuit de Cloudflare : 50 sous-requêtes par passage, partagées
// avec le reste du cron (environ 5 par document) ; l'attente réseau ne
// compte pas dans les 10 ms de calcul, et le fichier passe de Supabase à
// Google sans être lu par le code (FixedLengthStream).

import { base } from '../subventions/base.js'
import { clientDrive, ErreurDrive, modeDrive, nomCompare } from '../commun/drive.js'

export const MAX = 3

const encoder = (chemin) => chemin.split('/').map(encodeURIComponent).join('/')

function entetesStockage(env) {
  const cle = env.SUPABASE_SECRET_KEY
  return { apikey: cle, ...(cle?.startsWith('eyJ') ? { Authorization: `Bearer ${cle}` } : {}) }
}

/** Contenu à envoyer : un flux de longueur connue (Worker), sinon en mémoire (tests sous Node). */
async function contenu(res, taille) {
  if (taille != null && typeof FixedLengthStream === 'function') {
    const { readable, writable } = new FixedLengthStream(taille)
    res.body.pipeTo(writable).catch(() => {})
    return readable
  }
  return res.arrayBuffer()
}

const filtreCles = (cles) => `cle=in.(${cles.map((c) => `"${c}"`).join(',')})`

/** Un module à tour de rôle : l'arriéré d'un module (import RH) ne bloque pas les autres. */
export function aTourDeRole(lignes, max) {
  const parModule = new Map()
  for (const l of lignes) parModule.set(l.module, [...(parModule.get(l.module) ?? []), l])
  const files = [...parModule.values()]
  const choisies = []
  for (let i = 0; choisies.length < max && files.some((f) => f.length > i); i++) {
    for (const f of files) if (f[i] && choisies.length < max) choisies.push(f[i])
  }
  return choisies
}

/** Copie ce qui attend. Rend { mode, faites, erreurs }. */
export async function copierVersDrive(env, { max = MAX } = {}) {
  const mode = modeDrive(env)
  if (mode === 'non_configure') return { mode, faites: 0, erreurs: 0 }
  const db = base(env, 'core')
  const aCopier = aTourDeRole((await db.rpc('drive_a_copier', { p_limite: max })) ?? [], max)
  if (!aCopier.length) return { mode, faites: 0, erreurs: 0 }

  const cles = [...new Set(aCopier.flatMap((l) => l.dossiers.filter((d) => !d.id).map((d) => d.cle)))]
  const connus = new Map(
    cles.length ? (await db.lire(`drive_dossiers?select=cle,drive_id&${filtreCles(cles)}`)).map((d) => [d.cle, d.drive_id]) : [],
  )
  const drive = await clientDrive(env, mode)
  const listes = new Map() // parent → ses sous-dossiers, lus une fois par passage

  // Dossier où ranger un document : la chaîne part de la racine du module.
  async function dossierDe(chaine) {
    let parent = null
    for (const d of chaine) {
      if (d.id) {
        parent = d.id
        continue
      }
      let id = connus.get(d.cle)
      if (!id) {
        if (!listes.has(parent)) listes.set(parent, await drive.sousDossiers(parent))
        const freres = listes.get(parent)
        const trouve = freres.find((f) => nomCompare(f.name) === nomCompare(d.nom))
        id = trouve?.id ?? (await drive.creerDossier(parent, d.nom))
        if (!trouve) freres.push({ id, name: d.nom })
        connus.set(d.cle, id)
        await db.inserer('drive_dossiers', { cle: d.cle, drive_id: id, nom: trouve?.name ?? d.nom }).catch(() => {})
      }
      parent = id
    }
    return parent
  }

  // Dossier introuvable (supprimé du Drive ?) : oublié, il sera retrouvé ou recréé.
  async function oublier(chaine) {
    const aOublier = chaine.filter((d) => !d.id).map((d) => d.cle)
    aOublier.forEach((c) => connus.delete(c))
    listes.clear()
    if (aOublier.length) await db.supprimer('drive_dossiers', filtreCles(aOublier)).catch(() => {})
  }

  let faites = 0
  let erreurs = 0
  const noter = (l, id, erreur) =>
    db.rpc('drive_noter', { p_module: l.module, p_document: l.document_id, p_drive_id: id, p_erreur: erreur })
  for (const l of aCopier) {
    let id
    try {
      const parent = await dossierDe(l.dossiers)
      const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/authenticated/${l.seau}/${encoder(l.chemin)}`, {
        headers: entetesStockage(env),
      })
      if (!res.ok) throw new Error(`Fichier introuvable dans l’app (${l.seau}, ${res.status})`)
      const type = res.headers.get('content-type') || 'application/octet-stream'
      const taille = Number(res.headers.get('content-length')) || null
      id = await drive.envoyer(parent, l.nom_fichier, type, taille, await contenu(res, taille))
    } catch (e) {
      erreurs++
      if (e instanceof ErreurDrive && e.statut === 404) await oublier(l.dossiers)
      await noter(l, null, String(e?.message ?? e)).catch(() => {})
      continue
    }
    faites++
    // Copié : si la note échoue, le document repartira au prochain passage (une copie de plus, rien de perdu).
    await noter(l, id, null).catch((e) => console.error('Copie Drive, note non gardée :', e))
  }
  return { mode, faites, erreurs }
}
