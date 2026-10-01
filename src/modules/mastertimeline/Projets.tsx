import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur, useEnregistrer } from '@/lib/donnees'
import { IconeChevron, IconePlus } from '@/lib/icones'
import { ui } from '@/lib/ui'
import {
  cleAujourdhui,
  cleCoche,
  clesExercice,
  dateCourte,
  estAnnuelle,
  etatPassage,
  exerciceDeCle,
  jourAujourdhui,
  libelleExercice,
  libelleMois,
  majuscule,
  passages,
  ponctuelleEnRetard,
  UNIQUE,
  type Etat,
  type IndexCoches,
} from './calendrier'
import { LigneTache, Pastille, Puce } from './commun'
import { supprimerProjet, useCoches, useEntreprises, useReferences, useTaches, type References } from './donnees'
import { trierPassages, useEcriture, useOuvrirFiche, type Passage } from './outils'
import type { Projet, Tache } from './types'

const COULEURS = ['#567E96', '#5E7C3F', '#B0607A', '#E38B45', '#8A7B62', '#7A6AA8', '#19774a', '#c0812b']

const regle = (e: Etat) => e === 'faite' || e === 'sautee'

/** Passages d'une tâche de projet pendant l'exercice (une ponctuelle n'en a qu'un). */
function passagesTache(t: Tache, exercice: number, index: IndexCoches): Passage[] {
  const aujourdhui = cleAujourdhui()
  if (estAnnuelle(t)) {
    return passages(t, exercice).map((cle) => {
      const coche = index.get(cleCoche(t.id, cle))
      return { tache: t, periode: cle, etat: etatPassage(coche, cle, aujourdhui), coche }
    })
  }
  const coche = index.get(cleCoche(t.id, UNIQUE))
  const etat: Etat = coche?.statut ?? (ponctuelleEnRetard(t, coche, jourAujourdhui()) ? 'retard' : 'a_faire')
  return [{ tache: t, periode: UNIQUE, etat, coche }]
}

export function Projets() {
  const { id } = useParams()
  return id ? <DetailProjet id={id} /> : <ListeProjets />
}

