import { useMemo, useRef, useState } from 'react'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import type { Semaine } from './contexte'
import {
  useAjouterAnimateurs,
  useChargerEtat,
  useCreerHoraire,
  useDossiers,
  useEnregistrerDossier,
  useModifierHoraire,
  useReglages,
  useSupprimerDossier,
  useSupprimerHoraire,
  type ResumeHoraire,
} from './donnees'
import { exporterClasseur, importerClasseur } from './excel'
import { decalagePour, decalerJours, horaireVide, joursConsecutifs, lireJours, resumeJours } from './logique'
import { Reglages } from './Reglages'
import { JOURS_SEMAINE, type Dossier, type EtatSemaine } from './types'

// ------------------------------------------------------------------
// Emplacements : une semaine est dans un dossier ou « sans dossier » ;
// les modèles sont à part. Un nom est unique dans son emplacement.
// ------------------------------------------------------------------

const dossierDe = (h: ResumeHoraire) => (h.modele ? null : (h.dossier_id ?? null))
const nomsDans = (liste: ResumeHoraire[], modele: boolean, dossier: string | null) =>
  liste.filter((h) => !!h.modele === modele && (modele || dossierDe(h) === dossier)).map((h) => h.nom)

/** Premier « Semaine N » libre, comme l'ancien créateur. */
function nomSemaineLibre(pris: string[]) {
  let n = 1
  while (pris.includes(`Semaine ${n}`)) n++
  return `Semaine ${n}`
}

function nomLibre(base: string, pris: string[]) {
  if (!pris.includes(base)) return base
  let i = 2
  while (pris.includes(`${base} ${i}`)) i++
  return `${base} ${i}`
}

type Fenetre =
  | { type: 'nouvelle'; modele: boolean; depart?: string }
  | { type: 'organiser' }
  | { type: 'reglages' }

// ------------------------------------------------------------------
// Barre de la semaine : choix, nouvelle, dupliquer, renommer, Excel
// ------------------------------------------------------------------

