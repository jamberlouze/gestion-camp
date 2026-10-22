import { useState } from 'react'
import { Link } from 'react-router'
import { confirmer } from '@/lib/Confirmation'
import { IconeCorbeille } from '@/lib/icones'
import { urlPublique } from '@/lib/pagesPubliques'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { Section } from './commun'
import { useDonnees } from './contexte'
import { useFiches, useSupprimerFiche, useTotauxFiches } from './donnees'
import { aDesAllergies, csvFiches, dieteParticuliere, fichesManquantes, fichesSurPageClient, jourRecue, libelleDiete, nomFiche } from './fiches'
import { dateCourte } from './format'
import { LienPublic } from './LienPublic'
import { DIETES, type Diete, type FicheParticipant, type Reservation } from './types'

/**
 * Fiches participants d'une réservation (Classe nature, Journée plein air ;
 * réunion du 2026-10-21) : lien à transmettre aux parents, fiches reçues
 * contre attendues et totaux pour tous (`totaux_fiches`, jamais un nom) ;
 * avec l'accès « Fiches participants » (`reservations_sante`) : le tableau
 * de chaque fiche, l'export CSV et le rapport allergies et diètes pour la
 * cuisine (`RapportAllergies.tsx`, à imprimer).
 */
export function FichesParticipants({ r, refaire }: { r: Reservation; refaire?: () => void }) {
  const { peutLire } = useAuth()
  const voit = peutLire('reservations_sante')
  const totaux = useTotauxFiches(r.id)
  const fiches = useFiches(r.id, voit)
  const t = totaux.data
  const recues = t?.recues ?? 0
  const attendues = (r.nb_participants ?? 0) + (r.nb_accompagnateurs ?? 0)
  const manquantes = fichesManquantes(recues, attendues)
  const surPageClient = fichesSurPageClient(r)

  const exporter = () => {
    const lien = document.createElement('a')
    lien.href = URL.createObjectURL(new Blob([csvFiches(fiches.data ?? [], DIETES)], { type: 'text/csv;charset=utf-8' }))
    lien.download = `Fiches participants ${r.numero}.csv`
    lien.click()
    setTimeout(() => URL.revokeObjectURL(lien.href), 1000)
  }

  return (
    <Section
      titre="Fiches participants"
      action={
        voit &&
        recues > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            <Link to={`/reservations/r/${r.id}/allergies`} className={`${ui.boutonSecondaire} px-2.5 py-1.5 text-xs`}>
              Rapport cuisine
            </Link>
            <button
              className={`${ui.boutonSecondaire} px-2.5 py-1.5 text-xs`}
              title="Données de santé : le fichier n'est pas effacé avec les fiches (Loi 25), à supprimer après le séjour."
              onClick={exporter}
              disabled={!fiches.data}
            >
              Exporter (CSV)
            </button>
          </div>
        )
      }
    >
      <div className="space-y-3 text-sm">
        <p>
          <span className="font-medium tabular-nums">{recues}</span> fiche(s) reçue(s) sur {attendues} attendue(s)
          {' · '}
          {manquantes > 0 ? (
            <span className="font-medium text-amber-800">{manquantes} manquante(s)</span>
          ) : (
            <span className="text-foret-700">toutes reçues</span>
          )}
          {t && recues > 0 && (
            <span className="text-pierre-500">
              {' '}
              ({t.participants} élève(s), {t.adultes} adulte(s))
            </span>
          )}
        </p>
        {t && recues > 0 && (
          <div className="flex flex-wrap gap-1.5 text-xs">
            {Object.entries(t.dietes).map(([d, n]) => (
              <span key={d} className="rounded-full bg-foret-50 px-2 py-0.5 text-foret-800">
                {DIETES[d as Diete]} : {n}
              </span>
            ))}
            {t.allergies > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">Allergies : {t.allergies}</span>}
            {t.problemes > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">Problèmes de santé : {t.problemes}</span>}
            {t.epipen > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-800">Epipen : {t.epipen}</span>}
            {t.sans_medicaments > 0 && <span className="rounded-full bg-pierre-100 px-2 py-0.5 text-pierre-700">Sans autorisation de médicaments : {t.sans_medicaments}</span>}
            {t.effacees > 0 && <span className="rounded-full bg-pierre-100 px-2 py-0.5 text-pierre-500">Effacées (Loi 25) : {t.effacees}</span>}
          </div>
        )}

        <div className="border-t border-pierre-100 pt-3">
          <LienPublic
            libelle="Lien des fiches (à transmettre aux parents)"
            aide="Une fiche par élève et par adulte : allergies, Epipen, diète, médicaments. Effacées 3 mois après le séjour (Loi 25)."
            url={urlPublique(`/fiches/${r.jeton_fiches}`)}
            refaire={refaire}
          />
          <p className={`mt-1.5 text-xs ${surPageClient ? 'text-pierre-500' : 'text-amber-800'}`}>
            {surPageClient
              ? 'Sur la page client : ce lien et les fiches reçues (nom, classe, allergies, diète — rien d’autre de la santé).'
              : 'Pas encore sur la page client : le lien et les fiches reçues (nom, classe, allergies, diète) y paraîtront à la signature du contrat.'}
          </p>
        </div>

        {voit ? (
          recues > 0 && <TableauFiches fiches={fiches.data} erreur={fiches.error} />
        ) : (
          <p className="text-xs text-pierre-500">Le détail des fiches (noms, santé) est réservé à l’accès « Fiches participants ».</p>
        )}
      </div>
    </Section>
  )
}

type Filtre = 'a_signaler' | 'epipen' | 'toutes'

/** Quelque chose à savoir : allergies, santé, Epipen, diète particulière ou pas d'autorisation de médicaments. */
const aSignaler = (f: FicheParticipant) => !f.effacee_le && (aDesAllergies(f) || !!f.sante || !!f.epipen || dieteParticuliere(f) || f.medicaments === false)

function TableauFiches({ fiches, erreur }: { fiches: FicheParticipant[] | undefined; erreur: Error | null }) {
  const { peutEcrire } = useAuth()
  const { auj } = useDonnees()
  const supprimer = useSupprimerFiche()
  const liste = fiches ?? []
  const compte: Record<Filtre, number> = {
    a_signaler: liste.filter(aSignaler).length,
    epipen: liste.filter((f) => f.epipen).length,
    toutes: liste.length,
  }
  // Ce qui compte d'abord : les fiches à signaler (s'il y en a).
  const [filtre, setFiltre] = useState<Filtre | null>(null)
  const actif: Filtre = filtre ?? (compte.a_signaler > 0 ? 'a_signaler' : 'toutes')
  const affichees = actif === 'a_signaler' ? liste.filter(aSignaler) : actif === 'epipen' ? liste.filter((f) => f.epipen) : liste

  if (erreur) return <p className={ui.erreur}>{erreur.message}</p>
  if (!fiches) return <p className="text-xs text-pierre-500">Chargement des fiches…</p>

  return (
    <div className="space-y-2">
      <div className="inline-flex flex-wrap rounded-lg border border-pierre-300 bg-white p-0.5 text-xs" role="group" aria-label="Fiches affichées">
        {(
          [
            ['a_signaler', 'À signaler'],
            ['epipen', 'Epipen'],
            ['toutes', 'Toutes'],
          ] as const
        ).map(([cle, nom]) => (
          <button
            key={cle}
            type="button"
            aria-pressed={actif === cle}
            className={`rounded-md px-2.5 py-1 ${actif === cle ? 'bg-foret-100 font-medium text-foret-800' : 'text-pierre-600 hover:text-pierre-900'}`}
            onClick={() => setFiltre(cle)}
          >
            {nom} <span className="tabular-nums text-pierre-400">{compte[cle]}</span>
          </button>
        ))}
      </div>
      {affichees.length === 0 ? (
        <p className="text-xs text-pierre-500">Aucune fiche.</p>
      ) : (
        <div className="w-0 min-w-full overflow-x-auto rounded-lg border border-pierre-200">
          <table className="w-full text-xs">
            <thead className="border-b border-pierre-200 bg-pierre-50 text-left uppercase tracking-wide text-pierre-500">
              <tr>
                <th className="px-2 py-1.5 font-medium">Nom</th>
                <th className="px-2 py-1.5 font-medium">Classe</th>
                <th className="px-2 py-1.5 font-medium">Reçue</th>
                <th className="px-2 py-1.5 font-medium">Allergies</th>
                <th className="px-2 py-1.5 font-medium">Santé</th>
                <th className="px-2 py-1.5 font-medium">Epipen</th>
                <th className="px-2 py-1.5 font-medium">Diète</th>
                <th className="px-2 py-1.5 font-medium" title="Médicaments en vente libre au besoin">Médic.</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-pierre-100">
              {affichees.map((f) => (
                <tr key={f.id} className="align-top">
                  <td className="px-2 py-1.5">
                    {f.effacee_le ? (
                      <span className="text-pierre-400">Effacée</span>
                    ) : (
                      <>
                        <span className="whitespace-nowrap font-medium text-pierre-900">{nomFiche(f)}</span>
                        {f.genre === 'adulte' && <span className="ml-1 text-pierre-400">(adulte)</span>}
                        {f.matricule && <div className="text-pierre-400">{f.matricule}</div>}
                      </>
                    )}
                  </td>
                  <td className="px-2 py-1.5">{f.groupe}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-pierre-500">{dateCourte(jourRecue(f), auj)}</td>
                  <td className="min-w-36 px-2 py-1.5 text-amber-900">{f.allergies}</td>
                  <td className="min-w-36 px-2 py-1.5">{f.problemes_sante ?? (f.sante === false ? <span className="text-pierre-400">Rien</span> : null)}</td>
                  <td className="px-2 py-1.5">{f.epipen ? <span className="font-medium text-red-700">Oui</span> : f.epipen === false ? 'Non' : ''}</td>
                  <td className="px-2 py-1.5">
                    {dieteParticuliere(f) ? <span className="font-medium text-foret-800">{libelleDiete(f, DIETES)}</span> : <span className="text-pierre-400">{libelleDiete(f, DIETES)}</span>}
                  </td>
                  <td className="px-2 py-1.5">{f.medicaments === null ? '' : f.medicaments ? 'Oui' : <span className="font-medium text-amber-800">Non</span>}</td>
                  <td className="px-2 py-1.5 text-right">
                    {peutEcrire('reservations_sante') && (
                      // Liste compacte : la poubelle seule (exception de la règle des boutons).
                      <button
                        type="button"
                        className="rounded p-1 text-pierre-400 hover:bg-red-50 hover:text-red-700"
                        title="Supprimer la fiche"
                        aria-label={`Supprimer la fiche ${nomFiche(f) || 'effacée'}`}
                        onClick={async () => {
                          const ok = await confirmer({ titre: 'Supprimer cette fiche ?', message: 'Pour une fiche en double ou remplie par erreur.', libelleOk: 'Supprimer', danger: true })
                          if (ok) supprimer.mutate(f.id)
                        }}
                      >
                        <IconeCorbeille className="size-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
