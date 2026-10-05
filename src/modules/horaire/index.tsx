import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { IconeAttention, IconeDossier, IconeModele, IconeReglages, IconeSemaine } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { Conflits } from './Conflits'
import { Conges } from './Conges'
import { Construire } from './Construire'
import { ContexteSemaine, useSemaine, type Semaine } from './contexte'
import { PageDossiers } from './Dossiers'
import { useAjouterAnimateurs, useAnimateurs, useDossiers, useEditeurSemaine, useHoraires, useReferentielVide, useReglages } from './donnees'
import { analyseConges, analyseSoirees, ANIMATEURS_ORIGINE, conflitsGrille } from './logique'
import { PageReglages } from './Reglages'
import type { DemandeNouvel } from './emplacements'
import { BarreSemaine, NouvelHoraire } from './Semaines'
import { Soirees } from './Soirees'
import { Specialiste } from './Specialiste'
import { META_TAG, TAGS } from './types'

const CLE_SEMAINE = 'horaire-semaine-active'
const lireSemaineActive = () => {
  try {
    return localStorage.getItem(CLE_SEMAINE)
  } catch {
    return null
  }
}

type Page = 'semaine' | 'dossiers' | 'reglages'

export default function ModuleHoraire() {
  const { peutEcrire } = useAuth()
  const ecriture = peutEcrire('horaire')
  const horaires = useHoraires()
  const { dossiers, connus } = useDossiers()
  const reglages = useReglages()
  const animateurs = useAnimateurs()
  const referentielVide = useReferentielVide()
  // Lien direct vers un horaire (depuis le Calendrier des opérations) :
  // /horaire?semaine=<id> l'ouvre, puis le paramètre est retiré de l'adresse.
  const [params, setParams] = useSearchParams()
  const [choisie, setChoisie] = useState<string | null>(() => params.get('semaine') ?? lireSemaineActive())
  useEffect(() => {
    setParams(
      (p) => {
        if (!p.has('semaine')) return p
        const n = new URLSearchParams(p)
        n.delete('semaine')
        return n
      },
      { replace: true },
    )
  }, [setParams])
  const [demande, setDemande] = useState<DemandeNouvel | null>(null)
  const [reglagesModifies, setReglagesModifies] = useState(false)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const page: Page = pathname.startsWith('/horaire/dossiers') ? 'dossiers' : pathname.startsWith('/horaire/reglages') ? 'reglages' : 'semaine'

  // Semaine d'un dossier supprimé ailleurs (liste pas encore rechargée) :
  // elle est « Sans dossier », comme dans la base.
  const liste = useMemo(() => {
    const l = horaires.data ?? []
    return connus ? l.map((h) => (h.dossier_id && !connus.has(h.dossier_id) ? { ...h, dossier_id: null } : h)) : l
  }, [horaires.data, connus])

  // Semaine ouverte : celle choisie si elle existe encore, sinon la première
  // semaine (les modèles en dernier recours).
  const active = liste.find((h) => h.id === choisie)?.id ?? (liste.find((h) => !h.modele) ?? liste[0])?.id ?? null
  const choisir = (id: string) => {
    setChoisie(id)
    try {
      localStorage.setItem(CLE_SEMAINE, id)
    } catch {
      /* préférence non conservée */
    }
  }
  /** Ouvre une semaine ou un modèle dans la grille. */
  const ouvrir = (id: string) => {
    choisir(id)
    if (page !== 'semaine') navigate('/horaire')
  }

  const editeur = useEditeurSemaine(active)
  // Un séjour court peut avoir ses propres nuits avec soirées.
  const nuits = editeur.etat?.nuits
  const reglagesSemaine = useMemo(() => (nuits ? { ...reglages, nuits } : reglages), [reglages, nuits])
  const semaine: Semaine | null =
    editeur.horaire && editeur.etat
      ? {
          horaire: editeur.horaire,
          etat: editeur.etat,
          modifier: editeur.modifier,
          remplacer: editeur.remplacer,
          statut: editeur.statut,
          reessayer: () => void editeur.envoyer(),
          reglages: reglagesSemaine,
          animateurs,
          ecriture,
        }
      : null

  if (horaires.error) return <p className={ui.erreur}>{messageErreur(horaires.error)}</p>
  if (!horaires.data) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  return (
    <div>
      <EnteteModule
        page={page}
        modeleOuvert={!!liste.find((h) => h.id === active)?.modele}
        ecriture={ecriture}
        reglagesModifies={page === 'reglages' && reglagesModifies}
      />
      <BandeauErreurs racine="horaire" />
      {referentielVide && <AucunAnimateur />}
      <Routes>
        <Route
          path="dossiers"
          element={<PageDossiers liste={liste} dossiers={dossiers} active={active} ecriture={ecriture} ouvrir={ouvrir} nouveau={setDemande} />}
        />
        <Route path="reglages" element={ecriture ? <PageReglages surModif={setReglagesModifies} /> : <Navigate to="/horaire" replace />} />
        <Route
          path="*"
          element={
            <>
              <BarreSemaine
                liste={liste}
                dossiers={dossiers}
                active={active}
                choisir={choisir}
                semaine={semaine}
                ecriture={ecriture}
                nouveau={setDemande}
              />
              {liste.length === 0 ? (
                <p className={`${ui.carte} p-10 text-center text-sm text-pierre-500`}>
                  Aucune semaine pour l'instant.{' '}
                  {ecriture ? "Créez-en une (vide ou à partir d'un modèle) ou importez un classeur Excel." : ''}
                </p>
              ) : !semaine ? (
                editeur.erreur ? (
                  <p className={ui.erreur}>{messageErreur(editeur.erreur)}</p>
                ) : (
                  <p className="py-8 text-center text-sm text-pierre-500">Chargement de la semaine…</p>
                )
              ) : (
                <ContexteSemaine.Provider value={semaine}>
                  <Onglets />
                  <Routes>
                    <Route index element={<Construire />} />
                    <Route path="conflits" element={<Conflits />} />
                    {TAGS.map((t) => (
                      <Route key={t} path={t} element={<Specialiste tag={t} />} />
                    ))}
                    <Route path="conges" element={<Conges />} />
                    <Route path="soirees" element={<Soirees />} />
                    <Route path="*" element={<Navigate to="/horaire" replace />} />
                  </Routes>
                </ContexteSemaine.Provider>
              )}
            </>
          }
        />
      </Routes>
      {demande && (
        <NouvelHoraire
          key={`${demande.modele}|${demande.depart ?? ''}|${demande.dossier ?? ''}`}
          liste={liste}
          dossiers={dossiers}
          modele={demande.modele}
          departInitial={demande.depart ?? ''}
          dossierInitial={demande.dossier ?? null}
          semaine={semaine}
          ouvrir={ouvrir}
          fermer={() => setDemande(null)}
        />
      )}
    </div>
  )
}

