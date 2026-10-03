// Tests de la Vigie de subventions (côté Worker) : `npm run test:worker`.
// Les appels réseau (Supabase, API Claude, Google) sont simulés : aucun
// secret n'est nécessaire et rien n'est écrit nulle part.

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { routeSubventions } from './api.js'
import { construireRappel, messageMime, trierPrometteuses } from './courriel.js'
import { invitationMemoire, invitationRecherche } from './invites.js'
import { debutSemaine, rechercherEntreprise, tourHebdomadaire } from './pipeline.js'
import { cleProgramme, dateIso, extraireTableau, montant, texteFinal, typeSubvention, validerProgrammes } from './resultats.js'

describe('lecture de la réponse', () => {
  it('extrait le tableau même entouré de texte ou de clôtures', () => {
    assert.deepEqual(extraireTableau('Voici :\n```json\n[{"a":1}]\n```'), [{ a: 1 }])
    assert.deepEqual(extraireTableau('[]'), [])
    assert.throws(() => extraireTableau('Je n’ai rien trouvé.'))
    assert.throws(() => extraireTableau('[{"a":1}'))
  })

  it('recolle le texte final après le dernier outil', () => {
    const contenu = [
      { type: 'text', text: 'Je cherche…' },
      { type: 'server_tool_use', id: 's1', name: 'web_search', input: {} },
      { type: 'web_search_tool_result', tool_use_id: 's1', content: [] },
      { type: 'text', text: '[{"program_name":"A",' },
      { type: 'text', text: '"source_url":"https://a.ca"}]', citations: [{ url: 'https://a.ca' }] },
    ]
    assert.equal(texteFinal(contenu), '[{"program_name":"A","source_url":"https://a.ca"}]')
    assert.equal(texteFinal([{ type: 'text', text: '[]' }]), '[]')
  })

  it('normalise clés, montants, dates et types', () => {
    assert.equal(cleProgramme("Emplois d'été Canada (EÉC)"), 'emplois-dete-canada-eec')
    assert.equal(montant('50 000 $'), 50000)
    assert.equal(montant('1 234,50'), 1234.5)
    assert.equal(montant('50,000'), 50000)
    assert.equal(montant('environ 5k'), null)
    assert.equal(montant(-3), null)
    assert.equal(dateIso('2027-02-30'), null)
    assert.equal(dateIso('2027-01-15'), '2027-01-15')
    assert.equal(dateIso('15 janvier 2027'), null)
    assert.equal(typeSubvention('R&D'), 'rd')
    assert.equal(typeSubvention('Salarial'), 'salarial')
    assert.equal(typeSubvention('subvention'), 'autre')
  })

  it('écarte les éléments sans nom ou sans adresse valide', () => {
    const { valides, invalides } = validerProgrammes([
      { program_name: ' EÉC ', source_url: 'https://canada.ca/eec', grant_type: 'salarial', potential_amount_min: 9000, potential_amount_max: '3000', program_key: '' },
      { program_name: 'Sans adresse' },
      { program_name: 'Mauvaise adresse', source_url: 'javascript:alert(1)' },
      { source_url: 'https://x.ca' },
      'texte',
    ])
    assert.equal(valides.length, 1)
    assert.equal(invalides.length, 4)
    assert.deepEqual(
      { ...valides[0] },
      {
        program_name: 'EÉC',
        organisme: null,
        description: null,
        source_url: 'https://canada.ca/eec',
        grant_type: 'salarial',
        potential_amount_min: 3000,
        potential_amount_max: 9000,
        open_date: null,
        deadline_date: null,
        relevance_justification: null,
        program_key: 'eec',
      },
    )
  })
})

