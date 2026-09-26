// Logique du créateur d'horaire — fonctions pures, reprises fidèlement de
// l'ancien « Créateur d'horaire BPA » (même algorithme, mêmes messages).
import {
  ACTIVITES_CAMPING,
  CONGES,
  JOURS_SEMAINE,
  TAGS,
  type Activite,
  type CodeConge,
  type EtatSemaine,
  type GroupeHoraire,
  type Reglages,
  type Tag,
} from './types'

// ------------------------------------------------------------------
// Valeurs par défaut
// ------------------------------------------------------------------

export const ACTIVITES_DEFAUT: Activite[] = [
  { name: 'Baignade', tags: ['sauveteur'] }, { name: 'Kayak', tags: ['sauveteur'] }, { name: 'Canot', tags: ['sauveteur'] },
  { name: 'Paddle', tags: ['sauveteur'] }, { name: 'Pedalo', tags: ['sauveteur'] }, { name: 'Rabaska', tags: ['sauveteur'] },
  { name: 'Aquabounga', tags: [] },
  { name: 'Kayak de rivière', tags: ['transport'] }, { name: 'Canot-camping', tags: ['transport'] },
  { name: 'Rando-camping', tags: ['transport'] }, { name: 'Rando explo', tags: ['transport'] }, { name: 'Rando - Rabaska', tags: ['transport'] },
  { name: 'Escalade', tags: ['escalade', 'transport'] },
  { name: 'Accrobranche / Jeux COOP', tags: [] }, { name: 'Accrobranche', tags: [] },
  { name: "Tir à l'arc", tags: [] }, { name: "Tag à l'arc", tags: [] }, { name: 'Orientation', tags: [] },
  { name: 'Disque golf', tags: [] }, { name: 'Brico-nat', tags: [] }, { name: 'Abris/Survie', tags: [] },
  { name: 'Trou de bouette', tags: [] }, { name: 'Prep spectacle', tags: [] }, { name: 'Prep Camping', tags: [] },
  { name: 'Retour Camping', tags: [] }, { name: 'Jeux coop', tags: [] }, { name: 'Sports collectif', tags: [] },
  { name: 'Cirque', tags: [] }, { name: 'Ultimate', tags: [] }, { name: 'Soccer', tags: [] }, { name: 'Bootcamp', tags: [] },
  { name: 'Parc aquatique / Journée commune', tags: [] }, { name: 'SPECTACLE !', tags: [] }, { name: 'Congé', tags: [] },
]

/** Liste d'animateurs de l'ancien créateur (importée d'Airtable à l'époque). */
export const ANIMATEURS_ORIGINE = ['Babaga', 'BBQ', 'Camembert', 'Cannelle', 'Croquette', 'Elmo', 'Fiji', 'Flash', 'Fraisinette', 'Frisbee', 'Galaxie', 'Gazébo', 'Hibiscus', 'Jujube', 'Ketchup', 'Kiwi', 'Link', 'Luciole', 'Macaroni', 'Maui', 'Maxime', 'Moustache', 'Mouton', 'Ouistiti', 'Parachute', 'Peppa', 'Pesto', 'Pigeon', 'Saphir', 'Scaphandre', 'Spaghetti', 'Sriracha', 'Tapioca', 'Tison', 'Turbo', 'Twig', 'Vogue', 'Zelda', 'Zig Zag', 'Étoile']

export const REGLAGES_DEFAUT: Reglages = {
  activites: ACTIVITES_DEFAUT,
  capacites: { escalade: 1, sauveteur: 4, transport: 2 },
  sections: ['Cèdres haut', 'Cèdres bas', 'Pins bas', 'Pins haut', 'VF Bas', 'VF Haut'],
  nuits: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'],
}

export function nouveauGroupe(id: number, champs: Partial<GroupeHoraire> = {}): GroupeHoraire {
  return { id, num: '', anim: '', age: '', section: '', conge: '', remp: '', ...champs }
}

export function semaineVide(): EtatSemaine {
  return {
    jours: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
    periodes: ['09h00 - 10h15', '10h15 - 11h30', '13h00 - 14h15', '14h15 - 15h30', '15h30 - 16h30'],
    groupes: Array.from({ length: 6 }, (_, i) => nouveauGroupe(i + 1, { num: String(i + 1) })),
    cellules: {},
    fusions: {},
    chouettes: {},
    jeux: {},
    surv: {},
    transport: {},
  }
}

/** Complète un état partiel (champs manquants) avec les valeurs d'une semaine vide. */
export function completer(etat: Partial<EtatSemaine> | undefined): EtatSemaine {
  const vide = semaineVide()
  return { ...vide, ...etat, groupes: etat?.groupes ?? vide.groupes }
}

export const prochainIdGroupe = (e: EtatSemaine) => Math.max(0, ...e.groupes.map((g) => g.id || 0)) + 1

