-- ============================================================
-- Données de la base DEV locale seulement (supabase db reset).
-- Jamais envoyé en PROD : `supabase db push` n'applique pas ce fichier.
--
-- Comptes de test (adresses en .test : aucun courriel réel). Connexion
-- par code à 6 chiffres, lu dans Mailpit : http://localhost:54324
-- ============================================================

-- Utilisateurs (le déclencheur core.creer_profil crée les profils).
with comptes (id, courriel) as (
  values
    ('00000000-0000-0000-0000-000000000001'::uuid, 'admin@camp.test'),
    ('00000000-0000-0000-0000-000000000002'::uuid, 'julie@camp.test'),
    ('00000000-0000-0000-0000-000000000003'::uuid, 'olivier@camp.test'),
    ('00000000-0000-0000-0000-000000000004'::uuid, 'sarah@camp.test'),
    ('00000000-0000-0000-0000-000000000005'::uuid, 'felix@camp.test'),
    ('00000000-0000-0000-0000-000000000006'::uuid, 'camille@camp.test'),
    ('00000000-0000-0000-0000-000000000007'::uuid, 'noah@camp.test'),
    ('00000000-0000-0000-0000-000000000008'::uuid, 'alex@camp.test'),
    ('00000000-0000-0000-0000-000000000009'::uuid, 'lea@camp.test'),
    ('00000000-0000-0000-0000-000000000010'::uuid, 'dev@camp.test')
)
insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', courriel, now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
from comptes;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
select gen_random_uuid(), id, id::text, 'email',
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now(), now()
from auth.users;

update core.profils p set nom = v.nom, role = v.role
from (values
  ('admin@camp.test', 'Admin Test', 'admin'),
  ('julie@camp.test', 'Julie Tremblay', 'direction'),
  ('olivier@camp.test', 'Olivier Lavoie', 'direction'),
  ('sarah@camp.test', 'Sarah Bouchard', 'coordo'),
  ('felix@camp.test', 'Félix Gagnon', 'direction'),
  ('camille@camp.test', 'Camille Roy', 'coordo'),
  ('noah@camp.test', 'Noah Côté', 'coordo'),
  ('alex@camp.test', 'Alex Bergeron', 'terrain'),
  ('lea@camp.test', 'Léa Morin', 'terrain'),
  ('dev@camp.test', 'Gabriel Dev', 'developpeur')
) as v (courriel, nom, role)
where p.courriel = v.courriel;

-- Pokes : un reçu aujourd'hui (pas vu) et un d'hier (vu), pour l'admin.
insert into core.pokes (de, a, emoji, jour, vu_le, created_at) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '🦆',
    (now() at time zone 'America/Toronto')::date, null, now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '🔥',
    (now() at time zone 'America/Toronto')::date - 1, now() - interval '1 day', now() - interval '1 day');

-- ------------------------------------------------------------
-- Travaux (DEV) : chantiers et tâches tels que la migration les a tirés
-- de Mastertimeline en PROD le 2026-10-06, listes de Mastertimeline
-- (noms seulement) pour essayer « Envoyer vers Mastertimeline », et
-- quelques cas de test (signalements à trier, tâches assignées, retard).
-- Généré par Claude ; les noms de lieux et catégories viennent de la
-- migration 20261006000010_travaux.sql.
-- ------------------------------------------------------------
insert into core.entreprises (id, nom, couleur, ordre) values
  ('d5c57473-f9b8-58b9-8312-11c3e45fb07a', 'GBPA+', '#19774a', 1),
  ('635cb5aa-a46d-551f-a54e-de440410c09f', 'Opikawa', '#e67e22', 2),
  ('d2aebea0-e2b0-59ed-b584-40052859f4fb', 'BPA inc.', '#7f8c8d', 3),
  ('f6a2d2eb-e4ea-52ff-8bd5-075e1b6e2950', 'Aquabounga', '#f1c40f', 4),
  ('b057c513-f0d2-5299-8620-7749ee2047a7', 'Rouge & Diable', '#c0392b', 5)
-- Quatre d'entre elles sont déjà créées par la migration de la petite caisse.
on conflict (id) do update set nom = excluded.nom, couleur = excluded.couleur, ordre = excluded.ordre;

insert into mastertimeline.projets (id, nom, couleur, ordre, entreprise_ids) values
  ('d98fd836-7983-53d5-8472-764189def71c', 'Planification', '#7A6AA8', 1, '{635cb5aa-a46d-551f-a54e-de440410c09f,b057c513-f0d2-5299-8620-7749ee2047a7,d5c57473-f9b8-58b9-8312-11c3e45fb07a,f6a2d2eb-e4ea-52ff-8bd5-075e1b6e2950}'),
  ('8102aa0e-1225-54f4-8a9f-a54578f8acaa', 'RH', '#B0607A', 2, '{635cb5aa-a46d-551f-a54e-de440410c09f,b057c513-f0d2-5299-8620-7749ee2047a7,d5c57473-f9b8-58b9-8312-11c3e45fb07a}'),
  ('283cb50d-d18f-5a9a-bb89-9f69a5cbd081', 'Camp de vacances', '#19774a', 3, '{635cb5aa-a46d-551f-a54e-de440410c09f,d5c57473-f9b8-58b9-8312-11c3e45fb07a}'),
  ('4474052a-daea-575d-9005-ba593c0d23ae', 'Préparation été', '#5E7C3F', 4, '{d5c57473-f9b8-58b9-8312-11c3e45fb07a}'),
  ('db2b8bf3-d9b4-5b31-b63b-5247960157b8', 'Classes vertes', '#6aa84f', 5, '{d5c57473-f9b8-58b9-8312-11c3e45fb07a}'),
  ('ccf7802e-1873-5159-8a07-be9bb1acb896', 'Classes rouges', '#c0392b', 6, '{d5c57473-f9b8-58b9-8312-11c3e45fb07a}'),
  ('78419210-55da-5d51-bf36-a73a4f07d555', 'Classes blanches', '#8fb3c9', 7, '{d5c57473-f9b8-58b9-8312-11c3e45fb07a}'),
  ('f3410d7d-26d1-5c9b-b6f3-f5c879efeca5', 'Ouverture été', '#E38B45', 8, '{b057c513-f0d2-5299-8620-7749ee2047a7,d5c57473-f9b8-58b9-8312-11c3e45fb07a,f6a2d2eb-e4ea-52ff-8bd5-075e1b6e2950}'),
  ('f600f991-7482-598e-85db-912e1a2c06f4', 'Fermeture été', '#c0812b', 9, '{635cb5aa-a46d-551f-a54e-de440410c09f,b057c513-f0d2-5299-8620-7749ee2047a7,d5c57473-f9b8-58b9-8312-11c3e45fb07a,f6a2d2eb-e4ea-52ff-8bd5-075e1b6e2950}'),
  ('ebda49e6-964c-58a1-9f8b-57882191a062', 'Ouverture hiver', '#567E96', 10, '{d5c57473-f9b8-58b9-8312-11c3e45fb07a}'),
  ('d23c8b67-7dfa-504b-82ec-90a2654cfbd6', 'Fermeture hiver', '#3d5a6c', 11, '{d5c57473-f9b8-58b9-8312-11c3e45fb07a}'),
  ('4cdd450c-1802-5236-a714-72aeb76ae0fa', 'Entretien véhicules', '#8A7B62', 12, '{635cb5aa-a46d-551f-a54e-de440410c09f,d2aebea0-e2b0-59ed-b584-40052859f4fb,d5c57473-f9b8-58b9-8312-11c3e45fb07a}'),
  ('efdc5f8b-4e55-5f97-9390-874ef8ee20c9', 'Entretien bâtiment', '#a29e93', 13, '{d2aebea0-e2b0-59ed-b584-40052859f4fb,d5c57473-f9b8-58b9-8312-11c3e45fb07a}'),
  ('f79c8456-1c6f-550c-8745-852d594838b5', 'Site web et logiciels', '#2b8cc4', 14, '{635cb5aa-a46d-551f-a54e-de440410c09f,b057c513-f0d2-5299-8620-7749ee2047a7,d5c57473-f9b8-58b9-8312-11c3e45fb07a,f6a2d2eb-e4ea-52ff-8bd5-075e1b6e2950}');

