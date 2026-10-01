import { NavLink, Navigate, Route, Routes } from 'react-router'
import { TableauReferentiel } from '@/core/TableauReferentiel'
import { useEntreprises } from './donnees'
import type { Entreprise, Fournisseur, Projet, Responsable } from './types'

const onglet = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-pierre-200 text-pierre-900' : 'text-pierre-600 hover:bg-pierre-100'}`

/** Listes du module : responsables, fournisseurs, entreprises, projets. */
export function Reglages() {
  const entreprises = useEntreprises()
  const optionsEntreprises = (entreprises.data ?? []).map((e) => ({ id: e.id, libelle: e.nom }))
  return (
    <div>
      <nav className="mb-4 flex flex-wrap gap-1">
        <NavLink to="/mastertimeline/reglages/responsables" className={onglet}>
          Responsables
        </NavLink>
        <NavLink to="/mastertimeline/reglages/fournisseurs" className={onglet}>
          Fournisseurs
        </NavLink>
        <NavLink to="/mastertimeline/reglages/entreprises" className={onglet}>
          Entreprises
        </NavLink>
        <NavLink to="/mastertimeline/reglages/projets" className={onglet}>
          Projets
        </NavLink>
      </nav>
      <Routes>
        <Route index element={<Navigate to="responsables" replace />} />
        <Route
          path="responsables"
          element={
            <>
              <p className="mb-4 rounded-lg bg-pierre-100 px-3 py-2 text-sm text-pierre-700">
                Les personnes qui reçoivent des tâches. Le courriel servira au rappel du 1er du mois. Pour passer toutes les tâches
                de quelqu'un à une autre personne, utilisez l'onglet Responsables du module.
              </p>
              <TableauReferentiel<Responsable>
                schema="mastertimeline"
                table="responsables"
                tri="nom"
                nomLigne={(r) => r.nom}
                valeursDefaut={{ actif: true }}
                colonnes={[
                  { champ: 'nom', libelle: 'Nom', type: 'texte', requis: true },
                  { champ: 'courriel', libelle: 'Courriel', type: 'texte' },
                  { champ: 'actif', libelle: 'Actif', type: 'booleen' },
                ]}
              />
            </>
          }
        />
        <Route
          path="fournisseurs"
          element={
            <TableauReferentiel<Fournisseur>
              schema="mastertimeline"
              table="fournisseurs"
              tri="nom"
              nomLigne={(f) => f.nom}
              valeursDefaut={{}}
              colonnes={[
                { champ: 'nom', libelle: 'Nom', type: 'texte', requis: true },
                { champ: 'personne_ressource', libelle: 'Personne', type: 'texte' },
                { champ: 'telephone', libelle: 'Téléphone', type: 'texte' },
                { champ: 'courriel', libelle: 'Courriel', type: 'texte' },
                { champ: 'site_web', libelle: 'Site web', type: 'texte' },
                { champ: 'service', libelle: 'Service', type: 'texte' },
                { champ: 'notes', libelle: 'Notes', type: 'texte' },
              ]}
            />
          }
        />
        <Route
          path="entreprises"
          element={
            <TableauReferentiel<Entreprise>
              schema="mastertimeline"
              table="entreprises"
              tri="ordre"
              nomLigne={(e) => e.nom}
              valeursDefaut={{ ordre: 0, actif: true }}
              colonnes={[
                { champ: 'nom', libelle: 'Nom', type: 'texte', requis: true },
                { champ: 'couleur', libelle: 'Couleur', type: 'couleur' },
                { champ: 'ordre', libelle: 'Ordre', type: 'nombre' },
                { champ: 'actif', libelle: 'Active', type: 'booleen' },
              ]}
            />
          }
        />
        <Route
          path="projets"
          element={
            <>
              <p className="mb-4 rounded-lg bg-pierre-100 px-3 py-2 text-sm text-pierre-700">
                Un projet annuel regroupe des tâches qui reviennent chaque année ; un projet ponctuel se termine (il se gère aussi
                dans l'onglet Projets). Les entreprises cochées sont celles où le projet est offert dans la fiche d'une tâche (aucune
                = toutes). Supprimer un projet ici garde ses tâches, sans projet.
              </p>
              <TableauReferentiel<Projet>
                schema="mastertimeline"
                table="projets"
                tri="ordre"
                nomLigne={(p) => p.nom}
                valeursDefaut={{ ordre: 0, ponctuel: false, entreprise_ids: [] }}
                colonnes={[
                  { champ: 'nom', libelle: 'Nom', type: 'texte', requis: true },
                  { champ: 'entreprise_ids', libelle: 'Entreprises', type: 'choix', options: optionsEntreprises },
                  { champ: 'couleur', libelle: 'Couleur', type: 'couleur' },
                  { champ: 'ordre', libelle: 'Ordre', type: 'nombre' },
                  { champ: 'ponctuel', libelle: 'Ponctuel', type: 'booleen' },
                  { champ: 'date_cible', libelle: 'Date cible', type: 'date' },
                ]}
              />
            </>
          }
        />
      </Routes>
    </div>
  )
}
