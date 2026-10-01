import { useMemo, useState, type ComponentProps } from 'react'
import { ChampTexte } from '@/lib/ChampTexte'
import { ui } from '@/lib/ui'
import { libelleJour, portionsGroupe } from './calcul'
import { useMenu } from './contexte'
import {
  nouvelId,
  useEffacerGrille,
  useEnregistrerCellule,
  useEnregistrerGroupe,
  useModifierMenu,
  useSupprimerGroupe,
  useTable,
  useTableMenu,
} from './donnees'
import { AGES, COULEURS_GROUPES, REPAS, type CellulePlan, type GroupeRepas, type Recette, type Repas } from './types'

export function Planificateur() {
  const { menu } = useMenu()
  const recettes = useTable('recettes')
  const groupes = useTableMenu('groupes_repas', menu.id)
  const cellules = useTableMenu('plan_cells', menu.id)

  if (!recettes.data || !groupes.data || !cellules.data) {
    return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[16rem_1fr] print:block">
      <aside className="space-y-4 print:hidden">
        <Reglages />
        <Groupes groupes={groupes.data} />
      </aside>
      <section className="min-w-0">
        <h2 className="mb-2 hidden text-lg font-semibold print:block">
          Menu — {menu.nom} — {menu.jours} jour{menu.jours > 1 ? 's' : ''}
          {menu.debut ? ` à partir du ${libelleJour(0, menu.debut)}` : ''}
        </h2>
        <Grille recettes={recettes.data} groupes={groupes.data} cellules={cellules.data} />
      </section>
    </div>
  )
}

// ------------------------------------------------------------------
// Barre de côté
// ------------------------------------------------------------------

