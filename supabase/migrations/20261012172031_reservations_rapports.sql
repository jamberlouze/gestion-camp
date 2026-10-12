-- Réservations, phase 7 (rapports) : revenus mensuels des exercices d'avant
-- l'app, gardés comme référence (plan §12). Montants avant taxes par mois
-- d'arrivée, tels quels de l'onglet « Comparatif par mois » du Sheets
-- « Demande de réservation BPA | 2024-25 » (colonnes 2023-24 et 2024-25).
-- Exercice désigné par l'année où il se termine (2025 = 2024-25).
create table reservations.historique_mensuel (
  exercice smallint not null,
  mois smallint not null check (mois between 1 and 12),
  montant numeric(12,2) not null,
  source text not null,
  primary key (exercice, mois)
);

alter table reservations.historique_mensuel enable row level security;
create policy "Lire" on reservations.historique_mensuel for select to authenticated using (core.peut_lire('reservations'));
grant select on reservations.historique_mensuel to authenticated;
grant all on reservations.historique_mensuel to service_role;

insert into reservations.historique_mensuel (exercice, mois, montant, source) values
  (2024, 10, 19398.50, 'Sheets 2024-25 › Comparatif par mois'),
  (2024, 11, 1154.00, 'Sheets 2024-25 › Comparatif par mois'),
  (2024, 12, 21932.49, 'Sheets 2024-25 › Comparatif par mois'),
  (2024, 1, 30722.95, 'Sheets 2024-25 › Comparatif par mois'),
  (2024, 2, 78905.63, 'Sheets 2024-25 › Comparatif par mois'),
  (2024, 3, 23965.00, 'Sheets 2024-25 › Comparatif par mois'),
  (2024, 4, 11575.00, 'Sheets 2024-25 › Comparatif par mois'),
  (2024, 5, 115416.25, 'Sheets 2024-25 › Comparatif par mois'),
  (2024, 6, 141178.77, 'Sheets 2024-25 › Comparatif par mois'),
  (2024, 7, 2939.10, 'Sheets 2024-25 › Comparatif par mois'),
  (2024, 8, 58779.55, 'Sheets 2024-25 › Comparatif par mois'),
  (2024, 9, 60349.20, 'Sheets 2024-25 › Comparatif par mois'),
  (2025, 10, 49006.50, 'Sheets 2024-25 › Comparatif par mois'),
  (2025, 11, 7900.65, 'Sheets 2024-25 › Comparatif par mois'),
  (2025, 12, 19571.43, 'Sheets 2024-25 › Comparatif par mois'),
  (2025, 1, 53046.32, 'Sheets 2024-25 › Comparatif par mois'),
  (2025, 2, 57855.35, 'Sheets 2024-25 › Comparatif par mois'),
  (2025, 3, 23362.50, 'Sheets 2024-25 › Comparatif par mois'),
  (2025, 4, 15877.00, 'Sheets 2024-25 › Comparatif par mois'),
  (2025, 5, 155790.30, 'Sheets 2024-25 › Comparatif par mois'),
  (2025, 6, 126957.25, 'Sheets 2024-25 › Comparatif par mois'),
  (2025, 7, 3057.60, 'Sheets 2024-25 › Comparatif par mois'),
  (2025, 8, 24597.00, 'Sheets 2024-25 › Comparatif par mois'),
  (2025, 9, 23126.34, 'Sheets 2024-25 › Comparatif par mois');
