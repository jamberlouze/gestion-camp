// Modèles de documents des Réservations : la syntaxe commune
// (src/lib/pdf/gabarit.ts), avec les champs des Réservations (valeurChamp :
// `montant_NN` = NN % du total).

import * as commun from '../../../lib/pdf/gabarit'
import type { Composeur } from './moteur'
import { valeurChamp } from './champs'

export type { Bloc } from '../../../lib/pdf/gabarit'

export const remplir = (texte: string, cs: Record<string, string>) => commun.remplir(texte, cs, valeurChamp)

export const conditions = (lignes: string[], cs: Record<string, string>) => commun.conditions(lignes, cs, valeurChamp)

export const dessinerModele = (c: Composeur, contenu: string, cs: Record<string, string>, bloc: commun.Bloc, taille = 9.5) =>
  commun.dessinerModele(c, contenu, cs, bloc, taille, valeurChamp)
