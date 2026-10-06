import { useMemo, useState, type FormEvent } from 'react'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { useAuth } from '@/shell/auth'
import { BandeauNotes } from './BandeauNotes'
import { useCreerEmbarcation, useEmbarcations, useMajEmbarcation, useModeles } from './donnees'
import { correspondNumero, exporterCsv, joindre, trier, type ChampTri, type Ligne, type Tri } from './outils'
import { ENTREPRISES, TYPES, type Entreprise, type Modele } from './types'

interface Filtres {
  recherche: string
  type: string
  modele: string
  etat: '' | 'fonctionnelle' | 'defaillante'
}

const FILTRES_VIDES: Filtres = { recherche: '', type: '', modele: '', etat: '' }

export function Inventaire() {
  const { peutEcrire } = useAuth()
  const ecriture = peutEcrire('embarcations')
  const grandEcran = useMediaQuery('(min-width: 768px)')
  const modeles = useModeles()
  const embarcations = useEmbarcations()
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES)
  const [tri, setTri] = useState<Tri>({ champ: 'numero', sens: 'asc' })
  const [creation, setCreation] = useState(false)
  const [ajoutNote, setAjoutNote] = useState(false)

  const lignes = useMemo(() => {
    const toutes = joindre(embarcations.data ?? [], modeles.data ?? [])
    const filtrees = toutes.filter(
      (l) =>
        // Une création pas encore synchronisée répond au préfixe de son modèle.
        correspondNumero(l.numero_identification ?? `${l.modele.prefix_id}-`, filtres.recherche) &&
        (!filtres.type || l.modele.type === filtres.type) &&
        (!filtres.modele || l.modele_id === filtres.modele) &&
        (!filtres.etat || l.fonctionnel === (filtres.etat === 'fonctionnelle')),
    )
    return trier(filtrees, tri)
  }, [embarcations.data, modeles.data, filtres, tri])

  const erreur = embarcations.error ?? modeles.error
  if (!embarcations.data || !modeles.data) {
    return erreur ? (
      <p className={ui.erreur}>{messageErreur(erreur)}</p>
    ) : (
      <p className="py-8 text-center text-sm text-pierre-500">Chargement de la flotte…</p>
    )
  }

  const filtresActifs = JSON.stringify(filtres) !== JSON.stringify(FILTRES_VIDES)
  const flotte = trier(joindre(embarcations.data, modeles.data), { champ: 'numero', sens: 'asc' })

  return (
    <div>
      <BandeauNotes flotte={flotte} ecriture={ecriture} ajout={ajoutNote} fermerAjout={() => setAjoutNote(false)} />
      <BarreFiltres
        filtres={filtres}
        setFiltres={setFiltres}
        modeles={modeles.data}
        actions={
          <>
            {ecriture && (
              <button className={ui.bouton} onClick={() => setCreation(true)}>
                + Nouvelle
              </button>
            )}
            {ecriture && (
              <button className={ui.boutonSecondaire} onClick={() => setAjoutNote(true)} title="Noter quelque chose à traiter">
                + Note
              </button>
            )}
            {grandEcran && (
              <button className={ui.boutonSecondaire} onClick={() => exporterCsv(lignes)}>
                Exporter CSV
              </button>
            )}
          </>
        }
      />

      <p className="mb-2 mt-3 text-sm text-pierre-500">
        {lignes.length} embarcation{lignes.length > 1 ? 's' : ''}
        {filtresActifs && (
          <button className="ml-2 text-foret-700 underline" onClick={() => setFiltres(FILTRES_VIDES)}>
            Effacer les filtres
          </button>
        )}
      </p>

      {lignes.length === 0 ? (
        <p className={`${ui.carte} p-8 text-center text-sm text-pierre-500`}>
          Aucune embarcation ne correspond à ces filtres.
        </p>
      ) : grandEcran ? (
        <TableauInventaire lignes={lignes} tri={tri} setTri={setTri} ecriture={ecriture} />
      ) : (
        <CartesInventaire lignes={lignes} ecriture={ecriture} />
      )}

      {creation && <DialogueNouvelle modeles={modeles.data} fermer={() => setCreation(false)} />}
    </div>
  )
}

// ------------------------------------------------------------------
// Filtres
// ------------------------------------------------------------------

