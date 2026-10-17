import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BoutonModifier, BoutonSupprimer } from '@/lib/BoutonsAction'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { IconeChevron, IconeCorbeille, IconePlus } from '@/lib/icones'
import { PuceCompagnie } from '@/lib/PuceCompagnie'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { etatEvenement, evenementsVoulus, REGLAGE_AGENDA_DEFAUT, type ReglageAgenda } from './agenda'
import { ChampDate, ChampMontant, ChoixCompagnies, FilNotes, LienOfficiel, PastilleStatut, PucesCompagnies, Section, ZoneTexte } from './commun'
import {
  ecrireAgendaPlusTard,
  reprendreEtapes,
  useCompagnies,
  useDeciderProposition,
  useEnregistrer,
  useEntreprises,
  useEtapes,
  useEvenementsAgenda,
  useFeedback,
  useHeures,
  useProfils,
  usePropositions,
  useReglages,
  useSubventions,
  useSuivis,
  useSupprimer,
} from './donnees'
import {
  aDecider,
  anneeFiscaleCourante,
  anneeFiscaleProposee,
  argent,
  aujourdhui,
  champ,
  CATEGORIES,
  dateCourte,
  estRetenue,
  heures as formatHeures,
  LIBELLES_CHAMPS,
  libelleAnneeFiscale,
  montantsPotentiels,
  moment,
  nomPersonne,
  periode,
  STATUTS,
  STATUTS_ETAPE,
  STATUTS_SUIVI,
  TYPES,
  valeurChamp,
} from './outils'
import type { Entreprise, Etape, Heures, Proposition, StatutEtape, StatutSuivi, Subvention, Suivi, TypeSubvention } from './types'
import { DialogueRejeter, DialogueValider } from './Validation'

export function Fiche() {
  const { id } = useParams()
  const subventions = useSubventions()
  const entreprises = useEntreprises()
  const suivis = useSuivis()
  const g = subventions.data?.find((x) => x.id === id)

  const erreur = subventions.error ?? entreprises.error ?? suivis.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!subventions.data || !entreprises.data || !suivis.data) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
  if (!g)
    return (
      <p className="py-8 text-center text-sm text-pierre-500">
        Cette subvention n’existe plus.{' '}
        <Link className="text-foret-700 underline" to="/subventions">
          Retour à la validation
        </Link>
      </p>
    )
  return <ContenuFiche key={g.id} g={g} toutes={subventions.data} suivisTous={suivis.data} entreprises={entreprises.data} />
}

