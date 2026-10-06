import { useState } from 'react'
import { confirmer } from '@/lib/Confirmation'
import { ui } from '@/lib/ui'
import { Puce } from './commun'
import { useMajTache, useSupprimerTache, type Donnees } from './donnees'
import { Vignette } from './Fiche'
import { dateCourte, useDroits, useOuvrir } from './outils'
import { PRIORITES, type Priorite, type Tache } from './types'

const petit = 'rounded-lg border border-pierre-300 bg-white px-2 py-1.5 text-sm'

/** Signalements à trier (direction) : accepter avec priorité et assignation, ou rejeter. */
export function ATrier({ d }: { d: Donnees }) {
  const droits = useDroits()
  if (!droits.trieur) return <p className="py-8 text-center text-sm text-pierre-500">Le tri est fait par la direction.</p>
  const liste = d.taches.filter((t) => t.statut === 'a_trier').sort((a, b) => a.priorite - b.priorite || a.created_at.localeCompare(b.created_at))
  if (!liste.length) return <p className="py-8 text-center text-sm text-pierre-500">Rien à trier. 🎉</p>
  return (
    <div className="grid items-start gap-3 lg:grid-cols-2">
      {liste.map((t) => (
        <CarteTri key={t.id} tache={t} d={d} />
      ))}
    </div>
  )
}

function CarteTri({ tache: t, d }: { tache: Tache; d: Donnees }) {
  const ouvrir = useOuvrir()
  const maj = useMajTache()
  const supprimer = useSupprimerTache()
  const [priorite, setPriorite] = useState<Priorite>(t.priorite)
  const [assigne, setAssigne] = useState('')
  const [chantier, setChantier] = useState(t.chantier_id ?? '')
  const [echeance, setEcheance] = useState(t.echeance ?? '')
  const lieu = t.lieu_id ? d.lieu.get(t.lieu_id) : null
  const categorie = t.categorie_id ? d.categorie.get(t.categorie_id) : null
  const auteur = t.signale_par ? d.personne.get(t.signale_par)?.nom : null
  const photos = d.photos.get(t.id) ?? []

  const accepter = () =>
    maj.mutate({ id: t.id, champs: { statut: 'a_faire', priorite, assigne_a: assigne || null, chantier_id: chantier || null, echeance: echeance || null } })

  async function rejeter() {
    if (!(await confirmer({ titre: `Rejeter « ${t.titre} » ?`, message: 'Le signalement, ses photos et ses commentaires seront effacés.', libelleOk: 'Rejeter' }))) return
    supprimer.mutate({ id: t.id, chemins: photos.map((p) => p.chemin) })
  }

  return (
    <article className={`${ui.carte} p-4`}>
      <button type="button" className="text-left font-medium hover:underline" onClick={() => ouvrir({ type: 'fiche', id: t.id })}>
        {t.titre}
      </button>
      <p className="mt-0.5 text-xs text-pierre-500">
        {auteur ? `${auteur} · ` : ''}
        {dateCourte(t.created_at)}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {t.priorite === 1 && <Puce ton="urgent">Signalé urgent</Puce>}
        {lieu && <Puce>📍 {lieu.nom}</Puce>}
        {categorie && <Puce>{categorie.nom}</Puce>}
      </div>
      {t.description && <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm text-pierre-700">{t.description}</p>}
      {photos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {photos.map((p) => (
            <Vignette key={p.id} photo={p} />
          ))}
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <select aria-label="Assigner à" className={petit} value={assigne} onChange={(e) => setAssigne(e.target.value)}>
          <option value="">Libre (personne)</option>
          {d.personnes
            .filter((p) => p.peut_assigner)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
        </select>
        <select aria-label="Priorité" className={petit} value={priorite} onChange={(e) => setPriorite(Number(e.target.value) as Priorite)}>
          {Object.entries(PRIORITES).map(([n, nom]) => (
            <option key={n} value={n}>
              {nom}
            </option>
          ))}
        </select>
        <select aria-label="Chantier" className={petit} value={chantier} onChange={(e) => setChantier(e.target.value)}>
          <option value="">Sans chantier</option>
          {d.chantiers
            .filter((c) => !c.termine_le)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
        </select>
        <input type="date" aria-label="Échéance" className={petit} value={echeance} onChange={(e) => setEcheance(e.target.value)} />
      </div>
      <div className="mt-3 flex gap-2">
        <button className={ui.bouton} onClick={accepter}>
          Accepter
        </button>
        <button className={ui.boutonDanger} onClick={rejeter}>
          Rejeter
        </button>
      </div>
    </article>
  )
}
