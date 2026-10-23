import { useState, type KeyboardEvent } from 'react'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { IconePlus, IconeRenommer } from '@/lib/icones'
import { PuceCompagnie } from '@/lib/PuceCompagnie'
import { sortirCarte } from '@/lib/sortieCarte'
import { ui } from '@/lib/ui'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { Compter } from './Compter'
import { useCompter, useMajArticle, type Donnees } from './donnees'
import { Fiche } from './Fiche'
import {
  AUCUN,
  FILTRES_VIDES,
  articlesVisibles,
  aujourdhui,
  compteAvant,
  compteDuJour,
  dateCourte,
  etatGroupe,
  manque,
  regrouper,
  texteEtatGroupe,
  total,
  type Filtres,
  type Groupe,
  type Regroupement,
} from './outils'
import type { Article, ChampsCompte, Compte } from './types'

type Fenetre = { type: 'fiche'; id: string | null } | { type: 'compter'; id: string }

const CHAMPS = [
  { champ: 'bon', libelle: 'Bons', long: 'En bon état' },
  { champ: 'brise', libelle: 'Brisés', long: 'Brisés / à réparer' },
  { champ: 'incomplet', libelle: 'Incomplets', long: 'Incomplets' },
] as const

/**
 * Onglet Équipement : chaque article avec son dernier compte (et sa date).
 * On compte quand on veut, une section à la fois : le mode comptage date
 * les nombres entrés du jour choisi (aujourd'hui par défaut).
 */
export function Equipement({
  d,
  ecriture,
  sectionObligatoire,
}: {
  d: Donnees
  ecriture: boolean
  /** Un nouvel article doit être dans une des sections (Embarcations : les droits en dépendent). */
  sectionObligatoire?: boolean
}) {
  const grandEcran = useMediaQuery('(min-width: 768px)')
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES)
  const [par, setPar] = useState<Regroupement>('section')
  /** Jour du comptage en cours sur cet écran ; null = consultation. */
  const [comptage, setComptage] = useState<string | null>(null)
  const [fenetre, setFenetre] = useState<Fenetre | null>(null)
  const [voirRetires, setVoirRetires] = useState(false)

  const jour = comptage ?? aujourdhui()
  const historiqueDe = (a: Article) => d.historique(a.id)
  const effectifs = { ...filtres, aCompter: filtres.aCompter && !!comptage }
  const visibles = articlesVisibles(d.articles, historiqueDe, effectifs, jour)
  const groupes = regrouper(visibles, par, par === 'section' ? d.sections : d.lieux)
  const ordre = groupes.flatMap((g) => g.articles)
  const retires = d.articles.filter((a) => !a.actif)
  const filtresActifs = JSON.stringify(effectifs) !== JSON.stringify(FILTRES_VIDES)

  /** Commence à compter (tout, ou une section / un lieu) ; sur téléphone, ouvre le premier article. */
  const compter = (groupe?: Groupe) => {
    setComptage(comptage ?? aujourdhui())
    if (groupe) {
      setFiltres({ ...FILTRES_VIDES, [par]: groupe.id })
      if (!grandEcran && groupe.articles[0]) setFenetre({ type: 'compter', id: groupe.articles[0].id })
    }
  }
  const fermerComptage = () => {
    setComptage(null)
    setFiltres({ ...filtres, aCompter: false })
  }
  const ouvrir = (a: Article) => setFenetre(comptage && ecriture && !grandEcran ? { type: 'compter', id: a.id } : { type: 'fiche', id: a.id })

  return (
    <div>
      {comptage ? (
        <EnteteComptage d={d} jour={comptage} setJour={setComptage} articles={visibles} fermer={fermerComptage} />
      ) : (
        <EnteteConsultation d={d} ecriture={ecriture} compter={() => compter()} />
      )}

      <BarreFiltres
        d={d}
        filtres={filtres}
        setFiltres={setFiltres}
        par={par}
        setPar={setPar}
        enComptage={!!comptage}
        ajouter={ecriture ? () => setFenetre({ type: 'fiche', id: null }) : undefined}
      />

      <p className="mb-2 mt-3 text-sm text-pierre-500">
        {visibles.length} article{visibles.length > 1 ? 's' : ''}
        {filtresActifs && (
          <button className="ml-2 text-foret-700 underline" onClick={() => setFiltres(FILTRES_VIDES)}>
            Effacer les filtres
          </button>
        )}
      </p>

      {visibles.length === 0 ? (
        <p className={`${ui.carte} p-8 text-center text-sm text-pierre-500`}>
          {d.articles.length ? 'Aucun article ne correspond à ces filtres.' : 'Aucun article pour l’instant.'}
        </p>
      ) : grandEcran ? (
        <Tableau
          d={d}
          groupes={groupes}
          par={par}
          jour={comptage}
          ecriture={ecriture}
          compterGroupe={ecriture && !comptage ? compter : undefined}
          ouvrir={(a) => setFenetre({ type: 'fiche', id: a.id })}
        />
      ) : (
        <Cartes d={d} groupes={groupes} par={par} jour={comptage} compterGroupe={ecriture && !comptage ? compter : undefined} ouvrir={ouvrir} />
      )}

      {retires.length > 0 && (
        <div className="mt-6">
          <button className="text-sm text-pierre-500 underline" onClick={() => setVoirRetires(!voirRetires)} aria-expanded={voirRetires}>
            {retires.length} article{retires.length > 1 ? 's' : ''} retiré{retires.length > 1 ? 's' : ''} de l'inventaire
          </button>
          {voirRetires && <Retires d={d} articles={retires} ecriture={ecriture} ouvrir={(a) => setFenetre({ type: 'fiche', id: a.id })} />}
        </div>
      )}

      {fenetre?.type === 'fiche' && (
        <Fiche
          key={fenetre.id ?? 'nouveau'}
          d={d}
          id={fenetre.id}
          ecriture={ecriture}
          sectionObligatoire={sectionObligatoire}
          defauts={{
            section_id: filtres.section && filtres.section !== AUCUN ? filtres.section : null,
            lieu_id: filtres.lieu && filtres.lieu !== AUCUN ? filtres.lieu : null,
            entreprise_id: filtres.compagnie && filtres.compagnie !== AUCUN ? filtres.compagnie : null,
          }}
          fermer={() => setFenetre(null)}
          compter={
            ecriture
              ? (id) => {
                  setComptage(jour)
                  setFenetre({ type: 'compter', id })
                }
              : undefined
          }
        />
      )}
      {fenetre?.type === 'compter' && (
        <Compter
          key={fenetre.id}
          d={d}
          jour={jour}
          ordre={ordre}
          id={fenetre.id}
          aller={(id) => setFenetre({ type: 'compter', id })}
          fiche={(id) => setFenetre({ type: 'fiche', id })}
          fermer={() => setFenetre(null)}
        />
      )}
    </div>
  )
}

