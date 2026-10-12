import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  Candidature,
  Compagnie,
  Consultation,
  DateSaison,
  Document,
  Dossier,
  Embauche,
  GenreDocument,
  GenreTexte,
  Invitation,
  LigneJournal,
  Note,
  PaieEnClair,
  PaieMasquee,
  Personne,
  Poste,
  Saison,
  Texte,
} from './types'

// Module en ligne seulement (networkMode « always »), sans temps réel ni
// cache sur l'appareil (renseignements personnels : requêtes ['rh', …] et
// ['rh-adresses', …] exclues de la persistance dans src/lib/requetes.ts).
// Modifications optimistes ; une modification refusée remet la ligne
// d'avant et va dans le bandeau du module (racine « rh »).

const db = () => supabase.schema('rh')
export const SEAU_DOCUMENTS = 'rh-documents'
export const SEAU_PAIE = 'rh-paie'
/** Durée des adresses signées des fichiers (secondes). */
const DUREE_ADRESSE = 600

/** Table complète, par tranches de 1000. */
function useTable<T>(table: string, tri: string) {
  return useQuery({
    queryKey: ['rh', table],
    queryFn: async () => {
      const lignes: T[] = []
      for (let debut = 0; ; debut += 1000) {
        const { data, error } = await db().from(table).select('*').order(tri).range(debut, debut + 999)
        if (error) throw error
        lignes.push(...(data as T[]))
        if (data.length < 1000) return lignes
      }
    },
  })
}

export const useSaisons = () => useTable<Saison>('saisons', 'rang')
export const useDatesSaisons = () => useTable<DateSaison>('saisons_dates', 'ordre')
export const usePostes = () => useTable<Poste>('postes', 'ordre')
export const usePersonnes = () => useTable<Personne>('personnes', 'nom_complet')
export const useCandidatures = () => useTable<Candidature>('candidatures', 'recue_le')
export const useEmbauches = () => useTable<Embauche>('embauches', 'created_at')
export const useInvitations = () => useTable<Invitation>('invitations', 'created_at')
export const useTextes = () => useTable<Texte>('textes', 'version')

/** Compagnies du référentiel (lues par toute personne active). */
export function useCompagnies() {
  return useQuery({
    queryKey: ['rh', 'compagnies'],
    queryFn: async () => {
      const { data, error } = await supabase.schema('core').from('entreprises').select('id, nom, abreviation, couleur, ordre, actif').order('ordre')
      if (error) throw error
      return data as Compagnie[]
    },
  })
}

// ------------------------------------------------------------
// Ce qui ne se lit que dans la fiche d'une personne
// ------------------------------------------------------------
function useDeLaPersonne<T>(table: string, personneId: string, tri: string, croissant = true, actif = true) {
  return useQuery({
    queryKey: ['rh', table, personneId],
    enabled: actif,
    queryFn: async () => {
      const { data, error } = await db().from(table).select('*').eq('personne_id', personneId).order(tri, { ascending: croissant })
      if (error) throw error
      return data as T[]
    },
  })
}

export const useDocuments = (personneId: string) => useDeLaPersonne<Document>('documents', personneId, 'created_at')
export const useNotes = (personneId: string) => useDeLaPersonne<Note>('notes', personneId, 'jour', false)
export const useJournal = (personneId: string) => useDeLaPersonne<LigneJournal>('journal', personneId, 'le', false)
export const useConsultations = (personneId: string, actif: boolean) =>
  useDeLaPersonne<Consultation>('consultations', personneId, 'le', false, actif)

export function useDossier(personneId: string) {
  return useQuery({
    queryKey: ['rh', 'dossiers', personneId],
    queryFn: async () => {
      const { data, error } = await db().from('dossiers').select('*').eq('personne_id', personneId).maybeSingle()
      if (error) throw error
      return data as Dossier | null
    },
  })
}

