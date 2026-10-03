import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { Chargement } from './commun'
import { lancer, lireRapport, reveiller, useActivites, useCamps, useEcriture, useRecherches, useRequetes } from './donnees'
import type { Recherche, RequeteIa } from './types'

const TYPES: Record<Recherche['type'], string> = {
  mensuelle: 'Vérification mensuelle',
  decouverte: 'Découverte de camps',
  documentation: 'Documentation (passe 2)',
}
const TYPES_REQUETE: Record<RequeteIa['type'], string> = {
  verification: 'Vérification',
  photos: 'Photos',
  decouverte: 'Découverte',
  documentation: 'Documentation',
  couts: 'Coûts',
  maquette: 'Maquette',
}

const dateHeure = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : '—'

/** Journal des recherches, requêtes en cours et lancement manuel. */
export function Journal() {
  const ecriture = useEcriture()
  const recherches = useRecherches()
  const requetes = useRequetes()
  const camps = useCamps()
  const activites = useActivites()
  const [message, setMessage] = useState<{ texte: string; erreur?: boolean } | null>(null)
  const [rapport, setRapport] = useState<{ titre: string; html: string } | null>(null)

  const nom = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of camps.data ?? []) m.set(c.id, c.nom)
    for (const a of activites.data ?? []) m.set(a.id, a.nom)
    return m
  }, [camps.data, activites.data])

  const erreur = recherches.error ?? requetes.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!recherches.data || !requetes.data) return <Chargement />

  const actives = requetes.data.filter((r) => r.statut === 'en_attente' || r.statut === 'soumise')
  const enErreur = requetes.data.filter((r) => r.statut === 'erreur')
  const restantes = (id: string) => actives.filter((r) => r.recherche_id === id)

  const lancerRecherche = async (type: 'mensuelle' | 'decouverte') => {
    const nbCamps = (camps.data ?? []).filter((c) => c.statut_inclusion === 'inclus').length
    const ok = await confirmer({
      titre: type === 'mensuelle' ? 'Lancer la vérification maintenant ?' : 'Lancer une découverte maintenant ?',
      message:
        type === 'mensuelle'
          ? `Claude va vérifier les ${nbCamps} camps suivis (prix, programmes, activités, photos). Coût approximatif : 15 à 30 $ US sur la clé API. Le rapport arrive par courriel quand tout est terminé (souvent moins d'une heure).`
          : 'Claude va chercher de nouveaux camps à proposer (passe 1). Coût approximatif : 1 à 3 $ US.',
      libelleOk: 'Lancer',
      danger: false,
    })
    if (!ok) return
    try {
      await lancer(type)
      setMessage({ texte: 'Recherche lancée. Les requêtes partent à Claude en lot ; cette page se met à jour toute seule.' })
    } catch (e) {
      setMessage({ texte: messageErreur(e), erreur: true })
    }
  }

  const voirRapport = async (r: Recherche) => {
    try {
      const html = await lireRapport(r.id)
      setRapport({ titre: r.resume ?? TYPES[r.type], html: html ?? '<p>Aucun rapport.</p>' })
    } catch (e) {
      setMessage({ texte: messageErreur(e), erreur: true })
    }
  }

  return (
    <div className="space-y-5">
      {ecriture && (
        <div className="flex flex-wrap items-center gap-2">
          <button className={ui.boutonSecondaire} onClick={() => lancerRecherche('mensuelle')}>
            Lancer la vérification mensuelle maintenant
          </button>
          <button className={ui.boutonSecondaire} onClick={() => lancerRecherche('decouverte')}>
            Lancer une découverte maintenant
          </button>
          {actives.length > 0 && (
            <button className="text-sm text-foret-700 underline" onClick={() => reveiller()}>
              Relancer le traitement
            </button>
          )}
        </div>
      )}
      {message && <p className={message.erreur ? ui.erreur : 'rounded-lg bg-foret-50 px-3 py-2 text-sm text-foret-800'}>{message.texte}</p>}
      <p className="text-sm text-pierre-500">
        Vérification automatique le 1er de chaque mois ; découverte de nouveaux camps à la fréquence choisie dans les Réglages. Les requêtes à
        Claude partent en lot et sont lues toutes les 10 minutes.
      </p>

      <div className={`${ui.carte} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="border-b border-pierre-200 text-left text-xs uppercase tracking-wide text-pierre-500">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">État</th>
              <th className="px-3 py-2 text-right font-medium">Camps vérifiés</th>
              <th className="px-3 py-2 text-right font-medium">Changements</th>
              <th className="px-3 py-2 text-right font-medium">dont prix</th>
              <th className="px-3 py-2 text-right font-medium">Camps proposés</th>
              <th className="px-3 py-2 text-right font-medium">Erreurs</th>
              <th className="px-3 py-2 text-right font-medium">Coût (US)</th>
              <th className="px-3 py-2 font-medium">Courriel</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pierre-100">
            {recherches.data.map((r) => {
              const reste = restantes(r.id)
              return (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-3 py-2">{dateHeure(r.debut)}</td>
                  <td className="px-3 py-2">{TYPES[r.type]}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {r.statut === 'en_cours' ? (
                      <span className="text-amber-700">En cours{reste.length ? ` · ${reste.length} requête${reste.length > 1 ? 's' : ''} restante${reste.length > 1 ? 's' : ''}` : ''}</span>
                    ) : r.statut === 'terminee' ? (
                      <button className="text-foret-700 underline" onClick={() => voirRapport(r)}>
                        Terminée · rapport
                      </button>
                    ) : (
                      <span className="text-red-700">Erreur</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.camps_verifies}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.changements_detectes}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.changements_prix}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.camps_proposes}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.erreurs || ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(r.cout_usd) ? `${Number(r.cout_usd).toFixed(2)} $` : ''}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.courriel_envoye_le ? <span className="text-foret-700">Envoyé</span> : r.erreur ? <span className="text-red-700" title={r.erreur}>{r.erreur.slice(0, 60)}</span> : ''}
                  </td>
                </tr>
              )
            })}
            {!recherches.data.length && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-pierre-500">
                  Aucune recherche pour l'instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {actives.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Requêtes en cours ({actives.length})</h2>
          <p className="text-sm text-pierre-600">
            {actives.filter((r) => r.statut === 'en_attente').length} en attente d'envoi · {actives.filter((r) => r.statut === 'soumise').length} chez
            Claude (lot en traitement)
          </p>
        </section>
      )}

      {enErreur.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Requêtes en erreur (45 derniers jours)</h2>
          <ul className={`${ui.carte} divide-y divide-pierre-100 text-sm`}>
            {enErreur.slice(0, 50).map((r) => (
              <li key={r.id} className="flex flex-wrap gap-x-3 px-3 py-2">
                <span className="w-28 shrink-0 text-pierre-500">{dateHeure(r.updated_at)}</span>
                <span className="w-28 shrink-0">{TYPES_REQUETE[r.type]}</span>
                <span className="w-56 shrink-0">
                  {r.camp_id ? (
                    <Link to={`/vigie/camps/${r.camp_id}`} className="hover:underline">
                      {nom.get(r.camp_id)}
                    </Link>
                  ) : r.activite_id ? (
                    <Link to={`/vigie/activites/${r.activite_id}`} className="hover:underline">
                      {nom.get(r.activite_id)}
                    </Link>
                  ) : (
                    '—'
                  )}
                </span>
                <span className="flex-1 text-red-700">{r.erreur}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rapport && (
        <Dialogue titre={rapport.titre} fermer={() => setRapport(null)} large>
          <iframe title="Rapport" srcDoc={rapport.html} sandbox="" className="h-[60vh] w-full rounded-lg border border-pierre-200" />
        </Dialogue>
      )}
    </div>
  )
}
