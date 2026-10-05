import { TableauReferentiel } from '@/core/TableauReferentiel'
import type { Proprietaire } from './types'

/** Compagnies du groupe qui peuvent posséder un véhicule. */
export function Reglages() {
  return (
    <div>
      <h2 className="mb-1 font-semibold">Compagnies propriétaires</h2>
      <p className="mb-4 rounded-lg bg-pierre-100 px-3 py-2 text-sm text-pierre-700">
        Les compagnies offertes dans la fiche d'un véhicule. Une compagnie qui possède encore un véhicule ne peut pas être supprimée.
      </p>
      <TableauReferentiel<Proprietaire>
        schema="vehicules"
        table="proprietaires"
        tri="ordre"
        nomLigne={(p) => p.nom}
        valeursDefaut={{ ordre: 0 }}
        colonnes={[
          { champ: 'nom', libelle: 'Nom', type: 'texte', requis: true },
          { champ: 'ordre', libelle: 'Ordre', type: 'nombre' },
        ]}
      />
    </div>
  )
}
