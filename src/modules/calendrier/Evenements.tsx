import { useState } from 'react'
import { IconePlus } from '@/lib/icones'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { Chargement, Section } from './commun'
import { aujourdhui, dateCourte, depuisIso, plageHeures } from './dates'
import { useEcriture, useEvenements } from './donnees'
import { FicheEvenement } from './FicheEvenement'
import { decrireRegle, prochaine } from './recurrence'
import { TYPES_EVENEMENT, type Evenement, type TypeEvenement } from './types'

/** Événements hors séjour : récurrents, à venir, passés. */
export function Evenements() {
  const ecriture = useEcriture()
  const evenements = useEvenements()
  const [fiche, setFiche] = useState<{ evenement?: Evenement } | null>(null)
  const [type, setType] = useState<TypeEvenement | ''>('')
  const [passes, setPasses] = useState(false)
  const auj = aujourdhui()

  const liste = (evenements.data ?? []).filter((e) => !type || e.type === type)
  const recurrents = liste
    .filter((e) => e.regle_recurrence)
    .map((e) => ({ e, suivante: prochaine(e, auj) }))
    .sort((a, b) => (a.suivante ?? '9999').localeCompare(b.suivante ?? '9999') || a.e.titre.localeCompare(b.e.titre, 'fr'))
  const ponctuels = liste.filter((e) => !e.regle_recurrence)
  const aVenir = ponctuels.filter((e) => (e.date_fin ?? e.date_debut) >= auj)
  const anciens = ponctuels.filter((e) => (e.date_fin ?? e.date_debut) < auj).reverse()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Type" className={`${ui.champ} w-auto!`} value={type} onChange={(e) => setType(e.target.value as TypeEvenement | '')}>
          <option value="">Tous les types</option>
          {Object.entries(TYPES_EVENEMENT).map(([cle, t]) => (
            <option key={cle} value={cle}>
              {t.icone} {t.libelle}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        {ecriture && (
          <button className={ui.bouton} onClick={() => setFiche({})}>
            <IconePlus /> Nouvel événement
          </button>
        )}
      </div>
      {evenements.error && <p className={ui.erreur}>{messageErreur(evenements.error)}</p>}
      {!evenements.data ? (
        <Chargement />
      ) : (
        <>
          <Section titre="Récurrents" compte={recurrents.length}>
            {!recurrents.length ? (
              <p className="text-sm text-pierre-500">Aucun événement récurrent (livraisons du mardi et du jeudi, inspections…).</p>
            ) : (
              <Liste
                lignes={recurrents.map(({ e, suivante }) => ({
                  e,
                  quand: decrireRegle(e.regle_recurrence, e.date_debut),
                  detail: suivante ? `prochain : ${dateCourte(suivante)}` : 'terminé',
                }))}
                ouvrir={(e) => setFiche({ evenement: e })}
              />
            )}
          </Section>
          <Section titre="À venir" compte={aVenir.length}>
            {!aVenir.length ? (
              <p className="text-sm text-pierre-500">Aucun événement ponctuel à venir.</p>
            ) : (
              <Liste lignes={aVenir.map((e) => ({ e, quand: periode(e) }))} ouvrir={(e) => setFiche({ evenement: e })} />
            )}
          </Section>
          {anciens.length > 0 && (
            <div>
              <button className="text-sm text-foret-700 underline" onClick={() => setPasses(!passes)}>
                {passes ? 'Masquer' : 'Afficher'} les événements passés ({anciens.length})
              </button>
              {passes && (
                <div className="mt-3">
                  <Section titre="Passés">
                    <Liste lignes={anciens.map((e) => ({ e, quand: periode(e) }))} ouvrir={(e) => setFiche({ evenement: e })} />
                  </Section>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {fiche && <FicheEvenement evenement={fiche.evenement} dateDefaut={auj} fermer={() => setFiche(null)} />}
    </div>
  )
}

function periode(e: Evenement): string {
  const annee = (iso: string) => depuisIso(iso).getFullYear()
  const fin = e.date_fin && e.date_fin !== e.date_debut ? e.date_fin : null
  return fin ? `du ${dateCourte(e.date_debut)} au ${dateCourte(fin)} ${annee(fin)}` : `${dateCourte(e.date_debut)} ${annee(e.date_debut)}`
}

function Liste({ lignes, ouvrir }: { lignes: { e: Evenement; quand: string; detail?: string }[]; ouvrir: (e: Evenement) => void }) {
  const ecriture = useEcriture()
  return (
    <ul className="divide-y divide-pierre-100">
      {lignes.map(({ e, quand, detail }) => (
        <li key={e.id}>
          <button className="flex w-full items-start gap-3 py-2 text-left disabled:cursor-default" disabled={!ecriture} onClick={() => ouvrir(e)}>
            <span className="text-lg leading-6" aria-hidden>
              {TYPES_EVENEMENT[e.type].icone}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{e.titre}</span>
              <span className="block text-sm text-pierre-600">
                {[quand, plageHeures(e.heure_debut, e.heure_fin), e.lieu].filter(Boolean).join(' · ')}
              </span>
              {e.notes && <span className="block truncate text-sm text-pierre-500">{e.notes}</span>}
            </span>
            {detail && <span className="shrink-0 text-xs text-pierre-500">{detail}</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}
