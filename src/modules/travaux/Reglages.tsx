import { useState } from 'react'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { IconeChevron, IconeCorbeille, IconePlus } from '@/lib/icones'
import { SaisieNom } from '@/lib/SaisieNom'
import { ui } from '@/lib/ui'
import { enregistrerListe, ordonner, supprimerListe, useRelire, type Donnees } from './donnees'
import { useDroits } from './outils'
import type { Lieu } from './types'

/** Lieux et catégories (direction, en ligne) : ajouter, renommer, ordonner, retirer. */
export function Reglages({ d }: { d: Donnees }) {
  const droits = useDroits()
  if (!droits.trieur) return <p className="py-8 text-center text-sm text-pierre-500">Les réglages sont faits par la direction.</p>
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Liste
        table="lieux"
        titre="Lieux"
        ajout="Ajouter un lieu"
        lignes={d.lieux}
        nombre={(id) => d.taches.filter((t) => t.lieu_id === id).length + d.chantiers.filter((c) => c.lieu_id === id).length}
        retrait={(n) => `${n} tâche(s) ou chantier(s) à ce lieu passeront « sans lieu ». Elles ne sont pas supprimées.`}
      />
      <Liste
        table="categories"
        titre="Catégories"
        ajout="Ajouter une catégorie"
        lignes={d.categories}
        nombre={(id) => d.taches.filter((t) => t.categorie_id === id).length}
        retrait={(n) => `${n} tâche(s) de cette catégorie passeront « sans catégorie ». Elles ne sont pas supprimées.`}
      />
    </div>
  )
}

function Liste({
  table,
  titre,
  ajout,
  lignes,
  nombre,
  retrait,
}: {
  table: 'lieux' | 'categories'
  titre: string
  ajout: string
  lignes: Lieu[]
  nombre: (id: string) => number
  retrait: (n: number) => string
}) {
  const relire = useRelire()
  const [ajouter, setAjouter] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function faire(f: () => Promise<unknown>) {
    setErreur(null)
    try {
      await f()
      await relire()
      return null
    } catch (e) {
      const m = messageErreur(e)
      setErreur(m)
      return m
    }
  }

  const deplacer = (i: number, sens: -1 | 1) => {
    const ids = lignes.map((l) => l.id)
    ;[ids[i], ids[i + sens]] = [ids[i + sens], ids[i]]
    faire(() => ordonner(table, ids))
  }

  return (
    <section className={ui.carte}>
      <div className="flex items-center gap-2 border-b border-pierre-100 px-3 py-2">
        <h2 className="text-sm font-semibold">{titre}</h2>
        <span className="text-xs text-pierre-500">{lignes.length}</span>
      </div>
      <ul className="divide-y divide-pierre-100">
        {lignes.map((l, i) => (
          <li key={l.id} className="flex items-center gap-1.5 px-3 py-1.5">
            <ChampTexte
              aria-label={`Nom : ${l.nom}`}
              className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-sm hover:border-pierre-300 focus:border-foret-600 focus:outline-none"
              valeur={l.nom}
              obligatoire
              enregistrer={(nom) => faire(() => enregistrerListe<Lieu>(table, { id: l.id, nom }))}
            />
            <span className="w-8 text-right text-xs tabular-nums text-pierre-400" title="Tâches">
              {nombre(l.id) || ''}
            </span>
            <button className="rounded p-1 text-pierre-500 hover:bg-pierre-100 disabled:opacity-30" aria-label="Monter" disabled={i === 0} onClick={() => deplacer(i, -1)}>
              <IconeChevron className="size-4 -rotate-90" />
            </button>
            <button
              className="rounded p-1 text-pierre-500 hover:bg-pierre-100 disabled:opacity-30"
              aria-label="Descendre"
              disabled={i === lignes.length - 1}
              onClick={() => deplacer(i, 1)}
            >
              <IconeChevron className="size-4 rotate-90" />
            </button>
            <button
              className="rounded p-1 text-pierre-500 hover:bg-red-50 hover:text-red-700"
              aria-label={`Retirer ${l.nom}`}
              onClick={async () => {
                const n = nombre(l.id)
                if (!(await confirmer({ titre: `Retirer « ${l.nom} » ?`, message: n ? retrait(n) : undefined, libelleOk: 'Retirer' }))) return
                faire(() => supprimerListe(table, l.id))
              }}
            >
              <IconeCorbeille className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="border-t border-pierre-100 px-3 py-2">
        {ajouter ? (
          <SaisieNom
            compact
            placeholder={ajout}
            libelleOk="Ajouter"
            annuler={() => setAjouter(false)}
            valider={async (nom) => {
              const probleme = await faire(() => enregistrerListe<Lieu>(table, { nom, ordre: lignes.length + 1 }))
              if (!probleme) setAjouter(false)
              return probleme
            }}
          />
        ) : (
          <button className="inline-flex items-center gap-1 text-sm font-medium text-foret-700 hover:underline" onClick={() => setAjouter(true)}>
            <IconePlus className="size-4" /> {ajout}
          </button>
        )}
        {erreur && !ajouter && <p className="mt-1 text-xs text-red-700">{erreur}</p>}
      </div>
    </section>
  )
}
