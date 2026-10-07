-- Données (demande de Maxime du 2026-10-07) : Frédérique Therriault, importée
-- du Sheets par la migration précédente, a sa propre feuille (direction) ;
-- elle est retirée de la liste des employés. Seulement si elle n'a encore
-- ni heures ni note (sinon la clé étrangère refuse et rien ne change).
delete from core.employes
 where surnom = 'Frédérique Therriault'
   and not exists (select 1 from temps.heures_employes h where h.employe_id = core.employes.id)
   and not exists (select 1 from temps.notes_employes n where n.employe_id = core.employes.id);
