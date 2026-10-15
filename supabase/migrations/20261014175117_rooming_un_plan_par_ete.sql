-- ============================================================
-- rooming : un seul plan par été (réunion du 2026-10-14 avec Charlotte).
--
-- On garde « Été 2026 » (en vigueur) et un seul « Été 2025 » (archivé) ;
-- « Classe nature » (2026) et les autres variantes 2025 de l'import du
-- Sheets sont supprimées, avec leurs chambres et leurs noms (cascade).
--
-- Été 2025 = la variante « 2025 – Scénario 4 » de l'import, renommée :
-- le dernier scénario du Sheets pour l'été, le plus complet (toutes les
-- chambres du motel attribuées, Appart plein, 88 employés, 18 noms).
-- « Pré-camp » et « Classes nature » ne sont pas l'été. Si elle manque,
-- la variante suivante (Scénario 3, 2, 1, puis Pré-camp, Classes nature).
--
-- Repérage par nom seulement (aucun identifiant propre à une base) : la
-- migration fait la même chose en DEV et en PROD, et un plan au nom
-- inconnu (créé à la main) n'est jamais touché. La référence d'aujourd'hui
-- (lieux et chambres actifs) n'est pas touchée ; seuls les lieux et les
-- chambres déjà retirés de la référence et qu'aucun plan n'utilise plus
-- sont effacés (même règle que rooming.retirer_lieu).
-- ============================================================

do $$
declare
  v_garde uuid;
  v_ancien text;
  v_n integer;
begin
  -- 1. Le plan 2025 gardé.
  select id into v_garde from rooming.plans where lower(btrim(nom)) = lower('Été 2025');
  if v_garde is null then
    select p.id, p.nom into v_garde, v_ancien
    from rooming.plans p
    join (values
      ('2025 – Scénario 4', 1),
      ('2025 – Scénario 3', 2),
      ('2025 – Scénario 2', 3),
      ('2025 – Scénario 1', 4),
      ('2025 – Pré-camp', 5),
      ('2025 – Classes nature', 6)
    ) as c(nom, rang) on lower(btrim(p.nom)) = lower(c.nom)
    order by c.rang
    limit 1;
    if v_garde is not null then
      raise notice 'Rooming : « % » devient « Été 2025 »', v_ancien;
    end if;
  end if;
  if v_garde is not null then
    update rooming.plans set nom = 'Été 2025', en_vigueur = false, archive = true where id = v_garde;
  end if;

  -- 2. Les autres variantes 2025 et Classe nature (occupations et noms
  --    suivent par « on delete cascade »).
  delete from rooming.plans
  where lower(btrim(nom)) in (
      lower('2025 – Scénario 4'), lower('2025 – Scénario 3'), lower('2025 – Scénario 2'),
      lower('2025 – Scénario 1'), lower('2025 – Pré-camp'), lower('2025 – Classes nature'),
      lower('Classe nature'), lower('Classe nature 2026')
    )
    and id is distinct from v_garde;
  get diagnostics v_n = row_count;
  raise notice 'Rooming : % plan(s) supprimé(s)', v_n;

  -- 3. Toujours un plan en vigueur : Été 2026 si plus aucun ne l'est.
  if not exists (select 1 from rooming.plans where en_vigueur) then
    update rooming.plans set en_vigueur = true, archive = false where nom = 'Été 2026';
  end if;

  -- 4. Ce qui était déjà retiré de la référence et ne sert plus à aucun plan.
  delete from rooming.chambres c
  where not c.actif
    and not exists (select 1 from rooming.occupations o where o.chambre_id = c.id);
  get diagnostics v_n = row_count;
  if v_n > 0 then
    raise notice 'Rooming : % chambre(s) retirée(s) effacée(s)', v_n;
  end if;
  loop
    delete from rooming.lieux l
    where not l.actif
      and not exists (select 1 from rooming.chambres c where c.lieu_id = l.id)
      and not exists (select 1 from rooming.lieux e where e.parent_id = l.id);
    get diagnostics v_n = row_count;
    exit when v_n = 0;
    raise notice 'Rooming : % lieu(x) retiré(s) effacé(s)', v_n;
  end loop;
end $$;
