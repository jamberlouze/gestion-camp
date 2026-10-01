import { Fragment, useMemo, useState } from 'react'
import { messageErreur } from '@/lib/donnees'
import { IconeChevron, IconePlus } from '@/lib/icones'
import { ui } from '@/lib/ui'
import {
  cleAujourdhui,
  cleCoche,
  cleEcheance,
  clesExercice,
  estAnnuelle,
  etatPassage,
  exerciceDeCle,
  jourAujourdhui,
  libelleExercice,
  libelleMois,
  lireCle,
  NOMS_MOIS_COURTS,
  passages,
  ponctuelleEnRetard,
  UNIQUE,
  type Etat,
} from './calendrier'
import { BarreFiltres, ChoixRegroupement, Pastille } from './commun'
import { garder, regrouper, useBasculer, useEcriture, useFiltres, useOuvrirFiche, type Regroupement } from './outils'
import { useCoches, useReferences, useTaches } from './donnees'
import type { Coche, Tache } from './types'

interface Rangee {
  tache: Tache
  /** Par mois de l'exercice : le passage (période de la coche, état, coche) ou rien. */
  cases: ({ periode: string; etat: Etat; coche: Coche | undefined } | null)[]
}

const STYLE_CASE: Record<Etat, string> = {
  faite: 'bg-foret-700 text-white border-foret-700',
  sautee: 'bg-pierre-100 text-pierre-500 border-pierre-200',
  retard: 'bg-white text-red-700 border-red-400',
  a_faire: 'bg-white text-foret-800 border-foret-600',
  a_venir: 'bg-white text-pierre-400 border-pierre-300',
}
const SYMBOLE: Record<Etat, string> = { faite: '✓', sautee: '–', retard: '!', a_faire: '', a_venir: '' }
const LIBELLE: Record<Etat, string> = {
  faite: 'faite',
  sautee: 'pas cette année',
  retard: 'en retard',
  a_faire: 'à faire ce mois-ci',
  a_venir: 'à venir',
}

