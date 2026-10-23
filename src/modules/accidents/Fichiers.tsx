import { useState } from 'react'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { BoutonAjouterPiece, GaleriePieces } from '@/lib/PiecesJointes'
import { preparerFichier } from '@/lib/photos'
import { ajouterFichier, retirerFichier, useAdresseFichier, useRelire } from './donnees'
import type { Fichier } from './types'

/**
 * Photos et PDF d'un rapport, envoyés tout de suite. `peutRetirer` : la
 * direction retire tout, qui déclare seulement les siens (la base l'impose).
 */
export function Fichiers({
  rapport,
  fichiers,
  ecriture,
  peutRetirer,
}: {
  rapport: string
  fichiers: Fichier[]
  ecriture: boolean
  peutRetirer: (f: Fichier) => boolean
}) {
  const relire = useRelire()
  const [lecture, setLecture] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function choisir(liste: File[]) {
    if (!liste.length) return
    setLecture(true)
    setErreur(null)
    try {
      for (const f of liste) await ajouterFichier(rapport, await preparerFichier(f))
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setLecture(false)
      relire()
    }
  }

  async function retirer(f: Fichier) {
    if (!(await confirmer({ titre: f.nom ? `Retirer « ${f.nom} » ?` : 'Retirer cette photo ?', libelleOk: 'Retirer', danger: true }))) return
    try {
      await retirerFichier(f)
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      relire()
    }
  }

  if (!fichiers.length && !ecriture) return <p className="text-sm text-pierre-500">Aucune photo.</p>
  return (
    <div>
      <GaleriePieces pieces={fichiers} useAdresse={useAdresseFichier} retirer={ecriture ? (f) => (peutRetirer(f) ? () => retirer(f) : undefined) : undefined}>
        {ecriture && <BoutonAjouterPiece lecture={lecture} choisir={choisir} />}
      </GaleriePieces>
      {erreur && <p className="mt-1 text-xs text-red-700">{erreur}</p>}
    </div>
  )
}
