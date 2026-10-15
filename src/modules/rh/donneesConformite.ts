import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/shell/auth'
import { pastillesConformite, VAJ_VALIDITE_DEFAUT, type PastilleConformite } from './conformite'
import { useRh } from './contexte'
import { useContrats, useReglagesRh } from './donnees'
import type { PaieEnClairExport } from './employeurD'
import type { DocumentConformite, Embauche, EmployeReferentiel, PaieMasquee } from './types'

// Phase 4 (plan-rh.md §14.3 à §14.5) : conformité (cartes, VAJ), exports et
// lien avec le référentiel Employés. Requêtes ['rh', …] : jamais gardées sur
// l'appareil. Le NAS et le compte en clair ne passent que par
// exporterEmployeurD (rien n'est mis en cache).

const db = () => supabase.schema('rh')

/** CV, pièces d'identité et cartes de toutes les personnes (genre et expiration seulement, sans le fichier). */
export function useDocumentsConformite() {
  return useQuery({
    queryKey: ['rh', 'documents-conformite'],
    queryFn: async () => {
      const lignes: DocumentConformite[] = []
      for (let debut = 0; ; debut += 1000) {
        const { data, error } = await db()
          .from('documents')
          .select('personne_id, genre, expire_le')
          .in('genre', ['cv', 'piece_identite', 'premiers_soins', 'sauveteur'])
          .order('id')
          .range(debut, debut + 999)
        if (error) throw error
        lignes.push(...(data as DocumentConformite[]))
        if (data.length < 1000) return lignes
      }
    },
  })
}

/** Paie masquée de toutes les personnes (accès rh_paie) : savoir ce qui est au dossier. */
export function usePaiesMasquees(actif: boolean) {
  return useQuery({
    queryKey: ['rh', 'paies-masquees'],
    enabled: actif,
    queryFn: async () => {
      const { data, error } = await db().from('paie').select('personne_id, nas_fin, transit, institution, compte_fin')
      if (error) throw error
      return data as Pick<PaieMasquee, 'personne_id' | 'nas_fin' | 'transit' | 'institution' | 'compte_fin'>[]
    },
  })
}

/** Fiches du référentiel Employés (core.employes : lues par toute personne active). */
export function useEmployesReferentiel() {
  return useQuery({
    queryKey: ['rh', 'employes-referentiel'],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('core')
        .from('employes')
        .select('id, surnom, nom_complet, prenom, nom_famille, courriel, actif, entreprise_ids, matricule_employeur_d')
        .order('surnom')
      if (error) throw error
      return data as EmployeReferentiel[]
    },
  })
}

/** Relier une personne à une fiche du référentiel (null = créer la fiche) ; direction seulement. */
export function useRelierEmploye() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['rh-local', 'relier'],
    networkMode: 'always',
    mutationFn: async ({ personne, employe }: { personne: string; employe: string | null }) => {
      const { data, error } = await db().rpc('relier_employe', { p_personne: personne, p_employe: employe })
      if (error) throw error
      return data as string
    },
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['rh', 'personnes'], exact: true }),
        client.invalidateQueries({ queryKey: ['rh', 'employes-referentiel'] }),
        client.invalidateQueries({ queryKey: ['rh', 'journal'] }),
        client.invalidateQueries({ queryKey: ['core', 'employes'] }),
      ]),
  })
}

export function useDelierEmploye() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['rh-local', 'delier'],
    networkMode: 'always',
    mutationFn: async (personne: string) => {
      const { error } = await db().rpc('delier_employe', { p_personne: personne })
      if (error) throw error
    },
    onSettled: () => Promise.all([client.invalidateQueries({ queryKey: ['rh', 'personnes'], exact: true }), client.invalidateQueries({ queryKey: ['rh', 'journal'] })]),
  })
}

/** « VAJ faite le … » pour plusieurs personnes (la base note chacune au journal). */
export function useVajFaite() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['rh-local', 'vaj'],
    networkMode: 'always',
    mutationFn: async ({ personnes, le }: { personnes: string[]; le: string }) => {
      const { error } = await db().from('personnes').update({ vaj_le: le }).in('id', personnes)
      if (error) throw error
    },
    onSettled: () => Promise.all([client.invalidateQueries({ queryKey: ['rh', 'personnes'], exact: true }), client.invalidateQueries({ queryKey: ['rh', 'journal'] })]),
  })
}

