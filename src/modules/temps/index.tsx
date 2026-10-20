import { useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useParams, useSearchParams } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { messageErreur } from '@/lib/donnees'
import { PuceCompagnie } from '@/lib/PuceCompagnie'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { ChoixPeriode } from './commun'
import { usePeriode } from './outils'
import { nomDe, useChangerFeuille, useFeuillesAApprouver, useMembres, type Action, type FeuilleAApprouver } from './donnees'
import { nomEmploye, useChangerFeuilleEmploye, useEmployesFeuille, useEntreprises, useFeuillesPropres, type Entreprise } from './donneesEmployes'
import { FeuilleEmployes } from './Employes'
import { nomCompagnie } from './employeurD'
import { Feuille } from './Feuille'
import { FeuilleEmploye } from './FeuilleEmploye'
import { OngletBanques } from './OngletBanques'
import { formatHeures, libellePaie, libellePeriode } from './periodes'
import { TableauDeBord } from './TableauDeBord'

const onglet = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium ${
    isActive ? 'border-foret-700 text-foret-800' : 'border-transparent text-pierre-500 hover:text-pierre-800'
  }`

/**
 * Feuilles de temps de la direction. Chacun ne voit que la sienne ; les
 * admins n'en remplissent pas (décision de Maxime du 2026-10-20 : pas
 * d'onglet « Ma feuille », le module s'ouvre sur Employés) et ont le tableau
 * de bord et les feuilles de tous. La base
 * applique la même règle (schéma temps) : l'app ne fait que suivre.
 * Onglet Employés : feuille partagée des heures des employés (hors
 * direction), que toute la direction remplit ; un employé coché « Remplit
 * sa feuille » remplit la sienne (EspaceEmploye) et la soumet à la direction.
 * Onglet À approuver : feuilles soumises (employés pour la direction, plus
 * la direction pour les admins), approuvées ou renvoyées depuis la liste.
 * Onglet Banques : les banques de chacun (admins : tout le monde ; direction :
 * les employés seulement) et l'interrupteur « Heures en banque ».
 * Périodes numérotées comme Employeur D (PP21…, src/lib/periodesPaie.ts).
 */
export default function ModuleTemps() {
  const { estAdmin, estDirection, employeTemps } = useAuth()
  if (!estDirection && employeTemps) return <EspaceEmploye employeId={employeTemps} />
  return <ModuleDirection estAdmin={estAdmin} />
}

function ModuleDirection({ estAdmin }: { estAdmin: boolean }) {
  const aApprouver = useFeuillesAApprouver()
  const nb = aApprouver.data?.length ?? 0
  // La période choisie suit d'un onglet à l'autre.
  const [params] = useSearchParams()
  const periode = params.get('periode')
  const suffixe = periode ? `?periode=${periode}` : ''
  return (
    <>
      <h1 className="text-2xl font-semibold print:hidden">Feuilles de temps</h1>
      {/* Adresses absolues : voir Embarcations. */}
      <nav className="sans-barre mb-4 mt-3 flex gap-6 overflow-x-auto border-b border-pierre-200 print:hidden">
        {!estAdmin && (
          <NavLink to={`/temps${suffixe}`} end className={onglet}>
            Ma feuille
          </NavLink>
        )}
        <NavLink to={`/temps/employes${suffixe}`} className={onglet}>
          Employés
        </NavLink>
        <NavLink to={`/temps/approuver${suffixe}`} className={onglet}>
          À approuver
          {nb > 0 && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-px text-xs font-semibold text-amber-800">{nb}</span>}
        </NavLink>
        <NavLink to={`/temps/banques${suffixe}`} className={onglet}>
          Banques
        </NavLink>
        {estAdmin && (
          <NavLink to={`/temps/tableau${suffixe}`} className={onglet}>
            Tableau de bord
          </NavLink>
        )}
      </nav>
      <BandeauErreurs racine="temps" />
      <Routes>
        {/* Un admin ne remplit pas de feuille : il arrive sur Employés. */}
        <Route index element={estAdmin ? <Navigate to={`/temps/employes${suffixe}`} replace /> : <MaFeuille />} />
        <Route path="employes" element={<FeuilleEmployes />} />
        <Route path="approuver" element={<AApprouver estAdmin={estAdmin} />} />
        <Route path="banques" element={<OngletBanques estAdmin={estAdmin} />} />
        <Route path="employe/:employeId/:entrepriseId" element={<FeuilleDUnEmploye />} />
        <Route path="tableau" element={estAdmin ? <TableauDeBord /> : <Navigate to="/temps" replace />} />
        <Route path="personne/:id" element={estAdmin ? <FeuillePersonne /> : <Navigate to="/temps" replace />} />
        <Route path="*" element={<Navigate to="/temps" replace />} />
      </Routes>
    </>
  )
}

function MaFeuille() {
  const { profil } = useAuth()
  const [debut, setDebut] = usePeriode()
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <ChoixPeriode debut={debut} onChange={setDebut} />
        <button className={ui.boutonSecondaire} onClick={() => window.print()}>
          Imprimer
        </button>
      </div>
      <Feuille key={debut} userId={profil!.id} debut={debut} />
    </div>
  )
}

/** Admin : la feuille de quelqu'un d'autre, ouverte depuis le tableau de bord. */
function FeuillePersonne() {
  const { id = '' } = useParams()
  const [debut, setDebut] = usePeriode()
  const membres = useMembres()
  const personne = membres.data?.find((m) => m.id === id)
  const [params] = useSearchParams()
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 print:hidden">
        {/* Ouverte de la section Direction de l'onglet Employés : retour vers lui. */}
        {params.get('retour') === 'employes' ? (
          <Retour depuisApprouver={false} debut={debut} vers="/temps/employes" libelle="Employés" />
        ) : (
          <Retour depuisApprouver={params.get('retour') === 'approuver'} debut={debut} vers="/temps/tableau" libelle="Tableau de bord" />
        )}
        <h2 className="text-lg font-semibold">{membres.data ? nomDe(personne) : '…'}</h2>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <ChoixPeriode debut={debut} onChange={setDebut} />
        <button className={ui.boutonSecondaire} onClick={() => window.print()}>
          Imprimer
        </button>
      </div>
      <Feuille key={`${id}-${debut}`} userId={id} debut={debut} />
    </div>
  )
}

/**
 * Employé qui remplit sa feuille : seulement la sienne, une par compagnie
 * (choix en haut s'il en a plusieurs).
 */
function EspaceEmploye({ employeId }: { employeId: string }) {
  const [debut, setDebut] = usePeriode()
  const [params, setParams] = useSearchParams()
  const employes = useEmployesFeuille()
  const entreprises = useEntreprises()
  const propres = useFeuillesPropres()

  const erreur = employes.error ?? entreprises.error ?? propres.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  const employe = employes.data?.find((e) => e.id === employeId)
  if (!employes.data || !entreprises.data || !propres.data) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
  if (!employe) return <Navigate to="/" replace />

  const siennes = entreprises.data.filter((x) => employe.entreprise_ids.includes(x.id) && x.actif)
  const choisie = siennes.find((x) => x.id === params.get('compagnie')) ?? siennes[0]
  const choisir = (id: string) =>
    setParams(
      (avant) => {
        const suivants = new URLSearchParams(avant)
        suivants.set('compagnie', id)
        return suivants
      },
      { replace: true },
    )

  return (
    <>
      <h1 className="text-2xl font-semibold print:hidden">Ma feuille de temps</h1>
      <BandeauErreurs racine="temps" />
      <div className="mt-4 space-y-4">
        {siennes.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 print:hidden" role="tablist" aria-label="Compagnie">
            <span className="text-sm text-pierre-600">Une feuille par compagnie :</span>
            {siennes.map((x) => (
              <button
                key={x.id}
                role="tab"
                aria-selected={x.id === choisie?.id}
                onClick={() => choisir(x.id)}
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  x.id === choisie?.id ? 'bg-foret-700 text-white' : 'border border-pierre-300 bg-white text-pierre-700 hover:bg-pierre-50'
                }`}
              >
                {nomCompagnie(x)}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <ChoixPeriode debut={debut} onChange={setDebut} />
          <button className={ui.boutonSecondaire} onClick={() => window.print()}>
            Imprimer
          </button>
        </div>
        {choisie ? (
          <FeuilleEmploye
            key={`${choisie.id}-${debut}`}
            employe={employe}
            entreprise={choisie}
            debut={debut}
            woofing={!!propres.data.get(employe.id)}
          />
        ) : (
          <p className={`${ui.carte} px-4 py-8 text-center text-sm text-pierre-500`}>
            Aucune compagnie n'est associée à votre fiche. Demandez à la direction de l'ajouter.
          </p>
        )}
      </div>
    </>
  )
}

