import { useMemo, useState } from 'react'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { etatBanqueHeures, HEURES_FERIE, SEUIL_SEMAINE, type Mouvement } from './banques'
import { FenetreAjustement, TableHistorique } from './BanquesFeuille'
import { banqueDe, heuresActivesParDefaut, nomDe, useBanquesTous, useMembres, useReglerBanqueHeures, type Titulaire } from './donnees'
import { nomEmploye, useEmployesFeuille, useFeuillesPropres } from './donneesEmployes'
import { libelleEtatHeures, menu, periodeCourante } from './outils'
import { aujourdhui, dateCourte, formatHeures, libellePeriode } from './periodes'

type Groupe = 'direction' | 'compte' | 'sans-compte'

const TITRES: Record<Groupe, string> = {
  direction: 'Direction et admins',
  compte: 'Employés qui remplissent leur feuille',
  'sans-compte': 'Employés sans compte (onglet Employés)',
}

interface LigneBanque {
  cle: string
  titulaire: Titulaire
  nom: string
  detail: string
  groupe: Groupe
  actif: boolean
  mouvements: Mouvement[]
  heures: number
  etat: { active: boolean; depuis: string | null }
}

const bouton = `${ui.boutonSecondaire} whitespace-nowrap px-2.5! py-1.5!`

/**
 * Onglet Banques : une ligne par personne qui a ou peut avoir une banque
 * d'heures, avec son solde à ce jour, l'interrupteur « Heures en banque »,
 * les ajustements et l'historique (vacances et maladie : Employeur D). Admins : tout le monde ;
 * direction : seulement les employés (jamais un autre membre de la
 * direction — la base ne lui renvoie rien d'eux). L'interrupteur ne se
 * change que par un admin (temps.regler_banque_heures).
 */