function Reglages() {
  const { menu, ecriture } = useMenu()
  const modifier = useModifierMenu()
  const effacer = useEffacerGrille()
  return (
    <div className={`${ui.carte} space-y-3 p-4`}>
      <div className="grid grid-cols-[4.5rem_1fr] gap-3">
        {/* Jours et début : enregistrés en quittant le champ (ou Entrée), pas à
            chaque touche (une date se tape chiffre par chiffre : 0002, 0020…). */}
        <div>
          <label className={ui.etiquette} htmlFor="pl-jours">
            Jours
          </label>
          <ChampNombre
            id="pl-jours"
            min={1}
            max={14}
            disabled={!ecriture}
            className={ui.champ}
            valeur={menu.jours}
            enregistrer={(v) => {
              const jours = Math.min(14, Math.max(1, Math.trunc(Number(v)) || 1))
              if (jours !== menu.jours) modifier.mutate({ id: menu.id, jours })
              return jours
            }}
          />
        </div>
        {menu.modele ? (
          <p className="self-end text-xs text-pierre-500">Modèle : jours numérotés ; la date se choisit en créant un menu.</p>
        ) : (
          <div>
            <label className={ui.etiquette} htmlFor="pl-debut">
              Début
            </label>
            <ChampTexte
              id="pl-debut"
              type="date"
              disabled={!ecriture}
              className={ui.champ}
              valeur={menu.debut ?? ''}
              enregistrer={(v) => modifier.mutate({ id: menu.id, debut: v || null })}
            />
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button className={`${ui.boutonSecondaire} flex-1`} onClick={() => window.print()}>
          Imprimer le menu
        </button>
        {ecriture && (
          <button
            className={ui.boutonDanger}
            onClick={() => confirm('Effacer tous les repas planifiés ?') && effacer.mutate({ menu_id: menu.id })}
          >
            Effacer
          </button>
        )}
      </div>
    </div>
  )
}

function Groupes({ groupes }: { groupes: GroupeRepas[] }) {
  const { menu, ecriture } = useMenu()
  const enregistrer = useEnregistrerGroupe()
  const supprimer = useSupprimerGroupe()
  const total = groupes.reduce((s, g) => s + g.portions, 0)
  const totalVege = groupes.reduce((s, g) => s + portionsGroupe(g, 0).vege, 0)
  const nombre = (v: string) => Math.max(0, Math.trunc(Number(v)) || 0)

  return (
    <div className={`${ui.carte} p-4`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">Groupes</h2>
        <span className="text-right text-sm text-pierre-500">
          {total} portions
          {totalVege > 0 && <span className="block text-xs">dont {totalVege} végé</span>}
        </span>
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
                  onClick={() =>
                    confirm(`Supprimer le groupe « ${g.name} » ?`) && supprimer.mutate({ menu_id: menu.id, id: g.id })
                  }
                >
                  ✕
                </button>
              )}
            </div>
            {/* Âge, portions et, en dessous, les portions végé (comprises dans les portions). */}
            <div className="mt-2 grid grid-cols-[1fr_3.5rem_auto] items-center gap-x-1.5 gap-y-1">
              <select
                aria-label="Âge"
                disabled={!ecriture}
                className="min-w-0 rounded border border-pierre-300 px-1.5 py-1 text-sm"
                value={g.age ?? 'Mixtes'}
                onChange={(e) => enregistrer.mutate({ ...g, age: e.target.value })}
              >
                {AGES.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
              <label className="contents">
                <ChampNombre
                  aria-label="Nombre de portions"
                  disabled={!ecriture}
                  className="w-full rounded border border-pierre-300 px-1.5 py-1 text-right text-sm text-pierre-900"
                  valeur={g.portions}
                  enregistrer={(v) => {
                    const portions = nombre(v)
                    if (portions !== g.portions) {
                      enregistrer.mutate({ ...g, portions, vege: Math.min(portionsGroupe(g, 0).vege, portions) })
                    }
                    return portions
                  }}
                />
                <span className="text-xs text-pierre-500">portions</span>
              </label>
              <label className="contents">
                <span className="text-right text-xs text-pierre-500">dont</span>
                <ChampNombre
                  aria-label="Portions végé"
                  title="Portions végé, comprises dans les portions : elles prennent l’option végé des recettes qui en ont une."
                  max={g.portions}
                  disabled={!ecriture}
                  className="w-full rounded border border-pierre-300 px-1.5 py-1 text-right text-sm text-pierre-900"
                  valeur={portionsGroupe(g, 0).vege}
                  enregistrer={(v) => {
                    const vege = Math.min(g.portions, nombre(v))
                    if (vege !== g.vege) enregistrer.mutate({ ...g, vege })
                    return vege
                  }}
                />
                <span className="text-xs text-pierre-500">végé</span>
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
              menu_id: menu.id,
              id: nouvelId('g'),
              name: `Groupe ${groupes.length + 1}`,
              age: 'Mixtes',
              portions: 40,
              vege: 0,
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

/**
 * Nombre enregistré à la sortie du champ. `enregistrer` renvoie la valeur
 * retenue (ex. végé ramené aux portions) : le champ l'affiche, même quand
 * elle ne change pas la valeur déjà enregistrée (ChampTexte ne se resynchronise
 * que si la valeur enregistrée change).
 */
function ChampNombre({
  valeur,
  enregistrer,
  ...props
}: { valeur: number; enregistrer: (v: string) => number } & Omit<
  ComponentProps<typeof ChampTexte>,
  'valeur' | 'enregistrer' | 'type' | 'obligatoire'
>) {
  const [version, setVersion] = useState(0)
  return (
    <ChampTexte
      key={version}
      min={0}
      {...props}
      type="number"
      obligatoire
      valeur={String(valeur)}
      enregistrer={(v) => {
        if (String(enregistrer(v)) !== v) setVersion((n) => n + 1)
      }}
    />
  )
}

// ------------------------------------------------------------------
// Grille des repas
// ------------------------------------------------------------------

function Grille({ recettes, groupes, cellules }: { recettes: Recette[]; groupes: GroupeRepas[]; cellules: CellulePlan[] }) {
  const { menu, ecriture } = useMenu()
  const enregistrer = useEnregistrerCellule()
  const parCle = useMemo(() => new Map(cellules.map((c) => [`${c.day}_${c.meal}`, c])), [cellules])
  const noms = useMemo(() => new Map(recettes.map((r) => [r.id, r.name])), [recettes])
  const options = useMemo(() => {
    const trier = (cat: string) =>
      recettes.filter((r) => r.cat === cat).sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    return { Déjeuner: trier('Déjeuner'), 'Repas principal': trier('Repas principal'), Salades: trier('Salades'), Desserts: trier('Desserts') }
  }, [recettes])

  const cellule = (day: number, meal: Repas): CellulePlan =>
    parCle.get(`${day}_${meal}`) ?? { menu_id: menu.id, day, meal, plat: '', salade: '', dessert: '', absent: [] }

  const jours = Array.from({ length: menu.jours }, (_, i) => i)

  return (
    <div className={`${ui.carte} overflow-x-auto print:overflow-visible print:border-0 print:shadow-none`}>
      <table className="w-full min-w-[60rem] table-fixed text-sm print:min-w-0">
        <thead>
          <tr className="border-b border-pierre-200 bg-pierre-50">
            <th className="w-20 px-2 py-2 text-left font-medium text-pierre-500">Repas</th>
            {jours.map((d) => (
              <th key={d} className="px-2 py-2 text-left font-semibold">
                {libelleJour(d, menu.debut)}
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
                          aria-label={`${k.libelle}, ${repas.libelle} ${libelleJour(d, menu.debut)}`}
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
