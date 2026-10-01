import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import type { EtatCommande } from './calcul'
import type {
  AjoutConsommable,
  AjoutRecette,
  CellulePlan,
  Consommable,
  Dossier,
  Fonction,
  GroupeRepas,
  Menu,
  Participant,
  Personne,
  Produit,
  Quart,
  Recette,
  ReglagesHoraire,
  Sortie,
} from './types'

// Module pensé pour ordinateur, en ligne seulement (pas de file d'attente
// hors ligne) : sans réseau, une écriture échoue tout de suite (networkMode
// « always ») au lieu d'attendre dans le cache de l'appareil. Chaque
// écriture s'affiche tout de suite (mise à jour optimiste) et est annulée
// si elle échoue (bandeau d'erreur du module).
//
// Deux sortes de tables :
//  - communes (recettes, banque, menus, dossiers, personnel…) : clé [commande, table] ;
//  - propres à un menu (groupes, grille, sorties, ajouts) : clé
//    [commande, table, menuId], lues pour le menu ouvert seulement.
// Le temps réel invalide [commande, table], donc tous les menus à la fois.

const RACINE = 'commande'
const db = () => supabase.schema('commande')
/** Toutes les écritures du module : échec immédiat sans réseau (voir plus haut). */
const EN_LIGNE = { networkMode: 'always' } as const

interface Tables {
  recettes: Recette
  consommables: Consommable
  banque_ingredients: Produit
  parametres: { cle: string; valeur: unknown }
  menus: Menu
  dossiers: Dossier
  fonctions: Fonction
  personnel: Personne
  groupes_repas: GroupeRepas
  plan_cells: CellulePlan
  ajouts_consommables: AjoutConsommable
  ajouts_recettes: AjoutRecette
  sorties: Sortie
  participants: Participant
}
type NomTable = keyof Tables
type TableMenu = 'groupes_repas' | 'plan_cells' | 'ajouts_consommables' | 'ajouts_recettes' | 'sorties' | 'participants'
type TableCommune = Exclude<NomTable, TableMenu>
const TABLES_MENU = new Set<NomTable>(['groupes_repas', 'plan_cells', 'ajouts_consommables', 'ajouts_recettes', 'sorties', 'participants'])

const cle = (table: NomTable, menuId?: string | null) => (TABLES_MENU.has(table) ? [RACINE, table, menuId ?? ''] : [RACINE, table])
const CLE_QUARTS = [RACINE, 'quarts']

async function lire<T extends NomTable>(table: T, menuId?: string): Promise<Tables[T][]> {
  let requete = db().from(table).select('*')
  if (menuId) requete = requete.eq('menu_id', menuId)
  if (table === 'recettes' || table === 'consommables') requete = requete.is('deleted_at', null)
  if (table === 'ajouts_recettes' || table === 'sorties' || table === 'participants') requete = requete.order('created_at').order('id')
  if (table === 'groupes_repas') requete = requete.order('created_at').order('id')
  if (table === 'fonctions' || table === 'personnel') requete = requete.order('ordre').order('nom')
  const { data, error } = await requete
  if (error) throw error
  return data as Tables[T][]
}

/** Table commune (recettes, banque, menus, dossiers, personnel…). */
export function useTable<T extends TableCommune>(table: T) {
  return useQuery({ queryKey: cle(table), queryFn: () => lire(table) })
}

/** Table propre à un menu (groupes, grille, sorties, ajouts) : lignes de ce menu. */
export function useTableMenu<T extends TableMenu>(table: T, menuId: string | null | undefined) {
  return useQuery({
    queryKey: cle(table, menuId),
    queryFn: () => lire(table, menuId!),
    enabled: !!menuId,
  })
}

export const trierNoms = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' })

/** Menus et modèles, triés par nom. */
export function useMenus() {
  const requete = useTable('menus')
  const menus = useMemo(() => [...(requete.data ?? [])].sort((a, b) => trierNoms(a.nom, b.nom)), [requete.data])
  return { ...requete, menus }
}

