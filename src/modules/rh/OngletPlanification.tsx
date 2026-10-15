import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { messageErreur } from '@/lib/donnees'
import { IconeTableur } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { useTitreImpression } from '@/lib/useTitreImpression'
import { MenuSaison } from './commun'
import { useRh } from './contexte'
import { useDossiers } from './donnees'
import { useCasesPlanification, useCodesPlanification, useEnregistrerPilotage, usePilotage, usePoserCase } from './donneesPlanification'
import { aujourdhui, dateCourte, plageDates } from './outils'
import {
  cleCase,
  codeParLettres,
  comptesParDate,
  csvPlanification,
  datesAffichees,
  DIETES_AFFICHEES,
  dietesParDate,
  ecart,
  etatCase,
  GENRES_PAR_DEFAUT,
  groupesPlanification,
  lignesDesGroupes,
  nomPlanification,
  pilotageDe,
  saisonPlanification,
  type GroupeCompagnie,
} from './planification'
import { classeCode } from './couleursCodes'
import { champPetit } from './styles'
import { DIETES, statutEmbaucheDe, type CasePlanification, type CodePlanification, type DateSaison, type Dossier, type Embauche, type GenreDate } from './types'

const FILTRES_DATES: { id: GenreDate; nom: string }[] = [
  { id: 'formation', nom: 'Formations' },
  { id: 'semaine', nom: 'Semaines' },
  { id: 'sejour', nom: 'Séjours' },
  { id: 'autre', nom: 'Autres' },
]

const IMPRESSION = '@media print { @page { size: landscape; margin: 1cm } }'

/** Délai entre deux lettres d'un même code tapé au clavier. */
const DELAI_LETTRES = 900

/**
 * Planification de la saison (remplace la feuille « Suivi RH 2026 ») : une
 * ligne par embauche, une colonne par date ; vue « Diètes » pour la cuisine.
 */
