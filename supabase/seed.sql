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
    ('00000000-0000-0000-0000-000000000009'::uuid, 'lea@camp.test')
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
  ('lea@camp.test', 'Léa Morin', 'terrain')
) as v (courriel, nom, role)
where p.courriel = v.courriel;

-- ------------------------------------------------------------
-- Travaux (DEV) : chantiers et tâches tels que la migration les a tirés
-- de Mastertimeline en PROD le 2026-10-06, listes de Mastertimeline
-- (noms seulement) pour essayer « Envoyer vers Mastertimeline », et
-- quelques cas de test (signalements à trier, tâches assignées, retard).
-- Généré par Claude ; les noms de lieux et catégories viennent de la
-- migration 20261006000010_travaux.sql.
-- ------------------------------------------------------------
insert into mastertimeline.entreprises (id, nom, couleur, ordre) values
  ('d5c57473-f9b8-58b9-8312-11c3e45fb07a', 'GBPA+', '#19774a', 1),
  ('635cb5aa-a46d-551f-a54e-de440410c09f', 'Opikawa', '#567E96', 2),
  ('d2aebea0-e2b0-59ed-b584-40052859f4fb', 'BPA inc.', '#8A7B62', 3),
  ('f6a2d2eb-e4ea-52ff-8bd5-075e1b6e2950', 'Aquabounga', '#2b8cc4', 4),
  ('b057c513-f0d2-5299-8620-7749ee2047a7', 'Rouge & Diable', '#c0392b', 5);

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
left join mastertimeline.entreprises e on e.nom = v.entreprise;
