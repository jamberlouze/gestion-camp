import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { sortirCarte } from '@/lib/sortieCarte'
import { ui } from '@/lib/ui'
import { useOutilsCourriels } from './CartesCourriels'
import { BoutonCopier, MenuSaison, PuceAncien } from './commun'
import { useRh } from './contexte'
import { lireInvitationsEnAttente, useInviterRetour, useRetirerInvitation } from './donnees'
import { lienRetour } from './liens'
import { correspond, dateCourte, estAncien, nomAffiche, texteRecherche } from './outils'
import { champPetit } from './styles'
import type { Invitation, Personne } from './types'

// Intention de retour (plan-rh.md §1.8 et §4) : un lien personnel par
// personne et saison visée, plus de rattachement par courriel. Décision de
// Maxime du 2026-10-12 : les employés de la saison, cochés à la main (les
// « ne pas réembaucher » décochés), plus au besoin des « A déjà travaillé » ;
// pas de lien générique. Inviter prépare aussi le courriel de chacun (phase
// 3), à envoyer en lot depuis Courriels › À envoyer ; le lien se copie encore.

export function PuceInvitation({ i }: { i: Invitation }) {
  if (i.reponse === 'oui')
    return <span className="inline-flex whitespace-nowrap rounded-full bg-foret-100 px-2 py-0.5 text-xs font-medium text-foret-800">Oui · {dateCourte(i.repondu_le)}</span>
  if (i.reponse === 'non')
    return <span className="inline-flex whitespace-nowrap rounded-full bg-pierre-100 px-2 py-0.5 text-xs font-medium text-pierre-700">Non · {dateCourte(i.repondu_le)}</span>
  return <span className="inline-flex whitespace-nowrap rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">En attente</span>
}

