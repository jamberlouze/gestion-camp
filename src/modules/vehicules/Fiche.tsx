import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { IconePlus } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { BadgeStatut, DateEcheance, Photo } from './commun'
import { changerPhoto, supprimerVehicule, useFlotte, useModifier, type Flotte } from './donnees'
import { Champ, FormEntretien, FormInspection } from './Formulaires'
import { argent, aujourdhui, compteurLisible, dateLisible, echeancesDe, lireNombre } from './outils'
import { RESULTATS, STATUTS, TYPES, type Entretien, type Inspection, type Vehicule } from './types'

export function Fiche() {
  const { id } = useParams()
  const flotte = useFlotte()
  const v = flotte.vehicules.find((x) => x.id === id)

  if (!flotte.pret) {
    return flotte.erreur ? (
      <p className={ui.erreur}>{messageErreur(flotte.erreur)}</p>
    ) : (
      <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
    )
  }
  if (!v) {
    return (
      <p className="py-8 text-center text-sm text-pierre-500">
        Ce véhicule n'existe plus.{' '}
        <Link to="/vehicules" className="text-foret-700 underline">
          Retour à la flotte
        </Link>
      </p>
    )
  }
  // La clé remonte la fiche quand on passe d'un véhicule à l'autre (champs neufs).
  return <FicheVehicule key={v.id} v={v} flotte={flotte} />
}

