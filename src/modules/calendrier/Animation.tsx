import { useMemo, useState } from 'react'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { IconeDupliquer, IconePlus } from '@/lib/icones'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { Chargement, NavDate, Section } from './commun'
import { nonConfirme, sejourDuJour, sejourVisible, useDateChoisie, useSejoursPlage } from './outils'
import { ajouterJours, dateCourte, dateLongue, plageHeures } from './dates'
import { useAffectations, useEcriture, useEnregistrer, usePersonnel, useRetirer, useSejours } from './donnees'
import type { Affectation, Personne, Sejour } from './types'

/** Feuille de route de l'animation : par jour, chaque animateur et ses activités. */
export function Animation() {
  const [date, choisir] = useDateChoisie()
  const ecriture = useEcriture()
  const personnel = usePersonnel()
  const sejours = useSejours()
  const affectations = useAffectations(date, date)
  const duJour = useSejoursPlage(sejours.data, date, date)
  const [fiche, setFiche] = useState<{ affectation?: Partial<Affectation> } | null>(null)

  const nomSejour = useMemo(() => new Map((sejours.data ?? []).map((s) => [s.id, s.nom_groupe])), [sejours.data])
  const parAnimateur = useMemo(() => {
    const m = new Map<string, Affectation[]>()
    for (const a of affectations.data ?? []) m.set(a.personnel_id, [...(m.get(a.personnel_id) ?? []), a])
    return m
  }, [affectations.data])
  const personnes = new Map((personnel.data ?? []).map((p) => [p.id, p]))
  const animateurs = [...parAnimateur.keys()].sort((a, b) => (personnes.get(a)?.nom ?? '').localeCompare(personnes.get(b)?.nom ?? '', 'fr'))
  const avecAnimation = duJour.filter((s) => s.avec_animation)

  const erreur = personnel.error ?? sejours.error ?? affectations.error
  return (
    <div className="space-y-4">
      <NavDate
        titre={dateLongue(date)}
        date={date}
        choisir={choisir}
        precedent={ajouterJours(date, -1)}
        suivant={ajouterJours(date, 1)}
        droite={
          ecriture && (
            <button className={ui.bouton} onClick={() => setFiche({ affectation: { date } })}>
              <IconePlus /> Activité
            </button>
          )
        }
      />
      {erreur && <p className={ui.erreur}>{messageErreur(erreur)}</p>}

      {avecAnimation.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {avecAnimation.map((s) => {
            const n = new Set((affectations.data ?? []).filter((a) => a.sejour_id === s.id).map((a) => a.personnel_id)).size
            const requis = s.nb_animateurs ?? 0
            const manque = requis ? n < requis : n === 0
            return (
              <span
                key={s.id}
                className={`rounded-lg border px-3 py-1.5 text-sm ${manque ? 'border-red-200 bg-red-50 text-red-900' : 'border-foret-600/30 bg-foret-50 text-foret-800'} ${nonConfirme(s) ? 'border-dashed' : ''}`}
              >
                <span className="font-medium">{s.nom_groupe}</span> · {n}
                {requis ? ` / ${requis}` : ''} animateur{(requis || n) > 1 ? 's' : ''}
              </span>
            )
          })}
        </div>
      )}

      {!affectations.data || !personnel.data ? (
        <Chargement />
      ) : !animateurs.length ? (
        <p className={`${ui.carte} p-6 text-center text-sm text-pierre-500`}>Aucune activité prévue ce jour-là.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {animateurs.map((id) => (
            <Section key={id} titre={personnes.get(id)?.nom ?? 'Personne retirée'}>
              <ul className="space-y-2">
                {parAnimateur.get(id)!.map((a) => (
                  <li key={a.id}>
                    <button
                      className="w-full rounded-lg border border-pierre-200 px-3 py-2 text-left hover:bg-pierre-50 disabled:hover:bg-white"
                      disabled={!ecriture}
                      onClick={() => setFiche({ affectation: a })}
                    >
                      <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                        <span className="font-medium">{a.activite || 'Animation'}</span>
                        <span className="text-xs text-pierre-500">{plageHeures(a.heure_debut, a.heure_fin)}</span>
                      </span>
                      <span className="block text-sm text-pierre-600">
                        {[a.sejour_id && nomSejour.get(a.sejour_id), a.lieu].filter(Boolean).join(' · ')}
                      </span>
                      {a.preparation && <span className="mt-1 block whitespace-pre-line text-sm text-pierre-700">Préparation : {a.preparation}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          ))}
        </div>
      )}

      {fiche && personnel.data && sejours.data && (
        <FicheAffectation affectation={fiche.affectation ?? { date }} personnel={personnel.data} sejours={sejours.data} fermer={() => setFiche(null)} />
      )}
    </div>
  )
}

function FicheAffectation({
  affectation,
  personnel,
  sejours,
  fermer,
}: {
  affectation: Partial<Affectation>
  personnel: Personne[]
  sejours: Sejour[]
  fermer: () => void
}) {
  const enregistrer = useEnregistrer<Affectation>('affectations_animation', true)
  const retirer = useRetirer('affectations_animation')
  const existante = !!affectation.id
  const [personne, setPersonne] = useState(affectation.personnel_id ?? '')
  const [date, setDate] = useState(affectation.date ?? '')
  const [sejour, setSejour] = useState(affectation.sejour_id ?? '')
  const [activite, setActivite] = useState(affectation.activite ?? '')
  const [heureDebut, setHeureDebut] = useState(affectation.heure_debut?.slice(0, 5) ?? '')
  const [heureFin, setHeureFin] = useState(affectation.heure_fin?.slice(0, 5) ?? '')
  const [lieu, setLieu] = useState(affectation.lieu ?? '')
  const [preparation, setPreparation] = useState(affectation.preparation ?? '')
  const [copie, setCopie] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  // Animateurs d'abord, puis le reste du personnel actif (et la personne déjà choisie).
  const choix = personnel
    .filter((p) => p.actif || p.id === affectation.personnel_id)
    .sort((a, b) => Number(b.secteur_principal === 'animation') - Number(a.secteur_principal === 'animation') || a.nom.localeCompare(b.nom, 'fr'))
  const sejoursDuJour = sejours.filter((s) => (sejourVisible(s) && sejourDuJour(s, date)) || s.id === affectation.sejour_id)

  const valeurs = (d: string) => ({
    personnel_id: personne,
    date: d,
    sejour_id: sejour || null,
    activite: activite.trim() || null,
    heure_debut: heureDebut || null,
    heure_fin: heureFin || null,
    lieu: lieu.trim() || null,
    preparation: preparation.trim() || null,
  })

  async function valider(e: React.FormEvent) {
    e.preventDefault()
    if (!personne) return setErreur('Choisissez un animateur.')
    if (!date) return setErreur('La date est obligatoire.')
    if (heureDebut && heureFin && heureFin < heureDebut) return setErreur("L'heure de fin est avant l'heure de début.")
    try {
      await enregistrer.mutateAsync({ id: affectation.id, ...valeurs(date) })
      fermer()
    } catch (err) {
      setErreur(messageErreur(err))
    }
  }

  async function dupliquer() {
    if (!copie || !personne) return
    try {
      await enregistrer.mutateAsync({ ...valeurs(copie), sejour_id: sejours.some((s) => s.id === sejour && s.date_arrivee <= copie && copie <= s.date_depart) ? sejour : null })
      fermer()
    } catch (err) {
      setErreur(messageErreur(err))
    }
  }

  async function supprimer() {
    if (!affectation.id || !(await confirmer({ titre: 'Retirer cette activité ?', message: 'Elle reste consultable dans le journal.' }))) return
    try {
      await retirer.mutateAsync(affectation.id)
      fermer()
    } catch (err) {
      setErreur(messageErreur(err))
    }
  }

  return (
    <Dialogue titre={existante ? "Modifier l'activité" : 'Nouvelle activité'} fermer={fermer}>
      <form className="space-y-3" onSubmit={valider}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={ui.etiquette} htmlFor="af-personne">
              Animateur
            </label>
            <select id="af-personne" className={ui.champ} value={personne} onChange={(e) => setPersonne(e.target.value)} autoFocus={!existante}>
              <option value="">Choisir…</option>
              {choix.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="af-date">
              Date
            </label>
            <input id="af-date" type="date" required className={ui.champ} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="af-sejour">
            Groupe
          </label>
          <select id="af-sejour" className={ui.champ} value={sejour} onChange={(e) => setSejour(e.target.value)}>
            <option value="">Aucun groupe</option>
            {sejoursDuJour.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom_groupe}
                {s.section_batiment ? ` (${s.section_batiment})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="af-activite">
            Activité
          </label>
          <input id="af-activite" className={ui.champ} value={activite} onChange={(e) => setActivite(e.target.value)} placeholder="Escalade, rallye, feu de camp…" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={ui.etiquette} htmlFor="af-hd">
              Début
            </label>
            <input id="af-hd" type="time" className={ui.champ} value={heureDebut} onChange={(e) => setHeureDebut(e.target.value)} />
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="af-hf">
              Fin
            </label>
            <input id="af-hf" type="time" className={ui.champ} value={heureFin} onChange={(e) => setHeureFin(e.target.value)} />
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="af-lieu">
              Lieu
            </label>
            <input id="af-lieu" className={ui.champ} value={lieu} onChange={(e) => setLieu(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="af-prep">
            Préparation
          </label>
          <textarea id="af-prep" rows={3} className={ui.champ} value={preparation} onChange={(e) => setPreparation(e.target.value)} placeholder="Matériel à sortir, à réserver…" />
        </div>

        {existante && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-pierre-50 p-2 text-sm">
            <IconeDupliquer className="size-4 text-pierre-500" />
            <span>Copier vers le</span>
            <input type="date" aria-label="Date de la copie" className={`${ui.champ} w-auto! py-1`} value={copie ?? ''} onChange={(e) => setCopie(e.target.value || null)} />
            <button type="button" className={`${ui.boutonSecondaire} py-1`} disabled={!copie} onClick={dupliquer}>
              Copier{copie ? ` (${dateCourte(copie)})` : ''}
            </button>
          </div>
        )}

        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div>
            {existante && (
              <button type="button" className={ui.boutonDanger} onClick={supprimer}>
                Retirer
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
              Annuler
            </button>
            <button className={ui.bouton} disabled={enregistrer.isPending}>
              Enregistrer
            </button>
          </div>
        </div>
      </form>
    </Dialogue>
  )
}