/** Inviter les employés d'une saison (et des anciens) ; liens à copier. */
export function FenetreRetour({ saisonSource, fermer }: { saisonSource: string | null; fermer: () => void }) {
  const { saisons, saisonParId, embauches, embauchesDe, personnes, personneParId, posteParId, invitations, compagnies, ecriture } = useRh()
  const inviter = useInviterRetour()
  const outils = useOutilsCourriels()
  const retirer = useRetirerInvitation()
  const source = saisonSource ? saisonParId.get(saisonSource) : undefined
  // Saison visée par défaut : la même saison l'an prochain, sinon la première
  // saison ouverte qui suit, sinon la première ouverte.
  const [visee, setVisee] = useState<string | null>(
    () =>
      (
        (source && saisons.find((s) => s.genre === source.genre && s.annee === source.annee + 1)) ??
        (source && saisons.find((s) => s.ouverte && s.rang > source.rang)) ??
        saisons.find((s) => s.ouverte) ??
        saisons.at(-1)
      )?.id ?? null,
  )
  const invitees = useMemo(() => new Map(invitations.filter((i) => i.saison_id === visee).map((i) => [i.personne_id, i])), [invitations, visee])

  // Employés de la saison affichée (embauches non annulées), une ligne par personne.
  const employes = useMemo(() => {
    const ids = [...new Set(embauches.filter((e) => e.saison_id === saisonSource && e.statut !== 'annulee').map((e) => e.personne_id))]
    return ids.map((id) => personneParId.get(id)).filter((p): p is Personne => !!p).sort((a, b) => a.nom_complet.localeCompare(b.nom_complet, 'fr'))
  }, [embauches, saisonSource, personneParId])
  const anciens = useMemo(() => {
    const deja = new Set(employes.map((p) => p.id))
    return personnes.filter((p) => !deja.has(p.id) && estAncien(p, embauchesDe.get(p.id) ?? [], saisonParId))
  }, [personnes, employes, embauchesDe, saisonParId])

  const [coches, setCoches] = useState<Set<string>>(() => new Set(employes.filter((p) => !p.ne_pas_reembaucher).map((p) => p.id)))
  const [recherche, setRecherche] = useState('')
  const [bilan, setBilan] = useState<string | null>(null)
  const aInviter = [...coches].filter((id) => !invitees.has(id))
  const basculer = (id: string) => setCoches((c) => (c.has(id) ? new Set([...c].filter((x) => x !== id)) : new Set([...c, id])))

  /** Compagnie qui écrit : celle de sa dernière embauche, sinon la GBPA+. */
  const entrepriseDe = (p: Personne) =>
    [...(embauchesDe.get(p.id) ?? [])]
      .filter((e) => e.statut !== 'annulee' && e.entreprise_id)
      .sort((a, b) => (saisonParId.get(b.saison_id)?.rang ?? 0) - (saisonParId.get(a.saison_id)?.rang ?? 0))[0]?.entreprise_id ??
    compagnies.find((c) => c.abreviation === 'GBPA+' || c.nom === 'GBPA+')?.id ??
    null

  /** Courriel de chaque invitation sans réponse de la saison visée (de ces personnes seulement, si on les donne) ; jamais deux fois le même. */
  const preparerCourriels = async (seulement?: string[]) => {
    if (!visee) return ''
    const enAttente = (await lireInvitationsEnAttente(visee)).filter((i) => !seulement || seulement.includes(i.personne_id))
    const raisons: string[] = []
    const courriels = enAttente.flatMap((i) => {
      const p = personneParId.get(i.personne_id)
      if (!p) return []
      const r = outils.rediger({
        genre: 'retour',
        personne: p,
        entreprise: entrepriseDe(p),
        cle: `retour:${i.id}`,
        saison: saisonParId.get(i.saison_id)?.nom,
        lienRetour: lienRetour(i),
        invitation_id: i.id,
      })
      if ('raison' in r) {
        raisons.push(r.raison)
        return []
      }
      return [r.courriel]
    })
    const n = await outils.preparer.mutateAsync(courriels)
    const sans = raisons.length ? ` ${raisons.length} sans courriel (${[...new Set(raisons)].slice(0, 2).join(' ; ')}).` : ''
    return `${n} courriel${n > 1 ? 's' : ''} préparé${n > 1 ? 's' : ''} (Courriels › À envoyer).${sans}`
  }

  const posteDe = (p: Personne) => {
    const e = (embauchesDe.get(p.id) ?? []).find((x) => x.saison_id === saisonSource && x.statut !== 'annulee')
    return e?.poste_id ? posteParId.get(e.poste_id)?.nom : undefined
  }

  const ligne = (p: Personne) => {
    const i = invitees.get(p.id)
    return (
      <li key={p.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
        {i ? (
          <span className="w-4" />
        ) : (
          <input type="checkbox" aria-label={nomAffiche(p)} checked={coches.has(p.id)} disabled={!ecriture} onChange={() => basculer(p.id)} />
        )}
        <Link to={`/rh/p/${p.id}`} className="font-medium text-pierre-900 hover:underline">
          {nomAffiche(p)}
        </Link>
        {p.ne_pas_reembaucher && <span title={p.raison_ne_pas ?? 'Ne pas réembaucher'}>⛔</span>}
        <span className="text-xs text-pierre-500">{posteDe(p)}</span>
        <span className="flex-1" />
        {i && <PuceInvitation i={i} />}
      </li>
    )
  }

  const listeInvitations = invitations
    .filter((i) => i.saison_id === visee)
    .map((i) => ({ i, p: personneParId.get(i.personne_id) }))
    .filter((x): x is { i: Invitation; p: Personne } => !!x.p)
    .sort((a, b) => a.p.nom_complet.localeCompare(b.p.nom_complet, 'fr'))
  const compte = (r: Invitation['reponse']) => listeInvitations.filter((x) => x.i.reponse === r).length
  const anciensVisibles = recherche.trim() ? anciens.filter((p) => correspond(texteRecherche(p), recherche)) : anciens

  return (
    <Dialogue titre="Intention de retour" fermer={fermer} large>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-pierre-700">Saison visée :</span>
          <MenuSaison className={champPetit} valeur={visee} changer={setVisee} />
        </div>
        <p className="text-pierre-600">
          Chaque personne invitée reçoit un <strong>lien personnel</strong> : sa réponse devient une candidature « Intention de retour » (« Non » = « Ne revient pas »).
          Inviter prépare le courriel de chacun, à relire et envoyer en lot dans Courriels › À envoyer (on peut aussi copier le lien).
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <section className="rounded-lg border border-pierre-200 p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">
                  Employés · {source?.nom ?? 'saison'} ({employes.length})
                </h3>
                <span className="flex-1" />
                {ecriture && employes.length > 0 && (
                  <>
                    <button className="text-xs text-foret-700 underline" onClick={() => setCoches((c) => new Set([...c, ...employes.map((p) => p.id)]))}>
                      Tout cocher
                    </button>
                    <button className="text-xs text-pierre-500 underline" onClick={() => setCoches((c) => new Set([...c].filter((id) => !employes.some((p) => p.id === id))))}>
                      Tout décocher
                    </button>
                  </>
                )}
              </div>
              {employes.length === 0 ? <p className="text-pierre-500">Aucun employé pour cette saison.</p> : <ul className="divide-y divide-pierre-100">{employes.map(ligne)}</ul>}
            </section>

            <details className="rounded-lg border border-pierre-200 p-3">
              <summary className="cursor-pointer font-semibold">
                Autres anciens ({anciens.length}) <PuceAncien />
              </summary>
              <p className="mt-1 text-xs text-pierre-500">« A déjà travaillé avec nous » ou une embauche complète d'une autre saison. Aucun n'est coché d'office.</p>
              <input className={`${champPetit} mt-2 w-full`} placeholder="Chercher un nom…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
              <ul className="mt-1 max-h-80 divide-y divide-pierre-100 overflow-y-auto">{anciensVisibles.map(ligne)}</ul>
            </details>

            {ecriture && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className={ui.bouton}
                  disabled={!visee || aInviter.length === 0 || inviter.isPending}
                  onClick={() => {
                    const invites = [...aInviter]
                    inviter.mutate(
                      { saison: visee!, personnes: invites },
                      {
                        onSuccess: async (n) => {
                          const texte = `${n} invitation${n > 1 ? 's' : ''} créée${n > 1 ? 's' : ''}.`
                          setBilan(texte)
                          try {
                            setBilan(`${texte} ${await preparerCourriels(invites)}`)
                          } catch (e) {
                            setBilan(`${texte} Courriels non préparés : ${messageErreur(e)}`)
                          }
                        },
                      },
                    )
                  }}
                >
                  {inviter.isPending ? 'Création…' : `Inviter ${aInviter.length} personne${aInviter.length > 1 ? 's' : ''}`}
                </button>
                {bilan && <span className="text-foret-700">{bilan}</span>}
              </div>
            )}
            {inviter.error && <p className={ui.erreur}>{messageErreur(inviter.error)}</p>}
          </div>

          <section className="rounded-lg border border-pierre-200 p-3">
            <h3 className="font-semibold">
              Invitations — {visee ? saisonParId.get(visee)?.nom : ''} ({listeInvitations.length})
            </h3>
            <p className="mb-2 text-xs text-pierre-500">
              Oui {compte('oui')} · Non {compte('non')} · En attente {compte(null)}
              {ecriture && compte(null) > 0 && (
                <button
                  className="ml-2 text-foret-700 underline"
                  disabled={outils.preparer.isPending || !outils.pret}
                  onClick={() =>
                    preparerCourriels(undefined)
                      .then(setBilan)
                      .catch((e) => setBilan(messageErreur(e)))
                  }
                  title="Prépare le courriel des invitations en attente qui n’en ont pas encore"
                >
                  Préparer les courriels manquants
                </button>
              )}
            </p>
            {listeInvitations.length === 0 ? (
              <p className="text-pierre-500">Personne n'est encore invité pour cette saison.</p>
            ) : (
              <ul className="max-h-[28rem] divide-y divide-pierre-100 overflow-y-auto">
                {listeInvitations.map(({ i, p }) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-2 py-1.5">
                    <Link to={`/rh/p/${p.id}`} className="font-medium text-pierre-900 hover:underline">
                      {nomAffiche(p)}
                    </Link>
                    <PuceInvitation i={i} />
                    {i.candidature_id && (
                      <Link to={`/rh/c/${i.candidature_id}`} className="text-xs text-foret-700 underline">
                        Candidature
                      </Link>
                    )}
                    <span className="flex-1" />
                    <BoutonCopier url={lienRetour(i)} className="rounded-md border border-pierre-300 px-2 py-1 text-xs font-medium text-pierre-700 hover:bg-pierre-50" />
                    {ecriture && !i.reponse && (
                      <button className="text-xs text-pierre-400 hover:text-red-700" title="Retirer l'invitation (le lien ne fonctionnera plus)" onClick={(e) => sortirCarte(e.currentTarget.closest('li'), () => retirer.mutate(i.id))}>
                        Retirer
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <div className="flex justify-end">
          <button className={ui.boutonSecondaire} onClick={fermer}>
            Fermer
          </button>
        </div>
      </div>
    </Dialogue>
  )
}
