import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { useSortieCarte } from '@/lib/sortieCarte'
import { ui } from '@/lib/ui'
import { aujourdhui } from '@/shell/pokes'
import { aEnvoyer, affichageStatut, nomReunion, nouveauPoint, ordreEnFin, reunionsAVenir, useDonnees } from './contexte'
import { useAjouterPoint, useModifierPoint, useSupprimerPoint } from './donnees'
import { NoteAffichee } from './Note'
import { initiales, jourDe, jourLisible, teinte } from './outils'
import type { Point, StatutPoint } from './types'

// L'éditeur (Tiptap) n'est chargé qu'à l'ouverture d'une note.
const Editeur = lazy(() => import('./Editeur'))

/** Pastille de la personne qui a ajouté le point (initiales, nom au survol). */
export function Auteur({ nom }: { nom: string | null }) {
  return (
    <span
      title={nom ? `Ajouté par ${nom}` : undefined}
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${teinte(nom)}`}
    >
      {initiales(nom)}
    </span>
  )
}

/** ★ Décision (ou point important), reprise dans le PV : un clic l'ajoute ou la retire. */
export function Etoile({ point, lecture }: { point: Point; lecture?: boolean }) {
  const { ecriture } = useDonnees()
  const modifier = useModifierPoint()
  if (!ecriture || lecture)
    return point.important ? (
      <span className="shrink-0 px-1 text-lg leading-none text-amber-500" title="Décision (PV)">
        ★
      </span>
    ) : null
  return (
    <button
      type="button"
      aria-pressed={point.important}
      aria-label={point.important ? `Retirer « ${point.texte} » du PV` : `Décision : mettre « ${point.texte} » au PV`}
      title={point.important ? 'Décision (PV) : cliquer pour retirer' : 'Décision : la mettre au PV'}
      className={`shrink-0 rounded px-1 text-lg leading-none ${point.important ? 'text-amber-500 hover:text-amber-600' : 'text-pierre-300 hover:text-amber-500'}`}
      onClick={() => modifier.mutate({ id: point.id, champs: { important: !point.important } })}
    >
      {point.important ? '★' : '☆'}
    </button>
  )
}

/** Petit menu ancré sous un bouton « ⋯ ». */
function MenuActions({ items }: { items: ({ libelle: string; action: () => void; danger?: boolean } | false)[] }) {
  const [ouvert, setOuvert] = useState(false)
  const boite = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: MouseEvent) => !boite.current?.contains(e.target as Node) && setOuvert(false)
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && setOuvert(false)
    document.addEventListener('mousedown', dehors)
    document.addEventListener('keydown', touche)
    return () => {
      document.removeEventListener('mousedown', dehors)
      document.removeEventListener('keydown', touche)
    }
  }, [ouvert])
  return (
    <div className="relative" ref={boite}>
      <button
        type="button"
        className="rounded-md px-2 py-1 text-pierre-500 hover:bg-pierre-100 hover:text-pierre-800"
        aria-label="Autres actions"
        aria-expanded={ouvert}
        onClick={() => setOuvert(!ouvert)}
      >
        ⋯
      </button>
      {ouvert && (
        <div className="absolute right-0 top-full z-30 mt-1 w-60 rounded-xl border border-pierre-200 bg-white py-1 shadow-lg">
          {items.map(
            (item) =>
              item && (
                <button
                  key={item.libelle}
                  type="button"
                  className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-pierre-50 ${item.danger ? 'text-red-700' : 'text-pierre-800'}`}
                  onClick={() => {
                    setOuvert(false)
                    item.action()
                  }}
                >
                  {item.libelle}
                </button>
              ),
          )}
        </div>
      )}
    </div>
  )
}

