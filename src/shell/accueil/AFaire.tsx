import { useMemo, useState } from 'react'
import { cleAujourdhui, cleCoche, exerciceDeCle, libelleMois } from '@/modules/mastertimeline/calendrier'
import { CaseCoche } from '@/modules/mastertimeline/commun'
import { useCoches, useResponsables, useTaches as useTachesMt } from '@/modules/mastertimeline/donnees'
import { FILTRES_VIDES, passagesDuMois, retards, trierPassages, useBasculer, type Passage } from '@/modules/mastertimeline/outils'
import { useAApprouver, useFeuille } from '@/modules/temps/donnees'
import { dateCourte as dateCourteTemps, finPeriode, periodePrecedente, PREMIERE_PERIODE } from '@/modules/temps/periodes'
import { periodeCourante } from '@/modules/temps/outils'
import { comparer, dateCourte, enRetard, estOuverte, jourAujourdhui } from '@/modules/travaux/outils'
import { CaseTache } from '@/modules/travaux/commun'
import { useTaches } from '@/modules/travaux/donnees'
import { PRIORITES } from '@/modules/travaux/types'
import { useAuth } from '../auth'
import { Autres, Carte, Ligne } from './commun'

const MAX_PAR_SOURCE = 5

/** Ce qui attend la personne connectée, tous modules confondus. */
export function AFaire() {
  const { profil, estAdmin, estDirection, peutLire } = useAuth()
  const temps = peutLire('temps') && estDirection
  const precedente = periodePrecedente(periodeCourante())
  return (
    <Carte titre="À faire pour moi" vide="Rien ne t'attend pour l'instant.">
      {temps && <AApprouver estAdmin={estAdmin} />}
      {/* La feuille d'un admin ne passe pas par la soumission. */}
      {temps && !estAdmin && profil && precedente >= PREMIERE_PERIODE && <MaFeuille userId={profil.id} debut={precedente} />}
      {peutLire('travaux') && profil && <MesTravaux moi={profil.id} />}
      {peutLire('mastertimeline') && profil && <MesTachesAnnuelles courriel={profil.courriel} nom={profil.nom} />}
    </Carte>
  )
}

function AApprouver({ estAdmin }: { estAdmin: boolean }) {
  const { data } = useAApprouver(estAdmin)
  const n = (data?.employes.length ?? 0) + (data?.direction.length ?? 0)
  if (!n) return null
  return (
    <Ligne
      to="/temps/approuver"
      titre={`Approuver ${n} feuille${n > 1 ? 's' : ''} de temps`}
      module="⏱️ Feuilles de temps"
      detail="Soumises, en attente"
    />
  )
}

function MaFeuille({ userId, debut }: { userId: string; debut: string }) {
  const { data, isPending } = useFeuille(userId, debut)
  if (isPending || (data && data.statut !== 'ouverte')) return null
  return (
    <Ligne
      to={`/temps?periode=${debut}`}
      titre="Soumettre ma feuille de temps"
      module="⏱️ Feuilles de temps"
      detail={`Période du ${dateCourteTemps(debut, false)} au ${dateCourteTemps(finPeriode(debut), false)}`}
      alerte
    />
  )
}

function MesTravaux({ moi }: { moi: string }) {
  const { data } = useTaches()
  // Cochées pendant cette visite : restent affichées (barrées), pour pouvoir décocher.
  const [cochees, setCochees] = useState<string[]>([])
  const garder = (id: string) => setCochees((c) => (c.includes(id) ? c : [...c, id]))
  const { ouvertes, faites } = useMemo(() => {
    const miennes = (data ?? []).filter((t) => t.assigne_a === moi).sort(comparer)
    return {
      ouvertes: miennes.filter(estOuverte),
      faites: miennes.filter((t) => !estOuverte(t) && cochees.includes(t.id)),
    }
  }, [data, moi, cochees])
  const jour = jourAujourdhui()
  return (
    <>
      {[...ouvertes.slice(0, MAX_PAR_SOURCE), ...faites].map((t) => {
        const faite = !estOuverte(t)
        const retard = enRetard(t, jour)
        const morceaux = [
          t.priorite < 3 ? PRIORITES[t.priorite] : null,
          t.echeance ? (retard ? `En retard depuis le ${dateCourte(t.echeance)}` : `Échéance le ${dateCourte(t.echeance)}`) : null,
        ].filter(Boolean)
        return (
          <Ligne
            key={t.id}
            to="/travaux"
            caseACocher={
              <span onClickCapture={() => garder(t.id)}>
                <CaseTache tache={t} />
              </span>
            }
            faite={faite}
            titre={t.titre}
            module="🛠️ Travaux"
            detail={faite ? 'Terminée' : morceaux.join(' · ') || 'Assignée à toi'}
            alerte={!faite && (retard || t.priorite === 1)}
          />
        )
      })}
      <Autres n={ouvertes.length - MAX_PAR_SOURCE} to="/travaux" />
    </>
  )
}

