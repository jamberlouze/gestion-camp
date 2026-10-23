import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { IconePlus } from '@/lib/icones'
import { useSortieCarte } from '@/lib/sortieCarte'
import { ui } from '@/lib/ui'
import { ChoixCompagnies, FilNotes, LienOfficiel, menu, NotesLues, Pastille, PastilleStatut, PastilleType, PucesCompagnies } from './commun'
import { useDecider, useEnregistrer, useEntreprises, useFeedback, useNotes, useProfils, useSubventions } from './donnees'
import {
  aDecider,
  CATEGORIES,
  cleProgramme,
  correspond,
  dateCourte,
  joursAvant,
  moment,
  montantsPotentiels,
  nomPersonne,
  prochainTrimestre,
  trierAValider,
  TYPES,
} from './outils'
import type { CategorieRejet, Entreprise, Feedback, Note, Statut, Subvention, TypeSubvention } from './types'

/** Lance l'action d'une fenêtre ; sur une carte de la liste qui va la quitter, la carte sort d'abord. */
type Sortie = (action: () => Promise<unknown>) => Promise<unknown>
const sansSortie: Sortie = (action) => action()

type FiltreStatut = 'tous' | 'nouveau' | 'a_valider' | 'rejete'

/**
 * Vue de validation : les subventions nouvelles ou en attente, une carte par
 * programme avec ses compagnies ; on la retient (en cochant les compagnies
 * qui déposent) ou on la rejette une seule fois. Le filtre « Rejetées » les
 * montre de nouveau, pour revenir sur un rejet.
 */
