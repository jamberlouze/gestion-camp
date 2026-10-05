import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { IconePlus } from '@/lib/icones'
import { messageErreur } from '@/lib/donnees'
import { SaisieNom } from '@/lib/SaisieNom'
import { ui } from '@/lib/ui'
import { Chargement, Section } from './commun'
import { appelerWorker, useEcriture, useEnregistrer, usePersonnel, useRetirer, useSynchros } from './donnees'
import { META_SECTEUR, SECTEURS_PERSONNEL, type Personne, type SecteurPersonnel } from './types'

export function Reglages() {
  return (
    <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
      <ListePersonnel />
      <Synchro />
    </div>
  )
}

function ListePersonnel() {
  const ecriture = useEcriture()
  const personnel = usePersonnel()
  const enregistrer = useEnregistrer<Personne>('personnel')
  const retirer = useRetirer('personnel')
  const [ajout, setAjout] = useState(false)
  const [inactifs, setInactifs] = useState(false)

  const liste = (personnel.data ?? []).filter((p) => inactifs || p.actif)
  const nbInactifs = (personnel.data ?? []).filter((p) => !p.actif).length

  async function supprimer(p: Personne) {
    if (!(await confirmer({ titre: `Retirer ${p.nom} de la liste ?`, message: 'Ses présences passées restent dans l\'historique. Pour une personne qui revient plus tard, décochez plutôt « Actif ».' }))) return
    retirer.mutate(p.id)
  }

  return (
    <Section
      titre="Personnel"
      compte={personnel.data?.filter((p) => p.actif).length}
      droite={
        ecriture &&
        !ajout && (
          <button className={`${ui.boutonSecondaire} px-2.5 py-1.5`} onClick={() => setAjout(true)}>
            <IconePlus /> Ajouter
          </button>
        )
      }
    >
      <p className="mb-3 text-sm text-pierre-500">
        Direction et terrain. L'équipe de cuisine se gère dans Cuisine › Équipe et réglages, les animateurs dans Animation : ils apparaissent d'eux-mêmes dans le calendrier.
      </p>
      {ajout && (
        <div className="mb-3">
          <SaisieNom
            placeholder="Nom"
            libelleOk="Ajouter"
            compact
            annuler={() => setAjout(false)}
            valider={async (nom) => {
              try {
                await enregistrer.mutateAsync({ nom, ordre: (personnel.data?.length ?? 0) + 1 })
                setAjout(false)
                return null
              } catch (e) {
                return messageErreur(e)
              }
            }}
          />
        </div>
      )}
      {!personnel.data ? (
        <Chargement />
      ) : (
        <ul className="divide-y divide-pierre-100">
          {liste.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
              <ChampTexte
                aria-label="Nom"
                className={`${ui.champ} w-40 flex-1 py-1.5`}
                valeur={p.nom}
                obligatoire
                disabled={!ecriture}
                enregistrer={(nom) => enregistrer.mutate({ id: p.id, nom })}
              />
              <select
                aria-label={`Secteur de ${p.nom}`}
                className={`${ui.champ} w-auto! py-1.5 ${p.secteur_principal ? '' : 'border-amber-400 bg-amber-50'}`}
                value={p.secteur_principal ?? ''}
                disabled={!ecriture}
                onChange={(e) => enregistrer.mutate({ id: p.id, secteur_principal: (e.target.value || null) as SecteurPersonnel | null })}
              >
                <option value="">Secteur à préciser</option>
                {SECTEURS_PERSONNEL.map((s) => (
                  <option key={s} value={s}>
                    {META_SECTEUR[s].libelle}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-sm text-pierre-600">
                <input type="checkbox" className="size-4 accent-foret-700" checked={p.actif} disabled={!ecriture} onChange={(e) => enregistrer.mutate({ id: p.id, actif: e.target.checked })} />
                Actif
              </label>
              {ecriture && (
                <button className={ui.boutonDanger} onClick={() => supprimer(p)}>
                  Retirer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {nbInactifs > 0 && (
        <button className="mt-2 text-sm text-foret-700 underline" onClick={() => setInactifs(!inactifs)}>
          {inactifs ? 'Masquer' : 'Afficher'} les inactifs ({nbInactifs})
        </button>
      )}
    </Section>
  )
}

function Synchro() {
  const ecriture = useEcriture()
  const synchros = useSynchros()
  const etat = useQuery({
    queryKey: ['calendrier', 'worker-etat'],
    queryFn: () => appelerWorker('etat', 'GET') as Promise<{ airtable: boolean; supabase: boolean; jetonAutomatisation: boolean } | null>,
    retry: false,
  })
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState<{ texte: string; erreur?: boolean } | null>(null)

  async function lancer() {
    setEnCours(true)
    setMessage(null)
    try {
      const b = (await appelerWorker('synchro', 'POST')) as { recus: number; ajoutes: number; modifies: number; retires: number }
      setMessage({ texte: `${b.recus} réservations lues : ${b.ajoutes} ajoutées, ${b.modifies} modifiées, ${b.retires} retirées.` })
    } catch (e) {
      setMessage({ texte: messageErreur(e), erreur: true })
    } finally {
      setEnCours(false)
    }
  }

  const derniere = synchros.data?.[0]
  const configure = etat.data?.airtable && etat.data?.supabase
  return (
    <Section titre="Séjours Airtable">
      <p className="text-sm text-pierre-600">
        Les séjours viennent de la base Airtable « Réservation Groupes » (source officielle), lue toutes les 15 minutes. Rien n'est jamais écrit dans Airtable. Les
        réservations « Closed lost » ne sont pas affichées.
      </p>

      <div className="mt-3 text-sm">
        {etat.isLoading ? (
          <p className="text-pierre-500">Vérification de la configuration…</p>
        ) : etat.error ? (
          <p className="text-pierre-500">Configuration du Worker inconnue ({messageErreur(etat.error)}).</p>
        ) : configure ? (
          <p className="text-foret-800">✓ Worker configuré (Airtable et Supabase).</p>
        ) : (
          <p className={ui.erreur}>
            Secrets manquants dans Cloudflare :{' '}
            {[!etat.data?.airtable && 'AIRTABLE_TOKEN', !etat.data?.supabase && 'SUPABASE_SECRET_KEY'].filter(Boolean).join(' et ')} (README, section Calendrier).
          </p>
        )}
      </div>

      {ecriture && (
        <button className={`${ui.bouton} mt-3`} disabled={enCours} onClick={lancer}>
          {enCours ? 'Synchronisation…' : 'Synchroniser maintenant'}
        </button>
      )}
      {message && <p className={`mt-2 text-sm ${message.erreur ? ui.erreur : 'rounded-lg bg-foret-50 px-3 py-2 text-foret-800'}`}>{message.texte}</p>}

      <h4 className="mb-1 mt-4 text-xs font-medium uppercase tracking-wide text-pierre-500">Dernières synchros</h4>
      {!synchros.data ? (
        <Chargement />
      ) : !derniere ? (
        <p className="text-sm text-pierre-500">Aucune synchro pour l'instant.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {synchros.data.map((s) => (
            <li key={s.id} className="flex flex-wrap gap-x-2">
              <span className="tabular-nums text-pierre-500">
                {new Date(s.debut).toLocaleString('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="text-pierre-500">({s.source})</span>
              {s.erreur ? (
                <span className="text-red-800">{s.erreur}</span>
              ) : (
                <span>
                  {s.recus} lues · {s.ajoutes} ajoutées · {s.modifies} modifiées · {s.retires} retirées
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <details className="mt-4 text-sm text-pierre-600">
        <summary className="cursor-pointer text-foret-700">Mise à jour immédiate depuis Airtable</summary>
        <p className="mt-2">
          Dans Airtable, une automatisation (« Quand une fiche est modifiée » dans Réservations → « Exécuter un script ») peut demander une synchro sans attendre les
          15 minutes :
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-pierre-50 p-2 text-xs">{`await fetch('${location.origin}/api/calendrier/synchro', {
  method: 'POST',
  headers: { 'X-Jeton-Synchro': input.config().jeton },
})`}</pre>
        <p className="mt-2">
          Le jeton est le secret Cloudflare CALENDRIER_JETON_SYNCHRO {etat.data ? (etat.data.jetonAutomatisation ? '(configuré)' : '(pas encore configuré)') : ''}, à
          mettre en variable d'entrée « jeton » du script.
        </p>
      </details>
    </Section>
  )
}
