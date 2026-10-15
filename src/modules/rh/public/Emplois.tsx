import { useEffect, useMemo, useState } from 'react'
import { ChampPiege, Cases, Choix, Entete, fusionnerErreurs, Page, Question } from '@/lib/public/habillage'
import { useLangue } from '@/lib/public/langue'
import { Turnstile } from '@/lib/public/Turnstile'
import { ui } from '@/lib/ui'
import {
  CITOYENNETES,
  CONNU_PAR,
  COURRIEL_EMPLOIS,
  erreurs,
  MAX_POSTES,
  NIVEAUX_ETUDES,
  NIVEAUX_LANGUE,
  nettoyer,
  PAGE_EMPLOIS,
  postesOfferts,
  remplacer,
  REPONSES_VIDES,
  TEXTES,
  visibles,
  type Champ,
  type Offre,
  type Reponses,
} from '../candidature'
import { envoyer, lire } from './api'
import { ChampFichier, Message, PiedEmplois } from './commun'

// Formulaire public de candidature (/emplois), qui remplace « Dépôt de
// candidatures » d'Airtable. Questions, conditions et vérifications :
// candidature.ts ; le Worker refait les mêmes vérifications, dépose le CV
// dans le seau privé, puis enregistre (rh.recevoir_candidature).

export default function Emplois() {
  const [langue, changerLangue] = useLangue('fr')
  const t = TEXTES[langue]
  const [offre, setOffre] = useState<Offre | null | 'erreur'>(null)
  const [rep, setRep] = useState<Reponses>(REPONSES_VIDES)
  const [cv, setCv] = useState<File | null>(null)
  const [erreurCv, setErreurCv] = useState<string | null>(null)
  const [cle] = useState(() => crypto.randomUUID())
  const [piege, setPiege] = useState('')
  const [jeton, setJeton] = useState('')
  const [reinit, setReinit] = useState(0)
  const [tente, setTente] = useState(false)
  const [champsServeur, setChampsServeur] = useState<Partial<Record<Champ, string>>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [fini, setFini] = useState(false)

  useEffect(() => {
    document.title = t.titre
  }, [t.titre])

  useEffect(() => {
    lire<Offre>('/api/rh/emplois').then((r) => setOffre(r.ok ? r.donnees : 'erreur'))
  }, [])

  const postes = useMemo(() => (offre && offre !== 'erreur' ? postesOfferts(offre, rep.saison_ids) : []), [offre, rep.saison_ids])

  if (offre === null) return <Message titre="…" />
  if (offre === 'erreur') return <Message titre={t.titre}>{t.chargement_impossible}</Message>

  const cvInfo = cv ? { nom: cv.name, taille: cv.size } : null
  const err = fusionnerErreurs<Champ>(tente ? erreurs(rep, langue, offre, cvInfo) : {}, champsServeur, { cv: erreurCv ?? undefined })
  const changer = <K extends keyof Reponses>(cle: K, valeur: Reponses[K]) => {
    setRep((r) => ({ ...r, [cle]: valeur }))
    setChampsServeur((c) => ({ ...c, [cle]: undefined }))
  }
  const q = (cle: Champ) => ({ id: `q-${cle}`, erreur: err[cle] })
  const texte = (cle: keyof Reponses, type = 'text', extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input
      type={type}
      className={`${ui.champ} ${err[cle] ? 'border-red-400' : ''}`}
      value={rep[cle] as string}
      onChange={(e) => changer(cle, e.target.value as Reponses[typeof cle])}
      {...extra}
    />
  )
  const choix = (cle: keyof Reponses, liste: { id: string; fr: string; en: string }[]) => (
    <Choix nom={cle} valeur={rep[cle] as string} changer={(x) => changer(cle, x as Reponses[typeof cle])} options={liste.map((o) => ({ valeur: o.id, libelle: o[langue] }))} />
  )
  const nomCompagnie = new Map(offre.compagnies.map((c) => [c.id, c.nom]))

  const envoyerCandidature = async () => {
    setTente(true)
    setMessage(null)
    const e = erreurs(rep, langue, offre, cvInfo)
    if (Object.keys(e).length || erreurCv) {
      setMessage(t.a_corriger)
      document.getElementById(`q-${Object.keys(e)[0] ?? 'cv'}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (!jeton) {
      setMessage(t.robot)
      return
    }
    setEnvoi(true)
    const fd = new FormData()
    fd.set('donnees', JSON.stringify({ cle, langue, turnstile: jeton, piege, reponses: nettoyer(rep) }))
    fd.set('cv', cv!)
    const r = await envoyer('/api/rh/candidature', fd)
    setEnvoi(false)
    if (r.statut === 200) {
      setFini(true)
      window.scrollTo(0, 0)
      return
    }
    if (r.statut === 422 && r.corps.champs) {
      setChampsServeur(r.corps.champs as Partial<Record<Champ, string>>)
      setMessage(t.a_corriger)
    } else setMessage(r.statut === 403 ? t.robot : t.erreur_envoi)
    // Un jeton Turnstile ne sert qu'une fois.
    setJeton('')
    setReinit((n) => n + 1)
  }

  if (fini) {
    return (
      <Page>
        <Entete titre={t.titre} logo="/logos/logo-gbpa.png" langue={langue} changerLangue={changerLangue} />
        <div className={`${ui.carte} space-y-2 p-6 text-center`}>
          <p className="text-xl font-semibold text-foret-800">{t.merci_titre}</p>
          <p className="text-pierre-700">{t.merci}</p>
        </div>
        <PiedEmplois />
      </Page>
    )
  }

  const carte = `${ui.carte} space-y-5 p-5`
  const titreSection = (x: string) => <h2 className="text-base font-semibold text-pierre-900">{x}</h2>

  return (
    <Page>
      <Entete titre={t.titre} logo="/logos/logo-gbpa.png" nomLogo="Base de plein air Mont-Tremblant" langue={langue} changerLangue={changerLangue} />
      <p className="text-sm text-pierre-600">{remplacer(t.intro, { compagnies: offre.compagnies.map((c) => c.nom).join(', ') })}</p>

      {offre.saisons.length === 0 ? (
        <div className={`${ui.carte} p-6 text-center text-pierre-700`}>{t.aucune_saison}</div>
      ) : (
        <form
          noValidate
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            void envoyerCandidature()
          }}
        >
          <section className={carte}>
            {titreSection(t.section_toi)}
            <div className="grid gap-5 sm:grid-cols-2">
              <Question libelle={t.prenom} requis {...q('prenom')}>
                {texte('prenom', 'text', { autoComplete: 'given-name' })}
              </Question>
              <Question libelle={t.nom_famille} requis {...q('nom_famille')}>
                {texte('nom_famille', 'text', { autoComplete: 'family-name' })}
              </Question>
              <Question libelle={t.courriel} requis {...q('courriel')}>
                {texte('courriel', 'email', { autoComplete: 'email', inputMode: 'email' })}
              </Question>
              <Question libelle={t.telephone} requis {...q('telephone')}>
                {texte('telephone', 'tel', { autoComplete: 'tel' })}
              </Question>
            </div>
            <Question libelle={t.niveau_etudes} requis {...q('niveau_etudes')}>
              {choix('niveau_etudes', NIVEAUX_ETUDES)}
            </Question>
            <Question libelle={t.citoyennete} requis {...q('citoyennete')}>
              {choix('citoyennete', CITOYENNETES)}
            </Question>
          </section>

          <section className={carte}>
            {titreSection(t.section_motivation)}
            <Question libelle={t.motivation} requis {...q('motivation')}>
              <textarea rows={5} className={`${ui.champ} ${err.motivation ? 'border-red-400' : ''}`} value={rep.motivation} onChange={(e) => changer('motivation', e.target.value)} />
            </Question>
            <Question libelle={t.cv} aide={t.cv_aide} requis {...q('cv')}>
              <ChampFichier
                fichier={cv}
                sorte="cv"
                langue={langue}
                changer={(f, m) => {
                  setCv(f)
                  setErreurCv(m)
                  setChampsServeur((c) => ({ ...c, cv: undefined }))
                }}
              />
            </Question>
          </section>

          <section className={carte}>
            {titreSection(t.section_postes)}
            <Question libelle={t.saisons} requis {...q('saison_ids')}>
              <Cases
                options={offre.saisons.map((s) => ({ valeur: s.id, libelle: s.nom }))}
                valeur={rep.saison_ids}
                changer={(ids) => {
                  // Les postes qui ne sont plus offerts pour ces saisons tombent.
                  const offerts = new Set(postesOfferts(offre, ids).map((p) => p.id))
                  setRep((r) => ({ ...r, saison_ids: ids, poste_ids: r.poste_ids.filter((id) => offerts.has(id)) }))
                  setChampsServeur((c) => ({ ...c, saison_ids: undefined, poste_ids: undefined }))
                }}
              />
            </Question>
            <Question
              libelle={t.postes}
              aide={
                <>
                  {t.postes_aide}{' '}
                  <a href={PAGE_EMPLOIS} target="_blank" rel="noreferrer" className="text-foret-700 underline">
                    {t.postes_lien}
                  </a>
                </>
              }
              requis
              {...q('poste_ids')}
            >
              {rep.saison_ids.length === 0 ? (
                <p className="text-sm text-pierre-500">{t.postes_saison_dabord}</p>
              ) : (
                <div className="space-y-3">
                  {[...new Set(postes.map((p) => p.compagnie))].map((cid) => (
                    <div key={cid}>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-pierre-500">{nomCompagnie.get(cid)}</p>
                      <Cases
                        bloquer={rep.poste_ids.length >= MAX_POSTES}
                        options={postes
                          .filter((p) => p.compagnie === cid)
                          .map((p) => ({
                            valeur: p.id,
                            libelle: (
                              <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                                <span>{p.nom}</span>
                                {p.description_url && (
                                  <a href={p.description_url} target="_blank" rel="noreferrer" className="text-xs text-foret-700 underline" onClick={(e) => e.stopPropagation()}>
                                    {t.description}
                                  </a>
                                )}
                              </span>
                            ),
                          }))}
                        valeur={rep.poste_ids}
                        changer={(ids) => changer('poste_ids', ids.slice(0, MAX_POSTES))}
                      />
                    </div>
                  ))}
                  <p className={`text-xs ${rep.poste_ids.length >= MAX_POSTES ? 'font-medium text-foret-700' : 'text-pierre-500'}`}>
                    {remplacer(t.postes_compte, { n: rep.poste_ids.length })}
                  </p>
                </div>
              )}
            </Question>
            <Question libelle={t.date_debut} requis {...q('date_debut')}>
              {texte('date_debut', 'date')}
            </Question>
            <Question libelle={t.empechements} {...q('empechements')}>
              <textarea rows={2} className={ui.champ} value={rep.empechements} onChange={(e) => changer('empechements', e.target.value)} />
            </Question>
            <div className="grid gap-5 sm:grid-cols-2">
              <Question libelle={t.francais} requis {...q('francais')}>
                {choix('francais', NIVEAUX_LANGUE)}
              </Question>
              <Question libelle={t.anglais} requis {...q('anglais')}>
                {choix('anglais', NIVEAUX_LANGUE)}
              </Question>
            </div>
          </section>

          <section className={carte}>
            {titreSection(t.section_autres)}
            <Question libelle={t.connu_par} {...q('connu_par')}>
              <select className={ui.champ} value={rep.connu_par} onChange={(e) => changer('connu_par', e.target.value)}>
                <option value="">{t.choisir}</option>
                {CONNU_PAR.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o[langue]}
                  </option>
                ))}
              </select>
            </Question>
            {visibles(rep).refere_par && (
              <Question libelle={t.refere_par} {...q('refere_par')}>
                {texte('refere_par')}
              </Question>
            )}
            <Question libelle={t.autre} {...q('autre')}>
              <textarea rows={3} className={ui.champ} value={rep.autre} onChange={(e) => changer('autre', e.target.value)} />
            </Question>
          </section>

          <section className={carte}>
            <div className="rounded-lg bg-pierre-50 p-3 text-xs leading-relaxed text-pierre-600">
              <p className="mb-1 font-semibold text-pierre-700">🔒 {t.confidentialite_titre}</p>
              {t.confidentialite.split('{courriel}')[0]}
              <a className="underline" href={`mailto:${COURRIEL_EMPLOIS}`}>
                {COURRIEL_EMPLOIS}
              </a>
              {t.confidentialite.split('{courriel}')[1]}
            </div>
            <ChampPiege valeur={piege} changer={setPiege} />
            <Turnstile langue={langue} cle={reinit} changer={setJeton} />
            {message && <p className={ui.erreur}>{message}</p>}
            <button className={`${ui.bouton} w-full sm:w-auto`} disabled={envoi}>
              {envoi ? t.envoi : t.envoyer}
            </button>
          </section>
        </form>
      )}
      <PiedEmplois />
    </Page>
  )
}
