-- ============================================================
-- Réservations, phase 4 : QuickBooks Online (façon A, plan §6 ; Q12
-- tranchée par Maxime le 2026-10-09).
--
-- - Un dossier QBO par compagnie qui facture (GBPA+, Opikawa) : connexion
--   OAuth faite par le Worker, jetons chiffrés, jamais lisibles par l'app.
-- - L'app crée le client et le devis QBO à partir de l'estimé accepté ;
--   l'adjointe fait les factures progressives dans QBO (« Créer une
--   facture → % ») ; l'app les retrouve (liées au devis), suit les soldes
--   et ferme les relances de facturation toute seule.
-- - Factures séparées (bris, hors forfait) et notes de crédit : créées par
--   l'app dans QBO.
-- Tout ce qui parle à QBO passe par le Worker (clé secrète) : l'app ne
-- fait que lire ces tables.
-- ============================================================

-- ------------------------------------------------------------
-- Connexion d'une compagnie à son dossier QBO
-- ------------------------------------------------------------
create table reservations.qbo_connexions (
  compagnie_id uuid primary key references core.entreprises(id) on delete cascade,
  realm_id text not null,
  environnement text not null check (environnement in ('sandbox', 'production')),
  -- Jetons OAuth chiffrés par le Worker (AES-GCM, secret QBO_CLE).
  jetons text not null,
  connecte_le timestamptz not null default now(),
  connecte_par_nom text,
  derniere_synchro timestamptz,
  erreur text,
  maj_le timestamptz not null default now()
);

alter table reservations.qbo_connexions enable row level security;
grant all on reservations.qbo_connexions to service_role;

