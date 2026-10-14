import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { BoutonModifier } from '@/lib/BoutonsAction'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { ui } from '@/lib/ui'
import { appliquerHausse, exerciceDe, hausse, libelleExercice, litsDe, margeParDefaut, prixFournisseur } from './calcul'
import { useDonnees } from './contexte'
import { argent, champPetit, dateCourte, dateLongue } from './format'
import { useAjouterProduit, useEnregistrerPrix, useEnregistrerPrixLot, useModifierProduit, usePreparerExercice, type PrixAEcrire } from './donnees'
import { CATEGORIES, FORFAITS, UNITES, type Categorie, type Prix, type Produit, type Unite } from './types'

// Liste de prix (remplace l'onglet « Liste de prix » du chiffrier ; révision
// du 2026-10-14 avec Charlotte) : un prix par produit et par exercice, avec
// sa dernière modification et son statut « à valider » / « validé » ; prix
// des fournisseurs = coût + marge ; historique d'une année à l'autre ;
// préparation de l'exercice suivant. Règle des prix provisoires : `resoudrePrix`.

type Statut = 'section' | 'valide' | 'a_valider' | 'a_definir'

const cleDe = (produit: string, ex: number) => `${produit}|${ex}`
const memePrix = (a: number, b: number) => Math.abs(a - b) < 0.00005
const nombre = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v))
const pourcentage = (n: number) => `${n > 0 ? '+' : ''}${String(n).replace('.', ',')} %`

/** Ligne écrite d'un coup par « Appliquer ce % » (et son annulation). */
type LignePrixLot = Pick<Prix, 'produit_id' | 'exercice' | 'prix' | 'cout' | 'marge' | 'hausse_pct' | 'repli'>
/** Jour local (AAAA-MM-JJ) d'un horodatage. */
const jourDe = (horodatage: string) => new Date(horodatage).toLocaleDateString('fr-CA')

function texteHausse(avant: number | null, apres: number | null) {
  const h = hausse(avant, apres)
  if (!h) return null
  if (memePrix(h.montant, 0)) return 'même prix'
  const signe = h.montant > 0 ? '+' : ''
  return `${signe}${argent(h.montant)}${h.pourcentage === null ? '' : ` · ${signe}${String(h.pourcentage).replace('.', ',')} %`}`
}

