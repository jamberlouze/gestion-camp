// Le séjour correspond-il encore à l'estimé accepté ? (réunion du
// 2026-10-21, lot F). Fichier pur : la fiche s'en sert pour son bandeau
// (« le séjour a changé depuis l'estimé accepté : 40 → 42 élèves »).
//
// - Estimé figé depuis le 2026-10-21 : le séjour gardé avec lui
//   (`estimes.sejour`, posé par la base quand il quitte le brouillon) est
//   comparé au séjour d'aujourd'hui, champ par champ, sur ce qui fait le prix.
// - Estimé figé avant : ses lignes calculées sont comparées à celles que le
//   calcul donne aujourd'hui (description et quantité ; pas les prix : une
//   liste de prix validée depuis ne change pas un estimé accepté).
// - Estimé importé (une seule ligne au montant du Sheets) : rien à comparer.

import { differences, infosDe, libelle, valeur, type ChampSejour, type InfosSejour } from './confirmation.ts'
import { FORFAITS, VARIANTES, type Forfait, type Reservation, type Variante } from './types.ts'

/** Ce que l'estimé a pris du séjour (reservations.sejour_estime). */
export interface SejourEstime extends InfosSejour {
  forfait: Forfait
  variante: Variante | null
  etages: string[]
  salles: string[]
  heures_extra: number
  heures_supplementaires: number
}

export interface LigneComparee {
  description: string
  quantite: number
  prix_unitaire?: number
  auto?: boolean
}

/**
 * Lignes calculées qui ne correspondent plus, prises dans l'ordre (même
 * comparaison que l'éditeur de l'estimé, `decale` d'Estime.tsx ; avec
 * `prix`, aussi le prix unitaire, comme l'éditeur). Rend une phrase par ligne.
 */
export function lignesDecalees(auto: LigneComparee[], calcul: LigneComparee[], { prix = false } = {}): string[] {
  const sorties: string[] = []
  for (let i = 0; i < Math.max(auto.length, calcul.length); i++) {
    const a = auto[i]
    const c = calcul[i]
    if (!a) sorties.push(`Nouvelle ligne : ${c.description} (${c.quantite})`)
    else if (!c) sorties.push(`Ligne en trop : ${a.description} (${a.quantite})`)
    else if (a.description !== c.description) sorties.push(`${a.description} (${a.quantite}) → ${c.description} (${c.quantite})`)
    else if (Number(a.quantite) !== Number(c.quantite)) sorties.push(`${a.description} : ${a.quantite} → ${c.quantite}`)
    else if (prix && Number(a.prix_unitaire) !== Number(c.prix_unitaire)) sorties.push(`${a.description} : prix ${a.prix_unitaire} → ${c.prix_unitaire}`)
  }
  return sorties
}

export interface ChangementSejour {
  champ: ChampSejour | 'forfait' | 'variante' | 'etages' | 'salles' | 'heures_extra' | 'heures_supplementaires'
  libelle: string
  avant: string
  apres: string
}

// Âges et langue ne changent pas le prix : pas de nouvel estimé pour eux.
const SANS_PRIX: ChampSejour[] = ['ages', 'langue']

const liste = (l: string[] | null | undefined) => [...(l ?? [])].sort().join(', ') || '—'
const nombre = (n: number | null | undefined) => String(Number(n ?? 0))
const nomVariante = (v: Variante | null) => (v ? (Object.values(VARIANTES).flat().find((x) => x.valeur === v)?.libelle ?? v) : '—')

type SejourActuel = Pick<
  Reservation,
  | 'forfait'
  | 'variante'
  | 'etages'
  | 'salles'
  | 'heures_extra'
  | 'heures_supplementaires'
  | 'date_arrivee'
  | 'date_depart'
  | 'heure_arrivee'
  | 'heure_depart'
  | 'nb_participants'
  | 'nb_accompagnateurs'
  | 'ages'
  | 'langue'
  | 'ratio'
  | 'service_repas'
  | 'nb_dejeuners'
  | 'nb_diners'
  | 'nb_soupers'