insert into mastertimeline.responsables (id, nom) values
  ('89d4006b-3c2b-5d9a-8a70-55369ac5f8dc', 'Charlotte'),
  ('23f068f7-b8ad-5075-bbce-0b91b8201927', 'Dom'),
  ('19ed3a04-bf2f-56c2-9f57-a45a1da87c97', 'Frédérique'),
  ('d8d44ea6-dc57-50ce-b096-b4135b2ccfc7', 'Marco'),
  ('90694972-8e8c-553f-89ec-622a194979d7', 'Maxime'),
  ('4abf2561-1f38-54f8-9347-b1f5e698c68a', 'Sylvie'),
  ('25f23b3c-4df1-5719-99a1-99bc1c24cfb7', 'Vickie');

insert into mastertimeline.fournisseurs (nom, service, telephone) values
  ('Quincaillerie (test)', 'Matériaux', '819-555-0101'),
  ('Plombier (test)', 'Plomberie', '819-555-0102'),
  ('Électricien (test)', 'Électricité', '819-555-0103');

insert into travaux.chantiers (id, nom, couleur, lieu_id, date_cible, termine_le, created_at)
select v.id::uuid, v.nom, v.couleur, l.id, v.date_cible::date, v.termine_le::timestamptz, v.created_at::timestamptz
from (values
  ('eae1d0c1-7a5e-52ea-99ce-96921117215b', 'Trembloc', '#567E96', 'Trembloc', null, null, '2026-10-01T01:48:21.567Z'),
  ('385cc60e-491f-5c99-a089-e5e506ead1ad', 'Chambre Motel', '#5E7C3F', 'Motel', null, null, '2026-10-01T01:48:21.567Z'),
  ('0688506b-8a16-5aa0-8510-21eae088f7d6', 'Rafraîchissement du bâtiment', '#E38B45', 'Bâtiment principal', null, null, '2026-10-01T01:48:21.567Z'),
  ('0e2fe3e9-c00d-54f1-94da-c4e02f2bb376', 'Travaux bâtiment', '#c0812b', 'Bâtiment principal', null, null, '2026-10-01T01:48:21.567Z'),
  ('43e55354-a002-5512-a724-bfd800d2065c', 'Travaux forestiers', '#8A7B62', 'Sentiers et forêt', null, null, '2026-10-01T01:48:21.567Z'),
  ('99a20d76-90e2-565f-aa42-4e93b92f6db3', 'Nouveau site de tir à l''arc', '#7A6AA8', 'Tir à l''arc et tag-à-l''arc', null, null, '2026-10-01T01:48:21.567Z'),
  ('3fd02862-b44a-5653-9acc-b38fa0ae0227', 'Nouveau site de tag-à-l''arc', '#B0607A', 'Tir à l''arc et tag-à-l''arc', null, null, '2026-10-01T01:48:21.567Z'),
  ('1b19d5bb-3e64-5909-8c5a-ec3f490a7681', 'Aménagement paysager', '#19774a', 'Plage et quai', null, null, '2026-10-01T01:48:21.567Z')
) as v (id, nom, couleur, lieu, date_cible, termine_le, created_at)
left join travaux.lieux l on l.nom = v.lieu;

insert into travaux.taches
  (id, titre, description, statut, lieu_id, categorie_id, chantier_id, priorite, echeance, heures_prevues, position, fait_le, fait_par, created_at)
select v.id::uuid, v.titre, v.description, v.statut, l.id, c.id, v.chantier_id::uuid, v.priorite, v.echeance::date, v.heures::numeric,
  v.position::double precision, v.fait_le::timestamptz, case when v.statut = 'terminee' then '00000000-0000-0000-0000-000000000001'::uuid end, v.created_at::timestamptz
