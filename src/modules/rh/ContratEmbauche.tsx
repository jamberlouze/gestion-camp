import { useState } from 'react'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { useOutilsCourriels } from './CartesCourriels'
import { useRh } from './contexte'
import {
  ouvrirFichier,
  SEAU_DOCUMENTS,
  useAnnulerContrat,
  useCompagniesRh,
  useContrats,
  useCourriels,
  useDocuments,
  useDossier,
  useLienDossier,
  useModelesContrats,
  usePreparerContrat,
} from './donnees'
import { lienDossier } from './liens'
import { age, dateCourte, horodatage } from './outils'
import { manquesContrat, modeleContratPour, type Employe, type TermesContrat } from './termesContrat'
import type { Embauche } from './types'

// Contrat d'une embauche (plan-rh.md §6) : préparé ici (termes figés,
// pré-signé au nom de la personne qui le prépare), signé par l'employé dans
// son dossier d'embauche ; consentement parental d'une personne mineure ;
// courriel de bienvenue avec le lien du dossier.

const petit = 'rounded-md border border-pierre-300 bg-white px-2 py-1 text-xs font-medium text-pierre-700 hover:bg-pierre-50 disabled:opacity-50'

/** Ouvre un PDF produit dans le navigateur (aperçu). */
function ouvrirPdf(octets: Uint8Array) {
  const url = URL.createObjectURL(new Blob([octets as BlobPart], { type: 'application/pdf' }))
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function ContratEmbauche({ e }: { e: Embauche }) {
  const { saisonParId, posteParId, compagnieParId, personneParId, ecriture, auj } = useRh()
  const { profil } = useAuth()
  const contrats = useContrats()
  const modeles = useModelesContrats()
  const compagniesRh = useCompagniesRh()
  const dossier = useDossier(e.personne_id)
  const documents = useDocuments(e.personne_id)
  const preparer = usePreparerContrat()
  const annuler = useAnnulerContrat()
  const [erreur, setErreur] = useState<string | null>(null)
  if (e.statut === 'annulee') return null

  const p = personneParId.get(e.personne_id)
  const s = saisonParId.get(e.saison_id)
  const poste = e.poste_id ? posteParId.get(e.poste_id) : undefined
  const siens = (contrats.data ?? []).filter((k) => k.embauche_id === e.id)
  const contrat = siens.filter((k) => k.genre === 'contrat' && k.statut !== 'annule').at(-1)
  const consentement = siens.filter((k) => k.genre === 'consentement' && k.statut === 'signe').at(-1)
  const debut = e.debut ?? s?.debut ?? auj
  const ans = p ? age(p.date_naissance, debut) : null
  const mineur = ans !== null && ans < 18
  const genreSaison = s?.genre === 'ete' ? 'ete' : 'hors_ete'
  const modele = modeles.data ? modeleContratPour(modeles.data, 'contrat', e.entreprise_id, genreSaison) : null

  /** Termes du contrat d'après l'embauche, le poste et les réglages de la compagnie. */
  const termes = (): TermesContrat => {
    const rh = compagniesRh.data?.find((c) => c.entreprise_id === e.entreprise_id)
    const nom = e.entreprise_id ? (compagnieParId.get(e.entreprise_id)?.nom ?? '') : ''
    return {
      poste: poste?.nom ?? '',
      saison: s?.nom ?? '',
      genre_saison: genreSaison,
      debut: e.debut ?? s?.debut ?? null,
      fin: e.fin ?? s?.fin ?? null,
      remuneration: e.remuneration,
      taux: e.taux,
      echelon: e.echelon,
      compagnie: {
        nom,
        raison_sociale: rh?.raison_sociale ?? '',
        nom_court: rh?.nom_court ?? '',
        adresse: rh?.adresse ?? '',
        courriel: rh?.adresse_envoi ?? '',
        telephone: rh?.telephone ?? '',
      },
      taches: poste?.taches ?? null,
      // La base les pose de toute façon : la personne connectée, aujourd'hui.
      signataire: profil?.nom ?? '',
      prepare_le: auj,
    }
  }

  const employe = (): Employe | null =>
    p
      ? {
          prenom: p.prenom,
          nom_famille: p.nom_famille,
          courriel: p.courriel,
          telephone: p.telephone,
          adresse: dossier.data?.adresse ?? null,
          ville: dossier.data?.ville ?? null,
          province: dossier.data?.province ?? null,
          code_postal: dossier.data?.code_postal ?? null,
        }
      : null

  const apercu = async (titre: string, contenu: string, t: TermesContrat) => {
    setErreur(null)
    try {
      const { pdfContrat } = await import('./contrat')
      ouvrirPdf((await pdfContrat(titre, contenu, t, employe(), auj)).octets)
    } catch (x) {
      setErreur(messageErreur(x))
    }
  }

  const preparerContrat = async () => {
    setErreur(null)
    if (!modele) return setErreur('Aucun modèle de contrat (Réglages › Contrats).')
    const t = termes()
    const manque = manquesContrat(t)
    if (manque.length) return setErreur(`Il manque ${manque.join(', ')}.`)
    if (
      contrat?.statut === 'en_attente' &&
      !(await confirmer({ titre: 'Refaire le contrat ?', message: 'Le contrat en attente sera annulé et remplacé par celui-ci (termes à jour).', libelleOk: 'Refaire' }))
    )
      return
    if (modele.a_valider && !(await confirmer({ titre: 'Modèle pas encore relu', message: 'Ce modèle de contrat est marqué « à valider » (Réglages › Contrats). Préparer quand même ?', libelleOk: 'Préparer' })))
      return
    preparer.mutate({ embauche_id: e.id, personne_id: e.personne_id, titre: modele.titre, contenu: modele.contenu, termes: t }, { onError: (x) => setErreur(messageErreur(x)) })
  }

  const docSigne = contrat?.document_id ? documents.data?.find((d) => d.id === contrat.document_id) : undefined
  const docConsentement = consentement?.document_id ? documents.data?.find((d) => d.id === consentement.document_id) : undefined

  return (
    <div className="space-y-2 rounded-lg border border-pierre-200 p-3">
      {e.genre === 'emploi' && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-pierre-600">Contrat</p>
          {!contrat ? (
            <p className="text-pierre-600">Pas encore préparé. Il se signe dans le dossier d’embauche ; la validation l’exige.</p>
          ) : contrat.statut === 'signe' ? (
            <p className="text-foret-800">
              ✓ Signé le {contrat.signe_le ? horodatage(contrat.signe_le) : ''} par {contrat.nom_signataire}
              <span className="text-pierre-500"> · préparé par {contrat.cree_par_nom}</span>
            </p>
          ) : (
            <p className="text-amber-800">
              En attente de la signature · préparé le {dateCourte(contrat.cree_le.slice(0, 10))} par {contrat.cree_par_nom}
              {contrat.termes.taux !== null && ` · ${String(contrat.termes.taux).replace('.', ',')} $ ${contrat.termes.remuneration === 'semaine' ? 'par semaine' : 'de l’heure'}`}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {docSigne && (
              <button className={petit} onClick={() => ouvrirFichier(SEAU_DOCUMENTS, docSigne.chemin).catch((x) => setErreur(messageErreur(x)))}>
                Voir le contrat signé
              </button>
            )}
            {contrat?.statut === 'en_attente' && (
              <button className={petit} onClick={() => apercu(contrat.titre, contrat.contenu, contrat.termes)}>
                Aperçu
              </button>
            )}
            {ecriture && contrat?.statut !== 'signe' && e.statut !== 'complete' && (
              <>
                {!contrat && modele && (
                  <button className={petit} onClick={() => apercu(modele.titre, modele.contenu, { ...termes(), signataire: profil?.nom ?? '' })}>
                    Aperçu
                  </button>
                )}
                <button className={contrat ? petit : ui.boutonSecondaire} disabled={preparer.isPending || !modeles.data || !compagniesRh.data} onClick={preparerContrat}>
                  {contrat ? 'Refaire avec les termes à jour' : 'Préparer le contrat'}
                </button>
                {contrat?.statut === 'en_attente' && (
                  <button
                    className="text-xs text-red-700 underline"
                    onClick={async () => {
                      if (await confirmer({ titre: 'Annuler le contrat en attente ?', message: 'La personne ne pourra plus le signer.', libelleOk: 'Annuler le contrat', danger: true }))
                        annuler.mutate(contrat.id)
                    }}
                  >
                    Annuler
                  </button>
                )}
              </>
            )}
          </div>
          {!contrat && ecriture && modele?.a_valider && <p className="text-xs text-amber-700">Le modèle « {modele.titre} » est encore à valider (Réglages › Contrats).</p>}
        </>
      )}
      {mineur && (
        <div className={e.genre === 'emploi' ? 'border-t border-pierre-100 pt-2' : ''}>
          <p className="text-xs font-semibold uppercase tracking-wide text-pierre-600">Consentement parental ({ans} ans au début)</p>
          {consentement ? (
            <p className="text-foret-800">
              ✓ Signé le {consentement.signe_le ? horodatage(consentement.signe_le) : ''} par {consentement.nom_signataire} ({consentement.lien_signataire?.toLowerCase()})
              {docConsentement && (
                <button className="ml-2 text-xs text-foret-700 underline" onClick={() => ouvrirFichier(SEAU_DOCUMENTS, docConsentement.chemin).catch((x) => setErreur(messageErreur(x)))}>
                  Voir
                </button>
              )}
            </p>
          ) : (
            <p className="text-amber-800">À signer par un parent dans le dossier d’embauche (ou à joindre aux documents). La validation l’exige.</p>
          )}
        </div>
      )}
      {(erreur || contrats.error) && <p className={ui.erreur}>{erreur ?? messageErreur(contrats.error)}</p>}
    </div>
  )
}

/** « Préparer le courriel de bienvenue » : lien du dossier (créé au besoin) dans le modèle de la compagnie. */
export function BoutonBienvenue({ e }: { e: Embauche }) {
  const { personneParId, saisonParId, posteParId } = useRh()
  const outils = useOutilsCourriels()
  const lien = useLienDossier()
  const contrats = useContrats()
  const courriels = useCourriels({ personne: e.personne_id })
  const [message, setMessage] = useState<string | null>(null)
  const p = personneParId.get(e.personne_id)
  const deja = courriels.data?.find((c) => c.genre === 'bienvenue' && c.embauche_id === e.id && c.statut !== 'annule')
  if (!p || e.statut === 'complete' || e.statut === 'annulee') return null

  const preparer = async () => {
    setMessage(null)
    const contrat = contrats.data?.some((k) => k.embauche_id === e.id && k.genre === 'contrat' && k.statut !== 'annule')
    if (
      e.genre === 'emploi' &&
      !contrat &&
      !(await confirmer({
        titre: 'Le contrat n’est pas préparé',
        message: 'La personne ne pourra pas le signer en remplissant son dossier (elle pourra revenir au même lien quand il le sera). Préparer le courriel quand même ?',
        libelleOk: 'Préparer',
      }))
    )
      return
    try {
      const jeton = e.jeton ?? (await lien.mutateAsync({ embauche: e.id }))
      const r = outils.rediger({
        genre: 'bienvenue',
        personne: p,
        entreprise: e.entreprise_id,
        cle: `bienvenue:${e.id}:${jeton}`,
        saison: saisonParId.get(e.saison_id)?.nom,
        poste: e.poste_id ? posteParId.get(e.poste_id)?.nom : null,
        lienDossier: lienDossier(jeton),
        embauche_id: e.id,
        candidature_id: e.candidature_id,
      })
      if ('raison' in r) return setMessage(r.raison)
      await outils.preparer.mutateAsync([r.courriel])
      setMessage('Courriel préparé : relisez-le dans « Courriels » plus bas, puis envoyez.')
    } catch (x) {
      setMessage(messageErreur(x))
    }
  }

  if (deja)
    return (
      <span className="text-xs text-pierre-500">
        Courriel de bienvenue {deja.statut === 'envoye' ? `envoyé${deja.envoye_le ? ` le ${dateCourte(deja.envoye_le.slice(0, 10))}` : ''}` : 'préparé (à envoyer, plus bas)'}
      </span>
    )
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button className={ui.bouton} disabled={!outils.pret || lien.isPending || outils.preparer.isPending} onClick={preparer}>
        Préparer le courriel de bienvenue
      </button>
      {message && <span className="text-xs text-pierre-600">{message}</span>}
    </span>
  )
}
