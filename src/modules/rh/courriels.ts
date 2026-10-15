// Courriels du module RH (plan-rh.md §5) : genres, champs des modèles, rendu
// texte et HTML. Chaque compagnie envoie de sa boîte (réglages rh.compagnies) ;
// choisir un statut prépare le courriel, qu'on relit, corrige puis envoie
// d'un clic (Worker). L'accusé de réception et le résumé quotidien partent
// seuls ; le rappel de dossier est préparé seul après quelques jours.
//
// Fichier pur : l'app prépare avec lui, le Worker aussi (accusé, rappel,
// résumé) et s'en sert pour le HTML de l'envoi.

export type GenreCourriel =
  | 'accuse'
  | 'entrevue'
  | 'refus_entrevue'
  | 'refus_equipe'
  | 'aspi'
  | 'permis'
  | 'bienvenue'
  | 'rappel_dossier'
  | 'retour'
  | 'resume'
  | 'autre'

export const GENRES_COURRIEL: { id: Exclude<GenreCourriel, 'autre'>; nom: string; aide: string }[] = [
  { id: 'accuse', nom: 'Accusé de réception', aide: 'Au candidat, dès que le formulaire /emplois est reçu.' },
  { id: 'entrevue', nom: "Proposition d'entrevue", aide: 'Statut « Entrevue proposée » ; lien de prise de rendez-vous de la compagnie.' },
  { id: 'refus_entrevue', nom: 'Refus après entrevue', aide: 'Statut « Refusée après entrevue ».' },
  { id: 'refus_equipe', nom: 'Refus, équipe complète', aide: 'Statut « Refusée (équipe complète) ».' },
  { id: 'aspi', nom: 'Proposition ASPI', aide: 'Statut « ASPI proposé ».' },
  { id: 'permis', nom: 'Question de permis de travail', aide: 'Statut « Question de permis de travail ».' },
  { id: 'bienvenue', nom: 'Bienvenue (embauche)', aide: "Lien du dossier d'embauche, où l'on signe aussi le contrat." },
  { id: 'rappel_dossier', nom: 'Rappel de dossier incomplet', aide: 'Préparé seul, quelques jours après le lien du dossier, si rien n’est reçu.' },
  { id: 'retour', nom: 'Intention de retour', aide: 'Lien personnel de l’intention de retour (envoi en lot).' },
  { id: 'resume', nom: 'Résumé quotidien (direction)', aide: 'Nouveautés du jour, envoyé seul à la direction.' },
]

export const nomGenre = (g: GenreCourriel) => GENRES_COURRIEL.find((x) => x.id === g)?.nom ?? 'Courriel'

/** Statut de candidature → courriel préparé quand on le choisit. */
export const COURRIEL_DU_STATUT: Partial<Record<string, GenreCourriel>> = {
  entrevue_proposee: 'entrevue',
  refusee_apres_entrevue: 'refus_entrevue',
  refusee_equipe_complete: 'refus_equipe',
  aspi_proposee: 'aspi',
  permis_travail: 'permis',
}

/** Champs offerts dans les modèles (aide de l'onglet Courriels). */
export const CHAMPS_COURRIELS: [string, string][] = [
  ['prenom', 'Prénom'],
  ['appel', 'Nom de camp, sinon prénom'],
  ['compagnie', 'Compagnie (nom d’expéditeur)'],
  ['attrait', '« notre camp de vacances »… (réglage de la compagnie)'],
  ['lien_rendez_vous', 'Prise de rendez-vous (réglage de la compagnie)'],
  ['saison', 'Saison (embauche, invitation)'],
  ['saisons', 'Saisons demandées'],
  ['poste', 'Poste de l’embauche'],
  ['postes', 'Postes demandés'],
  ['lien_dossier', 'Lien du dossier d’embauche'],
  ['lien_retour', 'Lien de l’intention de retour'],
  ['lien_emplois', 'Formulaire de candidature'],
  ['expediteur', 'Nom de la personne qui envoie'],
  ['signature', 'Signature de la compagnie (réglage)'],
]

