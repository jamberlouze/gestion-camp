import { useState } from 'react'
import { Link } from 'react-router'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { useSortieCarte } from '@/lib/sortieCarte'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { Section } from './commun'
import { useRh } from './contexte'
import { champsCourriel, champsManquants, modeDuGenre, modelePour, nomGenre, rendreCourriel, type GenreCourriel } from './courriels'
import {
  useCompagniesRh,
  useCourriels,
  useEnvoyerCourriels,
  useEtatBoites,
  useModeEnvoi,
  useModelesCourriels,
  useModifierCourriel,
  usePreparerCourriels,
  type ModeEnvoi,
} from './donnees'
import { lienEmplois } from './liens'
import { nomAffiche } from './outils'
import type { CourrielRh, Personne } from './types'

// Courriels du module RH, côté écran (plan-rh.md §5) : rédiger d'après un
// modèle (useOutilsCourriels), relire, corriger, envoyer d'un clic (le
// Worker part de la boîte de la compagnie), ou annuler.

const quand = (ts: string) =>
  new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Toronto' }).format(new Date(ts))

const MESSAGES_ENVOI: Record<ModeEnvoi, string> = {
  mailpit: 'DEV : les courriels partent dans Mailpit (http://localhost:54324), jamais chez la personne.',
  gmail: '',
  bloque: 'Base locale sans Mailpit : aucun envoi possible (COURRIELS_MAILPIT dans .dev.vars).',
  non_configure: 'Gmail n’est pas encore configuré (README) : les courriels se préparent, mais ne partent pas.',
}

