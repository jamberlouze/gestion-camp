// Accès à Supabase (API REST) avec la clé secrète : contourne la RLS. Ne
// sert que dans le Worker ; la clé est un secret Cloudflare
// (SUPABASE_SECRET_KEY), jamais dans le dépôt ni dans le site.

export function base(env, schema = 'subventions') {
  const cle = env.SUPABASE_SECRET_KEY
  const entetes = {
    apikey: cle,
    // Ancienne clé service_role (JWT) : aussi dans Authorization. Les
    // nouvelles clés (sb_secret_…) passent seulement par apikey.
    ...(cle?.startsWith('eyJ') ? { Authorization: `Bearer ${cle}` } : {}),
    'Accept-Profile': schema,
    'Content-Profile': schema,
    'Content-Type': 'application/json',
  }

  async function requete(chemin, { methode = 'GET', corps, prefer } = {}) {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${chemin}`, {
      method: methode,
      headers: prefer ? { ...entetes, Prefer: prefer } : entetes,
      body: corps === undefined ? undefined : JSON.stringify(corps),
    })
    const texte = await res.text()
    if (!res.ok) throw new Error(`Supabase a répondu ${res.status} : ${texte.slice(0, 500)}`)
    return texte ? JSON.parse(texte) : null
  }

  return {
    lire: (chemin) => requete(chemin),
    inserer: async (table, ligne) => (await requete(table, { methode: 'POST', corps: ligne, prefer: 'return=representation' }))[0],
    modifier: (table, filtre, champs) => requete(`${table}?${filtre}`, { methode: 'PATCH', corps: champs, prefer: 'return=minimal' }),
    rpc: (nom, args = {}) => requete(`rpc/${nom}`, { methode: 'POST', corps: args }),
  }
}
