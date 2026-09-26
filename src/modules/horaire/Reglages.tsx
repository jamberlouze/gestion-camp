import { useState } from 'react'
import { Link } from 'react-router'
import { Dialogue } from '@/lib/Dialogue'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { useSemaine } from './contexte'
import { useAjouterAnimateurs, useEnregistrerReglages } from './donnees'
import { ANIMATEURS_ORIGINE } from './logique'
import { META_TAG, TAGS, type Activite, type Tag } from './types'

/** Réglages communs à toutes les semaines. */
export function Reglages({ fermer }: { fermer: () => void }) {
  const { reglages, animateurs } = useSemaine()
  const { estDirection } = useAuth()
  const enregistrer = useEnregistrerReglages()
  const ajouterAnimateurs = useAjouterAnimateurs()
  const [capacites, setCapacites] = useState(reglages.capacites)
  const [activites, setActivites] = useState<Activite[]>(reglages.activites.map((a) => ({ ...a, tags: [...a.tags] })))
  const [sections, setSections] = useState(reglages.sections.join('\n'))
  const [nuits, setNuits] = useState(reglages.nuits.join('\n'))
  const manquants = ANIMATEURS_ORIGINE.filter((n) => !animateurs.includes(n))

  const majActivite = (i: number, champs: Partial<Activite>) => setActivites((l) => l.map((a, n) => (n === i ? { ...a, ...champs } : a)))
  const lignes = (t: string) => t.split('\n').map((s) => s.trim()).filter(Boolean)

  function sauver() {
    const vus = new Set<string>()
    const propres = activites
      .map((a) => ({ name: a.name.trim(), tags: a.tags }))
      .filter((a) => a.name && !vus.has(a.name) && vus.add(a.name))
    enregistrer.mutate({
      capacites: {
        escalade: Math.max(1, capacites.escalade || 1),
        sauveteur: Math.max(1, capacites.sauveteur || 1),
        transport: Math.max(1, capacites.transport || 1),
      },
      activites: propres.length ? propres : reglages.activites,
      sections: lignes(sections).length ? lignes(sections) : reglages.sections,
      nuits: lignes(nuits).length ? lignes(nuits) : reglages.nuits,
    })
    fermer()
  }

  return (
    <Dialogue titre="Réglages de l'horaire" fermer={fermer} large>
      <p className="text-sm text-pierre-500">Communs à toutes les semaines.</p>

      <h3 className="mt-4 text-sm font-semibold">Capacités (détection des conflits)</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        {(
          [
            ['escalade', 'Escalade — groupes max par période'],
            ['sauveteur', "Sauveteur — groupes max au plan d'eau"],
            ['transport', 'Transport — sorties max par période'],
          ] as [Tag, string][]
        ).map(([t, libelle]) => (
          <label key={t} className="text-sm">
            <span className={ui.etiquette}>{libelle}</span>
            <input
              type="number"
              min={1}
              className={ui.champ}
              value={capacites[t]}
              onChange={(e) => setCapacites({ ...capacites, [t]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>

      <h3 className="mt-5 text-sm font-semibold">Liste officielle des activités</h3>
      <p className="text-sm text-pierre-500">
        Elle alimente les suggestions des cases. L'étiquette indique si l'activité est de l'escalade, du transport ou du
        sauveteur : la détection des conflits et les horaires des spécialistes en découlent.
      </p>
      <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-pierre-200 p-2">
        {activites.map((a, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Nom de l'activité"
              className="min-w-40 flex-1 rounded border border-pierre-300 px-2 py-1 text-sm"
              value={a.name}
              onChange={(e) => majActivite(i, { name: e.target.value })}
            />
            {a.tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full py-0.5 pl-2 pr-1 text-xs"
                style={{ background: META_TAG[t].clair, boxShadow: `inset 3px 0 0 ${META_TAG[t].couleur}` }}
              >
                {META_TAG[t].libelle}
                <button aria-label={`Retirer l'étiquette ${META_TAG[t].libelle}`} onClick={() => majActivite(i, { tags: a.tags.filter((x) => x !== t) })}>
                  ×
                </button>
              </span>
            ))}
            {a.tags.length < TAGS.length && (
              <select
                aria-label="Ajouter une étiquette"
                className="rounded border border-pierre-300 px-1 py-0.5 text-xs"
                value=""
                onChange={(e) => e.target.value && majActivite(i, { tags: [...a.tags, e.target.value as Tag] })}
              >
                <option value="">+ étiquette</option>
                {TAGS.filter((t) => !a.tags.includes(t)).map((t) => (
                  <option key={t} value={t}>
                    {META_TAG[t].libelle}
                  </option>
                ))}
              </select>
            )}
            <button aria-label="Retirer l'activité" className="rounded px-1.5 text-red-700 hover:bg-red-50" onClick={() => setActivites((l) => l.filter((_, n) => n !== i))}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button className={`${ui.boutonSecondaire} mt-2`} onClick={() => setActivites((l) => [...l, { name: '', tags: [] }])}>
        + Activité
      </button>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label>
          <span className={ui.etiquette}>Sections de dortoir (chouettes), une par ligne</span>
          <textarea rows={6} className={ui.champ} value={sections} onChange={(e) => setSections(e.target.value)} />
        </label>
        <label>
          <span className={ui.etiquette}>Nuits avec soirées, une par ligne</span>
          <textarea rows={6} className={ui.champ} value={nuits} onChange={(e) => setNuits(e.target.value)} />
        </label>
      </div>

      <h3 className="mt-5 text-sm font-semibold">Animateurs</h3>
      <p className="text-sm text-pierre-500">
        {animateurs.length} animateur(s) actif(s), tirés du{' '}
        <Link to="/referentiel/employes" className="text-foret-700 underline" onClick={fermer}>
          référentiel des employés
        </Link>
        .
      </p>
      {estDirection && manquants.length > 0 && (
        <button
          className={`${ui.boutonSecondaire} mt-2`}
          disabled={ajouterAnimateurs.isPending}
          onClick={() => ajouterAnimateurs.mutate(manquants)}
        >
          Ajouter au référentiel les {manquants.length} animateurs de l'ancienne liste
        </button>
      )}

      <div className="mt-6 flex justify-end gap-2 border-t border-pierre-100 pt-4">
        <button className={ui.boutonSecondaire} onClick={fermer}>
          Annuler
        </button>
        <button className={ui.bouton} onClick={sauver}>
          Enregistrer
        </button>
      </div>
    </Dialogue>
  )
}