export function Planification() {
  const { saisons, embauches, dates, saisonParId, auj } = useRh()
  const [params, setParams] = useSearchParams()
  const saison = params.get('saison') || saisonPlanification(saisons, embauches, dates, auj)
  const filtre = params.get('dates')
  const genres = filtre !== null ? (filtre.split(',').filter((g) => FILTRES_DATES.some((f) => f.id === g)) as GenreDate[]) : GENRES_PAR_DEFAUT
  const vue = params.get('vue') === 'dietes' ? 'dietes' : 'grille'
  const idsSaison = useMemo(() => dates.filter((d) => d.saison_id === saison).map((d) => d.id), [dates, saison])

  const codes = useCodesPlanification()
  const cases = useCasesPlanification(saison, idsSaison)
  const pilotage = usePilotage(saison, idsSaison)
  const dossiers = useDossiers()
  const s = saison ? saisonParId.get(saison) : undefined
  useTitreImpression(s ? `${vue === 'dietes' ? 'Diètes' : 'Planification'} ${s.nom}` : null)

  const changer = (cle: string, valeur: string | null) => {
    const p = new URLSearchParams(params)
    if (valeur !== null) p.set(cle, valeur)
    else p.delete(cle)
    setParams(p, { replace: true })
  }
  const basculer = (g: GenreDate) => {
    const nouveaux = genres.includes(g) ? genres.filter((x) => x !== g) : [...genres, g]
    const parDefaut = nouveaux.length === GENRES_PAR_DEFAUT.length && GENRES_PAR_DEFAUT.every((x) => nouveaux.includes(x))
    changer('dates', parDefaut ? null : FILTRES_DATES.filter((f) => nouveaux.includes(f.id)).map((f) => f.id).join(','))
  }

  const erreur = codes.error ?? cases.error ?? pilotage.error ?? dossiers.error
  const pret = codes.data && cases.data && pilotage.data && dossiers.data

  return (
    <div className="space-y-3">
      <style>{IMPRESSION}</style>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <MenuSaison className={champPetit} valeur={saison} changer={(v) => changer('saison', v)} />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Dates affichées">
          {FILTRES_DATES.map((f) => (
            <button
              key={f.id}
              aria-pressed={genres.includes(f.id)}
              onClick={() => basculer(f.id)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                genres.includes(f.id) ? 'border-foret-700 bg-foret-700 text-white' : 'border-pierre-200 bg-white text-pierre-700 hover:bg-pierre-50'
              }`}
            >
              {f.nom}
            </button>
          ))}
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-pierre-300 text-sm" role="group" aria-label="Vue">
          {(['grille', 'dietes'] as const).map((v) => (
            <button key={v} aria-pressed={vue === v} onClick={() => changer('vue', v === 'grille' ? null : v)} className={`px-3 py-1.5 ${vue === v ? 'bg-foret-700 text-white' : 'bg-white text-pierre-700 hover:bg-pierre-50'}`}>
              {v === 'grille' ? 'Grille' : 'Diètes'}
            </button>
          ))}
        </div>
      </div>
      {s && <h2 className="hidden text-lg font-semibold print:block">{`${vue === 'dietes' ? 'Diètes par semaine' : 'Planification'} — ${s.nom}`}</h2>}

      {erreur ? (
        <p className={ui.erreur}>{messageErreur(erreur)}</p>
      ) : !saison || !s ? (
        <p className="py-8 text-center text-sm text-pierre-500">Aucune saison.</p>
      ) : !pret ? (
        <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
      ) : idsSaison.length === 0 ? (
        <p className="py-8 text-center text-sm text-pierre-500">
          Aucune date pour {s.nom} : ajoutez les formations et les semaines dans{' '}
          <Link to="/rh/reglages" className="text-foret-700 underline">
            Réglages
          </Link>
          .
        </p>
      ) : (
        <Contenu
          saisonId={saison}
          nomSaison={s.nom}
          vue={vue}
          dates={datesAffichees(dates, saison, genres)}
          codes={codes.data!}
          cases={cases.data!}
          pilotage={pilotage.data!}
          dossiers={dossiers.data!}
        />
      )}
    </div>
  )
}

function Contenu(p: {
  saisonId: string
  nomSaison: string
  vue: 'grille' | 'dietes'
  dates: DateSaison[]
  codes: CodePlanification[]
  cases: CasePlanification[]
  pilotage: { date_id: string; besoin: number | null; reel_an_passe: number | null }[]
  dossiers: Dossier[]
}) {
  const { embauches, personneParId, posteParId, compagnies } = useRh()
  const groupes = useMemo(
    () => groupesPlanification({ embauches, saisonId: p.saisonId, personneParId, posteParId, compagnies }),
    [embauches, p.saisonId, personneParId, posteParId, compagnies],
  )
  const lignes = useMemo(() => lignesDesGroupes(groupes), [groupes])
  const codeParId = useMemo(() => new Map(p.codes.map((c) => [c.id, c])), [p.codes])
  const caseDe = useMemo(() => new Map(p.cases.map((c) => [cleCase(c.embauche_id, c.date_id), c])), [p.cases])
  const dossierDe = useMemo(() => new Map(p.dossiers.map((d) => [d.personne_id, d])), [p.dossiers])

  if (!lignes.length)
    return <p className="py-8 text-center text-sm text-pierre-500">Aucune embauche pour {p.nomSaison}. Une embauche se crée en acceptant une candidature.</p>
  if (!p.dates.length) return <p className="py-8 text-center text-sm text-pierre-500">Aucune date de ce genre : cochez d'autres genres de dates.</p>

  if (p.vue === 'dietes') return <Dietes dates={p.dates} cases={p.cases} codeParId={codeParId} lignes={lignes} dossierDe={dossierDe} />
  return (
    <Grille
      saisonId={p.saisonId}
      nomSaison={p.nomSaison}
      dates={p.dates}
      codes={p.codes}
      codeParId={codeParId}
      groupes={groupes}
      lignes={lignes}
      caseDe={caseDe}
      cases={p.cases}
      pilotage={p.pilotage}
      dossierDe={dossierDe}
    />
  )
}

// ------------------------------------------------------------
// Grille
// ------------------------------------------------------------

/** « Semaine 1 » + « 28 juin » */
function EnTeteDate({ d }: { d: DateSaison }) {
  return (
    <span className="block leading-tight" title={[d.nom, plageDates(d.debut, d.fin), d.note].filter(Boolean).join(' · ')}>
      <span className="line-clamp-2 block max-w-24 font-medium break-words text-pierre-800">{d.nom}</span>
      <span className="block font-normal text-pierre-500">{dateCourte(d.debut, d.debut ?? undefined)}</span>
    </span>
  )
}

interface Ouvert {
  l: number
  c: number
  haut: number
  gauche: number
}

function Grille(p: {
  saisonId: string
  nomSaison: string
  dates: DateSaison[]
  codes: CodePlanification[]
  codeParId: Map<string, CodePlanification>
  groupes: GroupeCompagnie[]
  lignes: Embauche[]
  caseDe: Map<string, CasePlanification>
  cases: CasePlanification[]
  pilotage: { date_id: string; besoin: number | null; reel_an_passe: number | null }[]
  dossierDe: Map<string, Dossier>
}) {
  const { personneParId, posteParId, compagnieParId, ecriture } = useRh()
  const poser = usePoserCase(p.saisonId)
  const [menu, setMenu] = useState<Ouvert | null>(null)
  const lettres = useRef({ texte: '', le: 0, cle: '' })
  const embaucheIds = useMemo(() => new Set(p.lignes.map((e) => e.id)), [p.lignes])
  const comptes = useMemo(() => comptesParDate(p.cases, p.codeParId, embaucheIds), [p.cases, p.codeParId, embaucheIds])
  const actifs = p.codes.filter((c) => c.actif)
  const codesBesoin = actifs.filter((c) => c.besoin).map((c) => c.code)

  const focaliser = (l: number, c: number) => document.getElementById(`rh-case-${l}-${c}`)?.focus()
  const ouvrir = (l: number, c: number, el: HTMLElement) => {
    if (!ecriture) return
    const r = el.getBoundingClientRect()
    setMenu({ l, c, haut: Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 340)), gauche: Math.max(8, Math.min(r.left, window.innerWidth - 248)) })
  }
  const poserCase = (l: number, c: number, code_id: string | null, note?: string | null) => {
    const e = p.lignes[l]
    const d = p.dates[c]
    const avant = p.caseDe.get(cleCase(e.id, d.id))
    if ((avant?.code_id ?? null) === code_id && (note === undefined || (avant?.note ?? null) === (note?.trim() || null))) return
    poser.mutate({ embauche_id: e.id, date_id: d.id, code_id, note: note === undefined ? (avant?.note ?? null) : note })
  }

  const touche = (ev: KeyboardEvent<HTMLTableElement>) => {
    const cible = (ev.target as HTMLElement).closest<HTMLElement>('[data-case]')
    if (!cible || menu) return
    const l = Number(cible.dataset.l)
    const c = Number(cible.dataset.c)
    const aller = (nl: number, nc: number) => {
      ev.preventDefault()
      focaliser(Math.max(0, Math.min(p.lignes.length - 1, nl)), Math.max(0, Math.min(p.dates.length - 1, nc)))
    }
    if (ev.key === 'ArrowDown') return aller(l + 1, c)
    if (ev.key === 'ArrowUp') return aller(l - 1, c)
    if (ev.key === 'ArrowRight') return aller(l, c + 1)
    if (ev.key === 'ArrowLeft') return aller(l, c - 1)
    if (!ecriture || ev.ctrlKey || ev.metaKey || ev.altKey) return
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault()
      return poserCase(l, c, null)
    }
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault()
      return ouvrir(l, c, cible)
    }
    if (ev.key.length === 1 && /[\p{L}\p{N}/]/u.test(ev.key)) {
      ev.preventDefault()
      // Les lettres tapées de suite dans la même case forment un code (« co » = Congé).
      const maintenant = Date.now()
      const cle = `${l}|${c}`
      const suite = lettres.current.cle === cle && maintenant - lettres.current.le < DELAI_LETTRES
      const texte = (suite ? lettres.current.texte : '') + ev.key
      lettres.current = { texte, le: maintenant, cle }
      const actuel = p.caseDe.get(cleCase(p.lignes[l].id, p.dates[c].id))?.code_id ?? null
      const choisi = codeParLettres(p.codes, texte, actuel)
      if (choisi) poserCase(l, c, choisi)
    }
  }

  const exporterCsv = () => {
    const nomDate = (d: DateSaison) => [d.nom, dateCourte(d.debut, d.debut ?? undefined)].filter(Boolean).join(' ')
    const csv = csvPlanification({
      dates: p.dates.map((d) => ({ id: d.id, libelle: nomDate(d) })),
      pilotage: [
        { libelle: 'Besoin prévu', valeurs: Object.fromEntries(p.dates.map((d) => [d.id, pilotageDe(p.pilotage, d.id).besoin])) },
        { libelle: 'Présents', valeurs: Object.fromEntries(p.dates.map((d) => [d.id, comptes.get(d.id)?.presents ?? 0])) },
        { libelle: 'Écart', valeurs: Object.fromEntries(p.dates.map((d) => [d.id, ecart(comptes.get(d.id)?.presents ?? 0, pilotageDe(p.pilotage, d.id).besoin)])) },
        { libelle: 'Tous présents', valeurs: Object.fromEntries(p.dates.map((d) => [d.id, comptes.get(d.id)?.tousPresents ?? 0])) },
        { libelle: "Réel l'an passé", valeurs: Object.fromEntries(p.dates.map((d) => [d.id, pilotageDe(p.pilotage, d.id).reel_an_passe])) },
      ],
      lignes: p.lignes.map((e) => {
        const x = personneParId.get(e.personne_id)!
        const dossier = p.dossierDe.get(e.personne_id)
        return {
          compagnie: (e.entreprise_id && compagnieParId.get(e.entreprise_id)?.nom) || '',
          poste: (e.poste_id && posteParId.get(e.poste_id)?.nom) || (e.genre === 'benevolat' ? 'Bénévole' : ''),
          nom: nomPlanification(x),
          prenom: x.prenom,
          nomFamille: x.nom_famille,
          statut: statutEmbaucheDe(e.statut).nom,
          codes: Object.fromEntries(p.dates.map((d) => [d.id, p.codeParId.get(p.caseDe.get(cleCase(e.id, d.id))?.code_id ?? '')?.code ?? ''])),
          diete: DIETES.find((x) => x.id === dossier?.diete)?.nom ?? '',
          allergies: dossier?.allergies ?? '',
          tshirt: dossier?.taille_tshirt ?? '',
          hoodie: dossier?.taille_hoodie ?? '',
        }
      }),
    })
    const lien = document.createElement('a')
    lien.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    lien.download = `Planification ${p.nomSaison} (${aujourdhui()}).csv`
    lien.click()
    setTimeout(() => URL.revokeObjectURL(lien.href), 1000)
  }

  const rangDe = new Map(p.lignes.map((e, i) => [e.id, i]))
  const colonnes = p.dates.length + 5
  const cellePilotage = 'border-b border-pierre-200 px-1 py-1 text-center tabular-nums'
  const nomLigne = 'sticky left-0 z-10 w-28 max-w-28 border-b border-r border-pierre-200 bg-white px-2 py-1 text-left sm:w-auto sm:max-w-60'

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-pierre-600 print:hidden">
        {actifs.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1" title={`${c.nom}${c.besoin ? ' · compté au besoin' : c.present ? ' · présent' : ' · absent'}`}>
            <span className={`rounded px-1.5 py-0.5 font-medium ${classeCode(c)}`}>{c.code}</span>
            {c.nom !== c.code && <span className="hidden sm:inline">{c.nom}</span>}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="text-foret-600">●</span> s'est dit disponible
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-3 rounded-sm ring-2 ring-red-400 ring-inset" /> hors de ses disponibilités
        </span>
        <span className="flex-1" />
        <button className={ui.boutonSecondaire} onClick={exporterCsv}>
          <IconeTableur className="size-4" /> CSV
        </button>
        <span className="hidden sm:inline">
          <button className={ui.boutonSecondaire} onClick={() => window.print()}>
            Imprimer
          </button>
        </span>
      </div>
      {ecriture && <p className="hidden text-xs text-pierre-500 sm:block print:hidden">Clic sur une case pour choisir son code ; au clavier : flèches, lettres du code (« a » pour Anim), Suppr pour vider, Entrée pour le menu.</p>}

      <div className={`${ui.carte} max-h-[75dvh] overflow-auto sm:max-h-[calc(100dvh-14rem)] print:max-h-none print:overflow-visible print:border-0 print:shadow-none`}>
        <table className="w-max min-w-full border-separate border-spacing-0 text-xs" onKeyDown={touche}>
          <thead className="sticky top-0 z-20 bg-pierre-50">
            <tr>
              <th className="sticky left-0 z-30 w-28 max-w-28 border-b border-r border-pierre-200 bg-pierre-50 px-2 py-1.5 text-left font-medium text-pierre-600 sm:w-auto sm:max-w-60 sm:min-w-44">
                {p.lignes.length} personne{p.lignes.length > 1 ? 's' : ''}
              </th>
              {p.dates.map((d) => (
                <th key={d.id} className="w-16 min-w-14 border-b border-pierre-200 px-1 py-1.5 text-center align-bottom">
                  <EnTeteDate d={d} />
                </th>
              ))}
              <th className="border-b border-l border-pierre-200 px-2 py-1.5 text-left font-medium text-pierre-600">Diète</th>
              <th className="border-b border-pierre-200 px-2 py-1.5 text-left font-medium text-pierre-600">Allergies</th>
              <th className="border-b border-pierre-200 px-1 py-1.5 text-center font-medium text-pierre-600">T-shirt</th>
              <th className="border-b border-pierre-200 px-1 py-1.5 text-center font-medium text-pierre-600">Hoodie</th>
            </tr>
          </thead>
          <tbody>
            <LignePilotage libelle="Besoin prévu" aide="Nombre prévu de personnes comptées au besoin" dates={p.dates} valeur={(d) => pilotageDe(p.pilotage, d.id).besoin} champ="besoin" saisonId={p.saisonId} colonnes={colonnes} />
            <tr>
              <th className={`${nomLigne} font-medium text-pierre-700`} title={`Codes comptés au besoin : ${codesBesoin.join(', ') || 'aucun'}`}>
                Présents
              </th>
              {p.dates.map((d) => (
                <td key={d.id} className={`${cellePilotage} font-semibold text-pierre-800`}>
                  {comptes.get(d.id)?.presents ?? 0}
                </td>
              ))}
              <td colSpan={4} className="border-b border-l border-pierre-200" />
            </tr>
            <tr>
              <th className={`${nomLigne} font-medium text-pierre-700`}>Écart</th>
              {p.dates.map((d) => {
                const x = ecart(comptes.get(d.id)?.presents ?? 0, pilotageDe(p.pilotage, d.id).besoin)
                return (
                  <td key={d.id} className={`${cellePilotage} font-semibold ${x == null ? 'text-pierre-300' : x < 0 ? 'bg-red-50 text-red-700' : 'text-foret-700'}`}>
                    {x == null ? '—' : x > 0 ? `+${x}` : x}
                  </td>
                )
              })}
              <td colSpan={4} className="border-b border-l border-pierre-200" />
            </tr>
            <tr>
              <th className={`${nomLigne} font-medium text-pierre-700`} title="Tous les codes « présent »">
                Tous présents
              </th>
              {p.dates.map((d) => (
                <td key={d.id} className={`${cellePilotage} text-pierre-700`}>
                  {comptes.get(d.id)?.tousPresents ?? 0}
                </td>
              ))}
              <td colSpan={4} className="border-b border-l border-pierre-200" />
            </tr>
            <LignePilotage libelle="Réel l'an passé" aide="Repère saisi à la main" dates={p.dates} valeur={(d) => pilotageDe(p.pilotage, d.id).reel_an_passe} champ="reel_an_passe" saisonId={p.saisonId} colonnes={colonnes} />

            {p.groupes.map((g) => (
              <GroupeLignes key={g.compagnie?.id ?? 'aucune'} g={g} colonnes={colonnes}>
                {(e) => {
                  const l = rangDe.get(e.id)!
                  const x = personneParId.get(e.personne_id)!
                  const dossier = p.dossierDe.get(e.personne_id)
                  const st = statutEmbaucheDe(e.statut)
                  return (
                    <tr key={e.id} className="group">
                      <th className={`${nomLigne} font-normal group-hover:bg-pierre-50`}>
                        <Link to={`/rh/p/${x.id}`} className="block truncate font-medium text-pierre-900 hover:underline" title={`${x.prenom} ${x.nom_famille}`}>
                          {nomPlanification(x)}
                        </Link>
                        <span className="flex flex-wrap items-center gap-x-1">
                          <span className="max-w-full truncate text-[11px] text-pierre-500 sm:max-w-36">{x.surnom ? `${x.prenom} ${x.nom_famille}` : x.nom_famille}</span>
                          {e.genre === 'benevolat' && <span className="rounded bg-teal-50 px-1 text-[10px] font-medium text-teal-800">Bén.</span>}
                          {e.statut !== 'complete' && <span className={`whitespace-nowrap rounded px-1 text-[10px] font-medium ${st.couleur}`}>{st.nom}</span>}
                        </span>
                      </th>
                      {p.dates.map((d, c) => {
                        const k = p.caseDe.get(cleCase(e.id, d.id))
                        const code = k ? p.codeParId.get(k.code_id) : undefined
                        const etat = etatCase(e, d.id, code)
                        const titre = [
                          `${nomPlanification(x)} · ${d.nom}`,
                          code ? code.nom : 'vide',
                          etat.dispo && "s'est dit disponible",
                          etat.horsDispo && "pas coché dans ses disponibilités",
                          k?.note,
                          k?.updated_by_nom && `par ${k.updated_by_nom}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                        return (
                          <td key={d.id} className="border-b border-pierre-100 p-0.5">
                            <button
                              id={`rh-case-${l}-${c}`}
                              data-case
                              data-l={l}
                              data-c={c}
                              title={titre}
                              aria-label={titre}
                              onClick={(ev) => ouvrir(l, c, ev.currentTarget)}
                              className={`relative flex h-7 w-full min-w-12 items-center justify-center rounded text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-foret-600 ${
                                code ? classeCode(code) : 'text-pierre-300 hover:bg-pierre-50'
                              } ${etat.horsDispo ? 'ring-2 ring-red-400 ring-inset' : ''} ${ecriture ? 'cursor-pointer' : 'cursor-default'}`}
                            >
                              {code ? code.code : etat.dispo ? <span className="text-foret-600">●</span> : ''}
                              {k?.note && <span className="absolute top-0 right-0.5 text-[9px] text-pierre-500">✎</span>}
                            </button>
                          </td>
                        )
                      })}
                      <td className="max-w-28 truncate border-b border-l border-pierre-100 px-2 text-pierre-700">{DIETES.find((x) => x.id === dossier?.diete)?.nom ?? ''}</td>
                      <td className="max-w-40 truncate border-b border-pierre-100 px-2 text-pierre-700" title={dossier?.allergies ?? undefined}>
                        {dossier?.allergies ?? ''}
                      </td>
                      <td className="border-b border-pierre-100 px-1 text-center text-pierre-700">{dossier?.taille_tshirt ?? ''}</td>
                      <td className="border-b border-pierre-100 px-1 text-center text-pierre-700">{dossier?.taille_hoodie ?? ''}</td>
                    </tr>
                  )
                }}
              </GroupeLignes>
            ))}
          </tbody>
        </table>
      </div>

      {menu && (
        <MenuCase
          codes={actifs}
          ouvert={menu}
          actuel={p.caseDe.get(cleCase(p.lignes[menu.l].id, p.dates[menu.c].id))}
          titre={`${nomPlanification(personneParId.get(p.lignes[menu.l].personne_id)!)} · ${p.dates[menu.c].nom}`}
          fermer={() => {
            const { l, c } = menu
            setMenu(null)
            requestAnimationFrame(() => focaliser(l, c))
          }}
          choisir={(code, note) => poserCase(menu.l, menu.c, code, note)}
        />
      )}
    </div>
  )
}