// ------------------------------------------------------------------
// En-tête : consultation, ou comptage en cours (jour, avancement)
// ------------------------------------------------------------------

function EnteteConsultation({ d, ecriture, compter }: { d: Donnees; ecriture: boolean; compter: () => void }) {
  const actifs = d.articles.filter((a) => a.actif)
  const e = etatGroupe(actifs, (a) => d.historique(a.id))
  return (
    <div className={`${ui.carte} mb-3 flex flex-col gap-3 p-3 sm:flex-row sm:items-center`}>
      <div className="min-w-0 flex-1 text-sm text-pierre-600">
        {e.plusRecent ? (
          <p>
            Dernier compte : <strong className="text-pierre-900">{dateCourte(e.plusRecent)}</strong>
          </p>
        ) : (
          <p>Aucun article compté pour l'instant.</p>
        )}
        <p className="text-xs text-pierre-500">
          On compte quand on veut, une section à la fois ; le dernier compte de chaque article fait foi.
          {e.jamais > 0 && ` ${e.jamais} article${e.jamais > 1 ? 's' : ''} jamais compté${e.jamais > 1 ? 's' : ''}.`}
        </p>
      </div>
      {ecriture && (
        <button className={`${ui.bouton} shrink-0`} onClick={compter}>
          Compter
        </button>
      )}
    </div>
  )
}

