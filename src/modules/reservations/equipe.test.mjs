// Portail côté équipe (réunion du 2026-10-21) : décision ligne par ligne,
// séjour changé depuis l'estimé accepté, actions à prendre.
// node --test src/modules/reservations/equipe.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { actionsDe, nombreAAgir } from './actions.ts'
import { differences, evaluer, evaluerChamp, partager, reponseDecision } from './confirmation.ts'
import { changementsSejour, ecartEstime, lignesDecalees, resumeEcart } from './ecartEstime.ts'

const infos = (x = {}) => ({
  date_arrivee: '2027-05-19',
  date_depart: '2027-05-21',
  heure_arrivee: '10:00',
  heure_depart: '14:00',
  nb_participants: 40,
  nb_accompagnateurs: 4,
  ages: '5e année',
  langue: 'Français',
  ratio: '1:15',
  service_repas: true,
  nb_dejeuners: 2,
  nb_diners: 3,
  nb_soupers: 2,
  ...x,
})

test('verdict par ligne : chaque champ jugé seul, mêmes règles que le verdict global', () => {
  const actuel = infos()
  // 40 → 48 (+20 %) et une heure d'arrivée, 60 jours avant : le nombre est hors règle, l'heure non.
  const propose = infos({ nb_participants: 48, heure_arrivee: '11:00' })
  const jour = '2027-03-20'
  assert.equal(evaluer('classe_nature', actuel, propose, jour).dansRegles, false)
  assert.equal(evaluerChamp('classe_nature', actuel, propose, jour, 'nb_participants').dansRegles, false)
  assert.equal(evaluerChamp('classe_nature', actuel, propose, jour, 'heure_arrivee').dansRegles, true)
  // Dates : toujours à évaluer ; âges et langue : jamais hors règle, même tard.
  const tard = infos({ date_depart: '2027-05-22', ages: '6e année' })
  assert.deepEqual(evaluerChamp('classe_nature', actuel, tard, '2027-05-15', 'date_depart').raisons.map((r) => r.code), ['dates', 'delai'])
  assert.equal(evaluerChamp('classe_nature', actuel, tard, '2027-05-15', 'ages').dansRegles, true)
})

test('réponse au client : accepté en partie = ce qui l’est et ce qui ne l’est pas, puis le message', () => {
  const actuel = infos()
  const propose = infos({ nb_participants: 42, date_depart: '2027-05-22' })
  const diffs = differences(actuel, propose, 'classe_nature')
  const decisions = { nb_participants: true, date_depart: false }
  assert.deepEqual(
    Object.values(partager(diffs, decisions)).map((l) => l.map((d) => d.champ)),
    [['nb_participants'], ['date_depart']],
  )
  assert.equal(
    reponseDecision(diffs, decisions, 'classe_nature', '  Pas de place le 22.  '),
    'Accepté : Élèves : 40 → 42.\nPas accepté : Départ : 21 mai 2027 → 22 mai 2027.\n\nPas de place le 22.',
  )
  assert.equal(
    reponseDecision(diffs, decisions, 'classe_nature', 'No room.', 'en'),
    // resumeChangement garde « : » en anglais aussi (comme sur la page client).
    'Accepted: Students : 40 → 42.\nNot accepted: Departure : May 21, 2027 → May 22, 2027.\n\nNo room.',
  )
  // Tout accepté ou tout refusé : la page le dit déjà, seulement le message.
  assert.equal(reponseDecision(diffs, { nb_participants: true, date_depart: true }, 'classe_nature', ''), '')
  assert.equal(reponseDecision(diffs, { nb_participants: false, date_depart: false }, 'classe_nature', 'Complet.'), 'Complet.')
})

const sejour = (x = {}) => ({ ...infos(), forfait: 'classe_nature', variante: 'verte', etages: ['CH'], salles: [], heures_extra: 0, heures_supplementaires: 0, ...x })
const resa = (x = {}) => ({ ...sejour(), heure_arrivee: '10:00:00', heure_depart: '14:00:00', ...x })