/** En-têtes de compagnie et de poste, puis les lignes. */
function GroupeLignes({ g, colonnes, children }: { g: GroupeCompagnie; colonnes: number; children: (e: Embauche) => ReactNode }) {
  return (
    <>
      <tr>
        <th colSpan={colonnes} className="border-b border-pierre-200 bg-pierre-100/70 px-0 py-1 text-left text-xs font-semibold tracking-wide text-pierre-700 uppercase">
          <span className="sticky left-0 px-2">{g.compagnie?.nom ?? 'Sans compagnie'}</span>
        </th>
      </tr>
      {g.postes.map((x) => (
        <PosteLignes key={x.poste?.id ?? 'aucun'} nom={x.poste?.nom ?? 'Poste à préciser'} lignes={x.lignes} colonnes={colonnes}>
          {children}
        </PosteLignes>
      ))}
    </>
  )
}

function PosteLignes({ nom, lignes, colonnes, children }: { nom: string; lignes: Embauche[]; colonnes: number; children: (e: Embauche) => ReactNode }) {
  return (
    <>
      <tr>
        <th colSpan={colonnes} className="border-b border-pierre-100 bg-pierre-50/60 px-0 py-0.5 text-left text-[11px] font-medium text-pierre-500">
          <span className="sticky left-0 px-2">
            {nom} · {lignes.length}
          </span>
        </th>
      </tr>
      {lignes.map((e) => children(e))}
    </>
  )
}

