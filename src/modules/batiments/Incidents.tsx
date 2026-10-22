import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { BoutonSupprimer } from '@/lib/BoutonsAction'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur, usePersonnesModule } from '@/lib/donnees'
import { IconePlus } from '@/lib/icones'
import { CompteurPieces } from '@/lib/PiecesJointes'
import { ui } from '@/lib/ui'
import { PRIORITES, STATUTS } from '@/modules/travaux/types'
import { useAuth } from '@/shell/auth'
import {
  enregistrerIncident,
  supprimerIncident,
  useCreerTacheTravaux,
  useLieuxTravaux,
  useRelire,
  useTachesTravaux,
  type Donnees,
  type TacheTravaux,
} from './donnees'
import { Fichiers } from './Fichiers'
import { normaliser, termes } from './outils'
import { AVISES, GENRES, GRAVITES, type Avise, type GenreIncident, type Gravite, type Incident } from './types'

const GENRE = Object.fromEntries(GENRES.map((g) => [g.id, g])) as Record<GenreIncident, (typeof GENRES)[number]>
const GRAVITE = Object.fromEntries(GRAVITES.map((g) => [g.id, g.libelle])) as Record<Gravite, string>
const PASTILLES_GRAVITE: Record<Gravite, string> = {
  mineur: 'border-pierre-200 bg-pierre-50 text-pierre-700',
  important: 'border-amber-300 bg-amber-50 text-amber-900',
  majeur: 'border-red-200 bg-red-50 text-red-800',
}
const pastille = 'rounded-full border px-2 py-0.5 text-xs font-medium'

