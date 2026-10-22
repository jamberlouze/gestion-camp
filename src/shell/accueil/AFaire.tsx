import { useMemo, useState } from 'react'
import { confirmer } from '@/lib/Confirmation'
import { codePeriodePaie, libellePeriodePaie } from '@/lib/periodesPaie'
import { cleAujourdhui, cleCoche, exerciceDeCle, libelleMois } from '@/modules/mastertimeline/calendrier'
import { CaseCoche } from '@/modules/mastertimeline/commun'
import { useCoches, useResponsables, useTaches as useTachesMt } from '@/modules/mastertimeline/donnees'
import { FILTRES_VIDES, passagesDuMois, retards, trierPassages, useBasculer, type Passage } from '@/modules/mastertimeline/outils'
import { actionsDe } from '@/modules/reservations/actions'
import { useReservations as useReservationsGroupes, useSignauxActions } from '@/modules/reservations/donnees'
import { useAApprouver, useDossiersAFermer, useFeuille, useFermerDossier, type DossierAFermer } from '@/modules/temps/donnees'
import { echeancePassee, echeanceSoumission, libelleEcheance } from '@/modules/temps/echeance'
import { periodePrecedente, PREMIERE_PERIODE } from '@/modules/temps/periodes'
import { periodeCourante } from '@/modules/temps/outils'
import { comparer, dateCourte, enRetard, estOuverte, jourAujourdhui } from '@/modules/travaux/outils'
import { CaseTache } from '@/modules/travaux/commun'
import { useTaches } from '@/modules/travaux/donnees'
import { PRIORITES } from '@/modules/travaux/types'
import { useAuth } from '../auth'
import { Autres, Carte, Groupe, Ligne } from './commun'

const MAX_PAR_SOURCE = 5

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

/** Ce qui attend la personne connectée, groupé par module (seulement ses modules). */
export function AFaire() {
  const { profil, estAdmin, estDirection, peutLire } = useAuth()
  // Feuilles de temps : la direction et les admins (l'employé qui remplit sa
  // feuille n'a pas ces tâches-là).
  const temps = peutLire('temps') && estDirection
  const travaux = peutLire('travaux')
  const mastertimeline = peutLire('mastertimeline')
  const reservations = peutLire('reservations')
  if (!profil || !(temps || travaux || mastertimeline || reservations)) return null
  return (
    <Carte titre="À faire pour moi" vide="Rien ne t'attend pour l'instant.">
      {reservations && <Reservations />}
      {temps && <FeuillesDeTemps userId={profil.id} estAdmin={estAdmin} />}
      {mastertimeline && <MesTachesAnnuelles courriel={profil.courriel} nom={profil.nom} />}
      {travaux && <MesTravaux moi={profil.id} />}
    </Carte>
  )
}

// ---------------------------------------------------------------------------
// Feuilles de temps : à approuver, à soumettre, relevés d'emploi à produire.

/** « PP21 · 4 au 17 oct. » pour une seule période, sinon « PP20, PP21 ». */
function periodes(debuts: string[]) {
  const uniques = [...new Set(debuts)].sort()
  return uniques.length === 1 ? libellePeriodePaie(uniques[0]) : uniques.map((d) => codePeriodePaie(d)).join(', ')
}

