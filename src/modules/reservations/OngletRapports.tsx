// Onglet Rapports (phase 7, plan §12). Calculs dans rapports.ts (purs,
// testés) ; graphiques dans GraphiquesRapports.tsx. Un seul filtre en haut
// (l'exercice) : tout ce qui est dessous suit le même exercice.

import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ui } from '@/lib/ui'
import { nomGenre } from '@/modules/crm/types'
import { exerciceDe, libelleExercice } from './calcul'
import { Section } from './commun'
import { useDonnees } from './contexte'
import { useHistoriqueMensuel, useTotauxAcceptes, useToutesFactures } from './donnees'
import { argent, champPetit, dateCourte, nomEtape } from './format'
import { COULEURS, kdollars } from './echelles'
import { BarresHorizontales, ChoixForme, Colonnes, Courbes, CourbesMois } from './GraphiquesRapports'
import {
  anneeDuMois,
  delais,
  entonnoir,
  grilleOccupation,
  groupesParMois,
  joursUsagers,
  montant,
  MOIS_EXERCICE,
  occupationParMois,
  parForfait,
  prevision,
  raisonsPerte,
  revenusParMois,
  revenusReference,
  rythme,
  troisMesures,
  type LigneForfait,
  type R,
} from './rapports'
import { FORFAITS, RAISONS_PERTE, VARIANTES, type Forfait } from './types'

type Forme = 'courbes' | 'colonnes'
const CLE_FORME = 'reservations-rapports-forme'
/** Forme des graphiques par mois, gardée sur l'appareil (courbes par défaut). */
function lireForme(): Forme {
  try {
    return localStorage.getItem(CLE_FORME) === 'colonnes' ? 'colonnes' : 'courbes'
  } catch {
    return 'courbes'
  }
}

/** Graphique par mois dans la forme choisie. */
function GraphiqueMois({ forme, ...p }: { forme: Forme } & Parameters<typeof Colonnes>[0]) {
  return forme === 'courbes' ? <CourbesMois {...p} /> : <Colonnes {...p} />
}

const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const pct = (v: number | null) => (v === null || !Number.isFinite(v) ? '—' : `${Math.round(v * 100)} %`)
const entier = (v: number) => v.toLocaleString('fr-CA')
const dollars = (v: number) => argent(Math.round(v)).replace(/,00\s/, ' ')

function nomLigneForfait(l: Pick<LigneForfait, 'forfait' | 'variante'>) {
  const v = VARIANTES[l.forfait].find((x) => x.valeur === l.variante)
  if (l.forfait === 'classe_nature') return v ? v.libelle : 'Classe nature (sans variante)'
  if (l.forfait === 'location_salle') return `Location de salle${v ? ` · ${v.libelle.split(' (')[0]}` : ''}`
  return FORFAITS[l.forfait]
}