function ContenuFiche({
  g,
  toutes,
  suivisTous,
  entreprises,
}: {
  g: Subvention
  toutes: Subvention[]
  suivisTous: Suivi[]
  entreprises: Entreprise[]
}) {
  const navigate = useNavigate()
  const enregistrer = useEnregistrer<Subvention>('grants')
  const supprimer = useSupprimer('grants')
  const maj = (champs: Partial<Subvention>) => enregistrer.mutate({ id: g.id, ...champs })
  const [dialogue, setDialogue] = useState<'valider' | 'rejeter' | null>(null)
  const [modifier, setModifier] = useState(false)
  const suivis = useMemo(() => suivisTous.filter((l) => l.grant_id === g.id), [suivisTous, g.id])
  useEcrireAgenda(g, suivis)

  const precedente = g.previous_grant_id ? toutes.find((x) => x.id === g.previous_grant_id) : null
  const suivantes = toutes.filter((x) => x.previous_grant_id === g.id)

  return (
    <div className="space-y-4">
      <button className="inline-flex items-center gap-1 text-sm text-pierre-600 hover:text-pierre-900" onClick={() => navigate(-1)}>
        <IconeChevron className="size-4 rotate-180" /> Retour
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-80">
          <ChampTexte
            className="w-full rounded-lg border border-transparent px-1 py-0.5 text-2xl font-semibold hover:border-pierre-200 focus:border-foret-600 focus:outline-none"
            aria-label="Nom du programme"
            obligatoire
            valeur={g.program_name}
            enregistrer={(program_name) => maj({ program_name })}
          />
          <div className="mt-1 flex flex-wrap items-center gap-2 px-1 text-sm text-pierre-500">
            <PastilleStatut statut={g.status} />
            <PucesCompagnies ids={g.company_ids} />
            <span>
              {g.origin === 'claude' ? 'Trouvée par Claude' : 'Ajoutée à la main'} le {dateCourte(g.discovered_at)} ·
            </span>
            <ChoixAnneeFiscale g={g} suivis={suivis} maj={maj} />
            <LienOfficiel url={g.source_url} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {aDecider(g) ? (
            <>
              <button className={ui.bouton} onClick={() => setDialogue('valider')}>
                Retenir…
              </button>
              <button className={ui.boutonSecondaire} onClick={() => setDialogue('rejeter')}>
                Rejeter…
              </button>
            </>
          ) : (
            !suivis.length && (
              <>
                <button className={ui.boutonSecondaire} onClick={() => maj({ status: 'nouveau' })}>
                  Remettre à valider
                </button>
                <button className={ui.bouton} onClick={() => setDialogue('valider')}>
                  Retenir…
                </button>
              </>
            )
          )}
          <BoutonSupprimer
            onClick={async () => {
              if (
                await confirmer({
                  titre: 'Supprimer cette subvention ?',
                  message:
                    'Ses notes, heures, décisions et lignes de suivi (montants, étapes de reddition de compte, attributions salariales) seront supprimées, et ses dates retirées de l’agenda. Pour l’écarter seulement, rejetez-la : Claude ne la reproposera pas.',
                })
              ) {
                supprimer.mutate(g.id, { onSuccess: () => navigate('/subventions', { replace: true }) })
              }
            }}
          />
        </div>
      </div>

      <Section
        titre="Programme"
        action={
          modifier ? (
            <button className={ui.boutonSecondaire} onClick={() => setModifier(false)}>
              Terminé
            </button>
          ) : (
            <BoutonModifier onClick={() => setModifier(true)} />
          )
        }
      >
        <Propositions g={g} />
        {modifier ? (
          <InfosProgramme g={g} suivis={suivis} entreprises={entreprises} maj={maj} />
        ) : (
          <ApercuProgramme g={g} />
        )}
        <EtatAgenda g={g} suivis={suivis} entreprises={entreprises} />
      </Section>

      <Section titre="Suivi par compagnie">
        <SuiviParCompagnie g={g} suivis={suivis} toutes={toutes} suivisTous={suivisTous} entreprises={entreprises} retenir={() => setDialogue('valider')} />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section titre="Notes internes">
          <FilNotes grantId={g.id} />
        </Section>
        <Section titre="Heures investies">
          <HeuresInvesties g={g} suivis={suivis} />
        </Section>
      </div>

      <Section titre="Décisions et récurrence">
        <Decisions g={g} />
        {(precedente || suivantes.length > 0) && (
          <ul className="mt-3 space-y-1 border-t border-pierre-100 pt-3 text-sm">
            {precedente && (
              <li>
                Édition précédente :{' '}
                <Link className="text-foret-700 underline" to={`/subventions/fiche/${precedente.id}`}>
                  {precedente.program_name}
                </Link>{' '}
                ({STATUTS[precedente.status].libelle.toLowerCase()}, {libelleAnneeFiscale(precedente.fiscal_year)})
              </li>
            )}
            {suivantes.map((x) => (
              <li key={x.id}>
                Édition suivante :{' '}
                <Link className="text-foret-700 underline" to={`/subventions/fiche/${x.id}`}>
                  {x.program_name}
                </Link>{' '}
                ({libelleAnneeFiscale(x.fiscal_year)})
              </li>
            ))}
          </ul>
        )}
      </Section>

      {dialogue === 'valider' && <DialogueValider g={g} entreprises={entreprises} fermer={() => setDialogue(null)} />}
      {dialogue === 'rejeter' && <DialogueRejeter g={g} fermer={() => setDialogue(null)} />}
    </div>
  )
}

function Champ({ etiquette, children, large }: { etiquette: string; children: React.ReactNode; large?: boolean }) {
  return (
    <label className={`block ${large ? 'sm:col-span-2 lg:col-span-4' : ''}`}>
      <span className={ui.etiquette}>{etiquette}</span>
      {children}
    </label>
  )
}

/** Aperçu en lecture seule ; « Modifier » ouvre les champs (InfosProgramme). */
function ApercuProgramme({ g }: { g: Subvention }) {
  const infos: [string, string | null | undefined][] = [
    ['Organisme', g.organisme],
    ['Type', TYPES[g.grant_type]],
    ['Montant potentiel', montantsPotentiels(g)],
    ['Ouverture de la demande', g.open_date && dateCourte(g.open_date)],
    ['Date limite', g.deadline_date && dateCourte(g.deadline_date)],
    ['Période financée', periode(g.funded_start, g.funded_end)],
  ]
  return (
    <div className="space-y-3">
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {infos.map(([etiquette, valeur]) => (
          <div key={etiquette}>
            <dt className="text-xs uppercase tracking-wide text-pierre-500">{etiquette}</dt>
            <dd>{valeur || <span className="text-pierre-400">—</span>}</dd>
          </div>
        ))}
      </dl>
      {g.description && <p className="whitespace-pre-line text-sm">{g.description}</p>}
      {g.eligibility_criteria && (
        <div className="text-sm">
          <p className="text-xs uppercase tracking-wide text-pierre-500">Critères d’admissibilité</p>
          <p className="mt-0.5 whitespace-pre-line">{g.eligibility_criteria}</p>
        </div>
      )}
      {g.relevance_justification && (
        <div className="rounded-lg bg-pierre-50 px-3 py-2 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-pierre-500">
            {g.origin === 'claude' ? 'Pourquoi Claude la propose' : 'Pertinence'}
          </p>
          <p className="mt-0.5 whitespace-pre-line">{g.relevance_justification}</p>
        </div>
      )}
      {g.update_checked_at && (
        <p className="text-xs text-pierre-500">Dernière mise à jour par Claude : {dateCourte(g.update_checked_at)}.</p>
      )}
    </div>
  )
}

