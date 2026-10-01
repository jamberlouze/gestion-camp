import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ChampTexte } from '@/lib/ChampTexte'
import { messageErreur } from '@/lib/donnees'
import { IconeCorbeille, IconePlus } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import {
  trierNoms,
  useEnregistrerFonction,
  useEnregistrerPersonne,
  useEnregistrerReglagesHoraire,
  useReglagesHoraire,
  useSupprimerFonction,
  useSupprimerPersonne,
  useTable,
} from './donnees'
import { formatHeures, heuresQuart } from './quarts'
import type { Fonction, Personne } from './types'

// Équipe de cuisine, fonctions (avec leur couleur) et réglages de l'horaire
// du personnel : quarts proposés en un clic et statuts (OFF, Vacance…).

const compact =
  'rounded-md border border-pierre-300 bg-white px-2 py-1 text-sm focus:border-foret-600 focus:outline-none focus:ring-2 focus:ring-foret-600/20'
const boutonOrdre = 'rounded px-1.5 py-1 text-pierre-500 hover:bg-pierre-100 disabled:opacity-30'
const titre = 'text-base font-semibold'
const memeNom = (a: string, b: string) => a.toLocaleLowerCase('fr-CA') === b.toLocaleLowerCase('fr-CA')

/**
 * Échange les éléments i et j d'une liste triée : l'ordre est renuméroté
 * de 1 à n dans l'ordre affiché. Renvoie les lignes dont l'ordre change.
 */
function echanger<T extends { ordre: number }>(liste: T[], i: number, j: number): T[] {
  return liste.map((x, n) => ({ ...x, ordre: (n === i ? j : n === j ? i : n) + 1 })).filter((x, n) => x.ordre !== liste[n].ordre)
}

