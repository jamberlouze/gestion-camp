import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { menu, Pastille, Section } from './commun'
import { appelerWorker, erreurWorker, useEntreprises, useRappels, useRecherches, useReglages, useRegles } from './donnees'
import { dateCourte, moment } from './outils'
import type { Entreprise, Recherche, Regles } from './types'

interface Etat {
  anthropic: boolean
  supabase: boolean
  gmail: boolean
  modele: string
}

/** Date (AAAA-MM-JJ) de la prochaine recherche : lundi, ou aujourd'hui si on est lundi avant la fin des passages (11 h UTC). */
function prochainLundi() {
  const d = new Date()
  const jours = d.getDay() === 1 && d.getUTCHours() < 11 ? 0 : (8 - d.getDay()) % 7 || 7
  d.setDate(d.getDate() + jours)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function Recherches() {
  const entreprises = useEntreprises()
  const recherches = useRecherches()
  const regles = useRegles()
  const reglages = useReglages()
  const rappels = useRappels()
  const etat = useQuery({
    queryKey: ['subventions-worker', 'etat'],
    queryFn: async () => {
      const res = await appelerWorker('etat')
      if (!res.ok) throw new Error(await erreurWorker(res))
      return (await res.json()) as Etat
    },
    retry: false,
    staleTime: 60_000,
  })

  const erreur = entreprises.error ?? recherches.error ?? regles.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!entreprises.data || !recherches.data || !regles.data) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const active = reglages.data?.find((r) => r.key === 'recherche_active')?.value !== false
  const nomEntreprise = new Map(entreprises.data.map((e) => [e.id, e.name]))

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Section titre="Configuration">
          <ConfigWorker etat={etat.data} erreur={etat.error} chargement={etat.isLoading} />
          <p className="mt-3 text-sm text-pierre-600">
            Recherche automatique :{' '}
            {active ? (
              <>
                <b>active</b>, prochaine le lundi {dateCourte(prochainLundi())} entre 4 h et 7 h (une entreprise à la fois), puis le
                courriel de rappel.
              </>
            ) : (
              <>
                <b>en pause</b> (voir{' '}
                <Link className="text-foret-700 underline" to="/subventions/reglages">
                  Réglages
                </Link>
                ).
              </>
            )}
          </p>
        </Section>
        <Section titre="Lancer une recherche maintenant">
          <LancerRecherche entreprises={entreprises.data} pret={!!etat.data?.anthropic && !!etat.data?.supabase} />
        </Section>
      </div>

      <Section titre="Journal des recherches">
        <Journal recherches={recherches.data} nomEntreprise={nomEntreprise} />
      </Section>

      <Section titre="Mémoire : règles apprises du feedback">
        <Memoire regles={regles.data} entreprises={entreprises.data} />
      </Section>

      <Section titre="Courriels de rappel">
        <CourrielEssai pret={!!etat.data?.gmail && !!etat.data?.supabase} />
        {(rappels.data ?? []).length > 0 && (
          <ul className="mt-3 divide-y divide-pierre-100 text-sm">
            {[...(rappels.data ?? [])]
              .reverse()
              .slice(0, 8)
              .map((r) => (
                <li key={r.week_start} className="py-1.5">
                  Semaine du {dateCourte(r.week_start)} : {r.new_count} nouvelle{r.new_count > 1 ? 's' : ''}, {r.recipients.length}{' '}
                  destinataire{r.recipients.length > 1 ? 's' : ''}
                  {r.error ? <span className="text-red-700"> — non envoyé : {r.error}</span> : <span className="text-foret-700"> — envoyé</span>}
                </li>
              ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function ConfigWorker({ etat, erreur, chargement }: { etat?: Etat; erreur: unknown; chargement: boolean }) {
  if (chargement) return <p className="text-sm text-pierre-500">Vérification…</p>
  if (erreur || !etat) return <p className={ui.erreur}>Le Worker ne répond pas : {messageErreur(erreur)}</p>
  const ligne = (ok: boolean, libelle: string, aide: string) => (
    <li className="flex items-start gap-2">
      <span className={ok ? 'text-foret-700' : 'text-red-700'}>{ok ? '✓' : '✗'}</span>
      <span>
        {libelle}
        {!ok && <span className="block text-xs text-pierre-500">{aide}</span>}
      </span>
    </li>
  )
  return (
    <>
      <ul className="space-y-1.5 text-sm">
        {ligne(etat.anthropic, 'Clé API Claude (ANTHROPIC_API_KEY)', 'Secret Cloudflare à ajouter : voir README, « Vigie de subventions ».')}
        {ligne(etat.supabase, 'Clé secrète Supabase (SUPABASE_SECRET_KEY)', 'Secret Cloudflare à ajouter : voir README.')}
        {ligne(etat.gmail, 'Envoi par Gmail (GMAIL_*)', 'Quatre secrets Cloudflare à ajouter : voir README.')}
      </ul>
      <p className="mt-2 text-xs text-pierre-500">Modèle : {etat.modele}</p>
    </>
  )
}

type Progres = { etat: 'en_cours'; debut: number } | { etat: 'fini'; message: string; erreur: boolean }

function LancerRecherche({ entreprises, pret }: { entreprises: Entreprise[]; pret: boolean }) {
  const [entreprise, setEntreprise] = useState(entreprises.find((e) => e.active)?.id ?? '')
  const [sansMemoire, setSansMemoire] = useState(false)
  const [progres, setProgres] = useState<Progres | null>(null)
  const [maintenant, setMaintenant] = useState(0)

  useEffect(() => {
    if (progres?.etat !== 'en_cours') return
    const t = setInterval(() => setMaintenant(Date.now()), 1000)
    return () => clearInterval(t)
  }, [progres?.etat])

  const lancer = async () => {
    const debut = Date.now()
    setMaintenant(debut)
    setProgres({ etat: 'en_cours', debut })
    try {
      const res = await appelerWorker('recherche', {
        method: 'POST',
        body: JSON.stringify({ company_id: entreprise, sans_memoire: sansMemoire }),
      })
      if (!res.ok || !res.body) throw new Error(await erreurWorker(res))
      // Flux de lignes JSON : battements « en_cours », puis le bilan.
      const lecteur = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let reste = ''
      let fin: Record<string, unknown> | null = null
      for (;;) {
        const { value, done } = await lecteur.read()
        if (done) break
        reste += value
        const lignes = reste.split('\n')
        reste = lignes.pop() ?? ''
        for (const l of lignes) if (l.trim()) fin = JSON.parse(l)
      }
      if (!fin?.fin) throw new Error('La connexion a été coupée avant la fin. Voir le journal ci-dessous.')
      if (fin.erreur) throw new Error(String(fin.erreur))
      const n = Number(fin.new)
      setProgres({
        etat: 'fini',
        erreur: false,
        message: `${fin.entreprise} : ${n} nouvelle${n > 1 ? 's' : ''}, ${fin.duplicate} déjà connue${Number(fin.duplicate) > 1 ? 's' : ''}${
          Number(fin.invalid) ? `, ${fin.invalid} écartée${Number(fin.invalid) > 1 ? 's' : ''} (mal formée)` : ''
        }.`,
      })
    } catch (e) {
      setProgres({ etat: 'fini', erreur: true, message: messageErreur(e) })
    }
  }

  const enCours = progres?.etat === 'en_cours'
  const secondes = enCours ? Math.max(0, Math.round((maintenant - progres.debut) / 1000)) : 0

  return (
    <div className="space-y-3">
      <p className="text-sm text-pierre-600">
        Même recherche que celle du lundi, pour une entreprise. Elle prend de 3 à 10 minutes : gardez cette page ouverte.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Entreprise" className={menu} value={entreprise} disabled={enCours} onChange={(e) => setEntreprise(e.target.value)}>
          {entreprises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {e.active ? '' : ' (inactive)'}
            </option>
          ))}
        </select>
        <button className={ui.bouton} disabled={!pret || !entreprise || enCours} onClick={lancer}>
          {enCours ? 'Recherche en cours…' : 'Lancer la recherche'}
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm text-pierre-600">
        <input type="checkbox" className="accent-foret-700" checked={sansMemoire} disabled={enCours} onChange={(e) => setSansMemoire(e.target.checked)} />
        Sans la mémoire (pour comparer la qualité avec et sans les règles apprises)
      </label>
      {enCours && (
        <p className="text-sm text-pierre-600">
          Claude cherche sur le web… {Math.floor(secondes / 60)} min {String(secondes % 60).padStart(2, '0')} s
        </p>
      )}
      {progres?.etat === 'fini' && (
        <p className={progres.erreur ? ui.erreur : 'rounded-lg bg-foret-50 px-3 py-2 text-sm text-foret-800'}>
          {progres.message}{' '}
          {!progres.erreur && (
            <Link className="underline" to="/subventions">
              Voir la validation
            </Link>
          )}
        </p>
      )}
      {!pret && <p className="text-xs text-pierre-500">Disponible une fois la clé Claude et la clé secrète Supabase ajoutées.</p>}
    </div>
  )
}

function CourrielEssai({ pret }: { pret: boolean }) {
  const [etat, setEtat] = useState<{ envoi: boolean; message?: string; erreur?: boolean }>({ envoi: false })
  const envoyer = async () => {
    setEtat({ envoi: true })
    try {
      const res = await appelerWorker('courriel', { method: 'POST' })
      if (!res.ok) throw new Error(await erreurWorker(res))
      const { envoye } = await res.json()
      setEtat({ envoi: false, message: `Courriel d'essai envoyé à ${envoye}.` })
    } catch (e) {
      setEtat({ envoi: false, erreur: true, message: messageErreur(e) })
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm text-pierre-600">
        Chaque lundi, après les recherches. Un essai reprend les 7 derniers jours et part à vous seulement.
      </p>
      <button className={ui.boutonSecondaire} disabled={!pret || etat.envoi} onClick={envoyer}>
        {etat.envoi ? 'Envoi…' : 'M’envoyer un courriel d’essai'}
      </button>
      {etat.message && <span className={`text-sm ${etat.erreur ? 'text-red-700' : 'text-foret-700'}`}>{etat.message}</span>}
    </div>
  )
}

function Journal({ recherches, nomEntreprise }: { recherches: Recherche[]; nomEntreprise: Map<string, string> }) {
  const [ouverte, setOuverte] = useState<string | null>(null)
  const liste = useMemo(() => [...recherches].sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 60), [recherches])
  if (liste.length === 0) return <p className="text-sm text-pierre-500">Aucune recherche pour l’instant.</p>
  const nombre = (n: number | null) => (n == null ? '—' : n.toLocaleString('fr-CA'))
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-pierre-500">
          <tr>
            <th className="px-2 py-1.5 font-medium">Date</th>
            <th className="px-2 py-1.5 font-medium">Entreprise</th>
            <th className="px-2 py-1.5 font-medium">Résultat</th>
            <th className="px-2 py-1.5 text-right font-medium" title="Proposées / nouvelles / déjà connues / écartées">
              Trouvées
            </th>
            <th className="px-2 py-1.5 text-right font-medium">Recherches web</th>
            <th className="px-2 py-1.5 text-right font-medium" title="Jetons en entrée / en sortie">
              Jetons
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-pierre-100">
          {liste.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="whitespace-nowrap px-2 py-1.5">
                {moment(r.started_at)}
                <div className="mt-0.5 flex gap-1">
                  {r.trigger_source === 'manuel' && <Pastille>manuelle</Pastille>}
                  {!r.memory_version_id && <Pastille>sans mémoire</Pastille>}
                </div>
              </td>
              <td className="px-2 py-1.5">{nomEntreprise.get(r.company_id)}</td>
              <td className="px-2 py-1.5">
                {!r.finished_at ? (
                  <span className="text-pierre-500">En cours…</span>
                ) : r.error ? (
                  <span className="text-red-700">{r.error}</span>
                ) : (
                  <span className="text-foret-700">
                    {r.new_count} nouvelle{r.new_count > 1 ? 's' : ''}
                  </span>
                )}
                {r.raw_output && (
                  <>
                    {' '}
                    <button className="text-xs text-pierre-500 underline" onClick={() => setOuverte(ouverte === r.id ? null : r.id)}>
                      {ouverte === r.id ? 'masquer la réponse' : 'voir la réponse brute'}
                    </button>
                    {ouverte === r.id && (
                      <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-pierre-50 p-2 text-xs">{r.raw_output}</pre>
                    )}
                  </>
                )}
              </td>
              <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                {r.found_count} / {r.new_count} / {r.duplicate_count} / {r.invalid_count}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{nombre(r.web_search_count)}</td>
              <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                {nombre(r.input_tokens)} / {nombre(r.output_tokens)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-pierre-500">Trouvées : proposées / nouvelles / déjà connues / écartées (mal formées).</p>
    </div>
  )
}

function Memoire({ regles, entreprises }: { regles: Regles[]; entreprises: Entreprise[] }) {
  const [historique, setHistorique] = useState<string | null>(null)
  if (regles.length === 0)
    return (
      <p className="text-sm text-pierre-500">
        Pas encore de règles : elles se forment à partir des validations et des rejets, au début de chaque recherche.
      </p>
    )
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {entreprises.map((e) => {
        const siennes = regles.filter((r) => r.company_id === e.id).sort((a, b) => b.generated_at.localeCompare(a.generated_at))
        const [derniere, ...anciennes] = siennes
        return (
          <div key={e.id} className="rounded-lg bg-pierre-50 p-3">
            <p className="font-medium">{e.name}</p>
            {derniere ? (
              <>
                <p className="text-xs text-pierre-500">
                  {moment(derniere.generated_at)}, d’après {derniere.based_on_feedback_count} décision
                  {derniere.based_on_feedback_count > 1 ? 's' : ''}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm">{derniere.summary}</p>
                {anciennes.length > 0 && (
                  <button className="mt-2 text-xs text-pierre-500 underline" onClick={() => setHistorique(historique === e.id ? null : e.id)}>
                    {historique === e.id ? 'Masquer' : `Voir les ${anciennes.length} versions précédentes`}
                  </button>
                )}
                {historique === e.id &&
                  anciennes.map((r) => (
                    <div key={r.id} className="mt-2 border-t border-pierre-200 pt-2">
                      <p className="text-xs text-pierre-500">{moment(r.generated_at)}</p>
                      <p className="whitespace-pre-wrap text-xs">{r.summary}</p>
                    </div>
                  ))}
              </>
            ) : (
              <p className="mt-1 text-sm text-pierre-500">Pas encore de règles.</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
