import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { avisChangement, avisDemande, envoyerAvis } from './avis.js'

const ENV = { SUPABASE_URL: 'https://base.test', SUPABASE_SECRET_KEY: 'sb_secret_x', APP_URL: 'https://admin.test/', COURRIELS_MAILPIT: 'http://mailpit.test' }
const R = { id: 'r9', numero: '27-G-601', nom: 'École des Pins', forfait: 'classe_nature', date_arrivee: '2027-05-12', date_depart: '2027-05-14', nb_participants: 45, nb_accompagnateurs: 4 }
const DEMANDE = {
  id: 'd9',
  langue: 'fr',
  par_lien: false,
  reponses: { resp_prenom: 'Leïla', resp_nom: 'Tremblay', resp_courriel: 'leila@ecole.ca', resp_telephone: '819-555-1234', commentaires: 'Nous revenons !' },
  r: R,
}
const CHANGEMENT = { id: 'k9', nom: 'Leïla Tremblay', message: 'Deux élèves de plus', texte: 'Élèves : 45 → 47 ; Arrivée : 2027-05-12 → 2027-05-13', r: R }

const fetchOriginal = globalThis.fetch
afterEach(() => {
  globalThis.fetch = fetchOriginal
})

test('avis : nouvelle demande et changement, courts, avec le lien de la fiche', () => {
  const d = avisDemande(ENV, DEMANDE)
  assert.equal(d.sujet, 'Nouvelle demande · 27-G-601 · École des Pins')
  assert.match(d.texte, /Forfait : Classe nature\nDates : du 12 au 14 mai 2027\nParticipants : 45 \+ 4 accompagnateurs\nResponsable : Leïla Tremblay · leila@ecole\.ca · 819-555-1234/)
  assert.match(d.texte, /Fiche : https:\/\/admin\.test\/reservations\/r\/r9$/)
  const c = avisChangement(ENV, CHANGEMENT)
  assert.equal(c.sujet, 'Changement demandé · 27-G-601 · École des Pins')
  assert.match(c.texte, /Changement demandé :\n {2}· Élèves : 45 → 47\n {2}· Arrivée : 2027-05-12 → 2027-05-13\nMessage du client : « Deux élèves de plus »/)
  assert.match(c.texte, /https:\/\/admin\.test\/reservations\/r\/r9$/)
})

test('avis : envoyés à inscriptions@, hors du fil ; envoi raté = rendu pour le passage suivant ; rien sans transport', async () => {
  const appels = []
  let panne = false
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url)
    appels.push({ u, corps: init.body ? JSON.parse(init.body) : null })
    if (u.endsWith('/rpc/avis_prendre')) return Response.json({ demandes: [DEMANDE], changements: [CHANGEMENT] })
    if (u.endsWith('/rpc/avis_rendre')) return new Response(null, { status: 204 })
    if (u === 'http://mailpit.test/api/v1/send') return panne ? new Response('panne', { status: 500 }) : Response.json({ ID: 'a1' })
    if (u.startsWith('http://mailpit.test/api/v1/message/')) return Response.json({ 'Message-Id': ['<a1@mailpit>'] })
    throw new Error(`Appel inattendu : ${u}`)
  }
  assert.deepEqual(await envoyerAvis(ENV), { envoyes: 2, erreurs: 0 })
  const envois = appels.filter((a) => a.u.endsWith('/api/v1/send')).map((a) => a.corps)
  assert.deepEqual(
    envois.map((e) => [e.To[0].Email, e.Subject, e.Headers]),
    [
      ['inscriptions@camptremblant.com', 'Nouvelle demande · 27-G-601 · École des Pins', undefined],
      ['inscriptions@camptremblant.com', 'Changement demandé · 27-G-601 · École des Pins', undefined],
    ],
  )
  panne = true
  appels.length = 0
  assert.deepEqual(await envoyerAvis(ENV), { envoyes: 0, erreurs: 2 })
  assert.deepEqual(
    appels.filter((a) => a.u.endsWith('/rpc/avis_rendre')).map((a) => a.corps),
    [
      { p_demande: 'd9', p_changement: null },
      { p_demande: null, p_changement: 'k9' },
    ],
  )
  appels.length = 0
  assert.deepEqual(await envoyerAvis({ ...ENV, COURRIELS_MAILPIT: '', SUPABASE_URL: 'http://127.0.0.1:54321' }), { envoyes: 0, erreurs: 0 })
  assert.equal(appels.length, 0)
})
