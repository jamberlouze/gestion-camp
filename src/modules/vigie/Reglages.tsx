import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { Carte, Chargement } from './commun'
import { dateCourte } from './outils'
import { etatFonction, testerCourriel, useEcriture, useEnregistrerReglages, useReglages } from './donnees'
import type { Reglages as TypeReglages } from './types'

const MODELES = [
  { id: 'claude-sonnet-5-5', libelle: 'Claude Sonnet 5.5 (par défaut, environ 20 à 35 $ US par mois)' },
  { id: 'claude-opus-5-5', libelle: 'Claude Opus 5.5 (plus poussé, environ deux fois plus cher)' },
  { id: 'claude-haiku-4-5', libelle: 'Claude Haiku 4.5 (le moins cher, recherche moins poussée)' },
]

export function Reglages() {
  const reglages = useReglages()
  if (reglages.error) return <p className={ui.erreur}>{messageErreur(reglages.error)}</p>
  if (!reglages.data) return <Chargement />
  // La clé remonte le formulaire quand les réglages changent ailleurs.
  return <Formulaire key={JSON.stringify(reglages.data)} initial={reglages.data} />
}

function Formulaire({ initial }: { initial: TypeReglages }) {
  const ecriture = useEcriture()
  const enregistrer = useEnregistrerReglages()
  const [r, setR] = useState(initial)
  const [destinataires, setDestinataires] = useState(initial.destinataires.join(', '))
  const [message, setMessage] = useState<{ texte: string; erreur?: boolean } | null>(null)
  const etat = useQuery({ queryKey: ['vigie', 'etat-fonction'], queryFn: etatFonction, staleTime: 60_000, retry: false })
  const maj = (v: Partial<TypeReglages>) => setR((x) => ({ ...x, ...v }))

  const sauver = () => {
    const liste = destinataires.split(/[,;\s]+/).map((x) => x.trim()).filter((x) => x.includes('@'))
    enregistrer.mutate(
      { ...r, destinataires: liste, frequence_decouverte_mois: Math.max(1, Math.round(r.frequence_decouverte_mois || 3)) },
      {
        onSuccess: () => setMessage({ texte: 'Réglages enregistrés.' }),
        onError: (e) => setMessage({ texte: messageErreur(e), erreur: true }),
      },
    )
  }
  const essai = async () => {
    setMessage({ texte: 'Envoi du courriel d’essai…' })
    try {
      const { destinataires: a } = await testerCourriel()
      setMessage({ texte: `Courriel d’essai envoyé à ${a.join(', ')}.` })
    } catch (e) {
      setMessage({ texte: messageErreur(e), erreur: true })
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <Carte titre="Connexions">
        {etat.isLoading ? (
          <p className="text-sm text-pierre-500">Vérification…</p>
        ) : etat.error ? (
          <p className="text-sm text-red-700">Impossible de joindre la fonction : {messageErreur(etat.error)}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            <li>
              {etat.data?.anthropic ? '✅' : '⚠️'} Clé API Claude (secret Supabase <code>ANTHROPIC_API_KEY</code>)
              {!etat.data?.anthropic && <span className="text-amber-800"> — absente : les recherches restent en attente.</span>}
            </li>
            <li>
              {etat.data?.gmail ? '✅' : '⚠️'} Gmail (secrets <code>GMAIL_CLIENT_ID</code>, <code>GMAIL_CLIENT_SECRET</code>,{' '}
              <code>GMAIL_REFRESH_TOKEN</code>, <code>GMAIL_EXPEDITEUR</code>)
              {!etat.data?.gmail && <span className="text-amber-800"> — absent : les rapports restent dans le Journal.</span>}
            </li>
          </ul>
        )}
        <p className="mt-2 text-xs text-pierre-500">
          Les secrets se règlent une fois, à la ligne de commande (voir README, section « Vigie des camps »). Mêmes valeurs Gmail que la Vigie de
          subventions.
        </p>
      </Carte>

      <Carte titre="Rapport mensuel">
        <label className="block">
          <span className={ui.etiquette}>Destinataires (séparés par des virgules)</span>
          <input className={ui.champ} value={destinataires} disabled={!ecriture} onChange={(e) => setDestinataires(e.target.value)} />
        </label>
        <label className="mt-3 block">
          <span className={ui.etiquette}>Lien vers l'app dans le courriel</span>
          <input className={ui.champ} value={r.url_app} disabled={!ecriture} onChange={(e) => maj({ url_app: e.target.value })} />
        </label>
        {ecriture && (
          <button className={`${ui.boutonSecondaire} mt-3`} onClick={essai} disabled={!etat.data?.gmail}>
            Envoyer un courriel d'essai
          </button>
        )}
      </Carte>

      <Carte titre="Calendrier">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={!ecriture} checked={r.mensuelle_active} onChange={(e) => maj({ mensuelle_active: e.target.checked })} />
          Vérification automatique le 1er de chaque mois (camps suivis : prix d'abord, puis programmes et activités)
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={!ecriture} checked={r.decouverte_active} onChange={(e) => maj({ decouverte_active: e.target.checked })} />
          Découverte automatique de nouveaux camps
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label>
            <span className={ui.etiquette}>Fréquence de la découverte (mois)</span>
            <input
              type="number"
              min={1}
              max={24}
              className={ui.champ}
              value={r.frequence_decouverte_mois}
              disabled={!ecriture}
              onChange={(e) => maj({ frequence_decouverte_mois: Number(e.target.value) })}
            />
          </label>
          <label>
            <span className={ui.etiquette}>Prochaine découverte</span>
            <input
              type="date"
              className={ui.champ}
              value={r.prochaine_decouverte}
              disabled={!ecriture}
              onChange={(e) => maj({ prochaine_decouverte: e.target.value })}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-pierre-500">Prochaine découverte prévue le {dateCourte(`${r.prochaine_decouverte}T12:00:00`)}.</p>
      </Carte>

      <Carte titre="Recherche">
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className={ui.etiquette}>Modèle</span>
            <select className={ui.champ} value={r.modele} disabled={!ecriture} onChange={(e) => maj({ modele: e.target.value })}>
              {MODELES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.libelle}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={ui.etiquette}>Effort</span>
            <select className={ui.champ} value={r.effort} disabled={!ecriture} onChange={(e) => maj({ effort: e.target.value })}>
              <option value="low">Faible</option>
              <option value="medium">Moyen (par défaut)</option>
              <option value="high">Élevé (plus cher)</option>
            </select>
          </label>
        </div>
        <label className="mt-3 block">
          <span className={ui.etiquette}>Consignes ajoutées au prompt</span>
          <textarea
            className={`${ui.champ} min-h-28`}
            value={r.consignes}
            disabled={!ecriture}
            placeholder="Ex. : Ignorer les camps de jour. Pour les camps anglophones, chercher aussi la page « Rates »."
            onChange={(e) => maj({ consignes: e.target.value })}
          />
        </label>
        <p className="mt-1 text-xs text-pierre-500">
          Pas de mémoire automatique : le prompt reste large par défaut. Si les résultats dévient, ajustez ces consignes (avec l'aide de Claude au
          besoin).
        </p>
      </Carte>

      {ecriture && (
        <div className="flex items-center gap-3">
          <button className={ui.bouton} onClick={sauver} disabled={enregistrer.isPending}>
            Enregistrer
          </button>
        </div>
      )}
      {message && <p className={message.erreur ? ui.erreur : 'rounded-lg bg-foret-50 px-3 py-2 text-sm text-foret-800'}>{message.texte}</p>}
    </div>
  )
}
