import { IconeChevron } from '@/lib/icones'
import { menu, periodeCourante } from './outils'
import {
  libellePaie,
  libellePeriode,
  periodePrecedente,
  periodesEntre,
  periodeSuivante,
  PREMIERE_PERIODE,
} from './periodes'

/**
 * ‹ [PP21 · 4 au 17 oct. 2026] › paie du jeu. 22 oct. — de la première
 * période à un an devant (vacances planifiées). Numéros comme Employeur D.
 */
export function ChoixPeriode({ debut, onChange }: { debut: string; onChange: (d: string) => void }) {
  const courante = periodeCourante()
  let derniere = courante
  for (let i = 0; i < 26; i++) derniere = periodeSuivante(derniere)
  const liste = periodesEntre(PREMIERE_PERIODE, debut > derniere ? debut : derniere).reverse()
  const bouton =
    'inline-flex size-8 items-center justify-center rounded-lg border border-pierre-300 bg-white text-pierre-700 hover:bg-pierre-50 disabled:opacity-40'
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button
        className={bouton}
        aria-label="Période précédente"
        disabled={debut <= PREMIERE_PERIODE}
        onClick={() => onChange(periodePrecedente(debut))}
      >
        <IconeChevron className="size-4 rotate-180" />
      </button>
      <select aria-label="Période de paie" className={menu} value={debut} onChange={(e) => onChange(e.target.value)}>
        {liste.map((d) => (
          <option key={d} value={d}>
            {libellePeriode(d)}
            {d === courante ? ' (en cours)' : ''}
          </option>
        ))}
      </select>
      <button className={bouton} aria-label="Période suivante" onClick={() => onChange(periodeSuivante(debut))}>
        <IconeChevron className="size-4" />
      </button>
      <span className="text-sm text-pierre-500">{libellePaie(debut)}</span>
      {debut !== courante && (
        <button className="text-sm text-foret-700 underline" onClick={() => onChange(courante)}>
          Période en cours
        </button>
      )}
    </div>
  )
}
