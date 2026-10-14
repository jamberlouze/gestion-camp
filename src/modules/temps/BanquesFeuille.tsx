import { useState, type FormEvent } from 'react'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import {
  enJours,
  HEURES_PAR_JOUR_MALADIE,
  joursMaladiePour,
  mouvementsBanques,
  PREMIERE_ANNEE_BANQUES,
  resumePeriode,
  SEUIL_SEMAINE,
  type Banque,
  type Mouvement,
} from './banques'
import { useAjusterBanque, useDonneesBanques, useReglerJoursMaladie, type ReglageMaladieLigne, type Titulaire } from './donnees'
import { aujourdhui, dateCourte, finPeriode, formatHeures } from './periodes'

const NOMS: Record<Banque, string> = { maladie: 'Maladie', heures: 'Heures accumulées' }

/** « +4 h », « −2,5 h » */
const signe = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatHeures(Math.abs(n))} h`

/**
 * Banques en bas d'une feuille individuelle (direction, admin, employé qui
 * remplit la sienne) : maladie et heures accumulées, avec le solde au début
 * et à la fin de la période, les mouvements de la période et l'historique.
 * Pas de banque de vacances : elles restent dans Employeur D.
 * `heuresPeriode` = les heures de la feuille affichée (à jour pendant la
 * saisie) ; pour un employé, celles de la compagnie `entrepriseId`.
 * `peutRegler` : ajustements et jours de maladie (admins pour la direction,
 * direction pour un employé ; la base vérifie : temps.peut_regler_banque).
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
  const fin = finPeriode(debut)
  const donnees = useDonneesBanques(titulaire, fin)
  const [historique, setHistorique] = useState<Banque | null>(null)
  const [fenetre, setFenetre] = useState<'ajuster' | 'maladie' | null>(null)

  if (donnees.error) return <p className={`${ui.erreur} print:hidden`}>Banques : {messageErreur(donnees.error)}</p>
  if (!donnees.data) return <p className="py-4 text-center text-sm text-pierre-500 print:hidden">Chargement des banques…</p>

  // Heures de la période : celles de la feuille à l'écran (saisie en cours) plutôt que la copie lue.
  const dansFeuille = (h: { jour: string; entreprise_id: string | null }) =>
    h.jour >= debut && h.jour <= fin && (entrepriseId == null || h.entreprise_id === entrepriseId)
  const heures = [...donnees.data.heures.filter((h) => !dansFeuille(h)), ...heuresPeriode]
  const mouvements = mouvementsBanques({
    heures,
    ajustements: donnees.data.ajustements,
    reglagesMaladie: donnees.data.reglagesMaladie,
    au: fin,
  })
  const annee = Number(fin.slice(0, 4))
  const joursAnnee = joursMaladiePour(annee, donnees.data.reglagesMaladie)

  return (
    <section className="space-y-2 break-inside-avoid">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={ui.etiquette}>Banques</h3>
        {peutRegler && (
          <div className="flex flex-wrap gap-2 print:hidden">
            <button className="text-sm text-foret-700 underline" onClick={() => setFenetre('ajuster')}>
              Ajuster une banque…
            </button>
            <button className="text-sm text-foret-700 underline" onClick={() => setFenetre('maladie')}>
              Jours de maladie par année…
            </button>
          </div>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CarteBanque
          banque="maladie"
          sousTitre={`${formatHeures(joursAnnee)} jour${joursAnnee > 1 ? 's' : ''} par année en ${annee}, accordés le 1er janvier · 1 jour = ${HEURES_PAR_JOUR_MALADIE} h`}
          mouvements={mouvements}
          debut={debut}
          fin={fin}
          enJours
          historique={historique === 'maladie'}
          basculer={() => setHistorique(historique === 'maladie' ? null : 'maladie')}
        />
        <CarteBanque
          banque="heures"
          sousTitre={`Heures régulières au-delà de ${SEUIL_SEMAINE} h par semaine (dim. au sam.), heure pour heure`}
          mouvements={mouvements}
          debut={debut}
          fin={fin}
          historique={historique === 'heures'}
          basculer={() => setHistorique(historique === 'heures' ? null : 'heures')}
        />
      </div>
      {fenetre === 'ajuster' && <FenetreAjustement titulaire={titulaire} fermer={() => setFenetre(null)} />}
      {fenetre === 'maladie' && (
        <FenetreJoursMaladie titulaire={titulaire} reglages={donnees.data.reglagesMaladie} fermer={() => setFenetre(null)} />
      )}
    </section>
  )
}

function CarteBanque({
  banque,
  sousTitre,
  mouvements,
  debut,
  fin,
  enJours: avecJours = false,
  historique,
  basculer,
}: {
  banque: Banque
  sousTitre: string
  mouvements: Mouvement[]
  debut: string
  fin: string
  enJours?: boolean
  historique: boolean
  basculer: () => void
}) {
  const r = resumePeriode(mouvements, banque, debut, fin)
  const siens = mouvements.filter((m) => m.banque === banque)
  const solde = (n: number) => (
    <span className={`tabular-nums ${n < 0 ? 'text-red-700' : ''}`}>
      {formatHeures(n)} h{avecJours && n ? ` (${formatHeures(enJours(n))} j)` : ''}
    </span>
  )
  return (
    <div className={`${ui.carte} px-4 py-3 text-sm`}>
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="font-semibold text-pierre-900">{NOMS[banque]}</h4>
        <b className="text-lg">{solde(r.apres)}</b>
      </div>
      <p className="text-xs text-pierre-500">{sousTitre}</p>
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
      <button className="mt-2 text-xs text-foret-700 underline print:hidden" onClick={basculer}>
        {historique ? "Masquer l'historique" : `Historique (${siens.length} mouvement${siens.length > 1 ? 's' : ''})`}
      </button>
      {historique && (
        <div className="mt-2 max-h-72 overflow-y-auto print:hidden">
          {!siens.length ? (
            <p className="text-xs text-pierre-500">Aucun mouvement.</p>
          ) : (
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
                {[...siens].reverse().map((m) => (
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
          )}
        </div>
      )}
    </div>
  )
}

/** « 12 », « 7,5 », « 7.25 » → nombre au quart d'heure ; null si invalide. */
function lireNombre(texte: string): number | null {
  const t = texte.trim().replace(',', '.')
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  return n > 0 && Math.abs(n * 4 - Math.round(n * 4)) < 1e-9 ? n : null
}

function FenetreAjustement({ titulaire, fermer }: { titulaire: Titulaire; fermer: () => void }) {
  const ajuster = useAjusterBanque()
  const [banque, setBanque] = useState<Banque>('heures')
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
      await ajuster.mutateAsync({ titulaire, banque, jour, heures: sens * n, note: note.trim() })
      fermer()
    } catch (err) {
      setErreur(messageErreur(err))
    }
  }

  return (
    <Dialogue titre="Ajuster une banque" fermer={fermer}>
      <form className="space-y-3" onSubmit={envoyer}>
        <div className="flex flex-wrap gap-4 text-sm">
          {(['heures', 'maladie'] as Banque[]).map((b) => (
            <label key={b} className="flex items-center gap-2">
              <input type="radio" name="banque" checked={banque === b} onChange={() => setBanque(b)} />
              {NOMS[b]}
            </label>
          ))}
        </div>
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
        {banque === 'maladie' && <p className="text-xs text-pierre-500">1 jour de maladie = {HEURES_PAR_JOUR_MALADIE} h.</p>}
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

function FenetreJoursMaladie({
  titulaire,
  reglages,
  fermer,
}: {
  titulaire: Titulaire
  reglages: ReglageMaladieLigne[]
  fermer: () => void
}) {
  const regler = useReglerJoursMaladie()
  const anneeCourante = Number(aujourdhui().slice(0, 4))
  const annees = [anneeCourante, anneeCourante + 1].filter((a) => a >= PREMIERE_ANNEE_BANQUES)
  const [annee, setAnnee] = useState(annees[0] ?? PREMIERE_ANNEE_BANQUES)
  const [jours, setJours] = useState(formatHeures(joursMaladiePour(annee, reglages)))
  const [erreur, setErreur] = useState<string | null>(null)

  const envoyer = async (e: FormEvent) => {
    e.preventDefault()
    const t = jours.trim().replace(',', '.')
    const n = Number(t)
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(t) || Math.abs(n * 4 - Math.round(n * 4)) > 1e-9)
      return setErreur('Nombre de jours invalide (ex. 2 ou 2,5).')
    setErreur(null)
    try {
      await regler.mutateAsync({ titulaire, annee, jours: n })
      fermer()
    } catch (err) {
      setErreur(messageErreur(err))
    }
  }

  return (
    <Dialogue titre="Jours de maladie par année" fermer={fermer}>
      <form className="space-y-3" onSubmit={envoyer}>
        <p className="text-sm text-pierre-600">
          Accordés chaque 1er janvier (2 par défaut, le minimum de la loi). 1 jour = {HEURES_PAR_JOUR_MALADIE} h. Un
          changement vaut pour l’année choisie et les suivantes ; les années d’avant ne changent pas.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-28">
            <label className={ui.etiquette} htmlFor="maladie-jours">
              Jours par année
            </label>
            <input id="maladie-jours" inputMode="decimal" className={ui.champ} value={jours} onChange={(e) => setJours(e.target.value)} autoFocus />
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="maladie-annee">
              À partir de
            </label>
            <select
              id="maladie-annee"
              className={ui.champ}
              value={annee}
              onChange={(e) => {
                const a = Number(e.target.value)
                setAnnee(a)
                setJours(formatHeures(joursMaladiePour(a, reglages)))
              }}
            >
              {annees.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>
        {reglages.length > 0 && (
          <ul className="space-y-0.5 text-xs text-pierre-500">
            {reglages.map((r) => (
              <li key={r.id}>
                À partir de {r.annee} : {formatHeures(r.jours)} jour{r.jours > 1 ? 's' : ''} (par {r.auteur_nom})
              </li>
            ))}
          </ul>
        )}
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button type="submit" className={ui.bouton} disabled={regler.isPending}>
            Enregistrer
          </button>
        </div>
      </form>
    </Dialogue>
  )
}
