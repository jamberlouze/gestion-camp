import { useMemo, useState } from 'react'
import { ui } from '@/lib/ui'
import { calculerCommande, quantiteAffichee, type LigneColabor, type LigneProduit } from './calcul'
import { useParametresPlan, useTable } from './donnees'
import { UNITES } from './types'

const CLE_STOCK = 'commande-stock'

/** Stock saisi : propre à ce navigateur (commodité), pas partagé. */
function useStock() {
  const [stock, setStock] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem(CLE_STOCK) ?? '{}')
    } catch {
      return {}
    }
  })
  const enregistrer = (s: Record<string, number>) => {
    setStock(s)
    try {
      localStorage.setItem(CLE_STOCK, JSON.stringify(s))
    } catch {
      /* stockage indisponible : le stock reste en mémoire */
    }
  }
  return [stock, enregistrer] as const
}

export function Commande() {
  const recettes = useTable('recettes')
  const consommables = useTable('consommables')
  const groupes = useTable('groupes_repas')
  const cellules = useTable('plan_cells')
  const ajoutsConsommables = useTable('ajouts_consommables')
  const ajoutsRecettes = useTable('ajouts_recettes')
  const sorties = useTable('sorties')
  const plan = useParametresPlan()
  const [stock, setStock] = useStock()

  const pret = [recettes, consommables, groupes, cellules, ajoutsConsommables, ajoutsRecettes, sorties].every((q) => q.data)
  const resultat = useMemo(
    () =>
      pret
        ? calculerCommande({
            recettes: recettes.data!,
            consommables: consommables.data!,
            groupes: groupes.data!,
            cellules: cellules.data!,
            ajoutsConsommables: ajoutsConsommables.data!,
            ajoutsRecettes: ajoutsRecettes.data!,
            sorties: sorties.data!,
            jours: plan.jours,
            debut: plan.debut,
          })
        : null,
    [pret, recettes.data, consommables.data, groupes.data, cellules.data, ajoutsConsommables.data, ajoutsRecettes.data, sorties.data, plan.jours, plan.debut],
  )

  if (!resultat) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
  if (resultat.vide) {
    return (
      <p className={`${ui.carte} p-10 text-center text-sm text-pierre-500`}>
        Planifiez des repas dans le Planificateur ou ajoutez des articles dans Ajouts manuels pour voir la commande.
      </p>
    )
  }

  const aCommander = (l: LigneColabor) => (l.caisses == null ? null : Math.max(0, l.caisses - (stock[l.id] ?? 0)))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Tuile libelle="Produits Colabor" valeur={resultat.colabor.length} />
          <Tuile libelle="Produits Costco" valeur={resultat.costco.length} />
          <Tuile libelle="Produits Maxi" valeur={resultat.maxi.length} />
          <Tuile libelle="Jours planifiés" valeur={plan.jours} />
          <Tuile libelle="Groupes" valeur={groupes.data!.length} />
        </div>
        <div className="flex gap-2 print:hidden">
          <button className={ui.boutonSecondaire} onClick={() => setStock({})}>
            Réinitialiser le stock
          </button>
          <button className={ui.boutonSecondaire} onClick={() => exporterCsv(resultat.colabor, aCommander)}>
            Exporter CSV
          </button>
          <button className={ui.bouton} onClick={() => window.print()}>
            Imprimer
          </button>
        </div>
      </div>

      <section className={`${ui.carte} overflow-hidden`}>
        <h2 className="px-5 pt-4 font-semibold">Colabor</h2>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full text-sm">
            <thead className="border-y border-pierre-200 bg-pierre-50 text-left text-pierre-500">
              <tr>
                <th className="px-5 py-2 font-medium"># Produit</th>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium">Qté brute</th>
                <th className="px-3 py-2 text-right font-medium">Qté / caisse</th>
                <th className="px-3 py-2 text-right font-medium">Caisses brutes</th>
                <th className="px-3 py-2 text-right font-medium">Stock actuel</th>
                <th className="px-5 py-2 text-right font-medium">À commander</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pierre-100 tabular-nums">
              {resultat.colabor.map((l) => {
                const net = aCommander(l)
                return (
                  <tr key={l.id}>
                    <td className="px-5 py-1.5 text-pierre-500">{l.id}</td>
                    <td className="px-3 py-1.5">
                      <span className="font-medium">{l.name}</span>
                      {l.pkg && <span className="block text-xs text-pierre-500">{l.pkg}</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right">{quantiteAffichee(l)}</td>
                    <td className="px-3 py-1.5 text-right text-pierre-500">
                      {l.unit === 'caisse' ? '—' : l.caseQty != null ? `${l.caseQty} ${UNITES.find((u) => u.id === l.unit)?.libelle}` : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold">
                      {l.caisses ?? (
                        <span className="font-normal text-amber-700" title="Taille de caisse manquante dans la banque d'ingrédients">
                          ⚠ taille ?
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <input
                        type="number"
                        min={0}
                        aria-label={`Stock de ${l.name}`}
                        className="w-16 rounded border border-pierre-300 px-1.5 py-1 text-right print:border-0"
                        value={stock[l.id] ?? 0}
                        onChange={(e) => setStock({ ...stock, [l.id]: Math.max(0, Math.trunc(Number(e.target.value)) || 0) })}
                      />
                    </td>
                    <td className={`px-5 py-1.5 text-right font-bold ${net === 0 ? 'text-pierre-300' : ''}`}>{net ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <AutreMagasin titre="Costco" lignes={resultat.costco} />
      <AutreMagasin titre="Maxi" lignes={resultat.maxi} />

      {resultat.glaciere.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-950">🧊 Glacière — à emballer séparément</h2>
          <p className="text-xs text-amber-900">Déjà comptées dans les quantités ci-dessus.</p>
          <ul className="mt-2 space-y-1 text-sm text-amber-950">
            {resultat.glaciere.map((g, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>
                  {g.recette} — {g.sortie} ({g.repas})
                </span>
                <span className="whitespace-nowrap font-semibold">{g.portions} portions</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function AutreMagasin({ titre, lignes }: { titre: string; lignes: LigneProduit[] }) {
  if (lignes.length === 0) return null
  return (
    <section className={`${ui.carte} overflow-hidden`}>
      <h2 className="px-5 pt-4 font-semibold">{titre}</h2>
      <table className="mt-3 w-full text-sm">
        <thead className="border-y border-pierre-200 bg-pierre-50 text-left text-pierre-500">
          <tr>
            <th className="px-5 py-2 font-medium"># Produit</th>
            <th className="px-3 py-2 font-medium">Description</th>
            <th className="px-5 py-2 text-right font-medium">Quantité totale</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-pierre-100 tabular-nums">
          {lignes.map((l) => (
            <tr key={l.id}>
              <td className="px-5 py-1.5 text-pierre-500">{l.id}</td>
              <td className="px-3 py-1.5">
                <span className="font-medium">{l.name}</span>
                {l.pkg && <span className="block text-xs text-pierre-500">{l.pkg}</span>}
              </td>
              <td className="px-5 py-1.5 text-right font-semibold">{quantiteAffichee(l)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function Tuile({ libelle, valeur }: { libelle: string; valeur: number }) {
  return (
    <div className={`${ui.carte} px-4 py-3`}>
      <p className="text-xs text-pierre-500">{libelle}</p>
      <p className="text-2xl font-semibold tabular-nums">{valeur}</p>
    </div>
  )
}

function exporterCsv(lignes: LigneColabor[], aCommander: (l: LigneColabor) => number | null) {
  const entetes = ['# Produit', 'Description', 'Empaquetage', 'Quantité brute', 'Caisses brutes', 'À commander']
  const valeurs = lignes.map((l) => [l.id, l.name, l.pkg, quantiteAffichee(l), l.caisses ?? '', aCommander(l) ?? ''])
  const csv = [entetes, ...valeurs].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `commande-colabor-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
