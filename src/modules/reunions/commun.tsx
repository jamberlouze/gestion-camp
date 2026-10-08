import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BoutonSupprimer } from '@/lib/BoutonsAction'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { ui } from '@/lib/ui'
import { aujourdhui } from '@/shell/pokes'
import { useAjouterPoint, useAjouterSuivi, useModifierPoint, useModifierSuivi, useSupprimerPoint, useSupprimerSuivi } from './donnees'
import { initiales, jourDe, jourLisible, ordreSuivis, teinte } from './outils'
import { aEnvoyer, affichageStatut, nomReunion, nouveauPoint, ordreEnFin, reunionsAVenir, useDonnees } from './contexte'
import { TYPES, type Point, type Recurrent, type StatutPoint, type Suivi, type TypePoint } from './types'

// ------------------------------------------------------------
// Petites pièces
// ------------------------------------------------------------

/** Pastille de la personne qui a ajouté le point (initiales, nom au survol). */
export function Auteur({ nom, titre = 'Ajouté par', taille = 'normal' }: { nom: string | null; titre?: string; taille?: 'normal' | 'petit' }) {
  return (
    <span
      title={nom ? `${titre} ${nom}` : undefined}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${teinte(nom)} ${
        taille === 'petit' ? 'size-5 text-[10px]' : 'size-7 text-xs'
      }`}
    >
      {initiales(nom)}
    </span>
  )
}

export function PuceType({ type }: { type: TypePoint }) {
  const t = TYPES.find((x) => x.id === type)!
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-xs ${t.classe}`} title={t.aide}>
      <span aria-hidden>{t.icone}</span>
      {t.nom}
    </span>
  )
}

export function ChoixType({ valeur, changer }: { valeur: TypePoint; changer: (t: TypePoint) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-pierre-200 bg-white p-0.5" role="radiogroup" aria-label="Type de point">
      {TYPES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={valeur === t.id}
          title={t.aide}
          onClick={() => changer(t.id)}
          className={`rounded-md px-2 py-1 text-xs font-medium ${valeur === t.id ? t.classe + ' ring-1 ring-inset ring-current/20' : 'text-pierre-500 hover:text-pierre-800'}`}
        >
          {t.icone} {t.nom}
        </button>
      ))}
    </div>
  )
}

