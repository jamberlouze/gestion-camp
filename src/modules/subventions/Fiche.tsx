import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BoutonModifier, BoutonSupprimer } from '@/lib/BoutonsAction'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { IconeChevron, IconeCorbeille, IconePlus } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { etatEvenement, evenementsVoulus, REGLAGE_AGENDA_DEFAUT, type ReglageAgenda } from './agenda'
import { ChampDate, ChampMontant, FilNotes, LienOfficiel, PastilleStatut, Section, ZoneTexte } from './commun'
import {
  copierEtapes,
  ecrireAgendaPlusTard,
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
  useSupprimer,
} from './donnees'
import {
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
  ORDRE_STATUTS,
  periode,
  STATUTS,
  STATUTS_ETAPE,
  TYPES,
  valeurChamp,
} from './outils'
import type { Entreprise, Etape, Heures, Proposition, Statut, StatutEtape, Subvention, TypeSubvention } from './types'
import { DialogueRejeter, DialogueValider } from './Validation'

export function Fiche() {
  const { id } = useParams()
  const subventions = useSubventions()
  const entreprises = useEntreprises()
  const g = subventions.data?.find((x) => x.id === id)

  const erreur = subventions.error ?? entreprises.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!subventions.data || !entreprises.data) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
  if (!g)
    return (
      <p className="py-8 text-center text-sm text-pierre-500">
        Cette subvention n’existe plus.{' '}
        <Link className="text-foret-700 underline" to="/subventions">
          Retour à la validation
        </Link>
      </p>
    )
  return <ContenuFiche key={g.id} g={g} toutes={subventions.data} entreprises={entreprises.data} />
}

