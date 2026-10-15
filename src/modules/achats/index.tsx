import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { IconeCorbeille, IconeFermer, IconeSemaine } from '@/lib/icones'
import { PuceCompagnie } from '@/lib/PuceCompagnie'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import {
  argent,
  lireNombre,
  totalAchat,
  useAchats,
  useAjouterAchat,
  useEntreprises,
  useFournisseurs,
  useModifierAchat,
  useSupprimerAchat,
} from './donnees'
import {
  aCommanderBientot,
  comparerParDate,
  comparerParStatut,
  dateCourte,
  dateValide,
  etatCible,
  HORIZON_JOURS,
  jourAujourdhui,
  libelleCible,
  type EtatCible,
} from './outils'
import { STATUTS, type Achat, type Entreprise, type Statut } from './types'

/** Ce que montre la liste : les achats pas encore reçus, un statut, ou tout. */
type Vue = 'en_cours' | Statut | 'tous'

const VUES: { id: Vue; nom: string }[] = [
  { id: 'en_cours', nom: 'En cours' },
  { id: 'a_commander', nom: 'À commander' },
  { id: 'commande', nom: 'Commandés' },
  { id: 'recu', nom: 'Reçus' },
  { id: 'tous', nom: 'Tous' },
]

const garde = (vue: Vue, a: Achat) => (vue === 'tous' ? true : vue === 'en_cours' ? a.statut !== 'recu' : a.statut === vue)

type Tri = 'statut' | 'date'

const STYLE_STATUT: Record<Statut, string> = {
  a_commander: 'border-amber-200 bg-amber-50 text-amber-900',
  commande: 'border-sky-200 bg-sky-50 text-sky-900',
  recu: 'border-foret-100 bg-foret-50 text-foret-800',
}

/** Date cible d'un achat « À commander » : rouge dépassée, ambre à 7 jours ou moins. */
type Signal = Exclude<EtatCible, 'plus_tard'>
const STYLE_CIBLE: Record<Signal, string> = {
  retard: 'border-red-200 bg-red-50 text-red-800',
  proche: 'border-amber-200 bg-amber-50 text-amber-900',
}
/** Même teinte sur le champ date (`!` : l'emporte sur le fond transparent de `cellule`). */
const STYLE_CHAMP_CIBLE: Record<Signal, string> = {
  retard: 'border-red-200! bg-red-50! text-red-800',
  proche: 'border-amber-200! bg-amber-50! text-amber-900',
}

const cellule = 'w-full rounded border border-transparent bg-transparent px-1.5 py-1 hover:border-pierre-200 focus:border-foret-600 focus:outline-none disabled:hover:border-transparent'

