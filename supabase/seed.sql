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
    ('00000000-0000-0000-0000-000000000007'::uuid, 'noah@camp.test')
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
  ('noah@camp.test', 'Noah Côté', 'coordo')
) as v (courriel, nom, role)
where p.courriel = v.courriel;

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
