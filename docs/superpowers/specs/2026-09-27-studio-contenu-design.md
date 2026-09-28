# Studio Contenu : spec de conception

- **Date** : 2026-09-27
- **Statut** : validée le 2026-09-28
- **Parcours** : architectural (nouveau projet)

## 1. Objectif

Aider une créatrice à gérer son compte Instagram (compte Créateur, vitrine SFW) sur deux points qui lui prennent le plus de temps :

1. **savoir quoi poster** (idées, accroches, captions, tendances) ;
2. **organiser et publier** avec régularité.

Le compte a trois rôles, que chaque contenu doit servir :

- le **tunnel** vers ses plateformes, via une « porte » : un highlight de stories qui contient le lien ;
- la **croissance** de l'audience ;
- la **marque** personnelle.

### Critères de réussite

- La semaine est planifiée à l'avance et respecte la cadence cible du profil.
- Chaque contenu a un score argumenté avant sa publication, et aucun contenu non conforme ne passe en « Validé ».
- Le lundi matin, un bulletin de tendances et 3 à 5 idées exploitables sont prêts.
- Le tableau de bord suit la **métrique boussole** (nouveaux abonnés rapportés aux vues, partages et envois) au lieu des vues et des likes bruts.

### Hors périmètre de la phase 1

- La publication automatique par l'API Instagram, prévue en phase 2 dans `publisher/`.
- L'import automatique des statistiques (phase 2).
- La gestion de plusieurs comptes, l'historique des modifications d'une fiche, les notifications push et le mode hors ligne.

## 2. Architecture

**Approche retenue : hybride**, puis automatique en phase 2.

| Composant | Rôle | Techno |
|---|---|---|
| **Studio** | Page web privée sur claude.ai : calendrier, fiches, bulletin, tableau de bord, profil | Artifact HTML/JS avec les capacités `db`, `assets`, `sample` et `user` |
| **Base partagée** | Profil, fiches, bulletins, statistiques | Capacité `db` de la page (base de documents JSON) |
| **Stockage des visuels** | Photos et vidéos des fiches | Capacité `assets` de la page |
| **Évaluation** | Score et génération à la demande | Capacité `sample` : la page interroge Claude avec le compte de la personne qui clique |
| **Veille hebdo** | Bulletin et idées du dimanche soir | Tâche Claude programmée qui écrit dans la base (voir §6.1) |
| **Publication** | Manuelle via Meta Business Suite, puis la fiche passe en « Programmé » | Bouton « Copier » dans la fiche |

- **Accès** : Jean et la créatrice ont le rôle d'éditeur sur la page.
- **Préparation de la phase 2** : une fiche « Validé » contient déjà tout ce que l'API demande (média, caption, date et heure).

### Dépôt git et confidentialité

- Le dépôt, **privé**, ne contient que le code, la spec et un **profil d'exemple fictif**.
- Aucune donnée réelle de la créatrice n'est versionnée : nom, pseudo, e-mail, plateformes, statistiques, contenus ou visuels.
- Le vrai profil vit seulement dans la base du studio.
- `.gitignore` bloque `*profil_marque*.json`, `data/`, `media/` et les secrets.

### Découpage du code

La logique pure est séparée de l'interface pour pouvoir la tester sans navigateur :

```
src/logique/     règles calculées du score, contrôle de semaine, empreinte,
                 indicateurs, règle de relance de la veille (JS pur, testé avec Vitest)
src/claude/      consignes envoyées à Claude, schémas JSON des réponses, validation
src/interface/   vues Semaine, Mois, Jour, Fiche, Bulletin, Tableau de bord, Profil
src/donnees/     accès à la base (collections de la §4)
exemples/        profil fictif et fixtures de test
publisher/       phase 2
```

Une étape de build assemble le tout en une seule page HTML publiée comme Artifact.

## 3. Score et génération

### 3.1 Entrées

- format et visuel ;
- pilier et format validé du profil ;
- rôle de la caption : engagement, appel à l'action ou deadpan ;
- date et heure ;
- profil (dernière version) ;
- bulletin de la semaine ;
- autres fiches de la semaine.

### 3.2 Score de la fiche, sur 100

La pondération dépend du format, car chaque format a un rôle différent : les Reels recrutent, le feed convertit, les stories mènent à la porte.

