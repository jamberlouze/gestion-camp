import { ChampTexte } from '@/lib/ChampTexte'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { libelleJour, portionsSortie, repasSortie } from './calcul'
import { nouvelId, useEnregistrerSortie, useParametresPlan, useSupprimerSortie, useTable } from './donnees'
import { MODELES_SORTIE, REPAS, type GroupeSortie, type ModeleSortie, type Sortie } from './types'

/**
 * Groupes hors camp (ex. camping) : leurs portions sont retirées des repas
 * réguliers manqués et un repas de glacière est ajouté à la commande.
 */
export function Sorties() {
  const { peutEcrire } = useAuth()
  const ecriture = peutEcrire('commande')
  const sorties = useTable('sorties').data ?? []
  const groupes = useTable('groupes_repas').data ?? []
  const enregistrer = useEnregistrerSortie()

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-pierre-500">
          Les portions indiquées sont retirées des repas manqués et ajoutées au repas de glacière.
        </p>
        {ecriture && (
          <button
            className={ui.bouton}
            disabled={groupes.length === 0}
            onClick={() =>
              enregistrer.mutate({
                id: nouvelId('s'),
                nom: '',
                jour_depart: 0,
                pattern: 'souper_dejeuner',
                groupes: groupes[0] ? [{ groupId: groupes[0].id, portions: 1 }] : [],
                glaciere_id: null,
                created_at: new Date().toISOString(),
              })
            }
          >
            + Ajouter une sortie
          </button>
        )}
      </div>
      {sorties.length === 0 ? (
        <p className={`${ui.carte} mt-4 p-8 text-center text-sm text-pierre-500`}>Aucune sortie planifiée.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {sorties.map((s) => (
            <CarteSortie key={s.id} sortie={s} ecriture={ecriture} />
          ))}
        </ul>
      )}
    </div>
  )
}

function CarteSortie({ sortie: s, ecriture }: { sortie: Sortie; ecriture: boolean }) {
  const recettes = useTable('recettes').data ?? []
  const groupes = useTable('groupes_repas').data ?? []
  const plan = useParametresPlan()
  const enregistrer = useEnregistrerSortie()
  const supprimer = useSupprimerSortie()
  const maj = (champs: Partial<Sortie>) => enregistrer.mutate({ ...s, ...champs })
  const majGroupe = (i: number, champs: Partial<GroupeSortie>) =>
    maj({ groupes: s.groupes.map((g, n) => (n === i ? { ...g, ...champs } : g)) })

  const total = portionsSortie(s)
  const glaciere = recettes.find((r) => r.id === s.glaciere_id)
  const repas = repasSortie(s)
    .map((r) => `${REPAS.find((x) => x.id === r.meal)!.libelle} (${libelleJour(r.day, plan.debut)})`)
    .join(', ')
  const choix = 'rounded-lg border border-pierre-300 bg-white px-2.5 py-1.5 text-sm'

  return (
    <li className={`${ui.carte} p-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <ChampTexte
          aria-label="Nom de la sortie"
          placeholder="Nom de la sortie (ex. Groupe Faucons)"
          disabled={!ecriture}
          className={`${choix} min-w-48 flex-1 font-semibold`}
          valeur={s.nom ?? ''}
          enregistrer={(nom) => maj({ nom })}
        />
        <select
          aria-label="Jour de départ"
          disabled={!ecriture}
          className={choix}
          value={s.jour_depart}
          onChange={(e) => maj({ jour_depart: Number(e.target.value) })}
        >
          {Array.from({ length: plan.jours }, (_, i) => (
            <option key={i} value={i}>
              Départ : {libelleJour(i, plan.debut)}
            </option>
          ))}
        </select>
        {ecriture && (
          <button
            aria-label="Supprimer la sortie"
            className="rounded px-2 py-1 text-red-700 hover:bg-red-50"
            onClick={() => confirm('Supprimer cette sortie ?') && supprimer.mutate(s.id)}
          >
            ✕
          </button>
        )}
      </div>
      <select
        aria-label="Repas manqués"
        disabled={!ecriture}
        className={`${choix} mt-2 w-full`}
        value={s.pattern}
        onChange={(e) => maj({ pattern: e.target.value as ModeleSortie })}
      >
        {MODELES_SORTIE.map((m) => (
          <option key={m.id} value={m.id}>
            {m.libelle}
          </option>
        ))}
      </select>

      <p className={`${ui.etiquette} mt-3`}>Portions retirées</p>
      <ul className="space-y-1.5">
        {s.groupes.map((g, i) => (
          <li key={i} className="flex items-center gap-2 rounded-lg bg-pierre-50 px-2 py-1.5">
            <select
              aria-label="Groupe source"
              disabled={!ecriture}
              className={choix}
              value={g.groupId}
              onChange={(e) => majGroupe(i, { groupId: e.target.value })}
            >
              {groupes.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              aria-label="Portions"
              disabled={!ecriture}
              className="w-20 rounded-lg border border-pierre-300 px-2 py-1.5 text-right text-sm"
              value={g.portions}
              onChange={(e) => majGroupe(i, { portions: Math.max(0, Math.trunc(Number(e.target.value)) || 0) })}
            />
            <span className="text-sm text-pierre-500">portion(s)</span>
            {ecriture && (
              <button
                aria-label="Retirer ce groupe"
                className="ml-auto rounded px-2 py-1 text-red-700 hover:bg-red-50"
                onClick={() => maj({ groupes: s.groupes.filter((_, n) => n !== i) })}
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
      {ecriture && groupes[0] && (
        <button
          className="mt-1.5 text-sm font-medium text-foret-700 hover:underline"
          onClick={() => maj({ groupes: [...s.groupes, { groupId: groupes[0].id, portions: 1 }] })}
        >
          + Ajouter un groupe source
        </button>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-pierre-300 pt-3">
        <span className="text-sm text-pierre-500">Repas de glacière :</span>
        <select
          aria-label="Repas de glacière"
          disabled={!ecriture}
          className={`${choix} min-w-48 flex-1`}
          value={s.glaciere_id ?? ''}
          onChange={(e) => maj({ glaciere_id: e.target.value || null })}
        >
          <option value="">Choisir une recette…</option>
          {[...recettes]
            .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </select>
        <span className="text-sm font-semibold">= {portions(total)}</span>
      </div>
      <p className="mt-2 text-sm italic text-pierre-500">
        → {portions(total)} retirée{total > 1 ? 's' : ''} de {repas}
        {glaciere ? `, ajoutées à la glacière (${glaciere.name})` : ''}.
      </p>
    </li>
  )
}

const portions = (n: number) => `${n} portion${n > 1 ? 's' : ''}`