test('séjour changé depuis l’estimé : seulement ce qui fait le prix, en mots', () => {
  assert.deepEqual(changementsSejour(sejour(), resa()), [])
  // Les âges et la langue ne demandent pas de nouvel estimé.
  assert.deepEqual(changementsSejour(sejour(), resa({ ages: '6e', langue: 'Anglais' })), [])
  const c = changementsSejour(sejour(), resa({ nb_participants: 42, heures_extra: 1.5 }))
  assert.deepEqual(
    c.map((x) => [x.champ, x.avant, x.apres]),
    [
      ['nb_participants', '40', '42'],
      ['heures_extra', '0', '1.5'],
    ],
  )
  const e = ecartEstime({ importe: false, sejour: sejour() }, resa({ nb_participants: 42 }), null, [])
  assert.equal(resumeEcart(e), 'Élèves : 40 → 42')
  // Estimé importé du Sheets : rien à comparer.
  assert.equal(ecartEstime({ importe: true, sejour: null }, resa({ nb_participants: 42 }), [], []), null)
})

test('estimé figé avant le séjour gardé : comparaison des lignes calculées (sans les prix)', () => {
  const ligne = (description, quantite, prix_unitaire = 100, auto = true) => ({ description, quantite, prix_unitaire, auto })
  const estime = [ligne('Forfait Classe nature', 40), ligne('Gratuité', 2), ligne('Rabais', 1, -50, false)]
  // Un prix validé depuis ne change rien ; un nombre, oui.
  assert.equal(ecartEstime({ importe: false, sejour: null }, resa(), estime, [ligne('Forfait Classe nature', 40, 120), ligne('Gratuité', 2)]), null)
  const e = ecartEstime({ importe: false, sejour: null }, resa(), estime, [ligne('Forfait Classe nature', 42), ligne('Gratuité', 2)])
  assert.deepEqual(e.lignes, ['Forfait Classe nature : 40 → 42'])
  // Avec les prix : même règle que l'éditeur de l'estimé (Estime.tsx, « Recalculer »).
  assert.equal(lignesDecalees([ligne('A', 1)], [ligne('A', 1, 101)], { prix: true }).length, 1)
  assert.deepEqual(lignesDecalees([ligne('A', 1)], [ligne('A', 1), ligne('B', 2)]), ['Nouvelle ligne : B (2)'])
})

test('actions à prendre : point rouge, compte de l’onglet', () => {
  const s = { changements: new Set(['b']), sansPaiement: new Set(['c']) }
  const r = (id, x = {}) => ({ id, etape: 'confirmee', fermeture: null, organisation_id: 'o', origine: 'app', ...x })
  assert.deepEqual(actionsDe(r('a', { etape: 'nouvelle', organisation_id: null, origine: 'formulaire' }), s).map((a) => a.texte), ['Nouvelle demande : organisation à valider'])
  assert.deepEqual(actionsDe(r('b'), s).map((a) => [a.code, a.urgent]), [['changement', true]])
  assert.deepEqual(actionsDe(r('c'), s).map((a) => a.code), ['paiement'])
  // Changement refusé : appeler le client tant que la relance n'est pas faite.
  assert.deepEqual(actionsDe(r('f'), { ...s, appels: new Set(['f']) }).map((a) => [a.texte, a.urgent]), [['Appeler le client : changement refusé', true]])
  assert.deepEqual(actionsDe(r('d', { etape: 'estime_accepte' }), s).map((a) => a.texte), ['Estimé accepté : préparer le contrat'])
  // Fermée : plus de « nouvelle demande » ni de contrat à préparer.
  assert.deepEqual(actionsDe(r('e', { etape: 'nouvelle', fermeture: 'closed_lost' }), s), [])
  assert.equal(nombreAAgir([r('a', { etape: 'nouvelle' }), r('b'), r('x')], s), 2)
})
