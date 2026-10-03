// Application des résultats de Claude dans la base. Rien n'est appliqué aux
// prix, programmes ou activités d'un camp suivi sans validation : on crée des
// lignes dans vigie.changements. Exception : la passe 2 (documentation d'un
// camp que la direction vient d'inclure) remplit la fiche directement.

// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export type Db = ReturnType<SupabaseClient['schema']>

export interface Requete {
  id: string
  recherche_id: string | null
  type: 'verification' | 'photos' | 'decouverte' | 'documentation' | 'couts' | 'maquette'
  camp_id: string | null
  activite_id: string | null
  donnees: Record<string, any>
  tentatives: number
}

export const normaliser = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export const domaine = (url: string | null | undefined) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : null
  } catch {
    return null
  }
}

const argent = (n: number) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n)

export function decrireProgramme(p: { prix: number | null; duree_jours: number | null; duree_nuits: number | null; annee: string | null }) {
  const duree = [p.duree_jours ? `${p.duree_jours} j` : null, p.duree_nuits != null ? `${p.duree_nuits} n` : null].filter(Boolean).join(' / ')
  return [p.prix != null ? argent(p.prix) : 'prix inconnu', duree || null].filter(Boolean).join(' · ') + (p.annee ? ` (${p.annee})` : '')
}

const nombre = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const entier = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null)
const chaine = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const score = (v: unknown) => {
  const n = nombre(v)
  return n != null && n >= 0 && n <= 10 ? Math.round(n * 10) / 10 : null
}
const SAISONS = new Set(['hiver', 'printemps', 'ete', 'automne'])
const saisons = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((s) => SAISONS.has(s)))] : [])
const parmi = (v: unknown, permis: string[]) => (Array.isArray(v) ? [...new Set(v.filter((s) => permis.includes(s)))] : [])
const TYPES = ['camp_vacances', 'camp_familial', 'camp_jour', 'besoins_particuliers', 'classe_nature', 'accueil_groupe']
const HEBERGEMENTS = ['tente', 'dortoir', 'chalet', 'chambre', 'autre']

/** Données d'une requête réussie (lève l'erreur sinon). */
async function verifier<T>(promesse: PromiseLike<{ data: T; error: any }>): Promise<NonNullable<T>> {
  const { data, error } = await promesse
  if (error) throw new Error(error.message)
  return data as NonNullable<T>
}

// ------------------------------------------------------------------ photos
const IMAGE = /\.(jpe?g|png|webp|gif)(\?|$)/i

export const adresseImage = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\//.test(u) && u.length < 2000

/** Copie une photo dans le stockage (seau public vigie-photos) ; null si impossible. */
export async function copierPhoto(stockage: SupabaseClient['storage'], campId: string, url: string): Promise<string | null> {
  try {
    const rep = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VigieCampsBPA/1.0)' },
    })
    const type = rep.headers.get('content-type') ?? ''
    if (!rep.ok || !type.startsWith('image/')) return null
    const octets = new Uint8Array(await rep.arrayBuffer())
    if (octets.length > 6_000_000 || octets.length < 2000) return null
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : type.includes('gif') ? 'gif' : 'jpg'
    const chemin = `${campId}/${crypto.randomUUID()}.${ext}`
    const { error } = await stockage.from('vigie-photos').upload(chemin, octets, { contentType: type })
    return error ? null : chemin
  } catch {
    return null
  }
}

// --------------------------------------------------------- contexte commun
export interface Contexte {
  db: Db
  stockage: SupabaseClient['storage']
  activites: { id: string; nom: string }[]
  /** Copies de photos encore permises pour ce réveil (limite de temps). */
  photosRestantes: number
}

function resoudreActivite(ctx: Contexte, a: any): string | null {
  if (typeof a?.activite_id === 'string' && ctx.activites.some((x) => x.id === a.activite_id)) return a.activite_id
  const n = normaliser(a?.nom)
  return n ? (ctx.activites.find((x) => normaliser(x.nom) === n)?.id ?? null) : null
}

async function photoSiAbsente(ctx: Contexte, activiteId: string, campId: string, a: any) {
  if (!adresseImage(a?.photo_url)) return
  const { data: existe } = await ctx.db.from('photos').select('id').eq('activite_id', activiteId).eq('camp_id', campId).maybeSingle()
  if (existe) return
  let chemin: string | null = null
  if (ctx.photosRestantes > 0) {
    ctx.photosRestantes--
    chemin = await copierPhoto(ctx.stockage, campId, a.photo_url)
  }
  await verifier(
    ctx.db.from('photos').insert({
      activite_id: activiteId,
      camp_id: campId,
      url: a.photo_url,
      chemin,
      page_source: chaine(a.source_url),
      legende: chaine(a.preuve),
    }),
  )
}

