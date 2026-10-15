// Conformité d'une embauche (src/modules/rh/conformite.ts).
// Lancer : node --test src/modules/rh/conformite.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { etatCarte, ligneVaj, pastillesConformite, periodeEmbauche, plusAns, vajAFaire } from './conformite.ts'

const AUJ = '2026-10-15'
const SAISON = { debut: '2027-05-01', fin: '2027-08-27' }

test('periodeEmbauche : dates de l’embauche, sinon de la saison, sinon aujourd’hui', () => {
  assert.deepEqual(periodeEmbauche({ debut: '2027-06-20', fin: null }, SAISON, AUJ), { debut: '2027-06-20', fin: '2027-08-27' })
  assert.deepEqual(periodeEmbauche({ debut: null, fin: null }, SAISON, AUJ), { debut: '2027-05-01', fin: '2027-08-27' })
  assert.deepEqual(periodeEmbauche({ debut: null, fin: null }, { debut: null, fin: null }, AUJ), { debut: AUJ, fin: null })
})

test('plusAns : même jour, 29 février → 28', () => {
  assert.equal(plusAns('2024-05-20', 3), '2027-05-20')
  assert.equal(plusAns('2024-02-29', 3), '2027-02-28')
})

test('vajAFaire : 18 ans au début, aucune VAJ ou VAJ échue au début', () => {
  const majeur = (vaj_le) => ({ date_naissance: '2004-09-03', vaj_le })
  assert.equal(vajAFaire(majeur(null), '2027-05-01', 3), true)
  assert.equal(vajAFaire(majeur('2025-05-20'), '2027-05-01', 3), false)
  assert.equal(vajAFaire(majeur('2024-05-01'), '2027-05-01', 3), true) // échue le jour même
  assert.equal(vajAFaire(majeur('2024-05-02'), '2027-05-01', 3), false)
  assert.equal(vajAFaire(majeur('2024-05-02'), '2027-05-01', 2), true) // réglage plus court
  // 17 ans au début : pas de VAJ ; 18 ans la veille du début : VAJ.
  assert.equal(vajAFaire({ date_naissance: '2009-05-02', vaj_le: null }, '2027-05-01', 3), false)
  assert.equal(vajAFaire({ date_naissance: '2009-04-30', vaj_le: null }, '2027-05-01', 3), true)
  // Âge inconnu : on la demande.
  assert.equal(vajAFaire({ date_naissance: null, vaj_le: null }, '2027-05-01', 3), true)
})

test('ligneVaj : AAAAMMJJ,Nom,Prénom ; rien sans date de naissance', () => {
  assert.equal(ligneVaj({ date_naissance: '2004-09-03', nom_famille: 'Pelletier', prenom: 'Thomas' }), '20040903,Pelletier,Thomas')
  assert.equal(ligneVaj({ date_naissance: null, nom_famille: 'Pelletier', prenom: 'Thomas' }), null)
})

test('etatCarte : la plus récente, expirée avant le début, expire pendant, manquante si exigée', () => {
  const ps = (expire_le) => ({ personne_id: 'p', genre: 'premiers_soins', expire_le })
  assert.equal(etatCarte([], 'premiers_soins', false, '2027-05-01', '2027-08-27'), null)
  assert.deepEqual(etatCarte([], 'premiers_soins', true, '2027-05-01', '2027-08-27'), { etat: 'manquante', expire_le: null })
  assert.deepEqual(etatCarte([ps('2027-04-30')], 'premiers_soins', false, '2027-05-01', '2027-08-27'), { etat: 'expiree', expire_le: '2027-04-30' })
  assert.deepEqual(etatCarte([ps('2027-07-01')], 'premiers_soins', false, '2027-05-01', '2027-08-27'), { etat: 'expire_pendant', expire_le: '2027-07-01' })
  assert.deepEqual(etatCarte([ps('2026-01-01'), ps('2029-03-01')], 'premiers_soins', true, '2027-05-01', '2027-08-27'), { etat: 'ok', expire_le: '2029-03-01' })
  assert.deepEqual(etatCarte([ps(null)], 'premiers_soins', true, '2027-05-01', null), { etat: 'sans_date', expire_le: null })
  assert.deepEqual(etatCarte([ps(null)], 'premiers_soins', false, '2027-05-01', null), { etat: 'ok', expire_le: null })
  // Une carte SN ne compte pas pour les premiers soins.
  assert.deepEqual(etatCarte([{ personne_id: 'p', genre: 'sauveteur', expire_le: '2030-01-01' }], 'premiers_soins', true, '2027-05-01', null), { etat: 'manquante', expire_le: null })
})

