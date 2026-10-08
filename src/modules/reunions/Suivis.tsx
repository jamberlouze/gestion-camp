import { useState } from 'react'
import { ui } from '@/lib/ui'
import { FenetreSuivi, LigneSuivi } from './commun'
import { useDonnees } from './contexte'
import { ordreSuivis } from './outils'
import type { Suivi } from './types'

/** Tous les suivis décidés en réunion, par responsable. */
export function Suivis() {
  const { suivis, moi, ecriture } = useDonnees()
  const [qui, setQui] = useState<'moi' | 'tous'>('tous')
  const [faits, setFaits] = useState(false)
  const [nouveau, setNouveau] = useState(false)

  const liste = suivis.filter((s) => (faits ? !!s.fait_le : !s.fait_le)).filter((s) => qui === 'tous' || s.responsable_id === moi.id)
  const groupes = new Map<string, Suivi[]>()
  for (const s of [...liste].sort(faits ? (a, b) => (b.fait_le ?? '').localeCompare(a.fait_le ?? '') : ordreSuivis)) {
    const cle = s.responsable_nom ?? 'Sans responsable'
    groupes.set(cle, [...(groupes.get(cle) ?? []), s])
  }
  const noms = [...groupes.keys()].sort((a, b) => (a === 'Sans responsable' ? 1 : b === 'Sans responsable' ? -1 : a.localeCompare(b, 'fr')))

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-pierre-200 bg-white p-0.5 text-sm">
          {(['tous', 'moi'] as const).map((v) => (
            <button key={v} type="button" className={`rounded-md px-3 py-1 ${qui === v ? 'bg-foret-50 font-medium text-foret-800' : 'text-pierre-600'}`} onClick={() => setQui(v)} aria-pressed={qui === v}>
              {v === 'tous' ? 'Tout le monde' : 'Les miens'}
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-1.5 text-sm text-pierre-700">
          <input type="checkbox" className="size-4 accent-foret-700" checked={faits} onChange={(e) => setFaits(e.target.checked)} />
          Voir les suivis faits
        </label>
        {ecriture && (
          <button className={ui.bouton + ' ml-auto'} onClick={() => setNouveau(true)}>
            + Suivi
          </button>
        )}
      </div>

      {noms.length === 0 && <p className="py-6 text-center text-sm text-pierre-500">{faits ? 'Aucun suivi fait.' : 'Aucun suivi en cours.'}</p>}
      {noms.map((nom) => (
        <section key={nom} className={`${ui.carte} p-3`}>
          <h2 className="mb-2 text-sm font-semibold text-pierre-800">
            {nom} <span className="font-normal text-pierre-500">({groupes.get(nom)!.length})</span>
          </h2>
          <ul className="space-y-1.5">
            {groupes.get(nom)!.map((s) => (
              <LigneSuivi key={s.id} suivi={s} avecPoint />
            ))}
          </ul>
        </section>
      ))}
      {nouveau && <FenetreSuivi fermer={() => setNouveau(false)} />}
    </div>
  )
}
