-- ============================================================
-- Nouveaux comptes : rôle « terrain » par défaut (demande de la
-- direction, 2026-10-06).
--
-- Les invitations visent surtout les aides de camp et l'équipe
-- d'entretien ; un compte qui arrivait « direction » voyait tout en
-- attendant qu'un admin change son rôle. Terrain ne voit que les
-- modules de sa ligne dans la grille (Travaux au départ). Pour un membre
-- de la direction ou un coordonnateur, l'admin change le rôle dans la
-- page Utilisateurs.
-- ============================================================

alter table core.profils alter column role set default 'terrain';
