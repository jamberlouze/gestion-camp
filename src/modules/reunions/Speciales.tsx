import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BoutonModifier, BoutonSupprimer } from '@/lib/BoutonsAction'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { PuceCompagnie } from '@/lib/PuceCompagnie'
import { ui } from '@/lib/ui'
import { aujourdhui } from '@/shell/pokes'
import { AjoutPoint, CartePoint } from './commun'
import { nomReunion, useDonnees } from './contexte'
import { useAjouterPoints, useAjouterReunion, useModifierPoint, useModifierReunion, useSupprimerReunion } from './donnees'
import { dureeLisible, jourLisible } from './outils'
import { GABARITS, GENRES, type GenreReunion, type Point, type Reunion } from './types'

/** « 9 h », « 13 h 30 ». */
const heureLisible = (h: string) => {
  const [hh, mm] = h.split(':')
  return `${Number(hh)} h${mm && mm !== '00' ? ` ${mm}` : ''}`
}

/** Liste des réunions spéciales : à venir (et sans date), puis passées. */
export function Speciales() {
  const { reunions, points, entreprises, ecriture } = useDonnees()
  const [nouvelle, setNouvelle] = useState(false)
  const auj = aujourdhui()
  const aVenir = reunions.filter((r) => !r.jour || r.jour >= auj).sort((a, b) => (a.jour ?? '9999').localeCompare(b.jour ?? '9999'))
  const passees = reunions.filter((r) => r.jour && r.jour < auj).sort((a, b) => b.jour!.localeCompare(a.jour!))

  const Ligne = ({ r }: { r: Reunion }) => {
    const siens = points.filter((p) => p.reunion_id === r.id)
    const ouverts = siens.filter((p) => p.statut === 'ouvert').length
    const duree = siens.reduce((t, p) => t + (p.duree_min ?? 0), 0)
    const compagnie = entreprises.find((e) => e.id === r.entreprise_id)
    return (
      <li>
        <Link to={`/reunions/speciales/${r.id}`} className={`${ui.carte} flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:border-pierre-300`}>
          <span className="font-medium">{nomReunion(r)}</span>
          {compagnie && <PuceCompagnie compagnie={compagnie} court />}
          <span className="text-sm text-pierre-500">
            {r.jour ? jourLisible(r.jour, auj) : 'Date à fixer'}
            {r.heure && ` · ${heureLisible(r.heure)}`}
            {r.lieu && ` · ${r.lieu}`}
          </span>
          <span className="ml-auto text-xs text-pierre-500">
            {siens.length} point{siens.length > 1 ? 's' : ''}
            {ouverts > 0 && r.jour && r.jour < auj && ` · ${ouverts} non traité${ouverts > 1 ? 's' : ''}`}
            {duree > 0 && ` · ${dureeLisible(duree)}`}
          </span>
        </Link>
      </li>
    )
  }

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-pierre-600">MT Lab, post-mortem, planification : chaque réunion a son ordre du jour minuté et son compte rendu.</p>
        {ecriture && (
          <button className={ui.bouton} onClick={() => setNouvelle(true)}>
            + Nouvelle réunion
          </button>
        )}
      </div>
      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-pierre-500">À venir</h2>
        {aVenir.length === 0 ? <p className="text-sm text-pierre-500">Aucune réunion spéciale de prévue.</p> : <ul className="space-y-2">{aVenir.map((r) => <Ligne key={r.id} r={r} />)}</ul>}
      </section>
      {passees.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-pierre-500">Passées</h2>
          <ul className="space-y-2">
            {passees.map((r) => (
              <Ligne key={r.id} r={r} />
            ))}
          </ul>
        </section>
      )}
      {nouvelle && <FenetreReunion fermer={() => setNouvelle(false)} />}
    </div>
  )
}

