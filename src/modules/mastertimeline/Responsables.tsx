import { useMemo, useState } from 'react'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { cleAujourdhui, clesExercice, exerciceDeCle, libelleExercice, libelleMois, majuscule } from './calendrier'
import { BarreFiltres, LigneTache } from './commun'
import { reassigner, useCoches, useReferences, useTaches, type References } from './donnees'
import { passagesDuMois, retards, trierPassages, useEcriture, useFiltres, type Filtres, type Passage } from './outils'

const AUCUN = 'aucun'

/** Les tâches d'une personne : retards, puis les mois qui restent dans l'exercice. */
export function Responsables() {
  const ecriture = useEcriture()
  const refs = useReferences()
  const taches = useTaches()
  const exercice = exerciceDeCle(cleAujourdhui())
  const coches = useCoches(exercice)
  const [filtres, changerFiltres] = useFiltres()
  const [choisi, setChoisi] = useState<string | null>(null)
  const [vers, setVers] = useState('')
  const [message, setMessage] = useState<{ texte: string; erreur?: boolean } | null>(null)

  const parPersonne = useMemo(() => {
    const liste = taches.data ?? []
    const aujourdhui = cleAujourdhui()
    const mois = clesExercice(exercice).filter((cle) => cle >= aujourdhui)
    const pour = (responsable: string): Filtres => ({ ...filtres, responsable })
    const calcul = (responsable: string) => {
      const f = pour(responsable)
      const enRetard = trierPassages(retards(liste, coches.index, f))
      const aVenir = mois.map((cle) => ({ cle, passages: trierPassages(passagesDuMois(liste, cle, coches.index, f)) })).filter((m) => m.passages.length)
      const ceMois = aVenir.find((m) => m.cle === aujourdhui)?.passages.filter((p) => p.etat !== 'faite' && p.etat !== 'sautee').length ?? 0
      return { enRetard, aVenir, ceMois }
    }
    return new Map([...refs.responsables.map((r) => [r.id, calcul(r.id)] as const), [AUCUN, calcul(AUCUN)]])
  }, [taches.data, coches.index, refs.responsables, exercice, filtres])

  const erreur = taches.error ?? coches.erreur ?? refs.erreur
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!taches.data || !coches.pret || !refs.pret) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const personnes = [...refs.responsables.filter((r) => r.actif || parPersonne.get(r.id)?.aVenir.length), { id: AUCUN, nom: 'Sans responsable', actif: true }]
  const actif = choisi ?? personnes[0]?.id
  const donnees = actif ? parPersonne.get(actif) : undefined
  const nom = personnes.find((p) => p.id === actif)?.nom ?? ''
  const nbTaches = taches.data.filter((t) => (actif === AUCUN ? !t.responsable_id : t.responsable_id === actif)).length

  async function toutReassigner() {
    if (!actif || actif === AUCUN) return
    const cible = vers === AUCUN ? null : vers
    const nomCible = cible ? refs.responsable.get(cible)?.nom : 'personne'
    if (!confirm(`Passer les ${nbTaches} tâches de ${nom} à ${nomCible} ?`)) return
    try {
      const n = await reassigner(actif, cible)
      setMessage({ texte: `${n} tâche${n > 1 ? 's' : ''} passée${n > 1 ? 's' : ''} à ${nomCible}.` })
      setVers('')
    } catch (e) {
      setMessage({ texte: messageErreur(e), erreur: true })
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-[15rem_1fr]">
      <nav className={`${ui.carte} self-start p-1.5`} aria-label="Responsables">
        {personnes.map((p) => {
          const d = parPersonne.get(p.id)
          return (
            <button
              key={p.id}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${actif === p.id ? 'bg-foret-100 text-foret-800' : 'hover:bg-pierre-50'}`}
              onClick={() => {
                setChoisi(p.id)
                setMessage(null)
              }}
            >
              <span className={`flex-1 ${p.id === AUCUN ? 'italic text-pierre-500' : 'font-medium'}`}>{p.nom}</span>
              {!!d?.enRetard.length && <span className="rounded-full bg-red-50 px-1.5 text-xs tabular-nums text-red-800">{d.enRetard.length}</span>}
              {!!d?.ceMois && <span className="rounded-full bg-pierre-100 px-1.5 text-xs tabular-nums text-pierre-700">{d.ceMois}</span>}
            </button>
          )
        })}
        <p className="px-2.5 pb-1 pt-2 text-[11px] text-pierre-500">
          <span className="text-red-800">rouge</span> : en retard · gris : à faire ce mois-ci
        </p>
      </nav>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{nom}</h2>
            <p className="text-sm text-pierre-500">
              {nbTaches} tâche{nbTaches > 1 ? 's' : ''} · d'ici la fin de l'exercice {libelleExercice(exercice)}
            </p>
          </div>
          {ecriture && actif !== AUCUN && nbTaches > 0 && (
            <div className="flex items-center gap-2">
              <select aria-label="Réassigner à" className={`${ui.champ} w-auto`} value={vers} onChange={(e) => setVers(e.target.value)}>
                <option value="">Tout réassigner à…</option>
                {refs.responsables
                  .filter((r) => r.id !== actif && r.actif)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nom}
                    </option>
                  ))}
                <option value={AUCUN}>Personne</option>
              </select>
              <button className={ui.boutonSecondaire} disabled={!vers} onClick={toutReassigner}>
                Réassigner
              </button>
            </div>
          )}
        </div>
        <BarreFiltres filtres={filtres} changer={changerFiltres} refs={refs} sans={['responsable']} />
        {message && <p className={message.erreur ? ui.erreur : 'rounded-lg bg-foret-50 px-3 py-2 text-sm text-foret-800'}>{message.texte}</p>}

        {donnees && donnees.enRetard.length > 0 && <Bloc titre="En retard" passages={donnees.enRetard} refs={refs} rouge />}
        {donnees?.aVenir.map((m) => <Bloc key={m.cle} titre={majuscule(libelleMois(m.cle))} passages={m.passages} refs={refs} />)}
        {donnees && !donnees.enRetard.length && !donnees.aVenir.length && <p className="text-sm text-pierre-500">Rien d'ici la fin de l'exercice.</p>}
      </div>
    </div>
  )
}

function Bloc({ titre, passages, refs, rouge }: { titre: string; passages: Passage[]; refs: References; rouge?: boolean }) {
  return (
    <section className={`${ui.carte} ${rouge ? 'border-red-200' : ''}`}>
      <h3 className={`border-b px-3 py-2 text-sm font-semibold ${rouge ? 'border-red-100 text-red-800' : 'border-pierre-100'}`}>
        {titre} <span className="font-normal text-pierre-500">({passages.length})</span>
      </h3>
      <ul className="divide-y divide-pierre-100">
        {passages.map((p) => (
          <LigneTache key={`${p.tache.id}|${p.periode}`} {...p} refs={refs} montrer={{ entreprise: true, projet: true, responsable: false, mois: rouge }} />
        ))}
      </ul>
    </section>
  )
}
