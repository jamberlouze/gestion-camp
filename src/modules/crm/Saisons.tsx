import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ui } from '@/lib/ui'
import { champPetit, ChoixConseiller, PuceStatut, Puces } from './commun'
import { useDonnees } from './contexte'
import { GENRES, STATUTS, type Genre, type Statut } from './types'

// Année scolaire : de septembre à août.
const MOIS = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8]
const NOMS = ['sept.', 'oct.', 'nov.', 'déc.', 'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août']
const rang = (mois: number) => MOIS.indexOf(mois)

/**
 * Quand les clients ont l'habitude de venir : une ligne par organisation,
 * une colonne par mois (année scolaire), les années où elle est venue dans
 * la case. Ce qui est prévu est en vert.
 */
export function Saisons() {
  const { calculs, auj } = useDonnees()
  const [statut, setStatut] = useState<Statut | ''>('')
  const [genre, setGenre] = useState<Genre | ''>('')
  const [qui, setQui] = useState<string | null>(null)

  const lignes = useMemo(() => {
    return calculs
      .filter((c) => c.passages.some((p) => p.confirme))
      .filter((c) => (!statut || c.statut === statut) && (!genre || c.org.genre === genre) && (!qui || c.org.conseiller_id === qui))
      .map((c) => {
        const cases = new Map<number, { annee: string; prevu: boolean }[]>()
        for (const p of c.passages) {
          if (!p.confirme) continue
          const m = Number(p.arrivee.slice(5, 7))
          cases.set(m, [...(cases.get(m) ?? []), { annee: p.arrivee.slice(2, 4), prevu: p.depart >= auj }])
        }
        const premier = Math.min(...[...cases.keys()].map(rang))
        return { c, cases, premier }
      })
      .sort((a, b) => a.premier - b.premier || a.c.org.nom.localeCompare(b.c.org.nom, 'fr'))
  }, [calculs, statut, genre, qui, auj])

  const moisCourant = Number(auj.slice(5, 7))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Puces options={STATUTS.filter((s) => s.id === 'client' || s.id === 'inactif')} valeur={statut} changer={setStatut} />
        <select aria-label="Type" className={champPetit} value={genre} onChange={(e) => setGenre(e.target.value as Genre | '')}>
          <option value="">Tous les types</option>
          {GENRES.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nom}
            </option>
          ))}
        </select>
        <ChoixConseiller valeur={qui} changer={setQui} vide="Tous les conseillers" />
      </div>

      <div className={`${ui.carte} overflow-x-auto`}>
        <table className="w-full min-w-[60rem] table-fixed text-sm">
          <colgroup>
            <col className="w-64" />
            {MOIS.map((m) => (
              <col key={m} />
            ))}
          </colgroup>
          <thead className="border-b border-pierre-200 bg-pierre-50 text-xs font-medium uppercase tracking-wide text-pierre-500">
            <tr>
              <th className="px-3 py-2 text-left">Organisation</th>
              {MOIS.map((m, i) => (
                <th key={m} className={`px-1 py-2 text-center ${m === moisCourant ? 'text-foret-800' : ''}`}>
                  {NOMS[i]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-pierre-100">
            {lignes.map(({ c, cases }) => (
              <tr key={c.org.id} className="hover:bg-pierre-50">
                <td className="truncate px-3 py-1.5">
                  <Link to={`/crm/o/${c.org.id}`} className="mr-2 font-medium text-pierre-900 hover:text-foret-800 hover:underline">
                    {c.org.nom}
                  </Link>
                  {c.statut === 'inactif' && <PuceStatut statut="inactif" />}
                </td>
                {MOIS.map((m) => (
                  <td key={m} className={`px-1 py-1.5 text-center ${m === moisCourant ? 'bg-foret-50/50' : ''}`}>
                    <div className="flex flex-wrap justify-center gap-0.5">
                      {(cases.get(m) ?? []).map((v, i) => (
                        <span
                          key={i}
                          title={v.prevu ? 'Prévu' : 'Venu'}
                          className={`rounded px-1 text-xs tabular-nums ${v.prevu ? 'bg-foret-600 text-white' : 'bg-pierre-200 text-pierre-700'}`}
                        >
                          {v.annee}
                        </span>
                      ))}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {lignes.length === 0 && <p className="px-3 py-8 text-center text-sm text-pierre-500">Aucun séjour connu pour ces filtres.</p>}
      </div>
      <p className="text-xs text-pierre-500">
        Chaque case montre l'année (« 25 » = 2025) des séjours qui ont commencé ce mois-là. En vert : prévu. Séjours = base de réservations Airtable et
        visites ajoutées dans les fiches.
      </p>
    </div>
  )
}
