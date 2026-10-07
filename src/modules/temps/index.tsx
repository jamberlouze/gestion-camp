import { Link, Navigate, NavLink, Route, Routes, useParams, useSearchParams } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { ChoixPeriode } from './commun'
import { usePeriode } from './outils'
import { nomDe, useMembres } from './donnees'
import { FeuilleEmployes } from './Employes'
import { Feuille } from './Feuille'
import { TableauDeBord } from './TableauDeBord'

const onglet = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium ${
    isActive ? 'border-foret-700 text-foret-800' : 'border-transparent text-pierre-500 hover:text-pierre-800'
  }`

/**
 * Feuilles de temps de la direction. Chacun ne voit que la sienne ; les
 * admins ont en plus le tableau de bord et les feuilles de tous. La base
 * applique la même règle (schéma temps) : l'app ne fait que suivre.
 * Onglet Employés : feuille partagée des heures des employés (hors
 * direction), que toute la direction remplit.
 */
export default function ModuleTemps() {
  const { estAdmin } = useAuth()
  // La période choisie suit d'un onglet à l'autre.
  const [params] = useSearchParams()
  const periode = params.get('periode')
  const suffixe = periode ? `?periode=${periode}` : ''
  return (
    <>
      <h1 className="text-2xl font-semibold print:hidden">Feuilles de temps</h1>
      {/* Adresses absolues : voir Embarcations. */}
      <nav className="sans-barre mb-4 mt-3 flex gap-6 overflow-x-auto border-b border-pierre-200 print:hidden">
        <NavLink to={`/temps${suffixe}`} end className={onglet}>
          Ma feuille
        </NavLink>
        <NavLink to={`/temps/employes${suffixe}`} className={onglet}>
          Employés
        </NavLink>
        {estAdmin && (
          <NavLink to={`/temps/tableau${suffixe}`} className={onglet}>
            Tableau de bord
          </NavLink>
        )}
      </nav>
      <BandeauErreurs racine="temps" />
      <Routes>
        <Route index element={<MaFeuille />} />
        <Route path="employes" element={<FeuilleEmployes />} />
        <Route path="tableau" element={estAdmin ? <TableauDeBord /> : <Navigate to="/temps" replace />} />
        <Route path="personne/:id" element={estAdmin ? <FeuillePersonne /> : <Navigate to="/temps" replace />} />
        <Route path="*" element={<Navigate to="/temps" replace />} />
      </Routes>
    </>
  )
}

function MaFeuille() {
  const { profil } = useAuth()
  const [debut, setDebut] = usePeriode()
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <ChoixPeriode debut={debut} onChange={setDebut} />
        <button className={ui.boutonSecondaire} onClick={() => window.print()}>
          Imprimer
        </button>
      </div>
      <Feuille key={debut} userId={profil!.id} debut={debut} />
    </div>
  )
}

/** Admin : la feuille de quelqu'un d'autre, ouverte depuis le tableau de bord. */
function FeuillePersonne() {
  const { id = '' } = useParams()
  const [debut, setDebut] = usePeriode()
  const membres = useMembres()
  const personne = membres.data?.find((m) => m.id === id)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 print:hidden">
        <Link to={`/temps/tableau?periode=${debut}`} className="text-sm text-foret-700 underline">
          ← Tableau de bord
        </Link>
        <h2 className="text-lg font-semibold">{membres.data ? nomDe(personne) : '…'}</h2>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <ChoixPeriode debut={debut} onChange={setDebut} />
        <button className={ui.boutonSecondaire} onClick={() => window.print()}>
          Imprimer
        </button>
      </div>
      <Feuille key={`${id}-${debut}`} userId={id} debut={debut} />
    </div>
  )
}
