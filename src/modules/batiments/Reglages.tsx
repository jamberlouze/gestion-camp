import { useState } from 'react'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { IconeChevron, IconeCorbeille, IconePlus } from '@/lib/icones'
import { SaisieNom } from '@/lib/SaisieNom'
import { ui } from '@/lib/ui'
import { enregistrerListe, ordonner, supprimerBatiment, supprimerPanneau, useRelire, type Donnees } from './donnees'

/** Bâtiments et panneaux (en ligne) : ajouter, renommer, ordonner, retirer. */
export function Reglages({ d, ecriture }: { d: Donnees; ecriture: boolean }) {
  if (!ecriture) return <p className="py-8 text-center text-sm text-pierre-500">Les réglages sont faits par qui modifie le module.</p>
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Liste
        table="batiments"
        titre="Bâtiments"
        ajout="Ajouter un bâtiment"
        lignes={d.batiments}
        detail={(id) => {
          const n = d.panneaux.filter((p) => p.batiment_id === id).length + d.valves.filter((v) => v.batiment_id === id).length
          return n ? String(n) : ''
        }}
        retirer={async (l) => {
          const n = d.panneaux.filter((p) => p.batiment_id === l.id).length + d.valves.filter((v) => v.batiment_id === l.id).length
          if (!(await confirmer({ titre: `Retirer « ${l.nom} » ?`, message: n ? `Ses ${n} panneau(x) et valve(s) passeront « sans bâtiment ». Ils ne sont pas supprimés.` : undefined, libelleOk: 'Retirer' }))) return false
          await supprimerBatiment(l.id)
          return true
        }}
      />
      <Liste
        table="panneaux"
        titre="Panneaux électriques"
        ajout="Ajouter un panneau"
        lignes={d.panneaux}
        detail={(id) => {
          const n = d.duPanneau(id).length
          return n ? String(n) : ''
        }}
        batiments={d}
        retirer={async (l) => {
          const n = d.duPanneau(l.id).length
          if (
            !(await confirmer({
              titre: `Supprimer le panneau ${l.nom} ?`,
              message: n ? `Ses ${n} disjoncteur(s), ce qu’ils alimentent et ses photos seront effacés.` : 'Ses photos seront effacées.',
              libelleOk: 'Supprimer',
              danger: true,
            }))
          )
            return false
          await supprimerPanneau(l.id)
          return true
        }}
      />
      <p className="text-sm text-pierre-500 lg:col-span-2">
        Le nom d’un panneau précède le numéro de ses disjoncteurs (A → A #13-2). Où il est, son nombre d’emplacements et ses photos se règlent dans l’onglet Disjoncteurs (Modifier).
      </p>
    </div>
  )
}

interface LigneListe {
  id: string
  nom: string
  ordre: number
  batiment_id?: string | null
}

function Liste({
  table,
  titre,
  ajout,
  lignes,
  detail,
  retirer,
  batiments,
}: {
  table: 'batiments' | 'panneaux'
  titre: string
  ajout: string
  lignes: LigneListe[]
  /** Petit nombre à droite (panneaux et valves, disjoncteurs). */
  detail: (id: string) => string
  /** Confirme puis retire ; false = annulé. */
  retirer: (l: LigneListe) => Promise<boolean>
  /** Panneaux : choix du bâtiment. */
  batiments?: Donnees
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
            {batiments && (
              <select
                aria-label={`Bâtiment du panneau ${l.nom}`}
                className="fleche-serree max-w-36 rounded-md border border-pierre-200 bg-white px-1.5 py-1 text-xs text-pierre-700"
                value={l.batiment_id ?? ''}
                onChange={(e) => faire(() => enregistrerListe(table, { id: l.id, batiment_id: e.target.value || null }))}
              >
                <option value="">Sans bâtiment</option>
                {batiments.batiments.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nom}
                  </option>
                ))}
              </select>
            )}
            <span className="w-8 text-right text-xs tabular-nums text-pierre-400">{detail(l.id)}</span>
            <button className="rounded p-1 text-pierre-500 hover:bg-pierre-100 disabled:opacity-30" aria-label="Monter" disabled={i === 0} onClick={() => deplacer(i, -1)}>
              <IconeChevron className="size-4 -rotate-90" />
            </button>
            <button className="rounded p-1 text-pierre-500 hover:bg-pierre-100 disabled:opacity-30" aria-label="Descendre" disabled={i === lignes.length - 1} onClick={() => deplacer(i, 1)}>
              <IconeChevron className="size-4 rotate-90" />
            </button>
            <button
              className="rounded p-1 text-pierre-500 hover:bg-red-50 hover:text-red-700"
              aria-label={`Retirer ${l.nom}`}
              onClick={async () => {
                setErreur(null)
                try {
                  if (await retirer(l)) await relire()
                } catch (e) {
                  setErreur(messageErreur(e))
                }
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
              const probleme = await faire(() => enregistrerListe(table, { nom, ordre: Math.max(0, ...lignes.map((l) => l.ordre)) + 1 }))
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
