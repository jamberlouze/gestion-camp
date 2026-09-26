import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useListe } from '@/lib/donnees'
import { supabase } from '@/lib/supabase'
import type { Employe } from '@/lib/types'
import { completer, REGLAGES_DEFAUT } from './logique'
import type { Dossier, EtatSemaine, Horaire, Reglages } from './types'

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

/** Semaine ou modèle, sans la grille (seulement ses jours, pour les résumés). */
export type ResumeHoraire = Pick<Horaire, 'id' | 'nom' | 'semaine_id' | 'dossier_id' | 'modele' | 'updated_at' | 'created_at'> & {
  jours: string[] | null
}

export const trierNoms = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' })

/** Garde à jour les jours d'un horaire dans la liste (résumés, aperçu d'un modèle). */
function majJoursListe(client: QueryClient, id: string, jours: string[], modifie = false) {
  const maintenant = new Date().toISOString()
  client.setQueryData<ResumeHoraire[]>(CLES.liste, (l) =>
    l?.map((h) => (h.id === id ? { ...h, jours, ...(modifie ? { updated_at: maintenant } : {}) } : h)),
  )
}

export function useHoraires() {
  return useQuery({
    queryKey: CLES.liste,
    queryFn: async () =>
      (await verifier(
        db().from('horaires').select('id, nom, semaine_id, dossier_id, modele, updated_at, created_at, jours:etat->jours'),
      )) as ResumeHoraire[],
    select: (l) => [...l].sort((a, b) => trierNoms(a.nom, b.nom)),
  })
}

/** Dossiers de rangement des semaines (par saison…), triés par nom. */
export function useDossiers() {
  const requete = useListe<Dossier>('horaire', 'dossiers', 'nom')
  const dossiers = useMemo(() => [...(requete.data ?? [])].sort((a, b) => trierNoms(a.nom, b.nom)), [requete.data])
  // Dossiers existants (null tant qu'ils ne sont pas chargés) : un dossier
  // supprimé ailleurs vaut « Sans dossier » (la base a mis dossier_id à null).
  const connus = useMemo(() => (requete.data ? new Set(requete.data.map((d) => d.id)) : null), [requete.data])
  return { ...requete, dossiers, connus }
}

/** Crée (sans id) ou renomme un dossier ; renvoie l'id du dossier. */
export function useEnregistrerDossier() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['horaire', 'dossier'],
    mutationFn: async ({ id, nom }: { id?: string; nom: string }) => {
      if (id) {
        await verifier(db().from('dossiers').update({ nom }).eq('id', id))
        return id
      }
      return ((await verifier(db().from('dossiers').insert({ nom }).select('id').single())) as { id: string }).id
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['horaire', 'dossiers'] }),
  })
}

/** Supprime un dossier ; ses semaines passent dans « Sans dossier ». */
export function useSupprimerDossier() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['horaire', 'supprimer-dossier'],
    mutationFn: (id: string) => verifier(db().from('dossiers').delete().eq('id', id)),
    onSettled: () => {
      client.invalidateQueries({ queryKey: ['horaire', 'dossiers'] })
      client.invalidateQueries({ queryKey: CLES.liste })
    },
  })
}

/** Réglages communs, complétés par les valeurs par défaut ; charge : vrai une fois lus. */
export function useEtatReglages(): { reglages: Reglages; charge: boolean; erreur: boolean; recharger: () => void } {
  const { data, isError, refetch } = useQuery({
    queryKey: CLES.reglages,
    queryFn: async () => {
      const lignes = await verifier(db().from('parametres').select('valeur').eq('cle', 'reglages'))
      return ((lignes as { valeur: Partial<Reglages> }[])[0]?.valeur ?? {}) as Partial<Reglages>
    },
  })
  // Même objet tant que les réglages ne changent pas (calculs mémorisés).
  const reglages = useMemo(() => ({ ...REGLAGES_DEFAUT, ...data, capacites: { ...REGLAGES_DEFAUT.capacites, ...data?.capacites } }), [data])
  // Chargés dès qu'on a des données : un rechargement raté en arrière-plan
  // garde les données (et le formulaire des réglages reste affiché).
  return { reglages, charge: data !== undefined, erreur: isError && data === undefined, recharger: () => void refetch() }
}

export const useReglages = (): Reglages => useEtatReglages().reglages

export function useEnregistrerReglages() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['horaire', 'reglages'],
    mutationFn: (r: Reglages) => verifier(db().from('parametres').upsert({ cle: 'reglages', valeur: r })),
    onMutate: (r) => client.setQueryData(CLES.reglages, r),
    onSettled: () => client.invalidateQueries({ queryKey: CLES.reglages }),
  })
}

function useEmployes() {
  return useQuery({
    queryKey: ['core', 'employes'],
    queryFn: async () => (await verifier(supabase.schema('core').from('employes').select('*').order('surnom'))) as Employe[],
  })
}

/** Animateurs du référentiel commun (employés actifs). */
export function useAnimateurs() {
  const { data } = useEmployes()
  return (data ?? []).filter((e) => e.actif).map((e) => e.surnom)
}

/** Vrai une fois le référentiel chargé, s'il ne contient aucun employé actif. */
export function useReferentielVide() {
  const { data } = useEmployes()
  return !!data && !data.some((e) => e.actif)
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

export interface NouvelHoraire {
  nom: string
  etat: EtatSemaine
  dossier_id: string | null
  modele: boolean
}

export function useCreerHoraire() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['horaire', 'creer'],
    mutationFn: async (h: NouvelHoraire) =>
      ((await verifier(db().from('horaires').insert(h).select('id').single())) as { id: string }).id,
    onSettled: () => client.invalidateQueries({ queryKey: CLES.liste }),
  })
}

/** Renomme une semaine ou la range dans un autre dossier. */
export function useModifierHoraire() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['horaire', 'modifier'],
    mutationFn: ({ id, ...champs }: { id: string; nom?: string; dossier_id?: string | null }) =>
      verifier(db().from('horaires').update(champs).eq('id', id)),
    onSettled: () => client.invalidateQueries({ queryKey: CLES.liste }),
  })
}

/** État enregistré d'un horaire (ex. un modèle, pour en créer une semaine). */
export function useChargerEtat() {
  const client = useQueryClient()
  return useCallback(
    async (id: string) => {
      const etat = completer(
        (
          await client.fetchQuery({
            queryKey: CLES.document(id),
            // Toujours relu : on copie la version enregistrée la plus récente.
            staleTime: 0,
            queryFn: async () => (await verifier(db().from('horaires').select('*').eq('id', id).single())) as Horaire,
          })
        ).etat,
      )
      majJoursListe(client, id, etat.jours)
      return etat
    },
    [client],
  )
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
      majJoursListe(client, cible, aEnvoyer.jours, true)
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