export function OngletBanques({ estAdmin }: { estAdmin: boolean }) {
  const au = aujourdhui()
  const donnees = useBanquesTous(au)
  const membres = useMembres()
  const employes = useEmployesFeuille()
  const propres = useFeuillesPropres()
  const [recherche, setRecherche] = useState('')
  const [avecBanque, setAvecBanque] = useState(false)
  const [ouverte, setOuverte] = useState<string | null>(null)
  const [fenetre, setFenetre] = useState<LigneBanque | null>(null)

  const lignes = useMemo(() => {
    if (!donnees.data || !membres.data || !employes.data || !propres.data) return null
    const d = donnees.data
    const calculer = (t: Titulaire) => {
      const { mouvements, etats } = banqueDe(d, t, au)
      return { mouvements, heures: mouvements.at(-1)?.solde ?? 0, etat: etatBanqueHeures(etats, heuresActivesParDefaut(t), au) }
    }

    const resultat: LigneBanque[] = []
    // Direction et admins : seulement pour un admin (la base ne donne rien d'autre à la direction).
    if (estAdmin)
      for (const m of membres.data) {
        if (m.role !== 'admin' && m.role !== 'direction') continue
        const t: Titulaire = { userId: m.id }
        const c = calculer(t)
        if (!m.actif && !c.mouvements.length) continue
        resultat.push({
          cle: `u:${m.id}`,
          titulaire: t,
          nom: nomDe(m),
          detail: m.role === 'admin' ? 'Admin' : 'Direction',
          groupe: 'direction',
          actif: m.actif,
          ...c,
        })
      }
    for (const e of employes.data) {
      const compte = propres.data.has(e.id)
      const t: Titulaire = { employeId: e.id }
      const c = calculer(t)
      // Inactif : seulement s'il lui reste quelque chose en banque.
      if (!e.actif && !c.heures) continue
      resultat.push({
        cle: `e:${e.id}`,
        titulaire: t,
        nom: nomEmploye(e),
        detail: [e.nom_complet ? e.surnom : null, e.poste].filter(Boolean).join(' · '),
        groupe: compte ? 'compte' : 'sans-compte',
        actif: e.actif,
        ...c,
      })
    }
    return resultat.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  }, [donnees.data, membres.data, employes.data, propres.data, estAdmin, au])

  const erreur = donnees.error ?? membres.error ?? employes.error ?? propres.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!lignes) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const mots = recherche.trim().toLocaleLowerCase('fr')
  const visibles = lignes.filter((l) => {
    if (mots && ![l.nom, l.detail].some((t) => t.toLocaleLowerCase('fr').includes(mots))) return false
    if (avecBanque && !l.etat.active && !l.heures) return false
    return true
  })
  const groupes = (['direction', 'compte', 'sans-compte'] as Groupe[])
    .map((g) => ({ groupe: g, lignes: visibles.filter((l) => l.groupe === g) }))
    .filter((g) => g.lignes.length)

  return (
    <div className="space-y-4">
      <div className={`${ui.carte} space-y-1 px-4 py-3 text-sm text-pierre-700`}>
        <p>
          Soldes au <b>{dateCourte(au)}</b>. <b>Heures accumulées</b> : heures régulières au-delà de {SEUIL_SEMAINE} h par
          semaine ({HEURES_FERIE} h de moins par férié), heure pour heure, quand la mise en banque est activée ; heures prises en banque déduites. Vacances et
          maladie : les soldes sont dans Employeur D.
        </p>
        <p className="text-pierre-600">
          Mise en banque : activée par défaut pour la direction et les admins, désactivée pour les employés.
          {estAdmin ? ' Un changement vaut' : ' Seul un admin la change ; un changement vaut'} à partir de la période en
          cours ({libellePeriode(periodeCourante())}) ; les périodes passées ne bougent pas. Désactivée : plus rien ne
          s’ajoute, le solde reste et peut encore être pris ou ajusté. Un employé n’a la ligne « Prises en banque » (dans sa
          feuille, ou dans l’onglet Employés s’il n’a pas de compte) que si sa mise en banque est activée ou s’il a un solde.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 print:hidden">
        <input
          type="search"
          aria-label="Chercher une personne"
          placeholder="Chercher une personne…"
          className={`${menu} w-56`}
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-pierre-700">
          <input type="checkbox" checked={avecBanque} onChange={(e) => setAvecBanque(e.target.checked)} />
          Seulement une banque activée ou un solde
        </label>
      </div>

      {!groupes.length ? (
        <p className={`${ui.carte} px-4 py-8 text-center text-sm text-pierre-500`}>Personne ne correspond.</p>
      ) : (
        groupes.map((g) => (
          <section key={g.groupe} className={ui.carte}>
            <h2 className="border-b border-pierre-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-pierre-600">
              {TITRES[g.groupe]} <span className="font-normal text-pierre-400">({g.lignes.length})</span>
            </h2>
            <div className="hidden gap-x-5 border-b border-pierre-100 px-4 py-2 text-xs font-medium uppercase tracking-wide text-pierre-500 xl:flex">
              <span className="flex-1">Personne</span>
              <span className="w-28 text-right">Heures accumulées</span>
              <span className="w-56">Heures en banque</span>
              <span className="w-[20rem]" />
            </div>
            <ul className="divide-y divide-pierre-100">
              {g.lignes.map((l) => (
                <Rangee
                  key={l.cle}
                  ligne={l}
                  estAdmin={estAdmin}
                  historique={ouverte === l.cle}
                  basculer={() => setOuverte(ouverte === l.cle ? null : l.cle)}
                  ouvrir={() => setFenetre(l)}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {fenetre && <FenetreAjustement titulaire={fenetre.titulaire} nom={fenetre.nom} fermer={() => setFenetre(null)} />}
    </div>
  )
}

function Rangee({
  ligne: l,
  estAdmin,
  historique,
  basculer,
  ouvrir,
}: {
  ligne: LigneBanque
  estAdmin: boolean
  historique: boolean
  basculer: () => void
  ouvrir: () => void
}) {
  const regler = useReglerBanqueHeures()
  const [erreur, setErreur] = useState<string | null>(null)
  const montant = (n: number) => <span className={`tabular-nums ${n < 0 ? 'text-red-700' : ''}`}>{formatHeures(n)} h</span>

  const changer = async () => {
    const active = !l.etat.active
    const periode = libellePeriode(periodeCourante())
    if (
      !(await confirmer({
        titre: `${active ? 'Activer' : 'Désactiver'} la mise en banque des heures de ${l.nom} ?`,
        message: active
          ? `À partir de ${periode} (période en cours), ses heures régulières au-delà de ${SEUIL_SEMAINE} h par semaine (${HEURES_FERIE} h de moins par férié) s’ajoutent à sa banque, heure pour heure. Les périodes passées ne changent pas.`
          : `À partir de ${periode} (période en cours), plus rien ne s’ajoute à sa banque. Son solde (${formatHeures(l.heures)} h) reste et peut encore être pris ou ajusté.`,
        libelleOk: active ? 'Activer' : 'Désactiver',
        danger: false,
      }))
    )
      return
    setErreur(null)
    regler.mutate({ titulaire: l.titulaire, active }, { onError: (e) => setErreur(messageErreur(e)) })
  }

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 xl:flex-nowrap">
        <div className="min-w-44 flex-1">
          <span className="font-medium text-pierre-900">{l.nom}</span>
          {!l.actif && <span className="ml-1 text-xs text-pierre-400">(inactif)</span>}
          {l.detail && <span className="block text-xs text-pierre-500">{l.detail}</span>}
        </div>
        <div className="w-28 text-sm xl:text-right">
          <span className="text-xs text-pierre-500 xl:hidden">Accumulées </span>
          {montant(l.heures)}
        </div>
        <div className="w-56 text-sm">
          {estAdmin ? (
            <button
              type="button"
              role="switch"
              aria-checked={l.etat.active}
              aria-label={`Heures en banque, ${l.nom}`}
              disabled={regler.isPending}
              onClick={changer}
              className="flex items-center gap-2 text-left disabled:opacity-50"
            >
              <span
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${l.etat.active ? 'bg-foret-600' : 'bg-pierre-300'}`}
              >
                <span
                  className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${l.etat.active ? 'translate-x-4' : 'translate-x-0.5'}`}
                />
              </span>
              <span className="text-xs text-pierre-700">{libelleEtatHeures(l.etat)}</span>
            </button>
          ) : (
            <span className="text-xs text-pierre-700">
              <span className={`mr-1 inline-block size-2 rounded-full ${l.etat.active ? 'bg-foret-600' : 'bg-pierre-300'}`} />
              Mise en banque {libelleEtatHeures(l.etat)}
            </span>
          )}
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto xl:w-[20rem] xl:flex-nowrap xl:justify-end">
          <button className={bouton} onClick={ouvrir}>
            Ajuster…
          </button>
          <button className="text-sm whitespace-nowrap text-foret-700 underline" onClick={basculer}>
            {historique ? 'Masquer' : 'Historique'}
          </button>
        </div>
      </div>
      {erreur && <p className={ui.erreur}>{erreur}</p>}
      {historique && (
        <div className="max-h-80 max-w-3xl overflow-y-auto rounded-lg border border-pierre-100 px-3 py-2">
          <TableHistorique mouvements={l.mouvements} />
        </div>
      )}
    </li>
  )
}
