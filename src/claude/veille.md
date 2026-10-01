# Veille hebdomadaire du studio

Tu prépares la semaine visée (renvoyée par `plage`) d'un compte Instagram. L'URL du studio (un Artifact claude.ai) t'est donnée dans ta mission : on l'appelle ci-dessous `STUDIO`. Travaille dans le dépôt cloné, dans le dossier de travail `veille-tmp/`, que tu crées.

Interdits :
- Ne modifie jamais le profil.
- Pas de scraping d’Instagram.
- Aucun commit, aucun push, aucune modification des fichiers suivis par git.
- Aucune écriture en base en dehors du lot final.

## 1. Lire le profil
- Charge les outils `ArtifactData`, `WebSearch` et `WebFetch` (ToolSearch `select:ArtifactData,WebSearch,WebFetch`).
- `ArtifactData` `get` sur `STUDIO`, avec `collection: "profil"` et `doc_id: "courant"`, avec `out_dir` = `veille-tmp/`. Le fichier obtenu est `veille-tmp/profil/courant.json`.
- Si ta mission indique un déclenchement manuel ou un test, ajoute `--forcer` à `doit-tourner`.
- Lance `node scripts/veille.mjs doit-tourner --profil veille-tmp/profil/courant.json`. Si la sortie est `non`, arrête-toi là : c'est le deuxième déclenchement de la nuit. Réponds « Veille déjà faite ou hors horaire. »

## 2. Lire la semaine visée (renvoyée par `plage`)
- Lance `node scripts/veille.mjs plage --profil veille-tmp/profil/courant.json`. Tu obtiens `{ semaine, debut, fin, lecture_debut, lecture_fin }`.
- `ArtifactData` `query` sur `STUDIO`, avec `collection: "fiches"` et `query: { where: [["date_heure", ">=", lecture_debut], ["date_heure", "<", lecture_fin]] }`, avec `out_dir` = `veille-tmp/`. Les fichiers arrivent dans `veille-tmp/fiches/`. Cette plage élargie (14 jours avant, 28 jours après la semaine visée) permet de retrouver les idées de ce bulletin déplacées vers une autre semaine.
- `ArtifactData` `get` sur `STUDIO`, avec `collection: "bulletins"` et `doc_id` = `semaine`, avec `out_dir` = `veille-tmp/`. S'il n'existe pas, c'est le premier passage.
- Après chaque lecture avec `out_dir` (fiches puis bulletin), recopie les versions affichées dans le résultat de l'outil (ligne `- "<doc_id>"  N bytes  version V  "<chemin>"`) dans `veille-tmp/versions.json`, au format `{ "fiches/<id>": V, "bulletins/<semaine>": V }`. Crée toujours ce fichier : `{}` si aucune lecture n'a renvoyé de document. Un seul objet pour toutes les lectures (fiches et bulletin). Chaque version est un nombre entier, sans guillemets.
- Lis aussi les relevés de statistiques :
  - `ArtifactData` `query` sur `STUDIO`, avec `collection: "stats_contenu"` et `query: { where: [["date_publication", ">=", lecture_debut], ["date_publication", "<", debut]] }`, avec `out_dir` = `veille-tmp/`. Les fichiers arrivent dans `veille-tmp/stats_contenu/` ;
  - `ArtifactData` `query` sur `STUDIO`, avec `collection: "releves_compte"` et `query: { where: [["debut", ">=", lecture_debut], ["debut", "<", debut]] }`, avec `out_dir` = `veille-tmp/`. Les fichiers arrivent dans `veille-tmp/releves_compte/`.
  - Ces lectures ne sont pas écrites ensuite : elles n'entrent pas dans `versions.json`. Si une collection est vide, continue.

## 3. Chercher les tendances
- Avec `WebSearch` (et `WebFetch` pour lire une page), cherche sur les 14 derniers jours :
  - les annonces d'Instagram aux créateurs (algorithme, règlement, formats) ;
  - les rapports publics de tendances (sons, formats de Reels, memes) ;
  - les tendances de la niche décrite dans le profil.
- Passe chaque tendance au filtre de la marque (test de la voix, esthétique, conformité SFW, mots à éviter). Elle est soit adaptée, avec la façon de l'adapter, soit écartée, avec la raison. Garde-en 3 à 5.
- Si tu gardes moins de 3 tendances, mets `sources_indisponibles: true` et garde-les quand même (5 au maximum).
- Un son tendance porte `son_a_verifier: true` : on ne peut pas le confirmer hors de l'application.
- Si la recherche web échoue ou ne donne rien d'exploitable, mets `sources_indisponibles: true`, laisse `tendances` vide et continue : les idées viendront de la banque d'accroches et des performances passées du profil.
- Un changement de règle Instagram devient une alerte. Si le profil devrait évoluer, décris-le dans `proposition_profil`, mais ne l'applique pas.

