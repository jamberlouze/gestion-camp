-- ============================================================
-- Réservations, phase 3 : formulaire public (remplace Jotform), page
-- client sans compte, fiches participants (données de santé).
--
-- Rien de public ne touche les tables directement : le formulaire passe par
-- le Worker (Turnstile, puis reservations.recevoir_demande avec la clé
-- secrète) ; la page client et les fiches passent par des fonctions
-- security definer qui reçoivent un jeton secret de 48 caractères.
-- ============================================================

-- Fiches participants : accès propre (données de santé), comme Coût par
-- assiette ; admins seulement au départ (aucune ligne dans la grille).
alter table core.acces_roles drop constraint acces_roles_module_check;
alter table core.acces_roles add constraint acces_roles_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats','caisse','cuisine_couts','reunions','crm','reservations','reservations_sante'));

alter table core.acces_modules drop constraint acces_modules_module_check;
alter table core.acces_modules add constraint acces_modules_module_check
  check (module in ('embarcations','commande','horaire','mastertimeline','subventions','vigie','calendrier','vehicules','travaux','rooming','achats','caisse','cuisine_couts','reunions','crm','reservations','reservations_sante'));

-- ------------------------------------------------------------
-- Liens secrets d'une réservation : page client (le responsable du
-- groupe) et fiches participants (transmis aux parents). Deux jetons :
-- un parent ne voit jamais l'estimé ni le contrat.
-- ------------------------------------------------------------
alter table reservations.reservations
  add column jeton_client text unique default encode(extensions.gen_random_bytes(24), 'hex'),
  add column jeton_fiches text unique default encode(extensions.gen_random_bytes(24), 'hex');
alter table reservations.reservations
  alter column jeton_client set not null,
  alter column jeton_fiches set not null;

