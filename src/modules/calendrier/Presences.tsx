import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ChampTexte } from '@/lib/ChampTexte'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { Chargement, NavDate, PastilleSecteur, Section } from './commun'
import { useDateChoisie } from './outils'
import { ajouterJours, aujourdhui, jourCourt, semaine, titreSemaine } from './dates'
import { useEcriture, useHoraireCuisine, usePersonnel, usePresence, usePresencesSimples } from './donnees'
import { META_SECTEUR, type Personne, type PresenceSimple } from './types'

type SecteurSimple = 'direction' | 'terrain'

/** Semaine de présences : direction et terrain à cocher (+ note), cuisine en lecture. */
export function Presences() {
  const [date, choisir] = useDateChoisie()
  const jours = useMemo(() => semaine(date), [date])
  const debut = jours[0]
  const fin = jours[6]
  const personnel = usePersonnel()
  const presences = usePresencesSimples(debut, fin)
  const sansSecteur = (personnel.data ?? []).filter((p) => p.actif && !p.secteur_principal)

  const erreur = personnel.error ?? presences.error
  return (
    <div className="space-y-4">
      <NavDate titre={titreSemaine(date)} date={date} choisir={choisir} precedent={ajouterJours(date, -7)} suivant={ajouterJours(date, 7)} />
      {erreur && <p className={ui.erreur}>{messageErreur(erreur)}</p>}
      {sansSecteur.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {sansSecteur.map((p) => p.nom).join(', ')} : secteur à préciser dans{' '}
          <Link to="/calendrier/reglages" className="underline">
            Réglages
          </Link>{' '}
          pour apparaître ici (ou ajoutez-les à une semaine avec « Ajouter quelqu'un »).
        </p>
      )}
      {!personnel.data || !presences.data ? (
        <Chargement />
      ) : (
        <>
          <GrilleSimple secteur="direction" jours={jours} personnel={personnel.data} presences={presences.data} />
          <GrilleSimple secteur="terrain" jours={jours} personnel={personnel.data} presences={presences.data} />
        </>
      )}
      <Cuisine jours={jours} />
      <p className="text-sm text-pierre-500">
        L'animation vient du module{' '}
        <Link to="/horaire" className="text-foret-700 underline">
          Animation
        </Link>{' '}
        (onglet{' '}
        <Link to={`/calendrier/animation?date=${date}`} className="text-foret-700 underline">
          Animation
        </Link>{' '}
        pour la voir jour par jour).
      </p>
    </div>
  )
}

