// Import / export Excel au même format que l'ancien créateur. SheetJS est
// chargé seulement à l'usage (gros module).
import { analyseConges, cle, completer, lireGrilleMaitresse, periodesSpecialiste } from './logique'
import { COLONNES_TRANSPORT, JEUX, META_TAG, SURVEILLANCES, TAGS, type EtatSemaine, type Reglages } from './types'

/** Lit un classeur (feuille « Horaire Animateurs ») : état de la semaine + nom trouvé. */
export async function importerClasseur(fichier: File): Promise<{ etat: EtatSemaine; nom: string | null; nouveauxAnimateurs: string[] }> {
  const XLSX = await import('xlsx')
  const classeur = XLSX.read(new Uint8Array(await fichier.arrayBuffer()), { type: 'array' })
  const feuille =
    classeur.SheetNames.find((n) => n.includes('Horaire Animateurs')) ??
    classeur.SheetNames.find((n) => n.toLowerCase().includes('horaire'))
  if (!feuille) throw new Error('Feuille « Horaire Animateurs » introuvable.')
  const lignes = XLSX.utils.sheet_to_json<(string | number | null)[]>(classeur.Sheets[feuille], { header: 1, raw: true, defval: null })
  const m = lireGrilleMaitresse(lignes)

  let nom: string | null = null
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 10; c++) {
      const v = lignes[r]?.[c]
      if (v && /semaine/i.test(String(v))) nom = String(v).trim()
    }
  nom ??= fichier.name.match(/semaine\s*\d+/i)?.[0] ?? null

  const etat = completer({ groupes: m.groupes, cellules: m.cellules })
  if (m.periodes.length) etat.periodes = m.periodes
  if (m.jours.length) etat.jours = m.jours
  const nouveauxAnimateurs = [...new Set(m.groupes.flatMap((g) => [g.anim, g.remp]).filter(Boolean))]
  return { etat, nom, nouveauxAnimateurs }
}

export async function exporterClasseur(nom: string, e: EtatSemaine, r: Reglages) {
  const XLSX = await import('xlsx')
  const classeur = XLSX.utils.book_new()
  const feuille = (lignes: unknown[][], titre: string) =>
    XLSX.utils.book_append_sheet(classeur, XLSX.utils.aoa_to_sheet(lignes), titre)

  // Grille maîtresse
  const grille: unknown[][] = [[nom], [], ['Jour', 'Période', ...e.groupes.map((g) => `Gr.${g.num} ${g.anim}`)]]
  grille.push(['', 'Congé', ...e.groupes.map((g) => g.conge || '')])
  grille.push(['', 'Remplaçant', ...e.groupes.map((g) => g.remp || '')])
  e.jours.forEach((d) =>
    e.periodes.forEach((p, pi) => grille.push([pi === 0 ? d : '', p, ...e.groupes.map((g) => e.cellules[cle(g.id, d, p)] ?? '')])),
  )
  feuille(grille, 'Horaire Animateurs')

  // Spécialistes
  for (const tag of TAGS) {
    const extra = tag === 'transport' ? [...COLONNES_TRANSPORT] : []
    const lignes: unknown[][] = [['Jour', 'Période', 'Groupe', 'Animateur', 'Activité', ...extra]]
    periodesSpecialiste(e, r, tag).forEach((x) =>
      lignes.push([x.day, x.time, x.group, x.anim, x.act, ...extra.map((c) => e.transport[`${x.day}|${x.time}|${x.group}|${c}`] ?? '')]),
    )
    feuille(lignes, META_TAG[tag].libelle)
  }

  // Congés et remplacements
  const { enConge, tournees } = analyseConges(e)
  const conges: unknown[][] = [['Groupe', 'Animateur', 'Jours de congé', 'Remplaçant']]
  enConge.forEach(({ g, jours }) => conges.push([g.num || '', g.anim, jours.join(', '), g.remp || '']))
  conges.push([], ['Tournée des remplaçants'], ['Remplaçant', ...e.jours])
  Object.keys(tournees)
    .sort()
    .forEach((remp) => {
      const parJour: Record<string, string> = {}
      tournees[remp].forEach((t) => t.days.forEach((d) => (parJour[d] = `Gr.${t.group} (${t.anim})`)))
      conges.push([remp, ...e.jours.map((d) => parJour[d] ?? '')])
    })
  feuille(conges, 'Congés')

  // Soirées
  const soirees: unknown[][] = [['Jeux de soirée'], ['Jeu', ...r.nuits]]
  JEUX.forEach((j) => soirees.push([j.libelle, ...r.nuits.map((n) => (e.jeux[`${j.id}|${n}`] ?? []).join(', '))]))
  soirees.push([], ['Surveillance pré-jeu'], ['Surveillance', ...r.nuits])
  SURVEILLANCES.forEach((s) => soirees.push([s.libelle, ...r.nuits.map((n) => (e.surv[`${s.id}|${n}`] ?? []).join(', '))]))
  soirees.push([], ['Chouettes (surveillance de nuit)'], ['Section', ...r.nuits])
  r.sections.forEach((s) => soirees.push([s, ...r.nuits.map((n) => (e.chouettes[`${s}|${n}`] ?? []).join(', '))]))
  feuille(soirees, 'Soirées')

  XLSX.writeFile(classeur, `Horaire ${nom}.xlsx`)
}