export function Annee() {
  const ecriture = useEcriture()
  const ouvrir = useOuvrirFiche()
  const basculer = useBasculer()
  const refs = useReferences()
  const taches = useTaches()
  const [exercice, setExercice] = useState(() => exerciceDeCle(cleAujourdhui()))
  const coches = useCoches(exercice)
  const [filtres, changerFiltres] = useFiltres()
  const [par, setPar] = useState<Regroupement>('projet')
  const cles = useMemo(() => clesExercice(exercice), [exercice])

  const { groupes, charge } = useMemo(() => {
    const aujourdhui = cleAujourdhui()
    const jour = jourAujourdhui()
    const rangees: Rangee[] = []
    for (const t of taches.data ?? []) {
      if (!garder(t, filtres)) continue
      let cases: Rangee['cases']
      if (estAnnuelle(t)) {
        const ses = new Set(passages(t, exercice))
        if (!ses.size) continue
        cases = cles.map((cle) => {
          if (!ses.has(cle)) return null
          const coche = coches.index.get(cleCoche(t.id, cle))
          return { periode: cle, etat: etatPassage(coche, cle, aujourdhui), coche }
        })
      } else {
        const mois = cleEcheance(t)
        if (!mois || !cles.includes(mois)) continue
        const coche = coches.index.get(cleCoche(t.id, UNIQUE))
        const etat: Etat = coche?.statut ?? (ponctuelleEnRetard(t, coche, jour) ? 'retard' : mois === aujourdhui ? 'a_faire' : 'a_venir')
        cases = cles.map((cle) => (cle === mois ? { periode: UNIQUE, etat, coche } : null))
      }
      rangees.push({ tache: t, cases })
    }
    // Premier passage de l'exercice, puis titre.
    rangees.sort((a, b) => a.cases.findIndex(Boolean) - b.cases.findIndex(Boolean) || a.tache.titre.localeCompare(b.tache.titre, 'fr'))
    const charge = cles.map((_, i) => {
      const du = rangees.map((r) => r.cases[i]).filter((c) => !!c)
      return { total: du.length, faites: du.filter((c) => c.etat === 'faite' || c.etat === 'sautee').length }
    })
    return { groupes: regrouper(rangees, (r) => r.tache, par, refs), charge }
  }, [taches.data, coches.index, filtres, par, refs, exercice, cles])

  const erreur = taches.error ?? coches.erreur ?? refs.erreur
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!taches.data || !coches.pret || !refs.pret) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const max = Math.max(1, ...charge.map((c) => c.total))
  const courant = exercice === exerciceDeCle(cleAujourdhui())

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button className={`${ui.boutonSecondaire} px-2`} aria-label="Exercice précédent" onClick={() => setExercice(exercice - 1)}>
            <IconeChevron className="size-4 rotate-180" />
          </button>
          <div className="min-w-40 text-center">
            <p className="text-lg font-semibold">Exercice {libelleExercice(exercice)}</p>
            <p className="text-xs text-pierre-500">
              Octobre {exercice} à septembre {exercice + 1}
              {!courant && (
                <>
                  {' · '}
                  <button className="text-foret-700 underline" onClick={() => setExercice(exerciceDeCle(cleAujourdhui()))}>
                    exercice en cours
                  </button>
                </>
              )}
            </p>
          </div>
          <button className={`${ui.boutonSecondaire} px-2`} aria-label="Exercice suivant" onClick={() => setExercice(exercice + 1)}>
            <IconeChevron className="size-4" />
          </button>
        </div>
        {ecriture && (
          <button className={ui.bouton} onClick={() => ouvrir({ tache: null })}>
            <IconePlus /> Nouvelle tâche
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <BarreFiltres filtres={filtres} changer={changerFiltres} refs={refs} />
        <ChoixRegroupement valeur={par} changer={setPar} />
      </div>

      <div className={`${ui.carte} overflow-x-auto`}>
        <table className="w-full min-w-[56rem] border-collapse text-sm">
          <thead className="bg-white">
            <tr className="border-b border-pierre-200">
              <th className="px-3 py-2 text-left font-medium text-pierre-500">Tâche</th>
              {cles.map((cle, i) => (
                <th key={cle} className={`w-14 px-1 py-2 text-center font-medium ${cle === cleAujourdhui() ? 'text-foret-800' : 'text-pierre-500'}`}>
                  {NOMS_MOIS_COURTS[lireCle(cle).mois - 1]}
                  {/* Charge du mois : hauteur proportionnelle au nombre de passages. */}
                  <div className="mx-auto mt-1 flex h-8 w-6 items-end" title={`${charge[i].total} passage(s), ${charge[i].faites} réglé(s)`}>
                    <div className="w-full rounded-t bg-pierre-200" style={{ height: `${(charge[i].total / max) * 100}%` }}>
                      <div className="w-full rounded-t bg-foret-600" style={{ height: `${charge[i].total ? (charge[i].faites / charge[i].total) * 100 : 0}%` }} />
                    </div>
                  </div>
                  <span className="block text-[11px] font-normal tabular-nums">{charge[i].total}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupes.map((g) => (
              <Fragment key={g.cle}>
                <tr className="bg-pierre-50">
                  <td colSpan={13} className="px-3 py-1.5">
                    <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-pierre-600">
                      <Pastille couleur={g.couleur} />
                      {g.nom}
                      <span className="font-normal normal-case tracking-normal text-pierre-500">· {g.elements.length}</span>
                    </span>
                  </td>
                </tr>
                {g.elements.map(({ tache: t, cases }) => {
                  const entreprise = t.entreprise_id ? refs.entreprise.get(t.entreprise_id) : null
                  return (
                    <tr key={t.id} className="border-b border-pierre-100 hover:bg-pierre-50/60">
                      <td className="max-w-md px-3 py-1.5">
                        <button className="text-left hover:text-foret-800" onClick={() => ouvrir({ tache: t, periode: cases.find(Boolean)?.periode })}>
                          {t.titre}
                        </button>
                        {par !== 'entreprise' && entreprise && <span className="ml-2 whitespace-nowrap text-xs text-pierre-400">{entreprise.nom}</span>}
                      </td>
                      {cases.map((c, i) =>
                        c ? (
                          <td key={cles[i]} className="px-1 py-1 text-center">
                            <button
                              className={`h-7 w-9 rounded-md border-2 text-xs font-bold disabled:cursor-default ${STYLE_CASE[c.etat]}`}
                              title={`${libelleMois(cles[i])} : ${LIBELLE[c.etat]}${ecriture ? ' — cliquer pour cocher ou décocher' : ''}`}
                              aria-label={`${t.titre}, ${libelleMois(cles[i])} : ${LIBELLE[c.etat]}`}
                              disabled={!ecriture}
                              onClick={() => basculer(t, c.periode, c.coche, 'faite')}
                            >
                              {SYMBOLE[c.etat]}
                            </button>
                          </td>
                        ) : (
                          <td key={cles[i]} />
                        ),
                      )}
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
        {groupes.length === 0 && <p className="px-3 py-8 text-center text-sm text-pierre-500">Aucune tâche pour ces filtres.</p>}
      </div>
    </div>
  )
}
