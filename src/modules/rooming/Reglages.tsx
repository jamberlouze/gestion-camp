import { useState, type ReactNode } from 'react'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { IconeChevron, IconeCorbeille, IconePlus } from '@/lib/icones'
import { SaisieNom } from '@/lib/SaisieNom'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { enregistrerStructure, ordonner, remettreLieu, retirerLieu, supprimerStructure, useRelire, type Donnees, type TableStructure } from './donnees'
import { dansReference, enfantsDe, pluriel } from './outils'
import { NIVEAUX, type Chambre, type Lieu, type Niveau } from './types'

type Faire = (f: () => Promise<unknown>) => Promise<string | null>

const parOrdre = <T extends { ordre: number }>(a: T, b: T) => a.ordre - b.ordre
const maxOrdre = (l: { ordre: number }[]) => l.reduce((m, x) => Math.max(m, x.ordre), 0)

/**
 * Référence : la réalité d'aujourd'hui, un arbre de lieux (site > bâtiment >
 * section > étage ; site, section et étage facultatifs) et leurs chambres
 * avec leurs lits, sans personne. Un nouveau plan en prend une photo ;
 * changer la référence ne touche jamais un plan déjà créé. Retirer un lieu
 * ou une chambre qu'un plan utilise le retire seulement de la référence.
 */
