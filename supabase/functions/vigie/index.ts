// Fonction Edge de la vigie des camps compétiteurs.
//
// Réveillée toutes les 10 minutes par pg_cron (vigie.tic(), seulement s'il y
// a du travail) et par l'app après un lancement manuel. À chaque réveil :
//   1. envoie les requêtes en attente (vigie.requetes_ia) à Claude en un lot
//      (Message Batches : moitié prix, pas de limite de temps) ;
//   2. lit les lots terminés et applique les résultats (traitement.ts) ;
//   3. termine les recherches dont toutes les requêtes sont faites : bilan
//      dans le journal et courriel par Gmail.
//
// Le réveil ne lance jamais de recherche par lui-même (pg_cron s'en charge
// via vigie.planifier()) : l'appeler sans être connecté ne coûte rien de plus.
//
// Secrets Supabase : ANTHROPIC_API_KEY (clé personnelle de Maxime) et
// GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN / GMAIL_EXPEDITEUR.

// deno-lint-ignore-file no-explicit-any
import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { construireRapport, envoyerGmail, gmailConfigure, type ChangementRapport } from './courriel.ts'
import {
  blocListe,
  inviteActivite,
  inviteCamp,
  inviteDecouverte,
  OUTIL_COUTS,
  OUTIL_DECOUVERTE,
  OUTIL_MAQUETTE,
  OUTIL_PHOTOS,
  OUTIL_RESULTATS,
  systemeCouts,
  systemeDecouverte,
  systemeDocumentation,
  systemeMaquette,
  systemePhotos,
  systemeVerification,
} from './invites.ts'
import {
  type Contexte,
  type Requete,
  traiterCamp,
  traiterCouts,
  traiterDecouverte,
  traiterMaquette,
  traiterPhotos,
} from './traitement.ts'

const URL_SUPABASE = Deno.env.get('SUPABASE_URL')!
const CLE_SERVICE =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  (() => {
    try {
      return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default
    } catch {
      return undefined
    }
  })()
const CLE_ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

const admin = createClient(URL_SUPABASE, CLE_SERVICE, { auth: { persistSession: false } })
const db = admin.schema('vigie')

/** Temps de travail par réveil (la fonction est coupée à 150 s). */
const BUDGET_MS = 110_000
/** Copies de photos par réveil (chacune peut prendre quelques secondes). */
const PHOTOS_PAR_REVEIL = 15
const MAX_REPRISES = 4

// Prix par million de jetons (entrée, sortie), API standard ; les lots
// coûtent la moitié. Recherche web : 10 $ par 1000 recherches.
const TARIFS: Record<string, [number, number]> = {
  'claude-fable-5-1': [10, 50],
  'claude-opus-5-5': [4, 20],
  'claude-opus-5': [5, 25],
  'claude-sonnet-5-5': [2, 10],
  'claude-sonnet-5': [2, 10],
  'claude-haiku-4-5': [1, 5],
}

const OUTIL_ATTENDU: Record<Requete['type'], string> = {
  verification: OUTIL_RESULTATS.name,
  documentation: OUTIL_RESULTATS.name,
  photos: OUTIL_PHOTOS.name,
  decouverte: OUTIL_DECOUVERTE.name,
  couts: OUTIL_COUTS.name,
  maquette: OUTIL_MAQUETTE.name,
}

interface Reglages {
  modele: string
  effort: string
  destinataires: string[]
  url_app: string
  consignes: string
}

/** Données d'une requête réussie (lève l'erreur sinon). */
async function verifier<T>(promesse: PromiseLike<{ data: T; error: any }>): Promise<NonNullable<T>> {
  const { data, error } = await promesse
  if (error) throw new Error(error.message)
  return data as NonNullable<T>
}

async function lireReglages(): Promise<Reglages> {
  const ligne: any = await verifier(db.from('parametres').select('valeur').eq('cle', 'reglages').single())
  const v = ligne.valeur ?? {}
  return {
    modele: v.modele || 'claude-opus-5-5',
    effort: v.effort || 'medium',
    destinataires: Array.isArray(v.destinataires) ? v.destinataires.filter((x: unknown) => typeof x === 'string' && x.includes('@')) : [],
    url_app: v.url_app || 'https://gestion-camp.maxime-0f5.workers.dev/vigie',
    consignes: v.consignes ?? '',
  }
}

function cout(modele: string, usage: any) {
  const [entree, sortie] = TARIFS[modele] ?? TARIFS['claude-opus-5-5']
  const jetons =
    (usage?.input_tokens ?? 0) * entree +
    (usage?.cache_creation_input_tokens ?? 0) * entree * 1.25 +
    (usage?.cache_read_input_tokens ?? 0) * entree * 0.1 +
    (usage?.output_tokens ?? 0) * sortie
  return (jetons / 1e6) * 0.5 + (usage?.server_tool_use?.web_search_requests ?? 0) * 0.01
}

