import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Employe } from '@/lib/types'
import { completer, REGLAGES_DEFAUT } from './logique'
import type { EtatSemaine, Horaire, Reglages } from './types'

// Chaque semaine est un document (horaire.horaires.etat). L'éditeur garde
// une copie locale, modifiée tout de suite, et l'enregistre peu après la
// dernière modification. Deux personnes sur la même semaine : la dernière
// sauvegarde l'emporte ; les changements des autres arrivent en temps réel
// dès qu'on n'a plus de modification en attente.

const db = () => supabase.schema('horaire')
const CLES = {
  liste: ['horaire', 'liste'],
  document: (id: string) => ['horaire', 'document', id],
  reglages: ['horaire', 'reglages'],
}

async function verifier<T>(requete: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await requete
  if (error) throw error
  return data
}

export type ResumeHoraire = Pick<Horaire, 'id' | 'nom' | 'semaine_id' | 'updated_at' | 'created_at'>

export function useHoraires() {
  return useQuery({
    queryKey: CLES.liste,
    queryFn: async () =>
      (await verifier(db().from('horaires').select('id, nom, semaine_id, updated_at, created_at'))) as ResumeHoraire[],
    select: (l) => [...l].sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { numeric: true, sensitivity: 'base' })),
  })
}

export function useReglages(): Reglages {
  const { data } = useQuery({
    queryKey: CLES.reglages,
    queryFn: async () => {
      const lignes = await verifier(db().from('parametres').select('valeur').eq('cle', 'reglages'))
      return ((lignes as { valeur: Partial<Reglages> }[])[0]?.valeur ?? {}) as Partial<Reglages>
    },
  })
  return { ...REGLAGES_DEFAUT, ...data, capacites: { ...REGLAGES_DEFAUT.capacites, ...data?.capacites } }
}

export function useEnregistrerReglages() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['horaire', 'reglages'],
    mutationFn: (r: Reglages) => verifier(db().from('parametres').upsert({ cle: 'reglages', valeur: r })),
    onMutate: (r) => client.setQueryData(CLES.reglages, r),
    onSettled: () => client.invalidateQueries({ queryKey: CLES.reglages }),
  })
}

/** Animateurs du référentiel commun (employés actifs). */
export function useAnimateurs() {
  const { data } = useQuery({
    queryKey: ['core', 'employes'],
    queryFn: async () => (await verifier(supabase.schema('core').from('employes').select('*').order('surnom'))) as Employe[],
  })
  return (data ?? []).filter((e) => e.actif).map((e) => e.surnom)
}

export function useAjouterAnimateurs() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['horaire', 'animateurs'],
    mutationFn: (surnoms: string[]) =>
      verifier(
        supabase
          .schema('core')
          .from('employes')
          .upsert(
            surnoms.map((surnom) => ({ surnom })),
            { onConflict: 'surnom', ignoreDuplicates: true },
          ),
      ),
    onSettled: () => client.invalidateQueries({ queryKey: ['core', 'employes'] }),
  })
}

export function useCreerHoraire() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['horaire', 'creer'],
    mutationFn: async ({ nom, etat }: { nom: string; etat: EtatSemaine }) =>
      ((await verifier(db().from('horaires').insert({ nom, etat }).select('id').single())) as { id: string }).id,
    onSettled: () => client.invalidateQueries({ queryKey: CLES.liste }),
  })
}

export function useRenommerHoraire() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['horaire', 'renommer'],
    mutationFn: ({ id, nom }: { id: string; nom: string }) => verifier(db().from('horaires').update({ nom }).eq('id', id)),
    onSettled: () => client.invalidateQueries({ queryKey: CLES.liste }),
  })
}

export function useSupprimerHoraire() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['horaire', 'supprimer'],
    mutationFn: (id: string) => verifier(db().from('horaires').delete().eq('id', id)),
    onSettled: () => client.invalidateQueries({ queryKey: CLES.liste }),
  })
}

export type StatutEnregistrement = 'enregistre' | 'en-attente' | 'erreur'

