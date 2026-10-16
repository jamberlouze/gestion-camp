import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Role } from '@/lib/types'
import type { AjustementBanque, EtatBanqueHeures } from './banques'
import { finPeriode, PREMIERE_PERIODE, type TypeHeures } from './periodes'

// Module en ligne seulement : mutations networkMode « always », erreurs dans
// le bandeau du module (racine S). Pas de temps réel (voir la migration) ni
// de cache sur l'appareil (src/lib/requetes.ts). La base décide de ce que
// chacun voit : une personne de la direction ne reçoit que ses lignes.

const S = 'temps'
const db = () => supabase.schema(S)

export interface Heure {
  id: string
  user_id: string
  jour: string
  type: TypeHeures
  heures: number
  updated_at: string
  updated_by: string | null
}

/** État d'une feuille ; sans ligne = ouverte. */
export type Statut = 'ouverte' | 'soumise' | 'approuvee'

export interface Feuille {
  id: string
  user_id: string
  debut: string
  note: string | null
  statut: Statut
}

/** Action sur une feuille (temps.changer_feuille / changer_feuille_employe). */
export type Action = 'soumettre' | 'approuver' | 'renvoyer' | 'rouvrir' | 'noter'

/** Une ligne du journal d'une feuille : soumission, approbation, renvoi, réouverture ou note ajoutée. */
export interface EntreeJournal {
  id: string
  genre: 'soumission' | 'approbation' | 'renvoi' | 'reouverture' | 'note'
  texte: string | null
  auteur_nom: string
  created_at: string
}

export interface Membre {
  id: string
  courriel: string
  nom: string | null
  role: Role
  actif: boolean
}

export const nomDe = (m: Pick<Membre, 'nom' | 'courriel'> | undefined | null) => m?.nom || m?.courriel || 'Personne inconnue'

/** Lit toutes les lignes par tranches de 1000 (limite de l'API). */
export async function toutLire<T>(tranche: (debut: number, fin: number) => PromiseLike<{ data: unknown; error: unknown }>) {
  const lignes: T[] = []
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await tranche(debut, debut + 999)
    if (error) throw error
    const lot = (data ?? []) as T[]
    lignes.push(...lot)
    if (lot.length < 1000) return lignes
  }
}

const versNombre = (h: Heure): Heure => ({ ...h, heures: Number(h.heures) })

// ------------------------------------------------------------------
// Lectures
// ------------------------------------------------------------------

/** Heures d'une personne pour une période. */
export function useHeures(userId: string, debut: string) {
  return useQuery({
    queryKey: [S, 'heures', userId, debut],
    queryFn: async () => {
      const { data, error } = await db()
        .from('heures')
        .select('*')
        .eq('user_id', userId)
        .gte('jour', debut)
        .lte('jour', finPeriode(debut))
      if (error) throw error
      return (data as Heure[]).map(versNombre)
    },
  })
}

/** La note d'une personne pour une période ; null = pas de note. */
export function useFeuille(userId: string, debut: string) {
  return useQuery({
    queryKey: [S, 'feuille', userId, debut],
    queryFn: async () => {
      const { data, error } = await db().from('feuilles').select('*').eq('user_id', userId).eq('debut', debut).maybeSingle()
      if (error) throw error
      return data as Feuille | null
    },
  })
}

/**
 * Toutes les heures visibles entre deux dates (tableau de bord, section
 * Direction de l'onglet Employés : toute la direction pour un admin).
 * `actif` = false : rien n'est lu (ex. pas admin).
 */
export function useHeuresPlage(du: string, au: string, actif = true) {
  return useQuery({
    queryKey: [S, 'plage-heures', du, au],
    enabled: actif,
    queryFn: async () =>
      (
        await toutLire<Heure>((a, b) =>
          db().from('heures').select('*').gte('jour', du).lte('jour', au).order('jour').order('id').range(a, b),
        )
      ).map(versNombre),
  })
}

