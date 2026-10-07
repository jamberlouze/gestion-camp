import { useMemo, useState } from 'react'
import { BoutonSupprimer } from '@/lib/BoutonsAction'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { ajouterJours, debutAnnee, ecartJours, entier, finAnnee, intervalle, jourLong, lignesMenus, nomAnnee } from './calcul'
import { useCouts } from './contexte'
import { useCorrigerMenu, useEnregistrerGroupe, useModifierAnnee, useSupprimerGroupe } from './donnees'
import type { GroupeManuel } from './types'

/**
 * Assiettes servies : les menus de Cuisine datés (calculés jour par jour,
 * total corrigible) et les groupes ajoutés à la main (personnes × repas,
 * répartis du début à la fin).
 */
export function Assiettes() {
  const { annee, groupes, menus, corrections, ecriture } = useCouts()
  const modifierAnnee = useModifierAnnee()
  const corriger = useCorrigerMenu()
  const [fenetre, setFenetre] = useState<{ groupe?: GroupeManuel } | null>(null)

  const lignes = useMemo(
    () => lignesMenus(menus, corrections).sort((a, b) => (a.menu.debut ?? '').localeCompare(b.menu.debut ?? '')),
    [menus, corrections],
  )
  const groupesAnnee = groupes.filter((g) => g.annee === annee.annee)
  const aClasser = groupesAnnee.filter((g) => !g.debut)
  const dates = groupesAnnee.filter((g) => g.debut).sort((a, b) => a.debut!.localeCompare(b.debut!) || a.ordre - b.ordre)

  const lireAssiettes = (texte: string) => {
    const n = Number(texte.replace(/\s/g, ''))
    return texte.trim() === '' ? null : Number.isInteger(n) && n >= 0 ? n : undefined
  }

  return (
    <div className="max-w-4xl space-y-6">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">Menus de Cuisine</h2>
          <label className="ml-auto flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-foret-700"
              checked={annee.menus}
              disabled={!ecriture}
              onChange={(e) => modifierAnnee.mutate({ ...annee, menus: e.target.checked })}
            />
            Compter les menus en {nomAnnee(annee.annee)}
          </label>
        </div>
        <p className="text-xs text-pierre-500">
          À chaque repas planifié (plat, salade ou dessert choisi), les portions des groupes présents ; un groupe en sortie mange sa glacière : il
          compte. Un total corrigé remplace le calcul (réparti sur les jours comme le calcul) ; vider la case revient au calcul.
        </p>
        {lignes.length === 0 ? (
          <p className={`${ui.carte} p-4 text-sm text-pierre-500`}>Aucun menu daté dans l'année.</p>
        ) : (
          <div className={`${ui.carte} overflow-x-auto ${annee.menus ? '' : 'opacity-60'}`}>
            <table className="w-full text-sm">
              <thead className="border-b border-pierre-200 bg-pierre-50 text-left text-xs uppercase tracking-wide text-pierre-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Menu</th>
                  <th className="px-3 py-2 font-medium">Dates</th>
                  <th className="px-3 py-2 text-right font-medium">Calculé</th>
                  <th className="w-32 px-3 py-2 text-right font-medium">Assiettes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pierre-100 tabular-nums">
                {lignes.map((m) => (
                  <tr key={m.menu.id}>
                    <td className="px-3 py-1.5">{m.menu.nom}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-pierre-600">{intervalle(m.menu.debut!, ajouterJours(m.menu.debut!, m.menu.jours - 1))}</td>
                    <td className={`px-3 py-1.5 text-right ${m.corrige != null ? 'text-pierre-400 line-through' : 'text-pierre-600'}`}>{entier(m.calcule)}</td>
                    <td className="px-3 py-1">
                      {ecriture ? (
                        <ChampTexte
                          className={`${ui.champ} py-1 text-right tabular-nums ${m.corrige != null ? 'border-amber-400 bg-amber-50' : ''}`}
                          valeur={m.corrige != null ? String(m.corrige) : ''}
                          placeholder={entier(m.calcule)}
                          inputMode="numeric"
                          aria-label={`Assiettes corrigées de ${m.menu.nom} (vide = calcul)`}
                          enregistrer={(texte) => {
                            const n = lireAssiettes(texte)
                            if (n !== undefined && n !== m.corrige) corriger.mutate({ menu_id: m.menu.id, assiettes: n })
                          }}
                        />
                      ) : (
                        <span className="block text-right">{entier(m.corrige ?? m.calcule)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">Groupes ajoutés</h2>
          {ecriture && (
            <button className={`${ui.bouton} ml-auto`} onClick={() => setFenetre({})}>
              + Groupe
            </button>
          )}
        </div>
        <p className="text-xs text-pierre-500">
          Pour ce qui n'a pas de menu dans Cuisine : personnes × repas, répartis également du premier au dernier jour.
        </p>
        {aClasser.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="mb-1 text-sm font-medium text-amber-900">Sans dates (pas comptés) : préciser leurs dates</p>
            <ul className="divide-y divide-amber-100 text-sm">
              {aClasser.map((g) => (
                <li
                  key={g.id}
                  className={`flex items-center gap-3 py-1.5 ${ecriture ? 'cursor-pointer hover:bg-amber-100' : ''}`}
                  onClick={() => ecriture && setFenetre({ groupe: g })}
                >
                  <span className="flex-1">{g.nom}</span>
                  <span className="text-pierre-600 tabular-nums">
                    {entier(g.personnes)} pers. × {entier(g.repas)} repas = {entier(g.personnes * g.repas)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {dates.length === 0 ? (
          <p className={`${ui.carte} p-4 text-sm text-pierre-500`}>Aucun groupe daté.</p>
        ) : (
          <div className={`${ui.carte} overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead className="border-b border-pierre-200 bg-pierre-50 text-left text-xs uppercase tracking-wide text-pierre-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Groupe</th>
                  <th className="px-3 py-2 font-medium">Dates</th>
                  <th className="px-3 py-2 text-right font-medium">Personnes × repas</th>
                  <th className="px-3 py-2 text-right font-medium">Assiettes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pierre-100 tabular-nums">
                {dates.map((g) => (
                  <tr key={g.id} className={ecriture ? 'cursor-pointer hover:bg-pierre-50' : ''} onClick={() => ecriture && setFenetre({ groupe: g })}>
                    <td className="px-3 py-1.5">{g.nom}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-pierre-600">{intervalle(g.debut!, g.fin!)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right text-pierre-600">
                      {entier(g.personnes)} × {entier(g.repas)}
                    </td>
                    <td className="px-3 py-1.5 text-right">{entier(g.personnes * g.repas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {fenetre && (
        <FenetreGroupe
          key={fenetre.groupe?.id ?? 'nouveau'}
          groupe={fenetre.groupe}
          annee={annee.annee}
          prochainOrdre={groupes.reduce((m, g) => Math.max(m, g.ordre), 0) + 1}
          fermer={() => setFenetre(null)}
        />
      )}
    </div>
  )
}

function FenetreGroupe({ groupe: g, annee, prochainOrdre, fermer }: { groupe?: GroupeManuel; annee: number; prochainOrdre: number; fermer: () => void }) {
  const enregistrer = useEnregistrerGroupe()
  const supprimer = useSupprimerGroupe()
  const [nom, setNom] = useState(g?.nom ?? '')
  const [personnes, setPersonnes] = useState(g ? String(g.personnes) : '')
  const [repas, setRepas] = useState(g ? String(g.repas) : '')
  const [debut, setDebut] = useState(g?.debut ?? '')
  const [fin, setFin] = useState(g?.fin ?? '')
  const [erreur, setErreur] = useState<string | null>(null)
  const occupe = enregistrer.isPending || supprimer.isPending
  const nP = Number(personnes)
  const nR = Number(repas)
  const valides = Number.isInteger(nP) && nP >= 0 && Number.isInteger(nR) && nR >= 0
  // L'année du groupe : celle de son début (sinon l'année affichée).
  const anneeGroupe = g?.annee ?? annee

  async function valider() {
    if (!nom.trim()) return setErreur('Préciser le nom du groupe.')
    if (!personnes.trim() || !repas.trim() || !valides) return setErreur('Personnes et repas : des nombres entiers.')
    if (!debut !== !fin) return setErreur('Préciser les deux dates, ou aucune (à classer).')
    if (debut && fin < debut) return setErreur('La fin est avant le début.')
    if (debut) {
      const a = Number(debut.slice(0, 4)) - (Number(debut.slice(5, 7)) >= 10 ? 0 : 1)
      if (fin > finAnnee(a)) return setErreur(`Un groupe ne peut pas déborder sur l'année suivante (après le ${jourLong(finAnnee(a))}) : le séparer en deux.`)
    }
    try {
      setErreur(null)
      await enregistrer.mutateAsync({
        id: g?.id ?? crypto.randomUUID(),
        annee: anneeGroupe,
        nom: nom.trim(),
        personnes: nP,
        repas: nR,
        debut: debut || null,
        fin: fin || null,
        ordre: g?.ordre ?? prochainOrdre,
      })
      fermer()
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  async function retirer() {
    if (!g) return
    if (!(await confirmer({ titre: `Supprimer « ${g.nom} » ?`, libelleOk: 'Supprimer' }))) return
    try {
      await supprimer.mutateAsync(g.id)
      fermer()
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  const jours = debut && fin && fin >= debut ? ecartJours(debut, fin) + 1 : 0

  return (
    <Dialogue titre={g ? 'Modifier le groupe' : 'Ajouter un groupe'} fermer={fermer}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          valider()
        }}
      >
        <label className="block">
          <span className={ui.etiquette}>Groupe</span>
          <input className={ui.champ} value={nom} onChange={(e) => setNom(e.target.value)} autoFocus placeholder="Ex. Mariage, Collège Dawson…" />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className={ui.etiquette}>Personnes</span>
            <input className={`${ui.champ} text-right`} inputMode="numeric" value={personnes} onChange={(e) => setPersonnes(e.target.value)} />
          </label>
          <label className="block">
            <span className={ui.etiquette}>Repas</span>
            <input className={`${ui.champ} text-right`} inputMode="numeric" value={repas} onChange={(e) => setRepas(e.target.value)} />
          </label>
          <div>
            <span className={ui.etiquette}>Assiettes</span>
            <p className="py-2 text-right text-sm font-semibold tabular-nums">{valides && personnes && repas ? entier(nP * nR) : '—'}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={ui.etiquette}>Du</span>
            <input
              type="date"
              className={ui.champ}
              value={debut}
              min={g?.debut ? undefined : debutAnnee(annee)}
              onChange={(e) => {
                setDebut(e.target.value)
                if (!fin || fin < e.target.value) setFin(e.target.value)
              }}
            />
          </label>
          <label className="block">
            <span className={ui.etiquette}>Au</span>
            <input type="date" className={ui.champ} value={fin} min={debut || undefined} onChange={(e) => setFin(e.target.value)} />
          </label>
        </div>
        <p className="text-xs text-pierre-500">
          {jours ? `Réparti sur ${jours} jour${jours > 1 ? 's' : ''}.` : 'Sans dates : à classer, pas compté.'}
        </p>
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex items-center gap-2 pt-1">
          {g && <BoutonSupprimer onClick={retirer} disabled={occupe} />}
          <div className="ml-auto flex gap-2">
            <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
              Annuler
            </button>
            <button type="submit" className={ui.bouton} disabled={occupe}>
              Enregistrer
            </button>
          </div>
        </div>
      </form>
    </Dialogue>
  )
}
