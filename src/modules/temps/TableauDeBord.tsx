import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { messageErreur } from '@/lib/donnees'
import { IconeTableur } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { ChoixPeriode, PastilleStatut } from './commun'
import { menu, usePeriode } from './outils'
import { nomDe, useFeuillesPlage, useHeuresPlage, useMembres, type Heure, type Membre, type Statut } from './donnees'
import { ajouterJours, dateCourte, finPeriode, formatHeures, libellePeriode, periodesEntre, PREMIERE_PERIODE, TYPES, type TypeHeures } from './periodes'

interface Ligne {
  membre: Membre
  sem1: number
  sem2: number
  types: Record<TypeHeures, number>
  total: number
  statut: Statut
}

const vide = (): Record<TypeHeures, number> => ({ regulieres: 0, vacances: 0, maladie: 0 })

/**
 * Administrateurs seulement : toutes les feuilles d'une période (état,
 * heures par type, régulières par semaine) et le cumul depuis une période
 * choisie. Un clic ouvre la feuille de la personne.
 */
export function TableauDeBord() {
  const navigate = useNavigate()
  const [debut, setDebut] = usePeriode()
  const [cumulDu, setCumulDu] = useState(PREMIERE_PERIODE)
  const du = cumulDu > debut ? debut : cumulDu
  const fin = finPeriode(debut)
  const membres = useMembres()
  const heures = useHeuresPlage(du, fin)
  const feuilles = useFeuillesPlage(debut, debut)

  const donnees = useMemo(() => {
    if (!membres.data || !heures.data || !feuilles.data) return null
    const milieu = ajouterJours(debut, 7)
    const dePeriode = heures.data.filter((h) => h.jour >= debut)
    // Toute la direction active, plus quiconque a des heures (ex. compte désactivé depuis).
    const ids = new Set(heures.data.map((h) => h.user_id))
    const liste = membres.data.filter((m) => (m.actif && (m.role === 'admin' || m.role === 'direction')) || ids.has(m.id))

    const resumer = (lignes: Heure[], m: Membre): Ligne => {
      const siennes = lignes.filter((h) => h.user_id === m.id)
      const types = vide()
      for (const h of siennes) types[h.type] += h.heures
      const reg = siennes.filter((h) => h.type === 'regulieres')
      return {
        membre: m,
        sem1: reg.filter((h) => h.jour < milieu).reduce((s, h) => s + h.heures, 0),
        sem2: reg.filter((h) => h.jour >= milieu).reduce((s, h) => s + h.heures, 0),
        types,
        total: types.regulieres + types.vacances + types.maladie,
        statut: feuilles.data.find((f) => f.user_id === m.id)?.statut ?? 'brouillon',
      }
    }
    return {
      periode: liste.map((m) => resumer(dePeriode, m)),
      cumul: liste.map((m) => resumer(heures.data, m)),
    }
  }, [membres.data, heures.data, feuilles.data, debut])

  const erreur = membres.error ?? heures.error ?? feuilles.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>

  const ouvrir = (id: string) => navigate(`/temps/personne/${id}?periode=${debut}`)
  const somme = (l: Ligne[], f: (x: Ligne) => number) => l.reduce((s, x) => s + f(x), 0)
  const h = (n: number) => (n ? formatHeures(n) : <span className="text-pierre-300">—</span>)

  const nb = donnees?.periode.length ?? 0
  const soumises = donnees?.periode.filter((l) => l.statut !== 'brouillon').length ?? 0
  const aApprouver = donnees?.periode.filter((l) => l.statut === 'soumise').length ?? 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChoixPeriode debut={debut} onChange={setDebut} />
        <button className={ui.boutonSecondaire} disabled={!donnees} onClick={() => donnees && exporter(debut, donnees.periode)}>
          <IconeTableur className="size-4" /> Exporter la période
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Tuile titre="Feuilles soumises" valeur={donnees ? `${soumises} / ${nb}` : '…'} />
        <Tuile titre="À approuver" valeur={donnees ? String(aApprouver) : '…'} accent={aApprouver > 0} />
        <Tuile titre="Heures de la période" valeur={donnees ? `${formatHeures(somme(donnees.periode, (l) => l.total))} h` : '…'} />
      </div>

      <section className={ui.carte}>
        <h2 className="border-b border-pierre-100 px-3 py-2 text-sm font-semibold">Période du {libellePeriode(debut)}</h2>
        {!donnees ? (
          <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-pierre-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Personne</th>
                  <th className="px-3 py-2 text-right font-medium" title="Heures régulières, semaine 1">Rég. sem. 1</th>
                  <th className="px-3 py-2 text-right font-medium" title="Heures régulières, semaine 2">Rég. sem. 2</th>
                  {TYPES.map((t) => (
                    <th key={t.id} className="px-3 py-2 text-right font-medium">
                      {t.libelle}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-left font-medium">État</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pierre-100">
                {donnees.periode.map((l) => (
                  <tr key={l.membre.id} className="cursor-pointer hover:bg-pierre-50" onClick={() => ouvrir(l.membre.id)}>
                    <td className="px-3 py-2 font-medium">
                      {nomDe(l.membre)}
                      {!l.membre.actif && <span className="ml-1 text-xs font-normal text-pierre-500">(inactif)</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{h(l.sem1)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{h(l.sem2)}</td>
                    {TYPES.map((t) => (
                      <td key={t.id} className="px-3 py-2 text-right tabular-nums">
                        {h(l.types[t.id])}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{h(l.total)}</td>
                    <td className="px-3 py-2">
                      <PastilleStatut statut={l.statut} />
                    </td>
                  </tr>
                ))}
                {nb === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-pierre-500">
                      Aucun membre de la direction.
                    </td>
                  </tr>
                )}
              </tbody>
              {nb > 1 && (
                <tfoot className="border-t border-pierre-200 bg-pierre-50 font-semibold">
                  <tr>
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums">{h(somme(donnees.periode, (l) => l.sem1))}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{h(somme(donnees.periode, (l) => l.sem2))}</td>
                    {TYPES.map((t) => (
                      <td key={t.id} className="px-3 py-2 text-right tabular-nums">
                        {h(somme(donnees.periode, (l) => l.types[t.id]))}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums">{h(somme(donnees.periode, (l) => l.total))}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </section>

      <section className={ui.carte}>
        <div className="flex flex-wrap items-center gap-2 border-b border-pierre-100 px-3 py-2">
          <h2 className="text-sm font-semibold">Cumul</h2>
          <span className="text-sm text-pierre-500">du</span>
          <select aria-label="Cumul depuis la période" className={menu} value={du} onChange={(e) => setCumulDu(e.target.value)}>
            {periodesEntre(PREMIERE_PERIODE, debut).map((d) => (
              <option key={d} value={d}>
                {dateCourte(d)}
              </option>
            ))}
          </select>
          <span className="text-sm text-pierre-500">au {dateCourte(fin)}</span>
        </div>
        {!donnees ? (
          <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-pierre-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Personne</th>
                  {TYPES.map((t) => (
                    <th key={t.id} className="px-3 py-2 text-right font-medium">
                      {t.libelle}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pierre-100">
                {donnees.cumul.map((l) => (
                  <tr key={l.membre.id}>
                    <td className="px-3 py-2 font-medium">{nomDe(l.membre)}</td>
                    {TYPES.map((t) => (
                      <td key={t.id} className="px-3 py-2 text-right tabular-nums">
                        {h(l.types[t.id])}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{h(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function Tuile({ titre, valeur, accent = false }: { titre: string; valeur: string; accent?: boolean }) {
  return (
    <div className={`${ui.carte} p-5`}>
      <p className="text-sm text-pierre-500">{titre}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${accent ? 'text-amber-700' : 'text-foret-800'}`}>{valeur}</p>
    </div>
  )
}

const LIBELLES_STATUT: Record<Statut, string> = { brouillon: 'Brouillon', soumise: 'Soumise', approuvee: 'Approuvée' }

/** CSV pour Excel (séparateur « ; », virgule décimale, BOM pour les accents). */
function exporter(debut: string, lignes: Ligne[]) {
  const nombre = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')
  const champ = (t: string) => (/[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t)
  const entete = ['Personne', 'Courriel', 'Début', 'Fin', 'Régulières sem. 1', 'Régulières sem. 2', 'Régulières', 'Vacances', 'Maladie', 'Total', 'État']
  const rangees = lignes.map((l) => [
    champ(nomDe(l.membre)),
    champ(l.membre.courriel),
    debut,
    finPeriode(debut),
    nombre(l.sem1),
    nombre(l.sem2),
    nombre(l.types.regulieres),
    nombre(l.types.vacances),
    nombre(l.types.maladie),
    nombre(l.total),
    LIBELLES_STATUT[l.statut],
  ])
  const csv = '﻿' + [entete, ...rangees].map((r) => r.join(';')).join('\r\n')
  const lien = document.createElement('a')
  lien.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  lien.download = `Feuilles de temps ${debut} au ${finPeriode(debut)}.csv`
  lien.click()
  setTimeout(() => URL.revokeObjectURL(lien.href), 1000)
}