from (values
  ('0f38a531-39a2-5aa2-bf25-645a3eee329d', 'Retirer clous, agrafes et tapes qui tapissent les murs', null, 'a_faire', 'Bâtiment principal', 'Peinture et finition', '0688506b-8a16-5aa0-8510-21eae088f7d6', 3, null, null, 31, null, '2026-10-01T01:48:21.567Z'),
  ('1a6d813b-2767-522b-9a29-a517d44ce20c', 'Aménagement du site de Tir à l''arc', null, 'terminee', 'Tir à l''arc et tag-à-l''arc', 'Terrain et paysager', '99a20d76-90e2-565f-aa42-4e93b92f6db3', 3, null, null, 18, '2026-10-01T01:48:21.567Z', '2026-10-01T01:48:21.567Z'),
  ('1fd0e406-a7e1-579f-9018-ea8d3405d3d9', 'Motel : Enlever le mur entre les chambres', 'Responsable dans Mastertimeline : Dom', 'terminee', 'Motel', 'Menuiserie et construction', '385cc60e-491f-5c99-a089-e5e506ead1ad', 1, null, '3', 4, '2026-10-01T01:48:21.567Z', '2026-10-01T01:48:21.567Z'),
  ('2369a0c7-f405-50bd-a6f6-36dd8816a48f', 'Trimmer cèdres côté plage et estrade pour dégager', null, 'a_faire', 'Plage et quai', 'Terrain et paysager', '1b19d5bb-3e64-5909-8c5a-ec3f490a7681', 3, null, null, 3, null, '2026-10-01T01:48:21.567Z'),
  ('323e6371-f236-53f1-8912-4bea34173bf4', 'Aménagement nouveau site tag-à-l''arc', null, 'a_faire', 'Tir à l''arc et tag-à-l''arc', 'Terrain et paysager', '3fd02862-b44a-5653-9acc-b38fa0ae0227', 1, null, null, 6, null, '2026-10-01T01:48:21.567Z'),
  ('3b2ed29d-e2fa-54b0-9b5e-3ef028f816ab', 'Nettoyage sous la cuisine (2h ou 3h pour enlever le gros)', 'Supervisé par Marco', 'a_faire', 'Cuisine', 'Nettoyage', '0688506b-8a16-5aa0-8510-21eae088f7d6', 3, null, null, 28, null, '2026-10-01T01:48:21.567Z'),
  ('415c153f-5ba1-50b2-99c5-a2341545d8ba', 'Nettoyage des sentier', null, 'a_faire', 'Sentiers et forêt', 'Terrain et paysager', '43e55354-a002-5512-a724-bfd800d2065c', 3, null, null, 21, null, '2026-10-01T01:48:21.567Z'),
  ('43202718-6275-5e38-910b-101d0cecd263', 'Remettre panneau drapeau et signature', 'Responsable dans Mastertimeline : Dom', 'terminee', 'Bâtiment principal', 'Menuiserie et construction', '0688506b-8a16-5aa0-8510-21eae088f7d6', 1, null, null, 2, '2026-10-01T01:48:21.567Z', '2026-10-01T01:48:21.567Z'),
  ('4422245a-1f5a-5183-9200-d5b6e69f6466', 'Commander Crash pads', 'Responsable dans Mastertimeline : Vickie', 'terminee', 'Trembloc', 'Équipement et achats', 'eae1d0c1-7a5e-52ea-99ce-96921117215b', 3, null, null, 7, '2026-10-01T01:48:21.567Z', '2026-10-01T01:48:21.567Z'),
  ('526daf7b-f1a1-5a82-8c9e-2a43876ffcde', 'Besoins Soudure, Valider avec CFAB', null, 'a_faire', 'Trembloc', 'Menuiserie et construction', 'eae1d0c1-7a5e-52ea-99ce-96921117215b', 3, null, null, 24, null, '2026-10-01T01:48:21.567Z'),
  ('5ec70c27-a681-5b1e-a1d2-7b4973d18c1c', 'Peinturer tous les volets verts', 'Supervisé par Marco

Début prévu : 2026-04-01', 'a_faire', 'Bâtiment principal', 'Peinture et finition', '0688506b-8a16-5aa0-8510-21eae088f7d6', 2, '2026-04-02T00:00:00.000Z', null, 25, null, '2026-10-01T01:48:21.567Z'),
  ('60f9f443-6efd-581f-8673-2e2ea409eac7', 'Peinture plancher CB', 'Supervisé par Marco

Début prévu : 2026-03-30', 'terminee', 'Bâtiment principal', 'Peinture et finition', '0688506b-8a16-5aa0-8510-21eae088f7d6', 3, '2026-03-31T00:00:00.000Z', null, 32, '2026-10-01T01:48:21.567Z', '2026-10-01T01:48:21.567Z'),
  ('62355a7e-6176-5503-acdd-74103a281805', 'Commande containers (container Sea)', null, 'terminee', 'Trembloc', 'Équipement et achats', 'eae1d0c1-7a5e-52ea-99ce-96921117215b', 3, null, null, 13, '2026-10-01T01:48:21.567Z', '2026-10-01T01:48:21.567Z'),
  ('6e01cbd3-95c4-5734-96c5-99b043f73b3e', 'Achat génératrice', null, 'terminee', 'Bâtiment principal', 'Équipement et achats', '0e2fe3e9-c00d-54f1-94da-c4e02f2bb376', 3, null, null, 26, '2026-10-01T01:48:21.567Z', '2026-10-01T01:48:21.567Z'),
  ('7231471d-5f37-5639-aa1e-8afab26ff9c1', 'Circuit électrique dédié pour génératrice', null, 'terminee', 'Bâtiment principal', 'Électricité', '0e2fe3e9-c00d-54f1-94da-c4e02f2bb376', 3, null, null, 19, '2026-10-01T01:48:21.567Z', '2026-10-01T01:48:21.567Z'),
  ('728c58a6-6bda-5cbb-a1cb-cb486b7b88b9', 'Solution de rangement (mieux que la tite cabane de plastique)', null, 'a_faire', 'Tir à l''arc et tag-à-l''arc', 'Menuiserie et construction', '3fd02862-b44a-5653-9acc-b38fa0ae0227', 3, null, null, 14, null, '2026-10-01T01:48:21.567Z'),
  ('77c6063e-2879-565d-95cb-2204f92f5f66', 'Nettoyer les murs extérieurs pour qu''ils soient blancs', 'Supervisé par Marco

Début prévu : 2026-04-01', 'a_faire', 'Bâtiment principal', 'Nettoyage', '0688506b-8a16-5aa0-8510-21eae088f7d6', 2, '2026-04-02T00:00:00.000Z', null, 17, null, '2026-10-01T01:48:21.567Z'),
  ('797461f9-2da7-5f1e-a8df-531384699a8b', 'Commande des matériaux (valider avec dom et magasiner)', 'Fournisseur à valider', 'a_faire', 'Trembloc', 'Équipement et achats', 'eae1d0c1-7a5e-52ea-99ce-96921117215b', 3, null, null, 33, null, '2026-10-01T01:48:21.567Z'),
  ('7b2fb3d9-307c-532d-a1b8-8ed52ceaf9c7', 'Assembler lits', null, 'terminee', 'Motel', 'Menuiserie et construction', '385cc60e-491f-5c99-a089-e5e506ead1ad', 3, null, '2', 12, '2026-10-01T01:48:21.567Z', '2026-10-01T01:48:21.567Z'),
  ('80ada4c1-0fdf-5c55-90ea-b5268497c5cc', 'Nettoyage costumier (lavage vêtement au besoin)', 'Supervisé par Marco', 'terminee', 'Costumier', 'Nettoyage', '0688506b-8a16-5aa0-8510-21eae088f7d6', 3, null, null, 20, '2026-10-01T01:48:21.567Z', '2026-10-01T01:48:21.567Z'),
  ('8191d1f0-72d2-53fe-980d-f73c652a08e9', 'Ménage forestier (Woodchipper, fendeuse, etc.)', null, 'a_faire', 'Sentiers et forêt', 'Terrain et paysager', '43e55354-a002-5512-a724-bfd800d2065c', 3, null, null, 8, null, '2026-10-01T01:48:21.567Z'),
  ('8f61c6d7-d3eb-593c-a255-56b4b32a7edc', 'Construction de nouveaux bancs pour les aires de feux', null, 'terminee', 'Aires de feux et camping', 'Menuiserie et construction', '43e55354-a002-5512-a724-bfd800d2065c', 3, null, null, 27, '2026-10-01T01:48:21.567Z', '2026-10-01T01:48:21.567Z'),
  ('94d0c447-bcbc-5e7e-970a-0ec5d3cbf00c', 'Finir gypse portes CH et CB', 'Responsable dans Mastertimeline : Dom', 'a_faire', 'Bâtiment principal', 'Peinture et finition', '0688506b-8a16-5aa0-8510-21eae088f7d6', 3, null, null, 15, null, '2026-10-01T01:48:21.567Z'),
  ('a467cf4b-5da4-5bda-b2d1-efe7dbf5e4bf', 'Peinturer sous les lits', null, 'a_faire', 'Bâtiment principal', 'Peinture et finition', '0688506b-8a16-5aa0-8510-21eae088f7d6', 3, null, null, 10, null, '2026-10-01T01:48:21.567Z'),
  ('a6087a17-b5f2-5c3d-a6c6-91430cc118c3', 'Construire nouvelles cloisons', null, 'a_faire', 'Tir à l''arc et tag-à-l''arc', 'Menuiserie et construction', '99a20d76-90e2-565f-aa42-4e93b92f6db3', 3, null, null, 16, null, '2026-10-01T01:48:21.567Z'),
  ('b24b969f-1b42-538d-943b-e435cc3c03bc', 'Terminer plancher flotant', null, 'a_faire', 'Motel', 'Menuiserie et construction', '385cc60e-491f-5c99-a089-e5e506ead1ad', 3, null, '5', 1, null, '2026-10-01T01:48:21.567Z'),
  ('b29d7f38-7151-5757-b6bd-0cca9b63a7dd', 'Patcher trous gypse', null, 'a_faire', 'Bâtiment principal', 'Peinture et finition', '0688506b-8a16-5aa0-8510-21eae088f7d6', 3, null, null, 22, null, '2026-10-01T01:48:21.567Z'),
  ('b5a83082-0c62-515e-857c-7fb075c0e26d', 'Construction du mur de TREMBLOC', 'Responsable dans Mastertimeline : Dom', 'a_faire', 'Trembloc', 'Menuiserie et construction', 'eae1d0c1-7a5e-52ea-99ce-96921117215b', 1, null, '400', 23, null, '2026-10-01T01:48:21.567Z'),
  ('b7bcaae6-9973-582e-94a5-7a2fa768222a', 'Nouvelles cibles de tir à l''arc', null, 'terminee', 'Tir à l''arc et tag-à-l''arc', 'Équipement et achats', '99a20d76-90e2-565f-aa42-4e93b92f6db3', 3, null, null, 5, '2026-10-01T01:48:21.567Z', '2026-10-01T01:48:21.567Z'),
  ('c2f00f0d-ee15-542b-a98e-8e61060ccd2d', 'Déplacer le filet', null, 'terminee', 'Tir à l''arc et tag-à-l''arc', 'Terrain et paysager', '99a20d76-90e2-565f-aa42-4e93b92f6db3', 3, null, null, 11, '2026-10-01T01:48:21.567Z', '2026-10-01T01:48:21.567Z'),
  ('cf441ebd-244b-57c6-97f8-676fe4191247', 'Commander prises', null, 'terminee', 'Trembloc', 'Équipement et achats', 'eae1d0c1-7a5e-52ea-99ce-96921117215b', 3, null, null, 30, '2026-10-01T01:48:21.567Z', '2026-10-01T01:48:21.567Z'),
  ('e6f3b678-d4a2-5c4a-93b4-3cfdd56915a0', 'Woofing novembre 2026', 'Début prévu : 2026-11-02', 'a_faire', 'Bâtiment principal', null, '0e2fe3e9-c00d-54f1-94da-c4e02f2bb376', 3, '2026-11-30T00:00:00.000Z', null, 34, null, '2026-10-01T01:48:21.567Z'),
  ('f2ae357f-50d3-556c-8e6e-4de574c2219b', 'Aménagement (Foyer, hamac, sack line, table à picnique etc.)', null, 'a_faire', 'Trembloc', 'Terrain et paysager', 'eae1d0c1-7a5e-52ea-99ce-96921117215b', 3, null, null, 29, null, '2026-10-01T01:48:21.567Z'),
  ('fb1daf7d-4093-5b1a-8fca-54623f0d03a3', 'Peinture sur les étages (Chambre, aires communes etc.)', null, 'terminee', 'Bâtiment principal', 'Peinture et finition', '0688506b-8a16-5aa0-8510-21eae088f7d6', 3, null, null, 9, '2026-10-01T01:48:21.567Z', '2026-10-01T01:48:21.567Z')
) as v (id, titre, description, statut, lieu, categorie, chantier_id, priorite, echeance, heures, position, fait_le, created_at)
left join travaux.lieux l on l.nom = v.lieu
left join travaux.categories c on c.nom = v.categorie;

insert into travaux.commentaires (tache_id, auteur, texte, created_at) values
  ('60f9f443-6efd-581f-8673-2e2ea409eac7', '00000000-0000-0000-0000-000000000001', 'Fait par Sylvie en septembre 2026 (registre des travaux).', '2026-10-01T01:48:21.567Z');

-- Cas de test : signalements à trier (dont un urgent), tâches assignées
-- aux comptes Terrain (une en retard), une tâche libre avec commentaire.
insert into travaux.taches (titre, description, statut, lieu_id, categorie_id, priorite, signale_par, assigne_a, echeance, created_at)
select v.titre, v.description, v.statut, l.id, c.id, v.priorite, v.signale_par::uuid, v.assigne_a::uuid, current_date + v.dans, now() - v.depuis::interval
from (values
  ('Planche brisée sur le quai', 'Troisième planche à partir du bout. Un enfant a failli se blesser.', 'a_trier', 'Plage et quai', 'Menuiserie et construction', 1,
    '00000000-0000-0000-0000-000000000008', null, null, '2 hours'),
  ('Robinet de la douche des gars qui coule', null, 'a_trier', 'Bâtiment principal', 'Plomberie', 3,
    '00000000-0000-0000-0000-000000000009', null, null, '1 day'),
  ('Lumière du sentier éteinte', 'Entre le chalet et les aires de feux.', 'a_trier', 'Sentiers et forêt', 'Électricité', 3,
    '00000000-0000-0000-0000-000000000004', null, null, '3 hours'),
  ('Resserrer les tables à pique-nique', null, 'a_faire', 'Aires de feux et camping', 'Menuiserie et construction', 3,
    '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000008', 3, '2 days'),
  ('Vider la gouttière du motel', null, 'a_faire', 'Motel', 'Nettoyage', 2,
    '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000009', -2, '5 days'),
  ('Remplacer l''extincteur de la cuisine', 'Le sceau est brisé.', 'a_faire', 'Cuisine', 'Sécurité', 1,
    '00000000-0000-0000-0000-000000000003', null, 1, '1 day')
) as v (titre, description, statut, lieu, categorie, priorite, signale_par, assigne_a, dans, depuis)
left join travaux.lieux l on l.nom = v.lieu
left join travaux.categories c on c.nom = v.categorie;

insert into travaux.commentaires (tache_id, auteur, texte)
select id, '00000000-0000-0000-0000-000000000006', 'J''ai vérifié : il en reste un neuf dans le local d''entretien.'
from travaux.taches where titre = 'Remplacer l''extincteur de la cuisine';

-- ------------------------------------------------------------
-- Achats : la liste réelle de PROD (2026-10-06), avec quelques statuts,
-- quantités, prix et entreprises de test.
-- ------------------------------------------------------------
insert into achats.achats (item, statut, quantite, prix_unitaire, entreprise_id, note)
select v.item, v.statut, v.quantite::integer, v.prix::numeric, e.id, v.note
from (values
  ('Disques de disque golf', 'commande', 8, 24.99, 'GBPA+', null),
  ('Tables à picnique +10', 'a_commander', 10, 189.0, 'GBPA+', null),
  ('Poudre color run', 'a_commander', null, null, null, null),
  ('Pagaies', 'recu', 12, 45.5, 'Aquabounga', null),
  ('Bâtons ballon-balais', 'a_commander', 6, null, 'GBPA+', null),
  ('Brassards pour hiver (groupes ski)', 'a_commander', null, null, null, null),
  ('Hamac', 'a_commander', null, null, null, null),
  ('Quai Rabaska', 'commande', 1, 1200.0, 'Rouge & Diable', null),
  ('container - voir ami FRED - abris VFI', 'a_commander', null, null, null, null),
  ('Toile Projecteur', 'a_commander', null, null, null, null),
  ('Autres crash pad JoJo', 'a_commander', null, null, null, null),
  ('Gear de grandeur nature', 'a_commander', null, null, null, null),
  ('VFI ( bleu Aquabounga, BPA vert)', 'a_commander', 20, 62.0, 'Aquabounga', null),
  ('Traineau (à voir)', 'a_commander', null, null, null, null),
  ('Arcs de tag-à-l''arc', 'a_commander', 15, 18.75, 'GBPA+', null),
  ('Slack lines', 'a_commander', null, null, null, null),
  ('Gaga pit', 'a_commander', null, null, null, null),
  ('Bâtons de hockey', 'a_commander', null, null, null, null),
  ('Arcs de tir-à-l''arc', 'recu', 4, 79.99, 'GBPA+', null),
  ('Paniers Disque golf', 'a_commander', null, null, null, null),
  ('Modules Aquabounga', 'a_commander', null, null, null, null),
  ('Baril d''expé + support pour porter le baril', 'a_commander', null, null, null, null),
  ('Épée et bouclier', 'a_commander', null, null, null, null),
  ('Masque tag à l''arc', 'a_commander', null, null, null, null),
  ('Speaker Trembloc', 'a_commander', null, null, null, null),
  ('Gants et casque (accrobranche)', 'a_commander', null, null, null, 'Noté à la fermeture de l''accrobranche (Mastertimeline 2025-26).')
) as v(item, statut, quantite, prix, entreprise, note)
left join core.entreprises e on e.nom = v.entreprise;

-- Dates cibles de commande (comptées du jour du chargement) : en retard,
-- dans 5 jours, dans 20 jours, dans 60 jours ; un commandé à date passée
-- (plus de signal) ; les autres sans date.
update achats.achats a set date_cible = current_date + v.jours
from (values
  ('Arcs de tag-à-l''arc', -3),
  ('Masque tag à l''arc', 5),
  ('Tables à picnique +10', 20),
  ('Modules Aquabounga', 60),
  ('Quai Rabaska', -10)
) as v(item, jours)
where a.item = v.item;

-- ------------------------------------------------------------
-- Embarcations : quelques modèles et embarcations de test, et une
-- note à trier (numéros attribués par le déclencheur).
-- ------------------------------------------------------------
insert into embarcations.modeles (type, nom, prefix_id, bouchon) values
  ('Canot', 'Prospecteur 16', 'CA', 'Plastique'),
  ('Kayak', 'Esprit', 'KE', 'Liège'),
  ('SUP', 'Gonflable 10''6', 'SU', null)
on conflict do nothing;

insert into embarcations.embarcations (modele_id, entreprise_utilisation, fonctionnel, notes)
select m.id, e.entreprise, e.fonctionnel, e.notes
from (values
  ('CA', 'BPA lac', true, null),
  ('CA', 'BPA lac', true, null),
  ('CA', 'BPA rivière', false, 'Fissure à la proue'),
  ('KE', 'BPA lac', true, null),
  ('KE', 'BPA lac', true, null),
  ('SU', 'BPA lac', true, null)
) as e(prefixe, entreprise, fonctionnel, notes)
join embarcations.modeles m on m.prefix_id = e.prefixe
where not exists (select 1 from embarcations.embarcations);

-- Sans auteur : le déclencheur le tire de la session, et le seed n'en a pas.
insert into embarcations.notes (id, texte)
values ('7e000000-0000-0000-0000-000000000001', 'Deux pagaies de kayak manquent depuis la sortie de mardi.')
on conflict do nothing;

-- Employés fictifs (feuille des employés des Feuilles de temps, Animation…).
-- Compagnies par nom (liste de Mastertimeline) ; Cliff travaille pour deux.
insert into core.employes (surnom, prenom, nom_famille, poste, secteur, entreprise_ids)
select v.surnom, v.prenom, v.nom_famille, v.poste, v.secteur,
       array(select e.id from core.entreprises e where e.nom = any (v.entreprises))
  from (values
    ('Manitou', 'Louis', 'Tremblay', 'Cuisinier', 'Cuisine', array['GBPA+']),
    ('Sriracha', 'Sophie', 'Gagné', 'Cuisinière', 'Cuisine', array['GBPA+']),
    ('Marteau', 'Dominique', 'Pelletier', 'Entretien', 'Entretien', array['GBPA+']),
    ('Koda', 'Marie', 'Fortin', 'Animatrice', 'Animation', array['GBPA+']),
    ('Moutic', 'Gabriel', 'Lévesque', 'Animateur', 'Animation', array['GBPA+']),
    ('Galaxie', 'Emma', 'Ouellet', 'Animatrice', 'Animation', array['Aquabounga']),
    ('Cliff', 'Thomas', 'Girard', 'Coordo Opi', 'Administration', array['Opikawa', 'GBPA+']),
    ('Brindille', null, null, 'Aide de camp', null, array[]::text[])
  ) as v(surnom, prenom, nom_famille, poste, secteur, entreprises)
on conflict (surnom) do update set secteur = excluded.secteur, entreprise_ids = excluded.entreprise_ids;

-- Léa (compte terrain lea@camp.test) remplit sa propre feuille (fiche
-- « Pinson »), avec woofing, pour deux compagnies (une feuille par compagnie).
insert into core.employes (surnom, prenom, nom_famille, poste, secteur, courriel, entreprise_ids)
select 'Pinson', 'Léa', 'Morin', 'Aide de camp', 'Terrain', 'lea@camp.test',
       array(select e.id from core.entreprises e where e.nom in ('GBPA+', 'Aquabounga'))
on conflict (surnom) do update set courriel = excluded.courriel, entreprise_ids = excluded.entreprise_ids;
update core.profils
   set employe_id = (select id from core.employes where surnom = 'Pinson'), woofing = true
 where courriel = 'lea@camp.test';

-- Feuilles de temps, période PP21 (4 au 17 oct. 2026), pour essayer les
-- banques, l'onglet À approuver et les dossiers à fermer :
--   Léa (Pinson) : GBPA+ 45 h la semaine 1 (+ 3 h Aquabounga → 8 h
--     accumulées), woofing, maladie et heures prises en banque ; sa feuille
--     GBPA+ est soumise, celle d'Aquabounga reste ouverte ;
--   Julie (direction) : 42,5 h la semaine 1 (2,5 h accumulées), vacances,
--     maladie, solde de départ de 6 h ; feuille soumise (pour les admins) ;
--   Olivier (direction) : quelques heures, feuille ouverte (Julie ne la voit pas) ;
--   Marteau : des heures en PP21 seulement (dossier à fermer à partir de PP24).
insert into temps.heures_employes (employe_id, entreprise_id, jour, type, heures)
select e.id, c.id, v.jour::date, v.type, v.heures
  from (values
    ('Pinson', 'GBPA+', '2026-10-05', 'regulieres', 9), ('Pinson', 'GBPA+', '2026-10-06', 'regulieres', 9),
    ('Pinson', 'GBPA+', '2026-10-07', 'regulieres', 9), ('Pinson', 'GBPA+', '2026-10-08', 'regulieres', 9),
    ('Pinson', 'GBPA+', '2026-10-09', 'regulieres', 9), ('Pinson', 'GBPA+', '2026-10-10', 'woofing', 4),
    ('Pinson', 'GBPA+', '2026-10-12', 'maladie', 8), ('Pinson', 'GBPA+', '2026-10-13', 'regulieres', 8),
    ('Pinson', 'GBPA+', '2026-10-14', 'regulieres', 6), ('Pinson', 'GBPA+', '2026-10-14', 'banque', 2),
    ('Pinson', 'Aquabounga', '2026-10-10', 'regulieres', 3),
    ('Marteau', 'GBPA+', '2026-10-05', 'regulieres', 7.5), ('Marteau', 'GBPA+', '2026-10-06', 'regulieres', 7.5)
  ) as v (surnom, compagnie, jour, type, heures)
  join core.employes e on e.surnom = v.surnom
  join core.entreprises c on c.nom = v.compagnie
on conflict do nothing;

insert into temps.feuilles_employes (employe_id, entreprise_id, debut, statut)
select e.id, c.id, '2026-10-04', 'soumise'
  from core.employes e, core.entreprises c
 where e.surnom = 'Pinson' and c.nom = 'GBPA+'
on conflict do nothing;
insert into temps.journal (feuille_employe_id, genre, auteur, auteur_nom, created_at)
select f.id, 'soumission', '00000000-0000-0000-0000-000000000009', 'Léa Morin', '2026-10-14 16:05-04'
  from temps.feuilles_employes f join core.employes e on e.id = f.employe_id
 where e.surnom = 'Pinson' and f.debut = '2026-10-04' and f.statut = 'soumise'
   and not exists (select 1 from temps.journal j where j.feuille_employe_id = f.id);

insert into temps.heures (user_id, jour, type, heures)
select v.user_id::uuid, v.jour::date, v.type, v.heures
  from (values
    ('00000000-0000-0000-0000-000000000002', '2026-10-05', 'regulieres', 8.5),
    ('00000000-0000-0000-0000-000000000002', '2026-10-06', 'regulieres', 8.5),
    ('00000000-0000-0000-0000-000000000002', '2026-10-07', 'regulieres', 8.5),
    ('00000000-0000-0000-0000-000000000002', '2026-10-08', 'regulieres', 8.5),
    ('00000000-0000-0000-0000-000000000002', '2026-10-09', 'regulieres', 8.5),
    ('00000000-0000-0000-0000-000000000002', '2026-10-12', 'vacances', 8),
    ('00000000-0000-0000-0000-000000000002', '2026-10-13', 'regulieres', 8),
    ('00000000-0000-0000-0000-000000000002', '2026-10-14', 'regulieres', 4),
    ('00000000-0000-0000-0000-000000000002', '2026-10-14', 'maladie', 4),
    ('00000000-0000-0000-0000-000000000003', '2026-10-05', 'regulieres', 7),
    ('00000000-0000-0000-0000-000000000003', '2026-10-06', 'regulieres', 7)
  ) as v (user_id, jour, type, heures)
on conflict do nothing;

insert into temps.feuilles (user_id, debut, statut)
values ('00000000-0000-0000-0000-000000000002', '2026-10-04', 'soumise')
on conflict do nothing;
insert into temps.journal (feuille_id, genre, auteur, auteur_nom, created_at)
select f.id, 'soumission', f.user_id, 'Julie Tremblay', '2026-10-14 15:30-04'
  from temps.feuilles f
 where f.user_id = '00000000-0000-0000-0000-000000000002' and f.debut = '2026-10-04' and f.statut = 'soumise'
   and not exists (select 1 from temps.journal j where j.feuille_id = f.id);

insert into temps.ajustements_banques (user_id, banque, jour, heures, note, auteur, auteur_nom)
select '00000000-0000-0000-0000-000000000002', 'heures', '2026-10-03', 6, 'Solde de départ (Google Sheets)',
       '00000000-0000-0000-0000-000000000001', 'Admin Test'
 where not exists (select 1 from temps.ajustements_banques a where a.user_id = '00000000-0000-0000-0000-000000000002');

-- Interrupteur « Heures en banque » (désactivé par défaut pour les employés) :
-- activé depuis PP21 pour Léa (compte) et pour Manitou (sans compte, 45 h la
-- semaine 1 → 5 h accumulées, 2 h prises en banque la semaine 2).
insert into temps.heures_employes (employe_id, entreprise_id, jour, type, heures)
select e.id, c.id, v.jour::date, v.type, v.heures
  from (values
    ('2026-10-05', 'regulieres', 9), ('2026-10-06', 'regulieres', 9), ('2026-10-07', 'regulieres', 9),
    ('2026-10-08', 'regulieres', 9), ('2026-10-09', 'regulieres', 9),
    ('2026-10-13', 'regulieres', 6), ('2026-10-13', 'banque', 2)
  ) as v (jour, type, heures)
  join core.employes e on e.surnom = 'Manitou'
  join core.entreprises c on c.nom = 'GBPA+'
on conflict do nothing;
insert into temps.banque_heures_etats (employe_id, depuis, active, auteur, auteur_nom)
select e.id, '2026-10-04', true, '00000000-0000-0000-0000-000000000001', 'Admin Test'
  from core.employes e
 where e.surnom in ('Pinson', 'Manitou')
on conflict do nothing;
-- Banque désactivée par défaut pour tout le monde (2026-10-20) : la
-- direction et l'admin d'essai l'ont activée depuis PP21, comme en PROD.
insert into temps.banque_heures_etats (user_id, depuis, active, auteur, auteur_nom)
select p.id, '2026-10-04', true, null, 'Réglage d''origine'
  from core.profils p
 where p.role in ('admin', 'direction')
on conflict do nothing;

-- Export Employeur D : numéros fictifs (essai) pour GBPA+ et Opikawa,
-- matricules fictifs pour Pinson, Manitou et Marteau ; Aquabounga et les
-- autres employés restent sans numéro, pour voir ce que l'export bloque.
update core.entreprises c set numero_employeur_d = v.numero
  from (values ('GBPA+', '9000001'), ('Opikawa', '9000002')) as v (nom, numero)
 where c.nom = v.nom and c.numero_employeur_d is null;
update core.employes e set matricule_employeur_d = v.matricule
  from (values ('Pinson', '101'), ('Manitou', '102'), ('Marteau', '103')) as v (surnom, matricule)
 where e.surnom = v.surnom and e.matricule_employeur_d is null;
-- Direction : Julie payée par GBPA+ (matricule fictif 201) ; Olivier sans
-- compagnie de paie ni matricule (bloque l'export d'un admin).
insert into temps.paie_direction (user_id, entreprise_id, matricule_employeur_d)
select '00000000-0000-0000-0000-000000000002', c.id, '201' from core.entreprises c where c.nom = 'GBPA+'
on conflict do nothing;

-- ------------------------------------------------------------
-- Petite caisse : l'historique vient de la migration (import du Sheets) ;
-- la poche de Maxime est liée au compte admin de test pour essayer
-- « Payé de ma poche ».
-- ------------------------------------------------------------
update caisse.poches set profil_id = '00000000-0000-0000-0000-000000000001' where nom = 'Maxime';

-- ------------------------------------------------------------
-- CRM : quelques clients et cibles d'essai, et leurs séjours dans la copie
-- Airtable du Calendrier (client lié par le champ fldPuFu1m9Qv53HkM).
-- ------------------------------------------------------------
insert into calendrier.sejours (airtable_record_id, numero, nom_groupe, type_sejour, etat, date_arrivee, date_depart, nb_participants, raw)
values
  ('recEssaiCit1', '26-G-12', 'École Citoyenne', 'Classe nature', 'Confirmée', '2026-05-12', '2026-05-14', 58, '{"fldPuFu1m9Qv53HkM": ["recCliCitoyenne"]}'),
  ('recEssaiCit2', '27-G-03', 'École Citoyenne', 'Classe nature', 'Confirmée', '2027-05-11', '2027-05-13', 60, '{"fldPuFu1m9Qv53HkM": ["recCliCitoyenne"]}'),
  ('recEssaiDaw1', '25-G-40', 'Cégep Dawson', 'Accueil de groupe', 'Confirmée', '2025-10-01', '2025-10-03', 45, '{"fldPuFu1m9Qv53HkM": ["recCliDawson"]}'),
  ('recEssaiDaw2', '26-G-02', 'Cégep Dawson', 'Accueil de groupe', 'Confirmée', '2026-01-20', '2026-01-22', 40, '{"fldPuFu1m9Qv53HkM": ["recCliDawson"]}'),
  ('recEssaiDaw3', '26-G-61', 'Cégep Dawson', 'Accueil de groupe', 'Estimé envoyé', '2026-10-20', '2026-10-22', 45, '{"fldPuFu1m9Qv53HkM": ["recCliDawson"]}'),
  ('recEssaiSou1', '26-G-20', 'École du Sous-Bois', 'Classe nature', 'Confirmée', '2026-06-02', '2026-06-04', 72, '{"fldPuFu1m9Qv53HkM": ["recCliSousBois"]}'),
  ('recEssaiNou1', '26-G-70', 'Collège Nouveau', 'Classe nature', 'Demande de réservation', '2027-03-15', '2027-03-17', 30, '{"fldPuFu1m9Qv53HkM": ["recCliNouveau"]}')
on conflict (airtable_record_id) do nothing;

insert into crm.organisations (id, nom, genre, ville, conseiller_id, etape, prioritaire, cycle_ans, airtable_client_id, notes) values
  ('c0000000-0000-0000-0000-000000000001', 'École Citoyenne', 'ecole_secondaire', 'Montréal', '00000000-0000-0000-0000-000000000002', 'conclusion', true, 1, 'recCliCitoyenne', 'Convertie après 6 contacts et 2 appels Zoom ; le PDF PFEQ a fait la différence.'),
  ('c0000000-0000-0000-0000-000000000002', 'Cégep Dawson', 'cegep', 'Montréal', '00000000-0000-0000-0000-000000000002', null, false, 1, 'recCliDawson', 'Cycles différents à l''automne et à l''hiver.'),
  ('c0000000-0000-0000-0000-000000000003', 'Collège Stanislas', 'ecole_secondaire', 'Montréal', '00000000-0000-0000-0000-000000000002', 'conversation', true, 1, null, null),
  ('c0000000-0000-0000-0000-000000000004', 'École des Explorateurs', 'ecole_primaire', 'Laval', '00000000-0000-0000-0000-000000000003', null, false, 1, null, null),
  ('c0000000-0000-0000-0000-000000000005', 'École du Sous-Bois', 'ecole_primaire', 'Saint-Jérôme', '00000000-0000-0000-0000-000000000003', null, false, 2, 'recCliSousBois', 'Vient une année sur deux.'),
  ('c0000000-0000-0000-0000-000000000006', 'École Les Trois-Sources', 'ecole_primaire', 'Blainville', null, 'identification', false, 1, null, null),
  ('c0000000-0000-0000-0000-000000000007', 'Collège Nouveau', 'ecole_secondaire', 'Terrebonne', '00000000-0000-0000-0000-000000000003', 'contacte', false, 1, 'recCliNouveau', null)
on conflict (id) do nothing;

insert into crm.contacts (organisation_id, nom, fonction, courriel, telephone, principal) values
  ('c0000000-0000-0000-0000-000000000001', 'Vincent Lefebvre', 'Enseignant, 2e secondaire', 'vincent@citoyenne.test', '514 555-0101', true),
  ('c0000000-0000-0000-0000-000000000002', 'Karen Smith', 'Outdoor education', 'ksmith@dawson.test', null, true),
  ('c0000000-0000-0000-0000-000000000003', 'Marie Dubé', 'Direction adjointe', 'mdube@stanislas.test', '514 555-0130', true);

insert into crm.regles (organisation_id, saison, mois_avant) values
  ('c0000000-0000-0000-0000-000000000002', 'hiver', 3)
on conflict do nothing;

insert into crm.visites (organisation_id, date_arrivee, date_depart, nb_participants, note) values
  ('c0000000-0000-0000-0000-000000000004', '2023-04-18', '2023-04-20', 50, 'Classe nature'),
  ('c0000000-0000-0000-0000-000000000004', '2022-04-12', '2022-04-14', 48, 'Classe nature');

insert into crm.echanges (organisation_id, genre, jour, texte, auteur_nom) values
  ('c0000000-0000-0000-0000-000000000001', 'rencontre', '2026-02-10', 'Appel Zoom avec Vincent : programme aligné sur le PFEQ, envoi du PDF compétences transversales.', 'Julie Tremblay'),
  ('c0000000-0000-0000-0000-000000000003', 'appel', '2026-09-22', 'Intéressés pour le printemps 2027 ; rappeler après leur conseil d''établissement.', 'Julie Tremblay'),
  ('c0000000-0000-0000-0000-000000000007', 'courriel', '2026-09-30', 'Envoi de la brochure et du formulaire de demande.', 'Olivier Lavoie');

-- ------------------------------------------------------------
-- RH (module rh) : personnes fictives, candidatures et embauches.
-- NAS d'essai valide (clé de Luhn) : 046 454 286.
-- ------------------------------------------------------------
insert into rh.personnes (id, prenom, nom_famille, surnom, courriel, telephone, date_naissance, sexe, vaj_le) values
  ('d0000000-0000-0000-0000-000000000001', 'Rosalie', 'Gauthier', null, 'rosalie@essai.test', '514 555-0201', '2006-04-12', 'f', null),
  ('d0000000-0000-0000-0000-000000000002', 'Thomas', 'Pelletier', 'Hibou', 'thomas@essai.test', '819 555-0202', '2004-09-03', 'm', '2025-05-20'),
  ('d0000000-0000-0000-0000-000000000003', 'Maya', 'Nguyen', null, 'maya@essai.test', null, '2008-11-30', 'f', null),
  ('d0000000-0000-0000-0000-000000000004', 'Samuel', 'Leblanc', 'Castor', 'samuel@essai.test', '450 555-0204', '2003-02-14', 'm', '2024-06-01'),
  ('d0000000-0000-0000-0000-000000000005', 'Inès', 'Haddad', null, 'ines@essai.test', '514 555-0205', '2005-07-22', 'f', null)
on conflict (id) do nothing;

insert into rh.candidatures (id, personne_id, source, recue_le, saison_ids, poste_ids, reponses, statut, pre_decision, commentaires, entrevue_le)
select v.id::uuid, v.personne::uuid, v.source, v.recue::timestamptz,
       array(select s.id from rh.saisons s where s.nom = any (v.saisons)),
       array(select p.id from rh.postes p where p.nom = any (v.postes) and p.entreprise_id = rh.entreprise(v.compagnie)),
       v.reponses::jsonb, v.statut, v.pre, v.commentaires, v.entrevue::date
  from (values
    ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'formulaire', '2026-10-02 14:10-04', array['Été 2027'], array['Animateur - Camp d''été', 'Animateur - Programme EXPÉ'], 'GBPA+',
     '{"niveau_etudes": "Cégep - En cours", "citoyennete": "Citoyen·ne canadien·ne", "francais": "Langue maternelle", "anglais": "Intermédiaire", "motivation": "J''ai été campeuse pendant 5 ans et je rêve d''être monitrice.", "connu_par": "Référence d''un ami", "refere_par": "Hibou"}',
     'recue', null, null, null),
    ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', 'formulaire', '2026-09-28 09:00-04', array['Hiver 2027', 'Printemps 2027'], array['Animateur - Classe nature'], 'GBPA+',
     '{"niveau_etudes": "Secondaire 5 - En cours", "citoyennete": "Citoyen·ne canadien·ne", "francais": "Excellent", "anglais": "Excellent", "motivation": "Disponible les fins de semaine et pendant la relâche."}',
     'entrevue_proposee', 'oui', 'Très bonne candidate au téléphone.', '2026-10-15'),
    ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002', 'retour', '2026-09-20 18:30-04', array['Été 2027'], array['Coordonnateur'], 'GBPA+',
     '{"intention": "Oui, veut revenir"}',
     'acceptee', 'oui', null, null),
    ('e0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000005', 'formulaire', '2026-09-15 11:45-04', array['Été 2027'], array['Sauveteur sur structure gonflable'], 'AQB',
     '{"niveau_etudes": "Université - En cours", "citoyennete": "Étranger·ère avec un permis de travail valide au Canada", "francais": "Intermédiaire", "anglais": "Langue maternelle"}',
     'en_attente', 'peut_etre', 'Attendre la confirmation de son permis.', '2026-09-25')
  ) as v(id, personne, source, recue, saisons, postes, compagnie, reponses, statut, pre, commentaires, entrevue)
