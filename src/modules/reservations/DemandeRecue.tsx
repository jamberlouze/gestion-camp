import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { GENRES, type Genre, type Organisation } from '@/modules/crm/types'
import { ChoixOrganisation } from './ChoixOrganisation'
import { useDonnees } from './contexte'
import { genreSuggere, resume, type Reponses } from './demande'
import { useValiderDemande } from './donnees'
import { normaliser } from './format'
import type { DemandeRecue as Demande } from './types'

const quand = (iso: string) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso))

const chiffres = (t: string | null | undefined) => (t ?? '').replace(/\D/g, '').slice(-10)

// Mots trop courants pour rapprocher deux noms d'organisation.
const VIDES = new Set(['ecole', 'de', 'des', 'du', 'la', 'le', 'les', 'et', 'l', 'd', 'st', 'ste', 'saint', 'sainte', 'school', 'the', 'of', 'centre', 'college', 'famille', 'club'])
const mots = (s: string) => new Set(normaliser(s).split(/[^a-z0-9]+/).filter((m) => m.length > 1 && !VIDES.has(m)))

interface Suggestion {
  org: Organisation
  raison: string
}

/**
 * Suggestions (décision de Maxime : rien n'est relié tout seul) : même
 * courriel ou téléphone d'un contact, puis nom semblable, puis même ville
 * et même type.
 */
function suggestions(rep: Reponses, organisations: Organisation[], contacts: { organisation_id: string; courriel: string | null; telephone: string | null }[], orgParId: Map<string, Organisation>): Suggestion[] {
  const vues = new Map<string, Suggestion>()
  const ajouter = (org: Organisation | undefined, raison: string) => {
    if (org && !vues.has(org.id)) vues.set(org.id, { org, raison })
  }
  const courriels = [rep.resp_courriel, rep.fact_courriel, rep.courriel_direction].map((c) => c.trim().toLowerCase()).filter(Boolean)
  const telephones = [rep.resp_telephone, rep.fact_telephone].map(chiffres).filter((t) => t.length >= 7)
  for (const c of contacts) {
    if (c.courriel && courriels.includes(c.courriel.trim().toLowerCase())) ajouter(orgParId.get(c.organisation_id), 'même courriel')
  }
  for (const c of contacts) {
    if (c.telephone && telephones.includes(chiffres(c.telephone))) ajouter(orgParId.get(c.organisation_id), 'même téléphone')
  }
  const cible = mots(rep.organisation)
  const nomNorm = normaliser(rep.organisation)
  const semblables = organisations
    .map((o) => {
      const m = mots(o.nom)
      const communs = [...m].filter((x) => cible.has(x)).length
      const inclus = nomNorm.length > 3 && (normaliser(o.nom).includes(nomNorm) || nomNorm.includes(normaliser(o.nom)))
      return { o, score: inclus ? 10 : communs >= 2 || (communs === 1 && Math.min(m.size, cible.size) === 1) ? communs : 0 }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
  for (const x of semblables) ajouter(x.o, 'nom semblable')
  const ville = normaliser(rep.ville)
  const genre = genreSuggere(rep)
  if (ville) {
    organisations
      .filter((o) => o.ville && normaliser(o.ville) === ville && o.genre === genre)
      .slice(0, 4)
      .forEach((o) => ajouter(o, 'même ville et même type'))
  }
  return [...vues.values()].slice(0, 10)
}

/** Demande du formulaire public : à relier au CRM, puis ses réponses. */
export function DemandeRecue({ demande }: { demande: Demande }) {
  const { organisations, contacts, orgParId, ecriture } = useDonnees()
  const valider = useValiderDemande()
  const rep = demande.reponses
  const [genre, setGenre] = useState<Genre>(() => genreSuggere(rep) as Genre)
  const [erreur, setErreur] = useState<string | null>(null)
  const liste = useMemo(() => suggestions(rep, organisations, contacts, orgParId), [rep, organisations, contacts, orgParId])
  const lignes = resume(rep)

  const relier = (organisation: string | null) => {
    setErreur(null)
    valider.mutate(
      { demande: demande.id, organisation, genre: organisation ? null : genre },
      { onError: (e) => setErreur(messageErreur(e)) },
    )
  }

  const reponses = (
    <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(0,14rem)_1fr]">
      {lignes.map((l) => (
        <div key={l.question} className="contents">
          <dt className="text-pierre-500">{l.question}</dt>
          <dd className="whitespace-pre-wrap text-pierre-900">{l.reponse}</dd>
        </div>
      ))}
    </dl>
  )

  if (demande.validee_le) {
    return (
      <details className={`${ui.carte} px-4 py-3`}>
        <summary className="cursor-pointer text-sm text-pierre-600">
          Demande reçue par le formulaire web le {quand(demande.recue_le)}
          {demande.langue === 'en' && ' (en anglais)'} · reliée au CRM
          {demande.validee_par_nom && ` par ${demande.validee_par_nom}`}
        </summary>
        <div className="mt-3">{reponses}</div>
      </details>
    )
  }

  return (
    <section className="space-y-4 rounded-xl border border-amber-300 bg-amber-50/60 p-4">
      <div>
        <h2 className="font-semibold text-amber-900">Nouvelle demande du formulaire web — à relier au CRM</h2>
        <p className="text-sm text-amber-900/80">
          Reçue le {quand(demande.recue_le)}
          {demande.langue === 'en' && ' (formulaire en anglais)'}. Choisissez l'organisation du client, ou créez-la : les contacts de la demande s'y
          ajoutent (ou sont retrouvés par leur courriel).
        </p>
      </div>

      {ecriture && (
        <div className="space-y-3">
          {liste.length > 0 && (
            <ul className="divide-y divide-amber-200 rounded-lg border border-amber-200 bg-white">
              {liste.map((s) => (
                <li key={s.org.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <Link to={`/crm/o/${s.org.id}`} className="min-w-0 flex-1 truncate font-medium text-foret-800 hover:underline">
                    {s.org.nom}
                    {s.org.ville && <span className="font-normal text-pierre-500"> · {s.org.ville}</span>}
                  </Link>
                  <span className="rounded-full bg-pierre-100 px-2 py-0.5 text-xs text-pierre-600">{s.raison}</span>
                  <button className={ui.boutonSecondaire} disabled={valider.isPending} onClick={() => relier(s.org.id)}>
                    Relier
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className={ui.etiquette}>Autre organisation du CRM</span>
              <ChoixOrganisation valeur={null} changer={(id) => id && relier(id)} disabled={valider.isPending} />
            </div>
            <div>
              <span className={ui.etiquette}>Ou créer « {rep.organisation} »</span>
              <div className="flex gap-2">
                <select aria-label="Type d'organisation" className={`${ui.champ} min-w-0`} value={genre} onChange={(e) => setGenre(e.target.value as Genre)}>
                  {GENRES.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nom}
                    </option>
                  ))}
                </select>
                <button className={ui.bouton} disabled={valider.isPending} onClick={() => relier(null)}>
                  Créer
                </button>
              </div>
            </div>
          </div>
          {erreur && <p className={ui.erreur}>{erreur}</p>}
        </div>
      )}

      <details open className="rounded-lg border border-amber-200 bg-white px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-pierre-700">Réponses du formulaire</summary>
        <div className="mt-2">{reponses}</div>
      </details>
    </section>
  )
}
