import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { reduireImage } from '@/lib/photos'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { Annualiser } from './Annualiser'
import { GaleriePhotos } from './Photos'
import { CaseTache, Puce } from './commun'
import {
  useAjouterCommentaire,
  useAjouterPhoto,
  useMajTache,
  useSupprimerCommentaire,
  useSupprimerPhoto,
  useSupprimerTache,
  type Donnees,
  type VariablesMaj,
} from './donnees'
import { dateCourte, enRetard, useDroits } from './outils'
import { PRIORITES, type Photo, type Priorite, type Tache } from './types'

/** Fiche d'une tâche : chaque changement est enregistré tout de suite (hors ligne aussi). */
export function Fiche({ id, d, fermer }: { id: string; d: Donnees; fermer: () => void }) {
  const t = d.tache.get(id)
  const [annualiser, setAnnualiser] = useState(false)
  if (!t) {
    return (
      <Dialogue titre="Tâche" fermer={fermer}>
        <p className="text-sm text-pierre-500">Cette tâche n'existe plus (rejetée ou retirée).</p>
        <button className={`${ui.boutonSecondaire} mt-4`} onClick={fermer}>
          Fermer
        </button>
      </Dialogue>
    )
  }
  if (annualiser) return <Annualiser tache={t} retour={() => setAnnualiser(false)} fermer={fermer} />
  return (
    <Dialogue titre={t.statut === 'a_trier' ? 'Signalement' : 'Tâche'} fermer={fermer}>
      <Contenu t={t} d={d} fermer={fermer} annualiser={() => setAnnualiser(true)} />
    </Dialogue>
  )
}