export function Validation() {
  const subventions = useSubventions()
  const entreprises = useEntreprises()
  const notes = useNotes()
  const feedback = useFeedback()
  const [entreprise, setEntreprise] = useState('')
  const [type, setType] = useState('')
  const [statut, setStatut] = useState<FiltreStatut>('tous')
  const [recherche, setRecherche] = useState('')
  const [nouvelle, setNouvelle] = useState(false)

  const filtrees = useMemo(
    () =>
      (subventions.data ?? [])
        .filter((g) => !entreprise || g.company_ids.includes(entreprise))
        .filter((g) => !type || g.grant_type === type)
        .filter((g) => correspond(g, recherche)),
    [subventions.data, entreprise, type, recherche],
  )
  // Dernier rejet de chaque carte : raison montrée sur une rejetée, et tri (la plus récente d'abord).
  const rejets = useMemo(() => {
    const m = new Map<string, Feedback>()
    for (const f of feedback.data ?? []) {
      if (f.decision === 'rejete' && f.decided_at >= (m.get(f.grant_id)?.decided_at ?? '')) m.set(f.grant_id, f)
    }
    return m
  }, [feedback.data])
  const rejetees = statut === 'rejete'
  const affichee = (s: Statut) => (statut === 'tous' ? aDecider({ status: s }) : s === statut)
  const rejeteeLe = (g: Subvention) => rejets.get(g.id)?.decided_at ?? g.updated_at
  const liste = filtrees
    .filter((g) => (statut === 'tous' ? aDecider(g) : g.status === statut))
    .sort(rejetees ? (a, b) => rejeteeLe(b).localeCompare(rejeteeLe(a)) : trierAValider)
  // En cherchant, on montre aussi les subventions déjà décidées : « Claude l'a-t-il déjà trouvée ? »
  const dejaDecidees = recherche.trim()
    ? filtrees
        .filter((g) => !aDecider(g) && !(rejetees && g.status === 'rejete'))
        .sort((a, b) => b.discovered_at.localeCompare(a.discovered_at))
    : []
  const s = (n: number) => (n > 1 ? 's' : '')
  const quoi = rejetees ? 'rejetée' : 'à valider'
  const nombre = (n: number) => `${n} subvention${s(n)} ${rejetees ? `rejetée${s(n)}` : 'à valider'}`

  const erreur = subventions.error ?? entreprises.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!subventions.data || !entreprises.data) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const notesDe = (id: string) => (notes.data ?? []).filter((n) => n.grant_id === id)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            className={`${menu} w-56`}
            placeholder="Chercher un programme…"
            aria-label="Chercher un programme"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
          <select aria-label="Entreprise" className={menu} value={entreprise} onChange={(e) => setEntreprise(e.target.value)}>
            <option value="">Toutes les entreprises</option>
            {entreprises.data.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <select aria-label="Type" className={menu} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Tous les types</option>
            {Object.entries(TYPES).map(([id, libelle]) => (
              <option key={id} value={id}>
                {libelle}
              </option>
            ))}
          </select>
          <select aria-label="Statut" className={menu} value={statut} onChange={(e) => setStatut(e.target.value as FiltreStatut)}>
            <option value="tous">Nouvelles et en attente</option>
            <option value="nouveau">Nouvelles seulement</option>
            <option value="a_valider">En attente seulement</option>
            <option value="rejete">Rejetées</option>
          </select>
        </div>
        <button className={ui.bouton} onClick={() => setNouvelle(true)}>
          <IconePlus /> Ajouter une subvention
        </button>
      </div>

      <p className="text-sm text-pierre-500">
        {recherche.trim()
          ? liste.length === 0
            ? `Aucune subvention ${quoi} ne correspond à « ${recherche.trim()} ».`
            : `${nombre(liste.length)} correspond${liste.length > 1 ? 'ent' : ''} à « ${recherche.trim()} ».`
          : rejetees
          ? liste.length === 0
            ? 'Aucune subvention rejetée.'
            : `${nombre(liste.length)}, la plus récente d’abord. « Remettre à valider » la renvoie dans les nouvelles.`
          : liste.length === 0
          ? `Rien à valider. La prochaine recherche automatique a lieu le ${dateCourte(prochainTrimestre().date)} ; vous pouvez aussi en lancer une dans l’onglet Recherches.`
          : `${liste.length} subvention${s(liste.length)} à regarder — salariales d’abord, puis date limite la plus proche.`}
      </p>

      <div className="space-y-3">
        {liste.map((g) => (
          <CarteValidation
            key={g.id}
            g={g}
            entreprises={entreprises.data}
            notes={notesDe(g.id)}
            rejet={rejets.get(g.id)}
            affichee={affichee}
          />
        ))}
      </div>

      {recherche.trim() && (
        <section className="space-y-2 border-t border-pierre-200 pt-4">
          <h3 className="text-sm font-semibold text-pierre-700">
            Déjà décidées{dejaDecidees.length ? ` (${dejaDecidees.length})` : ''}
          </h3>
          {dejaDecidees.length === 0 ? (
            <p className="text-sm text-pierre-500">
              Aucune subvention retenue{rejetees ? '' : ', rejetée'} ou terminée ne correspond.
            </p>
          ) : (
            <ul className={`${ui.carte} divide-y divide-pierre-100`}>
              {dejaDecidees.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <Link to={`/subventions/fiche/${g.id}`} className="font-medium hover:underline">
                    {g.program_name}
                  </Link>
                  {g.organisme && <span className="text-pierre-500">{g.organisme}</span>}
                  <span className="ml-auto flex flex-wrap items-center gap-1.5">
                    <PucesCompagnies ids={g.company_ids} court />
                    <PastilleStatut statut={g.status} />
                    <span className="text-xs text-pierre-500">
                      {g.origin === 'claude' ? 'Trouvée par Claude' : 'Ajoutée à la main'} le {dateCourte(g.discovered_at)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {nouvelle && <DialogueNouvelle entreprises={entreprises.data} fermer={() => setNouvelle(false)} />}
    </div>
  )
}

function CarteValidation({
  g,
  entreprises,
  notes,
  rejet,
  affichee,
}: {
  g: Subvention
  entreprises: Entreprise[]
  notes: Note[]
  rejet?: Feedback
  /** Le filtre montre-t-il encore une carte à ce statut ? */
  affichee: (statut: Statut) => boolean
}) {
  const enregistrer = useEnregistrer<Subvention>('grants')
  const profils = useProfils().data
  const [notesOuvertes, setNotesOuvertes] = useState(false)
  const [dialogue, setDialogue] = useState<'valider' | 'attente' | 'rejeter' | null>(null)
  const { ref, sortir } = useSortieCarte<HTMLElement>()
  // La carte ne sort que si son nouveau statut quitte le filtre (« en attente » reste dans « Nouvelles et en attente »).
  const sortieVers = (statut: Statut): Sortie => (affichee(statut) ? sansSortie : sortir)
  const montant = montantsPotentiels(g)
  const jours = g.deadline_date ? joursAvant(g.deadline_date) : null

  return (
    <article ref={ref} className={`${ui.carte} p-4`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <PastilleType type={g.grant_type} />
        <PucesCompagnies ids={g.company_ids} />
        {(g.status === 'a_valider' || g.status === 'rejete') && <PastilleStatut statut={g.status} />}
        {g.previous_grant_id && <Pastille classe="bg-sky-50 text-sky-800">Programme récurrent</Pastille>}
        <span className="ml-auto text-xs text-pierre-500">
          {g.origin === 'claude' ? 'Trouvée par Claude' : 'Ajoutée à la main'} le {dateCourte(g.discovered_at)}
        </span>
      </div>

      <h3 className="mt-2 text-lg font-semibold leading-snug">
        <Link to={`/subventions/fiche/${g.id}`} className="hover:underline">
          {g.program_name}
        </Link>
      </h3>
      {g.organisme && <p className="text-sm text-pierre-500">{g.organisme}</p>}

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-pierre-500">Montant potentiel</dt>
          <dd>{montant ?? 'Inconnu'}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-pierre-500">Ouverture</dt>
          <dd>{g.open_date ? dateCourte(g.open_date) : 'Inconnue'}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-pierre-500">Date limite</dt>
          <dd className={jours != null && jours <= 14 ? 'font-medium text-red-700' : undefined}>
            {g.deadline_date ? dateCourte(g.deadline_date) : 'Inconnue'}
            {jours != null && jours >= 0 && jours <= 60 && ` (dans ${jours} jour${jours > 1 ? 's' : ''})`}
            {jours != null && jours < 0 && ' (passée)'}
          </dd>
        </div>
      </dl>

      {g.description && <p className="mt-3 text-sm">{g.description}</p>}
      {g.relevance_justification && (
        <div className="mt-3 rounded-lg bg-pierre-50 px-3 py-2 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-pierre-500">
            {g.origin === 'claude' ? 'Pourquoi Claude la propose' : 'Pertinence'}
          </p>
          <p className="mt-0.5 whitespace-pre-line">{g.relevance_justification}</p>
        </div>
      )}
      {g.status === 'rejete' && rejet && (
        <div className="mt-3 rounded-lg bg-pierre-100 px-3 py-2 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-pierre-500">
            Rejetée par {nomPersonne(profils, rejet.decided_by)}, {moment(rejet.decided_at)}
          </p>
          <p className="mt-0.5">
            {CATEGORIES[rejet.reject_category ?? 'autre']}
            {rejet.comment && ` — « ${rejet.comment} »`}
          </p>
        </div>
      )}
      {g.status === 'a_valider' && notes.length > 0 && !notesOuvertes && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-800">En attente — notes</p>
          <NotesLues notes={notes} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className={ui.bouton} onClick={() => setDialogue('valider')}>
          Retenir…
        </button>
        {g.status === 'nouveau' ? (
          <button
            className={ui.boutonSecondaire}
            title="Regardée, mais il manque une information pour décider : notez ce qu’il faut vérifier"
            onClick={() => setDialogue('attente')}
          >
            Mettre en attente…
          </button>
        ) : (
          <button className={ui.boutonSecondaire} onClick={() => sortieVers('nouveau')(async () => enregistrer.mutate({ id: g.id, status: 'nouveau' }))}>
            {g.status === 'rejete' ? 'Remettre à valider' : 'Remettre en nouvelle'}
          </button>
        )}
        {g.status !== 'rejete' && (
          <button className={ui.boutonSecondaire} onClick={() => setDialogue('rejeter')}>
            Rejeter…
          </button>
        )}
        <span className="mx-1 hidden h-5 w-px bg-pierre-200 sm:block" />
        <LienOfficiel url={g.source_url} />
        <button className="text-sm text-pierre-600 underline hover:text-pierre-900" onClick={() => setNotesOuvertes((o) => !o)}>
          Notes{notes.length ? ` (${notes.length})` : ''}
        </button>
        <Link to={`/subventions/fiche/${g.id}`} className="text-sm text-pierre-600 underline hover:text-pierre-900">
          Fiche complète
        </Link>
      </div>

      {notesOuvertes && (
        <div className="mt-3 border-t border-pierre-100 pt-3">
          <FilNotes grantId={g.id} />
        </div>
      )}

      {dialogue === 'valider' && (
        <DialogueValider g={g} entreprises={entreprises} fermer={() => setDialogue(null)} sortir={sortieVers('a_faire')} />
      )}
      {dialogue === 'attente' && <DialogueAttente g={g} fermer={() => setDialogue(null)} sortir={sortieVers('a_valider')} />}
      {dialogue === 'rejeter' && <DialogueRejeter g={g} fermer={() => setDialogue(null)} sortir={sortieVers('rejete')} />}
    </article>
  )
}

export function DialogueValider({
  g,
  entreprises,
  fermer,
  sortir = sansSortie,
}: {
  g: Subvention
  entreprises: Entreprise[]
  fermer: () => void
  sortir?: Sortie
}) {
  const decider = useDecider()
  // Compagnies de la carte d'abord ; une seule : déjà cochée.
  const ids = [
    ...entreprises.filter((e) => g.company_ids.includes(e.id)),
    ...entreprises.filter((e) => !g.company_ids.includes(e.id)),
  ].map((e) => e.id)
  const [compagnies, setCompagnies] = useState<string[]>(g.company_ids.length === 1 ? g.company_ids : [])
  const [commentaire, setCommentaire] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  const valider = async () => {
    setErreur(null)
    try {
      await sortir(() => decider.mutateAsync({ grant: g.id, decision: 'valide', compagnies, commentaire }))
      fermer()
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  return (
    <Dialogue titre="Retenir cette subvention" fermer={fermer}>
      <p className="mb-4 text-sm text-pierre-600">
        « {g.program_name} » passe <b>à faire</b>, avec une ligne de suivi par compagnie cochée (demandé, accordé, reçu, reddition de
        compte). Ses dates d’ouverture et de fermeture vont dans l’agenda « Subventions », et cette décision aide Claude à mieux cibler
        les prochaines recherches.
      </p>
      <p className={ui.etiquette}>Compagnies qui déposent une demande</p>
      <ChoixCompagnies ids={ids} choisies={compagnies} changer={setCompagnies} />
      {g.company_ids.length > 1 && g.company_ids.length < ids.length && (
        <p className="mt-1.5 text-xs text-pierre-500">Les premières sont celles pour qui la subvention a été trouvée.</p>
      )}
      <label className={`${ui.etiquette} mt-3`} htmlFor="commentaire-valider">
        Commentaire (facultatif)
      </label>
      <textarea
        id="commentaire-valider"
        className={ui.champ}
        rows={2}
        placeholder="Ex. exactement le genre de programme à chercher"
        value={commentaire}
        onChange={(e) => setCommentaire(e.target.value)}
      />
      {erreur && <p className={`${ui.erreur} mt-3`}>{erreur}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className={ui.boutonSecondaire} onClick={fermer}>
          Annuler
        </button>
        <button className={ui.bouton} disabled={!compagnies.length || decider.isPending} onClick={valider}>
          Retenir{compagnies.length > 1 ? ` pour ${compagnies.length} compagnies` : ''}
        </button>
      </div>
    </Dialogue>
  )
}

/**
 * Mettre en attente avec une note : ce qu'il faut vérifier pour décider plus
 * tard. La note va dans les notes internes de la subvention et y reste après
 * la décision.
 */
export function DialogueAttente({ g, fermer, sortir = sansSortie }: { g: Subvention; fermer: () => void; sortir?: Sortie }) {
  const statut = useEnregistrer<Subvention>('grants', { erreurSurPlace: true })
  const ajouterNote = useEnregistrer<Note>('grant_notes', { erreurSurPlace: true })
  const notes = (useNotes().data ?? []).filter((n) => n.grant_id === g.id)
  const [texte, setTexte] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  // La note d'abord : la carte peut quitter la liste filtrée dès que le statut
  // change. Une note enregistrée vide le champ (un nouvel essai ne la double pas).
  const mettreEnAttente = async () => {
    setErreur(null)
    try {
      await sortir(async () => {
        const body = texte.trim()
        if (body) {
          await ajouterNote.mutateAsync({ grant_id: g.id, body })
          setTexte('')
        }
        await statut.mutateAsync({ id: g.id, status: 'a_valider' })
      })
      fermer()
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  return (
    <Dialogue titre="Mettre en attente" fermer={fermer}>
      <p className="mb-3 text-sm text-pierre-600">
        « {g.program_name} » reste dans À valider, marquée <b>en attente</b>. Notez ce qu’il faut vérifier pour décider plus tard : la
        note reste dans les notes internes de la fiche, même une fois la subvention retenue ou rejetée.
      </p>
      {notes.length > 0 && (
        <div className="mb-3 rounded-lg bg-pierre-50 px-3 py-2">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-pierre-500">Notes déjà prises</p>
          <NotesLues notes={notes} />
        </div>
      )}
      <label className={ui.etiquette} htmlFor="note-attente">
        Ce qu’il faut vérifier (facultatif)
      </label>
      <textarea
        id="note-attente"
        className={ui.champ}
        rows={3}
        autoFocus
        placeholder="Ex. voir si les OBNL sont admissibles ; l’appel de projets rouvre en janvier"
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) mettreEnAttente()
        }}
      />
      {erreur && <p className={`${ui.erreur} mt-3`}>{erreur}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className={ui.boutonSecondaire} onClick={fermer}>
          Annuler
        </button>
        <button className={ui.bouton} disabled={statut.isPending || ajouterNote.isPending} onClick={mettreEnAttente}>
          Mettre en attente
        </button>
      </div>
    </Dialogue>
  )
}

export function DialogueRejeter({ g, fermer, sortir = sansSortie }: { g: Subvention; fermer: () => void; sortir?: Sortie }) {
  const decider = useDecider()
  const [categorie, setCategorie] = useState<CategorieRejet | ''>('')
  const [commentaire, setCommentaire] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  const rejeter = async () => {
    if (!categorie) return
    setErreur(null)
    try {
      await sortir(() => decider.mutateAsync({ grant: g.id, decision: 'rejete', categorie, commentaire }))
      fermer()
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  return (
    <Dialogue titre="Rejeter la subvention" fermer={fermer}>
      <p className="mb-3 text-sm text-pierre-600">
        « {g.program_name} » ne sera plus proposée{g.company_ids.length > 1 ? ', pour aucune compagnie' : ''}. La raison sert à affiner
        les prochaines recherches.
      </p>
      <fieldset>
        <legend className={ui.etiquette}>Raison (obligatoire)</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {Object.entries(CATEGORIES).map(([id, libelle]) => (
            <label key={id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-pierre-50">
              <input
                type="radio"
                name="categorie"
                className="accent-foret-700"
                checked={categorie === id}
                onChange={() => setCategorie(id as CategorieRejet)}
              />
              {libelle}
            </label>
          ))}
        </div>
      </fieldset>
      <label className={`${ui.etiquette} mt-3`} htmlFor="commentaire-rejet">
        Commentaire (facultatif)
      </label>
      <textarea
        id="commentaire-rejet"
        className={ui.champ}
        rows={2}
        placeholder="Ex. réservé aux entreprises manufacturières"
        value={commentaire}
        onChange={(e) => setCommentaire(e.target.value)}
      />
      {erreur && <p className={`${ui.erreur} mt-3`}>{erreur}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className={ui.boutonSecondaire} onClick={fermer}>
          Annuler
        </button>
        <button className={ui.boutonRouge} disabled={!categorie || decider.isPending} onClick={rejeter}>
          Rejeter
        </button>
      </div>
    </Dialogue>
  )
}

/** Saisie à la main (avant l'automatisation, ou un programme vu ailleurs). */
function DialogueNouvelle({ entreprises, fermer }: { entreprises: Entreprise[]; fermer: () => void }) {
  const enregistrer = useEnregistrer<Subvention>('grants', { erreurSurPlace: true })
  const navigate = useNavigate()
  const [nom, setNom] = useState('')
  const [compagnies, setCompagnies] = useState<string[]>([])
  const [organisme, setOrganisme] = useState('')
  const [type, setType] = useState<TypeSubvention>('salarial')
  const [url, setUrl] = useState('')
  const [limite, setLimite] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  const creer = async () => {
    setErreur(null)
    try {
      const g = await enregistrer.mutateAsync({
        program_name: nom.trim(),
        company_ids: compagnies,
        organisme: organisme.trim() || null,
        grant_type: type,
        source_url: url.trim() || null,
        deadline_date: limite || null,
        program_key: cleProgramme(nom),
        origin: 'manuel',
      })
      fermer()
      navigate(`/subventions/fiche/${g.id}`)
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  return (
    <Dialogue titre="Ajouter une subvention" fermer={fermer}>
      <div className="space-y-3">
        <div>
          <label className={ui.etiquette} htmlFor="nv-nom">
            Programme
          </label>
          <input id="nv-nom" className={ui.champ} autoFocus value={nom} onChange={(e) => setNom(e.target.value)} />
        </div>
        <div>
          <p className={ui.etiquette}>Pour</p>
          <ChoixCompagnies ids={entreprises.map((e) => e.id)} choisies={compagnies} changer={setCompagnies} />
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="nv-type">
            Type
          </label>
          <select id="nv-type" className={ui.champ} value={type} onChange={(e) => setType(e.target.value as TypeSubvention)}>
            {Object.entries(TYPES).map(([id, libelle]) => (
              <option key={id} value={id}>
                {libelle}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="nv-organisme">
            Organisme
          </label>
          <input id="nv-organisme" className={ui.champ} value={organisme} onChange={(e) => setOrganisme(e.target.value)} />
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="nv-url">
            Page officielle
          </label>
          <input id="nv-url" type="url" className={ui.champ} placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="nv-limite">
            Date limite
          </label>
          <input id="nv-limite" type="date" className={ui.champ} value={limite} onChange={(e) => setLimite(e.target.value)} />
        </div>
        <p className="text-xs text-pierre-500">
          Les montants et la description se remplissent ensuite dans la fiche ; « Retenir… » crée le suivi des compagnies qui déposent.
        </p>
      </div>
      {erreur && <p className={`${ui.erreur} mt-3`}>{erreur}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className={ui.boutonSecondaire} onClick={fermer}>
          Annuler
        </button>
        <button className={ui.bouton} disabled={!nom.trim() || !compagnies.length || enregistrer.isPending} onClick={creer}>
          Ajouter
        </button>
      </div>
    </Dialogue>
  )
}
