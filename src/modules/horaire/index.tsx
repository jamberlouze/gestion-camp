import { useMemo, useRef, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { Conflits } from './Conflits'
import { Conges } from './Conges'
import { Construire } from './Construire'
import { ContexteSemaine, useSemaine, type Semaine } from './contexte'
import {
  useAjouterAnimateurs,
  useAnimateurs,
  useCreerHoraire,
  useEditeurSemaine,
  useHoraires,
  useReferentielVide,
  useReglages,
  useRenommerHoraire,
  useSupprimerHoraire,
  type ResumeHoraire,
} from './donnees'
import { exporterClasseur, importerClasseur } from './excel'
import { Reglages } from './Reglages'
import { analyseConges, analyseSoirees, ANIMATEURS_ORIGINE, conflitsGrille, semaineVide } from './logique'
import { Soirees } from './Soirees'
import { Specialiste } from './Specialiste'
import { META_TAG, TAGS } from './types'

const CLE_SEMAINE = 'horaire-semaine-active'
const lireSemaineActive = () => {
  try {
    return localStorage.getItem(CLE_SEMAINE)
  } catch {
    return null
  }
}

export default function ModuleHoraire() {
  const { peutEcrire } = useAuth()
  const ecriture = peutEcrire('horaire')
  const horaires = useHoraires()
  const reglages = useReglages()
  const animateurs = useAnimateurs()
  const referentielVide = useReferentielVide()
  const [choisie, setChoisie] = useState<string | null>(lireSemaineActive)

  // Semaine active : celle choisie si elle existe encore, sinon la première.
  const liste = horaires.data ?? []
  const active = liste.find((h) => h.id === choisie)?.id ?? liste[0]?.id ?? null
  const choisir = (id: string) => {
    setChoisie(id)
    try {
      localStorage.setItem(CLE_SEMAINE, id)
    } catch {
      /* préférence non conservée */
    }
  }

  const editeur = useEditeurSemaine(active)
  const semaine: Semaine | null =
    editeur.horaire && editeur.etat
      ? {
          horaire: editeur.horaire,
          etat: editeur.etat,
          modifier: editeur.modifier,
          remplacer: editeur.remplacer,
          statut: editeur.statut,
          reessayer: () => void editeur.envoyer(),
          reglages,
          animateurs,
          ecriture,
        }
      : null

  if (horaires.error) return <p className={ui.erreur}>{messageErreur(horaires.error)}</p>
  if (!horaires.data) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  return (
    <div>
      <BarreSemaine liste={liste} active={active} choisir={choisir} semaine={semaine} ecriture={ecriture} />
      <BandeauErreurs racine="horaire" />
      {referentielVide && <AucunAnimateur />}
      {liste.length === 0 ? (
        <p className={`${ui.carte} p-10 text-center text-sm text-pierre-500`}>
          Aucune semaine pour l'instant. {ecriture ? 'Créez-en une ou importez un classeur Excel.' : ''}
        </p>
      ) : !semaine ? (
        editeur.erreur ? (
          <p className={ui.erreur}>{messageErreur(editeur.erreur)}</p>
        ) : (
          <p className="py-8 text-center text-sm text-pierre-500">Chargement de la semaine…</p>
        )
      ) : (
        <ContexteSemaine.Provider value={semaine}>
          <Onglets />
          <Routes>
            <Route index element={<Construire />} />
            <Route path="conflits" element={<Conflits />} />
            {TAGS.map((t) => (
              <Route key={t} path={t} element={<Specialiste tag={t} />} />
            ))}
            <Route path="conges" element={<Conges />} />
            <Route path="soirees" element={<Soirees />} />
          </Routes>
        </ContexteSemaine.Provider>
      )}
    </div>
  )
}

// ------------------------------------------------------------------
// Barre de la semaine : choix, nouvelle, dupliquer, renommer, Excel
// ------------------------------------------------------------------

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

function BarreSemaine({
  liste,
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
  const creer = useCreerHoraire()
  const renommer = useRenommerHoraire()
  const ajouterAnimateurs = useAjouterAnimateurs()
  const fichier = useRef<HTMLInputElement>(null)
  const [gestion, setGestion] = useState(false)
  const [reglages, setReglages] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const noms = liste.map((h) => h.nom)

  const nouvelle = async (nom: string, etat = semaineVide()) => {
    try {
      choisir(await creer.mutateAsync({ nom, etat }))
    } catch (e) {
      setMessage(messageErreur(e))
    }
  }

  async function importer(f: File) {
    try {
      const { etat, nom, nouveauxAnimateurs } = await importerClasseur(f)
      // Les animateurs du classeur absents du référentiel y sont ajoutés.
      if (nouveauxAnimateurs.length) await ajouterAnimateurs.mutateAsync(nouveauxAnimateurs).catch(() => undefined)
      await nouvelle(nomLibre(nom ?? `Import ${new Date().toLocaleDateString('fr-CA')}`, noms), etat)
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
        {liste.length > 0 && (
          <select
            aria-label="Semaine active"
            className="rounded-lg border border-pierre-300 bg-white px-3 py-2 text-sm font-medium"
            value={active ?? ''}
            onChange={(e) => choisir(e.target.value)}
          >
            {liste.map((h) => (
              <option key={h.id} value={h.id}>
                {h.nom}
              </option>
            ))}
          </select>
        )}
        {ecriture && (
          <>
            <button className={ui.boutonSecondaire} onClick={() => nouvelle(nomSemaineLibre(noms))}>
              + Nouvelle
            </button>
            {semaine && (
              <>
                <button
                  className={ui.boutonSecondaire}
                  onClick={() => nouvelle(nomLibre(`${semaine.horaire.nom} (copie)`, noms), structuredClone(semaine.etat))}
                >
                  Dupliquer
                </button>
                <button
                  className={ui.boutonSecondaire}
                  onClick={() => {
                    const nom = prompt('Nouveau nom pour cette semaine :', semaine.horaire.nom)?.trim()
                    if (!nom || nom === semaine.horaire.nom) return
                    if (noms.includes(nom)) return setMessage('Une semaine porte déjà ce nom.')
                    renommer.mutate({ id: semaine.horaire.id, nom })
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
        {ecriture && liste.length > 0 && (
          <button className={ui.boutonSecondaire} onClick={() => setGestion(true)}>
            Gérer
          </button>
        )}
        {ecriture && (
          <button className={ui.boutonSecondaire} onClick={() => setReglages(true)}>
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
      {message && (
        <p className={`${ui.erreur} mt-2 flex justify-between`}>
          {message}
          <button className="underline" onClick={() => setMessage(null)}>
            Fermer
          </button>
        </p>
      )}
      {reglages && <Reglages fermer={() => setReglages(false)} />}
      {gestion && <GestionSemaines liste={liste} active={active} choisir={choisir} fermer={() => setGestion(false)} />}
    </div>
  )
}

/** Le référentiel des employés est vide : les menus d'animateurs le seraient aussi. */
function AucunAnimateur() {
  const { estDirection } = useAuth()
  const ajouter = useAjouterAnimateurs()
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 print:hidden">
      <span className="flex-1">
        Aucun animateur dans le référentiel des employés : les menus d'animateurs sont vides.
      </span>
      {estDirection ? (
        <button className={ui.bouton} disabled={ajouter.isPending} onClick={() => ajouter.mutate(ANIMATEURS_ORIGINE)}>
          {ajouter.isPending ? 'Ajout…' : `Ajouter les ${ANIMATEURS_ORIGINE.length} animateurs de l'ancienne liste`}
        </button>
      ) : (
        <span>Demandez à la direction d'ajouter les employés.</span>
      )}
    </div>
  )
}

function GestionSemaines({
  liste,
  active,
  choisir,
  fermer,
}: {
  liste: ResumeHoraire[]
  active: string | null
  choisir: (id: string) => void
  fermer: () => void
}) {
  const supprimer = useSupprimerHoraire()
  return (
    <Dialogue titre="Gérer les semaines" fermer={fermer}>
      <p className="text-sm text-pierre-500">Chaque semaine est indépendante et enregistrée automatiquement.</p>
      <ul className="mt-3 divide-y divide-pierre-100">
        {liste.map((h) => (
          <li key={h.id} className="flex items-center gap-2 py-2 text-sm">
            <span className="flex-1 font-medium">{h.nom}</span>
            {h.id === active ? (
              <span className="rounded-full bg-foret-100 px-2 py-0.5 text-xs text-foret-800">active</span>
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
            )}
            <button
              className={ui.boutonDanger}
              onClick={() => confirm(`Supprimer « ${h.nom} » ? Cette action est définitive.`) && supprimer.mutate(h.id)}
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 text-right">
        <button className={ui.boutonSecondaire} onClick={fermer}>
          Fermer
        </button>
      </div>
    </Dialogue>
  )
}

// ------------------------------------------------------------------
// Onglets, avec le nombre de conflits bloquants
// ------------------------------------------------------------------

function Onglets() {
  const badges = useBadges()
  const onglets = [
    { chemin: '/horaire', libelle: 'Construire', fin: true },
    { chemin: '/horaire/conflits', libelle: 'Conflits', badge: badges.grille },
    ...TAGS.map((t) => ({ chemin: `/horaire/${t}`, libelle: `${META_TAG[t].icone} ${META_TAG[t].libelle}` })),
    { chemin: '/horaire/conges', libelle: 'Congés & remplacements', badge: badges.conges },
    { chemin: '/horaire/soirees', libelle: 'Soirées 🌙', badge: badges.soirees },
  ]
  return (
    <nav className="sans-barre mb-4 flex gap-5 overflow-x-auto border-b border-pierre-200 print:hidden">
      {onglets.map((o) => (
        <NavLink
          key={o.chemin}
          to={o.chemin}
          end={'fin' in o}
          className={({ isActive }) =>
            `flex items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium ${
              isActive ? 'border-foret-700 text-foret-800' : 'border-transparent text-pierre-500 hover:text-pierre-800'
            }`
          }
        >
          {o.libelle}
          {'badge' in o && !!o.badge && (
            <span className="rounded-full bg-[#d03b3b] px-1.5 text-xs font-semibold text-white" aria-label={`${o.badge} conflit(s)`}>
              {o.badge}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}


function useBadges() {
  const { etat, reglages } = useSemaine()
  return useMemo(
    () => ({
      grille: conflitsGrille(etat, reglages).conflits.filter((c) => c.sev === 'err').length,
      conges: analyseConges(etat).conflits.filter((c) => c.sev === 'err').length,
      soirees: analyseSoirees(etat, reglages).conflits.filter((c) => c.sev === 'err').length,
    }),
    [etat, reglages],
  )
}
