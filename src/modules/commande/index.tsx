import { useMemo, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { messageErreur } from '@/lib/donnees'
import { IconeDossier, IconeMenu, IconeModele, IconePersonnel, IconePlus, IconeRecettes } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { Ajouts } from './Ajouts'
import { Commande } from './Commande'
import { ContexteMenu, type MenuOuvert } from './contexte'
import { PageDossiers } from './Dossiers'
import { useDossiers, useMenus, useTempsReelCommande } from './donnees'
import type { DemandeNouveau } from './emplacements'
import { Equipe } from './Equipe'
import { FeuilleCuisine } from './FeuilleCuisine'
import { Groupes } from './Groupes'
import { HoraireCuisine } from './HoraireCuisine'
import { Ingredients } from './Ingredients'
import { BarreMenu, NouveauMenu } from './Menus'
import { Planificateur } from './Planificateur'
import { Recettes } from './Recettes'
import { Sorties } from './Sorties'
import type { Menu } from './types'

const CLE_MENU = 'cuisine-menu-actif'
const lireMenuActif = () => {
  try {
    return localStorage.getItem(CLE_MENU)
  } catch {
    return null
  }
}

/** Menu le plus récemment modifié. */
const plusRecent = (menus: Menu[]) => menus.reduce<Menu | undefined>((a, m) => (!a || m.updated_at > a.updated_at ? m : a), undefined)

type Espace = 'menu' | 'dossiers' | 'recettes' | 'horaire'

function espaceDe(chemin: string): Espace {
  if (chemin.startsWith('/cuisine/dossiers')) return 'dossiers'
  if (chemin.startsWith('/cuisine/recettes') || chemin.startsWith('/cuisine/ingredients')) return 'recettes'
  if (chemin.startsWith('/cuisine/horaire') || chemin.startsWith('/cuisine/equipe')) return 'horaire'
  return 'menu'
}

export default function ModuleCuisine() {
  useTempsReelCommande()
  const { peutEcrire } = useAuth()
  const ecriture = peutEcrire('commande')
  const requeteMenus = useMenus()
  const requeteDossiers = useDossiers()
  const { dossiers, connus } = requeteDossiers
  const [choisi, setChoisi] = useState<string | null>(lireMenuActif)
  const [demande, setDemande] = useState<DemandeNouveau | null>(null)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const espace = espaceDe(pathname)

  // Menu d'un dossier supprimé ailleurs (liste pas encore rechargée) : il est
  // « Sans dossier », comme dans la base.
  const liste = useMemo(() => {
    const l = requeteMenus.menus
    return connus ? l.map((m) => (m.dossier_id && !connus.has(m.dossier_id) ? { ...m, dossier_id: null } : m)) : l
  }, [requeteMenus.menus, connus])

  // Menu ouvert : celui choisi s'il existe encore, sinon le menu modifié le
  // plus récemment (les modèles en dernier recours). Ce choix par défaut est
  // retenu : sinon le menu ouvert changerait dès que quelqu'un modifie un
  // autre menu (updated_at).
  const [retenu, setRetenu] = useState<string | null>(null)
  const trouver = (id: string | null) => liste.find((m) => m.id === id)
  const menuChoisi = trouver(choisi)
  const ouvert = menuChoisi ?? trouver(retenu) ?? plusRecent(liste.filter((m) => !m.modele)) ?? liste.find((m) => m.modele) ?? null
  if (requeteMenus.data && !menuChoisi && (ouvert?.id ?? null) !== retenu) setRetenu(ouvert?.id ?? null)

  const choisir = (id: string) => {
    setChoisi(id)
    try {
      localStorage.setItem(CLE_MENU, id)
    } catch {
      /* préférence non conservée */
    }
  }
  /** Ouvre un menu ou un modèle (planificateur). */
  const ouvrir = (id: string) => {
    choisir(id)
    if (espace !== 'menu') navigate('/cuisine')
  }

  const contexte = useMemo<MenuOuvert | null>(() => (ouvert ? { menu: ouvert, ecriture } : null), [ouvert, ecriture])

  const erreur = requeteMenus.error ?? requeteDossiers.error
  const attente = erreur ? (
    <p className={ui.erreur}>{messageErreur(erreur)}</p>
  ) : !requeteMenus.data || !requeteDossiers.data ? (
    <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
  ) : null

  return (
    <div>
      <EnteteModule espace={espace} modeleOuvert={!!ouvert?.modele} />
      <BandeauErreurs racine="commande" />
      <Routes>
        <Route
          path="dossiers"
          element={
            attente ?? (
              <PageDossiers liste={liste} dossiers={dossiers} ouvert={ouvert?.id ?? null} ecriture={ecriture} ouvrir={ouvrir} nouveau={setDemande} />
            )
          }
        />
        <Route element={<SousEspace onglets={ONGLETS_RECETTES} libelle="Recettes et ingrédients" />}>
          <Route path="recettes" element={<Recettes />} />
          <Route path="ingredients" element={<Ingredients />} />
        </Route>
        <Route element={<SousEspace onglets={ONGLETS_HORAIRE} libelle="Horaire du personnel" />}>
          <Route path="horaire" element={<HoraireCuisine />} />
          <Route path="equipe" element={<Equipe />} />
        </Route>
        <Route
          path="*"
          element={
            attente ?? (
              <>
                <BarreMenu liste={liste} dossiers={dossiers} ouvert={ouvert} choisir={choisir} ecriture={ecriture} nouveau={setDemande} />
                {!contexte ? (
                  <div className={`${ui.carte} p-10 text-center text-sm text-pierre-500`}>
                    <p>Aucun menu pour l'instant.</p>
                    {ecriture && (
                      <>
                        <p className="mt-1">Un menu (séjour ou semaine) a ses propres groupes, sa grille des repas, ses sorties et ses ajouts manuels.</p>
                        <button className={`${ui.bouton} mt-4`} onClick={() => setDemande({ modele: false, dossier: null })}>
                          <IconePlus /> Créer un menu
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <ContexteMenu.Provider value={contexte}>
                    <Onglets />
                    {/* Un autre menu : les pages repartent de zéro (rien de l'ancien menu). */}
                    <Routes key={contexte.menu.id}>
                      <Route index element={<Planificateur />} />
                      <Route path="groupes" element={<Groupes />} />
                      <Route path="ajouts" element={<Ajouts />} />
                      <Route path="sorties" element={<Sorties />} />
                      <Route path="commande" element={<Commande />} />
                      <Route path="feuille" element={<FeuilleCuisine />} />
                      <Route path="*" element={<Navigate to="/cuisine" replace />} />
                    </Routes>
                  </ContexteMenu.Provider>
                )}
              </>
            )
          }
        />
      </Routes>
      {demande && (
        <NouveauMenu
          key={`${demande.modele}|${demande.depart ?? ''}|${demande.dossier ?? ''}`}
          liste={liste}
          dossiers={dossiers}
          modele={demande.modele}
          departInitial={demande.depart ?? ''}
          dossierInitial={demande.dossier ?? null}
          ouvrir={ouvrir}
          fermer={() => setDemande(null)}
        />
      )}
    </div>
  )
}

/**
 * En-tête du module : le titre, et à droite les espaces de la cuisine — le
 * menu ouvert, le rangement (dossiers et modèles), les recettes, l'horaire
 * du personnel.
 */
function EnteteModule({ espace, modeleOuvert }: { espace: Espace; modeleOuvert: boolean }) {
  const espaces = [
    { espace: 'menu' as const, chemin: '/cuisine', libelle: modeleOuvert ? 'Modèle ouvert' : 'Menu', icone: modeleOuvert ? <IconeModele /> : <IconeMenu /> },
    { espace: 'dossiers' as const, chemin: '/cuisine/dossiers', libelle: 'Dossiers et modèles', icone: <IconeDossier /> },
    { espace: 'recettes' as const, chemin: '/cuisine/recettes', libelle: 'Recettes', icone: <IconeRecettes /> },
    { espace: 'horaire' as const, chemin: '/cuisine/horaire', libelle: 'Horaire du personnel', icone: <IconePersonnel /> },
  ]
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
      <h1 className="text-2xl font-semibold">Cuisine</h1>
      <nav aria-label="Espaces de la cuisine" className="ml-auto inline-flex flex-wrap rounded-lg border border-pierre-200 bg-pierre-100 p-0.5">
        {espaces.map((e) => (
          <Link
            key={e.espace}
            to={e.chemin}
            aria-current={espace === e.espace ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
              espace === e.espace ? 'bg-white text-pierre-900 shadow-sm' : 'text-pierre-600 hover:text-pierre-900'
            }`}
          >
            {e.icone}
            {e.libelle}
          </Link>
        ))}
      </nav>
    </div>
  )
}

// ------------------------------------------------------------------
// Onglets (adresses absolues : voir la note dans modules/embarcations/index.tsx)
// ------------------------------------------------------------------

interface Onglet {
  chemin: string
  libelle: string
  fin?: boolean
}

const ONGLETS_MENU: Onglet[] = [
  { chemin: '/cuisine', libelle: 'Planificateur', fin: true },
  { chemin: '/cuisine/groupes', libelle: 'Groupes et diètes' },
  { chemin: '/cuisine/ajouts', libelle: 'Ajouts manuels' },
  { chemin: '/cuisine/sorties', libelle: 'Sorties' },
  { chemin: '/cuisine/commande', libelle: 'Commande' },
  { chemin: '/cuisine/feuille', libelle: 'Feuille de cuisine' },
]
const ONGLETS_RECETTES: Onglet[] = [
  { chemin: '/cuisine/recettes', libelle: 'Recettes' },
  { chemin: '/cuisine/ingredients', libelle: 'Ingrédients' },
]
const ONGLETS_HORAIRE: Onglet[] = [
  { chemin: '/cuisine/horaire', libelle: 'Semaine' },
  { chemin: '/cuisine/equipe', libelle: 'Équipe et réglages' },
]

const onglet = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium ${
    isActive ? 'border-foret-700 text-foret-800' : 'border-transparent text-pierre-500 hover:text-pierre-800'
  }`

function BarreOnglets({ onglets, libelle }: { onglets: Onglet[]; libelle: string }) {
  return (
    <nav aria-label={libelle} className="sans-barre mb-4 flex gap-6 overflow-x-auto border-b border-pierre-200 print:hidden">
      {onglets.map((o) => (
        <NavLink key={o.chemin} to={o.chemin} end={o.fin} className={onglet}>
          {o.libelle}
        </NavLink>
      ))}
    </nav>
  )
}

/** Onglets du menu ouvert. */
const Onglets = () => <BarreOnglets onglets={ONGLETS_MENU} libelle="Pages du menu" />

/** Espace à sous-onglets (recettes, horaire du personnel). */
function SousEspace({ onglets, libelle }: { onglets: Onglet[]; libelle: string }) {
  return (
    <>
      <BarreOnglets onglets={onglets} libelle={libelle} />
      <Outlet />
    </>
  )
}