export function Equipe() {
  const { peutEcrire } = useAuth()
  const ecriture = peutEcrire('commande')
  const personnel = useTable('personnel')
  const fonctions = useTable('fonctions')
  const parametres = useTable('parametres')

  const erreur = personnel.error ?? fonctions.error ?? parametres.error
  // On attend les vrais réglages : une liste partie des valeurs par défaut
  // les écraserait au premier ajout.
  if (!personnel.data || !fonctions.data || !parametres.data) {
    if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
    return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
  }

  const listeFonctions = [...fonctions.data].sort((a, b) => a.ordre - b.ordre || trierNoms(a.nom, b.nom))
  return (
    <>
      {/* Données déjà affichées mais une mise à jour a échoué : on garde la page. */}
      {erreur && (
        <p className={`${ui.erreur} mb-3`}>
          Actualisation impossible : {messageErreur(erreur)}{' '}
          <button
            className="underline"
            onClick={() => {
              void personnel.refetch()
              void fonctions.refetch()
              void parametres.refetch()
            }}
          >
            Réessayer
          </button>
        </p>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <CarteEquipe personnel={personnel.data} fonctions={listeFonctions} ecriture={ecriture} />
        <CarteFonctions fonctions={listeFonctions} personnel={personnel.data} ecriture={ecriture} />
        <CarteQuarts ecriture={ecriture} />
      </div>
    </>
  )
}

// ------------------------------------------------------------------
// Équipe de cuisine
// ------------------------------------------------------------------

function CarteEquipe({ personnel, fonctions, ecriture }: { personnel: Personne[]; fonctions: Fonction[]; ecriture: boolean }) {
  const enregistrer = useEnregistrerPersonne()
  const supprimer = useSupprimerPersonne()
  const [nom, setNom] = useState('')
  const [fonction, setFonction] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  const fonctionDe = new Map(fonctions.map((f) => [f.id, f]))
  const fonctionOf = (p: Personne) => (p.fonction_id ? fonctionDe.get(p.fonction_id) : undefined)
  // Comme dans l'horaire : actifs d'abord, puis par fonction (sans fonction
  // à la fin), ordre et nom.
  const rang = (p: Personne) => fonctionOf(p)?.ordre ?? Infinity
  const liste = [...personnel].sort(
    (a, b) =>
      Number(b.actif) - Number(a.actif) ||
      rang(a) - rang(b) ||
      trierNoms(fonctionOf(a)?.nom ?? '', fonctionOf(b)?.nom ?? '') ||
      a.ordre - b.ordre ||
      trierNoms(a.nom, b.nom),
  )
  const actifs = liste.filter((p) => p.actif).length
  // L'horaire range par fonction : l'ordre se règle entre personnes de même
  // fonction (et de même état).
  const voisin = (i: number, j: number) =>
    !!liste[j] && liste[j].actif === liste[i].actif && liste[j].fonction_id === liste[i].fonction_id
  const deplacer = (i: number, j: number) => echanger(liste, i, j).forEach((p) => enregistrer.mutate(p))
  const maj = (p: Personne, champs: Partial<Personne>) => enregistrer.mutate({ ...p, ...champs })

  function ajouter(e: FormEvent) {
    e.preventDefault()
    const propre = nom.trim()
    if (!propre) return
    if (personnel.some((p) => memeNom(p.nom, propre))) return setErreur(`« ${propre} » est déjà dans l'équipe.`)
    enregistrer.mutate({
      id: crypto.randomUUID(),
      nom: propre,
      fonction_id: fonction || null,
      actif: true,
      ordre: Math.max(0, ...personnel.map((p) => p.ordre)) + 1,
    })
    setNom('')
    setErreur(null)
  }

  return (
    <section className={`${ui.carte} p-5 lg:row-span-2`}>
      <h3 className={titre}>
        Équipe de cuisine{' '}
        <span className="font-normal text-pierre-500">
          ({actifs} actif{actifs > 1 ? 's' : ''})
        </span>
      </h3>
      <p className="text-sm text-pierre-500">
        Les membres actifs ont une ligne dans l'horaire. Décochez « Actif » pour retirer quelqu'un sans perdre ses quarts passés.
      </p>

      <ul className="mt-3 divide-y divide-pierre-100">
        {liste.map((p, i) => {
          const f = fonctionOf(p)
          return (
            <li key={p.id}>
              {i > 0 && !p.actif && liste[i - 1].actif && (
                <p className="pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-pierre-500">Inactifs</p>
              )}
              <div className="flex flex-wrap items-center gap-2 py-1.5">
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full border border-black/10"
                  style={{ background: f?.couleur ?? 'transparent' }}
                />
                {ecriture ? (
                  <>
                    <ChampTexte
                      aria-label={`Nom de ${p.nom}`}
                      obligatoire
                      className={`${compact} min-w-32 flex-1 ${p.actif ? 'font-medium' : 'text-pierre-500'}`}
                      valeur={p.nom}
                      enregistrer={(v) => maj(p, { nom: v })}
                    />
                    <select
                      aria-label={`Fonction de ${p.nom}`}
                      className={`${compact} w-36`}
                      value={p.fonction_id ?? ''}
                      onChange={(e) => maj(p, { fonction_id: e.target.value || null })}
                    >
                      <option value="">—</option>
                      {fonctions.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.nom}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-sm text-pierre-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-foret-700"
                        checked={p.actif}
                        onChange={(e) => maj(p, { actif: e.target.checked })}
                      />
                      Actif
                    </label>
                    <span className="flex">
                      <button
                        aria-label={`Monter ${p.nom}`}
                        title="Monter (parmi les personnes de même fonction)"
                        className={boutonOrdre}
                        disabled={!voisin(i, i - 1)}
                        onClick={() => deplacer(i, i - 1)}
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`Descendre ${p.nom}`}
                        title="Descendre (parmi les personnes de même fonction)"
                        className={boutonOrdre}
                        disabled={!voisin(i, i + 1)}
                        onClick={() => deplacer(i, i + 1)}
                      >
                        ↓
                      </button>
                    </span>
                    <button
                      aria-label={`Supprimer ${p.nom}`}
                      className="rounded p-1.5 text-red-700 hover:bg-red-50"
                      onClick={() =>
                        confirm(`Supprimer ${p.nom} et tous ses quarts ? Pour garder l'historique, décochez plutôt « Actif ».`) &&
                        supprimer.mutate(p.id)
                      }
                    >
                      <IconeCorbeille />
                    </button>
                  </>
                ) : (
                  <>
                    <span className={`flex-1 text-sm ${p.actif ? 'font-medium' : 'text-pierre-500'}`}>{p.nom}</span>
                    <span className="text-sm text-pierre-500">{f?.nom ?? '—'}</span>
                  </>
                )}
              </div>
            </li>
          )
        })}
        {liste.length === 0 && <li className="py-3 text-sm text-pierre-500">Aucun membre pour l'instant.</li>}
      </ul>

      {ecriture && (
        <form onSubmit={ajouter} className="mt-3 border-t border-pierre-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Nom du nouveau membre"
              placeholder="Nom"
              className={`${ui.champ} min-w-40 flex-1`}
              value={nom}
              onChange={(e) => {
                setNom(e.target.value)
                setErreur(null)
              }}
            />
            <select aria-label="Fonction du nouveau membre" className={`${ui.champ} max-w-44`} value={fonction} onChange={(e) => setFonction(e.target.value)}>
              <option value="">— Fonction —</option>
              {fonctions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nom}
                </option>
              ))}
            </select>
            <button className={ui.bouton} disabled={!nom.trim()}>
              <IconePlus /> Ajouter
            </button>
          </div>
          {erreur && <p className="mt-1 text-xs text-red-700">{erreur}</p>}
        </form>
      )}
    </section>
  )
}