const aujourdhui = () =>
  new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Toronto' }).format(new Date())

// ------------------------------------------------------------ requêtes
function outilsWeb(modele: string, recherches: number, lectures: number) {
  const ancien = modele.startsWith('claude-haiku')
  const outils: any[] = []
  if (recherches)
    outils.push({
      type: ancien ? 'web_search_20250305' : 'web_search_20260209',
      name: 'web_search',
      max_uses: recherches,
      user_location: { type: 'approximate', city: 'Mont-Tremblant', region: 'Quebec', country: 'CA', timezone: 'America/Toronto' },
    })
  if (lectures)
    outils.push({ type: ancien ? 'web_fetch_20250910' : 'web_fetch_20260209', name: 'web_fetch', max_uses: lectures, max_content_tokens: 20000 })
  return outils
}

function parametres(reglages: Reglages, systeme: string[], outils: any[], messages: any[]) {
  const blocs = systeme.map((text) => ({ type: 'text', text }))
  ;(blocs[blocs.length - 1] as any).cache_control = { type: 'ephemeral' }
  return {
    model: reglages.modele,
    max_tokens: 32000,
    system: blocs,
    tools: outils,
    tool_choice: { type: 'auto' },
    messages,
    ...(reglages.modele.startsWith('claude-haiku') ? {} : { output_config: { effort: reglages.effort } }),
  }
}

interface Donnees {
  camps: Map<string, any>
  programmes: Map<string, any[]>
  liens: Map<string, string[]>
  activites: { id: string; nom: string; description: string | null; saisons: string[] }[]
}

async function chargerDonnees(): Promise<Donnees> {
  const [camps, programmes, liens, activites] = await Promise.all([
    verifier(db.from('camps').select('*').order('nom')),
    verifier(db.from('programmes').select('*').eq('actif', true).order('nom')),
    verifier(db.from('camps_activites').select('camp_id, activite_id')),
    verifier(db.from('activites').select('id, nom, description, saisons').order('nom')),
  ])
  const nomActivite = new Map((activites as any[]).map((a) => [a.id, a.nom]))
  const parCamp = <T>(lignes: any[], f: (l: any) => T) => {
    const m = new Map<string, T[]>()
    for (const l of lignes) m.set(l.camp_id, [...(m.get(l.camp_id) ?? []), f(l)])
    return m
  }
  return {
    camps: new Map((camps as any[]).map((c) => [c.id, c])),
    programmes: parCamp(programmes as any[], (p) => p),
    liens: parCamp(liens as any[], (l) => nomActivite.get(l.activite_id) ?? ''),
    activites: activites as any[],
  }
}

/** Paramètres de la requête à Claude ; null si la cible n'existe plus. */
function construire(r: Requete, reglages: Reglages, d: Donnees): { params: any; messages: any[] } | null {
  const liste = blocListe(d.activites)
  const m = reglages.modele
  const suite: any[] | undefined = r.donnees?.messages
  const avec = (systeme: string[], outils: any[], initiaux: () => any[]) => {
    const messages = suite ?? initiaux()
    return { params: parametres(reglages, systeme, outils, messages), messages }
  }
  switch (r.type) {
    case 'verification':
    case 'documentation': {
      const camp = d.camps.get(r.camp_id ?? '')
      if (!camp) return null
      const systeme = r.type === 'verification' ? systemeVerification(reglages.consignes) : systemeDocumentation(reglages.consignes)
      return avec([systeme, liste], [...outilsWeb(m, 10, 12), OUTIL_RESULTATS], () => [
        {
          role: 'user',
          content: inviteCamp(camp, r.type === 'verification' ? (d.programmes.get(camp.id) ?? []) : [], d.liens.get(camp.id) ?? [], aujourdhui()),
        },
      ])
    }
    case 'photos': {
      const camp = d.camps.get(r.camp_id ?? '')
      const urls: string[] = r.donnees?.urls ?? []
      if (!camp || !urls.length) return null
      return avec([systemePhotos(), liste], [OUTIL_PHOTOS], () => [
        {
          role: 'user',
          content: [
            ...urls.flatMap((url) => [
              { type: 'text', text: `Photo : ${url}` },
              { type: 'image', source: { type: 'url', url } },
            ]),
            { type: 'text', text: `Photos du site de ${camp.nom}. Activités déjà notées pour ce camp : ${(d.liens.get(camp.id) ?? []).join(', ') || '(aucune)'}` },
          ],
        },
      ])
    }
    case 'decouverte':
      return avec([systemeDecouverte(reglages.consignes)], [...outilsWeb(m, 20, 15), OUTIL_DECOUVERTE], () => [
        { role: 'user', content: inviteDecouverte([...d.camps.values()], aujourdhui()) },
      ])
    case 'couts':
    case 'maquette': {
      const a = d.activites.find((x) => x.id === r.activite_id)
      if (!a) return null
      const offerte = [...d.camps.values()].filter((c) => (d.liens.get(c.id) ?? []).includes(a.nom)).map((c) => c.nom)
      return r.type === 'couts'
        ? avec([systemeCouts()], [...outilsWeb(m, 5, 5), OUTIL_COUTS], () => [{ role: 'user', content: inviteActivite(a, offerte) }])
        : avec([systemeMaquette()], [OUTIL_MAQUETTE], () => [{ role: 'user', content: inviteActivite(a, offerte) }])
    }
  }
}

