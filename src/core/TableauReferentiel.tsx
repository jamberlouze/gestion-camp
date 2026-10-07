import { Fragment, useState, type FormEvent } from 'react'
import { BoutonModifier, BoutonSupprimer } from '@/lib/BoutonsAction'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur, useEnregistrer, useListe, useSupprimer } from '@/lib/donnees'
import type { Schema } from '@/lib/supabase'
import { teinte } from '@/lib/PuceCompagnie'
import { ui } from '@/lib/ui'

type TypeChamp = 'texte' | 'nombre' | 'couleur' | 'date' | 'booleen' | 'choix'

export interface Option {
  id: string
  libelle: string
  /** Teinte de la pastille (ex. couleur d'une compagnie). */
  couleur?: string | null
  /** Texte court de la pastille dans le tableau (ex. abréviation) ; le libellé complet reste dans la saisie. */
  court?: string | null
}

export interface Colonne<T> {
  champ: keyof T & string
  libelle: string
  type: TypeChamp
  requis?: boolean
  /** Type « choix » : liste de cases à cocher, valeur = tableau d'id. */
  options?: Option[]
}

interface Props<T> {
  schema: Schema
  table: string
  tri: string
  colonnes: Colonne<T>[]
  valeursDefaut: Partial<T>
  nomLigne: (ligne: T) => string
}

/**
 * Tableau éditable générique pour les listes simples du référentiel
 * (groupes, employés, semaines). Modification ligne par ligne.
 */
export function TableauReferentiel<T extends { id: string }>({
  schema,
  table,
  tri,
  colonnes,
  valeursDefaut,
  nomLigne,
}: Props<T>) {
  const { data: lignes, isLoading, error } = useListe<T>(schema, table, tri)
  const enregistrer = useEnregistrer<T>(schema, table)
  const supprimer = useSupprimer(schema, table)
  const [edition, setEdition] = useState<Partial<T> | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  function commencer(ligne: Partial<T>) {
    setErreur(null)
    setEdition({ ...ligne })
  }

  async function sauver(e: FormEvent) {
    e.preventDefault()
    if (!edition) return
    try {
      await enregistrer.mutateAsync(nettoyer(edition, colonnes))
      setEdition(null)
    } catch (err) {
      setErreur(messageErreur(err))
    }
  }

  async function retirer(ligne: T) {
    if (!(await confirmer({ titre: `Supprimer « ${nomLigne(ligne)} » ?` }))) return
    try {
      await supprimer.mutateAsync(ligne.id)
    } catch (err) {
      setErreur(messageErreur(err))
    }
  }

  const ligneEdition = (
    <tr className="bg-foret-50/60">
      {colonnes.map((c) => (
        <td key={c.champ} className="px-3 py-2 align-top">
          <Saisie
            colonne={c}
            valeur={edition?.[c.champ]}
            onChange={(v) => setEdition((ed) => ({ ...ed, [c.champ]: v }) as Partial<T>)}
          />
        </td>
      ))}
      <td className="whitespace-nowrap px-3 py-2 text-right align-top">
        <button type="submit" className={ui.bouton} disabled={enregistrer.isPending}>
          Enregistrer
        </button>
        <button type="button" className="ml-2 text-sm text-pierre-500" onClick={() => setEdition(null)}>
          Annuler
        </button>
      </td>
    </tr>
  )

  return (
    <form onSubmit={sauver}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-pierre-500">{lignes ? `${lignes.length} élément(s)` : ''}</p>
        <button type="button" className={ui.bouton} onClick={() => commencer(valeursDefaut)} disabled={!!edition}>
          + Ajouter
        </button>
      </div>
      {(erreur || error) && <p className={`${ui.erreur} mb-3`}>{erreur ?? messageErreur(error)}</p>}
      <div className={`${ui.carte} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="border-b border-pierre-200 bg-pierre-50 text-left">
            <tr>
              {colonnes.map((c) => (
                <th key={c.champ} className="px-3 py-2 font-medium text-pierre-500">
                  {c.libelle}
                </th>
              ))}
              <th className="w-40" />
            </tr>
          </thead>
          <tbody className="divide-y divide-pierre-100">
            {edition && !edition.id && ligneEdition}
            {isLoading && (
              <tr>
                <td colSpan={colonnes.length + 1} className="px-3 py-6 text-center text-pierre-500">
                  Chargement…
                </td>
              </tr>
            )}
            {lignes?.map((ligne) =>
              edition?.id === ligne.id ? (
                <Fragment key={ligne.id}>{ligneEdition}</Fragment>
              ) : (
                <tr key={ligne.id} className="hover:bg-pierre-50">
                  {colonnes.map((c) => (
                    <td key={c.champ} className="px-3 py-2">
                      <Affichage colonne={c} valeur={ligne[c.champ]} />
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <BoutonModifier onClick={() => commencer(ligne)} disabled={!!edition} />
                    <BoutonSupprimer className="ml-1.5" onClick={() => retirer(ligne)} />
                  </td>
                </tr>
              ),
            )}
            {lignes?.length === 0 && !edition && (
              <tr>
                <td colSpan={colonnes.length + 1} className="px-3 py-6 text-center text-pierre-500">
                  Aucun élément pour l'instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </form>
  )
}

/** Champs texte ou date vides → null, pour ne pas enregistrer de chaînes vides. */
function nettoyer<T>(ligne: Partial<T>, colonnes: Colonne<T>[]): Partial<T> {
  const copie: Record<string, unknown> = { ...ligne }
  for (const c of colonnes) {
    if ((c.type === 'texte' || c.type === 'date') && typeof copie[c.champ] === 'string') {
      const v = (copie[c.champ] as string).trim()
      copie[c.champ] = v === '' ? null : v
    }
  }
  return copie as Partial<T>
}

function Affichage<T>({ colonne, valeur }: { colonne: Colonne<T>; valeur: unknown }) {
  switch (colonne.type) {
    case 'couleur':
      return valeur ? (
        <span className="inline-block h-5 w-5 rounded border border-pierre-200" style={{ background: String(valeur) }} />
      ) : null
    case 'booleen':
      return valeur ? <span>Oui</span> : <span className="text-pierre-500">Non</span>
    case 'date':
      return valeur ? (
        <span>{new Date(`${valeur}T12:00`).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
      ) : null
    case 'choix': {
      const options = colonne.options ?? []
      return (
        <span className="flex flex-wrap gap-1">
          {((valeur as string[]) ?? []).map((s) => {
            const o = options.find((x) => x.id === s)
            return (
              <span
                key={s}
                title={o?.court ? o.libelle : undefined}
                className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${o?.couleur ? '' : 'bg-foret-100 text-foret-800'}`}
                style={o?.couleur ? teinte(o.couleur) : undefined}
              >
                {o ? o.court || o.libelle : s}
              </span>
            )
          })}
        </span>
      )
    }
    default:
      return <span>{valeur == null ? '' : String(valeur)}</span>
  }
}

