import { ChampTexte } from '@/lib/ChampTexte'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { Section } from './commun'
import { useRh } from './contexte'
import { useAjouterCode, useCodesPlanification, useModifierCode } from './donneesPlanification'
import { classeCode } from './couleursCodes'
import { COULEURS_CODE, type CodePlanification, type CouleurCode } from './types'

/**
 * Réglages › Codes de la planification : texte de la case, nom, couleur,
 * « présent » (diètes, tous présents), « compté au besoin » (présents, écart),
 * ordre ; un code utilisé se retire (il reste lisible dans les anciennes cases).
 */
export function ReglagesPlanification() {
  const { ecriture } = useRh()
  const codes = useCodesPlanification()
  const enregistrer = useModifierCode()
  const ajouter = useAjouterCode()
  const liste = [...(codes.data ?? [])].sort((a, b) => Number(b.actif) - Number(a.actif) || a.ordre - b.ordre)
  const actifs = liste.filter((c) => c.actif)

  const deplacer = (c: CodePlanification, sens: -1 | 1) => {
    const i = actifs.findIndex((x) => x.id === c.id)
    const autre = actifs[i + sens]
    if (!autre) return
    // Ordres distincts au besoin (codes ajoutés avec le même ordre).
    const a = autre.ordre === c.ordre ? c.ordre + sens : autre.ordre
    enregistrer.mutate({ id: c.id, ordre: a })
    enregistrer.mutate({ id: autre.id, ordre: c.ordre })
  }

  return (
    <Section titre="Codes de la planification" className="xl:col-span-2">
      <p className="mb-3 text-sm text-pierre-600">
        Ce qu'on inscrit dans une case de l'onglet Planification. « Présent » : compte dans les diètes et « Tous présents » ; « Besoin » : compte face au besoin prévu («
        Présents », « Écart »). CDJ = camp de jour (présent, pas compté au besoin du camp de vacances).
      </p>
      {codes.error && <p className={ui.erreur}>{messageErreur(codes.error)}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="text-left text-xs text-pierre-500">
            <tr>
              <th className="px-1 py-1 font-medium">Case</th>
              <th className="px-1 py-1 font-medium">Nom</th>
              <th className="px-1 py-1 font-medium">Couleur</th>
              <th className="px-1 py-1 text-center font-medium">Présent</th>
              <th className="px-1 py-1 text-center font-medium">Besoin</th>
              <th className="px-1 py-1" />
            </tr>
          </thead>
          <tbody className="divide-y divide-pierre-100">
            {liste.map((c) => {
              const i = actifs.findIndex((x) => x.id === c.id)
              const changer = (champs: Partial<CodePlanification>) => enregistrer.mutate({ id: c.id, ...champs })
              return (
                <tr key={c.id} className={c.actif ? '' : 'opacity-50'}>
                  <td className="px-1 py-1">
                    <span className="flex items-center gap-1.5">
                      <span className={`inline-flex min-w-10 justify-center rounded px-1.5 py-0.5 text-xs font-medium ${classeCode(c)}`}>{c.code}</span>
                      <ChampTexte
                        aria-label={`Texte de la case : ${c.nom}`}
                        className="w-16 rounded border border-pierre-200 px-1.5 py-0.5 text-xs"
                        maxLength={8}
                        valeur={c.code}
                        obligatoire
                        disabled={!ecriture}
                        enregistrer={(code) => changer({ code })}
                      />
                    </span>
                  </td>
                  <td className="px-1 py-1">
                    <ChampTexte aria-label={`Nom du code ${c.code}`} className="w-full min-w-36 rounded border border-pierre-200 px-1.5 py-0.5" valeur={c.nom} obligatoire disabled={!ecriture} enregistrer={(nom) => changer({ nom })} />
                  </td>
                  <td className="px-1 py-1">
                    <select aria-label={`Couleur du code ${c.code}`} className="rounded border border-pierre-200 px-1 py-0.5 text-xs" disabled={!ecriture} value={c.couleur} onChange={(e) => changer({ couleur: e.target.value as CouleurCode })}>
                      {COULEURS_CODE.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${c.code} compte comme présent`}
                      disabled={!ecriture}
                      checked={c.present}
                      onChange={(e) => changer(e.target.checked ? { present: true } : { present: false, besoin: false })}
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${c.code} compte face au besoin`}
                      disabled={!ecriture || !c.present}
                      checked={c.besoin}
                      onChange={(e) => changer({ besoin: e.target.checked })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    {ecriture && (
                      <span className="flex items-center justify-end gap-1.5 text-xs">
                        {c.actif && (
                          <>
                            <button className="px-1 text-pierre-500 hover:text-pierre-900 disabled:opacity-30" disabled={i <= 0} aria-label={`Monter ${c.code}`} onClick={() => deplacer(c, -1)}>
                              ▲
                            </button>
                            <button className="px-1 text-pierre-500 hover:text-pierre-900 disabled:opacity-30" disabled={i >= actifs.length - 1} aria-label={`Descendre ${c.code}`} onClick={() => deplacer(c, 1)}>
                              ▼
                            </button>
                          </>
                        )}
                        <button className={c.actif ? 'text-pierre-500 hover:text-red-700' : 'text-foret-700 hover:underline'} onClick={() => changer({ actif: !c.actif })}>
                          {c.actif ? 'Retirer' : 'Remettre'}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {ecriture && (
        <button
          className={`${ui.boutonSecondaire} mt-3`}
          onClick={() => {
            let n = 1
            while (liste.some((c) => c.code.toLowerCase() === `code ${n}`)) n++
            ajouter.mutate({ id: crypto.randomUUID(), code: `Code ${n}`, nom: 'Nouveau code', couleur: 'gris', present: true, besoin: false, ordre: (actifs.at(-1)?.ordre ?? 0) + 1, actif: true })
          }}
        >
          + Code
        </button>
      )}
      {(enregistrer.error || ajouter.error) && <p className={`${ui.erreur} mt-2`}>{messageErreur(enregistrer.error ?? ajouter.error)}</p>}
    </Section>
  )
}
