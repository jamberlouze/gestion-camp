import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRelances } from '@/modules/crm/donnees'
import type { Signaux } from './actions'
import type { CleCalendrier } from './agenda'
import type { Decisions } from './confirmation'
import type {
  Compagnie,
  ConfirmationClient,
  Courriel,
  DemandeRecue,
  DocumentPdf,
  EntreeJournal,
  Estime,
  EtageRooming,
  Facture,
  FicheParticipant,
  LienFormulaire,
  Ligne,
  Modele,
  ModeleCourriel,
  NoteReservation,
  Prix,
  Produit,
  QboConnexion,
  QboDevis,
  Reglage,
  Reservation,
  Responsable,
  Signature,
  TotauxFiches,
} from './types'

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
/** Demandes reçues par le formulaire public (une par réservation). */
export const useDemandes = () => useTable<DemandeRecue>('demandes', 'recue_le')

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

/** Ce qu'on écrit d'un prix : seulement les champs donnés (auteur, dates et statut d'un prix changé : la base). */
export type PrixAEcrire = Pick<Prix, 'produit_id' | 'exercice'> & Partial<Pick<Prix, 'prix' | 'cout' | 'marge' | 'valide' | 'repli' | 'hausse_pct'>>

/** Prix d'un produit pour un exercice (ajouté ou modifié), validation comprise. Optimiste. */
export function useEnregistrerPrix() {
  const client = useQueryClient()
  const cle = ['reservations', 'prix']
  return useMutation({
    mutationKey: ['reservations', 'prix', 'enregistrer'],
    networkMode: 'always',
    // Mise à jour d'abord, ajout sinon : un upsert vérifierait la ligne à ajouter
    // (prix vide + « validé » refusé) avant de voir qu'elle existe déjà.
    mutationFn: async (p: PrixAEcrire) => {
      const { produit_id, exercice, ...champs } = p
      const { data, error } = await db().from('prix').update(champs).eq('produit_id', produit_id).eq('exercice', exercice).select('produit_id')
      if (error) throw error
      if (data.length) return
      const ajout = await db().from('prix').insert(p)
      if (ajout.error) throw ajout.error
    },
    onMutate: async (p) => {
      await client.cancelQueries({ queryKey: cle })
      const avant = client.getQueryData<Prix[]>(cle)
      const change = 'prix' in p || 'cout' in p || 'marge' in p
      client.setQueryData<Prix[]>(cle, (l) => {
        if (!l) return l
        const x = l.find((y) => y.produit_id === p.produit_id && y.exercice === p.exercice)
        if (!x)
          return [
            ...l,
            { prix: null, cout: null, marge: null, valide: false, valide_le: null, valide_par_nom: null, modifie_le: new Date().toISOString(), modifie_par_nom: null, repli: null, hausse_pct: null, ...p },
          ]
        return l.map((y) => (y === x ? { ...y, ...p, ...(change && !('valide' in p) ? { valide: false } : {}) } : y))
      })
      return { avant }
    },
    onError: (_e, _p, ctx) => ctx?.avant && client.setQueryData(cle, ctx.avant),
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}

/** Prépare la liste d'un exercice : une ligne vide et à valider par produit, repli sur l'exercice d'avant. */
export function usePreparerExercice() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reservations', 'prix', 'preparer'],
    networkMode: 'always',
    mutationFn: async (exercice: number) => {
      const { data, error } = await db().rpc('preparer_exercice', { p_exercice: exercice })
      if (error) throw error
      return data as number
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['reservations', 'prix'] }),
  })
}

/**
 * Plusieurs prix d'un coup (« Appliquer ce % aux lignes affichées », et son
 * annulation) : un seul envoi ; chaque ligne porte les mêmes champs.
 */
