# Passation : brainstorming Studio Contenu

> À lire par Claude Code pour reprendre la session de brainstorming (skill `superpowers:brainstorming`).
> Démarrée le 2026-09-27 dans Claude (Cowork), avec Jean et la créatrice.

## Classification

**Architectural** (nouveau projet) : parcours complet.
Questions → approches → conception par sections → spec écrite → validation → `writing-plans`.

## Besoin exprimé (Jean)

Une solution pour le compte Instagram de la créatrice :

- planification, avec des vues jour, semaine et mois ;
- un score pour chaque publication (persona de la créatrice, niche, stratégie globale, règles Instagram actuelles) ;
- pour chaque contenu, une caption et des recommandations nourries par les tendances Instagram ;
- programmation et publication automatiques ;
- un dashboard.

## Réponses validées

| Question | Réponse |
|---|---|
| Rôle du compte Instagram | Un mélange des trois : **tunnel** vers ses plateformes, **croissance** d'audience, **marque** personnelle |
| Plus grosses pertes de temps | **Savoir quoi poster** (idées, captions, tendances) + **organiser et publier** |
| Outils actuels | Aucun, seulement des analyses du compte via des prompts Claude |
| Type de compte | **Créateur** (compatible avec l'API de publication Instagram) |
| Approche | **A, hybride**, puis passage en **automatique** (approche B) une fois le studio rodé |

## Approches présentées

- **A. Hybride (retenue)** : studio sur mesure et veille Claude hebdo ; publication manuelle via Meta Business Suite.
- **B. Tout sur mesure et auto-publication par l'API** : plus tard, via le module `publisher/`.
- **C. Léger, piloté par Claude, sans interface** : écartée.

## Section 1 : architecture d'ensemble (VALIDÉE)

- **Studio Contenu** : page web privée hébergée sur claude.ai, avec des données partagées entre Jean et la créatrice ; Claude peut y lire et y écrire.
- **Quatre blocs :**
  1. **Profil de marque** : persona, niche, 3 à 5 piliers, ton, public visé, limites Instagram (règles de la communauté, mots à risque).
  2. **Calendrier** jour, semaine et mois ; formats Reel, carrousel, story et post ; statuts Idée → Brouillon → Validé → Programmé → Publié.
  3. **Fiche contenu** : visuel, caption, hashtags, recommandations, score sur 100.
  4. **Veille hebdo** : tâche Claude programmée le dimanche soir, qui produit un bulletin tendances et dépose 3 à 5 idées en brouillon.
- **Publication :** manuelle via Meta Business Suite, puis la carte passe en « Programmé ».
- **Préparation de la phase 2 :** chaque fiche « Validé » contient déjà ce que l'API demande (média, caption, date et heure).

## Section 2 révisée (VALIDÉE le 2026-09-27)

Révisée à partir du profil de marque réel (fourni par Jean, conservé hors dépôt).

- Pondération par format (Reel / Carrousel / Story) :
  - Accroche et diffusion : 40 / 30 / 20
  - Voix et esthétique : 30 / 35 / 30
  - Mécanique de la caption : 30 / 35 / 50
- Conformité = verrou : au rouge, score plafonné à 40, passage en « Validé » impossible, cause précise affichée.
- Contrôle de la semaine (bandeau du calendrier, sans note) : cadence 4 Reels, 2 carrousels et stories quotidiennes ; appel à l'action ≈ 1 sur 4 ; rôles des captions 2 engagement, 1 appel à l'action, 1 deadpan ; ragebait ≤ 1 ; 2 à 3 stories vers la porte ; équilibre des piliers.
- Déclenchement : bouton « Évaluer » ; la fiche est marquée « à réévaluer » si la caption ou le visuel change.
- Sorties : score avec une phrase par critère, 2 captions de rôles différents, 2 ou 3 accroches, hashtags, 3 recommandations.
- Calibration sur la métrique boussole : nouveaux abonnés rapportés aux vues, partages et envois, sauvegardes, visites du profil, clics sur le lien de la porte.

## Section 2 initiale (remplacée par la version révisée)

- **Entrées :** format, visuel, pilier, date et heure, profil de marque, bulletin de la semaine.
- **Score sur 100, en 4 critères de 25 points :**
  - **Tunnel** : appel à l'action, renvoi vers le lien en bio, teasing sans rien d'explicite.
  - **Croissance** : accroche dans les 3 premières secondes, format favorisé par l'algorithme, potentiel de partage et de sauvegarde, tendance, heure de publication.
  - **Marque** : pilier, ton, cohérence visuelle.
  - **Conformité Instagram** : règles de la communauté, mots et hashtags à risque, liens interdits, risque de shadowban. **C'est un verrou** : au rouge, le score est plafonné et la carte ne peut pas passer en « Validé ».
- **Sorties :** le score avec une phrase par critère, 2 variantes de caption (courte et narrative), des hashtags, 3 recommandations concrètes.
- **Limite assumée :** le score est un avis d'expert, pas une prédiction. Il sera calibré avec les stats réelles saisies après chaque publication (portée, sauvegardes, clics sur le lien en bio).

## Section 3 : modèle de données (VALIDÉE le 2026-09-27)

- **Stockage** : la base partagée de la page claude.ai pour les données, son stockage de fichiers pour les visuels. Le dépôt git ne contient que le code et un profil d'exemple fictif.
- **Anonymat du dépôt** : aucune donnée réelle de la créatrice (nom, pseudo, e-mail, plateformes, statistiques) n'est versionnée. Le vrai profil vit seulement dans la base du studio.
- **Collections** :
  1. `profil` : le profil de marque importé (JSON), avec un numéro de version ; chaque score garde la version utilisée.
  2. `fiches` :
     - format, pilier, format validé, rôle de la caption, cases « appel à l'action » et « ragebait » ;
     - date et heure en UTC, affichées dans le fuseau du profil ;
     - statut ;
     - visuel, accroche, caption retenue et variantes, hashtags, géotag au niveau de la ville ;
     - score : total, critères, conformité et causes, version du profil, date, empreinte du contenu (si elle change, la fiche passe « à réévaluer ») ;
     - recommandations et origine (manuelle, veille ou banque d'accroches).
  3. `bulletins` : semaine, tendances, idées créées, sources, erreurs.
  4. `stats_contenu` : **deux relevés par publication (48 h et 7 jours)** : vues, nouveaux abonnés, partages et envois, sauvegardes, visites du profil, clics sur la porte. Le taux d'abonnés par vue est calculé.
  5. `releves_compte` : un relevé par semaine le dimanche : abonnés, vues moyennes des stories, clics sur la porte, croissance nette.
- **Laissé de côté pour l'instant** : historique des modifications, gestion de plusieurs comptes, import automatique des statistiques (phase 2).

## Section 4 : veille hebdo (VALIDÉE le 2026-09-27)

- **Déclenchement** : tâche programmée le dimanche à 20 h (fuseau du profil), plus un bouton « Relancer la veille » dans le studio. Routine cloud : sa capacité à écrire dans la base est confirmée par un test.
- **Ce qu'elle lit** : le profil, les stats des 2 dernières semaines, le relevé du compte, les créneaux libres de la semaine suivante.
- **Sources** : recherche web (annonces d'Instagram aux créateurs, rapports de tendances, tendances de la niche). Pas de scraping d'Instagram. Un son tendance est marqué « à vérifier dans l'app ».
- **Filtre de marque** : chaque tendance est adaptée ou écartée, avec la raison. 3 à 5 tendances retenues.
- **Bulletin** :
  1. rétrospective de la semaine (meilleur et pire contenu selon le taux d'abonnés par vue et les partages) ;
  2. tendances ;
  3. alertes (une mise à jour du profil peut être proposée, jamais appliquée automatiquement) ;
  4. 3 à 5 idées en « Brouillon », déjà évaluées, placées sur les créneaux libres.
- **Erreurs** :
  - un bulletin par semaine ISO ; une relance ne remplace que ses propres idées restées en « Brouillon » sans modification ;
  - si la recherche web échoue, bulletin partiel ;
  - si les stats n'ont pas été saisies, rappel de saisie ;
  - si la tâche n'a pas tourné, bandeau et bouton de relance.

## Sections 5 et 6 (VALIDÉES le 2026-09-27)

- **Interface** : conçue d'abord pour l'ordinateur (la créatrice travaille sur Mac). Semaine en 7 colonnes avec glisser-déposer ; fiche en panneau latéral.
- **Tests** : règles calculées en JS testées avec Vitest ; réponses de Claude validées par un schéma ; jeu de référence gardé hors de git ; un studio de test et le studio réel.
- **Test de la routine cloud** : réussi le 2026-09-28. La veille tournera dans le cloud.

## Reste à faire

1. Plan 2 : évaluation par Claude (`sample`), règles calculées, verrou de conformité, jeu de référence ; ajouter `regles_studio` au profil réel (hors dépôt) et publier le studio réel.
2. Plan 3 : veille hebdo (consignes `src/claude/veille.md`, routine cloud, vue Bulletin).
3. Plan 4 : relevés de stats et tableau de bord.

## Contraintes

- Dépôt **privé** : aucun token, mot de passe ou média versionné.
- Le compte Instagram est un compte vitrine SFW ; la conformité Instagram est centrale.
- On échange en français avec Jean et la créatrice.