function EnteteComptage({
  d,
  jour,
  setJour,
  articles,
  fermer,
}: {
  d: Donnees
  jour: string
  setJour: (j: string) => void
  articles: Article[]
  fermer: () => void
}) {
  const comptes = articles.filter((a) => compteDuJour(d.historique(a.id), jour)).length
  const aujourd = aujourdhui()
  return (
    <div className="mb-3 flex flex-col gap-3 rounded-xl border-2 border-foret-600 bg-foret-50/40 p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="jour-comptage" className="text-sm font-medium text-foret-800">
            Comptage du
          </label>
          <input
            id="jour-comptage"
            type="date"
            max={aujourd}
            className="rounded-lg border border-pierre-300 bg-white px-2 py-1 text-sm"
            value={jour}
            onChange={(e) => e.target.value && setJour(e.target.value > aujourd ? aujourd : e.target.value)}
          />
          {jour !== aujourd && <span className="text-xs text-amber-800">(pas aujourd'hui)</span>}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-pierre-200" aria-hidden>
            <div className="h-full rounded-full bg-foret-600" style={{ width: `${articles.length ? (comptes / articles.length) * 100 : 0}%` }} />
          </div>
          <span className="text-xs text-pierre-600">
            {comptes} sur {articles.length} articles affichés comptés ce jour-là
          </span>
        </div>
      </div>
      <button className={`${ui.boutonSecondaire} shrink-0`} onClick={fermer}>
        Fermer le comptage
      </button>
    </div>
  )
}

// ------------------------------------------------------------------
// Filtres
// ------------------------------------------------------------------

function BarreFiltres({
  d,
  filtres,
  setFiltres,
  par,
  setPar,
  enComptage,
  ajouter,
}: {
  d: Donnees
  filtres: Filtres
  setFiltres: (f: Filtres) => void
  par: Regroupement
  setPar: (p: Regroupement) => void
  enComptage: boolean
  ajouter?: () => void
}) {
  const maj = (champs: Partial<Filtres>) => setFiltres({ ...filtres, ...champs })
  const choix = 'rounded-lg border border-pierre-300 bg-white px-2.5 py-2 text-sm'
  const utilisees = new Set(d.articles.map((a) => a.entreprise_id))
  const compagnies = d.compagnies.filter((c) => utilisees.has(c.id))
  const bascule = (actif: boolean) =>
    `whitespace-nowrap rounded-lg border px-2.5 py-2 text-sm ${actif ? 'border-foret-600 bg-foret-50 text-foret-800' : 'border-pierre-300 bg-white text-pierre-700 hover:bg-pierre-50'}`

  return (
    <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
      <div className="flex gap-2 md:contents">
        <input
          type="search"
          placeholder="Chercher un article"
          aria-label="Chercher un article"
          className={`${ui.champ} min-w-0 flex-1 md:w-56 md:flex-none`}
          value={filtres.recherche}
          onChange={(e) => maj({ recherche: e.target.value })}
        />
        {ajouter && (
          <div className="flex shrink-0 gap-2 md:order-last md:ml-auto">
            <button className={ui.boutonSecondaire} onClick={ajouter}>
              <IconePlus /> Article
            </button>
          </div>
        )}
      </div>
      <div className="sans-barre -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        <select aria-label="Section" className={choix} value={filtres.section} onChange={(e) => maj({ section: e.target.value })}>
          <option value="">Toutes les sections</option>
          {d.sections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
          <option value={AUCUN}>Sans section</option>
        </select>
        <select aria-label="Lieu" className={choix} value={filtres.lieu} onChange={(e) => maj({ lieu: e.target.value })}>
          <option value="">Tous les lieux</option>
          {d.lieux.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nom}
            </option>
          ))}
          <option value={AUCUN}>Sans lieu</option>
        </select>
        {compagnies.length > 1 && (
          <select aria-label="Compagnie" className={choix} value={filtres.compagnie} onChange={(e) => maj({ compagnie: e.target.value })}>
            <option value="">Toutes les compagnies</option>
            {compagnies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        )}
        {enComptage && (
          <button className={bascule(filtres.aCompter)} aria-pressed={filtres.aCompter} onClick={() => maj({ aCompter: !filtres.aCompter })}>
            À compter
          </button>
        )}
        <button className={bascule(filtres.manquants)} aria-pressed={filtres.manquants} onClick={() => maj({ manquants: !filtres.manquants })}>
          Il en manque
        </button>
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-pierre-300 text-sm" role="group" aria-label="Regrouper par">
          {(['section', 'lieu'] as const).map((p) => (
            <button
              key={p}
              className={`whitespace-nowrap px-2.5 py-2 ${par === p ? 'bg-pierre-800 text-white' : 'bg-white text-pierre-700 hover:bg-pierre-50'}`}
              aria-pressed={par === p}
              onClick={() => setPar(p)}
            >
              {p === 'section' ? 'Par section' : 'Par lieu'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------
// Ordinateur : un tableau, une partie par section (ou par lieu)
// ------------------------------------------------------------------

function Tableau({
  d,
  groupes,
  par,
  jour,
  ecriture,
  compterGroupe,
  ouvrir,
}: {
  d: Donnees
  groupes: Groupe[]
  par: Regroupement
  /** Jour du comptage ; null = consultation (dernier compte de chaque article). */
  jour: string | null
  ecriture: boolean
  compterGroupe?: (g: Groupe) => void
  ouvrir: (a: Article) => void
}) {
  let rang = 0
  const saisie = !!jour && ecriture
  const colonnes = 11
  return (
    <div className={`${ui.carte} overflow-x-auto`}>
      <table className="w-full text-sm">
        <thead className="border-b border-pierre-200 bg-pierre-50 text-left text-pierre-500">
          <tr>
            <th className="min-w-52 px-3 py-2 font-medium">Article</th>
            <th className="px-3 py-2 font-medium">{par === 'section' ? 'Lieu' : 'Section'}</th>
            <th className="px-3 py-2 font-medium">Compagnie</th>
            <th className="px-2 py-2 text-right font-medium" title="Nombre qu'il faut avoir">
              Nécessaire
            </th>
            {CHAMPS.map((c) => (
              <th key={c.champ} className="px-2 py-2 text-right font-medium" title={c.long}>
                {c.libelle}
              </th>
            ))}
            <th className="px-2 py-2 text-right font-medium">Total</th>
            <th className="whitespace-nowrap px-2 py-2 font-medium">{jour ? 'Compte d’avant' : 'Compté le'}</th>
            <th className="min-w-44 px-3 py-2 font-medium">{jour ? 'Note du jour' : 'Note'}</th>
            <th />
          </tr>
        </thead>
        {groupes.map((g) => {
          const h = (a: Article) => d.historique(a.id)
          const comptesDuJour = jour ? g.articles.filter((a) => compteDuJour(h(a), jour)).length : 0
          return (
            <tbody key={g.id} className="divide-y divide-pierre-100 border-b border-pierre-200">
              <tr className="bg-pierre-50/60">
                <th colSpan={colonnes} className="px-3 pb-1.5 pt-3 text-left text-sm font-semibold text-pierre-800">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span>{g.titre}</span>
                    <span className="text-xs font-normal text-pierre-500">
                      {jour ? `${comptesDuJour} / ${g.articles.length} comptés ce jour-là` : `${g.articles.length} · ${texteEtatGroupe(etatGroupe(g.articles, h))}`}
                    </span>
                    {compterGroupe && (
                      <button className="text-xs font-medium text-foret-700 hover:underline" onClick={() => compterGroupe(g)}>
                        Compter {par === 'section' ? 'cette section' : 'ce lieu'}
                      </button>
                    )}
                  </div>
                </th>
              </tr>
              {g.articles.map((a) => {
                const historique = h(a)
                // En comptage : les nombres de ce jour-là ; sinon le dernier compte.
                const c = jour ? compteDuJour(historique, jour) : historique[0]
                const reference = jour ? compteAvant(historique, jour) : undefined
                const m = manque(a, jour ? (c ?? reference) : c)
                const cie = a.entreprise_id ? d.compagnie.get(a.entreprise_id) : undefined
                const autre = par === 'section' ? (a.lieu_id ? d.lieu.get(a.lieu_id)?.nom : null) : a.section_id ? d.section.get(a.section_id)?.nom : null
                const r = rang++
                return (
                  <tr key={a.id} className="hover:bg-pierre-50">
                    <td className="px-3 py-1.5">
                      <button className="text-left hover:underline" onClick={() => ouvrir(a)}>
                        <span className="font-medium text-pierre-900">{a.nom}</span>
                        {a.variante && <span className="text-pierre-500"> · {a.variante}</span>}
                      </button>
                      {a.note && (
                        <p className="max-w-72 truncate text-xs text-pierre-500" title={a.note}>
                          {a.note}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-pierre-600">{autre ?? '—'}</td>
                    <td className="px-3 py-1.5">{cie ? <PuceCompagnie compagnie={cie} court /> : <span className="text-pierre-400">—</span>}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                      {a.necessaire ?? <span className="text-pierre-400">—</span>}
                      {m > 0 && (
                        <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800" title={`Il en manque ${m} en bon état`}>
                          −{m}
                        </span>
                      )}
                    </td>
                    {CHAMPS.map((ch) => (
                      <td key={ch.champ} className="px-2 py-1 text-right">
                        {saisie && jour ? (
                          <CaseNombre article={a.id} jour={jour} champ={ch.champ} valeur={c ? c[ch.champ] : null} rang={r} libelle={`${ch.long} : ${a.nom}`} />
                        ) : (
                          <span className={`tabular-nums ${ch.champ !== 'bon' && c?.[ch.champ] ? 'font-medium text-red-700' : ''}`}>
                            {c ? c[ch.champ] : <span className="text-pierre-400">—</span>}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-medium tabular-nums">{c ? total(c) : <span className="font-normal text-pierre-400">—</span>}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-xs text-pierre-500">
                      {jour ? (
                        reference ? (
                          <span title={`${reference.bon} bons, ${reference.brise} brisés, ${reference.incomplet} incomplets`}>
                            {total(reference)} · {dateCourte(reference.jour)}
                          </span>
                        ) : (
                          'jamais compté'
                        )
                      ) : c ? (
                        dateCourte(c.jour)
                      ) : (
                        'jamais'
                      )}
                    </td>
                    <td className="px-3 py-1">
                      {saisie && jour ? <NoteDuJour article={a.id} jour={jour} compte={c} /> : <span className="text-pierre-600">{c?.note}</span>}
                    </td>
                    <td className="px-2 py-1 text-right">
                      <button className="rounded p-1 text-pierre-500 hover:bg-pierre-100 hover:text-pierre-800" aria-label={`Fiche : ${a.nom}`} onClick={() => ouvrir(a)}>
                        <IconeRenommer className="size-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          )
        })}
      </table>
    </div>
  )
}

/** Un nombre du compte de ce jour-là : enregistré en quittant la case ; Entrée descend à l'article suivant. */
function CaseNombre({
  article,
  jour,
  champ,
  valeur,
  rang,
  libelle,
}: {
  article: string
  jour: string
  champ: keyof Pick<Compte, 'bon' | 'brise' | 'incomplet'>
  valeur: number | null
  rang: number
  libelle: string
}) {
  const compter = useCompter()
  const [texte, setTexte] = useState(valeur == null ? '' : String(valeur))
  const [base, setBase] = useState(valeur)
  if (valeur !== base) {
    setBase(valeur)
    setTexte(valeur == null ? '' : String(valeur))
  }
  const sauver = () => {
    if (texte === '') return setTexte(valeur == null ? '' : String(valeur))
    const n = Number(texte)
    if (n !== valeur) compter.mutate({ article_id: article, jour, champs: { [champ]: n } as ChampsCompte })
  }
  const touche = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const suivante = document.querySelector<HTMLInputElement>(`input[data-colonne="${champ}"][data-rang="${rang + 1}"]`)
    if (suivante) suivante.focus()
    else e.currentTarget.blur()
  }
  return (
    <input
      aria-label={libelle}
      inputMode="numeric"
      data-colonne={champ}
      data-rang={rang}
      placeholder="—"
      className={`h-7 w-14 rounded-md border border-pierre-200 bg-white px-1.5 text-right tabular-nums hover:border-pierre-400 focus:border-foret-600 focus:outline-none focus:ring-2 focus:ring-foret-600/20 ${
        champ !== 'bon' && valeur ? 'font-medium text-red-700' : ''
      }`}
      value={texte}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setTexte(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={sauver}
      onKeyDown={touche}
    />
  )
}

function NoteDuJour({ article, jour, compte }: { article: string; jour: string; compte: Compte | undefined }) {
  const compter = useCompter()
  return (
    <ChampTexte
      aria-label="Note du jour"
      placeholder="—"
      className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-pierre-300 focus:border-foret-600 focus:bg-white focus:outline-none"
      valeur={compte?.note ?? ''}
      enregistrer={(note) => compter.mutate({ article_id: article, jour, champs: { note: note || null } })}
    />
  )
}

// ------------------------------------------------------------------
// Téléphone : une ligne par article ; une touche ouvre la fiche (ou le compte)
// ------------------------------------------------------------------

function Cartes({
  d,
  groupes,
  par,
  jour,
  compterGroupe,
  ouvrir,
}: {
  d: Donnees
  groupes: Groupe[]
  par: Regroupement
  jour: string | null
  compterGroupe?: (g: Groupe) => void
  ouvrir: (a: Article) => void
}) {
  return (
    <div className="space-y-4">
      {groupes.map((g) => {
        const h = (a: Article) => d.historique(a.id)
        const comptesDuJour = jour ? g.articles.filter((a) => compteDuJour(h(a), jour)).length : 0
        return (
          <section key={g.id}>
            <div className="mb-1.5 flex items-end justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-pierre-800">
                  {g.titre} <span className="font-normal text-pierre-500">{jour ? `${comptesDuJour} / ${g.articles.length}` : g.articles.length}</span>
                </h2>
                {!jour && <p className="truncate text-xs text-pierre-500">{texteEtatGroupe(etatGroupe(g.articles, h))}</p>}
              </div>
              {compterGroupe && (
                <button className="shrink-0 rounded-lg border border-foret-600 px-2.5 py-1 text-xs font-medium text-foret-700" onClick={() => compterGroupe(g)}>
                  Compter
                </button>
              )}
            </div>
            <ul className={`${ui.carte} divide-y divide-pierre-100 overflow-hidden`}>
              {g.articles.map((a) => {
                const historique = h(a)
                const c = jour ? compteDuJour(historique, jour) : historique[0]
                const m = manque(a, c)
                const cie = a.entreprise_id ? d.compagnie.get(a.entreprise_id) : undefined
                const autre = par === 'section' ? (a.lieu_id ? d.lieu.get(a.lieu_id)?.nom : null) : a.section_id ? d.section.get(a.section_id)?.nom : null
                return (
                  <li key={a.id}>
                    <button className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-pierre-50" onClick={() => ouvrir(a)}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-pierre-900">
                          {a.nom}
                          {a.variante && <span className="font-normal text-pierre-500"> · {a.variante}</span>}
                        </p>
                        <p className="truncate text-xs text-pierre-500">{[autre, cie?.abreviation || cie?.nom].filter(Boolean).join(' · ') || '—'}</p>
                      </div>
                      {c ? (
                        <div className="shrink-0 text-right">
                          <p className="text-lg font-semibold tabular-nums leading-tight">{total(c)}</p>
                          <p className="text-xs">
                            {c.brise + c.incomplet > 0 ? (
                              <span className="text-red-700">
                                {[c.brise && `${c.brise} brisé${c.brise > 1 ? 's' : ''}`, c.incomplet && `${c.incomplet} incompl.`].filter(Boolean).join(' · ')}
                              </span>
                            ) : jour ? (
                              <span className="text-[#0a7d0a]">✓ compté</span>
                            ) : null}
                            {m > 0 && <span className="ml-1 font-medium text-red-700">−{m}</span>}
                          </p>
                          {!jour && <p className="text-[11px] text-pierre-400">{dateCourte(c.jour)}</p>}
                        </div>
                      ) : jour ? (
                        <span className="shrink-0 rounded-full border border-dashed border-pierre-300 px-2.5 py-1 text-xs text-pierre-500">À compter</span>
                      ) : (
                        <span className="shrink-0 text-xs text-pierre-400">jamais compté</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------------
// Articles retirés
// ------------------------------------------------------------------

function Retires({ d, articles, ecriture, ouvrir }: { d: Donnees; articles: Article[]; ecriture: boolean; ouvrir: (a: Article) => void }) {
  const maj = useMajArticle()
  return (
    <ul className={`${ui.carte} mt-2 divide-y divide-pierre-100`}>
      {articles.map((a) => (
        <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
          <button className="min-w-0 flex-1 truncate text-left text-pierre-500 hover:underline" onClick={() => ouvrir(a)}>
            {a.nom}
            {a.variante && ` · ${a.variante}`}
            {a.lieu_id && <span className="text-pierre-400"> — {d.lieu.get(a.lieu_id)?.nom}</span>}
          </button>
          {ecriture && (
            <button
              className={ui.boutonSecondaire}
              onClick={async (e) => {
                const ligne = e.currentTarget.closest('li')
                if (await confirmer({ titre: `Remettre « ${a.nom} » dans l'inventaire ?`, libelleOk: 'Remettre' }))
                  sortirCarte(ligne, () => maj.mutate({ id: a.id, champs: { actif: true } }))
              }}
            >
              Remettre
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
