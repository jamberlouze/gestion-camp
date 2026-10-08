// Le calcul de l'app refait les cellules calculées du chiffrier
// « Estimés | Accueil de groupe 2026-27 » (164 onglets réels, jeu anonyme
// dans essais/). Lancer : npm run test:calcul
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  appliquerPourcentages,
  exerciceDe,
  gratuites,
  lignesAuto,
  litsDe,
  prixScolaire,
  regrouperSections,
  repasProposes,
  totaux,
} from './calcul.ts'

const cas = JSON.parse(readFileSync(new URL('./essais/chiffrier-2026-27.json', import.meta.url), 'utf8'))

// Liste de prix 2026-27 du chiffrier (la même que la migration). Le
// chiffrier ne fige aucun prix : tous ses onglets calculent avec ceux-ci.
const PRIX = {
  LIT: 25.2, 'CN-N': 32.5, 'CN-N1': 5, REPAS: 19.4,
  'CN-1:10': 26.5, 'CN-1:15': 23.5, 'CN-1:20': 20.5, 'CN-1:X': 20.5,
  'JPA-1:10': 46, 'JPA-1:15': 42, 'JPA-1:20': 38, 'JPA-1:X': 34,
  'LS-JR': 840, 'LS-SR': 1092, 'LS-JC': 1815, 'LS-HS': 210,
}
const p = (code) => PRIX[code] ?? 0

// Référence de Rooming (lits, chambres).
const etages = new Map(
  [['CH', 36, 7], ['CB', 28, 5], ['PB', 37, 8], ['PH', 32, 8], ['VFB', 23, 6], ['VFH', 36, 9]].map(([code, lits, chambres]) => [
    code,
    { code, lits, chambres },
  ]),
)
const SECTIONS = [
  ['AG-CH', 'Cèdres haut', ['CH'], 100], ['AG-CB', 'Cèdres bas', ['CB'], 101], ['AG-C', 'Cèdres', ['CH', 'CB'], 102],
  ['AG-PB', 'Pins bas', ['PB'], 103], ['AG-PH', 'Pins haut', ['PH'], 104], ['AG-P', 'Pins', ['PB', 'PH'], 105],
  ['AG-PP', 'Pavillon Principal', ['CH', 'CB', 'PB', 'PH'], 106], ['AG-VB', 'Vieille-France Bas', ['VFB'], 107],
  ['AG-VH', 'Vieille-France Haut', ['VFH'], 108], ['AG-V', 'Vieille-France', ['VFB', 'VFH'], 109],
  ['AG-SC', 'Site complet', ['CH', 'CB', 'PB', 'PH', 'VFB', 'VFH'], 110],
].map(([code, nom, e, ordre]) => ({ id: code, code, nom, categorie: 'hebergement', etages: e, actif: true, ordre }))
const produits = new Map(SECTIONS.map((s) => [s.code, s]))
for (const code of Object.keys(PRIX)) if (!produits.has(code)) produits.set(code, { id: code, code, nom: code, categorie: 'autre', etages: null, actif: true, ordre: 0 })
const catalogue = { prix: (code) => PRIX[code] ?? null, produits, etages, gratuitePar: 20, diviseurHeuresExtra: 8 }

