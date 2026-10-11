import { useState } from 'react'
import { BoutonSupprimer } from '@/lib/BoutonsAction'
import { ChampTexte } from '@/lib/ChampTexte'
import { Compteur } from '@/lib/Compteur'
import { useEnregistrementDiffere } from '@/lib/useEnregistrementDiffere'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { IconeCorbeille, IconePlus } from '@/lib/icones'
import { SaisieNom } from '@/lib/SaisieNom'
import { ui } from '@/lib/ui'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useAuth } from '@/shell/auth'
import { useCreerEquipement, useEquipement, useMajEquipement, useSupprimerEquipement } from './donnees'
import { ENTREPRISES, TYPES_EQUIPEMENT, type Entreprise, type Equipement, type TypeEquipement } from './types'

const TITRES: Record<TypeEquipement, string> = { VFI: 'VFI', Rame: 'Rames', Pagaie: 'Pagaies' }

/**
 * Onglet Équipement : VFI, rames et pagaies, comptés par taille ou par
 * sorte (venus de l'inventaire général, choix de Maxime du 2026-10-11).
 * Nombres à jour, sans comptage annuel ; marche sans réseau.
 */
export function EquipementNautique() {
  const ecriture = useAuth().peutEcrire('embarcations')
  const equipement = useEquipement()
  if (!equipement.data) {
    return equipement.error ? (
      <p className={ui.erreur}>{messageErreur(equipement.error)}</p>
    ) : (
      <p className="py-8 text-center text-sm text-pierre-500">Chargement de l'équipement…</p>
    )
  }
  return (
    <div className="space-y-4">
      {TYPES_EQUIPEMENT.map((t) => (
        <Groupe key={t} type={t} lignes={equipement.data.filter((e) => e.type === t)} tout={equipement.data} ecriture={ecriture} />
      ))}
    </div>
  )
}

