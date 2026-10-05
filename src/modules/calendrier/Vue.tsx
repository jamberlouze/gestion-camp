import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { Chargement, NavDate } from './commun'
import { nonConfirme, teinteSejour, useDateChoisie, useEvenementsPlage, useSejoursPlage } from './outils'
import { IconeChevron } from '@/lib/icones'
import { ajouterJours, ajouterMois, aujourdhui, dateCourte, depuisIso, ecartJours, estIso, grilleMois, heure, jourCourt, joursEntre, lundiDe, semaine, titreMois, titreSemaine } from './dates'
import { useEcriture, useEvenements, usePresenceJour, useSejours } from './donnees'
import { FicheEvenement } from './FicheEvenement'
import { META_SECTEUR, SECTEURS, TYPES_EVENEMENT, type Evenement, type PresenceJour, type Sejour } from './types'

const SANS_SECTION = 'Section à préciser'

type Mode = 'semaine' | 'mois' | 'periode'
/** Période libre : au plus deux mois de colonnes. */
const MAX_JOURS = 62

/**
 * Calendrier : semaine, mois ou période libre (dates exactes, pour couvrir un
 * groupe qui chevauche deux semaines ou deux mois). Une colonne par jour,
 * une rangée par section du bâtiment.
 */
export function Vue() {
  const [date, choisir] = useDateChoisie()
  const [params, setParams] = useSearchParams()
  const mode: Mode = params.get('vue') === 'mois' ? 'mois' : params.get('vue') === 'periode' ? 'periode' : 'semaine'
  // Période libre : ?du=…&au=… (sinon la semaine de la date choisie).
  const du = estIso(params.get('du')) ? params.get('du')! : lundiDe(date)
  const auBrut = estIso(params.get('au')) ? params.get('au')! : ajouterJours(du, 6)
  const au = auBrut < du ? du : ecartJours(du, auBrut) >= MAX_JOURS ? ajouterJours(du, MAX_JOURS - 1) : auBrut
  const jours = useMemo(() => (mode === 'mois' ? grilleMois(date) : mode === 'periode' ? joursEntre(du, au) : semaine(date)), [mode, date, du, au])
  const debut = jours[0]
  const fin = jours[jours.length - 1]

  const sejours = useSejours()
  const evenements = useEvenements()
  const presence = usePresenceJour(debut, fin)
  const visibles = useSejoursPlage(sejours.data, debut, fin)
  const evParJour = useEvenementsPlage(evenements.data, debut, fin)
  const presenceParJour = useMemo(() => {
    const m = new Map<string, PresenceJour[]>()
    for (const p of presence.data ?? []) m.set(p.date, [...(m.get(p.date) ?? []), p])
    return m
  }, [presence.data])
  const [fiche, setFiche] = useState<{ evenement: Evenement; occurrence: string } | null>(null)

  /** Change le mode ; la période libre reprend les jours affichés. */
  const changerMode = (v: Mode, periode?: { du: string; au: string }) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        n.delete('vue')
        n.delete('du')
        n.delete('au')
        if (v !== 'semaine') n.set('vue', v)
        if (v === 'periode') {
          const cible = periode ?? (mode === 'mois' ? { du: premierDuMois(date), au: dernierDuMois(date) } : { du: debut, au: fin })
          n.set('du', cible.du)
          n.set('au', cible.au)
        }
        if (v !== 'periode' && mode === 'periode') n.set('date', du)
        return n
      },
      { replace: true },
    )
  /** Cadre la période sur un séjour (arrivée → départ). */
  const cadrer = (s: Sejour) => changerMode('periode', { du: s.date_arrivee, au: s.date_depart })

  const bascule = (
    <div className="flex rounded-lg border border-pierre-300 p-0.5 text-sm">
      {(['semaine', 'mois', 'periode'] as const).map((v) => (
        <button
          key={v}
          className={`rounded-md px-3 py-1 ${v === mode ? 'bg-foret-700 text-white' : 'text-pierre-700 hover:bg-pierre-50'}`}
          onClick={() => changerMode(v)}
        >
          {v === 'semaine' ? 'Semaine' : v === 'mois' ? 'Mois' : 'Période'}
        </button>
      ))}
    </div>
  )

  const erreur = sejours.error ?? evenements.error ?? presence.error
  const ouvrir = (evenement: Evenement, occurrence: string) => setFiche({ evenement, occurrence })
  const nbJours = jours.length

  return (
    <div>
      {mode === 'periode' ? (
        <NavPeriode du={du} au={au} changer={(d, a) => changerMode('periode', { du: d, au: a })} droite={bascule} />
      ) : (
        <NavDate
          titre={mode === 'mois' ? titreMois(date) : titreSemaine(date)}
          date={date}
          choisir={choisir}
          precedent={mode === 'mois' ? ajouterMois(date, -1) : ajouterJours(date, -7)}
          suivant={mode === 'mois' ? ajouterMois(date, 1) : ajouterJours(date, 7)}
          droite={bascule}
        />
      )}
      {erreur && <p className={`${ui.erreur} mb-4`}>{messageErreur(erreur)}</p>}
      {!sejours.data || !evenements.data ? (
        <Chargement />
      ) : mode === 'mois' ? (
        <GrilleMois jours={jours} date={date} sejours={visibles} evParJour={evParJour} presenceParJour={presenceParJour} ouvrir={ouvrir} cadrer={cadrer} />
      ) : (
        <GrilleJours jours={jours} sejours={visibles} evParJour={evParJour} presenceParJour={presenceParJour} ouvrir={ouvrir} cadrer={cadrer} />
      )}
      <p className="mt-3 text-xs text-pierre-500">
        Cliquez sur un groupe pour afficher exactement ses jours (vue Période). Bordure pointillée : réservation pas encore confirmée dans Airtable.
        {mode === 'periode' && nbJours >= MAX_JOURS && ` Une période compte au plus ${MAX_JOURS} jours.`}
      </p>
      {fiche && <FicheEvenement evenement={fiche.evenement} dateDefaut={fiche.occurrence} occurrence={fiche.occurrence} fermer={() => setFiche(null)} />}
    </div>
  )
}

