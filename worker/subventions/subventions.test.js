// Tests de la Vigie de subventions (côté Worker) : `npm run test:worker`.
// Les appels réseau (Supabase, API Claude, Google) sont simulés : aucun
// secret n'est nécessaire et rien n'est écrit nulle part.

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { actionsAgenda, evenementsVoulus } from '../../src/modules/subventions/agenda.ts'
import { synchroniserAgenda } from './agenda.js'
import { routeSubventions } from './api.js'
import { construireRappel, messageMime, trierPrometteuses } from './courriel.js'
import { invitationMemoire, invitationMiseAJour, invitationRecherche } from './invites.js'
import { debutTrimestre, estTourTrimestriel, mettreAJourRetenues, passageSubventions, rechercherEntreprise, tourTrimestriel } from './pipeline.js'
import { cleProgramme, dateIso, extraireTableau, montant, texteFinal, typeSubvention, validerMisesAJour, validerProgrammes } from './resultats.js'

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
      { program_name: ' EÉC ', source_url: 'https://canada.ca/eec', grant_type: 'salarial', potential_amount_min: 9000, potential_amount_max: '3000', funded_start: '2027-08-27', funded_end: '2027-06-21', program_key: '' },
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
        funded_start: '2027-06-21',
        funded_end: '2027-08-27',
        eligibility_criteria: null,
        relevance_justification: null,
        program_key: 'eec',
      },
    )
  })
})

describe('mise à jour ciblée : lecture de la réponse', () => {
  const parRef = new Map([
    ['S1', { id: 'g-cours', status: 'en_cours' }],
    ['S2', { id: 'g-obtenue', status: 'obtenu' }],
  ])
  it('nettoie les champs d’une subvention en cours ; référence inconnue ou en double écartée', () => {
    const { valides, invalides } = validerMisesAJour(
      [
        { ref: 's1', deadline_date: '2027-01-15', open_date: '15 nov.', potential_amount_min: '60 000 $', potential_amount_max: 5000, funded_start: '2027-08-27', funded_end: '2027-06-21', source_url: 'ftp://x', verification_url: 'https://canada.ca/eec', comment: ' Date limite repoussée. ', new_edition: { open_date: '2027-11-15' } },
        { ref: 'S9', deadline_date: '2027-01-15' },
        { ref: 'S1', deadline_date: '2027-02-01' },
        'texte',
      ],
      parRef,
    )
    assert.equal(valides.length, 1)
    assert.equal(invalides.length, 3)
    assert.deepEqual(valides[0], {
      grant_id: 'g-cours',
      source_url: null,
      open_date: null,
      deadline_date: '2027-01-15',
      funded_start: '2027-06-21',
      funded_end: '2027-08-27',
      potential_amount_min: 5000,
      potential_amount_max: 60000,
      eligibility_criteria: null,
      verification_url: 'https://canada.ca/eec',
      comment: 'Date limite repoussée.',
      new_edition: null,
    })
  })

  it('obtenue : jamais modifiée, seulement sa nouvelle édition (ignorée si elle n’apprend rien)', () => {
    const { valides } = validerMisesAJour(
      [{ ref: 'S2', deadline_date: '2030-01-01', new_edition: { program_name: 'EÉC 2028', open_date: '2027-11-15', deadline_date: '2028-01-10', potential_amount_max: 55000 } }],
      parRef,
    )
    assert.equal(valides[0].deadline_date, null)
    assert.deepEqual(valides[0].new_edition, {
      program_name: 'EÉC 2028',
      source_url: null,
      open_date: '2027-11-15',
      deadline_date: '2028-01-10',
      potential_amount_min: null,
      potential_amount_max: 55000,
      funded_start: null,
      funded_end: null,
      eligibility_criteria: null,
      description: null,
    })
    const vide = validerMisesAJour([{ ref: 'S2', new_edition: { program_name: 'Rien' } }], parRef)
    assert.equal(vide.valides[0].new_edition, null)
  })
})