describe('prompts', () => {
  it('recherche : critères, règles, programmes connus', () => {
    const p = invitationRecherche({
      entreprise: { name: 'Trembloc', legal_status: null, specific_criteria: 'Bloc extérieur' },
      criteresCommuns: 'Priorité absolue : les subventions salariales.',
      regles: null,
      connus: [{ program_name: 'EÉC', source_url: 'https://canada.ca/eec', status: 'rejete', program_key: 'eec', discovered_fy: 2027 }],
      aujourdhui: 'samedi 3 octobre 2026',
    })
    assert.match(p, /pour Trembloc \(statut juridique non précisé/)
    assert.match(p, /Bloc extérieur/)
    assert.match(p, /Aucune règle apprise/)
    assert.match(p, /- EÉC \| https:\/\/canada.ca\/eec \| rejetée \| eec \| 2026-27/)
    assert.match(p, /Réponds uniquement avec un tableau JSON/)
  })

  it('mémoire : une ligne par décision', () => {
    const p = invitationMemoire({
      entreprise: { name: 'Opikawa' },
      feedback: [
        { decided_at: '2026-10-02T10:00:00Z', decision: 'rejete', reject_category: 'montant_trop_faible', program_name: 'X', grant_type: 'autre', company_name: 'Opikawa', comment: 'trop petit', source_url: 'https://www.x.ca/a' },
      ],
    })
    assert.match(p, /Reste sous 500 mots/)
    assert.match(p, /REJETÉE \(montant_trop_faible\) \| X \| type autre \| entreprise : Opikawa \| source : x.ca \| commentaire : « trop petit »/)
  })
})

describe('courriel', () => {
  const entreprises = [
    { id: 'b', name: 'Base de Plein Air Mont-Tremblant' },
    { id: 't', name: 'Trembloc' },
  ]
  it('salariales en tête, puis échéance la plus proche', () => {
    const tri = trierPrometteuses([
      { program_name: 'A', grant_type: 'marketing', deadline_date: '2026-11-01' },
      { program_name: 'B', grant_type: 'salarial', deadline_date: null },
      { program_name: 'C', grant_type: 'salarial', deadline_date: '2027-01-10' },
    ])
    assert.deepEqual(tri.map((g) => g.program_name), ['C', 'B', 'A'])
  })

  it('rappel avec nouveautés, erreur et lien', () => {
    const r = construireRappel({
      entreprises,
      nouvelles: [{ program_name: 'EÉC <2027>', grant_type: 'salarial', target_company_id: 'b', potential_amount_max: 50000, deadline_date: '2027-01-10' }],
      erreurs: [{ company_id: 't', error: 'Claude a refusé' }],
      lien: 'https://app.test/subventions',
    })
    assert.equal(r.sujet, 'Vigie de subventions : 1 nouvelle subvention à valider')
    assert.match(r.texte, /• Base de Plein Air Mont-Tremblant : 1/)
    assert.match(r.texte, /• Trembloc : 0 \(la recherche a échoué : Claude a refusé\)/)
    assert.match(r.texte, /\[Salariale\] EÉC <2027> — Base de Plein Air Mont-Tremblant — jusqu’à|jusqu'à/)
    assert.match(r.texte, /https:\/\/app.test\/subventions/)
    assert.match(r.html, /EÉC &lt;2027&gt;/)
  })

  it('rien de nouveau', () => {
    const r = construireRappel({ entreprises, nouvelles: [], erreurs: [], lien: 'x' })
    assert.equal(r.sujet, 'Vigie de subventions : rien de nouveau cette semaine')
  })

  it('MIME en UTF-8, encodé pour Gmail', () => {
    const raw = messageMime({ de: 'a@camp.com', a: ['b@camp.com', 'c@camp.com'], sujet: 'Été à valider', texte: 'Déjà ✓', html: '<p>Déjà</p>' })
    assert.doesNotMatch(raw, /[+/=]/)
    const mime = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    assert.match(mime, /^From: =\?UTF-8\?B\?.+\?= <a@camp.com>\r\nTo: b@camp.com, c@camp.com\r\nSubject: =\?UTF-8\?B\?/)
    const sujet = mime.match(/Subject: =\?UTF-8\?B\?(.+)\?=/)[1]
    assert.equal(Buffer.from(sujet, 'base64').toString('utf8'), 'Été à valider')
    const partie = mime.split('Content-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0]
    assert.equal(Buffer.from(partie.replace(/\r\n/g, ''), 'base64').toString('utf8'), 'Déjà ✓')
  })

  it('début de semaine = lundi 0 h UTC', () => {
    assert.equal(debutSemaine(new Date('2026-10-05T09:00:00Z')).toISOString(), '2026-10-05T00:00:00.000Z')
    assert.equal(debutSemaine(new Date('2026-10-04T23:00:00Z')).toISOString(), '2026-09-28T00:00:00.000Z')
  })
})

// ---------------------------------------------------------------------
// Simulation complète : fausse base Supabase, fausse API Claude, faux Google
// ---------------------------------------------------------------------
const ENV = {
  SUPABASE_URL: 'https://base.test',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  APP_URL: 'https://app.test/',
  SUBVENTIONS_MODELE: 'claude-opus-5-5',
  GMAIL_CLIENT_ID: 'id',
  GMAIL_CLIENT_SECRET: 'secret',
  GMAIL_REFRESH_TOKEN: 'refresh',
  GMAIL_EXPEDITEUR: 'vigie@camp.test',
}
const ENTREPRISE = { id: '11111111-1111-1111-1111-111111111111', slug: 'bpa', name: 'Base de Plein Air Mont-Tremblant', legal_status: 'OBNL', specific_criteria: 'Camp', active: true }

const fetchOriginal = globalThis.fetch
afterEach(() => {
  globalThis.fetch = fetchOriginal
})

const reponseJson = (corps, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } })

/** Installe un faux réseau ; `scenario` personnalise les réponses. Renvoie le journal des appels. */
function fauxReseau(scenario = {}) {
  const appels = { claude: [], patch: [], inserts: [], rpc: [], gmail: [] }
  const reponsesClaude = [...(scenario.claude ?? [])]
  globalThis.fetch = async (entree, init = {}) => {
    const url = new URL(typeof entree === 'string' ? entree : entree.url)
    const methode = init.method ?? 'GET'
    const brut = typeof init.body === 'string' ? init.body : init.body instanceof Uint8Array ? new TextDecoder().decode(init.body) : null
    const corps = brut && /^[[{]/.test(brut) ? JSON.parse(brut) : null
    const entetes = new Headers(init.headers)

    if (url.host === 'api.anthropic.com') {
      appels.claude.push({ corps, entetes })
      const r = reponsesClaude.shift()
      assert.ok(r, 'appel Claude inattendu')
      return reponseJson({ id: 'msg', type: 'message', role: 'assistant', model: corps.model, stop_details: null, ...r })
    }
    if (url.host === 'oauth2.googleapis.com') {
      assert.equal(new URLSearchParams(init.body).get('grant_type'), 'refresh_token')
      return reponseJson({ access_token: 'jeton' })
    }
    if (url.host === 'gmail.googleapis.com') {
      appels.gmail.push(corps)
      return reponseJson({ id: 'm1' })
    }

    assert.equal(url.host, 'base.test')
    const chemin = url.pathname.replace('/rest/v1/', '')
    if (chemin.startsWith('rpc/')) {
      const nom = chemin.slice(4)
      appels.rpc.push({ nom, corps, entetes })
      if (nom === 'peut_utiliser') return reponseJson(entetes.get('authorization') === 'Bearer jeton-direction')
      if (nom === 'feedback_pour_memoire') return reponseJson(scenario.feedback ?? [])
      if (nom === 'inserer_resultats') return reponseJson({ found: corps.p_items.length, new: corps.p_items.length, duplicate: 0 })
      if (nom === 'prochaine_entreprise_hebdo') return reponseJson(scenario.prochaine ?? null)
      if (nom === 'semaine_terminee') return reponseJson(scenario.semaineTerminee ?? false)
      if (nom === 'expirer_echues') return reponseJson(0)
      if (nom === 'destinataires') return reponseJson(['maxime@camp.test', 'direction@camp.test'])
    }
    if (url.pathname === '/auth/v1/user') return reponseJson({ email: 'maxime@camp.test' })
    if (methode === 'GET') {
      if (chemin === 'grant_companies') return reponseJson(url.search.includes('active=is.true') ? [{ id: ENTREPRISE.id, name: ENTREPRISE.name }] : [ENTREPRISE])
      if (chemin === 'grant_learned_rules') return reponseJson(scenario.regles ?? [])
      if (chemin === 'grant_settings')
        return reponseJson(
          url.search.includes('recherche_active')
            ? [{ value: scenario.actif ?? true }]
            : [{ key: 'criteres_communs', value: 'Priorité absolue : les subventions salariales.' }],
        )
      if (chemin === 'grants') return reponseJson(scenario.grants ?? [])
      if (chemin === 'grant_search_runs') return reponseJson(scenario.runs ?? [])
      if (chemin === 'grant_digests') return reponseJson(scenario.digests ?? [])
    }
    if (methode === 'POST') {
      appels.inserts.push({ table: chemin, corps })
      return reponseJson([{ id: `${chemin}-1`, ...corps }], 201)
    }
    if (methode === 'PATCH') {
      appels.patch.push({ table: chemin, filtre: url.search, corps })
      return new Response(null, { status: 204 })
    }
    throw new Error(`Requête non simulée : ${methode} ${url}`)
  }
  return appels
}

const outil = [
  { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'subvention' } },
  { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [] },
]
const usage = (entree, sortie, recherches) => ({ input_tokens: entree, output_tokens: sortie, server_tool_use: { web_search_requests: recherches } })
const PROGRAMMES = [
  { program_name: 'Emplois d’été Canada', organisme: 'EDSC', description: 'd', source_url: 'https://www.canada.ca/eec', grant_type: 'salarial', potential_amount_min: null, potential_amount_max: 50000, open_date: '2026-11-15', deadline_date: '2027-01-10', relevance_justification: 'j', program_key: 'emplois-ete-canada' },
  { program_name: 'Sans adresse', grant_type: 'autre' },
]

describe('pipeline (réseau simulé)', () => {
  it('recherche : mémoire, pause_turn, validation, insertion, journal', async () => {
    const texte = JSON.stringify(PROGRAMMES)
    const appels = fauxReseau({
      feedback: [{ decided_at: '2026-10-02T10:00:00Z', decision: 'valide', reject_category: null, program_name: 'X', grant_type: 'salarial', company_name: 'Opikawa' }],
      claude: [
        { content: [{ type: 'text', text: '- Privilégier les programmes salariaux.' }], stop_reason: 'end_turn', usage: usage(500, 100, 0) },
        { content: [{ type: 'text', text: 'Je cherche.' }, ...outil], stop_reason: 'pause_turn', usage: usage(1000, 50, 3) },
        {
          content: [...outil, { type: 'text', text: texte.slice(0, 40) }, { type: 'text', text: texte.slice(40), citations: [] }],
          stop_reason: 'end_turn',
          usage: usage(2000, 800, 4),
        },
      ],
    })

    const bilan = await rechercherEntreprise(ENV, { entrepriseId: ENTREPRISE.id })
    assert.deepEqual(bilan, { run: 'grant_search_runs-1', entreprise: ENTREPRISE.name, found: 1, new: 1, duplicate: 0, invalid: 1 })

    // Mémoire produite puis utilisée par la recherche.
    const regles = appels.inserts.find((i) => i.table === 'grant_learned_rules')
    assert.equal(regles.corps.summary, '- Privilégier les programmes salariaux.')
    const run = appels.inserts.find((i) => i.table === 'grant_search_runs')
    assert.equal(run.corps.memory_version_id, 'grant_learned_rules-1')
    assert.equal(run.corps.trigger_source, 'cron')

    // Requête de recherche : modèle, repli, effort, outils web.
    const [memoire, recherche, reprise] = appels.claude
    assert.equal(memoire.corps.output_config.effort, 'medium')
    assert.equal(recherche.corps.model, 'claude-opus-5-5')
    assert.equal(recherche.corps.fallbacks, 'default')
    assert.match(recherche.entetes.get('anthropic-beta'), /server-side-fallback-2026-07-01/)
    assert.equal(recherche.corps.output_config.effort, 'high')
    assert.deepEqual(recherche.corps.tools.map((t) => t.type), ['web_search_20260209', 'web_fetch_20260209'])
    assert.match(recherche.corps.messages[0].content, /Privilégier les programmes salariaux/)
    assert.equal(recherche.entetes.get('x-api-key'), 'sk-ant-test')
    // Reprise après pause : le tour de l'assistant est renvoyé, sans message « continue ».
    assert.equal(reprise.corps.messages.length, 2)
    assert.equal(reprise.corps.messages[1].role, 'assistant')

    // Seul l'élément valide va dans la base ; journal complété.
    const insertion = appels.rpc.find((r) => r.nom === 'inserer_resultats')
    assert.equal(insertion.corps.p_items.length, 1)
    assert.equal(insertion.corps.p_items[0].source_url, 'https://www.canada.ca/eec')
    const fin = appels.patch.at(-1).corps
    assert.equal(fin.invalid_count, 1)
    assert.equal(fin.input_tokens, 3000)
    assert.equal(fin.output_tokens, 850)
    assert.equal(fin.web_search_count, 7)
    assert.equal(fin.error, null)
    assert.match(fin.raw_output, /nom|adresse/)
  })

  it('sortie illisible : rattrapage en sorties structurées', async () => {
    const appels = fauxReseau({
      claude: [
        { content: [...outil, { type: 'text', text: 'Voici deux programmes : EÉC et PAFIRS.' }], stop_reason: 'end_turn', usage: usage(10, 10, 1) },
        { content: [{ type: 'text', text: JSON.stringify({ programmes: [PROGRAMMES[0]] }) }], stop_reason: 'end_turn', usage: usage(10, 10, 0) },
      ],
    })
    const bilan = await rechercherEntreprise(ENV, { entrepriseId: ENTREPRISE.id, declencheur: 'manuel', sansMemoire: true })
    assert.equal(bilan.new, 1)
    assert.equal(appels.claude[1].corps.output_config.format.type, 'json_schema')
    assert.equal(appels.inserts.find((i) => i.table === 'grant_search_runs').corps.memory_version_id, null)
  })

  it('refus du modèle : erreur écrite dans le journal', async () => {
    const appels = fauxReseau({
      claude: [{ content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: null }, usage: usage(1, 0, 0) }],
    })
    await assert.rejects(rechercherEntreprise(ENV, { entrepriseId: ENTREPRISE.id }), /refusé/)
    assert.match(appels.patch.at(-1).corps.error, /Claude a refusé la demande \(cyber\)/)
    assert.ok(appels.patch.at(-1).corps.finished_at)
  })

  it('tour du lundi : dernière entreprise puis courriel unique', async () => {
    const appels = fauxReseau({
      prochaine: ENTREPRISE.id,
      semaineTerminee: true,
      grants: [{ program_name: 'Emplois d’été Canada', grant_type: 'salarial', target_company_id: ENTREPRISE.id, potential_amount_max: 50000, deadline_date: '2027-01-10' }],
      claude: [{ content: [...outil, { type: 'text', text: '[]' }], stop_reason: 'end_turn', usage: usage(10, 10, 1) }],
    })
    await tourHebdomadaire(ENV)
    assert.equal(appels.claude.length, 1)
    const digest = appels.inserts.find((i) => i.table === 'grant_digests')
    assert.deepEqual(digest.corps.recipients, ['maxime@camp.test', 'direction@camp.test'])
    assert.equal(appels.gmail.length, 1)
    const mime = Buffer.from(appels.gmail[0].raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    assert.match(mime, /To: maxime@camp.test, direction@camp.test/)
    assert.ok(appels.rpc.some((r) => r.nom === 'expirer_echues'))
  })

  it('tour du lundi : courriel déjà parti, recherche en pause, secrets manquants', async () => {
    let appels = fauxReseau({ semaineTerminee: true, digests: [{ week_start: '2026-10-05' }] })
    await tourHebdomadaire(ENV)
    assert.equal(appels.gmail.length, 0)

    appels = fauxReseau({ actif: false, prochaine: ENTREPRISE.id })
    await tourHebdomadaire(ENV)
    assert.equal(appels.rpc.length, 0)

    appels = fauxReseau()
    await tourHebdomadaire({ ...ENV, ANTHROPIC_API_KEY: undefined })
    assert.equal(appels.rpc.length + appels.inserts.length, 0)
  })
})

describe('routes /api/subventions (réseau simulé)', () => {
  const requete = (chemin, { jeton, methode = 'GET', corps } = {}) =>
    new Request(`https://app.test/api/subventions/${chemin}`, {
      method: methode,
      headers: jeton ? { Authorization: `Bearer ${jeton}` } : {},
      body: corps ? JSON.stringify(corps) : undefined,
    })
  const ctx = { waitUntil: () => {} }

  it('refuse sans jeton de la direction', async () => {
    fauxReseau()
    assert.equal((await routeSubventions(requete('etat'), ENV, ctx, 'etat')).status, 403)
    assert.equal((await routeSubventions(requete('etat', { jeton: 'autre' }), ENV, ctx, 'etat')).status, 403)
  })

  it('état de la configuration, sans les secrets', async () => {
    fauxReseau()
    const r = await routeSubventions(requete('etat', { jeton: 'jeton-direction' }), { ...ENV, GMAIL_REFRESH_TOKEN: '' }, ctx, 'etat')
    const corps = await r.json()
    assert.deepEqual(corps, { anthropic: true, supabase: true, gmail: false, modele: 'claude-opus-5-5' })
    assert.doesNotMatch(JSON.stringify(corps), /sk-ant|sb_secret/)
  })

  it('recherche manuelle en flux : battement puis bilan', async () => {
    fauxReseau({ claude: [{ content: [...outil, { type: 'text', text: JSON.stringify([PROGRAMMES[0]]) }], stop_reason: 'end_turn', usage: usage(1, 1, 1) }] })
    const r = await routeSubventions(
      requete('recherche', { jeton: 'jeton-direction', methode: 'POST', corps: { company_id: ENTREPRISE.id, sans_memoire: true } }),
      ENV,
      ctx,
      'recherche',
    )
    const lignes = (await r.text()).trim().split('\n').map((l) => JSON.parse(l))
    assert.deepEqual(lignes[0], { etat: 'en_cours' })
    assert.equal(lignes.at(-1).fin, true)
    assert.equal(lignes.at(-1).new, 1)
  })

  it('recherche refusée si une autre est en cours', async () => {
    fauxReseau({ runs: [{ id: 'r' }] })
    const r = await routeSubventions(requete('recherche', { jeton: 'jeton-direction', methode: 'POST', corps: { company_id: ENTREPRISE.id } }), ENV, ctx, 'recherche')
    assert.equal(r.status, 409)
  })

  it('courriel d’essai à la personne connectée seulement', async () => {
    const appels = fauxReseau()
    const r = await routeSubventions(requete('courriel', { jeton: 'jeton-direction', methode: 'POST' }), ENV, ctx, 'courriel')
    assert.deepEqual(await r.json(), { envoye: 'maxime@camp.test' })
    const mime = Buffer.from(appels.gmail[0].raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    assert.match(mime, /To: maxime@camp.test\r\n/)
  })
})
