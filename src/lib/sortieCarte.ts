import { useCallback, useRef } from 'react'

// Une carte qui quitte sa liste (accepter, rejeter, approuver, valider…)
// glisse vers le haut et se referme avant que l'action parte (demande de
// Maxime du 2026-10-23). Sans ça, la carte suivante prend sa place au pixel
// près, avec le même bouton sous le curseur : on croit que le clic n'a rien
// fait et on clique encore, sur la mauvaise carte.

/** Durée de la sortie (ms) : la carte s'efface, puis la place se referme. */
const DUREE = 360
/** Clics ignorés dans la liste pendant la sortie et un peu après (double clic). */
const GARDE = 250
/** Carte encore là après l'action (rien de retiré, ou liste relue trop lentement) : on la remet. */
const DELAI_RETOUR = 4000

const enSortie = new WeakSet<Element>()
const listesGardees = new WeakMap<HTMLElement, number>()

const mouvementReduit = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** La place peut se refermer en hauteur : liste en colonne, pas une grille à plusieurs colonnes ni une rangée de tableau. */
function seReferme(carte: HTMLElement) {
  if (carte instanceof HTMLTableRowElement) return false
  const parent = carte.parentElement && getComputedStyle(carte.parentElement)
  if (!parent) return true
  if (parent.display.includes('grid')) return parent.gridTemplateColumns.trim().split(/\s+/).length <= 1
  if (parent.display.includes('flex')) return parent.flexDirection.startsWith('column')
  return true
}

function animer(carte: HTMLElement) {
  if (mouvementReduit()) return carte.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' })
  if (!seReferme(carte)) {
    return carte.animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'translateY(-0.75rem) scale(0.97)' },
      ],
      { duration: 220, easing: 'ease-in', fill: 'forwards' },
    )
  }
  const s = getComputedStyle(carte)
  const plein = {
    height: `${carte.offsetHeight}px`,
    minHeight: '0px',
    paddingTop: s.paddingTop,
    paddingBottom: s.paddingBottom,
    marginTop: s.marginTop,
    marginBottom: s.marginBottom,
    borderTopWidth: s.borderTopWidth,
    borderBottomWidth: s.borderBottomWidth,
  }
  const ferme = { height: '0px', minHeight: '0px', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px', borderTopWidth: '0px', borderBottomWidth: '0px' }
  carte.style.overflow = 'hidden'
  return carte.animate(
    [
      { ...plein, opacity: 1, transform: 'none', easing: 'ease-in' },
      { ...plein, opacity: 0, transform: 'translateY(-0.75rem)', offset: 0.4, easing: 'ease-in-out' },
      { ...ferme, opacity: 0, transform: 'translateY(-0.75rem)' },
    ],
    { duration: DUREE, fill: 'forwards' },
  )
}

/** Ignore les clics dans la liste de la carte pendant un moment. */
function garderListe(liste: HTMLElement | null) {
  if (!liste) return () => {}
  listesGardees.set(liste, (listesGardees.get(liste) ?? 0) + 1)
  liste.style.pointerEvents = 'none'
  return () => {
    const reste = (listesGardees.get(liste) ?? 1) - 1
    listesGardees.set(liste, reste)
    if (reste <= 0) liste.style.pointerEvents = ''
  }
}

/**
 * Fait sortir une carte de sa liste, puis lance l'action (une mutation qui la
 * retire). `carte` : la carte elle-même (son élément racine). Un deuxième
 * appel pendant la sortie est ignoré. Si la carte est encore affichée après
 * l'action (refusée, ou pas retirée de la liste), elle revient.
 */
export async function sortirCarte(carte: HTMLElement | null | undefined, action: () => unknown) {
  if (!carte?.isConnected) return void (await action())
  if (enSortie.has(carte)) return
  enSortie.add(carte)
  const liberer = garderListe(carte.parentElement)
  const anim = animer(carte)
  const remettre = () => {
    if (!carte.isConnected) return
    anim.cancel()
    carte.style.overflow = ''
    enSortie.delete(carte)
  }
  try {
    // Onglet caché (téléphone verrouillé, autre onglet) : l'animation s'arrête, l'action part quand même.
    await Promise.race([anim.finished.catch(() => null), new Promise((fin) => setTimeout(fin, DUREE + 100))])
    await action()
  } catch (e) {
    remettre()
    throw e
  } finally {
    setTimeout(liberer, GARDE)
  }
  setTimeout(remettre, DELAI_RETOUR)
}

/** Carte qui sort de sa liste : `ref` sur son élément racine, `sortir(action)` dans ses boutons. */
export function useSortieCarte<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null)
  const sortir = useCallback((action: () => unknown) => sortirCarte(ref.current, action), [])
  return { ref, sortir }
}
