import type { Editor } from '@tiptap/react'
import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { useTitreImpression } from '@/lib/useTitreImpression'
import { aujourdhui } from '@/shell/pokes'
import { nomReunion, useDonnees } from './contexte'
import { AjoutRapide, CadreDocument, SectionPoint } from './Document'
import { jourLisible, lundi, pointsDuJour, recurrentsDuJour } from './outils'
import type { Point, Recurrent } from './types'

/**
 * Document du quotidien de direction pour un jour (`/reunions/jour/:jour`) :
 * aujourd'hui, la prise de notes pendant la réunion ; un jour passé, le
 * compte rendu (pour qui a raté la réunion), où l'on peut encore compléter
 * les notes et les ★.
 */
export default function DocumentJour() {
  const { jour = '' } = useParams()
  const auj = aujourdhui()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || jour > auj) return <Navigate to="/reunions" replace />
  // Nouveau jour = nouvelle page (la barre d'outils oublie l'éditeur d'avant).
  return <Contenu key={jour} jour={jour} />
}

function Contenu({ jour }: { jour: string }) {
  const { points, recurrents, reunions, jours, joursSans, ecriture } = useDonnees()
  const [actif, setActif] = useState<Editor | null>(null)
  const auj = aujourdhui()
  const estAuj = jour === auj
  useTitreImpression(`Réunion de direction - ${jour}`)

  const liste = pointsDuJour(points, jour, auj)
  // Ordre stable pendant la réunion : les points ajoutés à la main, puis les points fixes.
  const manuels = liste.filter((p) => !p.recurrent_id).sort((a, b) => a.created_at.localeCompare(b.created_at))
  const parId = new Map(recurrents.map((r) => [r.id, r]))
  const fixes: { cle: string; point?: Point; fixe?: Recurrent }[] = [
    ...liste.filter((p) => p.recurrent_id).map((p) => ({ cle: p.recurrent_id!, point: p, fixe: parId.get(p.recurrent_id!) })),
    // Pas encore traités aujourd'hui : pas de ligne tant qu'on n'y touche pas.
    ...(estAuj ? recurrentsDuJour(recurrents, points, auj).map((r) => ({ cle: r.id, fixe: r })) : []),
  ].sort((a, b) => (a.fixe?.ordre ?? 0) - (b.fixe?.ordre ?? 0) || (a.fixe?.texte ?? '').localeCompare(b.fixe?.texte ?? '', 'fr'))
  const speciales = reunions.filter((r) => r.jour === jour)

  // Jours de réunion (au moins un point traité), pour passer de l'un à l'autre.
  const joursReunion = [...new Set([...jours.keys(), auj])].sort()
  const precedent = joursReunion.filter((j) => j < jour).at(-1)
  const suivant = joursReunion.find((j) => j > jour)
  const semaine = lundi(jour) === lundi(auj) ? '' : `?semaine=${lundi(jour)}`

  return (
    <CadreDocument
      etiquette={`☕ Réunion de direction · ${jourLisible(jour, auj, true)}`}
      fermer={estAuj ? '/reunions' : `/reunions/semaine${semaine}`}
      pv={`/reunions/pv?reunion=quotidien&du=${jour}&au=${jour}`}
      decisions={liste.filter((p) => p.important).length}
      actif={actif}
    >
      <h1 className="text-3xl font-semibold text-pierre-900">Réunion de direction</h1>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-pierre-600">
        <span className="first-letter:uppercase">{jourLisible(jour, auj)}</span>
        {!estAuj && <span>· Compte rendu</span>}
        <span className="ml-auto flex gap-1 print:hidden">
          {precedent && (
            <Link to={`/reunions/jour/${precedent}`} className="rounded-lg px-2 py-1 text-pierre-600 hover:bg-pierre-100" title="Réunion précédente">
              ‹ {jourLisible(precedent, auj, true)}
            </Link>
          )}
          {suivant && (
            <Link to={`/reunions/jour/${suivant}`} className="rounded-lg px-2 py-1 text-pierre-600 hover:bg-pierre-100" title="Réunion suivante">
              {suivant === auj ? "Aujourd'hui" : jourLisible(suivant, auj, true)} ›
            </Link>
          )}
        </span>
      </div>
      {joursSans.has(jour) && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">❌ Pas de réunion {estAuj ? "aujourd'hui" : 'ce jour-là'}</p>
      )}
      {speciales.length > 0 && (
        <p className="mt-4 flex flex-wrap gap-2 text-sm print:hidden">
          {speciales.map((r) => (
            <Link key={r.id} to={`/reunions/speciales/${r.id}/notes`} className="rounded-lg border border-violet-200 bg-violet-50/60 px-2.5 py-1 text-violet-900 hover:bg-violet-50">
              {nomReunion(r)} : notes →
            </Link>
          ))}
        </p>
      )}

      {manuels.length + fixes.length === 0 && (
        <p className="mt-8 text-sm text-pierre-500">{estAuj ? "Rien à l'ordre du jour." : 'Aucun point traité ce jour-là.'}</p>
      )}
      <div className="mt-8 space-y-9">
        {manuels.map((p) => (
          <SectionPoint key={p.id} point={p} traiter={estAuj} surFocus={setActif} />
        ))}
        {/* Même clé avant et après traitement : l'éditeur reste en place quand la ligne est créée. */}
        {fixes.map((f) => (
          <SectionPoint key={`fixe-${f.cle}`} point={f.point} fixe={f.point ? undefined : f.fixe} traiter={estAuj} surFocus={setActif} />
        ))}
      </div>
      {ecriture && estAuj && <AjoutRapide reunionId={null} />}
      {estAuj && <p className="mt-6 text-xs text-pierre-400 print:hidden">Un point non traité revient demain avec sa note.</p>}
    </CadreDocument>
  )
}
