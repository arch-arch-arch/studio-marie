# Plan 6 : confiance dans les données : spec de conception

- **Date** : 2026-09-29
- **Statut** : conception validée par Jean dans la conversation ; spec à relire
- **Parcours** : architectural (format des réponses de Claude, données du score, accès à toute la base)
- **Complète** : `docs/superpowers/specs/2026-09-27-studio-contenu-design.md` (§3, §4, §7 points 3, 5 et 6)

## 1. Objectif

Rendre le studio plus digne de confiance, sur trois fronts indépendants :

- **A. Transparence de l'évaluation.** On sait ce que Claude a réellement examiné et pourquoi il recommande chaque correction. Le score est présenté comme un avis, pas comme une prédiction.
- **B. Tableau de bord à faible volume.** Avec peu de publications, on voit d'abord des résultats simples, par contenu et par format, et le nombre de contenus comparés. Les comparaisons trompeuses restent masquées sous un seuil.
- **C. Export et restauration.** On peut récupérer une copie complète de la base du studio et la réimporter.

### Critères de réussite

- Chaque évaluation dit si le visuel a été vu et pourquoi il ne l'a pas été, et quelles données du profil et de la semaine ont été envoyées.
- Chaque recommandation a un « pourquoi ».
- Sous 5 contenus relevés, ni classement ni nuage de points. Les tableaux par contenu et par format sont affichés en premier.
- Un export JSON complet se télécharge en un clic, et sa restauration ne supprime rien.

### Hors périmètre

- L'export des visuels eux-mêmes : seuls leurs identifiants sont exportés.
- La restauration sélective d'une seule collection.
- Toute suppression de documents lors d'une restauration.

## 2. A. Transparence de l'évaluation

### 2.1 Bloc `examen` du score

Le contrôleur construit ce bloc lui-même au moment de l'évaluation, sans le demander à Claude, puis l'enregistre dans `score.examen` :

