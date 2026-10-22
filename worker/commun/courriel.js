// Envoi d'un courriel par le Worker : message MIME (texte, HTML, pièces
// jointes, « Répondre à »), puis Mailpit (DEV) ou l'API Gmail d'une boîte
// autorisée par un jeton d'actualisation (PROD). Commun aux Réservations
// (inscriptions@) et au RH (une boîte par compagnie).
//
// Client OAuth Google : GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET (celui de la Vigie).

function base64(octets) {
  let binaire = ''
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000))
  return btoa(binaire)
}
export const base64Texte = (t) => base64(new TextEncoder().encode(t))
const enteteUtf8 = (t) => `=?UTF-8?B?${base64Texte(t)}?=`
const lignes76 = (b) => b.replace(/.{1,76}/g, '$&\r\n')

/** En-têtes de fil (In-Reply-To, References) : sans saut de ligne, jamais vides. */
const entetesPropres = (enTetes) =>
  Object.entries(enTetes ?? {})
    .map(([nom, valeur]) => [nom, String(valeur ?? '').replace(/[\r\n]+/g, ' ').trim()])
    .filter(([nom, valeur]) => /^[A-Za-z-]+$/.test(nom) && valeur)

/**
 * Message MIME (texte + HTML + pièces jointes), encodé pour le champ « raw »
 * de Gmail. m : { de, nomDe, a[], cc[], repondreA?, sujet, texte, html, pieces[],
 * enTetes? } (pièce : { nom, type, octets: Uint8Array } ; enTetes : ex.
 * { 'In-Reply-To': '<…>', References: '<…> <…>' } pour garder un fil).
 */
export function messageMime({ de, nomDe, a, cc = [], repondreA = null, sujet, texte, html, pieces = [], enTetes = null }) {
  const mixte = `camp-${crypto.randomUUID()}`
  const alt = `camp-alt-${crypto.randomUUID()}`
  const lignes = [
    `From: ${nomDe ? `${enteteUtf8(nomDe)} ` : ''}<${de}>`,
    `To: ${a.join(', ')}`,
    ...(cc.length ? [`Cc: ${cc.join(', ')}`] : []),
    ...(repondreA ? [`Reply-To: ${repondreA}`] : []),
    `Subject: ${enteteUtf8(sujet)}`,
    ...entetesPropres(enTetes).map(([nom, valeur]) => `${nom}: ${valeur}`),
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixte}"`,
    '',
    `--${mixte}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    '',
    `--${alt}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    lignes76(base64Texte(texte)),
    `--${alt}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    lignes76(base64Texte(html)),
    `--${alt}--`,
  ]
  for (const p of pieces) {
    lignes.push(
      `--${mixte}`,
      `Content-Type: ${p.type}; name="${enteteUtf8(p.nom)}"`,
      `Content-Disposition: attachment; filename="${enteteUtf8(p.nom)}"`,
      'Content-Transfer-Encoding: base64',
      '',
      lignes76(base64(p.octets)),
    )
  }
  lignes.push(`--${mixte}--`, '')
  return base64Texte(lignes.join('\r\n')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** DEV : Mailpit (http://localhost:54324), par son API d'envoi. Rend l'identifiant du message. */
export async function envoyerMailpit(env, m) {
  const res = await fetch(`${env.COURRIELS_MAILPIT.replace(/\/$/, '')}/api/v1/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      From: { Email: m.de, Name: m.nomDe },
      To: m.a.map((Email) => ({ Email })),
      Cc: (m.cc ?? []).map((Email) => ({ Email })),
      ...(m.repondreA ? { ReplyTo: [{ Email: m.repondreA }] } : {}),
      Subject: m.sujet,
      Text: m.texte,
      HTML: m.html,
      Attachments: (m.pieces ?? []).map((p) => ({ Filename: p.nom, ContentType: p.type, Content: base64(p.octets) })),
    }),
  })
  if (!res.ok) throw new Error(`Mailpit a refusé l'envoi (${res.status}) : ${(await res.text()).slice(0, 300)}`)
  return (await res.json()).ID ?? null
}

/** Jeton d'accès Gmail d'une boîte, d'après son jeton d'actualisation. */
export async function jetonAccesGmail(env, jetonActualisation) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: jetonActualisation,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    const corps = await res.text()
    const e = new Error(`Google a refusé le jeton (${res.status}) : ${corps.slice(0, 300)}`)
    e.code = /invalid_grant/.test(corps) ? 'reconnecter' : 'google'
    throw e
  }
  return (await res.json()).access_token
}

