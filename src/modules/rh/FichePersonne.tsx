import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BoutonModifier, BoutonSupprimer } from '@/lib/BoutonsAction'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { IconeCorbeille } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { SectionCourriels } from './CartesCourriels'
import { BoutonCopier, Champ, MenuCompagnie, MenuPoste, MenuSaison, PuceAncien, PuceStatut, PuceStatutEmbauche, Section, ZoneTexte } from './commun'
import { useRh } from './contexte'
import { BoutonBienvenue, ContratEmbauche } from './ContratEmbauche'
import { ListeDocuments } from './Documents'
import { PuceInvitation } from './IntentionRetour'
import { lienDossier, lienRetour } from './liens'
import {
  envoyerSpecimen,
  lirePaie,
  messageValidation,
  ouvrirSpecimen,
  useAjouterEmbauche,
  useAjouterNote,
  useConsultations,
  useDossier,
  useEnregistrerDossier,
  useEnregistrerPaie,
  useFusionnerPersonnes,
  useLienDossier,
  useModifierEmbauche,
  useModifierPersonne,
  useNotes,
  usePaie,
  useRetirerEmbauche,
  useRetirerNote,
  useSupprimerPersonne,
  useValiderEmbauche,
} from './donnees'
import { Journal } from './Journal'
import { age, correspond, dateCourte, estAncien, horodatage, libelleDate, nasLisible, nasMasque, nomAffiche, texteRecherche } from './outils'
import { champPetit } from './styles'
import {
  ACTIONS_PAIE,
  DIETES,
  GENRES_NOTE,
  REMUNERATIONS,
  STATUTS_EMBAUCHE,
  TAILLES,
  TYPES_EMPLOYE,
  VACANCES,
  type Dossier,
  type Embauche,
  type GenreEmbauche,
  type GenreNote,
  type PaieEnClair,
  type Personne,
  type StatutEmbauche,
} from './types'

/** Fiche d'une personne : embauches, dossier, paie, documents, notes et journal. */
export function FichePersonne() {
  const { id } = useParams()
  const { personneParId } = useRh()
  const p = id ? personneParId.get(id) : undefined
  if (!p) {
    return (
      <p className="py-8 text-center text-sm text-pierre-500">
        Personne introuvable.{' '}
        <Link to="/rh/personnes" className="text-foret-700 underline">
          Retour à la liste
        </Link>
      </p>
    )
  }
  return <Contenu p={p} />
}

