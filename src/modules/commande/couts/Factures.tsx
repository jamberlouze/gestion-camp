import { useMemo, useState } from 'react'
import { BoutonSupprimer } from '@/lib/BoutonsAction'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { aujourdhui } from '@/shell/pokes'
import { anneeDe, argent, cents, intervalle, intervalleDe, jourFacture, jourLong, lireMontant, montantChamp, moisDeLAnnee, type Intervalle } from './calcul'
import { useCouts } from './contexte'
import { useEnregistrerFacture, useSupprimerFacture } from './donnees'
import type { Facture, Semaine } from './types'

/** Factures de nourriture de l'année (comptées au jour d'imputation, sinon de livraison). */
export function Factures() {
  const { annee, semaines, factures, ecriture } = useCouts()
  const [filtre, setFiltre] = useState('')
  const [recherche, setRecherche] = useState('')
  const [fenetre, setFenetre] = useState<{ facture?: Facture } | null>(null)

  const mois = moisDeLAnnee(annee.annee)
  const choix: Intervalle[] = [...mois, ...semaines]
  const choisi = choix.find((i) => i.id === filtre)
  const fournisseurs = useMemo(() => [...new Set(factures.map((f) => f.fournisseur))].sort((a, b) => a.localeCompare(b, 'fr')), [factures])

  const mot = recherche.trim().toLocaleLowerCase('fr-CA')
  const liste = factures
    .filter((f) => anneeDe(jourFacture(f)) === annee.annee)
    .filter((f) => !choisi || (choisi.debut <= jourFacture(f) && jourFacture(f) <= choisi.fin))
    .filter((f) => !mot || `${f.fournisseur} ${f.note}`.toLocaleLowerCase('fr-CA').includes(mot))
    .sort((a, b) => jourFacture(b).localeCompare(jourFacture(a)) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  const total = cents(liste.reduce((t, f) => t + f.montant, 0))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className={`${ui.champ} w-auto`} value={filtre} onChange={(e) => setFiltre(e.target.value)} aria-label="Mois ou semaine">
          <option value="">Toute l'année</option>
          <optgroup label="Mois">
            {mois.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </optgroup>
          {semaines.length > 0 && (
            <optgroup label="Camp d'été">
              {semaines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom} ({intervalle(p.debut, p.fin)})
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <input
          className={`${ui.champ} w-56`}
          placeholder="Fournisseur ou note…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          aria-label="Chercher"
        />
        <p className="text-sm text-pierre-600">
          {liste.length} facture{liste.length > 1 ? 's' : ''} · <span className="font-semibold tabular-nums">{argent(total)}</span>
        </p>
        {ecriture && (
          <button className={`${ui.bouton} ml-auto`} onClick={() => setFenetre({})}>
            + Facture
          </button>
        )}
      </div>

      {liste.length === 0 ? (
        <p className={`${ui.carte} p-6 text-sm text-pierre-500`}>Aucune facture.</p>
      ) : (
        <div className={`${ui.carte} max-w-5xl overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className="border-b border-pierre-200 bg-pierre-50 text-left text-xs uppercase tracking-wide text-pierre-500">
              <tr>
                <th className="px-3 py-2 font-medium">Livraison</th>
                <th className="px-3 py-2 font-medium">Fournisseur</th>
                <th className="px-3 py-2 text-right font-medium">Montant</th>
                <th className="px-3 py-2 font-medium">Compte le</th>
                <th className="px-3 py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pierre-100">
              {liste.map((f) => (
                <tr
                  key={f.id}
                  className={ecriture ? 'cursor-pointer hover:bg-pierre-50' : ''}
                  onClick={() => ecriture && setFenetre({ facture: f })}
                >
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{jourLong(f.jour)}</td>
                  <td className="px-3 py-1.5">{f.fournisseur}</td>
                  <td className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${f.montant < 0 ? 'text-red-700' : ''}`}>{argent(f.montant)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    {f.jour_impute ? (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-900" title="Date d'imputation (la nourriture sert plus tard)">
                        {jourLong(f.jour_impute)}
                      </span>
                    ) : (
                      <span className="text-pierre-400">livraison</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-pierre-600">{f.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {fenetre && (
        <FenetreFacture
          key={fenetre.facture?.id ?? 'nouvelle'}
          facture={fenetre.facture}
          semaines={semaines}
          fournisseurs={fournisseurs}
          fermer={() => setFenetre(null)}
        />
      )}
    </div>
  )
}

function FenetreFacture({
  facture: f,
  semaines,
  fournisseurs,
  fermer,
}: {
  facture?: Facture
  semaines: Semaine[]
  fournisseurs: string[]
  fermer: () => void
}) {
  const enregistrer = useEnregistrerFacture()
  const supprimer = useSupprimerFacture()
  const [jour, setJour] = useState(f?.jour ?? aujourdhui())
  const [fournisseur, setFournisseur] = useState(f?.fournisseur ?? '')
  const [montant, setMontant] = useState(montantChamp(f?.montant))
  const [impute, setImpute] = useState(f?.jour_impute ?? '')
  const [note, setNote] = useState(f?.note ?? '')
  const [erreur, setErreur] = useState<string | null>(null)
  const [ajoutees, setAjoutees] = useState(0)
  const occupe = enregistrer.isPending || supprimer.isPending

  // Où la facture compte : mois et, l'été, semaine du camp.
  const compte = impute || jour
  const ou = compte
    ? [intervalleDe(compte, moisDeLAnnee(anneeDe(compte)))?.nom, intervalleDe(compte, semaines)?.nom].filter(Boolean).join(' · ')
    : ''

  async function valider(encore: boolean) {
    const n = lireMontant(montant)
    if (!jour) return setErreur('Préciser la date.')
    if (!fournisseur.trim()) return setErreur('Préciser le fournisseur.')
    if (n == null || n === 0) return setErreur('Montant invalide (négatif pour un crédit).')
    if (impute && impute < jour) return setErreur("La date d'imputation est avant la livraison.")
    try {
      setErreur(null)
      await enregistrer.mutateAsync({
        id: f?.id ?? crypto.randomUUID(),
        jour,
        fournisseur: fournisseur.trim(),
        montant: n,
        jour_impute: impute && impute !== jour ? impute : null,
        note: note.trim(),
      })
      if (!encore) return fermer()
      // Facture suivante du même fournisseur, même date.
      setMontant('')
      setNote('')
      setAjoutees((k) => k + 1)
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  async function retirer() {
    if (!f) return
    const ok = await confirmer({ titre: 'Supprimer cette facture ?', message: `${f.fournisseur}, ${jourLong(f.jour)} : ${argent(f.montant)}`, libelleOk: 'Supprimer' })
    if (!ok) return
    try {
      await supprimer.mutateAsync(f.id)
      fermer()
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  return (
    <Dialogue titre={f ? 'Modifier la facture' : 'Nouvelle facture'} fermer={fermer}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          valider(false)
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={ui.etiquette}>Date de livraison</span>
            <input type="date" className={ui.champ} value={jour} onChange={(e) => setJour(e.target.value)} required />
          </label>
          <label className="block">
            <span className={ui.etiquette}>Montant</span>
            <input className={`${ui.champ} text-right tabular-nums`} inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="0,00" autoFocus={!!fournisseur} />
          </label>
        </div>
        <label className="block">
          <span className={ui.etiquette}>Fournisseur</span>
          <input className={ui.champ} list="couts-fournisseurs" value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} autoFocus={!fournisseur} />
          <datalist id="couts-fournisseurs">
            {fournisseurs.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className={ui.etiquette}>Date d'imputation (facultatif)</span>
          <div className="flex items-center gap-2">
            <input type="date" className={ui.champ} value={impute} min={jour} onChange={(e) => setImpute(e.target.value)} />
            {impute && (
              <button type="button" className="shrink-0 text-sm text-pierre-600 underline" onClick={() => setImpute('')}>
                Retirer
              </button>
            )}
          </div>
          <span className="mt-1 block text-xs text-pierre-500">
            Seulement si la nourriture sert plus tard (ex. livraison du jeudi pour la semaine suivante).{ou && ` Compte dans : ${ou}.`}
          </span>
        </label>
        <label className="block">
          <span className={ui.etiquette}>Note (facultatif)</span>
          <input className={ui.champ} value={note} onChange={(e) => setNote(e.target.value)} placeholder="N° de facture, crédit…" />
        </label>
        {ajoutees > 0 && (
          <p className="text-sm text-foret-700">
            {ajoutees} facture{ajoutees > 1 ? 's' : ''} ajoutée{ajoutees > 1 ? 's' : ''}.
          </p>
        )}
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {f && <BoutonSupprimer onClick={retirer} disabled={occupe} />}
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
              {ajoutees ? 'Fermer' : 'Annuler'}
            </button>
            {!f && (
              <button type="button" className={ui.boutonSecondaire} onClick={() => valider(true)} disabled={occupe}>
                Enregistrer et ajouter
              </button>
            )}
            <button type="submit" className={ui.bouton} disabled={occupe}>
              Enregistrer
            </button>
          </div>
        </div>
      </form>
    </Dialogue>
  )
}