// ------------------------------------------------------------------
// Fonctions
// ------------------------------------------------------------------

function CarteFonctions({ fonctions, personnel, ecriture }: { fonctions: Fonction[]; personnel: Personne[]; ecriture: boolean }) {
  const enregistrer = useEnregistrerFonction()
  const supprimer = useSupprimerFonction()
  const [nom, setNom] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const nombre = (id: string) => personnel.filter((p) => p.fonction_id === id).length

  function ajouter(e: FormEvent) {
    e.preventDefault()
    const propre = nom.trim()
    if (!propre) return
    if (fonctions.some((f) => memeNom(f.nom, propre))) return setErreur(`La fonction « ${propre} » existe déjà.`)
    enregistrer.mutate({
      id: crypto.randomUUID(),
      nom: propre,
      couleur: '#e7e5e4',
      ordre: Math.max(0, ...fonctions.map((f) => f.ordre)) + 1,
    })
    setNom('')
    setErreur(null)
  }

  function retirer(f: Fonction) {
    const n = nombre(f.id)
    const suite = !n ? '' : n === 1 ? " La personne qui l'a n'aura plus de fonction." : ` Les ${n} personnes qui l'ont n'auront plus de fonction.`
    if (confirm(`Supprimer la fonction « ${f.nom} » ?${suite}`)) supprimer.mutate(f.id)
  }

  return (
    <section className={`${ui.carte} p-5`}>
      <h3 className={titre}>Fonctions</h3>
      <p className="text-sm text-pierre-500">Leur couleur colore la case « Fonction » de l'horaire ; l'horaire est rangé dans cet ordre.</p>
      <ul className="mt-3 space-y-1.5">
        {fonctions.map((f, i) => {
          const n = nombre(f.id)
          return (
            <li key={f.id} className="flex items-center gap-2">
              {ecriture ? (
                <>
                  <ChoixCouleur valeur={f.couleur} nom={f.nom} enregistrer={(couleur) => enregistrer.mutate({ ...f, couleur })} />
                  <ChampTexte
                    aria-label={`Nom de la fonction ${f.nom}`}
                    obligatoire
                    className={`${compact} min-w-0 flex-1`}
                    valeur={f.nom}
                    enregistrer={(v) => enregistrer.mutate({ ...f, nom: v })}
                  />
                </>
              ) : (
                <span className="flex-1 rounded-md px-2 py-1 text-sm font-medium" style={{ background: f.couleur }}>
                  {f.nom}
                </span>
              )}
              <span className="w-24 shrink-0 text-right text-xs tabular-nums text-pierre-500">
                {n ? `${n} membre${n > 1 ? 's' : ''}` : 'aucun membre'}
              </span>
              {ecriture && (
                <>
                  <span className="flex">
                    <button aria-label={`Monter ${f.nom}`} className={boutonOrdre} disabled={i === 0} onClick={() => echanger(fonctions, i, i - 1).forEach((x) => enregistrer.mutate(x))}>
                      ↑
                    </button>
                    <button
                      aria-label={`Descendre ${f.nom}`}
                      className={boutonOrdre}
                      disabled={i === fonctions.length - 1}
                      onClick={() => echanger(fonctions, i, i + 1).forEach((x) => enregistrer.mutate(x))}
                    >
                      ↓
                    </button>
                  </span>
                  <button aria-label={`Supprimer la fonction ${f.nom}`} className="rounded p-1.5 text-red-700 hover:bg-red-50" onClick={() => retirer(f)}>
                    <IconeCorbeille />
                  </button>
                </>
              )}
            </li>
          )
        })}
        {fonctions.length === 0 && <li className="text-sm text-pierre-500">Aucune fonction.</li>}
      </ul>
      {ecriture && (
        <form onSubmit={ajouter} className="mt-3 border-t border-pierre-100 pt-3">
          <div className="flex items-center gap-2">
            <input
              aria-label="Nom de la nouvelle fonction"
              placeholder="ex. Plongeur"
              className={`${ui.champ} min-w-0 flex-1`}
              value={nom}
              onChange={(e) => {
                setNom(e.target.value)
                setErreur(null)
              }}
            />
            <button className={ui.boutonSecondaire} disabled={!nom.trim()}>
              <IconePlus /> Ajouter
            </button>
          </div>
          {erreur && <p className="mt-1 text-xs text-red-700">{erreur}</p>}
        </form>
      )}
    </section>
  )
}

/**
 * Couleur d'une fonction : l'aperçu suit le sélecteur, l'enregistrement
 * attend sa fermeture (l'événement « change » natif ; onChange de React
 * suivrait chaque mouvement de la souris).
 */
