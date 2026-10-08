import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useListe } from '@/lib/donnees'
import { supabase } from '@/lib/supabase'
import { toutLire, type Action, type Statut } from './donnees'
import { finPeriode } from './periodes'

// Heures des employés (hors direction), saisies par la direction dans une
// feuille partagée : toute personne qui entre dans le module voit et modifie
// tout (temps.a_acces). Même règles que le reste du module : en ligne
// seulement, pas de temps réel ni de cache sur l'appareil (clés ['temps', …]).
// Plusieurs personnes peuvent remplir la feuille en même temps : elle se
// relit toutes les 30 secondes (une case en cours de saisie n'est pas touchée).
// Un employé qui remplit sa feuille (compte relié à sa fiche dans la page
// Utilisateurs : core.profils.employe_id) écrit dans les mêmes
// lignes, par sa feuille à lui (une par compagnie) : la grille ne fait que
// les afficher, avec l'état de sa feuille. Le woofing (non payé) n'y paraît pas.

const S = 'temps'
const db = () => supabase.schema(S)
const RELECTURE = 30_000

export interface EmployeFeuille {
  id: string
  surnom: string
  nom_complet: string | null
  poste: string | null
  secteur: string | null
  entreprise_ids: string[]
  actif: boolean
}

/** Compagnie (référentiel commun, core.entreprises). */
export interface Entreprise {
  id: string
  nom: string
  abreviation: string | null
  couleur: string | null
  ordre: number
  actif: boolean
}

/** Régulières : payées, dans la grille ; woofing : non payées, seulement sur la feuille de l'employé. */
export type TypeHeuresEmploye = 'regulieres' | 'woofing'

export interface HeureEmploye {
  id: string
  employe_id: string
  entreprise_id: string
  jour: string
  type: TypeHeuresEmploye
  heures: number
}

/** Feuille d'un employé qui remplit la sienne (une par compagnie et période) ; sans ligne = ouverte. */
export interface FeuilleEmploye {
  id: string
  employe_id: string
  entreprise_id: string
  debut: string
  statut: Statut
  note: string | null
}

export interface NoteEmploye {
  id: string
  employe_id: string
  entreprise_id: string
  debut: string
  note: string
}

/** « Chamberland, Maxime » si le nom complet est connu, sinon le surnom. */
export const nomEmploye = (e: Pick<EmployeFeuille, 'surnom' | 'nom_complet'>) => e.nom_complet || e.surnom

/** Tous les employés du référentiel, y compris inactifs (ils peuvent avoir des heures passées). */
export function useEmployesFeuille() {
  return useQuery({
    queryKey: [S, 'employes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('core')
        .from('employes')
        .select('id, surnom, nom_complet, poste, secteur, entreprise_ids, actif')
        .order('surnom')
      if (error) throw error
      return data as EmployeFeuille[]
    },
  })
}

/**
 * Employés qui remplissent leur feuille (compte relié, page Utilisateurs) →
 * option woofing. Tous pour la direction, soi-même pour un employé.
 */
export function useFeuillesPropres() {
  return useQuery({
    queryKey: [S, 'feuilles-propres'],
    queryFn: async () => {
      const { data, error } = await db().rpc('feuilles_propres')
      if (error) throw error
      return new Map((data as { employe_id: string; woofing: boolean }[]).map((f) => [f.employe_id, f.woofing]))
    },
  })
}

export const useEntreprises = () => useListe<Entreprise>('core', 'entreprises', 'ordre')

const cleHeures = (debut: string) => [S, 'employes-heures', debut]
const cleNotes = (debut: string) => [S, 'employes-notes', debut]
const cleFeuilles = (debut: string) => [S, 'employes-feuilles', debut]

export function useHeuresEmployes(debut: string) {
  return useQuery({
    queryKey: cleHeures(debut),
    refetchInterval: RELECTURE,
    queryFn: async () =>
      (
        await toutLire<HeureEmploye>((a, b) =>
          db()
            .from('heures_employes')
            .select('id, employe_id, entreprise_id, jour, type, heures')
            .eq('type', 'regulieres')
            .gte('jour', debut)
            .lte('jour', finPeriode(debut))
            .order('jour')
            .order('id')
            .range(a, b),
        )
      ).map((h) => ({ ...h, heures: Number(h.heures) })),
  })
}

export function useNotesEmployes(debut: string) {
  return useQuery({
    queryKey: cleNotes(debut),
    refetchInterval: RELECTURE,
    queryFn: async () => {
      const { data, error } = await db().from('notes_employes').select('id, employe_id, entreprise_id, debut, note').eq('debut', debut)
      if (error) throw error
      return data as NoteEmploye[]
    },
  })
}

