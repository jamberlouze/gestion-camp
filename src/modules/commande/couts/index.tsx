import { useMemo, useState } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { aujourdhui } from '@/shell/pokes'
import { useMenus } from '../donnees'
import { anneeDe, menuDansAnnee, nomAnnee, parDebut } from './calcul'
import { ContexteCouts, type Couts } from './contexte'
import {
  useAnnees,
  useCorrections,
  useFactures,
  useGroupesManuels,
  useMenusDates,
  usePostes,
  useSalaires,
  useSemaines,
} from './donnees'
import { Assiettes } from './Assiettes'
import { Factures } from './Factures'
import { NouvelleAnnee } from './NouvelleAnnee'
import { Salaires } from './Salaires'
import { Semaines } from './Semaines'
import { TableauAnnee, TableauEte } from './Tableau'

const CLE_ANNEE = 'cuisine-couts-annee'
const lireAnnee = () => {
  try {
    const v = Number(localStorage.getItem(CLE_ANNEE))
    return Number.isInteger(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

const ONGLETS = [
  { chemin: '/cuisine/couts', libelle: 'Année', fin: true },
  { chemin: '/cuisine/couts/ete', libelle: "Camp d'été" },
  { chemin: '/cuisine/couts/factures', libelle: 'Factures' },
  { chemin: '/cuisine/couts/assiettes', libelle: 'Assiettes' },
  { chemin: '/cuisine/couts/salaires', libelle: 'Salaires' },
  { chemin: '/cuisine/couts/semaines', libelle: 'Semaines' },
]

const onglet = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium ${
    isActive ? 'border-foret-700 text-foret-800' : 'border-transparent text-pierre-500 hover:text-pierre-800'
  }`

/**
 * Coût par assiette : nourriture (factures) + salaires de la cuisine, divisés
 * par les assiettes servies, pour chaque période de l'année.
 */
export function EspaceCouts() {
  const ecriture = useAuth().peutEcrire('cuisine_couts')
  const annees = useAnnees()
  const semaines = useSemaines()
  const factures = useFactures()
  const salaires = useSalaires()
  const postes = usePostes()
  const groupes = useGroupesManuels()
  const corrections = useCorrections()
  const tousMenus = useMenus()
  const [choisie, setChoisie] = useState<number | null>(lireAnnee)
  const [nouvelle, setNouvelle] = useState(false)

  const liste = useMemo(() => annees.data ?? [], [annees.data])
  const parDefaut = liste.find((a) => a.annee === anneeDe(aujourdhui())) ?? liste.at(-1)
  const annee = liste.find((a) => a.annee === choisie) ?? parDefaut

  const menusAnnee = useMemo(
    () => (annee ? (tousMenus.data ?? []).filter((m) => menuDansAnnee(m, annee.annee)) : []),
    [tousMenus.data, annee],
  )
  const menus = useMenusDates(menusAnnee)

  const choisir = (a: number) => {
    setChoisie(a)
    try {
      localStorage.setItem(CLE_ANNEE, String(a))
    } catch {
      /* préférence non conservée */
    }
  }

  const requetes = [annees, semaines, factures, salaires, postes, groupes, corrections, tousMenus, menus]
  const erreur = requetes.find((r) => r.error)?.error
  const pret = requetes.every((r) => r.data)

  const contexte = useMemo<Couts | null>(() => {
    if (!pret || !annee) return null
    return {
      annee,
      annees: liste,
      semaines: semaines.data!.filter((s) => s.annee === annee.annee).sort(parDebut),
      factures: factures.data!,
      salaires: salaires.data!,
      postes: postes.data!,
      groupes: groupes.data!,
      corrections: corrections.data!,
      menus: menus.data!,
      ecriture,
    }
  }, [pret, annee, liste, semaines.data, factures.data, salaires.data, postes.data, groupes.data, corrections.data, menus.data, ecriture])

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-3 print:hidden">
        <nav aria-label="Coût par assiette" className="sans-barre flex flex-1 gap-6 overflow-x-auto border-b border-pierre-200">
          {ONGLETS.map((o) => (
            <NavLink key={o.chemin} to={o.chemin} end={o.fin} className={onglet}>
              {o.libelle}
            </NavLink>
          ))}
        </nav>
        {liste.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-sm text-pierre-600" htmlFor="couts-annee">
              Année
            </label>
            <select id="couts-annee" className={`${ui.champ} w-auto py-1.5`} value={annee?.annee ?? ''} onChange={(e) => choisir(Number(e.target.value))}>
              {liste.map((a) => (
                <option key={a.annee} value={a.annee}>
                  {nomAnnee(a.annee)}
                </option>
              ))}
            </select>
            {ecriture && (
              <button className={`${ui.boutonSecondaire} py-1.5`} onClick={() => setNouvelle(true)}>
                + Année
              </button>
            )}
          </div>
        )}
      </div>
      <BandeauErreurs racine="cuisine-couts" />
      {erreur ? (
        <p className={ui.erreur}>{messageErreur(erreur)}</p>
      ) : !annees.data ? (
        <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
      ) : !annee ? (
        <div className={`${ui.carte} p-10 text-center text-sm text-pierre-500`}>
          <p>Aucune année pour l'instant.</p>
          {ecriture && (
            <button className={`${ui.bouton} mt-4`} onClick={() => setNouvelle(true)}>
              + Créer une année
            </button>
          )}
        </div>
      ) : !contexte ? (
        <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
      ) : (
        <ContexteCouts.Provider value={contexte}>
          <Routes>
            <Route index element={<TableauAnnee />} />
            <Route path="ete" element={<TableauEte />} />
            <Route path="factures" element={<Factures />} />
            <Route path="assiettes" element={<Assiettes />} />
            <Route path="salaires" element={<Salaires />} />
            <Route path="semaines" element={<Semaines />} />
            <Route path="*" element={<Navigate to="/cuisine/couts" replace />} />
          </Routes>
        </ContexteCouts.Provider>
      )}
      {nouvelle && (
        <NouvelleAnnee
          existantes={liste.map((a) => a.annee)}
          fermer={() => setNouvelle(false)}
          creee={(a) => {
            choisir(a)
            setNouvelle(false)
          }}
        />
      )}
    </div>
  )
}