function Saisie<T>({
  colonne,
  valeur,
  onChange,
}: {
  colonne: Colonne<T>
  valeur: unknown
  onChange: (v: unknown) => void
}) {
  switch (colonne.type) {
    case 'nombre':
      return (
        <input
          type="number"
          className={`${ui.champ} w-24`}
          required={colonne.requis}
          value={valeur == null ? '' : String(valeur)}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        />
      )
    case 'couleur':
      return (
        <input
          type="color"
          className="h-9 w-12 cursor-pointer rounded border border-pierre-300"
          value={(valeur as string) || '#19774a'}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'date':
      return (
        <input
          type="date"
          className={ui.champ}
          required={colonne.requis}
          value={(valeur as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    case 'booleen':
      return (
        <input
          type="checkbox"
          className="mt-2.5 h-4 w-4 accent-foret-700"
          checked={!!valeur}
          onChange={(e) => onChange(e.target.checked)}
        />
      )
    case 'choix': {
      const choisies = (valeur as string[]) ?? []
      return (
        <div className="flex flex-col gap-1 pt-1">
          {(colonne.options ?? []).map((s) => (
            <label key={s.id} className="flex items-center gap-1.5 whitespace-nowrap">
              <input
                type="checkbox"
                className="accent-foret-700"
                checked={choisies.includes(s.id)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...choisies, s.id] : choisies.filter((x) => x !== s.id))
                }
              />
              {s.libelle}
            </label>
          ))}
        </div>
      )
    }
    default:
      return (
        <input
          type="text"
          className={ui.champ}
          required={colonne.requis}
          value={(valeur as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}
