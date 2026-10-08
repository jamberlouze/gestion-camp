import { useMemo, useState, type FormEvent } from 'react'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { BoutonSupprimer } from '@/lib/BoutonsAction'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { demandePourClaude, jour, useAjouterIdee, useIdees, useModifierIdee, useSupprimerIdee } from './donnees'
import { CIBLES, cible, genre, GENRES, STATUTS, type Genre, type Idee } from './types'

const segment = (actif: boolean) =>
  `rounded-md px-2.5 py-1 ${actif ? 'bg-foret-100 font-medium text-foret-800' : 'text-pierre-600 hover:text-pierre-900'}`
const groupe = 'inline-flex flex-wrap rounded-lg border border-pierre-300 bg-white p-0.5 text-sm'

/** Groupe d'une idée complétée : son module, sinon « Nouveaux modules » ou « L'app en général ». */
const GROUPE_NOUVEAUX = '-nouveaux'
const GROUPE_APP = '-app'
const groupeDe = (i: Idee) => i.module ?? (i.genre === 'module' ? GROUPE_NOUVEAUX : GROUPE_APP)
const titreGroupe = (cle: string) =>
  cle === GROUPE_NOUVEAUX ? `${genre('module').icone} Nouveaux modules` : cle === GROUPE_APP ? "L'app en général" : `${cible(cle).icone} ${cible(cle).nom}`
const ORDRE_GROUPES = [...CIBLES.map((c) => c.id), GROUPE_NOUVEAUX, GROUPE_APP]
const rangGroupe = (cle: string) => (ORDRE_GROUPES.includes(cle) ? ORDRE_GROUPES.indexOf(cle) : ORDRE_GROUPES.length)

