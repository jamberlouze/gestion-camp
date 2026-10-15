import { ChampTexte } from '@/lib/ChampTexte'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { Section } from './commun'
import { VAJ_VALIDITE_DEFAUT } from './conformite'
import { useRh } from './contexte'
import { useEnregistrerReglage, useReglagesRh } from './donnees'
import { useEnregistrerNumeroCompagnie } from './donneesConformite'
import { REGLAGES_DEFAUT, reglagesEmployeurD, type ReglagesEmployeurD as Valeurs } from './employeurD'

/** Champs réglables de l'export, avec la colonne du canevas (profil emploi, sauf mention). */
const CHAMPS: { cle: keyof Valeurs; nom: string; aide: string }[] = [
  { cle: 'titre_emploi', nom: "Titre d'emploi (G)", aide: "3 chiffres, table des titres d'emploi de la compagnie ; obligatoire pour un ajout" },
  { cle: 'taux_ae', nom: "Taux d'assurance emploi (D)", aide: '1 régulier, 2 réduit' },
  { cle: 'statut', nom: 'Statut employé (F)', aide: '1 actif' },
  { cle: 'regroupement', nom: 'Regroupement sur rapport (H)', aide: '999 par défaut' },
  { cle: 'classe_cp', nom: 'Classe Comité paritaire (U)', aide: '7777 par défaut' },
  { cle: 'province_paie', nom: 'Province de paie (AJ)', aide: 'QUE, ONT…' },
  { cle: 'type_remuneration', nom: 'Type de rémunération (AK)', aide: 'REM taux horaire, SPP salaire par période, MAN manuel' },
  { cle: 'affichage', nom: 'Affichage du salaire (AL)', aide: '001 quantité/taux/salaire' },
  { cle: 'heures_paie', nom: "Nombre d'heures par paie (AB)", aide: 'aux deux semaines' },
  { cle: 'heures_semaine', nom: 'Heures par semaine', aide: "taux horaire d'un salaire à la semaine = taux ÷ heures" },
  { cle: 'type_depot', nom: 'Type de dépôt (1) (AM)', aide: '1 salaire ; vide = pas de type' },
  { cle: 'mode_paiement', nom: 'Mode de paiement (BB)', aide: '2 dépôt ; 1 chèque (pris d’office sans compte)' },
  { cle: 'base_federal', nom: 'Montant personnel de base fédéral (BC)', aide: '1 montant de base' },
  { cle: 'base_provincial', nom: 'Montant personnel de base provincial (BH)', aide: 'A montant de base (Québec)' },
  { cle: 'dentaire', nom: 'Protection dentaire offerte (DH)', aide: '1 aucune' },
  { cle: 'nationalite', nom: 'Nationalité (M, profil personnel)', aide: '1 canadienne' },
  { cle: 'fumeur', nom: 'Fumeur (O, profil personnel)', aide: 'N ou O' },
  { cle: 'impression_massive', nom: 'Impression massive (AB, profil personnel)', aide: 'N ou O' },
]

/**
 * Réglages › Employeur D et VAJ : valeurs par défaut de l'export « Données
 * d'emploi » (à confirmer avec Charlotte), numéros de compagnie (partagés
 * avec les Feuilles de temps) et validité d'une VAJ.
 */
export function ReglagesEmployeurD() {
  const { ecriture, compagnies } = useRh()
  const reglages = useReglagesRh()
  const enregistrer = useEnregistrerReglage()
  const r = reglagesEmployeurD(reglages.data?.employeur_d)
  const vaj = Number(reglages.data?.vaj_validite_ans) || VAJ_VALIDITE_DEFAUT

  const changer = (cle: keyof Valeurs, texte: string) => {
    const t = texte.trim()
    let v: string | number | null = t
    if (cle === 'heures_paie' || cle === 'heures_semaine') {
      const n = Number(t.replace(',', '.'))
      if (!t || !Number.isFinite(n) || n <= 0) return
      v = n
    } else if (cle === 'titre_emploi') v = t ? t.padStart(3, '0') : null
    else if (!t) v = REGLAGES_DEFAUT[cle] as string
    enregistrer.mutate({ cle: 'employeur_d', valeur: { ...r, [cle]: v } })
  }

  return (
    <div id="employeur-d" className="scroll-mt-4 xl:col-span-2">
      <Section titre="Employeur D et VAJ">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div>
            <p className="mb-3 text-sm text-pierre-600">
              Valeurs par défaut de l'export « Données d'emploi » (onglet Employés › Exporter › Employeur D), à confirmer avec Charlotte. La lettre est la colonne du canevas
              Desjardins. Le numéro de poste se règle dans Postes (plus haut), le matricule sur la fiche du référentiel.
            </p>
            <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {CHAMPS.map((c) => (
                <label key={c.cle} className="block text-sm">
                  <span className="text-xs font-medium text-pierre-700">{c.nom}</span>
                  <ChampTexte
                    className="mt-0.5 w-full rounded border border-pierre-200 px-2 py-1 font-mono text-xs"
                    valeur={r[c.cle] == null ? '' : String(r[c.cle])}
                    placeholder={c.cle === 'titre_emploi' ? 'à régler' : ''}
                    disabled={!ecriture}
                    enregistrer={(t) => changer(c.cle, t)}
                  />
                  <span className="text-[11px] text-pierre-500">{c.aide}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-5">
            <div>
              <p className={ui.etiquette}>Numéros de compagnie Employeur D</p>
              <p className="mb-2 text-xs text-pierre-500">8 lettres ou chiffres ; les mêmes que l'export des heures (Feuilles de temps) et Référentiel › Compagnies.</p>
              <ul className="space-y-1.5">
                {compagnies
                  .filter((c) => c.actif || c.numero_employeur_d)
                  .map((c) => (
                    <NumeroCompagnie key={c.id} id={c.id} nom={c.nom} valeur={c.numero_employeur_d} />
                  ))}
              </ul>
            </div>
            <label className="block text-sm">
              <span className={ui.etiquette}>Validité d'une VAJ (ans)</span>
              <ChampTexte
                className="w-20 rounded border border-pierre-200 px-2 py-1 text-sm"
                inputMode="numeric"
                valeur={String(vaj)}
                disabled={!ecriture}
                enregistrer={(t) => {
                  const n = Math.round(Number(t))
                  if (n >= 1 && n <= 20) enregistrer.mutate({ cle: 'vaj_validite_ans', valeur: n })
                }}
              />
              <span className="block text-xs text-pierre-500">« VAJ à faire » : 18 ans ou plus au début de l'embauche, VAJ absente ou plus vieille (à confirmer).</span>
            </label>
          </div>
        </div>
        {enregistrer.error && <p className={`${ui.erreur} mt-3`}>{messageErreur(enregistrer.error)}</p>}
      </Section>
    </div>
  )
}

function NumeroCompagnie({ id, nom, valeur }: { id: string; nom: string; valeur: string | null }) {
  const { ecriture } = useRh()
  const enregistrer = useEnregistrerNumeroCompagnie()
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="min-w-0 flex-1 truncate">{nom}</span>
      <ChampTexte
        aria-label={`Numéro Employeur D de ${nom}`}
        className="w-24 rounded border border-pierre-200 px-2 py-1 font-mono text-xs uppercase"
        maxLength={8}
        placeholder="—"
        valeur={valeur ?? ''}
        disabled={!ecriture}
        enregistrer={(t) => enregistrer.mutate({ compagnie: id, numero: t.replace(/\s/g, '') || null })}
      />
      {enregistrer.error && <span className="text-xs text-red-700">{messageErreur(enregistrer.error)}</span>}
    </li>
  )
}
