import { useMemo } from 'react'
import { ui } from '@/lib/ui'
import { useSemaine } from './contexte'
import { conflitsGrille } from './logique'

export function Puce({ niveau, children }: { niveau: 'err' | 'soft' | 'ok'; children: React.ReactNode }) {
  const style = { err: 'bg-[#d03b3b]/10 border-[#d03b3b]/40', soft: 'bg-amber-100 border-amber-300', ok: 'bg-[#0ca30c]/10 border-[#0ca30c]/40' }[niveau]
  const icone = { err: '✕', soft: '!', ok: '✓' }[niveau]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium text-pierre-900 ${style}`}>
      <span aria-hidden className="font-bold">
        {icone}
      </span>
      {children}
    </span>
  )
}

export function Conflits() {
  const { etat, reglages } = useSemaine()
  const { conflits, vides } = useMemo(() => conflitsGrille(etat, reglages), [etat, reglages])
  const erreurs = conflits.filter((c) => c.sev === 'err')
  const doux = conflits.filter((c) => c.sev === 'soft')
  const s = (n: number) => (n > 1 ? 's' : '')

  return (
    <div className={`${ui.carte} p-5`}>
      <div className="flex flex-wrap gap-2">
        <Puce niveau={erreurs.length ? 'err' : 'ok'}>
          {erreurs.length} conflit{s(erreurs.length)} bloquant{s(erreurs.length)}
        </Puce>
        <Puce niveau={doux.length ? 'soft' : 'ok'}>
          {doux.length} dépassement{s(doux.length)} de capacité
        </Puce>
        <Puce niveau={vides.length ? 'soft' : 'ok'}>
          {vides.length} case{s(vides.length)} vide{s(vides.length)}
        </Puce>
      </div>
      {!conflits.length && !vides.length && <p className="mt-4 text-sm">✅ Aucun problème détecté. Bel horaire !</p>}
      {conflits.length > 0 && (
        <ul className="mt-4 divide-y divide-pierre-100 text-sm">
          {conflits.map((c, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 py-2">
              <Puce niveau={c.sev}>{c.kind}</Puce>
              <b>
                {c.day} {c.time}
              </b>
              — {c.msg} <span className="text-pierre-500">({c.groups.join(', ')})</span>
            </li>
          ))}
        </ul>
      )}
      {vides.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-pierre-500">
            {vides.length} cases vides (hors jours de congé) — voir la liste
          </summary>
          <ul className="mt-2 columns-2 text-pierre-700 sm:columns-3">
            {vides.slice(0, 120).map((v, i) => (
              <li key={i}>
                Gr. {v.group} — {v.day} {v.period}
              </li>
            ))}
            {vides.length > 120 && <li>… et {vides.length - 120} autres</li>}
          </ul>
        </details>
      )}
    </div>
  )
}