/** Liste de prix par exercice, historique et préparation de l'exercice suivant. */
export function Catalogue() {
  const { produits, prix, catalogue, ecriture, auj } = useDonnees()
  const [params, setParams] = useSearchParams()
  const preparer = usePreparerExercice()
  const lot = useEnregistrerPrixLot()
  const [pctLot, setPctLot] = useState('')
  const [annulation, setAnnulation] = useState<{ lignes: LignePrixLot[]; pct: number; exercice: number } | null>(null)
  const [nouveau, setNouveau] = useState(false)
  const [aModifier, setAModifier] = useState<Produit | null>(null)

  const courant = exerciceDe(auj)
  const avecPrix = useMemo(() => new Set(prix.map((p) => p.exercice)), [prix])
  const exercices = useMemo(() => [...new Set([courant, ...avecPrix])].sort((a, b) => b - a), [avecPrix, courant])
  const exercice = exercices.includes(Number(params.get('ex'))) ? Number(params.get('ex')) : courant
  const vue = params.get('vue') === 'historique' ? 'historique' : 'liste'
  const aValiderSeul = params.get('filtre') === 'a_valider'
  const retires = params.get('retires') === '1'
  const regler = (champs: Record<string, string | null>) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        for (const [k, v] of Object.entries(champs)) {
          if (v === null) n.delete(k)
          else n.set(k, v)
        }
        return n
      },
      { replace: true },
    )

  const parCle = useMemo(() => new Map(prix.map((x) => [cleDe(x.produit_id, x.exercice), x])), [prix])
  const ligneDe = (id: string, ex: number) => parCle.get(cleDe(id, ex))
  const precedent = avecPrix.has(exercice - 1) ? exercice - 1 : null
  const suivant = courant + 1
  // Liste préparée d'après l'exercice d'avant : ses nouvelles lignes ont le même repli.
  const preparee = prix.some((x) => x.exercice === exercice && x.repli !== null)
  const visibles = produits.filter((p) => retires || p.actif)
  const manquantes = preparee ? produits.filter((p) => p.actif && !p.etages?.length && !ligneDe(p.id, exercice)).length : 0

  const statutDe = (p: Produit): Statut => {
    if (p.etages?.length) return 'section'
    const l = ligneDe(p.id, exercice)
    if (!l || l.prix === null) return 'a_definir'
    return l.valide ? 'valide' : 'a_valider'
  }
  const nbAValider = visibles.filter((p) => !['section', 'valide'].includes(statutDe(p))).length
  const affiches = visibles.filter((p) => !aValiderSeul || !['section', 'valide'].includes(statutDe(p)))

  // « + % » (liste préparée) : lignes affichées, hors sections et prix validés, qui ont un prix ou un coût d'avant.
  const avecHausse = preparee && precedent !== null
  const cibles = avecHausse
    ? affiches.filter((p) => {
        if (p.etages?.length || statutDe(p) === 'valide') return false
        const a = ligneDe(p.id, precedent)
        return !!a && (a.prix !== null || a.cout !== null)
      })
    : []
  const appliquerLot = async () => {
    const pct = Number(pctLot.replace(',', '.'))
    if (precedent === null || pctLot.trim() === '' || !Number.isFinite(pct) || pct <= -100 || !cibles.length) return
    const ok = await confirmer({
      titre: `Appliquer ${pourcentage(pct)} à ${cibles.length} ligne${cibles.length > 1 ? 's' : ''} de ${libelleExercice(exercice)} ?`,
      message: `Prix ${libelleExercice(exercice)} = prix ${libelleExercice(precedent)} × ${String(1 + pct / 100).replace('.', ',')}, arrondi au cent ; produits de fournisseurs : le % s'applique au coût, la marge est gardée. Les prix déjà validés ne sont pas touchés ; les autres restent « à valider ». « Annuler » remet ces lignes comme avant.`,
      libelleOk: 'Appliquer',
      danger: false,
    })
    if (!ok) return
    const avant: LignePrixLot[] = []
    const apres: LignePrixLot[] = []
    for (const p of cibles) {
      const l = ligneDe(p.id, exercice)
      const a = ligneDe(p.id, precedent)!
      const repli = l ? l.repli : exercice - 1
      avant.push({ produit_id: p.id, exercice, prix: l?.prix ?? null, cout: l?.cout ?? null, marge: l?.marge ?? null, hausse_pct: l?.hausse_pct ?? null, repli })
      apres.push({ produit_id: p.id, exercice, ...appliquerHausse({ prix: nombre(a.prix), cout: nombre(a.cout), marge: nombre(a.marge) }, pct, p), hausse_pct: pct, repli })
    }
    lot.mutate(apres, { onSuccess: () => setAnnulation({ lignes: avant, pct, exercice }) })
  }

  const lancerPreparation = async (ex: number, completer = false) => {
    const ok = await confirmer({
      titre: completer ? `Ajouter les produits manquants à ${libelleExercice(ex)} ?` : `Préparer la liste de prix ${libelleExercice(ex)} ?`,
      message: `Chaque produit ${completer ? 'qui n’y est pas encore ' : ''}reçoit une ligne ${libelleExercice(ex)} vide et « à valider », avec le prix de ${libelleExercice(ex - 1)} affiché à côté. Tant qu’un prix ${libelleExercice(ex)} n’est pas validé, un estimé pour un séjour ${libelleExercice(ex)} prend celui de ${libelleExercice(ex - 1)}, marqué « provisoire ». Les estimés déjà faits ne changent pas.`,
      libelleOk: completer ? 'Ajouter' : 'Préparer',
      danger: false,
    })
    if (ok) preparer.mutate(ex, { onSuccess: () => regler({ ex: String(ex), vue: null }) })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-pierre-300 bg-white p-0.5 text-sm" role="group" aria-label="Vue">
          {(['liste', 'historique'] as const).map((v) => (
            <button
              key={v}
              aria-pressed={vue === v}
              className={`rounded-md px-3 py-1 ${vue === v ? 'bg-foret-700 text-white' : 'text-pierre-700 hover:bg-pierre-50'}`}
              onClick={() => regler({ vue: v === 'liste' ? null : v })}
            >
              {v === 'liste' ? 'Liste de prix' : 'Historique'}
            </button>
          ))}
        </div>
        {vue === 'liste' && (
          <select aria-label="Exercice" className={champPetit} value={exercice} onChange={(e) => regler({ ex: e.target.value })}>
            {exercices.map((x) => (
              <option key={x} value={x}>
                Prix {libelleExercice(x)}
                {x === courant ? ' (en cours)' : ''}
              </option>
            ))}
          </select>
        )}
        {vue === 'liste' && (
          <label className={`flex items-center gap-1.5 text-sm ${nbAValider ? 'text-red-700' : 'text-pierre-600'}`}>
            <input type="checkbox" checked={aValiderSeul} onChange={(e) => regler({ filtre: e.target.checked ? 'a_valider' : null })} /> À valider ({nbAValider})
          </label>
        )}
        <label className="flex items-center gap-1.5 text-sm text-pierre-600">
          <input type="checkbox" checked={retires} onChange={(e) => regler({ retires: e.target.checked ? '1' : null })} /> Produits retirés
        </label>
        {ecriture && (
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            {!avecPrix.has(suivant) && (
              <button className={ui.boutonSecondaire} disabled={preparer.isPending} onClick={() => lancerPreparation(suivant)}>
                Préparer {libelleExercice(suivant)}
              </button>
            )}
            {vue === 'liste' && manquantes > 0 && (
              <button className={ui.boutonSecondaire} disabled={preparer.isPending} onClick={() => lancerPreparation(exercice, true)}>
                Ajouter les produits manquants ({manquantes})
              </button>
            )}
            <button className={ui.bouton} onClick={() => setNouveau(true)}>
              + Produit
            </button>
          </div>
        )}
      </div>
      {vue === 'liste' && avecHausse && ecriture && precedent !== null && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-pierre-200 bg-pierre-50 px-3 py-2 text-sm text-pierre-700">
          <span>
            Hausse de {libelleExercice(exercice)} sur {libelleExercice(precedent)} :
          </span>
          <span className="inline-flex items-center gap-1">
            +
            <input
              type="number"
              step="any"
              aria-label="Pourcentage à appliquer aux lignes affichées"
              className={`${champPetit} w-20 text-right tabular-nums`}
              placeholder="%"
              value={pctLot}
              onChange={(e) => setPctLot(e.target.value)}
            />
            %
          </span>
          <button className={ui.boutonSecondaire} disabled={!cibles.length || pctLot.trim() === '' || lot.isPending} onClick={appliquerLot}>
            Appliquer aux {cibles.length} ligne{cibles.length > 1 ? 's' : ''} affichée{cibles.length > 1 ? 's' : ''}
          </button>
          {annulation && annulation.exercice === exercice && (
            <button
              className="text-sm text-pierre-600 underline hover:text-pierre-900"
              disabled={lot.isPending}
              onClick={() => lot.mutate(annulation.lignes, { onSuccess: () => setAnnulation(null) })}
            >
              Annuler ({pourcentage(annulation.pct)} sur {annulation.lignes.length} ligne{annulation.lignes.length > 1 ? 's' : ''})
            </button>
          )}
          <span className="text-xs text-pierre-500">Les prix validés ne sont pas touchés. Chaque ligne a aussi son « + % ».</span>
        </div>
      )}
      <p className="text-sm text-pierre-500">
        Les prix sont copiés dans chaque estimé au moment où il est fait : les changer ici ne touche jamais un estimé existant. Un prix changé redevient « à
        valider ». {preparee ? `Tant qu’un prix ${libelleExercice(exercice)} n’est pas validé, les estimés de ${libelleExercice(exercice)} prennent celui de ${libelleExercice(exercice - 1)} (marqué « provisoire »). ` : ''}
        Sections d'hébergement : lits (Rooming) × prix du lit.
      </p>

      {vue === 'historique' ? (
        <Historique produits={visibles} />
      ) : (
        Object.entries(CATEGORIES).map(([cat, nomCat]) => {
          const siens = affiches.filter((p) => p.categorie === cat)
          if (!siens.length) return null
          return (
            <section key={cat} className={`${ui.carte} @container`}>
              <h2 className="border-b border-pierre-200 px-3 py-2 font-semibold">{nomCat}</h2>
              <div className="hidden gap-x-3 border-b border-pierre-100 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-pierre-500 @4xl:grid @4xl:grid-cols-[6rem_minmax(0,1fr)_6rem_8rem_7.5rem_8.5rem_8rem_2rem]">
                <span>Code</span>
                <span>Produit</span>
                <span className="text-right">{precedent ? libelleExercice(precedent) : ''}</span>
                <span className="text-right">{libelleExercice(exercice)}</span>
                <span className="text-right">{precedent ? (avecHausse ? '+ % · hausse' : 'Hausse') : ''}</span>
                <span>Statut</span>
                <span>Mise à jour</span>
                <span />
              </div>
              <div className="divide-y divide-pierre-100">
                {siens.map((p) => (
                  <LignePrix
                    key={p.id}
                    p={p}
                    exercice={exercice}
                    precedent={precedent}
                    preparee={preparee}
                    avecHausse={avecHausse}
                    ligne={ligneDe(p.id, exercice)}
                    avant={precedent ? ligneDe(p.id, precedent) : undefined}
                    statut={statutDe(p)}
                    prixLit={catalogue.prix('LIT', exercice)}
                    prixLitAvant={precedent ? (catalogue.prix('LIT', precedent) ?? null) : null}
                    modifier={() => setAModifier(p)}
                  />
                ))}
              </div>
            </section>
          )
        })
      )}
      {vue === 'liste' && aValiderSeul && nbAValider === 0 && <p className="py-6 text-center text-sm text-pierre-500">Tous les prix de {libelleExercice(exercice)} sont validés.</p>}
      {nouveau && <NouveauProduit exercice={exercice} preparee={preparee} fermer={() => setNouveau(false)} />}
      {aModifier && <ModifierProduit p={aModifier} fermer={() => setAModifier(null)} />}
    </div>
  )
}

