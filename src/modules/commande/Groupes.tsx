// Groupes du menu ouvert : portions, diètes standard (régulière, végétarienne,
// sans porc, sans lactose, sans gluten), participants avec allergies ou
// restrictions, notes. Une liste imprimée par groupe pour le personnel.
import { useEffect, useState } from 'react'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { IconeCorbeille, IconePlus } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { useTitreImpression } from '@/lib/useTitreImpression'
import { ChampNombre } from './ChampNombre'
import { useMenu } from './contexte'
import { nouvelId, useEnregistrerGroupe, useEnregistrerParticipant, useSupprimerGroupe, useSupprimerParticipant, useTableMenu } from './donnees'
import { resumeMenu } from './emplacements'
import { AGES, COULEURS_GROUPES, DIETES, type CleDiete, type GroupeRepas, type Participant } from './types'

const nombre = (v: string) => Math.max(0, Math.trunc(Number(v)) || 0)

/** Participants avec une diète particulière (une diète par participant). */
const dietesParticulieres = (g: GroupeRepas) => DIETES.reduce((s, d) => s + (g[d.cle] ?? 0), 0)

/** Régulière : les portions qui ne sont dans aucune autre diète. */
const regulieres = (g: GroupeRepas) => Math.max(0, g.portions - dietesParticulieres(g))

export function Groupes() {
  const { menu, ecriture } = useMenu()
  const groupes = useTableMenu('groupes_repas', menu.id)
  const participants = useTableMenu('participants', menu.id)
  const enregistrer = useEnregistrerGroupe()
  /** Groupe à imprimer (id), « tous », ou null (Cmd+P : tous les groupes). */
  const [aImprimer, setAImprimer] = useState<string | null>(null)
  const groupeImprime = aImprimer && aImprimer !== 'tous' ? groupes.data?.find((g) => g.id === aImprimer) : undefined
  useTitreImpression(groupeImprime ? `Liste du groupe - ${groupeImprime.name} - ${menu.nom}` : `Listes des groupes - ${menu.nom}`)

  // L'impression attend que la liste choisie soit affichée.
  useEffect(() => {
    if (!aImprimer) return
    const minuterie = setTimeout(() => {
      window.print()
      setAImprimer(null)
    }, 50)
    return () => clearTimeout(minuterie)
  }, [aImprimer])

  if (!groupes.data || !participants.data) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
  const liste = groupes.data
  const parGroupe = (id: string) => participants.data.filter((p) => p.groupe_id === id)
  const imprimes = aImprimer && aImprimer !== 'tous' ? liste.filter((g) => g.id === aImprimer) : liste
  const total = liste.reduce((s, g) => s + g.portions, 0)

  return (
    <>
      <div className="space-y-4 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-pierre-600">
            {liste.length} groupe{liste.length > 1 ? 's' : ''} · {total} portions. Les diètes et les allergies s'impriment sur la liste
            de chaque groupe et se retrouvent sur la feuille de cuisine.
          </p>
          <div className="ml-auto flex gap-2">
            {ecriture && (
              <button
                className={ui.boutonSecondaire}
                onClick={() =>
                  enregistrer.mutate({
                    menu_id: menu.id,
                    id: nouvelId('g'),
                    name: `Groupe ${liste.length + 1}`,
                    age: 'Mixtes',
                    portions: 40,
                    vege: 0,
                    sans_porc: 0,
                    sans_lactose: 0,
                    sans_gluten: 0,
                    notes: '',
                    color: COULEURS_GROUPES[liste.length % COULEURS_GROUPES.length],
                  })
                }
              >
                <IconePlus /> Ajouter un groupe
              </button>
            )}
            <button className={ui.bouton} onClick={() => setAImprimer('tous')}>
              Imprimer les listes
            </button>
          </div>
        </div>
        {liste.map((g) => (
          <CarteGroupe key={g.id} groupe={g} participants={parGroupe(g.id)} seul={liste.length <= 1} imprimer={() => setAImprimer(g.id)} />
        ))}
      </div>

      {/* Sur papier : une page par groupe. */}
      <div className="hidden print:block">
        {imprimes.map((g, i) => (
          <ListeImprimee key={g.id} groupe={g} participants={parGroupe(g.id)} premiere={i === 0} />
        ))}
      </div>
    </>
  )
}

