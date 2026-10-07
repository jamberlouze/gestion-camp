import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { IconeAttention, IconePlus } from '@/lib/icones'
import { PuceCompagnie } from '@/lib/PuceCompagnie'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { BadgeStatut, DateEcheance, PastilleEtat, Photo } from './commun'
import { useEnregistrerLigne, useFlotte, type Flotte as DonneesFlotte } from './donnees'
import { aSurveiller, aujourdhui, dateLisible, delaiLisible, echeancesDe, LIBELLES_QUOI, trierFlotte } from './outils'
import { TYPES, type Statut, type TypeVehicule, type Vehicule } from './types'

interface Filtres {
  type: TypeVehicule | ''
  statut: Statut | ''
  proprietaire: string
}

const FILTRES_VIDES: Filtres = { type: '', statut: '', proprietaire: '' }
const SANS_PROPRIETAIRE = 'aucun'

export function Flotte() {
  const { peutEcrire } = useAuth()
  const ecriture = peutEcrire('vehicules')
  const flotte = useFlotte()
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES)
  const [creation, setCreation] = useState(false)
  const jour = aujourdhui()

  const vehicules = useMemo(
    () =>
      trierFlotte(flotte.vehicules).filter(
        (v) =>
          (!filtres.type || v.type === filtres.type) &&
          (!filtres.statut || v.statut === filtres.statut) &&
          (!filtres.proprietaire ||
            (filtres.proprietaire === SANS_PROPRIETAIRE ? !v.proprietaire_id : v.proprietaire_id === filtres.proprietaire)),
      ),
    [flotte.vehicules, filtres],
  )

  if (!flotte.pret) {
    return flotte.erreur ? (
      <p className={ui.erreur}>{messageErreur(flotte.erreur)}</p>
    ) : (
      <p className="py-8 text-center text-sm text-pierre-500">Chargement de la flotte…</p>
    )
  }

  const surveiller = aSurveiller(flotte.vehicules, flotte.inspections, jour)
  const types = TYPES.filter((t) => t.id !== 'autre' || flotte.vehicules.some((v) => v.type === 'autre'))
  const filtresActifs = JSON.stringify(filtres) !== JSON.stringify(FILTRES_VIDES)
  const enCirculation = flotte.vehicules.filter((v) => v.statut === 'en_circulation').length

  return (
    <div>
      {surveiller.length > 0 && <ASurveiller echeances={surveiller} jour={jour} />}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Type">
          <Puce actif={!filtres.type} onClick={() => setFiltres({ ...filtres, type: '' })}>
            Tous
          </Puce>
          {types.map((t) => (
            <Puce key={t.id} actif={filtres.type === t.id} onClick={() => setFiltres({ ...filtres, type: t.id })}>
              {t.pluriel}
            </Puce>
          ))}
        </div>
        <select
          aria-label="Statut"
          className={`${ui.champ} w-auto!`}
          value={filtres.statut}
          onChange={(e) => setFiltres({ ...filtres, statut: e.target.value as Statut | '' })}
        >
          <option value="">Tous les statuts</option>
          <option value="en_circulation">En circulation</option>
          <option value="remise">Remisés</option>
        </select>
        <select
          aria-label="Propriétaire"
          className={`${ui.champ} w-auto!`}
          value={filtres.proprietaire}
          onChange={(e) => setFiltres({ ...filtres, proprietaire: e.target.value })}
        >
          <option value="">Tous les propriétaires</option>
          {flotte.proprietaires.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom}
            </option>
          ))}
          <option value={SANS_PROPRIETAIRE}>Propriétaire à préciser</option>
        </select>
        {ecriture && (
          <button className={`${ui.bouton} ml-auto`} onClick={() => setCreation(true)}>
            <IconePlus /> Véhicule
          </button>
        )}
      </div>

      <p className="mb-2 mt-3 text-sm text-pierre-500">
        {flotte.vehicules.length} véhicules · {enCirculation} en circulation · {flotte.vehicules.length - enCirculation} remisé
        {flotte.vehicules.length - enCirculation > 1 ? 's' : ''}
        {filtresActifs && (
          <button className="ml-2 text-foret-700 underline" onClick={() => setFiltres(FILTRES_VIDES)}>
            Effacer les filtres
          </button>
        )}
      </p>

      {types.map((t) => {
        const groupe = vehicules.filter((v) => v.type === t.id)
        if (groupe.length === 0) return null
        return (
          <section key={t.id} className="mt-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-pierre-500">{t.pluriel}</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {groupe.map((v) => (
                <CarteVehicule key={v.id} v={v} flotte={flotte} jour={jour} />
              ))}
            </div>
          </section>
        )
      })}
      {vehicules.length === 0 && <p className="py-8 text-center text-sm text-pierre-500">Aucun véhicule ne correspond aux filtres.</p>}

      {creation && <NouveauVehicule fermer={() => setCreation(false)} />}
    </div>
  )
}