-- État des connexions, sans les jetons.
create function reservations.qbo_etat()
returns table (
  compagnie_id uuid,
  realm_id text,
  environnement text,
  connecte_le timestamptz,
  connecte_par_nom text,
  derniere_synchro timestamptz,
  erreur text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.compagnie_id, c.realm_id, c.environnement, c.connecte_le, c.connecte_par_nom, c.derniere_synchro, c.erreur
  from reservations.qbo_connexions c
  where core.peut_lire('reservations')
$$;

-- Réglages QBO d'une compagnie, choisis dans l'app parmi les listes de son
-- dossier : {"article": {id, nom}, "taxes": {id, nom}, "terme": {id, nom}}.
alter table reservations.compagnies add column qbo jsonb not null default '{}';

-- Article QBO d'un produit, par compagnie (Q9 : à préciser avec la
-- comptable ; vide = l'article par défaut de la compagnie).
alter table reservations.produits add column qbo_articles jsonb not null default '{}';

-- Qui fait les factures dans QBO (l'adjointe) : les relances de
-- facturation lui vont ; vide = la personne responsable de la réservation.
insert into reservations.reglages (cle, valeur) values ('responsable_facturation', 'null')
on conflict (cle) do nothing;

-- ------------------------------------------------------------
-- Clients, devis et factures de QBO
-- ------------------------------------------------------------

-- Client QBO d'une organisation du CRM, par compagnie (relié une fois pour toutes).
create table reservations.qbo_clients (
  organisation_id uuid not null references crm.organisations(id) on delete cascade,
  compagnie_id uuid not null references core.entreprises(id) on delete cascade,
  qbo_id text not null,
  nom text not null,
  relie_le timestamptz not null default now(),
  primary key (organisation_id, compagnie_id),
  unique (compagnie_id, qbo_id)
);

-- Devis QBO d'une réservation (numéro = numéro de la réservation).
create table reservations.qbo_devis (
  reservation_id uuid primary key references reservations.reservations(id) on delete cascade,
  compagnie_id uuid not null references core.entreprises(id) on delete restrict,
  qbo_id text not null,
  numero text,
  -- Version de l'estimé de l'app recopiée dans le devis.
  estime_id uuid references reservations.estimes(id) on delete set null,
  estime_version integer,
  -- Total du devis dans QBO et total de l'estimé de l'app, taxes comprises :
  -- un écart arrête la facturation (contrôle du SOP).
  total numeric(12,2) not null,
  total_app numeric(12,2) not null,
  statut text,
  cree_le timestamptz not null default now(),
  cree_par_nom text,
  maj_le timestamptz not null default now(),
  unique (compagnie_id, qbo_id)
);

-- Factures et notes de crédit de QBO liées à une réservation. Les numéros
-- sont ceux de QBO (Q10) ; les soldes viennent des paiements entrés dans
-- QBO par l'adjointe (F25).
create table reservations.factures (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations.reservations(id) on delete cascade,
  compagnie_id uuid not null references core.entreprises(id) on delete restrict,
  qbo_type text not null check (qbo_type in ('Invoice', 'CreditMemo')),
  qbo_id text not null,
  -- progressive : tirée du devis dans QBO ; separee : bris et hors forfait
  -- (F6) ; note_credit : réduction après la facture finale (F15).
  genre text not null check (genre in ('progressive', 'separee', 'note_credit')),
  numero text,
  date_facture date,
  echeance date,
  total numeric(12,2) not null,
  solde numeric(12,2) not null default 0,
  -- Supprimée ou annulée dans QBO.
  supprimee boolean not null default false,
  maj_le timestamptz not null default now(),
  unique (compagnie_id, qbo_type, qbo_id)
);

create index idx_reservations_factures on reservations.factures (reservation_id);

alter table reservations.qbo_clients enable row level security;
alter table reservations.qbo_devis enable row level security;
alter table reservations.factures enable row level security;
grant select on reservations.qbo_clients, reservations.qbo_devis, reservations.factures to authenticated;
grant all on reservations.qbo_clients, reservations.qbo_devis, reservations.factures to service_role;
create policy "Lire" on reservations.qbo_clients for select to authenticated using (core.peut_lire('reservations'));
create policy "Lire" on reservations.qbo_devis for select to authenticated using (core.peut_lire('reservations'));
create policy "Lire" on reservations.factures for select to authenticated using (core.peut_lire('reservations'));

alter publication supabase_realtime add table reservations.qbo_devis, reservations.factures;

-- ------------------------------------------------------------
-- Relances de facturation (CRM, « Ma journée »)
-- ------------------------------------------------------------

-- À qui vont les relances de facturation d'une réservation.
create function reservations.responsable_facturation(p_reservation uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select nullif(g.valeur #>> '{}', '')::uuid from reservations.reglages g where g.cle = 'responsable_facturation'),
    (select r.responsable_id from reservations.reservations r where r.id = p_reservation))
$$;

-- Contrat signé : une relance « créer le devis QBO » (une seule fois).
create function reservations.tache_devis_qbo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.signe_le is not null and old.signe_le is null and new.organisation_id is not null and new.origine <> 'import'
     and not exists (select 1 from reservations.qbo_devis d where d.reservation_id = new.id) then
    insert into crm.relances (organisation_id, reservation_id, titre, echeance, assigne_a, source_cle, auteur_nom)
    values (new.organisation_id, new.id, new.numero || ' : contrat signé, créer le devis QBO (fiche › Facturation)',
      (now() at time zone 'America/Toronto')::date, reservations.responsable_facturation(new.id),
      'qbo:' || new.id || ':devis', 'Réservations')
    on conflict (source_cle) do nothing;
  end if;
  return null;
end;
$$;

create trigger trg_reservations_tache_devis_qbo after update of signe_le on reservations.reservations
for each row execute function reservations.tache_devis_qbo();

-- Relances de l'échéancier, posées par le Worker à la création du devis
-- (calcul : facturation.ts) : [{cle, titre, echeance}]. Une relance déjà
-- faite ou annulée n'est pas touchée ; celle du devis se ferme.
create function reservations.qbo_taches(p_reservation uuid, p_taches jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r reservations.reservations;
  t jsonb;
begin
  select * into r from reservations.reservations where id = p_reservation;
  if not found or r.organisation_id is null then
    return;
  end if;
  for t in select * from jsonb_array_elements(p_taches) loop
    insert into crm.relances (organisation_id, reservation_id, titre, echeance, assigne_a, source_cle, auteur_nom)
    values (r.organisation_id, r.id, t ->> 'titre', (t ->> 'echeance')::date, reservations.responsable_facturation(r.id),
      'qbo:' || r.id || ':' || (t ->> 'cle'), 'Réservations')
    on conflict (source_cle) do update set titre = excluded.titre, echeance = excluded.echeance
      where crm.relances.statut = 'a_faire';
  end loop;
  update crm.relances set statut = 'faite'
  where source_cle = 'qbo:' || r.id || ':devis' and statut = 'a_faire';
end;
$$;

-- Ferme les relances d'acompte et de facture finale selon ce qui est déjà
-- facturé à partir du devis (factures progressives).
create function reservations.qbo_fermer_taches(p_reservation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r reservations.reservations;
  v_total numeric;
  v_facture numeric;
  v_part2 numeric;
begin
  select * into r from reservations.reservations where id = p_reservation;
  select d.total into v_total from reservations.qbo_devis d where d.reservation_id = p_reservation;
  if r.id is null or v_total is null or v_total <= 0 then
    return;
  end if;
  select coalesce(sum(f.total), 0) into v_facture
  from reservations.factures f
  where f.reservation_id = p_reservation and f.genre = 'progressive' and not f.supprimee;
  -- F2 : 25 / 50 / 25 en CN et JPA, 25 / 75 en AG et LS.
  v_part2 := case when r.forfait in ('classe_nature', 'journee_plein_air') then 0.75 else 1.0 end;
  update crm.relances set statut = 'faite'
  where statut = 'a_faire' and (
    (source_cle = 'qbo:' || r.id || ':acompte1' and v_facture >= 0.25 * v_total - 1)
    or (source_cle = 'qbo:' || r.id || ':acompte2' and v_facture >= v_part2 * v_total - 1)
    or (source_cle = 'qbo:' || r.id || ':finale' and v_facture >= v_total - 0.01
        and (now() at time zone 'America/Toronto')::date > r.date_depart));
end;
$$;

-- Factures reçues de QBO (synchro) ou créées par l'app :
-- [{qbo_type, qbo_id, numero, date_facture, echeance, total, solde,
--   supprimee, devis_qbo_id?, reservation_id?, genre?}].
-- Rattachées à la réservation par leur devis (factures progressives), par
-- la réservation donnée (créées par l'app) ou parce qu'elles sont déjà
-- connues ; les autres factures du dossier QBO sont ignorées.
create function reservations.qbo_recevoir_factures(p_compagnie uuid, p_factures jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  f jsonb;
  v_res uuid;
  v_genre text;
  v_touchees uuid[] := '{}';
  v_n integer := 0;
begin
  for f in select * from jsonb_array_elements(p_factures) loop
    v_res := null;
    v_genre := null;
    select x.reservation_id, x.genre into v_res, v_genre
    from reservations.factures x
    where x.compagnie_id = p_compagnie and x.qbo_type = f ->> 'qbo_type' and x.qbo_id = f ->> 'qbo_id';
    if v_res is null then
      v_res := nullif(f ->> 'reservation_id', '')::uuid;
      v_genre := f ->> 'genre';
    end if;
    if v_res is null and f ->> 'devis_qbo_id' is not null then
      select d.reservation_id into v_res
      from reservations.qbo_devis d
      where d.compagnie_id = p_compagnie and d.qbo_id = f ->> 'devis_qbo_id';
      v_genre := 'progressive';
    end if;
    if v_res is null then
      continue;
    end if;
    v_genre := coalesce(v_genre, case when f ->> 'qbo_type' = 'CreditMemo' then 'note_credit' else 'separee' end);

    insert into reservations.factures (reservation_id, compagnie_id, qbo_type, qbo_id, genre, numero, date_facture, echeance, total, solde, supprimee)
    values (v_res, p_compagnie, f ->> 'qbo_type', f ->> 'qbo_id', v_genre, f ->> 'numero',
      nullif(f ->> 'date_facture', '')::date, nullif(f ->> 'echeance', '')::date,
      coalesce((f ->> 'total')::numeric, 0), coalesce((f ->> 'solde')::numeric, 0),
      coalesce((f ->> 'supprimee')::boolean, false))
    on conflict (compagnie_id, qbo_type, qbo_id) do update set
      numero = coalesce(excluded.numero, reservations.factures.numero),
      date_facture = coalesce(excluded.date_facture, reservations.factures.date_facture),
      echeance = coalesce(excluded.echeance, reservations.factures.echeance),
      total = case when excluded.supprimee then reservations.factures.total else excluded.total end,
      solde = case when excluded.supprimee then reservations.factures.solde else excluded.solde end,
      supprimee = excluded.supprimee,
      maj_le = now();
    v_n := v_n + 1;
    if not v_res = any (v_touchees) then
      v_touchees := v_touchees || v_res;
    end if;
  end loop;

  foreach v_res in array v_touchees loop
    perform reservations.qbo_fermer_taches(v_res);
  end loop;
  return v_n;
end;
$$;

-- ------------------------------------------------------------
-- Accès
-- ------------------------------------------------------------

-- Le Worker vérifie la session de l'équipe avant de toucher QBO.
create function reservations.peut_facturer()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('ok', coalesce(core.peut_ecrire('reservations'), false), 'nom', reservations.nom_de(auth.uid()))
$$;

-- Page client : ses factures (lien PDF par le Worker).
create function reservations.factures_client(p_jeton text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'genre', f.genre, 'numero', f.numero, 'date_facture', f.date_facture,
      'echeance', f.echeance, 'total', f.total, 'solde', f.solde)
    order by f.date_facture, f.numero), '[]')
  from reservations.factures f
  join reservations.reservations r on r.id = f.reservation_id
  where r.jeton_client = p_jeton and length(p_jeton) = 48 and not f.supprimee
$$;

-- Facture que le client peut télécharger (Worker seulement).
create function reservations.facture_client(p_jeton text, p_facture uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('compagnie_id', f.compagnie_id, 'qbo_type', f.qbo_type, 'qbo_id', f.qbo_id, 'numero', f.numero)
  from reservations.factures f
  join reservations.reservations r on r.id = f.reservation_id
  where r.jeton_client = p_jeton and length(p_jeton) = 48 and f.id = p_facture and not f.supprimee
$$;

revoke execute on function
  reservations.qbo_etat(),
  reservations.responsable_facturation(uuid),
  reservations.qbo_taches(uuid, jsonb),
  reservations.qbo_fermer_taches(uuid),
  reservations.qbo_recevoir_factures(uuid, jsonb),
  reservations.peut_facturer(),
  reservations.factures_client(text),
  reservations.facture_client(text, uuid)
from public;

grant execute on function reservations.qbo_etat(), reservations.peut_facturer() to authenticated;
grant execute on function reservations.factures_client(text) to anon, authenticated;
grant execute on function
  reservations.qbo_etat(),
  reservations.responsable_facturation(uuid),
  reservations.qbo_taches(uuid, jsonb),
  reservations.qbo_fermer_taches(uuid),
  reservations.qbo_recevoir_factures(uuid, jsonb),
  reservations.facture_client(text, uuid)
to service_role;
