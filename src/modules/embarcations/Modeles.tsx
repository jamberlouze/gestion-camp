import { useMemo, useState, type FormEvent } from 'react'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { useCreerEmbarcation, useCreerModele, useEmbarcations, useMajModele, useModeles } from './donnees'
import { BOUCHONS, TYPES, type Bouchon, type Modele, type TypeEmbarcation } from './types'

export function Modeles() {
  const { peutEcrire } = useAuth()
  const ecriture = peutEcrire('embarcations')
  const modeles = useModeles()
  const embarcations = useEmbarcations()

  const unites = useMemo(() => {
    const n = new Map<string, number>()
    embarcations.data?.forEach((e) => n.set(e.modele_id, (n.get(e.modele_id) ?? 0) + 1))
    return n
  }, [embarcations.data])

  if (!modeles.data) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  return (
    <div className="space-y-5">
      {ecriture && <FormulaireModele modeles={modeles.data} />}

      <section className={`${ui.carte} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-pierre-200 bg-pierre-50 text-left text-pierre-500">
              <tr>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Nom</th>
                <th className="px-3 py-2 font-medium">Préfixe</th>
                <th className="px-3 py-2 font-medium">Bouchon</th>
                <th className="px-3 py-2 text-right font-medium">Unités</th>
                {ecriture && <th />}
              </tr>
            </thead>
            <tbody className="divide-y divide-pierre-100">
              {modeles.data.map((m) => (
                <LigneModele key={m.id} modele={m} unites={unites.get(m.id) ?? 0} ecriture={ecriture} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {ecriture && (
        <p className="text-xs text-pierre-500">
          Changer un préfixe ne renumérote pas les embarcations existantes : seules les nouvelles unités
          prendront le nouveau préfixe.
        </p>
      )}
    </div>
  )
}

const champDiscret =
  'w-full rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-pierre-300 focus:border-foret-600 focus:bg-white focus:outline-none disabled:hover:border-transparent'

function LigneModele({ modele, unites, ecriture }: { modele: Modele; unites: number; ecriture: boolean }) {
  const maj = useMajModele()
  const creer = useCreerEmbarcation()
  const [nom, setNom] = useState(modele.nom)
  const [prefixe, setPrefixe] = useState(modele.prefix_id)
  const [base, setBase] = useState(modele)
  // Une modification venue d'ailleurs (ou annulée) remplace le texte affiché.
  if (base !== modele) {
    setBase(modele)
    setNom(modele.nom)
    setPrefixe(modele.prefix_id)
  }

  const sauver = (champ: 'nom' | 'prefix_id', valeur: string) => {
    const propre = champ === 'prefix_id' ? valeur.trim().toUpperCase() : valeur.trim()
    if (!propre) return champ === 'nom' ? setNom(modele.nom) : setPrefixe(modele.prefix_id)
    if (propre !== modele[champ]) maj.mutate({ id: modele.id, champs: { [champ]: propre } })
  }
  const entree = (e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && e.currentTarget.blur()

  return (
    <tr className="hover:bg-pierre-50">
      <td className="px-4 py-1.5">{modele.type}</td>
      <td className="px-3 py-1.5">
        <input
          aria-label="Nom"
          className={champDiscret}
          disabled={!ecriture}
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          onBlur={() => sauver('nom', nom)}
          onKeyDown={entree}
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          aria-label="Préfixe"
          className={`${champDiscret} w-20 uppercase`}
          maxLength={6}
          disabled={!ecriture}
          value={prefixe}
          onChange={(e) => setPrefixe(e.target.value)}
          onBlur={() => sauver('prefix_id', prefixe)}
          onKeyDown={entree}
        />
      </td>
      <td className="px-3 py-1.5">
        <select
          aria-label="Bouchon"
          className={champDiscret}
          disabled={!ecriture}
          value={modele.bouchon ?? ''}
          onChange={(e) => maj.mutate({ id: modele.id, champs: { bouchon: (e.target.value || null) as Bouchon | null } })}
        >
          <option value="">Aucun</option>
          {BOUCHONS.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums">{unites}</td>
      {ecriture && (
        <td className="whitespace-nowrap px-4 py-1.5 text-right">
          <button
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-foret-700 hover:bg-foret-50"
            onClick={() => creer.mutate({ id: crypto.randomUUID(), modele_id: modele.id })}
          >
            + 1 unité
          </button>
        </td>
      )}
    </tr>
  )
}

function FormulaireModele({ modeles }: { modeles: Modele[] }) {
  const creer = useCreerModele()
  const [type, setType] = useState<TypeEmbarcation>('Kayak')
  const [nom, setNom] = useState('')
  const [prefixe, setPrefixe] = useState('')
  const [bouchon, setBouchon] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)

  function soumettre(e: FormEvent) {
    e.preventDefault()
    const prefix_id = prefixe.trim().toUpperCase()
    // Vérifié ici pour un message immédiat, même hors ligne (la base vérifie aussi).
    if (modeles.some((m) => m.prefix_id === prefix_id)) return setErreur(`Le préfixe ${prefix_id} est déjà utilisé.`)
    if (modeles.some((m) => m.type === type && m.nom.toLowerCase() === nom.trim().toLowerCase())) {
      return setErreur(`Le modèle ${nom.trim()} existe déjà pour ce type.`)
    }
    creer.mutate({ id: crypto.randomUUID(), type, nom: nom.trim(), prefix_id, bouchon: (bouchon || null) as Bouchon | null })
    setErreur(null)
    setNom('')
    setPrefixe('')
    setBouchon('')
  }

  return (
    <form onSubmit={soumettre} className={`${ui.carte} p-5`}>
      <h2 className="font-semibold">Ajouter un modèle</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[auto_1fr_auto_auto_auto] lg:items-end">
        <div>
          <label className={ui.etiquette} htmlFor="nm-type">
            Type
          </label>
          <select id="nm-type" className={ui.champ} value={type} onChange={(e) => setType(e.target.value as TypeEmbarcation)}>
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="nm-nom">
            Nom du modèle
          </label>
          <input id="nm-nom" required placeholder="ex. Spirit" className={ui.champ} value={nom} onChange={(e) => setNom(e.target.value)} />
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="nm-prefixe">
            Préfixe
          </label>
          <input
            id="nm-prefixe"
            required
            maxLength={6}
            placeholder="ex. KA"
            className={`${ui.champ} uppercase lg:w-24`}
            value={prefixe}
            onChange={(e) => setPrefixe(e.target.value)}
          />
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="nm-bouchon">
            Bouchon
          </label>
          <select id="nm-bouchon" className={ui.champ} value={bouchon} onChange={(e) => setBouchon(e.target.value)}>
            <option value="">Aucun</option>
            {BOUCHONS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </div>
        <button className={ui.bouton}>Ajouter</button>
      </div>
      {erreur && <p className={`${ui.erreur} mt-3`}>{erreur}</p>}
    </form>
  )
}