| Critère | Ce qui est vérifié | Reel | Carrousel | Story |
|---|---|---|---|---|
| **Accroche et diffusion** | Accroche lisible en moins d'une seconde et en moins de 15 mots ; paradoxe ou question ; visage face caméra ; contenu fait pour être envoyé ou sauvegardé ; créneau recommandé par le profil | 40 | 30 | 20 |
| **Voix et esthétique** | Test de la voix du profil ; expressions signature ; mots à éviter ; esthétique du profil ; zone de contenu prioritaire | 30 | 35 | 30 |
| **Mécanique de la caption** | Première ligne qui provoque avant le « …plus » ; une seule micro-action ; 3 à 5 hashtags et mots-clés en fin de caption ; pour un carrousel, ordre des slides du profil sans superposer meme et photo ; pour une story, amener vers la porte | 30 | 35 | 50 |

Les formats « post » (photo seule) sont déconseillés par le profil. Ils sont notés avec la grille du carrousel et reçoivent une recommandation de passer en carrousel.

### 3.3 Conformité : le verrou

Ce qui est vérifié :
- surface SFW ;
- aucun lien vers une plateforme payante ailleurs que dans la story-porte ;
- géotag jamais au domicile ni en temps réel, au niveau de la ville par défaut ;
- garde-fous du ragebait : viser un comportement, jamais un groupe ; adultes sans ambiguïté ;
- aucun boost payant.

**Quand la conformité est au rouge :**
- le score est **plafonné à 40** ;
- la fiche **ne peut pas passer en « Validé »** ;
- la cause exacte est affichée (tel mot, tel lien, tel géotag).

### 3.4 Règles calculées et jugement de Claude

- **Règles calculées** (`src/logique/`, sans appel à Claude) : mots à éviter, longueur de l'accroche, nombre de hashtags, présence d'un appel à l'action, lien interdit, géotag trop précis, créneau hors des plages recommandées. **Le verrou de conformité repose en priorité sur ces règles.**
- **Jugement de Claude** : force de l'accroche, voix, esthétique, cohérence avec le pilier, potentiel de partage.
- Le score final additionne les points de chaque critère. Claude reçoit le résultat des règles calculées et ne peut pas lever un blocage qu'elles ont posé.
- Chaque alerte non bloquante (accroche absente ou trop longue, hashtags hors plage, contenu hors créneau) retire 20 % des points maximum du critère concerné. La conformité finale est la plus sévère entre la conformité calculée et celle jugée par Claude, et leurs causes sont cumulées.

### 3.5 Contrôle de la semaine

C'est un bandeau du calendrier, sans note. Il affiche des pastilles vertes, orange ou rouges :

- cadence : 4 Reels, 2 carrousels, des stories chaque jour ;
- appels à l'action : environ 1 sur 4 ;
- rôles des captions : 2 engagement, 1 appel à l'action, 1 deadpan ;
- ragebait : au plus 1 ;
- stories vers la porte : 2 à 3 ;
- équilibre entre les piliers du profil.

Les valeurs cibles sont lues dans le profil, pas codées en dur.

### 3.6 Déclenchement et sorties

- Le score n'est calculé qu'avec le **bouton « Évaluer »**, pas à chaque modification.
- La fiche passe « **à réévaluer** » dès que l'empreinte de la caption ou du visuel change.

