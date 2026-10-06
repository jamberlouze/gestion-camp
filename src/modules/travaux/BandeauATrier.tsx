import { useState } from 'react'
import { confirmer } from '@/lib/Confirmation'
import { ui } from '@/lib/ui'
import { Puce } from './commun'
import { useMajTache, useSupprimerTache, type Donnees } from './donnees'
import { GaleriePhotos } from './Photos'
import { dateCourte, useDroits, useOuvrir } from './outils'
import { PRIORITES, type Priorite, type Tache } from './types'

const petit = 'rounded-lg border border-pierre-300 bg-white px-2 py-1.5 text-sm'

/**
 * Bandeau en haut de la liste des tâches (comme les notes à traiter
 * d'Embarcations) : signalements pas encore triés. Tout le monde les voit
 * (ça évite les doublons) ; la direction les accepte, avec priorité et
 * assignation, ou les rejette.
 */
export function BandeauATrier({ d }: { d: Donnees }) {
  const droits = useDroits()
  const liste = d.taches.filter((t) => t.statut === 'a_trier').sort((a, b) => a.priorite - b.priorite || a.created_at.localeCompare(b.created_at))
  if (!liste.length) return null
  return (
    <section className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3" aria-labelledby="titre-a-trier">
      <h2 id="titre-a-trier" className="mb-2 text-sm font-semibold text-amber-950">
        Signalements à trier <span className="font-normal text-amber-800">({liste.length})</span>
        {!droits.trieur && <span className="ml-2 font-normal text-amber-800">· la direction les trie</span>}
      </h2>
      <ul className="space-y-2">
        {liste.map((t) => (
          <CarteTri key={t.id} tache={t} d={d} trieur={droits.trieur} />
        ))}
      </ul>
    </section>
  )
}

function CarteTri({ tache: t, d, trieur }: { tache: Tache; d: Donnees; trieur: boolean }) {
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
    <li className="rounded-lg bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button type="button" className="text-left text-sm font-medium text-pierre-900 hover:underline" onClick={() => ouvrir({ type: 'fiche', id: t.id })}>
              {t.titre}
            </button>
            {t.priorite === 1 && <Puce ton="urgent">Signalé urgent</Puce>}
            {lieu && <Puce>📍 {lieu.nom}</Puce>}
            {categorie && <Puce>{categorie.nom}</Puce>}
          </div>
          {t.description && <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-pierre-700">{t.description}</p>}
          <p className="mt-1 text-xs text-pierre-500">
            {auteur ? `${auteur}, ` : ''}
            {dateCourte(t.created_at)}
          </p>
          {photos.length > 0 && (
            <div className="mt-2">
              <GaleriePhotos photos={photos} />
            </div>
          )}
        </div>
        {trieur && (
          <div className="flex shrink-0 flex-col gap-2 lg:w-[26rem]">
            <div className="grid grid-cols-2 gap-2">
              <select aria-label="Assigner à" className={petit} value={assigne} onChange={(e) => setAssigne(e.target.value)}>
                <option value="">À assigner</option>
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
            <div className="flex justify-end gap-2">
              <button className={ui.boutonDanger} onClick={rejeter}>
                Rejeter
              </button>
              <button className={ui.bouton} onClick={accepter}>
                ✓ Accepter
              </button>
            </div>
          </div>
        )}
      </div>
    </li>
  )
}
