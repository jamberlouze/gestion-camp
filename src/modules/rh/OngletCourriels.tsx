import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { AvisEnvoi, CarteCourriel, LigneCourriel } from './CartesCourriels'
import { Section } from './commun'
import { useRh } from './contexte'
import { CHAMPS_COURRIELS, GENRES_COURRIEL, type CompagnieRh, type GenreCourriel, type ModeleCourriel } from './courriels'
import {
  preparerRappels,
  urlConnexionBoite,
  useCompagniesRh,
  useCourriels,
  useDeconnecterBoite,
  useEnregistrerCompagnieRh,
  useEnregistrerModeleCourriel,
  useEnregistrerReglage,
  useEnvoyerCourriels,
  useEtatBoites,
  useModeEnvoi,
  useModelesCourriels,
  useReglagesRh,
  useRetirerModeleCourriel,
  useTesterBoite,
} from './donnees'
import { horodatage } from './outils'
import type { EtatBoite } from './types'

// Onglet Courriels du module RH (plan-rh.md §5) : courriels à envoyer (en
// lot), envoyés, boîtes d'envoi des compagnies (adresse, état de la
// connexion, essai), modèles et réglages (rappel, résumé quotidien).

const VUES = [
  { id: 'a_envoyer', nom: 'À envoyer' },
  { id: 'envoyes', nom: 'Envoyés' },
  { id: 'compagnies', nom: 'Compagnies et boîtes' },
  { id: 'modeles', nom: 'Modèles' },
  { id: 'reglages', nom: 'Réglages' },
] as const
type Vue = (typeof VUES)[number]['id']

export function OngletCourriels() {
  const [params, setParams] = useSearchParams()
  const vue = (VUES.find((v) => v.id === params.get('vue'))?.id ?? 'a_envoyer') as Vue
  const aEnvoyer = useCourriels({ statut: 'prepare' })
  const n = aEnvoyer.data?.length ?? 0
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {VUES.map((v) => (
          <button
            key={v.id}
            className={`rounded-full px-3 py-1 text-sm ${vue === v.id ? 'bg-foret-700 text-white' : 'bg-pierre-100 text-pierre-700 hover:bg-pierre-200'}`}
            onClick={() => setParams(v.id === 'a_envoyer' ? {} : { vue: v.id })}
          >
            {v.nom}
            {v.id === 'a_envoyer' && n > 0 && ` (${n})`}
          </button>
        ))}
      </div>
      {vue === 'a_envoyer' && <AEnvoyer />}
      {vue === 'envoyes' && <Envoyes />}
      {vue === 'compagnies' && <Compagnies />}
      {vue === 'modeles' && <Modeles />}
      {vue === 'reglages' && <Reglages />}
    </div>
  )
}

