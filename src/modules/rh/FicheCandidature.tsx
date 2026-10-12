import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BoutonModifier, BoutonSupprimer } from '@/lib/BoutonsAction'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import {
  ChoixPostes,
  ChoixSaisons,
  MenuCompagnie,
  MenuPoste,
  MenuSaison,
  NomPoste,
  PuceAncien,
  PuceStatut,
  PuceStatutEmbauche,
  Section,
  ZoneTexte,
} from './commun'
import { useRh } from './contexte'
import { ListeDocuments } from './Documents'
import { useAccepter, useEffacerCandidature, useModifierCandidature, useRetirerCandidature } from './donnees'
import { Journal } from './Journal'
import { dateCourte, estAncien, nomAffiche } from './outils'
import { PRE_DECISIONS, REPONSES, SOURCES, STATUTS, type Candidature, type Statut } from './types'

/** Fiche d'une candidature : la demande, le tri, l'entrevue et la décision. */
export function FicheCandidature() {
  const { id } = useParams()
  const { candidatures } = useRh()
  const c = candidatures.find((x) => x.id === id)
  if (!c) {
    return (
      <p className="py-8 text-center text-sm text-pierre-500">
        Candidature introuvable.{' '}
        <Link to="/rh" className="text-foret-700 underline">
          Retour aux candidatures
        </Link>
      </p>
    )
  }
  return <Contenu c={c} />
}

