# Inventaire de l'existant — module RH

Préparé le 2026-10-11 à partir de deux sources :

1. la base Airtable « RH » (`appzxLZ4ZO0kb65xU`) : tables, options, formules, formulaires publics, automatisations, pièces jointes, vues, statistiques ;
2. le Google Sheets « Suivi RH 2026 » (`1vszl-NNdhIHYlsau0VjVpwtloUvAlFf-RD7NKNbEqqM`) : planification des effectifs par semaine.

Aucune donnée personnelle de candidat ou d'employé n'est reprise ici (ni NAS, ni compte bancaire, ni adresse, ni téléphone, ni nom). Seuls la structure, les options, les textes de formulaires et de courriels, et des comptes anonymes figurent ci-dessous.

---

## 1. Base Airtable « RH » — tables et champs

Six tables :

| Table | ID | Rôle |
|---|---|---|
| Humains | `tblui6KOaxvy01Ezj` | Une fiche par personne (clé = courriel). Relie ses candidatures et ses embauches. Sert à l'export VAJ (vérification des antécédents judiciaires). |
| Candidatures | `tblP3UhfHkWcvaaKu` | Une ligne par dépôt de candidature (formulaire « Dépôt de candidatures ») ou par réponse « Intention de retour ». C'est là que la direction décide (pré-décision, saison, compagnie, poste, échelon, statut) et que partent les courriels. |
| Embauches | `tblac0ROT0ROPSYye` | Une ligne par formulaire « Confirmation d'embauche » rempli (dossier d'employé : paie, santé, urgence, disponibilités, documents). |
| Banque d'employés - pré importation (2025) | `tbldztPhR7k9y7ptL` | Ancienne liste d'employés (avant la base actuelle) : a déjà travaillé, dernière saison active, « ne reprendrait pas », notes. |
| Pièces jointes | `tbl70SlKIr632Svgn` | Bibliothèque des documents joints aux courriels d'embauche (contrats, descriptions de poste…), par saison × poste × échelon × compagnie. |
| Volontariat | `tblhjZLBA6oFX0HZ0` | Dossier des bénévoles (équivalent allégé d'Embauches). |

### 1.1 Candidatures (`tblP3UhfHkWcvaaKu`)

Ordre des champs dans la table (les champs marqués ✏️ sont remplis par la direction ; les autres par le candidat via formulaire) :

| Champ | Type | Options / formule |
|---|---|---|
| **Nom complet** (champ principal) | formule | `{Nom de famille} & ", " & {Prénom}` |
| Courriel | courriel | |
| Nom de famille | texte | |
| Prénom | texte | |
| Nom de camp | texte | (surnom de camp ; rempli surtout via « Intention de retour ») |
| Téléphone | téléphone | |
| Niveau d'études | choix unique | Secondaire 5 - En cours · Secondaire 5 - Complété · Cégep - En cours · Cégep - Complété · Université - En cours · Université - Complété |
| Statut de citoyenneté | choix unique | Citoyen·ne canadien·ne · Résident·e permanent·e au Canada · Étranger·ère avec un permis de travail valide au Canada · Étranger·ère sans permis de travail valide au Canada |
| Intention retour \| Ancien | choix unique | Oui (vert) · Non (rouge) |
| Saison \| Application | choix multiples | « Printemps 2026 » · « Été 2026 » · « Automne 2026 » (ces trois avec une espace finale dans le libellé) · Hiver 2027 · Printemps 2027 · Été 2027 · Automne 2027 · Hiver 2028 · Printemps 2028 · Été 2028 · Automne 2028 |
| Poste \| Application Été | choix multiples | Aide de camp · Animateur - Camp d'été · Animateur - Classe nature · Animateur - Programme EXPÉ · Coordonnateur de Camp de vacances · Formateur - Programme sauvetage · Formateur PAM DAFA - Programme ASPI · Sauveteur plage · Spécialiste escalade · Spécialiste photos & vidéos · Spécialiste transport (conducteur minibus) · Chef cuisinier · Aide cuisinier · Préposé à l'entretien · Aquabounga : Coordonnateur · Aquabounga : Sauveteur sur structure gonflable · Opikawa : Coordonnateur · Opikawa : Professeur d'anglais langue seconde · Opikawa : Professeur de français langue seconde · Rouge & Diable : Coordonnateur · Rouge & Diable : Conducteur minibus · Rouge & Diable : Préposé à l'accueil |
| Poste \| Application Automne | choix multiples | Animateur - Classe nature · Chef cuisinier · Aide cuisinier · Employé polyvalent |
| Poste \| Application Hiver | choix multiples | Animateur - Classe nature · Chef cuisinier · Aide cuisinier · Employé polyvalent · Accompagnateur de groupe en ski |
| Poste \| Application Printemps | choix multiples | Animateur - Classe nature · Chef cuisinier · Aide cuisinier · Employé polyvalent |
| Date début | date | (« À partir de quelle date es-tu disponible ») |
| Empêchements | texte | |
| Niveau de français | choix unique | Langue maternelle · Excellent · Intermédiaire · Débutant |
| Niveau d'anglais ? | choix unique | Langue maternelle · Excellent · Intermédiaire · Débutant |
| CV | pièces jointes | |
| Message de motivation | texte long | |
| Qu'est-ce qui vous a incité à postuler ? | choix unique | Groupe Facebook d'emploi · J'ai trouvé l'offre d'emploi directement sur le site web de l'entreprise · Je suis un ancien employé et je reviens · Offre d'emploi sur le site web de l'ACQ (association des camps du Québec) · Recruté par un directeur ou une directrice · Référence d'un ami · Site de recherche d'emploi (Indeed, LinkedIn, etc.) · Je suis un ancien ASPI |
| Référé par | texte | |
| Autre information | texte long | |
| ✏️ Interne - Commentaires application | texte enrichi | |
| Date d'entrevue | date | |
| ✏️ Interne - Commentaires entrevue | texte enrichi | |
| ✏️ Pré-décision | choix unique | Oui · Maybe · Bof · Non · Proposer ASPI |
| ✏️ Saison \| Décision | choix unique | Printemps 2026 (avec espace finale) · Été 2026 · Automne 2026 · Hiver 2027 · Printemps 2027 · Été 2027 · Automne 2027 · Hiver 2028 · Printemps 2028 · Été 2028 · Automne 2028 |
| ✏️ Compagnie \| Décision | choix unique | Aquabounga · Base de Plein Air Mont-Tremblant · Opikawa · Rouge&Diable · Trembloc |
| ✏️ Poste \| Décision | choix unique | Coordonateur (sic, un seul « n ») · Aide de camp · Animateur - Camp d'été · Animateur - Classe nature · Animateur - Programme EXPÉ · Formateur - Programme sauvetage · Formateur PAM DAFA - Programme ASPI · Sauveteur plage · Spécialiste escalade · Spécialiste photos & vidéos · Spécialiste transport · Chef cuisinier · Aide cuisinier · Préposé à l'entretien · Employé polyvalent · Accompagnateur de groupe en ski · Sauveteur sur structure gonflable · Conducteur minibus · Préposé à l'accueil · Prof de français langue seconde · Prof d'anglais langue seconde |
| ✏️ Échelon \| Décision | choix unique | 1 · 2 · 3 · 4 · 5 |
| ✏️ Statut candidature | choix unique | Application · Proposition d'entrevue · Candidature acceptée · Candidature rejetée (équipe complète) · Candidature rejetée (après entrevue) · A refusé le poste · En attente · Proposition ASPI · Question permis de travail |
| ✏️ Envoi courriel ? | case à cocher | Le « bouton » qui déclenche les automatisations (avec le statut) ; décochée par l'automatisation après l'envoi. |
| Dernier courriel envoyé | texte enrichi | Rempli par les automatisations : copie du dernier courriel envoyé. |
| Date d'application | date de création | |
| ✏️ Statut candidature (from Candidatures) (from Humains) | recherche | Statuts de toutes les candidatures de la même personne (via Humains). |
| Humains | lien → Humains | Rempli par le script « Création d'un humain ». |
| Calcul | formule | `RECORD_ID()` (sert au script de création d'humain) |

Remarques :
- Les libellés « Poste » de candidature et ceux de décision ne sont **pas** la même liste : « Coordonnateur de Camp de vacances », « Aquabounga : Coordonnateur », etc. côté candidat ↔ « Coordonateur » unique côté décision ; « Spécialiste transport (conducteur minibus) » ↔ « Spécialiste transport ».
- Les saisons « Printemps/Été/Automne 2026 » de `Saison | Application` ont une espace finale ; « Printemps 2026 » de `Saison | Décision` aussi. Les autres non.
- Aucune saison « Hiver 2026 » dans les listes de candidature (on commence à Printemps 2026).

### 1.2 Embauches (`tblac0ROT0ROPSYye`)

| Champ | Type | Options / formule |
|---|---|---|
| **Nom de camp** (champ principal) | texte | |
| Courriel | courriel | |
| Nom complet | formule | `{Nom de famille} & ", " & {Prénom}` |
| Prénom · Nom de famille | texte | |
| Indicatif régional · Téléphone | texte | (téléphone en texte simple, pas en champ téléphone) |
| Date de naissance | date (format européen J/M/AAAA) | |
| Numéro d'assurance maladie | texte | |
| Adresse et rue · Code postal · Ville · Province · Pays | texte | |
| Êtes-vous étudiant à temps plein? | choix unique | Oui · Non |
| Ancien | choix unique | Oui · Non (rempli par la direction) |
| Type de rémunération | choix unique | À la semaine · À l'heure |
| 4% | choix unique | 0% · 4% sur chaque paie · 4% banque vacances |
| Action | choix unique | A - Ajout · M - Modification (code d'import dans le système de paie) |
| Date d'embauche / réembauche | date | |
| Type d'employé | choix unique | B: Probation · C: Contractuel · E: Étudiant · P: Partiel · R: Régulier · T: Temporaire |
| Si vous êtes aux études, merci de préciser dans quel programme et dans quelle institution. | texte | |
| Spécimen chèque | pièces jointes | |
| Chèque (Transit) · Chèque (Institution financière) · Chèque (Numéro de compte) | texte | |
| Numéro d'assurance sociale | nombre (entier) | |
| Avez-vous des allergies ou intolérances? | choix unique | Oui · Non |
| Précisez vos allergies | texte | |
| Diète alimentaire | choix unique | Régulier, aucune restriction alimentaire · Végétarienne · Sans lactose · Sans porc · Sans gluten |
| Grandeur de t-shirt | choix unique | S · M · L · XL · XXL |
| Grandeur de hoodie | choix unique | S · M · L · XL · XXL |
| Contact Urgence 1 - Nom complet / Lien parenté / Téléphone | texte, texte, téléphone | |
| Contact Urgence 2 - Nom complet / Lien parenté / Téléphone | texte, texte, téléphone | |
| Je serai disponible aux dates suivantes : | choix multiples | voir liste ci-dessous |
| Commentaires et précisions sur les disponibilités (au besoin) | texte | |
| Code d'éthique | case à cocher | |
| CV · Contrat de travail signé · Carte de premiers soins · Consentement parental · Carte SN ou Croix de Bronze · Permis de conduire (ou autre pièce d'identité) | pièces jointes | |
| N'hésitez pas à nous écrire vos commentaires ou précisions par rapport à l'été! | texte long | |
| Photo | pièces jointes | (présentation sur les médias sociaux) |
| As-tu été campeur.se ou anim avant à la BPA (Si oui, combien d'années?) | texte | |
| Ton activité préférée à faire au camp ou à tremblant ☀️ | texte | |
| Ton repas préféré 🦞 | texte | |
| Ta chanson de karaoké de prédilection 🎤 | texte | |
| Humains | lien → Humains | Rempli par le script d'association. |
| Date de création | date de création | |
| Humains 2 | texte | (champ texte orphelin, sans usage apparent) |

Options de « Je serai disponible aux dates suivantes : » (dates de l'été 2026, codées en dur dans les libellés) :

- Formation 1 : 1er au 03 mai (obligatoire - BPA)
- Formation 2 : 05 au 07 juin (obligatoire - toutes les compagnies)
- Formation 3 : 26 et 27 juin (optionnel)
- Classe verte - 8 et 9 mai
- Classe verte - 11 au 13 mai
- Classe verte - 13 au 21 mai
- Classe verte - 21 et 22 mai
- Classe verte - 22 au 24 mai
- Classe verte - 27 au 29 mai
- Classe verte - 29 au 31 mai
- Classe verte - 04 et 05 juin
- Journée plein air - 12 juin
- Classe verte - 15 et 16 juin
- Classe verte - 15 au 17 juin
- Classe verte - 16 et 17 juin
- Classe verte - 17 et 18 juin
- Classe verte - 17 au 19 juin
- Classe verte - 18 et 19 juin
- Journée plein air - 19 juin
- Journée plein air - 20 juin
- Été - Semaine 1 : 28 juin au 05 juillet
- Été - Semaine 2 : 05 au 12 juillet
- Été - Semaine 3 : 12 au 19 juillet
- Été - Semaine 4 : 19 au 26 juillet
- Été - Semaine 5 : 26 au 02 août
- Été - Semaine 6 : 02 au 09 août
- Été - Semaine 7 : 09 au 16 août
- Été - Semaine 8 : 16 au 23 août

### 1.3 Humains (`tblui6KOaxvy01Ezj`)

| Champ | Type | Options / formule |
|---|---|---|
| **Courriel** (champ principal) | texte | Clé de rapprochement (les scripts cherchent par courriel). |
| Prénom · Nom | texte | |
| Candidatures | lien → Candidatures | |
| ✏️ Statut candidature / Compagnie \| Décision / Poste \| Décision / Saison \| Décision / Échelon \| Décision / Interne - Commentaires (from Candidatures) | recherches | |
| Embauches | lien → Embauches | |
| ~25 recherches « (from Embauches) » | recherches | NAS, chèque (numéro de compte, institution, transit, spécimen), étudiant temps plein (deux fois : « … » et « … 2 »), pays, province, ville, code postal, adresse, NAM, date de naissance, téléphone, indicatif, 4%, type de rémunération, ancien, nom complet, détails études, permis de conduire, carte SN, carte premiers soins, CV |
| Date VAJ | date | Date de la vérification des antécédents judiciaires |
| DDN VAJ | formule | `DATETIME_FORMAT(IF({Date de naissance (from Embauches)} = "", {Date de naissance (sans embauche)}, {Date de naissance (from Embauches)}), "YYYYMMDD")` — description : « Affiche la date de naissance au format YYYYMMDD, priorisant l'embauche si disponible. » |
| Info VAJ | formule | `{DDN VAJ} & "," & {Nom} & "," & {Prénom}` (ligne prête à coller pour la demande de VAJ) |
| Sexe | choix unique | Féminin · Masculin |
| VAJ ? | case à cocher | |
| Numéro de la compagnie | téléphone | |
| Compagnie | choix unique | Aquabounga inc. · Gestion Base de Plein Air Mont-Tremblant + · Opikawa inc. · Rouge&Diable inc. · Trembloc inc. · Base de Plein Air Mont-Tremblant inc. (raisons sociales, ≠ libellés de Candidatures) |
| Date de naissance (sans embauche) | date | Pour les personnes sans fiche Embauches |

### 1.4 Banque d'employés - pré importation (2025) (`tbldztPhR7k9y7ptL`)

| Champ | Type | Options / formule |
|---|---|---|
| **Candidat 🧑‍💼** (champ principal) | formule | `{Nom de famille} & ", " & {Prénom}` |
| Courriel | courriel | |
| Nom de camp | texte | |
| À déjà travailler avec nous ? | choix unique | Oui · Non |
| Dernière saison active | choix multiples | « Dernière saison active » (option parasite égale au nom du champ) · Été 2022 · Hiver 2023 · Été 2023 · Hiver 2024 · Été 2024 · Hiver 2025 · Été 2025 · Hiver 2026 · Été 2026 |
| Ne reprendrait pas | choix unique | ❌ (seule option) |
| Notes ✏️ | texte enrichi | |
| Prénom · Nom de famille · Téléphone | texte / téléphone | |
| Compagnie | choix multiples | Aquabounga · Base de Plein Air Mont-Tremblant · Opikawa · Rouge&Diable |
| Poste | choix multiples | Prof · Anim · Autre · Loutre · Spécialiste · Sauveteur · Cuisine · Anim classe nature · Aide de camp · Coordo · Entretien |

### 1.5 Pièces jointes (`tbl70SlKIr632Svgn`)

| Champ | Type | Options / formule |
|---|---|---|
| **Poste + Échelon** (champ principal) | formule | `{Poste} & " - " & {Échelon}` |
| Saison | choix unique | Printemps · Été · Automne · Hiver (sans année) |
| Poste | choix unique | Coordonnateur · Aide de camp · Animateur - Camp d'été · Animateur - Classe nature · Animateur - Programme EXPÉ · Formateur - Programme sauvetage · Formateur PAM DAFA - Programme ASPI · Sauveteur plage · Spécialiste escalade · Spécialiste photos & vidéos · Spécialiste transport · Chef cuisinier · Aide cuisinier · Préposé à l'entretien · Employé polyvalent · Accompagnateur en groupe de ski · Sauveteur sur structure gonflable · Conducteur minibus · Préposé à l'accueil · Prof de français langue seconde · Prof d'anglais langue seconde |
| Échelon | choix unique | 1 · 2 · 3 · 4 · 5 |
| Compagnie | choix unique | Aquabounga · Base de Plein Air Mont-Tremblant · Opikawa · Rouge & Diable (avec espaces, ≠ « Rouge&Diable » de Candidatures) · Trembloc |
| Attachments | pièces jointes | |

Attention : les libellés diffèrent légèrement de ceux de `✏️ Poste | Décision` (« Coordonnateur » ici, « Coordonateur » là ; « Accompagnateur en groupe de ski » ici, « Accompagnateur de groupe en ski » là ; « Rouge & Diable » ici, « Rouge&Diable » là). Les automatisations font la recherche par ces libellés (voir § 3).

### 1.6 Volontariat (`tblhjZLBA6oFX0HZ0`)

Champs : Courriel (principal) · Nom complet (formule `{Nom de famille} & ", " & {Prénom}`) · Nom de camp · Prénom · Nom de famille · Téléphone · Date de naissance · Numéro d'assurance maladie · Adresse complète · Ville · Pays · Numéro d'assurance sociale · Avez-vous des allergies ou intolérances? (Oui · Non) · Précisez vos allergies · Diète alimentaire (Régulier, aucune restriction alimentaire · Végétarienne · Sans lactose · Sans porc · Sans gluten) · Contact Urgence 1 et 2 (nom, lien, téléphone) · Disponibilités (texte long) · Code d'éthique (case) · Entente de bénévolat (case) · CV · Passeport / Permis de conduire / autre pièce d'identité · Précisions · Photo.

Aucune automatisation ni formulaire public de la liste ne touche cette table.

### 1.7 Récapitulatif des formules demandées

| Formule | Table | Expression |
|---|---|---|
| Calcul | Candidatures | `RECORD_ID()` |
| Nom complet | Candidatures | `{Nom de famille} & ", " & {Prénom}` |
| Nom complet | Embauches | `{Nom de famille} & ", " & {Prénom}` |
| Nom complet | Volontariat | `{Nom de famille} & ", " & {Prénom}` |
| Candidat 🧑‍💼 | Banque d'employés | `{Nom de famille} & ", " & {Prénom}` |
| DDN VAJ | Humains | `DATETIME_FORMAT(IF({Date de naissance (from Embauches)} = "", {Date de naissance (sans embauche)}, {Date de naissance (from Embauches)}), "YYYYMMDD")` |
| Info VAJ | Humains | `{DDN VAJ} & "," & {Nom} & "," & {Prénom}` |
| Poste + Échelon | Pièces jointes | `{Poste} & " - " & {Échelon}` |

---

## 2. Les quatre formulaires publics

Aucun des quatre formulaires n'a de valeur pré-remplie ni de champ en lecture seule. Tous **créent** un enregistrement (aucun ne met à jour une fiche existante). Lien public d'un formulaire : `https://airtable.com/appzxLZ4ZO0kb65xU/<pageId>/form`.

### 2.1 « Dépôt de candidatures » (`pag3yj3XvFt8SfebP`) → table Candidatures

Description en tête de formulaire :

> **Merci pour votre intérêt pour une des entreprises du groupe Lütra : Aquabounga, Base de Plein Air Mont-Tremblant, EkoCamp, Opikawa, Rouge&Diable, Trembloc.**

(Note : EkoCamp est nommé ici mais n'existe dans aucune liste de compagnies de la base.)

**Section « À propos de toi »**

| # | Libellé affiché | Champ | Oblig. | Condition d'affichage |
|---|---|---|---|---|
| 1 | Prénom | Prénom | oui | |
| 2 | Nom de famille | Nom de famille | oui | |
| 3 | Courriel | Courriel | oui | |
| 4 | Téléphone | Téléphone | oui | |
| 5 | Quel est ton niveau d'études actuel ? | Niveau d'études | oui | |
| 6 | Statut de citoyenneté | Statut de citoyenneté | oui | |

**Section « Ton expérience et ta motivation de travailler avec nous »**

| # | Libellé | Champ | Oblig. | Condition |
|---|---|---|---|---|
| 7 | Qu'est-ce qui te motives à travailler avec nous ? | Message de motivation | oui | |
| 8 | CV | CV | oui | |

**Section « Poste(s) souhaité(s) »**

| # | Libellé | Champ | Oblig. | Condition |
|---|---|---|---|---|
| 9 | Pour quelle(s) saison(s) souhaites-tu déposer ta candidature ? | Saison \| Application | oui | |
| 10 | Pour quel(s) poste(s) souhaites-tu appliquer ? (Vous pouvez sélectionner jusqu'à 3 choix au maximum) — aide : « Nous t'invitons à consulter les descriptifs de chaque emploi sur notre site avant de faire ton choix : [Juste ici ! ](https://camptremblant.com/emploi) » | Poste \| Application Été | oui | Saison \| Application « = » [Été 2026, Été 2027, Été 2028] (opérateur « = » sur un choix multiple : probablement « contient exactement » — à vérifier, voir § 7) |
| 11 | Poste \| Application Automne (nom brut du champ, pas de libellé personnalisé) | Poste \| Application Automne | oui | Saison \| Application contient l'un de [Automne 2026, Automne 2027, Automne 2028] |
| 12 | Poste \| Application Hiver (nom brut) | Poste \| Application Hiver | oui | Saison \| Application contient l'un de [Hiver 2027, Hiver 2028] |
| 13 | Poste \| Application Printemps (nom brut) | Poste \| Application Printemps | oui | Saison \| Application contient l'un de [Printemps 2026, Printemps 2027, Printemps 2028] |
| 14 | À partir de quelle date es-tu disponible pour travailler avec nous ? | Date début | oui | |
| 15 | As-tu des empêchements qui vont jouer sur tes disponibilités ? | Empêchements | non | |
| 16 | Quel est ton niveau de français ? | Niveau de français | oui | |
| 17 | Quel est ton niveau d'anglais ? | Niveau d'anglais ? | oui | |

La limite « jusqu'à 3 choix » n'est qu'indiquée dans le libellé : rien ne l'impose.

**Section « Autres informations »**

| # | Libellé | Champ | Oblig. | Condition |
|---|---|---|---|---|
| 18 | Qu'est-ce qui vous a incité à postuler ? | Qu'est-ce qui vous a incité à postuler ? | non | |
| 19 | Par qui as-tu été référé ? | Référé par | non | « Qu'est-ce qui vous a incité » est l'un de [Recruté par un directeur ou une directrice, Référence d'un ami] |
| 20 | As-tu d'autres informations que tu souhaites nous partager? | Autre information | non | |

### 2.2 « Intention de retour » (`pagJgXEh4LVYnAsvv`) → table Candidatures

Même table que le dépôt de candidatures : une réponse crée une **nouvelle candidature** (statut vide au départ).

Description en tête de formulaire (texte complet) :

> Salut toi ! ❄️
>
> Un petit sondage express pour connaître tes intentions quant à la prochaine saison ! 👀
>
> Merci d'y répondre rapidement, ça nous aidera à planifier les besoins en embauche à l'externe... mais on espère vraiment garder le plus de nos anciens parmi nous ! 🥳
> On te tiendra au courant très vite pour la suite (rencontre préparatoire, contrat, planification d'été). 🚀
>
> En passant, si tu as des ami(e)s ou connaissances qui voudraient rejoindre l'équipe l'été prochain, dis-leur de soumettre leur candidature au plus vite via [ce formulaire](https://airtable.com/appzxLZ4ZO0kb65xU/pag3yj3XvFt8SfebP/form).
> Une prime de référencement de **100$/pers** est à gagner si la personne fait l'été au complet avec nous! 🎉💰
>
> Hâte d'avoir de tes nouvelles! 😄

**Section « À propos de toi »**

| # | Libellé | Champ | Oblig. | Condition |
|---|---|---|---|---|
| 1 | Prénom | Prénom | oui | |
| 2 | Nom de famille | Nom de famille | oui | |
| 3 | Nom de camp | Nom de camp | non | |
| 4 | Courriel | Courriel | **non** | |

**Section « Souhaits pour la prochaine saison »**

| # | Libellé | Champ | Oblig. | Condition |
|---|---|---|---|---|
| 5 | J'aimerais revenir comme employé.e | Intention retour \| Ancien | oui | |
| 6 | Pour quelle(s) saison(s) souhaites-tu revenir ? — aide : « Vous pouvez sélectionner plusieurs choix » | Saison \| Application | oui | Intention retour = Oui |
| 7 | Pour quel(s) poste(s) souhaites-tu appliquer ? — aide : « Vous pouvez sélectionner plusieurs choix » | Poste \| Application Été | oui | Intention retour = Oui (liste des postes d'été, quelle que soit la saison choisie) |
| 8 | À partir de quelle date es-tu disponible pour travailler avec nous ? | Date début | oui | Intention retour = Oui |
| 9 | As-tu des empêchements qui vont jouer sur tes disponibilités ? | Empêchements | non | Intention retour = Oui |

**Section « Autres informations »**

| # | Libellé | Champ | Oblig. | Condition |
|---|---|---|---|---|
| 10 | As-tu des questions ou commentaires à nous partager ? | Autre information | non | |

Point faible : le courriel est facultatif alors que tout le rapprochement avec Humains se fait par courriel (voir script § 3.15).

### 2.3 « Confirmation d'embauche » (`pagrBKfcmnvR480Mb`) → table Embauches

Description : « Remplissez ce formulaire afin de créer votre dossier d'employé. »

**Section « Informations générales »**

| # | Libellé | Champ | Oblig. | Condition |
|---|---|---|---|---|
| 1 | Prénom | Prénom | oui | |
| 2 | Nom de famille | Nom de famille | oui | |
| 3 | Nom de camp | Nom de camp | non | |
| 4 | Indicatif régional du téléphone | Indicatif régional | non | |
| 5 | Téléphone | Téléphone | oui | |
| 6 | Date de naissance | Date de naissance | oui | |
| 7 | Courriel | Courriel | oui | |
| 8 | Numéro d'assurance maladie | Numéro d'assurance maladie | oui | |
| 9 | Adresse (Numéro et Rue) | Adresse et rue | oui | |
| 10 | Code postal | Code postal | oui | |
| 11 | Ville | Ville | oui | |
| 12 | Province | Province | oui | |
| 13 | Pays | Pays | oui | |
| 14 | Êtes-vous étudiant à temps plein? | Êtes-vous étudiant à temps plein? | oui | |
| 15 | Si vous êtes aux études, merci de préciser programme et institution. | Si vous êtes aux études… | non | (aucune condition, toujours visible) |

**Section « Service de paie »**

| # | Libellé | Champ | Oblig. | Aide |
|---|---|---|---|---|
| 16 | Spécimen chèque | Spécimen chèque | oui | |
| 17 | Numéro d'assurance sociale | Numéro d'assurance sociale | oui | (champ **nombre** : un NAS commençant par 0 perd son zéro) |
| 18 | Chèque (Transit ou Numéro d'identification) | Chèque (Transit) | oui | « Numéro de 5 chiffres qui correspond à la succursale de votre banque/caisse. » |
| 19 | Chèque (Institution financière) | Chèque (Institution financière) | oui | |
| 20 | Chèque (Numéro de compte ou Folio) | Chèque (Numéro de compte) | oui | « Numéro de normalement 7 chiffres (peut varier d'une institution financière à l'autre) » |

**Section « Vie au camp »**

| # | Libellé | Champ | Oblig. | Condition |
|---|---|---|---|---|
| 21 | Avez-vous des allergies ou intolérances? | Avez-vous des allergies ou intolérances? | non | |
| 22 | Précisez vos allergies | Précisez vos allergies | non | Allergies = Oui |
| 23 | Diète alimentaire | Diète alimentaire | non | |
| 24 | Grandeur de t-shirt | Grandeur de t-shirt | non | |
| 25 | Grandeur de hoodie (Équipe d'animation BPA et Opikawa uniquement) | Grandeur de hoodie | non | |

**Section « Contacts d'urgence »** (tous facultatifs)

26–28 Contact Urgence 1 - Nom complet / Lien parenté / Téléphone ; 29–31 Contact Urgence 2 - Nom complet / Lien parenté / Téléphone.

**Section « Disponibilités »**

| # | Libellé | Champ | Oblig. |
|---|---|---|---|
| 32 | Je serai disponible aux dates suivantes : | (choix multiples, 28 options listées au § 1.2) | non |
| 33 | Commentaires et précisions sur les disponibilités (au besoin) | | non |

**Section « Code d'éthique »**

| # | Libellé | Champ | Oblig. |
|---|---|---|---|
| 34 | En cochant la case ci-dessous, je m'engage à respecter le code d'éthique suivant dans le cadre de mon contrat. | Code d'éthique (case) | oui |

Texte d'aide (code d'éthique, version été, texte complet) :

```
Je dois :
- Assurer la sécurité des enfants/clients en tout temps
- Offrir une animation, une gestion d'équipe et un travail de qualité
- Être respectueux.euse
    - Des campeurs ;
    - Des clients externes ;
    - Des collègues et des supérieurs ;
    - De l'environnement ; et
    - Du matériel
    - Être ponctuel.le, constant.e, enthousiaste et souriant.e
    - Représenter mon organisation par mon positivisme.
    - Rester professionnel.le dans mon attitude et mes actions.
    - Porter des vêtements appropriés. *N'oubliez pas que vous travaillez avec des enfants.
    - Participer aux activités, aux réunions tel que requis par la direction
    - Accepter la critique constructive, les façons de faire des autres, les traditions du camp, les décisions de la direction, etc.
    - Avoir une bonne hygiène corporelle.

Je ne peux pas :
- Utiliser mon cellulaire, tablette, etc. à des fins personnelles lorsque je travaille.
- Inviter des personnes sur le camp.
- Fumer, boire ou consommer de l'alcool et de la drogue sur le site de la BPA.
- Avoir des relations amicales ou amoureuses avec un.e campeur.euse / client.es
- Exprimer toutes formes d'agressions physiques, psychologiques, verbales ou sexuelles.
- Laisser mon groupe sans surveillance sans en avoir, au préalable, avisé ma ou mon supérieur.e.
- Faire écouter de la musique ou des vidéos aux campeur.euse.s sans m'être assuré.e qu'elles soient adéquates pour des jeunes. (Sans propos violents, sexistes, racistes ou sexuels).

En cas de non-respect d'une des clauses du présent code d'éthique, la direction appliquera la politique suivante en matière de mesure disciplinaire.
- 1ère infraction : Avis verbal
- 2e infraction : Avis écrit noté au dossier de l'employé
- 3e infraction : Suspension sans solde (durée déterminée selon le cas)
- 4e infraction : Renvoi

Pour les fautes jugées graves et/ou manquements au code d'éthique, la direction se réserve le droit de renvoyer l'animateur sans préavis.
```

(Dans l'original, les puces à partir de « Être ponctuel.le » sont indentées sous « Être respectueux.euse » — probablement une erreur de mise en forme.)

**Section « Documents »**

| # | Libellé | Champ | Oblig. |
|---|---|---|---|
| 35 | CV | CV | oui |
| 36 | Contrat de travail signé | Contrat de travail signé | oui |
| 37 | Carte de premiers soins | Carte de premiers soins | non |
| 38 | Carte SN ou autre (Pour tous les sauveteurs - votre plus haute accréditation seulement) | Carte SN ou Croix de Bronze | non |
| 39 | Permis de conduire (ou autre pièce d'identité) | Permis de conduire (ou autre pièce d'identité) | non |
| 40 | Consentement parental (Mineur·es seulement) | Consentement parental | non |

**Section « Présentation de l'équipe sur les médias sociaux »** (tous facultatifs)

41 Photo · 42 As-tu été campeur.se ou anim avant à la BPA (Si oui, combien d'années?) · 43 Ton activité préférée à faire au camp ou à tremblant ☀️ · 44 Ton repas préféré 🦞 · 45 Ta chanson de karaoké de prédilection 🎤

**Section « Groupe Facebook et commentaires »**

46 « N'hésitez pas à nous écrire vos commentaires ou précisions par rapport à votre saison ! » → champ « N'hésitez pas à nous écrire vos commentaires ou précisions par rapport à l'été! » (facultatif). La section s'appelle « Groupe Facebook » mais ne contient rien sur Facebook.

### 2.4 « Confirmation d'embauche - Hors été » (`pagAEI5UvWkMejhsS`) → table Embauches

Même formulaire que 2.3, mêmes sections « Informations générales », « Service de paie », « Contacts d'urgence », « Documents », avec ces différences :

- **« Vie au camp »** : seulement allergies, précisions allergies (si Oui) et diète. **Pas** de t-shirt ni de hoodie.
- **Pas** de section « Disponibilités ».
- **Pas** de section « Présentation de l'équipe sur les médias sociaux » ni « Groupe Facebook et commentaires ».
- **Code d'éthique** légèrement différent :
  - « Fumer, boire ou consommer de l'alcool et de la drogue sur le site de la BPA. » devient « Posséder ou consommer de l'alcool ou de la drogue sur le site de la BPA » ;
  - l'échelle disciplinaire a **3** paliers au lieu de 4 : « 1ère infraction : Avis verbal / 2e infraction : Avis écrit noté au dossier de l'employé / 3e infraction : Renvoi » (pas de suspension sans solde).
  - Le reste du texte est identique à la version été.

Aucune automatisation de « Réception » n'est branchée sur ce formulaire (seule la version été envoie une alerte, voir § 3.14). Le script d'association à un humain s'applique toutefois (déclencheur « enregistrement créé » sur Embauches).

---

## 3. Automatisations

### 3.0 Vue d'ensemble

Comptes Gmail branchés dans Airtable (expéditeurs) :

| ID du compte | Libellé Airtable | Utilisé pour |
|---|---|---|
| `eacOMbXCGeh9OdJIJ` | Inscriptions BPA | Base de Plein Air Mont-Tremblant et Trembloc (signature « inscriptions@camptremblant.com ») |
| `eacMnoDZgE4g9KG9t` | Coordo OPI | Opikawa (signature « messages@opikawa.com ») |
| `eacpZLavBlBy1X0Pw` | Info AQB | Aquabounga |
| `eaceiOagS9peORvt4` | Info RD | Rouge & Diable |
| `eacPhqGXhAf6X3NWR` | Gmail account | (compte 2024, voir alertes de réception) |

Le libellé Airtable ne donne pas l'adresse exacte du compte ; l'adresse réelle de l'expéditeur est celle du compte Gmail connecté. Le « nom d'expéditeur » (fromName) est fixé par chaque action.

**Mécanique commune** à toutes les automatisations de décision (table Candidatures) : la direction choisit un `✏️ Statut candidature`, remplit au besoin `✏️ Compagnie | Décision` (et pour l'embauche `✏️ Échelon`, `✏️ Saison`, `✏️ Poste`), puis coche `✏️ Envoi courriel ?`. Le déclencheur « l'enregistrement correspond aux conditions » part ; l'automatisation envoie le courriel de la compagnie, **décoche** `✏️ Envoi courriel ?` et écrit dans `Dernier courriel envoyé` : `Courriel {{Statut candidature}} envoyé le {{date-heure ISO d'exécution}} via {{Compagnie | Décision}}`.

| # | Automatisation | ID | État | Déclencheur |
|---|---|---|---|---|
| 3.1 | Proposition entrevue | `wflOUraO0VvzUfU1z` | **déployée** | Statut = Proposition d'entrevue + Envoi courriel coché |
| 3.2 | Embauche - BPA - Échelon 1 - Hors saison | `wflpkQ4oFFYdo44K9` | **déployée** | Statut = Candidature acceptée + Envoi + Compagnie = BPA + Échelon = 1 |
| 3.3 | Embauche - BPA - Échelon 1 - Partie 1 - Été | `wflMJANzvFBG5PE29` | **non déployée** | idem 3.2 |
| 3.4 | Embauche - BPA - Échelon 1 - Partie 2 - Été | `wflWWTJKebuY8lVop` | **non déployée** | idem 3.2 |
| 3.5 | Embauche - OPI - Échelon 1 - Été | `wfl4GKDW8QPCnYrlr` | **non déployée** | Statut = Candidature acceptée + Envoi + Compagnie = Opikawa + Échelon = 1 |
| 3.6 | Embauche - AQB - Échelon 1 | `wflpMeiScPPkbHd9N` | **non déployée** | … Compagnie = Aquabounga + Échelon = 1 |
| 3.7 | Embauche - RD - Échelon 1 | `wflyD2cSE5BaYNoOW` | **non déployée** | … Compagnie = Rouge&Diable + Échelon = 1 |
| 3.8 | Candidature rejetée (après entrevue) | `wflPjFv95j0aT4WR6` | **déployée** | Statut = Candidature rejetée (après entrevue) + Envoi |
| 3.9 | Candidature rejetée (équipe complète) | `wflLGMfVxxStFbr35` | **déployée** | Statut = Candidature rejetée (équipe complète) + Envoi |
| 3.10 | BPA - Proposition ASPI | `wflk296AMjIxaNCAv` | **déployée** | Statut = Proposition ASPI + Envoi + Compagnie = BPA |
| 3.11 | BPA - Candidatures sans permis de travail | `wflyGJn0ak9oO43YS` | **déployée** | Statut = Question permis de travail + Envoi + Compagnie = BPA |
| 3.12 | Réception - Nouvelle candidature | `wflu0xr3NjT06W1zk` | **déployée** | Formulaire « Dépôt de candidatures » soumis |
| 3.13 | Réception - Intention de retour | `wflICVheFfZ2bQbX5` | **déployée** | Formulaire « Intention de retour » soumis |
| 3.14 | Réception - Confirmation d'embauche | `wfl2iVWX19tTkth9j` | **déployée** | Formulaire « Confirmation d'embauche » (été) soumis |
| 3.15 | Création d'un humain lorsque réception d'une candidature | `wflP2hhxDhKSw3e1o` | **déployée** | Enregistrement créé dans Candidatures |
| 3.16 | Association d'un formulaire d'embauche à un humain | `wflHfEbdAFLGWBLDe` | **déployée** | Enregistrement créé dans Embauches |

Statuts **sans** automatisation : Application, En attente, A refusé le poste, et Candidature acceptée pour les échelons 2 à 5 ou pour Trembloc (et pour toutes les compagnies sauf BPA tant que 3.5–3.7 ne sont pas déployées).

### 3.1 Proposition entrevue (`wflOUraO0VvzUfU1z`) — déployée

**Déclencheur** : un enregistrement de Candidatures correspond aux conditions `✏️ Statut candidature` = « Proposition d'entrevue » ET `✏️ Envoi courriel ?` coché.

**Branches** (selon `✏️ Compagnie | Décision`) : Base de Plein Air Mont-Tremblant · Opikawa · Aquabounga · Rouge&Diable · Trembloc. Si la compagnie est vide, rien n'est envoyé et la case reste cochée.

Chaque branche : 1) courriel Gmail au candidat ; 2) décoche `✏️ Envoi courriel ?` ; 3) écrit `Dernier courriel envoyé` (format commun ci-dessus).

Destinataire (toutes branches) : `{{Courriel}}` du candidat. Objet (toutes branches) : « Proposition d'entrevue » (avec une espace finale). Aucune pièce jointe.

**Branche Base de Plein Air Mont-Tremblant** — compte « Inscriptions BPA », nom d'expéditeur « Base de Plein Air Mont-Tremblant »

```
Bonjour {{Prénom}},

Nous avons bien reçu ta candidature.
On est vraiment très heureux que notre affichage ait retenu ton attention. Ton profil est intéressant et on aimerait bien te rencontrer. Serais-tu disponible prochainement pour une rencontre virtuelle d'environ 30 minutes sur Google Meet ? Tu peux sélectionner le moment qui te convient pour une entrevue [juste ici](https://calendar.app.google/5mExLkYpmiujtDGk9/) !
Entre-temps, on t'invite à t'abonner à nos différentes pages : [Base de Plein Air Mont-Tremblant](https://www.instagram.com/camptremblant/) (camp régulier), [Opikawa](https://www.instagram.com/opikawa_/) (camp international et immersion linguistique), [Rouge&Diable](https://www.instagram.com/rougeetdiable/) (centre de location d'embarcations) et [Aquabounga](https://www.instagram.com/aquabounga/) (structures gonflables sur l'eau).

Merci et au plaisir de discuter avec toi !

Charlotte Féral-Basin | Co-Directrice
inscriptions@camptremblant.com
+1 (819) 425-2461
camptremblant.com
```

**Branche Opikawa** — compte « Coordo OPI », nom d'expéditeur « Opikawa »

Même texte, sauf la 2e phrase : « On est vraiment très heureux que **notre camp de vacances** ait retenu ton attention. » Même lien de prise de rendez-vous (`https://calendar.app.google/5mExLkYpmiujtDGk9/`). Signature :

```
Charlotte Féral-Basin | Co-Directrice / Co-Director / Codirectora
messages@opikawa.com
+1 (888) 890-2887
opikawa.com
```

**Branche Aquabounga** — compte « Info AQB », nom d'expéditeur « Aquabounga »

Même texte, sauf : « On est vraiment très heureux que **notre parc gonflable** ait retenu ton attention. » Lien de prise de rendez-vous **différent** : `https://calendar.app.google/itK6iuzV9R3Hy7Am8/`. Signature :

```
Vickie Leuenberger | Co-directrice générale
+1 (819) 803-3819
aquabounga.ca
```

**Branche Rouge&Diable** — compte « Info RD », nom d'expéditeur « Rouge & Diable »

Même texte, sauf : « On est vraiment très heureux que **notre centre de location** ait retenu ton attention. » Lien de rendez-vous `https://calendar.app.google/itK6iuzV9R3Hy7Am8/` (le même qu'Aquabounga). Signature :

```
Vickie Leuenberger | Co-directrice générale
+1 (819) 201-1366
rougediable.ca
```

**Branche Trembloc** — compte « Inscriptions BPA », nom d'expéditeur « Trembloc »

Même texte, sauf : « On est vraiment très heureux que **notre centre d'escalade** ait retenu ton attention. » Lien `https://calendar.app.google/5mExLkYpmiujtDGk9/`. Signature identique à la BPA (Charlotte Féral-Basin | Co-Directrice, inscriptions@camptremblant.com, +1 (819) 425-2461, camptremblant.com).

Remarques : la liste Instagram ne mentionne pas Trembloc ; deux liens de prise de rendez-vous (un pour BPA/OPI/Trembloc, un pour AQB/RD) ; le HTML de signature contient des `</a>` orphelins après les numéros de téléphone.

### 3.2 Embauche - BPA - Échelon 1 - Hors saison (`wflpkQ4oFFYdo44K9`) — déployée

**Déclencheur** : Candidatures où `✏️ Statut candidature` = « Candidature acceptée » ET `✏️ Envoi courriel ?` coché ET `✏️ Compagnie | Décision` = « Base de Plein Air Mont-Tremblant » ET `✏️ Échelon | Décision` = « 1 ».

**Branches** (selon `✏️ Poste | Décision` et `✏️ Saison | Décision`) — 7 branches :

| # | Poste \| Décision | Saison \| Décision est l'une de | Pièces jointes cherchées (table Pièces jointes) |
|---|---|---|---|
| 1 | Animateur - Classe nature | Automne 2026, Automne 2027, Automne 2028 | Saison = Automne, Poste = Animateur - Classe nature, Échelon = 1, Compagnie = BPA |
| 2 | Employé polyvalent | Automne 2026/2027/2028 | Automne, Employé polyvalent, 1, BPA |
| 3 | Animateur - Classe nature | Hiver 2027, Hiver 2028 | Hiver, Animateur - Classe nature, 1, BPA |
| 4 | Employé polyvalent | Hiver 2027/2028 | Hiver, Employé polyvalent, 1, BPA |
| 5 | Accompagnateur de groupe en ski | Hiver 2027/2028 | Hiver, Accompagnateur en groupe de ski, 1, BPA |
| 6 | Animateur - Classe nature | Printemps 2026, Printemps 2027, Printemps 2028 | Printemps, Animateur - Classe nature, 1, BPA |
| 7 | Employé polyvalent | Printemps 2026/2027/2028 | Printemps, Employé polyvalent, 1, BPA |

Chef cuisinier et Aide cuisinier (pourtant offerts hors saison dans le formulaire) **n'ont pas de branche** : rien ne part et la case reste cochée.

Chaque branche : 1) « Trouver des enregistrements » dans Pièces jointes selon les 4 critères (jusqu'à 1000) ; 2) courriel ; 3) mise à jour de la candidature : `✏️ Envoi courriel ?` décochée, `Dernier courriel envoyé` = « Courriel {{Statut candidature}} envoyé le {{date-heure ISO}} » (sans « via »).

**Courriel (identique dans les 7 branches)**

- Compte : « Inscriptions BPA » ; nom d'expéditeur : « Base de Plein Air Mont-Tremblant »
- À : `{{Courriel}}`
- Objet : « Bienvenue dans l'équipe ! »
- Pièces jointes : tous les fichiers du champ `Attachments` des enregistrements de Pièces jointes trouvés à l'étape 1.

```
Salut {{Prénom}},
Merci encore d'avoir pris le temps de participer au processus d'entrevue. On a bien hâte de commencer la prochaine saison avec toi : **Bienvenue dans l'aventure 🥳**

**💼 Dossier d'embauche**
Afin de compléter ton dossier employé, je t'invite à remplir [ce formulaire d'embauche.](https://airtable.com/appzxLZ4ZO0kb65xU/pagAEI5UvWkMejhsS/form)
Ce formulaire te permettra de fournir certaines informations importantes. Tu trouveras d'ailleurs, en pièces jointes, les documents suivants, qui devront être signés et déposés directement dans le formulaire :
* Ton contrat de travail,
* Le consentement parental (À remplir si tu as moins de 18 ans à la date de début de ton contrat).

Si tu as des questions concernant ton embauche ou ton dossier employé, n'hésite pas à m'écrire.
On a bien hâte de travailler avec toi,
À très bientôt !

Charlotte Féral-Basin | Co-Directrice
inscriptions@camptremblant.com
+1 (819) 425-2461
camptremblant.com
```

Le lien pointe vers le formulaire **« Confirmation d'embauche - Hors été »** (`pagAEI5UvWkMejhsS`).

### 3.3 Embauche - BPA - Échelon 1 - Partie 1 - Été (`wflMJANzvFBG5PE29`) — NON déployée

**Déclencheur** : identique à 3.2 — `✏️ Statut candidature` = « Candidature acceptée » ET `✏️ Envoi courriel ?` coché ET `✏️ Compagnie | Décision` = « Base de Plein Air Mont-Tremblant » ET `✏️ Échelon | Décision` = « 1 ».

**Branches** (selon `✏️ Poste | Décision` **seulement**, aucune condition sur la saison) — 8 branches :

| # | Poste \| Décision | Pièces jointes cherchées (Saison = Été, Échelon = 1, Compagnie = BPA, Poste = …) |
|---|---|---|
| 1 | Coordonateur | Coordonnateur |
| 2 | Aide de camp | Aide de camp |
| 3 | Animateur - Camp d'été | Animateur - Camp d'été |
| 4 | Animateur - Classe nature | Animateur - Classe nature |
| 5 | Animateur - Programme EXPÉ | Animateur - Programme EXPÉ |
| 6 | Formateur - Programme sauvetage | Formateur - Programme sauvetage |
| 7 | Formateur PAM DAFA - Programme ASPI | Formateur PAM DAFA - Programme ASPI |
| 8 | Sauveteur plage | Sauveteur plage |

Chaque branche : recherche des pièces jointes → courriel → `✏️ Envoi courriel ?` décochée + `Dernier courriel envoyé` = « Courriel {{Statut candidature}} envoyé le {{date-heure ISO}} ».

Conflit à noter : comme 3.2 (déployée) a le **même déclencheur**, déployer 3.3 tel quel enverrait deux courriels de bienvenue à un « Animateur - Classe nature » accepté pour l'automne, l'hiver ou le printemps (branche 4 ici sans filtre de saison + branche hors saison de 3.2).

**Courriel (identique dans les 8 branches)**

- Compte : « Inscriptions BPA » ; nom d'expéditeur : « Base de Plein Air Mont-Tremblant »
- À : `{{Courriel}}`
- Objet : « Bienvenue dans l'équipe ! »
- Pièces jointes : fichiers `Attachments` des enregistrements de Pièces jointes trouvés (Été × poste × 1 × BPA).

```
Salut {{Prénom}},
Merci encore d'avoir pris le temps de participer au processus d'entrevue. On a bien hâte de commencer la prochaine saison avec toi : **Bienvenue dans l'aventure 🥳**

**💼 Dossier d'embauche**
Afin de compléter ton dossier employé, je t'invite à remplir [ce formulaire d'embauche.](https://airtable.com/appzxLZ4ZO0kb65xU/pagrBKfcmnvR480Mb/form)
Ce formulaire te permettra de :
* Fournir certaines informations,
* Valider tes disponibilités,
* Téléverser les documents requis.

Tu trouveras également, en pièces jointes, les documents suivants, qui devront être signés et déposés directement dans le formulaire :
* Ton contrat de travail,
* Le consentement parental (À remplir si tu as moins de 18 ans à la date de début de ton contrat).

**🤝 Vie de camp et communications**
Les informations liées au fonctionnement du camp, aux communications internes et aux prochaines étapes te seront transmises via un **groupe Facebook privé** regroupant l'ensemble des employés. Ce groupe deviendra notre principal moyen de communication pour la suite. L'invitation pour rejoindre le groupe se trouve à la fin du formulaire d'embauche.

N'oublie pas de t'abonner à nos différentes pages si ce n'est pas encore fait : [Base de Plein Air Mont-Tremblant](https://www.instagram.com/camptremblant/) (camp régulier), [Opikawa](https://www.instagram.com/opikawa_/) (camp international et immersion linguistique), [Rouge&Diable](https://www.instagram.com/rougeetdiable/) (centre de location d'embarcations) et [Aquabounga](https://www.instagram.com/aquabounga/) (structures gonflables sur l'eau).

Si tu as des questions concernant ton embauche ou ton dossier employé, n'hésite pas à m'écrire.
On a bien hâte de travailler avec toi,
À très bientôt !

Charlotte Féral-Basin | Co-Directrice
inscriptions@camptremblant.com
+1 (819) 425-2461
camptremblant.com
```

Le lien pointe vers le formulaire **« Confirmation d'embauche »** (été, `pagrBKfcmnvR480Mb`). Le courriel annonce que « l'invitation pour rejoindre le groupe [Facebook] se trouve à la fin du formulaire d'embauche » — or la dernière section du formulaire (« Groupe Facebook et commentaires ») ne contient **aucun lien ni texte d'invitation** (voir § 2.3).

### 3.4 Embauche - BPA - Échelon 1 - Partie 2 - Été (`wflWWTJKebuY8lVop`) — NON déployée

Suite de 3.3 (la séparation en deux parties vient vraisemblablement de la limite d'Airtable sur le nombre d'actions par automatisation : 8 branches × 3 actions = 24).

**Déclencheur** : identique à 3.2 et 3.3.

**Branches** (selon `✏️ Poste | Décision` seulement, sans condition de saison) — 7 branches :

| # | Poste \| Décision | Pièces jointes cherchées (Saison = Été, Échelon = 1, Compagnie = BPA, Poste = …) |
|---|---|---|
| 1 | Spécialiste escalade | Spécialiste escalade |
| 2 | Spécialiste photos & vidéos | Spécialiste photos & vidéos |
| 3 | Spécialiste transport | Spécialiste transport |
| 4 | Chef cuisinier | Chef cuisinier |
| 5 | Aide cuisinier | Aide cuisinier |
| 6 | Préposé à l'entretien | Préposé à l'entretien |
| 7 | Employé polyvalent | Employé polyvalent |

Actions et **courriel** : strictement identiques à 3.3 (compte « Inscriptions BPA », nom « Base de Plein Air Mont-Tremblant », objet « Bienvenue dans l'équipe ! », même corps, lien vers le formulaire été `pagrBKfcmnvR480Mb`, pièces jointes Été × poste × 1 × BPA ; puis décoche `✏️ Envoi courriel ?` et écrit `Dernier courriel envoyé`).

Conflit : « Employé polyvalent » (branche 7, sans filtre de saison) chevaucherait les branches automne/hiver/printemps de 3.2.

Postes de décision BPA couverts par **aucune** des trois automatisations BPA échelon 1 : Accompagnateur de groupe en ski hors hiver, Sauveteur sur structure gonflable, Conducteur minibus, Préposé à l'accueil, Prof de français / d'anglais langue seconde (normal : ce sont des postes d'autres compagnies).

### 3.5 Embauche - OPI - Échelon 1 - Été (`wfl4GKDW8QPCnYrlr`) — NON déployée

**Déclencheur** : `✏️ Statut candidature` = « Candidature acceptée » ET `✏️ Envoi courriel ?` coché ET `✏️ Compagnie | Décision` = « Opikawa » ET `✏️ Échelon | Décision` = « 1 ».

**Branches** (selon `✏️ Poste | Décision`, sans condition de saison) — 2 branches :

| # | Poste \| Décision | Pièces jointes cherchées |
|---|---|---|
| 1 | Prof d'anglais langue seconde | Saison = Été, Poste = Prof d'anglais langue seconde, Échelon = 1, Compagnie = Opikawa |
| 2 | Prof de français langue seconde | Été, Prof de français langue seconde, 1, Opikawa |

Les autres postes Opikawa (coordonnateur, animateurs, etc.) n'ont pas de branche.

Chaque branche : recherche → courriel → décoche `✏️ Envoi courriel ?` + `Dernier courriel envoyé` = « Courriel {{Statut candidature}} envoyé le {{date-heure ISO}} ».

**Courriel** — compte « Coordo OPI », nom d'expéditeur « Opikawa », à `{{Courriel}}`, objet « Bienvenue dans l'équipe ! », pièces jointes = `Attachments` des Pièces jointes trouvées. Corps **identique à 3.3** (lien vers le formulaire été `pagrBKfcmnvR480Mb`, consentement parental « si tu as moins de 18 ans à la date de début de ton contrat », paragraphe Facebook, liste Instagram), sauf la signature :

```
Charlotte Féral-Basin | Co-Directrice / Co-Director / Codirectora
messages@opikawa.com
+1 (888) 890-2887
opikawa.com
```

### 3.6 Embauche - AQB - Échelon 1 (`wflpMeiScPPkbHd9N`) — NON déployée

**Déclencheur** : `✏️ Statut candidature` = « Candidature acceptée » ET `✏️ Envoi courriel ?` coché ET `✏️ Compagnie | Décision` = « Aquabounga » ET `✏️ Échelon | Décision` = « 1 ».

**Branche unique** : `✏️ Poste | Décision` = « Sauveteur sur structure gonflable » → recherche Pièces jointes (Saison = Été, Poste = Sauveteur sur structure gonflable, Compagnie = Aquabounga, Échelon = 1) → courriel → décoche + `Dernier courriel envoyé` (même format que 3.5).

(Le poste « Aquabounga : Coordonnateur » n'a pas de branche.)

**Courriel** — compte « Info AQB », nom d'expéditeur « Aquabounga », à `{{Courriel}}`, objet « Bienvenue dans l'équipe ! », pièces jointes trouvées.

```
Salut {{Prénom}},
Merci encore d'avoir pris le temps de participer au processus d'entrevue. On a bien hâte de commencer la prochaine saison avec toi : **Bienvenue dans l'aventure 🥳**

**💼 Dossier d'embauche**
Afin de compléter ton dossier employé, je t'invite à remplir [ce formulaire d'embauche.](https://airtable.com/appzxLZ4ZO0kb65xU/pagrBKfcmnvR480Mb/form)
Ce formulaire te permettra de :
* Fournir certaines informations,
* Valider tes disponibilités,
* Téléverser les documents requis.

Tu trouveras également, en pièces jointes, les documents suivants, qui devront être signés et déposés directement dans le formulaire :
* Ton contrat de travail,
* Le consentement parental (À remplir si tu as moins de 18 ans au 1er mai 2026).

**🤝 Vie de camp et communications**
Les informations liées au fonctionnement du camp, aux communications internes et aux prochaines étapes te seront transmises via un **groupe Facebook privé** regroupant l'ensemble des employés. Ce groupe deviendra notre principal moyen de communication pour la suite. L'invitation pour rejoindre le groupe se trouve à la fin du formulaire d'embauche.

N'oublie pas de t'abonner à nos différentes pages si ce n'est pas encore fait : [Base de Plein Air Mont-Tremblant](https://www.instagram.com/camptremblant/) (camp régulier), [Opikawa](https://www.instagram.com/opikawa_/) (camp international et immersion linguistique), [Rouge&Diable](https://www.instagram.com/rougeetdiable/) (centre de location d'embarcations) et [Aquabounga](https://www.instagram.com/aquabounga/) (structures gonflables sur l'eau).

Si tu as des questions concernant ton embauche ou ton dossier employé, n'hésite pas à m'écrire.
On a bien hâte de travailler avec toi,
À très bientôt !

Vickie Leuenberger | Co-directrice générale
+1 (819) 803-3819
aquabounga.ca
```

Différence avec la BPA : la date de référence du consentement parental est **codée en dur** (« au 1er mai 2026 »).

### 3.7 Embauche - RD - Échelon 1 (`wflyD2cSE5BaYNoOW`) — NON déployée

**Déclencheur** : `✏️ Statut candidature` = « Candidature acceptée » ET `✏️ Envoi courriel ?` coché ET `✏️ Échelon | Décision` = « 1 » ET `✏️ Compagnie | Décision` = « Rouge&Diable ».

**Branche unique** : `✏️ Poste | Décision` = « Conducteur minibus » → recherche Pièces jointes (Saison = Été, Poste = Conducteur minibus, Compagnie = Rouge & Diable, Échelon = 1) → courriel → décoche + `Dernier courriel envoyé`.

(Les postes « Rouge & Diable : Coordonnateur » et « Préposé à l'accueil » n'ont pas de branche.)

**Courriel** — compte « Info RD », nom d'expéditeur « Rouge & Diable », à `{{Courriel}}`, objet « Bienvenue dans l'équipe ! », pièces jointes trouvées. Corps **identique à 3.6** (y compris « au 1er mai 2026 »), signature :

```
Vickie Leuenberger | Co-directrice générale
+1 (819) 201-1366
rougediable.ca
```

### 3.8 Candidature rejetée (après entrevue) (`wflPjFv95j0aT4WR6`) — déployée

**Déclencheur** : `✏️ Statut candidature` = « Candidature rejetée (après entrevue) » ET `✏️ Envoi courriel ?` coché.

**Branches** (selon `✏️ Compagnie | Décision`) : BPA · Opikawa · Aquabounga · Rouge&Diable · Trembloc. Compagnie vide → rien.

Chaque branche : courriel → décoche `✏️ Envoi courriel ?` → `Dernier courriel envoyé` = « Courriel {{Statut candidature}} envoyé le {{date-heure ISO}} ».

Destinataire : `{{Courriel}}`. Objet (toutes branches) : « Suivi entrevue ». Aucune pièce jointe.

**Branche BPA** — compte « Inscriptions BPA », nom d'expéditeur « Base de Plein Air Mont-Tremblant »

```
Bonjour {{Prénom}},

Nous tenons à te remercier d'avoir pris le temps de passer l'entrevue avec nous, ainsi que pour ton intérêt envers notre poste.

Ta candidature est très bonne. Toutefois, en raison du nombre élevé de candidatures reçues et du nombre limité de places au sein de l'équipe, nous ne serons malheureusement pas en mesure de t'offrir un poste pour la prochaine saison.

Nous conserverons néanmoins tes coordonnées dans notre banque de candidatures et n'hésiterons pas à te recontacter si une place venait à se libérer d'ici le début de la saison.
Nous t'encourageons à soumettre à nouveau ta candidature dans le futur et espérons avoir l'occasion de recroiser ton chemin.
Bonne continuation et merci encore pour ton intérêt,

La direction
inscriptions@camptremblant.com
+1 (819) 425-2461
camptremblant.com
```

**Branche Opikawa** — compte « Coordo OPI », nom « Opikawa ». Même texte avec « ton intérêt envers **le** poste » et — **bogue** — la salutation est « Bonjour , » suivie d'un saut de ligne puis du prénom (`Bonjour , <br>{{Prénom}}`). Signature : « La direction / messages@opikawa.com / +1 (888) 890-2887 / opikawa.com ».

**Branche Aquabounga** — compte « Info AQB », nom « Aquabounga ». Texte identique à la BPA. Signature : « La direction / +1 (819) 803-3819 / aquabounga.ca ».

**Branche Rouge&Diable** — compte « Info RD », nom « Rouge & Diable ». Texte identique à la BPA. Signature : « La direction / +1 (819) 201-1366 / rougediable.ca ».

**Branche Trembloc** — compte « Inscriptions BPA », nom « Trembloc ». Texte identique à la BPA. Signature BPA (La direction / inscriptions@camptremblant.com / +1 (819) 425-2461 / camptremblant.com).

### 3.9 Candidature rejetée (équipe complète) (`wflLGMfVxxStFbr35`) — déployée

**Déclencheur** : `✏️ Statut candidature` = « Candidature rejetée (équipe complète) » ET `✏️ Envoi courriel ?` coché.

**Branches** (selon `✏️ Compagnie | Décision`) : BPA · Opikawa · Aquabounga · Rouge&Diable · Trembloc. Mêmes mises à jour qu'en 3.8.

Destinataire : `{{Courriel}}`. Objet (toutes branches) : « Suivi candidature ». Aucune pièce jointe.

**Branche BPA** — compte « Inscriptions BPA », nom « Base de Plein Air Mont-Tremblant »

```
Bonjour {{Prénom}},

Nous avons bien reçu ta candidature et nous te remercions pour l'intérêt que tu portes à notre poste. Nous sommes ravis qu'il ait retenu ton attention.

Malheureusement, notre équipe pour la saison à venir est déjà complète. Nous conserverons toutefois ton CV dans notre banque de candidatures et n'hésiterons pas à te recontacter si un poste venait à se libérer.

Merci encore pour ton intérêt et très bonne continuation !
La direction
inscriptions@camptremblant.com
+1 (819) 425-2461
camptremblant.com
```

**Branche Opikawa** — compte « Coordo OPI », nom « Opikawa ». Variantes : « l'intérêt que tu portes à **notre camp de vacances** » ; « notre équipe pour **l'été** à venir ». Signature « La direction / messages@opikawa.com / +1 (888) 890-2887 / opikawa.com ».

**Branche Aquabounga** — compte « Info AQB », nom « Aquabounga ». Variantes : « l'intérêt que tu portes à **notre structure gonflable**. Nous sommes ravis que **celle-ci** ait retenu ton attention. » ; « pour **l'été** à venir ». Signature « La direction / +1 (819) 803-3819 / aquabounga.ca ».

**Branche Rouge&Diable** — compte « Info RD », nom « Rouge & Diable ». Variantes : « l'intérêt que tu portes à **notre centre de location d'embarcations nautiques** » ; « pour **l'été** à venir ». Signature « La direction / +1 (819) 201-1366 / rougediable.ca ».

**Branche Trembloc** — compte « Inscriptions BPA », nom d'expéditeur **« Base de Plein Air Mont-Tremblant »** (et non « Trembloc », contrairement à 3.1 et 3.8). Variantes : « l'intérêt que tu portes à **notre centre d'escalade** » ; « pour la saison à venir ». Signature BPA.

### 3.10 BPA - Proposition ASPI (`wflk296AMjIxaNCAv`) — déployée

**Déclencheur** : `✏️ Statut candidature` = « Proposition ASPI » ET `✏️ Envoi courriel ?` coché ET `✏️ Compagnie | Décision` = « Base de Plein Air Mont-Tremblant ». Pas de branche (BPA seulement).

**Actions** : courriel → décoche `✏️ Envoi courriel ?` → `Dernier courriel envoyé` = « Courriel {{Statut candidature}} envoyé le {{date-heure ISO}} ».

**Courriel** — compte « Inscriptions BPA », nom « Base de Plein Air Mont-Tremblant », à `{{Courriel}}`, objet « Suivi candidature », aucune pièce jointe.

```
Bonjour {{Prénom}},

Nous avons bien reçu ta candidature et nous te remercions pour l'intérêt que tu portes à notre camp de vacances. Nous sommes ravis qu'il ait retenu ton attention.

Malheureusement, notre équipe pour l'été à venir est déjà complète.

Nous pouvons toutefois te parler du programme Aspirant-moniteur (ASPI) que nous offrons aux jeunes de secondaire 4 et 5. Ce programme est conçu pour les jeunes qui souhaitent découvrir l'animation en camp et apprendre les bases du métier d'animateur. Nous sommes convaincue que ce programme pourrait te donner une belle première expérience et te préparer pour soumettre ta candidature à nouveau l'an prochain.
Pour en savoir plus : http://camptremblant.com/aspi

Nous t'encourageons à considérer cette opportunité,
Merci encore pour ton intérêt et très bonne continuation !
La direction
inscriptions@camptremblant.com
+1 (819) 425-2461
camptremblant.com
```

(Coquille « Nous sommes convaincue » ; un `</div>` orphelin après le lien ASPI. La pré-décision « Proposer ASPI » existe mais ne déclenche rien : c'est le **statut** « Proposition ASPI » qui déclenche.)

### 3.11 BPA - Candidatures sans permis de travail (`wflyGJn0ak9oO43YS`) — déployée

**Déclencheur** : `✏️ Statut candidature` = « Question permis de travail » ET `✏️ Envoi courriel ?` coché ET `✏️ Compagnie | Décision` = « Base de Plein Air Mont-Tremblant ». Pas de branche.

(Le statut n'est pas posé automatiquement : la direction doit repérer elle-même le « Statut de citoyenneté » = « Étranger·ère sans permis de travail valide au Canada ».)

**Actions** : courriel → décoche `✏️ Envoi courriel ?` → `Dernier courriel envoyé` (même format).

**Courriel** — compte « Inscriptions BPA », nom « Base de Plein Air Mont-Tremblant », à `{{Courriel}}`, objet « Suivi candidature », aucune pièce jointe.

```
Bonjour {{Prénom}},

Nous avons bien reçu ta candidature et te remercions pour ton intérêt à travailler avec nous.

Avant d'aller plus loin dans l'analyse de ta candidature, nous souhaitons valider une information. Tu as indiqué dans ton formulaire ne pas détenir actuellement de permis de travail valide au Canada.

Es-tu présentement en attente d'un PVT ou d'un autre permis de travail qui te permettrait de travailler au Canada? Si oui, peux-tu nous indiquer où en est ta démarche et, si tu le sais, à quel moment tu prévois obtenir ton permis?

À noter que nous n'offrons malheureusement pas d'accompagnement ni de parrainage pour l'obtention d'un permis de travail pour une saison précise.

Merci encore pour ton intérêt et au plaisir d'avoir de tes nouvelles!
La direction
inscriptions@camptremblant.com
+1 (819) 425-2461
camptremblant.com
```

### 3.12 Réception - Nouvelle candidature (`wflu0xr3NjT06W1zk`) — déployée

**Déclencheur** : soumission du formulaire « Dépôt de candidatures » (`pag3yj3XvFt8SfebP`).

**Courriel interne** — compte « Inscriptions BPA », nom d'expéditeur « Airtable - BPA », à **charlotte@camptremblant.com** (co-directrice, adresse fixe), objet « Nouveau formulaire », aucune pièce jointe.

```
Il y a une nouvelle candidature à analyser !

[AIRTABLE ICI](https://airtable.com/appzxLZ4ZO0kb65xU/tblP3UhfHkWcvaaKu/viw2vjYOHjASGbnq4/)
```

Aucun accusé de réception n'est envoyé au **candidat**.

### 3.13 Réception - Intention de retour (`wflICVheFfZ2bQbX5`) — déployée

**Déclencheur** : soumission du formulaire « Intention de retour » (`pagJgXEh4LVYnAsvv`).

**Courriel interne** — compte « Inscriptions BPA », nom « Airtable - BPA », à charlotte@camptremblant.com, objet « Nouveau formulaire ».

```
Il y a une nouvelle INTENTION DE RETOUR à consulter !

[AIRTABLE ICI](https://airtable.com/appzxLZ4ZO0kb65xU/tblP3UhfHkWcvaaKu/viw2vjYOHjASGbnq4/)
```

### 3.14 Réception - Confirmation d'embauche (`wfl2iVWX19tTkth9j`) — déployée

**Déclencheur** : soumission du formulaire « Confirmation d'embauche » (été, `pagrBKfcmnvR480Mb`) **seulement** ; la version « Hors été » n'a pas d'alerte.

**Courriel interne** — compte « Inscriptions BPA », nom « Airtable - BPA », à charlotte@camptremblant.com, objet « Nouveau formulaire ».

```
Il y a une nouvelle confirmation d'embauche à consulter !

[AIRTABLE ICI](https://airtable.com/appzxLZ4ZO0kb65xU/tblP3UhfHkWcvaaKu/viw2vjYOHjASGbnq4/)
```

Le lien mène à une vue de la table **Candidatures** (`viw2vjYOHjASGbnq4`), pas à la table Embauches où la confirmation vient d'être créée.

### 3.15 Création d'un humain lorsque réception d'une candidature (`wflP2hhxDhKSw3e1o`) — déployée

**Déclencheur** : création d'un enregistrement dans Candidatures (donc à chaque « Dépôt de candidatures » **et** chaque « Intention de retour », et aussi à toute création manuelle).

**Action** : script, entrée `recordId` = ID de la candidature créée.

Logique : lit Courriel / Prénom / Nom de famille de la candidature ; si pas de courriel → **erreur** (l'automatisation échoue, aucun humain) ; charge **tous** les Humains et cherche un courriel identique (comparaison insensible à la casse ; le courriel de la candidature est nettoyé des espaces, celui de l'humain ne l'est pas) ; s'il existe → ajoute la candidature à son champ `Candidatures` ; sinon → crée un humain (Courriel, Prénom, Nom, Candidatures).

Code complet :

```javascript
// Tables
const candidaturesTable = base.getTable("Candidatures");
const humainsTable = base.getTable("Humains");

// Inputs
const { recordId } = input.config();
console.log("🔵 recordId reçu :", recordId);

// Récupérer la candidature déclencheuse
const candidatureRecord = await candidaturesTable.selectRecordAsync(recordId);

if (!candidatureRecord) {
    console.error("❌ Candidature introuvable pour ID :", recordId);
    throw new Error("Candidature introuvable.");
}

console.log("🟢 Candidature trouvée :", candidatureRecord.id);

// 🔎 Log de TOUS les champs de la candidature
console.log("📋 Champs de la candidature :");
for (let field of candidaturesTable.fields) {
    console.log(
        `- ${field.name}:`,
        candidatureRecord.getCellValue(field.name)
    );
}

// Récupérer les infos principales
const email = (candidatureRecord.getCellValueAsString("Courriel") || "").trim();
const prenom = (candidatureRecord.getCellValueAsString("Prénom") || "").trim();
const nom = (candidatureRecord.getCellValueAsString("Nom de famille") || "").trim();

console.log("📨 Email extrait :", email);
console.log("👤 Prénom extrait :", prenom);
console.log("👤 Nom extrait :", nom);

if (!email) {
    console.error("❌ Aucun courriel trouvé dans la candidature.");
    throw new Error("Aucun courriel trouvé dans la candidature.");
}

// Charger les humains
console.log("📥 Chargement des humains...");
const humainsQuery = await humainsTable.selectRecordsAsync();
console.log("👥 Nombre d'humains trouvés :", humainsQuery.records.length);

// Chercher un humain existant avec ce courriel
let humainExistant = humainsQuery.records.find(record => {
    const humainEmail = (record.getCellValueAsString("Courriel") || "").toLowerCase();
    const match = humainEmail === email.toLowerCase();

    console.log(
        `🔎 Comparaison email → Humain: ${humainEmail} | Candidature: ${email.toLowerCase()} | Match: ${match}`
    );

    return match;
});

// ID de la candidature à lier
const candidatureLink = [{ id: recordId }];
console.log("🔗 Lien candidature à ajouter :", candidatureLink);

if (humainExistant) {
    console.log("🔁 Humain existant trouvé :", humainExistant.id);

    const candidaturesActuelles = humainExistant.getCellValue("Candidatures") || [];
    console.log("📎 Candidatures actuelles :", candidaturesActuelles);

    const nouvellesCandidatures = [...candidaturesActuelles, ...candidatureLink];
    console.log("📎 Candidatures après ajout :", nouvellesCandidatures);

    await humainsTable.updateRecordAsync(humainExistant.id, {
        "Candidatures": nouvellesCandidatures
    });

    console.log("✅ Humain mis à jour avec succès :", humainExistant.id);

} else {
    console.log("➕ Aucun humain trouvé. Création d'un nouvel humain...");

    const newRecordId = await humainsTable.createRecordAsync({
        "Courriel": email,
        "Prénom": prenom,
        "Nom": nom,
        "Candidatures": candidatureLink
    });

    console.log("✅ Nouvel humain créé avec ID :", newRecordId);
}

console.log("🏁 Automatisation terminée avec succès.");
```

Remarques : le script écrit **tous les champs de la candidature** dans le journal d'exécution d'Airtable (données personnelles dans les logs) et une ligne de log par humain existant (lent, bruyant). Le champ `Calcul` (= RECORD_ID()) n'est pas utilisé par ce script (l'ID vient du déclencheur).

### 3.16 Association d'un formulaire d'embauche à un humain (`wflHfEbdAFLGWBLDe`) — déployée

**Déclencheur** : création d'un enregistrement dans Embauches (formulaires « Confirmation d'embauche » été **et** hors été).

**Action** : script, entrée `recordId` = ID de l'embauche créée. Cherche l'humain dont le courriel (insensible à la casse) égale celui de l'embauche et ajoute l'embauche à son champ `Embauches`. Si aucun humain → **erreur bloquante** (l'embauche reste orpheline ; elle ne crée pas d'humain).

Code complet :

```javascript
// Tables
const embauchesTable = base.getTable("Embauches");
const humainsTable = base.getTable("Humains");

// Inputs
const { recordId } = input.config();

// Récupérer l'embauche déclencheuse
const embaucheRecord = await embauchesTable.selectRecordAsync(recordId);

if (!embaucheRecord) {
    throw new Error("Embauche introuvable.");
}

// Récupérer le courriel
const email = embaucheRecord.getCellValueAsString("Courriel").trim();

if (!email) {
    throw new Error("Aucun courriel trouvé dans l'embauche.");
}

// Charger les humains
const humainsQuery = await humainsTable.selectRecordsAsync();

// Chercher l'humain correspondant
const humain = humainsQuery.records.find(
    record => record.getCellValueAsString("Courriel").toLowerCase() === email.toLowerCase()
);

if (!humain) {
    // ❌ Erreur bloquante si aucun humain trouvé
    throw new Error(`Aucun humain trouvé avec le courriel : ${email}`);
}

// Lier l'embauche
const embauchesActuelles = humain.getCellValue("Embauches") || [];

await humainsTable.updateRecordAsync(humain.id, {
    "Embauches": [...embauchesActuelles, { id: recordId }]
});
```

Conséquence : si l'employé remplit la confirmation d'embauche avec un **autre courriel** que celui de sa candidature (fréquent : courriel personnel ↔ scolaire), l'embauche n'est rattachée à personne. Le champ texte `Humains 2` d'Embauches semble être une trace de rattachement manuel.

---

## 4. Table « Pièces jointes » — contenu

29 enregistrements, **tous à l'échelon 1**. Un seul contient des fichiers.

| Saison | Poste | Échelon | Compagnie | Fichiers joints |
|---|---|---|---|---|
| Automne | Animateur - Classe nature | 1 | Base de Plein Air Mont-Tremblant | « BPA - Animateur Classes Rouges - Contrat.pdf » ; « Consentement parental.pdf » |
| Automne | Employé polyvalent | 1 | Base de Plein Air Mont-Tremblant | (aucun) |
| Hiver | Animateur - Classe nature | 1 | Base de Plein Air Mont-Tremblant | (aucun) |
| Hiver | Employé polyvalent | 1 | Base de Plein Air Mont-Tremblant | (aucun) |
| Hiver | Accompagnateur en groupe de ski | 1 | Base de Plein Air Mont-Tremblant | (aucun) |
| Printemps | Animateur - Classe nature | 1 | Base de Plein Air Mont-Tremblant | (aucun) |
| Printemps | Employé polyvalent | 1 | Base de Plein Air Mont-Tremblant | (aucun) |
| Été | Coordonnateur | 1 | Base de Plein Air Mont-Tremblant | (aucun) |
| Été | Aide de camp | 1 | Base de Plein Air Mont-Tremblant | (aucun) |
| Été | Animateur - Camp d'été | 1 | Base de Plein Air Mont-Tremblant | (aucun) |
| Été | Animateur - Classe nature | 1 | Base de Plein Air Mont-Tremblant | (aucun) |
| Été | Animateur - Programme EXPÉ | 1 | Base de Plein Air Mont-Tremblant | (aucun) |
| Été | Formateur - Programme sauvetage | 1 | Base de Plein Air Mont-Tremblant | (aucun) |
| Été | Formateur PAM DAFA - Programme ASPI | 1 | Base de Plein Air Mont-Tremblant | (aucun) |
| Été | Sauveteur plage | 1 | Base de Plein Air Mont-Tremblant | (aucun) |
| Été | Spécialiste escalade | 1 | Base de Plein Air Mont-Tremblant | (aucun) |
| Été | Spécialiste photos & vidéos | 1 | Base de Plein Air Mont-Tremblant | (aucun) |
| Été | Spécialiste transport | 1 | Base de Plein Air Mont-Tremblant | (aucun) |
| Été | Chef cuisinier | 1 | Base de Plein Air Mont-Tremblant | (aucun) |
| Été | Aide cuisinier | 1 | Base de Plein Air Mont-Tremblant | (aucun) |
| Été | Préposé à l'entretien | 1 | Base de Plein Air Mont-Tremblant | (aucun) |
| Été | Employé polyvalent | 1 | Base de Plein Air Mont-Tremblant | (aucun) |
| Été | Prof d'anglais langue seconde | 1 | Opikawa | (aucun) |
| Été | Prof de français langue seconde | 1 | Opikawa | (aucun) |
| Été | Sauveteur sur structure gonflable | 1 | Aquabounga | (aucun) |
| Été | Conducteur minibus | 1 | Rouge & Diable | (aucun) |
| Été | Préposé à l'accueil | 1 | Rouge & Diable | (aucun) |
| Été | Spécialiste escalade | 1 | Trembloc | (aucun) |
| Été | Préposé à l'accueil | 1 | Trembloc | (aucun) |

Constats :
- Seule la combinaison **Automne / Animateur - Classe nature / BPA** a son contrat et son consentement parental. Toute autre embauche automatisée partirait **sans pièce jointe**, alors que le courriel annonce le contrat « en pièces jointes ». Les enregistrements « Été » datent du 2026-02-23 (vidés depuis ?), les autres du 2026-08-24.
- Le consentement parental est un document générique ; il est rangé par poste (doublon à prévoir pour chaque ligne).
- Les lignes Trembloc et « Préposé à l'accueil » de Rouge & Diable n'ont aucune automatisation qui les utilise.

---

## 5. Vues des tables

**Candidatures** (1 vue) : « Toutes les candidatures » (grille) — c'est la vue `viw2vjYOHjASGbnq4` ciblée par les liens « AIRTABLE ICI » des alertes.

**Embauches** (9 vues, toutes en grille) : « Toutes les embauches » · « BPA » · « Programme » · « AQB » · « Rouge et Diable » · « Premiers soins » · « Anniversaires » · « Certifications » · « VAJ ».

(Les vues d'Embauches suggèrent les usages réels : listes par compagnie, suivi des cartes de premiers soins et certifications, anniversaires, vérifications d'antécédents judiciaires.)

---

## 6. Statistiques anonymes (au 2026-10-11)

### 6.1 Candidatures — 319 enregistrements, tous déposés en 2026

**Par `✏️ Statut candidature`**

| Statut | Nombre |
|---|---|
| Candidature acceptée | 93 |
| Candidature rejetée (après entrevue) | 59 |
| Candidature rejetée (équipe complète) | 55 |
| En attente | 47 |
| A refusé le poste | 28 |
| Proposition ASPI | 21 |
| Question permis de travail | 13 |
| Proposition d'entrevue | 3 |
| Application | **0** |
| (vide) | 0 |

Aucune candidature n'est restée au statut « Application » : le statut sert d'état final plutôt que d'étape (une candidature passe par « Proposition d'entrevue » puis est écrasée par la décision).

**Par `Saison | Application`** (choix multiple : une candidature compte dans chaque saison cochée)

| Saison | Candidatures qui la cochent |
|---|---|
| Été 2026 | 272 |
| Printemps 2026 | 54 |
| Automne 2026 | 33 |
| Hiver 2027 | 17 |
| Printemps 2027 | 9 |
| Été 2027 | 6 |
| (aucune) | 16 (surtout des « Intention de retour » = Non) |

Nombre de saisons cochées : 1 saison → 234 ; 2 → 55 ; 3 → 9 ; 4 → 5 ; 0 → 16. Combinaison la plus fréquente après « Été 2026 » seul (218) : « Printemps 2026 + Été 2026 » (45).

**Dépôts par mois (date de création)** : janv. 122 · févr. 45 · mars 46 · avr. 23 · mai 19 · juin 32 · juil. 5 · août 24 · sept. 3.

**Autres répartitions utiles**

- `✏️ Compagnie | Décision` : BPA 254 · Aquabounga 21 · Opikawa 15 · Rouge&Diable 10 · (vide) 19 · Trembloc 0.
- `✏️ Saison | Décision` : (vide) 241 · Été 2026 64 · Automne 2026 9 · Printemps 2026 4 · Été 2027 1.
- `✏️ Échelon | Décision` : (vide) 249 · 1 → 38 · 2 → 22 · 3 → 5 · 4 → 5. Parmi les 93 acceptées : échelon 1 → 36, 2 → 22, 3 → 5, 4 → 4, vide → 26. Donc ~57 acceptations (échelons 2–4 ou vides) n'ont **aucune** automatisation possible et ont été traitées à la main.
- `✏️ Poste | Décision` des acceptées : Animateur - Camp d'été 26 · (vide) 22 · Animateur - Classe nature 9 · Sauveteur sur structure gonflable 7 · Coordonateur 6 · Conducteur minibus 5 · Aide cuisinier 5 · Aide de camp 3 · Formateur PAM DAFA 3 · un seul pour Employé polyvalent, Prof de français, Prof d'anglais, Animateur EXPÉ, Spécialiste escalade, Sauveteur plage, Spécialiste photos & vidéos.
- `✏️ Pré-décision` : (vide) 204 · Oui 39 · Non 39 · Maybe 24 · Proposer ASPI 10 · Bof 3.
- `Intention retour | Ancien` (réponses au formulaire Intention de retour) : Oui 57 · Non 16 · (vide = dépôt normal) 246. Les « Oui » finissent à 48 « Candidature acceptée », 5 « A refusé le poste ».
- `Statut de citoyenneté` : Citoyen·ne canadien·ne 183 · (vide, intentions de retour) 73 · Étranger avec permis 27 · Étranger sans permis 25 · Résident permanent 11.
- `Qu'est-ce qui vous a incité à postuler ?` : site de l'ACQ 72 · site de l'entreprise 64 · (vide) 51 · ancien employé 45 · référence d'un ami 29 · groupe Facebook 25 · Indeed/LinkedIn 19 · ancien ASPI 10 · recruté par un directeur 4.
- `Date d'entrevue` remplie : 101 sur 319.
- `✏️ Envoi courriel ?` cochée : 0 (aucun envoi en attente).
- Lien `Humains` : 316 candidatures liées à 1 humain, 2 liées à 2 humains (doublon), 1 sans humain (échec du script).

**`Dernier courriel envoyé`** — ce champ sert à la fois de journal automatique et de **note libre** :

- format automatique « Courriel {{statut}} envoyé le {{ISO}} [via {{compagnie}}] » : Proposition d'entrevue 44, Rejet après entrevue 45, Rejet équipe complète 44, Candidature acceptée 28, Question permis de travail 13, Proposition ASPI 11 ;
- notes saisies à la main (~65) : « Formulaire d'embauche envoyé le <date> » (≈ 32, février–avril, avant que les automatisations d'embauche n'existent), « Refus envoyé », « Mail de refus / proposition ASPI envoyé », « Suivi par mail direct », « Envoi manuel », « Pas d'envoi de courriel », envoi par la boîte d'une autre compagnie, refus avec contre-proposition d'un autre poste, etc. ;
- vide : 46.

Les 28 courriels « Candidature acceptée » automatiques sont tous à l'**échelon 1** : mars–août 2026 pour l'été (BPA : Animateur - Camp d'été ×10, Aide cuisinier ×3, Aide de camp ×2, Sauveteur plage, Animateur EXPÉ ; Aquabounga : Sauveteur structure gonflable ×4 ; Rouge&Diable : Conducteur minibus ×1), puis août–septembre pour l'automne (BPA : Animateur - Classe nature Automne 2026 ×6). **Les automatisations « Été » de la BPA (3.3, 3.4), d'Aquabounga (3.6) et de Rouge & Diable (3.7) ont donc tourné pendant la saison puis ont été désactivées** (aucun envoi automatique observé pour Opikawa, 3.5), et l'automatisation « Hors saison » (3.2) a pris le relais : on bascule à la main d'un jeu à l'autre selon la saison. Les contrats en pièces jointes Été ont depuis été retirés de la table Pièces jointes.

### 6.2 Embauches — 70 enregistrements

- **`Date d'embauche / réembauche` : vide pour les 70.** Statistique par année impossible ; par mois de création de la fiche : févr. 1 · **mars 40** · avr. 8 · mai 5 · juin 3 · juil. 5 · août 4 · sept. 4.
- **`Type d'employé` : vide pour les 70.** Idem pour `Action` (A/M) : jamais rempli.
- `4%` : 0% → 46 · 4% sur chaque paie → 15 · 4% banque vacances → 0 · vide → 9.
- `Type de rémunération` : À la semaine → 50 · À l'heure → 13 · vide → 7.
- `Ancien` : Oui → 33 · Non → 31 · vide → 6.
- `Êtes-vous étudiant à temps plein?` : Oui → 53 · Non → 17.
- `Code d'éthique` coché : 70/70.
- Lien `Humains` : 68 rattachées, **2 orphelines** (courriel différent de la candidature → échec du script 3.16).
- Les champs remplis par la direction (4%, rémunération, ancien) sont vides sur les fiches de juillet–septembre : le traitement paie se fait par lots.

70 dossiers d'embauche pour 93 candidatures acceptées (certains acceptés ont refusé ensuite, d'autres n'ont pas rempli le formulaire).

---

## 7. Google Sheets « Suivi RH 2026 »

Fichier `1vszl-NNdhIHYlsau0VjVpwtloUvAlFf-RD7NKNbEqqM`. Deux onglets : **« Feuille 1 »** (A1:AA120, la grille de planification de l'été) et **« Diètes par semaine »** (A1:K11, tableau de synthèse pour la cuisine). Rien n'est relié à Airtable : tout est ressaisi à la main (diète, allergies, tailles, etc. recopiées des confirmations d'embauche).

### 7.1 « Feuille 1 » — structure

Une ligne par personne, regroupées par **branche** (colonne A, ligne d'en-tête de groupe) puis par **poste** (colonne B, ligne d'en-tête de sous-groupe, puis numéro d'ordre 1, 2, 3… sur chaque ligne de personne).

**Colonnes**

| Col. | En-tête (ligne 2) | Ligne 1 (dates) | Contenu |
|---|---|---|---|
| A | Branches 🦥 | | Nom de la branche sur la ligne de groupe |
| B | Postes 💼 | | Nom du poste (ligne de sous-groupe) ou numéro de place (1, 2, …) ; pour la direction et les coordos, le titre directement (« Direction générale », « Coordo BPA 1 », « Coordo OPI 2 », « Coordo AQB », « Conseiller ») ; une place notée « (Besoins ponctuels) 7 » |
| C | Empoyés 🧑‍💼 (sic) | | Nom de la personne |
| D | Nom de camp | | Surnom de camp |
| E | Réponse formulaire | | Note libre sur ce que la personne a demandé : « Anim », « Anim / ASPI / EXPÉ », « Anim / EXPÉ (En+) », « Anim / Transport », « Anim (En+) », « Anim / EXPÉ », « Anim - English camp », « ASPI / Photos », « One time helper », « CV + One time helper », « Cuisine + Anim », « Gardienne Rochambeau », « Gardien Rochambeau », « (20 juin fin école) » |
| F | Formation 1 | 1er au 03 mai | présence à la formation |
| G | Formation 2 | 05 au 07 juin | idem |
| H | Formation 3 | 26-27 juin | idem |
| I | Aquab+R&D | 21 au 27 juin | semaine de pré-saison Aquabounga + Rouge & Diable |
| J | Semaine 0 | 22 au 26 juin | pré-semaine (quelques anims) |
| K–S | Semaine 1 … Semaine 9 | 28 juin au 05 juillet · 05 au 12 juillet · 12 au 19 juillet · 19 au 26 juillet · 26 juillet au 02 août · 02 au 09 août · 09 au 16 août · 16 au 23 août · 23 au 28 août | affectation de la semaine |
| T | (vide) | | séparateur |
| U | Diète | | Régulier · Végétarienne · Sans lactose · Sans porc (mêmes valeurs que le formulaire, sauf « Sans gluten » jamais utilisé) |
| V | Allergie alimentaire | | texte libre (12 lignes remplies) |
| W | Taille T-shirt | | Small · Medium · Large · X-Large (libellés longs, ≠ S/M/L/XL/XXL du formulaire) |
| X | Taille Hoodie | | Small · Medium · Large · X-Large · XX-Large (animation BPA/OPI et direction surtout) |
| Y | Hébergement ? | (« 0 » en ligne 1, probablement un total) | **vide partout** |
| Z | Chambre | | **vide partout** |
| AA | Invité SOFRT ADMIN | | ✅ pour 37 personnes (accès à un outil admin, vraisemblablement une app Softr branchée sur Airtable) |

**Lignes de pilotage (lignes 3 à 6, colonne E = libellé)**

| Ligne | Libellé | Formation 1 | Formation 2 | Formation 3 | Aquab+R&D | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | **Réel - Anim ou remplaçant 2025** (effectifs réels de l'an passé) | 48 | 31 | 11 | | 16 | 20 | 21 | 21 | 21 | 17 | 19 | 17 |
| 4 | **Projection - Besoin** (besoin 2026 en anims) | | | | | 20 | 24 | 24 | 24 | 21 | 21 | 22 | 19 |
| 5 | **Dispo 2026** (calculé) | 35 | 43 | 23 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 6 | (colonne C) **74** | | | | | | | | | | | | |

- « Dispo 2026 » compte visiblement les cases « Oui » (35 / 43 / 23 = nombre exact de « Oui » aux formations). Pour les semaines, il affiche **0** partout : les cases des animateurs ne contiennent plus « Oui » mais « Anim », « Remplaçant », « CDJ »… La formule n'a pas suivi le changement de codage → **total cassé**. En comptant « Anim » + « Remplaçant » sur toute la feuille, on obtient S1 13 · S2 18 · S3 20 · S4 20 · S5 17 · S6 13 · S7 19 · S8 12 (avec « CDJ » : 16 · 22 · 22 · 22 · 20 · 17 · 22 · 15), à comparer aux projections 20 · 24 · 24 · 24 · 21 · 21 · 22 · 19.
- « 74 » sous l'en-tête Employés est un total de personnes (la feuille compte 84 lignes nominatives ; la formule n'est pas visible à l'export CSV, l'écart vient sans doute des lignes exclues : direction, classes vertes ou autre).
- La ligne « Réel 2025 » est saisie à la main (sert de repère).

**Branches et postes (nombre de lignes de personnes)**

| Branche | Poste | Lignes | Codage habituel des semaines |
|---|---|---|---|
| Gestion | Direction générale | 5 (Marco Patriarco, Maxime Chamberland, Charlotte Féral-Basin, Vickie Leuenberger, Younes Khtouta) | « Gestion » S1–S6, « Oui » S7–S9 |
| Gestion | Coordo BPA 1, Coordo BPA 2, Coordo OPI 1, Coordo OPI 2, Coordo AQB | 1 chacun | « Gestion » S1–S6, « Oui » S7–S8 |
| Gestion | Conseiller | 2 | « Gestion » ou vide |
| Opérations | Entretien | 2 | « Oui » |
| Opérations | Aide de camp | 2 | « Oui » |
| Opérations | Cuisine | 6 (place « 0 » = responsable, en « Gestion ») | « Cuisine » |
| Opérations | Marmitons | 7 (dont une ligne sans numéro, « Non » partout) | « Cuisine », « Non », « Loutre » (prêté à R&D), « Congé » |
| Opikawa | Professeur FR | 2 | « Spécialiste » |
| Opikawa | Professeur ENG | 1 | « Spécialiste » |
| Rouge & Diable + Trembloc | Grande Loutre | 6 | « Loutre », parfois « CDJ », « Anim », « Non » |
| Pisciculture + Parc Éco | Loutres | 0 (places 1, 2, 3 vides) | — |
| Aquabounga | Sauveteur | 7 (dont « (Besoins ponctuels) 7 ») | « Sauveteur », « Non », « Congé » |
| BPA | Médias sociaux | 1 | « Spécialiste » |
| BPA | Programme ASPI | 1 | « Spécialiste » |
| BPA | Programme EXPÉ | 2 | « Anim », « Remplaçant », « Spécialiste », « Congé » |
| BPA | Programme Sauvetage | 1 | « n/a », « Spécialiste » |
| BPA | Sauveteur + infirmerie | 1 | « Spécialiste » |
| BPA | Escalade | 1 | « Spécialiste » |
| BPA | Transport | 1 | « Spécialiste » |
| BPA | Animateur | 28 (dont 6 « English camp », 6 « One time helper ») | « Anim », « Remplaçant », « CDJ », « Congé », « Spécialiste », « Coupé » |
| BPA | Classes vertes uniquement | 3 (« Cuisine + Anim », gardien·ne Rochambeau) | rien en été |

Les branches de la feuille (Gestion, Opérations, Opikawa, Rouge & Diable + Trembloc, Pisciculture + Parc Éco, Aquabounga, BPA) ne correspondent **ni** aux compagnies d'Airtable **ni** à ses postes (« Grande Loutre », « Marmitons », « Médias sociaux », « Sauveteur + infirmerie », « One time helper », « Classes vertes uniquement » n'existent pas dans Airtable ; « Pisciculture + Parc Éco » n'existe nulle part ailleurs).

**Valeurs des cases**

- Formations (F, G, H) : `Oui` · `Non` · `Congé` · `n/a` · (vide). Totaux « Oui » : F1 35, F2 43, F3 23.
- Aquab+R&D (I) : `Loutre` (6) · `Sauveteur` (4) · `Oui` (1) · `Non` (1) · (vide).
- Semaine 0 (J) : `Anim` (2) · `Remplaçant` (1).
- Semaines 1 à 9 (K–S), liste complète des valeurs distinctes et nombre total d'occurrences :

| Valeur | Occurrences | Sens (déduit) |
|---|---|---|
| `Anim` | 89 | animateur avec un groupe cette semaine |
| `Gestion` | 72 | direction / coordination / responsable de cuisine en poste |
| `Cuisine` | 71 | en poste à la cuisine |
| `Spécialiste` | 66 | poste spécialisé (prof, escalade, transport, photo, sauveteur-infirmerie, ASPI, EXPÉ…) |
| `Oui` | 58 | présent (postes sans rotation : entretien, aide de camp ; direction et coordos en S7–S9) |
| `Loutre` | 46 | employé Rouge & Diable / Trembloc (ou prêté à R&D) |
| `Remplaçant` | 45 | animateur volant / remplaçant |
| `Sauveteur` | 39 | sauveteur Aquabounga (une fois un anim BPA) |
| `Congé` | 37 | semaine de congé |
| `Non` | 33 | pas disponible / pas à l'horaire |
| `CDJ` | 24 | sens non documenté (rôle d'une semaine tenu par des anims et des « One time helpers » ; probablement « camp de jour » ou « chef de jour » — à confirmer) |
| `n/a` | 4 | non applicable |
| `Coupé` | 2 | semaine coupée / poste supprimé |
| (vide) | 170 | rien de prévu |

Par semaine (comptes de toutes les lignes) :

| Semaine | Gestion | Anim | Remplaçant | CDJ | Spécialiste | Cuisine | Loutre | Sauveteur | Oui | Congé | Non | Autre |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S1 | 12 | 9 | 4 | 3 | 7 | 8 | 6 | 5 | 4 | 10 | 4 | n/a 1 |
| S2 | 12 | 12 | 6 | 4 | 8 | 9 | 5 | 6 | 4 | 3 | 3 | n/a 1 |
| S3 | 12 | 13 | 7 | 2 | 8 | 9 | 6 | 5 | 4 | 2 | 4 | n/a 1 |
| S4 | 12 | 13 | 7 | 2 | 9 | 9 | 6 | 5 | 4 | 2 | 4 | n/a 1 |
| S5 | 12 | 11 | 6 | 3 | 9 | 9 | 6 | 5 | 4 | 3 | 4 | |
| S6 | 12 | 9 | 4 | 4 | 12 | 9 | 6 | 5 | 4 | 3 | 4 | |
| S7 | 0 | 12 | 7 | 3 | 8 | 9 | 5 | 3 | 14 | 5 | 5 | Coupé 1 |
| S8 | 0 | 8 | 4 | 3 | 5 | 9 | 6 | 5 | 15 | 9 | 5 | Coupé 1 |
| S9 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 0 | 0 | |

(En S7–S8, la direction et les coordos passent de « Gestion » à « Oui ».)

### 7.2 « Diètes par semaine »

Tableau de synthèse pour la cuisine : nombre de personnes présentes par diète, pour Formation 3 et les semaines 1 à 9, puis la même chose en pourcentage.

| Diète | Formation 3 | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 |
|---|---|---|---|---|---|---|---|---|---|---|
| Régulier | 14 | 47 | 54 | 55 | 56 | 56 | 53 | 49 | 46 | 7 |
| Sans lactose | 1 | 0 | 1 | 1 | 1 | 1 | 2 | 2 | 2 | 0 |
| Sans porc | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 0 |
| Végétarienne | 6 | 8 | 8 | 7 | 7 | 6 | 8 | 7 | 6 | 0 |
| **Total** | 23 | 57 | 65 | 65 | 66 | 65 | 65 | 60 | 56 | 7 |

Lignes de pourcentages (ex. S1 : Régulier 82 %, Sans lactose 0 %, Sans porc 4 %, Végétarienne 14 %). Le total de Formation 3 (23) égale le nombre de « Oui » à la Formation 3 : la feuille compte vraisemblablement, par diète, les personnes dont la case de la semaine n'est ni vide ni « Non »/« Congé »/« n/a ». « Sans gluten » n'apparaît pas.

---

## 8. Synthèse pour la conception

### 8.1 Le cycle tel qu'il fonctionne aujourd'hui

1. **Recrutement externe** : le candidat remplit « Dépôt de candidatures » → une ligne Candidatures (statut vide) ; le script crée ou complète la fiche Humains (clé = courriel) ; la co-directrice reçoit une alerte « Nouveau formulaire ».
2. **Retour des anciens** : en fin de saison, on envoie le lien « Intention de retour » ; chaque réponse crée **une nouvelle candidature** (même table) avec `Intention retour | Ancien` = Oui/Non.
3. **Tri** : la direction lit la candidature, met une pré-décision (Oui / Maybe / Bof / Non / Proposer ASPI) et des commentaires internes.
4. **Courriels par statut** : la direction choisit le statut + la compagnie (+ poste, saison, échelon pour l'embauche) et coche « Envoi courriel ? » → l'automatisation correspondante envoie le courriel depuis la boîte Gmail de la compagnie, décoche la case et note l'envoi. Statuts automatisés : Proposition d'entrevue (lien de prise de rendez-vous Google Calendar), Rejet après entrevue, Rejet équipe complète, Proposition ASPI (BPA), Question permis de travail (BPA), Candidature acceptée (échelon 1 seulement).
5. **Entrevue** : la date et les commentaires d'entrevue sont saisis à la main (aucun lien avec l'agenda).
6. **Embauche** : le courriel « Bienvenue dans l'équipe ! » joint le contrat (+ consentement parental) tiré de la table Pièces jointes selon saison × poste × échelon × compagnie, et envoie le lien du formulaire « Confirmation d'embauche » (été) ou « … - Hors été ». Pour les échelons 2 à 5 et les postes sans branche, tout se fait à la main (courriel perso, note libre dans « Dernier courriel envoyé »).
7. **Dossier d'employé** : l'employé remplit la confirmation d'embauche (identité, NAS, banque, santé, urgence, disponibilités, code d'éthique, contrat signé, documents) → une ligne Embauches, rattachée à son Humain par courriel. La direction complète ensuite Ancien, Type de rémunération, 4 %.
8. **Planification** : hors Airtable, dans le Google Sheets « Suivi RH 2026 » (une ligne par employé, une colonne par formation et par semaine, codes Anim/Remplaçant/Gestion/…), recopie manuelle de la diète, des allergies et des tailles ; onglet « Diètes par semaine » pour la cuisine.
9. **Conformité** : vérification des antécédents judiciaires (VAJ) suivie dans Humains (Date VAJ, VAJ ?, ligne « Info VAJ » prête à coller) ; vues Embauches « Premiers soins », « Certifications », « Anniversaires », « VAJ ».

### 8.2 Points bizarres ou cassés

- **Automatisations saisonnières basculées à la main** : les quatre automatisations d'embauche « Été » (BPA ×2, OPI, AQB, RD) sont désactivées et celle « Hors saison » (BPA) est active ; elles ont le même déclencheur et se chevaucheraient (anim classe nature, employé polyvalent) si on les activait ensemble.
- **Embauche automatisée seulement à l'échelon 1** : 57 des 93 acceptations (échelons 2–4 ou vides) sont traitées à la main ; Trembloc n'a aucune automatisation d'embauche ; plusieurs postes n'ont pas de branche (Chef/Aide cuisinier hors saison, coordos OPI/AQB/RD, préposé à l'accueil, etc.). Quand aucune branche ne correspond, rien ne part et la case « Envoi courriel ? » reste cochée sans avertissement.
- **Pièces jointes vides** : 28 des 29 combinaisons n'ont plus de fichier ; un courriel de bienvenue partirait sans contrat tout en annonçant « en pièces jointes ».
- **Libellés incohérents** entre listes (Coordonateur/Coordonnateur, Rouge&Diable/Rouge & Diable, Accompagnateur de/en groupe de ski, saisons avec espace finale, raisons sociales dans Humains ≠ noms courts ailleurs, tailles S/M/L ≠ Small/Medium/Large dans le Sheets) : les automatisations dépendent de ces libellés exacts.
- **Dates codées en dur** : options de disponibilités de l'été 2026 dans Embauches, « moins de 18 ans au 1er mai 2026 » dans les courriels AQB/RD, saisons listées jusqu'en 2028.
- **Statut = état final** : aucune candidature n'est au statut « Application » ; on écrase le statut à chaque étape, donc pas d'historique (seul « Dernier courriel envoyé », lui-même utilisé comme note libre, garde une trace).
- **Rattachement par courriel fragile** : courriel facultatif dans « Intention de retour » (le script plante alors) ; une embauche avec un courriel différent reste orpheline (2 cas) ; un humain en double (2 candidatures liées à 2 humains).
- **Bogue de courriel** : rejet après entrevue Opikawa commence par « Bonjour , » puis le prénom sur la ligne suivante.
- **Alertes internes** : toutes vers une seule adresse fixe ; la version « Hors été » de la confirmation d'embauche n'a pas d'alerte ; le lien de l'alerte « confirmation d'embauche » pointe vers la table Candidatures.
- **Courriel « Bienvenue » été** : promet l'invitation au groupe Facebook « à la fin du formulaire » ; la section existe mais ne contient pas d'invitation.
- **Champs jamais remplis** : `Date d'embauche / réembauche`, `Type d'employé`, `Action` (A/M) vides pour les 70 embauches (export paie non utilisé ou fait ailleurs) ; `Hébergement ?` et `Chambre` vides dans le Sheets.
- **NAS en champ nombre** (perte d'un 0 initial) ; téléphone en texte simple dans Embauches ; le script de création d'humain journalise toutes les données de la candidature.
- **Sheets** : la ligne « Dispo 2026 » affiche 0 pour toutes les semaines (formule qui compte « Oui » alors que les cases portent « Anim »/« Remplaçant ») ; branches et postes du Sheets différents de ceux d'Airtable ; code « CDJ » non documenté.

### 8.3 Automatisations non déployées

| Automatisation | Ce qu'elle couvre |
|---|---|
| Embauche - BPA - Échelon 1 - Partie 1 - Été (`wflMJANzvFBG5PE29`) | Coordonateur, Aide de camp, Anim camp d'été, Anim classe nature, Anim EXPÉ, Formateur sauvetage, Formateur PAM DAFA, Sauveteur plage |
| Embauche - BPA - Échelon 1 - Partie 2 - Été (`wflWWTJKebuY8lVop`) | Spécialiste escalade, photos & vidéos, transport, Chef cuisinier, Aide cuisinier, Préposé à l'entretien, Employé polyvalent |
| Embauche - OPI - Échelon 1 - Été (`wfl4GKDW8QPCnYrlr`) | Prof d'anglais / de français langue seconde |
| Embauche - AQB - Échelon 1 (`wflpMeiScPPkbHd9N`) | Sauveteur sur structure gonflable |
| Embauche - RD - Échelon 1 (`wflyD2cSE5BaYNoOW`) | Conducteur minibus |

BPA, AQB et RD ont envoyé des courriels de mars à août 2026 (22 « Candidature acceptée » automatiques pour l'été ; les 6 autres sont des « Hors saison » d'août–septembre) ; aucun envoi automatique n'est observé pour OPI. Toutes ont été désactivées en fin d'été.