/**
 * En-tête du module : le titre, et à droite les trois espaces de l'horaire —
 * la semaine ouverte (grille), le rangement (dossiers et modèles), les réglages.
 */
function EnteteModule({
  page,
  modeleOuvert,
  ecriture,
  reglagesModifies,
}: {
  page: Page
  modeleOuvert: boolean
  ecriture: boolean
  /** Réglages modifiés et pas enregistrés : on demande avant de quitter la page. */
  reglagesModifies: boolean
}) {
  const navigate = useNavigate()
  const espaces = [
    { page: 'semaine' as const, chemin: '/horaire', libelle: modeleOuvert ? 'Modèle ouvert' : 'Semaine', icone: modeleOuvert ? <IconeModele /> : <IconeSemaine /> },
    { page: 'dossiers' as const, chemin: '/horaire/dossiers', libelle: 'Dossiers et modèles', icone: <IconeDossier /> },
    ...(ecriture ? [{ page: 'reglages' as const, chemin: '/horaire/reglages', libelle: 'Réglages', icone: <IconeReglages /> }] : []),
  ]
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
      <h1 className="text-2xl font-semibold">Horaire d'animation</h1>
      <nav aria-label="Espaces de l'horaire" className="ml-auto inline-flex rounded-lg border border-pierre-200 bg-pierre-100 p-0.5">
        {espaces.map((e) => (
          <Link
            key={e.page}
            to={e.chemin}
            aria-current={page === e.page ? 'page' : undefined}
            onClick={async (clic) => {
              if (!reglagesModifies || e.page === 'reglages') return
              clic.preventDefault()
              const quitter = await confirmer({
                titre: 'Quitter sans enregistrer ?',
                message: 'Les réglages modifiés ne sont pas enregistrés.',
                libelleOk: 'Quitter',
                icone: <IconeAttention className="size-5" />,
              })
              if (quitter) navigate(e.chemin)
            }}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
              page === e.page ? 'bg-white text-pierre-900 shadow-sm' : 'text-pierre-600 hover:text-pierre-900'
            }`}
          >
            {e.icone}
            {e.libelle}
          </Link>
        ))}
      </nav>
    </div>
  )
}

/** Le référentiel des employés est vide : les menus d'animateurs le seraient aussi. */
function AucunAnimateur() {
  const { estDirection } = useAuth()
  const ajouter = useAjouterAnimateurs()
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 print:hidden">
      <span className="flex-1">
        Aucun animateur dans le référentiel des employés : les menus d'animateurs sont vides.
      </span>
      {estDirection ? (
        <button className={ui.bouton} disabled={ajouter.isPending} onClick={() => ajouter.mutate(ANIMATEURS_ORIGINE)}>
          {ajouter.isPending ? 'Ajout…' : `Ajouter les ${ANIMATEURS_ORIGINE.length} animateurs de l'ancienne liste`}
        </button>
      ) : (
        <span>Demandez à la direction d'ajouter les employés.</span>
      )}
    </div>
  )
}

