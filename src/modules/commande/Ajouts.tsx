import { useState, type FormEvent } from 'react'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useMenu } from './contexte'
import { useAjoutConsommable, useAjouterRecette, useRetirerAjoutRecette, useTable, useTableMenu } from './donnees'
import { CATEGORIES } from './types'

/** Articles ajoutés à la main à la commande du menu ouvert, en plus du planificateur. */
export function Ajouts() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Consommables />
      <RecettesAjoutees />
    </div>
  )
}

/** Pas encore chargé (ou lecture impossible) : rien d'affiché ni de modifiable. */
function Attente({ erreur }: { erreur: unknown }) {
  return erreur ? (
    <p className={`${ui.erreur} mt-3`}>{messageErreur(erreur)}</p>
  ) : (
    <p className="mt-3 text-sm text-pierre-500">Chargement…</p>
  )
}

function Consommables() {
  const { menu, ecriture } = useMenu()
  const requeteConsommables = useTable('consommables')
  const requeteAjouts = useTableMenu('ajouts_consommables', menu.id)
  const ajouter = useAjoutConsommable()
  const consommables = requeteConsommables.data
  const ajouts = requeteAjouts.data
  const entete = (
    <>
      <h2 className="font-semibold">Consommables</h2>
      <p className="mt-0.5 text-sm text-pierre-500">Commandés à la caisse, directement dans la commande Colabor de ce menu.</p>
    </>
  )
  // Quantités du menu pas encore lues : afficher 0 inviterait à écraser les vraies.
  if (!consommables || !ajouts) {
    return (
      <section className={`${ui.carte} p-5`}>
        {entete}
        <Attente erreur={requeteConsommables.error ?? requeteAjouts.error} />
      </section>
    )
  }
  const quantite = (id: string) => ajouts.find((a) => a.cons_id === id)?.qty ?? 0

  return (
    <section className={`${ui.carte} p-5`}>
      {entete}
      {consommables.length === 0 && <p className="mt-3 text-sm text-pierre-500">Aucun consommable défini (onglet Recettes).</p>}
      <ul className="mt-3 space-y-2">
        {consommables.map((c) => {
          const qty = quantite(c.id)
          return (
            <li
              key={c.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${qty > 0 ? 'border-foret-600 bg-foret-50' : 'border-pierre-200'}`}
            >
              <input
                type="checkbox"
                aria-label={`Ajouter ${c.name}`}
                disabled={!ecriture}
                className="h-4 w-4 accent-foret-700"
                checked={qty > 0}
                onChange={(e) => ajouter.mutate({ menu_id: menu.id, cons_id: c.id, qty: e.target.checked ? Math.max(qty, 1) : 0 })}
              />
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{c.name}</span>
                <span className="block text-xs text-pierre-500">
                  #{c.prod_id} · {c.pkg}
                </span>
              </span>
              <input
                type="number"
                min={0}
                aria-label={`Caisses de ${c.name}`}
                disabled={!ecriture}
                className="w-16 rounded border border-pierre-300 px-1.5 py-1 text-right text-sm font-semibold tabular-nums"
                value={qty}
                onChange={(e) =>
                  ajouter.mutate({ menu_id: menu.id, cons_id: c.id, qty: Math.max(0, Math.trunc(Number(e.target.value)) || 0) })
                }
              />
              <span className="text-xs text-pierre-500">caisse(s)</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function RecettesAjoutees() {
  const { menu, ecriture } = useMenu()
  const requeteRecettes = useTable('recettes')
  const requeteAjouts = useTableMenu('ajouts_recettes', menu.id)
  const recettes = requeteRecettes.data ?? []
  const ajouts = requeteAjouts.data
  const ajouter = useAjouterRecette()
  const retirer = useRetirerAjoutRecette()
  const [recetteId, setRecetteId] = useState('')
  const [portions, setPortions] = useState('1')
  const [vege, setVege] = useState('0')
  const choisie = recettes.find((r) => r.id === recetteId)

  function soumettre(e: FormEvent) {
    e.preventDefault()
    const p = Math.trunc(Number(portions)) || 0
    if (!recetteId || p <= 0) return
    ajouter.mutate({
      menu_id: menu.id,
      recipe_id: recetteId,
      portions: p,
      veg: choisie?.has_veg ? Math.min(p, Math.max(0, Math.trunc(Number(vege)) || 0)) : 0,
    })
    setRecetteId('')
    setPortions('1')
    setVege('0')
  }

  return (
    <section className={`${ui.carte} p-5`}>
      <h2 className="font-semibold">Recettes</h2>
      <p className="mt-0.5 text-sm text-pierre-500">Portions supplémentaires hors planificateur, ajoutées à la commande de ce menu.</p>
      {ecriture && (
        <form onSubmit={soumettre} className="mt-3 grid gap-2 sm:grid-cols-[1fr_6rem_6rem_auto] sm:items-end">
          <div>
            <label className={ui.etiquette} htmlFor="aj-recette">
              Recette
            </label>
            <select id="aj-recette" className={ui.champ} value={recetteId} onChange={(e) => setRecetteId(e.target.value)}>
              <option value="">Choisir…</option>
              {CATEGORIES.map((cat) => (
                <optgroup key={cat} label={cat}>
                  {recettes
                    .filter((r) => r.cat === cat)
                    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="aj-portions">
              Portions
            </label>
            <input id="aj-portions" type="number" min={1} className={ui.champ} value={portions} onChange={(e) => setPortions(e.target.value)} />
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="aj-vege">
              Dont végé
            </label>
            <input
              id="aj-vege"
              type="number"
              min={0}
              disabled={!choisie?.has_veg}
              title={choisie && !choisie.has_veg ? 'Cette recette n’a pas d’option végé' : undefined}
              className={ui.champ}
              value={choisie?.has_veg ? vege : '0'}
              onChange={(e) => setVege(e.target.value)}
            />
          </div>
          <button className={ui.bouton} disabled={!recetteId}>
            Ajouter
          </button>
        </form>
      )}
      {!ajouts || !requeteRecettes.data ? (
        <Attente erreur={requeteRecettes.error ?? requeteAjouts.error} />
      ) : ajouts.length === 0 ? (
        <p className="mt-4 text-sm text-pierre-500">Aucune recette ajoutée.</p>
      ) : (
        <ul className="mt-4 divide-y divide-pierre-100">
          {ajouts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="flex-1">
                <span className="font-medium">{recettes.find((r) => r.id === a.recipe_id)?.name ?? '(recette supprimée)'}</span>
                <span className="block text-xs text-pierre-500">
                  {a.portions} portions{a.veg ? ` — dont ${a.veg} végé` : ''}
                </span>
              </span>
              {ecriture && a.id > 0 && (
                <button
                  aria-label="Retirer"
                  className="rounded px-2 py-1 text-red-700 hover:bg-red-50"
                  onClick={() => retirer.mutate({ menu_id: menu.id, id: a.id })}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
