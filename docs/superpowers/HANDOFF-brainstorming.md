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

## État du projet (mis à jour le 2026-09-29)

### Où en est chaque plan
| Plan | Contenu | Branche / état git | Tests |
|---|---|---|---|
| 1. Fondations et calendrier | Semaine, mois, jour, fiche, contrôle de semaine, créneaux, glisser-déposer, import du profil | Fusionné dans `main`, poussé | 114 tests au moment de la fusion |
| 2. Évaluation par Claude | Règles calculées, score pondéré par format, verrou de conformité, évaluation via `sample`, suggestions, jeu de référence | Fusionné dans `main` | 240 tests |
| 3. Veille hebdo | Script `scripts/veille.mjs`, logique `src/logique/veille.js`, consignes `src/claude/veille.md`, onglet Bulletin | Fusionné dans `main` | **302 tests verts**, build OK (72 Ko) |
| 4. Stats et tableau de bord | Relevés à 48 h et à 7 jours, relevé hebdo du compte, onglet Tableau de bord (6 graphiques SVG), rétrospective du bulletin | Fusionné dans `main` | **362 tests verts**, build OK (90 Ko) |
| 5. Parcours d'une fiche | Prochaine action (cartes, bandeau de fiche, « À faire cette semaine »), confirmations datées de programmation et de publication, relevés depuis la date réelle | Fusionné dans `main` | **417 tests verts**, build OK (98 Ko) |
| 6. Confiance dans les données | Bloc « ce que Claude a examiné », recommandations avec pourquoi, « Avis de Claude » ; tableau de bord par contenu et par format, comparaisons à partir de 5 contenus ; export JSON (capacité `downloads`) et restauration sans suppression | Fusionné dans `main` | **474 tests verts**, build OK (109 Ko) |

### Studios publiés (URL dans `.studio.local.json`, non versionné)
- **Studio de test** : profil fictif, jeu de référence fictif, version de la page avec l'onglet Bulletin (republiée le 2026-09-29). Capacités : `db`, `assets`, `sample`.
- **Studio réel** : profil réel (version 1, e-mail retiré) et 10 contenus réels de référence, **uniquement dans sa base**. Même page, même capacités.
- La checklist à l'écran des plans 2 et 3 et le partage du studio réel avec la créatrice (Éditrice) sont **à faire par Jean**.

### Décisions structurantes prises pendant l'exécution
Elles sont toutes détaillées dans le registre de chaque plan (`.superpowers/sdd/<plan>/progress.md`, non versionné) :
- **Verrou de conformité fermé par défaut.**
  - Au rouge, le score est plafonné à 40.
  - L'empreinte couvre accroche, caption, visuel, hashtags, format, pilier, rôle, appel à l'action, géotag et porte.
  - Une fiche validée ou programmée repasse en Brouillon dès qu'elle devient bloquante : après une modification, une réévaluation, un nouveau profil, ou à chaque instantané de fiches.
- **Règles calculées.**
  - Liens : `https?://`, `www.`, `domaine/chemin`, domaines « link in bio » connus.
  - Géotag : marqueurs d'adresse ou de domicile, code postal, numéro suivi d'un type de voie.
  - Mots à éviter : comparaison normalisée, avec frontières de mot.
  - Les motifs sont linéaires : aucune regex à retour arrière catastrophique.
- **Consigne envoyée à Claude.**
  - Tailles mesurées en octets : profil ≤ 30 000 octets, prompt ≤ 60 000 octets.
  - `regles_studio` n'est jamais retiré.
  - Réponse validée champ par champ ; rien n'est écrit en cas d'échec.
- **Veille.**
  - Semaine visée : celle de `maintenant + 1 jour`, c'est-à-dire la semaine suivante le dimanche soir et la semaine en cours en semaine.
  - Une relance ne remplace que ses propres idées restées intactes : `brouillon`, non modifiées, `maj_le === cree_le`.
  - Pas de doublon : dédoublonnage sur l'accroche et plafond de 5 idées par bulletin.
  - Lecture élargie de −14 j à +28 j.
  - Écritures épinglées (`if_version`) grâce à `veille-tmp/versions.json`, que l'agent recopie depuis le résultat d'`ArtifactData` : les fichiers `out_dir` contiennent le document seul.
  - `doit-tourner` : répond « non » seulement un dimanche entre 18:30 et 21:29 hors 20 h (heure locale) ; `--forcer` force l'exécution.
- **Deux exceptions au processus**, une au plan 2 et une au plan 3 : une courte passe résiduelle après la relecture finale, pour ne pas mettre en service avec un risque de perte de données.

### Mise en service de la veille (Task 6 du plan 3, terminée le 2026-09-29)
- **Essai à blanc sur le studio de test** : réussi, avec un bulletin 2026-W40 et 4 idées.
  - WebSearch fonctionne dans le cloud.
  - WebFetch est bloqué par le proxy réseau sur certains domaines. On s'en passe : les résultats de recherche suffisent.
- **Relance** : réussie.
  - Les 4 idées intactes ont été remplacées par 5 nouvelles, par des suppressions épinglées `if_version`.
  - Le bulletin est passé en version 2. La fiche manuelle n'a pas été touchée.
  - Aucun doublon, aucune collision de créneau.
  - Une première tentative avait été coupée par la limite d'utilisation avant toute écriture : sans effet, le lot est atomique.
