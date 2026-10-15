import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { BoutonSupprimer } from '@/lib/BoutonsAction'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur, useListe } from '@/lib/donnees'
import { IconePlus } from '@/lib/icones'
import { PuceCompagnie } from '@/lib/PuceCompagnie'
import type { Entreprise as Compagnie, Employe } from '@/lib/types'
import { ui } from '@/lib/ui'
import { menu, Pastille, PastilleStatut } from './commun'
import { useEmployes, useEnregistrerLigneSalaire, useEntreprises, useLignesSalaire, useSubventions, useSupprimerLigneSalaire } from './donnees'
import {
  anneeFiscaleCourante,
  argentCents,
  calculLigne,
  dateCourte,
  entrepriseDe,
  estRetenue,
  libelleAnneeFiscale,
  lireNombre,
  nomEmploye,
  periode,
  pourcentage,
  totauxSalaires,
  type CalculSalaire,
} from './outils'
import type { Entreprise, LigneSalaire, Subvention } from './types'

/**
 * Attribution salariale : un seul tableau par année fiscale, qui regroupe
 * toutes les subventions avec des employés (JCTDLO, Emplois d'été Canada…).
 * Une ligne = un employé (référentiel ou nom libre) sur une subvention ;
 * remplace le Google Sheet tenu à côté. Salaires : mêmes droits que le
 * module, jamais gardés sur l'appareil.
 */