/** Activités trouvées pour un camp (texte, réseaux ou photos). */
async function traiterActivites(ctx: Contexte, r: Requete, campId: string, liste: any[], directement: boolean) {
  const liens = new Set<string>(
    (await verifier(ctx.db.from('camps_activites').select('activite_id').eq('camp_id', campId))).map((l: any) => l.activite_id),
  )
  const enAttente = await verifier(
    ctx.db.from('changements').select('activite_id, details, statut').eq('camp_id', campId).eq('type', 'nouvelle_activite').in('statut', ['a_valider', 'rejete']),
  )
  const dejaVu = new Set<string>()
  for (const l of enAttente as any[]) {
    if (l.activite_id) dejaVu.add(l.activite_id)
    if (l.details?.activite_nom) dejaVu.add(normaliser(l.details.activite_nom))
  }
  let n = 0
  for (const a of Array.isArray(liste) ? liste : []) {
    const nom = chaine(a?.nom)
    if (!nom) continue
    const id = resoudreActivite(ctx, a)
    const cle = id ?? normaliser(nom)
    if (id && liens.has(id)) {
      await photoSiAbsente(ctx, id, campId, a)
      continue
    }
    if (dejaVu.has(cle)) continue
    dejaVu.add(cle)
    if (id && directement) {
      await verifier(
        ctx.db.from('camps_activites').upsert(
          { camp_id: campId, activite_id: id, source: a.source ?? 'site', note: chaine(a.preuve) },
          { onConflict: 'camp_id,activite_id', ignoreDuplicates: true },
        ),
      )
      liens.add(id)
      await photoSiAbsente(ctx, id, campId, a)
      continue
    }
    let chemin: string | null = null
    if (adresseImage(a.photo_url) && ctx.photosRestantes > 0) {
      ctx.photosRestantes--
      chemin = await copierPhoto(ctx.stockage, campId, a.photo_url)
    }
    await verifier(
      ctx.db.from('changements').insert({
        type: 'nouvelle_activite',
        camp_id: campId,
        activite_id: id,
        nouvelle_valeur: id ? ctx.activites.find((x) => x.id === id)!.nom : nom,
        details: {
          activite_nom: nom,
          saisons: saisons(a.saisons),
          source: ['site', 'reseaux', 'photo'].includes(a.source) ? a.source : 'site',
          preuve: chaine(a.preuve),
          description: chaine(a.preuve),
          photo_url: adresseImage(a.photo_url) ? a.photo_url : null,
          photo_chemin: chemin,
        },
        source_url: chaine(a.source_url),
        recherche_id: r.recherche_id,
      }),
    )
    n++
  }
  return n
}

