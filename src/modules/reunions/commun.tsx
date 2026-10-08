import { useEffect, useRef, useState, type ReactNode } from 'react'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { ui } from '@/lib/ui'
import { aujourdhui } from '@/shell/pokes'
import { aEnvoyer, affichageStatut, nomReunion, nouveauPoint, ordreEnFin, reunionsAVenir, useDonnees } from './contexte'
import { useAjouterPoint, useModifierPoint, useSupprimerPoint } from './donnees'
import { initiales, jourDe, jourLisible, teinte } from './outils'
import type { Point, StatutPoint } from './types'

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
}: {
  point: Point
  reports?: number
  /** Boutons propres à la vue (monter/descendre dans une réunion spéciale). */
  avantActions?: ReactNode
  /** Sans boutons (historique). */
  lecture?: boolean
  /** Montre le jour où le point a été traité (recherche). */
  afficherJour?: boolean
}) {
  const { ecriture, moi, reunions } = useDonnees()
  const modifier = useModifierPoint()
  const supprimer = useSupprimerPoint()
  const [fiche, setFiche] = useState(false)
  const ouvert = point.statut === 'ouvert'
  const actif = ecriture && !lecture
  const auj = aujourdhui()

  const changerStatut = (statut: StatutPoint) => modifier.mutate({ id: point.id, champs: { statut }, affiche: affichageStatut(statut, moi) })
  const envoyerVers = (reunion: string | null) => modifier.mutate({ id: point.id, champs: { reunion_id: reunion, ordre: ordreEnFin() } })
  const autres = reunionsAVenir(reunions).filter((r) => r.id !== point.reunion_id)

  return (
    <li className={`rounded-xl border border-pierre-200 px-3 py-2.5 ${ouvert ? 'bg-white' : 'bg-pierre-50/60'}`}>
      <div className="flex items-start gap-2.5">
        {point.recurrent_id ? (
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-pierre-100 text-sm text-pierre-500" title="Point fixe">
            ↻
          </span>
        ) : (
          <Auteur nom={point.auteur_nom} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              type="button"
              className={`text-left text-[15px] leading-snug ${ouvert ? 'font-medium text-pierre-900' : 'text-pierre-700'} ${actif ? 'hover:underline' : 'cursor-default'}`}
              onClick={() => actif && setFiche(true)}
            >
              {point.texte}
            </button>
            {reports > 0 && ouvert && (
              <span className="rounded-full bg-pierre-100 px-1.5 py-0.5 text-xs text-pierre-600" title="Réunions où il était à l’ordre du jour sans être traité">
                reporté {reports}×
              </span>
            )}
            {afficherJour && point.traite_jour && <span className="text-xs text-pierre-500">{jourLisible(point.traite_jour, auj)}</span>}
          </div>
          {point.details && <p className="mt-0.5 whitespace-pre-line text-sm text-pierre-600">{point.details}</p>}
          {point.decision && (
            <p className="mt-1 text-sm text-pierre-800">
              <span className="font-medium text-foret-800">→ </span>
              {point.decision}
            </p>
          )}
          {!ouvert && !afficherJour && point.traite_le && (
            <p className="mt-0.5 text-xs text-pierre-400">
              Traité{point.traite_par_nom && ` par ${point.traite_par_nom}`} · {jourLisible(jourDe(point.traite_le), auj)}
            </p>
          )}
        </div>
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
      {fiche && <FenetrePoint point={point} fermer={() => setFiche(false)} />}
    </li>
  )
}

function FenetrePoint({ point, fermer }: { point: Point; fermer: () => void }) {
  const modifier = useModifierPoint()
  const [texte, setTexte] = useState(point.texte)
  const [details, setDetails] = useState(point.details ?? '')
  const [decision, setDecision] = useState(point.decision ?? '')
  const auj = aujourdhui()

  const enregistrer = () => {
    if (!texte.trim()) return
    modifier.mutate({ id: point.id, champs: { texte: texte.trim(), details: details.trim() || null, decision: decision.trim() || null } })
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
        <label className="block">
          <span className={ui.etiquette}>Détails</span>
          <textarea className={ui.champ} rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />
        </label>
        <label className="block">
          <span className={ui.etiquette}>Ce qu'on retient</span>
          <input className={ui.champ} value={decision} onChange={(e) => setDecision(e.target.value)} placeholder="Décision, prochaine étape… (facultatif)" />
        </label>
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

/** Ajout d'un point : une ligne, Entrée. */
export function AjoutPoint({ reunionId = null, ordre = 0, placeholder }: { reunionId?: string | null; ordre?: number; placeholder?: string }) {
  const { moi } = useDonnees()
  const ajouter = useAjouterPoint()
  const [texte, setTexte] = useState('')

  const envoyer = () => {
    if (!texte.trim()) return
    const p = nouveauPoint({ texte: texte.trim(), reunion_id: reunionId, ordre }, moi)
    ajouter.mutate({ ligne: aEnvoyer(p), affiche: p })
    setTexte('')
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        envoyer()
      }}
    >
      <Auteur nom={moi.nom ?? moi.courriel} />
      <input
        className="min-w-0 flex-1 rounded-lg border border-pierre-300 bg-white px-3 py-2 text-[15px] focus:border-foret-600 focus:outline-none focus:ring-2 focus:ring-foret-600/20"
        placeholder={placeholder ?? 'Ajouter un point à l’ordre du jour…'}
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        aria-label="Nouveau point"
      />
      <button className={ui.bouton} disabled={!texte.trim()}>
        Ajouter
      </button>
    </form>
  )
}
