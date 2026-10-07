import { useState, type ReactNode } from 'react'
import { BoutonSupprimer } from '@/lib/BoutonsAction'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { aujourdhui } from '@/shell/pokes'
import { useAuth } from '@/shell/auth'
import { useCreerPoche, useEnregistrerLignes, useSupprimerLignes, type LigneAEnvoyer } from './donnees'
import { lireMontant } from './outils'
import { REGIONS, type Entreprise, type Poche, type Region, type Sens, type Transaction } from './types'

interface Listes {
  entreprises: Entreprise[]
  poches: Poche[]
  qcInt: Set<string>
}

const montantTexte = (n: number | undefined) => (n == null ? '' : n.toFixed(2).replace('.', ','))

/** Compagnies proposées : les actives, plus celle déjà choisie si elle ne l'est plus. */
const compagniesProposees = (entreprises: Entreprise[], actuelle: string | null) =>
  entreprises.filter((e) => e.actif || e.id === actuelle)

/**
 * Entrée ou sortie d'argent dans une poche (compagnie ou poche perso).
 * Sans `transaction` : nouvelle ligne ; `poche` propose une poche (filtre en cours).
 */
export function FenetreTransaction({
  transaction: t,
  poche: pocheProposee,
  fermer,
  entreprises,
  poches,
  qcInt,
}: Listes & { transaction?: Transaction; poche?: string; fermer: () => void }) {
  const enregistrer = useEnregistrerLignes()
  const supprimer = useSupprimerLignes()
  const [sens, setSens] = useState<Sens>(t?.sens ?? 'entree')
  const [jour, setJour] = useState(t?.jour ?? aujourdhui())
  const [poche, setPoche] = useState(
    t ? (t.entreprise_id ? `e:${t.entreprise_id}` : `p:${t.poche_id}`) : (pocheProposee?.split(':').slice(0, 2).join(':') ?? ''),
  )
  const [region, setRegion] = useState<Region | null>(t?.region ?? ((pocheProposee?.split(':')[2] as Region | undefined) ?? null))
  const [montant, setMontant] = useState(montantTexte(t?.montant))
  const [details, setDetails] = useState(t?.details ?? '')
  const [erreur, setErreur] = useState<string | null>(null)

  const [genre, id] = poche.split(':')
  const entrepriseId = genre === 'e' ? id : null
  const demandeRegion = !!entrepriseId && qcInt.has(entrepriseId)
  const occupe = enregistrer.isPending || supprimer.isPending

  async function valider() {
    const n = lireMontant(montant)
    if (!poche) return setErreur('Choisir la poche.')
    if (demandeRegion && !region) return setErreur('Préciser Québec ou International.')
    if (n == null || n <= 0) return setErreur('Montant invalide.')
    if (!details.trim()) return setErreur('Préciser les détails.')
    if (!jour) return setErreur('Préciser la date.')
    const ligne: LigneAEnvoyer = {
      id: t?.id ?? crypto.randomUUID(),
      jour,
      entreprise_id: entrepriseId,
      poche_id: genre === 'p' ? id : null,
      region: demandeRegion ? region : null,
      sens,
      montant: n,
      details: details.trim(),
      avance_id: null,
    }
    try {
      setErreur(null)
      await enregistrer.mutateAsync([ligne])
      fermer()
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  return (
    <Dialogue titre={t ? 'Modifier la transaction' : 'Nouvelle transaction'} fermer={fermer}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          valider()
        }}
      >
        <Bascule
          libelle="Sens"
          valeur={sens}
          options={[
            { id: 'entree', nom: 'Entrée (déposé)' },
            { id: 'sortie', nom: 'Sortie (retiré)' },
          ]}
          changer={setSens}
        />
        <div className="grid grid-cols-2 gap-3">
          <Champ libelle="Date">
            <input type="date" className={ui.champ} value={jour} onChange={(e) => setJour(e.target.value)} required />
          </Champ>
          <Champ libelle="Montant">
            <ChampMontant valeur={montant} changer={setMontant} />
          </Champ>
        </div>
        <Champ libelle="Poche">
          <select className={ui.champ} value={poche} onChange={(e) => setPoche(e.target.value)} required>
            <option value="">Choisir…</option>
            <optgroup label="Compagnies">
              {compagniesProposees(entreprises, entrepriseId).map((e) => (
                <option key={e.id} value={`e:${e.id}`}>
                  {e.nom}
                </option>
              ))}
            </optgroup>
            {poches.length > 0 && (
              <optgroup label="Poches perso">
                {poches.map((p) => (
                  <option key={p.id} value={`p:${p.id}`}>
                    Poche {p.nom}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </Champ>
        {demandeRegion && <ChoixRegion valeur={region} changer={setRegion} />}
        <Champ libelle="Détails">
          <input
            className={ui.champ}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="N° de facture, à qui, de qui, raison…"
          />
        </Champ>
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <Boutons
          occupe={occupe}
          fermer={fermer}
          supprimer={
            t &&
            (async () => {
              if (!(await confirmer({ titre: 'Supprimer cette transaction ?', libelleOk: 'Supprimer', danger: true }))) return
              try {
                await supprimer.mutateAsync(t)
                fermer()
              } catch (e) {
                setErreur(messageErreur(e))
              }
            })
          }
        />
      </form>
    </Dialogue>
  )
}

/**
 * Avance « payé de ma poche » : la compagnie sort le montant, la poche perso
 * l'entre (deux lignes liées, le total de la caisse ne bouge pas). Avec
 * `lignes` : modifie les deux lignes d'une avance existante.
 */
export function FenetreAvance({
  lignes,
  fermer,
  entreprises,
  poches,
  qcInt,
}: Listes & { lignes?: Transaction[]; fermer: () => void }) {
  const { profil } = useAuth()
  const enregistrer = useEnregistrerLignes()
  const supprimer = useSupprimerLignes()
  const creerPoche = useCreerPoche()
  const ligneCompagnie = lignes?.find((l) => l.entreprise_id)
  const lignePoche = lignes?.find((l) => l.poche_id)
  const maPoche = poches.find((p) => p.profil_id === profil?.id)
  const [poche, setPoche] = useState(lignePoche?.poche_id ?? maPoche?.id ?? (poches.length ? '' : 'nouvelle'))
  const [entreprise, setEntreprise] = useState(ligneCompagnie?.entreprise_id ?? '')
  const [region, setRegion] = useState<Region | null>(ligneCompagnie?.region ?? null)
  const [jour, setJour] = useState(ligneCompagnie?.jour ?? aujourdhui())
  const [montant, setMontant] = useState(montantTexte(ligneCompagnie?.montant))
  const [details, setDetails] = useState(ligneCompagnie?.details ?? '')
  const [erreur, setErreur] = useState<string | null>(null)

  const demandeRegion = !!entreprise && qcInt.has(entreprise)
  const occupe = enregistrer.isPending || supprimer.isPending || creerPoche.isPending
  const nomProfil = profil?.nom?.trim() || profil?.courriel.split('@')[0] || ''

  async function valider() {
    const n = lireMontant(montant)
    if (!poche) return setErreur('Choisir la poche de qui a payé.')
    if (!entreprise) return setErreur('Choisir la compagnie.')
    if (demandeRegion && !region) return setErreur('Préciser Québec ou International.')
    if (n == null || n <= 0) return setErreur('Montant invalide.')
    if (!details.trim()) return setErreur('Préciser les détails.')
    if (!jour) return setErreur('Préciser la date.')
    try {
      setErreur(null)
      let pocheId = poche
      if (poche === 'nouvelle') {
        if (!profil) return
        pocheId = crypto.randomUUID()
        await creerPoche.mutateAsync({ id: pocheId, nom: nomProfil, profil_id: profil.id })
      }
      const avance = ligneCompagnie?.avance_id ?? crypto.randomUUID()
      const commun = { jour, montant: n, details: details.trim(), avance_id: avance }
      await enregistrer.mutateAsync([
        {
          ...commun,
          id: ligneCompagnie?.id ?? crypto.randomUUID(),
          entreprise_id: entreprise,
          poche_id: null,
          region: demandeRegion ? region : null,
          sens: 'sortie',
        },
        { ...commun, id: lignePoche?.id ?? crypto.randomUUID(), entreprise_id: null, poche_id: pocheId, region: null, sens: 'entree' },
      ])
      fermer()
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  return (
    <Dialogue titre={lignes ? "Modifier l'avance" : 'Payé de ma poche'} fermer={fermer}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          valider()
        }}
      >
        <p className="text-sm text-pierre-600">
          La compagnie sort le montant et la poche perso l'entre : l'argent reste dans la caisse, réservé à la personne jusqu'à son
          remboursement.
        </p>
        <Champ libelle="Payé de la poche de">
          <select className={ui.champ} value={poche} onChange={(e) => setPoche(e.target.value)} required>
            {poche === '' && <option value="">Choisir…</option>}
            {poches.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
                {p.id === maPoche?.id ? ' (moi)' : ''}
              </option>
            ))}
            {!maPoche && profil && <option value="nouvelle">{nomProfil} (moi, nouvelle poche)</option>}
          </select>
        </Champ>
        <Champ libelle="Pour la compagnie">
          <select className={ui.champ} value={entreprise} onChange={(e) => setEntreprise(e.target.value)} required>
            <option value="">Choisir…</option>
            {compagniesProposees(entreprises, entreprise || null).map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom}
              </option>
            ))}
          </select>
        </Champ>
        {demandeRegion && <ChoixRegion valeur={region} changer={setRegion} />}
        <div className="grid grid-cols-2 gap-3">
          <Champ libelle="Date">
            <input type="date" className={ui.champ} value={jour} onChange={(e) => setJour(e.target.value)} required />
          </Champ>
          <Champ libelle="Montant">
            <ChampMontant valeur={montant} changer={setMontant} />
          </Champ>
        </div>
        <Champ libelle="Détails">
          <input className={ui.champ} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Ex. Avance de paie, foin…" />
        </Champ>
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <Boutons
          occupe={occupe}
          fermer={fermer}
          supprimer={
            ligneCompagnie &&
            (async () => {
              if (!(await confirmer({ titre: "Supprimer l'avance ?", message: 'Les deux lignes sont supprimées.', libelleOk: 'Supprimer', danger: true })))
                return
              try {
                await supprimer.mutateAsync(ligneCompagnie)
                fermer()
              } catch (e) {
                setErreur(messageErreur(e))
              }
            })
          }
        />
      </form>
    </Dialogue>
  )
}