>

/** Ce qui a changé dans le séjour depuis l'estimé, parmi ce qui fait le prix. */
export function changementsSejour(avant: SejourEstime, r: SejourActuel): ChangementSejour[] {
  const sorties: ChangementSejour[] = []
  if (avant.forfait !== r.forfait) sorties.push({ champ: 'forfait', libelle: 'Forfait', avant: FORFAITS[avant.forfait], apres: FORFAITS[r.forfait] })
  if ((avant.variante ?? null) !== (r.variante ?? null))
    sorties.push({ champ: 'variante', libelle: r.forfait === 'location_salle' ? 'Location' : 'Variante', avant: nomVariante(avant.variante), apres: nomVariante(r.variante) })
  // Champs du séjour (dates, heures, nombres, ratio, repas) : ceux du forfait d'aujourd'hui.
  for (const d of differences(avant, infosDe(r), r.forfait)) {
    if (SANS_PRIX.includes(d.champ)) continue
    sorties.push({ champ: d.champ, libelle: libelle(d.champ, r.forfait), avant: valeur(d.champ, d.avant), apres: valeur(d.champ, d.apres) })
  }
  if (r.forfait === 'accueil_groupe' && liste(avant.etages) !== liste(r.etages))
    sorties.push({ champ: 'etages', libelle: 'Sections réservées', avant: liste(avant.etages), apres: liste(r.etages) })
  if (r.forfait === 'location_salle' && liste(avant.salles) !== liste(r.salles))
    sorties.push({ champ: 'salles', libelle: 'Salles', avant: liste(avant.salles), apres: liste(r.salles) })
  if (r.forfait === 'classe_nature' && nombre(avant.heures_extra) !== nombre(r.heures_extra))
    sorties.push({ champ: 'heures_extra', libelle: 'Heures en extra', avant: nombre(avant.heures_extra), apres: nombre(r.heures_extra) })
  if (r.forfait === 'location_salle' && nombre(avant.heures_supplementaires) !== nombre(r.heures_supplementaires))
    sorties.push({ champ: 'heures_supplementaires', libelle: 'Heures supplémentaires', avant: nombre(avant.heures_supplementaires), apres: nombre(r.heures_supplementaires) })
  return sorties
}

export interface EcartEstime {
  /** Champs du séjour changés (estimé avec son séjour figé). */
  sejour: ChangementSejour[]
  /** Lignes calculées qui ne correspondent plus (estimé figé avant le 2026-10-21). */
  lignes: string[]
}

/**
 * Écart entre l'estimé accepté et le séjour d'aujourd'hui, ou null s'il
 * correspond encore. `lignes` (celles de l'estimé) et `calcul` (lignes
 * calculées aujourd'hui) ne servent qu'à un estimé sans séjour figé.
 */
export function ecartEstime(
  estime: { importe: boolean; sejour: SejourEstime | null },
  r: SejourActuel,
  lignes: LigneComparee[] | null,
  calcul: LigneComparee[],
): EcartEstime | null {
  if (estime.importe) return null
  if (estime.sejour) {
    const sejour = changementsSejour(estime.sejour, r)
    return sejour.length ? { sejour, lignes: [] } : null
  }
  if (!lignes) return null
  const decalees = lignesDecalees(
    lignes.filter((l) => l.auto),
    calcul,
  )
  return decalees.length ? { sejour: [], lignes: decalees } : null
}

/** « Élèves : 40 → 42 ; Départ : 14 mai 2027 → 15 mai 2027 » (bandeau de la fiche). */
export const resumeEcart = (e: EcartEstime) =>
  e.sejour.length ? e.sejour.map((c) => `${c.libelle} : ${c.avant} → ${c.apres}`).join(' ; ') : e.lignes.join(' ; ')
