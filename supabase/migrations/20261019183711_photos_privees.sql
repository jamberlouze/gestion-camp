-- ============================================================
-- Photos de Travaux et de Véhicules : seaux privés (audit du 2026-10-19).
--
-- Un seau public sert ses fichiers à quiconque a leur adresse, sans
-- connexion ni RLS, et pour toujours (même après le départ d'un employé).
-- Travaux accepte aussi des PDF. Les politiques de lecture existantes
-- (« Travaux : lire les photos », « Véhicules : lire les photos ») suffisent :
-- l'app lit maintenant ces fichiers par adresses signées.
-- ============================================================

update storage.buckets set public = false where id in ('travaux-photos', 'vehicules-photos');
