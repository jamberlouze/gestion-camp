import { useAchatsACommanderBientot } from '@/modules/achats/donnees'
import { HORIZON_JOURS } from '@/modules/achats/outils'
import { useNotes } from '@/modules/embarcations/donnees'
import { useSubventions } from '@/modules/subventions/donnees'
import { joursAvant } from '@/modules/subventions/outils'
import { useTaches } from '@/modules/travaux/donnees'
import { estOuverte } from '@/modules/travaux/outils'
import { useFlotte } from '@/modules/vehicules/donnees'
import { aSurveiller, aujourdhui, delaiLisible, LIBELLES_QUOI, SEUIL_JOURS } from '@/modules/vehicules/outils'
import { useAuth } from '../auth'
import { Carte, Ligne } from './commun'

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

/** Alertes de l'équipe : ce qui demande l'attention, dans les modules de la personne seulement. */
export function ASurveiller() {
  const { peutLire, peutEcrire } = useAuth()
  const sources = {
    travaux: peutLire('travaux'),
    vehicules: peutLire('vehicules'),
    embarcations: peutLire('embarcations'),
    // Subventions : écriture ou rien (pas de mode lecture).
    subventions: peutEcrire('subventions'),
    achats: peutLire('achats'),
  }
  if (!Object.values(sources).some(Boolean)) return null
  return (
    <Carte titre="À surveiller" vide="Rien à signaler.">
      {sources.travaux && <TravauxUrgents />}
      {sources.achats && <Achats />}
      {sources.vehicules && <Vehicules />}
      {sources.embarcations && <Embarcations />}
      {sources.subventions && <Subventions />}
    </Carte>
  )
}

function TravauxUrgents() {
  const { data } = useTaches()
  const urgents = (data ?? []).filter((t) => t.priorite === 1 && estOuverte(t))
  if (!urgents.length) return null
  return (
    <Ligne
      to="/travaux"
      icone="🛠️"
      module="Travaux"
      pastille="forte"
      titre={`${urgents.length} ${urgents.length > 1 ? 'travaux urgents' : 'travail urgent'}`}
      detail={urgents
        .slice(0, 2)
        .map((t) => t.titre)
        .join(' · ')}
    />
  )
}

/** « X achats à commander dans les 30 prochains jours (dont N en retard) » : hook du module Achats. */
function Achats() {
  const { enRetard, aVenir, nombre, lien } = useAchatsACommanderBientot()
  if (!nombre) return null
  return (
    <Ligne
      to={lien}
      icone="🛍️"
      module="Achats"
      pastille={enRetard.length ? 'forte' : 'douce'}
      titre={`${pluriel(nombre, 'achat')} à commander dans les ${HORIZON_JOURS} prochains jours`}
      detail={
        enRetard.length
          ? `dont ${enRetard.length} en retard`
          : aVenir
              .slice(0, 2)
              .map((a) => a.item)
              .join(' · ')
      }
      alerte={enRetard.length > 0}
    />
  )
}

function Vehicules() {
  const flotte = useFlotte()
  if (!flotte.pret) return null
  const jour = aujourdhui()
  return (
    <>
      {aSurveiller(flotte.vehicules, flotte.inspections, jour).map((e) => (
        <Ligne
          key={`${e.vehicule.id}|${e.quoi}`}
          to="/vehicules"
          icone="🚌"
          module="Véhicules"
          pastille={e.etat === 'depassee' ? 'forte' : 'douce'}
          titre={`${e.vehicule.surnom} : ${LIBELLES_QUOI[e.quoi].toLowerCase()} ${e.etat === 'depassee' ? 'échue' : 'à renouveler'}`}
          detail={delaiLisible(e.date!, jour)}
          alerte={e.etat === 'depassee'}
        />
      ))}
    </>
  )
}

function Embarcations() {
  const notes = useNotes()
  const aTraiter = (notes.data ?? []).filter((n) => n.statut === 'a_traiter').length
  if (!aTraiter) return null
  return <Ligne to="/embarcations" icone="🛶" module="Embarcations" pastille="douce" titre={`${pluriel(aTraiter, 'note')} à traiter`} />
}

/** Dates limites des subventions en attente ou en cours, d'ici 30 jours. */
function Subventions() {
  const { data } = useSubventions()
  const proches = (data ?? [])
    .filter((g) => (g.status === 'a_valider' || g.status === 'en_cours') && g.deadline_date)
    .map((g) => ({ g, jours: joursAvant(g.deadline_date!) }))
    .filter(({ jours }) => jours >= 0 && jours <= SEUIL_JOURS)
    .sort((a, b) => a.jours - b.jours)
  return (
    <>
      {proches.map(({ g, jours }) => (
        <Ligne
          key={g.id}
          to="/subventions"
          icone="💰"
          module="Subventions"
          pastille={jours <= 7 ? 'forte' : 'douce'}
          titre={g.program_name}
          detail={`Date limite ${jours === 0 ? "aujourd'hui" : jours === 1 ? 'demain' : `dans ${jours} jours`}`}
          alerte={jours <= 7}
        />
      ))}
    </>
  )
}
