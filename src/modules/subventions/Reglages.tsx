import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { ChampTexte } from '@/lib/ChampTexte'
import { messageErreur, useListe } from '@/lib/donnees'
import { IconeAttention, IconePlus } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { REGLAGE_AGENDA_DEFAUT, type ReglageAgenda } from './agenda'
import { Section, ZoneTexte } from './commun'
import {
  appelerWorker,
  erreurWorker,
  synchroniserAgenda,
  useEnregistrer,
  useEntreprises,
  useEvenementsAgenda,
  useModifierReglage,
  useReglages,
  type ResultatAgenda,
} from './donnees'
import { cleProgramme, dateCourte, moment } from './outils'
import type { Entreprise as Compagnie } from '@/lib/types'
import type { Entreprise } from './types'

export function Reglages() {
  const entreprises = useEntreprises()
  const reglages = useReglages()
  const modifier = useModifierReglage()

  const erreur = entreprises.error ?? reglages.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!entreprises.data || !reglages.data) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const valeur = (cle: string) => reglages.data.find((r) => r.key === cle)?.value
  const active = valeur('recherche_active') !== false

  return (
    <div className="max-w-4xl space-y-4">
      <Section titre="Recherche automatique">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-foret-700"
            checked={active}
            onChange={(e) => modifier.mutate({ key: 'recherche_active', value: e.target.checked })}
          />
          Chercher 4 fois par année : début d’octobre, janvier, avril et juillet
        </label>
        <p className="mt-1 text-xs text-pierre-500">
          À chaque fois : une recherche large de nouvelles subventions pour chaque entreprise, puis la mise à jour des subventions retenues
          et obtenues. En pause, rien ne part tout seul ; « Lancer maintenant » (onglet Recherches) reste possible. Ce module n’envoie aucun
          courriel.
        </p>
      </Section>

      <AgendaGoogle valeur={valeur('agenda')} />

      <Section titre="Consignes pour tout le groupe (facultatif)">
        <p className="mb-2 text-sm text-pierre-600">
          Ajoutées à chaque recherche. La liste des entreprises du groupe, la priorité aux subventions salariales (pour les
          entreprises qui embauchent) et « ratisser large » y sont déjà : écrivez ici seulement une règle à imposer avant que la
          mémoire l’apprenne de vos validations et rejets.
        </p>
        <ZoneTexte
          className={ui.champ}
          rows={3}
          placeholder="Ex. jamais de prêts, seulement des subventions et des crédits d’impôt"
          valeur={String(valeur('consignes_groupe') ?? '')}
          enregistrer={(v) => modifier.mutate({ key: 'consignes_groupe', value: v })}
        />
      </Section>

      <Section titre="Entreprises (une recherche chacune, en silo)">
        <div className="space-y-4">
          {entreprises.data.map((e) => (
            <FicheEntreprise key={e.id} e={e} />
          ))}
          <NouvelleEntreprise
            ordre={(entreprises.data.at(-1)?.sort_order ?? 0) + 1}
            dejaLa={new Set(entreprises.data.map((e) => e.entreprise_id))}
          />
        </div>
      </Section>
    </div>
  )
}

const MODES: Record<ResultatAgenda['mode'], string> = {
  simule: 'simulé (base locale : rien n’est écrit dans Google)',
  google: 'Google Agenda branché',
  non_configure: 'Google Agenda pas encore branché (secret SUBVENTIONS_AGENDA_REFRESH_TOKEN, README section 8)',
}

