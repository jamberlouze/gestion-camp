import { useMemo, useState, type FormEvent } from 'react'
import { BoutonSupprimer } from '@/lib/BoutonsAction'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur, useEmployes } from '@/lib/donnees'
import { IconePlus } from '@/lib/icones'
import { CompteurPieces } from '@/lib/PiecesJointes'
import type { Employe } from '@/lib/types'
import { ui } from '@/lib/ui'
import { enregistrerRapport, supprimerRapport, useRelire } from './donnees'
import { Fichiers } from './Fichiers'
import { AVISES, CONSULTATIONS, GENRES, avecBlessure, type Avise, type Consultation, type Fichier, type GenreRapport, type Rapport } from './types'

const GENRE = Object.fromEntries(GENRES.map((g) => [g.id, g])) as Record<GenreRapport, (typeof GENRES)[number]>
const pastille = 'rounded-full border px-2 py-0.5 text-xs font-medium'
/** Choix « Autre personne » du menu des employés : nom écrit à la main. */
const AUTRE = 'autre'
// 16 px sur téléphone : sinon l'iPhone zoome dans le champ (voir Travaux).
const champ = ui.champ.replace('text-sm', 'text-base sm:text-sm')

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

/** « Léa Tremblay (Lulu) » : prénom et nom de famille, nom de camp s'il est autre. */
function nomEmploye(e: Employe) {
  const nom = [e.prenom, e.nom_famille].filter(Boolean).join(' ')
  if (!nom) return e.surnom
  return e.surnom && e.surnom !== e.prenom && e.surnom !== nom ? `${nom} (${e.surnom})` : nom
}

const sansAccents = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

export interface Droits {
  /** Voit et gère tous les rapports (direction). */
  gere: boolean
  /** Peut remplir un rapport (direction ou « Déclarer »). */
  declare: boolean
  moi: string | undefined
}

/** Un rapport se modifie par la direction, ou par qui l'a déclaré tant qu'il est ouvert. */
const peutModifier = (r: Rapport, droits: Droits) => droits.gere || (droits.declare && r.redige_par === droits.moi && !r.regle_le)

/** Liste des rapports : ouverts d'abord, le plus récent en haut ; réglés repliés. */
export function Rapports({ rapports, fichiers, droits }: { rapports: Rapport[]; fichiers: Fichier[]; droits: Droits }) {
  const employes = useEmployes().data
  const employe = useMemo(() => new Map((employes ?? []).map((e) => [e.id, e])), [employes])
  const [recherche, setRecherche] = useState('')
  const [voirRegles, setVoirRegles] = useState(false)
  const [fiche, setFiche] = useState<{ id: string | null } | null>(null)

  // Nom de la personne de chaque rapport (employé du référentiel ou nom écrit).
  const personnes = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const r of rapports) {
      const e = r.employe_id ? employe.get(r.employe_id) : undefined
      m.set(r.id, e ? nomEmploye(e) : r.autre_personne)
    }
    return m
  }, [rapports, employe])
  const fichiersDe = (id: string) => fichiers.filter((f) => f.rapport_id === id)

  const trouves = useMemo(() => {
    const mots = sansAccents(recherche).split(/\s+/).filter(Boolean)
    if (!mots.length) return rapports
    return rapports.filter((r) => {
      const texte = sansAccents(
        [r.titre, GENRE[r.genre]?.libelle, personnes.get(r.id), r.lieu, r.description, r.temoins, r.blessure, r.soins, r.secouriste, r.mesures, r.suivi, r.dossier_cnesst, r.redige_par_nom]
          .filter(Boolean)
          .join(' '),
      )
      return mots.every((m) => texte.includes(m))
    })
  }, [rapports, recherche, personnes])
  const ouverts = trouves.filter((r) => !r.regle_le)
  const regles = trouves.filter((r) => r.regle_le)

  const liste = (lignes: Rapport[]) => (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {lignes.map((r) => (
        <li key={r.id}>
          <CarteRapport rapport={r} personne={personnes.get(r.id) ?? null} fichiers={fichiersDe(r.id)} ouvrir={() => setFiche({ id: r.id })} />
        </li>
      ))}
    </ul>
  )

  return (
    <div className="space-y-4">
      {!droits.gere && (
        <p className="text-sm text-pierre-600">Vous voyez les rapports que vous avez remplis. Vous pouvez les modifier tant que la direction ne les a pas réglés.</p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input type="search" aria-label="Chercher un rapport" className={`${champ} sm:flex-1`} placeholder="Chercher un nom, une blessure, un lieu…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        {droits.declare && (
          <button className={`${ui.bouton} self-start`} onClick={() => setFiche({ id: null })}>
            <IconePlus className="size-4" /> Rapport d'accident
          </button>
        )}
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-pierre-700">Dossiers ouverts</h2>
        {ouverts.length ? liste(ouverts) : <p className="text-sm text-pierre-500">{recherche ? 'Rien trouvé.' : 'Aucun rapport ouvert.'}</p>}
      </section>
      {regles.length > 0 && (
        <section>
          <button className="mb-2 text-sm font-semibold text-pierre-700 hover:text-pierre-900" aria-expanded={voirRegles} onClick={() => setVoirRegles((v) => !v)}>
            {voirRegles ? '▾' : '▸'} Dossiers réglés ({regles.length})
          </button>
          {voirRegles && liste(regles)}
        </section>
      )}

      {fiche && (
        <FicheRapport
          id={fiche.id}
          rapports={rapports}
          fichiersDe={fichiersDe}
          employes={employes ?? []}
          droits={droits}
          fermer={() => setFiche(null)}
        />
      )}
    </div>
  )
}