function Puce({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-pressed={actif}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-medium ${
        actif ? 'bg-foret-700 text-white' : 'border border-pierre-300 bg-white text-pierre-700 hover:bg-pierre-50'
      }`}
    >
      {children}
    </button>
  )
}

function ASurveiller({ echeances, jour }: { echeances: ReturnType<typeof aSurveiller>; jour: string }) {
  return (
    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
        <IconeAttention /> À surveiller
      </h2>
      <ul className="mt-2 space-y-1 text-sm">
        {echeances.map((e) => (
          <li key={`${e.vehicule.id}-${e.quoi}`} className="flex flex-wrap items-center gap-x-2">
            <PastilleEtat etat={e.etat} />
            <Link to={`/vehicules/fiche/${e.vehicule.id}`} className="font-medium text-pierre-900 hover:underline">
              {e.vehicule.surnom}
            </Link>
            <span className="text-pierre-700">
              {LIBELLES_QUOI[e.quoi]} {e.etat === 'depassee' ? 'échue' : 'à renouveler'} le {dateLisible(e.date)}
            </span>
            <span className={e.etat === 'depassee' ? 'text-red-700' : 'text-amber-800'}>({delaiLisible(e.date!, jour)})</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CarteVehicule({ v, flotte, jour }: { v: Vehicule; flotte: DonneesFlotte; jour: string }) {
  const proprietaire = v.proprietaire_id ? flotte.proprietaire.get(v.proprietaire_id) : null
  const description = [v.marque, v.modele, v.annee].filter(Boolean).join(' ')
  const echeances = echeancesDe(v, flotte.inspections.get(v.id) ?? [], jour)
  const remise = v.statut === 'remise'
  return (
    <Link
      to={`/vehicules/fiche/${v.id}`}
      className={`${ui.carte} flex overflow-hidden transition hover:border-foret-600 ${remise ? 'opacity-75' : ''}`}
    >
      <Photo chemin={v.photo} type={v.type} className="w-24 shrink-0 self-stretch sm:w-32" />
      <div className="min-w-0 flex-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-semibold">{v.surnom}</h3>
          {remise && <BadgeStatut statut={v.statut} />}
        </div>
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-pierre-500">
          <span className="truncate">{description || 'Marque et modèle à préciser'}</span>
          {proprietaire && <PuceCompagnie compagnie={proprietaire} court className="px-1.5! py-px!" />}
        </p>
        <dl className="mt-2 space-y-0.5 text-xs">
          {echeances.map((e) => (
            <div key={e.quoi} className="flex items-center gap-1.5">
              <dt className="w-[6.5rem] shrink-0 text-pierre-500">{LIBELLES_QUOI[e.quoi]}</dt>
              <dd className="truncate">
                {remise && e.date ? (
                  <span className="text-pierre-500">{dateLisible(e.date)}</span>
                ) : (
                  <DateEcheance date={e.date} etat={e.etat} jour={jour} court />
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Link>
  )
}

function NouveauVehicule({ fermer }: { fermer: () => void }) {
  const naviguer = useNavigate()
  const enregistrer = useEnregistrerLigne<Vehicule>('vehicules')
  const [surnom, setSurnom] = useState('')
  const [type, setType] = useState<TypeVehicule>('minibus')
  const [erreur, setErreur] = useState<string | null>(null)

  async function creer(e: React.FormEvent) {
    e.preventDefault()
    const propre = surnom.trim()
    if (!propre) return
    try {
      const v = await enregistrer.mutateAsync({ surnom: propre, type })
      naviguer(`/vehicules/fiche/${v.id}`)
    } catch (err) {
      setErreur(messageErreur(err).replace('Cette valeur existe déjà.', 'Un véhicule porte déjà ce surnom.'))
    }
  }

  return (
    <Dialogue titre="Nouveau véhicule" fermer={fermer}>
      <form onSubmit={creer} className="space-y-3">
        <label className="block">
          <span className={ui.etiquette}>Surnom</span>
          <input className={ui.champ} autoFocus value={surnom} onChange={(e) => setSurnom(e.target.value)} />
        </label>
        <label className="block">
          <span className={ui.etiquette}>Type</span>
          <select className={ui.champ} value={type} onChange={(e) => setType(e.target.value as TypeVehicule)}>
            {TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.libelle}
              </option>
            ))}
          </select>
        </label>
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button className={ui.bouton} disabled={!surnom.trim() || enregistrer.isPending}>
            Créer
          </button>
        </div>
      </form>
    </Dialogue>
  )
}