/** Besoin prévu ou réel de l'an passé : un nombre par date, enregistré en quittant la case. */
function LignePilotage({
  libelle,
  aide,
  dates,
  valeur,
  champ,
  saisonId,
  colonnes,
}: {
  libelle: string
  aide: string
  dates: DateSaison[]
  valeur: (d: DateSaison) => number | null
  champ: 'besoin' | 'reel_an_passe'
  saisonId: string
  colonnes: number
}) {
  const { ecriture } = useRh()
  const enregistrer = useEnregistrerPilotage(saisonId)
  return (
    <tr>
      <th className="sticky left-0 z-10 w-28 max-w-28 border-r border-b border-pierre-200 bg-white px-2 py-1 text-left font-medium text-pierre-700 sm:w-auto sm:max-w-60" title={aide}>
        {libelle}
      </th>
      {dates.map((d) => {
        const v = valeur(d)
        return (
          <td key={d.id} className="border-b border-pierre-200 px-0.5 py-0.5 text-center tabular-nums">
            {ecriture ? (
              <input
                key={`${d.id}-${v ?? ''}`}
                aria-label={`${libelle} · ${d.nom}`}
                inputMode="numeric"
                className="w-full min-w-10 rounded border border-transparent bg-transparent px-1 py-0.5 text-center text-xs hover:border-pierre-200 focus:border-foret-600 focus:outline-none print:border-0"
                defaultValue={v ?? ''}
                placeholder="—"
                onBlur={(ev) => {
                  const t = ev.target.value.trim()
                  const n = t === '' ? null : Math.max(0, Math.min(9999, Math.round(Number(t.replace(',', '.')))))
                  if (n !== null && Number.isNaN(n)) ev.target.value = v == null ? '' : String(v)
                  else if (n !== v) enregistrer.mutate({ date_id: d.id, [champ]: n })
                }}
                onKeyDown={(ev) => ev.key === 'Enter' && ev.currentTarget.blur()}
              />
            ) : (
              (v ?? '—')
            )}
          </td>
        )
      })}
      <td colSpan={colonnes - dates.length - 1} className="border-b border-l border-pierre-200" />
    </tr>
  )
}

