import { CompteurPieces } from '@/lib/PiecesJointes'
import { PuceCompagnie } from '@/lib/PuceCompagnie'
import { dateCourte, estAnnuelle, moisCourt } from './calendrier'
import { CaseCoche, ChoixResponsable, Pastille, Puce, PucesEtiquettes } from './commun'
import type { References } from './donnees'
import { useBasculer, useEcriture, useOuvrirFiche, type Passage } from './outils'
import { PRIORITES } from './types'

/** Colonnes du tableau, selon le regroupement (inutile de répéter l'entreprise du groupe). */
export interface Colonnes {
  mois?: boolean
  entreprise?: boolean
  projet?: boolean
}

const entete = 'px-2 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-pierre-400'

/**
 * Passages en tableau à colonnes alignées (vue Mois sur ordinateur) :
 * case · tâche · (mois) · (entreprise) · (projet) · responsable · fournisseur.
 * Le responsable se change directement dans son menu ; le titre ouvre la fiche.
 */
export function TableauPassages({ passages, refs, colonnes }: { passages: Passage[]; refs: References; colonnes: Colonnes }) {
  return (
    <table className="w-full table-fixed text-sm">
      <colgroup>
        <col className="w-10" />
        <col />
        {colonnes.mois && <col className="w-20" />}
        {colonnes.entreprise && <col className="w-36" />}
        {colonnes.projet && <col className="w-44" />}
        <col className="w-36" />
        <col className="w-44" />
      </colgroup>
      <thead className="border-b border-pierre-100">
        <tr>
          <th className="sr-only">Fait</th>
          <th className={entete}>Tâche</th>
          {colonnes.mois && <th className={entete}>Mois</th>}
          {colonnes.entreprise && <th className={entete}>Entreprise</th>}
          {colonnes.projet && <th className={entete}>Projet</th>}
          <th className={entete}>Responsable</th>
          <th className={entete}>Fournisseur</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-pierre-100">
        {passages.map((p) => (
          <Rangee key={`${p.tache.id}|${p.periode}`} passage={p} refs={refs} colonnes={colonnes} />
        ))}
      </tbody>
    </table>
  )
}

function Rangee({ passage: { tache: t, periode, etat, coche }, refs, colonnes }: { passage: Passage; refs: References; colonnes: Colonnes }) {
  const ecriture = useEcriture()
  const basculer = useBasculer()
  const ouvrir = useOuvrirFiche()
  const ouvrirFiche = () => ouvrir({ tache: t, periode })
  const entreprise = t.entreprise_id ? refs.entreprise.get(t.entreprise_id) : null
  const projet = t.projet_id ? refs.projet.get(t.projet_id) : null
  const responsable = t.responsable_id ? refs.responsable.get(t.responsable_id) : null
  const fournisseur = t.fournisseur_id ? refs.fournisseur.get(t.fournisseur_id) : null
  const finie = etat === 'faite' || etat === 'sautee'
  const annuelle = estAnnuelle(t)
  const secondaire = finie ? 'text-pierre-400' : 'text-pierre-600'

  return (
    <tr className="align-top hover:bg-pierre-50/60">
      <td className="px-3 py-2">
        <CaseCoche etat={etat} basculer={() => basculer(t, periode, coche, 'faite')} desactivee={!ecriture} />
      </td>
      <td className="px-2 py-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <button
            type="button"
            className={`text-left hover:underline ${finie ? 'text-pierre-500 line-through decoration-pierre-300' : 'text-pierre-900 decoration-pierre-300'}`}
            onClick={ouvrirFiche}
          >
            {t.titre}
          </button>
          {etat === 'sautee' && <Puce>Pas cette année</Puce>}
          {!annuelle && t.echeance && <Puce ton={etat === 'retard' ? 'retard' : undefined}>{etat === 'retard' ? 'En retard · ' : ''}{dateCourte(t.echeance)}</Puce>}
          {!annuelle && t.priorite && <Puce>{PRIORITES[t.priorite]}</Puce>}
          <PucesEtiquettes tache={t} refs={refs} />
          {t.note && (
            <span className="text-xs text-pierre-400" title={t.note}>
              📝
            </span>
          )}
          <CompteurPieces pieces={refs.fichiers.get(t.id)} className="text-xs text-pierre-400" />
        </div>
        {coche?.note && (
          <button type="button" className="mt-1 block whitespace-pre-line text-left text-xs italic text-pierre-500" onClick={ouvrirFiche}>
            {coche.note}
          </button>
        )}
      </td>
      {colonnes.mois && (
        <td className="px-2 py-2">{annuelle && <Puce ton={etat === 'retard' ? 'retard' : undefined}>{moisCourt(periode)}</Puce>}</td>
      )}
      {colonnes.entreprise && (
        <td className={`px-2 py-2 ${secondaire}`}>
          {entreprise && <PuceCompagnie compagnie={entreprise} className="font-normal" />}
        </td>
      )}
      {colonnes.projet && (
        <td className={`px-2 py-2 ${secondaire}`}>
          {projet && (
            <span className="flex items-center gap-1.5">
              <Pastille couleur={projet.couleur} />
              <span className="truncate">{projet.nom}</span>
            </span>
          )}
        </td>
      )}
      <td className="px-2 py-1.5">
        {ecriture ? <ChoixResponsable tache={t} refs={refs} /> : <span className={secondaire}>{responsable?.nom}</span>}
      </td>
      <td className={`px-2 py-2 ${secondaire}`}>
        <span className="block truncate" title={fournisseur?.nom}>
          {fournisseur?.nom}
        </span>
      </td>
    </tr>
  )
}
