import { useState } from 'react'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { IconeCorbeille } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { ajouterJours, debutAnnee, dernierDimancheJuin, finAnnee, intervalle, jourLong, nomAnnee, semainesParDefaut } from './calcul'
import { useCouts } from './contexte'
import { useEnregistrerSemaine, useSupprimerSemaine } from './donnees'
import type { Semaine } from './types'

/** Problème d'une semaine (dates hors de l'année, à l'envers ou qui en chevauchent une autre), sinon null. */
function probleme(s: Semaine, autres: Semaine[]): string | null {
  if (!s.nom.trim()) return 'Préciser le nom.'
  if (!s.debut || !s.fin) return 'Préciser les dates.'
  if (s.fin < s.debut) return 'La fin est avant le début.'
  if (s.debut < debutAnnee(s.annee) || s.fin > finAnnee(s.annee)) return `Les dates doivent être entre le ${jourLong(debutAnnee(s.annee))} et le ${jourLong(finAnnee(s.annee))}.`
  const chevauche = autres.find((a) => a.id !== s.id && a.debut <= s.fin && s.debut <= a.fin)
  return chevauche ? `Ces dates chevauchent « ${chevauche.nom} » (${intervalle(chevauche.debut, chevauche.fin)}).` : null
}

/** Semaines du camp d'été de l'année (lignes de la vue « Camp d'été »). */
export function Semaines() {
  const { annee, semaines, ecriture } = useCouts()
  const enregistrer = useEnregistrerSemaine()
  const supprimer = useSupprimerSemaine()
  const [erreur, setErreur] = useState<string | null>(null)
  const derniere = semaines.at(-1)
  const proposee = () =>
    derniere
      ? { nom: `Semaine ${semaines.length + 1}`, debut: ajouterJours(derniere.fin, 1), fin: ajouterJours(derniere.fin, 7) }
      : { nom: 'Semaine 1', debut: dernierDimancheJuin(annee.annee + 1), fin: ajouterJours(dernierDimancheJuin(annee.annee + 1), 6) }
  const [nouvelle, setNouvelle] = useState(proposee)
  const [base, setBase] = useState(semaines)
  if (base !== semaines) {
    setBase(semaines)
    setNouvelle(proposee())
  }

  const changer = (s: Semaine, champs: Partial<Semaine>) => {
    const suivante = { ...s, ...champs }
    const pb = probleme(suivante, semaines)
    setErreur(pb)
    if (!pb) enregistrer.mutate(suivante)
  }

  const ajouter = () => {
    const s = { id: crypto.randomUUID(), annee: annee.annee, nom: nouvelle.nom.trim(), debut: nouvelle.debut, fin: nouvelle.fin }
    const pb = probleme(s, semaines)
    setErreur(pb)
    if (!pb) enregistrer.mutate(s)
  }

  const proposer = () => {
    const debut = dernierDimancheJuin(annee.annee + 1)
    for (const s of semainesParDefaut(annee.annee, debut, 8)) enregistrer.mutate({ id: crypto.randomUUID(), annee: annee.annee, ...s })
  }

  const retirer = async (s: Semaine) => {
    if (await confirmer({ titre: `Supprimer « ${s.nom} » ?`, message: 'Rien d’autre ne change : la semaine disparaît seulement de la vue Camp d’été.', libelleOk: 'Supprimer' }))
      supprimer.mutate(s.id)
  }

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-xs text-pierre-500">
        Semaines du camp d'été {nomAnnee(annee.annee)}, une ligne chacune dans la vue Camp d'été. Elles ne changent rien aux montants : factures,
        salaires et assiettes sont rattachés à des jours.
      </p>
      {erreur && <p className={ui.erreur}>{erreur}</p>}
      {semaines.length === 0 && ecriture && (
        <div className={`${ui.carte} flex flex-wrap items-center gap-3 p-4 text-sm`}>
          <span className="text-pierre-600">Aucune semaine.</span>
          <button className={ui.bouton} onClick={proposer} disabled={enregistrer.isPending}>
            Créer 8 semaines à partir du {jourLong(dernierDimancheJuin(annee.annee + 1))}
          </button>
        </div>
      )}
      <div className={`${ui.carte} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="border-b border-pierre-200 bg-pierre-50 text-left text-xs uppercase tracking-wide text-pierre-500">
            <tr>
              <th className="px-3 py-2 font-medium">Semaine</th>
              <th className="px-3 py-2 font-medium">Du</th>
              <th className="px-3 py-2 font-medium">Au</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-pierre-100">
            {semaines.map((s) => (
              <tr key={s.id}>
                <td className="px-2 py-1">
                  {ecriture ? <ChampTexte className={`${ui.champ} py-1`} valeur={s.nom} obligatoire aria-label="Nom" enregistrer={(nom) => changer(s, { nom })} /> : s.nom}
                </td>
                <td className="px-2 py-1">
                  {ecriture ? (
                    <input type="date" className={`${ui.champ} py-1`} value={s.debut} onChange={(e) => e.target.value && changer(s, { debut: e.target.value })} aria-label="Du" />
                  ) : (
                    jourLong(s.debut)
                  )}
                </td>
                <td className="px-2 py-1">
                  {ecriture ? (
                    <input type="date" className={`${ui.champ} py-1`} value={s.fin} onChange={(e) => e.target.value && changer(s, { fin: e.target.value })} aria-label="Au" />
                  ) : (
                    jourLong(s.fin)
                  )}
                </td>
                <td className="px-2 py-1 text-right">
                  {ecriture && (
                    <button className="rounded p-1.5 text-pierre-400 hover:bg-red-50 hover:text-red-700" title="Supprimer la semaine" onClick={() => retirer(s)}>
                      <IconeCorbeille />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {ecriture && (
            <tfoot className="border-t border-pierre-200 bg-pierre-50">
              <tr>
                <td className="px-2 py-2">
                  <input className={`${ui.champ} py-1`} value={nouvelle.nom} onChange={(e) => setNouvelle({ ...nouvelle, nom: e.target.value })} aria-label="Nom de la semaine" />
                </td>
                <td className="px-2 py-2">
                  <input type="date" className={`${ui.champ} py-1`} value={nouvelle.debut} onChange={(e) => setNouvelle({ ...nouvelle, debut: e.target.value })} aria-label="Du" />
                </td>
                <td className="px-2 py-2">
                  <input type="date" className={`${ui.champ} py-1`} value={nouvelle.fin} onChange={(e) => setNouvelle({ ...nouvelle, fin: e.target.value })} aria-label="Au" />
                </td>
                <td className="px-2 py-2">
                  <button className={`${ui.bouton} py-1`} onClick={ajouter} disabled={!nouvelle.nom.trim() || !nouvelle.debut || !nouvelle.fin}>
                    Ajouter
                  </button>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-xs text-pierre-500">Pour déplacer la limite entre deux semaines, raccourcir d'abord celle qui cède des jours, puis allonger l'autre.</p>
    </div>
  )
}
