import { useEffect, useState } from 'react'
import { ui } from '@/lib/ui'
import { remplacer } from '../demande'
import { db, messageDe } from './client'
import { Choix, Entete, Page, Pied, Question } from './commun'
import { dateLisible, langueDuGroupe, useLangue } from './outils'
import { TEXTES_PUBLICS } from './textes'

// Fiches participants (/fiches/<jeton>) : une fiche par élève et par
// adulte, remplie par les parents ou les adultes eux-mêmes. Données de
// santé (Loi 25) : envoyées par reservations.ajouter_fiche, jamais relues
// ici, effacées 3 mois après le séjour.

interface Infos {
  numero: string
  nom: string
  date_arrivee: string
  date_depart: string
  langue: string | null
  ouverte: boolean
  compagnie: { nom: string | null; logo: string | null; courriel: string | null; telephone: string | null } | null
}

type OuiNon = 'oui' | 'non' | ''

interface Fiche {
  genre: 'participant' | 'adulte' | ''
  prenom: string
  nom: string
  groupe: string
  matricule: string
  sante: OuiNon
  allergies: string
  problemes_sante: string
  epipen: OuiNon
  diete: string
  diete_autre: string
  medicaments: OuiNon
  courriel: string
  nouvelles: boolean
}

const VIDE: Fiche = {
  genre: '',
  prenom: '',
  nom: '',
  groupe: '',
  matricule: '',
  sante: '',
  allergies: '',
  problemes_sante: '',
  epipen: '',
  diete: '',
  diete_autre: '',
  medicaments: '',
  courriel: '',
  nouvelles: false,
}

const DIETES = ['reguliere', 'vegetarienne', 'sans_porc', 'halal', 'sans_lactose', 'sans_gluten', 'autre']

