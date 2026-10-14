-- Vigie des camps : type de séjour de chaque programme (réunion du
-- 2026-10-14 avec Charlotte, décisions de Maxime).
--
-- Le type se pose sur le PROGRAMME, pas sur le camp : un camp peut offrir
-- plusieurs types. Les comparaisons de prix se font entre programmes du même
-- type. null = pas classé (ou aucun des quatre, ex. un camp de jour).
--
-- type_a_verifier : le type vient de Claude (pré-classement des programmes
-- existants, scripts/migration/vigie-types-sejour.sql, ou recherche IA) et
-- n'a pas encore été confirmé dans l'app. Confirmer ou changer le type le
-- remet à false.

alter table vigie.programmes
  add column type_sejour text
    check (type_sejour in ('camp_vacances','camp_familial','classe_nature','groupe')),
  add column type_a_verifier boolean not null default false;

-- Un nouveau programme validé dans « À valider » garde le type proposé par
-- Claude (details.type_sejour), à vérifier.
create or replace function vigie.valider_changement(p_id uuid, p_accepter boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  c vigie.changements;
  d jsonb;
  v_activite uuid;
  v_nouvelle boolean := false;
  v_type text;
begin
  select * into c from vigie.changements where id = p_id for update;
  if c.id is null then
    raise exception 'Changement introuvable.';
  end if;
  if c.statut <> 'a_valider' then
    raise exception 'Ce changement a déjà été traité.';
  end if;
  d := c.details;

  if p_accepter then
    if c.type = 'prix' then
      update vigie.programmes set
        prix = coalesce((d->>'prix')::numeric, prix),
        duree_jours = coalesce((d->>'duree_jours')::integer, duree_jours),
        duree_nuits = coalesce((d->>'duree_nuits')::integer, duree_nuits),
        annee = coalesce(d->>'annee', annee),
        source_url = coalesce(c.source_url, source_url),
        verifie_le = now()
      where id = c.programme_id;

    elsif c.type = 'nouveau_programme' then
      v_type := d->>'type_sejour';
      if v_type not in ('camp_vacances','camp_familial','classe_nature','groupe') then
        v_type := null;
      end if;
      insert into vigie.programmes (camp_id, nom, description, duree_jours, duree_nuits, prix, annee, source_url, verifie_le,
                                    type_sejour, type_a_verifier)
      values (
        c.camp_id,
        coalesce(d->>'nom', c.nouvelle_valeur),
        d->>'description',
        (d->>'duree_jours')::integer,
        (d->>'duree_nuits')::integer,
        (d->>'prix')::numeric,
        d->>'annee',
        c.source_url,
        now(),
        v_type,
        true);

    elsif c.type = 'nouvelle_activite' then
      v_activite := c.activite_id;
      if v_activite is null then
        select id into v_activite from vigie.activites where lower(nom) = lower(d->>'activite_nom');
      end if;
      if v_activite is null then
        insert into vigie.activites (nom, description, saisons)
        values (
          d->>'activite_nom',
          d->>'description',
          coalesce(array(select jsonb_array_elements_text(d->'saisons')), '{}'))
        returning id into v_activite;
        v_nouvelle := true;
      end if;
      insert into vigie.camps_activites (camp_id, activite_id, source, note)
      values (c.camp_id, v_activite, coalesce(d->>'source', 'site'), d->>'preuve')
      on conflict do nothing;
      if d->>'photo_chemin' is not null or d->>'photo_url' is not null then
        insert into vigie.photos (activite_id, camp_id, chemin, url, page_source, legende)
        values (v_activite, c.camp_id, d->>'photo_chemin', d->>'photo_url', c.source_url, d->>'preuve')
        on conflict (activite_id, camp_id) do nothing;
      end if;
      update vigie.changements set activite_id = v_activite where id = c.id;
      -- Nouvelle activité candidate : Claude estime ses coûts.
      if v_nouvelle then
        insert into vigie.requetes_ia (type, activite_id) values ('couts', v_activite);
      end if;
    end if;
  end if;

  update vigie.changements set
    statut = case when p_accepter then 'valide' else 'rejete' end,
    valide_le = now(),
    valide_par = auth.uid()
  where id = c.id;
end;
$$;

-- create or replace garde les droits ; rappel pour une base neuve.
revoke execute on function vigie.valider_changement(uuid, boolean) from public, anon;
grant execute on function vigie.valider_changement(uuid, boolean) to authenticated, service_role;