-- Nouveau lien (l'ancien ne fonctionne plus).
create function reservations.nouveau_lien(p_reservation uuid, p_genre text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_jeton text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if p_genre = 'client' then
    update reservations.reservations set jeton_client = v_jeton where id = p_reservation;
  elsif p_genre = 'fiches' then
    update reservations.reservations set jeton_fiches = v_jeton where id = p_reservation;
  else
    raise exception 'Lien inconnu : %', p_genre;
  end if;
  if not found then
    raise exception 'Réservation introuvable.';
  end if;
  return v_jeton;
end;
$$;

-- Estimé accepté par le client sur sa page : qui, d'où.
alter table reservations.estimes
  add column accepte_par text,
  add column accepte_ip text;

-- ------------------------------------------------------------
-- Demandes reçues par le formulaire public : les réponses telles que
-- saisies. La réservation est créée tout de suite (étape Nouvelle, sans
-- organisation) ; l'équipe la relie ensuite au CRM (valider_demande).
-- ------------------------------------------------------------
create table reservations.demandes (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references reservations.reservations(id) on delete cascade,
  -- Clé tirée par le formulaire : un double envoi ne crée pas deux demandes.
  cle uuid not null unique,
  recue_le timestamptz not null default now(),
  langue text not null default 'fr' check (langue in ('fr', 'en')),
  reponses jsonb not null,
  adresse_ip text,
  navigateur text,
  validee_le timestamptz,
  validee_par uuid references core.profils(id) on delete set null,
  validee_par_nom text
);

alter table reservations.demandes enable row level security;
grant select, update, delete on reservations.demandes to authenticated;
grant all on reservations.demandes to service_role;
create policy "Lire" on reservations.demandes for select to authenticated using (core.peut_lire('reservations'));
create policy "Modifier" on reservations.demandes for update to authenticated
  using (core.peut_ecrire('reservations')) with check (core.peut_ecrire('reservations'));
create policy "Retirer" on reservations.demandes for delete to authenticated using (core.peut_ecrire('reservations'));
alter publication supabase_realtime add table reservations.demandes;

-- Qui a relié la demande au CRM : posé par la base.
create function reservations.signer_demande()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.validee_le is not null and old.validee_le is null then
    new.validee_par := auth.uid();
    new.validee_par_nom := reservations.nom_de(auth.uid());
  elsif new.validee_le is null then
    new.validee_par := null;
    new.validee_par_nom := null;
  end if;
  return new;
end;
$$;

create trigger trg_reservations_demandes_signer before update on reservations.demandes
for each row execute function reservations.signer_demande();

-- Appelée par le Worker seulement (clé secrète), après la vérification
-- Turnstile. p_reservation : champs de la réservation déjà calculés par le
-- Worker (variante, heures, repas : demande.ts) ; p_demande : cle, langue,
-- reponses, adresse_ip, navigateur.
create function reservations.recevoir_demande(p_reservation jsonb, p_demande jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_numero text;
  v_existante uuid;
  v_compagnie uuid;
  p jsonb := p_reservation;
begin
  select reservation_id into v_existante from reservations.demandes where cle = (p_demande ->> 'cle')::uuid;
  if found then
    select numero into v_numero from reservations.reservations where id = v_existante;
    return jsonb_build_object('id', v_existante, 'numero', v_numero, 'deja', true);
  end if;

  select c.entreprise_id into v_compagnie
  from reservations.compagnies c join core.entreprises e on e.id = c.entreprise_id
  order by (e.nom = 'GBPA+') desc, e.nom
  limit 1;

  insert into reservations.reservations (
    nom, compagnie_id, forfait, forfait_demande, variante, date_arrivee, date_depart,
    heure_arrivee, heure_depart, heures_regulieres, nb_participants, nb_accompagnateurs,
    ages, langue, description, commentaires_client, ratio, service_repas,
    nb_dejeuners, nb_diners, nb_soupers, courriel_direction, provenance, origine)
  values (
    left(btrim(p ->> 'nom'), 200),
    v_compagnie,
    p ->> 'forfait',
    p ->> 'forfait',
    nullif(p ->> 'variante', ''),
    (p ->> 'date_arrivee')::date,
    (p ->> 'date_depart')::date,
    nullif(p ->> 'heure_arrivee', '')::time,
    nullif(p ->> 'heure_depart', '')::time,
    (p ->> 'heures_regulieres')::boolean,
    nullif(p ->> 'nb_participants', '')::integer,
    nullif(p ->> 'nb_accompagnateurs', '')::integer,
    left(nullif(btrim(p ->> 'ages'), ''), 500),
    left(nullif(btrim(p ->> 'langue'), ''), 100),
    left(nullif(btrim(p ->> 'description'), ''), 5000),
    left(nullif(btrim(p ->> 'commentaires_client'), ''), 5000),
    nullif(p ->> 'ratio', ''),
    coalesce((p ->> 'service_repas')::boolean, false),
    coalesce((p ->> 'nb_dejeuners')::integer, 0),
    coalesce((p ->> 'nb_diners')::integer, 0),
    coalesce((p ->> 'nb_soupers')::integer, 0),
    left(nullif(btrim(p ->> 'courriel_direction'), ''), 200),
    'Formulaire web',
    'formulaire')
  returning id, numero into v_id, v_numero;

  insert into reservations.demandes (reservation_id, cle, langue, reponses, adresse_ip, navigateur)
  values (
    v_id,
    (p_demande ->> 'cle')::uuid,
    coalesce(p_demande ->> 'langue', 'fr'),
    p_demande -> 'reponses',
    left(p_demande ->> 'adresse_ip', 100),
    left(p_demande ->> 'navigateur', 300));

  insert into reservations.journal (reservation_id, genre, texte, auteur_nom)
  values (v_id, 'note', 'Demande reçue par le formulaire web', 'Formulaire web');

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'deja', false);
end;
$$;

-- Contact d'une demande dans l'organisation : celui qui a le même courriel,
-- sinon un nouveau.
create function reservations.contact_demande(p_org uuid, p_prenom text, p_nom text, p_courriel text, p_telephone text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_nom text := btrim(concat_ws(' ', btrim(p_prenom), btrim(p_nom)));
  v_courriel text := nullif(lower(btrim(coalesce(p_courriel, ''))), '');
begin
  if v_nom = '' and v_courriel is null then
    return null;
  end if;
  if v_courriel is not null then
    select id into v_id from crm.contacts
    where organisation_id = p_org and lower(btrim(courriel)) = v_courriel
    order by principal desc, created_at
    limit 1;
  end if;
  if v_id is not null then
    update crm.contacts set telephone = coalesce(telephone, nullif(btrim(p_telephone), '')) where id = v_id;
    return v_id;
  end if;
  insert into crm.contacts (organisation_id, nom, courriel, telephone)
  values (p_org, coalesce(nullif(v_nom, ''), v_courriel), v_courriel, nullif(btrim(coalesce(p_telephone, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Relier une demande au CRM : organisation choisie (p_organisation) ou
-- créée d'après la demande (p_genre = type du CRM), contacts retrouvés par
-- courriel ou créés, adresse complétée, responsable interne = qui relie
-- (s'il n'y en a pas). Une transaction.
create function reservations.valider_demande(p_demande uuid, p_organisation uuid, p_genre text default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  d reservations.demandes;
  rep jsonb;
  v_org uuid := p_organisation;
  v_resp uuid;
  v_fact uuid;
  v_adresse text;
begin
  select * into d from reservations.demandes where id = p_demande for update;
  if not found then
    raise exception 'Demande introuvable.';
  end if;
  if d.validee_le is not null then
    raise exception 'Cette demande est déjà reliée au CRM.';
  end if;
  rep := d.reponses;
  v_adresse := nullif(btrim(concat_ws(', ', nullif(btrim(rep ->> 'adresse'), ''), nullif(btrim(rep ->> 'adresse2'), ''))), '');

  if v_org is null then
    insert into crm.organisations (nom, genre, adresse, ville, province, code_postal, conseiller_id)
    values (
      btrim(rep ->> 'organisation'),
      coalesce(p_genre, 'autre'),
      v_adresse,
      nullif(btrim(rep ->> 'ville'), ''),
      nullif(btrim(rep ->> 'province'), ''),
      nullif(upper(btrim(rep ->> 'code_postal')), ''),
      auth.uid())
    returning id into v_org;
  else
    update crm.organisations set
      adresse = coalesce(adresse, v_adresse),
      ville = coalesce(ville, nullif(btrim(rep ->> 'ville'), '')),
      province = coalesce(province, nullif(btrim(rep ->> 'province'), '')),
      code_postal = coalesce(code_postal, nullif(upper(btrim(rep ->> 'code_postal')), ''))
    where id = v_org;
    if not found then
      raise exception 'Organisation introuvable.';
    end if;
  end if;

  v_resp := reservations.contact_demande(v_org, rep ->> 'resp_prenom', rep ->> 'resp_nom', rep ->> 'resp_courriel', rep ->> 'resp_telephone');
  if rep ->> 'facturation_meme' = 'non' then
    v_fact := reservations.contact_demande(v_org, rep ->> 'fact_prenom', rep ->> 'fact_nom', rep ->> 'fact_courriel', rep ->> 'fact_telephone');
  end if;

  -- Qui relie la demande en devient responsable, s'il n'y en a pas déjà un.
  update reservations.reservations set
    organisation_id = v_org,
    contact_reservation_id = v_resp,
    contact_facturation_id = nullif(v_fact, v_resp),
    responsable_id = coalesce(responsable_id, auth.uid())
  where id = d.reservation_id;

  update reservations.demandes set validee_le = now() where id = d.id;

  return v_org;
end;
$$;

-- Ce que le formulaire affiche : heures normales (réglages) et prix du
-- repas (produit REPAS, par exercice).
create function reservations.formulaire_public()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'heures_normales', (select g.valeur from reservations.reglages g where g.cle = 'heures_normales'),
    'prix_repas', (
      select coalesce(jsonb_object_agg(x.exercice::text, x.prix), '{}')
      from reservations.prix x join reservations.produits p on p.id = x.produit_id
      where p.code = 'REPAS' and x.prix is not null))
$$;

-- ------------------------------------------------------------
-- Page client (/client/<jeton>) : ce que le responsable du groupe voit.
-- ------------------------------------------------------------
create function reservations.page_client(p_jeton text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r reservations.reservations;
  v_estime jsonb;
begin
  if p_jeton is null or length(p_jeton) <> 48 then
    return null;
  end if;
  select * into r from reservations.reservations where jeton_client = p_jeton;
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'id', e.id, 'version', e.version, 'statut', e.statut, 'date_estime', e.date_estime,
    'sous_total', e.sous_total, 'tps', e.tps, 'tvq', e.tvq, 'total', e.total,
    'envoye_le', e.envoye_le, 'accepte_le', e.accepte_le, 'accepte_par', e.accepte_par,
    'document_id', (
      select d.id from reservations.documents d
      where d.estime_id = e.id and d.genre = 'estime' order by d.cree_le desc limit 1),
    'lignes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'description', l.description, 'note', l.note, 'quantite', l.quantite,
        'prix_unitaire', l.prix_unitaire, 'pourcentage', l.pourcentage, 'montant', l.montant) order by l.ordre), '[]')
      from reservations.lignes l where l.estime_id = e.id))
  into v_estime
  from reservations.estimes e
  where e.reservation_id = r.id and e.statut in ('envoye', 'accepte')
  order by e.version desc
  limit 1;

  return jsonb_build_object(
    'numero', r.numero,
    'nom', r.nom,
    'forfait', r.forfait,
    'variante', r.variante,
    'date_arrivee', r.date_arrivee,
    'date_depart', r.date_depart,
    'heure_arrivee', r.heure_arrivee,
    'heure_depart', r.heure_depart,
    'nb_participants', r.nb_participants,
    'nb_accompagnateurs', r.nb_accompagnateurs,
    'langue', r.langue,
    'etape', r.etape,
    'fermeture', r.fermeture,
    'organisation', (select o.nom from crm.organisations o where o.id = r.organisation_id),
    'compagnie', (
      select jsonb_build_object('nom', c.raison_sociale, 'logo', c.logo, 'courriel', c.courriel, 'telephone', c.telephone)
      from reservations.compagnies c where c.entreprise_id = r.compagnie_id),
    'estime', v_estime,
    'signature', (
      select jsonb_build_object(
        'statut', s.statut,
        'jeton', case when s.statut = 'en_attente' then s.jeton end,
        'echeance', s.echeance, 'signe_le', s.signe_le, 'nom_signataire', s.nom_signataire)
      from reservations.signatures s
      where s.reservation_id = r.id and s.statut <> 'annule'
      order by s.envoye_le desc limit 1),
    'documents', (
      select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'genre', d.genre, 'titre', d.titre, 'cree_le', d.cree_le) order by d.cree_le desc), '[]')
      from reservations.documents d
      where d.reservation_id = r.id and d.genre in ('contrat_signe', 'pre_arrivee')),
    'fiches', case when r.forfait in ('classe_nature', 'journee_plein_air') then jsonb_build_object(
      'jeton', r.jeton_fiches,
      'recues', (select count(*) from reservations.fiches f where f.reservation_id = r.id),
      'attendues', coalesce(r.nb_participants, 0) + coalesce(r.nb_accompagnateurs, 0)) end
  );