/** Tableau compact, nombres alignés à droite. */
function Tableau({ entetes, lignes, total }: { entetes: string[]; lignes: (string | number)[][]; total?: (string | number)[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-pierre-200 text-left text-xs uppercase tracking-wide text-pierre-500">
            {entetes.map((e, i) => (
              <th key={e} className={`px-2 py-1.5 font-medium ${i ? 'whitespace-nowrap text-right' : ''}`}>
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-pierre-100">
          {lignes.map((l, i) => (
            <tr key={i}>
              {l.map((c, j) => (
                <td key={j} className={`px-2 py-1.5 ${j ? 'whitespace-nowrap text-right tabular-nums' : ''}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {total && (
          <tfoot>
            <tr className="border-t border-pierre-300 font-semibold">
              {total.map((c, j) => (
                <td key={j} className={`px-2 py-1.5 ${j ? 'whitespace-nowrap text-right tabular-nums' : ''}`}>
                  {c}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function Tuile({ libelle, valeur, detail }: { libelle: string; valeur: string; detail?: string }) {
  return (
    <div className={`${ui.carte} p-4`}>
      <div className="text-xs text-pierre-500">{libelle}</div>
      <div className="mt-1 text-2xl font-semibold text-pierre-900 tabular-nums">{valeur}</div>
      {detail && <div className="mt-0.5 text-xs text-pierre-600">{detail}</div>}
    </div>
  )
}

export function OngletRapports() {
  const { reservations, orgParId, etages, auj } = useDonnees()
  const historique = useHistoriqueMensuel()
  const factures = useToutesFactures()
  const totaux = useTotauxAcceptes()
  const rs = reservations as R[]

  const exercices = useMemo(() => [...new Set(rs.filter((r) => r.origine !== 'airbnb').map((r) => r.exercice))].sort(), [rs])
  const courant = exerciceDe(auj)
  const [forme, setForme] = useState<Forme>(lireForme)
  const changerForme = (f: Forme) => {
    setForme(f)
    try {
      localStorage.setItem(CLE_FORME, f)
    } catch {
      // Stockage indisponible (navigation privée) : le choix vaut pour cette visite.
    }
  }
  const [exercice, setExercice] = useState(exercices.includes(courant) ? courant : (exercices.at(-1) ?? courant))
  const ref = historique.data ?? []
  const precedent = exercice - 1
  const aDesSignes = (ex: number) => rs.some((r) => r.exercice === ex && r.signe_le && r.origine !== 'airbnb')

  // Revenus : l'app quand elle a l'exercice, sinon la référence importée du Sheets.
  const revenusDe = (ex: number) => (aDesSignes(ex) ? revenusParMois(rs, ex) : revenusReference(ref, ex))
  const seriesRevenus = [exercice, exercice - 1, exercice - 2]
    .map((ex, i) => ({ ex, nom: libelleExercice(ex), couleur: COULEURS[i], valeurs: revenusDe(ex) }))
    .filter((s): s is typeof s & { valeurs: number[] } => s.valeurs !== null)

  const ry = rythme(rs, exercice, auj)
  const prev = prevision(rs, exercice)
  const ent = entonnoir(rs, exercice, (r) => r.forfait, auj)
  const total = ent.get('') ?? { demandes: 0, estimes: 0, signees: 0, faites: 0 }
  const mois = groupesParMois(rs, exercice)
  const joursUsagersTotal = mois.reduce((t, m) => t + m.joursUsagers, 0)

  const ecartRythme = ry.aCeJour.precedent ? ry.aCeJour.courant / ry.aCeJour.precedent - 1 : null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-pierre-600">Exercice</span>
          <select className={champPetit} value={exercice} onChange={(e) => setExercice(Number(e.target.value))}>
            {exercices.map((ex) => (
              <option key={ex} value={ex}>
                {libelleExercice(ex)}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-pierre-500">
          Par mois d'arrivée. Montants avant taxes, comme le Sheets (sauf « Signé, facturé, encaissé »). Les demandes d'Airbnb ne comptent pas, sauf dans l'occupation.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Exercice en cours ou à venir : à ce jour, comparé à l'an passé ; exercice terminé : tout ce qui a été signé. */}
        {exercice >= courant ? (
          <Tuile
            libelle="Signé à ce jour"
            valeur={dollars(ry.aCeJour.courant)}
            detail={
              aDesSignes(precedent)
                ? `${ecartRythme === null ? '' : `${ecartRythme >= 0 ? '+' : '−'}${Math.abs(Math.round(ecartRythme * 100))} % · `}${dollars(ry.aCeJour.precedent)} l'an passé à pareille date`
                : `${ry.aCeJour.groupes} groupes`
            }
          />
        ) : (
          <Tuile libelle="Signé" valeur={dollars(prev.signe)} detail={`${mois.reduce((t, m) => t + m.groupes.length, 0)} groupes`} />
        )}
        <Tuile libelle="Prévision pondérée" valeur={dollars(prev.signe + prev.pondere)} detail={`signé ${dollars(prev.signe)} + estimés en cours ${dollars(prev.pondere)}`} />
        <Tuile libelle="Groupes signés" valeur={entier(mois.reduce((t, m) => t + m.groupes.length, 0))} detail={`${entier(joursUsagersTotal)} jours-usagers`} />
        <Tuile libelle="Taux de signature" valeur={pct(total.demandes ? total.signees / total.demandes : null)} detail={`${total.signees} signées sur ${total.demandes} demandes`} />
      </div>

      <Section titre="Revenus par mois" action={<ChoixForme forme={forme} changer={changerForme} />}>
        <GraphiqueMois forme={forme} categories={MOIS_EXERCICE.map((m) => COURTS[m - 1])} series={seriesRevenus} format={dollars} formatAxe={kdollars} />
        <div className="mt-3">
          <Tableau
            entetes={['Mois', ...seriesRevenus.map((s) => s.nom)]}
            lignes={MOIS_EXERCICE.map((m, i) => [NOMS_MOIS[m - 1], ...seriesRevenus.map((s) => dollars(s.valeurs[i]))])}
            total={['Total', ...seriesRevenus.map((s) => dollars(s.valeurs.reduce((a, b) => a + b, 0)))]}
          />
        </div>
        <p className="mt-2 text-xs text-pierre-500">
          {seriesRevenus
            .filter((s) => !aDesSignes(s.ex))
            .map((s) => s.nom)
            .join(' et ') || 'Aucun exercice'}{' '}
          : chiffres de référence du Sheets (onglet « Comparatif par mois »), tels quels.
        </p>
      </Section>

      <Section titre="Rythme de réservation">
        <p className="mb-2 text-sm text-pierre-600">
          Montant signé cumulé, par date de signature{aDesSignes(precedent) ? ", comparé au même jour l'an passé" : ''}. Contrats encore valides seulement.
        </p>
        <Courbes
          jours={ry.jours}
          series={[
            { nom: libelleExercice(exercice), couleur: COULEURS[0], valeurs: ry.courant },
            ...(aDesSignes(precedent) ? [{ nom: `${libelleExercice(precedent)} (un an plus tôt)`, couleur: COULEURS[1], valeurs: ry.precedent }] : []),
          ]}
          marque={auj}
          format={dollars}
        />
        <p className="mt-2 text-sm text-pierre-700">
          Au {dateCourte(ry.aCeJour.jour, auj)} : <strong>{dollars(ry.aCeJour.courant)}</strong> ({ry.aCeJour.groupes} groupes)
          {aDesSignes(precedent) && (
            <>
              {' '}
              contre {dollars(ry.aCeJour.precedent)} ({ry.aCeJour.groupesPrecedent} groupes) un an plus tôt.
            </>
          )}
        </p>
      </Section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section titre="Prévision pondérée">
          <p className="mb-2 text-sm text-pierre-600">
            Estimés en cours × taux de signature de leur étape, mesuré sur {libelleExercice(precedent)}.
          </p>
          <Tableau
            entetes={['Étape', 'Montant', 'Taux', 'Pondéré']}
            lignes={[
              ['Signé', dollars(prev.signe), '100 %', dollars(prev.signe)],
              ...prev.lignes.map((l) => [`${nomEtape(l.etape)} (${l.ouvertes})`, dollars(l.montant), pct(l.taux), l.taux === null ? '—' : dollars(l.pondere)]),
            ]}
            total={['Prévision', '', '', dollars(prev.signe + prev.pondere)]}
          />
          {prev.lignes.some((l) => l.taux === null) && <p className="mt-2 text-xs text-amber-700">Pas de taux pour {libelleExercice(precedent)} (avant l'app) : ces estimés ne sont pas comptés.</p>}
        </Section>
        <TroisMesures rs={rs} exercice={exercice} totaux={totaux.data} factures={factures.data} />
      </div>

      <Entonnoir rs={rs} exercice={exercice} auj={auj} orgParId={orgParId} />

      <ParForfait rs={rs} exercice={exercice} />

      <GroupesParMois mois={mois} auj={auj} />

      <Occupation rs={rs} exercice={exercice} auj={auj} lits={etages} forme={forme} changerForme={changerForme} />

      <div className="grid gap-5 xl:grid-cols-2">
        <Section titre="Raisons de perte">
          {(() => {
            const p = raisonsPerte(rs, exercice)
            return p.length ? (
              <BarresHorizontales
                lignes={p.map((l) => ({ libelle: l.raison ? RAISONS_PERTE[l.raison] : 'Non précisée', valeur: l.groupes, detail: l.montant ? `${dollars(l.montant)} estimés` : undefined }))}
              />
            ) : (
              <p className="text-sm text-pierre-500">Aucune demande perdue.</p>
            )
          })()}
        </Section>
        <Section titre="Délais">
          {(() => {
            const d = delais(rs, exercice)
            const ordre: (Forfait | '')[] = ['classe_nature', 'journee_plein_air', 'accueil_groupe', 'location_salle', '']
            return (
              <>
                <Tableau
                  entetes={['Forfait', 'Groupes', 'Demande → signé', 'Signé → arrivée']}
                  lignes={ordre
                    .filter((k) => k && d.has(k))
                    .map((k) => {
                      const l = d.get(k)!
                      return [FORFAITS[k as Forfait], l.groupes, jours(l.demandeSignature), jours(l.signatureArrivee)]
                    })}
                  total={d.has('') ? ['Tous', d.get('')!.groupes, jours(d.get('')!.demandeSignature), jours(d.get('')!.signatureArrivee)] : undefined}
                />
                <p className="mt-2 text-xs text-pierre-500">Médianes, en jours.</p>
              </>
            )
          })()}
        </Section>
      </div>
    </div>
  )
}

const jours = (v: number | null) => (v === null ? '—' : `${Math.round(v)} j`)

function TroisMesures({
  rs,
  exercice,
  totaux,
  factures,
}: {
  rs: R[]
  exercice: number
  totaux: Record<string, number> | undefined
  factures: Parameters<typeof troisMesures>[3] | undefined
}) {
  if (!totaux || !factures) return <Section titre="Signé, facturé, encaissé">Chargement…</Section>
  const m = troisMesures(rs, exercice, new Map(Object.entries(totaux)), factures)
  return (
    <Section titre="Signé, facturé, encaissé">
      <p className="mb-2 text-sm text-pierre-600">Taxes comprises, comme dans QuickBooks.</p>
      <Tableau
        entetes={['Mesure', 'Montant']}
        lignes={[
          ['Signé (estimés acceptés)', dollars(m.signe)],
          ['Facturé dans QBO (crédits déduits)', dollars(m.facture)],
          ['Encaissé', dollars(m.encaisse)],
          ['Reste à facturer', dollars(m.signe - m.facture)],
          ['Reste à encaisser', dollars(m.facture - m.encaisse)],
        ]}
      />
      <p className="mt-2 text-xs text-pierre-500">
        {m.avecFactures} des {m.groupes} groupes signés ont des factures dans QBO
        {m.avecFactures < m.groupes ? ' (les autres ont été facturés avant que l’app soit reliée à QBO)' : ''}.
      </p>
    </Section>
  )
}

function Entonnoir({ rs, exercice, auj, orgParId }: { rs: R[]; exercice: number; auj: string; orgParId: Map<string, { genre: string }> }) {
  const [par, setPar] = useState<'forfait' | 'genre'>('forfait')
  const cle = par === 'forfait' ? (r: R) => r.forfait : (r: R) => (r.organisation_id ? (orgParId.get(r.organisation_id)?.genre ?? 'inconnu') : 'inconnu')
  const e = entonnoir(rs, exercice, cle, auj)
  const nom = (k: string) => (par === 'forfait' ? FORFAITS[k as Forfait] : k === 'inconnu' ? 'Pas encore relié au CRM' : nomGenre(k as Parameters<typeof nomGenre>[0]))
  const lignes = [...e].filter(([k]) => k !== '').sort((a, b) => b[1].demandes - a[1].demandes)
  const total = e.get('')
  const ligne = (n: string, x: { demandes: number; estimes: number; signees: number; faites: number }) => [
    n,
    x.demandes,
    `${x.estimes} · ${pct(x.demandes ? x.estimes / x.demandes : null)}`,
    `${x.signees} · ${pct(x.estimes ? x.signees / x.estimes : null)}`,
    x.faites,
    pct(x.demandes ? x.signees / x.demandes : null),
  ]
  return (
    <Section
      titre="Entonnoir"
      action={
        <div className="flex gap-1 text-xs">
          {(['forfait', 'genre'] as const).map((p) => (
            <button key={p} className={`rounded-full px-2.5 py-1 ${par === p ? 'bg-foret-700 text-white' : 'bg-pierre-100 text-pierre-700'}`} onClick={() => setPar(p)}>
              {p === 'forfait' ? 'Par forfait' : "Par type d'organisation"}
            </button>
          ))}
        </div>
      }
    >
      <Tableau
        entetes={[par === 'forfait' ? 'Forfait' : 'Type', 'Demandes', 'Estimé envoyé', 'Contrat signé', 'Séjour fait', 'Demande → signé']}
        lignes={lignes.map(([k, x]) => ligne(nom(k), x))}
        total={total ? ligne('Total', total) : undefined}
      />
      <p className="mt-2 text-xs text-pierre-500">
        À côté de chaque nombre : la part de l'étape d'avant. « Contrat signé » compte aussi les contrats annulés ensuite ; « Séjour fait » : signé, pas annulé, départ passé.
      </p>
    </Section>
  )
}

function ParForfait({ rs, exercice }: { rs: R[]; exercice: number }) {
  const n = parForfait(rs, exercice)
  const avant = parForfait(rs, exercice - 1)
  const avecAvant = avant.length > 0
  const cle = (l: LigneForfait) => `${l.forfait}|${l.variante ?? ''}`
  const parCle = new Map(avant.map((l) => [cle(l), l]))
  const cles = [...new Set([...n.map(cle), ...avant.map(cle)])]
  const lignes = cles.map((k) => {
    const a = n.find((l) => cle(l) === k)
    const b = parCle.get(k)
    const base = (a ?? b)!
    return [
      nomLigneForfait(base),
      a?.groupes ?? 0,
      dollars(a?.montant ?? 0),
      entier(a?.joursUsagers ?? 0),
      a && a.joursUsagers ? dollars(a.montant / a.joursUsagers) : '—',
      ...(avecAvant ? [dollars(b?.montant ?? 0), entier(b?.joursUsagers ?? 0)] : []),
    ]
  })
  const somme = (l: LigneForfait[], f: (x: LigneForfait) => number) => l.reduce((t, x) => t + f(x), 0)
  const ju = somme(n, (x) => x.joursUsagers)
  return (
    <Section titre="Par forfait et variante">
      <Tableau
        entetes={[
          'Forfait',
          'Groupes',
          'Montant',
          'Jours-usagers',
          '$ par jour-usager',
          ...(avecAvant ? [`Montant ${libelleExercice(exercice - 1)}`, `Jours-usagers ${libelleExercice(exercice - 1)}`] : []),
        ]}
        lignes={lignes}
        total={[
          'Total',
          somme(n, (x) => x.groupes),
          dollars(somme(n, (x) => x.montant)),
          entier(ju),
          ju ? dollars(somme(n, (x) => x.montant) / ju) : '—',
          ...(avecAvant ? [dollars(somme(avant, (x) => x.montant)), entier(somme(avant, (x) => x.joursUsagers))] : []),
        ]}
      />
      <p className="mt-2 text-xs text-pierre-500">Jours-usagers = (participants + accompagnateurs) × jours du séjour, comme la colonne « Jours/Usager » du Sheets.</p>
    </Section>
  )
}

function GroupesParMois({ mois, auj }: { mois: ReturnType<typeof groupesParMois>; auj: string }) {
  const [ouvert, setOuvert] = useState<number | null>(null)
  return (
    <Section titre="Groupes par mois">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-pierre-200 text-left text-xs uppercase tracking-wide text-pierre-500">
              <th className="px-2 py-1.5 font-medium">Mois</th>
              <th className="px-2 py-1.5 text-right font-medium">Groupes</th>
              <th className="px-2 py-1.5 text-right font-medium">Montant</th>
              <th className="px-2 py-1.5 text-right font-medium">Jours-usagers</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pierre-100">
            {mois.map((m) => (
              <Fragment key={m.mois}>
                <tr className={m.groupes.length ? 'cursor-pointer hover:bg-pierre-50' : 'text-pierre-400'} onClick={() => m.groupes.length && setOuvert(ouvert === m.mois ? null : m.mois)}>
                  <td className="px-2 py-1.5">
                    {m.groupes.length ? <span className="mr-1 inline-block w-3 text-pierre-400">{ouvert === m.mois ? '▾' : '▸'}</span> : <span className="mr-1 inline-block w-3" />}
                    {NOMS_MOIS[m.mois - 1]}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{m.groupes.length}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{dollars(m.montant)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{entier(m.joursUsagers)}</td>
                </tr>
                {ouvert === m.mois &&
                  m.groupes.map((r) => (
                    <tr key={r.id} className="bg-pierre-50/60 text-xs">
                      <td className="py-1 pl-8 pr-2">
                        <Link to={`/reservations/r/${r.id}`} className="text-foret-700 underline">
                          {r.numero}
                        </Link>{' '}
                        {r.nom} <span className="text-pierre-500">· {nomLigneForfait({ forfait: r.forfait, variante: r.variante })} · {dateCourte(r.date_arrivee, auj)}</span>
                      </td>
                      <td />
                      <td className="px-2 py-1 text-right tabular-nums">{dollars(montant(r))}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{entier(joursUsagers(r))}</td>
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function Occupation({
  rs,
  exercice,
  auj,
  lits,
  forme,
  changerForme,
}: {
  rs: R[]
  exercice: number
  auj: string
  lits: { code: string; nom: string; lits: number }[]
  forme: Forme
  changerForme: (f: Forme) => void
}) {
  const moisAuj = Number(auj.slice(5, 7))
  const [mois, setMois] = useState(MOIS_EXERCICE.includes(moisAuj) && anneeDuMois(exercice, moisAuj) === Number(auj.slice(0, 4)) ? moisAuj : 10)
  const [survol, setSurvol] = useState<{ code: string; jour: string; r: R | null } | null>(null)
  const parMois = occupationParMois(rs, lits, exercice)
  const g = grilleOccupation(rs, anneeDuMois(exercice, mois), mois)
  const ceMois = parMois.find((m) => m.mois === mois)!
  const nomSection = (code: string) => lits.find((l) => l.code === code)?.nom ?? code
  return (
    <Section titre="Occupation des sections" action={<ChoixForme forme={forme} changer={changerForme} />}>
      <p className="mb-2 text-sm text-pierre-600">Lits × nuits occupés par des réservations confirmées (Airbnb compris), sur les lits des sections dans Rooming.</p>
      <GraphiqueMois
        forme={forme}
        categories={MOIS_EXERCICE.map((m) => COURTS[m - 1])}
        series={[{ nom: 'Occupation', couleur: COULEURS[0], valeurs: parMois.map((m) => Math.round(m.taux * 1000) / 10) }]}
        format={(v) => `${v.toLocaleString('fr-CA')} %`}
        formatAxe={(v) => `${v} %`}
      />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-pierre-600">Mois</span>
          <select className={champPetit} value={mois} onChange={(e) => setMois(Number(e.target.value))}>
            {MOIS_EXERCICE.map((m) => (
              <option key={m} value={m}>
                {NOMS_MOIS[m - 1]} {anneeDuMois(exercice, m)} · {pct(parMois.find((x) => x.mois === m)!.taux)}
              </option>
            ))}
          </select>
        </label>
        <span className="flex items-center gap-3 text-xs text-pierre-600">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COULEURS[0] }} /> Groupe
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COULEURS[1] }} /> Airbnb
          </span>
        </span>
      </div>
      <div className="mt-2 overflow-x-auto">
        <div className="grid min-w-[640px] gap-[2px]" style={{ gridTemplateColumns: `3rem repeat(${g.jours.length}, minmax(0, 1fr))` }}>
          <span />
          {g.jours.map((j) => (
            <span key={j} className={`text-center text-[10px] ${j === auj ? 'font-bold text-pierre-900' : 'text-pierre-500'}`}>
              {Number(j.slice(8))}
            </span>
          ))}
          {g.sections.map((s) => (
            <Fragment key={s.code}>
              <span className="pr-1 text-right text-xs text-pierre-600" title={nomSection(s.code)}>
                {s.code}
              </span>
              {s.nuits.map((r, i) => (
                <button
                  key={g.jours[i]}
                  type="button"
                  aria-label={`${s.code} ${g.jours[i]} : ${r ? `${r.numero} ${r.nom}` : 'libre'}`}
                  className={`h-5 rounded-sm ${r ? '' : 'bg-pierre-100'} ${survol?.code === s.code && survol.jour === g.jours[i] ? 'ring-2 ring-pierre-700' : ''}`}
                  style={r ? { background: r.origine === 'airbnb' ? COULEURS[1] : COULEURS[0] } : undefined}
                  onMouseEnter={() => setSurvol({ code: s.code, jour: g.jours[i], r })}
                  onFocus={() => setSurvol({ code: s.code, jour: g.jours[i], r })}
                  onMouseLeave={() => setSurvol(null)}
                />
              ))}
            </Fragment>
          ))}
        </div>
      </div>
      <p className="mt-2 min-h-5 text-sm text-pierre-700">
        {survol ? (
          <>
            {nomSection(survol.code)}, nuit du {dateCourte(survol.jour, auj)} :{' '}
            {survol.r ? (
              <Link to={`/reservations/r/${survol.r.id}`} className="text-foret-700 underline">
                {survol.r.numero} {survol.r.nom}
              </Link>
            ) : (
              'libre'
            )}
          </>
        ) : (
          <span className="text-pierre-500">Survolez une case pour voir qui l'occupe.</span>
        )}
      </p>
      {ceMois.sansSection > 0 && (
        <p className="mt-1 text-xs text-amber-700">
          {ceMois.sansSection} groupe(s) confirmé(s) arrivé(s) ce mois-là sans section choisie : pas comptés (souvent des classes nature).
        </p>
      )}
    </Section>
  )
}