export interface ModeleCourriel {
  id: string
  genre: GenreCourriel
  entreprise_id: string | null
  sujet: string
  corps: string
  sujet_en: string | null
  corps_en: string | null
  mode: 'approuver' | 'automatique' | 'desactive'
}

/** Réglages RH d'une compagnie (rh.compagnies). */
export interface CompagnieRh {
  entreprise_id: string
  adresse_envoi: string | null
  nom_expediteur: string | null
  signature: string | null
  lien_rendez_vous: string | null
  attrait: string | null
  raison_sociale: string | null
  nom_court: string | null
  adresse: string | null
  telephone: string | null
}

/** Le modèle propre à la compagnie, sinon le modèle commun du genre. */
export function modelePour<M extends Pick<ModeleCourriel, 'genre' | 'entreprise_id'>>(modeles: M[], genre: GenreCourriel, entrepriseId: string | null) {
  return modeles.find((m) => m.genre === genre && m.entreprise_id && m.entreprise_id === entrepriseId) ?? modeles.find((m) => m.genre === genre && !m.entreprise_id) ?? null
}

/** Mode du genre : celui du modèle commun. */
export const modeDuGenre = (modeles: ModeleCourriel[], genre: GenreCourriel) => modeles.find((m) => m.genre === genre && !m.entreprise_id)?.mode ?? 'approuver'

/** « a, b et c ». */
export function liste(mots: string[], et = 'et') {
  const m = mots.filter(Boolean)
  return m.length > 1 ? `${m.slice(0, -1).join(', ')} ${et} ${m.at(-1)}` : (m[0] ?? '')
}

export interface ContexteCourriel {
  personne?: { prenom: string; surnom?: string | null }
  compagnie?: Partial<CompagnieRh> & { nom?: string | null }
  saison?: string | null
  saisons?: string[]
  poste?: string | null
  postes?: string[]
  lienDossier?: string | null
  lienRetour?: string | null
  lienEmplois?: string | null
  lienApp?: string | null
  /** Nom de la personne qui prépare (sinon « La direction ») */
  expediteur?: string | null
  liste?: string | null
  langue?: 'fr' | 'en'
}

export function champsCourriel(c: ContexteCourriel): Record<string, string> {
  const en = c.langue === 'en'
  return {
    prenom: c.personne?.prenom ?? '',
    appel: c.personne?.surnom || c.personne?.prenom || '',
    compagnie: c.compagnie?.nom_expediteur || c.compagnie?.nom || '',
    attrait: c.compagnie?.attrait ?? '',
    lien_rendez_vous: c.compagnie?.lien_rendez_vous ?? '',
    signature: c.compagnie?.signature ?? '',
    saison: c.saison ?? '',
    saisons: liste(c.saisons ?? [], en ? 'and' : 'et'),
    poste: c.poste ?? '',
    postes: liste(c.postes ?? [], en ? 'and' : 'et'),
    lien_dossier: c.lienDossier ?? '',
    lien_retour: c.lienRetour ?? '',
    lien_emplois: c.lienEmplois ?? '',
    lien_app: c.lienApp ?? '',
    expediteur: c.expediteur || (en ? 'The management team' : 'La direction'),
    liste: c.liste ?? '',
  }
}

const vrai = (v: string | undefined) => !!v && v.trim() !== ''

