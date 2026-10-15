import { useState } from 'react'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { IconeCorbeille } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { BoutonCopier, MenuCompagnie, Section } from './commun'
import { useRh } from './contexte'
import { lienEmplois } from './liens'
import {
  useAjouterDate,
  useAjouterPoste,
  useAjouterSaison,
  useModifierDate,
  useNouveauTexte,
  useModifierPoste,
  useModifierSaison,
  useRetirerDate,
  useRetirerPoste,
  useRetirerSaison,
} from './donnees'
import { horodatage, plageDates } from './outils'
import { ReglagesContrats } from './ReglagesContrats'
import { TexteFormate } from './TexteFormate'
import { GENRES_DATE, GENRES_SAISON, GENRES_TEXTE, type DateSaison, type GenreDate, type GenreSaison, type GenreTexte, type Poste, type Saison } from './types'
import { champPetit } from './styles'

/** Saisons (et leurs dates), postes, textes et liens des pages publiques ; contrats (taux, modèles, tâches). */
export function Reglages() {
  const { saisons } = useRh()
  const [choix, setChoisie] = useState<string | null>(saisons.find((s) => s.ouverte && s.genre === 'ete')?.id ?? saisons.at(-1)?.id ?? null)
  // Une saison supprimée n'est plus choisie.
  const choisie = choix && saisons.some((s) => s.id === choix) ? choix : null
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-5">
        <Saisons choisie={choisie} choisir={setChoisie} />
        {choisie && <DatesSaison saisonId={choisie} />}
      </div>
      <div className="space-y-5">
        <Postes />
        <PagesPubliques />
      </div>
      <Textes />
      <ReglagesContrats />
    </div>
  )
}

// ------------------------------------------------------------
// Pages publiques (sans compte)
// ------------------------------------------------------------
function PagesPubliques() {
  const { saisons } = useRh()
  const url = lienEmplois()
  const ouvertes = saisons.filter((s) => s.ouverte)
  return (
    <Section titre="Pages publiques">
      <div className="space-y-2 text-sm">
        <p className="text-pierre-600">
          Formulaire de candidature (français et anglais) : saisons cochées « Ouverte » ({ouvertes.map((s) => s.nom).join(', ') || 'aucune'}), postes actifs offerts dans leur genre ; trois
          postes au plus.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <a href={url} target="_blank" rel="noreferrer" className="font-mono text-xs text-foret-700 underline">
            {url}
          </a>
          <BoutonCopier url={url} />
        </div>
        <p className="text-xs text-pierre-500">
          L'intention de retour (onglet Employés) et le dossier d'embauche (fiche d'une personne, carte de l'embauche) passent par des liens personnels.
        </p>
      </div>
    </Section>
  )
}

// ------------------------------------------------------------
// Textes des pages publiques : une version par modification ; une
// embauche garde la version acceptée.
// ------------------------------------------------------------
function Textes() {
  return (
    <Section titre="Textes des pages publiques" className="xl:col-span-2">
      <p className="mb-3 text-sm text-pierre-600">
        Chaque modification crée une nouvelle version ; le dossier d'embauche garde la version acceptée et sa date. Syntaxe : « - » en début de ligne pour une puce,
        deux espaces puis « - » pour une sous-puce, une ligne vide entre deux paragraphes, **gras**.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {GENRES_TEXTE.map((g) => (
          <TexteModifiable key={g.id} genre={g.id} />
        ))}
      </div>
    </Section>
  )
}

