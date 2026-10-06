// Photos prises hors ligne : le fichier attend dans IndexedDB (trop gros pour
// le cache localStorage des requêtes) jusqu'à son envoi par la mutation
// « ajouter-photo », qui le retrouve par l'id de la photo.

const BASE = 'gestion-camp-travaux'
const MAGASIN = 'photos'

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((ok, echec) => {
    const demande = indexedDB.open(BASE, 1)
    demande.onupgradeneeded = () => demande.result.createObjectStore(MAGASIN)
    demande.onsuccess = () => ok(demande.result)
    demande.onerror = () => echec(demande.error)
  })
}

async function operation<T>(mode: IDBTransactionMode, fn: (m: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await ouvrir()
  try {
    return await new Promise<T>((ok, echec) => {
      const t = db.transaction(MAGASIN, mode)
      const demande = fn(t.objectStore(MAGASIN))
      t.oncomplete = () => ok(demande.result)
      t.onerror = () => echec(t.error)
      t.onabort = () => echec(t.error)
    })
  } finally {
    db.close()
  }
}

export const garderPhoto = (id: string, fichier: Blob) => operation('readwrite', (m) => m.put(fichier, id)).then(() => undefined)

export async function lirePhoto(id: string): Promise<Blob | null> {
  try {
    return ((await operation('readonly', (m) => m.get(id))) as Blob | undefined) ?? null
  } catch {
    return null
  }
}

export const oublierPhoto = (id: string) => operation('readwrite', (m) => m.delete(id)).then(() => undefined)

/** À la déconnexion : les envois en attente sont effacés, leurs photos aussi. */
export async function oublierToutesLesPhotos() {
  try {
    await operation('readwrite', (m) => m.clear())
  } catch {
    // IndexedDB indisponible : rien à effacer.
  }
}
