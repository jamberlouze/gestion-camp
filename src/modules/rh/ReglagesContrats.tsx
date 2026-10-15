import { useState } from 'react'
import { ChampTexte } from '@/lib/ChampTexte'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { MenuSaison, Section } from './commun'
import { useRh } from './contexte'
import { useEnregistrerModeleContrat, useEnregistrerTaux, useModelesContrats, useModifierPoste, useRetirerTaux, useTaux } from './donnees'
import { postesParCompagnie } from './outils'
import { champPetit } from './styles'
import { type GenreSaisonContrat, type ModeleContrat, type TermesContrat } from './termesContrat'
import type { Poste, Taux } from './types'

// Réglages des contrats (plan-rh.md §6) : grille des taux (saison × poste ×
// échelon, choix de Maxime), modèles de contrats et de consentement
// parental (repris des PDF d'Airtable, à relire), tâches des postes.

export function ReglagesContrats() {
  return (
    <>
      <GrilleTaux />
      <ModelesContrats />
      <TachesPostes />
    </>
  )
}

const ECHELONS = [1, 2, 3, 4, 5]
const montant = (v: string) => {
  const n = Number(v.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, ''))
  return v.trim() === '' || Number.isNaN(n) ? null : Math.round(n * 100) / 100
}
const lisible = (n: number) => n.toFixed(2).replace('.', ',')

/** Postes (déjà triés) groupés par compagnie, dans l'ordre. */
function parCompagnie(postes: Poste[]) {
  const m = new Map<string, Poste[]>()
  for (const p of postes) m.set(p.entreprise_id, [...(m.get(p.entreprise_id) ?? []), p])
  return [...m]
}