export default function Fiches() {
  const jeton = window.location.pathname.split('/')[2] ?? ''
  const [infos, setInfos] = useState<Infos | null | undefined>(undefined)
  const [langue, changerLangue] = useLangue(langueDuGroupe(infos?.langue))
  const t = TEXTES_PUBLICS[langue]
  const [f, setF] = useState<Fiche>(VIDE)
  const [tente, setTente] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [recue, setRecue] = useState<string | null>(null)

  useEffect(() => {
    db()
      .rpc('fiche_infos', { p_jeton: jeton })
      .then(({ data }) => setInfos((data as Infos | null) ?? null))
  }, [jeton])

  useEffect(() => {
    document.title = infos ? `${t.fiche_titre} — ${infos.nom}` : t.fiche_titre
  }, [infos, t.fiche_titre])

  if (infos === undefined) return <Page><p className="py-10 text-center text-sm text-pierre-500">{t.chargement}</p></Page>
  if (!infos) {
    return (
      <Page>
        <Entete titre={t.lien_invalide} langue={langue} changerLangue={changerLangue} />
        <p className="text-sm text-pierre-600">{t.lien_invalide_aide}</p>
        <Pied />
      </Page>
    )
  }

  const enfant = f.genre !== 'adulte'
  const manque: Partial<Record<keyof Fiche, string>> = {}
  if (!f.genre) manque.genre = t.obligatoire
  if (!f.prenom.trim()) manque.prenom = t.obligatoire
  if (!f.nom.trim()) manque.nom = t.obligatoire
  if (!f.sante) manque.sante = t.obligatoire
  if (f.sante === 'oui' && !f.allergies.trim() && !f.problemes_sante.trim()) manque.allergies = t.sante_precisez
  if (f.sante === 'oui' && !f.epipen) manque.epipen = t.obligatoire
  if (!f.diete) manque.diete = t.obligatoire
  if (f.diete === 'autre' && !f.diete_autre.trim()) manque.diete_autre = t.obligatoire
  if (!f.medicaments) manque.medicaments = t.obligatoire
  const err = tente ? manque : {}
  const changer = <K extends keyof Fiche>(cle: K, valeur: Fiche[K]) => setF((x) => ({ ...x, [cle]: valeur }))
  const ouiNon = (cle: 'sante' | 'epipen' | 'medicaments') => (
    <Choix
      nom={cle}
      valeur={f[cle]}
      changer={(x) => changer(cle, x)}
      options={[
        { valeur: 'oui' as const, libelle: t.oui },
        { valeur: 'non' as const, libelle: t.non },
      ]}
    />
  )

  const envoyer = async () => {
    setTente(true)
    setErreur(null)
    if (Object.keys(manque).length) {
      setErreur(t.a_corriger)
      return
    }
    setEnvoi(true)
    const { error } = await db().rpc('ajouter_fiche', {
      p_jeton: jeton,
      p_fiche: {
        genre: f.genre,
        prenom: f.prenom,
        nom: f.nom,
        groupe: f.groupe,
        matricule: f.genre === 'participant' ? f.matricule : '',
        sante: f.sante === 'oui',
        allergies: f.allergies,
        problemes_sante: f.problemes_sante,
        epipen: f.sante === 'oui' ? f.epipen === 'oui' : null,
        diete: f.diete,
        diete_autre: f.diete_autre,
        medicaments: f.medicaments === 'oui',
        courriel: f.courriel,
        nouvelles: f.nouvelles && !!f.courriel.trim(),
        langue,
      },
    })
    setEnvoi(false)
    if (error) {
      setErreur(messageDe(error, 'Erreur'))
      return
    }
    setRecue(`${f.prenom.trim()} ${f.nom.trim()}`)
    window.scrollTo(0, 0)
  }

  // Une autre fiche : le groupe, le courriel et le consentement restent
  // (un parent qui a deux enfants dans le groupe).
  const autre = () => {
    setF({ ...VIDE, genre: f.genre, groupe: f.groupe, courriel: f.courriel, nouvelles: f.nouvelles })
    setTente(false)
    setRecue(null)
  }

  const dates =
    infos.date_arrivee === infos.date_depart
      ? dateLisible(infos.date_arrivee, langue)
      : `${dateLisible(infos.date_arrivee, langue)} – ${dateLisible(infos.date_depart, langue)}`

  return (
    <Page>
      <Entete
        surtitre={`${t.fiche_titre} · ${dates}`}
        titre={infos.nom}
        logo={infos.compagnie?.logo}
        nomLogo={infos.compagnie?.nom}
        langue={langue}
        changerLangue={changerLangue}
      />
      {!infos.ouverte ? (
        <div className={`${ui.carte} p-6 text-center text-sm text-pierre-700`}>{t.fiches_fermees}</div>
      ) : recue ? (
        <div className={`${ui.carte} space-y-3 p-6 text-center`}>
          <p className="font-medium text-foret-800">{remplacer(t.fiche_recue, { n: recue })}</p>
          <button className={ui.bouton} onClick={autre}>
            {t.autre_fiche}
          </button>
        </div>
      ) : (
        <form
          noValidate
          className={`${ui.carte} space-y-5 p-5`}
          onSubmit={(e) => {
            e.preventDefault()
            void envoyer()
          }}
        >
          <p className="text-sm text-pierre-600">{t.fiche_intro}</p>
          <Question libelle={t.fiche_pour} requis erreur={err.genre}>
            <Choix
              nom="genre"
              valeur={f.genre}
              changer={(x) => changer('genre', x)}
              options={[
                { valeur: 'participant' as const, libelle: t.pour_participant },
                { valeur: 'adulte' as const, libelle: t.pour_adulte },
              ]}
            />
          </Question>
          <div className="grid gap-5 sm:grid-cols-2">
            <Question libelle={t.prenom} requis erreur={err.prenom}>
              <input className={ui.champ} value={f.prenom} onChange={(e) => changer('prenom', e.target.value)} />
            </Question>
            <Question libelle={t.nom} requis erreur={err.nom}>
              <input className={ui.champ} value={f.nom} onChange={(e) => changer('nom', e.target.value)} />
            </Question>
            <Question libelle={t.groupe} aide={t.groupe_aide}>
              <input className={ui.champ} value={f.groupe} onChange={(e) => changer('groupe', e.target.value)} />
            </Question>
            {f.genre === 'participant' && (
              <Question libelle={t.matricule} aide={t.matricule_aide}>
                <input className={ui.champ} value={f.matricule} onChange={(e) => changer('matricule', e.target.value)} />
              </Question>
            )}
          </div>
          <Question libelle={enfant ? t.sante_enfant : t.sante_adulte} requis erreur={err.sante}>
            {ouiNon('sante')}
          </Question>
          {f.sante === 'oui' && (
            <div className="space-y-4 rounded-lg border border-pierre-200 p-3">
              <Question libelle={t.allergies} erreur={err.allergies}>
                <textarea rows={2} className={ui.champ} value={f.allergies} onChange={(e) => changer('allergies', e.target.value)} />
              </Question>
              <Question libelle={t.problemes}>
                <textarea rows={2} className={ui.champ} value={f.problemes_sante} onChange={(e) => changer('problemes_sante', e.target.value)} />
              </Question>
              <Question libelle={enfant ? t.epipen_enfant : t.epipen_adulte} requis erreur={err.epipen}>
                {ouiNon('epipen')}
              </Question>
            </div>
          )}
          <Question libelle={enfant ? t.diete_enfant : t.diete_adulte} requis erreur={err.diete}>
            <select className={ui.champ} value={f.diete} onChange={(e) => changer('diete', e.target.value)}>
              <option value="">—</option>
              {DIETES.map((d) => (
                <option key={d} value={d}>
                  {t.dietes[d]}
                </option>
              ))}
            </select>
          </Question>
          {f.diete === 'autre' && (
            <Question libelle={t.diete_autre} requis erreur={err.diete_autre}>
              <input className={ui.champ} value={f.diete_autre} onChange={(e) => changer('diete_autre', e.target.value)} />
            </Question>
          )}
          <Question libelle={enfant ? t.medicaments_enfant : t.medicaments_adulte} requis erreur={err.medicaments}>
            {ouiNon('medicaments')}
          </Question>
          <Question libelle={t.courriel} aide={t.courriel_aide}>
            <input type="email" className={ui.champ} value={f.courriel} autoComplete="email" onChange={(e) => changer('courriel', e.target.value)} />
            <label className="mt-2 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={f.nouvelles} onChange={(e) => changer('nouvelles', e.target.checked)} />
              <span>{t.nouvelles}</span>
            </label>
          </Question>
          {erreur && <p className={ui.erreur}>{erreur}</p>}
          <button className={`${ui.bouton} w-full sm:w-auto`} disabled={envoi}>
            {t.envoyer_fiche}
          </button>
          <p className="text-xs text-pierre-500">{t.confidentialite}</p>
        </form>
      )}
      <Pied compagnie={infos.compagnie} />
    </Page>
  )
}
