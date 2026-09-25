// Waker Supabase de la gestion du camp.
//
// L'offre gratuite de Supabase met un projet en pause après une semaine
// « sans activité suffisante » : il faut quelques requêtes à la base chaque
// jour (deux par semaine ne suffisaient pas — leçon apprise sur Calico et
// Panache le 2026-09-14). La tâche planifiée (voir wrangler.jsonc) appelle
// donc la fonction core.ping() quatre fois par jour. Elle touche une table
// mais ne renvoie que l'heure du serveur : aucune donnée n'est exposée.
//
// Doublon volontaire : .github/workflows/supabase-eveil.yml fait la même
// chose depuis GitHub Actions, au cas où le cron Cloudflare ne tournerait pas.

async function pingSupabase(env) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/ping`, {
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      "Accept-Profile": "core",
    },
  });
  if (!res.ok) throw new Error(`Supabase a répondu ${res.status} : ${await res.text()}`);
  const heure = await res.json();
  console.log(`Supabase keep-alive : HTTP ${res.status}, heure du serveur ${heure}`);
  return heure;
}

const texte = (body, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(pingSupabase(env));
  },

  // Adresse de vérification manuelle : https://<worker>.workers.dev/_ping
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/_ping") {
      try {
        const heure = await pingSupabase(env);
        return texte(`Supabase répond (heure du serveur : ${heure}).`);
      } catch (err) {
        return texte(`Échec : ${err.message}`, 502);
      }
    }
    return texte("Waker Supabase — gestion du camp. Vérification : /_ping", 404);
  },
};
