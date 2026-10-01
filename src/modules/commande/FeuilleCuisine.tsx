// Feuille de cuisine du menu ouvert : ce qu'il faut préparer à chaque repas,
// jour par jour, avec la quantité de chaque ingrédient (calcul : cuisine.ts).
// Pensée pour le papier : un jour par page, gros caractères.
import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { ui } from '@/lib/ui'
import { useTitreImpression } from '@/lib/useTitreImpression'
import { calculerCommande } from './calcul'
import { useMenu } from './contexte'
import {
  equivalencePaquets,
  feuilleCuisine,
  LIBELLES_ROLE,
  quantiteCuisine,
  type FeuilleCuisine as Feuille,
  type GroupeCuisine,
  type JourCuisine,
  type PlatCuisine,
  type RepasCuisine,
  type RolePlat,
} from './cuisine'
import { useEtatCommande, useTableMenu } from './donnees'
import { COULEURS_GROUPES, DIETES, type GroupeRepas, type Participant, type Portee } from './types'

/** Ajoutés d'office à chaque repas : affichés après les plats planifiés, plus discrets. */
const AUTOMATIQUES: RolePlat[] = ['buffet', 'bar']
const RANG_PORTEE: Record<Portee, number> = { all: 0, regular: 1, veggie: 2 }
/** ?jour=sans : la section « Sans jour précis » seule. */
const SANS_JOUR = 'sans'

interface Ligne {
  cle: string
  nom: string
  pkg: string
  quantite: string
  equivalence: string | null
  portee: Portee
  /** « Tous », « Régulier (233) », « 🌱 Végé (12) ». */
  pour: string
}

interface Carte {
  cle: string
  plat: PlatCuisine
  automatique: boolean
  /** Colonne « Pour » : plat avec du végé dont les lignes ne couvrent pas toutes les mêmes portions. */
  parPortee: boolean
  avecEquivalence: boolean
  /** Ordre de la recette ; avec parPortee : pour tous, puis régulier, puis végé. */
  lignes: Ligne[]
}

interface RepasAffiche {
  repas: RepasCuisine
  /** Plats planifiés (et glacières), puis buffet ou bar à salade. */
  cartes: Carte[]
  /** Rien de planifié dans la grille (une glacière ne compte pas). */
  aucunPlat: boolean
}

interface JourAffiche {
  jour: JourCuisine
  repas: RepasAffiche[]
}

/** Clés stables, même pour deux éléments semblables (ex. deux glacières de la même recette). */
function cles(bases: string[]): string[] {
  const vus = new Map<string, number>()
  return bases.map((b) => {
    const n = vus.get(b) ?? 0
    vus.set(b, n + 1)
    return n ? `${b}#${n}` : b
  })
}

function pour(portee: Portee, portions: number): string {
  if (portee === 'all') return 'Tous'
  if (portee === 'regular') return `Régulier (${portions})`
  return `🌱 Végé (${portions})`
}

function cartes(plats: PlatCuisine[]): Carte[] {
  const clesPlats = cles(plats.map((p) => `${p.role}:${p.recetteId}`))
  return plats.map((plat, i) => {
    const parPortee = plat.vege > 0 && plat.ingredients.some((l) => l.portee !== 'all')
    const rangees = parPortee
      ? [...plat.ingredients].sort((a, b) => RANG_PORTEE[a.portee] - RANG_PORTEE[b.portee])
      : plat.ingredients
    const clesLignes = cles(rangees.map((l) => `${l.portee}:${l.id}`))
    const lignes = rangees.map((l, j) => ({
      cle: clesLignes[j],
      nom: l.name,
      pkg: l.pkg,
      quantite: quantiteCuisine(l.quantite, l.unit),
      equivalence: equivalencePaquets(l.quantite, l.unit, l.pkg),
      portee: l.portee,
      pour: pour(l.portee, l.portions),
    }))
    return {
      cle: clesPlats[i],
      plat,
      automatique: AUTOMATIQUES.includes(plat.role),
      parPortee,
      avecEquivalence: lignes.some((l) => l.equivalence),
      lignes,
    }
  })
}

