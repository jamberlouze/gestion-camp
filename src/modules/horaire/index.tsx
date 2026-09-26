import { useMemo, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { Conflits } from './Conflits'
import { Conges } from './Conges'
import { Construire } from './Construire'
import { ContexteSemaine, useSemaine, type Semaine } from './contexte'
import { useAjouterAnimateurs, useAnimateurs, useEditeurSemaine, useHoraires, useReferentielVide, useReglages } from './donnees'
import { analyseConges, analyseSoirees, ANIMATEURS_ORIGINE, conflitsGrille } from './logique'
import { BarreSemaine } from './Semaines'
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

  // Semaine ouverte : celle choisie si elle existe encore, sinon la première
  // semaine (les modèles en dernier recours).
  const liste = horaires.data ?? []
  const active = liste.find((h) => h.id === choisie)?.id ?? (liste.find((h) => !h.modele) ?? liste[0])?.id ?? null
  const choisir = (id: string) => {
    setChoisie(id)
    try {
      localStorage.setItem(CLE_SEMAINE, id)
    } catch {
      /* préférence non conservée */
    }
  }

  const editeur = useEditeurSemaine(active)
  // Un séjour court peut avoir ses propres nuits avec soirées.
  const nuits = editeur.etat?.nuits
  const reglagesSemaine = useMemo(() => (nuits ? { ...reglages, nuits } : reglages), [reglages, nuits])
  const semaine: Semaine | null =
    editeur.horaire && editeur.etat
      ? {
          horaire: editeur.horaire,
          etat: editeur.etat,
          modifier: editeur.modifier,
          remplacer: editeur.remplacer,
          statut: editeur.statut,
          reessayer: () => void editeur.envoyer(),
          reglages: reglagesSemaine,
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
          Aucune semaine pour l'instant. {ecriture ? 'Créez-en une (vide ou à partir d\'un modèle) ou importez un classeur Excel.' : ''}
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
