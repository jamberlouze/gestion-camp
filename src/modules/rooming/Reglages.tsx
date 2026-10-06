import { useState, type ReactNode } from 'react'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { IconeChevron, IconeCorbeille, IconePlus } from '@/lib/icones'
import { SaisieNom } from '@/lib/SaisieNom'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { enregistrerStructure, ordonner, supprimerStructure, useRelire, type Donnees, type TableStructure } from './donnees'
import { pluriel } from './outils'
import type { Batiment, Chambre, Section, Zone } from './types'

type Faire = (f: () => Promise<unknown>) => Promise<string | null>

const parOrdre = <T extends { ordre: number }>(a: T, b: T) => a.ordre - b.ordre

/**
 * Structure du camp : zones > bâtiments > sections > chambres, avec la
 * capacité normale de chaque chambre. Un niveau qui contient encore
 * quelque chose ne peut pas être retiré.
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

  if (!ecriture) return <p className="py-8 text-center text-sm text-pierre-500">La structure se règle par les personnes qui peuvent modifier ce module.</p>

  const zones = [...d.structure.zones].sort(parOrdre)
  const s = d.structure
  const totalLits = s.chambres.reduce((t, c) => t + c.lits, 0)

  return (
    <div className="max-w-4xl space-y-4">
      <p className="rounded-lg bg-pierre-100 px-3 py-2 text-sm text-pierre-700">
        La capacité ici est la capacité <strong>normale</strong> ({pluriel(totalLits, 'lit', 'lits')} en tout). Un plan peut la changer pour lui seul
        (lit d'appoint, chambre fermée) depuis la fenêtre de la chambre.
      </p>
      {erreur && (
        <p className={`${ui.erreur} sticky top-2 z-10`}>
          {erreur}{' '}
          <button className="ml-2 underline" onClick={() => setErreur(null)}>
            Fermer
          </button>
        </p>
      )}
      {zones.map((z, i) => (
        <BlocZone key={`${z.id}-${version}`} z={z} zones={zones} i={i} d={d} faire={faire} />
      ))}
      <Ajout libelle="Ajouter une zone" placeholder="Nom de la zone" valider={(nom) => faire(() => enregistrerStructure<Zone>('zones', { nom, ordre: zones.length + 1 }))} />
    </div>
  )
}

function BlocZone({ z, zones, i, d, faire }: { z: Zone; zones: Zone[]; i: number; d: Donnees; faire: Faire }) {
  const batiments = d.structure.batiments.filter((b) => b.zone_id === z.id).sort(parOrdre)
  return (
    <section className={`${ui.carte} p-3`}>
      <Entete
        table="zones"
        ligne={z}
        freres={zones}
        i={i}
        faire={faire}
        taille="text-base font-semibold"
        vide={batiments.length === 0}
        raisonPlein="Déplacez ou retirez d'abord ses bâtiments."
        etiquette="Zone"
      />
      <div className="mt-2 space-y-3 pl-3">
        {batiments.map((b, j) => (
          <BlocBatiment key={b.id} b={b} batiments={batiments} i={j} d={d} faire={faire} zones={zones} />
        ))}
        <Ajout
          libelle="Ajouter un bâtiment"
          placeholder="Nom du bâtiment"
          valider={(nom) => faire(() => enregistrerStructure<Batiment>('batiments', { nom, zone_id: z.id, ordre: maxOrdre(d.structure.batiments) + 1 }))}
        />
      </div>
    </section>
  )
}

function BlocBatiment({ b, batiments, i, d, faire, zones }: { b: Batiment; batiments: Batiment[]; i: number; d: Donnees; faire: Faire; zones: Zone[] }) {
  const sections = d.structure.sections.filter((s) => s.batiment_id === b.id).sort(parOrdre)
  return (
    <div className="rounded-lg border border-pierre-200 p-2.5">
      <Entete
        table="batiments"
        ligne={b}
        freres={batiments}
        i={i}
        faire={faire}
        taille="font-semibold"
        vide={sections.length === 0}
        raisonPlein="Retirez d'abord ses sections."
        etiquette="Bâtiment"
      >
        <select
          aria-label={`Zone de ${b.nom}`}
          className="rounded-md border border-pierre-200 bg-white py-1 pl-2 text-sm text-pierre-600"
          value={b.zone_id}
          onChange={(e) => faire(() => enregistrerStructure<Batiment>('batiments', { id: b.id, zone_id: e.target.value }))}
        >
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.nom}
            </option>
          ))}
        </select>
      </Entete>
      <div className="mt-2 space-y-2 pl-3">
        {sections.map((s, j) => (
          <BlocSection key={s.id} s={s} sections={sections} i={j} d={d} faire={faire} />
        ))}
        <Ajout
          libelle="Ajouter une section"
          placeholder="Nom de la section (ex. Pins haut)"
          valider={(nom) => faire(() => enregistrerStructure<Section>('sections', { nom, batiment_id: b.id, ordre: sections.length + 1 }))}
        />
      </div>
    </div>
  )
}

function BlocSection({ s, sections, i, d, faire }: { s: Section; sections: Section[]; i: number; d: Donnees; faire: Faire }) {
  const chambres = d.structure.chambres.filter((c) => c.section_id === s.id).sort(parOrdre)
  const lits = chambres.reduce((t, c) => t + c.lits, 0)
  const deplacer = (j: number, sens: -1 | 1) => {
    const ids = chambres.map((c) => c.id)
    ;[ids[j], ids[j + sens]] = [ids[j + sens], ids[j]]
    faire(() => ordonner('chambres', ids))
  }

  async function retirer(c: Chambre) {
    const plans = new Set(d.occupations.filter((o) => o.chambre_id === c.id && (o.type !== 'vide' || o.lits !== null)).map((o) => o.plan_id))
    const ok = await confirmer({
      titre: `Retirer la chambre ${c.numero} ?`,
      message: plans.size ? `Elle est utilisée dans ${pluriel(plans.size, 'plan', 'plans')} : elle en sera retirée, avec ses chiffres et ses noms.` : undefined,
      libelleOk: 'Retirer',
    })
    if (ok) faire(() => supprimerStructure('chambres', c.id))
  }

  return (
    <div>
      <Entete
        table="sections"
        ligne={s}
        freres={sections}
        i={i}
        faire={faire}
        taille="text-sm font-medium"
        vide={chambres.length === 0}
        raisonPlein="Retirez d'abord ses chambres."
        etiquette="Section"
      >
        <span className="text-xs text-pierre-500">{pluriel(lits, 'lit', 'lits')}</span>
      </Entete>
      <ul className="mt-1 grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-1.5 pl-3">
        {chambres.map((c, j) => (
          <li key={c.id} className="flex items-center gap-1 rounded-md border border-pierre-200 bg-pierre-50 px-1.5 py-1">
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
              <BoutonIcone libelle={`Retirer la chambre ${c.numero}`} danger onClick={() => retirer(c)}>
                <IconeCorbeille className="size-3.5" />
              </BoutonIcone>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-1 pl-3">
        <Ajout
          libelle="Ajouter une chambre"
          placeholder="Numéro ou nom (ex. 13, Appart)"
          petit
          valider={(numero) => faire(() => enregistrerStructure<Chambre>('chambres', { numero, lits: 4, section_id: s.id, ordre: maxOrdre(chambres) + 1 }))}
        />
      </div>
    </div>
  )
}

const maxOrdre = (l: { ordre: number }[]) => l.reduce((m, x) => Math.max(m, x.ordre), 0)

/** Nom modifiable + monter/descendre + retirer (seulement vide). */
function Entete<T extends { id: string; nom: string; ordre: number }>({
  table,
  ligne,
  freres,
  i,
  faire,
  taille,
  vide,
  raisonPlein,
  etiquette,
  children,
}: {
  table: TableStructure
  ligne: T
  freres: T[]
  i: number
  faire: Faire
  taille: string
  vide: boolean
  raisonPlein: string
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
      <BoutonIcone
        libelle={vide ? `Retirer ${ligne.nom}` : raisonPlein}
        desactive={!vide}
        danger
        onClick={async () => {
          if (await confirmer({ titre: `Retirer « ${ligne.nom} » ?`, libelleOk: 'Retirer' })) faire(() => supprimerStructure(table, ligne.id))
        }}
      >
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
      <div className="max-w-sm">
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
