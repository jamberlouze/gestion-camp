import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Dialogue } from '@/lib/Dialogue'
import { ui } from '@/lib/ui'
import { exerciceDe, libelleExercice, repasProposes, varianteProposee } from './calcul'
import { ChoixOrganisation } from './ChoixOrganisation'
import { PuceEtape, Puces } from './commun'
import { useDonnees } from './contexte'
import { heuresNormales } from './parametres'
import { argent, champPetit, nomForfait, normaliser, periode } from './format'
import { useAjouterReservation } from './donnees'
import { ETAPES, FORFAITS, type Forfait, type Reservation } from './types'

type Vue = 'actives' | 'nouvelles' | 'a_valider' | 'non_confirmees' | 'confirmees' | 'a_facturer' | 'closed_lost' | 'toutes'

const rang = (r: Reservation) => ETAPES.findIndex((e) => e.valeur === r.etape)
const RANG_CONFIRMEE = ETAPES.findIndex((e) => e.valeur === 'confirmee')
const RANG_TERMINEE = ETAPES.findIndex((e) => e.valeur === 'terminee')

// Les vues filtrées des Sheets (INFOS Demandes), en puces.
const VUES: { id: Vue; nom: string; garde: (r: Reservation) => boolean }[] = [
  { id: 'actives', nom: 'Actives', garde: (r) => !r.fermeture && rang(r) < RANG_TERMINEE },
  { id: 'nouvelles', nom: 'Nouvelles demandes', garde: (r) => !r.fermeture && r.etape === 'nouvelle' },
  // Demandes du formulaire pas encore reliées au CRM (et toute réservation sans organisation).
  { id: 'a_valider', nom: 'À valider', garde: (r) => !r.fermeture && !r.organisation_id },
  { id: 'non_confirmees', nom: 'Non confirmées', garde: (r) => !r.fermeture && rang(r) < RANG_CONFIRMEE },
  { id: 'confirmees', nom: 'Confirmées', garde: (r) => !r.fermeture && rang(r) >= RANG_CONFIRMEE },
  { id: 'a_facturer', nom: 'Factures finales à faire', garde: (r) => !r.fermeture && r.etape === 'terminee' },
  { id: 'closed_lost', nom: 'Closed lost', garde: (r) => r.fermeture === 'closed_lost' },
  { id: 'toutes', nom: 'Toutes', garde: () => true },
]

