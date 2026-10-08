-- Réunions : ajouter un point pour un autre jour que aujourd'hui (demande de
-- Maxime du 2026-10-07). Le point est ajouté depuis la vue Semaine, sous le
-- jour voulu ; il n'apparaît à l'ordre du jour qu'à partir de ce jour-là.
-- null = dès maintenant.
alter table reunions.points add column pour_le date;

comment on column reunions.points.pour_le is 'Quotidien : le point apparaît à l''ordre du jour à partir de ce jour (null = tout de suite)';