function InfosProgramme({
  g,
  suivis,
  entreprises,
  maj,
}: {
  g: Subvention
  suivis: Suivi[]
  entreprises: Entreprise[]
  maj: (c: Partial<Subvention>) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="sm:col-span-2 lg:col-span-4">
        <span className={ui.etiquette}>Compagnies</span>
        <ChoixCompagnies
          ids={entreprises.map((e) => e.id)}
          choisies={g.company_ids}
          verrouillees={suivis.map((l) => l.company_id)}
          changer={(company_ids) => company_ids.length > 0 && maj({ company_ids })}
        />
      </div>
      <Champ etiquette="Organisme">
        <ChampTexte className={ui.champ} valeur={g.organisme ?? ''} enregistrer={(v) => maj({ organisme: v || null })} />
      </Champ>
      <Champ etiquette="Type">
        <select className={ui.champ} value={g.grant_type} onChange={(e) => maj({ grant_type: e.target.value as TypeSubvention })}>
          {Object.entries(TYPES).map(([id, libelle]) => (
            <option key={id} value={id}>
              {libelle}
            </option>
          ))}
        </select>
      </Champ>
      <Champ etiquette="Page officielle" large>
        <ChampTexte
          className={ui.champ}
          type="url"
          placeholder="https://"
          valeur={g.source_url ?? ''}
          enregistrer={(v) => maj({ source_url: v || null })}
        />
      </Champ>
      <Champ etiquette="Montant potentiel minimum">
        <ChampMontant className={ui.champ} valeur={g.potential_amount_min} enregistrer={(v) => maj({ potential_amount_min: v })} />
      </Champ>
      <Champ etiquette="Montant potentiel maximum">
        <ChampMontant className={ui.champ} valeur={g.potential_amount_max} enregistrer={(v) => maj({ potential_amount_max: v })} />
      </Champ>
      <Champ etiquette="Ouverture de la demande">
        <ChampDate valeur={g.open_date} enregistrer={(v) => maj({ open_date: v })} />
      </Champ>
      <Champ etiquette="Date limite">
        <ChampDate valeur={g.deadline_date} enregistrer={(v) => maj({ deadline_date: v })} />
      </Champ>
      <Champ etiquette="Période financée : début">
        <ChampDate valeur={g.funded_start} enregistrer={(v) => maj({ funded_start: v })} />
      </Champ>
      <Champ etiquette="Période financée : fin">
        <ChampDate valeur={g.funded_end} enregistrer={(v) => maj({ funded_end: v })} />
      </Champ>
      <Champ etiquette="Description" large>
        <ZoneTexte className={ui.champ} rows={4} valeur={g.description ?? ''} enregistrer={(v) => maj({ description: v || null })} />
      </Champ>
      <Champ etiquette="Critères d’admissibilité" large>
        <ZoneTexte
          className={ui.champ}
          rows={3}
          valeur={g.eligibility_criteria ?? ''}
          enregistrer={(v) => maj({ eligibility_criteria: v || null })}
        />
      </Champ>
      <Champ etiquette={g.origin === 'claude' ? 'Pourquoi Claude la propose' : 'Pertinence'} large>
        <ZoneTexte
          className={ui.champ}
          rows={3}
          valeur={g.relevance_justification ?? ''}
          enregistrer={(v) => maj({ relevance_justification: v || null })}
        />
      </Champ>
      <Champ etiquette="Clé du programme (récurrence d'une année à l'autre)" large>
        <ChampTexte className={ui.champ} valeur={g.program_key ?? ''} enregistrer={(v) => maj({ program_key: v || null })} />
      </Champ>
    </div>
  )
}

/**
 * Année fiscale de la subvention : proposée (période financée, sinon date
 * limite…), ou choisie à la main.
 */
function ChoixAnneeFiscale({ g, suivis, maj }: { g: Subvention; suivis: Suivi[]; maj: (c: Partial<Subvention>) => void }) {
  const proposee = anneeFiscaleProposee(g, suivis)
  const courante = anneeFiscaleCourante()
  const debut = Math.min(courante - 3, g.fiscal_year, proposee.annee)
  const fin = Math.max(courante + 2, g.fiscal_year, proposee.annee)
  const annees = Array.from({ length: fin - debut + 1 }, (_, i) => fin - i)
  return (
    <label className="inline-flex items-center gap-1.5" title={`Proposée d’après ${proposee.selon} ; modifiable.`}>
      année fiscale
      <select
        aria-label="Année fiscale"
        className="fleche-serree rounded-md border border-pierre-200 bg-white py-0.5 pl-1.5 text-sm text-pierre-800"
        value={g.fiscal_year_manual ? String(g.fiscal_year) : 'auto'}
        onChange={(e) =>
          maj(e.target.value === 'auto' ? { fiscal_year_manual: false } : { fiscal_year: Number(e.target.value), fiscal_year_manual: true })
        }
      >
        <option value="auto">{libelleAnneeFiscale(proposee.annee)} (proposée)</option>
        {annees.map((a) => (
          <option key={a} value={a}>
            {libelleAnneeFiscale(a)}
          </option>
        ))}
      </select>
      {g.fiscal_year_manual && <span className="text-xs">(choisie à la main)</span>}
    </label>
  )
}

/** Réglage de l'agenda Google « Subventions » (Réglages). */
function useReglageAgenda(): ReglageAgenda {
  const v = useReglages().data?.find((r) => r.key === 'agenda')?.value
  return { ...REGLAGE_AGENDA_DEFAUT, ...(v && typeof v === 'object' ? (v as Partial<ReglageAgenda>) : {}) }
}

