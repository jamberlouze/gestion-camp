import { useState } from 'react'
import { BoutonModifier, BoutonSupprimer } from '@/lib/BoutonsAction'
import { confirmer } from '@/lib/Confirmation'
import { ui } from '@/lib/ui'
import { useEchanges } from '@/modules/crm/donnees'
import { useDonnees } from './contexte'
import { useAjouterNote, useModifierNote, useNotesReservation, useRetirerNote } from './donnees'
import { dateLongue } from './format'
import { estNoteEquipe } from './notes'
import type { NoteReservation, Reservation } from './types'

// Notes de l'équipe en haut de la fiche (réunion du 2026-10-21, lot E) :
// datées et signées par la base, même sans organisation reliée ; chacun
// modifie ou retire les siennes. Les notes faites avant dans le Suivi
// (échanges « note » du CRM, imports compris) sont montrées ici aussi, en
// lecture ; celles qu'écrit la page client restent dans le Suivi.

const MONTREES = 4

const moment = (iso: string) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

type Entree = { id: string; tri: string; quand: string; texte: string; qui: string | null; note?: NoteReservation }

export function NotesEquipe({ r }: { r: Reservation }) {
  const { ecriture, moi } = useDonnees()
  const notes = useNotesReservation(r.id)
  const echanges = useEchanges()
  const ajouter = useAjouterNote()
  const [texte, setTexte] = useState('')
  const [tout, setTout] = useState(false)

  const fil: Entree[] = [
    ...(notes.data ?? []).map((n) => ({
      id: n.id,
      tri: n.cree_le,
      quand: `${moment(n.cree_le)}${n.modifie_le ? ' (modifiée)' : ''}`,
      texte: n.texte,
      qui: n.auteur_nom,
      note: n,
    })),
    ...(echanges.data ?? [])
      .filter((e) => e.reservation_id === r.id && estNoteEquipe(e))
      .map((e) => ({ id: e.id, tri: `${e.jour}T12:00`, quand: `${dateLongue(e.jour)} · Suivi`, texte: e.texte, qui: e.auteur_nom })),
  ].sort((a, b) => b.tri.localeCompare(a.tri))
  const montrees = tout ? fil : fil.slice(0, MONTREES)

  const noter = () => {
    const t = texte.trim()
    if (!t) return
    ajouter.mutate({ id: crypto.randomUUID(), reservation_id: r.id, texte: t, auteur: moi.id, auteur_nom: moi.nom, cree_le: new Date().toISOString(), modifie_le: null })
    setTexte('')
  }

  return (
    <section className={`${ui.carte} p-4`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold text-pierre-900">Notes</h2>
        <span className="text-xs text-pierre-500">De l'équipe, datées et signées</span>
      </div>
      {ecriture && (
        <form
          className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start"
          onSubmit={(e) => {
            e.preventDefault()
            noter()
          }}
        >
          <textarea
            rows={2}
            aria-label="Nouvelle note"
            className={`${ui.champ} min-h-9 min-w-0 flex-1 resize-y`}
            placeholder="Ajouter une note pour l'équipe (appel, précision, à faire…)"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                noter()
              }
            }}
          />
          <button className={`${ui.bouton} shrink-0`} disabled={!texte.trim()}>
            Noter
          </button>
        </form>
      )}
      {fil.length === 0 ? (
        <p className="text-sm text-pierre-500">Aucune note.</p>
      ) : (
        <ul className="divide-y divide-pierre-100">
          {montrees.map((x) => (
            <LigneNote key={x.id} x={x} miens={!!x.note && x.note.auteur === moi.id && ecriture} />
          ))}
        </ul>
      )}
      {fil.length > MONTREES && (
        <button className="mt-1 text-xs font-medium text-foret-700 hover:text-foret-800" onClick={() => setTout((t) => !t)}>
          {tout ? 'Moins de notes' : `Voir les ${fil.length} notes`}
        </button>
      )}
    </section>
  )
}

function LigneNote({ x, miens }: { x: Entree; miens: boolean }) {
  const modifier = useModifierNote()
  const retirer = useRetirerNote()
  const [edition, setEdition] = useState<string | null>(null)
  return (
    <li className="py-2 text-sm">
      {edition !== null ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            const t = edition.trim()
            if (t && x.note && t !== x.note.texte) modifier.mutate({ id: x.note.id, champs: { texte: t } })
            setEdition(null)
          }}
        >
          <textarea autoFocus rows={3} className={ui.champ} value={edition} onChange={(e) => setEdition(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button type="button" className={ui.boutonSecondaire} onClick={() => setEdition(null)}>
              Annuler
            </button>
            <button className={ui.bouton} disabled={!edition.trim()}>
              Enregistrer
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-2">
          <div className="min-w-0 flex-1">
            <p className="whitespace-pre-wrap text-pierre-900">{x.texte}</p>
            <p className="text-xs text-pierre-500">
              {x.quand}
              {x.qui && ` · ${x.qui}`}
            </p>
          </div>
          {miens && x.note && (
            <div className="flex shrink-0 gap-1.5">
              <BoutonModifier className="px-2 py-0.5 text-xs" onClick={() => setEdition(x.note!.texte)} />
              <BoutonSupprimer
                className="px-2 py-0.5 text-xs"
                onClick={async () => {
                  if (await confirmer({ titre: 'Retirer cette note ?', libelleOk: 'Retirer', danger: true }))
                    retirer.mutate({ id: x.note!.id, reservation_id: x.note!.reservation_id })
                }}
              >
                Retirer
              </BoutonSupprimer>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
