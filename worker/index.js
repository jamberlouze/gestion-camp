// Worker de la gestion du camp : sert l'application (fichiers statiques de
// dist/, voir wrangler.jsonc), garde Supabase éveillé, fait la recherche
// hebdomadaire de la Vigie de subventions (voir subventions/pipeline.js),
// la synchro des séjours Airtable du Calendrier (voir calendrier/synchro.js)
// et les routes publiques des Réservations : formulaire de demande et
// documents de la page client (voir reservations/api.js).
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
import { routeReservations } from "./reservations/api.js";
import { routeSubventions } from "./subventions/api.js";
import { tourHebdomadaire } from "./subventions/pipeline.js";

// Vigie de subventions : le lundi, aux appels de 8 h, 9 h, 10 h et 11 h UTC
// du cron (4 h à 7 h, heure avancée de l'Est ; 3 h à 6 h, heure normale).
// Le cron passe aux 15 minutes (synchro du Calendrier) : seulement le
// passage de l'heure pile, pour garder une entreprise par heure.
const estTourSubventions = (moment) =>
  moment.getUTCDay() === 1 &&
  moment.getUTCHours() >= 8 &&
  moment.getUTCHours() <= 11 &&
  moment.getUTCMinutes() < 15;

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
    if (estTourSubventions(new Date(event.scheduledTime))) ctx.waitUntil(tourHebdomadaire(env));
    // Séjours Airtable → calendrier.sejours (rien tant que les secrets manquent).
    if (synchroConfiguree(env)) ctx.waitUntil(synchroniser(env, "cron").catch(() => {}));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const api = url.pathname.match(/^\/api\/subventions\/([a-z]+)$/);
    if (api) return routeSubventions(request, env, ctx, api[1]);
    const cal = url.pathname.match(/^\/api\/calendrier\/([a-z]+)$/);
    if (cal) return routeCalendrier(request, env, cal[1]);
    const res = url.pathname.match(/^\/api\/reservations\/([a-z]+)$/);
    if (res) return routeReservations(request, env, res[1]);
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