/** Tout ce qui s'affiche, calculé une fois par feuille (pas à chaque changement de jour ou de détail). */
function preparer(feuille: Feuille): { jours: JourAffiche[]; sansJour: Carte[] } {
  return {
    jours: feuille.jours.map((jour) => ({
      jour,
      repas: jour.repas.map((repas) => {
        const toutes = cartes(repas.plats)
        const prevus = toutes.filter((c) => !c.automatique)
        return {
          repas,
          cartes: [...prevus, ...toutes.filter((c) => c.automatique)],
          aucunPlat: !prevus.some((c) => c.plat.role !== 'glaciere'),
        }
      }),
    })),
    sansJour: cartes(feuille.sansJour),
  }
}

const portions = (n: number) => `${n.toLocaleString('fr-CA')} portion${n > 1 ? 's' : ''}`

/** Diètes et allergies des groupes, pour les rappels de chaque repas. */
interface InfosGroupes {
  groupes: Map<string, GroupeRepas>
  participants: Map<string, Participant[]>
}

interface Rappel {
  /** « 12 végé », « 3 sans gluten »… (groupes présents). */
  dietes: string[]
  /** Groupes présents avec des participants allergiques. */
  allergies: { groupe: string; participants: Participant[] }[]
}

function rappel(r: RepasCuisine, infos: InfosGroupes): Rappel {
  const presents = r.groupes.filter((g) => !g.absent && g.portions > 0)
  const dietes = DIETES.map((d) => {
    // Végé : le compte du repas (sorties retirées) ; les autres : ceux du groupe.
    const n = d.cle === 'vege' ? r.totalVege : presents.reduce((s, g) => s + (infos.groupes.get(g.id)?.[d.cle] ?? 0), 0)
    return n > 0 ? `${n} ${d.court}` : null
  }).filter((x): x is string => !!x)
  const allergies = presents
    .map((g) => ({ groupe: g.name, participants: infos.participants.get(g.id) ?? [] }))
    .filter((a) => a.participants.length > 0)
  return { dietes, allergies }
}

/** « Léa (arachides, EpiPen) » */
const decrireParticipant = (p: Participant) =>
  `${p.nom || 'Sans nom'}${p.allergies || p.epipen ? ` (${[p.allergies, p.epipen ? 'EpiPen' : ''].filter(Boolean).join(', ')})` : ''}`

