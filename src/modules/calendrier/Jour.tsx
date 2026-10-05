import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { IconeAttention, IconePlus } from '@/lib/icones'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { Chargement, NavDate, PastilleSecteur, Section } from './commun'
import { nonConfirme, sejourDuJour, useDateChoisie, useEvenementsPlage, useSejoursPlage } from './outils'
import { ajouterJours, dateLongue, heure, plageHeures } from './dates'
import { useAffectations, useEcriture, useEvenements, usePresenceJour, useSejours } from './donnees'
import { FicheEvenement } from './FicheEvenement'
import { decrireRegle } from './recurrence'
import { META_SECTEUR, SECTEURS, TYPES_EVENEMENT, type Evenement, type Sejour } from './types'

/** Vue centrale : séjours en cours, événements du jour, qui travaille et fait quoi. */
export function Jour() {
  const [date, choisir] = useDateChoisie()
  const ecriture = useEcriture()
  const sejours = useSejours()
  const evenements = useEvenements()
  const presence = usePresenceJour(date, date)
  const affectations = useAffectations(date, date)
  const [fiche, setFiche] = useState<{ evenement?: Evenement } | null>(null)

  const duJour = useSejoursPlage(sejours.data, date, date)
  const evDuJour = useEvenementsPlage(evenements.data, date, date).get(date) ?? []

  // Séjours groupés par section du bâtiment (les sans section à la fin).
  const parSection = useMemo(() => {
    const groupes = new Map<string, Sejour[]>()
    for (const s of duJour) {
      const cle = s.section_batiment || s.batiment || 'Section à préciser'
      groupes.set(cle, [...(groupes.get(cle) ?? []), s])
    }
    return [...groupes.entries()].sort(([a], [b]) => (a === 'Section à préciser' ? 1 : b === 'Section à préciser' ? -1 : a.localeCompare(b, 'fr')))
  }, [duJour])

  const animesParSejour = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const a of affectations.data ?? []) if (a.sejour_id) m.set(a.sejour_id, (m.get(a.sejour_id) ?? new Set()).add(a.personnel_id))
    return m
  }, [affectations.data])

  const erreur = sejours.error ?? evenements.error ?? presence.error
  return (
    <div>
      <NavDate titre={dateLongue(date)} date={date} choisir={choisir} precedent={ajouterJours(date, -1)} suivant={ajouterJours(date, 1)} />
      {erreur && <p className={`${ui.erreur} mb-4`}>{messageErreur(erreur)}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Section titre="Séjours" compte={duJour.length}>
            {!sejours.data ? (
              <Chargement />
            ) : !duJour.length ? (
              <p className="text-sm text-pierre-500">Aucun groupe ce jour-là.</p>
            ) : (
              <div className="space-y-3">
                {parSection.map(([section, liste]) => (
                  <div key={section}>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-pierre-500">{section}</p>
                    <ul className="space-y-2">
                      {liste.map((s) => (
                        <CarteSejour key={s.id} sejour={s} date={date} animes={animesParSejour.get(s.id)?.size ?? 0} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section
            titre="Événements"
            compte={evDuJour.length}
            droite={
              ecriture && (
                <button className={`${ui.boutonSecondaire} px-2.5 py-1.5`} onClick={() => setFiche({})}>
                  <IconePlus /> Ajouter
                </button>
              )
            }
          >
            {!evenements.data ? (
              <Chargement />
            ) : !evDuJour.length ? (
              <p className="text-sm text-pierre-500">Aucun événement.</p>
            ) : (
              <ul className="divide-y divide-pierre-100">
                {evDuJour.map((ev) => (
                  <li key={ev.id}>
                    <button
                      className="flex w-full items-start gap-3 py-2 text-left disabled:cursor-default"
                      disabled={!ecriture}
                      onClick={() => setFiche({ evenement: ev })}
                    >
                      <span className="text-lg leading-6" aria-hidden>
                        {TYPES_EVENEMENT[ev.type].icone}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{ev.titre}</span>
                        <span className="block text-sm text-pierre-500">
                          {[plageHeures(ev.heure_debut, ev.heure_fin), ev.lieu, ev.regle_recurrence && decrireRegle(ev.regle_recurrence, ev.date_debut)]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        {ev.notes && <span className="mt-0.5 block whitespace-pre-line text-sm text-pierre-700">{ev.notes}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <Section
          titre="Qui travaille"
          compte={presence.data?.length}
          droite={
            <Link to={`/calendrier/presences?date=${date}`} className="text-sm text-foret-700 underline">
              Présences
            </Link>
          }
        >
          {!presence.data ? (
            <Chargement />
          ) : !presence.data.length ? (
            <p className="text-sm text-pierre-500">Personne d'inscrit ce jour-là.</p>
          ) : (
            <div className="space-y-4">
              {SECTEURS.map((secteur) => {
                const liste = presence.data.filter((p) => p.secteur === secteur)
                if (!liste.length) return null
                return (
                  <div key={secteur}>
                    <p className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-pierre-500">
                      <PastilleSecteur secteur={secteur} />
                      {META_SECTEUR[secteur].libelle}
                      <span className="font-normal normal-case tracking-normal">{liste.length}</span>
                    </p>
                    <ul className="divide-y divide-pierre-100">
                      {liste.map((p) => (
                        <li key={`${p.secteur}|${p.personnel_id}`} className="flex flex-wrap items-baseline gap-x-3 py-1.5 text-sm">
                          <span className="font-medium">{p.nom}</span>
                          {p.description && <span className="text-pierre-600">{p.description}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </Section>
      </div>

      {fiche && <FicheEvenement evenement={fiche.evenement} dateDefaut={date} occurrence={fiche.evenement ? date : undefined} fermer={() => setFiche(null)} />}
    </div>
  )
}

function CarteSejour({ sejour: s, date, animes }: { sejour: Sejour; date: string; animes: number }) {
  const arrive = s.date_arrivee === date
  const part = s.date_depart === date
  const manque = s.avec_animation && sejourDuJour(s, date) && (s.nb_animateurs ?? 1) > animes
  return (
    <li className={`rounded-lg border px-3 py-2 ${nonConfirme(s) ? 'border-dashed border-pierre-400' : 'border-pierre-200'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium">{s.nom_groupe}</span>
        <span className="text-xs text-pierre-500">{s.numero}</span>
      </div>
      <p className="text-sm text-pierre-600">
        {[s.type_sejour, s.nb_participants != null && `${s.nb_participants} participants`, s.avec_repas && 'repas', s.avec_animation && 'animation']
          .filter(Boolean)
          .join(' · ')}
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
        {arrive && <span className="rounded-full bg-foret-50 px-2 py-0.5 text-foret-800">Arrivée{s.heure_arrivee ? ` à ${heure(s.heure_arrivee)}` : ''}</span>}
        {part && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-900">Départ{s.heure_depart ? ` à ${heure(s.heure_depart)}` : ''}</span>}
        {nonConfirme(s) && <span className="rounded-full bg-pierre-100 px-2 py-0.5 text-pierre-700">{s.etat}</span>}
        {manque && (
          <Link to={`/calendrier/animation?date=${date}`} className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-red-800">
            <IconeAttention className="size-3.5" />
            {animes ? `${animes} animateur${animes > 1 ? 's' : ''} sur ${s.nb_animateurs}` : 'Aucun animateur'}
          </Link>
        )}
      </div>
      {s.notes && <p className="mt-1 whitespace-pre-line text-sm text-pierre-700">{s.notes}</p>}
    </li>
  )
}
