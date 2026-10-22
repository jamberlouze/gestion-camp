// Prompts envoyés à Claude (section 5 de la feuille de route). Fonctions
// pures : tout ce qui varie (critères, règles, programmes connus) est
// passé en paramètre.

const STATUTS = {
  nouveau: 'nouvelle',
  a_valider: 'en attente',
  rejete: 'rejetée',
  a_faire: 'à faire',
  depose: 'déposée',
  // Acceptée, argent reçu ou pas : pour Claude, obtenue.
  obtenu: 'obtenue',
  complete: 'obtenue',
  refuse: 'refusée',
  desiste: 'désistée',
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
        g.status === 'obtenu' || g.status === 'complete' ? `obtenue (${libelleAnneeFiscale(g.fiscal_year)})` : 'en cours',
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

// Recherche par thème (décision de Maxime du 2026-10-17, après l'essai : 119 programmes distincts
// contre 64, en 200 recherches web contre 322) : une recherche par thème pour tout le groupe, puis
// une courte recherche « angle mort » par entreprise. Ne pas nommer ici les programmes qu'on veut
// voir trouvés : seulement des familles d'organismes.
const SANS_PERSONNEL = `Cette entreprise n'embauche pas de personnel : ne propose de programmes salariaux que s'ils
restent plausibles pour elle, et concentre-toi sur ce qui correspond à ses activités et à ses actifs.`
// En octobre, les programmes d'été sont fermés : ils comptent quand même (leçon du 2026-10-17).
// Une date limite passée ferait expirer la carte le lendemain (expirer_echues).
const RECURRENTS = `Un programme récurrent fermé aujourd'hui (emplois d'été, stages, appel annuel) compte aussi : propose-le.
Donne les dates de sa prochaine édition si elles sont annoncées ; sinon mets ses dates à null et dis dans la
description quand il ouvre d'habitude. Ne donne jamais les dates d'une édition passée.`

/** Consigne de chaque thème : ce qu'il couvre, puis ses familles d'organismes, une à une. Clés de THEMES (themes.ts). */
export const TEXTES_THEMES = {
  salarial: {
    titre: "les subventions salariales et l'aide à l'embauche",
    texte: `Cette recherche porte seulement sur les subventions salariales et l'aide à l'embauche : tout programme
qui paie une partie d'un salaire, d'un stage, d'un emploi d'été ou de la formation des employés, crédits
d'impôt compris.

Beaucoup de subventions salariales ne sont pas versées par un ministère, mais par un organisme qui gère
l'argent pour lui (conseil sectoriel, association, chambre de commerce, fonds syndical, fondation) : une
recherche générale ne les trouve pas. Passe en revue chaque famille ci-dessous, une à une :
1. Programmes des gouvernements : fédéral (Emploi et Développement social Canada, Patrimoine canadien…),
   Québec (Services Québec, dont chacune de ses mesures d'aide à l'embauche et à l'emploi saisonnier ;
   ministères du Tourisme, de l'Éducation — loisir et sport —, de l'Économie…), MRC, villes et
   organismes régionaux des Laurentides.
2. Programme de stages pratiques pour étudiants (PSPE) d'Emploi et Développement social Canada : il est
   distribué par une vingtaine d'organismes partenaires, chacun avec son programme, ses secteurs, ses taux
   et ses dates. Trouve la liste à jour des partenaires et vérifie chacun, même si son secteur semble loin
   du nôtre : beaucoup acceptent tout employeur dont le stagiaire touche au numérique, au marketing, à la
   gestion, à l'environnement, au tourisme ou au plein air.
3. Stratégie emploi et compétences jeunesse (SECJ) du fédéral : même logique, des organismes délégataires
   (emplois verts, sciences, patrimoine, organismes communautaires…) ; vérifie chacun.
4. Fonds de travailleurs, syndicats, coopératives, économie sociale, fondations, caisses et banques qui
   subventionnent des emplois d'été ou des stages ; Carrefours jeunesse-emploi.
5. Associations et regroupements de nos secteurs (camps de vacances et de jour, loisir, plein air,
   tourisme, sport, accueil de groupes) ; programmes pour embaucher des personnes handicapées, immigrantes,
   autochtones, plus âgées ou éloignées du marché du travail.
6. Crédits d'impôt et allègements liés à l'embauche, aux stages ou à la formation, au Québec et au fédéral.
7. Universités, cégeps et écoles : stages coopératifs et fonds de stages. Leurs pages « financement des
   stages » pour les employeurs listent souvent toutes les subventions salariales offertes : sers-t'en
   comme liste de pistes, puis vérifie chaque programme sur sa page officielle.

Un programme qui ne vaut que pour certains postes (animation, entretien, cuisine, bureau, numérique) ou
pour certains employés (étudiants, jeunes, nouveaux arrivants) est à proposer. Ne nomme pas une entreprise
qui n'embauche pas de personnel.
"grant_type" : "salarial", ou "formation" pour un programme qui paie la formation des employés.`,
  },
  batiments: {
    titre: 'les bâtiments, les terrains, les équipements, l’énergie et l’environnement',
    texte: `Cette recherche porte sur l'aide aux investissements dans les bâtiments, les terrains, les équipements
permanents et les véhicules, sur l'énergie et sur l'environnement (milieux naturels, lacs et rivières,
forêts). Passe en revue chaque famille ci-dessous, une à une :
1. Efficacité énergétique, conversion et production d'énergie (distributeurs d'électricité et de gaz
   naturel, programmes québécois et fédéraux de transition énergétique), bornes de recharge, véhicules et
   flottes électriques.
2. Crédits d'impôt, déductions et amortissement accéléré liés à l'investissement, au Québec et au fédéral.
3. Accessibilité universelle des bâtiments, des sites et des équipements (fédéral, Québec, municipalités,
   organismes qui gèrent ces programmes).
4. Milieux naturels, forêts privées, lacs, rives, cours d'eau et milieux humides, biodiversité :
   programmes pour propriétaires fonciers et organismes (ministères, fondations, MRC, organismes de bassin
   versant, conseils régionaux de l'environnement).
5. Rénovation, mise aux normes et sécurité (incendie, eau potable, eaux usées, installations septiques),
   adaptation aux changements climatiques, patrimoine bâti.
6. Programmes de la ville, de la MRC et des municipalités voisines.
Une entreprise qui détient les bâtiments et les terrains des autres est le premier propriétaire visé ;
les locataires peuvent quand même être admissibles pour leurs propres équipements ou aménagements.
"grant_type" : "immobilisation" ou "autre".`,
  },
  tourisme: {
    titre: 'le tourisme, le plein air, le loisir, le sport et les camps',
    texte: `Cette recherche porte sur les programmes du tourisme, du plein air, du loisir, du sport, des camps de
vacances et de jour et de l'accueil de groupes (scolaires, corporatifs). Passe en revue chaque famille
ci-dessous, une à une :
1. Ministère du Tourisme du Québec et ses partenaires (attraits, entreprises touristiques, accessibilité,
   innovation, ententes régionales avec l'association touristique régionale) ; programmes fédéraux pour
   le tourisme et l'agence fédérale de développement régional du Québec.
2. Ministère de l'Éducation du Québec — loisir et sport : infrastructures récréatives, sportives et de
   plein air, sécurité, accessibilité aux camps, classes nature et sorties éducatives, loisir des
   personnes handicapées, sentiers et sites de plein air ; et leurs relais régionaux (unité régionale de
   loisir et de sport, association régionale pour le loisir des personnes handicapées, association des
   camps, regroupements et fédérations de plein air et de chacun des sports pratiqués dans le groupe).
3. Sécurité nautique, activités sur les lacs et rivières, accès à l'eau.
4. Ville, MRC et fondations locales et régionales qui financent des projets touristiques, de loisir ou de
   plein air.
5. Fondations, entreprises et organismes qui financent l'accès des jeunes au sport, au plein air et aux
   camps, ou la découverte de la nature et de la faune.
6. Éducation : programmes qui financent les sorties, séjours et activités de groupes scolaires (dont les
   séjours d'immersion ou de culture), et que l'entreprise d'accueil peut faire valoir.
"grant_type" : le type qui convient le mieux.`,
  },
  numerique: {
    titre: 'le numérique, l’innovation, la recherche, la formation et la gestion',
    texte: `Cette recherche porte sur le numérique, l'innovation, la recherche et le développement (dont le
développement logiciel interne, si les consignes du groupe en parlent), la formation des employés et des
gestionnaires, et le soutien à la gestion et à la productivité. Passe en revue chaque famille ci-dessous,
une à une :
1. Transformation numérique, commerce en ligne, cybersécurité, intelligence artificielle : programmes du
   Québec, du fédéral et du tourisme, et organismes qui les offrent (centres collégiaux de transfert de
   technologie, réseaux régionaux).
2. Recherche et développement, innovation : crédits d'impôt fédéraux et québécois, organismes fédéraux de
   soutien à l'innovation, partenariats avec les universités et les cégeps, stages de recherche.
3. Formation de la main-d'œuvre et des gestionnaires : Services Québec, Commission des partenaires du
   marché du travail (appels de projets), comités sectoriels de main-d'œuvre (tourisme, loisir, sport…),
   mutuelles de formation.
4. Soutien-conseil en gestion, ressources humaines, productivité, relève et transfert d'entreprise.
5. Investissement Québec, l'agence fédérale de développement régional du Québec, la Banque de
   développement du Canada et les fonds régionaux : productivité, innovation et croissance (contributions,
   prêts à conditions avantageuses).
"grant_type" : "rd", "formation" ou "autre".`,
  },
  regional: {
    titre: 'le développement régional, l’économie sociale, les OBNL, les fondations et les dons',
    texte: `Cette recherche porte sur le financement du développement régional et local, de l'économie sociale,
des organismes à but non lucratif, et sur les fondations, dons et commandites. Passe en revue chaque
famille ci-dessous, une à une :
1. Agence fédérale de développement régional du Québec (programmes régionaux et pour les collectivités),
   SADC, MRC (fonds régions et ruralité, politique de soutien aux projets structurants), organismes de
   développement économique locaux, fonds locaux d'investissement.
2. Économie sociale et programmes réservés aux OBNL (Québec, fédéral, réseaux de financement de
   l'économie sociale).
3. Fondations privées et d'entreprises, caisses (fonds d'aide au développement du milieu), banques,
   sociétés d'État (dons et commandites), fondations locales de la région.
4. Programmes fédéraux et québécois pour les jeunes, l'inclusion, l'accessibilité, la santé et l'activité
   physique, le sport communautaire, les aînés et les familles.
5. Culture, patrimoine et langues (Patrimoine canadien, ministère de la Culture, ministère de la Langue
   française, programmes pour les communautés de langue officielle, etc.).
"grant_type" : le type qui convient le mieux.`,
  },
  marketing: {
    titre: 'le marketing, l’exportation et la clientèle hors Québec',
    texte: `Cette recherche porte sur la commercialisation, la promotion, l'exportation de services (dont les
services éducatifs et touristiques vendus à une clientèle d'autres provinces ou d'autres pays) et
l'accueil de clientèle hors Québec. Passe en revue chaque famille ci-dessous, une à une :
1. Exportation et promotion à l'étranger : programmes fédéraux (Affaires mondiales Canada, Service des
   délégués commerciaux), Investissement Québec International, ministère de l'Économie du Québec,
   organismes régionaux de promotion des exportations.
2. Tourisme international et interprovincial : organismes fédéraux et québécois de promotion
   touristique, Alliance de l'industrie touristique du Québec, association touristique régionale
   (campagnes coopératives, programmes de commercialisation).
3. Marché interprovincial, francophonie canadienne, langues officielles, échanges et séjours linguistiques,
   éducation internationale (fédéral et Québec).
4. Salons, missions commerciales, accueil de groupes étrangers, agents de recrutement, marketing
   numérique.
"grant_type" : "exportation", "marketing" ou "autre".`,
  },
}

const statutEntreprise = (entreprise) =>
  entreprise.legal_status?.trim() ||
  'statut juridique non précisé : considère autant les programmes pour OBNL que pour entreprises'

/** « - Nom (statut, n'embauche pas de personnel) : critères », une ligne par entreprise du groupe. */
function descriptionGroupe(groupe) {
  return groupe
    .map((e) => {
      const criteres = e.specific_criteria?.trim().replace(/\s+/g, ' ')
      return `- ${e.name} (${statutEntreprise(e)}${e.hires_staff === false ? ", n'embauche pas de personnel" : ''})${criteres ? ` : ${criteres}` : ''}`
    })
    .join('\n')
}

/**
 * Programmes connus de tout le groupe, une carte par programme, avec les
 * entreprises de sa carte (`company_ids`, noms tirés du groupe).
 */
function listeConnus(groupe, connus) {
  if (!connus.length) return '(aucun pour l’instant)'
  const noms = new Map(groupe.filter((e) => e.id).map((e) => [e.id, e.name]))
  const pour = (g) => (g.company_ids ?? []).map((id) => noms.get(id)).filter(Boolean).join(', ') || '-'
  return connus
    .map(
      (g) =>
        `- ${g.program_name} | ${g.source_url ?? 'sans adresse'} | ${STATUTS[g.status] ?? g.status} | ${g.program_key ?? '-'} | ${libelleAnneeFiscale(g.discovered_fy)} | ${pour(g)}`,
    )
    .join('\n')
}

const blocConsignes = (consignes) => (consignes?.trim() ? `\nConsignes de la direction pour tout le groupe :\n${consignes.trim()}\n` : '')
const blocRegles = (regles) =>
  `Règles apprises des validations et rejets précédents :
${regles?.trim() || 'Aucune règle apprise pour l’instant : la direction n’a encore validé ou rejeté aucune proposition.'}`

const EXCEPTION_RECURRENT = `Seule exception : un programme récurrent « obtenue », « refusée », « désistée » ou « expirée » une année fiscale
précédente peut être reproposé si une nouvelle édition (nouvel appel, nouvelle année) est ouverte ou
annoncée ; garde alors le même program_key.`

/** Format de réponse d'une recherche par thème : chaque programme nomme ses entreprises, chacune justifiée. */
function formatTheme(groupe) {
  const noms = groupe.map((e) => `"${e.name}"`).join(', ')
  return FORMAT_JSON.replace(
    '  "relevance_justification": string,\n',
    `  "companies": [ { "name": l'un de ${noms}, "justification": string (pourquoi elle peut en profiter) } ],\n`,
  ).replace('Si tu ne trouves rien de nouveau', '"companies" n\'est jamais vide. Si tu ne trouves rien de nouveau')
}

/**
 * Prompt de la recherche d'un thème pour tout le groupe : chaque programme
 * trouvé nomme les entreprises qui peuvent en profiter, chacune avec sa
 * justification. Un programme connu n'est reproposé que pour ajouter une
 * entreprise à sa carte.
 * @param {{ theme: string,
 *           groupe: {id?: string, name: string, legal_status: string|null, specific_criteria?: string|null, hires_staff?: boolean}[],
 *           consignes: string, regles: string|null,
 *           connus: {program_name: string, source_url: string|null, status: string, program_key: string|null, discovered_fy: number, company_ids?: string[]}[],
 *           aujourdhui: string }} p
 */
export function invitationRechercheTheme({ theme, groupe, consignes, regles, connus, aujourdhui }) {
  const t = TEXTES_THEMES[theme]
  if (!t) throw new Error(`Thème inconnu : ${theme}`)
  return `Tu es un agent de veille de financement pour un groupe d'entreprises de Mont-Tremblant, au Québec (région
des Laurentides). Trouve des programmes de subvention, de crédit d'impôt ou de financement actuellement
ouverts ou à venir. Cette recherche porte sur un seul thème, pour tout le groupe à la fois : ${t.titre}.
D'autres recherches couvrent les autres thèmes.

Nous sommes le ${aujourdhui}. L'année fiscale du groupe va du 1er octobre au 30 septembre.

Entreprises du groupe :
${descriptionGroupe(groupe)}
${blocConsignes(consignes)}
${t.texte}

Pour chaque programme, nomme toutes les entreprises du groupe qui peuvent en profiter (« companies »),
chacune avec une justification propre à elle. Tiens compte du statut juridique (OBNL ou entreprise
privée), de l'embauche, des activités et des actifs de chacune. Une entreprise admissible de justesse
peut être nommée : dis-le dans sa justification. N'en nomme aucune qui ne l'est pas.

Ratisse large : ne manque rien, quitte à proposer des programmes marginaux.
${RECURRENTS}

${blocRegles(regles)}

Programmes déjà connus du groupe (une seule fiche par programme, pour une ou plusieurs entreprises) —
nom | adresse | statut | program_key | année fiscale | pour :
${listeConnus(groupe, connus)}
Ne repropose pas un programme déjà connu, sauf s'il s'applique aussi à une entreprise qui n'est pas encore
dans « pour » (et qu'il n'est pas « rejetée ») : repropose-le alors avec exactement le même program_key et
la même adresse, en ne nommant dans « companies » que les entreprises à ajouter (l'app les ajoute à la
fiche existante).
${EXCEPTION_RECURRENT}

Vérifie les dates et les montants que tu indiques sur la page officielle de l'organisme qui verse l'argent.

${formatTheme(groupe)}`
}

/**
 * Prompt de la recherche « angle mort » d'une entreprise, après les
 * recherches par thème : ce qui lui est propre (activités précises, actifs,
 * clientèle, statut) et que des recherches par grand thème pour tout le
 * groupe ont pu manquer. Réponse au format d'une seule entreprise.
 * @param {{ entreprise: {name: string, legal_status: string|null, specific_criteria: string|null, hires_staff?: boolean},
 *           groupe: Parameters<typeof invitationRechercheTheme>[0]['groupe'], consignes: string, regles: string|null,
 *           connus: Parameters<typeof invitationRechercheTheme>[0]['connus'], aujourdhui: string }} p
 */
export function invitationAngleMort({ entreprise, groupe, consignes, regles, connus, aujourdhui }) {
  const themes = Object.values(TEXTES_THEMES)
    .map((t) => t.titre)
    .join(' ; ')
  return `Tu es un agent de veille de financement pour ${entreprise.name} (${statutEntreprise(entreprise)}), située au Québec
(région des Laurentides). Nous sommes le ${aujourdhui}. L'année fiscale du groupe va du 1er octobre au 30 septembre.

Des recherches par thème ont déjà couvert tout le groupe (${themes}) : leurs programmes sont dans la liste
des programmes connus ci-dessous. Cette courte recherche cherche ce qui est propre à ${entreprise.name} et
qu'une recherche par grand thème pour tout le groupe a pu manquer : programmes liés à ses activités
précises, à ses actifs, à sa clientèle, à son statut ou à son secteur. Ne refais pas les recherches
générales.

Entreprises du groupe (pour le contexte) :
${groupe.map((e) => `- ${e.name}${e.legal_status?.trim() ? ` (${e.legal_status.trim()})` : ''}`).join('\n')}

Critères propres à ${entreprise.name} :
${entreprise.specific_criteria?.trim() || '(aucun pour l’instant)'}
${entreprise.hires_staff === false ? `\n${SANS_PERSONNEL}\n` : ''}${blocConsignes(consignes)}
${RECURRENTS}

${blocRegles(regles)}

Programmes déjà connus du groupe (une seule fiche par programme, pour une ou plusieurs entreprises) —
nom | adresse | statut | program_key | année fiscale | pour :
${listeConnus(groupe, connus)}
Ne repropose pas un programme déjà connu pour ${entreprise.name}. Un programme connu seulement pour d'autres
entreprises du groupe (et pas « rejetée ») : repropose-le s'il s'applique aussi à ${entreprise.name}, avec
exactement le même program_key et la même adresse, et une justification propre à ${entreprise.name} (l'app
l'ajoute à la fiche existante).
${EXCEPTION_RECURRENT}

Vérifie sur la page officielle les dates et les montants que tu indiques.

${FORMAT_JSON}`
}

/**
 * Prompt de synthèse de la mémoire (section 5.2), suivi de l'historique.
 * `entreprise` null : mémoire du groupe, pour les recherches par thème.
 * @param {{ feedback: object[], entreprise: {name: string} | null }} p
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

${
  entreprise
    ? `La prochaine recherche vise : ${entreprise.name}. Mets en évidence ce qui la concerne.`
    : `La prochaine recherche vise tout le groupe, par thème : garde les règles propres à chaque entreprise, en la nommant.`
}
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
