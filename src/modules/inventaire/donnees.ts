import { useMutation, useMutationState, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { useListe } from '@/lib/donnees'
import { supabase } from '@/lib/supabase'
import { estErreurReseau } from '@/modules/embarcations/donnees'
import { historiques } from './outils'
import type { Article, ChampsArticle, ChampsCompte, Compagnie, Compte, Lieu, Section } from './types'

// ------------------------------------------------------------------
// Fonctionnement hors ligne (comme Embarcations, voir CLAUDE.md)
//
// Compter, ajouter un article et modifier sa fiche marchent sans réseau :
// chaque modification est une mutation à clé fixe, définie une fois pour
// toutes sur le QueryClient (avant la restauration du cache), gardée sur
// l'appareil et rejouée au retour du réseau. Toutes partagent la file
// « inventaire » (scope) : un article créé sur place part avant ses nombres.
// Un compte n'envoie que les champs touchés (upsert) : deux personnes qui
// comptent le même article ne s'écrasent pas.
//
// Sections et lieux : en ligne seulement, erreurs affichées sur place.
// ------------------------------------------------------------------

const RACINE = 'inventaire'
const db = () => supabase.schema('inventaire')

export const CLES = {
  sections: [RACINE, 'sections'],
  lieux: [RACINE, 'lieux'],
  articles: [RACINE, 'articles'],
  comptes: [RACINE, 'comptes'],
  compter: [RACINE, 'compter'],
  supprimerCompte: [RACINE, 'supprimer-compte'],
  creerArticle: [RACINE, 'creer-article'],
  majArticle: [RACINE, 'maj-article'],
  supprimerArticle: [RACINE, 'supprimer-article'],
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

const lister = <T,>(table: string, tri: string, depart: string) => () =>
  toutLire<T>((a, b) => db().from(table).select('*').order(tri).order(depart).range(a, b))

const useSections = () => useQuery({ queryKey: CLES.sections, queryFn: lister<Section>('sections', 'ordre', 'id') })
const useLieux = () => useQuery({ queryKey: CLES.lieux, queryFn: lister<Lieu>('lieux', 'ordre', 'id') })
const useArticles = () => useQuery({ queryKey: CLES.articles, queryFn: lister<Article>('articles', 'ordre', 'id') })
const useComptes = () => useQuery({ queryKey: CLES.comptes, queryFn: lister<Compte>('comptes', 'jour', 'article_id') })

/** Recharge le module quand quelqu'un d'autre modifie quelque chose. */
export function useTempsReel() {
  const client = useQueryClient()
  useEffect(() => {
    const recharger = () => {
      // Pas pendant un envoi : on écraserait l'affichage optimiste. La fin
      // de l'envoi recharge de toute façon.
      if (client.isMutating({ mutationKey: [RACINE] }) === 0) client.invalidateQueries({ queryKey: [RACINE] })
    }
    let canal = supabase.channel(`inventaire-${crypto.randomUUID()}`)
    for (const table of ['sections', 'lieux', 'articles', 'comptes']) {
      canal = canal.on('postgres_changes', { event: '*', schema: 'inventaire', table }, recharger)
    }
    canal.subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [client])
}

const parId = <T extends { id: string }>(l: T[]) => new Map(l.map((x) => [x.id, x]))

/** Tout ce qu'affiche le module, indexé. */
export function useDonnees() {
  const sections = useSections().data
  const lieux = useLieux().data
  const articles = useArticles().data
  const comptes = useComptes().data
  // Compagnies du référentiel (core.entreprises), lues par toute personne active.
  const compagnies = useListe<Compagnie>('core', 'entreprises', 'ordre').data
  const erreur = useQueryClient()
    .getQueryCache()
    .findAll({ queryKey: [RACINE] })
    .find((q) => q.state.error && q.state.data === undefined)?.state.error
  const donnees = useMemo(() => {
    const s = sections ?? []
    const l = lieux ?? []
    const a = articles ?? []
    const cp = compagnies ?? []
    const h = historiques(comptes ?? [])
    return {
      sections: s,
      lieux: l,
      articles: a,
      compagnies: cp,
      section: parId(s),
      lieu: parId(l),
      article: parId(a),
      compagnie: parId(cp),
      /** Comptes d'un article, du plus récent au plus ancien. */
      historique: (id: string) => h.get(id) ?? [],
      pret: !!(sections && lieux && articles && comptes && compagnies),
    }
  }, [sections, lieux, articles, comptes, compagnies])
  return { ...donnees, erreur: erreur ?? null }
}

export type Donnees = ReturnType<typeof useDonnees>

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

export interface VariablesCompte {
  article_id: string
  /** Jour de l'inventaire (AAAA-MM-JJ). */
  jour: string
  /** Seulement les champs touchés. */
  champs: ChampsCompte
}
export type CleCompte = Pick<Compte, 'article_id' | 'jour'>
export type NouvelArticle = Pick<Article, 'id' | 'nom'> & Partial<Omit<Article, 'id' | 'nom' | 'created_at' | 'updated_at'>>
export interface VariablesMajArticle {
  id: string
  champs: ChampsArticle
}

/** Ligne déjà en base (envoi refait après une coupure) : rien à faire. */
const sansDoublon = { onConflict: 'id', ignoreDuplicates: true }

export function enregistrerMutationsInventaire(client: QueryClient) {
  const communes = {
    retry: (essais: number, erreur: unknown) => estErreurReseau(erreur) && essais < 1000,
    retryDelay: (essais: number) => Math.min(1000 * 2 ** essais, 30_000),
    scope: { id: RACINE },
  }
  const maintenant = () => new Date().toISOString()
  function recharger() {
    if (client.isMutating({ mutationKey: [RACINE] }) <= 1) client.invalidateQueries({ queryKey: [RACINE] })
  }

  // Articles : mise à jour optimiste d'une ligne ; le contexte ne garde que
  // la ligne d'avant (voir Embarcations).
  interface ContexteArticle {
    id: string
    avant: Article | null
  }
  function remplacer(liste: Article[], id: string, ligne: Article | null): Article[] {
    const sans = liste.filter((l) => l.id !== id)
    if (!ligne) return sans
    return liste.some((l) => l.id === id) ? liste.map((l) => (l.id === id ? ligne : l)) : [...sans, ligne]
  }
  function optimisteArticle(id: string, apres: (a: Article | null) => Article | null) {
    return async (): Promise<ContexteArticle> => {
      await client.cancelQueries({ queryKey: CLES.articles })
      const liste = client.getQueryData<Article[]>(CLES.articles) ?? []
      const avant = liste.find((l) => l.id === id) ?? null
      client.setQueryData<Article[]>(CLES.articles, remplacer(liste, id, apres(avant)))
      return { id, avant }
    }
  }
  function annulerArticle(_e: unknown, _v: unknown, ctx: ContexteArticle | undefined) {
    if (ctx) client.setQueryData<Article[]>(CLES.articles, (liste = []) => remplacer(liste, ctx.id, ctx.avant))
  }

  // Comptes : un par article et par jour.
  interface ContexteCompte {
    article_id: string
    jour: string
    avant: Compte | null
  }
  function poserCompte(liste: Compte[], article: string, jour: string, compte: Compte | null): Compte[] {
    const sans = liste.filter((c) => c.article_id !== article || c.jour !== jour)
    return compte ? [...sans, compte] : sans
  }
  async function optimisteCompte(article_id: string, jour: string, apres: (c: Compte | null) => Compte | null): Promise<ContexteCompte> {
    await client.cancelQueries({ queryKey: CLES.comptes })
    const liste = client.getQueryData<Compte[]>(CLES.comptes) ?? []
    const avant = liste.find((c) => c.article_id === article_id && c.jour === jour) ?? null
    client.setQueryData<Compte[]>(CLES.comptes, poserCompte(liste, article_id, jour, apres(avant)))
    return { article_id, jour, avant }
  }
  function annulerCompte(_e: unknown, _v: unknown, ctx: ContexteCompte | undefined) {
    if (ctx) client.setQueryData<Compte[]>(CLES.comptes, (liste = []) => poserCompte(liste, ctx.article_id, ctx.jour, ctx.avant))
  }

  client.setMutationDefaults<void, Error, VariablesCompte, ContexteCompte>(CLES.compter, {
    ...communes,
    mutationFn: ({ article_id, jour, champs }) =>
      executer(
        db()
          .from('comptes')
          // Les champs absents gardent leur valeur (ou 0 pour un nouveau compte).
          .upsert({ article_id, jour, ...champs }, { onConflict: 'article_id,jour', defaultToNull: false }),
      ),
    onMutate: ({ article_id, jour, champs }) =>
      optimisteCompte(article_id, jour, (avant) => ({
        ...(avant ?? {
          article_id,
          jour,
          bon: 0,
          brise: 0,
          incomplet: 0,
          note: null,
          compte_par: null,
          compte_par_nom: null,
          created_at: maintenant(),
          updated_at: maintenant(),
        }),
        ...champs,
        updated_at: maintenant(),
      })),
    onError: annulerCompte,
    onSettled: recharger,
  })

  client.setMutationDefaults<void, Error, CleCompte, ContexteCompte>(CLES.supprimerCompte, {
    ...communes,
    mutationFn: ({ article_id, jour }) => executer(db().from('comptes').delete().eq('article_id', article_id).eq('jour', jour)),
    onMutate: ({ article_id, jour }) => optimisteCompte(article_id, jour, () => null),
    onError: annulerCompte,
    onSettled: recharger,
  })

  client.setMutationDefaults(CLES.creerArticle, {
    ...communes,
    mutationFn: (a: NouvelArticle) => executer(db().from('articles').upsert(a, sansDoublon)),
    onMutate: (a: NouvelArticle) =>
      optimisteArticle(a.id, () => ({
        variante: null,
        section_id: null,
        lieu_id: null,
        entreprise_id: null,
        necessaire: null,
        note: null,
        ordre: 0,
        actif: true,
        created_at: maintenant(),
        updated_at: maintenant(),
        ...a,
      }))(),
    onError: annulerArticle,
    onSettled: recharger,
  })

  client.setMutationDefaults(CLES.majArticle, {
    ...communes,
    mutationFn: ({ id, champs }: VariablesMajArticle) => executer(db().from('articles').update(champs).eq('id', id)),
    onMutate: ({ id, champs }: VariablesMajArticle) => optimisteArticle(id, (a) => (a ? { ...a, ...champs } : null))(),
    onError: annulerArticle,
    onSettled: recharger,
  })

  // Seulement un article jamais compté (sinon on le retire : actif = false).
  client.setMutationDefaults(CLES.supprimerArticle, {
    ...communes,
    mutationFn: (id: string) => executer(db().from('articles').delete().eq('id', id)),
    onMutate: (id: string) => optimisteArticle(id, () => null)(),
    onError: annulerArticle,
    onSettled: recharger,
  })
}

export const useCompter = () => useMutation<void, Error, VariablesCompte>({ mutationKey: CLES.compter })
export const useSupprimerCompte = () => useMutation<void, Error, CleCompte>({ mutationKey: CLES.supprimerCompte })
export const useCreerArticle = () => useMutation<void, Error, NouvelArticle>({ mutationKey: CLES.creerArticle })
export const useMajArticle = () => useMutation<void, Error, VariablesMajArticle>({ mutationKey: CLES.majArticle })
export const useSupprimerArticle = () => useMutation<void, Error, string>({ mutationKey: CLES.supprimerArticle })

// ------------------------------------------------------------------
// En ligne seulement : sections et lieux
// ------------------------------------------------------------------

type TableListe = 'sections' | 'lieux'

/** Ajoute ou modifie une ligne d'une liste (selon la présence d'un id). */
export async function enregistrerListe(table: TableListe, ligne: { id?: string; nom?: string; ordre?: number }) {
  const { id, ...champs } = ligne
  await executer(id ? db().from(table).update(champs).eq('id', id) : db().from(table).insert(champs))
}

export async function supprimerListe(table: TableListe, id: string) {
  await executer(db().from(table).delete().eq('id', id))
}

/** Change l'ordre d'une liste : chaque ligne reçoit sa position. */
export async function ordonner(table: TableListe, ids: string[]) {
  await Promise.all(ids.map((id, i) => executer(db().from(table).update({ ordre: i + 1 }).eq('id', id))))
}

/** Après une modification en ligne : relit le module. */
export function useRelire() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: [RACINE] })
}
