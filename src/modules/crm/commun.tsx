import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Dialogue } from '@/lib/Dialogue'
import { ui } from '@/lib/ui'
import { useDonnees } from './contexte'
import { useAjouterOrganisation, useModifierRelance } from './donnees'
import { dateCourte } from './calculs'
import { GENRES, SAISONS, STATUTS, type Etape, type Genre, type Relance, type Saison, type Statut } from './types'

export function PuceStatut({ statut }: { statut: Statut }) {
  const s = STATUTS.find((x) => x.id === statut)!
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${s.style}`}>{s.nom}</span>
}

export function PucesSaisons({ saisons }: { saisons: Saison[] }) {
  if (!saisons.length) return <span className="text-pierre-300">—</span>
  return (
    <span className="whitespace-nowrap" title={saisons.map((s) => SAISONS.find((x) => x.id === s)!.nom).join(', ')}>
      {saisons.map((s) => SAISONS.find((x) => x.id === s)!.icone).join(' ')}
    </span>
  )
}

export const champPetit = 'rounded-lg border border-pierre-300 bg-white px-2.5 py-1.5 text-sm text-pierre-800'

/** Menu des conseillers (comptes qui écrivent dans le CRM). */
export function ChoixConseiller({
  valeur,
  changer,
  libelle = 'Conseiller',
  vide = '— Personne',
  className = champPetit,
}: {
  valeur: string | null
  changer: (id: string | null) => void
  libelle?: string
  vide?: string
  className?: string
}) {
  const { conseillers, ecriture, nomConseiller } = useDonnees()
  const absent = valeur && !conseillers.some((c) => c.id === valeur)
  return (
    <select aria-label={libelle} className={className} value={valeur ?? ''} disabled={!ecriture} onChange={(e) => changer(e.target.value || null)}>
      <option value="">{vide}</option>
      {absent && <option value={valeur}>{nomConseiller(valeur)}</option>}
      {conseillers.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nom}
        </option>
      ))}
    </select>
  )
}

/** Bouton « ✓ Faite » d'une relance. */
export function BoutonFaite({ relance }: { relance: Relance }) {
  const { ecriture } = useDonnees()
  const modifier = useModifierRelance()
  const faite = relance.statut === 'faite'
  return (
    <button
      disabled={!ecriture}
      className={`shrink-0 rounded-lg border px-2.5 py-1 text-sm font-medium disabled:opacity-50 ${
        faite ? 'border-foret-300 bg-foret-50 text-foret-800' : 'border-pierre-300 bg-white text-pierre-700 hover:border-foret-400 hover:text-foret-800'
      }`}
      onClick={() => modifier.mutate({ id: relance.id, champs: { statut: faite ? 'a_faire' : 'faite' } })}
    >
      ✓ {faite ? 'Faite' : 'Fait'}
    </button>
  )
}

/** Échéance en couleur : rouge si passée, ambre si cette semaine. */
export function Echeance({ jour }: { jour: string }) {
  const { auj } = useDonnees()
  const style = jour < auj ? 'text-red-700 font-medium' : jour <= ajouter7(auj) ? 'text-amber-700' : 'text-pierre-600'
  return <span className={`whitespace-nowrap tabular-nums ${style}`}>{jour === auj ? "Aujourd'hui" : dateCourte(jour, auj)}</span>
}

const ajouter7 = (jour: string) => {
  const d = new Date(`${jour}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 7)
  return d.toISOString().slice(0, 10)
}

/** Nouvelle organisation (client ou cible) ; ouvre sa fiche une fois créée. */
export function NouvelleOrganisation({ fermer, etape }: { fermer: () => void; etape?: Etape }) {
  const { moi } = useDonnees()
  const ajouter = useAjouterOrganisation()
  const naviguer = useNavigate()
  const [nom, setNom] = useState('')
  const [genre, setGenre] = useState<Genre>('ecole_primaire')
  const [ville, setVille] = useState('')

  const creer = () => {
    if (!nom.trim()) return
    const id = crypto.randomUUID()
    ajouter.mutate(
      {
        id,
        nom: nom.trim(),
        genre,
        ville: ville.trim() || null,
        adresse: null,
        telephone: null,
        site_web: null,
        notes: null,
        conseiller_id: moi.id,
        etape: etape ?? null,
        prioritaire: false,
        cycle_ans: 1,
        airtable_client_id: null,
        copper_id: null,
        statut_depart: null,
        statut_depart_le: null,
        created_at: new Date().toISOString(),
      },
      { onSuccess: () => (etape ? fermer() : naviguer(`/crm/o/${id}`)) },
    )
  }

  return (
    <Dialogue titre={etape ? 'Nouvelle cible' : 'Nouvelle organisation'} fermer={fermer}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          creer()
        }}
      >
        <label className="block">
          <span className={ui.etiquette}>Nom</span>
          <input autoFocus className={ui.champ} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="École Citoyenne, Cégep Dawson…" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={ui.etiquette}>Type</span>
            <select className={ui.champ} value={genre} onChange={(e) => setGenre(e.target.value as Genre)}>
              {GENRES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nom}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={ui.etiquette}>Ville</span>
            <input className={ui.champ} value={ville} onChange={(e) => setVille(e.target.value)} />
          </label>
        </div>
        <p className="text-xs text-pierre-500">Vous en serez le conseiller ; ça se change dans la fiche.</p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button className={ui.bouton} disabled={!nom.trim() || ajouter.isPending}>
            Créer
          </button>
        </div>
      </form>
    </Dialogue>
  )
}

/** Puces de choix (une seule allumée, ou aucune = tout). */
export function Puces<T extends string>({
  options,
  valeur,
  changer,
  tout = 'Tous',
  compte,
}: {
  options: { id: T; nom: string }[]
  valeur: T | ''
  changer: (v: T | '') => void
  tout?: string
  compte?: (id: T | '') => number
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-pierre-300 bg-white p-0.5 text-sm" role="group">
      {[{ id: '' as T | '', nom: tout }, ...options].map((o) => (
        <button
          key={o.id || 'tout'}
          className={`rounded-md px-2.5 py-1 ${valeur === o.id ? 'bg-foret-100 font-medium text-foret-800' : 'text-pierre-600 hover:text-pierre-900'}`}
          onClick={() => changer(o.id)}
        >
          {o.nom}
          {compte && <span className="ml-1 tabular-nums text-pierre-400">{compte(o.id)}</span>}
        </button>
      ))}
    </div>
  )
}