| Champ | Valeur |
|---|---|
| `visuel` | `joint`, `non_joint` ou `aucun` |
| `raison_visuel` | pour `non_joint` : `video` (visuel vidéo), `type` (format refusé par `sample.limits`), `taille` (trop lourd), `indisponible` (envoi d'images non disponible ou lecture échouée). `null` sinon. |
| `version_profil` | numéro de version du profil utilisé |
| `sections_profil` | liste des sections du profil réellement envoyées (après les retraits dus à la taille) |
| `contenus_semaine` | nombre d'autres contenus de la semaine envoyés (0 si le prompt a été réduit) |
| `alertes_calculees` | nombre d'alertes des règles calculées |
| `blocages_calcules` | nombre de causes de conformité calculées |

- `construirePrompt` renvoie désormais `{ texte, sections_profil, contenus_semaine }` au lieu d'une simple chaîne. Le contrôleur envoie `texte` à Claude.
- La veille renseigne aussi `examen`, avec `visuel: 'aucun'` et `raison_visuel: null`. Les autres champs sont calculés de la même façon, avec 0 contenu de la semaine.

### 2.2 Recommandations avec leur « pourquoi »

- Nouveau format de réponse demandé à Claude : `"recommandations":[{"texte":"…","pourquoi":"…"}, …]`, exactement 3.
- `validerReponse` accepte chaque recommandation sous deux formes :
  - un texte simple, normalisé en `{ texte, pourquoi: '' }` ;
  - un objet `{ texte, pourquoi }`, où `texte` est obligatoire et `pourquoi` facultatif.

  Elle renvoie toujours des objets.
- Les fiches enregistrent `recommandations` sous forme d'objets. Les anciennes fiches (textes) s'affichent telles quelles.
- La veille (`src/claude/veille.md`) demande le nouveau format. Le script accepte les deux.

### 2.3 Affichage dans la fiche

- Le titre devient « Avis de Claude : 72/100 » (« Avis de Claude » sans score), sous-titré « Avis d’expert, pas une prédiction de performance. ».
- Une section repliable (`details`) « Ce que Claude a examiné » liste, en phrases courtes :
  - le visuel, avec l'un de ces libellés :
    - « Visuel examiné. »
    - « Visuel non examiné : vidéo (seules les images sont envoyées). »
    - « Visuel non examiné : format refusé. »
    - « Visuel non examiné : fichier trop lourd. »
    - « Visuel non examiné : envoi d’images indisponible. »
    - « Pas de visuel. »
  - « Profil version N : sections … » ;
  - « N autre(s) contenu(s) de la semaine comparé(s). » ;
  - « N alerte(s) et N blocage(s) calculés par le studio. »

  Sans `examen`, la section affiche : « Détail non disponible pour cette évaluation (antérieure). ».
- Chaque recommandation affiche son texte, suivi de « Pourquoi : … » quand il existe.
- Le badge des cartes reste un nombre : le libellé n'y change pas.

## 3. B. Tableau de bord à faible volume

- **Constante :** `SEUIL_COMPARAISON = 5`, c'est-à-dire le nombre de contenus relevés dont le taux est calculable.
- **En-tête du tableau de bord :** « N contenu(s) relevé(s) sur 12 semaines », suivi de la répartition par format entre parenthèses, par exemple « (3 Reels, 1 carrousel) ». Avec 0 contenu : « Aucun contenu relevé sur 12 semaines. ».
- **Nouveaux tableaux, placés avant les graphiques :**
  - « Résultats par contenu » : une ligne par contenu (relevé de référence : 7 jours, sinon 48 h), de la plus récente à la plus ancienne. Colonnes : date, format, accroche, vues, nouveaux abonnés, taux d'abonnés par vue, partages et envois, relevé (48 h ou 7 jours).
  - « Par format » : pour chaque format présent, le nombre de contenus, le taux moyen (sur les contenus dont le taux est calculable) et les partages et envois moyens.
- **Sous le seuil :**
  - la figure « Meilleurs et pires contenus » et le nuage « Score prévu / performance réelle » affichent « Il faut au moins 5 contenus relevés pour comparer (actuellement N). » ;
  - la courbe et les barres restent affichées.
- La rétrospective du bulletin ne change pas : elle compare déjà sur 2 semaines, et ses textes disent le nombre de contenus relevés.

## 4. C. Export et restauration

### 4.1 Format du fichier

```json
{ "format": "studio-contenu-export", "version": 1, "exporte_le": "ISO",
  "note": "Les visuels ne sont pas inclus : seuls leurs identifiants le sont.",
  "collections": { "profil": [{ "id": "courant", "data": { … } }], "profil_archives": [], "fiches": [], "bulletins": [],
                   "stats_contenu": [], "releves_compte": [], "reference": [], "reference_resultats": [], "config": [] } }
```

- **Collections exportées :** `profil`, `profil_archives`, `fiches`, `bulletins`, `stats_contenu`, `releves_compte`, `reference`, `reference_resultats` et `config`. La liste `COLLECTIONS_EXPORT` est la seule source de vérité.
- **Chaque document** est `{ id, data }`, où `data` est le document sans son `id`.

### 4.2 Export

- Onglet Profil, nouvelle section « Sauvegarde », bouton « Exporter les données ».
- Le dépôt lit chaque collection en entier avec `collection(nom).get()`.
- Le fichier `studio-contenu-AAAA-MM-JJ.json` est proposé via la capacité `downloads` (`save({ filename, data })`). La date est le jour local, dans le fuseau du profil s'il existe, sinon en UTC.
- **Messages :**
  - « Export enregistré. » si le téléchargement a réussi ;
  - « Export annulé. » si tu refuses (`declined`) ;
  - « L’export n’est pas disponible dans cette vue. » si le téléchargement n'est pas disponible (`unavailable`, `not_granted`, etc.) ; dans ce cas, le bouton est masqué dès que `claude.use("downloads")` renvoie `null` ;
  - « L’export a échoué : réessaie dans un instant. » si une lecture échoue.
- Les pages publiées déclarent désormais `downloads: true` en plus de `db`, `assets` et `sample`.

### 4.3 Restauration

- Bouton « Restaurer depuis un export… » (sélecteur de fichier `.json`).
- **Validation :**
  - JSON lisible ;
  - `format === "studio-contenu-export"` et `version === 1` ;
  - `collections` est un objet ;
  - chaque collection connue est une liste de `{ id: texte non vide sans « / », data: objet }` ;
  - les collections inconnues sont ignorées et signalées.

  Tout manquement donne un message clair, sans rien écrire.
- **Aperçu :** « À restaurer : N fiches, N bulletins, … (total N documents). Les documents de même identifiant seront remplacés ; rien ne sera supprimé. » Deux boutons :
  - « Sauvegarder l’état actuel puis restaurer » (recommandé) : lance d'abord un export, puis restaure seulement si cet export a réussi ;
  - « Restaurer sans sauvegarde ».
- **Écriture :** document par document, dans l'ordre de `COLLECTIONS_EXPORT`, avec `set`.
  - Si une écriture échoue, la restauration s'arrête et affiche « Restauration interrompue après N document(s) sur N : réessaie, les documents déjà restaurés seront simplement réécrits. ».
  - En cas de succès : « Restauration terminée : N document(s) restauré(s). ».
- Après une restauration, les écoutes en temps réel du studio affichent les données restaurées, sans rechargement.

## 5. Erreurs et cas limites

- **Fichier trop gros :** jusqu'à 25 000 documents (limite de la base), sans limite propre au studio.
- **Profil restauré :** il est écrit tel quel, sans nouvelle version, puisqu'il s'agit d'une restauration. `reverifierFiches` s'applique ensuite normalement.
- **Données réelles :** un export du studio réel reste sur l'ordinateur de la personne. Le dépôt git n'en contient jamais.

## 6. Tests

- **A :**
  - construction de `examen` pour chaque cas de visuel ;
  - sections envoyées après retrait ;
  - `validerReponse` sur les deux formes de recommandations ;
  - affichage « Avis de Claude », section « Ce que Claude a examiné » (y compris le cas « antérieure ») et « Pourquoi : » ;
  - veille avec `examen`.
- **B :**
  - `resultatsParContenu` et `resultatsParFormat` ;
  - seuil (4 contenus contre 5) ;
  - en-tête (0, 1 et plusieurs contenus) ;
  - figures masquées sous le seuil.
- **C :**
  - `construireExport` et `validerExport` (format, version, id invalide, collection inconnue) ;
  - export sur la fausse base ;
  - restauration : écriture, arrêt sur erreur avec compteur, aucune suppression ;
  - « Sauvegarder puis restaurer » ;
  - vue Sauvegarde, avec son bouton masqué quand le téléchargement n'est pas disponible.