function Contenu({ p }: { p: Personne }) {
  const { embauchesDe, candidaturesDe, saisonParId, invitations, ecriture, paie, auj } = useRh()
  const modifier = useModifierPersonne()
  const supprimer = useSupprimerPersonne()
  const naviguer = useNavigate()
  const [fusion, setFusion] = useState(false)
  const [nouvelleEmbauche, setNouvelleEmbauche] = useState(false)
  const changer = (champs: Partial<Personne>) => modifier.mutate({ id: p.id, champs })
  const embauches = [...(embauchesDe.get(p.id) ?? [])].sort((a, b) => (saisonParId.get(b.saison_id)?.rang ?? 0) - (saisonParId.get(a.saison_id)?.rang ?? 0))
  const candidatures = [...(candidaturesDe.get(p.id) ?? [])].sort((a, b) => b.recue_le.localeCompare(a.recue_le))
  const ans = age(p.date_naissance, auj)

  return (
    <div className="space-y-5">
      <div>
        <Link to="/rh/personnes" className="text-sm text-pierre-500 hover:text-pierre-800">
          ← Personnes
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <ChampTexte
            aria-label="Prénom"
            className="rounded-lg border border-transparent bg-transparent px-1 text-xl font-semibold hover:border-pierre-200 focus:border-foret-600 focus:outline-none"
            style={{ width: `${Math.max(4, p.prenom.length + 2)}ch` }}
            valeur={p.prenom}
            obligatoire
            disabled={!ecriture}
            enregistrer={(prenom) => changer({ prenom })}
          />
          <ChampTexte
            aria-label="Nom de famille"
            className="rounded-lg border border-transparent bg-transparent px-1 text-xl font-semibold hover:border-pierre-200 focus:border-foret-600 focus:outline-none"
            style={{ width: `${Math.max(12, p.nom_famille.length + 2)}ch` }}
            valeur={p.nom_famille}
            placeholder="Nom de famille"
            disabled={!ecriture}
            enregistrer={(nom_famille) => changer({ nom_famille })}
          />
          {estAncien(p, embauches, saisonParId) && <PuceAncien />}
          <div className="flex-1" />
          {ecriture && (
            <button className={ui.boutonSecondaire} onClick={() => setFusion(true)}>
              Fusionner avec…
            </button>
          )}
          {ecriture && (
            <BoutonSupprimer
              disabled={embauches.length > 0}
              title={embauches.length ? 'Une personne qui a des embauches ne se supprime pas (registre de paie).' : undefined}
              onClick={async () => {
                const ok = await confirmer({
                  titre: `Supprimer « ${nomAffiche(p)} » ?`,
                  message: 'Ses candidatures, son dossier, ses renseignements de paie, ses documents et ses notes seront effacés. Irréversible.',
                  libelleOk: 'Supprimer',
                  danger: true,
                })
                if (ok) supprimer.mutate(p.id, { onSuccess: () => naviguer('/rh/personnes') })
              }}
            />
          )}
        </div>
        {p.ne_pas_reembaucher && (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            ⛔ Ne pas réembaucher{p.raison_ne_pas ? ` : ${p.raison_ne_pas}` : ''}
          </p>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-5">
          <Section
            titre="Embauches"
            action={
              ecriture && (
                <button className={ui.boutonSecondaire} onClick={() => setNouvelleEmbauche(true)}>
                  + Embauche
                </button>
              )
            }
          >
            {embauches.length === 0 ? (
              <p className="text-sm text-pierre-500">Aucune embauche. On en crée une en acceptant une candidature, ou avec « + Embauche » (bénévole, ancien sans candidature).</p>
            ) : (
              <div className="space-y-3">
                {embauches.map((e) => (
                  <CarteEmbauche key={e.id} e={e} />
                ))}
              </div>
            )}
          </Section>

          <SectionCourriels personneId={p.id} />

          <Section titre="Candidatures">
            {candidatures.length === 0 ? (
              <p className="text-sm text-pierre-500">Aucune candidature.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {candidatures.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2">
                    <Link to={`/rh/c/${c.id}`} className="text-foret-800 hover:underline">
                      Reçue le {dateCourte(c.recue_le)}
                    </Link>
                    <span className="text-xs text-pierre-500">
                      {c.saison_ids
                        .map((id) => saisonParId.get(id)?.nom)
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                    <PuceStatut statut={c.statut} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {invitations.some((i) => i.personne_id === p.id) && (
            <Section titre="Intention de retour">
              <ul className="space-y-1.5 text-sm">
                {invitations
                  .filter((i) => i.personne_id === p.id)
                  .sort((a, b) => (saisonParId.get(b.saison_id)?.rang ?? 0) - (saisonParId.get(a.saison_id)?.rang ?? 0))
                  .map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{saisonParId.get(i.saison_id)?.nom}</span>
                      <PuceInvitation i={i} />
                      {i.candidature_id && (
                        <Link to={`/rh/c/${i.candidature_id}`} className="text-xs text-foret-700 underline">
                          Candidature
                        </Link>
                      )}
                      <span className="flex-1" />
                      <BoutonCopier url={lienRetour(i)} className="rounded-md border border-pierre-300 px-2 py-1 text-xs font-medium text-pierre-700 hover:bg-pierre-50" />
                    </li>
                  ))}
              </ul>
            </Section>
          )}

          <Section titre="Notes au dossier">
            <NotesDossier personneId={p.id} />
          </Section>

          <Section titre="Journal">
            <Journal personneId={p.id} />
          </Section>
        </div>

        <div className="space-y-5">
          <Section titre="Coordonnées">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Champ etiquette="Nom de camp">
                <ChampTexte className={ui.champ} valeur={p.surnom ?? ''} disabled={!ecriture} enregistrer={(v) => changer({ surnom: v || null })} />
              </Champ>
              <Champ etiquette={ans !== null ? `Naissance (${ans} ans)` : 'Date de naissance'}>
                <input
                  type="date"
                  className={ui.champ}
                  disabled={!ecriture}
                  defaultValue={p.date_naissance ?? ''}
                  key={p.date_naissance ?? ''}
                  onBlur={(e) => e.target.value !== (p.date_naissance ?? '') && changer({ date_naissance: e.target.value || null })}
                />
              </Champ>
              <Champ etiquette="Courriel" className="col-span-2">
                <ChampTexte className={ui.champ} type="email" valeur={p.courriel ?? ''} disabled={!ecriture} enregistrer={(v) => changer({ courriel: v || null })} />
              </Champ>
              <Champ etiquette="Téléphone">
                <ChampTexte className={ui.champ} valeur={p.telephone ?? ''} disabled={!ecriture} enregistrer={(v) => changer({ telephone: v || null })} />
              </Champ>
              <Champ etiquette="Sexe">
                <select className={ui.champ} disabled={!ecriture} value={p.sexe ?? ''} onChange={(e) => changer({ sexe: (e.target.value || null) as Personne['sexe'] })}>
                  <option value="">—</option>
                  <option value="f">Féminin</option>
                  <option value="m">Masculin</option>
                  <option value="x">Autre</option>
                </select>
              </Champ>
            </div>
          </Section>

          <SectionDossier personneId={p.id} />

          {paie.lecture && <SectionPaie personneId={p.id} />}

          <Section titre="Documents">
            <ListeDocuments personneId={p.id} />
          </Section>

          <Section titre="Conformité et suivi">
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Champ etiquette="Dernière VAJ">
                  <input
                    type="date"
                    className={ui.champ}
                    disabled={!ecriture}
                    defaultValue={p.vaj_le ?? ''}
                    key={p.vaj_le ?? ''}
                    onBlur={(e) => e.target.value !== (p.vaj_le ?? '') && changer({ vaj_le: e.target.value || null })}
                  />
                </Champ>
                <Champ etiquette="Note VAJ">
                  <ChampTexte className={ui.champ} valeur={p.vaj_note ?? ''} disabled={!ecriture} enregistrer={(v) => changer({ vaj_note: v || null })} />
                </Champ>
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" disabled={!ecriture} checked={p.deja_travaille} onChange={(e) => changer({ deja_travaille: e.target.checked })} />
                A déjà travaillé avec nous avant la base RH (saisons inconnues)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" disabled={!ecriture} checked={p.ne_pas_reembaucher} onChange={(e) => changer({ ne_pas_reembaucher: e.target.checked })} />
                Ne pas réembaucher
              </label>
              {p.ne_pas_reembaucher && (
                <ChampTexte className={ui.champ} placeholder="Raison" valeur={p.raison_ne_pas ?? ''} disabled={!ecriture} enregistrer={(v) => changer({ raison_ne_pas: v || null })} />
              )}
              <div>
                <p className={ui.etiquette}>Notes permanentes</p>
                <ZoneTexte valeur={p.notes ?? ''} disabled={!ecriture} enregistrer={(v) => changer({ notes: v || null })} />
              </div>
            </div>
          </Section>
        </div>
      </div>
      {fusion && <FenetreFusion p={p} fermer={() => setFusion(false)} />}
      {nouvelleEmbauche && <FenetreEmbauche p={p} fermer={() => setNouvelleEmbauche(false)} />}
    </div>
  )
}

// ------------------------------------------------------------
// Embauche d'une saison
// ------------------------------------------------------------
function CarteEmbauche({ e }: { e: Embauche }) {
  const { saisonParId, dates, textes, ecriture } = useRh()
  const modifier = useModifierEmbauche()
  const retirer = useRetirerEmbauche()
  const [ouverte, setOuverte] = useState(e.statut !== 'complete' && e.statut !== 'annulee')
  const changer = (champs: Partial<Embauche>) => modifier.mutate({ id: e.id, champs })
  const s = saisonParId.get(e.saison_id)
  const dispos = dates.filter((d) => e.disponibilites.includes(d.id))
  const presentation = Object.entries(e.presentation).filter(([, v]) => v)
  /** « (version 2) » d'un texte accepté. */
  const version = (id: string | null) => {
    const t = id ? textes.find((x) => x.id === id) : undefined
    return t ? ` (version ${t.version})` : ''
  }

  return (
    <div className="rounded-lg border border-pierre-200">
      <button className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm" onClick={() => setOuverte(!ouverte)}>
        <span className="font-semibold">{s?.nom}</span>
        {e.genre === 'benevolat' && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800 ring-1 ring-teal-200">Bénévolat</span>}
        <EnTeteEmbauche e={e} />
        <span className="flex-1" />
        <PuceStatutEmbauche statut={e.statut} />
        <span className="text-pierre-400">{ouverte ? '▴' : '▾'}</span>
      </button>
      {ouverte && (
        <div className="space-y-4 border-t border-pierre-100 px-3 py-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Champ etiquette="Statut">
              <select className={ui.champ} disabled={!ecriture} value={e.statut} onChange={(x) => changer({ statut: x.target.value as StatutEmbauche })}>
                {/* « Complète » passe par « Valider l'embauche » (champs de paie exigés). */}
                {STATUTS_EMBAUCHE.filter((st) => st.id !== 'complete' || e.statut === 'complete').map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.nom}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ etiquette="Compagnie">
              <MenuCompagnie valeur={e.entreprise_id} disabled={!ecriture} changer={(v) => changer({ entreprise_id: v })} />
            </Champ>
            <Champ etiquette="Poste">
              <MenuPoste valeur={e.poste_id} compagnie={e.entreprise_id} disabled={!ecriture} changer={(v) => changer({ poste_id: v })} />
            </Champ>
            {e.genre === 'emploi' && (
              <Champ etiquette="Échelon">
                <select className={ui.champ} disabled={!ecriture} value={e.echelon ?? ''} onChange={(x) => changer({ echelon: x.target.value ? Number(x.target.value) : null })}>
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Champ>
            )}
            <ChampDate etiquette="Début" valeur={e.debut} disabled={!ecriture} enregistrer={(debut) => changer({ debut })} />
            <ChampDate etiquette="Fin" valeur={e.fin} disabled={!ecriture} enregistrer={(fin) => changer({ fin })} />
          </div>

          <DossierEmbauche e={e} />
          <ContratEmbauche e={e} />

          {e.genre === 'emploi' && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-pierre-600">Paie</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Champ etiquette="Rémunération">
                  <MenuValeurs valeurs={REMUNERATIONS} valeur={e.remuneration} disabled={!ecriture} changer={(remuneration) => changer({ remuneration })} />
                </Champ>
                <Champ etiquette={e.remuneration === 'semaine' ? 'Taux ($ / semaine)' : 'Taux ($ / heure)'}>
                  <ChampTexte
                    className={ui.champ}
                    inputMode="decimal"
                    valeur={e.taux === null ? '' : String(e.taux).replace('.', ',')}
                    disabled={!ecriture}
                    enregistrer={(v) => {
                      const n = Number(v.replace(',', '.').replace(/[^\d.]/g, ''))
                      changer({ taux: v.trim() === '' || Number.isNaN(n) ? null : n })
                    }}
                  />
                </Champ>
                <Champ etiquette="4 %">
                  <MenuValeurs valeurs={VACANCES} valeur={e.vacances} disabled={!ecriture} changer={(vacances) => changer({ vacances })} />
                </Champ>
                <Champ etiquette="Type d'employé">
                  <MenuValeurs valeurs={TYPES_EMPLOYE} valeur={e.type_employe} disabled={!ecriture} changer={(type_employe) => changer({ type_employe })} />
                </Champ>
                <Champ etiquette="Action (paie)">
                  <MenuValeurs valeurs={ACTIONS_PAIE} valeur={e.action_paie} disabled={!ecriture} changer={(action_paie) => changer({ action_paie })} />
                </Champ>
                <ChampDate etiquette="Date d'embauche" valeur={e.date_embauche} disabled={!ecriture} enregistrer={(date_embauche) => changer({ date_embauche })} />
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className={ui.etiquette}>Disponibilités</p>
              {dispos.length ? (
                <ul className="space-y-0.5 text-pierre-800">
                  {dispos.map((d) => (
                    <li key={d.id}>{libelleDate(d)}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-pierre-400">Rien d'indiqué.</p>
              )}
              {e.disponibilites_note && <p className="mt-1 whitespace-pre-line text-pierre-600">{e.disponibilites_note}</p>}
            </div>
            <div className="space-y-2">
              <p>
                <span className={ui.etiquette}>Code d'éthique</span>
                {e.code_ethique_le ? `Accepté le ${dateCourte(e.code_ethique_le)}${version(e.code_ethique_texte)}` : <span className="text-pierre-400">Pas encore accepté</span>}
              </p>
              {e.genre === 'benevolat' && (
                <p>
                  <span className={ui.etiquette}>Entente de bénévolat</span>
                  {e.entente_benevolat_le ? `Acceptée le ${dateCourte(e.entente_benevolat_le)}${version(e.entente_benevolat_texte)}` : <span className="text-pierre-400">Pas encore acceptée</span>}
                </p>
              )}
              {e.dossier_recu_le && (
                <p>
                  <span className={ui.etiquette}>Dossier reçu</span>
                  {horodatage(e.dossier_recu_le)}
                </p>
              )}
              {e.commentaires && (
                <p>
                  <span className={ui.etiquette}>Commentaires de l'employé</span>
                  <span className="whitespace-pre-line">{e.commentaires}</span>
                </p>
              )}
            </div>
          </div>

          {presentation.length > 0 && (
            <div>
              <p className={ui.etiquette}>Présentation de l'équipe</p>
              <dl className="grid gap-1 sm:grid-cols-2">
                {presentation.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-pierre-500">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {ecriture && (
            <div className="flex justify-end">
              <button
                className="inline-flex items-center gap-1 text-xs text-pierre-500 hover:text-red-700"
                onClick={async () => {
                  if (
                    await confirmer({
                      titre: `Supprimer l'embauche de ${s?.nom ?? 'cette saison'} ?`,
                      message: "Pour un refus ou un départ, mieux vaut la passer à « Annulée » (l'historique reste).",
                      libelleOk: 'Supprimer',
                      danger: true,
                    })
                  )
                    retirer.mutate(e.id)
                }}
              >
                <IconeCorbeille className="size-3.5" /> Supprimer l'embauche
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Lien personnel du dossier d'embauche (/dossier/<jeton>) : créer, copier,
 * refaire ; courriel de bienvenue (qui le contient) ; « Marquer comme
 * envoyé » ; « Valider » (→ complète, le lien se ferme).
 */
function DossierEmbauche({ e }: { e: Embauche }) {
  const { ecriture } = useRh()
  const lien = useLienDossier()
  const valider = useValiderEmbauche()
  const modifier = useModifierEmbauche()
  if (e.statut === 'complete' || e.statut === 'annulee')
    return e.jeton ? <p className="text-xs text-pierre-500">Lien du dossier d'embauche fermé ({e.statut === 'complete' ? 'embauche complète' : 'embauche annulée'}).</p> : null
  const url = e.jeton ? lienDossier(e.jeton) : null
  const petit = 'rounded-md border border-pierre-300 bg-white px-2 py-1 text-xs font-medium text-pierre-700 hover:bg-pierre-50 disabled:opacity-50'
  const aide =
    e.statut === 'dossier_recu'
      ? "Dossier reçu : vérifie-le, complète la paie, puis valide. D'ici là, la personne peut le corriger avec le même lien."
      : url
        ? e.statut === 'a_envoyer'
          ? 'Prépare le courriel de bienvenue (il contient le lien), ou copie le lien et envoie-le autrement, puis « Marquer comme envoyé ».'
          : 'En attente du dossier (rappel préparé seul après quelques jours).'
        : 'La personne remplit son dossier (coordonnées, paie, santé, urgence, disponibilités, code d’éthique, documents) par un lien personnel, sans compte.'

  return (
    <div className="space-y-2 rounded-lg border border-pierre-200 bg-pierre-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-pierre-600">Dossier d'embauche</p>
      {url ? (
        <div className="flex flex-wrap items-center gap-2">
          <a href={url} target="_blank" rel="noreferrer" className="max-w-full truncate font-mono text-xs text-foret-700 underline">
            {url}
          </a>
          <BoutonCopier url={url} className={petit} />
          {ecriture && e.statut === 'a_envoyer' && (
            <button className={petit} disabled={modifier.isPending} onClick={() => modifier.mutate({ id: e.id, champs: { statut: 'envoyee' } })}>
              Marquer comme envoyé
            </button>
          )}
          {ecriture && (
            <button
              className="text-xs text-pierre-500 underline hover:text-pierre-800"
              disabled={lien.isPending}
              onClick={async () => {
                if (await confirmer({ titre: 'Refaire le lien du dossier ?', message: "L'ancien lien ne fonctionnera plus.", libelleOk: 'Refaire' }))
                  lien.mutate({ embauche: e.id, refaire: true })
              }}
            >
              Refaire le lien
            </button>
          )}
        </div>
      ) : (
        ecriture && (
          <button className={ui.boutonSecondaire} disabled={lien.isPending} onClick={() => lien.mutate({ embauche: e.id })}>
            Créer le lien du dossier
          </button>
        )
      )}
      {ecriture && <BoutonBienvenue e={e} />}
      <p className="text-xs text-pierre-500">{aide}</p>
      {ecriture && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            className={e.statut === 'dossier_recu' ? ui.bouton : ui.boutonSecondaire}
            disabled={valider.isPending}
            onClick={async () => {
              if (
                e.statut !== 'dossier_recu' &&
                !(await confirmer({ titre: "Valider sans dossier reçu ?", message: "La personne n'a pas encore envoyé son dossier par le lien. Une fois validée, l'embauche est complète et le lien se ferme.", libelleOk: 'Valider' }))
              )
                return
              valider.mutate(e.id)
            }}
          >
            Valider l'embauche
          </button>
          <span className="text-xs text-pierre-500">{e.genre === 'emploi' ? 'Exige la paie complète, le NAS et le compte bancaire.' : 'Exige la compagnie.'}</span>
        </div>
      )}
      {valider.error && <p className={ui.erreur}>{messageValidation(valider.error) ?? messageErreur(valider.error)}</p>}
      {lien.error && <p className={ui.erreur}>{messageErreur(lien.error)}</p>}
    </div>
  )
}

function EnTeteEmbauche({ e }: { e: Embauche }) {
  const { posteParId, compagnieParId } = useRh()
  const poste = e.poste_id ? posteParId.get(e.poste_id) : undefined
  const compagnie = e.entreprise_id ? compagnieParId.get(e.entreprise_id) : undefined
  return (
    <span className="text-pierre-700">
      {poste?.nom ?? (e.genre === 'benevolat' ? 'Bénévole' : 'Poste à préciser')}
      {compagnie && <span className="text-pierre-500"> · {compagnie.abreviation ?? compagnie.nom}</span>}
      {e.echelon && <span className="text-pierre-500"> · échelon {e.echelon}</span>}
    </span>
  )
}

function MenuValeurs<K extends string>({ valeurs, valeur, changer, disabled }: { valeurs: Record<K, string>; valeur: K | null; changer: (v: K | null) => void; disabled?: boolean }) {
  return (
    <select className={ui.champ} disabled={disabled} value={valeur ?? ''} onChange={(e) => changer((e.target.value || null) as K | null)}>
      <option value="">—</option>
      {(Object.entries(valeurs) as [K, string][]).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </select>
  )
}

function ChampDate({ etiquette, valeur, enregistrer, disabled }: { etiquette: string; valeur: string | null; enregistrer: (v: string | null) => void; disabled?: boolean }) {
  return (
    <Champ etiquette={etiquette}>
      <input
        type="date"
        className={ui.champ}
        disabled={disabled}
        defaultValue={valeur ?? ''}
        key={valeur ?? ''}
        onBlur={(e) => e.target.value !== (valeur ?? '') && enregistrer(e.target.value || null)}
      />
    </Champ>
  )
}

/**
 * Ajouter une embauche sans passer par une candidature : un bénévole, ou un
 * ancien réembauché directement. Un emploi d'un ancien est proposé en « M ».
 */
function FenetreEmbauche({ p, fermer }: { p: Personne; fermer: () => void }) {
  const { saisons, saisonParId, embauchesDe, posteParId } = useRh()
  const ajouter = useAjouterEmbauche()
  const [genre, setGenre] = useState<GenreEmbauche>('emploi')
  const [saison, setSaison] = useState<string | null>(saisons.find((s) => s.ouverte)?.id ?? null)
  const [compagnie, setCompagnie] = useState<string | null>(null)
  const [poste, setPoste] = useState<string | null>(null)
  const [echelon, setEchelon] = useState<number | null>(null)
  const siennes = embauchesDe.get(p.id) ?? []
  const deja = saison ? siennes.some((e) => e.saison_id === saison && e.statut !== 'annulee') : false
  const pret = !!saison && !!compagnie && (genre === 'benevolat' || !!poste)

  return (
    <Dialogue titre="Nouvelle embauche" fermer={fermer}>
      <div className="space-y-3 text-sm">
        <div className="flex gap-2">
          {(['emploi', 'benevolat'] as const).map((g) => (
            <button
              key={g}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${genre === g ? 'border-foret-700 bg-foret-700 text-white' : 'border-pierre-200 text-pierre-700'}`}
              onClick={() => setGenre(g)}
            >
              {g === 'emploi' ? 'Emploi' : 'Bénévolat'}
            </button>
          ))}
        </div>
        <Champ etiquette="Saison">
          <MenuSaison valeur={saison} changer={setSaison} vide="À choisir" />
        </Champ>
        {deja && <p className="text-xs text-amber-700">Cette personne a déjà une embauche pour cette saison.</p>}
        <Champ etiquette="Compagnie">
          <MenuCompagnie
            valeur={compagnie}
            changer={(v) => {
              setCompagnie(v)
              if (poste && posteParId.get(poste)?.entreprise_id !== v) setPoste(null)
            }}
            vide="À choisir"
          />
        </Champ>
        <Champ etiquette={genre === 'benevolat' ? 'Poste (facultatif)' : 'Poste'}>
          <MenuPoste valeur={poste} changer={setPoste} compagnie={compagnie} />
        </Champ>
        {genre === 'emploi' && (
          <Champ etiquette="Échelon">
            <select className={ui.champ} value={echelon ?? ''} onChange={(e) => setEchelon(e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Champ>
        )}
        {ajouter.error && <p className={ui.erreur}>{messageErreur(ajouter.error)}</p>}
        <div className="flex justify-end gap-2">
          <button className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button
            className={ui.bouton}
            disabled={!pret || ajouter.isPending}
            onClick={() => {
              const s = saisonParId.get(saison!)
              ajouter.mutate(
                {
                  id: crypto.randomUUID(),
                  personne_id: p.id,
                  genre,
                  saison_id: saison!,
                  entreprise_id: compagnie,
                  poste_id: poste,
                  echelon: genre === 'emploi' ? echelon : null,
                  debut: s?.debut ?? null,
                  fin: s?.fin ?? null,
                  action_paie: genre === 'emploi' ? (estAncien(p, siennes, saisonParId) ? 'M' : 'A') : null,
                },
                { onSuccess: fermer },
              )
            }}
          >
            Ajouter
          </button>
        </div>
      </div>
    </Dialogue>
  )
}

// ------------------------------------------------------------
// Dossier (adresse, santé, urgence)
// ------------------------------------------------------------
const CHAMPS_DOSSIER: { cle: keyof Dossier; nom: string; large?: boolean }[] = [
  { cle: 'adresse', nom: 'Adresse', large: true },
  { cle: 'ville', nom: 'Ville' },
  { cle: 'code_postal', nom: 'Code postal' },
  { cle: 'province', nom: 'Province' },
  { cle: 'pays', nom: 'Pays' },
  { cle: 'assurance_maladie', nom: "Numéro d'assurance maladie", large: true },
  { cle: 'etudes', nom: 'Études (programme et établissement)', large: true },
  { cle: 'allergies', nom: 'Allergies ou intolérances', large: true },
]
const CHAMPS_URGENCE: { cle: keyof Dossier; nom: string }[] = [
  { cle: 'urgence1_nom', nom: 'Contact 1' },
  { cle: 'urgence1_lien', nom: 'Lien' },
  { cle: 'urgence1_telephone', nom: 'Téléphone' },
  { cle: 'urgence2_nom', nom: 'Contact 2' },
  { cle: 'urgence2_lien', nom: 'Lien' },
  { cle: 'urgence2_telephone', nom: 'Téléphone' },
]

function SectionDossier({ personneId }: { personneId: string }) {
  const { ecriture } = useRh()
  const dossier = useDossier(personneId)
  const enregistrer = useEnregistrerDossier(personneId)
  const [edition, setEdition] = useState(false)
  const d = dossier.data
  const changer = (champs: Partial<Dossier>) => enregistrer.mutate(champs)
  const texte = (cle: keyof Dossier) => (d?.[cle] as string | null | undefined) ?? ''

  return (
    <Section titre="Dossier" action={ecriture && !edition && <BoutonModifier onClick={() => setEdition(true)} />}>
      {dossier.isLoading ? (
        <p className="text-sm text-pierre-500">Chargement…</p>
      ) : edition ? (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            {CHAMPS_DOSSIER.map((c) => (
              <Champ key={c.cle} etiquette={c.nom} className={c.large ? 'col-span-2' : ''}>
                <ChampTexte className={ui.champ} valeur={texte(c.cle)} enregistrer={(v) => changer({ [c.cle]: v || null })} />
              </Champ>
            ))}
            <Champ etiquette="Étudiant à temps plein">
              <select
                className={ui.champ}
                value={d?.etudiant_temps_plein === null || d?.etudiant_temps_plein === undefined ? '' : d.etudiant_temps_plein ? 'oui' : 'non'}
                onChange={(e) => changer({ etudiant_temps_plein: e.target.value === '' ? null : e.target.value === 'oui' })}
              >
                <option value="">—</option>
                <option value="oui">Oui</option>
                <option value="non">Non</option>
              </select>
            </Champ>
            <Champ etiquette="Diète">
              <select className={ui.champ} value={d?.diete ?? ''} onChange={(e) => changer({ diete: (e.target.value || null) as Dossier['diete'] })}>
                <option value="">—</option>
                {DIETES.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nom}
                  </option>
                ))}
              </select>
            </Champ>
            <Champ etiquette="T-shirt">
              <select className={ui.champ} value={d?.taille_tshirt ?? ''} onChange={(e) => changer({ taille_tshirt: (e.target.value || null) as Dossier['taille_tshirt'] })}>
                <option value="">—</option>
                {TAILLES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Champ>
            <Champ etiquette="Hoodie">
              <select className={ui.champ} value={d?.taille_hoodie ?? ''} onChange={(e) => changer({ taille_hoodie: (e.target.value || null) as Dossier['taille_hoodie'] })}>
                <option value="">—</option>
                {TAILLES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Champ>
          </div>
          <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-pierre-600">En cas d'urgence</p>
          <div className="grid grid-cols-3 gap-2">
            {CHAMPS_URGENCE.map((c) => (
              <Champ key={c.cle} etiquette={c.nom}>
                <ChampTexte className={ui.champ} valeur={texte(c.cle)} enregistrer={(v) => changer({ [c.cle]: v || null })} />
              </Champ>
            ))}
          </div>
          {enregistrer.error && <p className={ui.erreur}>{messageErreur(enregistrer.error)}</p>}
          <button className={ui.boutonSecondaire} onClick={() => setEdition(false)}>
            Terminé
          </button>
        </div>
      ) : !d ? (
        <p className="text-sm text-pierre-500">Pas encore de dossier. Il se remplit avec le dossier d'embauche.</p>
      ) : (
        <DossierLecture d={d} />
      )}
    </Section>
  )
}

function DossierLecture({ d }: { d: Dossier }) {
  const adresse = [d.adresse, [d.ville, d.province].filter(Boolean).join(', '), d.code_postal, d.pays].filter(Boolean).join(' · ')
  const ligne = (nom: string, v: string | null | undefined) =>
    v ? (
      <div>
        <dt className="text-xs text-pierre-500">{nom}</dt>
        <dd className="text-pierre-800">{v}</dd>
      </div>
    ) : null
  const urgence = (n: string | null, l: string | null, t: string | null) => [n, l && `(${l})`, t].filter(Boolean).join(' ')
  return (
    <dl className="space-y-2 text-sm">
      {ligne('Adresse', adresse)}
      {ligne("Assurance maladie", d.assurance_maladie)}
      {ligne('Études', [d.etudiant_temps_plein === true ? 'Temps plein' : d.etudiant_temps_plein === false ? 'Pas aux études à temps plein' : null, d.etudes].filter(Boolean).join(' · '))}
      {ligne('Allergies', d.allergies)}
      {ligne('Diète', DIETES.find((x) => x.id === d.diete)?.nom)}
      {ligne('Tailles', [d.taille_tshirt && `T-shirt ${d.taille_tshirt}`, d.taille_hoodie && `hoodie ${d.taille_hoodie}`].filter(Boolean).join(', '))}
      {ligne("En cas d'urgence", [urgence(d.urgence1_nom, d.urgence1_lien, d.urgence1_telephone), urgence(d.urgence2_nom, d.urgence2_lien, d.urgence2_telephone)].filter(Boolean).join(' · '))}
    </dl>
  )
}

// ------------------------------------------------------------
// Paie : masquée, « Afficher » (noté), modification à part
// ------------------------------------------------------------
function SectionPaie({ personneId }: { personneId: string }) {
  const { paie: acces } = useRh()
  const paie = usePaie(personneId, true)
  const consultations = useConsultations(personneId, true)
  const [enClair, setEnClair] = useState<PaieEnClair | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [edition, setEdition] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const p = paie.data

  // Le NAS en clair disparaît après une minute.
  useEffect(() => {
    if (!enClair) return
    const t = setTimeout(() => setEnClair(null), 60_000)
    return () => clearTimeout(t)
  }, [enClair])

  const afficher = async () => {
    setErreur(null)
    try {
      setEnClair(await lirePaie(personneId))
      consultations.refetch()
    } catch (e) {
      setErreur(messageErreur(e))
    }
  }

  return (
    <Section titre="🔒 Paie" action={acces.ecriture && !edition && <BoutonModifier onClick={() => setEdition(true)} />}>
      {paie.isLoading ? (
        <p className="text-sm text-pierre-500">Chargement…</p>
      ) : (
        <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <dt className="text-xs text-pierre-500">NAS</dt>
              <dd className="font-mono">{enClair ? nasLisible(enClair.nas) || '—' : nasMasque(p?.nas_fin ?? null) || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-pierre-500">Transit</dt>
              <dd className="font-mono">{p?.transit ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-pierre-500">Institution</dt>
              <dd className="font-mono">{p?.institution ?? '—'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-pierre-500">Compte</dt>
              <dd className="font-mono">{enClair ? enClair.compte || '—' : p?.compte_fin ? `•••${p.compte_fin}` : '—'}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            {(p?.nas_fin || p?.compte_fin) &&
              (enClair ? (
                <button className={ui.boutonSecondaire} onClick={() => setEnClair(null)}>
                  Masquer
                </button>
              ) : (
                <button className={ui.boutonSecondaire} onClick={afficher} title="Chaque affichage est noté">
                  👁 Afficher
                </button>
              ))}
            {p?.specimen && (
              <button className={ui.boutonSecondaire} onClick={() => ouvrirSpecimen(personneId, p.specimen!).then(() => consultations.refetch()).catch((e) => setErreur(messageErreur(e)))}>
                Spécimen de chèque
              </button>
            )}
            {acces.ecriture && (
              <label className={`${ui.boutonSecondaire} cursor-pointer`}>
                {envoi ? 'Envoi…' : p?.specimen ? 'Remplacer le spécimen' : '📎 Spécimen de chèque'}
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (!f) return
                    setEnvoi(true)
                    setErreur(null)
                    try {
                      await envoyerSpecimen(personneId, f, p?.specimen ?? null)
                      await paie.refetch()
                    } catch (er) {
                      setErreur(messageErreur(er))
                    } finally {
                      setEnvoi(false)
                    }
                  }}
                />
              </label>
            )}
          </div>
          {p?.updated_by_nom && <p className="text-xs text-pierre-500">Modifiée par {p.updated_by_nom}, {horodatage(p.updated_at)}.</p>}
          {erreur && <p className={ui.erreur}>{erreur}</p>}
          {(consultations.data?.length ?? 0) > 0 && (
            <details className="text-xs text-pierre-500">
              <summary className="cursor-pointer">Consultations ({consultations.data!.length})</summary>
              <ul className="mt-1 space-y-0.5">
                {consultations.data!.slice(0, 20).map((c) => (
                  <li key={c.id}>
                    {horodatage(c.le)} · {c.par_nom ?? '?'} · {c.quoi === 'specimen' ? 'spécimen' : 'NAS et compte'}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {edition && <FenetrePaie personneId={personneId} fermer={() => setEdition(false)} />}
    </Section>
  )
}

/** Modifier la paie : seuls les champs remplis changent ; « Effacer » vide un champ. */
function FenetrePaie({ personneId, fermer }: { personneId: string; fermer: () => void }) {
  const enregistrer = useEnregistrerPaie(personneId)
  const [nas, setNas] = useState('')
  const [transit, setTransit] = useState('')
  const [institution, setInstitution] = useState('')
  const [compte, setCompte] = useState('')
  const vide = (v: string) => (v.trim() ? v : null)
  return (
    <Dialogue titre="Renseignements de paie" fermer={fermer}>
      <div className="space-y-3 text-sm">
        <p className="text-pierre-600">Seuls les champs remplis seront changés.</p>
        <Champ etiquette="NAS (9 chiffres)">
          <input className={`${ui.champ} font-mono`} inputMode="numeric" autoComplete="off" value={nas} onChange={(e) => setNas(e.target.value)} />
        </Champ>
        <div className="grid grid-cols-2 gap-3">
          <Champ etiquette="Transit (5 chiffres)">
            <input className={`${ui.champ} font-mono`} inputMode="numeric" autoComplete="off" value={transit} onChange={(e) => setTransit(e.target.value)} />
          </Champ>
          <Champ etiquette="Institution (3 chiffres)">
            <input className={`${ui.champ} font-mono`} inputMode="numeric" autoComplete="off" value={institution} onChange={(e) => setInstitution(e.target.value)} />
          </Champ>
        </div>
        <Champ etiquette="Numéro de compte">
          <input className={`${ui.champ} font-mono`} inputMode="numeric" autoComplete="off" value={compte} onChange={(e) => setCompte(e.target.value)} />
        </Champ>
        {enregistrer.error && (
          <p className={ui.erreur}>{String(enregistrer.error.message).includes('NAS_INVALIDE') ? "Ce NAS n'est pas valide (9 chiffres, clé de contrôle)." : messageErreur(enregistrer.error)}</p>
        )}
        <div className="flex justify-end gap-2">
          <button className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button
            className={ui.bouton}
            disabled={enregistrer.isPending || ![nas, transit, institution, compte].some((v) => v.trim())}
            onClick={() => enregistrer.mutate({ nas: vide(nas), transit: vide(transit), institution: vide(institution), compte: vide(compte) }, { onSuccess: fermer })}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </Dialogue>
  )
}

// ------------------------------------------------------------
// Notes au dossier
// ------------------------------------------------------------
function NotesDossier({ personneId }: { personneId: string }) {
  const { ecriture, auj } = useRh()
  const notes = useNotes(personneId)
  const ajouter = useAjouterNote(personneId)
  const retirer = useRetirerNote(personneId)
  const [genre, setGenre] = useState<GenreNote>('note')
  const [jour, setJour] = useState(auj)
  const [texte, setTexte] = useState('')
  return (
    <div className="space-y-3 text-sm">
      {ecriture && (
        <form
          className="space-y-2 rounded-lg bg-pierre-50 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!texte.trim()) return
            ajouter.mutate({ genre, jour, texte: texte.trim() }, { onSuccess: () => setTexte('') })
          }}
        >
          <div className="flex flex-wrap gap-2">
            <select className={champPetit} value={genre} onChange={(e) => setGenre(e.target.value as GenreNote)}>
              {GENRES_NOTE.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nom}
                </option>
              ))}
            </select>
            <input type="date" className={champPetit} value={jour} max={auj} onChange={(e) => setJour(e.target.value || auj)} />
          </div>
          <textarea className={ui.champ} rows={2} placeholder="Ce qui s'est passé, ce qui a été dit…" value={texte} onChange={(e) => setTexte(e.target.value)} />
          <button className={ui.bouton} disabled={!texte.trim() || ajouter.isPending}>
            Ajouter au dossier
          </button>
        </form>
      )}
      {(notes.data ?? []).length === 0 && !notes.isLoading && <p className="text-pierre-500">Aucune note.</p>}
      <ul className="space-y-2">
        {(notes.data ?? []).map((n) => {
          const g = GENRES_NOTE.find((x) => x.id === n.genre)!
          return (
            <li key={n.id} className="rounded-lg border border-pierre-100 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-medium ${g.couleur}`}>{g.nom}</span>
                <span className="text-pierre-500">
                  {dateCourte(n.jour)}
                  {n.auteur_nom && ` · ${n.auteur_nom}`}
                </span>
                <span className="flex-1" />
                {ecriture && (
                  <button
                    className="text-pierre-400 hover:text-red-700"
                    title="Supprimer"
                    onClick={async () => (await confirmer({ titre: 'Supprimer cette note ?', libelleOk: 'Supprimer', danger: true })) && retirer.mutate(n.id)}
                  >
                    <IconeCorbeille className="size-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-line text-pierre-800">{n.texte}</p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ------------------------------------------------------------
// Fusion de deux fiches d'une même personne
// ------------------------------------------------------------
function FenetreFusion({ p, fermer }: { p: Personne; fermer: () => void }) {
  const { personnes, personneParId, candidaturesDe, embauchesDe } = useRh()
  const fusionner = useFusionnerPersonnes()
  const naviguer = useNavigate()
  const [recherche, setRecherche] = useState('')
  const [autreId, setAutreId] = useState<string | null>(null)
  const [garderId, setGarderId] = useState<string>(p.id)

  // Sans recherche : même prénom et même nom de famille (doublons probables).
  const proposees = useMemo(() => {
    const cle = recherche.trim() || `${p.prenom} ${p.nom_famille}`
    return personnes.filter((x) => x.id !== p.id && correspond(texteRecherche(x), cle)).slice(0, 8)
  }, [personnes, p, recherche])

  const autre = autreId ? personneParId.get(autreId) : undefined
  // Par défaut, la fiche qui a le plus d'historique reste ; à égalité, la plus ancienne.
  const poids = (x: Personne) => (candidaturesDe.get(x.id) ?? []).length + (embauchesDe.get(x.id) ?? []).length
  const choisir = (id: string) => {
    setAutreId(id)
    const b = personneParId.get(id)!
    setGarderId(poids(b) > poids(p) || (poids(b) === poids(p) && b.created_at < p.created_at) ? b.id : p.id)
  }
  const garder = autre && garderId === autre.id ? autre : p
  const retirer = autre && garder.id === p.id ? autre : p
  const resume = (x: Personne) => `${(candidaturesDe.get(x.id) ?? []).length} candidature(s), ${(embauchesDe.get(x.id) ?? []).length} embauche(s)`

  return (
    <Dialogue titre={`Fusionner « ${nomAffiche(p)} » avec…`} fermer={fermer}>
      <div className="space-y-3 text-sm">
        {!autre ? (
          <>
            <input className={ui.champ} autoFocus placeholder="Chercher l'autre fiche…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
            <div className="space-y-1">
              {proposees.map((x) => (
                <button key={x.id} className="block w-full rounded-md border border-pierre-200 px-2 py-1.5 text-left hover:bg-pierre-50" onClick={() => choisir(x.id)}>
                  {nomAffiche(x)} {x.courriel && <span className="text-pierre-500">· {x.courriel}</span>}
                  <span className="block text-xs text-pierre-500">{resume(x)}</span>
                </button>
              ))}
              {proposees.length === 0 && <p className="text-pierre-500">Aucune fiche semblable.</p>}
            </div>
          </>
        ) : (
          <>
            <p className="text-pierre-600">Laquelle reste ?</p>
            {[p, autre].map((x) => (
              <label key={x.id} className="flex items-start gap-2 rounded-md border border-pierre-200 px-2 py-1.5">
                <input type="radio" name="garder" className="mt-0.5" checked={garder.id === x.id} onChange={() => setGarderId(x.id)} />
                <span>
                  <span className="font-medium">{nomAffiche(x)}</span>
                  {x.courriel && <span className="text-pierre-500"> · {x.courriel}</span>}
                  <span className="block text-xs text-pierre-500">{resume(x)}</span>
                </span>
              </label>
            ))}
            <p className="rounded-lg bg-pierre-50 px-3 py-2 text-pierre-700">
              « {nomAffiche(retirer)} » sera supprimée. Ses candidatures, embauches, documents, notes et son journal passent à « {nomAffiche(garder)} », dont les champs vides sont complétés. Irréversible.
            </p>
            {fusionner.error && <p className={ui.erreur}>{messageErreur(fusionner.error)}</p>}
            <div className="flex justify-between gap-2">
              <button className={ui.boutonSecondaire} onClick={() => setAutreId(null)}>
                ← Autre fiche
              </button>
              <button
                className={ui.boutonDanger}
                disabled={fusionner.isPending}
                onClick={() =>
                  fusionner.mutate(
                    { garder: garder.id, retirer: retirer.id },
                    {
                      onSuccess: () => {
                        fermer()
                        naviguer(`/rh/p/${garder.id}`)
                      },
                    },
                  )
                }
              >
                Fusionner
              </button>
            </div>
          </>
        )}
      </div>
    </Dialogue>
  )
}