function ChoixCouleur({ valeur, nom, enregistrer }: { valeur: string; nom: string; enregistrer: (couleur: string) => void }) {
  const [couleur, setCouleur] = useState(valeur)
  const [base, setBase] = useState(valeur)
  if (valeur !== base) {
    setBase(valeur)
    setCouleur(valeur)
  }
  const champ = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = champ.current
    if (!el) return
    const fini = () => {
      if (el.value !== valeur) enregistrer(el.value)
    }
    el.addEventListener('change', fini)
    return () => el.removeEventListener('change', fini)
  })
  return (
    <input
      ref={champ}
      type="color"
      aria-label={`Couleur de ${nom}`}
      className="h-7 w-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
      value={couleur}
      onChange={(e) => setCouleur(e.target.value)}
    />
  )
}

// ------------------------------------------------------------------
// Quarts proposés et statuts
// ------------------------------------------------------------------

function CarteQuarts({ ecriture }: { ecriture: boolean }) {
  const reglages = useReglagesHoraire()
  const enregistrer = useEnregistrerReglagesHoraire()
  return (
    <section className={`${ui.carte} space-y-5 p-5`}>
      <div>
        <h3 className={titre}>Quarts proposés</h3>
        <p className="text-sm text-pierre-500">Proposés dans les cases de l'horaire et en un clic au-dessus de la grille.</p>
        <ListePuces
          valeurs={reglages.quarts}
          ecriture={ecriture}
          etiquette="Nouveau quart"
          placeholder="ex. 6h30 à 14h30"
          heures
          enregistrer={(quarts) => enregistrer.mutate({ ...reglages, quarts })}
        />
      </div>
      <div>
        <h3 className={titre}>Statuts</h3>
        <p className="text-sm text-pierre-500">
          Aussi proposés dans les cases. Les statuts (OFF, Vacance…) ne comptent pas comme jours travaillés.
        </p>
        <ListePuces
          valeurs={reglages.statuts}
          ecriture={ecriture}
          etiquette="Nouveau statut"
          placeholder="ex. Formation"
          enregistrer={(statuts) => enregistrer.mutate({ ...reglages, statuts })}
        />
      </div>
    </section>
  )
}

function ListePuces({
  valeurs,
  ecriture,
  etiquette,
  placeholder,
  heures,
  enregistrer,
}: {
  valeurs: string[]
  ecriture: boolean
  etiquette: string
  placeholder: string
  /** Affiche la durée des quarts chiffrés. */
  heures?: boolean
  enregistrer: (valeurs: string[]) => void
}) {
  const [texte, setTexte] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const propre = texte.trim()
  const duree = heures && propre ? heuresQuart(propre) : null

  function ajouter(e: FormEvent) {
    e.preventDefault()
    if (!propre) return
    if (valeurs.some((v) => memeNom(v, propre))) return setErreur(`« ${propre} » est déjà dans la liste.`)
    enregistrer([...valeurs, propre])
    setTexte('')
    setErreur(null)
  }

  return (
    <div>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {valeurs.map((v, i) => {
          const h = heures ? heuresQuart(v) : null
          return (
            <li key={`${i}-${v}`} className={`inline-flex items-center gap-1 rounded-full bg-pierre-100 py-0.5 pl-2.5 text-sm ${ecriture ? 'pr-1' : 'pr-2.5'}`}>
              {v}
              {h != null && <span className="text-xs text-pierre-500">· {formatHeures(h)}</span>}
              {ecriture && (
                <button
                  aria-label={`Retirer ${v}`}
                  className="rounded-full px-1 text-pierre-500 hover:bg-pierre-200 hover:text-pierre-900"
                  onClick={() => enregistrer(valeurs.filter((_, n) => n !== i))}
                >
                  ×
                </button>
              )}
            </li>
          )
        })}
        {valeurs.length === 0 && <li className="text-sm text-pierre-500">Aucun.</li>}
      </ul>
      {ecriture && (
        <form onSubmit={ajouter} className="mt-2 flex flex-wrap items-center gap-2">
          <input
            aria-label={etiquette}
            placeholder={placeholder}
            className={`${ui.champ} max-w-48`}
            value={texte}
            onChange={(e) => {
              setTexte(e.target.value)
              setErreur(null)
            }}
          />
          <button className={ui.boutonSecondaire} disabled={!propre}>
            Ajouter
          </button>
          {heures && propre && (
            <span className={`text-sm ${duree != null ? 'text-pierre-700' : 'text-amber-700'}`}>
              {duree != null ? `= ${formatHeures(duree)}` : 'heures non reconnues'}
            </span>
          )}
        </form>
      )}
      {erreur && <p className="mt-1 text-xs text-red-700">{erreur}</p>}
    </div>
  )
}