async function soumettre(claude: Anthropic, reglages: Reglages) {
  const attente = (await verifier(
    db.from('requetes_ia').select('*').eq('statut', 'en_attente').order('created_at').limit(300),
  )) as unknown as Requete[]
  if (!attente.length) return 0
  const d = await chargerDonnees()
  const envois: { r: Requete; params: any; messages: any[] }[] = []
  for (const r of attente) {
    const req = construire(r, reglages, d)
    if (!req) {
      await db.from('requetes_ia').update({ statut: 'erreur', erreur: 'Camp ou activité introuvable.' }).eq('id', r.id)
      continue
    }
    envois.push({ r, ...req })
  }
  if (!envois.length) return 0
  try {
    const lot = await claude.messages.batches.create({
      requests: envois.map((e) => ({ custom_id: e.r.id, params: e.params })),
    })
    for (const e of envois) {
      await db
        .from('requetes_ia')
        .update({ statut: 'soumise', lot_id: lot.id, tentatives: e.r.tentatives + 1, donnees: { ...e.r.donnees, messages: e.messages } })
        .eq('id', e.r.id)
    }
    return envois.length
  } catch (e) {
    const message = `Envoi du lot refusé : ${e instanceof Error ? e.message : String(e)}`.slice(0, 2000)
    for (const x of envois) await db.from('requetes_ia').update({ statut: 'erreur', erreur: message }).eq('id', x.r.id)
    throw new Error(message)
  }
}

// ------------------------------------------------------------- résultats
async function appliquer(ctx: Contexte, r: Requete, entree: any) {
  if (r.type === 'verification' || r.type === 'documentation') return traiterCamp(ctx, r, entree)
  if (r.type === 'photos') return traiterPhotos(ctx, r, entree)
  if (r.type === 'decouverte') return traiterDecouverte(ctx, r, entree)
  if (r.type === 'couts') return traiterCouts(ctx, r, entree)
  return traiterMaquette(ctx, r, entree)
}

/** Si Claude a écrit le JSON en texte au lieu d'appeler l'outil. */
function jsonDansTexte(contenu: any[]) {
  const texte = contenu.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
  const m = texte.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0])
  } catch {
    return null
  }
}

async function traiterResultat(ctx: Contexte, r: Requete, resultat: any, modele: string) {
  const maj = (champs: Record<string, unknown>) => verifier(db.from('requetes_ia').update(champs).eq('id', r.id).eq('statut', 'soumise'))
  const coutAvant = Number((r as any).cout_usd ?? 0)

  if (resultat.type !== 'succeeded') {
    const detail = resultat.type === 'errored' ? `${resultat.error?.error?.type ?? resultat.error?.type ?? ''} ${resultat.error?.error?.message ?? ''}`.trim() : resultat.type
    const definitif = r.type === 'photos' || r.tentatives >= 3 || /invalid_request/.test(detail)
    await maj({ statut: definitif ? 'erreur' : 'en_attente', erreur: `Lot : ${detail}`.slice(0, 2000) })
    return
  }

  const message = resultat.message
  const total = coutAvant + cout(modele, message.usage)
  if (message.stop_reason === 'pause_turn' && r.tentatives < MAX_REPRISES) {
    // Le serveur a mis le tour en pause (limite d'itérations des outils web) :
    // on renvoie la conversation telle quelle, il reprend où il était.
    const messages = [...(r.donnees?.messages ?? []), { role: 'assistant', content: message.content }]
    await maj({ statut: 'en_attente', cout_usd: total, donnees: { ...r.donnees, messages } })
    return
  }
  if (message.stop_reason === 'refusal') {
    await maj({ statut: 'erreur', cout_usd: total, erreur: `Refus : ${message.stop_details?.explanation ?? message.stop_details?.category ?? ''}` })
    return
  }
  const appel = message.content.find((b: any) => b.type === 'tool_use' && b.name === OUTIL_ATTENDU[r.type])
  const entree = appel?.input ?? jsonDansTexte(message.content)
  if (!entree) {
    await maj({ statut: 'erreur', cout_usd: total, erreur: `Aucun résultat enregistré (arrêt : ${message.stop_reason}).` })
    return
  }
  try {
    await appliquer(ctx, r, entree)
    // La conversation n'est plus utile : on ne garde que le résultat.
    await maj({ statut: 'terminee', cout_usd: total, erreur: null, donnees: { ...r.donnees, messages: undefined, resultat: entree } })
  } catch (e) {
    await maj({ statut: 'erreur', cout_usd: total, erreur: `Traitement : ${e instanceof Error ? e.message : String(e)}`.slice(0, 2000) })
  }
}