function FeuillesDeTemps({ userId, estAdmin }: { userId: string; estAdmin: boolean }) {
  const aApprouver = useAApprouver(estAdmin)
  // La feuille d'un admin ne passe pas par la soumission ; rien avant la première période.
  const precedente = periodePrecedente(periodeCourante())
  const soumettre = !estAdmin && precedente >= PREMIERE_PERIODE
  const maFeuille = useFeuille(userId, precedente)
  const dossiers = useDossiersAFermer()
  const fermer = useFermerDossier()
  const [erreur, setErreur] = useState<string | null>(null)

  const soumises = [...(aApprouver.data?.employes ?? []), ...(aApprouver.data?.direction ?? [])]
  const aSoumettre = soumettre && !maFeuille.isPending && (!maFeuille.data || maFeuille.data.statut === 'ouverte')
  // Soumise automatiquement à l'échéance ; passée (feuille renvoyée après coup), la date n'est pas montrée.
  const echeance = echeanceSoumission(precedente)
  const releves = dossiers.data ?? []
  if (!soumises.length && !aSoumettre && !releves.length) return null

  // Même geste que l'onglet Employés : confirmer, puis la fiche est désactivée.
  const releveProduit = async (d: DossierAFermer) => {
    const nom = d.nom_complet || d.surnom
    if (
      !(await confirmer({
        titre: `Relevé d’emploi produit pour ${nom} ?`,
        message: 'Sa fiche sera désactivée dans le référentiel (on peut la réactiver dans Référentiel › Employés). Ses heures restent.',
        libelleOk: 'Désactiver la fiche',
        danger: false,
      }))
    )
      return
    setErreur(null)
    fermer.mutate(d.employe_id, { onError: (e) => setErreur(e instanceof Error ? e.message : String(e)) })
  }

  return (
    <Groupe icone="⏱️" titre="Feuilles de temps">
      {soumises.length > 0 && (
        <Ligne
          to="/temps/approuver"
          titre={`Approuver ${pluriel(soumises.length, 'feuille')} de temps`}
          detail={periodes(soumises.map((f) => f.debut))}
        />
      )}
      {aSoumettre && (
        <Ligne
          to={`/temps?periode=${precedente}`}
          titre="Soumettre ma feuille de temps"
          detail={`${libellePeriodePaie(precedente)}${echeancePassee(echeance) ? '' : ` · avant le ${libelleEcheance(echeance)}`}`}
          alerte
        />
      )}
      {releves.slice(0, MAX_PAR_SOURCE).map((d) => (
        <Ligne
          key={d.employe_id}
          to="/temps/employes"
          titre={`Produire le relevé d’emploi : ${d.nom_complet || d.surnom}`}
          detail={`Aucune heure depuis 2 périodes · dernières heures : ${codePeriodePaie(d.derniere_periode)}`}
          action={
            <button
              type="button"
              disabled={fermer.isPending}
              onClick={() => releveProduit(d)}
              title="Relevé produit : désactiver la fiche"
              className="rounded-md border border-pierre-300 bg-white px-2 py-1 text-xs font-medium whitespace-nowrap text-pierre-700 hover:bg-pierre-50 disabled:opacity-50"
            >
              Relevé produit
            </button>
          }
        />
      ))}
      <Autres n={releves.length - MAX_PAR_SOURCE} to="/temps/employes" />
      {erreur && <li className="px-4 py-1.5 text-xs text-red-700">{erreur}</li>}
    </Groupe>
  )
}

// ---------------------------------------------------------------------------
// Réservations : nouvelles demandes et actions à prendre (réunion du
// 2026-10-21) — mêmes règles que le point rouge de la liste (actions.ts).

function Reservations() {
  const { data } = useReservationsGroupes()
  const signaux = useSignauxActions(jourAujourdhui())
  const { nouvelles, autres } = useMemo(() => {
    const avec = (data ?? []).map((r) => ({ r, actions: actionsDe(r, signaux) })).filter((x) => x.actions.length)
    const parArrivee = (a: (typeof avec)[number], b: (typeof avec)[number]) => a.r.date_arrivee.localeCompare(b.r.date_arrivee)
    return {
      nouvelles: avec.filter((x) => x.actions.some((a) => a.code === 'nouvelle')).sort(parArrivee),
      // Le reste : urgent d'abord (changement du client, aucun paiement), puis par arrivée.
      autres: avec
        .map((x) => ({ ...x, actions: x.actions.filter((a) => a.code !== 'nouvelle') }))
        .filter((x) => x.actions.length)
        .sort((a, b) => Number(b.actions.some((x) => x.urgent)) - Number(a.actions.some((x) => x.urgent)) || parArrivee(a, b)),
    }
  }, [data, signaux])
  if (!nouvelles.length && !autres.length) return null
  const total = new Set([...nouvelles, ...autres].map((x) => x.r.id)).size

  return (
    <Groupe icone="📒" titre="Réservations · à traiter" resume={pluriel(total, 'réservation')}>
      {nouvelles.length > 0 && (
        <Ligne
          to="/reservations"
          titre={nouvelles.length > 1 ? `${nouvelles.length} nouvelles demandes` : 'Nouvelle demande'}
          detail={nouvelles
            .slice(0, 3)
            .map((x) => `${x.r.numero} ${x.r.nom}`)
            .join(' · ')}
        />
      )}
      {autres.slice(0, MAX_PAR_SOURCE).map((x) => (
        <Ligne
          key={x.r.id}
          to={`/reservations/r/${x.r.id}`}
          titre={`${x.r.numero} · ${x.r.nom}`}
          detail={x.actions.map((a) => a.texte).join(' · ')}
          alerte={x.actions.some((a) => a.urgent)}
        />
      ))}
      <Autres n={autres.length - MAX_PAR_SOURCE} to="/reservations?vue=a_traiter" />
    </Groupe>
  )
}