export function FeuilleCuisine() {
  const { menu } = useMenu()
  const etat = useEtatCommande(menu)
  const vide = useMemo(() => (etat ? calculerCommande(etat).vide : null), [etat])
  const feuille = useMemo(() => (etat ? preparer(feuilleCuisine(etat)) : null), [etat])
  const [params, setParams] = useSearchParams()
  const [detail, setDetail] = useState(true)
  const participants = useTableMenu('participants', menu.id)
  const infos = useMemo<InfosGroupes>(() => {
    const parGroupe = new Map<string, Participant[]>()
    for (const p of participants.data ?? []) parGroupe.set(p.groupe_id, [...(parGroupe.get(p.groupe_id) ?? []), p])
    return { groupes: new Map((etat?.groupes ?? []).map((g) => [g.id, g])), participants: parGroupe }
  }, [etat, participants.data])
  // Nom du PDF : le menu et le jour imprimé (?jour=), sinon tous les jours.
  const jourImprime =
    params.get('jour') === SANS_JOUR
      ? 'Sans jour précis'
      : (feuille?.jours.find((j) => String(j.jour.day) === params.get('jour'))?.jour.libelle ?? 'Tous les jours')
  useTitreImpression(`Feuille de cuisine - ${menu.nom} - ${jourImprime}`)

  if (!feuille || vide == null) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
  if (vide) {
    return (
      <p className={`${ui.carte} p-10 text-center text-sm text-pierre-500`}>
        Planifiez des repas dans le Planificateur pour voir la feuille de cuisine.
      </p>
    )
  }

  // Jour affiché : celui de l'adresse (?jour=indice, ou « sans »), sinon tous.
  const demande = params.get('jour')
  const choix =
    (demande === SANS_JOUR && feuille.sansJour.length > 0) || feuille.jours.some((j) => String(j.jour.day) === demande)
      ? demande
      : null
  const choisir = (valeur: string | null) =>
    setParams(
      (p) => {
        const suite = new URLSearchParams(p)
        if (valeur == null) suite.delete('jour')
        else suite.set('jour', valeur)
        return suite
      },
      { replace: true },
    )
  const jours = choix == null ? feuille.jours : feuille.jours.filter((j) => String(j.jour.day) === choix)
  const sansJour = feuille.sansJour.length > 0 && (choix == null || choix === SANS_JOUR)

  return (
    <>
    <div className="space-y-10 print:hidden">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-pierre-300 bg-white p-0.5 text-sm" role="group" aria-label="Jour affiché">
          <BoutonJour actif={choix == null} onClick={() => choisir(null)}>
            Tous les jours
          </BoutonJour>
          {feuille.jours.map(({ jour }) => (
            <BoutonJour key={jour.day} actif={choix === String(jour.day)} onClick={() => choisir(String(jour.day))}>
              {jour.libelle}
            </BoutonJour>
          ))}
          {feuille.sansJour.length > 0 && (
            <BoutonJour actif={choix === SANS_JOUR} onClick={() => choisir(SANS_JOUR)}>
              Sans jour précis
            </BoutonJour>
          )}
        </div>
        <label className="inline-flex items-center gap-1.5 rounded-lg border border-pierre-300 bg-white px-2.5 py-1.5 text-sm text-pierre-800">
          <input type="checkbox" className="accent-foret-700" checked={detail} onChange={(e) => setDetail(e.target.checked)} />
          Détail des ingrédients
        </label>
        <button className={`${ui.bouton} ml-auto`} onClick={() => window.print()}>
          Imprimer
        </button>
      </div>

      {/* Un jour par page à l'impression. */}
      {jours.map(({ jour, repas }, i) => (
        <section key={jour.day} className={i > 0 ? 'print:break-before-page' : undefined}>
          <EnteteFeuille titre={jour.libelle} menu={menu.nom} />
          {repas.map((r) => (
            <BlocRepas key={r.repas.meal} {...r} jour={jour.libelle} detail={detail} rappel={rappel(r.repas, infos)} />
          ))}
        </section>
      ))}

      {sansJour && (
        <section className={jours.length > 0 ? 'print:break-before-page' : undefined}>
          <EnteteFeuille titre="Sans jour précis" menu={menu.nom} />
          <p className="mt-2 text-sm text-pierre-500">Ajouts manuels de recettes et glacières hors des jours du menu.</p>
          <GrilleCartes cartes={feuille.sansJour} contexte="Sans jour précis" detail={detail} />
        </section>
      )}
    </div>
    <FeuilleImprimee jours={jours} sansJour={sansJour ? feuille.sansJour : []} menu={menu.nom} detail={detail} infos={infos} />
    </>
  )
}

