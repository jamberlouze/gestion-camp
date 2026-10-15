// Prompts envoyés à Claude (section 5 de la feuille de route). Fonctions
// pures : tout ce qui varie (critères, règles, programmes connus) est
// passé en paramètre.

const STATUTS = {
  nouveau: 'nouvelle',
  a_valider: 'en attente',
  rejete: 'rejetée',
  en_cours: 'en cours',
  obtenu: 'obtenue',
  refuse: 'refusée',
  expire: 'expirée',
}

/** « 2025-26 » pour l'année fiscale 2026 (1er oct. 2025 au 30 sept. 2026). */
export const libelleAnneeFiscale = (fy) => `${fy - 1}-${String(fy).slice(2)}`

const FORMAT_JSON = `Réponds uniquement avec un tableau JSON, sans texte autour. Chaque élément :
{
  "program_name": string,
  "organisme": string,
  "description": string (2 à 4 phrases),
  "source_url": string (page officielle),
  "grant_type": "salarial" | "immobilisation" | "formation" | "rd" | "exportation" | "marketing" | "autre",
  "potential_amount_min": number | null,
  "potential_amount_max": number | null,
  "open_date": "YYYY-MM-DD" | null,
  "deadline_date": "YYYY-MM-DD" | null,
  "funded_start": "YYYY-MM-DD" | null (début de la période financée : emplois, projet ou dépenses admissibles),
  "funded_end": "YYYY-MM-DD" | null (fin de la période financée),
  "eligibility_criteria": string | null (principaux critères d'admissibilité, 1 à 3 phrases),
  "relevance_justification": string,
  "program_key": string (identifiant normalisé en minuscules, sans accents, ex. "emplois-ete-canada")
}
Si tu n'es pas certain d'une date ou d'un montant, mets null plutôt que d'inventer.
Si tu ne trouves rien de nouveau, réponds [].`

const LIBELLES_CHAMPS = {
  source_url: 'lien',
  open_date: 'ouverture',
  deadline_date: 'date limite',
  funded_start: 'période financée du',
  funded_end: 'au',
  potential_amount_min: 'montant min.',
  potential_amount_max: 'montant max.',
  eligibility_criteria: 'critères',
}

const FORMAT_MISE_A_JOUR = `Réponds uniquement avec un tableau JSON, un élément par subvention vérifiée, sans texte autour :
{
  "ref": "S1",
  "source_url": string | null (page officielle à jour de l'édition visée),
  "open_date": "YYYY-MM-DD" | null,
  "deadline_date": "YYYY-MM-DD" | null,
  "funded_start": "YYYY-MM-DD" | null,
  "funded_end": "YYYY-MM-DD" | null,
  "potential_amount_min": number | null,
  "potential_amount_max": number | null,
  "eligibility_criteria": string | null,
  "verification_url": string | null (page où tu as vérifié),
  "comment": string | null (ce qui a changé, en une phrase),
  "new_edition": null | {
    "program_name": string, "source_url": string | null, "open_date": "YYYY-MM-DD" | null,
    "deadline_date": "YYYY-MM-DD" | null, "funded_start": "YYYY-MM-DD" | null, "funded_end": "YYYY-MM-DD" | null,
    "potential_amount_min": number | null, "potential_amount_max": number | null,
    "eligibility_criteria": string | null, "description": string | null
  }
}
Donne les dates, montants et le lien tels que la page officielle les indique aujourd'hui, même s'ils sont
identiques à ceux connus (l'app ne garde que ce qui change). "eligibility_criteria" : seulement si les
critères connus sont absents ou ont changé sur le fond, sinon null. Mets null pour tout ce que tu n'as pas
pu vérifier : n'invente rien.`

/**
 * Prompt de la mise à jour ciblée : les subventions retenues (en cours) ou
 * obtenues d'une entreprise, avec ce que l'app en sait. Une obtenue ne
 * change pas : on n'y cherche que la nouvelle édition.
 * @param {{ entreprise: {name: string, legal_status: string|null},
 *           subventions: (object & {ref: string})[], aujourdhui: string }} p
 */