function Groupe({ type, lignes, tout, ecriture }: { type: TypeEquipement; lignes: Equipement[]; tout: Equipement[]; ecriture: boolean }) {
  const grandEcran = useMediaQuery('(min-width: 768px)')
  const creer = useCreerEquipement()
  const [ajout, setAjout] = useState(false)
  const bons = lignes.reduce((s, e) => s + e.bon, 0)
  const aReparer = lignes.reduce((s, e) => s + e.a_reparer, 0)

  return (
    <section className={ui.carte}>
      <div className="flex flex-wrap items-baseline gap-x-3 border-b border-pierre-100 px-3 py-2">
        <h2 className="font-semibold">{TITRES[type]}</h2>
        <span className="text-sm text-pierre-500">
          {bons} en bon état
          {aReparer > 0 && <span className="text-red-700"> · {aReparer} à réparer</span>}
        </span>
      </div>
      {lignes.length === 0 ? (
        <p className="px-3 py-3 text-sm text-pierre-500">Rien pour l'instant.</p>
      ) : grandEcran ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-pierre-500">
              <tr>
                <th className="min-w-44 px-3 py-1.5 font-medium">Taille ou sorte</th>
                <th className="px-3 py-1.5 font-medium">Entreprise</th>
                <th className="px-3 py-1.5 font-medium">En bon état</th>
                <th className="px-3 py-1.5 font-medium">À réparer</th>
                <th className="px-3 py-1.5 text-right font-medium">Total</th>
                <th className="min-w-40 px-3 py-1.5 font-medium">Notes</th>
                {ecriture && <th />}
              </tr>
            </thead>
            <tbody className="divide-y divide-pierre-100">
              {lignes.map((e) => (
                <Rangee key={e.id} e={e} ecriture={ecriture} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="divide-y divide-pierre-100">
          {lignes.map((e) => (
            <Carte key={e.id} e={e} ecriture={ecriture} />
          ))}
        </ul>
      )}
      {ecriture && (
        <div className="border-t border-pierre-100 px-3 py-2">
          {ajout ? (
            <SaisieNom
              compact
              placeholder={type === 'VFI' ? 'Taille (ex. Adulte - Large)' : 'Taille ou sorte'}
              libelleOk="Ajouter"
              annuler={() => setAjout(false)}
              valider={(variante) => {
                const ordre = Math.max(0, ...tout.map((x) => x.ordre)) + 1
                creer.mutate({ id: crypto.randomUUID(), type, variante, ordre })
                setAjout(false)
                return null
              }}
            />
          ) : (
            <button className="inline-flex items-center gap-1 text-sm font-medium text-foret-700 hover:underline" onClick={() => setAjout(true)}>
              <IconePlus className="size-4" /> {type === 'VFI' ? 'Ajouter une taille' : 'Ajouter une taille ou une sorte'}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function Rangee({ e, ecriture }: { e: Equipement; ecriture: boolean }) {
  const maj = useMajEquipement()
  return (
    <tr className="hover:bg-pierre-50">
      <td className="px-3 py-1.5">
        {ecriture ? (
          <ChampTexte
            aria-label="Taille ou sorte"
            obligatoire
            className="w-full rounded-md border border-transparent px-1.5 py-1 font-medium hover:border-pierre-300 focus:border-foret-600 focus:outline-none"
            valeur={e.variante}
            enregistrer={(variante) => maj.mutate({ id: e.id, champs: { variante } })}
          />
        ) : (
          <span className="font-medium">{e.variante}</span>
        )}
      </td>
      <td className="px-3 py-1.5">
        <ChoixEntreprise e={e} ecriture={ecriture} />
      </td>
      <td className="px-3 py-1.5">
        <Nombre e={e} champ="bon" ecriture={ecriture} />
      </td>
      <td className="px-3 py-1.5">
        <Nombre e={e} champ="a_reparer" ecriture={ecriture} />
      </td>
      <td className="px-3 py-1.5 text-right font-medium tabular-nums">{e.bon + e.a_reparer}</td>
      <td className="px-3 py-1.5">
        <Notes e={e} ecriture={ecriture} />
      </td>
      {ecriture && (
        <td className="px-2 py-1.5 text-right">
          <BoutonRetirer e={e} />
        </td>
      )}
    </tr>
  )
}

function Carte({ e, ecriture }: { e: Equipement; ecriture: boolean }) {
  const [details, setDetails] = useState(false)
  return (
    <li className="px-3 py-2.5">
      <button className="flex w-full items-baseline justify-between gap-2 text-left" onClick={() => setDetails(!details)} aria-expanded={details}>
        <span className="font-medium">{e.variante}</span>
        <span className="text-xs text-pierre-500">
          {e.entreprise_utilisation ?? ''} {details ? '▲' : '▼'}
        </span>
      </button>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div>
          <span className="mb-1 block text-xs text-pierre-500">En bon état</span>
          <Nombre e={e} champ="bon" ecriture={ecriture} grand />
        </div>
        <div>
          <span className="mb-1 block text-xs text-pierre-500">À réparer</span>
          <Nombre e={e} champ="a_reparer" ecriture={ecriture} grand />
        </div>
      </div>
      {e.notes && !details && <p className="mt-1.5 truncate text-sm text-pierre-600">{e.notes}</p>}
      {details && (
        <div className="mt-3 space-y-2 rounded-lg bg-pierre-50 p-2.5">
          <div>
            <span className={ui.etiquette}>Entreprise</span>
            <ChoixEntreprise e={e} ecriture={ecriture} />
          </div>
          <div>
            <span className={ui.etiquette}>Notes</span>
            <Notes e={e} ecriture={ecriture} />
          </div>
          {ecriture && (
            <div className="text-right">
              <BoutonRetirer e={e} avecTexte />
            </div>
          )}
        </div>
      )}
    </li>
  )
}

/** Bons ou à réparer : affichés tout de suite, envoyés après une courte pause (une seule modification pour plusieurs touches). */
function Nombre({ e, champ, ecriture, grand }: { e: Equipement; champ: 'bon' | 'a_reparer'; ecriture: boolean; grand?: boolean }) {
  const maj = useMajEquipement()
  const [valeur, changer] = useEnregistrementDiffere(e[champ], (n) => maj.mutate({ id: e.id, champs: { [champ]: n } }))
  if (!ecriture) return <span className={`tabular-nums ${champ === 'a_reparer' && valeur ? 'text-red-700' : ''}`}>{valeur}</span>
  return <Compteur valeur={valeur} changer={changer} libelle={`${champ === 'bon' ? 'En bon état' : 'À réparer'} : ${e.variante}`} grand={grand} />
}

function ChoixEntreprise({ e, ecriture }: { e: Equipement; ecriture: boolean }) {
  const maj = useMajEquipement()
  return (
    <select
      aria-label="Entreprise"
      disabled={!ecriture}
      className="w-full rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-pierre-300 focus:border-foret-600 disabled:hover:border-transparent md:w-auto"
      value={e.entreprise_utilisation ?? ''}
      onChange={(ev) => maj.mutate({ id: e.id, champs: { entreprise_utilisation: (ev.target.value || null) as Entreprise | null } })}
    >
      <option value="">—</option>
      {ENTREPRISES.map((x) => (
        <option key={x}>{x}</option>
      ))}
    </select>
  )
}

function Notes({ e, ecriture }: { e: Equipement; ecriture: boolean }) {
  const maj = useMajEquipement()
  if (!ecriture) return <span className="text-pierre-600">{e.notes}</span>
  return (
    <ChampTexte
      aria-label="Notes"
      placeholder="Ajouter une note…"
      className="w-full rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-pierre-300 focus:border-foret-600 focus:bg-white focus:outline-none"
      valeur={e.notes ?? ''}
      enregistrer={(notes) => maj.mutate({ id: e.id, champs: { notes: notes || null } })}
    />
  )
}

function BoutonRetirer({ e, avecTexte }: { e: Equipement; avecTexte?: boolean }) {
  const supprimer = useSupprimerEquipement()
  const retirer = async () => {
    if (await confirmer({ titre: `Supprimer la ligne « ${e.variante} » (${TITRES[e.type]}) ?`, libelleOk: 'Supprimer', danger: true })) supprimer.mutate(e.id)
  }
  if (avecTexte) return <BoutonSupprimer onClick={retirer} />
  return (
    <button className="rounded p-1 text-pierre-500 hover:bg-red-50 hover:text-red-700" aria-label={`Supprimer ${e.type} ${e.variante}`} onClick={retirer}>
      <IconeCorbeille className="size-4" />
    </button>
  )
}
