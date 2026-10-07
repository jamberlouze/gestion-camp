import { useMemo, useState, type ReactNode } from 'react'
import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { IconeExporter } from '@/lib/icones'
import { PuceCompagnie } from '@/lib/PuceCompagnie'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { aujourdhui } from '@/shell/pokes'
import { useCompagniesQcInt, useEntreprises, usePoches, useRembourser, useTransactions } from './donnees'
import { FenetreAvance, FenetreTransaction } from './Fenetres'
import { argent, chronologique, dansPoche, jourLisible, normaliser, soldes, soldesCourants, type ClePoche } from './outils'
import { REGIONS, type Entreprise, type Poche, type Transaction } from './types'

type Fenetre = { genre: 'transaction'; transaction?: Transaction } | { genre: 'avance'; lignes?: Transaction[] } | null

/** Petite caisse : l'argent comptant reçu et sorti, par poche (admins). */
export default function ModuleCaisse() {
  const ecriture = useAuth().peutEcrire('caisse')
  const transactions = useTransactions()
  const entreprises = useEntreprises()
  const poches = usePoches()
  const qcInt = useCompagniesQcInt()
  const rembourser = useRembourser()
  const [filtre, setFiltre] = useState<ClePoche>('')
  const [du, setDu] = useState('')
  const [au, setAu] = useState('')
  const [recherche, setRecherche] = useState('')
  const [fenetre, setFenetre] = useState<Fenetre>(null)

  const tout = transactions.data
  const calcul = useMemo(() => {
    if (!tout) return null
    const selection = tout.filter((t) => dansPoche(t, filtre))
    const courants = soldesCourants(selection)
    const mot = normaliser(recherche.trim())
    const liste = selection
      .filter((t) => (!du || t.jour >= du) && (!au || t.jour <= au))
      .filter((t) => !mot || normaliser(`${t.details} ${t.saisi_par_nom ?? ''}`).includes(mot))
      .sort((a, b) => chronologique(b, a))
    return { soldes: soldes(tout), courants, liste }
  }, [tout, filtre, du, au, recherche])

  const erreur = transactions.error ?? entreprises.error ?? poches.error ?? qcInt.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!calcul || !entreprises.data || !poches.data || !qcInt.data) return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const { soldes: s, courants, liste } = calcul
  const parId = new Map(entreprises.data.map((e) => [e.id, e]))
  const pocheParId = new Map(poches.data.map((p) => [p.id, p]))
  // Compagnies affichées : celles qui ont des lignes, puis les autres actives.
  const compagnies = entreprises.data.filter((e) => s.compagnies.has(e.id) || e.actif)
  const listes = { entreprises: entreprises.data, poches: poches.data, qcInt: qcInt.data }
  const filtreActif = !!(filtre || du || au || recherche)

  const ouvrir = (t: Transaction) => {
    if (!ecriture) return
    if (t.avance_id) setFenetre({ genre: 'avance', lignes: (tout ?? []).filter((l) => l.avance_id === t.avance_id) })
    else setFenetre({ genre: 'transaction', transaction: t })
  }

  const demanderRemboursement = async (p: Poche, montant: number) => {
    const ok = await confirmer({
      titre: `Rembourser ${argent(montant)} à ${p.nom} ?`,
      message: `L'argent sort de la caisse et la poche de ${p.nom} revient à 0.`,
      libelleOk: 'Rembourser',
      danger: false,
    })
    if (ok) rembourser.mutate({ poche: p, montant, jour: aujourdhui() })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Petite caisse</h1>
        <div className="flex flex-wrap gap-2">
          <button className={ui.boutonSecondaire} onClick={() => exporter(liste, courants, parId, pocheParId)} disabled={!liste.length}>
            <IconeExporter className="size-4" /> Exporter
          </button>
          {ecriture && (
            <>
              <button className={ui.boutonSecondaire} onClick={() => setFenetre({ genre: 'avance' })}>
                Payé de ma poche
              </button>
              <button className={ui.bouton} onClick={() => setFenetre({ genre: 'transaction' })}>
                + Transaction
              </button>
            </>
          )}
        </div>
      </div>

      <BandeauErreurs racine="caisse" />

      <div className="grid max-w-5xl gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-3">
          <Carte actif={filtre === ''} choisir={() => setFiltre('')}>
            <p className="text-xs font-medium uppercase tracking-wide text-pierre-500">En caisse</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{argent(s.total)}</p>
            <p className="mt-1 text-xs text-pierre-500">Toutes les poches</p>
          </Carte>

          <div className={`${ui.carte} p-3`}>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-pierre-500">Poches perso</p>
            {poches.data.length === 0 && <p className="text-sm text-pierre-500">Aucune avance payée de sa poche.</p>}
            <ul className="space-y-0.5">
              {poches.data.map((p) => {
                const montant = s.poches.get(p.id) ?? 0
                return (
                  <li key={p.id} className="flex items-center gap-1">
                    <div className="min-w-0 flex-1">
                      <LignePoche actif={filtre === `p:${p.id}`} choisir={() => setFiltre(`p:${p.id}`)} montant={montant}>
                        {p.nom}
                      </LignePoche>
                    </div>
                    {ecriture && montant > 0 && (
                      <button
                        className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-foret-700 hover:bg-foret-50"
                        onClick={() => demanderRemboursement(p, montant)}
                        disabled={rembourser.isPending}
                      >
                        Rembourser
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
        <div className={`${ui.carte} p-3 md:col-start-2 md:row-start-1`}>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-pierre-500">Compagnies</p>
          <ul className="space-y-0.5">
            {compagnies.map((e) => {
              const regions = s.regions.get(e.id)
              return (
                <li key={e.id}>
                  <LignePoche actif={filtre === `e:${e.id}`} choisir={() => setFiltre(`e:${e.id}`)} montant={s.compagnies.get(e.id) ?? 0}>
                    <PuceCompagnie compagnie={e} />
                  </LignePoche>
                  {qcInt.data.has(e.id) && (
                    <ul className="ml-4">
                      {REGIONS.map((r) => (
                        <li key={r.id}>
                          <LignePoche
                            actif={filtre === `e:${e.id}:${r.id}`}
                            choisir={() => setFiltre(`e:${e.id}:${r.id}`)}
                            montant={regions?.[r.id] ?? 0}
                            petit
                          >
                            {r.icone} {r.nom}
                          </LignePoche>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </div>

      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className={ui.etiquette}>Poche</span>
          <select className="rounded-lg border border-pierre-300 bg-white px-2.5 py-1.5 text-sm" value={filtre} onChange={(e) => setFiltre(e.target.value)}>
            <option value="">Toute la caisse</option>
            {compagnies.map((e) => [
              <option key={e.id} value={`e:${e.id}`}>
                {e.nom}
              </option>,
              ...(qcInt.data.has(e.id)
                ? REGIONS.map((r) => (
                    <option key={`${e.id}:${r.id}`} value={`e:${e.id}:${r.id}`}>
                      {e.nom} · {r.icone} {r.nom}
                    </option>
                  ))
                : []),
            ])}
            {poches.data.map((p) => (
              <option key={p.id} value={`p:${p.id}`}>
                Poche {p.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={ui.etiquette}>Du</span>
          <input type="date" className="rounded-lg border border-pierre-300 bg-white px-2.5 py-1 text-sm" value={du} onChange={(e) => setDu(e.target.value)} />
        </label>
        <label className="block">
          <span className={ui.etiquette}>Au</span>
          <input type="date" className="rounded-lg border border-pierre-300 bg-white px-2.5 py-1 text-sm" value={au} onChange={(e) => setAu(e.target.value)} />
        </label>
        <label className="block min-w-48 flex-1 sm:max-w-xs">
          <span className={ui.etiquette}>Recherche</span>
          <input
            type="search"
            className="w-full rounded-lg border border-pierre-300 bg-white px-2.5 py-1.5 text-sm"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="N° de facture, nom…"
          />
        </label>
        {filtreActif && (
          <button
            className="px-1 py-1.5 text-sm text-pierre-600 underline hover:text-pierre-900"
            onClick={() => {
              setFiltre('')
              setDu('')
              setAu('')
              setRecherche('')
            }}
          >
            Tout afficher
          </button>
        )}
        <p className="ml-auto py-1.5 text-sm text-pierre-500">
          {liste.length} ligne{liste.length > 1 ? 's' : ''}
        </p>
      </div>

      <div className={`${ui.carte} overflow-x-auto`}>
        <table className="w-full min-w-[54rem] text-sm">
          <thead className="border-b border-pierre-200 bg-pierre-50 text-left text-xs font-medium uppercase tracking-wide text-pierre-500">
            <tr>
              <th className="w-32 px-3 py-2">Date</th>
              <th className="w-44 px-3 py-2">Poche</th>
              <th className="px-3 py-2">Détails</th>
              <th className="w-28 px-3 py-2 text-right">Entrée</th>
              <th className="w-28 px-3 py-2 text-right">Sortie</th>
              <th className="w-32 px-3 py-2 text-right" title="Solde de la poche choisie (ou de toute la caisse) après la ligne">
                Solde
              </th>
              <th className="w-28 px-3 py-2">Inscrit par</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pierre-100">
            {liste.map((t) => (
              <tr
                key={t.id}
                className={ecriture ? 'cursor-pointer hover:bg-pierre-50' : ''}
                onClick={() => ouvrir(t)}
                tabIndex={ecriture ? 0 : undefined}
                onKeyDown={(e) => e.key === 'Enter' && ouvrir(t)}
              >
                <td className="px-3 py-2 whitespace-nowrap text-pierre-600">{jourLisible(t.jour)}</td>
                <td className="px-3 py-2">
                  <NomPoche t={t} parId={parId} pocheParId={pocheParId} />
                </td>
                <td className="px-3 py-2">
                  {t.details}
                  {t.avance_id && (
                    <span className="ml-2 rounded-full bg-sky-50 px-1.5 py-0.5 text-xs text-sky-800" title="Payé de sa poche : deux lignes liées">
                      avance
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-foret-800">{t.sens === 'entree' ? argent(t.montant) : ''}</td>
                <td className="px-3 py-2 text-right tabular-nums text-red-700">{t.sens === 'sortie' ? argent(t.montant) : ''}</td>
                <td className="px-3 py-2 text-right tabular-nums text-pierre-600">{argent(courants.get(t.id) ?? 0)}</td>
                <td className="px-3 py-2 text-pierre-500">{t.saisi_par_nom ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {liste.length === 0 && <p className="px-3 py-8 text-center text-sm text-pierre-500">Aucune transaction ici.</p>}
      </div>

      {fenetre?.genre === 'transaction' && (
        <FenetreTransaction {...listes} transaction={fenetre.transaction} poche={filtre || undefined} fermer={() => setFenetre(null)} />
      )}
      {fenetre?.genre === 'avance' && <FenetreAvance {...listes} lignes={fenetre.lignes} fermer={() => setFenetre(null)} />}
    </div>
  )
}

function Carte({ actif, choisir, children }: { actif: boolean; choisir: () => void; children: ReactNode }) {
  return (
    <button
      className={`${ui.carte} p-3 text-left hover:border-pierre-300 ${actif ? 'ring-2 ring-foret-600/40' : ''}`}
      onClick={choisir}
      aria-pressed={actif}
    >
      {children}
    </button>
  )
}

function LignePoche({
  actif,
  choisir,
  montant,
  petit,
  children,
}: {
  actif: boolean
  choisir: () => void
  montant: number
  petit?: boolean
  children: ReactNode
}) {
  return (
    <button
      className={`flex w-full items-center justify-between gap-3 rounded-md px-1.5 py-1 text-left hover:bg-pierre-50 ${
        actif ? 'bg-foret-50 ring-1 ring-foret-600/30' : ''
      } ${petit ? 'text-xs text-pierre-600' : 'text-sm'}`}
      onClick={choisir}
      aria-pressed={actif}
    >
      <span className="min-w-0 truncate">{children}</span>
      <span className={`tabular-nums ${montant < 0 ? 'text-red-700' : ''} ${petit ? '' : 'font-medium'}`}>{argent(montant)}</span>
    </button>
  )
}

function NomPoche({ t, parId, pocheParId }: { t: Transaction; parId: Map<string, Entreprise>; pocheParId: Map<string, Poche> }) {
  if (t.entreprise_id) {
    const e = parId.get(t.entreprise_id)
    const r = REGIONS.find((x) => x.id === t.region)
    return (
      <span className="inline-flex items-center gap-1.5">
        {e ? <PuceCompagnie compagnie={e} court /> : '?'}
        {r && <span title={r.nom}>{r.icone}</span>}
      </span>
    )
  }
  return <span className="text-pierre-700">Poche {pocheParId.get(t.poche_id ?? '')?.nom ?? '?'}</span>
}

const nomPocheTexte = (t: Transaction, parId: Map<string, Entreprise>, pocheParId: Map<string, Poche>) =>
  t.entreprise_id ? (parId.get(t.entreprise_id)?.nom ?? '') : `Poche ${pocheParId.get(t.poche_id ?? '')?.nom ?? ''}`

/** CSV pour Excel (séparateur « ; », virgule décimale, BOM pour les accents), lignes affichées, de la plus ancienne à la plus récente. */
function exporter(liste: Transaction[], courants: Map<string, number>, parId: Map<string, Entreprise>, pocheParId: Map<string, Poche>) {
  const nombre = (n: number) => n.toFixed(2).replace('.', ',')
  const champ = (t: string | null) => (t && /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : (t ?? ''))
  const entete = ['Date', 'Poche', 'Clientèle', 'Détails', 'Entrée', 'Sortie', 'Solde', 'Inscrit par', 'Avance']
  const rangees = [...liste].sort(chronologique).map((t) => [
    t.jour,
    champ(nomPocheTexte(t, parId, pocheParId)),
    REGIONS.find((r) => r.id === t.region)?.nom ?? '',
    champ(t.details),
    t.sens === 'entree' ? nombre(t.montant) : '',
    t.sens === 'sortie' ? nombre(t.montant) : '',
    nombre(courants.get(t.id) ?? 0),
    champ(t.saisi_par_nom),
    t.avance_id ? 'oui' : '',
  ])
  const csv = '﻿' + [entete, ...rangees].map((r) => r.join(';')).join('\r\n')
  const lien = document.createElement('a')
  lien.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  lien.download = `Petite caisse ${aujourdhui()}.csv`
  lien.click()
  setTimeout(() => URL.revokeObjectURL(lien.href), 1000)
}
