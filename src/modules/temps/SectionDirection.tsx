import { Link } from 'react-router'
import { PuceCompagnie } from '@/lib/PuceCompagnie'
import { nomDe } from './donnees'
import type { LigneDirection } from './direction'
import { PastilleStatut } from './Statut'
import { formatHeures } from './periodes'

/**
 * Rangées de la section Direction de la grille des employés (admins
 * seulement) : heures lues de la feuille de chacun, jamais saisies ici ; on
 * corrige dans sa feuille (clic sur le nom). Mêmes colonnes que les employés.
 */
export function RangeesDirection({
  lignes,
  jours,
  debut,
  avecTitre,
  classeJour,
  coupure,
}: {
  lignes: LigneDirection[]
  jours: string[]
  debut: string
  avecTitre: boolean
  classeJour: (jour: string) => string
  coupure: (i: number) => string
}) {
  if (!lignes.length) return null
  return (
    <>
      {avecTitre && (
        <tr className="bg-pierre-50">
          <th className="sticky left-0 z-10 bg-pierre-50 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-pierre-600">
            Direction <span className="font-normal normal-case tracking-normal text-pierre-500">· admins seulement</span>
          </th>
          <td colSpan={jours.length + 4} />
        </tr>
      )}
      {lignes.map((l) => {
        const autres = [
          l.vacances ? `Vacances ${formatHeures(l.vacances)} h` : null,
          l.maladie ? `Maladie ${formatHeures(l.maladie)} h` : null,
          l.banque ? `Prises en banque ${formatHeures(l.banque)} h` : null,
        ].filter(Boolean)
        return (
          <tr key={l.cle} className="break-inside-avoid">
            <th className="sticky left-0 z-10 min-w-40 bg-white px-3 py-1 text-left font-normal whitespace-nowrap">
              <span className="flex items-center gap-1.5 font-medium text-pierre-900">
                <Link
                  to={`/temps/personne/${l.membre.id}?periode=${debut}&retour=employes`}
                  className="underline decoration-pierre-300 hover:text-foret-700"
                  title="Ouvrir sa feuille"
                >
                  {nomDe(l.membre)}
                </Link>
                {!l.membre.actif && <span className="text-xs font-normal text-pierre-400">(inactif)</span>}
                {l.statut && <PastilleStatut statut={l.statut} className="px-1.5! py-px!" />}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-pierre-500">
                {l.compagnie ? (
                  <PuceCompagnie compagnie={l.compagnie} court className="px-1.5! py-px!" />
                ) : (
                  <span className="rounded-full bg-amber-100 px-1.5 py-px font-medium text-amber-800 print:hidden" title="À choisir dans Employeur D › Réglages">
                    Compagnie de paie ?
                  </span>
                )}
                {l.membre.role === 'admin' ? 'Admin' : 'Direction'}
              </span>
              {autres.length > 0 && <span className="block text-xs font-medium text-amber-800">{autres.join(' · ')}</span>}
            </th>
            {jours.map((j, i) => (
              <td key={j} className={`px-0.5 py-1 text-center ${classeJour(j)} ${coupure(i)}`}>
                <span className="inline-block w-11 tabular-nums">{l.parJour.has(j) ? formatHeures(l.parJour.get(j)!) : ''}</span>
              </td>
            ))}
            <td className="border-l-2 border-pierre-300 px-2 py-1 text-right tabular-nums text-pierre-700">{formatHeures(l.sem1)}</td>
            <td className="px-2 py-1 text-right tabular-nums text-pierre-700">{formatHeures(l.sem2)}</td>
            <td className="px-2 py-1 text-right font-semibold tabular-nums">{formatHeures(l.total)}</td>
            <td className="max-w-56 truncate px-3 py-1 text-xs text-pierre-600" title={l.note || undefined}>
              {l.note}
            </td>
          </tr>
        )
      })}
    </>
  )
}