function CarteRapport({ rapport: r, personne, fichiers, ouvrir }: { rapport: Rapport; personne: string | null; fichiers: Fichier[]; ouvrir: () => void }) {
  const genre = GENRE[r.genre]
  const ou = [dateHeure(r.survenu_le), r.lieu].filter(Boolean).join(' · ')
  return (
    <button className={`${ui.carte} flex h-full w-full flex-col gap-1 p-3 text-left hover:border-foret-600`} onClick={ouvrir}>
      <span className="flex flex-wrap items-center gap-1.5">
        <span className={`${pastille} border-pierre-200 bg-white text-pierre-800`}>
          {genre?.icone} {genre?.libelle ?? r.genre}
        </span>
        {r.arret_travail && <span className={`${pastille} border-amber-300 bg-amber-50 text-amber-900`}>Arrêt de travail</span>}
        {r.avises.includes('cnesst') && <span className={`${pastille} border-sky-200 bg-sky-50 text-sky-800`}>CNESST</span>}
        {r.regle_le && <span className={`${pastille} border-foret-200 bg-foret-50 text-foret-800`}>Réglé</span>}
        <CompteurPieces pieces={fichiers} />
      </span>
      <span className="font-medium">{r.titre}</span>
      {personne && <span className="text-sm text-pierre-800">{personne}</span>}
      <span className="text-sm text-pierre-600">{ou}</span>
    </button>
  )
}

/**
 * Fiche d'un rapport. `id` null = nouveau : une fois enregistré, la fiche
 * reste ouverte pour ajouter les photos. En ligne seulement.
 */
