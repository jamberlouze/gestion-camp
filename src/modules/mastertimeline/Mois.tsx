import { useMemo, useState } from 'react'
import { messageErreur } from '@/lib/donnees'
import { IconeChevron, IconePlus } from '@/lib/icones'
import { classeLigneCliquable, clicLigne } from '@/lib/ligneCliquable'
import { PuceCompagnie } from '@/lib/PuceCompagnie'
import { ui } from '@/lib/ui'
import { cleAujourdhui, dateCourte, decalerMois, estAnnuelle, exerciceDeCle, libelleExercice, libelleFrequence, libelleMois, majuscule } from './calendrier'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { BarreFiltres, ChoixRegroupement, EnTeteGroupe, LigneTache, Puce, PucesEtiquettes } from './commun'
import { useCoches, useReferences, useTaches, type References } from './donnees'
import { garder, passagesDuMois, regrouper, retards, trierPassages, useEcriture, useFiltres, useOuvrirFiche, type Passage, type Regroupement } from './outils'
import type { Tache } from './types'
import { TableauPassages, type Colonnes } from './TableauPassages'
import { BoutonImporter } from './Importer'

const CLE_REGROUPEMENT = 'mastertimeline-regroupement'

export function Mois() {
  const ecriture = useEcriture()
  const ouvrir = useOuvrirFiche()
  const large = useMediaQuery('(min-width: 768px)')
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
    // Recherche : les tâches trouvées qui ne passent pas ce mois-ci, pour ne pas les croire absentes.
    const ici = new Set([...duMois, ...enRetard].map((p) => p.tache.id))
    const ailleurs = filtres.texte.trim()
      ? liste.filter((t) => !ici.has(t.id) && garder(t, filtres)).sort((a, b) => a.titre.localeCompare(b.titre, 'fr'))
      : []
    return { duMois, enRetard, groupes, faites, ailleurs }
  }, [taches.data, cle, coches.index, cochesCourantes.index, filtres, par, refs, courant])

  const erreur = taches.error ?? coches.erreur ?? refs.erreur
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!taches.data || !coches.pret || !refs.pret) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const { duMois, enRetard, groupes, faites, ailleurs } = donnees

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
          <div className="flex gap-2">
            <BoutonImporter />
            <button className={ui.bouton} onClick={() => ouvrir({ tache: null })}>
              <IconePlus /> Nouvelle tâche
            </button>
          </div>
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
          <Liste passages={enRetard} refs={refs} large={large} colonnes={{ mois: true, entreprise: true, projet: true }} />
        </section>
      )}

      <p className="text-sm text-pierre-500">
        {duMois.length === 0
          ? `Rien de prévu en ${libelleMois(cle).split(' ')[0]}.`
          : `${faites} sur ${duMois.length} passage${duMois.length > 1 ? 's' : ''} réglé${faites > 1 ? 's' : ''} ce mois-là`}
      </p>

      <div className="space-y-4">
        {groupes.map((g) => (
          <section key={g.cle} className={ui.carte}>
            <EnTeteGroupe
              nom={g.nom}
              couleur={g.couleur}
              faites={g.elements.filter((p) => p.etat === 'faite' || p.etat === 'sautee').length}
              total={g.elements.length}
            />
            <Liste passages={g.elements} refs={refs} large={large} colonnes={{ entreprise: par !== 'entreprise', projet: par !== 'projet' }} />
          </section>
        ))}
      </div>

      {ailleurs.length > 0 && <Ailleurs taches={ailleurs} refs={refs} />}
    </div>
  )
}

/** Tâches trouvées par la recherche qui reviennent d'autres mois : un clic ouvre la fiche. */
function Ailleurs({ taches, refs }: { taches: Tache[]; refs: References }) {
  const ouvrir = useOuvrirFiche()
  return (
    <section className={ui.carte}>
      <div className="flex items-center gap-2 border-b border-pierre-100 px-3 py-2">
        <h3 className="text-sm font-semibold text-pierre-800">Dans les autres mois</h3>
        <span className="text-xs text-pierre-500">
          {taches.length} tâche{taches.length > 1 ? 's' : ''} trouvée{taches.length > 1 ? 's' : ''}
        </span>
      </div>
      <ul className="divide-y divide-pierre-100">
        {taches.map((t) => {
          const entreprise = t.entreprise_id ? refs.entreprise.get(t.entreprise_id) : null
          const responsable = t.responsable_id ? refs.responsable.get(t.responsable_id) : null
          const ouvrirFiche = () => ouvrir({ tache: t })
          return (
            <li key={t.id} className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm ${classeLigneCliquable}`} onClick={clicLigne(ouvrirFiche)}>
              <button type="button" className="text-left text-pierre-900 decoration-pierre-300 hover:underline" onClick={ouvrirFiche}>
                {t.titre}
              </button>
              <Puce>{estAnnuelle(t) ? libelleFrequence(t) : t.echeance ? dateCourte(t.echeance) : 'Sans date'}</Puce>
              {entreprise && <PuceCompagnie compagnie={entreprise} className="font-normal" />}
              {responsable && <Puce>{responsable.nom}</Puce>}
              <PucesEtiquettes tache={t} refs={refs} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Ordinateur : tableau à colonnes alignées. Téléphone : lignes empilées. */
function Liste({ passages, colonnes, refs, large }: { passages: Passage[]; colonnes: Colonnes; refs: References; large: boolean }) {
  if (large) return <TableauPassages passages={passages} refs={refs} colonnes={colonnes} />
  return (
    <ul className="divide-y divide-pierre-100">
      {passages.map((p) => (
        <LigneTache
          key={`${p.tache.id}|${p.periode}`}
          {...p}
          refs={refs}
          montrer={{ mois: colonnes.mois, entreprise: colonnes.entreprise, projet: colonnes.projet, responsableModifiable: true }}
        />
      ))}
    </ul>
  )
}