/** Éditeur d'une semaine : copie locale + enregistrement automatique. */
export function useEditeurSemaine(id: string | null) {
  const client = useQueryClient()
  const document = useQuery({
    queryKey: CLES.document(id ?? ''),
    enabled: !!id,
    queryFn: async () => (await verifier(db().from('horaires').select('*').eq('id', id!).single())) as Horaire,
  })
  const [etat, setEtat] = useState<EtatSemaine | null>(null)
  const [statut, setStatut] = useState<StatutEnregistrement>('enregistre')
  const enAttente = useRef<EtatSemaine | null>(null)
  const minuterie = useRef<ReturnType<typeof setTimeout>>(undefined)
  const idCourant = useRef(id)

  /** Enregistre un état et met à jour la copie en cache (retour sur la semaine). */
  const sauver = useCallback(
    async (cible: string, aEnvoyer: EtatSemaine) => {
      await verifier(db().from('horaires').update({ etat: aEnvoyer }).eq('id', cible))
      client.setQueryData<Horaire>(CLES.document(cible), (d) => (d ? { ...d, etat: aEnvoyer } : d))
    },
    [client],
  )

  const envoyer = useCallback(async () => {
    clearTimeout(minuterie.current)
    const aEnvoyer = enAttente.current
    const cible = idCourant.current
    if (!aEnvoyer || !cible) return
    try {
      await sauver(cible, aEnvoyer)
      if (enAttente.current === aEnvoyer) {
        enAttente.current = null
        setStatut('enregistre')
      }
    } catch {
      // Gardé en attente : la prochaine modification (ou « Réessayer ») renvoie.
      setStatut('erreur')
    }
  }, [sauver])

  // Changement de semaine : on envoie ce qui reste de l'ancienne, puis on
  // repart des données de la nouvelle.
  useEffect(() => {
    idCourant.current = id
    return () => {
      clearTimeout(minuterie.current)
      const reste = enAttente.current
      const ancienne = idCourant.current
      enAttente.current = null
      if (reste && ancienne) void sauver(ancienne, reste).catch(() => setStatut('erreur'))
      setEtat(null)
      setStatut('enregistre')
    }
  }, [id, sauver])

  // Données du serveur : adoptées tant qu'on n'a rien en attente.
  useEffect(() => {
    if (document.data && document.data.id === id && !enAttente.current) setEtat(completer(document.data.etat))
  }, [document.data, id])

  // Temps réel : une autre personne a modifié cette semaine.
  useEffect(() => {
    if (!id) return
    const canal = supabase
      .channel(`horaire-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'horaire', table: 'horaires', filter: `id=eq.${id}` }, () => {
        if (!enAttente.current) client.invalidateQueries({ queryKey: CLES.document(id) })
      })
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [id, client])

  // Ne pas perdre la dernière seconde de travail en fermant l'onglet.
  useEffect(() => {
    const avant = (e: BeforeUnloadEvent) => {
      if (enAttente.current) {
        void envoyer()
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', avant)
    return () => window.removeEventListener('beforeunload', avant)
  }, [envoyer])

  /** Modifie une copie de l'état (fonction qui mute la copie) et planifie l'enregistrement. */
  const modifier = useCallback(
    (fn: (e: EtatSemaine) => void) => {
      setEtat((actuel) => {
        if (!actuel) return actuel
        const copie = structuredClone(actuel)
        fn(copie)
        enAttente.current = copie
        return copie
      })
      setStatut('en-attente')
      clearTimeout(minuterie.current)
      minuterie.current = setTimeout(() => void envoyer(), 600)
    },
    [envoyer],
  )

  /** Remplace tout l'état (import Excel) et l'enregistre aussitôt. */
  const remplacer = useCallback(
    (nouveau: EtatSemaine) => {
      enAttente.current = nouveau
      setEtat(nouveau)
      setStatut('en-attente')
      void envoyer()
    },
    [envoyer],
  )

  return {
    horaire: document.data?.id === id ? document.data : undefined,
    etat,
    modifier,
    remplacer,
    statut,
    erreur: document.error,
    envoyer,
  }
}