/** Agenda Google « Subventions » : dédié, pour ne pas toucher l'agenda d'inscription. */
function AgendaGoogle({ valeur }: { valeur: unknown }) {
  const client = useQueryClient()
  const modifier = useModifierReglage()
  const evenements = useEvenementsAgenda()
  const config: ReglageAgenda = { ...REGLAGE_AGENDA_DEFAUT, ...(valeur && typeof valeur === 'object' ? (valeur as Partial<ReglageAgenda>) : {}) }
  const changer = (champs: Partial<ReglageAgenda>) => modifier.mutate({ key: 'agenda', value: { ...config, ...champs } })
  const etat = useQuery({
    queryKey: ['subventions-worker', 'etat'],
    queryFn: async () => {
      const res = await appelerWorker('etat')
      if (!res.ok) throw new Error(await erreurWorker(res))
      return (await res.json()) as { agenda?: ResultatAgenda['mode'] }
    },
    retry: false,
    staleTime: 60_000,
  })
  const [synchro, setSynchro] = useState<{ enCours: boolean; message?: string; erreur?: boolean }>({ enCours: false })

  const ecrire = async () => {
    setSynchro({ enCours: true })
    try {
      const r = await synchroniserAgenda()
      client.invalidateQueries({ queryKey: ['subventions', 'grant_calendar_events'] })
      if (r.erreur) setSynchro({ enCours: false, erreur: true, message: r.erreur })
      else if (!r.actif) setSynchro({ enCours: false, message: 'L’écriture dans l’agenda est désactivée.' })
      else
        setSynchro({
          enCours: false,
          erreur: !!r.erreurs,
          message: `${r.faites} changement${r.faites > 1 ? 's' : ''} écrit${r.faites > 1 ? 's' : ''}${r.erreurs ? `, ${r.erreurs} en erreur` : ''}${
            r.restantes ? `, ${r.restantes} au prochain passage` : ''
          }${r.mode === 'simule' ? ' (simulé)' : ''}.`,
        })
    } catch (e) {
      setSynchro({ enCours: false, erreur: true, message: messageErreur(e) })
    }
  }

  const lignes = evenements.data ?? []
  const ecrits = lignes.filter((l) => l.google_id).length
  const enErreur = lignes.filter((l) => l.error).length
  const derniere = lignes.reduce<string | null>((m, l) => (l.synced_at && (!m || l.synced_at > m) ? l.synced_at : m), null)

  return (
    <Section titre="Agenda Google « Subventions »">
      <p className="mb-3 text-sm text-pierre-600">
        Dès qu’une subvention est retenue, ses dates d’ouverture et de fermeture y sont écrites (journée entière) ; une subvention obtenue
        y met aussi ses échéances de reddition de compte. Les dates suivent les changements et disparaissent si la subvention est
        rejetée, refusée, expirée ou remise en nouvelle. Agenda dédié : l’agenda d’inscription n’est jamais touché.
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="block">
          <span className={ui.etiquette}>Identifiant de l’agenda</span>
          <ChampTexte
            className={ui.champ}
            placeholder="…@group.calendar.google.com"
            valeur={config.calendrier}
            enregistrer={(calendrier) => changer({ calendrier })}
          />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-foret-700"
            checked={config.actif}
            onChange={(e) => changer({ actif: e.target.checked })}
          />
          Écrire dans l’agenda
        </label>
      </div>
      <p className="mt-1 text-xs text-pierre-500">
        Google Agenda → paramètres de l’agenda « Subventions » → « Intégrer l’agenda » → Identifiant de l’agenda. Rien d’avant le{' '}
        {dateCourte(config.depuis)} n’est écrit.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <button className={ui.boutonSecondaire} disabled={synchro.enCours || !config.actif} onClick={ecrire}>
          {synchro.enCours ? 'Écriture…' : 'Écrire maintenant'}
        </button>
        <span className="text-pierre-600">
          {etat.data?.agenda ? MODES[etat.data.agenda] : etat.error ? `Le Worker ne répond pas : ${messageErreur(etat.error)}` : ''}
        </span>
        {synchro.message && <span className={synchro.erreur ? 'text-red-700' : 'text-foret-700'}>{synchro.message}</span>}
      </div>
      {lignes.length > 0 && (
        <p className="mt-2 text-xs text-pierre-500">
          {ecrits} date{ecrits > 1 ? 's' : ''} dans l’agenda
          {enErreur ? `, ${enErreur} en erreur (voir la fiche)` : ''}
          {derniere ? ` · dernière écriture ${moment(derniere)}` : ''}. Mis à jour aux 15 minutes, et tout de suite depuis la fiche.
        </p>
      )}
    </Section>
  )
}