// ------------------------------------------------------------------
// Structure d'un horaire : jours, périodes, nuits avec soirées
// (séjours de 2, 3, 4 jours, semaines de 7 jours) et modèles
// ------------------------------------------------------------------

const indiceSemaine = (jour: string) => JOURS_SEMAINE.indexOf(jour)

/** Jours qui se suivent à partir d'un jour de la semaine (Mardi, 3 → Mardi, Mercredi, Jeudi). */
export function joursConsecutifs(premier: string, nombre: number): string[] {
  const i = Math.max(0, indiceSemaine(premier))
  const n = Math.min(7, Math.max(1, Math.round(nombre) || 1))
  return Array.from({ length: n }, (_, k) => JOURS_SEMAINE[(i + k) % 7])
}

/** Premier jour et nombre de jours, si les jours se suivent ; sinon null. */
export function lireJours(jours: string[]): { premier: string; nombre: number } | null {
  if (!jours.length || jours.length > 7 || indiceSemaine(jours[0]) < 0) return null
  const suite = joursConsecutifs(jours[0], jours.length)
  return suite.every((j, k) => j === jours[k]) ? { premier: jours[0], nombre: jours.length } : null
}

/** « 3 jours · Mardi → Jeudi » */
export function resumeJours(jours: string[]): string {
  const n = `${jours.length} jour${jours.length > 1 ? 's' : ''}`
  if (jours.length < 2) return jours.length ? `${n} · ${jours[0]}` : 'aucun jour'
  return lireJours(jours) ? `${n} · ${jours[0]} → ${jours[jours.length - 1]}` : `${n} · ${jours.join(', ')}`
}

/** Nuits avec soirées d'un horaire : les siennes, sinon celles des réglages communs. */
export const nuitsDe = (e: Pick<EtatSemaine, 'nuits'>, nuitsCommunes: string[]) => e.nuits ?? nuitsCommunes

/** Mêmes nuits, dans n'importe quel ordre. */
export const memesNuits = (a: string[], b: string[]) => a.length === b.length && a.every((n) => b.includes(n))

/** Horaire vide sur ces jours. Soirées : les nuits communes comprises dans le séjour. */
export function horaireVide(jours: string[], nuitsCommunes: string[]): EtatSemaine {
  const e: EtatSemaine = { ...semaineVide(), jours: [...jours] }
  // Une nuit au nom libre (pas un jour de la semaine) est toujours gardée.
  const nuits = nuitsCommunes.filter((n) => !JOURS_SEMAINE.includes(n) || jours.includes(n))
  if (!memesNuits(nuits, nuitsCommunes)) e.nuits = nuits
  return e
}

// Clés : cases et fusions « gid|jour|période » (période = libellé ou indice),
// transport « jour|période|groupe|colonne », soirées « …|nuit ».
function lireCleCase(k: string) {
  const a = k.indexOf('|')
  const b = k.indexOf('|', a + 1)
  if (a < 0 || b < 0) return null
  return { gid: k.slice(0, a), jour: k.slice(a + 1, b), periode: k.slice(b + 1) }
}
function lireCleTransport(k: string) {
  const a = k.indexOf('|')
  const z = k.lastIndexOf('|')
  const milieu = k.slice(a + 1, z)
  const b = milieu.indexOf('|')
  if (a < 0 || z <= a || b < 0) return null
  return { jour: k.slice(0, a), periode: milieu.slice(0, b), reste: `${milieu.slice(b)}${k.slice(z)}` }
}
const nuitDeCle = (k: string) => k.slice(k.lastIndexOf('|') + 1)

export interface PeriodeModifiee {
  /** Indice de la période dans l'horaire actuel (null : nouvelle période). */
  origine: number | null
  libelle: string
}

export interface Structure {
  jours: string[]
  /** Périodes dans leur nouvel ordre. */
  periodes: PeriodeModifiee[]
  /** Nuits avec soirées propres à l'horaire ; null : celles des réglages communs. */
  nuits: string[] | null
}

export function structureDe(e: EtatSemaine): Structure {
  return { jours: [...e.jours], periodes: e.periodes.map((libelle, origine) => ({ origine, libelle })), nuits: e.nuits ? [...e.nuits] : null }
}

/** Problème dans la liste des périodes, sinon null. */
export function erreurPeriodes(libelles: string[]): string | null {
  if (!libelles.length) return 'Il faut au moins une période.'
  if (libelles.some((l) => !l.trim())) return 'Chaque période doit avoir un nom (ex. 09h00 - 10h15).'
  if (libelles.some((l) => l.includes('|'))) return 'Le caractère « | » ne peut pas être utilisé dans une période.'
  const vus = new Set<string>()
  for (const l of libelles.map((x) => x.trim())) {
    if (vus.has(l)) return `La période « ${l} » est en double.`
    vus.add(l)
  }
  return null
}

