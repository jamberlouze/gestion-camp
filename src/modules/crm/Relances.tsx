import { useState } from 'react'
import { Link } from 'react-router'
import { ui } from '@/lib/ui'
import { ajouterJours, ajouterMois } from './calculs'
import { BoutonFaite, ChoixConseiller, Echeance, PuceStatut } from './commun'
import { useDonnees } from './contexte'
import { useModifierRelance } from './donnees'
import type { Relance } from './types'

/** Accueil du module : les relances à faire, les miennes d'abord. */
export function Relances() {
  const { relances, parId, moi, auj } = useDonnees()
  const [qui, setQui] = useState<string | null>(moi.id)

  // Personne responsable : celle assignée, sinon le conseiller du client.
  const responsable = (r: Relance) => r.assigne_a ?? parId.get(r.organisation_id)?.org.conseiller_id ?? null
  const visibles = relances.filter((r) => !qui || responsable(r) === qui)
  const aFaire = visibles.filter((r) => r.statut === 'a_faire')
  const dans7 = ajouterJours(auj, 7)
  const dans30 = ajouterJours(auj, 30)
  const groupes = [
    { titre: 'En retard', liste: aFaire.filter((r) => r.echeance < auj) },
    { titre: 'Cette semaine', liste: aFaire.filter((r) => r.echeance >= auj && r.echeance <= dans7) },
    { titre: 'Ce mois-ci', liste: aFaire.filter((r) => r.echeance > dans7 && r.echeance <= dans30) },
    { titre: 'Plus tard', liste: aFaire.filter((r) => r.echeance > dans30) },
  ]
  const ilYa7 = ajouterJours(auj, -7)
  const faites = visibles.filter((r) => r.statut === 'faite' && r.faite_le && r.faite_le.slice(0, 10) >= ilYa7)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <ChoixConseiller valeur={qui} changer={setQui} libelle="Relances de" vide="Tout le monde" />
        <p className="text-sm text-pierre-500">
          {aFaire.length} à faire{groupes[0].liste.length > 0 && <span className="text-red-700"> · {groupes[0].liste.length} en retard</span>}
        </p>
      </div>

      {aFaire.length === 0 && (
        <p className="rounded-xl border border-dashed border-pierre-300 px-4 py-8 text-center text-sm text-pierre-500">
          Aucune relance à faire. Les relances se créent toutes seules après chaque séjour, ou à la main depuis la fiche d'une organisation.
        </p>
      )}

      {groupes.map(
        (g) =>
          g.liste.length > 0 && (
            <section key={g.titre}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-pierre-500">
                {g.titre} <span className="font-normal text-pierre-400">{g.liste.length}</span>
              </h2>
              <ul className={`${ui.carte} divide-y divide-pierre-100`}>
                {g.liste.map((r) => (
                  <LigneRelance key={r.id} relance={r} montrerQui={!qui} />
                ))}
              </ul>
            </section>
          ),
      )}

      {faites.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-pierre-500">Faites cette semaine</h2>
          <ul className={`${ui.carte} divide-y divide-pierre-100 opacity-70`}>
            {faites.map((r) => (
              <LigneRelance key={r.id} relance={r} montrerQui={!qui} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Une relance : ✓, organisation, titre, échéance ; reporter ou annuler. */
export function LigneRelance({ relance: r, montrerQui, sansOrganisation }: { relance: Relance; montrerQui?: boolean; sansOrganisation?: boolean }) {
  const { parId, nomConseiller, ecriture, auj } = useDonnees()
  const modifier = useModifierRelance()
  const c = parId.get(r.organisation_id)
  const qui = nomConseiller(r.assigne_a ?? c?.org.conseiller_id ?? null)

  const reporter = ecriture && r.statut === 'a_faire' && (
    <select
      aria-label="Reporter ou annuler"
      className="sans-fleche rounded-md px-1.5 py-0.5 text-pierre-400 hover:bg-pierre-100 hover:text-pierre-700"
      value=""
      onChange={(e) => {
        const v = e.target.value
        const base = r.echeance < auj ? auj : r.echeance
        if (v === 'annuler') modifier.mutate({ id: r.id, champs: { statut: 'annulee' } })
        else if (v === '7') modifier.mutate({ id: r.id, champs: { echeance: ajouterJours(base, 7) } })
        else if (v) modifier.mutate({ id: r.id, champs: { echeance: ajouterMois(base, Number(v)) } })
      }}
    >
      <option value="">⋯</option>
      <option value="7">Reporter d'une semaine</option>
      <option value="1">Reporter d'un mois</option>
      <option value="3">Reporter de 3 mois</option>
      <option value="annuler">Annuler la relance</option>
    </select>
  )
  const quand = r.statut === 'a_faire' ? <Echeance jour={r.echeance} /> : r.statut === 'annulee' && <span className="text-xs text-pierre-500">annulée</span>

  // Dans une fiche (colonne étroite) : échéance et personne sous le titre.
  if (sansOrganisation) {
    return (
      <li className="flex items-start gap-3 px-3 py-2.5">
        <BoutonFaite relance={r} />
        <div className="min-w-0 flex-1">
          <p className={`font-medium text-pierre-900 ${r.statut === 'faite' ? 'line-through' : ''}`}>{r.titre}</p>
          <p className="text-sm">
            {quand}
            {montrerQui && qui && <span className="text-pierre-500"> · {qui}</span>}
          </p>
          {r.note && <p className="text-xs text-pierre-500">{r.note}</p>}
          {r.statut === 'faite' && r.faite_par_nom && <p className="text-xs text-pierre-400">Faite par {r.faite_par_nom}</p>}
        </div>
        {reporter}
      </li>
    )
  }

  return (
    <li className="flex flex-wrap items-start gap-3 px-3 py-2.5 sm:flex-nowrap">
      <BoutonFaite relance={r} />
      <div className="min-w-0 flex-1">
        {c && (
          <Link to={`/crm/o/${c.org.id}`} className="mr-2 font-medium text-pierre-900 hover:text-foret-800 hover:underline">
            {c.org.nom}
          </Link>
        )}
        {c && <PuceStatut statut={c.statut} />}
        <p className={`text-sm text-pierre-700 ${r.statut === 'faite' ? 'line-through' : ''}`}>{r.titre}</p>
        {r.note && <p className="text-xs text-pierre-500">{r.note}</p>}
        {r.statut === 'faite' && r.faite_par_nom && <p className="text-xs text-pierre-400">Faite par {r.faite_par_nom}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3 text-sm">
        {montrerQui && <span className="text-pierre-500">{qui ?? 'Personne'}</span>}
        {quand}
        {reporter}
      </div>
    </li>
  )
}
