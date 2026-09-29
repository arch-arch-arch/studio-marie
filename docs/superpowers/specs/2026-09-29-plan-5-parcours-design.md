# Plan 5 : parcours d'une fiche : spec de conception

- **Date** : 2026-09-29
- **Statut** : conception validée par Jean dans la conversation, spec à relire
- **Parcours** : architectural (champs de fiche, transitions de statut, date de référence des relevés)
- **Complète** : `docs/superpowers/specs/2026-09-27-studio-contenu-design.md` (§4, §7 point 1 et point 3)

## 1. Objectif

Pour chaque fiche, montrer immédiatement la **prochaine action** à faire, du contenu jusqu'aux résultats :

1. terminer le contenu ;
2. l'évaluer ;
3. confirmer sa programmation ;
4. confirmer sa publication ;
5. saisir ses statistiques.

Le studio reste ainsi utile même les semaines où la veille ne trouve rien.

Deuxième objectif : ne plus confondre « caption copiée » et « publication programmée ». Les statuts « Programmé » et « Publié » deviennent des confirmations manuelles, datées.

### Critères de réussite

- Sans rien ouvrir, on voit sur chaque carte ce qu'il reste à faire, et si c'est en retard.
- La vue Semaine liste les actions de la semaine, les retards en premier.
- Une fiche ne passe en « Programmé » ou en « Publié » qu'après une confirmation datée.
- Les relevés à 48 h et à 7 jours partent de la date **réelle** de publication.

### Hors périmètre

- La vérification automatique dans Meta Business Suite (phase 2, API).
- Les notifications.
- La liste « À faire » sur les autres onglets : elle n'apparaît que dans la vue Semaine, sur décision de Jean.

## 2. Données de la fiche

Deux champs s'ajoutent. Ils sont facultatifs et **aucune migration** n'est nécessaire.

| Champ | Contenu |
|---|---|
| `programme_pour` | ISO UTC : la date et l'heure confirmées comme programmées dans Meta Business Suite. `null` par défaut. |
| `publie_le` | ISO UTC : la date et l'heure réelles de publication. `null` par défaut. |

Règles :

- **Confirmer la programmation** met `statut: 'programme'`, `programme_pour = d` et `date_heure = d`. La date `d` est celle confirmée, préremplie depuis `date_heure`.
- **Confirmer la publication** met `statut: 'publie'`, `publie_le = d` et `date_heure = d`. Le calendrier montre ainsi la réalité.
- **Revenir à un statut antérieur** efface les confirmations devenues fausses :
  - vers `valide`, `brouillon` ou `idee` : `programme_pour = null` et `publie_le = null` ;
  - vers `programme` : `publie_le = null`.
  - Dans l'interface, on ne revient pas directement de Publié à Programmé : on repasse par Validé puis on reconfirme la programmation.
- **Déplacer une fiche programmée** (date modifiée, glisser-déposer) ne change ni son statut ni `programme_pour`. L'écart entre `date_heure` et `programme_pour` demande une reconfirmation (§4).
- **Date de départ des relevés** : `publie_le ?? date_heure`, notée `datePublication(fiche)`. Elle est utilisée par :
  - les échéances à 48 h et à 7 jours (`etatReleves`) ;
  - le champ `date_publication` des documents `stats_contenu` ;
  - la fenêtre et les relevés manquants de la rétrospective ;
  - la liste « Relevés à saisir » du tableau de bord.

  Pour les fiches publiées avant ce plan, sans `publie_le`, c'est `date_heure`.
- Ni `programme_pour` ni `publie_le` n'entrent dans l'empreinte : confirmer ne rend pas une fiche « à réévaluer ».

## 3. Confirmations

Les boutons « Programmé » et « Publié » du panneau n'appliquent plus le statut directement. Ils ouvrent un petit formulaire dans le panneau :

| | Programmé | Publié |
|---|---|---|
| Date et heure (fuseau du profil) | préremplies depuis `date_heure` | `date_heure` si elle est passée, sinon maintenant (arrondi à la minute) |
| Case obligatoire | « J'ai programmé ce contenu dans Meta Business Suite » | « Le contenu est en ligne » |
| Refus | date passée : « Choisis une date à venir : Meta Business Suite ne programme pas dans le passé. » | date future : « La date de publication ne peut pas être dans le futur. » |
| Case non cochée | « Coche la case pour confirmer. » | « Coche la case pour confirmer. » |
| Bouton | « Confirmer la programmation » | « Confirmer la publication » |

- Pour une programmation, une date est « passée » si elle est antérieure à maintenant. Pour une publication, une date est « future » si elle est postérieure à maintenant plus 5 minutes, ce qui tolère les écarts d'horloge.
- Les règles de validation actuelles s'appliquent avant la confirmation : visuel, caption hors story, évaluation à jour, conformité non rouge et vérification des règles au moment de la confirmation. En cas de refus, le formulaire affiche la raison et la fiche ne change pas.
- On peut passer directement de « Validé » à « Publié » (publication immédiate sans programmation). La publication est alors confirmée, et `programme_pour` reste `null`.
- Les boutons des autres statuts (Idée, Brouillon, Validé) ne changent pas.
- Le contrôleur expose `confirmerProgrammation(id, dateIso, coche)` et `confirmerPublication(id, dateIso, coche)`. Tous deux renvoient `{ ok, raison? }` et écrivent tout de suite.

