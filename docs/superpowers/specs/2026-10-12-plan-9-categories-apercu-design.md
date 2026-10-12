# Plan 9 : catégories, aperçu et validation libre : spec de conception

- **Date** : 2026-10-12
- **Statut** : conception validée par Jean dans la conversation ; spec à relire
- **Parcours** : architectural (nouveau champ de fiche, nouvelle section du profil, nouvelle vue, règle de validation changée, dossier d'analyse enrichi)
- **Complète** : `2026-10-01-plan-8-analyse-par-dossier-design.md`
- **Source** : retours de la créatrice après usage, et une version du dossier d'analyse qu'elle a retravaillée avec un assistant (catégories, rangement, grilles d'analyse). Ce document reste hors du dépôt.

## 1. Objectif

Aider la créatrice à décider, pour chaque contenu, à quelle étape de son entonnoir il sert, à voir d'un coup ce qui sort, et à travailler sans être bloquée par le studio.

1. **Catégories.** Chaque contenu a une catégorie, c'est-à-dire une étape de l'entonnoir : Attraction, Autorité, Connexion, Désir, Preuve ou Conversion. Le calendrier les montre en couleur, et le contrôle de la semaine les compare à des cibles.
2. **Aperçu.** Une vue de miniatures des visuels de la semaine ou du mois, filtrable par format, sert à voir ce qui sort ou est sorti, et à retrouver quelle image a été postée.
3. **Validation libre.** Rien n'empêche de passer un contenu en « Validé » ; le studio avertit, il ne bloque plus.
4. **Analyse adaptée.** Le dossier d'analyse applique une grille par format et une grille par catégorie, et l'assistant propose une catégorie.

### Critères de réussite

- Un contenu se range en un clic, et la proposition du studio est visible tant qu'il n'est pas rangé.
- Dans l'aperçu, cocher « Stories » ne montre que les stories de la période ; chaque miniature porte la couleur de sa catégorie.
- Une fiche sans visuel, sans analyse ou avec un mot à éviter peut être validée ; ses avertissements restent affichés.
- Sans la nouvelle section du profil, le studio fonctionne comme avant le plan 9 (catégories sans cible, analyse sans grilles).
- Aucun élément de la stratégie de la créatrice (définitions, grilles, cibles chiffrées) n'entre dans le dépôt : tout vient du profil, en base.

### Hors périmètre

- L'historique réel du compte Instagram : l'aperçu ne montre que ce qui est dans le studio.
- Plusieurs visuels par carrousel.
- Le calcul automatique de la catégorie par compréhension du texte : seules des règles simples et l'analyse par dossier proposent.

## 2. Catégories

### 2.1 Les six catégories

Les clés et les noms sont fixes dans le studio ; ce sont des termes génériques d'entonnoir.

| Clé | Nom | Couleur par défaut |
|---|---|---|
| `attraction` | Attraction | `#d9622b` |
| `autorite` | Autorité | `#4a5be0` |
| `connexion` | Connexion | `#0b8574` |
| `desir` | Désir | `#b3125a` |
| `preuve` | Preuve | `#a07800` |
| `conversion` | Conversion | `#7a2fb5` |

Les couleurs par défaut doivent rester lisibles avec le texte blanc et sur les deux thèmes ; le profil peut les remplacer.

### 2.2 Section du profil

Nouvelle section facultative du profil de marque, `categories_de_contenu` :

```json
{
  "categories_de_contenu": {
    "principe": "texte libre",
    "test_de_rangement": ["1. …", "2. …"],
    "categories": [
      { "cle": "attraction", "couleur": "#d9622b", "cible_fil": 3, "cible_stories": null, "texte libre": "…" }
    ],
    "grilles": {
      "par_format": { "reel": ["…"], "carrousel": ["…"], "story": ["…"] },
      "par_categorie": { "attraction": ["…"], "autorite": ["…"] }
    },
    "garde_fous": ["…"]
  }
}
```

- `categories[].cle` : une des six clés. `couleur` facultative, au format `#rrggbb`. `cible_fil` facultative, entier positif ou nul : nombre de contenus du fil (Reels, carrousels, posts) visés par semaine. `cible_stories` facultative : `{ "min": entier, "max": entier }`, nombre de stories visées par semaine. Les autres champs d'une catégorie (réaction voulue, formats et piliers naturels, mesure…) sont du texte libre, transmis tel quel au dossier.
- `grilles.par_format` : clés parmi `reel`, `carrousel`, `story`, `post` ; `grilles.par_categorie` : clés parmi les six catégories ; valeurs : listes de textes.
- `validerProfil` vérifie la forme de cette section quand elle est présente (clés connues, couleurs, cibles). Une erreur donne un message clair et empêche l'import, comme les autres erreurs du profil.
- La section est importée avec le reste du profil (« Importer une nouvelle version »), archivée avec lui et exportée avec lui.

### 2.3 Champ de la fiche

- Nouveau champ `categorie` : une des six clés, ou `null`.
- Nouveau champ `categorie_proposee` : `{ "cle": …, "source": "analyse" }` ou `null`, rempli seulement par l'analyse par dossier.
- La catégorie ne fait pas partie de l'empreinte de la fiche : la ranger ne rend pas son analyse dépassée.
- Les anciennes fiches, sans ces champs, valent `null`.

### 2.4 Proposition

Quand `categorie` est vide, le studio affiche une proposition, dans cet ordre :

1. la proposition de l'analyse (`categorie_proposee`), si elle existe ;
2. sinon une règle simple : fiche qui mène à la porte ou appel vers l'offre coché → Conversion ; ragebait coché → Attraction ;
3. sinon aucune proposition.

Dans la fiche, un menu « Catégorie » (avec « Non rangée »), et sous lui, s'il y a une proposition : « Proposée : Conversion (règle : mène à la porte) » ou « (proposée par l'analyse) », avec un bouton « Confirmer ». Une catégorie choisie n'est jamais remplacée par une proposition.

### 2.5 Calendrier et contrôle de la semaine

- Les cartes de la vue Semaine prennent la couleur de leur catégorie choisie (gris neutre si non rangée ; une proposition non confirmée n'en donne pas). Le nom du pilier reste écrit sur la carte. La vue Mois colore ses points de la même façon.
- Le contrôle de la semaine gagne une ligne par catégorie qui a une cible dans le profil, par exemple « Attraction : 1 sur 3 contenus du fil ». État : vert si la cible est atteinte, orange s'il manque un contenu, rouge au-delà ; pour les stories, vert entre `min` et `max`, orange à un d'écart, rouge au-delà. Les fiches non rangées ne comptent dans aucune catégorie ; une ligne « Non rangées : N » apparaît s'il y en a.
- Une légende des couleurs figure sous le contrôle de la semaine.

## 3. Aperçu

- Nouvel onglet « Aperçu », entre « Mois » et « Jour ». Il suit la période affichée par les flèches, avec un choix Semaine ou Mois propre à la vue.
- Toutes les fiches de la période, publiées comprises, dans l'ordre de leur date (date de publication pour une fiche publiée).
- Une grille de miniatures carrées : 3 colonnes sur téléphone, plus sur grand écran, sans défilement horizontal. Chaque miniature porte :
  - le visuel (une image ; pour une vidéo, sa première image, avec une marque de lecture) ;
  - une bordure épaisse de la couleur de sa catégorie (neutre si non rangée) ;
  - la date courte, le format et, pour une fiche publiée, la mention « Publié ».
- Une fiche sans visuel apparaît en case vide avec son accroche (ou « Sans visuel »).
- Toucher une miniature ouvre la fiche.
- Filtres en haut, en cases à cocher : « Tout », « Stories », « Reels », « Posts ». « Posts » couvre les carrousels et les photos. « Tout » coche ou décoche les trois autres ; aucune case cochée montre « Coche au moins un format. ». Les filtres sont gardés pour la session.
- Une légende des couleurs de catégorie, et un compte par catégorie pour la sélection affichée.
- Les visuels sont chargés au fil de l'affichage (chargement différé), avec les liens signés existants.

## 4. Validation libre

- Passer en « Validé », « Programmé » ou « Publié » n'exige plus ni visuel, ni caption, ni analyse, ni conformité verte.
- La fiche affiche une liste d'avertissements, recalculée à chaque modification : « Pas de visuel », « Pas de caption », chaque blocage calculé (mot à éviter, lien, géotag), « Pas encore analysée », « Analyse dépassée : la fiche a changé depuis ».
- Une fiche validée ou programmée ne repasse plus en brouillon quand on la modifie, ni quand une analyse arrive avec un blocage.
- « À faire cette semaine » : pour une idée ou un brouillon, la prochaine action est « Valider la fiche », avec en détail les avertissements (par exemple « Pas encore analysée ») ; l'analyse n'est plus une étape obligatoire.
- Le score et les blocages restent affichés dans la fiche comme avant.

## 5. Analyse par catégorie et par format

Le dossier d'analyse (plan 8) change ainsi :

- **Stratégie** : la section `categories_de_contenu` du profil y figure, rendue en listes, comme les autres sections.
- **Bloc de fiche** : une ligne « catégorie : Connexion (choisie) », « … (proposée) », ou « non rangée ».
- **Nouvelle section « Rangement par catégorie »**, après les règles de la période : pour chaque catégorie, les références des fiches qui y sont rangées (choisies ou proposées), puis la cible de la semaine si le profil en donne une ; puis les fiches non rangées. Phrase d'en-tête : « Rangement actuel, à vérifier. Ces lignes ne sont pas des états de cadence. »
- **Consigne** :
  - avant de noter, ranger chaque fiche avec le test de rangement de la stratégie ; si la fiche a une catégorie, la vérifier et dire en une phrase pourquoi en cas de changement ; « non déterminable » si rien ne permet de trancher ;
  - juger chaque note avec la grille du format et celle de la catégorie, lues dans `grilles` (si le profil n'a pas de grilles, la consigne est celle du plan 8) ;
  - dans la partie lisible, commencer chaque fiche par « Catégorie : … · Format : … » et finir l'analyse de la période par le rangement comparé aux cibles ;
  - dans le bloc, un champ facultatif `"categorie"` par fiche, parmi `attraction`, `autorite`, `connexion`, `desir`, `preuve`, `conversion`, ou `null`.
- **Retour** : `categorie` est lue avec tolérance (casse, accents : « Autorité » → `autorite`) ; une valeur inconnue est ignorée avec une remarque. Elle n'entre pas dans la validation de la fiche.
- **Application** : si la fiche n'a pas de catégorie choisie, `categorie_proposee` reçoit `{ cle, source: "analyse" }` ; une catégorie choisie n'est jamais modifiée. Le compte rendu indique les catégories proposées.

## 6. Préparation de la section du profil

La section `categories_de_contenu` de la créatrice est rédigée à partir du document qu'elle a retravaillé : test de rangement, définitions, cibles, grilles, garde-fous. Elle est importée comme nouvelle version du profil, par la créatrice ou par Jean depuis l'onglet Profil, ou par le contrôleur avec l'accord de Jean. Elle ne passe jamais par le dépôt : le profil fictif des tests (`exemples/profil-fictif.json`) reçoit une section d'exemple neutre.

## 7. Erreurs et cas limites

- Profil sans `categories_de_contenu` : catégories avec leurs couleurs par défaut, sans cible ni grille ; aucune ligne de catégorie dans le contrôle de la semaine.
- Catégorie dans le profil sans `cible_fil` ni `cible_stories` : pas de ligne de contrôle pour elle.
- Aperçu sur une période vide : « Rien de prévu sur cette période. ».
- Visuel introuvable dans l'aperçu : case grise « Visuel indisponible », sans bloquer les autres.
- Export et restauration : les nouveaux champs voyagent avec les fiches et le profil ; un export ancien reste valide.

## 8. Tests

- `validerProfil` : section absente, valide, clés inconnues, couleur invalide, cible négative.
- Proposition de catégorie : ordre (analyse, règles), aucune proposition, catégorie choisie jamais remplacée.
- Contrôle de la semaine : lignes par catégorie (fil et stories), non rangées, états, profil sans section.
- Validation libre : chaque statut accessible sans condition ; liste d'avertissements ; plus de retour en brouillon ; « À faire cette semaine ».
- Aperçu : ordre, filtres (Tout, chaque format, aucune case), couleurs, fiche sans visuel, fiche publiée, ouverture de la fiche, compte par catégorie.
- Dossier : ligne de catégorie, section de rangement, consigne avec et sans grilles, champ `categorie` lu avec tolérance, application sans écraser un choix.
- Calendrier : couleur de carte et de point par catégorie, légende.
