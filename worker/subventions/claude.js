// Appels à l'API Claude (SDK officiel). Modèle : variable SUBVENTIONS_MODELE
// (wrangler.jsonc), claude-opus-5-5 par défaut.
//
// Requêtes non diffusées (pas de streaming) : une recherche dure quelques
// minutes, mais lire un flux coûte du temps processeur à chaque morceau, et
// le forfait gratuit des Workers n'en accorde que 10 ms par appel. Le délai
// est donc fixé à la main (sinon le SDK exige le streaming).

import Anthropic from '@anthropic-ai/sdk'
import { invitationReparation } from './invites.js'
import { TYPES, texteFinal } from './resultats.js'

export const MODELE_PAR_DEFAUT = 'claude-opus-5-5'

// Modèles qui acceptent le repli automatique en cas de refus
// (fallbacks: "default") et le réglage d'effort.
const AVEC_REPLI = ['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']
const SANS_EFFORT = ['claude-haiku-4-5']

const MAX_REPRISES = 5

export function modele(env) {
  return env.SUBVENTIONS_MODELE?.trim() || MODELE_PAR_DEFAUT
}

export function clientClaude(env, { delai = 11 * 60 * 1000, essais = 1 } = {}) {
  // ANTHROPIC_BASE_URL : essais locaux seulement (fausse API), jamais en ligne.
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL || undefined, timeout: delai, maxRetries: essais })
}

/** Paramètres communs : repli en cas de refus, effort. */
function parametres(nom, effort) {
  return {
    model: nom,
    ...(AVEC_REPLI.includes(nom) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    ...(SANS_EFFORT.includes(nom) ? {} : { output_config: { effort } }),
  }
}

function usageVide() {
  return { input_tokens: 0, output_tokens: 0, web_search_requests: 0 }
}

function cumuler(total, usage) {
  if (!usage) return
  total.input_tokens +=
    (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
  total.output_tokens += usage.output_tokens ?? 0
  total.web_search_requests += usage.server_tool_use?.web_search_requests ?? 0
}

function verifierFin(reponse) {
  if (reponse.stop_reason === 'refusal') {
    const raison = reponse.stop_details?.explanation ?? reponse.stop_details?.category ?? 'sans précision'
    throw new Error(`Claude a refusé la demande (${raison}).`)
  }
}

/**
 * Recherche web : boucle tant que l'API met le tour en pause (pause_turn,
 * limite d'itérations côté serveur), puis renvoie le texte final.
 */
export async function rechercher(client, nom, invite) {
  const usage = usageVide()
  const messages = [{ role: 'user', content: invite }]
  for (let reprise = 0; ; reprise++) {
    const reponse = await client.beta.messages.create({
      ...parametres(nom, 'high'),
      max_tokens: 32000,
      tools: [
        {
          type: 'web_search_20260209',
          name: 'web_search',
          max_uses: 20,
          user_location: {
            type: 'approximate',
            city: 'Mont-Tremblant',
            region: 'Quebec',
            country: 'CA',
            timezone: 'America/Toronto',
          },
        },
        { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 10 },
      ],
      messages,
    })
    cumuler(usage, reponse.usage)
    verifierFin(reponse)
    if (reponse.stop_reason === 'pause_turn' && reprise < MAX_REPRISES) {
      // L'API reprend d'elle-même là où elle s'est arrêtée (pas de « continue »).
      messages.push({ role: 'assistant', content: reponse.content })
      continue
    }
    return { texte: texteFinal(reponse.content), usage, fin: reponse.stop_reason }
  }
}

/** Synthèse de la mémoire : texte simple, sans outil. */
export async function synthetiser(client, nom, invite) {
  const reponse = await client.beta.messages.create({
    ...parametres(nom, 'medium'),
    max_tokens: 8000,
    messages: [{ role: 'user', content: invite }],
  })
  verifierFin(reponse)
  const texte = reponse.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
  if (!texte) throw new Error('Synthèse de la mémoire vide.')
  return texte
}

const nombreOuNull = { anyOf: [{ type: 'number' }, { type: 'null' }] }
const texteOuNull = { anyOf: [{ type: 'string' }, { type: 'null' }] }
const SCHEMA_PROGRAMMES = {
  type: 'object',
  additionalProperties: false,
  required: ['programmes'],
  properties: {
    programmes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'program_name', 'organisme', 'description', 'source_url', 'grant_type', 'potential_amount_min',
          'potential_amount_max', 'open_date', 'deadline_date', 'relevance_justification', 'program_key',
        ],
        properties: {
          program_name: { type: 'string' },
          organisme: texteOuNull,
          description: texteOuNull,
          source_url: texteOuNull,
          grant_type: { type: 'string', enum: TYPES },
          potential_amount_min: nombreOuNull,
          potential_amount_max: nombreOuNull,
          open_date: texteOuNull,
          deadline_date: texteOuNull,
          relevance_justification: texteOuNull,
          program_key: texteOuNull,
        },
      },
    },
  },
}

/**
 * Rattrapage d'une réponse qui n'était pas un tableau JSON lisible :
 * Claude la remet au format, sorties structurées (JSON garanti).
 */
export async function reparer(client, nom, texte) {
  const { output_config, ...reste } = parametres(nom, 'low')
  const reponse = await client.beta.messages.create({
    ...reste,
    output_config: { ...output_config, format: { type: 'json_schema', schema: SCHEMA_PROGRAMMES } },
    max_tokens: 16000,
    messages: [{ role: 'user', content: invitationReparation(texte.slice(0, 150000)) }],
  })
  verifierFin(reponse)
  const json = reponse.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
  return JSON.parse(json).programmes
}