/**
 * Écrit tout de suite dans l'agenda ce qui change sur la fiche (statut,
 * dates, étapes), 1,5 s après le dernier changement ; le cron (15 min)
 * rattrape une panne.
 */
function useEcrireAgenda(g: Subvention, suivis: Suivi[]) {
  const client = useQueryClient()
  const { actif } = useReglageAgenda()
  const etapes = useEtapes().data
  const signature = JSON.stringify([
    g.status,
    g.program_name,
    g.open_date,
    g.deadline_date,
    g.source_url,
    g.potential_amount_min,
    g.potential_amount_max,
    suivis.map((l) => [l.id, l.company_id, l.status, l.amount_granted]),
    (etapes ?? []).filter((e) => e.grant_id === g.id).map((e) => [e.id, e.application_id, e.description, e.due_date, e.status]),
  ])
  useEffect(() => {
    if (!actif) return
    const t = setTimeout(() => ecrireAgendaPlusTard(client, g.id), 1500)
    return () => clearTimeout(t)
  }, [signature, actif, client, g.id])
}

/** Les dates de la subvention dans l'agenda Google « Subventions ». */
function EtatAgenda({ g, suivis, entreprises }: { g: Subvention; suivis: Suivi[]; entreprises: Entreprise[] }) {
  const config = useReglageAgenda()
  const lignes = (useEvenementsAgenda().data ?? []).filter((l) => l.grant_id === g.id)
  const etapes = useEtapes().data ?? []
  if (!config.actif || !estRetenue(g)) return null
  const voulus = evenementsVoulus([g], suivis, etapes, {
    entreprise: (id) => entreprises.find((e) => e.id === id)?.name,
    lien: () => '',
    depuis: config.depuis,
  })
  const NOMS = { ouverture: 'Ouverture', fermeture: 'Date limite', reddition: 'Reddition' }
  const erreur = lignes.find((l) => l.error)?.error
  return (
    <div className="mt-3 border-t border-pierre-100 pt-3 text-sm text-pierre-600">
      <span className="font-medium text-pierre-700">Agenda « Subventions »{config.calendrier.startsWith('essai') ? ' (simulé en DEV)' : ''} :</span>{' '}
      {voulus.length === 0 ? (
        'aucune date à écrire (ni ouverture ni date limite connues).'
      ) : (
        <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
          {voulus.map((v) => {
            const etat = etatEvenement(v, lignes, config.calendrier)
            return (
              <span key={v.cle} className={etat === 'erreur' ? 'text-red-700' : undefined}>
                {NOMS[v.genre]} {dateCourte(v.date)}{' '}
                {etat === 'ecrit' ? <span className="text-foret-700">✓</span> : etat === 'erreur' ? '✗' : <span className="text-pierre-400">(à écrire)</span>}
              </span>
            )
          })}
        </span>
      )}
      {erreur && <p className="mt-1 text-xs text-red-700">{erreur}</p>}
    </div>
  )
}

/**
 * Mises à jour proposées par Claude (mise à jour ciblée) : un champ déjà
 * rempli n'est jamais changé sans accord. Les champs vides qu'il a remplis
 * sont rappelés dessous.
 */