export function BarreSemaine({
  liste: listeBrute,
  active,
  choisir,
  semaine,
  ecriture,
}: {
  liste: ResumeHoraire[]
  active: string | null
  choisir: (id: string) => void
  semaine: Semaine | null
  ecriture: boolean
}) {
  const { dossiers, connus } = useDossiers()
  // Semaine d'un dossier supprimé ailleurs (liste pas encore rechargée) :
  // elle est « Sans dossier », comme dans la base.
  const liste = useMemo(
    () => (connus ? listeBrute.map((h) => (h.dossier_id && !connus.has(h.dossier_id) ? { ...h, dossier_id: null } : h)) : listeBrute),
    [listeBrute, connus],
  )
  const creer = useCreerHoraire()
  const modifier = useModifierHoraire()
  const ajouterAnimateurs = useAjouterAnimateurs()
  const fichier = useRef<HTMLInputElement>(null)
  const [fenetre, setFenetre] = useState<Fenetre | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const actif = liste.find((h) => h.id === active)
  const estModele = !!actif?.modele
  const dossierActif = actif ? dossierDe(actif) : null
  const nomDossier = dossiers.find((d) => d.id === dossierActif)?.nom

  /** Crée une copie au même endroit que l'horaire ouvert (dossier ou modèles) et l'ouvre. */
  async function creerIci(nom: string, etat: EtatSemaine) {
    choisir(await creer.mutateAsync({ nom, etat, modele: estModele, dossier_id: dossierActif }))
  }

  async function importer(f: File) {
    try {
      const { etat, nom, nouveauxAnimateurs } = await importerClasseur(f)
      // Les animateurs du classeur absents du référentiel y sont ajoutés.
      if (nouveauxAnimateurs.length) await ajouterAnimateurs.mutateAsync(nouveauxAnimateurs).catch(() => undefined)
      // Une semaine importée va dans le dossier ouvert (jamais parmi les modèles).
      const base = nom ?? `Import ${new Date().toLocaleDateString('fr-CA')}`
      const id = await creer.mutateAsync({ nom: nomLibre(base, nomsDans(liste, false, dossierActif)), etat, modele: false, dossier_id: dossierActif })
      choisir(id)
      setMessage(null)
    } catch (e) {
      setMessage(`Erreur de lecture : ${messageErreur(e)}`)
    }
  }

  const statut = semaine?.statut
  return (
    <div className="mb-3 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-2xl font-semibold">Horaire</h1>
        {actif && (estModele || nomDossier) && (
          <span className="text-sm text-pierre-500">{estModele ? '📐 Modèle' : `📁 ${nomDossier}`}</span>
        )}
        {liste.length > 0 && <ChoixSemaine liste={liste} dossiers={dossiers} active={active} choisir={choisir} />}
        {ecriture && (
          <>
            <button className={ui.boutonSecondaire} onClick={() => setFenetre({ type: 'nouvelle', modele: false })}>
              + Nouvelle
            </button>
            {semaine && (
              <>
                <button
                  className={ui.boutonSecondaire}
                  onClick={() =>
                    creerIci(
                      nomLibre(`${semaine.horaire.nom} (copie)`, nomsDans(liste, estModele, dossierActif)),
                      structuredClone(semaine.etat),
                    ).catch((e) => setMessage(messageErreur(e)))
                  }
                >
                  Dupliquer
                </button>
                <button
                  className={ui.boutonSecondaire}
                  onClick={() => {
                    const nom = prompt(`Nouveau nom pour ${estModele ? 'ce modèle' : 'cette semaine'} :`, semaine.horaire.nom)?.trim()
                    if (!nom || nom === semaine.horaire.nom) return
                    if (nomsDans(liste, estModele, dossierActif).includes(nom)) {
                      return setMessage(estModele ? 'Un modèle porte déjà ce nom.' : 'Une semaine de ce dossier porte déjà ce nom.')
                    }
                    modifier.mutate({ id: semaine.horaire.id, nom }, { onError: (e) => setMessage(messageErreur(e)) })
                  }}
                >
                  Renommer
                </button>
              </>
            )}
            <button className={ui.boutonSecondaire} onClick={() => fichier.current?.click()}>
              Importer Excel
            </button>
            <input
              ref={fichier}
              type="file"
              accept=".xlsx,.xls"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void importer(f)
                e.target.value = ''
              }}
            />
          </>
        )}
        {semaine && (
          <button className={ui.boutonSecondaire} onClick={() => void exporterClasseur(semaine.horaire.nom, semaine.etat, semaine.reglages)}>
            Exporter Excel
          </button>
        )}
        <button className={ui.boutonSecondaire} onClick={() => setFenetre({ type: 'organiser' })}>
          Dossiers et modèles
        </button>
        {ecriture && (
          <button className={ui.boutonSecondaire} onClick={() => setFenetre({ type: 'reglages' })}>
            Réglages
          </button>
        )}
        {semaine && ecriture && (
          <span className="ml-auto text-xs text-pierre-500" role="status">
            {statut === 'en-attente' && 'Enregistrement…'}
            {statut === 'enregistre' && '✓ Enregistré'}
            {statut === 'erreur' && (
              <span className="text-red-700">
                Échec de l'enregistrement —{' '}
                <button className="underline" onClick={semaine.reessayer}>
                  réessayer
                </button>
              </span>
            )}
          </span>
        )}
      </div>
      {estModele && semaine && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-950">
          <span className="min-w-60 flex-1">
            📐 <b>Modèle</b> ({resumeJours(semaine.etat.jours)}). Une semaine créée à partir de ce modèle en reprend les jours,
            les périodes, les groupes, les activités et les soirées.
          </span>
          {ecriture && (
            <button className={ui.bouton} onClick={() => setFenetre({ type: 'nouvelle', modele: false, depart: semaine.horaire.id })}>
              Créer une semaine à partir de ce modèle
            </button>
          )}
        </div>
      )}
      {message && (
        <p className={`${ui.erreur} mt-2 flex justify-between gap-3`}>
          {message}
          <button className="underline" onClick={() => setMessage(null)}>
            Fermer
          </button>
        </p>
      )}
      {fenetre?.type === 'reglages' && <Reglages fermer={() => setFenetre(null)} />}
      {fenetre?.type === 'nouvelle' && (
        <NouvelHoraire
          key={`${fenetre.modele}|${fenetre.depart ?? ''}`}
          liste={liste}
          dossiers={dossiers}
          modele={fenetre.modele}
          departInitial={fenetre.depart ?? ''}
          dossierInitial={dossierActif}
          semaine={semaine}
          choisir={choisir}
          fermer={() => setFenetre(null)}
        />
      )}
      {fenetre?.type === 'organiser' && (
        <Organiser
          liste={liste}
          dossiers={dossiers}
          active={active}
          ecriture={ecriture}
          choisir={choisir}
          nouveau={(modele, depart) => setFenetre({ type: 'nouvelle', modele, depart })}
          fermer={() => setFenetre(null)}
        />
      )}
    </div>
  )
}

