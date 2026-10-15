// Worker de la gestion du camp : sert l'application (fichiers statiques de
// dist/, voir wrangler.jsonc), garde Supabase éveillé, fait la recherche
// trimestrielle de la Vigie de subventions (voir subventions/pipeline.js),
// la synchro des séjours Airtable du Calendrier (voir calendrier/synchro.js)
// et les routes du module RH (candidature, intention de retour, dossier
// d'embauche, contrat signé en ligne, courriels de chaque compagnie : rh/api.js).
//
// L'offre gratuite de Supabase met un projet en pause après une semaine
// « sans activité suffisante » : il faut quelques requêtes à la base chaque
// jour (deux par semaine ne suffisaient pas — leçon apprise sur Calico et
// Panache le 2026-09-14). La tâche planifiée (voir wrangler.jsonc) appelle
// donc la fonction core.ping() à chaque passage du cron (plusieurs fois par jour). Elle touche une table
// mais ne renvoie que l'heure du serveur : aucune donnée n'est exposée.
//
// Doublon volontaire : .github/workflows/supabase-eveil.yml fait la même
// chose depuis GitHub Actions, au cas où le cron Cloudflare ne tournerait pas.

import { routeCalendrier } from "./calendrier/api.js";
import { synchroConfiguree, synchroniser } from "./calendrier/synchro.js";
import { routeRh } from "./rh/api.js";
import { preparerAutomatiques } from "./rh/courriels.js";
import { routeSubventions } from "./subventions/api.js";
import { passageSubventions } from "./subventions/pipeline.js";

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
    // Vigie de subventions : agenda Google, échues expirées (une fois par jour) et
    // recherche du trimestre (début d'octobre, janvier, avril, juillet) : subventions/pipeline.js.
    ctx.waitUntil(passageSubventions(env, new Date(event.scheduledTime)).catch((e) => console.error("Subventions :", e)));
    // Séjours Airtable → calendrier.sejours (rien tant que les secrets manquent).
    if (synchroConfiguree(env)) ctx.waitUntil(synchroniser(env, "cron").catch(() => {}));
    // RH : rappels de dossier dus et résumé quotidien à la direction (rh/courriels.js).
    ctx.waitUntil(preparerAutomatiques(env, new Date(event.scheduledTime)).catch((e) => console.error("Courriels RH :", e)));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const api = url.pathname.match(/^\/api\/subventions\/([a-z]+)$/);
    if (api) return routeSubventions(request, env, ctx, api[1]);
    const cal = url.pathname.match(/^\/api\/calendrier\/([a-z]+)$/);
    if (cal) return routeCalendrier(request, env, cal[1]);
    const rh = url.pathname.match(/^\/api\/rh\/([a-z]+)$/);
    if (rh) return routeRh(request, env, rh[1], ctx);
    // Adresse de vérification manuelle : https://<worker>.workers.dev/_ping
    if (url.pathname === "/_ping") {
      try {
        const heure = await pingSupabase(env);
        return texte(`Supabase répond (heure du serveur : ${heure}).`);
      } catch (err) {
        return texte(`Échec : ${err.message}`, 502);
      }
    }
    return texte("Page introuvable.", 404);
  },
};
