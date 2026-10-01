import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { trierNoms, useEcrireQuart, useLireQuarts, useQuarts, useReglagesHoraire, useRemplacerQuarts, useTable } from './donnees'
import {
  JOURS,
  ajouterJours,
  dateCourte,
  debutQuart,
  depuisIso,
  estStatut,
  estVide,
  formatHeures,
  joursDeLaSemaine,
  lundiDe,
  titreSemaine,
  totalHeures,
  travaille,
  versIso,
} from './quarts'
import type { Fonction, Personne, Quart } from './types'

// Horaire du personnel de cuisine : une semaine (lundi → dimanche) à la fois,
// comme l'ancienne feuille Google « Cuisine automne 2026 ». Chaque case garde
// le texte tel qu'écrit ; les heures sont calculées à l'affichage (quarts.ts).

const ISO = /^\d{4}-\d{2}-\d{2}$/
const LISTE_QUARTS = 'quarts-cuisine'
const IMPRESSION = '@media print { @page { size: landscape; margin: 1cm } }'

/** Lundi demandé dans l'adresse (?semaine=AAAA-MM-JJ), sinon celui de la semaine en cours. */
function lundiDemande(valeur: string | null, aujourdhui: string) {
  const valide = !!valeur && ISO.test(valeur) && !Number.isNaN(depuisIso(valeur).getTime())
  return lundiDe(valide ? valeur : aujourdhui)
}

/** 6,5 → « 6h30 », 11 → « 11h ». */
function heure(h: number) {
  const minutes = Math.round((h % 1) * 60)
  return `${Math.floor(h)}h${minutes ? String(minutes).padStart(2, '0') : ''}`
}

/** Texte blanc sur une couleur foncée (fonction), sinon la couleur du texte. */
function encre(fond: string) {
  const m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(fond)
  if (!m) return undefined
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16))
  return 0.299 * r + 0.587 * g + 0.114 * b < 140 ? '#fff' : undefined
}

/** Par fonction (sans fonction à la fin), puis ordre de la personne, puis nom. */
function comparer(fonctions: Map<string, Fonction>) {
  const fonction = (p: Personne) => (p.fonction_id ? fonctions.get(p.fonction_id) : undefined)
  const rang = (p: Personne) => fonction(p)?.ordre ?? Infinity
  return (a: Personne, b: Personne) =>
    rang(a) - rang(b) || trierNoms(fonction(a)?.nom ?? '', fonction(b)?.nom ?? '') || a.ordre - b.ordre || trierNoms(a.nom, b.nom)
}

/** Apparence d'une case selon son contenu (statut, tiret, aujourd'hui). */
function styleCase(texte: string, statuts: string[], aujourdhui: boolean) {
  if (!estVide(texte) && estStatut(texte, statuts)) {
    return estStatut(texte, ['Vacance']) ? 'bg-amber-50 italic text-amber-800' : 'bg-pierre-50 italic text-pierre-500'
  }
  const fond = aujourdhui ? 'bg-foret-50/60 print:bg-transparent' : ''
  return estVide(texte) ? `${fond} text-pierre-400` : fond
}

/** Case de l'horaire, vue de la page : son champ et de quoi la remplir d'un clic. */
interface Poignee {
  champ: HTMLInputElement
  remplir: (texte: string) => void
}

const cleCase = (personneId: string, jour: string) => `${personneId}|${jour}`