const premierDuMois = (iso: string) => `${iso.slice(0, 7)}-01`
const dernierDuMois = (iso: string) => ajouterJours(ajouterMois(premierDuMois(iso), 1), -1)

/** En-tête de la période libre : ← → décalent de toute sa longueur ; Du / Au exacts. */
function NavPeriode({ du, au, changer, droite }: { du: string; au: string; changer: (du: string, au: string) => void; droite: React.ReactNode }) {
  const n = ecartJours(du, au) + 1
  const annee = depuisIso(au).getFullYear()
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button className={`${ui.boutonSecondaire} px-2.5`} aria-label="Période précédente" onClick={() => changer(ajouterJours(du, -n), ajouterJours(au, -n))}>
          <IconeChevron className="size-4 rotate-180" />
        </button>
        <button className={`${ui.boutonSecondaire} px-2.5`} aria-label="Période suivante" onClick={() => changer(ajouterJours(du, n), ajouterJours(au, n))}>
          <IconeChevron className="size-4" />
        </button>
      </div>
      <h2 className="order-first w-full min-w-0 text-lg font-semibold sm:order-none sm:w-auto sm:flex-1">
        Du {dateCourte(du)} au {dateCourte(au)} {annee} <span className="text-sm font-normal text-pierre-500">({n} jour{n > 1 ? 's' : ''})</span>
      </h2>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <label className="flex items-center gap-1.5 text-sm text-pierre-600">
          Du
          <input
            type="date"
            className={`${ui.champ} w-auto! py-1.5`}
            value={du}
            onChange={(e) => estIso(e.target.value) && changer(e.target.value, e.target.value > au ? e.target.value : au)}
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-pierre-600">
          Au
          <input
            type="date"
            className={`${ui.champ} w-auto! py-1.5`}
            value={au}
            min={du}
            onChange={(e) => estIso(e.target.value) && changer(e.target.value < du ? e.target.value : du, e.target.value)}
          />
        </label>
        {droite}
      </div>
    </div>
  )
}

/** Répartit les séjours sur des lignes sans chevauchement. */
function enLignes(sejours: Sejour[]): Sejour[][] {
  const lignes: Sejour[][] = []
  for (const s of [...sejours].sort((a, b) => a.date_arrivee.localeCompare(b.date_arrivee) || b.date_depart.localeCompare(a.date_depart))) {
    const ligne = lignes.find((l) => l[l.length - 1].date_depart < s.date_arrivee)
    if (ligne) ligne.push(s)
    else lignes.push([s])
  }
  return lignes
}

/** Lien vers la semaine qui contient ce jour. */
function LienJour({ jour, children, className = '' }: { jour: string; children: React.ReactNode; className?: string }) {
  return (
    <Link to={`/calendrier?date=${jour}`} className={className} title="Voir la semaine">
      {children}
    </Link>
  )
}

/** Qui travaille ce jour-là, par secteur (noms). */
function NomsPersonnel({ liste }: { liste: PresenceJour[] | undefined }) {
  if (!liste?.length) return <span className="text-xs text-pierre-400">—</span>
  return (
    <div className="space-y-1 text-xs leading-4">
      {SECTEURS.map((s) => {
        const noms = liste.filter((p) => p.secteur === s)
        return noms.length ? (
          <div key={s} className="flex gap-1" title={META_SECTEUR[s].libelle}>
            <span className={`mt-1 size-2 shrink-0 rounded-full ${META_SECTEUR[s].pastille}`} aria-hidden />
            <span>
              {noms.map((p, i) => (
                <span key={`${p.personnel_id}|${i}`} title={p.description || undefined}>
                  {i > 0 && ', '}
                  {p.nom}
                </span>
              ))}
            </span>
          </div>
        ) : null
      })}
    </div>
  )
}

