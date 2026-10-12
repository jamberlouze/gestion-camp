// Fichiers déposés par les pages publiques du module RH : écrits avec la
// clé secrète dans les seaux privés (rh-documents, rh-paie). Jamais
// d'adresse publique ; l'app les lit par adresses signées.

export const SEAU_DOCUMENTS = 'rh-documents'
export const SEAU_PAIE = 'rh-paie'

const entetes = (env, extra = {}) => {
  const cle = env.SUPABASE_SECRET_KEY
  return { apikey: cle, ...(cle?.startsWith('eyJ') ? { Authorization: `Bearer ${cle}` } : {}), ...extra }
}

const encoder = (chemin) => chemin.split('/').map(encodeURIComponent).join('/')

/** Dépose un fichier (jamais par-dessus un autre). */
export async function deposer(env, seau, chemin, fichier, type) {
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${seau}/${encoder(chemin)}`, {
    method: 'POST',
    headers: entetes(env, { 'Content-Type': type, 'x-upsert': 'false' }),
    body: await fichier.arrayBuffer(),
  })
  if (!res.ok) throw new Error(`Fichier non déposé (${res.status}) : ${(await res.text()).slice(0, 300)}`)
}

/** Retire des fichiers d'un seau (sans erreur s'ils n'y sont plus). */
export async function retirer(env, seau, chemins) {
  if (!chemins.length) return
  await fetch(`${env.SUPABASE_URL}/storage/v1/object/${seau}`, {
    method: 'DELETE',
    headers: entetes(env, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: chemins }),
  })
}