function LignePrix({
  p,
  exercice,
  precedent,
  preparee,
  avecHausse,
  ligne,
  avant,
  statut,
  prixLit,
  prixLitAvant,
  modifier,
}: {
  p: Produit
  exercice: number
  precedent: number | null
  preparee: boolean
  avecHausse: boolean
  ligne: Prix | undefined
  avant: Prix | undefined
  statut: Statut
  prixLit: number | null
  prixLitAvant: number | null
  modifier: () => void
}) {
  const { catalogue, ecriture, auj, infoPrix } = useDonnees()
  const enregistrer = useEnregistrerPrix()
  const section = p.etages?.length ? litsDe(p.etages, catalogue.etages) : null
  const fournisseur = p.majoration !== null && !section
  const margeDefaut = margeParDefaut(p.majoration) ?? 15
  const marge = ligne?.marge === null || ligne?.marge === undefined ? margeDefaut : Number(ligne.marge)
  const cout = ligne?.cout === null || ligne?.cout === undefined ? null : Number(ligne.cout)
  const prixClient = ligne?.prix === null || ligne?.prix === undefined ? null : Number(ligne.prix)
  const calcule = fournisseur && cout !== null ? prixFournisseur(cout, marge, p) : null
  const arrondiMain = calcule !== null && prixClient !== null && !memePrix(prixClient, calcule)
  const prixAvant = section ? (prixLitAvant === null ? null : section.lits * prixLitAvant) : avant?.prix === null || avant?.prix === undefined ? null : Number(avant.prix)
  const prixCourant = section ? (prixLit === null ? null : section.lits * prixLit) : prixClient
  const info = section ? infoPrix('LIT', exercice) : infoPrix(p.code, exercice)
  const rouge = statut === 'a_valider' || statut === 'a_definir'
  // « + % » sur l'exercice d'avant (liste préparée) ; un prix différent du calcul = ajusté à la main.
  const base = { prix: nombre(avant?.prix), cout: nombre(avant?.cout), marge: nombre(avant?.marge) }
  const peutHausse = avecHausse && !section && (base.prix !== null || base.cout !== null)
  const pct = nombre(ligne?.hausse_pct)
  const attendu = peutHausse && pct !== null ? appliquerHausse(base, pct, p) : null
  const ajusteMain = attendu?.prix != null && prixClient !== null && !memePrix(prixClient, attendu.prix)

  // Une ligne créée ici suit la liste : repli si la liste a été préparée, marge par défaut.
  const ecrire = (champs: Omit<PrixAEcrire, 'produit_id' | 'exercice'>) =>
    enregistrer.mutate({
      produit_id: p.id,
      exercice,
      ...(ligne ? {} : { repli: preparee ? exercice - 1 : null, ...(fournisseur ? { marge: margeDefaut } : {}) }),
      ...champs,
    })

  const titreMaj = ligne
    ? `Modifié le ${dateLongue(jourDe(ligne.modifie_le))}${ligne.modifie_par_nom ? ` par ${ligne.modifie_par_nom}` : ''}${
        ligne.valide && ligne.valide_le ? ` · validé le ${dateLongue(jourDe(ligne.valide_le))}${ligne.valide_par_nom ? ` par ${ligne.valide_par_nom}` : ''}` : ''
      }`
    : undefined

  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2 text-sm @4xl:grid-cols-[6rem_minmax(0,1fr)_6rem_8rem_7.5rem_8.5rem_8rem_2rem] ${
        rouge ? 'bg-red-50/70' : ''
      } ${p.actif ? '' : 'opacity-50'}`}
    >
      <span className="hidden truncate font-mono text-xs text-pierre-500 @4xl:block" title={p.code}>
        {p.code}
      </span>
      <div className="col-span-2 min-w-0 @4xl:col-span-1">
        <div className={rouge ? 'text-red-800' : ''}>
          {p.nom}
          {section && (
            <span className="text-pierre-500">
              {' '}
              ({section.lits} lits - {section.chambres} chambres)
            </span>
          )}
        </div>
        <div className="text-xs text-pierre-400">
          <span className="font-mono @4xl:hidden">{p.code} · </span>
          {UNITES[p.unite]}
          {p.forfaits.length > 0 && ` · ${p.forfaits.map((f) => FORFAITS[f]).join(', ')}`}
          {p.note_minimum && ` · ${p.note_minimum}`}
          {p.fournisseur && ` · ${p.fournisseur}`}
          {p.systeme && ' · utilisé par le calcul'}
        </div>
      </div>

      <span className="text-xs text-pierre-500 @4xl:text-right @4xl:text-sm @4xl:tabular-nums" title={avant?.cout != null ? `Coût ${argent(avant.cout)} + ${String(avant.marge ?? margeDefaut).replace('.', ',')} %` : undefined}>
        {precedent !== null && (
          <>
            <span className="@4xl:hidden">{libelleExercice(precedent)} : </span>
            {argent(prixAvant)}
          </>
        )}
      </span>

      <div className="flex flex-col items-end gap-0.5">
        {section ? (
          <span className={`tabular-nums ${info.provisoire ? 'text-amber-800' : ''}`} title={`${section.lits} lits × ${argent(prixLit)}`}>
            {argent(prixCourant)}
          </span>
        ) : (
          <PrixSaisi
            libelle={`Prix ${libelleExercice(exercice)} : ${p.nom}`}
            valeur={prixClient}
            disabled={!ecriture}
            rouge={rouge}
            enregistrer={(v) => ecrire({ prix: v })}
          />
        )}
        {ecriture && !section && prixClient === null && avant?.prix != null && precedent !== null && (
          <button
            className="text-xs text-foret-700 underline hover:text-foret-900"
            title={`Reprendre le prix de ${libelleExercice(precedent)}`}
            onClick={() =>
              ecrire({ prix: Number(avant.prix), ...(fournisseur ? { cout: avant.cout === null ? null : Number(avant.cout), marge: avant.marge === null ? margeDefaut : Number(avant.marge) } : {}) })
            }
          >
            = {libelleExercice(precedent)}
          </button>
        )}
        {ajusteMain && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900" title={`Calculé avec ${pourcentage(pct!)} : ${argent(attendu!.prix)}`}>
            ajusté à la main ({prixClient! > attendu!.prix! ? '+' : ''}
            {argent(prixClient! - attendu!.prix!)})
          </span>
        )}
      </div>

      <div className="flex flex-col items-start gap-0.5 text-xs text-pierre-500 @4xl:items-end">
        {peutHausse && ecriture ? (
          <span className="inline-flex items-center gap-1 text-pierre-700">
            +
            <PrixSaisi
              libelle={`Hausse en % sur ${libelleExercice(precedent!)} : ${p.nom}`}
              valeur={pct}
              placeholder="%"
              petit
              largeur="w-16"
              min={-99}
              enregistrer={(v) => ecrire(v === null ? { hausse_pct: null } : { hausse_pct: v, ...appliquerHausse(base, v, p) })}
            />
            %
          </span>
        ) : (
          pct !== null && <span className="text-pierre-700">{pourcentage(pct)} appliqué</span>
        )}
        {precedent !== null && <span>{texteHausse(prixAvant, prixCourant)}</span>}
      </div>

      <div className="flex flex-col items-end gap-0.5 @4xl:items-start">
        {statut === 'section' ? (
          <span className="text-xs text-pierre-500">suit le prix du lit</span>
        ) : statut === 'valide' ? (
          <button
            className="rounded-full border border-foret-300 bg-foret-50 px-2 py-0.5 text-xs font-medium text-foret-800 enabled:hover:border-foret-500"
            disabled={!ecriture}
            title={ecriture ? `${titreMaj ?? ''} — cliquer pour le remettre à valider` : titreMaj}
            onClick={() => ecrire({ valide: false })}
          >
            ✓ Validé
          </button>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">{statut === 'a_valider' ? 'À valider' : 'À définir'}</span>
            {ecriture && statut === 'a_valider' && (
              <button className="rounded-md border border-foret-600 bg-white px-2 py-0.5 text-xs font-medium text-foret-800 hover:bg-foret-50" onClick={() => ecrire({ valide: true })}>
                Valider
              </button>
            )}
          </span>
        )}
        {statut !== 'valide' && statut !== 'section' && info.prix !== null && (info.exercice !== exercice || prixClient === null) && (
          <span className="text-[11px] text-amber-800" title="Prix pris par les estimés en attendant (provisoire)">
            estimés : {argent(info.prix)} ({libelleExercice(info.exercice!)})
          </span>
        )}
      </div>

      <span className="text-xs text-pierre-500" title={titreMaj}>
        {ligne ? (
          <>
            {dateCourte(jourDe(ligne.modifie_le), auj)}
            {ligne.modifie_par_nom && ` · ${ligne.modifie_par_nom}`}
          </>
        ) : (
          '—'
        )}
      </span>

      <div className="flex justify-end">
        {ecriture && (
          <BoutonModifier className="border-transparent! px-1.5!" title="Modifier le produit" onClick={modifier}>
            <span className="sr-only">Modifier le produit</span>
          </BoutonModifier>
        )}
      </div>

      {fournisseur && (
        <div className="col-span-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-pierre-600 @4xl:col-span-7 @4xl:col-start-2">
          <span>Coût fournisseur</span>
          <PrixSaisi
            libelle={`Coût fournisseur ${libelleExercice(exercice)} : ${p.nom}`}
            valeur={cout}
            disabled={!ecriture}
            petit
            enregistrer={(c) => ecrire({ cout: c, marge, prix: c === null ? null : prixFournisseur(c, marge, p) })}
          />
          <span>+ marge</span>
          <PrixSaisi
            libelle={`Marge ${libelleExercice(exercice)} : ${p.nom}`}
            valeur={ligne?.marge === null || ligne?.marge === undefined ? null : marge}
            placeholder={String(margeDefaut).replace('.', ',')}
            disabled={!ecriture}
            petit
            enregistrer={(m) => ecrire({ marge: m ?? margeDefaut, ...(cout !== null ? { prix: prixFournisseur(cout, m ?? margeDefaut, p) } : {}) })}
          />
          <span>%</span>
          {p.ajout !== null && Number(p.ajout) !== 0 && <span>+ {argent(p.ajout)}</span>}
          {calcule !== null && (
            <span>
              = <span className="tabular-nums text-pierre-800">{argent(calcule)}</span>
              {p.arrondi === 'dollar_superieur' && ' (arrondi au dollar)'}
            </span>
          )}
          {arrondiMain && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">
              arrondi à la main : {argent(prixClient)} ({prixClient! > calcule! ? '+' : ''}
              {argent(prixClient! - calcule!)})
            </span>
          )}
          {cout === null && <span className="text-pierre-400">coût à entrer (prix client calculé ensuite)</span>}
        </div>
      )}
    </div>
  )
}

/** Prix de chaque produit par exercice et hausse d'une année à l'autre (pour expliquer les hausses aux écoles). */
function Historique({ produits }: { produits: Produit[] }) {
  const { prix, catalogue } = useDonnees()
  const exercices = useMemo(() => [...new Set(prix.map((p) => p.exercice))].sort((a, b) => a - b), [prix])
  const parCle = useMemo(() => new Map(prix.map((x) => [cleDe(x.produit_id, x.exercice), x])), [prix])
  const litDe = useMemo(() => {
    const lit = produits.find((p) => p.code === 'LIT') ?? null
    return (ex: number) => {
      const l = lit ? parCle.get(cleDe(lit.id, ex)) : undefined
      return l?.prix === null || l?.prix === undefined ? null : { prix: Number(l.prix), valide: l.valide }
    }
  }, [produits, parCle])

  const valeur = (p: Produit, ex: number): { prix: number; valide: boolean } | null => {
    if (p.etages?.length) {
      const lit = litDe(ex)
      return lit ? { prix: litsDe(p.etages, catalogue.etages).lits * lit.prix, valide: lit.valide } : null
    }
    const l = parCle.get(cleDe(p.id, ex))
    return l?.prix === null || l?.prix === undefined ? null : { prix: Number(l.prix), valide: l.valide }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-pierre-500">
        Prix de chaque exercice tels qu'ils sont dans la liste, et la hausse par rapport à l'année d'avant. En rouge : pas encore validé. Sections : lits
        d'aujourd'hui × prix du lit de l'exercice (le chiffrier de 2025-26 avait parfois des montants tapés à la main).
      </p>
      {Object.entries(CATEGORIES).map(([cat, nomCat]) => {
        const siens = produits.filter((p) => p.categorie === cat)
        if (!siens.length) return null
        return (
          <section key={cat} className={`${ui.carte} overflow-x-auto`}>
            <h2 className="border-b border-pierre-200 px-3 py-2 font-semibold">{nomCat}</h2>
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-pierre-500">
                <tr className="border-b border-pierre-100">
                  <th className="px-3 py-1.5 font-medium">Produit</th>
                  {exercices.map((ex) => (
                    <th key={ex} className="w-36 px-3 py-1.5 text-right font-medium">
                      {libelleExercice(ex)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-pierre-100">
                {siens.map((p) => (
                  <tr key={p.id} className={p.actif ? 'align-top' : 'align-top opacity-50'}>
                    <td className="px-3 py-1.5">
                      <div>{p.nom}</div>
                      <div className="font-mono text-xs text-pierre-400">{p.code}</div>
                    </td>
                    {exercices.map((ex, i) => {
                      const v = valeur(p, ex)
                      const avant = i > 0 ? valeur(p, exercices[i - 1]) : null
                      const h = i > 0 ? texteHausse(avant?.prix ?? null, v?.prix ?? null) : null
                      return (
                        <td key={ex} className="px-3 py-1.5 text-right tabular-nums">
                          <div className={v && !v.valide ? 'text-red-700' : ''} title={v && !v.valide ? 'À valider' : undefined}>
                            {v ? argent(v.prix) : '—'}
                          </div>
                          {h && <div className="text-xs text-pierre-500">{h}</div>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}
    </div>
  )
}

/** Prix saisi, enregistré à la sortie du champ (vide = à définir). */
function PrixSaisi({
  valeur,
  enregistrer,
  disabled,
  libelle,
  placeholder = 'à définir',
  petit,
  rouge,
  largeur,
  min = 0,
}: {
  valeur: number | null
  enregistrer: (v: number | null) => void
  disabled?: boolean
  libelle: string
  placeholder?: string
  petit?: boolean
  rouge?: boolean
  /** Largeur Tailwind du champ (sinon celle d'un prix). */
  largeur?: string
  min?: number
}) {
  const texte = valeur === null ? '' : String(Number(valeur))
  const [v, setV] = useState(texte)
  const [base, setBase] = useState(texte)
  if (texte !== base) {
    setBase(texte)
    setV(texte)
  }
  return (
    <input
      type="number"
      step="any"
      min={min}
      aria-label={libelle}
      className={`${champPetit} ${largeur ?? (petit ? 'w-24' : 'w-28')} ${petit ? 'py-1 text-xs' : ''} text-right tabular-nums ${rouge ? 'border-red-300 text-red-800' : ''}`}
      placeholder={placeholder}
      disabled={disabled}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== texte && enregistrer(v === '' ? null : Number(v))}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

function NouveauProduit({ exercice, preparee, fermer }: { exercice: number; preparee: boolean; fermer: () => void }) {
  const { produits } = useDonnees()
  const ajouter = useAjouterProduit()
  const enregistrerPrix = useEnregistrerPrix()
  const [p, setP] = useState({ code: '', nom: '', categorie: 'service' as Categorie, unite: 'par_personne' as Unite, prix: '' })
  const codeValide = /^[A-Z0-9][A-Z0-9:._-]*$/.test(p.code) && !produits.some((x) => x.code === p.code)
  return (
    <Dialogue titre="Nouveau produit" fermer={fermer}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!codeValide || !p.nom.trim()) return
          const id = crypto.randomUUID()
          ajouter.mutate(
            {
              id,
              code: p.code,
              nom: p.nom.trim(),
              categorie: p.categorie,
              unite: p.unite,
              forfaits: [],
              etages: null,
              majoration: null,
              ajout: null,
              arrondi: 'aucun',
              fournisseur: null,
              note_minimum: null,
              systeme: false,
              extra: true,
              actif: true,
              ordre: 500,
            },
            {
              onSuccess: () =>
                p.prix !== '' && enregistrerPrix.mutate({ produit_id: id, exercice, prix: Number(p.prix), repli: preparee ? exercice - 1 : null }),
            },
          )
          fermer()
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className={ui.etiquette}>Code</span>
            <input autoFocus className={ui.champ} value={p.code} onChange={(e) => setP({ ...p, code: e.target.value.toUpperCase() })} placeholder="KAYAK" />
          </label>
          <label className="block sm:col-span-2">
            <span className={ui.etiquette}>Libellé (tel qu'imprimé sur l'estimé)</span>
            <input className={ui.champ} value={p.nom} onChange={(e) => setP({ ...p, nom: e.target.value })} />
          </label>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className={ui.etiquette}>Catégorie</span>
            <select className={ui.champ} value={p.categorie} onChange={(e) => setP({ ...p, categorie: e.target.value as Categorie })}>
              {Object.entries(CATEGORIES).map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={ui.etiquette}>Unité</span>
            <select className={ui.champ} value={p.unite} onChange={(e) => setP({ ...p, unite: e.target.value as Unite })}>
              {Object.entries(UNITES).map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={ui.etiquette}>Prix {libelleExercice(exercice)}</span>
            <input type="number" step="any" min={0} className={ui.champ} value={p.prix} onChange={(e) => setP({ ...p, prix: e.target.value })} />
          </label>
        </div>
        <p className="text-xs text-pierre-500">Prix d'un fournisseur (coût + marge) : à régler ensuite avec « Modifier le produit ». Le prix entré est « à valider ».</p>
        {p.code && !codeValide && <p className="text-xs text-red-700">Code en majuscules, chiffres, « - », « _ » ou « : », pas déjà pris.</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button className={ui.bouton} disabled={!codeValide || !p.nom.trim()}>
            Ajouter
          </button>
        </div>
      </form>
    </Dialogue>
  )
}

/** Libellé, unité, fournisseur et règle de prix d'un produit (la marge de chaque prix reste la sienne). */
function ModifierProduit({ p, fermer }: { p: Produit; fermer: () => void }) {
  const modifier = useModifierProduit()
  const [f, setF] = useState({
    nom: p.nom,
    categorie: p.categorie,
    unite: p.unite,
    note_minimum: p.note_minimum ?? '',
    fournisseur: p.fournisseur ?? '',
    externe: p.majoration !== null,
    marge: String(margeParDefaut(p.majoration) ?? 15),
    ajout: p.ajout === null ? '' : String(Number(p.ajout)),
    arrondi: p.arrondi,
  })
  const marge = Number(f.marge.replace(',', '.'))
  const valide = f.nom.trim() !== '' && (!f.externe || (Number.isFinite(marge) && marge > -100))
  const section = !!p.etages?.length
  return (
    <Dialogue titre={`Modifier ${p.code}`} fermer={fermer}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!valide) return
          modifier.mutate({
            id: p.id,
            champs: {
              nom: f.nom.trim(),
              categorie: f.categorie,
              unite: f.unite,
              note_minimum: f.note_minimum.trim() || null,
              fournisseur: f.fournisseur.trim() || null,
              majoration: f.externe ? Math.round((1 + marge / 100) * 10_000) / 10_000 : null,
              ajout: f.externe && f.ajout.trim() !== '' ? Number(f.ajout.replace(',', '.')) : null,
              arrondi: f.externe ? f.arrondi : 'aucun',
            },
          })
          fermer()
        }}
      >
        <label className="block">
          <span className={ui.etiquette}>Libellé (tel qu'imprimé sur l'estimé)</span>
          <input autoFocus className={ui.champ} value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={ui.etiquette}>Catégorie</span>
            <select className={ui.champ} value={f.categorie} onChange={(e) => setF({ ...f, categorie: e.target.value as Categorie })}>
              {Object.entries(CATEGORIES).map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={ui.etiquette}>Unité</span>
            <select className={ui.champ} value={f.unite} onChange={(e) => setF({ ...f, unite: e.target.value as Unite })}>
              {Object.entries(UNITES).map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={ui.etiquette}>Note de minimum</span>
            <input className={ui.champ} value={f.note_minimum} onChange={(e) => setF({ ...f, note_minimum: e.target.value })} placeholder="Min 30 personnes" />
          </label>
          <label className="block">
            <span className={ui.etiquette}>Fournisseur</span>
            <input className={ui.champ} value={f.fournisseur} onChange={(e) => setF({ ...f, fournisseur: e.target.value })} placeholder="Facultatif" />
          </label>
        </div>
        {!section && (
          <fieldset className="space-y-2 rounded-lg border border-pierre-200 p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.externe} onChange={(e) => setF({ ...f, externe: e.target.checked })} />
              Prix d'un fournisseur externe : coût + marge → prix client
            </label>
            {f.externe && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className={ui.etiquette}>Marge par défaut (%)</span>
                  <input type="number" step="any" className={ui.champ} value={f.marge} onChange={(e) => setF({ ...f, marge: e.target.value })} />
                </label>
                <label className="block">
                  <span className={ui.etiquette}>Ajout ($)</span>
                  <input type="number" step="any" className={ui.champ} value={f.ajout} onChange={(e) => setF({ ...f, ajout: e.target.value })} placeholder="0" />
                </label>
                <label className="block">
                  <span className={ui.etiquette}>Arrondi</span>
                  <select className={ui.champ} value={f.arrondi} onChange={(e) => setF({ ...f, arrondi: e.target.value as Produit['arrondi'] })}>
                    <option value="aucun">Au cent</option>
                    <option value="dollar_superieur">Au dollar supérieur</option>
                  </select>
                </label>
              </div>
            )}
            <p className="text-xs text-pierre-500">La marge par défaut sert aux nouveaux prix ; chaque prix déjà entré garde la sienne (modifiable sur sa ligne).</p>
          </fieldset>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {!p.systeme ? (
            <button
              type="button"
              className="text-sm text-pierre-600 underline hover:text-pierre-900"
              onClick={() => {
                modifier.mutate({ id: p.id, champs: { actif: !p.actif } })
                fermer()
              }}
            >
              {p.actif ? 'Retirer du catalogue' : 'Remettre au catalogue'}
            </button>
          ) : (
            <span className="text-xs text-pierre-500">Produit du calcul : jamais retiré.</span>
          )}
          <div className="flex gap-2">
            <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
              Annuler
            </button>
            <button className={ui.bouton} disabled={!valide}>
              Enregistrer
            </button>
          </div>
        </div>
      </form>
    </Dialogue>
  )
}
