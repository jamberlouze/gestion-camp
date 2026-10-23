import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { FichierJoint } from '@/lib/photos'
import { supabase } from '@/lib/supabase'
import type { ChampsRapport, Fichier, Rapport } from './types'

// ------------------------------------------------------------------
// Renseignements de santé : en ligne seulement, ni temps réel ni cache sur
// l'appareil (requêtes ['accidents', …] et ['accidents-adresses', …]
// exclues de la persistance dans src/lib/requetes.ts). La RLS décide de ce
// qu'on lit : tout pour la direction, ses propres rapports pour qui ne fait
// que déclarer.
// ------------------------------------------------------------------

const RACINE = 'accidents'
const db = () => supabase.schema('accidents')
const SEAU = 'accidents-fichiers'

async function executer(requete: PromiseLike<{ error: unknown }>) {
  const { error } = await requete
  if (error) throw error
}

export function useRapports() {
  return useQuery({
    queryKey: [RACINE, 'rapports'],
    queryFn: async () => {
      const { data, error } = await db().from('rapports').select('*').order('survenu_le', { ascending: false }).order('id')
      if (error) throw error
      return data as Rapport[]
    },
    networkMode: 'always',
  })
}

export function useFichiers() {
  return useQuery({
    queryKey: [RACINE, 'fichiers'],
    queryFn: async () => {
      const { data, error } = await db().from('fichiers').select('*').order('created_at').order('id')
      if (error) throw error
      return data as Fichier[]
    },
    networkMode: 'always',
  })
}

/** Après une modification : relit le module. */
export function useRelire() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: [RACINE] })
}

/** Nouveau rapport (insertion) ou rapport existant (mise à jour) : la RLS ne permet pas le même geste à tous. */
export async function enregistrerRapport(champs: ChampsRapport, nouveau: boolean) {
  if (nouveau) await executer(db().from('rapports').insert(champs))
  else await executer(db().from('rapports').update(champs).eq('id', champs.id))
}

/** Supprime un rapport (direction), ses fichiers (cascade) et ceux du seau. */
export async function supprimerRapport(id: string, fichiers: Fichier[]) {
  await executer(db().from('rapports').delete().eq('id', id))
  if (fichiers.length) await supabase.storage.from(SEAU).remove(fichiers.map((f) => f.chemin))
}

/** Durée d'une adresse signée ; relue avant d'expirer. */
const DUREE_ADRESSE = 3600

/** Adresse signée d'un fichier (jamais gardée sur l'appareil : voir requetes.ts). */
export function useAdresseFichier(f: Pick<Fichier, 'chemin'>) {
  return (
    useQuery({
      queryKey: ['accidents-adresses', f.chemin],
      queryFn: async () => {
        const { data, error } = await supabase.storage.from(SEAU).createSignedUrl(f.chemin, DUREE_ADRESSE)
        if (error) throw error
        return data.signedUrl
      },
      staleTime: (DUREE_ADRESSE - 600) * 1000,
      refetchInterval: (DUREE_ADRESSE - 600) * 1000,
    }).data ?? null
  )
}

/** Envoie une photo (déjà réduite) ou un PDF, puis l'inscrit sur son rapport. */
export async function ajouterFichier(rapport: string, { fichier, extension, nom }: FichierJoint) {
  const id = crypto.randomUUID()
  const chemin = `${rapport}/${id}.${extension}`
  const envoi = await supabase.storage.from(SEAU).upload(chemin, fichier, { contentType: extension === 'pdf' ? 'application/pdf' : 'image/jpeg' })
  if (envoi.error) throw envoi.error
  const { error } = await db().from('fichiers').insert({ id, rapport_id: rapport, chemin, nom })
  if (error) {
    await supabase.storage.from(SEAU).remove([chemin])
    throw error
  }
}

export async function retirerFichier(f: Pick<Fichier, 'id' | 'chemin'>) {
  await executer(db().from('fichiers').delete().eq('id', f.id))
  await supabase.storage.from(SEAU).remove([f.chemin])
}
