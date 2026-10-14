-- Réservations : liste de prix (révision du 2026-10-14 avec Charlotte).
--
-- 1. Chaque prix (produit × exercice) garde la date et l'auteur de sa
--    dernière modification, et un statut « à valider » / « validé ».
-- 2. Fournisseurs externes : coût du fournisseur + marge % par prix (défaut
--    15 %) → prix client calculé, qu'on peut arrondir à la main ; fournisseur
--    nommé sur le produit. La règle « transport × 1,15 » devient une marge de
--    15 % : aucun prix ne change.
-- 3. Exercice suivant préparé d'un geste (`preparer_exercice`) : prix vides,
--    à valider, avec l'exercice précédent comme repli. Tant qu'un prix n'est
--    pas validé, le calcul prend celui du repli, marqué « provisoire »
--    (règle dans calcul.ts, `resoudrePrix`).
-- 4. Les estimés gardent les prix provisoires qu'ils ont utilisés
--    (`estimes.prix_provisoires`, figé avec l'estimé).

-- ------------------------------------------------------------
-- Produits : fournisseur nommé
-- ------------------------------------------------------------
alter table reservations.produits add column fournisseur text;

comment on column reservations.produits.majoration is
  'Produit de fournisseur (non nul) : marge par défaut des nouveaux prix, en multiplicateur (1,15 = 15 %).';

update reservations.produits set fournisseur = 'Ski Mont-Blanc' where code like 'MB-%';
update reservations.produits set fournisseur = 'Tremblant' where code like 'TR-%';
update reservations.produits set fournisseur = 'Domaine St-Bernard' where code like 'DSB-%';

-- ------------------------------------------------------------
-- Prix : marge, statut, auteur, repli
-- ------------------------------------------------------------
alter table reservations.prix
  -- Marge du fournisseur en % (15 = coût × 1,15) ; prix client = coût × (1 + marge) + ajout, arrondi.
  -- Un prix différent du calcul = arrondi à la main (montré à l'écran).
  add column marge numeric(7,2) check (marge is null or marge > -100),
  add column valide boolean not null default false,
  add column valide_le timestamptz,
  add column valide_par uuid references core.profils(id) on delete set null,
  add column valide_par_nom text,
  -- Dernière modification du prix (prix, coût ou marge ; pas la validation).
  add column modifie_le timestamptz not null default now(),
  add column modifie_par uuid references core.profils(id) on delete set null,
  add column modifie_par_nom text,
  -- Exercice dont le prix s'applique tant que celui-ci n'est pas validé
  -- (posé par « Préparer l'exercice suivant »).
  add column repli smallint,
  add constraint prix_repli_avant check (repli is null or repli < exercice),
  add constraint prix_valide_defini check (not valide or prix is not null);

-- Historique : la date de la dernière écriture connue (avant toute autre mise à jour).
update reservations.prix set modifie_le = updated_at, modifie_par_nom = 'Chiffrier 2026-27 (import)'
where exercice = 2027;

-- Marge des prix de fournisseurs actuels : la majoration du produit (1,15 → 15 %).
update reservations.prix x set marge = round((p.majoration - 1) * 100, 2)
from reservations.produits p
where p.id = x.produit_id and p.majoration is not null;

-- 2026-27 : validé, sauf ce qui était « en rouge » dans la liste de Vicky
-- (Mont-Blanc, transport, activités externes) et les prix à définir.
update reservations.prix x set valide = true, valide_le = now(), valide_par_nom = 'Chiffrier 2026-27 (import)'
from reservations.produits p
where p.id = x.produit_id and x.exercice = 2027 and x.prix is not null
  and p.categorie not in ('billet', 'transport')
  and not (p.categorie = 'activite' and p.code not like 'AQUA-%');

-- Exercices déjà copiés plus loin (DEV) : à valider, repli sur l'exercice d'avant.
update reservations.prix set valide = false, repli = exercice - 1 where exercice > 2027;

-- Auteur, dates et statut tenus par la base (jamais ceux envoyés par l'app).
-- Un prix changé dans l'app redevient « à valider ». Sans compte (import,
-- migration), on garde ce que la requête fournit.
create function reservations.suivre_prix()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_moi uuid := auth.uid();
  v_change boolean;
  v_valide_avant boolean := false;
begin
  if tg_op = 'INSERT' then
    v_change := true;
  else
    v_change := new.prix is distinct from old.prix or new.cout is distinct from old.cout
      or new.marge is distinct from old.marge;
    v_valide_avant := old.valide;
  end if;

  if v_moi is not null then
    if v_change then
      new.modifie_le := now();
      new.modifie_par := v_moi;
      new.modifie_par_nom := reservations.nom_de(v_moi);
      if tg_op = 'UPDATE' and old.valide then
        new.valide := false;
      end if;
    else
      new.modifie_le := old.modifie_le;
      new.modifie_par := old.modifie_par;
      new.modifie_par_nom := old.modifie_par_nom;
    end if;
    if new.valide and not v_valide_avant then
      new.valide_le := now();
      new.valide_par := v_moi;
      new.valide_par_nom := reservations.nom_de(v_moi);
    elsif new.valide then
      new.valide_le := old.valide_le;
      new.valide_par := old.valide_par;
      new.valide_par_nom := old.valide_par_nom;
    end if;
  elsif v_change and tg_op = 'UPDATE' and new.modifie_le is not distinct from old.modifie_le then
    new.modifie_le := now();
  end if;

  if not new.valide then
    new.valide_le := null;
    new.valide_par := null;
    new.valide_par_nom := null;
  elsif new.valide_le is null then
    new.valide_le := now();
  end if;
  return new;
end;
$$;

create trigger trg_reservations_prix_suivre before insert or update on reservations.prix
for each row execute function reservations.suivre_prix();

-- ------------------------------------------------------------
-- Préparer l'exercice suivant : une ligne vide et à valider par produit actif
-- (sections exceptées : lits × prix du lit), marge reprise, repli sur
-- l'exercice d'avant. Ne touche jamais une ligne qui existe déjà.
-- ------------------------------------------------------------
create function reservations.preparer_exercice(p_exercice integer)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not core.peut_ecrire('reservations') then
    raise exception 'Accès refusé : écriture dans les Réservations requise.';
  end if;
  if p_exercice < 2021 or p_exercice > 2100 then
    raise exception 'Exercice invalide : %', p_exercice;
  end if;
  insert into reservations.prix (produit_id, exercice, prix, cout, marge, valide, repli)
  select p.id, p_exercice, null, null,
    coalesce(x.marge, case when p.majoration is not null then round((p.majoration - 1) * 100, 2) end),
    false, p_exercice - 1
  from reservations.produits p
  left join reservations.prix x on x.produit_id = p.id and x.exercice = p_exercice - 1
  where p.actif and p.etages is null
  on conflict (produit_id, exercice) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function reservations.preparer_exercice(integer) from public, anon;
grant execute on function reservations.preparer_exercice(integer) to authenticated;

-- ------------------------------------------------------------
-- Estimés : prix provisoires utilisés (code → exercice du prix pris)
-- ------------------------------------------------------------
alter table reservations.estimes add column prix_provisoires jsonb not null default '{}'
  check (jsonb_typeof(prix_provisoires) = 'object');

-- Figés avec l'estimé, comme ses lignes.
create function reservations.figer_prix_provisoires()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.statut <> 'brouillon' and new.prix_provisoires is distinct from old.prix_provisoires then
    raise exception 'Cet estimé est figé : faites-en une nouvelle version.';
  end if;
  return new;
end;
$$;

create trigger trg_reservations_estimes_prix_provisoires before update on reservations.estimes
for each row execute function reservations.figer_prix_provisoires();

-- Nouvelle version (lignes copiées par `changer_estime`) : mêmes prix
-- provisoires que la version d'avant, tant qu'on ne l'a pas enregistrée.
create function reservations.reprendre_prix_provisoires()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.prix_provisoires = '{}'::jsonb and new.version > 1 then
    select e.prix_provisoires into new.prix_provisoires
    from reservations.estimes e
    where e.reservation_id = new.reservation_id and e.version < new.version
      and e.exercice_prix = new.exercice_prix
    order by e.version desc
    limit 1;
    new.prix_provisoires := coalesce(new.prix_provisoires, '{}'::jsonb);
  end if;
  return new;
end;
$$;

create trigger trg_reservations_estimes_reprendre_provisoires before insert on reservations.estimes
for each row execute function reservations.reprendre_prix_provisoires();