- **Routine hebdomadaire du studio réel créée** :
  - `cron 0 0,1 * * 1` UTC, modèle Sonnet, outils prévus par le plan ;
  - premier passage le dimanche 4 octobre 2026 à 20 h, heure locale ;
  - `doit-tourner` écarte le créneau hors 20 h.
- **`config/veille`** (`url_routine`) est écrit dans les deux studios. La routine ponctuelle de test reste désactivée : on la relance à la main, depuis le lien.

### Plan 4 : décisions prises à l'exécution
- **Cibles :** bloc facultatif `regles_studio.cibles` (`taux_abonnes_par_vue` en fraction, `partages_par_post`, `croissance_nette_semaine`, `clics_porte_semaine`). Sans ce bloc, tout fonctionne sans ligne de cible.
- **Relevés :** documents autonomes `stats_contenu/<id>_48h|7j`, qui recopient format, date, accroche et score. `releves_compte/<YYYY-Www>` : un par semaine, saisissable pour la semaine en cours ou la précédente.
- **Rétrospective :** fenêtre des 2 semaines avant la semaine visée. Les écarts de compte ne portent que sur un relevé de cette fenêtre, jamais sur un relevé ancien.
- **Interface :** l'onglet Tableau de bord se met à jour sans reconstruire le formulaire du relevé du compte. `replaceChildren` natif n'aplatit pas les tableaux et affiche « null » : on ne lui passe que des nœuds filtrés.
- **Veille :** elle lit `stats_contenu` et `releves_compte` par des requêtes bornées, et `--maintenant` est normalisé en ISO.
- **Studio de test :** profil fictif v2 avec cibles, et relevés fictifs (`exemples/stats-fictives.json`).
- **Studio réel :** page publiée ; cibles validées par Jean et écrites dans la base (profil version 2, la version 1 archivée) : 0,3 % d'abonnés par vue, 20 partages et envois par post, +125 abonnés nets par semaine, pas de cible de clics sur la porte.

### Plan 5 : décisions prises à l'exécution
- **Confirmations :** « Programmé » et « Publié » s'obtiennent par un formulaire daté avec une case obligatoire ; le contrôleur refuse de changer ces statuts sans confirmation. Programmation refusée dans le passé, publication refusée au-delà de maintenant + 5 min.
- **Champs :** `programme_pour`, `publie_le` (protégés, effacés à chaque retour en arrière ou rétrogradation). Les relevés partent de `publie_le ?? date_heure`.
- **Prochaine action :** logique pure `src/logique/parcours.js`. Une fiche programmée dont l'heure est passée propose « Confirmer la publication » (avant toute reconfirmation) ; une fiche programmée avant le plan 5 propose « Reconfirmer » avec « Confirme la date programmée dans Meta Business Suite ».
- **Affichage :** ligne d'action sur les cartes de la vue Semaine seulement, bandeau en tête de fiche, liste « À faire cette semaine ».
- **Limites connues :** panneau ouvert non rafraîchi après un glisser-déposer de la même fiche ; retour Publié → Programmé en passant par Validé ; une fiche programmée pour plus tard puis déplacée dans le passé propose « Confirmer la publication » sans avertissement.

### Plan 6 : décisions prises à l'exécution
- **Examen :** calculé par le studio (jamais demandé à Claude) : visuel joint ou raison (vidéo, format, taille, indisponible), sections du profil envoyées, contenus de la semaine comparés, alertes et blocages calculés. Les évaluations antérieures affichent « Détail non disponible ».
- **Recommandations :** `{ texte, pourquoi }` ; l'ancien format texte reste accepté (veille et anciennes fiches).
- **Tableau de bord :** seuil de 5 contenus au taux calculable pour le classement et le nuage.
- **Sauvegarde :** export complet (sauf fichiers des visuels), fichier `studio-contenu-AAAA-MM-JJ.json`, ignoré par git. Restauration : validation complète avant écriture, y compris le profil (`validerProfil` + version) ; verrou pendant export et restauration ; écritures locales vidées avant ; aucun document supprimé ; section Sauvegarde unique pour la session (survit à la reconstruction de l'onglet Profil).
- **Pages publiées :** capacités `db`, `assets`, `sample`, `downloads`.
- **Limites connues :** l'examen des idées de la veille indique 0 contenu comparé ; un visuel de type inconnu s'affiche « envoi d'images indisponible » ; si une écriture locale échoue pendant la préparation d'une restauration, sa relance différée peut réécrire une fiche restaurée.

### Prochaine étape
1. **Jean** : checklist du plan 6 sur le studio de test (avis de Claude avec image puis vidéo, pourquoi des recommandations, tableau de bord, export puis restauration avec sauvegarde) ; checklists des plans 4 et 5 si pas encore faites.
2. (fait) Fusion du plan 6 dans `main`.
3. **Après le dimanche 4 octobre :** lire le compte rendu de la première veille réelle.
4. **Phase 2 :** publication automatique (`publisher/`) et import automatique des statistiques.

## Contraintes

- Dépôt **privé** : aucun token, mot de passe ou média versionné.
- Le compte Instagram est un compte vitrine SFW ; la conformité Instagram est centrale.
- On échange en français avec Jean et la créatrice.
