-- Réservations, phase 5 : courriels aux clients (plan §9).
-- Le Worker prépare chaque courriel une seule fois (une clé par événement :
-- estimé, signature, facture…), d'après courriels.ts ; quelqu'un de l'équipe
-- l'approuve d'un clic (mode par défaut, choix de Maxime du 2026-10-10), ou
-- il part seul si son type est en mode automatique. Envois depuis
-- inscriptions@ par l'API Gmail (Worker seulement) ; en DEV, dans Mailpit.

-- ------------------------------------------------------------
-- Modèles (un par type, en français et en anglais)
-- ------------------------------------------------------------

create table reservations.modeles_courriels (
  genre text primary key check (genre in ('accuse','estime','contrat','rappel_signature','facture','facture_finale','rappel_paiement','pre_arrivee','rappel_fiches','suivi')),
  -- approuver : préparé, envoyé d'un clic ; automatique : part seul ; desactive : jamais préparé.
  mode text not null default 'approuver' check (mode in ('approuver','automatique','desactive')),
  sujet_fr text not null check (btrim(sujet_fr) <> ''),
  corps_fr text not null check (btrim(corps_fr) <> ''),
  sujet_en text not null check (btrim(sujet_en) <> ''),
  corps_en text not null check (btrim(corps_en) <> ''),
  updated_at timestamptz not null default now(),
  updated_by_nom text,
  -- La pré-arrivée (PDF produit dans le navigateur) ne part pas seule.
  check (genre <> 'pre_arrivee' or mode <> 'automatique')
);

-- ------------------------------------------------------------
-- Courriels préparés et envoyés
-- ------------------------------------------------------------

