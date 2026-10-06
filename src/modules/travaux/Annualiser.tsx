import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { MOIS_EXERCICE, NOMS_MOIS_COURTS } from '@/modules/mastertimeline/calendrier'
import { useReferences } from '@/modules/mastertimeline/donnees'
import { offertPour } from '@/modules/mastertimeline/outils'
import { annualiser } from './donnees'
import type { Tache } from './types'

/**
 * Envoie une tâche dans Mastertimeline (tâche annuelle) : la ponctuelle est
 * fermée avec un lien vers elle (travaux.annualiser, une transaction).
 * En ligne seulement ; réservé à la direction qui écrit dans Mastertimeline.
 */
export function Annualiser({ tache: t, retour, fermer }: { tache: Tache; retour: () => void; fermer: () => void }) {
  const refs = useReferences()
  const client = useQueryClient()
  const [mois, setMois] = useState<number[]>(() => [Number((t.echeance ?? new Date().toLocaleDateString('sv-SE')).slice(5, 7))])
  const [entreprise, setEntreprise] = useState('')
  const [projet, setProjet] = useState('')
  const [responsable, setResponsable] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function envoyer(e: FormEvent) {
    e.preventDefault()
    if (!mois.length) return setErreur('Choisis au moins un mois.')
    setEnCours(true)
    setErreur(null)
    try {
      await annualiser({ tache: t.id, mois, entreprise: entreprise || null, projet: projet || null, responsable: responsable || null })
      await Promise.all([client.invalidateQueries({ queryKey: ['travaux'] }), client.invalidateQueries({ queryKey: ['mastertimeline'] })])
      fermer()
    } catch (err) {
      setErreur(messageErreur(err))
      setEnCours(false)
    }
  }

  const basculer = (m: number) => setMois(mois.includes(m) ? mois.filter((x) => x !== m) : [...mois, m])

  return (
    <Dialogue titre="Envoyer vers Mastertimeline" fermer={fermer}>
      <form onSubmit={envoyer} className="space-y-4">
        <p className="text-sm text-pierre-600">
          « {t.titre} » deviendra une tâche qui revient chaque année dans Mastertimeline. Ici, elle sera fermée avec un lien vers
          elle. La description devient la note permanente.
        </p>
        <div>
          <span className={ui.etiquette}>Revient en</span>
          <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="Mois">
            {MOIS_EXERCICE.map((m) => {
              const choisi = mois.includes(m)
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={choisi}
                  className={`rounded-md border px-1 py-1.5 text-xs ${choisi ? 'border-foret-700 bg-foret-700 text-white' : 'border-pierre-300 bg-white text-pierre-700 hover:border-foret-600'}`}
                  onClick={() => basculer(m)}
                >
                  {NOMS_MOIS_COURTS[m - 1]}
                </button>
              )
            })}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={ui.etiquette}>Entreprise</span>
            <select
              className={ui.champ}
              value={entreprise}
              onChange={(e) => {
                const p = projet ? refs.projet.get(projet) : null
                setEntreprise(e.target.value)
                if (p && !offertPour(p, e.target.value || null)) setProjet('')
              }}
            >
              <option value="">—</option>
              {refs.entreprises.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nom}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={ui.etiquette}>Projet</span>
            <select className={ui.champ} value={projet} onChange={(e) => setProjet(e.target.value)}>
              <option value="">—</option>
              {refs.projets
                .filter((p) => offertPour(p, entreprise || null))
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nom}
                  </option>
                ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className={ui.etiquette}>Responsable</span>
            <select className={ui.champ} value={responsable} onChange={(e) => setResponsable(e.target.value)}>
              <option value="">—</option>
              {refs.responsables
                .filter((r) => r.actif)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nom}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex gap-2">
          <button type="submit" className={ui.bouton} disabled={enCours || !refs.pret}>
            {enCours ? 'Envoi…' : 'Envoyer'}
          </button>
          <button type="button" className={ui.boutonSecondaire} onClick={retour}>
            Retour
          </button>
        </div>
      </form>
    </Dialogue>
  )
}