/** Un point d'un ordre du jour. */
export function CartePoint({
  point,
  reports = 0,
  avantActions,
  lecture,
  afficherJour,
  masquerPourLe,
  sortie,
}: {
  point: Point
  reports?: number
  /** Boutons propres à la vue (monter/descendre dans une réunion spéciale). */
  avantActions?: ReactNode
  /** Sans boutons (historique). */
  lecture?: boolean
  /** Montre le jour où le point a été traité (recherche). */
  afficherJour?: boolean
  /** Le jour prévu est déjà donné par la vue (Semaine). */
  masquerPourLe?: boolean
  /** Traité, rouvert ou envoyé ailleurs, le point quitte sa liste (ordre du jour) : il sort d'abord. */
  sortie?: boolean
}) {
  const { ecriture, moi, reunions } = useDonnees()
  const modifier = useModifierPoint()
  const supprimer = useSupprimerPoint()
  const [fiche, setFiche] = useState(false)
  const { ref, sortir } = useSortieCarte<HTMLLIElement>()
  const partir = (action: () => void) => (sortie ? sortir(action) : action())
  const ouvert = point.statut === 'ouvert'
  const actif = ecriture && !lecture
  const auj = aujourdhui()

  const changerStatut = (statut: StatutPoint) =>
    partir(() => modifier.mutate({ id: point.id, champs: { statut }, affiche: affichageStatut(statut, moi) }))
  const envoyerVers = (reunion: string | null) =>
    partir(() => modifier.mutate({ id: point.id, champs: { reunion_id: reunion, pour_le: null, ordre: ordreEnFin() } }))
  const autres = reunionsAVenir(reunions).filter((r) => r.id !== point.reunion_id)

  const mentions =
    (reports > 0 && ouvert) || (ouvert && point.pour_le && point.pour_le > auj && !masquerPourLe) || (afficherJour && point.traite_jour)

  return (
    <li ref={ref} className={`rounded-xl border border-pierre-200 px-3 py-2 ${ouvert ? 'bg-white' : 'bg-pierre-50/60'}`}>
      {/* Une seule ligne alignée : pastille, nom du point, Traité, ⋯ */}
      <div className="flex items-center gap-2.5">
        {point.recurrent_id ? (
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-pierre-100 text-sm text-pierre-500" title="Point fixe">
            ↻
          </span>
        ) : (
          <Auteur nom={point.auteur_nom} />
        )}
        <button
          type="button"
          className={`min-w-0 flex-1 text-left text-[15px] leading-snug ${ouvert ? 'font-medium text-pierre-900' : 'text-pierre-700'} ${actif ? 'hover:underline' : 'cursor-default'}`}
          onClick={() => actif && setFiche(true)}
        >
          {point.texte}
        </button>
        <Etoile point={point} lecture={!actif} />
        {actif && (
          <div className="flex shrink-0 items-center gap-0.5">
            {avantActions}
            {ouvert ? (
              <button type="button" className="rounded-lg border border-foret-600/30 px-2.5 py-1 text-sm font-medium text-foret-800 hover:bg-foret-50" onClick={() => changerStatut('traite')}>
                ✓ Traité
              </button>
            ) : (
              <button type="button" className="rounded-lg px-2 py-1 text-xs text-pierre-500 hover:bg-pierre-100 hover:text-pierre-800" onClick={() => changerStatut('ouvert')}>
                Rouvrir
              </button>
            )}
            <MenuActions
              items={[
                { libelle: 'Modifier…', action: () => setFiche(true) },
                ouvert && !!point.reunion_id && { libelle: 'Renvoyer au quotidien', action: () => envoyerVers(null) },
                ...(ouvert && !point.recurrent_id
                  ? autres.map((r) => ({ libelle: `Envoyer vers ${nomReunion(r)}${r.jour ? ` (${jourLisible(r.jour, auj, true)})` : ''}`, action: () => envoyerVers(r.id) }))
                  : []),
                {
                  libelle: 'Supprimer',
                  danger: true,
                  action: async () => {
                    if (await confirmer({ titre: 'Supprimer ce point ?', message: `« ${point.texte} » sera effacé.`, libelleOk: 'Supprimer', danger: true }))
                      supprimer.mutate(point.id)
                  },
                },
              ]}
            />
          </div>
        )}
      </div>
      {(point.details || mentions || (!ouvert && !afficherJour && point.traite_le)) && (
        <div className="pl-[2.375rem]">
          <NoteAffichee valeur={point.details} className="text-sm text-pierre-600" replier />
          {mentions && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {reports > 0 && ouvert && (
                <span className="rounded-full bg-pierre-100 px-1.5 py-0.5 text-xs text-pierre-600" title="Réunions où il était à l’ordre du jour sans être traité">
                  reporté {reports}×
                </span>
              )}
              {ouvert && point.pour_le && point.pour_le > auj && !masquerPourLe && (
                <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-xs text-sky-800">pour le {jourLisible(point.pour_le, auj)}</span>
              )}
              {afficherJour && point.traite_jour && <span className="text-xs text-pierre-500">{jourLisible(point.traite_jour, auj)}</span>}
            </div>
          )}
          {!ouvert && !afficherJour && point.traite_le && (
            <p className="mt-0.5 text-xs text-pierre-400">
              Traité{point.traite_par_nom && ` par ${point.traite_par_nom}`} · {jourLisible(jourDe(point.traite_le), auj)}
            </p>
          )}
        </div>
      )}
      {fiche && <FenetrePoint point={point} fermer={() => setFiche(false)} />}
    </li>
  )
}

