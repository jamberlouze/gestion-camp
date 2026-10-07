import { NavLink, Outlet } from 'react-router'
import type { Employe, Groupe, Semaine } from '@/lib/types'
import { TableauReferentiel } from './TableauReferentiel'

const onglet = ({ isActive }: { isActive: boolean }) =>
  `border-b-2 px-1 pb-2 text-sm font-medium ${
    isActive ? 'border-foret-700 text-foret-800' : 'border-transparent text-pierre-500 hover:text-pierre-800'
  }`

/** Données partagées par tous les modules. */
export function Referentiel() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Référentiel commun</h1>
      <p className="mt-1 text-sm text-pierre-500">Données partagées par tous les modules.</p>
      <nav className="mb-5 mt-4 flex gap-6 border-b border-pierre-200">
        <NavLink to="groupes" className={onglet}>
          Groupes de campeurs
        </NavLink>
        <NavLink to="employes" className={onglet}>
          Employés
        </NavLink>
        <NavLink to="semaines" className={onglet}>
          Semaines de camp
        </NavLink>
      </nav>
      <Outlet />
    </div>
  )
}

export function Groupes() {
  return (
    <TableauReferentiel<Groupe>
      schema="core"
      table="groupes"
      tri="ordre"
      nomLigne={(g) => g.nom}
      valeursDefaut={{ effectif: 0, ordre: 0, actif: true }}
      colonnes={[
        { champ: 'nom', libelle: 'Nom', type: 'texte', requis: true },
        { champ: 'tranche_age', libelle: 'Âge', type: 'texte' },
        { champ: 'effectif', libelle: 'Effectif', type: 'nombre' },
        { champ: 'couleur', libelle: 'Couleur', type: 'couleur' },
        { champ: 'ordre', libelle: 'Ordre', type: 'nombre' },
        { champ: 'actif', libelle: 'Actif', type: 'booleen' },
      ]}
    />
  )
}

export function Employes() {
  return (
    <>
      <p className="mb-4 rounded-lg bg-pierre-100 px-3 py-2 text-sm text-pierre-700">
        La source officielle des employés est Airtable (base « Inscriptions Camp de vacances »). Une
        synchronisation automatique viendra plus tard ; en attendant, la liste se gère ici.
      </p>
      <TableauReferentiel<Employe>
        schema="core"
        table="employes"
        tri="surnom"
        nomLigne={(e) => e.surnom}
        valeursDefaut={{ specialites: [], actif: true }}
        colonnes={[
          { champ: 'surnom', libelle: 'Surnom', type: 'texte', requis: true },
          { champ: 'nom_complet', libelle: 'Nom complet', type: 'texte' },
          { champ: 'courriel', libelle: 'Courriel', type: 'texte' },
          { champ: 'poste', libelle: 'Poste', type: 'texte' },
          { champ: 'secteur', libelle: 'Secteur', type: 'texte' },
          { champ: 'specialites', libelle: 'Spécialités', type: 'specialites' },
          { champ: 'actif', libelle: 'Actif', type: 'booleen' },
        ]}
      />
    </>
  )
}

export function Semaines() {
  return (
    <TableauReferentiel<Semaine>
      schema="core"
      table="semaines"
      tri="date_debut"
      nomLigne={(s) => s.nom}
      valeursDefaut={{}}
      colonnes={[
        { champ: 'nom', libelle: 'Nom', type: 'texte', requis: true },
        { champ: 'date_debut', libelle: 'Début', type: 'date', requis: true },
        { champ: 'date_fin', libelle: 'Fin', type: 'date', requis: true },
      ]}
    />
  )
}
