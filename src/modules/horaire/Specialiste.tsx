import { useMemo } from 'react'
import { ChampTexte } from '@/lib/ChampTexte'
import { ui } from '@/lib/ui'
import { useSemaine } from './contexte'
import { activitesTag, activiteEffective, cartesFusion, norm, periodesSpecialiste } from './logique'
import { COLONNES_TRANSPORT, META_TAG, type Tag } from './types'

/** Horaire d'un spécialiste (escalade, transport, sauveteur). */
export function Specialiste({ tag }: { tag: Tag }) {
  const { etat, reglages, modifier, ecriture, horaire } = useSemaine()
  const meta = META_TAG[tag]
  const lignes = useMemo(() => periodesSpecialiste(etat, reglages, tag), [etat, reglages, tag])
  const activites = reglages.activites.filter((a) => a.tags.includes(tag)).map((a) => a.name)
  const extra = tag === 'transport' ? COLONNES_TRANSPORT : []

  return (
    <div className="space-y-5">
      <div className={`${ui.carte} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {meta.icone} {meta.libelle} — {horaire.nom}{' '}
            <span className="text-sm font-normal text-pierre-500">
              ({lignes.length} période{lignes.length > 1 ? 's' : ''})
            </span>
          </h2>
          <button className={`${ui.boutonSecondaire} print:hidden`} onClick={() => window.print()}>
            Imprimer
          </button>
        </div>
        <p className="mt-1 text-sm text-pierre-500">
          Activités : {activites.join(' · ') || 'aucune — ajoutez l’étiquette dans les Réglages'}.
        </p>

        {lignes.length === 0 ? (
          <p className="mt-4 text-sm text-pierre-500">Aucune période cette semaine.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-pierre-200 text-left text-pierre-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Jour</th>
                  <th className="py-2 pr-3 font-medium">Période</th>
                  <th className="py-2 pr-3 font-medium">Groupe</th>
                  <th className="py-2 pr-3 font-medium">Animateur</th>
                  <th className="py-2 pr-3 font-medium">Activité</th>
                  {extra.map((c) => (
                    <th key={c} className="py-2 pr-3 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => {
                  const nouveauJour = i === 0 || lignes[i - 1].day !== l.day
                  return (
                    <tr key={`${l.day}|${l.time}|${l.gid}`} className={nouveauJour && i > 0 ? 'border-t-2 border-pierre-200' : 'border-t border-pierre-100'}>
                      <td className="py-1.5 pr-3 font-semibold">{nouveauJour ? l.day : ''}</td>
                      <td className="py-1.5 pr-3 tabular-nums text-pierre-700">{l.time}</td>
                      <td className="py-1.5 pr-3">Gr. {l.group}</td>
                      <td className="py-1.5 pr-3">{l.anim}</td>
                      <td className="py-1.5 pr-3">
                        <span className="rounded px-1.5 py-0.5" style={{ background: meta.clair }}>
                          {l.act}
                        </span>
                      </td>
                      {extra.map((c) => {
                        const k = `${l.day}|${l.time}|${l.group}|${c}`
                        return (
                          <td key={c} className="py-1 pr-2">
                            <ChampTexte
                              aria-label={`${c} — ${l.day} ${l.time}, groupe ${l.group}`}
                              disabled={!ecriture}
                              className="w-28 rounded border border-pierre-200 px-1.5 py-1 text-sm print:border-0"
                              valeur={etat.transport[k] ?? ''}
                              enregistrer={(v) =>
                                modifier((e) => {
                                  if (v) e.transport[k] = v
                                  else delete e.transport[k]
                                })
                              }
                            />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {tag === 'sauveteur' && <CouvertureSauveteur />}
      <GrilleSurlignee tag={tag} />
    </div>
  )
}

function CouvertureSauveteur() {
  const { etat, reglages } = useSemaine()
  const lignes = periodesSpecialiste(etat, reglages, 'sauveteur')
  const compte = new Map<string, number>()
  lignes.forEach((l) => compte.set(`${l.day}|${l.time}`, (compte.get(`${l.day}|${l.time}`) ?? 0) + 1))
  const seuil = reglages.capacites.sauveteur
  let dernier = ''
  return (
    <div className={`${ui.carte} p-5`}>
      <h2 className="font-semibold">
        Couverture par période{' '}
        <span className="text-sm font-normal text-pierre-500">— groupes au plan d'eau en même temps (seuil {seuil})</span>
      </h2>
      <table className="mt-3 text-sm">
        <thead className="text-left text-pierre-500">
          <tr>
            <th className="py-1 pr-6 font-medium">Jour</th>
            <th className="py-1 pr-6 font-medium">Période</th>
            <th className="py-1 font-medium"># groupes</th>
          </tr>
        </thead>
        <tbody>
          {[...compte.entries()].map(([k, n]) => {
            const [jour, periode] = k.split('|')
            const afficher = jour !== dernier
            dernier = jour
            return (
              <tr key={k} className="border-t border-pierre-100">
                <td className="py-1 pr-6 font-semibold">{afficher ? jour : ''}</td>
                <td className="py-1 pr-6 tabular-nums">{periode}</td>
                <td className={`py-1 tabular-nums ${n > seuil ? 'font-bold text-amber-800' : ''}`}>
                  {n}
                  {n > seuil ? ' ⚠ au-delà du seuil' : ''}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Grille complète, activités du spécialiste surlignées. */
function GrilleSurlignee({ tag }: { tag: Tag }) {
  const { etat, reglages } = useSemaine()
  const ensemble = activitesTag(reglages, tag)
  const { couverture } = cartesFusion(etat)
  const meta = META_TAG[tag]
  return (
    <div className={`${ui.carte} p-5`}>
      <h2 className="font-semibold">Grille complète</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="text-sm">
          <thead className="text-left">
            <tr className="border-b border-pierre-200">
              <th className="py-1.5 pr-3 font-medium text-pierre-500">Jour</th>
              <th className="py-1.5 pr-3 font-medium text-pierre-500">Période</th>
              {etat.groupes.map((g) => (
                <th key={g.id} className="min-w-28 py-1.5 pr-3 font-semibold">
                  Gr. {g.num}
                  <span className="block text-xs font-normal text-pierre-500">{g.anim}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {etat.jours.map((jour) =>
              etat.periodes.map((p, pi) => (
                <tr key={`${jour}|${p}`} className={pi === 0 ? 'border-t-2 border-pierre-200' : 'border-t border-pierre-100'}>
                  <td className="py-1 pr-3 font-semibold">{pi === 0 ? jour : ''}</td>
                  <td className="py-1 pr-3 text-xs tabular-nums text-pierre-700">{p}</td>
                  {etat.groupes.map((g) => {
                    const a = norm(activiteEffective(etat, g.id, jour, pi, couverture))
                    return (
                      <td key={g.id} className="py-1 pr-3">
                        {a && ensemble.has(a) ? (
                          <span className="rounded px-1.5 py-0.5 font-medium" style={{ background: meta.clair, boxShadow: `inset 3px 0 0 ${meta.couleur}` }}>
                            {a}
                          </span>
                        ) : (
                          <span className="text-pierre-300">{a}</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
