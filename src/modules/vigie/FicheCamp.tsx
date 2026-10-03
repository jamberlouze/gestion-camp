import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { IconeCorbeille, IconePlus } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { Carte, ChoixCategorie, Chargement, LienExterne, PastilleCategorie, Saisons, TexteLibre } from './commun'
import { argent, dateCourte, menu } from './outils'
import { useActivites, useCamps, useChangementsCamp, useEcriture, useLier, useLiens, useModifier, useProgrammes } from './donnees'
import { HEBERGEMENTS, TYPES_CAMP, type Activite, type Camp, type LienActivite, type Programme, type StatutInclusion } from './types'

const champ = `${ui.champ} py-1.5`
const nombreOuNull = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))

export function FicheCamp() {
  const { id = '' } = useParams()
  // Une fiche s'ouvre en haut de page (depuis le bas d'une longue liste).
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [id])
  const ecriture = useEcriture()
  const camps = useCamps()
  const programmes = useProgrammes()
  const activites = useActivites()
  const liens = useLiens()
  const historique = useChangementsCamp(id)
  const modifier = useModifier<Camp>('camps')

  const camp = camps.data?.find((c) => c.id === id)
  const progs = useMemo(() => (programmes.data ?? []).filter((p) => p.camp_id === id), [programmes.data, id])
  const lies = useMemo(() => {
    const ids = new Map((liens.data ?? []).filter((l) => l.camp_id === id).map((l) => [l.activite_id, l]))
    return (activites.data ?? []).filter((a) => ids.has(a.id)).map((a) => ({ a, lien: ids.get(a.id)! }))
  }, [liens.data, activites.data, id])

  const erreur = camps.error ?? programmes.error ?? activites.error ?? liens.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!camps.data || !programmes.data || !activites.data || !liens.data) return <Chargement />
  if (!camp) return <p className="text-sm text-pierre-500">Camp introuvable. <Link to="/vigie" className="underline">Retour</Link></p>

  const maj = (valeurs: Partial<Camp>) => modifier.mutate({ id: camp.id, ...valeurs })
  const texte = (col: keyof Camp, libelle: string, large?: boolean) => (
    <label className={large ? 'sm:col-span-2' : ''}>
      <span className={ui.etiquette}>{libelle}</span>
      <ChampTexte className={champ} valeur={(camp[col] as string | null) ?? ''} disabled={!ecriture} enregistrer={(v) => maj({ [col]: v || null })} />
    </label>
  )
  const reseau = (col: 'site_web' | 'facebook' | 'instagram' | 'tiktok', libelle: string) => (
    <div className="grid grid-cols-[1fr_4.5rem] gap-2">
      <label>
        <span className={ui.etiquette}>
          {libelle} {camp[col] && <LienExterne href={camp[col]}>↗</LienExterne>}
        </span>
        <ChampTexte className={champ} valeur={camp[col] ?? ''} disabled={!ecriture} enregistrer={(v) => maj({ [col]: v || null })} />
      </label>
      <label>
        <span className={ui.etiquette}>/10</span>
        <ChampTexte
          className={champ}
          type="number"
          min={0}
          max={10}
          step={0.5}
          valeur={camp[`${col}_score`] == null ? '' : String(camp[`${col}_score`])}
          disabled={!ecriture}
          enregistrer={(v) => maj({ [`${col}_score`]: nombreOuNull(v) })}
        />
      </label>
    </div>
  )
  const cases = (col: 'types' | 'hebergement', options: Record<string, string>) => (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {Object.entries(options).map(([cle, libelle]) => (
        <label key={cle} className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            disabled={!ecriture}
            checked={camp[col].includes(cle)}
            onChange={(e) => maj({ [col]: e.target.checked ? [...camp[col], cle] : camp[col].filter((x) => x !== cle) })}
          />
          {libelle}
        </label>
      ))}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/vigie" className="text-sm text-pierre-500 hover:text-pierre-900">
          ← Tableau de bord
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">{camp.nom}</h2>
        <PastilleCategorie categorie={camp.categorie} />
        {ecriture && (
          <>
            <ChoixCategorie valeur={camp.categorie} changer={(categorie) => maj({ categorie })} />
            <select
              aria-label="Statut"
              className={`${menu} py-1 text-xs`}
              value={camp.statut_inclusion}
              onChange={(e) => maj({ statut_inclusion: e.target.value as StatutInclusion })}
            >
              <option value="propose">Proposé</option>
              <option value="inclus">Inclus (suivi chaque mois)</option>
              <option value="exclu">Exclu (jamais reproposé)</option>
            </select>
          </>
        )}
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" disabled={!ecriture} checked={camp.membre_acq} onChange={(e) => maj({ membre_acq: e.target.checked })} />
          Membre ACQ
        </label>
      </div>
      <p className="text-xs text-pierre-500">
        {camp.origine === 'import' ? 'Importé du Sheets' : camp.origine === 'decouverte' ? `Découvert le ${dateCourte(camp.date_decouverte)}` : 'Ajouté à la main'}
        {' · '}vérifié {camp.verifie_le ? `le ${dateCourte(camp.verifie_le)}` : 'jamais'}
        {camp.documente_le && ` · documenté le ${dateCourte(camp.documente_le)}`}
      </p>
      {(camp.resume || camp.pertinence) && (
        <div className="rounded-lg bg-pierre-100 px-3 py-2 text-sm text-pierre-700">
          {camp.resume} {camp.pertinence}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Carte titre="Fiche">
          <div className="grid gap-3 sm:grid-cols-2">
            {texte('nom', 'Nom')}
            {texte('ville', 'Ville')}
            {texte('region', 'Région administrative')}
            {texte('province', 'Province')}
            <div className="sm:col-span-2">
              <span className={ui.etiquette}>Type de camp</span>
              {cases('types', TYPES_CAMP)}
            </div>
            <div className="sm:col-span-2">
              <span className={ui.etiquette}>Hébergement</span>
              {cases('hebergement', HEBERGEMENTS)}
            </div>
          </div>
        </Carte>
        <Carte titre="Présence web et réseaux sociaux">
          <div className="grid gap-3">
            {reseau('site_web', 'Site web')}
            {reseau('facebook', 'Facebook')}
            {reseau('instagram', 'Instagram')}
            {reseau('tiktok', 'TikTok')}
          </div>
        </Carte>
      </div>

      <Programmes camp={camp} programmes={progs} ecriture={ecriture} />

      <Carte titre={`Activités offertes (${lies.length})`}>
        <ActivitesCamp camp={camp} lies={lies} ecriture={ecriture} />
      </Carte>

      <div className="grid gap-4 xl:grid-cols-2">
        <Carte titre="Notes">
          <TexteLibre valeur={camp.notes} desactive={!ecriture} enregistrer={(notes) => maj({ notes })} />
        </Carte>
        <Carte titre="Idées et coups de cœur">
          <TexteLibre valeur={camp.idees} desactive={!ecriture} enregistrer={(idees) => maj({ idees })} />
        </Carte>
      </div>

      <Carte titre="Historique des changements détectés">
        {!historique.data?.length ? (
          <p className="text-sm text-pierre-500">Aucun pour l'instant.</p>
        ) : (
          <ul className="divide-y divide-pierre-100 text-sm">
            {historique.data.map((c) => (
              <li key={c.id} className="flex flex-wrap gap-x-3 py-1.5">
                <span className="w-24 shrink-0 text-pierre-500">{dateCourte(c.detecte_le)}</span>
                <span className="w-36 shrink-0">
                  {c.type === 'prix' ? 'Prix' : c.type === 'nouveau_programme' ? 'Nouveau programme' : 'Nouvelle activité'}
                </span>
                <span className="flex-1">
                  {c.ancienne_valeur && <span className="text-pierre-500">{c.ancienne_valeur} → </span>}
                  {c.nouvelle_valeur}
                </span>
                <span className={c.statut === 'valide' ? 'text-foret-700' : c.statut === 'rejete' ? 'text-pierre-500' : 'text-amber-700'}>
                  {c.statut === 'valide' ? 'Validé' : c.statut === 'rejete' ? 'Rejeté' : 'À valider'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Carte>
    </div>
  )
}

function Programmes({ camp, programmes, ecriture }: { camp: Camp; programmes: Programme[]; ecriture: boolean }) {
  const modifier = useModifier<Programme>('programmes')
  const maj = (p: Programme, valeurs: Partial<Programme>) => modifier.mutate({ id: p.id, ...valeurs })
  const cellule = 'px-2 py-1.5'
  const nb = (p: Programme, col: 'duree_jours' | 'duree_nuits' | 'prix', largeur: string) => (
    <div className={largeur}>
    <ChampTexte
      className={`${champ} text-right`}
      type="number"
      min={0}
      valeur={p[col] == null ? '' : String(p[col])}
      disabled={!ecriture}
      enregistrer={(v) => maj(p, { [col]: nombreOuNull(v) })}
    />
    </div>
  )
  const supprimer = async (p: Programme) => {
    if (await confirmer({ titre: `Supprimer le programme « ${p.nom} » ?`, libelleOk: 'Supprimer' })) modifier.mutate({ id: p.id, supprimer: true })
  }
  const actifs = programmes.filter((p) => p.actif)
  return (
    <Carte
      titre={`Programmes (${actifs.length})`}
      action={
        ecriture && (
          <button className={`${ui.boutonSecondaire} py-1.5`} onClick={() => modifier.mutate({ camp_id: camp.id, nom: 'Nouveau programme' })}>
            <IconePlus /> Programme
          </button>
        )
      }
    >
      {!programmes.length ? (
        <p className="text-sm text-pierre-500">Aucun programme connu.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-pierre-500">
              <tr>
                <th className={`${cellule} font-medium`}>Programme</th>
                <th className={`${cellule} text-right font-medium`}>Jours</th>
                <th className={`${cellule} text-right font-medium`}>Nuits</th>
                <th className={`${cellule} text-right font-medium`}>Prix</th>
                <th className={`${cellule} text-right font-medium`}>Prix / nuit</th>
                <th className={`${cellule} font-medium`}>Saison du prix</th>
                <th className={`${cellule} font-medium`}>Vérifié</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-pierre-100 align-top">
              {programmes.map((p) => (
                <tr key={p.id} className={p.actif ? '' : 'opacity-50'}>
                  <td className={`${cellule} min-w-64`}>
                    <ChampTexte className={champ} valeur={p.nom} obligatoire disabled={!ecriture} enregistrer={(nom) => maj(p, { nom })} />
                    {p.description && <div className="mt-1 text-xs text-pierre-600">{p.description}</div>}
                    {p.notes && <div className="mt-0.5 text-xs text-pierre-500">{p.notes}</div>}
                    {p.source_url && (
                      <div className="text-xs">
                        <LienExterne href={p.source_url}>source</LienExterne>
                      </div>
                    )}
                  </td>
                  <td className={cellule}>{nb(p, 'duree_jours', 'w-20')}</td>
                  <td className={cellule}>{nb(p, 'duree_nuits', 'w-20')}</td>
                  <td className={cellule}>{nb(p, 'prix', 'w-28')}</td>
                  <td className={`${cellule} whitespace-nowrap pt-3 text-right font-medium tabular-nums`}>{argent(p.prix_par_nuit)}</td>
                  <td className={cellule}>
                    <ChampTexte className={`${champ} min-w-28`} valeur={p.annee ?? ''} disabled={!ecriture} enregistrer={(annee) => maj(p, { annee: annee || null })} />
                  </td>
                  <td className={`${cellule} whitespace-nowrap pt-3 text-xs text-pierre-500`}>{dateCourte(p.verifie_le)}</td>
                  <td className={`${cellule} pt-2`}>
                    {ecriture && (
                      <div className="flex items-center gap-1">
                        <label className="flex items-center gap-1 text-xs text-pierre-600" title="Un programme inactif n'est plus vérifié">
                          <input type="checkbox" checked={p.actif} onChange={(e) => maj(p, { actif: e.target.checked })} />
                          actif
                        </label>
                        <button className={ui.boutonDanger} aria-label="Supprimer" onClick={() => supprimer(p)}>
                          <IconeCorbeille />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Carte>
  )
}

function ActivitesCamp({
  camp,
  lies,
  ecriture,
}: {
  camp: Camp
  lies: { a: Activite; lien: LienActivite }[]
  ecriture: boolean
}) {
  const activites = useActivites()
  const lier = useLier()
  const [ajout, setAjout] = useState('')
  const dejaLies = new Set(lies.map((l) => l.a.id))
  const SOURCES: Record<string, string> = { import: 'Sheets', site: 'site', photo: 'photo', reseaux: 'réseaux', manuel: 'manuel' }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {lies.map(({ a, lien }) => (
          <span
            key={a.id}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm ring-1 ${
              a.offert_bpa ? 'bg-white text-pierre-600 ring-pierre-200' : 'bg-foret-50 text-foret-800 ring-foret-100'
            }`}
            title={a.offert_bpa ? 'Aussi offerte à la BPA' : 'Absente à la BPA'}
          >
            <Link to={`/vigie/activites/${a.id}`} className="hover:underline">
              {a.nom}
            </Link>
            <Saisons saisons={a.saisons} />
            <span className="text-xs text-pierre-400">{SOURCES[lien.source] ?? lien.source}</span>
            {ecriture && (
              <button className="text-pierre-400 hover:text-red-700" aria-label={`Retirer ${a.nom}`} onClick={() => lier.mutate({ camp_id: camp.id, activite_id: a.id, lier: false })}>
                ×
              </button>
            )}
          </span>
        ))}
        {!lies.length && <p className="text-sm text-pierre-500">Aucune activité notée.</p>}
      </div>
      <p className="mt-2 text-xs text-pierre-500">En vert : activités absentes à la BPA.</p>
      {ecriture && (
        <div className="mt-3 flex items-center gap-2">
          <select aria-label="Ajouter une activité" className={menu} value={ajout} onChange={(e) => setAjout(e.target.value)}>
            <option value="">Ajouter une activité…</option>
            {(activites.data ?? [])
              .filter((a) => !dejaLies.has(a.id))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nom}
                </option>
              ))}
          </select>
          <button
            className={`${ui.boutonSecondaire} py-1.5`}
            disabled={!ajout}
            onClick={() => {
              lier.mutate({ camp_id: camp.id, activite_id: ajout, lier: true })
              setAjout('')
            }}
          >
            Ajouter
          </button>
        </div>
      )}
    </div>
  )
}
