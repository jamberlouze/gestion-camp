import { useState } from 'react'
import { BoutonModifier, BoutonSupprimer } from '@/lib/BoutonsAction'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { ui } from '@/lib/ui'
import { useDonnees } from './contexte'
import { useAjouterRecurrent, useModifierRecurrent, useSupprimerRecurrent } from './donnees'
import { INITIALES_JOURS, NOMS_JOURS, descriptionJours } from './outils'
import type { Recurrent } from './types'

/** Points fixes du quotidien (Topo RH, Topo terrain…). */
export function Reglages() {
  const { recurrents, ecriture } = useDonnees()
  const modifier = useModifierRecurrent()
  const [fiche, setFiche] = useState<Recurrent | 'nouveau' | null>(null)
  const tries = [...recurrents].sort((a, b) => a.ordre - b.ordre || a.texte.localeCompare(b.texte, 'fr'))

  const deplacer = (r: Recurrent, sens: -1 | 1) => {
    const i = tries.indexOf(r)
    const voisin = tries[i + sens]
    if (!voisin) return
    // Renumérote toute la liste pour éviter les égalités.
    const ordre = tries.map((x) => x.id)
    ordre[i] = voisin.id
    ordre[i + sens] = r.id
    ordre.forEach((id, n) => {
      if (tries.find((x) => x.id === id)!.ordre !== n + 1) modifier.mutate({ id, champs: { ordre: n + 1 } })
    })
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Points fixes</h2>
          <p className="text-sm text-pierre-600">
            Ils s'affichent d'eux-mêmes en haut de l'ordre du jour, les jours choisis (ou une fois par semaine, jusqu'à ce qu'on les traite).
          </p>
        </div>
        {ecriture && (
          <button className={ui.bouton} onClick={() => setFiche('nouveau')}>
            + Point fixe
          </button>
        )}
      </div>
      <ul className={`${ui.carte} divide-y divide-pierre-100`}>
        {tries.length === 0 && <li className="px-3 py-6 text-center text-sm text-pierre-500">Aucun point fixe.</li>}
        {tries.map((r, i) => (
          <li key={r.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 ${r.actif ? '' : 'opacity-50'}`}>
            {ecriture && (
              <span className="flex flex-col leading-none">
                <button type="button" className="px-1 text-xs text-pierre-400 hover:text-pierre-800 disabled:invisible" disabled={i === 0} onClick={() => deplacer(r, -1)} aria-label="Monter">
                  ▲
                </button>
                <button type="button" className="px-1 text-xs text-pierre-400 hover:text-pierre-800 disabled:invisible" disabled={i === tries.length - 1} onClick={() => deplacer(r, 1)} aria-label="Descendre">
                  ▼
                </button>
              </span>
            )}
            <span className="font-medium">{r.texte}</span>
            <span className="text-sm text-pierre-500">{r.actif ? descriptionJours(r.jours) : 'En pause'}</span>
            {ecriture && <BoutonModifier className="ml-auto" onClick={() => setFiche(r)} />}
          </li>
        ))}
      </ul>
      {fiche && <FenetreRecurrent recurrent={fiche === 'nouveau' ? undefined : fiche} ordre={tries.length + 1} fermer={() => setFiche(null)} />}
    </div>
  )
}

function FenetreRecurrent({ recurrent, ordre, fermer }: { recurrent?: Recurrent; ordre: number; fermer: () => void }) {
  const ajouter = useAjouterRecurrent()
  const modifier = useModifierRecurrent()
  const supprimer = useSupprimerRecurrent()
  const [texte, setTexte] = useState(recurrent?.texte ?? '')
  const [jours, setJours] = useState<number[]>(recurrent?.jours ?? [])
  const [actif, setActif] = useState(recurrent?.actif ?? true)

  const enregistrer = () => {
    if (!texte.trim()) return
    const champs = { texte: texte.trim(), jours: [...jours].sort(), actif }
    if (recurrent) modifier.mutate({ id: recurrent.id, champs })
    else {
      const ligne = { id: crypto.randomUUID(), ordre, ...champs }
      ajouter.mutate({ ligne, affiche: ligne })
    }
    fermer()
  }

  return (
    <Dialogue titre={recurrent ? 'Point fixe' : 'Nouveau point fixe'} fermer={fermer}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          enregistrer()
        }}
      >
        <label className="block">
          <span className={ui.etiquette}>Point</span>
          <input className={ui.champ} value={texte} onChange={(e) => setTexte(e.target.value)} required autoFocus />
        </label>
        <div>
          <span className={ui.etiquette}>Quand</span>
          <div className="flex flex-wrap gap-1">
            {INITIALES_JOURS.map((ini, i) => {
              const j = i + 1
              const pris = jours.includes(j)
              return (
                <button
                  key={j}
                  type="button"
                  title={NOMS_JOURS[i]}
                  aria-pressed={pris}
                  onClick={() => setJours(pris ? jours.filter((x) => x !== j) : [...jours, j])}
                  className={`min-w-9 rounded-lg border px-2 py-1 text-sm ${pris ? 'border-foret-600 bg-foret-50 font-medium text-foret-800' : 'border-pierre-300 text-pierre-600 hover:bg-pierre-50'}`}
                >
                  {ini}
                </button>
              )
            })}
          </div>
          <p className="mt-1 text-xs text-pierre-500">{descriptionJours(jours)}{!jours.length && ' : affiché jusqu’à ce qu’on le traite dans la semaine.'}</p>
        </div>
        <label className="inline-flex items-center gap-1.5 text-sm">
          <input type="checkbox" className="size-4 accent-foret-700" checked={actif} onChange={(e) => setActif(e.target.checked)} />
          Actif (décocher pour le mettre en pause, l'été par exemple)
        </label>
        <div className="flex items-center justify-between gap-2 pt-1">
          {recurrent ? (
            <BoutonSupprimer
              onClick={async () => {
                if (await confirmer({ titre: `Supprimer « ${recurrent.texte} » ?`, message: 'Les fois où il a été traité restent dans l’historique.', libelleOk: 'Supprimer', danger: true })) {
                  supprimer.mutate(recurrent.id)
                  fermer()
                }
              }}
            />
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
              Annuler
            </button>
            <button className={ui.bouton}>Enregistrer</button>
          </div>
        </div>
      </form>
    </Dialogue>
  )
}
