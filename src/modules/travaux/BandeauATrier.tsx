import { useMemo, useState } from 'react'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { clicLigne } from '@/lib/ligneCliquable'
import { useSortieCarte } from '@/lib/sortieCarte'
import { ui } from '@/lib/ui'
import { Puce } from './commun'
import { fusionner, useAdressePhoto, useMajTache, useRelire, useSupprimerTache, type Donnees } from './donnees'
import { GaleriePieces } from '@/lib/PiecesJointes'
import { dateCourte, estOuverte, useDroits, useOuvrir } from './outils'
import { comparateur } from './semblables'
import { PRIORITES, type Priorite, type Tache } from './types'

// 16 px sur téléphone (pas de zoom de l'iPhone au toucher), 14 px dès `sm`.
const petit = 'rounded-lg border border-pierre-300 bg-white px-2 py-1.5 text-base sm:text-sm'

/**
 * Bandeau en haut de la liste des tâches (comme les notes à traiter
 * d'Embarcations) : signalements pas encore triés (Terrain : les siens
 * seulement). La direction les accepte, avec priorité et assignation, les
 * rejette, ou réunit un doublon avec la tâche qu'il répète.
 */
export function BandeauATrier({ d }: { d: Donnees }) {
  const droits = useDroits()
  const liste = d.taches.filter((t) => t.statut === 'a_trier').sort((a, b) => a.priorite - b.priorite || a.created_at.localeCompare(b.created_at))
  // Doublons possibles (direction) : une tâche ouverte, ou un signalement plus ancien (deux signalements pareils : le plus récent rejoint l'autre).
  const chercher = useMemo(() => comparateur(d.taches.filter(estOuverte)), [d.taches])
  const doublons = (t: Tache) =>
    chercher(t.titre, t.lieu_id, { exclure: t.id, max: 10 })
      .map((s) => s.tache)
      .filter((x) => x.statut !== 'a_trier' || x.created_at < t.created_at)
      .slice(0, 2)
  if (!liste.length) return null
  return (
    <section className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3" aria-labelledby="titre-a-trier">
      <h2 id="titre-a-trier" className="mb-2 text-sm font-semibold text-amber-950">
        Signalements à trier <span className="font-normal text-amber-800">({liste.length})</span>
        {!droits.trieur && <span className="ml-2 font-normal text-amber-800">· la direction les trie</span>}
      </h2>
      <ul className="space-y-2">
        {liste.map((t) => (
          <CarteTri key={t.id} tache={t} d={d} trieur={droits.trieur} doublons={droits.trieur ? doublons(t) : []} />
        ))}
      </ul>
    </section>
  )
}

function CarteTri({ tache: t, d, trieur, doublons }: { tache: Tache; d: Donnees; trieur: boolean; doublons: Tache[] }) {
  const ouvrir = useOuvrir()
  const maj = useMajTache()
  const supprimer = useSupprimerTache()
  const relire = useRelire()
  const [erreurFusion, setErreurFusion] = useState<string | null>(null)
  const { ref, sortir } = useSortieCarte<HTMLLIElement>()
  const [priorite, setPriorite] = useState<Priorite>(t.priorite)
  const [assigne, setAssigne] = useState('')
  const [chantier, setChantier] = useState(t.chantier_id ?? '')
  const [echeance, setEcheance] = useState(t.echeance ?? '')
  const lieu = t.lieu_id ? d.lieu.get(t.lieu_id) : null
  const categorie = t.categorie_id ? d.categorie.get(t.categorie_id) : null
  const auteur = t.signale_par ? d.personne.get(t.signale_par)?.nom : null
  const photos = d.photos.get(t.id) ?? []

  const accepter = () =>
    sortir(() =>
      maj.mutate({ id: t.id, champs: { statut: 'a_faire', priorite, assigne_a: assigne || null, chantier_id: chantier || null, echeance: echeance || null } }),
    )

  async function rejeter() {
    if (!(await confirmer({ titre: `Rejeter « ${t.titre} » ?`, message: 'Le signalement, ses photos et ses commentaires seront effacés.', libelleOk: 'Rejeter' }))) return
    sortir(() => supprimer.mutate({ id: t.id, chemins: photos.map((p) => p.chemin) }))
  }

  // En ligne seulement : photos, commentaires et détails du signalement passent à la tâche gardée.
  async function reunir(cible: Tache) {
    const ok = await confirmer({
      titre: `Réunir avec « ${cible.titre} » ?`,
      message: 'Le signalement est retiré ; ses détails, ses photos et ses commentaires sont ajoutés à cette tâche.',
      libelleOk: 'Réunir',
      danger: false,
    })
    if (!ok) return
    setErreurFusion(null)
    try {
      // Refusée (hors ligne, déjà triée…) : la carte revient aussitôt avec le message.
      await sortir(async () => {
        await fusionner(t.id, cible.id)
        await relire()
      })
    } catch (e) {
      setErreurFusion(messageErreur(e))
    }
  }

  const ouvrirFiche = () => ouvrir({ type: 'fiche', id: t.id })

  // Toute la carte ouvre la fiche, sauf les photos et les menus du tri.
  return (
    <li ref={ref} className="cursor-pointer rounded-lg bg-white p-3 shadow-sm hover:ring-1 hover:ring-amber-300" onClick={clicLigne(ouvrirFiche)}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button type="button" className="text-left text-sm font-medium text-pierre-900 hover:underline" onClick={ouvrirFiche}>
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
              <GaleriePieces pieces={photos} useAdresse={useAdressePhoto} />
            </div>
          )}
          {doublons.length > 0 && (
            <div className="mt-2 cursor-default rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-2" data-garde-clic>
              <p className="text-xs font-semibold text-amber-900">Doublon possible</p>
              <ul className="mt-1 space-y-1">
                {doublons.map((x) => {
                  const lieuX = x.lieu_id ? d.lieu.get(x.lieu_id)?.nom : null
                  return (
                    <li key={x.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <button type="button" className="text-left text-pierre-900 hover:underline" onClick={() => ouvrir({ type: 'fiche', id: x.id })}>
                        {x.titre}
                      </button>
                      <span className="text-xs text-pierre-500">
                        {lieuX ? `📍 ${lieuX}` : 'Sans lieu'}
                        {x.statut === 'a_trier' && ' · à trier'}
                      </span>
                      <button type="button" className="rounded-md px-1.5 py-0.5 text-xs font-medium text-amber-900 underline hover:bg-amber-100" onClick={() => reunir(x)}>
                        Réunir
                      </button>
                    </li>
                  )
                })}
              </ul>
              {erreurFusion && <p className={`${ui.erreur} mt-2`}>{erreurFusion}</p>}
            </div>
          )}
        </div>
        {trieur && (
          <div className="flex shrink-0 cursor-default flex-col gap-2 lg:w-[26rem]" data-garde-clic>
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
