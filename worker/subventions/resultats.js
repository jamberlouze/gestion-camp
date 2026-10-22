// Lecture et validation de la réponse de Claude (fonctions pures, testées
// par resultats.test.js). La réponse doit être un tableau JSON ; chaque
// élément est vérifié et nettoyé avant d'aller dans la base. Un élément
// sans nom ou sans adresse web valide est écarté (et compté).

export const TYPES = ['salarial', 'immobilisation', 'formation', 'rd', 'exportation', 'marketing', 'autre']

/** « Emplois d'été Canada » → « emplois-dete-canada » (minuscules, sans accents). */
export function cleProgramme(texte) {
  return String(texte ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '')
}

/**
 * Extrait le tableau JSON d'une réponse (tolère des clôtures ```json et du
 * texte autour). Lève une erreur si aucun tableau lisible n'est trouvé.
 */
export function extraireTableau(texte) {
  const propre = String(texte ?? '').replace(/```(?:json)?/gi, '')
  const debut = propre.indexOf('[')
  const fin = propre.lastIndexOf(']')
  if (debut < 0 || fin <= debut) throw new Error('Aucun tableau JSON dans la réponse.')
  const valeur = JSON.parse(propre.slice(debut, fin + 1))
  if (!Array.isArray(valeur)) throw new Error("La réponse n'est pas un tableau JSON.")
  return valeur
}

function texteOuNull(v, max) {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

/** Nombre positif, ou texte comme « 50 000 $ » ; sinon null. */
export function montant(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null
  if (typeof v !== 'string') return null
  const t = v.replace(/[\s $]/g, '').replace(/,(\d{2})$/, '.$1').replace(/,/g, '')
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return n >= 0 && n < 1e10 ? Math.round(n * 100) / 100 : null
}

/** « AAAA-MM-JJ » valide, sinon null. */
export function dateIso(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null
}

export function typeSubvention(v) {
  const t = cleProgramme(v).replace(/-/g, '')
  if (TYPES.includes(t)) return t
  if (t === 'recherche' || t === 'rechercheetdeveloppement' || t === 'innovation') return 'rd'
  if (t === 'salaire' || t === 'emploi' || t === 'maindoeuvre') return 'salarial'
  return 'autre'
}

function adresseWeb(v) {
  if (typeof v !== 'string') return null
  try {
    const u = new URL(v.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

/** Montants min et max (dans l'ordre), période financée (dans l'ordre). */
function montantsEtPeriode(brut) {
  let min = montant(brut.potential_amount_min)
  let max = montant(brut.potential_amount_max)
  if (min != null && max != null && min > max) [min, max] = [max, min]
  let debut = dateIso(brut.funded_start)
  let fin = dateIso(brut.funded_end)
  if (debut && fin && fin < debut) [debut, fin] = [fin, debut]
  return { potential_amount_min: min, potential_amount_max: max, funded_start: debut, funded_end: fin }
}

/** Un élément de la réponse → { ok, valeur } ou { ok: false, raison }. */
export function validerProgramme(brut) {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return { ok: false, raison: 'élément qui n’est pas un objet' }
  const nom = texteOuNull(brut.program_name, 300)
  if (!nom) return { ok: false, raison: 'nom de programme manquant' }
  const url = adresseWeb(brut.source_url)
  if (!url) return { ok: false, raison: `adresse web manquante ou invalide (${nom})` }
  const { potential_amount_min, potential_amount_max, funded_start, funded_end } = montantsEtPeriode(brut)
  return {
    ok: true,
    valeur: {
      program_name: nom,
      organisme: texteOuNull(brut.organisme, 300),
      description: texteOuNull(brut.description, 4000),
      source_url: url,
      grant_type: typeSubvention(brut.grant_type),
      potential_amount_min,
      potential_amount_max,
      open_date: dateIso(brut.open_date),
      deadline_date: dateIso(brut.deadline_date),
      funded_start,
      funded_end,
      eligibility_criteria: texteOuNull(brut.eligibility_criteria, 4000),
      relevance_justification: texteOuNull(brut.relevance_justification, 4000),
      program_key: cleProgramme(brut.program_key) || cleProgramme(nom),
    },
  }
}

/**
 * Programme dont la date limite est passée (`aujourdhui` = « AAAA-MM-JJ » à
 * Montréal) : ses dates sont celles d'une édition passée — on les retire,
 * sinon la carte expirerait le lendemain (expirer_echues) au lieu d'attendre
 * la prochaine édition.
 */
export function sansEditionPassee(programmes, aujourdhui) {
  return programmes.map((p) =>
    p.deadline_date && p.deadline_date < aujourdhui
      ? { ...p, open_date: null, deadline_date: null, funded_start: null, funded_end: null }
      : p,
  )
}

/** Champs qu'une mise à jour ciblée peut remplir ou proposer (mêmes que grant_proposals.field). */
export const CHAMPS_MISE_A_JOUR = [
  'source_url',
  'open_date',
  'deadline_date',
  'funded_start',
  'funded_end',
  'potential_amount_min',
  'potential_amount_max',
  'eligibility_criteria',
]

/**
 * Un élément de la réponse d'une mise à jour ciblée → { ok, valeur } ou
 * { ok: false, raison }. `parRef` : « S1 » → la subvention envoyée. Une
 * subvention acceptée (ou complétée) ne change jamais : seule sa nouvelle
 * édition compte.
 */
export function validerMiseAJour(brut, parRef) {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return { ok: false, raison: 'élément qui n’est pas un objet' }
  const g = parRef.get(String(brut.ref ?? '').trim().toUpperCase())
  if (!g) return { ok: false, raison: `référence inconnue (${String(brut.ref ?? '').slice(0, 20) || 'aucune'})` }
  const enCours = g.status === 'a_faire' || g.status === 'depose'
  const champs = {
    source_url: adresseWeb(brut.source_url),
    open_date: dateIso(brut.open_date),
    deadline_date: dateIso(brut.deadline_date),
    ...montantsEtPeriode(brut),
    eligibility_criteria: texteOuNull(brut.eligibility_criteria, 4000),
  }
  const valeur = {
    grant_id: g.id,
    ...Object.fromEntries(CHAMPS_MISE_A_JOUR.map((c) => [c, enCours ? champs[c] : null])),
    verification_url: adresseWeb(brut.verification_url),
    comment: texteOuNull(brut.comment, 1000),
    new_edition: null,
  }
  const ed = brut.new_edition
  if ((g.status === 'obtenu' || g.status === 'complete') && ed && typeof ed === 'object' && !Array.isArray(ed)) {
    const dates = { open_date: dateIso(ed.open_date), deadline_date: dateIso(ed.deadline_date) }
    // Une « nouvelle édition » sans aucune date ni adresse n'apprend rien : ignorée.
    if (dates.open_date || dates.deadline_date || adresseWeb(ed.source_url)) {
      valeur.new_edition = {
        program_name: texteOuNull(ed.program_name, 300),
        source_url: adresseWeb(ed.source_url),
        ...dates,
        ...montantsEtPeriode(ed),
        eligibility_criteria: texteOuNull(ed.eligibility_criteria, 4000),
        description: texteOuNull(ed.description, 4000),
      }
    }
  }
  return { ok: true, valeur }
}

/** Sépare les mises à jour valides des autres ; une seule par subvention (la première). */
export function validerMisesAJour(elements, parRef) {
  const valides = []
  const invalides = []
  const vues = new Set()
  for (const e of elements) {
    const r = validerMiseAJour(e, parRef)
    if (!r.ok) invalides.push(r.raison)
    else if (vues.has(r.valeur.grant_id)) invalides.push('subvention donnée deux fois')
    else {
      vues.add(r.valeur.grant_id)
      valides.push(r.valeur)
    }
  }
  return { valides, invalides }
}

const nomCompare = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Programme d'une recherche par thème : comme `validerProgramme`, plus ses
 * entreprises (« companies » : noms du groupe → identifiants, sans égard à la
 * casse ni aux accents, chacune avec sa justification ; une fois chacune).
 * Un nom inconnu est ignoré ; aucune entreprise reconnue → élément écarté.
 * @param {unknown} brut
 * @param {{id: string, name: string}[]} groupe
 */
export function validerProgrammeTheme(brut, groupe) {
  const r = validerProgramme(brut)
  if (!r.ok) return r
  const parNom = new Map(groupe.map((e) => [nomCompare(e.name), e.id]))
  const companies = []
  for (const c of Array.isArray(brut.companies) ? brut.companies : []) {
    const id = parNom.get(nomCompare(typeof c === 'string' ? c : c?.name))
    if (!id || companies.some((x) => x.company_id === id)) continue
    companies.push({ company_id: id, justification: texteOuNull(c?.justification, 4000) })
  }
  if (!companies.length) return { ok: false, raison: `aucune entreprise du groupe reconnue (${r.valeur.program_name})` }
  return { ok: true, valeur: { ...r.valeur, relevance_justification: null, companies } }
}

/**
 * Sépare les éléments valides des autres (avec la raison du rejet).
 * `valider` : `validerProgramme` (recherche par entreprise) ou, pour une
 * recherche par thème, `(e) => validerProgrammeTheme(e, groupe)`.
 */
export function validerProgrammes(elements, valider = validerProgramme) {
  const valides = []
  const invalides = []
  for (const e of elements) {
    const r = valider(e)
    if (r.ok) valides.push(r.valeur)
    else invalides.push(r.raison)
  }
  return { valides, invalides }
}

/**
 * Texte final d'une réponse de l'API : les blocs de texte qui suivent le
 * dernier résultat d'outil (les phrases d'avant les recherches n'en font
 * pas partie). Les citations découpent le texte en plusieurs blocs : on
 * les recolle.
 */
export function texteFinal(contenu) {
  let dernierOutil = -1
  contenu.forEach((b, i) => {
    if (b.type === 'server_tool_use' || b.type.endsWith('_tool_result')) dernierOutil = i
  })
  const apres = contenu.slice(dernierOutil + 1).filter((b) => b.type === 'text')
  const blocs = apres.length ? apres : contenu.filter((b) => b.type === 'text')
  return blocs.map((b) => b.text).join('')
}