on conflict (id) do nothing;

-- Thomas : ancien (Été 2026 complète), réembauché pour l'Été 2027.
insert into rh.embauches (id, personne_id, saison_id, entreprise_id, poste_id, echelon, candidature_id, statut, remuneration, taux, vacances, type_employe, action_paie, date_embauche, code_ethique_le, dossier_recu_le)
select 'f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', s.id, rh.entreprise('GBPA+'),
       (select id from rh.postes where nom = 'Animateur - Camp d''été' and entreprise_id = rh.entreprise('GBPA+')), 2, null,
       'complete', 'semaine', 650, 'chaque_paie', 'E', 'A', '2026-06-20', '2026-03-12 10:00-04', '2026-03-12 10:00-04'
  from rh.saisons s where s.nom = 'Été 2026'
on conflict (id) do nothing;
insert into rh.embauches (id, personne_id, saison_id, entreprise_id, poste_id, echelon, candidature_id, statut, action_paie)
select 'f0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', s.id, rh.entreprise('GBPA+'),
       (select id from rh.postes where nom = 'Coordonnateur' and entreprise_id = rh.entreprise('GBPA+')), 3,
       'e0000000-0000-0000-0000-000000000003', 'a_envoyer', 'M'
  from rh.saisons s where s.nom = 'Été 2027'
