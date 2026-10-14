/** « 13 h 30 » à partir de « 13:30:00 ». */
export function heureLisible(heure: string | null) {
  if (!heure) return null
  const [h, m] = heure.split(':')
  return `${Number(h)} h ${m}`
}
