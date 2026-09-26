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
