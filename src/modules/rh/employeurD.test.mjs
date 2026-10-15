// Export Employeur D « Données d'emploi » (src/modules/rh/employeurD.ts).
// Lancer : node --test src/modules/rh/employeurD.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assuranceMaladie,
  cellulesFichier,
  codePays,
  codePostalCa,
  codeProvince,
  COLONNES_EMPLOI,
  COLONNES_PERSONNEL,
  compagnie8,
  lettreColonne,
  nomFichier,
  rangees,
  REGLAGES_DEFAUT,
  reglagesEmployeurD,
  tauxHoraire,
  telephone10,
  verifier,
} from './employeurD.ts'

const R = { ...REGLAGES_DEFAUT, titre_emploi: '001' }
const source = (modif = {}) => ({
  embauche: {
    id: 'e1',
    personne_id: 'p1',
    action_paie: 'A',
    type_employe: 'E',
    remuneration: 'semaine',
    taux: 650,
    date_embauche: '2027-06-20',
    employeur_d_le: null,
    ...modif.embauche,
  },
  personne: {
    prenom: 'Thomas',
    nom_famille: 'Pelletier',
    nom_complet: 'Pelletier, Thomas',
    sexe: 'm',
    date_naissance: '2004-09-03',
    courriel: 'thomas@essai.test',
    telephone: '819 555-0202',
    ...modif.personne,
  },
  dossier:
    modif.dossier === null
      ? null
      : {
          adresse: '123, rue des Érables',
          ville: 'Mont-Tremblant',
          province: 'QC',
          code_postal: 'j8e 1a1',
          pays: 'Canada',
          assurance_maladie: 'PELT 0409 0312',
          ...modif.dossier,
        },
  paie: modif.paie === null ? null : { nas_fin: '286', transit: '81530', institution: '815', compte_fin: '567', ...modif.paie },
  compagnie: { id: 'bpa', nom: 'GBPA+', numero_employeur_d: 'ABC', ...modif.compagnie },
  poste: { id: 'anim', nom: 'Animateur', poste_employeur_d: 'ANIM01', ...modif.poste },
  employe: modif.employe === null ? null : { id: 'emp1', matricule_employeur_d: '103', ...modif.employe },
  langue: modif.langue ?? 'fr',
})
const PAIE = { nas: '046454286', transit: '81530', institution: '815', compte: '1234567' }
/** Valeur de la colonne (lettre Excel) d'une rangée. */
const col = (rangee, lettre) => {
  const i = Array.from({ length: 200 }, (_, k) => lettreColonne(k + 1)).indexOf(lettre)
  return rangee[i]
}

test('mises en forme : compagnie, province, pays, code postal, téléphone, assurance maladie, taux', () => {
  assert.equal(compagnie8('abc'), '00000ABC')
  assert.equal(compagnie8('12345678'), '12345678')
  assert.equal(codeProvince('Québec'), 'QUE')
  assert.equal(codeProvince('QUEBEC'), 'QUE')
  assert.equal(codeProvince(' qc '), 'QUE')
  assert.equal(codeProvince('Ontario'), 'ONT')
  assert.equal(codeProvince('Colombie-Britannique'), 'C B')
  assert.equal(codeProvince('Nouveau-Brunswick'), 'N-B')
  assert.equal(codeProvince('Laurentides'), null)
  assert.equal(codeProvince(''), null)
  assert.equal(codePays('Canada', 'QUE'), '1')
  assert.equal(codePays('CANADA', null), '1')
  assert.equal(codePays('', 'QUE'), '1')
  assert.equal(codePays('United States', null), '2')
  assert.equal(codePays('États-Unis', null), '2')
  assert.equal(codePays('Mexico', null), null)
  assert.equal(codePays('', null), null)
  assert.equal(codePostalCa('j8e 1a1'), 'J8E1A1')
  assert.equal(codePostalCa('H0H-0H0'), 'H0H0H0')
  assert.equal(codePostalCa('12345'), null)
  assert.equal(telephone10('819 555-0202'), '8195550202')
  assert.equal(telephone10('+1 (514) 555-0201'), '5145550201')
  assert.equal(telephone10('555-0201'), null)
  assert.equal(assuranceMaladie('PELT 0409 0312'), 'PELT04090312')
  assert.equal(assuranceMaladie('aucun'), '')
  assert.equal(assuranceMaladie(''), '')
  assert.equal(assuranceMaladie('1234-567-890-AB-X'), null)
  assert.equal(tauxHoraire('semaine', 650, 40), 16.25)
  assert.equal(tauxHoraire('semaine', 664, 45), 14.7556)
  assert.equal(tauxHoraire('heure', 17.5, 40), 17.5)
  assert.equal(tauxHoraire(null, 17.5, 40), null)
})