/** Direction : la feuille d'un employé qui remplit la sienne, ouverte depuis l'onglet Employés ou À approuver. */
function FeuilleDUnEmploye() {
  const { employeId = '', entrepriseId = '' } = useParams()
  const [debut, setDebut] = usePeriode()
  const employes = useEmployesFeuille()
  const entreprises = useEntreprises()
  const propres = useFeuillesPropres()
  const [params] = useSearchParams()
  const employe = employes.data?.find((e) => e.id === employeId)
  const entreprise = entreprises.data?.find((x) => x.id === entrepriseId)
  const erreur = employes.error ?? entreprises.error ?? propres.error
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 print:hidden">
        <Retour depuisApprouver={params.get('retour') === 'approuver'} debut={debut} vers="/temps/employes" libelle="Employés" />
        <h2 className="text-lg font-semibold">{employe ? nomEmploye(employe) : '…'}</h2>
        {entreprise && <PuceCompagnie compagnie={entreprise} court />}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <ChoixPeriode debut={debut} onChange={setDebut} />
        <button className={ui.boutonSecondaire} onClick={() => window.print()}>
          Imprimer
        </button>
      </div>
      {erreur ? (
        <p className={ui.erreur}>{messageErreur(erreur)}</p>
      ) : !employes.data || !entreprises.data || !propres.data ? (
        <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
      ) : !employe || !entreprise ? (
        <p className={ui.erreur}>Employé ou compagnie introuvable.</p>
      ) : (
        <FeuilleEmploye
          key={`${employeId}-${entrepriseId}-${debut}`}
          employe={employe}
          entreprise={entreprise}
          debut={debut}
          woofing={!!propres.data.get(employeId)}
        />
      )}
    </div>
  )
}

