import { useState } from 'react'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { IconePlus } from '@/lib/icones'
import { messageErreur } from '@/lib/donnees'
import { SaisieNom } from '@/lib/SaisieNom'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { Chargement, Section } from './commun'
import { useEcriture, useEnregistrer, usePersonnel, usePersonnelCuisine, useRetirer } from './donnees'
import { META_SECTEUR, SECTEURS_PERSONNEL, type Personne, type SecteurPersonnel } from './types'

/** Les séjours viennent du module Réservations : rien à régler ici. */
export function Reglages() {
  return (
    <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
      <ListePersonnel />
    </div>
  )
}

function ListePersonnel() {
  const ecriture = useEcriture()
  const { peutLire } = useAuth()
  const personnel = usePersonnel()
  // « Aussi à l'horaire de cuisine » : l'équipe de Cuisine, pour qui la lit.
  const cuisine = usePersonnelCuisine(peutLire('commande'))
  const lieesAilleurs = (p: Personne) =>
    new Set((personnel.data ?? []).filter((x) => x.id !== p.id && x.personne_cuisine_id).map((x) => x.personne_cuisine_id))
  const enregistrer = useEnregistrer<Personne>('personnel')
  const retirer = useRetirer('personnel')
  const [ajout, setAjout] = useState(false)
  const [inactifs, setInactifs] = useState(false)

  const liste = (personnel.data ?? []).filter((p) => inactifs || p.actif)
  const nbInactifs = (personnel.data ?? []).filter((p) => !p.actif).length

  async function supprimer(p: Personne) {
    if (!(await confirmer({ titre: `Retirer ${p.nom} de la liste ?`, message: 'Ses journées passées restent dans le calendrier ; celles d\'aujourd\'hui et à venir sont retirées. Pour une personne qui revient plus tard, décochez plutôt « Actif ».' }))) return
    retirer.mutate(p.id)
  }

  return (
    <Section
      titre="Personnel"
      compte={personnel.data?.filter((p) => p.actif).length}
      droite={
        ecriture &&
        !ajout && (
          <button className={`${ui.boutonSecondaire} px-2.5 py-1.5`} onClick={() => setAjout(true)}>
            <IconePlus /> Ajouter
          </button>
        )
      }
    >
      <p className="mb-3 text-sm text-pierre-500">
        Direction et terrain. L'équipe de cuisine se gère dans Cuisine › Équipe et réglages, les animateurs dans Animation : ils apparaissent d'eux-mêmes dans le calendrier.
      </p>
      <p className="mb-3 text-sm text-pierre-500">
        <b className="font-medium text-pierre-700">Courriel</b> : celui du compte de la personne ; « + » de la rangée Direction la choisit d'office.{' '}
        <b className="font-medium text-pierre-700">Aussi à l'horaire de cuisine</b> : une personne de la direction qui travaille en cuisine (ex. Frédérique) se
        saisit seulement ici ; Cuisine › Horaire lit ses journées et elle n'est plus en double dans la rangée Cuisine.
      </p>
      {ajout && (
        <div className="mb-3">
          <SaisieNom
            placeholder="Nom"
            libelleOk="Ajouter"
            compact
            annuler={() => setAjout(false)}
            valider={async (nom) => {
              try {
                await enregistrer.mutateAsync({ nom, ordre: (personnel.data?.length ?? 0) + 1 })
                setAjout(false)
                return null
              } catch (e) {
                return messageErreur(e)
              }
            }}
          />
        </div>
      )}
      {!personnel.data ? (
        <Chargement />
      ) : (
        <ul className="divide-y divide-pierre-100">
          {liste.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
              <ChampTexte
                aria-label="Nom"
                className={`${ui.champ} w-40 flex-1 py-1.5`}
                valeur={p.nom}
                obligatoire
                disabled={!ecriture}
                enregistrer={(nom) => enregistrer.mutate({ id: p.id, nom })}
              />
              <select
                aria-label={`Secteur de ${p.nom}`}
                className={`${ui.champ} w-auto! py-1.5 ${p.secteur_principal ? '' : 'border-amber-400 bg-amber-50'}`}
                value={p.secteur_principal ?? ''}
                disabled={!ecriture}
                onChange={(e) => enregistrer.mutate({ id: p.id, secteur_principal: (e.target.value || null) as SecteurPersonnel | null })}
              >
                <option value="">Secteur à préciser</option>
                {SECTEURS_PERSONNEL.map((s) => (
                  <option key={s} value={s}>
                    {META_SECTEUR[s].libelle}
                  </option>
                ))}
              </select>
              {(p.secteur_principal === 'direction' || p.courriel) && (
                <ChampTexte
                  type="email"
                  aria-label={`Courriel du compte de ${p.nom}`}
                  placeholder="Courriel du compte"
                  className={`${ui.champ} w-56! py-1.5`}
                  valeur={p.courriel ?? ''}
                  disabled={!ecriture}
                  enregistrer={(v) => enregistrer.mutate({ id: p.id, courriel: v.toLowerCase() || null })}
                />
              )}
              {p.secteur_principal === 'direction' && (cuisine.data || p.personne_cuisine_id) && (
                <select
                  aria-label={`Horaire de cuisine de ${p.nom}`}
                  className={`${ui.champ} w-auto! py-1.5`}
                  value={p.personne_cuisine_id ?? ''}
                  disabled={!ecriture || !cuisine.data}
                  onChange={(e) => enregistrer.mutate({ id: p.id, personne_cuisine_id: e.target.value || null })}
                >
                  <option value="">Pas à l'horaire de cuisine</option>
                  {(cuisine.data ?? [])
                    .filter((c) => (c.actif && !lieesAilleurs(p).has(c.id)) || c.id === p.personne_cuisine_id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        Aussi à l'horaire de cuisine : {c.nom}
                      </option>
                    ))}
                  {p.personne_cuisine_id && !cuisine.data && <option value={p.personne_cuisine_id}>Aussi à l'horaire de cuisine</option>}
                </select>
              )}
              <label className="flex items-center gap-1.5 text-sm text-pierre-600">
                <input type="checkbox" className="size-4 accent-foret-700" checked={p.actif} disabled={!ecriture} onChange={(e) => enregistrer.mutate({ id: p.id, actif: e.target.checked })} />
                Actif
              </label>
              {ecriture && (
                <button className={ui.boutonDanger} onClick={() => supprimer(p)}>
                  Retirer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {nbInactifs > 0 && (
        <button className="mt-2 text-sm text-foret-700 underline" onClick={() => setInactifs(!inactifs)}>
          {inactifs ? 'Masquer' : 'Afficher'} les inactifs ({nbInactifs})
        </button>
      )}
    </Section>
  )
}