test('reglagesEmployeurD : valeurs par défaut complétées, nombres vérifiés, titre vide = null', () => {
  assert.deepEqual(reglagesEmployeurD(null), REGLAGES_DEFAUT)
  const r = reglagesEmployeurD({ heures_paie: '75', heures_semaine: 0, titre_emploi: ' 002 ', fumeur: '', province_paie: 'ONT' })
  assert.equal(r.heures_paie, 75)
  assert.equal(r.heures_semaine, 40)
  assert.equal(r.titre_emploi, '002')
  assert.equal(r.fumeur, 'N')
  assert.equal(r.province_paie, 'ONT')
  assert.equal(reglagesEmployeurD({ titre_emploi: '  ' }).titre_emploi, null)
})

test('verifier : une ligne complète ne manque de rien', () => {
  assert.deepEqual(verifier(source(), R), { manques: [], avertissements: [] })
})

test('verifier : manques bloquants (référentiel, Employeur D, paie, identité, adresse)', () => {
  const v = verifier(
    source({
      compagnie: { numero_employeur_d: null },
      employe: { matricule_employeur_d: null },
      poste: { poste_employeur_d: null },
      embauche: { type_employe: null, date_embauche: null },
      personne: { sexe: 'x', date_naissance: null, nom_famille: '' },
      paie: { nas_fin: null },
      dossier: { province: 'Laurentides', code_postal: 'J8E' },
    }),
    { ...R, titre_emploi: null },
  )
  assert.deepEqual(v.manques, [
    'numero_compagnie',
    'matricule',
    'poste_employeur_d',
    'titre_emploi',
    'type_employe',
    'date_embauche',
    'nom_famille',
    'sexe',
    'naissance',
    'nas',
    'province',
    'code_postal',
  ])
  assert.deepEqual(verifier(source({ employe: null, dossier: null }), R).manques, ['fiche', 'adresse', 'ville', 'pays'])
  // Un ancien (M) : pas de titre d'emploi exigé.
  assert.deepEqual(verifier(source({ embauche: { action_paie: 'M' } }), { ...R, titre_emploi: null }).manques, [])
  // Compte sans transit ni institution.
  assert.deepEqual(verifier(source({ paie: { transit: null, institution: null } }), R).manques, ['transit', 'institution'])
  // États-Unis : province et code postal canadiens pas exigés.
  assert.deepEqual(verifier(source({ dossier: { pays: 'USA', province: 'Florida', code_postal: '33101' } }), R).manques, [])
})

test('verifier : avertissements (raccourci, illisible, chèque)', () => {
  const v = verifier(
    source({
      dossier: { adresse: '1234, boulevard du Docteur-Gervais, app. 12', assurance_maladie: '1234-567-890-AB-X' },
      personne: { telephone: '555-0202' },
      paie: { compte_fin: null },
    }),
    R,
  )
  assert.deepEqual(v.manques, [])
  assert.deepEqual(v.avertissements, [
    'Adresse raccourcie à 30 caractères.',
    "Numéro d'assurance maladie illisible : laissé vide.",
    'Téléphone illisible : laissé vide.',
    'Aucun compte bancaire : payé par chèque.',
  ])
})

test('rangees : profil personnel de 46 colonnes au format du canevas', () => {
  const { personnel } = rangees(source(), R, PAIE)
  assert.equal(personnel.length, COLONNES_PERSONNEL)
  assert.equal(lettreColonne(COLONNES_PERSONNEL), 'AT')
  assert.equal(col(personnel, 'A'), 'A')
  assert.equal(col(personnel, 'B'), '00000ABC')
  assert.deepEqual(col(personnel, 'C'), { n: 103, z: '0' })
  assert.equal(col(personnel, 'D'), 'Pelletier')
  assert.equal(col(personnel, 'E'), 'Thomas')
  assert.equal(col(personnel, 'F'), null)
  assert.equal(col(personnel, 'G'), '046454286') // zéro de tête gardé
  assert.equal(col(personnel, 'H'), '2004-09-03')
  assert.equal(col(personnel, 'I'), 'F')
  assert.equal(col(personnel, 'J'), 'M')
  assert.equal(col(personnel, 'M'), '1')
  assert.equal(col(personnel, 'N'), 'PELT04090312')
  assert.equal(col(personnel, 'O'), 'N')
  assert.equal(col(personnel, 'P'), '123, rue des Érables')
  assert.equal(col(personnel, 'Q'), 'Mont-Tremblant')
  assert.equal(col(personnel, 'R'), 'QUE')
  assert.equal(col(personnel, 'S'), 'J8E1A1')
  assert.equal(col(personnel, 'T'), null)
  assert.equal(col(personnel, 'U'), '1')
  assert.equal(col(personnel, 'V'), '8195550202')
  assert.equal(col(personnel, 'AB'), 'N')
  assert.equal(col(personnel, 'AO'), 'thomas@essai.test')
  assert.equal(col(personnel, 'AQ'), null) // « Aucune valeur »
  assert.equal(personnel.filter((v) => v !== null).length, 20)
  // Anglais, États-Unis, adresse coupée à 30.
  const autre = rangees(
    source({ langue: 'en', personne: { sexe: 'f' }, dossier: { pays: 'United States', province: 'Florida', code_postal: '33101-1234', adresse: '1234, boulevard du Docteur-Gervais' } }),
    R,
    PAIE,
  ).personnel
  assert.equal(col(autre, 'I'), 'A')
  assert.equal(col(autre, 'J'), 'F')
  assert.equal(col(autre, 'R'), 'ZZ')
  assert.equal(col(autre, 'S'), null)
  assert.equal(col(autre, 'T'), '33101-1234')
  assert.equal(col(autre, 'U'), '2')
  assert.equal(col(autre, 'P'), '1234, boulevard du Docteur-Ger')
})