/** Menu d'une case : les codes, vider, une note. */
function MenuCase({
  codes,
  ouvert,
  actuel,
  titre,
  fermer,
  choisir,
}: {
  codes: CodePlanification[]
  ouvert: Ouvert
  actuel: CasePlanification | undefined
  titre: string
  fermer: () => void
  choisir: (code: string | null, note?: string | null) => void
}) {
  const [note, setNote] = useState(actuel?.note ?? '')
  const prendre = (code: string | null) => {
    choisir(code, code ? note : null)
    fermer()
  }
  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={fermer} />
      <div
        role="dialog"
        aria-label={titre}
        className="fixed z-50 w-60 rounded-lg border border-pierre-200 bg-white p-2 shadow-lg"
        style={{ top: ouvert.haut, left: ouvert.gauche }}
        onKeyDown={(ev) => ev.key === 'Escape' && fermer()}
      >
        <p className="mb-1.5 truncate px-1 text-xs font-medium text-pierre-600">{titre}</p>
        <div className="grid grid-cols-2 gap-1">
          {codes.map((c, i) => (
            <button
              key={c.id}
              autoFocus={actuel ? actuel.code_id === c.id : i === 0}
              onClick={() => prendre(c.id)}
              className={`truncate rounded px-2 py-1 text-left text-xs font-medium focus:outline-none focus:ring-2 focus:ring-foret-600 ${classeCode(c)} ${actuel?.code_id === c.id ? 'ring-2 ring-pierre-500' : ''}`}
              title={c.nom}
            >
              {c.code}
              {c.nom !== c.code && <span className="ml-1 font-normal opacity-70">{c.nom}</span>}
            </button>
          ))}
        </div>
        <input
          className="mt-2 w-full rounded border border-pierre-300 px-2 py-1 text-xs focus:border-foret-600 focus:outline-none"
          placeholder="Note (facultative)"
          value={note}
          onChange={(ev) => setNote(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' && actuel) {
              choisir(actuel.code_id, note)
              fermer()
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <button className="text-xs text-pierre-500 underline hover:text-red-700 disabled:opacity-40" disabled={!actuel} onClick={() => prendre(null)}>
            Vider la case
          </button>
          {actuel && (
            <button
              className="text-xs text-foret-700 underline disabled:opacity-40"
              disabled={(actuel.note ?? '') === note.trim()}
              onClick={() => {
                choisir(actuel.code_id, note)
                fermer()
              }}
            >
              Enregistrer la note
            </button>
          )}
        </div>
      </div>
    </>
  )
}

// ------------------------------------------------------------
// Diètes par semaine
// ------------------------------------------------------------

function Dietes(p: { dates: DateSaison[]; cases: CasePlanification[]; codeParId: Map<string, CodePlanification>; lignes: Embauche[]; dossierDe: Map<string, Dossier> }) {
  const { personneParId } = useRh()
  const parDate = useMemo(
    () => dietesParDate({ dates: p.dates, cases: p.cases, codeParId: p.codeParId, embauches: p.lignes, personneParId, dossierDe: p.dossierDe }),
    [p.dates, p.cases, p.codeParId, p.lignes, personneParId, p.dossierDe],
  )
  const presents = [...p.codeParId.values()].filter((c) => c.present && c.actif).map((c) => c.code)
  const avecAllergies = p.dates.map((d, i) => ({ d, x: parDate[i] })).filter(({ x }) => x.allergies.length)
  const cellule = 'border-b border-pierre-100 px-2 py-1.5 text-center tabular-nums'
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-pierre-600 print:hidden">
        <p className="flex-1">
          Personnes présentes (codes {presents.join(', ')}) par diète de leur dossier ; sans dossier ou sans réponse : « Non précisée ». Rien n'est envoyé à Cuisine pour l'instant.
        </p>
        <button className={ui.boutonSecondaire} onClick={() => window.print()}>
          Imprimer
        </button>
      </div>
      <div className={`${ui.carte} overflow-x-auto print:border-0 print:shadow-none`}>
        <table className="w-max min-w-full text-sm">
          <thead className="bg-pierre-50 text-xs text-pierre-600">
            <tr>
              <th className="sticky left-0 bg-pierre-50 px-3 py-2 text-left font-medium">Diète</th>
              {p.dates.map((d) => (
                <th key={d.id} className="min-w-16 px-2 py-2 text-center">
                  <EnTeteDate d={d} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DIETES_AFFICHEES.map((x) => (
              <tr key={x.id}>
                <th className="sticky left-0 border-b border-pierre-100 bg-white px-3 py-1.5 text-left font-medium text-pierre-800">{x.nom}</th>
                {parDate.map((dd) => (
                  <td key={dd.date_id} className={`${cellule} ${dd.parDiete[x.id] ? 'text-pierre-900' : 'text-pierre-300'}`}>
                    {dd.parDiete[x.id]}
                    {dd.total > 0 && dd.parDiete[x.id] > 0 && <span className="ml-1 text-xs text-pierre-500">({dd.pourcents[x.id]} %)</span>}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-pierre-50 font-semibold">
              <th className="sticky left-0 bg-pierre-50 px-3 py-1.5 text-left">Total</th>
              {parDate.map((dd) => (
                <td key={dd.date_id} className="px-2 py-1.5 text-center tabular-nums">
                  {dd.total}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <section className={`${ui.carte} p-4 print:border-0 print:p-0 print:shadow-none`}>
        <h3 className="mb-2 font-semibold text-pierre-900">Allergies des présents</h3>
        {avecAllergies.length === 0 ? (
          <p className="text-sm text-pierre-500">Aucune allergie au dossier des personnes présentes.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {avecAllergies.map(({ d, x }) => (
              <div key={d.id} className="break-inside-avoid">
                <p className="text-sm font-medium text-pierre-800">
                  {d.nom} <span className="font-normal text-pierre-500">· {plageDates(d.debut, d.fin)}</span>
                </p>
                <ul className="mt-1 space-y-0.5 text-sm text-pierre-700">
                  {x.allergies.map((a, i) => (
                    <li key={i}>
                      <span className="font-medium">{a.nom}</span> : {a.allergie}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
