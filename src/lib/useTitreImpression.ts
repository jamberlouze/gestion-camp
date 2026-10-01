import { useEffect } from 'react'

/**
 * Titre du document pendant l'impression : c'est le nom que le navigateur
 * propose quand on enregistre en PDF (ex. « Horaire cuisine - Semaine du
 * 28 sept. au 4 oct. 2026 »). Le titre de l'onglet revient après.
 */
export function useTitreImpression(titre: string | null) {
  useEffect(() => {
    if (!titre) return
    let avant: string | null = null
    const debut = () => {
      avant ??= document.title
      // Caractères refusés dans un nom de fichier.
      document.title = titre.replace(/[/\\:*?"<>|]/g, '-')
    }
    const fin = () => {
      if (avant == null) return
      document.title = avant
      avant = null
    }
    window.addEventListener('beforeprint', debut)
    window.addEventListener('afterprint', fin)
    return () => {
      fin()
      window.removeEventListener('beforeprint', debut)
      window.removeEventListener('afterprint', fin)
    }
  }, [titre])
}