function GrilleSimple({ secteur, jours, personnel, presences }: { secteur: SecteurSimple; jours: string[]; personnel: Personne[]; presences: PresenceSimple[] }) {
  const ecriture = useEcriture()
  const cocher = usePresence(jours[0], jours[6])
  const [ajoutes, setAjoutes] = useState<string[]>([])
  const auj = aujourdhui()

  const duSecteur = presences.filter((p) => p.secteur === secteur)
  const index = new Map(duSecteur.map((p) => [`${p.personnel_id}|${p.date}`, p]))
  // Personnes du secteur (actives), plus celles qui ont une présence cette semaine ou ajoutées à la main.
  const lignes = personnel.filter(
    (p) => (p.actif && p.secteur_principal === secteur) || duSecteur.some((x) => x.personnel_id === p.id) || ajoutes.includes(p.id),
  )
  const autres = personnel.filter((p) => p.actif && !lignes.includes(p))

  return (
    <Section
      titre={META_SECTEUR[secteur].libelle}
      droite={
        ecriture &&
        autres.length > 0 && (
          <select
            aria-label="Ajouter quelqu'un à cette semaine"
            className={`${ui.champ} w-auto! py-1.5`}
            value=""
            onChange={(e) => e.target.value && setAjoutes([...ajoutes, e.target.value])}
          >
            <option value="">Ajouter quelqu'un…</option>
            {autres.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
        )
      }
    >
      {!lignes.length ? (
        <p className="text-sm text-pierre-500">Personne dans ce secteur. Ajoutez du personnel dans Réglages.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[48rem] table-fixed border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-32 pb-2 text-left font-medium text-pierre-500">
                  <span className="flex items-center gap-2">
                    <PastilleSecteur secteur={secteur} /> Nom
                  </span>
                </th>
                {jours.map((j) => (
                  <th key={j} className={`pb-2 text-left font-medium first-letter:uppercase ${j === auj ? 'text-foret-700' : 'text-pierre-500'}`}>
                    {jourCourt(j)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map((p) => (
                <tr key={p.id} className="border-t border-pierre-100 align-top">
                  <td className="py-1.5 pr-2 font-medium">
                    {p.nom}
                    {!p.actif && <span className="ml-1 text-xs font-normal text-pierre-500">(inactif)</span>}
                  </td>
                  {jours.map((j) => {
                    const presence = index.get(`${p.id}|${j}`)
                    return (
                      <td key={j} className="py-1.5 pr-1.5">
                        <div className={`rounded-md border p-1 ${presence ? 'border-foret-600/40 bg-foret-50' : 'border-pierre-200'}`}>
                          <label className="flex items-center gap-1.5 text-xs text-pierre-600">
                            <input
                              type="checkbox"
                              aria-label={`${p.nom} présent ${jourCourt(j)}`}
                              className="size-4 accent-foret-700"
                              checked={!!presence}
                              disabled={!ecriture}
                              onChange={(e) => cocher.mutate({ personnel_id: p.id, date: j, secteur, present: e.target.checked })}
                            />
                            {presence ? 'Présent' : ''}
                          </label>
                          {presence &&
                            (ecriture ? (
                              <ChampTexte
                                aria-label={`Note pour ${p.nom}, ${jourCourt(j)}`}
                                className="mt-1 w-full rounded border border-transparent bg-white/70 px-1 py-0.5 text-xs focus:border-foret-600 focus:outline-none"
                                placeholder="Note…"
                                valeur={presence.description ?? ''}
                                enregistrer={(v) => cocher.mutate({ personnel_id: p.id, date: j, secteur, present: true, description: v || null })}
                              />
                            ) : (
                              presence.description && <p className="mt-1 text-xs">{presence.description}</p>
                            ))}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

/** Horaire du module Cuisine, tel quel (pas de deuxième horaire de cuisine). */
function Cuisine({ jours }: { jours: string[] }) {
  const { peutLire } = useAuth()
  const horaire = useHoraireCuisine(jours[0], jours[6])
  if (!peutLire('commande')) return null
  const donnees = horaire.data
  const fonctions = new Map((donnees?.fonctions ?? []).map((f) => [f.id, f]))
  const index = new Map((donnees?.quarts ?? []).map((q) => [`${q.personne_id}|${q.jour}`, q.texte]))
  const lignes = (donnees?.personnes ?? []).filter((p) => (donnees?.quarts ?? []).some((q) => q.personne_id === p.id))
  const auj = aujourdhui()

  return (
    <Section
      titre={META_SECTEUR.cuisine.libelle}
      droite={
        <Link to="/cuisine/horaire" className="text-sm text-foret-700 underline">
          Modifier dans Cuisine
        </Link>
      }
    >
      {horaire.error ? (
        <p className={ui.erreur}>{messageErreur(horaire.error)}</p>
      ) : !donnees ? (
        <Chargement />
      ) : !lignes.length ? (
        <p className="text-sm text-pierre-500">Aucun quart cette semaine dans l'horaire de la cuisine.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[48rem] table-fixed border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-32 pb-2 text-left font-medium text-pierre-500">
                  <span className="flex items-center gap-2">
                    <PastilleSecteur secteur="cuisine" /> Nom
                  </span>
                </th>
                {jours.map((j) => (
                  <th key={j} className={`pb-2 text-left font-medium first-letter:uppercase ${j === auj ? 'text-foret-700' : 'text-pierre-500'}`}>
                    {jourCourt(j)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map((p) => {
                const f = p.fonction_id ? fonctions.get(p.fonction_id) : undefined
                return (
                  <tr key={p.id} className="border-t border-pierre-100">
                    <td className="py-1.5 pr-2">
                      <span className="font-medium">{p.nom}</span>
                      {f && (
                        <span className="ml-1.5 rounded px-1.5 py-0.5 text-xs" style={{ backgroundColor: f.couleur }}>
                          {f.nom}
                        </span>
                      )}
                    </td>
                    {jours.map((j) => (
                      <td key={j} className="py-1.5 pr-1.5 text-xs text-pierre-700">
                        {index.get(`${p.id}|${j}`) ?? ''}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}
