// Rapport de recherche (courriel simple et digeste, sans validation depuis
// le courriel) et envoi par l'API Gmail.
//
// Mêmes secrets que la Vigie de subventions (client OAuth « interne » du
// Google Workspace, portée gmail.send), définis comme secrets Supabase :
// GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_EXPEDITEUR.

const env = (n: string) => Deno.env.get(n) ?? ''

export const gmailConfigure = () =>
  !!(env('GMAIL_CLIENT_ID') && env('GMAIL_CLIENT_SECRET') && env('GMAIL_REFRESH_TOKEN') && env('GMAIL_EXPEDITEUR'))

const echapper = (t: unknown) =>
  String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

export interface ChangementRapport {
  type: 'prix' | 'nouveau_programme' | 'nouvelle_activite'
  camp: string
  ancienne_valeur: string | null
  nouvelle_valeur: string | null
  variation: number | null
}

export interface DonneesRapport {
  type: 'mensuelle' | 'decouverte' | 'documentation'
  debut: Date
  campsVerifies: number
  erreurs: number
  changements: ChangementRapport[]
  proposes: { nom: string; ville: string | null; pertinence: string | null }[]
  lien: string
}

const pourcentage = (v: number) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(1).replace('.', ',')} %`

export function construireRapport(d: DonneesRapport) {
  const mois = `${MOIS[d.debut.getMonth()]} ${d.debut.getFullYear()}`
  const prix = d.changements.filter((c) => c.type === 'prix')
  const programmes = d.changements.filter((c) => c.type === 'nouveau_programme')
  const activites = d.changements.filter((c) => c.type === 'nouvelle_activite')
  const lienValidation = `${d.lien.replace(/\/$/, '')}/a-valider`

  let sujet: string
  if (d.type === 'decouverte') {
    sujet = `Vigie des camps — découverte : ${d.proposes.length} camp${d.proposes.length > 1 ? 's' : ''} proposé${d.proposes.length > 1 ? 's' : ''}`
  } else {
    sujet = `Vigie des camps — ${mois} : ${
      prix.length ? `${prix.length} changement${prix.length > 1 ? 's' : ''} de prix` : 'aucun changement de prix'
    }`
  }

  const texte: string[] = []
  const html: string[] = []
  const p = (t: string) => html.push(`<p>${t}</p>`)

  if (d.type !== 'decouverte') {
    // Section d'alerte en haut : les changements de prix.
    if (prix.length) {
      texte.push(`⚠ CHANGEMENTS DE PRIX (${prix.length})`)
      html.push(
        `<div style="border:1px solid #f59e0b;background:#fffbeb;border-radius:10px;padding:12px 16px;margin-bottom:16px">
