import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { IconePlus } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { FilNotes, LienOfficiel, menu, Pastille, PastilleStatut, PastilleType } from './commun'
import { useDecider, useEnregistrer, useEntreprises, useNotes, useSubventions } from './donnees'
import { CATEGORIES, cleProgramme, dateCourte, joursAvant, montantsPotentiels, trierAValider, TYPES } from './outils'
import type { CategorieRejet, Entreprise, Subvention, TypeSubvention } from './types'

type FiltreStatut = 'tous' | 'nouveau' | 'a_valider'

/** Vue de validation : les subventions nouvelles ou en attente. */
export function Validation() {
  const subventions = useSubventions()
  const entreprises = useEntreprises()
  const notes = useNotes()
  const [entreprise, setEntreprise] = useState('')
  const [type, setType] = useState('')
  const [statut, setStatut] = useState<FiltreStatut>('tous')
  const [nouvelle, setNouvelle] = useState(false)

  const liste = useMemo(
    () =>
      (subventions.data ?? [])
        .filter((g) => (statut === 'tous' ? g.status === 'nouveau' || g.status === 'a_valider' : g.status === statut))
        .filter((g) => !entreprise || g.target_company_id === entreprise)
        .filter((g) => !type || g.grant_type === type)
        .sort(trierAValider),
    [subventions.data, statut, entreprise, type],
  )

  const erreur = subventions.error ?? entreprises.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!subventions.data || !entreprises.data) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const nomEntreprise = new Map(entreprises.data.map((e) => [e.id, e.name]))
  const nbNotes = (id: string) => (notes.data ?? []).filter((n) => n.grant_id === id).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
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
          </select>
        </div>
        <button className={ui.bouton} onClick={() => setNouvelle(true)}>
          <IconePlus /> Ajouter une subvention
        </button>
      </div>

      <p className="text-sm text-pierre-500">
        {liste.length === 0
          ? 'Rien à valider. La prochaine recherche a lieu lundi matin ; vous pouvez aussi en lancer une dans l’onglet Recherches.'
          : `${liste.length} subvention${liste.length > 1 ? 's' : ''} à regarder — salariales d’abord, puis date limite la plus proche.`}
      </p>

      <div className="space-y-3">
        {liste.map((g) => (
          <CarteValidation key={g.id} g={g} entreprises={entreprises.data} nomEntreprise={nomEntreprise} nbNotes={nbNotes(g.id)} />
        ))}
      </div>

      {nouvelle && <DialogueNouvelle entreprises={entreprises.data} fermer={() => setNouvelle(false)} />}
    </div>
  )
}

function CarteValidation({
  g,
  entreprises,
  nomEntreprise,
  nbNotes,
}: {
  g: Subvention
  entreprises: Entreprise[]
  nomEntreprise: Map<string, string>
  nbNotes: number
}) {
  const enregistrer = useEnregistrer<Subvention>('grants')
  const [notesOuvertes, setNotesOuvertes] = useState(false)
  const [dialogue, setDialogue] = useState<'valider' | 'rejeter' | null>(null)
  const montant = montantsPotentiels(g)
  const jours = g.deadline_date ? joursAvant(g.deadline_date) : null

  return (
    <article className={`${ui.carte} p-4`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <PastilleType type={g.grant_type} />
        <Pastille>{nomEntreprise.get(g.target_company_id) ?? '—'}</Pastille>
        {g.status === 'a_valider' && <PastilleStatut statut="a_valider" />}
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
          <p className="mt-0.5">{g.relevance_justification}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className={ui.bouton} onClick={() => setDialogue('valider')}>
          On y va
        </button>
        {g.status === 'nouveau' ? (
          <button
            className={ui.boutonSecondaire}
            title="Regardée, mais en attente d'une information (posez la question en note)"
            onClick={() => enregistrer.mutate({ id: g.id, status: 'a_valider' })}
          >
            Mettre en attente
          </button>
        ) : (
          <button className={ui.boutonSecondaire} onClick={() => enregistrer.mutate({ id: g.id, status: 'nouveau' })}>
            Remettre en nouvelle
          </button>
        )}
        <button className={ui.boutonSecondaire} onClick={() => setDialogue('rejeter')}>
          Rejeter…
        </button>
        <span className="mx-1 hidden h-5 w-px bg-pierre-200 sm:block" />
        <LienOfficiel url={g.source_url} />
        <button className="text-sm text-pierre-600 underline hover:text-pierre-900" onClick={() => setNotesOuvertes((o) => !o)}>
          Notes{nbNotes ? ` (${nbNotes})` : ''}
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

      {dialogue === 'valider' && <DialogueValider g={g} entreprises={entreprises} fermer={() => setDialogue(null)} />}
      {dialogue === 'rejeter' && <DialogueRejeter g={g} fermer={() => setDialogue(null)} />}
    </article>
  )
}

export function DialogueValider({ g, entreprises, fermer }: { g: Subvention; entreprises: Entreprise[]; fermer: () => void }) {
  const decider = useDecider()
  const [demandeur, setDemandeur] = useState(g.applicant_company_id ?? g.target_company_id)
  const [commentaire, setCommentaire] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  const valider = async () => {
    setErreur(null)
    try {
      await decider.mutateAsync({ grant: g.id, decision: 'valide', demandeur, commentaire })
      fermer()
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  return (
    <Dialogue titre="On y va" fermer={fermer}>
      <p className="mb-4 text-sm text-pierre-600">
        « {g.program_name} » passe <b>en cours</b> : la demande est à préparer. Cette décision aide aussi Claude à mieux cibler
        les prochaines recherches.
      </p>
      <label className={ui.etiquette} htmlFor="demandeur">
        Entreprise qui dépose la demande
      </label>
      <select id="demandeur" className={ui.champ} value={demandeur} onChange={(e) => setDemandeur(e.target.value)}>
        {entreprises.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
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
        <button className={ui.bouton} disabled={decider.isPending} onClick={valider}>
          Valider
        </button>
      </div>
    </Dialogue>
  )
}

export function DialogueRejeter({ g, fermer }: { g: Subvention; fermer: () => void }) {
  const decider = useDecider()
  const [categorie, setCategorie] = useState<CategorieRejet | ''>('')
  const [commentaire, setCommentaire] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  const rejeter = async () => {
    if (!categorie) return
    setErreur(null)
    try {
      await decider.mutateAsync({ grant: g.id, decision: 'rejete', categorie, commentaire })
      fermer()
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  return (
    <Dialogue titre="Rejeter la subvention" fermer={fermer}>
      <p className="mb-3 text-sm text-pierre-600">
        « {g.program_name} » ne sera plus proposée. La raison sert à affiner les prochaines recherches.
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
  const [entreprise, setEntreprise] = useState(entreprises[0]?.id ?? '')
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
        target_company_id: entreprise,
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
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={ui.etiquette} htmlFor="nv-entreprise">
              Pour
            </label>
            <select id="nv-entreprise" className={ui.champ} value={entreprise} onChange={(e) => setEntreprise(e.target.value)}>
              {entreprises.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
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
        <p className="text-xs text-pierre-500">Les montants, la description et le suivi se remplissent ensuite dans la fiche.</p>
      </div>
      {erreur && <p className={`${ui.erreur} mt-3`}>{erreur}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className={ui.boutonSecondaire} onClick={fermer}>
          Annuler
        </button>
        <button className={ui.bouton} disabled={!nom.trim() || !entreprise || enregistrer.isPending} onClick={creer}>
          Ajouter
        </button>
      </div>
    </Dialogue>
  )
}