export function useEnregistrerPrixLot() {
  const client = useQueryClient()
  const cle = ['reservations', 'prix']
  return useMutation({
    mutationKey: ['reservations', 'prix', 'lot'],
    networkMode: 'always',
    mutationFn: async (lignes: Required<Pick<Prix, 'produit_id' | 'exercice' | 'prix' | 'cout' | 'marge' | 'hausse_pct' | 'repli'>>[]) => {
      if (!lignes.length) return
      const { error } = await db().from('prix').upsert(lignes, { onConflict: 'produit_id,exercice', defaultToNull: false })
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
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
      /** Prix provisoires utilisés (code → exercice du prix pris), gardés avec l'estimé. */
      prix_provisoires?: Record<string, number>
    }) => {
      const { error } = await db().rpc('enregistrer_estime', { p_estime: v.estime, p_lignes: v.lignes })
      if (error) throw error
      if (v.prix_provisoires) {
        const r = await db().from('estimes').update({ prix_provisoires: v.prix_provisoires }).eq('id', v.estime.id)
        if (r.error) throw r.error
      }
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
    // Une à la fois, dans l'ordre : la dernière modification gagne.
    scope: { id: 'reservations-compagnies' },
    mutationFn: async ({ id, champs }: { id: string; champs: Partial<Compagnie> }) => {
      const { error } = await db().from('compagnies').update(champs).eq('entreprise_id', id)
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['reservations', 'compagnies'] }),
  })
}

export const useModifierModele = () => useModifier<Modele>('modeles', ['reservations', 'modeles'])

// ------------------------------------------------------------------
// Phase 3 : demandes du formulaire, liens, fiches participants
// ------------------------------------------------------------------

/** Relier une demande du formulaire au CRM (organisation choisie ou créée, contacts). */
export function useValiderDemande() {
  const client = useQueryClient()
  return useMutation({
    // Erreur affichée sur place (DemandeRecue), pas dans le bandeau.
    mutationKey: ['reservations-local', 'demandes', 'valider'],
    networkMode: 'always',
    mutationFn: async (v: { demande: string; organisation: string | null; genre: string | null }) => {
      const { error } = await db().rpc('valider_demande', { p_demande: v.demande, p_organisation: v.organisation, p_genre: v.genre })
      if (error) throw error
    },
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['reservations', 'demandes'] }),
        client.invalidateQueries({ queryKey: ['reservations', 'reservations'] }),
        client.invalidateQueries({ queryKey: ['crm'] }),
      ]),
  })
}

/** Nouveau lien secret (page client ou fiches) : l'ancien ne fonctionne plus. */
export function useNouveauLien() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reservations', 'reservations', 'nouveau-lien'],
    networkMode: 'always',
    mutationFn: async (v: { reservation: string; genre: 'client' | 'fiches' }) => {
      const { error } = await db().rpc('nouveau_lien', { p_reservation: v.reservation, p_genre: v.genre })
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['reservations', 'reservations'] }),
  })
}

/** Totaux des fiches (sans nom), pour toute personne qui voit le module. */
export function useTotauxFiches(reservationId: string) {
  return useQuery({
    queryKey: ['reservations', 'totaux-fiches', reservationId],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await db().rpc('totaux_fiches', { p_reservation: reservationId })
      if (error) throw error
      return data as TotauxFiches | null
    },
  })
}

/**
 * Fiches d'une réservation (données de santé) : seulement avec l'accès
 * reservations_sante. Racine « reservations-sante » : jamais gardée sur
 * l'appareil (voir src/lib/requetes.ts).
 */
export function useFiches(reservationId: string, actif: boolean) {
  return useQuery({
    queryKey: ['reservations-sante', reservationId],
    enabled: actif,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await db().from('fiches').select('*').eq('reservation_id', reservationId).order('nom').order('prenom')
      if (error) throw error
      return data as FicheParticipant[]
    },
  })
}

export function useSupprimerFiche() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reservations-sante', 'supprimer'],
    networkMode: 'always',
    mutationFn: async (id: string) => {
      const { error } = await db().from('fiches').delete().eq('id', id)
      if (error) throw error
    },
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['reservations-sante'] }),
        client.invalidateQueries({ queryKey: ['reservations', 'totaux-fiches'] }),
      ]),
  })
}

// ------------------------------------------------------------------
// Phase 4 : QuickBooks Online (tout passe par le Worker, /api/qbo/*)
// ------------------------------------------------------------------

/** Appel au Worker QBO avec la session ; lève une erreur lisible. */
export const appelerQbo = <T = unknown>(chemin: string, corps?: unknown) => appelerWorker<T>(`/api/qbo/${chemin}`, corps)

