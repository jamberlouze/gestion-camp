-- ============================================================
-- Réservations, phase 2 : documents (estimé, contrat, pré-arrivée) et
-- signature électronique du contrat (docs/plan-reservations.md, §5 et §8).
--
-- Les PDF sont produits par l'app (pdf-lib) à partir de modèles modifiables
-- (`modeles`) et des coordonnées de la compagnie qui facture
-- (`compagnies`), puis gardés dans le seau privé `reservations-documents`.
-- Un contrat envoyé est signé par le client sans compte, sur une page
-- publique ouverte par un jeton secret (`signatures`) : deux fonctions
-- `security definer` seulement sont permises au rôle anonyme.
-- ============================================================

-- ------------------------------------------------------------
-- Compagnies qui facturent : ce qui s'imprime sur les documents
-- ------------------------------------------------------------
create table reservations.compagnies (
  entreprise_id uuid primary key references core.entreprises(id) on delete restrict,
  raison_sociale text not null,
  -- Nom court employé dans le texte des contrats (« GBPA+ », « Opikawa »).
  nom_court text not null,
  adresse text not null,
  courriel text not null,
  telephone text not null,
  tps text,
  tvq text,
  reponse_interac text not null,
  signataire text not null,
  -- Image publique de l'app (dossier public/).
  logo text not null,
  -- Section « Le tout sera payable : » du contrat (gabarit, champs {{…}}).
  consignes_paiement text not null,
  -- Fichiers du seau privé imprimés en dernière page du contrat (spécimen
  -- de chèque, coordonnées de virement international…), avec leur titre.
  annexes jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create trigger trg_reservations_compagnies_updated_at before update on reservations.compagnies
for each row execute function core.maj_updated_at();

insert into reservations.compagnies (entreprise_id, raison_sociale, nom_court, adresse, courriel, telephone, tps, tvq, reponse_interac, signataire, logo, consignes_paiement)
select e.id, v.raison, v.court, '3595 rue Léonard, Mont-Tremblant, QC J8E 2A5', v.courriel, v.tel, v.tps, v.tvq, v.interac, 'Marco Patriarco', v.logo, v.paiement
from (values
  ('GBPA+', 'Gestion Base de Plein Air Mont-Tremblant +', 'GBPA+', 'inscriptions@camptremblant.com', '(819) 425-2461',
   '704647619 RT0001', '1230915446 TQ0001', 'BPAMT', '/reservations/logo-gbpa.png',
$p$- par virement bancaire
  - En utilisant le spécimen chèque à la dernière page du présent contrat
  - Veuillez nous notifier par courriel lorsque le paiement est émis
- par chèque
  - à l’ordre de {{compagnie}}
  - envoyé au {{compagnie_adresse}}
- en argent comptant
  - Prendre rendez-vous avec nous pour nous remettre l’argent en personne
  - Ne pas envoyer d’argent comptant par la poste
- par virement Interac à l’adresse {{compagnie_courriel}}
  - Message : {{numero}}
  - Question de sécurité : {{numero}}
  - Réponse à la question de sécurité : {{reponse_interac}}$p$),
  ('Opikawa', 'Opikawa inc', 'Opikawa', 'info@opikawa.com', '+1 (888) 890-2887',
   '764169736 RT0001', '1226925003 TQ0001', 'OPIMT', '/reservations/logo-opikawa.png',
$p$- par virement bancaire
  - En utilisant le spécimen chèque ou les coordonnées pour virement bancaire international à la dernière page du présent contrat
  - Veuillez nous notifier par courriel lorsque le paiement est effectué
- par chèque en CAD
  - à l’ordre de {{compagnie}}
  - envoyé au {{compagnie_adresse}}
- en argent comptant CAD
  - Prendre rendez-vous avec nous pour nous remettre l’argent en personne
  - Ne pas envoyer d’argent comptant par la poste
- par virement Interac à l’adresse {{compagnie_courriel}}
  - Message : {{numero}}
  - Question de sécurité : {{numero}}
  - Réponse à la question de sécurité : {{reponse_interac}}$p$)
) as v(nom, raison, court, courriel, tel, tps, tvq, interac, logo, paiement)
join core.entreprises e on e.nom = v.nom;

-- ------------------------------------------------------------
-- Modèles de documents (contrat par forfait, pré-arrivée)
-- ------------------------------------------------------------
create table reservations.modeles (
  id uuid primary key default gen_random_uuid(),
  genre text not null check (genre in ('contrat', 'pre_arrivee')),
  forfait text not null check (forfait in ('classe_nature','journee_plein_air','accueil_groupe','location_salle')),
  titre text not null,
  contenu text not null,
  updated_at timestamptz not null default now(),
  updated_by_nom text,
  unique (genre, forfait)
);

create function reservations.signer_modele()
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

create trigger trg_reservations_modeles_signer before insert or update on reservations.modeles
for each row execute function reservations.signer_modele();

-- ------------------------------------------------------------
-- Documents produits (PDF gardés dans le seau privé)
-- ------------------------------------------------------------
create table reservations.documents (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations.reservations(id) on delete cascade,
  genre text not null check (genre in ('estime', 'contrat', 'contrat_signe', 'pre_arrivee')),
  estime_id uuid references reservations.estimes(id) on delete set null,
  titre text not null,
  chemin text not null unique,
  -- Empreinte SHA-256 du PDF (preuve de ce qui a été envoyé ou signé).
  empreinte text not null,
  -- Contrat : page et position de la ligne « Signature » du client.
  meta jsonb not null default '{}',
  cree_le timestamptz not null default now(),
  cree_par uuid references core.profils(id) on delete set null,
  cree_par_nom text
);

create index idx_reservations_documents on reservations.documents (reservation_id, cree_le desc);

create function reservations.signer_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.cree_par := auth.uid();
    new.cree_par_nom := reservations.nom_de(auth.uid());
  end if;
  insert into reservations.journal (reservation_id, genre, texte, auteur, auteur_nom)
  values (new.reservation_id, 'document', new.titre || ' (PDF)', new.cree_par, new.cree_par_nom);
  return new;
end;
$$;

create trigger trg_reservations_documents_signer before insert on reservations.documents
for each row execute function reservations.signer_document();

-- ------------------------------------------------------------
-- Signature électronique du contrat
-- ------------------------------------------------------------
create table reservations.signatures (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations.reservations(id) on delete cascade,
  document_id uuid not null references reservations.documents(id) on delete cascade,
  -- Jeton secret de la page publique (48 caractères hexadécimaux).
  jeton text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  statut text not null default 'en_attente' check (statut in ('en_attente', 'signe', 'annule')),
  envoye_le timestamptz not null default now(),
  -- Le contrat demande une signature dans les 7 jours (rappel ; le lien reste valide).
  echeance date not null default ((now() at time zone 'America/Toronto')::date + 7),
  -- Adresse signée du PDF envoyé (lisible sans compte, 60 jours).
  adresse_pdf text not null,
  signe_le timestamptz,
  nom_signataire text,
  fonction_signataire text,
  -- Signature dessinée (PNG en data URL).
  image text,
  adresse_ip text,
  navigateur text,
  document_signe_id uuid references reservations.documents(id) on delete set null,
  check (statut <> 'signe' or (signe_le is not null and nom_signataire is not null and image is not null))
);

-- Une seule demande ouverte par réservation : la précédente est annulée.
create unique index reservations_signature_ouverte on reservations.signatures (reservation_id) where statut = 'en_attente';

-- Page publique : ce qu'il faut pour afficher le contrat à signer.
create function reservations.signature_publique(p_jeton text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'numero', r.numero,
    'groupe', r.nom,
    'compagnie', c.raison_sociale,
    'logo', c.logo,
    'courriel', c.courriel,
    'telephone', c.telephone,
    'statut', s.statut,
    'echeance', s.echeance,
    'adresse_pdf', s.adresse_pdf,
    'signe_le', s.signe_le,
    'nom_signataire', s.nom_signataire)
  from reservations.signatures s
  join reservations.reservations r on r.id = s.reservation_id
  left join reservations.compagnies c on c.entreprise_id = r.compagnie_id
  where s.jeton = p_jeton and length(p_jeton) = 48
$$;

-- Pendant une signature, le journal est au nom du client, même si la page
-- est ouverte dans un navigateur où quelqu'un de l'équipe est connecté.
create or replace function reservations.signer_journal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client text := nullif(current_setting('reservations.signataire', true), '');
begin
  if v_client is not null then
    new.auteur := null;
    new.auteur_nom := v_client || ' (client)';
  elsif auth.uid() is not null then
    new.auteur := auth.uid();
    new.auteur_nom := reservations.nom_de(auth.uid());
  end if;
  return new;
end;
$$;

-- Signature par le client : nom, signature dessinée et consentement ;
-- l'adresse IP et le navigateur viennent des en-têtes de la requête. La
-- réservation passe à « Confirmée » (le PDF signé est produit par l'app).
create function reservations.signer_contrat(p_jeton text, p_nom text, p_fonction text, p_image text, p_accepte boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s reservations.signatures;
  v_entetes json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
begin
  select * into s from reservations.signatures where jeton = p_jeton and length(p_jeton) = 48 for update;
  if not found then
    raise exception 'Lien de signature invalide.';
  end if;
  if s.statut <> 'en_attente' then
    raise exception 'Ce contrat n''est plus à signer.';
  end if;
  if not coalesce(p_accepte, false) then
    raise exception 'Il faut accepter le contrat pour le signer.';
  end if;
  if btrim(coalesce(p_nom, '')) = '' then
    raise exception 'Le nom du signataire est obligatoire.';
  end if;
  if p_image is null or p_image not like 'data:image/png;base64,%' or length(p_image) > 600000 then
    raise exception 'Signature invalide.';
  end if;
  perform set_config('reservations.signataire', btrim(p_nom), true);
  update reservations.signatures set
    statut = 'signe',
    signe_le = now(),
    nom_signataire = btrim(p_nom),
    fonction_signataire = nullif(btrim(coalesce(p_fonction, '')), ''),
    image = p_image,
    adresse_ip = split_part(coalesce(v_entetes ->> 'x-forwarded-for', v_entetes ->> 'x-real-ip', ''), ',', 1),
    navigateur = left(v_entetes ->> 'user-agent', 300)
  where id = s.id;
  update reservations.reservations set
    etape = case when etape in ('nouvelle','contact','estime_envoye','estime_accepte','contrat_envoye') then 'confirmee' else etape end,
    signe_le = coalesce(signe_le, (now() at time zone 'America/Toronto')::date)
  where id = s.reservation_id;
  insert into reservations.journal (reservation_id, genre, texte)
  values (s.reservation_id, 'document', 'Contrat signé électroniquement par ' || btrim(p_nom));
end;
$$;

revoke execute on function reservations.signature_publique(text), reservations.signer_contrat(text, text, text, text, boolean) from public;
grant execute on function reservations.signature_publique(text), reservations.signer_contrat(text, text, text, text, boolean) to anon, authenticated;
grant usage on schema reservations to anon;

-- ------------------------------------------------------------
-- Seau privé des documents (PDF, annexes des compagnies)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reservations-documents', 'reservations-documents', false, 20971520, array['application/pdf','image/png','image/jpeg'])
on conflict (id) do nothing;

create policy "Réservations : lire les documents" on storage.objects for select to authenticated
  using (bucket_id = 'reservations-documents' and core.peut_lire('reservations'));
create policy "Réservations : ajouter un document" on storage.objects for insert to authenticated
  with check (bucket_id = 'reservations-documents' and core.peut_ecrire('reservations'));
create policy "Réservations : remplacer un document" on storage.objects for update to authenticated
  using (bucket_id = 'reservations-documents' and core.peut_ecrire('reservations'));
create policy "Réservations : retirer un document" on storage.objects for delete to authenticated
  using (bucket_id = 'reservations-documents' and core.peut_ecrire('reservations'));

-- ------------------------------------------------------------
-- Droits
-- ------------------------------------------------------------
grant select, insert, update, delete on reservations.compagnies, reservations.modeles, reservations.documents, reservations.signatures to authenticated, service_role;

alter table reservations.compagnies enable row level security;
alter table reservations.modeles enable row level security;
alter table reservations.documents enable row level security;
alter table reservations.signatures enable row level security;

create policy "Lire" on reservations.compagnies for select to authenticated using (core.peut_lire('reservations'));
create policy "Écrire" on reservations.compagnies for all to authenticated
  using (core.peut_ecrire('reservations')) with check (core.peut_ecrire('reservations'));
create policy "Lire" on reservations.modeles for select to authenticated using (core.peut_lire('reservations'));
create policy "Écrire" on reservations.modeles for all to authenticated
  using (core.peut_ecrire('reservations')) with check (core.peut_ecrire('reservations'));
-- Documents : on en ajoute, on ne les réécrit pas (preuve) ; on peut en retirer.
create policy "Lire" on reservations.documents for select to authenticated using (core.peut_lire('reservations'));
create policy "Ajouter" on reservations.documents for insert to authenticated with check (core.peut_ecrire('reservations'));
create policy "Retirer" on reservations.documents for delete to authenticated using (core.peut_ecrire('reservations'));
create policy "Lire" on reservations.signatures for select to authenticated using (core.peut_lire('reservations'));
create policy "Écrire" on reservations.signatures for all to authenticated
  using (core.peut_ecrire('reservations')) with check (core.peut_ecrire('reservations'));

alter publication supabase_realtime add table
  reservations.compagnies, reservations.modeles, reservations.documents, reservations.signatures;

-- ------------------------------------------------------------
-- Modèles de départ : contrats 2026-27 et pré-arrivées des Sheets
-- (Google Docs d'autoCrat), avec les corrections convenues le 2026-10-08 :
-- acompte et facture finale payables sur réception, bris facturés à part,
-- tableau des lits tiré de Rooming, VFH/VFB, coquilles, restes de
-- copier-coller en Journée plein air, souper de la location de salle.
-- Syntaxe : voir l'aide de l'onglet Réglages › Modèles.
-- ------------------------------------------------------------
insert into reservations.modeles (genre, forfait, titre, contenu) values
('contrat', 'classe_nature', 'Contrat de service — Classe nature', $m$[[entete]]

### Résumé des informations du présent contrat
Arrivée : {{date_arrivee}}, {{heure_arrivee}}
Départ : {{date_depart}}, {{heure_depart}}
Nombre d’élèves : {{nb_participants}}
Nombre d’accompagnateurs : {{nb_accompagnateurs}}
Ratio d’animation : {{ratio}}
Âge/niveau scolaire des élèves : {{ages}}
Langue du groupe : {{langue}}
Déjeuners : {{dejeuners}} | Dîners : {{diners}} | Soupers : {{soupers}} | Nombre de repas total : {{total_repas}}
{{#si notes_contrat}}
### Notes au contrat
{{notes_contrat}}
{{/si}}

| Sous-total | {{sous_total}} |
| TPS (5 %) | {{tps}} |
| TVQ (9,975 %) | {{tvq}} |
| **Total** | **{{total}}** |
| 1er versement (25 %, payable sur réception de la facture) | {{montant_25}} |
| 2e versement (50 %, au plus tard le {{date_limite}}) | {{montant_50}} |
| 3e versement (25 %, payable sur réception de la facture finale) | {{montant_25}} +/- ajustements |

**Mont-Tremblant, le {{aujourdhui}}**
Les parties conviennent de ce qui suit :

## Objet du contrat
L’objet du présent contrat est de régir les modalités du séjour organisé par {{compagnie}} (ci-après « **{{compagnie_court}}** ») pour le groupe {{groupe}}, ci-haut mentionné dans l’en-tête (ci-après le « **Groupe** »), relatif à un séjour qui se déroulera du {{date_arrivee}} au {{date_depart}}, conformément aux conditions et obligations décrites dans le présent document.

## Composition du groupe
La composition du groupe sera telle que décrite ci-dessous.
| Nombre de participants | {{nb_participants}} |
| Nombre d’accompagnateurs | {{nb_accompagnateurs}} |
| Âge/niveau des participants | {{ages}} |
| Langue du groupe | {{langue}} |

## Durée du séjour
Le séjour est d’une durée de {{nb_jours}} jour(s) et de {{nb_nuits}} nuit(s).
Arrivée : {{date_arrivee}}, {{heure_arrivee}}
Départ : {{date_depart}}, {{heure_depart}}

## Hébergement
L’hébergement se fera dans les sections et sur les étages choisis par {{compagnie_court}}. Il s’agit d’un hébergement de type « camp de vacances » dans des chambres de 4 à 6 lits. Les lits sont superposés. Chaque chambre est munie d’un lavabo, d’un miroir et d’étagères pour les vêtements. Sur chaque étage se trouvent des toilettes et des douches partagées par les chambres de l’étage.
Le Groupe est responsable de répartir les participants dans les chambres. Le plan des étages et des chambres sera envoyé au Groupe pour préparer la répartition des participants 3 semaines avant l’arrivée du Groupe.
Chaque participant doit apporter un sac de couchage ou une literie complète, un oreiller et une taie d’oreiller ainsi que ses propres articles de toilette.
Le Groupe pourra utiliser le salon adjacent à la section louée.
Il se peut que d’autres sections ou bâtiments soient en location en même temps que votre groupe. Vous avez par contre l’exclusivité des étages qui vous sont attribués.

## Repas
Le contrat de services inclut les repas suivants aux heures indiquées ci-bas. Les responsables du Groupe doivent s’assurer que les parents de chaque participant remplissent dûment le questionnaire santé transmis par courriel au plus tard trois semaines avant l’arrivée, soit le {{date_limite}}. Un formulaire par professeur et accompagnateur doit aussi être complété. Ce formulaire est nécessaire pour faciliter la gestion des restrictions alimentaires et des allergies.
Les responsables du Groupe sont responsables de la gestion du groupe durant les repas. Il s’agit d’une période de pause pour les animateurs. Il s’agit d’un service de repas de type cafétéria.
| **Repas** | **Heures** | **Nombre** |
| Déjeuner | 8h00 | {{dejeuners}} |
| Dîner | 12h00 | {{diners}} |
| Souper | 17h30 | {{soupers}} |
| Total des repas | | {{total_repas}} |
Une collation par nuit est aussi offerte à 19h45 pour un total de {{collations}} collation(s) durant votre séjour.

## Animation
Si votre contrat de service inclut de l’animation des activités par les animateurs de {{compagnie_court}}, l’animation et la gestion du groupe seront assurées par les animateurs durant les périodes établies ci-bas. Le ratio d’animation entendu est de {{ratio}}. Les responsables du groupe pourront être appelés à aider l’équipe d’animation dans l’encadrement du groupe au besoin et devront être disponibles en tout temps durant le séjour.
Les périodes d’animation sont les suivantes :
- 9h00 à 12h00
- 13h00 à 16h30
- 18h30 à 20h00
Un horaire détaillé des activités sera envoyé trois semaines avant l’arrivée du Groupe.

## Coût du séjour
Le coût du séjour est celui mentionné dans l’estimé accepté par le responsable du Groupe précédemment et ci-joint en annexe.
Tout changement au nombre de participants doit être communiqué par courriel au minimum trois semaines (21 jours) avant le début du séjour, soit le {{date_limite}}, sans quoi les places seront facturées quand même. Dans tous les cas, si le nombre effectif de participants est inférieur à quatre-vingt-dix pour cent (90 %) du nombre de participants prévus à l’estimé, {{compagnie_court}} aura alors le droit de recevoir du Groupe quatre-vingt-dix pour cent (90 %) du coût total du séjour et des services prévus à l’estimé, soit {{montant_90}}.
Le prix ne sera pas ajusté à la baisse si des modifications sont effectuées par le Groupe sur le forfait individuel (nombre de jours, nuits, repas, etc.).
Si des ajouts doivent être effectués entre la signature du présent contrat et l’arrivée du groupe, un nouvel estimé vous sera envoyé dans les plus brefs délais. Si des ajouts sont effectués en cours de séjour, ceux-ci seront facturés directement et ce sans l’envoi d’un nouvel estimé. Ces frais seront directement portés à la facture finale. Les bris et les frais hors forfait feront l’objet d’une facture séparée.

## Paiement
Un dépôt de {{montant_25}}, représentant 25 % du montant total de l’estimé, est payable sur réception de la facture. La réservation est confirmée à la réception de ce paiement.
Un second paiement de {{montant_50}}, représentant 50 % du montant total de l’estimé, devra être versé au plus tard trois semaines (21 jours) avant le début du séjour, soit le {{date_limite}}.
La balance de {{montant_25}}, qui correspond aux 25 % restants du montant total de l’estimé, ainsi que tout ajustement qui aura eu lieu en cours de séjour, est payable sur réception de la facture finale, qui sera envoyée après le départ du groupe.
Un défaut de paiement pourrait entraîner l’annulation du séjour du groupe sans remboursement des sommes versées précédemment.
Le tout sera payable :
[[paiement]]

## Obligations du camp
1. {{compagnie_court}} s’engage à se conformer aux lois et règlements existants décrétés par les autorités fédérales, provinciales et municipales et à se doter si besoin est, de tous les permis et licences (ex. : classification de Tourisme Québec).
2. {{compagnie_court}} s’engage à fournir les services mentionnés dans le contrat pour la durée du séjour.
3. {{compagnie_court}} s’assure de rendre une personne disponible en tout temps pour répondre aux situations d’urgence.

## Obligations du Groupe
1. Le Groupe convient d’utiliser les lieux, le matériel et les équipements loués en personne prudente et diligente et de se comporter de façon à ne pas troubler le séjour des autres clients de {{compagnie_court}} le cas échéant.
2. Le Groupe s’engage à remettre les lieux, le matériel et les équipements dans le même état qu’ils étaient lorsqu’il en a pris possession, sauf les détériorations dues à leur usage normal. En cas de bris, le Groupe s’engage à rembourser la réparation ou le remplacement des biens endommagés.
3. Le Groupe s’engage à se conformer aux lois et règlements existants décrétés par les autorités fédérales, provinciales et municipales et à se doter si besoin est, de tous les permis et licences.
4. Le Groupe s’engage à obliger les participants de son groupe à se conformer aux règlements de {{compagnie_court}}. Si un participant se fait expulser pour un manquement grave aux règlements de {{compagnie_court}}, le responsable du Groupe en prendra charge.
5. Le Groupe reconnaît qu’il assume toute responsabilité pour les dommages que lui-même et les membres de son groupe pourraient causer aux lieux, matériels et aux équipements loués.
6. Le Groupe détient pour chaque participant une fiche santé. Cette fiche est accessible en tout temps par le responsable des premiers soins de l’école ou du camp.
7. Le Groupe convient de s’assurer que ses membres sont en excellente santé et peuvent participer aux activités sportives et de plein air indiquées au programme. À cet effet, le groupe s’engage à remettre à {{compagnie_court}} dès le début du séjour, une liste sur laquelle devront être inscrits les noms des participants affectés par des restrictions d’ordre physique ou intellectuel susceptibles d’affecter la nature des interventions du personnel du camp auprès des participants concernés.
8. Le Groupe reconnaît que {{compagnie_court}} n’est pas dépositaire des biens et effets personnels de ses membres et en conséquence, il dégage {{compagnie_court}} de toute responsabilité en cas de vol, bris ou détérioration desdits biens et effets personnels.
9. Le Groupe s’engage à remettre au Camp, trois semaines avant le début du séjour, la liste des participants telle que divisée par groupe, et leur répartition.
10. Le Groupe s’engage à transmettre aux participants la liste des effets personnels à amener au camp disponible sur le site internet de {{compagnie_court}}.
11. Les responsables du Groupe auront la charge de distribuer les médicaments aux participants le cas échéant.

## Divers
1. {{compagnie_court}} peut accueillir plusieurs groupes en même temps sur le site. Le Groupe aura une exclusivité des étages réservés. La cafétéria, les salles communes et les installations extérieures peuvent être partagées par plusieurs groupes.
2. Les transports et les itinéraires par autobus à l’arrivée et au départ sont organisés et à la charge de l’école.
3. Les responsables du Groupe reconnaissent que les parents des participants ont rempli le formulaire santé et que ces informations doivent être communiquées à {{compagnie_court}}.
4. Les responsables du Groupe reconnaissent que les parents ont donné leur accord pour la prise de photos et de vidéos lors de la signature du formulaire et reconnaissent que celles-ci pourront être utilisées à des fins promotionnelles.
5. Aucune nourriture ni breuvage ne sont tolérés dans les chambres.
6. Les responsables du Groupe auront la charge du lever et du coucher des enfants et de l’encadrement durant les repas et la nuit. Les animateurs sont en pause durant les repas.
7. {{compagnie_court}} s’engage à respecter les normes de sécurité en matière de ratio d’animation. En cas de pénurie de main-d’œuvre imprévue, {{compagnie_court}} se réserve le droit de modifier le ratio d’animation prévu et déploiera tous les efforts pour minimiser son impact. {{compagnie_court}} s’engage à réorganiser le programme de manière efficiente et sécuritaire, en veillant toujours à offrir une expérience enrichissante aux participants.
8. {{compagnie_court}} offrira au maximum ses activités régulières prévues à l’horaire. En raison de leur nature dépendante des conditions météorologiques, certaines activités planifiées dans le cadre du séjour peuvent être sujettes à des ajustements, des modifications ou à leur annulation totale en cas de conditions climatiques défavorables. {{compagnie_court}} s’engage à prendre en considération la sécurité et le bien-être des participants avant de décider d’apporter des changements à ces activités. Si les conditions météorologiques ne permettent pas la réalisation de certaines activités, {{compagnie_court}} ne peut être tenue responsable.
9. En cas de force majeure, telle que définie par la loi, libérant {{compagnie_court}} de ses obligations, {{compagnie_court}} ne pourra être tenue responsable des conséquences engendrées. Dans de tels cas, les Parties pourront réévaluer les modalités du contrat en toute bonne foi.
10. Toute modification au présent contrat devra se faire avec le consentement de {{compagnie_court}}.

## Politique d’annulation
Le Groupe peut, sur avis écrit transmis par courriel, résilier le présent contrat avant son entrée en vigueur selon les modalités suivantes :
- Si l’avis est transmis soixante (60) jours ou plus avant le début du séjour, {{compagnie_court}} conservera l’acompte reçu, soit {{montant_25}}, et le Groupe n’aura aucune autre somme à payer.
- Si l’avis est transmis entre le trentième et le soixantième jour précédant le début du séjour, {{compagnie_court}} conservera l’acompte reçu et le Groupe devra joindre à son avis un paiement de {{montant_35}}. Ce dernier montant plus l’acompte déjà versé représentent 60 % du montant du séjour et des services prévus à l’estimé, taxes applicables incluses.
- Si l’avis est transmis moins de trente (30) jours avant le début du séjour, {{compagnie_court}} conservera l’acompte et le Groupe devra joindre à son avis un paiement de {{montant_55}}. Ce dernier montant plus l’acompte déjà versé représentent 80 % du montant du séjour et des services prévus à l’estimé, taxes applicables incluses.

## Signature
Le présent contrat doit être signé par le responsable ou une autre personne en autorité de le signer dans les 7 jours de sa réception, sans quoi les dates réservées pourraient être libérées pour un autre groupe.
[[signatures]]$m$),

('contrat', 'journee_plein_air', 'Contrat de service — Journée plein air', $m$[[entete]]

### Résumé des informations du présent contrat
Date de la journée plein air : {{date_arrivee}}
Heure d’arrivée : {{heure_arrivee}}
Heure de départ : {{heure_depart}}
Nombre d’élèves : {{nb_participants}}
Nombre d’accompagnateurs : {{nb_accompagnateurs}}
Ratio d’animation : {{ratio}}
Âge/niveau scolaire des élèves : {{ages}}
Langue du groupe : {{langue}}
Dîner fourni par {{compagnie_court}} : {{service_repas}}
{{#si notes_contrat}}
### Notes au contrat
{{notes_contrat}}
{{/si}}

| Sous-total | {{sous_total}} |
| TPS (5 %) | {{tps}} |
| TVQ (9,975 %) | {{tvq}} |
| **Total** | **{{total}}** |
| 1er versement (25 %, payable sur réception de la facture) | {{montant_25}} |
| 2e versement (50 %, au plus tard le {{date_limite}}) | {{montant_50}} |
| 3e versement (25 %, payable sur réception de la facture finale) | {{montant_25}} +/- ajustements |

**Mont-Tremblant, le {{aujourdhui}}**
Les parties conviennent de ce qui suit :

## Objet du contrat
L’objet du présent contrat est de régir les modalités de la journée plein air organisée par {{compagnie}} (ci-après « **{{compagnie_court}}** ») pour le groupe {{groupe}}, ci-haut mentionné dans l’en-tête (ci-après le « **Groupe** »), qui se déroulera le {{date_arrivee}}, conformément aux conditions et obligations décrites dans le présent document.

## Composition du groupe
La composition du groupe sera telle que décrite ci-dessous.
| Nombre de participants | {{nb_participants}} |
| Nombre d’accompagnateurs | {{nb_accompagnateurs}} |
| Âge/niveau des participants | {{ages}} |
| Langue parlée | {{langue}} |

## Heures d’arrivée et de départ convenues
Arrivée : {{heure_arrivee}}
Départ : {{heure_depart}}

## Formulaire santé
Les responsables du Groupe doivent s’assurer que les parents de chaque participant remplissent dûment le questionnaire santé transmis par courriel au plus tard trois semaines avant l’arrivée, soit le {{date_limite}}. Un formulaire par professeur et accompagnateur doit aussi être complété. Ce formulaire est nécessaire pour faciliter la gestion des restrictions alimentaires et des allergies ainsi que pour collecter d’autres informations de santé et autorisations nécessaires.

## Repas
Si le Groupe a opté pour le service repas, le dîner sera servi à 12h00 à moins d’avis contraire de la part de {{compagnie_court}}.
Les responsables du Groupe sont responsables de la gestion du groupe durant le repas. Il s’agit d’une période de pause pour les animateurs. Il s’agit d’un service de repas de type cafétéria.
Si vous avez opté pour un forfait avec repas, une collation est aussi offerte en après-midi un peu avant le départ du groupe.

## Animation
Si votre contrat de service inclut de l’animation des activités par les animateurs de {{compagnie_court}}, l’animation et la gestion du groupe seront assurées par les animateurs durant les périodes établies ci-bas. Le ratio d’animation entendu est de {{ratio}}. Les responsables du groupe pourront être appelés à aider l’équipe d’animation dans l’encadrement du groupe au besoin et devront être disponibles en tout temps durant la journée.
Les périodes d’animation sont les suivantes :
- 9h00 à 12h00
- 13h00 à 15h00

## Coût de la journée
Le coût de la journée est celui mentionné dans l’estimé accepté par le responsable du Groupe précédemment et ci-joint en annexe.
Tout changement au nombre de participants doit être communiqué par courriel au minimum trois semaines (21 jours) avant la journée, soit le {{date_limite}}, sans quoi les places seront facturées quand même. Dans tous les cas, si le nombre effectif de participants est inférieur à quatre-vingt-dix pour cent (90 %) du nombre de participants prévus à l’estimé, {{compagnie_court}} aura alors le droit de recevoir du Groupe quatre-vingt-dix pour cent (90 %) du coût total de la journée et des services prévus à l’estimé, soit {{montant_90}}.
Le prix ne sera pas ajusté à la baisse si des modifications sont effectuées par le Groupe sur le forfait individuel.
Si des ajouts doivent être effectués entre la signature du présent contrat et l’arrivée du groupe, un nouvel estimé vous sera envoyé dans les plus brefs délais. Si des ajouts sont effectués pendant la journée, ceux-ci seront facturés directement et ce sans l’envoi d’un nouvel estimé. Ces frais seront directement portés à la facture finale. Les bris et les frais hors forfait feront l’objet d’une facture séparée.

## Paiement
Un dépôt de {{montant_25}}, représentant 25 % du montant total de l’estimé, est payable sur réception de la facture. La réservation est confirmée à la réception de ce paiement.
Un second paiement de {{montant_50}}, représentant 50 % du montant total de l’estimé, devra être versé au plus tard trois semaines (21 jours) avant la journée, soit le {{date_limite}}.
La balance de {{montant_25}}, qui correspond aux 25 % restants du montant total de l’estimé, ainsi que tout ajustement qui aura eu lieu pendant la journée, est payable sur réception de la facture finale, qui sera envoyée après la journée.
Un défaut de paiement pourrait entraîner l’annulation de la journée sans remboursement des sommes versées précédemment.
Le tout sera payable :
[[paiement]]

## Obligations du camp
1. {{compagnie_court}} s’engage à se conformer aux lois et règlements existants décrétés par les autorités fédérales, provinciales et municipales et à se doter si besoin est, de tous les permis et licences (ex. : classification de Tourisme Québec).
2. {{compagnie_court}} s’engage à fournir les services mentionnés dans le contrat pour la durée de la journée.
3. {{compagnie_court}} s’assure de rendre une personne disponible en tout temps pour répondre aux situations d’urgence.

## Obligations du Groupe
1. Le Groupe convient d’utiliser les lieux, le matériel et les équipements loués en personne prudente et diligente et de se comporter de façon à ne pas troubler la visite des autres clients de {{compagnie_court}} le cas échéant.
2. Le Groupe s’engage à remettre les lieux, le matériel et les équipements dans le même état qu’ils étaient lorsqu’il en a pris possession, sauf les détériorations dues à leur usage normal. En cas de bris, le Groupe s’engage à rembourser la réparation ou le remplacement des biens endommagés.
3. Le Groupe s’engage à se conformer aux lois et règlements existants décrétés par les autorités fédérales, provinciales et municipales et à se doter si besoin est, de tous les permis et licences.
4. Le Groupe s’engage à obliger les participants de son groupe à se conformer aux règlements de {{compagnie_court}}. Si un participant se fait expulser pour un manquement grave aux règlements de {{compagnie_court}}, le responsable du Groupe en prendra charge.
5. Le Groupe reconnaît qu’il assume toute responsabilité pour les dommages que lui-même et les membres de son groupe pourraient causer aux lieux, matériels et aux équipements loués.
6. Le Groupe détient pour chaque participant une fiche santé. Cette fiche est accessible en tout temps par le responsable des premiers soins de l’école ou du camp.
7. Le Groupe convient de s’assurer que ses membres sont en excellente santé et peuvent participer aux activités sportives et de plein air indiquées au programme. À cet effet, le groupe s’engage à remettre à {{compagnie_court}} dès l’arrivée, une liste sur laquelle devront être inscrits les noms des participants affectés par des restrictions d’ordre physique ou intellectuel susceptibles d’affecter la nature des interventions du personnel du camp auprès des participants concernés.
8. Le Groupe reconnaît que {{compagnie_court}} n’est pas dépositaire des biens et effets personnels de ses membres et en conséquence, il dégage {{compagnie_court}} de toute responsabilité en cas de vol, bris ou détérioration desdits biens et effets personnels.
9. Le Groupe s’engage à remettre au Camp, trois semaines avant la journée, la liste des participants telle que divisée par groupe.
10. Le Groupe s’engage à transmettre aux participants la liste des effets personnels à amener au camp disponible sur le site internet de {{compagnie_court}}.
11. Les responsables du Groupe auront la charge de distribuer les médicaments aux participants le cas échéant.

## Divers
1. {{compagnie_court}} peut accueillir plusieurs groupes en même temps sur le site. La cafétéria, les salles communes et les installations extérieures peuvent être partagées par plusieurs groupes.
2. Les transports et les itinéraires par autobus à l’arrivée et au départ sont organisés et à la charge de l’école.
3. Les responsables du Groupe reconnaissent que les parents des participants ont rempli le formulaire santé et que ces informations doivent être communiquées à {{compagnie_court}}.
4. Les responsables du Groupe reconnaissent que les parents ont donné leur accord pour la prise de photos et de vidéos lors de la signature du formulaire et reconnaissent que celles-ci pourront être utilisées à des fins promotionnelles.
5. Les responsables du Groupe auront la charge de l’encadrement des enfants durant le repas. Les animateurs sont en pause durant les repas.
6. {{compagnie_court}} s’engage à respecter les normes de sécurité en matière de ratio d’animation. En cas de pénurie de main-d’œuvre imprévue, {{compagnie_court}} se réserve le droit de modifier le ratio d’animation prévu et déploiera tous les efforts pour minimiser son impact. {{compagnie_court}} s’engage à réorganiser le programme de manière efficiente et sécuritaire, en veillant toujours à offrir une expérience enrichissante aux participants.
7. {{compagnie_court}} offrira au maximum ses activités régulières prévues à l’horaire. En raison de leur nature dépendante des conditions météorologiques, certaines activités planifiées peuvent être sujettes à des ajustements, des modifications ou à leur annulation totale en cas de conditions climatiques défavorables. {{compagnie_court}} s’engage à prendre en considération la sécurité et le bien-être des participants avant de décider d’apporter des changements à ces activités. Si les conditions météorologiques ne permettent pas la réalisation de certaines activités, {{compagnie_court}} ne peut être tenue responsable.
8. En cas de force majeure, telle que définie par la loi, libérant {{compagnie_court}} de ses obligations, {{compagnie_court}} ne pourra être tenue responsable des conséquences engendrées. Dans de tels cas, les Parties pourront réévaluer les modalités du contrat en toute bonne foi.
9. Toute modification au présent contrat devra se faire avec le consentement de {{compagnie_court}}.

## Politique d’annulation
Le Groupe peut, sur avis écrit transmis par courriel, résilier le présent contrat avant son entrée en vigueur selon les modalités suivantes :
- Si l’avis est transmis soixante (60) jours ou plus avant la journée, {{compagnie_court}} conservera l’acompte reçu, soit {{montant_25}}, et le Groupe n’aura aucune autre somme à payer.
- Si l’avis est transmis entre le trentième et le soixantième jour précédant la journée, {{compagnie_court}} conservera l’acompte reçu et le Groupe devra joindre à son avis un paiement de {{montant_35}}. Ce dernier montant plus l’acompte déjà versé représentent 60 % du montant de la journée et des services prévus à l’estimé, taxes applicables incluses.
- Si l’avis est transmis moins de trente (30) jours avant la journée, {{compagnie_court}} conservera l’acompte et le Groupe devra joindre à son avis un paiement de {{montant_55}}. Ce dernier montant plus l’acompte déjà versé représentent 80 % du montant de la journée et des services prévus à l’estimé, taxes applicables incluses.

## Signature
Le présent contrat doit être signé par le responsable ou une autre personne en autorité de le signer dans les 7 jours de sa réception, sans quoi la date réservée pourrait être libérée pour un autre groupe.
[[signatures]]$m$),

('contrat', 'accueil_groupe', 'Contrat de service — Accueil de groupe', $m$[[entete]]

### Résumé des informations du présent contrat
Arrivée : {{date_arrivee}}, {{heure_arrivee}}
Départ : {{date_depart}}, {{heure_depart}}
Nombre de personnes : {{nb_participants}}
Déjeuners : {{dejeuners}} | Dîners : {{diners}} | Soupers : {{soupers}} | Nombre de repas total : {{total_repas}}
[[etages]]
{{#si notes_contrat}}
### Notes au contrat
{{notes_contrat}}
{{/si}}

| Sous-total | {{sous_total}} |
| TPS (5 %) | {{tps}} |
| TVQ (9,975 %) | {{tvq}} |
| **Total** | **{{total}}** |
| 1er versement (25 %, payable sur réception de la facture) | {{montant_25}} |
| 2e versement (75 %, au plus tard le {{date_limite}}) | {{montant_75}} |

**Mont-Tremblant, le {{aujourdhui}}**
Les parties conviennent de ce qui suit :

## Objet du contrat
L’objet du présent contrat est de régir les modalités du séjour organisé par {{compagnie}} (ci-après « **{{compagnie_court}}** ») pour le groupe {{groupe}}, ci-haut mentionné dans l’en-tête (ci-après le « **Groupe** »), relatif à un séjour qui se déroulera du {{date_arrivee}} au {{date_depart}}, conformément aux conditions et obligations décrites dans le présent document.

## Durée du séjour
Le séjour est d’une durée de {{nb_nuits}} nuit(s).
Arrivée : {{date_arrivee}}, {{heure_arrivee}}
Départ : {{date_depart}}, {{heure_depart}}
Une personne responsable du Groupe doit arriver à l’heure d’arrivée prévue et sera en charge d’accueillir les personnes de son groupe et de leur transmettre les informations et les règlements pour le séjour.

## Hébergement
L’hébergement se fera sur les étages mentionnés, à moins d’avis contraire par {{compagnie_court}}. Le Groupe pourra utiliser les chambres lui étant réservées. Il s’agit d’un hébergement de type « camp de vacances » dans des chambres de 4 à 6 lits. Les lits sont superposés. Chaque chambre est munie d’un lavabo, d’un miroir et d’étagères pour les vêtements. Sur chaque étage se trouvent des toilettes et des douches partagées.
Le Groupe est responsable de répartir les participants dans les chambres. Le Groupe peut utiliser le plan des chambres joint pour préparer la répartition des participants avant l’arrivée si souhaité.
Chaque participant doit apporter un sac de couchage ou une literie complète, un oreiller et une taie d’oreiller ainsi que ses propres articles de toilette.
Le Groupe pourra utiliser le salon adjacent à la section louée.
Il se peut que d’autres sections ou bâtiments soient en location en même temps que votre groupe. Vous avez par contre l’exclusivité des étages qui vous sont attribués.
[[etages]]

## Repas
Si le Groupe a opté pour le service de repas, les repas sont servis aux heures indiquées ci-bas. Les responsables du Groupe doivent s’assurer que tous les participants (ou les parents des participants si mineurs) remplissent dûment les formulaires trois semaines avant l’arrivée, soit le {{date_limite}}. Ce formulaire est nécessaire pour faciliter la gestion des restrictions alimentaires et des allergies.
Les responsables auront la charge de faciliter la gestion du groupe durant les repas. Il s’agit d’un service de repas de type cafétéria.
| **Repas** | **Heures** | **Nombre** |
| Déjeuner | 8h00 | {{dejeuners}} |
| Dîner | 12h00 | {{diners}} |
| Souper | 17h30 | {{soupers}} |
| Total des repas | | {{total_repas}} |

## Coût du séjour
Le coût du séjour est celui mentionné dans l’estimé accepté par le responsable du Groupe précédemment et ci-joint en annexe.
Si le Groupe a opté pour le service de repas, tout changement au nombre de personnes doit être communiqué par courriel au minimum trois semaines (21 jours) avant le début du séjour, soit le {{date_limite}}, sans quoi les repas seront facturés quand même. Dans tous les cas, si le nombre effectif de repas est inférieur à quatre-vingt-dix pour cent (90 %) du nombre de repas prévus à l’estimé, {{compagnie_court}} aura alors le droit de recevoir du Groupe quatre-vingt-dix pour cent (90 %) du coût des repas prévus à l’estimé.
Le coût associé à l’hébergement ne sera pas ajusté à la baisse même si des modifications sont effectuées par le Groupe sur le nombre de personnes, et les sections et étages réservés demeureront les mêmes.
Si des ajouts doivent être effectués entre la signature du présent contrat et l’arrivée du groupe, un nouvel estimé vous sera envoyé dans les plus brefs délais. Si des ajouts sont effectués en cours de séjour, ceux-ci seront facturés directement et ce sans l’envoi d’un nouvel estimé. Ces frais seront directement portés à une facture finale. Les bris et les frais hors forfait feront l’objet d’une facture séparée.

## Paiement
Un dépôt de {{montant_25}}, représentant 25 % du montant total de l’estimé, est payable sur réception de la facture. La réservation est confirmée à la réception de ce paiement.
La balance de {{montant_75}}, représentant 75 % du montant total de l’estimé, devra être versée au plus tard trois semaines (21 jours) avant le début du séjour, soit le {{date_limite}}.
Un défaut de paiement pourrait entraîner l’annulation du séjour du groupe sans remboursement des sommes versées précédemment.
Le tout sera payable :
[[paiement]]

## Obligations du camp
1. {{compagnie_court}} s’engage à se conformer aux lois et règlements existants décrétés par les autorités fédérales, provinciales et municipales et à se doter si besoin est, de tous les permis et licences (ex. : classification de Tourisme Québec).
2. {{compagnie_court}} s’engage à fournir les services mentionnés dans le contrat pour la durée du séjour.
3. {{compagnie_court}} s’assure de rendre une personne disponible en tout temps pour répondre aux situations d’urgence.

## Obligations du Groupe
1. Le Groupe convient d’utiliser les lieux, le matériel et les équipements loués en personne prudente et diligente et de se comporter de façon à ne pas troubler le séjour des autres clients de {{compagnie_court}} le cas échéant.
2. Le Groupe s’engage à remettre les lieux, le matériel et les équipements dans le même état qu’ils étaient lorsqu’il en a pris possession, sauf les détériorations dues à leur usage normal. En cas de bris, le Groupe s’engage à rembourser la réparation ou le remplacement des biens endommagés.
3. Le Groupe s’engage à se conformer aux lois et règlements existants décrétés par les autorités fédérales, provinciales et municipales et à se doter si besoin est, de tous les permis et licences.
4. Le Groupe s’engage à obliger les participants de son groupe à se conformer aux règlements de {{compagnie_court}}. Si un participant se fait expulser pour un manquement grave aux règlements de {{compagnie_court}}, le responsable du Groupe en prendra charge.
5. Le Groupe reconnaît qu’il assume toute responsabilité pour les dommages que lui-même et les membres de son groupe pourraient causer aux lieux, matériels et aux équipements loués.
6. Le Groupe reconnaît que {{compagnie_court}} n’est pas dépositaire des biens et effets personnels de ses membres et en conséquence, il dégage {{compagnie_court}} de toute responsabilité en cas de vol, bris ou détérioration desdits biens et effets personnels.
7. Le Groupe s’engage à transmettre aux participants la liste des effets personnels à amener au camp disponible sur le site internet de {{compagnie_court}}.

## Dépôt de sécurité
À son arrivée, le Groupe s’engage à fournir un dépôt de sécurité de 2 000 $ par carte de crédit sous forme de transaction autorisée non facturée. Ce dépôt de sécurité servira à couvrir, au besoin, des dommages causés à l’immeuble ou aux biens de {{compagnie_court}} ou à couvrir les frais d’un ménage jugé exceptionnel.
Si aucun dommage n’est constaté, le dépôt de sécurité ne sera pas encaissé et sera relâché. Si des dommages sont constatés, le dépôt de sécurité sera encaissé en partie ou en totalité pour couvrir les frais associés.

## Divers
1. {{compagnie_court}} peut accueillir plusieurs groupes en même temps sur le site. Le Groupe aura une exclusivité des étages réservés. La cafétéria, les salles communes et les installations extérieures peuvent être partagées par plusieurs groupes.
2. Les responsables du Groupe reconnaissent que les participants ou les parents des participants ont rempli le formulaire santé et que ces informations doivent être communiquées à {{compagnie_court}}.
3. Les responsables du Groupe reconnaissent que les participants ou les parents des participants ont donné leur accord pour la prise de photos et de vidéos lors de la signature du formulaire et reconnaissent que celles-ci pourront être utilisées à des fins promotionnelles.
4. Aucune nourriture ni breuvage ne sont tolérés dans les chambres.
5. En cas de force majeure, telle que définie par la loi, libérant {{compagnie_court}} de ses obligations, {{compagnie_court}} ne pourra être tenue responsable des conséquences engendrées. Dans de tels cas, les Parties pourront réévaluer les modalités du contrat en toute bonne foi.
6. Toute modification au présent contrat devra se faire avec le consentement de {{compagnie_court}}.

## Politique d’annulation
Le Groupe peut, sur avis écrit transmis par courriel, résilier le présent contrat avant son entrée en vigueur selon les modalités suivantes :
- Si l’avis est transmis soixante (60) jours ou plus avant le début du séjour, {{compagnie_court}} conservera l’acompte reçu, soit {{montant_25}}, et le Groupe n’aura aucune autre somme à payer.
- Si l’avis est transmis entre le trentième et le soixantième jour précédant le début du séjour, {{compagnie_court}} conservera l’acompte reçu et le Groupe devra joindre à son avis un paiement de {{montant_35}}. Ce dernier montant plus l’acompte déjà versé représentent 60 % du montant du séjour et des services prévus à l’estimé, taxes applicables incluses.
- Si l’avis est transmis moins de trente (30) jours avant le début du séjour, {{compagnie_court}} conservera l’acompte et le Groupe devra joindre à son avis un paiement de {{montant_55}}. Ce dernier montant plus l’acompte déjà versé représentent 80 % du montant du séjour et des services prévus à l’estimé, taxes applicables incluses.

## Signature
Le présent contrat doit être signé par le responsable ou d’autres personnes en autorité de le signer dans les 7 jours de sa réception, sans quoi les dates réservées pourraient être libérées pour un autre groupe.
[[signatures]]$m$),

('contrat', 'location_salle', 'Contrat de service — Location de salle', $m$[[entete]]

### Résumé des informations du présent contrat
Date de la location : {{date_arrivee}}
Heure d’arrivée : {{heure_arrivee}}
Heure de départ : {{heure_depart}}
Nombre de personnes : {{nb_participants}}
Dîners fournis par {{compagnie_court}} : {{diners}}
Soupers fournis par {{compagnie_court}} : {{soupers}}
[[salles]]
{{#si notes_contrat}}
### Notes au contrat
{{notes_contrat}}
{{/si}}

| Sous-total | {{sous_total}} |
| TPS (5 %) | {{tps}} |
| TVQ (9,975 %) | {{tvq}} |
| **Total** | **{{total}}** |
| 1er versement (25 %, payable sur réception de la facture) | {{montant_25}} |
| 2e versement (75 %, au plus tard le {{date_limite}}) | {{montant_75}} |

**Mont-Tremblant, le {{aujourdhui}}**
Les parties conviennent de ce qui suit :

## Objet du contrat
L’objet du présent contrat est de régir les modalités de la location de salle par {{compagnie}} (ci-après « **{{compagnie_court}}** ») pour le groupe {{groupe}}, ci-haut mentionné dans l’en-tête (ci-après le « **Groupe** »), qui se déroulera le {{date_arrivee}}, conformément aux conditions et obligations décrites dans le présent document.

## Date, heure d’arrivée et heure de départ
La location a lieu à la date et aux heures suivantes :
Date : {{date_arrivee}}
Arrivée : {{heure_arrivee}}
Départ : {{heure_depart}}

## Location de salle
Les salles mentionnées ci-bas sont celles louées par le Groupe, à moins d’avis contraire. Le Groupe pourra utiliser les salles lui étant réservées durant les heures prévues au présent contrat.
Le Groupe est responsable de fournir tout le matériel non spécifiquement décrit dans le présent contrat.
Le Groupe pourra utiliser les toilettes sur l’étage de la salle louée. Les douches et les chambres sur ces étages ne sont pas accessibles.
Il se peut que d’autres sections ou bâtiments soient en location en même temps que votre groupe. Vous avez par contre l’exclusivité des salles qui vous sont attribuées.
[[salles]]

## Repas
Si le contrat de services inclut des repas, ceux-ci seront servis aux heures indiquées ci-bas. Les responsables du Groupe doivent s’assurer que tous les participants ou les parents des participants remplissent dûment les formulaires trois semaines avant la location, soit le {{date_limite}}. Cet envoi est nécessaire pour faciliter la gestion des restrictions alimentaires et des allergies.
Les responsables auront la charge de faciliter la gestion du groupe durant les repas. Il s’agit d’un service de repas de type cafétéria.
| **Repas** | **Heures** | **Nombre** |
| Dîner | 12h00 | {{diners}} |
| Souper | 17h30 | {{soupers}} |
| Total des repas | | {{total_repas}} |

## Coût de la location
Le coût de la location de salle est celui mentionné dans l’estimé accepté par le responsable du Groupe précédemment et ci-joint en annexe.
Si le Groupe a opté pour le service de repas, tout changement au nombre de personnes doit être communiqué par courriel au minimum trois semaines (21 jours) avant la location, soit le {{date_limite}}, sans quoi les repas seront facturés quand même. Dans tous les cas, si le nombre effectif de repas est inférieur à quatre-vingt-dix pour cent (90 %) du nombre de repas prévus à l’estimé, {{compagnie_court}} aura alors le droit de recevoir du Groupe quatre-vingt-dix pour cent (90 %) du coût des repas prévus à l’estimé.
Le coût associé à la location de la salle ne sera pas ajusté à la baisse même si des modifications sont effectuées par le Groupe sur le nombre de personnes.
Si des ajouts doivent être effectués entre la signature du présent contrat et la location, un nouvel estimé vous sera envoyé dans les plus brefs délais. Si des ajouts sont effectués pendant la location, ceux-ci seront facturés directement et ce sans l’envoi d’un nouvel estimé. Ces frais seront directement portés à une facture finale. Les bris et les frais hors forfait feront l’objet d’une facture séparée.

## Paiement
Un dépôt de {{montant_25}}, représentant 25 % du montant total de l’estimé, est payable sur réception de la facture. La réservation est confirmée à la réception de ce paiement.
La balance de {{montant_75}}, représentant 75 % du montant total de l’estimé, devra être versée au plus tard trois semaines (21 jours) avant la location, soit le {{date_limite}}.
Un défaut de paiement pourrait entraîner l’annulation de la location sans remboursement des sommes versées précédemment.
Le tout sera payable :
[[paiement]]

## Obligations du camp
1. {{compagnie_court}} s’engage à se conformer aux lois et règlements existants décrétés par les autorités fédérales, provinciales et municipales et à se doter si besoin est, de tous les permis et licences (ex. : classification de Tourisme Québec).
2. {{compagnie_court}} s’engage à fournir les services mentionnés dans le contrat pour la durée de la location.
3. {{compagnie_court}} s’assure de rendre une personne disponible en tout temps pour répondre aux situations d’urgence.

## Obligations du Groupe
1. Le Groupe convient d’utiliser les lieux, le matériel et les équipements loués en personne prudente et diligente et de se comporter de façon à ne pas troubler le séjour des autres clients de {{compagnie_court}} le cas échéant.
2. Le Groupe s’engage à remettre les lieux, le matériel et les équipements dans le même état qu’ils étaient lorsqu’il en a pris possession, sauf les détériorations dues à leur usage normal. En cas de bris, le Groupe s’engage à rembourser la réparation ou le remplacement des biens endommagés.
3. Le Groupe s’engage à se conformer aux lois et règlements existants décrétés par les autorités fédérales, provinciales et municipales et à se doter si besoin est, de tous les permis et licences.
4. Le Groupe s’engage à obliger les participants de son groupe à se conformer aux règlements de {{compagnie_court}}. Si un participant se fait expulser pour un manquement grave aux règlements de {{compagnie_court}}, le responsable du Groupe en prendra charge.
5. Le Groupe reconnaît qu’il assume toute responsabilité pour les dommages que lui-même et les membres de son groupe pourraient causer aux lieux, matériels et aux équipements loués.
6. Le Groupe reconnaît que {{compagnie_court}} n’est pas dépositaire des biens et effets personnels de ses membres et en conséquence, il dégage {{compagnie_court}} de toute responsabilité en cas de vol, bris ou détérioration desdits biens et effets personnels.

## Dépôt de sécurité
À son arrivée, le Groupe s’engage à fournir un dépôt de sécurité de 1 000 $ par carte de crédit sous forme de transaction autorisée non facturée. Ce dépôt de sécurité servira à couvrir, au besoin, des dommages causés à l’immeuble ou aux biens de {{compagnie_court}} ou à couvrir les frais d’un ménage jugé exceptionnel.
Si aucun dommage n’est constaté, le dépôt de sécurité ne sera pas encaissé et sera relâché. Si des dommages sont constatés, le dépôt de sécurité sera encaissé en partie ou en totalité pour couvrir les frais associés.

## Divers
1. {{compagnie_court}} peut accueillir plusieurs groupes en même temps sur le site. Le Groupe aura une exclusivité des salles réservées. Les installations extérieures peuvent être partagées.
2. Les responsables du Groupe reconnaissent que les participants ou les parents des participants mineurs ont donné leur accord pour la prise de photos et de vidéos lors de la signature du formulaire et reconnaissent que celles-ci pourront être utilisées à des fins promotionnelles.
3. En cas de force majeure, telle que définie par la loi, libérant {{compagnie_court}} de ses obligations, {{compagnie_court}} ne pourra être tenue responsable des conséquences engendrées. Dans de tels cas, les Parties pourront réévaluer les modalités du contrat en toute bonne foi.
4. Toute modification au présent contrat devra se faire avec le consentement de {{compagnie_court}}.

## Politique d’annulation
Le Groupe peut, sur avis écrit transmis par courriel, résilier le présent contrat avant son entrée en vigueur selon les modalités suivantes :
- Si l’avis est transmis soixante (60) jours ou plus avant le début de la location, {{compagnie_court}} conservera l’acompte reçu, soit {{montant_25}}, et le Groupe n’aura aucune autre somme à payer.
- Si l’avis est transmis entre le trentième et le soixantième jour précédant le début de la location, {{compagnie_court}} conservera l’acompte reçu et le Groupe devra joindre à son avis un paiement de {{montant_35}}. Ce dernier montant plus l’acompte déjà versé représentent 60 % du montant de la location et des services prévus à l’estimé, taxes applicables incluses.
- Si l’avis est transmis moins de trente (30) jours avant le début de la location, {{compagnie_court}} conservera l’acompte et le Groupe devra joindre à son avis un paiement de {{montant_55}}. Ce dernier montant plus l’acompte déjà versé représentent 80 % du montant de la location et des services prévus à l’estimé, taxes applicables incluses.

## Signature
Le présent contrat doit être signé par le responsable ou d’autres personnes en autorité de le signer dans les 7 jours de sa réception, sans quoi la date réservée pourrait être libérée pour un autre groupe.
[[signatures]]$m$),

('pre_arrivee', 'classe_nature', 'Pré-arrivée — Classe nature', $m$# {{groupe}}
Réservation {{numero}}
Responsable du groupe sur place pendant le séjour : {{responsable}} — {{telephone}}

### Résumé de vos informations. Merci de confirmer le tout :
Arrivée : {{date_arrivee}}, {{heure_arrivee}}
Départ : {{date_depart}}, {{heure_depart}}
Nombre d’élèves : {{nb_participants}}
Nombre d’accompagnateurs : {{nb_accompagnateurs}}
Âge/niveau scolaire des élèves : {{ages}}
Ratio : {{ratio}}
Langue du groupe : {{langue}}
Déjeuners : {{dejeuners}} | Dîners : {{diners}} | Soupers : {{soupers}} | Nombre de repas total : {{total_repas}}

**_Veuillez nous signaler tout changement dès que possible._**
_Pour rappel, le nombre total de participants ne peut pas être modifié de plus ou moins 10 %. Il est toutefois possible de faire une demande de modification du ratio d’encadrement, sans garantie d’acceptation. Les ratios disponibles sont de 1:10, 1:15 ou 1:20._
_Vous trouverez à la page suivante un résumé des éléments importants mentionnés au contrat, à partager à toute l’équipe accompagnatrice pour ce séjour._
[[saut]]
# Informations importantes
**À partager à tous les accompagnateurs du groupe**

### Animation
- 9h00 à 12h00
- 13h00 à 16h30
- 18h30 à 20h00
Les accompagnateurs doivent rester disponibles en tout temps.
Les accompagnateurs sont responsables du coucher et du réveil le lendemain.
L’horaire sera envoyé lorsque les informations finales du groupe seront confirmées.

### Hébergement
Il est de votre responsabilité de faire la répartition des chambres selon le plan des étages.
À apporter obligatoirement :
- Sac de couchage ou literie complète
- Oreiller et taie
- Articles de toilette

### Repas
- Déjeuner : 8h00
- Dîner : 12h00
- Souper : 17h30
- Collation : 19h45
Service de type cafétéria.
Les responsables de l’école doivent assurer la supervision du groupe durant les repas.

### Formulaires santé (obligatoire)
- À compléter pour tous les participants ET les accompagnateurs
- Lien envoyé par courriel à l’enseignant ou l’enseignante responsable
- **Date limite : {{date_limite}}**$m$),

('pre_arrivee', 'journee_plein_air', 'Pré-arrivée — Journée plein air', $m$# {{groupe}}
Réservation {{numero}}
Responsable du groupe sur place pendant la journée : {{responsable}} — {{telephone}}

### Résumé de vos informations. Merci de confirmer le tout :
Jour de la sortie : {{date_arrivee}}
Arrivée : {{heure_arrivee}}
Départ : {{heure_depart}}
Nombre d’élèves : {{nb_participants}}
Nombre d’accompagnateurs : {{nb_accompagnateurs}}
Âge/niveau scolaire des élèves : {{ages}}
Ratio : {{ratio}}
Langue du groupe : {{langue}}
Service cafétéria pour le dîner : {{service_repas}}

**_Veuillez nous signaler tout changement dès que possible._**
_Pour rappel, le nombre total de participants ne peut pas être modifié de plus ou moins 10 %. Il est toutefois possible de faire une demande de modification du ratio d’encadrement, sans garantie d’acceptation. Les ratios disponibles sont de 1:10, 1:15 ou 1:20._
_Vous trouverez à la page suivante un résumé des éléments importants mentionnés au contrat, à partager à toute l’équipe accompagnatrice pour cette journée._
[[saut]]
# Informations importantes
**À partager à tous les accompagnateurs du groupe**

### Animation
- 9h00 à 12h00
- 13h00 à 15h00
Les accompagnateurs doivent rester disponibles sur le site en tout temps.
L’horaire sera envoyé lorsque les informations finales du groupe seront confirmées.

### Matériel
- Activités aquatiques : maillot de bain, serviette de plage, gougounes ou crocs
- Activités en forêt : chaussures fermées obligatoires
- À avoir en tout temps : chasse-moustiques, crème solaire, casquette ou chapeau, et gourde d’eau
Prévoir des vêtements adaptés à la météo (par exemple : chandail chaud, imperméable au besoin).

### Repas
- Dîner : 12h00
Les responsables de l’école doivent assurer la supervision du groupe durant le repas.

### Formulaires santé (obligatoire)
- À compléter pour tous les participants ET les accompagnateurs
- Lien envoyé par courriel à l’enseignant ou l’enseignante responsable
- **Date limite : {{date_limite}}**$m$);
