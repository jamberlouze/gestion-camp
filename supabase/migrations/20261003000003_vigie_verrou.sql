-- Verrou de la fonction Edge `vigie` : deux réveils rapprochés (pg_cron et
-- bouton de l'app) ne doivent pas lire le même lot de résultats en même
-- temps. Un verrou de plus de 3 minutes est considéré comme abandonné
-- (la fonction ne peut pas tourner plus de 150 s).

create or replace function vigie.prendre_verrou()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  insert into vigie.parametres (cle, valeur) values ('verrou', to_jsonb(now()))
  on conflict (cle) do update set valeur = to_jsonb(now())
  where (vigie.parametres.valeur #>> '{}')::timestamptz < now() - interval '3 minutes'
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

create or replace function vigie.liberer_verrou()
returns void
language sql
security definer
set search_path = ''
as $$
  update vigie.parametres set valeur = to_jsonb('1970-01-01T00:00:00Z'::timestamptz) where cle = 'verrou';
$$;

revoke execute on function vigie.prendre_verrou(), vigie.liberer_verrou() from public, anon, authenticated;
grant execute on function vigie.prendre_verrou(), vigie.liberer_verrou() to service_role;