// ------------------------------------------------------------------
// À l'écran
// ------------------------------------------------------------------

function CarteGroupe({
  groupe: g,
  participants,
  seul,
  imprimer,
}: {
  groupe: GroupeRepas
  participants: Participant[]
  seul: boolean
  imprimer: () => void
}) {
  const { menu, ecriture } = useMenu()
  const enregistrer = useEnregistrerGroupe()
  const supprimer = useSupprimerGroupe()
  const enregistrerParticipant = useEnregistrerParticipant()
  const [nouveau, setNouveau] = useState<string | null>(null)
  const depasse = dietesParticulieres(g) > g.portions
  const maj = (champs: Partial<GroupeRepas>) => enregistrer.mutate({ ...g, ...champs })

  const ajouterParticipant = () => {
    const id = crypto.randomUUID()
    setNouveau(id)
    enregistrerParticipant.mutate({ id, menu_id: menu.id, groupe_id: g.id, nom: '', allergies: '', epipen: false, note: '' })
  }

  const petitChamp = 'w-16 rounded border border-pierre-300 px-1.5 py-1 text-right text-sm tabular-nums text-pierre-900'
  return (
    <section className={`${ui.carte} p-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          aria-label="Couleur"
          disabled={!ecriture}
          className="h-7 w-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
          value={g.color ?? COULEURS_GROUPES[0]}
          onChange={(e) => maj({ color: e.target.value })}
        />
        <ChampTexte
          aria-label="Nom du groupe"
          disabled={!ecriture}
          className="min-w-48 flex-1 rounded border border-transparent px-1.5 py-1 text-lg font-semibold hover:border-pierre-300 focus:border-foret-600"
          valeur={g.name}
          obligatoire
          enregistrer={(name) => maj({ name })}
        />
        <select
          aria-label="Âge"
          disabled={!ecriture}
          className="rounded border border-pierre-300 px-1.5 py-1 text-sm"
          value={g.age ?? 'Mixtes'}
          onChange={(e) => maj({ age: e.target.value })}
        >
          {AGES.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-pierre-600">
          <ChampNombre
            aria-label="Nombre de portions"
            disabled={!ecriture}
            className={petitChamp}
            valeur={g.portions}
            enregistrer={(v) => {
              const portions = nombre(v)
              if (portions !== g.portions) maj({ portions, vege: Math.min(g.vege, portions) })
              return portions
            }}
          />
          portions
        </label>
        <button className={`${ui.boutonSecondaire} ml-auto`} onClick={imprimer}>
          Imprimer la liste
        </button>
        {ecriture && (
          <button
            aria-label={`Supprimer ${g.name}`}
            title={seul ? 'Au moins un groupe est requis' : 'Supprimer le groupe'}
            disabled={seul}
            className="rounded-md p-1.5 text-pierre-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-30"
            onClick={async () =>
              (await confirmer({
                titre: `Supprimer le groupe « ${g.name} » ?`,
                message: participants.length ? `Ses ${participants.length} participant(s) avec allergies seront aussi supprimés.` : undefined,
              })) && supprimer.mutate({ menu_id: menu.id, id: g.id })
            }
          >
            <IconeCorbeille />
          </button>
        )}
      </div>

      {/* Diètes : une par participant ; régulière = le reste. */}
      <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2 rounded-lg bg-pierre-50 px-3 py-2.5">
        <div>
          <p className={ui.etiquette}>Régulière</p>
          <p className="py-1 text-sm font-semibold tabular-nums">{regulieres(g)}</p>
        </div>
        {DIETES.map((d) => (
          <label key={d.cle} className="block">
            <span className={ui.etiquette}>{d.libelle}</span>
            <ChampNombre
              disabled={!ecriture}
              className={petitChamp}
              valeur={g[d.cle]}
              enregistrer={(v) => {
                // Végé : compté dans la commande, jamais plus que les portions.
                const n = d.cle === 'vege' ? Math.min(g.portions, nombre(v)) : nombre(v)
                if (n !== g[d.cle]) maj({ [d.cle]: n } as Pick<GroupeRepas, CleDiete>)
                return n
              }}
            />
          </label>
        ))}
        {depasse && (
          <p className="pb-1 text-sm text-amber-800">⚠ Les diètes dépassent les {g.portions} portions (une seule diète par participant).</p>
        )}
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold">Allergies et restrictions</h3>
        {participants.length === 0 ? (
          <p className="mt-1 text-sm text-pierre-500">Aucun participant avec une allergie ou une restriction.</p>
        ) : (
          <table className="mt-1.5 w-full text-sm">
            <thead>
              <tr className="border-b border-pierre-200 text-left text-xs uppercase tracking-wide text-pierre-500">
                <th className="w-1/4 py-1.5 pr-2 font-medium">Participant</th>
                <th className="py-1.5 pr-2 font-medium">Allergie / restriction</th>
                <th className="w-20 py-1.5 pr-2 text-center font-medium">EpiPen</th>
                <th className="w-1/4 py-1.5 pr-2 font-medium">Note</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <LigneParticipant key={p.id} participant={p} focus={p.id === nouveau} />
              ))}
            </tbody>
          </table>
        )}
        {ecriture && (
          <button className="mt-2 text-sm font-medium text-foret-700 hover:underline" onClick={ajouterParticipant}>
            + Ajouter un participant
          </button>
        )}
      </div>

      <label className="mt-4 block">
        <span className="text-sm font-semibold">Notes</span>
        <ZoneNotes
          valeur={g.notes ?? ''}
          disabled={!ecriture}
          enregistrer={(notes) => maj({ notes })}
          placeholder="Ex. arrive pour le dîner, collation spéciale, personne-ressource…"
        />
      </label>
    </section>
  )
}

function LigneParticipant({ participant: p, focus }: { participant: Participant; focus: boolean }) {
  const { ecriture } = useMenu()
  const enregistrer = useEnregistrerParticipant()
  const supprimer = useSupprimerParticipant()
  const maj = (champs: Partial<Participant>) => enregistrer.mutate({ ...p, ...champs })
  const champ = 'w-full rounded border border-transparent px-1.5 py-1 hover:border-pierre-300 focus:border-foret-600'
  return (
    <tr className="border-b border-pierre-100">
      <td className="py-1 pr-2">
        <ChampTexte autoFocus={focus} aria-label="Nom du participant" placeholder="Nom" disabled={!ecriture} className={`${champ} font-medium`} valeur={p.nom} enregistrer={(nom) => maj({ nom })} />
      </td>
      <td className="py-1 pr-2">
        <ChampTexte aria-label="Allergie ou restriction" placeholder="Ex. arachides, noix, crustacés" disabled={!ecriture} className={champ} valeur={p.allergies} enregistrer={(allergies) => maj({ allergies })} />
      </td>
      <td className="py-1 pr-2 text-center">
        <input
          type="checkbox"
          aria-label="Auto-injecteur (EpiPen)"
          disabled={!ecriture}
          className="size-4 accent-red-700"
          checked={p.epipen}
          onChange={(e) => maj({ epipen: e.target.checked })}
        />
      </td>
      <td className="py-1 pr-2">
        <ChampTexte aria-label="Note" placeholder="Ex. traces acceptées" disabled={!ecriture} className={champ} valeur={p.note} enregistrer={(note) => maj({ note })} />
      </td>
      <td className="py-1 text-right">
        {ecriture && (
          <button
            aria-label={`Retirer ${p.nom || 'ce participant'}`}
            className="rounded-md p-1 text-pierre-400 hover:bg-red-50 hover:text-red-700"
            onClick={() => supprimer.mutate({ menu_id: p.menu_id, id: p.id })}
          >
            <IconeCorbeille />
          </button>
        )}
      </td>
    </tr>
  )
}

/** Zone de texte enregistrée en la quittant. */
function ZoneNotes({ valeur, enregistrer, disabled, placeholder }: { valeur: string; enregistrer: (v: string) => void; disabled: boolean; placeholder: string }) {
  const [texte, setTexte] = useState(valeur)
  const [base, setBase] = useState(valeur)
  if (valeur !== base) {
    setBase(valeur)
    setTexte(valeur)
  }
  return (
    <textarea
      rows={2}
      disabled={disabled}
      placeholder={placeholder}
      className={`${ui.champ} mt-1`}
      value={texte}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={() => texte.trim() !== valeur && enregistrer(texte.trim())}
    />
  )
}

// ------------------------------------------------------------------
// Sur papier : la liste d'un groupe, pour le personnel
// ------------------------------------------------------------------

function ListeImprimee({ groupe: g, participants, premiere }: { groupe: GroupeRepas; participants: Participant[]; premiere: boolean }) {
  const { menu } = useMenu()
  const cellule = 'border border-pierre-400 px-2 py-1.5'
  const dietes = [{ libelle: 'Régulière', n: regulieres(g) }, ...DIETES.map((d) => ({ libelle: d.libelle, n: g[d.cle] }))]
  return (
    <section className={`text-[11pt] text-black ${premiere ? '' : 'break-before-page'}`}>
      <header className="flex items-baseline justify-between gap-4 border-b-2 border-black pb-1.5">
        <h1 className="flex items-center gap-2 text-[22pt] font-bold leading-tight">
          <span className="inline-block size-4 rounded-full [print-color-adjust:exact]" style={{ background: g.color ?? COULEURS_GROUPES[0] }} />
          {g.name}
        </h1>
        <p className="text-right text-[10pt]">
          {menu.nom}
          <br />
          {resumeMenu(menu)}
        </p>
      </header>
      <p className="mt-2 text-[13pt]">
        <b>{g.portions}</b> portions{g.age ? ` · ${g.age}` : ''}
      </p>

      <h2 className="mt-4 text-[13pt] font-bold">Diètes</h2>
      <table className="mt-1 w-full table-fixed border-collapse text-center">
        <thead>
          <tr>
            {dietes.map((d) => (
              <th key={d.libelle} className={`${cellule} font-medium`}>
                {d.libelle}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {dietes.map((d) => (
              <td key={d.libelle} className={`${cellule} text-[18pt] font-bold tabular-nums ${d.n ? '' : 'text-pierre-400'}`}>
                {d.n}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <h2 className="mt-5 text-[13pt] font-bold">Allergies et restrictions</h2>
      {participants.length === 0 ? (
        <p className="mt-1">Aucune allergie ni restriction signalée.</p>
      ) : (
        <table className="mt-1 w-full border-collapse text-left">
          <thead>
            <tr>
              <th className={`${cellule} w-1/4`}>Participant</th>
              <th className={cellule}>Allergie / restriction</th>
              <th className={`${cellule} w-20 text-center`}>EpiPen</th>
              <th className={`${cellule} w-1/4`}>Note</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => (
              <tr key={p.id} className="break-inside-avoid">
                <td className={`${cellule} font-semibold`}>{p.nom}</td>
                <td className={cellule}>{p.allergies}</td>
                <td className={`${cellule} text-center font-bold`}>{p.epipen ? 'OUI' : ''}</td>
                <td className={cellule}>{p.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {g.notes && (
        <>
          <h2 className="mt-5 text-[13pt] font-bold">Notes</h2>
          <p className="mt-1 whitespace-pre-line">{g.notes}</p>
        </>
      )}
    </section>
  )
}