// ------------------------------------------------------------
// À envoyer
// ------------------------------------------------------------
function AEnvoyer() {
  const { ecriture } = useRh()
  const courriels = useCourriels({ statut: 'prepare' })
  const envoyer = useEnvoyerCourriels()
  const [coches, setCoches] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<string | null>(null)
  const liste = courriels.data ?? []
  const choisis = liste.filter((c) => coches.has(c.id))

  const envoyerCoches = async () => {
    setMessage(null)
    const ok = await confirmer({
      titre: `Envoyer ${choisis.length} courriel${choisis.length > 1 ? 's' : ''} ?`,
      message: 'Chacun part de la boîte de sa compagnie, tel qu’il est enregistré.',
      libelleOk: 'Envoyer',
    })
    if (!ok) return
    try {
      const { resultats } = await envoyer.mutateAsync(choisis.map((c) => c.id))
      const rates = resultats.filter((r) => !r.ok)
      setMessage(rates.length ? `${resultats.length - rates.length} envoyé(s) ; ${rates.length} refusé(s) : voir l’erreur sur chacun.` : `${resultats.length} envoyé(s).`)
      setCoches(new Set(rates.map((r) => r.id)))
    } catch (e) {
      setMessage(messageErreur(e))
    }
  }

  const rappels = async () => {
    setMessage(null)
    try {
      const r = await preparerRappels()
      setMessage(r.prepares ? `${r.prepares} courriel(s) préparé(s).` : 'Aucun rappel dû pour l’instant.')
      void courriels.refetch()
    } catch (e) {
      setMessage(messageErreur(e))
    }
  }

  return (
    <Section
      titre={`À envoyer${liste.length ? ` (${liste.length})` : ''}`}
      action={
        ecriture && (
          <button className="text-xs text-foret-700 underline" onClick={rappels}>
            Préparer les rappels dus
          </button>
        )
      }
    >
      <div className="space-y-2">
        <AvisEnvoi />
        {message && <p className="text-sm text-pierre-600">{message}</p>}
        {courriels.error && <p className={ui.erreur}>{messageErreur(courriels.error)}</p>}
        {!liste.length && !courriels.isLoading && (
          <p className="text-sm text-pierre-500">
            Rien à envoyer. Un courriel se prépare quand on choisit un statut de candidature, qu’on prépare la bienvenue d’une embauche ou des intentions de retour ; les rappels de
            dossier se préparent seuls.
          </p>
        )}
        {ecriture && liste.length > 1 && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-foret-700"
                checked={choisis.length === liste.length}
                onChange={(e) => setCoches(e.target.checked ? new Set(liste.map((c) => c.id)) : new Set())}
              />
              Tout cocher
            </label>
            <button className={ui.bouton} disabled={!choisis.length || envoyer.isPending} onClick={envoyerCoches}>
              {envoyer.isPending ? 'Envoi…' : `Envoyer les ${choisis.length || ''} cochés`.replace('  ', ' ')}
            </button>
          </div>
        )}
        {liste.map((c) => (
          <CarteCourriel
            key={c.id}
            c={c}
            avecPersonne
            coche={liste.length > 1 ? { valeur: coches.has(c.id), changer: (v) => setCoches((s) => (v ? new Set(s).add(c.id) : new Set([...s].filter((x) => x !== c.id)))) } : undefined}
          />
        ))}
      </div>
    </Section>
  )
}