function BoutonJour({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      aria-pressed={actif}
      className={`whitespace-nowrap rounded-md px-2.5 py-1 ${actif ? 'bg-foret-100 font-medium text-foret-800' : 'text-pierre-600 hover:text-pierre-900'}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function EnteteFeuille({ titre, menu }: { titre: string; menu: string }) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-pierre-800 pb-2">
      <h2 className="text-3xl font-bold">{titre}</h2>
      <p className="text-sm text-pierre-500">Feuille de cuisine · {menu}</p>
    </header>
  )
}

/**
 * Un repas. Sur papier, un jour tient sur plusieurs pages : le jour est
 * rappelé dans le titre du repas et sur chaque carte, et le titre reste avec
 * sa première carte (pas seul en bas de page).
 */
function BlocRepas({ repas: r, cartes, aucunPlat, jour, detail, rappel }: RepasAffiche & { jour: string; detail: boolean; rappel: Rappel }) {
  return (
    <div className="mt-7">
      <div className="print:break-after-avoid">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-2xl font-bold">
            <span className="hidden print:inline">{jour} · </span>
            {r.libelle}
            {r.total > 0 && ` — ${portions(r.total)}`}
          </h3>
          {r.totalVege > 0 && <span className="text-lg font-medium text-foret-800">dont {r.totalVege} végé</span>}
        </div>
        {r.total > 0 ? (
          <>
            <PastillesGroupes groupes={r.groupes} />
            <RappelRepas rappel={rappel} />
          </>
        ) : (
          <p className="mt-1 text-base text-pierre-500">Aucun groupe présent</p>
        )}
        {r.total > 0 && aucunPlat && <p className="mt-3 text-base italic text-pierre-500">Aucun plat planifié</p>}
      </div>
      {cartes.length > 0 && <GrilleCartes cartes={cartes} contexte={`${jour} · ${r.libelle}`} detail={detail} />}
    </div>
  )
}

function PastillesGroupes({ groupes }: { groupes: GroupeCuisine[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {groupes.map((g) => {
        const couleur = g.color ?? COULEURS_GROUPES[0]
        return (
          <li
            key={g.id}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm print:[print-color-adjust:exact] ${
              g.absent ? 'border-pierre-200 bg-pierre-100 text-pierre-400' : 'text-pierre-900'
            }`}
            style={
              g.absent
                ? undefined
                : { background: `color-mix(in srgb, ${couleur} 12%, white)`, borderColor: `color-mix(in srgb, ${couleur} 45%, white)` }
            }
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: g.absent ? 'var(--color-pierre-300)' : couleur }}
              aria-hidden
            />
            {g.absent ? (
              <>
                <span className="line-through">{g.name}</span> absent
              </>
            ) : (
              <span>
                {g.name} · <span className="font-semibold tabular-nums">{g.portions}</span>
                {g.vege > 0 && ` (${g.vege} végé)`}
              </span>
            )}
            {g.enSortie > 0 && <span className="text-amber-800">−{g.enSortie} en sortie</span>}
          </li>
        )
      })}
    </ul>
  )
}

/** `contexte` : jour et repas, rappelés sur chaque carte imprimée (une page peut commencer par une carte). */
function GrilleCartes({ cartes, contexte, detail }: { cartes: Carte[]; contexte: string; detail: boolean }) {
  // Avec le détail : une colonne à l'impression (bloc : les cartes se coupent
  // mieux d'une page à l'autre qu'en grille). Sans le détail : cartes courtes, deux colonnes.
  const disposition = detail
    ? 'grid gap-3 xl:grid-cols-2 print:block print:space-y-3'
    : 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-2'
  return (
    <div className={`mt-3 items-start ${disposition}`}>
      {cartes.map((c) => (
        <CartePlat key={c.cle} carte={c} contexte={contexte} detail={detail} />
      ))}
    </div>
  )
}

function CartePlat({ carte, contexte, detail }: { carte: Carte; contexte: string; detail: boolean }) {
  const { plat, automatique } = carte
  const glaciere = plat.role === 'glaciere'
  const cadre = glaciere
    ? 'border-2 border-amber-300 bg-amber-50 print:[print-color-adjust:exact]'
    : automatique
      ? 'border border-dashed border-pierre-300 bg-pierre-50'
      : 'border border-pierre-200 bg-white shadow-sm print:border-pierre-300 print:shadow-none'
  return (
    <article className={`break-inside-avoid rounded-xl p-4 ${cadre}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-xs font-semibold uppercase tracking-wide ${glaciere ? 'text-amber-900' : 'text-pierre-500'}`}>
            <span className="hidden print:inline">{contexte} · </span>
            {glaciere && '🧊 '}
            {LIBELLES_ROLE[plat.role]}
          </p>
          <h4 className={automatique ? 'text-lg font-semibold text-pierre-700' : 'text-xl font-bold leading-snug'}>{plat.nom}</h4>
        </div>
        <div className="shrink-0 text-right">
          <p className={`whitespace-nowrap tabular-nums ${automatique ? 'text-base text-pierre-600' : 'text-lg font-semibold'}`}>
            {portions(plat.portions)}
          </p>
          {plat.vege > 0 && (
            <span className="mt-1 inline-block whitespace-nowrap rounded-full bg-foret-100 px-2 py-0.5 text-sm font-medium text-foret-800 print:[print-color-adjust:exact]">
              🌱 {plat.vege} végé
            </span>
          )}
        </div>
      </div>
      {plat.note && <p className={`mt-1 text-sm italic ${glaciere ? 'text-amber-900' : 'text-pierre-600'}`}>{plat.note}</p>}
      {detail &&
        (carte.lignes.length > 0 ? (
          <TableIngredients carte={carte} />
        ) : (
          <p className="mt-2 text-sm text-pierre-500">Aucun ingrédient dans la recette.</p>
        ))}
    </article>
  )
}

