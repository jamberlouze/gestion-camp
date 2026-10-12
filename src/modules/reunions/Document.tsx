import { useIsMutating } from '@tanstack/react-query'
import type { Editor } from '@tiptap/react'
import { useState, type ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { ChampTexte } from '@/lib/ChampTexte'
import { PuceCompagnie } from '@/lib/PuceCompagnie'
import { ui } from '@/lib/ui'
import { useTitreImpression } from '@/lib/useTitreImpression'
import { aujourdhui } from '@/shell/pokes'
import { Auteur, Etoile } from './commun'
import { aEnvoyer, affichageStatut, nomReunion, nouveauPoint, useDonnees } from './contexte'
import { useAjouterPoint, useModifierPoint, useModifierReunion } from './donnees'
import { BarreOutils, NoteAuto } from './Editeur'
import { NoteAffichee } from './Note'
import { heureLisible, jourLisible } from './outils'
import type { Point, Recurrent } from './types'

/**
 * Document d'une réunion spéciale (prise de notes, en grand) : chaque point
 * de l'ordre du jour est un titre, ses notes dessous (la note du point), puis
 * les notes générales (le compte rendu de la réunion). Tout s'enregistre
 * seul ; une seule barre d'outils, pour le dernier endroit où l'on a écrit.
 */
export default function DocumentReunion() {
  const { id } = useParams()
  const { reunions, points, entreprises, ecriture } = useDonnees()
  const modifierReunion = useModifierReunion()
  const [actif, setActif] = useState<Editor | null>(null)
  const r = reunions.find((x) => x.id === id)
  useTitreImpression(r ? `${r.titre}${r.jour ? ` - ${r.jour}` : ''}` : null)
  const auj = aujourdhui()

  if (!r) return <Navigate to="/reunions/speciales" replace />

  const siens = points.filter((p) => p.reunion_id === r.id).sort((a, b) => a.ordre - b.ordre || a.created_at.localeCompare(b.created_at))
  const compagnie = entreprises.find((e) => e.id === r.entreprise_id)

  return (
    <CadreDocument
      etiquette={nomReunion(r)}
      fermer={`/reunions/speciales/${r.id}`}
      pv={`/reunions/pv?reunion=${r.id}`}
      decisions={siens.filter((p) => p.important).length}
      actif={actif}
    >
      <h1 className="text-3xl font-semibold text-pierre-900">{r.titre}</h1>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-pierre-600">
        <span className="first-letter:uppercase">{r.jour ? jourLisible(r.jour, auj) : 'Date à fixer'}</span>
        {r.heure && <span>· {heureLisible(r.heure)}</span>}
        {r.lieu && <span>· {r.lieu}</span>}
        {compagnie && <PuceCompagnie compagnie={compagnie} />}
      </p>
      {(r.objectif || r.participants) && (
        <dl className="mt-4 space-y-1 rounded-xl bg-pierre-50 px-4 py-3 text-sm">
          {r.objectif && (
            <div className="flex gap-2">
              <dt className="shrink-0 font-medium text-pierre-500">Objectif</dt>
              <dd className="whitespace-pre-line">{r.objectif}</dd>
            </div>
          )}
          {r.participants && (
            <div className="flex gap-2">
              <dt className="shrink-0 font-medium text-pierre-500">Participants</dt>
              <dd className="whitespace-pre-line">{r.participants}</dd>
            </div>
          )}
        </dl>
      )}

      {siens.length === 0 && <p className="mt-8 text-sm text-pierre-500">Aucun point à l'ordre du jour.</p>}
      <div className="mt-8 space-y-9">
        {siens.map((p) => (
          <SectionPoint key={p.id} point={p} traiter surFocus={setActif} />
        ))}
      </div>
      {ecriture && <AjoutRapide reunionId={r.id} ordre={(siens.at(-1)?.ordre ?? 0) + 1} />}

      <section className="mt-12">
        <h2 className="border-b border-pierre-200 pb-1.5 text-xl font-semibold text-pierre-900">Notes générales</h2>
        <div className="mt-2.5">
          {ecriture ? (
            <NoteAuto
              valeur={r.compte_rendu}
              enregistrer={(v) => v !== r.compte_rendu && modifierReunion.mutate({ id: r.id, champs: { compte_rendu: v } })}
              placeholder="Ce qui ne va sous aucun point : présences, varia, prochaine réunion…"
              surFocus={setActif}
              className="min-h-24 text-[15px] text-pierre-800"
            />
          ) : (
            <NoteAffichee valeur={r.compte_rendu} className="text-[15px]" />
          )}
        </div>
      </section>
    </CadreDocument>
  )
}

/** Cadre plein écran d'un document : barre du haut (fermer, PV, imprimer), barre d'outils, page. */
export function CadreDocument({
  etiquette,
  fermer,
  pv,
  decisions,
  actif,
  children,
}: {
  etiquette: string
  /** Adresse où revenir. */
  fermer: string
  /** Adresse du PV de ce document. */
  pv: string
  /** Nombre de décisions (★) du document. */
  decisions: number
  actif: Editor | null
  children: ReactNode
}) {
  const { ecriture } = useDonnees()
  const enCours = useIsMutating({ mutationKey: ['reunions'] })
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-white print:static print:overflow-visible">
      <header className="sticky top-0 z-10 border-b border-pierre-200 bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 pb-1.5 pt-2.5">
          <Link to={fermer} className={`${ui.boutonSecondaire} px-2.5 py-1.5`}>
            ✕ Fermer
          </Link>
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-pierre-600">{etiquette}</p>
          {ecriture && <span className="shrink-0 text-xs text-pierre-500">{enCours ? 'Enregistrement…' : '✓ Enregistré'}</span>}
          <Link to={pv} className="shrink-0 rounded-lg px-2 py-1.5 text-sm text-pierre-700 hover:bg-pierre-100" title="Décisions (★) au PV">
            <span className="text-amber-500">★</span> PV{decisions > 0 && ` (${decisions})`}
          </Link>
          <button type="button" className="shrink-0 rounded-lg px-2 py-1.5 text-sm text-pierre-700 hover:bg-pierre-100" onClick={() => window.print()} title="Imprimer ou enregistrer en PDF">
            🖨️
          </button>
        </div>
        {ecriture && (
          <div className="mx-auto max-w-3xl px-3 pb-1.5">
            <BarreOutils editeur={actif} />
          </div>
        )}
      </header>
      <div className="mx-auto max-w-3xl px-4 pb-32 pt-8 print:max-w-none print:p-0">
        <BandeauErreurs racine="reunions" />
        {children}
      </div>
    </div>
  )
}

/**
 * Un point du document : titre (renommable), ☆ décision, ✓ Traité, notes
 * dessous. Un point fixe du quotidien pas encore traité (`fixe` sans
 * `point`) n'a pas de ligne : elle est créée, traitée, au premier geste
 * (note, ☆ ou ✓).
 */
export function SectionPoint({
  point,
  fixe,
  traiter,
  surFocus,
}: {
  point?: Point
  fixe?: Recurrent
  /** Montrer « ✓ Traité » (pas dans le compte rendu d'un jour passé). */
  traiter: boolean
  surFocus: (e: Editor) => void
}) {
  const { ecriture, moi } = useDonnees()
  const modifier = useModifierPoint()
  const ajouter = useAjouterPoint()
  const texte = point?.texte ?? fixe?.texte ?? ''
  const ouvert = !point || point.statut === 'ouvert'
  const estFixe = !!fixe || !!point?.recurrent_id

  const creer = (champs: Partial<Point>) => {
    if (!fixe) return
    const p = nouveauPoint({ texte: fixe.texte, recurrent_id: fixe.id, statut: 'traite', ...champs }, moi)
    ajouter.mutate({ ligne: aEnvoyer(p), affiche: p })
  }
  const basculer = () => {
    if (!point) return creer({})
    const statut = ouvert ? 'traite' : 'ouvert'
    modifier.mutate({ id: point.id, champs: { statut }, affiche: affichageStatut(statut, moi) })
  }

  return (
    <section className="relative break-inside-avoid-page">
      {/* Décision : une barre dorée dans la marge. */}
      {point?.important && <span className="absolute -left-3 bottom-0 top-0 w-1 rounded-full bg-amber-400" aria-hidden />}
      <div className="flex items-center gap-2 border-b border-pierre-200 pb-1.5">
        {estFixe ? (
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-pierre-100 text-sm text-pierre-500" title="Point fixe">
            ↻
          </span>
        ) : (
          <Auteur nom={point?.auteur_nom ?? null} />
        )}
        {ecriture && point && !estFixe ? (
          <ChampTexte
            valeur={point.texte}
            enregistrer={(t) => modifier.mutate({ id: point.id, champs: { texte: t } })}
            obligatoire
            aria-label="Titre du point"
            className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-xl font-semibold text-pierre-900 hover:bg-pierre-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-foret-600/20"
          />
        ) : (
          <h2 className="min-w-0 flex-1 px-1 text-xl font-semibold text-pierre-900">{texte}</h2>
        )}
        {point ? (
          <Etoile point={point} />
        ) : (
          ecriture && (
            <button
              type="button"
              className="shrink-0 rounded px-1 text-lg leading-none text-pierre-300 hover:text-amber-500"
              title="Décision : la mettre au PV"
              aria-label={`Décision : mettre « ${texte} » au PV`}
              onClick={() => creer({ important: true })}
            >
              ☆
            </button>
          )
        )}
        {ecriture && traiter && (
          <button
            type="button"
            onClick={basculer}
            // Un point fixe traité ne se rouvre pas d'ici (il reviendrait au prochain jour prévu).
            disabled={estFixe && !ouvert}
            title={ouvert ? 'Marquer comme traité' : estFixe ? 'Traité' : 'Traité : cliquer pour rouvrir'}
            className={`shrink-0 rounded-lg px-2.5 py-1 text-sm font-medium disabled:cursor-default print:hidden ${
              ouvert ? 'border border-foret-600/30 text-foret-800 hover:bg-foret-50' : 'border border-transparent bg-foret-50 text-foret-800 enabled:hover:bg-foret-100'
            }`}
          >
            ✓ Traité
          </button>
        )}
      </div>
      <div className="mt-2.5 pl-1">
        {ecriture ? (
          <NoteAuto
            valeur={point?.details ?? null}
            enregistrer={(v) => {
              if (!point) {
                if (v) creer({ details: v })
              } else if (v !== point.details) modifier.mutate({ id: point.id, champs: { details: v } })
            }}
            placeholder={point || !fixe ? 'Notes sur ce point…' : 'Notes sur ce point (le marque traité)…'}
            surFocus={surFocus}
            className="min-h-7 text-[15px] text-pierre-800"
          />
        ) : (
          <NoteAffichee valeur={point?.details ?? null} className="text-[15px]" />
        )}
      </div>
    </section>
  )
}

/** Ajouter un point pendant la réunion (au bas de l'ordre du jour). */
export function AjoutRapide({ reunionId, ordre = 0 }: { reunionId: string | null; ordre?: number }) {
  const { moi } = useDonnees()
  const ajouter = useAjouterPoint()
  const [texte, setTexte] = useState('')
  return (
    <form
      className="mt-9 flex items-center gap-2 print:hidden"
      onSubmit={(e) => {
        e.preventDefault()
        if (!texte.trim()) return
        const p = nouveauPoint({ texte: texte.trim(), reunion_id: reunionId, ordre }, moi)
        ajouter.mutate({ ligne: aEnvoyer(p), affiche: p })
        setTexte('')
      }}
    >
      <input className={`${ui.champ} text-[15px]`} placeholder="+ Ajouter un point à l'ordre du jour…" value={texte} onChange={(e) => setTexte(e.target.value)} aria-label="Nouveau point" />
      <button className={ui.boutonSecondaire} disabled={!texte.trim()}>
        Ajouter
      </button>
    </form>
  )
}