function PuceEvenement({ ev, jour, ouvrir }: { ev: Evenement; jour: string; ouvrir: (e: Evenement, d: string) => void }) {
  const ecriture = useEcriture()
  return (
    <button
      className="block w-full truncate rounded bg-pierre-100 px-1.5 py-0.5 text-left text-xs text-pierre-800 hover:bg-pierre-200 disabled:hover:bg-pierre-100"
      title={ev.titre}
      disabled={!ecriture}
      onClick={() => ouvrir(ev, jour)}
    >
      {TYPES_EVENEMENT[ev.type].icone} {ev.heure_debut ? `${heure(ev.heure_debut)} ` : ''}
      {ev.titre}
    </button>
  )
}

function GrilleJours({
  jours,
  sejours,
  evParJour,
  presenceParJour,
  ouvrir,
  cadrer,
}: {
  jours: string[]
  sejours: Sejour[]
  evParJour: Map<string, Evenement[]>
  presenceParJour: Map<string, PresenceJour[]>
  ouvrir: (e: Evenement, d: string) => void
  cadrer: (s: Sejour) => void
}) {
  const auj = aujourdhui()
  const sections = useMemo(() => {
    const m = new Map<string, Sejour[]>()
    for (const s of sejours) {
      const cle = s.section_batiment || s.batiment || SANS_SECTION
      m.set(cle, [...(m.get(cle) ?? []), s])
    }
    return [...m.entries()].sort(([a], [b]) => (a === SANS_SECTION ? 1 : b === SANS_SECTION ? -1 : a.localeCompare(b, 'fr')))
  }, [sejours])

  const n = jours.length
  const dernier = jours[n - 1]
  // Première colonne : sections ; puis une colonne par jour (6,5 rem au moins).
  const gabarit = { gridTemplateColumns: `var(--col-sections) repeat(${n}, minmax(6.5rem, 1fr))` }
  const colonnes = 'grid [--col-sections:7rem] sm:[--col-sections:9rem]'
  const cellule = 'border-b border-l border-pierre-200 p-1.5'
  return (
    <div className="overflow-x-auto rounded-xl border border-pierre-200">
      <div style={{ minWidth: `calc(9rem + ${n} * 6.5rem)` }}>
        <div className={`${colonnes} bg-pierre-50 text-sm`} style={gabarit}>
          <div className="sticky left-0 z-10 border-b border-pierre-200 bg-pierre-50 p-2" />
          {jours.map((j) => (
            <div key={j} className={`${cellule} p-2 font-medium ${j === auj ? 'text-foret-700' : ''}`}>
              <span className="block first-letter:uppercase">{jourCourt(j)}</span>
              {(j === jours[0] || j.endsWith('-01')) && <span className="block text-xs font-normal text-pierre-500">{titreMois(j)}</span>}
            </div>
          ))}
        </div>

        {sections.length === 0 && (
          <div className={colonnes} style={gabarit}>
            <div className="sticky left-0 z-10 border-b border-pierre-200 bg-white p-2 text-xs font-medium uppercase tracking-wide text-pierre-500">Séjours</div>
            <div className="border-b border-l border-pierre-200 p-2 text-sm text-pierre-500" style={{ gridColumn: `2 / ${n + 2}` }}>
              Aucun groupe pendant ces jours.
            </div>
          </div>
        )}
        {sections.map(([section, liste]) => (
          <div key={section} className={colonnes} style={gabarit}>
            <div className="sticky left-0 z-10 border-b border-pierre-200 bg-white p-2 text-sm font-medium">{section}</div>
            <div
              className="grid gap-y-1 border-b border-l border-pierre-200 py-1.5"
              style={{ gridColumn: `2 / ${n + 2}`, gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
            >
              {enLignes(liste).map((ligne, i) =>
                ligne.map((s) => {
                  const a = Math.max(0, ecartJours(jours[0], s.date_arrivee))
                  const b = Math.min(n - 1, ecartJours(jours[0], s.date_depart))
                  const avant = s.date_arrivee < jours[0]
                  const apres = s.date_depart > dernier
                  return (
                    <button
                      key={s.id}
                      style={{ gridColumn: `${a + 1} / ${b + 2}`, gridRow: i + 1 }}
                      className={`mx-1 truncate rounded-md border px-2 py-1 text-left text-xs hover:brightness-95 ${teinteSejour(s)} ${nonConfirme(s) ? 'border-dashed' : ''}`}
                      title={`${s.nom_groupe}${s.type_sejour ? ` — ${s.type_sejour}` : ''}${s.etat ? ` (${s.etat})` : ''} : du ${dateCourte(s.date_arrivee)} au ${dateCourte(s.date_depart)}. Cliquer pour afficher tout le séjour.`}
                      onClick={() => cadrer(s)}
                    >
                      {avant && '‹ '}
                      <span className="font-medium">{s.nom_groupe}</span>
                      {s.nb_participants != null && <span className="opacity-75"> · {s.nb_participants}</span>}
                      {apres && ' ›'}
                    </button>
                  )
                }),
              )}
            </div>
          </div>
        ))}

        <div className={colonnes} style={gabarit}>
          <div className="sticky left-0 z-10 border-b border-pierre-200 bg-white p-2 text-xs font-medium uppercase tracking-wide text-pierre-500">Événements</div>
          {jours.map((j) => (
            <div key={j} className={`${cellule} space-y-1`}>
              {(evParJour.get(j) ?? []).map((ev) => (
                <PuceEvenement key={ev.id} ev={ev} jour={j} ouvrir={ouvrir} />
              ))}
            </div>
          ))}
        </div>
        <div className={colonnes} style={gabarit}>
          <div className="sticky left-0 z-10 bg-white p-2 text-xs font-medium uppercase tracking-wide text-pierre-500">Personnel</div>
          {jours.map((j) => (
            <div key={j} className="border-l border-pierre-200 p-1.5">
              <NomsPersonnel liste={presenceParJour.get(j)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function GrilleMois({
  jours,
  date,
  sejours,
  evParJour,
  presenceParJour,
  ouvrir,
  cadrer,
}: {
  jours: string[]
  date: string
  sejours: Sejour[]
  evParJour: Map<string, Evenement[]>
  presenceParJour: Map<string, PresenceJour[]>
  ouvrir: (e: Evenement, d: string) => void
  cadrer: (s: Sejour) => void
}) {
  const auj = aujourdhui()
  const moisCourant = depuisIso(date).getMonth()
  return (
    <div className="overflow-x-auto rounded-xl border border-pierre-200">
      <div className="grid min-w-[42rem] grid-cols-7">
        {['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map((j) => (
          <div key={j} className="border-b border-pierre-200 bg-pierre-50 p-2 text-center text-xs font-medium uppercase text-pierre-500">
            {j}
          </div>
        ))}
        {jours.map((j, i) => {
          const duJour = sejours.filter((s) => s.date_arrivee <= j && j <= s.date_depart)
          const evs = evParJour.get(j) ?? []
          const hors = depuisIso(j).getMonth() !== moisCourant
          return (
            <div key={j} className={`min-h-28 border-b border-pierre-200 p-1 ${i % 7 ? 'border-l' : ''} ${hors ? 'bg-pierre-50/60' : ''}`}>
              <LienJour jour={j} className="mb-1 flex items-center justify-between rounded px-1 text-xs hover:bg-pierre-100">
                <span className={`font-medium ${j === auj ? 'rounded-full bg-foret-700 px-1.5 text-white' : hors ? 'text-pierre-400' : ''}`}>{depuisIso(j).getDate()}</span>
                <span className="text-pierre-500" title="Personnes au travail">{presenceParJour.get(j)?.length || ''}</span>
              </LienJour>
              <div className="space-y-0.5">
                {duJour.slice(0, 4).map((s) => (
                  <button
                    key={s.id}
                    className={`block w-full truncate rounded border px-1 text-left text-[11px] leading-4 hover:brightness-95 ${teinteSejour(s)} ${nonConfirme(s) ? 'border-dashed' : ''}`}
                    title={`${s.nom_groupe} : du ${dateCourte(s.date_arrivee)} au ${dateCourte(s.date_depart)}. Cliquer pour afficher tout le séjour.`}
                    onClick={() => cadrer(s)}
                  >
                    {s.date_arrivee === j ? '→ ' : ''}
                    {s.nom_groupe}
                  </button>
                ))}
                {duJour.length > 4 && (
                  <LienJour jour={j} className="block px-1 text-[11px] text-pierre-500">
                    + {duJour.length - 4} groupe{duJour.length - 4 > 1 ? 's' : ''}
                  </LienJour>
                )}
                {evs.slice(0, 3).map((ev) => (
                  <PuceEvenement key={ev.id} ev={ev} jour={j} ouvrir={ouvrir} />
                ))}
                {evs.length > 3 && (
                  <LienJour jour={j} className="block px-1 text-[11px] text-pierre-500">
                    + {evs.length - 3} événement{evs.length - 3 > 1 ? 's' : ''}
                  </LienJour>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