export function useFeuillesPlage(du: string, au: string, actif = true) {
  return useQuery({
    queryKey: [S, 'plage-feuilles', du, au],
    enabled: actif,
    queryFn: () =>
      toutLire<Feuille>((a, b) => db().from('feuilles').select('*').gte('debut', du).lte('debut', au).order('debut').order('id').range(a, b)),
  })
}

/** Comptes qui peuvent avoir une feuille (admins et direction), y compris inactifs. */
export function useMembres(actif = true) {
  return useQuery({
    queryKey: [S, 'membres'],
    enabled: actif,
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('core')
        .from('profils')
        .select('id, courriel, nom, role, actif')
        .order('nom')
        .order('courriel')
      if (error) throw error
      return data as Membre[]
    },
  })
}

// ------------------------------------------------------------------
// Écritures
// ------------------------------------------------------------------

/**
 * Inscrit les heures d'une case (null = efface). Affichage mis à jour
 * d'avance, remis en place si la base refuse.
 */
export function useSaisir(userId: string, debut: string) {
  const client = useQueryClient()
  const cle = [S, 'heures', userId, debut]
  return useMutation({
    mutationKey: [S, 'heures'],
    networkMode: 'always',
    mutationFn: async (c: { jour: string; type: TypeHeures; heures: number | null }) => {
      const { error } =
        c.heures == null
          ? await db().from('heures').delete().eq('user_id', userId).eq('jour', c.jour).eq('type', c.type)
          : await db()
              .from('heures')
              .upsert({ user_id: userId, jour: c.jour, type: c.type, heures: c.heures }, { onConflict: 'user_id,jour,type' })
      if (error) throw error
    },
    onMutate: async (c) => {
      await client.cancelQueries({ queryKey: cle })
      const avant = client.getQueryData<Heure[]>(cle)
      client.setQueryData<Heure[]>(cle, (liste = []) => {
        const existante = liste.find((h) => h.jour === c.jour && h.type === c.type)
        const reste = liste.filter((h) => h !== existante)
        if (c.heures == null) return reste
        return [
          ...reste,
          {
            id: existante?.id ?? crypto.randomUUID(),
            user_id: userId,
            jour: c.jour,
            type: c.type,
            heures: c.heures,
            updated_at: new Date().toISOString(),
            updated_by: null,
          },
        ]
      })
      return { avant }
    },
    onError: (_e, _c, ctx) => {
      if (ctx) client.setQueryData(cle, ctx.avant)
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: cle })
      client.invalidateQueries({ queryKey: [S, 'plage-heures'] })
      client.invalidateQueries({ queryKey: [S, 'banques'] })
    },
  })
}

const invaliderFeuilles = (client: ReturnType<typeof useQueryClient>) => {
  client.invalidateQueries({ queryKey: [S, 'feuille'] })
  client.invalidateQueries({ queryKey: [S, 'plage-feuilles'] })
}

export function useEnregistrerNote() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [`${S}-local`, 'note'],
    networkMode: 'always',
    mutationFn: async (p: { userId: string; debut: string; note: string }) => {
      const { error } = await db().rpc('enregistrer_note', { p_user: p.userId, p_debut: p.debut, p_note: p.note })
      if (error) throw error
    },
    onSettled: () => invaliderFeuilles(client),
  })
}

/** Soumettre, approuver, renvoyer, rouvrir ou ajouter une note à la feuille d'une personne de la direction. */
export function useChangerFeuille() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [`${S}-local`, 'statut'],
    networkMode: 'always',
    mutationFn: async (p: { userId: string; debut: string; action: Action; texte?: string }) => {
      const { error } = await db().rpc('changer_feuille', {
        p_user: p.userId,
        p_debut: p.debut,
        p_action: p.action,
        p_texte: p.texte ?? null,
      })
      if (error) throw error
    },
    onSettled: () => {
      invaliderFeuilles(client)
      client.invalidateQueries({ queryKey: [S, 'journal'] })
      client.invalidateQueries({ queryKey: [S, 'a-approuver'] })
      client.invalidateQueries({ queryKey: [S, 'heures'] })
    },
  })
}

