-- ============================================================
-- Rôle « Développeur » (Maxime, 2026-10-15) : pour Glitch, qui n'est pas
-- dans la direction mais doit voir tous les modules.
--
-- Un rôle de la grille comme les autres : il écrit partout, sauf
-- RH › Paie (NAS et compte bancaire des employés), laissé vide (un clic dans
-- la grille pour le donner). Ce qui n'est pas dans la grille ne change pas :
-- Feuilles de temps (sa propre feuille seulement, s'il a une fiche),
-- Améliorations (admins) et les modules cachés sauf aux admins.
-- ============================================================

alter table core.profils drop constraint profils_role_check;
alter table core.profils add constraint profils_role_check
  check (role in ('admin','direction','coordo','terrain','developpeur'));

alter table core.acces_roles drop constraint acces_roles_role_check;
alter table core.acces_roles add constraint acces_roles_role_check
  check (role in ('direction','coordo','terrain','developpeur'));

insert into core.acces_roles (role, module, niveau)
select 'developpeur', m, 'ecriture'
from unnest(array['embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier',
  'vehicules','travaux','rooming','achats','caisse','cuisine_couts','reunions','crm','reservations',
  'reservations_sante','inventaire','rh','batiments']) as m;
