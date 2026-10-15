import { useState, type FormEvent } from 'react'
import { BoutonSupprimer } from '@/lib/BoutonsAction'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { creerLigne, enregistrerListe, supprimerPanneau, useRelire, type Donnees } from './donnees'

/** Nom, bâtiment, emplacement et nombre d'emplacements d'un panneau (en ligne). `id` null = nouveau. */
export function FichePanneau({ d, id, fermer, cree }: { d: Donnees; id: string | null; fermer: () => void; cree?: (id: string) => void }) {
  const panneau = id ? d.panneau.get(id) : undefined
  const relire = useRelire()
  const [nom, setNom] = useState(panneau?.nom ?? '')
  const [batiment, setBatiment] = useState(panneau?.batiment_id ?? d.batiments[0]?.id ?? '')
  const [emplacement, setEmplacement] = useState(panneau?.emplacement ?? '')
  const [positions, setPositions] = useState(panneau?.positions == null ? '' : String(panneau.positions))
  const [note, setNote] = useState(panneau?.note ?? '')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  if (id && !panneau) return null
  const disjoncteurs = panneau ? d.duPanneau(panneau.id) : []

  async function soumettre(e: FormEvent) {
    e.preventDefault()
    const n = positions === '' ? null : Number(positions)
    if (n !== null && (!Number.isInteger(n) || n < 2 || n > 84)) return setErreur('Nombre d’emplacements : de 2 à 84, ou vide.')
    const plusHaut = Math.max(0, ...disjoncteurs.map((x) => (x.bipolaire ? x.position + 2 : x.position)))
    if (n !== null && n < plusHaut) return setErreur(`Un disjoncteur est noté à l’emplacement ${plusHaut} : il en faut au moins ${plusHaut}.`)
    const champs = { nom: nom.trim(), batiment_id: batiment || null, emplacement: emplacement.trim() || null, positions: n, note: note.trim() || null }
    setEnvoi(true)
    setErreur(null)
    try {
      if (panneau) await enregistrerListe('panneaux', { id: panneau.id, ...champs })
      else {
        const nouveau = crypto.randomUUID()
        await creerLigne('panneaux', { id: nouveau, ...champs, ordre: Math.max(0, ...d.panneaux.map((p) => p.ordre)) + 1 })
        cree?.(nouveau)
      }
      await relire()
      fermer()
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setEnvoi(false)
    }
  }

  async function retirer() {
    if (!panneau) return
    const n = disjoncteurs.length
    if (
      !(await confirmer({
        titre: `Supprimer le panneau ${panneau.nom} ?`,
        message: n ? `Ses ${n} disjoncteur(s), ce qu’ils alimentent et ses photos seront effacés.` : 'Ses photos seront effacées.',
        libelleOk: 'Supprimer',
        danger: true,
      }))
    )
      return
    try {
      await supprimerPanneau(panneau.id)
      await relire()
      fermer()
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  return (
    <Dialogue titre={panneau ? `Panneau ${panneau.nom}` : 'Nouveau panneau'} fermer={fermer}>
      <form onSubmit={soumettre} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={ui.etiquette} htmlFor="pn-nom">
              Nom
            </label>
            <input id="pn-nom" required className={ui.champ} value={nom} placeholder="A, B, CU…" autoFocus={!panneau} onChange={(e) => setNom(e.target.value)} />
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="pn-batiment">
              Bâtiment
            </label>
            <select id="pn-batiment" className={ui.champ} value={batiment} onChange={(e) => setBatiment(e.target.value)}>
              <option value="">—</option>
              {d.batiments.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nom}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className={ui.etiquette} htmlFor="pn-emplacement">
              Où il est
            </label>
            <input id="pn-emplacement" className={ui.champ} value={emplacement} placeholder="Sous-sol de la Vieille-France" onChange={(e) => setEmplacement(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className={ui.etiquette} htmlFor="pn-positions">
              Nombre d'emplacements
            </label>
            <input
              id="pn-positions"
              inputMode="numeric"
              className={ui.champ}
              value={positions}
              placeholder="Vide = jusqu’au plus haut numéro noté"
              onChange={(e) => setPositions(e.target.value.replace(/\D/g, ''))}
            />
          </div>
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="pn-note">
            Note
          </label>
          <textarea id="pn-note" rows={2} className={ui.champ} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex items-center gap-2 pt-1">
          {panneau && <BoutonSupprimer onClick={retirer} />}
          <div className="ml-auto flex gap-2">
            <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
              Annuler
            </button>
            <button className={ui.bouton} disabled={envoi || !nom.trim()}>
              Enregistrer
            </button>
          </div>
        </div>
      </form>
    </Dialogue>
  )
}
