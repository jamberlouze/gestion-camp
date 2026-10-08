import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useListe } from '@/lib/donnees'
import { supabase } from '@/lib/supabase'
import { cible, genre, type Idee } from './types'

// Module en ligne seulement (networkMode « always ») : affichage mis à jour
// d'avance ; si la base refuse, la ligne d'avant revient et le bandeau du
// module (racine « ameliorations ») l'explique.

const cle = ['ameliorations', 'idees']
const table = () => supabase.schema('ameliorations').from('idees')

export const useIdees = () => useListe<Idee>('ameliorations', 'idees', 'created_at')

export function useAjouterIdee() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['ameliorations', 'ajouter'],
    networkMode: 'always',
    mutationFn: async (idee: Idee) => {
      const { id, genre, titre, details, module, de_qui, statut, important } = idee
      const { error } = await table().insert({ id, genre, titre, details, module, de_qui, statut, important })
      if (error) throw error
    },
    onMutate: async (idee) => {
      await client.cancelQueries({ queryKey: cle })
      client.setQueryData<Idee[]>(cle, (liste) => [...(liste ?? []), idee])
    },
    onError: (_e, idee) => client.setQueryData<Idee[]>(cle, (liste) => liste?.filter((i) => i.id !== idee.id)),
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}

export function useModifierIdee() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['ameliorations', 'modifier'],
    networkMode: 'always',
    mutationFn: async ({ id, champs }: { id: string; champs: Partial<Idee> }) => {
      const { error } = await table().update(champs).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, champs }) => {
      await client.cancelQueries({ queryKey: cle })
      const avant = client.getQueryData<Idee[]>(cle)?.find((i) => i.id === id)
      client.setQueryData<Idee[]>(cle, (liste) => liste?.map((i) => (i.id === id ? { ...i, ...champs } : i)))
      return { avant }
    },
    onError: (_e, _v, ctx) => {
      const avant = ctx?.avant
      if (avant) client.setQueryData<Idee[]>(cle, (liste) => liste?.map((i) => (i.id === avant.id ? avant : i)))
    },
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}

export function useSupprimerIdee() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['ameliorations', 'supprimer'],
    networkMode: 'always',
    mutationFn: async (id: string) => {
      const { error } = await table().delete().eq('id', id)
      if (error) throw error
    },
    onMutate: async (id) => {
      await client.cancelQueries({ queryKey: cle })
      const avant = client.getQueryData<Idee[]>(cle)?.find((i) => i.id === id)
      client.setQueryData<Idee[]>(cle, (liste) => liste?.filter((i) => i.id !== id))
      return { avant }
    },
    onError: (_e, _id, ctx) => {
      const avant = ctx?.avant
      if (avant) client.setQueryData<Idee[]>(cle, (liste) => [...(liste ?? []), avant])
    },
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}

/** Texte à coller dans une conversation avec Claude pour lancer le travail. */
export function demandePourClaude(i: Idee): string {
  const ou = i.module ? cible(i.module).nom : null
  const entete =
    i.genre === 'module'
      ? `Nouveau module à bâtir : ${i.titre}`
      : i.genre === 'fonctionnalite'
        ? `Dans le module ${ou} : ${i.titre}`
        : `Commentaire${i.de_qui ? ` de ${i.de_qui}` : " de l'équipe"}${ou ? ` sur ${ou}` : " sur l'app"} : ${i.titre}`
  return [entete, i.details?.trim()].filter(Boolean).join('\n\n')
}

/** Recherche sans accents ni majuscules. */
export const normaliser = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

export const texteIdee = (i: Idee) =>
  normaliser([i.titre, i.details, i.de_qui, i.module && cible(i.module).nom, genre(i.genre).nom].filter(Boolean).join(' '))

const formatJour = new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' })
export const jour = (iso: string) => formatJour.format(new Date(iso))
