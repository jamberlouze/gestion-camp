-- ============================================================
-- embarcations.notes : notes à traiter par la direction (décision du
-- 2026-10-06). Ex. « un canot a coulé, on ne sait pas lequel » : on le
-- note tout de suite, sans embarcation précise, et la note reste « à
-- traiter » jusqu'à ce que quelqu'un la marque traitée.
-- Statuts simples : a_traiter → traitee (on peut la rouvrir).
-- ============================================================

create table embarcations.notes (
  id uuid primary key default gen_random_uuid(),
  texte text not null check (btrim(texte) <> ''),
  -- Facultatif : on ne sait pas toujours de quelle embarcation il s'agit.
  embarcation_id uuid references embarcations.embarcations(id) on delete set null,
  statut text not null default 'a_traiter' check (statut in ('a_traiter', 'traitee')),
  -- Ce qui a été fait (facultatif), écrit en marquant la note traitée.
  suivi text,
  -- Posés par la base (déclencheur) : jamais par l'appareil.
  auteur uuid references core.profils(id) on delete set null,
  auteur_nom text,
  traitee_le timestamptz,
  traitee_par_nom text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_notes_statut on embarcations.notes(statut, created_at desc);
create index idx_notes_embarcation on embarcations.notes(embarcation_id);

comment on table embarcations.notes is 'Notes à traiter par la direction (embarcation facultative), puis marquées traitées';

create trigger trg_notes_updated_at before update on embarcations.notes
for each row execute function core.maj_updated_at();

-- Auteur et « traitée par » : nom lu dans core.profils (lisible seulement
-- par la direction, d'où security definer) et gardé sur la note, pour
-- l'afficher hors ligne et même si le compte est retiré.
create function embarcations.poser_auteur_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nom text;
begin
  select coalesce(nullif(btrim(p.nom), ''), split_part(p.courriel, '@', 1))
    into v_nom
    from core.profils p
    where p.id = auth.uid();

  if tg_op = 'INSERT' then
    new.auteur := auth.uid();
    new.auteur_nom := v_nom;
    new.created_at := now();
  else
    new.auteur := old.auteur;
    new.auteur_nom := old.auteur_nom;
    new.created_at := old.created_at;
  end if;

  if new.statut = 'traitee' then
    if tg_op = 'INSERT' or old.statut <> 'traitee' then
      new.traitee_le := now();
      new.traitee_par_nom := v_nom;
    else
      new.traitee_le := old.traitee_le;
      new.traitee_par_nom := old.traitee_par_nom;
    end if;
  else
    new.traitee_le := null;
    new.traitee_par_nom := null;
  end if;
  return new;
end;
$$;

create trigger trg_notes_auteur before insert or update on embarcations.notes
for each row execute function embarcations.poser_auteur_note();

revoke execute on function embarcations.poser_auteur_note() from public, anon;

grant select, insert, update, delete on embarcations.notes to authenticated, service_role;

alter table embarcations.notes enable row level security;

create policy "Lire notes" on embarcations.notes for select to authenticated
  using (core.peut_lire('embarcations'));
create policy "Écrire notes" on embarcations.notes for all to authenticated
  using (core.peut_ecrire('embarcations')) with check (core.peut_ecrire('embarcations'));

alter publication supabase_realtime add table embarcations.notes;