/** Menu des semaines, groupées par dossier, puis les modèles. */
function ChoixSemaine({
  liste,
  dossiers,
  active,
  choisir,
}: {
  liste: ResumeHoraire[]
  dossiers: Dossier[]
  active: string | null
  choisir: (id: string) => void
}) {
  const groupes = grouper(liste, dossiers)
  const nonVides = groupes.filter((g) => g.horaires.length)
  const options = (l: ResumeHoraire[]) =>
    l.map((h) => (
      <option key={h.id} value={h.id}>
        {h.nom}
      </option>
    ))
  return (
    <select
      aria-label="Semaine ouverte"
      className="max-w-72 rounded-lg border border-pierre-300 bg-white px-3 py-2 text-sm font-medium"
      value={active ?? ''}
      onChange={(e) => choisir(e.target.value)}
    >
      {nonVides.length === 1 && !nonVides[0].modeles
        ? options(nonVides[0].horaires)
        : nonVides.map((g) => (
            <optgroup key={g.cle} label={g.titre}>
              {options(g.horaires)}
            </optgroup>
          ))}
    </select>
  )
}

/** Dossiers (par nom), puis « Sans dossier », puis les modèles. */
function grouper(liste: ResumeHoraire[], dossiers: Dossier[]) {
  const connus = new Set(dossiers.map((d) => d.id))
  const semaines = liste.filter((h) => !h.modele)
  return [
    ...dossiers.map((d) => ({ cle: d.id, titre: `📁 ${d.nom}`, dossier: d as Dossier | null, modeles: false, horaires: semaines.filter((h) => h.dossier_id === d.id) })),
    {
      cle: 'sans-dossier',
      titre: dossiers.length ? 'Sans dossier' : 'Semaines',
      dossier: null,
      modeles: false,
      horaires: semaines.filter((h) => !h.dossier_id || !connus.has(h.dossier_id)),
    },
    { cle: 'modeles', titre: '📐 Modèles', dossier: null, modeles: true, horaires: liste.filter((h) => h.modele) },
  ]
}

// ------------------------------------------------------------------
// Nouvelle semaine (vide ou à partir d'un modèle) / nouveau modèle
// ------------------------------------------------------------------

