import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { IconeTableur } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { useRh } from './contexte'
import { useDossiers, useEnregistrerReglage, useModifierPoste, useReglagesRh } from './donnees'
import { exporterEmployeurD, useEmployesReferentiel, useEnregistrerMatricule, useEnregistrerNumeroCompagnie, usePaiesMasquees } from './donneesConformite'
import {
  cellulesFichier,
  COLONNES_EMPLOI,
  LIBELLES_MANQUES,
  NOM_FEUILLE,
  nomFichier,
  rangees,
  reglagesEmployeurD,
  verifier,
  type SourceEmployeurD,
  type Verification,
} from './employeurD'
import { aujourdhui, dateCourte, horodatage } from './outils'
import type { Embauche } from './types'

interface Ligne {
  e: Embauche
  source: SourceEmployeurD
  v: Verification
}

/**
 * Export vers Employeur D, gabarit « Données d'emploi » : embauches
 * complètes de genre emploi de la saison (et de la compagnie) choisie. Ce
 * qui manque est listé par personne et se règle ici quand c'est un numéro
 * (compagnie, poste, matricule, titre d'emploi) ; seules les lignes
 * complètes se téléchargent. Le NAS et le compte sont lus en clair au
 * moment du fichier (rh.export_employeur_d, consultation notée), jamais
 * avant ni gardés.
 */