export function invitationMiseAJour({ entreprise, subventions, aujourdhui }) {
  const valeur = (g, c) => {
    const v = g[c]
    if (v == null || v === '') return '—'
    return typeof v === 'string' ? v.replace(/\s+/g, ' ').slice(0, 600) : String(v)
  }
  const lignes = subventions
    .map((g) =>
      [
        g.ref,
        g.status === 'obtenu' ? `obtenue (${libelleAnneeFiscale(g.fiscal_year)})` : 'en cours',
        g.program_name,
        g.organisme ?? '—',
        ...Object.entries(LIBELLES_CHAMPS).map(([c, libelle]) => `${libelle} ${valeur(g, c)}`),
      ].join(' | '),
    )
    .join('\n')

  return `Tu es un agent de veille de financement pour ${entreprise.name}${entreprise.legal_status?.trim() ? ` (${entreprise.legal_status.trim()})` : ''},
située au Québec (région des Laurentides). Nous sommes le ${aujourdhui}. L'année fiscale du groupe va du
1er octobre au 30 septembre.

La direction suit déjà les subventions ci-dessous. Vérifie chacune sur sa page officielle (au besoin par
une recherche web) :
- « en cours » (demande à préparer ou déposée) : la date d'ouverture, la date limite, la période financée,
  les montants, les critères d'admissibilité et le lien officiel de l'édition visée ; "new_edition" = null.
- « obtenue » : ne change rien à cette subvention (laisse les autres champs à null) ; cherche seulement si
  une nouvelle édition (nouvel appel, nouvelle année) est ouverte ou annoncée, et donne-la dans
  "new_edition" (sinon null).

Subventions à vérifier — réf. | statut | nom | organisme | ce que l'app en sait :
${lignes}

${FORMAT_MISE_A_JOUR}`
}

const PRIORITE_SALARIALE = `Priorité absolue : les subventions salariales (embauche, main-d'œuvre, formation, jeunes,
emplois d'été).`
const SANS_PERSONNEL = `Cette entreprise n'embauche pas de personnel : ne propose de programmes salariaux que s'ils
restent plausibles pour elle, et concentre-toi sur ce qui correspond à ses activités et à ses actifs.`

/**
 * Prompt de recherche pour une entreprise. Le contexte du groupe vient de
 * la liste des entreprises (rien à tenir à jour à la main) ; la priorité
 * salariale ne vaut que pour une entreprise qui embauche (hires_staff).
 * @param {{ entreprise: {name: string, legal_status: string|null, specific_criteria: string|null, hires_staff?: boolean},
 *           groupe: {name: string, legal_status: string|null}[], consignes: string, regles: string|null,
 *           connus: {program_name: string, source_url: string|null, status: string, program_key: string|null, discovered_fy: number}[],
 *           aujourdhui: string }} p
 */
