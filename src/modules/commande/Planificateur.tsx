import { useMemo, useState } from 'react'
import { ChampTexte } from '@/lib/ChampTexte'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { libelleJour } from './calcul'
import {
  nouvelId,
  useChargerMenu,
  useEffacerGrille,
  useEnregistrerCellule,
  useEnregistrerGroupe,
  useParametresPlan,
  useParametrerPlan,
  useSauverMenu,
  useSupprimerGroupe,
  useSupprimerMenu,
  useTable,
} from './donnees'
import { AGES, COULEURS_GROUPES, REPAS, type CellulePlan, type GroupeRepas, type Recette, type Repas } from './types'

export function Planificateur() {
  const { peutEcrire } = useAuth()
  const ecriture = peutEcrire('commande')
  const recettes = useTable('recettes')
  const groupes = useTable('groupes_repas')
  const cellules = useTable('plan_cells')
  const plan = useParametresPlan()

  if (!recettes.data || !groupes.data || !cellules.data) {
    return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[16rem_1fr] print:block">
      <aside className="space-y-4 print:hidden">
        <Reglages ecriture={ecriture} />
        <Groupes groupes={groupes.data} ecriture={ecriture} />
        <MenusSauves groupes={groupes.data} cellules={cellules.data} ecriture={ecriture} />
      </aside>
      <section className="min-w-0">
        <h2 className="mb-2 hidden text-lg font-semibold print:block">
          Menu — {plan.jours} jour{plan.jours > 1 ? 's' : ''}
          {plan.debut ? ` à partir du ${libelleJour(0, plan.debut)}` : ''}
        </h2>
        <Grille recettes={recettes.data} groupes={groupes.data} cellules={cellules.data} ecriture={ecriture} />
      </section>
    </div>
  )
}

// ------------------------------------------------------------------
// Barre de côté
// ------------------------------------------------------------------

function Reglages({ ecriture }: { ecriture: boolean }) {
  const plan = useParametresPlan()
  const parametrer = useParametrerPlan()
  const effacer = useEffacerGrille()
  return (
    <div className={`${ui.carte} space-y-3 p-4`}>
      <div className="grid grid-cols-[4.5rem_1fr] gap-3">
        <div>
          <label className={ui.etiquette} htmlFor="pl-jours">
            Jours
          </label>
          <input
            id="pl-jours"
            type="number"
            min={1}
            max={14}
            disabled={!ecriture}
            className={ui.champ}
            value={plan.jours}
            onChange={(e) => {
              const jours = Math.min(14, Math.max(1, Number(e.target.value) || 1))
              parametrer.mutate({ ...plan, jours })
            }}
          />
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="pl-debut">
            Début
          </label>
          <input
            id="pl-debut"
            type="date"
            disabled={!ecriture}
            className={ui.champ}
            value={plan.debut ?? ''}
            onChange={(e) => parametrer.mutate({ ...plan, debut: e.target.value || null })}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button className={`${ui.boutonSecondaire} flex-1`} onClick={() => window.print()}>
          Imprimer le menu
        </button>
        {ecriture && (
          <button
            className={ui.boutonDanger}
            onClick={() => confirm('Effacer tous les repas planifiés ?') && effacer.mutate()}
          >
            Effacer
          </button>
        )}
      </div>
    </div>
  )
}