export function ExportEmployeurD({ embauches, titre, compagnieNom, saisonNom, fermer }: { embauches: Embauche[]; titre: string; compagnieNom: string | null; saisonNom: string; fermer: () => void }) {
  const { personneParId, posteParId, compagnieParId, candidatures } = useRh()
  const client = useQueryClient()
  const dossiers = useDossiers()
  const paies = usePaiesMasquees(true)
  const employes = useEmployesReferentiel()
  const reglagesRh = useReglagesRh()
  const [choix, setChoix] = useState<Set<string> | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [fait, setFait] = useState<number | null>(null)
  const r = reglagesEmployeurD(reglagesRh.data?.employeur_d)

  const lignes = useMemo<Ligne[] | null>(() => {
    if (!dossiers.data || !paies.data || !employes.data || !reglagesRh.data) return null
    const dossierDe = new Map(dossiers.data.map((d) => [d.personne_id, d]))
    const paieDe = new Map(paies.data.map((x) => [x.personne_id, x]))
    const employeDe = new Map(employes.data.map((x) => [x.id, x]))
    const candidatureDe = new Map(candidatures.map((c) => [c.id, c]))
    return embauches
      .filter((e) => e.statut === 'complete' && e.genre === 'emploi' && personneParId.has(e.personne_id))
      .map((e) => {
        const p = personneParId.get(e.personne_id)!
        const c = e.candidature_id ? candidatureDe.get(e.candidature_id) : undefined
        const source: SourceEmployeurD = {
          embauche: e,
          personne: p,
          dossier: dossierDe.get(p.id) ?? null,
          paie: paieDe.get(p.id) ?? null,
          compagnie: (e.entreprise_id && compagnieParId.get(e.entreprise_id)) || null,
          poste: (e.poste_id && posteParId.get(e.poste_id)) || null,
          employe: (p.employe_id && employeDe.get(p.employe_id)) || null,
          langue: c?.reponses?.langue === 'en' ? 'en' : 'fr',
        }
        return { e, source, v: verifier(source, reglagesEmployeurD(reglagesRh.data!.employeur_d)) }
      })
      .sort((a, b) => a.source.personne.nom_complet.localeCompare(b.source.personne.nom_complet, 'fr'))
  }, [embauches, dossiers.data, paies.data, employes.data, reglagesRh.data, personneParId, posteParId, compagnieParId, candidatures])

  const chargeErreur = dossiers.error ?? paies.error ?? employes.error ?? reglagesRh.error
  const pretes = (lignes ?? []).filter((l) => !l.v.manques.length)
  // Par défaut : les lignes complètes pas encore exportées.
  const coches = choix ?? new Set(pretes.filter((l) => !l.e.employeur_d_le).map((l) => l.e.id))
  const choisies = pretes.filter((l) => coches.has(l.e.id))
  const aRegler = (lignes ?? []).filter((l) => l.v.manques.length)
  const compagniesSansNumero = [...new Map(aRegler.filter((l) => l.v.manques.includes('numero_compagnie')).map((l) => [l.source.compagnie!.id, l.source.compagnie!])).values()]
  const postesSansNumero = [...new Map(aRegler.filter((l) => l.v.manques.includes('poste_employeur_d')).map((l) => [l.source.poste!.id, l.source.poste!])).values()]
  const sansTitre = aRegler.some((l) => l.v.manques.includes('titre_emploi'))
  const reglesGlobales = new Set(['numero_compagnie', 'poste_employeur_d', 'titre_emploi'])

  const basculer = (id: string) => {
    const n = new Set(coches)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    setChoix(n)
  }

  async function telecharger() {
    setErreur(null)
    setFait(null)
    setEnCours(true)
    try {
      // NAS et compte en clair : seulement ici, le temps de faire le fichier.
      const enClair = await exporterEmployeurD(choisies.map((l) => l.e.id))
      const cellules = cellulesFichier(
        choisies.map((l) => rangees(l.source, r, enClair.get(l.e.id) ?? { nas: null, transit: null, institution: null, compte: null })),
      )
      const XLSX = await import('xlsx')
      const ws: import('xlsx').WorkSheet = {}
      cellules.forEach((rangee, i) =>
        rangee.forEach((v, j) => {
          if (v == null) return
          ws[XLSX.utils.encode_cell({ r: i, c: j })] = typeof v === 'string' ? { t: 's', v } : { t: 'n', v: v.n, z: v.z }
        }),
      )
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: cellules.length - 1, c: COLONNES_EMPLOI - 1 } })
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, NOM_FEUILLE)
      XLSX.writeFile(wb, nomFichier({ saison: saisonNom, compagnie: compagnieNom, jour: aujourdhui() }), { bookType: 'biff8' })
      setFait(choisies.length)
      setChoix(new Set())
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setEnCours(false)
      await Promise.all([
        client.invalidateQueries({ queryKey: ['rh', 'embauches'], exact: true }),
        client.invalidateQueries({ queryKey: ['rh', 'consultations'] }),
        client.invalidateQueries({ queryKey: ['rh', 'journal'] }),
      ])
    }
  }

  return (
    <Dialogue titre={`Export Employeur D · ${titre}`} fermer={fermer} large>
      {chargeErreur ? (
        <p className={ui.erreur}>{messageErreur(chargeErreur)}</p>
      ) : !lignes ? (
        <p className="py-8 text-center text-sm text-pierre-500">Chargement…</p>
      ) : (
        <div className="space-y-4 text-sm">
          <p className="text-pierre-600">
            Gabarit « Données d'emploi » (canevas Desjardins de septembre 2026) : profil personnel et profil emploi des embauches <b>complètes</b> de genre emploi (les
            bénévoles n'y sont pas). Le NAS et le compte sont lus au moment du fichier ; chaque export est noté dans les consultations. Valeurs par défaut :{' '}
            <Link to="/rh/reglages#employeur-d" className="text-foret-700 underline" onClick={fermer}>
              Réglages › Employeur D
            </Link>
            .
          </p>

          {aRegler.length > 0 && (
            <section className="space-y-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <h3 className="font-semibold text-red-900">À régler avant de télécharger ces lignes</h3>
              {sansTitre && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 text-red-900">Numéro du titre d'emploi (colonne G, obligatoire pour un ajout ; table des titres de la compagnie dans Employeur D)</span>
                  <TitreEmploi valeurs={reglagesRh.data?.employeur_d} />
                </div>
              )}
              {compagniesSansNumero.length > 0 && (
                <div>
                  <p className="font-medium text-red-900">Numéro de compagnie Employeur D (8 lettres ou chiffres ; aussi dans Référentiel › Compagnies)</p>
                  <ul className="mt-1 grid gap-1.5 sm:grid-cols-2">
                    {compagniesSansNumero.map((c) => (
                      <li key={c.id} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">{c.nom}</span>
                        <NumeroCompagnie id={c.id} nom={c.nom} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {postesSansNumero.length > 0 && (
                <div>
                  <p className="font-medium text-red-900">Numéro du poste dans Employeur D (8 lettres ou chiffres ; aussi dans Réglages › Postes)</p>
                  <ul className="mt-1 grid gap-1.5 sm:grid-cols-2">
                    {postesSansNumero.map((x) => (
                      <li key={x.id} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">
                          {x.nom} <span className="text-xs text-pierre-500">{compagnieParId.get(posteParId.get(x.id)?.entreprise_id ?? '')?.abreviation}</span>
                        </span>
                        <NumeroPoste id={x.id} nom={x.nom} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {aRegler.some((l) => l.v.manques.some((m) => !reglesGlobales.has(m))) && (
                <div>
                  <p className="font-medium text-red-900">Par personne</p>
                  <ul className="mt-1 space-y-1.5">
                    {aRegler
                      .filter((l) => l.v.manques.some((m) => !reglesGlobales.has(m)))
                      .map((l) => (
                        <li key={l.e.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Link to={`/rh/p/${l.e.personne_id}`} className="font-medium text-pierre-900 underline" onClick={fermer}>
                            {l.source.personne.nom_complet}
                          </Link>
                          <span className="text-red-800">
                            {l.v.manques
                              .filter((m) => !reglesGlobales.has(m))
                              .map((m) => LIBELLES_MANQUES[m])
                              .join(', ')}
                          </span>
                          {l.v.manques.includes('matricule') && l.source.employe && <Matricule id={l.source.employe.id} nom={l.source.personne.nom_complet} />}
                          {l.v.manques.includes('fiche') && <span className="text-xs text-pierre-600">(fiche : onglet Personnes › Relier au référentiel)</span>}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {lignes.length === 0 ? (
            <p className={`${ui.carte} px-4 py-8 text-center text-pierre-500`}>Aucune embauche complète de genre emploi pour cette liste. Une embauche devient complète par « Valider l'embauche ».</p>
          ) : (
            <div className={`${ui.carte} overflow-x-auto`}>
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-pierre-50 text-left text-xs text-pierre-500">
                  <tr>
                    <th className="w-8 px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label="Tout cocher"
                        disabled={!pretes.length}
                        checked={pretes.length > 0 && choisies.length === pretes.length}
                        onChange={(ev) => setChoix(new Set(ev.target.checked ? pretes.map((l) => l.e.id) : []))}
                      />
                    </th>
                    <th className="px-2 py-2 font-medium">Nom</th>
                    <th className="px-2 py-2 font-medium">Compagnie · poste</th>
                    <th className="px-2 py-2 font-medium">Action</th>
                    <th className="px-2 py-2 font-medium">Dernier export</th>
                    <th className="px-2 py-2 font-medium">État</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pierre-100">
                  {lignes.map((l) => {
                    const pret = !l.v.manques.length
                    return (
                      <tr key={l.e.id} className={pret ? '' : 'bg-red-50/40'}>
                        <td className="px-3 py-1.5">
                          <input type="checkbox" aria-label={l.source.personne.nom_complet} disabled={!pret} checked={pret && coches.has(l.e.id)} onChange={() => basculer(l.e.id)} />
                        </td>
                        <td className="px-2 py-1.5">{l.source.personne.nom_complet}</td>
                        <td className="px-2 py-1.5 text-pierre-700">
                          {l.source.compagnie?.nom ?? '—'} · {l.source.poste?.nom ?? '—'}
                          {l.source.poste?.poste_employeur_d && <span className="ml-1 font-mono text-xs text-pierre-500">{l.source.poste.poste_employeur_d}</span>}
                        </td>
                        <td className="px-2 py-1.5" title={l.e.action_paie === 'M' ? 'Modification (déjà dans Employeur D) : date de réembauche' : 'Ajout'}>
                          {l.e.action_paie ?? '—'}
                        </td>
                        <td className="px-2 py-1.5 text-pierre-600" title={l.e.employeur_d_le ? horodatage(l.e.employeur_d_le) : undefined}>
                          {l.e.employeur_d_le ? `déjà exporté (${dateCourte(l.e.employeur_d_le.slice(0, 10))})` : '—'}
                        </td>
                        <td className="px-2 py-1.5">
                          {pret ? <span className="text-foret-700">Prête</span> : <span className="text-red-800">Manque : {l.v.manques.map((m) => LIBELLES_MANQUES[m]).join(', ')}</span>}
                          {l.v.avertissements.length > 0 && <span className="block text-xs text-amber-800">{l.v.avertissements.join(' ')}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {erreur && <p className={ui.erreur}>{erreur}</p>}
          {fait !== null && (
            <p className="rounded-lg bg-foret-50 px-3 py-2 text-foret-800">
              Fichier de {fait} ligne{fait > 1 ? 's' : ''} téléchargé : à importer dans Employeur D (gabarit « Données d'emploi »). Chaque personne est notée dans ses consultations.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-pierre-500">
              {choisies.length} ligne{choisies.length > 1 ? 's' : ''} sur {lignes.length}
            </span>
            <button className={ui.boutonSecondaire} onClick={fermer}>
              Fermer
            </button>
            <button className={ui.bouton} disabled={!choisies.length || enCours} onClick={telecharger}>
              <IconeTableur className="size-4" />
              {enCours ? 'Préparation…' : 'Télécharger le fichier (.xls)'}
            </button>
          </div>
        </div>
      )}
    </Dialogue>
  )
}

/**
 * Case enregistrée en la quittant (ou par Entrée) ; une valeur refusée par
 * la vérification ou la base s'affiche dessous.
 */
function ChampEnregistre({ libelle, placeholder, verifier: verif, enregistrer, inputMode, valeur = '' }: { libelle: string; placeholder: string; verifier: (t: string) => string | null; enregistrer: (t: string) => Promise<unknown>; inputMode?: 'numeric' | 'text'; valeur?: string }) {
  const [texte, setTexte] = useState(valeur)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  async function quitter() {
    const t = texte.replace(/\s/g, '')
    if (!t || t === valeur) return setErreur(null)
    const probleme = verif(t)
    if (probleme) return setErreur(probleme)
    setErreur(null)
    setEnCours(true)
    try {
      await enregistrer(t)
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setEnCours(false)
    }
  }
  return (
    <span className="flex flex-col items-end">
      <input
        aria-label={libelle}
        aria-invalid={!!erreur}
        className={`w-28 rounded-md border bg-white px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 ${erreur ? 'border-red-400 focus:ring-red-300' : 'border-pierre-300 focus:border-foret-600 focus:ring-foret-600/20'}`}
        placeholder={placeholder}
        inputMode={inputMode}
        value={texte}
        disabled={enCours}
        onChange={(ev) => setTexte(ev.target.value)}
        onBlur={quitter}
        onKeyDown={(ev) => ev.key === 'Enter' && ev.currentTarget.blur()}
      />
      {erreur && <span className="mt-0.5 max-w-56 text-right text-xs text-red-700">{erreur}</span>}
    </span>
  )
}

const huit = (t: string) => (/^[A-Za-z0-9]{1,8}$/.test(t) ? null : '1 à 8 lettres ou chiffres.')

function NumeroCompagnie({ id, nom }: { id: string; nom: string }) {
  const enregistrer = useEnregistrerNumeroCompagnie()
  return <ChampEnregistre libelle={`Numéro Employeur D de ${nom}`} placeholder="Numéro" verifier={huit} enregistrer={(t) => enregistrer.mutateAsync({ compagnie: id, numero: t })} />
}

function NumeroPoste({ id, nom }: { id: string; nom: string }) {
  const modifier = useModifierPoste()
  return <ChampEnregistre libelle={`Poste Employeur D de ${nom}`} placeholder="Poste" verifier={huit} enregistrer={(t) => modifier.mutateAsync({ id, champs: { poste_employeur_d: t.toUpperCase() } })} />
}

function Matricule({ id, nom }: { id: string; nom: string }) {
  const enregistrer = useEnregistrerMatricule()
  return (
    <ChampEnregistre
      libelle={`Matricule de ${nom}`}
      placeholder="Matricule"
      inputMode="numeric"
      verifier={(t) => (/^\d{1,9}$/.test(t) ? null : '1 à 9 chiffres.')}
      enregistrer={(t) => enregistrer.mutateAsync({ employe: id, matricule: t })}
    />
  )
}

function TitreEmploi({ valeurs }: { valeurs: unknown }) {
  const enregistrer = useEnregistrerReglage()
  return (
    <ChampEnregistre
      libelle="Numéro du titre d'emploi"
      placeholder="ex. 001"
      inputMode="numeric"
      verifier={(t) => (/^\d{1,3}$/.test(t) ? null : '1 à 3 chiffres.')}
      enregistrer={(t) => enregistrer.mutateAsync({ cle: 'employeur_d', valeur: { ...reglagesEmployeurD(valeurs), titre_emploi: t.padStart(3, '0') } })}
    />
  )
}
