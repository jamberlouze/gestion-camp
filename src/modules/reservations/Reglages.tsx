import { ui } from '@/lib/ui'
import { Section } from './commun'
import { champPetit } from './format'
import { useDonnees } from './contexte'
import { useEnregistrerReglage } from './donnees'
import { RATIOS, type Ratio } from './types'

const FORFAITS_HEURES: { cle: string; nom: string }[] = [
  { cle: 'classe_nature', nom: 'Classe nature' },
  { cle: 'journee_plein_air', nom: 'Journée plein air' },
  { cle: 'accueil_groupe', nom: 'Accueil de groupe' },
  { cle: 'location_salle_jour', nom: 'Location de salle — jour' },
  { cle: 'location_salle_soir', nom: 'Location de salle — soir' },
]

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** Réglages du calcul et des propositions (pas de code à toucher). */
export function Reglages() {
  const { reglages, ecriture, responsables, nomResponsable } = useDonnees()
  const enregistrer = useEnregistrerReglage()
  const d = !ecriture

  return (
    <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
      <Section titre="Heures normales">
        <p className="mb-3 text-sm text-pierre-500">Proposées à la création d'une réservation ; en dehors, c'est « sur mesure ».</p>
        <div className="space-y-2">
          {FORFAITS_HEURES.map((f) => {
            const [a, b] = reglages.heuresNormales[f.cle] ?? ['', '']
            const changer = (i: 0 | 1, v: string) => {
              const n = { ...reglages.heuresNormales, [f.cle]: i === 0 ? [v, b] : [a, v] }
              enregistrer.mutate({ cle: 'heures_normales', valeur: n })
            }
            return (
              <div key={f.cle} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{f.nom}</span>
                <input type="time" className={champPetit} value={a} disabled={d} onChange={(e) => changer(0, e.target.value)} />
                <span>→</span>
                <input type="time" className={champPetit} value={b} disabled={d} onChange={(e) => changer(1, e.target.value)} />
              </div>
            )
          })}
        </div>
      </Section>

      <Section titre="Repas">
        <p className="mb-3 text-sm text-pierre-500">Heures des repas : servent à proposer le nombre de repas d'après l'arrivée et le départ.</p>
        <div className="space-y-2">
          {(['dejeuner', 'diner', 'souper'] as const).map((k) => (
            <div key={k} className="flex items-center gap-2 text-sm">
              <span className="flex-1">{{ dejeuner: 'Déjeuner', diner: 'Dîner', souper: 'Souper' }[k]}</span>
              <input
                type="time"
                className={champPetit}
                value={reglages.heuresRepas[k]}
                disabled={d}
                onChange={(e) => enregistrer.mutate({ cle: 'heures_repas', valeur: { ...reglages.heuresRepas, [k]: e.target.value } })}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section titre="Classe nature et journée plein air">
        <div className="space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="flex-1">Ratio proposé quand le formulaire n'en donne pas</span>
            <select className={champPetit} value={reglages.ratioDefaut} disabled={d} onChange={(e) => enregistrer.mutate({ cle: 'ratio_defaut', valeur: e.target.value as Ratio })}>
              {RATIOS.map((r) => (
                <option key={r.valeur} value={r.valeur}>
                  {r.libelle}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="flex-1">Un accompagnateur gratuit par tranche complète de</span>
            <input
              type="number"
              min={1}
              className={`${champPetit} w-20 text-right`}
              defaultValue={reglages.gratuitePar}
              disabled={d}
              onBlur={(e) => Number(e.target.value) > 0 && Number(e.target.value) !== reglages.gratuitePar && enregistrer.mutate({ cle: 'gratuite_par', valeur: Number(e.target.value) })}
            />
            élèves
          </label>
          <label className="flex items-center gap-2">
            <span className="flex-1">Heure en extra (CN) = prix d'animation par jour ÷</span>
            <input
              type="number"
              min={1}
              className={`${champPetit} w-20 text-right`}
              defaultValue={reglages.diviseurHeuresExtra}
              disabled={d}
              onBlur={(e) =>
                Number(e.target.value) > 0 && Number(e.target.value) !== reglages.diviseurHeuresExtra && enregistrer.mutate({ cle: 'diviseur_heures_extra', valeur: Number(e.target.value) })
              }
            />
          </label>
        </div>
      </Section>

      <Section titre="Classe verte, blanche ou rouge">
        <p className="mb-3 text-sm text-pierre-500">Proposée selon le mois d'arrivée ; modifiable dans chaque réservation.</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {MOIS.map((m, i) => (
            <label key={m} className="flex items-center gap-2">
              <span className="w-24">{m}</span>
              <select
                className={`${champPetit} flex-1`}
                disabled={d}
                value={reglages.variantesClasse[String(i + 1)] ?? ''}
                onChange={(e) => enregistrer.mutate({ cle: 'variantes_classe', valeur: { ...reglages.variantesClasse, [String(i + 1)]: e.target.value } })}
              >
                <option value="verte">verte</option>
                <option value="blanche">blanche</option>
                <option value="rouge">rouge</option>
              </select>
            </label>
          ))}
        </div>
      </Section>
      <Section titre="Facturation (QuickBooks)">
        <label className="flex items-center gap-2 text-sm">
          <span className="flex-1">Les relances « facturer l'acompte… dans QBO » vont à</span>
          <select
            className={champPetit}
            disabled={d}
            value={reglages.responsableFacturation ?? ''}
            onChange={(e) => enregistrer.mutate({ cle: 'responsable_facturation', valeur: e.target.value || null })}
          >
            <option value="">la personne responsable de la réservation</option>
            {reglages.responsableFacturation && !responsables.some((x) => x.id === reglages.responsableFacturation) && (
              <option value={reglages.responsableFacturation}>{nomResponsable(reglages.responsableFacturation)}</option>
            )}
            {responsables.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nom}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-xs text-pierre-500">Habituellement l'adjointe, qui fait les factures progressives dans QBO (SOP).</p>
      </Section>
      {!ecriture && <p className={`${ui.erreur} lg:col-span-2`}>Lecture seule.</p>}
    </div>
  )
}
