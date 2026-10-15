import { useRef, type ReactNode } from 'react'
import { Page, Pied } from '@/lib/public/habillage'
import { ui } from '@/lib/ui'
import { COURRIEL_EMPLOIS } from '../candidature'
import { accepte, erreurFichier, tailleLisible, type Langue, type SorteFichier } from '../fichiersPublics'

// Pièces communes des pages publiques du module RH (candidature, intention
// de retour, dossier d'embauche). Tout passe par le Worker (/api/rh/*) :
// l'anonyme n'a aucun droit sur le schéma rh.

export function PiedEmplois() {
  return <Pied compagnie={{ nom: 'Groupe Lütra', courriel: COURRIEL_EMPLOIS, telephone: null }} />
}

/** Page d'attente ou d'erreur, avec le même habillage. */
export function Message({ titre, children }: { titre: string; children?: ReactNode }) {
  return (
    <Page>
      <img src="/logos/logo-gbpa.png" alt="" className="h-9 w-auto sm:h-10" />
      <div className={`${ui.carte} space-y-2 p-6 text-center`}>
        <p className="text-lg font-semibold text-pierre-900">{titre}</p>
        {children && <div className="text-sm text-pierre-600">{children}</div>}
      </div>
      <PiedEmplois />
    </Page>
  )
}

/**
 * Champ de fichier pensé téléphone : un gros bouton, le nom et la taille du
 * fichier choisi, « Retirer ». Le type et la taille sont vérifiés tout de
 * suite (le Worker revérifie).
 */
export function ChampFichier({
  fichier,
  changer,
  sorte,
  langue = 'fr',
  libelle,
  deja,
}: {
  fichier: File | null | undefined
  changer: (f: File | null, erreur: string | null) => void
  sorte: SorteFichier
  langue?: Langue
  libelle?: string
  /** Fichier déjà au dossier (on peut en joindre un autre) */
  deja?: string | null
}) {
  const ref = useRef<HTMLInputElement>(null)
  const choisir = langue === 'en' ? 'Choose a file' : 'Choisir un fichier'
  return (
    <div className="space-y-1.5">
      {deja && !fichier && <p className="text-xs text-foret-700">✓ {deja}</p>}
      {fichier ? (
        <div className="flex items-center gap-2 rounded-lg border border-foret-600 bg-foret-50 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate">📎 {fichier.name}</span>
          <span className="shrink-0 text-xs text-pierre-500">{tailleLisible(fichier.size)}</span>
          <button type="button" className="shrink-0 text-xs text-pierre-600 underline" onClick={() => changer(null, null)}>
            {langue === 'en' ? 'Remove' : 'Retirer'}
          </button>
        </div>
      ) : (
        <button type="button" className={`${ui.boutonSecondaire} w-full sm:w-auto`} onClick={() => ref.current?.click()}>
          📎 {libelle ?? choisir}
        </button>
      )}
      <input
        ref={ref}
        type="file"
        className="hidden"
        accept={accepte(sorte)}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          e.target.value = ''
          if (!f) return
          const err = erreurFichier({ nom: f.name, taille: f.size }, sorte, langue)
          changer(err ? null : f, err)
        }}
      />
    </div>
  )
}