function Propositions({ g }: { g: Subvention }) {
  const toutes = (usePropositions().data ?? []).filter((p) => p.grant_id === g.id)
  const decider = useDeciderProposition()
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState<string | null>(null)
  const ouvertes = toutes.filter((p) => p.status === 'a_valider')
  const remplies = toutes.filter((p) => p.status === 'appliquee').sort((a, b) => b.created_at.localeCompare(a.created_at))
  if (!ouvertes.length && !remplies.length) return null

  const choisir = async (p: Proposition, accepter: boolean) => {
    setErreur(null)
    setEnCours(p.id)
    try {
      await decider.mutateAsync({ id: p.id, accepter })
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setEnCours(null)
    }
  }
  const long = (p: Proposition) => p.field === 'eligibility_criteria' || p.field === 'source_url'

  return (
    <div className="mb-4 space-y-2">
      {ouvertes.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">
            {ouvertes.length === 1 ? 'Claude propose un changement' : `Claude propose ${ouvertes.length} changements`} (à valider)
          </p>
          <ul className="mt-2 divide-y divide-amber-200">
            {ouvertes.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-pierre-800">{LIBELLES_CHAMPS[p.field]}</p>
                  {long(p) ? (
                    <div className="mt-0.5 space-y-1">
                      <p className="whitespace-pre-line text-pierre-500 line-through">{valeurChamp(p.field, p.current_value)}</p>
                      <p className="whitespace-pre-line break-words">{valeurChamp(p.field, p.proposed_value)}</p>
                    </div>
                  ) : (
                    <p className="mt-0.5">
                      <span className="text-pierre-500 line-through">{valeurChamp(p.field, p.current_value)}</span> →{' '}
                      <b className="font-semibold">{valeurChamp(p.field, p.proposed_value)}</b>
                    </p>
                  )}
                  {(p.comment || p.source_url) && (
                    <p className="mt-0.5 text-xs text-pierre-600">
                      {p.comment}
                      {p.source_url && (
                        <>
                          {' '}
                          <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="underline">
                            source ↗
                          </a>
                        </>
                      )}{' '}
                      · {moment(p.created_at)}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button className={ui.bouton} disabled={enCours === p.id} onClick={() => choisir(p, true)}>
                    Accepter
                  </button>
                  <button className={ui.boutonSecondaire} disabled={enCours === p.id} onClick={() => choisir(p, false)}>
                    Refuser
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {erreur && <p className={`${ui.erreur} mt-2`}>{erreur}</p>}
        </div>
      )}
      {remplies.length > 0 && (
        <p className="text-xs text-pierre-500">
          Complété par Claude (champs qui étaient vides) :{' '}
          {remplies
            .slice(0, 8)
            .map((p) => `${LIBELLES_CHAMPS[p.field].toLowerCase()} (${dateCourte(p.created_at)})`)
            .join(', ')}
          .
        </p>
      )}
    </div>
  )
}

/**
 * Une ligne de suivi par compagnie qui dépose (créées en retenant la carte) :
 * statut, demandé / accordé / reçu, et sa reddition de compte. Le statut de
 * la carte en est tiré par la base.
 */
function SuiviParCompagnie({
  g,
  suivis,
  toutes,
  suivisTous,
  entreprises,
  retenir,
}: {
  g: Subvention
  suivis: Suivi[]
  toutes: Subvention[]
  suivisTous: Suivi[]
  entreprises: Entreprise[]
  retenir: () => void
}) {
  const { de } = useCompagnies()
  const enregistrer = useEnregistrer<Suivi>('grant_applications')
  const [ajout, setAjout] = useState('')
  const lignes = [...suivis].sort((a, b) => de(a.company_id).ordre - de(b.company_id).ordre)
  const libres = entreprises.filter((e) => !suivis.some((l) => l.company_id === e.id))

  if (!suivis.length)
    return (
      <p className="text-sm text-pierre-500">
        {aDecider(g) ? 'Pas encore retenue' : g.status === 'rejete' ? 'Rejetée' : 'Expirée'} : «{' '}
        <button className="text-foret-700 underline" onClick={retenir}>
          Retenir…
        </button>{' '}
        » pour cocher les compagnies qui déposent une demande ; chacune a ici son suivi (demandé, accordé, reçu) et sa reddition de
        compte.
      </p>
    )

  const ajouter = async () => {
    if (!ajout) return
    try {
      await enregistrer.mutateAsync({ grant_id: g.id, company_id: ajout })
      setAjout('')
    } catch {
      /* erreur dans le bandeau du module */
    }
  }

  return (
    <div className="space-y-3">
      {lignes.map((l) => (
        <LigneSuivi key={l.id} l={l} g={g} derniere={suivis.length === 1} toutes={toutes} suivisTous={suivisTous} />
      ))}
      {libres.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Compagnie à ajouter" className={`${champ} w-auto`} value={ajout} onChange={(e) => setAjout(e.target.value)}>
            <option value="">Ajouter une compagnie qui dépose…</option>
            {libres.map((e) => (
              <option key={e.id} value={e.id}>
                {de(e.id).nom}
              </option>
            ))}
          </select>
          <button className={ui.boutonSecondaire} disabled={!ajout || enregistrer.isPending} onClick={ajouter}>
            <IconePlus /> Ajouter
          </button>
        </div>
      )}
    </div>
  )
}

const CLASSES_SUIVI: Record<StatutSuivi, string> = {
  en_cours: 'border-violet-300 bg-violet-50 text-violet-800',
  obtenu: 'border-foret-600 bg-foret-50 text-foret-800',
  refuse: 'border-red-300 bg-red-50 text-red-800',
}

function LigneSuivi({
  l,
  g,
  derniere,
  toutes,
  suivisTous,
}: {
  l: Suivi
  g: Subvention
  derniere: boolean
  toutes: Subvention[]
  suivisTous: Suivi[]
}) {
  const { de } = useCompagnies()
  const enregistrer = useEnregistrer<Suivi>('grant_applications')
  const supprimer = useSupprimer('grant_applications')
  const etapes = (useEtapes().data ?? []).filter((e) => e.application_id === l.id)
  const [reddition, setReddition] = useState(l.status === 'obtenu' || etapes.length > 0)
  const majLigne = (champs: Partial<Suivi>) => enregistrer.mutate({ id: l.id, ...champs })
  const compagnie = de(l.company_id)
  const faites = etapes.filter((e) => e.status === 'complete').length

  const montants: { titre: string; montant: 'amount_requested' | 'amount_granted' | 'amount_received'; date: 'requested_at' | 'granted_at' | 'received_at'; libelleDate: string }[] = [
    { titre: 'Demandé', montant: 'amount_requested', date: 'requested_at', libelleDate: 'Date du dépôt' },
    { titre: 'Accordé', montant: 'amount_granted', date: 'granted_at', libelleDate: "Date de l'octroi" },
    { titre: 'Reçu', montant: 'amount_received', date: 'received_at', libelleDate: 'Date de réception' },
  ]

  return (
    <div className="rounded-lg border border-pierre-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <PuceCompagnie compagnie={compagnie} className="text-sm" />
        <select
          aria-label={`Statut de la demande de ${compagnie.nom}`}
          className={`fleche-serree rounded-lg border px-2 py-1 text-xs font-medium ${CLASSES_SUIVI[l.status]}`}
          value={l.status}
          onChange={(e) => {
            const status = e.target.value as StatutSuivi
            // Obtenue sans date d'octroi : aujourd'hui (rattache la subvention à l'année fiscale).
            majLigne(status === 'obtenu' && !l.granted_at ? { status, granted_at: aujourdhui() } : { status })
          }}
        >
          {STATUTS_SUIVI.map((s) => (
            <option key={s} value={s}>
              {STATUTS[s].libelle}
            </option>
          ))}
        </select>
        <button
          className="ml-auto text-pierre-400 hover:text-red-700"
          aria-label={`Retirer ${compagnie.nom} du suivi`}
          title={`Retirer ${compagnie.nom} du suivi`}
          onClick={async () => {
            if (
              await confirmer({
                titre: `Retirer ${compagnie.nom} du suivi ?`,
                message: `Ses montants, ses étapes de reddition de compte et ses attributions salariales pour cette subvention seront supprimés.${
                  derniere ? ' C’était la seule compagnie : la subvention retourne à valider.' : ''
                }`,
                libelleOk: 'Retirer',
                danger: true,
              })
            )
              supprimer.mutate(l.id)
          }}
        >
          <IconeCorbeille />
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {montants.map((m) => (
          <div key={m.titre} className="space-y-1.5">
            <p className="text-sm font-medium">{m.titre}</p>
            <ChampMontant
              className={ui.champ}
              aria-label={`Montant ${m.titre.toLowerCase()} (${compagnie.nom})`}
              placeholder="0 $"
              valeur={l[m.montant]}
              enregistrer={(v) => majLigne({ [m.montant]: v })}
            />
            <ChampDate aria-label={`${m.libelleDate} (${compagnie.nom})`} valeur={l[m.date]} enregistrer={(v) => majLigne({ [m.date]: v })} />
            <p className="text-xs text-pierre-500">{m.libelleDate}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-pierre-100 pt-2">
        <button
          className="inline-flex items-center gap-1 text-sm font-medium text-pierre-700 hover:text-pierre-900"
          aria-expanded={reddition}
          onClick={() => setReddition((o) => !o)}
        >
          <IconeChevron className={`size-4 transition-transform ${reddition ? 'rotate-90' : ''}`} />
          Reddition de compte
          {etapes.length > 0 && (
            <span className="font-normal text-pierre-500">
              ({faites} sur {etapes.length} complétée{faites > 1 ? 's' : ''})
            </span>
          )}
        </button>
        {reddition && (
          <div className="mt-2">
            <Reddition l={l} g={g} etapes={etapes} toutes={toutes} suivisTous={suivisTous} />
          </div>
        )}
      </div>
    </div>
  )
}

function HeuresInvesties({ g, suivis }: { g: Subvention; suivis: Suivi[] }) {
  const { session } = useAuth()
  const moi = session?.user.id ?? null
  const profils = useProfils().data
  const toutes = useHeures().data
  const enregistrer = useEnregistrer<Heures>('grant_time_entries')
  const supprimer = useSupprimer('grant_time_entries')
  const [nombre, setNombre] = useState('')
  const [date, setDate] = useState(aujourdhui)
  const [note, setNote] = useState('')

  const lignes = useMemo(() => (toutes ?? []).filter((h) => h.grant_id === g.id), [toutes, g.id])
  const total = lignes.reduce((s, h) => s + Number(h.hours), 0)
  const parPersonne = useMemo(() => {
    const m = new Map<string, number>()
    lignes.forEach((h) => m.set(h.user_id, (m.get(h.user_id) ?? 0) + Number(h.hours)))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [lignes])
  const miennes = lignes.filter((h) => h.user_id === moi).sort((a, b) => b.entry_date.localeCompare(a.entry_date))

  const ajouter = async () => {
    const hours = Number(nombre.replace(',', '.'))
    if (!(hours > 0)) return
    try {
      await enregistrer.mutateAsync({ grant_id: g.id, hours, entry_date: date, note: note.trim() || null })
      setNombre('')
      setNote('')
    } catch {
      /* erreur dans le bandeau du module */
    }
  }

  // Toutes les compagnies de la carte : les heures sont notées pour la subvention.
  const somme = (f: (l: Suivi) => number | null) =>
    suivis.some((l) => f(l) != null) ? suivis.reduce((t, l) => t + Number(f(l) ?? 0), 0) : null
  const recu = somme((l) => l.amount_received)
  const accorde = somme((l) => l.amount_granted)
  const retour =
    total > 0 && recu != null
      ? `${argent(recu / total)} reçus par heure investie`
      : total > 0 && accorde != null
        ? `${argent(accorde / total)} accordés par heure (rien de reçu pour l’instant)`
        : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-2xl font-semibold">{formatHeures(total)}</p>
        {retour && <p className="text-sm font-medium text-foret-700">{retour}</p>}
      </div>
      {parPersonne.length > 0 && (
        <ul className="divide-y divide-pierre-100 text-sm">
          {parPersonne.map(([id, n]) => (
            <li key={id} className="flex justify-between py-1">
              <span>{nomPersonne(profils, id)}</span>
              <span className="tabular-nums">{formatHeures(n)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg bg-pierre-50 p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-pierre-500">Mes heures</p>
        <div className="flex flex-wrap items-end gap-2">
          <input
            className={`${champ} w-24`}
            aria-label="Heures"
            inputMode="decimal"
            placeholder="Heures"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ajouter()}
          />
          <input type="date" className={`${champ} w-auto`} aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input
            className={`${champ} min-w-32 flex-1`}
            aria-label="Note"
            placeholder="Note (facultatif)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ajouter()}
          />
          <button className={ui.boutonSecondaire} disabled={!(Number(nombre.replace(',', '.')) > 0) || enregistrer.isPending} onClick={ajouter}>
            <IconePlus /> Ajouter
          </button>
        </div>
        {miennes.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {miennes.map((h) => (
              <li key={h.id} className="flex items-center gap-2">
                <span className="w-24 text-pierre-500">{dateCourte(h.entry_date)}</span>
                <span className="w-14 tabular-nums">{formatHeures(Number(h.hours))}</span>
                <span className="min-w-0 flex-1 truncate text-pierre-600">{h.note}</span>
                <button
                  className="text-pierre-400 hover:text-red-700"
                  aria-label="Supprimer ces heures"
                  onClick={() => supprimer.mutate(h.id)}
                >
                  <IconeCorbeille />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Reddition({
  l,
  g,
  etapes: nonTriees,
  toutes,
  suivisTous,
}: {
  l: Suivi
  g: Subvention
  etapes: Etape[]
  toutes: Subvention[]
  suivisTous: Suivi[]
}) {
  const { session } = useAuth()
  const { de } = useCompagnies()
  const etapesToutes = useEtapes().data
  const enregistrer = useEnregistrer<Etape>('grant_reporting_steps')
  const supprimer = useSupprimer('grant_reporting_steps')
  const [description, setDescription] = useState('')
  const [echeance, setEcheance] = useState('')
  const [source, setSource] = useState('')
  const [copie, setCopie] = useState<{ etat: 'en_cours' | 'fait' | 'erreur'; message?: string } | null>(null)

  const etapes = useMemo(
    () => [...nonTriees].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [nonTriees],
  )
  // Lignes de suivi dont on peut reprendre les étapes : la même subvention
  // pour une autre compagnie, puis le même programme, puis les autres.
  const sources = useMemo(() => {
    const avecEtapes = new Set((etapesToutes ?? []).map((e) => e.application_id))
    const carte = new Map(toutes.map((x) => [x.id, x]))
    const rang = (x: Subvention) =>
      x.id === g.id ? 0 : x.id === g.previous_grant_id || (!!g.program_key && x.program_key === g.program_key) ? 1 : 2
    return suivisTous
      .filter((x) => x.id !== l.id && avecEtapes.has(x.id) && carte.has(x.grant_id))
      .map((x) => ({ l: x, g: carte.get(x.grant_id)! }))
      .sort((a, b) => rang(a.g) - rang(b.g) || b.g.fiscal_year - a.g.fiscal_year)
      .map((x) => ({ ...x, suggeree: rang(x.g) < 2 }))
  }, [etapesToutes, toutes, suivisTous, g, l.id])

  const ajouter = async () => {
    if (!description.trim()) return
    try {
      await enregistrer.mutateAsync({
        application_id: l.id,
        description: description.trim(),
        due_date: echeance || null,
        sort_order: (etapes.at(-1)?.sort_order ?? -1) + 1,
      })
      setDescription('')
      setEcheance('')
    } catch {
      /* erreur dans le bandeau du module */
    }
  }

  const changerStatut = (e: Etape, status: StatutEtape) =>
    enregistrer.mutate({
      id: e.id,
      status,
      completed_at: status === 'complete' ? new Date().toISOString() : null,
      completed_by: status === 'complete' ? (session?.user.id ?? null) : null,
    })

  const deplacer = (i: number, sens: -1 | 1) => {
    const a = etapes[i]
    const b = etapes[i + sens]
    if (!a || !b) return
    // Ordres égaux (étapes ajoutées ensemble) : on renumérote d'abord.
    const ordreA = a.sort_order === b.sort_order ? i : a.sort_order
    const ordreB = a.sort_order === b.sort_order ? i + sens : b.sort_order
    enregistrer.mutate({ id: a.id, sort_order: ordreB })
    enregistrer.mutate({ id: b.id, sort_order: ordreA })
  }

  const reprendre = async () => {
    if (!source) return
    setCopie({ etat: 'en_cours' })
    try {
      const n = await reprendreEtapes(source, l.id)
      setCopie({ etat: 'fait', message: `${n} étape${n > 1 ? 's' : ''} reprise${n > 1 ? 's' : ''}.` })
      setSource('')
    } catch (e) {
      setCopie({ etat: 'erreur', message: messageErreur(e) })
    }
  }

  return (
    <div className="space-y-3">
      {etapes.length === 0 ? (
        <p className="text-sm text-pierre-500">
          Aucune étape. Ajoutez ce que l’organisme demande (talons de paie, rapport final, déclaration…), ou reprenez les étapes
          d’une autre compagnie ou d’une année précédente.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-pierre-100">
            {etapes.map((e, i) => {
              const retard = e.status !== 'complete' && e.due_date && e.due_date < aujourdhui()
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
                  <select
                    aria-label="Statut de l'étape"
                    className={`fleche-serree rounded-lg border px-2 py-1 text-xs font-medium ${
                      e.status === 'complete'
                        ? 'border-foret-600 bg-foret-50 text-foret-800'
                        : e.status === 'en_cours'
                          ? 'border-violet-300 bg-violet-50 text-violet-800'
                          : 'border-pierre-300 bg-white text-pierre-700'
                    }`}
                    value={e.status}
                    onChange={(ev) => changerStatut(e, ev.target.value as StatutEtape)}
                  >
                    {Object.entries(STATUTS_ETAPE).map(([id, libelle]) => (
                      <option key={id} value={id}>
                        {libelle}
                      </option>
                    ))}
                  </select>
                  <ChampTexte
                    className={`min-w-48 flex-1 rounded-lg border border-transparent px-2 py-1 text-sm hover:border-pierre-200 focus:border-foret-600 focus:outline-none ${
                      e.status === 'complete' ? 'text-pierre-500 line-through' : ''
                    }`}
                    aria-label="Description de l'étape"
                    obligatoire
                    valeur={e.description}
                    enregistrer={(description) => enregistrer.mutate({ id: e.id, description })}
                  />
                  <ChampDate
                    aria-label="Échéance"
                    className={`rounded-lg border px-2 py-1 text-sm ${retard ? 'border-red-300 text-red-700' : 'border-pierre-300'}`}
                    valeur={e.due_date}
                    enregistrer={(due_date) => enregistrer.mutate({ id: e.id, due_date })}
                  />
                  <div className="flex items-center">
                    <button className="px-1 text-pierre-400 hover:text-pierre-800 disabled:opacity-30" aria-label="Monter" disabled={i === 0} onClick={() => deplacer(i, -1)}>
                      <IconeChevron className="size-4 -rotate-90" />
                    </button>
                    <button
                      className="px-1 text-pierre-400 hover:text-pierre-800 disabled:opacity-30"
                      aria-label="Descendre"
                      disabled={i === etapes.length - 1}
                      onClick={() => deplacer(i, 1)}
                    >
                      <IconeChevron className="size-4 rotate-90" />
                    </button>
                    <button
                      className="px-1 text-pierre-400 hover:text-red-700"
                      aria-label="Supprimer l'étape"
                      onClick={async () => {
                        if (await confirmer({ titre: 'Supprimer cette étape ?' })) supprimer.mutate(e.id)
                      }}
                    >
                      <IconeCorbeille />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <input
          className={`${champ} min-w-56 flex-1`}
          aria-label="Nouvelle étape"
          placeholder="Nouvelle étape (ex. soumettre les talons de paie du trimestre)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ajouter()}
        />
        <input type="date" aria-label="Échéance" className={`${champ} w-auto`} value={echeance} onChange={(e) => setEcheance(e.target.value)} />
        <button className={ui.boutonSecondaire} disabled={!description.trim() || enregistrer.isPending} onClick={ajouter}>
          <IconePlus /> Ajouter
        </button>
      </div>

      {sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-pierre-100 pt-3">
          <span className="text-sm text-pierre-600">Reprendre les étapes de</span>
          <select aria-label="Étapes à reprendre" className={`${champ} w-auto max-w-full`} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Choisir…</option>
            {sources.map(({ l: x, g: carte, suggeree }) => (
              <option key={x.id} value={x.id}>
                {suggeree ? '★ ' : ''}
                {carte.program_name} — {de(x.company_id).nom} — {libelleAnneeFiscale(carte.fiscal_year)}
              </option>
            ))}
          </select>
          <button className={ui.boutonSecondaire} disabled={!source || copie?.etat === 'en_cours'} onClick={reprendre}>
            Reprendre
          </button>
          {copie?.message && <span className={`text-sm ${copie.etat === 'erreur' ? 'text-red-700' : 'text-foret-700'}`}>{copie.message}</span>}
          {sources.some((s) => s.suggeree) && (
            <p className="w-full text-xs text-pierre-500">★ même programme (autre compagnie, édition précédente ou même clé de programme).</p>
          )}
        </div>
      )}
    </div>
  )
}

function Decisions({ g }: { g: Subvention }) {
  const feedback = (useFeedback().data ?? []).filter((f) => f.grant_id === g.id).sort((a, b) => b.decided_at.localeCompare(a.decided_at))
  const profils = useProfils().data
  if (feedback.length === 0) return <p className="text-sm text-pierre-500">Aucune décision enregistrée.</p>
  return (
    <ul className="space-y-2 text-sm">
      {feedback.map((f) => (
        <li key={f.id}>
          <span className={f.decision === 'valide' ? 'font-medium text-foret-700' : 'font-medium text-red-700'}>
            {f.decision === 'valide' ? 'Validée' : `Rejetée : ${CATEGORIES[f.reject_category ?? 'autre']}`}
          </span>{' '}
          <span className="text-pierre-500">
            par {nomPersonne(profils, f.decided_by)}, {moment(f.decided_at)}
          </span>
          {f.comment && <p className="text-pierre-700">« {f.comment} »</p>}
        </li>
      ))}
    </ul>
  )
}