/** Journal d'une feuille (direction : `feuille_id` ; employé : `feuille_employe_id`), du plus ancien au plus récent. */
export function useJournal(colonne: 'feuille_id' | 'feuille_employe_id', id: string | null | undefined) {
  return useQuery({
    queryKey: [S, 'journal', colonne, id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db()
        .from('journal')
        .select('id, genre, texte, auteur_nom, created_at')
        .eq(colonne, id!)
        .order('created_at')
      if (error) throw error
      return data as EntreeJournal[]
    },
  })
}

/** Une feuille soumise qui attend une approbation (temps.feuilles_a_approuver). */
export interface FeuilleAApprouver {
  genre: 'employe' | 'direction'
  feuille_id: string
  /** Direction : le compte ; employé : null. */
  user_id: string | null
  employe_id: string | null
  entreprise_id: string | null
  debut: string
  /** Heures payées (tout sauf le woofing). */
  heures: number
  woofing: number
  soumise_le: string | null
}

/**
 * Feuilles soumises qui attendent une approbation (la base ne renvoie que
 * celles qu'on peut voir). Forme d'origine, gardée pour l'accueil (« À faire
 * pour moi ») ; l'onglet À approuver lit useFeuillesAApprouver.
 */
export function useAApprouver(avecDirection: boolean) {
  return useQuery({
    queryKey: [S, 'a-approuver', avecDirection],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [employes, direction] = await Promise.all([
        db().from('feuilles_employes').select('id, employe_id, entreprise_id, debut, statut').eq('statut', 'soumise').order('debut'),
        avecDirection
          ? db().from('feuilles').select('*').eq('statut', 'soumise').order('debut')
          : Promise.resolve({ data: [], error: null }),
      ])
      if (employes.error) throw employes.error
      if (direction.error) throw direction.error
      return {
        employes: employes.data as { id: string; employe_id: string; entreprise_id: string; debut: string; statut: Statut }[],
        direction: direction.data as Feuille[],
      }
    },
  })
}

/**
 * Feuilles soumises que la personne connectée peut approuver, avec leur
 * total d'heures et leur date de soumission : celles des employés pour
 * toute la direction, plus celles de la direction pour un admin (jamais la
 * sienne). La base décide (temps.feuilles_a_approuver, avec les politiques
 * des tables).
 */
export function useFeuillesAApprouver() {
  return useQuery({
    queryKey: [S, 'a-approuver', 'liste'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await db().rpc('feuilles_a_approuver')
      if (error) throw error
      return (data as FeuilleAApprouver[])
        .map((f) => ({ ...f, heures: Number(f.heures), woofing: Number(f.woofing) }))
        .sort((a, b) => a.debut.localeCompare(b.debut) || (a.soumise_le ?? '').localeCompare(b.soumise_le ?? ''))
    },
  })
}

// ------------------------------------------------------------------
// Banque d'heures (heures accumulées) : calculée par banques.ts ; la
// maladie et les vacances sont des banques d'Employeur D
// ------------------------------------------------------------------

/** À qui sont les banques : un compte (direction, admin) ou un employé du référentiel. */
export type Titulaire = { userId: string; employeId?: undefined } | { employeId: string; userId?: undefined }

const cleTitulaire = (t: Titulaire) => (t.userId ? `u:${t.userId}` : `e:${t.employeId}`)
const colonne = (t: Titulaire) => (t.userId ? (['user_id', t.userId] as const) : (['employe_id', t.employeId!] as const))