function Contenu({ c }: { c: Candidature }) {
  const { personneParId, embauchesDe, candidaturesDe, saisonParId, ecriture, auj } = useRh()
  const p = personneParId.get(c.personne_id)!
  const modifier = useModifierCandidature()
  const retirer = useRetirerCandidature()
  const effacer = useEffacerCandidature()
  const naviguer = useNavigate()
  const [accepter, setAccepter] = useState(false)
  const [modifierDemande, setModifierDemande] = useState(false)
  const changer = (champs: Partial<Candidature>) => modifier.mutate({ id: c.id, champs })
  const embauches = embauchesDe.get(p.id) ?? []
  const ancien = c.source === 'retour' || estAncien(p, embauches, saisonParId)
  const autres = (candidaturesDe.get(p.id) ?? []).filter((x) => x.id !== c.id).sort((a, b) => b.recue_le.localeCompare(a.recue_le))
  const sesEmbauches = embauches.filter((e) => e.candidature_id === c.id)

  return (
    <div className="space-y-5">
      <div>
        <Link to="/rh" className="text-sm text-pierre-500 hover:text-pierre-800">
          ← Candidatures
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <Link to={`/rh/p/${p.id}`} className="text-xl font-semibold text-pierre-900 hover:underline">
            {nomAffiche(p)}
          </Link>
          {ancien && <PuceAncien />}
          <PuceStatut statut={c.statut} />
        </div>
        <p className="mt-1 text-sm text-pierre-600">
          {[p.courriel, p.telephone].filter(Boolean).join(' · ')}
          {p.courriel || p.telephone ? ' · ' : ''}
          Reçue le {dateCourte(c.recue_le)} ({SOURCES[c.source]})
        </p>
        {p.ne_pas_reembaucher && (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            ⛔ Ne pas réembaucher{p.raison_ne_pas ? ` : ${p.raison_ne_pas}` : ''}
          </p>
        )}
        {c.efface_le && (
          <p className="mt-2 rounded-lg bg-pierre-100 px-3 py-2 text-sm text-pierre-700">Renseignements effacés le {dateCourte(c.efface_le)} (Loi 25).</p>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-5">
          <Section titre="Tri et décision">
            <div className="space-y-4 text-sm">
              <div>
                <p className={ui.etiquette}>Pré-décision</p>
                <div className="flex flex-wrap gap-1.5">
                  {PRE_DECISIONS.map((d) => (
                    <button
                      key={d.id}
                      disabled={!ecriture}
                      onClick={() => changer({ pre_decision: c.pre_decision === d.id ? null : d.id })}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${c.pre_decision === d.id ? d.couleur : 'border-pierre-200 text-pierre-600 hover:bg-pierre-50'}`}
                    >
                      {d.nom}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={ui.etiquette}>Statut</span>
                  <select
                    className={ui.champ}
                    disabled={!ecriture}
                    value={c.statut}
                    onChange={(e) => {
                      const s = e.target.value as Statut
                      if (s === 'acceptee') setAccepter(true)
                      else changer({ statut: s })
                    }}
                  >
                    {STATUTS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id === 'acceptee' && c.statut !== 'acceptee' ? 'Accepter…' : s.nom}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={ui.etiquette}>Compagnie qui traite</span>
                  <MenuCompagnie valeur={c.entreprise_id} disabled={!ecriture} changer={(v) => changer({ entreprise_id: v })} vide="À choisir" />
                </label>
              </div>
              {ecriture && (
                <div className="flex flex-wrap gap-2">
                  <button className={ui.bouton} onClick={() => setAccepter(true)}>
                    {sesEmbauches.length ? 'Accepter pour une autre saison…' : 'Accepter…'}
                  </button>
                  {c.statut === 'recue' && (
                    <button className={ui.boutonSecondaire} onClick={() => changer({ statut: 'entrevue_proposee' })}>
                      Proposer une entrevue
                    </button>
                  )}
                </div>
              )}
              {sesEmbauches.length > 0 && (
                <div>
                  <p className={ui.etiquette}>Embauches</p>
                  <ul className="space-y-1">
                    {sesEmbauches.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{saisonParId.get(e.saison_id)?.nom}</span>
                        <EmbauchePoste posteId={e.poste_id} />
                        {e.echelon && <span className="text-xs text-pierre-500">échelon {e.echelon}</span>}
                        <PuceStatutEmbauche statut={e.statut} />
                        <Link to={`/rh/p/${p.id}`} className="text-xs text-foret-700 underline">
                          Dossier
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Section>

          <Section titre="Entrevue">
            <div className="space-y-3 text-sm">
              <label className="block max-w-xs">
                <span className={ui.etiquette}>Date</span>
                <input
                  type="date"
                  className={ui.champ}
                  disabled={!ecriture}
                  defaultValue={c.entrevue_le ?? ''}
                  key={c.entrevue_le ?? ''}
                  onBlur={(e) => e.target.value !== (c.entrevue_le ?? '') && changer({ entrevue_le: e.target.value || null })}
                />
              </label>
              <ZoneTexte
                aria-label="Notes d'entrevue"
                placeholder="Notes d'entrevue…"
                rangees={5}
                disabled={!ecriture}
                valeur={c.notes_entrevue ?? ''}
                enregistrer={(v) => changer({ notes_entrevue: v || null })}
              />
            </div>
          </Section>

          <Section titre="Commentaires internes">
            <ZoneTexte
              aria-label="Commentaires internes"
              placeholder="Impressions, références, suivi…"
              rangees={4}
              disabled={!ecriture}
              valeur={c.commentaires ?? ''}
              enregistrer={(v) => changer({ commentaires: v || null })}
            />
          </Section>

          <Section titre="Journal de la candidature">
            <Journal personneId={p.id} candidatureId={c.id} />
          </Section>
        </div>

        <div className="space-y-5">
          <Section titre="Demande" action={ecriture && !modifierDemande && <BoutonModifier onClick={() => setModifierDemande(true)} />}>
            {modifierDemande ? (
              <div className="space-y-3 text-sm">
                <div>
                  <p className={ui.etiquette}>Saisons demandées</p>
                  <ChoixSaisons valeur={c.saison_ids} changer={(v) => changer({ saison_ids: v })} />
                </div>
                <div>
                  <p className={ui.etiquette}>Postes demandés</p>
                  <ChoixPostes valeur={c.poste_ids} changer={(v) => changer({ poste_ids: v })} />
                </div>
                <button className={ui.boutonSecondaire} onClick={() => setModifierDemande(false)}>
                  Terminé
                </button>
              </div>
            ) : (
              <Demande c={c} />
            )}
          </Section>

          <Section titre="Réponses du formulaire">
            <Reponses c={c} />
          </Section>

          <Section titre="CV">
            <ListeDocuments personneId={p.id} genres={['cv']} candidatureId={c.id} />
          </Section>

          {autres.length > 0 && (
            <Section titre="Autres candidatures">
              <ul className="space-y-1 text-sm">
                {autres.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2">
                    <Link to={`/rh/c/${a.id}`} className="text-foret-800 hover:underline">
                      {dateCourte(a.recue_le, auj)}
                    </Link>
                    <span className="text-xs text-pierre-500">
                      {a.saison_ids
                        .map((id) => saisonParId.get(id)?.nom)
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                    <PuceStatut statut={a.statut} />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {ecriture && (
            <div className="flex flex-wrap justify-end gap-2">
              {!c.efface_le && (
                <button
                  className={ui.boutonSecondaire}
                  onClick={async () => {
                    const ok = await confirmer({
                      titre: 'Effacer les renseignements de cette candidature ?',
                      message: 'Les réponses, les commentaires, les notes d’entrevue et le CV seront effacés (Loi 25). Le statut et le journal restent. Irréversible.',
                      libelleOk: 'Effacer',
                      danger: true,
                    })
                    if (ok) effacer.mutate(c.id)
                  }}
                >
                  Effacer les renseignements
                </button>
              )}
              <BoutonSupprimer
                onClick={async () => {
                  const ok = await confirmer({
                    titre: 'Supprimer cette candidature ?',
                    message: sesEmbauches.length ? 'Ses embauches restent dans le dossier de la personne.' : 'La personne reste dans la liste des personnes.',
                    libelleOk: 'Supprimer',
                    danger: true,
                  })
                  if (ok) retirer.mutate(c.id, { onSuccess: () => naviguer('/rh') })
                }}
              >
                Supprimer la candidature
              </BoutonSupprimer>
            </div>
          )}
        </div>
      </div>

      {accepter && <FenetreAccepter c={c} fermer={() => setAccepter(false)} />}
    </div>
  )
}

function EmbauchePoste({ posteId }: { posteId: string | null }) {
  const { posteParId } = useRh()
  return <NomPoste poste={posteId ? posteParId.get(posteId) : undefined} />
}

function Demande({ c }: { c: Candidature }) {
  const { saisonParId, posteParId } = useRh()
  const saisons = c.saison_ids
    .map((id) => saisonParId.get(id))
    .filter((s) => !!s)
    .sort((a, b) => a.rang - b.rang)
  const postes = c.poste_ids.map((id) => posteParId.get(id)).filter((x) => !!x)
  return (
    <div className="space-y-2 text-sm">
      <p>
        <span className={ui.etiquette}>Saisons</span>
        {saisons.length ? saisons.map((s) => s.nom).join(', ') : <span className="text-pierre-400">Aucune</span>}
      </p>
      <div>
        <span className={ui.etiquette}>Postes</span>
        {postes.length ? (
          <ul className="space-y-0.5">
            {postes.map((x) => (
              <li key={x.id}>
                <NomPoste poste={x} />
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-pierre-400">Aucun</span>
        )}
      </div>
    </div>
  )
}

function Reponses({ c }: { c: Candidature }) {
  const reponses = c.reponses ?? {}
  const lignes = REPONSES.filter((r) => reponses[r.cle])
  const autres = Object.keys(reponses).filter((k) => !REPONSES.some((r) => r.cle === k) && reponses[k])
  if (!lignes.length && !autres.length) return <p className="text-sm text-pierre-500">Aucune réponse.</p>
  return (
    <dl className="space-y-2 text-sm">
      {lignes.map((r) => (
        <div key={r.cle}>
          <dt className="text-xs font-medium text-pierre-500">{r.nom}</dt>
          <dd className={r.long ? 'whitespace-pre-line text-pierre-800' : 'text-pierre-800'}>{r.cle === 'date_debut' ? dateCourte(reponses[r.cle]) : reponses[r.cle]}</dd>
        </div>
      ))}
      {autres.map((k) => (
        <div key={k}>
          <dt className="text-xs font-medium text-pierre-500">{k}</dt>
          <dd className="whitespace-pre-line text-pierre-800">{reponses[k]}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Accepter : saison, compagnie, poste et échelon. Crée l'embauche (une par
 * saison) ; le dossier d'embauche se remplit ensuite dans la fiche de la
 * personne (lien envoyé par courriel en phase 3).
 */
function FenetreAccepter({ c, fermer }: { c: Candidature; fermer: () => void }) {
  const { saisonParId, posteParId, embauchesDe, saisons } = useRh()
  const accepter = useAccepter()
  const deja = new Set((embauchesDe.get(c.personne_id) ?? []).filter((e) => e.statut !== 'annulee').map((e) => e.saison_id))
  const demandees = c.saison_ids.map((id) => saisonParId.get(id)).filter((s) => !!s)
  const saisonDefaut = demandees.find((s) => !deja.has(s.id) && s.ouverte) ?? demandees.find((s) => !deja.has(s.id)) ?? saisons.find((s) => s.ouverte)
  const premierPoste = c.poste_id ? posteParId.get(c.poste_id) : c.poste_ids.map((id) => posteParId.get(id)).find((x) => !!x)
  // Échelon de la dernière embauche (un ancien garde le sien, à hausser au besoin).
  const derniere = [...(embauchesDe.get(c.personne_id) ?? [])].filter((e) => e.echelon).sort((a, b) => (saisonParId.get(b.saison_id)?.rang ?? 0) - (saisonParId.get(a.saison_id)?.rang ?? 0))[0]

  const [saison, setSaison] = useState<string | null>(c.saison_id && !deja.has(c.saison_id) ? c.saison_id : (saisonDefaut?.id ?? null))
  const [compagnie, setCompagnie] = useState<string | null>(c.entreprise_id ?? premierPoste?.entreprise_id ?? null)
  const [poste, setPoste] = useState<string | null>(premierPoste && (!compagnie || premierPoste.entreprise_id === compagnie) ? premierPoste.id : null)
  const [echelon, setEchelon] = useState<number | null>(c.echelon ?? derniere?.echelon ?? 1)

  const pret = !!saison && !!compagnie && !!poste
  return (
    <Dialogue titre="Accepter la candidature" fermer={fermer}>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className={ui.etiquette}>Saison</span>
          <MenuSaison valeur={saison} changer={setSaison} vide="À choisir" />
          {saison && deja.has(saison) && <span className="mt-1 block text-xs text-amber-700">Cette personne a déjà une embauche pour cette saison.</span>}
        </label>
        <label className="block">
          <span className={ui.etiquette}>Compagnie</span>
          <MenuCompagnie
            valeur={compagnie}
            changer={(v) => {
              setCompagnie(v)
              if (poste && posteParId.get(poste)?.entreprise_id !== v) setPoste(null)
            }}
            vide="À choisir"
          />
        </label>
        <label className="block">
          <span className={ui.etiquette}>Poste</span>
          <MenuPoste valeur={poste} changer={setPoste} compagnie={compagnie} />
        </label>
        <label className="block">
          <span className={ui.etiquette}>Échelon</span>
          <select className={ui.champ} value={echelon ?? ''} onChange={(e) => setEchelon(e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {derniere?.echelon && (
            <span className="mt-1 block text-xs text-pierre-500">
              Échelon {derniere.echelon} à {saisonParId.get(derniere.saison_id)?.nom}.
            </span>
          )}
        </label>
        {accepter.error && <p className={ui.erreur}>{messageErreur(accepter.error)}</p>}
        <div className="flex justify-end gap-2">
          <button className={ui.boutonSecondaire} onClick={fermer}>
            Annuler
          </button>
          <button
            className={ui.bouton}
            disabled={!pret || accepter.isPending}
            onClick={() => accepter.mutate({ candidature: c.id, saison: saison!, entreprise: compagnie!, poste: poste!, echelon }, { onSuccess: fermer })}
          >
            Accepter et créer l'embauche
          </button>
        </div>
      </div>
    </Dialogue>
  )
}