on conflict (id) do nothing;
update rh.candidatures set saison_id = (select id from rh.saisons where nom = 'Été 2027'), entreprise_id = rh.entreprise('GBPA+'),
       poste_id = (select id from rh.postes where nom = 'Coordonnateur' and entreprise_id = rh.entreprise('GBPA+')), echelon = 3
 where id = 'e0000000-0000-0000-0000-000000000003';

-- Samuel : ancien, Été 2026, « ne pas réembaucher ».
insert into rh.embauches (id, personne_id, saison_id, entreprise_id, poste_id, echelon, statut)
select 'f0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000004', s.id, rh.entreprise('GBPA+'),
       (select id from rh.postes where nom = 'Sauveteur plage' and entreprise_id = rh.entreprise('GBPA+')), 1, 'complete'
  from rh.saisons s where s.nom = 'Été 2026'
on conflict (id) do nothing;
update rh.personnes set ne_pas_reembaucher = true, raison_ne_pas = 'Retards répétés, deux avis écrits (été 2026).' where id = 'd0000000-0000-0000-0000-000000000004';

insert into rh.dossiers (personne_id, adresse, ville, province, code_postal, pays, assurance_maladie, etudiant_temps_plein, etudes, allergies, diete, taille_tshirt, taille_hoodie, urgence1_nom, urgence1_lien, urgence1_telephone)
values ('d0000000-0000-0000-0000-000000000002', '123, rue des Érables', 'Mont-Tremblant', 'QC', 'J8E 1A1', 'Canada', 'PELT 0409 0312', true, 'Techniques de loisir, Cégep de Saint-Jérôme', 'Arachides', 'vegetarienne', 'L', 'L', 'Nathalie Pelletier', 'Mère', '819 555-0299')
on conflict (personne_id) do nothing;

