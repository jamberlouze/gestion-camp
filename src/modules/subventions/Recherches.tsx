import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { menu, Pastille, Section } from './commun'
import { appelerWorker, erreurWorker, useEntreprises, useRecherches, useReglages, useRegles } from './donnees'
import { dateCourte, moment, prochainTrimestre } from './outils'
import { type CleTheme, libelleTheme, THEMES } from './themes'
import type { Entreprise, Recherche, Regles } from './types'

interface Etat {
  anthropic: boolean
  supabase: boolean
  modele: string
}

export function Recherches() {
  const entreprises = useEntreprises()
  const recherches = useRecherches()
  const regles = useRegles()
  const reglages = useReglages()
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
  const prochaine = prochainTrimestre()

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Section titre="Configuration">
          <ConfigWorker etat={etat.data} erreur={etat.error} chargement={etat.isLoading} />
          <p className="mt-3 text-sm text-pierre-600">
            Recherche automatique :{' '}
            {active ? (
              <>
                <b>active</b>, 4 fois par année (début d’octobre, janvier, avril et juillet) :{' '}
                {prochaine.enCours ? <>en cours depuis le {dateCourte(prochaine.date)}</> : <>prochaine le {dateCourte(prochaine.date)}</>}, tôt
                le matin. D’abord une recherche de nouvelles subventions par thème, pour tout le groupe ({THEMES.length} thèmes : chaque
                programme nomme les entreprises qui peuvent en profiter), puis une courte recherche « angle mort » par entreprise (ce qui
                lui est propre), puis la mise à jour des subventions retenues et obtenues ; un travail à la fois.
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
      </ul>
      <p className="mt-2 text-xs text-pierre-500">Modèle : {etat.modele}</p>
    </>
  )
}

type Progres = { etat: 'en_cours'; debut: number } | { etat: 'fini'; message: string; erreur: boolean }

type Genre = 'theme' | 'angle_mort' | 'ciblee'

function LancerRecherche({ entreprises, pret }: { entreprises: Entreprise[]; pret: boolean }) {
  const [entreprise, setEntreprise] = useState(entreprises.find((e) => e.active)?.id ?? '')
  const [theme, setTheme] = useState<CleTheme>(THEMES[0].cle)
  const [genre, setGenre] = useState<Genre>('theme')
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
        body: JSON.stringify(
          genre === 'theme'
            ? { genre, theme, sans_memoire: sansMemoire }
            : { genre, company_id: entreprise, sans_memoire: genre === 'angle_mort' && sansMemoire },
        ),
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
      const ecartees = Number(fin.invalid) ? `, ${fin.invalid} écartée${Number(fin.invalid) > 1 ? 's' : ''} (mal formée)` : ''
      const completees = Number(fin.added_to)
        ? `, ${fin.added_to} carte${Number(fin.added_to) > 1 ? 's' : ''} connue${Number(fin.added_to) > 1 ? 's' : ''} complétée${Number(fin.added_to) > 1 ? 's' : ''} d’une entreprise`
        : ''
      const pour = String(fin.theme ?? fin.entreprise)
      setProgres({
        etat: 'fini',
        erreur: false,
        message:
          'checked' in fin
            ? Number(fin.checked) === 0
              ? `${pour} : aucune subvention retenue ou obtenue à mettre à jour.`
              : `${pour} : ${bilanMiseAJour(Number(fin.checked), Number(fin.filled), Number(fin.proposed), n)}${ecartees}.`
            : `${pour} : ${n} nouvelle${n > 1 ? 's' : ''}, ${fin.duplicate} déjà connue${Number(fin.duplicate) > 1 ? 's' : ''}${completees}${ecartees}.`,
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
        Même travail que la recherche automatique, pour un thème ou une entreprise. Il prend de 3 à 15 minutes : gardez cette page
        ouverte.
      </p>
      <fieldset className="space-y-1 text-sm">
        <legend className="sr-only">Genre de recherche</legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="genre" className="mt-0.5 accent-foret-700" checked={genre === 'theme'} disabled={enCours} onChange={() => setGenre('theme')} />
          <span>
            <b className="font-medium">Recherche par thème</b> : nouvelles subventions d’un thème pour tout le groupe ; chaque programme
            nomme les entreprises qui peuvent en profiter
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="genre" className="mt-0.5 accent-foret-700" checked={genre === 'angle_mort'} disabled={enCours} onChange={() => setGenre('angle_mort')} />
          <span>
            <b className="font-medium">Angle mort</b> : courte recherche de ce qui est propre à une entreprise (activités, actifs,
            clientèle), après les thèmes
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="genre" className="mt-0.5 accent-foret-700" checked={genre === 'ciblee'} disabled={enCours} onChange={() => setGenre('ciblee')} />
          <span>
            <b className="font-medium">Mise à jour des retenues</b> : dates, montants, critères et lien de ses subventions à faire ou déposées ;
            nouvelle édition de ses acceptées (10 à la fois)
          </span>
        </label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        {genre === 'theme' ? (
          <select aria-label="Thème" className={menu} value={theme} disabled={enCours} onChange={(e) => setTheme(e.target.value as CleTheme)}>
            {THEMES.map((t) => (
              <option key={t.cle} value={t.cle}>
                {t.libelle}
              </option>
            ))}
          </select>
        ) : (
          <select aria-label="Entreprise" className={menu} value={entreprise} disabled={enCours} onChange={(e) => setEntreprise(e.target.value)}>
            {entreprises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.active ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
        )}
        <button className={ui.bouton} disabled={!pret || (genre !== 'theme' && !entreprise) || enCours} onClick={lancer}>
          {enCours ? 'Recherche en cours…' : 'Lancer maintenant'}
        </button>
      </div>
      {genre !== 'ciblee' && (
        <label className="flex items-center gap-2 text-sm text-pierre-600">
          <input type="checkbox" className="accent-foret-700" checked={sansMemoire} disabled={enCours} onChange={(e) => setSansMemoire(e.target.checked)} />
          Sans la mémoire (pour comparer la qualité avec et sans les règles apprises)
        </label>
      )}
      {enCours && (
        <p className="text-sm text-pierre-600">
          Claude cherche sur le web… {Math.floor(secondes / 60)} min {String(secondes % 60).padStart(2, '0')} s
        </p>
      )}
      {progres?.etat === 'fini' && (
        <p className={progres.erreur ? ui.erreur : 'rounded-lg bg-foret-50 px-3 py-2 text-sm text-foret-800'}>
          {progres.message}{' '}
          {!progres.erreur && genre !== 'ciblee' && (
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

/** « 4 vérifiées : 2 champs complétés, 1 changement à valider, 1 nouvelle édition ». */
function bilanMiseAJour(verifiees: number, remplis: number, proposes: number, editions: number) {
  const morceaux = [
    remplis ? `${remplis} champ${remplis > 1 ? 's' : ''} complété${remplis > 1 ? 's' : ''}` : null,
    proposes ? `${proposes} changement${proposes > 1 ? 's' : ''} à valider sur la fiche` : null,
    editions ? `${editions} nouvelle${editions > 1 ? 's' : ''} édition${editions > 1 ? 's' : ''} (à valider)` : null,
  ].filter(Boolean)
  return `${verifiees} vérifiée${verifiees > 1 ? 's' : ''}${morceaux.length ? ` : ${morceaux.join(', ')}` : ', rien de changé'}`
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
            <th className="px-2 py-1.5 font-medium">Pour</th>
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
                  {r.kind === 'theme' && <Pastille classe="bg-foret-100 text-foret-800">thème</Pastille>}
                  {r.kind === 'angle_mort' && <Pastille classe="bg-sky-100 text-sky-800">angle mort</Pastille>}
                  {r.kind === 'ciblee' && <Pastille classe="bg-violet-100 text-violet-800">mise à jour</Pastille>}
                  {r.kind === 'salariale' && <Pastille classe="bg-amber-100 text-amber-800">salariale</Pastille>}
                  {r.trigger_source === 'manuel' && <Pastille>manuelle</Pastille>}
                  {r.kind !== 'ciblee' && !r.memory_version_id && <Pastille>sans mémoire</Pastille>}
                </div>
              </td>
              <td className="px-2 py-1.5">
                {r.theme ? (
                  <>
                    {libelleTheme(r.theme)}
                    <span className="block text-xs text-pierre-500">tout le groupe</span>
                  </>
                ) : (
                  nomEntreprise.get(r.company_id ?? '')
                )}
              </td>
              <td className="px-2 py-1.5">
                {!r.finished_at ? (
                  <span className="text-pierre-500">En cours…</span>
                ) : r.error ? (
                  <span className="text-red-700">{r.error}</span>
                ) : r.kind === 'ciblee' ? (
                  <span className="text-foret-700">{bilanMiseAJour(r.found_count, r.filled_count, r.proposed_count, r.new_count)}</span>
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
                {r.kind === 'ciblee' ? '—' : `${r.found_count} / ${r.new_count} / ${r.duplicate_count} / ${r.invalid_count}`}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{nombre(r.web_search_count)}</td>
              <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                {nombre(r.input_tokens)} / {nombre(r.output_tokens)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-pierre-500">
        Trouvées (recherche par thème ou angle mort) : proposées / nouvelles / déjà connues / écartées (mal formées ou sans entreprise
        du groupe). Une subvention déjà connue reçoit les entreprises qui n’y étaient pas. Mise à jour : un champ vide est complété
        directement ; un champ déjà rempli qui changerait attend votre accord sur la fiche.
      </p>
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
      {/* Mémoire du groupe (recherches par thème), puis celle de chaque entreprise (angle mort). */}
      {[{ id: null, name: 'Tout le groupe (recherches par thème)' }, ...entreprises].map((e) => {
        const cle = e.id ?? 'groupe'
        const siennes = regles.filter((r) => r.company_id === e.id).sort((a, b) => b.generated_at.localeCompare(a.generated_at))
        const [derniere, ...anciennes] = siennes
        return (
          <div key={cle} className="rounded-lg bg-pierre-50 p-3">
            <p className="font-medium">{e.name}</p>
            {derniere ? (
              <>
                <p className="text-xs text-pierre-500">
                  {moment(derniere.generated_at)}, d’après {derniere.based_on_feedback_count} décision
                  {derniere.based_on_feedback_count > 1 ? 's' : ''}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm">{derniere.summary}</p>
                {anciennes.length > 0 && (
                  <button className="mt-2 text-xs text-pierre-500 underline" onClick={() => setHistorique(historique === cle ? null : cle)}>
                    {historique === cle ? 'Masquer' : `Voir les ${anciennes.length} versions précédentes`}
                  </button>
                )}
                {historique === cle &&
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
