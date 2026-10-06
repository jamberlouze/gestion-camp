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

-- Pokes : un reçu aujourd'hui (pas vu) et un d'hier (vu), pour l'admin.
insert into core.pokes (de, a, emoji, jour, vu_le, created_at) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '🦆',
    (now() at time zone 'America/Toronto')::date, null, now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '🔥',
    (now() at time zone 'America/Toronto')::date - 1, now() - interval '1 day', now() - interval '1 day');
