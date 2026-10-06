import { useState } from 'react'
import { Link } from 'react-router'
import { Section } from './commun'
import type { Donnees } from './donnees'
import { comparer, comparerFaites, useDroits } from './outils'

const QUATORZE_JOURS = 14 * 24 * 60 * 60 * 1000

/** Accueil du module : ce qui m'est assigné, mes signalements, les tâches libres. */
export function MesTaches({ d }: { d: Donnees }) {
  const droits = useDroits()
  const moi = droits.moi
  const [depuis] = useState(() => new Date(Date.now() - QUATORZE_JOURS).toISOString())
  const aTrier = d.taches.filter((t) => t.statut === 'a_trier')
  const miennes = d.taches.filter((t) => t.statut === 'a_faire' && t.assigne_a === moi).sort(comparer)
  const signalements = aTrier.filter((t) => t.signale_par === moi).sort(comparer)
  const libres = d.taches.filter((t) => t.statut === 'a_faire' && !t.assigne_a).sort(comparer)
  const faites = d.taches.filter((t) => t.statut === 'terminee' && t.fait_par === moi && (t.fait_le ?? '') >= depuis).sort(comparerFaites)

  return (
    <div className="space-y-4">
      {droits.trieur && aTrier.length > 0 && (
        <Link to="/travaux/a-trier" className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
          <span className="text-lg">📥</span>
          <span>
            <strong>{aTrier.length}</strong> signalement{aTrier.length > 1 ? 's' : ''} à trier
          </span>
          <span className="ml-auto underline">Trier</span>
        </Link>
      )}
      <Section
        titre="Assignées à moi"
        taches={miennes}
        d={d}
        vide={libres.length ? 'Rien pour l’instant. Tu peux prendre une tâche libre ci-dessous.' : 'Rien pour l’instant.'}
        montrer={{ lieu: true, chantier: true }}
      />
      <Section titre="Mes signalements" sous="en attente de tri par la direction" taches={signalements} d={d} montrer={{ lieu: true }} />
      <Section
        titre="Tâches libres"
        sous="personne ne s’en occupe encore"
        taches={libres.slice(0, 15)}
        nombre={libres.length}
        d={d}
        montrer={{ lieu: true, chantier: true }}
        actions={
          libres.length > 15 && (
            <Link to="/travaux/tableau" className="text-xs text-foret-700 underline">
              Voir tout
            </Link>
          )
        }
      />
      <Section titre="Faites par moi" sous="14 derniers jours" taches={faites} d={d} montrer={{ lieu: true }} />
    </div>
  )
}