function NouvelHoraire({
  liste,
  dossiers,
  modele,
  departInitial,
  dossierInitial,
  semaine,
  choisir,
  fermer,
}: {
  liste: ResumeHoraire[]
  dossiers: Dossier[]
  /** Vrai : on crée un modèle (jamais rangé dans un dossier). */
  modele: boolean
  departInitial: string
  dossierInitial: string | null
  semaine: Semaine | null
  choisir: (id: string) => void
  fermer: () => void
}) {
  const reglages = useReglages()
  const creer = useCreerHoraire()
  const charger = useChargerEtat()
  const creerDossier = useEnregistrerDossier()
  const modeles = liste.filter((h) => h.modele)
  const semaines = liste.filter((h) => !h.modele)

  const nomParDefaut = (dossier: string) =>
    modele ? nomLibre('Nouveau modèle', nomsDans(liste, true, null)) : nomSemaineLibre(nomsDans(liste, false, dossier || null))
  const [dossier, setDossier] = useState(dossierInitial ?? '')
  const [nom, setNom] = useState(() => nomParDefaut(dossierInitial ?? ''))
  const [nomTouche, setNomTouche] = useState(false)
  const [depart, setDepart] = useState(liste.some((h) => h.id === departInitial) ? departInitial : '')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  // Jours de l'horaire de départ (l'ouvert : sa copie locale, la plus à jour).
  const source = liste.find((h) => h.id === depart)
  const joursSource = source ? (source.id === semaine?.horaire.id ? semaine.etat.jours : (source.jours ?? [])) : null
  const suite = joursSource ? lireJours(joursSource) : null
  const [premier, setPremier] = useState(joursSource?.[0] ?? 'Lundi')
  const [nombre, setNombre] = useState(6)
  const jours = !joursSource ? joursConsecutifs(premier, nombre) : suite ? joursConsecutifs(premier, suite.nombre) : joursSource

  const propre = nom.trim()
  const dossierCible = modele ? null : dossier || null
  const pris = nomsDans(liste, modele, dossierCible).includes(propre)
  const probleme = !propre
    ? 'Donnez un nom.'
    : pris
      ? `« ${propre} » existe déjà ${modele ? 'parmi les modèles' : dossierCible ? 'dans ce dossier' : 'hors dossier'}.`
      : null

  function changerDepart(id: string) {
    setDepart(id)
    const h = liste.find((x) => x.id === id)
    const j = h ? (h.id === semaine?.horaire.id ? semaine.etat.jours : (h.jours ?? [])) : null
    if (j?.[0]) setPremier(j[0])
  }

  async function changerDossier(valeur: string) {
    let cible = valeur
    if (valeur === '__nouveau__') {
      const n = prompt('Nom du nouveau dossier (ex. Été 2027, Automne 2026) :')?.trim()
      if (!n) return
      try {
        cible = dossiers.find((d) => d.nom === n)?.id ?? (await creerDossier.mutateAsync({ nom: n }))
      } catch (e) {
        return setErreur(messageErreur(e))
      }
    }
    setDossier(cible)
    if (!nomTouche) setNom(nomParDefaut(cible))
  }

  async function creerHoraire() {
    if (probleme || enCours) return
    setEnCours(true)
    setErreur(null)
    try {
      let etat: EtatSemaine
      if (!source) etat = horaireVide(jours, reglages.nuits)
      else {
        const base = source.id === semaine?.horaire.id ? structuredClone(semaine.etat) : await charger(source.id)
        // Jours changés depuis l'ouverture de la fenêtre (autre personne) : la
        // liste vient d'être mise à jour, on laisse vérifier l'aperçu.
        if (joursSource && base.jours.join('|') !== joursSource.join('|')) {
          setErreur(`« ${source.nom} » a changé (${resumeJours(base.jours)}) : vérifiez l'aperçu, puis cliquez Créer.`)
          setPremier(base.jours[0] ?? premier)
          setEnCours(false)
          return
        }
        etat = decalerJours(base, suite ? decalagePour(base.jours, premier) : 0, reglages.nuits)
      }
      choisir(await creer.mutateAsync({ nom: propre, etat, modele, dossier_id: dossierCible }))
      fermer()
    } catch (e) {
      setErreur(messageErreur(e))
      setEnCours(false)
    }
  }

  const titreSource = (h: ResumeHoraire) => {
    const d = dossiers.find((x) => x.id === h.dossier_id)?.nom
    return `${d ? `${d} / ` : ''}${h.nom}`
  }

  return (
    <Dialogue titre={modele ? 'Nouveau modèle' : 'Nouvelle semaine ou séjour'} fermer={fermer}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void creerHoraire()
        }}
      >
        {modele && (
          <p className="text-sm text-pierre-500">
            Un modèle sert de point de départ : séjour d'école de 2, 3 ou 4 jours, semaine d'été de 7 jours… Il se modifie comme
            une semaine (groupes, périodes, activités).
          </p>
        )}
        <label className="block">
          <span className={ui.etiquette}>Nom</span>
          <input
            autoFocus
            className={ui.champ}
            value={nom}
            placeholder={modele ? 'ex. École 3 jours' : 'ex. Semaine 1, École Saint-Jean'}
            onChange={(e) => {
              setNom(e.target.value)
              setNomTouche(true)
            }}
          />
          {pris && <span className="mt-1 block text-xs text-red-700">{probleme}</span>}
        </label>

        {!modele && (
          <label className="block">
            <span className={ui.etiquette}>Dossier</span>
            <select className={ui.champ} value={dossier} onChange={(e) => void changerDossier(e.target.value)}>
              <option value="">Sans dossier</option>
              {dossiers.map((d) => (
                <option key={d.id} value={d.id}>
                  📁 {d.nom}
                </option>
              ))}
              <option value="__nouveau__">＋ Nouveau dossier…</option>
            </select>
          </label>
        )}

        <label className="block">
          <span className={ui.etiquette}>Point de départ</span>
          <select className={ui.champ} value={depart} onChange={(e) => changerDepart(e.target.value)}>
            <option value="">Horaire vide</option>
            {modeles.length > 0 && (
              <optgroup label="Modèles">
                {modeles.map((h) => (
                  <option key={h.id} value={h.id}>
                    📐 {h.nom}
                    {h.jours ? ` — ${resumeJours(h.jours)}` : ''}
                  </option>
                ))}
              </optgroup>
            )}
            {modele && semaines.length > 0 && (
              <optgroup label="Copier une semaine">
                {semaines.map((h) => (
                  <option key={h.id} value={h.id}>
                    {titreSource(h)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {!modele && modeles.length === 0 && (
            <span className="mt-1 block text-xs text-pierre-500">
              Pas encore de modèle : créez-en dans « Dossiers et modèles » (ex. séjours d'école de 2, 3 ou 4 jours).
            </span>
          )}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={ui.etiquette}>Premier jour</span>
            <select className={ui.champ} value={premier} disabled={!!joursSource && !suite} onChange={(e) => setPremier(e.target.value)}>
              {JOURS_SEMAINE.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={ui.etiquette}>Nombre de jours</span>
            {joursSource ? (
              <input className={ui.champ} disabled value={joursSource.length} />
            ) : (
              <select className={ui.champ} value={nombre} onChange={(e) => setNombre(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>
        <p className="text-sm text-pierre-700">
          → {resumeJours(jours)}
          {source && suite && premier !== joursSource?.[0] && (
            <span className="block text-xs text-pierre-500">
              Tout le contenu de « {source.nom} » est décalé pour commencer le {premier}.
            </span>
          )}
          {!source && <span className="block text-xs text-pierre-500">Jours, périodes et soirées modifiables ensuite (« Jours et périodes ») ; groupes dans la grille.</span>}
        </p>

        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex justify-end gap-2 border-t border-pierre-100 pt-4">
          <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button type="submit" className={ui.bouton} disabled={!!probleme || enCours}>
            {enCours ? 'Création…' : 'Créer'}
          </button>
        </div>
      </form>
    </Dialogue>
  )
}

// ------------------------------------------------------------------
// Dossiers et modèles : ranger, ouvrir, supprimer
// ------------------------------------------------------------------

function Organiser({
  liste,
  dossiers,
  active,
  ecriture,
  choisir,
  nouveau,
  fermer,
}: {
  liste: ResumeHoraire[]
  dossiers: Dossier[]
  active: string | null
  ecriture: boolean
  choisir: (id: string) => void
  /** Ouvre la fenêtre de création (semaine ou modèle), avec un point de départ. */
  nouveau: (modele: boolean, depart?: string) => void
  fermer: () => void
}) {
  const modifier = useModifierHoraire()
  const supprimer = useSupprimerHoraire()
  const enregistrerDossier = useEnregistrerDossier()
  const supprimerDossier = useSupprimerDossier()
  const [message, setMessage] = useState<string | null>(null)
  const surErreur = { onError: (e: unknown) => setMessage(messageErreur(e)) }
  const groupes = grouper(liste, dossiers)
  const sansDossier = groupes.find((g) => g.cle === 'sans-dossier')!
  const modeles = groupes.find((g) => g.modeles)!

  function nomDossier(actuel?: Dossier) {
    const nom = prompt('Nom du dossier (ex. Été 2027, Automne 2026) :', actuel?.nom ?? '')?.trim()
    if (!nom || nom === actuel?.nom) return
    if (dossiers.some((d) => d.nom === nom)) return setMessage(`Le dossier « ${nom} » existe déjà.`)
    enregistrerDossier.mutate({ id: actuel?.id, nom }, surErreur)
  }

  function retirerDossier(d: Dossier, contenu: ResumeHoraire[]) {
    const doublons = contenu.filter((h) => sansDossier.horaires.some((x) => x.nom === h.nom)).map((h) => `« ${h.nom} »`)
    if (doublons.length) {
      return setMessage(`« Sans dossier » contient déjà ${doublons.join(', ')} : renommez ou déplacez ces semaines avant de supprimer le dossier.`)
    }
    const texte = contenu.length
      ? `Supprimer le dossier « ${d.nom} » ? Ses ${contenu.length} semaine(s) ne sont pas supprimées : elles passent dans « Sans dossier ».`
      : `Supprimer le dossier « ${d.nom} » ?`
    if (confirm(texte)) supprimerDossier.mutate(d.id, surErreur)
  }

  function deplacer(h: ResumeHoraire, cible: string | null) {
    if (nomsDans(liste, false, cible).includes(h.nom)) {
      return setMessage(`Ce dossier contient déjà une semaine « ${h.nom} » : renommez-la d'abord.`)
    }
    modifier.mutate({ id: h.id, dossier_id: cible }, surErreur)
  }

  const retirer = (h: ResumeHoraire) =>
    confirm(`Supprimer ${h.modele ? 'le modèle' : 'la semaine'} « ${h.nom} » ? Cette action est définitive.`) && supprimer.mutate(h.id, surErreur)

  const ouvrir = (h: ResumeHoraire) =>
    h.id === active ? (
      <span className="rounded-full bg-foret-100 px-2 py-0.5 text-xs text-foret-800">ouvert</span>
    ) : (
      <button
        className="text-foret-700 hover:underline"
        onClick={() => {
          choisir(h.id)
          fermer()
        }}
      >
        Ouvrir
      </button>
    )

  const petit = 'rounded border border-pierre-300 bg-white px-1.5 py-1 text-xs'
  return (
    <Dialogue titre="Dossiers et modèles" fermer={fermer} large>
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-pierre-500">
          Rangez les semaines par saison dans des dossiers. Les modèles servent de point de départ aux nouvelles semaines (séjours
          d'école de 2, 3 ou 4 jours, semaine d'été…).
        </p>
        {ecriture && (
          <button className={ui.boutonSecondaire} onClick={() => nomDossier()}>
            + Nouveau dossier
          </button>
        )}
      </div>
      {message && (
        <p className={`${ui.erreur} mt-3 flex justify-between gap-3`}>
          {message}
          <button className="underline" onClick={() => setMessage(null)}>
            Fermer
          </button>
        </p>
      )}

      <div className="mt-4 space-y-4">
        {groupes
          .filter((g) => !g.modeles && (g.dossier || g.horaires.length || !dossiers.length))
          .map((g) => (
            <section key={g.cle} className="rounded-lg border border-pierre-200">
              <header className="flex flex-wrap items-center gap-2 border-b border-pierre-100 bg-pierre-50 px-3 py-2">
                <h3 className="flex-1 text-sm font-semibold">
                  {g.titre} <span className="font-normal text-pierre-500">({g.horaires.length})</span>
                </h3>
                {g.dossier && ecriture && (
                  <>
                    <button className="text-sm text-foret-700 hover:underline" onClick={() => nomDossier(g.dossier!)}>
                      Renommer
                    </button>
                    <button className={ui.boutonDanger} onClick={() => retirerDossier(g.dossier!, g.horaires)}>
                      Supprimer
                    </button>
                  </>
                )}
              </header>
              {g.horaires.length === 0 ? (
                <p className="px-3 py-2 text-sm text-pierre-500">
                  Dossier vide. {ecriture && 'Rangez-y des semaines avec le menu « Dossier » de chaque semaine.'}
                </p>
              ) : (
                <ul className="divide-y divide-pierre-100">
                  {g.horaires.map((h) => (
                    <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-sm">
                      <span className="min-w-40 flex-1 font-medium">{h.nom}</span>
                      <span className="text-xs text-pierre-500">{h.jours ? resumeJours(h.jours) : ''}</span>
                      {ouvrir(h)}
                      {ecriture && (
                        <>
                          <select
                            aria-label={`Dossier de ${h.nom}`}
                            className={petit}
                            value={dossierDe(h) ?? ''}
                            onChange={(e) => deplacer(h, e.target.value || null)}
                          >
                            <option value="">Sans dossier</option>
                            {dossiers.map((d) => (
                              <option key={d.id} value={d.id}>
                                📁 {d.nom}
                              </option>
                            ))}
                          </select>
                          <button
                            className="text-foret-700 hover:underline"
                            title="Créer un modèle à partir de cette semaine"
                            onClick={() => nouveau(true, h.id)}
                          >
                            → Modèle
                          </button>
                          <button className={ui.boutonDanger} onClick={() => retirer(h)}>
                            Supprimer
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

        <section className="rounded-lg border border-sky-200">
          <header className="flex flex-wrap items-center gap-2 border-b border-sky-100 bg-sky-50 px-3 py-2">
            <h3 className="flex-1 text-sm font-semibold">
              {modeles.titre} <span className="font-normal text-pierre-500">({modeles.horaires.length})</span>
            </h3>
            {ecriture && (
              <button className={ui.boutonSecondaire} onClick={() => nouveau(true)}>
                + Nouveau modèle
              </button>
            )}
          </header>
          {modeles.horaires.length === 0 ? (
            <p className="px-3 py-2 text-sm text-pierre-500">
              Aucun modèle. Créez-en un vide (choisissez le nombre de jours) ou à partir d'une semaine (→ Modèle).
            </p>
          ) : (
            <ul className="divide-y divide-pierre-100">
              {modeles.horaires.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-sm">
                  <span className="min-w-40 flex-1 font-medium">📐 {h.nom}</span>
                  <span className="text-xs text-pierre-500">{h.jours ? resumeJours(h.jours) : ''}</span>
                  {ouvrir(h)}
                  {ecriture && (
                    <>
                      <button className="text-foret-700 hover:underline" onClick={() => nouveau(false, h.id)}>
                        Nouvelle semaine
                      </button>
                      <button className={ui.boutonDanger} onClick={() => retirer(h)}>
                        Supprimer
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-4 text-right">
        <button className={ui.boutonSecondaire} onClick={fermer}>
          Fermer
        </button>
      </div>
    </Dialogue>
  )
}