function FicheVehicule({ v, flotte }: { v: Vehicule; flotte: Flotte }) {
  const { peutEcrire } = useAuth()
  const ecriture = peutEcrire('vehicules')
  const modifier = useModifier<Vehicule>('vehicules')
  const maj = (champs: Partial<Vehicule>) => modifier.mutate({ id: v.id, champs })
  const jour = aujourdhui()
  const inspections = flotte.inspections.get(v.id) ?? []
  const entretiens = flotte.entretiens.filter((e) => e.vehicule_id === v.id).sort((a, b) => b.date.localeCompare(a.date))
  const [immatriculation, assurance, inspection] = echeancesDe(v, inspections, jour)
  const remise = v.statut === 'remise'

  /** Champ texte enregistré à la sortie ; vide = null. */
  const texte = (champ: keyof Vehicule, majuscules?: boolean) => (
    <ChampTexte
      className={`${ui.champ} ${majuscules ? 'font-mono uppercase' : ''}`}
      disabled={!ecriture}
      valeur={(v[champ] as string | null) ?? ''}
      enregistrer={(x) => maj({ [champ]: (majuscules ? x.toUpperCase() : x) || null })}
    />
  )

  const entier = (champ: 'annee' | 'places', min: number, max: number) => (
    <ChampEntier valeur={v[champ]} min={min} max={max} disabled={!ecriture} enregistrer={(n) => maj({ [champ]: n })} />
  )

  const date = (champ: 'immatriculation_echeance' | 'assurance_echeance') => (
    <ChampDate valeur={v[champ]} disabled={!ecriture} enregistrer={(x) => maj({ [champ]: x })} />
  )

  return (
    <div>
      <Link to="/vehicules" className="text-sm text-foret-700 hover:underline">
        ← Flotte
      </Link>

      <div className="mt-3 flex flex-col gap-5 md:flex-row">
        <ZonePhoto v={v} ecriture={ecriture} />
        <div className="min-w-0 flex-1">
          <ChampTexte
            aria-label="Surnom"
            obligatoire
            disabled={!ecriture}
            className="w-full rounded-lg border border-transparent px-2 py-1 text-2xl font-semibold hover:border-pierre-200 focus:border-foret-600 focus:outline-none disabled:hover:border-transparent"
            valeur={v.surnom}
            enregistrer={(x) => maj({ surnom: x })}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 px-2">
            {ecriture ? (
              <div className="inline-flex rounded-lg border border-pierre-300 p-0.5" role="group" aria-label="Statut">
                {STATUTS.map((s) => (
                  <button
                    key={s.id}
                    aria-pressed={v.statut === s.id}
                    onClick={() => v.statut !== s.id && maj({ statut: s.id })}
                    className={`rounded-md px-3 py-1 text-sm font-medium ${
                      v.statut === s.id ? (s.id === 'remise' ? 'bg-pierre-600 text-white' : 'bg-foret-700 text-white') : 'text-pierre-600 hover:bg-pierre-50'
                    }`}
                  >
                    {s.libelle}
                  </button>
                ))}
              </div>
            ) : (
              <BadgeStatut statut={v.statut} />
            )}
          </div>
          {remise && (
            <p className="mt-2 px-2 text-sm text-pierre-500">Remisé : les échéances de ce véhicule ne sont pas signalées.</p>
          )}

          <div className="mt-4 grid gap-3 px-2 sm:grid-cols-3">
            <Echeance titre="Immatriculation" e={immatriculation} jour={jour} remise={remise} />
            <Echeance titre="Assurance" e={assurance} jour={jour} remise={remise} />
            <Echeance titre="Prochaine inspection" e={inspection} jour={jour} remise={remise} />
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Section titre="Identification">
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ libelle="Type">
              <select className={ui.champ} disabled={!ecriture} value={v.type} onChange={(e) => maj({ type: e.target.value as Vehicule['type'] })}>
                {TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.libelle}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ libelle="Compagnie propriétaire">
              <select
                className={ui.champ}
                disabled={!ecriture}
                value={v.proprietaire_id ?? ''}
                onChange={(e) => maj({ proprietaire_id: e.target.value || null })}
              >
                <option value="">À préciser</option>
                {flotte.proprietaires
                  .filter((p) => p.actif || p.id === v.proprietaire_id)
                  .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ libelle="Marque">{texte('marque')}</Champ>
            <Champ libelle="Modèle">{texte('modele')}</Champ>
            <Champ libelle="Année">{entier('annee', 1950, 2100)}</Champ>
            <Champ libelle="Couleur">{texte('couleur')}</Champ>
            <Champ libelle="NIV (numéro de série)" className="sm:col-span-2">
              {texte('niv', true)}
            </Champ>
            {v.type !== 'remorque' && <Champ libelle="Places">{entier('places', 0, 100)}</Champ>}
          </div>
        </Section>

        <div className="space-y-5">
          <Section titre="Immatriculation">
            <div className="grid gap-3 sm:grid-cols-2">
              <Champ libelle="Plaque">{texte('plaque', true)}</Champ>
              <Champ libelle="Échéance">{date('immatriculation_echeance')}</Champ>
            </div>
          </Section>
          <Section titre="Assurance">
            <div className="grid gap-3 sm:grid-cols-2">
              <Champ libelle="Assureur">{texte('assureur')}</Champ>
              <Champ libelle="Numéro de police">{texte('police_assurance')}</Champ>
              <Champ libelle="Échéance">{date('assurance_echeance')}</Champ>
            </div>
          </Section>
        </div>
      </div>

      <Inspections v={v} inspections={inspections} flotte={flotte} ecriture={ecriture} />
      <Entretiens v={v} entretiens={entretiens} flotte={flotte} ecriture={ecriture} />

      <Section titre="Notes" className="mt-5">
        <ChampNotes valeur={v.notes ?? ''} disabled={!ecriture} enregistrer={(x) => maj({ notes: x || null })} />
      </Section>

      {ecriture && <Suppression v={v} />}
    </div>
  )
}

function Section({ titre, action, children, className = '' }: { titre: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${ui.carte} p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{titre}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Echeance({ titre, e, jour, remise }: { titre: string; e: ReturnType<typeof echeancesDe>[number]; jour: string; remise: boolean }) {
  return (
    <div className="rounded-lg bg-pierre-50 px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-pierre-500">{titre}</p>
      <p className="mt-0.5 text-sm font-medium">
        {remise && e.date ? <span className="text-pierre-500">{dateLisible(e.date)}</span> : <DateEcheance date={e.date} etat={e.etat} jour={jour} />}
      </p>
    </div>
  )
}

/** Nombre entier enregistré à la sortie ; une saisie illisible reprend la valeur d'avant. */
function ChampEntier({
  valeur,
  min,
  max,
  enregistrer,
  disabled,
}: {
  valeur: number | null
  min: number
  max: number
  enregistrer: (n: number | null) => void
  disabled: boolean
}) {
  const [texte, setTexte] = useState(valeur?.toString() ?? '')
  const [base, setBase] = useState(valeur)
  if (valeur !== base) {
    setBase(valeur)
    setTexte(valeur?.toString() ?? '')
  }
  return (
    <input
      className={ui.champ}
      inputMode="numeric"
      disabled={disabled}
      value={texte}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={() => {
        const n = lireNombre(texte)
        if (n !== undefined && (n === null || (Number.isInteger(n) && n >= min && n <= max))) {
          if (n !== valeur) enregistrer(n)
        } else setTexte(valeur?.toString() ?? '')
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

/** Date enregistrée à la sortie du champ (la saisie au clavier passe par des dates partielles). */
function ChampDate({ valeur, enregistrer, disabled }: { valeur: string | null; enregistrer: (v: string | null) => void; disabled: boolean }) {
  const [date, setDate] = useState(valeur ?? '')
  const [base, setBase] = useState(valeur)
  if (valeur !== base) {
    setBase(valeur)
    setDate(valeur ?? '')
  }
  return (
    <input
      type="date"
      className={ui.champ}
      disabled={disabled}
      value={date}
      onChange={(e) => setDate(e.target.value)}
      onBlur={() => (date || null) !== valeur && enregistrer(date || null)}
    />
  )
}

function ChampNotes({ valeur, enregistrer, disabled }: { valeur: string; enregistrer: (v: string) => void; disabled: boolean }) {
  const [texte, setTexte] = useState(valeur)
  const [base, setBase] = useState(valeur)
  if (valeur !== base) {
    setBase(valeur)
    setTexte(valeur)
  }
  return (
    <textarea
      className={ui.champ}
      rows={4}
      disabled={disabled}
      placeholder="Clés, particularités, où il est rangé…"
      value={texte}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={() => texte.trim() !== valeur && enregistrer(texte.trim())}
    />
  )
}

function ZonePhoto({ v, ecriture }: { v: Vehicule; ecriture: boolean }) {
  const client = useQueryClient()
  const fichier = useRef<HTMLInputElement>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function changer(f: File | null) {
    setEnCours(true)
    setErreur(null)
    try {
      await changerPhoto(v, f)
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setEnCours(false)
      client.invalidateQueries({ queryKey: ['vehicules', 'vehicules'] })
    }
  }

  return (
    <div className="w-full shrink-0 md:w-80">
      <Photo chemin={v.photo} type={v.type} className="aspect-[4/3] w-full rounded-xl" />
      {ecriture && (
        <div className="mt-2 flex gap-2">
          <input
            ref={fichier}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) changer(f)
            }}
          />
          <button className={ui.boutonSecondaire} disabled={enCours} onClick={() => fichier.current?.click()}>
            {enCours ? 'Envoi…' : v.photo ? 'Changer la photo' : 'Ajouter une photo'}
          </button>
          {v.photo && (
            <button
              className={ui.boutonDanger}
              disabled={enCours}
              onClick={async () => {
                if (await confirmer({ titre: 'Retirer la photo ?', libelleOk: 'Retirer', danger: true })) changer(null)
              }}
            >
              Retirer
            </button>
          )}
        </div>
      )}
      {erreur && <p className={`${ui.erreur} mt-2`}>{erreur}</p>}
    </div>
  )
}

const LIBELLES_RESULTAT = Object.fromEntries(RESULTATS.map((r) => [r.id, r.libelle]))
const COULEURS_RESULTAT = { conforme: 'text-foret-700', mineures: 'text-amber-700', majeures: 'text-red-700' }

function Inspections({ v, inspections, flotte, ecriture }: { v: Vehicule; inspections: Inspection[]; flotte: Flotte; ecriture: boolean }) {
  const [ouverte, setOuverte] = useState<Inspection | 'nouvelle' | null>(null)
  const ateliers = [...[...flotte.inspections.values()].flat().map((i) => i.atelier), ...flotte.entretiens.map((e) => e.fournisseur)]
  return (
    <Section
      titre="Inspections"
      className="mt-5"
      action={
        ecriture && (
          <button className={ui.boutonSecondaire} onClick={() => setOuverte('nouvelle')}>
            <IconePlus /> Inspection
          </button>
        )
      }
    >
      {inspections.length === 0 ? (
        <p className="text-sm text-pierre-500">Aucune inspection inscrite.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-pierre-500">
              <tr>
                <th className="px-4 pb-2 font-medium">Date</th>
                <th className="px-2 pb-2 font-medium">Type</th>
                <th className="px-2 pb-2 font-medium">Résultat</th>
                <th className="px-2 pb-2 font-medium">Garage</th>
                <th className="px-2 pb-2 text-right font-medium">Coût</th>
                <th className="px-4 pb-2 font-medium">Prochaine</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pierre-100">
              {inspections.map((i) => (
                <tr
                  key={i.id}
                  className={ecriture ? 'cursor-pointer hover:bg-pierre-50' : ''}
                  onClick={() => ecriture && setOuverte(i)}
                >
                  <td className="whitespace-nowrap px-4 py-2">{dateLisible(i.date)}</td>
                  <td className="px-2 py-2">
                    {i.type}
                    {i.notes && <p className="text-xs text-pierre-500">{i.notes}</p>}
                  </td>
                  <td className={`px-2 py-2 ${i.resultat ? COULEURS_RESULTAT[i.resultat] : ''}`}>{i.resultat ? LIBELLES_RESULTAT[i.resultat] : '—'}</td>
                  <td className="px-2 py-2">{i.atelier ?? '—'}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">{argent(i.cout)}</td>
                  <td className="whitespace-nowrap px-4 py-2">{dateLisible(i.prochaine)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ouverte && (
        <FormInspection
          vehicule={v}
          inspection={ouverte === 'nouvelle' ? undefined : ouverte}
          ateliers={ateliers}
          fermer={() => setOuverte(null)}
        />
      )}
    </Section>
  )
}

function Entretiens({ v, entretiens, flotte, ecriture }: { v: Vehicule; entretiens: Entretien[]; flotte: Flotte; ecriture: boolean }) {
  const [ouvert, setOuvert] = useState<Entretien | 'nouveau' | null>(null)
  const total = entretiens.reduce((s, e) => s + (e.cout ?? 0), 0)
  return (
    <Section
      titre="Registre d'entretien"
      className="mt-5"
      action={
        ecriture && (
          <button className={ui.boutonSecondaire} onClick={() => setOuvert('nouveau')}>
            <IconePlus /> Entretien
          </button>
        )
      }
    >
      {entretiens.length === 0 ? (
        <p className="text-sm text-pierre-500">Aucun entretien inscrit.</p>
      ) : (
        <TableEntretiens entretiens={entretiens} vehicules={[v]} ouvrir={ecriture ? setOuvert : undefined} total={total} />
      )}
      {ouvert && (
        <FormEntretien
          vehicule={v}
          entretien={ouvert === 'nouveau' ? undefined : ouvert}
          deja={flotte.entretiens}
          fermer={() => setOuvert(null)}
        />
      )}
    </Section>
  )
}

/** Tableau d'entretiens (fiche d'un véhicule ou registre de toute la flotte). */
export function TableEntretiens({
  entretiens,
  vehicules,
  ouvrir,
  total,
  avecVehicule,
}: {
  entretiens: Entretien[]
  vehicules: Vehicule[]
  ouvrir?: (e: Entretien) => void
  total: number
  avecVehicule?: boolean
}) {
  const vehicule = new Map(vehicules.map((v) => [v.id, v]))
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-pierre-500">
          <tr>
            <th className="px-4 pb-2 font-medium">Date</th>
            {avecVehicule && <th className="px-2 pb-2 font-medium">Véhicule</th>}
            <th className="px-2 pb-2 font-medium">Entretien</th>
            <th className="px-2 pb-2 font-medium">Compteur</th>
            <th className="px-2 pb-2 font-medium">Garage</th>
            <th className="px-4 pb-2 text-right font-medium">Coût</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-pierre-100">
          {entretiens.map((e) => {
            const v = vehicule.get(e.vehicule_id)
            return (
              <tr key={e.id} className={ouvrir ? 'cursor-pointer hover:bg-pierre-50' : ''} onClick={() => ouvrir?.(e)}>
                <td className="whitespace-nowrap px-4 py-2 align-top">{dateLisible(e.date)}</td>
                {avecVehicule && (
                  <td className="whitespace-nowrap px-2 py-2 align-top">
                    {v ? (
                      <Link to={`/vehicules/fiche/${v.id}`} className="font-medium hover:underline" onClick={(x) => x.stopPropagation()}>
                        {v.surnom}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                )}
                <td className="px-2 py-2 align-top">
                  <span className="font-medium">{e.type}</span>
                  {e.description && <p className="whitespace-pre-line text-pierre-600">{e.description}</p>}
                </td>
                <td className="whitespace-nowrap px-2 py-2 align-top">{v ? compteurLisible(e.compteur, v.type) : ''}</td>
                <td className="px-2 py-2 align-top">{e.fournisseur ?? ''}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right align-top">{argent(e.cout)}</td>
              </tr>
            )
          })}
        </tbody>
        {total > 0 && (
          <tfoot>
            <tr className="border-t border-pierre-200 font-medium">
              <td className="px-4 pt-2" colSpan={avecVehicule ? 5 : 4}>
                Total
              </td>
              <td className="whitespace-nowrap px-4 pt-2 text-right">{argent(total)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function Suppression({ v }: { v: Vehicule }) {
  const naviguer = useNavigate()
  const client = useQueryClient()
  const [erreur, setErreur] = useState<string | null>(null)

  async function supprimer() {
    const ok = await confirmer({
      titre: `Supprimer ${v.surnom} ?`,
      message: 'La fiche, sa photo, ses inspections et tout son registre d’entretien seront effacés. Pour un véhicule rangé pour la saison, choisissez plutôt « Remisé ».',
      libelleOk: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    try {
      await supprimerVehicule(v)
      client.invalidateQueries({ queryKey: ['vehicules'] })
      naviguer('/vehicules')
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  return (
    <div className="mt-8 border-t border-pierre-200 pt-4">
      <button className={ui.boutonDanger} onClick={supprimer}>
        Supprimer ce véhicule
      </button>
      {erreur && <p className={`${ui.erreur} mt-2`}>{erreur}</p>}
    </div>
  )
}