export function AttributionSalariale() {
  const subventions = useSubventions()
  const entreprises = useEntreprises()
  const lignes = useLignesSalaire()
  const employes = useEmployes()
  const compagnies = useListe<Compagnie>('core', 'entreprises', 'ordre')
  const [annee, setAnnee] = useState(anneeFiscaleCourante)
  const [entreprise, setEntreprise] = useState('')
  const [edition, setEdition] = useState<{ ligne: LigneSalaire | null; grant: string } | null>(null)

  const avecLignes = useMemo(() => new Set((lignes.data ?? []).map((l) => l.grant_id)), [lignes.data])
  const annees = useMemo(() => {
    const s = new Set([anneeFiscaleCourante(), ...(subventions.data ?? []).filter((g) => estRetenue(g) || avecLignes.has(g.id)).map((g) => g.fiscal_year)])
    return [...s].sort((a, b) => b - a)
  }, [subventions.data, avecLignes])

  const donnees = useMemo(() => {
    const deLAnnee = (subventions.data ?? []).filter((g) => g.fiscal_year === annee && (!entreprise || entrepriseDe(g) === entreprise))
    const trier = (a: Subvention, b: Subvention) =>
      Number(b.grant_type === 'salarial') - Number(a.grant_type === 'salarial') || a.program_name.localeCompare(b.program_name, 'fr')
    const parEmploye = new Map((employes.data ?? []).map((e) => [e.id, e]))
    const nom = (l: LigneSalaire) => (l.employee_id ? nomEmploye(parEmploye.get(l.employee_id) ?? { surnom: '?', prenom: null, nom_famille: null }) : (l.free_name ?? ''))
    const groupes = deLAnnee
      .filter((g) => avecLignes.has(g.id))
      .sort(trier)
      .map((g) => {
        const siennes = (lignes.data ?? [])
          .filter((l) => l.grant_id === g.id)
          .map((l) => ({ l, nom: nom(l), calcul: calculLigne(l) }))
          .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
        return { g, lignes: siennes, total: totauxSalaires(siennes.map((x) => x.calcul)) }
      })
    return {
      groupes,
      total: totauxSalaires(groupes.flatMap((x) => x.lignes.map((y) => y.calcul))),
      nbLignes: groupes.reduce((s, x) => s + x.lignes.length, 0),
      // Subventions où l'on peut ajouter un employé : retenues ou obtenues de l'année (salariales d'abord), ou qui en ont déjà.
      offertes: deLAnnee.filter((g) => estRetenue(g) || avecLignes.has(g.id)).sort(trier),
    }
  }, [subventions.data, lignes.data, employes.data, avecLignes, annee, entreprise])

  const erreur = subventions.error ?? entreprises.error ?? lignes.error ?? employes.error
  if (erreur) return <p className={ui.erreur}>{messageErreur(erreur)}</p>
  if (!subventions.data || !entreprises.data || !lignes.data || !employes.data)
    return <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>

  const compagnieDe = (id: string) => {
    const e = entreprises.data.find((x) => x.id === id)
    return (compagnies.data ?? []).find((c) => c.id === e?.entreprise_id) ?? { nom: e?.name ?? '—', couleur: null }
  }
  const t = donnees.total

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Année fiscale" className={menu} value={annee} onChange={(e) => setAnnee(Number(e.target.value))}>
            {annees.map((a) => (
              <option key={a} value={a}>
                Année fiscale {libelleAnneeFiscale(a)}
              </option>
            ))}
          </select>
          <select aria-label="Entreprise" className={menu} value={entreprise} onChange={(e) => setEntreprise(e.target.value)}>
            <option value="">Toutes les entreprises</option>
            {entreprises.data.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-pierre-500">
            1er octobre {annee - 1} au 30 septembre {annee}
          </span>
        </div>
        <button className={ui.bouton} disabled={!donnees.offertes.length} onClick={() => setEdition({ ligne: null, grant: donnees.offertes[0]?.id ?? '' })}>
          <IconePlus /> Ajouter un employé
        </button>
      </div>

      {donnees.groupes.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['Salaires', argentCents(t.salaire)],
            ['Contribution des subventions', argentCents(t.subvention)],
            ["Contribution de l'employeur", argentCents(t.employeur)],
            ['Part couverte', pourcentage(t.couvert)],
          ].map(([libelle, valeur]) => (
            <div key={libelle} className={`${ui.carte} p-3 sm:p-4`}>
              <p className="text-xs text-pierre-500">{libelle}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-foret-800 sm:text-2xl">{valeur}</p>
            </div>
          ))}
        </div>
      )}

      {donnees.groupes.length === 0 ? (
        <p className={`${ui.carte} px-4 py-8 text-center text-sm text-pierre-500`}>
          {donnees.offertes.length
            ? 'Aucun employé attribué à une subvention cette année fiscale. « Ajouter un employé » pour commencer.'
            : 'Aucune subvention retenue ou obtenue cette année fiscale : retenez-en une (onglet À valider) pour y attribuer des employés.'}
        </p>
      ) : (
        <div className={`${ui.carte} overflow-x-auto`}>
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-pierre-500">
              <tr className="border-b border-pierre-200">
                <th className="min-w-52 px-3 py-2 font-medium">Employé</th>
                <th className="px-3 py-2 text-right font-medium">Salaire</th>
                <th className="px-3 py-2 font-medium">Dates</th>
                <th className="px-3 py-2 text-right font-medium">Subvention</th>
                <th className="px-3 py-2 text-right font-medium">Employeur</th>
                <th className="px-3 py-2 text-right font-medium">% couvert</th>
              </tr>
            </thead>
            {donnees.groupes.map(({ g, lignes: siennes, total }) => (
              <tbody key={g.id} className="border-b border-pierre-200 last:border-b-0">
                <tr className="bg-pierre-50">
                  <td colSpan={6} className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/subventions/fiche/${g.id}`} className="font-semibold hover:underline">
                        {g.program_name}
                      </Link>
                      <PuceCompagnie compagnie={compagnieDe(entrepriseDe(g))} />
                      <PastilleStatut statut={g.status} />
                      <button
                        className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-foret-700 hover:underline"
                        onClick={() => setEdition({ ligne: null, grant: g.id })}
                      >
                        <IconePlus className="size-3.5" /> Employé
                      </button>
                    </div>
                  </td>
                </tr>
                {siennes.map(({ l, nom, calcul }) => (
                  <tr key={l.id} className="cursor-pointer border-t border-pierre-100 hover:bg-foret-50/40" onClick={() => setEdition({ ligne: l, grant: g.id })}>
                    <td className="px-3 py-2">
                      {nom}
                      {!l.employee_id && <Pastille classe="ml-1.5 bg-amber-100 text-amber-800">à pourvoir</Pastille>}
                      {l.note && <p className="text-xs text-pierre-500">{l.note}</p>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {calcul.salaire == null ? '—' : argentCents(calcul.salaire)}
                      {l.salary_amount == null && l.hourly_rate != null && l.hours != null && (
                        <p className="text-xs text-pierre-500">
                          {argentCents(Number(l.hourly_rate))} × {Number(l.hours).toLocaleString('fr-CA')} h
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-pierre-600">{periode(l.start_date, l.end_date) ?? '—'}</td>
                    <Montants calcul={calcul} />
                  </tr>
                ))}
                <tr className="border-t border-pierre-200 font-medium">
                  <td className="px-3 py-2 text-pierre-600">
                    Total ({siennes.length} employé{siennes.length > 1 ? 's' : ''})
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{argentCents(total.salaire)}</td>
                  <td />
                  <td className="px-3 py-2 text-right tabular-nums">{argentCents(total.subvention)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{argentCents(total.employeur)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pourcentage(total.couvert)}</td>
                </tr>
              </tbody>
            ))}
            <tfoot>
              <tr className="border-t-2 border-pierre-300 bg-foret-50 font-semibold">
                <td className="px-3 py-2">
                  Total de l’année ({donnees.nbLignes} ligne{donnees.nbLignes > 1 ? 's' : ''})
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{argentCents(t.salaire)}</td>
                <td />
                <td className="px-3 py-2 text-right tabular-nums">{argentCents(t.subvention)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{argentCents(t.employeur)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pourcentage(t.couvert)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-xs text-pierre-500">
        Salaire = montant, sinon taux horaire × heures. Contribution de l’employeur laissée vide = salaire − contribution de la subvention
        (en italique). % couvert = subvention ÷ (subvention + employeur). Année fiscale de chaque subvention : sur sa fiche.
      </p>

      {edition && (
        <DialogueLigne
          ligne={edition.ligne}
          grant={edition.grant}
          offertes={donnees.offertes}
          employes={employes.data}
          entreprises={entreprises.data}
          fermer={() => setEdition(null)}
        />
      )}
    </div>
  )
}

function Montants({ calcul }: { calcul: CalculSalaire }) {
  const m = (n: number | null) => (n == null ? <span className="text-pierre-400">—</span> : argentCents(n))
  return (
    <>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{m(calcul.subvention)}</td>
      <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${calcul.employeurCalcule ? 'italic text-pierre-500' : ''}`}>
        {m(calcul.employeur)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{pourcentage(calcul.couvert)}</td>
    </>
  )
}

const LIBRE = '__libre'
const texteNombre = (n: number | null) => (n == null ? '' : String(n).replace('.', ','))

function DialogueLigne({
  ligne,
  grant,
  offertes,
  employes,
  entreprises,
  fermer,
}: {
  ligne: LigneSalaire | null
  grant: string
  offertes: Subvention[]
  employes: Employe[]
  entreprises: Entreprise[]
  fermer: () => void
}) {
  const enregistrer = useEnregistrerLigneSalaire()
  const supprimer = useSupprimerLigneSalaire()
  const [subvention, setSubvention] = useState(ligne?.grant_id ?? grant)
  const [employe, setEmploye] = useState(ligne ? (ligne.employee_id ?? LIBRE) : '')
  const [nomLibre, setNomLibre] = useState(ligne?.free_name ?? '')
  const [enMontant, setEnMontant] = useState(ligne?.salary_amount != null)
  const [taux, setTaux] = useState(texteNombre(ligne?.hourly_rate ?? null))
  const [heures, setHeures] = useState(texteNombre(ligne?.hours ?? null))
  const [montant, setMontant] = useState(texteNombre(ligne?.salary_amount ?? null))
  const [debut, setDebut] = useState(ligne?.start_date ?? '')
  const [fin, setFin] = useState(ligne?.end_date ?? '')
  const [partSubvention, setPartSubvention] = useState(texteNombre(ligne?.grant_contribution ?? null))
  const [partEmployeur, setPartEmployeur] = useState(texteNombre(ligne?.employer_contribution ?? null))
  const [note, setNote] = useState(ligne?.note ?? '')
  const [erreur, setErreur] = useState<string | null>(null)

  const nomEntreprise = (g: Subvention) => entreprises.find((e) => e.id === entrepriseDe(g))?.name
  // Employés actifs, plus celui de la ligne s'il a été retiré du référentiel.
  const choix = employes
    .filter((e) => e.actif || e.id === ligne?.employee_id)
    .map((e) => ({ id: e.id, nom: nomEmploye(e) }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))

  const valeurs = {
    hourly_rate: enMontant ? null : lireNombre(taux),
    hours: enMontant ? null : lireNombre(heures),
    salary_amount: enMontant ? lireNombre(montant) : null,
    grant_contribution: lireNombre(partSubvention),
    employer_contribution: lireNombre(partEmployeur),
  }
  const apercu = calculLigne(valeurs)
  const invalide = Object.values(valeurs).some((v) => Number.isNaN(v))

  const valider = async () => {
    setErreur(null)
    if (!subvention) return setErreur('Choisissez la subvention.')
    if (!employe) return setErreur('Choisissez un employé, ou « Nom libre ».')
    if (employe === LIBRE && !nomLibre.trim()) return setErreur('Écrivez le nom ou le poste à pourvoir.')
    if (invalide) return setErreur('Un montant, un taux ou un nombre d’heures n’est pas un nombre valide.')
    if (debut && fin && fin < debut) return setErreur('La fin est avant le début.')
    try {
      await enregistrer.mutateAsync({
        ...(ligne ? { id: ligne.id } : {}),
        grant_id: subvention,
        employee_id: employe === LIBRE ? null : employe,
        free_name: employe === LIBRE ? nomLibre.trim() : null,
        ...valeurs,
        start_date: debut || null,
        end_date: fin || null,
        note: note.trim() || null,
      })
      fermer()
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  const retirer = async () => {
    if (!ligne || !(await confirmer({ titre: 'Retirer cette ligne ?', message: 'L’employé ne sera plus attribué à cette subvention.', libelleOk: 'Retirer' }))) return
    try {
      await supprimer.mutateAsync(ligne.id)
      fermer()
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  const champNombre = (id: string, libelle: string, valeur: string, changer: (v: string) => void, placeholder?: string) => (
    <div>
      <label className={ui.etiquette} htmlFor={id}>
        {libelle}
      </label>
      <input id={id} className={ui.champ} inputMode="decimal" placeholder={placeholder} value={valeur} onChange={(e) => changer(e.target.value)} />
    </div>
  )

  return (
    <Dialogue titre={ligne ? 'Modifier l’attribution' : 'Ajouter un employé'} fermer={fermer}>
      <div className="space-y-3">
        <div>
          <label className={ui.etiquette} htmlFor="sal-subvention">
            Subvention
          </label>
          <select id="sal-subvention" className={ui.champ} value={subvention} onChange={(e) => setSubvention(e.target.value)}>
            {offertes.map((g) => (
              <option key={g.id} value={g.id}>
                {g.program_name}
                {nomEntreprise(g) ? ` — ${nomEntreprise(g)}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="sal-employe">
            Employé
          </label>
          <select id="sal-employe" className={ui.champ} value={employe} onChange={(e) => setEmploye(e.target.value)}>
            <option value="">Choisir…</option>
            <option value={LIBRE}>Nom libre (poste pas encore pourvu)…</option>
            {choix.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nom}
              </option>
            ))}
          </select>
          {employe === LIBRE && (
            <input
              className={`${ui.champ} mt-2`}
              aria-label="Nom libre"
              placeholder="Ex. Animateur no 3 (à pourvoir)"
              value={nomLibre}
              onChange={(e) => setNomLibre(e.target.value)}
            />
          )}
        </div>

        <fieldset>
          <legend className={ui.etiquette}>Salaire</legend>
          <div className="mb-2 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="sal-mode" className="accent-foret-700" checked={!enMontant} onChange={() => setEnMontant(false)} />
              Taux horaire × heures
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="sal-mode" className="accent-foret-700" checked={enMontant} onChange={() => setEnMontant(true)} />
              Montant
            </label>
          </div>
          {enMontant ? (
            champNombre('sal-montant', 'Montant du salaire ($)', montant, setMontant)
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {champNombre('sal-taux', 'Taux horaire ($)', taux, setTaux)}
              {champNombre('sal-heures', 'Heures', heures, setHeures)}
            </div>
          )}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={ui.etiquette} htmlFor="sal-debut">
              Début
            </label>
            <input id="sal-debut" type="date" className={ui.champ} value={debut} onChange={(e) => setDebut(e.target.value)} />
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="sal-fin">
              Fin
            </label>
            <input id="sal-fin" type="date" className={ui.champ} value={fin} onChange={(e) => setFin(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {champNombre('sal-subv', 'Contribution de la subvention ($)', partSubvention, setPartSubvention)}
          {champNombre(
            'sal-empl',
            'Contribution de l’employeur ($)',
            partEmployeur,
            setPartEmployeur,
            apercu.employeurCalcule && apercu.employeur != null ? `${texteNombre(apercu.employeur)} (calculée)` : 'Vide : salaire − subvention',
          )}
        </div>
        <p className="text-sm text-pierre-600">
          Salaire : <b>{apercu.salaire == null ? '—' : argentCents(apercu.salaire)}</b> · couvert par la subvention :{' '}
          <b>{pourcentage(apercu.couvert)}</b>
        </p>

        <div>
          <label className={ui.etiquette} htmlFor="sal-note">
            Note (facultatif)
          </label>
          <input id="sal-note" className={ui.champ} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      {erreur && <p className={`${ui.erreur} mt-3`}>{erreur}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {ligne && (
          <BoutonSupprimer className="mr-auto" onClick={retirer}>
            Retirer
          </BoutonSupprimer>
        )}
        <button className={ui.boutonSecondaire} onClick={fermer}>
          Annuler
        </button>
        <button className={ui.bouton} disabled={enregistrer.isPending} onClick={valider}>
          Enregistrer
        </button>
      </div>
      {ligne && (
        <p className="mt-3 text-xs text-pierre-400">
          Ajoutée le {dateCourte(ligne.created_at)}
          {ligne.updated_at !== ligne.created_at ? `, modifiée le ${dateCourte(ligne.updated_at)}` : ''}.
        </p>
      )}
    </Dialogue>
  )
}
