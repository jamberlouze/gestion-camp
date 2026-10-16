import { useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router'
import { PuceCompagnie } from '@/lib/PuceCompagnie'
import { messageErreur } from '@/lib/donnees'
import { reduireImage } from '@/lib/photos'
import { CourrielCopiable } from '@/lib/CourrielCopiable'
import { classeLigneCliquable, clicLigne } from '@/lib/ligneCliquable'
import { ui } from '@/lib/ui'
import { useTitreImpression } from '@/lib/useTitreImpression'
import { useAuth } from '@/shell/auth'
import { useQueryClient } from '@tanstack/react-query'
import { useAjouterDocument, useCompagnies } from '../donnees'
import { age, aujourdhui, correspond, dateCourte, sansAccents } from '../outils'
import { DIETES, type Compagnie } from '../types'
import { lienTel, nomDeCamp, santeAConnaitre, useFiches, usePhotos, type DossierFiche, type Fiche } from './donnees'

/**
 * Fiches du staff (accès `rh_fiches`, direction et coordonnateurs) : une
 * fiche courte par personne embauchée d'une saison — photo, coordonnées,
 * santé, diète, contacts d'urgence. Lecture seulement ; les corrections se
 * font dans le dossier RH de la personne. En ligne seulement.
 */
export function FichesStaff() {
  return (
    <Routes>
      <Route index element={<Liste />} />
      <Route path=":id" element={<FicheDetaillee />} />
      <Route path="*" element={<Navigate to="/rh/fiches" replace />} />
    </Routes>
  )
}

const nomDiete = (d: DossierFiche | null) => DIETES.find((x) => x.id === d?.diete)?.nom ?? null
const dieteParticuliere = (d: DossierFiche | null) => (d?.diete && d.diete !== 'reguliere' ? nomDiete(d) : null)

function useCompagniesParId() {
  const compagnies = useCompagnies()
  return new Map<string, Compagnie>((compagnies.data ?? []).map((c) => [c.id, c]))
}

// ------------------------------------------------------------------
// Liste : une ligne haute par personne, photo bien visible
// ------------------------------------------------------------------
function Liste() {
  const [params, setParams] = useSearchParams()
  const naviguer = useNavigate()
  const saisonDemandee = params.get('saison')
  const compagnie = params.get('compagnie')
  const sante = params.get('sante') === '1'
  const [recherche, setRecherche] = useState('')
  const fiches = useFiches(saisonDemandee)
  const parCompagnie = useCompagniesParId()
  const photos = usePhotos((fiches.data?.fiches ?? []).flatMap((f) => (f.photo ? [f.photo] : [])))

  const changer = (cle: string, valeur: string | null) => {
    const p = new URLSearchParams(params)
    if (valeur) p.set(cle, valeur)
    else p.delete(cle)
    setParams(p, { replace: true })
  }

  if (fiches.error) return <p className={ui.erreur}>{messageErreur(fiches.error)}</p>
  if (!fiches.data) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const { saisons, saison_id } = fiches.data
  const toutes = fiches.data.fiches
  const compagniesPresentes = [...new Set(toutes.flatMap((f) => f.postes.map((p) => p.entreprise_id).filter((x): x is string => !!x)))]
    .map((id) => parCompagnie.get(id))
    .filter((c): c is Compagnie => !!c)
    .sort((a, b) => a.ordre - b.ordre)
  const q = recherche.trim()
  const lignes = toutes.filter(
    (f) =>
      (!compagnie || f.postes.some((p) => p.entreprise_id === compagnie)) &&
      (!sante || santeAConnaitre(f.dossier)) &&
      (!q || correspond(sansAccents([f.prenom, f.nom_famille, f.surnom, ...f.postes.map((p) => p.poste)].filter(Boolean).join(' ')), q)),
  )
  const nSante = toutes.filter((f) => santeAConnaitre(f.dossier)).length
  const lien = (f: Fiche) => `/rh/fiches/${f.personne_id}${saison_id ? `?saison=${saison_id}` : ''}`
  const auj = aujourdhui()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <select className={champ} value={saison_id ?? ''} onChange={(e) => changer('saison', e.target.value || null)} aria-label="Saison">
          {saisons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </select>
        {compagniesPresentes.length > 1 && (
          <select className={champ} value={compagnie ?? ''} onChange={(e) => changer('compagnie', e.target.value || null)} aria-label="Compagnie">
            <option value="">Toutes les compagnies</option>
            {compagniesPresentes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        )}
        <input type="search" className={`${champ} w-56`} placeholder="Chercher un nom, un poste…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        <button
          className={`rounded-full border px-3 py-1.5 text-sm font-medium ${sante ? 'border-red-300 bg-red-50 text-red-800' : 'border-pierre-300 text-pierre-700 hover:bg-pierre-50'}`}
          aria-pressed={sante}
          onClick={() => changer('sante', sante ? null : '1')}
        >
          🩺 Santé à connaître <span className="text-pierre-500">({nSante})</span>
        </button>
        <span className="ml-auto text-sm text-pierre-500">
          {lignes.length} {lignes.length > 1 ? 'personnes' : 'personne'}
        </span>
      </div>

      {saisons.length === 0 ? (
        <p className="py-8 text-center text-sm text-pierre-500">Aucune embauche pour l'instant.</p>
      ) : lignes.length === 0 ? (
        <p className="py-8 text-center text-sm text-pierre-500">Personne ne correspond.</p>
      ) : (
        // Écran étroit avec le menu ouvert : la liste défile de côté plutôt que d'écraser les colonnes.
        <div className={`${ui.carte} overflow-x-auto`}>
          <div className="md:min-w-[52rem]">
            <div className={`${GRILLE} hidden border-b border-pierre-200 bg-pierre-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-pierre-500 md:grid`}>
              <span />
              <span>Nom et poste</span>
              <span>Santé et diète</span>
              <span>Téléphone</span>
              <span>Courriel</span>
              <span>En cas d'urgence</span>
            </div>
            <ul className="divide-y divide-pierre-100">
              {lignes.map((f) => {
                const d = f.dossier
                const ans = age(f.date_naissance, auj)
                return (
                  <li key={f.personne_id} className={`${GRILLE} grid items-center px-3 py-3 sm:px-4 ${classeLigneCliquable}`} onClick={clicLigne(() => naviguer(lien(f)))}>
                    <Photo fiche={f} url={f.photo ? photos.data?.get(f.photo) : undefined} className="h-20 w-20 rounded-lg sm:h-28 sm:w-28" />
                    <div className="min-w-0 space-y-1">
                      <div>
                        <Link to={lien(f)} className="block truncate text-lg font-semibold text-pierre-900 hover:text-foret-800">
                          {nomDeCamp(f)}
                        </Link>
                        <p className="truncate text-sm text-pierre-600">
                          {`${f.prenom} ${f.nom_famille}`}
                          {ans !== null && <span className="text-pierre-400"> · {ans} ans</span>}
                        </p>
                      </div>
                      <Postes fiche={f} parCompagnie={parCompagnie} />
                      {/* Téléphone : les pastilles sous le nom */}
                      <div className="md:hidden">
                        <PucesSante d={d} />
                      </div>
                    </div>
                    <div className="hidden min-w-0 space-y-1 md:block">
                      <PucesSante d={d} />
                      {d?.allergies && <p className="line-clamp-2 text-sm text-amber-900">{d.allergies}</p>}
                    </div>
                    <div className="hidden text-sm md:block">
                      {f.telephone ? (
                        <a href={lienTel(f.telephone)} className="whitespace-nowrap text-foret-800 hover:underline">
                          {f.telephone}
                        </a>
                      ) : (
                        <span className="text-pierre-400">—</span>
                      )}
                    </div>
                    <div className="hidden min-w-0 text-sm md:block">
                      {f.courriel ? (
                        <CourrielCopiable courriel={f.courriel} className="text-foret-800 hover:underline" />
                      ) : (
                        <span className="text-pierre-400">—</span>
                      )}
                    </div>
                    <div className="hidden min-w-0 space-y-1.5 text-sm md:block">
                      <ContactsUrgence d={d} />
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

/** Colonnes de la liste : photo, nom et poste, santé, téléphone, courriel, urgence (une seule colonne de texte au téléphone). */
const GRILLE =
  'grid-cols-[auto_1fr] gap-x-4 md:gap-x-3 md:grid-cols-[7rem_minmax(8rem,1.3fr)_minmax(7rem,1fr)_8rem_minmax(8rem,1fr)_minmax(9rem,1.1fr)]'

/** Les deux contacts d'urgence : nom · lien, puis le numéro cliquable. */
function ContactsUrgence({ d }: { d: DossierFiche | null }) {
  if (!d) return <span className="text-pierre-400">—</span>
  const contacts = ([1, 2] as const)
    .map((n) => ({ n, nom: d[`urgence${n}_nom`], lien: d[`urgence${n}_lien`], tel: d[`urgence${n}_telephone`] }))
    .filter((c) => c.nom || c.tel)
  if (!contacts.length) return <span className="text-xs text-pierre-400">Aucun contact</span>
  return (
    <>
      {contacts.map((c) => (
        <div key={c.n} className="min-w-0">
          <p className="truncate text-xs text-pierre-600" title={[c.nom, c.lien].filter(Boolean).join(' · ')}>
            {c.nom}
            {c.lien && <span className="text-pierre-400"> · {c.lien}</span>}
          </p>
          {c.tel && (
            <a href={lienTel(c.tel)} className="whitespace-nowrap text-foret-800 hover:underline">
              {c.tel}
            </a>
          )}
        </div>
      ))}
    </>
  )
}

const champ = 'rounded-lg border border-pierre-300 bg-white px-2.5 py-1.5 text-sm text-pierre-900 focus:border-foret-600 focus:outline-none'

function Postes({ fiche, parCompagnie }: { fiche: Fiche; parCompagnie: Map<string, Compagnie> }) {
  return (
    <div className="space-y-0.5">
      {fiche.postes.map((p) => {
        const c = p.entreprise_id ? parCompagnie.get(p.entreprise_id) : undefined
        return (
          <div key={p.embauche_id} className="flex min-w-0 items-center gap-1.5 text-sm text-pierre-700">
            {c && <PuceCompagnie compagnie={c} court className="shrink-0" />}
            <span className="truncate">{p.poste ?? (p.genre === 'benevolat' ? 'Bénévole' : 'Poste à préciser')}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Pastilles : ce qu'il faut savoir d'un coup d'œil. */
function PucesSante({ d }: { d: DossierFiche | null }) {
  if (!d) return <span className="text-xs text-pierre-400">Dossier pas encore reçu</span>
  const puces: { texte: string; titre: string; classe: string }[] = []
  if (d.auto_injecteur) puces.push({ texte: '💉 EpiPen', titre: "Porte un auto-injecteur d'épinéphrine", classe: 'bg-red-100 text-red-800' })
  if (d.allergies) puces.push({ texte: '⚠️ Allergie', titre: d.allergies, classe: 'bg-amber-100 text-amber-800' })
  if (d.sante_conditions || d.medicaments || d.sante_notes)
    puces.push({ texte: '🩺 Santé', titre: [d.sante_conditions, d.medicaments, d.sante_notes].filter(Boolean).join(' · '), classe: 'bg-sky-100 text-sky-800' })
  const diete = dieteParticuliere(d)
  if (diete) puces.push({ texte: diete, titre: 'Diète', classe: 'bg-pierre-100 text-pierre-700' })
  if (!puces.length) return <span className="text-xs text-pierre-400">Rien à signaler</span>
  return (
    <div className="flex flex-wrap gap-1">
      {puces.map((p) => (
        <span key={p.texte} title={p.titre} className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.classe}`}>
          {p.texte}
        </span>
      ))}
    </div>
  )
}

function Photo({ fiche, url, className = '' }: { fiche: Fiche; url: string | undefined; className?: string }) {
  if (url) return <img src={url} alt={`Photo de ${nomDeCamp(fiche)}`} loading="lazy" className={`bg-pierre-100 object-cover ${className}`} />
  const initiales = `${fiche.prenom[0] ?? ''}${fiche.nom_famille[0] ?? ''}`.toUpperCase()
  return (
    <div className={`flex items-center justify-center bg-foret-50 text-3xl font-semibold text-foret-700 ${className}`} aria-hidden>
      {initiales || '?'}
    </div>
  )
}

// ------------------------------------------------------------------
// Fiche d'une personne
// ------------------------------------------------------------------
function FicheDetaillee() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const naviguer = useNavigate()
  const saison = params.get('saison')
  const fiches = useFiches(saison)
  const parCompagnie = useCompagniesParId()
  const { peutLire, peutEcrire } = useAuth()
  const f = fiches.data?.fiches.find((x) => x.personne_id === id)
  const photos = usePhotos(f?.photo ? [f.photo] : [])
  const nomSaison = fiches.data?.saisons.find((s) => s.id === fiches.data?.saison_id)?.nom
  useTitreImpression(f ? `Fiche - ${f.prenom} ${f.nom_famille}` : null)

  const retour = (
    <Link to={`/rh/fiches${saison ? `?saison=${saison}` : ''}`} className="text-sm text-pierre-500 hover:text-pierre-800 print:hidden">
      ← Fiches
    </Link>
  )
  if (fiches.error) return <div className="space-y-3">{retour}<p className={ui.erreur}>{messageErreur(fiches.error)}</p></div>
  if (!fiches.data) return <div className="space-y-3">{retour}<p className="py-8 text-center text-sm text-pierre-500">Chargement…</p></div>
  if (!f) return <div className="space-y-3">{retour}<p className="py-8 text-center text-sm text-pierre-500">Cette personne n'est pas embauchée pour cette saison.</p></div>

  const d = f.dossier
  const auj = aujourdhui()
  const ans = age(f.date_naissance, auj)
  const adresse = d ? [d.adresse, [d.ville, d.province].filter(Boolean).join(', '), d.code_postal, d.pays].filter(Boolean).join(' · ') : ''

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        {retour}
        <div className="flex flex-wrap gap-2">
          {peutEcrire('rh') && <ChangerPhoto personneId={f.personne_id} />}
          {peutLire('rh') && (
            <button className={ui.boutonSecondaire} onClick={() => naviguer(`/rh/p/${f.personne_id}`)}>
              Dossier complet
            </button>
          )}
          <button className={ui.boutonSecondaire} onClick={() => window.print()}>
            Imprimer
          </button>
        </div>
      </div>

      <section className={`${ui.carte} flex flex-col gap-4 p-4 sm:flex-row`}>
        <Photo fiche={f} url={f.photo ? photos.data?.get(f.photo) : undefined} className="aspect-square w-40 shrink-0 self-center rounded-xl sm:self-start" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h1 className="text-2xl font-semibold text-pierre-900">{nomDeCamp(f)}</h1>
            <p className="text-pierre-600">
              {`${f.prenom} ${f.nom_famille}`}
              {ans !== null && <span className="text-pierre-500"> · {ans} ans</span>}
              {ans !== null && ans < 18 && <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">Mineur·e</span>}
            </p>
          </div>
          <ul className="space-y-1 text-sm">
            {f.postes.map((p) => {
              const c = p.entreprise_id ? parCompagnie.get(p.entreprise_id) : undefined
              return (
                <li key={p.embauche_id} className="flex flex-wrap items-center gap-2">
                  {c && <PuceCompagnie compagnie={c} court />}
                  <span className="font-medium text-pierre-800">{p.poste ?? 'Poste à préciser'}</span>
                  {p.genre === 'benevolat' && <span className="text-xs text-pierre-500">bénévole</span>}
                  {(p.debut || p.fin) && (
                    <span className="text-pierre-500">
                      {nomSaison ? `${nomSaison} · ` : ''}
                      {dateCourte(p.debut, auj)} au {dateCourte(p.fin, auj)}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap gap-2 pt-1 print:hidden">
            {f.telephone && (
              <a href={lienTel(f.telephone)} className={ui.bouton}>
                📞 {f.telephone}
              </a>
            )}
            {f.courriel && (
              <CourrielCopiable courriel={f.courriel} className={ui.boutonSecondaire} avant="✉️" />
            )}
          </div>
        </div>
      </section>

      {!d ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Dossier d'embauche pas encore reçu : pas encore de santé ni de contacts d'urgence.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Bloc titre="🚨 En cas d'urgence">
            {!d.urgence1_nom && !d.urgence2_nom ? (
              <p className="text-sm text-pierre-500">Aucun contact donné.</p>
            ) : (
              <ul className="space-y-3">
                {([1, 2] as const).map((n) => {
                  const nom = d[`urgence${n}_nom`]
                  const lienParente = d[`urgence${n}_lien`]
                  const tel = d[`urgence${n}_telephone`]
                  if (!nom && !tel) return null
                  return (
                    <li key={n}>
                      <p className="font-medium text-pierre-900">
                        {nom ?? 'Contact'}
                        {lienParente && <span className="font-normal text-pierre-500"> · {lienParente}</span>}
                      </p>
                      {tel && (
                        <a href={lienTel(tel)} className="text-lg font-semibold text-foret-800 hover:underline">
                          {tel}
                        </a>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Bloc>

          <Bloc titre="🩺 Santé">
            <dl className="space-y-2 text-sm">
              {d.auto_injecteur && (
                <p className="rounded-lg bg-red-50 px-3 py-2 font-semibold text-red-800">💉 Porte un auto-injecteur d'épinéphrine (EpiPen)</p>
              )}
              <Ligne nom="Allergies ou intolérances" valeur={d.allergies} vide="Aucune" alerte={!!d.allergies} />
              <Ligne nom="Problèmes de santé ou limitations" valeur={d.sante_conditions} vide="Rien de signalé" />
              <Ligne nom="Médicaments" valeur={d.medicaments} vide="Aucun" />
              {d.sante_notes && <Ligne nom="Autre, en cas d'urgence" valeur={d.sante_notes} />}
              <Ligne nom="Assurance maladie" valeur={d.assurance_maladie} />
            </dl>
          </Bloc>

          <Bloc titre="🍽️ Diète">
            <p className="text-sm text-pierre-800">{nomDiete(d) ?? <span className="text-pierre-500">Pas précisée</span>}</p>
          </Bloc>

          <Bloc titre="📍 Coordonnées">
            <dl className="space-y-2 text-sm">
              <Ligne nom="Téléphone" valeur={f.telephone} />
              <Ligne nom="Courriel" valeur={f.courriel} />
              <Ligne nom="Adresse" valeur={adresse} />
              <Ligne nom="Date de naissance" valeur={f.date_naissance ? dateCourte(f.date_naissance) : null} />
            </dl>
          </Bloc>
        </div>
      )}
      {d && <p className="text-xs text-pierre-400">Dossier mis à jour le {dateCourte(d.mis_a_jour_le.slice(0, 10))}. Les corrections se font dans le dossier RH.</p>}
    </div>
  )
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className={`${ui.carte} p-4 break-inside-avoid`}>
      <h2 className="mb-2 font-semibold text-pierre-900">{titre}</h2>
      {children}
    </section>
  )
}

function Ligne({ nom, valeur, vide, alerte = false }: { nom: string; valeur: string | null | undefined; vide?: string; alerte?: boolean }) {
  if (!valeur && !vide) return null
  return (
    <div>
      <dt className="text-xs text-pierre-500">{nom}</dt>
      <dd className={valeur ? (alerte ? 'font-semibold text-amber-900' : 'whitespace-pre-line text-pierre-800') : 'text-pierre-400'}>{valeur || vide}</dd>
    </div>
  )
}

/** Direction (RH en écriture) : nouvelle photo, gardée dans les documents de la personne. */
function ChangerPhoto({ personneId }: { personneId: string }) {
  const ajouter = useAjouterDocument(personneId)
  const client = useQueryClient()
  const [erreur, setErreur] = useState<string | null>(null)
  return (
    <label className={`${ui.boutonSecondaire} cursor-pointer`} title={erreur ?? undefined}>
      {ajouter.isPending ? 'Envoi…' : erreur ? '⚠️ Photo refusée' : '📷 Changer la photo'}
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={ajouter.isPending}
        onChange={async (e) => {
          const brut = e.target.files?.[0]
          e.target.value = ''
          if (!brut) return
          setErreur(null)
          try {
            const reduite = await reduireImage(brut)
            const fichier = new File([reduite], brut.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
            await ajouter.mutateAsync({ fichier, genre: 'photo' })
            await client.invalidateQueries({ queryKey: ['rh', 'fiches'] })
          } catch (err) {
            setErreur(messageErreur(err))
          }
        }}
      />
    </label>
  )
}
