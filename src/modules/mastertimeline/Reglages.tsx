import { Link, NavLink, Navigate, Route, Routes } from 'react-router'
import { TableauReferentiel } from '@/core/TableauReferentiel'
import { useAuth } from '@/shell/auth'
import { useEntreprises } from './donnees'
import type { Etiquette, Fournisseur, Projet } from './types'

// Même apparence que le Référentiel (demande de Maxime du 2026-10-14) : mêmes
// tableaux (TableauReferentiel), mêmes boutons Modifier / Supprimer, mêmes
// confirmations. Choix des listes en boutons groupés, comme « Regrouper par ».
const onglet = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap rounded-md px-2.5 py-1 ${isActive ? 'bg-foret-100 font-medium text-foret-800' : 'text-pierre-600 hover:text-pierre-900'}`

const note = 'mb-4 rounded-lg bg-pierre-100 px-3 py-2 text-sm text-pierre-700'

/**
 * Listes du module : fournisseurs, projets, étiquettes. Les compagnies ne se
 * gèrent qu'à un endroit : Référentiel › Compagnies (l'onglet Entreprises
 * d'ici est retiré, son adresse y mène) ; les responsables sont les comptes
 * de l'app qui écrivent dans le module (page Utilisateurs), comme dans
 * Travaux et Achats.
 */
export function Reglages() {
  const { estAdmin, estDirection } = useAuth()
  const entreprises = useEntreprises()
  const optionsEntreprises = (entreprises.data ?? []).map((e) => ({ id: e.id, libelle: e.nom, court: e.abreviation, couleur: e.couleur }))
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <nav className="sans-barre inline-flex max-w-full overflow-x-auto rounded-lg border border-pierre-300 bg-white p-0.5 text-sm" aria-label="Listes du module">
          <NavLink to="/mastertimeline/reglages/fournisseurs" className={onglet}>
            Fournisseurs
          </NavLink>
          <NavLink to="/mastertimeline/reglages/projets" className={onglet}>
            Projets
          </NavLink>
          <NavLink to="/mastertimeline/reglages/etiquettes" className={onglet}>
            Étiquettes
          </NavLink>
        </nav>
        <p className="text-sm text-pierre-500">
          Compagnies :{' '}
          {estDirection ? (
            <Link to="/referentiel/compagnies" className="text-foret-700 underline">
              Référentiel › Compagnies
            </Link>
          ) : (
            'Référentiel › Compagnies (direction)'
          )}
          {' · '}Responsables : les comptes qui écrivent dans Mastertimeline (
          {estAdmin ? (
            <Link to="/utilisateurs" className="text-foret-700 underline">
              Utilisateurs
            </Link>
          ) : (
            'Utilisateurs, admins'
          )}
          )
        </p>
      </div>
      <Routes>
        <Route index element={<Navigate to="fournisseurs" replace />} />
        {/* Ancienne liste du module : les responsables sont les comptes de l'app. */}
        <Route path="responsables" element={<Navigate to="/mastertimeline/responsables" replace />} />
        <Route
          path="fournisseurs"
          element={
            <>
              <p className={note}>
                Liste commune : Mastertimeline, Travaux et Achats s'en servent (on la modifie seulement ici).
              </p>
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
            </>
          }
        />
        {/* Ancien onglet Entreprises : les compagnies sont dans le référentiel commun. */}
        <Route path="entreprises" element={estDirection ? <Navigate to="/referentiel/compagnies" replace /> : <Navigate to="/mastertimeline/reglages/fournisseurs" replace />} />
        <Route
          path="projets"
          element={
            <>
              <p className={note}>
                Un projet regroupe des tâches qui reviennent chaque année (les chantiers ponctuels sont dans le module Travaux). Les entreprises cochées sont celles où le projet est offert dans la fiche d'une tâche (aucune
                = toutes). Supprimer un projet ici garde ses tâches, sans projet.
              </p>
              <TableauReferentiel<Projet>
                schema="mastertimeline"
                table="projets"
                tri="ordre"
                nomLigne={(p) => p.nom}
                valeursDefaut={{ ordre: 0, entreprise_ids: [] }}
                colonnes={[
                  { champ: 'nom', libelle: 'Nom', type: 'texte', requis: true },
                  { champ: 'entreprise_ids', libelle: 'Entreprises', type: 'choix', options: optionsEntreprises },
                  { champ: 'couleur', libelle: 'Couleur', type: 'couleur' },
                  { champ: 'ordre', libelle: 'Ordre', type: 'nombre' },
                ]}
              />
            </>
          }
        />
        <Route
          path="etiquettes"
          element={
            <>
              <p className={note}>
                Les étiquettes se posent sur les tâches dans leur fiche (une tâche peut en avoir plusieurs) et servent de filtre dans
                toutes les vues : Corvée, Woofing… Supprimer une étiquette l'enlève des tâches qui la portaient.
              </p>
              <TableauReferentiel<Etiquette>
                schema="mastertimeline"
                table="etiquettes"
                tri="ordre"
                nomLigne={(e) => e.nom}
                valeursDefaut={{ ordre: 0 }}
                colonnes={[
                  { champ: 'nom', libelle: 'Nom', type: 'texte', requis: true },
                  { champ: 'couleur', libelle: 'Couleur', type: 'couleur' },
                  { champ: 'ordre', libelle: 'Ordre', type: 'nombre' },
                ]}
              />
            </>
          }
        />
      </Routes>
    </div>
  )
}
