import { useRef, useState, type CSSProperties, type PointerEvent as EvenementPointeur, type ReactNode } from 'react'
import { IconePlus } from '@/lib/icones'
import { Dialogue } from '@/lib/Dialogue'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { jourCourt } from './dates'
import { useEnregistrer, type LignePresence } from './donnees'
import { LISTE_STATUTS, STATUTS_PRESENCE, type Personne, type PresenceSimple, type StatutPresence } from './types'

// Horaire de la direction (remplace le Google Sheets « Horaires Automne ») :
// rangée Direction de la grille du Calendrier. « + » choisit d'office la
// personne connectée (courriel de Réglages › Personnel) ; choix rapide
// Terrain / Télétravail / Congé ; plusieurs jours d'un coup en glissant sur
// la rangée (souris ou doigt) ; chaque choix peut être annulé.

/** Ce qu'« Annuler » remet : l'état d'avant de chaque jour touché. */
export interface Annulable {
  texte: string
  avant: LignePresence[]
}

/** Écrit des présences ; `annulable` : de quoi revenir en arrière. */
export type Ecrire = (lignes: LignePresence[], annulable: Annulable) => void

/** 16 px sur téléphone (sinon l'iPhone zoome dans le champ), 14 px dès `sm`, comme Travaux. */
const champ = ui.champ.replace('text-sm', 'text-base sm:text-sm')

const libelleJours = (jours: string[]) =>
  jours.length === 1 ? jourCourt(jours[0]) : `${jourCourt(jours[0])} → ${jourCourt(jours[jours.length - 1])}`

/** Trié par nom, comme avant ; les congés à la fin. */
function triees(presences: PresenceSimple[], nom: Map<string, string>) {
  return [...presences].sort(
    (a, b) =>
      Number(a.statut === 'conge') - Number(b.statut === 'conge') ||
      (nom.get(a.personnel_id) ?? '').localeCompare(nom.get(b.personnel_id) ?? '', 'fr'),
  )
}

