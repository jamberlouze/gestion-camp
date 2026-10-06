import { useMutation, useMutationState, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { estErreurReseau } from '@/modules/embarcations/donnees'
import { garderPhoto, lirePhoto, oublierPhoto } from './photosLocales'
import type { Categorie, Chantier, Commentaire, Fournisseur, Lieu, Personne, Photo, Tache } from './types'

// ------------------------------------------------------------------
// Fonctionnement hors ligne (comme Embarcations, voir CLAUDE.md)
//
// Signaler, cocher, prendre une tâche, commenter et ajouter une photo
// marchent sans réseau : chaque modification est une mutation à clé fixe,
// définie une fois pour toutes sur le QueryClient (avant la restauration
// du cache), gardée sur l'appareil et rejouée au retour du réseau. Toutes
// partagent la file « travaux » (scope) : elles partent dans l'ordre où
// elles ont été faites (une photo après la tâche qu'elle illustre).
// Le fichier d'une photo attend dans IndexedDB (photosLocales.ts).
//
// Réglages, chantiers et annualisation : en ligne seulement (direction,
// sur ordinateur), erreurs affichées sur place.
// ------------------------------------------------------------------

const RACINE = 'travaux'
const db = () => supabase.schema('travaux')
const SEAU = 'travaux-photos'

export const CLES = {
  taches: [RACINE, 'taches'],
  photos: [RACINE, 'photos'],
  commentaires: [RACINE, 'commentaires'],
  lieux: [RACINE, 'lieux'],
  categories: [RACINE, 'categories'],
  chantiers: [RACINE, 'chantiers'],
  personnes: [RACINE, 'personnes'],
  fournisseurs: [RACINE, 'fournisseurs'],
  creerTache: [RACINE, 'creer-tache'],
  majTache: [RACINE, 'maj-tache'],
  supprimerTache: [RACINE, 'supprimer-tache'],
  ajouterCommentaire: [RACINE, 'ajouter-commentaire'],
  supprimerCommentaire: [RACINE, 'supprimer-commentaire'],
  ajouterPhoto: [RACINE, 'ajouter-photo'],
  supprimerPhoto: [RACINE, 'supprimer-photo'],
} as const

async function executer(requete: PromiseLike<{ error: unknown }>) {
  const { error } = await requete
  if (error) throw error
}

/** Lit toutes les lignes par tranches de 1000 (limite de l'API). */
async function toutLire<T>(tranche: (debut: number, fin: number) => PromiseLike<{ data: unknown; error: unknown }>) {
  const lignes: T[] = []
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await tranche(debut, debut + 999)
    if (error) throw error
    const lot = (data ?? []) as T[]
    lignes.push(...lot)
    if (lot.length < 1000) return lignes
  }
}

// ------------------------------------------------------------------
// Lectures
// ------------------------------------------------------------------

const lister = <T,>(table: string, tri: string) => () =>
  toutLire<T>((a, b) => db().from(table).select('*').order(tri).order('id').range(a, b))

export const useTaches = () => useQuery({ queryKey: CLES.taches, queryFn: lister<Tache>('taches', 'created_at') })
const usePhotos = () => useQuery({ queryKey: CLES.photos, queryFn: lister<Photo>('photos', 'created_at') })
const useCommentaires = () => useQuery({ queryKey: CLES.commentaires, queryFn: lister<Commentaire>('commentaires', 'created_at') })
const useLieux = () => useQuery({ queryKey: CLES.lieux, queryFn: lister<Lieu>('lieux', 'ordre') })
const useCategories = () => useQuery({ queryKey: CLES.categories, queryFn: lister<Categorie>('categories', 'ordre') })
const useChantiers = () => useQuery({ queryKey: CLES.chantiers, queryFn: lister<Chantier>('chantiers', 'created_at') })
const usePersonnes = () =>
  useQuery({
    queryKey: CLES.personnes,
    queryFn: async () => {
      const { data, error } = await db().rpc('personnes')
      if (error) throw error
      return data as Personne[]
    },
  })
/** Fournisseurs de Mastertimeline (liste commune, lue seulement). */
const useFournisseurs = () =>
  useQuery({
    queryKey: CLES.fournisseurs,
    queryFn: async () => {
      const { data, error } = await supabase.schema('mastertimeline').from('fournisseurs').select('id, nom, telephone').order('nom')
      if (error) throw error
      return data as Fournisseur[]
    },
  })