/** États des feuilles des employés qui remplissent la leur, pour la période. */
export function useFeuillesEmployes(debut: string) {
  return useQuery({
    queryKey: cleFeuilles(debut),
    refetchInterval: RELECTURE,
    queryFn: async () => {
      const { data, error } = await db().from('feuilles_employes').select('*').eq('debut', debut)
      if (error) throw error
      return data as FeuilleEmploye[]
    },
  })
}

/**
 * Inscrit les heures d'une case (null = efface). Affichage mis à jour
 * d'avance, remis en place si la base refuse.
 */
export function useSaisirEmploye(debut: string) {
  const client = useQueryClient()
  const cle = cleHeures(debut)
  return useMutation({
    mutationKey: [S, 'employes-heures'],
    networkMode: 'always',
    mutationFn: async (c: { employeId: string; entrepriseId: string; jour: string; heures: number | null }) => {
      const { error } =
        c.heures == null
          ? await db()
              .from('heures_employes')
              .delete()
              .eq('employe_id', c.employeId)
              .eq('entreprise_id', c.entrepriseId)
              .eq('jour', c.jour)
              .eq('type', 'regulieres')
          : await db()
              .from('heures_employes')
              .upsert(
                { employe_id: c.employeId, entreprise_id: c.entrepriseId, jour: c.jour, type: 'regulieres', heures: c.heures },
                { onConflict: 'employe_id,entreprise_id,jour,type' },
              )
      if (error) throw error
    },
    onMutate: async (c) => {
      await client.cancelQueries({ queryKey: cle })
      const avant = client.getQueryData<HeureEmploye[]>(cle)
      client.setQueryData<HeureEmploye[]>(cle, (liste = []) => {
        const existante = liste.find((h) => h.employe_id === c.employeId && h.entreprise_id === c.entrepriseId && h.jour === c.jour)
        const reste = liste.filter((h) => h !== existante)
        if (c.heures == null) return reste
        return [
          ...reste,
          {
            id: existante?.id ?? crypto.randomUUID(),
            employe_id: c.employeId,
            entreprise_id: c.entrepriseId,
            jour: c.jour,
            type: 'regulieres',
            heures: c.heures,
          },
        ]
      })
      return { avant }
    },
    onError: (_e, _c, ctx) => {
      if (ctx) client.setQueryData(cle, ctx.avant)
    },
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}

/** Note de paie d'une ligne (employé + compagnie) pour la période (vide = retirée). */
export function useNoterEmploye(debut: string) {
  const client = useQueryClient()
  const cle = cleNotes(debut)
  return useMutation({
    mutationKey: [S, 'employes-notes'],
    networkMode: 'always',
    mutationFn: async (c: { employeId: string; entrepriseId: string; note: string }) => {
      const note = c.note.trim()
      const { error } = note
        ? await db()
            .from('notes_employes')
            .upsert({ employe_id: c.employeId, entreprise_id: c.entrepriseId, debut, note }, { onConflict: 'employe_id,entreprise_id,debut' })
        : await db()
            .from('notes_employes')
            .delete()
            .eq('employe_id', c.employeId)
            .eq('entreprise_id', c.entrepriseId)
            .eq('debut', debut)
      if (error) throw error
    },
    onMutate: async (c) => {
      await client.cancelQueries({ queryKey: cle })
      const avant = client.getQueryData<NoteEmploye[]>(cle)
      const note = c.note.trim()
      client.setQueryData<NoteEmploye[]>(cle, (liste = []) => {
        const existante = liste.find((n) => n.employe_id === c.employeId && n.entreprise_id === c.entrepriseId)
        const reste = liste.filter((n) => n !== existante)
        return note
          ? [...reste, { id: existante?.id ?? crypto.randomUUID(), employe_id: c.employeId, entreprise_id: c.entrepriseId, debut, note }]
          : reste
      })
      return { avant }
    },
    onError: (_e, _c, ctx) => {
      if (ctx) client.setQueryData(cle, ctx.avant)
    },
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}

// ------------------------------------------------------------------
// Feuille d'un employé qui remplit la sienne (une compagnie, une période)
// ------------------------------------------------------------------

const cleSaFeuille = (employeId: string, entrepriseId: string, debut: string) => [S, 'feuille-employe', employeId, entrepriseId, debut]

/** Ses heures (régulières et woofing) et sa feuille (null = ouverte, sans note). */
export function useFeuilleEmploye(employeId: string, entrepriseId: string, debut: string) {
  return useQuery({
    queryKey: cleSaFeuille(employeId, entrepriseId, debut),
    refetchInterval: RELECTURE,
    queryFn: async () => {
      const [heures, feuille] = await Promise.all([
        db()
          .from('heures_employes')
          .select('id, employe_id, entreprise_id, jour, type, heures')
          .eq('employe_id', employeId)
          .eq('entreprise_id', entrepriseId)
          .gte('jour', debut)
          .lte('jour', finPeriode(debut)),
        db().from('feuilles_employes').select('*').eq('employe_id', employeId).eq('entreprise_id', entrepriseId).eq('debut', debut).maybeSingle(),
      ])
      if (heures.error) throw heures.error
      if (feuille.error) throw feuille.error
      return {
        heures: (heures.data as HeureEmploye[]).map((h) => ({ ...h, heures: Number(h.heures) })),
        feuille: feuille.data as FeuilleEmploye | null,
      }
    },
  })
}

type DonneesFeuille = { heures: HeureEmploye[]; feuille: FeuilleEmploye | null }

/** Inscrit les heures d'une case de sa feuille (null = efface), affichage mis à jour d'avance. */
export function useSaisirFeuilleEmploye(employeId: string, entrepriseId: string, debut: string) {
  const client = useQueryClient()
  const cle = cleSaFeuille(employeId, entrepriseId, debut)
  return useMutation({
    mutationKey: [S, 'feuille-employe-heures'],
    networkMode: 'always',
    mutationFn: async (c: { jour: string; type: TypeHeuresEmploye; heures: number | null }) => {
      const { error } =
        c.heures == null
          ? await db()
              .from('heures_employes')
              .delete()
              .eq('employe_id', employeId)
              .eq('entreprise_id', entrepriseId)
              .eq('jour', c.jour)
              .eq('type', c.type)
          : await db()
              .from('heures_employes')
              .upsert(
                { employe_id: employeId, entreprise_id: entrepriseId, jour: c.jour, type: c.type, heures: c.heures },
                { onConflict: 'employe_id,entreprise_id,jour,type' },
              )
      if (error) throw error
    },
    onMutate: async (c) => {
      await client.cancelQueries({ queryKey: cle })
      const avant = client.getQueryData<DonneesFeuille>(cle)
      if (avant) {
        const existante = avant.heures.find((h) => h.jour === c.jour && h.type === c.type)
        const reste = avant.heures.filter((h) => h !== existante)
        client.setQueryData<DonneesFeuille>(cle, {
          ...avant,
          heures:
            c.heures == null
              ? reste
              : [
                  ...reste,
                  {
                    id: existante?.id ?? crypto.randomUUID(),
                    employe_id: employeId,
                    entreprise_id: entrepriseId,
                    jour: c.jour,
                    type: c.type,
                    heures: c.heures,
                  },
                ],
        })
      }
      return { avant }
    },
    onError: (_e, _c, ctx) => {
      if (ctx?.avant) client.setQueryData(cle, ctx.avant)
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: cle })
      client.invalidateQueries({ queryKey: cleHeures(debut) })
    },
  })
}

const invaliderSaFeuille = (client: ReturnType<typeof useQueryClient>) => {
  client.invalidateQueries({ queryKey: [S, 'feuille-employe'] })
  client.invalidateQueries({ queryKey: [S, 'employes-feuilles'] })
  client.invalidateQueries({ queryKey: [S, 'journal'] })
  client.invalidateQueries({ queryKey: [S, 'a-approuver'] })
}

/** Note de la période sur sa feuille. */
export function useNoteFeuilleEmploye() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [`${S}-local`, 'note-employe'],
    networkMode: 'always',
    mutationFn: async (p: { employeId: string; entrepriseId: string; debut: string; note: string }) => {
      const { error } = await db().rpc('enregistrer_note_employe', {
        p_employe: p.employeId,
        p_entreprise: p.entrepriseId,
        p_debut: p.debut,
        p_note: p.note,
      })
      if (error) throw error
    },
    onSettled: () => invaliderSaFeuille(client),
  })
}

/** Soumettre, approuver, renvoyer, rouvrir ou ajouter une note à la feuille d'un employé. */
export function useChangerFeuilleEmploye() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [`${S}-local`, 'statut-employe'],
    networkMode: 'always',
    mutationFn: async (p: { employeId: string; entrepriseId: string; debut: string; action: Action; texte?: string }) => {
      const { error } = await db().rpc('changer_feuille_employe', {
        p_employe: p.employeId,
        p_entreprise: p.entrepriseId,
        p_debut: p.debut,
        p_action: p.action,
        p_texte: p.texte ?? null,
      })
      if (error) throw error
    },
    onSettled: () => invaliderSaFeuille(client),
  })
}