/**
 * Applique de nouveaux jours, périodes et nuits à un horaire. Le contenu
 * suit son jour (par nom) et sa période (même renommée ou déplacée) ; celui
 * des jours, périodes et nuits retirés est effacé. Une fusion dont il reste
 * des périodes qui se suivent est gardée ; sinon chaque période qui reste
 * garde l'activité.
 */
export function restructurer(e: EtatSemaine, s: Structure, nuitsCommunes: string[]): EtatSemaine {
  const jours = new Set(s.jours)
  const libelles = s.periodes.map((p) => p.libelle.trim())
  // Indice actuel d'une période → nouvel indice.
  const versIndice = new Map<number, number>()
  s.periodes.forEach((p, i) => p.origine != null && versIndice.set(p.origine, i))
  const nouveauLibelle = (ancien: string) => {
    const n = versIndice.get(e.periodes.indexOf(ancien))
    return n === undefined ? null : libelles[n]
  }

  const cellules: Record<string, string> = {}
  for (const [k, v] of Object.entries(e.cellules)) {
    const c = lireCleCase(k)
    const p = c && jours.has(c.jour) ? nouveauLibelle(c.periode) : null
    if (c && p !== null) cellules[cle(c.gid, c.jour, p)] = v
  }

  const fusions: Record<string, number> = {}
  for (const [k, span] of Object.entries(e.fusions)) {
    const c = lireCleCase(k)
    if (!c || !jours.has(c.jour) || !(span > 1)) continue
    const debut = Number(c.periode)
    const restes = Array.from({ length: span }, (_, j) => versIndice.get(debut + j))
      .filter((n): n is number => n !== undefined)
      .sort((a, b) => a - b)
    if (!restes.length) continue
    // Le contenu d'une fusion est celui de sa première période ; les périodes
    // couvertes (masquées) sont vidées pour ne rien faire réapparaître.
    const contenu = e.cellules[cle(c.gid, c.jour, e.periodes[debut])]
    for (const n of restes) delete cellules[cle(c.gid, c.jour, libelles[n])]
    const suivies = restes.length > 1 && restes.every((n, j) => n === restes[0] + j)
    if (suivies) fusions[`${c.gid}|${c.jour}|${restes[0]}`] = restes.length
    if (contenu !== undefined) {
      for (const n of suivies ? [restes[0]] : restes) cellules[cle(c.gid, c.jour, libelles[n])] = contenu
    }
  }

  const transport: Record<string, string> = {}
  for (const [k, v] of Object.entries(e.transport)) {
    const t = lireCleTransport(k)
    const p = t && jours.has(t.jour) ? nouveauLibelle(t.periode) : null
    if (t && p !== null) transport[`${t.jour}|${p}${t.reste}`] = v
  }

  // Seules les soirées des nuits retirées sont effacées (celles de nuits
  // déjà inactives restent, comme avant).
  const apres = nuitsDe({ nuits: s.nuits ?? undefined }, nuitsCommunes)
  const retirees = new Set(nuitsDe(e, nuitsCommunes).filter((n) => !apres.includes(n)))
  const garder = (carte: Record<string, string[]>) =>
    Object.fromEntries(Object.entries(carte).filter(([k]) => !retirees.has(nuitDeCle(k))))

  const sortie: EtatSemaine = {
    ...e,
    jours: [...s.jours],
    periodes: libelles,
    cellules,
    fusions,
    transport,
    chouettes: garder(e.chouettes),
    jeux: garder(e.jeux),
    surv: garder(e.surv),
  }
  if (s.nuits) sortie.nuits = [...s.nuits]
  else delete sortie.nuits
  return sortie
}