/** Fiche d'une réunion spéciale : infos, ordre du jour minuté, compte rendu. */
export function Speciale() {
  const { id } = useParams()
  const { reunions, points, entreprises, ecriture } = useDonnees()
  const modifierPoint = useModifierPoint()
  const [fiche, setFiche] = useState(false)
  const r = reunions.find((x) => x.id === id)
  const auj = aujourdhui()

  if (!r)
    return (
      <p className="text-sm text-pierre-500">
        Cette réunion n'existe plus.{' '}
        <Link to="/reunions/speciales" className="text-foret-800 underline">
          Retour aux réunions spéciales
        </Link>
      </p>
    )

  const siens = points.filter((p) => p.reunion_id === r.id).sort((a, b) => a.ordre - b.ordre || a.created_at.localeCompare(b.created_at))
  const duree = siens.reduce((t, p) => t + (p.duree_min ?? 0), 0)
  const ouverts = siens.filter((p) => p.statut === 'ouvert')
  const compagnie = entreprises.find((e) => e.id === r.entreprise_id)
  const passee = !!r.jour && r.jour < auj

  // Heure de début de chaque point (si la réunion a une heure).
  const debuts = new Map<string, string>()
  if (r.heure) {
    const [h, m] = r.heure.split(':').map(Number)
    let minutes = h * 60 + m
    for (const p of siens) {
      debuts.set(p.id, heureLisible(`${Math.floor(minutes / 60) % 24}:${String(minutes % 60).padStart(2, '0')}`))
      minutes += p.duree_min ?? 0
    }
  }

  const deplacer = (p: Point, sens: -1 | 1) => {
    const i = siens.indexOf(p)
    const voisin = siens[i + sens]
    if (!voisin) return
    const ordreVoisin = voisin.ordre === p.ordre ? p.ordre + sens * 0.5 : voisin.ordre
    modifierPoint.mutate({ id: p.id, champs: { ordre: ordreVoisin } })
    modifierPoint.mutate({ id: voisin.id, champs: { ordre: p.ordre } })
  }

  const toutRenvoyer = async () => {
    if (await confirmer({ titre: `Renvoyer ${ouverts.length} point${ouverts.length > 1 ? 's' : ''} au quotidien ?`, message: 'Ils reviennent à l’ordre du jour de direction.', libelleOk: 'Renvoyer', danger: false }))
      ouverts.forEach((p) => modifierPoint.mutate({ id: p.id, champs: { reunion_id: null } }))
  }

  return (
    <div className="max-w-4xl space-y-5">
      <Link to="/reunions/speciales" className="text-sm text-pierre-500 hover:text-pierre-800">
        ← Réunions spéciales
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{nomReunion(r)}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-pierre-600">
            <span className="first-letter:uppercase">{r.jour ? jourLisible(r.jour, auj) : 'Date à fixer'}</span>
            {r.heure && <span>· {heureLisible(r.heure)}</span>}
            {r.lieu && <span>· {r.lieu}</span>}
            {compagnie && <PuceCompagnie compagnie={compagnie} />}
          </p>
        </div>
        {ecriture && <BoutonModifier onClick={() => setFiche(true)} />}
      </div>

      {(r.objectif || r.participants) && (
        <div className={`${ui.carte} grid gap-3 p-4 sm:grid-cols-2`}>
          {r.objectif && (
            <div>
              <p className={ui.etiquette}>Objectif</p>
              <p className="whitespace-pre-line text-sm">{r.objectif}</p>
            </div>
          )}
          {r.participants && (
            <div>
              <p className={ui.etiquette}>Participants</p>
              <p className="whitespace-pre-line text-sm">{r.participants}</p>
            </div>
          )}
        </div>
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-pierre-500">
            Ordre du jour ({siens.length}){duree > 0 && ` · ${dureeLisible(duree)}`}
          </h3>
          {passee && ouverts.length > 0 && ecriture && (
            <button type="button" className="text-sm text-foret-800 hover:underline" onClick={toutRenvoyer}>
              Renvoyer les {ouverts.length} non traités au quotidien
            </button>
          )}
        </div>
        {siens.length > 0 && (
          <ul className="space-y-1.5">
            {siens.map((p, i) => (
              <CartePoint
                key={p.id}
                point={p}
                avantActions={
                  <>
                    {debuts.get(p.id) && <span className="mr-1 text-xs tabular-nums text-pierre-400">{debuts.get(p.id)}</span>}
                    <button type="button" className="rounded px-1 text-pierre-400 hover:bg-pierre-100 hover:text-pierre-800 disabled:invisible" disabled={i === 0} onClick={() => deplacer(p, -1)} aria-label="Monter">
                      ↑
                    </button>
                    <button type="button" className="rounded px-1 text-pierre-400 hover:bg-pierre-100 hover:text-pierre-800 disabled:invisible" disabled={i === siens.length - 1} onClick={() => deplacer(p, 1)} aria-label="Descendre">
                      ↓
                    </button>
                  </>
                }
              />
            ))}
          </ul>
        )}
        {ecriture && <AjoutPoint reunionId={r.id} ordre={(siens.at(-1)?.ordre ?? 0) + 1} placeholder={`Ajouter un point à ${r.titre}…`} />}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-pierre-500">Compte rendu</h3>
        <CompteRendu key={`${r.id}-${r.compte_rendu ?? ''}`} reunion={r} />
      </section>

      {r.creee_par_nom && <p className="text-xs text-pierre-400">Créée par {r.creee_par_nom}</p>}
      {fiche && <FenetreReunion reunion={r} fermer={() => setFiche(false)} />}
    </div>
  )
}

/** Compte rendu, enregistré quand on quitte le champ (repart de la base si quelqu'un d'autre l'a changé). */
function CompteRendu({ reunion }: { reunion: Reunion }) {
  const { ecriture } = useDonnees()
  const modifier = useModifierReunion()
  const [texte, setTexte] = useState(reunion.compte_rendu ?? '')
  return (
    <textarea
      className={ui.champ + ' min-h-40'}
      value={texte}
      readOnly={!ecriture}
      placeholder="Notes prises pendant la réunion (enregistrées quand on quitte le champ)"
      onChange={(e) => setTexte(e.target.value)}
      onBlur={() => {
        const propre = texte.trim() || null
        if (propre !== (reunion.compte_rendu ?? null)) modifier.mutate({ id: reunion.id, champs: { compte_rendu: propre } })
      }}
    />
  )
}

const TITRES: Record<GenreReunion, string> = {
  mt_lab: 'MT Lab',
  post_mortem: 'Post-mortem',
  planification: 'Planification stratégique',
  autre: '',
}

function FenetreReunion({ reunion, fermer }: { reunion?: Reunion; fermer: () => void }) {
  const { entreprises, moi } = useDonnees()
  const ajouter = useAjouterReunion()
  const ajouterPoints = useAjouterPoints()
  const modifier = useModifierReunion()
  const supprimer = useSupprimerReunion()
  const naviguer = useNavigate()
  const [genre, setGenre] = useState<GenreReunion>(reunion?.genre ?? 'mt_lab')
  const [titre, setTitre] = useState(reunion?.titre ?? TITRES.mt_lab)
  const [jour, setJour] = useState(reunion?.jour ?? '')
  const [heure, setHeure] = useState(reunion?.heure?.slice(0, 5) ?? '')
  const [lieu, setLieu] = useState(reunion?.lieu ?? '')
  const [entreprise, setEntreprise] = useState(reunion?.entreprise_id ?? '')
  const [objectif, setObjectif] = useState(reunion?.objectif ?? '')
  const [participants, setParticipants] = useState(reunion?.participants ?? '')
  const [gabarit, setGabarit] = useState(true)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const changerGenre = (g: GenreReunion) => {
    // Le titre suit le genre tant qu'on ne l'a pas changé à la main.
    if (!reunion && Object.values(TITRES).includes(titre)) setTitre(TITRES[g])
    setGenre(g)
  }

  const enregistrer = async () => {
    if (!titre.trim() || envoi) return
    const champs = {
      titre: titre.trim(),
      genre,
      jour: jour || null,
      heure: heure || null,
      lieu: lieu.trim() || null,
      entreprise_id: entreprise || null,
      objectif: objectif.trim() || null,
      participants: participants.trim() || null,
    }
    if (reunion) {
      modifier.mutate({ id: reunion.id, champs })
      return fermer()
    }
    setEnvoi(true)
    try {
      const id = crypto.randomUUID()
      await ajouter.mutateAsync({ ligne: { id, ...champs }, affiche: { id, ...champs, compte_rendu: null, creee_par_nom: moi.nom, created_at: new Date().toISOString() } })
      if (gabarit && GABARITS[genre].length)
        ajouterPoints.mutate(GABARITS[genre].map(([texte, duree_min], i) => ({ texte, duree_min, reunion_id: id, ordre: i + 1, type: 'discussion' as const })))
      fermer()
      naviguer(`/reunions/speciales/${id}`)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La réunion n’a pas pu être créée.')
      setEnvoi(false)
    }
  }

  return (
    <Dialogue titre={reunion ? 'Réunion spéciale' : 'Nouvelle réunion spéciale'} fermer={fermer}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          enregistrer()
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={ui.etiquette}>Genre</span>
            <select className={ui.champ} value={genre} onChange={(e) => changerGenre(e.target.value as GenreReunion)}>
              {GENRES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.icone} {g.nom}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={ui.etiquette}>Compagnie (facultatif)</span>
            <select className={ui.champ} value={entreprise} onChange={(e) => setEntreprise(e.target.value)}>
              <option value="">Toutes</option>
              {entreprises
                .filter((e) => e.actif || e.id === entreprise)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nom}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className={ui.etiquette}>Titre</span>
          <input className={ui.champ} value={titre} onChange={(e) => setTitre(e.target.value)} required autoFocus={!!reunion} />
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
          <label className="block">
            <span className={ui.etiquette}>Date (vide = à fixer)</span>
            <input type="date" className={ui.champ} value={jour} onChange={(e) => setJour(e.target.value)} />
          </label>
          <label className="block">
            <span className={ui.etiquette}>Heure</span>
            <input type="time" className={ui.champ} value={heure} onChange={(e) => setHeure(e.target.value)} />
          </label>
        </div>
        <label className="block">
          <span className={ui.etiquette}>Lieu</span>
          <input className={ui.champ} value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder="MT Lab, salle du Pavillon…" />
        </label>
        <label className="block">
          <span className={ui.etiquette}>Objectif</span>
          <textarea className={ui.champ} rows={2} value={objectif} onChange={(e) => setObjectif(e.target.value)} placeholder="Ce qu'on veut avoir en sortant de la réunion" />
        </label>
        <label className="block">
          <span className={ui.etiquette}>Participants</span>
          <input className={ui.champ} value={participants} onChange={(e) => setParticipants(e.target.value)} />
        </label>
        {!reunion && GABARITS[genre].length > 0 && (
          <label className="flex items-start gap-2 rounded-lg bg-pierre-50 p-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-foret-700" checked={gabarit} onChange={(e) => setGabarit(e.target.checked)} />
            <span>
              Ordre du jour de départ :
              <span className="block text-xs text-pierre-500">{GABARITS[genre].map(([t, m]) => `${t} (${m} min)`).join(' · ')}</span>
            </span>
          </label>
        )}
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex items-center justify-between gap-2 pt-1">
          {reunion ? (
            <BoutonSupprimer
              onClick={async () => {
                if (
                  await confirmer({
                    titre: `Supprimer ${reunion.titre} ?`,
                    message: 'Les points non traités retournent au quotidien ; les points traités et le compte rendu sont effacés.',
                    libelleOk: 'Supprimer',
                    danger: true,
                  })
                ) {
                  supprimer.mutate(reunion.id)
                  fermer()
                  naviguer('/reunions/speciales')
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
            <button className={ui.bouton} disabled={envoi}>
              {reunion ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </div>
      </form>
    </Dialogue>
  )
}
