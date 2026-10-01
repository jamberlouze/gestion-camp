import { useMemo, useState } from 'react'
import { ui } from '@/lib/ui'
import { useTitreImpression } from '@/lib/useTitreImpression'
import { calculerCommande, portionsGroupe, quantiteAffichee, type LigneColabor, type LigneProduit } from './calcul'
import { useMenu } from './contexte'
import { useEtatCommande } from './donnees'
import { versIso } from './quarts'
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
  const { menu } = useMenu()
  useTitreImpression(`Commande - ${menu.nom}`)
  const etat = useEtatCommande(menu)
  const [stock, setStock] = useStock()
  const resultat = useMemo(() => (etat ? calculerCommande(etat) : null), [etat])

  if (!etat || !resultat) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
  if (resultat.vide) {
    return (
      <p className={`${ui.carte} p-10 text-center text-sm text-pierre-500`}>
        Planifiez des repas dans le Planificateur ou ajoutez des articles dans Ajouts manuels pour voir la commande.
      </p>
    )
  }

  // Un même # produit en deux unités (recettes incohérentes) donne deux
  // lignes : chacune a alors son propre stock, et un avertissement.
  const parId = new Map<string, number>()
  for (const l of resultat.colabor) parId.set(l.id, (parId.get(l.id) ?? 0) + 1)
  const doublon = (l: LigneColabor) => (parId.get(l.id) ?? 0) > 1
  const cleStock = (l: LigneColabor) => (doublon(l) ? l.cle : l.id)
  const aCommander = (l: LigneColabor) => (l.caisses == null ? null : Math.max(0, l.caisses - (stock[cleStock(l)] ?? 0)))
  const vege = etat.groupes.reduce((s, g) => s + portionsGroupe(g, 0).vege, 0)

  return (
    <div className="space-y-5">
      <h2 className="hidden text-lg font-semibold print:block">Commande — {menu.nom}</h2>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className={`grid grid-cols-2 gap-3 ${vege > 0 ? 'sm:grid-cols-6' : 'sm:grid-cols-5'}`}>
          <Tuile libelle="Produits Colabor" valeur={resultat.colabor.length} />
          <Tuile libelle="Produits Costco" valeur={resultat.costco.length} />
          <Tuile libelle="Produits Maxi" valeur={resultat.maxi.length} />
          <Tuile libelle="Jours planifiés" valeur={menu.jours} />
          <Tuile libelle="Groupes" valeur={etat.groupes.length} />
          {vege > 0 && <Tuile libelle="Portions végé" valeur={vege} />}
        </div>
        <div className="flex gap-2 print:hidden">
          <button className={ui.boutonSecondaire} onClick={() => setStock({})}>
            Réinitialiser le stock
          </button>
          <button className={ui.boutonSecondaire} onClick={() => exporterCsv(resultat.colabor, aCommander, menu.nom)}>
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
                  <tr key={l.cle}>
                    <td className="px-5 py-1.5 text-pierre-500">{l.id}</td>
                    <td className="px-3 py-1.5">
                      <span className="font-medium">{l.name}</span>
                      {l.pkg && <span className="block text-xs text-pierre-500">{l.pkg}</span>}
                      {doublon(l) && (
                        <span className="block text-xs text-amber-700">⚠ Même # produit, unités différentes : vérifier les recettes</span>
                      )}
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
                        value={stock[cleStock(l)] ?? 0}
                        onChange={(e) => setStock({ ...stock, [cleStock(l)]: Math.max(0, Math.trunc(Number(e.target.value)) || 0) })}
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
                <span className="whitespace-nowrap text-right font-semibold">
                  {g.portions} portions
                  {g.vege > 0 && (
                    <span className="block text-xs font-normal">
                      dont {g.vege} végé{g.optionVege ? '' : ' (pas d’option végé)'}
                    </span>
                  )}
                </span>
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
            <tr key={l.cle}>
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

function exporterCsv(lignes: LigneColabor[], aCommander: (l: LigneColabor) => number | null, nomMenu: string) {
  const entetes = ['# Produit', 'Description', 'Empaquetage', 'Quantité brute', 'Caisses brutes', 'À commander']
  const valeurs = lignes.map((l) => [l.id, l.name, l.pkg, quantiteAffichee(l), l.caisses ?? '', aCommander(l) ?? ''])
  const csv = [entetes, ...valeurs].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `commande-colabor-${slug(nomMenu)}-${versIso(new Date())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** « Semaine 1 — Été » → « semaine-1-ete » (nom de fichier). */
function slug(texte: string): string {
  const propre = texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return propre || 'menu'
}
