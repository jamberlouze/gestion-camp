import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Compagnie, DocumentPdf, EntreeJournal, Estime, EtageRooming, Ligne, Modele, Prix, Produit, Reglage, Reservation, Responsable, Signature } from './types'

// Module en ligne seulement (networkMode « always »). Modifications
// optimistes ; une modification refusée remet la ligne d'avant et va dans
// le bandeau du module (racine « reservations »). Organisations, contacts,
// échanges et relances : fonctions du CRM (même cache, racine « crm »).

const db = () => supabase.schema('reservations')

/** Recharge une requête à chaque changement fait ailleurs dans une table. */
function useTempsReel(table: string, cle: QueryKey, filtre?: string) {
  const client = useQueryClient()
  const texte = JSON.stringify(cle)
  useEffect(() => {
    const canal = supabase
      .channel(`reservations.${table}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'reservations', table, ...(filtre ? { filter: filtre } : {}) }, () =>
        client.invalidateQueries({ queryKey: JSON.parse(texte) }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [client, table, texte, filtre])
}

/** Table complète (par tranches de 1000). */
function useTable<T>(table: string, tri: string) {
  const cle = ['reservations', table]
  useTempsReel(table, cle)
  return useQuery({
    queryKey: cle,
    queryFn: async () => {
      const lignes: T[] = []
      for (let debut = 0; ; debut += 1000) {
        const { data, error } = await db().from(table).select('*').order(tri).range(debut, debut + 999)
        if (error) throw error
        lignes.push(...(data as T[]))
        if (data.length < 1000) return lignes
      }
    },
  })
}

export const useReservations = () => useTable<Reservation>('reservations', 'date_arrivee')
export const useProduits = () => useTable<Produit>('produits', 'ordre')
export const usePrix = () => useTable<Prix>('prix', 'exercice')
export const useReglages = () => useTable<Reglage>('reglages', 'cle')

/** Estimés d'une réservation et leurs lignes. */
export function useEstimes(reservationId: string) {
  const cle = ['reservations', 'estimes', reservationId]
  useTempsReel('estimes', cle, `reservation_id=eq.${reservationId}`)
  return useQuery({
    queryKey: cle,
    queryFn: async () => {
      const { data, error } = await db().from('estimes').select('*').eq('reservation_id', reservationId).order('version')
      if (error) throw error
      return data as Estime[]
    },
  })
}

export function useLignes(estimeId: string | null) {
  const cle = ['reservations', 'lignes', estimeId]
  useTempsReel('lignes', cle, estimeId ? `estime_id=eq.${estimeId}` : undefined)
  return useQuery({
    queryKey: cle,
    enabled: !!estimeId,
    queryFn: async () => {
      const { data, error } = await db().from('lignes').select('*').eq('estime_id', estimeId!).order('ordre').order('created_at')
      if (error) throw error
      return data as Ligne[]
    },
  })
}

export function useJournal(reservationId: string) {
  const cle = ['reservations', 'journal', reservationId]
  useTempsReel('journal', cle, `reservation_id=eq.${reservationId}`)
  return useQuery({
    queryKey: cle,
    queryFn: async () => {
      const { data, error } = await db().from('journal').select('*').eq('reservation_id', reservationId).order('quand', { ascending: false })
      if (error) throw error
      return data as EntreeJournal[]
    },
  })
}

export function useResponsables() {
  return useQuery({
    queryKey: ['reservations', 'responsables'],
    queryFn: async () => {
      const { data, error } = await db().rpc('responsables')
      if (error) throw error
      return data as Responsable[]
    },
  })
}

/** Lits et chambres par étage (référence de Rooming). */
export function useEtages() {
  return useQuery({
    queryKey: ['reservations', 'etages'],
    queryFn: async () => {
      const { data, error } = await db().rpc('lits_par_etage')
      if (error) throw error
      return data as EtageRooming[]
    },
  })
}

export interface Entreprise {
  id: string
  nom: string
  abreviation: string | null
  couleur: string | null
}

/** Compagnies qui facturent les groupes (référentiel). */
export function useCompagnies() {
  return useQuery({
    queryKey: ['reservations', 'entreprises'],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('core')
        .from('entreprises')
        .select('id, nom, abreviation, couleur')
        .in('nom', ['GBPA+', 'Opikawa'])
        .order('ordre')
      if (error) throw error
      return data as Entreprise[]
    },
  })
}

// ------------------------------------------------------------------
// Modifications
// ------------------------------------------------------------------

type AvecId = { id: string }

function useAjouter<T extends AvecId>(table: string, cle: (l: Partial<T>) => QueryKey) {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reservations', table, 'ajouter'],
    networkMode: 'always',
    mutationFn: async (ligne: Partial<T> & AvecId) => {
      const { error } = await db().from(table).insert(ligne)
      if (error) throw error
    },
    onMutate: async (ligne) => {
      const k = cle(ligne)
      await client.cancelQueries({ queryKey: k })
      client.setQueryData<T[]>(k, (l) => (l ? [...l, ligne as T] : l))
    },
    onError: (_e, ligne) => client.setQueryData<T[]>(cle(ligne), (l) => l?.filter((x) => x.id !== ligne.id)),
    onSettled: (_d, _e, ligne) => client.invalidateQueries({ queryKey: cle(ligne) }),
  })
}

function useModifier<T extends AvecId>(table: string, cle: QueryKey) {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reservations', table, 'modifier'],
    networkMode: 'always',
    mutationFn: async ({ id, champs }: { id: string; champs: Partial<T> }) => {
      const { error } = await db().from(table).update(champs as Record<string, unknown>).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, champs }) => {
      await client.cancelQueries({ queryKey: cle })
      const listes = client.getQueriesData<T[]>({ queryKey: cle })
      client.setQueriesData<T[]>({ queryKey: cle }, (l) => l?.map((x) => (x.id === id ? { ...x, ...champs } : x)))
      return { listes }
    },
    onError: (_e, _v, ctx) => ctx?.listes.forEach(([k, l]) => client.setQueryData(k, l)),
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}

/** Nouvelle réservation : pas d'ajout optimiste, le numéro est donné par la base. */
export function useAjouterReservation() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reservations', 'reservations', 'ajouter'],
    networkMode: 'always',
    mutationFn: async (ligne: Partial<Reservation> & AvecId) => {
      const { data, error } = await db().from('reservations').insert(ligne).select().single()
      if (error) throw error
      return data as Reservation
    },
    onSuccess: (r) => client.setQueryData<Reservation[]>(['reservations', 'reservations'], (l) => (l ? [...l.filter((x) => x.id !== r.id), r] : l)),
    onSettled: () => client.invalidateQueries({ queryKey: ['reservations', 'reservations'] }),
  })
}
export const useModifierReservation = () => useModifier<Reservation>('reservations', ['reservations', 'reservations'])
export function useSupprimerReservation() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reservations', 'reservations', 'supprimer'],
    networkMode: 'always',
    mutationFn: async (id: string) => {
      const { error } = await db().from('reservations').delete().eq('id', id)
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['reservations', 'reservations'] }),
  })
}

export const useModifierEstime = () => useModifier<Estime>('estimes', ['reservations', 'estimes'])
export const useAjouterJournal = () => useAjouter<EntreeJournal>('journal', (l) => ['reservations', 'journal', l.reservation_id])

export const useModifierProduit = () => useModifier<Produit>('produits', ['reservations', 'produits'])
export const useAjouterProduit = () => useAjouter<Produit>('produits', () => ['reservations', 'produits'])

/** Prix d'un produit pour un exercice (ajouté ou remplacé). */
export function useEnregistrerPrix() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reservations', 'prix', 'enregistrer'],
    networkMode: 'always',
    mutationFn: async (p: Prix) => {
      const { error } = await db().from('prix').upsert(p, { onConflict: 'produit_id,exercice' })
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['reservations', 'prix'] }),
  })
}

export function useEnregistrerReglage() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reservations', 'reglages', 'enregistrer'],
    networkMode: 'always',
    mutationFn: async ({ cle, valeur }: { cle: string; valeur: unknown }) => {
      const { error } = await db().from('reglages').upsert({ cle, valeur }, { onConflict: 'cle' })
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['reservations', 'reglages'] }),
  })
}

export interface LigneAEcrire {
  id: string
  ordre: number
  produit_id: string | null
  code: string | null
  description: string
  note: string | null
  quantite: number
  prix_unitaire: number
  pourcentage: number | null
  montant: number
  auto: boolean
}

/** Enregistre un brouillon d'estimé d'un coup (lignes remplacées, totaux), en une transaction. */
export function useEnregistrerEstime() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reservations', 'estimes', 'enregistrer'],
    networkMode: 'always',
    mutationFn: async (v: {
      estime: Pick<Estime, 'id' | 'reservation_id' | 'version' | 'exercice_prix' | 'sous_total' | 'tps' | 'tvq' | 'total' | 'notes'>
      lignes: LigneAEcrire[]
    }) => {
      const { error } = await db().rpc('enregistrer_estime', { p_estime: v.estime, p_lignes: v.lignes })
      if (error) throw error
    },
    onSettled: (_d, _e, v) => {
      client.invalidateQueries({ queryKey: ['reservations', 'estimes', v.estime.reservation_id] })
      client.invalidateQueries({ queryKey: ['reservations', 'lignes', v.estime.id] })
      client.invalidateQueries({ queryKey: ['reservations', 'reservations'] })
    },
  })
}

/** Envoyer, accepter, refuser un estimé, ou en faire une nouvelle version (renvoie l'id de l'estimé). */
export function useChangerEstime() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reservations', 'estimes', 'changer'],
    networkMode: 'always',
    mutationFn: async (v: { estime: Estime; action: 'envoyer' | 'accepter' | 'refuser' | 'nouvelle_version' }) => {
      const { data, error } = await db().rpc('changer_estime', { p_estime: v.estime.id, p_action: v.action })
      if (error) throw error
      return data as string
    },
    onSettled: (_d, _e, v) => {
      client.invalidateQueries({ queryKey: ['reservations', 'estimes', v.estime.reservation_id] })
      client.invalidateQueries({ queryKey: ['reservations', 'reservations'] })
      client.invalidateQueries({ queryKey: ['reservations', 'journal', v.estime.reservation_id] })
    },
  })
}

// ------------------------------------------------------------------
// Documents (phase 2)
// ------------------------------------------------------------------

export const useCompagniesFacture = () => useTable<Compagnie>('compagnies', 'nom_court')
export const useModeles = () => useTable<Modele>('modeles', 'genre')

export function useDocuments(reservationId: string) {
  const cle = ['reservations', 'documents', reservationId]
  useTempsReel('documents', cle, `reservation_id=eq.${reservationId}`)
  return useQuery({
    queryKey: cle,
    queryFn: async () => {
      const { data, error } = await db().from('documents').select('*').eq('reservation_id', reservationId).order('cree_le', { ascending: false })
      if (error) throw error
      return data as DocumentPdf[]
    },
  })
}

export function useSignatures(reservationId: string) {
  const cle = ['reservations', 'signatures', reservationId]
  useTempsReel('signatures', cle, `reservation_id=eq.${reservationId}`)
  return useQuery({
    queryKey: cle,
    queryFn: async () => {
      const { data, error } = await db().from('signatures').select('*').eq('reservation_id', reservationId).order('envoye_le', { ascending: false })
      if (error) throw error
      return data as Signature[]
    },
  })
}

export function useModifierCompagnie() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reservations', 'compagnies', 'modifier'],
    networkMode: 'always',
    mutationFn: async ({ id, champs }: { id: string; champs: Partial<Compagnie> }) => {
      const { error } = await db().from('compagnies').update(champs).eq('entreprise_id', id)
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['reservations', 'compagnies'] }),
  })
}

export const useModifierModele = () => useModifier<Modele>('modeles', ['reservations', 'modeles'])
