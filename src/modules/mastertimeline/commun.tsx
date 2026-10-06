import { useEffect, type ReactNode } from 'react'
import { dateCourte, estAnnuelle, libelleFrequence, moisCourt, type Etat } from './calendrier'
import { useModifierTache, type References } from './donnees'
import { FILTRES_VIDES, offertPour, useBasculer, useEcriture, useOuvrirFiche, type Filtres, type Montrer, type Regroupement } from './outils'
import { PRIORITES, type Coche, type Tache } from './types'

const menu = 'rounded-lg border border-pierre-300 bg-white px-2.5 py-1.5 text-sm text-pierre-800'

export function BarreFiltres({
  filtres,
  changer,
  refs,
  sans,
}: {
  filtres: Filtres
  changer: (f: Partial<Filtres>) => void
  refs: References
  /** Filtres à ne pas montrer (ex. le responsable dans la vue par responsable). */
  sans?: (keyof Filtres)[]
}) {
  const actifs = filtres.entreprise || filtres.projet || filtres.responsable || filtres.etiquette
  // Étiquette gardée sur l'appareil mais supprimée depuis : le filtre tombe.
  const etiquetteDisparue = refs.pret && !!filtres.etiquette && !refs.etiquette.has(filtres.etiquette)
  useEffect(() => {
    if (etiquetteDisparue) changer({ etiquette: '' })
  }, [etiquetteDisparue, changer])
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!sans?.includes('entreprise') && (
        <select
          aria-label="Entreprise"
          className={menu}
          value={filtres.entreprise}
          onChange={(e) => {
            const projet = filtres.projet ? refs.projet.get(filtres.projet) : null
            changer({ entreprise: e.target.value, ...(projet && !offertPour(projet, e.target.value) ? { projet: '' } : {}) })
          }}
        >
          <option value="">Toutes les entreprises</option>
          {refs.entreprises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nom}
            </option>
          ))}
        </select>
      )}
      {!sans?.includes('projet') && (
        <select aria-label="Projet" className={menu} value={filtres.projet} onChange={(e) => changer({ projet: e.target.value })}>
          <option value="">Tous les projets</option>
          {refs.projets
            .filter((p) => offertPour(p, filtres.entreprise) || p.id === filtres.projet)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
        </select>
      )}
      {!sans?.includes('responsable') && (
        <select aria-label="Responsable" className={menu} value={filtres.responsable} onChange={(e) => changer({ responsable: e.target.value })}>
          <option value="">Tous les responsables</option>
          {refs.responsables.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nom}
            </option>
          ))}
          <option value="aucun">Sans responsable</option>
        </select>
      )}
      {refs.etiquettes.length > 0 && (
        <select aria-label="Étiquette" className={menu} value={filtres.etiquette} onChange={(e) => changer({ etiquette: e.target.value })}>
          <option value="">Toutes les étiquettes</option>
          {refs.etiquettes.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nom}
            </option>
          ))}
        </select>
      )}
      {actifs && (
        <button className="text-sm text-pierre-500 underline hover:text-pierre-800" onClick={() => changer(FILTRES_VIDES)}>
          Tout afficher
        </button>
      )}
    </div>
  )
}

export function ChoixRegroupement({ valeur, changer, choix = ['entreprise', 'projet', 'responsable'] }: { valeur: Regroupement; changer: (r: Regroupement) => void; choix?: Regroupement[] }) {
  const noms: Record<Regroupement, string> = { entreprise: 'Entreprise', projet: 'Projet', responsable: 'Responsable' }
  return (
    <div className="inline-flex rounded-lg border border-pierre-300 bg-white p-0.5 text-sm" role="group" aria-label="Regrouper par">
      {choix.map((r) => (
        <button
          key={r}
          className={`rounded-md px-2.5 py-1 ${valeur === r ? 'bg-foret-100 font-medium text-foret-800' : 'text-pierre-600 hover:text-pierre-900'}`}
          onClick={() => changer(r)}
        >
          {noms[r]}
        </button>
      ))}
    </div>
  )
}

// --------------------------------------------------------- éléments ---

export function Pastille({ couleur }: { couleur: string | null }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: couleur ?? 'var(--color-pierre-300)' }} aria-hidden />
}

export function Puce({ children, couleur, ton }: { children: ReactNode; couleur?: string | null; ton?: 'retard' }) {
  const fond = ton === 'retard' ? 'bg-red-50 text-red-800' : 'bg-pierre-100 text-pierre-700'
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${fond}`}>
      {couleur !== undefined && <Pastille couleur={couleur} />}
      {children}
    </span>
  )
}

/** Étiquettes d'une tâche (Corvée, Woofing…), teintées de leur couleur, dans l'ordre de la liste. */
export function PucesEtiquettes({ tache, refs }: { tache: Tache; refs: References }) {
  const liste = refs.etiquettes.filter((e) => tache.etiquette_ids.includes(e.id))
  return liste.map((e) => {
    const c = e.couleur ?? 'var(--color-pierre-500)'
    return (
      <span
        key={e.id}
        className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs"
        style={{ background: `color-mix(in srgb, ${c} 14%, white)`, color: `color-mix(in srgb, ${c} 70%, black)` }}
      >
        {e.nom}
      </span>
    )
  })
}

/** Case de coche : faite ✓, « pas cette année » –, en retard (bord rouge). */
export function CaseCoche({ etat, basculer, desactivee }: { etat: Etat; basculer: () => void; desactivee?: boolean }) {
  const style =
    etat === 'faite'
      ? 'border-foret-700 bg-foret-700 text-white'
      : etat === 'sautee'
        ? 'border-pierre-300 bg-pierre-100 text-pierre-500'
        : etat === 'retard'
          ? 'border-red-500 bg-white hover:bg-red-50'
          : 'border-pierre-400 bg-white hover:border-foret-600'
  const libelle = etat === 'faite' ? 'Décocher' : 'Cocher comme faite'
  return (
    <button
      type="button"
      aria-label={libelle}
      title={etat === 'sautee' ? 'Pas cette année' : libelle}
      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-sm font-bold disabled:cursor-default ${style}`}
      onClick={basculer}
      disabled={desactivee}
    >
      {etat === 'faite' ? '✓' : etat === 'sautee' ? '–' : ''}
    </button>
  )
}