/** Route de l'équipe du Worker (jeton de session) : QBO, courriels. */
export async function appelerWorker<T = unknown>(adresse: string, corps?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const jeton = data.session?.access_token
  if (!jeton) throw new Error('Session expirée : reconnectez-vous.')
  let res: Response
  try {
    res = await fetch(adresse, {
      method: corps === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    })
  } catch {
    throw new Error('Le serveur de l’app ne répond pas (Worker).')
  }
  if (!res.ok) {
    let message = `Erreur ${res.status}.`
    try {
      const j = await res.json()
      if (j?.erreur) message = String(j.erreur)
    } catch {
      if (res.status === 404) message = 'Le Worker ne répond pas à cette adresse (l’app est-elle à jour ?).'
    }
    throw new Error(message)
  }
  return (res.headers.get('content-type')?.includes('application/pdf') ? res.blob() : res.json()) as Promise<T>
}

/** QBO configuré dans le Worker (secrets de l'app Intuit) ? */
export function useQboConfiguration() {
  return useQuery({
    queryKey: ['reservations', 'qbo-configuration'],
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () => appelerQbo<{ configure: boolean; environnement: 'sandbox' | 'production' }>('etat'),
  })
}

/** Connexions des compagnies à leur dossier QBO (sans les jetons). */
export function useQboConnexions() {
  return useQuery({
    queryKey: ['reservations', 'qbo-connexions'],
    queryFn: async () => {
      const { data, error } = await db().rpc('qbo_etat')
      if (error) throw error
      return data as QboConnexion[]
    },
  })
}

export function useQboDevis(reservationId: string) {
  const cle = ['reservations', 'qbo_devis', reservationId]
  useTempsReel('qbo_devis', cle, `reservation_id=eq.${reservationId}`)
  return useQuery({
    queryKey: cle,
    queryFn: async () => {
      const { data, error } = await db().from('qbo_devis').select('*').eq('reservation_id', reservationId).maybeSingle()
      if (error) throw error
      return data as QboDevis | null
    },
  })
}

export function useFactures(reservationId: string) {
  const cle = ['reservations', 'factures', reservationId]
  useTempsReel('factures', cle, `reservation_id=eq.${reservationId}`)
  return useQuery({
    queryKey: cle,
    queryFn: async () => {
      const { data, error } = await db().from('factures').select('*').eq('reservation_id', reservationId).order('date_facture').order('numero')
      if (error) throw error
      return data as Facture[]
    },
  })
}

/** Action QBO (devis, facture séparée, note de crédit, synchro) : relit ce qui change. */
export function useActionQbo<V, R = unknown>(chemin: string) {
  const client = useQueryClient()
  return useMutation({
    // Erreurs affichées sur place, pas dans le bandeau.
    mutationKey: ['reservations-local', 'qbo', chemin],
    networkMode: 'always',
    mutationFn: (v: V) => appelerQbo<R>(chemin, v),
    onSettled: () =>
      Promise.all(
        [['reservations', 'qbo_devis'], ['reservations', 'factures'], ['reservations', 'qbo-connexions'], ['crm']].map((queryKey) => client.invalidateQueries({ queryKey })),
      ),
  })
}

// ------------------------------------------------------------------
// Courriels aux clients (phase 5)
// ------------------------------------------------------------------

export const useModelesCourriels = () => useTable<ModeleCourriel>('modeles_courriels', 'genre')

export function useCourriels(reservationId: string) {
  const cle = ['reservations', 'courriels', reservationId]
  useTempsReel('courriels', cle, `reservation_id=eq.${reservationId}`)
  return useQuery({
    queryKey: cle,
    queryFn: async () => {
      const { data, error } = await db().from('courriels').select('*').eq('reservation_id', reservationId).order('prepare_le')
      if (error) throw error
      return data as Courriel[]
    },
  })
}

/** Courriels préparés de toutes les réservations (à approuver), puis les derniers envoyés. */
export function useCourrielsOnglet() {
  const cle = ['reservations', 'courriels', 'onglet']
  useTempsReel('courriels', cle)
  return useQuery({
    queryKey: cle,
    queryFn: async () => {
      const choix = '*, reservation:reservations(numero, nom)'
      const [prepares, envoyes] = await Promise.all([
        db().from('courriels').select(choix).eq('statut', 'prepare').order('prepare_le'),
        db().from('courriels').select(choix).eq('statut', 'envoye').order('envoye_le', { ascending: false }).limit(40),
      ])
      if (prepares.error) throw prepares.error
      if (envoyes.error) throw envoyes.error
      return { prepares: prepares.data as Courriel[], envoyes: envoyes.data as Courriel[] }
    },
  })
}