export function RangeeDirection({
  jours,
  entete,
  colonnes,
  gabarit,
  personnel,
  noms,
  presences,
  ecriture,
  moi,
  ecrire,
}: {
  jours: string[]
  /** Première colonne (le secteur). */
  entete: ReactNode
  colonnes: string
  gabarit: CSSProperties
  /** Qu'on peut choisir (jamais les personnes retirées). */
  personnel: Personne[]
  /** Noms affichés, personnes retirées comprises (leurs journées passées restent). */
  noms: Map<string, string>
  /** Présences de la direction sur les jours affichés. */
  presences: PresenceSimple[]
  ecriture: boolean
  moi: Personne | null
  ecrire: Ecrire
}) {
  const [fenetre, setFenetre] = useState<string[] | null>(null)
  // Jours glissés : de l'indice `a` à l'indice `b` (dans un sens ou l'autre).
  const [selection, setSelection] = useState<{ a: number; b: number } | null>(null)
  const glisse = useRef<{ depart: number; pointeur: number; bouge: boolean } | null>(null)
  // Un glissement fini sur un « + » ne doit pas l'ouvrir en plus.
  const vientDeGlisser = useRef(false)

  const indiceSous = (x: number, y: number) => {
    const cible = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-jour-direction]')
    return cible ? Number(cible.dataset.jourDirection) : null
  }
  const debutGlisse = (e: EvenementPointeur<HTMLDivElement>) => {
    vientDeGlisser.current = false
    if (!ecriture || (e.pointerType === 'mouse' && e.button !== 0)) return
    const i = indiceSous(e.clientX, e.clientY)
    if (i !== null) glisse.current = { depart: i, pointeur: e.pointerId, bouge: false }
  }
  const suiteGlisse = (e: EvenementPointeur<HTMLDivElement>) => {
    const g = glisse.current
    if (!g || g.pointeur !== e.pointerId) return
    const i = indiceSous(e.clientX, e.clientY)
    if (i === null) return
    if (!g.bouge && i !== g.depart) {
      g.bouge = true
      // La souris peut sortir de la rangée : la fin du geste arrive quand même ici.
      if (e.pointerType === 'mouse') e.currentTarget.setPointerCapture(e.pointerId)
    }
    if (g.bouge) setSelection((s) => (s && s.b === i ? s : { a: g.depart, b: i }))
  }
  const finGlisse = (e: EvenementPointeur<HTMLDivElement>) => {
    const g = glisse.current
    if (!g || g.pointeur !== e.pointerId) return
    glisse.current = null
    setSelection(null)
    if (!g.bouge) return
    vientDeGlisser.current = true
    const fin = indiceSous(e.clientX, e.clientY) ?? g.depart
    setFenetre(jours.slice(Math.min(g.depart, fin), Math.max(g.depart, fin) + 1))
  }
  const abandon = () => {
    glisse.current = null
    setSelection(null)
  }
  const dansSelection = (i: number) => !!selection && i >= Math.min(selection.a, selection.b) && i <= Math.max(selection.a, selection.b)

  return (
    <>
      <div
        className={colonnes}
        style={gabarit}
        onPointerDown={debutGlisse}
        onPointerMove={suiteGlisse}
        onPointerUp={finGlisse}
        onPointerCancel={abandon}
      >
        {entete}
        {jours.map((j, i) => {
          const duJour = triees(
            presences.filter((p) => p.date === j),
            noms,
          )
          return (
            <div
              key={j}
              data-jour-direction={i}
              className={`relative min-h-9 border-b border-l border-pierre-200 p-1.5 ${ecriture ? 'touch-pan-y select-none' : ''} ${
                dansSelection(i) ? 'bg-sky-100' : ''
              }`}
            >
              <ul className="space-y-0.5 text-xs leading-4">
                {duJour.map((p) => {
                  const statut = p.statut ? STATUTS_PRESENCE[p.statut] : null
                  return (
                    <li key={p.id} className={p.statut === 'conge' ? 'text-pierre-400' : ''} title={statut?.libelle}>
                      {statut && (
                        <span aria-label={statut.libelle} className="mr-0.5">
                          {statut.emoji}
                        </span>
                      )}
                      <span className="font-medium">{noms.get(p.personnel_id) ?? '?'}</span>
                      {p.description && <span className={p.statut === 'conge' ? '' : 'text-pierre-500'}> · {p.description}</span>}
                    </li>
                  )
                })}
              </ul>
              {ecriture && (
                <button
                  className={`mt-0.5 inline-flex items-center gap-0.5 rounded px-1 text-xs text-pierre-500 hover:bg-pierre-100 hover:text-pierre-800 ${
                    duJour.length ? '' : 'opacity-60'
                  }`}
                  aria-label={`Direction, ${jourCourt(j)} : qui travaille`}
                  onClick={() => {
                    if (vientDeGlisser.current) return
                    setFenetre([j])
                  }}
                >
                  <IconePlus className="size-3" />
                  {duJour.length ? '' : 'Ajouter'}
                </button>
              )}
            </div>
          )
        })}
      </div>
      {fenetre && (
        <ChoixRapide
          jours={fenetre}
          visibles={jours}
          personnel={personnel}
          presences={presences}
          moi={moi}
          ecrire={ecrire}
          fermer={() => setFenetre(null)}
        />
      )}
    </>
  )
}

/**
 * Fenêtre du « + » (un jour) ou des jours glissés : la personne (la
 * personne connectée d'office), la note, puis un choix rapide qui
 * s'applique à tous les jours et ferme la fenêtre.
 */