## 4. Rédiger 3 à 5 idées
Pour chaque idée : format, pilier (une clé de `regles_studio.piliers`), rôle de caption, appel à l'action ou non, accroche, caption et hashtags, dans la voix du profil.

Respecte le contrôle de semaine du profil (cadence, part d'appels à l'action, rotation des rôles, ragebait) en tenant compte des fiches déjà présentes.

Ne repropose pas une idée proche d'une fiche déjà présente dans `veille-tmp/fiches/` (même angle ou accroche voisine), même si son accroche a été retouchée.

Évalue ensuite chaque idée comme une éditrice exigeante, au format `"jugement"` :

```json
{"notes":{"accroche":7,"voix":8,"mecanique":6},"phrases":{"accroche":"…","voix":"…","mecanique":"…"},"conformite":{"etat":"vert","causes":[]},"captions":[{"role":"engagement","texte":"…"},{"role":"deadpan","texte":"…"}],"accroches":["…","…"],"hashtags":["mot"],"recommandations":[{"texte":"…","pourquoi":"…"},{"texte":"…","pourquoi":"…"},{"texte":"…","pourquoi":"…"}]}
```

Règles du jugement :
- une phrase par critère ;
- exactement 2 captions, de rôles différents ;
- 2 ou 3 accroches ;
- des hashtags sans `#` ;
- 3 recommandations, chacune avec un pourquoi court ;
- tout en français.

Appuie-toi sur les performances passées : les relevés de `veille-tmp/stats_contenu/` montrent ce qui a le mieux marché (taux d'abonnés par vue, puis partages et envois). Reprends les mécaniques des meilleurs contenus et évite celles des pires.

## 5. Écrire l'entrée et construire
Écris `veille-tmp/entree.json` :

```json
{ "sources_indisponibles": false,
  "tendances": [{ "titre": "…", "source": "URL ou nom", "date": "AAAA-MM-JJ", "pourquoi": "…", "adaptation": "…", "duree_vie": "…", "son_a_verifier": false }],
  "ecartees": [{ "titre": "…", "raison": "…" }],
  "alertes": [{ "texte": "…", "proposition_profil": null }],
  "idees": [{ "format": "reel", "pilier": "…", "role_caption": "engagement", "cta": false, "format_valide": "", "accroche": "…", "caption": "…", "hashtags": ["…"], "tendance": "titre de la tendance ou null", "jugement": { … } }] }
```

Lance ensuite `node scripts/veille.mjs construire --profil veille-tmp/profil/courant.json --fiches veille-tmp/fiches --entree veille-tmp/entree.json --sortie veille-tmp/ecritures.json --bulletin veille-tmp/bulletins/<semaine>.json --versions veille-tmp/versions.json --stats veille-tmp/stats_contenu --releves veille-tmp/releves_compte`.

Si la commande échoue, elle affiche les erreurs. Corrige `entree.json` et relance. Au plus 3 exécutions de `construire` au total. Tant que le code de sortie n'est pas 0, n'applique rien. Si elle échoue encore après ces 3 exécutions, arrête-toi sans rien écrire et rends compte des erreurs.

## 6. Appliquer en un seul lot
Lis `veille-tmp/ecritures.json`, puis appelle une seule fois `ArtifactData` `batch` sur `STUDIO`, avec la liste `ecritures` telle quelle en paramètre `writes`. Relis ensuite `bulletins/<semaine>` pour vérifier. Si le lot échoue sur un conflit de version, autorise-toi une seule reprise depuis l'étape 2 (nouvelle lecture, nouvelle construction). Pour cette reprise : vide `veille-tmp/fiches/`, relis comme à l'étape 2 (fiches, bulletin) et réécris `versions.json`. Garde `veille-tmp/entree.json` tel quel, sans nouvelle recherche web. Relance `construire`, avec de nouveau au plus 3 exécutions. Pour tout autre échec (refus, erreur), n'écris rien d'autre, ne réessaie pas entrée par entrée, et rends compte de l'erreur.

## 7. Compte rendu
Termine par une ligne : le `resume` du script, puis « Sources : complètes » ou « Sources : indisponibles ».
