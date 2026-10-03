// Courriel de rappel du lundi : contenu (fonctions pures) et envoi par
// l'API Gmail. Simple rappel, aucune validation depuis le courriel.
//
// Secrets Cloudflare : GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET,
// GMAIL_REFRESH_TOKEN (client OAuth « interne » du Google Workspace, portée
// gmail.send) et GMAIL_EXPEDITEUR (adresse du compte autorisé).

import { libelleAnneeFiscale } from './invites.js'

export const gmailConfigure = (env) =>
  !!(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN && env.GMAIL_EXPEDITEUR)

const LIBELLES_TYPES = {
  salarial: 'Salariale',
  immobilisation: 'Immobilisation',
  formation: 'Formation',
  rd: 'R-D',
  exportation: 'Exportation',
  marketing: 'Marketing',
  autre: 'Autre',
}

const argent = (n) =>
  new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n)

const dateCourte = (iso) =>
  new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${iso}T12:00:00Z`),
  )

function montants(g) {
  const { potential_amount_min: min, potential_amount_max: max } = g
  if (min != null && max != null && min !== max) return `${argent(min)} à ${argent(max)}`
  if (max != null) return `jusqu'à ${argent(max)}`
  if (min != null) return `à partir de ${argent(min)}`
  return null
}

/** Les plus prometteuses : salariales d'abord, puis échéance proche, puis montant. */
export function trierPrometteuses(subventions) {
  const echeance = (g) => g.deadline_date ?? '9999-12-31'
  return [...subventions].sort(
    (a, b) =>
      Number(b.grant_type === 'salarial') - Number(a.grant_type === 'salarial') ||
      echeance(a).localeCompare(echeance(b)) ||
      (b.potential_amount_max ?? 0) - (a.potential_amount_max ?? 0),
  )
}

const echapper = (t) =>
  String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/**
 * @param {{ entreprises: {id: string, name: string}[], nouvelles: object[],
 *           erreurs: {company_id: string, error: string}[], lien: string, essai?: boolean }} p
 */
