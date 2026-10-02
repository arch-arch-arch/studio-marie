# Plan 8 : analyse par dossier (Claude ou ChatGPT, sans API) : spec de conception

- **Date** : 2026-10-01
- **Statut** : conception validée par Jean dans la conversation ; spec à relire
- **Parcours** : architectural (nouveau flux d'évaluation, nouvelle collection, génération de fichier dans le navigateur)
- **Complète** : `2026-10-01-plan-7-vercel-supabase-design.md` (§6, évaluation) et `2026-09-29-plan-6-confiance-design.md` (§2, transparence)

## 1. Objectif

Permettre à la créatrice de faire analyser toute une semaine ou tout un mois de fiches par Claude ou ChatGPT, sur son propre abonnement, sans clé API et sans coût à l'usage.

Le studio fabrique un dossier unique (un PDF). Elle le joint dans son chat. Le modèle répond par une analyse lisible, suivie d'un bloc que le studio sait relire. Elle colle la réponse dans le studio, qui range l'avis dans chaque fiche.

### Ce qu'un essai réel a établi (1er octobre 2026)

- ChatGPT et Claude lisent les images d'un PDF : chaque visuel a été relié à la bonne fiche (5 sur 5), et un mot écrit en petit dans le visuel a été lu.
- Aucun des deux ne voit le nom des fichiers : l'identifiant de la fiche doit être écrit dans l'image.
- La stratégie placée avant les fiches est bien utilisée dans l'analyse.
- Défauts constatés, à traiter : photo de téléphone couchée (orientation non appliquée), marqueur de citation inséré par ChatGPT dans un texte, rôles de caption hors liste, bloc de code sans mention `json`.

### Critères de réussite

- Un seul fichier à joindre, quel que soit le modèle.
- Le lien entre un visuel et sa fiche ne dépend ni de l'ordre ni du nom des fichiers.
- Le retour collé met à jour chaque fiche comme une évaluation ordinaire : score, critères, recommandations, variantes, « Ce que Claude a examiné ».
- Une fiche modifiée entre le dossier et le retour n'est jamais notée sur son ancien texte.
- Rien n'est écrit si le retour est illisible ; un retour partiellement valide applique les fiches valides et dit lesquelles sont écartées, et pourquoi.

### Hors périmètre

- Le connecteur (MCP) qui laisserait le modèle lire et écrire dans le studio sans copier-coller.
- L'envoi automatique du dossier dans la conversation : un site ne peut pas l'injecter.
- Plusieurs visuels par fiche. Un carrousel n'a aujourd'hui qu'un visuel ; le dossier le dit.
- L'évaluation en différé par une routine, envisagée puis abandonnée au profit de ce plan.
- L'évaluation par API (plan 7) reste dans le code, éteinte sans clé. Les deux voies coexistent.

## 2. Parcours

1. Dans la vue Semaine ou Mois, bouton « Analyser la semaine » ou « Analyser le mois ».
2. Un panneau « Analyse par Claude ou ChatGPT » s'ouvre et prépare le dossier. Il affiche le nombre de fiches incluses.
3. Elle choisit « Partager le dossier » (téléphone) ou « Télécharger le dossier » (ordinateur), puis « Copier le message ». Deux liens ouvrent Claude et ChatGPT dans un nouvel onglet, sans rien transmettre dans l'adresse.
4. Dans le chat, elle joint le PDF, colle le message, envoie, lit l'analyse et peut en discuter.
5. Elle copie la réponse entière et la colle dans la zone « Coller le retour » du panneau, puis « Enregistrer le retour ».
6. Le studio affiche le résultat : « N fiche(s) mise(s) à jour », et la liste des fiches écartées avec la raison. L'avis d'ensemble apparaît dans la vue.

## 3. Le dossier

### 3.1 Fiches incluses

- Toutes les fiches de la période affichée dont le statut n'est pas « Publié », dans l'ordre chronologique.
- Au plus 30 fiches. Au-delà : « Trop de fiches pour un seul dossier : analyse semaine par semaine. », et aucun dossier n'est produit.
- Aucune fiche : « Aucune fiche à analyser sur cette période. ».

### 3.2 Références

- Chaque fiche reçoit une référence courte : `F01`, `F02`, etc., dans l'ordre du dossier.
- Le dossier reçoit un code : `D-` suivi de 6 caractères aléatoires.
- La correspondance est enregistrée dans la base (§5) au moment où le dossier est produit, avec l'empreinte de chaque fiche (`empreinte(f)`, fonction existante).

### 3.3 La carte d'une fiche

Une image JPEG composée dans le navigateur :

- un bandeau noir en haut, avec la référence en gros et, à côté, la date et le format (« F07 · mar. 14/10 · Reel ») ;
- le visuel dessous, redressé selon l'orientation enregistrée par l'appareil ;
- bord long de 1 568 pixels au plus, qualité 0,85.

Cas particuliers :

| Cas | Carte | Mention dans le dossier | `examen.visuel` |
|---|---|---|---|
| Image | bandeau et visuel | « visuel : image » | `joint` |
| Vidéo, images extraites | bandeau, couverture et jusqu'à 2 images côte à côte | « visuel : vidéo (couverture et images extraites, de gauche à droite) » | `joint` |
| Vidéo, extraction impossible | pas de carte | « visuel : vidéo, non jointe » | `non_joint`, raison `video` |
| Visuel illisible ou introuvable | pas de carte | « visuel : présent mais non joint » | `non_joint`, raison `indisponible` |
| Pas de visuel | pas de carte | « visuel : aucun » | `aucun` |
| Carrousel | carte du seul visuel | ajoute « (une seule image du carrousel est fournie) » | `joint` |

L'extraction d'images d'une vidéo est tentée pendant 8 secondes au plus par fiche. Un échec ne bloque pas le dossier.

### 3.4 Structure du PDF

Dans cet ordre :

1. **En-tête** : titre avec la période, code du dossier, et une consigne courte qui annonce la structure.
2. **Stratégie** : les sections du profil dans l'ordre de `extraireProfilDetaille`, rendues en listes lisibles (pas en JSON brut), 30 000 caractères au plus, avec le même ordre de retrait qu'aujourd'hui quand c'est trop long.
3. **Règles de la période** : cadence, part d'appels vers l'offre, rotation des rôles, et les alertes calculées par le contrôle de semaine.
4. **Une page par fiche** : la carte, puis un bloc délimité `<fiche id="F07">…</fiche>` avec date et heure locales, format, pilier (nom lisible), rôle de caption, appel vers l'offre, mène à la porte, accroche, caption, hashtags, géotag, mention du visuel, et les alertes et blocages calculés pour cette fiche.
5. **Consigne** : ce qu'il faut noter, la forme de la réponse (§4), le code du dossier à recopier.

Précisions de rédaction, issues de l'essai :

- Le champ s'appelle « appel vers l'offre » et le dossier précise qu'une simple question au public n'en est pas un.
- La consigne donne la liste exacte des rôles de caption autorisés : `engagement`, `cta`, `deadpan`.
- Les émojis ne peuvent pas être écrits avec la police du PDF : chacun est remplacé par son code entre crochets (`[U+1F525]`), et le dossier le dit en une ligne. C'est une limite connue.

### 3.5 Le message à coller

Texte fixe, sans donnée de la créatrice :

> Voici le dossier d'analyse de mes contenus. Lis-le en entier, regarde chaque visuel, puis réponds en suivant exactement la consigne qui se trouve à la fin du dossier.

## 4. La réponse

### 4.1 Forme demandée

D'abord une analyse en français courant, fiche par fiche puis sur l'ensemble. Pour un dossier de plus de 10 fiches, la consigne demande au plus trois lignes par fiche dans cette partie.

Ensuite, un seul bloc de code JSON, annoncé par la phrase « Bloc à coller dans le studio : » :

```json
{
  "dossier": "D-ab12cd",
  "fiches": [
    {
      "id": "F01",
      "notes": { "accroche": 7, "voix": 8, "mecanique": 6 },
      "phrases": { "accroche": "…", "voix": "…", "mecanique": "…" },
      "conformite": { "etat": "vert", "causes": [] },
      "captions": [ { "role": "engagement", "texte": "…" }, { "role": "deadpan", "texte": "…" } ],
      "accroches": [ "…", "…" ],
      "hashtags": [ "mot" ],
      "recommandations": [ { "texte": "…", "pourquoi": "…" }, { "texte": "…", "pourquoi": "…" }, { "texte": "…", "pourquoi": "…" } ]
    }
  ],
  "periode": { "avis": "…", "points_forts": [ "…" ], "risques": [ "…" ], "ordre_conseille": [ "F01" ] }
}
```

Chaque entrée de `fiches` a exactement la forme de l'évaluation unitaire existante, plus `id`. Les critères et la règle de conformité sont ceux du prompt actuel ; le visuel compte dans « accroche » et « voix », comme aujourd'hui.

### 4.2 Lecture par le studio

- Le studio cherche le dernier bloc de code de la réponse qui se lit comme un objet JSON portant `dossier`. Il accepte un bloc avec ou sans mention `json`. À défaut de bloc, il prend le texte de la première accolade à la dernière.
- Avant validation, il retire des textes les marqueurs de citation insérés par les interfaces (formes `:codex-file-citation{…}`, `【…】`, `[oaicite:…]` et `citeturn…`).
- `dossier` doit correspondre à un dossier enregistré. Sinon : « Ce retour ne correspond à aucun dossier produit par le studio. », rien n'est écrit.
- Chaque fiche est validée par `validerReponse`. Une fiche invalide est écartée avec ses erreurs ; les autres sont appliquées.
- Une référence inconnue ou en double est écartée.
- `periode` : `avis` est un texte ; `points_forts` et `risques` sont des listes de textes ; `ordre_conseille` ne garde que les références connues. Une `periode` absente ou invalide n'empêche pas d'appliquer les fiches ; le résultat le signale.

### 4.3 Application à une fiche

Pour chaque fiche valide :

- si la fiche n'existe plus : écartée, « fiche supprimée depuis le dossier » ;
- si son empreinte a changé depuis le dossier : écartée, « fiche modifiée depuis le dossier : refais une analyse » ;
- sinon, le studio recalcule la vérification de la fiche (règles calculées, comme pour une évaluation ordinaire), compose le score avec `composerScore` et l'applique avec `appliquerEvaluation`. Les règles calculées gardent l'autorité : un blocage calculé n'est pas levé par le modèle.

Le bloc `examen` du score reçoit en plus `source: 'dossier'` et `assistant` (`claude`, `chatgpt` ou `inconnu`). La section « Ce que Claude a examiné » de la fiche devient « Ce que l'assistant a examiné » pour ces scores, et sa première ligne dit : « Analyse par dossier (Claude). » ou « (ChatGPT) ». Les scores existants s'affichent comme avant.

L'assistant est celui dont le lien a été ouvert en dernier depuis le panneau ; à défaut, `inconnu`.

## 5. Données

Nouvelle collection `analyses`, un document par dossier, identifié par le code du dossier :

| Champ | Contenu |
|---|---|
| `periode` | `{ type, cle, debut, fin }` : `type` vaut `semaine` ou `mois`, `cle` vaut par exemple `2026-W41` ou `2026-10` |
| `cree_le` | date du dossier |
| `fiches` | liste de `{ ref, id, empreinte, visuel }` (`visuel` : `joint`, `non_joint` ou `aucun`, avec sa raison) |
| `assistant` | `claude`, `chatgpt` ou `inconnu` |
| `retour` | absent tant qu'aucun retour n'est enregistré ; sinon `{ recu_le, avis, points_forts, risques, ordre_conseille, appliquees: [id], ecartees: [{ ref, raison }] }` |

- Un nouveau retour pour le même dossier remplace le précédent.
- `analyses` rejoint `COLLECTIONS_EXPORT`. Un export ancien, sans cette collection, reste valide.
- Le PDF n'est pas conservé : il est produit à la demande et reste sur l'appareil.

Affichage : la vue Semaine et la vue Mois montrent, sous leur en-tête, le dernier retour de la période affichée dans une section repliable « Avis sur la semaine » ou « Avis sur le mois » (avis, points forts, risques, ordre conseillé avec les accroches des fiches), datée et signée de l'assistant.

## 6. Technique

- **Génération dans le navigateur**, sans serveur : les visuels sont téléchargés du stockage par l'adaptateur existant (`assets.telecharger`).
- **Bibliothèque PDF** : une seule dépendance nouvelle, choisie au plan entre `@cantoo/pdf-lib` et `jspdf` selon le poids et la prise en charge des images JPEG et du texte accentué. Elle est chargée seulement à l'ouverture du panneau, dans un fichier séparé de la page, pour ne pas alourdir le démarrage.
- **Partage** : `navigator.share({ files })` quand `navigator.canShare` l'accepte ; le fichier est prêt avant le toucher. Sinon, seul « Télécharger le dossier » est proposé (adaptateur `downloads` existant).
- **Presse-papiers** : `navigator.clipboard.writeText` ; en cas de refus, le message est affiché dans un champ à sélectionner.
- **Nom du fichier** : `analyse-<cle de période>.pdf`.
- **Logique pure et testable**, séparée de l'interface : choix des fiches, références, texte du dossier, lecture et validation du retour, application aux fiches. La composition des cartes et l'assemblage du PDF sont isolés derrière une interface que les tests remplacent.

## 7. Erreurs et cas limites

- Visuel introuvable ou trop long à charger : le dossier est produit sans la carte, la fiche le mentionne.
- Échec de la génération du PDF : « Le dossier n'a pas pu être préparé : réessaie. », rien n'est enregistré.
- Retour collé vide ou sans JSON lisible : « Je ne trouve pas le bloc à coller dans cette réponse. Copie toute la réponse de l'assistant, puis recolle-la. ».
- Réponse coupée (JSON incomplet) : même message, complété de « Si la réponse a été coupée, demande à l'assistant de redonner seulement le bloc. ».
- Écriture d'une fiche en échec : l'application s'arrête, le résultat dit combien de fiches ont été mises à jour, et un nouvel enregistrement du même retour reprend sans doublon.
- Deux dossiers pour la même période : chacun a son code ; la vue affiche le retour le plus récent.
- Session expirée pendant l'enregistrement : message de session existant, rien d'écrit.

## 8. Tests

- Choix des fiches (période, statut publié exclu, limite de 30, ordre) et attribution des références.
- Texte du dossier : sections dans l'ordre, bloc `<fiche>` complet, liste des rôles, code du dossier, émojis remplacés, mentions de visuel de chaque cas du tableau.
- Lecture du retour : dernier bloc de code, bloc sans mention `json`, texte sans bloc, préambule, marqueurs de citation retirés, JSON coupé.
- Validation : dossier inconnu, référence inconnue ou en double, fiche invalide écartée et autres appliquées, rôle hors liste, `periode` invalide.
- Application : fiche supprimée, empreinte changée, blocage calculé maintenu, `examen.source` et `assistant`, reprise après échec d'écriture.
- Interface : panneau (états préparation, prêt, erreur), boutons selon `canShare`, résultat affiché, section « Avis sur la semaine », libellé « Ce que l'assistant a examiné ».
- Export et restauration avec la collection `analyses`, et export ancien sans elle.
- Composition des cartes et PDF : vérifiés par un essai manuel sur le site de prévisualisation (ordinateur et iPhone), car le canvas et la vidéo ne sont pas reproduits fidèlement par l'environnement de test.
