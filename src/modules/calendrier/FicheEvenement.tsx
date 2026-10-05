import { useState } from 'react'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { dateCourte, dateLongue, jourSemaine } from './dates'
import { useEnregistrer, useRetirer } from './donnees'
import { decrireRegle, ecrireRegle, lireRegle, rangDansMois, type Regle } from './recurrence'
import { TYPES_EVENEMENT, type Evenement, type TypeEvenement } from './types'

type Frequence = 'aucune' | 'DAILY' | 'WEEKLY' | 'MONTHLY'
const ORDRE_JOURS = [1, 2, 3, 4, 5, 6, 0]
const LETTRES = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const NOMS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

/**
 * Création ou modification d'un événement. `occurrence` : date cliquée dans
 * un calendrier (permet de retirer seulement cette occurrence d'une série).
 */
export function FicheEvenement({
  evenement,
  dateDefaut,
  occurrence,
  fermer,
}: {
  evenement?: Evenement
  dateDefaut: string
  occurrence?: string
  fermer: () => void
}) {
  const enregistrer = useEnregistrer<Evenement>('evenements', true)
  const retirer = useRetirer('evenements')
  const regleInitiale = lireRegle(evenement?.regle_recurrence)

  const [titre, setTitre] = useState(evenement?.titre ?? '')
  const [type, setType] = useState<TypeEvenement>(evenement?.type ?? 'livraison')
  const [debut, setDebut] = useState(evenement?.date_debut ?? dateDefaut)
  const [fin, setFin] = useState(evenement?.date_fin ?? '')
  const [heureDebut, setHeureDebut] = useState(evenement?.heure_debut?.slice(0, 5) ?? '')
  const [heureFin, setHeureFin] = useState(evenement?.heure_fin?.slice(0, 5) ?? '')
  const [frequence, setFrequence] = useState<Frequence>(regleInitiale?.freq ?? 'aucune')
  const [intervalle, setIntervalle] = useState(regleInitiale?.intervalle ?? 1)
  const [jours, setJours] = useState<number[]>(regleInitiale?.freq === 'WEEKLY' ? regleInitiale.jours : [jourSemaine(evenement?.date_debut ?? dateDefaut)])
  const [parRang, setParRang] = useState(regleInitiale?.freq === 'MONTHLY' && !!regleInitiale.rang)
  const [finRecurrence, setFinRecurrence] = useState(evenement?.fin_recurrence ?? '')
  const [lieu, setLieu] = useState(evenement?.lieu ?? '')
  const [notes, setNotes] = useState(evenement?.notes ?? '')
  const [exceptions, setExceptions] = useState<string[]>(evenement?.exceptions ?? [])
  const [erreur, setErreur] = useState<string | null>(null)

  const rang = rangDansMois(debut)
  const regle: Regle | null =
    frequence === 'DAILY'
      ? { freq: 'DAILY', intervalle }
      : frequence === 'WEEKLY'
        ? jours.length
          ? { freq: 'WEEKLY', intervalle, jours }
          : null
        : frequence === 'MONTHLY'
          ? { freq: 'MONTHLY', intervalle, rang: parRang ? { n: rang > 4 ? -1 : rang, jour: jourSemaine(debut) } : undefined }
          : null
  const texteRegle = regle ? ecrireRegle(regle) : null

  async function valider(e: React.FormEvent) {
    e.preventDefault()
    if (!titre.trim()) return setErreur('Le titre est obligatoire.')
    if (frequence === 'WEEKLY' && !jours.length) return setErreur('Cochez au moins un jour de la semaine.')
    if (fin && fin < debut) return setErreur('La date de fin est avant la date de début.')
    if (heureDebut && heureFin && heureFin < heureDebut) return setErreur("L'heure de fin est avant l'heure de début.")
    setErreur(null)
    try {
      await enregistrer.mutateAsync({
        id: evenement?.id,
        titre: titre.trim(),
        type,
        date_debut: debut,
        date_fin: texteRegle ? null : fin && fin !== debut ? fin : null,
        heure_debut: heureDebut || null,
        heure_fin: heureFin || null,
        regle_recurrence: texteRegle,
        fin_recurrence: texteRegle && finRecurrence ? finRecurrence : null,
        exceptions: texteRegle ? exceptions.filter((d) => d >= debut) : [],
        lieu: lieu.trim() || null,
        notes: notes.trim() || null,
      })
      fermer()
    } catch (err) {
      setErreur(messageErreur(err))
    }
  }

  async function supprimer() {
    if (!evenement) return
    const serie = !!evenement.regle_recurrence
    if (!(await confirmer({ titre: serie ? 'Supprimer toute la série ?' : `Supprimer « ${evenement.titre} » ?`, message: "Il reste consultable dans le journal." }))) return
    try {
      await retirer.mutateAsync(evenement.id)
      fermer()
    } catch (err) {
      setErreur(messageErreur(err))
    }
  }

  async function retirerOccurrence() {
    if (!evenement || !occurrence) return
    try {
      await enregistrer.mutateAsync({ id: evenement.id, exceptions: [...new Set([...(evenement.exceptions ?? []), occurrence])].sort() })
      fermer()
    } catch (err) {
      setErreur(messageErreur(err))
    }
  }

  return (
    <Dialogue titre={evenement ? "Modifier l'événement" : 'Nouvel événement'} fermer={fermer}>
      <form className="space-y-3" onSubmit={valider}>
        <div>
          <label className={ui.etiquette} htmlFor="ev-titre">
            Titre
          </label>
          <input id="ev-titre" className={ui.champ} value={titre} onChange={(e) => setTitre(e.target.value)} autoFocus={!evenement} placeholder="Livraison Colabor, inspection autobus…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={ui.etiquette} htmlFor="ev-type">
              Type
            </label>
            <select id="ev-type" className={ui.champ} value={type} onChange={(e) => setType(e.target.value as TypeEvenement)}>
              {Object.entries(TYPES_EVENEMENT).map(([cle, t]) => (
                <option key={cle} value={cle}>
                  {t.icone} {t.libelle}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="ev-lieu">
              Lieu
            </label>
            <input id="ev-lieu" className={ui.champ} value={lieu} onChange={(e) => setLieu(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={ui.etiquette} htmlFor="ev-debut">
              {frequence === 'aucune' ? 'Date' : 'À partir du'}
            </label>
            <input id="ev-debut" type="date" required className={ui.champ} value={debut} onChange={(e) => setDebut(e.target.value)} />
          </div>
          {frequence === 'aucune' ? (
            <div>
              <label className={ui.etiquette} htmlFor="ev-fin">
                Jusqu'au (facultatif)
              </label>
              <input id="ev-fin" type="date" className={ui.champ} value={fin} min={debut} onChange={(e) => setFin(e.target.value)} />
            </div>
          ) : (
            <div>
              <label className={ui.etiquette} htmlFor="ev-fin-rec">
                Jusqu'au (facultatif)
              </label>
              <input id="ev-fin-rec" type="date" className={ui.champ} value={finRecurrence} min={debut} onChange={(e) => setFinRecurrence(e.target.value)} />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={ui.etiquette} htmlFor="ev-hd">
              Heure de début
            </label>
            <input id="ev-hd" type="time" className={ui.champ} value={heureDebut} onChange={(e) => setHeureDebut(e.target.value)} />
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="ev-hf">
              Heure de fin
            </label>
            <input id="ev-hf" type="time" className={ui.champ} value={heureFin} onChange={(e) => setHeureFin(e.target.value)} />
          </div>
        </div>

        <fieldset className="rounded-lg border border-pierre-200 p-3">
          <legend className="px-1 text-xs font-medium uppercase tracking-wide text-pierre-500">Répétition</legend>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Fréquence" className={`${ui.champ} w-auto!`} value={frequence} onChange={(e) => setFrequence(e.target.value as Frequence)}>
              <option value="aucune">Une seule fois</option>
              <option value="DAILY">Chaque jour</option>
              <option value="WEEKLY">Chaque semaine</option>
              <option value="MONTHLY">Chaque mois</option>
            </select>
            {frequence !== 'aucune' && (
              <label className="flex items-center gap-1.5 text-sm">
                {frequence === 'WEEKLY' ? 'toutes les' : 'tous les'}
                <input
                  type="number"
                  min={1}
                  max={12}
                  className={`${ui.champ} w-16`}
                  value={intervalle}
                  onChange={(e) => setIntervalle(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                />
                {frequence === 'DAILY' ? 'jours' : frequence === 'WEEKLY' ? 'semaines' : 'mois'}
              </label>
            )}
          </div>
          {frequence === 'WEEKLY' && (
            <div className="mt-2 flex gap-1" role="group" aria-label="Jours de la semaine">
              {ORDRE_JOURS.map((j) => {
                const actif = jours.includes(j)
                return (
                  <button
                    type="button"
                    key={j}
                    title={NOMS[j]}
                    aria-pressed={actif}
                    className={`size-9 rounded-full text-sm font-medium ${actif ? 'bg-foret-700 text-white' : 'border border-pierre-300 text-pierre-700 hover:bg-pierre-50'}`}
                    onClick={() => setJours(actif ? jours.filter((x) => x !== j) : [...jours, j].sort())}
                  >
                    {LETTRES[j]}
                  </button>
                )
              })}
            </div>
          )}
          {frequence === 'MONTHLY' && (
            <select aria-label="Jour du mois" className={`${ui.champ} mt-2`} value={parRang ? 'rang' : 'date'} onChange={(e) => setParRang(e.target.value === 'rang')}>
              <option value="date">Le {Number(debut.slice(8))} du mois</option>
              <option value="rang">
                Le {rang > 4 ? 'dernier' : rang === 1 ? '1er' : `${rang}e`} {NOMS[jourSemaine(debut)]} du mois
              </option>
            </select>
          )}
          {texteRegle && <p className="mt-2 text-sm text-pierre-600">{decrireRegle(texteRegle, debut)}{finRecurrence ? `, jusqu'au ${dateCourte(finRecurrence)}` : ''}.</p>}
          {texteRegle && exceptions.length > 0 && (
            <div className="mt-2 text-sm">
              <p className="text-pierre-600">Occurrences retirées :</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {exceptions.map((d) => (
                  <li key={d} className="flex items-center gap-1 rounded-full bg-pierre-100 px-2 py-0.5 text-xs">
                    {dateCourte(d)}
                    <button type="button" className="text-pierre-500 hover:text-pierre-900" aria-label={`Remettre le ${dateCourte(d)}`} onClick={() => setExceptions(exceptions.filter((x) => x !== d))}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </fieldset>

        <div>
          <label className={ui.etiquette} htmlFor="ev-notes">
            Notes
          </label>
          <textarea id="ev-notes" rows={3} className={ui.champ} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {erreur && <p className={ui.erreur}>{erreur}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap gap-1">
            {evenement && (
              <button type="button" className={ui.boutonDanger} onClick={supprimer}>
                {evenement.regle_recurrence ? 'Supprimer la série' : 'Supprimer'}
              </button>
            )}
            {evenement?.regle_recurrence && occurrence && (
              <button type="button" className={ui.boutonDanger} onClick={retirerOccurrence} title={dateLongue(occurrence)}>
                Retirer le {dateCourte(occurrence)}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
              Annuler
            </button>
            <button className={ui.bouton} disabled={enregistrer.isPending}>
              Enregistrer
            </button>
          </div>
        </div>
      </form>
    </Dialogue>
  )
}