create table reservations.courriels (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations.reservations(id) on delete cascade,
  genre text not null references reservations.modeles_courriels(genre),
  -- Un courriel par événement (« estime:<id> », « rappel_paiement:<facture>:1 »…) :
  -- jamais préparé deux fois, même annulé.
  cle text not null unique,
  -- Estimé, signature ou facture visé.
  ref uuid,
  statut text not null default 'prepare' check (statut in ('prepare','envoye','annule')),
  langue text not null default 'fr' check (langue in ('fr','en')),
  a text[] not null default '{}',
  cc text[] not null default '{}',
  sujet text not null check (btrim(sujet) <> ''),
  corps text not null check (btrim(corps) <> ''),
  prepare_le timestamptz not null default now(),
  envoye_le timestamptz,
  envoye_par_nom text,
  message_id text,
  annule_le timestamptz,
  annule_par_nom text,
  -- Pourquoi il a été annulé (« plus nécessaire » quand la base l'a fait).
  raison text,
  -- Dernier envoi raté ou destinataire manquant.
  erreur text,
  updated_at timestamptz not null default now()
);

create index idx_reservations_courriels_reservation on reservations.courriels (reservation_id, prepare_le);
create index idx_reservations_courriels_prepares on reservations.courriels (prepare_le) where statut = 'prepare';

-- L'équipe corrige un courriel préparé (destinataires, sujet, texte) ou
-- l'annule ; seul le Worker (sans session) l'envoie.
create function reservations.verifier_courriel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  if auth.uid() is null then
    return new;
  end if;
  if old.statut <> 'prepare' then
    raise exception 'Ce courriel est déjà envoyé ou annulé.';
  end if;
  if new.statut not in ('prepare', 'annule') then
    raise exception 'Un courriel ne part que par le bouton Envoyer.';
  end if;
  new.reservation_id := old.reservation_id;
  new.genre := old.genre;
  new.cle := old.cle;
  new.ref := old.ref;
  new.envoye_le := old.envoye_le;
  new.envoye_par_nom := old.envoye_par_nom;
  new.message_id := old.message_id;
  if new.statut = 'annule' then
    new.annule_le := now();
    new.annule_par_nom := reservations.nom_de(auth.uid());
  end if;
  return new;
end;
$$;

create trigger trg_reservations_courriels_verifier before update on reservations.courriels
for each row execute function reservations.verifier_courriel();

create function reservations.signer_modele_courriel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by_nom := reservations.nom_de(auth.uid());
  end if;
  return new;
end;
$$;

create trigger trg_reservations_modeles_courriels_signer before update on reservations.modeles_courriels
for each row execute function reservations.signer_modele_courriel();

alter table reservations.modeles_courriels enable row level security;
alter table reservations.courriels enable row level security;

create policy "Lire" on reservations.modeles_courriels for select to authenticated using (core.peut_lire('reservations'));
create policy "Modifier" on reservations.modeles_courriels for update to authenticated
  using (core.peut_ecrire('reservations')) with check (core.peut_ecrire('reservations'));
create policy "Lire" on reservations.courriels for select to authenticated using (core.peut_lire('reservations'));
create policy "Modifier" on reservations.courriels for update to authenticated
  using (core.peut_ecrire('reservations')) with check (core.peut_ecrire('reservations'));

grant select, update on reservations.modeles_courriels, reservations.courriels to authenticated;
grant all on reservations.modeles_courriels, reservations.courriels to service_role;

alter publication supabase_realtime add table reservations.courriels;

-- Seuls les événements à partir de ce jour reçoivent un courriel (pas d'envoi
-- en masse sur les réservations importées) : le jour de la mise en service.
insert into reservations.reglages (cle, valeur)
values ('courriels_depuis', to_jsonb((now() at time zone 'America/Toronto')::date::text))
on conflict (cle) do nothing;

-- ------------------------------------------------------------
-- Ce que le Worker lit et écrit (clé secrète seulement)
-- ------------------------------------------------------------

-- État des réservations à examiner (une, ou toutes celles qui sont encore
-- en cours ou qui ont une facture impayée) : de quoi décider quoi préparer.
create function reservations.courriels_etat(p_reservation uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'r', jsonb_build_object(
      'id', r.id, 'numero', r.numero, 'nom', r.nom, 'forfait', r.forfait, 'langue', r.langue,
      'date_arrivee', r.date_arrivee, 'date_depart', r.date_depart, 'signe_le', r.signe_le,
      'fermeture', r.fermeture, 'nb_participants', r.nb_participants, 'nb_accompagnateurs', r.nb_accompagnateurs,
      'acompte1_part', r.acompte1_part, 'acompte2_part', r.acompte2_part, 'compagnie_id', r.compagnie_id,
      'organisation_id', r.organisation_id, 'jeton_client', r.jeton_client, 'jeton_fiches', r.jeton_fiches,
      'courriel_direction', r.courriel_direction),
    'contact_reservation', (select jsonb_build_object('id', c.id, 'nom', c.nom, 'courriel', c.courriel) from crm.contacts c where c.id = r.contact_reservation_id),
    'contact_facturation', (select jsonb_build_object('id', c.id, 'nom', c.nom, 'courriel', c.courriel) from crm.contacts c where c.id = r.contact_facturation_id),
    'demande', (
      select jsonb_build_object('id', d.id, 'recue_le', d.recue_le, 'langue', d.langue,
        'courriel', d.reponses ->> 'resp_courriel',
        'nom', btrim(coalesce(d.reponses ->> 'resp_prenom', '') || ' ' || coalesce(d.reponses ->> 'resp_nom', '')))
      from reservations.demandes d where d.reservation_id = r.id order by d.recue_le desc limit 1),
    'estimes', (
      select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'version', e.version, 'statut', e.statut, 'envoye_le', e.envoye_le, 'total', e.total) order by e.version), '[]')
      from reservations.estimes e where e.reservation_id = r.id),
    'signatures', (
      select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'statut', s.statut, 'envoye_le', s.envoye_le, 'echeance', s.echeance, 'jeton', s.jeton) order by s.envoye_le), '[]')
      from reservations.signatures s where s.reservation_id = r.id),
    'factures', (
      select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'qbo_type', f.qbo_type, 'qbo_id', f.qbo_id, 'genre', f.genre, 'numero', f.numero,
        'date_facture', f.date_facture, 'echeance', f.echeance, 'total', f.total, 'solde', f.solde) order by f.date_facture, f.numero), '[]')
      from reservations.factures f where f.reservation_id = r.id and not f.supprimee),
    'devis_total', (select d.total from reservations.qbo_devis d where d.reservation_id = r.id),
    'fiches_recues', (select count(*) from reservations.fiches f where f.reservation_id = r.id),
    'courriels', (
      select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'cle', c.cle, 'genre', c.genre, 'statut', c.statut, 'ref', c.ref)), '[]')
      from reservations.courriels c where c.reservation_id = r.id)
  )), '[]')
  from reservations.reservations r
  where (p_reservation is not null and r.id = p_reservation)
     or (p_reservation is null and (
       r.date_depart >= current_date - 30
       or exists (select 1 from reservations.factures f where f.reservation_id = r.id and not f.supprimee and f.solde > 0)))
$$;

