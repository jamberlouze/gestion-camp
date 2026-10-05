import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { IconeCorbeille } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { Carte, Chargement, PastilleCategorie, TexteLibre } from './commun'
import { argent, dateCourte, rangCategorie } from './outils'
import { adressePhoto, demander, useActivites, useCamps, useEcriture, useLiens, useMaquettes, useModifier, usePhotos, useRequetes } from './donnees'
import { SAISONS, type Activite, type Photo } from './types'

const Maquette3D = lazy(() => import('./Maquette3D').then((m) => ({ default: m.Maquette3D })))
const champ = `${ui.champ} py-1.5`

export function FicheActivite() {
  const { id = '' } = useParams()
  // Une fiche s'ouvre en haut de page (depuis le bas d'une longue liste).
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [id])
  const naviguer = useNavigate()
  const ecriture = useEcriture()
  const activites = useActivites()
  const camps = useCamps()
  const liens = useLiens()
  const photos = usePhotos()
  const maquettes = useMaquettes()
  const requetes = useRequetes()
  const modifier = useModifier<Activite>('activites')
  const modifierPhoto = useModifier<Photo>('photos')
  const [message, setMessage] = useState<string | null>(null)

  const activite = activites.data?.find((a) => a.id === id)
  const offrent = useMemo(() => {
    const ids = new Set((liens.data ?? []).filter((l) => l.activite_id === id).map((l) => l.camp_id))
    return (camps.data ?? [])
      .filter((c) => ids.has(c.id) && c.statut_inclusion !== 'exclu')
      .sort((a, b) => rangCategorie(a) - rangCategorie(b) || a.nom.localeCompare(b.nom, 'fr'))
  }, [liens.data, camps.data, id])
  const nomCamp = useMemo(() => new Map((camps.data ?? []).map((c) => [c.id, c.nom])), [camps.data])

  const erreur = activites.error ?? camps.error ?? liens.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!activites.data || !camps.data || !liens.data) return <Chargement />
  if (!activite) return <p className="text-sm text-pierre-500">Activité introuvable. <Link to="/vigie/activites" className="underline">Retour</Link></p>

  const maj = (valeurs: Partial<Activite>) => modifier.mutate({ id: activite.id, ...valeurs })
  const enCours = (type: 'couts' | 'maquette') =>
    (requetes.data ?? []).some((r) => r.activite_id === id && r.type === type && (r.statut === 'en_attente' || r.statut === 'soumise'))
  const derniereErreur = (type: 'couts' | 'maquette') =>
    (requetes.data ?? []).find((r) => r.activite_id === id && r.type === type && r.statut === 'erreur')?.erreur
  const maquette = maquettes.data?.find((m) => m.activite_id === id)
  const sesPhotos = (photos.data ?? []).filter((p) => p.activite_id === id)

  const demanderClaude = async (type: 'couts' | 'maquette') => {
    try {
      await demander(type, activite.id)
      setMessage(
        type === 'couts'
          ? 'Estimé demandé à Claude. Il arrive en général en quelques minutes (traitement en lot).'
          : 'Maquette demandée à Claude. Elle arrive en général en quelques minutes (traitement en lot).',
      )
    } catch (e) {
      setMessage(messageErreur(e))
    }
  }
  const supprimer = async () => {
    if (
      await confirmer({
        titre: `Supprimer l'activité « ${activite.nom} » ?`,
        message: 'Ses liens avec les camps, ses photos et sa maquette seront aussi supprimés.',
        libelleOk: 'Supprimer',
      })
    ) {
      modifier.mutate({ id: activite.id, supprimer: true })
      naviguer('/vigie/activites')
    }
  }

  return (
    <div className="space-y-4">
      <Link to="/vigie/activites" className="text-sm text-pierre-500 hover:text-pierre-900">
        ← Activités
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        {ecriture ? (
          <ChampTexte className={`${champ} max-w-md text-lg font-semibold`} valeur={activite.nom} obligatoire enregistrer={(nom) => maj({ nom })} />
        ) : (
          <h2 className="text-xl font-semibold">{activite.nom}</h2>
        )}
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" disabled={!ecriture} checked={activite.offert_bpa} onChange={(e) => maj({ offert_bpa: e.target.checked })} />
          Offerte à la BPA
        </label>
        <div className="flex flex-wrap gap-2">
          {SAISONS.map((s) => (
            <label key={s.id} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                disabled={!ecriture}
                checked={activite.saisons.includes(s.id)}
                onChange={(e) => maj({ saisons: e.target.checked ? [...activite.saisons, s.id] : activite.saisons.filter((x) => x !== s.id) })}
              />
              {s.libelle}
            </label>
          ))}
        </div>
        {ecriture && (
          <button className={`${ui.boutonDanger} ml-auto`} onClick={supprimer}>
            <IconeCorbeille /> Supprimer
          </button>
        )}
      </div>
      <TexteLibre valeur={activite.description} desactive={!ecriture} enregistrer={(description) => maj({ description })} placeholder="Description" />
      {message && <p className="rounded-lg bg-foret-50 px-3 py-2 text-sm text-foret-800">{message}</p>}

      <div className="grid gap-4 xl:grid-cols-2">
        <Carte
          titre="Coûts estimés"
          action={
            ecriture && (
              <button className={`${ui.boutonSecondaire} py-1.5`} disabled={enCours('couts')} onClick={() => demanderClaude('couts')}>
                {enCours('couts') ? 'Estimé en préparation…' : activite.couts_estimes_le ? 'Réestimer avec Claude' : 'Estimer avec Claude'}
              </button>
            )
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className={ui.etiquette}>Implantation ($)</span>
              <ChampTexte
                className={champ}
                type="number"
                min={0}
                valeur={activite.cout_implantation == null ? '' : String(activite.cout_implantation)}
                disabled={!ecriture}
                enregistrer={(v) => maj({ cout_implantation: v ? Number(v) : null })}
              />
            </label>
            <label>
              <span className={ui.etiquette}>Opération annuelle ($)</span>
              <ChampTexte
                className={champ}
                type="number"
                min={0}
                valeur={activite.cout_operation_annuel == null ? '' : String(activite.cout_operation_annuel)}
                disabled={!ecriture}
                enregistrer={(v) => maj({ cout_operation_annuel: v ? Number(v) : null })}
              />
            </label>
            <div className="sm:col-span-2">
              <span className={ui.etiquette}>Hypothèses</span>
              <TexteLibre valeur={activite.hypotheses_couts} desactive={!ecriture} enregistrer={(hypotheses_couts) => maj({ hypotheses_couts })} />
            </div>
          </div>
          <p className="mt-2 text-xs text-pierre-500">
            {activite.couts_estimes_le
              ? `Estimé de Claude du ${dateCourte(activite.couts_estimes_le)} : ${argent(activite.cout_implantation)} pour implanter, ${argent(activite.cout_operation_annuel)} par année.`
              : 'Pas encore estimé.'}
            {derniereErreur('couts') && <span className="text-red-700"> Dernière demande en erreur : {derniereErreur('couts')}</span>}
          </p>
        </Carte>

        <Carte titre={`Offerte par ${offrent.length} camp${offrent.length > 1 ? 's' : ''}`}>
          {!offrent.length ? (
            <p className="text-sm text-pierre-500">Aucun camp suivi.</p>
          ) : (
            <ul className="divide-y divide-pierre-100 text-sm">
              {offrent.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>
                    <Link to={`/vigie/camps/${c.id}`} className="hover:underline">
                      {c.nom}
                    </Link>
                    <span className="text-pierre-500"> · {c.region ?? '—'}</span>
                    {c.statut_inclusion === 'propose' && <span className="text-pierre-500"> · proposé</span>}
                  </span>
                  <PastilleCategorie categorie={c.categorie} />
                </li>
              ))}
            </ul>
          )}
        </Carte>
      </div>

      <Carte
        titre="Maquette 3D"
        action={
          ecriture && (
            <button className={`${ui.boutonSecondaire} py-1.5`} disabled={enCours('maquette')} onClick={() => demanderClaude('maquette')}>
              {enCours('maquette') ? 'Maquette en préparation…' : maquette ? 'Refaire la maquette avec Claude' : 'Créer la maquette avec Claude'}
            </button>
          )
        }
      >
        {maquette ? (
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Suspense fallback={<Chargement />}>
              <Maquette3D scene={maquette.scene} />
            </Suspense>
            <div className="text-sm">
              <p className={ui.etiquette}>Implantation possible à la BPA</p>
              <p className="whitespace-pre-line text-pierre-700">{maquette.description}</p>
              <p className="mt-2 text-xs text-pierre-500">
                {maquette.scene.objets.length} objets · faite le {dateCourte(maquette.genere_le)}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-pierre-500">
            Pas encore de maquette. Elle sert à visualiser l'activité et à illustrer une implantation possible à la BPA.
            {derniereErreur('maquette') && <span className="text-red-700"> Dernière demande en erreur : {derniereErreur('maquette')}</span>}
          </p>
        )}
      </Carte>

      <Carte titre={`Photos (${sesPhotos.length})`}>
        {!sesPhotos.length ? (
          <p className="text-sm text-pierre-500">
            Aucune photo. La vérification mensuelle en ajoute quand elle en trouve sur les sites des camps (une par camp, pour comparer les
            interprétations).
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {sesPhotos.map((p) => {
              const src = adressePhoto(p)
              return (
                <figure key={p.id} className="group relative">
                  {src && (
                    <a href={src} target="_blank" rel="noreferrer">
                      <img src={src} alt={p.legende ?? ''} loading="lazy" className="aspect-[4/3] w-full rounded-lg bg-pierre-100 object-cover" />
                    </a>
                  )}
                  <figcaption className="mt-1 text-xs">
                    <Link to={`/vigie/camps/${p.camp_id}`} className="font-medium hover:underline">
                      {nomCamp.get(p.camp_id)}
                    </Link>
                    {p.legende && <span className="text-pierre-500"> — {p.legende}</span>}
                  </figcaption>
                  {ecriture && (
                    <button
                      className="absolute right-1 top-1 hidden rounded bg-white/90 p-1 text-red-700 group-hover:block"
                      aria-label="Retirer la photo"
                      onClick={() => modifierPhoto.mutate({ id: p.id, supprimer: true })}
                    >
                      <IconeCorbeille />
                    </button>
                  )}
                </figure>
              )
            })}
          </div>
        )}
      </Carte>
    </div>
  )
}
