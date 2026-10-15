import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DatePeriode, ReglagesEmployeurD } from './employeurD'

// Export Employeur D : réglages (temps.reglages_employeur_d, une ligne) et
// numéros Employeur D du référentiel (core.entreprises.numero_employeur_d,
// core.employes.matricule_employeur_d), modifiés depuis la fenêtre d'export.
// Toute personne qui entre dans le module (admins et direction) les modifie ;
// erreurs affichées sur place (racine temps-local).

const S = 'temps'
const cleReglages = [S, 'employeur-d']

export function useReglagesEmployeurD() {
  return useQuery({
    queryKey: cleReglages,
    queryFn: async () => {
      const { data, error } = await supabase
        .schema(S)
        .from('reglages_employeur_d')
        .select('code_regulieres, code_maladie, code_banque, periode, modifie_le, modifie_par')
        .maybeSingle()
      if (error) throw error
      return (data ?? { code_regulieres: null, code_maladie: null, code_banque: null, periode: 'date_paie' }) as ReglagesEmployeurD
    },
  })
}

export type ChangementReglages = Partial<Record<'code_regulieres' | 'code_maladie' | 'code_banque', number | null>> & { periode?: DatePeriode }

export function useEnregistrerReglagesEmployeurD() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [`${S}-local`, 'employeur-d'],
    networkMode: 'always',
    mutationFn: async (changement: ChangementReglages) => {
      const { error } = await supabase.schema(S).from('reglages_employeur_d').update(changement).eq('id', true)
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: cleReglages }),
  })
}

/** Matricule Employeur D d'un employé ('' ou null = effacé ; espaces et zéros de tête retirés par la base). */
export function useEnregistrerMatricule() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [`${S}-local`, 'matricule'],
    networkMode: 'always',
    mutationFn: async (p: { employeId: string; matricule: string | null }) => {
      const { error } = await supabase
        .schema('core')
        .from('employes')
        .update({ matricule_employeur_d: p.matricule?.trim() || null })
        .eq('id', p.employeId)
      if (error) throw error
    },
    onSettled: () =>
      Promise.all([client.invalidateQueries({ queryKey: [S, 'employes'] }), client.invalidateQueries({ queryKey: ['core', 'employes'] })]),
  })
}

/** Numéro de compagnie Employeur D ('' ou null = effacé). */
export function useEnregistrerNumeroCompagnie() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: [`${S}-local`, 'numero-compagnie'],
    networkMode: 'always',
    mutationFn: async (p: { entrepriseId: string; numero: string | null }) => {
      const { error } = await supabase
        .schema('core')
        .from('entreprises')
        .update({ numero_employeur_d: p.numero?.trim() || null })
        .eq('id', p.entrepriseId)
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['core', 'entreprises'] }),
  })
}