export function construireRappel({ entreprises, nouvelles, erreurs, lien, essai = false }) {
  const total = nouvelles.length
  const sujet =
    (essai ? '[Essai] ' : '') +
    (total === 0
      ? 'Vigie de subventions : rien de nouveau cette semaine'
      : `Vigie de subventions : ${total} nouvelle${total > 1 ? 's' : ''} subvention${total > 1 ? 's' : ''} à valider`)
  const nom = new Map(entreprises.map((e) => [e.id, e.name]))
  const parEntreprise = entreprises.map((e) => ({
    nom: e.name,
    n: nouvelles.filter((g) => g.target_company_id === e.id).length,
    erreur: erreurs.find((r) => r.company_id === e.id)?.error ?? null,
  }))
  const meilleures = trierPrometteuses(nouvelles).slice(0, 5)
  const ligneSubvention = (g) =>
    [
      `[${LIBELLES_TYPES[g.grant_type] ?? g.grant_type}] ${g.program_name}`,
      nom.get(g.target_company_id),
      montants(g),
      g.deadline_date ? `date limite le ${dateCourte(g.deadline_date)}` : null,
    ]
      .filter(Boolean)
      .join(' — ')

  const texte = [
    total === 0
      ? 'La recherche de cette semaine n’a trouvé aucune nouvelle subvention.'
      : `La recherche de cette semaine a trouvé ${total} nouvelle${total > 1 ? 's' : ''} subvention${total > 1 ? 's' : ''}.`,
    '',
    ...parEntreprise.map(
      (e) => `• ${e.nom} : ${e.n}${e.erreur ? ` (la recherche a échoué : ${e.erreur.slice(0, 200)})` : ''}`,
    ),
    ...(meilleures.length ? ['', 'Les plus prometteuses :', ...meilleures.map((g) => `• ${ligneSubvention(g)}`)] : []),
    '',
    `Valider ou rejeter dans l'app : ${lien}`,
    '',
    `Année fiscale ${libelleAnneeFiscale(anneeFiscaleCourante())}. Courriel envoyé automatiquement chaque lundi.`,
  ].join('\n')

  const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.5;color:#1f1e1a;max-width:640px">
<p>${
    total === 0
      ? 'La recherche de cette semaine n’a trouvé <b>aucune nouvelle subvention</b>.'
      : `La recherche de cette semaine a trouvé <b>${total} nouvelle${total > 1 ? 's' : ''} subvention${total > 1 ? 's' : ''}</b>.`
  }</p>
<ul style="padding-left:20px">${parEntreprise
    .map(
      (e) =>
        `<li>${echapper(e.nom)} : <b>${e.n}</b>${
          e.erreur ? ` <span style="color:#b91c1c">(la recherche a échoué : ${echapper(e.erreur.slice(0, 200))})</span>` : ''
        }</li>`,
    )
    .join('')}</ul>
${
  meilleures.length
    ? `<p style="margin-bottom:4px"><b>Les plus prometteuses</b></p><ul style="padding-left:20px;margin-top:4px">${meilleures
        .map((g) => `<li>${echapper(ligneSubvention(g))}</li>`)
        .join('')}</ul>`
    : ''
}
<p><a href="${echapper(lien)}" style="display:inline-block;background:#0f5132;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-weight:600">Ouvrir la vue de validation</a></p>
<p style="color:#7a766b;font-size:13px">Année fiscale ${libelleAnneeFiscale(anneeFiscaleCourante())}. Courriel envoyé automatiquement chaque lundi par la Vigie de subventions.</p>
</div>`

  return { sujet, texte, html }
}

export function anneeFiscaleCourante(maintenant = new Date()) {
  return maintenant.getUTCMonth() >= 9 ? maintenant.getUTCFullYear() + 1 : maintenant.getUTCFullYear()
}

function base64(octets) {
  let binaire = ''
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000))
  return btoa(binaire)
}
const base64Texte = (t) => base64(new TextEncoder().encode(t))
const base64Url = (t) => base64Texte(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const enteteUtf8 = (t) => `=?UTF-8?B?${base64Texte(t)}?=`
const lignes76 = (b) => b.replace(/.{1,76}/g, '$&\r\n')

/** Message MIME (texte + HTML) encodé pour le champ « raw » de Gmail. */
export function messageMime({ de, a, sujet, texte, html }) {
  const frontiere = `vigie-${crypto.randomUUID()}`
  const mime = [
    `From: ${enteteUtf8('Vigie de subventions')} <${de}>`,
    `To: ${a.join(', ')}`,
    `Subject: ${enteteUtf8(sujet)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${frontiere}"`,
    '',
    `--${frontiere}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    lignes76(base64Texte(texte)),
    `--${frontiere}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    lignes76(base64Texte(html)),
    `--${frontiere}--`,
    '',
  ].join('\r\n')
  return base64Url(mime)
}

/** Envoie par l'API Gmail (jeton d'accès obtenu avec le jeton d'actualisation). */
export async function envoyerGmail(env, { a, sujet, texte, html }) {
  if (!gmailConfigure(env)) throw new Error('Gmail n’est pas configuré (secrets GMAIL_* manquants).')
  if (!a.length) throw new Error('Aucun destinataire.')
  const jeton = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })
  if (!jeton.ok) throw new Error(`Google a refusé le jeton (${jeton.status}) : ${(await jeton.text()).slice(0, 300)}`)
  const { access_token } = await jeton.json()
  const envoi = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: messageMime({ de: env.GMAIL_EXPEDITEUR, a, sujet, texte, html }) }),
  })
  if (!envoi.ok) throw new Error(`Gmail a refusé l'envoi (${envoi.status}) : ${(await envoi.text()).slice(0, 300)}`)
}
