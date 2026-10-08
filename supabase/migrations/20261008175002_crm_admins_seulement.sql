-- CRM réservé aux admins pendant les essais (demande de Maxime du 2026-10-08) :
-- retiré de la grille de la direction et des ajouts personnels. Pour l'ouvrir
-- de nouveau : page Utilisateurs, grille d'accès.
delete from core.acces_roles where module = 'crm';
delete from core.acces_modules where module = 'crm';