/** Remplace {{champ}} (inconnu ou vide : « [champ ?] », à corriger avant l'envoi) et garde les {{#si champ}}…{{/si}} remplis. */
export function remplirTexte(texte: string, champs: Record<string, string>) {
  const lignes: string[] = []
  const pile: boolean[] = []
  for (const l of texte.replace(/\r/g, '').split('\n')) {
    const si = /^\s*\{\{#si\s+(\w+)\s*\}\}\s*$/.exec(l)
    if (si) {
      pile.push(vrai(champs[si[1]]))
      continue
    }
    if (/^\s*\{\{\/si\}\}\s*$/.test(l)) {
      pile.pop()
      continue
    }
    if (pile.every(Boolean)) lignes.push(l)
  }
  return lignes.join('\n').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => (vrai(champs[k]) ? champs[k] : `[${k} ?]`))
}

/** Sujet et corps rendus, dans la langue demandée (anglais seulement si le modèle a sa version anglaise). */
export function rendreCourriel(m: Pick<ModeleCourriel, 'sujet' | 'corps' | 'sujet_en' | 'corps_en'>, langue: 'fr' | 'en', champs: Record<string, string>) {
  const en = langue === 'en' && !!m.corps_en?.trim()
  return {
    langue: (en ? 'en' : 'fr') as 'fr' | 'en',
    sujet: remplirTexte(en ? (m.sujet_en ?? m.sujet) : m.sujet, champs).replace(/\s+/g, ' ').trim(),
    corps: remplirTexte(en ? m.corps_en! : m.corps, champs).trim(),
  }
}

/** Champs restés vides dans un courriel rendu (« [lien_dossier ?] »…). */
export const champsManquants = (texte: string) => [...new Set([...texte.matchAll(/\[(\w+) \?\]/g)].map((m) => m[1]))]

const echapper = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Corps texte → HTML simple : **gras**, [texte](lien), adresses en liens, puces « * » ou « - ». */
export function versHtml(corps: string) {
  const ligne = (l: string) =>
    echapper(l)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2">$2</a>')
  const html: string[] = []
  let liste = false
  for (const l of corps.replace(/\r/g, '').split('\n')) {
    const puce = /^\s*[*-]\s+(.*)$/.exec(l)
    if (puce) {
      if (!liste) html.push('<ul style="margin:4px 0;padding-left:20px">')
      liste = true
      html.push(`<li>${ligne(puce[1])}</li>`)
      continue
    }
    if (liste) html.push('</ul>')
    liste = false
    html.push(l.trim() ? `${ligne(l)}<br>` : '<br>')
  }
  if (liste) html.push('</ul>')
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2937">${html.join('\n')}</div>`
}

/** Corps texte de l'envoi (partie texte du message) : liens « texte (adresse) », sans les ** du gras. */
export const versTexte = (corps: string) => corps.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)').replace(/\*\*(.+?)\*\*/g, '$1')

/** Compagnie qui écrit au candidat : celle qui traite la candidature, sinon celle du premier poste demandé. */
export function compagnieDeCandidature(c: { entreprise_id: string | null; poste_ids: string[] }, postes: { id: string; entreprise_id: string }[]) {
  return c.entreprise_id ?? postes.find((p) => c.poste_ids.includes(p.id))?.entreprise_id ?? null
}

/** Nouveautés du résumé quotidien (rh.nouveautes) → texte de la liste ; vide = rien à envoyer. */
export function listeNouveautes(n: {
  candidatures: { nom: string }[]
  retours: { nom: string; reponse: string | null; saison: string }[]
  dossiers: { nom: string; saison: string }[]
}) {
  const blocs: string[] = []
  if (n.candidatures.length) blocs.push(`Nouvelles candidatures (${n.candidatures.length}) :\n${n.candidatures.map((c) => `- ${c.nom}`).join('\n')}`)
  if (n.retours.length) blocs.push(`Intentions de retour (${n.retours.length}) :\n${n.retours.map((r) => `- ${r.nom} : ${r.reponse === 'oui' ? 'Oui' : 'Non'} (${r.saison})`).join('\n')}`)
  if (n.dossiers.length) blocs.push(`Dossiers d'embauche reçus (${n.dossiers.length}) :\n${n.dossiers.map((d) => `- ${d.nom} (${d.saison})`).join('\n')}`)
  return blocs.join('\n\n')
}
