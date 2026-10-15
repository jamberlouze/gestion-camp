// Tests de la fonction Edge vigie (parties pures et traitement des résultats),
// sans réseau ni appel à l'API Anthropic : la base est simulée.
// Lancer : npm run test:vigie (Node 24 lit le TypeScript tel quel).

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inviteCamp, OUTIL_RESULTATS, systemeDocumentation, systemeVerification, TYPES_SEJOUR } from './invites.ts'
import { type Contexte, type Requete, traiterCamp, typeSejour } from './traitement.ts'

// ------------------------------------------------------------ base simulée
interface Ecriture {
  table: string
  op: 'insert' | 'update' | 'upsert' | 'delete'
  valeurs: unknown
  filtres: [string, unknown][]
}

/** Imite assez le client Supabase pour traiterCamp : lectures tirées de `lignes`, écritures notées. */
function baseSimulee(lignes: Record<string, unknown[]>) {
  const ecritures: Ecriture[] = []
  const from = (table: string) => {
    let op: Ecriture['op'] | 'select' = 'select'
    let valeurs: unknown = null
    let unique = false
    const filtres: [string, unknown][] = []
    const requete: Record<string, unknown> = {}
    const suite = () => requete
    Object.assign(requete, {
      select: () => requete,
      insert: (v: unknown) => ((op = 'insert'), (valeurs = v), requete),
      update: (v: unknown) => ((op = 'update'), (valeurs = v), requete),
      upsert: (v: unknown) => ((op = 'upsert'), (valeurs = v), requete),
      delete: () => ((op = 'delete'), requete),
      eq: (col: string, v: unknown) => (filtres.push([col, v]), requete),
      in: (col: string, v: unknown) => (filtres.push([col, v]), requete),
      order: suite,
      limit: suite,
      single: () => ((unique = true), requete),
      maybeSingle: () => ((unique = true), requete),
      then: (ok: (r: { data: unknown; error: null }) => unknown) => {
        if (op !== 'select') {
          ecritures.push({ table, op, valeurs, filtres })
          return Promise.resolve(ok({ data: null, error: null }))
        }
        const toutes = lignes[table] ?? []
        return Promise.resolve(ok({ data: unique ? (toutes[0] ?? null) : toutes, error: null }))
      },
    })
    return requete
  }
  const ctx = { db: { from }, stockage: {}, activites: [], photosRestantes: 0 } as unknown as Contexte
  return { ctx, ecritures }
}

const CAMP = { id: 'camp-1', nom: 'Camp essai', types: ['camp_vacances'], hebergement: [], resume: null }
const CONNU = {
  id: 'prog-1',
  camp_id: 'camp-1',
  nom: 'Séjour régulier',
  prix: 900,
  duree_jours: 7,
  duree_nuits: 6,
  annee: '2026',
  type_sejour: null,
  type_a_verifier: false,
  actif: true,
}
const requete = (type: Requete['type']): Requete => ({
  id: 'req-1',
  recherche_id: 'rech-1',
  type,
  camp_id: 'camp-1',
  activite_id: null,
  donnees: {},
  tentatives: 1,
})
const entree = (programmes: unknown[]) => ({
  programmes,
  activites: [],
  photos_a_analyser: [],
  presence_web: {},
  fiche: { ville: null, region: null, types: [], hebergement: [] },
  resume: 'Essai.',
})
const programme = (v: Record<string, unknown>) => ({
  programme_id: null,
  description: null,
  duree_jours: 3,
  duree_nuits: 2,
  prix: 300,
  annee: '2027',
  source_url: 'https://exemple.test/tarifs',
  type_sejour: null,
  ...v,
})

// ---------------------------------------------------------------- invites
test('le schéma de l’outil demande le type de séjour de chaque programme', () => {
  const item = OUTIL_RESULTATS.input_schema.properties.programmes.items as {
    properties: Record<string, { enum?: unknown[] }>
    required: string[]
  }
  assert.deepEqual(TYPES_SEJOUR, ['camp_vacances', 'camp_familial', 'classe_nature', 'groupe'])
  assert.deepEqual(item.properties.type_sejour.enum, [...TYPES_SEJOUR, null])
  assert.ok(item.required.includes('type_sejour'))
})

