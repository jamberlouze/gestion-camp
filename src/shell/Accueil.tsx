import { Link } from 'react-router'
import { ui } from '@/lib/ui'
import { useAuth } from './auth'
import { estEntree, MODULES } from './modules'

export function Accueil() {
  const { profil, peutLire } = useAuth()
  const modules = MODULES.filter((m) => estEntree(m) && peutLire(m.id))

  return (
    <div>
      <h1 className="text-2xl font-semibold">Bonjour{profil?.nom ? `, ${profil.nom}` : ''}</h1>
      <p className="mt-1 text-sm text-pierre-500">Choisissez un outil.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <Link key={m.id} to={m.chemin} className={`${ui.carte} p-5 transition hover:border-foret-600 hover:bg-foret-50 focus-visible:border-foret-600 focus-visible:bg-foret-50`}>
            <div className="text-3xl">{m.icone}</div>
            <h2 className="mt-3 font-semibold">{m.nom}</h2>
            <p className="mt-1 text-sm text-pierre-500">{m.description}</p>
          </Link>
        ))}
        {modules.length === 0 && (
          <p className="text-sm text-pierre-500">
            Aucun module ne vous est encore attribué. Demandez l'accès à un administrateur.
          </p>
        )}
      </div>
    </div>
  )
}
