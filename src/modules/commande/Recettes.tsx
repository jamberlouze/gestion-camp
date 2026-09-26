import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Dialogue } from '@/lib/Dialogue'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import {
  nouvelId,
  useEnregistrerConsommable,
  useEnregistrerRecette,
  useSupprimerConsommable,
  useSupprimerRecette,
  useTable,
} from './donnees'
import {
  CATEGORIES,
  ICONES_CATEGORIE,
  MAGASINS,
  PORTEES,
  UNITES,
  type Consommable,
  type IngredientRecette,
  type Magasin,
  type Portee,
  type Produit,
  type Recette,
  type Unite,
} from './types'

export function Recettes() {
  const { peutEcrire } = useAuth()
  const ecriture = peutEcrire('commande')
  const recettes = useTable('recettes')
  const consommables = useTable('consommables')
  const [choisie, setChoisie] = useState<string | null>(null)
  const [edition, setEdition] = useState<Recette | null>(null)
  const [editionConso, setEditionConso] = useState<Consommable | null>(null)

  if (!recettes.data || !consommables.data) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const recette = recettes.data.find((r) => r.id === choisie)
  const nouvelle = (cat: string): Recette => ({ id: '', name: '', cat, has_veg: false, ingredients: [], deleted_at: null })

  return (
    <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
      <aside className="space-y-4">
        {CATEGORIES.map((cat) => {
          const liste = recettes.data
            .filter((r) => r.cat === cat)
            .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
          return (
            <section key={cat}>
              <div className="mb-1.5 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-pierre-700">
                  {ICONES_CATEGORIE[cat]} {cat}
                </h2>
                {ecriture && (
                  <button className="text-sm font-medium text-foret-700 hover:underline" onClick={() => setEdition(nouvelle(cat))}>
                    + Ajouter
                  </button>
                )}
              </div>
              {liste.length === 0 && <p className="text-xs text-pierre-300">Aucune recette</p>}
              <ul className="space-y-1">
                {liste.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => setChoisie(r.id)}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                        r.id === choisie ? 'border-foret-600 bg-foret-50' : 'border-pierre-200 bg-white hover:border-pierre-300'
                      }`}
                    >
                      <span className="flex-1 font-medium">{r.name}</span>
                      {r.has_veg && <Pastille>végé</Pastille>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}

        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-pierre-700">📦 Consommables</h2>
            {ecriture && (
              <button
                className="text-sm font-medium text-foret-700 hover:underline"
                onClick={() =>
                  setEditionConso({ id: '', name: '', prod_id: '', prod_name: '', pkg: '', store: 'colabor', deleted_at: null })
                }
              >
                + Ajouter
              </button>
            )}
          </div>
          <ul className="space-y-1">
            {consommables.data.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-lg border border-pierre-200 bg-white px-3 py-2 text-sm">
                <span className="flex-1">
                  <span className="font-medium">{c.name}</span>
                  <span className="block text-xs text-pierre-500">
                    #{c.prod_id} · {c.pkg}
                  </span>
                </span>
                {ecriture && (
                  <button className="text-sm text-foret-700 hover:underline" onClick={() => setEditionConso(c)}>
                    Modifier
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <div className="lg:sticky lg:top-20 lg:self-start">
        {recette ? (
          <DetailRecette recette={recette} modifier={ecriture ? () => setEdition(recette) : undefined} />
        ) : (
          <p className={`${ui.carte} p-10 text-center text-sm text-pierre-500`}>
            Choisissez une recette pour voir ses ingrédients.
          </p>
        )}
      </div>

      {edition && (
        <DialogueRecette
          // Clé : après « Dupliquer », la fenêtre repart sur la copie.
          key={edition.id || 'nouvelle'}
          recette={edition}
          fermer={() => setEdition(null)}
          apresEnregistrement={(id) => setChoisie(id)}
          dupliquer={(copie) => setEdition(copie)}
        />
      )}
      {editionConso && <DialogueConsommable consommable={editionConso} fermer={() => setEditionConso(null)} />}
    </div>
  )
}

function Pastille({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-foret-100 px-2 py-0.5 text-xs text-foret-800">{children}</span>
}

function BadgeMagasin({ store }: { store: Magasin }) {
  if (store === 'colabor') return null
  return (
    <span className="ml-1.5 rounded bg-pierre-100 px-1.5 py-0.5 text-xs text-pierre-700">
      {MAGASINS.find((m) => m.id === store)?.libelle}
    </span>
  )
}

const libelleUnite = (u: Unite) => UNITES.find((x) => x.id === u)?.libelle ?? u

function DetailRecette({ recette, modifier }: { recette: Recette; modifier?: () => void }) {
  return (
    <div className={`${ui.carte} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-pierre-500">
            {ICONES_CATEGORIE[recette.cat]} {recette.cat}
          </p>
          <h2 className="mt-0.5 text-xl font-semibold">
            {recette.name} {recette.has_veg && <Pastille>🌱 option végé</Pastille>}
          </h2>
        </div>
        {modifier && (
          <button className={ui.bouton} onClick={modifier}>
            Modifier
          </button>
        )}
      </div>
      <h3 className="mb-2 mt-5 text-sm font-semibold text-pierre-700">Ingrédients — quantités par portion</h3>
      {recette.ingredients.length === 0 ? (
        <p className="text-sm text-pierre-500">Aucun ingrédient.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-pierre-200 text-left text-pierre-500">
              <tr>
                <th className="py-2 pr-3 font-medium"># Produit</th>
                <th className="py-2 pr-3 font-medium">Nom</th>
                <th className="py-2 pr-3 text-right font-medium">Qté / portion</th>
                <th className="py-2 pr-3 text-right font-medium">Taille de caisse</th>
                <th className="py-2 font-medium">Portée</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pierre-100">
              {recette.ingredients.map((i, n) => (
                <tr key={`${i.id}-${n}`}>
                  <td className="py-1.5 pr-3 tabular-nums text-pierre-500">{i.id}</td>
                  <td className="py-1.5 pr-3">
                    {i.name}
                    <BadgeMagasin store={i.store} />
                  </td>
                  <td className="py-1.5 pr-3 text-right font-medium tabular-nums">
                    {i.qty} {libelleUnite(i.unit)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-pierre-500">
                    {i.caseQty ?? '—'} {libelleUnite(i.unit)}
                  </td>
                  <td className="py-1.5 text-pierre-700">{PORTEES.find((p) => p.id === i.scope)?.libelle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------
// Modification d'une recette
// ------------------------------------------------------------------

type LigneEdition = Omit<IngredientRecette, 'qty' | 'caseQty'> & { cle: string; qty: string; caseQty: string }

const versLigne = (i?: IngredientRecette): LigneEdition => ({
  cle: crypto.randomUUID(),
  id: i?.id ?? '',
  name: i?.name ?? '',
  pkg: i?.pkg ?? '',
  qty: i?.qty != null ? String(i.qty) : '',
  unit: i?.unit ?? 'g',
  caseQty: i?.caseQty != null ? String(i.caseQty) : '',
  store: i?.store ?? 'colabor',
  scope: i?.scope ?? 'all',
})

function DialogueRecette({
  recette,
  fermer,
  apresEnregistrement,
  dupliquer,
}: {
  recette: Recette
  fermer: () => void
  apresEnregistrement: (id: string) => void
  dupliquer: (copie: Recette) => void
}) {
  const enregistrer = useEnregistrerRecette()
  const supprimer = useSupprimerRecette()
  const banque = useTable('banque_ingredients').data ?? []
  const [nom, setNom] = useState(recette.name)
  const [cat, setCat] = useState(recette.cat)
  const [vege, setVege] = useState(recette.has_veg)
  const [lignes, setLignes] = useState<LigneEdition[]>(recette.ingredients.map(versLigne))
  const existante = !!recette.id

  const majLigne = (cle: string, champs: Partial<LigneEdition>) =>
    setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, ...champs } : l)))

  // Comme avant : seules les lignes avec #, nom et quantité sont gardées.
  const completes = lignes.filter((l) => l.id.trim() && l.name.trim() && Number(l.qty) > 0)
  const incompletes = lignes.length - completes.length

  function construire(): Recette {
    return {
      id: recette.id || nouvelId('r'),
      name: nom.trim(),
      cat,
      has_veg: vege,
      deleted_at: null,
      ingredients: completes.map((l) => ({
        id: l.id.trim(),
        name: l.name.trim(),
        pkg: l.pkg ?? '',
        qty: Number(l.qty),
        unit: l.unit,
        caseQty: l.caseQty === '' ? null : Number(l.caseQty),
        store: l.store,
        scope: l.scope,
      })),
    }
  }

  function soumettre(e: FormEvent) {
    e.preventDefault()
    const r = construire()
    enregistrer.mutate(r)
    apresEnregistrement(r.id)
    fermer()
  }

  function copier() {
    const copie = { ...construire(), id: nouvelId('r'), name: `Copie — ${nom.trim()}` }
    enregistrer.mutate(copie)
    apresEnregistrement(copie.id)
    dupliquer(copie)
  }

  const cellule = 'rounded-md border border-pierre-300 px-2 py-1.5 text-sm w-full'

  return (
    <Dialogue titre={existante ? 'Modifier la recette' : 'Nouvelle recette'} fermer={fermer} large>
      <form onSubmit={soumettre} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
          <div>
            <label className={ui.etiquette} htmlFor="r-nom">
              Nom
            </label>
            <input id="r-nom" required className={ui.champ} value={nom} onChange={(e) => setNom(e.target.value)} />
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="r-cat">
              Catégorie
            </label>
            <select id="r-cat" className={ui.champ} value={cat} onChange={(e) => setCat(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-foret-700" checked={vege} onChange={(e) => setVege(e.target.checked)} />
            Option végé
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-pierre-500">
              <tr>
                <th className="w-24 pb-1 pr-2 font-medium"># Produit</th>
                <th className="pb-1 pr-2 font-medium">Nom (chercher par nom ou #)</th>
                <th className="w-24 pb-1 pr-2 font-medium">Qté/portion</th>
                <th className="w-24 pb-1 pr-2 font-medium">Unité</th>
                <th className="w-24 pb-1 pr-2 font-medium">Caisse</th>
                <th className="w-28 pb-1 pr-2 font-medium">Portée</th>
                <th className="w-28 pb-1 pr-2 font-medium">Source</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.cle}>
                  <td className="py-1 pr-2">
                    <input aria-label="# produit" className={cellule} value={l.id} onChange={(e) => majLigne(l.cle, { id: e.target.value })} />
                  </td>
                  <td className="py-1 pr-2">
                    <RechercheProduit
                      valeur={l.name}
                      banque={banque}
                      onSaisie={(name) => majLigne(l.cle, { name })}
                      onChoix={(p) =>
                        majLigne(l.cle, {
                          id: p.id,
                          name: p.name,
                          pkg: p.pkg ?? '',
                          unit: p.unit,
                          store: p.store,
                          ...(p.case_qty != null ? { caseQty: String(p.case_qty) } : {}),
                        })
                      }
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      aria-label="Quantité par portion"
                      type="number"
                      step="any"
                      min="0"
                      className={cellule}
                      value={l.qty}
                      onChange={(e) => majLigne(l.cle, { qty: e.target.value })}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <select aria-label="Unité" className={cellule} value={l.unit} onChange={(e) => majLigne(l.cle, { unit: e.target.value as Unite })}>
                      {UNITES.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.libelle}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      aria-label="Taille de caisse"
                      type="number"
                      step="any"
                      min="0"
                      className={cellule}
                      value={l.caseQty}
                      onChange={(e) => majLigne(l.cle, { caseQty: e.target.value })}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <select aria-label="Portée" className={cellule} value={l.scope} onChange={(e) => majLigne(l.cle, { scope: e.target.value as Portee })}>
                      {PORTEES.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.libelle}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <select aria-label="Source" className={cellule} value={l.store} onChange={(e) => majLigne(l.cle, { store: e.target.value as Magasin })}>
                      {MAGASINS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.libelle}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1">
                    <button
                      type="button"
                      aria-label="Retirer l'ingrédient"
                      className="rounded px-2 py-1 text-red-700 hover:bg-red-50"
                      onClick={() => setLignes((ls) => ls.filter((x) => x.cle !== l.cle))}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={ui.boutonSecondaire} onClick={() => setLignes((ls) => [...ls, versLigne()])}>
            + Ajouter un ingrédient
          </button>
          {incompletes > 0 && (
            <span className="text-xs text-pierre-500">
              {incompletes} ligne(s) incomplète(s) (#, nom ou quantité manquant) ne seront pas enregistrées.
            </span>
          )}
        </div>
        <p className="text-xs text-pierre-500">
          Les ingrédients sont aussi ajoutés ou mis à jour dans la banque d'ingrédients.
        </p>

        <div className="flex flex-wrap justify-between gap-2 border-t border-pierre-100 pt-4">
          <div className="flex gap-2">
            {existante && (
              <>
                <button
                  type="button"
                  className={ui.boutonDanger}
                  onClick={() => {
                    if (confirm(`Supprimer la recette « ${recette.name} » ?`)) {
                      supprimer.mutate(recette.id)
                      fermer()
                    }
                  }}
                >
                  Supprimer
                </button>
                <button type="button" className={ui.boutonSecondaire} onClick={copier} disabled={!nom.trim()}>
                  Dupliquer
                </button>
              </>
            )}
          </div>
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

/**
 * Champ de nom avec suggestions tirées de la banque (par nom ou # produit).
 * La liste est en position fixe : le tableau défilant de la fenêtre la
 * couperait sinon.
 */
function RechercheProduit({
  valeur,
  banque,
  onSaisie,
  onChoix,
}: {
  valeur: string
  banque: Produit[]
  onSaisie: (v: string) => void
  onChoix: (p: Produit) => void
}) {
  const [zone, setZone] = useState<DOMRect | null>(null)
  const champ = useRef<HTMLInputElement>(null)
  const ouvrir = () => champ.current && setZone(champ.current.getBoundingClientRect())

  // Au défilement, la liste ne suivrait plus le champ : on la ferme.
  useEffect(() => {
    if (!zone) return
    const fermer = () => setZone(null)
    window.addEventListener('scroll', fermer, true)
    window.addEventListener('resize', fermer)
    return () => {
      window.removeEventListener('scroll', fermer, true)
      window.removeEventListener('resize', fermer)
    }
  }, [zone])

  const q = valeur.trim().toLowerCase()
  const suggestions = q
    ? banque.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)).slice(0, 8)
    : []
  return (
    <>
      <input
        ref={champ}
        aria-label="Nom de l'ingrédient"
        autoComplete="off"
        className="w-full rounded-md border border-pierre-300 px-2 py-1.5 text-sm"
        value={valeur}
        onChange={(e) => {
          onSaisie(e.target.value)
          ouvrir()
        }}
        onFocus={ouvrir}
        onBlur={() => setZone(null)}
      />
      {zone && suggestions.length > 0 && (
        <ul
          className="fixed z-40 max-h-56 overflow-y-auto rounded-b-lg border border-pierre-200 bg-white shadow-lg"
          style={{ top: zone.bottom, left: zone.left, width: Math.max(zone.width, 320) }}
        >
          {suggestions.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-foret-50"
                // mousedown : avant que le champ perde le focus et ferme la liste.
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChoix(p)
                  setZone(null)
                }}
              >
                <span className="font-medium">{p.name}</span>
                <span className="ml-2 text-xs text-pierre-500">
                  #{p.id}
                  {p.case_qty != null ? ` · ${p.case_qty} ${p.unit}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// ------------------------------------------------------------------
// Consommables (ketchup, moutarde… commandés à la caisse)
// ------------------------------------------------------------------

function DialogueConsommable({ consommable, fermer }: { consommable: Consommable; fermer: () => void }) {
  const enregistrer = useEnregistrerConsommable()
  const supprimer = useSupprimerConsommable()
  const [c, setC] = useState(consommable)
  const maj = (champs: Partial<Consommable>) => setC((x) => ({ ...x, ...champs }))

  function soumettre(e: FormEvent) {
    e.preventDefault()
    enregistrer.mutate({
      ...c,
      id: c.id || nouvelId('cons'),
      name: c.name.trim(),
      prod_id: c.prod_id?.trim() || null,
      prod_name: c.prod_name?.trim() || null,
      pkg: c.pkg?.trim() || null,
    })
    fermer()
  }

  return (
    <Dialogue titre={consommable.id ? 'Modifier le consommable' : 'Nouveau consommable'} fermer={fermer}>
      <form onSubmit={soumettre} className="space-y-3">
        <div>
          <label className={ui.etiquette} htmlFor="c-nom">
            Nom
          </label>
          <input id="c-nom" required className={ui.champ} value={c.name} onChange={(e) => maj({ name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={ui.etiquette} htmlFor="c-num">
              # Produit
            </label>
            <input id="c-num" required className={ui.champ} value={c.prod_id ?? ''} onChange={(e) => maj({ prod_id: e.target.value })} />
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="c-source">
              Source
            </label>
            <select id="c-source" className={ui.champ} value={c.store} onChange={(e) => maj({ store: e.target.value as Magasin })}>
              {MAGASINS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.libelle}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="c-prod">
            Nom du produit (fournisseur)
          </label>
          <input id="c-prod" className={ui.champ} value={c.prod_name ?? ''} onChange={(e) => maj({ prod_name: e.target.value })} />
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="c-pkg">
            Empaquetage
          </label>
          <input id="c-pkg" placeholder="ex. 4X4L" className={ui.champ} value={c.pkg ?? ''} onChange={(e) => maj({ pkg: e.target.value })} />
        </div>
        <div className="flex justify-between gap-2 pt-2">
          {consommable.id ? (
            <button
              type="button"
              className={ui.boutonDanger}
              onClick={() => {
                if (confirm(`Supprimer « ${consommable.name} » ?`)) {
                  supprimer.mutate(consommable.id)
                  fermer()
                }
              }}
            >
              Supprimer
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