export function LigneTache({
  tache: t,
  periode,
  etat,
  coche,
  refs,
  montrer = {},
}: {
  tache: Tache
  periode: string
  etat: Etat
  coche: Coche | undefined
  refs: References
  montrer?: Montrer
}) {
  const ecriture = useEcriture()
  const basculer = useBasculer()
  const ouvrir = useOuvrirFiche()
  const entreprise = t.entreprise_id ? refs.entreprise.get(t.entreprise_id) : null
  const projet = t.projet_id ? refs.projet.get(t.projet_id) : null
  const responsable = t.responsable_id ? refs.responsable.get(t.responsable_id) : null
  const fournisseur = t.fournisseur_id ? refs.fournisseur.get(t.fournisseur_id) : null
  const finie = etat === 'faite' || etat === 'sautee'
  const annuelle = estAnnuelle(t)
  const responsableModifiable = montrer.responsableModifiable && ecriture
  const ouvrirFiche = () => ouvrir({ tache: t, periode })

  // Seul le titre ouvre la fiche : les étiquettes peuvent contenir un menu.
  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <CaseCoche etat={etat} basculer={() => basculer(t, periode, coche, 'faite')} desactivee={!ecriture} />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          className={`text-left text-sm hover:underline ${finie ? 'text-pierre-500 line-through decoration-pierre-300' : 'text-pierre-900 decoration-pierre-300'}`}
          onClick={ouvrirFiche}
        >
          {t.titre}
        </button>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {montrer.mois && annuelle && <Puce ton={etat === 'retard' ? 'retard' : undefined}>{moisCourt(periode)}</Puce>}
          {etat === 'sautee' && <Puce>Pas cette année</Puce>}
          {montrer.entreprise && entreprise && <Puce couleur={entreprise.couleur}>{entreprise.nom}</Puce>}
          {montrer.projet && projet && <Puce couleur={projet.couleur}>{projet.nom}</Puce>}
          {responsableModifiable ? (
            <ChoixResponsable tache={t} refs={refs} />
          ) : (
            montrer.responsable !== false && responsable && <Puce>{responsable.nom}</Puce>
          )}
          {!annuelle && t.echeance && <Puce ton={etat === 'retard' ? 'retard' : undefined}>{etat === 'retard' ? 'En retard · ' : ''}{dateCourte(t.echeance)}</Puce>}
          {!annuelle && t.priorite && <Puce>{PRIORITES[t.priorite]}</Puce>}
          {montrer.frequence && annuelle && <Puce>{libelleFrequence(t)}</Puce>}
          <PucesEtiquettes tache={t} refs={refs} />
          {fournisseur && <Puce>{fournisseur.nom}</Puce>}
          {t.note && <span className="text-xs text-pierre-400" title={t.note}>📝</span>}
        </div>
        {coche?.note && (
          <button type="button" className="mt-1 block whitespace-pre-line text-left text-xs italic text-pierre-500" onClick={ouvrirFiche}>
            {coche.note}
          </button>
        )}
      </div>
    </li>
  )
}

/** Petit menu en forme d'étiquette : change le responsable de la tâche (toutes les années). */
export function ChoixResponsable({ tache: t, refs }: { tache: Tache; refs: References }) {
  const modifier = useModifierTache()
  const actuel = t.responsable_id
  return (
    <select
      aria-label={`Responsable de « ${t.titre} »`}
      title="Responsable de la tâche"
      className={`fleche-serree max-w-full rounded-full border py-0.5 pl-2 text-xs ${
        actuel ? 'border-pierre-200 bg-pierre-100 text-pierre-700' : 'border-dashed border-pierre-300 bg-white text-pierre-500'
      }`}
      value={actuel ?? ''}
      onChange={(e) => modifier.mutate({ id: t.id, champs: { responsable_id: e.target.value || null } })}
    >
      <option value="">{actuel ? 'Personne' : 'Responsable…'}</option>
      {refs.responsables
        .filter((r) => r.actif || r.id === actuel)
        .map((r) => (
          <option key={r.id} value={r.id}>
            {r.nom}
          </option>
        ))}
    </select>
  )
}

export function EnTeteGroupe({ nom, couleur, faites, total }: { nom: string; couleur: string | null; faites: number; total: number }) {
  return (
    <div className="flex items-center gap-2 border-b border-pierre-100 px-3 py-2">
      <Pastille couleur={couleur} />
      <h3 className="text-sm font-semibold text-pierre-800">{nom}</h3>
      <span className="ml-auto text-xs tabular-nums text-pierre-500">
        {faites} / {total}
      </span>
    </div>
  )
}
