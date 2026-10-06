import { useState, type FormEvent } from 'react'
import { confirmer } from '@/lib/Confirmation'
import { IconeCorbeille } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { useCreerNote, useMajNote, useNotes, useSupprimerNote } from './donnees'
import type { Ligne } from './outils'
import { TYPES, type Note } from './types'

/**
 * Bandeau en haut de l'inventaire : notes à traiter par la direction
 * (« un canot a coulé, on ne sait pas lequel »), avec ou sans embarcation.
 * Une note disparaît du bandeau quand elle est marquée traitée.
 */
export function BandeauNotes({
  flotte,
  ecriture,
  ajout,
  fermerAjout,
}: {
  /** Flotte triée par numéro, pour choisir l'embarcation. */
  flotte: Ligne[]
  ecriture: boolean
  /** Formulaire de nouvelle note ouvert (bouton « + Note » de l'inventaire). */
  ajout: boolean
  fermerAjout: () => void
}) {
  const notes = useNotes()
  const aTraiter = (notes.data ?? []).filter((n) => n.statut === 'a_traiter')

  if (aTraiter.length === 0 && !ajout) return null

  return (
    <section className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3" aria-labelledby="titre-notes">
      <h2 id="titre-notes" className="mb-2 text-sm font-semibold text-amber-950">
        Notes à traiter {aTraiter.length > 0 && <span className="font-normal text-amber-800">({aTraiter.length})</span>}
      </h2>
      {ajout && <NouvelleNote flotte={flotte} fermer={fermerAjout} />}
      {aTraiter.length > 0 && (
        <ul className="space-y-2">
          {aTraiter.map((n) => (
            <LigneNote key={n.id} note={n} flotte={flotte} ecriture={ecriture} />
          ))}
        </ul>
      )}
    </section>
  )
}

// ------------------------------------------------------------------
// Nouvelle note
// ------------------------------------------------------------------

function NouvelleNote({ flotte, fermer }: { flotte: Ligne[]; fermer: () => void }) {
  const creer = useCreerNote()
  const [texte, setTexte] = useState('')
  const [embarcationId, setEmbarcationId] = useState('')

  function soumettre(e: FormEvent) {
    e.preventDefault()
    if (!texte.trim()) return
    creer.mutate({ id: crypto.randomUUID(), texte: texte.trim(), embarcation_id: embarcationId || null })
    fermer()
  }

  return (
    <form onSubmit={soumettre} className="mb-2 space-y-2 rounded-lg bg-white p-3 shadow-sm">
      <textarea
        aria-label="Nouvelle note"
        rows={2}
        autoFocus
        className={ui.champ}
        placeholder="Ex. Un canot a coulé au lac, on ne sait pas lequel."
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        onKeyDown={(e) => {
          // ⌘/Ctrl + Entrée : noter sans quitter le clavier ; Échap : annuler.
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit()
          if (e.key === 'Escape') fermer()
        }}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <ChoixEmbarcation flotte={flotte} valeur={embarcationId} changer={setEmbarcationId} className="sm:max-w-xs" />
        <div className="flex justify-end gap-2 sm:ml-auto">
          <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button className={ui.bouton} disabled={!texte.trim()}>
            Noter
          </button>
        </div>
      </div>
    </form>
  )
}

// ------------------------------------------------------------------
// Une note
// ------------------------------------------------------------------