function TableIngredients({ carte: { lignes, parPortee, avecEquivalence, automatique } }: { carte: Carte }) {
  const entete = 'border-b border-pierre-300 py-1.5 text-xs font-medium uppercase tracking-wide text-pierre-500'
  return (
    <table className="mt-3 w-full text-base">
      <thead className="text-left">
        <tr>
          <th className={`${entete} pr-3`}>Ingrédient</th>
          <th className={`${entete} px-3 text-right`}>Quantité</th>
          {avecEquivalence && <th className={`${entete} pl-3`}>Équivalence</th>}
          {parPortee && <th className={`${entete} pl-3`}>Pour</th>}
        </tr>
      </thead>
      <tbody>
        {lignes.map((l, i) => {
          // Lignes végé regroupées à la fin, marquées et séparées du reste.
          const vege = parPortee && l.portee === 'veggie'
          const debutVege = vege && lignes[i - 1]?.portee !== 'veggie'
          return (
            <tr
              key={l.cle}
              className={`${debutVege ? 'border-t-2 border-foret-600/40' : 'border-t border-pierre-100'} ${
                vege ? 'bg-foret-50 print:[print-color-adjust:exact]' : ''
              } first:border-t-0`}
            >
              <td className="py-1.5 pr-3 align-top">
                <span className={automatique ? '' : 'font-medium'}>{l.nom}</span>
                {l.pkg && <span className="ml-1.5 text-xs text-pierre-500">{l.pkg}</span>}
              </td>
              <td className="whitespace-nowrap px-3 py-1.5 text-right align-top font-bold tabular-nums">{l.quantite}</td>
              {avecEquivalence && (
                <td className="whitespace-nowrap py-1.5 pl-3 align-top text-sm tabular-nums text-pierre-500">{l.equivalence}</td>
              )}
              {parPortee && (
                <td className={`whitespace-nowrap py-1.5 pl-3 align-top text-sm ${vege ? 'font-medium text-foret-800' : 'text-pierre-600'}`}>
                  {l.pour}
                </td>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** Diètes et allergies des groupes présents à ce repas. */
function RappelRepas({ rappel, imprime }: { rappel: Rappel; imprime?: boolean }) {
  if (!rappel.dietes.length && !rappel.allergies.length) return null
  return (
    <div className={imprime ? 'mt-1 space-y-0.5 text-[9.5pt]' : 'mt-2 space-y-1 text-sm'}>
      {rappel.dietes.length > 0 && (
        <p>
          <b>Diètes :</b> {rappel.dietes.join(' · ')}
        </p>
      )}
      {rappel.allergies.map((a) => (
        <p key={a.groupe} className={imprime ? '' : 'rounded-md bg-red-50 px-2 py-1 text-red-900'}>
          <b>⚠ Allergies — {a.groupe} :</b> {a.participants.map(decrireParticipant).join(' · ')}
        </p>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------
// Sur papier : un jour par page, en format compact
// ------------------------------------------------------------------

function FeuilleImprimee({
  jours,
  sansJour,
  menu,
  detail,
  infos,
}: {
  jours: JourAffiche[]
  sansJour: Carte[]
  menu: string
  detail: boolean
  infos: InfosGroupes
}) {
  return (
    <div className="hidden text-[10.5pt] leading-snug text-black print:block">
      {jours.map(({ jour, repas }, i) => (
        <section key={jour.day} className={i > 0 ? 'break-before-page' : undefined}>
          <EntetePapier titre={jour.libelle} menu={menu} />
          {repas.map((r) => (
            <RepasPapier key={r.repas.meal} affiche={r} detail={detail} rappel={rappel(r.repas, infos)} />
          ))}
        </section>
      ))}
      {sansJour.length > 0 && (
        <section className={jours.length > 0 ? 'break-before-page' : undefined}>
          <EntetePapier titre="Sans jour précis" menu={menu} />
          <div className="mt-2 space-y-2">
            {sansJour.map((c) => (
              <PlatPapier key={c.cle} carte={c} detail={detail} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function EntetePapier({ titre, menu }: { titre: string; menu: string }) {
  return (
    <header className="flex items-baseline justify-between gap-4 border-b-2 border-black pb-1">
      <h2 className="text-[18pt] font-bold">{titre}</h2>
      <p className="text-[9pt]">Feuille de cuisine · {menu}</p>
    </header>
  )
}

function RepasPapier({ affiche: { repas: r, cartes, aucunPlat }, detail, rappel }: { affiche: RepasAffiche; detail: boolean; rappel: Rappel }) {
  const presents = r.groupes.filter((g) => !g.absent && g.portions > 0)
  const absents = r.groupes.filter((g) => g.absent)
  const prevus = cartes.filter((c) => !c.automatique)
  const automatiques = cartes.filter((c) => c.automatique)
  return (
    <div className="mt-3 break-inside-avoid border-b border-pierre-300 pb-2">
      <h3 className="text-[13pt] font-bold">
        {r.libelle}
        {r.total > 0 ? ` — ${portions(r.total)}` : ''}
        {r.totalVege > 0 && <span className="font-semibold"> (dont {r.totalVege} végé)</span>}
      </h3>
      {r.total > 0 ? (
        <p className="text-[9pt]">
          {presents.map((g) => `${g.name} (${g.portions}${g.enSortie > 0 ? `, −${g.enSortie} en sortie` : ''})`).join(' · ')}
          {absents.length > 0 && <> · Absents : {absents.map((g) => g.name).join(', ')}</>}
        </p>
      ) : (
        <p className="text-[9pt]">Aucun groupe présent</p>
      )}
      <RappelRepas rappel={rappel} imprime />
      {r.total > 0 && aucunPlat && <p className="mt-1 italic">Aucun plat planifié</p>}
      <div className="mt-1.5 space-y-1.5">
        {prevus.map((c) => (
          <PlatPapier key={c.cle} carte={c} detail={detail} />
        ))}
        {automatiques.map((c) => (
          <p key={c.cle} className="text-[9pt]">
            <b>
              {LIBELLES_ROLE[c.plat.role]} ({c.plat.portions})
            </b>
            {detail && c.lignes.length > 0 && <> : {c.lignes.map((l) => `${l.nom} ${l.quantite}`).join(' · ')}</>}
          </p>
        ))}
      </div>
    </div>
  )
}

function PlatPapier({ carte: { plat, lignes, parPortee }, detail }: { carte: Carte; detail: boolean }) {
  const glaciere = plat.role === 'glaciere'
  return (
    <div className={`break-inside-avoid ${glaciere ? 'border-2 border-black p-1.5' : ''}`}>
      <p>
        <span className="text-[8pt] font-semibold uppercase tracking-wide">{glaciere ? '🧊 Glacière' : LIBELLES_ROLE[plat.role]}</span>{' '}
        <b className="text-[12pt]">{plat.nom}</b> — {portions(plat.portions)}
        {plat.vege > 0 && <b> · 🌱 {plat.vege} végé</b>}
      </p>
      {plat.note && <p className="text-[9pt] italic">{plat.note}</p>}
      {detail && lignes.length > 0 && (
        <ul className="mt-0.5 columns-2 gap-x-6 pl-3">
          {lignes.map((l) => (
            <li key={l.cle} className="flex break-inside-avoid justify-between gap-2 border-b border-dotted border-pierre-300">
              <span className="min-w-0">
                {parPortee && l.portee === 'veggie' && '🌱 '}
                {l.nom}
                {parPortee && l.portee !== 'all' && <span className="text-[8pt]"> ({l.pour.replace('🌱 ', '')})</span>}
              </span>
              <b className="shrink-0 tabular-nums">{l.quantite}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