/** Paie masquée (3 derniers chiffres) ; seulement avec l'accès rh_paie. */
export function usePaie(personneId: string, actif: boolean) {
  return useQuery({
    queryKey: ['rh', 'paie', personneId],
    enabled: actif,
    queryFn: async () => {
      const { data, error } = await db()
        .from('paie')
        .select('personne_id, nas_fin, transit, institution, compte_fin, specimen, updated_at, updated_by_nom')
        .eq('personne_id', personneId)
        .maybeSingle()
      if (error) throw error
      return data as PaieMasquee | null
    },
  })
}

/** Dossiers de plusieurs personnes (diètes, tailles de la liste des employés). */
export function useDossiers() {
  return useTable<Dossier>('dossiers', 'personne_id')
}

// ------------------------------------------------------------
// Modifications
// ------------------------------------------------------------
type Ligne = { id: string }

/**
 * Ajout optimiste. `completer` : la ligne telle que la base la rendra
 * (valeurs par défaut, colonnes calculées), pour que les écrans ne voient
 * jamais une ligne incomplète en attendant la relecture.
 */
function useAjouter<T extends Ligne>(table: string, completer: (l: Partial<T> & Ligne) => T = (l) => l as T) {
  const client = useQueryClient()
  const cle: QueryKey = ['rh', table]
  return useMutation({
    mutationKey: ['rh', table, 'ajouter'],
    networkMode: 'always',
    mutationFn: async (ligne: Partial<T> & Ligne) => {
      const { error } = await db().from(table).insert(ligne)
      if (error) throw error
    },
    onMutate: async (ligne) => {
      await client.cancelQueries({ queryKey: cle, exact: true })
      client.setQueryData<T[]>(cle, (l) => (l ? [...l, completer(ligne)] : l))
    },
    onError: (_e, ligne) => client.setQueryData<T[]>(cle, (l) => l?.filter((x) => x.id !== ligne.id)),
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}

function useModifier<T extends Ligne>(table: string) {
  const client = useQueryClient()
  const cle: QueryKey = ['rh', table]
  return useMutation({
    mutationKey: ['rh', table, 'modifier'],
    networkMode: 'always',
    mutationFn: async ({ id, champs }: { id: string; champs: Partial<T> }) => {
      const { error } = await db().from(table).update(champs as Record<string, unknown>).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, champs }) => {
      await client.cancelQueries({ queryKey: cle, exact: true })
      const avant = client.getQueryData<T[]>(cle)?.find((x) => x.id === id)
      client.setQueryData<T[]>(cle, (l) => l?.map((x) => (x.id === id ? { ...x, ...champs } : x)))
      return { avant }
    },
    onError: (_e, { id }, ctx) => {
      if (ctx?.avant) client.setQueryData<T[]>(cle, (l) => l?.map((x) => (x.id === id ? ctx.avant! : x)))
    },
    // Le journal suit les changements de statut ; « A refusé le poste » annule des embauches (déclencheur).
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: cle }),
        client.invalidateQueries({ queryKey: ['rh', 'journal'] }),
        table === 'candidatures' && client.invalidateQueries({ queryKey: ['rh', 'embauches'], exact: true }),
      ]),
  })
}

function useRetirer(table: string) {
  const client = useQueryClient()
  const cle: QueryKey = ['rh', table]
  return useMutation({
    mutationKey: ['rh', table, 'supprimer'],
    networkMode: 'always',
    mutationFn: async (id: string) => {
      const { error } = await db().from(table).delete().eq('id', id)
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: cle }),
  })
}

const NOMS_SAISON = { hiver: 'Hiver', printemps: 'Printemps', ete: 'Été', automne: 'Automne' } as const
const RANGS_SAISON = { hiver: 1, printemps: 2, ete: 3, automne: 4 } as const
export const useAjouterSaison = () =>
  useAjouter<Saison>('saisons', (l) => ({
    genre: 'ete',
    annee: 0,
    debut: null,
    fin: null,
    ouverte: false,
    ...l,
    // Colonnes calculées par la base (nom, rang)
    nom: `${NOMS_SAISON[l.genre ?? 'ete']} ${l.annee}`,
    rang: (l.annee ?? 0) * 10 + RANGS_SAISON[l.genre ?? 'ete'],
  }))