/** Liste des réservations, avec les vues de l'ancien Sheets. */
export function Liste() {
  const { reservations, orgParId, nomResponsable, ecriture, auj } = useDonnees()
  const naviguer = useNavigate()
  const [params, setParams] = useSearchParams()
  const vue = (params.get('vue') as Vue) || 'actives'
  const exercice = params.get('exercice') ?? String(exerciceDe(auj))
  const forfait = (params.get('forfait') as Forfait | null) ?? ''
  const [recherche, setRecherche] = useState('')
  const [nouvelle, setNouvelle] = useState(false)

  const changer = (cle: string, valeur: string) => {
    const p = new URLSearchParams(params)
    if (valeur) p.set(cle, valeur)
    else p.delete(cle)
    setParams(p, { replace: true })
  }

  const exercices = useMemo(
    () => [...new Set([exerciceDe(auj), ...reservations.map((r) => exerciceDe(r.date_arrivee))])].sort((a, b) => b - a),
    [reservations, auj],
  )

  const deLExercice = reservations.filter(
    (r) => (!exercice || exerciceDe(r.date_arrivee) === Number(exercice)) && (!forfait || r.forfait === forfait),
  )
  const q = normaliser(recherche)
  const affichees = deLExercice
    .filter(VUES.find((v) => v.id === vue)!.garde)
    .filter(
      (r) =>
        !q ||
        r.numero.toLowerCase().includes(recherche.trim().toLowerCase()) ||
        normaliser(r.nom).includes(q) ||
        (r.organisation_id && normaliser(orgParId.get(r.organisation_id)?.nom ?? '').includes(q)),
    )
    .sort((a, b) => a.date_arrivee.localeCompare(b.date_arrivee) || a.numero.localeCompare(b.numero))
  const total = affichees.reduce((t, r) => t + Number(r.montant_estime ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Puces options={VUES} valeur={vue} changer={(v) => changer('vue', v === 'actives' ? '' : v)} compte={(id) => deLExercice.filter(VUES.find((v) => v.id === id)!.garde).length} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select aria-label="Exercice" className={champPetit} value={exercice} onChange={(e) => changer('exercice', e.target.value)}>
            {exercices.map((x) => (
              <option key={x} value={x}>
                {libelleExercice(x)}
              </option>
            ))}
            <option value="">Tous les exercices</option>
          </select>
          <select aria-label="Forfait" className={champPetit} value={forfait} onChange={(e) => changer('forfait', e.target.value)}>
            <option value="">Tous les forfaits</option>
            {Object.entries(FORFAITS).map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
          <input className={`${champPetit} w-44`} placeholder="Chercher…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          {ecriture && (
            <button className={ui.bouton} onClick={() => setNouvelle(true)}>
              + Nouvelle réservation
            </button>
          )}
        </div>
      </div>

      {affichees.length === 0 ? (
        <p className="py-10 text-center text-sm text-pierre-500">Aucune réservation dans cette vue.</p>
      ) : (
        <div className={`${ui.carte} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className="border-b border-pierre-200 text-left text-xs uppercase tracking-wide text-pierre-500">
              <tr>
                <th className="px-3 py-2 font-medium">N°</th>
                <th className="px-3 py-2 font-medium">Groupe</th>
                <th className="px-3 py-2 font-medium">Forfait</th>
                <th className="px-3 py-2 font-medium">Dates</th>
                <th className="px-3 py-2 text-right font-medium">Pers.</th>
                <th className="px-3 py-2 font-medium">Étape</th>
                <th className="px-3 py-2 text-right font-medium">Estimé</th>
                <th className="px-3 py-2 font-medium">Responsable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pierre-100">
              {affichees.map((r) => {
                const org = r.organisation_id ? orgParId.get(r.organisation_id) : undefined
                return (
                  <tr key={r.id} className="cursor-pointer hover:bg-pierre-50" onClick={() => naviguer(`/reservations/r/${r.id}`)}>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-pierre-600">{r.numero}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-pierre-900">{r.nom}</div>
                      {org && org.nom !== r.nom && <div className="text-xs text-pierre-500">{org.nom}</div>}
                      {!r.organisation_id && <div className="text-xs text-amber-700">Organisation à valider</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-pierre-700">{nomForfait(r)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-pierre-700">{periode(r)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {(r.nb_participants ?? 0) + (r.nb_accompagnateurs ?? 0) || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <PuceEtape r={r} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{argent(r.montant_estime)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-pierre-600">{nomResponsable(r.responsable_id) ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t border-pierre-200 text-pierre-600">
              <tr>
                <td className="px-3 py-2" colSpan={6}>
                  {affichees.length} réservation{affichees.length > 1 ? 's' : ''}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">{argent(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {nouvelle && <NouvelleReservation fermer={() => setNouvelle(false)} />}
    </div>
  )
}

/** Saisie d'une réservation par l'équipe (les demandes du formulaire public arrivent toutes seules, « À valider »). */
function NouvelleReservation({ fermer }: { fermer: () => void }) {
  const { reglages, compagnieDefaut, moi } = useDonnees()
  const ajouter = useAjouterReservation()
  const naviguer = useNavigate()
  const [orgId, setOrgId] = useState<string | null>(null)
  const [nom, setNom] = useState('')
  const [forfait, setForfait] = useState<Forfait>('classe_nature')
  const [arrivee, setArrivee] = useState('')
  const [depart, setDepart] = useState('')
  const [participants, setParticipants] = useState('')
  const unJour = forfait === 'journee_plein_air' || forfait === 'location_salle'

  const creer = () => {
    if (!nom.trim() || !arrivee || !compagnieDefaut) return
    const dateDepart = unJour || !depart ? arrivee : depart
    const variante = forfait === 'location_salle' ? 'jour' : varianteProposee(forfait, arrivee, reglages.variantesClasse)
    const heures = heuresNormales(reglages, forfait, variante)
    const serviceRepas = forfait === 'classe_nature'
    const repas = repasProposes(
      { forfait, date_arrivee: arrivee, date_depart: dateDepart, service_repas: serviceRepas, heure_arrivee: heures?.[0] ?? null, heure_depart: heures?.[1] ?? null },
      reglages.heuresRepas,
    )
    const id = crypto.randomUUID()
    ajouter.mutate(
      {
        id,
        nom: nom.trim(),
        compagnie_id: compagnieDefaut.id,
        organisation_id: orgId,
        forfait,
        variante,
        date_arrivee: arrivee,
        date_depart: dateDepart,
        heure_arrivee: heures?.[0] ?? null,
        heure_depart: heures?.[1] ?? null,
        heures_regulieres: heures ? true : null,
        nb_participants: participants ? Number(participants) : null,
        ratio: forfait === 'classe_nature' || forfait === 'journee_plein_air' ? reglages.ratioDefaut : null,
        service_repas: serviceRepas,
        nb_dejeuners: repas.dejeuners,
        nb_diners: repas.diners,
        nb_soupers: repas.soupers,
        responsable_id: moi.id,
        origine: 'app',
      } as Partial<Reservation> & { id: string },
      { onSuccess: () => naviguer(`/reservations/r/${id}`) },
    )
  }

  return (
    <Dialogue titre="Nouvelle réservation" fermer={fermer}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          creer()
        }}
      >
        <div>
          <span className={ui.etiquette}>Organisation (CRM)</span>
          <ChoixOrganisation
            autoFocus
            valeur={orgId}
            changer={(id, org) => {
              setOrgId(id)
              if (org && !nom.trim()) setNom(org.nom)
            }}
          />
        </div>
        <label className="block">
          <span className={ui.etiquette}>Nom du groupe</span>
          <input className={ui.champ} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="École Saint-Édouard, Famille Tremblay…" />
        </label>
        <label className="block">
          <span className={ui.etiquette}>Forfait</span>
          <select className={ui.champ} value={forfait} onChange={(e) => setForfait(e.target.value as Forfait)}>
            {Object.entries(FORFAITS).map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={ui.etiquette}>{unJour ? 'Date' : 'Arrivée'}</span>
            <input type="date" className={ui.champ} value={arrivee} onChange={(e) => setArrivee(e.target.value)} />
          </label>
          {!unJour && (
            <label className="block">
              <span className={ui.etiquette}>Départ</span>
              <input type="date" className={ui.champ} value={depart} min={arrivee} onChange={(e) => setDepart(e.target.value)} />
            </label>
          )}
          <label className="block">
            <span className={ui.etiquette}>{forfait === 'classe_nature' || forfait === 'journee_plein_air' ? 'Élèves' : 'Personnes'}</span>
            <input type="number" min={0} className={ui.champ} value={participants} onChange={(e) => setParticipants(e.target.value)} />
          </label>
        </div>
        <p className="text-xs text-pierre-500">
          Heures normales, ratio ({reglages.ratioDefaut}), variante et repas sont proposés ; tout se modifie dans la fiche.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button className={ui.bouton} disabled={!nom.trim() || !arrivee || ajouter.isPending}>
            Créer
          </button>
        </div>
      </form>
    </Dialogue>
  )
}
