import { useState } from 'react'
import { ChampTexte } from '@/lib/ChampTexte'
import { IconePlus } from '@/lib/icones'
import { Dialogue } from '@/lib/Dialogue'
import { ui } from '@/lib/ui'
import { jourCourt } from './dates'
import type { Personne, PresenceSimple } from './types'

type SecteurSimple = 'direction' | 'terrain'
type Cocher = (p: { personnel_id: string; date: string; secteur: SecteurSimple; present: boolean; description?: string | null }) => void

/**
 * Case Direction ou Terrain d'un jour dans la grille du Calendrier : les
 * personnes présentes (et leur note) ; « + » ouvre la liste à cocher.
 */
export function CellulePresence({
  jour,
  secteur,
  presences,
  personnel,
  ecriture,
  cocher,
}: {
  jour: string
  secteur: SecteurSimple
  /** Présences de ce secteur, ce jour-là. */
  presences: PresenceSimple[]
  personnel: Personne[]
  ecriture: boolean
  cocher: Cocher
}) {
  const [ouverte, setOuverte] = useState(false)
  const nom = new Map(personnel.map((p) => [p.id, p.nom]))
  const presents = [...presences].sort((a, b) => (nom.get(a.personnel_id) ?? '').localeCompare(nom.get(b.personnel_id) ?? '', 'fr'))

  return (
    <div className="relative min-h-9 border-b border-l border-pierre-200 p-1.5">
      <ul className="space-y-0.5 text-xs leading-4">
        {presents.map((p) => (
          <li key={p.id}>
            <span className="font-medium">{nom.get(p.personnel_id) ?? '?'}</span>
            {p.description && <span className="text-pierre-500"> · {p.description}</span>}
          </li>
        ))}
      </ul>
      {ecriture && (
        <button
          className={`mt-0.5 inline-flex items-center gap-0.5 rounded px-1 text-xs text-pierre-500 hover:bg-pierre-100 hover:text-pierre-800 ${presents.length ? '' : 'opacity-60'}`}
          aria-label={`${secteur === 'direction' ? 'Direction' : 'Terrain'}, ${jourCourt(jour)} : qui travaille`}
          aria-expanded={ouverte}
          onClick={() => setOuverte((o) => !o)}
        >
          <IconePlus className="size-3" />
          {presents.length ? '' : 'Ajouter'}
        </button>
      )}
      {ouverte && (
        <Dialogue titre={`${secteur === 'direction' ? 'Direction' : 'Terrain'} · ${jourCourt(jour)}`} fermer={() => setOuverte(false)}>
          <ListePresence jour={jour} secteur={secteur} presences={presences} personnel={personnel} cocher={cocher} />
          <div className="mt-4 flex justify-end">
            <button className={ui.bouton} onClick={() => setOuverte(false)}>
              OK
            </button>
          </div>
        </Dialogue>
      )}
    </div>
  )
}

function ListePresence({
  jour,
  secteur,
  presences,
  personnel,
  cocher,
}: {
  jour: string
  secteur: SecteurSimple
  presences: PresenceSimple[]
  personnel: Personne[]
  cocher: Cocher
}) {
  const parPersonne = new Map(presences.map((p) => [p.personnel_id, p]))
  // Les personnes du secteur d'abord ; les autres (et celles sans secteur) à part.
  const duSecteur = personnel.filter((p) => p.secteur_principal === secteur && (p.actif || parPersonne.has(p.id)))
  const autres = personnel.filter((p) => !duSecteur.includes(p) && (p.actif || parPersonne.has(p.id)))
  const [voirAutres, setVoirAutres] = useState(() => autres.some((p) => parPersonne.has(p.id)))

  const ligne = (p: Personne) => {
    const presence = parPersonne.get(p.id)
    return (
      <li key={p.id} className="py-1">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-foret-700"
            checked={!!presence}
            onChange={(e) => cocher({ personnel_id: p.id, date: jour, secteur, present: e.target.checked })}
          />
          {p.nom}
        </label>
        {presence && (
          <ChampTexte
            aria-label={`Note pour ${p.nom}`}
            className="ml-6 mt-1 w-[calc(100%-1.5rem)] rounded border border-pierre-200 px-2 py-0.5 text-xs focus:border-foret-600 focus:outline-none"
            placeholder="Note courte (ce qu'il ou elle fait)…"
            valeur={presence.description ?? ''}
            enregistrer={(v) => cocher({ personnel_id: p.id, date: jour, secteur, present: true, description: v || null })}
          />
        )}
      </li>
    )
  }

  return (
    <div>
      <p className="mb-2 text-sm text-pierre-500">Cochez qui travaille ce jour-là ; la note dit ce que la personne fait.</p>
      {duSecteur.length ? (
        <ul className="divide-y divide-pierre-100">{duSecteur.map(ligne)}</ul>
      ) : (
        <p className="text-xs text-pierre-500">Personne dans ce secteur (Réglages › Personnel).</p>
      )}
      {autres.length > 0 &&
        (voirAutres ? (
          <>
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-pierre-500">Autres</p>
            <ul className="divide-y divide-pierre-100">{autres.map(ligne)}</ul>
          </>
        ) : (
          <button className="mt-2 text-xs text-foret-700 underline" onClick={() => setVoirAutres(true)}>
            Autre personne…
          </button>
        ))}
    </div>
  )
}
