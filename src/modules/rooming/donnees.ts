import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useListe } from '@/lib/donnees'
import { supabase } from '@/lib/supabase'
import type { Chambre, Employe, Lieu, Occupation, Personne, Plan, TypeChambre } from './types'

// Module en ligne seulement (pas de file d'attente hors ligne) : sans réseau,
// une modification échoue tout de suite (networkMode « always »).

const S = 'rooming'
const db = () => supabase.schema(S)

export type TableStructure = 'lieux' | 'chambres'

/** Tout le module : structure, plans, occupations et noms de tous les plans (quelques centaines de lignes). */
export function useRooming() {
  const lieux = useListe<Lieu>(S, 'lieux', 'ordre')
  const chambres = useListe<Chambre>(S, 'chambres', 'ordre')
  const plans = useListe<Plan>(S, 'plans', 'created_at')
  const occupations = useListe<Occupation>(S, 'occupations', 'id')
  const personnes = useListe<Personne>(S, 'personnes', 'created_at')
  const employes = useListe<Employe>('core', 'employes', 'surnom')
  return useMemo(() => {
    const requetes = [lieux, chambres, plans, occupations, personnes, employes]
    return {
      structure: {
        lieux: lieux.data ?? [],
        chambres: chambres.data ?? [],
      },
      plans: plans.data ?? [],
      occupations: occupations.data ?? [],
      personnes: personnes.data ?? [],
      employes: employes.data ?? [],
      employe: new Map((employes.data ?? []).map((e) => [e.id, e])),
      lieu: new Map((lieux.data ?? []).map((x) => [x.id, x])),
      pret: requetes.every((r) => !!r.data),
      erreur: requetes.find((r) => r.error)?.error ?? null,
    }
    // Les objets de requête changent à chaque rendu : on suit leurs données.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    lieux.data, chambres.data, plans.data, occupations.data, personnes.data, employes.data,
    lieux.error, chambres.error, plans.error, occupations.error, personnes.error, employes.error,
  ])
}

export type Donnees = ReturnType<typeof useRooming>

export function useRelire() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: [S] })
}

async function executer(requete: PromiseLike<{ error: unknown }>) {
  const { error } = await requete
  if (error) throw error
}

export interface ValeursOccupation {
  plan_id: string
  chambre_id: string
  type: TypeChambre
  nombre: number
  lits: number
}

/**
 * Type, nombre et capacité d'une chambre dans un plan. Affichage mis à jour
 * d'avance ; si la base refuse (lits dépassés…), la ligne d'avant revient
 * et l'erreur reste dans la fenêtre (racine « rooming-local »). Une seule
 * file : les clics rapides partent dans l'ordre.
 */
export function useDefinirOccupation() {
  const client = useQueryClient()
  const cle = [S, 'occupations']
  return useMutation({
    mutationKey: ['rooming-local', 'occupations'],
    networkMode: 'always',
    scope: { id: 'rooming-occupations' },
    mutationFn: async (v: ValeursOccupation) => {
      await executer(db().from('occupations').upsert({ ...v, nombre: v.type === 'vide' ? 0 : v.nombre }, { onConflict: 'plan_id,chambre_id' }))
    },
    onMutate: async (v) => {
      await client.cancelQueries({ queryKey: cle })
      const meme = (o: Occupation) => o.plan_id === v.plan_id && o.chambre_id === v.chambre_id
      const avant = client.getQueryData<Occupation[]>(cle)?.find(meme)
      const ligne: Occupation = { id: avant?.id ?? `nouvelle-${v.plan_id}-${v.chambre_id}`, ...v, nombre: v.type === 'vide' ? 0 : v.nombre }
      client.setQueryData<Occupation[]>(cle, (liste) => (avant ? liste?.map((o) => (meme(o) ? ligne : o)) : [...(liste ?? []), ligne]))
      return { avant, meme }
    },
    onError: (_e, _v, ctx) => {
      if (!ctx) return
      client.setQueryData<Occupation[]>(cle, (liste) =>
        ctx.avant ? liste?.map((o) => (ctx.meme(o) ? ctx.avant! : o)) : liste?.filter((o) => !ctx.meme(o)),
      )
    },
    // Un changement de type peut retirer des noms : on relit les deux.
    onSettled: () => Promise.all([client.invalidateQueries({ queryKey: cle }), client.invalidateQueries({ queryKey: [S, 'personnes'] })]),
  })
}

/** Erreur de la base « déjà placé ailleurs dans ce plan » : nom de l'autre chambre. */
export function dejaPlace(e: unknown): string | null {
  const m = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : ''
  return m.startsWith('DEJA_PLACE:') ? m.slice('DEJA_PLACE:'.length) : null
}

/** Nomme une personne dans une chambre (voir rooming.placer). */
export async function placer(v: { plan: string; chambre: string; employe: string | null; nom: string | null; deplacer?: boolean }) {
  await executer(
    db().rpc('placer', { p_plan: v.plan, p_chambre: v.chambre, p_employe: v.employe, p_nom: v.nom, p_deplacer: v.deplacer ?? false }),
  )
}

/** Retire un nom : la personne quitte la chambre (le nombre baisse de 1). */
export async function retirerPersonne(id: string) {
  await executer(db().rpc('retirer', { p_personne: id }))
}

export async function copierPlan(source: string, nom: string): Promise<string> {
  const { data, error } = await db().rpc('copier_plan', { p_source: source, p_nom: nom })
  if (error) throw error
  return data as string
}

/** Nouveau plan : photo de la référence d'aujourd'hui (chambres et lits), sans personne. */
export async function creerPlan(nom: string): Promise<string> {
  const { data, error } = await db().rpc('creer_plan', { p_nom: nom })
  if (error) throw error
  return data as string
}

export async function mettreEnVigueur(plan: string) {
  await executer(db().rpc('mettre_en_vigueur', { p_plan: plan }))
}

export async function modifierPlan(id: string, champs: Partial<Pick<Plan, 'nom' | 'archive'>>) {
  await executer(db().from('plans').update(champs).eq('id', id))
}

export async function supprimerPlan(id: string) {
  await executer(db().from('plans').delete().eq('id', id))
}

/** Ajoute (sans id) ou modifie une ligne de la référence. */
export async function enregistrerStructure<T extends { id: string }>(table: TableStructure, ligne: Partial<T>) {
  const { id, ...reste } = ligne
  const champs = reste as Record<string, unknown>
  await executer(id ? db().from(table).update(champs).eq('id', id) : db().from(table).insert(champs))
}

export async function supprimerStructure(table: TableStructure, id: string) {
  await executer(db().from(table).delete().eq('id', id))
}

/**
 * Retire un lieu de la référence : s'il sert dans un plan, il est seulement
 * retiré (les anciens plans le gardent) → 'retire' ; sinon il est effacé
 * avec ce qu'il contient → 'efface'.
 */
export async function retirerLieu(id: string): Promise<'retire' | 'efface'> {
  const { data, error } = await db().rpc('retirer_lieu', { p_lieu: id })
  if (error) throw error
  return data as 'retire' | 'efface'
}

/** Remet un lieu dans la référence, avec ce qu'il contient et ses parents. */
export async function remettreLieu(id: string) {
  await executer(db().rpc('remettre_lieu', { p_lieu: id }))
}

/** Renumérote l'ordre selon la liste d'id. */
export async function ordonner(table: TableStructure, ids: string[]) {
  await Promise.all(ids.map((id, i) => executer(db().from(table).update({ ordre: i + 1 }).eq('id', id))))
}