/** Ce qu'un changement de structure effacerait (pour demander confirmation). */
export function pertesStructure(e: EtatSemaine, s: Structure, nuitsCommunes: string[]) {
  const garde = new Set(s.periodes.map((p) => p.origine).filter((o): o is number => o != null))
  const { couverture, etendue } = cartesFusion(e)
  /** Période de départ de l'activité affichée à cette période (fusion comprise), ou null si vide. */
  const affichee = (g: GroupeHoraire, jour: string, pi: number) => {
    const debut = couverture[`${g.id}|${jour}|${pi}`] ?? pi
    return norm(e.cellules[cle(g.id, jour, e.periodes[debut])]) ? debut : null
  }
  // Une activité est perdue si aucune des périodes où elle s'affiche ne reste.
  const perdue = (g: GroupeHoraire, jour: string, pi: number) => {
    const debut = affichee(g, jour, pi)
    if (debut === null) return false
    const span = etendue[`${g.id}|${jour}|${debut}`] ?? 1
    return !Array.from({ length: span }, (_, k) => debut + k).some((x) => garde.has(x))
  }
  const jours = e.jours.filter((j) => !s.jours.includes(j) && e.groupes.some((g) => e.periodes.some((_, pi) => affichee(g, j, pi) !== null)))
  const periodes = e.periodes.filter((_, pi) => !garde.has(pi) && e.jours.some((j) => s.jours.includes(j) && e.groupes.some((g) => perdue(g, j, pi))))
  // Infos de transport (heure, lieu, chauffeur…) d'une période retirée, sur
  // un jour gardé, quand l'activité, elle, reste (fusion).
  const transport = e.periodes.filter((p, pi) => {
    if (garde.has(pi) || periodes.includes(p)) return false
    return Object.entries(e.transport).some(([k, v]) => {
      const t = lireCleTransport(k)
      return !!v && !!t && t.periode === p && s.jours.includes(t.jour)
    })
  })
  const apres = nuitsDe({ nuits: s.nuits ?? undefined }, nuitsCommunes)
  const nuits = nuitsDe(e, nuitsCommunes).filter(
    (n) => !apres.includes(n) && [e.jeux, e.surv, e.chouettes].some((c) => Object.entries(c).some(([k, l]) => nuitDeCle(k) === n && l.length)),
  )
  return { jours, periodes, transport, nuits }
}

/**
 * Décale tout un horaire de d jours (modèle posé sur d'autres jours de la
 * semaine) : jours, activités, fusions, transport, soirées et nuits suivent
 * (les nuits communes aussi, si l'horaire n'a pas les siennes). Les codes de
 * congé (paires de jours fixes) ne bougent pas.
 */
export function decalerJours(e: EtatSemaine, d: number, nuitsCommunes: string[]): EtatSemaine {
  const n = ((Math.round(d) % 7) + 7) % 7
  const copie = structuredClone(e)
  if (!n) return copie
  const tourner = (jour: string) => (indiceSemaine(jour) < 0 ? jour : JOURS_SEMAINE[(indiceSemaine(jour) + n) % 7])
  const renommer = <T,>(carte: Record<string, T>, f: (k: string) => string) =>
    Object.fromEntries(Object.entries(carte).map(([k, v]) => [f(k), v]))
  const caseDecalee = (k: string) => {
    const c = lireCleCase(k)
    return c ? `${c.gid}|${tourner(c.jour)}|${c.periode}` : k
  }
  const nuitDecalee = (k: string) => {
    const z = k.lastIndexOf('|')
    return `${k.slice(0, z + 1)}${tourner(k.slice(z + 1))}`
  }
  const transportDecale = (k: string) => {
    const a = k.indexOf('|')
    return a < 0 ? k : `${tourner(k.slice(0, a))}${k.slice(a)}`
  }
  const sortie: EtatSemaine = {
    ...copie,
    jours: copie.jours.map(tourner),
    cellules: renommer(copie.cellules, caseDecalee),
    fusions: renommer(copie.fusions, caseDecalee),
    transport: renommer(copie.transport, transportDecale),
    chouettes: renommer(copie.chouettes, nuitDecalee),
    jeux: renommer(copie.jeux, nuitDecalee),
    surv: renommer(copie.surv, nuitDecalee),
  }
  const nuits = nuitsDe(copie, nuitsCommunes).map(tourner)
  if (memesNuits(nuits, nuitsCommunes)) delete sortie.nuits
  else sortie.nuits = nuits
  return sortie
}

/** Décalage (en jours) pour qu'un horaire commence tel jour de la semaine. */
export function decalagePour(jours: string[], premier: string): number {
  const a = indiceSemaine(jours[0] ?? '')
  const b = indiceSemaine(premier)
  return a < 0 || b < 0 ? 0 : (b - a + 7) % 7
}

// ------------------------------------------------------------------
// Normalisation des noms d'activités (fautes courantes, bruit)
// ------------------------------------------------------------------

const NORM: Record<string, string> = {
  "tag a l'arc": "Tag à l'arc", "tag à l'arc": "Tag à l'arc",
  "tir à l'arc": "Tir à l'arc", "tir a l'arc": "Tir à l'arc",
  'abris/survie': 'Abris/Survie', 'abris / survie': 'Abris/Survie',
  pédalo: 'Pedalo', pedalo: 'Pedalo', 'spectacle !': 'SPECTACLE !',
  'accrobranche / jeux coop': 'Accrobranche / Jeux COOP', 'jeu coop': 'Jeux coop', 'jeux coop': 'Jeux coop',
}
const BRUIT = ['upgrade anim', 'ketchup', 'i would', 'link a switch', 'okidou', 'french camp', 'avec babaga', '13-16 ans', 'qui ']

