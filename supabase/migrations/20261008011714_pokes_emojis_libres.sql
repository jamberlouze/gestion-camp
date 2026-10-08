-- ============================================================
-- core.pokes : plus de liste fixe d'émojis dans la base.
--
-- L'app propose un grand choix par catégories (src/shell/pokes.ts) ;
-- la base vérifie seulement qu'on envoie un court émoji (pas de texte :
-- ni lettre, ni chiffre, ni espace), pour pouvoir allonger la liste
-- sans migration.
-- ============================================================

alter table core.pokes drop constraint pokes_emoji_check;

alter table core.pokes add constraint pokes_emoji_check
  check (char_length(emoji) between 1 and 12 and emoji !~ '[[:alnum:][:space:]]');