/** Recharge le module quand quelqu'un d'autre modifie quelque chose. */
export function useTempsReel() {
  const client = useQueryClient()
  useEffect(() => {
    const recharger = () => {
      // Pas pendant un envoi : on écraserait l'affichage optimiste. La fin
      // de l'envoi recharge de toute façon.
      if (client.isMutating({ mutationKey: [RACINE] }) === 0) client.invalidateQueries({ queryKey: [RACINE] })
    }
    let canal = supabase.channel(`travaux-${crypto.randomUUID()}`)
    for (const table of ['taches', 'photos', 'commentaires', 'lieux', 'categories', 'chantiers']) {
      canal = canal.on('postgres_changes', { event: '*', schema: 'travaux', table }, recharger)
    }
    canal.subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [client])
}

const parId = <T extends { id: string }>(l: T[] | undefined) => new Map((l ?? []).map((x) => [x.id, x]))
function parTache<T extends { tache_id: string }>(l: T[] | undefined) {
  const m = new Map<string, T[]>()
  for (const x of l ?? []) {
    const liste = m.get(x.tache_id) ?? []
    liste.push(x)
    m.set(x.tache_id, liste)
  }
  return m
}

/** Tout ce qu'affiche le module, indexé par id. */
export function useDonnees() {
  const taches = useTaches().data
  const photos = usePhotos().data
  const commentaires = useCommentaires().data
  const lieux = useLieux().data
  const categories = useCategories().data
  const chantiers = useChantiers().data
  const personnes = usePersonnes().data
  const fournisseurs = useFournisseurs().data
  const erreur = useQueryClient()
    .getQueryCache()
    .findAll({ queryKey: [RACINE] })
    .find((q) => q.state.error && q.state.data === undefined)?.state.error
  const donnees = useMemo(
    () => ({
      taches: taches ?? [],
      lieux: lieux ?? [],
      categories: categories ?? [],
      chantiers: chantiers ?? [],
      personnes: personnes ?? [],
      fournisseurs: fournisseurs ?? [],
      tache: parId(taches),
      lieu: parId(lieux),
      categorie: parId(categories),
      chantier: parId(chantiers),
      personne: parId(personnes),
      fournisseur: parId(fournisseurs),
      photos: parTache(photos),
      commentaires: parTache(commentaires),
      pret: !!(taches && photos && commentaires && lieux && categories && chantiers && personnes && fournisseurs),
    }),
    [taches, photos, commentaires, lieux, categories, chantiers, personnes, fournisseurs],
  )
  return { ...donnees, erreur: erreur ?? null }
}

export type Donnees = ReturnType<typeof useDonnees>

// ------------------------------------------------------------------
// Photos
// ------------------------------------------------------------------

const adressePublique = (chemin: string) => supabase.storage.from(SEAU).getPublicUrl(chemin).data.publicUrl

/** Adresse à afficher : le fichier sur l'appareil s'il attend encore, sinon le seau. */
export function useAdressePhoto(p: Photo) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let annule = false
    let objet: string | null = null
    lirePhoto(p.id).then((b) => {
      if (annule) return
      if (b) {
        objet = URL.createObjectURL(b)
        setUrl(objet)
      } else setUrl(adressePublique(p.chemin))
    })
    return () => {
      annule = true
      if (objet) URL.revokeObjectURL(objet)
    }
  }, [p.id, p.chemin])
  return url
}

// ------------------------------------------------------------------
// État de la synchronisation
// ------------------------------------------------------------------

/** Nombre de modifications pas encore confirmées par la base. */
export function useModificationsEnAttente() {
  return useMutationState({ filters: { mutationKey: [RACINE], status: 'pending' }, select: (m) => m.mutationId }).length
}

// ------------------------------------------------------------------
// Modifications hors ligne
// ------------------------------------------------------------------

export type NouvelleTache = Pick<Tache, 'id' | 'titre'> & Partial<Omit<Tache, 'id' | 'titre' | 'created_at' | 'updated_at'>>
export interface VariablesMaj {
  id: string
  champs: Partial<Omit<Tache, 'id' | 'created_at' | 'updated_at'>>
}
export interface VariablesSuppression {
  id: string
  /** Fichiers de ses photos, retirés du seau. */
  chemins: string[]
}
export type NouveauCommentaire = Pick<Commentaire, 'id' | 'tache_id' | 'texte' | 'auteur'>
export type NouvellePhoto = Pick<Photo, 'id' | 'tache_id' | 'chemin' | 'ajoutee_par'>

/** Ligne déjà en base (envoi refait après une coupure) : rien à faire. */
const sansDoublon = { onConflict: 'id', ignoreDuplicates: true }

