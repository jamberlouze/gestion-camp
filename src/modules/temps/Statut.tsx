import { useState } from 'react'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import type { Action, EntreeJournal, Statut } from './donnees'

// Soumission et approbation d'une feuille (direction ou employé) : pastille
// d'état, barre d'actions et journal. La base décide de qui peut faire quoi
// (temps.changer_feuille / changer_feuille_employe) ; l'app ne montre que
// les boutons utiles.

const PASTILLES: Record<Statut, { libelle: string; classe: string }> = {
  ouverte: { libelle: 'En cours', classe: 'bg-pierre-100 text-pierre-700' },
  soumise: { libelle: 'Soumise', classe: 'bg-amber-100 text-amber-800' },
  approuvee: { libelle: 'Approuvée', classe: 'bg-foret-100 text-foret-800' },
}

export function PastilleStatut({ statut, className = '' }: { statut: Statut; className?: string }) {
  const p = PASTILLES[statut]
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${p.classe} ${className}`}>{p.libelle}</span>
}

const quand = (iso: string) =>
  new Date(iso).toLocaleString('fr-CA', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

const derniere = (journal: EntreeJournal[], genre: EntreeJournal['genre']) => journal.filter((e) => e.genre === genre).at(-1)

/**
 * État de la feuille et ce qu'on peut en faire.
 *   auteur      : soumettre (feuille ouverte) ;
 *   approbateur : approuver ou renvoyer (feuille soumise) ;
 *   peutRouvrir : annuler l'approbation (admin).
 */
export function BarreStatut({
  statut,
  journal,
  auteur,
  approbateur,
  peutRouvrir,
  destinataire,
  onAction,
}: {
  statut: Statut
  journal: EntreeJournal[]
  auteur: boolean
  approbateur: boolean
  peutRouvrir: boolean
  /** « la direction », « un administrateur »… */
  destinataire: string
  onAction: (action: Action, texte?: string) => Promise<unknown>
}) {
  const [renvoi, setRenvoi] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const agir = async (action: Action, texte?: string) => {
    setErreur(null)
    setEnCours(true)
    try {
      await onAction(action, texte)
      setRenvoi(null)
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  const soumission = derniere(journal, 'soumission')
  const approbation = derniere(journal, 'approbation')
  // Ouverte après un renvoi : le message de l'approbateur reste affiché jusqu'à la prochaine soumission.
  const dernierRenvoi = statut === 'ouverte' ? journal.filter((e) => e.genre !== 'note').at(-1) : undefined

  let texte: string
  if (statut === 'ouverte') {
    texte = auteur
      ? `Quand la feuille est complète, soumettez-la à ${destinataire}. Vous ne pourrez plus changer les heures ensuite, seulement ajouter des notes.`
      : 'Pas encore soumise.'
  } else if (statut === 'soumise') {
    texte = `Soumise${soumission ? ` par ${soumission.auteur_nom} le ${quand(soumission.created_at)}` : ''}${
      auteur ? `, en attente d'approbation. Elle est gelée : vous pouvez seulement ajouter une note.` : '.'
    }`
  } else {
    texte = `Approuvée${approbation ? ` par ${approbation.auteur_nom} le ${quand(approbation.created_at)}` : ''}.`
  }

  return (
    <div
      className={`${ui.carte} space-y-3 px-4 py-3 print:hidden ${
        statut === 'soumise' && approbateur ? 'border-amber-300 bg-amber-50/50' : ''
      }`}
    >
      {dernierRenvoi?.genre === 'renvoi' && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <b>Renvoyée par {dernierRenvoi.auteur_nom}</b> le {quand(dernierRenvoi.created_at)} : {dernierRenvoi.texte}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <PastilleStatut statut={statut} />
        <p className="min-w-0 flex-1 text-sm text-pierre-700">{texte}</p>
        <div className="flex flex-wrap gap-2">
          {statut === 'ouverte' && auteur && (
            <button
              className={ui.bouton}
              disabled={enCours}
              onClick={async () => {
                if (
                  await confirmer({
                    titre: 'Soumettre la feuille ?',
                    message: `Elle part à ${destinataire} et devient gelée : vous pourrez seulement ajouter des notes.`,
                    libelleOk: 'Soumettre',
                  })
                )
                  agir('soumettre')
              }}
            >
              Soumettre
            </button>
          )}
          {statut === 'soumise' && approbateur && renvoi == null && (
            <>
              <button className={ui.bouton} disabled={enCours} onClick={() => agir('approuver')}>
                Approuver
              </button>
              <button className={ui.boutonSecondaire} disabled={enCours} onClick={() => setRenvoi('')}>
                Renvoyer…
              </button>
            </>
          )}
          {statut === 'approuvee' && peutRouvrir && (
            <button
              className={ui.boutonSecondaire}
              disabled={enCours}
              onClick={async () => {
                if (
                  await confirmer({
                    titre: "Annuler l'approbation ?",
                    message: 'La feuille redevient soumise : elle peut être corrigée, puis approuvée ou renvoyée.',
                    libelleOk: "Annuler l'approbation",
                  })
                )
                  agir('rouvrir')
              }}
            >
              Annuler l'approbation
            </button>
          )}
        </div>
      </div>
      {renvoi != null && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (renvoi.trim()) agir('renvoyer', renvoi)
          }}
        >
          <label className={ui.etiquette} htmlFor="message-renvoi">
            Pourquoi la renvoyer ?
          </label>
          <textarea
            id="message-renvoi"
            autoFocus
            className={`${ui.champ} min-h-16`}
            placeholder="Ex. il manque les heures de mardi."
            value={renvoi}
            onChange={(e) => setRenvoi(e.target.value)}
          />
          <div className="flex gap-2">
            <button type="submit" className={ui.bouton} disabled={enCours || !renvoi.trim()}>
              Renvoyer
            </button>
            <button type="button" className="text-sm text-pierre-500" onClick={() => setRenvoi(null)}>
              Annuler
            </button>
          </div>
        </form>
      )}
      {erreur && <p className={ui.erreur}>{erreur}</p>}
    </div>
  )
}

const LIBELLES: Record<EntreeJournal['genre'], string> = {
  soumission: 'Soumise',
  approbation: 'Approuvée',
  renvoi: 'Renvoyée',
  reouverture: 'Approbation annulée',
  note: 'Note',
}

/**
 * Historique de la feuille et notes ajoutées. Une feuille soumise ou
 * approuvée est gelée : on ne peut plus qu'y ajouter une note (datée,
 * signée, jamais effacée).
 */
export function Journal({
  journal,
  peutNoter,
  onNoter,
}: {
  journal: EntreeJournal[]
  peutNoter: boolean
  onNoter: (texte: string) => Promise<unknown>
}) {
  const [texte, setTexte] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  if (!journal.length && !peutNoter) return null

  return (
    <section className="space-y-2">
      <h3 className={ui.etiquette}>Historique et notes</h3>
      {journal.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {journal.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-2">
              <span className="text-pierre-500">{quand(e.created_at)}</span>
              <span className="font-medium text-pierre-800">
                {LIBELLES[e.genre]} · {e.auteur_nom}
              </span>
              {e.texte && <span className="w-full whitespace-pre-wrap text-pierre-700 sm:w-auto">{e.texte}</span>}
            </li>
          ))}
        </ul>
      )}
      {peutNoter && (
        <form
          className="flex flex-wrap items-start gap-2 print:hidden"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!texte.trim()) return
            setErreur(null)
            setEnCours(true)
            try {
              await onNoter(texte)
              setTexte('')
            } catch (err) {
              setErreur(messageErreur(err))
            } finally {
              setEnCours(false)
            }
          }}
        >
          <textarea
            aria-label="Ajouter une note"
            className={`${ui.champ} min-h-10 flex-1`}
            placeholder="Ajouter une note (ex. oubli : 2 h samedi)…"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
          />
          <button type="submit" className={ui.boutonSecondaire} disabled={enCours || !texte.trim()}>
            Ajouter la note
          </button>
          {erreur && <p className={`${ui.erreur} w-full`}>{erreur}</p>}
        </form>
      )}
    </section>
  )
}
