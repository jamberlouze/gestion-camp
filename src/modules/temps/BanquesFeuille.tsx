import { useState, type FormEvent } from 'react'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { alerteBanque, HEURES_FERIE, PREMIERE_ANNEE_BANQUES, SEUIL_ALERTE, SEUIL_SEMAINE, type Mouvement } from './banques'
import { banqueDeLaFeuille, useAjusterBanque, useDonneesBanques, type Titulaire } from './donnees'
import { libelleEtatHeures, signe } from './outils'
import { aujourdhui, dateCourte, finPeriode, formatHeures } from './periodes'

/**
 * Banque d'heures en bas d'une feuille individuelle (direction, admin,
 * employé qui remplit la sienne) : solde au début et à la fin de la
 * période, mouvements de la période et historique. Pas de banque de
 * vacances ni de maladie : elles sont dans Employeur D (les heures de la
 * feuille y partent avec leur code d'utilisation).
 * `heuresPeriode` = les heures de la feuille affichée (à jour pendant la
 * saisie) ; pour un employé, celles de la compagnie `entrepriseId`.
 * `peutRegler` : ajustements (admins pour la direction, direction pour un
 * employé ; la base vérifie : temps.peut_regler_banque).
 */
export function BanquesFeuille({
  titulaire,
  debut,
  heuresPeriode,
  entrepriseId = null,
  peutRegler,
}: {
  titulaire: Titulaire
  debut: string
  heuresPeriode: { jour: string; type: string; heures: number }[]
  entrepriseId?: string | null
  peutRegler: boolean
}) {
  const { estAdmin } = useAuth()
  const fin = finPeriode(debut)
  const donnees = useDonneesBanques(titulaire, fin)
  const [historique, setHistorique] = useState(false)
  const [ajuster, setAjuster] = useState(false)

  if (donnees.error) return <p className={`${ui.erreur} print:hidden`}>Banque d’heures : {messageErreur(donnees.error)}</p>
  if (!donnees.data) return <p className="py-4 text-center text-sm text-pierre-500 print:hidden">Chargement de la banque d’heures…</p>

  const { mouvements, etat, r } = banqueDeLaFeuille(donnees.data, debut, heuresPeriode, entrepriseId)
  const solde = (n: number) => <span className={`tabular-nums ${n < 0 ? 'text-red-700' : ''}`}>{formatHeures(n)} h</span>

  return (
    <section className="space-y-2 break-inside-avoid">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={ui.etiquette}>Banque d’heures</h3>
        {peutRegler && (
          <button className="text-sm text-foret-700 underline print:hidden" onClick={() => setAjuster(true)}>
            Ajuster la banque…
          </button>
        )}
      </div>
      <div className={`${ui.carte} max-w-xl px-4 py-3 text-sm`}>
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="font-semibold text-pierre-900">Heures accumulées</h4>
          <b className="text-lg">{solde(r.apres)}</b>
        </div>
        <p className="text-xs text-pierre-500">
          {etat.active
            ? `Calculée seule sur la période de paie complète : heures attendues = ${SEUIL_SEMAINE} h par semaine, ${HEURES_FERIE} h de moins par férié ; régulières au-delà ajoutées, manque d'une période finie tiré (vacances et maladie comptées) · mise en banque ${libelleEtatHeures(etat)}`
            : `Mise en banque des heures ${libelleEtatHeures(etat)} : rien ne s'ajoute ni ne se retire, le solde reste`}
        </p>
        {estAdmin && alerteBanque(mouvements, etat.active) && (
          <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">
            {(mouvements.at(-1)?.solde ?? 0) < 0 ? 'Banque négative' : `Banque sous ${SEUIL_ALERTE} h`} : à surveiller.
          </p>
        )}
        <ul className="mt-2 space-y-1">
          <li className="flex justify-between gap-3 text-pierre-600">
            <span>Solde au {dateCourte(debut, false)}</span>
            {solde(r.avant)}
          </li>
          {r.mouvements.map((m) => (
            <li key={m.cle} className="flex justify-between gap-3">
              <span className="min-w-0">
                {m.libelle}
                {m.detail && <span className="block text-xs text-pierre-500">{m.detail}</span>}
              </span>
              <span className={`shrink-0 tabular-nums ${m.heures < 0 ? 'text-pierre-800' : 'text-foret-700'}`}>{signe(m.heures)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-3 border-t border-pierre-100 pt-1 font-medium">
            <span>Solde au {dateCourte(fin, false)}</span>
            {solde(r.apres)}
          </li>
        </ul>
        <button className="mt-2 text-xs text-foret-700 underline print:hidden" onClick={() => setHistorique(!historique)}>
          {historique ? "Masquer l'historique" : `Historique (${mouvements.length} mouvement${mouvements.length > 1 ? 's' : ''})`}
        </button>
        {historique && (
          <div className="mt-2 max-h-72 overflow-y-auto print:hidden">
            <TableHistorique mouvements={mouvements} />
          </div>
        )}
      </div>
      <p className="text-xs text-pierre-500">Vacances et maladie : les soldes sont dans Employeur D.</p>
      {ajuster && <FenetreAjustement titulaire={titulaire} fermer={() => setAjuster(false)} />}
    </section>
  )
}

/** Mouvements de la banque d'heures, du plus récent au plus ancien, avec le solde courant. */
export function TableHistorique({ mouvements }: { mouvements: Mouvement[] }) {
  if (!mouvements.length) return <p className="text-xs text-pierre-500">Aucun mouvement.</p>
  return (
            <table className="w-full text-xs">
              <thead className="text-pierre-500">
                <tr>
                  <th className="py-1 pr-2 text-left font-medium">Date</th>
                  <th className="py-1 pr-2 text-left font-medium">Mouvement</th>
                  <th className="py-1 pr-2 text-right font-medium">Heures</th>
                  <th className="py-1 text-right font-medium">Solde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pierre-100">
                {[...mouvements].reverse().map((m) => (
                  <tr key={m.cle}>
                    <td className="py-1 pr-2 align-top whitespace-nowrap text-pierre-500">{dateCourte(m.jour)}</td>
                    <td className="py-1 pr-2 align-top">
                      {m.libelle}
                      {m.detail && <span className="block text-pierre-500">{m.detail}</span>}
                    </td>
                    <td className="py-1 pr-2 text-right align-top whitespace-nowrap tabular-nums">{signe(m.heures)}</td>
                    <td className={`py-1 text-right align-top whitespace-nowrap tabular-nums ${m.solde < 0 ? 'text-red-700' : ''}`}>
                      {formatHeures(m.solde)} h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
  )
}

/** « 12 », « 7,5 », « 7.25 » → nombre au quart d'heure ; null si invalide. */
function lireNombre(texte: string): number | null {
  const t = texte.trim().replace(',', '.')
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  return n > 0 && Math.abs(n * 4 - Math.round(n * 4)) < 1e-9 ? n : null
}

/** Ajustement manuel de la banque d'heures. */
export function FenetreAjustement({
  titulaire,
  fermer,
  nom,
}: {
  titulaire: Titulaire
  fermer: () => void
  /** Nom de la personne, dans le titre (onglet Banques). */
  nom?: string
}) {
  const ajuster = useAjusterBanque()
  const [sens, setSens] = useState<1 | -1>(1)
  const [heures, setHeures] = useState('')
  const [jour, setJour] = useState(aujourdhui())
  const [note, setNote] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const n = lireNombre(heures)

  const envoyer = async (e: FormEvent) => {
    e.preventDefault()
    if (n == null) return setErreur('Nombre d’heures invalide (au quart d’heure, ex. 7,5).')
    if (!note.trim()) return setErreur('Écrivez une note.')
    if (!jour || jour < `${PREMIERE_ANNEE_BANQUES}-01-01`) return setErreur(`Date à partir du 1er janvier ${PREMIERE_ANNEE_BANQUES}.`)
    setErreur(null)
    try {
      await ajuster.mutateAsync({ titulaire, jour, heures: sens * n, note: note.trim() })
      fermer()
    } catch (err) {
      setErreur(messageErreur(err))
    }
  }

  return (
    <Dialogue titre={nom ? `Ajuster la banque d’heures · ${nom}` : 'Ajuster la banque d’heures'} fermer={fermer}>
      <form className="space-y-3" onSubmit={envoyer}>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={ui.etiquette} htmlFor="ajustement-sens">
              Sens
            </label>
            <select id="ajustement-sens" className={ui.champ} value={sens} onChange={(e) => setSens(Number(e.target.value) as 1 | -1)}>
              <option value={1}>Ajouter</option>
              <option value={-1}>Retirer</option>
            </select>
          </div>
          <div className="w-28">
            <label className={ui.etiquette} htmlFor="ajustement-heures">
              Heures
            </label>
            <input
              id="ajustement-heures"
              inputMode="decimal"
              className={ui.champ}
              placeholder="ex. 7,5"
              value={heures}
              onChange={(e) => setHeures(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="ajustement-jour">
              Date
            </label>
            <input id="ajustement-jour" type="date" className={ui.champ} value={jour} onChange={(e) => setJour(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="ajustement-note">
            Note (obligatoire)
          </label>
          <textarea
            id="ajustement-note"
            className={`${ui.champ} min-h-16`}
            placeholder="Ex. solde de départ, heures payées sur la paie du 22 oct., départ…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <p className="text-xs text-pierre-500">Un ajustement ne s’efface pas : une erreur se corrige par un ajustement inverse.</p>
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button type="submit" className={ui.bouton} disabled={ajuster.isPending}>
            {n != null ? `${sens > 0 ? 'Ajouter' : 'Retirer'} ${formatHeures(n)} h` : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Dialogue>
  )
}