function ContenuFiche({ g, toutes, entreprises }: { g: Subvention; toutes: Subvention[]; entreprises: Entreprise[] }) {
  const navigate = useNavigate()
  const enregistrer = useEnregistrer<Subvention>('grants')
  const supprimer = useSupprimer('grants')
  const maj = (champs: Partial<Subvention>) => enregistrer.mutate({ id: g.id, ...champs })
  const [dialogue, setDialogue] = useState<'valider' | 'rejeter' | null>(null)
  const [modifier, setModifier] = useState(false)
  const aDecider = g.status === 'nouveau' || g.status === 'a_valider'
  useEcrireAgenda(g)

  const changerStatut = (status: Statut) => {
    // Obtenue sans date d'octroi : aujourd'hui (rattache la subvention à l'année fiscale).
    maj(status === 'obtenu' && !g.granted_at ? { status, granted_at: aujourdhui() } : { status })
  }

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
            <span>
              {g.origin === 'claude' ? 'Trouvée par Claude' : 'Ajoutée à la main'} le {dateCourte(g.discovered_at)} ·
            </span>
            <ChoixAnneeFiscale g={g} maj={maj} />
            <LienOfficiel url={g.source_url} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {aDecider ? (
            <>
              <button className={ui.bouton} onClick={() => setDialogue('valider')}>
                Retenir…
              </button>
              <button className={ui.boutonSecondaire} onClick={() => setDialogue('rejeter')}>
                Rejeter…
              </button>
            </>
          ) : (
            <select
              aria-label="Statut"
              className={`${champ} w-auto`}
              value={g.status}
              onChange={(e) => changerStatut(e.target.value as Statut)}
            >
              {ORDRE_STATUTS.filter((s) => s !== 'rejete' || g.status === 'rejete').map((s) => (
                <option key={s} value={s}>
                  {s === 'nouveau' ? 'Nouvelle (à revalider)' : STATUTS[s].libelle}
                </option>
              ))}
            </select>
          )}
          <BoutonSupprimer
            onClick={async () => {
              if (
                await confirmer({
                  titre: 'Supprimer cette subvention ?',
                  message:
                    'Ses notes, heures, décisions, étapes de reddition de compte et attributions salariales seront supprimées, et ses dates retirées de l’agenda. Pour l’écarter seulement, rejetez-la : Claude ne la reproposera pas.',
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
        {modifier ? <InfosProgramme g={g} entreprises={entreprises} maj={maj} /> : <ApercuProgramme g={g} entreprises={entreprises} />}
        <EtatAgenda g={g} entreprises={entreprises} />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section titre="Suivi financier">
          <SuiviFinancier g={g} maj={maj} />
        </Section>
        <Section titre="Heures investies">
          <HeuresInvesties g={g} />
        </Section>
      </div>

      <Section titre="Reddition de compte">
        <Reddition g={g} toutes={toutes} entreprises={entreprises} />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section titre="Notes internes">
          <FilNotes grantId={g.id} />
        </Section>
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
              {suivantes.map((s) => (
                <li key={s.id}>
                  Édition suivante :{' '}
                  <Link className="text-foret-700 underline" to={`/subventions/fiche/${s.id}`}>
                    {s.program_name}
                  </Link>{' '}
                  ({libelleAnneeFiscale(s.fiscal_year)})
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

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
function ApercuProgramme({ g, entreprises }: { g: Subvention; entreprises: Entreprise[] }) {
  const nom = (id: string | null) => entreprises.find((e) => e.id === id)?.name
  const infos: [string, string | null | undefined][] = [
    ['Organisme', g.organisme],
    ['Type', TYPES[g.grant_type]],
    ['Trouvée pour', nom(g.target_company_id)],
    ['Entreprise qui dépose', nom(g.applicant_company_id) ?? 'Pas encore décidé'],
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

function InfosProgramme({ g, entreprises, maj }: { g: Subvention; entreprises: Entreprise[]; maj: (c: Partial<Subvention>) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
      <Champ etiquette="Trouvée pour">
        <select className={ui.champ} value={g.target_company_id} onChange={(e) => maj({ target_company_id: e.target.value })}>
          {entreprises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </Champ>
      <Champ etiquette="Entreprise qui dépose">
        <select
          className={ui.champ}
          value={g.applicant_company_id ?? ''}
          onChange={(e) => maj({ applicant_company_id: e.target.value || null })}
        >
          <option value="">Pas encore décidé</option>
          {entreprises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
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
function ChoixAnneeFiscale({ g, maj }: { g: Subvention; maj: (c: Partial<Subvention>) => void }) {
  const proposee = anneeFiscaleProposee(g)
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
function useEcrireAgenda(g: Subvention) {
  const client = useQueryClient()
  const { actif } = useReglageAgenda()
  const etapes = useEtapes().data
  const signature = JSON.stringify([
    g.status,
    g.program_name,
    g.open_date,
    g.deadline_date,
    g.source_url,
    g.target_company_id,
    g.applicant_company_id,
    g.potential_amount_min,
    g.potential_amount_max,
    g.amount_granted,
    (etapes ?? []).filter((e) => e.grant_id === g.id).map((e) => [e.id, e.description, e.due_date, e.status]),
  ])
  useEffect(() => {
    if (!actif) return
    const t = setTimeout(() => ecrireAgendaPlusTard(client, g.id), 1500)
    return () => clearTimeout(t)
  }, [signature, actif, client, g.id])
}

/** Les dates de la subvention dans l'agenda Google « Subventions ». */
function EtatAgenda({ g, entreprises }: { g: Subvention; entreprises: Entreprise[] }) {
  const config = useReglageAgenda()
  const lignes = (useEvenementsAgenda().data ?? []).filter((l) => l.grant_id === g.id)
  const etapes = useEtapes().data ?? []
  if (!config.actif || !estRetenue(g)) return null
  const voulus = evenementsVoulus([g], etapes, {
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

function SuiviFinancier({ g, maj }: { g: Subvention; maj: (c: Partial<Subvention>) => void }) {
  const etapes: { titre: string; montant: keyof Subvention; date: keyof Subvention; libelleDate: string }[] = [
    { titre: 'Demandé', montant: 'amount_requested', date: 'requested_at', libelleDate: 'Date du dépôt' },
    { titre: 'Accordé', montant: 'amount_granted', date: 'granted_at', libelleDate: "Date de l'octroi" },
    { titre: 'Reçu', montant: 'amount_received', date: 'received_at', libelleDate: 'Date de réception' },
  ]
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {etapes.map((e) => (
        <div key={e.titre} className="space-y-1.5">
          <p className="text-sm font-medium">{e.titre}</p>
          <ChampMontant
            className={ui.champ}
            aria-label={`Montant ${e.titre.toLowerCase()}`}
            placeholder="0 $"
            valeur={g[e.montant] as number | null}
            enregistrer={(v) => maj({ [e.montant]: v })}
          />
          <ChampDate aria-label={e.libelleDate} valeur={g[e.date] as string | null} enregistrer={(v) => maj({ [e.date]: v })} />
          <p className="text-xs text-pierre-500">{e.libelleDate}</p>
        </div>
      ))}
    </div>
  )
}

function HeuresInvesties({ g }: { g: Subvention }) {
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

  const retour =
    total > 0 && g.amount_received != null
      ? `${argent(g.amount_received / total)} reçus par heure investie`
      : total > 0 && g.amount_granted != null
        ? `${argent(g.amount_granted / total)} accordés par heure (rien de reçu pour l’instant)`
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

function Reddition({ g, toutes, entreprises }: { g: Subvention; toutes: Subvention[]; entreprises: Entreprise[] }) {
  const { session } = useAuth()
  const etapesToutes = useEtapes().data
  const enregistrer = useEnregistrer<Etape>('grant_reporting_steps')
  const supprimer = useSupprimer('grant_reporting_steps')
  const [description, setDescription] = useState('')
  const [echeance, setEcheance] = useState('')
  const [source, setSource] = useState('')
  const [copie, setCopie] = useState<{ etat: 'en_cours' | 'fait' | 'erreur'; message?: string } | null>(null)

  const etapes = useMemo(
    () => (etapesToutes ?? []).filter((e) => e.grant_id === g.id).sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [etapesToutes, g.id],
  )
  // Subventions dont on peut reprendre les étapes : même programme d'abord.
  const sources = useMemo(() => {
    const avecEtapes = new Set((etapesToutes ?? []).map((e) => e.grant_id))
    const memeProgramme = (x: Subvention) =>
      x.id === g.previous_grant_id || (!!g.program_key && x.program_key === g.program_key)
    return toutes
      .filter((x) => x.id !== g.id && avecEtapes.has(x.id))
      .sort((a, b) => Number(memeProgramme(b)) - Number(memeProgramme(a)) || b.fiscal_year - a.fiscal_year)
      .map((x) => ({ g: x, suggeree: memeProgramme(x) }))
  }, [etapesToutes, toutes, g])
  const nomEntreprise = new Map(entreprises.map((e) => [e.id, e.name]))

  const ajouter = async () => {
    if (!description.trim()) return
    try {
      await enregistrer.mutateAsync({
        grant_id: g.id,
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
      const n = await copierEtapes(source, g.id)
      setCopie({ etat: 'fait', message: `${n} étape${n > 1 ? 's' : ''} reprise${n > 1 ? 's' : ''}.` })
      setSource('')
    } catch (e) {
      setCopie({ etat: 'erreur', message: messageErreur(e) })
    }
  }

  const faites = etapes.filter((e) => e.status === 'complete').length

  return (
    <div className="space-y-3">
      {etapes.length === 0 ? (
        <p className="text-sm text-pierre-500">
          Aucune étape. Ajoutez ce que l’organisme demande (talons de paie, rapport final, déclaration…), ou reprenez les étapes
          d’une année précédente.
        </p>
      ) : (
        <>
          <p className="text-sm text-pierre-500">
            {faites} sur {etapes.length} complétée{faites > 1 ? 's' : ''}
          </p>
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
          <select aria-label="Subvention source" className={`${champ} w-auto max-w-full`} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Choisir une subvention…</option>
            {sources.map(({ g: x, suggeree }) => (
              <option key={x.id} value={x.id}>
                {suggeree ? '★ ' : ''}
                {x.program_name} — {nomEntreprise.get(x.applicant_company_id ?? x.target_company_id)} —{' '}
                {libelleAnneeFiscale(x.fiscal_year)}
              </option>
            ))}
          </select>
          <button className={ui.boutonSecondaire} disabled={!source || copie?.etat === 'en_cours'} onClick={reprendre}>
            Reprendre
          </button>
          {copie?.message && <span className={`text-sm ${copie.etat === 'erreur' ? 'text-red-700' : 'text-foret-700'}`}>{copie.message}</span>}
          {sources.some((s) => s.suggeree) && (
            <p className="w-full text-xs text-pierre-500">★ même programme (édition précédente ou même clé de programme).</p>
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
