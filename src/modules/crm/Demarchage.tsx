import { useState } from 'react'
import { Link } from 'react-router'
import { ui } from '@/lib/ui'
import { depuis } from './calculs'
import { ChoixConseiller, NouvelleOrganisation, PuceStatut } from './commun'
import { useDonnees } from './contexte'
import { useModifierOrganisation } from './donnees'
import { ETAPES, nomGenre, type Etape } from './types'

/**
 * Pipeline de démarchage : Identification → Contacté → En conversation →
 * Conclusion. Une organisation qui devient cliente (séjour confirmé) quitte
 * le tableau d'elle-même.
 */
export function Demarchage() {
  const { calculs, ecriture } = useDonnees()
  const [qui, setQui] = useState<string | null>(null)
  const [prioritaires, setPrioritaires] = useState(false)
  const [nouvelle, setNouvelle] = useState(false)

  const enCours = calculs.filter(
    (c) => c.org.etape && c.statut !== 'client' && (!qui || c.org.conseiller_id === qui) && (!prioritaires || c.org.prioritaire),
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <ChoixConseiller valeur={qui} changer={setQui} vide="Tout le monde" />
        <label className="flex items-center gap-2 text-sm text-pierre-700">
          <input type="checkbox" checked={prioritaires} onChange={(e) => setPrioritaires(e.target.checked)} />
          ⭐ Cibles prioritaires seulement
        </label>
        {ecriture && (
          <button className={`${ui.bouton} ml-auto`} onClick={() => setNouvelle(true)}>
            + Cible
          </button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {ETAPES.map((e) => {
          const cartes = enCours
            .filter((c) => c.org.etape === e.id)
            .sort((a, b) => Number(b.org.prioritaire) - Number(a.org.prioritaire) || a.org.nom.localeCompare(b.org.nom, 'fr'))
          return (
            <section key={e.id} className="rounded-xl bg-pierre-50 p-2">
              <h2 className="px-1 pb-2 text-sm font-semibold text-pierre-700">
                {e.nom} <span className="font-normal text-pierre-400">{cartes.length}</span>
              </h2>
              <div className="space-y-2">
                {cartes.map((c) => (
                  <Carte key={c.org.id} id={c.org.id} />
                ))}
                {cartes.length === 0 && <p className="px-1 py-3 text-xs text-pierre-400">Personne à cette étape.</p>}
              </div>
            </section>
          )
        })}
      </div>
      <p className="text-xs text-pierre-500">
        Après « Conclusion », la demande de réservation arrive dans Airtable : l'organisation devient cliente et quitte le tableau. Moins de cibles, mieux
        qualifiées : ⭐ marque les cibles « all-in ».
      </p>

      {nouvelle && <NouvelleOrganisation etape="identification" fermer={() => setNouvelle(false)} />}
    </div>
  )
}

function Carte({ id }: { id: string }) {
  const { parId, nomConseiller, ecriture } = useDonnees()
  const modifier = useModifierOrganisation()
  const c = parId.get(id)!
  const o = c.org
  return (
    <div className={`${ui.carte} p-2.5`}>
      <div className="flex items-start justify-between gap-2">
        <Link to={`/crm/o/${o.id}`} className="font-medium text-pierre-900 hover:text-foret-800 hover:underline">
          {o.prioritaire && '⭐ '}
          {o.nom}
        </Link>
        <PuceStatut statut={c.statut} />
      </div>
      <p className="mt-0.5 text-xs text-pierre-500">
        {nomGenre(o.genre)}
        {o.ville && ` · ${o.ville}`} · contact {depuis(c.dernierEchange ? c.joursInactifs : null)}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-pierre-500">{nomConseiller(o.conseiller_id) ?? 'Sans conseiller'}</span>
        {ecriture && (
          <select
            aria-label={`Étape de ${o.nom}`}
            className="fleche-serree rounded-md border border-pierre-300 bg-white py-0.5 pl-2 text-xs"
            value={o.etape ?? ''}
            onChange={(e) => modifier.mutate({ id: o.id, champs: { etape: (e.target.value || null) as Etape | null } })}
          >
            {ETAPES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nom}
              </option>
            ))}
            <option value="">Retirer du démarchage</option>
          </select>
        )}
      </div>
    </div>
  )
}