function FicheEntreprise({ e }: { e: Entreprise }) {
  const enregistrer = useEnregistrer<Entreprise>('grant_companies')
  const maj = (champs: Partial<Entreprise>) => enregistrer.mutate({ id: e.id, ...champs })
  return (
    <div className="rounded-lg border border-pierre-200 p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem_auto_auto]">
        <div>
          <span className={ui.etiquette}>Compagnie</span>
          {/* Nom du référentiel commun : il se change dans Référentiel › Compagnies. */}
          <p className="py-2 text-sm font-medium text-pierre-900">{e.name}</p>
        </div>
        <label className="block">
          <span className={ui.etiquette}>Statut juridique</span>
          <ChampTexte
            className={ui.champ}
            placeholder="Ex. OBNL, entreprise privée"
            valeur={e.legal_status ?? ''}
            enregistrer={(v) => maj({ legal_status: v || null })}
          />
        </label>
        <label
          className="flex items-center gap-2 self-end pb-2 text-sm"
          title="Priorité aux subventions salariales dans la recherche de cette entreprise"
        >
          <input
            type="checkbox"
            className="h-4 w-4 accent-foret-700"
            checked={e.hires_staff}
            onChange={(ev) => maj({ hires_staff: ev.target.checked })}
          />
          Embauche du personnel
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-foret-700" checked={e.active} onChange={(ev) => maj({ active: ev.target.checked })} />
          Active
        </label>
      </div>
      {!e.legal_status && (
        <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
          <IconeAttention className="size-3.5" /> À préciser : certains programmes sont réservés aux OBNL, d’autres aux entreprises.
        </p>
      )}
      <label className="mt-3 block">
        <span className={ui.etiquette}>Critères propres à l’entreprise</span>
        <ZoneTexte
          className={ui.champ}
          rows={4}
          placeholder="Activités, clientèle, embauche, projets à financer, ce qui la rend admissible ou non…"
          valeur={e.specific_criteria ?? ''}
          enregistrer={(v) => maj({ specific_criteria: v || null })}
        />
      </label>
    </div>
  )
}

/** Ajoute la recherche d'une compagnie du référentiel qui n'en a pas encore. */
function NouvelleEntreprise({ ordre, dejaLa }: { ordre: number; dejaLa: Set<string> }) {
  const enregistrer = useEnregistrer<Entreprise>('grant_companies', { erreurSurPlace: true })
  const compagnies = useListe<Compagnie>('core', 'entreprises', 'ordre')
  const offertes = (compagnies.data ?? []).filter((c) => c.actif && !dejaLa.has(c.id))
  const [choix, setChoix] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const ajouter = async () => {
    const c = offertes.find((x) => x.id === choix)
    if (!c) return
    setErreur(null)
    try {
      await enregistrer.mutateAsync({ entreprise_id: c.id, name: c.nom, slug: cleProgramme(c.nom), sort_order: ordre })
      setChoix('')
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }
  return (
    <div>
      <div className="flex gap-2">
        <select className={ui.champ} aria-label="Compagnie à ajouter" value={choix} onChange={(e) => setChoix(e.target.value)}>
          <option value="">{offertes.length ? 'Ajouter une compagnie du groupe…' : 'Toutes les compagnies ont leur recherche'}</option>
          {offertes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </select>
        <button className={ui.boutonSecondaire} disabled={!choix || enregistrer.isPending} onClick={ajouter}>
          <IconePlus /> Ajouter
        </button>
      </div>
      <p className="mt-1 text-xs text-pierre-500">
        Les compagnies se gèrent dans{' '}
        <Link to="/referentiel/compagnies" className="text-foret-700 underline">
          Référentiel › Compagnies
        </Link>
        .
      </p>
      {erreur && <p className={`${ui.erreur} mt-2`}>{erreur}</p>}
    </div>
  )
}
