-- L'app de l'équipe passe de gestion-camp.maxime-0f5.workers.dev à
-- admin.camptremblant.com (décision de Maxime du 2026-10-16) : le lien des
-- courriels de la Vigie des camps suit. Seulement si l'adresse n'a pas déjà
-- été changée à la main.
update vigie.parametres
set valeur = jsonb_set(valeur, '{url_app}', to_jsonb('https://admin.camptremblant.com/vigie'::text)),
    updated_at = now()
where cle = 'reglages'
  and valeur->>'url_app' = 'https://gestion-camp.maxime-0f5.workers.dev/vigie';
