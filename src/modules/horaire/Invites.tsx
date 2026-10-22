import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { IconePlus } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { useSemaine } from './contexte'
import { dateDuJour, invitesDe } from './logique'

const dateLisible = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' })

/**
 * Horaire des invités spéciaux (gabarit « Horaire des invités » du Sheets
 * des classes nature) : ce qu'ils font à chaque repas et au jeu de soirée,
 * une case de texte par ligne et par jour de l'horaire.
 */
export function Invites() {
  const { etat, horaire, modifier, ecriture } = useSemaine()
  const { lignes, cases } = invitesDe(etat)
  const datees = !horaire.modele && !!horaire.debut

  /** Modifie l'horaire des invités (créé avec ses lignes de départ s'il n'existe pas encore). */
  const majInvites = (fn: (i: ReturnType<typeof invitesDe>) => void) => modifier((e) => fn((e.invites = invitesDe(e))))

  const majCase = (id: number, jour: string, v: string) =>
    majInvites((i) => {
      if (v.trim()) i.cases[`${id}|${jour}`] = v
      else delete i.cases[`${id}|${jour}`]
    })

  const deplacer = (n: number, sens: -1 | 1) =>
    majInvites((i) => {
      ;[i.lignes[n], i.lignes[n + sens]] = [i.lignes[n + sens], i.lignes[n]]
    })

  async function retirer(id: number, libelle: string) {
    const remplie = Object.entries(cases).some(([k, v]) => k.startsWith(`${id}|`) && v.trim())
    if (remplie && !(await confirmer({ titre: `Retirer la ligne « ${libelle} » ?`, message: 'Ses cases remplies sont effacées.', libelleOk: 'Retirer' })))
      return
    majInvites((i) => {
      i.lignes = i.lignes.filter((l) => l.id !== id)
      for (const k of Object.keys(i.cases)) if (k.startsWith(`${id}|`)) delete i.cases[k]
    })
  }

  return (
    <div className={`${ui.carte} space-y-4 p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Horaire des invités 🎭 — {horaire.nom}</h2>
        <button className={`${ui.boutonSecondaire} print:hidden`} onClick={() => window.print()}>
          Imprimer
        </button>
      </div>
      <p className="text-sm text-pierre-500 print:hidden">
        Ce que font les invités spéciaux, jour par jour : l'animation avant chaque repas, puis le lieu et le jeu de soirée.
        {ecriture && ' Les lignes se renomment, se déplacent et se retirent ; les jours suivent ceux de l\'horaire (« Jours et périodes »).'}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
          <colgroup>
            <col className="w-60" />
            {etat.jours.map((j) => (
              <col key={j} />
            ))}
          </colgroup>
          <thead>
            <tr className="text-left">
              <th className="border-b border-pierre-200 py-2 pr-3 font-medium text-pierre-500" />
              {etat.jours.map((j) => {
                const date = datees ? dateDuJour(horaire.debut!, j) : null
                return (
                  <th key={j} className="border-b border-pierre-200 px-2 py-2 font-semibold">
                    {j}
                    {date && <span className="block text-xs font-normal text-pierre-500">{dateLisible(date)}</span>}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, n) => (
              <tr key={l.id} className="align-top">
                <td className="border-b border-pierre-100 py-1.5 pr-3">
                  {ecriture ? (
                    <div className="flex items-center gap-0.5">
                      <ChampTexte
                        aria-label="Nom de la ligne"
                        obligatoire
                        className="min-w-0 flex-1 rounded border border-transparent px-1.5 py-1 font-medium hover:border-pierre-200 focus:border-pierre-300 print:border-0"
                        valeur={l.libelle}
                        enregistrer={(libelle) =>
                          majInvites((i) => {
                            i.lignes[n] = { ...i.lignes[n], libelle }
                          })
                        }
                      />
                      <span className="flex shrink-0 print:hidden">
                        <button aria-label="Monter" className="rounded px-1 text-pierre-500 hover:bg-pierre-100 disabled:opacity-30" disabled={n === 0} onClick={() => deplacer(n, -1)}>
                          ↑
                        </button>
                        <button
                          aria-label="Descendre"
                          className="rounded px-1 text-pierre-500 hover:bg-pierre-100 disabled:opacity-30"
                          disabled={n === lignes.length - 1}
                          onClick={() => deplacer(n, 1)}
                        >
                          ↓
                        </button>
                        <button aria-label={`Retirer la ligne ${l.libelle}`} className="rounded px-1 text-red-700 hover:bg-red-50" onClick={() => void retirer(l.id, l.libelle)}>
                          ✕
                        </button>
                      </span>
                    </div>
                  ) : (
                    <span className="px-1.5 font-medium">{l.libelle}</span>
                  )}
                </td>
                {etat.jours.map((j) => {
                  const valeur = cases[`${l.id}|${j}`] ?? ''
                  return (
                    <td key={j} className="border-b border-l border-pierre-100 p-0">
                      <textarea
                        aria-label={`${l.libelle}, ${j}`}
                        readOnly={!ecriture}
                        rows={2}
                        className="block min-h-14 w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none field-sizing-content focus:bg-foret-50/40 focus:ring-2 focus:ring-inset focus:ring-foret-600 print:hidden"
                        value={valeur}
                        onChange={(e) => majCase(l.id, j, e.target.value)}
                      />
                      {/* À l'impression, le texte au complet (une zone de saisie serait coupée). */}
                      <div className="hidden whitespace-pre-line px-2 py-1.5 print:block">{valeur}</div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ecriture && (
        <button
          className={`${ui.boutonSecondaire} print:hidden`}
          onClick={() =>
            majInvites((i) => i.lignes.push({ id: Math.max(0, ...i.lignes.map((x) => x.id)) + 1, libelle: 'Nouvelle ligne' }))
          }
        >
          <IconePlus /> Ligne
        </button>
      )}
    </div>
  )
}