/** Lien de retour : vers À approuver si on vient de là, sinon vers l'onglet d'origine (même période). */
function Retour({ depuisApprouver, debut, vers, libelle }: { depuisApprouver: boolean; debut: string; vers: string; libelle: string }) {
  return depuisApprouver ? (
    <Link to="/temps/approuver" className="text-sm text-foret-700 underline">
      ← À approuver
    </Link>
  ) : (
    <Link to={`${vers}?periode=${debut}`} className="text-sm text-foret-700 underline">
      ← {libelle}
    </Link>
  )
}

const quand = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

/** Une ligne de la liste, prête à afficher. */
interface LigneAApprouver {
  feuille: FeuilleAApprouver
  nom: string
  compagnie: Entreprise | null
  qui: 'Employé' | 'Direction'
  lien: string
}

// Colonnes de largeur fixe (alignées d'une ligne à l'autre) ; sur un écran étroit, la ligne se replie.
const COL = { periode: 'xl:w-56', heures: 'xl:w-24 xl:text-right', soumise: 'xl:w-32' }

/**
 * Feuilles soumises, toutes périodes : employés qui remplissent la leur
 * (toute la direction) et direction (admins seulement, jamais la sienne :
 * temps.feuilles_a_approuver). Une ligne par feuille : personne, période,
 * total d'heures, soumission ; on l'ouvre, l'approuve ou la renvoie d'ici.
 */
