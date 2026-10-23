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

// ------------------------------------------------------------------
// Ligne qui change de place dans sa propre liste (demande de Maxime du
// 2026-10-23) : cochée, elle descend en bas (Mastertimeline, « À faire pour
// moi ») ou remonte (Réunions › Semaine). Les lignes glissent de leur ancienne
// place à la nouvelle au lieu de sauter, et la liste ignore les clics le temps
// du glissement : la ligne qui arrive sous le curseur ne prend pas un deuxième clic.

const DUREE_DEPLACEMENT = 300

/** Haut de chaque ligne, par rapport au haut de la liste (le défilement de la page ne compte pas). */
function positions(liste: HTMLElement) {
  const haut = liste.getBoundingClientRect().top
  return new Map([...liste.children].map((el) => [el, el.getBoundingClientRect().top - haut]))
}

function glisser(liste: HTMLElement, avant: Map<Element, number>) {
  const reduit = mouvementReduit()
  let bouge = false
  for (const [el, haut] of positions(liste)) {
    const ancien = avant.get(el)
    // Ligne qui entre dans la liste (la 6e d'une liste coupée à 5) : fondu.
    if (ancien === undefined) {
      bouge = true
      if (!reduit) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUREE_DEPLACEMENT, easing: 'ease-out' })
      continue
    }
    const ecart = ancien - haut
    if (Math.abs(ecart) < 1) continue
    bouge = true
    if (!reduit)
      el.animate([{ transform: `translateY(${ecart}px)` }, { transform: 'none' }], { duration: DUREE_DEPLACEMENT, easing: 'cubic-bezier(0.2, 0, 0, 1)' })
  }
  if (bouge) setTimeout(garderListe(liste), (reduit ? 0 : DUREE_DEPLACEMENT) + GARDE)
}

/**
 * Lance l'action (une mutation qui change l'ordre de la liste), puis fait
 * glisser les lignes de `liste` vers leur nouvelle place au premier
 * changement de la liste. Rien ne bouge : rien n'est animé.
 */
export function animerDeplacements(liste: HTMLElement | null | undefined, action: () => unknown) {
  if (!liste) return action()
  const avant = positions(liste)
  const observateur = new MutationObserver(() => {
    observateur.disconnect()
    clearTimeout(abandon)
    glisser(liste, avant)
  })
  observateur.observe(liste, { childList: true })
  const abandon = setTimeout(() => observateur.disconnect(), DELAI_RETOUR)
  return action()
}
