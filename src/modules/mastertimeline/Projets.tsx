import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { messageErreur } from '@/lib/donnees'
import { IconeChevron, IconePlus } from '@/lib/icones'
import { useAuth } from '@/shell/auth'
import { ui } from '@/lib/ui'
import {
  cleAujourdhui,
  cleCoche,
  clesExercice,
  etatPassage,
  exerciceDeCle,
  libelleExercice,
  libelleMois,
  majuscule,
  passages,
  type Etat,
  type IndexCoches,
} from './calendrier'
import { LigneTache, Pastille, Puce } from './commun'
import { useCoches, useReferences, useTaches, type References } from './donnees'
import { trierPassages, useEcriture, useOuvrirFiche, type Passage } from './outils'
import type { Projet, Tache } from './types'

const regle = (e: Etat) => e === 'faite' || e === 'sautee'

/** Passages d'une tâche de projet pendant l'exercice. */
function passagesTache(t: Tache, exercice: number, index: IndexCoches): Passage[] {
  const aujourdhui = cleAujourdhui()
  return passages(t, exercice).map((cle) => {
    const coche = index.get(cleCoche(t.id, cle))
    return { tache: t, periode: cle, etat: etatPassage(coche, cle, aujourdhui), coche }
  })
}

export function Projets() {
  const { id } = useParams()
  return id ? <DetailProjet id={id} /> : <ListeProjets />
}

function ListeProjets() {
  const { peutLire } = useAuth()
  const refs = useReferences()
  const taches = useTaches()
  const exercice = exerciceDeCle(cleAujourdhui())
  const coches = useCoches(exercice)

  const stats = useMemo(() => {
    const parProjet = new Map<string, Passage[]>()
    for (const t of taches.data ?? []) {
      if (!t.projet_id) continue
      const l = parProjet.get(t.projet_id) ?? []
      l.push(...passagesTache(t, exercice, coches.index))
      parProjet.set(t.projet_id, l)
    }
    return parProjet
  }, [taches.data, coches.index, exercice])

  if (taches.error || refs.erreur) return <p className={ui.erreur}>{messageErreur(taches.error ?? refs.erreur)}</p>
  if (!taches.data || !coches.pret || !refs.pret) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  return (
    <div className="space-y-6">
      <section>
        <h2 className="font-semibold">Projets de l'année</h2>
        <p className="text-sm text-pierre-500">Avancement de l'exercice {libelleExercice(exercice)}.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {refs.projets.map((p) => (
            <CarteProjet key={p.id} projet={p} passages={stats.get(p.id) ?? []} />
          ))}
        </div>
      </section>
      <p className="text-sm text-pierre-500">
        Les chantiers ponctuels (Trembloc, rénovations…) sont dans le module Travaux
        {peutLire('travaux') && (
          <>
            {' '}:{' '}
            <Link className="text-foret-700 underline" to="/travaux/chantiers">
              voir les chantiers
            </Link>
          </>
        )}
        .
      </p>
    </div>
  )
}

function CarteProjet({ projet: p, passages }: { projet: Projet; passages: Passage[] }) {
  const faites = passages.filter((x) => regle(x.etat)).length
  const retard = passages.filter((x) => x.etat === 'retard').length
  const pct = passages.length ? Math.round((100 * faites) / passages.length) : 0
  const aujourdhui = cleAujourdhui()
  const ceMois = passages.filter((x) => x.periode === aujourdhui && !regle(x.etat)).length
  return (
    <Link to={`/mastertimeline/projets/${p.id}`} className={`${ui.carte} block p-4 transition hover:border-foret-600`}>
      <div className="flex items-center gap-2">
        <Pastille couleur={p.couleur} />
        <span className="font-medium">{p.nom}</span>
        <span className="ml-auto text-sm tabular-nums text-pierre-500">
          {faites} / {passages.length}
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-pierre-100">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: p.couleur ?? 'var(--color-foret-600)' }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ceMois > 0 && <Puce>{ceMois} ce mois-ci</Puce>}
        {retard > 0 && <Puce ton="retard">{retard} en retard</Puce>}
      </div>
    </Link>
  )
}

