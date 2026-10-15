// Contrat d'emploi et consentement parental signés en ligne, depuis la page
// du dossier d'embauche (/dossier/<jeton> ; plan-rh.md §6). Le PDF est
// produit ici, à la demande, d'après les termes figés quand l'équipe a
// préparé le contrat et les coordonnées à jour de l'employé ; signé, il est
// gardé dans rh-documents (<personne_id>/<uuid>.pdf) puis noté par
// rh.contrat_signe / rh.consentement_signe (jeton revérifié par la base).
//
//   GET  /api/rh/contrat?jeton=…&id=…        le contrat (signé s'il l'est)
//   POST /api/rh/signer                       {jeton, contrat, nom, image, accepte}
//   GET  /api/rh/consentement?jeton=…[&id=…]  formulaire à signer, ou celui qui est signé
//   POST /api/rh/consentement                 {jeton, nom, lien, image, accepte, date_naissance}
//
// Modules PDF chargés à la demande (tests du Worker sous Node plus légers).

import { erreursConsentement, erreursSignature, estMineur } from '../../src/modules/rh/dossierEmbauche.ts'
import { base } from '../subventions/base.js'
import { deposer, retirer, SEAU_DOCUMENTS, telecharger } from './fichiers.js'

export class ErreurSignature extends Error {
  constructor(code, status = 409) {
    super(code)
    this.code = code
    this.status = status
  }
}

const aujourdhui = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montreal' }).format(new Date())
const pdf = (octets, nom) =>
  new Response(octets, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${nom.replace(/[^\w.-]+/g, '-')}"`,
      'cache-control': 'no-store',
    },
  })

/** Code levé par une fonction rh.* (raise exception 'CODE'), sinon null. */
const codeDe = (e) => /"message"\s*:\s*"([A-Z_]+)/.exec(String(e?.message ?? ''))?.[1] ?? null

async function lireContrat(env, jeton, id) {
  try {
    return await base(env, 'rh').rpc('contrat_a_produire', { p_jeton: jeton, p_contrat: id })
  } catch (e) {
    const code = codeDe(e)
    if (code === 'JETON' || code === 'CONTRAT_INTROUVABLE') throw new ErreurSignature('introuvable', 404)
    throw e
  }
}

/** Contrat à lire : le PDF signé s'il l'est, sinon produit tel qu'il sera signé. */
export async function voirContrat(env, jeton, id) {
  const k = await lireContrat(env, jeton, id)
  if (k.statut === 'signe' && k.chemin_signe) {
    const octets = await telecharger(env, SEAU_DOCUMENTS, k.chemin_signe)
    if (octets) return pdf(octets, `${k.titre} (signé).pdf`)
  }
  const { pdfContrat } = await import('../../src/modules/rh/contrat.ts')
  const { octets } = await pdfContrat(k.titre, k.contenu, k.termes, k.employe, aujourdhui())
  return pdf(octets, `${k.titre}.pdf`)
}

/** Lignes du certificat communes aux deux documents. */
const certificat = (request, lignes) => [
  ...lignes,
  ['Adresse IP', request.headers.get('CF-Connecting-IP') ?? 'inconnue'],
  ['Navigateur', (request.headers.get('User-Agent') ?? 'inconnu').slice(0, 200)],
]

/** Dépose le PDF signé, puis le fait noter par la base ; le retire si elle refuse. */
async function garder(env, personneId, octets, nom, noter) {
  const id = crypto.randomUUID()
  const chemin = `${personneId}/${id}.pdf`
  await deposer(env, SEAU_DOCUMENTS, chemin, new Blob([octets]), 'application/pdf')
  try {
    await noter({ id, chemin, nom: nom.slice(0, 200), taille: octets.length })
  } catch (e) {
    await retirer(env, SEAU_DOCUMENTS, [chemin]).catch(() => {})
    const code = codeDe(e)
    if (code === 'FERME') throw new ErreurSignature('ferme')
    if (code === 'JETON') throw new ErreurSignature('introuvable', 404)
    if (code === 'CONTRAT_INTROUVABLE') throw new ErreurSignature('deja_signe')
    throw e
  }
}

/** Signature du contrat par l'employé. */
export async function signerContrat(request, env, corps) {
  const champs = erreursSignature(corps)
  if (Object.keys(champs).length) return { erreur: 'champs', champs }
  const k = await lireContrat(env, corps.jeton, corps.contrat)
  if (!k.embauche_ouverte) throw new ErreurSignature('ferme')
  if (k.statut !== 'en_attente') throw new ErreurSignature('deja_signe')
  const { dateLongue, pdfContrat } = await import('../../src/modules/rh/contrat.ts')
  const { empreinte, poserSignature } = await import('../../src/lib/pdf/signature.ts')
  const { octets, caseSignature } = await pdfContrat(k.titre, k.contenu, k.termes, k.employe, aujourdhui())
  const hash = await empreinte(octets)
  const nom = corps.nom.trim()
  const signe = await poserSignature(
    octets,
    caseSignature,
    { nom, image: corps.image, signeLe: new Date().toISOString() },
    {
      titre: 'Certificat de signature électronique',
      lignes: certificat(request, [
        ['Document', `${k.titre} — ${k.termes.poste} (${k.termes.saison})`],
        ['Employeur', k.termes.compagnie.raison_sociale || k.termes.compagnie.nom],
        ['Signé pour l’employeur', `${k.termes.signataire}, le ${dateLongue(k.termes.prepare_le)}`],
        ['Signataire (employé·e)', nom],
        ['Courriel au dossier', k.employe.courriel ?? ''],
        ['Empreinte SHA-256 du document', hash],
      ]),
    },
  )
  await garder(env, k.personne_id, signe, `${k.titre} signé — ${k.employe.prenom} ${k.employe.nom_famille}.pdf`, (document) =>
    base(env, 'rh').rpc('contrat_signe', {
      p_jeton: corps.jeton,
      p_contrat: corps.contrat,
      p: {
        nom,
        adresse_ip: request.headers.get('CF-Connecting-IP') ?? '',
        navigateur: (request.headers.get('User-Agent') ?? '').slice(0, 300),
        empreinte: hash,
        document,
      },
    }),
  )
  return { ok: true }
}

