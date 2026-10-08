import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BoutonSupprimer } from '@/lib/BoutonsAction'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { ui } from '@/lib/ui'
import { useAjouterContact, useAjouterEchange, useAjouterRelance, useEchanges, useModifierRelance, useRelances } from '@/modules/crm/donnees'
import { GENRES_ECHANGE, type GenreEchange } from '@/modules/crm/types'
import { animateursRequis, gratuites, litsDe, nuitsEntre, repasProposes, varianteProposee } from './calcul'
import { ChoixOrganisation } from './ChoixOrganisation'
import { PuceEtape, Section } from './commun'
import { heuresNormales, useDonnees } from './contexte'
import { champPetit, dateCourte, dateLongue, heure, nomEtape } from './format'
import { useJournal, useModifierReservation, useSupprimerReservation } from './donnees'
import { Estime } from './Estime'
import {
  ETAGES,
  ETAPES,
  FERMETURES,
  FORFAITS,
  RAISONS_PERTE,
  RATIOS,
  SALLES,
  VARIANTES,
  type Fermeture,
  type Forfait,
  type RaisonPerte,
  type Reservation,
} from './types'

/** Fiche d'une réservation. */
export function Fiche() {
  const { id } = useParams()
  const { parId } = useDonnees()
  const r = id ? parId.get(id) : undefined
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
  return <Contenu r={r} />
}

type Changer = (champs: Partial<Reservation>) => void