function ChoixRapide({
  jours: joursDepart,
  visibles,
  personnel,
  presences,
  moi,
  ecrire,
  fermer,
}: {
  jours: string[]
  /** Jours affichés dans la grille : la fin de la plage se choisit parmi eux. */
  visibles: string[]
  personnel: Personne[]
  presences: PresenceSimple[]
  moi: Personne | null
  ecrire: Ecrire
  fermer: () => void
}) {
  const { profil } = useAuth()
  const enregistrerPersonne = useEnregistrer<Personne>('personnel')
  const debut = joursDepart[0]
  const [fin, setFin] = useState(joursDepart[joursDepart.length - 1])
  const jours = visibles.filter((j) => j >= debut && j <= fin)
  const [personneId, setPersonneId] = useState<string | null>(moi?.id ?? null)
  const presenceDe = (id: string, jour: string) => presences.find((p) => p.personnel_id === id && p.date === jour)
  const unJour = jours.length === 1
  const noteDe = (id: string | null) => (id && unJour ? (presenceDe(id, debut)?.description ?? '') : '')
  const [note, setNote] = useState(() => noteDe(moi?.id ?? null))

  const presentes = new Set(presences.filter((p) => jours.includes(p.date)).map((p) => p.personnel_id))
  const visible = (p: Personne) => p.actif || presentes.has(p.id) || p.id === moi?.id
  const parOrdre = (a: Personne, b: Personne) => Number(b.id === moi?.id) - Number(a.id === moi?.id) || a.ordre - b.ordre || a.nom.localeCompare(b.nom, 'fr')
  const direction = personnel.filter((p) => visible(p) && (p.secteur_principal === 'direction' || p.id === moi?.id)).sort(parOrdre)
  const autres = personnel.filter((p) => visible(p) && !direction.includes(p)).sort(parOrdre)
  const [voirAutres, setVoirAutres] = useState(() => autres.some((p) => p.id === personneId || presentes.has(p.id)))

  const choisie = personnel.find((p) => p.id === personneId) ?? null
  const actuelle = choisie && unJour ? presenceDe(choisie.id, debut) : undefined
  const joursPresents = choisie ? jours.filter((j) => presenceDe(choisie.id, j)) : []

  const choisir = (id: string) => {
    setPersonneId(id)
    setNote(noteDe(id))
  }

  /** L'état d'avant d'un jour, pour « Annuler ». */
  const avantDe = (p: Personne, jour: string): LignePresence => {
    const a = presenceDe(p.id, jour)
    return { personnel_id: p.id, date: jour, secteur: 'direction', present: !!a, statut: a?.statut ?? null, description: a?.description ?? null }
  }

  function appliquer(statut: StatutPresence) {
    if (!choisie) return
    const propre = note.trim() || null
    const lignes = jours.map<LignePresence>((jour) => ({
      personnel_id: choisie.id,
      date: jour,
      secteur: 'direction',
      present: true,
      statut,
      // Plusieurs jours sans note : chaque jour garde la sienne.
      description: unJour ? propre : (propre ?? presenceDe(choisie.id, jour)?.description ?? null),
    }))
    const s = STATUTS_PRESENCE[statut]
    ecrire(lignes, { texte: `${s.emoji} ${s.libelle} · ${choisie.nom} · ${libelleJours(jours)}`, avant: jours.map((j) => avantDe(choisie, j)) })
    fermer()
  }

  function retirer() {
    if (!choisie || !joursPresents.length) return
    const lignes = joursPresents.map<LignePresence>((jour) => ({ ...avantDe(choisie, jour), present: false }))
    ecrire(lignes, { texte: `Retiré : ${choisie.nom} · ${libelleJours(joursPresents)}`, avant: joursPresents.map((j) => avantDe(choisie, j)) })
    fermer()
  }

  const puce = (p: Personne) => {
    const statut = unJour ? presenceDe(p.id, debut)?.statut : null
    const present = unJour && !!presenceDe(p.id, debut)
    const active = p.id === personneId
    return (
      <button
        key={p.id}
        type="button"
        aria-pressed={active}
        className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3 py-1 text-sm ${
          active ? 'border-foret-700 bg-foret-700 text-white' : present ? 'border-foret-600/40 bg-foret-50 text-foret-900' : 'border-pierre-300 bg-white text-pierre-800 hover:bg-pierre-50'
        }`}
        onClick={() => choisir(p.id)}
      >
        {statut && <span aria-hidden>{STATUTS_PRESENCE[statut].emoji}</span>}
        {p.nom}
        {p.id === moi?.id && <span className={active ? 'text-white/80' : 'text-pierre-500'}>(moi)</span>}
      </button>
    )
  }

  const titre = `Direction · ${unJour ? jourCourt(debut) : `${libelleJours(jours)} (${jours.length} jours)`}`
  return (
    <Dialogue titre={titre} fermer={fermer}>
      <div className="space-y-4">
        <div>
          <p className={ui.etiquette}>Qui</p>
          <div className="flex flex-wrap gap-1.5">
            {direction.map(puce)}
            {voirAutres && autres.map(puce)}
            {!voirAutres && autres.length > 0 && (
              <button type="button" className="px-1 text-sm text-foret-700 underline" onClick={() => setVoirAutres(true)}>
                Autre personne…
              </button>
            )}
          </div>
          {!direction.length && !voirAutres && <p className="mt-1 text-xs text-pierre-500">Personne à la direction (Réglages › Personnel).</p>}
          {!moi && (
            <p className="mt-2 text-xs text-pierre-500">
              Votre compte n'est lié à personne : choisissez-vous{' '}
              {choisie && !choisie.courriel && profil?.courriel ? (
                <>
                  puis{' '}
                  <button
                    type="button"
                    className="text-foret-700 underline"
                    onClick={() => enregistrerPersonne.mutate({ id: choisie.id, courriel: profil.courriel.trim().toLowerCase() })}
                  >
                    C'est moi ({choisie.nom})
                  </button>{' '}
                  : la prochaine fois, « + » vous choisira d'office.
                </>
              ) : (
                'dans la liste (ou réglez votre courriel dans Réglages › Personnel).'
              )}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-pierre-600">Du {jourCourt(debut)} au</span>
          <select
            aria-label="Dernier jour"
            className={`${champ} w-auto! py-1.5`}
            value={fin}
            onChange={(e) => setFin(e.target.value)}
          >
            {visibles
              .filter((j) => j >= debut)
              .map((j) => (
                <option key={j} value={j}>
                  {jourCourt(j)}
                </option>
              ))}
          </select>
          {!unJour && <span className="text-pierre-500">({jours.length} jours)</span>}
        </div>

        <label className="block">
          <span className={ui.etiquette}>Note (facultative)</span>
          <input
            className={champ}
            placeholder={unJour ? "Ce qu'il ou elle fait…" : 'Laisser vide : chaque jour garde sa note'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <div className="grid grid-cols-3 gap-2">
          {LISTE_STATUTS.map((s) => {
            const st = STATUTS_PRESENCE[s]
            const deja = actuelle?.statut === s
            return (
              <button
                key={s}
                type="button"
                disabled={!choisie}
                className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-sm font-medium disabled:opacity-40 ${
                  deja ? 'border-foret-700 bg-foret-50 text-foret-900 ring-2 ring-foret-600/30' : 'border-pierre-300 bg-white text-pierre-800 hover:bg-pierre-50'
                }`}
                onClick={() => appliquer(s)}
              >
                <span className="text-2xl leading-none" aria-hidden>
                  {st.emoji}
                </span>
                {st.libelle}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {choisie && joursPresents.length > 0 ? (
            <button type="button" className={ui.boutonDanger} onClick={retirer}>
              Retirer {choisie.nom}
              {unJour ? '' : ` (${joursPresents.length} jour${joursPresents.length > 1 ? 's' : ''})`}
            </button>
          ) : (
            <span />
          )}
          <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
            Fermer
          </button>
        </div>
        {actuelle && !actuelle.statut && (
          <p className="text-xs text-pierre-500">Déjà au travail ce jour-là, sans précision : un choix rapide la donne.</p>
        )}
      </div>
    </Dialogue>
  )
}
