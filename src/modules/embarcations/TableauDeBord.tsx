import { useMemo } from 'react'
import { ui } from '@/lib/ui'
import { useEmbarcations, useModeles } from './donnees'
import { joindre, trier, type Ligne } from './outils'
import { TYPES } from './types'

// Couleurs de statut réservées (palette de référence dataviz), toujours
// accompagnées d'une icône et d'un libellé.
const VERT = '#0ca30c'
const ROUGE = '#d03b3b'

interface Decompte {
  total: number
  fonctionnelles: number
  defaillantes: number
}

function compter(lignes: Ligne[]): Decompte {
  const fonctionnelles = lignes.filter((l) => l.fonctionnel).length
  return { total: lignes.length, fonctionnelles, defaillantes: lignes.length - fonctionnelles }
}

export function TableauDeBord() {
  const modeles = useModeles()
  const embarcations = useEmbarcations()

  const donnees = useMemo(() => {
    const lignes = joindre(embarcations.data ?? [], modeles.data ?? [])
    const parType = TYPES.map((type) => ({ type, ...compter(lignes.filter((l) => l.modele.type === type)) })).filter(
      (t) => t.total > 0,
    )
    const parModele = (modeles.data ?? [])
      .map((modele) => ({ modele, ...compter(lignes.filter((l) => l.modele_id === modele.id)) }))
      .filter((m) => m.total > 0)
    const aReparer = trier(
      lignes.filter((l) => !l.fonctionnel),
      { champ: 'type', sens: 'asc' },
    )
    return { global: compter(lignes), parType, parModele, aReparer, nbModeles: modeles.data?.length ?? 0 }
  }, [embarcations.data, modeles.data])

  if (!embarcations.data || !modeles.data) {
    return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
  }

  const { global, parType, parModele, aReparer, nbModeles } = donnees
  const max = Math.max(1, ...parType.map((t) => t.total))

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tuile libelle="Embarcations" valeur={global.total} />
        <Tuile libelle="Fonctionnelles" valeur={global.fonctionnelles} icone="✓" couleur={VERT} />
        <Tuile libelle="Défaillantes" valeur={global.defaillantes} icone="✕" couleur={ROUGE} />
        <Tuile libelle="Modèles" valeur={nbModeles} />
      </div>

      <section className={`${ui.carte} p-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Par type</h2>
          <Legende />
        </div>
        <ul className="mt-4 space-y-3">
          {parType.map((t) => (
            <li key={t.type} className="grid grid-cols-[5.5rem_1fr] items-center gap-3 text-sm">
              <span className="text-pierre-700">{t.type}</span>
              <div className="flex items-center gap-2">
                {/* Base carrée à gauche, bout arrondi (4px), 2px d'espace entre les segments. */}
                <div className="flex h-5 gap-[2px]" style={{ width: `${(t.total / max) * 85}%` }}>
                  {t.fonctionnelles > 0 && (
                    <span
                      className="h-full last:rounded-r"
                      style={{ flexGrow: t.fonctionnelles, background: VERT }}
                      title={`${t.type} : ${t.fonctionnelles} fonctionnelle(s)`}
                    />
                  )}
                  {t.defaillantes > 0 && (
                    <span
                      className="h-full rounded-r"
                      style={{ flexGrow: t.defaillantes, background: ROUGE }}
                      title={`${t.type} : ${t.defaillantes} défaillante(s)`}
                    />
                  )}
                </div>
                <span className="whitespace-nowrap tabular-nums text-pierre-700">
                  {t.total}
                  {t.defaillantes > 0 && <span className="text-pierre-500"> · {t.defaillantes} défaillante{t.defaillantes > 1 ? 's' : ''}</span>}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={`${ui.carte} overflow-hidden`}>
          <h2 className="px-5 pt-5 font-semibold">Par modèle</h2>
          <div className="overflow-x-auto">
            <table className="mt-3 w-full text-sm">
              <thead className="border-y border-pierre-200 bg-pierre-50 text-left text-pierre-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Modèle</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-right font-medium">Fonct.</th>
                  <th className="px-5 py-2 text-right font-medium">Défaill.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pierre-100 tabular-nums">
                {parModele.map((m) => (
                  <tr key={m.modele.id}>
                    <td className="px-5 py-2">
                      {m.modele.nom} <span className="text-pierre-500">· {m.modele.type}</span>
                    </td>
                    <td className="px-3 py-2 text-right">{m.total}</td>
                    <td className="px-3 py-2 text-right">{m.fonctionnelles}</td>
                    <td className="px-5 py-2 text-right">{m.defaillantes || <span className="text-pierre-300">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={`${ui.carte} p-5`}>
          <h2 className="font-semibold">
            À réparer <span className="font-normal text-pierre-500">({aReparer.length})</span>
          </h2>
          {aReparer.length === 0 ? (
            <p className="mt-3 text-sm text-pierre-500">Toute la flotte est fonctionnelle.</p>
          ) : (
            <ul className="mt-3 divide-y divide-pierre-100 text-sm">
              {aReparer.map((l) => (
                <li key={l.id} className="flex gap-3 py-2">
                  <span className="w-20 shrink-0 font-semibold tabular-nums">{l.numero_identification ?? 'Nouveau'}</span>
                  <span className="min-w-0">
                    <span className="text-pierre-500">
                      {l.modele.type} · {l.modele.nom}
                    </span>
                    {l.notes ? <span className="block text-pierre-900">{l.notes}</span> : <span className="block text-pierre-300">Aucune note</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function Tuile({ libelle, valeur, icone, couleur }: { libelle: string; valeur: number; icone?: string; couleur?: string }) {
  return (
    <div className={`${ui.carte} p-4`}>
      <p className="flex items-center gap-1.5 text-sm text-pierre-500">
        {icone && (
          <span
            aria-hidden
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ background: couleur }}
          >
            {icone}
          </span>
        )}
        {libelle}
      </p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{valeur}</p>
    </div>
  )
}

function Legende() {
  const cle = (couleur: string, libelle: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: couleur }} aria-hidden />
      {libelle}
    </span>
  )
  return (
    <span className="flex gap-4 text-xs text-pierre-700">
      {cle(VERT, 'Fonctionnelles')}
      {cle(ROUGE, 'Défaillantes')}
    </span>
  )
}