// ----------------------------------------------- vérification / documentation
export async function traiterCamp(ctx: Contexte, r: Requete, entree: any) {
  const campId = r.camp_id!
  const camp = await verifier(ctx.db.from('camps').select('*').eq('id', campId).single())
  const documentation = r.type === 'documentation'
  const maintenant = new Date().toISOString()

  // Programmes
  const connus: any[] = await verifier(ctx.db.from('programmes').select('*').eq('camp_id', campId).eq('actif', true))
  const enAttente: any[] = await verifier(
    ctx.db.from('changements').select('id, type, programme_id, nouvelle_valeur, details, statut').eq('camp_id', campId).in('type', ['prix', 'nouveau_programme']).in('statut', ['a_valider', 'rejete']),
  )
  const vus = new Set<string>()
  for (const p of Array.isArray(entree?.programmes) ? entree.programmes : []) {
    const nom = chaine(p?.nom)
    if (!nom) continue
    const nouveau = {
      nom,
      description: chaine(p.description),
      duree_jours: entier(p.duree_jours),
      duree_nuits: entier(p.duree_nuits),
      prix: nombre(p.prix),
      annee: chaine(p.annee),
      source_url: chaine(p.source_url),
    }
    const connu =
      (typeof p.programme_id === 'string' && connus.find((c) => c.id === p.programme_id)) ||
      connus.find((c) => normaliser(c.nom) === normaliser(nom))
    if (connu) {
      if (vus.has(connu.id)) continue
      vus.add(connu.id)
      const ancienPrix = connu.prix == null ? null : Number(connu.prix)
      const prixChange = nouveau.prix != null && (ancienPrix == null || Math.abs(nouveau.prix - ancienPrix) >= 1)
      const dureeChange =
        nouveau.prix != null && nouveau.duree_nuits != null && connu.duree_nuits != null && nouveau.duree_nuits !== connu.duree_nuits
      if (!prixChange && !dureeChange) {
        await verifier(ctx.db.from('programmes').update({ verifie_le: maintenant }).eq('id', connu.id))
        continue
      }
      const valeur = decrireProgramme({ ...connu, ...Object.fromEntries(Object.entries(nouveau).filter(([, v]) => v != null)) })
      const details = {
        nom: connu.nom,
        prix: nouveau.prix,
        duree_jours: nouveau.duree_jours,
        duree_nuits: nouveau.duree_nuits,
        annee: nouveau.annee,
        ancien_prix: ancienPrix,
        anciennes_nuits: connu.duree_nuits,
      }
      const pareil = enAttente.find((c) => c.type === 'prix' && c.programme_id === connu.id)
      if (pareil?.statut === 'rejete' && pareil.nouvelle_valeur === valeur) continue
      if (pareil?.statut === 'a_valider') {
        await verifier(
          ctx.db.from('changements').update({ nouvelle_valeur: valeur, details, source_url: nouveau.source_url, detecte_le: maintenant, recherche_id: r.recherche_id }).eq('id', pareil.id),
        )
      } else {
        await verifier(
          ctx.db.from('changements').insert({
            type: 'prix',
            camp_id: campId,
            programme_id: connu.id,
            ancienne_valeur: decrireProgramme(connu),
            nouvelle_valeur: valeur,
            details,
            source_url: nouveau.source_url,
            recherche_id: r.recherche_id,
          }),
        )
      }
    } else if (documentation) {
      await verifier(ctx.db.from('programmes').insert({ camp_id: campId, ...nouveau, verifie_le: maintenant }))
      connus.push({ ...nouveau, id: 'nouveau', nom })
    } else {
      const cle = normaliser(nom)
      if (enAttente.some((c) => c.type === 'nouveau_programme' && normaliser(c.details?.nom ?? c.nouvelle_valeur) === cle)) continue
      enAttente.push({ type: 'nouveau_programme', details: { nom }, statut: 'a_valider' })
      await verifier(
        ctx.db.from('changements').insert({
          type: 'nouveau_programme',
          camp_id: campId,
          nouvelle_valeur: `${nom} — ${decrireProgramme(nouveau)}`,
          details: nouveau,
          source_url: nouveau.source_url,
          recherche_id: r.recherche_id,
        }),
      )
    }
  }

  await traiterActivites(ctx, r, campId, entree?.activites, documentation)

  // Fiche et présence web : la passe 2 remplit tout ; la vérification ne
  // complète que les champs vides (les scores notés à la main restent).
  const pw = entree?.presence_web ?? {}
  const fiche = entree?.fiche ?? {}
  const maj: Record<string, unknown> = {}
  const remplir = (col: string, v: unknown) => {
    if (v == null || (Array.isArray(v) && !v.length)) return
    if (documentation || camp[col] == null || (Array.isArray(camp[col]) && !camp[col].length)) maj[col] = v
  }
  for (const c of ['site_web', 'facebook', 'instagram', 'tiktok']) {
    const lien = chaine(pw[c])
    remplir(c, lien && /^https?:\/\//.test(lien) ? lien : null)
    remplir(`${c}_score`, score(pw[`${c}_score`]))
  }
  remplir('ville', chaine(fiche.ville))
  remplir('region', chaine(fiche.region))
  remplir('types', parmi(fiche.types, TYPES))
  remplir('hebergement', parmi(fiche.hebergement, HEBERGEMENTS))
  if (documentation) {
    maj.documente_le = maintenant
    if (!camp.resume && chaine(entree?.resume)) maj.resume = chaine(entree.resume)
  }
  maj.verifie_le = maintenant
  await verifier(ctx.db.from('camps').update(maj).eq('id', campId))

  // Photos à interpréter : une requête de plus dans la même recherche.
  const urls = (Array.isArray(entree?.photos_a_analyser) ? entree.photos_a_analyser : []).filter(
    (u: unknown) => adresseImage(u) && IMAGE.test(u as string),
  )
  if (urls.length) {
    await verifier(
      ctx.db.from('requetes_ia').insert({
        recherche_id: r.recherche_id,
        type: 'photos',
        camp_id: campId,
        donnees: { urls: [...new Set(urls)].slice(0, 6) },
      }),
    )
  }
}

export async function traiterPhotos(ctx: Contexte, r: Requete, entree: any) {
  const activites = (Array.isArray(entree?.activites) ? entree.activites : []).map((a: any) => ({ ...a, source: 'photo' }))
  await traiterActivites(ctx, r, r.camp_id!, activites, false)
}

// ----------------------------------------------------------------- découverte
export async function traiterDecouverte(ctx: Contexte, r: Requete, entree: any) {
  const connus: any[] = await verifier(ctx.db.from('camps').select('nom, site_web'))
  const noms = new Set(connus.map((c) => normaliser(c.nom)))
  const domaines = new Set(connus.map((c) => domaine(c.site_web)).filter(Boolean))
  for (const c of Array.isArray(entree?.camps) ? entree.camps : []) {
    const nom = chaine(c?.nom)
    if (!nom || noms.has(normaliser(nom))) continue
    const site = chaine(c.site_web)
    const dom = domaine(site)
    if (dom && domaines.has(dom)) continue
    noms.add(normaliser(nom))
    if (dom) domaines.add(dom)
    const { error } = await ctx.db.from('camps').insert({
      nom,
      province: 'Québec',
      ville: chaine(c.ville),
      region: chaine(c.region),
      site_web: site && /^https?:\/\//.test(site) ? site : null,
      types: parmi(c.types, TYPES),
      membre_acq: c.membre_acq === true,
      resume: chaine(c.resume),
      pertinence: chaine(c.pertinence),
      categorie: c.categorie === 'reference' ? 'reference' : 'competiteur_direct',
      statut_inclusion: 'propose',
      origine: 'decouverte',
      lien_source: site,
      recherche_id: r.recherche_id,
    })
    if (error && !error.message.includes('duplicate key')) throw new Error(error.message)
  }
}

// ------------------------------------------------------------ coûts, maquette
export async function traiterCouts(ctx: Contexte, r: Requete, entree: any) {
  const act = await verifier(ctx.db.from('activites').select('description, saisons').eq('id', r.activite_id!).single())
  const impl = nombre(entree?.cout_implantation)
  const oper = nombre(entree?.cout_operation_annuel)
  if (impl == null || oper == null) throw new Error('Estimé incomplet.')
  await verifier(
    ctx.db
      .from('activites')
      .update({
        cout_implantation: Math.round(impl),
        cout_operation_annuel: Math.round(oper),
        hypotheses_couts: chaine(entree.hypotheses),
        couts_estimes_le: new Date().toISOString(),
        ...(act.description ? {} : { description: chaine(entree.description) }),
        ...(act.saisons?.length || !saisons(entree.saisons).length ? {} : { saisons: saisons(entree.saisons) }),
      })
      .eq('id', r.activite_id!),
  )
}

const FORMES = new Set(['boite', 'cylindre', 'sphere', 'cone'])
const vecteur = (v: unknown, n: number, defaut: number) =>
  Array.from({ length: n }, (_, i) => (Array.isArray(v) && Number.isFinite(v[i]) ? Number(v[i]) : defaut))
const couleur = (c: unknown, defaut: string) => (typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c) ? c : defaut)

