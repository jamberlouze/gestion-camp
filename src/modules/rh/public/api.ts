// Appels des pages publiques du module RH au Worker (/api/rh/*) : l'anonyme
// n'a aucun droit sur le schéma rh, tout passe par là.

/** Logo d'une compagnie (seulement celles qui en ont un). */
export function logoDe(compagnie: { nom: string; abreviation: string | null } | null | undefined) {
  const n = `${compagnie?.abreviation ?? ''} ${compagnie?.nom ?? ''}`.toLowerCase()
  if (/opikawa|\bopi\b/.test(n)) return '/logos/logo-opikawa.png'
  if (!compagnie || /gbpa|base de plein air|bpa/.test(n)) return '/logos/logo-gbpa.png'
  return null
}

/** Lecture d'une route du Worker : les données, ou le code HTTP (0 = réseau). */
export async function lire<T>(chemin: string): Promise<{ ok: true; donnees: T } | { ok: false; statut: number }> {
  try {
    const res = await fetch(chemin, { headers: { accept: 'application/json' } })
    if (!res.ok) return { ok: false, statut: res.status }
    return { ok: true, donnees: (await res.json()) as T }
  } catch {
    return { ok: false, statut: 0 }
  }
}

/** Envoi à une route du Worker (JSON ou multipart) ; 0 = réseau. */
export async function envoyer(chemin: string, corps: FormData | object): Promise<{ statut: number; corps: { erreur?: string; champs?: Record<string, string>; reponse?: string } }> {
  try {
    const res = await fetch(chemin, {
      method: 'POST',
      ...(corps instanceof FormData ? { body: corps } : { body: JSON.stringify(corps), headers: { 'Content-Type': 'application/json' } }),
    })
    return { statut: res.status, corps: await res.json().catch(() => ({})) }
  } catch {
    return { statut: 0, corps: {} }
  }
}
