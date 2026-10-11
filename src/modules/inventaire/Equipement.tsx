import { useState, type KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { IconePlus, IconeRenommer } from '@/lib/icones'
import { PuceCompagnie } from '@/lib/PuceCompagnie'
import { ui } from '@/lib/ui'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { Compter } from './Compter'
import { commencerComptage, majComptage, useCompter, useMajArticle, useRelire, type Donnees } from './donnees'
import { Fiche } from './Fiche'
import {
  AUCUN,
  FILTRES_VIDES,
  articlesVisibles,
  avancement,
  cleLigne,
  comptageParDefaut,
  comptagePrecedent,
  manque,
  nomNouveauComptage,
  regrouper,
  total,
  type Filtres,
  type Regroupement,
} from './outils'
import type { Article, ChampsLigne, Comptage, Ligne } from './types'

type Fenetre = { type: 'fiche'; id: string | null } | { type: 'compter'; id: string }

const CHAMPS = [
  { champ: 'bon', libelle: 'Bons', long: 'En bon état' },
  { champ: 'brise', libelle: 'Brisés', long: 'Brisés / à réparer' },
  { champ: 'incomplet', libelle: 'Incomplets', long: 'Incomplets' },
] as const

/** Onglet Équipement : la liste des articles et leurs nombres dans le comptage choisi. */
export function Equipement({ d, ecriture }: { d: Donnees; ecriture: boolean }) {
  const [params, setParams] = useSearchParams()
  const grandEcran = useMediaQuery('(min-width: 768px)')
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES)
  const [par, setPar] = useState<Regroupement>('categorie')
  const [fenetre, setFenetre] = useState<Fenetre | null>(null)
  const [voirRetires, setVoirRetires] = useState(false)

  const comptage = d.comptages.find((c) => c.id === params.get('comptage')) ?? comptageParDefaut(d.comptages)
  const precedent = comptagePrecedent(d.comptages, comptage)
  const enCours = comptage?.statut === 'en_cours'
  const modifiable = ecriture && enCours
  const ligneDe = (a: Article) => (comptage ? d.ligne.get(cleLigne(comptage.id, a.id)) : undefined)
  const ligneAvant = (a: Article) => (precedent ? d.ligne.get(cleLigne(precedent.id, a.id)) : undefined)

  const effectifs = { ...filtres, aCompter: filtres.aCompter && enCours }
  const visibles = articlesVisibles(d.articles, ligneDe, effectifs)
  const groupes = regrouper(visibles, par, par === 'categorie' ? d.categories : d.lieux)
  const ordre = groupes.flatMap((g) => g.articles)
  const retires = d.articles.filter((a) => !a.actif && !ligneDe(a))
  const filtresActifs = JSON.stringify(effectifs) !== JSON.stringify(FILTRES_VIDES)

  const choisirComptage = (id: string) => setParams(id === comptageParDefaut(d.comptages)?.id ? {} : { comptage: id }, { replace: true })
  const ouvrir = (a: Article) => setFenetre(modifiable && !grandEcran ? { type: 'compter', id: a.id } : { type: 'fiche', id: a.id })

  return (
    <div>
      <EnteteComptage d={d} comptage={comptage} ecriture={ecriture} choisir={choisirComptage} retourParDefaut={() => setParams({}, { replace: true })} />

      <BarreFiltres
        d={d}
        filtres={filtres}
        setFiltres={setFiltres}
        par={par}
        setPar={setPar}
        enCours={enCours}
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
          comptage={comptage}
          precedent={precedent}
          modifiable={modifiable}
          ligneDe={ligneDe}
          ligneAvant={ligneAvant}
          ouvrir={(a) => setFenetre({ type: 'fiche', id: a.id })}
        />
      ) : (
        <Cartes d={d} groupes={groupes} par={par} enCours={enCours} ligneDe={ligneDe} ouvrir={ouvrir} />
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
          defauts={{
            categorie_id: filtres.categorie && filtres.categorie !== AUCUN ? filtres.categorie : null,
            lieu_id: filtres.lieu && filtres.lieu !== AUCUN ? filtres.lieu : null,
            entreprise_id: filtres.compagnie && filtres.compagnie !== AUCUN ? filtres.compagnie : null,
          }}
          fermer={() => setFenetre(null)}
          compter={modifiable ? (id) => setFenetre({ type: 'compter', id }) : undefined}
        />
      )}
      {fenetre?.type === 'compter' && comptage && (
        <Compter
          key={fenetre.id}
          d={d}
          comptage={comptage}
          precedent={precedent}
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
// Comptage choisi : choix, avancement, commencer / terminer
// ------------------------------------------------------------------

function EnteteComptage({
  d,
  comptage,
  ecriture,
  choisir,
  retourParDefaut,
}: {
  d: Donnees
  comptage: Comptage | null
  ecriture: boolean
  choisir: (id: string) => void
  retourParDefaut: () => void
}) {
  const relire = useRelire()
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const aucunEnCours = !d.comptages.some((c) => c.statut === 'en_cours')
  const ligneDe = (a: Article) => (comptage ? d.ligne.get(cleLigne(comptage.id, a.id)) : undefined)
  const { comptes, total: nb } = avancement(d.articles, ligneDe)

  async function faire(f: () => Promise<unknown>) {
    setErreur(null)
    setEnCours(true)
    try {
      await f()
      await relire()
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  const commencer = () =>
    faire(async () => {
      await commencerComptage(nomNouveauComptage(d.comptages))
      retourParDefaut()
    })
  const terminer = async () => {
    if (!comptage) return
    const reste = nb - comptes
    const ok = await confirmer({
      titre: `Terminer le comptage ${comptage.nom} ?`,
      message: `${reste ? `${reste} article${reste > 1 ? 's' : ''} n'ont pas été comptés. ` : ''}Ses nombres ne pourront plus être modifiés (il peut être rouvert dans l'onglet Comptages).`,
      libelleOk: 'Terminer',
    })
    if (ok) faire(() => majComptage(comptage.id, { statut: 'termine', fin: new Date().toLocaleDateString('en-CA') }))
  }

  return (
    <div className={`${ui.carte} mb-3 flex flex-col gap-3 p-3 sm:flex-row sm:items-center`}>
      <div className="min-w-0 flex-1">
        {comptage ? (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="choix-comptage" className="text-sm text-pierre-500">
              Comptage
            </label>
            <select id="choix-comptage" className="rounded-lg border border-pierre-300 bg-white px-2.5 py-1.5 text-sm font-medium" value={comptage.id} onChange={(e) => choisir(e.target.value)}>
              {d.comptages.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                  {c.statut === 'en_cours' ? ' · en cours' : ''}
                </option>
              ))}
            </select>
            {comptage.statut === 'en_cours' ? (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">En cours</span>
            ) : (
              <span className="rounded-full bg-pierre-100 px-2 py-0.5 text-xs font-medium text-pierre-700">Terminé</span>
            )}
          </div>
        ) : (
          <p className="text-sm text-pierre-600">Aucun comptage pour l'instant.</p>
        )}
        {comptage && (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-pierre-100" aria-hidden>
              <div className="h-full rounded-full bg-foret-600" style={{ width: `${nb ? (comptes / nb) * 100 : 0}%` }} />
            </div>
            <span className="text-xs text-pierre-600">
              {comptes} sur {nb} articles comptés
            </span>
          </div>
        )}
        {comptage?.statut === 'termine' && ecriture && aucunEnCours && (
          <p className="mt-1 text-xs text-pierre-500">Comptage terminé : ses nombres ne se modifient plus.</p>
        )}
        {erreur && <p className="mt-1 text-xs text-red-700">{erreur}</p>}
      </div>
      {ecriture && (
        <div className="shrink-0">
          {comptage?.statut === 'en_cours' ? (
            <button className={ui.boutonSecondaire} onClick={terminer} disabled={enCours}>
              Terminer le comptage
            </button>
          ) : aucunEnCours ? (
            <button className={ui.bouton} onClick={commencer} disabled={enCours}>
              Commencer le comptage {nomNouveauComptage(d.comptages)}
            </button>
          ) : null}
        </div>
      )}
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
  enCours,
  ajouter,
}: {
  d: Donnees
  filtres: Filtres
  setFiltres: (f: Filtres) => void
  par: Regroupement
  setPar: (p: Regroupement) => void
  enCours: boolean
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
            <button className={ui.bouton} onClick={ajouter}>
              <IconePlus /> Article
            </button>
          </div>
        )}
      </div>
      <div className="sans-barre -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        <select aria-label="Lieu" className={choix} value={filtres.lieu} onChange={(e) => maj({ lieu: e.target.value })}>
          <option value="">Tous les lieux</option>
          {d.lieux.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nom}
            </option>
          ))}
          <option value={AUCUN}>Sans lieu</option>
        </select>
        <select aria-label="Catégorie" className={choix} value={filtres.categorie} onChange={(e) => maj({ categorie: e.target.value })}>
          <option value="">Toutes les catégories</option>
          {d.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
          <option value={AUCUN}>Sans catégorie</option>
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
        {enCours && (
          <button className={bascule(filtres.aCompter)} aria-pressed={filtres.aCompter} onClick={() => maj({ aCompter: !filtres.aCompter })}>
            À compter
          </button>
        )}
        <button className={bascule(filtres.manquants)} aria-pressed={filtres.manquants} onClick={() => maj({ manquants: !filtres.manquants })}>
          Il en manque
        </button>
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-pierre-300 text-sm" role="group" aria-label="Regrouper par">
          {(['categorie', 'lieu'] as const).map((p) => (
            <button
              key={p}
              className={`whitespace-nowrap px-2.5 py-2 ${par === p ? 'bg-pierre-800 text-white' : 'bg-white text-pierre-700 hover:bg-pierre-50'}`}
              aria-pressed={par === p}
              onClick={() => setPar(p)}
            >
              {p === 'categorie' ? 'Par catégorie' : 'Par lieu'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------
// Ordinateur : un tableau, une section par catégorie (ou par lieu)
// ------------------------------------------------------------------

function Tableau({
  d,
  groupes,
  par,
  comptage,
  precedent,
  modifiable,
  ligneDe,
  ligneAvant,
  ouvrir,
}: {
  d: Donnees
  groupes: ReturnType<typeof regrouper>
  par: Regroupement
  comptage: Comptage | null
  precedent: Comptage | null
  modifiable: boolean
  ligneDe: (a: Article) => Ligne | undefined
  ligneAvant: (a: Article) => Ligne | undefined
  ouvrir: (a: Article) => void
}) {
  let rang = 0
  const colonnes = 9 + (precedent ? 1 : 0)
  return (
    <div className={`${ui.carte} overflow-x-auto`}>
      <table className="w-full text-sm">
        <thead className="border-b border-pierre-200 bg-pierre-50 text-left text-pierre-500">
          <tr>
            <th className="min-w-52 px-3 py-2 font-medium">Article</th>
            <th className="px-3 py-2 font-medium">{par === 'categorie' ? 'Lieu' : 'Catégorie'}</th>
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
            {precedent && (
              <th className="px-2 py-2 text-right font-medium" title={`Total au comptage ${precedent.nom}`}>
                {precedent.nom}
              </th>
            )}
            <th className="min-w-44 px-3 py-2 font-medium">Note du comptage</th>
            <th />
          </tr>
        </thead>
        {groupes.map((g) => {
          const comptes = g.articles.filter((a) => ligneDe(a)).length
          return (
            <tbody key={g.id} className="divide-y divide-pierre-100 border-b border-pierre-200">
              <tr className="bg-pierre-50/60">
                <th colSpan={colonnes} className="px-3 pb-1.5 pt-3 text-left text-sm font-semibold text-pierre-800">
                  {g.titre}
                  <span className="ml-2 text-xs font-normal text-pierre-500">
                    {comptage?.statut === 'en_cours' ? `${comptes} / ${g.articles.length} comptés` : `${g.articles.length}`}
                  </span>
                </th>
              </tr>
              {g.articles.map((a) => {
                const l = ligneDe(a)
                const avant = ligneAvant(a)
                const m = manque(a, l)
                const cie = a.entreprise_id ? d.compagnie.get(a.entreprise_id) : undefined
                const autre = par === 'categorie' ? (a.lieu_id ? d.lieu.get(a.lieu_id)?.nom : null) : a.categorie_id ? d.categorie.get(a.categorie_id)?.nom : null
                const r = rang++
                return (
                  <tr key={a.id} className={`hover:bg-pierre-50 ${a.actif ? '' : 'text-pierre-400'}`}>
                    <td className="px-3 py-1.5">
                      <button className="text-left hover:underline" onClick={() => ouvrir(a)}>
                        <span className="font-medium text-pierre-900">{a.nom}</span>
                        {a.variante && <span className="text-pierre-500"> · {a.variante}</span>}
                        {!a.actif && <span className="ml-1 text-xs">(retiré)</span>}
                      </button>
                      {a.note && <p className="truncate text-xs text-pierre-500" title={a.note}>{a.note}</p>}
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
                    {CHAMPS.map((c) => (
                      <td key={c.champ} className="px-2 py-1 text-right">
                        {modifiable && comptage ? (
                          <CaseNombre comptage={comptage.id} article={a.id} champ={c.champ} valeur={l ? l[c.champ] : null} rang={r} libelle={`${c.long} : ${a.nom}`} />
                        ) : (
                          <span className={`tabular-nums ${c.champ !== 'bon' && l?.[c.champ] ? 'font-medium text-red-700' : ''}`}>{l ? l[c.champ] : <span className="text-pierre-400">—</span>}</span>
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-medium tabular-nums">{l ? total(l) : <span className="font-normal text-pierre-400">—</span>}</td>
                    {precedent && (
                      <td
                        className="px-2 py-1.5 text-right tabular-nums text-pierre-500"
                        title={avant ? `${precedent.nom} : ${avant.bon} bons, ${avant.brise} brisés, ${avant.incomplet} incomplets` : `Pas compté en ${precedent.nom}`}
                      >
                        {avant ? total(avant) : '—'}
                      </td>
                    )}
                    <td className="px-3 py-1">
                      {modifiable && comptage ? <NoteComptage comptage={comptage.id} article={a.id} ligne={l} /> : <span className="text-pierre-600">{l?.note}</span>}
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

/** Un nombre du tableau : enregistré en quittant la case ; Entrée descend à l'article suivant. */
function CaseNombre({
  comptage,
  article,
  champ,
  valeur,
  rang,
  libelle,
}: {
  comptage: string
  article: string
  champ: keyof Pick<Ligne, 'bon' | 'brise' | 'incomplet'>
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
    if (n !== valeur) compter.mutate({ comptage_id: comptage, article_id: article, champs: { [champ]: n } as ChampsLigne })
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

function NoteComptage({ comptage, article, ligne }: { comptage: string; article: string; ligne: Ligne | undefined }) {
  const compter = useCompter()
  return (
    <ChampTexte
      aria-label="Note du comptage"
      placeholder="—"
      className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-pierre-300 focus:border-foret-600 focus:bg-white focus:outline-none"
      valeur={ligne?.note ?? ''}
      enregistrer={(note) => compter.mutate({ comptage_id: comptage, article_id: article, champs: { note: note || null } })}
    />
  )
}

// ------------------------------------------------------------------
// Téléphone : une ligne par article ; une touche ouvre le compte
// ------------------------------------------------------------------

function Cartes({
  d,
  groupes,
  par,
  enCours,
  ligneDe,
  ouvrir,
}: {
  d: Donnees
  groupes: ReturnType<typeof regrouper>
  par: Regroupement
  enCours: boolean
  ligneDe: (a: Article) => Ligne | undefined
  ouvrir: (a: Article) => void
}) {
  return (
    <div className="space-y-4">
      {groupes.map((g) => {
        const comptes = g.articles.filter((a) => ligneDe(a)).length
        return (
          <section key={g.id}>
            <h2 className="mb-1.5 flex items-baseline gap-2 text-sm font-semibold text-pierre-800">
              {g.titre}
              <span className="text-xs font-normal text-pierre-500">{enCours ? `${comptes} / ${g.articles.length}` : g.articles.length}</span>
            </h2>
            <ul className={`${ui.carte} divide-y divide-pierre-100 overflow-hidden`}>
              {g.articles.map((a) => {
                const l = ligneDe(a)
                const m = manque(a, l)
                const cie = a.entreprise_id ? d.compagnie.get(a.entreprise_id) : undefined
                const autre = par === 'categorie' ? (a.lieu_id ? d.lieu.get(a.lieu_id)?.nom : null) : a.categorie_id ? d.categorie.get(a.categorie_id)?.nom : null
                return (
                  <li key={a.id}>
                    <button className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-pierre-50" onClick={() => ouvrir(a)}>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate font-medium ${a.actif ? 'text-pierre-900' : 'text-pierre-400'}`}>
                          {a.nom}
                          {a.variante && <span className="font-normal text-pierre-500"> · {a.variante}</span>}
                        </p>
                        <p className="truncate text-xs text-pierre-500">
                          {[autre, cie?.abreviation || cie?.nom].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </div>
                      {l ? (
                        <div className="shrink-0 text-right">
                          <p className="text-lg font-semibold tabular-nums leading-tight">{total(l)}</p>
                          <p className="text-xs">
                            {l.brise + l.incomplet > 0 ? (
                              <span className="text-red-700">
                                {[l.brise && `${l.brise} brisé${l.brise > 1 ? 's' : ''}`, l.incomplet && `${l.incomplet} incompl.`].filter(Boolean).join(' · ')}
                              </span>
                            ) : (
                              <span className="text-[#0a7d0a]">✓ bon état</span>
                            )}
                            {m > 0 && <span className="ml-1 font-medium text-red-700">−{m}</span>}
                          </p>
                        </div>
                      ) : enCours ? (
                        <span className="shrink-0 rounded-full border border-dashed border-pierre-300 px-2.5 py-1 text-xs text-pierre-500">À compter</span>
                      ) : (
                        <span className="shrink-0 text-pierre-400">—</span>
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
// Articles retirés (jamais comptés dans le comptage affiché)
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
              onClick={async () => {
                if (await confirmer({ titre: `Remettre « ${a.nom} » dans l'inventaire ?`, libelleOk: 'Remettre' })) maj.mutate({ id: a.id, champs: { actif: true } })
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