export const useModifierSaison = () => useModifier<Saison>('saisons')
export const useRetirerSaison = () => useRetirer('saisons')
export const useAjouterDate = () => useAjouter<DateSaison>('saisons_dates')
export const useModifierDate = () => useModifier<DateSaison>('saisons_dates')
export const useRetirerDate = () => useRetirer('saisons_dates')
export const useAjouterPoste = () => useAjouter<Poste>('postes')
export const useModifierPoste = () => useModifier<Poste>('postes')
export const useRetirerPoste = () => useRetirer('postes')
export const useAjouterPersonne = () =>
  useAjouter<Personne>('personnes', (l) => ({
    prenom: '',
    nom_famille: '',
    surnom: null,
    telephone: null,
    date_naissance: null,
    sexe: null,
    notes: null,
    ne_pas_reembaucher: false,
    raison_ne_pas: null,
    deja_travaille: false,
    vaj_le: null,
    vaj_note: null,
    employe_id: null,
    airtable_ids: [],
    created_at: new Date().toISOString(),
    ...l,
    courriel: l.courriel?.toLowerCase() ?? null,
    nom_complet: l.nom_famille ? `${l.nom_famille}, ${l.prenom}` : (l.prenom ?? ''),
  }))
export const useModifierPersonne = () => useModifier<Personne>('personnes')
export const useAjouterCandidature = () =>
  useAjouter<Candidature>('candidatures', (l) => ({
    personne_id: '',
    source: 'manuel',
    recue_le: new Date().toISOString(),
    saison_ids: [],
    poste_ids: [],
    reponses: {},
    statut: 'recue',
    pre_decision: null,
    commentaires: null,
    entrevue_le: null,
    notes_entrevue: null,
    entreprise_id: null,
    saison_id: null,
    poste_id: null,
    echelon: null,
    efface_le: null,
    cle: null,
    airtable_id: null,
    created_at: new Date().toISOString(),
    ...l,
  }))
export const useModifierCandidature = () => useModifier<Candidature>('candidatures')
export const useRetirerCandidature = () => useRetirer('candidatures')
export const useAjouterEmbauche = () =>
  useAjouter<Embauche>('embauches', (l) => ({
    personne_id: '',
    genre: 'emploi',
    saison_id: '',
    entreprise_id: null,
    poste_id: null,
    echelon: null,
    candidature_id: null,
    statut: 'a_envoyer',
    debut: null,
    fin: null,
    remuneration: null,
    taux: null,
    vacances: null,
    type_employe: null,
    action_paie: null,
    date_embauche: null,
    disponibilites: [],
    disponibilites_note: null,
    code_ethique_le: null,
    code_ethique_texte: null,
    entente_benevolat_le: null,
    entente_benevolat_texte: null,
    commentaires: null,
    presentation: {},
    dossier_recu_le: null,
    jeton: null,
    airtable_id: null,
    created_at: new Date().toISOString(),
    ...l,
  }))
export const useModifierEmbauche = () => useModifier<Embauche>('embauches')
export const useRetirerEmbauche = () => useRetirer('embauches')

/** Supprime une personne (seulement sans embauche) et ses fichiers. */
export function useSupprimerPersonne() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['rh', 'personnes', 'supprimer'],
    networkMode: 'always',
    mutationFn: async (id: string) => {
      const { data: docs, error: e1 } = await db().from('documents').select('chemin').eq('personne_id', id)
      if (e1) throw e1
      const { error } = await db().from('personnes').delete().eq('id', id)
      if (error) throw error
      if (docs?.length) await supabase.storage.from(SEAU_DOCUMENTS).remove(docs.map((d) => d.chemin))
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['rh'] }),
  })
}

