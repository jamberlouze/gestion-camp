import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { Chargement, NavDate } from './commun'
import { nonConfirme, teinteSejour, useDateChoisie, useEvenementsPlage, useSejoursPlage } from './outils'
import { ajouterJours, ajouterMois, aujourdhui, depuisIso, ecartJours, grilleMois, jourCourt, semaine, titreMois, titreSemaine, heure } from './dates'
import { useEcriture, useEvenements, usePresenceJour, useSejours } from './donnees'
import { FicheEvenement } from './FicheEvenement'
import { META_SECTEUR, SECTEURS, TYPES_EVENEMENT, type Evenement, type PresenceJour, type Sejour } from './types'

const SANS_SECTION = 'Section à préciser'

/** Calendrier semaine (une colonne par jour, une rangée par section du bâtiment) ou mois. */
export function Vue() {
  const [date, choisir] = useDateChoisie()
  const [params, setParams] = useSearchParams()
  const mois = params.get('vue') === 'mois'
  const jours = useMemo(() => (mois ? grilleMois(date) : semaine(date)), [mois, date])
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

  const changerVue = (v: 'semaine' | 'mois') =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        if (v === 'mois') n.set('vue', 'mois')
        else n.delete('vue')
        return n
      },
      { replace: true },
    )

  const bascule = (
    <div className="flex rounded-lg border border-pierre-300 p-0.5 text-sm">
      {(['semaine', 'mois'] as const).map((v) => (
        <button
          key={v}
          className={`rounded-md px-3 py-1 ${(v === 'mois') === mois ? 'bg-foret-700 text-white' : 'text-pierre-700 hover:bg-pierre-50'}`}
          onClick={() => changerVue(v)}
        >
          {v === 'semaine' ? 'Semaine' : 'Mois'}
        </button>
      ))}
    </div>
  )

  const erreur = sejours.error ?? evenements.error ?? presence.error
  const ouvrir = (evenement: Evenement, occurrence: string) => setFiche({ evenement, occurrence })

  return (
    <div>
      <NavDate
        titre={mois ? titreMois(date) : titreSemaine(date)}
        date={date}
        choisir={choisir}
        precedent={mois ? ajouterMois(date, -1) : ajouterJours(date, -7)}
        suivant={mois ? ajouterMois(date, 1) : ajouterJours(date, 7)}
        droite={bascule}
      />
      {erreur && <p className={`${ui.erreur} mb-4`}>{messageErreur(erreur)}</p>}
      {!sejours.data || !evenements.data ? (
        <Chargement />
      ) : mois ? (
        <GrilleMois jours={jours} date={date} sejours={visibles} evParJour={evParJour} presenceParJour={presenceParJour} ouvrir={ouvrir} />
      ) : (
        <GrilleSemaine jours={jours} sejours={visibles} evParJour={evParJour} presenceParJour={presenceParJour} ouvrir={ouvrir} />
      )}
      <p className="mt-3 text-xs text-pierre-500">
        Bordure pointillée : réservation pas encore confirmée dans Airtable. Cliquez sur un jour pour voir le détail.
      </p>
      {fiche && <FicheEvenement evenement={fiche.evenement} dateDefaut={fiche.occurrence} occurrence={fiche.occurrence} fermer={() => setFiche(null)} />}
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

function LienJour({ jour, children, className = '' }: { jour: string; children: React.ReactNode; className?: string }) {
  return (
    <Link to={`/calendrier?date=${jour}`} className={className}>
      {children}
    </Link>
  )
}

function ComptesPersonnel({ liste }: { liste: PresenceJour[] | undefined }) {
  if (!liste?.length) return <span className="text-xs text-pierre-400">—</span>
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
      {SECTEURS.map((s) => {
        const n = liste.filter((p) => p.secteur === s).length
        return n ? (
          <span key={s} className="flex items-center gap-1" title={META_SECTEUR[s].libelle}>
            <span className={`size-2 rounded-full ${META_SECTEUR[s].pastille}`} aria-hidden />
            {META_SECTEUR[s].libelle.slice(0, 3)}. {n}
          </span>
        ) : null
      })}
    </span>
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

function GrilleSemaine({
  jours,
  sejours,
  evParJour,
  presenceParJour,
  ouvrir,
}: {
  jours: string[]
  sejours: Sejour[]
  evParJour: Map<string, Evenement[]>
  presenceParJour: Map<string, PresenceJour[]>
  ouvrir: (e: Evenement, d: string) => void
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

  const colonnes = 'grid grid-cols-[7rem_repeat(7,minmax(6.5rem,1fr))] sm:grid-cols-[9rem_repeat(7,minmax(6.5rem,1fr))]'
  const cellule = 'border-b border-l border-pierre-200 p-1.5'
  return (
    <div className="overflow-x-auto rounded-xl border border-pierre-200">
      <div className="min-w-[52rem] sm:min-w-[56rem]">
        <div className={`${colonnes} bg-pierre-50 text-sm`}>
          <div className="sticky left-0 z-10 border-b border-pierre-200 bg-pierre-50 p-2" />
          {jours.map((j) => (
            <LienJour key={j} jour={j} className={`${cellule} p-2 font-medium hover:bg-pierre-100 ${j === auj ? 'text-foret-700' : ''}`}>
              <span className="first-letter:uppercase">{jourCourt(j)}</span>
            </LienJour>
          ))}
        </div>

        {sections.length === 0 && (
          <div className={colonnes}>
            <div className="sticky left-0 z-10 border-b border-pierre-200 bg-white p-2 text-xs font-medium uppercase tracking-wide text-pierre-500">Séjours</div>
            <div className="col-span-7 border-b border-l border-pierre-200 p-2 text-sm text-pierre-500">Aucun groupe cette semaine.</div>
          </div>
        )}
        {sections.map(([section, liste]) => (
          <div key={section} className={colonnes}>
            <div className="sticky left-0 z-10 border-b border-pierre-200 bg-white p-2 text-sm font-medium">{section}</div>
            <div className="col-span-7 grid grid-cols-7 gap-y-1 border-b border-l border-pierre-200 py-1.5">
              {enLignes(liste).map((ligne, i) =>
                ligne.map((s) => {
                  const a = Math.max(0, ecartJours(jours[0], s.date_arrivee))
                  const b = Math.min(6, ecartJours(jours[0], s.date_depart))
                  const avant = s.date_arrivee < jours[0]
                  const apres = s.date_depart > jours[6]
                  return (
                    <div
                      key={s.id}
                      style={{ gridColumn: `${a + 1} / ${b + 2}`, gridRow: i + 1 }}
                      className={`mx-1 truncate rounded-md border px-2 py-1 text-xs ${teinteSejour(s)} ${nonConfirme(s) ? 'border-dashed' : ''}`}
                      title={`${s.nom_groupe}${s.type_sejour ? ` — ${s.type_sejour}` : ''}${s.etat ? ` (${s.etat})` : ''}`}
                    >
                      {avant && '‹ '}
                      <span className="font-medium">{s.nom_groupe}</span>
                      {s.nb_participants != null && <span className="opacity-75"> · {s.nb_participants}</span>}
                      {apres && ' ›'}
                    </div>
                  )
                }),
              )}
            </div>
          </div>
        ))}

        <div className={colonnes}>
          <div className="sticky left-0 z-10 border-b border-pierre-200 bg-white p-2 text-xs font-medium uppercase tracking-wide text-pierre-500">Événements</div>
          {jours.map((j) => (
            <div key={j} className={`${cellule} space-y-1`}>
              {(evParJour.get(j) ?? []).map((ev) => (
                <PuceEvenement key={ev.id} ev={ev} jour={j} ouvrir={ouvrir} />
              ))}
            </div>
          ))}
        </div>
        <div className={colonnes}>
          <div className="sticky left-0 z-10 bg-white p-2 text-xs font-medium uppercase tracking-wide text-pierre-500">Personnel</div>
          {jours.map((j) => (
            <LienJour key={j} jour={j} className="border-l border-pierre-200 p-1.5 hover:bg-pierre-50">
              <ComptesPersonnel liste={presenceParJour.get(j)} />
            </LienJour>
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
}: {
  jours: string[]
  date: string
  sejours: Sejour[]
  evParJour: Map<string, Evenement[]>
  presenceParJour: Map<string, PresenceJour[]>
  ouvrir: (e: Evenement, d: string) => void
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
                <span className="text-pierre-500">{presenceParJour.get(j)?.length || ''}</span>
              </LienJour>
              <div className="space-y-0.5">
                {duJour.slice(0, 4).map((s) => (
                  <div key={s.id} className={`truncate rounded border px-1 text-[11px] leading-4 ${teinteSejour(s)} ${nonConfirme(s) ? 'border-dashed' : ''}`} title={s.nom_groupe}>
                    {s.date_arrivee === j ? '→ ' : ''}
                    {s.nom_groupe}
                  </div>
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
