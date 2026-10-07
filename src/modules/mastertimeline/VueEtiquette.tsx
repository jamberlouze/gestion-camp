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
import { cleAujourdhui, decalerMois, exerciceDeCle, libelleExercice, libelleMois, majuscule } from './calendrier'
import { LigneTache } from './commun'
import { useCoches, useReferences, useTaches } from './donnees'
import { FILTRES_VIDES, passagesDuMois, retards, trierPassages, type Passage } from './outils'

// Vue d'une étiquette (Corvée, Woofing…) : tâches de Mastertimeline et de
// Travaux qui la portent, pour le mois choisi, retards en haut.
// Demande de Maxime du 2026-10-07 ; direction seulement (onglet de Mastertimeline).

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

function Vue({ travaux }: { travaux: Donnees | null }) {
  const { id = '' } = useParams()
  const refs = useReferences()
  const taches = useTaches()
  const [cle, setCle] = useState(cleAujourdhui)
  const coches = useCoches(exerciceDeCle(cle))
  const cochesCourantes = useCoches(exerciceDeCle(cleAujourdhui()))
  const [fenetre, setFenetre] = useState<Fenetre | null>(null)
  const courant = cle === cleAujourdhui()
  const etiquette = refs.etiquette.get(id)

  const donnees = useMemo(() => {
    const filtres = { ...FILTRES_VIDES, etiquettes: [id] }
    const liste = taches.data ?? []
    const duMois = trierPassages(passagesDuMois(liste, cle, coches.index, filtres))
    const mtRetard = courant ? trierPassages(retards(liste, cochesCourantes.index, filtres)) : []

    // Travaux : les tâches ouvertes vivent « maintenant » (en retard si leur
    // échéance est passée) ; un autre mois montre celles dues ou faites ce mois-là.
    const portees = (travaux?.taches ?? []).filter((t) => t.etiquette_ids.includes(id) && !t.annualisee_vers)
    const ouvertes = portees.filter((t) => t.statut !== 'terminee')
    const twRetard = courant ? ouvertes.filter((t) => enRetard(t)) : []
    const twMois = [
      ...(courant ? ouvertes.filter((t) => !enRetard(t)) : ouvertes.filter((t) => t.echeance && moisDe(t.echeance) === cle)),
      ...portees.filter((t) => t.statut === 'terminee' && t.fait_le && moisDe(t.fait_le) === cle),
    ].sort(comparerTravaux)

    const reglees = duMois.filter((p) => p.etat === 'faite' || p.etat === 'sautee').length + twMois.filter((t) => t.statut === 'terminee').length
    return { duMois, mtRetard, twRetard: twRetard.sort(comparerTravaux), twMois, reglees, total: duMois.length + twMois.length }
  }, [taches.data, travaux?.taches, id, cle, coches.index, cochesCourantes.index, courant])

  const erreur = taches.error ?? coches.erreur ?? refs.erreur
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!taches.data || !coches.pret || !refs.pret || (travaux && !travaux.pret)) {
    return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
  }
  if (!etiquette) return <p className="py-8 text-center text-sm text-pierre-500">Cette étiquette n'existe plus.</p>

  const { duMois, mtRetard, twRetard, twMois, reglees, total } = donnees
  const nomMois = libelleMois(cle).split(' ')[0]

  return (
    <ContexteFenetre.Provider value={setFenetre}>
      <div className="space-y-4">
        {travaux && <BandeauErreurs racine="travaux" />}
        <div className="flex items-center gap-2">
          <button className={`${ui.boutonSecondaire} px-2`} aria-label="Mois précédent" onClick={() => setCle(decalerMois(cle, -1))}>
            <IconeChevron className="size-4 rotate-180" />
          </button>
          <div className="min-w-44 text-center">
            <p className="text-lg font-semibold">{majuscule(libelleMois(cle))}</p>
            <p className="text-xs text-pierre-500">
              Exercice {libelleExercice(exerciceDeCle(cle))}
              {!courant && (
                <>
                  {' · '}
                  <button className="text-foret-700 underline" onClick={() => setCle(cleAujourdhui())}>
                    revenir à ce mois-ci
                  </button>
                </>
              )}
            </p>
          </div>
          <button className={`${ui.boutonSecondaire} px-2`} aria-label="Mois suivant" onClick={() => setCle(decalerMois(cle, 1))}>
            <IconeChevron className="size-4" />
          </button>
        </div>

        {mtRetard.length + twRetard.length > 0 && (
          <section className={`${ui.carte} border-red-200`}>
            <div className="flex items-center gap-2 border-b border-red-100 px-3 py-2">
              <h3 className="text-sm font-semibold text-red-800">En retard</h3>
              <span className="text-xs tabular-nums text-red-700">{mtRetard.length + twRetard.length}</span>
            </div>
            <Contenu passages={mtRetard} travaux={twRetard} d={travaux} refs={refs} moisVisible />
          </section>
        )}

        <section className={ui.carte}>
          <div className="flex items-center gap-2 border-b border-pierre-100 px-3 py-2">
            <h3 className="text-sm font-semibold text-pierre-800">
              {etiquette.nom} · {majuscule(nomMois)}
            </h3>
            {total > 0 && (
              <span className="ml-auto text-xs tabular-nums text-pierre-500">
                {reglees} / {total}
              </span>
            )}
          </div>
          {total === 0 ? (
            <p className="px-3 py-5 text-center text-sm text-pierre-500">
              Aucune tâche « {etiquette.nom} » en {nomMois}.
            </p>
          ) : (
            <Contenu passages={duMois} travaux={twMois} d={travaux} refs={refs} />
          )}
        </section>
      </div>

      {travaux && fenetre?.type === 'fiche' && <FicheTravaux key={fenetre.id} id={fenetre.id} d={travaux} fermer={() => setFenetre(null)} />}
    </ContexteFenetre.Provider>
  )
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
  refs: ReturnType<typeof useReferences>
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
              montrer={{ mois: moisVisible, entreprise: true, responsableModifiable: true }}
            />
          ))}
        </Groupe>
      )}
      {d && travaux.length > 0 && (
        <Groupe titre="🛠️ Travaux">
          {travaux.map((t) => (
            <LigneTravaux key={t.id} tache={t} d={d} montrer={{ lieu: true, personne: true }} />
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
