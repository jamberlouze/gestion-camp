-- Réservations : un client QBO = une seule organisation du CRM, de nouveau
-- (Maxime, 2026-10-11 : « une même école est une seule organisation »,
-- plusieurs réservations et responsables possibles). Annule 20261011140205.
-- Le Worker refuse un client déjà relié avec un message clair, et l'écran le
-- montre grisé avec l'organisation à laquelle il est relié.
drop index reservations.qbo_clients_qbo_id;
alter table reservations.qbo_clients add constraint qbo_clients_compagnie_id_qbo_id_key unique (compagnie_id, qbo_id);