insert into rh.paie (personne_id, nas, nas_fin, transit, institution, compte, compte_fin, updated_by_nom)
values ('d0000000-0000-0000-0000-000000000002', rh.chiffrer('046454286'), '286', '81530', '815', rh.chiffrer('1234567'), '567', 'Essai')
on conflict (personne_id) do nothing;

insert into rh.notes (personne_id, genre, jour, texte, auteur_nom) values
  ('d0000000-0000-0000-0000-000000000004', 'avis_ecrit', '2026-07-10', 'Retard de 45 minutes à la plage, groupe sans surveillance.', 'Julie Tremblay')
on conflict do nothing;

-- ------------------------------------------------------------
-- Subventions : agenda Google simulé (« essai-… », jamais Google depuis
-- une base locale), deux subventions de l'année fiscale 2026-27 retenues
-- pour GBPA+ (une en cours avec une proposition de Claude, une obtenue avec
-- sa reddition), leur attribution salariale (employés fictifs ci-dessus + un
-- poste à pourvoir), et une carte à valider trouvée pour trois compagnies.
-- Une subvention retenue = une ligne de suivi par compagnie qui dépose
-- (grant_applications) ; son statut en est tiré par la base.
-- ------------------------------------------------------------
update subventions.grant_settings
   set value = jsonb_build_object('actif', true, 'calendrier', 'essai-subventions', 'depuis', '2026-10-01')
 where key = 'agenda';

