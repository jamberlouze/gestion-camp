import { useRef, useState } from 'react'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { IconeChevron, IconeDossier, IconeDupliquer, IconeExporter, IconeImporter, IconeModele, IconePlus, IconeRenommer, IconeTableur } from '@/lib/icones'
import { Bulle, SaisieNom } from '@/lib/SaisieNom'
import { ui } from '@/lib/ui'
import type { Semaine } from './contexte'
import { useAjouterAnimateurs, useChargerEtat, useCreerHoraire, useEnregistrerDossier, useModifierHoraire, useReglages, type ResumeHoraire } from './donnees'
import { exporterClasseur, importerClasseur } from './excel'
import { decalagePour, decalerJours, horaireVide, joursConsecutifs, lireJours, resumeJours } from './logique'
import { dossierDe, grouper, nomLibre, nomSemaineLibre, nomsDans, type DemandeNouvel } from './emplacements'
import { JOURS_SEMAINE, type Dossier, type EtatSemaine } from './types'

// ------------------------------------------------------------------
// Barre de la semaine ouverte :
//  - à gauche, la semaine et ce qu'on en fait (nouvelle, dupliquer, renommer) ;
//  - à droite, à part, les échanges avec Excel.
// ------------------------------------------------------------------

export function BarreSemaine({
  liste,
  dossiers,
  active,
  choisir,
  semaine,
  ecriture,
  nouveau,
}: {
  liste: ResumeHoraire[]
  dossiers: Dossier[]
  active: string | null
  choisir: (id: string) => void
  semaine: Semaine | null
  ecriture: boolean
  nouveau: (d: DemandeNouvel) => void
}) {
  const creer = useCreerHoraire()
  const modifier = useModifierHoraire()
  const ajouterAnimateurs = useAjouterAnimateurs()
  const fichier = useRef<HTMLInputElement>(null)
  const boutonRenommer = useRef<HTMLButtonElement>(null)
  const [renommage, setRenommage] = useState(false)
  /** Ferme la bulle de renommage et rend le focus au bouton (clavier). */
  const finirRenommage = () => {
    setRenommage(false)
    boutonRenommer.current?.focus()
  }
  const [message, setMessage] = useState<string | null>(null)

  const actif = liste.find((h) => h.id === active)
  const estModele = !!actif?.modele
  const dossierActif = actif ? dossierDe(actif) : null
  const nomDossier = dossiers.find((d) => d.id === dossierActif)?.nom

  async function dupliquer() {
    if (!semaine) return
    try {
      const nom = nomLibre(`${semaine.horaire.nom} (copie)`, nomsDans(liste, estModele, dossierActif))
      choisir(await creer.mutateAsync({ nom, etat: structuredClone(semaine.etat), modele: estModele, dossier_id: dossierActif }))
    } catch (e) {
      setMessage(messageErreur(e))
    }
  }

  async function renommer(nom: string) {
    if (!semaine) return null
    if (nomsDans(liste, estModele, dossierActif).includes(nom)) {
      return estModele ? 'Un modèle porte déjà ce nom.' : 'Une semaine de ce dossier porte déjà ce nom.'
    }
    try {
      await modifier.mutateAsync({ id: semaine.horaire.id, nom })
      finirRenommage()
      return null
    } catch (e) {
      return messageErreur(e)
    }
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
  const boutonExcel =
    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-pierre-700 hover:bg-white hover:text-pierre-900 hover:shadow-sm'
  return (
    <div className="mb-3 print:hidden">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {/* La semaine ouverte */}
        {actif && (estModele || nomDossier) && (
          <span className="inline-flex items-center gap-1 text-sm text-pierre-500">
            {estModele ? <IconeModele /> : <IconeDossier />}
            {estModele ? 'Modèles' : nomDossier}
            <IconeChevron className="size-3.5 text-pierre-300" />
          </span>
        )}
        {liste.length > 0 && <ChoixSemaine liste={liste} dossiers={dossiers} active={active} choisir={choisir} />}
        {ecriture && (
          <button className={ui.boutonSecondaire} onClick={() => nouveau({ modele: false, dossier: dossierActif })}>
            <IconePlus /> Nouvelle
          </button>
        )}
        {ecriture && semaine && (
          <>
            <button className={ui.boutonSecondaire} onClick={() => void dupliquer()}>
              <IconeDupliquer /> Dupliquer
            </button>
            <div className="relative">
              <button
                ref={boutonRenommer}
                className={ui.boutonSecondaire}
                aria-expanded={renommage}
                onClick={() => setRenommage((r) => !r)}
              >
                <IconeRenommer /> Renommer
              </button>
              {renommage && (
                <Bulle ancre={boutonRenommer} fermer={() => setRenommage(false)}>
                  <p className="mb-2 text-sm font-medium">Renommer {estModele ? 'le modèle' : 'la semaine'}</p>
                  <SaisieNom
                    compact
                    valeurInitiale={semaine.horaire.nom}
                    libelleOk="Renommer"
                    valider={renommer}
                    annuler={finirRenommage}
                  />
                </Bulle>
              )}
            </div>
          </>
        )}
        {semaine && ecriture && (
          <span className="ml-1 text-xs text-pierre-500" role="status">
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

        {/* Excel : autre chose, à part et à droite */}
        {(ecriture || semaine) && (
          <div className="ml-auto inline-flex items-center gap-0.5 rounded-lg border border-pierre-200 bg-pierre-100/70 p-0.5">
            <span className="inline-flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-[#107c41]">
              <IconeTableur /> Excel
            </span>
            {ecriture && (
              <button className={boutonExcel} title="Créer une semaine à partir d'un classeur Excel" onClick={() => fichier.current?.click()}>
                <IconeImporter /> Importer
              </button>
            )}
            {semaine && (
              <button
                className={boutonExcel}
                title="Télécharger cette semaine en classeur Excel"
                onClick={() => void exporterClasseur(semaine.horaire.nom, semaine.etat, semaine.reglages)}
              >
                <IconeExporter /> Exporter
              </button>
            )}
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
          </div>
        )}
      </div>
      {estModele && semaine && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-950">
          <span className="min-w-60 flex-1">
            <b>Modèle</b> ({resumeJours(semaine.etat.jours)}). Une semaine créée à partir de ce modèle en reprend les jours, les
            périodes, les groupes, les activités et les soirées.
          </span>
          {ecriture && (
            <button className={ui.bouton} onClick={() => nouveau({ modele: false, depart: semaine.horaire.id, dossier: null })}>
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
  const nonVides = grouper(liste, dossiers).filter((g) => g.horaires.length)
  const options = (l: ResumeHoraire[]) =>
    l.map((h) => (
      <option key={h.id} value={h.id}>
        {h.nom}
      </option>
    ))
  return (
    <select
      aria-label="Semaine ouverte"
      className="max-w-72 rounded-lg border border-pierre-300 bg-white py-2 pl-3 text-sm font-medium"
      value={active ?? ''}
      onChange={(e) => choisir(e.target.value)}
    >
      {nonVides.length === 1 && !nonVides[0].modeles
        ? options(nonVides[0].horaires)
        : nonVides.map((g) => (
            <optgroup key={g.cle} label={g.modeles ? '📐 Modèles' : g.dossier ? `📁 ${g.titre}` : g.titre}>
              {options(g.horaires)}
            </optgroup>
          ))}
    </select>
  )
}

// ------------------------------------------------------------------
// Nouvelle semaine (vide ou à partir d'un modèle) / nouveau modèle
// ------------------------------------------------------------------

export function NouvelHoraire({
  liste,
  dossiers,
  modele,
  departInitial,
  dossierInitial,
  semaine,
  ouvrir,
  fermer,
}: {
  liste: ResumeHoraire[]
  dossiers: Dossier[]
  /** Vrai : on crée un modèle (jamais rangé dans un dossier). */
  modele: boolean
  departInitial: string
  dossierInitial: string | null
  semaine: Semaine | null
  /** Ouvre l'horaire créé. */
  ouvrir: (id: string) => void
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
  const [nouveauDossier, setNouveauDossier] = useState(false)
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

  function changerDossier(cible: string) {
    setDossier(cible)
    if (!nomTouche) setNom(nomParDefaut(cible))
  }

  async function creerDossierIci(n: string) {
    const existant = dossiers.find((d) => d.nom === n)
    try {
      changerDossier(existant?.id ?? (await creerDossier.mutateAsync({ nom: n })))
      setNouveauDossier(false)
      return null
    } catch (e) {
      return messageErreur(e)
    }
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
      ouvrir(await creer.mutateAsync({ nom: propre, etat, modele, dossier_id: dossierCible }))
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
          <div>
            <label htmlFor="nouvel-horaire-dossier" className={ui.etiquette}>
              Dossier
            </label>
            {nouveauDossier ? (
              <SaisieNom
                compact
                placeholder="Nom du dossier (ex. Été 2027)"
                libelleOk="Créer"
                valider={creerDossierIci}
                annuler={() => setNouveauDossier(false)}
              />
            ) : (
              <div className="flex gap-2">
                <select id="nouvel-horaire-dossier" className={ui.champ} value={dossier} onChange={(e) => changerDossier(e.target.value)}>
                  <option value="">Sans dossier</option>
                  {dossiers.map((d) => (
                    <option key={d.id} value={d.id}>
                      📁 {d.nom}
                    </option>
                  ))}
                </select>
                <button type="button" className={`${ui.boutonSecondaire} shrink-0`} onClick={() => setNouveauDossier(true)}>
                  <IconePlus /> Dossier
                </button>
              </div>
            )}
          </div>
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
          {!source && (
            <span className="block text-xs text-pierre-500">
              Jours, périodes et soirées modifiables ensuite (« Jours et périodes ») ; groupes dans la grille.
            </span>
          )}
        </p>

        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex justify-end gap-2 border-t border-pierre-100 pt-4">
          <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button type="submit" className={ui.bouton} disabled={!!probleme || enCours || nouveauDossier}>
            {enCours ? 'Création…' : 'Créer'}
          </button>
        </div>
      </form>
    </Dialogue>
  )
}
