/** Côté le plus long d'une photo envoyée (les photos de téléphone font plusieurs Mo). */
const COTE_MAX = 1600

/** Réduit une photo à 1600 px au plus, en JPEG. */
export async function reduireImage(fichier: Blob): Promise<Blob> {
  const image = await createImageBitmap(fichier, { imageOrientation: 'from-image' })
  const echelle = Math.min(1, COTE_MAX / Math.max(image.width, image.height))
  const canevas = document.createElement('canvas')
  canevas.width = Math.round(image.width * echelle)
  canevas.height = Math.round(image.height * echelle)
  canevas.getContext('2d')!.drawImage(image, 0, 0, canevas.width, canevas.height)
  image.close()
  return new Promise((ok, echec) =>
    canevas.toBlob((b) => (b ? ok(b) : echec(new Error("La photo n'a pas pu être lue."))), 'image/jpeg', 0.85),
  )
}

/** Taille maximale d'un PDF joint (même limite que les seaux). */
const TAILLE_MAX_PDF = 20 * 1024 * 1024

export const estPdf = (chemin: string) => chemin.toLowerCase().endsWith('.pdf')

/** Fichier prêt à joindre à une tâche : photo réduite en JPEG, ou PDF tel quel. */
export interface FichierJoint {
  fichier: Blob
  extension: 'jpg' | 'pdf'
  /** Nom d'origine d'un PDF (null pour une photo). */
  nom: string | null
}

/** Prépare une photo ou un PDF choisi par l'utilisateur ; message clair si le fichier ne convient pas. */
export async function preparerFichier(f: File): Promise<FichierJoint> {
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
    if (f.size > TAILLE_MAX_PDF) throw new Error(`« ${f.name} » dépasse 20 Mo.`)
    return { fichier: f, extension: 'pdf', nom: f.name }
  }
  if (f.type && !f.type.startsWith('image/')) throw new Error(`« ${f.name} » n'est ni une photo ni un PDF.`)
  try {
    return { fichier: await reduireImage(f), extension: 'jpg', nom: null }
  } catch {
    throw new Error(`« ${f.name} » n'a pas pu être lue.`)
  }
}

/** Types acceptés par les champs « Ajouter » (photo ou PDF). */
export const ACCEPTE_PHOTOS_PDF = 'image/*,application/pdf'
