import type { Embarcation, Modele } from './types'

export interface Ligne extends Embarcation {
  modele: Modele
}

/** Associe chaque embarcation à son modèle (les orphelines sont ignorées). */
export function joindre(embarcations: Embarcation[], modeles: Modele[]): Ligne[] {
  const parId = new Map(modeles.map((m) => [m.id, m]))
  return embarcations.flatMap((e) => {
    const modele = parId.get(e.modele_id)
    return modele ? [{ ...e, modele }] : []
  })
}

const normaliser = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Recherche tolérante sur le numéro : « ke12 », « KE-012 », « ke 12 » et
 * « 12 » trouvent tous KE-012.
 */
export function correspondNumero(numero: string | null, recherche: string): boolean {
  const r = normaliser(recherche)
  if (!r) return true
  if (!numero) return false
  const n = normaliser(numero)
  if (n.includes(r)) return true
  const [, rPrefixe, rNombre] = r.match(/^([a-z]*)(\d+)$/) ?? []
  const [, nPrefixe, nNombre] = n.match(/^([a-z]*)(\d+)$/) ?? []
  return !!rNombre && !!nNombre && nPrefixe.startsWith(rPrefixe) && Number(nNombre) === Number(rNombre)
}

export type ChampTri = 'numero' | 'modele' | 'type' | 'etat'
export interface Tri {
  champ: ChampTri
  sens: 'asc' | 'desc'
}

const comparer = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true })

export function trier(lignes: Ligne[], { champ, sens }: Tri): Ligne[] {
  const cle = (l: Ligne) => {
    switch (champ) {
      case 'modele':
        return `${l.modele.nom} ${l.numero_identification ?? ''}`
      case 'type':
        return `${l.modele.type} ${l.numero_identification ?? ''}`
      case 'etat':
        return `${l.fonctionnel ? 1 : 0} ${l.numero_identification ?? ''}`
      default:
        return l.numero_identification ?? ''
    }
  }
  const trie = [...lignes].sort((a, b) => comparer(cle(a), cle(b)))
  if (sens === 'desc') trie.reverse()
  // Les créations pas encore numérotées (hors ligne) toujours en dernier.
  return [...trie.filter((l) => l.numero_identification), ...trie.filter((l) => !l.numero_identification)]
}

export function exporterCsv(lignes: Ligne[]) {
  const entetes = ['Numéro', 'Modèle', 'Type', 'Bouchon', 'Fonctionnel', 'Entreprise', 'Notes', 'Date de création']
  const valeurs = lignes.map((l) => [
    l.numero_identification ?? '(en attente)',
    l.modele.nom,
    l.modele.type,
    l.modele.bouchon ?? '',
    l.fonctionnel ? 'Oui' : 'Non',
    l.entreprise_utilisation ?? '',
    l.notes ?? '',
    new Date(l.date_creation).toLocaleDateString('fr-CA'),
  ])
  const csv = [entetes, ...valeurs]
    .map((ligne) => ligne.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  // BOM : Excel reconnaît ainsi les accents.
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `embarcations-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