function Contenu({ r }: { r: Reservation }) {
  const { ecriture } = useDonnees()
  const modifier = useModifierReservation()
  const supprimer = useSupprimerReservation()
  const naviguer = useNavigate()
  const changer: Changer = (champs) => modifier.mutate({ id: r.id, champs })

  return (
    <div className="space-y-5">
      <div>
        <Link to="/reservations" className="text-sm text-pierre-500 hover:text-pierre-800">
          ← Réservations
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <span className="text-xl tabular-nums text-pierre-500">{r.numero}</span>
          <ChampTexte
            aria-label="Nom du groupe"
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 text-xl font-semibold hover:border-pierre-200 focus:border-foret-600 focus:outline-none"
            valeur={r.nom}
            obligatoire
            disabled={!ecriture}
            enregistrer={(nom) => changer({ nom })}
          />
          <PuceEtape r={r} />
          {ecriture && (
            <BoutonSupprimer
              onClick={async () => {
                const ok = await confirmer({
                  titre: `Supprimer la réservation ${r.numero} ?`,
                  message: 'Ses estimés et son journal seront effacés. Pour une demande perdue, utilisez plutôt « Closed lost ».',
                  libelleOk: 'Supprimer',
                  danger: true,
                })
                if (ok) supprimer.mutate(r.id, { onSuccess: () => naviguer('/reservations') })
              }}
            />
          )}
        </div>
      </div>

      <Parcours r={r} changer={changer} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-5">
          <Estime r={r} />
          <Suivi r={r} />
        </div>
        <div className="space-y-5">
          <Client r={r} changer={changer} />
          <Sejour r={r} changer={changer} />
          <Notes r={r} changer={changer} />
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Étapes et fermeture
// ------------------------------------------------------------
function Parcours({ r, changer }: { r: Reservation; changer: Changer }) {
  const { ecriture } = useDonnees()
  const [perte, setPerte] = useState(false)
  const rangActuel = ETAPES.findIndex((e) => e.valeur === r.etape)

  return (
    <div className={`${ui.carte} p-3`}>
      <ol className="flex flex-wrap gap-1">
        {ETAPES.map((e, i) => (
          <li key={e.valeur}>
            <button
              disabled={!ecriture || !!r.fermeture}
              onClick={() => changer({ etape: e.valeur, ...(e.valeur === 'confirmee' && !r.signe_le ? { signe_le: new Date().toISOString().slice(0, 10) } : {}) })}
              className={`rounded-md px-2 py-1 text-xs ${
                i === rangActuel
                  ? 'bg-foret-700 font-medium text-white'
                  : i < rangActuel
                    ? 'bg-foret-50 text-foret-800 hover:bg-foret-100'
                    : 'text-pierre-500 hover:bg-pierre-50'
              } disabled:cursor-default`}
            >
              {e.libelle}
            </button>
          </li>
        ))}
      </ol>
      {ecriture && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-pierre-100 pt-2 text-sm">
          {r.fermeture ? (
            <>
              <span className="text-pierre-600">
                {FERMETURES[r.fermeture]}
                {r.raison_perte && ` — ${RAISONS_PERTE[r.raison_perte]}`}
              </span>
              <button className="text-foret-700 underline" onClick={() => changer({ fermeture: null, raison_perte: null })}>
                Rouvrir
              </button>
            </>
          ) : (
            <>
              <button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50" onClick={() => setPerte(true)}>
                Closed lost…
              </button>
              <button className="rounded-md border border-amber-200 px-2 py-1 text-xs text-amber-800 hover:bg-amber-50" onClick={() => changer({ fermeture: 'en_attente' })}>
                En attente
              </button>
              {ETAPES.findIndex((e) => e.valeur === 'confirmee') <= rangActuel && (
                <button className="rounded-md border border-pierre-300 px-2 py-1 text-xs text-pierre-700 hover:bg-pierre-50" onClick={() => changer({ fermeture: 'annulee' })}>
                  Annulée après signature
                </button>
              )}
            </>
          )}
        </div>
      )}
      {perte && <ClosedLost fermer={() => setPerte(false)} enregistrer={(raison) => changer({ fermeture: 'closed_lost' as Fermeture, raison_perte: raison })} />}
    </div>
  )
}

function ClosedLost({ fermer, enregistrer }: { fermer: () => void; enregistrer: (r: RaisonPerte) => void }) {
  const [raison, setRaison] = useState<RaisonPerte | ''>('')
  return (
    <Dialogue titre="Closed lost" fermer={fermer}>
      <p className="mb-3 text-sm text-pierre-600">Pourquoi la demande est-elle perdue ? (Les rapports compteront les raisons.)</p>
      <div className="grid gap-1">
        {Object.entries(RAISONS_PERTE).map(([v, n]) => (
          <label key={v} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-pierre-50">
            <input type="radio" name="raison" checked={raison === v} onChange={() => setRaison(v as RaisonPerte)} />
            {n}
          </label>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className={ui.boutonSecondaire} onClick={fermer}>
          Annuler
        </button>
        <button
          className={ui.boutonRouge}
          disabled={!raison}
          onClick={() => {
            if (raison) enregistrer(raison)
            fermer()
          }}
        >
          Closed lost
        </button>
      </div>
    </Dialogue>
  )
}

// ------------------------------------------------------------
// Client
// ------------------------------------------------------------
function Client({ r, changer }: { r: Reservation; changer: Changer }) {
  const { contacts, compagnies, responsables, ecriture, nomResponsable } = useDonnees()
  const sesContacts = r.organisation_id ? contacts.filter((c) => c.organisation_id === r.organisation_id) : []

  return (
    <Section titre="Client">
      <div className="space-y-3">
        <div>
          <span className={ui.etiquette}>Organisation</span>
          <ChoixOrganisation valeur={r.organisation_id} disabled={!ecriture} changer={(id) => changer({ organisation_id: id, contact_reservation_id: null, contact_facturation_id: null })} />
          {!r.organisation_id && <p className="mt-1 text-xs text-amber-700">À valider : reliez la demande à une organisation du CRM, ou créez-la.</p>}
        </div>
        {r.organisation_id && (
          <>
            <ChoixContact libelle="Responsable de la réservation" r={r} valeur={r.contact_reservation_id} contacts={sesContacts} changer={(id) => changer({ contact_reservation_id: id })} />
            <ChoixContact
              libelle="Responsable de la facturation"
              vide="— Le même"
              r={r}
              valeur={r.contact_facturation_id}
              contacts={sesContacts}
              changer={(id) => changer({ contact_facturation_id: id })}
            />
          </>
        )}
        <label className="block">
          <span className={ui.etiquette}>Courriel de la direction ou du secrétariat</span>
          <ChampTexte className={ui.champ} type="email" valeur={r.courriel_direction ?? ''} disabled={!ecriture} enregistrer={(v) => changer({ courriel_direction: v || null })} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={ui.etiquette}>Facturé par</span>
            <select className={ui.champ} value={r.compagnie_id} disabled={!ecriture} onChange={(e) => changer({ compagnie_id: e.target.value })}>
              {compagnies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={ui.etiquette}>Responsable interne</span>
            <select className={ui.champ} value={r.responsable_id ?? ''} disabled={!ecriture} onChange={(e) => changer({ responsable_id: e.target.value || null })}>
              <option value="">— Personne</option>
              {r.responsable_id && !responsables.some((x) => x.id === r.responsable_id) && <option value={r.responsable_id}>{nomResponsable(r.responsable_id)}</option>}
              {responsables.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nom}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className={ui.etiquette}>Provenance (source, référence)</span>
          <ChampTexte className={ui.champ} valeur={r.provenance ?? ''} disabled={!ecriture} placeholder="Site web, amie de Vickie, client fidèle…" enregistrer={(v) => changer({ provenance: v || null })} />
        </label>
      </div>
    </Section>
  )
}

function ChoixContact({
  libelle,
  vide = '— Aucun',
  r,
  valeur,
  contacts,
  changer,
}: {
  libelle: string
  vide?: string
  r: Reservation
  valeur: string | null
  contacts: { id: string; nom: string; courriel: string | null; telephone: string | null }[]
  changer: (id: string | null) => void
}) {
  const { ecriture } = useDonnees()
  const ajouter = useAjouterContact()
  const [nouveau, setNouveau] = useState(false)
  const choisi = contacts.find((c) => c.id === valeur)
  return (
    <div>
      <span className={ui.etiquette}>{libelle}</span>
      <div className="flex gap-2">
        <select className={`${ui.champ} min-w-0`} value={valeur ?? ''} disabled={!ecriture} onChange={(e) => (e.target.value === '+' ? setNouveau(true) : changer(e.target.value || null))}>
          <option value="">{vide}</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
          <option value="+">+ Nouveau contact…</option>
        </select>
      </div>
      {choisi && (choisi.courriel || choisi.telephone) && (
        <p className="mt-1 text-xs text-pierre-500">{[choisi.courriel, choisi.telephone].filter(Boolean).join(' · ')}</p>
      )}
      {nouveau && (
        <NouveauContact
          fermer={() => setNouveau(false)}
          creer={(c) => {
            const id = crypto.randomUUID()
            ajouter.mutate(
              { id, organisation_id: r.organisation_id!, nom: c.nom, courriel: c.courriel || null, telephone: c.telephone || null, fonction: null, notes: null, principal: false },
              { onSuccess: () => changer(id) },
            )
          }}
        />
      )}
    </div>
  )
}

function NouveauContact({ fermer, creer }: { fermer: () => void; creer: (c: { nom: string; courriel: string; telephone: string }) => void }) {
  const [c, setC] = useState({ nom: '', courriel: '', telephone: '' })
  return (
    <Dialogue titre="Nouveau contact" fermer={fermer}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!c.nom.trim()) return
          creer({ nom: c.nom.trim(), courriel: c.courriel.trim(), telephone: c.telephone.trim() })
          fermer()
        }}
      >
        <input autoFocus className={ui.champ} placeholder="Prénom et nom" value={c.nom} onChange={(e) => setC({ ...c, nom: e.target.value })} />
        <input className={ui.champ} type="email" placeholder="Courriel" value={c.courriel} onChange={(e) => setC({ ...c, courriel: e.target.value })} />
        <input className={ui.champ} placeholder="Téléphone" value={c.telephone} onChange={(e) => setC({ ...c, telephone: e.target.value })} />
        <div className="flex justify-end gap-2">
          <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button className={ui.bouton} disabled={!c.nom.trim()}>
            Ajouter
          </button>
        </div>
      </form>
    </Dialogue>
  )
}

// ------------------------------------------------------------
// Séjour
// ------------------------------------------------------------
function Champ({ libelle, children, className = '' }: { libelle: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className={`${ui.etiquette} truncate`} title={libelle}>
        {libelle}
      </span>
      {children}
    </label>
  )
}

function Nombre({ valeur, changer, disabled, pas = 1 }: { valeur: number | null; changer: (n: number | null) => void; disabled?: boolean; pas?: number }) {
  return (
    <ChampTexte
      className={ui.champ}
      type="number"
      min={0}
      step={pas}
      valeur={valeur === null || valeur === undefined ? '' : String(valeur)}
      disabled={disabled}
      enregistrer={(v) => changer(v === '' ? null : Number(v))}
    />
  )
}

function Sejour({ r, changer }: { r: Reservation; changer: Changer }) {
  const { reglages, etages, ecriture, catalogue } = useDonnees()
  const scolaire = r.forfait === 'classe_nature' || r.forfait === 'journee_plein_air'
  const unJour = r.forfait === 'journee_plein_air' || r.forfait === 'location_salle'
  const normales = heuresNormales(reglages, r.forfait, r.variante)
  const nuits = nuitsEntre(r.date_arrivee, r.date_depart)
  const proposes = repasProposes(r, reglages.heuresRepas)
  const repasDiff = proposes.dejeuners !== r.nb_dejeuners || proposes.diners !== r.nb_diners || proposes.soupers !== r.nb_soupers
  const d = !ecriture

  const changerForfait = (forfait: Forfait) =>
    changer({
      forfait,
      variante: forfait === 'location_salle' ? 'jour' : varianteProposee(forfait, r.date_arrivee, reglages.variantesClasse),
      date_depart: forfait === 'journee_plein_air' || forfait === 'location_salle' ? r.date_arrivee : r.date_depart,
      ratio: forfait === 'classe_nature' || forfait === 'journee_plein_air' ? (r.ratio ?? reglages.ratioDefaut) : null,
      service_repas: forfait === 'classe_nature' ? true : r.service_repas,
    })

  return (
    <Section titre="Séjour">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Champ libelle="Forfait">
            <select className={ui.champ} value={r.forfait} disabled={d} onChange={(e) => changerForfait(e.target.value as Forfait)}>
              {Object.entries(FORFAITS).map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
          </Champ>
          {VARIANTES[r.forfait].length > 0 && (
            <Champ libelle={r.forfait === 'location_salle' ? 'Location' : 'Variante'}>
              <select className={ui.champ} value={r.variante ?? ''} disabled={d} onChange={(e) => changer({ variante: (e.target.value || null) as Reservation['variante'] })}>
                <option value="">—</option>
                {VARIANTES[r.forfait].map((v) => (
                  <option key={v.valeur} value={v.valeur}>
                    {v.libelle}
                  </option>
                ))}
              </select>
            </Champ>
          )}
        </div>
        {r.forfait_demande && r.forfait_demande !== r.forfait && (
          <p className="text-xs text-pierre-500">Demandé au formulaire : {FORFAITS[r.forfait_demande]}</p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Champ libelle={unJour ? 'Date' : 'Arrivée'}>
            <input
              type="date"
              className={ui.champ}
              value={r.date_arrivee}
              disabled={d}
              onChange={(e) => e.target.value && changer({ date_arrivee: e.target.value, ...(unJour || e.target.value > r.date_depart ? { date_depart: e.target.value } : {}) })}
            />
          </Champ>
          {!unJour && (
            <Champ libelle={`Départ (${nuits} nuit${nuits > 1 ? 's' : ''})`}>
              <input type="date" className={ui.champ} value={r.date_depart} min={r.date_arrivee} disabled={d} onChange={(e) => e.target.value && changer({ date_depart: e.target.value })} />
            </Champ>
          )}
          <Champ libelle="Heure d'arrivée">
            <input type="time" className={ui.champ} value={r.heure_arrivee?.slice(0, 5) ?? ''} disabled={d} onChange={(e) => changer({ heure_arrivee: e.target.value || null })} />
          </Champ>
          <Champ libelle="Heure de départ">
            <input type="time" className={ui.champ} value={r.heure_depart?.slice(0, 5) ?? ''} disabled={d} onChange={(e) => changer({ heure_depart: e.target.value || null })} />
          </Champ>
        </div>
        {normales && ecriture && (r.heure_arrivee?.slice(0, 5) !== normales[0] || r.heure_depart?.slice(0, 5) !== normales[1]) && (
          <button className="text-xs text-foret-700 underline" onClick={() => changer({ heure_arrivee: normales[0], heure_depart: normales[1], heures_regulieres: true })}>
            Heures normales : {heure(normales[0])} – {heure(normales[1])}
          </button>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
          <Champ libelle={scolaire ? 'Élèves' : 'Personnes'}>
            <Nombre valeur={r.nb_participants} disabled={d} changer={(n) => changer({ nb_participants: n })} />
          </Champ>
          {scolaire && (
            <Champ libelle="Accompagnateurs">
              <Nombre valeur={r.nb_accompagnateurs} disabled={d} changer={(n) => changer({ nb_accompagnateurs: n })} />
            </Champ>
          )}
          {scolaire && (
            <Champ libelle="Ratio">
              <select className={ui.champ} value={r.ratio ?? ''} disabled={d} onChange={(e) => changer({ ratio: (e.target.value || null) as Reservation['ratio'] })}>
                <option value="">—</option>
                {RATIOS.map((x) => (
                  <option key={x.valeur} value={x.valeur}>
                    {x.libelle}
                  </option>
                ))}
              </select>
            </Champ>
          )}
        </div>
        {scolaire && (
          <p className="text-xs text-pierre-500">
            {animateursRequis(r.nb_participants, r.ratio)} animateur(s) requis ·{' '}
            {gratuites(r.nb_participants, r.nb_accompagnateurs, catalogue.gratuitePar)} accompagnateur(s) gratuit(s) (1:{catalogue.gratuitePar})
          </p>
        )}
        {scolaire && (
          <div className="grid grid-cols-2 gap-3">
            <Champ libelle="Âges et niveaux">
              <ChampTexte className={ui.champ} valeur={r.ages ?? ''} disabled={d} enregistrer={(v) => changer({ ages: v || null })} />
            </Champ>
            <Champ libelle="Langue">
              <ChampTexte className={ui.champ} valeur={r.langue ?? ''} disabled={d} enregistrer={(v) => changer({ langue: v || null })} />
            </Champ>
          </div>
        )}

        <div className="rounded-lg border border-pierre-200 p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={r.service_repas || r.forfait === 'classe_nature'} disabled={d || r.forfait === 'classe_nature'} onChange={(e) => changer({ service_repas: e.target.checked })} />
            Service de repas{r.forfait === 'classe_nature' && ' (toujours inclus en Classe nature)'}
          </label>
          {(r.service_repas || r.forfait === 'classe_nature') && (
            <>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
                <Champ libelle="Déjeuners">
                  <Nombre valeur={r.nb_dejeuners} disabled={d} changer={(n) => changer({ nb_dejeuners: n ?? 0 })} />
                </Champ>
                <Champ libelle="Dîners">
                  <Nombre valeur={r.nb_diners} disabled={d} changer={(n) => changer({ nb_diners: n ?? 0 })} />
                </Champ>
                <Champ libelle="Soupers">
                  <Nombre valeur={r.nb_soupers} disabled={d} changer={(n) => changer({ nb_soupers: n ?? 0 })} />
                </Champ>
                <Champ libelle="Collations">
                  <Nombre valeur={r.nb_collations} disabled={d} changer={(n) => changer({ nb_collations: n ?? 0 })} />
                </Champ>
              </div>
              {repasDiff && ecriture && (
                <button
                  className="mt-1 text-xs text-foret-700 underline"
                  onClick={() => changer({ nb_dejeuners: proposes.dejeuners, nb_diners: proposes.diners, nb_soupers: proposes.soupers })}
                >
                  D'après les heures : {proposes.dejeuners} déjeuner(s), {proposes.diners} dîner(s), {proposes.soupers} souper(s)
                </button>
              )}
            </>
          )}
        </div>

        {r.forfait === 'classe_nature' && (
          <Champ libelle="Heures en extra (hors 10 h – 14 h)">
            <Nombre valeur={r.heures_extra} pas={0.5} disabled={d} changer={(n) => changer({ heures_extra: n ?? 0 })} />
          </Champ>
        )}
        {r.forfait === 'location_salle' && (
          <Champ libelle="Heures supplémentaires">
            <Nombre valeur={r.heures_supplementaires} pas={0.5} disabled={d} changer={(n) => changer({ heures_supplementaires: n ?? 0 })} />
          </Champ>
        )}

        {r.forfait !== 'location_salle' && r.forfait !== 'journee_plein_air' && (
          <div>
            <span className={ui.etiquette}>{r.forfait === 'accueil_groupe' ? 'Sections réservées (facturées au prorata des lits)' : 'Étages occupés'}</span>
            <div className="grid grid-cols-2 gap-1">
              {ETAGES.map((code) => {
                const e = etages.find((x) => x.code === code)
                return (
                  <label key={code} className="flex items-center gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-pierre-50">
                    <input
                      type="checkbox"
                      disabled={d}
                      checked={r.etages.includes(code)}
                      onChange={(ev) => changer({ etages: ev.target.checked ? [...r.etages, code] : r.etages.filter((x) => x !== code) })}
                    />
                    {e?.nom ?? code} <span className="text-xs text-pierre-400">{e ? `${e.lits} lits` : ''}</span>
                  </label>
                )
              })}
            </div>
            {r.etages.length > 0 && <p className="mt-1 text-xs text-pierre-500">{litsDe(r.etages, catalogue.etages).lits} lits au total</p>}
          </div>
        )}
        {r.forfait === 'location_salle' && (
          <div>
            <span className={ui.etiquette}>Salles</span>
            <div className="grid grid-cols-2 gap-1">
              {SALLES.map((s) => (
                <label key={s.code} className="flex items-center gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-pierre-50">
                  <input
                    type="checkbox"
                    disabled={d}
                    checked={r.salles.includes(s.code)}
                    onChange={(ev) => changer({ salles: ev.target.checked ? [...r.salles, s.code] : r.salles.filter((x) => x !== s.code) })}
                  />
                  {s.nom} <span className="text-xs text-pierre-400">{s.batiment === 'Vieille-France' ? 'VF' : 'PP'}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </Section>
  )
}

// ------------------------------------------------------------
// Notes
// ------------------------------------------------------------
function Zone({ libelle, valeur, enregistrer, aide }: { libelle: string; valeur: string | null; enregistrer: (v: string | null) => void; aide?: string }) {
  const { ecriture } = useDonnees()
  const [texte, setTexte] = useState(valeur ?? '')
  const [base, setBase] = useState(valeur ?? '')
  if ((valeur ?? '') !== base) {
    setBase(valeur ?? '')
    setTexte(valeur ?? '')
  }
  return (
    <label className="block">
      <span className={ui.etiquette}>{libelle}</span>
      <textarea
        rows={3}
        className={ui.champ}
        disabled={!ecriture}
        value={texte}
        placeholder={aide}
        onChange={(e) => setTexte(e.target.value)}
        onBlur={() => texte.trim() !== (valeur ?? '') && enregistrer(texte.trim() || null)}
      />
    </label>
  )
}

function Notes({ r, changer }: { r: Reservation; changer: Changer }) {
  const { ecriture } = useDonnees()
  return (
    <Section titre="Notes">
      <div className="space-y-3">
        <Zone libelle="Description du groupe" valeur={r.description} enregistrer={(v) => changer({ description: v })} />
        <Zone libelle="Commentaires du client" valeur={r.commentaires_client} enregistrer={(v) => changer({ commentaires_client: v })} />
        <Zone libelle="Notes au contrat" valeur={r.notes_contrat} aide="Imprimées sur le contrat : clause particulière, n° de bon de commande…" enregistrer={(v) => changer({ notes_contrat: v })} />
        {(r.forfait === 'accueil_groupe' || r.forfait === 'location_salle') && (
          <Champ libelle={`Dépôt de sécurité (${r.forfait === 'accueil_groupe' ? '2 000' : '1 000'} $ par carte)`}>
            <select className={ui.champ} disabled={!ecriture} value={r.depot_securite ?? ''} onChange={(e) => changer({ depot_securite: (e.target.value || null) as Reservation['depot_securite'] })}>
              <option value="">— Pas encore pris</option>
              <option value="pris">Pris à l'arrivée</option>
              <option value="relache">Relâché</option>
              <option value="encaisse">Encaissé (dommages)</option>
            </select>
          </Champ>
        )}
        <Zone libelle="Rétroaction après le séjour" valeur={r.retroaction} enregistrer={(v) => changer({ retroaction: v })} />
      </div>
    </Section>
  )
}

// ------------------------------------------------------------
// Suivi : échanges (CRM), prochaine action, journal
// ------------------------------------------------------------
function Suivi({ r }: { r: Reservation }) {
  const { ecriture, auj, moi, responsables } = useDonnees()
  const echanges = useEchanges()
  const relances = useRelances()
  const journal = useJournal(r.id)
  const ajouterEchange = useAjouterEchange()
  const ajouterRelance = useAjouterRelance()
  const modifierRelance = useModifierRelance()
  const [genre, setGenre] = useState<GenreEchange>('appel')
  const [jour, setJour] = useState(auj)
  const [texte, setTexte] = useState('')
  const [action, setAction] = useState({ titre: '', echeance: '', assigne_a: moi.id })

  const siens = (echanges.data ?? []).filter((e) => e.reservation_id === r.id)
  const actions = (relances.data ?? []).filter((x) => x.reservation_id === r.id && x.statut === 'a_faire')
  const fil = [
    ...siens.map((e) => ({ id: e.id, quand: `${e.jour}T12:00`, icone: GENRES_ECHANGE.find((g) => g.id === e.genre)?.icone ?? '•', texte: e.texte, qui: e.auteur_nom, jour: e.jour })),
    ...(journal.data ?? []).map((j) => ({ id: j.id, quand: j.quand, icone: j.genre === 'fermeture' ? '⛔' : j.genre === 'document' ? '📄' : '➜', texte: j.genre === 'etape' ? traduireEtape(j.texte) : j.texte, qui: j.auteur_nom, jour: j.quand.slice(0, 10) })),
  ].sort((a, b) => b.quand.localeCompare(a.quand))

  const sansOrg = !r.organisation_id

  return (
    <Section titre="Suivi">
      {ecriture && (
        <div className="space-y-4">
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!texte.trim() || sansOrg) return
              ajouterEchange.mutate({ id: crypto.randomUUID(), organisation_id: r.organisation_id!, reservation_id: r.id, contact_id: r.contact_reservation_id, genre, jour, texte: texte.trim(), auteur: null, auteur_nom: null, created_at: new Date().toISOString() })
              setTexte('')
              setJour(auj)
            }}
          >
            <div className="flex flex-wrap gap-2">
              <select aria-label="Canal" className={champPetit} value={genre} onChange={(e) => setGenre(e.target.value as GenreEchange)} disabled={sansOrg}>
                {GENRES_ECHANGE.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.icone} {g.nom}
                  </option>
                ))}
              </select>
              <input type="date" aria-label="Jour" className={champPetit} value={jour} max={auj} onChange={(e) => setJour(e.target.value || auj)} disabled={sansOrg} />
            </div>
            <div className="flex gap-2">
              <input
                className={`${ui.champ} min-w-0`}
                placeholder={sansOrg ? "Reliez d'abord une organisation (fiche Client)…" : 'Ce qui s’est dit, ce qui a été envoyé…'}
                value={texte}
                disabled={sansOrg}
                onChange={(e) => setTexte(e.target.value)}
              />
              <button className={ui.bouton} disabled={!texte.trim() || sansOrg}>
                Noter
              </button>
            </div>
          </form>

          <div className="rounded-lg border border-pierre-200 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-pierre-500">Prochaine action</p>
            {actions.map((a) => (
              <div key={a.id} className="mb-1 flex items-center gap-2 text-sm">
                <button className="rounded border border-pierre-300 px-1.5 text-xs hover:border-foret-400" onClick={() => modifierRelance.mutate({ id: a.id, champs: { statut: 'faite' } })}>
                  ✓
                </button>
                <span className="flex-1">{a.titre}</span>
                <span className={a.echeance < auj ? 'text-red-700' : 'text-pierre-500'}>{dateCourte(a.echeance, auj)}</span>
              </div>
            ))}
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (!action.titre.trim() || !action.echeance || sansOrg) return
                ajouterRelance.mutate({ id: crypto.randomUUID(), organisation_id: r.organisation_id!, reservation_id: r.id, titre: `${r.numero} : ${action.titre.trim()}`, echeance: action.echeance, assigne_a: action.assigne_a || null, statut: 'a_faire', note: null, source_cle: null, created_at: new Date().toISOString() })
                setAction({ ...action, titre: '', echeance: '' })
              }}
            >
              <input className={`${champPetit} min-w-40 flex-1`} placeholder="Relancer si contrat non signé…" value={action.titre} disabled={sansOrg} onChange={(e) => setAction({ ...action, titre: e.target.value })} />
              <input type="date" aria-label="Échéance" className={champPetit} value={action.echeance} min={auj} disabled={sansOrg} onChange={(e) => setAction({ ...action, echeance: e.target.value })} />
              <select aria-label="Assignée à" className={champPetit} value={action.assigne_a} disabled={sansOrg} onChange={(e) => setAction({ ...action, assigne_a: e.target.value })}>
                {responsables.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nom}
                  </option>
                ))}
              </select>
              <button className={ui.boutonSecondaire} disabled={!action.titre.trim() || !action.echeance || sansOrg}>
                Ajouter
              </button>
            </form>
            <p className="mt-1 text-xs text-pierre-400">Visible aussi dans les relances du CRM.</p>
          </div>
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {fil.map((x) => (
          <li key={x.id} className="flex gap-2 text-sm">
            <span className="w-5 shrink-0 text-center">{x.icone}</span>
            <div className="min-w-0 flex-1">
              <span className="whitespace-pre-wrap">{x.texte}</span>
              <span className="ml-2 text-xs text-pierre-400">
                {dateLongue(x.jour)}
                {x.qui && ` · ${x.qui}`}
              </span>
            </div>
          </li>
        ))}
        {fil.length === 0 && <li className="text-sm text-pierre-500">Rien encore.</li>}
      </ul>
    </Section>
  )
}

/** « nouvelle → contact » en mots. */
function traduireEtape(t: string) {
  return t.replace(/\b(nouvelle|contact|estime_envoye|estime_accepte|contrat_envoye|confirmee|pre_arrivee|terminee|facture_finale|soldee)\b/g, (e) => nomEtape(e as Reservation['etape']))
}
