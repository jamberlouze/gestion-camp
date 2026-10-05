import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useListe } from '@/lib/donnees'
import { supabase } from '@/lib/supabase'
import { parVehicule } from './outils'
import type { Entretien, Inspection, Proprietaire, Vehicule } from './types'

// Module en ligne seulement (pas de file d'attente hors ligne, contrairement
// à Embarcations) : sans réseau, une modification échoue tout de suite
// (networkMode « always ») au lieu d'attendre dans le cache de l'appareil.

const S = 'vehicules'
const db = () => supabase.schema(S)
const SEAU = 'vehicules-photos'

type Table = 'proprietaires' | 'vehicules' | 'inspections' | 'entretiens'

export const useProprietaires = () => useListe<Proprietaire>(S, 'proprietaires', 'ordre')
export const useVehicules = () => useListe<Vehicule>(S, 'vehicules', 'ordre')
export const useInspections = () => useListe<Inspection>(S, 'inspections', 'date')
export const useEntretiens = () => useListe<Entretien>(S, 'entretiens', 'date')

/** Flotte, propriétaires et registres, prêts à afficher. */
export function useFlotte() {
  const vehicules = useVehicules()
  const proprietaires = useProprietaires()
  const inspections = useInspections()
  const entretiens = useEntretiens()
  return useMemo(
    () => ({
      vehicules: vehicules.data ?? [],
      proprietaires: proprietaires.data ?? [],
      proprietaire: new Map((proprietaires.data ?? []).map((p) => [p.id, p])),
      inspections: parVehicule(inspections.data ?? []),
      entretiens: entretiens.data ?? [],
      pret: !!vehicules.data && !!proprietaires.data && !!inspections.data && !!entretiens.data,
      erreur: vehicules.error ?? proprietaires.error ?? inspections.error ?? entretiens.error,
    }),
    [vehicules.data, proprietaires.data, inspections.data, entretiens.data, vehicules.error, proprietaires.error, inspections.error, entretiens.error],
  )
}

export type Flotte = ReturnType<typeof useFlotte>

/**
 * Modifie des champs d'une ligne ; erreurs dans le bandeau du module.
 * Affichage mis à jour d'avance ; si la base refuse, la ligne d'avant
 * est remise.
 */
export function useModifier<T extends { id: string }>(table: Table) {
  const client = useQueryClient()
  const cle = [S, table]
  return useMutation({
    mutationKey: [S, table],
    networkMode: 'always',
    mutationFn: async ({ id, champs }: { id: string; champs: Partial<T> }) => {
      const { error } = await db().from(table).update(champs as Record<string, unknown>).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, champs }) => {
      await client.cancelQueries({ queryKey: cle })
      const avant = client.getQueryData<T[]>(cle)?.find((l) => l.id === id)
      client.setQueryData<T[]>(cle, (liste) => liste?.map((l) => (l.id === id ? { ...l, ...champs } : l)))
      return { avant }
    },
    onError: (_e, _v, ctx) => {
      const avant = ctx?.avant
      if (avant) client.setQueryData<T[]>(cle, (liste) => liste?.map((l) => (l.id === avant.id ? avant : l)))
    },
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}

/**
 * Ajoute ou modifie une ligne depuis une fenêtre : l'erreur reste dans la
 * fenêtre (racine « vehicules-local », ignorée par le bandeau du module).
 */
export function useEnregistrerLigne<T extends { id: string }>(table: Table) {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['vehicules-local', table],
    networkMode: 'always',
    mutationFn: async (ligne: Partial<T>) => {
      const { id, ...reste } = ligne
      const champs = reste as Record<string, unknown>
      const { data, error } = id
        ? await db().from(table).update(champs).eq('id', id).select().single()
        : await db().from(table).insert(champs).select().single()
      if (error) throw error
      return data as T
    },
    onSettled: () => client.invalidateQueries({ queryKey: [S, table] }),
  })
}

export function useSupprimerLigne(table: Table) {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [S, table, 'supprimer'],
    networkMode: 'always',
    mutationFn: async (id: string) => {
      const { error } = await db().from(table).delete().eq('id', id)
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: [S, table] }),
  })
}

/** Supprime un véhicule, ses registres (cascade) et sa photo. */
export async function supprimerVehicule(v: Vehicule) {
  const { error } = await db().from('vehicules').delete().eq('id', v.id)
  if (error) throw error
  if (v.photo) await supabase.storage.from(SEAU).remove([v.photo])
}

export const adressePhoto = (chemin: string) => supabase.storage.from(SEAU).getPublicUrl(chemin).data.publicUrl

/** Côté le plus long d'une photo envoyée (les photos de téléphone font plusieurs Mo). */
const COTE_MAX = 1600

async function reduire(fichier: File): Promise<Blob> {
  const image = await createImageBitmap(fichier, { imageOrientation: 'from-image' })
  const echelle = Math.min(1, COTE_MAX / Math.max(image.width, image.height))
  const canevas = document.createElement('canvas')
  canevas.width = Math.round(image.width * echelle)
  canevas.height = Math.round(image.height * echelle)
  canevas.getContext('2d')!.drawImage(image, 0, 0, canevas.width, canevas.height)
  image.close()
  return new Promise((ok, echec) =>
    canevas.toBlob((b) => (b ? ok(b) : echec(new Error("La photo n'a pas pu être lue."))), 'image/jpeg', 0.85),
  )
}

/** Remplace la photo d'un véhicule (l'ancienne est retirée du seau). */
export async function changerPhoto(v: Vehicule, fichier: File | null) {
  let chemin: string | null = null
  if (fichier) {
    chemin = `${v.id}/${crypto.randomUUID()}.jpg`
    const { error } = await supabase.storage.from(SEAU).upload(chemin, await reduire(fichier), { contentType: 'image/jpeg' })
    if (error) throw error
  }
  const { error } = await db().from('vehicules').update({ photo: chemin }).eq('id', v.id)
  if (error) {
    if (chemin) await supabase.storage.from(SEAU).remove([chemin])
    throw error
  }
  if (v.photo) await supabase.storage.from(SEAU).remove([v.photo])
}