function FenetrePoint({ point, fermer }: { point: Point; fermer: () => void }) {
  const modifier = useModifierPoint()
  const [texte, setTexte] = useState(point.texte)
  const [details, setDetails] = useState(point.details)
  const auj = aujourdhui()

  const enregistrer = () => {
    if (!texte.trim()) return
    modifier.mutate({ id: point.id, champs: { texte: texte.trim(), details: details?.trim() || null } })
    fermer()
  }

  return (
    <Dialogue titre="Point" fermer={fermer}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          enregistrer()
        }}
      >
        <label className="block">
          <span className={ui.etiquette}>Point</span>
          <input className={ui.champ} value={texte} onChange={(e) => setTexte(e.target.value)} required autoFocus />
        </label>
        <div>
          <span className={ui.etiquette}>Note</span>
          <div className="rounded-lg border border-pierre-300 bg-white px-3 py-2 text-sm focus-within:border-foret-600 focus-within:ring-2 focus-within:ring-foret-600/20">
            <Suspense fallback={<p className="min-h-20 text-pierre-400">Chargement…</p>}>
              <Editeur valeur={point.details} changer={setDetails} barre className="max-h-[45dvh] min-h-20 overflow-y-auto" />
            </Suspense>
          </div>
        </div>
        <p className="text-xs text-pierre-500">
          Ajouté par {point.auteur_nom ?? '?'} le {jourLisible(jourDe(point.created_at), auj)}
          {point.traite_le && ` · traité par ${point.traite_par_nom ?? '?'} le ${jourLisible(jourDe(point.traite_le), auj)}`}
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button className={ui.bouton}>Enregistrer</button>
        </div>
      </form>
    </Dialogue>
  )
}

/**
 * Barre d'ajout d'un point, la même partout (Ordre du jour, Semaine,
 * réunions spéciales) : le point et sa note (facultative).
 */
export function AjoutPoint({
  reunionId = null,
  ordre = 0,
  pourLe = null,
  placeholder,
  autoFocus,
  fini,
}: {
  reunionId?: string | null
  ordre?: number
  /** Quotidien : jour où le point apparaîtra à l'ordre du jour (null = tout de suite). */
  pourLe?: string | null
  placeholder?: string
  autoFocus?: boolean
  /** Appelé après un ajout ou Échap (fermer la barre). */
  fini?: () => void
}) {
  const { moi } = useDonnees()
  const ajouter = useAjouterPoint()
  const [texte, setTexte] = useState('')
  const [note, setNote] = useState('')
  const champ = useRef<HTMLInputElement>(null)

  const envoyer = () => {
    if (!texte.trim()) return
    const p = nouveauPoint({ texte: texte.trim(), details: note.trim() || null, reunion_id: reunionId, ordre, pour_le: pourLe }, moi)
    ajouter.mutate({ ligne: aEnvoyer(p), affiche: p })
    setTexte('')
    setNote('')
    champ.current?.focus()
  }

  return (
    <form
      className={`${ui.carte} p-2.5`}
      onSubmit={(e) => {
        e.preventDefault()
        envoyer()
      }}
      onKeyDown={(e) => e.key === 'Escape' && fini?.()}
    >
      <div className="flex items-center gap-2.5">
        <Auteur nom={moi.nom ?? moi.courriel} />
        <input
          ref={champ}
          autoFocus={autoFocus}
          className="min-w-0 flex-1 rounded-lg border border-pierre-300 bg-white px-3 py-2 text-[15px] focus:border-foret-600 focus:outline-none focus:ring-2 focus:ring-foret-600/20"
          placeholder={placeholder ?? 'Ajouter un point à l’ordre du jour…'}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          aria-label="Nouveau point"
        />
        <button className={ui.bouton} disabled={!texte.trim()}>
          Ajouter
        </button>
        {fini && (
          <button type="button" className="rounded-md px-1.5 py-1 text-pierre-400 hover:bg-pierre-100 hover:text-pierre-800" onClick={fini} aria-label="Fermer">
            ✕
          </button>
        )}
      </div>
      <div className="mt-2 pl-[2.375rem]">
        <textarea
          className="block w-full resize-y rounded-lg border border-pierre-200 bg-white px-3 py-1.5 text-sm placeholder:text-pierre-400 focus:border-foret-600 focus:outline-none focus:ring-2 focus:ring-foret-600/20"
          rows={2}
          placeholder="Note (facultatif)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            // ⌘/Ctrl + Entrée ajoute aussi depuis la note.
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              envoyer()
            }
          }}
          aria-label="Note"
        />
      </div>
    </form>
  )
}