function AApprouver({ estAdmin }: { estAdmin: boolean }) {
  const aApprouver = useFeuillesAApprouver()
  const employes = useEmployesFeuille()
  const entreprises = useEntreprises()
  const membres = useMembres()
  const erreur = aApprouver.error ?? employes.error ?? entreprises.error ?? membres.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!aApprouver.data || !employes.data || !entreprises.data || !membres.data)
    return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const lignes: LigneAApprouver[] = aApprouver.data.map((f) => {
    if (f.genre === 'employe') {
      const e = employes.data.find((x) => x.id === f.employe_id)
      return {
        feuille: f,
        nom: e ? nomEmploye(e) : 'Employé inconnu',
        compagnie: entreprises.data.find((x) => x.id === f.entreprise_id) ?? null,
        qui: 'Employé',
        lien: `/temps/employe/${f.employe_id}/${f.entreprise_id}?periode=${f.debut}&retour=approuver`,
      }
    }
    return {
      feuille: f,
      nom: nomDe(membres.data.find((m) => m.id === f.user_id)),
      compagnie: null,
      qui: 'Direction',
      lien: `/temps/personne/${f.user_id}?periode=${f.debut}&retour=approuver`,
    }
  })

  return (
    <div className="space-y-3">
      <p className="text-sm text-pierre-600">
        {estAdmin
          ? 'Feuilles soumises par les employés qui remplissent la leur et par la direction.'
          : 'Feuilles soumises par les employés qui remplissent la leur.'}{' '}
        Approuvez ou renvoyez d’ici, ou ouvrez la feuille pour la corriger d’abord.
      </p>
      {!lignes.length ? (
        <p className={`${ui.carte} px-4 py-8 text-center text-sm text-pierre-500`}>Aucune feuille à approuver.</p>
      ) : (
        <div className={ui.carte}>
          <div className="hidden gap-x-5 border-b border-pierre-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-pierre-500 xl:flex">
            <span className="flex-1">Personne</span>
            <span className={COL.periode}>Période</span>
            <span className={COL.heures}>Heures</span>
            <span className={COL.soumise}>Soumise le</span>
            <span className="w-[18.5rem]" />
          </div>
          <ul className="divide-y divide-pierre-100">
            {lignes.map((l) => (
              <LigneFeuille key={l.feuille.feuille_id} ligne={l} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function LigneFeuille({ ligne }: { ligne: LigneAApprouver }) {
  const changer = useChangerFeuille()
  const changerEmploye = useChangerFeuilleEmploye()
  const [renvoi, setRenvoi] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const f = ligne.feuille

  const agir = async (action: Action, texte?: string) => {
    setErreur(null)
    setEnCours(true)
    try {
      if (f.genre === 'employe')
        await changerEmploye.mutateAsync({ employeId: f.employe_id!, entrepriseId: f.entreprise_id!, debut: f.debut, action, texte })
      else await changer.mutateAsync({ userId: f.user_id!, debut: f.debut, action, texte })
      setRenvoi(null)
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 xl:flex-nowrap">
        <div className="min-w-40 flex-1">
          <Link to={ligne.lien} className="font-medium text-pierre-900 underline decoration-pierre-300 hover:text-foret-700">
            {ligne.nom}
          </Link>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-pierre-500">
            {ligne.compagnie && <PuceCompagnie compagnie={ligne.compagnie} court className="px-1.5! py-px!" />}
            {ligne.qui}
          </span>
        </div>
        <div className={`text-sm whitespace-nowrap ${COL.periode}`}>
          <span className="font-medium">{libellePeriode(f.debut)}</span>
          <span className="block text-xs text-pierre-500">{libellePaie(f.debut)}</span>
        </div>
        <div className={`text-sm whitespace-nowrap tabular-nums ${COL.heures}`}>
          <b>{formatHeures(f.heures)} h</b>
          {f.woofing > 0 && <span className="block text-xs text-pierre-500">+ {formatHeures(f.woofing)} h woofing</span>}
        </div>
        <div className={`text-sm whitespace-nowrap text-pierre-600 ${COL.soumise}`}>
          <span className="xl:hidden">Soumise le </span>
          {quand(f.soumise_le)}
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto xl:w-[18.5rem] xl:flex-nowrap xl:justify-end">
          <Link to={ligne.lien} className={ui.boutonSecondaire}>
            Ouvrir
          </Link>
          {renvoi == null && (
            <>
              <button className={ui.bouton} disabled={enCours} onClick={() => agir('approuver')}>
                Approuver
              </button>
              <button className={ui.boutonSecondaire} disabled={enCours} onClick={() => setRenvoi('')}>
                Renvoyer…
              </button>
            </>
          )}
        </div>
      </div>
      {renvoi != null && (
        <form
          className="space-y-2 xl:ml-auto xl:max-w-xl"
          onSubmit={(e) => {
            e.preventDefault()
            if (renvoi.trim()) agir('renvoyer', renvoi)
          }}
        >
          <label className={ui.etiquette} htmlFor={`renvoi-${f.feuille_id}`}>
            Pourquoi la renvoyer ?
          </label>
          <textarea
            id={`renvoi-${f.feuille_id}`}
            autoFocus
            className={`${ui.champ} min-h-16`}
            placeholder="Ex. il manque les heures de mardi."
            value={renvoi}
            onChange={(e) => setRenvoi(e.target.value)}
          />
          <div className="flex gap-2">
            <button type="submit" className={ui.bouton} disabled={enCours || !renvoi.trim()}>
              Renvoyer
            </button>
            <button type="button" className="text-sm text-pierre-500" onClick={() => setRenvoi(null)}>
              Annuler
            </button>
          </div>
        </form>
      )}
      {erreur && <p className={ui.erreur}>{erreur}</p>}
    </li>
  )
}