export function HoraireCuisine() {
  const { peutEcrire } = useAuth()
  const ecriture = peutEcrire('commande')
  const [params, setParams] = useSearchParams()
  const aujourdhui = versIso(new Date())
  const lundi = lundiDemande(params.get('semaine'), aujourdhui)
  const jours = joursDeLaSemaine(lundi)
  const dimanche = jours[6]
  const lundiPrecedent = ajouterJours(lundi, -7)

  const personnel = useTable('personnel')
  const fonctions = useTable('fonctions')
  // Réglages (statuts, quarts) : attendus comme le reste, sinon les valeurs
  // par défaut compteraient un statut ajouté (ex. « Formation ») comme travaillé.
  const parametres = useTable('parametres')
  const reglages = useReglagesHoraire()
  const quarts = useQuarts(lundi, dimanche)
  const ecrire = useEcrireQuart(lundi, dimanche)
  const remplacer = useRemplacerQuarts(lundi, dimanche)
  const lireQuarts = useLireQuarts()
  const [message, setMessage] = useState<{ lundi: string; texte: string; erreur?: boolean } | null>(null)
  // Copie en cours (lecture de la semaine précédente comprise) : un double
  // clic ne lance pas deux copies. Réf. : vérifiée avant tout nouveau rendu.
  const [copieEnCours, setCopieEnCours] = useState(false)
  const enCopie = useRef(false)
  /** Case qui a le focus : les boutons de quarts la remplissent. */
  const [active, setActive] = useState<{ personneId: string; jour: string } | null>(null)
  const cases = useRef(new Map<string, Poignee>())
  // Semaine affichée, lue après une attente (copie) : les écritures visent
  // toujours la semaine affichée.
  const semaine = useRef(lundi)
  useEffect(() => {
    semaine.current = lundi
  }, [lundi])

  const aller = (iso: string) => setParams({ semaine: lundiDe(iso) }, { replace: true })

  const erreur = personnel.error ?? fonctions.error ?? parametres.error ?? quarts.error
  /** Navigation entre les semaines, titre (aussi imprimé) et actions à droite. */
  const entete = (actions?: ReactNode) => (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 print:hidden">
        <button className={ui.boutonSecondaire} aria-label="Semaine précédente" onClick={() => aller(lundiPrecedent)}>
          ←
        </button>
        <button className={ui.boutonSecondaire} disabled={lundi === lundiDe(aujourdhui)} onClick={() => aller(aujourdhui)}>
          Aujourd'hui
        </button>
        <button className={ui.boutonSecondaire} aria-label="Semaine suivante" onClick={() => aller(ajouterJours(lundi, 7))}>
          →
        </button>
        <SautDate lundi={lundi} aller={aller} />
      </div>
      <h2 className="text-lg font-semibold sm:ml-2">
        <span className="hidden print:inline">Horaire de la cuisine · </span>
        {titreSemaine(lundi)}
      </h2>
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
    </div>
  )

  // L'en-tête reste le premier enfant dans tous les cas (chargement, erreur,
  // grille) : React le garde, et le champ de date ou les flèches ne perdent
  // pas le focus en arrivant sur une semaine pas encore chargée.
  if (!personnel.data || !fonctions.data || !parametres.data || !quarts.data) {
    return (
      <div>
        {entete()}
        {erreur ? (
          <p className={ui.erreur}>{messageErreur(erreur)}</p>
        ) : (
          <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
        )}
      </div>
    )
  }
  if (personnel.data.length === 0) {
    return (
      <div className={`${ui.carte} p-10 text-center text-sm text-pierre-500`}>
        <p>Aucun membre dans l'équipe de cuisine.</p>
        {ecriture && (
          <Link to="/cuisine/equipe" className={`${ui.bouton} mt-4`}>
            Ajouter l'équipe
          </Link>
        )}
      </div>
    )
  }

  const statuts = reglages.statuts
  const liste = quarts.data
  const textes = new Map(liste.map((q) => [cleCase(q.personne_id, q.jour), q.texte]))
  const texteDe = (personneId: string, jour: string) => textes.get(cleCase(personneId, jour)) ?? ''
  const fonctionDe = new Map(fonctions.data.map((f) => [f.id, f]))
  const avecQuarts = new Set(liste.map((q) => q.personne_id))
  const lignes = personnel.data.filter((p) => p.actif || avecQuarts.has(p.id)).sort(comparer(fonctionDe))
  const totaux = new Map(lignes.map((p) => [p.id, totalHeures(jours.map((j) => texteDe(p.id, j)), statuts)]))
  const equipe = [...totaux.values()].reduce((s, t) => ({ heures: s.heures + t.heures, nonChiffres: s.nonChiffres + t.nonChiffres }), {
    heures: 0,
    nonChiffres: 0,
  })
  const auTravail = jours.map((j) => {
    const presents = lignes.flatMap((p) => (travaille(texteDe(p.id, j), statuts) ? [texteDe(p.id, j)] : []))
    const debuts = presents.flatMap((t) => debutQuart(t) ?? [])
    return { nombre: presents.length, des: debuts.length ? Math.min(...debuts) : null }
  })

  /** Même jour, ligne voisine ; au bout de la liste (vers le bas), on quitte la case. */
  function deplacer(personneId: string, jour: string, sens: 1 | -1) {
    const i = lignes.findIndex((p) => p.id === personneId)
    const voisine = lignes[i + sens]
    const cible = voisine && cases.current.get(cleCase(voisine.id, jour))?.champ
    if (cible) {
      cible.focus()
      cible.select()
    } else if (sens === 1) {
      cases.current.get(cleCase(personneId, jour))?.champ.blur()
    }
  }

  function remplirActive(texte: string) {
    const poignee = active && cases.current.get(cleCase(active.personneId, active.jour))
    // Case qui n'a plus le focus (ex. grille redessinée) : on n'y écrit pas.
    if (!active || !poignee || document.activeElement !== poignee.champ) {
      setActive(null)
      return
    }
    poignee.remplir(texte)
    deplacer(active.personneId, active.jour, 1)
  }

  async function copierPrecedente() {
    if (enCopie.current) return
    enCopie.current = true
    setCopieEnCours(true)
    const finCopie = () => {
      enCopie.current = false
      setCopieEnCours(false)
    }
    let envoyee = false
    try {
      setMessage(null)
      let precedente: Quart[]
      try {
        precedente = await lireQuarts(lundiPrecedent, ajouterJours(lundi, -1))
      } catch (e) {
        return setMessage({ lundi, texte: messageErreur(e), erreur: true })
      }
      if (semaine.current !== lundi) return
      // Les personnes devenues inactives ne reviennent pas dans la nouvelle semaine.
      const actifs = new Set(personnel.data?.filter((p) => p.actif).map((p) => p.id))
      const copie = precedente.filter((q) => actifs.has(q.personne_id)).map((q) => ({ ...q, jour: ajouterJours(q.jour, 7) }))
      if (!copie.length) return setMessage({ lundi, texte: `La semaine du ${dateCourte(lundiPrecedent)} est vide : rien à copier.` })
      if (
        liste.length &&
        !(await confirmer({
          titre: 'Remplacer cette semaine ?',
          message: `Les ${liste.length} cases de cette semaine seront remplacées par celles de la semaine du ${dateCourte(lundiPrecedent)}.`,
          libelleOk: 'Remplacer',
        }))
      )
        return
      if (semaine.current !== lundi) return
      remplacer.mutate(copie, {
        onSuccess: () => setMessage({ lundi, texte: `Semaine du ${dateCourte(lundiPrecedent)} copiée (${copie.length} cases).` }),
        onSettled: finCopie,
      })
      envoyee = true
    } finally {
      // Envoyée : la copie se termine avec l'écriture (onSettled).
      if (!envoyee) finCopie()
    }
  }

  const bord = 'border-b border-l border-pierre-100 print:border-pierre-400'
  const ligneActive = active && lignes.find((p) => p.id === active.personneId)
  const jourActif = active ? jours.indexOf(active.jour) : -1

  return (
    <div>
      {entete(
        <>
          {ecriture && liste.length > 0 && (
            <button
              className={ui.boutonDanger}
              disabled={remplacer.isPending || copieEnCours}
              onClick={async () => {
                if (!(await confirmer({ titre: 'Vider la semaine ?', message: `Les ${liste.length} cases seront effacées.`, libelleOk: 'Vider' }))) return
                setMessage(null)
                remplacer.mutate([])
              }}
            >
              Vider la semaine
            </button>
          )}
          {ecriture && (
            <button className={ui.boutonSecondaire} disabled={remplacer.isPending || copieEnCours} onClick={() => void copierPrecedente()}>
              Copier la semaine précédente
            </button>
          )}
          <button className={ui.boutonSecondaire} onClick={() => window.print()}>
            Imprimer
          </button>
        </>,
      )}
      <style>{IMPRESSION}</style>
      {/* Données déjà affichées mais une mise à jour a échoué : on garde la grille. */}
      {erreur && (
        <p className={`${ui.erreur} mb-3 print:hidden`}>
          Actualisation impossible : {messageErreur(erreur)}{' '}
          <button
            className="underline"
            onClick={() => {
              void personnel.refetch()
              void fonctions.refetch()
              void parametres.refetch()
              void quarts.refetch()
            }}
          >
            Réessayer
          </button>
        </p>
      )}
      {message?.lundi === lundi && (
        <p className={`mb-3 print:hidden ${message.erreur ? ui.erreur : 'rounded-lg bg-foret-50 px-3 py-2 text-sm text-foret-800'}`}>
          {message.texte}
        </p>
      )}

      {/* Quarts en un clic : remplit la case choisie, puis passe à la ligne suivante. */}
      {ecriture && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-sm print:hidden">
          <span className="mr-1 text-pierre-500">
            {ligneActive && jourActif >= 0
              ? `${ligneActive.nom}, ${JOURS[jourActif].toLowerCase()} :`
              : 'Choisissez une case, puis un quart :'}
          </span>
          {[...reglages.quarts, ...reglages.statuts].map((t, i) => (
            <button
              key={`${i}-${t}`}
              disabled={!active}
              className={`rounded-full border px-2.5 py-0.5 disabled:opacity-40 ${
                i < reglages.quarts.length
                  ? 'border-foret-600/30 bg-foret-50 text-foret-800 hover:bg-foret-100'
                  : 'border-pierre-200 bg-pierre-50 italic text-pierre-600 hover:bg-pierre-100'
              }`}
              // Garde le focus dans la case.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => remplirActive(t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <datalist id={LISTE_QUARTS}>
        {[...reglages.quarts, ...reglages.statuts].map((t, i) => (
          <option key={`${i}-${t}`} value={t} />
        ))}
      </datalist>

      <div className={`${ui.carte} overflow-x-auto print:overflow-visible print:rounded-none print:border-0 print:shadow-none`}>
        <table className="w-full min-w-[64rem] table-fixed border-collapse text-sm print:min-w-0 print:text-xs print:[print-color-adjust:exact]">
          <colgroup>
            <col className="w-28 print:w-24" />
            <col className="w-44 print:w-32" />
            {jours.map((j) => (
              <col key={j} />
            ))}
            <col className="w-28 print:w-24" />
          </colgroup>
          <thead className="bg-pierre-50 text-left">
            <tr>
              <th className="border-b border-pierre-200 px-3 py-2 font-medium text-pierre-500 print:border-pierre-400 print:px-1.5">Fonction</th>
              <th className="border-b border-l border-pierre-200 px-3 py-2 font-medium text-pierre-500 print:border-pierre-400 print:px-1.5">Employé</th>
              {jours.map((j, i) => (
                <th
                  key={j}
                  className={`border-b border-l border-pierre-200 px-2 py-1.5 font-normal print:border-pierre-400 print:px-1.5 ${
                    j === aujourdhui ? 'bg-foret-100 text-foret-800 print:bg-transparent print:text-pierre-900' : 'text-pierre-500'
                  }`}
                >
                  <span className="block font-semibold text-pierre-900">{JOURS[i]}</span>
                  <span className="text-xs">{dateCourte(j)}</span>
                </th>
              ))}
              <th className="border-b border-l border-pierre-200 px-3 py-2 text-right font-medium text-pierre-500 print:border-pierre-400 print:px-1.5">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((p) => {
              const f = p.fonction_id ? fonctionDe.get(p.fonction_id) : undefined
              const total = totaux.get(p.id)!
              return (
                <tr key={p.id}>
                  <td
                    className="truncate border-b border-pierre-100 px-3 py-1.5 font-medium print:whitespace-normal print:break-words print:border-pierre-400 print:px-1.5"
                    style={f ? { background: f.couleur, color: encre(f.couleur) } : undefined}
                  >
                    {f?.nom ?? <span className="font-normal text-pierre-400">—</span>}
                  </td>
                  <td
                    className={`${bord} truncate px-3 py-1.5 print:whitespace-normal print:break-words print:px-1.5 ${p.actif ? 'font-semibold' : 'text-pierre-400'}`}
                    title={p.nom}
                  >
                    {p.nom}
                    {!p.actif && <span className="ml-1 text-xs font-normal">(inactif)</span>}
                  </td>
                  {jours.map((j, i) => {
                    const k = cleCase(p.id, j)
                    return (
                      <CaseQuart
                        key={j}
                        etiquette={`${p.nom}, ${JOURS[i]} ${dateCourte(j)}`}
                        valeur={texteDe(p.id, j)}
                        statuts={statuts}
                        aujourdhui={j === aujourdhui}
                        ecriture={ecriture}
                        bord={bord}
                        inscrire={(poignee) => {
                          if (poignee) cases.current.set(k, poignee)
                          else cases.current.delete(k)
                        }}
                        enregistrer={(texte) => ecrire.mutate({ personne_id: p.id, jour: j, texte })}
                        deplacer={(sens) => deplacer(p.id, j, sens)}
                        surFocus={() => setActive({ personneId: p.id, jour: j })}
                        surSortie={() => setActive((a) => (a?.personneId === p.id && a.jour === j ? null : a))}
                      />
                    )
                  })}
                  <td className={`${bord} px-3 py-1.5 text-right tabular-nums print:px-1.5`}>
                    <Total {...total} />
                  </td>
                </tr>
              )
            })}
            {lignes.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-pierre-500">
                  Aucun membre actif dans l'équipe.{' '}
                  <Link to="/cuisine/equipe" className="text-foret-700 underline print:hidden">
                    Gérer l'équipe
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
          {lignes.length > 0 && (
            <tfoot className="bg-pierre-50 text-pierre-700">
              <tr>
                <td colSpan={2} className="px-3 py-1.5 font-medium print:px-1.5">
                  Au travail
                </td>
                {auTravail.map((a, i) => (
                  <td key={jours[i]} className="border-l border-pierre-200 px-2 py-1.5 print:border-pierre-400 print:px-1.5">
                    <span className="font-semibold tabular-nums">{a.nombre}</span>
                    {a.des != null && <span className="ml-1 text-xs text-pierre-500">dès {heure(a.des)}</span>}
                  </td>
                ))}
                <td className="border-l border-pierre-200 px-3 py-1.5 text-right tabular-nums print:border-pierre-400 print:px-1.5">
                  <Total {...equipe} />
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {ecriture && (
        <p className="mt-2 text-xs text-pierre-500 print:hidden">
          Tapez comme dans l'ancienne feuille (« 6h30 à 14h30 », « 9ish », « OFF », « - »). Entrée ou ↑ ↓ : ligne suivante ou
          précédente · Échap : annule la saisie. Les heures des quarts chiffrés s'additionnent dans le total ; les pauses ne sont
          pas déduites.
        </p>
      )}
    </div>
  )
}

/** « 37,5 h », plus « + 2 ? » pour les jours travaillés sans heures précises (« 9ish »). */
function Total({ heures, nonChiffres }: { heures: number; nonChiffres: number }) {
  if (!heures && !nonChiffres) return <span className="text-pierre-300">—</span>
  return (
    <>
      <span className="font-semibold">{formatHeures(heures)}</span>
      {nonChiffres > 0 && (
        <span className="ml-1 text-xs text-amber-700" title={`${nonChiffres} jour(s) sans heures précises (ex. 9ish)`}>
          + {nonChiffres} ?
        </span>
      )}
    </>
  )
}

/** Aller à la semaine d'une date (n'importe quel jour → son lundi). */
function SautDate({ lundi, aller }: { lundi: string; aller: (iso: string) => void }) {
  const champ = useRef<HTMLInputElement>(null)
  // Champ libre (non contrôlé) : la saisie au clavier, chiffre par chiffre,
  // n'est pas interrompue ; il reprend le lundi affiché quand on le quitte.
  useEffect(() => {
    if (champ.current && document.activeElement !== champ.current) champ.current.value = lundi
  }, [lundi])
  return (
    <input
      ref={champ}
      type="date"
      aria-label="Aller à la semaine du"
      title="Aller à la semaine de cette date"
      className="ml-1 rounded-lg border border-pierre-300 bg-white px-2.5 py-1.5 text-sm text-pierre-800 focus:border-foret-600 focus:outline-none focus:ring-2 focus:ring-foret-600/20"
      defaultValue={lundi}
      onChange={(e) => {
        // Année encore en cours de frappe (0002, 0020…) : on attend.
        if (e.target.value >= '2000') aller(e.target.value)
      }}
      onBlur={(e) => {
        e.currentTarget.value = lundi
      }}
    />
  )
}

/**
 * Case de l'horaire : texte libre, enregistré à la sortie (ou Entrée)
 * seulement s'il a changé ; vide = case effacée. Échap reprend la valeur
 * enregistrée. ↑ ↓ changent de ligne quand la saisie n'est pas modifiée
 * (sinon elles parcourent les suggestions).
 */
function CaseQuart({
  etiquette,
  valeur,
  statuts,
  aujourdhui,
  ecriture,
  bord,
  inscrire,
  enregistrer,
  deplacer,
  surFocus,
  surSortie,
}: {
  etiquette: string
  valeur: string
  statuts: string[]
  aujourdhui: boolean
  ecriture: boolean
  bord: string
  inscrire: (poignee: Poignee | null) => void
  enregistrer: (texte: string) => void
  deplacer: (sens: 1 | -1) => void
  surFocus: () => void
  surSortie: () => void
}) {
  const [texte, setTexte] = useState(valeur)
  const [base, setBase] = useState(valeur)
  if (valeur !== base) {
    setBase(valeur)
    setTexte(valeur)
  }
  // Remplie par un bouton de quart (déjà enregistrée) : la sortie qui suit
  // n'enregistre pas l'ancienne saisie.
  const dejaEnregistree = useRef(false)
  const style = styleCase(texte, statuts, aujourdhui)

  if (!ecriture) {
    return (
      <td className={`${bord} ${style} p-0`}>
        <span className="block truncate px-2 py-2 print:whitespace-normal print:px-1.5 print:py-1" title={valeur || undefined}>
          {valeur}
        </span>
      </td>
    )
  }
  return (
    <td className={`${bord} ${style} p-0`}>
      <input
        ref={(el) =>
          inscrire(
            el && {
              champ: el,
              remplir: (t) => {
                dejaEnregistree.current = true
                setTexte(t)
                if (t !== valeur) enregistrer(t)
              },
            },
          )
        }
        list={LISTE_QUARTS}
        aria-label={etiquette}
        className="block h-9 w-full min-w-0 bg-transparent px-2 outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-foret-600 print:hidden"
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        onFocus={() => {
          // Un remplissage par bouton resté sans sortie ne doit pas bloquer la prochaine saisie.
          dejaEnregistree.current = false
          surFocus()
        }}
        onBlur={() => {
          surSortie()
          if (dejaEnregistree.current) {
            dejaEnregistree.current = false
            return
          }
          const propre = texte.trim()
          if (propre !== valeur) enregistrer(propre)
          else if (texte !== valeur) setTexte(valeur)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            // Après coup : laisse une suggestion choisie à l'Entrée arriver dans le champ.
            setTimeout(() => deplacer(1), 0)
          } else if (e.key === 'Escape') {
            setTexte(valeur)
          } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.altKey && texte === valeur) {
            e.preventDefault()
            deplacer(e.key === 'ArrowDown' ? 1 : -1)
          }
        }}
      />
      <span className="hidden px-1.5 py-1 print:block">{texte}</span>
    </td>
  )
}