/** Un changement de l'interrupteur « Heures en banque » (temps.banque_heures_etats). */
export interface EtatBanqueHeuresLigne extends EtatBanqueHeures {
  id: string
  user_id: string | null
  employe_id: string | null
  auteur_nom: string
  created_at: string
}

/** Défaut de l'interrupteur : activé pour un compte (direction, admin), désactivé pour un employé. */
export const heuresActivesParDefaut = (t: Titulaire) => !!t.userId

/** Heures d'une banque : avec la compagnie pour un employé (une feuille par compagnie). */
export interface HeureBanqueLigne {
  jour: string
  type: string
  heures: number
  entreprise_id: string | null
}

/**
 * Tout ce qu'il faut pour la banque d'heures d'une personne jusqu'au jour
 * `au` : ses heures depuis la première période (toutes compagnies pour un
 * employé), ses ajustements et l'interrupteur. La base ne renvoie que
 * ce qu'on peut voir (temps.peut_voir_banque, mêmes règles que la feuille).
 */
export function useDonneesBanques(t: Titulaire, au: string) {
  return useQuery({
    queryKey: [S, 'banques', cleTitulaire(t), au],
    queryFn: async () => {
      const [col, id] = colonne(t)
      const heures = t.userId
        ? toutLire<HeureBanqueLigne>((a, b) =>
            db().from('heures').select('jour, type, heures').eq('user_id', t.userId).gte('jour', PREMIERE_PERIODE).lte('jour', au).order('jour').order('id').range(a, b),
          )
        : toutLire<HeureBanqueLigne>((a, b) =>
            db()
              .from('heures_employes')
              .select('jour, type, heures, entreprise_id')
              .eq('employe_id', t.employeId!)
              .gte('jour', PREMIERE_PERIODE)
              .lte('jour', au)
              .order('jour')
              .order('id')
              .range(a, b),
          )
      const [h, ajustements, etats] = await Promise.all([
        heures,
        db()
          .from('ajustements_banques')
          .select('id, banque, jour, heures, note, auteur_nom, created_at')
          .eq(col, id)
          .eq('banque', 'heures')
          .order('jour')
          .order('created_at'),
        db().from('banque_heures_etats').select('*').eq(col, id).order('depuis'),
      ])
      if (ajustements.error) throw ajustements.error
      if (etats.error) throw etats.error
      return {
        heures: h.map((x) => ({ ...x, heures: Number(x.heures), entreprise_id: x.entreprise_id ?? null })),
        ajustements: (ajustements.data as AjustementBanque[]).map((a) => ({ ...a, heures: Number(a.heures) })),
        etatsHeures: etats.data as EtatBanqueHeuresLigne[],
      }
    },
  })
}

/** Heures d'une personne pour une semaine (temps.semaines_banques). */
export interface SemaineBanque {
  user_id: string | null
  employe_id: string | null
  semaine: string
  regulieres: number
  banque: number
}

/**
 * Onglet Banques : tout ce que la personne connectée peut voir, jusqu'au
 * jour `au` — heures par personne et par semaine, ajustements et
 * interrupteurs. La base filtre (admin : tout ; direction : les
 * employés et elle-même, jamais un autre membre de la direction).
 */
export function useBanquesTous(au: string) {
  return useQuery({
    queryKey: [S, 'banques', 'tous', au],
    queryFn: async () => {
      const [semaines, ajustements, etats] = await Promise.all([
        toutLire<SemaineBanque>((a, b) => db().rpc('semaines_banques', { p_au: au }).order('semaine').order('user_id').order('employe_id').range(a, b)),
        toutLire<AjustementBanque & { user_id: string | null; employe_id: string | null }>((a, b) =>
          db()
            .from('ajustements_banques')
            .select('id, user_id, employe_id, banque, jour, heures, note, auteur_nom, created_at')
            .eq('banque', 'heures')
            .order('jour')
            .order('id')
            .range(a, b),
        ),
        toutLire<EtatBanqueHeuresLigne>((a, b) => db().from('banque_heures_etats').select('*').order('depuis').order('id').range(a, b)),
      ])
      return {
        semaines: semaines.map((x) => ({ ...x, regulieres: Number(x.regulieres), banque: Number(x.banque) })),
        ajustements: ajustements.map((x) => ({ ...x, heures: Number(x.heures) })),
        etatsHeures: etats,
      }
    },
  })
}

