-- Réservations : la pré-arrivée peut partir en mode automatique. Son PDF est
-- maintenant produit par le Worker au moment de l'envoi (avant : dans le
-- navigateur, au clic). Le mode reste « à approuver » tant que Maxime ne le
-- change pas (onglet Courriels).
alter table reservations.modeles_courriels drop constraint modeles_courriels_check;