export async function traiterMaquette(ctx: Contexte, r: Requete, entree: any) {
  const scene = entree?.scene ?? {}
  const objets = (Array.isArray(scene.objets) ? scene.objets : [])
    .filter((o: any) => FORMES.has(o?.forme))
    .slice(0, 200)
    .map((o: any) => ({
      nom: chaine(o.nom) ?? '',
      forme: o.forme,
      position: vecteur(o.position, 3, 0),
      dimensions: vecteur(o.dimensions, o.forme === 'boite' ? 3 : o.forme === 'sphere' ? 1 : 2, 1),
      rotation: vecteur(o.rotation, 3, 0),
      couleur: couleur(o.couleur, '#9ca3af'),
    }))
  if (!objets.length) throw new Error('Maquette vide.')
  const sol = scene.sol ?? {}
  await verifier(
    ctx.db.from('maquettes').upsert(
      {
        activite_id: r.activite_id,
        description: chaine(entree.description),
        scene: {
          sol: { largeur: nombre(sol.largeur) ?? 60, profondeur: nombre(sol.profondeur) ?? 60, couleur: couleur(sol.couleur, '#6b8f4e') },
          objets,
        },
        genere_le: new Date().toISOString(),
      },
      { onConflict: 'activite_id' },
    ),
  )
}