function DetailProjet({ id }: { id: string }) {
  const refs = useReferences()
  const taches = useTaches()
  const projet = refs.projet.get(id)
  if (taches.error || refs.erreur) return <p className={ui.erreur}>{messageErreur(taches.error ?? refs.erreur)}</p>
  if (!taches.data || !refs.pret) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
  if (!projet || projet.archive) {
    return (
      <p className="py-8 text-center text-sm text-pierre-500">
        Ce projet n'existe plus.{' '}
        <Link className="text-foret-700 underline" to="/mastertimeline/projets">
          Retour aux projets
        </Link>
      </p>
    )
  }
  const siennes = taches.data.filter((t) => t.projet_id === id)
  return <ProjetAnnuel projet={projet} taches={siennes} refs={refs} />
}

function EnTeteProjet({ projet, sous, actions }: { projet: Projet; sous: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <Link to="/mastertimeline/projets" className="inline-flex items-center gap-1 text-sm text-pierre-500 hover:text-pierre-800">
          <IconeChevron className="size-3.5 rotate-180" /> Projets
        </Link>
        <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold">
          <Pastille couleur={projet.couleur} />
          {projet.nom}
        </h2>
        <p className="text-sm text-pierre-500">{sous}</p>
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  )
}

function ProjetAnnuel({ projet, taches, refs }: { projet: Projet; taches: Tache[]; refs: References }) {
  const ecriture = useEcriture()
  const ouvrir = useOuvrirFiche()
  const [exercice, setExercice] = useState(() => exerciceDeCle(cleAujourdhui()))
  const coches = useCoches(exercice)
  const parMois = useMemo(() => {
    const tous = taches.flatMap((t) => passagesTache(t, exercice, coches.index))
    return clesExercice(exercice)
      .map((cle) => ({ cle, passages: trierPassages(tous.filter((p) => p.periode === cle)) }))
      .filter((m) => m.passages.length)
  }, [taches, exercice, coches.index])
  const total = parMois.reduce((n, m) => n + m.passages.length, 0)
  const faites = parMois.reduce((n, m) => n + m.passages.filter((p) => regle(p.etat)).length, 0)

  return (
    <div className="space-y-4">
      <EnTeteProjet
        projet={projet}
        sous={`${taches.length} tâche${taches.length > 1 ? 's' : ''} · ${faites} sur ${total} passages réglés en ${libelleExercice(exercice)}`}
        actions={
          <>
            <div className="flex items-center gap-1">
              <button className={`${ui.boutonSecondaire} px-2`} aria-label="Exercice précédent" onClick={() => setExercice(exercice - 1)}>
                <IconeChevron className="size-4 rotate-180" />
              </button>
              <span className="px-2 text-sm font-medium">{libelleExercice(exercice)}</span>
              <button className={`${ui.boutonSecondaire} px-2`} aria-label="Exercice suivant" onClick={() => setExercice(exercice + 1)}>
                <IconeChevron className="size-4" />
              </button>
            </div>
            {ecriture && (
              <button className={ui.bouton} onClick={() => ouvrir({ tache: null, defauts: { projet_id: projet.id } })}>
                <IconePlus /> Nouvelle tâche
              </button>
            )}
          </>
        }
      />
      {!coches.pret ? (
        <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {parMois.map((m) => (
            <section key={m.cle} className={`${ui.carte} self-start`}>
              <div className="flex items-center gap-2 border-b border-pierre-100 px-3 py-2">
                <h3 className="text-sm font-semibold">{majuscule(libelleMois(m.cle))}</h3>
                <span className="ml-auto text-xs tabular-nums text-pierre-500">
                  {m.passages.filter((p) => regle(p.etat)).length} / {m.passages.length}
                </span>
              </div>
              <ul className="divide-y divide-pierre-100">
                {m.passages.map((p) => (
                  <LigneTache key={`${p.tache.id}|${p.periode}`} {...p} refs={refs} montrer={{ entreprise: true }} />
                ))}
              </ul>
            </section>
          ))}
          {parMois.length === 0 && <p className="text-sm text-pierre-500">Aucun passage cet exercice.</p>}
        </div>
      )}
    </div>
  )
}
