-- Transport : coût du fournisseur × 1,15 seulement (Maxime, 2026-10-08). Le
-- 2e « × 1,15 » du chiffrier était une protection en attendant les hausses
-- de prix du fournisseur. Les estimés déjà faits gardent leurs prix (figés).
update reservations.produits set majoration = 1.15 where code like 'TRANS-%';

update reservations.prix x set prix = round(x.cout * 1.15, 4)
from reservations.produits p
where p.id = x.produit_id and p.code like 'TRANS-%' and x.cout is not null;