// ------------------------------------------------------------------
// Onglets, avec le nombre de conflits bloquants
// ------------------------------------------------------------------

function Onglets() {
  const badges = useBadges()
  const onglets = [
    { chemin: '/horaire', libelle: 'Construire', fin: true },
    { chemin: '/horaire/conflits', libelle: 'Conflits', badge: badges.grille },
    ...TAGS.map((t) => ({ chemin: `/horaire/${t}`, libelle: `${META_TAG[t].icone} ${META_TAG[t].libelle}` })),
    { chemin: '/horaire/conges', libelle: 'Congés & remplacements', badge: badges.conges },
    { chemin: '/horaire/soirees', libelle: 'Soirées 🌙', badge: badges.soirees },
  ]
  return (
    <nav className="sans-barre mb-4 flex gap-5 overflow-x-auto border-b border-pierre-200 print:hidden">
      {onglets.map((o) => (
        <NavLink
          key={o.chemin}
          to={o.chemin}
          end={'fin' in o}
          className={({ isActive }) =>
            `flex items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium ${
              isActive ? 'border-foret-700 text-foret-800' : 'border-transparent text-pierre-500 hover:text-pierre-800'
            }`
          }
        >
          {o.libelle}
          {'badge' in o && !!o.badge && (
            <span className="rounded-full bg-[#d03b3b] px-1.5 text-xs font-semibold text-white" aria-label={`${o.badge} conflit(s)`}>
              {o.badge}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function useBadges() {
  const { etat, reglages } = useSemaine()
  return useMemo(
    () => ({
      grille: conflitsGrille(etat, reglages).conflits.filter((c) => c.sev === 'err').length,
      conges: analyseConges(etat).conflits.filter((c) => c.sev === 'err').length,
      soirees: analyseSoirees(etat, reglages).conflits.filter((c) => c.sev === 'err').length,
    }),
    [etat, reglages],
  )
}