// ---------------------------------------------------------------------------
// Travaux assignés à moi.

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
  const liste = [...ouvertes.slice(0, MAX_PAR_SOURCE), ...faites]
  if (!liste.length) return null
  const retards = ouvertes.filter((t) => enRetard(t, jour)).length

  return (
    <Groupe
      icone="🛠️"
      titre="Travaux · assignés à moi"
      resume={[retards ? `${retards} en retard` : null, pluriel(ouvertes.length, 'ouverte')].filter(Boolean).join(' · ')}
    >
      {liste.map((t) => {
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
            detail={faite ? 'Terminée' : morceaux.join(' · ') || undefined}
            alerte={!faite && (retard || t.priorite === 1)}
          />
        )
      })}
      <Autres n={ouvertes.length - MAX_PAR_SOURCE} to="/travaux" />
    </Groupe>
  )
}

// ---------------------------------------------------------------------------
// Mastertimeline : mes tâches du mois en cours, plus celles en retard.

const nomDuMois = (cle: string) => libelleMois(cle).split(' ')[0].toLowerCase()

/**
 * Passages de Mastertimeline (ce mois-ci et en retard) dont la personne est
 * responsable. Les responsables sont une liste propre au module : on les
 * relie au compte par le courriel (Mastertimeline › Réglages › Responsables),
 * sinon par le nom s'il est unique.
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

  const { enRetard, duMois, faits } = useMemo(() => {
    if (!moi || !taches.data || !index.pret) return { enRetard: [], duMois: [], faits: [] }
    const filtres = { ...FILTRES_VIDES, responsable: moi.id }
    const enRetard = trierPassages(retards(taches.data, index.index, filtres))
    const duMois = trierPassages(passagesDuMois(taches.data, cle, index.index, filtres)).filter(
      (p) => p.etat !== 'faite' && p.etat !== 'sautee',
    )
    const cles = new Set([...enRetard, ...duMois].map((p) => cleCoche(p.tache.id, p.periode)))
    const faits = cochees
      .filter((p) => !cles.has(cleCoche(p.tache.id, p.periode)))
      .map((p) => {
        const coche = index.index.get(cleCoche(p.tache.id, p.periode))
        return { ...p, coche, etat: coche?.statut ?? p.etat }
      })
    return { enRetard, duMois, faits }
  }, [moi, taches.data, index.pret, index.index, cle, cochees])

  const aFaire = [...enRetard, ...duMois]
  const liste = [...aFaire.slice(0, MAX_PAR_SOURCE), ...faits]
  if (!liste.length) return null

  const cocher = (p: Passage) => {
    setCochees((c) => (c.some((x) => x.tache.id === p.tache.id && x.periode === p.periode) ? c : [...c, p]))
    basculer(p.tache, p.periode, p.coche, 'faite')
  }

  return (
    <Groupe
      icone="✅"
      titre={`Mastertimeline · mes tâches ${/^[aeiouéèêh]/i.test(nomDuMois(cle)) ? 'd’' : 'de '}${nomDuMois(cle)}`}
      resume={[enRetard.length ? `${enRetard.length} en retard` : null, `${duMois.length} ce mois-ci`].filter(Boolean).join(' · ')}
    >
      {liste.map((p) => {
        const faite = p.etat === 'faite'
        return (
          <Ligne
            key={cleCoche(p.tache.id, p.periode)}
            to="/mastertimeline"
            caseACocher={<CaseCoche etat={p.etat} basculer={() => cocher(p)} desactivee={!ecriture} />}
            faite={faite}
            titre={p.tache.titre}
            detail={
              faite
                ? 'Faite'
                : p.etat === 'retard'
                  ? `En retard · ${p.periode === 'unique' ? 'échéance passée' : libelleMois(p.periode).toLowerCase()}`
                  : undefined
            }
            alerte={p.etat === 'retard'}
          />
        )
      })}
      <Autres n={aFaire.length - MAX_PAR_SOURCE} to="/mastertimeline" />
    </Groupe>
  )
}