/** Destinataires, sujet, texte d'un courriel préparé, ou son annulation (erreurs affichées sur place). */
export function useModifierCourriel() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reservations-local', 'courriels', 'modifier'],
    networkMode: 'always',
    mutationFn: async ({ id, champs }: { id: string; champs: Partial<Pick<Courriel, 'a' | 'cc' | 'sujet' | 'corps' | 'statut' | 'raison'>> }) => {
      const { error } = await db().from('courriels').update(champs).eq('id', id).eq('statut', 'prepare')
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['reservations', 'courriels'] }),
  })
}

export function useModifierModeleCourriel() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reservations-local', 'modeles_courriels', 'modifier'],
    networkMode: 'always',
    mutationFn: async ({ genre, champs }: { genre: string; champs: Partial<Omit<ModeleCourriel, 'genre'>> }) => {
      const { error } = await db().from('modeles_courriels').update(champs).eq('genre', genre)
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['reservations', 'modeles_courriels'] }),
  })
}

export type ModeEnvoi = 'mailpit' | 'gmail' | 'bloque' | 'non_configure'

/** Prépare tout de suite les courriels dus (une réservation, ou toutes). */
export const preparerCourriels = (reservation?: string) =>
  appelerWorker<{ prepares: number; annules: number; envoi: ModeEnvoi }>('/api/reservations/preparer', reservation ? { reservation } : {})

/** Envoi d'un courriel préparé par le Worker (inscriptions@ ; Mailpit en DEV). */
export function useEnvoyerCourriel() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reservations-local', 'courriels', 'envoyer'],
    networkMode: 'always',
    mutationFn: (id: string) => appelerWorker<{ ok: boolean; mode: ModeEnvoi }>('/api/reservations/envoyer', { courriel: id }),
    onSettled: () =>
      Promise.all([['reservations', 'courriels'], ['reservations', 'journal'], ['crm']].map((queryKey) => client.invalidateQueries({ queryKey }))),
  })
}

// ------------------------------------------------------------------
// Google Agenda et Airbnb (phase 6)
// ------------------------------------------------------------------

export interface LigneAgendaApp {
  reservation_id: string
  calendrier: CleCalendrier | null
  google_id: string | null
  synchronise_le: string | null
  erreur: string | null
}

export function useAgenda(reservationId: string) {
  const cle = ['reservations', 'agenda', reservationId]
  useTempsReel('agenda', cle, `reservation_id=eq.${reservationId}`)
  return useQuery({
    queryKey: cle,
    queryFn: async () => {
      const { data, error } = await db().from('agenda').select('reservation_id,calendrier,google_id,synchronise_le,erreur').eq('reservation_id', reservationId).maybeSingle()
      if (error) throw error
      return data as LigneAgendaApp | null
    },
  })
}

export type ModeAgenda = 'simule' | 'google' | 'non_configure'

/** Calendriers Google à jour tout de suite (une réservation, ou toutes). */
export const synchroniserAgenda = (reservation?: string) =>
  appelerWorker<{ actif: boolean; mode: ModeAgenda; faites: number; restantes: number; erreur?: string }>('/api/reservations/agenda', reservation ? { reservation } : {})

/** Lecture des iCal d'Airbnb tout de suite. */
export const lireAirbnb = () =>
  appelerWorker<{ quand: string; annonces: Record<string, { reservations: number; ajoutees: number; modifiees: number; annulees: number }>; erreurs: string[] }>('/api/reservations/airbnb', {})

/**
 * Contrats signés sans aucun paiement reçu : relances « paiement » échues
 * (posées par la base à la signature, fermées au premier paiement), par réservation.
 */
export function useAlertesPaiement(auj: string) {
  const relances = useRelances()
  return new Set(
    (relances.data ?? [])
      .filter((x) => x.reservation_id && x.statut === 'a_faire' && x.source_cle?.endsWith(':paiement') && x.echeance <= auj)
      .map((x) => x.reservation_id!),
  )
}

// ------------------------------------------------------------------
// Rapports (phase 7)
// ------------------------------------------------------------------

/** Revenus mensuels des exercices d'avant l'app (référence importée du Sheets). */
export function useHistoriqueMensuel() {
  return useQuery({
    queryKey: ['reservations', 'historique_mensuel'],
    queryFn: async () => {
      const { data, error } = await db().from('historique_mensuel').select('exercice,mois,montant')
      if (error) throw error
      return data as { exercice: number; mois: number; montant: number }[]
    },
    staleTime: Infinity,
  })
}