function Contenu({ t, d, fermer, annualiser }: { t: Tache; d: Donnees; fermer: () => void; annualiser: () => void }) {
  const droits = useDroits()
  const { peutLire } = useAuth()
  const maj = useMajTache()
  const supprimer = useSupprimerTache()
  const modifier = (champs: VariablesMaj['champs']) => maj.mutate({ id: t.id, champs })
  const base = droits.modifierBase(t)
  const trieur = droits.trieur
  const nom = (id: string | null) => (id ? (d.personne.get(id)?.nom ?? 'Ancien compte') : null)
  const signalePar = nom(t.signale_par)
  const assigne = nom(t.assigne_a)
  const fournisseur = t.fournisseur_id ? d.fournisseur.get(t.fournisseur_id) : null
  const chantier = t.chantier_id ? d.chantier.get(t.chantier_id) : null
  const photos = d.photos.get(t.id) ?? []

  async function retirer() {
    const rejet = t.signale_par !== droits.moi
    const ok = await confirmer({
      titre: rejet ? `Rejeter « ${t.titre} » ?` : `Retirer « ${t.titre} » ?`,
      message: 'La tâche, ses photos et ses commentaires seront effacés.',
      libelleOk: rejet ? 'Rejeter' : 'Retirer',
      danger: true,
    })
    if (!ok) return
    supprimer.mutate({ id: t.id, chemins: photos.map((p) => p.chemin) })
    fermer()
  }

  return (
    <div className="space-y-4">
      {/* État */}
      {t.statut === 'a_trier' ? (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <p>
            Signalée{signalePar ? ` par ${signalePar}` : ''} le {dateCourte(t.created_at)} — pas encore triée par la direction.
          </p>
          {trieur && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button className={ui.bouton} onClick={() => modifier({ statut: 'a_faire' })}>
                Accepter (à faire)
              </button>
              <button className={ui.boutonSecondaire} onClick={retirer}>
                Rejeter
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-pierre-50 p-3">
          <CaseTache tache={t} />
          <div className="min-w-0 flex-1 text-sm">
            {t.statut === 'terminee' ? (
              t.annualisee_vers ? (
                <p>
                  Envoyée dans Mastertimeline (tâche annuelle)
                  {t.fait_le ? ` le ${dateCourte(t.fait_le)}` : ''}.{' '}
                  {peutLire('mastertimeline') && (
                    <Link className="text-foret-700 underline" to="/mastertimeline/annee">
                      Voir l'année
                    </Link>
                  )}
                </p>
              ) : (
                <p>
                  Faite{t.fait_le ? ` le ${dateCourte(t.fait_le)}` : ''}
                  {t.fait_par ? ` par ${nom(t.fait_par)}` : ''}
                </p>
              )
            ) : (
              <p>
                À faire · {assigne ? <strong>{assigne}</strong> : <span className="text-pierre-500">à assigner</span>}
                {enRetard(t) && <span className="text-red-700"> · en retard</span>}
              </p>
            )}
          </div>
          {droits.prendre(t) && (
            <button className={ui.boutonSecondaire} onClick={() => modifier({ assigne_a: droits.moi })}>
              Je m'en occupe
            </button>
          )}
          {droits.laisser(t) && (
            <button className={ui.boutonSecondaire} onClick={() => modifier({ assigne_a: null })}>
              Laisser la tâche
            </button>
          )}
        </div>
      )}

      {/* Quoi, où */}
      {base ? (
        <Champ libelle="Quoi ?">
          <ChampTexte className={ui.champ} valeur={t.titre} obligatoire enregistrer={(titre) => modifier({ titre })} />
        </Champ>
      ) : (
        <h3 className="text-base font-semibold">{t.titre}</h3>
      )}
      {base ? (
        <Champ libelle="Détails">
          <ZoneTexte valeur={t.description ?? ''} enregistrer={(v) => modifier({ description: v || null })} />
        </Champ>
      ) : (
        t.description && <p className="whitespace-pre-line text-sm text-pierre-700">{t.description}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Choix libelle="Lieu" valeur={t.lieu_id} options={d.lieux} modifiable={base} changer={(v) => modifier({ lieu_id: v })} />
        <Choix libelle="Catégorie" valeur={t.categorie_id} options={d.categories} modifiable={base} changer={(v) => modifier({ categorie_id: v })} />
      </div>

      {/* Tri : la direction modifie, les autres lisent */}
      {trieur ? (
        <fieldset className="grid gap-3 rounded-xl border border-pierre-200 p-3 sm:grid-cols-2">
          <legend className="px-1 text-xs font-medium text-pierre-500">Tri (direction)</legend>
          <Choix
            libelle="Assignée à"
            valeur={t.assigne_a}
            vide="À assigner"
            options={d.personnes.filter((p) => p.peut_assigner || p.id === t.assigne_a)}
            modifiable
            changer={(v) => modifier({ assigne_a: v })}
          />
          <Champ libelle="Priorité">
            <select className={ui.champ} value={t.priorite} onChange={(e) => modifier({ priorite: Number(e.target.value) as Priorite })}>
              {Object.entries(PRIORITES).map(([n, libelle]) => (
                <option key={n} value={n}>
                  {libelle}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Échéance">
            <input type="date" className={ui.champ} value={t.echeance ?? ''} onChange={(e) => modifier({ echeance: e.target.value || null })} />
          </Champ>
          <Champ libelle="Heures prévues">
            <input
              type="number"
              min={0}
              step={0.5}
              className={ui.champ}
              defaultValue={t.heures_prevues ?? ''}
              onBlur={(e) => {
                const h = e.target.value === '' ? null : Number(e.target.value)
                if (h !== t.heures_prevues) modifier({ heures_prevues: h })
              }}
            />
          </Champ>
          <Choix
            libelle="Chantier"
            valeur={t.chantier_id}
            vide="Aucun"
            options={d.chantiers.filter((c) => !c.termine_le || c.id === t.chantier_id)}
            modifiable
            changer={(v) => modifier({ chantier_id: v })}
          />
          <Choix libelle="Fournisseur" valeur={t.fournisseur_id} options={d.fournisseurs} modifiable changer={(v) => modifier({ fournisseur_id: v })} />
        </fieldset>
      ) : (
        (t.priorite !== 3 || t.echeance || chantier || fournisseur || t.heures_prevues) && (
          <div className="flex flex-wrap gap-1.5">
            {t.priorite === 1 && <Puce ton="urgent">Urgent</Puce>}
            {t.priorite === 2 && <Puce ton="prioritaire">{PRIORITES[2]}</Puce>}
            {t.echeance && <Puce ton={enRetard(t) ? 'retard' : undefined}>Échéance {dateCourte(t.echeance)}</Puce>}
            {chantier && <Puce couleur={chantier.couleur}>{chantier.nom}</Puce>}
            {t.heures_prevues != null && <Puce>{t.heures_prevues} h prévues</Puce>}
            {fournisseur && (
              <Puce>
                {fournisseur.nom}
                {fournisseur.telephone ? ` · ${fournisseur.telephone}` : ''}
              </Puce>
            )}
          </div>
        )
      )}

      <Photos tache={t} photos={photos} />
      <Commentaires tache={t} d={d} />

      <p className="text-xs text-pierre-500">
        {t.statut !== 'a_trier' && `Signalée${signalePar ? ` par ${signalePar}` : ''} le ${dateCourte(t.created_at)}.`}
      </p>

      <div className="flex flex-wrap items-center gap-2 border-t border-pierre-100 pt-3">
        <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
          Fermer
        </button>
        {droits.annualiser && !t.annualisee_vers && t.statut !== 'a_trier' && (
          <button type="button" className={ui.boutonSecondaire} onClick={annualiser} title="En faire une tâche qui revient chaque année">
            ↻ Envoyer vers Mastertimeline
          </button>
        )}
        {droits.supprimer(t) && t.statut !== 'a_trier' && (
          <button type="button" className={`${ui.boutonDanger} ml-auto`} onClick={retirer}>
            Supprimer
          </button>
        )}
        {droits.supprimer(t) && t.statut === 'a_trier' && !trieur && (
          <button type="button" className={`${ui.boutonDanger} ml-auto`} onClick={retirer}>
            Retirer mon signalement
          </button>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------- photos ---

function Photos({ tache: t, photos }: { tache: Tache; photos: Photo[] }) {
  const droits = useDroits()
  const ajouter = useAjouterPhoto()
  const supprimer = useSupprimerPhoto()
  const [lecture, setLecture] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function choisir(fichiers: FileList | null) {
    if (!fichiers?.length) return
    setLecture(true)
    setErreur(null)
    try {
      for (const f of fichiers) await ajouter(t.id, await reduireImage(f), droits.moi)
    } catch {
      setErreur("Une photo n'a pas pu être lue.")
    } finally {
      setLecture(false)
    }
  }

  if (!photos.length && !droits.ecriture) return null
  return (
    <div>
      <span className={ui.etiquette}>Photos</span>
      <GaleriePhotos
        photos={photos}
        retirer={(p) =>
          droits.trieur || (droits.ecriture && p.ajoutee_par === droits.moi)
            ? async () => {
                if (await confirmer({ titre: 'Retirer cette photo ?', libelleOk: 'Retirer', danger: true })) supprimer.mutate({ id: p.id, chemin: p.chemin })
              }
            : undefined
        }
      >
        {droits.ecriture && (
          <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-pierre-300 text-xs text-pierre-500 hover:border-foret-600 hover:text-foret-700">
            <span className="text-xl">📷</span>
            {lecture ? '…' : 'Ajouter'}
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => choisir(e.target.files)} />
          </label>
        )}
      </GaleriePhotos>
      {erreur && <p className="mt-1 text-xs text-red-700">{erreur}</p>}
    </div>
  )
}

// -------------------------------------------------------- commentaires ---

function Commentaires({ tache: t, d }: { tache: Tache; d: Donnees }) {
  const droits = useDroits()
  const ajouter = useAjouterCommentaire()
  const supprimer = useSupprimerCommentaire()
  const [texte, setTexte] = useState('')
  const liste = d.commentaires.get(t.id) ?? []

  const envoyer = () => {
    if (!texte.trim()) return
    ajouter.mutate({ id: crypto.randomUUID(), tache_id: t.id, texte: texte.trim(), auteur: droits.moi })
    setTexte('')
  }

  if (!liste.length && !droits.ecriture) return null
  return (
    <div>
      <span className={ui.etiquette}>Commentaires</span>
      {liste.length > 0 && (
        <ul className="mb-2 space-y-2">
          {liste.map((c) => (
            <li key={c.id} className="rounded-lg bg-pierre-50 px-3 py-2 text-sm">
              <div className="flex items-baseline gap-2 text-xs text-pierre-500">
                <span className="font-medium text-pierre-700">{c.auteur ? (d.personne.get(c.auteur)?.nom ?? 'Ancien compte') : '—'}</span>
                <span>{dateCourte(c.created_at)}</span>
                {(droits.trieur || (droits.ecriture && c.auteur === droits.moi)) && (
                  <button type="button" className="ml-auto hover:text-red-700" aria-label="Retirer le commentaire" onClick={() => supprimer.mutate(c.id)}>
                    ✕
                  </button>
                )}
              </div>
              <p className="mt-0.5 whitespace-pre-line">{c.texte}</p>
            </li>
          ))}
        </ul>
      )}
      {droits.ecriture && (
        <div className="flex items-end gap-2">
          <textarea
            className={ui.champ}
            rows={1}
            placeholder="Ajouter un commentaire…"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) envoyer()
            }}
          />
          <button type="button" className={ui.bouton} disabled={!texte.trim()} onClick={envoyer}>
            Envoyer
          </button>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------- champs ---

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
  modifiable,
  vide = '—',
}: {
  libelle: string
  valeur: string | null
  options: { id: string; nom: string }[]
  changer: (v: string | null) => void
  modifiable: boolean
  vide?: string
}) {
  if (!modifiable) {
    const choisi = options.find((o) => o.id === valeur)
    return (
      <div>
        <span className={ui.etiquette}>{libelle}</span>
        <p className="text-sm">{choisi?.nom ?? '—'}</p>
      </div>
    )
  }
  return (
    <Champ libelle={libelle}>
      <select className={ui.champ} value={valeur ?? ''} onChange={(e) => changer(e.target.value || null)}>
        <option value="">{vide}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nom}
          </option>
        ))}
      </select>
    </Champ>
  )
}

/** Zone de texte enregistrée à la sortie, seulement si elle a changé. */
function ZoneTexte({ valeur, enregistrer }: { valeur: string; enregistrer: (v: string) => void }) {
  const [texte, setTexte] = useState(valeur)
  const [base, setBase] = useState(valeur)
  if (valeur !== base) {
    setBase(valeur)
    setTexte(valeur)
  }
  return (
    <textarea
      className={ui.champ}
      rows={3}
      value={texte}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={() => texte.trim() !== valeur && enregistrer(texte.trim())}
    />
  )
}
