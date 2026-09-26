import { useMemo, useState, type FormEvent } from 'react'
import { Dialogue } from '@/lib/Dialogue'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { useEnregistrerProduit, useSupprimerProduit, useTable } from './donnees'
import { MAGASINS, UNITES, type Magasin, type Produit, type Recette, type Unite } from './types'

export function Ingredients() {
  const { peutEcrire } = useAuth()
  const ecriture = peutEcrire('commande')
  const banque = useTable('banque_ingredients')
  const recettes = useTable('recettes')
  const [recherche, setRecherche] = useState('')
  const [edition, setEdition] = useState<Produit | null>(null)

  const utilisations = useMemo(() => {
    const n = new Map<string, Recette[]>()
    recettes.data?.forEach((r) => new Set(r.ingredients.map((i) => i.id)).forEach((id) => n.set(id, [...(n.get(id) ?? []), r])))
    return n
  }, [recettes.data])

  if (!banque.data) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const q = recherche.trim().toLowerCase()
  const numero = (id: string) => Number.parseInt(id) || 99999
  const liste = banque.data
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
    .sort((a, b) => numero(a.id) - numero(b.id))

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Rechercher par nom ou # produit…"
          aria-label="Rechercher un ingrédient"
          className={`${ui.champ} max-w-sm`}
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <span className="text-sm text-pierre-500">
          {liste.length} / {banque.data.length} ingrédients
        </span>
        {ecriture && (
          <button
            className={`${ui.bouton} ml-auto`}
            onClick={() => setEdition({ id: '', name: '', pkg: '', case_qty: null, unit: 'g', store: 'colabor' })}
          >
            + Nouvel ingrédient
          </button>
        )}
      </div>

      <div className={`${ui.carte} mt-3 overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="border-b border-pierre-200 bg-pierre-50 text-left text-pierre-500">
            <tr>
              <th className="px-3 py-2 font-medium"># Produit</th>
              <th className="px-3 py-2 font-medium">Nom</th>
              <th className="px-3 py-2 font-medium">Empaquetage</th>
              <th className="px-3 py-2 text-right font-medium">Qté / caisse</th>
              <th className="px-3 py-2 font-medium">Unité</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 text-right font-medium">Recettes</th>
              {ecriture && <th />}
            </tr>
          </thead>
          <tbody className="divide-y divide-pierre-100">
            {liste.map((p) => (
              <tr key={p.id} className="hover:bg-pierre-50">
                <td className="px-3 py-1.5 tabular-nums text-pierre-500">{p.id}</td>
                <td className="px-3 py-1.5 font-medium">{p.name}</td>
                <td className="px-3 py-1.5 text-pierre-500">{p.pkg || '—'}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {p.case_qty ?? <span className="text-pierre-300">—</span>}
                </td>
                <td className="px-3 py-1.5 text-pierre-500">{p.unit}</td>
                <td className="px-3 py-1.5">{MAGASINS.find((m) => m.id === p.store)?.libelle}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-pierre-500">{utilisations.get(p.id)?.length ?? 0}</td>
                {ecriture && (
                  <td className="px-3 py-1.5 text-right">
                    <button className="text-foret-700 hover:underline" onClick={() => setEdition(p)}>
                      Modifier
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {liste.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-pierre-500">
                  Aucun ingrédient trouvé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {edition && (
        <DialogueProduit
          produit={edition}
          utilisePar={utilisations.get(edition.id) ?? []}
          existants={banque.data}
          fermer={() => setEdition(null)}
        />
      )}
    </div>
  )
}

function DialogueProduit({
  produit,
  utilisePar,
  existants,
  fermer,
}: {
  produit: Produit
  utilisePar: Recette[]
  existants: Produit[]
  fermer: () => void
}) {
  const enregistrer = useEnregistrerProduit()
  const supprimer = useSupprimerProduit()
  const nouveau = !produit.id
  const [p, setP] = useState(produit)
  const [caisse, setCaisse] = useState(produit.case_qty != null ? String(produit.case_qty) : '')
  const [erreur, setErreur] = useState<string | null>(null)
  const maj = (champs: Partial<Produit>) => setP((x) => ({ ...x, ...champs }))

  function soumettre(e: FormEvent) {
    e.preventDefault()
    const id = p.id.trim()
    if (nouveau && existants.some((x) => x.id === id)) return setErreur(`Le produit #${id} existe déjà.`)
    enregistrer.mutate({ ...p, id, name: p.name.trim(), pkg: p.pkg?.trim() ?? '', case_qty: caisse === '' ? null : Number(caisse) })
    fermer()
  }

  return (
    <Dialogue titre={nouveau ? 'Nouvel ingrédient' : "Modifier l'ingrédient"} fermer={fermer}>
      <form onSubmit={soumettre} className="space-y-3">
        <div className="grid grid-cols-[8rem_1fr] gap-3">
          <div>
            <label className={ui.etiquette} htmlFor="p-id">
              # Produit
            </label>
            <input
              id="p-id"
              required
              readOnly={!nouveau}
              placeholder="ex. 3572"
              className={`${ui.champ} ${nouveau ? '' : 'bg-pierre-100'}`}
              value={p.id}
              onChange={(e) => maj({ id: e.target.value })}
            />
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="p-nom">
              Nom du produit
            </label>
            <input id="p-nom" required className={ui.champ} value={p.name} onChange={(e) => maj({ name: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={ui.etiquette} htmlFor="p-pkg">
              Empaquetage
            </label>
            <input id="p-pkg" placeholder="ex. 6X2KG" className={ui.champ} value={p.pkg ?? ''} onChange={(e) => maj({ pkg: e.target.value })} />
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="p-source">
              Source
            </label>
            <select id="p-source" className={ui.champ} value={p.store} onChange={(e) => maj({ store: e.target.value as Magasin })}>
              {MAGASINS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.libelle}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="p-caisse">
              Qté par caisse
            </label>
            <input
              id="p-caisse"
              type="number"
              min="0"
              step="any"
              placeholder="ex. 3000"
              className={ui.champ}
              value={caisse}
              onChange={(e) => setCaisse(e.target.value)}
            />
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="p-unite">
              Unité
            </label>
            <select id="p-unite" className={ui.champ} value={p.unit} onChange={(e) => maj({ unit: e.target.value as Unite })}>
              {UNITES.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.libelle}
                </option>
              ))}
            </select>
          </div>
        </div>
        {utilisePar.length > 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Utilisé dans {utilisePar.length} recette{utilisePar.length > 1 ? 's' : ''} :{' '}
            {utilisePar.map((r) => r.name).join(', ')}. Le nom, l'empaquetage, la taille de caisse et la source y
            seront mis à jour.
          </p>
        )}
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex justify-between gap-2 pt-2">
          {!nouveau ? (
            <button
              type="button"
              className={ui.boutonDanger}
              onClick={() => {
                if (confirm('Retirer cet ingrédient de la banque ?\nLes recettes qui l’utilisent ne sont pas modifiées.')) {
                  supprimer.mutate(produit.id)
                  fermer()
                }
              }}
            >
              Retirer de la banque
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
              Annuler
            </button>
            <button className={ui.bouton}>Enregistrer</button>
          </div>
        </div>
      </form>
    </Dialogue>
  )
}
