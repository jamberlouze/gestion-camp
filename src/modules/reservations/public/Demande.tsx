import { useEffect, useRef, useState } from 'react'
import { ui } from '@/lib/ui'
import { exerciceDe } from '../calcul'
import {
  aujourdhui,
  erreurs,
  heureLisible,
  nettoyer,
  remplacer,
  REPONSES_VIDES,
  TEXTES,
  visibles,
  type Langue,
  type Reponses,
  type TypeGroupe,
} from '../demande'
import type { Forfait } from '../types'
import { db } from './client'
import { Choix, Entete, Page, Pied, Question } from './commun'
import { dollars, useLangue } from './outils'

// Formulaire public de demande de réservation (/demande), qui remplace le
// Jotform. Les questions et leurs conditions sont dans demande.ts ; le
// Worker refait les mêmes vérifications avant d'enregistrer.

interface Infos {
  heures_normales: Record<string, [string, string]> | null
  prix_repas: Record<string, number>
}

const ORDRE_TYPES: TypeGroupe[] = ['ecole', 'entreprise', 'particulier', 'club_sportif', 'municipalite', 'osbl', 'autre']
const ORDRE_FORFAITS: Forfait[] = ['classe_nature', 'journee_plein_air', 'accueil_groupe', 'location_salle']