insert into subventions.grants (id, program_name, organisme, description, source_url, grant_type, status,
  potential_amount_max, open_date, deadline_date, funded_start, funded_end, eligibility_criteria,
  company_ids, program_key, origin, discovered_fy)
select v.id::uuid, v.nom, v.organisme, v.description, v.url, 'salarial', 'nouveau',
       v.max, v.ouverture::date, v.limite::date, v.debut::date, v.fin::date, v.criteres,
       array[c.id], v.cle, 'manuel', 2027
  from (values
    ('5b000000-0000-0000-0000-000000000001', 'Jeunesse Canada au travail (essai)', 'Patrimoine canadien',
     'Emplois d''été pour les jeunes dans les organismes du patrimoine et des langues officielles.',
     'https://www.canada.ca/fr/patrimoine-canadien/services/financement/jeunesse-canada-travail.html',
     15000, null, '2027-02-01', '2027-05-03', '2027-08-27', 'Jeunes de 16 à 30 ans, citoyens canadiens ou résidents permanents.',
     'jeunesse-canada-au-travail'),
    ('5b000000-0000-0000-0000-000000000002', 'Emplois d''été Canada 2027 (essai)', 'Emploi et Développement social Canada',
     'Subvention salariale pour des emplois d''été de 6 à 16 semaines.',
     'https://www.canada.ca/fr/emploi-developpement-social/services/financement/emplois-ete-canada.html',
     50000, '2026-11-15', '2027-01-12', '2027-06-21', '2027-08-27', null,
     'emplois-ete-canada')
  ) as v(id, nom, organisme, description, url, max, ouverture, limite, debut, fin, criteres, cle)
  join subventions.grant_companies c on c.name = 'GBPA+'
on conflict (id) do nothing;

