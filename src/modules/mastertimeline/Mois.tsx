import { useMemo, useState } from 'react'
import { messageErreur } from '@/lib/donnees'
import { IconeChevron, IconePlus } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { cleAujourdhui, decalerMois, exerciceDeCle, libelleExercice, libelleMois, majuscule } from './calendrier'
import { BarreFiltres, ChoixRegroupement, EnTeteGroupe, LigneTache } from './commun'
import { useCoches, useReferences, useTaches } from './donnees'
import { passagesDuMois, regrouper, retards, trierPassages, useEcriture, useFiltres, useOuvrirFiche, type Regroupement } from './outils'

const CLE_REGROUPEMENT = 'mastertimeline-regroupement'

export function Mois() {
  const ecriture = useEcriture()
  const ouvrir = useOuvrirFiche()
  const refs = useReferences()
  const taches = useTaches()
  const [cle, setCle] = useState(cleAujourdhui)
  const coches = useCoches(exerciceDeCle(cle))
  // Les retards sont ceux de l'exercice en cours : on lit aussi ses coches.
  const cochesCourantes = useCoches(exerciceDeCle(cleAujourdhui()))
  const [filtres, changerFiltres] = useFiltres()
  const [par, setPar] = useState<Regroupement>(() => {
    try {
      return (localStorage.getItem(CLE_REGROUPEMENT) as Regroupement | null) ?? 'entreprise'
    } catch {
      return 'entreprise'
    }
  })
  const regrouperPar = (r: Regroupement) => {
    setPar(r)
    try {
      localStorage.setItem(CLE_REGROUPEMENT, r)
    } catch {
      /* préférence non conservée */
    }
  }

  const courant = cle === cleAujourdhui()
  const donnees = useMemo(() => {
    const liste = taches.data ?? []
    const duMois = passagesDuMois(liste, cle, coches.index, filtres)
    const enRetard = courant ? trierPassages(retards(liste, cochesCourantes.index, filtres)) : []
    const groupes = regrouper(trierPassages(duMois), (p) => p.tache, par, refs)
    const faites = duMois.filter((p) => p.etat === 'faite' || p.etat === 'sautee').length
    return { duMois, enRetard, groupes, faites }
  }, [taches.data, cle, coches.index, cochesCourantes.index, filtres, par, refs, courant])

  const erreur = taches.error ?? coches.erreur ?? refs.erreur
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!taches.data || !coches.pret || !refs.pret) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const { duMois, enRetard, groupes, faites } = donnees
  const montrer = { entreprise: par !== 'entreprise', projet: par !== 'projet', responsable: par !== 'responsable' }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        {ecriture && (
          <button className={ui.bouton} onClick={() => ouvrir({ tache: null })}>
            <IconePlus /> Nouvelle tâche
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <BarreFiltres filtres={filtres} changer={changerFiltres} refs={refs} />
        <ChoixRegroupement valeur={par} changer={regrouperPar} />
      </div>

      {enRetard.length > 0 && (
        <section className={`${ui.carte} border-red-200`}>
          <div className="flex items-center gap-2 border-b border-red-100 px-3 py-2">
            <h3 className="text-sm font-semibold text-red-800">En retard</h3>
            <span className="text-xs text-red-700">
              {enRetard.length} passage{enRetard.length > 1 ? 's' : ''} pas encore fait{enRetard.length > 1 ? 's' : ''} depuis octobre
            </span>
          </div>
          <ul className="divide-y divide-pierre-100">
            {enRetard.map((p) => (
              <LigneTache key={`${p.tache.id}|${p.periode}`} {...p} refs={refs} montrer={{ ...montrer, mois: true, entreprise: true }} />
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm text-pierre-500">
        {duMois.length === 0
          ? `Rien de prévu en ${libelleMois(cle).split(' ')[0]}.`
          : `${faites} sur ${duMois.length} passage${duMois.length > 1 ? 's' : ''} réglé${faites > 1 ? 's' : ''} ce mois-là`}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {groupes.map((g) => (
          <section key={g.cle} className={`${ui.carte} self-start`}>
            <EnTeteGroupe
              nom={g.nom}
              couleur={g.couleur}
              faites={g.elements.filter((p) => p.etat === 'faite' || p.etat === 'sautee').length}
              total={g.elements.length}
            />
            <ul className="divide-y divide-pierre-100">
              {g.elements.map((p) => (
                <LigneTache key={`${p.tache.id}|${p.periode}`} {...p} refs={refs} montrer={montrer} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
