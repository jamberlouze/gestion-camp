-- Achats : date cible de commande (facultative), demande de la réunion du
-- 2026-10-14. Signalée à l'écran tant que l'achat est « À commander » :
-- ambre à 7 jours ou moins, rouge une fois dépassée. RLS inchangée (mêmes
-- politiques « Lire » / « Écrire » que le reste de la table).

alter table achats.achats add column date_cible date;

comment on column achats.achats.date_cible is
  'Date à laquelle commander au plus tard (facultative) ; signalée seulement tant que le statut est a_commander';
