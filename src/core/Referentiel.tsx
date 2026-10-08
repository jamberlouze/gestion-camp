import { NavLink, Outlet } from 'react-router'
import { useListe } from '@/lib/donnees'
import type { Employe, Entreprise, Groupe, Semaine } from '@/lib/types'
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
        <NavLink to="employes" className={onglet}>
          Employés
        </NavLink>
        <NavLink to="compagnies" className={onglet}>
          Compagnies
        </NavLink>
        <NavLink to="groupes" className={onglet}>
          Groupes de campeurs
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
  // Compagnies de l'employé : une ligne par compagnie dans la feuille des employés (Feuilles de temps).
  const entreprises = useListe<Entreprise>('core', 'entreprises', 'ordre')
  const options = (entreprises.data ?? []).filter((e) => e.actif).map((e) => ({ id: e.id, libelle: e.nom, court: e.abreviation, couleur: e.couleur }))
  return (
    <>
      <p className="mb-4 rounded-lg bg-pierre-100 px-3 py-2 text-sm text-pierre-700">
        La source officielle des employés est Airtable (base « Inscriptions Camp de vacances »). Une
        synchronisation automatique viendra plus tard ; en attendant, la liste se gère ici.
      </p>
      <p className="mb-4 rounded-lg bg-pierre-100 px-3 py-2 text-sm text-pierre-700">
        <strong>Remplit sa feuille</strong> : l'employé entre lui-même ses heures dans Feuilles de temps et les
        soumet à la direction. Il se connecte avec le courriel de sa fiche (son compte doit avoir été invité, voir
        Utilisateurs). <strong>Woofing</strong> : ajoute les heures de woofing, non payées, à sa feuille.
      </p>
      <TableauReferentiel<Employe>
        schema="core"
        table="employes"
        tri="surnom"
        nomLigne={(e) => e.surnom}
        valeursDefaut={{ entreprise_ids: [], feuille_propre: false, woofing: false, actif: true }}
        colonnes={[
          { champ: 'surnom', libelle: 'Nom de camp', type: 'texte', requis: true },
          { champ: 'prenom', libelle: 'Prénom', type: 'texte' },
          { champ: 'nom_famille', libelle: 'Nom de famille', type: 'texte' },
          { champ: 'entreprise_ids', libelle: 'Compagnies', type: 'choix', options },
          { champ: 'secteur', libelle: 'Secteur', type: 'texte' },
          { champ: 'poste', libelle: 'Poste', type: 'texte' },
          { champ: 'courriel', libelle: 'Courriel', type: 'texte' },
          // Feuilles de temps : l'employé coché remplit sa feuille lui-même (connexion avec ce courriel).
          { champ: 'feuille_propre', libelle: 'Remplit sa feuille', type: 'booleen' },
          { champ: 'woofing', libelle: 'Woofing', type: 'booleen' },
          { champ: 'actif', libelle: 'Actif', type: 'booleen' },
        ]}
      />
    </>
  )
}

/** Compagnies du groupe, partagées par Mastertimeline, Achats et les Feuilles de temps. */
export function Compagnies() {
  return (
    <TableauReferentiel<Entreprise>
      schema="core"
      table="entreprises"
      tri="ordre"
      nomLigne={(e) => e.nom}
      valeursDefaut={{ ordre: 0, actif: true }}
      colonnes={[
        { champ: 'nom', libelle: 'Nom', type: 'texte', requis: true },
        { champ: 'abreviation', libelle: 'Abréviation', type: 'texte' },
        { champ: 'description', libelle: 'Description', type: 'texte' },
        { champ: 'couleur', libelle: 'Couleur', type: 'couleur' },
        { champ: 'ordre', libelle: 'Ordre', type: 'nombre' },
        { champ: 'actif', libelle: 'Active', type: 'booleen' },
      ]}
    />
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
