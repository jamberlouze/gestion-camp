import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { SEAU_DOCUMENTS } from '../donnees'
import type { Diete, StatutEmbauche } from '../types'

// Fiches du staff : tout passe par rh.fiches (un coordo n'a aucun droit
// sur les tables de rh). Clés ['rh', …] : jamais gardées sur l'appareil
// (src/lib/requetes.ts), en ligne seulement.

export interface PosteFiche {
  embauche_id: string
  poste: string | null
  entreprise_id: string | null
  genre: 'emploi' | 'benevolat'
  statut: StatutEmbauche
  debut: string | null
  fin: string | null
}

export interface DossierFiche {
  adresse: string | null
  ville: string | null
  province: string | null
  code_postal: string | null
  pays: string | null
  assurance_maladie: string | null
  allergies: string | null
  diete: Diete | null
  sante_conditions: string | null
  medicaments: string | null
  auto_injecteur: boolean | null
  sante_notes: string | null
  urgence1_nom: string | null
  urgence1_lien: string | null
  urgence1_telephone: string | null
  urgence2_nom: string | null
  urgence2_lien: string | null
  urgence2_telephone: string | null
  mis_a_jour_le: string
}

export interface Fiche {
  personne_id: string
  prenom: string
  nom_famille: string
  surnom: string | null
  courriel: string | null
  telephone: string | null
  date_naissance: string | null
  postes: PosteFiche[]
  dossier: DossierFiche | null
  /** Chemin de la photo la plus récente (seau rh-documents) */
  photo: string | null
}

export interface SaisonFiche {
  id: string
  nom: string
  debut: string | null
  fin: string | null
}

interface ReponseFiches {
  saison_id: string | null
  saisons: SaisonFiche[]
  fiches: Fiche[]
}

/** Fiches d'une saison (null = saison par défaut, choisie par la base). */
export function useFiches(saison: string | null) {
  const client = useQueryClient()
  return useQuery({
    queryKey: ['rh', 'fiches', saison ?? 'defaut'],
    networkMode: 'always',
    queryFn: async () => {
      const { data, error } = await supabase.schema('rh').rpc('fiches', { p_saison: saison })
      if (error) throw error
      const r = data as ReponseFiches
      // La fiche ouverte depuis la liste vise la saison par son id : déjà là.
      if (!saison && r.saison_id) client.setQueryData(['rh', 'fiches', r.saison_id], r)
      return r
    },
  })
}

/** Adresses signées des photos (une heure), par chemin. */
export function usePhotos(chemins: string[]) {
  const tries = [...new Set(chemins)].sort()
  return useQuery({
    queryKey: ['rh', 'photos', tries],
    enabled: tries.length > 0,
    networkMode: 'always',
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const urls = new Map<string, string>()
      for (let i = 0; i < tries.length; i += 100) {
        const { data, error } = await supabase.storage.from(SEAU_DOCUMENTS).createSignedUrls(tries.slice(i, i + 100), 3600)
        if (error) throw error
        for (const x of data) if (x.path && x.signedUrl) urls.set(x.path, x.signedUrl)
      }
      return urls
    },
  })
}

/** Quelque chose à savoir côté santé (pastilles de la liste, filtre). */
export const santeAConnaitre = (d: DossierFiche | null) =>
  !!d && (d.auto_injecteur === true || !!d.allergies || !!d.sante_conditions || !!d.medicaments || !!d.sante_notes)

/** Nom affiché en gros : nom de camp, sinon prénom. */
export const nomDeCamp = (f: Pick<Fiche, 'prenom' | 'surnom'>) => f.surnom || f.prenom

/** Lien « tel: » d'un numéro écrit à la main. */
export const lienTel = (t: string) => `tel:${t.replace(/[^\d+]/g, '')}`