function TexteModifiable({ genre }: { genre: GenreTexte }) {
  const { textes, ecriture } = useRh()
  const nouveau = useNouveauTexte()
  const g = GENRES_TEXTE.find((x) => x.id === genre)!
  const versions = textes.filter((t) => t.genre === genre).sort((a, b) => b.version - a.version)
  const courant = versions[0]
  const [edition, setEdition] = useState<string | null>(null)
  const exemple = { prenom: 'Léa', saison: 'Été 2027', lien_emplois: lienEmplois() }

  return (
    <div className="space-y-2 rounded-lg border border-pierre-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{g.nom}</h3>
        {courant && <span className="text-xs text-pierre-500">version {courant.version}</span>}
        {courant?.a_valider && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800" title="Brouillon que la direction n'a pas encore relu">
            À valider
          </span>
        )}
        <span className="flex-1" />
        {ecriture && edition === null && (
          <button className="text-xs text-foret-700 underline" onClick={() => setEdition(courant?.texte ?? '')}>
            {courant?.a_valider ? 'Relire et valider' : 'Modifier'}
          </button>
        )}
      </div>
      <p className="text-xs text-pierre-500">{g.aide}</p>
      {edition !== null ? (
        <div className="space-y-2">
          <textarea className={`${ui.champ} font-mono text-xs`} rows={14} value={edition} onChange={(e) => setEdition(e.target.value)} />
          <p className="text-xs font-medium text-pierre-500">Aperçu</p>
          <div className="max-h-64 overflow-y-auto rounded-md bg-pierre-50 p-2">
            <TexteFormate texte={edition} valeurs={exemple} />
          </div>
          {nouveau.error && <p className={ui.erreur}>{messageErreur(nouveau.error)}</p>}
          <div className="flex justify-end gap-2">
            <button className={ui.boutonSecondaire} onClick={() => setEdition(null)}>
              Annuler
            </button>
            <button
              className={ui.bouton}
              disabled={nouveau.isPending || (edition.trim() === (courant?.texte ?? '').trim() && !courant?.a_valider)}
              onClick={() => nouveau.mutate({ genre, texte: edition }, { onSuccess: () => setEdition(null) })}
            >
              {courant?.a_valider && edition.trim() === courant.texte.trim() ? 'Valider ce texte' : 'Enregistrer (nouvelle version)'}
            </button>
          </div>
        </div>
      ) : courant?.texte.trim() ? (
        <div className="max-h-64 overflow-y-auto rounded-md bg-pierre-50 p-2">
          <TexteFormate texte={courant.texte} valeurs={exemple} />
        </div>
      ) : (
        <p className="text-sm text-pierre-400">Aucun texte.</p>
      )}
      {versions.length > 0 && (
        <details className="text-xs text-pierre-500">
          <summary className="cursor-pointer">Versions ({versions.length})</summary>
          <ul className="mt-1 space-y-0.5">
            {versions.map((t) => (
              <li key={t.id}>
                Version {t.version} · {horodatage(t.created_at)}
                {t.cree_par_nom ? ` · ${t.cree_par_nom}` : ' · texte de départ'}
                {t.a_valider ? ' · à valider' : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Saisons
// ------------------------------------------------------------
function Saisons({ choisie, choisir }: { choisie: string | null; choisir: (id: string) => void }) {
  const { saisons, candidatures, embauches, ecriture, auj } = useRh()
  const ajouter = useAjouterSaison()
  const modifier = useModifierSaison()
  const retirer = useRetirerSaison()
  const [genre, setGenre] = useState<GenreSaison>('ete')
  const [annee, setAnnee] = useState(Number(auj.slice(0, 4)) + 1)
  const utilisee = (s: Saison) => embauches.some((e) => e.saison_id === s.id) || candidatures.some((c) => c.saison_ids.includes(s.id) || c.saison_id === s.id)
  const existe = saisons.some((s) => s.genre === genre && s.annee === annee)

  return (
    <Section titre="Saisons">
      <p className="mb-3 text-sm text-pierre-600">« Ouverte » : offerte dans le formulaire de candidature. Cliquer une saison pour voir ses dates.</p>
      <ul className="divide-y divide-pierre-100 text-sm">
        {[...saisons].reverse().map((s) => (
          <li key={s.id} className={`flex flex-wrap items-center gap-2 px-2 py-1.5 ${s.id === choisie ? 'rounded-md bg-foret-50' : ''}`}>
            <button className="min-w-28 text-left font-medium hover:underline" onClick={() => choisir(s.id)}>
              {s.nom}
            </button>
            <label className="flex items-center gap-1 text-xs text-pierre-600">
              <input type="checkbox" disabled={!ecriture} checked={s.ouverte} onChange={(e) => modifier.mutate({ id: s.id, champs: { ouverte: e.target.checked } })} />
              Ouverte
            </label>
            <span className="flex items-center gap-1 text-xs text-pierre-500">
              du
              <ChampDateCourt valeur={s.debut} disabled={!ecriture} enregistrer={(debut) => modifier.mutate({ id: s.id, champs: { debut } })} />
              au
              <ChampDateCourt valeur={s.fin} disabled={!ecriture} enregistrer={(fin) => modifier.mutate({ id: s.id, champs: { fin } })} />
            </span>
            <span className="flex-1" />
            {ecriture && !utilisee(s) && (
              <button
                className="text-pierre-400 hover:text-red-700"
                title="Supprimer"
                onClick={async () => (await confirmer({ titre: `Supprimer ${s.nom} ?`, message: 'Ses dates seront effacées.', libelleOk: 'Supprimer', danger: true })) && retirer.mutate(s.id)}
              >
                <IconeCorbeille className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {ecriture && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (existe) return
            const id = crypto.randomUUID()
            ajouter.mutate({ id, genre, annee, ouverte: false }, { onSuccess: () => choisir(id) })
          }}
        >
          <select className={champPetit} value={genre} onChange={(e) => setGenre(e.target.value as GenreSaison)}>
            {GENRES_SAISON.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nom}
              </option>
            ))}
          </select>
          <input className={`${champPetit} w-24`} type="number" min={2020} max={2100} value={annee} onChange={(e) => setAnnee(Number(e.target.value))} />
          <button className={ui.boutonSecondaire} disabled={existe || ajouter.isPending}>
            + Saison
          </button>
          {existe && <span className="text-xs text-pierre-500">Elle existe déjà.</span>}
        </form>
      )}
      {(modifier.error || ajouter.error || retirer.error) && <p className={`${ui.erreur} mt-2`}>{messageErreur(modifier.error ?? ajouter.error ?? retirer.error)}</p>}
    </Section>
  )
}

function ChampDateCourt({ valeur, enregistrer, disabled }: { valeur: string | null; enregistrer: (v: string | null) => void; disabled?: boolean }) {
  return (
    <input
      type="date"
      disabled={disabled}
      className="rounded border border-pierre-200 px-1 py-0.5 text-xs"
      defaultValue={valeur ?? ''}
      key={valeur ?? ''}
      onBlur={(e) => e.target.value !== (valeur ?? '') && enregistrer(e.target.value || null)}
    />
  )
}

// ------------------------------------------------------------
// Dates d'une saison (formations, séjours, semaines)
// ------------------------------------------------------------
function DatesSaison({ saisonId }: { saisonId: string }) {
  const { saisonParId, saisons, dates, ecriture } = useRh()
  const ajouter = useAjouterDate()
  const modifier = useModifierDate()
  const retirer = useRetirerDate()
  const s = saisonParId.get(saisonId)!
  const siennes = dates.filter((d) => d.saison_id === saisonId).sort((a, b) => (a.debut ?? '').localeCompare(b.debut ?? '') || a.ordre - b.ordre)
  // Saison du même genre l'an passé, pour recopier ses dates (+ 1 an, même jour de semaine).
  const modele = saisons.find((x) => x.genre === s.genre && x.annee === s.annee - 1)
  const datesModele = modele ? dates.filter((d) => d.saison_id === modele.id) : []

  const copier = async () => {
    const decaler = (iso: string | null) => (iso ? decalerUnAn(iso) : null)
    for (const d of datesModele) {
      await ajouter.mutateAsync({
        id: crypto.randomUUID(),
        saison_id: saisonId,
        genre: d.genre,
        nom: d.nom,
        debut: decaler(d.debut),
        fin: decaler(d.fin),
        obligatoire: d.obligatoire,
        note: d.note,
        ordre: d.ordre,
      })
    }
  }

  return (
    <Section titre={`Dates — ${s.nom}`}>
      <p className="mb-3 text-sm text-pierre-600">Formations, séjours et semaines : ce sont les disponibilités du dossier d'embauche.</p>
      {siennes.length === 0 ? (
        <div className="space-y-2 text-sm text-pierre-500">
          <p>Aucune date.</p>
          {ecriture && datesModele.length > 0 && (
            <button className={ui.boutonSecondaire} disabled={ajouter.isPending} onClick={copier}>
              Reprendre les {datesModele.length} dates de {modele!.nom} (+ 1 an, même jour de la semaine)
            </button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-pierre-100 text-sm">
          {siennes.map((d) => (
            <LigneDate key={d.id} d={d} modifier={(champs) => modifier.mutate({ id: d.id, champs })} retirer={() => retirer.mutate(d.id)} />
          ))}
        </ul>
      )}
      {ecriture && (
        <button
          className={`${ui.boutonSecondaire} mt-3`}
          onClick={() => ajouter.mutate({ id: crypto.randomUUID(), saison_id: saisonId, genre: 'semaine', nom: 'Nouvelle date', ordre: siennes.length + 1, obligatoire: false })}
        >
          + Date
        </button>
      )}
      {(ajouter.error || modifier.error) && <p className={`${ui.erreur} mt-2`}>{messageErreur(ajouter.error ?? modifier.error)}</p>}
    </Section>
  )
}

/** Même date l'an prochain, au même jour de la semaine (52 semaines plus tard). */
function decalerUnAn(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 364)
  return d.toISOString().slice(0, 10)
}

function LigneDate({ d, modifier, retirer }: { d: DateSaison; modifier: (c: Partial<DateSaison>) => void; retirer: () => void }) {
  const { ecriture } = useRh()
  if (!ecriture)
    return (
      <li className="py-1.5">
        {d.nom} · {plageDates(d.debut, d.fin)}
        {d.obligatoire && <span className="ml-1 text-xs text-amber-700">obligatoire</span>}
      </li>
    )
  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5">
      <select className="rounded border border-pierre-200 px-1 py-0.5 text-xs" value={d.genre} onChange={(e) => modifier({ genre: e.target.value as GenreDate })}>
        {GENRES_DATE.map((g) => (
          <option key={g.id} value={g.id}>
            {g.nom}
          </option>
        ))}
      </select>
      <ChampTexte className="w-36 rounded border border-pierre-200 px-1.5 py-0.5" valeur={d.nom} obligatoire enregistrer={(nom) => modifier({ nom })} />
      <ChampDateCourt valeur={d.debut} enregistrer={(debut) => modifier({ debut })} />
      <ChampDateCourt valeur={d.fin} enregistrer={(fin) => modifier({ fin })} />
      <label className="flex items-center gap-1 text-xs text-pierre-600">
        <input type="checkbox" checked={d.obligatoire} onChange={(e) => modifier({ obligatoire: e.target.checked })} />
        Obligatoire
      </label>
      <ChampTexte className="w-28 rounded border border-pierre-200 px-1.5 py-0.5 text-xs" placeholder="Précision" valeur={d.note ?? ''} enregistrer={(note) => modifier({ note: note || null })} />
      <span className="flex-1" />
      <button className="text-pierre-400 hover:text-red-700" title="Supprimer" onClick={retirer}>
        <IconeCorbeille className="size-4" />
      </button>
    </li>
  )
}

// ------------------------------------------------------------
// Postes
// ------------------------------------------------------------
function Postes() {
  const { postes, compagnies, compagnieParId, candidatures, embauches, ecriture } = useRh()
  const ajouter = useAjouterPoste()
  const [nom, setNom] = useState('')
  const [compagnie, setCompagnie] = useState<string | null>(compagnies[0]?.id ?? null)
  const [voirInactifs, setVoirInactifs] = useState(false)
  const ordre = new Map(compagnies.map((c) => [c.id, c.ordre]))
  const liste = postes
    .filter((p) => voirInactifs || p.actif)
    .sort((a, b) => (ordre.get(a.entreprise_id) ?? 99) - (ordre.get(b.entreprise_id) ?? 99) || a.ordre - b.ordre)
  const groupes = new Map<string, Poste[]>()
  for (const p of liste) groupes.set(p.entreprise_id, [...(groupes.get(p.entreprise_id) ?? []), p])
  const utilise = (p: Poste) => embauches.some((e) => e.poste_id === p.id) || candidatures.some((c) => c.poste_ids.includes(p.id) || c.poste_id === p.id)

  return (
    <Section
      titre="Postes"
      action={
        <label className="flex items-center gap-1 text-xs text-pierre-600">
          <input type="checkbox" checked={voirInactifs} onChange={(e) => setVoirInactifs(e.target.checked)} />
          Voir les postes retirés
        </label>
      }
    >
      <p className="mb-3 text-sm text-pierre-600">Les saisons cochées sont celles où le poste est offert dans le formulaire de candidature.</p>
      <div className="space-y-4">
        {[...groupes].map(([cid, ps]) => (
          <div key={cid}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-pierre-500">{compagnieParId.get(cid)?.nom}</p>
            <ul className="divide-y divide-pierre-100 text-sm">
              {ps.map((p) => (
                <LignePoste key={p.id} p={p} utilise={utilise(p)} />
              ))}
            </ul>
          </div>
        ))}
      </div>
      {ecriture && (
        <form
          className="mt-4 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!nom.trim() || !compagnie) return
            ajouter.mutate({ id: crypto.randomUUID(), nom: nom.trim(), entreprise_id: compagnie, genres: ['ete'], actif: true, ordre: postes.length + 1 }, { onSuccess: () => setNom('') })
          }}
        >
          <input className={`${champPetit} w-56`} placeholder="Nouveau poste" value={nom} onChange={(e) => setNom(e.target.value)} />
          <MenuCompagnie className={champPetit} valeur={compagnie} changer={setCompagnie} />
          <button className={ui.boutonSecondaire} disabled={!nom.trim() || !compagnie}>
            + Poste
          </button>
        </form>
      )}
      {ajouter.error && <p className={`${ui.erreur} mt-2`}>{messageErreur(ajouter.error)}</p>}
    </Section>
  )
}

function LignePoste({ p, utilise }: { p: Poste; utilise: boolean }) {
  const { ecriture } = useRh()
  const modifier = useModifierPoste()
  const retirer = useRetirerPoste()
  const changer = (champs: Partial<Poste>) => modifier.mutate({ id: p.id, champs })
  return (
    <li className={`flex flex-wrap items-center gap-2 py-1.5 ${p.actif ? '' : 'opacity-60'}`}>
      <ChampTexte className="min-w-0 flex-1 rounded border border-transparent px-1.5 py-0.5 hover:border-pierre-200 focus:border-foret-600 focus:outline-none" valeur={p.nom} obligatoire disabled={!ecriture} enregistrer={(nom) => changer({ nom })} />
      <span className="flex gap-1">
        {GENRES_SAISON.map((g) => {
          const coche = p.genres.includes(g.id)
          return (
            <button
              key={g.id}
              disabled={!ecriture}
              title={g.nom}
              onClick={() => changer({ genres: coche ? p.genres.filter((x) => x !== g.id) : [...p.genres, g.id] })}
              className={`rounded px-1.5 py-0.5 text-xs font-medium ${coche ? 'bg-foret-100 text-foret-800' : 'bg-pierre-50 text-pierre-400'}`}
            >
              {g.nom.slice(0, 3)}
            </button>
          )
        })}
      </span>
      {ecriture &&
        (p.actif ? (
          <button
            className="text-xs text-pierre-500 hover:text-red-700"
            onClick={async () => {
              if (!utilise) {
                if (await confirmer({ titre: `Supprimer « ${p.nom} » ?`, libelleOk: 'Supprimer', danger: true })) retirer.mutate(p.id)
              } else changer({ actif: false })
            }}
          >
            {utilise ? 'Retirer' : 'Supprimer'}
          </button>
        ) : (
          <button className="text-xs text-foret-700 hover:underline" onClick={() => changer({ actif: true })}>
            Remettre
          </button>
        ))}
    </li>
  )
}