const base = {
  id: 'e1',
  genre: 'emploi',
  statut: 'complete',
  debut: null,
  fin: null,
}
const pastilles = (embauche, extra = {}) =>
  pastillesConformite({
    embauche: { ...base, ...embauche },
    personne: { date_naissance: '2004-09-03', vaj_le: '2026-05-01' },
    saison: SAISON,
    poste: { certifications: [] },
    contrats: [],
    documents: [],
    auj: AUJ,
    validiteVaj: 3,
    ...extra,
  }).map((p) => p.texte)

test('pastillesConformite : rien pour une embauche complète en règle ni pour une annulée', () => {
  assert.deepEqual(pastilles({}), [])
  assert.deepEqual(pastilles({ statut: 'annulee' }, { personne: { date_naissance: '2004-09-03', vaj_le: null } }), [])
})

test('pastillesConformite : dossier selon le statut, contrat et consentement avant la validation', () => {
  assert.deepEqual(pastilles({ statut: 'a_envoyer' }), ['Lien à envoyer', 'Contrat à préparer'])
  assert.deepEqual(pastilles({ statut: 'envoyee' }, { contrats: [{ embauche_id: 'e1', genre: 'contrat', statut: 'en_attente' }] }), ['Dossier attendu', 'Contrat à signer'])
  assert.deepEqual(pastilles({ statut: 'dossier_recu' }, { contrats: [{ embauche_id: 'e1', genre: 'contrat', statut: 'signe' }] }), ['Dossier à valider'])
  // Contrat annulé = pas de contrat ; contrat d'une autre embauche ignoré.
  assert.deepEqual(
    pastilles({ statut: 'dossier_recu' }, { contrats: [{ embauche_id: 'e1', genre: 'contrat', statut: 'annule' }, { embauche_id: 'e2', genre: 'contrat', statut: 'signe' }] }),
    ['Dossier à valider', 'Contrat à préparer'],
  )
  // Bénévole : pas de contrat.
  assert.deepEqual(pastilles({ statut: 'envoyee', genre: 'benevolat' }), ['Dossier attendu'])
  // Mineur au début : consentement (et pas de VAJ).
  assert.deepEqual(
    pastilles({ statut: 'dossier_recu' }, { personne: { date_naissance: '2010-01-01', vaj_le: null }, contrats: [{ embauche_id: 'e1', genre: 'contrat', statut: 'signe' }] }),
    ['Dossier à valider', 'Consentement parental'],
  )
  assert.deepEqual(
    pastilles(
      { statut: 'dossier_recu' },
      {
        personne: { date_naissance: '2010-01-01', vaj_le: null },
        contrats: [
          { embauche_id: 'e1', genre: 'contrat', statut: 'signe' },
          { embauche_id: 'e1', genre: 'consentement', statut: 'signe' },
        ],
      },
    ),
    ['Dossier à valider'],
  )
})

test('pastillesConformite : VAJ et cartes (manquante seulement si le poste l’exige)', () => {
  assert.deepEqual(pastilles({}, { personne: { date_naissance: '2004-09-03', vaj_le: '2023-01-01' } }), ['VAJ à faire'])
  assert.deepEqual(pastilles({}, { poste: { certifications: ['premiers_soins', 'sauveteur'] } }), ['Premiers soins manquants', 'Carte SN manquante'])
  assert.deepEqual(
    pastilles({}, { documents: [{ personne_id: 'p', genre: 'sauveteur', expire_le: '2027-06-15' }] }),
    ['Carte SN expire pendant'],
  )
  assert.deepEqual(
    pastilles({ debut: '2027-06-20' }, { documents: [{ personne_id: 'p', genre: 'premiers_soins', expire_le: '2027-06-01' }] }),
    ['Premiers soins expirés'],
  )
})
