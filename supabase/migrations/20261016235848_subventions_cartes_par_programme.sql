-- ============================================================
-- Subventions : une carte par programme (demande de Maxime, 2026-10-16).
--
-- Avant : une subvention par compagnie. Claude trouvait le même programme
-- pour plusieurs compagnies (ex. Emplois d'été Canada pour cinq) et il
-- fallait l'écarter ou le retenir autant de fois.
--
-- Maintenant :
--   - grants = la carte d'un programme (une édition), avec ses compagnies
--     (company_ids : étiquettes, celles pour qui Claude l'a trouvée ou
--     qu'on a choisies). Retenir ou rejeter se fait une fois, pour la carte.
--   - grant_applications = une ligne de suivi par compagnie qui dépose une
--     demande, créée en retenant la carte (on coche les compagnies) :
--     statut (en cours, obtenue, refusée par l'organisme), montants et dates
--     demandé / accordé / reçu.
--   - Reddition de compte et attribution salariale : par ligne de suivi
--     (application_id) ; leur grant_id reste, posé par la base.
--   - Statut de la carte : nouveau / a_valider / rejete / expire tant
--     qu'elle n'a pas de ligne de suivi ; ensuite tiré des lignes (en cours
--     s'il en reste une en cours, sinon obtenue s'il y en a une, sinon
--     refusée). L'agenda, la mise à jour ciblée et les nouvelles éditions
--     gardent ainsi leurs règles.
--   - Recherche : un programme déjà connu (même program_key, ou même
--     adresse et même type) pour une autre compagnie n'est plus ajouté en
--     double : la compagnie s'ajoute à la carte, avec sa justification.
--
-- Les doublons existants sont réunis (même année de découverte, et même
-- program_key ou même adresse et même type, de proche en proche) : la carte
-- la plus avancée reste ; les autres lui donnent leurs compagnies, notes,
-- décisions, heures et propositions, et chaque compagnie retenue devient une
-- ligne de suivi.
-- ============================================================

-- ------------------------------------------------------------
-- Structure
-- ------------------------------------------------------------
alter table subventions.grants add column company_ids uuid[] not null default '{}';

comment on column subventions.grants.company_ids is
  'Compagnies de la carte (subventions.grant_companies) : celles pour qui Claude l''a trouvée, celles choisies à la main, et toujours celles qui ont une ligne de suivi.';

create table subventions.grant_applications (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references subventions.grants(id) on delete cascade,
  company_id uuid not null references subventions.grant_companies(id),
  status text not null default 'en_cours' check (status in ('en_cours', 'obtenu', 'refuse')),
  amount_requested numeric(12,2),
  amount_granted numeric(12,2),
  amount_received numeric(12,2),
  requested_at date,
  granted_at date,
  received_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (grant_id, company_id)
);

comment on table subventions.grant_applications is
  'Ligne de suivi : une compagnie qui dépose une demande pour une subvention retenue (statut, demandé, accordé, reçu).';

create index on subventions.grant_applications (company_id);

create trigger trg_applications_updated_at before update on subventions.grant_applications
for each row execute function core.maj_updated_at();

alter table subventions.grant_reporting_steps
  add column application_id uuid references subventions.grant_applications(id) on delete cascade;
alter table subventions.grant_salary_lines
  add column application_id uuid references subventions.grant_applications(id) on delete cascade;

-- ------------------------------------------------------------
-- Réunir les doublons
-- ------------------------------------------------------------
create temp table _cartes as
select g.id,
       g.discovered_fy as fy,
       g.program_key as cle,
       subventions.normaliser_url(g.source_url) as url,
       g.grant_type as type,
       g.id as groupe,
       null::uuid as garde,
       coalesce(g.applicant_company_id, g.target_company_id) as compagnie,
       -- La plus avancée reste : obtenue, en cours, refusée, en attente, nouvelle, expirée, rejetée.
       case g.status when 'obtenu' then 1 when 'en_cours' then 2 when 'refuse' then 3 when 'a_valider' then 4
                     when 'nouveau' then 5 when 'expire' then 6 else 7 end as rang,
       g.discovered_at
  from subventions.grants g;

-- Groupes de proche en proche : chaque carte prend le plus petit groupe de
-- ses voisines jusqu'à ce que plus rien ne change.
do $$
declare
  v_n int;
begin
  loop
    update _cartes a
       set groupe = b.m
      from (select x.id, min(y.groupe::text)::uuid as m
              from _cartes x
              join _cartes y
                on y.fy = x.fy and y.id <> x.id
               and ((x.cle is not null and y.cle = x.cle)
                 or (x.url is not null and y.url = x.url and y.type = x.type))
             group by x.id) b
     where a.id = b.id and b.m::text < a.groupe::text;
    get diagnostics v_n = row_count;
    exit when v_n = 0;
  end loop;
end $$;

update _cartes c
   set garde = g.garde
  from (select distinct on (groupe) groupe, id as garde
          from _cartes
         order by groupe, rang, discovered_at, id) g
 where g.groupe = c.groupe;

-- Membres des groupes de plus d'une carte, avec ce qu'il faut pour compléter
-- la carte gardée.
create temp table _membres as
select c.garde, c.id, c.rang, c.discovered_at, c.compagnie,
       coalesce(nullif(btrim(e.abreviation), ''), gc.name) as nom_compagnie,
       m.organisme, m.description, m.source_url, m.open_date, m.deadline_date, m.eligibility_criteria,
       m.program_key, m.previous_grant_id, m.update_checked_at, m.funded_start, m.funded_end,
       m.potential_amount_min, m.potential_amount_max, m.relevance_justification
  from _cartes c
  join subventions.grants m on m.id = c.id
  join subventions.grant_companies gc on gc.id = m.target_company_id
  left join core.entreprises e on e.id = gc.entreprise_id
 where c.groupe in (select groupe from _cartes group by groupe having count(*) > 1);

-- Lignes de suivi : chaque compagnie retenue (ou qui a déjà des étapes, des
-- salaires ou des montants) de chaque carte du groupe.
insert into subventions.grant_applications
  (grant_id, company_id, status, amount_requested, amount_granted, amount_received,
   requested_at, granted_at, received_at, created_at)
select distinct on (c.garde, c.compagnie)
       c.garde, c.compagnie,
       case when g.status in ('obtenu', 'refuse') then g.status::text else 'en_cours' end,
       g.amount_requested, g.amount_granted, g.amount_received,
       g.requested_at, g.granted_at, g.received_at, g.discovered_at
  from subventions.grants g
  join _cartes c on c.id = g.id
 where g.status in ('en_cours', 'obtenu', 'refuse')
    or coalesce(g.amount_requested, g.amount_granted, g.amount_received) is not null
    or exists (select 1 from subventions.grant_reporting_steps e where e.grant_id = g.id)
    or exists (select 1 from subventions.grant_salary_lines l where l.grant_id = g.id)
 order by c.garde, c.compagnie, c.rang, g.discovered_at;

-- Étapes et salaires : à la ligne de suivi de leur compagnie, sur la carte gardée.
update subventions.grant_reporting_steps e
   set application_id = a.id, grant_id = c.garde
  from _cartes c
  join subventions.grant_applications a on a.grant_id = c.garde and a.company_id = c.compagnie
 where e.grant_id = c.id;

update subventions.grant_salary_lines l
   set application_id = a.id, grant_id = c.garde
  from _cartes c
  join subventions.grant_applications a on a.grant_id = c.garde and a.company_id = c.compagnie
 where l.grant_id = c.id;

-- Compagnies de la carte : celles pour qui chaque doublon a été trouvé et
-- celles qui déposaient.
update subventions.grants g
   set company_ids = x.ids
  from (select c.garde, array_agg(distinct e) as ids
          from _cartes c
          join subventions.grants m on m.id = c.id
         cross join lateral unnest(array[m.target_company_id, m.applicant_company_id]) as e
         where e is not null
         group by c.garde) x
 where g.id = x.garde;

-- Ce qui manque à la carte gardée est pris chez les autres (la plus avancée
-- d'abord) ; période financée et montants potentiels vont par paires.
update subventions.grants g
   set organisme = coalesce(g.organisme,
         (select m.organisme from _membres m where m.garde = g.id and m.organisme is not null order by m.rang, m.discovered_at limit 1)),
       description = coalesce(g.description,
         (select m.description from _membres m where m.garde = g.id and m.description is not null order by m.rang, m.discovered_at limit 1)),
       source_url = coalesce(g.source_url,
         (select m.source_url from _membres m where m.garde = g.id and m.source_url is not null order by m.rang, m.discovered_at limit 1)),
       open_date = coalesce(g.open_date,
         (select m.open_date from _membres m where m.garde = g.id and m.open_date is not null order by m.rang, m.discovered_at limit 1)),
       deadline_date = coalesce(g.deadline_date,
         (select m.deadline_date from _membres m where m.garde = g.id and m.deadline_date is not null order by m.rang, m.discovered_at limit 1)),
       eligibility_criteria = coalesce(g.eligibility_criteria,
         (select m.eligibility_criteria from _membres m where m.garde = g.id and m.eligibility_criteria is not null order by m.rang, m.discovered_at limit 1)),
       program_key = coalesce(g.program_key,
         (select m.program_key from _membres m where m.garde = g.id and m.program_key is not null order by m.rang, m.discovered_at limit 1)),
       previous_grant_id = coalesce(g.previous_grant_id,
         (select m.previous_grant_id from _membres m where m.garde = g.id and m.previous_grant_id is not null order by m.rang, m.discovered_at limit 1)),
       update_checked_at = (select max(m.update_checked_at) from _membres m where m.garde = g.id),
       funded_start = case when g.funded_start is not null or g.funded_end is not null then g.funded_start else
         ((select array[m.funded_start, m.funded_end] from _membres m
            where m.garde = g.id and (m.funded_start is not null or m.funded_end is not null)
            order by m.rang, m.discovered_at limit 1))[1] end,
       funded_end = case when g.funded_start is not null or g.funded_end is not null then g.funded_end else
         ((select array[m.funded_start, m.funded_end] from _membres m
            where m.garde = g.id and (m.funded_start is not null or m.funded_end is not null)
            order by m.rang, m.discovered_at limit 1))[2] end,
       potential_amount_min = case when g.potential_amount_min is not null or g.potential_amount_max is not null then g.potential_amount_min else
         ((select array[m.potential_amount_min, m.potential_amount_max] from _membres m
            where m.garde = g.id and (m.potential_amount_min is not null or m.potential_amount_max is not null)
            order by m.rang, m.discovered_at limit 1))[1] end,
       potential_amount_max = case when g.potential_amount_min is not null or g.potential_amount_max is not null then g.potential_amount_max else
         ((select array[m.potential_amount_min, m.potential_amount_max] from _membres m
            where m.garde = g.id and (m.potential_amount_min is not null or m.potential_amount_max is not null)
            order by m.rang, m.discovered_at limit 1))[2] end,
       -- Pourquoi Claude la propose : une justification par compagnie, si elles diffèrent.
       relevance_justification = coalesce(
         (select string_agg(j.nom_compagnie || ' : ' || j.texte, E'\n\n' order by j.rang, j.discovered_at)
            from (select distinct on (btrim(m.relevance_justification)) m.nom_compagnie, btrim(m.relevance_justification) as texte,
                         m.rang, m.discovered_at
                    from _membres m
                   where m.garde = g.id and nullif(btrim(m.relevance_justification), '') is not null
                   order by btrim(m.relevance_justification), m.rang, m.discovered_at) j
          having count(*) > 1),
         g.relevance_justification)
 where g.id in (select garde from _membres);

-- Notes, décisions, heures et propositions passent à la carte gardée. Une
-- proposition ouverte en double pour un même champ : celle de la carte
-- gardée, sinon la plus récente.
update subventions.grant_notes n set grant_id = c.garde from _cartes c where n.grant_id = c.id and c.id <> c.garde;
update subventions.grant_feedback f set grant_id = c.garde from _cartes c where f.grant_id = c.id and c.id <> c.garde;
update subventions.grant_time_entries h set grant_id = c.garde from _cartes c where h.grant_id = c.id and c.id <> c.garde;

delete from subventions.grant_proposals p
 using _cartes c
 where p.grant_id = c.id and c.id <> c.garde and p.status = 'a_valider'
   and exists (
     select 1
       from subventions.grant_proposals q
       join _cartes cq on cq.id = q.grant_id
      where cq.garde = c.garde and q.field = p.field and q.status = 'a_valider' and q.id <> p.id
        and (cq.id = cq.garde or q.created_at > p.created_at or (q.created_at = p.created_at and q.id::text > p.id::text)));
update subventions.grant_proposals p set grant_id = c.garde from _cartes c where p.grant_id = c.id and c.id <> c.garde;

-- Décisions identiques (même personne, même décision, même raison, même
-- commentaire) réunies : la première reste.
delete from subventions.grant_feedback f
 using subventions.grant_feedback d
 where f.grant_id = d.grant_id and f.id <> d.id
   and f.grant_id in (select garde from _membres)
   and f.decided_by = d.decided_by and f.decision = d.decision
   and f.reject_category is not distinct from d.reject_category
   and coalesce(btrim(f.comment), '') = coalesce(btrim(d.comment), '')
   and (d.decided_at, d.id::text) < (f.decided_at, f.id::text);

update subventions.grants g
   set previous_grant_id = c.garde
  from _cartes c
 where g.previous_grant_id = c.id and c.id <> c.garde;
update subventions.grants set previous_grant_id = null where previous_grant_id = id;

-- Les dates déjà dans l'agenda (grant_calendar_events) des cartes retirées
-- restent : le Worker retire au passage suivant ce qui n'est plus voulu.
delete from subventions.grants g using _cartes c where g.id = c.id and c.id <> c.garde;

-- Statut d'une carte sans ligne de suivi : le plus avancé de son groupe
-- (en attente, nouvelle, expirée, rejetée). Avec des lignes : déclencheur
-- plus bas.
update subventions.grants g
   set status = case x.rang when 4 then 'a_valider' when 5 then 'nouveau' when 6 then 'expire' else 'rejete' end::subventions.grant_status
  from (select garde, min(rang) as rang from _cartes group by garde having count(*) > 1) x
 where g.id = x.garde and x.rang > 3
   and not exists (select 1 from subventions.grant_applications a where a.grant_id = g.id);

drop table _membres;
drop table _cartes;

-- Toute étape et toute attribution salariale a maintenant sa ligne de suivi.
alter table subventions.grant_reporting_steps alter column application_id set not null;
alter table subventions.grant_salary_lines alter column application_id set not null;
create index on subventions.grant_reporting_steps (application_id, sort_order);
create index on subventions.grant_salary_lines (application_id);

-- Le suivi par compagnie remplace les colonnes de la carte.
alter table subventions.grants
  drop column target_company_id,
  drop column applicant_company_id,
  drop column amount_requested,
  drop column amount_granted,
  drop column amount_received,
  drop column requested_at,
  drop column granted_at,
  drop column received_at,
  add constraint grants_compagnies check (cardinality(company_ids) > 0);

create index on subventions.grants using gin (company_ids);

-- ------------------------------------------------------------
-- Statut et compagnies de la carte, tenus par la base
-- ------------------------------------------------------------

-- Statut tiré des lignes de suivi ; null : aucune ligne.
create function subventions.statut_des_suivis(p_grant uuid)
returns subventions.grant_status
language sql
stable
set search_path = ''
as $$
  select case
           when bool_or(a.status = 'en_cours') then 'en_cours'
           when bool_or(a.status = 'obtenu') then 'obtenu'
           when count(*) > 0 then 'refuse'
         end::subventions.grant_status
    from subventions.grant_applications a
   where a.grant_id = p_grant
$$;

-- Avant chaque écriture d'une carte : avec des lignes de suivi, son statut en
-- vient ; sans ligne, elle ne peut pas être en cours, obtenue ou refusée
-- (dernière ligne retirée : retour « en attente »). Ses compagnies
-- comprennent toujours celles de ses lignes, sans doublon.
create function subventions.poser_carte()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_statut subventions.grant_status := subventions.statut_des_suivis(new.id);
begin
  if v_statut is not null then
    new.status := v_statut;
  elsif new.status in ('en_cours', 'obtenu', 'refuse') then
    new.status := 'a_valider';
  end if;
  new.company_ids := array(
    select x
      from unnest(new.company_ids || array(select a.company_id from subventions.grant_applications a where a.grant_id = new.id))
           with ordinality as u(x, i)
     where x is not null
     group by x
     order by min(i));
  return new;
end;
$$;

create trigger trg_carte before insert or update on subventions.grants
for each row execute function subventions.poser_carte();

-- Année fiscale proposée : période financée, sinon date limite, sinon la
-- première date d'octroi de ses lignes de suivi, sinon année de la
-- découverte. Choisie à la main : gardée.
create or replace function subventions.poser_annee_fiscale()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.fiscal_year is null then
    new.fiscal_year_manual := false;
  end if;
  if not new.fiscal_year_manual then
    new.fiscal_year := coalesce(
      subventions.fiscal_year(new.funded_start),
      subventions.fiscal_year(new.deadline_date),
      subventions.fiscal_year((select min(a.granted_at) from subventions.grant_applications a where a.grant_id = new.id)),
      new.discovered_fy);
  end if;
  return new;
end;
$$;

-- Une ligne de suivi ajoutée, changée ou retirée : la carte se recalcule
-- (statut, compagnies, année fiscale).
create function subventions.suivi_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update subventions.grants set status = status where id = coalesce(new.grant_id, old.grant_id);
  if tg_op = 'UPDATE' and new.grant_id <> old.grant_id then
    update subventions.grants set status = status where id = old.grant_id;
  end if;
  return null;
end;
$$;

create trigger trg_suivi_change after insert or delete or update of grant_id, company_id, status, granted_at
on subventions.grant_applications
for each row execute function subventions.suivi_change();

-- Étapes de reddition et attributions salariales : leur carte est celle de
-- leur ligne de suivi.
create function subventions.poser_carte_du_suivi()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select a.grant_id into new.grant_id from subventions.grant_applications a where a.id = new.application_id;
  if new.grant_id is null then
    raise exception 'Ligne de suivi introuvable.';
  end if;
  return new;
end;
$$;

create trigger trg_carte_du_suivi before insert or update on subventions.grant_reporting_steps
for each row execute function subventions.poser_carte_du_suivi();
create trigger trg_carte_du_suivi before insert or update on subventions.grant_salary_lines
for each row execute function subventions.poser_carte_du_suivi();

-- Une entreprise de recherche qui a des subventions ne se supprime pas
-- (avant : clé étrangère de target_company_id) : on la désactive.
create function subventions.garder_compagnie_des_cartes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from subventions.grants g where old.id = any (g.company_ids)) then
    raise exception 'Cette entreprise a des subventions : désactivez-la plutôt.';
  end if;
  return old;
end;
$$;

create trigger trg_garder_compagnie before delete on subventions.grant_companies
for each row execute function subventions.garder_compagnie_des_cartes();

-- Les cartes gardées se recalculent (statut tiré de leurs lignes, année
-- fiscale avec la date d'octroi des lignes).
update subventions.grants g
   set status = status
 where exists (select 1 from subventions.grant_applications a where a.grant_id = g.id);

-- ------------------------------------------------------------
-- Décider : une fois pour la carte
-- ------------------------------------------------------------

-- Retenir = une ligne de suivi par compagnie cochée (au moins une) ;
-- rejeter = la carte entière (pas si elle a des lignes de suivi). Feedback
-- et décision en une transaction.
drop function subventions.decider(uuid, text, subventions.reject_category, text, uuid);

create function subventions.decider(
  p_grant uuid,
  p_decision text,
  p_categorie subventions.reject_category default null,
  p_commentaire text default null,
  p_compagnies uuid[] default null
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_decision not in ('valide', 'rejete') then
    raise exception 'Décision inconnue : %', p_decision;
  end if;
  perform 1 from subventions.grants where id = p_grant for update;
  if not found then
    raise exception 'Subvention introuvable.';
  end if;
  if p_decision = 'valide' then
    if coalesce(cardinality(p_compagnies), 0) = 0 then
      raise exception 'Cochez au moins une compagnie qui dépose une demande.';
    end if;
    insert into subventions.grant_applications (grant_id, company_id)
    select p_grant, c from unnest(p_compagnies) as c
    on conflict (grant_id, company_id) do nothing;
  else
    if exists (select 1 from subventions.grant_applications a where a.grant_id = p_grant) then
      raise exception 'Cette subvention a des lignes de suivi : retirez-les avant de la rejeter.';
    end if;
    update subventions.grants set status = 'rejete' where id = p_grant;
  end if;
  insert into subventions.grant_feedback (grant_id, decision, reject_category, comment)
  values (p_grant, p_decision,
          case when p_decision = 'rejete' then p_categorie end,
          nullif(btrim(p_commentaire), ''));
end;
$$;

-- Reprend les étapes de reddition d'une autre ligne de suivi (même
-- programme pour une autre compagnie, ou édition précédente) : ajoutées à
-- la suite, « à faire », échéances décalées d'autant d'années fiscales que
-- les deux cartes.
drop function subventions.copier_etapes(uuid, uuid);

create function subventions.reprendre_etapes(p_source uuid, p_cible uuid)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_ecart int;
  v_carte_source uuid;
  v_carte_cible uuid;
  v_debut int;
  v_n int;
begin
  if p_source = p_cible then
    raise exception 'Choisissez une autre ligne de suivi.';
  end if;
  select greatest(gc.fiscal_year - gs.fiscal_year, 0), s.grant_id, c.grant_id
    into v_ecart, v_carte_source, v_carte_cible
    from subventions.grant_applications s
    join subventions.grants gs on gs.id = s.grant_id
   cross join subventions.grant_applications c
    join subventions.grants gc on gc.id = c.grant_id
   where s.id = p_source and c.id = p_cible;
  if v_ecart is null then
    raise exception 'Ligne de suivi introuvable.';
  end if;
  select coalesce(max(sort_order) + 1, 0) into v_debut
    from subventions.grant_reporting_steps where application_id = p_cible;

  insert into subventions.grant_reporting_steps
    (application_id, grant_id, description, due_date, status, template_source_step_id, sort_order)
  select p_cible, v_carte_cible, e.description,
         (e.due_date + make_interval(years => v_ecart))::date,
         'a_faire', e.id, v_debut + row_number() over (order by e.sort_order, e.created_at) - 1
    from subventions.grant_reporting_steps e
   where e.application_id = p_source;
  get diagnostics v_n = row_count;

  if v_carte_source <> v_carte_cible then
    update subventions.grants
       set previous_grant_id = coalesce(previous_grant_id, v_carte_source)
     where id = v_carte_cible;
  end if;
  return v_n;
end;
$$;

-- ------------------------------------------------------------
-- Recherche (Worker)
-- ------------------------------------------------------------

-- Nom court d'une entreprise de recherche (abréviation du référentiel,
-- sinon son nom).
create function subventions.nom_court(p_company uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(btrim(e.abreviation), ''), c.name)
    from subventions.grant_companies c
    left join core.entreprises e on e.id = c.entreprise_id
   where c.id = p_company
$$;

-- Dédoublonne et insère les programmes trouvés pour une entreprise. Même
-- programme : même program_key, ou même adresse (normalisée) et même type.
-- Déjà connu (carte nouvelle, en attente, en cours ou rejetée, ou trouvée
-- la même année fiscale) : pas de nouvelle carte ; l'entreprise s'ajoute à
-- la carte (sauf rejetée), avec sa justification tant que la carte n'est pas
-- décidée. Sinon (obtenue, refusée ou expirée une année précédente) : nouvelle
-- édition d'un programme récurrent, reliée à la précédente.
create or replace function subventions.inserer_resultats(p_run uuid, p_items jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_entreprise uuid;
  v_nom text;
  v_fy int := subventions.fiscal_year(current_date);
  v_item jsonb;
  v_url text;
  v_cle text;
  v_type subventions.grant_type;
  v_justif text;
  v_carte subventions.grants;
  v_precedente uuid;
  v_nouveaux int := 0;
  v_doublons int := 0;
  v_ajouts int := 0;
begin
  select company_id into v_entreprise from subventions.grant_search_runs where id = p_run;
  if v_entreprise is null then
    raise exception 'Recherche % introuvable', p_run;
  end if;
  v_nom := subventions.nom_court(v_entreprise);

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_url := nullif(btrim(v_item->>'source_url'), '');
    v_cle := nullif(lower(btrim(v_item->>'program_key')), '');
    v_type := coalesce(v_item->>'grant_type', 'autre')::subventions.grant_type;
    v_justif := nullif(btrim(v_item->>'relevance_justification'), '');

    select g.* into v_carte
      from subventions.grants g
     where ((v_cle is not null and g.program_key = v_cle)
         or (v_url is not null and g.grant_type = v_type
             and subventions.normaliser_url(g.source_url) = subventions.normaliser_url(v_url)))
       and (g.status in ('nouveau', 'a_valider', 'en_cours', 'rejete') or g.discovered_fy = v_fy)
     order by (g.discovered_fy = v_fy) desc, g.discovered_at desc
     limit 1;

    if found then
      v_doublons := v_doublons + 1;
      if v_carte.status <> 'rejete' and not (v_entreprise = any (v_carte.company_ids)) then
        update subventions.grants
           set company_ids = company_ids || v_entreprise,
               relevance_justification = case
                 when status not in ('nouveau', 'a_valider') or v_justif is null then relevance_justification
                 else concat_ws(E'\n\n',
                        case when nullif(btrim(relevance_justification), '') is null then null
                             when cardinality(company_ids) = 1
                               then subventions.nom_court(company_ids[1]) || ' : ' || btrim(relevance_justification)
                             else btrim(relevance_justification) end,
                        v_nom || ' : ' || v_justif)
               end
         where id = v_carte.id;
        v_ajouts := v_ajouts + 1;
      end if;
      continue;
    end if;

    select g.id into v_precedente
      from subventions.grants g
     where (v_cle is not null and g.program_key = v_cle)
        or (v_url is not null and g.grant_type = v_type
            and subventions.normaliser_url(g.source_url) = subventions.normaliser_url(v_url))
     order by g.discovered_at desc
     limit 1;

    insert into subventions.grants (
      program_name, organisme, description, source_url, grant_type,
      potential_amount_min, potential_amount_max, open_date, deadline_date,
      funded_start, funded_end, eligibility_criteria,
      relevance_justification, program_key, previous_grant_id,
      origin, search_run_id, company_ids, discovered_fy)
    values (
      v_item->>'program_name', v_item->>'organisme', v_item->>'description', v_url, v_type,
      (v_item->>'potential_amount_min')::numeric, (v_item->>'potential_amount_max')::numeric,
      (v_item->>'open_date')::date, (v_item->>'deadline_date')::date,
      (v_item->>'funded_start')::date,
      case when (v_item->>'funded_end')::date >= coalesce((v_item->>'funded_start')::date, '-infinity'::date)
           then (v_item->>'funded_end')::date end,
      nullif(btrim(v_item->>'eligibility_criteria'), ''),
      v_justif, v_cle, v_precedente,
      'claude', p_run, array[v_entreprise], v_fy);
    v_nouveaux := v_nouveaux + 1;
  end loop;

  update subventions.grant_search_runs
     set found_count = jsonb_array_length(coalesce(p_items, '[]'::jsonb)),
         new_count = v_nouveaux,
         duplicate_count = v_doublons
   where id = p_run;

  return jsonb_build_object('found', jsonb_array_length(coalesce(p_items, '[]'::jsonb)),
                            'new', v_nouveaux, 'duplicate', v_doublons, 'added_to', v_ajouts);
end;
$$;

-- Cartes d'une entreprise à mettre à jour (mise à jour ciblée) : celles où
-- elle a une ligne de suivi, en cours, ou obtenues l'année fiscale en cours
-- ou la précédente et sans édition suivante. Une carte de plusieurs
-- compagnies n'est vérifiée qu'une fois par trimestre (`p_depuis`).
create or replace function subventions.retenues_a_verifier(p_company uuid, p_depuis timestamptz default null, p_max int default 10)
returns setof subventions.grants
language sql
stable
set search_path = ''
as $$
  select g.*
    from subventions.grants g
   where exists (select 1 from subventions.grant_applications a where a.grant_id = g.id and a.company_id = p_company)
     and (g.status = 'en_cours'
          or (g.status = 'obtenu'
              and g.fiscal_year >= subventions.fiscal_year(current_date) - 1
              and not exists (select 1 from subventions.grants n where n.previous_grant_id = g.id)))
     and (p_depuis is null or g.update_checked_at is null or g.update_checked_at < p_depuis)
   order by g.update_checked_at nulls first, g.deadline_date nulls last, g.program_name
   limit p_max
$$;

-- Mise à jour ciblée : mêmes règles qu'avant ; la nouvelle édition d'une
-- obtenue reprend les compagnies de la carte, et un programme déjà connu se
-- reconnaît comme à la recherche large (sans égard à la compagnie).
create or replace function subventions.appliquer_mise_a_jour(p_run uuid, p_items jsonb, p_grants uuid[])
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_champs text[] := array['source_url', 'open_date', 'deadline_date', 'funded_start', 'funded_end',
                           'potential_amount_min', 'potential_amount_max', 'eligibility_criteria'];
  v_item jsonb;
  v_g subventions.grants;
  v_champ text;
  v_nouveau text;
  v_actuel text;
  v_ed jsonb;
  v_cle text;
  v_url text;
  v_id uuid;
  v_fy int := subventions.fiscal_year(current_date);
  v_remplis int := 0;
  v_proposes int := 0;
  v_editions int := 0;
  v_doublons int := 0;
begin
  if not exists (select 1 from subventions.grant_search_runs where id = p_run) then
    raise exception 'Recherche % introuvable', p_run;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select * into v_g from subventions.grants
     where id = (v_item->>'grant_id')::uuid and id = any (p_grants)
     for update;
    if not found then
      continue;
    end if;

    if v_g.status = 'en_cours' then
      foreach v_champ in array v_champs loop
        v_nouveau := nullif(btrim(v_item->>v_champ), '');
        continue when v_nouveau is null;
        v_actuel := nullif(btrim(to_jsonb(v_g)->>v_champ), '');
        if v_actuel is null then
          begin
            execute format('update subventions.grants set %I = $1::%s where id = $2', v_champ, subventions.type_champ(v_champ))
              using v_nouveau, v_g.id;
            insert into subventions.grant_proposals
              (grant_id, field, current_value, proposed_value, status, source_url, comment, search_run_id)
            values (v_g.id, v_champ, null, v_nouveau, 'appliquee',
                    nullif(btrim(v_item->>'verification_url'), ''), nullif(btrim(v_item->>'comment'), ''), p_run);
            v_remplis := v_remplis + 1;
          exception when others then
            -- Ex. fin de période avant le début : le champ reste vide.
            null;
          end;
        elsif not subventions.meme_valeur(v_champ, v_actuel, v_nouveau)
              and not exists (
                select 1 from subventions.grant_proposals p
                 where p.grant_id = v_g.id and p.field = v_champ and p.status = 'refusee'
                   and subventions.meme_valeur(v_champ, p.proposed_value, v_nouveau)) then
          delete from subventions.grant_proposals
           where grant_id = v_g.id and field = v_champ and status = 'a_valider';
          insert into subventions.grant_proposals
            (grant_id, field, current_value, proposed_value, status, source_url, comment, search_run_id)
          values (v_g.id, v_champ, v_actuel, v_nouveau, 'a_valider',
                  nullif(btrim(v_item->>'verification_url'), ''), nullif(btrim(v_item->>'comment'), ''), p_run);
          v_proposes := v_proposes + 1;
        end if;
      end loop;

    elsif v_g.status = 'obtenu' and jsonb_typeof(v_item->'new_edition') = 'object' then
      v_ed := v_item->'new_edition';
      v_cle := coalesce(v_g.program_key, nullif(lower(btrim(v_ed->>'program_key')), ''));
      v_url := nullif(btrim(v_ed->>'source_url'), '');
      if exists (
        select 1 from subventions.grants x
         where x.id <> v_g.id
           and (x.previous_grant_id = v_g.id
                or (((v_cle is not null and x.program_key = v_cle)
                     or (v_url is not null and x.grant_type = v_g.grant_type
                         and subventions.normaliser_url(x.source_url) = subventions.normaliser_url(v_url)))
                    and (x.status in ('nouveau', 'a_valider', 'en_cours', 'rejete') or x.discovered_fy = v_fy)))) then
        v_doublons := v_doublons + 1;
      else
        v_id := null;
        insert into subventions.grants (
          program_name, organisme, description, source_url, grant_type,
          potential_amount_min, potential_amount_max, open_date, deadline_date,
          funded_start, funded_end, eligibility_criteria,
          relevance_justification, program_key, previous_grant_id,
          origin, search_run_id, company_ids, discovered_fy)
        values (
          coalesce(nullif(btrim(v_ed->>'program_name'), ''), v_g.program_name),
          v_g.organisme,
          coalesce(nullif(btrim(v_ed->>'description'), ''), v_g.description),
          coalesce(v_url, v_g.source_url),
          v_g.grant_type,
          (v_ed->>'potential_amount_min')::numeric, (v_ed->>'potential_amount_max')::numeric,
          (v_ed->>'open_date')::date, (v_ed->>'deadline_date')::date,
          (v_ed->>'funded_start')::date, (v_ed->>'funded_end')::date,
          coalesce(nullif(btrim(v_ed->>'eligibility_criteria'), ''), v_g.eligibility_criteria),
          'Nouvelle édition d''un programme obtenu (' || v_g.program_name || ').'
            || coalesce(' ' || nullif(btrim(v_item->>'comment'), ''), ''),
          v_cle, v_g.id, 'claude', p_run, v_g.company_ids, v_fy)
        on conflict do nothing
        returning id into v_id;
        if v_id is not null then
          v_editions := v_editions + 1;
        else
          v_doublons := v_doublons + 1;
        end if;
      end if;
    end if;
  end loop;

  update subventions.grants set update_checked_at = now() where id = any (p_grants);

  -- Mise à jour ciblée : found_count = subventions vérifiées.
  update subventions.grant_search_runs
     set found_count = coalesce(array_length(p_grants, 1), 0),
         new_count = v_editions,
         duplicate_count = v_doublons,
         filled_count = v_remplis,
         proposed_count = v_proposes
   where id = p_run;

  return jsonb_build_object('checked', coalesce(array_length(p_grants, 1), 0), 'filled', v_remplis,
                            'proposed', v_proposes, 'new', v_editions, 'duplicate', v_doublons);
end;
$$;

-- Feedback pour la mémoire : une décision vaut pour la carte, donc pour
-- toutes ses compagnies (noms courts, séparés par des virgules).
drop function subventions.feedback_pour_memoire();

create function subventions.feedback_pour_memoire()
returns table (
  decision text, reject_category text, comment text, decided_at timestamptz,
  program_name text, organisme text, grant_type text, source_url text,
  potential_amount_max numeric, company_name text)
language sql
stable
set search_path = ''
as $$
  select f.decision, f.reject_category::text, f.comment, f.decided_at,
         g.program_name, g.organisme, g.grant_type::text, g.source_url,
         g.potential_amount_max,
         (select string_agg(subventions.nom_court(c), ', ' order by u.i)
            from unnest(g.company_ids) with ordinality as u(c, i))
    from subventions.grant_feedback f
    join subventions.grants g on g.id = f.grant_id
   order by f.decided_at desc
   limit 300
$$;

-- ------------------------------------------------------------
-- Droits, RLS et temps réel
-- ------------------------------------------------------------
grant select, insert, update, delete on subventions.grant_applications to authenticated, service_role;

alter table subventions.grant_applications enable row level security;
create policy "Lire" on subventions.grant_applications for select to authenticated using (subventions.a_acces());
create policy "Écrire" on subventions.grant_applications for all to authenticated
  using (subventions.a_acces()) with check (subventions.a_acces());

revoke execute on function
  subventions.statut_des_suivis(uuid), subventions.poser_carte(), subventions.suivi_change(),
  subventions.poser_carte_du_suivi(), subventions.garder_compagnie_des_cartes(), subventions.nom_court(uuid),
  subventions.decider(uuid, text, subventions.reject_category, text, uuid[]), subventions.reprendre_etapes(uuid, uuid),
  subventions.feedback_pour_memoire()
  from public, anon;
grant execute on function
  subventions.statut_des_suivis(uuid), subventions.nom_court(uuid),
  subventions.decider(uuid, text, subventions.reject_category, text, uuid[]), subventions.reprendre_etapes(uuid, uuid)
  to authenticated, service_role;
grant execute on function subventions.feedback_pour_memoire() to service_role;

alter publication supabase_realtime add table subventions.grant_applications;
