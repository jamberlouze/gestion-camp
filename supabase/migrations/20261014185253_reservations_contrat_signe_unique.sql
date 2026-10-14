-- ============================================================
-- Réservations : un seul contrat signé par signature.
--
-- Bogue du 2026-10-14 (27-G-056, deux contrats signés) : le Worker produit
-- le contrat signé dès la signature ; la fiche, ouverte au même moment par
-- l'équipe, a vu la signature arriver (temps réel) avant que le Worker
-- relie son PDF, et en a produit un deuxième (filet de sûreté), puis a
-- remplacé le lien sans condition.
--
-- Désormais : le contrat signé porte sa signature (signature_id), un index
-- unique refuse le deuxième, et c'est la base qui relie le PDF à la
-- signature (une seule fois). Le perdant d'une course retire son fichier et
-- reprend celui qui existe.
-- ============================================================

alter table reservations.documents
  add column signature_id uuid references reservations.signatures(id) on delete set null;

comment on column reservations.documents.signature_id is
  'Contrat signé : la signature dont il est la copie signée (un seul par signature).';

-- Contrats signés déjà reliés à leur signature.
update reservations.documents d set signature_id = s.id
from reservations.signatures s
where s.document_signe_id = d.id and d.genre = 'contrat_signe';

create unique index documents_un_contrat_signe on reservations.documents (signature_id) where genre = 'contrat_signe';

-- Nouveau contrat signé : il doit dire de quelle signature il est la copie,
-- et cette signature doit être signée, pour la même réservation.
create function reservations.verifier_contrat_signe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.genre <> 'contrat_signe' then
    new.signature_id := null;
    return new;
  end if;
  if new.signature_id is null then
    raise exception 'Contrat signé sans signature.';
  end if;
  if not exists (
    select 1 from reservations.signatures s
    where s.id = new.signature_id and s.reservation_id = new.reservation_id and s.statut = 'signe'
  ) then
    raise exception 'Cette signature n''est pas signée pour cette réservation.';
  end if;
  return new;
end;
$$;

create trigger trg_reservations_documents_contrat_signe before insert on reservations.documents
for each row execute function reservations.verifier_contrat_signe();

-- Le contrat signé est relié à sa signature par la base, une seule fois.
create function reservations.relier_contrat_signe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update reservations.signatures set document_signe_id = new.id
  where id = new.signature_id and document_signe_id is null;
  return null;
end;
$$;

create trigger trg_reservations_documents_relier after insert on reservations.documents
for each row when (new.genre = 'contrat_signe')
execute function reservations.relier_contrat_signe();
