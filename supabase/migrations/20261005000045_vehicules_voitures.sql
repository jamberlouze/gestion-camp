-- ============================================================
-- vehicules : type « voiture » (affiché sous les minibus) et les deux
-- voitures de la flotte, Hakuna et Matata.
-- ============================================================

alter table vehicules.vehicules drop constraint vehicules_type_check;
alter table vehicules.vehicules add constraint vehicules_type_check
  check (type in ('minibus','voiture','vtt','remorque','autre'));

insert into vehicules.vehicules (surnom, type, ordre) values
  ('Hakuna', 'voiture', 13),
  ('Matata', 'voiture', 14);