/** Toutes les factures QBO connues (signé, facturé, encaissé). */
export function useToutesFactures() {
  const cle = ['reservations', 'factures', 'toutes']
  useTempsReel('factures', cle)
  return useQuery({
    queryKey: cle,
    queryFn: async () => {
      const lignes: Pick<Facture, 'reservation_id' | 'qbo_type' | 'total' | 'solde' | 'supprimee'>[] = []
      for (let debut = 0; ; debut += 1000) {
        const { data, error } = await db().from('factures').select('reservation_id,qbo_type,total,solde,supprimee').order('id').range(debut, debut + 999)
        if (error) throw error
        lignes.push(...(data as typeof lignes))
        if (data.length < 1000) return lignes
      }
    },
  })
}

/**
 * Total taxes comprises de l'estimé accepté le plus récent de chaque
 * réservation ({ réservation: total }). Objet simple, pas un Map : le cache
 * est gardé dans le navigateur (JSON).
 */
export function useTotauxAcceptes() {
  const cle = ['reservations', 'estimes', 'acceptes']
  useTempsReel('estimes', cle)
  return useQuery({
    queryKey: cle,
    queryFn: async () => {
      const totaux: Record<string, number> = {}
      const versions: Record<string, number> = {}
      for (let debut = 0; ; debut += 1000) {
        const { data, error } = await db().from('estimes').select('reservation_id,version,total').eq('statut', 'accepte').order('id').range(debut, debut + 999)
        if (error) throw error
        for (const e of data as { reservation_id: string; version: number; total: number }[]) {
          if ((versions[e.reservation_id] ?? -1) < e.version) {
            versions[e.reservation_id] = e.version
            totaux[e.reservation_id] = Number(e.total)
          }
        }
        if (data.length < 1000) return totaux
      }
    },
  })
}

// ------------------------------------------------------------------
// Confirmation des informations par le client (pré-arrivée)
// ------------------------------------------------------------------

/** Confirmations et demandes de changement d'une réservation (les plus récentes d'abord). */
export function useConfirmations(reservationId: string) {
  const cle = ['reservations', 'confirmations', reservationId]
  useTempsReel('confirmations', cle, `reservation_id=eq.${reservationId}`)
  return useQuery({
    queryKey: cle,
    queryFn: async () => {
      const { data, error } = await db().from('confirmations').select('*').eq('reservation_id', reservationId).order('recue_le', { ascending: false })
      if (error) throw error
      return data as ConfirmationClient[]
    },
  })
}

/** Réservations qui ont une demande de changement du client à accepter ou refuser (liste). */
export function useChangementsATraiter() {
  const cle = ['reservations', 'confirmations', 'a_traiter']
  useTempsReel('confirmations', cle)
  const q = useQuery({
    queryKey: cle,
    queryFn: async () => {
      const { data, error } = await db().from('confirmations').select('reservation_id').eq('statut', 'a_traiter')
      if (error) throw error
      return (data as { reservation_id: string }[]).map((x) => x.reservation_id)
    },
  })
  return new Set(q.data ?? [])
}

/** Accepter (le séjour est mis à jour) ou refuser une demande de changement ; erreurs affichées sur place. */
export function useTraiterChangement() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reservations-local', 'confirmations', 'traiter'],
    networkMode: 'always',
    mutationFn: async (v: { id: string; accepter: boolean; reponse: string }) => {
      const { error } = await db().rpc('traiter_changement', { p_confirmation: v.id, p_accepter: v.accepter, p_reponse: v.reponse })
      if (error) throw error
    },
    onSettled: () =>
      Promise.all(
        [['reservations', 'confirmations'], ['reservations', 'reservations'], ['reservations', 'journal'], ['crm']].map((queryKey) => client.invalidateQueries({ queryKey })),
      ),
  })
}

/**
 * Décision ligne par ligne (réunion du 2026-10-21) : seuls les champs
 * acceptés vont au séjour ; un refus = message et appel au client. Erreurs
 * affichées sur place.
 */