/**
 * Passages de Mastertimeline (ce mois-ci et en retard) dont la personne est
 * responsable. Les responsables sont une liste propre au module : on les
 * relie au compte par le courriel.
 */
function MesTachesAnnuelles({ courriel, nom }: { courriel: string; nom: string | null }) {
  const { peutEcrire } = useAuth()
  const responsables = useResponsables()
  const taches = useTachesMt()
  const cle = cleAujourdhui()
  const index = useCoches(exerciceDeCle(cle))
  const moi = useMemo(() => {
    const actifs = (responsables.data ?? []).filter((r) => r.actif)
    const parCourriel = actifs.find((r) => r.courriel?.toLowerCase() === courriel.toLowerCase())
    if (parCourriel) return parCourriel
    // Responsable sans courriel : son nom (ou prénom) s'il est le seul à le porter.
    const noms = [nom, nom?.split(' ')[0]].filter(Boolean).map((n) => n!.toLowerCase())
    const parNom = actifs.filter((r) => !r.courriel && noms.includes(r.nom.toLowerCase()))
    return parNom.length === 1 ? parNom[0] : undefined
  }, [responsables.data, courriel, nom])

  const ecriture = peutEcrire('mastertimeline')
  const basculer = useBasculer()
  // Passages cochés pendant cette visite : restent affichés (barrés), pour pouvoir décocher.
  const [cochees, setCochees] = useState<Passage[]>([])

  const { aFaire, faits } = useMemo(() => {
    if (!moi || !taches.data || !index.pret) return { aFaire: [], faits: [] }
    const filtres = { ...FILTRES_VIDES, responsable: moi.id }
    const enRetard = trierPassages(retards(taches.data, index.index, filtres))
    const duMois = trierPassages(passagesDuMois(taches.data, cle, index.index, filtres)).filter(
      (p) => p.etat !== 'faite' && p.etat !== 'sautee',
    )
    const aFaire = [...enRetard, ...duMois]
    const cles = new Set(aFaire.map((p) => cleCoche(p.tache.id, p.periode)))
    const faits = cochees
      .filter((p) => !cles.has(cleCoche(p.tache.id, p.periode)))
      .map((p) => {
        const coche = index.index.get(cleCoche(p.tache.id, p.periode))
        return { ...p, coche, etat: coche?.statut ?? p.etat }
      })
    return { aFaire, faits }
  }, [moi, taches.data, index.pret, index.index, cle, cochees])

  const cocher = (p: Passage) => {
    setCochees((c) => (c.some((x) => x.tache.id === p.tache.id && x.periode === p.periode) ? c : [...c, p]))
    basculer(p.tache, p.periode, p.coche, 'faite')
  }
  const liste = [...aFaire.slice(0, MAX_PAR_SOURCE), ...faits]

  return (
    <>
      {liste.map((p) => {
        const faite = p.etat === 'faite'
        return (
          <Ligne
            key={cleCoche(p.tache.id, p.periode)}
            to="/mastertimeline"
            caseACocher={<CaseCoche etat={p.etat} basculer={() => cocher(p)} desactivee={!ecriture} />}
            faite={faite}
            titre={p.tache.titre}
            module="✅ Mastertimeline"
            detail={
              faite
                ? 'Faite'
                : p.etat === 'retard'
                  ? `En retard (${p.periode === 'unique' ? 'échéance passée' : libelleMois(p.periode)})`
                  : 'Ce mois-ci'
            }
            alerte={p.etat === 'retard'}
          />
        )
      })}
      <Autres n={aFaire.length - MAX_PAR_SOURCE} to="/mastertimeline" />
    </>
  )
}
