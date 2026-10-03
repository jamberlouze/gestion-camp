import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { IconeChevron, IconeCorbeille, IconePlus } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { ChampDate, ChampMontant, FilNotes, LienOfficiel, Pastille, PastilleStatut, Section, ZoneTexte } from './commun'
import {
  copierEtapes,
  useEnregistrer,
  useEntreprises,
  useEtapes,
  useFeedback,
  useHeures,
  useProfils,
  useSubventions,
  useSupprimer,
} from './donnees'
import {
  argent,
  aujourdhui,
  CATEGORIES,
  dateCourte,
  heures as formatHeures,
  libelleAnneeFiscale,
  anneeFiscale,
  dateRattachement,
  moment,
  nomPersonne,
  ORDRE_STATUTS,
  STATUTS,
  STATUTS_ETAPE,
  TYPES,
} from './outils'
import type { Entreprise, Etape, Heures, Statut, StatutEtape, Subvention, TypeSubvention } from './types'
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
  const aDecider = g.status === 'nouveau' || g.status === 'a_valider'

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
        <div className="min-w-0 flex-1">
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
              {g.origin === 'claude' ? 'Trouvée par Claude' : 'Ajoutée à la main'} le {dateCourte(g.discovered_at)} · année fiscale{' '}
              {libelleAnneeFiscale(anneeFiscale(dateRattachement(g)))}
            </span>
            <LienOfficiel url={g.source_url} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {aDecider ? (
            <>
              <button className={ui.bouton} onClick={() => setDialogue('valider')}>
                On y va
              </button>
              <button className={ui.boutonSecondaire} onClick={() => setDialogue('rejeter')}>
                Rejeter…
              </button>
            </>
          ) : (
            <select
              aria-label="Statut"
              className={ui.champ + ' w-auto'}
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
          <button
            className={ui.boutonDanger}
            aria-label="Supprimer la subvention"
            onClick={async () => {
              if (
                await confirmer({
                  titre: 'Supprimer cette subvention ?',
                  message:
                    'Ses notes, heures, décisions et étapes de reddition de compte seront supprimées. Pour l’écarter seulement, rejetez-la : Claude ne la reproposera pas.',
                })
              ) {
                supprimer.mutate(g.id, { onSuccess: () => navigate('/subventions', { replace: true }) })
              }
            }}
          >
            <IconeCorbeille />
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section titre="Programme">
          <InfosProgramme g={g} entreprises={entreprises} maj={maj} />
        </Section>

        <div className="space-y-4">
          <Section titre="Suivi financier">
            <SuiviFinancier g={g} maj={maj} />
          </Section>
          <Section titre="Heures investies">
            <HeuresInvesties g={g} />
          </Section>
        </div>
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
                  ({STATUTS[precedente.status].libelle.toLowerCase()}, {libelleAnneeFiscale(anneeFiscale(dateRattachement(precedente)))})
                </li>
              )}
              {suivantes.map((s) => (
                <li key={s.id}>
                  Édition suivante :{' '}
                  <Link className="text-foret-700 underline" to={`/subventions/fiche/${s.id}`}>
                    {s.program_name}
                  </Link>{' '}
                  ({libelleAnneeFiscale(anneeFiscale(dateRattachement(s)))})
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
    <label className={`block ${large ? 'sm:col-span-2' : ''}`}>
      <span className={ui.etiquette}>{etiquette}</span>
      {children}
    </label>
  )
}

function InfosProgramme({ g, entreprises, maj }: { g: Subvention; entreprises: Entreprise[]; maj: (c: Partial<Subvention>) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
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
      <Champ etiquette="Description" large>
        <ZoneTexte className={ui.champ} rows={4} valeur={g.description ?? ''} enregistrer={(v) => maj({ description: v || null })} />
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
            className={`${ui.champ} w-24`}
            aria-label="Heures"
            inputMode="decimal"
            placeholder="Heures"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ajouter()}
          />
          <input type="date" className={`${ui.champ} w-auto`} aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input
            className={`${ui.champ} min-w-32 flex-1`}
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
      .sort((a, b) => Number(memeProgramme(b)) - Number(memeProgramme(a)) || dateRattachement(b).localeCompare(dateRattachement(a)))
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
                  {e.template_source_step_id && <Pastille>reprise</Pastille>}
                </li>
              )
            })}
          </ul>
        </>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <input
          className={`${ui.champ} min-w-56 flex-1`}
          aria-label="Nouvelle étape"
          placeholder="Nouvelle étape (ex. soumettre les talons de paie du trimestre)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ajouter()}
        />
        <input type="date" aria-label="Échéance" className={`${ui.champ} w-auto`} value={echeance} onChange={(e) => setEcheance(e.target.value)} />
        <button className={ui.boutonSecondaire} disabled={!description.trim() || enregistrer.isPending} onClick={ajouter}>
          <IconePlus /> Ajouter
        </button>
      </div>

      {sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-pierre-100 pt-3">
          <span className="text-sm text-pierre-600">Reprendre les étapes de</span>
          <select aria-label="Subvention source" className={`${ui.champ} w-auto max-w-full`} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Choisir une subvention…</option>
            {sources.map(({ g: x, suggeree }) => (
              <option key={x.id} value={x.id}>
                {suggeree ? '★ ' : ''}
                {x.program_name} — {nomEntreprise.get(x.applicant_company_id ?? x.target_company_id)} —{' '}
                {libelleAnneeFiscale(anneeFiscale(dateRattachement(x)))}
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
