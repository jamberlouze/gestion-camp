-- ============================================================
-- temps : banque d'heures DÉSACTIVÉE par défaut pour tout le monde, quel
-- que soit le rôle (direction, coordo, terrain, développeur, employé…),
-- décision de Maxime du 2026-10-20. Sans ligne dans banque_heures_etats =
-- désactivée (banques.ts : etatBanqueHeures) ; un admin l'active dans
-- l'onglet Banques.
--
-- Jusqu'ici, sans ligne = activée pour un compte de la direction ou un
-- admin. Pour ne rien changer à ceux qui en profitaient, chaque compte
-- admin ou direction qui n'a encore aucune ligne en reçoit une « activée »
-- depuis la première période (PP21). Un compte qui a déjà une ligne (ex.
-- désactivé dans l'onglet Banques à partir de PP22) n'en reçoit pas : il
-- n'a donc jamais eu de banque, PP21 comprise (demande de Maxime). Les
-- autres rôles et les employés n'en reçoivent pas : jamais de banque.
-- ============================================================

insert into temps.banque_heures_etats (user_id, depuis, active, auteur, auteur_nom)
select p.id, temps.premiere_periode(), true, null, 'Réglage d''origine'
  from core.profils p
 where p.role in ('admin', 'direction')
   and not exists (select 1 from temps.banque_heures_etats e where e.user_id = p.id);

comment on table temps.banque_heures_etats is
  'Interrupteur « Heures en banque » : à partir de telle période, la banque d''heures se calcule (ajouts et retraits) ou non. Sans ligne : désactivée, pour tout le monde';