async function lireLots(claude: Anthropic, reglages: Reglages, debut: number) {
  const soumises = (await verifier(db.from('requetes_ia').select('*').eq('statut', 'soumise'))) as unknown as Requete[]
  const lots = [...new Set(soumises.map((r: any) => r.lot_id as string))]
  if (!lots.length) return 0
  const activites = (await verifier(db.from('activites').select('id, nom'))) as any[]
  const ctx: Contexte = { db, stockage: admin.storage, activites, photosRestantes: PHOTOS_PAR_REVEIL }
  let traitees = 0
  for (const lotId of lots) {
    if (Date.now() - debut > BUDGET_MS) break
    const lot = await claude.messages.batches.retrieve(lotId)
    if (lot.processing_status !== 'ended') continue
    const duLot = new Map(soumises.filter((r: any) => r.lot_id === lotId).map((r) => [r.id, r]))
    let complet = true
    for await (const res of await claude.messages.batches.results(lotId)) {
      if (Date.now() - debut > BUDGET_MS) {
        complet = false
        break
      }
      const r = duLot.get(res.custom_id)
      if (!r) continue
      duLot.delete(res.custom_id)
      await traiterResultat(ctx, r, res.result, reglages.modele)
      traitees++
      // Les activités créées entre-temps (aucune ici) : la liste reste valable.
    }
    if (complet) {
      for (const r of duLot.values()) {
        await db.from('requetes_ia').update({ statut: 'erreur', erreur: 'Absente des résultats du lot.' }).eq('id', r.id).eq('statut', 'soumise')
      }
    }
  }
  return traitees
}

// ------------------------------------------------------- fin des recherches
async function terminerRecherches(reglages: Reglages) {
  const enCours: any[] = await verifier(db.from('recherches').select('*').eq('statut', 'en_cours'))
  let terminees = 0
  for (const rech of enCours) {
    const requetes: any[] = await verifier(db.from('requetes_ia').select('type, statut, cout_usd').eq('recherche_id', rech.id))
    if (requetes.some((q) => q.statut === 'en_attente' || q.statut === 'soumise')) continue
    // Une recherche de documentation vide vient d'être créée : on attend sa requête.
    if (!requetes.length && rech.type === 'documentation') continue

    const changements: any[] = await verifier(
      db.from('changements').select('type, ancienne_valeur, nouvelle_valeur, details, camps(nom)').eq('recherche_id', rech.id).order('detecte_le'),
    )
    const proposes: any[] = await verifier(db.from('camps').select('nom, ville, pertinence').eq('recherche_id', rech.id).order('nom'))
    const campsVerifies = requetes.filter((q) => (q.type === 'verification' || q.type === 'documentation') && q.statut === 'terminee').length
    const erreurs = requetes.filter((q) => q.statut === 'erreur').length
    const coutTotal = requetes.reduce((s, q) => s + Number(q.cout_usd ?? 0), 0)

    const pourRapport: ChangementRapport[] = changements.map((c) => {
      const d = c.details ?? {}
      let variation: number | null = null
      if (c.type === 'prix' && d.ancien_prix && d.prix != null) {
        const nuitsAvant = d.anciennes_nuits, nuitsApres = d.duree_nuits ?? d.anciennes_nuits
        variation = nuitsAvant && nuitsApres && nuitsAvant !== nuitsApres
          ? d.prix / nuitsApres / (d.ancien_prix / nuitsAvant) - 1
          : d.prix / d.ancien_prix - 1
      }
      return {
        type: c.type,
        camp: c.type === 'prix' && d.nom ? `${c.camps?.nom ?? '?'} — ${d.nom}` : (c.camps?.nom ?? '?'),
        ancienne_valeur: c.ancienne_valeur,
        nouvelle_valeur: c.nouvelle_valeur,
        variation,
      }
    })
    const rapport = construireRapport({
      type: rech.type,
      debut: new Date(rech.debut),
      campsVerifies,
      erreurs,
      changements: pourRapport,
      proposes,
      lien: reglages.url_app,
    })

    let erreurCourriel: string | null = null
    let envoye: string | null = null
    if (rech.type !== 'documentation') {
      try {
        await envoyerGmail({ a: reglages.destinataires, sujet: rapport.sujet, texte: rapport.texte, html: rapport.html })
        envoye = new Date().toISOString()
      } catch (e) {
        erreurCourriel = `Courriel non envoyé : ${e instanceof Error ? e.message : String(e)}`
      }
    }
    await verifier(
      db
        .from('recherches')
        .update({
          statut: 'terminee',
          fin: new Date().toISOString(),
          camps_verifies: campsVerifies,
          changements_detectes: changements.length,
          changements_prix: changements.filter((c) => c.type === 'prix').length,
          camps_proposes: proposes.length,
          erreurs,
          cout_usd: Math.round(coutTotal * 100) / 100,
          resume: rapport.sujet,
          rapport_html: rapport.html,
          courriel_envoye_le: envoye,
          erreur: erreurCourriel,
        })
        .eq('id', rech.id),
    )
    terminees++
  }
  return terminees
}