/** Matricule Employeur D d'une fiche du référentiel (le même que celui des Feuilles de temps). */
export function useEnregistrerMatricule() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['rh-local', 'matricule'],
    networkMode: 'always',
    mutationFn: async ({ employe, matricule }: { employe: string; matricule: string | null }) => {
      const { error } = await supabase.schema('core').from('employes').update({ matricule_employeur_d: matricule?.trim() || null }).eq('id', employe)
      if (error) throw error
    },
    onSettled: () => Promise.all([client.invalidateQueries({ queryKey: ['rh', 'employes-referentiel'] }), client.invalidateQueries({ queryKey: ['core', 'employes'] })]),
  })
}

/** Numéro de compagnie Employeur D (core.entreprises, partagé avec les Feuilles de temps). */
export function useEnregistrerNumeroCompagnie() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['rh-local', 'numero-compagnie'],
    networkMode: 'always',
    mutationFn: async ({ compagnie, numero }: { compagnie: string; numero: string | null }) => {
      const { error } = await supabase.schema('core').from('entreprises').update({ numero_employeur_d: numero?.trim() || null }).eq('id', compagnie)
      if (error) throw error
    },
    onSettled: () => Promise.all([client.invalidateQueries({ queryKey: ['rh', 'compagnies'] }), client.invalidateQueries({ queryKey: ['core', 'entreprises'] })]),
  })
}

/**
 * NAS, transit, institution et compte en clair des embauches à exporter :
 * accès rh_paie, chaque personne notée (consultations « export », journal),
 * date de l'export posée sur l'embauche. Jamais mis en cache.
 */
export async function exporterEmployeurD(embauches: string[]) {
  const { data, error } = await db().rpc('export_employeur_d', { p_embauches: embauches })
  if (error) throw error
  return new Map(((data ?? []) as (PaieEnClairExport & { embauche_id: string })[]).map((l) => [l.embauche_id, l]))
}

// ------------------------------------------------------------
// Conformité et lien avec le référentiel (écrans)
// ------------------------------------------------------------

/** Validité d'une VAJ (réglage `vaj_validite_ans`). */
export function useValiditeVaj() {
  const reglages = useReglagesRh()
  const n = Number(reglages.data?.vaj_validite_ans)
  return Number.isFinite(n) && n > 0 ? n : VAJ_VALIDITE_DEFAUT
}

/**
 * Pastilles de conformité des embauches données (onglet Employés). Vide
 * tant que les contrats et les documents ne sont pas chargés.
 */
export function useConformite(embauches: Embauche[]) {
  const { personneParId, saisonParId, posteParId, auj } = useRh()
  const contrats = useContrats()
  const documents = useDocumentsConformite()
  const validite = useValiditeVaj()
  const pret = !!contrats.data && !!documents.data
  const parEmbauche = useMemo(() => {
    const m = new Map<string, PastilleConformite[]>()
    if (!contrats.data || !documents.data) return m
    const docsDe = new Map<string, DocumentConformite[]>()
    for (const d of documents.data) docsDe.set(d.personne_id, [...(docsDe.get(d.personne_id) ?? []), d])
    for (const e of embauches) {
      const personne = personneParId.get(e.personne_id)
      if (!personne) continue
      m.set(
        e.id,
        pastillesConformite({
          embauche: e,
          personne,
          saison: saisonParId.get(e.saison_id),
          poste: e.poste_id ? posteParId.get(e.poste_id) : undefined,
          contrats: contrats.data,
          documents: docsDe.get(e.personne_id) ?? [],
          auj,
          validiteVaj: validite,
        }),
      )
    }
    return m
  }, [embauches, contrats.data, documents.data, personneParId, saisonParId, posteParId, auj, validite])
  return { parEmbauche, pret, erreur: contrats.error ?? documents.error }
}

/** La direction (admins compris) relie ; les autres voient. */
export function usePeutRelier() {
  const { estDirection } = useAuth()
  const { ecriture } = useRh()
  return estDirection && ecriture
}

/** Personnes qui ont une embauche complète et pas de fiche du référentiel. */
export function usePersonnesARelier() {
  const { personnes, embauchesDe } = useRh()
  return useMemo(() => personnes.filter((p) => !p.employe_id && (embauchesDe.get(p.id) ?? []).some((e) => e.statut === 'complete')), [personnes, embauchesDe])
}
