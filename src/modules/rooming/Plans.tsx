import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { IconeCorbeille, IconeDupliquer, IconePlus } from '@/lib/icones'
import { SaisieNom } from '@/lib/SaisieNom'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { copierPlan, creerPlan, mettreEnVigueur, modifierPlan, supprimerPlan, useRelire, type Donnees } from './donnees'
import { arbrePlan, type Totaux } from './outils'
import type { Plan } from './types'

/** Les plans (scénarios) : un seul en vigueur ; les vieux peuvent être archivés. */
export function Plans({ d }: { d: Donnees }) {
  const ecriture = useAuth().peutEcrire('rooming')
  const naviguer = useNavigate()
  const relire = useRelire()
  const [creation, setCreation] = useState(false)
  const [copie, setCopie] = useState<string | null>(null)
  const [voirArchives, setVoirArchives] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const totaux = useMemo(
    () =>
      new Map(
        d.plans.map((p) => [
          p.id,
          {
            ...arbrePlan(
              d.structure,
              d.occupations.filter((o) => o.plan_id === p.id),
              [],
            ).totaux,
            noms: d.personnes.filter((x) => x.plan_id === p.id).length,
          },
        ]),
      ),
    [d.plans, d.structure, d.occupations, d.personnes],
  )

  async function faire(f: () => Promise<unknown>): Promise<string | null> {
    setErreur(null)
    try {
      await f()
      await relire()
      return null
    } catch (e) {
      const m = messageErreur(e)
      setErreur(m)
      return m
    }
  }

  const actifs = d.plans.filter((p) => !p.archive).sort((a, b) => Number(b.en_vigueur) - Number(a.en_vigueur) || b.created_at.localeCompare(a.created_at))
  const archives = d.plans.filter((p) => p.archive).sort((a, b) => b.created_at.localeCompare(a.created_at))

  const ligne = (p: Plan) => {
    const t = totaux.get(p.id)!
    return (
      <li key={p.id} className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="flex min-w-48 flex-1 items-center gap-2">
            {ecriture ? (
              <ChampTexte
                aria-label={`Nom du plan ${p.nom}`}
                className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 font-medium hover:border-pierre-300 focus:border-foret-600 focus:outline-none"
                valeur={p.nom}
                obligatoire
                enregistrer={(nom) => faire(() => modifierPlan(p.id, { nom }))}
              />
            ) : (
              <span className="px-2 font-medium">{p.nom}</span>
            )}
            {p.en_vigueur && <span className="shrink-0 rounded-full bg-foret-50 px-2 py-0.5 text-xs font-medium text-foret-800 ring-1 ring-foret-100">En vigueur</span>}
          </div>
          <Resume t={t} />
          <div className="flex items-center gap-1">
            <Link to={`/rooming/plan/${p.id}`} className={`${ui.boutonSecondaire} px-2.5 py-1`}>
              Ouvrir
            </Link>
            {ecriture && (
              <>
                {!p.en_vigueur && (
                  <button className={`${ui.boutonSecondaire} px-2.5 py-1`} onClick={() => faire(() => mettreEnVigueur(p.id))}>
                    Mettre en vigueur
                  </button>
                )}
                <button
                  className="rounded p-1.5 text-pierre-500 hover:bg-pierre-100 hover:text-pierre-800"
                  title="Copier ce plan"
                  aria-label={`Copier ${p.nom}`}
                  onClick={() => setCopie(copie === p.id ? null : p.id)}
                >
                  <IconeDupliquer className="size-4" />
                </button>
                {!p.en_vigueur && (
                  <button className="rounded px-2 py-1 text-sm text-pierre-600 hover:bg-pierre-100" onClick={() => faire(() => modifierPlan(p.id, { archive: !p.archive }))}>
                    {p.archive ? 'Désarchiver' : 'Archiver'}
                  </button>
                )}
                <button
                  className="rounded p-1.5 text-pierre-500 hover:bg-red-50 hover:text-red-700"
                  aria-label={`Supprimer ${p.nom}`}
                  onClick={async () => {
                    const ok = await confirmer({
                      titre: `Supprimer « ${p.nom} » ?`,
                      message: p.en_vigueur
                        ? "C'est le plan en vigueur : aucun plan ne s'ouvrira par défaut tant qu'un autre ne sera pas mis en vigueur."
                        : 'Ses chiffres et ses noms seront effacés. La référence ne change pas.',
                    })
                    if (ok) faire(() => supprimerPlan(p.id))
                  }}
                >
                  <IconeCorbeille className="size-4" />
                </button>
              </>
            )}
          </div>
        </div>
        {copie === p.id && (
          <div className="mt-2 max-w-md">
            <SaisieNom
              compact
              valeurInitiale={`Copie de ${p.nom}`}
              libelleOk="Copier"
              annuler={() => setCopie(null)}
              valider={async (nom) => {
                let id = ''
                const probleme = await faire(async () => {
                  id = await copierPlan(p.id, nom)
                })
                if (!probleme) naviguer(`/rooming/plan/${id}`)
                return probleme
              }}
            />
          </div>
        )}
      </li>
    )
  }

  return (
    <div className="max-w-5xl space-y-4">
      {ecriture && (
        <div className="flex flex-wrap items-start gap-2">
          {creation ? (
            <div className="w-full max-w-md">
              <SaisieNom
                placeholder="Nom du nouveau plan (ex. Classe nature – École X)"
                libelleOk="Créer"
                annuler={() => setCreation(false)}
                valider={async (nom) => {
                  let id = ''
                  const probleme = await faire(async () => {
                    id = await creerPlan(nom)
                  })
                  if (!probleme) naviguer(`/rooming/plan/${id}`)
                  return probleme
                }}
              />
              <p className="mt-1 text-xs text-pierre-500">
                Le plan part de la référence d'aujourd'hui : ses chambres et leurs lits, sans personne. Pour partir d'un plan existant, utilisez plutôt
                « Copier » sur sa ligne.
              </p>
            </div>
          ) : (
            <button className={ui.bouton} onClick={() => setCreation(true)}>
              <IconePlus className="size-4" /> Nouveau plan
            </button>
          )}
        </div>
      )}
      {erreur && <p className={ui.erreur}>{erreur}</p>}

      <section className={ui.carte}>
        <ul className="divide-y divide-pierre-100">{actifs.map(ligne)}</ul>
        {actifs.length === 0 && <p className="px-3 py-6 text-center text-sm text-pierre-500">Aucun plan actif.</p>}
      </section>

      {archives.length > 0 && (
        <section>
          <button className="mb-2 text-sm font-medium text-pierre-600 hover:text-pierre-900" onClick={() => setVoirArchives(!voirArchives)}>
            {voirArchives ? '▾' : '▸'} Archivés ({archives.length})
          </button>
          {voirArchives && (
            <div className={ui.carte}>
              <ul className="divide-y divide-pierre-100">{archives.map(ligne)}</ul>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function Resume({ t }: { t: Totaux & { noms: number } }) {
  return (
    <span className="flex gap-3 text-sm tabular-nums text-pierre-500">
      <span>{t.lits} lits</span>
      <span className="text-sky-700">{t.enfants} enf.</span>
      <span className="text-amber-700">{t.employes} empl.</span>
      {t.noms > 0 && <span>{t.noms} nommés</span>}
    </span>
  )
}
