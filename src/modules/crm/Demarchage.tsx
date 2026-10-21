import { useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { ui } from '@/lib/ui'
import { depuis } from './calculs'
import { ChoixConseiller, NouvelleOrganisation, PuceStatut } from './commun'
import { useDonnees } from './contexte'
import { useModifierOrganisation } from './donnees'
import { ETAPES, nomGenre, type Etape } from './types'

// Type propre au glisser-déposer des cartes (ignore les fichiers, liens…).
const TYPE_GLISSE = 'application/x-crm-organisation'

/**
 * Pipeline de démarchage : Identification → Contacté → En conversation →
 * Conclusion. Une organisation qui devient cliente (séjour confirmé) quitte
 * le tableau d'elle-même. On change l'étape en glissant la carte dans une
 * autre colonne (ordinateur) ou par le menu de la carte (tablette, téléphone).
 */
export function Demarchage() {
  const { calculs, ecriture } = useDonnees()
  const [qui, setQui] = useState<string | null>(null)
  const [prioritaires, setPrioritaires] = useState(false)
  const [nouvelle, setNouvelle] = useState(false)
  const [survol, setSurvol] = useState<Etape | null>(null)
  const [glissee, setGlissee] = useState<string | null>(null)
  const modifier = useModifierOrganisation()

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
            <section
              key={e.id}
              className={`rounded-xl p-2 transition-colors ${survol === e.id ? 'bg-foret-100 ring-2 ring-foret-500' : 'bg-pierre-50'}`}
              onDragOver={(ev: DragEvent) => {
                if (!ecriture || !ev.dataTransfer.types.includes(TYPE_GLISSE)) return
                ev.preventDefault()
                ev.dataTransfer.dropEffect = 'move'
                setSurvol(e.id)
              }}
              // Quitter un enfant de la colonne n'est pas quitter la colonne.
              onDragLeave={(ev: DragEvent) => !ev.currentTarget.contains(ev.relatedTarget as Node | null) && setSurvol((s) => (s === e.id ? null : s))}
              onDrop={(ev: DragEvent) => {
                ev.preventDefault()
                setSurvol(null)
                const id = ev.dataTransfer.getData(TYPE_GLISSE)
                const carte = id && calculs.find((c) => c.org.id === id)
                if (carte && carte.org.etape !== e.id) modifier.mutate({ id, champs: { etape: e.id } })
              }}
            >
              <h2 className="px-1 pb-2 text-sm font-semibold text-pierre-700">
                {e.nom} <span className="font-normal text-pierre-400">{cartes.length}</span>
              </h2>
              <div className="min-h-16 space-y-2">
                {cartes.map((c) => (
                  <Carte
                    key={c.org.id}
                    id={c.org.id}
                    glissee={glissee === c.org.id}
                    debut={() => setGlissee(c.org.id)}
                    fin={() => {
                      setGlissee(null)
                      setSurvol(null)
                    }}
                  />
                ))}
                {cartes.length === 0 && <p className="px-1 py-3 text-xs text-pierre-400">Personne à cette étape.</p>}
              </div>
            </section>
          )
        })}
      </div>
      <p className="text-xs text-pierre-500">
        Après « Conclusion », la demande arrive dans Réservations : l'organisation devient cliente à la signature du contrat et quitte le tableau. Moins
        de cibles, mieux qualifiées : ⭐ marque les cibles « all-in ».
      </p>

      {nouvelle && <NouvelleOrganisation etape="identification" fermer={() => setNouvelle(false)} />}
    </div>
  )
}

function Carte({ id, glissee, debut, fin }: { id: string; glissee: boolean; debut: () => void; fin: () => void }) {
  const { parId, nomConseiller, ecriture } = useDonnees()
  const modifier = useModifierOrganisation()
  const c = parId.get(id)!
  const o = c.org
  return (
    <div
      draggable={ecriture}
      onDragStart={(e) => {
        e.dataTransfer.setData(TYPE_GLISSE, o.id)
        e.dataTransfer.effectAllowed = 'move'
        debut()
      }}
      onDragEnd={fin}
      className={`${ui.carte} p-2.5 ${ecriture ? 'cursor-grab active:cursor-grabbing' : ''} ${glissee ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link to={`/crm/o/${o.id}`} draggable={false} className="font-medium text-pierre-900 hover:text-foret-800 hover:underline">
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
