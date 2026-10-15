// Export Employeur D (employeurD.ts). Lancer : npm run test:temps
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as XLSX from 'xlsx'
import { cellulesEmployeurD, colonnesCodes, entetes, largeurs, NOM_FEUILLE, nomFichier, preparerExport, serieExcel } from './employeurD.ts'

const GBPA = { id: 'c1', nom: 'GBPA+', ordre: 1, numero_employeur_d: '0001234' }
const OPI = { id: 'c2', nom: 'Opikawa', ordre: 2, numero_employeur_d: 'OPI42' }
const RD = { id: 'c3', nom: 'Rouge & Diable', ordre: 3, numero_employeur_d: null }
const pinson = { id: 'e1', surnom: 'Pinson', nom_complet: 'Morin, Léa', matricule_employeur_d: '1001' }
const castor = { id: 'e2', surnom: 'Castor', nom_complet: null, matricule_employeur_d: '1002' }
const loutre = { id: 'e3', surnom: 'Loutre', nom_complet: 'Côté, Noah', matricule_employeur_d: null }
const REGLAGES = { code_regulieres: 1, code_maladie: null, code_banque: null, periode: 'date_paie' }
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
    r.sansCode.map((s) => [s.type, s.heures, s.employes]),
    [
      ['maladie', 8, 1],
      ['banque', 2.5, 1],
    ],
  )
})

test('codes réglés : une colonne par code, deux types au même code s’additionnent', () => {
  const reglages = { code_regulieres: 1, code_maladie: 101, code_banque: 1, periode: 'date_paie' }
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
  assert.deepEqual(r.employesSansMatricule.map((e) => e.surnom), ['Loutre'])
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
  assert.equal(r.lignes.find((l) => l.employe.id === 'e2').statut, null)
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
    reglages: { code_regulieres: 1, code_maladie: 101, code_banque: null, periode: 'date_paie' },
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
