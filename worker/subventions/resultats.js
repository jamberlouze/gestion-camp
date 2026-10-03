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

/** Un élément de la réponse → { ok, valeur } ou { ok: false, raison }. */
export function validerProgramme(brut) {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return { ok: false, raison: 'élément qui n’est pas un objet' }
  const nom = texteOuNull(brut.program_name, 300)
  if (!nom) return { ok: false, raison: 'nom de programme manquant' }
  const url = adresseWeb(brut.source_url)
  if (!url) return { ok: false, raison: `adresse web manquante ou invalide (${nom})` }
  let min = montant(brut.potential_amount_min)
  let max = montant(brut.potential_amount_max)
  if (min != null && max != null && min > max) [min, max] = [max, min]
  return {
    ok: true,
    valeur: {
      program_name: nom,
      organisme: texteOuNull(brut.organisme, 300),
      description: texteOuNull(brut.description, 4000),
      source_url: url,
      grant_type: typeSubvention(brut.grant_type),
      potential_amount_min: min,
      potential_amount_max: max,
      open_date: dateIso(brut.open_date),
      deadline_date: dateIso(brut.deadline_date),
      relevance_justification: texteOuNull(brut.relevance_justification, 4000),
      program_key: cleProgramme(brut.program_key) || cleProgramme(nom),
    },
  }
}

/** Sépare les éléments valides des autres (avec la raison du rejet). */
export function validerProgrammes(elements) {
  const valides = []
  const invalides = []
  for (const e of elements) {
    const r = validerProgramme(e)
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