export function enregistrerMutationsTravaux(client: QueryClient) {
  const communes = {
    retry: (essais: number, erreur: unknown) => estErreurReseau(erreur) && essais < 1000,
    retryDelay: (essais: number) => Math.min(1000 * 2 ** essais, 30_000),
    scope: { id: RACINE },
  }

  // Mise à jour optimiste d'une ligne ; le contexte ne garde que la ligne
  // d'avant (voir Embarcations).
  interface Contexte<T> {
    cle: readonly string[]
    id: string
    avant: T | null
  }
  function optimiste<T extends { id: string }>(cle: readonly string[], id: string, apres: (ligne: T | null) => T | null) {
    return async (): Promise<Contexte<T>> => {
      await client.cancelQueries({ queryKey: cle })
      const liste = client.getQueryData<T[]>(cle) ?? []
      const avant = liste.find((l) => l.id === id) ?? null
      client.setQueryData<T[]>(cle, remplacer(liste, id, apres(avant)))
      return { cle, id, avant }
    }
  }
  function remplacer<T extends { id: string }>(liste: T[], id: string, ligne: T | null): T[] {
    const sans = liste.filter((l) => l.id !== id)
    if (!ligne) return sans
    return liste.some((l) => l.id === id) ? liste.map((l) => (l.id === id ? ligne : l)) : [...sans, ligne]
  }
  function annuler(_e: unknown, _v: unknown, ctx: Contexte<{ id: string }> | undefined) {
    if (!ctx) return
    client.setQueryData<{ id: string }[]>(ctx.cle, (liste = []) => remplacer(liste, ctx.id, ctx.avant))
  }
  function recharger() {
    if (client.isMutating({ mutationKey: [RACINE] }) <= 1) client.invalidateQueries({ queryKey: [RACINE] })
  }
  const maintenant = () => new Date().toISOString()

  client.setMutationDefaults(CLES.creerTache, {
    ...communes,
    mutationFn: (t: NouvelleTache) => executer(db().from('taches').upsert(t, sansDoublon)),
    onMutate: (t: NouvelleTache) =>
      optimiste<Tache>(CLES.taches, t.id, () => ({
        description: null,
        statut: 'a_trier',
        lieu_id: null,
        categorie_id: null,
        chantier_id: null,
        assigne_a: null,
        priorite: 3,
        echeance: null,
        heures_prevues: null,
        fournisseur_id: null,
        position: null,
        signale_par: null,
        fait_le: null,
        fait_par: null,
        annualisee_vers: null,
        created_at: maintenant(),
        updated_at: maintenant(),
        ...t,
      }))(),
    onError: annuler,
    onSettled: recharger,
  })

  client.setMutationDefaults(CLES.majTache, {
    ...communes,
    mutationFn: ({ id, champs }: VariablesMaj) => executer(db().from('taches').update(champs).eq('id', id)),
    onMutate: ({ id, champs }: VariablesMaj) => optimiste<Tache>(CLES.taches, id, (t) => (t ? { ...t, ...champs } : null))(),
    onError: annuler,
    onSettled: recharger,
  })

  client.setMutationDefaults(CLES.supprimerTache, {
    ...communes,
    mutationFn: async ({ id, chemins }: VariablesSuppression) => {
      await executer(db().from('taches').delete().eq('id', id))
      // Les lignes des photos partent en cascade ; les fichiers, ici.
      if (chemins.length) await supabase.storage.from(SEAU).remove(chemins)
    },
    onMutate: ({ id }: VariablesSuppression) => optimiste<Tache>(CLES.taches, id, () => null)(),
    onError: annuler,
    onSettled: recharger,
  })

  client.setMutationDefaults(CLES.ajouterCommentaire, {
    ...communes,
    mutationFn: (c: NouveauCommentaire) => executer(db().from('commentaires').upsert(c, sansDoublon)),
    onMutate: (c: NouveauCommentaire) =>
      optimiste<Commentaire>(CLES.commentaires, c.id, () => ({ created_at: maintenant(), ...c }))(),
    onError: annuler,
    onSettled: recharger,
  })

  client.setMutationDefaults(CLES.supprimerCommentaire, {
    ...communes,
    mutationFn: (id: string) => executer(db().from('commentaires').delete().eq('id', id)),
    onMutate: (id: string) => optimiste<Commentaire>(CLES.commentaires, id, () => null)(),
    onError: annuler,
    onSettled: recharger,
  })

  client.setMutationDefaults(CLES.ajouterPhoto, {
    ...communes,
    mutationFn: async (p: NouvellePhoto) => {
      const fichier = await lirePhoto(p.id)
      if (fichier) {
        const { error } = await supabase.storage.from(SEAU).upload(p.chemin, fichier, { contentType: 'image/jpeg' })
        // Déjà envoyé avant une coupure : on continue.
        if (error && !/exist|duplicate/i.test(error.message)) throw error
      }
      // Sans fichier sur l'appareil, il a déjà été envoyé (ligne en base ou
      // à créer) ; s'il manque aussi dans le seau, l'image restera vide.
      await executer(db().from('photos').upsert(p, sansDoublon))
      await oublierPhoto(p.id)
    },
    onMutate: (p: NouvellePhoto) => optimiste<Photo>(CLES.photos, p.id, () => ({ created_at: maintenant(), ...p }))(),
    onError: annuler,
    onSettled: recharger,
  })

  client.setMutationDefaults(CLES.supprimerPhoto, {
    ...communes,
    mutationFn: async (p: Pick<Photo, 'id' | 'chemin'>) => {
      await executer(db().from('photos').delete().eq('id', p.id))
      await supabase.storage.from(SEAU).remove([p.chemin])
      await oublierPhoto(p.id)
    },
    onMutate: (p: Pick<Photo, 'id' | 'chemin'>) => optimiste<Photo>(CLES.photos, p.id, () => null)(),
    onError: annuler,
    onSettled: recharger,
  })
}