test('rangees : profil emploi de 112 colonnes, ajout (A) et modification (M)', () => {
  const { emploi } = rangees(source(), R, PAIE)
  assert.equal(emploi.length, COLONNES_EMPLOI)
  assert.equal(lettreColonne(COLONNES_EMPLOI), 'DH')
  const attendu = {
    A: 'A',
    B: '00000ABC',
    C: { n: 103, z: '0' },
    D: '1',
    E: 'ANIM01',
    F: '1',
    G: '001',
    H: '999',
    I: '2027-06-20',
    T: 'E',
    U: '7777',
    AB: { n: 80, z: '0.00' },
    AC: { n: 16.25, z: '0.0000' },
    AD: '2027-06-20',
    AJ: 'QUE',
    AK: 'REM',
    AL: '001',
    AM: '1',
    AN: '81530',
    AO: '815',
    AP: '1234567',
    BB: '2',
    BC: '1',
    BH: 'A',
    BT: '2027-06-20',
    DH: '1',
  }
  for (const [lettre, v] of Object.entries(attendu)) assert.deepEqual(col(emploi, lettre), v, `colonne ${lettre}`)
  assert.equal(emploi.filter((v) => v !== null).length, Object.keys(attendu).length)
  for (const vide of ['K', 'AQ', 'CJ', 'CZ', 'DB', 'DC', 'DD', 'DE']) assert.equal(col(emploi, vide), null, `colonne ${vide} vide`)

  // Un ancien (M) : date de réembauche au lieu de la date d'embauche.
  const m = rangees(source({ embauche: { action_paie: 'M', remuneration: 'heure', taux: 17.5 } }), R, PAIE).emploi
  assert.equal(col(m, 'A'), 'M')
  assert.equal(col(m, 'I'), null)
  assert.equal(col(m, 'K'), '2027-06-20')
  assert.deepEqual(col(m, 'AC'), { n: 17.5, z: '0.0000' })

  // Sans compte : chèque, aucun dépôt.
  const cheque = rangees(source(), R, { ...PAIE, compte: null }).emploi
  assert.equal(col(cheque, 'BB'), '1')
  for (const vide of ['AM', 'AN', 'AO', 'AP']) assert.equal(col(cheque, vide), null)
})

test('cellulesFichier : en-têtes de section seuls sur leur ligne, profils dans l’ordre', () => {
  const l1 = rangees(source(), R, PAIE)
  const l2 = rangees(source({ embauche: { id: 'e2' }, personne: { prenom: 'Rosalie' } }), R, PAIE)
  const c = cellulesFichier([l1, l2])
  assert.equal(c.length, 6)
  assert.deepEqual(c[0], ['[Profil personnel]'])
  assert.equal(c[1].length, 46)
  assert.equal(col(c[2], 'E'), 'Rosalie')
  assert.deepEqual(c[3], ['[Profil emploi]'])
  assert.equal(c[4].length, 112)
  assert.equal(c[5].length, 112)
})

test('nomFichier et lettreColonne', () => {
  assert.equal(nomFichier({ saison: 'Été 2027', compagnie: 'GBPA+', jour: '2026-10-15' }), "Employeur D Données d'emploi Été 2027 GBPA+ (2026-10-15).xls")
  assert.equal(nomFichier({ saison: 'Été 2027', jour: '2026-10-15' }), "Employeur D Données d'emploi Été 2027 (2026-10-15).xls")
  assert.equal(nomFichier({ saison: 'Été 2027', compagnie: 'Rouge/Diable', jour: '2026-10-15' }), "Employeur D Données d'emploi Été 2027 Rouge-Diable (2026-10-15).xls")
  assert.deepEqual([1, 26, 27, 46, 52, 88, 104, 112].map(lettreColonne), ['A', 'Z', 'AA', 'AT', 'AZ', 'CJ', 'CZ', 'DH'])
})