test('les deux prompts décrivent les quatre types', () => {
  for (const systeme of [systemeVerification(''), systemeDocumentation('')]) {
    assert.match(systeme, /type_sejour/)
    for (const t of TYPES_SEJOUR) assert.ok(systeme.includes(`- ${t} :`), `${t} absent`)
  }
})

test('les programmes connus envoyés à Claude portent leur type', () => {
  const texte = inviteCamp(
    { nom: 'Camp essai', ville: null, region: null, site_web: null, facebook: null, instagram: null, tiktok: null },
    [
      { id: 'p1', nom: 'Classe verte', duree_jours: 3, duree_nuits: 2, prix: 300, annee: '2026', type_sejour: 'classe_nature' },
      { id: 'p2', nom: 'Séjour', duree_jours: 7, duree_nuits: 6, prix: 900, annee: '2026', type_sejour: null },
    ],
    [],
    '14 octobre 2026',
  )
  assert.match(texte, /\| type de séjour\)/)
  assert.match(texte, /- p1 \| Classe verte \|.*\| classe_nature$/m)
  assert.match(texte, /- p2 \| Séjour \|.*\| \?$/m)
})

test('typeSejour ne garde que les quatre valeurs permises', () => {
  assert.equal(typeSejour('classe_nature'), 'classe_nature')
  assert.equal(typeSejour('groupe'), 'groupe')
  assert.equal(typeSejour('accueil_groupe'), null)
  assert.equal(typeSejour('camp_jour'), null)
  assert.equal(typeSejour(null), null)
  assert.equal(typeSejour(3), null)
})

// ------------------------------------------------------------- traitement
test('vérification : un nouveau programme part dans « À valider » avec son type', async () => {
  const { ctx, ecritures } = baseSimulee({ camps: [CAMP], programmes: [CONNU], changements: [], camps_activites: [] })
  await traiterCamp(
    ctx,
    requete('verification'),
    entree([
      programme({ programme_id: 'prog-1', nom: 'Séjour régulier', prix: 900, duree_jours: 7, duree_nuits: 6, type_sejour: 'groupe' }),
      programme({ nom: 'Classe nature 3 jours', type_sejour: 'classe_nature' }),
      programme({ nom: 'Fin de semaine', type_sejour: 'inconnu' }),
    ]),
  )
  const nouveaux = ecritures.filter((e) => e.table === 'changements' && e.op === 'insert')
  assert.equal(nouveaux.length, 2)
  const details = nouveaux.map((e) => (e.valeurs as { type: string; details: { nom: string; type_sejour: string | null } }))
  assert.ok(details.every((d) => d.type === 'nouveau_programme'))
  assert.deepEqual(
    details.map((d) => [d.details.nom, d.details.type_sejour]),
    [
      ['Classe nature 3 jours', 'classe_nature'],
      ['Fin de semaine', null],
    ],
  )
  // Le programme connu (même prix) est seulement marqué vérifié : son type n'est pas touché.
  const majConnu = ecritures.filter((e) => e.table === 'programmes' && e.op === 'update')
  assert.equal(majConnu.length, 1)
  assert.deepEqual(Object.keys(majConnu[0].valeurs as object), ['verifie_le'])
  // Rien n'est ajouté directement aux programmes d'un camp suivi.
  assert.equal(ecritures.filter((e) => e.table === 'programmes' && e.op === 'insert').length, 0)
})

test('documentation (passe 2) : les programmes sont ajoutés avec leur type, à vérifier', async () => {
  const { ctx, ecritures } = baseSimulee({ camps: [CAMP], programmes: [], changements: [], camps_activites: [] })
  await traiterCamp(
    ctx,
    requete('documentation'),
    entree([
      programme({ nom: 'Séjour en famille', type_sejour: 'camp_familial' }),
      programme({ nom: 'Camp de jour', duree_nuits: 0, type_sejour: null }),
    ]),
  )
  const ajouts = ecritures.filter((e) => e.table === 'programmes' && e.op === 'insert').map((e) => e.valeurs as Record<string, unknown>)
  assert.deepEqual(
    ajouts.map((p) => [p.nom, p.type_sejour, p.type_a_verifier]),
    [
      ['Séjour en famille', 'camp_familial', true],
      ['Camp de jour', null, true],
    ],
  )
})
