import { Link, Navigate, NavLink, Route, Routes, useParams, useSearchParams } from 'react-router'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { messageErreur } from '@/lib/donnees'
import { PuceCompagnie } from '@/lib/PuceCompagnie'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { ChoixPeriode } from './commun'
import { usePeriode } from './outils'
import { nomDe, useAApprouver, useMembres } from './donnees'
import { nomEmploye, useEmployesFeuille, useEntreprises } from './donneesEmployes'
import { FeuilleEmployes } from './Employes'
import { Feuille } from './Feuille'
import { FeuilleEmploye } from './FeuilleEmploye'
import { libellePeriode } from './periodes'
import { TableauDeBord } from './TableauDeBord'

const onglet = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium ${
    isActive ? 'border-foret-700 text-foret-800' : 'border-transparent text-pierre-500 hover:text-pierre-800'
  }`

/**
 * Feuilles de temps de la direction. Chacun ne voit que la sienne ; les
 * admins ont en plus le tableau de bord et les feuilles de tous. La base
 * applique la même règle (schéma temps) : l'app ne fait que suivre.
 * Onglet Employés : feuille partagée des heures des employés (hors
 * direction), que toute la direction remplit ; un employé coché « Remplit
 * sa feuille » remplit la sienne (EspaceEmploye) et la soumet à la direction.
 * Onglet À approuver : feuilles soumises (employés pour la direction, plus
 * la direction pour les admins).
 */
export default function ModuleTemps() {
  const { estAdmin, estDirection, employeTemps } = useAuth()
  if (!estDirection && employeTemps) return <EspaceEmploye employeId={employeTemps} />
  return <ModuleDirection estAdmin={estAdmin} />
}

function ModuleDirection({ estAdmin }: { estAdmin: boolean }) {
  const aApprouver = useAApprouver(estAdmin)
  const nb = (aApprouver.data?.employes.length ?? 0) + (aApprouver.data?.direction.length ?? 0)
  // La période choisie suit d'un onglet à l'autre.
  const [params] = useSearchParams()
  const periode = params.get('periode')
  const suffixe = periode ? `?periode=${periode}` : ''
  return (
    <>
      <h1 className="text-2xl font-semibold print:hidden">Feuilles de temps</h1>
      {/* Adresses absolues : voir Embarcations. */}
      <nav className="sans-barre mb-4 mt-3 flex gap-6 overflow-x-auto border-b border-pierre-200 print:hidden">
        <NavLink to={`/temps${suffixe}`} end className={onglet}>
          Ma feuille
        </NavLink>
        <NavLink to={`/temps/employes${suffixe}`} className={onglet}>
          Employés
        </NavLink>
        <NavLink to={`/temps/approuver${suffixe}`} className={onglet}>
          À approuver
          {nb > 0 && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-px text-xs font-semibold text-amber-800">{nb}</span>}
        </NavLink>
        {estAdmin && (
          <NavLink to={`/temps/tableau${suffixe}`} className={onglet}>
            Tableau de bord
          </NavLink>
        )}
      </nav>
      <BandeauErreurs racine="temps" />
      <Routes>
        <Route index element={<MaFeuille />} />
        <Route path="employes" element={<FeuilleEmployes />} />
        <Route path="approuver" element={<AApprouver estAdmin={estAdmin} />} />
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
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 print:hidden">
        <Link to={`/temps/tableau?periode=${debut}`} className="text-sm text-foret-700 underline">
          ← Tableau de bord
        </Link>
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

  const erreur = employes.error ?? entreprises.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  const employe = employes.data?.find((e) => e.id === employeId)
  if (!employes.data || !entreprises.data) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
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
                {x.nom}
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
          <FeuilleEmploye key={`${choisie.id}-${debut}`} employe={employe} entreprise={choisie} debut={debut} />
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
  const employe = employes.data?.find((e) => e.id === employeId)
  const entreprise = entreprises.data?.find((x) => x.id === entrepriseId)
  const erreur = employes.error ?? entreprises.error
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 print:hidden">
        <Link to={`/temps/employes?periode=${debut}`} className="text-sm text-foret-700 underline">
          ← Employés
        </Link>
        <h2 className="text-lg font-semibold">{employe ? nomEmploye(employe) : '…'}</h2>
        {entreprise && <PuceCompagnie compagnie={entreprise} />}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <ChoixPeriode debut={debut} onChange={setDebut} />
        <button className={ui.boutonSecondaire} onClick={() => window.print()}>
          Imprimer
        </button>
      </div>
      {erreur ? (
        <p className={ui.erreur}>{messageErreur(erreur)}</p>
      ) : !employes.data || !entreprises.data ? (
        <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
      ) : !employe || !entreprise ? (
        <p className={ui.erreur}>Employé ou compagnie introuvable.</p>
      ) : (
        <FeuilleEmploye key={`${employeId}-${entrepriseId}-${debut}`} employe={employe} entreprise={entreprise} debut={debut} />
      )}
    </div>
  )
}

/** Feuilles soumises, toutes périodes : employés (toute la direction) et direction (admins). */
function AApprouver({ estAdmin }: { estAdmin: boolean }) {
  const aApprouver = useAApprouver(estAdmin)
  const employes = useEmployesFeuille()
  const entreprises = useEntreprises()
  const membres = useMembres()
  const erreur = aApprouver.error ?? employes.error ?? entreprises.error ?? membres.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!aApprouver.data || !employes.data || !entreprises.data || !membres.data)
    return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const lignes = [
    ...aApprouver.data.employes.map((f) => {
      const e = employes.data.find((x) => x.id === f.employe_id)
      return {
        cle: f.id,
        debut: f.debut,
        nom: e ? nomEmploye(e) : 'Employé inconnu',
        compagnie: entreprises.data.find((x) => x.id === f.entreprise_id) ?? null,
        qui: 'Employé',
        lien: `/temps/employe/${f.employe_id}/${f.entreprise_id}?periode=${f.debut}`,
      }
    }),
    ...aApprouver.data.direction.map((f) => ({
      cle: f.id,
      debut: f.debut,
      nom: nomDe(membres.data.find((m) => m.id === f.user_id)),
      compagnie: null,
      qui: 'Direction',
      lien: `/temps/personne/${f.user_id}?periode=${f.debut}`,
    })),
  ].sort((a, b) => a.debut.localeCompare(b.debut) || a.nom.localeCompare(b.nom, 'fr'))

  return (
    <div className="space-y-3">
      <p className="text-sm text-pierre-600">
        {estAdmin
          ? 'Feuilles soumises par les employés et par la direction.'
          : 'Feuilles soumises par les employés qui remplissent la leur.'}{' '}
        Ouvrez une feuille pour la corriger, l'approuver ou la renvoyer.
      </p>
      {!lignes.length ? (
        <p className={`${ui.carte} px-4 py-8 text-center text-sm text-pierre-500`}>Aucune feuille à approuver.</p>
      ) : (
        <div className={`${ui.carte} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-pierre-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Période</th>
                <th className="px-3 py-2 text-left font-medium">Personne</th>
                <th className="px-3 py-2 text-left font-medium">Compagnie</th>
                <th className="px-3 py-2 text-left font-medium">Feuille</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-pierre-100">
              {lignes.map((l) => (
                <tr key={l.cle} className="hover:bg-pierre-50">
                  <td className="px-3 py-2 whitespace-nowrap">{libellePeriode(l.debut)}</td>
                  <td className="px-3 py-2 font-medium">{l.nom}</td>
                  <td className="px-3 py-2">{l.compagnie && <PuceCompagnie compagnie={l.compagnie} />}</td>
                  <td className="px-3 py-2 text-pierre-600">{l.qui}</td>
                  <td className="px-3 py-2 text-right">
                    <Link to={l.lien} className="font-medium text-foret-700 underline">
                      Ouvrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