## 4. Prochaine action

Logique pure : `prochaineAction(fiche, releves, maintenant, fuseau)` dans `src/logique/parcours.js`. Elle renvoie `{ cle, libelle, detail, retard }`. `releves` est la liste des relevés `stats_contenu` de cette fiche. On prend le premier cas qui s'applique :

| Statut | Condition | `cle` | `libelle` |
|---|---|---|---|
| idée ou brouillon | il manque le visuel et/ou la caption (hors story) | `terminer` | « Terminer : ajoute un visuel » / « … une caption » / « … un visuel et une caption » |
| idée ou brouillon | pas de score | `evaluer` | « Évaluer » |
| idée ou brouillon | fiche changée depuis l'évaluation (`aReevaluer`) | `reevaluer` | « Réévaluer » |
| idée ou brouillon | conformité rouge | `corriger` | « Corriger la conformité » (`detail` : les causes) |
| idée ou brouillon | conformité ni verte ni orange | `reevaluer` | « Réévaluer » |
| idée ou brouillon | sinon | `valider` | « Valider la fiche » |
| validé | toujours | `programmer` | « Confirmer la programmation » |
| programmé | maintenant ≥ `date_heure` | `publier` | « Confirmer la publication » |
| programmé | `programme_pour` absent ou ≠ `date_heure` | `reconfirmer` | « Reconfirmer la programmation » (`detail` : « La date a changé depuis la confirmation. » si `programme_pour` existe, sinon « Confirme la date programmée dans Meta Business Suite. ») |
| programmé | sinon | `attendre` | « Programmé pour le <date locale> » |
| publié | un relevé dû n'est pas saisi | `stats` | « Saisir les stats à 48 h » / « … à 7 jours » / « … à 48 h et à 7 jours » |
| publié | le relevé à 7 jours n'est pas encore dû | `attendre` | « Prochain relevé le <date locale> » |
| publié | sinon | `termine` | « Terminé » |

- **Retard** (`retard: true`) :
  - pour idée, brouillon, validé et programmé : `date_heure` est passée (le contenu devait déjà sortir) ;
  - pour `publier` : `date_heure` passée depuis plus de 24 h ;
  - pour `stats` : un relevé dû n'est pas saisi (même règle que « Stats à saisir »).
- `attendre` et `termine` sont des états sans action. On les affiche discrètement, ils ne comptent pas dans « À faire ».
- Les conditions `terminer` reprennent exactement celles de `peutPasserA` (visuel ; caption hors story) : l'action proposée ne contredit jamais un refus de validation.
- Les dates locales (« Programmé pour le … », « Prochain relevé le … ») sont formatées dans le fuseau passé en paramètre.

## 5. Affichage

- **Carte** (`carte.js`) : une ligne courte avec le libellé de l'action, sous l'accroche.
  - Classe `action-retard` en cas de retard, et libellé discret pour `attendre` ou `termine`.
  - Les relevés de la fiche ne sont pas chargés sur la carte. Pour une fiche publiée, la carte utilise les relevés disponibles dans l'état (`stats`, déjà écoutés pour 12 semaines). Si aucun n'est disponible, elle considère qu'aucun relevé n'est saisi.
- **Panneau de fiche** : un bandeau en haut, avec l'action, son détail et un bouton direct :
  - `evaluer` / `reevaluer` : lance l'évaluation ;
  - `programmer` / `reconfirmer` : ouvre le formulaire de programmation ;
  - `publier` : ouvre le formulaire de publication ;
  - `stats` : fait défiler jusqu'à la section Statistiques ;
  - `valider` : applique le statut Validé ;
  - `terminer` / `corriger` : pas de bouton, le détail suffit.
- **Vue Semaine** : une section « À faire cette semaine » sous le bandeau de contrôle.
  - Elle liste les fiches de la semaine affichée dont l'action n'est ni `attendre` ni `termine`.
  - Tri : retards d'abord, puis par `date_heure`.
  - Chaque ligne montre le format, le jour et l'heure, l'accroche, l'action, et un bouton « Ouvrir ».
  - Si la liste est vide : « Rien à faire cette semaine. »

## 6. Erreurs et cas limites

- Un formulaire de confirmation invalide ne modifie rien. Le message reste dans le formulaire.
- Une écriture qui échoue affiche le message habituel et laisse l'état inchangé.
- Si la fiche a été déplacée après sa programmation, un glisser-déposer suffit à faire apparaître « Reconfirmer ».
- Les idées de la veille restent en Brouillon. Leur prochaine action est souvent « Terminer : ajoute un visuel ».

## 7. Tests

- **Logique** (`tests/logique/parcours.test.js`) : chaque ligne du tableau §4, le retard de chaque statut, les libellés combinés (visuel et caption, 48 h et 7 jours) et la date locale.
- **Fiche et contrôleur** :
  - confirmations acceptées ;
  - date refusée (passée ou future) ;
  - case non cochée ;
  - effacement des confirmations au retour en arrière ;
  - `date_heure` alignée sur la date confirmée ;
  - passage direct de Validé à Publié ;
  - `datePublication` utilisée par les relevés et la rétrospective.
- **Vues** : ligne d'action sur la carte (retard), bandeau et bouton du panneau, formulaires de confirmation, liste « À faire cette semaine » (tri, liste vide).