export function norm(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).replace(/\t/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s) return null
  return NORM[s.toLowerCase()] ?? s
}
export function estBruit(a: string | null): boolean {
  if (!a) return true
  const l = a.toLowerCase()
  return BRUIT.some((m) => l.includes(m))
}

export const cle = (gid: number | string, jour: string, periode: string) => `${gid}|${jour}|${periode}`

// ------------------------------------------------------------------
// Fusions, activités effectives, animateur du jour
// ------------------------------------------------------------------

export interface CartesFusion {
  /** « gid|jour|indice » couvert → indice de la période de départ */
  couverture: Record<string, number>
  /** « gid|jour|indice » de départ → nombre de périodes */
  etendue: Record<string, number>
}

export function cartesFusion(e: EtatSemaine): CartesFusion {
  const couverture: Record<string, number> = {}
  const etendue: Record<string, number> = {}
  for (const [k, span] of Object.entries(e.fusions ?? {})) {
    if (!(span > 1)) continue
    const [gid, jour, pi] = k.split('|')
    etendue[k] = span
    for (let j = 0; j < span; j++) couverture[`${gid}|${jour}|${Number(pi) + j}`] = Number(pi)
  }
  return { couverture, etendue }
}

/** Activité d'une case en tenant compte des fusions (une période couverte hérite du début). */
export function activiteEffective(e: EtatSemaine, gid: number, jour: string, pi: number, couverture: Record<string, number>) {
  const debut = couverture[`${gid}|${jour}|${pi}`]
  return e.cellules[cle(gid, jour, e.periodes[debut ?? pi])]
}

export const joursConge = (code: CodeConge | string): readonly string[] =>
  code && code in CONGES ? CONGES[code as keyof typeof CONGES].jours : []

/** Animateur du groupe ce jour-là : le remplaçant pendant le congé. */
export function animateurDuJour(g: GroupeHoraire, jour: string): string {
  if (g.remp && joursConge(g.conge).includes(jour)) return g.remp
  return g.anim
}

export function activitesTag(r: Reglages, tag: Tag): Set<string> {
  const s = new Set<string>()
  r.activites.filter((a) => a.tags.includes(tag)).forEach((a) => {
    const n = norm(a.name)
    if (n) s.add(n)
  })
  return s
}

// ------------------------------------------------------------------
// Horaire à plat, spécialistes
// ------------------------------------------------------------------

export interface Periode {
  day: string
  time: string
  gi: number
  gid: number
  group: string
  anim: string
  act: string
}

export function horaireAPlat(e: EtatSemaine): Periode[] {
  const indiceJour = Object.fromEntries(e.jours.map((d, i) => [d, i]))
  const { couverture } = cartesFusion(e)
  const sortie: Periode[] = []
  e.groupes.forEach((g, gi) =>
    e.jours.forEach((d) =>
      e.periodes.forEach((p, pi) => {
        const a = norm(activiteEffective(e, g.id, d, pi, couverture))
        if (a && !estBruit(a)) sortie.push({ day: d, time: p, gi, gid: g.id, group: g.num || g.anim, anim: animateurDuJour(g, d), act: a })
      }),
    ),
  )
  return sortie.sort((a, b) => indiceJour[a.day] - indiceJour[b.day] || a.time.localeCompare(b.time))
}

export function periodesSpecialiste(e: EtatSemaine, r: Reglages, tag: Tag): Periode[] {
  const s = activitesTag(r, tag)
  return horaireAPlat(e).filter((x) => s.has(x.act))
}

// ------------------------------------------------------------------
// Conflits de la grille
// ------------------------------------------------------------------

export interface Conflit {
  sev: 'err' | 'soft'
  kind: string
  day: string
  time: string
  msg: string
  groups: string[]
}