/** Interrupteurs « Heures en banque » des employés (grille Employés : ligne « Prises en banque »). */
export function useEtatsBanqueHeures() {
  return useQuery({
    queryKey: [S, 'banques', 'etats'],
    queryFn: () => toutLire<EtatBanqueHeuresLigne>((a, b) => db().from('banque_heures_etats').select('*').order('depuis').order('id').range(a, b)),
  })
}

const titulaireRpc = (t: Titulaire) => ({ p_user: t.userId ?? null, p_employe: t.employeId ?? null })

/**
 * Active ou désactive la mise en banque des heures au-delà de 40 h, à partir
 * de la période en cours (admins seulement : temps.regler_banque_heures).
 * Rend le début de la période où le changement prend effet.
 */
export function useReglerBanqueHeures() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [`${S}-local`, 'banque-heures'],
    networkMode: 'always',
    mutationFn: async (p: { titulaire: Titulaire; active: boolean }) => {
      const { data, error } = await db().rpc('regler_banque_heures', { ...titulaireRpc(p.titulaire), p_active: p.active })
      if (error) throw error
      return data as string
    },
    onSettled: () => client.invalidateQueries({ queryKey: [S, 'banques'] }),
  })
}

/** Ajustement manuel de la banque d'heures (+ ou − des heures), avec une note. Jamais effacé. */
export function useAjusterBanque() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [`${S}-local`, 'banque'],
    networkMode: 'always',
    mutationFn: async (p: { titulaire: Titulaire; jour: string; heures: number; note: string }) => {
      const { error } = await db().rpc('ajuster_banque', {
        ...titulaireRpc(p.titulaire),
        p_banque: 'heures',
        p_jour: p.jour,
        p_heures: p.heures,
        p_note: p.note,
      })
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: [S, 'banques'] }),
  })
}

// ------------------------------------------------------------------
// Dossiers à fermer (relevé d'emploi)
// ------------------------------------------------------------------

/** Employé actif sans heures depuis 2 périodes (ses dernières heures : `derniere_periode`). */
export interface DossierAFermer {
  employe_id: string
  surnom: string
  nom_complet: string | null
  derniere_periode: string
}

/**
 * Alertes « Produire le relevé d'emploi » : employés actifs qui ont eu des
 * heures, mais aucune pendant les 2 périodes avant `periode` (null = la
 * période en cours ; une période à venir compte comme la période en cours).
 * Vide pour qui n'entre pas dans le module (temps.a_acces). Réutilisable
 * ailleurs (ex. l'accueil) : `actif = false` n'interroge pas la base.
 */
export function useDossiersAFermer(periode: string | null = null, actif = true) {
  return useQuery({
    queryKey: [S, 'dossiers-a-fermer', periode],
    enabled: actif,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db().rpc('dossiers_a_fermer', { p_periode: periode })
      if (error) throw error
      return data as DossierAFermer[]
    },
  })
}

/** Relevé d'emploi produit : la fiche de l'employé est désactivée dans le référentiel (temps.fermer_dossier). */
export function useFermerDossier() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [`${S}-local`, 'fermer-dossier'],
    networkMode: 'always',
    mutationFn: async (employeId: string) => {
      const { error } = await db().rpc('fermer_dossier', { p_employe: employeId })
      if (error) throw error
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: [S, 'dossiers-a-fermer'] })
      client.invalidateQueries({ queryKey: [S, 'employes'] })
      client.invalidateQueries({ queryKey: ['core', 'employes'] })
    },
  })
}
