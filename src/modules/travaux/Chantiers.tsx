import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BoutonModifier, BoutonSupprimer } from '@/lib/BoutonsAction'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { IconeChevron, IconePlus } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { Pastille, Puce, Section } from './commun'
import { enregistrerListe, supprimerListe, useRelire, type Donnees } from './donnees'
import { comparer, comparerFaites, dateCourte, enRetard, jourAujourdhui, useDroits, useOuvrir } from './outils'
import type { Chantier, Tache } from './types'

const COULEURS = ['#567E96', '#5E7C3F', '#B0607A', '#E38B45', '#8A7B62', '#7A6AA8', '#19774a', '#c0812b']

export function Chantiers({ d }: { d: Donnees }) {
  const { id } = useParams()
  return id ? <DetailChantier id={id} d={d} /> : <ListeChantiers d={d} />
}

function ListeChantiers({ d }: { d: Donnees }) {
  const droits = useDroits()
  const [nouveau, setNouveau] = useState(false)
  const [voirTermines, setVoirTermines] = useState(false)
  const enCours = d.chantiers.filter((c) => !c.termine_le)
  const termines = d.chantiers.filter((c) => c.termine_le).sort((a, b) => (b.termine_le ?? '').localeCompare(a.termine_le ?? ''))
  const tachesDe = (c: Chantier) => d.taches.filter((t) => t.chantier_id === c.id)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-pierre-500">Des chantiers qui se terminent (Trembloc, rénovations…).</p>
        {droits.trieur && (
          <button className={ui.bouton} onClick={() => setNouveau(true)}>
            <IconePlus /> Nouveau chantier
          </button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {enCours.map((c) => (
          <CarteChantier key={c.id} chantier={c} taches={tachesDe(c)} d={d} />
        ))}
        {enCours.length === 0 && <p className="text-sm text-pierre-500">Aucun chantier en cours.</p>}
      </div>
      {termines.length > 0 && (
        <div>
          <button className="text-sm text-pierre-600 underline" onClick={() => setVoirTermines(!voirTermines)}>
            {voirTermines ? 'Cacher' : 'Voir'} les chantiers terminés ({termines.length})
          </button>
          {voirTermines && (
            <div className="mt-3 grid gap-3 opacity-75 sm:grid-cols-2 lg:grid-cols-3">
              {termines.map((c) => (
                <CarteChantier key={c.id} chantier={c} taches={tachesDe(c)} d={d} />
              ))}
            </div>
          )}
        </div>
      )}
      {nouveau && <FicheChantier chantier={null} d={d} fermer={() => setNouveau(false)} />}
    </div>
  )
}

function CarteChantier({ chantier: c, taches, d }: { chantier: Chantier; taches: Tache[]; d: Donnees }) {
  const faites = taches.filter((t) => t.statut === 'terminee').length
  const retard = taches.filter((t) => enRetard(t)).length
  const pct = taches.length ? Math.round((100 * faites) / taches.length) : 0
  const lieu = c.lieu_id ? d.lieu.get(c.lieu_id) : null
  return (
    <Link to={`/travaux/chantiers/${c.id}`} className={`${ui.carte} block p-4 transition hover:border-foret-600`}>
      <div className="flex items-center gap-2">
        <Pastille couleur={c.couleur} />
        <span className="font-medium">{c.nom}</span>
        <span className="ml-auto text-sm tabular-nums text-pierre-500">
          {faites} / {taches.length}
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-pierre-100">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: c.couleur ?? 'var(--color-foret-600)' }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {lieu && <Puce>📍 {lieu.nom}</Puce>}
        {c.termine_le && <Puce>Terminé le {dateCourte(c.termine_le)}</Puce>}
        {!c.termine_le && c.date_cible && <Puce ton={c.date_cible < jourAujourdhui() ? 'retard' : undefined}>Cible {dateCourte(c.date_cible)}</Puce>}
        {retard > 0 && <Puce ton="retard">{retard} en retard</Puce>}
      </div>
    </Link>
  )
}

function DetailChantier({ id, d }: { id: string; d: Donnees }) {
  const droits = useDroits()
  const ouvrir = useOuvrir()
  const navigate = useNavigate()
  const relire = useRelire()
  const [modifier, setModifier] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const c = d.chantier.get(id)
  if (!c) {
    return (
      <p className="py-8 text-center text-sm text-pierre-500">
        Ce chantier n'existe plus.{' '}
        <Link className="text-foret-700 underline" to="/travaux/chantiers">
          Retour aux chantiers
        </Link>
      </p>
    )
  }
  const taches = d.taches.filter((t) => t.chantier_id === id)
  const aFaire = taches.filter((t) => t.statut !== 'terminee').sort(comparer)
  const faites = taches.filter((t) => t.statut === 'terminee').sort(comparerFaites)
  const heures = aFaire.reduce((n, t) => n + (t.heures_prevues ?? 0), 0)
  const lieu = c.lieu_id ? d.lieu.get(c.lieu_id) : null
  const prochainePosition = Math.max(0, ...taches.map((t) => t.position ?? 0)) + 1

  async function action(f: () => Promise<unknown>) {
    setErreur(null)
    try {
      await f()
      await relire()
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  const sous = [
    `${faites.length} sur ${taches.length} tâches faites`,
    lieu ? lieu.nom : null,
    c.date_cible ? `cible ${dateCourte(c.date_cible)}` : null,
    heures ? `${heures} h prévues à faire` : null,
    c.termine_le ? `terminé le ${dateCourte(c.termine_le)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/travaux/chantiers" className="inline-flex items-center gap-1 text-sm text-pierre-500 hover:text-pierre-800">
            <IconeChevron className="size-3.5 rotate-180" /> Chantiers
          </Link>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold">
            <Pastille couleur={c.couleur} />
            {c.nom}
          </h2>
          <p className="text-sm text-pierre-500">{sous}</p>
        </div>
        {droits.trieur && (
          <div className="flex flex-wrap gap-2">
            <BoutonModifier onClick={() => setModifier(true)} />
            <button
              className={ui.boutonSecondaire}
              onClick={() => action(() => enregistrerListe<Chantier>('chantiers', { id: c.id, termine_le: c.termine_le ? null : new Date().toISOString() }))}
            >
              {c.termine_le ? 'Rouvrir le chantier' : 'Terminer le chantier'}
            </button>
            <BoutonSupprimer
              onClick={async () => {
                if (
                  !(await confirmer({
                    titre: `Supprimer le chantier « ${c.nom} » ?`,
                    message: taches.length ? `Ses ${taches.length} tâches restent dans Travaux, sans chantier.` : undefined,
                  }))
                )
                  return
                action(async () => {
                  await supprimerListe('chantiers', c.id)
                  navigate('/travaux/chantiers')
                })
              }}
            />
            <button
              className={ui.bouton}
              onClick={() => ouvrir({ type: 'signaler', defauts: { chantier_id: c.id, lieu_id: c.lieu_id, position: prochainePosition } })}
            >
              <IconePlus /> Ajouter une tâche
            </button>
          </div>
        )}
      </div>
      {erreur && <p className={ui.erreur}>{erreur}</p>}
      <Section titre="À faire" taches={aFaire} d={d} vide={taches.length ? 'Tout est fait !' : 'Aucune tâche dans ce chantier.'} montrer={{ lieu: true, categorie: true, personne: true }} />
      <Section titre="Faites" taches={faites} d={d} montrer={{ lieu: true }} />
      {modifier && <FicheChantier chantier={c} d={d} fermer={() => setModifier(false)} />}
    </div>
  )
}

/** Créer ou modifier un chantier (direction, en ligne). */
function FicheChantier({ chantier, d, fermer }: { chantier: Chantier | null; d: Donnees; fermer: () => void }) {
  const relire = useRelire()
  const navigate = useNavigate()
  const [nom, setNom] = useState(chantier?.nom ?? '')
  const [couleur, setCouleur] = useState(chantier?.couleur ?? COULEURS[0])
  const [lieu, setLieu] = useState(chantier?.lieu_id ?? '')
  const [cible, setCible] = useState(chantier?.date_cible ?? '')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function sauver(e: FormEvent) {
    e.preventDefault()
    if (!nom.trim()) return setErreur('Donne un nom au chantier.')
    setEnCours(true)
    try {
      const ligne = { nom: nom.trim(), couleur, lieu_id: lieu || null, date_cible: cible || null }
      await enregistrerListe<Chantier>('chantiers', chantier ? { id: chantier.id, ...ligne } : ligne)
      await relire()
      fermer()
      if (!chantier) navigate('/travaux/chantiers')
    } catch (err) {
      setErreur(messageErreur(err))
      setEnCours(false)
    }
  }

  return (
    <Dialogue titre={chantier ? 'Modifier le chantier' : 'Nouveau chantier'} fermer={fermer}>
      <form onSubmit={sauver} className="space-y-4">
        <label className="block">
          <span className={ui.etiquette}>Nom</span>
          <input className={ui.champ} value={nom} onChange={(e) => setNom(e.target.value)} autoFocus placeholder="Ex. Trembloc" />
        </label>
        <div>
          <span className={ui.etiquette}>Couleur</span>
          <div className="flex flex-wrap gap-2">
            {COULEURS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Couleur ${c}`}
                aria-pressed={couleur === c}
                className={`h-8 w-8 rounded-full border-2 ${couleur === c ? 'border-pierre-900' : 'border-white'}`}
                style={{ background: c }}
                onClick={() => setCouleur(c)}
              />
            ))}
          </div>
        </div>
        <label className="block">
          <span className={ui.etiquette}>Lieu (proposé pour ses tâches)</span>
          <select className={ui.champ} value={lieu} onChange={(e) => setLieu(e.target.value)}>
            <option value="">—</option>
            {d.lieux.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={ui.etiquette}>Date cible (optionnelle)</span>
          <input type="date" className={ui.champ} value={cible} onChange={(e) => setCible(e.target.value)} />
        </label>
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex gap-2">
          <button type="submit" className={ui.bouton} disabled={enCours}>
            {chantier ? 'Enregistrer' : 'Créer le chantier'}
          </button>
          <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
        </div>
      </form>
    </Dialogue>
  )
}
