-- Heures de maladie et de vacances : la direction seulement (demande de
-- Maxime du 2026-10-22). Les vacances n'ont jamais été permises aux employés ;
-- la feuille d'un employé perd sa ligne Maladie et la base refuse ce type.
-- Rien n'est effacé : s'il existe déjà des heures de maladie d'employés, la
-- migration s'arrête pour qu'on décide quoi en faire.

do $$
begin
  if exists (select 1 from temps.heures_employes where type = 'maladie') then
    raise exception 'Des heures de maladie d''employés existent (temps.heures_employes) : à régler avant cette migration.';
  end if;
end;
$$;

alter table temps.heures_employes drop constraint heures_employes_type_check;
alter table temps.heures_employes add constraint heures_employes_type_check
  check (type in ('regulieres', 'woofing', 'banque'));