<p style="margin:0 0 6px;font-weight:700;color:#92400e">⚠ ${prix.length} changement${prix.length > 1 ? 's' : ''} de prix</p>
<ul style="margin:0;padding-left:20px">`,
      )
      for (const c of prix) {
        const v = c.variation != null ? ` (${pourcentage(c.variation)})` : ''
        texte.push(`• ${c.camp} — ${c.ancienne_valeur ?? '?'} → ${c.nouvelle_valeur ?? '?'}${v}`)
        html.push(
          `<li><b>${echapper(c.camp)}</b> — ${echapper(c.ancienne_valeur ?? '?')} → <b>${echapper(c.nouvelle_valeur ?? '?')}</b>${echapper(v)}</li>`,
        )
      }
      html.push('</ul></div>')
      texte.push('')
    } else {
      p('Aucun changement de prix détecté ce mois-ci.')
      texte.push('Aucun changement de prix détecté ce mois-ci.', '')
    }

    const resume = `${d.campsVerifies} camp${d.campsVerifies > 1 ? 's' : ''} vérifié${d.campsVerifies > 1 ? 's' : ''} · ${programmes.length} nouveau${programmes.length > 1 ? 'x' : ''} programme${programmes.length > 1 ? 's' : ''} · ${activites.length} nouvelle${activites.length > 1 ? 's' : ''} activité${activites.length > 1 ? 's' : ''}${d.erreurs ? ` · ${d.erreurs} recherche${d.erreurs > 1 ? 's' : ''} en erreur` : ''}`
    p(resume)
    texte.push(resume)

    const liste = (titre: string, items: ChangementRapport[]) => {
      if (!items.length) return
      const montres = items.slice(0, 12)
      const reste = items.length - montres.length
      texte.push('', `${titre} :`, ...montres.map((c) => `• ${c.camp} — ${c.nouvelle_valeur ?? ''}`))
      if (reste > 0) texte.push(`… et ${reste} autre${reste > 1 ? 's' : ''}`)
      html.push(
        `<p style="margin-bottom:4px"><b>${titre}</b></p><ul style="margin-top:4px;padding-left:20px">${montres
          .map((c) => `<li>${echapper(c.camp)} — ${echapper(c.nouvelle_valeur ?? '')}</li>`)
          .join('')}${reste > 0 ? `<li>… et ${reste} autre${reste > 1 ? 's' : ''}</li>` : ''}</ul>`,
      )
    }
    liste('Nouveaux programmes', programmes)
    liste('Nouvelles activités', activites)
  }

  if (d.proposes.length) {
    texte.push('', `Camps proposés (${d.proposes.length}) :`, ...d.proposes.map((c) => `• ${c.nom}${c.ville ? `, ${c.ville}` : ''} — ${c.pertinence ?? ''}`))
    html.push(
      `<p style="margin-bottom:4px"><b>Camps proposés (${d.proposes.length})</b> — inclure ou exclure dans l'app</p><ul style="margin-top:4px;padding-left:20px">${d.proposes
        .map((c) => `<li><b>${echapper(c.nom)}</b>${c.ville ? `, ${echapper(c.ville)}` : ''} — ${echapper(c.pertinence ?? '')}</li>`)
        .join('')}</ul>`,
    )
  } else if (d.type === 'decouverte') {
    p('Aucun nouveau camp trouvé.')
    texte.push('Aucun nouveau camp trouvé.')
  }

  texte.push('', `Valider dans l'app : ${lienValidation}`)
  const corps = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.5;color:#1f1e1a;max-width:640px">
${html.join('\n')}
<p><a href="${echapper(lienValidation)}" style="display:inline-block;background:#0f5132;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-weight:600">Valider dans l'app</a></p>
<p style="color:#7a766b;font-size:13px">Courriel envoyé automatiquement par la Vigie des camps compétiteurs. La validation se fait dans l'app seulement.</p>
</div>`
  return { sujet, texte: texte.join('\n'), html: corps }
}

// ------------------------------------------------------------------ Gmail
function base64(octets: Uint8Array) {
  let binaire = ''
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000))
  return btoa(binaire)
}
const base64Texte = (t: string) => base64(new TextEncoder().encode(t))
const base64Url = (t: string) => base64Texte(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const enteteUtf8 = (t: string) => `=?UTF-8?B?${base64Texte(t)}?=`
const lignes76 = (b: string) => b.replace(/.{1,76}/g, '$&\r\n')

function messageMime({ de, a, sujet, texte, html }: { de: string; a: string[]; sujet: string; texte: string; html: string }) {
  const frontiere = `vigie-${crypto.randomUUID()}`
  return base64Url(
    [
      `From: ${enteteUtf8('Vigie des camps')} <${de}>`,
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
    ].join('\r\n'),
  )
}

export async function envoyerGmail({ a, sujet, texte, html }: { a: string[]; sujet: string; texte: string; html: string }) {
  if (!gmailConfigure()) throw new Error('Gmail n’est pas configuré (secrets GMAIL_* manquants).')
  if (!a.length) throw new Error('Aucun destinataire.')
  const jeton = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GMAIL_CLIENT_ID'),
      client_secret: env('GMAIL_CLIENT_SECRET'),
      refresh_token: env('GMAIL_REFRESH_TOKEN'),
      grant_type: 'refresh_token',
    }),
  })
  if (!jeton.ok) throw new Error(`Google a refusé le jeton (${jeton.status}) : ${(await jeton.text()).slice(0, 300)}`)
  const { access_token } = await jeton.json()
  const envoi = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: messageMime({ de: env('GMAIL_EXPEDITEUR'), a, sujet, texte, html }) }),
  })
  if (!envoi.ok) throw new Error(`Gmail a refusé l'envoi (${envoi.status}) : ${(await envoi.text()).slice(0, 300)}`)
}