**Sorties**, dans un JSON validé par un schéma :
- le score, avec une phrase par critère ;
- 2 captions avec des rôles différents ;
- 2 ou 3 accroches (tirées de la banque du profil ou adaptées d'une tendance) ;
- des hashtags ;
- 3 recommandations concrètes.

### 3.7 Calibration

Le score est un avis d'expert, pas une prédiction. On le confronte aux relevés réels (§4, `stats_contenu`) dans le tableau de bord, avec un graphique score prévu / performance réelle, et au jeu de référence (§8, point 3).

## 4. Modèle de données

Tout est dans la base partagée du studio. Les dates sont stockées en UTC et affichées dans le fuseau du profil.

| Collection | Contenu |
|---|---|
| `profil` | Document `profil/courant` : le profil de marque importé (JSON, avec un bloc `regles_studio` lisible par la machine, voir `exemples/profil-fictif.json`) et son numéro de `version`. Les versions précédentes sont archivées dans `profil_archives/v<n>`. Chaque score garde la version utilisée. |
| `fiches` | Un document par contenu (voir le détail ci-dessous). |
| `bulletins` | Un document par semaine ISO : rétrospective, tendances, alertes, identifiants des idées créées, sources, erreurs, date de génération. |
| `stats_contenu` | Deux relevés par fiche publiée (**48 h** et **7 jours**) : vues, nouveaux abonnés, partages et envois, sauvegardes, visites du profil, clics sur la porte. Le taux d'abonnés par vue est calculé, pas saisi. |
| `releves_compte` | Un relevé par semaine, le dimanche : abonnés, vues moyennes des stories, clics sur la porte. La croissance nette est calculée. |
| `reference` | Jeu de référence : un document par contenu `{ format, pilier, accroche, caption, hashtags, resultat: gagnant|perdant }`. |
| `reference_resultats` | Document `dernier` : bilan de la dernière vérification du classement. |

**Champs d'une fiche :**
- **type de contenu** : `format`, `pilier`, `format_valide`, `role_caption`, `cta` (booléen), `ragebait` (booléen), `porte` (booléen, story qui mène à la porte) ;
- **planification** : `date_heure` (UTC) et `statut` : Idée → Brouillon → Validé → Programmé → Publié ;
- **contenu** : `visuel` (identifiant du fichier stocké), `visuel_type` (`image` ou `video`), `accroche`, `caption`, `variantes`, `hashtags`, `geotag` (niveau ville) ;
- **score** : `total`, `criteres`, `conformite` (état et causes), `version_profil`, `evalue_le`, `empreinte` ;
- **recommandations**, **variantes** (2 captions `{ role, texte }`) et **suggestions** (`{ accroches, hashtags }`) ;
- **origine** : `manuelle`, `veille` ou `banque`, avec l'identifiant du bulletin quand l'idée vient de la veille ;
- `modifiee_depuis_creation` (booléen), qui sert à la règle de relance de la veille.

## 5. Veille hebdo

### 5.1 Déclenchement

- **Routine Claude Code cloud** (voir §6.1), programmée le **dimanche à 20 h** dans le fuseau du profil. L'expression cron, en UTC, est recalculée aux changements d'heure.
- Bouton « **Relancer la veille** » dans le studio : c'est un lien vers la page de la routine sur claude.ai, qui a un bouton « Run now ». La page du studio ne peut pas déclencher la routine elle-même.
- La routine clone le dépôt pour y lire ses consignes (`src/claude/veille.md`) et écrit dans la base avec l'outil `ArtifactData`.

### 5.2 Ce qu'elle lit

- le profil ;
- les statistiques des 2 dernières semaines ;
- le relevé du compte de la semaine ;
- les créneaux libres de la semaine suivante, au regard de la cadence.

### 5.3 Sources

Recherche web :
- annonces d'Instagram aux créateurs (algorithme, règlement, formats) ;
- rapports publics de tendances (sons, formats de Reels, memes) ;
- tendances de la niche définie dans le profil.

Deux limites :
- **pas de scraping d'Instagram** ;
- un son tendance est marqué « **à vérifier dans l'app** ».

### 5.4 Filtre de marque

Chaque tendance passe le test de voix, d'esthétique et de conformité du profil. Elle est **adaptée** (avec la façon de l'adapter) ou **écartée** (avec la raison). La veille en garde 3 à 5.

### 5.5 Bulletin

1. **Rétrospective** : meilleur et pire contenu selon le taux d'abonnés par vue et les partages ; écarts avec les indicateurs cibles du profil ; relevés manquants.
2. **Tendances** : source, date, pourquoi elle colle à la marque, comment l'adapter, durée de vie estimée.
3. **Alertes** : changements de règles Instagram. La veille peut *proposer* une mise à jour du profil, jamais l'appliquer.
4. **Idées** : 3 à 5 fiches en « Brouillon », déjà évaluées, placées sur les créneaux libres, avec une rotation des rôles de caption qui respecte le contrôle de semaine.

### 5.6 Erreurs

