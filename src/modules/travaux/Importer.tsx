import { useMemo, useState } from 'react'
import { IconeImporter } from '@/lib/icones'
import { FenetreImportLot, type ConfigImport } from '@/lib/FenetreImportLot'
import { lireChoix, lireDate, lireNombre } from '@/lib/importLot'
import { ui } from '@/lib/ui'
import { ajouterALaListe, importerTaches, useRelire, type Donnees } from './donnees'
import { dateCourte, useDroits } from './outils'
import { PRIORITES, STATUTS, type Priorite, type Statut } from './types'

const CHOIX_PRIORITES = ([1, 2, 3] as Priorite[]).map((p) => ({ texte: String(p), libelle: PRIORITES[p] }))
/** À trier = signalement que la direction classera dans le bandeau (ex. « À classer » d'Asana). */
const CHOIX_STATUTS = (['a_trier', 'a_faire'] as Statut[]).map((s) => ({ texte: s, libelle: STATUTS[s] }))

/**
 * Bouton « Importer » (direction, à côté de « Nouvelle tâche ») : plusieurs
 * tâches d'un coup, à faire (par défaut) ou à trier. En ligne seulement : tout ou rien.
 */
export function BoutonImporter({ d, defauts }: { d: Donnees; defauts?: Record<string, string> }) {
  const [ouvert, setOuvert] = useState(false)
  return (
    <>
      <button className={ui.boutonSecondaire} onClick={() => setOuvert(true)} title="Importer plusieurs tâches d’Excel, de Sheets ou d’une liste">
        <IconeImporter /> Importer
      </button>
      {ouvert && <Fenetre d={d} defauts={defauts} fermer={() => setOuvert(false)} />}
    </>
  )
}

