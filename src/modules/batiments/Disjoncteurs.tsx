import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { BoutonModifier } from '@/lib/BoutonsAction'
import { IconePlus } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { parBatiment, type Donnees } from './donnees'
import { FicheDisjoncteur, type DefautsDisjoncteur } from './FicheDisjoncteur'
import { FichePanneau } from './FichePanneau'
import { Fichiers } from './Fichiers'
import { aIdentifier, estVide, etiquette, groupes, lireEtiquette, normaliser, parPiece, rangees, resume, termes, texteLigne, trouver, type Case } from './outils'
import type { Disjoncteur, Panneau } from './types'

type Vue = 'panneau' | 'pieces'

// Choix gardés sur l'appareil (panneau ouvert, vue) : rien d'essentiel.
function lire(cle: string) {
  try {
    return localStorage.getItem(cle)
  } catch {
    return null
  }
}
function garder(cle: string, valeur: string) {
  try {
    localStorage.setItem(cle, valeur)
  } catch {
    // Stockage indisponible : le choix sera simplement oublié.
  }
}

/**
 * Onglet Disjoncteurs : un panneau à la fois, dessiné comme le vrai
 * (impairs à gauche, pairs à droite), ou la liste par pièce ; recherche
 * dans tous les panneaux ; bandeau des disjoncteurs à identifier.
 */
export function Disjoncteurs({ d, ecriture }: { d: Donnees; ecriture: boolean }) {
  const [choix, setChoix] = useState(() => lire('batiments-panneau'))
  const [vue, setVue] = useState<Vue>(() => (lire('batiments-vue') === 'pieces' ? 'pieces' : 'panneau'))
  const [recherche, setRecherche] = useState('')
  const [fiche, setFiche] = useState<{ id: string | null; defauts: DefautsDisjoncteur } | null>(null)
  const [fichePanneau, setFichePanneau] = useState<{ id: string | null } | null>(null)

  const panneau = (choix && d.panneau.get(choix)) || d.panneaux[0]
  const choisir = (id: string) => {
    setChoix(id)
    garder('batiments-panneau', id)
  }
  const changerVue = (v: Vue) => {
    setVue(v)
    garder('batiments-vue', v)
  }
  const ouvrir = (x: Disjoncteur) => setFiche({ id: x.id, defauts: { panneau_id: x.panneau_id } })
  const ajouter = (defauts: DefautsDisjoncteur) => setFiche({ id: null, defauts })

  return (
    <div className="space-y-4">
      <BandeauAIdentifier d={d} ouvrir={ouvrir} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <input
            type="search"
            aria-label="Chercher"
            className={ui.champ}
            placeholder="Chercher : VFB 3, chauffe-eau, A13…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </div>
        {!recherche && (
          <div className="inline-flex shrink-0 self-start rounded-lg border border-pierre-200 bg-white p-0.5 text-sm" role="group" aria-label="Affichage">
            {(
              [
                ['panneau', 'Par panneau'],
                ['pieces', 'Par pièce'],
              ] as const
            ).map(([v, libelle]) => (
              <button
                key={v}
                aria-pressed={vue === v}
                className={`rounded-md px-3 py-1.5 font-medium ${vue === v ? 'bg-foret-700 text-white' : 'text-pierre-600 hover:bg-pierre-50'}`}
                onClick={() => changerVue(v)}
              >
                {libelle}
              </button>
            ))}
          </div>
        )}
      </div>

      {recherche.trim() ? (
        <Resultats d={d} recherche={recherche} ouvrir={ouvrir} />
      ) : vue === 'pieces' ? (
        <VuePieces d={d} ouvrir={ouvrir} />
      ) : (
        <>
          <ChoixPanneau d={d} actif={panneau?.id} choisir={choisir} ajouter={ecriture ? () => setFichePanneau({ id: null }) : undefined} />
          {panneau ? (
            <VuePanneau d={d} panneau={panneau} ecriture={ecriture} ouvrir={ouvrir} ajouter={ajouter} modifier={() => setFichePanneau({ id: panneau.id })} />
          ) : (
            <p className="py-8 text-center text-sm text-pierre-500">Aucun panneau.</p>
          )}
        </>
      )}

      {fiche && <FicheDisjoncteur d={d} id={fiche.id} defauts={fiche.defauts} ecriture={ecriture} fermer={() => setFiche(null)} />}
      {fichePanneau && <FichePanneau d={d} id={fichePanneau.id} cree={choisir} fermer={() => setFichePanneau(null)} />}
    </div>
  )
}

