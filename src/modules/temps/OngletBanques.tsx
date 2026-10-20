import { useState } from 'react'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { HEURES_FERIE, SEUIL_ALERTE, SEUIL_SEMAINE } from './banques'
import { FenetreAjustement, TableHistorique } from './BanquesFeuille'
import { useReglerBanqueHeures } from './donnees'
import { libelleEtatHeures, menu, periodeCourante } from './outils'
import { dateCourte, formatHeures, libellePeriode } from './periodes'
import { useSoldesBanques, type GroupeBanque, type SoldeBanque } from './soldes'

const TITRES: Record<GroupeBanque, string> = {
  direction: 'Direction et admins',
  compte: 'Employés qui remplissent leur feuille',
  'sans-compte': 'Employés sans compte (onglet Employés)',
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
  const soldes = useSoldesBanques(estAdmin)
  const au = soldes.au
  const [recherche, setRecherche] = useState('')
  const [avecBanque, setAvecBanque] = useState(false)
  const [ouverte, setOuverte] = useState<string | null>(null)
  const [fenetre, setFenetre] = useState<SoldeBanque | null>(null)

  if (soldes.error) return <p className={ui.erreur}>{messageErreur(soldes.error)}</p>
  const lignes = soldes.data
  if (!lignes) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const mots = recherche.trim().toLocaleLowerCase('fr')
  const visibles = lignes.filter((l) => {
    if (mots && ![l.nom, l.detail].some((t) => t.toLocaleLowerCase('fr').includes(mots))) return false
    if (avecBanque && !l.etat.active && !l.heures) return false
    return true
  })
  const sousSeuil = lignes.filter((l) => l.alerte)
  const groupes = (['direction', 'compte', 'sans-compte'] as GroupeBanque[])
    .map((g) => ({ groupe: g, lignes: visibles.filter((l) => l.groupe === g) }))
    .filter((g) => g.lignes.length)

  return (
    <div className="space-y-4">
      <div className={`${ui.carte} space-y-1 px-4 py-3 text-sm text-pierre-700`}>
        <p>
          Soldes au <b>{dateCourte(au)}</b>. La banque se calcule seule quand la mise en banque est activée : les heures
          régulières au-delà des heures attendues ({SEUIL_SEMAINE} h par semaine, {HEURES_FERIE} h de moins par férié)
          s’y ajoutent, heure pour heure ; une semaine finie sous les heures attendues (régulières, vacances et maladie
          comptées), le manque en est tiré et payé. Vacances et maladie : les soldes sont dans Employeur D.
        </p>
        <p className="text-pierre-600">
          Mise en banque : désactivée par défaut pour tout le monde, quel que soit le rôle ; un admin l’active.
          {estAdmin ? ' Un changement vaut' : ' Seul un admin la change ; un changement vaut'} à partir de la période en
          cours ({libellePeriode(periodeCourante())}) ; les périodes passées ne bougent pas. Désactivée : rien ne s’ajoute
          ni ne se retire, le solde reste et ne change plus que par un ajustement.
        </p>
      </div>

      {estAdmin && sousSeuil.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>
            {sousSeuil.length > 1 ? `${sousSeuil.length} banques sous ${SEUIL_ALERTE} h` : `Une banque sous ${SEUIL_ALERTE} h`}
          </b>{' '}
          : {sousSeuil.map((l) => `${l.nom} (${formatHeures(l.heures)} h)`).join(', ')}.
        </div>
      )}

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
  ligne: SoldeBanque
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
          ? `À partir de ${periode} (période en cours), ses heures régulières au-delà de ${SEUIL_SEMAINE} h par semaine (${HEURES_FERIE} h de moins par férié) s’ajoutent à sa banque, heure pour heure, et le manque d’une semaine finie en est tiré. Les périodes passées ne changent pas.`
          : `À partir de ${periode} (période en cours), rien ne s’ajoute ni ne se retire de sa banque. Son solde (${formatHeures(l.heures)} h) reste et ne change plus que par un ajustement.`,
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
          {l.alerte && (
            <span
              className={`mt-0.5 block w-fit rounded-full px-1.5 py-px text-xs font-medium xl:ml-auto ${l.heures < 0 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}
            >
              {l.heures < 0 ? 'négative' : `sous ${SEUIL_ALERTE} h`}
            </span>
          )}
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
