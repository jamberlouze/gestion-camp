import { useMemo } from 'react'
import { lignesAuto } from './calcul'
import { useDonnees } from './contexte'
import { useEstimes, useLignes } from './donnees'
import { ecartEstime, resumeEcart } from './ecartEstime'
import type { Reservation } from './types'

// Haut de la fiche (réunion du 2026-10-21, lot F) : le séjour ne correspond
// plus à l'estimé accepté (nombre de participants, accompagnateurs, dates,
// repas…). Avant la signature : faire un nouvel estimé ; après : l'estimé
// final avant la facture finale (« Mettre le devis à jour » prend la
// dernière version acceptée).

const FINIES: Reservation['etape'][] = ['facture_finale', 'soldee']

export function BandeauEstime({ r }: { r: Reservation }) {
  const { catalogue } = useDonnees()
  const estimes = useEstimes(r.id)
  const liste = estimes.data ?? []
  const accepte = [...liste].reverse().find((e) => e.statut === 'accepte')
  // Estimé figé avant le 2026-10-21 (sans séjour gardé) : on compare ses lignes calculées.
  const lignes = useLignes(accepte && !accepte.sejour && !accepte.importe ? accepte.id : null)
  const calcul = useMemo(() => lignesAuto(r, catalogue).lignes, [r, catalogue])

  if (!accepte || r.fermeture === 'closed_lost' || r.fermeture === 'annulee' || FINIES.includes(r.etape)) return null
  const ecart = ecartEstime(accepte, r, lignes.data ?? null, calcul)
  if (!ecart) return null
  const brouillon = liste.find((e) => e.statut === 'brouillon' && e.version > accepte.version)

  return (
    <div role="status" className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-semibold">
          Le séjour a changé depuis l'estimé accepté (v{accepte.version}){ecart.sejour.length ? ` : ${resumeEcart(ecart)}` : ''}
        </p>
        {ecart.lignes.length > 0 && <p className="text-amber-900/90">Les lignes calculées ne correspondent plus : {resumeEcart(ecart)}.</p>}
        <p>
          {r.signe_le
            ? brouillon
              ? `Contrat signé : l'estimé final (brouillon v${brouillon.version}) est commencé. Vérifiez-le (« Recalculer »), envoyez-le et faites-le accepter avant la facture finale ; « Mettre le devis à jour » (Facturation) le reprendra.`
              : "Contrat signé : faites l'estimé final (nouvelle version) avant la facture finale, qui doit prendre les données les plus à jour. Une fois cette version acceptée, « Mettre le devis à jour » (Facturation) la reprend."
            : brouillon
              ? `Le brouillon v${brouillon.version} est commencé : vérifiez-le (« Recalculer »), envoyez-le et faites-le accepter par le client.`
              : 'Faites un nouvel estimé et faites-le accepter par le client.'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => document.getElementById('estime')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        className="shrink-0 self-start rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
      >
        {brouillon ? `Voir le brouillon v${brouillon.version}` : r.signe_le ? "Faire l'estimé final" : 'Faire un nouvel estimé'}
      </button>
    </div>
  )
}