export function conflitsGrille(e: EtatSemaine, r: Reglages) {
  const plat = horaireAPlat(e)
  const ens = { escalade: activitesTag(r, 'escalade'), sauveteur: activitesTag(r, 'sauveteur'), transport: activitesTag(r, 'transport') }
  const parPeriode: Record<string, { esc: Periode[]; sau: Periode[]; tra: Periode[] }> = {}
  for (const x of plat) {
    const k = `${x.day}|${x.time}`
    const o = (parPeriode[k] ??= { esc: [], sau: [], tra: [] })
    if (ens.escalade.has(x.act)) o.esc.push(x)
    if (ens.sauveteur.has(x.act)) o.sau.push(x)
    if (ens.transport.has(x.act)) o.tra.push(x)
  }
  const conflits: Conflit[] = []
  const marques: Record<string, 'conflict' | 'warnsoft'> = {}
  const indiceJour = Object.fromEntries(e.jours.map((d, i) => [d, i]))
  const cap = r.capacites
  for (const [k, o] of Object.entries(parPeriode)) {
    const [day, time] = k.split('|')
    if (o.esc.length > cap.escalade) {
      conflits.push({ sev: 'err', kind: 'Escalade', day, time, msg: `${o.esc.length} groupes à l'escalade en même temps (max ${cap.escalade})`, groups: o.esc.map((x) => x.group) })
      o.esc.forEach((x) => (marques[cle(x.gid, day, time)] = 'conflict'))
    }
    const doux = (liste: Periode[]) =>
      liste.forEach((x) => {
        const kk = cle(x.gid, day, time)
        if (marques[kk] !== 'conflict') marques[kk] = 'warnsoft'
      })
    if (o.sau.length > cap.sauveteur) {
      conflits.push({ sev: 'soft', kind: 'Sauveteur', day, time, msg: `${o.sau.length} groupes au plan d'eau (seuil ${cap.sauveteur})`, groups: o.sau.map((x) => x.group) })
      doux(o.sau)
    }
    if (o.tra.length > cap.transport) {
      conflits.push({ sev: 'soft', kind: 'Transport', day, time, msg: `${o.tra.length} sorties hors-site en même temps (seuil ${cap.transport})`, groups: o.tra.map((x) => x.group) })
      doux(o.tra)
    }
  }
  // Cases vides : le groupe a des activités chaque jour (même pendant le
  // congé de l'animateur). Seules les vraies fermetures sont ignorées.
  const vides: { group: string; day: string; period: string }[] = []
  e.groupes.forEach((g) => {
    const off = joursConge(g.conge)
    const congeActif = off.some((d) => e.periodes.some((p) => norm(e.cellules[cle(g.id, d, p)])))
    e.jours.forEach((d) => {
      if (off.includes(d) && !congeActif) return
      e.periodes.forEach((p) => {
        if (!norm(e.cellules[cle(g.id, d, p)])) vides.push({ group: g.num || g.anim, day: d, period: p })
      })
    })
  })
  conflits.sort(
    (a, b) => (a.sev === 'err' ? 0 : 1) - (b.sev === 'err' ? 0 : 1) || indiceJour[a.day] - indiceJour[b.day] || a.time.localeCompare(b.time),
  )
  return { conflits, marques, vides }
}

// ------------------------------------------------------------------
// Congés et remplacements
// ------------------------------------------------------------------

export interface ConflitSimple {
  sev: 'err' | 'warn'
  msg: string
}

export function analyseConges(e: EtatSemaine) {
  const indiceJour = Object.fromEntries(e.jours.map((d, i) => [d, i]))
  const enConge = e.groupes.map((g, gi) => ({ g, gi, jours: [...joursConge(g.conge)] })).filter((x) => x.g.conge)
  const tournees: Record<string, { group: string; anim: string; days: string[] }[]> = {}
  enConge.forEach(({ g, jours }) => {
    if (g.remp) (tournees[g.remp] ??= []).push({ group: g.num || g.anim, anim: g.anim, days: jours })
  })
  const conflits: ConflitSimple[] = []
  enConge.forEach(({ g, jours }) => {
    if (g.remp) return
    const besoin = jours.some((d) => e.periodes.some((p) => norm(e.cellules[cle(g.id, d, p)])))
    if (besoin) {
      conflits.push({ sev: 'warn', msg: `${g.anim} (Gr. ${g.num || '?'}) en congé ${CONGES[g.conge as keyof typeof CONGES]?.libelle ?? g.conge} — aucun remplaçant assigné pour animer le groupe` })
    }
  })
  for (const [remp, liste] of Object.entries(tournees)) {
    const parJour: Record<string, string[]> = {}
    liste.forEach((t) => t.days.forEach((d) => (parJour[d] ??= []).push(t.group)))
    for (const [d, groupes] of Object.entries(parJour)) {
      if (groupes.length > 1) conflits.push({ sev: 'err', msg: `${remp} doit couvrir ${groupes.length} groupes le ${d} (${groupes.join(', ')})` })
    }
  }
  const actifs: Record<string, Set<string>> = {}
  e.jours.forEach((d) => {
    actifs[d] = new Set(e.groupes.filter((g) => g.anim && !joursConge(g.conge).includes(d)).map((g) => g.anim))
  })
  for (const [remp, liste] of Object.entries(tournees)) {
    liste.forEach((t) =>
      t.days.forEach((d) => {
        if (actifs[d]?.has(remp)) conflits.push({ sev: 'err', msg: `${remp} remplace le groupe ${t.group} le ${d}, mais anime aussi son propre groupe ce jour-là` })
      }),
    )
  }
  conflits.sort((a, b) => (a.sev === 'err' ? 0 : 1) - (b.sev === 'err' ? 0 : 1))
  Object.values(tournees).forEach((liste) => liste.forEach((t) => t.days.sort((a, b) => indiceJour[a] - indiceJour[b])))
  return { enConge, tournees, conflits }
}

