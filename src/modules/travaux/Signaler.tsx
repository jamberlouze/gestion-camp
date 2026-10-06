import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Dialogue } from '@/lib/Dialogue'
import { reduireImage } from '@/lib/photos'
import { ui } from '@/lib/ui'
import { useAjouterPhoto, useCreerTache, type Donnees, type NouvelleTache } from './donnees'
import { useDroits } from './outils'
import type { Tache } from './types'

/**
 * Signaler un problème (ou, pour la direction, ajouter une tâche déjà triée).
 * Marche hors ligne : la tâche et ses photos partent au retour du réseau.
 */
export function Signaler({ d, defauts, fermer }: { d: Donnees; defauts?: Partial<Tache>; fermer: () => void }) {
  const droits = useDroits()
  const creer = useCreerTache()
  const ajouterPhoto = useAjouterPhoto()
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [lieu, setLieu] = useState(defauts?.lieu_id ?? '')
  const [categorie, setCategorie] = useState(defauts?.categorie_id ?? '')
  const [urgent, setUrgent] = useState(false)
  const [assigne, setAssigne] = useState('')
  const [chantier, setChantier] = useState(defauts?.chantier_id ?? '')
  const [echeance, setEcheance] = useState('')
  const [photos, setPhotos] = useState<{ cle: string; fichier: Blob; url: string }[]>([])
  const [lecture, setLecture] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  // Les aperçus sont libérés à la fermeture.
  const apercus = useRef<string[]>([])
  useEffect(() => () => apercus.current.forEach((u) => URL.revokeObjectURL(u)), [])

  async function choisirPhotos(fichiers: FileList | null) {
    if (!fichiers?.length) return
    setLecture(true)
    setErreur(null)
    try {
      const lues = await Promise.all(
        [...fichiers].map(async (f) => {
          const fichier = await reduireImage(f)
          const url = URL.createObjectURL(fichier)
          apercus.current.push(url)
          return { cle: crypto.randomUUID(), fichier, url }
        }),
      )
      setPhotos((p) => [...p, ...lues])
    } catch {
      setErreur("Une photo n'a pas pu être lue.")
    } finally {
      setLecture(false)
    }
  }

  async function envoyer(e: FormEvent) {
    e.preventDefault()
    if (!titre.trim()) return setErreur('Écris ce qu’il faut faire.')
    if (!lieu) return setErreur('Choisis le lieu.')
    const id = crypto.randomUUID()
    const nouvelle: NouvelleTache = {
      id,
      titre: titre.trim(),
      description: description.trim() || null,
      lieu_id: lieu,
      categorie_id: categorie || null,
      priorite: urgent ? 1 : 3,
      signale_par: droits.moi,
      ...(droits.trieur
        ? {
            statut: 'a_faire',
            assigne_a: assigne || null,
            chantier_id: chantier || null,
            echeance: echeance || null,
            position: defauts?.position ?? null,
          }
        : { statut: 'a_trier' }),
    }
    creer.mutate(nouvelle)
    try {
      for (const p of photos) await ajouterPhoto(id, p.fichier, droits.moi)
    } catch {
      return setErreur("La tâche est créée, mais une photo n'a pas pu être gardée sur l'appareil.")
    }
    fermer()
  }

  return (
    <Dialogue titre={droits.trieur ? 'Nouvelle tâche' : 'Signaler un problème'} fermer={fermer}>
      <form onSubmit={envoyer} className="space-y-4">
        <label className="block">
          <span className={ui.etiquette}>Quoi ?</span>
          <input className={ui.champ} value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. La porte du chalet ferme mal" autoFocus />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={ui.etiquette}>Où ?</span>
            <select className={ui.champ} value={lieu} onChange={(e) => setLieu(e.target.value)}>
              <option value="">Choisir le lieu…</option>
              {d.lieux.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nom}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={ui.etiquette}>Catégorie</span>
            <select className={ui.champ} value={categorie} onChange={(e) => setCategorie(e.target.value)}>
              <option value="">—</option>
              {d.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className={ui.etiquette}>Détails (optionnel)</span>
          <textarea className={ui.champ} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <div>
          <span className={ui.etiquette}>Photos</span>
          <div className="flex flex-wrap gap-2">
            {photos.map((p) => (
              <div key={p.cle} className="relative">
                <img src={p.url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                <button
                  type="button"
                  aria-label="Retirer la photo"
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-pierre-800 text-xs text-white"
                  onClick={() => setPhotos(photos.filter((x) => x.cle !== p.cle))}
                >
                  ✕
                </button>
              </div>
            ))}
            <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-pierre-300 text-xs text-pierre-500 hover:border-foret-600 hover:text-foret-700">
              <span className="text-xl">📷</span>
              {lecture ? '…' : 'Ajouter'}
              <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => choisirPhotos(e.target.files)} />
            </label>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-red-600" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
          C'est urgent (sécurité, bris qui empêche une activité…)
        </label>

        {droits.trieur && (
          <fieldset className="grid gap-3 rounded-xl bg-pierre-50 p-3 sm:grid-cols-2">
            <legend className="sr-only">Tri</legend>
            <label className="block">
              <span className={ui.etiquette}>Assigner à</span>
              <select className={ui.champ} value={assigne} onChange={(e) => setAssigne(e.target.value)}>
                <option value="">À assigner</option>
                {d.personnes
                  .filter((p) => p.peut_assigner)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block">
              <span className={ui.etiquette}>Échéance</span>
              <input type="date" className={ui.champ} value={echeance} onChange={(e) => setEcheance(e.target.value)} />
            </label>
            <label className="block sm:col-span-2">
              <span className={ui.etiquette}>Chantier</span>
              <select className={ui.champ} value={chantier} onChange={(e) => setChantier(e.target.value)}>
                <option value="">Aucun</option>
                {d.chantiers
                  .filter((c) => !c.termine_le || c.id === chantier)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
              </select>
            </label>
          </fieldset>
        )}

        {!droits.trieur && <p className="text-xs text-pierre-500">La direction recevra ton signalement dans « À trier ».</p>}
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex gap-2">
          <button type="submit" className={ui.bouton} disabled={lecture}>
            {droits.trieur ? 'Ajouter' : 'Envoyer'}
          </button>
          <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
        </div>
      </form>
    </Dialogue>
  )
}
