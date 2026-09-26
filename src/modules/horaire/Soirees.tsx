import { useMemo } from 'react'
import { ui } from '@/lib/ui'
import { Puce } from './Conflits'
import { useSemaine } from './contexte'
import { analyseSoirees, carteTache, repartirChouettes, type TypeTache } from './logique'
import { JEUX, SURVEILLANCES } from './types'

export function Soirees() {
  const { etat, reglages, modifier, ecriture, horaire } = useSemaine()
  const { charge, conflits, enConflit, campeurs } = useMemo(() => analyseSoirees(etat, reglages), [etat, reglages])
  const erreurs = conflits.filter((c) => c.sev === 'err')
  const avertissements = conflits.filter((c) => c.sev === 'warn')
  const nuitsCamping = reglages.nuits.filter((n) => campeurs[n]?.length)

  const total = (n: string) => charge[n].jeu + charge[n].surv + charge[n].chouette
  const noms = Object.keys(charge).sort((a, b) => total(b) - total(a) || a.localeCompare(b))
  const max = Math.max(1, ...noms.map(total))

  return (
    <div className={`${ui.carte} space-y-5 p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Soirées 🌙 — {horaire.nom}</h2>
        <button className={`${ui.boutonSecondaire} print:hidden`} onClick={() => window.print()}>
          Imprimer
        </button>
      </div>
      <p className="text-sm text-pierre-500">
        Assignez les jeux de soirée, la surveillance pré-jeu et les chouettes (par section). Sont signalés : un animateur en
        congé ou en camping ce soir-là, ou en double. Sections et nuits : dans les Réglages de l'onglet Construire.
      </p>
      <div className="flex flex-wrap gap-2">
        <Puce niveau={erreurs.length ? 'err' : 'ok'}>
          {erreurs.length} conflit{erreurs.length > 1 ? 's' : ''}
        </Puce>
        <Puce niveau={avertissements.length ? 'soft' : 'ok'}>
          {avertissements.length} section{avertissements.length > 1 ? 's' : ''} à couvrir
        </Puce>
      </div>
      {erreurs.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {erreurs.map((c, i) => (
            <li key={i} className="flex items-center gap-2">
              <Puce niveau="err">Conflit</Puce>
              {c.msg}
            </li>
          ))}
        </ul>
      )}
      {nuitsCamping.length > 0 && (
        <p className="text-sm text-pierre-700">
          🏕️ En camping (pas disponibles le soir) —{' '}
          {nuitsCamping.map((n, i) => (
            <span key={n}>
              {i > 0 && ' · '}
              <b>{n}</b> : {campeurs[n].join(', ')}
            </span>
          ))}
        </p>
      )}

      <TableTaches titre="Jeux de soirée" colonne="Jeu" lignes={JEUX.map((j) => ({ id: j.id, libelle: j.libelle }))} type="jeu" enConflit={enConflit} />
      <TableTaches
        titre="👀 Surveillance pré-jeu"
        sousTitre="avant le jeu de soirée (18h)"
        colonne="Surveillance"
        lignes={SURVEILLANCES.map((s) => ({ id: s.id, libelle: s.libelle }))}
        type="surv"
        enConflit={enConflit}
      />
      <TableTaches
        titre="🦉 Chouettes"
        sousTitre="surveillance de nuit, par section de dortoir"
        colonne="Section"
        lignes={reglages.sections.map((s) => ({ id: s, libelle: s }))}
        type="chouette"
        enConflit={enConflit}
        actions={
          ecriture && (
            <>
              <button
                className={ui.boutonSecondaire}
                onClick={() =>
                  confirm(
                    'Répartir automatiquement les chouettes dans les cases vides, de façon équilibrée ?\n(Respecte les congés, le camping, et évite les doublons. Les cases déjà remplies sont conservées.)',
                  ) && modifier((e) => (e.chouettes = repartirChouettes(e, reglages)))
                }
              >
                🎲 Répartir automatiquement
              </button>
              <button className={ui.boutonDanger} onClick={() => confirm('Vider toutes les chouettes ?') && modifier((e) => (e.chouettes = {}))}>
                Vider
              </button>
            </>
          )
        }
      />
      {avertissements.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-pierre-500">{avertissements.length} sections sans chouette (à couvrir)</summary>
          <ul className="mt-2 text-pierre-700">
            {avertissements.map((c, i) => (
              <li key={i}>{c.msg}</li>
            ))}
          </ul>
        </details>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold">
          Charge par animateur <span className="font-normal text-pierre-500">— pour équilibrer les soirées</span>
        </h3>
        {noms.length === 0 ? (
          <p className="text-sm text-pierre-500">Aucune assignation pour l'instant.</p>
        ) : (
          <table className="text-sm">
            <thead className="text-left text-pierre-500">
              <tr>
                <th className="py-1 pr-6 font-medium">Animateur</th>
                <th className="py-1 pr-4 text-right font-medium">Jeux</th>
                <th className="py-1 pr-4 text-right font-medium">Surv.</th>
                <th className="py-1 pr-4 text-right font-medium">Chouettes</th>
                <th className="py-1 pr-4 text-right font-medium">Total</th>
                <th className="w-36" />
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {noms.map((n) => (
                <tr key={n} className="border-t border-pierre-100">
                  <td className="py-1 pr-6 font-medium">{n}</td>
                  <td className="py-1 pr-4 text-right">{charge[n].jeu}</td>
                  <td className="py-1 pr-4 text-right">{charge[n].surv}</td>
                  <td className="py-1 pr-4 text-right">{charge[n].chouette}</td>
                  <td className="py-1 pr-4 text-right font-semibold">{total(n)}</td>
                  <td className="py-1">
                    <span className="block h-2.5 rounded-r bg-foret-600" style={{ width: `${(total(n) / max) * 100}%` }} aria-hidden />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function TableTaches({
  titre,
  sousTitre,
  colonne,
  lignes,
  type,
  enConflit,
  actions,
}: {
  titre: string
  sousTitre?: string
  colonne: string
  lignes: { id: string; libelle: string }[]
  type: TypeTache
  enConflit: Set<string>
  actions?: React.ReactNode
}) {
  const { etat, reglages, modifier, ecriture, animateurs } = useSemaine()
  const carte = carteTache(etat, type)
  const ajouter = (k: string, nom: string) =>
    nom &&
    modifier((e) => {
      const c = carteTache(e, type)
      c[k] = [...(c[k] ?? []).filter((x) => x !== nom), nom]
    })
  const retirer = (k: string, nom: string) =>
    modifier((e) => {
      const c = carteTache(e, type)
      c[k] = (c[k] ?? []).filter((x) => x !== nom)
      if (!c[k].length) delete c[k]
    })

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">
          {titre} {sousTitre && <span className="font-normal text-pierre-500">— {sousTitre}</span>}
        </h3>
        <div className="ml-auto flex gap-2 print:hidden">{actions}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-pierre-200 text-left text-pierre-500">
            <tr>
              <th className="py-2 pr-3 font-medium">{colonne}</th>
              {reglages.nuits.map((n) => (
                <th key={n} className="py-2 pr-3 font-medium">
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-pierre-100">
            {lignes.map((l) => (
              <tr key={l.id} className="align-top">
                <td className="py-1.5 pr-3 font-medium">{l.libelle}</td>
                {reglages.nuits.map((nuit) => {
                  const k = `${l.id}|${nuit}`
                  const assignes = carte[k] ?? []
                  return (
                    <td key={nuit} className="py-1.5 pr-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {assignes.map((nom) => {
                          const conflit = enConflit.has(`${nom}|${nuit}`)
                          return (
                            <span
                              key={nom}
                              title={conflit ? 'Conflit ce soir' : undefined}
                              className={`inline-flex items-center gap-1 rounded-full border py-0.5 pl-2 pr-1 text-xs ${
                                conflit ? 'border-[#d03b3b] bg-[#d03b3b]/10 font-semibold' : 'border-pierre-200 bg-pierre-50'
                              }`}
                            >
                              {conflit && <span aria-hidden>✕</span>}
                              {nom}
                              {ecriture && (
                                <button aria-label={`Retirer ${nom}`} className="px-0.5 text-pierre-500 hover:text-pierre-900" onClick={() => retirer(k, nom)}>
                                  ×
                                </button>
                              )}
                            </span>
                          )
                        })}
                        {ecriture && (
                          <select
                            aria-label={`Ajouter — ${l.libelle}, ${nuit}`}
                            className="w-9 rounded border border-pierre-200 bg-white text-xs print:hidden"
                            value=""
                            onChange={(e) => ajouter(k, e.target.value)}
                          >
                            <option value="">＋</option>
                            {animateurs
                              .filter((n) => !assignes.includes(n))
                              .map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                          </select>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
