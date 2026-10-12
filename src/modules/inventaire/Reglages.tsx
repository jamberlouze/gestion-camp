import { useState } from 'react'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { IconeChevron, IconeCorbeille, IconePlus } from '@/lib/icones'
import { SaisieNom } from '@/lib/SaisieNom'
import { ui } from '@/lib/ui'
import { enregistrerListe, moduleDe, ordonner, supprimerListe, useRelire, type Donnees } from './donnees'
import type { Element, ModuleSection, Section } from './types'

/** Sections et lieux de rangement (en ligne) : ajouter, renommer, ordonner, retirer. */
export function Reglages({ d, ecriture }: { d: Donnees; ecriture: boolean }) {
  if (!ecriture) return <p className="py-8 text-center text-sm text-pierre-500">Les réglages sont faits par qui modifie l'inventaire.</p>
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Liste
        table="sections"
        titre="Sections"
        ajout="Ajouter une section"
        lignes={d.sections}
        nombre={(id) => d.articles.filter((a) => a.section_id === id).length}
        retrait={(n) => `${n} article(s) de cette section passeront « sans section ». Ils ne sont pas supprimés.`}
        avecModule
      />
      <Liste
        table="lieux"
        titre="Lieux de rangement"
        ajout="Ajouter un lieu"
        lignes={d.lieux}
        nombre={(id) => d.articles.filter((a) => a.lieu_id === id).length}
        retrait={(n) => `${n} article(s) rangés à ce lieu passeront « sans lieu ». Ils ne sont pas supprimés.`}
      />
      <p className="text-sm text-pierre-500 lg:col-span-2">
        Une section « Embarcations » s'affiche dans Embarcations › Équipement (VFI, rames, pagaies), avec les droits de ce module. Les compagnies se gèrent dans Référentiel › Compagnies.
      </p>
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
  avecModule,
}: {
  table: 'sections' | 'lieux'
  titre: string
  ajout: string
  lignes: Element[]
  nombre: (id: string) => number
  retrait: (n: number) => string
  /** Sections : choix du module où elles s'affichent. */
  avecModule?: boolean
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
              enregistrer={(nom) => faire(() => enregistrerListe(table, { id: l.id, nom }))}
            />
            {avecModule && (
              <select
                aria-label={`Module de la section ${l.nom}`}
                className="fleche-serree rounded-md border border-pierre-200 bg-white px-1.5 py-1 text-xs text-pierre-700"
                value={moduleDe(l as Section)}
                onChange={(e) => faire(() => enregistrerListe(table, { id: l.id, module: e.target.value as ModuleSection }))}
              >
                <option value="inventaire">Inventaire</option>
                <option value="embarcations">Embarcations</option>
              </select>
            )}
            <span className="w-8 text-right text-xs tabular-nums text-pierre-400" title="Articles">
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
              const probleme = await faire(() => enregistrerListe(table, { nom, ordre: lignes.length + 1 }))
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