function Champ({ libelle, children }: { libelle: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={ui.etiquette}>{libelle}</span>
      {children}
    </label>
  )
}

function ChampMontant({ valeur, changer }: { valeur: string; changer: (v: string) => void }) {
  return (
    <div className="relative">
      <input
        className={`${ui.champ} pr-7 text-right tabular-nums`}
        inputMode="decimal"
        value={valeur}
        onChange={(e) => changer(e.target.value)}
        placeholder="0,00"
        required
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-pierre-400">$</span>
    </div>
  )
}

function Bascule<T extends string>({
  libelle,
  valeur,
  options,
  changer,
}: {
  libelle: string
  valeur: T | null
  options: { id: T; nom: string }[]
  changer: (v: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={libelle} className="grid grid-flow-col gap-1 rounded-lg border border-pierre-300 bg-white p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={valeur === o.id}
          className={`rounded-md px-2.5 py-1.5 ${valeur === o.id ? 'bg-foret-100 font-medium text-foret-800' : 'text-pierre-600 hover:text-pierre-900'}`}
          onClick={() => changer(o.id)}
        >
          {o.nom}
        </button>
      ))}
    </div>
  )
}

function ChoixRegion({ valeur, changer }: { valeur: Region | null; changer: (r: Region) => void }) {
  return (
    <div>
      <span className={ui.etiquette}>Clientèle</span>
      <Bascule libelle="Clientèle" valeur={valeur} options={REGIONS.map((r) => ({ id: r.id, nom: `${r.icone} ${r.nom}` }))} changer={changer} />
    </div>
  )
}

function Boutons({ occupe, fermer, supprimer }: { occupe: boolean; fermer: () => void; supprimer?: (() => void) | null }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      {supprimer && (
        <BoutonSupprimer onClick={supprimer} disabled={occupe} />
      )}
      <button type="button" className={`${ui.boutonSecondaire} ml-auto`} onClick={fermer}>
        Annuler
      </button>
      <button type="submit" className={ui.bouton} disabled={occupe}>
        Enregistrer
      </button>
    </div>
  )
}
