import { useState, type FormEvent, type ReactNode } from 'react'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { dejaPlace, placer, retirerPersonne, useDefinirOccupation, useRelire, type Donnees } from './donnees'
import { employeNomme, etatChambre, nomChambre, nomPersonne, trierPersonnes } from './outils'
import { TYPES, type Plan, type TypeChambre } from './types'

const MAX_LITS = 50

/**
 * Une chambre dans un plan : type, nombre, capacité propre au plan et
 * employés nommés. Chaque changement est enregistré tout de suite.
 */
export function FenetreChambre({ d, plan, chambreId, fermer }: { d: Donnees; plan: Plan; chambreId: string; fermer: () => void }) {
  const definir = useDefinirOccupation()
  const relire = useRelire()
  const [erreur, setErreur] = useState<string | null>(null)
  const [nom, setNom] = useState('')
  const [enCours, setEnCours] = useState(false)

  const chambre = d.structure.chambres.find((c) => c.id === chambreId)
  if (!chambre) return null
  const occupation = d.occupations.find((o) => o.plan_id === plan.id && o.chambre_id === chambreId)
  const etat = etatChambre(chambre, occupation)
  const personnes = trierPersonnes(
    d.personnes.filter((p) => p.plan_id === plan.id && p.chambre_id === chambreId),
    d.employe,
  )
  const titre = nomChambre(d.section.get(chambre.section_id), chambre)
  const minimum = etat.type === 'employes' ? personnes.length : 0

  function envoyer(champs: Partial<{ type: TypeChambre; nombre: number; lits: number | null }>) {
    setErreur(null)
    const v = { plan_id: plan.id, chambre_id: chambre!.id, type: etat.type, nombre: etat.nombre, lits: occupation?.lits ?? null, ...champs }
    definir.mutate(v, { onError: (e) => setErreur(messageErreur(e)) })
  }

  async function changerType(type: TypeChambre) {
    if (type === etat.type) return
    if (etat.type === 'employes' && personnes.length > 0) {
      const ok = await confirmer({
        titre: 'Retirer les noms ?',
        message: `${personnes.map((p) => nomPersonne(p, d.employe)).join(', ')} ne seront plus placés dans cette chambre.`,
        libelleOk: 'Changer le type',
      })
      if (!ok) return
    }
    // Par défaut, la chambre est pleine : on ajuste ensuite.
    envoyer({ type, nombre: type === 'vide' ? 0 : etat.nombre || etat.lits })
  }

  const changerLits = (lits: number) => envoyer({ lits: lits === chambre.lits ? null : lits })

  async function ajouterNom(e: FormEvent) {
    e.preventDefault()
    const propre = nom.trim()
    if (!propre || enCours) return
    const employe = employeNomme(propre, d.employes)
    const valeurs = { plan: plan.id, chambre: chambre!.id, employe: employe?.id ?? null, nom: employe ? null : propre }
    setErreur(null)
    setEnCours(true)
    try {
      try {
        await placer(valeurs)
      } catch (err) {
        const ailleurs = dejaPlace(err)
        if (!ailleurs) throw err
        const cle = propre.toLocaleLowerCase('fr')
        const existante = d.personnes.find(
          (p) => p.plan_id === plan.id && (employe ? p.employe_id === employe.id : p.nom?.trim().toLocaleLowerCase('fr') === cle),
        )
        const qui = existante ? nomPersonne(existante, d.employe) : (employe?.surnom ?? propre)
        const ok = await confirmer({
          titre: `${qui} est déjà au ${ailleurs}`,
          message: `Le déplacer ici ? Il quittera ${ailleurs} dans ce plan.`,
          libelleOk: 'Déplacer',
          danger: false,
        })
        if (!ok) return
        await placer({ ...valeurs, deplacer: true })
      }
      setNom('')
    } catch (err) {
      setErreur(messageErreur(err))
    } finally {
      setEnCours(false)
      await relire()
    }
  }

  async function retirer(id: string) {
    setErreur(null)
    try {
      await retirerPersonne(id)
    } catch (err) {
      setErreur(messageErreur(err))
    }
    await relire()
  }

  // Employés actifs pas encore placés dans ce plan, pour les suggestions.
  const places = new Set(d.personnes.filter((p) => p.plan_id === plan.id && p.employe_id).map((p) => p.employe_id))
  const suggestions = d.employes.filter((e) => e.actif && !places.has(e.id))

  return (
    <Dialogue titre={`${titre} · ${plan.nom}`} fermer={fermer}>
      <div className="space-y-4">
        <div role="radiogroup" aria-label="Type de chambre" className="grid grid-cols-3 gap-1 rounded-lg bg-pierre-100 p-1">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={etat.type === t.id}
              className={`rounded-md px-2 py-1.5 text-sm font-medium ${
                etat.type === t.id ? `bg-white shadow-sm ${t.id === 'enfants' ? 'text-sky-800' : t.id === 'employes' ? 'text-amber-800' : 'text-pierre-800'}` : 'text-pierre-500 hover:text-pierre-800'
              }`}
              onClick={() => changerType(t.id)}
            >
              {t.libelle}
            </button>
          ))}
        </div>

        {etat.type !== 'vide' && (
          <Ligne libelle={etat.type === 'enfants' ? 'Enfants' : 'Employés'}>
            <Compteur valeur={etat.nombre} min={minimum} max={etat.lits} changer={(nombre) => envoyer({ nombre })} />
            <span className="text-sm text-pierre-500">sur {etat.lits}</span>
            <button
              type="button"
              className="ml-auto text-sm font-medium text-foret-700 hover:underline disabled:text-pierre-300 disabled:no-underline"
              disabled={etat.nombre === etat.lits}
              onClick={() => envoyer({ nombre: etat.lits })}
            >
              Remplir
            </button>
          </Ligne>
        )}

        <Ligne libelle="Lits dans ce plan">
          <Compteur valeur={etat.lits} min={etat.nombre} max={MAX_LITS} changer={changerLits} />
          {etat.ajustee ? (
            <span className="text-sm text-amber-800">
              normal : {etat.normal}{' '}
              <button type="button" className="font-medium text-foret-700 hover:underline" onClick={() => changerLits(chambre.lits)} disabled={etat.nombre > chambre.lits}>
                (revenir)
              </button>
            </span>
          ) : (
            <span className="text-sm text-pierre-500">capacité normale</span>
          )}
        </Ligne>
        {etat.lits === 0 && <p className="-mt-2 text-sm text-pierre-500">Chambre fermée dans ce plan.</p>}

        {etat.type !== 'enfants' && (
          <div>
            <span className={ui.etiquette}>Employés nommés</span>
            {personnes.length > 0 ? (
              <ul className="mb-2 flex flex-wrap gap-1.5">
                {personnes.map((p) => (
                  <li key={p.id} className="flex items-center gap-1 rounded-full bg-amber-50 py-0.5 pl-2.5 pr-1 text-sm text-amber-900 ring-1 ring-amber-200">
                    {nomPersonne(p, d.employe)}
                    {!p.employe_id && <span className="text-xs text-amber-700/70" title="Nom tapé à la main (pas dans la liste des employés)">✎</span>}
                    <button
                      type="button"
                      aria-label={`Retirer ${nomPersonne(p, d.employe)}`}
                      className="rounded-full px-1.5 text-amber-700 hover:bg-amber-100"
                      onClick={() => retirer(p.id)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-2 text-sm text-pierre-500">Facultatif : les employés clés qui dorment ici.</p>
            )}
            <form onSubmit={ajouterNom} className="flex gap-2">
              <input
                className={ui.champ}
                list="rooming-employes"
                placeholder="Surnom d'un employé ou autre nom"
                aria-label="Nom à ajouter"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
              />
              <datalist id="rooming-employes">
                {suggestions.map((e) => (
                  <option key={e.id} value={e.surnom} />
                ))}
              </datalist>
              <button className={ui.boutonSecondaire} disabled={!nom.trim() || enCours}>
                Ajouter
              </button>
            </form>
            {nom.trim() && !employeNomme(nom, d.employes) && (
              <p className="mt-1 text-xs text-pierre-500">Pas dans la liste des employés : ajouté comme nom libre.</p>
            )}
          </div>
        )}

        {erreur && <p className={ui.erreur}>{erreur}</p>}

        <div className="flex justify-end">
          <button type="button" className={ui.bouton} onClick={fermer}>
            Fermer
          </button>
        </div>
      </div>
    </Dialogue>
  )
}

function Ligne({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <div>
      <span className={ui.etiquette}>{libelle}</span>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  )
}

function Compteur({ valeur, min, max, changer }: { valeur: number; min: number; max: number; changer: (n: number) => void }) {
  const bouton = 'flex size-9 items-center justify-center rounded-lg border border-pierre-300 bg-white text-lg font-medium hover:bg-pierre-50 disabled:opacity-40'
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={bouton} aria-label="Moins" disabled={valeur <= min} onClick={() => changer(valeur - 1)}>
        −
      </button>
      <span className="w-8 text-center text-lg font-semibold tabular-nums">{valeur}</span>
      <button type="button" className={bouton} aria-label="Plus" disabled={valeur >= max} onClick={() => changer(valeur + 1)}>
        +
      </button>
    </div>
  )
}