const presque = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg} : app ${a} ≠ chiffrier ${b}`)
const norm = (s) => s.toLowerCase().replace(/\s*\(.*$/, '').trim()

test('Classe nature : prix par élève et par accompagnateur (chiffrier)', () => {
  const cn = cas.filter((c) => c.forfait === 'classe_nature')
  assert.ok(cn.length > 50)
  for (const c of cn) {
    const r = prixScolaire({ forfait: 'classe_nature', service_repas: true, ...c.entree }, 8, p)
    presque(r.forfait, c.attendu.forfait, `${c.onglet} forfait`)
    presque(r.accompagnateur, c.attendu.accompagnateur, `${c.onglet} accompagnateur`)
  }
})

test('Journée plein air : prix par élève et par accompagnateur (chiffrier)', () => {
  for (const c of cas.filter((x) => x.forfait === 'journee_plein_air')) {
    const e = c.entree
    const r = prixScolaire(
      {
        forfait: 'journee_plein_air', ratio: e.ratio, service_repas: e.repas > 0, nb_dejeuners: 0, nb_diners: e.repas,
        nb_soupers: 0, heures_extra: 0, date_arrivee: '2027-06-01', date_depart: '2027-06-01',
      },
      8,
      p,
    )
    presque(r.forfait, c.attendu.forfait, `${c.onglet} forfait`)
    presque(r.accompagnateur, c.attendu.accompagnateur, `${c.onglet} accompagnateur`)
  }
})

// Corrections confirmées par Maxime (au prorata des lits) : le chiffrier
// avait la VF haut à 827 $ tapé et le site complet à 190 lits.
const CORRIGES = new Map([['vieille-france haut', 36 * 25.2], ['site complet', 192 * 25.2]])

test('Accueil de groupe : prix des sections et des repas (chiffrier)', () => {
  let corriges = 0
  for (const c of cas.filter((x) => x.forfait === 'accueil_groupe')) {
    for (const s of c.attendu.sections) {
      const produit = SECTIONS.find((x) => norm(x.nom) === norm(s.nom))
      assert.ok(produit, `${c.onglet} : section inconnue « ${s.nom} »`)
      const prix = litsDe(produit.etages, etages).lits * 25.2
      if (CORRIGES.has(norm(s.nom))) {
        corriges++
        presque(prix, CORRIGES.get(norm(s.nom)), `${c.onglet} ${s.nom} (corrigé)`)
      } else presque(prix, s.prix, `${c.onglet} ${s.nom}`)
    }
    if (c.attendu.repas_total !== null) {
      const res = lignesAuto(
        {
          forfait: 'accueil_groupe', variante: null, date_arrivee: '2027-03-01', date_depart: '2027-03-02',
          nb_participants: c.entree.nb_personnes, nb_accompagnateurs: 0, ratio: null, service_repas: true,
          nb_dejeuners: c.entree.repas, nb_diners: 0, nb_soupers: 0, heures_extra: 0, heures_supplementaires: 0, etages: [],
        },
        catalogue,
      )
      const repas = res.lignes.find((l) => l.code === 'REPAS')?.montant ?? 0
      presque(repas, Math.round(c.attendu.repas_total * 100) / 100, `${c.onglet} repas`)
    }
  }
  assert.ok(corriges > 0)
})

test('Location de salle : forfait et heures supplémentaires (chiffrier)', () => {
  const variante = (nom) => (/Soirée/.test(nom) ? 'soir' : /complète/.test(nom) ? 'complete' : /Journée/.test(nom) ? 'jour' : null)
  for (const c of cas.filter((x) => x.forfait === 'location_salle')) {
    const res = lignesAuto(
      {
        forfait: 'location_salle', variante: variante(c.entree.forfait_salle), date_arrivee: '2027-03-01', date_depart: '2027-03-01',
        nb_participants: 0, nb_accompagnateurs: 0, ratio: null, service_repas: false, nb_dejeuners: 0, nb_diners: 0,
        nb_soupers: 0, heures_extra: 0, heures_supplementaires: c.entree.heures_sup, etages: [],
      },
      catalogue,
    )
    if (c.attendu.forfait !== '' && c.attendu.forfait !== undefined)
      presque(res.lignes.find((l) => l.code?.startsWith('LS-') && l.code !== 'LS-HS')?.montant ?? 0, c.attendu.forfait, `${c.onglet} forfait`)
    if (c.attendu.heures_sup !== null)
      presque(res.lignes.find((l) => l.code === 'LS-HS')?.montant ?? 0, c.attendu.heures_sup, `${c.onglet} heures sup.`)
  }
})

test('Estimés des PDF reçus : 27-G-083, 27-G-014, 27-G-002', () => {
  // 27-G-083 : 22 élèves, 1:20, 1 nuit, 4 repas, 3 accompagnateurs.
  const e083 = {
    forfait: 'classe_nature', variante: null, date_arrivee: '2027-06-21', date_depart: '2027-06-22', nb_participants: 22,
    nb_accompagnateurs: 3, ratio: '1:20', service_repas: true, nb_dejeuners: 1, nb_diners: 2, nb_soupers: 1,
    heures_extra: 0, heures_supplementaires: 0, etages: [],
  }
  const r083 = lignesAuto(e083, catalogue)
  assert.deepEqual(r083.lignes.map((l) => [l.quantite, l.prix_unitaire, l.montant]), [[22, 156.1, 3434.2], [1, 0, 0], [2, 96.35, 192.7]])
  assert.deepEqual(totaux(r083.lignes), { sous_total: 3626.9, tps: 181.35, tvq: 361.78, total: 4170.03 })

  // 27-G-014 : 125 élèves, 1:15, 1 nuit, 4 repas, 6 h en extra, 10 accompagnateurs.
  const r014 = lignesAuto({ ...e083, nb_participants: 125, nb_accompagnateurs: 10, ratio: '1:15', heures_extra: 6 }, catalogue)
  assert.equal(r014.lignes[0].prix_unitaire, 179.725)
  assert.deepEqual(r014.lignes.map((l) => l.quantite), [125, 6, 4])
  // PDF : 22 465,63 $ (125 × 179,725 arrondi) + 385,40 $.
  assert.deepEqual(totaux(r014.lignes), { sous_total: 22851.03, tps: 1142.55, tvq: 2279.39, total: 26272.97 })

  // 27-G-002 : Pins + Cèdres haut, 2 nuits, 54 personnes, 6 repas (+ transport saisi à la main).
  const r002 = lignesAuto(
    { ...e083, forfait: 'accueil_groupe', date_arrivee: '2027-01-04', date_depart: '2027-01-06', nb_participants: 54,
      nb_accompagnateurs: 0, ratio: null, nb_dejeuners: 2, nb_diners: 2, nb_soupers: 2, etages: ['PB', 'PH', 'CH'] },
    catalogue,
  )
  assert.deepEqual(r002.lignes.map((l) => [l.description.split(' (')[0], l.quantite, l.prix_unitaire, l.montant]), [
    ['Cèdres haut', 2, 907.2, 1814.4],
    ['Pins', 2, 1738.8, 3477.6],
    ['Service de repas régulier', 6, 1047.6, 6285.6],
  ])
  const transport = { quantite: 2, prix_unitaire: 156.25, pourcentage: null, montant: 312.5 }
  assert.deepEqual(totaux([...r002.lignes, transport]), { sous_total: 11890.1, tps: 594.51, tvq: 1186.04, total: 13670.65 })
})

test('Petites règles', () => {
  assert.equal(exerciceDe('2026-09-30'), 2026)
  assert.equal(exerciceDe('2026-10-01'), 2027)
  assert.equal(gratuites(125, 10, 20), 6)
  assert.equal(gratuites(125, 3, 20), 3)
  assert.deepEqual(regrouperSections(['CH', 'CB', 'VFB'], SECTIONS).map((s) => s.code), ['AG-C', 'AG-VB'])
  assert.deepEqual(regrouperSections(['CH', 'CB', 'PB', 'PH', 'VFB', 'VFH'], SECTIONS).map((s) => s.code), ['AG-SC'])
  // Classe nature 10 h → 14 h, 1 nuit : dîner + souper, puis déjeuner + dîner.
  assert.deepEqual(
    repasProposes(
      { forfait: 'classe_nature', date_arrivee: '2027-05-13', date_depart: '2027-05-14', service_repas: true, heure_arrivee: '10:00', heure_depart: '14:00' },
      { dejeuner: '08:00', diner: '12:00', souper: '17:30' },
    ),
    { dejeuners: 1, diners: 2, soupers: 1 },
  )
  // Rabais de 10 % sur ce qui précède.
  const l = appliquerPourcentages([
    { quantite: 1, prix_unitaire: 1000, pourcentage: null, montant: 0 },
    { quantite: 1, prix_unitaire: 0, pourcentage: -10, montant: 0 },
  ])
  assert.deepEqual(l.map((x) => x.montant), [1000, -100])
})