/** Améliorations : la liste de Maxime pour faire avancer l'app (admins). */
export default function ModuleAmeliorations() {
  const idees = useIdees()
  const [ouverte, setOuverte] = useState<string | null>(null)

  const calcul = useMemo(() => {
    const tout = idees.data ?? []
    // À faire : importantes d'abord, puis les plus récentes.
    const aFaire = tout
      .filter((i) => i.statut === 'a_faire')
      .sort((a, b) => Number(b.important) - Number(a.important) || b.created_at.localeCompare(a.created_at))
    // Complétées (faites ou écartées), regroupées par module ; les dernières fermées d'abord.
    const parGroupe = new Map<string, Idee[]>()
    for (const i of tout.filter((i) => i.statut !== 'a_faire')) parGroupe.set(groupeDe(i), [...(parGroupe.get(groupeDe(i)) ?? []), i])
    const completees = [...parGroupe.entries()]
      .sort(([a], [b]) => rangGroupe(a) - rangGroupe(b))
      .map(([cle, liste]) => ({ cle, liste: liste.sort((a, b) => (b.ferme_le ?? b.created_at).localeCompare(a.ferme_le ?? a.created_at)) }))
    return { aFaire, completees, nbCompletees: tout.length - aFaire.length }
  }, [idees.data])

  if (idees.error) return <p className={ui.erreur}>{messageErreur(idees.error)}</p>
  if (!idees.data) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const { aFaire, completees, nbCompletees } = calcul
  const ideeOuverte = ouverte ? idees.data.find((i) => i.id === ouverte) : undefined

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Améliorations</h1>
        <p className="text-sm text-pierre-500">Nouveaux modules, fonctionnalités à ajouter et commentaires de l'équipe.</p>
      </div>

      <Ajout />

      <BandeauErreurs racine="ameliorations" />

      <div className={`${ui.carte} divide-y divide-pierre-100`}>
        {aFaire.map((i) => (
          <Rangee key={i.id} idee={i} ouvrir={() => setOuverte(i.id)} />
        ))}
        {aFaire.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-pierre-500">
            {idees.data.length === 0 ? 'Rien encore. Note ta première idée ci-dessus.' : 'Tout est complété.'}
          </p>
        )}
      </div>

      {nbCompletees > 0 && (
        <section className="space-y-3 pt-2">
          <h2 className="text-lg font-semibold">
            Complété <span className="tabular-nums text-pierre-400">{nbCompletees}</span>
          </h2>
          {completees.map(({ cle, liste }) => (
            <div key={cle}>
              <h3 className="mb-1 text-sm font-medium text-pierre-700">{titreGroupe(cle)}</h3>
              <div className={`${ui.carte} divide-y divide-pierre-100`}>
                {liste.map((i) => (
                  <Rangee key={i.id} idee={i} ouvrir={() => setOuverte(i.id)} sansModule />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {ideeOuverte && <Fiche key={ideeOuverte.id} idee={ideeOuverte} fermer={() => setOuverte(null)} />}
    </div>
  )
}

/** Saisie rapide : on choisit le genre, on tape, Entrée. Genre et module restent pour la suivante. */
function Ajout() {
  const ajouter = useAjouterIdee()
  const [g, setG] = useState<Genre>('fonctionnalite')
  const [titre, setTitre] = useState('')
  const [module, setModule] = useState('')
  const [deQui, setDeQui] = useState('')
  const manqueModule = g === 'fonctionnalite' && !module

  const envoyer = (e: FormEvent) => {
    e.preventDefault()
    const propre = titre.trim()
    if (!propre || manqueModule) return
    ajouter.mutate({
      id: crypto.randomUUID(),
      genre: g,
      titre: propre,
      details: null,
      module: g === 'module' ? null : module || null,
      de_qui: g === 'commentaire' ? deQui.trim() || null : null,
      statut: 'a_faire',
      important: false,
      ferme_le: null,
      created_at: new Date().toISOString(),
    })
    setTitre('')
  }

  return (
    <form onSubmit={envoyer} className={`${ui.carte} space-y-3 p-3`}>
      <div className={groupe} role="group" aria-label="Genre de l'idée">
        {GENRES.map((x) => (
          <button key={x.id} type="button" className={segment(g === x.id)} onClick={() => setG(x.id)}>
            {x.icone} {x.nom}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {g !== 'module' && (
          <ChoixModule
            valeur={module}
            changer={setModule}
            vide={g === 'commentaire' ? "L'app en général" : 'Quel module ?'}
            className={`${ui.champ} w-auto sm:w-56`}
          />
        )}
        {g === 'commentaire' && (
          <input
            aria-label="De qui"
            placeholder="De qui ?"
            className={`${ui.champ} w-auto sm:w-40`}
            value={deQui}
            onChange={(e) => setDeQui(e.target.value)}
          />
        )}
        <input
          aria-label="Idée"
          placeholder={
            g === 'module'
              ? 'Ex. Inscriptions des campeurs'
              : g === 'fonctionnalite'
                ? 'Ex. Imprimer la liste des tâches'
                : 'Ex. Le bouton Signaler est difficile à trouver'
          }
          className={`${ui.champ} min-w-60 flex-1`}
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
        />
        <button className={ui.bouton} disabled={!titre.trim() || manqueModule} title={manqueModule ? 'Choisis le module' : undefined}>
          Ajouter
        </button>
      </div>
    </form>
  )
}

/** `sansModule` : la rangée est déjà sous le titre de son module. */
function Rangee({ idee: i, ouvrir, sansModule }: { idee: Idee; ouvrir: () => void; sansModule?: boolean }) {
  const modifier = useModifierIdee()
  const changer = (champs: Partial<Idee>) => modifier.mutate({ id: i.id, champs })
  const g = genre(i.genre)
  const fermee = i.statut !== 'a_faire'

  return (
    <div className="flex items-start gap-2 px-2 py-2 hover:bg-pierre-50">
      <button
        aria-label={i.statut === 'fait' ? `Remettre « ${i.titre} » à faire` : `Marquer « ${i.titre} » comme fait`}
        title={i.statut === 'fait' ? 'Remettre à faire' : 'Marquer comme fait'}
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-xs ${
          i.statut === 'fait' ? 'border-foret-600 bg-foret-600 text-white' : 'border-pierre-300 text-transparent hover:border-foret-600 hover:text-foret-600'
        }`}
        onClick={() => changer({ statut: i.statut === 'fait' ? 'a_faire' : 'fait' })}
      >
        ✓
      </button>
      <button
        aria-label={i.important ? `Retirer l'étoile de « ${i.titre} »` : `Marquer « ${i.titre} » comme importante`}
        title={i.important ? "Retirer l'étoile" : 'Importante'}
        className={`mt-px shrink-0 text-base leading-none ${i.important ? 'text-amber-500' : 'text-pierre-300 hover:text-amber-500'}`}
        onClick={() => changer({ important: !i.important })}
      >
        {i.important ? '★' : '☆'}
      </button>
      <button className="min-w-0 flex-1 text-left" onClick={ouvrir}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full border px-2 py-px text-xs font-medium ${g.style}`} title={g.nom}>
            {g.icone}
            <span className="hidden sm:inline"> {g.nom}</span>
          </span>
          {i.module && !sansModule && (
            <span className="rounded-full border border-pierre-200 bg-white px-2 py-px text-xs text-pierre-700">
              {cible(i.module).icone} {cible(i.module).nom}
            </span>
          )}
          <span className={`text-sm font-medium ${fermee ? 'text-pierre-500 line-through decoration-pierre-300' : 'text-pierre-900'}`}>{i.titre}</span>
          {i.statut === 'ecarte' && <span className="text-xs text-pierre-400">écarté</span>}
        </div>
        {i.details && <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-sm text-pierre-600">{i.details}</p>}
        <p className="mt-0.5 text-xs text-pierre-400">
          {i.de_qui && <>{i.de_qui} · </>}
          {jour(i.created_at)}
          {i.ferme_le && (
            <>
              {' '}
              · {i.statut === 'fait' ? 'fait' : 'écarté'} le {jour(i.ferme_le)}
            </>
          )}
        </p>
      </button>
    </div>
  )
}

/** Fiche d'une idée : tout se modifie ici, enregistré au bouton. */
function Fiche({ idee, fermer }: { idee: Idee; fermer: () => void }) {
  const modifier = useModifierIdee()
  const supprimer = useSupprimerIdee()
  const [v, setV] = useState({
    genre: idee.genre,
    titre: idee.titre,
    details: idee.details ?? '',
    module: idee.module ?? '',
    de_qui: idee.de_qui ?? '',
    statut: idee.statut,
    important: idee.important,
  })
  const [copie, setCopie] = useState(false)
  const maj = (champs: Partial<typeof v>) => setV((x) => ({ ...x, ...champs }))
  const manqueModule = v.genre === 'fonctionnalite' && !v.module

  const champs = (): Partial<Idee> => ({
    genre: v.genre,
    titre: v.titre.trim(),
    details: v.details.trim() || null,
    module: v.genre === 'module' ? null : v.module || null,
    de_qui: v.genre === 'commentaire' ? v.de_qui.trim() || null : null,
    statut: v.statut,
    important: v.important,
  })

  const enregistrer = (e: FormEvent) => {
    e.preventDefault()
    if (!v.titre.trim() || manqueModule) return
    modifier.mutate({ id: idee.id, champs: champs() })
    fermer()
  }

  const copier = async () => {
    await navigator.clipboard.writeText(demandePourClaude({ ...idee, ...champs() }))
    setCopie(true)
    setTimeout(() => setCopie(false), 2000)
  }

  return (
    <Dialogue titre="Idée" fermer={fermer}>
      <form onSubmit={enregistrer} className="space-y-3">
        <div className={groupe} role="group" aria-label="Genre de l'idée">
          {GENRES.map((x) => (
            <button key={x.id} type="button" className={segment(v.genre === x.id)} onClick={() => maj({ genre: x.id })} title={x.nom}>
              {x.icone} {x.id === 'commentaire' ? 'Commentaire' : x.nom}
            </button>
          ))}
        </div>
        <label className="block">
          <span className={ui.etiquette}>Titre</span>
          <input className={ui.champ} value={v.titre} onChange={(e) => maj({ titre: e.target.value })} />
        </label>
        {v.genre !== 'module' && (
          <label className="block">
            <span className={ui.etiquette}>Module</span>
            <ChoixModule
              valeur={v.module}
              changer={(module) => maj({ module })}
              vide={v.genre === 'commentaire' ? "L'app en général" : 'Quel module ?'}
              className={ui.champ}
            />
          </label>
        )}
        {v.genre === 'commentaire' && (
          <label className="block">
            <span className={ui.etiquette}>De qui</span>
            <input className={ui.champ} value={v.de_qui} onChange={(e) => maj({ de_qui: e.target.value })} />
          </label>
        )}
        <label className="block">
          <span className={ui.etiquette}>Détails</span>
          <textarea
            className={`${ui.champ} min-h-32`}
            value={v.details}
            placeholder="Ce qu'il faut savoir pour le bâtir : le besoin, qui s'en sert, des exemples…"
            onChange={(e) => maj({ details: e.target.value })}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <div className={groupe} role="group" aria-label="Statut">
            {STATUTS.map((s) => (
              <button key={s.id} type="button" className={segment(v.statut === s.id)} onClick={() => maj({ statut: s.id })}>
                {s.nom}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-sm text-pierre-700">
            <input type="checkbox" checked={v.important} onChange={(e) => maj({ important: e.target.checked })} />
            Importante
          </label>
        </div>
        <p className="text-xs text-pierre-400">
          Notée le {jour(idee.created_at)}
          {idee.ferme_le && <> · {idee.statut === 'fait' ? 'faite' : 'écartée'} le {jour(idee.ferme_le)}</>}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-pierre-100 pt-3">
          <div className="flex flex-wrap gap-2">
            <BoutonSupprimer
              onClick={async () => {
                if (await confirmer({ titre: `Supprimer « ${idee.titre} » ?`, libelleOk: 'Supprimer' })) {
                  supprimer.mutate(idee.id)
                  fermer()
                }
              }}
            />
            <button
              type="button"
              className={ui.boutonSecondaire}
              onClick={copier}
              title="Copie l'idée en une demande prête à coller dans une conversation avec Claude"
            >
              {copie ? 'Copié ✓' : 'Copier pour Claude'}
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
              Annuler
            </button>
            <button className={ui.bouton} disabled={!v.titre.trim() || manqueModule}>
              Enregistrer
            </button>
          </div>
        </div>
      </form>
    </Dialogue>
  )
}

function ChoixModule({ valeur, changer, vide, className }: { valeur: string; changer: (v: string) => void; vide: string; className: string }) {
  const connue = !valeur || CIBLES.some((c) => c.id === valeur)
  return (
    <select aria-label="Module" className={className} value={valeur} onChange={(e) => changer(e.target.value)}>
      <option value="">{vide}</option>
      {CIBLES.map((c) => (
        <option key={c.id} value={c.id}>
          {c.icone} {c.nom}
        </option>
      ))}
      {!connue && <option value={valeur}>{valeur}</option>}
    </select>
  )
}