function FicheRapport({
  id,
  rapports,
  fichiersDe,
  employes,
  droits,
  fermer,
}: {
  id: string | null
  rapports: Rapport[]
  fichiersDe: (id: string) => Fichier[]
  employes: Employe[]
  droits: Droits
  fermer: () => void
}) {
  const relire = useRelire()
  const [idCourant, setIdCourant] = useState(id)
  const [idNouveau] = useState(() => crypto.randomUUID())
  const existant = idCourant ? rapports.find((r) => r.id === idCourant) : undefined
  const [genre, setGenre] = useState<GenreRapport>(existant?.genre ?? 'accident')
  const [titre, setTitre] = useState(existant?.titre ?? '')
  const [survenu, setSurvenu] = useState(pourChamp(existant?.survenu_le ?? new Date().toISOString()))
  const [lieu, setLieu] = useState(existant?.lieu ?? '')
  // '' = personne, AUTRE = nom écrit à la main, sinon l'employé.
  const [personne, setPersonne] = useState(existant ? (existant.employe_id ?? (existant.autre_personne ? AUTRE : '')) : '')
  const [autre, setAutre] = useState(existant?.autre_personne ?? '')
  const [description, setDescription] = useState(existant?.description ?? '')
  const [temoins, setTemoins] = useState(existant?.temoins ?? '')
  const [blessure, setBlessure] = useState(existant?.blessure ?? '')
  const [soins, setSoins] = useState(existant?.soins ?? '')
  const [secouriste, setSecouriste] = useState(existant?.secouriste ?? '')
  const [consultation, setConsultation] = useState<Consultation | ''>(existant?.consultation ?? '')
  const [arret, setArret] = useState(existant?.arret_travail ?? false)
  const [retour, setRetour] = useState(existant?.retour_le ?? '')
  const [avises, setAvises] = useState<Avise[]>(existant?.avises ?? [])
  const [dossierCnesst, setDossierCnesst] = useState(existant?.dossier_cnesst ?? '')
  const [mesures, setMesures] = useState(existant?.mesures ?? '')
  const [suivi, setSuivi] = useState(existant?.suivi ?? '')
  const [regleLe, setRegleLe] = useState(existant?.regle_le ?? '')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  // Employés actifs, plus celui du rapport s'il ne l'est plus.
  const choix = useMemo(
    () =>
      employes
        .filter((e) => e.actif || e.id === existant?.employe_id)
        .map((e) => ({ id: e.id, nom: nomEmploye(e) }))
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    [employes, existant?.employe_id],
  )

  if (idCourant && !existant) return null
  const ecriture = existant ? peutModifier(existant, droits) : droits.declare
  const lecture = !ecriture
  const fichiers = existant ? fichiersDe(existant.id) : []
  const formulaire = 'fiche-accident'
  const blesse = avecBlessure(genre)

  const basculerAvise = (a: Avise) => setAvises((l) => (l.includes(a) ? l.filter((x) => x !== a) : AVISES.map((x) => x.id).filter((x) => x === a || l.includes(x))))
  const texte = (s: string) => s.trim() || null

  async function soumettre(e: FormEvent) {
    e.preventDefault()
    if (!titre.trim() || !survenu) return
    if (blesse && !personne) return setErreur('Indiquez la personne blessée.')
    if (personne === AUTRE && !autre.trim()) return setErreur('Écrivez le nom de la personne.')
    setEnvoi(true)
    setErreur(null)
    try {
      await enregistrerRapport(
        {
          id: existant?.id ?? idNouveau,
          genre,
          titre: titre.trim(),
          survenu_le: new Date(survenu).toISOString(),
          lieu: texte(lieu),
          employe_id: personne && personne !== AUTRE ? personne : null,
          autre_personne: personne === AUTRE ? texte(autre) : null,
          description: texte(description),
          temoins: texte(temoins),
          blessure: blesse ? texte(blessure) : null,
          soins: blesse ? texte(soins) : null,
          secouriste: blesse ? texte(secouriste) : null,
          consultation: blesse ? consultation || null : null,
          arret_travail: blesse && arret,
          retour_le: blesse && arret ? retour || null : null,
          avises,
          dossier_cnesst: avises.includes('cnesst') ? texte(dossierCnesst) : null,
          mesures: texte(mesures),
          // La base garde l'ancienne valeur pour qui ne gère pas les rapports.
          suivi: texte(suivi),
          regle_le: regleLe || null,
        },
        !existant,
      )
      await relire()
      if (existant) return fermer()
      // Nouveau : on reste sur la fiche pour les photos.
      setIdCourant(idNouveau)
    } catch (err) {
      setErreur(messageErreur(err))
    } finally {
      setEnvoi(false)
    }
  }

  async function retirer(r: Rapport) {
    if (
      !(await confirmer({
        titre: 'Supprimer ce rapport ?',
        message: fichiers.length ? 'Ses photos et PDF seront effacés aussi.' : undefined,
        libelleOk: 'Supprimer',
        danger: true,
      }))
    )
      return
    try {
      await supprimerRapport(r.id, fichiers)
      await relire()
      fermer()
    } catch (err) {
      setErreur(messageErreur(err))
    }
  }

  return (
    <Dialogue
      titre={existant ? existant.titre : "Nouveau rapport d'accident"}
      fermer={fermer}
      pied={
        <div className="flex items-center gap-2">
          {existant && droits.gere && <BoutonSupprimer onClick={() => retirer(existant)} />}
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
      {existant && !ecriture && !droits.gere && existant.regle_le && (
        <p className="mb-3 rounded-lg border border-pierre-200 bg-pierre-50 px-3 py-2 text-sm text-pierre-700">Dossier réglé par la direction : il ne se modifie plus.</p>
      )}
      <form id={formulaire} onSubmit={soumettre} className="space-y-3">
        <div>
          <label className={ui.etiquette} htmlFor="ac-genre">
            Type
          </label>
          <select id="ac-genre" disabled={lecture} className={champ} value={genre} onChange={(e) => setGenre(e.target.value as GenreRapport)}>
            {GENRES.map((g) => (
              <option key={g.id} value={g.id}>
                {g.icone} {g.libelle}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="ac-titre">
            Résumé
          </label>
          <input id="ac-titre" required disabled={lecture} className={champ} value={titre} placeholder="Coupure à la main en cuisine" autoFocus={!existant} onChange={(e) => setTitre(e.target.value)} />
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="ac-personne">
            {blesse ? 'Personne blessée' : 'Personne concernée (facultatif)'}
          </label>
          <select id="ac-personne" disabled={lecture} required={blesse} className={champ} value={personne} onChange={(e) => setPersonne(e.target.value)}>
            <option value="">{blesse ? 'Choisir…' : '—'}</option>
            {choix.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
            <option value={AUTRE}>Autre personne (pas dans la liste)…</option>
          </select>
          {personne === AUTRE && (
            <input aria-label="Nom de la personne" required disabled={lecture} className={`${champ} mt-2`} value={autre} placeholder="Prénom et nom" onChange={(e) => setAutre(e.target.value)} />
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={ui.etiquette} htmlFor="ac-quand">
              Quand
            </label>
            <input id="ac-quand" type="datetime-local" required disabled={lecture} className={champ} value={survenu} max={pourChamp(new Date().toISOString())} onChange={(e) => setSurvenu(e.target.value)} />
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="ac-lieu">
              Où
            </label>
            <input id="ac-lieu" disabled={lecture} className={champ} value={lieu} placeholder="Cuisine, quai, sentier…" onChange={(e) => setLieu(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="ac-description">
            Ce qui s'est passé
          </label>
          <textarea id="ac-description" rows={3} disabled={lecture} className={champ} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="ac-temoins">
            Témoins
          </label>
          <input id="ac-temoins" disabled={lecture} className={champ} value={temoins} onChange={(e) => setTemoins(e.target.value)} />
        </div>

        {blesse && (
          <fieldset className="space-y-3 border-t border-pierre-200 pt-3">
            <legend className="text-sm font-semibold text-pierre-800">Blessure et soins</legend>
            <div>
              <label className={ui.etiquette} htmlFor="ac-blessure">
                Blessure (nature, partie du corps)
              </label>
              <input id="ac-blessure" disabled={lecture} className={champ} value={blessure} placeholder="Coupure à l'index gauche" onChange={(e) => setBlessure(e.target.value)} />
            </div>
            <div>
              <label className={ui.etiquette} htmlFor="ac-soins">
                Premiers soins donnés
              </label>
              <textarea id="ac-soins" rows={2} disabled={lecture} className={champ} value={soins} placeholder="Plaie nettoyée, pansement…" onChange={(e) => setSoins(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={ui.etiquette} htmlFor="ac-secouriste">
                  Soins donnés par
                </label>
                <input id="ac-secouriste" disabled={lecture} className={champ} value={secouriste} onChange={(e) => setSecouriste(e.target.value)} />
              </div>
              <div>
                <label className={ui.etiquette} htmlFor="ac-consultation">
                  Consultation médicale
                </label>
                <select id="ac-consultation" disabled={lecture} className={champ} value={consultation} onChange={(e) => setConsultation(e.target.value as Consultation | '')}>
                  <option value="">—</option>
                  {CONSULTATIONS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.libelle}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" disabled={lecture} className="mt-0.5 size-4 shrink-0 accent-foret-700" checked={arret} onChange={(e) => setArret(e.target.checked)} />
              Absent du travail après la journée de l'accident
            </label>
            {arret && (
              <>
                {droits.gere && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Arrêt au-delà de la journée de l'accident : l'employeur remplit l'avis de l'employeur et demande de remboursement de la CNESST.
                  </p>
                )}
                <div className="sm:w-1/2">
                  <label className={ui.etiquette} htmlFor="ac-retour">
                    Retour au travail le
                  </label>
                  <input id="ac-retour" type="date" disabled={lecture} className={champ} value={retour} onChange={(e) => setRetour(e.target.value)} />
                </div>
              </>
            )}
          </fieldset>
        )}

        <fieldset className="border-t border-pierre-200 pt-3">
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
        {avises.includes('cnesst') && (
          <div className="sm:w-1/2">
            <label className={ui.etiquette} htmlFor="ac-cnesst">
              N° de dossier CNESST
            </label>
            <input id="ac-cnesst" disabled={lecture} className={champ} value={dossierCnesst} onChange={(e) => setDossierCnesst(e.target.value)} />
          </div>
        )}
        <div>
          <label className={ui.etiquette} htmlFor="ac-mesures">
            Pour que ça ne se reproduise pas
          </label>
          <textarea id="ac-mesures" rows={2} disabled={lecture} className={champ} value={mesures} placeholder="Gants de cuisine, marche réparée, consigne à l'équipe…" onChange={(e) => setMesures(e.target.value)} />
        </div>

        {droits.gere && (
          <fieldset className="space-y-3 border-t border-pierre-200 pt-3">
            <legend className="text-sm font-semibold text-pierre-800">Suivi de la direction</legend>
            <div>
              <label className={ui.etiquette} htmlFor="ac-suivi">
                Suivi
              </label>
              <textarea id="ac-suivi" rows={2} disabled={lecture} className={champ} value={suivi} placeholder="Appel à l'employé, réponse de la CNESST…" onChange={(e) => setSuivi(e.target.value)} />
            </div>
            <div className="sm:w-1/2">
              <label className={ui.etiquette} htmlFor="ac-regle">
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
                <input id="ac-regle" type="date" disabled={lecture || !regleLe} className={champ} value={regleLe} onChange={(e) => setRegleLe(e.target.value)} />
              </div>
            </div>
          </fieldset>
        )}
        {!droits.gere && existant?.suivi && (
          <div className="border-t border-pierre-200 pt-3">
            <p className={ui.etiquette}>Suivi de la direction</p>
            <p className="whitespace-pre-line text-sm text-pierre-800">{existant.suivi}</p>
          </div>
        )}
        {erreur && <p className={ui.erreur}>{erreur}</p>}
      </form>

      <div className="mt-4 space-y-4 border-t border-pierre-200 pt-4">
        <div>
          <p className={ui.etiquette}>Photos et PDF</p>
          {existant ? (
            <Fichiers rapport={existant.id} fichiers={fichiers} ecriture={ecriture} peutRetirer={(f) => droits.gere || f.ajoute_par === droits.moi} />
          ) : (
            <p className="text-sm text-pierre-500">Les photos s’ajoutent une fois le rapport enregistré.</p>
          )}
        </div>
        {existant && (
          <p className="text-xs text-pierre-500">
            Rédigé {existant.redige_par_nom ? `par ${existant.redige_par_nom} ` : ''}le {dateSeule(existant.created_at)}
            {existant.regle_le ? ` · réglé le ${jour(existant.regle_le)}` : ''}
          </p>
        )}
      </div>
    </Dialogue>
  )
}