insert into subventions.grant_applications (id, grant_id, company_id, status, amount_requested, requested_at, amount_granted, granted_at)
select v.id::uuid, v.grant_id::uuid, c.id, v.statut, v.demande, v.demande_le::date, v.accorde, v.accorde_le::date
  from (values
    ('5b000000-0000-0000-0000-000000000041', '5b000000-0000-0000-0000-000000000001', 'en_cours', null, null, null, null),
    ('5b000000-0000-0000-0000-000000000042', '5b000000-0000-0000-0000-000000000002', 'obtenu', 30000, '2027-01-10', 24600, '2027-04-20')
  ) as v(id, grant_id, statut, demande, demande_le, accorde, accorde_le)
  join subventions.grant_companies c on c.name = 'GBPA+'
on conflict (id) do nothing;

-- Même programme trouvé par Claude pour trois compagnies : une seule carte.
insert into subventions.grants (id, program_name, organisme, description, source_url, grant_type, status,
  potential_amount_max, deadline_date, company_ids, program_key, origin, discovered_fy, relevance_justification)
select '5b000000-0000-0000-0000-000000000003', 'Programme d''appui au développement des attraits touristiques (essai)',
       'Ministère du Tourisme / Investissement Québec', 'Aide financière aux projets d''attraits touristiques structurants.',
       'https://www.quebec.ca/tourisme-loisirs-sport/services-industrie-touristique/aide-financiere', 'immobilisation', 'nouveau',
       5000000, '2026-12-31', array_agg(c.id order by c.sort_order), 'padat', 'claude', 2027,
       E'GBPA+ : Financement d''infrastructures touristiques pour la base de plein air.\n\n'
       || E'Opikawa : Marginal, mais pertinent pour un projet d''hébergement.\n\n'
       || 'Trembloc : Aménagement du site de bloc (sentiers, signalisation).'
  from subventions.grant_companies c
 where c.name in ('GBPA+', 'Opikawa', 'Trembloc')
having count(*) > 0
on conflict (id) do nothing;

insert into subventions.grant_reporting_steps (id, application_id, description, due_date, sort_order) values
  ('5b000000-0000-0000-0000-000000000011', '5b000000-0000-0000-0000-000000000042', 'Rapport de fin d''emploi de chaque étudiant', '2027-09-30', 0),
  ('5b000000-0000-0000-0000-000000000012', '5b000000-0000-0000-0000-000000000042', 'Demande de paiement finale', '2027-10-15', 1)
on conflict (id) do nothing;

-- Mise à jour ciblée de Claude : une date d'ouverture remplie (champ vide),
-- une date limite qui changerait (à valider sur la fiche).
insert into subventions.grant_proposals (id, grant_id, field, current_value, proposed_value, status, source_url, comment) values
  ('5b000000-0000-0000-0000-000000000021', '5b000000-0000-0000-0000-000000000001', 'deadline_date', '2027-02-01', '2027-02-15', 'a_valider',
   'https://www.canada.ca/fr/patrimoine-canadien/services/financement/jeunesse-canada-travail.html', 'La date limite a été repoussée de deux semaines.'),
  ('5b000000-0000-0000-0000-000000000022', '5b000000-0000-0000-0000-000000000001', 'open_date', null, '2026-11-02', 'appliquee',
   'https://www.canada.ca/fr/patrimoine-canadien/services/financement/jeunesse-canada-travail.html', null)
on conflict (id) do nothing;
update subventions.grants set open_date = '2026-11-02'
 where id = '5b000000-0000-0000-0000-000000000001' and open_date is null;

insert into subventions.grant_salary_lines (id, application_id, employee_id, free_name, hourly_rate, hours, salary_amount,
  start_date, end_date, grant_contribution, employer_contribution, note)
select v.id::uuid, v.suivi::uuid, e.id, v.libre, v.taux, v.heures, v.montant, v.debut::date, v.fin::date, v.subv, v.empl, v.note
  from (values
    ('5b000000-0000-0000-0000-000000000031', '5b000000-0000-0000-0000-000000000042', 'Koda', null, 17.50, 280, null, '2027-06-21', '2027-08-27', 4900, null, null),
    ('5b000000-0000-0000-0000-000000000032', '5b000000-0000-0000-0000-000000000042', 'Moutic', null, null, null, 5600, '2027-06-21', '2027-08-20', 4200, 1400, 'Avec les vacances et les charges.'),
    ('5b000000-0000-0000-0000-000000000033', '5b000000-0000-0000-0000-000000000042', null, 'Sauveteur no 2 (à pourvoir)', 18.00, 300, null, '2027-06-28', '2027-08-27', 2700, null, null),
    ('5b000000-0000-0000-0000-000000000034', '5b000000-0000-0000-0000-000000000041', 'Cliff', null, null, null, 12000, '2027-05-03', '2027-08-27', 7000, null, null)
  ) as v(id, suivi, surnom, libre, taux, heures, montant, debut, fin, subv, empl, note)
  left join core.employes e on e.surnom = v.surnom
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- Calendrier : horaire de la direction. « + » choisit d'office la
-- personne liée au compte (en DEV, Maxime = compte Admin Test) ;
-- Frédérique est à la direction et aussi à l'horaire de cuisine (Cuisine
-- › Horaire lit ses journées du Calendrier). Rien n'est ajouté si les
-- personnes existent déjà (données de la maquette 3D).
-- ------------------------------------------------------------
insert into commande.personnel (id, nom, fonction_id)
select 'ca1e0000-0000-4000-8000-000000000021', 'Frédérique', f.id
  from commande.fonctions f
 where f.nom = 'Gestionnaire'
   and not exists (select 1 from commande.personnel where nom = 'Frédérique');

insert into calendrier.personnel (id, nom, secteur_principal, ordre)
select v.id::uuid, v.nom, 'direction', v.ordre
  from (values ('ca1e0000-0000-4000-8000-000000000001', 'Maxime', 1),
               ('ca1e0000-0000-4000-8000-000000000002', 'Frédérique', 2)) as v(id, nom, ordre)
 where not exists (select 1 from calendrier.personnel p where p.nom = v.nom and p.deleted_at is null);

update calendrier.personnel set courriel = 'admin@camp.test'
 where nom = 'Maxime' and deleted_at is null and courriel is null
   and not exists (select 1 from calendrier.personnel where courriel = 'admin@camp.test');
update calendrier.personnel
   set secteur_principal = 'direction',
       personne_cuisine_id = (select id from commande.personnel where nom = 'Frédérique' order by created_at, id limit 1)
 where nom = 'Frédérique' and deleted_at is null and personne_cuisine_id is null;

insert into calendrier.presences_simples (personnel_id, date, secteur, statut, description)
select p.id, v.jour::date, 'direction', v.statut, v.note
  from (values
    ('Frédérique', '2026-10-12', 'terrain', null),
    ('Frédérique', '2026-10-13', 'terrain', null),
    ('Frédérique', '2026-10-14', 'terrain', 'Inventaire de la chambre froide'),
    ('Frédérique', '2026-10-15', 'teletravail', null),
    ('Frédérique', '2026-10-16', 'conge', null),
    ('Frédérique', '2026-10-19', 'terrain', null),
    ('Frédérique', '2026-10-20', 'terrain', null),
    ('Maxime', '2026-10-13', 'terrain', null),
    ('Maxime', '2026-10-15', 'teletravail', null)
  ) as v(nom, jour, statut, note)
  join calendrier.personnel p on p.nom = v.nom and p.deleted_at is null
on conflict (personnel_id, date, secteur) do nothing;

-- ------------------------------------------------------------
-- Réservations › Liste de prix (révision du 2026-10-14) : une réservation
-- d'essai en 2027-28, pour voir un estimé aux prix provisoires (liste
-- 27-28 pas encore validée → prix de 26-27).
-- ------------------------------------------------------------
insert into reservations.reservations (numero, exercice, numero_seq, nom, compagnie_id, forfait, variante, date_arrivee, date_depart,
  heure_arrivee, heure_depart, nb_participants, nb_accompagnateurs, ratio, service_repas, nb_dejeuners, nb_diners, nb_soupers, description)
select '28-G-901', 2028, 901, 'ESSAI Liste de prix (classe nature 27-28)', e.id, 'classe_nature', 'verte', '2027-11-10', '2027-11-11',
  '10:00', '14:00', 50, 4, '1:15', true, 1, 2, 1, 'Réservation d''essai : estimé aux prix provisoires de 2027-28.'
from core.entreprises e
where e.nom = 'GBPA+'
on conflict (numero) do nothing;
