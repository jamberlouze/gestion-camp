import { useState, type DragEvent } from 'react'
import { useSearchParams } from 'react-router'
import { messageErreur } from '@/lib/donnees'
import { IconeCorbeille, IconeDossier, IconeModele, IconePlus, IconeRenommer } from '@/lib/icones'
import { SaisieNom } from '@/lib/SaisieNom'
import { ui } from '@/lib/ui'
import { useEnregistrerDossier, useModifierHoraire, useSupprimerDossier, useSupprimerHoraire, type ResumeHoraire } from './donnees'
import { resumeJours } from './logique'
import { dossierDe, grouper, nomsDans, type DemandeNouvel } from './emplacements'
import type { Dossier } from './types'

const SANS = 'sans-dossier'
const MODELES = 'modeles'
const TYPE_GLISSE = 'application/x-horaire-semaine'

const dateCourte = (iso: string) => new Date(iso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Dossiers et modèles : à gauche, les dossiers (et les modèles) ; à droite,
 * ce qu'ils contiennent. On range une semaine en la glissant sur un dossier
 * ou avec son menu « Dossier ».
 */
export function PageDossiers({
  liste,
  dossiers,
  active,
  ecriture,
  ouvrir,
  nouveau,
}: {
  liste: ResumeHoraire[]
  dossiers: Dossier[]
  active: string | null
  ecriture: boolean
  ouvrir: (id: string) => void
  nouveau: (d: DemandeNouvel) => void
}) {
  const modifier = useModifierHoraire()
  const supprimer = useSupprimerHoraire()
  const enregistrerDossier = useEnregistrerDossier()
  const supprimerDossier = useSupprimerDossier()
  const [params, setParams] = useSearchParams()
  const [ajout, setAjout] = useState(false)
  /** Dossier en cours de renommage (id). */
  const [renommage, setRenommage] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [survol, setSurvol] = useState<string | null>(null)
  const surErreur = { onError: (e: unknown) => setMessage(messageErreur(e)) }

  const groupes = grouper(liste, dossiers)
  const sansDossier = groupes.find((g) => g.cle === SANS)!
  // Dossier affiché : celui de l'adresse, sinon celui de la semaine ouverte.
  const actif = liste.find((h) => h.id === active)
  const parDefaut = actif ? (actif.modele ? MODELES : (dossierDe(actif) ?? SANS)) : (dossiers[0]?.id ?? SANS)
  const demande = params.get('dossier')
  const vue = groupes.find((g) => g.cle === demande) ?? groupes.find((g) => g.cle === parDefaut) ?? sansDossier

  const afficher = (cle: string) => {
    setParams({ dossier: cle }, { replace: true })
    setRenommage(null)
    setMessage(null)
  }

  async function creerDossier(nom: string) {
    if (dossiers.some((d) => d.nom === nom)) return `Le dossier « ${nom} » existe déjà.`
    try {
      const id = await enregistrerDossier.mutateAsync({ nom })
      setAjout(false)
      afficher(id)
      return null
    } catch (e) {
      return messageErreur(e)
    }
  }

  async function renommerDossier(d: Dossier, nom: string) {
    if (dossiers.some((x) => x.nom === nom && x.id !== d.id)) return `Le dossier « ${nom} » existe déjà.`
    try {
      await enregistrerDossier.mutateAsync({ id: d.id, nom })
      setRenommage(null)
      return null
    } catch (e) {
      return messageErreur(e)
    }
  }

  function retirerDossier(d: Dossier, contenu: ResumeHoraire[]) {
    const doublons = contenu.filter((h) => sansDossier.horaires.some((x) => x.nom === h.nom)).map((h) => `« ${h.nom} »`)
    if (doublons.length) {
      return setMessage(`« Sans dossier » contient déjà ${doublons.join(', ')} : renommez ou déplacez ces semaines avant de supprimer le dossier.`)
    }
    const texte = contenu.length
      ? `Supprimer le dossier « ${d.nom} » ? Ses ${contenu.length} semaine(s) ne sont pas supprimées : elles passent dans « Sans dossier ».`
      : `Supprimer le dossier « ${d.nom} » ?`
    if (!confirm(texte)) return
    supprimerDossier.mutate(d.id, surErreur)
    afficher(SANS)
  }

  function deplacer(id: string, cible: string | null) {
    const h = liste.find((x) => x.id === id)
    if (!h || h.modele || dossierDe(h) === cible) return
    if (nomsDans(liste, false, cible).includes(h.nom)) {
      return setMessage(`Ce dossier contient déjà une semaine « ${h.nom} » : renommez-la d'abord.`)
    }
    setMessage(null)
    modifier.mutate({ id, dossier_id: cible }, surErreur)
  }

  const retirer = (h: ResumeHoraire) =>
    confirm(`Supprimer ${h.modele ? 'le modèle' : 'la semaine'} « ${h.nom} » ? Cette action est définitive.`) && supprimer.mutate(h.id, surErreur)

  // Glisser une semaine sur un dossier de la colonne de gauche.
  const cible = (cle: string) =>
    ecriture && cle !== MODELES
      ? {
          onDragOver: (e: DragEvent) => {
            if (!e.dataTransfer.types.includes(TYPE_GLISSE)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setSurvol(cle)
          },
          onDragLeave: () => setSurvol((s) => (s === cle ? null : s)),
          onDrop: (e: DragEvent) => {
            e.preventDefault()
            setSurvol(null)
            const id = e.dataTransfer.getData(TYPE_GLISSE)
            if (id) deplacer(id, cle === SANS ? null : cle)
          },
        }
      : {}

  const entree = (cle: string, libelle: string, nombre: number, icone: React.ReactNode) => (
    <li key={cle}>
      <button
        {...cible(cle)}
        aria-current={vue.cle === cle ? 'true' : undefined}
        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${
          survol === cle
            ? 'bg-foret-100 ring-2 ring-foret-600'
            : vue.cle === cle
              ? 'bg-foret-50 font-medium text-foret-800'
              : 'text-pierre-700 hover:bg-pierre-100'
        }`}
        onClick={() => afficher(cle)}
      >
        {icone}
        <span className="min-w-0 flex-1 truncate">{libelle}</span>
        <span className="text-xs tabular-nums text-pierre-500">{nombre}</span>
      </button>
    </li>
  )

  const titre = vue.modeles ? 'Modèles' : vue.titre
  return (
    <div className="grid items-start gap-4 md:grid-cols-[17rem_1fr]">
      {/* Dossiers */}
      <nav aria-label="Dossiers" className={`${ui.carte} p-2`}>
        <div className="flex items-center justify-between px-2.5 pb-1 pt-1.5">
          <h2 className="text-xs font-medium uppercase tracking-wide text-pierre-500">Dossiers</h2>
          {ecriture && !ajout && (
            <button
              aria-label="Nouveau dossier"
              title="Nouveau dossier"
              className="rounded-md p-1 text-pierre-500 hover:bg-pierre-100 hover:text-pierre-900"
              onClick={() => setAjout(true)}
            >
              <IconePlus />
            </button>
          )}
        </div>
        <ul className="space-y-0.5">
          {groupes
            .filter((g) => g.dossier)
            .map((g) => entree(g.cle, g.titre, g.horaires.length, <IconeDossier className="size-4 text-pierre-500" />))}
          {ajout && (
            <li className="px-1 py-1">
              <SaisieNom compact placeholder="Nom (ex. Été 2027)" libelleOk="Créer" valider={creerDossier} annuler={() => setAjout(false)} />
            </li>
          )}
          {entree(SANS, 'Sans dossier', sansDossier.horaires.length, <IconeDossier className="size-4 text-pierre-300" />)}
        </ul>
        <div className="mx-2.5 my-2 border-t border-pierre-100" />
        <ul>{entree(MODELES, 'Modèles', groupes.find((g) => g.modeles)!.horaires.length, <IconeModele className="size-4 text-sky-700" />)}</ul>
      </nav>

      {/* Contenu du dossier */}
      <section className={`${ui.carte} min-w-0 p-5`}>
        <div className="flex flex-wrap items-center gap-3">
          {vue.dossier && renommage === vue.dossier.id ? (
            <div className="min-w-64 flex-1">
              <SaisieNom
                key={vue.dossier.id}
                valeurInitiale={vue.dossier.nom}
                libelleOk="Renommer"
                valider={(nom) => renommerDossier(vue.dossier!, nom)}
                annuler={() => setRenommage(null)}
              />
            </div>
          ) : (
            <h2 className="flex flex-1 items-center gap-2 text-lg font-semibold">
              {vue.modeles ? <IconeModele className="size-5 text-sky-700" /> : <IconeDossier className="size-5 text-pierre-500" />}
              {titre}
            </h2>
          )}
          {ecriture && vue.dossier && renommage !== vue.dossier.id && (
            <>
              <button className={ui.boutonSecondaire} onClick={() => setRenommage(vue.dossier!.id)}>
                <IconeRenommer /> Renommer
              </button>
              <button className={ui.boutonDanger} onClick={() => retirerDossier(vue.dossier!, vue.horaires)}>
                <IconeCorbeille className="mr-1.5 size-4" /> Supprimer le dossier
              </button>
            </>
          )}
          {ecriture && (
            <button
              className={ui.bouton}
              onClick={() => nouveau(vue.modeles ? { modele: true } : { modele: false, dossier: vue.dossier?.id ?? null })}
            >
              <IconePlus /> {vue.modeles ? 'Nouveau modèle' : 'Nouvelle semaine'}
            </button>
          )}
        </div>
        {vue.modeles && (
          <p className="mt-1 text-sm text-pierre-500">
            Points de départ des nouvelles semaines : séjours d'école de 2, 3 ou 4 jours, semaine d'été de 7 jours… Pour en créer un
            à partir d'une semaine existante, utilisez « Créer un modèle » sur cette semaine.
          </p>
        )}
        {message && (
          <p className={`${ui.erreur} mt-3 flex justify-between gap-3`}>
            {message}
            <button className="underline" onClick={() => setMessage(null)}>
              Fermer
            </button>
          </p>
        )}

        {vue.horaires.length === 0 ? (
          <p className="mt-6 rounded-lg border border-dashed border-pierre-300 px-4 py-8 text-center text-sm text-pierre-500">
            {vue.modeles
              ? 'Aucun modèle pour l\'instant.'
              : ecriture
                ? 'Aucune semaine ici. Créez-en une, ou glissez-y des semaines depuis un autre dossier.'
                : 'Aucune semaine ici.'}
          </p>
        ) : (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-pierre-200 text-left text-xs uppercase tracking-wide text-pierre-500">
                <th className="py-2 pr-3 font-medium">Nom</th>
                <th className="py-2 pr-3 font-medium">Jours</th>
                <th className="py-2 pr-3 font-medium">Modifié</th>
                <th className="py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {vue.horaires.map((h) => (
                <tr
                  key={h.id}
                  draggable={ecriture && !h.modele}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(TYPE_GLISSE, h.id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={() => setSurvol(null)}
                  className={`group border-b border-pierre-100 last:border-0 hover:bg-pierre-50 ${ecriture && !h.modele ? 'cursor-grab active:cursor-grabbing' : ''}`}
                >
                  <td className="py-2 pr-3">
                    <button className="text-left font-medium text-pierre-900 hover:text-foret-700 hover:underline" onClick={() => ouvrir(h.id)}>
                      {h.nom}
                    </button>
                    {h.id === active && <span className="ml-2 rounded-full bg-foret-100 px-2 py-0.5 text-xs text-foret-800">ouverte</span>}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-pierre-600">{h.jours ? resumeJours(h.jours) : ''}</td>
                  <td className="whitespace-nowrap py-2 pr-3 text-pierre-500">{dateCourte(h.updated_at)}</td>
                  <td className="py-2">
                    <div className="flex items-center justify-end gap-1">
                      {ecriture && !h.modele && (
                        <>
                          <select
                            aria-label={`Dossier de ${h.nom}`}
                            title="Ranger dans un dossier"
                            className="rounded-md border border-pierre-200 bg-white py-1 pl-2 text-xs text-pierre-700"
                            value={dossierDe(h) ?? ''}
                            onChange={(e) => deplacer(h.id, e.target.value || null)}
                          >
                            <option value="">Sans dossier</option>
                            {dossiers.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.nom}
                              </option>
                            ))}
                          </select>
                          <button
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs text-pierre-600 hover:bg-pierre-100 hover:text-pierre-900"
                            title="Créer un modèle à partir de cette semaine"
                            onClick={() => nouveau({ modele: true, depart: h.id })}
                          >
                            <IconeModele className="size-3.5" /> Créer un modèle
                          </button>
                        </>
                      )}
                      {ecriture && h.modele && (
                        <button
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs text-foret-700 hover:bg-foret-50"
                          onClick={() => nouveau({ modele: false, depart: h.id, dossier: null })}
                        >
                          <IconePlus className="size-3.5" /> Nouvelle semaine
                        </button>
                      )}
                      {ecriture && (
                        <button
                          aria-label={`Supprimer ${h.nom}`}
                          title="Supprimer"
                          className="rounded-md p-1.5 text-pierre-400 hover:bg-red-50 hover:text-red-700"
                          onClick={() => retirer(h)}
                        >
                          <IconeCorbeille />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
