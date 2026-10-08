import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BoutonModifier, BoutonSupprimer } from '@/lib/BoutonsAction'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { IconeCorbeille } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { ajouterJours, dateCourte, depuis, moisAvant } from './calculs'
import { ChoixConseiller, PucesSaisons, PuceStatut } from './commun'
import { useDonnees } from './contexte'
import {
  useAjouterContact,
  useAjouterEchange,
  useAjouterRegle,
  useAjouterRelance,
  useAjouterVisite,
  useModifierContact,
  useModifierOrganisation,
  useSupprimerContact,
  useSupprimerEchange,
  useSupprimerOrganisation,
  useSupprimerRegle,
  useSupprimerVisite,
} from './donnees'
import { LigneRelance } from './Relances'
import {
  ETAPES,
  GENRES,
  GENRES_ECHANGE,
  nomSaison,
  SAISONS,
  type Contact,
  type Etape,
  type Genre,
  type GenreEchange,
  type Organisation,
  type Saison,
} from './types'

/** Fiche d'une organisation : échanges, relances, contacts, séjours et règles. */
export function Fiche() {
  const { id } = useParams()
  const { parId } = useDonnees()
  const c = id ? parId.get(id) : undefined
  if (!c) {
    return (
      <p className="py-8 text-center text-sm text-pierre-500">
        Organisation introuvable.{' '}
        <Link to="/crm/organisations" className="text-foret-700 underline">
          Retour à la liste
        </Link>
      </p>
    )
  }
  return <Contenu id={c.org.id} />
}

function Contenu({ id }: { id: string }) {
  const { parId, ecriture, auj } = useDonnees()
  const c = parId.get(id)!
  const o = c.org
  const modifier = useModifierOrganisation()
  const supprimer = useSupprimerOrganisation()
  const naviguer = useNavigate()
  const changer = (champs: Partial<Organisation>) => modifier.mutate({ id: o.id, champs })

  return (
    <div className="space-y-5">
      <div>
        <Link to="/crm/organisations" className="text-sm text-pierre-500 hover:text-pierre-800">
          ← Organisations
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <button
            disabled={!ecriture}
            title={o.prioritaire ? 'Cible prioritaire (cliquer pour retirer)' : 'Marquer comme cible prioritaire'}
            className={`text-xl ${o.prioritaire ? '' : 'opacity-25 grayscale hover:opacity-60'}`}
            onClick={() => changer({ prioritaire: !o.prioritaire })}
          >
            ⭐
          </button>
          <ChampTexte
            aria-label="Nom"
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 text-xl font-semibold hover:border-pierre-200 focus:border-foret-600 focus:outline-none"
            valeur={o.nom}
            obligatoire
            disabled={!ecriture}
            enregistrer={(nom) => changer({ nom })}
          />
          <PuceStatut statut={c.statut} />
          {ecriture && (
            <BoutonSupprimer
              onClick={async () => {
                const ok = await confirmer({
                  titre: `Supprimer « ${o.nom} » ?`,
                  message: 'Ses contacts, échanges, relances et visites ajoutées seront effacés. Les séjours de la base de réservations restent.',
                  libelleOk: 'Supprimer',
                })
                if (ok) supprimer.mutate(o.id, { onSuccess: () => naviguer('/crm/organisations') })
              }}
            />
          )}
        </div>
        <p className="mt-1 text-sm text-pierre-600">
          Dernier contact : <strong className="font-medium">{depuis(c.joursInactifs)}</strong>
          {c.prochaine && (
            <>
              {' '}
              · <span className="text-foret-800">vient le {dateCourte(c.prochaine.arrivee, auj)}</span>
            </>
          )}
          {c.saisons.length > 0 && (
            <>
              {' '}
              · <PucesSaisons saisons={c.saisons} />
            </>
          )}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-5">
          <Echanges id={o.id} />
          <RelancesOrganisation id={o.id} />
        </div>
        <div className="space-y-5">
          <Infos org={o} changer={changer} />
          <Contacts id={o.id} />
          <Sejours id={o.id} />
          <ReglesPropres org={o} />
        </div>
      </div>
    </div>
  )
}

