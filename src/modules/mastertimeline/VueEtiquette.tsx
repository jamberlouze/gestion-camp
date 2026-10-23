import { useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { messageErreur } from '@/lib/donnees'
import { IconeChevron } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { LigneTache as LigneTravaux } from '@/modules/travaux/commun'
import { useDonnees, useTempsReel, type Donnees } from '@/modules/travaux/donnees'
import { Fiche as FicheTravaux } from '@/modules/travaux/Fiche'
import { ContexteFenetre, enRetard, type Fenetre } from '@/modules/travaux/outils'
import type { Tache as TacheTravaux } from '@/modules/travaux/types'
import {
  bornesExercice,
  cleAujourdhui,
  clesExercice,
  decalerMois,
  exerciceDeCle,
  libelleExercice,
  libelleMois,
  majuscule,
  type IndexCoches,
} from './calendrier'
import { LigneTache } from './commun'
import { useCoches, useReferences, useTaches, type References } from './donnees'
import { FILTRES_VIDES, garder, passagesDuMois, retards, trierPassages, type Passage } from './outils'
import type { Tache } from './types'

// Vue d'une étiquette (Corvée, Woofing…) : tâches de Mastertimeline et de
// Travaux qui la portent, pour le mois choisi, retards en haut.
// Demande de Maxime du 2026-10-07 ; direction seulement (onglet de Mastertimeline).
// 2026-10-11 : aussi la liste de l'exercice complet, mois par mois (choix Mois | Année).

export function VueEtiquette() {
  const { peutLire } = useAuth()
  return peutLire('travaux') ? <AvecTravaux /> : <Vue travaux={null} />
}

function AvecTravaux() {
  useTempsReel()
  const d = useDonnees()
  return <Vue travaux={d} />
}

/** Mois d'un horodatage ou d'une date, sur l'appareil : 'AAAA-MM'. */
const moisDe = (iso: string) => (iso.length > 10 ? new Date(iso).toLocaleDateString('sv-SE') : iso).slice(0, 7)

type Mode = 'mois' | 'annee'
const CLE_MODE = 'mastertimeline-etiquette-mode'

/** Mois ou année, gardé sur l'appareil (préférence personnelle). */
function useMode() {
  const [mode, setMode] = useState<Mode>(() => {
    try {
      return localStorage.getItem(CLE_MODE) === 'annee' ? 'annee' : 'mois'
    } catch {
      return 'mois'
    }
  })
  const changer = (m: Mode) => {
    setMode(m)
    try {
      localStorage.setItem(CLE_MODE, m)
    } catch {
      /* préférence non conservée */
    }
  }
  return [mode, changer] as const
}

/** Ce que les deux listes (mois, année) reçoivent. */
interface Contexte {
  nom: string
  /** Tâches de Mastertimeline qui portent l'étiquette. */
  liste: Tache[]
  /** Tâches de Travaux qui portent l'étiquette (pas celles devenues annuelles). */
  portees: TacheTravaux[]
  d: Donnees | null
  refs: References
}

function Vue({ travaux }: { travaux: Donnees | null }) {
  const { id = '' } = useParams()
  const refs = useReferences()
  const taches = useTaches()
  const [cle, setCle] = useState(cleAujourdhui)
  const [mode, changerMode] = useMode()
  const exercice = exerciceDeCle(cle)
  const coches = useCoches(exercice)
  const cochesCourantes = useCoches(exerciceDeCle(cleAujourdhui()))
  const [fenetre, setFenetre] = useState<Fenetre | null>(null)
  const etiquette = refs.etiquette.get(id)

  const { liste, portees } = useMemo(() => {
    const filtres = { ...FILTRES_VIDES, etiquettes: [id] }
    return {
      liste: (taches.data ?? []).filter((t) => garder(t, filtres)),
      portees: (travaux?.taches ?? []).filter((t) => t.etiquette_ids.includes(id) && !t.annualisee_vers),
    }
  }, [taches.data, travaux?.taches, id])

  const erreur = taches.error ?? coches.erreur ?? refs.erreur
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!taches.data || !coches.pret || !refs.pret || (travaux && !travaux.pret)) {
    return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
  }
  if (!etiquette) return <p className="py-8 text-center text-sm text-pierre-500">Cette étiquette n'existe plus.</p>

  const contexte: Contexte = { nom: etiquette.nom, liste, portees, d: travaux, refs }
  const annee = mode === 'annee'
  const courant = annee ? exercice === exerciceDeCle(cleAujourdhui()) : cle === cleAujourdhui()
  // L'année avance d'un exercice à la fois ; revenir au mois garde le même mois.
  const pas = annee ? 12 : 1

  return (
    <ContexteFenetre.Provider value={setFenetre}>
      <div className="space-y-4">
        {travaux && <BandeauErreurs racine="travaux" />}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button className={`${ui.boutonSecondaire} px-2`} aria-label={annee ? 'Exercice précédent' : 'Mois précédent'} onClick={() => setCle(decalerMois(cle, -pas))}>
              <IconeChevron className="size-4 rotate-180" />
            </button>
            <div className="min-w-44 text-center">
              <p className="text-lg font-semibold">{annee ? `Exercice ${libelleExercice(exercice)}` : majuscule(libelleMois(cle))}</p>
              <p className="text-xs text-pierre-500">
                {annee ? `Octobre ${exercice} à septembre ${exercice + 1}` : `Exercice ${libelleExercice(exercice)}`}
                {!courant && (
                  <>
                    {' · '}
                    <button className="text-foret-700 underline" onClick={() => setCle(cleAujourdhui())}>
                      {annee ? 'exercice en cours' : 'revenir à ce mois-ci'}
                    </button>
                  </>
                )}
              </p>
            </div>
            <button className={`${ui.boutonSecondaire} px-2`} aria-label={annee ? 'Exercice suivant' : 'Mois suivant'} onClick={() => setCle(decalerMois(cle, pas))}>
              <IconeChevron className="size-4" />
            </button>
          </div>
          <ChoixMode valeur={mode} changer={changerMode} />
        </div>

        {annee ? (
          <ListeAnnee {...contexte} exercice={exercice} index={coches.index} />
        ) : (
          <ListeMois {...contexte} cle={cle} index={coches.index} indexCourant={cochesCourantes.index} />
        )}
      </div>

      {travaux && fenetre?.type === 'fiche' && <FicheTravaux key={fenetre.id} id={fenetre.id} d={travaux} fermer={() => setFenetre(null)} />}
    </ContexteFenetre.Provider>
  )
}

