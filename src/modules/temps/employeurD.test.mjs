// Export Employeur D (employeurD.ts). Lancer : npm run test:temps
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as XLSX from 'xlsx'
import { cellulesEmployeurD, colonnesCodes, entetes, largeurs, NOM_FEUILLE, nomDirection, nomFichier, preparerExport, serieExcel } from './employeurD.ts'

const GBPA = { id: 'c1', nom: 'GBPA+', ordre: 1, numero_employeur_d: '0001234' }
const OPI = { id: 'c2', nom: 'Opikawa', ordre: 2, numero_employeur_d: 'OPI42' }
const RD = { id: 'c3', nom: 'Rouge & Diable', ordre: 3, numero_employeur_d: null }
const pinson = { id: 'e1', surnom: 'Pinson', nom_complet: 'Morin, Léa', matricule_employeur_d: '1001' }
const castor = { id: 'e2', surnom: 'Castor', nom_complet: null, matricule_employeur_d: '1002' }
const loutre = { id: 'e3', surnom: 'Loutre', nom_complet: 'Côté, Noah', matricule_employeur_d: null }
const REGLAGES = { code_regulieres: 1, code_vacances: null, code_maladie: null, code_banque: null, periode: 'date_paie' }
const h = (employe_id, entreprise_id, type, heures) => ({ employe_id, entreprise_id, type, heures })

test('une ligne par employé et compagnie, régulières additionnées au code G1', () => {
  const r = preparerExport({
    employes: [pinson, castor],
    compagnies: [GBPA, OPI],
    heures: [h('e1', 'c1', 'regulieres', 7.5), h('e1', 'c1', 'regulieres', 8), h('e1', 'c2', 'regulieres', 3.25), h('e2', 'c1', 'regulieres', 6)],
    reglages: REGLAGES,
  })
  assert.deepEqual(r.codes, [1])
  assert.deepEqual(
    r.lignes.map((l) => [l.compagnie.nom, l.nom, l.quantites[1]]),
    [
      ['GBPA+', 'Castor', 6],
      ['GBPA+', 'Morin, Léa', 15.5],
      ['Opikawa', 'Morin, Léa', 3.25],
    ],
  )
  assert.equal(r.pret, true)
})

test('woofing jamais exporté ; type sans code signalé, pas dans le fichier', () => {
  const r = preparerExport({
    employes: [pinson],
    compagnies: [GBPA],
    heures: [h('e1', 'c1', 'regulieres', 8), h('e1', 'c1', 'woofing', 4), h('e1', 'c1', 'maladie', 8), h('e1', 'c1', 'banque', 2.5)],
    reglages: REGLAGES,
  })
  assert.deepEqual(r.lignes[0].quantites, { 1: 8 })
  assert.deepEqual(
    r.sansCode.map((s) => [s.type, s.heures, s.personnes]),
    [
      ['maladie', 8, 1],
      ['banque', 2.5, 1],
    ],
  )
})

test('codes réglés : une colonne par code, deux types au même code s’additionnent', () => {
  const reglages = { code_regulieres: 1, code_vacances: null, code_maladie: 101, code_banque: 1, periode: 'date_paie' }
  assert.deepEqual(colonnesCodes(reglages), [1, 101])
  const r = preparerExport({
    employes: [pinson],
    compagnies: [GBPA],
    heures: [h('e1', 'c1', 'regulieres', 30), h('e1', 'c1', 'banque', 4), h('e1', 'c1', 'maladie', 8)],
    reglages,
  })
  assert.deepEqual(r.lignes[0].quantites, { 1: 34, 101: 8 })
  assert.deepEqual(r.sansCode, [])
  // Aucun code : rien à exporter.
  const vide = preparerExport({ employes: [pinson], compagnies: [GBPA], heures: [h('e1', 'c1', 'regulieres', 8)], reglages: { ...REGLAGES, code_regulieres: null } })
  assert.deepEqual(vide.codes, [])
  assert.equal(vide.lignes.length, 0)
  assert.equal(vide.pret, false)
})

test('bloquant : compagnie sans numéro, employé sans matricule', () => {
  const r = preparerExport({
    employes: [pinson, loutre],
    compagnies: [GBPA, RD],
    heures: [h('e1', 'c3', 'regulieres', 5), h('e3', 'c1', 'regulieres', 5), h('e3', 'c3', 'regulieres', 1)],
    reglages: REGLAGES,
  })
  assert.deepEqual(r.compagniesSansNumero.map((c) => c.nom), ['Rouge & Diable'])
  assert.deepEqual(r.sansMatricule.map((e) => e.nom), ['Côté, Noah'])
  assert.equal(r.pret, false)
})

test('filtre par compagnie : seules ses heures, ses manques', () => {
  const r = preparerExport({
    employes: [pinson, loutre],
    compagnies: [GBPA, RD],
    heures: [h('e1', 'c1', 'regulieres', 5), h('e3', 'c3', 'regulieres', 1)],
    reglages: REGLAGES,
    compagnie: 'c1',
  })
  assert.deepEqual(r.lignes.map((l) => l.nom), ['Morin, Léa'])
  assert.equal(r.pret, true)
})