function LigneNote({ note, flotte, ecriture }: { note: Note; flotte: Ligne[]; ecriture: boolean }) {
  const supprimer = useSupprimerNote()
  const [mode, setMode] = useState<'lecture' | 'modifier' | 'traiter'>('lecture')
  const embarcation = flotte.find((l) => l.id === note.embarcation_id)

  if (mode !== 'lecture') {
    return (
      <li className="rounded-lg bg-white p-3 shadow-sm">
        <FormulaireNote note={note} flotte={flotte} traiter={mode === 'traiter'} fermer={() => setMode('lecture')} />
      </li>
    )
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg bg-white p-3 shadow-sm sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-wrap text-sm text-pierre-900">{note.texte}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-pierre-500">
          {embarcation && (
            <span className="inline-flex items-center rounded-full border border-pierre-200 px-2 py-0.5 font-medium text-pierre-700">
              {embarcation.numero_identification ?? 'Nouvelle'} · {embarcation.modele.type} {embarcation.modele.nom}
            </span>
          )}
          <span>
            {note.auteur_nom ? `${note.auteur_nom}, ` : ''}
            {dateCourte(note.created_at)}
          </span>
        </p>
      </div>
      {ecriture && (
        <div className="flex shrink-0 items-center gap-2">
          <button className={ui.bouton} onClick={() => setMode('traiter')}>
            ✓ Traitée
          </button>
          <button className={ui.boutonSecondaire} onClick={() => setMode('modifier')}>
            Modifier
          </button>
          <button
            className="rounded-lg p-2 text-pierre-400 hover:bg-red-50 hover:text-red-700"
            aria-label="Supprimer la note"
            title="Supprimer"
            onClick={async () => {
              if (await confirmer({ titre: 'Supprimer cette note ?', message: note.texte, libelleOk: 'Supprimer', danger: true })) {
                supprimer.mutate(note.id)
              }
            }}
          >
            <IconeCorbeille />
          </button>
        </div>
      )}
    </li>
  )
}

/**
 * Modifier la note, ou la marquer traitée : on peut alors préciser
 * l'embarcation (si on a trouvé laquelle) et ce qui a été fait.
 */
function FormulaireNote({
  note,
  flotte,
  traiter,
  fermer,
}: {
  note: Note
  flotte: Ligne[]
  traiter: boolean
  fermer: () => void
}) {
  const maj = useMajNote()
  const [texte, setTexte] = useState(note.texte)
  const [embarcationId, setEmbarcationId] = useState(note.embarcation_id ?? '')
  const [suivi, setSuivi] = useState(note.suivi ?? '')

  function soumettre(e: FormEvent) {
    e.preventDefault()
    if (!texte.trim()) return
    maj.mutate({
      id: note.id,
      champs: {
        texte: texte.trim(),
        embarcation_id: embarcationId || null,
        ...(traiter ? { statut: 'traitee' as const, suivi: suivi.trim() || null } : {}),
      },
    })
    fermer()
  }

  return (
    <form onSubmit={soumettre} className="space-y-2">
      <textarea aria-label="Note" rows={2} className={ui.champ} value={texte} onChange={(e) => setTexte(e.target.value)} />
      <ChoixEmbarcation flotte={flotte} valeur={embarcationId} changer={setEmbarcationId} />
      {traiter && (
        <textarea
          aria-label="Ce qui a été fait (facultatif)"
          rows={2}
          autoFocus
          className={ui.champ}
          placeholder="Ce qui a été fait (facultatif). Ex. C'était CA-014, retiré de la flotte."
          value={suivi}
          onChange={(e) => setSuivi(e.target.value)}
        />
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
          Annuler
        </button>
        <button className={ui.bouton} disabled={!texte.trim()}>
          {traiter ? '✓ Marquer traitée' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}

// ------------------------------------------------------------------
// Petits morceaux
// ------------------------------------------------------------------

/** Liste de la flotte groupée par type ; vide = embarcation inconnue. */
function ChoixEmbarcation({
  flotte,
  valeur,
  changer,
  className = '',
}: {
  flotte: Ligne[]
  valeur: string
  changer: (id: string) => void
  className?: string
}) {
  return (
    <select aria-label="Embarcation" className={`${ui.champ} ${className}`} value={valeur} onChange={(e) => changer(e.target.value)}>
      <option value="">Embarcation inconnue ou aucune</option>
      {TYPES.map((t) => {
        const duType = flotte.filter((l) => l.modele.type === t)
        return duType.length ? (
          <optgroup key={t} label={t}>
            {duType.map((l) => (
              <option key={l.id} value={l.id}>
                {l.numero_identification ?? 'Nouvelle'} · {l.modele.nom}
              </option>
            ))}
          </optgroup>
        ) : null
      })}
    </select>
  )
}

function dateCourte(iso: string) {
  const d = new Date(iso)
  const memeAnnee = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', ...(memeAnnee ? {} : { year: 'numeric' }) })
}