function ChoixMode({ valeur, changer }: { valeur: Mode; changer: (m: Mode) => void }) {
  const noms: Record<Mode, string> = { mois: 'Mois', annee: 'Année' }
  return (
    <div className="inline-flex rounded-lg border border-pierre-300 bg-white p-0.5 text-sm" role="group" aria-label="Afficher">
      {(['mois', 'annee'] as const).map((m) => (
        <button
          key={m}
          aria-pressed={valeur === m}
          className={`rounded-md px-2.5 py-1 ${valeur === m ? 'bg-foret-100 font-medium text-foret-800' : 'text-pierre-600 hover:text-pierre-900'}`}
          onClick={() => changer(m)}
        >
          {noms[m]}
        </button>
      ))}
    </div>
  )
}

/** Le mois choisi, avec les retards de l'exercice en cours en haut. */
function ListeMois({ nom, liste, portees, d, refs, cle, index, indexCourant }: Contexte & { cle: string; index: IndexCoches; indexCourant: IndexCoches }) {
  const courant = cle === cleAujourdhui()
  const { duMois, mtRetard, twRetard, twMois, reglees, total } = useMemo(() => {
    const duMois = trierPassages(passagesDuMois(liste, cle, index, FILTRES_VIDES))
    const mtRetard = courant ? trierPassages(retards(liste, indexCourant, FILTRES_VIDES)) : []

    // Travaux : les tâches ouvertes vivent « maintenant » (en retard si leur
    // échéance est passée) ; un autre mois montre celles dues ou faites ce mois-là.
    const ouvertes = portees.filter((t) => t.statut !== 'terminee')
    const twRetard = courant ? ouvertes.filter((t) => enRetard(t)) : []
    const twMois = [
      ...(courant ? ouvertes.filter((t) => !enRetard(t)) : ouvertes.filter((t) => t.echeance && moisDe(t.echeance) === cle)),
      ...portees.filter((t) => t.statut === 'terminee' && t.fait_le && moisDe(t.fait_le) === cle),
    ].sort(comparerTravaux)

    return { duMois, mtRetard, twRetard: twRetard.sort(comparerTravaux), twMois, reglees: compterReglees(duMois, twMois), total: duMois.length + twMois.length }
  }, [liste, portees, cle, index, indexCourant, courant])

  const nomMois = libelleMois(cle).split(' ')[0]

  return (
    <>
      {mtRetard.length + twRetard.length > 0 && (
        <section className={`${ui.carte} border-red-200`}>
          <div className="flex items-center gap-2 border-b border-red-100 px-3 py-2">
            <h3 className="text-sm font-semibold text-red-800">En retard</h3>
            <span className="text-xs tabular-nums text-red-700">{mtRetard.length + twRetard.length}</span>
          </div>
          <Contenu passages={mtRetard} travaux={twRetard} d={d} refs={refs} moisVisible />
        </section>
      )}

      <section className={ui.carte}>
        <div className="flex items-center gap-2 border-b border-pierre-100 px-3 py-2">
          <h3 className="text-sm font-semibold text-pierre-800">
            {nom} · {majuscule(nomMois)}
          </h3>
          {total > 0 && (
            <span className="ml-auto text-xs tabular-nums text-pierre-500">
              {reglees} / {total}
            </span>
          )}
        </div>
        {total === 0 ? (
          <p className="px-3 py-5 text-center text-sm text-pierre-500">
            Aucune tâche « {nom} » en {nomMois}.
          </p>
        ) : (
          <Contenu passages={duMois} travaux={twMois} d={d} refs={refs} />
        )}
      </section>
    </>
  )
}

