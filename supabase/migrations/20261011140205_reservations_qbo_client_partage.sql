-- Réservations : un client QBO peut servir à plusieurs organisations du CRM
-- (ex. les 3e et 4e années d'un même pavillon, une école payée par son centre
-- de services). Avant : refusé par la base (erreur 23505 à la création du
-- devis). Relier ne modifie jamais le client dans QBO ; l'écran indique
-- « déjà relié à … » pour qu'un mauvais choix se voie.
alter table reservations.qbo_clients drop constraint qbo_clients_compagnie_id_qbo_id_key;
create index qbo_clients_qbo_id on reservations.qbo_clients (compagnie_id, qbo_id);
