import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Role } from '@/lib/types'
import type { AjustementBanque, Banque, ReglageMaladie } from './banques'
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

/** Toutes les heures visibles entre deux dates (tableau de bord : toute la direction pour un admin). */
export function useHeuresPlage(du: string, au: string) {
  return useQuery({
    queryKey: [S, 'plage-heures', du, au],
    queryFn: async () =>
      (
        await toutLire<Heure>((a, b) =>
          db().from('heures').select('*').gte('jour', du).lte('jour', au).order('jour').order('id').range(a, b),
        )
      ).map(versNombre),
  })
}

export function useFeuillesPlage(du: string, au: string) {
  return useQuery({
    queryKey: [S, 'plage-feuilles', du, au],
    queryFn: () =>
      toutLire<Feuille>((a, b) => db().from('feuilles').select('*').gte('debut', du).lte('debut', au).order('debut').order('id').range(a, b)),
  })
}

/** Comptes qui peuvent avoir une feuille (admins et direction), y compris inactifs. */
export function useMembres() {
  return useQuery({
    queryKey: [S, 'membres'],
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
// Banques (maladie, heures accumulées) : calculées par banques.ts
// ------------------------------------------------------------------

/** À qui sont les banques : un compte (direction, admin) ou un employé du référentiel. */
export type Titulaire = { userId: string; employeId?: undefined } | { employeId: string; userId?: undefined }

const cleTitulaire = (t: Titulaire) => (t.userId ? `u:${t.userId}` : `e:${t.employeId}`)
const colonne = (t: Titulaire) => (t.userId ? (['user_id', t.userId] as const) : (['employe_id', t.employeId!] as const))

export interface ReglageMaladieLigne extends ReglageMaladie {
  id: string
  auteur_nom: string
  updated_at: string
}

/** Heures d'une banque : avec la compagnie pour un employé (une feuille par compagnie). */
export interface HeureBanqueLigne {
  jour: string
  type: string
  heures: number
  entreprise_id: string | null
}

/**
 * Tout ce qu'il faut pour les banques d'une personne jusqu'au jour `au` :
 * ses heures depuis la première période (toutes compagnies pour un employé),
 * ses ajustements et ses jours de maladie par année. La base ne renvoie que
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
      const [h, ajustements, maladie] = await Promise.all([
        heures,
        db().from('ajustements_banques').select('id, banque, jour, heures, note, auteur_nom, created_at').eq(col, id).order('jour').order('created_at'),
        db().from('jours_maladie').select('id, annee, jours, auteur_nom, updated_at').eq(col, id).order('annee'),
      ])
      if (ajustements.error) throw ajustements.error
      if (maladie.error) throw maladie.error
      return {
        heures: h.map((x) => ({ ...x, heures: Number(x.heures), entreprise_id: x.entreprise_id ?? null })),
        ajustements: (ajustements.data as AjustementBanque[]).map((a) => ({ ...a, heures: Number(a.heures) })),
        reglagesMaladie: (maladie.data as ReglageMaladieLigne[]).map((r) => ({ ...r, jours: Number(r.jours) })),
      }
    },
  })
}

const titulaireRpc = (t: Titulaire) => ({ p_user: t.userId ?? null, p_employe: t.employeId ?? null })

/** Ajustement manuel d'une banque (+ ou − des heures), avec une note. Jamais effacé. */
export function useAjusterBanque() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [`${S}-local`, 'banque'],
    networkMode: 'always',
    mutationFn: async (p: { titulaire: Titulaire; banque: Banque; jour: string; heures: number; note: string }) => {
      const { error } = await db().rpc('ajuster_banque', {
        ...titulaireRpc(p.titulaire),
        p_banque: p.banque,
        p_jour: p.jour,
        p_heures: p.heures,
        p_note: p.note,
      })
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: [S, 'banques'] }),
  })
}

/** Jours de maladie par année, à partir d'une année (les années d'avant ne changent pas). */
export function useReglerJoursMaladie() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [`${S}-local`, 'jours-maladie'],
    networkMode: 'always',
    mutationFn: async (p: { titulaire: Titulaire; annee: number; jours: number }) => {
      const { error } = await db().rpc('regler_jours_maladie', { ...titulaireRpc(p.titulaire), p_annee: p.annee, p_jours: p.jours })
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