function ListeProjets() {
  const ecriture = useEcriture()
  const refs = useReferences()
  const taches = useTaches()
  const exercice = exerciceDeCle(cleAujourdhui())
  const coches = useCoches(exercice)
  const [nouveau, setNouveau] = useState(false)
  const [voirTermines, setVoirTermines] = useState(false)

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

  const annuels = refs.projets.filter((p) => !p.ponctuel)
  const ponctuels = refs.projets.filter((p) => p.ponctuel && !p.termine_le)
  const termines = refs.projets.filter((p) => p.ponctuel && p.termine_le)

  return (
    <div className="space-y-6">
      <section>
        <h2 className="font-semibold">Projets de l'année</h2>
        <p className="text-sm text-pierre-500">Avancement de l'exercice {libelleExercice(exercice)}.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {annuels.map((p) => (
            <CarteProjet key={p.id} projet={p} passages={stats.get(p.id) ?? []} />
          ))}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Projets ponctuels</h2>
            <p className="text-sm text-pierre-500">Des chantiers qui se terminent (Trembloc, rénovations…).</p>
          </div>
          {ecriture && (
            <button className={ui.bouton} onClick={() => setNouveau(true)}>
              <IconePlus /> Nouveau projet
            </button>
          )}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ponctuels.map((p) => (
            <CarteProjet key={p.id} projet={p} passages={stats.get(p.id) ?? []} />
          ))}
          {ponctuels.length === 0 && <p className="text-sm text-pierre-500">Aucun projet en cours.</p>}
        </div>
        {termines.length > 0 && (
          <div className="mt-4">
            <button className="text-sm text-pierre-600 underline" onClick={() => setVoirTermines(!voirTermines)}>
              {voirTermines ? 'Cacher' : 'Voir'} les projets terminés ({termines.length})
            </button>
            {voirTermines && (
              <div className="mt-3 grid gap-3 opacity-75 sm:grid-cols-2 lg:grid-cols-3">
                {termines.map((p) => (
                  <CarteProjet key={p.id} projet={p} passages={stats.get(p.id) ?? []} />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {nouveau && <FicheProjet projet={null} fermer={() => setNouveau(false)} />}
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
        {p.termine_le && <Puce>Terminé le {dateCourte(p.termine_le.slice(0, 10))}</Puce>}
        {p.ponctuel && !p.termine_le && p.date_cible && <Puce ton={p.date_cible < jourAujourdhui() ? 'retard' : undefined}>Cible {dateCourte(p.date_cible)}</Puce>}
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
  return projet.ponctuel ? <ProjetPonctuel projet={projet} taches={siennes} refs={refs} /> : <ProjetAnnuel projet={projet} taches={siennes} refs={refs} />
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
    const tous = taches.filter(estAnnuelle).flatMap((t) => passagesTache(t, exercice, coches.index))
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

function ProjetPonctuel({ projet, taches, refs }: { projet: Projet; taches: Tache[]; refs: References }) {
  const ecriture = useEcriture()
  const ouvrir = useOuvrirFiche()
  const navigate = useNavigate()
  const enregistrer = useEnregistrer<Projet>('mastertimeline', 'projets')
  const coches = useCoches(exerciceDeCle(cleAujourdhui()))
  const [modifier, setModifier] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const liste = taches.flatMap((t) => passagesTache(t, exerciceDeCle(cleAujourdhui()), coches.index))
  const tri = (a: Passage, b: Passage) =>
    (a.tache.priorite ?? 9) - (b.tache.priorite ?? 9) ||
    (a.tache.echeance ?? '9999').localeCompare(b.tache.echeance ?? '9999') ||
    (a.tache.position ?? Infinity) - (b.tache.position ?? Infinity) ||
    a.tache.titre.localeCompare(b.tache.titre, 'fr')
  const aFaire = liste.filter((p) => !regle(p.etat)).sort(tri)
  const faites = liste.filter((p) => regle(p.etat)).sort(tri)
  const heures = aFaire.reduce((n, p) => n + (p.tache.heures_prevues ?? 0), 0)
  const prochainePosition = Math.max(0, ...taches.map((t) => t.position ?? 0)) + 1

  async function action(f: () => Promise<unknown>) {
    setErreur(null)
    try {
      await f()
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  const sous = [
    `${faites.length} sur ${liste.length} tâches faites`,
    projet.date_cible ? `cible ${dateCourte(projet.date_cible)}` : 'sans date cible',
    heures ? `${heures} h prévues à faire` : null,
    projet.termine_le ? `terminé le ${dateCourte(projet.termine_le.slice(0, 10))}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="space-y-4">
      <EnTeteProjet
        projet={projet}
        sous={sous}
        actions={
          ecriture && (
            <>
              <button className={ui.boutonSecondaire} onClick={() => setModifier(true)}>
                Modifier
              </button>
              <button
                className={ui.boutonSecondaire}
                onClick={() => action(() => enregistrer.mutateAsync({ id: projet.id, termine_le: projet.termine_le ? null : new Date().toISOString() }))}
              >
                {projet.termine_le ? 'Rouvrir le projet' : 'Terminer le projet'}
              </button>
              <button
                className={ui.boutonDanger}
                onClick={() => {
                  if (!confirm(`Supprimer « ${projet.nom} » et ses ${taches.length} tâches ?`)) return
                  action(async () => {
                    await supprimerProjet(projet.id)
                    navigate('/mastertimeline/projets')
                  })
                }}
              >
                Supprimer
              </button>
              <button className={ui.bouton} onClick={() => ouvrir({ tache: null, defauts: { projet_id: projet.id, mois: null, position: prochainePosition } })}>
                <IconePlus /> Ajouter une tâche
              </button>
            </>
          )
        }
      />
      {erreur && <p className={ui.erreur}>{erreur}</p>}
      {!coches.pret ? (
        <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
      ) : (
        <>
          <section className={ui.carte}>
            {aFaire.length ? (
              <ul className="divide-y divide-pierre-100">
                {aFaire.map((p) => (
                  <LigneTache key={p.tache.id} {...p} refs={refs} montrer={{ mois: true }} />
                ))}
              </ul>
            ) : (
              <p className="px-3 py-6 text-center text-sm text-pierre-500">
                {liste.length ? 'Tout est fait !' : 'Aucune tâche dans ce projet.'}
              </p>
            )}
          </section>
          {faites.length > 0 && (
            <section className={ui.carte}>
              <h3 className="border-b border-pierre-100 px-3 py-2 text-sm font-semibold text-pierre-600">Faites ({faites.length})</h3>
              <ul className="divide-y divide-pierre-100">
                {faites.map((p) => (
                  <LigneTache key={p.tache.id} {...p} refs={refs} montrer={{ mois: true }} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {modifier && <FicheProjet projet={projet} fermer={() => setModifier(false)} />}
    </div>
  )
}

/** Créer ou modifier un projet ponctuel. */
function FicheProjet({ projet, fermer }: { projet: Projet | null; fermer: () => void }) {
  const enregistrer = useEnregistrer<Projet>('mastertimeline', 'projets')
  const navigate = useNavigate()
  const [nom, setNom] = useState(projet?.nom ?? '')
  const [couleur, setCouleur] = useState(projet?.couleur ?? COULEURS[0])
  const [cible, setCible] = useState(projet?.date_cible ?? '')
  const [entreprisesChoisies, setEntreprises] = useState<string[]>(projet?.entreprise_ids ?? [])
  const entreprises = useEntreprises()
  const [erreur, setErreur] = useState<string | null>(null)

  async function sauver(e: FormEvent) {
    e.preventDefault()
    if (!nom.trim()) return setErreur('Donne un nom au projet.')
    try {
      await enregistrer.mutateAsync({ id: projet?.id, nom: nom.trim(), couleur, date_cible: cible || null, ponctuel: true, entreprise_ids: entreprisesChoisies })
      fermer()
      if (!projet) navigate('/mastertimeline/projets')
    } catch (err) {
      setErreur(messageErreur(err))
    }
  }

  return (
    <Dialogue titre={projet ? 'Modifier le projet' : 'Nouveau projet ponctuel'} fermer={fermer}>
      <form onSubmit={sauver} className="space-y-4">
        <label className="block">
          <span className={ui.etiquette}>Nom</span>
          <input className={ui.champ} value={nom} onChange={(e) => setNom(e.target.value)} autoFocus placeholder="Ex. Trembloc" />
        </label>
        <div>
          <span className={ui.etiquette}>Couleur</span>
          <div className="flex flex-wrap gap-2">
            {COULEURS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Couleur ${c}`}
                aria-pressed={couleur === c}
                className={`h-8 w-8 rounded-full border-2 ${couleur === c ? 'border-pierre-900' : 'border-white'}`}
                style={{ background: c }}
                onClick={() => setCouleur(c)}
              />
            ))}
          </div>
        </div>
        <div>
          <span className={ui.etiquette}>Entreprises (aucune = toutes)</span>
          <div className="flex flex-wrap gap-1.5">
            {(entreprises.data ?? []).map((e) => {
              const choisie = entreprisesChoisies.includes(e.id)
              return (
                <button
                  key={e.id}
                  type="button"
                  aria-pressed={choisie}
                  className={`rounded-full border px-3 py-1 text-sm ${choisie ? 'border-foret-700 bg-foret-700 text-white' : 'border-pierre-300 bg-white text-pierre-700'}`}
                  onClick={() => setEntreprises(choisie ? entreprisesChoisies.filter((x) => x !== e.id) : [...entreprisesChoisies, e.id])}
                >
                  {e.nom}
                </button>
              )
            })}
          </div>
        </div>
        <label className="block">
          <span className={ui.etiquette}>Date cible (optionnelle)</span>
          <input type="date" className={ui.champ} value={cible} onChange={(e) => setCible(e.target.value)} />
        </label>
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex gap-2">
          <button type="submit" className={ui.bouton} disabled={enregistrer.isPending}>
            {projet ? 'Enregistrer' : 'Créer le projet'}
          </button>
          <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
        </div>
      </form>
    </Dialogue>
  )
}