/**
 * L'exercice complet, d'octobre à septembre. Travaux : une tâche ouverte va au
 * mois de son échéance, une tâche faite au mois où elle a été faite. Comme dans
 * la vue du mois, une tâche ouverte sans échéance (ou échue avant l'exercice)
 * vit « maintenant » : dans le mois en cours.
 */
function ListeAnnee({ nom, liste, portees, d, refs, exercice, index }: Contexte & { exercice: number; index: IndexCoches }) {
  const aujourdhui = cleAujourdhui()
  const { mois, reglees, total } = useMemo(() => {
    const [debut] = bornesExercice(exercice)
    const moisTravaux = (t: TacheTravaux) => {
      if (t.statut === 'terminee') return t.fait_le ? moisDe(t.fait_le) : null
      return t.echeance && moisDe(t.echeance) >= debut ? moisDe(t.echeance) : aujourdhui
    }

    const mois = clesExercice(exercice).map((cle) => {
      const mt = trierPassages(passagesDuMois(liste, cle, index, FILTRES_VIDES))
      const tw = portees.filter((t) => moisTravaux(t) === cle).sort(comparerTravaux)
      return { cle, mt, tw, reglees: compterReglees(mt, tw), total: mt.length + tw.length }
    })
    return { mois, reglees: mois.reduce((n, m) => n + m.reglees, 0), total: mois.reduce((n, m) => n + m.total, 0) }
  }, [liste, portees, exercice, index, aujourdhui])

  if (total === 0) {
    return (
      <p className={`${ui.carte} px-3 py-8 text-center text-sm text-pierre-500`}>
        Aucune tâche « {nom} » pendant l'exercice {libelleExercice(exercice)}.
      </p>
    )
  }

  return (
    <>
      <p className="text-sm text-pierre-600">
        <span className="font-medium text-pierre-800">{nom}</span> · {total} tâche{total > 1 ? 's' : ''} dans l'exercice, {reglees} réglée{reglees > 1 ? 's' : ''}
      </p>
      {mois.map((m) => {
        const ceMois = m.cle === aujourdhui
        return (
          <section key={m.cle} className={`${ui.carte} ${ceMois ? 'border-foret-300' : ''}`}>
            <div className={`flex items-center gap-2 px-3 py-2 ${m.total ? 'border-b border-pierre-100' : ''}`}>
              <h3 className={`text-sm font-semibold ${m.total ? 'text-pierre-800' : 'text-pierre-400'}`}>{majuscule(libelleMois(m.cle))}</h3>
              {ceMois && <span className="rounded-full bg-foret-100 px-2 py-0.5 text-xs font-medium text-foret-800">Ce mois-ci</span>}
              <span className="ml-auto text-xs tabular-nums text-pierre-500">{m.total ? `${m.reglees} / ${m.total}` : 'Aucune tâche'}</span>
            </div>
            {m.total > 0 && <Contenu passages={m.mt} travaux={m.tw} d={d} refs={refs} />}
          </section>
        )
      })}
    </>
  )
}

/** Faites ou « pas cette année » (Mastertimeline), terminées (Travaux). */
function compterReglees(passages: Passage[], travaux: TacheTravaux[]) {
  return passages.filter((p) => p.etat === 'faite' || p.etat === 'sautee').length + travaux.filter((t) => t.statut === 'terminee').length
}

/** Urgent d'abord, puis l'échéance la plus proche ; terminées à la fin. */
function comparerTravaux(a: TacheTravaux, b: TacheTravaux) {
  return (
    Number(a.statut === 'terminee') - Number(b.statut === 'terminee') ||
    a.priorite - b.priorite ||
    (a.echeance ?? '9999').localeCompare(b.echeance ?? '9999') ||
    a.titre.localeCompare(b.titre, 'fr')
  )
}

/** Les tâches des deux modules, chacune sous l'icône de son module. */
function Contenu({
  passages,
  travaux,
  d,
  refs,
  moisVisible,
}: {
  passages: Passage[]
  travaux: TacheTravaux[]
  d: Donnees | null
  refs: References
  moisVisible?: boolean
}) {
  return (
    <>
      {passages.length > 0 && (
        <Groupe titre="📅 Mastertimeline">
          {passages.map((p) => (
            <LigneTache
              key={`${p.tache.id}|${p.periode}`}
              {...p}
              refs={refs}
              montrer={{ mois: moisVisible, entreprise: true, responsableModifiable: true, sortie: moisVisible }}
            />
          ))}
        </Groupe>
      )}
      {d && travaux.length > 0 && (
        <Groupe titre="🛠️ Travaux">
          {travaux.map((t) => (
            <LigneTravaux key={t.id} tache={t} d={d} montrer={{ lieu: true, personne: true }} sortie={moisVisible} />
          ))}
        </Groupe>
      )}
    </>
  )
}

function Groupe({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div>
      <p className="bg-pierre-50 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-pierre-500">{titre}</p>
      <ul className="divide-y divide-pierre-100">{children}</ul>
    </div>
  )
}