function Fenetre({ d, defauts, fermer }: { d: Donnees; defauts?: Record<string, string>; fermer: () => void }) {
  const droits = useDroits()
  const relire = useRelire()

  const config = useMemo<ConfigImport>(() => {
    const prochainOrdre = (l: { ordre: number }[]) => {
      let ordre = Math.max(0, ...l.map((x) => x.ordre))
      return () => ++ordre
    }
    const ordreLieu = prochainOrdre(d.lieux)
    const ordreCategorie = prochainOrdre(d.categories)
    const chantiers = [...d.chantiers].sort((a, b) => Number(!!a.termine_le) - Number(!!b.termine_le) || a.nom.localeCompare(b.nom, 'fr'))
    return {
      nomGabarit: 'gabarit-travaux.xlsx',
      titresExistants: d.taches.filter((t) => t.statut !== 'terminee').map((t) => t.titre),
      defauts,
      colonnes: [
        {
          cle: 'titre',
          entete: 'Titre',
          synonymes: ['Quoi', 'Tâche', 'Tâches'],
          obligatoire: true,
          type: 'texte',
          aide: 'Ce qu’il faut faire.',
          exemple: 'Changer la poignée de la porte du chalet',
        },
        {
          cle: 'description',
          entete: 'Description',
          synonymes: ['Détails', 'Note', 'Notes'],
          type: 'texte',
          aide: 'Précisions, matériel, comment faire.',
        },
        {
          cle: 'lieu',
          entete: 'Lieu',
          synonymes: ['Lieux', 'Où', 'Endroit'],
          obligatoire: true,
          type: 'liste',
          options: d.lieux.map((l) => ({ id: l.id, nom: l.nom })),
          creer: (nom) => ajouterALaListe('lieux', { nom, ordre: ordreLieu() }),
          lot: true,
          aide: 'Un lieu de la feuille Listes. Un nouveau lieu peut être ajouté à la liste au moment de l’import.',
          exemple: d.lieux[0]?.nom,
        },
        {
          cle: 'categorie',
          entete: 'Catégorie',
          synonymes: ['Catégories'],
          type: 'liste',
          options: d.categories.map((c) => ({ id: c.id, nom: c.nom })),
          creer: (nom) => ajouterALaListe('categories', { nom, ordre: ordreCategorie() }),
          lot: true,
          aide: 'Une catégorie de la feuille Listes. Une nouvelle peut être ajoutée au moment de l’import.',
          exemple: d.categories[0]?.nom,
        },
        {
          cle: 'chantier',
          entete: 'Chantier',
          synonymes: ['Projet'],
          type: 'liste',
          options: chantiers.map((c) => ({ id: c.id, nom: c.nom })),
          creer: (nom) => ajouterALaListe('chantiers', { nom }),
          lot: true,
          aide: 'Un chantier de la feuille Listes, ou un nouveau, ajouté au moment de l’import.',
          exemple: chantiers[0]?.nom,
        },
        {
          cle: 'priorite',
          entete: 'Priorité',
          synonymes: ['Urgence'],
          type: 'valeur',
          lire: lireChoix(CHOIX_PRIORITES, Number),
          afficher: (v) => PRIORITES[v as Priorite],
          choix: CHOIX_PRIORITES,
          lot: true,
          aide: 'Urgent, Prioritaire ou Éventuellement (vide = Éventuellement).',
          exemple: 'Prioritaire',
        },
        {
          cle: 'echeance',
          entete: 'Échéance',
          synonymes: ['Date', 'Date limite', 'Pour le'],
          type: 'valeur',
          lire: lireDate,
          afficher: (v) => dateCourte(v as string),
          aide: 'Date : 2026-11-15 ou 15/11/2026.',
          exemple: '2026-11-15',
        },
        {
          cle: 'heures',
          entete: 'Heures',
          synonymes: ['Heures prévues', 'Durée'],
          type: 'valeur',
          lire: lireNombre,
          afficher: (v) => `${String(v).replace('.', ',')} h`,
          aide: 'Heures prévues (ex. 1,5).',
          exemple: '2',
        },
        {
          cle: 'assigne',
          entete: 'Assigné à',
          synonymes: ['Assignée à', 'Assigné', 'Assignation', 'Qui', 'Responsable'],
          type: 'liste',
          options: d.personnes.filter((p) => p.actif && p.peut_assigner).map((p) => ({ id: p.id, nom: p.nom })),
          lot: true,
          aide: 'Le nom d’un compte qui peut recevoir des tâches (feuille Listes) ; vide = à assigner.',
        },
        {
          cle: 'fournisseur',
          entete: 'Fournisseur',
          type: 'liste',
          options: d.fournisseurs.map((f) => ({ id: f.id, nom: f.nom })),
          aide: 'Un fournisseur de Mastertimeline (feuille Listes).',
        },
        {
          cle: 'etiquettes',
          entete: 'Étiquettes',
          synonymes: ['Étiquette', 'Tags'],
          type: 'liste',
          multiple: true,
          options: d.etiquettes.map((e) => ({ id: e.id, nom: e.nom })),
          aide: 'Une ou plusieurs, séparées par des virgules.',
          exemple: d.etiquettes.map((e) => e.nom).join(', '),
        },
        {
          cle: 'statut',
          entete: 'Statut',
          synonymes: ['État'],
          type: 'valeur',
          lire: lireChoix(CHOIX_STATUTS),
          afficher: (v) => STATUTS[v as Statut],
          choix: CHOIX_STATUTS,
          lot: true,
          aide: 'À trier (signalement que la direction classera) ou À faire (vide = À faire).',
          exemple: 'À faire',
        },
      ],
      enregistrer: async (lignes) => {
        await importerTaches(
          lignes.map((v) => ({
            id: crypto.randomUUID(),
            titre: v.titre as string,
            description: (v.description as string) ?? null,
            lieu_id: v.lieu as string,
            categorie_id: (v.categorie as string) ?? null,
            chantier_id: (v.chantier as string) ?? null,
            priorite: (v.priorite as Priorite) ?? 3,
            echeance: (v.echeance as string) ?? null,
            heures_prevues: (v.heures as number) ?? null,
            assigne_a: (v.assigne as string) ?? null,
            fournisseur_id: (v.fournisseur as string) ?? null,
            etiquette_ids: (v.etiquettes as string[]) ?? [],
            statut: (v.statut as Statut) ?? 'a_faire',
            signale_par: droits.moi,
          })),
        )
        await relire()
      },
    }
  }, [d, defauts, droits.moi, relire])

  return <FenetreImportLot config={config} fermer={fermer} />
}