function Groupes({ groupes, ecriture }: { groupes: GroupeRepas[]; ecriture: boolean }) {
  const enregistrer = useEnregistrerGroupe()
  const supprimer = useSupprimerGroupe()
  const total = groupes.reduce((s, g) => s + g.portions, 0)

  return (
    <div className={`${ui.carte} p-4`}>
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Groupes</h2>
        <span className="text-sm text-pierre-500">{total} portions</span>
      </div>
      <ul className="mt-3 space-y-2">
        {groupes.map((g) => (
          <li key={g.id} className="rounded-lg border border-pierre-200 p-2.5">
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Couleur"
                disabled={!ecriture}
                className="h-6 w-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                value={g.color ?? COULEURS_GROUPES[0]}
                onChange={(e) => enregistrer.mutate({ ...g, color: e.target.value })}
              />
              <ChampTexte
                aria-label="Nom du groupe"
                disabled={!ecriture}
                className="min-w-0 flex-1 rounded border border-transparent px-1.5 py-1 text-sm font-medium hover:border-pierre-300 focus:border-foret-600"
                valeur={g.name}
                obligatoire
                enregistrer={(name) => enregistrer.mutate({ ...g, name })}
              />
              {ecriture && (
                <button
                  aria-label={`Supprimer ${g.name}`}
                  className="rounded px-1.5 text-red-700 hover:bg-red-50 disabled:opacity-30"
                  disabled={groupes.length <= 1}
                  title={groupes.length <= 1 ? 'Au moins un groupe est requis' : undefined}
                  onClick={() => confirm(`Supprimer le groupe « ${g.name} » ?`) && supprimer.mutate(g.id)}
                >
                  ✕
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <select
                aria-label="Âge"
                disabled={!ecriture}
                className="min-w-0 flex-1 rounded border border-pierre-300 px-1.5 py-1 text-sm"
                value={g.age ?? 'Mixtes'}
                onChange={(e) => enregistrer.mutate({ ...g, age: e.target.value })}
              >
                {AGES.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
              <label className="flex shrink-0 items-center gap-1 text-xs text-pierre-500">
                <ChampTexte
                  aria-label="Nombre de portions"
                  type="number"
                  disabled={!ecriture}
                  className="w-14 rounded border border-pierre-300 px-1.5 py-1 text-right text-sm text-pierre-900"
                  valeur={String(g.portions)}
                  obligatoire
                  enregistrer={(v) => enregistrer.mutate({ ...g, portions: Math.max(0, Math.trunc(Number(v)) || 0) })}
                />
                portions
              </label>
            </div>
          </li>
        ))}
      </ul>
      {ecriture && (
        <button
          className={`${ui.boutonSecondaire} mt-3 w-full`}
          onClick={() =>
            enregistrer.mutate({
              id: nouvelId('g'),
              name: `Groupe ${groupes.length + 1}`,
              age: 'Mixtes',
              portions: 40,
              color: COULEURS_GROUPES[groupes.length % COULEURS_GROUPES.length],
            })
          }
        >
          + Ajouter un groupe
        </button>
      )}
    </div>
  )
}

function MenusSauves({ groupes, cellules, ecriture }: { groupes: GroupeRepas[]; cellules: CellulePlan[]; ecriture: boolean }) {
  const menus = useTable('menus_sauves').data ?? []
  const plan = useParametresPlan()
  const sauver = useSauverMenu()
  const charger = useChargerMenu()
  const supprimer = useSupprimerMenu()
  const [nom, setNom] = useState('')

  return (
    <div className={`${ui.carte} p-4`}>
      <h2 className="font-semibold">Menus sauvegardés</h2>
      {ecriture && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!nom.trim()) return
            sauver.mutate({
              id: nouvelId('m'),
              name: nom.trim(),
              saved_at: new Date().toISOString(),
              days: plan.jours,
              groups: groupes,
              cells: Object.fromEntries(cellules.map((c) => [`${c.day}_${c.meal}`, c])),
            })
            setNom('')
          }}
        >
          <input placeholder="Nom du menu…" className={ui.champ} value={nom} onChange={(e) => setNom(e.target.value)} />
          <button className={ui.bouton}>Sauver</button>
        </form>
      )}
      {menus.length === 0 ? (
        <p className="mt-3 text-sm text-pierre-500">Aucun menu sauvegardé.</p>
      ) : (
        <ul className="mt-3 divide-y divide-pierre-100 text-sm">
          {menus.map((m) => (
            <li key={m.id} className="flex items-center gap-2 py-1.5">
              <span className="min-w-0 flex-1 truncate" title={new Date(m.saved_at).toLocaleString('fr-CA')}>
                {m.name}
              </span>
              {ecriture && (
                <>
                  <button
                    className="text-foret-700 hover:underline"
                    onClick={() =>
                      confirm(`Charger « ${m.name} » ? Les groupes et la grille actuels seront remplacés.`) &&
                      charger.mutate({ menu: m, plan })
                    }
                  >
                    Charger
                  </button>
                  <button
                    aria-label={`Supprimer ${m.name}`}
                    className="rounded px-1.5 text-red-700 hover:bg-red-50"
                    onClick={() => confirm(`Supprimer le menu « ${m.name} » ?`) && supprimer.mutate(m.id)}
                  >
                    ✕
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ------------------------------------------------------------------
// Grille des repas
// ------------------------------------------------------------------

function Grille({
  recettes,
  groupes,
  cellules,
  ecriture,
}: {
  recettes: Recette[]
  groupes: GroupeRepas[]
  cellules: CellulePlan[]
  ecriture: boolean
}) {
  const plan = useParametresPlan()
  const enregistrer = useEnregistrerCellule()
  const parCle = useMemo(() => new Map(cellules.map((c) => [`${c.day}_${c.meal}`, c])), [cellules])
  const noms = useMemo(() => new Map(recettes.map((r) => [r.id, r.name])), [recettes])
  const options = useMemo(() => {
    const trier = (cat: string) =>
      recettes.filter((r) => r.cat === cat).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    return { Déjeuner: trier('Déjeuner'), 'Repas principal': trier('Repas principal'), Salades: trier('Salades'), Desserts: trier('Desserts') }
  }, [recettes])

  const cellule = (day: number, meal: Repas): CellulePlan =>
    parCle.get(`${day}_${meal}`) ?? { day, meal, plat: '', salade: '', dessert: '', absent: [] }

  const jours = Array.from({ length: plan.jours }, (_, i) => i)

  return (
    <div className={`${ui.carte} overflow-x-auto print:overflow-visible print:border-0 print:shadow-none`}>
      <table className="w-full min-w-[60rem] table-fixed text-sm print:min-w-0">
        <thead>
          <tr className="border-b border-pierre-200 bg-pierre-50">
            <th className="w-20 px-2 py-2 text-left font-medium text-pierre-500">Repas</th>
            {jours.map((d) => (
              <th key={d} className="px-2 py-2 text-left font-semibold">
                {libelleJour(d, plan.debut)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-pierre-200">
          {REPAS.map((repas) => (
            <tr key={repas.id} className="align-top">
              <th className="px-2 py-2 text-left font-medium text-pierre-700">{repas.court}</th>
              {jours.map((d) => {
                const c = cellule(d, repas.id)
                const maj = (champs: Partial<CellulePlan>) => enregistrer.mutate({ ...c, ...champs })
                const composantes: { champ: 'plat' | 'salade' | 'dessert'; libelle: string; liste: Recette[] }[] = [
                  { champ: 'plat', libelle: 'Plat', liste: repas.id === 'dejeuner' ? options.Déjeuner : options['Repas principal'] },
                  ...(repas.id === 'dejeuner'
                    ? []
                    : [
                        { champ: 'salade' as const, libelle: 'Salade', liste: options.Salades },
                        { champ: 'dessert' as const, libelle: 'Dessert', liste: options.Desserts },
                      ]),
                ]
                return (
                  <td key={d} className={`border-l border-pierre-100 px-1.5 py-1.5 ${c.plat ? 'bg-foret-50/50' : ''}`}>
                    {/* Version imprimée : noms seulement. */}
                    <p className="hidden text-xs font-semibold print:block">
                      {[c.plat && noms.get(c.plat), c.salade && `🥗 ${noms.get(c.salade)}`, c.dessert && `🍰 ${noms.get(c.dessert)}`]
                        .filter(Boolean)
                        .join(' | ')}
                    </p>
                    <div className="space-y-1 print:hidden">
                      {composantes.map((k) => (
                        <select
                          key={k.champ}
                          aria-label={`${k.libelle}, ${repas.libelle} ${libelleJour(d, plan.debut)}`}
                          title={(c[k.champ] && noms.get(c[k.champ]!)) || undefined}
                          disabled={!ecriture}
                          className="w-full truncate rounded border border-pierre-200 bg-white px-1 py-1 text-xs"
                          value={c[k.champ] ?? ''}
                          onChange={(e) => maj({ [k.champ]: e.target.value })}
                        >
                          <option value="">{k.libelle} —</option>
                          {k.liste.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      ))}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {groupes.map((g) => {
                        const present = !c.absent?.includes(g.id)
                        return (
                          <button
                            key={g.id}
                            disabled={!ecriture}
                            aria-pressed={present}
                            title={present ? `${g.name} présent — cliquer pour marquer absent` : `${g.name} absent`}
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-tight print:[print-color-adjust:exact] ${
                              present ? 'text-white' : 'bg-pierre-200 text-pierre-500 line-through'
                            }`}
                            style={present ? { background: g.color ?? COULEURS_GROUPES[0] } : undefined}
                            onClick={() =>
                              maj({ absent: present ? [...(c.absent ?? []), g.id] : (c.absent ?? []).filter((x) => x !== g.id) })
                            }
                          >
                            {g.name}
                          </button>
                        )
                      })}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
