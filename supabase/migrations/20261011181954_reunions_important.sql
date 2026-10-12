-- Réunions : ⭐ points importants (demande de Maxime du 2026-10-11).
-- Un point étoilé (quotidien ou réunion spéciale) va dans l'onglet PV,
-- avec sa note. La note (`details`) peut maintenant être du texte mis en
-- forme (HTML de l'éditeur des réunions spéciales) ; l'ancien texte brut
-- reste lisible tel quel.

alter table reunions.points add column important boolean not null default false;

comment on column reunions.points.important is 'Point important (⭐) : repris dans le PV';

create index idx_reunions_points_important on reunions.points(important) where important;
