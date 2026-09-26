import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { messageErreur } from '@/lib/donnees'
import { IconePlus } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { useAjouterAnimateurs, useAnimateurs, useEnregistrerReglages, useEtatReglages } from './donnees'
import { ANIMATEURS_ORIGINE } from './logique'
import { META_TAG, TAGS, type Activite, type Reglages, type Tag } from './types'

/** Page des réglages communs à toutes les semaines (accessible même sans semaine). */
export function PageReglages({ surModif }: { surModif: (modifie: boolean) => void }) {
  const { reglages, charge, erreur, recharger } = useEtatReglages()
  if (erreur) {
    return (
      <p className={`${ui.erreur} flex items-center justify-between gap-3`}>
        Impossible de lire les réglages.
        <button className="underline" onClick={recharger}>
          Réessayer
        </button>
      </p>
    )
  }
  // On attend les vrais réglages : un formulaire parti des valeurs par
  // défaut les écraserait à l'enregistrement.
  if (!charge) return <p className="py-8 text-center text-sm text-pierre-500">Chargement des réglages…</p>
  return <FormulaireReglages reglages={reglages} surModif={surModif} />
}

function FormulaireReglages({ reglages, surModif }: { reglages: Reglages; surModif: (modifie: boolean) => void }) {
  const animateurs = useAnimateurs()
  const { estDirection } = useAuth()
  const enregistrer = useEnregistrerReglages()
  const ajouterAnimateurs = useAjouterAnimateurs()
  const [capacites, setCapacites] = useState(reglages.capacites)
  const [activites, setActivites] = useState<Activite[]>(() => copieActivites(reglages))
  const [sections, setSections] = useState(reglages.sections.join('\n'))
  const [nuits, setNuits] = useState(reglages.nuits.join('\n'))
  const [modifie, setModifie] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enregistre, setEnregistre] = useState(false)
  // Numéro de la dernière modification : un enregistrement ne vaut que pour
  // ce qui était saisi quand on l'a lancé.
  const revision = useRef(0)
  const manquants = ANIMATEURS_ORIGINE.filter((n) => !animateurs.includes(n))

  // Modifications non enregistrées : le module demande avant de quitter la
  // page, et le navigateur avant de fermer l'onglet.
  useEffect(() => {
    surModif(modifie)
    if (!modifie) return
    const avant = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', avant)
    return () => window.removeEventListener('beforeunload', avant)
  }, [modifie, surModif])
  useEffect(() => () => surModif(false), [surModif])

  // Réglages changés ailleurs (autre personne, rechargement) : repris tant
  // qu'on n'a rien modifié ici.
  const [base, setBase] = useState(reglages)
  if (reglages !== base) {
    setBase(reglages)
    if (!modifie) remettre(reglages)
  }

  function remettre(r: Reglages) {
    setCapacites(r.capacites)
    setActivites(copieActivites(r))
    setSections(r.sections.join('\n'))
    setNuits(r.nuits.join('\n'))
    setModifie(false)
    setErreur(null)
  }

  /** Enveloppe un changement : marque le formulaire comme modifié. */
  const changer =
    <T,>(f: (v: T) => void) =>
    (v: T) => {
      f(v)
      revision.current++
      setModifie(true)
      setEnregistre(false)
    }
  const majActivite = changer((m: { i: number; champs: Partial<Activite> }) =>
    setActivites((l) => l.map((a, n) => (n === m.i ? { ...a, ...m.champs } : a))),
  )
  const lignes = (t: string) => t.split('\n').map((s) => s.trim()).filter(Boolean)

  function sauver() {
    const vus = new Set<string>()
    const propres = activites
      .map((a) => ({ name: a.name.trim(), tags: a.tags }))
      .filter((a) => a.name && !vus.has(a.name) && vus.add(a.name))
    const valeur: Reglages = {
      capacites: {
        escalade: Math.max(1, capacites.escalade || 1),
        sauveteur: Math.max(1, capacites.sauveteur || 1),
        transport: Math.max(1, capacites.transport || 1),
      },
      activites: propres.length ? propres : reglages.activites,
      sections: lignes(sections).length ? lignes(sections) : reglages.sections,
      nuits: lignes(nuits).length ? lignes(nuits) : reglages.nuits,
    }
    const envoyee = revision.current
    enregistrer.mutate(valeur, {
      onSuccess: () => {
        // Saisie pendant l'envoi : elle reste « non enregistrée ».
        if (revision.current !== envoyee) return
        remettre(valeur)
        setEnregistre(true)
      },
      onError: (e) => setErreur(messageErreur(e)),
    })
  }

  const titre = 'text-base font-semibold'
  return (
    <div className="space-y-4 pb-20">
      <div>
        <h2 className="text-lg font-semibold">Réglages</h2>
        <p className="text-sm text-pierre-500">Communs à toutes les semaines et à tous les modèles.</p>
      </div>

      <section className={`${ui.carte} p-5`}>
        <h3 className={titre}>Capacités</h3>
        <p className="text-sm text-pierre-500">Au-delà, la grille signale un conflit.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
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
                onChange={(e) => changer(setCapacites)({ ...capacites, [t]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
      </section>

      <section className={`${ui.carte} p-5`}>
        <h3 className={titre}>Liste officielle des activités</h3>
        <p className="text-sm text-pierre-500">
          Elle alimente les suggestions des cases. L'étiquette indique si l'activité est de l'escalade, du transport ou du
          sauveteur : la détection des conflits et les horaires des spécialistes en découlent.
        </p>
        <ul className="mt-3 grid gap-x-6 gap-y-1.5 lg:grid-cols-2">
          {activites.map((a, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <input
                aria-label="Nom de l'activité"
                className="min-w-40 flex-1 rounded-md border border-pierre-300 px-2 py-1 text-sm"
                value={a.name}
                onChange={(e) => majActivite({ i, champs: { name: e.target.value } })}
              />
              {a.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full py-0.5 pl-2 pr-1 text-xs"
                  style={{ background: META_TAG[t].clair, boxShadow: `inset 3px 0 0 ${META_TAG[t].couleur}` }}
                >
                  {META_TAG[t].libelle}
                  <button
                    aria-label={`Retirer l'étiquette ${META_TAG[t].libelle}`}
                    onClick={() => majActivite({ i, champs: { tags: a.tags.filter((x) => x !== t) } })}
                  >
                    ×
                  </button>
                </span>
              ))}
              {a.tags.length < TAGS.length && (
                <select
                  aria-label="Ajouter une étiquette"
                  className="rounded-md border border-pierre-300 py-0.5 pl-1.5 text-xs"
                  value=""
                  onChange={(e) => e.target.value && majActivite({ i, champs: { tags: [...a.tags, e.target.value as Tag] } })}
                >
                  <option value="">+ étiquette</option>
                  {TAGS.filter((t) => !a.tags.includes(t)).map((t) => (
                    <option key={t} value={t}>
                      {META_TAG[t].libelle}
                    </option>
                  ))}
                </select>
              )}
              <button
                aria-label="Retirer l'activité"
                className="rounded px-1.5 text-red-700 hover:bg-red-50"
                onClick={() => changer(setActivites)(activites.filter((_, n) => n !== i))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <button className={`${ui.boutonSecondaire} mt-3`} onClick={() => changer(setActivites)([...activites, { name: '', tags: [] }])}>
          <IconePlus /> Activité
        </button>
      </section>

      <section className={`${ui.carte} grid gap-4 p-5 sm:grid-cols-2`}>
        <label>
          <span className={titre}>Sections de dortoir</span>
          <span className="mb-2 block text-sm text-pierre-500">Pour les chouettes, une par ligne.</span>
          <textarea rows={6} className={ui.champ} value={sections} onChange={(e) => changer(setSections)(e.target.value)} />
        </label>
        <label>
          <span className={titre}>Nuits avec soirées</span>
          <span className="mb-2 block text-sm text-pierre-500">
            Une par ligne. Un séjour peut avoir les siennes (« Jours et périodes »).
          </span>
          <textarea rows={6} className={ui.champ} value={nuits} onChange={(e) => changer(setNuits)(e.target.value)} />
        </label>
      </section>

      <section className={`${ui.carte} p-5`}>
        <h3 className={titre}>Animateurs</h3>
        <p className="text-sm text-pierre-500">
          {animateurs.length} animateur(s) actif(s), tirés du{' '}
          <Link to="/referentiel/employes" className="text-foret-700 underline">
            référentiel des employés
          </Link>
          .
        </p>
        {estDirection && manquants.length > 0 && (
          <button
            className={`${ui.boutonSecondaire} mt-3`}
            disabled={ajouterAnimateurs.isPending}
            onClick={() => ajouterAnimateurs.mutate(manquants)}
          >
            Ajouter au référentiel les {manquants.length} animateurs de l'ancienne liste
          </button>
        )}
      </section>

      {/* Barre d'enregistrement, visible dès qu'il y a une modification. */}
      {(modifie || enregistre) && (
        <div className="sticky bottom-4 z-10 mx-auto flex w-fit items-center gap-3 rounded-full border border-pierre-200 bg-white py-2 pl-5 pr-2 shadow-lg">
          <span className={`text-sm ${modifie && erreur ? 'text-red-700' : 'text-pierre-700'}`} role="status">
            {modifie ? (erreur ?? 'Modifications non enregistrées') : '✓ Réglages enregistrés'}
          </span>
          {modifie ? (
            <>
              <button className={ui.boutonSecondaire} onClick={() => remettre(reglages)}>
                Annuler
              </button>
              <button className={ui.bouton} disabled={enregistrer.isPending} onClick={sauver}>
                {enregistrer.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </>
          ) : (
            <button aria-label="Fermer" className="rounded-full px-2.5 py-1 text-pierre-500 hover:bg-pierre-100" onClick={() => setEnregistre(false)}>
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const copieActivites = (r: Reglages) => r.activites.map((a) => ({ ...a, tags: [...a.tags] }))