export function Reglages({ d }: { d: Donnees }) {
  const ecriture = useAuth().peutEcrire('rooming')
  const relire = useRelire()
  const [erreur, setErreur] = useState<string | null>(null)
  // Après un refus, on remonte les champs pour qu'ils reprennent les valeurs de la base.
  const [version, setVersion] = useState(0)

  const faire: Faire = async (f) => {
    setErreur(null)
    try {
      await f()
      await relire()
      return null
    } catch (e) {
      const m = messageErreur(e)
      setErreur(m)
      await relire()
      setVersion((v) => v + 1)
      return m
    }
  }

  if (!ecriture) return <p className="py-8 text-center text-sm text-pierre-500">La référence se règle par les personnes qui peuvent modifier ce module.</p>

  const racines = enfantsDe(d.structure.lieux, null)
  const reference = dansReference(d.structure)
  const actives = d.structure.chambres.filter((c) => reference.chambres.has(c.id))
  const totalLits = actives.reduce((t, c) => t + c.lits, 0)
  const ajouterRacine = (niveau: Niveau) => (nom: string) =>
    faire(() => enregistrerStructure<Lieu>('lieux', { nom, niveau, parent_id: null, ordre: maxOrdre(racines) + 1 }))

  return (
    <div className="max-w-4xl space-y-4">
      <div className="rounded-lg bg-pierre-100 px-3 py-2 text-sm text-pierre-700">
        <p>
          La réalité d'aujourd'hui : <strong>{pluriel(actives.length, 'chambre', 'chambres')}</strong>, <strong>{pluriel(totalLits, 'lit', 'lits')}</strong>.
        </p>
        <p className="mt-1">
          Un <strong>nouveau plan</strong> part de cette référence (chambres et lits, sans personne). Les plans déjà créés gardent leurs lits : les
          changer ici ne les touche pas.
        </p>
      </div>
      {erreur && (
        <p className={`${ui.erreur} sticky top-2 z-10`}>
          {erreur}{' '}
          <button className="ml-2 underline" onClick={() => setErreur(null)}>
            Fermer
          </button>
        </p>
      )}
      <div key={version} className="space-y-3">
        {racines.map((l, i) => (
          <BlocLieu key={l.id} lieu={l} freres={racines} i={i} d={d} faire={faire} reference={reference.chambres} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Ajout libelle="Ajouter un bâtiment" placeholder="Nom du bâtiment" valider={ajouterRacine('batiment')} />
        <Ajout libelle="Ajouter un site (regroupe des bâtiments)" placeholder="Nom du site" valider={ajouterRacine('site')} />
      </div>
    </div>
  )
}

const LITS_PAR_DEFAUT = 4

/** Toutes les chambres d'un lieu et de tout ce qu'il contient. */
function chambresDe(lieu: Lieu, d: Donnees): Chambre[] {
  return [
    ...d.structure.chambres.filter((c) => c.lieu_id === lieu.id),
    ...enfantsDe(d.structure.lieux, lieu.id).flatMap((e) => chambresDe(e, d)),
  ]
}

type Proprietes = { lieu: Lieu; freres: Lieu[]; i: number; d: Donnees; faire: Faire; reference: Set<string> }

function BlocLieu(props: Proprietes) {
  return props.lieu.actif ? <BlocLieuActif {...props} /> : <BlocLieuRetire {...props} />
}

/** Lieu retiré de la référence : replié, avec « Remettre ». */
function BlocLieuRetire({ lieu, d, faire }: Proprietes) {
  const chambres = chambresDe(lieu, d)
  const ids = new Set(chambres.map((c) => c.id))
  const plans = new Set(d.occupations.filter((o) => ids.has(o.chambre_id)).map((o) => o.plan_id)).size
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-dashed border-pierre-300 px-3 py-2 text-sm text-pierre-500">
      <span className="font-medium text-pierre-600">
        {lieu.nom}
        {lieu.code && <span className="ml-1.5 font-normal">({lieu.code})</span>}
      </span>
      <span className="rounded bg-pierre-100 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide">Retiré de la référence</span>
      <span className="text-xs">
        {pluriel(chambres.length, 'chambre', 'chambres')}
        {plans > 0 && `, gardé dans ${pluriel(plans, 'plan', 'plans')}`}
      </span>
      <button
        type="button"
        className="ml-auto rounded px-2 py-1 text-xs font-medium text-foret-700 hover:bg-foret-50"
        onClick={() => faire(() => remettreLieu(lieu.id))}
      >
        Remettre
      </button>
    </div>
  )
}

function BlocLieuActif({ lieu, freres, i, d, faire, reference }: Proprietes) {
  const enfants = enfantsDe(d.structure.lieux, lieu.id)
  const chambres = d.structure.chambres.filter((c) => c.lieu_id === lieu.id).sort(parOrdre)
  const enfant = NIVEAUX[lieu.niveau].enfant
  const sites = d.structure.lieux.filter((l) => l.niveau === 'site').sort(parOrdre)
  const lits = chambresDe(lieu, d)
    .filter((c) => reference.has(c.id))
    .reduce((t, c) => t + c.lits, 0)

  // S'il sert dans un plan, il est seulement retiré de la référence ; sinon effacé.
  async function retirer() {
    const ids = new Set(chambresDe(lieu, d).map((c) => c.id))
    const plans = new Set(d.occupations.filter((o) => ids.has(o.chambre_id)).map((o) => o.plan_id)).size
    const ok = await confirmer({
      titre: `Retirer « ${lieu.nom} » de la référence ?`,
      message: plans
        ? `Les nouveaux plans ne l'auront plus, ni ce qu'il contient. Les ${pluriel(plans, 'plan', 'plans')} qui l'utilisent le gardent. Vous pourrez le remettre.`
        : `Aucun plan ne l'utilise : il sera effacé${ids.size ? `, avec ses ${pluriel(ids.size, 'chambre', 'chambres')}` : ''}.`,
      libelleOk: 'Retirer',
    })
    if (ok) faire(() => retirerLieu(lieu.id))
  }

  const style = {
    site: 'rounded-xl border-2 border-pierre-200 p-3',
    batiment: `${ui.carte} p-3`,
    section: 'rounded-lg border border-pierre-200 p-2.5',
    etage: 'border-l-2 border-pierre-200 pl-3',
  }[lieu.niveau]
  const taille = { site: 'text-base font-semibold', batiment: 'font-semibold', section: 'text-sm font-semibold', etage: 'text-sm font-medium' }[lieu.niveau]

  return (
    <div className={style}>
      <Entete table="lieux" ligne={lieu} freres={freres} i={i} faire={faire} taille={taille} retirer={retirer} etiquette={NIVEAUX[lieu.niveau].libelle}>
        <span className="rounded bg-pierre-100 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-pierre-500">{NIVEAUX[lieu.niveau].libelle}</span>
        {lieu.niveau !== 'site' && (
          <ChampTexte
            aria-label={`Abréviation de ${lieu.nom}`}
            placeholder="Abrév."
            title="Abréviation affichée devant les numéros de chambre (ex. CH)"
            className="w-16 rounded-md border border-pierre-200 bg-white px-1.5 py-1 text-xs focus:border-foret-600 focus:outline-none"
            valeur={lieu.code ?? ''}
            enregistrer={(code) => faire(() => enregistrerStructure<Lieu>('lieux', { id: lieu.id, code: code || null }))}
          />
        )}
        {lieu.niveau === 'batiment' && sites.length > 0 && (
          <select
            aria-label={`Site de ${lieu.nom}`}
            className="rounded-md border border-pierre-200 bg-white py-1 pl-2 text-xs text-pierre-600"
            value={lieu.parent_id ?? ''}
            onChange={(e) => faire(() => enregistrerStructure<Lieu>('lieux', { id: lieu.id, parent_id: e.target.value || null }))}
          >
            <option value="">Indépendant</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>
        )}
        <span className="text-xs tabular-nums text-pierre-500">{pluriel(lits, 'lit', 'lits')}</span>
      </Entete>

      {(chambres.length > 0 || enfants.length > 0 || lieu.niveau !== 'site') && (
        <div className="mt-2 space-y-2 pl-2">
          {chambres.length > 0 && <ListeChambres chambres={chambres} d={d} faire={faire} />}
          {enfants.map((e, j) => (
            <BlocLieu key={e.id} lieu={e} freres={enfants} i={j} d={d} faire={faire} reference={reference} />
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-2">
        {enfant && (
          <Ajout
            libelle={`Ajouter ${enfant === 'etage' ? 'un étage' : enfant === 'section' ? 'une section' : 'un bâtiment'}`}
            placeholder={`Nom ${enfant === 'etage' ? "de l'étage (ex. Cèdres Haut)" : enfant === 'section' ? 'de la section' : 'du bâtiment'}`}
            petit
            valider={(nom) => faire(() => enregistrerStructure<Lieu>('lieux', { nom, niveau: enfant, parent_id: lieu.id, ordre: maxOrdre(enfants) + 1 }))}
          />
        )}
        {lieu.niveau !== 'site' && (
          <Ajout
            libelle="Ajouter une chambre"
            placeholder="Numéro ou nom (ex. 13, Appart)"
            petit
            valider={(numero) =>
              faire(() => enregistrerStructure<Chambre>('chambres', { numero, lits: LITS_PAR_DEFAUT, lieu_id: lieu.id, ordre: maxOrdre(chambres) + 1 }))
            }
          />
        )}
      </div>
    </div>
  )
}

function ListeChambres({ chambres, d, faire }: { chambres: Chambre[]; d: Donnees; faire: Faire }) {
  const deplacer = (j: number, sens: -1 | 1) => {
    const ids = chambres.map((c) => c.id)
    ;[ids[j], ids[j + sens]] = [ids[j + sens], ids[j]]
    faire(() => ordonner('chambres', ids))
  }

  // Une chambre qu'un plan utilise est seulement retirée de la référence
  // (les anciens plans la gardent) ; sinon elle est effacée.
  async function retirer(c: Chambre) {
    const plans = new Set(d.occupations.filter((o) => o.chambre_id === c.id).map((o) => o.plan_id)).size
    const ok = await confirmer({
      titre: `Retirer la chambre ${c.numero} de la référence ?`,
      message: plans
        ? `Les nouveaux plans ne l'auront plus. Les ${pluriel(plans, 'plan', 'plans')} qui l'ont déjà la gardent. Vous pourrez la remettre.`
        : "Aucun plan ne l'utilise : elle sera effacée.",
      libelleOk: 'Retirer',
    })
    if (!ok) return
    faire(() => (plans ? enregistrerStructure<Chambre>('chambres', { id: c.id, actif: false }) : supprimerStructure('chambres', c.id)))
  }

  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-1.5">
      {chambres.map((c, j) => (
        <li
          key={c.id}
          className={`flex items-center gap-1 rounded-md border px-1.5 py-1 ${c.actif ? 'border-pierre-200 bg-pierre-50' : 'border-dashed border-pierre-300 bg-white text-pierre-400'}`}
          title={c.actif ? undefined : "Retirée de la référence : les nouveaux plans ne l'ont pas"}
        >
          <ChampTexte
            aria-label={`Numéro de la chambre ${c.numero}`}
            className="w-20 min-w-0 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-medium hover:border-pierre-300 focus:border-foret-600 focus:bg-white focus:outline-none"
            valeur={c.numero}
            obligatoire
            enregistrer={(numero) => faire(() => enregistrerStructure<Chambre>('chambres', { id: c.id, numero }))}
          />
          <ChampTexte
            type="number"
            min={0}
            max={50}
            inputMode="numeric"
            aria-label={`Lits de la chambre ${c.numero}`}
            className="w-12 rounded border border-pierre-200 bg-white px-1 py-0.5 text-right text-sm tabular-nums focus:border-foret-600 focus:outline-none"
            valeur={String(c.lits)}
            obligatoire
            enregistrer={(v) => {
              const lits = Number(v)
              faire(async () => {
                if (!Number.isInteger(lits) || lits < 0 || lits > 50) throw new Error('Le nombre de lits doit être un entier de 0 à 50.')
                await enregistrerStructure<Chambre>('chambres', { id: c.id, lits })
              })
            }}
          />
          <span className="text-xs text-pierre-500">lits</span>
          <span className="ml-auto flex">
            <BoutonIcone libelle="Avancer" desactive={j === 0} onClick={() => deplacer(j, -1)}>
              <IconeChevron className="size-3.5 rotate-180" />
            </BoutonIcone>
            <BoutonIcone libelle="Reculer" desactive={j === chambres.length - 1} onClick={() => deplacer(j, 1)}>
              <IconeChevron className="size-3.5" />
            </BoutonIcone>
            {c.actif ? (
              <BoutonIcone libelle={`Retirer la chambre ${c.numero}`} danger onClick={() => retirer(c)}>
                <IconeCorbeille className="size-3.5" />
              </BoutonIcone>
            ) : (
              <button
                type="button"
                className="rounded px-1.5 text-xs font-medium text-foret-700 hover:bg-foret-50"
                onClick={() => faire(() => enregistrerStructure<Chambre>('chambres', { id: c.id, actif: true }))}
              >
                Remettre
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Nom modifiable + monter/descendre + retirer. */
function Entete<T extends { id: string; nom: string; ordre: number }>({
  table,
  ligne,
  freres,
  i,
  faire,
  taille,
  retirer,
  etiquette,
  children,
}: {
  table: TableStructure
  ligne: T
  freres: T[]
  i: number
  faire: Faire
  taille: string
  retirer: () => void
  etiquette: string
  children?: ReactNode
}) {
  const deplacer = (sens: -1 | 1) => {
    const ids = freres.map((f) => f.id)
    ;[ids[i], ids[i + sens]] = [ids[i + sens], ids[i]]
    faire(() => ordonner(table, ids))
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ChampTexte
        aria-label={`${etiquette} : ${ligne.nom}`}
        className={`min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 hover:border-pierre-300 focus:border-foret-600 focus:outline-none ${taille}`}
        valeur={ligne.nom}
        obligatoire
        enregistrer={(nom) => faire(() => enregistrerStructure<T>(table, { id: ligne.id, nom } as unknown as Partial<T>))}
      />
      {children}
      <BoutonIcone libelle="Monter" desactive={i === 0} onClick={() => deplacer(-1)}>
        <IconeChevron className="size-4 -rotate-90" />
      </BoutonIcone>
      <BoutonIcone libelle="Descendre" desactive={i === freres.length - 1} onClick={() => deplacer(1)}>
        <IconeChevron className="size-4 rotate-90" />
      </BoutonIcone>
      <BoutonIcone libelle={`Retirer ${ligne.nom}`} danger onClick={retirer}>
        <IconeCorbeille className="size-4" />
      </BoutonIcone>
    </div>
  )
}

function BoutonIcone({ libelle, desactive, danger, onClick, children }: { libelle: string; desactive?: boolean; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={libelle}
      aria-label={libelle}
      disabled={desactive}
      onClick={onClick}
      className={`rounded p-1 text-pierre-500 disabled:opacity-30 ${danger ? 'hover:bg-red-50 hover:text-red-700' : 'hover:bg-pierre-100'}`}
    >
      {children}
    </button>
  )
}

function Ajout({ libelle, placeholder, valider, petit }: { libelle: string; placeholder: string; valider: (nom: string) => Promise<string | null>; petit?: boolean }) {
  const [ouvert, setOuvert] = useState(false)
  if (ouvert) {
    return (
      <div className="w-full max-w-sm">
        <SaisieNom
          compact
          placeholder={placeholder}
          libelleOk="Ajouter"
          annuler={() => setOuvert(false)}
          valider={async (nom) => {
            const probleme = await valider(nom)
            if (!probleme) setOuvert(false)
            return probleme
          }}
        />
      </div>
    )
  }
  return (
    <button className={`inline-flex items-center gap-1 font-medium text-foret-700 hover:underline ${petit ? 'text-xs' : 'text-sm'}`} onClick={() => setOuvert(true)}>
      <IconePlus className={petit ? 'size-3.5' : 'size-4'} /> {libelle}
    </button>
  )
}
