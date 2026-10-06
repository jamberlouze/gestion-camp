// « Sur le camp cette semaine », au-dessus de l'horaire du personnel de
// cuisine : les groupes qui logent au camp et les événements, lus dans le
// Calendrier des opérations (lecture seule). L'horaire de cuisine en dépend.
import { Link } from 'react-router'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { dateCourte, ecartJours, heure } from '../calendrier/dates'
import { useEvenements, useSejours } from '../calendrier/donnees'
import { nonConfirme, teinteSejour, useEvenementsPlage, useSejoursPlage } from '../calendrier/outils'
import { TYPES_EVENEMENT, type Sejour } from '../calendrier/types'

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

/**
 * `jours` : les 7 jours de l'horaire (lundi → dimanche). Mêmes colonnes que
 * le tableau de l'horaire (fonction + employé, 7 jours, total) pour que les
 * jours tombent les uns sous les autres.
 */
export function SurLeCamp({ jours }: { jours: string[] }) {
  const debut = jours[0]
  const fin = jours[jours.length - 1]
  const sejours = useSejours()
  const evenements = useEvenements()
  const visibles = useSejoursPlage(sejours.data, debut, fin)
  const evParJour = useEvenementsPlage(evenements.data, debut, fin)
  const erreur = sejours.error ?? evenements.error
  const gabarit = { gridTemplateColumns: '18rem repeat(7, minmax(0, 1fr)) 7rem' }
  const titre = 'border-b border-pierre-200 px-3 py-2 text-xs font-medium uppercase tracking-wide text-pierre-500'

  return (
    <section className={`${ui.carte} mb-4 overflow-x-auto print:hidden`}>
      <div className="min-w-[64rem]">
        <div className="grid bg-pierre-50 text-sm" style={gabarit}>
          <div className="flex items-baseline justify-between gap-2 border-b border-pierre-200 px-3 py-2">
            <h3 className="font-semibold">Sur le camp cette semaine</h3>
            <Link to={`/calendrier?date=${debut}`} className="text-xs text-foret-700 underline">
              Calendrier
            </Link>
          </div>
          {jours.map((j) => (
            <div key={j} className="border-b border-l border-pierre-200 px-2 py-2 text-xs text-pierre-500">
              {dateCourte(j)}
            </div>
          ))}
          <div className="border-b border-l border-pierre-200" />
        </div>

        {erreur ? (
          <p className="px-3 py-2 text-sm text-pierre-500">Calendrier des opérations indisponible : {messageErreur(erreur)}</p>
        ) : !sejours.data || !evenements.data ? (
          <p className="px-3 py-2 text-sm text-pierre-500">Chargement…</p>
        ) : (
          <>
            <div className="grid" style={gabarit}>
              <div className={titre}>Groupes</div>
              <div
                className="grid gap-y-1 border-b border-l border-pierre-200 py-1.5"
                style={{ gridColumn: '2 / 9', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
              >
                {visibles.length === 0 && <p className="col-span-7 px-2 text-sm text-pierre-500">Aucun groupe cette semaine.</p>}
                {enLignes(visibles).map((ligne, i) =>
                  ligne.map((s) => {
                    const a = Math.max(0, ecartJours(debut, s.date_arrivee))
                    const b = Math.min(6, ecartJours(debut, s.date_depart))
                    const arrive = s.date_arrivee >= debut
                    const part = s.date_depart <= fin
                    return (
                      <div
                        key={s.id}
                        style={{ gridColumn: `${a + 1} / ${b + 2}`, gridRow: i + 1 }}
                        className={`mx-1 flex items-center gap-2 truncate rounded-md border px-2 py-1 text-xs ${teinteSejour(s)} ${nonConfirme(s) ? 'border-dashed' : ''}`}
                        title={`${s.nom_groupe}${s.type_sejour ? ` — ${s.type_sejour}` : ''}${s.etat ? ` (${s.etat})` : ''} : du ${dateCourte(s.date_arrivee)}${s.heure_arrivee ? ` ${heure(s.heure_arrivee)}` : ''} au ${dateCourte(s.date_depart)}${s.heure_depart ? ` ${heure(s.heure_depart)}` : ''}${s.avec_repas ? '' : ' — sans repas'}`}
                      >
                        {arrive && s.heure_arrivee && <span className="opacity-75">↘ {heure(s.heure_arrivee)}</span>}
                        <span className="min-w-0 truncate">
                          {!arrive && '‹ '}
                          <span className="font-medium">{s.nom_groupe}</span>
                          {s.nb_participants != null && <span className="opacity-75"> · {s.nb_participants}</span>}
                          {!s.avec_repas && <span className="font-medium"> · sans repas</span>}
                        </span>
                        <span className="ml-auto shrink-0 opacity-75">
                          {part ? (s.heure_depart ? `↗ ${heure(s.heure_depart)}` : '') : '›'}
                        </span>
                      </div>
                    )
                  }),
                )}
              </div>
              <div className="border-b border-l border-pierre-200" />
            </div>

            <div className="grid" style={gabarit}>
              <div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-pierre-500">Événements</div>
              {jours.map((j) => (
                <div key={j} className="space-y-1 border-l border-pierre-200 p-1.5">
                  {(evParJour.get(j) ?? []).map((ev) => (
                    <p key={ev.id} className="truncate rounded bg-pierre-100 px-1.5 py-0.5 text-xs text-pierre-800" title={ev.titre}>
                      {TYPES_EVENEMENT[ev.type].icone} {ev.heure_debut ? `${heure(ev.heure_debut)} ` : ''}
                      {ev.titre}
                    </p>
                  ))}
                </div>
              ))}
              <div className="border-l border-pierre-200" />
            </div>
          </>
        )}
      </div>
    </section>
  )
}