function Envoyes() {
  const courriels = useCourriels({ traites: 200 })
  return (
    <Section titre="Derniers envoyés ou annulés">
      {courriels.error && <p className={ui.erreur}>{messageErreur(courriels.error)}</p>}
      {courriels.data?.length ? (
        <ul className="divide-y divide-pierre-100">
          {courriels.data.map((c) => (
            <LigneCourriel key={c.id} c={c} avecPersonne />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-pierre-500">{courriels.isLoading ? 'Chargement…' : 'Aucun courriel envoyé.'}</p>
      )}
    </Section>
  )
}

// ------------------------------------------------------------
// Compagnies : boîte d'envoi et réglages
// ------------------------------------------------------------
const ETATS: Record<EtatBoite['etat'], { nom: string; classe: string }> = {
  connectee: { nom: 'Connectée', classe: 'bg-foret-50 text-foret-800 ring-foret-200' },
  non_connectee: { nom: 'Pas connectée', classe: 'bg-pierre-100 text-pierre-700 ring-pierre-200' },
  a_reconnecter: { nom: 'À reconnecter', classe: 'bg-amber-50 text-amber-800 ring-amber-200' },
  erreur: { nom: 'Erreur', classe: 'bg-red-50 text-red-800 ring-red-200' },
}

function Compagnies() {
  const { compagnies } = useRh()
  const [params] = useSearchParams()
  const boites = useEtatBoites()
  const rh = useCompagniesRh()
  const retour = params.get('boite')
  const visibles = compagnies.filter((c) => c.actif || rh.data?.some((x) => x.entreprise_id === c.id))
  return (
    <div className="space-y-4">
      {retour === 'ok' && <p className="rounded-lg border border-foret-200 bg-foret-50 px-3 py-2 text-sm text-foret-900">Boîte connectée ✓ Envoyez-vous un essai pour confirmer.</p>}
      {retour === 'erreur' && <p className={ui.erreur}>{params.get('message') ?? 'La connexion n’a pas fonctionné.'}</p>}
      <AvisEnvoi />
      <p className="text-sm text-pierre-600">
        Chaque compagnie écrit de sa boîte : le courriel d’un candidat part de la compagnie qui traite sa candidature (sinon celle de son premier poste), celui d’une embauche, de la
        compagnie de l’embauche. Changer l’adresse d’envoi demande de reconnecter la boîte : l’état le montre tout de suite.
      </p>
      {(boites.error || rh.error) && <p className={ui.erreur}>{messageErreur(boites.error ?? rh.error)}</p>}
      <div className="grid gap-4 xl:grid-cols-2">
        {rh.data &&
          visibles.map((c) => (
            <CarteCompagnie
              key={c.id}
              id={c.id}
              nom={c.nom}
              rh={rh.data.find((x) => x.entreprise_id === c.id) ?? null}
              boite={boites.data?.find((b) => b.entreprise_id === c.id) ?? null}
              mise={params.get('compagnie') === c.id}
            />
          ))}
      </div>
    </div>
  )
}

const CHAMPS_COMPAGNIE: { cle: keyof CompagnieRh; nom: string; aide?: string; long?: boolean }[] = [
  { cle: 'nom_expediteur', nom: 'Nom de l’expéditeur', aide: 'Affiché comme expéditeur ; champ {{compagnie}} des modèles.' },
  { cle: 'signature', nom: 'Signature des courriels', long: true, aide: '{{signature}} des modèles.' },
  { cle: 'lien_rendez_vous', nom: 'Lien de prise de rendez-vous', aide: 'Entrevues : {{lien_rendez_vous}}.' },
  { cle: 'attrait', nom: 'Ce qui attire', aide: '« notre camp de vacances »… : {{attrait}}.' },
  { cle: 'raison_sociale', nom: 'Raison sociale (contrats)' },
  { cle: 'nom_court', nom: 'Nom court (contrats)', aide: '« Ci-après appelé : … »' },
  { cle: 'adresse', nom: 'Adresse (contrats)', long: true },
  { cle: 'telephone', nom: 'Téléphone (contrats)' },
]

function CarteCompagnie({ id, nom, rh, boite, mise }: { id: string; nom: string; rh: CompagnieRh | null; boite: EtatBoite | null; mise: boolean }) {
  const { ecriture } = useRh()
  const enregistrer = useEnregistrerCompagnieRh()
  const tester = useTesterBoite()
  const deconnecter = useDeconnecterBoite()
  const mode = useModeEnvoi(ecriture)
  const [message, setMessage] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  const etat = boite ? ETATS[boite.etat] : null
  const changer = (champs: Partial<CompagnieRh>) => {
    setMessage(null)
    enregistrer.mutate({ entreprise_id: id, ...champs }, { onError: (e) => setMessage(messageErreur(e)) })
  }

  const connecter = async () => {
    setMessage(null)
    setOccupe(true)
    try {
      window.location.href = await urlConnexionBoite(id)
    } catch (e) {
      setMessage(messageErreur(e))
      setOccupe(false)
    }
  }

  const essai = () => {
    setMessage(null)
    tester.mutate(id, {
      onSuccess: (r) => setMessage(r.mode === 'mailpit' ? 'Essai envoyé dans Mailpit (DEV).' : 'Essai envoyé : vérifiez votre boîte de réception.'),
      onError: (e) => setMessage(messageErreur(e)),
    })
  }

  return (
    <section className={`${ui.carte} space-y-3 p-4 ${mise ? 'ring-2 ring-foret-600' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{nom}</h2>
        {etat && mode.data !== 'mailpit' && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${etat.classe}`}>{etat.nom}</span>}
      </div>
      <label className="block text-sm">
        <span className={ui.etiquette}>Adresse d’envoi</span>
        <ChampTexte
          className={ui.champ}
          type="email"
          valeur={rh?.adresse_envoi ?? ''}
          placeholder="ex. info@compagnie.ca"
          disabled={!ecriture}
          enregistrer={(v) => changer({ adresse_envoi: v.trim().toLowerCase() || null })}
        />
      </label>
      {boite && (
        <div className="space-y-1 text-xs text-pierre-600">
          {boite.adresse_connectee ? (
            <p>
              Boîte autorisée : {boite.adresse_connectee}
              {boite.connecte_le && ` · le ${horodatage(boite.connecte_le)}`}
              {boite.connecte_par_nom && ` par ${boite.connecte_par_nom}`}
            </p>
          ) : (
            <p>Aucune boîte autorisée : les courriels de cette compagnie ne peuvent pas partir de Gmail.</p>
          )}
          {boite.etat === 'a_reconnecter' && <p className="text-amber-800">L’adresse d’envoi a changé : reconnectez la boîte {rh?.adresse_envoi}.</p>}
          {boite.dernier_envoi_le && <p>Dernier envoi réussi : {horodatage(boite.dernier_envoi_le)}</p>}
          {boite.erreur && (
            <p className="text-red-700">
              Erreur{boite.erreur_le ? ` (${horodatage(boite.erreur_le)})` : ''} : {boite.erreur}
            </p>
          )}
        </div>
      )}
      {ecriture && (
        <div className="flex flex-wrap gap-2">
          <button className={boite?.etat === 'connectee' ? ui.boutonSecondaire : ui.bouton} disabled={occupe || !rh?.adresse_envoi} onClick={connecter}>
            {boite?.adresse_connectee ? 'Reconnecter la boîte' : 'Connecter la boîte'}
          </button>
          <button className={ui.boutonSecondaire} disabled={tester.isPending || !rh?.adresse_envoi} onClick={essai}>
            {tester.isPending ? 'Envoi…' : 'M’envoyer un essai'}
          </button>
          {boite?.adresse_connectee && (
            <button
              className="text-sm text-red-700 underline"
              onClick={async () => {
                if (await confirmer({ titre: `Déconnecter ${boite.adresse_connectee} ?`, message: 'Les courriels de cette compagnie ne partiront plus jusqu’à la prochaine connexion.', libelleOk: 'Déconnecter', danger: true }))
                  deconnecter.mutate(id)
              }}
            >
              Déconnecter
            </button>
          )}
        </div>
      )}
      {message && <p className="text-sm text-pierre-700">{message}</p>}
      <details className="text-sm">
        <summary className="cursor-pointer text-pierre-600">Signature, rendez-vous et coordonnées des contrats</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {CHAMPS_COMPAGNIE.map((f) => (
            <label key={f.cle} className={`block ${f.long ? 'sm:col-span-2' : ''}`}>
              <span className={ui.etiquette}>{f.nom}</span>
              {f.long ? (
                <ZoneEnregistree valeur={(rh?.[f.cle] as string | null) ?? ''} disabled={!ecriture} enregistrer={(v) => changer({ [f.cle]: v.trim() || null })} />
              ) : (
                <ChampTexte className={ui.champ} valeur={(rh?.[f.cle] as string | null) ?? ''} disabled={!ecriture} enregistrer={(v) => changer({ [f.cle]: v.trim() || null })} />
              )}
              {f.aide && <span className="mt-0.5 block text-xs text-pierre-500">{f.aide}</span>}
            </label>
          ))}
        </div>
      </details>
    </section>
  )
}

/** Zone de texte enregistrée en quittant le champ, seulement si elle a changé. */
function ZoneEnregistree({ valeur, enregistrer, disabled }: { valeur: string; enregistrer: (v: string) => void; disabled?: boolean }) {
  const [texte, setTexte] = useState(valeur)
  return (
    <textarea
      className={`${ui.champ} min-h-24`}
      value={texte}
      disabled={disabled}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={() => texte !== valeur && enregistrer(texte)}
    />
  )
}

// ------------------------------------------------------------
// Modèles
// ------------------------------------------------------------
const MODES: Record<ModeleCourriel['mode'], string> = { approuver: 'À relire puis envoyer', automatique: 'Envoyé seul', desactive: 'Désactivé' }
/** Genres qui peuvent partir seuls (préparés par le Worker). */
const AUTOMATIQUES: GenreCourriel[] = ['accuse', 'rappel_dossier', 'resume']

function Modeles() {
  const { compagnies } = useRh()
  const modeles = useModelesCourriels()
  const [genre, setGenre] = useState<Exclude<GenreCourriel, 'autre'>>('accuse')
  const [compagnie, setCompagnie] = useState<string | null>(null)
  const liste = modeles.data ?? []
  const commun = liste.find((m) => m.genre === genre && !m.entreprise_id)
  const propre = compagnie ? liste.find((m) => m.genre === genre && m.entreprise_id === compagnie) : undefined
  const info = GENRES_COURRIEL.find((g) => g.id === genre)!
  return (
    <Section titre="Modèles des courriels">
      {modeles.error && <p className={ui.erreur}>{messageErreur(modeles.error)}</p>}
      <div className="grid gap-4 text-sm lg:grid-cols-[16rem_minmax(0,1fr)]">
        <ul className="space-y-1">
          {GENRES_COURRIEL.map((g) => {
            const mode = liste.find((m) => m.genre === g.id && !m.entreprise_id)?.mode
            const propres = liste.filter((m) => m.genre === g.id && m.entreprise_id).length
            return (
              <li key={g.id}>
                <button className={`w-full rounded-md px-2 py-1.5 text-left ${genre === g.id ? 'bg-foret-50 font-medium text-foret-900' : 'hover:bg-pierre-50'}`} onClick={() => setGenre(g.id)}>
                  {g.nom}
                  {mode && (
                    <span className={`block text-xs ${mode === 'desactive' ? 'text-pierre-400' : mode === 'automatique' ? 'text-foret-700' : 'text-amber-700'}`}>
                      {MODES[mode]}
                      {propres > 0 && ` · ${propres} propre${propres > 1 ? 's' : ''} à une compagnie`}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        <div className="space-y-3">
          <p className="text-pierre-600">
            <span className="font-medium text-pierre-900">Quand :</span> {info.aide}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-pierre-600">Modèle :</span>
            <button className={`rounded-full px-2.5 py-0.5 text-xs ${!compagnie ? 'bg-foret-700 text-white' : 'bg-pierre-100 text-pierre-700'}`} onClick={() => setCompagnie(null)}>
              Toutes les compagnies
            </button>
            {compagnies
              .filter((c) => c.actif)
              .map((c) => (
                <button
                  key={c.id}
                  className={`rounded-full px-2.5 py-0.5 text-xs ${compagnie === c.id ? 'bg-foret-700 text-white' : 'bg-pierre-100 text-pierre-700'}`}
                  onClick={() => setCompagnie(c.id)}
                >
                  {c.abreviation || c.nom}
                  {liste.some((m) => m.genre === genre && m.entreprise_id === c.id) && ' ●'}
                </button>
              ))}
          </div>
          {!compagnie && commun && <EditeurModele key={commun.id} m={commun} />}
          {compagnie && propre && <EditeurModele key={propre.id} m={propre} />}
          {compagnie && !propre && <SansModelePropre genre={genre} compagnie={compagnie} commun={commun} />}
        </div>
      </div>
      <details className="mt-4 text-xs text-pierre-600">
        <summary className="cursor-pointer">Champs des modèles</summary>
        <p className="mt-2">
          <code>{'{{champ}}'}</code> est remplacé par sa valeur ; <code>{'{{#si champ}}'}</code> … <code>{'{{/si}}'}</code> (chacun sur sa ligne) n’écrit le texte que si le champ
          n’est pas vide ; <code>**gras**</code>, <code>[texte](https://…)</code>, puces « - ». Un champ vide devient <code>[champ ?]</code> : le courriel ne part pas tant qu’on ne l’a
          pas corrigé.
        </p>
        <ul className="mt-2 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
          {CHAMPS_COURRIELS.map(([cle, aide]) => (
            <li key={cle}>
              <code>{`{{${cle}}}`}</code> — {aide}
            </li>
          ))}
          <li>
            <code>{'{{liste}}'}</code> — Nouveautés (résumé quotidien)
          </li>
        </ul>
      </details>
    </Section>
  )
}

function SansModelePropre({ genre, compagnie, commun }: { genre: GenreCourriel; compagnie: string; commun: ModeleCourriel | undefined }) {
  const { ecriture, compagnieParId } = useRh()
  const enregistrer = useEnregistrerModeleCourriel()
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-pierre-300 p-3 text-pierre-600">
      <p>{compagnieParId.get(compagnie)?.nom} utilise le modèle commun.</p>
      {ecriture && commun && (
        <button
          className={ui.boutonSecondaire}
          disabled={enregistrer.isPending}
          onClick={() =>
            enregistrer.mutate({
              id: crypto.randomUUID(),
              genre: genre as ModeleCourriel['genre'],
              entreprise_id: compagnie,
              sujet: commun.sujet,
              corps: commun.corps,
              sujet_en: commun.sujet_en,
              corps_en: commun.corps_en,
              mode: commun.mode,
            })
          }
        >
          Créer un modèle propre (copie du commun)
        </button>
      )}
      {enregistrer.error && <p className={ui.erreur}>{messageErreur(enregistrer.error)}</p>}
    </div>
  )
}

function EditeurModele({ m }: { m: ModeleCourriel & { updated_by_nom?: string | null } }) {
  const { ecriture } = useRh()
  const enregistrer = useEnregistrerModeleCourriel()
  const retirer = useRetirerModeleCourriel()
  const [v, setV] = useState({ sujet: m.sujet, corps: m.corps, sujet_en: m.sujet_en ?? '', corps_en: m.corps_en ?? '' })
  const [erreur, setErreur] = useState<string | null>(null)
  const change = v.sujet !== m.sujet || v.corps !== m.corps || v.sujet_en !== (m.sujet_en ?? '') || v.corps_en !== (m.corps_en ?? '')
  const sauver = (champs: Partial<ModeleCourriel>) => {
    setErreur(null)
    enregistrer.mutate({ ...m, ...champs }, { onError: (e) => setErreur(messageErreur(e)) })
  }
  return (
    <div className="space-y-3">
      {!m.entreprise_id && (
        <label className="flex flex-wrap items-center gap-2">
          <span className="text-pierre-600">Mode (toutes les compagnies)</span>
          <select className={`${ui.champ} w-auto`} value={m.mode} disabled={!ecriture} onChange={(e) => sauver({ mode: e.target.value as ModeleCourriel['mode'] })}>
            {(Object.keys(MODES) as ModeleCourriel['mode'][]).map((k) => (
              <option key={k} value={k} disabled={k === 'automatique' && !AUTOMATIQUES.includes(m.genre)}>
                {MODES[k]}
                {k === 'automatique' && !AUTOMATIQUES.includes(m.genre) ? ' (pas pour ce courriel)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid gap-3 xl:grid-cols-2">
        <div className="space-y-2">
          <p className={ui.etiquette}>Français</p>
          <input className={ui.champ} value={v.sujet} disabled={!ecriture} onChange={(e) => setV({ ...v, sujet: e.target.value })} />
          <textarea className={`${ui.champ} min-h-72 font-sans`} value={v.corps} disabled={!ecriture} onChange={(e) => setV({ ...v, corps: e.target.value })} />
        </div>
        <div className="space-y-2">
          <p className={ui.etiquette}>Anglais (candidat qui a postulé en anglais ; vide = français)</p>
          <input className={ui.champ} value={v.sujet_en} disabled={!ecriture} onChange={(e) => setV({ ...v, sujet_en: e.target.value })} />
          <textarea className={`${ui.champ} min-h-72 font-sans`} value={v.corps_en} disabled={!ecriture} onChange={(e) => setV({ ...v, corps_en: e.target.value })} />
        </div>
      </div>
      {erreur && <p className={ui.erreur}>{erreur}</p>}
      {ecriture && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-pierre-500">
            {m.updated_by_nom ? `Modifié par ${m.updated_by_nom}` : 'Modèle de départ'} · un modèle ne change que les courriels préparés ensuite.
            {m.entreprise_id && (
              <button
                className="ml-2 text-red-700 underline"
                onClick={async () => {
                  if (await confirmer({ titre: 'Revenir au modèle commun ?', message: 'Ce modèle propre à la compagnie sera supprimé.', libelleOk: 'Supprimer', danger: true }))
                    retirer.mutate(m.id)
                }}
              >
                Revenir au modèle commun
              </button>
            )}
          </p>
          <button
            className={ui.bouton}
            disabled={!change || enregistrer.isPending || !v.sujet.trim()}
            onClick={() => sauver({ sujet: v.sujet.trim(), corps: v.corps, sujet_en: v.sujet_en.trim() || null, corps_en: v.corps_en.trim() ? v.corps_en : null })}
          >
            Enregistrer
          </button>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Réglages
// ------------------------------------------------------------
function Reglages() {
  const { ecriture } = useRh()
  const reglages = useReglagesRh()
  const enregistrer = useEnregistrerReglage()
  const r = reglages.data ?? {}
  const changer = (cle: string, valeur: unknown) => enregistrer.mutate({ cle, valeur })
  const destinataires = Array.isArray(r.resume_destinataires) ? (r.resume_destinataires as string[]) : []
  return (
    <Section titre="Réglages des courriels">
      {(reglages.error || enregistrer.error) && <p className={ui.erreur}>{messageErreur(reglages.error ?? enregistrer.error)}</p>}
      <div className="grid gap-4 text-sm sm:grid-cols-2">
        <label className="block">
          <span className={ui.etiquette}>Rappel du dossier d’embauche après (jours)</span>
          <ChampTexte
            className={ui.champ}
            inputMode="numeric"
            valeur={String(r.rappel_jours ?? 7)}
            disabled={!ecriture}
            enregistrer={(v) => {
              const n = Math.round(Number(v))
              if (n >= 1 && n <= 60) changer('rappel_jours', n)
            }}
          />
          <span className="mt-0.5 block text-xs text-pierre-500">Un seul rappel par embauche, préparé à relire (Modèles › Rappel).</span>
        </label>
        <label className="block">
          <span className={ui.etiquette}>Résumé quotidien : heure (Montréal)</span>
          <select className={ui.champ} disabled={!ecriture} value={String(r.resume_heure ?? 7)} onChange={(e) => changer('resume_heure', Number(e.target.value))}>
            {Array.from({ length: 17 }, (_, i) => i + 5).map((h) => (
              <option key={h} value={h}>
                {h} h
              </option>
            ))}
          </select>
          <span className="mt-0.5 block text-xs text-pierre-500">Seulement les jours où il y a du nouveau (candidatures, retours, dossiers).</span>
        </label>
        <label className="block sm:col-span-2">
          <span className={ui.etiquette}>Résumé quotidien : destinataires</span>
          <ChampTexte
            className={ui.champ}
            valeur={destinataires.join(', ')}
            placeholder="adresse@camptremblant.com, …"
            disabled={!ecriture}
            enregistrer={(v) =>
              changer(
                'resume_destinataires',
                v
                  .split(/[,;\s]+/)
                  .map((x) => x.trim().toLowerCase())
                  .filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)),
              )
            }
          />
        </label>
        <label className="block">
          <span className={ui.etiquette}>Rien de préparé seul avant le</span>
          <input
            type="date"
            className={ui.champ}
            disabled={!ecriture}
            value={typeof r.courriels_depuis === 'string' ? r.courriels_depuis : ''}
            onChange={(e) => e.target.value && changer('courriels_depuis', e.target.value)}
          />
          <span className="mt-0.5 block text-xs text-pierre-500">Les données importées d’Airtable ne reçoivent ni rappel ni accusé.</span>
        </label>
      </div>
      <p className="mt-4 text-xs text-pierre-500">
        Les adresses d’envoi se règlent par compagnie :{' '}
        <Link to="/rh/courriels?vue=compagnies" className="underline">
          Compagnies et boîtes
        </Link>
        .
      </p>
    </Section>
  )
}