/** Ajoute ou modifie le dossier d'une personne (une ligne par personne). */
export function useEnregistrerDossier(personneId: string) {
  const client = useQueryClient()
  const cle: QueryKey = ['rh', 'dossiers', personneId]
  return useMutation({
    mutationKey: ['rh', 'dossiers', 'enregistrer'],
    networkMode: 'always',
    mutationFn: async (champs: Partial<Dossier>) => {
      const { error } = await db()
        .from('dossiers')
        .upsert({ ...champs, personne_id: personneId }, { onConflict: 'personne_id' })
      if (error) throw error
    },
    onMutate: async (champs) => {
      await client.cancelQueries({ queryKey: cle })
      const avant = client.getQueryData<Dossier | null>(cle)
      client.setQueryData<Dossier | null>(cle, (d) => ({ ...(d ?? ({ personne_id: personneId } as Dossier)), ...champs }))
      return { avant }
    },
    onError: (_e, _c, ctx) => client.setQueryData(cle, ctx?.avant ?? null),
    onSettled: () => Promise.all([client.invalidateQueries({ queryKey: cle }), client.invalidateQueries({ queryKey: ['rh', 'dossiers'], exact: true })]),
  })
}

// ------------------------------------------------------------
// Fonctions de la base
// ------------------------------------------------------------

/** Accepter : décision + embauche en une transaction (rh.accepter). Rend l'id de l'embauche. */
export function useAccepter() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['rh-local', 'accepter'],
    networkMode: 'always',
    mutationFn: async (p: { candidature: string; saison: string; entreprise: string; poste: string; echelon: number | null }) => {
      const { data, error } = await db().rpc('accepter', {
        p_candidature: p.candidature,
        p_saison: p.saison,
        p_entreprise: p.entreprise,
        p_poste: p.poste,
        p_echelon: p.echelon,
      })
      if (error) throw error
      return data as string
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['rh'] }),
  })
}

/** Lien du dossier d'embauche : créé au besoin, ou refait (l'ancien ne fonctionne plus). Rend le jeton. */
export function useLienDossier() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['rh-local', 'lien-dossier'],
    networkMode: 'always',
    mutationFn: async ({ embauche, refaire = false }: { embauche: string; refaire?: boolean }) => {
      const { data, error } = await db().rpc('lien_dossier', { p_embauche: embauche, p_refaire: refaire })
      if (error) throw error
      return data as string
    },
    onSettled: () => Promise.all([client.invalidateQueries({ queryKey: ['rh', 'embauches'], exact: true }), client.invalidateQueries({ queryKey: ['rh', 'journal'] })]),
  })
}

/** Champs que rh.valider_embauche exige (CHAMPS_MANQUANTS:…), en mots. */
const CHAMPS_VALIDATION: Record<string, string> = {
  compagnie: 'la compagnie',
  poste: 'le poste',
  remuneration: 'la rémunération',
  taux: 'le taux',
  vacances: 'le 4 %',
  type_employe: "le type d'employé",
  action_paie: "l'action (paie)",
  date_embauche: "la date d'embauche",
  nas: 'le NAS',
  compte: 'le compte bancaire',
}

/** Message lisible d'un refus de validation. */
export function messageValidation(e: unknown) {
  const m = /CHAMPS_MANQUANTS:([a-z_,]+)/.exec(String((e as { message?: string })?.message ?? ''))
  if (!m) return null
  const champs = m[1].split(',').map((c) => CHAMPS_VALIDATION[c] ?? c)
  return `Il manque ${champs.length > 1 ? `${champs.slice(0, -1).join(', ')} et ${champs.at(-1)}` : champs[0]}.`
}

/** Valider une embauche : elle devient complète (champs de paie, NAS et compte exigés pour un emploi). */
export function useValiderEmbauche() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['rh-local', 'valider'],
    networkMode: 'always',
    mutationFn: async (embauche: string) => {
      const { error } = await db().rpc('valider_embauche', { p_embauche: embauche })
      if (error) throw error
    },
    onSettled: () => Promise.all([client.invalidateQueries({ queryKey: ['rh', 'embauches'], exact: true }), client.invalidateQueries({ queryKey: ['rh', 'journal'] })]),
  })
}

