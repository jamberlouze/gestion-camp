import type { ReactNode } from 'react'
import { IconeChevron } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { aujourdhui, estIso } from './dates'
import { META_SECTEUR, type Secteur } from './types'

/** ← titre → avec un choix de date et un retour à aujourd'hui. */
export function NavDate({
  titre,
  date,
  choisir,
  precedent,
  suivant,
  droite,
}: {
  titre: ReactNode
  date: string
  choisir: (d: string) => void
  precedent: string
  suivant: string
  droite?: ReactNode
}) {
  const auj = aujourdhui()
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button className={`${ui.boutonSecondaire} px-2.5`} aria-label="Précédent" onClick={() => choisir(precedent)}>
          <IconeChevron className="size-4 rotate-180" />
        </button>
        <button className={`${ui.boutonSecondaire} px-2.5`} aria-label="Suivant" onClick={() => choisir(suivant)}>
          <IconeChevron className="size-4" />
        </button>
      </div>
      <h2 className="order-first w-full min-w-0 text-lg font-semibold first-letter:uppercase sm:order-none sm:w-auto sm:flex-1">{titre}</h2>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {date !== auj && (
          <button className={ui.boutonSecondaire} onClick={() => choisir(auj)}>
            Aujourd'hui
          </button>
        )}
        <input
          type="date"
          aria-label="Aller à la date"
          className={`${ui.champ} w-auto! py-1.5`}
          value={date}
          onChange={(e) => estIso(e.target.value) && choisir(e.target.value)}
        />
        {droite}
      </div>
    </div>
  )
}

export function PastilleSecteur({ secteur }: { secteur: Secteur }) {
  return <span className={`inline-block size-2 shrink-0 rounded-full ${META_SECTEUR[secteur].pastille}`} aria-hidden />
}

export function Chargement() {
  return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
}

export function Section({ titre, compte, droite, children }: { titre: string; compte?: number; droite?: ReactNode; children: ReactNode }) {
  return (
    <section className={`${ui.carte} p-4`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-semibold">
          {titre}
          {compte !== undefined && <span className="ml-2 text-sm font-normal text-pierre-500">{compte}</span>}
        </h3>
        {droite}
      </div>
      {children}
    </section>
  )
}
