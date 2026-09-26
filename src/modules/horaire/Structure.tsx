import { useState } from 'react'
import { Dialogue } from '@/lib/Dialogue'
import { ui } from '@/lib/ui'
import { useSemaine } from './contexte'
import { useReglages } from './donnees'
import { erreurPeriodes, joursConsecutifs, lireJours, memesNuits, nuitsDe, pertesStructure, restructurer, resumeJours, type Structure } from './logique'
import { JOURS_SEMAINE } from './types'

interface LignePeriode {
  /** Clé d'affichage stable (les libellés changent pendant la saisie). */
  id: number
  origine: number | null
  libelle: string
}

const liste = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}` : l.join(''))

/**
 * Jours, périodes et nuits avec soirées de l'horaire ouvert (séjour de 2,
 * 3, 4 jours, semaine de 7 jours…). Le contenu suit son jour et sa période.
 */
export function JoursEtPeriodes({ fermer }: { fermer: () => void }) {
  const { etat, horaire, remplacer } = useSemaine()
  const communes = useReglages().nuits
  const [depart] = useState(() => JSON.stringify([etat.jours, etat.periodes]))

  const suite = lireJours(etat.jours)
  const [premier, setPremier] = useState(suite?.premier ?? etat.jours[0] ?? 'Lundi')
  const [nombre, setNombre] = useState(suite?.nombre ?? Math.min(7, Math.max(1, etat.jours.length)))
  // Jours actuels qui ne se suivent pas (ancien classeur) : gardés tant qu'on n'y touche pas.
  const [joursLibres, setJoursLibres] = useState(!suite && etat.jours.length > 0)
  const jours = joursLibres ? etat.jours : joursConsecutifs(premier, nombre)

  const [prochainId, setProchainId] = useState(etat.periodes.length)
  const [periodes, setPeriodes] = useState<LignePeriode[]>(etat.periodes.map((libelle, origine) => ({ id: origine, origine, libelle })))
  const [nuits, setNuits] = useState<string[]>(nuitsDe(etat, communes))
  const [message, setMessage] = useState<string | null>(null)

  // Soirs proposés : ceux du séjour, plus ceux déjà cochés, dans l'ordre du
  // séjour ; puis les nuits des Réglages qui ne sont pas un nom de jour.
  const debut = Math.max(0, JOURS_SEMAINE.indexOf(jours[0] ?? 'Lundi'))
  const ordre = Array.from({ length: 7 }, (_, k) => JOURS_SEMAINE[(debut + k) % 7])
  const libres = [...new Set([...communes, ...nuits])].filter((n) => !JOURS_SEMAINE.includes(n))
  const soirs = [...ordre.filter((j) => jours.includes(j) || nuits.includes(j)), ...libres]
  const nuitsChoisies = soirs.filter((j) => nuits.includes(j))
  const commeCommunes = memesNuits(nuitsChoisies, communes)

  const structure: Structure = {
    jours,
    periodes: periodes.map(({ origine, libelle }) => ({ origine, libelle: libelle.trim() })),
    nuits: commeCommunes ? null : nuitsChoisies,
  }
  const probleme = (jours.length ? null : 'Il faut au moins un jour.') ?? erreurPeriodes(periodes.map((p) => p.libelle))
  const pertes = probleme ? null : pertesStructure(etat, structure, communes)

  const majPeriode = (id: number, libelle: string) => setPeriodes((l) => l.map((p) => (p.id === id ? { ...p, libelle } : p)))
  const deplacer = (i: number, sens: -1 | 1) =>
    setPeriodes((l) => {
      const n = [...l]
      ;[n[i], n[i + sens]] = [n[i + sens], n[i]]
      return n
    })

  function appliquer() {
    if (probleme || !pertes) return
    if (JSON.stringify([etat.jours, etat.periodes]) !== depart) {
      return setMessage("L'horaire a changé pendant la modification (autre personne ?). Fermez et rouvrez cette fenêtre.")
    }
    const effaces = [
      pertes.jours.length ? `les activités du ${liste(pertes.jours)}` : '',
      pertes.periodes.length ? `les activités de la période ${liste(pertes.periodes.map((p) => `« ${p} »`))}` : '',
      pertes.transport.length ? `les infos de transport de la période ${liste(pertes.transport.map((p) => `« ${p} »`))}` : '',
      pertes.nuits.length ? `les tâches de soirée du ${liste(pertes.nuits)}` : '',
    ].filter(Boolean)
    if (effaces.length && !confirm(`Cette modification efface ${liste(effaces)}. Continuer ?`)) return
    remplacer(restructurer(etat, structure, communes))
    fermer()
  }

  return (
    <Dialogue titre={`Jours et périodes — ${horaire.nom}`} fermer={fermer}>
      <div className="space-y-5">
        <section>
          <h3 className="text-sm font-semibold">Jours</h3>
          {joursLibres && (
            <p className="mt-1 text-sm text-pierre-500">Jours actuels : {etat.jours.join(', ')} (ne se suivent pas).</p>
          )}
          <div className="mt-2 grid grid-cols-2 gap-3">
            <label className="block">
              <span className={ui.etiquette}>Premier jour</span>
              <select
                className={ui.champ}
                value={premier}
                onChange={(e) => {
                  setPremier(e.target.value)
                  setJoursLibres(false)
                }}
              >
                {JOURS_SEMAINE.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={ui.etiquette}>Nombre de jours</span>
              <select
                className={ui.champ}
                value={nombre}
                onChange={(e) => {
                  setNombre(Number(e.target.value))
                  setJoursLibres(false)
                }}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-1.5 text-sm text-pierre-700">→ {resumeJours(jours)}</p>
          <p className="text-xs text-pierre-500">Chaque activité reste sur son jour (le Mardi reste le Mardi).</p>
        </section>

        <section>
          <h3 className="text-sm font-semibold">Périodes</h3>
          <p className="text-xs text-pierre-500">Dans l'ordre de la journée. Une période renommée ou déplacée garde ses activités.</p>
          <ol className="mt-2 space-y-1.5">
            {periodes.map((p, i) => (
              <li key={p.id} className="flex items-center gap-1.5">
                <input
                  aria-label={`Période ${i + 1}`}
                  className={`${ui.champ} py-1.5`}
                  value={p.libelle}
                  placeholder="ex. 19h00 - 20h00"
                  onChange={(e) => majPeriode(p.id, e.target.value)}
                />
                <button type="button" aria-label="Monter" className="rounded px-1.5 py-1 text-pierre-500 hover:bg-pierre-100 disabled:opacity-30" disabled={i === 0} onClick={() => deplacer(i, -1)}>
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Descendre"
                  className="rounded px-1.5 py-1 text-pierre-500 hover:bg-pierre-100 disabled:opacity-30"
                  disabled={i === periodes.length - 1}
                  onClick={() => deplacer(i, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Retirer la période ${p.libelle}`}
                  className="rounded px-1.5 py-1 text-red-700 hover:bg-red-50"
                  onClick={() => setPeriodes((l) => l.filter((x) => x.id !== p.id))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className={`${ui.boutonSecondaire} mt-2`}
            onClick={() => {
              setPeriodes((l) => [...l, { id: prochainId, origine: null, libelle: '' }])
              setProchainId((n) => n + 1)
            }}
          >
            + Période
          </button>
        </section>

        <section>
          <h3 className="text-sm font-semibold">Soirées</h3>
          <p className="text-xs text-pierre-500">Soirs avec jeu de soirée, surveillance pré-jeu et chouettes (onglet Soirées).</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
            {soirs.map((j) => (
              <label key={j} className="inline-flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={nuits.includes(j)}
                  onChange={(e) => setNuits((l) => (e.target.checked ? [...l, j] : l.filter((x) => x !== j)))}
                />
                {j}
                {JOURS_SEMAINE.includes(j) && !jours.includes(j) && <span className="text-xs text-pierre-500">(hors séjour)</span>}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-pierre-500">
            {commeCommunes ? (
              'Les mêmes que dans les Réglages (communs à toutes les semaines).'
            ) : (
              <>
                Propres à {horaire.modele ? 'ce modèle' : 'cet horaire'}.{' '}
                <button type="button" className="text-foret-700 underline" onClick={() => setNuits(communes)}>
                  Reprendre celles des Réglages ({communes.join(', ') || 'aucune'})
                </button>
              </>
            )}
          </p>
        </section>

        {(probleme || message) && <p className={ui.erreur}>{probleme ?? message}</p>}
        {pertes && (pertes.jours.length > 0 || pertes.periodes.length > 0 || pertes.transport.length > 0 || pertes.nuits.length > 0) && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Seront effacées :{' '}
            {[
              pertes.jours.length ? `activités du ${liste(pertes.jours)}` : '',
              pertes.periodes.length ? `activités de ${liste(pertes.periodes.map((p) => `« ${p} »`))}` : '',
              pertes.transport.length ? `infos de transport de ${liste(pertes.transport.map((p) => `« ${p} »`))}` : '',
              pertes.nuits.length ? `tâches de soirée du ${liste(pertes.nuits)}` : '',
            ]
              .filter(Boolean)
              .join(' ; ')}
            .
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-pierre-100 pt-4">
          <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button type="button" className={ui.bouton} disabled={!!probleme} onClick={appliquer}>
            Appliquer
          </button>
        </div>
      </div>
    </Dialogue>
  )
}
