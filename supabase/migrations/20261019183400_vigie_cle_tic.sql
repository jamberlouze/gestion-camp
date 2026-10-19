-- ============================================================
-- Vigie : le réveil de la fonction Edge exige une clé (audit du
-- 2026-10-19).
--
-- La fonction vigie est déployée sans vérification du JWT (pg_cron
-- l'appelle sans session). Avant, son action « tic » répondait à
-- n'importe qui : un inconnu pouvait la réveiller en boucle (envoi de la
-- file à Anthropic, quota d'appels, charge de la base). Maintenant, elle
-- répond seulement à vigie.tic(), qui envoie une clé gardée dans
-- Supabase Vault, ou à une personne qui écrit dans le module (bouton de
-- l'app).
-- ============================================================

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'vigie_cle_tic') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'vigie_cle_tic',
      'Clé du réveil de la fonction Edge vigie (envoyée par vigie.tic()). La changer ne perd rien.'
    );
  end if;
end;
$$;

-- Lue par la fonction Edge (clé de service) pour vérifier l'en-tête reçu.
create function vigie.cle_tic_valide(p_cle text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_cle = (select decrypted_secret from vault.decrypted_secrets where name = 'vigie_cle_tic'), false)
$$;

revoke execute on function vigie.cle_tic_valide(text) from public, anon, authenticated;
grant execute on function vigie.cle_tic_valide(text) to service_role;

-- Réveille la fonction Edge seulement s'il y a du travail (requêtes à
-- envoyer ou lots à lire, recherche à terminer), avec la clé du réveil.
create or replace function vigie.tic()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from vigie.requetes_ia where statut in ('en_attente','soumise'))
     or exists (select 1 from vigie.recherches where statut = 'en_cours') then
    perform net.http_post(
      url := 'https://nurjzafcogzgekquzuwh.supabase.co/functions/v1/vigie',
      body := '{"action":"tic"}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cle-Tic', (select decrypted_secret from vault.decrypted_secrets where name = 'vigie_cle_tic')),
      timeout_milliseconds := 5000
    );
  end if;
end;
$$;
