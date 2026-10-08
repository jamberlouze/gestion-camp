import { ui } from '@/lib/ui'
import { useDonnees } from './contexte'
import { useModifierRegle } from './donnees'
import { GENRES } from './types'

/** Règles générales de relance, par type d'organisation. */
export function Reglages() {
  const { regles, ecriture } = useDonnees()
  const modifier = useModifierRegle()
  const parType = GENRES.map((g) => ({ g, r: regles.find((x) => x.genre === g.id && !x.saison) }))

  return (
    <div className="max-w-2xl space-y-5">
      <section className={`${ui.carte} p-4`}>
        <h2 className="font-semibold text-pierre-900">Quand relancer après un séjour</h2>
        <p className="mb-3 mt-1 text-sm text-pierre-600">
          Après chaque séjour, une relance se crée toute seule pour le conseiller du client, tant de mois avant la date où il devrait revenir (un an plus
          tard, ou deux pour un client qui vient une année sur deux). Les exceptions d'un client (ex. Dawson : automne et hiver différents) se règlent dans
          sa fiche.
        </p>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-pierre-100">
            {parType.map(({ g, r }) => (
              <tr key={g.id}>
                <td className="py-2">{g.nom}</td>
                <td className="py-2 text-right">
                  {r ? (
                    <select
                      aria-label={`Mois avant, ${g.nom}`}
                      className="rounded-lg border border-pierre-300 bg-white px-2 py-1"
                      value={r.mois_avant}
                      disabled={!ecriture}
                      onChange={(e) => modifier.mutate({ id: r.id, champs: { mois_avant: Number(e.target.value) } })}
                    >
                      {Array.from({ length: 13 }, (_, i) => i).map((n) => (
                        <option key={n} value={n}>
                          {n} mois avant
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-pierre-500">6 mois avant</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={`${ui.carte} p-4 text-sm text-pierre-700`}>
        <h2 className="mb-2 font-semibold text-pierre-900">Comment le statut est calculé</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="font-medium">Client</strong> : un séjour confirmé à venir, ou terminé depuis moins d'un an et demi (deux ans et demi s'il vient une
            année sur deux).
          </li>
          <li>
            <strong className="font-medium">Prospect</strong> : une demande de réservation en cours, ou contacté dans le démarchage.
          </li>
          <li>
            <strong className="font-medium">Client inactif</strong> : déjà venu, mais plus depuis.
          </li>
          <li>
            <strong className="font-medium">Cible</strong> : jamais venu, pas encore contacté.
          </li>
        </ul>
        <p className="mt-2 text-pierre-500">
          Les séjours viennent de la base de réservations Airtable (fiche › Informations › Client Airtable) et des visites passées ajoutées dans la fiche.
        </p>
      </section>
    </div>
  )
}
