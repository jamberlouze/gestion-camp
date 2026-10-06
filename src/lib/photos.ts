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