async function lireConsentement(env, jeton) {
  try {
    return await base(env, 'rh').rpc('consentement_a_produire', { p_jeton: jeton })
  } catch (e) {
    const code = codeDe(e)
    if (code === 'JETON') throw new ErreurSignature('introuvable', 404)
    if (code === 'FERME') throw new ErreurSignature('ferme')
    throw e
  }
}

/** Consentement à lire : celui qui est signé (id), sinon le formulaire vierge. */
export async function voirConsentement(env, jeton, id, naissance) {
  if (id) {
    const db = base(env, 'rh')
    const page = await db.rpc('dossier_public', { p_jeton: jeton })
    if (!page || page.ferme || page.consentement?.id !== id) throw new ErreurSignature('introuvable', 404)
    const [k] = await db.lire(`contrats?id=eq.${id}&embauche_id=eq.${page.embauche_id}&genre=eq.consentement&statut=eq.signe&select=document_id`)
    const [d] = k?.document_id ? await db.lire(`documents?id=eq.${k.document_id}&select=chemin`) : []
    const octets = d ? await telecharger(env, SEAU_DOCUMENTS, d.chemin) : null
    if (!octets) throw new ErreurSignature('introuvable', 404)
    return pdf(octets, 'Consentement parental (signé).pdf')
  }
  const c = await lireConsentement(env, jeton)
  if (!c.modele) throw new ErreurSignature('sans_modele')
  const { pdfConsentement } = await import('../../src/modules/rh/contrat.ts')
  const employe = { ...c.employe, date_naissance: c.employe.date_naissance ?? (/^\d{4}-\d{2}-\d{2}$/.test(naissance ?? '') ? naissance : null) }
  const { octets } = await pdfConsentement(c.modele.titre, c.modele.contenu, { employe, compagnie: c.compagnie, saison: c.saison, parent: '', lien: '' }, aujourdhui())
  return pdf(octets, `${c.modele.titre}.pdf`)
}

/** Signature du consentement parental par un parent ou tuteur. */
export async function signerConsentement(request, env, corps) {
  const champs = erreursConsentement(corps)
  if (Object.keys(champs).length) return { erreur: 'champs', champs }
  const c = await lireConsentement(env, corps.jeton)
  if (!c.modele) throw new ErreurSignature('sans_modele')
  // Date de naissance : celle du dossier, sinon celle que la page vient de saisir.
  const naissance = c.employe.date_naissance ?? (/^\d{4}-\d{2}-\d{2}$/.test(corps.date_naissance ?? '') ? corps.date_naissance : null)
  if (!naissance || !estMineur({ date_naissance: naissance }, { debut: c.debut }, aujourdhui())) throw new ErreurSignature('majeur')
  const { dateLongue, pdfConsentement } = await import('../../src/modules/rh/contrat.ts')
  const { empreinte, poserSignature } = await import('../../src/lib/pdf/signature.ts')
  const parent = corps.nom.trim()
  const lien = corps.lien.trim()
  const employe = { ...c.employe, date_naissance: naissance }
  const { octets, caseSignature } = await pdfConsentement(c.modele.titre, c.modele.contenu, { employe, compagnie: c.compagnie, saison: c.saison, parent, lien }, aujourdhui())
  const hash = await empreinte(octets)
  const signe = await poserSignature(
    octets,
    caseSignature,
    { nom: `${parent} (${lien})`, image: corps.image, signeLe: new Date().toISOString() },
    {
      titre: 'Certificat de signature électronique',
      lignes: certificat(request, [
        ['Document', `${c.modele.titre} — ${employe.prenom} ${employe.nom_famille}`],
        ['Employeur', c.compagnie ?? ''],
        ['Saison', c.saison ?? ''],
        ['Personne mineure', `${employe.prenom} ${employe.nom_famille}, née le ${dateLongue(naissance)}`],
        ['Signataire', `${parent} (${lien})`],
        ['Empreinte SHA-256 du document', hash],
      ]),
    },
  )
  await garder(env, c.personne_id, signe, `Consentement parental — ${employe.prenom} ${employe.nom_famille}.pdf`, (document) =>
    base(env, 'rh').rpc('consentement_signe', {
      p_jeton: corps.jeton,
      p: {
        nom: parent,
        lien,
        adresse_ip: request.headers.get('CF-Connecting-IP') ?? '',
        navigateur: (request.headers.get('User-Agent') ?? '').slice(0, 300),
        empreinte: hash,
        titre: c.modele.titre,
        contenu: c.modele.contenu,
        document,
      },
    }),
  )
  return { ok: true }
}
