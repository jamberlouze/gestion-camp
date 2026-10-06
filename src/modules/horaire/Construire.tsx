import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { SaisieNom } from '@/lib/SaisieNom'
import { ui } from '@/lib/ui'
import { useSemaine } from './contexte'
import { useAjouterAnimateurs } from './donnees'
import { activitesTag, cartesFusion, cle, conflitsGrille, joursConge, nouveauGroupe, norm, prochainIdGroupe, resumeJours } from './logique'
import { JoursEtPeriodes } from './Structure'
import { CONGES, META_TAG, type CodeConge, type GroupeHoraire, type Tag } from './types'

/** Largeur des colonnes (px) : identique dans l'en-tête et le corps de la grille. */
const LARGEUR = { jour: 96, periode: 112, groupe: 128, ajout: 112 }

/** Cases à remplir d'un coup (↦ jour, ↦ ligne). */
type Remplissage = { jour: string; periodes: string[]; libelle: string }
const ACTIVITE_COMMUNE = 'Parc aquatique / Journée commune'

/** Une case de la grille (coordonnées utiles à la sélection rectangulaire). */
interface InfoCase {
  k: string
  gi: number
  ri: number
  pi: number
  jour: string
  span: number
}

export function Construire() {
  const { etat, reglages, modifier, ecriture } = useSemaine()
  const [structure, setStructure] = useState(false)
  const [remplissage, setRemplissage] = useState<Remplissage | null>(null)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const ancre = useRef<InfoCase | null>(null)
  const glisse = useRef<{ depart: InfoCase; actif: boolean } | null>(null)

  const { marques } = useMemo(() => conflitsGrille(etat, reglages), [etat, reglages])
  const tags = useMemo(
    () => ({ escalade: activitesTag(reglages, 'escalade'), transport: activitesTag(reglages, 'transport'), sauveteur: activitesTag(reglages, 'sauveteur') }),
    [reglages],
  )
  // Mémorisé sur le contenu : chaque modification copie tout l'état, donc
  // l'identité des objets change à chaque frappe.
  const cleFusions = JSON.stringify(etat.fusions)
  const cleStructure = JSON.stringify([etat.jours, etat.periodes, etat.groupes.map((g) => g.id)])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { couverture, etendue } = useMemo(() => cartesFusion(etat), [cleFusions])

  // Toutes les cases affichées (les périodes couvertes par une fusion n'en sont pas).
  const cases = useMemo(() => {
    const liste: InfoCase[] = []
    etat.jours.forEach((jour, di) =>
      etat.periodes.forEach((p, pi) =>
        etat.groupes.forEach((g, gi) => {
          const mc = `${g.id}|${jour}|${pi}`
          const debut = couverture[mc]
          if (debut !== undefined && debut !== pi) return
          liste.push({ k: cle(g.id, jour, p), gi, ri: di * etat.periodes.length + pi, pi, jour, span: etendue[mc] ?? 1 })
        }),
      ),
    )
    return liste
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleStructure, couverture, etendue])
  const parCle = useMemo(() => new Map(cases.map((c) => [c.k, c])), [cases])

  // ---------------- Sélection ----------------
  const selectionnerRectangle = useCallback(
    (a: InfoCase, b: InfoCase) => {
      const [gmin, gmax] = [Math.min(a.gi, b.gi), Math.max(a.gi, b.gi)]
      const [rmin, rmax] = [Math.min(a.ri, b.ri), Math.max(a.ri, b.ri)]
      setSelection(new Set(cases.filter((t) => t.gi >= gmin && t.gi <= gmax && t.ri <= rmax && t.ri + t.span - 1 >= rmin).map((t) => t.k)))
    },
    [cases],
  )

  const surAppui = useCallback(
    (k: string, e: React.MouseEvent) => {
      const info = parCle.get(k)
      if (!info) return
      if (e.shiftKey) {
        e.preventDefault()
        selectionnerRectangle(ancre.current ?? info, info)
        return
      }
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault()
        setSelection((s) => {
          const n = new Set(s)
          if (n.has(k)) n.delete(k)
          else n.add(k)
          return n
        })
        ancre.current = info
        return
      }
      // Clic simple : point d'ancrage ; le champ prend le focus pour taper.
      ancre.current = info
      glisse.current = { depart: info, actif: false }
      setSelection((s) => (s.size ? new Set() : s))
    },
    [parCle, selectionnerRectangle],
  )

  const surSurvol = useCallback(
    (k: string, e: React.MouseEvent) => {
      const g = glisse.current
      if (!g || !(e.buttons & 1)) return
      const info = parCle.get(k)
      if (!info || (info.k === g.depart.k && !g.actif)) return
      if (!g.actif) {
        g.actif = true
        ;(document.activeElement as HTMLElement | null)?.blur()
        document.body.classList.add('select-none')
      }
      selectionnerRectangle(g.depart, info)
    },
    [parCle, selectionnerRectangle],
  )

  useEffect(() => {
    const relache = () => {
      glisse.current = null
      document.body.classList.remove('select-none')
    }
    document.addEventListener('mouseup', relache)
    return () => document.removeEventListener('mouseup', relache)
  }, [])

  const selectionInfos = [...selection].map((k) => parCle.get(k)).filter((x): x is InfoCase => !!x)
  const fusionnable = (() => {
    if (selectionInfos.length < 2) return null
    const { gi, jour } = selectionInfos[0]
    if (!selectionInfos.every((t) => t.gi === gi && t.jour === jour) || selectionInfos.some((t) => t.span > 1)) return null
    const pis = selectionInfos.map((t) => t.pi).sort((a, b) => a - b)
    if (pis.some((p, i) => i > 0 && p !== pis[i - 1] + 1)) return null
    return { gid: etat.groupes[gi].id, jour, debut: pis[0], span: pis.length }
  })()
  const contientFusion = selectionInfos.some((t) => t.span > 1)

  const effacerSelection = useCallback(() => {
    const cles = [...selection]
    modifier((e) => cles.forEach((k) => delete e.cellules[k]))
    setSelection(new Set())
  }, [selection, modifier])

  function fusionner() {
    const f = fusionnable
    if (!f) return
    // On garde la valeur de la 1re période, les autres sont effacées.
    modifier((e) => {
      for (let j = 1; j < f.span; j++) delete e.cellules[cle(f.gid, f.jour, e.periodes[f.debut + j])]
      e.fusions[`${f.gid}|${f.jour}|${f.debut}`] = f.span
    })
    setSelection(new Set())
  }

  function defusionner() {
    const departs = selectionInfos.filter((t) => t.span > 1).map((t) => `${etat.groupes[t.gi].id}|${t.jour}|${t.pi}`)
    modifier((e) => departs.forEach((k) => delete e.fusions[k]))
    setSelection(new Set())
  }

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const dansChamp = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT'
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.size && !dansChamp && ecriture) {
        e.preventDefault()
        effacerSelection()
      } else if (e.key === 'Escape' && selection.size) setSelection(new Set())
    }
    document.addEventListener('keydown', touche)
    return () => document.removeEventListener('keydown', touche)
  }, [selection, effacerSelection, ecriture])

  // ---------------- Actions ----------------
  const defusionnerCase = useCallback((mc: string) => modifier((e) => delete e.fusions[mc]), [modifier])

  const majCase = useCallback(
    (k: string, valeur: string) =>
      modifier((e) => {
        if (valeur.trim()) e.cellules[k] = valeur
        else delete e.cellules[k]
      }),
    [modifier],
  )

  /** Même activité pour tous les groupes ; vide = efface ces cases. */
  function remplir({ jour, periodes }: Remplissage, v: string) {
    setRemplissage(null)
    modifier((e) => {
      // Une période couverte par une fusion prend l'activité du début de la fusion.
      const { couverture } = cartesFusion(e)
      e.groupes.forEach((g) =>
        periodes.forEach((p) => {
          const pi = e.periodes.indexOf(p)
          const debut = couverture[`${g.id}|${jour}|${pi}`]
          if (debut !== undefined && debut !== pi) return
          const k = cle(g.id, jour, p)
          if (v.trim()) e.cellules[k] = v
          else delete e.cellules[k]
        }),
      )
    })
  }

  const colonnes = (
    <colgroup>
      <col style={{ width: LARGEUR.jour }} />
      <col style={{ width: LARGEUR.periode }} />
      {etat.groupes.map((g) => (
        <col key={g.id} style={{ width: LARGEUR.groupe }} />
      ))}
      {ecriture && <col className="w-(--largeur-ajout) print:w-0" />}
    </colgroup>
  )
  // Largeur fixe des tables ; à l'impression, sans la colonne « + Groupe ».
  const largeurImpression = LARGEUR.jour + LARGEUR.periode + etat.groupes.length * LARGEUR.groupe
  const dimensions = {
    '--largeur': `${largeurImpression + (ecriture ? LARGEUR.ajout : 0)}px`,
    '--largeur-impression': `${largeurImpression}px`,
    '--largeur-ajout': `${LARGEUR.ajout}px`,
  } as React.CSSProperties
  const table = 'table-fixed border-separate border-spacing-0 text-sm w-(--largeur) print:w-(--largeur-impression)'

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 print:hidden">
        <p className="flex-1 text-sm text-pierre-500">
          Cliquez une case et tapez ou choisissez l'activité. Glissez (ou Maj+clic) pour sélectionner plusieurs cases, puis les
          effacer ou les fusionner (périodes doubles ou triples). Escalade, transport et sauveteur se colorent seuls.
        </p>
        <span className="text-sm text-pierre-700">
          {resumeJours(etat.jours)} · {etat.periodes.length} période{etat.periodes.length > 1 ? 's' : ''}
        </span>
        {ecriture && (
          <button className={ui.boutonSecondaire} onClick={() => setStructure(true)}>
            Jours et périodes
          </button>
        )}
        <button className={ui.boutonSecondaire} onClick={() => window.print()}>
          Imprimer
        </button>
      </div>
      <Legende />
      {structure && <JoursEtPeriodes fermer={() => setStructure(false)} />}
      {remplissage && (
        <Dialogue titre={`Remplir — ${remplissage.libelle}`} fermer={() => setRemplissage(null)}>
          <p className="mb-3 text-sm text-pierre-600">Même activité pour tous les groupes.</p>
          <SaisieNom
            placeholder="Activité"
            liste="liste-activites"
            libelleOk="Remplir"
            valider={(v) => {
              remplir(remplissage, v)
              return null
            }}
            annuler={() => setRemplissage(null)}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <button className="text-foret-700 hover:underline" onClick={() => remplir(remplissage, ACTIVITE_COMMUNE)}>
              {ACTIVITE_COMMUNE}
            </button>
            <button className={ui.boutonDanger} onClick={() => remplir(remplissage, '')}>
              Vider ces cases
            </button>
          </div>
        </Dialogue>
      )}

      <datalist id="liste-activites">
        {reglages.activites.map((a) => (
          <option key={a.name} value={a.name} />
        ))}
      </datalist>

      {/* La grille s'affiche au complet : c'est la page qui défile. L'en-tête
          des groupes reste visible sous la barre du haut ; il est dans une
          table à part, qui suit le défilement horizontal du corps. */}
      <GrilleDefilante
        entete={
          <table className={table} style={dimensions}>
            {colonnes}
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-pierre-200 bg-pierre-50 px-2 py-2 text-left font-medium text-pierre-500">
                  Jour
                </th>
                <th
                  className="sticky z-10 border-b border-r border-pierre-200 bg-pierre-50 px-2 py-2 text-left font-medium text-pierre-500"
                  style={{ left: LARGEUR.jour }}
                >
                  Période
                </th>
                {etat.groupes.map((g, gi) => (
                  <EnteteGroupe key={g.id} groupe={g} gi={gi} />
                ))}
                {ecriture && (
                  <th className="border-b border-pierre-200 bg-white px-2 py-2 print:hidden">
                    <button
                      className={ui.boutonSecondaire}
                      onClick={() => modifier((e) => e.groupes.push(nouveauGroupe(prochainIdGroupe(e), { num: String(e.groupes.length + 1) })))}
                    >
                      + Groupe
                    </button>
                  </th>
                )}
              </tr>
            </thead>
          </table>
        }
      >
        <table className={table} style={dimensions}>
          {colonnes}
          <thead className="hidden print:table-header-group">
            <tr>
              <th className="border-b border-pierre-300 px-2 py-1 text-left">Jour</th>
              <th className="border-b border-r border-pierre-300 px-2 py-1 text-left">Période</th>
              {etat.groupes.map((g) => (
                <th key={g.id} className="border-b border-r border-pierre-300 px-2 py-1 text-left">
                  Gr. {g.num}
                  <span className="block text-xs font-normal">{g.anim}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {etat.jours.map((jour) =>
              etat.periodes.map((p, pi) => (
                <tr key={`${jour}|${p}`}>
                  {pi === 0 && (
                    <td
                      rowSpan={etat.periodes.length}
                      className="sticky left-0 z-10 border-b-2 border-pierre-200 bg-white px-2 py-1.5 align-top font-semibold"
                    >
                      {jour}
                      {ecriture && (
                        <button
                          className="mt-1 block text-xs font-normal text-foret-700 hover:underline print:hidden"
                          title="Remplir toute la journée (journée commune)"
                          onClick={() => setRemplissage({ jour, periodes: etat.periodes, libelle: `toute la journée ${jour}` })}
                        >
                          ↦ jour
                        </button>
                      )}
                    </td>
                  )}
                  <td
                    className={`sticky z-10 border-r border-pierre-200 bg-white px-2 py-1.5 align-top text-xs text-pierre-700 ${
                      pi === etat.periodes.length - 1 ? 'border-b-2' : 'border-b'
                    } border-b-pierre-200`}
                    style={{ left: LARGEUR.jour }}
                  >
                    {p}
                    {ecriture && (
                      <button
                        className="block text-foret-700 hover:underline print:hidden"
                        title="Même activité pour tous les groupes à cette période"
                        onClick={() => setRemplissage({ jour, periodes: [p], libelle: `${jour} ${p}` })}
                      >
                        ↦ ligne
                      </button>
                    )}
                  </td>
                  {etat.groupes.map((g) => {
                    const mc = `${g.id}|${jour}|${pi}`
                    const debut = couverture[mc]
                    if (debut !== undefined && debut !== pi) return null
                    const span = etendue[mc] ?? 1
                    const k = cle(g.id, jour, p)
                    const valeur = etat.cellules[k] ?? ''
                    const n = norm(valeur)
                    const tag: Tag | undefined = n
                      ? tags.escalade.has(n)
                        ? 'escalade'
                        : tags.transport.has(n)
                          ? 'transport'
                          : tags.sauveteur.has(n)
                            ? 'sauveteur'
                            : undefined
                      : undefined
                    const derniere = pi + span - 1 === etat.periodes.length - 1
                    return (
                      <Case
                        key={g.id}
                        k={k}
                        mc={mc}
                        etiquette={`Activité — Gr. ${g.num || '?'}${g.anim ? ` (${g.anim})` : ''}, ${jour}, ${p}`}
                        valeur={valeur}
                        span={span}
                        tag={tag}
                        marque={marques[k]}
                        selectionnee={selection.has(k)}
                        remplacant={joursConge(g.conge).includes(jour) ? g.remp || '(remplaçant à assigner)' : null}
                        animateur={g.anim}
                        derniere={derniere}
                        ecriture={ecriture}
                        majCase={majCase}
                        surAppui={surAppui}
                        surSurvol={surSurvol}
                        defusionner={defusionnerCase}
                      />
                    )
                  })}
                  {ecriture && <td className="border-b border-pierre-100 print:hidden" />}
                </tr>
              )),
            )}
          </tbody>
        </table>
      </GrilleDefilante>

      {selection.size > 0 && ecriture && (
        <div className="fixed inset-x-0 bottom-4 z-30 mx-auto flex w-fit items-center gap-2 rounded-full lg:left-(--largeur-menu) border border-pierre-200 bg-white px-4 py-2 shadow-lg print:hidden">
          <span className="text-sm">
            <b>{selection.size}</b> case(s) sélectionnée(s)
          </span>
          <button className={ui.boutonDanger} onClick={effacerSelection}>
            Effacer
          </button>
          {fusionnable && (
            <button className={ui.boutonSecondaire} onClick={fusionner}>
              Fusionner
            </button>
          )}
          {contientFusion && (
            <button className={ui.boutonSecondaire} onClick={defusionner}>
              Défusionner
            </button>
          )}
          <button aria-label="Annuler la sélection" className="px-2 text-pierre-500" onClick={() => setSelection(new Set())}>
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Grille qui défile avec la page (pas de hauteur maximale) : l'en-tête
 * colle sous la barre du haut et suit le défilement horizontal du corps ;
 * il porte aussi une barre de défilement horizontale, toujours à portée.
 * Deux tables (même largeur de colonnes), car un élément qui défile
 * horizontalement empêcherait l'en-tête de coller à la page.
 */
function GrilleDefilante({ entete, children }: { entete: React.ReactNode; children: React.ReactNode }) {
  const haut = useRef<HTMLDivElement>(null)
  const corps = useRef<HTMLDivElement>(null)
  // Position donnée par programme à chaque bande : l'événement de défilement
  // qui en résulte (l'écho) est ignoré une fois, sinon les deux bandes se
  // renverraient une position déjà dépassée.
  const attendu = useRef<{ haut: number | null; corps: number | null }>({ haut: null, corps: null })

  const suivre = (source: 'haut' | 'corps') => {
    const [src, cible, autre] = source === 'haut' ? [haut.current, corps.current, 'corps' as const] : [corps.current, haut.current, 'haut' as const]
    if (!src || !cible) return
    const echo = attendu.current[source]
    attendu.current[source] = null
    if (echo !== null && Math.abs(src.scrollLeft - echo) <= 1) return
    if (Math.abs(cible.scrollLeft - src.scrollLeft) <= 1) return
    attendu.current[autre] = src.scrollLeft
    cible.scrollLeft = src.scrollLeft
  }

  // À l'impression, rien n'est défilé.
  useEffect(() => {
    const remettre = () => {
      attendu.current = { haut: null, corps: null }
      if (haut.current) haut.current.scrollLeft = 0
      if (corps.current) corps.current.scrollLeft = 0
    }
    window.addEventListener('beforeprint', remettre)
    return () => window.removeEventListener('beforeprint', remettre)
  }, [])

  useEffect(() => {
    const h = haut.current
    const c = corps.current
    if (!h || !c) return
    // Molette ou pavé tactile sur l'en-tête : défile le corps à l'horizontale.
    const roue = (e: WheelEvent) => {
      const echelle = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? c.clientWidth : 1
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX
      if (!dx || (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(dx))) return
      e.preventDefault()
      c.scrollLeft += dx * echelle
    }
    h.addEventListener('wheel', roue, { passive: false })
    return () => h.removeEventListener('wheel', roue)
  }, [])

  // Empilement : les colonnes collées à gauche (z-10) restent dans leur
  // table ; l'en-tête (z-5) passe sous la barre du haut de l'app (z-10).
  // À l'impression, l'en-tête à l'écran est masqué : la table du corps a
  // son propre en-tête, répété sur chaque page.
  return (
    <div className={`${ui.carte} print:border-0 print:shadow-none`}>
      <div
        ref={haut}
        className="sticky top-(--hauteur-entete) z-5 overflow-x-auto rounded-t-xl bg-white print:hidden"
        onScroll={() => suivre('haut')}
      >
        {entete}
      </div>
      <div ref={corps} className="relative z-0 overflow-x-auto print:overflow-visible" onScroll={() => suivre('corps')}>
        {children}
      </div>
    </div>
  )
}

function Legende() {
  return (
    <div className="mb-3 flex flex-wrap gap-3 text-xs text-pierre-700 print:hidden">
      {(Object.keys(META_TAG) as Tag[]).map((t) => (
        <span key={t} className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border-l-4" style={{ background: META_TAG[t].clair, borderColor: META_TAG[t].couleur }} />
          {META_TAG[t].libelle}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm ring-2 ring-[#d03b3b]" /> Conflit bloquant
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm ring-2 ring-amber-500" /> Au-delà du seuil
      </span>
      <span className="inline-flex items-center gap-1.5">↺ Animé par le remplaçant (congé)</span>
    </div>
  )
}

const Case = memo(function Case({
  k,
  mc,
  etiquette,
  valeur,
  span,
  tag,
  marque,
  selectionnee,
  remplacant,
  animateur,
  derniere,
  ecriture,
  majCase,
  surAppui,
  surSurvol,
  defusionner,
}: {
  k: string
  /** Coordonnée de fusion « gid|jour|indice ». */
  mc: string
  /** Nom accessible du champ (groupe, jour, période) : l'en-tête est dans une autre table. */
  etiquette: string
  valeur: string
  span: number
  tag?: Tag
  marque?: 'conflict' | 'warnsoft'
  selectionnee: boolean
  remplacant: string | null
  animateur: string
  derniere: boolean
  ecriture: boolean
  majCase: (k: string, v: string) => void
  surAppui: (k: string, e: React.MouseEvent) => void
  surSurvol: (k: string, e: React.MouseEvent) => void
  defusionner: (mc: string) => void
}) {
  const meta = tag ? META_TAG[tag] : null
  const anneau = marque === 'conflict' ? 'ring-2 ring-inset ring-[#d03b3b]' : marque === 'warnsoft' ? 'ring-2 ring-inset ring-amber-500' : ''
  return (
    <td
      rowSpan={span > 1 ? span : undefined}
      onMouseDown={(e) => surAppui(k, e)}
      onMouseEnter={(e) => surSurvol(k, e)}
      title={remplacant ? `Congé de ${animateur} — groupe animé par ${remplacant}` : undefined}
      className={`relative border-b border-r border-pierre-100 p-0 ${derniere ? 'border-b-2 border-b-pierre-200' : ''} ${anneau} ${
        selectionnee ? 'bg-sky-100' : ''
      }`}
      style={!selectionnee && meta ? { background: meta.clair } : undefined}
    >
      {/* Barre de couleur à part : l'anneau de conflit utilise déjà box-shadow. */}
      {meta && <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1" style={{ background: meta.couleur }} />}
      {remplacant && <span className="pointer-events-none absolute right-1 top-0.5 text-xs text-foret-700">↺</span>}
      {span > 1 && ecriture && (
        <button
          title={`Défusionner ces ${span} périodes`}
          className="absolute bottom-0.5 right-1 text-xs text-pierre-500 hover:text-pierre-900 print:hidden"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => defusionner(mc)}
        >
          ✂
        </button>
      )}
      <input
        list="liste-activites"
        aria-label={etiquette}
        readOnly={!ecriture}
        className="h-full min-h-9 w-full bg-transparent px-2 py-1.5 text-sm outline-none focus:bg-white/70 focus:ring-2 focus:ring-inset focus:ring-foret-600"
        value={valeur}
        onChange={(e) => majCase(k, e.target.value)}
      />
    </td>
  )
})

// ------------------------------------------------------------------
// En-tête de groupe : numéro, animateur, congé, remplaçant
// ------------------------------------------------------------------

function EnteteGroupe({ groupe: g, gi }: { groupe: GroupeHoraire; gi: number }) {
  const { modifier, ecriture, animateurs } = useSemaine()
  const maj = (champs: Partial<GroupeHoraire>) => modifier((e) => Object.assign(e.groupes[gi], champs))

  const choix = 'fleche-serree w-full rounded border border-pierre-200 bg-white px-1 py-0.5 text-xs'
  return (
    <th className="border-b border-r border-pierre-200 bg-pierre-50 p-1.5 text-left align-top font-normal">
      <div className="flex items-center gap-1">
        <span className="text-xs text-pierre-500">Gr.</span>
        <input
          aria-label="Numéro du groupe"
          readOnly={!ecriture}
          className="w-12 rounded border border-pierre-200 bg-white px-1 py-0.5 text-sm font-semibold"
          value={g.num}
          placeholder="#"
          onChange={(e) => maj({ num: e.target.value })}
        />
        {ecriture && (
          <button
            aria-label={`Retirer le groupe ${g.num}`}
            className="ml-auto rounded px-1 text-red-700 hover:bg-red-50 print:hidden"
            onClick={async () => {
              if (!(await confirmer({ titre: 'Retirer ce groupe et ses activités ?', libelleOk: 'Retirer' }))) return
              modifier((e) => {
                const id = e.groupes[gi].id
                e.groupes.splice(gi, 1)
                for (const k of Object.keys(e.cellules)) if (k.startsWith(`${id}|`)) delete e.cellules[k]
                for (const k of Object.keys(e.fusions)) if (k.startsWith(`${id}|`)) delete e.fusions[k]
              })
            }}
          >
            ✕
          </button>
        )}
      </div>
      <ChoixAnimateur
        aria-label="Animateur"
        className={`${choix} mt-1`}
        valeur={g.anim}
        animateurs={animateurs}
        disabled={!ecriture}
        onChange={(anim) => maj({ anim })}
      />
      <div className="mt-1 flex gap-1 print:hidden">
        <select
          aria-label="Jours de congé de l'animateur"
          title="Jours de congé de l'animateur"
          disabled={!ecriture}
          className={choix}
          value={g.conge}
          onChange={(e) => maj({ conge: e.target.value as CodeConge })}
        >
          <option value="">Congé</option>
          {(Object.keys(CONGES) as (keyof typeof CONGES)[]).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <ChoixAnimateur
          aria-label="Remplaçant pendant le congé"
          title="Remplaçant pendant le congé"
          className={choix}
          valeur={g.remp}
          animateurs={animateurs}
          vide="Rempl."
          disabled={!ecriture}
          titreAjout="Nouveau remplaçant"
          onChange={(remp) => maj({ remp })}
        />
      </div>
    </th>
  )
}

/**
 * Menu des animateurs du référentiel ; une valeur hors liste reste visible.
 * « Ajouter… » demande le nom dans une fenêtre et l'ajoute au référentiel.
 */
export function ChoixAnimateur({
  valeur,
  animateurs,
  onChange,
  vide = '—',
  titreAjout = 'Nouvel animateur',
  ...props
}: {
  valeur: string
  animateurs: string[]
  onChange: (v: string) => void
  vide?: string
  titreAjout?: string
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'>) {
  const [ajout, setAjout] = useState(false)
  const ajouterAnimateurs = useAjouterAnimateurs()
  return (
    <>
      <select {...props} value={valeur} onChange={(e) => (e.target.value === '__nouveau__' ? setAjout(true) : onChange(e.target.value))}>
        <option value="">{vide}</option>
        {valeur && !animateurs.includes(valeur) && <option value={valeur}>{valeur} (hors liste)</option>}
        {animateurs.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
        <option value="__nouveau__">＋ Ajouter…</option>
      </select>
      {ajout &&
        // Hors de la grille : ses cellules collantes passeraient par-dessus la fenêtre.
        createPortal(
          <Dialogue titre={titreAjout} fermer={() => setAjout(false)}>
            <SaisieNom
              placeholder="Nom"
              libelleOk="Ajouter"
              valider={(nom) => {
                // Ajouté au référentiel commun des employés (si on en a le droit).
                if (!animateurs.includes(nom)) ajouterAnimateurs.mutate([nom])
                onChange(nom)
                setAjout(false)
                return null
              }}
              annuler={() => setAjout(false)}
            />
          </Dialogue>,
          document.body,
        )}
    </>
  )
}