/** Où partent les courriels, si ce n'est pas la boîte Gmail de la compagnie. */
export function AvisEnvoi() {
  const { ecriture } = useRh()
  const mode = useModeEnvoi(ecriture)
  if (!mode.data || !MESSAGES_ENVOI[mode.data]) return null
  return (
    <p className={`rounded-lg border px-3 py-2 text-sm ${mode.data === 'mailpit' ? 'border-sky-200 bg-sky-50 text-sky-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
      {MESSAGES_ENVOI[mode.data]}
    </p>
  )
}

export interface APreparer {
  genre: Exclude<GenreCourriel, 'autre'>
  personne: Personne
  /** Compagnie dont la boîte envoie */
  entreprise: string | null
  langue?: 'fr' | 'en'
  cle: string
  saison?: string | null
  saisons?: string[]
  poste?: string | null
  postes?: string[]
  lienDossier?: string | null
  lienRetour?: string | null
  candidature_id?: string | null
  embauche_id?: string | null
  invitation_id?: string | null
}

/** Rédiger un courriel d'après le modèle de son genre (celui de la compagnie, sinon le commun). */
export function useOutilsCourriels() {
  const { compagnieParId } = useRh()
  const { profil } = useAuth()
  const modeles = useModelesCourriels()
  const compagnies = useCompagniesRh()
  const preparer = usePreparerCourriels()
  const pret = !!modeles.data && !!compagnies.data

  /** Le courriel à préparer, ou la raison pour laquelle il n'y en a pas. */
  const rediger = (x: APreparer): { courriel: Partial<CourrielRh> & Pick<CourrielRh, 'genre' | 'a' | 'sujet' | 'corps'> } | { raison: string } => {
    if (!modeles.data || !compagnies.data) return { raison: 'Chargement des modèles…' }
    if (modeDuGenre(modeles.data, x.genre) === 'desactive') return { raison: `Le courriel « ${nomGenre(x.genre)} » est désactivé (Courriels › Modèles).` }
    const m = modelePour(modeles.data, x.genre, x.entreprise)
    if (!m) return { raison: `Aucun modèle pour « ${nomGenre(x.genre)} » (Courriels › Modèles).` }
    if (!x.personne.courriel) return { raison: `${nomAffiche(x.personne)} n’a pas de courriel.` }
    const rh = compagnies.data.find((c) => c.entreprise_id === x.entreprise)
    const champs = champsCourriel({
      personne: x.personne,
      compagnie: { ...rh, nom: x.entreprise ? compagnieParId.get(x.entreprise)?.nom : null },
      saison: x.saison,
      saisons: x.saisons,
      poste: x.poste,
      postes: x.postes,
      lienDossier: x.lienDossier,
      lienRetour: x.lienRetour,
      lienEmplois: lienEmplois(),
      expediteur: profil?.nom,
      langue: x.langue,
    })
    return {
      courriel: {
        genre: x.genre,
        cle: x.cle,
        personne_id: x.personne.id,
        candidature_id: x.candidature_id ?? null,
        embauche_id: x.embauche_id ?? null,
        invitation_id: x.invitation_id ?? null,
        entreprise_id: x.entreprise,
        a: [x.personne.courriel],
        ...rendreCourriel(m, x.langue ?? 'fr', champs),
      },
    }
  }
  return { pret, rediger, preparer }
}

const listeAdresses = (texte: string) =>
  texte
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)

/** Boîte qui enverra : adresse de la compagnie et, hors DEV, son état. */
function Expediteur({ c }: { c: CourrielRh }) {
  const { compagnieParId, ecriture } = useRh()
  const boites = useEtatBoites()
  const mode = useModeEnvoi(ecriture)
  const b = boites.data?.find((x) => x.entreprise_id === c.entreprise_id)
  const nom = c.entreprise_id ? compagnieParId.get(c.entreprise_id)?.abreviation || compagnieParId.get(c.entreprise_id)?.nom : null
  return (
    <p className="text-xs text-pierre-600">
      De : {b?.adresse_envoi ?? <span className="text-red-700">aucune adresse d’envoi</span>}
      {nom && ` (${nom})`}
      {b && b.etat !== 'connectee' && mode.data === 'gmail' && (
        <Link to="/rh/courriels?vue=compagnies" className="ml-2 text-amber-800 underline">
          {b.etat === 'non_connectee' ? 'boîte pas connectée' : b.etat === 'a_reconnecter' ? 'boîte à reconnecter' : 'erreur de la boîte'}
        </Link>
      )}
    </p>
  )
}

/** Courriel préparé : destinataires, sujet et texte modifiables, puis Envoyer ou Annuler. */
export function CarteCourriel({
  c,
  ouvert: ouvertDepart = false,
  avecPersonne = false,
  coche,
}: {
  c: CourrielRh
  ouvert?: boolean
  avecPersonne?: boolean
  /** Case à cocher pour l'envoi en lot (onglet Courriels) */
  coche?: { valeur: boolean; changer: (v: boolean) => void }
}) {
  const { ecriture, personneParId } = useRh()
  const modifier = useModifierCourriel()
  const envoyer = useEnvoyerCourriels()
  const [ouvert, setOuvert] = useState(ouvertDepart)
  const [a, setA] = useState(c.a.join(', '))
  const [sujet, setSujet] = useState(c.sujet)
  const [corps, setCorps] = useState(c.corps)
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  // Envoyé ou annulé, le courriel quitte la liste : la carte sort d'abord (revient si l'envoi est refusé).
  const { ref, sortir } = useSortieCarte<HTMLDivElement>()
  const change = a !== c.a.join(', ') || sujet !== c.sujet || corps !== c.corps
  const manquants = champsManquants(`${sujet}\n${corps}`)
  const p = c.personne_id ? personneParId.get(c.personne_id) : undefined

  const enregistrer = () => modifier.mutateAsync({ id: c.id, champs: { a: listeAdresses(a), sujet: sujet.trim(), corps: corps.trim() } })

  const envoyerCourriel = async () => {
    setErreur(null)
    if (!listeAdresses(a).length) return setErreur('Ajoutez au moins un destinataire.')
    if (manquants.length) return setErreur(`Remplacez d’abord ${manquants.map((m) => `« [${m} ?] »`).join(', ')} dans le texte.`)
    setOccupe(true)
    try {
      if (change) await enregistrer()
      await sortir(async () => {
        const { resultats } = await envoyer.mutateAsync([c.id])
        if (!resultats[0]?.ok) throw new Error(resultats[0]?.erreur ?? 'Envoi refusé.')
      })
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setOccupe(false)
    }
  }

  const annuler = async () => {
    const ok = await confirmer({ titre: 'Annuler ce courriel ?', message: 'Il ne sera pas envoyé.', libelleOk: 'Annuler le courriel' })
    if (ok) sortir(() => modifier.mutate({ id: c.id, champs: { statut: 'annule', raison: 'Annulé à la main' } }))
  }

  return (
    <div ref={ref} className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 text-sm">
      <div className="flex items-start gap-2">
        {coche && ecriture && (
          <input type="checkbox" className="mt-1 size-4 accent-foret-700" aria-label="Choisir pour l’envoi" checked={coche.valeur} onChange={(e) => coche.changer(e.target.checked)} />
        )}
        <button className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-2 text-left" onClick={() => setOuvert(!ouvert)}>
          <span className="min-w-0">
            <span className="font-medium">{nomGenre(c.genre)}</span>
            {avecPersonne && p && (
              <Link to={`/rh/p/${p.id}`} className="ml-2 text-foret-700 underline" onClick={(e) => e.stopPropagation()}>
                {nomAffiche(p)}
              </Link>
            )}
            <span className="block truncate text-pierre-700">{c.sujet}</span>
          </span>
          <span className="text-xs text-amber-800">
            à envoyer · préparé {quand(c.cree_le)}
            {c.cree_par_nom ? ` · ${c.cree_par_nom}` : ''}
          </span>
        </button>
      </div>
      {(c.erreur || erreur) && <p className={`${ui.erreur} mt-2`}>{erreur ?? `Dernier essai : ${c.erreur}`}</p>}
      {ouvert && (
        <div className="mt-3 space-y-2">
          <Expediteur c={c} />
          <label className="block">
            <span className={ui.etiquette}>À</span>
            <input className={ui.champ} value={a} disabled={!ecriture} onChange={(e) => setA(e.target.value)} />
          </label>
          <label className="block">
            <span className={ui.etiquette}>Sujet</span>
            <input className={ui.champ} value={sujet} disabled={!ecriture} onChange={(e) => setSujet(e.target.value)} />
          </label>
          <label className="block">
            <span className={ui.etiquette}>Texte {c.langue === 'en' && '(anglais)'}</span>
            <textarea className={`${ui.champ} min-h-56 font-sans`} value={corps} disabled={!ecriture} onChange={(e) => setCorps(e.target.value)} />
          </label>
          {manquants.length > 0 && (
            <p className="text-xs text-amber-800">
              À compléter avant l’envoi : {manquants.map((m) => `[${m} ?]`).join(', ')} (réglage de la compagnie ou du modèle manquant).
            </p>
          )}
          {ecriture && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button className="text-sm text-red-700 underline" onClick={annuler}>
                Annuler le courriel
              </button>
              <span className="flex gap-2">
                {change && (
                  <button className={ui.boutonSecondaire} disabled={occupe || modifier.isPending} onClick={() => enregistrer().catch((e: Error) => setErreur(e.message))}>
                    Enregistrer
                  </button>
                )}
                <button className={ui.bouton} disabled={occupe} onClick={envoyerCourriel}>
                  {occupe ? 'Envoi…' : 'Envoyer'}
                </button>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Courriel envoyé ou annulé : une ligne, le texte au clic. */
export function LigneCourriel({ c, avecPersonne = false }: { c: CourrielRh; avecPersonne?: boolean }) {
  const { personneParId } = useRh()
  const [ouvert, setOuvert] = useState(false)
  const p = c.personne_id ? personneParId.get(c.personne_id) : undefined
  return (
    <li className="py-2 text-sm">
      <button className="flex w-full flex-wrap items-baseline justify-between gap-2 text-left" onClick={() => setOuvert(!ouvert)}>
        <span className="min-w-0">
          {c.statut === 'envoye' ? '✉️' : '⨯'} <span className={c.statut === 'annule' ? 'text-pierre-400 line-through' : ''}>{c.sujet}</span>
          {avecPersonne && p && (
            <Link to={`/rh/p/${p.id}`} className="ml-2 text-xs text-foret-700 underline" onClick={(e) => e.stopPropagation()}>
              {nomAffiche(p)}
            </Link>
          )}
        </span>
        <span className="text-xs text-pierre-500">
          {c.statut === 'envoye'
            ? `envoyé ${c.envoye_le ? quand(c.envoye_le) : ''}${c.envoye_par_nom ? ` · ${c.envoye_par_nom}` : ''}`
            : `annulé${c.annule_le ? ` ${quand(c.annule_le)}` : ''}`}
        </span>
      </button>
      {ouvert && (
        <div className="mt-2 rounded-md bg-pierre-50 p-3 text-xs text-pierre-700">
          <p>À : {c.a.join(', ') || '—'}</p>
          <p className="mt-2 whitespace-pre-wrap">{c.corps}</p>
        </div>
      )}
    </li>
  )
}

/** Courriels d'une personne (fiche) : à envoyer, ouverts ; puis ceux qui sont partis. */
export function SectionCourriels({ personneId }: { personneId: string }) {
  const courriels = useCourriels({ personne: personneId })
  const liste = courriels.data ?? []
  const prepares = liste.filter((c) => c.statut === 'prepare')
  const autres = liste.filter((c) => c.statut !== 'prepare')
  return (
    <Section titre={`Courriels${prepares.length ? ` (${prepares.length} à envoyer)` : ''}`}>
      <div className="space-y-2">
        {prepares.length > 0 && <AvisEnvoi />}
        {courriels.error && <p className={ui.erreur}>{messageErreur(courriels.error)}</p>}
        {!liste.length && !courriels.isLoading && <p className="text-sm text-pierre-500">Aucun courriel. Choisir un statut, inviter ou préparer la bienvenue en prépare un, à relire avant l’envoi.</p>}
        {prepares.map((c) => (
          <CarteCourriel key={c.id} c={c} ouvert />
        ))}
        {autres.length > 0 && (
          <ul className="divide-y divide-pierre-100">
            {autres.map((c) => (
              <LigneCourriel key={c.id} c={c} />
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}
