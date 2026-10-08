import { useAchats } from '@/modules/achats/donnees'
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

/** Alertes de l'équipe (ex-maquette C) : ce qui demande l'attention, tous modules confondus. */
export function ASurveiller() {
  const { peutLire, peutEcrire } = useAuth()
  return (
    <Carte titre="À surveiller" vide="Rien à signaler.">
      {peutLire('travaux') && <TravauxUrgents />}
      {peutLire('vehicules') && <Vehicules />}
      {peutLire('embarcations') && <Embarcations />}
      {/* Subventions : écriture ou rien (pas de mode lecture). */}
      {peutEcrire('subventions') && <Subventions />}
      {peutLire('achats') && <Achats />}
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
      pastille="forte"
      titre={`${urgents.length} ${urgents.length > 1 ? 'travaux urgents' : 'travail urgent'}`}
      module="🛠️ Travaux"
      detail={urgents
        .slice(0, 2)
        .map((t) => t.titre)
        .join(' · ')}
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
          pastille={e.etat === 'depassee' ? 'forte' : 'douce'}
          titre={`${e.vehicule.surnom} : ${LIBELLES_QUOI[e.quoi].toLowerCase()} ${e.etat === 'depassee' ? 'échue' : 'à renouveler'}`}
          module="🚌 Véhicules"
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
  return <Ligne to="/embarcations" pastille="douce" titre={`${pluriel(aTraiter, 'note')} à traiter`} module="🛶 Embarcations" />
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
          pastille={jours <= 7 ? 'forte' : 'douce'}
          titre={g.program_name}
          module="💰 Subventions"
          detail={`Date limite ${jours === 0 ? "aujourd'hui" : jours === 1 ? 'demain' : `dans ${jours} jours`}`}
          alerte={jours <= 7}
        />
      ))}
    </>
  )
}

function Achats() {
  const { data } = useAchats()
  const n = (data ?? []).filter((a) => a.statut === 'a_commander').length
  if (!n) return null
  return <Ligne to="/achats" pastille="douce" titre={`${pluriel(n, 'achat')} à commander`} module="🛍️ Achats" />
}