export const useCreerTache = () => useMutation<void, Error, NouvelleTache>({ mutationKey: CLES.creerTache })
export const useMajTache = () => useMutation<void, Error, VariablesMaj>({ mutationKey: CLES.majTache })
export const useSupprimerTache = () => useMutation<void, Error, VariablesSuppression>({ mutationKey: CLES.supprimerTache })
export const useAjouterCommentaire = () => useMutation<void, Error, NouveauCommentaire>({ mutationKey: CLES.ajouterCommentaire })
export const useSupprimerCommentaire = () => useMutation<void, Error, string>({ mutationKey: CLES.supprimerCommentaire })
export const useSupprimerPhoto = () => useMutation<void, Error, Pick<Photo, 'id' | 'chemin'>>({ mutationKey: CLES.supprimerPhoto })

/**
 * Ajoute une photo à une tâche : le fichier (réduit) est gardé sur
 * l'appareil, puis envoyé par la file hors ligne.
 */
export function useAjouterPhoto() {
  const mutation = useMutation<void, Error, NouvellePhoto>({ mutationKey: CLES.ajouterPhoto })
  return async (tacheId: string, fichier: Blob, auteur: string | null) => {
    const id = crypto.randomUUID()
    await garderPhoto(id, fichier)
    mutation.mutate({ id, tache_id: tacheId, chemin: `${tacheId}/${id}.jpg`, ajoutee_par: auteur })
  }
}

// ------------------------------------------------------------------
// En ligne seulement : réglages, chantiers, annualisation
// ------------------------------------------------------------------

type TableListe = 'lieux' | 'categories' | 'chantiers'

/** Ajoute ou modifie une ligne d'une liste (selon la présence d'un id). */
export async function enregistrerListe<T extends { id?: string }>(table: TableListe, ligne: Partial<T>) {
  const { id, ...reste } = ligne
  const champs = reste as Record<string, unknown>
  await executer(id ? db().from(table).update(champs).eq('id', id) : db().from(table).insert(champs))
}

export async function supprimerListe(table: TableListe, id: string) {
  await executer(db().from(table).delete().eq('id', id))
}

/** Change l'ordre d'une liste : chaque ligne reçoit sa position. */
export async function ordonner(table: 'lieux' | 'categories', ids: string[]) {
  await Promise.all(ids.map((id, i) => executer(db().from(table).update({ ordre: i + 1 }).eq('id', id))))
}

/** Envoie une tâche dans Mastertimeline ; renvoie l'id de la tâche annuelle. */
export async function annualiser(v: { tache: string; mois: number[]; entreprise: string | null; projet: string | null; responsable: string | null }) {
  const { data, error } = await db().rpc('annualiser', {
    p_tache: v.tache,
    p_mois: v.mois,
    p_entreprise: v.entreprise,
    p_projet: v.projet,
    p_responsable: v.responsable,
  })
  if (error) throw error
  return data as string
}

/** Après une modification en ligne : relit le module. */
export function useRelire() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: [RACINE] })
}
