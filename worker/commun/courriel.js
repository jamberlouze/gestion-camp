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

/**
 * Message MIME (texte + HTML + pièces jointes), encodé pour le champ « raw »
 * de Gmail. m : { de, nomDe, a[], cc[], repondreA?, sujet, texte, html, pieces[] }
 * (pièce : { nom, type, octets: Uint8Array }).
 */
export function messageMime({ de, nomDe, a, cc = [], repondreA = null, sujet, texte, html, pieces = [] }) {
  const mixte = `camp-${crypto.randomUUID()}`
  const alt = `camp-alt-${crypto.randomUUID()}`
  const lignes = [
    `From: ${nomDe ? `${enteteUtf8(nomDe)} ` : ''}<${de}>`,
    `To: ${a.join(', ')}`,
    ...(cc.length ? [`Cc: ${cc.join(', ')}`] : []),
    ...(repondreA ? [`Reply-To: ${repondreA}`] : []),
    `Subject: ${enteteUtf8(sujet)}`,
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