end;
$$;

-- Le client accepte l'estimé sur sa page : même effet que « Accepter » dans
-- l'app, avec son nom et son adresse IP ; une relance « préparer le
-- contrat » est créée pour la personne responsable.
create function reservations.accepter_estime_client(p_jeton text, p_estime uuid, p_nom text, p_accepte boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r reservations.reservations;
  e reservations.estimes;
  v_entetes json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
begin
  select * into r from reservations.reservations where jeton_client = p_jeton and length(p_jeton) = 48;
  if not found then
    raise exception 'Lien invalide.';
  end if;
  select * into e from reservations.estimes where id = p_estime and reservation_id = r.id for update;
  if not found then
    raise exception 'Estimé introuvable.';
  end if;
  if e.statut = 'accepte' then
    return;
  end if;
  if e.statut <> 'envoye' then
    raise exception 'Cet estimé n''est plus à accepter : une nouvelle version vous sera envoyée.';
  end if;
  if not coalesce(p_accepte, false) then
    raise exception 'Il faut cocher la case pour accepter l''estimé.';
  end if;
  if btrim(coalesce(p_nom, '')) = '' then
    raise exception 'Votre nom est obligatoire.';
  end if;

  perform set_config('reservations.signataire', left(btrim(p_nom), 200), true);
  update reservations.estimes set
    statut = 'accepte',
    accepte_le = now(),
    accepte_par = left(btrim(p_nom), 200),
    accepte_ip = split_part(coalesce(v_entetes ->> 'x-forwarded-for', v_entetes ->> 'x-real-ip', ''), ',', 1)
  where id = e.id;
  update reservations.reservations set etape = 'estime_accepte'
  where id = r.id and etape in ('nouvelle', 'contact', 'estime_envoye');
  insert into reservations.journal (reservation_id, genre, texte)
  values (r.id, 'document', 'Estimé v' || e.version || ' accepté en ligne par ' || left(btrim(p_nom), 200));
  if r.organisation_id is not null then
    insert into crm.relances (organisation_id, reservation_id, titre, echeance, assigne_a, auteur_nom)
    values (r.organisation_id, r.id, r.numero || ' : estimé accepté en ligne, préparer le contrat',
      (now() at time zone 'America/Toronto')::date, r.responsable_id, left(btrim(p_nom), 200) || ' (client)');
  end if;
end;
$$;

-- Message du client depuis sa page : un échange du CRM et une relance
-- « répondre » (dix messages par jour au plus).
create function reservations.message_client(p_jeton text, p_nom text, p_texte text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r reservations.reservations;
  v_texte text := left(btrim(coalesce(p_texte, '')), 4000);
  v_nom text := left(nullif(btrim(coalesce(p_nom, '')), ''), 200);
begin
  select * into r from reservations.reservations where jeton_client = p_jeton and length(p_jeton) = 48;
  if not found then
    raise exception 'Lien invalide.';
  end if;
  if v_texte = '' then
    raise exception 'Le message est vide.';
  end if;
  if (select count(*) from reservations.journal j
      where j.reservation_id = r.id and j.genre = 'courriel' and j.auteur_nom like '%(client)'
        and j.quand > now() - interval '1 day') >= 10 then
    raise exception 'Trop de messages aujourd''hui : écrivez-nous plutôt par courriel.';
  end if;
  perform set_config('reservations.signataire', coalesce(v_nom, 'Client'), true);
  insert into reservations.journal (reservation_id, genre, texte)
  values (r.id, 'courriel', 'Message reçu par la page client : ' || v_texte);
  if r.organisation_id is not null then
    insert into crm.echanges (organisation_id, reservation_id, contact_id, genre, texte, auteur_nom)
    values (r.organisation_id, r.id, r.contact_reservation_id, 'courriel',
      'Message reçu par la page client' || coalesce(' (' || v_nom || ')', '') || ' : ' || v_texte,
      coalesce(v_nom, 'Client') || ' (client)');
    insert into crm.relances (organisation_id, reservation_id, titre, echeance, assigne_a, auteur_nom)
    values (r.organisation_id, r.id, r.numero || ' : répondre au message du client',
      (now() at time zone 'America/Toronto')::date, r.responsable_id, coalesce(v_nom, 'Client') || ' (client)');
  end if;
end;
$$;

-- Chemin d'un document que le client peut télécharger (Worker seulement :
-- il en fait une adresse signée de quelques minutes).
create function reservations.document_client(p_jeton text, p_document uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.chemin
  from reservations.documents d
  join reservations.reservations r on r.id = d.reservation_id
  where r.jeton_client = p_jeton and length(p_jeton) = 48 and d.id = p_document
    and d.genre in ('estime', 'contrat', 'contrat_signe', 'pre_arrivee')
$$;

-- ------------------------------------------------------------
-- Fiches participants (Loi 25) : remplies par les parents et les adultes
-- du groupe par le lien /fiches/<jeton_fiches>. Lues seulement avec
-- l'accès « reservations_sante » ; le reste de l'équipe voit des totaux.
-- Effacées 3 mois après le départ (réglage fiches_conservation_mois),
-- sauf le courriel de qui a accepté de recevoir des nouvelles.
-- ------------------------------------------------------------
create table reservations.fiches (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations.reservations(id) on delete cascade,
  genre text not null check (genre in ('participant', 'adulte')),
  prenom text,
  nom text,
  -- Classe, groupe ou enseignant·e.
  groupe text,
  matricule text,
  -- « Allergies ou problèmes de santé connus ? »
  sante boolean,
  allergies text,
  problemes_sante text,
  epipen boolean,
  diete text check (diete in ('reguliere', 'vegetarienne', 'sans_porc', 'halal', 'sans_lactose', 'sans_gluten', 'autre')),
  diete_autre text,
  -- Médicaments en vente libre au besoin.
  medicaments boolean,
  courriel text,
  -- Accepte de recevoir des nouvelles de la BPA (Loi 25, loi anti-pourriel).
  nouvelles boolean not null default false,
  langue text not null default 'fr' check (langue in ('fr', 'en')),
  recue_le timestamptz not null default now(),
  effacee_le timestamptz
);

create index idx_reservations_fiches on reservations.fiches (reservation_id);

alter table reservations.fiches enable row level security;
grant select, update, delete on reservations.fiches to authenticated;
grant all on reservations.fiches to service_role;
create policy "Lire" on reservations.fiches for select to authenticated using (core.peut_lire('reservations_sante'));
create policy "Modifier" on reservations.fiches for update to authenticated
  using (core.peut_ecrire('reservations_sante')) with check (core.peut_ecrire('reservations_sante'));
create policy "Retirer" on reservations.fiches for delete to authenticated using (core.peut_ecrire('reservations_sante'));

insert into reservations.reglages (cle, valeur) values ('fiches_conservation_mois', '3')
on conflict (cle) do nothing;

-- Page des fiches : le groupe et ses dates, sans rien d'autre.
create function reservations.fiche_infos(p_jeton text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'numero', r.numero,
    'nom', r.nom,
    'forfait', r.forfait,
    'date_arrivee', r.date_arrivee,
    'date_depart', r.date_depart,
    'langue', r.langue,
    'ouverte', r.fermeture is null and r.date_depart >= (now() at time zone 'America/Toronto')::date,
    'compagnie', (
      select jsonb_build_object('nom', c.raison_sociale, 'logo', c.logo, 'courriel', c.courriel, 'telephone', c.telephone)
      from reservations.compagnies c where c.entreprise_id = r.compagnie_id))
  from reservations.reservations r
  where r.jeton_fiches = p_jeton and length(p_jeton) = 48
$$;

create function reservations.ajouter_fiche(p_jeton text, p_fiche jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r reservations.reservations;
  f jsonb := p_fiche;
  v_id uuid;
  v_sante boolean := (f ->> 'sante')::boolean;
  v_diete text := nullif(f ->> 'diete', '');
begin
  select * into r from reservations.reservations where jeton_fiches = p_jeton and length(p_jeton) = 48;
  if not found then
    raise exception 'Lien invalide.';
  end if;
  if r.fermeture is not null or r.date_depart < (now() at time zone 'America/Toronto')::date then
    raise exception 'Les fiches de ce séjour sont fermées.';
  end if;
  if (select count(*) from reservations.fiches x where x.reservation_id = r.id)
     >= 2 * (coalesce(r.nb_participants, 0) + coalesce(r.nb_accompagnateurs, 0)) + 20 then
    raise exception 'Nombre maximal de fiches atteint : communiquez avec nous.';
  end if;
  if btrim(coalesce(f ->> 'prenom', '')) = '' or btrim(coalesce(f ->> 'nom', '')) = '' then
    raise exception 'Le prénom et le nom sont obligatoires.';
  end if;

  insert into reservations.fiches (
    reservation_id, genre, prenom, nom, groupe, matricule, sante, allergies, problemes_sante,
    epipen, diete, diete_autre, medicaments, courriel, nouvelles, langue)
  values (
    r.id,
    coalesce(nullif(f ->> 'genre', ''), 'participant'),
    left(btrim(f ->> 'prenom'), 100),
    left(btrim(f ->> 'nom'), 100),
    left(nullif(btrim(f ->> 'groupe'), ''), 100),
    left(nullif(btrim(f ->> 'matricule'), ''), 50),
    v_sante,
    case when v_sante then left(nullif(btrim(f ->> 'allergies'), ''), 2000) end,
    case when v_sante then left(nullif(btrim(f ->> 'problemes_sante'), ''), 2000) end,
    case when v_sante then (f ->> 'epipen')::boolean end,
    v_diete,
    case when v_diete = 'autre' then left(nullif(btrim(f ->> 'diete_autre'), ''), 500) end,
    (f ->> 'medicaments')::boolean,
    left(nullif(lower(btrim(f ->> 'courriel')), ''), 200),
    coalesce((f ->> 'nouvelles')::boolean, false),
    coalesce(nullif(f ->> 'langue', ''), 'fr'))
  returning id into v_id;
  return v_id;
end;
$$;

-- Totaux pour l'équipe (et plus tard la Cuisine) : jamais un nom.
create function reservations.totaux_fiches(p_reservation uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when core.peut_lire('reservations') then jsonb_build_object(
    'recues', count(*),
    'participants', count(*) filter (where f.genre = 'participant'),
    'adultes', count(*) filter (where f.genre = 'adulte'),
    'sante', count(*) filter (where f.sante),
    'epipen', count(*) filter (where f.epipen),
    'sans_medicaments', count(*) filter (where f.medicaments = false),
    'effacees', count(*) filter (where f.effacee_le is not null),
    'dietes', (
      select coalesce(jsonb_object_agg(x.diete, x.n), '{}')
      from (select g.diete, count(*) as n from reservations.fiches g
            where g.reservation_id = p_reservation and g.diete is not null and g.diete <> 'reguliere'
            group by g.diete) x))
  end
  from reservations.fiches f
  where f.reservation_id = p_reservation
$$;

-- Effacement (Loi 25) : tout ce qui est nominatif ou de santé, N mois après
-- le départ ; le courriel reste seulement si la personne a accepté de
-- recevoir des nouvelles. Chaque jour par pg_cron.
create function reservations.effacer_fiches()
returns integer
language sql
security definer
set search_path = ''
as $$
  with effacees as (
    update reservations.fiches f set
      prenom = null, nom = null, groupe = null, matricule = null,
      sante = null, allergies = null, problemes_sante = null, epipen = null,
      diete = null, diete_autre = null, medicaments = null,
      courriel = case when f.nouvelles then f.courriel end,
      effacee_le = now()
    from reservations.reservations r
    where r.id = f.reservation_id and f.effacee_le is null
      and r.date_depart < (now() at time zone 'America/Toronto')::date - make_interval(months => coalesce(
        (select (g.valeur #>> '{}')::integer from reservations.reglages g where g.cle = 'fiches_conservation_mois'), 3))
    returning 1)
  select count(*)::integer from effacees
$$;

-- 8 h 30 UTC = 4 h 30 (heure de l'Est).
select cron.schedule('reservations-effacer-fiches', '30 8 * * *', $$ select reservations.effacer_fiches(); $$);

-- ------------------------------------------------------------
-- Droits des fonctions
-- ------------------------------------------------------------
revoke execute on function
  reservations.recevoir_demande(jsonb, jsonb),
  reservations.contact_demande(uuid, text, text, text, text),
  reservations.valider_demande(uuid, uuid, text),
  reservations.nouveau_lien(uuid, text),
  reservations.formulaire_public(),
  reservations.page_client(text),
  reservations.accepter_estime_client(text, uuid, text, boolean),
  reservations.message_client(text, text, text),
  reservations.document_client(text, uuid),
  reservations.fiche_infos(text),
  reservations.ajouter_fiche(text, jsonb),
  reservations.totaux_fiches(uuid),
  reservations.effacer_fiches()
from public;

grant execute on function
  reservations.formulaire_public(),
  reservations.page_client(text),
  reservations.accepter_estime_client(text, uuid, text, boolean),
  reservations.message_client(text, text, text),
  reservations.fiche_infos(text),
  reservations.ajouter_fiche(text, jsonb)
to anon, authenticated;

grant execute on function
  reservations.contact_demande(uuid, text, text, text, text),
  reservations.valider_demande(uuid, uuid, text),
  reservations.nouveau_lien(uuid, text),
  reservations.totaux_fiches(uuid)
to authenticated;

grant execute on function
  reservations.recevoir_demande(jsonb, jsonb),
  reservations.document_client(text, uuid),
  reservations.effacer_fiches()
to service_role;
