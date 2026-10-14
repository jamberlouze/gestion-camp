import type { MouseEvent } from 'react'

// Toute la ligne d'une tâche ouvre sa fiche (demande de Maxime du 2026-10-14,
// Travaux et Mastertimeline). Les contrôles de la ligne gardent leur action :
// case à cocher, menu d'assignation, lien, vignette… Au clavier, le titre (un
// bouton) reste le point d'entrée : il est dans l'ordre de tabulation et
// s'ouvre avec Entrée ou Espace.

/** Éléments d'une ligne qui ne l'ouvrent pas. `data-garde-clic` : zone entière à écarter (ex. les menus du tri). */
const CONTROLES = 'a, button, input, select, textarea, label, summary, [role="button"], [role="dialog"], [data-garde-clic]'

/** Gestionnaire `onClick` d'une ligne : ouvre la fiche, sauf sur un contrôle ou en fin de sélection de texte. */
export function clicLigne(ouvrir: () => void) {
  return (e: MouseEvent<HTMLElement>) => {
    const cible = e.target instanceof Element ? e.target : null
    // Clic venu d'ailleurs (fenêtre montée en portail) : rien.
    if (!cible || !e.currentTarget.contains(cible)) return
    const controle = cible.closest(CONTROLES)
    if (controle && e.currentTarget.contains(controle)) return
    // Du texte vient d'être sélectionné dans la ligne (copier un titre) : pas d'ouverture.
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed && selection.anchorNode && e.currentTarget.contains(selection.anchorNode)) return
    ouvrir()
  }
}

/** Apparence d'une ligne cliquable (curseur et survol). */
export const classeLigneCliquable = 'cursor-pointer hover:bg-pierre-50/70'
