-- ============================================================
-- rh : bénévoles (réponse de Maxime du 2026-10-12 : « oui, la portion
-- embauche »). Un bénévole a une embauche de genre `benevolat` : même
-- dossier (coordonnées, santé, urgence, disponibilités, code d'éthique,
-- documents), sans paie ni échelon, et une entente de bénévolat au lieu
-- d'un contrat. Remplace la table Airtable « Volontariat » (vide).
-- ============================================================

alter table rh.embauches
  add column genre text not null default 'emploi' check (genre in ('emploi','benevolat')),
  -- Entente de bénévolat acceptée (le contrat d'un bénévole)
  add column entente_benevolat_le timestamptz;

-- Un bénévole n'a ni paie ni échelon.
alter table rh.embauches add constraint embauches_benevolat_sans_paie check (
  genre = 'emploi' or (echelon is null and remuneration is null and taux is null and vacances is null and type_employe is null and action_paie is null)
);

-- Le journal précise « bénévolat ».
create or replace function rh.journal_embauche()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quoi text;
begin
  if auth.uid() is null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    select concat_ws(' · ', s.nom, p.nom, coalesce(e.abreviation, e.nom),
                     case when new.echelon is not null then 'échelon ' || new.echelon end)
      into v_quoi
      from rh.saisons s
      left join rh.postes p on p.id = new.poste_id
      left join core.entreprises e on e.id = new.entreprise_id
     where s.id = new.saison_id;
    perform rh.journaliser(new.personne_id, new.candidature_id, new.id, 'embauche',
      case when new.genre = 'benevolat' then 'Bénévolat ajouté : ' else 'Embauche créée : ' end || v_quoi);
  elsif new.statut is distinct from old.statut then
    perform rh.journaliser(new.personne_id, new.candidature_id, new.id, 'embauche',
      case when new.genre = 'benevolat' then 'Bénévolat : ' else 'Embauche : ' end
      || rh.libelle_statut(old.statut) || ' → ' || rh.libelle_statut(new.statut));
  end if;
  return null;
end;
$$;
