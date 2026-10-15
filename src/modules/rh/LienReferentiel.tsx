import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useRh } from './contexte'
import { useDelierEmploye, useEmployesReferentiel, usePeutRelier, usePersonnesARelier, useRelierEmploye } from './donneesConformite'
import { correspondance, nomFiche } from './referentiel'
import { correspond, sansAccents } from './outils'
import type { EmployeReferentiel, Personne } from './types'

// Lien avec le référentiel Employés (plan-rh.md §14.5). La validation d'une
// embauche relie (ou crée) la fiche toute seule ; ici, la direction relie
// l'existant (aucune personne n'était reliée avant la phase 4) et corrige.

/**
 * « Relier au référentiel » (onglet Personnes) : chaque personne avec la
 * correspondance proposée (même courriel = sûre ; même nom = à vérifier) ;
 * « Relier », « Créer la fiche », « Relier les correspondances sûres ».
 */
export function FenetreReferentiel({ fermer }: { fermer: () => void }) {
  const { personnes, embauchesDe, saisonParId } = useRh()
  const aRelier = usePersonnesARelier()
  const employes = useEmployesReferentiel()
  const relier = useRelierEmploye()
  const [enLot, setEnLot] = useState<{ fait: number; total: number } | null>(null)
  const [erreurs, setErreurs] = useState<string[]>([])
  const [recherche, setRecherche] = useState('')

  const reliees = useMemo(() => new Set(personnes.map((p) => p.employe_id).filter((x): x is string => !!x)), [personnes])
  const lignes = useMemo(() => {
    if (!employes.data) return []
    return aRelier
      .map((p) => {
        const derniere = (embauchesDe.get(p.id) ?? [])
          .filter((e) => e.statut === 'complete')
          .map((e) => saisonParId.get(e.saison_id))
          .filter((s) => !!s)
          .sort((a, b) => b.rang - a.rang)[0]
        return { p, derniere, proposee: correspondance(p, employes.data, reliees) }
      })
      .filter(({ p }) => !recherche.trim() || correspond(sansAccents(`${p.prenom} ${p.nom_famille} ${p.surnom ?? ''} ${p.courriel ?? ''}`), recherche))
      .sort((a, b) => Number(!!b.proposee?.sure) - Number(!!a.proposee?.sure) || Number(!!b.proposee) - Number(!!a.proposee) || (b.derniere?.rang ?? 0) - (a.derniere?.rang ?? 0) || a.p.nom_complet.localeCompare(b.p.nom_complet, 'fr'))
  }, [aRelier, employes.data, reliees, embauchesDe, saisonParId, recherche])
  const sures = lignes.filter((l) => l.proposee?.sure)

  const relierSures = async () => {
    setErreurs([])
    setEnLot({ fait: 0, total: sures.length })
    const e: string[] = []
    for (const [i, l] of sures.entries()) {
      try {
        await relier.mutateAsync({ personne: l.p.id, employe: l.proposee!.employe.id })
      } catch (x) {
        e.push(`${l.p.nom_complet} : ${messageErreur(x)}`)
      }
      setEnLot({ fait: i + 1, total: sures.length })
    }
    setErreurs(e)
    setEnLot(null)
  }

  return (
    <Dialogue titre="Relier au référentiel Employés" fermer={fermer} large>
      <div className="space-y-3 text-sm">
        <p className="text-pierre-600">
          Personnes qui ont une embauche complète mais pas de fiche dans Référentiel › Employés (matricule Employeur D, Feuilles de temps, Animation, Rooming). Désormais, «
          Valider l'embauche » relie ou crée la fiche tout seul. Une fiche créée ici reprend le nom de camp, le prénom, le nom, le courriel, le poste et la compagnie de la
          dernière embauche ; elle est active si cette embauche n'est pas terminée.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input className="w-64 rounded-lg border border-pierre-300 px-2.5 py-1.5" placeholder="Chercher un nom…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          <span className="flex-1" />
          <button className={ui.bouton} disabled={!sures.length || !!enLot} onClick={relierSures}>
            {enLot
              ? `Relier… ${enLot.fait} / ${enLot.total}`
              : sures.length === 0
                ? 'Aucune correspondance sûre'
                : sures.length === 1
                  ? 'Relier la correspondance sûre'
                  : `Relier les ${sures.length} correspondances sûres`}
          </button>
        </div>
        {erreurs.length > 0 && (
          <ul className={`${ui.erreur} list-disc pl-6`}>
            {erreurs.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
        {employes.error ? (
          <p className={ui.erreur}>{messageErreur(employes.error)}</p>
        ) : !employes.data ? (
          <p className="py-6 text-center text-pierre-500">Chargement…</p>
        ) : lignes.length === 0 ? (
          <p className="rounded-lg bg-foret-50 px-3 py-2 text-foret-800">Toutes les personnes qui ont une embauche complète sont reliées.</p>
        ) : (
          <div className={`${ui.carte} max-h-[55dvh] overflow-auto`}>
            <table className="w-full min-w-[600px] text-sm">
              <thead className="sticky top-0 bg-pierre-50 text-left text-xs text-pierre-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Personne</th>
                  <th className="px-3 py-2 font-medium">Dernière embauche</th>
                  <th className="px-3 py-2 font-medium">Fiche proposée</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-pierre-100">
                {lignes.map(({ p, derniere, proposee }) => (
                  <LigneARelier key={p.id} p={p} saison={derniere?.nom ?? ''} proposee={proposee} employes={employes.data!} reliees={reliees} fermer={fermer} occupe={!!enLot} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end">
          <button className={ui.boutonSecondaire} onClick={fermer}>
            Fermer
          </button>
        </div>
      </div>
    </Dialogue>
  )
}

function LigneARelier({
  p,
  saison,
  proposee,
  employes,
  reliees,
  fermer,
  occupe,
}: {
  p: Personne
  saison: string
  proposee: ReturnType<typeof correspondance>
  employes: EmployeReferentiel[]
  reliees: Set<string>
  fermer: () => void
  occupe: boolean
}) {
  const relier = useRelierEmploye()
  const [autre, setAutre] = useState(false)
  const petit = 'rounded-md border border-pierre-300 bg-white px-2 py-1 text-xs font-medium text-pierre-700 hover:bg-pierre-50 disabled:opacity-50'
  return (
    <tr>
      <td className="px-3 py-2">
        <Link to={`/rh/p/${p.id}`} className="font-medium text-pierre-900 hover:underline" onClick={fermer}>
          {p.nom_complet}
        </Link>
        {p.surnom && <span className="text-pierre-500"> · {p.surnom}</span>}
        {p.courriel && <span className="block text-xs text-pierre-500">{p.courriel}</span>}
      </td>
      <td className="px-3 py-2 text-pierre-600">{saison}</td>
      <td className="px-3 py-2">
        {autre ? (
          <ChoixFiche employes={employes} reliees={reliees} choisir={(id) => relier.mutate({ personne: p.id, employe: id })} annuler={() => setAutre(false)} />
        ) : proposee ? (
          <span>
            {nomFiche(proposee.employe)}{' '}
            <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${proposee.sure ? 'bg-foret-100 text-foret-800' : 'bg-amber-100 text-amber-800'}`}>
              {proposee.sure ? 'même courriel' : 'même nom : à vérifier'}
            </span>
          </span>
        ) : (
          <span className="text-pierre-400">Aucune</span>
        )}
        {relier.error && <span className="block text-xs text-red-700">{messageErreur(relier.error)}</span>}
      </td>
      <td className="px-3 py-2">
        <span className="flex flex-wrap justify-end gap-1.5">
          {proposee && !autre && (
            <button className={petit} disabled={relier.isPending || occupe} onClick={() => relier.mutate({ personne: p.id, employe: proposee.employe.id })}>
              Relier
            </button>
          )}
          {!autre && (
            <button className={petit} disabled={relier.isPending || occupe} onClick={() => setAutre(true)}>
              Autre fiche…
            </button>
          )}
          <button
            className={petit}
            disabled={relier.isPending || occupe}
            onClick={async () => {
              if (proposee && !(await confirmer({ titre: 'Créer une nouvelle fiche ?', message: `${nomFiche(proposee.employe)} semble être la même personne.`, libelleOk: 'Créer la fiche' }))) return
              relier.mutate({ personne: p.id, employe: null })
            }}
          >
            Créer la fiche
          </button>
        </span>
      </td>
    </tr>
  )
}

/** Choisir une fiche du référentiel (pas déjà reliée à une autre personne). */
function ChoixFiche({ employes, reliees, choisir, annuler, actuelle }: { employes: EmployeReferentiel[]; reliees: Set<string>; choisir: (id: string) => void; annuler: () => void; actuelle?: string | null }) {
  const [choix, setChoix] = useState('')
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <select className="max-w-64 rounded-md border border-pierre-300 px-2 py-1 text-xs" value={choix} onChange={(e) => setChoix(e.target.value)} aria-label="Fiche du référentiel">
        <option value="">Choisir une fiche…</option>
        {employes
          .filter((e) => e.id === actuelle || !reliees.has(e.id))
          .map((e) => (
            <option key={e.id} value={e.id}>
              {nomFiche(e)}
              {e.actif ? '' : ' (inactive)'}
            </option>
          ))}
      </select>
      <button className="rounded-md bg-foret-700 px-2 py-1 text-xs font-medium text-white disabled:opacity-50" disabled={!choix || choix === actuelle} onClick={() => choisir(choix)}>
        Relier
      </button>
      <button className="text-xs text-pierre-500 underline" onClick={annuler}>
        Annuler
      </button>
    </span>
  )
}

/** Fiche d'une personne : sa fiche du référentiel, avec changer, délier ou relier (direction). */
export function LienReferentielFiche({ p }: { p: Personne }) {
  const { personnes } = useRh()
  const peut = usePeutRelier()
  const employes = useEmployesReferentiel()
  const relier = useRelierEmploye()
  const delier = useDelierEmploye()
  const [changer, setChanger] = useState(false)
  const fiche = p.employe_id ? employes.data?.find((e) => e.id === p.employe_id) : undefined
  const reliees = useMemo(() => new Set(personnes.map((x) => x.employe_id).filter((x): x is string => !!x)), [personnes])
  const petit = 'text-xs text-foret-700 underline disabled:opacity-50'
  return (
    <div>
      <p className="mb-1 block text-xs font-medium tracking-wide text-pierre-500 uppercase">Référentiel Employés</p>
      {changer && employes.data ? (
        <ChoixFiche
          employes={employes.data}
          reliees={reliees}
          actuelle={p.employe_id}
          choisir={(id) => relier.mutate({ personne: p.id, employe: id }, { onSuccess: () => setChanger(false) })}
          annuler={() => setChanger(false)}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {p.employe_id ? (
            <span>
              {fiche ? nomFiche(fiche) : '…'}
              {fiche && !fiche.actif && <span className="text-pierre-500"> (inactive)</span>}
              {fiche && <span className="text-pierre-500"> · matricule {fiche.matricule_employeur_d ?? 'à saisir'}</span>}
            </span>
          ) : (
            <span className="text-pierre-500">Pas reliée (la validation d'une embauche la relie)</span>
          )}
          {peut && (
            <>
              <button className={petit} disabled={relier.isPending} onClick={() => setChanger(true)}>
                {p.employe_id ? 'Changer' : 'Relier…'}
              </button>
              {!p.employe_id && (
                <button className={petit} disabled={relier.isPending} onClick={() => relier.mutate({ personne: p.id, employe: null })}>
                  Créer la fiche
                </button>
              )}
              {p.employe_id && (
                <button
                  className="text-xs text-pierre-500 underline hover:text-red-700 disabled:opacity-50"
                  disabled={delier.isPending}
                  onClick={async () => (await confirmer({ titre: 'Délier la fiche du référentiel ?', message: 'La fiche reste dans le référentiel ; seul le lien est retiré.', libelleOk: 'Délier' })) && delier.mutate(p.id)}
                >
                  Délier
                </button>
              )}
            </>
          )}
        </div>
      )}
      {(relier.error || delier.error) && <p className="mt-1 text-xs text-red-700">{messageErreur(relier.error ?? delier.error)}</p>}
    </div>
  )
}