// ------------------------------------------------------------
// Grille des taux
// ------------------------------------------------------------
function GrilleTaux() {
  const { saisons, postes, compagnies, compagnieParId, ecriture } = useRh()
  const taux = useTaux()
  const enregistrer = useEnregistrerTaux()
  const retirer = useRetirerTaux()
  const [saisonId, setSaisonId] = useState<string | null>(() => saisons.find((s) => s.ouverte && s.genre === 'ete')?.id ?? saisons.at(-1)?.id ?? null)
  const [copieDe, setCopieDe] = useState<string | null>(null)
  const saison = saisonId ? saisons.find((s) => s.id === saisonId) : undefined
  const lignes = (taux.data ?? []).filter((t) => t.saison_id === saisonId)
  const offerts = saison ? parCompagnie(postesParCompagnie(postes, compagnies, [], saison.genre)) : []
  const de = (poste: string, echelon: number) => lignes.find((t) => t.poste_id === poste && t.echelon === echelon)
  const remunerationDe = (poste: string) => lignes.find((t) => t.poste_id === poste)?.remuneration ?? 'heure'

  const changerMontant = (p: Poste, echelon: number, v: string) => {
    if (!saisonId) return
    const t = de(p.id, echelon)
    const n = montant(v)
    if (n === null) return t && retirer.mutate(t.id)
    enregistrer.mutate({ saison_id: saisonId, poste_id: p.id, echelon, remuneration: remunerationDe(p.id), montant: n })
  }
  const changerRemuneration = (p: Poste, remuneration: Taux['remuneration']) => {
    for (const t of lignes.filter((x) => x.poste_id === p.id)) enregistrer.mutate({ ...t, remuneration })
  }
  const copier = () => {
    if (!saisonId || !copieDe) return
    for (const t of (taux.data ?? []).filter((x) => x.saison_id === copieDe && !de(x.poste_id, x.echelon)))
      enregistrer.mutate({ saison_id: saisonId, poste_id: t.poste_id, echelon: t.echelon, remuneration: t.remuneration, montant: t.montant })
  }

  return (
    <Section titre="Grille des taux" className="xl:col-span-2">
      <div className="space-y-3 text-sm">
        <p className="text-pierre-600">
          Taux par poste et échelon, pour chaque saison. Une embauche acceptée avec un poste et un échelon reçoit le taux de la grille (modifiable sur l’embauche) ; le contrat reprend
          celui de l’embauche.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-pierre-700">Saison :</span>
          <MenuSaison className={champPetit} valeur={saisonId} changer={setSaisonId} />
          {ecriture && (
            <>
              <span className="ml-4 text-pierre-500">Reprendre les taux de</span>
              <MenuSaison className={champPetit} valeur={copieDe} changer={setCopieDe} vide="—" />
              <button className={ui.boutonSecondaire} disabled={!copieDe || copieDe === saisonId || enregistrer.isPending} onClick={copier}>
                Copier (cases vides seulement)
              </button>
            </>
          )}
        </div>
        {(taux.error || enregistrer.error) && <p className={ui.erreur}>{messageErreur(taux.error ?? enregistrer.error)}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-pierre-500">
                <th className="py-1 pr-2 font-medium">Poste</th>
                <th className="px-1 font-medium">Payé</th>
                {ECHELONS.map((n) => (
                  <th key={n} className="px-1 font-medium">
                    Échelon {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {offerts.map(([cid, ps]) => [
                <tr key={cid}>
                  <td colSpan={7} className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-pierre-500">
                    {compagnieParId.get(cid)?.nom}
                  </td>
                </tr>,
                ...ps.map((p) => (
                  <tr key={p.id} className="border-t border-pierre-100">
                    <td className="py-1 pr-2">{p.nom}</td>
                    <td className="px-1">
                      <select
                        className={`${champPetit} fleche-serree py-1`}
                        disabled={!ecriture || !lignes.some((t) => t.poste_id === p.id)}
                        value={remunerationDe(p.id)}
                        onChange={(e) => changerRemuneration(p, e.target.value as Taux['remuneration'])}
                      >
                        <option value="heure">à l’heure</option>
                        <option value="semaine">à la semaine</option>
                      </select>
                    </td>
                    {ECHELONS.map((n) => {
                      const t = de(p.id, n)
                      return (
                        <td key={n} className="px-1">
                          <ChampTexte
                            className={`${champPetit} w-24 py-1 text-right`}
                            inputMode="decimal"
                            aria-label={`${p.nom}, échelon ${n}`}
                            valeur={t ? lisible(t.montant) : ''}
                            placeholder="—"
                            disabled={!ecriture}
                            enregistrer={(v) => changerMontant(p, n, v)}
                          />
                        </td>
                      )
                    })}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
          {saison && !offerts.length && <p className="py-2 text-pierre-500">Aucun poste offert en {saison.nom.toLowerCase()} (Postes).</p>}
        </div>
      </div>
    </Section>
  )
}

// ------------------------------------------------------------
// Modèles de contrats
// ------------------------------------------------------------
const GENRES_MODELE = { contrat: 'Contrat de travail', consentement: 'Consentement parental' } as const
const SAISONS_MODELE: Record<GenreSaisonContrat, string> = { ete: 'été', hors_ete: 'hors été' }

function ModelesContrats() {
  const { compagnieParId } = useRh()
  const modeles = useModelesContrats()
  const [choisi, setChoisi] = useState<string | null>(null)
  const liste = [...(modeles.data ?? [])].sort((a, b) => a.genre.localeCompare(b.genre) || (a.entreprise_id ? 1 : 0) - (b.entreprise_id ? 1 : 0))
  const m = liste.find((x) => x.id === choisi) ?? liste[0]
  const nom = (x: ModeleContrat) =>
    [GENRES_MODELE[x.genre], x.entreprise_id ? compagnieParId.get(x.entreprise_id)?.abreviation || compagnieParId.get(x.entreprise_id)?.nom : null, x.genre_saison ? SAISONS_MODELE[x.genre_saison] : null]
      .filter(Boolean)
      .join(' · ')
  return (
    <Section titre="Modèles de contrats" className="xl:col-span-2">
      {modeles.error && <p className={ui.erreur}>{messageErreur(modeles.error)}</p>}
      <div className="grid gap-4 text-sm lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="space-y-2">
          <ul className="space-y-1">
            {liste.map((x) => (
              <li key={x.id}>
                <button className={`w-full rounded-md px-2 py-1.5 text-left ${m?.id === x.id ? 'bg-foret-50 font-medium text-foret-900' : 'hover:bg-pierre-50'}`} onClick={() => setChoisi(x.id)}>
                  {nom(x)}
                  {x.a_valider && <span className="block text-xs text-amber-700">À valider</span>}
                </button>
              </li>
            ))}
          </ul>
          {m && <NouveauModele depuis={m} choisir={setChoisi} />}
        </div>
        {m && <EditeurContrat key={m.id} m={m} />}
      </div>
      <details className="mt-4 text-xs text-pierre-600">
        <summary className="cursor-pointer">Syntaxe et champs</summary>
        <p className="mt-2">
          <code>#</code> titre, <code>##</code> article numéroté, <code>###</code> sous-titre, <code>- </code> puce, <code>1. </code> liste, <code>| tableau |</code>,{' '}
          <code>**gras**</code>, <code>{'{{champ}}'}</code>, <code>{'{{#si champ}}'}</code> … <code>{'{{/si}}'}</code> ; blocs <code>[[entete]]</code> (les deux parties),{' '}
          <code>[[taches]]</code> (tâches du poste), <code>[[signatures]]</code> (case de l’employé, compagnie pré-signée), <code>[[saut]]</code> (nouvelle page) ; consentement :{' '}
          <code>[[signature_parent]]</code>.
        </p>
        <p className="mt-1">
          Contrat : <code>{'{{poste}}'}</code>, <code>{'{{saison}}'}</code>, <code>{'{{compagnie}}'}</code> (raison sociale), <code>{'{{compagnie_court}}'}</code>, <code>{'{{debut}}'}</code>,{' '}
          <code>{'{{fin}}'}</code>, <code>{'{{taux}}'}</code>, <code>{'{{taux_jour}}'}</code> (taux à la semaine ÷ 5), <code>{'{{a_la_semaine}}'}</code>, <code>{'{{a_l_heure}}'}</code>,{' '}
          <code>{'{{echelon}}'}</code>, <code>{'{{taches}}'}</code>, <code>{'{{employe}}'}</code>, <code>{'{{signataire}}'}</code>, <code>{'{{date}}'}</code>. Consentement :{' '}
          <code>{'{{parent}}'}</code>, <code>{'{{employe}}'}</code>, <code>{'{{date_naissance}}'}</code>, <code>{'{{compagnie}}'}</code>, <code>{'{{saison}}'}</code>, <code>{'{{date}}'}</code>.
        </p>
      </details>
    </Section>
  )
}

/** Exemple pour l'aperçu d'un modèle. */
const EXEMPLE: TermesContrat = {
  poste: 'Animateur - Camp d’été',
  saison: 'Été 2027',
  genre_saison: 'ete',
  debut: '2027-06-20',
  fin: '2027-08-20',
  remuneration: 'semaine',
  taux: 664,
  echelon: 2,
  compagnie: { nom: 'GBPA+', raison_sociale: 'Raison sociale de la compagnie', nom_court: 'la compagnie', adresse: 'Adresse de la compagnie', courriel: 'adresse@compagnie.ca', telephone: '819 000-0000' },
  taches: '**Animation**\n- Animer des activités\n- Encadrer les campeurs',
  signataire: '',
  prepare_le: new Date().toISOString().slice(0, 10),
}

function EditeurContrat({ m }: { m: ModeleContrat & { updated_by_nom?: string | null } }) {
  const { ecriture, auj } = useRh()
  const { profil } = useAuth()
  const enregistrer = useEnregistrerModeleContrat()
  const [titre, setTitre] = useState(m.titre)
  const [contenu, setContenu] = useState(m.contenu)
  const [erreur, setErreur] = useState<string | null>(null)
  const change = titre !== m.titre || contenu !== m.contenu
  const sauver = (champs: Partial<ModeleContrat>) => {
    setErreur(null)
    enregistrer.mutate({ ...m, ...champs }, { onError: (e) => setErreur(messageErreur(e)) })
  }
  const apercu = async () => {
    setErreur(null)
    try {
      const { pdfConsentement, pdfContrat } = await import('./contrat')
      const r =
        m.genre === 'contrat'
          ? await pdfContrat(titre, contenu, { ...EXEMPLE, signataire: profil?.nom ?? 'Prénom Nom' }, null, auj)
          : await pdfConsentement(titre, contenu, { employe: { prenom: 'Prénom', nom_famille: 'Nom', date_naissance: '2010-07-01' }, compagnie: 'Raison sociale de la compagnie', saison: 'Été 2027', parent: '', lien: '' }, auj)
      const url = URL.createObjectURL(new Blob([r.octets as BlobPart], { type: 'application/pdf' }))
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }
  return (
    <div className="space-y-3">
      {m.a_valider && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
          Modèle repris d’Airtable, pas encore relu : à faire valider avant de l’envoyer
          {m.genre === 'consentement' && ' (texte juridique : à faire relire, notamment les passages sur l’alcool et la responsabilité)'}.
          {ecriture && (
            <button className="ml-2 font-medium underline" onClick={() => sauver({ a_valider: false })}>
              Marquer comme relu
            </button>
          )}
        </p>
      )}
      <label className="block">
        <span className={ui.etiquette}>Titre</span>
        <input className={ui.champ} value={titre} disabled={!ecriture} onChange={(e) => setTitre(e.target.value)} />
      </label>
      <label className="block">
        <span className={ui.etiquette}>Texte</span>
        <textarea className={`${ui.champ} min-h-[28rem] font-mono text-xs`} value={contenu} disabled={!ecriture} onChange={(e) => setContenu(e.target.value)} />
      </label>
      {erreur && <p className={ui.erreur}>{erreur}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-pierre-500">
          {m.updated_by_nom ? `Modifié par ${m.updated_by_nom}` : 'Modèle de départ'} · un contrat déjà préparé garde le texte de ce jour-là.
        </p>
        <span className="flex gap-2">
          <button className={ui.boutonSecondaire} onClick={apercu}>
            Aperçu (exemple)
          </button>
          {ecriture && (
            <button className={ui.bouton} disabled={!change || !titre.trim() || enregistrer.isPending} onClick={() => sauver({ titre: titre.trim(), contenu })}>
              Enregistrer
            </button>
          )}
        </span>
      </div>
    </div>
  )
}

/** Modèle propre à une compagnie ou à un genre de saison, copié du modèle choisi. */
function NouveauModele({ depuis, choisir }: { depuis: ModeleContrat; choisir: (id: string) => void }) {
  const { compagnies, ecriture } = useRh()
  const modeles = useModelesContrats()
  const enregistrer = useEnregistrerModeleContrat()
  const [compagnie, setCompagnie] = useState<string>('')
  const [genreSaison, setGenreSaison] = useState<GenreSaisonContrat | ''>('')
  if (!ecriture) return null
  const existe = modeles.data?.some((x) => x.genre === depuis.genre && (x.entreprise_id ?? '') === compagnie && (x.genre_saison ?? '') === genreSaison)
  return (
    <details className="rounded-lg border border-dashed border-pierre-300 p-2 text-xs">
      <summary className="cursor-pointer text-pierre-600">+ Modèle propre (copie de celui-ci)</summary>
      <div className="mt-2 space-y-2">
        <select className={`${champPetit} w-full`} value={compagnie} onChange={(e) => setCompagnie(e.target.value)}>
          <option value="">Toutes les compagnies</option>
          {compagnies
            .filter((c) => c.actif)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
        </select>
        <select className={`${champPetit} w-full`} value={genreSaison} onChange={(e) => setGenreSaison(e.target.value as GenreSaisonContrat | '')}>
          <option value="">Toutes les saisons</option>
          <option value="ete">Été</option>
          <option value="hors_ete">Hors été</option>
        </select>
        <button
          className={ui.boutonSecondaire}
          disabled={existe || enregistrer.isPending}
          onClick={() => {
            const id = crypto.randomUUID()
            enregistrer.mutate(
              { id, genre: depuis.genre, entreprise_id: compagnie || null, genre_saison: genreSaison || null, titre: depuis.titre, contenu: depuis.contenu, a_valider: depuis.a_valider },
              { onSuccess: () => choisir(id) },
            )
          }}
        >
          {existe ? 'Ce modèle existe déjà' : 'Créer'}
        </button>
        {enregistrer.error && <p className={ui.erreur}>{messageErreur(enregistrer.error)}</p>}
      </div>
    </details>
  )
}

// ------------------------------------------------------------
// Tâches des postes (contrat)
// ------------------------------------------------------------
function TachesPostes() {
  const { postes, compagnies, compagnieParId, ecriture } = useRh()
  const modifier = useModifierPoste()
  const groupes = parCompagnie(postesParCompagnie(postes, compagnies))
  return (
    <Section titre="Tâches des postes (contrats)" className="xl:col-span-2">
      <p className="mb-3 text-sm text-pierre-600">Reprises dans le contrat (bloc [[taches]]). Même syntaxe que les modèles : **gras** pour un groupe, « - » pour une tâche.</p>
      {modifier.error && <p className={`${ui.erreur} mb-2`}>{messageErreur(modifier.error)}</p>}
      <div className="space-y-4">
        {groupes.map(([cid, ps]) => (
          <div key={cid}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-pierre-500">{compagnieParId.get(cid)?.nom}</p>
            <ul className="divide-y divide-pierre-100 text-sm">
              {ps.map((p) => (
                <LigneTaches key={p.id} p={p} disabled={!ecriture} enregistrer={(taches) => modifier.mutate({ id: p.id, champs: { taches } })} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  )
}

function LigneTaches({ p, disabled, enregistrer }: { p: Poste; disabled: boolean; enregistrer: (t: string | null) => void }) {
  const [texte, setTexte] = useState(p.taches ?? '')
  return (
    <li className="py-2">
      <details>
        <summary className="cursor-pointer">
          {p.nom} {p.taches?.trim() ? <span className="text-xs text-foret-700">✓ tâches</span> : <span className="text-xs text-pierre-400">aucune tâche</span>}
        </summary>
        <textarea
          className={`${ui.champ} mt-2 min-h-40 font-mono text-xs`}
          value={texte}
          disabled={disabled}
          onChange={(e) => setTexte(e.target.value)}
          onBlur={() => texte !== (p.taches ?? '') && enregistrer(texte.trim() ? texte : null)}
        />
      </details>
    </li>
  )
}