export function useDeciderChangement() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reservations-local', 'confirmations', 'decider'],
    networkMode: 'always',
    mutationFn: async (v: { id: string; decisions: Decisions; reponse: string; clientAppele: boolean | null }) => {
      const { error } = await db().rpc('decider_changement', {
        p_confirmation: v.id,
        p_decisions: v.decisions,
        p_reponse: v.reponse,
        p_client_appele: v.clientAppele,
      })
      if (error) throw error
    },
    onSettled: () =>
      Promise.all(
        [['reservations', 'confirmations'], ['reservations', 'reservations'], ['reservations', 'journal'], ['crm']].map((queryKey) => client.invalidateQueries({ queryKey })),
      ),
  })
}

/** Ce qui demande une action (point rouge de la liste, compte de l'onglet, accueil). */
export function useSignauxActions(auj: string): Signaux {
  const relances = useRelances()
  // Changement refusé : la relance « appeler le client » (decider_changement) tant qu'elle n'est pas faite.
  const appels = new Set(
    (relances.data ?? []).filter((x) => x.reservation_id && x.statut === 'a_faire' && x.source_cle?.startsWith('appel:')).map((x) => x.reservation_id!),
  )
  return { changements: useChangementsATraiter(), sansPaiement: useAlertesPaiement(auj), appels }
}

// ------------------------------------------------------------------
// Notes de l'équipe (haut de la fiche)
// ------------------------------------------------------------------

/** Notes d'une réservation, les plus récentes d'abord. */
export function useNotesReservation(reservationId: string) {
  const cle = ['reservations', 'notes', reservationId]
  useTempsReel('notes', cle, `reservation_id=eq.${reservationId}`)
  return useQuery({
    queryKey: cle,
    queryFn: async () => {
      const { data, error } = await db().from('notes').select('*').eq('reservation_id', reservationId).order('cree_le', { ascending: false })
      if (error) throw error
      return data as NoteReservation[]
    },
  })
}

/** Ajout d'une note : affichée tout de suite, signée et datée par la base. */
export function useAjouterNote() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reservations', 'notes', 'ajouter'],
    networkMode: 'always',
    mutationFn: async (n: NoteReservation) => {
      const { error } = await db().from('notes').insert({ id: n.id, reservation_id: n.reservation_id, texte: n.texte })
      if (error) throw error
    },
    onMutate: async (n) => {
      const cle = ['reservations', 'notes', n.reservation_id]
      await client.cancelQueries({ queryKey: cle })
      client.setQueryData<NoteReservation[]>(cle, (l) => (l ? [n, ...l] : l))
    },
    onError: (_e, n) => client.setQueryData<NoteReservation[]>(['reservations', 'notes', n.reservation_id], (l) => l?.filter((x) => x.id !== n.id)),
    onSettled: (_d, _e, n) => client.invalidateQueries({ queryKey: ['reservations', 'notes', n.reservation_id] }),
  })
}

export const useModifierNote = () => useModifier<NoteReservation>('notes', ['reservations', 'notes'])

export function useRetirerNote() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reservations', 'notes', 'retirer'],
    networkMode: 'always',
    mutationFn: async (n: Pick<NoteReservation, 'id' | 'reservation_id'>) => {
      const { error } = await db().from('notes').delete().eq('id', n.id)
      if (error) throw error
    },
    onSettled: (_d, _e, n) => client.invalidateQueries({ queryKey: ['reservations', 'notes', n.reservation_id] }),
  })
}

// ------------------------------------------------------------------
// Lien du formulaire d'une organisation (/demande?lien=<jeton>)
// ------------------------------------------------------------------

export function useLienFormulaire(organisationId: string | null) {
  const cle = ['reservations', 'liens_formulaire', organisationId]
  useTempsReel('liens_formulaire', cle, organisationId ? `organisation_id=eq.${organisationId}` : undefined)
  return useQuery({
    queryKey: cle,
    enabled: !!organisationId,
    queryFn: async () => {
      const { data, error } = await db().from('liens_formulaire').select('*').eq('organisation_id', organisationId!).maybeSingle()
      if (error) throw error
      return data as LienFormulaire | null
    },
  })
}

/** Créer (ou reprendre), refaire (l'ancien ne marche plus) ou retirer le lien ; rend le jeton. */
export function useChangerLienFormulaire() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['reservations-local', 'liens_formulaire', 'changer'],
    networkMode: 'always',
    mutationFn: async (v: { organisation: string; action: 'creer' | 'refaire' | 'retirer' }) => {
      const { data, error } = await db().rpc('lien_organisation', { p_organisation: v.organisation, p_action: v.action })
      if (error) throw error
      return data as string | null
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['reservations', 'liens_formulaire'] }),
  })
}
