import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { IconeAttention } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { ChoixCategorie, Chargement, LienExterne, PastilleCategorie } from './commun'
import { dateCourte, rangCategorie } from './outils'
import { adresseStockage, reveiller, useAValider, useCamps, useEcriture, useModifier, useProgrammes, useValider } from './donnees'
import { TYPES_CAMP, type Camp, type Categorie, type Changement } from './types'

/** Valider ou rejeter les changements détectés et les camps proposés. */
export function AValider() {
  const ecriture = useEcriture()
  const changements = useAValider()
  const camps = useCamps()
  const programmes = useProgrammes()
  const valider = useValider()

  const camp = useMemo(() => new Map((camps.data ?? []).map((c) => [c.id, c])), [camps.data])
  const programme = useMemo(() => new Map((programmes.data ?? []).map((p) => [p.id, p])), [programmes.data])

  const erreur = changements.error ?? camps.error ?? programmes.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!changements.data || !camps.data || !programmes.data) return <Chargement />

  const parType = (t: Changement['type']) => changements.data.filter((c) => c.type === t)
  const prix = parType('prix')
  const nouveauxProgrammes = parType('nouveau_programme')
  const activites = parType('nouvelle_activite')
  const proposes = camps.data.filter((c) => c.statut_inclusion === 'propose').sort((a, b) =>
    rangCategorie(a) - rangCategorie(b) || a.nom.localeCompare(b.nom, 'fr'))

  const decider = (c: Changement, accepter: boolean) => valider.mutate({ id: c.id, accepter })
  const toutValider = async (liste: Changement[], titre: string) => {
    if (!(await confirmer({ titre: `Valider les ${liste.length} ${titre} ?`, libelleOk: 'Tout valider', danger: false }))) return
    for (const c of liste) await valider.mutateAsync({ id: c.id, accepter: true }).catch(() => null)
  }

  const vide = !prix.length && !nouveauxProgrammes.length && !activites.length && !proposes.length
  const nomCamp = (id: string) => camp.get(id)?.nom ?? '?'

  return (
    <div className="space-y-6">
      {vide && <p className="rounded-lg bg-pierre-100 px-4 py-6 text-center text-sm text-pierre-600">Rien à valider pour l'instant.</p>}
      {!ecriture && !vide && <p className="text-sm text-pierre-500">Lecture seule : vous n'avez pas le droit de valider.</p>}

      {prix.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50/60 p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-amber-900">
            <IconeAttention className="size-5" /> Changements de prix ({prix.length})
          </h2>
          <ul className="divide-y divide-amber-200">
            {prix.map((c) => {
              const d = c.details as { nom?: string; prix?: number; ancien_prix?: number | null; duree_nuits?: number | null; anciennes_nuits?: number | null }
              const p = c.programme_id ? programme.get(c.programme_id) : undefined
              const variation = d.ancien_prix && d.prix != null ? d.prix / d.ancien_prix - 1 : null
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-64 flex-1">
                    <Link to={`/vigie/camps/${c.camp_id}`} className="font-medium hover:underline">
                      {nomCamp(c.camp_id)}
                    </Link>
                    <span className="text-pierre-600"> — {p?.nom ?? d.nom ?? 'programme'}</span>
                    <div className="text-sm">
                      <span className="text-pierre-500 line-through decoration-pierre-400">{c.ancienne_valeur}</span>
                      <span className="mx-1.5">→</span>
                      <b>{c.nouvelle_valeur}</b>
                      {variation != null && (
                        <span className={`ml-2 rounded-full px-1.5 text-xs ${variation > 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                          {variation > 0 ? '+' : ''}
                          {(variation * 100).toFixed(1).replace('.', ',')} %
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-pierre-500">
                      Détecté le {dateCourte(c.detecte_le)} {c.source_url && <>· <LienExterne href={c.source_url}>source</LienExterne></>}
                    </div>
                  </div>
                  {ecriture && <Boutons decider={(ok) => decider(c, ok)} />}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {nouveauxProgrammes.length > 0 && (
        <Section titre={`Nouveaux programmes (${nouveauxProgrammes.length})`} action={ecriture && nouveauxProgrammes.length > 1 && (
          <button className="text-sm text-foret-700 underline" onClick={() => toutValider(nouveauxProgrammes, 'nouveaux programmes')}>Tout valider</button>
        )}>
          {nouveauxProgrammes.map((c) => {
            const d = c.details as { description?: string | null }
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-64 flex-1">
                  <Link to={`/vigie/camps/${c.camp_id}`} className="font-medium hover:underline">
                    {nomCamp(c.camp_id)}
                  </Link>
                  <span className="text-pierre-700"> — {c.nouvelle_valeur}</span>
                  {d.description && <div className="text-sm text-pierre-600">{d.description}</div>}
                  <div className="text-xs text-pierre-500">
                    Détecté le {dateCourte(c.detecte_le)} {c.source_url && <>· <LienExterne href={c.source_url}>source</LienExterne></>}
                  </div>
                </div>
                {ecriture && <Boutons decider={(ok) => decider(c, ok)} />}
              </li>
            )
          })}
        </Section>
      )}

      {activites.length > 0 && (
        <Section titre={`Nouvelles activités (${activites.length})`} action={ecriture && activites.length > 1 && (
          <button className="text-sm text-foret-700 underline" onClick={() => toutValider(activites, 'nouvelles activités')}>Tout valider</button>
        )}>
          {activites.map((c) => {
            const d = c.details as { source?: string; preuve?: string | null; photo_chemin?: string | null; photo_url?: string | null }
            const photo = d.photo_chemin ? adresseStockage(d.photo_chemin) : d.photo_url
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
                {photo && (
                  <a href={photo} target="_blank" rel="noreferrer">
                    <img src={photo} alt="" className="size-14 rounded-lg object-cover" loading="lazy" />
                  </a>
                )}
                <div className="min-w-64 flex-1">
                  <Link to={`/vigie/camps/${c.camp_id}`} className="font-medium hover:underline">
                    {nomCamp(c.camp_id)}
                  </Link>
                  <span className="text-pierre-700"> — {c.nouvelle_valeur}</span>
                  {!c.activite_id && (
                    <span className="ml-2 rounded-full bg-foret-50 px-1.5 text-xs text-foret-800">nouvelle activité candidate</span>
                  )}
                  {d.preuve && <div className="text-sm text-pierre-600">{d.preuve}</div>}
                  <div className="text-xs text-pierre-500">
                    {d.source === 'photo' ? 'Vue sur une photo' : d.source === 'reseaux' ? 'Vue sur les réseaux sociaux' : 'Vue sur le site'} ·{' '}
                    {dateCourte(c.detecte_le)} {c.source_url && <>· <LienExterne href={c.source_url}>source</LienExterne></>}
                  </div>
                </div>
                {ecriture && <Boutons decider={(ok) => decider(c, ok)} />}
              </li>
            )
          })}
        </Section>
      )}

      {proposes.length > 0 && (
        <section>
          <h2 className="mb-1 font-semibold">Camps proposés ({proposes.length})</h2>
          <p className="mb-3 text-sm text-pierre-500">
            Tri rapide (passe 1). Un camp inclus est ensuite documenté en profondeur par Claude (passe 2) ; un camp exclu n'est jamais
            reproposé.
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {proposes.map((c) => (
              <CampPropose key={c.id} camp={c} ecriture={ecriture} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function Section({ titre, action, children }: { titre: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={`${ui.carte} p-4`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{titre}</h2>
        {action}
      </div>
      <ul className="divide-y divide-pierre-100">{children}</ul>
    </section>
  )
}

function Boutons({ decider }: { decider: (accepter: boolean) => void }) {
  return (
    <div className="flex shrink-0 gap-2">
      <button className={`${ui.bouton} py-1.5`} onClick={() => decider(true)}>
        Valider
      </button>
      <button className={`${ui.boutonSecondaire} py-1.5`} onClick={() => decider(false)}>
        Rejeter
      </button>
    </div>
  )
}

function CampPropose({ camp, ecriture }: { camp: Camp; ecriture: boolean }) {
  const modifier = useModifier<Camp>('camps')
  const [categorie, setCategorie] = useState<Categorie>(camp.categorie)
  const decider = (statut: 'inclus' | 'exclu') => {
    modifier.mutate({ id: camp.id, statut_inclusion: statut, categorie }, { onSuccess: () => statut === 'inclus' && reveiller() })
  }
  return (
    <article className={`${ui.carte} flex flex-col gap-2 p-4`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link to={`/vigie/camps/${camp.id}`} className="font-medium hover:underline">
            {camp.nom}
          </Link>
          <div className="text-xs text-pierre-500">
            {[camp.ville, camp.region].filter(Boolean).join(', ')}
            {camp.membre_acq ? ' · membre ACQ' : ' · non-membre ACQ'}
          </div>
        </div>
        <PastilleCategorie categorie={camp.categorie} />
      </div>
      {camp.types.length > 0 && <div className="text-xs text-pierre-600">{camp.types.map((t) => TYPES_CAMP[t] ?? t).join(' · ')}</div>}
      {camp.resume && <p className="text-sm">{camp.resume}</p>}
      {camp.pertinence && <p className="text-sm text-pierre-600">{camp.pertinence}</p>}
      <div className="text-sm">
        <LienExterne href={camp.site_web} />
      </div>
      {ecriture && (
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <ChoixCategorie valeur={categorie} changer={setCategorie} />
          <button className={`${ui.bouton} py-1.5`} onClick={() => decider('inclus')}>
            Inclure
          </button>
          <button className={`${ui.boutonSecondaire} py-1.5`} onClick={() => decider('exclu')}>
            Exclure
          </button>
        </div>
      )}
    </article>
  )
}