describe('prompts', () => {
  const groupe = [
    { name: 'Base de Plein Air Mont-Tremblant', legal_status: 'OBNL' },
    { name: 'Trembloc', legal_status: null },
  ]

  it('recherche : groupe, priorité salariale, critères, règles, programmes connus', () => {
    const p = invitationRecherche({
      entreprise: { name: 'Trembloc', legal_status: null, specific_criteria: 'Bloc extérieur', hires_staff: true },
      groupe,
      consignes: '',
      regles: null,
      connus: [{ program_name: 'EÉC', source_url: 'https://canada.ca/eec', status: 'rejete', program_key: 'eec', discovered_fy: 2027 }],
      aujourdhui: 'samedi 3 octobre 2026',
    })
    assert.match(p, /pour Trembloc \(statut juridique non précisé/)
    assert.match(p, /celle-ci vise seulement Trembloc\) :\n- Base de Plein Air Mont-Tremblant \(OBNL\)\n- Trembloc\n/)
    assert.match(p, /Priorité absolue : les subventions salariales/)
    assert.match(p, /Ratisse large/)
    assert.doesNotMatch(p, /Consignes de la direction/)
    assert.match(p, /Bloc extérieur/)
    assert.match(p, /Aucune règle apprise/)
    assert.match(p, /- EÉC \| https:\/\/canada.ca\/eec \| rejetée \| eec \| 2026-27/)
    assert.match(p, /Réponds uniquement avec un tableau JSON/)
  })

  it('recherche : entreprise sans personnel et consignes du groupe', () => {
    const p = invitationRecherche({
      entreprise: { name: 'Immeubles inc', legal_status: 'Entreprise privée', specific_criteria: null, hires_staff: false },
      groupe,
      consignes: '  Exclure le manufacturier.  ',
      regles: null,
      connus: [],
      aujourdhui: 'lundi 5 octobre 2026',
    })
    assert.doesNotMatch(p, /Priorité absolue/)
    assert.match(p, /n'embauche pas de personnel/)
    assert.match(p, /Consignes de la direction pour tout le groupe :\nExclure le manufacturier\.\n/)
  })

  it('mise à jour ciblée : chaque subvention avec sa référence et ce que l’app en sait', () => {
    const p = invitationMiseAJour({
      entreprise: { name: 'GBPA+', legal_status: 'OBNL' },
      subventions: [
        { ref: 'S1', status: 'en_cours', program_name: 'JCTDLO', organisme: 'Patrimoine canadien', source_url: 'https://x.ca', open_date: null, deadline_date: '2027-02-01', potential_amount_max: 12000, eligibility_criteria: 'Jeunes de 16 à 30 ans', fiscal_year: 2027 },
        { ref: 'S2', status: 'obtenu', program_name: 'EÉC 2026', organisme: 'EDSC', fiscal_year: 2026 },
      ],
      aujourdhui: 'vendredi 1er janvier 2027',
    })
    assert.match(p, /pour GBPA\+ \(OBNL\)/)
    assert.match(p, /S1 \| en cours \| JCTDLO \| Patrimoine canadien \| lien https:\/\/x.ca \| ouverture — \| date limite 2027-02-01 .*montant max\. 12000 \| critères Jeunes de 16 à 30 ans/)
    assert.match(p, /S2 \| obtenue \(2025-26\) \| EÉC 2026 \| EDSC/)
    assert.match(p, /"new_edition": null \| \{/)
    assert.match(p, /ne change rien à cette subvention/)
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
    assert.equal(r.sujet, 'Vigie de subventions : rien de nouveau ce trimestre')
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

})

describe('calendrier de la recherche (4 fois par année)', () => {
  it('début du trimestre de l’année fiscale', () => {
    assert.equal(debutTrimestre(new Date('2026-10-14T09:00:00Z')).toISOString(), '2026-10-01T00:00:00.000Z')
    assert.equal(debutTrimestre(new Date('2027-03-31T23:00:00Z')).toISOString(), '2027-01-01T00:00:00.000Z')
    assert.equal(debutTrimestre(new Date('2027-07-02T08:00:00Z')).toISOString(), '2027-07-01T00:00:00.000Z')
  })

  it('passages du 1er au 7 octobre, janvier, avril et juillet, heure pile de 8 h à 11 h UTC', () => {
    assert.equal(estTourTrimestriel(new Date('2027-01-01T08:00:00Z')), true)
    assert.equal(estTourTrimestriel(new Date('2027-04-07T11:14:00Z')), true)
    assert.equal(estTourTrimestriel(new Date('2026-10-01T08:15:00Z')), false) // pas l'heure pile
    assert.equal(estTourTrimestriel(new Date('2026-10-01T12:00:00Z')), false)
    assert.equal(estTourTrimestriel(new Date('2026-10-08T08:00:00Z')), false) // après le 7
    assert.equal(estTourTrimestriel(new Date('2026-11-02T08:00:00Z')), false) // un lundi d'un autre mois
    assert.equal(estTourTrimestriel(new Date('2026-10-12T08:00:00Z')), false) // un lundi d'octobre après le 7
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
  const appels = { claude: [], patch: [], inserts: [], rpc: [], gmail: [], google: [], suppressions: [] }
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
    if (url.host === 'www.googleapis.com') {
      appels.google.push({ methode, chemin: decodeURIComponent(url.pathname), corps })
      return methode === 'DELETE' ? new Response(null, { status: 204 }) : reponseJson({ id: `g-${appels.google.length}` })
    }

    assert.equal(url.host, 'base.test')
    const chemin = url.pathname.replace('/rest/v1/', '')
    if (chemin.startsWith('rpc/')) {
      const nom = chemin.slice(4)
      appels.rpc.push({ nom, corps, entetes })
      if (nom === 'peut_utiliser') return reponseJson(entetes.get('authorization') === 'Bearer jeton-direction')
      if (nom === 'feedback_pour_memoire') return reponseJson(scenario.feedback ?? [])
      if (nom === 'inserer_resultats') return reponseJson({ found: corps.p_items.length, new: corps.p_items.length, duplicate: 0 })
      if (nom === 'prochaine_tache_trimestre') return reponseJson(scenario.tache ?? null)
      if (nom === 'retenues_a_verifier') return reponseJson(scenario.retenues ?? [])
      if (nom === 'appliquer_mise_a_jour') return reponseJson({ checked: corps.p_grants.length, filled: 1, proposed: 1, new: 0, duplicate: 0 })
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
            : url.search.includes('key=eq.agenda')
              ? scenario.agenda
                ? [{ value: scenario.agenda }]
                : []
              : [{ key: 'consignes_groupe', value: 'Exclure le manufacturier.' }],
        )
      if (chemin === 'grant_reporting_steps') return reponseJson(scenario.etapes ?? [])
      if (chemin === 'grant_calendar_events') return reponseJson(scenario.evenements ?? [])
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
    if (methode === 'DELETE') {
      appels.suppressions.push({ table: chemin, filtre: decodeURIComponent(url.search) })
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
    assert.match(recherche.corps.messages[0].content, /- Base de Plein Air Mont-Tremblant\n/)
    assert.match(recherche.corps.messages[0].content, /Consignes de la direction pour tout le groupe :\nExclure le manufacturier\./)
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

  it('mise à jour ciblée : retenues envoyées avec une référence, réponse appliquée, journal', async () => {
    const retenues = [
      { id: 'g-cours', status: 'en_cours', program_name: 'JCTDLO', organisme: 'PCH', source_url: 'https://x.ca', deadline_date: '2027-02-01', fiscal_year: 2027 },
      { id: 'g-obtenue', status: 'obtenu', program_name: 'EÉC 2026', organisme: 'EDSC', fiscal_year: 2026 },
    ]
    const reponse = [
      { ref: 'S1', deadline_date: '2027-02-15', open_date: '2026-11-01', verification_url: 'https://x.ca', comment: 'Date limite repoussée.' },
      { ref: 'S2', new_edition: { program_name: 'EÉC 2027', open_date: '2026-11-15', deadline_date: '2027-01-12' } },
      { ref: 'S7' },
    ]
    const appels = fauxReseau({
      retenues,
      claude: [{ content: [...outil, { type: 'text', text: JSON.stringify(reponse) }], stop_reason: 'end_turn', usage: usage(100, 50, 2) }],
    })
    const bilan = await mettreAJourRetenues(ENV, { entrepriseId: ENTREPRISE.id, declencheur: 'manuel' })
    assert.deepEqual(bilan, { run: 'grant_search_runs-1', entreprise: ENTREPRISE.name, checked: 2, filled: 1, proposed: 1, new: 0, duplicate: 0, invalid: 1 })

    const demande = appels.rpc.find((x) => x.nom === 'retenues_a_verifier').corps
    assert.deepEqual(demande, { p_company: ENTREPRISE.id, p_depuis: null, p_max: 10 })
    const run = appels.inserts.find((i) => i.table === 'grant_search_runs').corps
    assert.equal(run.kind, 'ciblee')
    assert.equal(run.trigger_source, 'manuel')
    const invite = appels.claude[0].corps.messages[0].content
    assert.match(invite, /S1 \| en cours \| JCTDLO/)
    assert.match(invite, /S2 \| obtenue \(2025-26\) \| EÉC 2026/)
    const applique = appels.rpc.find((x) => x.nom === 'appliquer_mise_a_jour').corps
    assert.deepEqual(applique.p_grants, ['g-cours', 'g-obtenue'])
    assert.equal(applique.p_items.length, 2)
    assert.equal(applique.p_items[0].deadline_date, '2027-02-15')
    assert.equal(applique.p_items[1].new_edition.deadline_date, '2027-01-12')
    const fin = appels.patch.at(-1).corps
    assert.equal(fin.invalid_count, 1)
    assert.equal(fin.web_search_count, 2)
  })

  it('mise à jour ciblée : rien à vérifier, aucun appel à Claude ni ligne au journal', async () => {
    const appels = fauxReseau({ retenues: [] })
    const bilan = await mettreAJourRetenues(ENV, { entrepriseId: ENTREPRISE.id, trimestre: true })
    assert.equal(bilan.checked, 0)
    assert.equal(appels.claude.length + appels.inserts.length, 0)
    assert.match(appels.rpc.find((x) => x.nom === 'retenues_a_verifier').corps.p_depuis, /^\d{4}-(01|04|07|10)-01T00:00:00/)
  })

  it('tour du trimestre : la tâche donnée par la base (large ou ciblée), jamais de courriel', async () => {
    let appels = fauxReseau({
      tache: { kind: 'large', company_id: ENTREPRISE.id },
      claude: [{ content: [...outil, { type: 'text', text: '[]' }], stop_reason: 'end_turn', usage: usage(10, 10, 1) }],
    })
    await tourTrimestriel(ENV)
    assert.equal(appels.claude.length, 1)
    assert.equal(appels.inserts.find((i) => i.table === 'grant_search_runs').corps.kind, 'large')

    appels = fauxReseau({
      tache: { kind: 'ciblee', company_id: ENTREPRISE.id },
      retenues: [{ id: 'g', status: 'en_cours', program_name: 'X', fiscal_year: 2027 }],
      claude: [{ content: [...outil, { type: 'text', text: '[]' }], stop_reason: 'end_turn', usage: usage(10, 10, 1) }],
    })
    await tourTrimestriel(ENV)
    assert.equal(appels.inserts.find((i) => i.table === 'grant_search_runs').corps.kind, 'ciblee')
    assert.ok(appels.rpc.find((x) => x.nom === 'retenues_a_verifier').corps.p_depuis)

    // Tout est fait : rien, et surtout pas de courriel (désactivés jusqu'à nouvel ordre).
    appels = fauxReseau({ tache: null })
    await tourTrimestriel(ENV)
    assert.equal(appels.claude.length + appels.gmail.length + appels.inserts.length, 0)
    assert.ok(!appels.rpc.some((x) => x.nom === 'destinataires'))
  })

  it('tour du trimestre : recherche en pause, secrets manquants', async () => {
    let appels = fauxReseau({ actif: false, tache: { kind: 'large', company_id: ENTREPRISE.id } })
    await tourTrimestriel(ENV)
    assert.equal(appels.rpc.length, 0)

    appels = fauxReseau()
    await tourTrimestriel({ ...ENV, ANTHROPIC_API_KEY: undefined })
    assert.equal(appels.rpc.length + appels.inserts.length, 0)
  })

  it('passage du cron : agenda chaque fois, échues à 8 h UTC, recherche seulement en début de trimestre', async () => {
    let appels = fauxReseau()
    await passageSubventions(ENV, new Date('2026-10-14T13:30:00Z'))
    assert.deepEqual(appels.rpc.map((x) => x.nom), [])
    assert.equal(appels.claude.length, 0)

    appels = fauxReseau()
    await passageSubventions(ENV, new Date('2026-10-14T08:00:00Z'))
    assert.deepEqual(appels.rpc.map((x) => x.nom), ['expirer_echues'])

    appels = fauxReseau({ tache: null })
    await passageSubventions(ENV, new Date('2027-01-01T09:00:00Z'))
    assert.deepEqual(appels.rpc.map((x) => x.nom), ['prochaine_tache_trimestre'])

    appels = fauxReseau()
    await passageSubventions({ ...ENV, SUPABASE_SECRET_KEY: undefined }, new Date('2027-01-01T08:00:00Z'))
    assert.equal(appels.rpc.length, 0)
  })
})

describe('agenda Google « Subventions »', () => {
  const g = (modif = {}) => ({
    id: 'g1',
    program_name: 'JCTDLO',
    status: 'en_cours',
    open_date: '2026-11-01',
    deadline_date: '2027-02-01',
    source_url: 'https://x.ca',
    target_company_id: 'c1',
    applicant_company_id: null,
    potential_amount_min: null,
    potential_amount_max: 12000,
    amount_granted: null,
    ...modif,
  })
  const options = { entreprise: (id) => ({ c1: 'GBPA+', c2: 'Opikawa' })[id], lien: (id) => `https://app.test/subventions/fiche/${id}`, depuis: '2026-10-01' }

  it('retenue : ouverture et date limite, journée entière, sans bloquer le temps ; rien d’avant la mise en service', () => {
    const v = evenementsVoulus([g()], [], options)
    assert.deepEqual(v.map((e) => [e.cle, e.date]), [['ouverture:g1', '2026-11-01'], ['fermeture:g1', '2027-02-01']])
    assert.equal(v[1].evenement.summary, 'Date limite · JCTDLO (GBPA+)')
    assert.deepEqual([v[1].evenement.start.date, v[1].evenement.end.date, v[1].evenement.transparency], ['2027-02-01', '2027-02-02', 'transparent'])
    assert.match(v[1].evenement.description, /jusqu'à 12\s000 \$\nPage officielle : https:\/\/x.ca\nFiche : https:\/\/app.test\/subventions\/fiche\/g1/)
    assert.deepEqual(evenementsVoulus([g({ open_date: '2026-09-15' })], [], options).map((e) => e.genre), ['fermeture'])
  })

  it('obtenue : aussi les échéances de reddition pas encore faites ; autres statuts : rien', () => {
    const etapes = [
      { id: 'e1', grant_id: 'g1', description: 'Rapport final', due_date: '2027-10-15', status: 'a_faire' },
      { id: 'e2', grant_id: 'g1', description: 'Talons de paie', due_date: '2027-09-01', status: 'complete' },
      { id: 'e3', grant_id: 'g1', description: 'Sans date', due_date: null, status: 'a_faire' },
    ]
    const v = evenementsVoulus([g({ status: 'obtenu', applicant_company_id: 'c2', amount_granted: 9000 })], etapes, options)
    assert.deepEqual(v.map((e) => e.cle), ['ouverture:g1', 'fermeture:g1', 'reddition:e1'])
    assert.equal(v[2].evenement.summary, 'Reddition · Rapport final — JCTDLO (Opikawa)')
    assert.match(v[2].evenement.description, /Accordé : 9\s000 \$/)
    assert.deepEqual(evenementsVoulus([g()], etapes, options).map((e) => e.genre), ['ouverture', 'fermeture'])
    for (const status of ['nouveau', 'a_valider', 'rejete', 'refuse', 'expire']) assert.equal(evenementsVoulus([g({ status })], etapes, options).length, 0)
  })

  it('actions : créer, modifier si le contenu change, déplacer d’agenda, retirer ce qui n’est plus voulu', () => {
    const [ouverture, fermeture] = evenementsVoulus([g()], [], options)
    const lignes = [
      { event_key: 'ouverture:g1', grant_id: 'g1', calendar_id: 'cal', google_id: 'go', content: JSON.stringify(ouverture.evenement) },
      { event_key: 'fermeture:g1', grant_id: 'g1', calendar_id: 'cal', google_id: 'gf', content: 'ancien' },
      { event_key: 'reddition:e9', grant_id: 'g2', calendar_id: 'cal', google_id: 'gr', content: 'x' },
      { event_key: 'ouverture:g3', grant_id: 'g3', calendar_id: null, google_id: null, content: null, error: 'Google : 403' },
    ]
    assert.deepEqual(actionsAgenda([ouverture, fermeture], lignes, 'cal').map((a) => [a.genre, a.genre === 'retirer' ? a.ligne.event_key : a.voulu.cle]), [
      ['modifier', 'fermeture:g1'],
      ['retirer', 'reddition:e9'],
      ['retirer', 'ouverture:g3'],
    ])
    assert.deepEqual(actionsAgenda([ouverture], lignes.slice(0, 1), 'autre').map((a) => a.genre), ['deplacer'])
    assert.deepEqual(actionsAgenda([ouverture], [], 'cal').map((a) => a.genre), ['creer'])
  })

  it('synchro : rien tant que le réglage est inactif ; en DEV (base locale), simulée, jamais Google', async () => {
    let appels = fauxReseau()
    assert.deepEqual(await synchroniserAgenda(ENV), { actif: false, mode: 'non_configure', faites: 0, restantes: 0 })
    assert.equal(appels.inserts.length, 0)

    appels = fauxReseau({ agenda: { actif: true, calendrier: 'essai-subventions', depuis: '2026-10-01' }, grants: [g()] })
    const local = { ...ENV, SUPABASE_URL: 'http://127.0.0.1:54321' }
    globalThis.fetch = ((f) => (entree, init) => f(String(entree).replace('http://127.0.0.1:54321', 'https://base.test'), init))(globalThis.fetch)
    const r = await synchroniserAgenda(local, { grantId: 'g1' })
    assert.deepEqual(r, { actif: true, mode: 'simule', faites: 2, erreurs: 0, restantes: 0 })
    assert.equal(appels.google.length, 0)
    const ecrits = appels.inserts.filter((i) => i.table === 'grant_calendar_events').map((i) => i.corps)
    assert.deepEqual(ecrits.map((e) => [e.event_key, e.calendar_id, e.google_id.startsWith('simule:')]), [
      ['ouverture:g1', 'essai-subventions', true],
      ['fermeture:g1', 'essai-subventions', true],
    ])
  })

  it('synchro Google : crée, remplace, retire dans l’agenda réglé ; erreur gardée sur la ligne', async () => {
    const env = { ...ENV, SUBVENTIONS_AGENDA_REFRESH_TOKEN: 'refresh-agenda' }
    const subvention = g({ target_company_id: ENTREPRISE.id })
    const [ouverture] = evenementsVoulus([subvention], [], { ...options, entreprise: () => ENTREPRISE.name })
    const appels = fauxReseau({
      agenda: { actif: true, calendrier: 'sub@group.calendar.google.com' },
      grants: [subvention],
      evenements: [
        { event_key: 'ouverture:g1', grant_id: 'g1', calendar_id: 'sub@group.calendar.google.com', google_id: 'go', content: JSON.stringify(ouverture.evenement) },
        { event_key: 'fermeture:g1', grant_id: 'g1', calendar_id: 'sub@group.calendar.google.com', google_id: 'gf', content: 'ancien' },
        { event_key: 'fermeture:g-rejetee', grant_id: 'g-rejetee', calendar_id: 'sub@group.calendar.google.com', google_id: 'gx', content: 'x' },
      ],
    })
    const r = await synchroniserAgenda(env)
    assert.deepEqual(r, { actif: true, mode: 'google', faites: 2, erreurs: 0, restantes: 0 })
    assert.deepEqual(appels.google.map((x) => [x.methode, x.chemin]), [
      ['PUT', '/calendar/v3/calendars/sub@group.calendar.google.com/events/gf'],
      ['DELETE', '/calendar/v3/calendars/sub@group.calendar.google.com/events/gx'],
    ])
    assert.equal(appels.google[0].corps.summary, 'Date limite · JCTDLO (Base de Plein Air Mont-Tremblant)')
    assert.deepEqual(appels.suppressions, [{ table: 'grant_calendar_events', filtre: '?event_key=eq.fermeture:g-rejetee' }])

    // Sans jeton de l'agenda : rien n'est tenté.
    fauxReseau({ agenda: { actif: true, calendrier: 'sub@group.calendar.google.com' } })
    assert.match((await synchroniserAgenda(ENV)).erreur, /SUBVENTIONS_AGENDA_REFRESH_TOKEN/)
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
    assert.deepEqual(corps, { anthropic: true, supabase: true, gmail: false, modele: 'claude-opus-5-5', agenda: 'non_configure' })
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

  it('mise à jour ciblée manuelle en flux', async () => {
    const appels = fauxReseau({
      retenues: [{ id: 'g', status: 'en_cours', program_name: 'X', fiscal_year: 2027 }],
      claude: [{ content: [...outil, { type: 'text', text: '[{"ref":"S1","deadline_date":"2027-03-01"}]' }], stop_reason: 'end_turn', usage: usage(1, 1, 1) }],
    })
    const r = await routeSubventions(
      requete('recherche', { jeton: 'jeton-direction', methode: 'POST', corps: { company_id: ENTREPRISE.id, genre: 'ciblee' } }),
      ENV,
      ctx,
      'recherche',
    )
    const fin = (await r.text()).trim().split('\n').map((l) => JSON.parse(l)).at(-1)
    assert.deepEqual([fin.fin, fin.checked, fin.filled, fin.proposed], [true, 1, 1, 1])
    assert.equal(appels.inserts.find((i) => i.table === 'grant_search_runs').corps.kind, 'ciblee')
  })

  it('agenda : synchro d’une subvention depuis la fiche', async () => {
    fauxReseau()
    const r = await routeSubventions(requete('agenda', { jeton: 'jeton-direction', methode: 'POST', corps: { grant_id: ENTREPRISE.id } }), ENV, ctx, 'agenda')
    assert.deepEqual(await r.json(), { actif: false, mode: 'non_configure', faites: 0, restantes: 0 })
    const mauvais = await routeSubventions(requete('agenda', { jeton: 'jeton-direction', methode: 'POST', corps: { grant_id: 'x' } }), ENV, ctx, 'agenda')
    assert.equal(mauvais.status, 400)
  })

  it('courriel d’essai : aucun courriel jusqu’à nouvel ordre', async () => {
    const appels = fauxReseau()
    const r = await routeSubventions(requete('courriel', { jeton: 'jeton-direction', methode: 'POST' }), ENV, ctx, 'courriel')
    assert.equal(r.status, 410)
    assert.match((await r.json()).erreur, /aucun courriel/)
    assert.equal(appels.gmail.length, 0)
  })
})