async function tic() {
  const debut = Date.now()
  if (!(await verifier(db.rpc('prendre_verrou')))) return { occupe: true }
  try {
    const reglages = await lireReglages()
    const bilan: Record<string, unknown> = {}
    if (!CLE_ANTHROPIC) {
      bilan.attention = 'Secret ANTHROPIC_API_KEY absent : les requêtes restent en attente.'
    } else {
      const claude = new Anthropic({ apiKey: CLE_ANTHROPIC, maxRetries: 2, timeout: 60_000 })
      bilan.resultats = await lireLots(claude, reglages, debut)
      if (Date.now() - debut < BUDGET_MS) bilan.envoyees = await soumettre(claude, reglages)
    }
    bilan.recherchesTerminees = await terminerRecherches(reglages)
    return bilan
  } finally {
    await db.rpc('liberer_verrou')
  }
}

// --------------------------------------------------------------- appels
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

/** Personne connectée avec le droit d'écrire dans le module vigie. */
async function peutEcrire(req: Request) {
  const jeton = req.headers.get('Authorization')?.replace(/^Bearer /, '')
  if (!jeton) return false
  const { data } = await admin.auth.getUser(jeton)
  const id = data.user?.id
  if (!id) return false
  const { data: profil } = await admin.schema('core').from('profils').select('role, actif').eq('id', id).maybeSingle()
  if (!profil?.actif) return false
  if (profil.role === 'admin' || profil.role === 'direction') return true
  const { data: acces } = await admin.schema('core').from('acces_modules').select('niveau').eq('user_id', id).eq('module', 'vigie').maybeSingle()
  return acces?.niveau === 'ecriture'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  let corps: any = {}
  try {
    corps = await req.json()
  } catch {
    /* corps vide */
  }
  try {
    switch (corps.action ?? 'tic') {
      case 'tic':
        return json(await tic())
      case 'etat':
        if (!(await peutEcrire(req))) return json({ erreur: 'Accès refusé.' }, 403)
        return json({ anthropic: !!CLE_ANTHROPIC, gmail: gmailConfigure() })
      case 'tester_courriel': {
        if (!(await peutEcrire(req))) return json({ erreur: 'Accès refusé.' }, 403)
        const reglages = await lireReglages()
        const essai = construireRapport({
          type: 'mensuelle',
          debut: new Date(),
          campsVerifies: 0,
          erreurs: 0,
          changements: [{ type: 'prix', camp: 'Camp exemple — Séjour régulier', ancienne_valeur: '1 000 $ · 7 j / 6 n', nouvelle_valeur: '1 050 $ · 7 j / 6 n', variation: 0.05 }],
          proposes: [],
          lien: reglages.url_app,
        })
        await envoyerGmail({ a: reglages.destinataires, sujet: `[Essai] ${essai.sujet}`, texte: essai.texte, html: essai.html })
        return json({ ok: true, destinataires: reglages.destinataires })
      }
      default:
        return json({ erreur: 'Action inconnue.' }, 400)
    }
  } catch (e) {
    console.error(e)
    return json({ erreur: e instanceof Error ? e.message : String(e) }, 500)
  }
})
