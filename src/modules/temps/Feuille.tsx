import { useState } from 'react'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useTitreImpression } from '@/lib/useTitreImpression'
import { useAuth } from '@/shell/auth'
import { nomDe, useEnregistrerNote, useFeuille, useHeures, useMembres, useSaisir, type Heure } from './donnees'
import {
  aujourdhui,
  depuisIso,
  formatHeures,
  jourCourt,
  joursPeriode,
  libellePeriode,
  lireHeures,
  TYPES,
  type TypeHeures,
} from './periodes'

/**
 * Feuille de temps d'une personne pour une période : deux semaines de
 * dimanche à samedi, une rangée par type d'heures. La personne saisit et
 * corrige en tout temps (pas d'approbation) ; un admin peut corriger toute
 * feuille.
 */
export function Feuille({ userId, debut }: { userId: string; debut: string }) {
  const { profil, estAdmin } = useAuth()
  const heures = useHeures(userId, debut)
  const feuille = useFeuille(userId, debut)
  const membres = useMembres()
  const saisir = useSaisir(userId, debut)
  const enregistrerNote = useEnregistrerNote()
  const [erreurAction, setErreurAction] = useState<string | null>(null)

  const personne = membres.data?.find((m) => m.id === userId)
  const titre = `Feuille de temps - ${nomDe(personne)} - ${libellePeriode(debut)}`
  useTitreImpression(personne ? titre : null)

  const erreur = heures.error ?? feuille.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!heures.data || feuille.data === undefined) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const modifiable = estAdmin || userId === profil?.id
  const jours = joursPeriode(debut)
  const semaines = [jours.slice(0, 7), jours.slice(7)]
  const valeur = (jour: string, type: TypeHeures) => heures.data.find((h) => h.jour === jour && h.type === type)?.heures ?? 0
  const somme = (liste: Heure[]) => liste.reduce((s, h) => s + h.heures, 0)
  const totalType = (type: TypeHeures) => somme(heures.data.filter((h) => h.type === type))
  const total = somme(heures.data)

  return (
    <div className="space-y-4">
      <div className="hidden print:block">
        <h2 className="text-lg font-semibold">{nomDe(personne)}</h2>
        <p className="text-sm">Période du {libellePeriode(debut)}</p>
      </div>
      {erreurAction && <p className={ui.erreur}>{erreurAction}</p>}

      {semaines.map((s, i) => (
        <Semaine
          key={s[0]}
          titre={`Semaine ${i + 1}`}
          jours={s}
          valeur={valeur}
          modifiable={modifiable}
          onSaisir={(jour, type, h) => saisir.mutate({ jour, type, heures: h })}
        />
      ))}

      <div className={`${ui.carte} flex flex-wrap gap-x-8 gap-y-2 px-4 py-3 text-sm`}>
        <span className="font-semibold">Total de la période</span>
        {TYPES.map((t) => (
          <span key={t.id}>
            {t.libelle} : <b className="tabular-nums">{formatHeures(totalType(t.id))} h</b>
          </span>
        ))}
        <span>
          Total : <b className="tabular-nums">{formatHeures(total)} h</b>
        </span>
      </div>

      <Note
        key={`${userId}-${debut}-${feuille.data?.note ?? ''}`}
        valeur={feuille.data?.note ?? ''}
        modifiable={modifiable}
        onEnregistrer={(note) =>
          enregistrerNote.mutate({ userId, debut, note }, { onError: (e) => setErreurAction(messageErreur(e)) })
        }
      />
    </div>
  )
}