const deux = (n: number) => String(n).padStart(2, '0')
/** Valeur d'un champ datetime-local (heure de l'appareil). */
function pourChamp(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}T${deux(d.getHours())}:${deux(d.getMinutes())}`
}
const aujourdhui = () => pourChamp(new Date().toISOString()).slice(0, 10)
const dateHeure = (iso: string) => new Date(iso).toLocaleString('fr-CA', { dateStyle: 'long', timeStyle: 'short' })
const dateSeule = (iso: string) => new Date(iso).toLocaleDateString('fr-CA', { dateStyle: 'long' })
/** Jour AAAA-MM-JJ en toutes lettres (midi : jamais la veille). */
const jour = (j: string) => dateSeule(`${j}T12:00`)

/** Onglet Incidents : rapports (feu, bris, vol…), ouverts d'abord, le plus récent en haut. */
export function Incidents({ d, ecriture }: { d: Donnees; ecriture: boolean }) {
  const lireTravaux = useAuth().peutLire('travaux')
  const [recherche, setRecherche] = useState('')
  const [voirRegles, setVoirRegles] = useState(false)
  const [fiche, setFiche] = useState<{ id: string | null } | null>(null)
  const taches = useTachesTravaux(
    d.incidents.flatMap((i) => (i.tache_id ? [i.tache_id] : [])),
    lireTravaux,
  )

  const trouves = useMemo(() => {
    const tests = termes(recherche)
    return d.incidents.filter((i) => {
      const texte = normaliser(
        [
          i.titre,
          GENRE[i.genre]?.libelle,
          GRAVITE[i.gravite],
          i.batiment_id && d.batiment.get(i.batiment_id)?.nom,
          i.lieu,
          i.description,
          i.mesures,
          i.personnes,
          i.suivi,
          i.dossier_police,
          i.dossier_assureur,
        ]
          .filter(Boolean)
          .join(' '),
      )
      return tests.every((t) => t(texte))
    })
  }, [d, recherche])
  const ouverts = trouves.filter((i) => !i.regle_le)
  const regles = trouves.filter((i) => i.regle_le)

  const liste = (incidents: Incident[]) => (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {incidents.map((i) => (
        <li key={i.id}>
          <CarteIncident d={d} incident={i} tache={i.tache_id ? taches.get(i.tache_id) : undefined} ouvrir={() => setFiche({ id: i.id })} />
        </li>
      ))}
    </ul>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input type="search" aria-label="Chercher un incident" className={`${ui.champ} sm:flex-1`} placeholder="Chercher : feu, vol, cuisine, n° de dossier…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        {ecriture && (
          <button className={`${ui.bouton} self-start`} onClick={() => setFiche({ id: null })}>
            <IconePlus className="size-4" /> Rapport d'incident
          </button>
        )}
      </div>

      {!d.incidentsPrets ? (
        <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-sm font-semibold text-pierre-700">Dossiers ouverts</h2>
            {ouverts.length ? liste(ouverts) : <p className="text-sm text-pierre-500">{recherche ? 'Rien trouvé.' : 'Aucun incident ouvert.'}</p>}
          </section>
          {regles.length > 0 && (
            <section>
              <button className="mb-2 text-sm font-semibold text-pierre-700 hover:text-pierre-900" aria-expanded={voirRegles} onClick={() => setVoirRegles((v) => !v)}>
                {voirRegles ? '▾' : '▸'} Dossiers réglés ({regles.length})
              </button>
              {voirRegles && liste(regles)}
            </section>
          )}
        </>
      )}

      {fiche && <FicheIncident d={d} id={fiche.id} ecriture={ecriture} tache={(id) => taches.get(id)} fermer={() => setFiche(null)} />}
    </div>
  )
}

function CarteIncident({ d, incident: i, tache, ouvrir }: { d: Donnees; incident: Incident; tache?: TacheTravaux; ouvrir: () => void }) {
  const genre = GENRE[i.genre]
  const ou = [i.batiment_id && d.batiment.get(i.batiment_id)?.nom, i.lieu].filter(Boolean).join(' · ')
  return (
    <button className={`${ui.carte} flex h-full w-full flex-col gap-1 p-3 text-left hover:border-foret-600 ${!i.regle_le && i.gravite === 'majeur' ? 'border-red-300' : ''}`} onClick={ouvrir}>
      <span className="flex flex-wrap items-center gap-1.5">
        <span className={`${pastille} border-pierre-200 bg-white text-pierre-800`}>
          {genre?.icone} {genre?.libelle ?? i.genre}
        </span>
        <span className={`${pastille} ${PASTILLES_GRAVITE[i.gravite]}`}>{GRAVITE[i.gravite]}</span>
        {i.regle_le && <span className={`${pastille} border-foret-200 bg-foret-50 text-foret-800`}>Réglé</span>}
        {i.tache_id && (
          <span className="text-xs text-pierre-500" title={tache ? `Travaux : ${tache.titre}` : 'Tâche dans Travaux'}>
            🛠️ {tache ? STATUTS[tache.statut] : 'Travaux'}
          </span>
        )}
        <CompteurPieces pieces={d.fichiersDe(i.id)} />
      </span>
      <span className="font-medium">{i.titre}</span>
      <span className="text-sm text-pierre-600">{dateHeure(i.survenu_le)}</span>
      {ou && <span className="text-sm text-pierre-600">{ou}</span>}
    </button>
  )
}

/**
 * Fiche d'un rapport. `id` null = nouveau : une fois enregistré, la fiche
 * reste ouverte pour ajouter les photos et la tâche de Travaux. En ligne
 * seulement.
 */
function FicheIncident({
  d,
  id,
  ecriture,
  tache,
  fermer,
}: {
  d: Donnees
  id: string | null
  ecriture: boolean
  tache: (id: string) => TacheTravaux | undefined
  fermer: () => void
}) {
  const relire = useRelire()
  const personnes = usePersonnesModule('batiments').data
  const [idCourant, setIdCourant] = useState(id)
  const [idNouveau] = useState(() => crypto.randomUUID())
  const existant = idCourant ? d.incidents.find((i) => i.id === idCourant) : undefined
  const [titre, setTitre] = useState(existant?.titre ?? '')
  const [genre, setGenre] = useState<GenreIncident>(existant?.genre ?? 'bris')
  const [gravite, setGravite] = useState<Gravite>(existant?.gravite ?? 'mineur')
  const [survenu, setSurvenu] = useState(pourChamp(existant?.survenu_le ?? new Date().toISOString()))
  const [batiment, setBatiment] = useState(existant?.batiment_id ?? '')
  const [lieu, setLieu] = useState(existant?.lieu ?? '')
  const [description, setDescription] = useState(existant?.description ?? '')
  const [mesures, setMesures] = useState(existant?.mesures ?? '')
  const [impliques, setImpliques] = useState(existant?.personnes ?? '')
  const [avises, setAvises] = useState<Avise[]>(existant?.avises ?? [])
  const [dossierPolice, setDossierPolice] = useState(existant?.dossier_police ?? '')
  const [dossierAssureur, setDossierAssureur] = useState(existant?.dossier_assureur ?? '')
  const [cout, setCout] = useState(existant?.cout_estime != null ? String(existant.cout_estime) : '')
  const [suivi, setSuivi] = useState(existant?.suivi ?? '')
  const [regleLe, setRegleLe] = useState(existant?.regle_le ?? '')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  if (idCourant && !existant) return null
  const lecture = !ecriture
  const fichiers = existant ? d.fichiersDe(existant.id) : []
  const formulaire = 'fiche-incident'

  const basculerAvise = (a: Avise) => setAvises((l) => (l.includes(a) ? l.filter((x) => x !== a) : AVISES.map((x) => x.id).filter((x) => x === a || l.includes(x))))
  const texte = (s: string) => s.trim() || null

  async function soumettre(e: FormEvent) {
    e.preventDefault()
    if (!titre.trim() || !survenu) return
    const montant = cout.trim() ? Number(cout.replace(',', '.').replace(/\s/g, '')) : null
    if (montant != null && (!Number.isFinite(montant) || montant < 0)) return setErreur('Coût estimé : un montant en dollars.')
    setEnvoi(true)
    setErreur(null)
    try {
      await enregistrerIncident({
        id: existant?.id ?? idNouveau,
        titre: titre.trim(),
        genre,
        gravite,
        survenu_le: new Date(survenu).toISOString(),
        batiment_id: batiment || null,
        lieu: texte(lieu),
        description: texte(description),
        mesures: texte(mesures),
        personnes: texte(impliques),
        avises,
        dossier_police: avises.includes('police') ? texte(dossierPolice) : null,
        dossier_assureur: avises.includes('assureur') ? texte(dossierAssureur) : null,
        cout_estime: montant,
        suivi: texte(suivi),
        regle_le: regleLe || null,
      })
      await relire()
      if (existant) return fermer()
      // Nouveau : on reste sur la fiche pour les photos et la tâche de Travaux.
      setIdCourant(idNouveau)
    } catch (err) {
      setErreur(messageErreur(err))
    } finally {
      setEnvoi(false)
    }
  }

  async function retirer(i: Incident) {
    const message = [fichiers.length ? 'Ses photos et PDF seront effacés aussi.' : null, i.tache_id ? 'Sa tâche dans Travaux reste.' : null].filter(Boolean).join(' ')
    if (!(await confirmer({ titre: 'Supprimer ce rapport ?', message: message || undefined, libelleOk: 'Supprimer', danger: true }))) return
    try {
      await supprimerIncident(i.id, fichiers)
      await relire()
      fermer()
    } catch (err) {
      setErreur(messageErreur(err))
    }
  }

  const auteur = existant?.redige_par ? personnes?.find((p) => p.id === existant.redige_par)?.nom : null

  return (
    <Dialogue
      titre={existant ? existant.titre : "Nouveau rapport d'incident"}
      fermer={fermer}
      pied={
        <div className="flex items-center gap-2">
          {existant && ecriture && <BoutonSupprimer onClick={() => retirer(existant)} />}
          <div className="ml-auto flex gap-2">
            <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
              {ecriture ? (existant && !id ? 'Fermer' : 'Annuler') : 'Fermer'}
            </button>
            {ecriture && (
              <button form={formulaire} className={ui.bouton} disabled={envoi}>
                {envoi ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            )}
          </div>
        </div>
      }
    >
      {existant && !id && <p className="mb-3 rounded-lg border border-foret-200 bg-foret-50 px-3 py-2 text-sm text-foret-800">Rapport enregistré. Ajoutez les photos plus bas.</p>}
      <form id={formulaire} onSubmit={soumettre} className="space-y-3">
        <div>
          <label className={ui.etiquette} htmlFor="in-titre">
            Résumé
          </label>
          <input id="in-titre" required disabled={lecture} className={ui.champ} value={titre} placeholder="Feu de poubelle derrière la cuisine" autoFocus={!existant} onChange={(e) => setTitre(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={ui.etiquette} htmlFor="in-genre">
              Type
            </label>
            <select id="in-genre" disabled={lecture} className={ui.champ} value={genre} onChange={(e) => setGenre(e.target.value as GenreIncident)}>
              {GENRES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.icone} {g.libelle}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="in-gravite">
              Gravité
            </label>
            <select id="in-gravite" disabled={lecture} className={ui.champ} value={gravite} onChange={(e) => setGravite(e.target.value as Gravite)}>
              {GRAVITES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.libelle}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={ui.etiquette} htmlFor="in-quand">
              Quand
            </label>
            <input id="in-quand" type="datetime-local" required disabled={lecture} className={ui.champ} value={survenu} max={pourChamp(new Date().toISOString())} onChange={(e) => setSurvenu(e.target.value)} />
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="in-batiment">
              Bâtiment
            </label>
            <select id="in-batiment" disabled={lecture} className={ui.champ} value={batiment} onChange={(e) => setBatiment(e.target.value)}>
              <option value="">—</option>
              {d.batiments.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nom}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="in-lieu">
            Où exactement
          </label>
          <input id="in-lieu" disabled={lecture} className={ui.champ} value={lieu} placeholder="Près du conteneur, côté stationnement" onChange={(e) => setLieu(e.target.value)} />
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="in-description">
            Ce qui s'est passé
          </label>
          <textarea id="in-description" rows={3} disabled={lecture} className={ui.champ} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="in-mesures">
            Mesures prises sur le moment
          </label>
          <textarea id="in-mesures" rows={2} disabled={lecture} className={ui.champ} value={mesures} placeholder="Extincteur, eau coupée, secteur fermé…" onChange={(e) => setMesures(e.target.value)} />
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="in-personnes">
            Personnes impliquées et témoins
          </label>
          <textarea id="in-personnes" rows={2} disabled={lecture} className={ui.champ} value={impliques} onChange={(e) => setImpliques(e.target.value)} />
        </div>
        <fieldset>
          <legend className={ui.etiquette}>Avisés</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {AVISES.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" disabled={lecture} className="size-4 accent-foret-700" checked={avises.includes(a.id)} onChange={() => basculerAvise(a.id)} />
                {a.libelle}
              </label>
            ))}
          </div>
        </fieldset>
        {(avises.includes('police') || avises.includes('assureur')) && (
          <div className="grid grid-cols-2 gap-3">
            {avises.includes('police') && (
              <div>
                <label className={ui.etiquette} htmlFor="in-police">
                  N° de dossier (police)
                </label>
                <input id="in-police" disabled={lecture} className={ui.champ} value={dossierPolice} onChange={(e) => setDossierPolice(e.target.value)} />
              </div>
            )}
            {avises.includes('assureur') && (
              <div>
                <label className={ui.etiquette} htmlFor="in-assureur">
                  N° de réclamation (assureur)
                </label>
                <input id="in-assureur" disabled={lecture} className={ui.champ} value={dossierAssureur} onChange={(e) => setDossierAssureur(e.target.value)} />
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={ui.etiquette} htmlFor="in-cout">
              Coût estimé ($)
            </label>
            <input id="in-cout" inputMode="decimal" disabled={lecture} className={ui.champ} value={cout} placeholder="0,00" onChange={(e) => setCout(e.target.value)} />
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="in-regle">
              Dossier réglé le
            </label>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                aria-label="Dossier réglé"
                disabled={lecture}
                className="size-4 shrink-0 accent-foret-700"
                checked={!!regleLe}
                onChange={(e) => setRegleLe(e.target.checked ? aujourdhui() : '')}
              />
              <input id="in-regle" type="date" disabled={lecture || !regleLe} className={ui.champ} value={regleLe} onChange={(e) => setRegleLe(e.target.value)} />
            </div>
          </div>
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="in-suivi">
            Suivi
          </label>
          <textarea id="in-suivi" rows={2} disabled={lecture} className={ui.champ} value={suivi} placeholder="Réparations, réponse de l'assureur…" onChange={(e) => setSuivi(e.target.value)} />
        </div>
        {erreur && <p className={ui.erreur}>{erreur}</p>}
      </form>

      <div className="mt-4 space-y-4 border-t border-pierre-200 pt-4">
        <div>
          <p className={ui.etiquette}>Photos et PDF</p>
          {existant ? (
            <Fichiers cible={{ incident_id: existant.id }} fichiers={fichiers} ecriture={ecriture} vide="Aucune photo." />
          ) : (
            <p className="text-sm text-pierre-500">Les photos s’ajoutent une fois le rapport enregistré.</p>
          )}
        </div>
        {existant && (
          <Reparation
            d={d}
            incident={existant}
            tache={existant.tache_id ? tache(existant.tache_id) : undefined}
            ecriture={ecriture}
            proposition={{ titre: titre.trim() || existant.titre, description, batiment }}
          />
        )}
        {existant && (
          <p className="text-xs text-pierre-500">
            Rédigé {auteur ? `par ${auteur} ` : ''}le {dateSeule(existant.created_at)}
            {existant.regle_le ? ` · réglé le ${jour(existant.regle_le)}` : ''}
          </p>
        )}
      </div>
    </Dialogue>
  )
}

/** Réparation : la tâche de Travaux reliée, ou le bouton qui la crée. */
function Reparation({
  d,
  incident,
  tache,
  ecriture,
  proposition,
}: {
  d: Donnees
  incident: Incident
  tache?: TacheTravaux
  ecriture: boolean
  proposition: { titre: string; description: string; batiment: string }
}) {
  const auth = useAuth()
  const [ouvert, setOuvert] = useState(false)

  if (incident.tache_id) {
    return (
      <div>
        <p className={ui.etiquette}>Réparation dans Travaux</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span>🛠️ {tache ? tache.titre : 'Tâche créée dans Travaux'}</span>
          {tache && <span className={`${pastille} ${tache.statut === 'terminee' ? 'border-foret-200 bg-foret-50 text-foret-800' : 'border-pierre-200 bg-pierre-50 text-pierre-700'}`}>{STATUTS[tache.statut]}</span>}
          {auth.peutLire('travaux') && (
            <Link className="text-foret-700 underline" to={`/travaux?tache=${incident.tache_id}`}>
              Ouvrir dans Travaux
            </Link>
          )}
        </p>
      </div>
    )
  }
  if (!ecriture || !auth.peutEcrire('travaux')) return null
  if (!ouvert)
    return (
      <button type="button" className={ui.boutonSecondaire} onClick={() => setOuvert(true)}>
        🛠️ Créer une tâche dans Travaux
      </button>
    )
  return <NouvelleTache d={d} incident={incident} proposition={proposition} annuler={() => setOuvert(false)} />
}

const PRIORITE_SELON_GRAVITE: Record<Gravite, 1 | 2 | 3> = { majeur: 1, important: 2, mineur: 3 }

/** Petite fenêtre (dans la fiche) : la tâche de réparation, reprise du rapport. */
function NouvelleTache({
  d,
  incident,
  proposition,
  annuler,
}: {
  d: Donnees
  incident: Incident
  proposition: { titre: string; description: string; batiment: string }
  annuler: () => void
}) {
  const lieux = useLieuxTravaux()
  const creer = useCreerTacheTravaux()
  const nomBatiment = proposition.batiment ? d.batiment.get(proposition.batiment)?.nom : undefined
  const lieuPropose = nomBatiment ? lieux?.find((l) => normaliser(l.nom) === normaliser(nomBatiment))?.id : undefined
  const [titre, setTitre] = useState(proposition.titre)
  const [lieu, setLieu] = useState<string | null>(null)
  const [priorite, setPriorite] = useState<1 | 2 | 3>(PRIORITE_SELON_GRAVITE[incident.gravite])
  const [description, setDescription] = useState(() => {
    const entete = `Rapport d'incident du ${dateHeure(incident.survenu_le)} (${GENRE[incident.genre]?.libelle ?? incident.genre}${incident.lieu ? `, ${incident.lieu}` : ''}), dans Bâtiments › Incidents.`
    return proposition.description.trim() ? `${entete}\n\n${proposition.description.trim()}` : entete
  })
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  // Lieu de Travaux du même nom que le bâtiment, tant qu'on n'en a pas choisi.
  const lieuChoisi = lieu ?? lieuPropose ?? ''

  async function valider() {
    if (!titre.trim()) return
    setEnvoi(true)
    setErreur(null)
    try {
      await creer({ incident: incident.id, titre: titre.trim(), description, lieu: lieuChoisi || null, priorite })
    } catch (err) {
      setErreur(messageErreur(err))
      setEnvoi(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-pierre-200 bg-pierre-50 p-3">
      <p className="text-sm font-semibold text-pierre-800">Tâche de réparation dans Travaux</p>
      <div>
        <label className={ui.etiquette} htmlFor="tt-titre">
          Titre
        </label>
        <input id="tt-titre" className={ui.champ} value={titre} onChange={(e) => setTitre(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={ui.etiquette} htmlFor="tt-lieu">
            Lieu
          </label>
          <select id="tt-lieu" className={ui.champ} value={lieuChoisi} onChange={(e) => setLieu(e.target.value)}>
            <option value="">Sans lieu</option>
            {lieux?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nom}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="tt-priorite">
            Priorité
          </label>
          <select id="tt-priorite" className={ui.champ} value={priorite} onChange={(e) => setPriorite(Number(e.target.value) as 1 | 2 | 3)}>
            {Object.entries(PRIORITES).map(([n, libelle]) => (
              <option key={n} value={n}>
                {libelle}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={ui.etiquette} htmlFor="tt-description">
          Description
        </label>
        <textarea id="tt-description" rows={4} className={ui.champ} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {erreur && <p className={ui.erreur}>{erreur}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={ui.boutonSecondaire} onClick={annuler}>
          Annuler
        </button>
        <button type="button" className={ui.bouton} disabled={envoi || !titre.trim()} onClick={valider}>
          {envoi ? 'Création…' : 'Créer la tâche'}
        </button>
      </div>
    </div>
  )
}