/** PROD : API Gmail de la boîte qui a donné le jeton d'actualisation. Rend l'identifiant du message. */
export async function envoyerGmail(env, m, jetonActualisation) {
  const acces = await jetonAccesGmail(env, jetonActualisation)
  const envoi = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${acces}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: messageMime(m) }),
  })
  if (!envoi.ok) throw new Error(`Gmail a refusé l'envoi (${envoi.status}) : ${(await envoi.text()).slice(0, 300)}`)
  return (await envoi.json()).id ?? null
}

// ------------------------------------------------------------------
// Envoi dans un fil (Réservations : un seul fil Gmail par réservation)
// ------------------------------------------------------------------
// Documentation de l'API Gmail (guide « Manage threads » et référence
// users.messages) : pour qu'un message s'ajoute à un fil, il faut 1) le
// `threadId` du fil dans la ressource envoyée, 2) les en-têtes References et
// In-Reply-To conformes à la RFC 2822, 3) le même Subject. messages.send rend
// la ressource Message (`id`, `threadId`) ; l'en-tête Message-ID réel se relit
// par messages.get?format=metadata&metadataHeaders=Message-ID (payload.headers),
// ce qui demande la portée gmail.metadata (ou plus) en plus de gmail.send.
// Rendu : { id, threadId, messageId } (messageId = « <…> », null s'il n'a
// pas pu être relu : le courriel est quand même parti).

const enTeteDe = (liste, nom) => liste?.find((h) => String(h.name).toLowerCase() === nom.toLowerCase())?.value ?? null

/** DEV : Mailpit, avec les en-têtes du fil ; Message-ID relu dans Mailpit. */
export async function envoyerMailpitFil(env, m) {
  const racine = env.COURRIELS_MAILPIT.replace(/\/$/, '')
  const enTetes = Object.fromEntries(entetesPropres(m.enTetes))
  const res = await fetch(`${racine}/api/v1/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      From: { Email: m.de, Name: m.nomDe },
      To: m.a.map((Email) => ({ Email })),
      Cc: (m.cc ?? []).map((Email) => ({ Email })),
      ...(m.repondreA ? { ReplyTo: [{ Email: m.repondreA }] } : {}),
      Subject: m.sujet,
      Text: m.texte,
      HTML: m.html,
      Attachments: (m.pieces ?? []).map((p) => ({ Filename: p.nom, ContentType: p.type, Content: base64(p.octets) })),
      ...(Object.keys(enTetes).length ? { Headers: enTetes } : {}),
    }),
  })
  if (!res.ok) throw new Error(`Mailpit a refusé l'envoi (${res.status}) : ${(await res.text()).slice(0, 300)}`)
  const id = (await res.json()).ID ?? null
  let messageId = null
  try {
    const lu = await fetch(`${racine}/api/v1/message/${encodeURIComponent(id)}/headers`)
    if (lu.ok) {
      const h = await lu.json()
      const cle = Object.keys(h).find((k) => k.toLowerCase() === 'message-id')
      messageId = cle ? (h[cle]?.[0] ?? null) : null
    }
  } catch {
    // Message-ID illisible : le fil continuera sans In-Reply-To.
  }
  return { id, threadId: null, messageId }
}

/** PROD : API Gmail, dans le fil `m.threadId` s'il y en a un ; Message-ID relu après l'envoi. */
export async function envoyerGmailFil(env, m, jetonActualisation) {
  const acces = await jetonAccesGmail(env, jetonActualisation)
  const raw = messageMime(m)
  const envoyer = (threadId) =>
    fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${acces}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }),
    })
  let envoi = await envoyer(m.threadId)
  // Fil introuvable (retiré de la boîte inscriptions@) : rien n'est parti ;
  // on envoie sans threadId (mêmes en-têtes, même sujet), un nouveau fil commence.
  if (!envoi.ok && m.threadId && (envoi.status === 400 || envoi.status === 404)) envoi = await envoyer(null)
  if (!envoi.ok) throw new Error(`Gmail a refusé l'envoi (${envoi.status}) : ${(await envoi.text()).slice(0, 300)}`)
  const { id, threadId } = await envoi.json()
  let messageId = null
  try {
    const lu = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Message-ID`, {
      headers: { Authorization: `Bearer ${acces}` },
    })
    if (lu.ok) messageId = enTeteDe((await lu.json()).payload?.headers, 'Message-ID')
    else console.error(`Message-ID du courriel ${id} illisible (${lu.status}) : portée gmail.metadata accordée ?`)
  } catch (e) {
    console.error('Message-ID illisible :', e)
  }
  return { id: id ?? null, threadId: threadId ?? null, messageId }
}