function Section({ titre, action, children }: { titre: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={`${ui.carte} p-4`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-pierre-900">{titre}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Zone de texte enregistrée à la sortie, seulement si elle a changé. */
function ZoneTexte({ valeur, enregistrer, ...props }: { valeur: string; enregistrer: (v: string) => void; disabled?: boolean; placeholder?: string }) {
  const [texte, setTexte] = useState(valeur)
  const [base, setBase] = useState(valeur)
  if (valeur !== base) {
    setBase(valeur)
    setTexte(valeur)
  }
  return (
    <textarea
      {...props}
      rows={3}
      className={ui.champ}
      value={texte}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={() => texte.trim() !== valeur && enregistrer(texte.trim())}
    />
  )
}

// ------------------------------------------------------------
// Échanges
// ------------------------------------------------------------
function Echanges({ id }: { id: string }) {
  const { echanges, contacts, ecriture, auj } = useDonnees()
  const ajouter = useAjouterEchange()
  const supprimer = useSupprimerEchange()
  const siens = echanges.filter((e) => e.organisation_id === id).sort((a, b) => b.jour.localeCompare(a.jour) || b.created_at.localeCompare(a.created_at))
  const sesContacts = contacts.filter((x) => x.organisation_id === id)
  const [genre, setGenre] = useState<GenreEchange>('appel')
  const [jour, setJour] = useState(auj)
  const [contact, setContact] = useState('')
  const [texte, setTexte] = useState('')

  const envoyer = () => {
    if (!texte.trim()) return
    ajouter.mutate({
      id: crypto.randomUUID(),
      organisation_id: id,
      contact_id: contact || null,
      genre,
      jour,
      texte: texte.trim(),
      auteur: null,
      auteur_nom: null,
      created_at: new Date().toISOString(),
    })
    setTexte('')
    setJour(auj)
  }

  return (
    <Section titre="Échanges">
      {ecriture && (
        <form
          className="mb-4 space-y-2 rounded-lg bg-pierre-50 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            envoyer()
          }}
        >
          <div className="flex flex-wrap gap-2">
            <div className="inline-flex rounded-lg border border-pierre-300 bg-white p-0.5 text-sm" role="group" aria-label="Genre">
              {GENRES_ECHANGE.map((g) => (
                <button
                  type="button"
                  key={g.id}
                  className={`rounded-md px-2 py-1 ${genre === g.id ? 'bg-foret-100 font-medium text-foret-800' : 'text-pierre-600'}`}
                  onClick={() => setGenre(g.id)}
                >
                  {g.icone} {g.nom}
                </button>
              ))}
            </div>
            <input type="date" aria-label="Date" className="rounded-lg border border-pierre-300 bg-white px-2 py-1 text-sm" value={jour} max={auj} onChange={(e) => setJour(e.target.value || auj)} />
            {sesContacts.length > 0 && (
              <select aria-label="Contact" className="rounded-lg border border-pierre-300 bg-white px-2 py-1 text-sm" value={contact} onChange={(e) => setContact(e.target.value)}>
                <option value="">Avec qui ?</option>
                {sesContacts.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nom}
                  </option>
                ))}
              </select>
            )}
          </div>
          <textarea
            rows={2}
            className={ui.champ}
            placeholder="Ce qui s'est dit, ce qui est convenu…"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && envoyer()}
          />
          <div className="flex justify-end">
            <button className={ui.bouton} disabled={!texte.trim()}>
              Ajouter l'échange
            </button>
          </div>
        </form>
      )}
      {siens.length === 0 ? (
        <p className="text-sm text-pierre-500">Aucun échange noté.</p>
      ) : (
        <ul className="space-y-3">
          {siens.map((e) => {
            const g = GENRES_ECHANGE.find((x) => x.id === e.genre)!
            const avec = sesContacts.find((x) => x.id === e.contact_id)
            return (
              <li key={e.id} className="group flex gap-3">
                <span className="mt-0.5 text-lg" title={g.nom}>
                  {g.icone}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-pierre-500">
                    {dateCourte(e.jour, auj)}
                    {avec && ` · avec ${avec.nom}`}
                    {e.auteur_nom && ` · ${e.auteur_nom}`}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-pierre-800">{e.texte}</p>
                </div>
                {ecriture && (
                  <button
                    aria-label="Supprimer l'échange"
                    className="self-start rounded p-1 text-pierre-300 opacity-0 hover:bg-red-50 hover:text-red-700 group-hover:opacity-100"
                    onClick={async () => (await confirmer({ titre: "Supprimer cet échange ?", libelleOk: 'Supprimer' })) && supprimer.mutate(e.id)}
                  >
                    <IconeCorbeille />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

// ------------------------------------------------------------
// Relances
// ------------------------------------------------------------
function RelancesOrganisation({ id }: { id: string }) {
  const { relances, parId, ecriture, auj, moi } = useDonnees()
  const ajouter = useAjouterRelance()
  const [ouvert, setOuvert] = useState(false)
  const [titre, setTitre] = useState('')
  const [echeance, setEcheance] = useState(ajouterJours(auj, 7))
  const [qui, setQui] = useState<string | null>(parId.get(id)?.org.conseiller_id ?? moi.id)
  const [voirToutes, setVoirToutes] = useState(false)

  const siennes = relances.filter((r) => r.organisation_id === id)
  const aFaire = siennes.filter((r) => r.statut === 'a_faire').sort((a, b) => a.echeance.localeCompare(b.echeance))
  const autres = siennes.filter((r) => r.statut !== 'a_faire').sort((a, b) => b.echeance.localeCompare(a.echeance))

  const creer = () => {
    if (!titre.trim()) return
    ajouter.mutate({
      id: crypto.randomUUID(),
      organisation_id: id,
      titre: titre.trim(),
      echeance,
      assigne_a: qui,
      statut: 'a_faire',
      note: null,
      source_cle: null,
      faite_le: null,
      faite_par_nom: null,
      auteur_nom: null,
      created_at: new Date().toISOString(),
    })
    setTitre('')
    setOuvert(false)
  }

  return (
    <Section
      titre="Relances"
      action={
        ecriture &&
        !ouvert && (
          <button className={ui.boutonSecondaire} onClick={() => setOuvert(true)}>
            + Relance
          </button>
        )
      }
    >
      {ouvert && (
        <form
          className="mb-3 space-y-2 rounded-lg bg-pierre-50 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            creer()
          }}
        >
          <input autoFocus className={ui.champ} placeholder="Rappeler pour le printemps, envoyer l'estimé…" value={titre} onChange={(e) => setTitre(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" aria-label="Échéance" className="rounded-lg border border-pierre-300 bg-white px-2 py-1.5 text-sm" value={echeance} onChange={(e) => setEcheance(e.target.value || auj)} />
            <ChoixConseiller valeur={qui} changer={setQui} libelle="Assignée à" />
            <div className="ml-auto flex gap-2">
              <button type="button" className={ui.boutonSecondaire} onClick={() => setOuvert(false)}>
                Annuler
              </button>
              <button className={ui.bouton} disabled={!titre.trim()}>
                Ajouter
              </button>
            </div>
          </div>
        </form>
      )}
      {aFaire.length === 0 && !ouvert && <p className="text-sm text-pierre-500">Aucune relance à faire.</p>}
      {aFaire.length > 0 && (
        <ul className="-mx-3 divide-y divide-pierre-100">
          {aFaire.map((r) => (
            <LigneRelance key={r.id} relance={r} sansOrganisation montrerQui />
          ))}
        </ul>
      )}
      {autres.length > 0 && (
        <div className="mt-2">
          <button className="text-xs text-pierre-500 underline" onClick={() => setVoirToutes((v) => !v)}>
            {voirToutes ? 'Cacher' : 'Voir'} les relances faites ou annulées ({autres.length})
          </button>
          {voirToutes && (
            <ul className="-mx-3 mt-1 divide-y divide-pierre-100 opacity-70">
              {autres.map((r) => (
                <LigneRelance key={r.id} relance={r} sansOrganisation />
              ))}
            </ul>
          )}
        </div>
      )}
    </Section>
  )
}

// ------------------------------------------------------------
// Informations
// ------------------------------------------------------------
function Infos({ org: o, changer }: { org: Organisation; changer: (c: Partial<Organisation>) => void }) {
  const { ecriture, sejours, calculs } = useDonnees()
  // Clients Airtable vus dans les séjours, pas encore liés à une autre organisation.
  const clientsAirtable = useMemo(() => {
    const lies = new Set(calculs.map((c) => c.org.airtable_client_id).filter((x) => x && x !== o.airtable_client_id))
    const vus = new Map<string, string>()
    for (const s of sejours) if (s.airtable_client_id && !lies.has(s.airtable_client_id)) vus.set(s.airtable_client_id, s.nom_groupe)
    return [...vus].sort((a, b) => a[1].localeCompare(b[1], 'fr'))
  }, [sejours, calculs, o.airtable_client_id])

  const champ = 'w-full rounded-lg border border-pierre-300 bg-white px-2.5 py-1.5 text-sm disabled:bg-pierre-50'
  return (
    <Section titre="Informations">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={ui.etiquette}>Type</span>
          <select className={champ} value={o.genre} disabled={!ecriture} onChange={(e) => changer({ genre: e.target.value as Genre })}>
            {GENRES.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={ui.etiquette}>Ville</span>
          <ChampTexte className={champ} valeur={o.ville ?? ''} disabled={!ecriture} enregistrer={(ville) => changer({ ville: ville || null })} />
        </label>
        <label className="block">
          <span className={ui.etiquette}>Conseiller</span>
          <ChoixConseiller valeur={o.conseiller_id} changer={(conseiller_id) => changer({ conseiller_id })} className={champ} />
        </label>
        <label className="block">
          <span className={ui.etiquette}>Démarchage</span>
          <select className={champ} value={o.etape ?? ''} disabled={!ecriture} onChange={(e) => changer({ etape: (e.target.value || null) as Etape | null })}>
            <option value="">Pas en démarchage</option>
            {ETAPES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={ui.etiquette}>Revient</span>
          <select className={champ} value={o.cycle_ans} disabled={!ecriture} onChange={(e) => changer({ cycle_ans: Number(e.target.value) })}>
            <option value={1}>Chaque année</option>
            <option value={2}>Une année sur deux</option>
            <option value={3}>Aux 3 ans</option>
          </select>
        </label>
        <label className="block">
          <span className={ui.etiquette}>Client Airtable</span>
          <select
            className={champ}
            value={o.airtable_client_id ?? ''}
            disabled={!ecriture}
            onChange={(e) => changer({ airtable_client_id: e.target.value || null })}
          >
            <option value="">Pas lié</option>
            {o.airtable_client_id && !clientsAirtable.some(([cid]) => cid === o.airtable_client_id) && (
              <option value={o.airtable_client_id}>Client lié (aucun séjour)</option>
            )}
            {clientsAirtable.map(([cid, nom]) => (
              <option key={cid} value={cid}>
                {nom}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={ui.etiquette}>Téléphone</span>
          <ChampTexte className={champ} valeur={o.telephone ?? ''} disabled={!ecriture} enregistrer={(telephone) => changer({ telephone: telephone || null })} />
        </label>
        <label className="block">
          <span className={ui.etiquette}>Site web</span>
          <ChampTexte className={champ} valeur={o.site_web ?? ''} disabled={!ecriture} enregistrer={(site_web) => changer({ site_web: site_web || null })} />
        </label>
      </div>
      <label className="mt-3 block">
        <span className={ui.etiquette}>Adresse</span>
        <ZoneTexte valeur={o.adresse ?? ''} disabled={!ecriture} placeholder="Rue, ville, code postal…" enregistrer={(adresse) => changer({ adresse: adresse || null })} />
      </label>
      {o.statut_depart && (
        <p className="mt-2 text-xs text-pierre-500">
          {o.statut_depart === 'client' ? 'Client' : 'Client inactif'} selon Copper (import du {dateCourte(o.statut_depart_le!)}) : sert de statut tant qu'aucun séjour n'est connu.
        </p>
      )}
      <label className="mt-3 block">
        <span className={ui.etiquette}>Notes</span>
        <ZoneTexte valeur={o.notes ?? ''} disabled={!ecriture} placeholder="Ce qu'il faut savoir sur ce client…" enregistrer={(notes) => changer({ notes: notes || null })} />
      </label>
    </Section>
  )
}

// ------------------------------------------------------------
// Contacts
// ------------------------------------------------------------
function Contacts({ id }: { id: string }) {
  const { contacts, ecriture } = useDonnees()
  const [edite, setEdite] = useState<Contact | 'nouveau' | null>(null)
  const siens = contacts.filter((x) => x.organisation_id === id).sort((a, b) => Number(b.principal) - Number(a.principal) || a.nom.localeCompare(b.nom, 'fr'))
  return (
    <Section
      titre="Contacts"
      action={
        ecriture && (
          <button className={ui.boutonSecondaire} onClick={() => setEdite('nouveau')}>
            + Contact
          </button>
        )
      }
    >
      {siens.length === 0 ? (
        <p className="text-sm text-pierre-500">Aucun contact.</p>
      ) : (
        <ul className="space-y-3">
          {siens.map((x) => (
            <li key={x.id} className="flex items-start justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-pierre-900">
                  {x.nom}
                  {x.principal && <span className="ml-1.5 rounded bg-foret-50 px-1.5 text-xs font-normal text-foret-800">principal</span>}
                </p>
                {x.fonction && <p className="text-pierre-500">{x.fonction}</p>}
                <p className="text-pierre-700">
                  {x.courriel && (
                    <a href={`mailto:${x.courriel}`} className="text-foret-700 hover:underline">
                      {x.courriel}
                    </a>
                  )}
                  {x.courriel && x.telephone && ' · '}
                  {x.telephone && (
                    <a href={`tel:${x.telephone}`} className="hover:underline">
                      {x.telephone}
                    </a>
                  )}
                </p>
                {x.notes && <p className="text-xs text-pierre-500">{x.notes}</p>}
              </div>
              {ecriture && <BoutonModifier onClick={() => setEdite(x)} />}
            </li>
          ))}
        </ul>
      )}
      {edite && <FenetreContact organisationId={id} contact={edite === 'nouveau' ? null : edite} fermer={() => setEdite(null)} />}
    </Section>
  )
}

function FenetreContact({ organisationId, contact, fermer }: { organisationId: string; contact: Contact | null; fermer: () => void }) {
  const ajouter = useAjouterContact()
  const modifier = useModifierContact()
  const supprimer = useSupprimerContact()
  const [v, setV] = useState({
    nom: contact?.nom ?? '',
    fonction: contact?.fonction ?? '',
    courriel: contact?.courriel ?? '',
    telephone: contact?.telephone ?? '',
    notes: contact?.notes ?? '',
    principal: contact?.principal ?? false,
  })
  const champ = (cle: keyof typeof v, libelle: string, type = 'text') => (
    <label className="block">
      <span className={ui.etiquette}>{libelle}</span>
      <input type={type} className={ui.champ} value={String(v[cle])} onChange={(e) => setV({ ...v, [cle]: e.target.value })} />
    </label>
  )
  const enregistrer = () => {
    if (!v.nom.trim()) return
    const champs = {
      nom: v.nom.trim(),
      fonction: v.fonction.trim() || null,
      courriel: v.courriel.trim() || null,
      telephone: v.telephone.trim() || null,
      notes: v.notes.trim() || null,
      principal: v.principal,
    }
    if (contact) modifier.mutate({ id: contact.id, champs })
    else ajouter.mutate({ id: crypto.randomUUID(), organisation_id: organisationId, ...champs })
    fermer()
  }
  return (
    <Dialogue titre={contact ? 'Modifier le contact' : 'Nouveau contact'} fermer={fermer}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          enregistrer()
        }}
      >
        {champ('nom', 'Nom')}
        {champ('fonction', 'Fonction (enseignante de 6e, direction…)')}
        <div className="grid grid-cols-2 gap-3">
          {champ('courriel', 'Courriel', 'email')}
          {champ('telephone', 'Téléphone', 'tel')}
        </div>
        {champ('notes', 'Notes')}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v.principal} onChange={(e) => setV({ ...v, principal: e.target.checked })} />
          Contact principal
        </label>
        <div className="flex items-center justify-between gap-2 pt-1">
          {contact ? (
            <BoutonSupprimer
              onClick={async () => {
                if (await confirmer({ titre: `Supprimer ${contact.nom} ?`, libelleOk: 'Supprimer' })) {
                  supprimer.mutate(contact.id)
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
            <button className={ui.bouton} disabled={!v.nom.trim()}>
              Enregistrer
            </button>
          </div>
        </div>
      </form>
    </Dialogue>
  )
}

// ------------------------------------------------------------
// Séjours (base de réservations) et visites ajoutées
// ------------------------------------------------------------
function Sejours({ id }: { id: string }) {
  const { parId, ecriture, auj } = useDonnees()
  const c = parId.get(id)!
  const ajouter = useAjouterVisite()
  const supprimer = useSupprimerVisite()
  const [ouvert, setOuvert] = useState(false)
  const [arrivee, setArrivee] = useState('')
  const [depart, setDepart] = useState('')
  const [participants, setParticipants] = useState('')
  const [note, setNote] = useState('')
  const valide = arrivee && depart && depart >= arrivee

  const creer = () => {
    if (!valide) return
    ajouter.mutate({
      id: crypto.randomUUID(),
      organisation_id: id,
      date_arrivee: arrivee,
      date_depart: depart,
      nb_participants: participants ? Number(participants) : null,
      note: note.trim() || null,
    })
    setOuvert(false)
    setArrivee('')
    setDepart('')
    setParticipants('')
    setNote('')
  }

  return (
    <Section
      titre="Séjours"
      action={
        ecriture &&
        !ouvert && (
          <button className={ui.boutonSecondaire} onClick={() => setOuvert(true)}>
            + Visite passée
          </button>
        )
      }
    >
      {ouvert && (
        <form
          className="mb-3 space-y-2 rounded-lg bg-pierre-50 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            creer()
          }}
        >
          <p className="text-xs text-pierre-500">Pour l'historique d'avant la base de réservations (les séjours Airtable arrivent tout seuls).</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={ui.etiquette}>Arrivée</span>
              <input type="date" className={ui.champ} value={arrivee} onChange={(e) => (setArrivee(e.target.value), !depart && setDepart(e.target.value))} />
            </label>
            <label className="block">
              <span className={ui.etiquette}>Départ</span>
              <input type="date" className={ui.champ} value={depart} min={arrivee} onChange={(e) => setDepart(e.target.value)} />
            </label>
            <label className="block">
              <span className={ui.etiquette}>Participants</span>
              <input inputMode="numeric" className={ui.champ} value={participants} onChange={(e) => setParticipants(e.target.value.replace(/\D/g, ''))} />
            </label>
            <label className="block">
              <span className={ui.etiquette}>Note</span>
              <input className={ui.champ} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Classe nature…" />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className={ui.boutonSecondaire} onClick={() => setOuvert(false)}>
              Annuler
            </button>
            <button className={ui.bouton} disabled={!valide}>
              Ajouter
            </button>
          </div>
        </form>
      )}
      {c.passages.length === 0 ? (
        <p className="text-sm text-pierre-500">
          Aucun séjour connu.{!c.org.airtable_client_id && ' Liez le client Airtable dans les informations pour voir ses réservations.'}
        </p>
      ) : (
        <ul className="divide-y divide-pierre-100 text-sm">
          {[...c.passages].reverse().map((p) => (
            <li key={p.cle} className="group flex items-start justify-between gap-2 py-1.5">
              <div>
                <p className={p.depart >= auj ? 'font-medium text-foret-800' : 'text-pierre-800'}>
                  {dateCourte(p.arrivee)} → {dateCourte(p.depart)}
                  {p.participants != null && <span className="text-pierre-500"> · {p.participants} pers.</span>}
                </p>
                <p className="text-xs text-pierre-500">
                  {p.source === 'sejour' ? `Réservation ${p.numero ?? ''} · ${p.etat ?? 'état inconnu'}` : 'Visite ajoutée'}
                  {p.type && ` · ${p.type}`} · {nomSaison(p.saison).toLowerCase()}
                </p>
              </div>
              {ecriture && p.source === 'visite' && (
                <button
                  aria-label="Supprimer la visite"
                  className="rounded p-1 text-pierre-300 opacity-0 hover:bg-red-50 hover:text-red-700 group-hover:opacity-100"
                  onClick={async () => (await confirmer({ titre: 'Supprimer cette visite ?', libelleOk: 'Supprimer' })) && supprimer.mutate(p.cle.slice(7))}
                >
                  <IconeCorbeille />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

// ------------------------------------------------------------
// Règles de relance propres au client (ex. Dawson : automne ≠ hiver)
// ------------------------------------------------------------
function ReglesPropres({ org: o }: { org: Organisation }) {
  const { regles, ecriture } = useDonnees()
  const ajouter = useAjouterRegle()
  const supprimer = useSupprimerRegle()
  const [saison, setSaison] = useState<Saison | ''>('')
  const [mois, setMois] = useState('6')
  const siennes = regles.filter((r) => r.organisation_id === o.id)
  const prises = new Set(siennes.map((r) => r.saison ?? ''))

  return (
    <Section titre="Quand relancer">
      <p className="mb-2 text-sm text-pierre-600">
        {SAISONS.map((s) => `${s.icone} ${moisAvant(o, s.id, regles)} mois`).join(' · ')}{' '}
        <span className="text-pierre-500">avant la prochaine visite attendue.</span>
      </p>
      {siennes.length > 0 && (
        <ul className="mb-2 space-y-1 text-sm">
          {siennes.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2">
              <span>
                Pour ce client{r.saison ? `, ${nomSaison(r.saison).toLowerCase()}` : ''} : <strong className="font-medium">{r.mois_avant} mois avant</strong>
              </span>
              {ecriture && (
                <button aria-label="Retirer la règle" className="rounded p-1 text-pierre-400 hover:bg-red-50 hover:text-red-700" onClick={() => supprimer.mutate(r.id)}>
                  <IconeCorbeille />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {ecriture && (
        <form
          className="flex flex-wrap items-center gap-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault()
            if (prises.has(saison)) return
            ajouter.mutate({ id: crypto.randomUUID(), genre: null, organisation_id: o.id, saison: saison || null, mois_avant: Number(mois) })
          }}
        >
          <span className="text-pierre-500">Règle propre :</span>
          <select aria-label="Saison" className="rounded-lg border border-pierre-300 bg-white px-2 py-1" value={saison} onChange={(e) => setSaison(e.target.value as Saison | '')}>
            <option value="">Toutes saisons</option>
            {SAISONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>
          <select aria-label="Mois avant" className="rounded-lg border border-pierre-300 bg-white px-2 py-1" value={mois} onChange={(e) => setMois(e.target.value)}>
            {Array.from({ length: 13 }, (_, i) => i).map((n) => (
              <option key={n} value={n}>
                {n} mois avant
              </option>
            ))}
          </select>
          <button className={ui.boutonSecondaire} disabled={prises.has(saison)}>
            Ajouter
          </button>
        </form>
      )}
    </Section>
  )
}
