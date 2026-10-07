import { useState } from 'react'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { aujourdhui } from '@/shell/pokes'
import { anneeDe, dernierDimancheJuin, intervalle, nomAnnee, semainesParDefaut } from './calcul'
import { useCreerAnnee } from './donnees'

/** Crée une année et ses semaines de camp (les mois sont automatiques). */
export function NouvelleAnnee({ existantes, fermer, creee }: { existantes: number[]; fermer: () => void; creee: (annee: number) => void }) {
  const creer = useCreerAnnee()
  const proposee = Math.max(anneeDe(aujourdhui()), ...existantes.map((a) => a + 1))
  const [annee, setAnnee] = useState(proposee)
  const [semaine1, setSemaine1] = useState(dernierDimancheJuin(proposee + 1))
  const [nombre, setNombre] = useState(8)
  const [erreur, setErreur] = useState<string | null>(null)

  const semaines = semaine1 ? semainesParDefaut(annee, semaine1, nombre) : []
  const existe = existantes.includes(annee)

  const changerAnnee = (a: number) => {
    setAnnee(a)
    setSemaine1(dernierDimancheJuin(a + 1))
  }

  async function valider() {
    if (existe) return setErreur('Cette année existe déjà.')
    if (!semaines.length) return setErreur('Préciser le début de la semaine 1.')
    try {
      setErreur(null)
      await creer.mutateAsync({ annee, semaines: semaines.map((x) => ({ ...x, annee })) })
      creee(annee)
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  return (
    <Dialogue titre="Nouvelle année" fermer={fermer}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          valider()
        }}
      >
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className={ui.etiquette}>Année</span>
            <select className={ui.champ} value={annee} onChange={(e) => changerAnnee(Number(e.target.value))}>
              {[-1, 0, 1, 2].map((k) => {
                const a = proposee + k
                return (
                  <option key={a} value={a} disabled={existantes.includes(a)}>
                    {nomAnnee(a)}
                  </option>
                )
              })}
            </select>
          </label>
          <label className="block">
            <span className={ui.etiquette}>Semaine 1</span>
            <input type="date" className={ui.champ} value={semaine1} onChange={(e) => setSemaine1(e.target.value)} />
          </label>
          <label className="block">
            <span className={ui.etiquette}>Semaines</span>
            <input type="number" min={1} max={14} className={ui.champ} value={nombre} onChange={(e) => setNombre(Math.max(1, Math.min(14, Number(e.target.value) || 1)))} />
          </label>
        </div>
        <div className="max-h-56 overflow-y-auto rounded-lg border border-pierre-200 px-3 py-2 text-sm">
          {semaines.map((p) => (
            <p key={p.nom} className="flex justify-between gap-3">
              <span>{p.nom}</span>
              <span className="text-pierre-500">{intervalle(p.debut, p.fin)}</span>
            </p>
          ))}
        </div>
        <p className="text-xs text-pierre-500">Les 12 mois sont automatiques. Les semaines se modifient ensuite dans l'onglet Semaines.</p>
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button type="submit" className={ui.bouton} disabled={creer.isPending || existe}>
            Créer {nomAnnee(annee)}
          </button>
        </div>
      </form>
    </Dialogue>
  )
}
