-- ============================================================
-- core.pokes : un poke par personne et par jour, avec un émoji.
--
-- Ouvert à tous les profils actifs (pas un module : hors de la grille
-- d'accès). La journée est celle de Montréal (change à minuit, heure
-- locale), calculée par la base : on ne peut pas choisir son jour.
-- Envoi seulement par core.poker() (aucune politique d'écriture
-- directe) ; chacun ne lit que les pokes qu'il a envoyés ou reçus.
-- Rien n'est supprimé (le temps réel diffuserait les suppressions sans
-- filtre RLS).
-- ============================================================

create table core.pokes (
  id uuid primary key default gen_random_uuid(),
  de uuid not null references core.profils(id) on delete cascade,
  a uuid not null references core.profils(id) on delete cascade,
  emoji text not null check (emoji in ('👉','🦆','🔥','🌲','☕','🛶','😂','💚')),
  jour date not null default (now() at time zone 'America/Toronto')::date,
  -- Vu par le destinataire (bandeau fermé ou poke en retour).
  vu_le timestamptz,
  created_at timestamptz not null default now(),
  check (de <> a),
  -- La limite : un envoi par personne et par jour.
  unique (de, jour)
);

create index idx_pokes_a on core.pokes(a, created_at desc);

alter table core.pokes enable row level security;

create policy "Lire ses pokes" on core.pokes for select to authenticated
  using (de = auth.uid() or a = auth.uid());

grant select on core.pokes to authenticated, service_role;
revoke insert, update, delete on core.pokes from authenticated;

-- Qui peut être poké : les profils actifs, nom seulement (jamais le
-- courriel ni le rôle ; core.profils n'est lisible que par la direction).
create or replace function core.collegues_poke()
returns table (id uuid, nom text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, coalesce(nullif(btrim(p.nom), ''), split_part(p.courriel, '@', 1))
  from core.profils p
  where p.actif
    and p.id <> auth.uid()
    and exists (select 1 from core.profils moi where moi.id = auth.uid() and moi.actif)
  order by 2
$$;

-- Envoie le poke du jour. Erreurs lisibles par l'app : « deja_poke »,
-- « destinataire_invalide ».
create or replace function core.poker(p_a uuid, p_emoji text)
returns core.pokes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poke core.pokes;
begin
  if not exists (select 1 from core.profils where id = auth.uid() and actif) then
    raise exception 'Profil inactif' using errcode = '42501';
  end if;
  if p_a = auth.uid() or not exists (select 1 from core.profils where id = p_a and actif) then
    raise exception 'destinataire_invalide';
  end if;

  insert into core.pokes (de, a, emoji) values (auth.uid(), p_a, p_emoji)
  returning * into v_poke;

  -- Poker quelqu'un en retour : ses pokes non vus sont lus.
  update core.pokes set vu_le = now()
  where a = auth.uid() and de = p_a and vu_le is null;

  return v_poke;
exception
  when unique_violation then
    raise exception 'deja_poke';
end;
$$;

-- Ferme le bandeau : tous les pokes reçus non vus sont lus.
create or replace function core.marquer_pokes_vus()
returns void
language sql
security definer
set search_path = ''
as $$
  update core.pokes set vu_le = now()
  where a = auth.uid() and vu_le is null
$$;

grant execute on function core.collegues_poke(), core.poker(uuid, text), core.marquer_pokes_vus()
  to authenticated;

alter publication supabase_realtime add table core.pokes;