export function invitationRecherche({ entreprise, groupe, consignes, regles, connus, aujourdhui }) {
  const statut =
    entreprise.legal_status?.trim() ||
    'statut juridique non précisé : considère autant les programmes pour OBNL que pour entreprises'
  const membres = groupe.map((e) => `- ${e.name}${e.legal_status?.trim() ? ` (${e.legal_status.trim()})` : ''}`).join('\n')
  const liste = connus.length
    ? connus
        .map(
          (g) =>
            `- ${g.program_name} | ${g.source_url ?? 'sans adresse'} | ${STATUTS[g.status] ?? g.status} | ${g.program_key ?? '-'} | ${libelleAnneeFiscale(g.discovered_fy)}`,
        )
        .join('\n')
    : '(aucun pour l’instant)'

  return `Tu es un agent de veille de financement pour ${entreprise.name} (${statut}), située au Québec
(région des Laurentides). Trouve des programmes de subvention, de crédit d'impôt ou de financement
actuellement ouverts ou à venir qui pourraient s'appliquer.

Nous sommes le ${aujourdhui}. L'année fiscale du groupe va du 1er octobre au 30 septembre.

Entreprises du groupe (chacune a sa propre recherche ; celle-ci vise seulement ${entreprise.name}) :
${membres}

${entreprise.hires_staff === false ? SANS_PERSONNEL : PRIORITE_SALARIALE}
Ratisse large : ne manque rien, quitte à proposer des programmes marginaux.
${consignes?.trim() ? `\nConsignes de la direction pour tout le groupe :\n${consignes.trim()}\n` : ''}
Critères propres à cette entreprise :
${entreprise.specific_criteria?.trim() || '(aucun pour l’instant)'}

Règles apprises des validations et rejets précédents :
${regles?.trim() || 'Aucune règle apprise pour l’instant : la direction n’a encore validé ou rejeté aucune proposition.'}

Programmes déjà connus (ne pas reproposer) — nom | adresse | statut | program_key | année fiscale :
${liste}
Seule exception : un programme récurrent « obtenue », « refusée » ou « expirée » une année fiscale
précédente peut être reproposé si une nouvelle édition (nouvel appel, nouvelle année) est ouverte ou
annoncée ; garde alors le même program_key.

Sources à couvrir : sites gouvernementaux fédéraux et provinciaux, Hello Darwin, organismes
sectoriels et régionaux, et une recherche générale pour les programmes moins évidents.
Vérifie sur la page officielle les dates et les montants que tu indiques.

${FORMAT_JSON}`
}

/**
 * Prompt de synthèse de la mémoire (section 5.2), suivi de l'historique.
 * @param {{ feedback: object[], entreprise: {name: string} }} p
 */
export function invitationMemoire({ feedback, entreprise }) {
  const lignes = feedback.map((f) => {
    const morceaux = [
      f.decided_at?.slice(0, 10),
      f.decision === 'valide' ? 'VALIDÉE' : `REJETÉE (${f.reject_category ?? 'autre'})`,
      `${f.program_name}${f.organisme ? ` — ${f.organisme}` : ''}`,
      `type ${f.grant_type}`,
      f.potential_amount_max != null ? `jusqu'à ${f.potential_amount_max} $` : null,
      `entreprise : ${f.company_name}`,
      f.source_url ? `source : ${hote(f.source_url)}` : null,
      f.comment ? `commentaire : « ${f.comment} »` : null,
    ]
    return `- ${morceaux.filter(Boolean).join(' | ')}`
  })

  return `Voici l'historique de décisions humaines (validé / rejeté, avec catégorie et commentaire) sur des
subventions proposées. Produis un résumé court et actionnable de règles apprises pour guider les
prochaines recherches : types de programmes à privilégier, types à éviter et pourquoi, sources
fiables ou peu fiables, seuils de montant, nuances d'admissibilité. Distingue les règles
communes au groupe de celles propres à chaque entreprise. Reste sous 500 mots.
Si le feedback est insuffisant pour conclure quelque chose, dis-le plutôt que d'extrapoler.

La prochaine recherche vise : ${entreprise.name}. Mets en évidence ce qui la concerne.
Réponds en français, en texte simple (listes à puces permises), sans préambule.

Historique (${feedback.length} décision${feedback.length > 1 ? 's' : ''}, la plus récente d'abord) :
${lignes.join('\n')}`
}

/** Prompt de rattrapage : remettre en JSON une réponse mal formée (programmes ou mises à jour). */
export function invitationReparation(texte, quoi = 'programmes') {
  return `La réponse ci-dessous, produite par un agent de veille de subventions, devait être un tableau
JSON de ${quoi}. Extrais-en tous les éléments, sans en inventer ni en ajouter, et rends-les dans
le format demandé. Mets null pour toute valeur absente.

Réponse à convertir :
<<<
${texte}
>>>`
}

function hote(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