// ------------------------------------------------------------------
// Soirées : jeux, surveillance pré-jeu, chouettes
// ------------------------------------------------------------------

export type TypeTache = 'jeu' | 'surv' | 'chouette'
export const carteTache = (e: EtatSemaine, t: TypeTache) => (t === 'chouette' ? e.chouettes : t === 'surv' ? e.surv : e.jeux)

function joursCongeAnimateur(e: EtatSemaine, nom: string) {
  const g = e.groupes.find((x) => x.anim === nom)
  return g ? joursConge(g.conge) : []
}

/** Animateurs partis en camping la nuit de ce jour : pas disponibles le soir. */
export function enCamping(e: EtatSemaine, nuit: string): Set<string> {
  const { couverture } = cartesFusion(e)
  const s = new Set<string>()
  e.groupes.forEach((g) => {
    const camp = e.periodes.some((_, pi) => {
      const a = norm(activiteEffective(e, g.id, nuit, pi, couverture))
      return !!a && ACTIVITES_CAMPING.has(a)
    })
    if (camp) {
      const qui = animateurDuJour(g, nuit)
      if (qui) s.add(qui)
    }
  })
  return s
}

export function analyseSoirees(e: EtatSemaine, r: Reglages) {
  const charge: Record<string, Record<TypeTache, number>> = {}
  const compter = (n: string, t: TypeTache) => {
    if (n) (charge[n] ??= { jeu: 0, surv: 0, chouette: 0 })[t]++
  }
  Object.values(e.jeux).forEach((l) => l.forEach((n) => compter(n, 'jeu')))
  Object.values(e.surv).forEach((l) => l.forEach((n) => compter(n, 'surv')))
  Object.values(e.chouettes).forEach((l) => l.forEach((n) => compter(n, 'chouette')))

  const conflits: ConflitSimple[] = []
  const enConflit = new Set<string>()
  const campeurs: Record<string, string[]> = {}
  const ajouter = (sev: 'err' | 'warn', msg: string, qui?: string, nuit?: string) => {
    conflits.push({ sev, msg })
    if (sev === 'err' && qui && nuit) enConflit.add(`${qui}|${nuit}`)
  }
  for (const nuit of r.nuits) {
    const fr = e.jeux[`FR|${nuit}`] ?? [], en = e.jeux[`EN|${nuit}`] ?? []
    fr.forEach((n) => en.includes(n) && ajouter('err', `${n} est dans les deux jeux (FR et EN) le ${nuit} — simultanés`, n, nuit))
    const sfr = e.surv[`survFR|${nuit}`] ?? [], sen = e.surv[`survEN|${nuit}`] ?? []
    sfr.forEach((n) => sen.includes(n) && ajouter('err', `${n} est dans les deux surveillances (FR et EN) le ${nuit} — simultanées`, n, nuit))
    const nbChouettes: Record<string, number> = {}
    r.sections.forEach((s) => (e.chouettes[`${s}|${nuit}`] ?? []).forEach((n) => (nbChouettes[n] = (nbChouettes[n] ?? 0) + 1)))
    Object.entries(nbChouettes).forEach(([n, c]) => c > 1 && ajouter('err', `${n} fait ${c} chouettes le ${nuit} — impossible`, n, nuit))
    const assignes = new Set([...fr, ...en, ...sfr, ...sen])
    r.sections.forEach((s) => (e.chouettes[`${s}|${nuit}`] ?? []).forEach((n) => assignes.add(n)))
    assignes.forEach((n) => {
      if (joursCongeAnimateur(e, n).includes(nuit)) ajouter('err', `${n} a une tâche de soirée le ${nuit} mais est en congé ce jour-là`, n, nuit)
    })
    const camping = enCamping(e, nuit)
    campeurs[nuit] = [...camping]
    assignes.forEach((n) => camping.has(n) && ajouter('err', `${n} est en camping le ${nuit} — pas disponible pour une tâche de soirée`, n, nuit))
    const active = fr.length || en.length || sfr.length || sen.length || r.sections.some((s) => (e.chouettes[`${s}|${nuit}`] ?? []).length)
    if (active) r.sections.forEach((s) => !(e.chouettes[`${s}|${nuit}`] ?? []).length && ajouter('warn', `${s} sans chouette le ${nuit}`))
  }
  conflits.sort((a, b) => (a.sev === 'err' ? 0 : 1) - (b.sev === 'err' ? 0 : 1))
  return { charge, conflits, enConflit, campeurs }
}

/**
 * Répartition équilibrée des chouettes dans les cases vides : respecte
 * congés, camping et tâches déjà prises ce soir-là. Renvoie les nouvelles
 * chouettes (les cases remplies sont conservées).
 */
