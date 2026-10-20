-- ============================================================
-- temps : soumission automatique des feuilles (décision de Maxime du
-- 2026-10-20 : « le mardi suivant la fin de la période de paie à midi »).
--
-- Une feuille jamais soumise restait « ouverte » pour toujours : son auteur
-- pouvait en changer les heures même après la paie, sans trace, et personne
-- ne pouvait l'approuver. Maintenant, une feuille encore ouverte à son
-- échéance est soumise par la base, comme si son auteur l'avait fait :
-- elle se gèle pour lui et arrive dans À approuver.
--
--   échéance = le mardi qui suit la fin de la période (début + 16 jours),
--              à midi, heure de Montréal ;
--   renvoyée = elle a jusqu'au premier mardi midi au moins 24 h après le
--              renvoi (jamais avant l'échéance de sa période) ;
--   visées   = les feuilles qui ont au moins une heure saisie (0 compris)
--              ou une note : comptes actifs de la direction (un admin ne
--              passe pas par l'approbation) et employés qui remplissent leur
--              feuille (temps.feuilles_propres), par compagnie ; une feuille
--              vide n'est pas soumise (des heures ajoutées plus tard à une
--              période échue partent en approbation au passage suivant).
--
-- Passage aux 15 minutes (pg_cron). Journal : genre « soumission », sans
-- auteur, auteur_nom « Automatique ». Mêmes règles côté app :
-- src/modules/temps/echeance.ts.
-- ============================================================

-- Premier mardi à midi (heure de Montréal) à p_moment ou après.
create function temps.mardi_midi_suivant(p_moment timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select ((l.jour + (9 - extract(isodow from l.jour)::int) % 7
           + case when extract(isodow from l.jour) = 2 and l.heure > time '12:00' then 7 else 0 end)
          + time '12:00') at time zone 'America/Toronto'
    from (select (p_moment at time zone 'America/Toronto')::date as jour,
                 (p_moment at time zone 'America/Toronto')::time as heure) l
$$;

-- Échéance de la feuille d'une période (p_debut = son dimanche), compte tenu
-- de son dernier renvoi.
create function temps.echeance_soumission(p_debut date, p_dernier_renvoi timestamptz default null)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select greatest(
    ((p_debut + 16) + time '12:00') at time zone 'America/Toronto',
    temps.mardi_midi_suivant(p_dernier_renvoi + interval '24 hours'))
$$;

-- Soumet les feuilles échues ; rend le nombre de feuilles soumises.
-- p_maintenant : pour les essais seulement (jamais exposée aux comptes).
create function temps.soumettre_feuilles_echues(p_maintenant timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_id uuid;
  v_n integer := 0;
  v_texte constant text := 'Pas soumise avant l''échéance du mardi midi.';
begin
  -- Direction.
  for r in
    select c.user_id, c.debut
      from (select h.user_id, temps.debut_periode(h.jour) as debut from temps.heures h
            union
            select f.user_id, f.debut from temps.feuilles f where f.note is not null) c
      join core.profils p on p.id = c.user_id and p.actif and p.role = 'direction'
      left join temps.feuilles f on f.user_id = c.user_id and f.debut = c.debut
     where coalesce(f.statut, 'ouverte') = 'ouverte'
       and temps.echeance_soumission(c.debut,
             (select max(j.created_at) from temps.journal j where j.feuille_id = f.id and j.genre = 'renvoi'))
           <= p_maintenant
  loop
    insert into temps.feuilles (user_id, debut) values (r.user_id, r.debut)
    on conflict (user_id, debut) do nothing;
    update temps.feuilles f set statut = 'soumise', updated_at = now(), updated_by = null
     where f.user_id = r.user_id and f.debut = r.debut and f.statut = 'ouverte'
    returning f.id into v_id;
    if found then
      insert into temps.journal (feuille_id, genre, texte, auteur, auteur_nom)
      values (v_id, 'soumission', v_texte, null, 'Automatique');
      v_n := v_n + 1;
    end if;
  end loop;

  -- Employés qui remplissent leur feuille, une par compagnie.
  for r in
    select c.employe_id, c.entreprise_id, c.debut
      from (select h.employe_id, h.entreprise_id, temps.debut_periode(h.jour) as debut from temps.heures_employes h
            union
            select f.employe_id, f.entreprise_id, f.debut from temps.feuilles_employes f where f.note is not null) c
      join core.employes e on e.id = c.employe_id and e.actif
      join core.profils p on p.employe_id = c.employe_id and p.actif and not temps.role_autorise(p.role)
      left join temps.feuilles_employes f
        on f.employe_id = c.employe_id and f.entreprise_id = c.entreprise_id and f.debut = c.debut
     where coalesce(f.statut, 'ouverte') = 'ouverte'
       and temps.echeance_soumission(c.debut,
             (select max(j.created_at) from temps.journal j where j.feuille_employe_id = f.id and j.genre = 'renvoi'))
           <= p_maintenant
  loop
    insert into temps.feuilles_employes (employe_id, entreprise_id, debut) values (r.employe_id, r.entreprise_id, r.debut)
    on conflict (employe_id, entreprise_id, debut) do nothing;
    update temps.feuilles_employes f set statut = 'soumise'
     where f.employe_id = r.employe_id and f.entreprise_id = r.entreprise_id and f.debut = r.debut
       and f.statut = 'ouverte'
    returning f.id into v_id;
    if found then
      insert into temps.journal (feuille_employe_id, genre, texte, auteur, auteur_nom)
      values (v_id, 'soumission', v_texte, null, 'Automatique');
      v_n := v_n + 1;
    end if;
  end loop;

  return v_n;
end;
$$;

revoke execute on function
  temps.mardi_midi_suivant(timestamptz),
  temps.echeance_soumission(date, timestamptz),
  temps.soumettre_feuilles_echues(timestamptz)
from public, anon, authenticated;

select cron.schedule('temps-soumission-auto', '*/15 * * * *', $$ select temps.soumettre_feuilles_echues(); $$);