test('feuille propre pas approuvée : signalée, pas bloquante', () => {
  const r = preparerExport({
    employes: [pinson, castor],
    compagnies: [GBPA, OPI],
    heures: [h('e1', 'c1', 'regulieres', 5), h('e1', 'c2', 'regulieres', 5), h('e2', 'c1', 'regulieres', 5)],
    reglages: REGLAGES,
    propres: ['e1'],
    statuts: [{ employe_id: 'e1', entreprise_id: 'c2', statut: 'approuvee' }],
  })
  assert.deepEqual(r.nonApprouvees.map((l) => [l.compagnie.nom, l.statut]), [['GBPA+', 'ouverte']])
  assert.equal(r.lignes.find((l) => l.personneId === 'e2').statut, null)
  assert.equal(r.pret, true)
})

test('heures à 0 ou employé inconnu : pas de ligne', () => {
  const r = preparerExport({
    employes: [pinson],
    compagnies: [GBPA],
    heures: [h('e1', 'c1', 'regulieres', 0), h('zz', 'c1', 'regulieres', 4)],
    reglages: REGLAGES,
  })
  assert.equal(r.lignes.length, 0)
})

test('dates Excel et nom du fichier', () => {
  assert.equal(serieExcel('1900-03-01'), 61)
  assert.equal(serieExcel('2026-10-22'), 46317)
  assert.deepEqual(entetes([1, 101]), ['Compagnie', 'Matricule', 'Nom, prénom', 'No relevé', 'Période', 'G1(Quantité)', 'G101(Quantité)'])
  assert.equal(
    nomFichier({ numero: 21, annee: 2026, debut: '2026-10-04', fin: '2026-10-17' }),
    'Employeur D PP21-2026 (2026-10-04 au 2026-10-17).xls',
  )
  assert.equal(
    nomFichier({ numero: 1, annee: 2027, debut: '2026-12-27', fin: '2027-01-09', compagnie: 'A/B' }),
    'Employeur D A-B PP1-2027 (2026-12-27 au 2027-01-09).xls',
  )
})

test('fichier .xls relu par SheetJS : en-têtes, types et formats du gabarit', () => {
  const r = preparerExport({
    employes: [pinson, castor],
    compagnies: [GBPA, OPI],
    heures: [h('e1', 'c1', 'regulieres', 15.5), h('e1', 'c1', 'maladie', 8), h('e2', 'c2', 'regulieres', 6)],
    reglages: { code_regulieres: 1, code_vacances: null, code_maladie: 101, code_banque: null, periode: 'date_paie' },
  })
  const cellules = cellulesEmployeurD(r, '2026-10-22')
  // Même assemblage que l'écran (ExportEmployeurD.tsx).
  const ws = {}
  cellules.forEach((rang, i) => rang.forEach((c, j) => c && (ws[XLSX.utils.encode_cell({ r: i, c: j })] = { ...c })))
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: cellules.length - 1, c: cellules[0].length - 1 } })
  ws['!cols'] = largeurs(r.codes).map((wch) => ({ wch }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, NOM_FEUILLE)
  const octets = XLSX.write(wb, { bookType: 'biff8', type: 'buffer' })

  const relu = XLSX.read(octets, { type: 'buffer', cellNF: true })
  assert.deepEqual(relu.SheetNames, [NOM_FEUILLE])
  const f = relu.Sheets[NOM_FEUILLE]
  const rangees = XLSX.utils.sheet_to_json(f, { header: 1, raw: true, defval: null })
  assert.deepEqual(rangees[0], ['Compagnie', 'Matricule', 'Nom, prénom', 'No relevé', 'Période', 'G1(Quantité)', 'G101(Quantité)'])
  const sansDate = (rang) => rang.filter((_, i) => i !== 4)
  assert.deepEqual(sansDate(rangees[1]), ['0001234', 1001, 'Morin, Léa', null, 15.5, 8])
  assert.deepEqual(sansDate(rangees[2]), ['OPI42', 1002, 'Castor', null, 6, null])
  assert.equal(f.A2.t, 's')
  assert.equal(f.B2.t, 'n')
  // Période : vraie date (relue comme date), affichée au format du gabarit.
  assert.equal(f.E2.z, 'yyyy/mm/dd')
  assert.equal(f.E2.w, '2026/10/22')
  assert.equal(XLSX.SSF.format('yyyy-mm-dd', 46317), '2026-10-22')
})

// ---------- Direction (comptes, feuilles temps.heures) ----------
const julie = { id: 'u2', nom: 'Julie Tremblay', courriel: 'julie@camp.test', admin: false }
const maxime = { id: 'u1', nom: 'Maxime  Chamberland', courriel: 'maxime@camp.test', admin: true }
const olivier = { id: 'u3', nom: null, courriel: 'olivier@camp.test', admin: false }
const hd = (user_id, type, heures) => ({ user_id, type, heures })
const TOUS = { code_regulieres: 1, code_vacances: 305, code_maladie: 101, code_banque: 43, periode: 'date_paie' }