export default function Demande() {
  const [langue, changerLangue] = useLangue('fr')
  const t = TEXTES[langue]
  const [rep, setRep] = useState<Reponses>(REPONSES_VIDES)
  const [infos, setInfos] = useState<Infos | null>(null)
  const [cle] = useState(() => crypto.randomUUID())
  const [piege, setPiege] = useState('')
  const [jeton, setJeton] = useState('')
  const [reinit, setReinit] = useState(0)
  const [tente, setTente] = useState(false)
  const [champsServeur, setChampsServeur] = useState<Partial<Record<keyof Reponses, string>>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [numero, setNumero] = useState<string | null>(null)
  const auj = aujourdhui()

  useEffect(() => {
    document.title = t.titre
  }, [t.titre])

  useEffect(() => {
    db()
      .rpc('formulaire_public')
      .then(({ data }) => setInfos((data as Infos | null) ?? null))
  }, [])

  const v = visibles(rep)
  const err = { ...(tente ? erreurs(rep, langue, auj) : {}), ...champsServeur }
  const changer = <K extends keyof Reponses>(cle: K, valeur: Reponses[K]) => {
    setRep((r) => ({ ...r, [cle]: valeur }))
    setChampsServeur((c) => ({ ...c, [cle]: undefined }))
  }
  const texte = (cle: keyof Reponses, type = 'text', extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input
      type={type}
      className={`${ui.champ} ${err[cle] ? 'border-red-400' : ''}`}
      value={rep[cle]}
      onChange={(e) => changer(cle, e.target.value as Reponses[typeof cle])}
      {...extra}
    />
  )

  // Heures normales et prix du repas : réglages et catalogue de l'app.
  const normales = (forfait: string): [string, string] | null => infos?.heures_normales?.[forfait] ?? null
  const heures = (forfait: string) => {
    const h = normales(forfait)
    return h ? { a: heureLisible(h[0], langue), d: heureLisible(h[1], langue) } : { a: '…', d: '…' }
  }
  const prixRepas = (() => {
    const p = infos?.prix_repas ?? {}
    const jour = rep.date || rep.arrivee || auj
    const ex = String(exerciceDe(jour))
    const cles = Object.keys(p).sort()
    const prix = p[ex] ?? (cles.length ? p[cles[cles.length - 1]] : null)
    return prix === null || prix === undefined ? null : dollars(prix, langue)
  })()

  const envoyer = async () => {
    setTente(true)
    setMessage(null)
    const e = erreurs(rep, langue, auj)
    if (Object.keys(e).length) {
      setMessage(t.a_corriger)
      const premier = Object.keys(e)[0]
      document.getElementById(`q-${premier}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (!jeton) {
      setMessage(t.robot)
      return
    }
    setEnvoi(true)
    try {
      const res = await fetch('/api/reservations/demande', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cle, langue, turnstile: jeton, reponses: nettoyer(rep), piege }),
      })
      const corps = (await res.json().catch(() => ({}))) as { numero?: string | null; erreur?: string; champs?: Partial<Record<keyof Reponses, string>> }
      if (res.ok) {
        setNumero(corps.numero ?? '')
        window.scrollTo(0, 0)
        return
      }
      if (res.status === 422 && corps.champs) {
        setChampsServeur(corps.champs)
        setMessage(t.a_corriger)
      } else if (res.status === 403) {
        setMessage(t.robot)
      } else {
        setMessage(t.erreur_envoi)
      }
      // Un jeton Turnstile ne sert qu'une fois.
      setJeton('')
      setReinit((n) => n + 1)
    } catch {
      setMessage(t.erreur_envoi)
    } finally {
      setEnvoi(false)
    }
  }

  if (numero !== null) {
    return (
      <Page>
        <Entete titre={t.titre} langue={langue} changerLangue={changerLangue} />
        <div className={`${ui.carte} space-y-2 p-6 text-center`}>
          <p className="text-xl font-semibold text-foret-800">{t.merci_titre}</p>
          <p className="text-pierre-700">{t.merci}</p>
          {numero && <p className="text-sm text-pierre-500">{remplacer(t.numero, { n: numero })}</p>}
        </div>
        <Pied />
      </Page>
    )
  }

  const carte = `${ui.carte} space-y-5 p-5`
  const q = (cle: keyof Reponses) => ({ id: `q-${cle}`, erreur: err[cle] })

  return (
    <Page>
      <Entete titre={t.titre} langue={langue} changerLangue={changerLangue} />
      <p className="text-sm text-pierre-600">{t.intro}</p>

      <form
        noValidate
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          void envoyer()
        }}
      >
        <section className={carte}>
          <Question libelle={t.type_groupe} requis {...q('type_groupe')}>
            <Choix nom="type_groupe" valeur={rep.type_groupe} changer={(x) => changer('type_groupe', x)} options={ORDRE_TYPES.map((x) => ({ valeur: x, libelle: t.types[x] }))} />
          </Question>
          {v.type_autre && (
            <Question libelle={t.type_autre} requis {...q('type_autre')}>
              {texte('type_autre')}
            </Question>
          )}
          <Question libelle={t.forfait} aide={t.forfait_aide} requis {...q('forfait')}>
            <Choix nom="forfait" valeur={rep.forfait} changer={(x) => changer('forfait', x)} options={ORDRE_FORFAITS.map((x) => ({ valeur: x, libelle: t.forfaits[x] }))} />
          </Question>
        </section>

        {rep.forfait && (
          <section className={carte}>
            <p className="text-sm text-pierre-600">{t.dates_intro}</p>
            {v.date && (
              <Question libelle={rep.forfait === 'location_salle' ? t.date_ls : t.date_jpa} aide={t.date_aide} requis {...q('date')}>
                {texte('date', 'date', { min: auj })}
              </Question>
            )}
            {v.arrivee_depart && (
              <div className="grid gap-5 sm:grid-cols-2">
                <Question libelle={t.arrivee} aide={t.date_aide} requis {...q('arrivee')}>
                  {texte('arrivee', 'date', { min: auj })}
                </Question>
                <Question libelle={t.depart} aide={t.date_aide} requis {...q('depart')}>
                  {texte('depart', 'date', { min: rep.arrivee || auj })}
                </Question>
              </div>
            )}
            {v.heures_ok && (
              <Question libelle={remplacer(t.heures[rep.forfait] ?? '', heures(rep.forfait))} requis {...q('heures_ok')}>
                <Choix
                  nom="heures_ok"
                  valeur={rep.heures_ok}
                  changer={(x) => changer('heures_ok', x)}
                  options={[
                    { valeur: 'oui', libelle: t.oui },
                    { valeur: 'non', libelle: t.heures_non },
                  ]}
                />
              </Question>
            )}
            {v.location && (
              <Question libelle={t.location} requis {...q('location')}>
                <Choix
                  nom="location"
                  valeur={rep.location}
                  changer={(x) => changer('location', x)}
                  options={[
                    { valeur: 'jour', libelle: remplacer(t.location_jour, heures('location_salle_jour')) },
                    { valeur: 'soir', libelle: remplacer(t.location_soir, heures('location_salle_soir')) },
                    { valeur: 'sur_mesure', libelle: t.location_sur_mesure },
                  ]}
                />
              </Question>
            )}
            {v.heures_sur_mesure && (
              <div className="grid gap-5 sm:grid-cols-2">
                <Question libelle={t.heure_arrivee} requis {...q('heure_arrivee')}>
                  {texte('heure_arrivee', 'time', { step: 300 })}
                </Question>
                <Question libelle={t.heure_depart} requis {...q('heure_depart')}>
                  {texte('heure_depart', 'time', { step: 300 })}
                </Question>
              </div>
            )}
          </section>
        )}

        {rep.forfait && (
          <section className={carte}>
            {v.nb_personnes && (
              <Question libelle={t.nb_personnes} aide={t.nombre_aide} requis {...q('nb_personnes')}>
                {texte('nb_personnes', 'number', { min: 0, inputMode: 'numeric', placeholder: 'ex. 23' })}
              </Question>
            )}
            {v.repas && (
              <Question libelle={t.repas} aide={prixRepas ? remplacer(t.repas_aide, { prix: prixRepas }) : undefined} {...q('repas')}>
                <Choix
                  nom="repas"
                  valeur={rep.repas}
                  changer={(x) => changer('repas', x)}
                  options={[
                    { valeur: 'oui', libelle: t.oui },
                    { valeur: 'non', libelle: t.non },
                  ]}
                />
              </Question>
            )}
            {v.scolaire && (
              <>
                <Question libelle={t.nb_eleves} aide={t.nombre_aide} requis {...q('nb_eleves')}>
                  {texte('nb_eleves', 'number', { min: 0, inputMode: 'numeric', placeholder: 'ex. 23' })}
                </Question>
                <Question libelle={t.ages} requis {...q('ages')}>
                  {texte('ages')}
                </Question>
                <Question libelle={t.nb_accompagnateurs} aide={t.nombre_aide} requis {...q('nb_accompagnateurs')}>
                  {texte('nb_accompagnateurs', 'number', { min: 0, inputMode: 'numeric', placeholder: 'ex. 4' })}
                </Question>
              </>
            )}
            <Question libelle={t.langue} requis {...q('langue')}>
              <select className={`${ui.champ} ${err.langue ? 'border-red-400' : ''}`} value={rep.langue} onChange={(e) => changer('langue', e.target.value as Reponses['langue'])}>
                <option value="">{t.choisir}</option>
                {(['fr', 'en', 'fr_en', 'autre'] as const).map((l) => (
                  <option key={l} value={l}>
                    {t.langues[l]}
                  </option>
                ))}
              </select>
            </Question>
          </section>
        )}

        <section className={carte}>
          <Question libelle={t.organisation} requis {...q('organisation')}>
            {texte('organisation', 'text', { autoComplete: 'organization' })}
          </Question>
          <Question libelle={t.adresse_titre} requis id="q-adresse" erreur={err.adresse ?? err.ville ?? err.province ?? err.code_postal}>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="sm:col-span-2">{texte('adresse', 'text', { placeholder: t.adresse, 'aria-label': t.adresse, autoComplete: 'address-line1' })}</div>
              <div className="sm:col-span-2">{texte('adresse2', 'text', { placeholder: t.adresse2, 'aria-label': t.adresse2, autoComplete: 'address-line2' })}</div>
              {texte('ville', 'text', { placeholder: t.ville, 'aria-label': t.ville, autoComplete: 'address-level2' })}
              {texte('province', 'text', { placeholder: t.province, 'aria-label': t.province, autoComplete: 'address-level1' })}
              {texte('code_postal', 'text', { placeholder: t.code_postal, 'aria-label': t.code_postal, autoComplete: 'postal-code' })}
              {texte('pays', 'text', { placeholder: t.pays, 'aria-label': t.pays, autoComplete: 'country-name' })}
            </div>
          </Question>
          <Question libelle={t.description} requis {...q('description')}>
            <textarea rows={3} className={`${ui.champ} ${err.description ? 'border-red-400' : ''}`} value={rep.description} onChange={(e) => changer('description', e.target.value)} />
          </Question>
        </section>

        <section className={carte}>
          <Personne titre={t.resp_titre} t={t} err={err} prefixe="resp" texte={texte} />
          <Question libelle={t.facturation_meme} {...q('facturation_meme')}>
            <Choix
              nom="facturation_meme"
              valeur={rep.facturation_meme}
              changer={(x) => changer('facturation_meme', x)}
              options={[
                { valeur: 'oui', libelle: t.oui },
                { valeur: 'non', libelle: t.non },
              ]}
            />
          </Question>
          {v.facturation && <Personne titre={t.fact_titre} t={t} err={err} prefixe="fact" texte={texte} />}
          {v.courriel_direction && (
            <Question libelle={t.courriel_direction} requis {...q('courriel_direction')}>
              {texte('courriel_direction', 'email', { placeholder: 'exemple@exemple.com' })}
            </Question>
          )}
        </section>

        <section className={carte}>
          <Question libelle={t.commentaires} {...q('commentaires')}>
            <textarea rows={3} className={ui.champ} value={rep.commentaires} onChange={(e) => changer('commentaires', e.target.value)} />
          </Question>
          {/* Champ piège : invisible pour une personne, rempli par les robots. */}
          <input
            type="text"
            name="site_web"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
            value={piege}
            onChange={(e) => setPiege(e.target.value)}
          />
          <Turnstile langue={langue} cle={reinit} changer={setJeton} />
          {message && <p className={ui.erreur}>{message}</p>}
          <button className={`${ui.bouton} w-full sm:w-auto`} disabled={envoi}>
            {envoi ? t.envoi : t.envoyer}
          </button>
        </section>
      </form>
      <Pied />
    </Page>
  )
}

function Personne({
  titre,
  t,
  err,
  prefixe,
  texte,
}: {
  titre: string
  t: (typeof TEXTES)['fr']
  err: Partial<Record<keyof Reponses, string>>
  prefixe: 'resp' | 'fact'
  texte: (cle: keyof Reponses, type?: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => React.ReactNode
}) {
  const c = (s: string) => `${prefixe}_${s}` as keyof Reponses
  return (
    <div className="space-y-3 rounded-lg border border-pierre-200 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-pierre-500">{titre}</p>
      <Question libelle={t.nom_complet} requis id={`q-${c('prenom')}`} erreur={err[c('prenom')] ?? err[c('nom')]}>
        <div className="grid gap-2 sm:grid-cols-2">
          {texte(c('prenom'), 'text', { placeholder: t.prenom, 'aria-label': t.prenom, autoComplete: prefixe === 'resp' ? 'given-name' : 'off' })}
          {texte(c('nom'), 'text', { placeholder: t.nom_famille, 'aria-label': t.nom_famille, autoComplete: prefixe === 'resp' ? 'family-name' : 'off' })}
        </div>
      </Question>
      <Question libelle={t.courriel} requis id={`q-${c('courriel')}`} erreur={err[c('courriel')]}>
        {texte(c('courriel'), 'email', { placeholder: 'exemple@exemple.com', autoComplete: prefixe === 'resp' ? 'email' : 'off' })}
      </Question>
      <Question libelle={t.telephone} requis id={`q-${c('telephone')}`} erreur={err[c('telephone')]}>
        {texte(c('telephone'), 'tel', { autoComplete: prefixe === 'resp' ? 'tel' : 'off' })}
      </Question>
    </div>
  )
}

// ------------------------------------------------------------------
// Cloudflare Turnstile (anti-robot, gratuit)
// ------------------------------------------------------------------
interface ApiTurnstile {
  render: (el: HTMLElement, options: Record<string, unknown>) => string
  remove: (id: string) => void
}

let chargement: Promise<void> | null = null
function chargerTurnstile(): Promise<void> {
  chargement ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      chargement = null
      reject(new Error('Turnstile'))
    }
    document.head.appendChild(s)
  })
  return chargement
}

function Turnstile({ langue, cle, changer }: { langue: Langue; cle: number; changer: (jeton: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const site = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
  useEffect(() => {
    if (!site) return
    let id: string | undefined
    let fini = false
    changer('')
    chargerTurnstile()
      .then(() => {
        const api = (window as unknown as { turnstile?: ApiTurnstile }).turnstile
        if (fini || !ref.current || !api) return
        id = api.render(ref.current, {
          sitekey: site,
          language: langue,
          callback: (jeton: string) => changer(jeton),
          'expired-callback': () => changer(''),
          'error-callback': () => changer(''),
        })
      })
      .catch(() => changer(''))
    return () => {
      fini = true
      if (id) (window as unknown as { turnstile?: ApiTurnstile }).turnstile?.remove(id)
    }
  }, [site, langue, cle, changer])
  return <div ref={ref} className="min-h-16" />
}