- **Relance** : un bulletin par semaine ISO. Une relance remplace le bulletin et **uniquement** ses propres idées restées en « Brouillon » avec `modifiee_depuis_creation = false`.
- **Recherche web en panne** : bulletin partiel marqué « sources indisponibles ». Les idées viennent alors de la banque d'accroches et des performances passées.
- **Statistiques non saisies** : la rétrospective est remplacée par un rappel de saisie.
- **Tâche non exécutée** : bandeau « Pas de bulletin cette semaine » et bouton de relance.

## 6. Points techniques à confirmer

### 6.1 La routine cloud peut écrire dans la base : confirmé

Test du 2026-09-28 : une routine cloud ponctuelle (modèle `claude-sonnet-5`, outils `ToolSearch`, `Bash`, `Read`, `Artifact` et `ArtifactData`) a écrit un document dans la base d'une page de test, puis l'a relu, en 13 secondes. La veille tourne donc **dans le cloud, même PC éteint**.

Points à retenir pour la vraie routine :

- déclarer `ArtifactData` (et `ToolSearch`) dans `allowed_tools` ;
- `WebSearch` et `WebFetch` seront nécessaires pour la recherche de tendances. Ils n'ont pas été testés : à vérifier au premier lancement ;
- l'URL du studio réel est inscrite dans les consignes de la routine, jamais dans le dépôt.

### 6.2 Coût de `sample`

Chaque évaluation est facturée à la personne qui clique. C'est pour ça que le score se calcule uniquement avec le bouton « Évaluer ».

## 7. Interface

**Conçue d'abord pour l'ordinateur (Mac)**, avec un affichage adapté au téléphone pour les consultations rapides.

1. **Semaine** (écran d'accueil) :
   - le bandeau de contrôle de semaine en haut ;
   - 7 colonnes, avec une carte par contenu : icône du format, couleur du pilier, statut, et badge de score avec un cadenas si la conformité est au rouge et un point si la fiche est à réévaluer ;
   - les créneaux recommandés encore vides en pointillé (« + Reel ») ;
   - le **glisser-déposer** d'une carte change sa date et recalcule le contrôle ;
   - sur téléphone, les jours sont listés les uns sous les autres.
2. **Mois et Jour** : le mois est une grille avec des points colorés par format ; le jour est une frise horaire.
3. **Fiche**, en **panneau latéral** à côté de la semaine :
   - visuel à glisser depuis le Finder ;
   - champs de la §4 ;
   - bouton « Évaluer » et détail du score ;
   - variantes de caption avec les boutons « Utiliser » et « **Copier** » ;
   - boutons de statut ;
   - relevés à 48 h et à 7 jours une fois la fiche publiée, avec une pastille « stats à saisir » en cas de retard.
4. **Bulletin** : rétrospective, tendances, alertes, liens vers les idées déposées, bouton « Relancer la veille ».
5. **Tableau de bord**, avec les graphiques côte à côte :
   - taux d'abonnés par vue des Reels, dans le temps ;
   - partages et envois par post ;
   - croissance nette hebdomadaire comparée à la cible ;
   - clics sur la porte ;
   - meilleurs et pires contenus ;
   - score prévu / performance réelle.
6. **Profil** : lecture seule, avec l'import d'une nouvelle version du JSON (la version précédente est conservée et le numéro de version augmente).

## 8. Tests et vérification

1. **Tests automatiques (Vitest)** de toute la logique de `src/logique/` :
   - règles calculées et verrou de conformité ;
   - contrôle de semaine ;
   - empreinte et passage « à réévaluer » ;
   - calculs du tableau de bord ;
   - règle de relance de la veille ;
   - déplacement d'une carte.
2. **Réponses de Claude** : validation par un schéma JSON. Des tests couvrent les réponses malformées ou incomplètes : le studio affiche un message clair, propose de relancer et **n'écrit jamais de données partielles** dans une fiche.
3. **Jeu de référence** : une dizaine de contenus réels dont les résultats sont connus. Le score doit classer les contenus gagnants au-dessus des perdants. On relance cette vérification à chaque changement des consignes de score. Ce jeu contient des données réelles : il vit dans la base du studio, jamais dans git. Le dépôt ne contient que des fixtures fictives.
4. **Deux studios** : un studio de test avec le profil fictif, et le studio réel.
5. **Checklist manuelle avant chaque mise en production**, sur la page publiée : créer une fiche, l'évaluer, la déplacer, la passer en « Publié », saisir un relevé, vérifier le tableau de bord, relancer la veille.