test('direction : une ligne à sa compagnie de paie, vacances au code des vacances', () => {
  const r = preparerExport({
    employes: [pinson],
    compagnies: [GBPA, OPI],
    heures: [h('e1', 'c1', 'regulieres', 10)],
    reglages: TOUS,
    direction: {
      membres: [julie, maxime],
      paie: [
        { user_id: 'u2', entreprise_id: 'c2', matricule_employeur_d: '2001' },
        { user_id: 'u1', entreprise_id: 'c1', matricule_employeur_d: '2002' },
      ],
      heures: [hd('u2', 'regulieres', 42.5), hd('u2', 'vacances', 8), hd('u2', 'maladie', 4), hd('u2', 'banque', 2), hd('u1', 'regulieres', 40)],
      statuts: [{ user_id: 'u2', statut: 'soumise' }],
    },
  })
  assert.deepEqual(r.codes, [1, 305, 101, 43])
  assert.deepEqual(
    r.lignes.map((l) => [l.genre, l.compagnie.nom, l.nom, l.matricule, l.quantites]),
    [
      ['direction', 'GBPA+', 'Chamberland, Maxime', '2002', { 1: 40 }],
      ['employe', 'GBPA+', 'Morin, Léa', '1001', { 1: 10 }],
      ['direction', 'Opikawa', 'Tremblay, Julie', '2001', { 1: 42.5, 305: 8, 101: 4, 43: 2 }],
    ],
  )
  // Julie : feuille soumise, signalée ; l'admin n'a pas d'approbation.
  assert.deepEqual(r.nonApprouvees.map((l) => [l.nom, l.statut]), [['Tremblay, Julie', 'soumise']])
  assert.equal(r.pret, true)
})

test('direction : sans compagnie de paie ou sans matricule = bloquant, même filtré', () => {
  const r = preparerExport({
    employes: [],
    compagnies: [GBPA],
    heures: [],
    reglages: TOUS,
    compagnie: 'c1',
    direction: {
      membres: [julie, olivier],
      paie: [{ user_id: 'u2', entreprise_id: 'c1', matricule_employeur_d: null }],
      heures: [hd('u2', 'regulieres', 8), hd('u3', 'regulieres', 5)],
    },
  })
  assert.deepEqual(r.sansMatricule, [{ genre: 'direction', id: 'u2', nom: 'Tremblay, Julie' }])
  assert.deepEqual(r.directionSansCompagnie, [{ genre: 'direction', id: 'u3', nom: 'olivier@camp.test' }])
  assert.equal(r.lignes.length, 1)
  assert.equal(r.pret, false)
})

test('direction : vacances sans code signalées ; heures d’un type sans code ne bloquent pas', () => {
  const r = preparerExport({
    employes: [],
    compagnies: [GBPA],
    heures: [],
    reglages: REGLAGES,
    direction: { membres: [olivier], paie: [], heures: [hd('u3', 'vacances', 8)] },
  })
  assert.deepEqual(r.sansCode.map((s) => [s.type, s.heures, s.personnes]), [['vacances', 8, 1]])
  assert.deepEqual(r.directionSansCompagnie, [])
})

test('même matricule pour deux personnes = bloquant ; un employé à deux compagnies, non', () => {
  const r = preparerExport({
    employes: [pinson],
    compagnies: [GBPA, OPI],
    heures: [h('e1', 'c1', 'regulieres', 5), h('e1', 'c2', 'regulieres', 5)],
    reglages: REGLAGES,
    direction: { membres: [julie], paie: [{ user_id: 'u2', entreprise_id: 'c1', matricule_employeur_d: '1001' }], heures: [hd('u2', 'regulieres', 8)] },
  })
  assert.deepEqual(r.matriculesEnDouble, [{ matricule: '1001', noms: ['Morin, Léa', 'Tremblay, Julie'] }])
  assert.equal(r.pret, false)
  const seul = preparerExport({ employes: [pinson], compagnies: [GBPA, OPI], heures: [h('e1', 'c1', 'regulieres', 5), h('e1', 'c2', 'regulieres', 5)], reglages: REGLAGES })
  assert.deepEqual(seul.matriculesEnDouble, [])
})

test('nom d’un compte de la direction en « Nom, prénom »', () => {
  assert.equal(nomDirection({ nom: 'Julie Tremblay', courriel: 'x' }), 'Tremblay, Julie')
  assert.equal(nomDirection({ nom: 'Marie-Ève De La Fontaine', courriel: 'x' }), 'De La Fontaine, Marie-Ève')
  assert.equal(nomDirection({ nom: ' Cliff ', courriel: 'x' }), 'Cliff')
  assert.equal(nomDirection({ nom: '', courriel: 'a@b.c' }), 'a@b.c')
})