/** Inviter des personnes à l'intention de retour d'une saison. Rend le nombre de nouvelles invitations. */
export function useInviterRetour() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['rh-local', 'inviter'],
    networkMode: 'always',
    mutationFn: async ({ saison, personnes }: { saison: string; personnes: string[] }) => {
      const { data, error } = await db().rpc('inviter_retour', { p_saison: saison, p_personnes: personnes })
      if (error) throw error
      return data as number
    },
    onSettled: () => Promise.all([client.invalidateQueries({ queryKey: ['rh', 'invitations'] }), client.invalidateQueries({ queryKey: ['rh', 'journal'] })]),
  })
}

/** Retirer une invitation sans réponse (la base refuse les autres). */
export const useRetirerInvitation = () => useRetirer('invitations')

/** Nouvelle version d'un texte des pages publiques (même texte = version relue). */
export function useNouveauTexte() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['rh-local', 'texte'],
    networkMode: 'always',
    mutationFn: async ({ genre, texte }: { genre: GenreTexte; texte: string }) => {
      const { error } = await db().rpc('nouveau_texte', { p_genre: genre, p_texte: texte })
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['rh', 'textes'] }),
  })
}

export function useFusionnerPersonnes() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['rh-local', 'fusionner'],
    networkMode: 'always',
    mutationFn: async ({ garder, retirer }: { garder: string; retirer: string }) => {
      const { error } = await db().rpc('fusionner_personnes', { p_garder: garder, p_retirer: retirer })
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['rh'] }),
  })
}

/** Loi 25 : efface réponses, commentaires et CV d'une candidature (fichiers compris). */
export function useEffacerCandidature() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['rh-local', 'effacer'],
    networkMode: 'always',
    mutationFn: async (id: string) => {
      const { data, error } = await db().rpc('effacer_candidature', { p_candidature: id })
      if (error) throw error
      const chemins = (data as string[] | null) ?? []
      if (chemins.length) await supabase.storage.from(SEAU_DOCUMENTS).remove(chemins)
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['rh'] }),
  })
}

/** NAS et compte en clair : chaque appel est noté dans les consultations. */
export async function lirePaie(personneId: string) {
  const { data, error } = await db().rpc('lire_paie', { p_personne: personneId })
  if (error) throw error
  return data as PaieEnClair
}

export function useEnregistrerPaie(personneId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['rh-local', 'paie'],
    networkMode: 'always',
    mutationFn: async (p: { nas?: string | null; transit?: string | null; institution?: string | null; compte?: string | null; specimen?: string | null }) => {
      const { error } = await db().rpc('enregistrer_paie', {
        p_personne: personneId,
        p_nas: p.nas ?? null,
        p_transit: p.transit ?? null,
        p_institution: p.institution ?? null,
        p_compte: p.compte ?? null,
        p_specimen: p.specimen ?? null,
      })
      if (error) throw error
    },
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['rh', 'paie', personneId] }),
        client.invalidateQueries({ queryKey: ['rh', 'journal', personneId] }),
      ]),
  })
}

// ------------------------------------------------------------
// Fichiers
// ------------------------------------------------------------
const extensionDe = (f: File) => {
  const e = f.name.split('.').pop()?.toLowerCase() ?? ''
  return /^[a-z0-9]{1,5}$/.test(e) ? e : 'bin'
}