function Semaine({
  titre,
  jours,
  valeur,
  modifiable,
  onSaisir,
}: {
  titre: string
  jours: string[]
  valeur: (jour: string, type: TypeHeures) => number
  modifiable: boolean
  onSaisir: (jour: string, type: TypeHeures, heures: number | null) => void
}) {
  const auj = aujourdhui()
  const totalJour = (jour: string) => TYPES.reduce((s, t) => s + valeur(jour, t.id), 0)
  const totalType = (type: TypeHeures) => jours.reduce((s, j) => s + valeur(j, type), 0)
  const totalSemaine = jours.reduce((s, j) => s + totalJour(j), 0)
  const fond = (jour: string) => (jour === auj ? 'bg-foret-50' : depuisIso(jour).getDay() % 6 === 0 ? 'bg-pierre-50' : '')

  return (
    <div className={`${ui.carte} overflow-x-auto break-inside-avoid`}>
      <table className="w-full min-w-[46rem] text-sm">
        <thead>
          <tr className="border-b border-pierre-200 text-xs text-pierre-500">
            <th className="px-3 py-2 text-left font-semibold text-pierre-800">{titre}</th>
            {jours.map((j) => (
              <th key={j} className={`px-1 py-2 text-center font-medium ${fond(j)} ${j === auj ? 'text-foret-800' : ''}`}>
                {jourCourt(j)}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-pierre-100">
          {TYPES.map((t) => (
            <tr key={t.id}>
              <th className="px-3 py-1.5 text-left font-medium text-pierre-700">{t.libelle}</th>
              {jours.map((j) => (
                <td key={j} className={`px-1 py-1 text-center ${fond(j)}`}>
                  <Case
                    valeur={valeur(j, t.id)}
                    modifiable={modifiable}
                    libelle={`${t.libelle}, ${jourCourt(j)}`}
                    onSaisir={(h) => onSaisir(j, t.id, h)}
                  />
                </td>
              ))}
              <td className="px-3 py-1.5 text-right tabular-nums text-pierre-700">{formatHeures(totalType(t.id))}</td>
            </tr>
          ))}
          <tr className="bg-pierre-50 font-semibold">
            <th className="px-3 py-1.5 text-left">Total</th>
            {jours.map((j) => (
              <td key={j} className="px-1 py-1.5 text-center tabular-nums">
                {totalJour(j) ? formatHeures(totalJour(j)) : ''}
              </td>
            ))}
            <td className="px-3 py-1.5 text-right tabular-nums">{formatHeures(totalSemaine)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

/** Une case : « 7,5 », « 7h30 »… enregistrée en quittant la case (Entrée, Tab ou clic ailleurs). */
function Case({
  valeur,
  modifiable,
  libelle,
  onSaisir,
}: {
  valeur: number
  modifiable: boolean
  libelle: string
  onSaisir: (heures: number | null) => void
}) {
  const affiche = valeur ? formatHeures(valeur) : ''
  const [texte, setTexte] = useState(affiche)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enSaisie, setEnSaisie] = useState(false)

  // Valeur venue de la base (enregistrement, correction d'un admin…).
  const [precedente, setPrecedente] = useState(affiche)
  if (precedente !== affiche) {
    setPrecedente(affiche)
    if (!enSaisie) setTexte(affiche)
  }

  if (!modifiable) return <span className="inline-block w-14 tabular-nums">{affiche}</span>

  const valider = () => {
    setEnSaisie(false)
    const lu = lireHeures(texte)
    if ('erreur' in lu) {
      setErreur(lu.erreur)
      return
    }
    setErreur(null)
    setTexte(lu.heures ? formatHeures(lu.heures) : '')
    if ((lu.heures ?? 0) !== valeur) onSaisir(lu.heures)
  }

  return (
    <span className="relative inline-block">
      <input
        aria-label={libelle}
        aria-invalid={!!erreur}
        title={erreur ?? undefined}
        inputMode="decimal"
        className={`w-14 rounded-md border px-1 py-1 text-center tabular-nums focus:outline-none focus:ring-2 ${
          erreur
            ? 'border-red-400 bg-red-50 focus:ring-red-300'
            : 'border-pierre-200 bg-white hover:border-pierre-300 focus:border-foret-600 focus:ring-foret-600/20'
        }`}
        value={texte}
        onFocus={(e) => {
          setEnSaisie(true)
          e.target.select()
        }}
        onChange={(e) => setTexte(e.target.value)}
        onBlur={valider}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setTexte(affiche)
            setErreur(null)
            setEnSaisie(false)
            e.currentTarget.blur()
          }
        }}
      />
      {erreur && (
        <span className="absolute left-1/2 top-full z-10 mt-1 w-40 -translate-x-1/2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800 shadow-sm print:hidden">
          {erreur}
        </span>
      )}
    </span>
  )
}

function Note({ valeur, modifiable, onEnregistrer }: { valeur: string; modifiable: boolean; onEnregistrer: (note: string) => void }) {
  const [texte, setTexte] = useState(valeur)
  if (!modifiable && !valeur) return null
  return (
    <div>
      <label className={ui.etiquette} htmlFor="note-feuille">
        Note pour la période
      </label>
      {modifiable ? (
        <textarea
          id="note-feuille"
          className={`${ui.champ} min-h-16`}
          placeholder="Ex. férié le 12 octobre, heures du samedi faites à la maison…"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onBlur={() => {
            if (texte.trim() !== valeur.trim()) onEnregistrer(texte)
          }}
        />
      ) : (
        <p className="whitespace-pre-wrap text-sm text-pierre-700">{valeur}</p>
      )}
    </div>
  )
}
