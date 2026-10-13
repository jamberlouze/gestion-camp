import { useMemo, useState, type FormEvent } from 'react'
import { BoutonSupprimer } from '@/lib/BoutonsAction'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { IconePlus } from '@/lib/icones'
import { CompteurPieces } from '@/lib/PiecesJointes'
import { ui } from '@/lib/ui'
import { parBatiment, supprimerValveEtFichiers, useEnregistrerValve, useRelire, useSupprimerValve, type Donnees } from './donnees'
import { Fichiers } from './Fichiers'
import { termes, normaliser } from './outils'
import { EAUX, type Eau, type Valve } from './types'

const PASTILLES: Record<Eau, string> = {
  chaude: 'border-red-200 bg-red-50 text-red-800',
  froide: 'border-sky-200 bg-sky-50 text-sky-800',
  les_deux: 'border-violet-200 bg-violet-50 text-violet-800',
}
const LIBELLES = Object.fromEntries(EAUX.map((e) => [e.id, e.libelle])) as Record<Eau, string>

/** Onglet Valves : ce que chaque valve coupe et où elle est, par bâtiment. */
export function Valves({ d, ecriture }: { d: Donnees; ecriture: boolean }) {
  const [recherche, setRecherche] = useState('')
  const [fiche, setFiche] = useState<{ id: string | null } | null>(null)

  const valves = useMemo(() => {
    const tests = termes(recherche)
    return d.valves.filter((v) => {
      const texte = normaliser([v.coupe, v.emplacement, v.note, v.eau && LIBELLES[v.eau], v.batiment_id && d.batiment.get(v.batiment_id)?.nom].filter(Boolean).join(' '))
      return tests.every((t) => t(texte))
    })
  }, [d, recherche])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input type="search" aria-label="Chercher une valve" className={`${ui.champ} sm:flex-1`} placeholder="Chercher : Pins, eau chaude, laveuse…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        {ecriture && (
          <button className={`${ui.bouton} self-start`} onClick={() => setFiche({ id: null })}>
            <IconePlus className="size-4" /> Valve
          </button>
        )}
      </div>

      {valves.length === 0 ? (
        <p className="py-8 text-center text-sm text-pierre-500">{recherche ? 'Rien trouvé.' : 'Aucune valve notée.'}</p>
      ) : (
        parBatiment(d, valves).map(({ batiment, elements }) => (
          <section key={batiment?.id ?? 'sans'}>
            <h2 className="mb-2 text-sm font-semibold text-pierre-700">{batiment?.nom ?? 'Sans bâtiment'}</h2>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {elements.map((v) => (
                <li key={v.id}>
                  <button className={`${ui.carte} flex h-full w-full flex-col gap-1 p-3 text-left hover:border-foret-600 ${v.a_verifier ? 'border-amber-400' : ''}`} onClick={() => setFiche({ id: v.id })}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {v.eau && <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${PASTILLES[v.eau]}`}>{LIBELLES[v.eau]}</span>}
                      {v.a_verifier && <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">À vérifier</span>}
                      <CompteurPieces pieces={d.fichiersDe(v.id)} />
                    </span>
                    <span className="font-medium">{v.coupe}</span>
                    <span className="text-sm text-pierre-600">{v.emplacement ?? 'Emplacement à préciser'}</span>
                    {v.note && <span className="line-clamp-2 text-xs text-pierre-500">{v.note}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {fiche && <FicheValve d={d} id={fiche.id} ecriture={ecriture} fermer={() => setFiche(null)} />}
    </div>
  )
}

/** Fiche d'une valve ; marche sans réseau (sauf les photos). `id` null = nouvelle. */
function FicheValve({ d, id, ecriture, fermer }: { d: Donnees; id: string | null; ecriture: boolean; fermer: () => void }) {
  const valve = id ? d.valves.find((v) => v.id === id) : undefined
  const enregistrer = useEnregistrerValve()
  const supprimer = useSupprimerValve()
  const relire = useRelire()
  const [coupe, setCoupe] = useState(valve?.coupe ?? '')
  const [eau, setEau] = useState<Eau | ''>(valve?.eau ?? '')
  const [batiment, setBatiment] = useState(valve?.batiment_id ?? d.batiments[0]?.id ?? '')
  const [emplacement, setEmplacement] = useState(valve?.emplacement ?? '')
  const [note, setNote] = useState(valve?.note ?? '')
  const [aVerifier, setAVerifier] = useState(valve?.a_verifier ?? false)
  const [erreur, setErreur] = useState<string | null>(null)

  if (id && !valve) return null
  const fichiers = valve ? d.fichiersDe(valve.id) : []
  const lecture = !ecriture

  function soumettre(e: FormEvent) {
    e.preventDefault()
    if (!coupe.trim()) return
    enregistrer.mutate({
      id: valve?.id ?? crypto.randomUUID(),
      batiment_id: batiment || null,
      coupe: coupe.trim(),
      eau: eau || null,
      emplacement: emplacement.trim() || null,
      a_verifier: aVerifier,
      note: note.trim() || null,
      ordre: valve?.ordre ?? Math.max(0, ...d.valves.map((v) => v.ordre)) + 1,
    })
    fermer()
  }

  async function retirer(v: Valve) {
    if (!(await confirmer({ titre: 'Supprimer cette valve ?', message: fichiers.length ? 'Ses photos seront effacées aussi.' : undefined, libelleOk: 'Supprimer', danger: true }))) return
    if (!fichiers.length) {
      supprimer.mutate(v.id)
      return fermer()
    }
    // Avec des photos : en ligne, pour retirer aussi les fichiers du seau.
    try {
      await supprimerValveEtFichiers(v, fichiers)
      await relire()
      fermer()
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  return (
    <Dialogue titre={valve ? valve.coupe : 'Nouvelle valve'} fermer={fermer}>
      <form onSubmit={soumettre} className="space-y-3">
        <div>
          <label className={ui.etiquette} htmlFor="vl-coupe">
            Ce qu'elle coupe
          </label>
          <input id="vl-coupe" required disabled={lecture} className={ui.champ} value={coupe} placeholder="Pins Bas + Pins Haut" autoFocus={!valve} onChange={(e) => setCoupe(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={ui.etiquette} htmlFor="vl-eau">
              Eau
            </label>
            <select id="vl-eau" disabled={lecture} className={ui.champ} value={eau} onChange={(e) => setEau(e.target.value as Eau | '')}>
              <option value="">Autre</option>
              {EAUX.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.libelle}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="vl-batiment">
              Bâtiment
            </label>
            <select id="vl-batiment" disabled={lecture} className={ui.champ} value={batiment} onChange={(e) => setBatiment(e.target.value)}>
              <option value="">—</option>
              {d.batiments.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nom}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="vl-emplacement">
            Où elle est
          </label>
          <input id="vl-emplacement" disabled={lecture} className={ui.champ} value={emplacement} placeholder="Derrière la laveuse" onChange={(e) => setEmplacement(e.target.value)} />
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="vl-note">
            Note
          </label>
          <textarea id="vl-note" rows={2} disabled={lecture} className={ui.champ} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={lecture} className="size-4 accent-amber-600" checked={aVerifier} onChange={(e) => setAVerifier(e.target.checked)} />
          À vérifier sur place
        </label>
        <div>
          <p className={ui.etiquette}>Photos (où elle est)</p>
          {valve ? (
            <Fichiers cible={{ valve_id: valve.id }} fichiers={fichiers} ecriture={ecriture} />
          ) : (
            <p className="text-sm text-pierre-500">Les photos s’ajoutent une fois la valve enregistrée.</p>
          )}
        </div>
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex items-center gap-2 pt-1">
          {valve && ecriture && <BoutonSupprimer onClick={() => retirer(valve)} />}
          <div className="ml-auto flex gap-2">
            <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
              {ecriture ? 'Annuler' : 'Fermer'}
            </button>
            {ecriture && <button className={ui.bouton}>Enregistrer</button>}
          </div>
        </div>
      </form>
    </Dialogue>
  )
}
