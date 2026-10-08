import { useMemo, useState } from 'react'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { ui } from '@/lib/ui'
import { exerciceDe, libelleExercice, litsDe, prixMajore } from './calcul'
import { useDonnees } from './contexte'
import { argent, champPetit } from './format'
import { useAjouterProduit, useEnregistrerPrix, useModifierProduit } from './donnees'
import { CATEGORIES, FORFAITS, UNITES, type Categorie, type Unite } from './types'

/** Catalogue et liste de prix par exercice (remplace l'onglet « Liste de prix » du chiffrier). */
export function Catalogue() {
  const { produits, prix, catalogue, ecriture, auj } = useDonnees()
  const enregistrerPrix = useEnregistrerPrix()
  const modifierProduit = useModifierProduit()
  const exercices = useMemo(() => [...new Set([exerciceDe(auj), ...prix.map((p) => p.exercice)])].sort((a, b) => b - a), [prix, auj])
  const [exercice, setExercice] = useState(exercices[0])
  const [nouveau, setNouveau] = useState(false)
  const [inactifs, setInactifs] = useState(false)
  const prixDe = (id: string) => prix.find((p) => p.produit_id === id && p.exercice === exercice)
  const prixLit = catalogue.prix('LIT', exercice) ?? 0

  const copierVersSuivant = async () => {
    const suivant = Math.max(...exercices) + 1
    const ok = await confirmer({
      titre: `Préparer les prix de ${libelleExercice(suivant)} ?`,
      message: `Les prix de ${libelleExercice(exercice)} sont copiés tels quels vers ${libelleExercice(suivant)}, puis modifiables. Les estimés déjà faits ne changent pas.`,
      libelleOk: 'Copier',
      danger: false,
    })
    if (!ok) return
    for (const p of prix.filter((x) => x.exercice === exercice)) enregistrerPrix.mutate({ ...p, exercice: suivant })
    setExercice(suivant)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Exercice" className={champPetit} value={exercice} onChange={(e) => setExercice(Number(e.target.value))}>
          {exercices.map((x) => (
            <option key={x} value={x}>
              Prix {libelleExercice(x)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-pierre-600">
          <input type="checkbox" checked={inactifs} onChange={(e) => setInactifs(e.target.checked)} /> Produits retirés
        </label>
        {ecriture && (
          <div className="ml-auto flex gap-2">
            <button className={ui.boutonSecondaire} onClick={copierVersSuivant}>
              Préparer l'exercice suivant
            </button>
            <button className={ui.bouton} onClick={() => setNouveau(true)}>
              + Produit
            </button>
          </div>
        )}
      </div>
      <p className="text-sm text-pierre-500">
        Les prix sont copiés dans chaque estimé au moment où il est fait : les changer ici ne touche jamais un estimé existant. Sections d'hébergement : lits (Rooming) ×
        prix du lit.
      </p>

      {Object.entries(CATEGORIES).map(([cat, nomCat]) => {
        const siens = produits.filter((p) => p.categorie === cat && (inactifs || p.actif))
        if (!siens.length) return null
        return (
          <section key={cat} className={`${ui.carte} overflow-x-auto`}>
            <h2 className="border-b border-pierre-200 px-3 py-2 font-semibold">{nomCat}</h2>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-pierre-100">
                {siens.map((p) => {
                  const ligne = prixDe(p.id)
                  const section = p.etages?.length ? litsDe(p.etages, catalogue.etages) : null
                  const fournisseur = p.majoration !== null
                  return (
                    <tr key={p.id} className={p.actif ? '' : 'opacity-50'}>
                      <td className="w-32 whitespace-nowrap px-3 py-1.5 font-mono text-xs text-pierre-500">{p.code}</td>
                      <td className="px-3 py-1.5">
                        <div>
                          {p.nom}
                          {section && <span className="text-pierre-500"> ({section.lits} lits - {section.chambres} chambres)</span>}
                        </div>
                        <div className="text-xs text-pierre-400">
                          {UNITES[p.unite]}
                          {p.forfaits.length > 0 && ` · ${p.forfaits.map((f) => FORFAITS[f]).join(', ')}`}
                          {p.note_minimum && ` · ${p.note_minimum}`}
                          {p.systeme && ' · utilisé par le calcul'}
                        </div>
                      </td>
                      <td className="w-56 whitespace-nowrap px-3 py-1.5 text-right">
                        {section ? (
                          <span className="tabular-nums">{argent(section.lits * prixLit)}</span>
                        ) : fournisseur ? (
                          <span className="inline-flex items-center gap-1 text-xs text-pierre-500">
                            coût
                            <PrixSaisi
                              valeur={ligne?.cout ?? null}
                              disabled={!ecriture}
                              enregistrer={(cout) =>
                                enregistrerPrix.mutate({ produit_id: p.id, exercice, cout, prix: cout === null ? null : prixMajore(p, cout) })
                              }
                            />
                            → <span className="text-sm tabular-nums text-pierre-900">{ligne?.prix === null || ligne?.prix === undefined ? 'à définir' : argent(ligne.prix)}</span>
                          </span>
                        ) : (
                          <PrixSaisi
                            valeur={ligne?.prix ?? null}
                            disabled={!ecriture}
                            enregistrer={(v) => enregistrerPrix.mutate({ produit_id: p.id, exercice, prix: v, cout: ligne?.cout ?? null })}
                          />
                        )}
                      </td>
                      <td className="w-24 px-3 py-1.5 text-right">
                        {ecriture && !p.systeme && (
                          <button className="text-xs text-pierre-500 underline hover:text-pierre-800" onClick={() => modifierProduit.mutate({ id: p.id, champs: { actif: !p.actif } })}>
                            {p.actif ? 'Retirer' : 'Remettre'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )
      })}
      {nouveau && <NouveauProduit exercice={exercice} fermer={() => setNouveau(false)} />}
    </div>
  )
}

/** Prix saisi, enregistré à la sortie du champ (vide = à définir). */
function PrixSaisi({ valeur, enregistrer, disabled }: { valeur: number | null; enregistrer: (v: number | null) => void; disabled?: boolean }) {
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
      min={0}
      className={`${champPetit} w-28 text-right tabular-nums`}
      placeholder="à définir"
      disabled={disabled}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== texte && enregistrer(v === '' ? null : Number(v))}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

function NouveauProduit({ exercice, fermer }: { exercice: number; fermer: () => void }) {
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
            { id, code: p.code, nom: p.nom.trim(), categorie: p.categorie, unite: p.unite, forfaits: [], etages: null, majoration: null, ajout: null, arrondi: 'aucun', note_minimum: null, systeme: false, extra: true, actif: true, ordre: 500 },
            { onSuccess: () => p.prix !== '' && enregistrerPrix.mutate({ produit_id: id, exercice, prix: Number(p.prix), cout: null }) },
          )
          fermer()
        }}
      >
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className={ui.etiquette}>Code</span>
            <input autoFocus className={ui.champ} value={p.code} onChange={(e) => setP({ ...p, code: e.target.value.toUpperCase() })} placeholder="KAYAK" />
          </label>
          <label className="col-span-2 block">
            <span className={ui.etiquette}>Libellé (tel qu'imprimé sur l'estimé)</span>
            <input className={ui.champ} value={p.nom} onChange={(e) => setP({ ...p, nom: e.target.value })} />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-3">
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