export function repartirChouettes(e: EtatSemaine, r: Reglages): Record<string, string[]> {
  const bassin = [...new Set(e.groupes.flatMap((g) => [g.anim, g.remp]).filter(Boolean))]
  const { charge } = analyseSoirees(e, r)
  const poids: Record<string, number> = {}
  bassin.forEach((n) => {
    const t = charge[n] ?? { jeu: 0, surv: 0, chouette: 0 }
    poids[n] = t.jeu + t.surv + t.chouette
  })
  const chouettes = { ...e.chouettes }
  for (const nuit of r.nuits) {
    const camping = enCamping(e, nuit)
    const occupes = new Set<string>()
    for (const carte of [e.jeux, e.surv, chouettes]) {
      Object.entries(carte).forEach(([k, l]) => k.endsWith(`|${nuit}`) && l.forEach((n) => occupes.add(n)))
    }
    for (const section of r.sections) {
      const k = `${section}|${nuit}`
      if ((chouettes[k] ?? []).length) continue
      const candidats = bassin.filter((n) => !joursCongeAnimateur(e, n).includes(nuit) && !camping.has(n) && !occupes.has(n))
      if (!candidats.length) continue
      candidats.sort((a, b) => poids[a] - poids[b] || a.localeCompare(b))
      const choix = candidats[0]
      chouettes[k] = [choix]
      occupes.add(choix)
      poids[choix]++
    }
  }
  return chouettes
}

// ------------------------------------------------------------------
// Import de l'ancien classeur Excel (feuille « Horaire Animateurs »)
// ------------------------------------------------------------------

type Cellule = string | number | boolean | null | undefined

function nombrePropre(v: Cellule): string {
  if (v == null) return ''
  if (typeof v === 'number') return String(Math.round(v))
  const s = String(v).trim()
  const m = s.match(/^(\d+)\.0$/)
  return m ? m[1] : s
}
const estHeure = (v: Cellule) => v != null && /^\s*\d{1,2}\s*h/.test(String(v))

/** Lit la grille maîtresse d'un classeur (tableau de lignes). */
export function lireGrilleMaitresse(lignes: Cellule[][]) {
  const val = (r: number, c: number) => lignes[r]?.[c] ?? null
  const trouver = (libelle: string) => {
    for (let r = 0; r < 15; r++)
      for (let c = 0; c < 4; c++) {
        const v = val(r, c)
        if (v && String(v).trim().toLowerCase() === libelle.toLowerCase()) return { r, c }
      }
    return null
  }
  const nom = trouver('Nom anim')
  if (!nom) throw new Error('Ligne « Nom anim » introuvable.')
  const grp = trouver('Num groupe'), conge = trouver('Congé'), remp = trouver('Nom remplacant'), age = trouver('Âge')
  const colonnes: number[] = []
  for (let c = 2; c < 29; c++) {
    const v = val(nom.r, c)
    if (v && String(v).trim() && String(v).trim().toLowerCase() !== 'nom anim') colonnes.push(c)
  }
  const texte = (pos: { r: number } | null, c: number) => (pos && val(pos.r, c) ? String(val(pos.r, c)).trim() : '')
  const groupes = colonnes.map((c, i) =>
    nouveauGroupe(i + 1, {
      anim: texte(nom, c),
      num: grp ? nombrePropre(val(grp.r, c)) : '',
      conge: (texte(conge, c) as CodeConge) || '',
      remp: texte(remp, c),
      age: texte(age, c),
    }),
  )
  const lignesJour: { r: number; day: string }[] = []
  for (let r = 0; r < 60; r++) {
    for (const c of [0, 1]) {
      const v = val(r, c)
      if (v && JOURS_SEMAINE.includes(String(v).trim())) {
        lignesJour.push({ r, day: String(v).trim() })
        break
      }
    }
  }
  let colHeure = 1
  if (lignesJour.length) {
    const dr = lignesJour[0].r
    for (const c of [1, 2]) {
      let trouve = false
      for (let k = 0; k < 6; k++) if (estHeure(val(dr + k, c))) trouve = true
      if (trouve) {
        colHeure = c
        break
      }
    }
  }
  const periodes: string[] = []
  const cellules: Record<string, string> = {}
  lignesJour.forEach((d, i) => {
    const fin = i + 1 < lignesJour.length ? lignesJour[i + 1].r : d.r + 7
    for (let r = d.r; r < fin; r++) {
      const t = val(r, colHeure)
      if (!estHeure(t)) continue
      const periode = String(t).replace(/\s+/g, ' ').trim()
      if (!periodes.includes(periode)) periodes.push(periode)
      groupes.forEach((g, gi) => {
        const a = norm(val(r, colonnes[gi]))
        if (a && !estBruit(a)) cellules[cle(g.id, d.day, periode)] = a
      })
    }
  })
  return { groupes, cellules, periodes, jours: lignesJour.map((d) => d.day) }
}

export { TAGS }