function BarreFiltres({
  filtres,
  setFiltres,
  modeles,
  actions,
}: {
  filtres: Filtres
  setFiltres: (f: Filtres) => void
  modeles: Modele[]
  actions: React.ReactNode
}) {
  const maj = (champs: Partial<Filtres>) => setFiltres({ ...filtres, ...champs })
  const modelesVisibles = modeles.filter((m) => !filtres.type || m.type === filtres.type)
  const choix = 'rounded-lg border border-pierre-300 bg-white px-2.5 py-2 text-sm'

  return (
    <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
      <div className="flex gap-2 md:contents">
        <input
          type="search"
          inputMode="search"
          placeholder="Numéro (ex. KE-12)"
          aria-label="Rechercher par numéro"
          className={`${ui.champ} min-w-0 flex-1 md:w-56 md:flex-none`}
          value={filtres.recherche}
          onChange={(e) => maj({ recherche: e.target.value })}
        />
        <div className="flex shrink-0 gap-2 md:order-last md:ml-auto">{actions}</div>
      </div>
      <div className="sans-barre -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        <select
          aria-label="Type"
          className={choix}
          value={filtres.type}
          onChange={(e) => maj({ type: e.target.value, modele: '' })}
        >
          <option value="">Tous les types</option>
          {TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select aria-label="Modèle" className={choix} value={filtres.modele} onChange={(e) => maj({ modele: e.target.value })}>
          <option value="">Tous les modèles</option>
          {modelesVisibles.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nom} ({m.type})
            </option>
          ))}
        </select>
        <select
          aria-label="État"
          className={choix}
          value={filtres.etat}
          onChange={(e) => maj({ etat: e.target.value as Filtres['etat'] })}
        >
          <option value="">Tous les états</option>
          <option value="fonctionnelle">Fonctionnelles</option>
          <option value="defaillante">Défaillantes</option>
        </select>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------
// Ordinateur : tableau
// ------------------------------------------------------------------

