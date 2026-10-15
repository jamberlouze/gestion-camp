import { useMemo, useState, type FormEvent } from 'react'
import { BoutonSupprimer } from '@/lib/BoutonsAction'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { IconePlus } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { useEnregistrerDisjoncteur, useSupprimerDisjoncteur, type Donnees } from './donnees'
import { conflit, etiquette, texteLigne } from './outils'
import type { Disjoncteur, Ligne } from './types'

type Genre = 'plein' | 'demi1' | 'demi2' | 'bipolaire'

const genreDe = (d: Pick<Disjoncteur, 'demi' | 'bipolaire'>): Genre => (d.bipolaire ? 'bipolaire' : d.demi === 1 ? 'demi1' : d.demi === 2 ? 'demi2' : 'plein')

/** Ligne en cours de saisie (textes, jamais null). */
interface Saisie {
  cle: string
  piece: string
  quoi: string
}
const versSaisie = (l?: Ligne): Saisie => ({ cle: crypto.randomUUID(), piece: l?.piece ?? '', quoi: l?.quoi ?? '' })

export interface DefautsDisjoncteur {
  panneau_id: string
  position?: number
  demi?: 1 | 2
}

/**
 * Fiche d'un disjoncteur : emplacement, ce qu'il alimente (une ligne par
 * pièce et chose), note, « à vérifier ». `id` null = nouveau. Marche sans
 * réseau (file du module).
 */
