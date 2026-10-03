import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router'
import { Employes, Groupes, Referentiel, Semaines } from '@/core/Referentiel'
import { Utilisateurs } from '@/core/Utilisateurs'
import { configManquante } from '@/lib/supabase'
import { Accueil } from '@/shell/Accueil'
import { useAuth } from '@/shell/auth'
import { Chargement, GardeAdmin, GardeDirection, GardeModule } from '@/shell/Gardes'
import { Layout } from '@/shell/Layout'
import { PageConnexion } from '@/shell/PageConnexion'

// Chaque module est chargé à la demande : son code n'est téléchargé
// qu'à la première visite.
const Embarcations = lazy(() => import('@/modules/embarcations'))
const Cuisine = lazy(() => import('@/modules/commande'))
const Horaire = lazy(() => import('@/modules/horaire'))
const Mastertimeline = lazy(() => import('@/modules/mastertimeline'))
const Subventions = lazy(() => import('@/modules/subventions'))
const Vigie = lazy(() => import('@/modules/vigie'))

export default function App() {
  const { session, profil, chargement, erreurProfil } = useAuth()

  if (configManquante) {
    return (
      <div className="p-8 text-sm">
        Configuration manquante : copiez <code>.env.example</code> vers <code>.env.local</code> et
        remplissez les valeurs Supabase.
      </div>
    )
  }
  if (chargement) return <Chargement />
  if (!session) return <PageConnexion />
  if (erreurProfil) return <ProfilIndisponible />
  if (!profil) return <CompteInactif />

  return (
    <Suspense fallback={<Chargement />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Accueil />} />
          <Route path="embarcations/*" element={<GardeModule module="embarcations"><Embarcations /></GardeModule>} />
          <Route path="cuisine/*" element={<GardeModule module="commande"><Cuisine /></GardeModule>} />
          {/* Ancienne adresse du module (favoris). */}
          <Route path="commande/*" element={<AncienneCommande />} />
          <Route path="horaire/*" element={<GardeModule module="horaire"><Horaire /></GardeModule>} />
          <Route path="mastertimeline/*" element={<GardeModule module="mastertimeline"><Mastertimeline /></GardeModule>} />
          <Route path="subventions/*" element={<GardeModule module="subventions"><Subventions /></GardeModule>} />
          <Route path="vigie/*" element={<GardeModule module="vigie"><Vigie /></GardeModule>} />
          <Route path="referentiel" element={<GardeDirection><Referentiel /></GardeDirection>}>
            <Route index element={<Navigate to="groupes" replace />} />
            <Route path="groupes" element={<Groupes />} />
            <Route path="employes" element={<Employes />} />
            <Route path="semaines" element={<Semaines />} />
          </Route>
          <Route path="utilisateurs" element={<GardeAdmin><Utilisateurs /></GardeAdmin>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

/**
 * /commande/… → /cuisine/… (même page) ; l'ancien planificateur est
 * maintenant la page d'accueil du module.
 */
function AncienneCommande() {
  const page = useParams()['*'] ?? ''
  return <Navigate to={page && page !== 'planificateur' ? `/cuisine/${page}` : '/cuisine'} replace />
}

function ProfilIndisponible() {
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <p className="text-lg font-medium">Impossible de charger votre profil</p>
      <p className="mt-1 text-sm text-pierre-500">
        Vérifiez la connexion Internet. La première ouverture de l'app doit se faire avec du réseau.
      </p>
      <button className="mt-4 text-sm text-foret-700 underline" onClick={() => location.reload()}>
        Réessayer
      </button>
    </div>
  )
}

function CompteInactif() {
  const { deconnexion } = useAuth()
  return (
    <div className="mx-auto max-w-md p-8 text-center">
      <p className="text-lg font-medium">Compte désactivé</p>
      <p className="mt-1 text-sm text-pierre-500">Communiquez avec un administrateur.</p>
      <button className="mt-4 text-sm text-foret-700 underline" onClick={deconnexion}>
        Déconnexion
      </button>
    </div>
  )
}
