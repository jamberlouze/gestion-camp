-- ============================================================
-- core.pokes : un émoji du jour, le même pour tout le monde.
--
-- Plus de choix à l'envoi (demande de Maxime du 2026-10-07) : la base
-- tire l'émoji du jour (journée de Montréal) et core.poker le pose.
-- Tirage fixe pour une date donnée (md5 de la date), avec priorité aux
-- émojis loufoques : chacun compte 4 fois, les classiques une fois.
-- Allonger les listes ici seulement (l'app lit core.emoji_du_jour()).
-- ============================================================

-- Tirage brut d'une date, sans l'émoji `p_sauf`.
create or replace function core.tirer_emoji(p_jour date, p_sauf text default null)
returns text
language sql
immutable
set search_path = ''
as $$
  with listes as (
    select
      array[
        '🦆','🦫','🐸','🦄','🦖','🦕','🐙','🦑','🦀','🦞','🦩','🦥','🦦','🦔','🐌',
        '🦐','🪿','🦤','🐓','🦃','🦚','🦜','🐡','🦭','🐊','🦒','🦘','🐒','🦨','🐐',
        '🤡','👽','👾','🤖','🧌','🥸','🤠','🫠','🤪','🥴','🙃','🦷','🧦','🌵','🍍',
        '🥨','🧀','🥓','🌶️','🥑','🪩','🎺','🪗','🛸','🧻','🪠','🪅','🥁','🍄','🧙',
        '🦙','🦛','🦏','🐘','🦣','🦓','🦧','🐼','🦡','🦝','🐷','🐧','🦇','🪼','🦈',
        '🐳','🦎','🐢','🦟','🐞','🥶','🤓','🧐','😵‍💫','🫣','🫨','👻','💀','👹','🧛',
        '🧜','🦸','🥷','🕺','🌽','🥦','🥔','🍌','🥥','🍋','🌯','🥟','🍤','🧄','🥒',
        '🍗','🪀','🪁','🎲','🧸','🪆','🪕','📯','🧽','🪣','🪤','🛼','🪄','🗿','🧊'
      ] as loufoques,
      array[
        '👉','🔥','🌲','☕','🛶','😂','💚','🎉','🚀','✨','🌈','🏕️',
        '🌞','⭐','🌙','🍁','🌊','⛺','🎶','🏆','💯','🙌','👏','🤙'
      ] as classiques
  ),
  tirage as (
    select array_remove(loufoques || loufoques || loufoques || loufoques || classiques, p_sauf) as emojis from listes
  )
  select emojis[1 + (('x' || substr(md5('poke-' || p_jour::text), 1, 7))::bit(28)::int % array_length(emojis, 1))]
  from tirage
$$;

-- L'émoji du jour : jamais le tirage brut de la veille (pas deux jours de suite pareils, sauf rare hasard).
create or replace function core.emoji_du_jour(
  p_jour date default (now() at time zone 'America/Toronto')::date
)
returns text
language sql
stable
set search_path = ''
as $$
  select core.tirer_emoji(p_jour, core.tirer_emoji(p_jour - 1))
$$;

-- p_emoji n'est plus lu (gardé pour l'app d'avant pendant la mise en ligne).
create or replace function core.poker(p_a uuid, p_emoji text default null)
returns core.pokes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poke core.pokes;
  v_jour date := (now() at time zone 'America/Toronto')::date;
begin
  if not exists (select 1 from core.profils where id = auth.uid() and actif) then
    raise exception 'Profil inactif' using errcode = '42501';
  end if;
  if p_a = auth.uid() or not exists (select 1 from core.profils where id = p_a and actif) then
    raise exception 'destinataire_invalide';
  end if;

  insert into core.pokes (de, a, emoji, jour) values (auth.uid(), p_a, core.emoji_du_jour(v_jour), v_jour)
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

grant execute on function core.emoji_du_jour(date), core.tirer_emoji(date, text) to authenticated;
