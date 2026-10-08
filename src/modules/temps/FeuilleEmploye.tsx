import { useState } from 'react'
import { messageErreur } from '@/lib/donnees'
import { PuceCompagnie } from '@/lib/PuceCompagnie'
import { ui } from '@/lib/ui'
import { useTitreImpression } from '@/lib/useTitreImpression'
import { useAuth } from '@/shell/auth'
import { useJournal, type Action } from './donnees'
import {
  nomEmploye,
  useChangerFeuilleEmploye,
  useFeuilleEmploye,
  useNoteFeuilleEmploye,
  useSaisirFeuilleEmploye,
  type EmployeFeuille,
  type Entreprise,
  type TypeHeuresEmploye,
} from './donneesEmployes'
import { Note, Semaine } from './Feuille'
import { formatHeures, joursPeriode, libellePeriode } from './periodes'
import { BarreStatut, Journal } from './Statut'

const REGULIERES = { id: 'regulieres', libelle: 'Heures' }
const WOOFING = { id: 'woofing', libelle: 'Woofing' }

/**
 * Feuille d'un employé qui remplit la sienne, pour une compagnie et une
 * période. Il saisit puis soumet à la direction ; la direction corrige,
 * approuve ou renvoie ; un admin peut annuler une approbation. Ses heures
 * régulières sont celles de sa ligne dans l'onglet Employés (mêmes lignes en
 * base) ; le woofing (non payé) reste ici.
 */
export function FeuilleEmploye({
  employe,
  entreprise,
  debut,
  woofing,
}: {
  employe: EmployeFeuille
  entreprise: Entreprise
  debut: string
  /** Option woofing de son compte (page Utilisateurs). */
  woofing: boolean
}) {
  const { estDirection, estAdmin, employeTemps } = useAuth()
  const donnees = useFeuilleEmploye(employe.id, entreprise.id, debut)
  const saisir = useSaisirFeuilleEmploye(employe.id, entreprise.id, debut)
  const noter = useNoteFeuilleEmploye()
  const changer = useChangerFeuilleEmploye()
  const journal = useJournal('feuille_employe_id', donnees.data?.feuille?.id)
  const [erreur, setErreur] = useState<string | null>(null)

  useTitreImpression(`Feuille de temps - ${nomEmploye(employe)} - ${entreprise.nom} - ${libellePeriode(debut)}`)

  if (donnees.error) return <p className={ui.erreur}>{messageErreur(donnees.error)}</p>
  if (!donnees.data) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const { heures, feuille } = donnees.data
  const statut = feuille?.statut ?? 'ouverte'
  const soi = employeTemps === employe.id
  // Mêmes règles que temps.peut_modifier_employe.
  const modifiable = statut === 'ouverte' ? estDirection || soi : statut === 'soumise' && estDirection
  const types = woofing || heures.some((h) => h.type === 'woofing') ? [REGULIERES, WOOFING] : [REGULIERES]
  const valeur = (jour: string, type: string) => heures.find((h) => h.jour === jour && h.type === type)?.heures ?? 0
  const total = (type: TypeHeuresEmploye) => heures.filter((h) => h.type === type).reduce((s, h) => s + h.heures, 0)
  const jours = joursPeriode(debut)
  const agir = (action: Action, texte?: string) =>
    changer.mutateAsync({ employeId: employe.id, entrepriseId: entreprise.id, debut, action, texte })

  return (
    <div className="space-y-4">
      <div className="hidden print:block">
        <h2 className="text-lg font-semibold">
          {nomEmploye(employe)} · {entreprise.nom}
        </h2>
        <p className="text-sm">Période du {libellePeriode(debut)}</p>
      </div>

      <BarreStatut
        statut={statut}
        journal={journal.data ?? []}
        auteur={soi}
        approbateur={estDirection}
        peutRouvrir={estAdmin}
        destinataire="la direction"
        onAction={agir}
      />
      {erreur && <p className={ui.erreur}>{erreur}</p>}

      {[jours.slice(0, 7), jours.slice(7)].map((s, i) => (
        <Semaine
          key={s[0]}
          titre={`Semaine ${i + 1}`}
          jours={s}
          types={types}
          valeur={valeur}
          modifiable={modifiable}
          onSaisir={(jour, type, h) =>
            saisir.mutate(
              { jour, type: type as TypeHeuresEmploye, heures: h },
              { onSuccess: () => setErreur(null), onError: (e) => setErreur(messageErreur(e)) },
            )
          }
        />
      ))}

      <div className={`${ui.carte} flex flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3 text-sm`}>
        <span className="font-semibold">Total de la période</span>
        <PuceCompagnie compagnie={entreprise} />
        <span>
          Heures : <b className="tabular-nums">{formatHeures(total('regulieres'))} h</b>
        </span>
        {types.includes(WOOFING) && (
          <span>
            Woofing (non payé) : <b className="tabular-nums">{formatHeures(total('woofing'))} h</b>
          </span>
        )}
      </div>

      <Note
        key={`${employe.id}-${entreprise.id}-${debut}-${feuille?.note ?? ''}`}
        valeur={feuille?.note ?? ''}
        modifiable={modifiable}
        onEnregistrer={(note) =>
          noter.mutate(
            { employeId: employe.id, entrepriseId: entreprise.id, debut, note },
            { onError: (e) => setErreur(messageErreur(e)) },
          )
        }
      />

      <Journal journal={journal.data ?? []} peutNoter={statut !== 'ouverte'} onNoter={(texte) => agir('noter', texte)} />
    </div>
  )
}
