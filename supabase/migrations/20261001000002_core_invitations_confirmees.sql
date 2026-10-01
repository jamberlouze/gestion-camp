-- ============================================================
-- core : une personne invitée peut se connecter avec le code à 6 chiffres
-- sans avoir cliqué sur le lien d'invitation.
--
-- Supabase Auth traite une adresse non confirmée comme une nouvelle
-- inscription. Les inscriptions étant fermées, la demande de code est refusée
-- (« Signups not allowed for this instance ») tant que la personne n'a pas
-- cliqué sur le lien d'invitation. Or ce lien expire après 15 minutes
-- (auth.email.otp_expiry). Passé ce délai, la personne était bloquée.
--
-- On confirme donc l'adresse dès l'invitation. Ça n'ouvre aucun accès : la
-- seule façon de se connecter reste le code envoyé à cette adresse, ce qui
-- prouve qu'on la possède, comme le lien. Le lien d'invitation fonctionne
-- toujours s'il est cliqué à temps.
-- ============================================================

create or replace function core.confirmer_invitation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.invited_at is not null and new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

-- Auth crée l'utilisateur puis inscrit invited_at dans une mise à jour ; le
-- déclencheur couvre aussi l'insertion au cas où ça changerait.
create trigger trg_confirmer_invitation
before insert or update of invited_at on auth.users
for each row execute function core.confirmer_invitation();

-- Personnes déjà invitées qui n'ont pas cliqué sur le lien.
update auth.users
set email_confirmed_at = now()
where invited_at is not null and email_confirmed_at is null;