-- Courriels préparés par le Worker ; une clé déjà prise est ignorée.
create function reservations.courriels_ajouter(p_courriels jsonb)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  with ajoutes as (
    insert into reservations.courriels (reservation_id, genre, cle, ref, langue, a, cc, sujet, corps, erreur)
    select (x ->> 'reservation_id')::uuid, x ->> 'genre', x ->> 'cle', nullif(x ->> 'ref', '')::uuid, x ->> 'langue',
      array(select jsonb_array_elements_text(coalesce(x -> 'a', '[]'))),
      array(select jsonb_array_elements_text(coalesce(x -> 'cc', '[]'))),
      x ->> 'sujet', x ->> 'corps', x ->> 'erreur'
    from jsonb_array_elements(p_courriels) x
    on conflict (cle) do nothing
    returning id, genre
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'genre', genre)), '[]') from ajoutes
$$;

revoke execute on function
  reservations.verifier_courriel(),
  reservations.signer_modele_courriel(),
  reservations.courriels_etat(uuid),
  reservations.courriels_ajouter(jsonb)
from public;

grant execute on function reservations.courriels_etat(uuid), reservations.courriels_ajouter(jsonb) to service_role;

-- ------------------------------------------------------------
-- Modèles de départ (modifiables dans Réservations › Courriels)
-- ------------------------------------------------------------
-- Champs : {{responsable}}, {{groupe}}, {{numero}}, {{forfait}}, {{dates}},
-- {{date_limite}}, {{total}}, {{lien_client}}, {{lien_signature}},
-- {{echeance_signature}}, {{lien_fiches}}, {{fiches_recues}},
-- {{fiches_attendues}}, {{facture_numero}}, {{facture_montant}},
-- {{facture_solde}}, {{facture_echeance}}, {{compagnie}},
-- {{compagnie_court}}, {{compagnie_courriel}}, {{compagnie_telephone}},
-- {{reponse_interac}} ; {{#si champ}}…{{/si}} n'écrit le texte que si le
-- champ n'est pas vide.

insert into reservations.modeles_courriels (genre, sujet_fr, corps_fr, sujet_en, corps_en) values
('accuse',
 $t$Demande reçue — {{numero}}$t$,
 $t$Bonjour {{responsable}},

Nous avons bien reçu votre demande pour {{groupe}} ({{forfait}}, {{dates}}). Son numéro : {{numero}}.

Nous la regardons et vous revenons rapidement avec un estimé.

Au plaisir,
L'équipe de {{compagnie_court}}
{{compagnie_courriel}} · {{compagnie_telephone}}$t$,
 $t$Request received — {{numero}}$t$,
 $t$Hello {{responsable}},

We have received your request for {{groupe}} ({{forfait}}, {{dates}}). Its number: {{numero}}.

We are reviewing it and will get back to you shortly with an estimate.

Kind regards,
The {{compagnie_court}} team
{{compagnie_courriel}} · {{compagnie_telephone}}$t$),

('estime',
 $t$Votre estimé — {{groupe}} ({{numero}})$t$,
 $t$Bonjour {{responsable}},

Voici l'estimé de votre séjour ({{forfait}}, {{dates}}) : {{total}} taxes comprises. Le PDF est joint.

Vous pouvez le consulter et l'accepter en ligne sur votre page :
{{lien_client}}

Dès qu'il est accepté, nous vous envoyons le contrat à signer.

Au plaisir,
L'équipe de {{compagnie_court}}
{{compagnie_courriel}} · {{compagnie_telephone}}$t$,
 $t$Your estimate — {{groupe}} ({{numero}})$t$,
 $t$Hello {{responsable}},

Here is the estimate for your stay ({{forfait}}, {{dates}}): {{total}} including taxes. The PDF is attached.

You can review and accept it online on your page:
{{lien_client}}

Once it is accepted, we will send you the contract to sign.

Kind regards,
The {{compagnie_court}} team
{{compagnie_courriel}} · {{compagnie_telephone}}$t$),

('contrat',
 $t$Votre contrat à signer — {{numero}}$t$,
 $t$Bonjour {{responsable}},

Merci d'avoir accepté l'estimé. Voici le contrat de {{groupe}} ({{dates}}), à signer en ligne d'ici le {{echeance_signature}} :
{{lien_signature}}

La réservation est confirmée à la réception du premier versement. Sans signature dans les 7 jours, les dates pourraient être offertes à un autre groupe.

Au plaisir,
L'équipe de {{compagnie_court}}
{{compagnie_courriel}} · {{compagnie_telephone}}$t$,
 $t$Your contract to sign — {{numero}}$t$,
 $t$Hello {{responsable}},

Thank you for accepting the estimate. Here is the contract for {{groupe}} ({{dates}}), to be signed online by {{echeance_signature}}:
{{lien_signature}}

The reservation is confirmed once the first payment is received. Without a signature within 7 days, the dates may be offered to another group.

Kind regards,
The {{compagnie_court}} team
{{compagnie_courriel}} · {{compagnie_telephone}}$t$),

('rappel_signature',
 $t$Rappel : contrat à signer — {{numero}}$t$,
 $t$Bonjour {{responsable}},

Petit rappel : le contrat de {{groupe}} ({{dates}}) attend toujours votre signature, d'ici le {{echeance_signature}} :
{{lien_signature}}

Une question ? Répondez simplement à ce courriel.

Au plaisir,
L'équipe de {{compagnie_court}}
{{compagnie_courriel}} · {{compagnie_telephone}}$t$,
 $t$Reminder: contract to sign — {{numero}}$t$,
 $t$Hello {{responsable}},

A quick reminder: the contract for {{groupe}} ({{dates}}) is still waiting for your signature, by {{echeance_signature}}:
{{lien_signature}}

Any questions? Simply reply to this email.

Kind regards,
The {{compagnie_court}} team
{{compagnie_courriel}} · {{compagnie_telephone}}$t$),

('facture',
 $t$Facture {{facture_numero}} — {{groupe}} ({{numero}})$t$,
 $t$Bonjour {{responsable}},

Vous trouverez ci-joint la facture n° {{facture_numero}} de {{facture_montant}} pour {{groupe}} ({{dates}}), {{#si facture_echeance}}payable au plus tard le {{facture_echeance}}{{/si}}{{#si facture_sur_reception}}payable sur réception{{/si}}.

Paiement : virement Interac à {{compagnie_courriel}} (question : {{numero}}, réponse : {{reponse_interac}}), chèque à l'ordre de {{compagnie}} ou dépôt direct (spécimen à la fin du contrat). Vos factures sont aussi sur votre page :
{{lien_client}}

Au plaisir,
L'équipe de {{compagnie_court}}
{{compagnie_courriel}} · {{compagnie_telephone}}$t$,
 $t$Invoice {{facture_numero}} — {{groupe}} ({{numero}})$t$,
 $t$Hello {{responsable}},

Please find attached invoice #{{facture_numero}} for {{facture_montant}} for {{groupe}} ({{dates}}), {{#si facture_echeance}}due by {{facture_echeance}}{{/si}}{{#si facture_sur_reception}}payable upon receipt{{/si}}.

Payment: Interac e-Transfer to {{compagnie_courriel}} (question: {{numero}}, answer: {{reponse_interac}}), cheque payable to {{compagnie}} or direct deposit (specimen at the end of the contract). Your invoices are also on your page:
{{lien_client}}

Kind regards,
The {{compagnie_court}} team
{{compagnie_courriel}} · {{compagnie_telephone}}$t$),

('facture_finale',
 $t$Facture finale — {{groupe}} ({{numero}})$t$,
 $t$Bonjour {{responsable}},

Merci encore d'avoir choisi {{compagnie_court}} ! Voici la facture finale n° {{facture_numero}} de {{facture_montant}}, payable sur réception. Elle tient compte du nombre réel de participants et des ajouts au séjour.

Paiement : virement Interac à {{compagnie_courriel}} (question : {{numero}}, réponse : {{reponse_interac}}), chèque à l'ordre de {{compagnie}} ou dépôt direct. Vos factures sont aussi sur votre page :
{{lien_client}}

Au plaisir,
L'équipe de {{compagnie_court}}
{{compagnie_courriel}} · {{compagnie_telephone}}$t$,
 $t$Final invoice — {{groupe}} ({{numero}})$t$,
 $t$Hello {{responsable}},

Thank you again for choosing {{compagnie_court}}! Here is the final invoice #{{facture_numero}} for {{facture_montant}}, payable upon receipt. It reflects the actual number of participants and any additions to the stay.

Payment: Interac e-Transfer to {{compagnie_courriel}} (question: {{numero}}, answer: {{reponse_interac}}), cheque payable to {{compagnie}} or direct deposit. Your invoices are also on your page:
{{lien_client}}

Kind regards,
The {{compagnie_court}} team
{{compagnie_courriel}} · {{compagnie_telephone}}$t$),

('rappel_paiement',
 $t$Rappel de paiement — facture {{facture_numero}}$t$,
 $t$Bonjour {{responsable}},

Petit rappel : la facture n° {{facture_numero}} ({{groupe}}, {{numero}}) a un solde de {{facture_solde}}{{#si facture_echeance}}, dû le {{facture_echeance}}{{/si}}. Elle est jointe à nouveau. Si le paiement est déjà parti, merci, et ne tenez pas compte de ce message.

Paiement : virement Interac à {{compagnie_courriel}} (question : {{numero}}, réponse : {{reponse_interac}}), chèque à l'ordre de {{compagnie}} ou dépôt direct.

Au plaisir,
L'équipe de {{compagnie_court}}
{{compagnie_courriel}} · {{compagnie_telephone}}$t$,
 $t$Payment reminder — invoice {{facture_numero}}$t$,
 $t$Hello {{responsable}},

A quick reminder: invoice #{{facture_numero}} ({{groupe}}, {{numero}}) has a balance of {{facture_solde}}{{#si facture_echeance}}, due {{facture_echeance}}{{/si}}. It is attached again. If the payment is already on its way, thank you, and please disregard this message.

Payment: Interac e-Transfer to {{compagnie_courriel}} (question: {{numero}}, answer: {{reponse_interac}}), cheque payable to {{compagnie}} or direct deposit.

Kind regards,
The {{compagnie_court}} team
{{compagnie_courriel}} · {{compagnie_telephone}}$t$),

('pre_arrivee',
 $t$Préparer votre séjour — {{groupe}} ({{numero}})$t$,
 $t$Bonjour {{responsable}},

Votre séjour approche ({{dates}}) ! Le document de pré-arrivée est joint : horaire, matériel à apporter et informations pratiques.

Chaque élève et chaque adulte du groupe doit remplir sa fiche participant (allergies, diète, médicaments). Transmettez ce lien aux parents et aux accompagnateurs :
{{lien_fiches}}

Tout changement au nombre de participants doit nous parvenir au plus tard le {{date_limite}}.

Au plaisir,
L'équipe de {{compagnie_court}}
{{compagnie_courriel}} · {{compagnie_telephone}}$t$,
 $t$Getting ready for your stay — {{groupe}} ({{numero}})$t$,
 $t$Hello {{responsable}},

Your stay is coming up ({{dates}})! The pre-arrival document is attached: schedule, what to bring and practical information.

Every student and every adult in the group must fill out a participant form (allergies, diet, medication). Please share this link with parents and chaperones:
{{lien_fiches}}

Any change to the number of participants must reach us by {{date_limite}}.

Kind regards,
The {{compagnie_court}} team
{{compagnie_courriel}} · {{compagnie_telephone}}$t$),

('rappel_fiches',
 $t$Fiches participants à remplir — {{groupe}}$t$,
 $t$Bonjour {{responsable}},

Nous avons reçu {{fiches_recues}} fiche(s) participant sur {{fiches_attendues}} attendue(s) pour votre séjour ({{dates}}). Merci de rappeler aux parents et aux accompagnateurs de remplir la leur :
{{lien_fiches}}

Au plaisir,
L'équipe de {{compagnie_court}}
{{compagnie_courriel}} · {{compagnie_telephone}}$t$,
 $t$Participant forms to fill out — {{groupe}}$t$,
 $t$Hello {{responsable}},

We have received {{fiches_recues}} participant form(s) out of {{fiches_attendues}} expected for your stay ({{dates}}). Please remind parents and chaperones to fill out theirs:
{{lien_fiches}}

Kind regards,
The {{compagnie_court}} team
{{compagnie_courriel}} · {{compagnie_telephone}}$t$),

('suivi',
 $t$Merci ! — {{groupe}}$t$,
 $t$Bonjour {{responsable}},

Merci d'être venus nous voir ({{dates}}). Nous espérons que tout le groupe a passé un beau séjour. Vos commentaires nous aident à nous améliorer : n'hésitez pas à répondre à ce courriel.

Au plaisir de vous accueillir à nouveau !
L'équipe de {{compagnie_court}}
{{compagnie_courriel}} · {{compagnie_telephone}}$t$,
 $t$Thank you! — {{groupe}}$t$,
 $t$Hello {{responsable}},

Thank you for visiting us ({{dates}}). We hope the whole group had a great stay. Your feedback helps us improve: feel free to reply to this email.

We look forward to welcoming you again!
The {{compagnie_court}} team
{{compagnie_courriel}} · {{compagnie_telephone}}$t$);