/** Envoie un fichier dans le seau privé, puis l'inscrit au dossier. */
export function useAjouterDocument(personneId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['rh-local', 'document'],
    networkMode: 'always',
    mutationFn: async (p: { fichier: File; genre: GenreDocument; expire_le?: string | null; embauche_id?: string | null; candidature_id?: string | null }) => {
      const id = crypto.randomUUID()
      const chemin = `${personneId}/${id}.${extensionDe(p.fichier)}`
      const envoi = await supabase.storage.from(SEAU_DOCUMENTS).upload(chemin, p.fichier, { contentType: p.fichier.type || undefined })
      if (envoi.error) throw envoi.error
      const { error } = await db()
        .from('documents')
        .insert({
          id,
          personne_id: personneId,
          genre: p.genre,
          nom: p.fichier.name,
          chemin,
          type_mime: p.fichier.type || null,
          taille: p.fichier.size,
          expire_le: p.expire_le ?? null,
          embauche_id: p.embauche_id ?? null,
          candidature_id: p.candidature_id ?? null,
        })
      if (error) {
        await supabase.storage.from(SEAU_DOCUMENTS).remove([chemin])
        throw error
      }
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['rh', 'documents', personneId] }),
  })
}

export function useModifierDocument(personneId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['rh-local', 'document-modifier'],
    networkMode: 'always',
    mutationFn: async ({ id, champs }: { id: string; champs: Partial<Document> }) => {
      const { error } = await db().from('documents').update(champs).eq('id', id)
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['rh', 'documents', personneId] }),
  })
}

export function useRetirerDocument(personneId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['rh-local', 'document-retirer'],
    networkMode: 'always',
    mutationFn: async (d: Document) => {
      const { error } = await db().from('documents').delete().eq('id', d.id)
      if (error) throw error
      await supabase.storage.from(SEAU_DOCUMENTS).remove([d.chemin])
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['rh', 'documents', personneId] }),
  })
}

/** Ouvre un fichier du seau dans un nouvel onglet (adresse signée de 10 minutes). */
export async function ouvrirFichier(seau: string, chemin: string) {
  // L'onglet est ouvert tout de suite (sinon le navigateur bloque la fenêtre).
  const onglet = window.open('', '_blank')
  const { data, error } = await supabase.storage.from(seau).createSignedUrl(chemin, DUREE_ADRESSE)
  if (error || !data) {
    onglet?.close()
    throw error ?? new Error('Fichier introuvable')
  }
  if (onglet) onglet.location.href = data.signedUrl
  else window.location.href = data.signedUrl
}

/** Spécimen de chèque : la consultation est notée, puis le fichier s'ouvre. */
export async function ouvrirSpecimen(personneId: string, chemin: string) {
  const { error } = await db().rpc('noter_consultation', { p_personne: personneId, p_quoi: 'specimen' })
  if (error) throw error
  await ouvrirFichier(SEAU_PAIE, chemin)
}

/** Envoie un nouveau spécimen de chèque (l'ancien fichier est retiré). */
export async function envoyerSpecimen(personneId: string, fichier: File, ancien: string | null) {
  const chemin = `${personneId}/${crypto.randomUUID()}.${extensionDe(fichier)}`
  const envoi = await supabase.storage.from(SEAU_PAIE).upload(chemin, fichier, { contentType: fichier.type || undefined })
  if (envoi.error) throw envoi.error
  const { error } = await db().rpc('enregistrer_paie', { p_personne: personneId, p_specimen: chemin })
  if (error) {
    await supabase.storage.from(SEAU_PAIE).remove([chemin])
    throw error
  }
  if (ancien) await supabase.storage.from(SEAU_PAIE).remove([ancien])
}

export function useAjouterNote(personneId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['rh', 'notes', 'ajouter'],
    networkMode: 'always',
    mutationFn: async (n: Pick<Note, 'genre' | 'jour' | 'texte'> & { embauche_id?: string | null }) => {
      const { error } = await db().from('notes').insert({ ...n, personne_id: personneId })
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['rh', 'notes', personneId] }),
  })
}

export function useRetirerNote(personneId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['rh', 'notes', 'supprimer'],
    networkMode: 'always',
    mutationFn: async (id: string) => {
      const { error } = await db().from('notes').delete().eq('id', id)
      if (error) throw error
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['rh', 'notes', personneId] }),
  })
}
