import { useState, type FormEvent, type ReactNode } from 'react'
import { messageErreur, useEnregistrer } from '@/lib/donnees'
import { Dialogue } from '@/lib/Dialogue'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import {
  cleAujourdhui,
  dateCourte,
  estAnnuelle,
  exerciceDeCle,
  jourAujourdhui,
  libelleFrequence,
  libelleMois,
  MOIS_EXERCICE,
  NOMS_MOIS_COURTS,
  UNIQUE,
  cleCoche,
} from './calendrier'
import { offertPour, useEcriture, type DemandeFiche } from './outils'
import { useCocher, useCoches, useProfils, useReferences } from './donnees'
import { PRIORITES, type Statut, type Tache } from './types'

type Brouillon = Omit<Tache, 'id' | 'created_at' | 'archivee'> & { id?: string }

const VIDE: Brouillon = {
  titre: '',
  entreprise_id: null,
  projet_id: null,
  responsable_id: null,
  fournisseur_id: null,
  note: null,
  corvee: false,
  mois: [Number(cleAujourdhui().slice(5))],
  intervalle_ans: 1,
  exercice_depart: null,
  jour: null,
  debut: null,
  echeance: null,
  priorite: null,
  heures_prevues: null,
  position: null,
}

export function FicheTache({ demande, fermer }: { demande: DemandeFiche; fermer: () => void }) {
  const ecriture = useEcriture()
  const refs = useReferences()
  const enregistrer = useEnregistrer<Tache>('mastertimeline', 'taches')
  const cocher = useCocher()
  const { session } = useAuth()
  const exerciceCourant = exerciceDeCle(cleAujourdhui())

  const [b, setB] = useState<Brouillon>(() => {
    if (demande.tache) {
      const { created_at: _c, archivee: _a, ...reste } = demande.tache
      return reste
    }
    return { ...VIDE, ...demande.defauts }
  })
  const changer = (champs: Partial<Brouillon>) => setB((x) => ({ ...x, ...champs }))
  const annuelle = estAnnuelle(b)

  // Passage regardé : sa coche et sa note de l'année.
  const periode = demande.tache ? demande.periode : undefined
  const coches = useCoches(periode && periode !== UNIQUE ? exerciceDeCle(periode) : exerciceCourant)
  const profils = useProfils()
  const coche = periode && demande.tache ? coches.index.get(cleCoche(demande.tache.id, periode)) : undefined
  const [statut, setStatut] = useState<Statut | null | undefined>(undefined)
  const [noteAnnee, setNoteAnnee] = useState<string | undefined>(undefined)
  const statutAffiche = statut === undefined ? (coche?.statut ?? null) : statut
  const noteAffichee = noteAnnee === undefined ? (coche?.note ?? '') : noteAnnee

  const [erreur, setErreur] = useState<string | null>(null)

  async function sauver(e: FormEvent) {
    e.preventDefault()
    const titre = b.titre.trim()
    if (!titre) return setErreur('Donne un titre à la tâche.')
    if (annuelle && !b.mois?.length) return setErreur('Choisis au moins un mois.')
    const ligne: Partial<Tache> = {
      ...b,
      titre,
      note: b.note?.trim() || null,
      ...(annuelle
        ? { exercice_depart: b.exercice_depart ?? exerciceCourant, debut: null, echeance: null }
        : { mois: null, intervalle_ans: 1, exercice_depart: null, jour: null }),
    }
    try {
      await enregistrer.mutateAsync(ligne)
      if (periode && demande.tache && (statut !== undefined || noteAnnee !== undefined)) {
        const note = noteAffichee.trim() || null
        const changeStatut = statutAffiche !== (coche?.statut ?? null)
        cocher.mutate({
          tache_id: demande.tache.id,
          periode,
          coche:
            statutAffiche || note
              ? {
                  tache_id: demande.tache.id,
                  periode,
                  statut: statutAffiche,
                  note,
                  fait_le: statutAffiche ? (changeStatut ? jourAujourdhui() : (coche?.fait_le ?? jourAujourdhui())) : null,
                  fait_par: statutAffiche ? (changeStatut ? (session?.user.id ?? null) : (coche?.fait_par ?? null)) : null,
                }
              : null,
        })
      }
      fermer()
    } catch (err) {
      setErreur(messageErreur(err))
    }
  }

  async function supprimer() {
    if (!demande.tache || !confirm(`Supprimer « ${demande.tache.titre} » ? Ses coches des années passées restent dans la base.`)) return
    try {
      await enregistrer.mutateAsync({ id: demande.tache.id, archivee: true })
      fermer()
    } catch (err) {
      setErreur(messageErreur(err))
    }
  }

  const basculerMois = (m: number) => {
    const mois = b.mois ?? []
    changer({ mois: mois.includes(m) ? mois.filter((x) => x !== m) : [...mois, m] })
  }
  const quiAFait = coche?.fait_par ? profils.data?.find((p) => p.id === coche.fait_par) : null

  return (
    <Dialogue titre={demande.tache ? 'Tâche' : 'Nouvelle tâche'} fermer={fermer}>
      <form onSubmit={sauver} className="space-y-4">
        {periode && demande.tache && (
          <fieldset className="rounded-xl bg-pierre-50 p-3">
            <legend className="sr-only">Ce passage</legend>
            <p className="text-sm font-semibold">{periode === UNIQUE ? 'Cette tâche' : `Passage de ${libelleMois(periode)}`}</p>
            <div className="mt-2 inline-flex rounded-lg border border-pierre-300 bg-white p-0.5 text-sm" role="group" aria-label="Statut">
              {(
                [
                  [null, 'À faire'],
                  ['faite', 'Faite'],
                  ['sautee', periode === UNIQUE ? 'Abandonnée' : 'Pas cette année'],
                ] as const
              ).map(([s, nom]) => (
                <button
                  key={nom}
                  type="button"
                  disabled={!ecriture}
                  className={`rounded-md px-2.5 py-1 ${statutAffiche === s ? 'bg-foret-100 font-medium text-foret-800' : 'text-pierre-600 hover:text-pierre-900'}`}
                  onClick={() => setStatut(s)}
                >
                  {nom}
                </button>
              ))}
            </div>
            {coche?.statut && coche.fait_le && statut === undefined && (
              <p className="mt-1.5 text-xs text-pierre-500">
                {coche.statut === 'faite' ? 'Cochée' : 'Marquée'} le {dateCourte(coche.fait_le)}
                {quiAFait ? ` par ${quiAFait.nom ?? quiAFait.courriel}` : ''}
              </p>
            )}
            <label className={`${ui.etiquette} mt-3`} htmlFor="note-annee">
              Note de l'année (ce qui s'est passé)
            </label>
            <textarea
              id="note-annee"
              className={ui.champ}
              rows={2}
              disabled={!ecriture}
              value={noteAffichee}
              onChange={(e) => setNoteAnnee(e.target.value)}
            />
          </fieldset>
        )}

        <div>
          <label className={ui.etiquette} htmlFor="titre">
            Titre
          </label>
          <input id="titre" className={ui.champ} value={b.titre} onChange={(e) => changer({ titre: e.target.value })} disabled={!ecriture} autoFocus={!demande.tache} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Choix
            libelle="Entreprise"
            valeur={b.entreprise_id}
            options={refs.entreprises}
            changer={(v) => {
              // Un projet qui n'est pas offert pour la nouvelle entreprise est retiré.
              const projet = b.projet_id ? refs.projet.get(b.projet_id) : null
              changer({ entreprise_id: v, ...(projet && !offertPour(projet, v) ? { projet_id: null } : {}) })
            }}
            desactive={!ecriture}
          />
          <Choix
            libelle="Projet"
            valeur={b.projet_id}
            options={refs.projets.filter((p) => offertPour(p, b.entreprise_id) || p.id === b.projet_id)}
            changer={(v) => changer({ projet_id: v })}
            desactive={!ecriture}
          />
          <Choix libelle="Responsable" valeur={b.responsable_id} options={refs.responsables.filter((r) => r.actif || r.id === b.responsable_id)} changer={(v) => changer({ responsable_id: v })} desactive={!ecriture} />
          <Choix libelle="Fournisseur" valeur={b.fournisseur_id} options={refs.fournisseurs} changer={(v) => changer({ fournisseur_id: v })} desactive={!ecriture} />
        </div>

        <div>
          <span className={ui.etiquette}>Quand</span>
          <div className="inline-flex rounded-lg border border-pierre-300 bg-white p-0.5 text-sm" role="group">
            <button
              type="button"
              disabled={!ecriture}
              className={`rounded-md px-2.5 py-1 ${annuelle ? 'bg-foret-100 font-medium text-foret-800' : 'text-pierre-600'}`}
              onClick={() => !annuelle && changer({ mois: [Number(cleAujourdhui().slice(5))] })}
            >
              Revient chaque année
            </button>
            <button
              type="button"
              disabled={!ecriture}
              className={`rounded-md px-2.5 py-1 ${!annuelle ? 'bg-foret-100 font-medium text-foret-800' : 'text-pierre-600'}`}
              onClick={() => annuelle && changer({ mois: null })}
            >
              Une seule fois
            </button>
          </div>

          {annuelle ? (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="Mois">
                {MOIS_EXERCICE.map((m) => {
                  const choisi = b.mois?.includes(m)
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={!ecriture}
                      aria-pressed={choisi}
                      className={`rounded-md border px-1 py-1.5 text-xs ${choisi ? 'border-foret-700 bg-foret-700 text-white' : 'border-pierre-300 bg-white text-pierre-700 hover:border-foret-600'}`}
                      onClick={() => basculerMois(m)}
                    >
                      {NOMS_MOIS_COURTS[m - 1]}
                    </button>
                  )
                })}
              </div>
              {!!b.mois?.length && <p className="text-xs text-pierre-500">{libelleFrequence(b)}</p>}
            </div>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Champ libelle="Échéance">
                <input type="date" className={ui.champ} value={b.echeance ?? ''} disabled={!ecriture} onChange={(e) => changer({ echeance: e.target.value || null })} />
              </Champ>
              <Champ libelle="Début prévu">
                <input type="date" className={ui.champ} value={b.debut ?? ''} disabled={!ecriture} onChange={(e) => changer({ debut: e.target.value || null })} />
              </Champ>
              <Champ libelle="Priorité">
                <select className={ui.champ} value={b.priorite ?? ''} disabled={!ecriture} onChange={(e) => changer({ priorite: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">—</option>
                  {Object.entries(PRIORITES).map(([n, nom]) => (
                    <option key={n} value={n}>
                      {n} · {nom}
                    </option>
                  ))}
                </select>
              </Champ>
              <Champ libelle="Heures prévues">
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  className={ui.champ}
                  value={b.heures_prevues ?? ''}
                  disabled={!ecriture}
                  onChange={(e) => changer({ heures_prevues: e.target.value ? Number(e.target.value) : null })}
                />
              </Champ>
            </div>
          )}
        </div>

        <div>
          <label className={ui.etiquette} htmlFor="note">
            Note permanente (comment faire la tâche, chaque année)
          </label>
          <textarea id="note" className={ui.champ} rows={3} value={b.note ?? ''} disabled={!ecriture} onChange={(e) => changer({ note: e.target.value })} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-foret-700" checked={b.corvee} disabled={!ecriture} onChange={(e) => changer({ corvee: e.target.checked })} />
          Se fait pendant une corvée
        </label>

        {erreur && <p className={ui.erreur}>{erreur}</p>}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {ecriture ? (
            <>
              <button type="submit" className={ui.bouton} disabled={enregistrer.isPending}>
                {demande.tache ? 'Enregistrer' : 'Ajouter'}
              </button>
              <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
                Annuler
              </button>
              {demande.tache && (
                <button type="button" className={`${ui.boutonDanger} ml-auto`} onClick={supprimer}>
                  Supprimer la tâche
                </button>
              )}
            </>
          ) : (
            <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
              Fermer
            </button>
          )}
        </div>
      </form>
    </Dialogue>
  )
}

function Champ({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={ui.etiquette}>{libelle}</span>
      {children}
    </label>
  )
}

function Choix({
  libelle,
  valeur,
  options,
  changer,
  desactive,
}: {
  libelle: string
  valeur: string | null
  options: { id: string; nom: string }[]
  changer: (v: string | null) => void
  desactive?: boolean
}) {
  return (
    <Champ libelle={libelle}>
      <select className={ui.champ} value={valeur ?? ''} disabled={desactive} onChange={(e) => changer(e.target.value || null)}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nom}
          </option>
        ))}
      </select>
    </Champ>
  )
}
