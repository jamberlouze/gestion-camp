import { useState } from 'react'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { urlPublique } from '@/lib/pagesPubliques'
import { ui } from '@/lib/ui'
import { useDonnees } from './contexte'
import { useChangerLienFormulaire, useLienFormulaire } from './donnees'

/** Adresse du formulaire de demande d'une organisation (rien d'autre que le jeton). */
const lienFormulaire = (jeton: string) => urlPublique(`/demande?lien=${jeton}`)

/**
 * « Copier le lien du formulaire de l'organisation » (organisations qui
 * reviennent chaque année) : le formulaire s'ouvre pré-rempli d'après leur
 * dernière réservation, et la demande arrive déjà reliée à l'organisation.
 */
export function LienOrganisation({ organisationId }: { organisationId: string }) {
  const { ecriture } = useDonnees()
  const lien = useLienFormulaire(organisationId)
  const changer = useChangerLienFormulaire()
  const [copie, setCopie] = useState(false)
  const [aCopierALaMain, setACopierALaMain] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const jeton = lien.data?.jeton

  const copier = async () => {
    setErreur(null)
    setACopierALaMain(false)
    let j: string | null | undefined = jeton
    try {
      j ??= await changer.mutateAsync({ organisation: organisationId, action: 'creer' })
    } catch (e) {
      setErreur(messageErreur(e))
      return
    }
    if (!j) return
    try {
      await navigator.clipboard.writeText(lienFormulaire(j))
      setCopie(true)
      setTimeout(() => setCopie(false), 2000)
    } catch {
      // Presse-papiers refusé par le navigateur (après la création du lien) : le lien est affiché, à copier à la main.
      setACopierALaMain(true)
    }
  }

  const refaire = async (action: 'refaire' | 'retirer') => {
    const ok = await confirmer({
      titre: action === 'refaire' ? 'Nouveau lien du formulaire ?' : 'Retirer le lien du formulaire ?',
      message:
        action === 'refaire'
          ? "L'ancien lien ne fonctionnera plus (il ouvrira le formulaire vide). À faire si le lien a été transmis à la mauvaise personne."
          : "Le lien ne fonctionnera plus : il ouvrira le formulaire vide, et la demande arrivera « à valider ».",
      libelleOk: action === 'refaire' ? 'Nouveau lien' : 'Retirer',
      danger: action === 'retirer',
    })
    if (!ok) return
    setErreur(null)
    changer.mutate({ organisation: organisationId, action }, { onError: (e) => setErreur(messageErreur(e)) })
  }

  if (!ecriture && !jeton) return null
  return (
    <div className="space-y-1.5 rounded-lg border border-pierre-200 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-pierre-500">Formulaire de l'organisation</p>
      <div className="flex flex-wrap items-center gap-2">
        {jeton && <input readOnly aria-label="Lien du formulaire" className={`${ui.champ} min-w-0 flex-1 text-xs`} value={lienFormulaire(jeton)} onFocus={(e) => e.currentTarget.select()} />}
        <button className={ui.boutonSecondaire} disabled={changer.isPending} onClick={copier}>
          {copie ? 'Lien copié ✓' : jeton ? 'Copier' : 'Copier le lien du formulaire de l’organisation'}
        </button>
        {jeton && (
          <a className={ui.boutonSecondaire} href={lienFormulaire(jeton)} target="_blank" rel="noreferrer">
            Ouvrir
          </a>
        )}
      </div>
      <p className="text-xs text-pierre-500">
        Pour une organisation qui revient : le formulaire s'ouvre pré-rempli d'après sa dernière réservation (coordonnées, groupe) ; elle choisit le type de séjour et les dates,
        et la demande arrive déjà reliée à l'organisation.
        {ecriture && jeton && (
          <>
            {' '}
            <button className="underline hover:text-pierre-800" onClick={() => refaire('refaire')}>
              Nouveau lien
            </button>
            {' · '}
            <button className="underline hover:text-pierre-800" onClick={() => refaire('retirer')}>
              Retirer
            </button>
          </>
        )}
      </p>
      {aCopierALaMain && <p className="text-xs text-amber-800">Lien prêt : sélectionnez-le ci-dessus et copiez-le (⌘C).</p>}
      {erreur && <p className={ui.erreur}>{erreur}</p>}
    </div>
  )
}