/** Liste des achats d'équipement : à commander → commandé → reçu (direction). */
export default function ModuleAchats() {
  const ecriture = useAuth().peutEcrire('achats')
  const voitFournisseurs = useAuth().peutLire('mastertimeline')
  const achats = useAchats()
  const entreprises = useEntreprises()
  const fournisseurs = useFournisseurs()
  const ajouter = useAjouterAchat()
  // ?cible : seulement les achats à commander bientôt (compteur du haut,
  // lien de l'accueil : LIEN_A_COMMANDER_BIENTOT).
  const [params, setParams] = useSearchParams()
  const cible = params.has('cible')
  const [vue, setVue] = useState<Vue>('en_cours')
  const [tri, setTri] = useState<Tri>(() => (cible ? 'date' : 'statut'))
  const [entreprise, setEntreprise] = useState('')
  const [ajout, setAjout] = useState(false)
  const jour = jourAujourdhui()

  const filtrerCible = (actif: boolean) =>
    setParams(
      (p) => {
        const suite = new URLSearchParams(p)
        if (actif) suite.set('cible', String(HORIZON_JOURS))
        else suite.delete('cible')
        return suite
      },
      { replace: true },
    )

  const donnees = useMemo(() => {
    const tous = (achats.data ?? []).filter((a) => !entreprise || a.entreprise_id === entreprise)
    const compte = (v: Vue) => tous.filter((a) => garde(v, a)).length
    const bientot = aCommanderBientot(tous, jour)
    const liste = (cible ? [...bientot.enRetard, ...bientot.aVenir] : tous.filter((a) => garde(vue, a))).sort(
      tri === 'date' ? comparerParDate : comparerParStatut,
    )
    const totaux = liste.map(totalAchat)
    return {
      liste,
      compte,
      bientot,
      total: totaux.reduce<number>((n, t) => n + (t ?? 0), 0),
      sansPrix: totaux.filter((t) => t == null).length,
    }
  }, [achats.data, vue, entreprise, cible, tri, jour])

  const erreur = achats.error ?? entreprises.error ?? fournisseurs.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!achats.data || !entreprises.data || !fournisseurs.data) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const { liste, compte, bientot, total, sansPrix } = donnees

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Achats</h1>
        {ecriture && !ajout && (
          <button className={ui.bouton} onClick={() => setAjout(true)}>
            + Ajouter un achat
          </button>
        )}
      </div>

      <CompteurCible
        nombre={bientot.nombre}
        enRetard={bientot.enRetard.length}
        actif={cible}
        basculer={() => {
          if (!cible) setTri('date')
          filtrerCible(!cible)
        }}
      />

      {ajout && (
        <NouvelAchat
          annuler={() => setAjout(false)}
          ajouter={(item, date_cible) => {
            const achat: Achat = {
              id: crypto.randomUUID(),
              item,
              statut: 'a_commander',
              quantite: null,
              prix_unitaire: null,
              entreprise_id: entreprise || null,
              fournisseur_id: null,
              note: null,
              date_cible,
              created_at: new Date().toISOString(),
            }
            ajouter.mutate(achat)
            setAjout(false)
            // Le nouvel achat doit rester visible.
            if (cible && !aCommanderBientot([achat], jour).nombre) filtrerCible(false)
            if (vue === 'commande' || vue === 'recu') setVue('en_cours')
          }}
        />
      )}

      <BandeauErreurs racine="achats" />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap rounded-lg border border-pierre-300 bg-white p-0.5 text-sm" role="group" aria-label="Statut">
          {VUES.map((v) => (
            <button
              key={v.id}
              aria-pressed={!cible && vue === v.id}
              className={`rounded-md px-2.5 py-1 ${!cible && vue === v.id ? 'bg-foret-100 font-medium text-foret-800' : 'text-pierre-600 hover:text-pierre-900'}`}
              onClick={() => {
                setVue(v.id)
                if (cible) filtrerCible(false)
              }}
            >
              {v.nom} <span className="tabular-nums text-pierre-400">{compte(v.id)}</span>
            </button>
          ))}
        </div>
        <select
          aria-label="Entreprise"
          className="rounded-lg border border-pierre-300 bg-white px-2.5 py-1.5 text-sm text-pierre-800"
          value={entreprise}
          onChange={(e) => setEntreprise(e.target.value)}
        >
          <option value="">Toutes les entreprises</option>
          {entreprises.data.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nom}
            </option>
          ))}
        </select>
        <select
          aria-label="Tri"
          className="rounded-lg border border-pierre-300 bg-white px-2.5 py-1.5 text-sm text-pierre-800"
          value={tri}
          onChange={(e) => setTri(e.target.value as Tri)}
        >
          <option value="statut">Trier par statut</option>
          <option value="date">Trier par date cible</option>
        </select>
        <p className="ml-auto text-sm text-pierre-600">
          Total estimé : <span className="font-semibold tabular-nums text-pierre-900">{argent(total)}</span>
          {sansPrix > 0 && (
            <span className="text-pierre-400">
              {' '}
              · {sansPrix} sans prix
            </span>
          )}
        </p>
      </div>

      <div className={`${ui.carte} overflow-x-auto`}>
        {/* L'item prend ce qui reste ; en dessous de 70rem, on défile. */}
        <table className="w-full min-w-[70rem] table-fixed text-sm">
          <colgroup>
            <col className="w-32" />
            <col />
            <col className="w-36" />
            <col className="w-16" />
            <col className="w-24" />
            <col className="w-24" />
            <col className="w-28" />
            <col className="w-32" />
            <col className="w-40" />
            <col className="w-9" />
          </colgroup>
          <thead className="border-b border-pierre-200 bg-pierre-50 text-left text-xs font-medium uppercase tracking-wide text-pierre-500">
            <tr>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Date cible</th>
              <th className="px-3 py-2 text-right">Qté</th>
              <th className="px-3 py-2 text-right">Prix unitaire</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">Entreprise</th>
              <th className="px-3 py-2">Fournisseur</th>
              <th className="px-3 py-2">Note</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-pierre-100">
            {liste.map((a) => (
              <Rangee key={a.id} achat={a} jour={jour} ecriture={ecriture} entreprises={entreprises.data} fournisseurs={fournisseurs.data} />
            ))}
          </tbody>
        </table>
        {liste.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-pierre-500">
            {cible ? `Aucun achat à commander dans les ${HORIZON_JOURS} prochains jours.` : 'Aucun achat ici.'}
          </p>
        )}
      </div>

      {voitFournisseurs && (
        <p className="text-xs text-pierre-500">
          Les entreprises sont les compagnies du référentiel ; les fournisseurs viennent de Mastertimeline :{' '}
          <Link to="/mastertimeline/reglages/fournisseurs" className="text-foret-700 underline">
            gérer les fournisseurs
          </Link>
          .
        </p>
      )}
    </div>
  )
}