/** Petit menu ancré sous un bouton « ⋯ ». */
export function MenuActions({ items }: { items: ({ libelle: string; action: () => void; danger?: boolean } | false | null)[] }) {
  const [ouvert, setOuvert] = useState(false)
  const boite = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: MouseEvent) => !boite.current?.contains(e.target as Node) && setOuvert(false)
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && setOuvert(false)
    document.addEventListener('mousedown', dehors)
    document.addEventListener('keydown', touche)
    return () => {
      document.removeEventListener('mousedown', dehors)
      document.removeEventListener('keydown', touche)
    }
  }, [ouvert])
  return (
    <div className="relative" ref={boite}>
      <button
        type="button"
        className="rounded-md px-2 py-1 text-pierre-500 hover:bg-pierre-100 hover:text-pierre-800"
        aria-label="Autres actions"
        aria-expanded={ouvert}
        onClick={() => setOuvert(!ouvert)}
      >
        ⋯
      </button>
      {ouvert && (
        <div className="absolute right-0 top-full z-30 mt-1 w-60 rounded-xl border border-pierre-200 bg-white py-1 shadow-lg">
          {items.filter(Boolean).map((i) => {
            const item = i as { libelle: string; action: () => void; danger?: boolean }
            return (
              <button
                key={item.libelle}
                type="button"
                className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-pierre-50 ${item.danger ? 'text-red-700' : 'text-pierre-800'}`}
                onClick={() => {
                  setOuvert(false)
                  item.action()
                }}
              >
                {item.libelle}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Carte d'un point
// ------------------------------------------------------------

export function CartePoint({
  point,
  reports = 0,
  avantActions,
  lecture,
  afficherJour,
}: {
  point: Point
  reports?: number
  /** Boutons propres à la vue (monter/descendre dans une réunion spéciale). */
  avantActions?: ReactNode
  /** Sans boutons (historique). */
  lecture?: boolean
  /** Montre le jour où le point a été traité (recherche). */
  afficherJour?: boolean
}) {
  const { ecriture, moi, suivis, reunions } = useDonnees()
  const modifier = useModifierPoint()
  const supprimer = useSupprimerPoint()
  const [traiter, setTraiter] = useState(false)
  const [fiche, setFiche] = useState(false)
  const [plusTard, setPlusTard] = useState(false)
  const sesSuivis = suivis.filter((s) => s.point_id === point.id).sort(ordreSuivis)
  const ouvert = point.statut === 'ouvert'
  const actif = ecriture && !lecture
  const auj = aujourdhui()

  const changerStatut = (statut: StatutPoint, champs: Partial<Point> = {}) =>
    modifier.mutate({ id: point.id, champs: { statut, ...champs }, affiche: affichageStatut(statut, moi) })

  const envoyerVers = (reunion: string | null) => modifier.mutate({ id: point.id, champs: { reunion_id: reunion, pour_le: null, ordre: ordreEnFin() } })

  const autres = reunionsAVenir(reunions).filter((r) => r.id !== point.reunion_id)
  const prochainLab = autres.find((r) => r.genre === 'mt_lab')

  return (
    <li className={`group rounded-xl border bg-white px-3 py-2.5 ${point.urgent && ouvert ? 'border-red-200' : 'border-pierre-200'} ${ouvert ? '' : 'bg-pierre-50/60'}`}>
      <div className="flex items-start gap-2.5">
        {point.recurrent_id ? (
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-pierre-100 text-sm text-pierre-500" title="Point fixe">
            ↻
          </span>
        ) : (
          <Auteur nom={point.auteur_nom} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              type="button"
              className={`text-left text-[15px] leading-snug ${ouvert ? 'font-medium text-pierre-900' : point.statut === 'retire' ? 'text-pierre-500 line-through' : 'text-pierre-700'} ${actif ? 'hover:underline' : 'cursor-default'}`}
              onClick={() => actif && setFiche(true)}
            >
              {point.urgent && ouvert && <span className="mr-1 text-red-600" title="Urgent">●</span>}
              {point.texte}
            </button>
            <PuceType type={point.type} />
            {point.duree_min && <span className="text-xs text-pierre-500">⏱ {point.duree_min} min</span>}
            {/* Un long point du quotidien : le proposer au prochain MT Lab. */}
            {actif && ouvert && !point.reunion_id && (point.duree_min ?? 0) > 10 && prochainLab && (
              <button
                type="button"
                className="rounded-full bg-violet-50 px-1.5 py-0.5 text-xs text-violet-800 hover:bg-violet-100"
                title={`Long pour le quotidien : l'envoyer à ${prochainLab.titre}`}
                onClick={() => envoyerVers(prochainLab.id)}
              >
                → {prochainLab.titre} ?
              </button>
            )}
            {reports > 0 && ouvert && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs ${reports >= 3 ? 'bg-red-50 text-red-700' : 'bg-pierre-100 text-pierre-600'}`}
                title={reports >= 3 ? 'Souvent reporté : le trancher, le confier ou l’envoyer au MT Lab ?' : 'Réunions où il était à l’ordre du jour sans être traité'}
              >
                reporté {reports}×
              </span>
            )}
            {point.pour_le && ouvert && point.pour_le > auj && <span className="text-xs text-pierre-500">pour le {jourLisible(point.pour_le, auj)}</span>}
            {afficherJour && point.traite_jour && <span className="text-xs text-pierre-500">{jourLisible(point.traite_jour, auj)}</span>}
          </div>
          {point.details && <p className="mt-0.5 whitespace-pre-line text-sm text-pierre-600">{point.details}</p>}
          {point.decision && (
            <p className="mt-1 text-sm text-pierre-800">
              <span className="font-medium text-foret-800">→ </span>
              {point.decision}
            </p>
          )}
          {!ouvert && (
            <p className="mt-0.5 text-xs text-pierre-400">
              {point.statut === 'retire' ? 'Retiré' : 'Traité'}
              {point.traite_par_nom && ` par ${point.traite_par_nom}`}
              {point.traite_le && !afficherJour && ` · ${jourLisible(jourDe(point.traite_le), auj)}`}
            </p>
          )}
          {sesSuivis.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {sesSuivis.map((s) => (
                <LigneSuivi key={s.id} suivi={s} lecture={lecture} />
              ))}
            </ul>
          )}
          {traiter && (
            <PanneauTraiter
              point={point}
              fermer={() => setTraiter(false)}
              fini={() => setTraiter(false)}
            />
          )}
          {plusTard && (
            <ChoixDate
              fermer={() => setPlusTard(false)}
              choisir={(jour) => {
                modifier.mutate({ id: point.id, champs: { pour_le: jour } })
                setPlusTard(false)
              }}
            />
          )}
        </div>
        {actif && (
          <div className="flex shrink-0 items-center gap-0.5">
            {avantActions}
            {ouvert && !traiter && (
              <button type="button" className="rounded-lg border border-foret-600/30 px-2.5 py-1 text-sm font-medium text-foret-800 hover:bg-foret-50" onClick={() => setTraiter(true)}>
                ✓ Traiter
              </button>
            )}
            {!ouvert && (
              <button type="button" className="rounded-lg px-2 py-1 text-xs text-pierre-500 hover:bg-pierre-100 hover:text-pierre-800" onClick={() => changerStatut('ouvert')}>
                Rouvrir
              </button>
            )}
            <MenuActions
              items={[
                { libelle: 'Modifier…', action: () => setFiche(true) },
                ouvert && !point.reunion_id && { libelle: 'Pour plus tard…', action: () => setPlusTard(true) },
                ouvert && !!point.reunion_id && { libelle: 'Renvoyer au quotidien', action: () => envoyerVers(null) },
                ...(ouvert ? autres.map((r) => ({ libelle: `Envoyer vers ${nomReunion(r)}${r.jour ? ` (${jourLisible(r.jour, auj, true)})` : ''}`, action: () => envoyerVers(r.id) })) : []),
                ouvert && { libelle: 'Plus pertinent (retirer)', action: () => changerStatut('retire') },
                {
                  libelle: 'Supprimer',
                  danger: true,
                  action: async () => {
                    if (await confirmer({ titre: 'Supprimer ce point ?', message: `« ${point.texte} » et ses suivis seront effacés.`, libelleOk: 'Supprimer', danger: true }))
                      supprimer.mutate(point.id)
                  },
                },
              ]}
            />
          </div>
        )}
      </div>
      {fiche && <FenetrePoint point={point} fermer={() => setFiche(false)} />}
    </li>
  )
}

function ChoixDate({ fermer, choisir }: { fermer: () => void; choisir: (jour: string) => void }) {
  const auj = aujourdhui()
  const [jour, setJour] = useState('')
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-pierre-50 p-2 text-sm">
      <span className="text-pierre-600">Ne le montrer qu'à partir du</span>
      <input type="date" min={auj} className="rounded-md border border-pierre-300 bg-white px-2 py-1" value={jour} onChange={(e) => setJour(e.target.value)} autoFocus />
      <button type="button" className={ui.bouton + ' !py-1'} disabled={!jour} onClick={() => choisir(jour)}>
        OK
      </button>
      <button type="button" className="text-pierre-500 underline" onClick={fermer}>
        Annuler
      </button>
    </div>
  )
}

// ------------------------------------------------------------
// Traiter un point : décision + suivis
// ------------------------------------------------------------

interface SuiviAFaire {
  cle: string
  texte: string
  responsable_id: string
  echeance: string
}

/**
 * Panneau ouvert sous le point pendant la réunion. Pour un point fixe
 * (pas encore de ligne), `point` est absent et `creer` crée la ligne.
 */
export function PanneauTraiter({
  point,
  recurrent,
  fermer,
  fini,
}: {
  point?: Point
  recurrent?: Recurrent
  fermer: () => void
  fini: () => void
}) {
  const { moi, personnes } = useDonnees()
  const ajouterPoint = useAjouterPoint()
  const modifier = useModifierPoint()
  const ajouterSuivi = useAjouterSuivi()
  const [decision, setDecision] = useState(point?.decision ?? '')
  const [aFaire, setAFaire] = useState<SuiviAFaire[]>([])
  const [envoi, setEnvoi] = useState(false)
  const responsableParDefaut = personnes.some((p) => p.id === moi.id) ? moi.id : ''

  const terminer = async (statut: StatutPoint) => {
    if (envoi) return
    setEnvoi(true)
    try {
      const propre = decision.trim() || null
      let id = point?.id
      if (point) {
        modifier.mutate({ id: point.id, champs: { statut, decision: propre }, affiche: affichageStatut(statut, moi) })
      } else if (recurrent) {
        const p = nouveauPoint({ texte: recurrent.texte, type: recurrent.type, recurrent_id: recurrent.id, statut, decision: propre }, moi)
        id = p.id
        await ajouterPoint.mutateAsync({ ligne: aEnvoyer(p), affiche: p })
      }
      for (const s of aFaire.filter((x) => x.texte.trim())) {
        const ligne = { id: crypto.randomUUID(), texte: s.texte.trim(), point_id: id ?? null, responsable_id: s.responsable_id || null, echeance: s.echeance || null }
        ajouterSuivi.mutate({
          ligne,
          affiche: {
            ...ligne,
            responsable_nom: personnes.find((p) => p.id === s.responsable_id)?.nom ?? null,
            fait_le: null,
            fait_par_nom: null,
            auteur_nom: moi.nom,
            created_at: new Date().toISOString(),
          },
        })
      }
      fini()
    } catch {
      // L'erreur est dans le bandeau du module.
      setEnvoi(false)
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-foret-600/20 bg-foret-50/50 p-2.5">
      <input
        className={ui.champ}
        placeholder="Décision ou ce qu'on retient (facultatif) — Entrée = traité"
        value={decision}
        autoFocus
        onChange={(e) => setDecision(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') terminer('traite')
          if (e.key === 'Escape') fermer()
        }}
      />
      {aFaire.map((s, i) => (
        <div key={s.cle} className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-pierre-500">↳</span>
          <input
            className="min-w-40 flex-1 rounded-md border border-pierre-300 bg-white px-2 py-1 text-sm"
            placeholder="Qui fait quoi"
            value={s.texte}
            autoFocus
            onChange={(e) => setAFaire(aFaire.map((x, j) => (j === i ? { ...x, texte: e.target.value } : x)))}
            onKeyDown={(e) => e.key === 'Enter' && terminer('traite')}
          />
          <select
            className="rounded-md border border-pierre-300 bg-white px-2 py-1 text-sm"
            value={s.responsable_id}
            onChange={(e) => setAFaire(aFaire.map((x, j) => (j === i ? { ...x, responsable_id: e.target.value } : x)))}
            aria-label="Responsable"
          >
            <option value="">Personne</option>
            {personnes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="rounded-md border border-pierre-300 bg-white px-2 py-1 text-sm"
            value={s.echeance}
            onChange={(e) => setAFaire(aFaire.map((x, j) => (j === i ? { ...x, echeance: e.target.value } : x)))}
            aria-label="Échéance"
          />
          <button type="button" className="px-1 text-pierre-400 hover:text-red-600" onClick={() => setAFaire(aFaire.filter((_, j) => j !== i))} aria-label="Retirer ce suivi">
            ✕
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={ui.bouton + ' !py-1.5'} onClick={() => terminer('traite')} disabled={envoi}>
          ✓ Traité
        </button>
        <button
          type="button"
          className="rounded-lg px-2 py-1.5 text-sm text-foret-800 hover:bg-foret-100"
          onClick={() => setAFaire([...aFaire, { cle: crypto.randomUUID(), texte: '', responsable_id: responsableParDefaut, echeance: '' }])}
        >
          + Suivi
        </button>
        {recurrent && !recurrent.jours.length && (
          <button type="button" className="rounded-lg px-2 py-1.5 text-sm text-pierre-600 hover:bg-pierre-100" onClick={() => terminer('retire')} disabled={envoi}>
            Pas cette semaine
          </button>
        )}
        {recurrent && recurrent.jours.length > 0 && (
          <button type="button" className="rounded-lg px-2 py-1.5 text-sm text-pierre-600 hover:bg-pierre-100" onClick={() => terminer('retire')} disabled={envoi}>
            Pas aujourd'hui
          </button>
        )}
        <button type="button" className="ml-auto text-sm text-pierre-500 underline" onClick={fermer}>
          Annuler
        </button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Suivis
// ------------------------------------------------------------

export function LigneSuivi({ suivi, lecture, avecPoint }: { suivi: Suivi; lecture?: boolean; avecPoint?: boolean }) {
  const { ecriture, points, moi } = useDonnees()
  const modifier = useModifierSuivi()
  const [fiche, setFiche] = useState(false)
  const auj = aujourdhui()
  const fait = !!suivi.fait_le
  const enRetard = !fait && suivi.echeance && suivi.echeance < auj
  const actif = ecriture && !lecture
  const point = avecPoint && suivi.point_id ? points.find((p) => p.id === suivi.point_id) : undefined
  return (
    <li className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-foret-700"
        checked={fait}
        disabled={!actif}
        onChange={() =>
          modifier.mutate({
            id: suivi.id,
            champs: { fait_le: fait ? null : new Date().toISOString() },
            affiche: { fait_par_nom: fait ? null : moi.nom },
          })
        }
        aria-label={fait ? 'Marquer à faire' : 'Marquer fait'}
      />
      <div className="min-w-0 flex-1">
        <button type="button" className={`text-left ${fait ? 'text-pierre-400 line-through' : 'text-pierre-800'} ${actif ? 'hover:underline' : 'cursor-default'}`} onClick={() => actif && setFiche(true)}>
          {suivi.texte}
        </button>
        {suivi.responsable_nom && (
          <span className="ml-1.5 inline-flex items-center gap-1 align-middle text-xs text-pierre-600">
            <Auteur nom={suivi.responsable_nom} titre="Responsable :" taille="petit" />
            {suivi.responsable_nom.split(' ')[0]}
          </span>
        )}
        {suivi.echeance && (
          <span className={`ml-1.5 text-xs ${enRetard ? 'font-medium text-red-700' : 'text-pierre-500'}`}>
            {enRetard ? 'en retard · ' : ''}
            {jourLisible(suivi.echeance, auj, true)}
          </span>
        )}
        {point && <span className="ml-1.5 text-xs text-pierre-400">· {point.texte}</span>}
      </div>
      {fiche && <FenetreSuivi suivi={suivi} fermer={() => setFiche(false)} />}
    </li>
  )
}

export function FenetreSuivi({ suivi, pointId, fermer }: { suivi?: Suivi; pointId?: string; fermer: () => void }) {
  const { personnes, moi } = useDonnees()
  const ajouter = useAjouterSuivi()
  const modifier = useModifierSuivi()
  const supprimer = useSupprimerSuivi()
  const [texte, setTexte] = useState(suivi?.texte ?? '')
  const [responsable, setResponsable] = useState(suivi?.responsable_id ?? (personnes.some((p) => p.id === moi.id) ? moi.id : ''))
  const [echeance, setEcheance] = useState(suivi?.echeance ?? '')

  const enregistrer = () => {
    if (!texte.trim()) return
    const champs = { texte: texte.trim(), responsable_id: responsable || null, echeance: echeance || null }
    const responsable_nom = personnes.find((p) => p.id === responsable)?.nom ?? null
    if (suivi) modifier.mutate({ id: suivi.id, champs, affiche: { responsable_nom } })
    else {
      const ligne = { id: crypto.randomUUID(), point_id: pointId ?? null, ...champs }
      ajouter.mutate({ ligne, affiche: { ...ligne, responsable_nom, fait_le: null, fait_par_nom: null, auteur_nom: moi.nom, created_at: new Date().toISOString() } })
    }
    fermer()
  }

  return (
    <Dialogue titre={suivi ? 'Suivi' : 'Nouveau suivi'} fermer={fermer}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          enregistrer()
        }}
      >
        <label className="block">
          <span className={ui.etiquette}>Quoi</span>
          <input className={ui.champ} value={texte} onChange={(e) => setTexte(e.target.value)} autoFocus required />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={ui.etiquette}>Responsable</span>
            <select className={ui.champ} value={responsable} onChange={(e) => setResponsable(e.target.value)}>
              <option value="">Personne</option>
              {personnes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={ui.etiquette}>Échéance</span>
            <input type="date" className={ui.champ} value={echeance} onChange={(e) => setEcheance(e.target.value)} />
          </label>
        </div>
        {suivi && (
          <p className="text-xs text-pierre-500">
            Ajouté par {suivi.auteur_nom ?? '?'}
            {suivi.fait_le && ` · fait par ${suivi.fait_par_nom ?? '?'} le ${jourLisible(jourDe(suivi.fait_le), aujourdhui())}`}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 pt-1">
          {suivi ? (
            <BoutonSupprimer
              onClick={() => {
                supprimer.mutate(suivi.id)
                fermer()
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

// ------------------------------------------------------------
// Fiche d'un point (tous les champs)
// ------------------------------------------------------------

export function FenetrePoint({ point, fermer }: { point: Point; fermer: () => void }) {
  const { reunions } = useDonnees()
  const modifier = useModifierPoint()
  const [texte, setTexte] = useState(point.texte)
  const [details, setDetails] = useState(point.details ?? '')
  const [type, setType] = useState(point.type)
  const [urgent, setUrgent] = useState(point.urgent)
  const [duree, setDuree] = useState(point.duree_min ? String(point.duree_min) : '')
  const [pourLe, setPourLe] = useState(point.pour_le ?? '')
  const [reunion, setReunion] = useState(point.reunion_id ?? '')
  const [decision, setDecision] = useState(point.decision ?? '')
  const [suivi, setSuivi] = useState(false)
  const auj = aujourdhui()
  const choix = reunionsAVenir(reunions)
  const actuelle = reunions.find((r) => r.id === point.reunion_id)
  if (actuelle && !choix.includes(actuelle)) choix.unshift(actuelle)

  const enregistrer = () => {
    if (!texte.trim()) return
    const minutes = Number(duree)
    modifier.mutate({
      id: point.id,
      champs: {
        texte: texte.trim(),
        details: details.trim() || null,
        type,
        urgent,
        duree_min: minutes > 0 ? Math.min(480, Math.round(minutes)) : null,
        pour_le: reunion ? null : pourLe || null,
        reunion_id: reunion || null,
        ...(reunion !== (point.reunion_id ?? '') ? { ordre: ordreEnFin() } : {}),
        decision: decision.trim() || null,
      },
    })
    fermer()
  }

  return (
    <Dialogue titre="Point" fermer={fermer}>
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
        <label className="block">
          <span className={ui.etiquette}>Détails</span>
          <textarea className={ui.champ} rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Contexte, liens, chiffres…" />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <ChoixType valeur={type} changer={setType} />
          <label className="inline-flex items-center gap-1.5 text-sm">
            <input type="checkbox" className="size-4 accent-red-600" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
            Urgent
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={ui.etiquette}>Ordre du jour</span>
            <select className={ui.champ} value={reunion} onChange={(e) => setReunion(e.target.value)}>
              <option value="">Quotidien de direction</option>
              {choix.map((r) => (
                <option key={r.id} value={r.id}>
                  {nomReunion(r)}
                  {r.jour ? ` · ${jourLisible(r.jour, auj, true)}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={ui.etiquette}>Durée prévue (min)</span>
            <input type="number" min={1} max={480} className={ui.champ} value={duree} onChange={(e) => setDuree(e.target.value)} />
          </label>
        </div>
        {!reunion && point.statut === 'ouvert' && (
          <label className="block">
            <span className={ui.etiquette}>Pas avant le (facultatif)</span>
            <input type="date" className={ui.champ} value={pourLe} onChange={(e) => setPourLe(e.target.value)} />
          </label>
        )}
        {point.statut !== 'ouvert' && (
          <label className="block">
            <span className={ui.etiquette}>Décision</span>
            <input className={ui.champ} value={decision} onChange={(e) => setDecision(e.target.value)} />
          </label>
        )}
        <div className="flex items-center justify-between">
          <span className={ui.etiquette + ' !mb-0'}>Suivis</span>
          <button type="button" className="text-sm text-foret-800 hover:underline" onClick={() => setSuivi(true)}>
            + Suivi
          </button>
        </div>
        <p className="text-xs text-pierre-500">
          Ajouté par {point.auteur_nom ?? '?'} le {jourLisible(jourDe(point.created_at), auj)}
          {point.traite_le && ` · ${point.statut === 'retire' ? 'retiré' : 'traité'} par ${point.traite_par_nom ?? '?'} le ${jourLisible(jourDe(point.traite_le), auj)}`}
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button className={ui.bouton}>Enregistrer</button>
        </div>
      </form>
      {suivi && <FenetreSuivi pointId={point.id} fermer={() => setSuivi(false)} />}
    </Dialogue>
  )
}

// ------------------------------------------------------------
// Ajout rapide d'un point
// ------------------------------------------------------------

export function AjoutPoint({ reunionId = null, ordre = 0, placeholder }: { reunionId?: string | null; ordre?: number; placeholder?: string }) {
  const { moi } = useDonnees()
  const ajouter = useAjouterPoint()
  const [texte, setTexte] = useState('')
  const [type, setType] = useState<TypePoint>('discussion')
  const [urgent, setUrgent] = useState(false)
  const [plus, setPlus] = useState(false)
  const [details, setDetails] = useState('')
  const [duree, setDuree] = useState('')
  const [pourLe, setPourLe] = useState('')
  const champ = useRef<HTMLInputElement>(null)

  const envoyer = () => {
    if (!texte.trim()) return
    const minutes = Number(duree)
    const p = nouveauPoint(
      {
        texte: texte.trim(),
        type,
        urgent,
        reunion_id: reunionId,
        ordre,
        details: details.trim() || null,
        duree_min: minutes > 0 ? Math.min(480, Math.round(minutes)) : null,
        pour_le: !reunionId && pourLe ? pourLe : null,
      },
      moi,
    )
    ajouter.mutate({ ligne: aEnvoyer(p), affiche: p })
    setTexte('')
    setUrgent(false)
    setDetails('')
    setDuree('')
    setPourLe('')
    setPlus(false)
    champ.current?.focus()
  }

  return (
    <form
      className={`${ui.carte} p-2.5`}
      onSubmit={(e) => {
        e.preventDefault()
        envoyer()
      }}
    >
      <div className="flex items-center gap-2">
        <Auteur nom={moi.nom ?? moi.courriel} titre="Ajouté par" />
        <input
          ref={champ}
          className="min-w-0 flex-1 rounded-lg border border-pierre-300 bg-white px-3 py-2 text-[15px] focus:border-foret-600 focus:outline-none focus:ring-2 focus:ring-foret-600/20"
          placeholder={placeholder ?? 'Ajouter un point à l’ordre du jour…'}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          aria-label="Nouveau point"
        />
        <button className={ui.bouton} disabled={!texte.trim()}>
          Ajouter
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 pl-9">
        <ChoixType valeur={type} changer={setType} />
        <label className="inline-flex items-center gap-1.5 text-sm text-pierre-700">
          <input type="checkbox" className="size-4 accent-red-600" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
          Urgent
        </label>
        <button type="button" className="text-sm text-pierre-500 hover:text-pierre-800" onClick={() => setPlus(!plus)} aria-expanded={plus}>
          {plus ? '− Moins' : '+ Détails, durée' + (reunionId ? '' : ', date')}
        </button>
      </div>
      {plus && (
        <div className="mt-2 grid gap-2 pl-9 sm:grid-cols-[minmax(0,1fr)_8rem_10rem]">
          <textarea className={ui.champ} rows={2} placeholder="Détails (facultatif)" value={details} onChange={(e) => setDetails(e.target.value)} />
          <label className="block">
            <span className={ui.etiquette}>Durée (min)</span>
            <input type="number" min={1} max={480} className={ui.champ} value={duree} onChange={(e) => setDuree(e.target.value)} />
          </label>
          {!reunionId && (
            <label className="block">
              <span className={ui.etiquette}>Pas avant le</span>
              <input type="date" min={aujourdhui()} className={ui.champ} value={pourLe} onChange={(e) => setPourLe(e.target.value)} />
            </label>
          )}
        </div>
      )}
    </form>
  )
}