// ------------------------------------------------------------------
// Bandeau « À identifier »
// ------------------------------------------------------------------

function BandeauAIdentifier({ d, ouvrir }: { d: Donnees; ouvrir: (x: Disjoncteur) => void }) {
  const ordre = new Map(d.panneaux.map((p, i) => [p.id, i]))
  const liste = d.disjoncteurs.filter(aIdentifier).sort((a, b) => (ordre.get(a.panneau_id) ?? 0) - (ordre.get(b.panneau_id) ?? 0))
  if (!liste.length) return null
  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-3" aria-labelledby="titre-a-identifier">
      <h2 id="titre-a-identifier" className="text-sm font-semibold text-amber-950">
        À identifier sur place <span className="font-normal text-amber-800">({liste.length})</span>
      </h2>
      <p className="mb-2 text-xs text-amber-900">Couper le disjoncteur et noter ce qui s’éteint.</p>
      <ul className="flex flex-wrap gap-1.5">
        {liste.map((x) => (
          <li key={x.id}>
            <button
              className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium tabular-nums text-amber-950 hover:border-amber-500"
              title={estVide(x) ? 'Rien de noté' : `À vérifier : ${resume(x)}`}
              onClick={() => ouvrir(x)}
            >
              {etiquette(d.panneau.get(x.panneau_id), x)}
              {!estVide(x) && ' ?'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ------------------------------------------------------------------
// Choix du panneau
// ------------------------------------------------------------------

function ChoixPanneau({ d, actif, choisir, ajouter }: { d: Donnees; actif: string | undefined; choisir: (id: string) => void; ajouter?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {parBatiment(d, d.panneaux).map(({ batiment, elements }) => (
        <div key={batiment?.id ?? 'sans'} className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-pierre-500">{batiment?.nom ?? 'Sans bâtiment'}</span>
          {elements.map((p) => (
            <button
              key={p.id}
              aria-pressed={p.id === actif}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                p.id === actif ? 'border-foret-700 bg-foret-700 text-white' : 'border-pierre-300 bg-white text-pierre-800 hover:border-foret-600'
              }`}
              onClick={() => choisir(p.id)}
            >
              {p.nom}
            </button>
          ))}
        </div>
      ))}
      {ajouter && (
        <button className="inline-flex items-center gap-1 text-sm font-medium text-foret-700 hover:underline" onClick={ajouter}>
          <IconePlus className="size-4" /> Panneau
        </button>
      )}
    </div>
  )
}

// ------------------------------------------------------------------
// Un panneau, dessiné comme le vrai
// ------------------------------------------------------------------

function VuePanneau({
  d,
  panneau,
  ecriture,
  ouvrir,
  ajouter,
  modifier,
}: {
  d: Donnees
  panneau: Panneau
  ecriture: boolean
  ouvrir: (x: Disjoncteur) => void
  ajouter: (defauts: DefautsDisjoncteur) => void
  modifier: () => void
}) {
  const disjoncteurs = d.duPanneau(panneau.id)
  const lignes = rangees(panneau, disjoncteurs)
  const batiment = panneau.batiment_id ? d.batiment.get(panneau.batiment_id) : undefined

  return (
    <div className="space-y-4">
      <aside className={`${ui.carte} flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between sm:p-4`}>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Panneau {panneau.nom}</h2>
          <p className="text-sm text-pierre-600">{[panneau.emplacement, batiment?.nom].filter(Boolean).join(' · ') || 'Emplacement à préciser'}</p>
          {panneau.note && <p className="mt-1 whitespace-pre-wrap text-sm text-pierre-700">{panneau.note}</p>}
          {ecriture && <BoutonModifier className="mt-2" onClick={modifier} />}
        </div>
        <div className="shrink-0">
          <p className={ui.etiquette}>Photos (porte, carte du panneau)</p>
          <Fichiers cible={{ panneau_id: panneau.id }} fichiers={d.fichiersDe(panneau.id)} ecriture={ecriture} />
        </div>
      </aside>

      <section aria-label={`Panneau ${panneau.nom}`}>
        <DessinPanneau panneau={panneau} lignes={disjoncteurs.length ? lignes : []} ecriture={ecriture} ouvrir={ouvrir} ajouter={ajouter} />
        {ecriture && (
          <div className="mx-auto mt-3 max-w-3xl">
            <button className="inline-flex items-center gap-1 text-sm font-medium text-foret-700 hover:underline" onClick={() => ajouter({ panneau_id: panneau.id })}>
              <IconePlus className="size-4" /> Disjoncteur
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

const teinte = (x: Disjoncteur) =>
  estVide(x)
    ? 'border-amber-300 bg-amber-50 hover:border-amber-500'
    : x.a_verifier
      ? 'border-amber-400 bg-white hover:border-amber-600'
      : 'border-pierre-200 bg-white hover:border-foret-600'

/** Ce qu'alimente un disjoncteur, sur son étiquette (le quoi en gras). */
function Contenu({ x }: { x: Disjoncteur }) {
  if (estVide(x)) return <span className="italic">À identifier</span>
  return (
    <>
      {x.a_verifier && <span className="mr-1 font-bold text-amber-700">?</span>}
      {groupes(x).map(({ quoi, ou }, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          {quoi && <span className="font-semibold">{quoi}</span>}
          {quoi && ou && ' '}
          {ou}
        </span>
      ))}
    </>
  )
}

type Cote = 'gauche' | 'droite'
interface ActionsCase {
  panneau: Panneau
  ecriture: boolean
  ouvrir: (x: Disjoncteur) => void
  ajouter: (defauts: DefautsDisjoncteur) => void
}

// Colonnes du dessin : étiquette | numéro | disjoncteur | disjoncteur | numéro | étiquette.
const COLONNES = { etiquette: { gauche: 1, droite: 6 }, numero: { gauche: 2, droite: 5 }, interrupteur: { gauche: 3, droite: 4 } }

/**
 * Le panneau comme le vrai : boîtier gris, disjoncteurs au centre (manette
 * vers le centre = en marche), étiquettes sur les côtés, à la hauteur de
 * leur disjoncteur. Un bipolaire prend deux rangées, deux demis se
 * partagent la leur.
 */
function DessinPanneau({ lignes, ...actions }: ActionsCase & { lignes: [Case, Case][] }) {
  return (
    <div className="relative mx-auto max-w-3xl rounded-xl bg-gradient-to-b from-zinc-200 via-zinc-300 to-zinc-400 px-2 pb-4 pt-3 shadow-md ring-1 ring-zinc-500/60 sm:px-4">
      {['left-2 top-2', 'right-2 top-2', 'bottom-2 left-2', 'bottom-2 right-2'].map((coin) => (
        <span key={coin} aria-hidden className={`absolute size-2 rounded-full bg-gradient-to-br from-zinc-100 to-zinc-500 ring-1 ring-zinc-500 ${coin}`} />
      ))}
      <p className="mx-auto mb-3 w-fit rounded-sm bg-zinc-800 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-100 shadow-inner">Panneau {actions.panneau.nom}</p>
      {lignes.length === 0 ? (
        <p className="rounded-md bg-zinc-100 px-3 py-8 text-center text-sm text-zinc-500 shadow-inner ring-1 ring-zinc-400">Aucun disjoncteur noté pour ce panneau.</p>
      ) : (
        <div className="grid auto-rows-[3rem] grid-cols-[minmax(0,1fr)_1rem_2.125rem_2.125rem_1rem_minmax(0,1fr)] gap-x-1 gap-y-0.5 sm:grid-cols-[minmax(0,1fr)_1.25rem_2.5rem_2.5rem_1.25rem_minmax(0,1fr)] sm:gap-x-1.5">
          {/* Plaque du centre, derrière les disjoncteurs. */}
          <div aria-hidden className="rounded-md bg-zinc-100 shadow-inner ring-1 ring-zinc-400" style={{ gridColumn: '2 / 6', gridRow: `1 / ${lignes.length + 1}` }} />
          {lignes.map(([gauche, droite], i) => (
            <Fragment key={i}>
              <CotePanneau c={gauche} rang={i + 1} cote="gauche" {...actions} />
              <CotePanneau c={droite} rang={i + 1} cote="droite" {...actions} />
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

/** Un emplacement : son numéro, son disjoncteur et son étiquette. */
function CotePanneau({ c, rang, cote, ...actions }: ActionsCase & { c: Case; rang: number; cote: Cote }) {
  const { panneau, ecriture, ouvrir, ajouter } = actions
  const ligne = c.genre === 'bipolaire' ? `${rang} / span 2` : `${rang}`
  const place = (colonne: keyof typeof COLONNES): CSSProperties => ({ gridColumn: COLONNES[colonne][cote], gridRow: ligne })
  const versCentre = cote === 'gauche' ? 'justify-end' : 'justify-start'
  const texte = cote === 'gauche' ? 'text-right' : 'text-left'

  const numero = (
    <span style={{ gridColumn: COLONNES.numero[cote], gridRow: rang }} className="self-center text-center text-[10px] font-semibold tabular-nums text-zinc-500">
      {c.position}
    </span>
  )
  if (c.genre === 'couvert') return numero

  /** Emplacement libre : plaque d'obturation (un « + » pour qui modifie). */
  const plaque = (demi?: 1 | 2) => {
    const classe = 'flex h-full w-full items-center justify-center rounded-[3px] bg-zinc-200 ring-1 ring-zinc-400/80'
    const libelle = `${panneau.nom} #${c.position}${demi ? `-${demi}` : ''}`
    return ecriture ? (
      <button key={demi ?? 0} className={`${classe} text-sm text-zinc-400 hover:bg-white hover:text-foret-700`} onClick={() => ajouter({ panneau_id: panneau.id, position: c.position, demi })} aria-label={`Ajouter un disjoncteur à ${libelle}`}>
        +
      </button>
    ) : (
      <span key={demi ?? 0} className={classe} />
    )
  }

  /** Corps noir du disjoncteur ; manette(s) du côté du centre. */
  const corps = (x: Disjoncteur, contenu: ReactNode, extra = '') => (
    <button
      key={x.id}
      className={`relative flex h-full w-full items-center rounded-[3px] bg-gradient-to-b from-zinc-700 to-zinc-900 px-1 shadow-[0_1px_2px_rgba(0,0,0,0.45)] ring-1 ring-black/70 hover:from-zinc-600 hover:to-zinc-800 ${versCentre} ${extra}`}
      onClick={() => ouvrir(x)}
      aria-label={etiquette(panneau, x)}
      title={`${etiquette(panneau, x)}${resume(x) ? ` · ${resume(x)}` : ''}`}
    >
      {contenu}
    </button>
  )
  const manette = (petite = false) => <span aria-hidden className={`${petite ? 'h-2 w-3' : 'h-3 w-4'} rounded-[2px] bg-gradient-to-b from-zinc-200 to-zinc-500 shadow`} />

  /** Étiquette collée à côté du disjoncteur, de la même hauteur que lui. */
  const ruban = (x: Disjoncteur, lignes: 1 | 2 | 4 = 2) => (
    <button
      key={x.id}
      className={`flex h-full w-full items-center rounded-[3px] px-1.5 text-[11px] leading-tight shadow-sm ring-1 ${cote === 'gauche' ? 'justify-end' : 'justify-start'} ${texte} ${
        estVide(x) ? 'bg-amber-100 text-amber-900 ring-amber-400 hover:ring-amber-600' : x.a_verifier ? 'bg-white text-zinc-900 ring-amber-500 hover:ring-amber-700' : 'bg-white text-zinc-900 ring-zinc-400/70 hover:ring-foret-600'
      }`}
      onClick={() => ouvrir(x)}
      title={resume(x) || undefined}
    >
      <span className={lignes === 1 ? 'line-clamp-1' : lignes === 2 ? 'line-clamp-2' : 'line-clamp-4'}>
        <Contenu x={x} />
      </span>
    </button>
  )

  let interrupteur: ReactNode
  let etiquettes: ReactNode = null
  if (c.genre === 'vide') interrupteur = plaque()
  else if (c.genre === 'plein') {
    interrupteur = corps(c.d, manette())
    etiquettes = ruban(c.d)
  } else if (c.genre === 'bipolaire') {
    // Deux manettes reliées par une barre : on les coupe ensemble.
    interrupteur = corps(
      c.d,
      <span aria-hidden className="flex h-full flex-col items-center justify-center py-2">
        {manette()}
        <span className="w-1 flex-1 bg-zinc-400" />
        {manette()}
      </span>,
    )
    etiquettes = ruban(c.d, 4)
  } else {
    // Deux demis dans le même emplacement : -1 en haut, -2 en bas.
    interrupteur = (
      <span className="grid h-full grid-rows-2 gap-px">
        {c.demis.map((x, i) => (x ? corps(x, manette(true)) : plaque((i + 1) as 1 | 2)))}
      </span>
    )
    etiquettes = (
      <span className="grid h-full grid-rows-2 gap-px">
        {c.demis.map((x, i) => (x ? ruban(x, 1) : <span key={i} />))}
      </span>
    )
  }

  return (
    <>
      {numero}
      <span style={place('interrupteur')} className="py-0.5">
        {interrupteur}
      </span>
      {etiquettes && (
        <span style={place('etiquette')} className="py-0.5">
          {etiquettes}
        </span>
      )}
    </>
  )
}

// ------------------------------------------------------------------
// Recherche dans tous les panneaux
// ------------------------------------------------------------------

function Resultats({ d, recherche, ouvrir }: { d: Donnees; recherche: string; ouvrir: (x: Disjoncteur) => void }) {
  const resultats = useMemo(() => {
    // « A13 », « cu29 » : seulement le disjoncteur à cet emplacement.
    const lu = lireEtiquette(recherche)
    const direct = lu
      ? d.disjoncteurs.filter((x) => normaliser(d.panneau.get(x.panneau_id)?.nom ?? '') === lu.panneau && (x.position === lu.position || (x.bipolaire && x.position + 2 === lu.position)))
      : []
    if (direct.length) return direct.map((x) => ({ x, lignes: x.alimente }))
    const tests = termes(recherche)
    return d.disjoncteurs
      .map((x) => ({ x, lignes: trouver(x, d.panneau.get(x.panneau_id), tests) }))
      .filter((r): r is { x: Disjoncteur; lignes: NonNullable<typeof r.lignes> } => r.lignes !== null)
  }, [d, recherche])

  if (!resultats.length) return <p className="py-8 text-center text-sm text-pierre-500">Rien trouvé.</p>
  return (
    <ul className="space-y-1.5">
      {resultats.map(({ x, lignes }) => {
        const panneau = d.panneau.get(x.panneau_id)
        const autres = x.alimente.length - lignes.length
        return (
          <li key={x.id}>
            <button className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left ${teinte(x)}`} onClick={() => ouvrir(x)}>
              <span className="w-20 shrink-0 font-semibold tabular-nums">{etiquette(panneau, x)}</span>
              <span className="min-w-0 flex-1 text-sm">
                {estVide(x) ? (
                  <span className="italic text-amber-800">À identifier</span>
                ) : (
                  <>
                    {lignes.map((l, i) => (
                      <span key={i} className="block">
                        {texteLigne(l)}
                      </span>
                    ))}
                    {autres > 0 && <span className="block text-xs text-pierre-500">+ {autres} autre(s)</span>}
                  </>
                )}
                {panneau?.emplacement && <span className="block text-xs text-pierre-500">{panneau.emplacement}</span>}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ------------------------------------------------------------------
// Par pièce
// ------------------------------------------------------------------

function VuePieces({ d, ouvrir }: { d: Donnees; ouvrir: (x: Disjoncteur) => void }) {
  const pieces = useMemo(() => parPiece(d.disjoncteurs), [d.disjoncteurs])
  if (!pieces.length) return <p className="py-8 text-center text-sm text-pierre-500">Rien de noté.</p>
  return (
    <div className="gap-4 sm:columns-2 xl:columns-3">
      {pieces.map((p) => (
        <section key={p.piece ?? '—'} className={`${ui.carte} mb-3 break-inside-avoid p-3`}>
          <h3 className="mb-1 text-sm font-semibold">{p.piece ?? 'Sans pièce'}</h3>
          <ul className="space-y-1">
            {p.lignes.map(({ quoi, d: x }, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 text-pierre-700">{quoi ?? '—'}</span>
                <button
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${x.a_verifier ? 'border-amber-400 text-amber-900' : 'border-pierre-300 text-pierre-800'} hover:border-foret-600`}
                  onClick={() => ouvrir(x)}
                >
                  {etiquette(d.panneau.get(x.panneau_id), x)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
