import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useListe } from '@/lib/donnees'
import { supabase } from '@/lib/supabase'
import { toutLire } from './donnees'
import { finPeriode } from './periodes'

// Heures des employés (hors direction), saisies par la direction dans une
// feuille partagée : toute personne qui entre dans le module voit et modifie
// tout (temps.a_acces). Même règles que le reste du module : en ligne
// seulement, pas de temps réel ni de cache sur l'appareil (clés ['temps', …]).
// Plusieurs personnes peuvent remplir la feuille en même temps : elle se
// relit toutes les 30 secondes (une case en cours de saisie n'est pas touchée).

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
  ordre: number
  actif: boolean
}

export interface HeureEmploye {
  id: string
  employe_id: string
  entreprise_id: string
  jour: string
  heures: number
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

export const useEntreprises = () => useListe<Entreprise>('core', 'entreprises', 'ordre')

const cleHeures = (debut: string) => [S, 'employes-heures', debut]
const cleNotes = (debut: string) => [S, 'employes-notes', debut]

export function useHeuresEmployes(debut: string) {
  return useQuery({
    queryKey: cleHeures(debut),
    refetchInterval: RELECTURE,
    queryFn: async () =>
      (
        await toutLire<HeureEmploye>((a, b) =>
          db()
            .from('heures_employes')
            .select('id, employe_id, entreprise_id, jour, heures')
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
          : await db()
              .from('heures_employes')
              .upsert(
                { employe_id: c.employeId, entreprise_id: c.entrepriseId, jour: c.jour, heures: c.heures },
                { onConflict: 'employe_id,entreprise_id,jour' },
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
          { id: existante?.id ?? crypto.randomUUID(), employe_id: c.employeId, entreprise_id: c.entrepriseId, jour: c.jour, heures: c.heures },
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
