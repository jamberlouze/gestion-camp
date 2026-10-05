-- ============================================================
-- Subventions : plus de « critères communs » à tenir à jour à la main.
--
-- - Le contexte du groupe (liste des entreprises et statut juridique) est
--   maintenant produit par le Worker à partir de grant_companies : il suit
--   les ajouts d'entreprises sans rien écrire.
-- - La priorité aux subventions salariales et « ratisser large » font
--   partie du prompt fixe (comme dans la feuille de route), mais la
--   priorité salariale ne vaut que pour une entreprise qui embauche
--   (nouvelle colonne hires_staff).
-- - Il reste un réglage facultatif, consignes_groupe : une consigne de la
--   direction pour toutes les recherches, en attendant que la mémoire
--   l'apprenne d'elle-même.
-- ============================================================

alter table subventions.grant_companies
  add column hires_staff boolean not null default true;

comment on column subventions.grant_companies.hires_staff is
  'Embauche du personnel : la recherche donne alors la priorité absolue aux subventions salariales.';

-- La société qui détient les immeubles n'a pas d'employés propres.
update subventions.grant_companies set hires_staff = false
 where slug = 'base-de-plein-air-mont-tremblant-inc';

-- Critères communs → consignes pour tout le groupe. Texte d'origine encore
-- intact : on n'en garde que ce qui n'est dit nulle part ailleurs ; texte
-- modifié par la direction : repris tel quel.
insert into subventions.grant_settings (key, value)
select 'consignes_groupe',
       to_jsonb(case
         when value #>> '{}' like 'Contexte du groupe : Base de Plein Air Mont-Tremblant (OBNL), Opikawa (clients hors Québec, immersion française), Trembloc (bloc extérieur).%'
          and value #>> '{}' like '%Priorité absolue : les subventions salariales%'
         then 'Le groupe fait aussi du développement logiciel interne (programmes de R-D et de numérique possibles). Exclure les programmes réservés au secteur manufacturier.'
         else value #>> '{}'
       end)
  from subventions.grant_settings
 where key = 'criteres_communs'
on conflict (key) do nothing;

insert into subventions.grant_settings (key, value)
values ('consignes_groupe', to_jsonb(''::text))
on conflict (key) do nothing;

delete from subventions.grant_settings where key = 'criteres_communs';
