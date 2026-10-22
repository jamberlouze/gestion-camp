import { Link, useParams } from 'react-router'
import { ui } from '@/lib/ui'
import { useTitreImpression } from '@/lib/useTitreImpression'
import { useAuth } from '@/shell/auth'
import { useDonnees } from './contexte'
import { useFiches } from './donnees'
import { fichesManquantes, libelleDiete, nomFiche, rapportCuisine } from './fiches'
import { dateLongue, nomForfait, periode } from './format'
import { DIETES, type Diete } from './types'

const ORDRE_DIETES = Object.keys(DIETES) as Diete[]

/**
 * Rapport allergies et diètes pour la cuisine (/reservations/r/<id>/allergies),
 * à imprimer : seulement ce qui compte pour les repas (allergies, Epipen,
 * diètes particulières), jamais le reste de la santé. Accès « Fiches
 * participants » (reservations_sante) ; rien n'est gardé sur l'appareil.
 */
export function RapportAllergies() {
  const { id } = useParams()
  const { parId, auj } = useDonnees()
  const { peutLire } = useAuth()
  const r = id ? parId.get(id) : undefined
  const voit = peutLire('reservations_sante')
  const fiches = useFiches(r?.id ?? '', voit && !!r)
  useTitreImpression(r ? `Allergies et diètes - ${r.numero} - ${r.nom}` : null)

  if (!r) {
    return (
      <p className="py-8 text-center text-sm text-pierre-500">
        Réservation introuvable.{' '}
        <Link to="/reservations" className="text-foret-700 underline">
          Retour à la liste
        </Link>
      </p>
    )
  }

  const retour = (
    <Link to={`/reservations/r/${r.id}`} className="text-sm text-pierre-500 hover:text-pierre-800">
      ← {r.numero} {r.nom}
    </Link>
  )
  if (!voit) {
    return (
      <div className="space-y-3">
        {retour}
        <p className="text-sm text-pierre-600">Ce rapport est réservé à l’accès « Fiches participants ».</p>
      </div>
    )
  }

  const liste = fiches.data ?? []
  const rapport = rapportCuisine(liste, ORDRE_DIETES)
  const attendues = (r.nb_participants ?? 0) + (r.nb_accompagnateurs ?? 0)
  const manquantes = fichesManquantes(liste.length, attendues)
  const particulieres = rapport.dietes.reduce((n, d) => n + d.fiches.length, 0)
  const effacees = liste.length - rapport.lues

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        {retour}
        <button className={`${ui.bouton} ml-auto`} onClick={() => window.print()} disabled={!fiches.data}>
          Imprimer
        </button>
      </div>

      {fiches.error ? (
        <p className={ui.erreur}>{fiches.error.message}</p>
      ) : !fiches.data ? (
        <p className="py-8 text-center text-sm text-pierre-500">Chargement des fiches…</p>
      ) : (
        <article className="space-y-6 text-pierre-900 print:space-y-4 print:text-[10.5pt] print:leading-snug print:text-black">
          <header className="space-y-1 border-b border-pierre-200 pb-3">
            <p className="text-xs uppercase tracking-wide text-pierre-500">Rapport pour la cuisine · allergies et diètes · imprimé le {dateLongue(auj)}</p>
            <h2 className="text-xl font-semibold">
              {r.numero} — {r.nom}
            </h2>
            <p className="text-sm text-pierre-700">
              {nomForfait(r)} · {periode(r)} · {r.nb_participants ?? 0} élève(s) et {r.nb_accompagnateurs ?? 0} accompagnateur(s)
            </p>
            <p className="text-sm">
              <span className="font-medium">{liste.length}</span> fiche(s) reçue(s) sur {attendues} attendue(s)
              {manquantes > 0 && <span className="font-medium text-amber-800 print:text-black"> · {manquantes} manquante(s) : à vérifier à l’arrivée</span>}
            </p>
            {effacees > 0 && <p className="text-xs text-pierre-500">{effacees} fiche(s) déjà effacée(s) (Loi 25) : rien à lire.</p>}
          </header>

          <section className="space-y-2">
            <h3 className="text-base font-semibold">Diètes</h3>
            <div className="flex flex-wrap gap-2 text-sm">
              {rapport.dietes.map((d) => (
                <span key={d.diete} className="rounded-full border border-foret-200 bg-foret-50 px-2.5 py-0.5 font-medium text-foret-800 print:[print-color-adjust:exact]">
                  {DIETES[d.diete]} : {d.fiches.length}
                </span>
              ))}
              <span className="rounded-full border border-pierre-200 px-2.5 py-0.5 text-pierre-700">Régulière : {rapport.lues - particulieres}</span>
              {manquantes > 0 && <span className="rounded-full border border-dashed border-amber-300 px-2.5 py-0.5 text-amber-800">Sans fiche : {manquantes}</span>}
            </div>
            {rapport.dietes.length > 0 && (
              <table className="w-full text-sm">
                <thead className="border-b border-pierre-200 text-left text-xs uppercase tracking-wide text-pierre-500">
                  <tr>
                    <th className="py-1 pr-2 font-medium">Diète</th>
                    <th className="px-2 py-1 font-medium">Nom</th>
                    <th className="py-1 pl-2 font-medium">Classe ou groupe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pierre-100">
                  {rapport.dietes.flatMap((d) =>
                    d.fiches.map((f) => (
                      <tr key={f.id} className="break-inside-avoid align-top">
                        <td className="py-1 pr-2 font-medium">{libelleDiete(f, DIETES)}</td>
                        <td className="px-2 py-1">
                          {nomFiche(f)}
                          {f.genre === 'adulte' && <span className="text-pierre-500"> (adulte)</span>}
                        </td>
                        <td className="py-1 pl-2 text-pierre-700">{f.groupe}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-base font-semibold">Allergies ({rapport.allergies.length})</h3>
            {rapport.allergies.length === 0 ? (
              <p className="text-sm text-pierre-600">Aucune allergie déclarée dans les fiches reçues.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-pierre-200 text-left text-xs uppercase tracking-wide text-pierre-500">
                  <tr>
                    <th className="py-1 pr-2 font-medium">Nom</th>
                    <th className="px-2 py-1 font-medium">Classe ou groupe</th>
                    <th className="px-2 py-1 font-medium">Allergies</th>
                    <th className="py-1 pl-2 font-medium">Epipen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pierre-100">
                  {rapport.allergies.map((f) => (
                    <tr key={f.id} className="break-inside-avoid align-top">
                      <td className="py-1 pr-2 font-medium">
                        {nomFiche(f)}
                        {f.genre === 'adulte' && <span className="font-normal text-pierre-500"> (adulte)</span>}
                      </td>
                      <td className="px-2 py-1 text-pierre-700">{f.groupe}</td>
                      <td className="px-2 py-1 text-amber-900 print:text-black">{f.allergies}</td>
                      <td className="py-1 pl-2">{f.epipen ? <span className="font-semibold text-red-700 print:text-black">OUI</span> : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <p className="border-t border-pierre-200 pt-2 text-xs text-pierre-500">
            Renseignements de santé confidentiels (Loi 25) : pour la cuisine seulement, à ne pas afficher ; à détruire après le séjour.
          </p>
        </article>
      )}
    </div>
  )
}