function TableauInventaire({
  lignes,
  tri,
  setTri,
  ecriture,
}: {
  lignes: Ligne[]
  tri: Tri
  setTri: (t: Tri) => void
  ecriture: boolean
}) {
  const entete = (champ: ChampTri, libelle: string) => (
    <th className="px-3 py-2 font-medium" aria-sort={tri.champ === champ ? (tri.sens === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        className="inline-flex items-center gap-1 hover:text-pierre-900"
        onClick={() => setTri({ champ, sens: tri.champ === champ && tri.sens === 'asc' ? 'desc' : 'asc' })}
      >
        {libelle}
        <span className="text-xs">{tri.champ === champ ? (tri.sens === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  )

  return (
    <div className={`${ui.carte} overflow-x-auto`}>
      <table className="w-full text-sm">
        <thead className="border-b border-pierre-200 bg-pierre-50 text-left text-pierre-500">
          <tr>
            {entete('numero', 'Numéro')}
            {entete('modele', 'Modèle')}
            {entete('type', 'Type')}
            <th className="px-3 py-2 font-medium">Bouchon</th>
            {entete('etat', 'État')}
            <th className="px-3 py-2 font-medium">Entreprise</th>
            <th className="w-1/3 px-3 py-2 font-medium">Notes</th>
            {ecriture && <th />}
          </tr>
        </thead>
        <tbody className="divide-y divide-pierre-100">
          {lignes.map((l) => (
            <tr key={l.id} className="hover:bg-pierre-50">
              <td className="whitespace-nowrap px-3 py-1.5">
                <Numero ligne={l} />
              </td>
              <td className="whitespace-nowrap px-3 py-1.5">{l.modele.nom}</td>
              <td className="px-3 py-1.5">{l.modele.type}</td>
              <td className="px-3 py-1.5 text-pierre-500">{l.modele.bouchon ?? '—'}</td>
              <td className="px-3 py-1.5">
                <BoutonEtat ligne={l} ecriture={ecriture} />
              </td>
              <td className="px-3 py-1.5">
                <ChoixEntreprise ligne={l} ecriture={ecriture} />
              </td>
              <td className="px-3 py-1.5">
                <ChampNotes ligne={l} ecriture={ecriture} />
              </td>
              {ecriture && (
                <td className="px-3 py-1.5 text-right">
                  <BoutonSupprimer ligne={l} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ------------------------------------------------------------------
// Téléphone : cartes (une touche pour changer l'état, une pour les détails)
// ------------------------------------------------------------------

function CartesInventaire({ lignes, ecriture }: { lignes: Ligne[]; ecriture: boolean }) {
  const [ouverte, setOuverte] = useState<string | null>(null)
  return (
    <ul className="space-y-2">
      {lignes.map((l) => {
        const deplie = ouverte === l.id
        return (
          <li key={l.id} className={`${ui.carte} overflow-hidden`}>
            <div className="flex items-center gap-3 p-3">
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => setOuverte(deplie ? null : l.id)}
                aria-expanded={deplie}
                aria-label={`${l.numero_identification ?? 'Nouvelle embarcation'}, ${l.modele.type} ${l.modele.nom} : détails`}
              >
                <Numero ligne={l} grand />
                <p className="truncate text-sm text-pierre-500">
                  {l.modele.type} · {l.modele.nom}
                  {l.entreprise_utilisation ? ` · ${l.entreprise_utilisation}` : ''}
                </p>
                {l.notes && !deplie && <p className="mt-0.5 truncate text-sm text-pierre-700">{l.notes}</p>}
              </button>
              <BoutonEtat ligne={l} ecriture={ecriture} grand />
            </div>
            {deplie && (
              <div className="space-y-3 border-t border-pierre-100 bg-pierre-50 p-3">
                <div>
                  <span className={ui.etiquette}>Bouchon</span>
                  <p className="text-sm">{l.modele.bouchon ?? 'Aucun'}</p>
                </div>
                <div>
                  <label className={ui.etiquette}>Entreprise</label>
                  <ChoixEntreprise ligne={l} ecriture={ecriture} />
                </div>
                <div>
                  <label className={ui.etiquette}>Notes</label>
                  <ChampNotes ligne={l} ecriture={ecriture} multiligne />
                </div>
                {ecriture && (
                  <div className="text-right">
                    <BoutonSupprimer ligne={l} />
                  </div>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// ------------------------------------------------------------------
// Champs modifiables
// ------------------------------------------------------------------

function Numero({ ligne, grand }: { ligne: Ligne; grand?: boolean }) {
  if (!ligne.numero_identification) {
    return (
      <span className={`font-semibold text-pierre-500 ${grand ? 'text-lg' : ''}`} title="Le numéro sera attribué à la synchronisation">
        Nouveau · numéro à venir
      </span>
    )
  }
  return <span className={`font-semibold tabular-nums ${grand ? 'text-lg' : ''}`}>{ligne.numero_identification}</span>
}

/** Fonctionnelle / défaillante : couleur de statut + icône + libellé (jamais la couleur seule). */
function BoutonEtat({ ligne, ecriture, grand }: { ligne: Ligne; ecriture: boolean; grand?: boolean }) {
  const maj = useMajEmbarcation()
  const ok = ligne.fonctionnel
  const style = ok
    ? 'border-[#0ca30c]/40 bg-[#0ca30c]/10 text-pierre-900'
    : 'border-[#d03b3b]/50 bg-[#d03b3b]/10 text-pierre-900'
  return (
    <button
      disabled={!ecriture}
      onClick={() => maj.mutate({ id: ligne.id, champs: { fonctionnel: !ok } })}
      aria-label={`${ok ? 'Fonctionnelle' : 'Défaillante'}${ecriture ? ' — changer l’état' : ''}`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium disabled:cursor-default ${style} ${
        grand ? 'px-3.5 py-2 text-sm' : 'px-2.5 py-1 text-xs'
      }`}
    >
      <span aria-hidden className={`font-bold ${ok ? 'text-[#0a7d0a]' : 'text-[#b52f2f]'}`}>
        {ok ? '✓' : '✕'}
      </span>
      {ok ? 'Fonctionnelle' : 'Défaillante'}
    </button>
  )
}

function ChoixEntreprise({ ligne, ecriture }: { ligne: Ligne; ecriture: boolean }) {
  const maj = useMajEmbarcation()
  return (
    <select
      aria-label="Entreprise"
      disabled={!ecriture}
      className="w-full rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-pierre-300 focus:border-foret-600 disabled:hover:border-transparent md:w-auto"
      value={ligne.entreprise_utilisation ?? ''}
      onChange={(e) =>
        maj.mutate({ id: ligne.id, champs: { entreprise_utilisation: (e.target.value || null) as Entreprise | null } })
      }
    >
      <option value="">—</option>
      {ENTREPRISES.map((x) => (
        <option key={x}>{x}</option>
      ))}
    </select>
  )
}

/** Enregistre à la sortie du champ, seulement si le texte a changé. */
function ChampNotes({ ligne, ecriture, multiligne }: { ligne: Ligne; ecriture: boolean; multiligne?: boolean }) {
  const maj = useMajEmbarcation()
  const [texte, setTexte] = useState(ligne.notes ?? '')
  const [base, setBase] = useState(ligne.notes)
  // Une modification venue d'ailleurs remplace le texte affiché.
  if (ligne.notes !== base) {
    setBase(ligne.notes)
    setTexte(ligne.notes ?? '')
  }
  const sauver = () => {
    const notes = texte.trim() || null
    if (notes !== ligne.notes) maj.mutate({ id: ligne.id, champs: { notes } })
  }
  const commun = {
    'aria-label': 'Notes',
    disabled: !ecriture,
    value: texte,
    placeholder: ecriture ? 'Ajouter une note…' : '—',
    onChange: (e: { target: { value: string } }) => setTexte(e.target.value),
    onBlur: sauver,
  }
  return multiligne ? (
    <textarea {...commun} rows={3} className={ui.champ} />
  ) : (
    <input
      {...commun}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className="w-full rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-pierre-300 focus:border-foret-600 focus:bg-white focus:outline-none disabled:hover:border-transparent"
    />
  )
}

function BoutonSupprimer({ ligne }: { ligne: Ligne }) {
  const maj = useMajEmbarcation()
  return (
    <button
      className={ui.boutonDanger}
      onClick={async () => {
        if (await confirmer({ titre: `Retirer l'embarcation ${ligne.numero_identification ?? '(nouvelle)'} de la flotte ?`, libelleOk: 'Retirer' })) {
          maj.mutate({ id: ligne.id, champs: { deleted_at: new Date().toISOString() } })
        }
      }}
    >
      Retirer
    </button>
  )
}

// ------------------------------------------------------------------
// Nouvelle embarcation (numéro attribué par la base)
// ------------------------------------------------------------------

function DialogueNouvelle({ modeles, fermer }: { modeles: Modele[]; fermer: () => void }) {
  const creer = useCreerEmbarcation()
  const [modeleId, setModeleId] = useState('')
  const [entreprise, setEntreprise] = useState('')
  const [notes, setNotes] = useState('')

  function soumettre(e: FormEvent) {
    e.preventDefault()
    creer.mutate({
      id: crypto.randomUUID(),
      modele_id: modeleId,
      entreprise_utilisation: (entreprise || null) as Entreprise | null,
      notes: notes.trim() || null,
    })
    fermer()
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && fermer()}
    >
      <form
        onSubmit={soumettre}
        className="w-full space-y-4 rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl"
        role="dialog"
        aria-labelledby="titre-nouvelle"
      >
        <h2 id="titre-nouvelle" className="text-lg font-semibold">
          Nouvelle embarcation
        </h2>
        <div>
          <label className={ui.etiquette} htmlFor="ne-modele">
            Modèle
          </label>
          <select id="ne-modele" required className={ui.champ} value={modeleId} onChange={(e) => setModeleId(e.target.value)}>
            <option value="" disabled>
              Choisir…
            </option>
            {TYPES.map((t) => {
              const duType = modeles.filter((m) => m.type === t)
              return duType.length ? (
                <optgroup key={t} label={t}>
                  {duType.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nom} ({m.prefix_id})
                    </option>
                  ))}
                </optgroup>
              ) : null
            })}
          </select>
          <p className="mt-1 text-xs text-pierre-500">Le numéro est attribué automatiquement.</p>
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="ne-entreprise">
            Entreprise
          </label>
          <select id="ne-entreprise" className={ui.champ} value={entreprise} onChange={(e) => setEntreprise(e.target.value)}>
            <option value="">—</option>
            {ENTREPRISES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="ne-notes">
            Notes
          </label>
          <input id="ne-notes" className={ui.champ} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button className={ui.bouton}>Créer</button>
        </div>
      </form>
    </div>
  )
}