export function FicheDisjoncteur({
  d,
  id,
  defauts,
  ecriture,
  fermer,
}: {
  d: Donnees
  id: string | null
  defauts: DefautsDisjoncteur
  ecriture: boolean
  fermer: () => void
}) {
  const existant = id ? d.disjoncteur.get(id) : undefined
  const enregistrer = useEnregistrerDisjoncteur()
  const supprimer = useSupprimerDisjoncteur()
  const [panneauId, setPanneauId] = useState(existant?.panneau_id ?? defauts.panneau_id)
  const [position, setPosition] = useState(String(existant?.position ?? defauts.position ?? ''))
  const [genre, setGenre] = useState<Genre>(existant ? genreDe(existant) : defauts.demi === 2 ? 'demi2' : defauts.demi === 1 ? 'demi1' : 'plein')
  const [lignes, setLignes] = useState<Saisie[]>(existant?.alimente.length ? existant.alimente.map(versSaisie) : [versSaisie()])
  const [note, setNote] = useState(existant?.note ?? '')
  const [aVerifier, setAVerifier] = useState(existant?.a_verifier ?? false)
  const [erreur, setErreur] = useState<string | null>(null)

  // Suggestions : pièces et choses déjà notées (garde les noms pareils d'une fiche à l'autre).
  const suggestions = useMemo(() => {
    const pieces = new Set<string>()
    const quois = new Set<string>()
    for (const x of d.disjoncteurs)
      for (const l of x.alimente) {
        if (l.piece) pieces.add(l.piece)
        if (l.quoi) quois.add(l.quoi)
      }
    const tri = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }))
    return { pieces: tri(pieces), quois: tri(quois) }
  }, [d.disjoncteurs])

  if (id && !existant) return null
  const panneau = d.panneau.get(panneauId)
  const titre = existant ? etiquette(d.panneau.get(existant.panneau_id), existant) : 'Nouveau disjoncteur'

  if (!ecriture && existant) return <Lecture d={d} existant={existant} titre={titre} fermer={fermer} />

  const changerLigne = (cle: string, champ: 'piece' | 'quoi', valeur: string) =>
    setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, [champ]: valeur } : l)))

  function soumettre(e: FormEvent) {
    e.preventDefault()
    const pos = Number(position)
    if (!Number.isInteger(pos) || pos < 1 || pos > 84) return setErreur('Emplacement : un nombre de 1 à 84.')
    const champs = {
      id: existant?.id ?? crypto.randomUUID(),
      panneau_id: panneauId,
      position: pos,
      demi: genre === 'demi1' ? (1 as const) : genre === 'demi2' ? (2 as const) : null,
      bipolaire: genre === 'bipolaire',
      alimente: lignes
        .map((l) => ({ piece: l.piece.trim() || null, quoi: l.quoi.trim() || null }))
        .filter((l) => l.piece || l.quoi),
      a_verifier: aVerifier,
      note: note.trim() || null,
    }
    const pris = conflit(d.disjoncteurs, champs)
    if (pris) return setErreur(`Cet emplacement est déjà pris par ${etiquette(d.panneau.get(pris.panneau_id), pris)}.`)
    const dernier = champs.bipolaire ? pos + 2 : pos
    if (panneau?.positions && dernier > panneau.positions) return setErreur(`Le panneau ${panneau.nom} n'a que ${panneau.positions} emplacements.`)
    enregistrer.mutate(champs)
    fermer()
  }

  async function retirer() {
    if (!existant) return
    if (!(await confirmer({ titre: `Supprimer ${titre} ?`, message: 'Ce qu’il alimente et sa note seront effacés.', libelleOk: 'Supprimer', danger: true }))) return
    supprimer.mutate(existant.id)
    fermer()
  }

  const pos = Number(position) || 0
  return (
    <Dialogue titre={titre} fermer={fermer}>
      <form onSubmit={soumettre} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={ui.etiquette} htmlFor="dj-panneau">
              Panneau
            </label>
            <select id="dj-panneau" className={ui.champ} value={panneauId} onChange={(e) => setPanneauId(e.target.value)}>
              {d.panneaux.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                  {p.emplacement ? ` — ${p.emplacement}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="dj-position">
              Emplacement
            </label>
            <input
              id="dj-position"
              required
              inputMode="numeric"
              className={ui.champ}
              value={position}
              autoFocus={!existant && !defauts.position}
              onChange={(e) => setPosition(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div className="col-span-2">
            <label className={ui.etiquette} htmlFor="dj-genre">
              Type
            </label>
            <select id="dj-genre" className={ui.champ} value={genre} onChange={(e) => setGenre(e.target.value as Genre)}>
              <option value="plein">Pleine largeur</option>
              <option value="demi1">Demi-disjoncteur {pos ? `${pos}-1` : '1'}</option>
              <option value="demi2">Demi-disjoncteur {pos ? `${pos}-2` : '2'}</option>
              <option value="bipolaire">Bipolaire {pos ? `${pos}-${pos + 2}` : ''} (240 V : chauffage, chauffe-eau…)</option>
            </select>
          </div>
        </div>

        <fieldset>
          <legend className={ui.etiquette}>Ce qu'il alimente</legend>
          <ul className="space-y-1.5">
            {lignes.map((l, i) => (
              <li key={l.cle} className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
                <input
                  aria-label={`Pièce, ligne ${i + 1}`}
                  className={ui.champ}
                  placeholder="Pièce (VFB 3…)"
                  list="dj-pieces"
                  value={l.piece}
                  autoFocus={!existant && !!defauts.position && i === 0}
                  onChange={(e) => changerLigne(l.cle, 'piece', e.target.value)}
                />
                <input
                  aria-label={`Quoi, ligne ${i + 1}`}
                  className={ui.champ}
                  placeholder="Quoi (lumière…)"
                  list="dj-quois"
                  value={l.quoi}
                  onChange={(e) => changerLigne(l.cle, 'quoi', e.target.value)}
                />
                <button
                  type="button"
                  aria-label={`Retirer la ligne ${i + 1}`}
                  className="rounded-lg px-2 text-pierre-400 hover:bg-red-50 hover:text-red-700"
                  onClick={() => setLignes((ls) => (ls.length > 1 ? ls.filter((x) => x.cle !== l.cle) : [versSaisie()]))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-foret-700 hover:underline" onClick={() => setLignes((ls) => [...ls, versSaisie()])}>
            <IconePlus className="size-4" /> Une ligne
          </button>
          <p className="mt-1 text-xs text-pierre-500">Rien de noté = à identifier sur place.</p>
          <datalist id="dj-pieces">
            {suggestions.pieces.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <datalist id="dj-quois">
            {suggestions.quois.map((q) => (
              <option key={q} value={q} />
            ))}
          </datalist>
        </fieldset>

        <div>
          <label className={ui.etiquette} htmlFor="dj-note">
            Note
          </label>
          <textarea id="dj-note" rows={2} className={ui.champ} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-amber-600" checked={aVerifier} onChange={(e) => setAVerifier(e.target.checked)} />
          À vérifier sur place
        </label>

        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex items-center gap-2 pt-1">
          {existant && <BoutonSupprimer onClick={retirer} />}
          <div className="ml-auto flex gap-2">
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

/** Fiche en lecture seule (quelqu'un qui ne modifie pas le module). */
function Lecture({ d, existant, titre, fermer }: { d: Donnees; existant: Disjoncteur; titre: string; fermer: () => void }) {
  const panneau = d.panneau.get(existant.panneau_id)
  return (
    <Dialogue titre={titre} fermer={fermer}>
      {panneau?.emplacement && <p className="-mt-2 mb-3 text-sm text-pierre-500">{panneau.emplacement}</p>}
      {existant.alimente.length ? (
        <ul className="space-y-1 text-sm">
          {existant.alimente.map((l, i) => (
            <li key={i}>{texteLigne(l)}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-amber-800">À identifier : rien de noté.</p>
      )}
      {existant.a_verifier && <p className="mt-2 text-sm text-amber-800">À vérifier sur place.</p>}
      {existant.note && <p className="mt-3 whitespace-pre-wrap text-sm text-pierre-700">{existant.note}</p>}
      <div className="mt-4 flex justify-end">
        <button className={ui.boutonSecondaire} onClick={fermer}>
          Fermer
        </button>
      </div>
    </Dialogue>
  )
}
