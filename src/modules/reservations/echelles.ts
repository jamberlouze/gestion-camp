// Couleurs et échelles des graphiques de l'onglet Rapports (pur).

/** Couleurs des séries, dans cet ordre : exercice choisi, précédent, celui d'avant. */
export const COULEURS = ['#2a78d6', '#eb6834', '#1baf7a']

/** Échelle « ronde » : maximum et graduations (0, pas, 2 pas…). */
export function echelle(max: number, n = 4): { max: number; graduations: number[] } {
  if (!(max > 0)) return { max: 1, graduations: [0, 1] }
  const brut = max / n
  const p = 10 ** Math.floor(Math.log10(brut))
  const pas = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= brut)!
  const haut = Math.ceil(max / pas) * pas
  const graduations: number[] = []
  for (let v = 0; v <= haut + pas / 2; v += pas) graduations.push(v)
  return { max: haut, graduations }
}

/** 12 400 → « 12 k$ », 950 → « 950 $ ». */
export const kdollars = (v: number) =>
  Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('fr-CA', { maximumFractionDigits: v >= 100_000 ? 0 : 1 })} k$` : `${Math.round(v)} $`
