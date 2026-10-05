import { useState } from 'react'
import { ChampTexte } from '@/lib/ChampTexte'
import { messageErreur } from '@/lib/donnees'
import { IconeAttention, IconePlus } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { Section, ZoneTexte } from './commun'
import { useEnregistrer, useEntreprises, useModifierReglage, useReglages } from './donnees'
import { cleProgramme } from './outils'
import type { Entreprise } from './types'

export function Reglages() {
  const entreprises = useEntreprises()
  const reglages = useReglages()
  const modifier = useModifierReglage()

  const erreur = entreprises.error ?? reglages.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!entreprises.data || !reglages.data) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const valeur = (cle: string) => reglages.data.find((r) => r.key === cle)?.value
  const active = valeur('recherche_active') !== false

  return (
    <div className="max-w-4xl space-y-4">
      <Section titre="Recherche hebdomadaire">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-foret-700"
            checked={active}
            onChange={(e) => modifier.mutate({ key: 'recherche_active', value: e.target.checked })}
          />
          Chercher chaque lundi matin et envoyer le courriel de rappel
        </label>
        <p className="mt-1 text-xs text-pierre-500">
          En pause, rien ne part le lundi (ni recherche ni courriel) ; la recherche manuelle reste possible.
        </p>
      </Section>

      <Section titre="Consignes pour tout le groupe (facultatif)">
        <p className="mb-2 text-sm text-pierre-600">
          Ajoutées à chaque recherche. La liste des entreprises du groupe, la priorité aux subventions salariales (pour les
          entreprises qui embauchent) et « ratisser large » y sont déjà : écrivez ici seulement une règle à imposer avant que la
          mémoire l’apprenne de vos validations et rejets.
        </p>
        <ZoneTexte
          className={ui.champ}
          rows={3}
          placeholder="Ex. jamais de prêts, seulement des subventions et des crédits d’impôt"
          valeur={String(valeur('consignes_groupe') ?? '')}
          enregistrer={(v) => modifier.mutate({ key: 'consignes_groupe', value: v })}
        />
      </Section>

      <Section titre="Destinataires du courriel du lundi">
        <ChampTexte
          className={ui.champ}
          placeholder="Vide : toutes les personnes qui ont accès au module"
          valeur={String(valeur('destinataires') ?? '')}
          enregistrer={(v) => modifier.mutate({ key: 'destinataires', value: v })}
        />
        <p className="mt-1 text-xs text-pierre-500">Adresses séparées par des virgules.</p>
      </Section>

      <Section titre="Entreprises (une recherche chacune, en silo)">
        <div className="space-y-4">
          {entreprises.data.map((e) => (
            <FicheEntreprise key={e.id} e={e} />
          ))}
          <NouvelleEntreprise ordre={(entreprises.data.at(-1)?.sort_order ?? 0) + 1} />
        </div>
      </Section>
    </div>
  )
}

function FicheEntreprise({ e }: { e: Entreprise }) {
  const enregistrer = useEnregistrer<Entreprise>('grant_companies')
  const maj = (champs: Partial<Entreprise>) => enregistrer.mutate({ id: e.id, ...champs })
  return (
    <div className="rounded-lg border border-pierre-200 p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem_auto_auto]">
        <label className="block">
          <span className={ui.etiquette}>Nom</span>
          <ChampTexte className={ui.champ} obligatoire valeur={e.name} enregistrer={(name) => maj({ name })} />
        </label>
        <label className="block">
          <span className={ui.etiquette}>Statut juridique</span>
          <ChampTexte
            className={ui.champ}
            placeholder="Ex. OBNL, entreprise privée"
            valeur={e.legal_status ?? ''}
            enregistrer={(v) => maj({ legal_status: v || null })}
          />
        </label>
        <label
          className="flex items-center gap-2 self-end pb-2 text-sm"
          title="Priorité aux subventions salariales dans la recherche de cette entreprise"
        >
          <input
            type="checkbox"
            className="h-4 w-4 accent-foret-700"
            checked={e.hires_staff}
            onChange={(ev) => maj({ hires_staff: ev.target.checked })}
          />
          Embauche du personnel
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-foret-700" checked={e.active} onChange={(ev) => maj({ active: ev.target.checked })} />
          Active
        </label>
      </div>
      {!e.legal_status && (
        <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
          <IconeAttention className="size-3.5" /> À préciser : certains programmes sont réservés aux OBNL, d’autres aux entreprises.
        </p>
      )}
      <label className="mt-3 block">
        <span className={ui.etiquette}>Critères propres à l’entreprise</span>
        <ZoneTexte
          className={ui.champ}
          rows={4}
          placeholder="Activités, clientèle, embauche, projets à financer, ce qui la rend admissible ou non…"
          valeur={e.specific_criteria ?? ''}
          enregistrer={(v) => maj({ specific_criteria: v || null })}
        />
      </label>
    </div>
  )
}

function NouvelleEntreprise({ ordre }: { ordre: number }) {
  const enregistrer = useEnregistrer<Entreprise>('grant_companies', { erreurSurPlace: true })
  const [nom, setNom] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const ajouter = async () => {
    setErreur(null)
    try {
      await enregistrer.mutateAsync({ name: nom.trim(), slug: cleProgramme(nom), sort_order: ordre })
      setNom('')
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }
  return (
    <div>
      <div className="flex gap-2">
        <input
          className={ui.champ}
          placeholder="Ajouter une entreprise du groupe"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && nom.trim() && ajouter()}
        />
        <button className={ui.boutonSecondaire} disabled={!nom.trim() || enregistrer.isPending} onClick={ajouter}>
          <IconePlus /> Ajouter
        </button>
      </div>
      {erreur && <p className={`${ui.erreur} mt-2`}>{erreur}</p>}
    </div>
  )
}
