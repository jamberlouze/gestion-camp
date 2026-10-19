import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { IconeImporter } from '@/lib/icones'
import { FenetreImportLot, type ConfigImport } from '@/lib/FenetreImportLot'
import { lireMois } from '@/lib/importLot'
import { ui } from '@/lib/ui'
import { cleAujourdhui, exerciceDeCle, libelleFrequence, MOIS_EXERCICE, NOMS_MOIS_COURTS } from './calendrier'
import { ajouterALaListe, creerTaches, useReferences, useTaches } from './donnees'

/** Bouton « Importer » (à côté de « Nouvelle tâche ») : plusieurs tâches annuelles d'un coup. */
export function BoutonImporter({ defauts }: { defauts?: Record<string, string> }) {
  const [ouvert, setOuvert] = useState(false)
  return (
    <>
      <button className={ui.boutonSecondaire} onClick={() => setOuvert(true)} title="Importer plusieurs tâches d’Excel, de Sheets ou d’une liste">
        <IconeImporter /> Importer
      </button>
      {ouvert && <Fenetre defauts={defauts} fermer={() => setOuvert(false)} />}
    </>
  )
}

function Fenetre({ defauts, fermer }: { defauts?: Record<string, string>; fermer: () => void }) {
  const refs = useReferences()
  const taches = useTaches().data
  const client = useQueryClient()

  const config = useMemo<ConfigImport>(() => {
    let ordreProjet = Math.max(0, ...refs.projets.map((p) => p.ordre))
    return {
      nomGabarit: 'gabarit-mastertimeline.xlsx',
      titresExistants: (taches ?? []).map((t) => t.titre),
      defauts,
      colonnes: [
        {
          cle: 'titre',
          entete: 'Titre',
          synonymes: ['Tâche', 'Tâches', 'Quoi', 'Nom'],
          obligatoire: true,
          type: 'texte',
          aide: 'Ce qu’il faut faire. Ajouter l’activité au titre s’il est ambigu sans elle.',
          exemple: 'Nettoyer les gouttières du pavillon',
        },
        {
          cle: 'entreprise',
          entete: 'Compagnie',
          synonymes: ['Compagnies', 'Entreprise'],
          type: 'liste',
          options: refs.entreprises.filter((e) => e.actif).map((e) => ({ id: e.id, nom: e.nom, alias: [e.abreviation] })),
          lot: true,
          aide: 'Nom ou abréviation d’une compagnie du référentiel (feuille Listes).',
          exemple: refs.entreprises[0]?.abreviation ?? refs.entreprises[0]?.nom,
        },
        {
          cle: 'projet',
          entete: 'Projet',
          type: 'liste',
          options: refs.projets.map((p) => ({ id: p.id, nom: p.nom })),
          creer: (nom) => ajouterALaListe('projets', { nom, ordre: ++ordreProjet }),
          lot: true,
          aide: 'Un projet de la feuille Listes. Un nouveau nom peut être ajouté à la liste au moment de l’import.',
          exemple: refs.projets[0]?.nom,
        },
        {
          cle: 'mois',
          entete: 'Mois',
          synonymes: ['Quand'],
          obligatoire: true,
          type: 'valeur',
          lire: lireMois,
          afficher: (v) => libelleFrequence({ mois: v as number[], intervalle_ans: 1 }),
          choix: MOIS_EXERCICE.map((m) => ({ texte: String(m), libelle: NOMS_MOIS_COURTS[m - 1] })),
          multiple: true,
          lot: true,
          aide: 'Mois où la tâche revient chaque année : « oct », « octobre, avril », « 10, 4 », « mai à août » ou « tous ».',
          exemple: 'oct, avr',
        },
        {
          cle: 'responsable',
          entete: 'Responsable',
          type: 'liste',
          options: refs.responsables.map((r) => ({ id: r.id, nom: r.nom })),
          creer: (nom) => ajouterALaListe('responsables', { nom }),
          lot: true,
          aide: 'Un responsable de la feuille Listes. Un nouveau nom peut être ajouté à la liste au moment de l’import.',
          exemple: refs.responsables.find((r) => r.actif)?.nom,
        },
        {
          cle: 'etiquettes',
          entete: 'Étiquettes',
          synonymes: ['Étiquette', 'Tags'],
          type: 'liste',
          multiple: true,
          options: refs.etiquettes.map((e) => ({ id: e.id, nom: e.nom })),
          aide: 'Une ou plusieurs, séparées par des virgules.',
          exemple: refs.etiquettes.map((e) => e.nom).join(', '),
        },
        {
          cle: 'fournisseur',
          entete: 'Fournisseur',
          type: 'liste',
          options: refs.fournisseurs.map((f) => ({ id: f.id, nom: f.nom })),
          aide: 'Un fournisseur de Réglages › Fournisseurs (feuille Listes).',
        },
        {
          cle: 'note',
          entete: 'Note',
          synonymes: ['Notes', 'Comment faire', 'Description'],
          type: 'texte',
          aide: 'Comment faire la tâche (note permanente, valable toutes les années).',
        },
      ],
      enregistrer: async (lignes) => {
        const exercice = exerciceDeCle(cleAujourdhui())
        await creerTaches(
          lignes.map((v) => ({
            titre: v.titre as string,
            entreprise_id: (v.entreprise as string) ?? null,
            projet_id: (v.projet as string) ?? null,
            responsable_id: (v.responsable as string) ?? null,
            fournisseur_id: (v.fournisseur as string) ?? null,
            etiquette_ids: (v.etiquettes as string[]) ?? [],
            mois: v.mois as number[],
            note: (v.note as string) ?? null,
            intervalle_ans: 1,
            exercice_depart: exercice,
          })),
        )
        await client.invalidateQueries({ queryKey: ['mastertimeline'] })
      },
    }
  }, [refs, taches, defauts, client])

  return <FenetreImportLot config={config} fermer={fermer} />
}