function Rangee({
  achat: a,
  jour,
  ecriture,
  entreprises,
  fournisseurs,
}: {
  achat: Achat
  jour: string
  ecriture: boolean
  entreprises: Entreprise[]
  fournisseurs: { id: string; nom: string }[]
}) {
  const modifier = useModifierAchat()
  const supprimer = useSupprimerAchat()
  const changer = (champs: Partial<Achat>) => modifier.mutate({ id: a.id, champs })
  const total = totalAchat(a)
  const recu = a.statut === 'recu'
  const compagnie = entreprises.find((e) => e.id === a.entreprise_id)
  const etat = etatCible(a, jour)
  const signal = etat === 'retard' || etat === 'proche' ? etat : null

  return (
    <tr className={`align-top ${recu ? 'text-pierre-500' : ''}`}>
      <td className="px-2 py-1.5">
        <select
          aria-label={`Statut de « ${a.item} »`}
          className={`fleche-serree w-full rounded-full border py-1 pl-2.5 text-xs font-medium ${STYLE_STATUT[a.statut]}`}
          value={a.statut}
          disabled={!ecriture}
          onChange={(e) => changer({ statut: e.target.value as Statut })}
        >
          {STATUTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <ChampTexte aria-label="Item" className={cellule} valeur={a.item} obligatoire disabled={!ecriture} enregistrer={(item) => changer({ item })} />
        {/* Compagnie qui paie et signal de la date cible, sous le nom (visibles aussi sur téléphone, où le tableau défile). */}
        {(compagnie || signal) && (
          <div className="flex flex-wrap items-center gap-1 px-1.5 pb-0.5">
            {compagnie && <PuceCompagnie compagnie={compagnie} court className="px-1.5! py-px!" />}
            {signal && a.date_cible && (
              <span
                className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-px text-xs font-medium ${STYLE_CIBLE[signal]}`}
                title={`Date cible : ${dateCourte(a.date_cible, jour)}`}
              >
                {libelleCible(a.date_cible, jour)}
              </span>
            )}
          </div>
        )}
      </td>
      <td className="px-2 py-1.5">
        <ChampDate
          libelle={`Date cible de « ${a.item} »`}
          valeur={a.date_cible}
          desactive={!ecriture}
          className={signal ? STYLE_CHAMP_CIBLE[signal] : ''}
          enregistrer={(date_cible) => changer({ date_cible })}
        />
      </td>
      <td className="px-2 py-1.5">
        <ChampNombre
          libelle="Quantité"
          valeur={a.quantite}
          entier
          desactive={!ecriture}
          enregistrer={(quantite) => changer({ quantite })}
        />
      </td>
      <td className="px-2 py-1.5">
        <ChampNombre
          libelle="Prix unitaire estimé"
          valeur={a.prix_unitaire}
          argent
          desactive={!ecriture}
          enregistrer={(prix_unitaire) => changer({ prix_unitaire })}
        />
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{total != null ? argent(total) : <span className="text-pierre-300">—</span>}</td>
      <td className="px-2 py-1.5">
        <Choix libelle="Entreprise" valeur={a.entreprise_id} options={entreprises} desactive={!ecriture} changer={(entreprise_id) => changer({ entreprise_id })} />
      </td>
      <td className="px-2 py-1.5">
        <Choix libelle="Fournisseur" valeur={a.fournisseur_id} options={fournisseurs} desactive={!ecriture} changer={(fournisseur_id) => changer({ fournisseur_id })} />
      </td>
      <td className="px-2 py-1.5">
        <ChampTexte aria-label="Note" className={cellule} valeur={a.note ?? ''} disabled={!ecriture} enregistrer={(note) => changer({ note: note || null })} />
      </td>
      <td className="px-1 py-1.5 text-right">
        {ecriture && (
          <button
            aria-label={`Supprimer ${a.item}`}
            className="rounded p-1 text-pierre-400 hover:bg-red-50 hover:text-red-700"
            onClick={async () => {
              if (await confirmer({ titre: `Supprimer « ${a.item} » ?`, libelleOk: 'Supprimer' })) supprimer.mutate(a.id)
            }}
          >
            <IconeCorbeille />
          </button>
        )}
      </td>
    </tr>
  )
}

/** « 5 achats à commander dans les 30 prochains jours, dont 2 en retard » : un clic filtre la liste sur eux. */
function CompteurCible({ nombre, enRetard, actif, basculer }: { nombre: number; enRetard: number; actif: boolean; basculer: () => void }) {
  if (!nombre && !actif) {
    return <p className="text-sm text-pierre-500">Aucun achat à commander dans les {HORIZON_JOURS} prochains jours.</p>
  }
  return (
    <button
      aria-pressed={actif}
      title={actif ? 'Revenir à toute la liste' : 'Voir seulement ces achats'}
      className={`inline-flex max-w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-sm ${
        actif ? 'border-foret-600 bg-foret-50 text-foret-900' : 'border-pierre-300 bg-white text-pierre-800 hover:bg-pierre-50'
      }`}
      onClick={basculer}
    >
      <IconeSemaine className="size-4 text-pierre-500" />
      <span>
        <span className="font-semibold tabular-nums">{nombre}</span> achat{nombre > 1 ? 's' : ''} à commander dans les {HORIZON_JOURS} prochains jours
        {enRetard > 0 && <span className="font-medium text-red-700">, dont {enRetard} en retard</span>}
      </span>
      {actif && <IconeFermer className="size-4 text-foret-700" />}
    </button>
  )
}

/** Ajout d'un achat : son nom et, au besoin, sa date cible. Entrée ajoute, Échap annule. */
function NouvelAchat({ ajouter, annuler }: { ajouter: (item: string, date_cible: string | null) => void; annuler: () => void }) {
  const [item, setItem] = useState('')
  const [date, setDate] = useState('')
  const dateOk = !date || dateValide(date)
  const pret = !!item.trim() && dateOk
  const envoyer = () => pret && ajouter(item.trim(), date || null)
  return (
    <div
      className="flex max-w-2xl flex-wrap items-end gap-2"
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          envoyer()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          annuler()
        }
      }}
    >
      <label className="min-w-0 flex-1 basis-56">
        <span className={ui.etiquette}>Item</span>
        <input autoFocus aria-label="Nouvel achat" className={ui.champ} placeholder="Ex. Pagaies" value={item} onChange={(e) => setItem(e.target.value)} />
      </label>
      <label className="w-44">
        <span className={ui.etiquette}>Date cible (facultative)</span>
        <input
          type="date"
          aria-label="Date cible du nouvel achat"
          className={`${ui.champ} ${dateOk ? '' : 'border-red-400'}`}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <button type="button" className={ui.bouton} disabled={!pret} onClick={envoyer}>
        Ajouter
      </button>
      <button type="button" aria-label="Annuler" className="rounded-lg px-2 py-2 text-pierre-500 hover:bg-pierre-100 hover:text-pierre-800" onClick={annuler}>
        ✕
      </button>
    </div>
  )
}

/**
 * Date enregistrée dès qu'elle est complète (un champ date en cours de
 * frappe donne « 0002-… » : pas enregistré) ; vidée = pas de date.
 */
function ChampDate({
  libelle,
  valeur,
  enregistrer,
  desactive,
  className = '',
}: {
  libelle: string
  valeur: string | null
  enregistrer: (v: string | null) => void
  desactive: boolean
  className?: string
}) {
  const [texte, setTexte] = useState(valeur ?? '')
  const [base, setBase] = useState(valeur)
  if (valeur !== base) {
    setBase(valeur)
    setTexte(valeur ?? '')
  }
  return (
    <input
      type="date"
      aria-label={libelle}
      // Vide : « aaaa-mm-jj » pâle, pour ne pas charger la liste.
      className={`${cellule} ${texte ? '' : 'text-pierre-300 focus:text-pierre-900'} ${className}`}
      value={texte}
      disabled={desactive}
      onChange={(e) => {
        const v = e.target.value
        setTexte(v)
        if ((v === '' || dateValide(v)) && (v || null) !== valeur) enregistrer(v || null)
      }}
      onBlur={() => texte && !dateValide(texte) && setTexte(valeur ?? '')}
    />
  )
}

function Choix({
  libelle,
  valeur,
  options,
  changer,
  desactive,
}: {
  libelle: string
  valeur: string | null
  options: { id: string; nom: string }[]
  changer: (v: string | null) => void
  desactive: boolean
}) {
  return (
    <select aria-label={libelle} className={cellule} value={valeur ?? ''} disabled={desactive} onChange={(e) => changer(e.target.value || null)}>
      <option value="">—</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.nom}
        </option>
      ))}
    </select>
  )
}

/**
 * Nombre enregistré à la sortie du champ (ou Entrée). Vide = pas précisé ;
 * une valeur illisible ou hors limites reprend la valeur d'avant.
 */
function ChampNombre({
  libelle,
  valeur,
  enregistrer,
  entier,
  argent: estArgent,
  desactive,
}: {
  libelle: string
  valeur: number | null
  enregistrer: (v: number | null) => void
  entier?: boolean
  argent?: boolean
  desactive: boolean
}) {
  const afficher = (v: number | null) => (v == null ? '' : estArgent ? v.toFixed(2).replace('.', ',') : String(v))
  const [texte, setTexte] = useState(afficher(valeur))
  const [base, setBase] = useState(valeur)
  if (valeur !== base) {
    setBase(valeur)
    setTexte(afficher(valeur))
  }
  return (
    <input
      aria-label={libelle}
      inputMode={entier ? 'numeric' : 'decimal'}
      className={`${cellule} text-right tabular-nums`}
      value={texte}
      placeholder="—"
      disabled={desactive}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={() => {
        const n = lireNombre(texte)
        const valide = n === null || (n !== undefined && (entier ? Number.isInteger(n) && n > 0 : n >= 0))
        if (!valide) return setTexte(afficher(valeur))
        const arrondi = n == null ? null : estArgent ? Math.round(n * 100) / 100 : n
        if (arrondi !== valeur) enregistrer(arrondi)
        setTexte(afficher(arrondi))
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}
