import { useRef, useState } from 'react'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { IconeChevron, IconeDossier, IconeDupliquer, IconeModele, IconePlus, IconeRenommer } from '@/lib/icones'
import { Bulle, SaisieNom } from '@/lib/SaisieNom'
import { ui } from '@/lib/ui'
import { libelleJour } from './calcul'
import { useCopierMenu, useCreerMenu, useEnregistrerDossier, useModifierMenu, useOublierErreur } from './donnees'
import { dossierDe, grouper, nomLibre, nomMenuLibre, nombreJours, nomsDans, resumeMenu, type DemandeNouveau } from './emplacements'
import type { Dossier, Menu } from './types'

// ------------------------------------------------------------------
// Barre du menu ouvert : le menu et ce qu'on en fait (nouveau, dupliquer,
// renommer). Le contenu s'enregistre ligne par ligne : pas d'état
// d'enregistrement à afficher ici.
// ------------------------------------------------------------------

export function BarreMenu({
  liste,
  dossiers,
  ouvert,
  choisir,
  ecriture,
  nouveau,
}: {
  liste: Menu[]
  dossiers: Dossier[]
  ouvert: Menu | null
  choisir: (id: string) => void
  ecriture: boolean
  nouveau: (d: DemandeNouveau) => void
}) {
  const copier = useCopierMenu()
  const modifier = useModifierMenu()
  const oublierErreur = useOublierErreur()
  const boutonRenommer = useRef<HTMLButtonElement>(null)
  // Id du menu en cours de renommage : si un autre menu s'ouvre (menu
  // supprimé ailleurs, choix au clavier), la bulle disparaît au lieu de
  // renommer le nouveau menu.
  const [renommage, setRenommage] = useState<string | null>(null)
  const enRenommage = !!ouvert && renommage === ouvert.id
  /** Ferme la bulle de renommage et rend le focus au bouton (clavier). */
  const finirRenommage = () => {
    setRenommage(null)
    boutonRenommer.current?.focus()
  }
  const [message, setMessage] = useState<string | null>(null)

  const estModele = !!ouvert?.modele
  const dossierOuvert = ouvert ? dossierDe(ouvert) : null
  const nomDossier = dossiers.find((d) => d.id === dossierOuvert)?.nom

  async function dupliquer() {
    if (!ouvert) return
    try {
      const nom = nomLibre(`${ouvert.nom} (copie)`, nomsDans(liste, estModele, dossierOuvert))
      choisir(await copier.mutateAsync({ source: ouvert.id, nom, dossier_id: dossierOuvert, modele: estModele, debut: ouvert.debut }))
      setMessage(null)
    } catch (e) {
      setMessage(messageErreur(e))
    }
  }

  async function renommer(nom: string) {
    if (!ouvert) return null
    if (nomsDans(liste, estModele, dossierOuvert).includes(nom)) {
      return estModele ? 'Un modèle porte déjà ce nom.' : 'Un menu de ce dossier porte déjà ce nom.'
    }
    const variables = { id: ouvert.id, nom }
    try {
      await modifier.mutateAsync(variables)
      finirRenommage()
      return null
    } catch (e) {
      // Affichée dans la bulle : pas aussi dans le bandeau du module.
      oublierErreur(variables)
      return messageErreur(e)
    }
  }

  return (
    <div className="mb-3 print:hidden">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {ouvert && (estModele || nomDossier) && (
          <span className="inline-flex items-center gap-1 text-sm text-pierre-500">
            {estModele ? <IconeModele /> : <IconeDossier />}
            {estModele ? 'Modèles' : nomDossier}
            <IconeChevron className="size-3.5 text-pierre-300" />
          </span>
        )}
        {liste.length > 0 && <ChoixMenu liste={liste} dossiers={dossiers} ouvert={ouvert?.id ?? null} choisir={choisir} />}
        {ecriture && (
          <button className={ui.boutonSecondaire} onClick={() => nouveau({ modele: false, dossier: dossierOuvert })}>
            <IconePlus /> Nouveau
          </button>
        )}
        {ecriture && ouvert && (
          <>
            <button className={ui.boutonSecondaire} disabled={copier.isPending} onClick={() => void dupliquer()}>
              <IconeDupliquer /> {copier.isPending ? 'Copie…' : 'Dupliquer'}
            </button>
            <div className="relative">
              <button
                ref={boutonRenommer}
                className={ui.boutonSecondaire}
                aria-expanded={enRenommage}
                onClick={() => setRenommage(enRenommage ? null : ouvert.id)}
              >
                <IconeRenommer /> Renommer
              </button>
              {enRenommage && (
                <Bulle ancre={boutonRenommer} fermer={() => setRenommage(null)}>
                  <p className="mb-2 text-sm font-medium">Renommer {estModele ? 'le modèle' : 'le menu'}</p>
                  <SaisieNom compact valeurInitiale={ouvert.nom} libelleOk="Renommer" valider={renommer} annuler={finirRenommage} />
                </Bulle>
              )}
            </div>
          </>
        )}
        {ouvert && !estModele && <span className="ml-1 text-sm text-pierre-500">{resumeMenu(ouvert)}</span>}
      </div>
      {ouvert && estModele && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-950">
          <span className="min-w-60 flex-1">
            <b>Modèle</b> ({nombreJours(ouvert.jours)}). Un menu créé à partir de ce modèle en reprend les groupes, la grille des
            repas, les sorties et les ajouts manuels.
          </span>
          {ecriture && (
            <button className={ui.bouton} onClick={() => nouveau({ modele: false, depart: ouvert.id, dossier: null })}>
              Créer un menu à partir de ce modèle
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

/** Liste des menus, groupés par dossier, puis les modèles. */
function ChoixMenu({
  liste,
  dossiers,
  ouvert,
  choisir,
}: {
  liste: Menu[]
  dossiers: Dossier[]
  ouvert: string | null
  choisir: (id: string) => void
}) {
  const nonVides = grouper(liste, dossiers).filter((g) => g.menus.length)
  const options = (l: Menu[]) =>
    l.map((m) => (
      <option key={m.id} value={m.id}>
        {m.nom}
      </option>
    ))
  return (
    <select
      aria-label="Menu ouvert"
      className="max-w-72 rounded-lg border border-pierre-300 bg-white py-2 pl-3 text-sm font-medium"
      value={ouvert ?? ''}
      onChange={(e) => choisir(e.target.value)}
    >
      {nonVides.length === 1 && !nonVides[0].modeles
        ? options(nonVides[0].menus)
        : nonVides.map((g) => (
            <optgroup key={g.cle} label={g.modeles ? '📐 Modèles' : g.dossier ? `📁 ${g.titre}` : g.titre}>
              {options(g.menus)}
            </optgroup>
          ))}
    </select>
  )
}

// ------------------------------------------------------------------
// Nouveau menu (vide, à partir d'un modèle ou copie d'un menu) / nouveau modèle
// ------------------------------------------------------------------

/** « 7 jours, du Lun 5 oct au Dim 11 oct », ou « 7 jours numérotés (Jour 1 à Jour 7) ». */
function apercuJours(jours: number, debut: string | null) {
  const premier = libelleJour(0, debut)
  const dernier = libelleJour(jours - 1, debut)
  if (debut) return `${nombreJours(jours)}, ${jours > 1 ? `du ${premier} au ${dernier}` : `le ${premier}`}`
  return `${nombreJours(jours)} numéroté${jours > 1 ? 's' : ''} (${jours > 1 ? `${premier} à ${dernier}` : premier})`
}

const JOURS_POSSIBLES = Array.from({ length: 14 }, (_, i) => i + 1)

export function NouveauMenu({
  liste,
  dossiers,
  modele,
  departInitial,
  dossierInitial,
  ouvrir,
  fermer,
}: {
  liste: Menu[]
  dossiers: Dossier[]
  /** Vrai : on crée un modèle (jamais rangé dans un dossier, sans date). */
  modele: boolean
  departInitial: string
  dossierInitial: string | null
  /** Ouvre le menu créé. */
  ouvrir: (id: string) => void
  fermer: () => void
}) {
  const creer = useCreerMenu()
  const copier = useCopierMenu()
  const creerDossier = useEnregistrerDossier()
  const modeles = liste.filter((m) => m.modele)
  const menus = liste.filter((m) => !m.modele)

  const nomParDefaut = (dossier: string) =>
    modele ? nomLibre('Nouveau modèle', nomsDans(liste, true, null)) : nomMenuLibre(nomsDans(liste, false, dossier || null))
  const [dossier, setDossier] = useState(dossierInitial ?? '')
  const [nouveauDossier, setNouveauDossier] = useState(false)
  const [nom, setNom] = useState(() => nomParDefaut(dossierInitial ?? ''))
  const [nomTouche, setNomTouche] = useState(false)
  const [depart, setDepart] = useState(liste.some((m) => m.id === departInitial) ? departInitial : '')
  const [debut, setDebut] = useState('')
  const [nombre, setNombre] = useState(7)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  // Une copie garde le nombre de jours de sa source.
  const source = liste.find((m) => m.id === depart)
  const jours = source ? source.jours : nombre
  const dateDebut = modele ? null : debut || null

  const propre = nom.trim()
  const dossierCible = modele ? null : dossier || null
  const pris = nomsDans(liste, modele, dossierCible).includes(propre)
  const probleme = !propre
    ? 'Donnez un nom.'
    : pris
      ? `« ${propre} » existe déjà ${modele ? 'parmi les modèles' : dossierCible ? 'dans ce dossier' : 'hors dossier'}.`
      : null

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

  async function creerMenu() {
    if (probleme || enCours) return
    setEnCours(true)
    setErreur(null)
    try {
      const id = source
        ? await copier.mutateAsync({ source: source.id, nom: propre, dossier_id: dossierCible, modele, debut: dateDebut })
        : await creer.mutateAsync({ nom: propre, dossier_id: dossierCible, modele, jours, debut: dateDebut })
      ouvrir(id)
      fermer()
    } catch (e) {
      setErreur(messageErreur(e))
      setEnCours(false)
    }
  }

  const titreSource = (m: Menu) => {
    const d = dossiers.find((x) => x.id === m.dossier_id)?.nom
    return `${d ? `${d} / ` : ''}${m.nom}`
  }

  return (
    <Dialogue titre={modele ? 'Nouveau modèle' : 'Nouveau menu'} fermer={fermer}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void creerMenu()
        }}
      >
        {modele && (
          <p className="text-sm text-pierre-500">
            Un modèle sert de point de départ : semaine d'été de 7 jours, séjour d'école de 3 jours… Il se modifie comme un menu
            (groupes, grille des repas, sorties, ajouts manuels), avec des jours numérotés.
          </p>
        )}
        <label className="block">
          <span className={ui.etiquette}>Nom</span>
          <input
            autoFocus
            className={ui.champ}
            value={nom}
            placeholder={modele ? "ex. Semaine d'été 7 jours" : 'ex. Menu 1, École Saint-Jean'}
            onChange={(e) => {
              setNom(e.target.value)
              setNomTouche(true)
            }}
          />
          {pris && <span className="mt-1 block text-xs text-red-700">{probleme}</span>}
        </label>

        {!modele && (
          <div>
            <label htmlFor="nouveau-menu-dossier" className={ui.etiquette}>
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
                <select id="nouveau-menu-dossier" className={ui.champ} value={dossier} onChange={(e) => changerDossier(e.target.value)}>
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
          <select className={ui.champ} value={depart} onChange={(e) => setDepart(e.target.value)}>
            <option value="">Menu vide</option>
            {modeles.length > 0 && (
              <optgroup label="Modèles">
                {modeles.map((m) => (
                  <option key={m.id} value={m.id}>
                    📐 {m.nom} — {nombreJours(m.jours)}
                  </option>
                ))}
              </optgroup>
            )}
            {menus.length > 0 && (
              <optgroup label="Copier un menu">
                {menus.map((m) => (
                  <option key={m.id} value={m.id}>
                    {titreSource(m)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {!modele && modeles.length === 0 && (
            <span className="mt-1 block text-xs text-pierre-500">
              Pas encore de modèle : créez-en dans « Dossiers et modèles » (ex. semaine d'été, séjour d'école).
            </span>
          )}
        </label>

        <div className="grid grid-cols-2 gap-3">
          {!modele && (
            <label className="block">
              <span className={ui.etiquette}>Début</span>
              <input type="date" className={ui.champ} value={debut} onChange={(e) => setDebut(e.target.value)} />
            </label>
          )}
          <label className="block">
            <span className={ui.etiquette}>Jours</span>
            {source ? (
              <input className={ui.champ} disabled value={source.jours} />
            ) : (
              <select className={ui.champ} value={nombre} onChange={(e) => setNombre(Number(e.target.value))}>
                {JOURS_POSSIBLES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>
        <p className="text-sm text-pierre-700">
          → {apercuJours(jours, dateDebut)}
          {!modele && !dateDebut && (
            <span className="block text-xs text-pierre-500">Sans date de début, les jours sont numérotés (Jour 1, Jour 2…).</span>
          )}
          {source && (
            <span className="block text-xs text-pierre-500">
              Groupes, grille des repas, sorties et ajouts manuels repris de « {source.nom} ».
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