/** Dossiers de rangement des menus, triés par nom. */
export function useDossiers() {
  const requete = useTable('dossiers')
  const dossiers = useMemo(() => [...(requete.data ?? [])].sort((a, b) => trierNoms(a.nom, b.nom)), [requete.data])
  // Dossiers existants (null tant qu'ils ne sont pas chargés) : un dossier
  // supprimé ailleurs vaut « Sans dossier » (la base a mis dossier_id à null).
  const connus = useMemo(() => (requete.data ? new Set(requete.data.map((d) => d.id)) : null), [requete.data])
  return { ...requete, dossiers, connus }
}

/**
 * Tables modifiées ailleurs pendant une de nos écritures : leur événement
 * temps réel est mis de côté (il écraserait l'affichage optimiste) et elles
 * sont rechargées à la fin de la dernière écriture (finEcriture).
 */
const tablesManquees = new Set<string>()

/** Recharge une table quand quelqu'un d'autre la modifie. */
export function useTempsReelCommande() {
  const client = useQueryClient()
  useEffect(() => {
    const canal = supabase
      .channel(`commande-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'commande' }, (p) => {
        if (client.isMutating({ mutationKey: [RACINE] }) === 0) {
          client.invalidateQueries({ queryKey: [RACINE, p.table] })
        } else {
          tablesManquees.add(p.table)
        }
      })
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [client])
}

/**
 * Fin d'une écriture (onSettled, encore comptée en cours) : si c'est la
 * dernière, recharge `cles` et les tables modifiées ailleurs entre-temps.
 */
function finEcriture(client: QueryClient, cles: QueryKey[]) {
  if (client.isMutating({ mutationKey: [RACINE] }) > 1) return
  const aRecharger = [...cles, ...[...tablesManquees].map((t) => [RACINE, t])]
  tablesManquees.clear()
  aRecharger.forEach((queryKey) => client.invalidateQueries({ queryKey }))
}

/**
 * Erreur déjà affichée sur place (dialogue, bulle, message de la page) : on
 * la retire du bandeau d'erreurs du module, pour ne pas l'afficher deux fois.
 * `variables` : l'objet (ou l'id) passé à mutate.
 */
function oublierErreur(client: QueryClient, variables: unknown) {
  const cache = client.getMutationCache()
  cache.findAll({ mutationKey: [RACINE], predicate: (m) => m.state.variables === variables }).forEach((m) => cache.remove(m))
}

/** Pour l'appelant qui affiche lui-même l'erreur d'une écriture (voir oublierErreur). */
export function useOublierErreur() {
  const client = useQueryClient()
  return (variables: unknown) => oublierErreur(client, variables)
}

/**
 * Attend la fin des écritures en cours du module (ex. un champ enregistré
 * en le quittant, juste avant un clic sur « Dupliquer »), sauf les copies.
 */
function attendreEcritures(client: QueryClient) {
  const cache = client.getMutationCache()
  const enCours = () =>
    cache.findAll({ mutationKey: [RACINE], status: 'pending', predicate: (m) => m.options.mutationKey?.[2] !== 'copier' }).length > 0
  if (!enCours()) return Promise.resolve()
  return new Promise<void>((fin) => {
    const arreter = cache.subscribe(() => {
      if (enCours()) return
      arreter()
      fin()
    })
  })
}

async function verifier(requete: PromiseLike<{ error: unknown }>) {
  const { error } = await requete
  if (error) throw error
}

type Listes = Partial<{ [T in NomTable]: Tables[T][] }>

/**
 * Écriture avec mise à jour optimiste d'une ou plusieurs tables en cache.
 * `optimiste` reçoit les listes actuelles et renvoie les listes modifiées.
 * `menuDe` : menu concerné, pour les tables propres à un menu.
 */
function useEcriture<V>(
  tables: NomTable[],
  envoyer: (v: V) => Promise<unknown>,
  optimiste?: (v: V, listes: Listes) => Listes,
  menuDe?: (v: V) => string,
) {
  const client = useQueryClient()
  return useMutation({
    ...EN_LIGNE,
    mutationKey: [RACINE, ...tables],
    mutationFn: envoyer,
    onMutate: async (v: V) => {
      const menuId = menuDe?.(v)
      await Promise.all(tables.map((t) => client.cancelQueries({ queryKey: cle(t, menuId) })))
      const avant = Object.fromEntries(tables.map((t) => [t, client.getQueryData(cle(t, menuId))])) as Listes
      if (optimiste) {
        const apres = optimiste(v, avant)
        for (const [t, liste] of Object.entries(apres)) client.setQueryData(cle(t as NomTable, menuId), liste)
      }
      return { avant, menuId }
    },
    onError: (_e, _v, contexte) => {
      for (const [t, liste] of Object.entries(contexte?.avant ?? {})) client.setQueryData(cle(t as NomTable, contexte?.menuId), liste)
    },
    onSettled: (_d, _e, v) => {
      const menuId = menuDe?.(v)
      finEcriture(client, tables.map((t) => cle(t, menuId)))
    },
  })
}

/** Remplace (ou ajoute) les éléments dont `memeCle` est vrai. */
function remplacer<T>(liste: T[] = [], nouveaux: T[], memeCle: (a: T, b: T) => boolean): T[] {
  const resultat = liste.map((x) => nouveaux.find((n) => memeCle(x, n)) ?? x)
  for (const n of nouveaux) if (!liste.some((x) => memeCle(x, n))) resultat.push(n)
  return resultat
}
const memeId = <T extends { id: unknown }>(a: T, b: T) => a.id === b.id
const duMenu = (v: { menu_id: string }) => v.menu_id

export const nouvelId = (prefixe: string) => `${prefixe}_${crypto.randomUUID().slice(0, 13)}`

// ------------------------------------------------------------------
// Recettes et consommables
// ------------------------------------------------------------------

/**
 * Enregistre une recette. Ses ingrédients sont aussi ajoutés ou mis à jour
 * dans la banque (sans toucher aux autres recettes, comme avant).
 */
export function useEnregistrerRecette() {
  return useEcriture<Recette>(
    ['recettes', 'banque_ingredients'],
    async (r) => {
      await verifier(db().from('recettes').upsert(r))
      const produits = produitsDeRecette(r)
      if (produits.length) await verifier(db().from('banque_ingredients').upsert(produits))
    },
    (r, l) => ({
      recettes: remplacer(l.recettes, [r], memeId),
      banque_ingredients: remplacer(
        l.banque_ingredients,
        produitsDeRecette(r).map((p) => ({ ...(l.banque_ingredients ?? []).find((b) => b.id === p.id), ...p })),
        memeId,
      ),
    }),
  )
}

function produitsDeRecette(r: Recette): Produit[] {
  return r.ingredients.map((i) => ({ id: i.id, name: i.name, pkg: i.pkg ?? '', case_qty: i.caseQty, unit: i.unit, store: i.store }))
}

export function useSupprimerRecette() {
  return useEcriture<string>(
    ['recettes'],
    (id) => verifier(db().from('recettes').update({ deleted_at: new Date().toISOString() }).eq('id', id)),
    (id, l) => ({ recettes: (l.recettes ?? []).filter((r) => r.id !== id) }),
  )
}

export function useEnregistrerConsommable() {
  return useEcriture<Consommable>(
    ['consommables'],
    (c) => verifier(db().from('consommables').upsert(c)),
    (c, l) => ({ consommables: remplacer(l.consommables, [c], memeId) }),
  )
}

export function useSupprimerConsommable() {
  return useEcriture<string>(
    ['consommables'],
    (id) => verifier(db().from('consommables').update({ deleted_at: new Date().toISOString() }).eq('id', id)),
    (id, l) => ({ consommables: (l.consommables ?? []).filter((c) => c.id !== id) }),
  )
}

// ------------------------------------------------------------------
// Banque d'ingrédients
// ------------------------------------------------------------------

/** Nom, empaquetage, taille de caisse et source sont propagés aux recettes qui l'utilisent. */
export function useEnregistrerProduit() {
  const client = useQueryClient()
  const recettesTouchees = (p: Produit) =>
    (client.getQueryData<Recette[]>(cle('recettes')) ?? [])
      .filter((r) => r.ingredients.some((i) => i.id === p.id))
      .map((r) => ({
        ...r,
        ingredients: r.ingredients.map((i) =>
          i.id === p.id ? { ...i, name: p.name, pkg: p.pkg ?? '', caseQty: p.case_qty, store: p.store } : i,
        ),
      }))
  return useEcriture<Produit>(
    ['banque_ingredients', 'recettes'],
    async (p) => {
      const touchees = recettesTouchees(p)
      await verifier(db().from('banque_ingredients').upsert(p))
      if (touchees.length) await verifier(db().from('recettes').upsert(touchees))
    },
    (p, l) => ({
      banque_ingredients: remplacer(l.banque_ingredients, [p], memeId),
      recettes: remplacer(l.recettes, recettesTouchees(p), memeId),
    }),
  )
}

export function useSupprimerProduit() {
  return useEcriture<string>(
    ['banque_ingredients'],
    (id) => verifier(db().from('banque_ingredients').delete().eq('id', id)),
    (id, l) => ({ banque_ingredients: (l.banque_ingredients ?? []).filter((p) => p.id !== id) }),
  )
}

// ------------------------------------------------------------------
// Menus et dossiers
// ------------------------------------------------------------------

/** Groupe proposé dans un menu vide (au moins un groupe est requis). */
export const groupeParDefaut = (): Omit<GroupeRepas, 'menu_id'> => ({
  id: nouvelId('g'),
  name: 'Campeurs',
  age: 'Mixtes',
  portions: 0,
  vege: 0,
  sans_porc: 0,
  sans_lactose: 0,
  sans_gluten: 0,
  notes: '',
  color: '#2E7D32',
})

export interface NouveauMenu {
  nom: string
  dossier_id: string | null
  modele: boolean
  jours: number
  debut: string | null
}

/**
 * Crée un menu vide (avec un groupe) ; renvoie son id. Fonction SQL
 * commande.creer_menu : le menu et son groupe en une seule transaction.
 * Erreur affichée par le dialogue (pas dans le bandeau).
 */
export function useCreerMenu() {
  const client = useQueryClient()
  return useMutation({
    ...EN_LIGNE,
    mutationKey: [RACINE, 'menus', 'creer'],
    mutationFn: async (m: NouveauMenu) => {
      const { data, error } = await db().rpc('creer_menu', {
        p_nom: m.nom,
        p_dossier: m.modele ? null : m.dossier_id,
        p_modele: m.modele,
        p_jours: m.jours,
        p_debut: m.modele ? null : m.debut,
        p_groupe: groupeParDefaut(),
      })
      if (error) throw error
      return data as string
    },
    onSettled: (_d, e, m) => {
      client.invalidateQueries({ queryKey: cle('menus') })
      finEcriture(client, [])
      if (e) oublierErreur(client, m)
    },
  })
}

export interface CopieMenu {
  source: string
  nom: string
  dossier_id: string | null
  modele: boolean
  debut: string | null
}

/**
 * Copie un menu avec tout son contenu (dupliquer, créer un modèle, créer un
 * menu à partir d'un modèle) ; renvoie l'id du nouveau menu. La copie se
 * fait dans la base : elle attend d'abord les écritures en cours (ex. un
 * nombre de portions enregistré en quittant le champ pour cliquer sur
 * « Dupliquer »), sinon elle pourrait copier l'ancienne valeur. Erreur
 * affichée par l'appelant (pas dans le bandeau).
 */
export function useCopierMenu() {
  const client = useQueryClient()
  return useMutation({
    ...EN_LIGNE,
    mutationKey: [RACINE, 'menus', 'copier'],
    mutationFn: async (c: CopieMenu) => {
      await attendreEcritures(client)
      const { data, error } = await db().rpc('copier_menu', {
        p_source: c.source,
        p_nom: c.nom,
        p_dossier: c.modele ? null : c.dossier_id,
        p_modele: c.modele,
        p_debut: c.modele ? null : c.debut,
      })
      if (error) throw error
      return data as string
    },
    onSettled: (_d, e, c) => {
      client.invalidateQueries({ queryKey: cle('menus') })
      finEcriture(client, [])
      if (e) oublierErreur(client, c)
    },
  })
}

export type ChampsMenu = Partial<Pick<Menu, 'nom' | 'dossier_id' | 'jours' | 'debut'>>

/** Renomme un menu, le range dans un dossier, change ses jours ou sa date de début. */
export function useModifierMenu() {
  return useEcriture<{ id: string } & ChampsMenu>(
    ['menus'],
    ({ id, ...champs }) => verifier(db().from('menus').update(champs).eq('id', id)),
    ({ id, ...champs }, l) => ({
      menus: (l.menus ?? []).map((m) => (m.id === id ? { ...m, ...champs, updated_at: new Date().toISOString() } : m)),
    }),
  )
}

/** Supprime un menu et tout son contenu. */
export function useSupprimerMenu() {
  return useEcriture<string>(
    ['menus'],
    (id) => verifier(db().from('menus').delete().eq('id', id)),
    (id, l) => ({ menus: (l.menus ?? []).filter((m) => m.id !== id) }),
  )
}

/** Crée (sans id) ou renomme un dossier ; renvoie l'id du dossier. Erreur affichée par l'appelant. */
export function useEnregistrerDossier() {
  const client = useQueryClient()
  return useMutation({
    ...EN_LIGNE,
    mutationKey: [RACINE, 'dossiers', 'enregistrer'],
    mutationFn: async ({ id, nom }: { id?: string; nom: string }) => {
      if (id) {
        await verifier(db().from('dossiers').update({ nom }).eq('id', id))
        return id
      }
      const { data, error } = await db().from('dossiers').insert({ nom }).select('id').single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSettled: (_d, e, v) => {
      client.invalidateQueries({ queryKey: cle('dossiers') })
      finEcriture(client, [])
      if (e) oublierErreur(client, v)
    },
  })
}

/** Supprime un dossier ; ses menus passent dans « Sans dossier ». Erreur affichée par l'appelant. */
export function useSupprimerDossier() {
  const client = useQueryClient()
  return useMutation({
    ...EN_LIGNE,
    mutationKey: [RACINE, 'dossiers', 'supprimer'],
    mutationFn: (id: string) => verifier(db().from('dossiers').delete().eq('id', id)),
    onSettled: (_d, e, id) => {
      client.invalidateQueries({ queryKey: cle('dossiers') })
      client.invalidateQueries({ queryKey: cle('menus') })
      finEcriture(client, [])
      if (e) oublierErreur(client, id)
    },
  })
}

// ------------------------------------------------------------------
// Planificateur (propre au menu)
// ------------------------------------------------------------------

const memeGroupe = (a: GroupeRepas, b: GroupeRepas) => a.menu_id === b.menu_id && a.id === b.id

export function useEnregistrerGroupe() {
  return useEcriture<GroupeRepas>(
    ['groupes_repas'],
    (g) => verifier(db().from('groupes_repas').upsert(g)),
    (g, l) => ({ groupes_repas: remplacer(l.groupes_repas, [g], memeGroupe) }),
    duMenu,
  )
}

/** Supprime un groupe et ses participants (cascade). */
export function useSupprimerGroupe() {
  return useEcriture<{ menu_id: string; id: string }>(
    ['groupes_repas', 'participants'],
    ({ menu_id, id }) => verifier(db().from('groupes_repas').delete().eq('menu_id', menu_id).eq('id', id)),
    ({ id }, l) => ({
      groupes_repas: (l.groupes_repas ?? []).filter((g) => g.id !== id),
      participants: (l.participants ?? []).filter((p) => p.groupe_id !== id),
    }),
    duMenu,
  )
}

/** Ajoute ou modifie un participant (allergies, restrictions). */
export function useEnregistrerParticipant() {
  return useEcriture<Participant>(
    ['participants'],
    (p) => {
      const { created_at: _c, ...ligne } = p
      return verifier(db().from('participants').upsert(ligne))
    },
    (p, l) => ({ participants: remplacer(l.participants, [p], memeId) }),
    duMenu,
  )
}

export function useSupprimerParticipant() {
  return useEcriture<{ menu_id: string; id: string }>(
    ['participants'],
    ({ id }) => verifier(db().from('participants').delete().eq('id', id)),
    ({ id }, l) => ({ participants: (l.participants ?? []).filter((p) => p.id !== id) }),
    duMenu,
  )
}

const memeCellule = (a: CellulePlan, b: CellulePlan) => a.menu_id === b.menu_id && a.day === b.day && a.meal === b.meal

export function useEnregistrerCellule() {
  return useEcriture<CellulePlan>(
    ['plan_cells'],
    (c) => verifier(db().from('plan_cells').upsert(c)),
    (c, l) => ({ plan_cells: remplacer(l.plan_cells, [c], memeCellule) }),
    duMenu,
  )
}

/** Efface tous les repas planifiés du menu. */
export function useEffacerGrille() {
  return useEcriture<{ menu_id: string }>(
    ['plan_cells'],
    ({ menu_id }) => verifier(db().from('plan_cells').delete().eq('menu_id', menu_id)),
    () => ({ plan_cells: [] }),
    duMenu,
  )
}

// ------------------------------------------------------------------
// Ajouts manuels et sorties (propres au menu)
// ------------------------------------------------------------------

export function useAjoutConsommable() {
  return useEcriture<AjoutConsommable>(
    ['ajouts_consommables'],
    (a) => verifier(db().from('ajouts_consommables').upsert(a)),
    (a, l) => ({ ajouts_consommables: remplacer(l.ajouts_consommables, [a], (x, y) => x.cons_id === y.cons_id) }),
    duMenu,
  )
}

export function useAjouterRecette() {
  return useEcriture<Omit<AjoutRecette, 'id' | 'created_at'>>(
    ['ajouts_recettes'],
    (a) => verifier(db().from('ajouts_recettes').insert(a)),
    (a, l) => ({
      // id provisoire négatif, remplacé au rechargement.
      ajouts_recettes: [...(l.ajouts_recettes ?? []), { ...a, id: -Date.now(), created_at: new Date().toISOString() }],
    }),
    duMenu,
  )
}

export function useRetirerAjoutRecette() {
  return useEcriture<{ menu_id: string; id: number }>(
    ['ajouts_recettes'],
    ({ id }) => verifier(db().from('ajouts_recettes').delete().eq('id', id)),
    ({ id }, l) => ({ ajouts_recettes: (l.ajouts_recettes ?? []).filter((a) => a.id !== id) }),
    duMenu,
  )
}

export function useEnregistrerSortie() {
  return useEcriture<Sortie>(
    ['sorties'],
    (s) => {
      const { created_at: _c, ...ligne } = s
      return verifier(db().from('sorties').upsert(ligne))
    },
    (s, l) => ({ sorties: remplacer(l.sorties, [s], memeId) }),
    duMenu,
  )
}

export function useSupprimerSortie() {
  return useEcriture<{ menu_id: string; id: string }>(
    ['sorties'],
    ({ id }) => verifier(db().from('sorties').delete().eq('id', id)),
    ({ id }, l) => ({ sorties: (l.sorties ?? []).filter((s) => s.id !== id) }),
    duMenu,
  )
}

// ------------------------------------------------------------------
// Horaire du personnel de cuisine
// ------------------------------------------------------------------

export const REGLAGES_HORAIRE_DEFAUT: ReglagesHoraire = {
  quarts: ['6h30 à 14h30', '7h30 à 15h30', '8h30 à 16h30', '9h à 19h', '11h à 19h'],
  statuts: ['OFF', 'Vacance', 'Congé', 'Malade'],
}

export function useReglagesHoraire(): ReglagesHoraire {
  const { data } = useTable('parametres')
  const valeur = data?.find((p) => p.cle === 'horaire_cuisine')?.valeur as Partial<ReglagesHoraire> | undefined
  return { ...REGLAGES_HORAIRE_DEFAUT, ...valeur }
}

export function useEnregistrerReglagesHoraire() {
  return useEcriture<ReglagesHoraire>(
    ['parametres'],
    (valeur) => verifier(db().from('parametres').upsert({ cle: 'horaire_cuisine', valeur })),
    (valeur, l) => ({
      parametres: remplacer(l.parametres, [{ cle: 'horaire_cuisine', valeur }], (a, b) => a.cle === b.cle),
    }),
  )
}

export function useEnregistrerFonction() {
  return useEcriture<Fonction>(
    ['fonctions'],
    (f) => verifier(db().from('fonctions').upsert(f)),
    (f, l) => ({ fonctions: remplacer(l.fonctions, [f], memeId) }),
  )
}

/** Supprime une fonction ; les personnes qui l'avaient n'ont plus de fonction. */
export function useSupprimerFonction() {
  return useEcriture<string>(
    ['fonctions', 'personnel'],
    (id) => verifier(db().from('fonctions').delete().eq('id', id)),
    (id, l) => ({
      fonctions: (l.fonctions ?? []).filter((f) => f.id !== id),
      personnel: (l.personnel ?? []).map((p) => (p.fonction_id === id ? { ...p, fonction_id: null } : p)),
    }),
  )
}

export function useEnregistrerPersonne() {
  return useEcriture<Personne>(
    ['personnel'],
    (p) => verifier(db().from('personnel').upsert(p)),
    (p, l) => ({ personnel: remplacer(l.personnel, [p], memeId) }),
  )
}

/** Supprime une personne et tous ses quarts (préférer « inactif » pour garder l'historique). */
export function useSupprimerPersonne() {
  const client = useQueryClient()
  return useEcriture<string>(
    ['personnel'],
    async (id) => {
      await verifier(db().from('personnel').delete().eq('id', id))
      client.invalidateQueries({ queryKey: CLE_QUARTS })
    },
    (id, l) => ({ personnel: (l.personnel ?? []).filter((p) => p.id !== id) }),
  )
}

const cleQuarts = (debut: string, fin: string) => [...CLE_QUARTS, debut, fin]

/** Quarts entre deux dates (AAAA-MM-JJ, bornes comprises), ex. une semaine. */
export function useQuarts(debut: string, fin: string) {
  return useQuery({
    queryKey: cleQuarts(debut, fin),
    queryFn: async () => {
      const { data, error } = await db().from('quarts').select('personne_id, jour, texte').gte('jour', debut).lte('jour', fin)
      if (error) throw error
      return data as Quart[]
    },
  })
}

const memeQuart = (a: Quart, b: Quart) => a.personne_id === b.personne_id && a.jour === b.jour

/**
 * Écrit une case de l'horaire (texte vide : la case est effacée). `debut` et
 * `fin` : période affichée, pour la mise à jour optimiste.
 */
export function useEcrireQuart(debut: string, fin: string) {
  const client = useQueryClient()
  const cleSemaine = cleQuarts(debut, fin)
  return useMutation({
    ...EN_LIGNE,
    mutationKey: [RACINE, 'quarts'],
    mutationFn: (q: Quart) => {
      const texte = q.texte.trim()
      return texte
        ? verifier(db().from('quarts').upsert({ ...q, texte }))
        : verifier(db().from('quarts').delete().eq('personne_id', q.personne_id).eq('jour', q.jour))
    },
    onMutate: async (q: Quart) => {
      await client.cancelQueries({ queryKey: cleSemaine })
      const avant = client.getQueryData<Quart[]>(cleSemaine)
      const texte = q.texte.trim()
      const autres = (avant ?? []).filter((x) => !memeQuart(x, q))
      client.setQueryData<Quart[]>(cleSemaine, texte ? [...autres, { ...q, texte }] : autres)
      // La clé voyage avec le contexte : si la semaine affichée a changé
      // entre-temps, l'annulation vise quand même la semaine modifiée.
      return { avant, cle: cleSemaine }
    },
    onError: (_e, _q, contexte) => contexte && client.setQueryData(contexte.cle, contexte.avant),
    onSettled: () => finEcriture(client, [CLE_QUARTS]),
  })
}

/**
 * Remplace tous les quarts d'une période par `quarts` (ex. copier la semaine
 * précédente). Les cases absentes de `quarts` sont effacées. Fonction SQL
 * commande.remplacer_quarts : une seule transaction, donc en cas d'échec
 * la semaine reste telle quelle (comme l'annonce le bandeau d'erreur).
 */
export function useRemplacerQuarts(debut: string, fin: string) {
  const client = useQueryClient()
  const cleSemaine = cleQuarts(debut, fin)
  return useMutation({
    ...EN_LIGNE,
    mutationKey: [RACINE, 'quarts', 'remplacer'],
    mutationFn: (quarts: Quart[]) => verifier(db().rpc('remplacer_quarts', { p_debut: debut, p_fin: fin, p_quarts: quarts })),
    onMutate: async (quarts: Quart[]) => {
      await client.cancelQueries({ queryKey: cleSemaine })
      const avant = client.getQueryData<Quart[]>(cleSemaine)
      client.setQueryData<Quart[]>(cleSemaine, quarts)
      return { avant, cle: cleSemaine }
    },
    onError: (_e, _q, contexte) => contexte && client.setQueryData(contexte.cle, contexte.avant),
    onSettled: () => {
      client.invalidateQueries({ queryKey: CLE_QUARTS })
      finEcriture(client, [])
    },
  })
}

/** Lit les quarts d'une autre période sans l'afficher (ex. la semaine à copier) ; sans réseau, échoue tout de suite. */
export function useLireQuarts() {
  const client = useQueryClient()
  return (debut: string, fin: string) =>
    client.fetchQuery({
      queryKey: cleQuarts(debut, fin),
      staleTime: 0,
      networkMode: 'always',
      queryFn: async () => {
        const { data, error } = await db().from('quarts').select('personne_id, jour, texte').gte('jour', debut).lte('jour', fin)
        if (error) throw error
        return data as Quart[]
      },
    })
}

// ------------------------------------------------------------------
// Tout ce qu'il faut pour calculer la commande et la feuille de cuisine
// ------------------------------------------------------------------

/** État complet d'un menu pour calculerCommande / feuilleCuisine ; null tant que tout n'est pas chargé. */
export function useEtatCommande(menu: Menu | null | undefined): EtatCommande | null {
  const id = menu?.id
  const recettes = useTable('recettes')
  const consommables = useTable('consommables')
  const groupes = useTableMenu('groupes_repas', id)
  const cellules = useTableMenu('plan_cells', id)
  const ajoutsConsommables = useTableMenu('ajouts_consommables', id)
  const ajoutsRecettes = useTableMenu('ajouts_recettes', id)
  const sorties = useTableMenu('sorties', id)
  return useMemo(() => {
    if (
      !menu ||
      !recettes.data ||
      !consommables.data ||
      !groupes.data ||
      !cellules.data ||
      !ajoutsConsommables.data ||
      !ajoutsRecettes.data ||
      !sorties.data
    ) {
      return null
    }
    return {
      recettes: recettes.data,
      consommables: consommables.data,
      groupes: groupes.data,
      cellules: cellules.data,
      ajoutsConsommables: ajoutsConsommables.data,
      ajoutsRecettes: ajoutsRecettes.data,
      sorties: sorties.data,
      jours: menu.jours,
      debut: menu.debut,
    }
  }, [
    menu,
    recettes.data,
    consommables.data,
    groupes.data,
    cellules.data,
    ajoutsConsommables.data,
    ajoutsRecettes.data,
    sorties.data,
  ])
}
