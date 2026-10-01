# Plan 7 : migration vers Vercel et Supabase : spec de conception

- **Date** : 2026-10-01
- **Statut** : conception validée par Jean dans la conversation, spec à relire
- **Parcours** : architectural (hébergement, base, connexion, évaluation, veille)
- **Remplace** : l'architecture « Artifact claude.ai » de `docs/superpowers/specs/2026-09-27-studio-contenu-design.md` (§2, §5.1 et §6). Les règles métier des specs existantes restent valables.

## 1. Objectif

Le studio doit offrir les **mêmes fonctionnalités** hors des Artifacts claude.ai, sur une page hébergée par Vercel avec une base Supabase. Jean a rencontré trop de problèmes d'accès, d'évaluation et d'enregistrement avec les Artifacts.

### Décisions de Jean

- **Connexion** : lien magique par e-mail, pour deux adresses seulement.
- **Évaluation par Claude** : pas de clé API pour l'instant. La fonction est construite, mais éteinte tant que la clé n'est pas configurée.
- **Veille** : tout sur Vercel (tâche planifiée et API Claude). Elle dépend de la même clé, donc elle est aussi éteinte au départ.

### Critères de réussite

- Jean et la créatrice se connectent par lien magique et retrouvent toutes leurs données : profil, fiches, bulletins, statistiques, jeu de référence, visuels.
- Tout ce qui ne dépend pas de Claude fonctionne comme avant :
  - calendrier, fiches et parcours ;
  - règles calculées et contrôle de semaine ;
  - statistiques et tableau de bord ;
  - export et restauration.
- Quand la clé Anthropic est ajoutée dans Vercel, l'évaluation et la veille fonctionnent sans nouveau déploiement de code.
- Aucune donnée réelle et aucune clé ne se trouve dans git.

### Hors périmètre

- La réécriture de l'interface (React, Next.js).
- La publication automatique et l'import automatique des statistiques (phase 2, inchangée).
- La suppression des Artifacts : ils restent en archive jusqu'au feu vert de Jean.

## 2. Architecture

**Principe : on garde le code, on change le socle.** `src/logique/`, `src/interface/` (vues, contrôleur, rendu) et `src/donnees/depot.js` ne changent pas d'interface. On remplace ce que la page recevait de `window.claude` par des adaptateurs de même forme.

| Capacité Artifact | Remplacement | Fichier |
|---|---|---|
| `db` (documents, `onSnapshot`, `where`) | Adaptateur Supabase de même interface | `src/socle/base-supabase.js` |
| `assets` (`upload`, `/_blob/<id>`) | Stockage Supabase privé, liens signés | `src/socle/visuels-supabase.js` |
| `sample` (`json`, `limits`) | Client de `/api/evaluer` | `src/socle/evaluation-api.js` |
| `downloads` (`save`) | Téléchargement par le navigateur | `src/socle/telechargement.js` |
| partage claude.ai | Connexion Supabase (lien magique) | `src/socle/connexion.js`, `src/interface/vue-connexion.js` |

```
public/            page servie par Vercel (index.html généré par le build)
src/socle/         adaptateurs (nouveau)
src/interface/     inchangé, sauf main.js, l'URL des visuels et la relance de la veille
api/               fonctions serveur Vercel : capacites, evaluer, veille
supabase/          schéma SQL et règles d'accès
scripts/           build (page et configuration publique), veille (logique réutilisée)
```

- **Build** : esbuild assemble toujours une seule page. Il y injecte l'URL du projet Supabase et sa clé publique (« anon »), lues dans les variables d'environnement au moment du build. Ces deux valeurs sont publiques par nature : la sécurité vient des règles d'accès.
- **Dépendances nouvelles** : `@supabase/supabase-js` (page et fonctions) et `@anthropic-ai/sdk` (fonctions serveur seulement). Le modèle Claude est lu dans la variable `MODELE_CLAUDE` (par défaut `claude-opus-4-8`).

## 3. Base de données

### 3.1 Table unique

```sql
create table documents (
  collection text not null,
  id text not null,
  data jsonb not null,
  maj_le timestamptz not null default now(),
  primary key (collection, id)
);
create index documents_date_heure on documents (collection, (data->>'date_heure'));
create index documents_date_publication on documents (collection, (data->>'date_publication'));
```

- Le modèle par documents est conservé à l'identique : mêmes collections, mêmes identifiants. L'export et la restauration du plan 6 fonctionnent sans changement, et la migration des données se résume à une restauration.
- **Règles d'accès (RLS)** : lecture, insertion, modification et suppression réservées au rôle `authenticated`. Rien pour le rôle anonyme.
- La table est ajoutée à la publication Realtime.

### 3.2 Adaptateur `base-supabase.js`

`creerBaseSupabase(client)` renvoie un objet qui a la même interface que la capacité `db`, celle qu'utilise `depot.js` :

- `doc(chemin)` :
  - `get()` → `{ id, exists, data() }` ;
  - `set(corps)` (upsert) ;
  - `delete()` ;
  - `onSnapshot(suivant, erreur)`.
- `collection(nom)` :
  - `where(champ, op, valeur)` avec `>=`, `<` et `==` sur des champs texte de premier niveau ;
  - `get()` ;
  - `onSnapshot(suivant, erreur)` ;
  - `doc(id)`.
- **`onSnapshot`** fait une première lecture, puis s'abonne aux changements Realtime de la collection et relit la requête à chaque changement. Il renvoie une fonction d'arrêt. Une erreur de lecture appelle `erreur` avec un objet `{ code }`.
- **Codes d'erreur** : session expirée ou accès refusé → `revoked`. Les autres erreurs passent telles quelles. `app.js` affiche déjà le message générique dans ce cas.
- **Limite** : au plus 1 000 documents par lecture de collection. Au-delà, l'adaptateur pagine.

## 4. Connexion

- Supabase Auth, lien magique par e-mail (`signInWithOtp`). **Les inscriptions sont désactivées** dans le projet : seules les adresses invitées par Jean peuvent se connecter.
- Au chargement, la page lit la session.
  - Sans session, elle affiche l'écran de connexion : un champ e-mail, un bouton « Recevoir le lien de connexion », puis le message « Lien envoyé : ouvre ta boîte mail. ».
  - Avec une session, elle démarre le studio.
- L'écran propose aussi une connexion par adresse et mot de passe, dans un bloc repliable sous le formulaire du lien. C'est un secours : tant qu'un SMTP n'est pas configuré, le service d'e-mail intégré de Supabase n'envoie qu'aux membres de l'organisation, donc le lien peut ne pas arriver. Les comptes restent créés par invitation, sans inscription libre.
- Un bouton « Se déconnecter » apparaît dans l'onglet Profil.
- Si la session expire, la page revient à l'écran de connexion.
- Si l'adresse saisie n'est pas invitée, la page affiche : « Cette adresse n’a pas accès au studio. ».

## 5. Visuels

- Un espace de stockage privé, `visuels`. Lecture et écriture sont réservées au rôle `authenticated`.
- **`visuels.upload(fichier)`** écrit le fichier sous un nom unique et renvoie `{ id }`, où `id` est le chemin dans l'espace de stockage. La limite est de 20 Mo, comme aujourd'hui. Les codes d'erreur sont conservés : `too_large`, `unsupported_type`, `rate_limited`.
- **Affichage** : `visuels.url(id)` renvoie un lien signé valable 1 heure. Le panneau de fiche demande ce lien au lieu d'utiliser `/_blob/<id>`. `chargerImage(id)`, qui sert à l'évaluation, télécharge le fichier par le même moyen.
- **Migration** : les visuels déjà présents dans les Artifacts sont copiés dans le stockage. Les fiches gardent leur champ `visuel`, qui reçoit le nouveau chemin.

## 6. Évaluation et veille (éteintes sans clé)

Trois fonctions serveur Vercel. Toutes vérifient le jeton de session Supabase, sauf l'appel planifié de la veille, qui est authentifié par le secret de tâche planifiée de Vercel.

- **`GET /api/capacites`** renvoie `{ evaluation: bool, veille: bool }`. Les deux valent vrai quand `ANTHROPIC_API_KEY` est définie. La page s'en sert pour afficher ou masquer « Évaluer » et « Relancer la veille ».
- **`POST /api/evaluer`**
  - Entrée : `{ prompt, image? }`, avec l'image en base64 et son type.
  - Appelle l'API Messages de Claude et renvoie le JSON de la réponse.
  - L'adaptateur `evaluation-api.js` expose `json(prompt, { signal, images })` et `limits()`, comme `sample`. Le contrôleur ne change pas.
  - Les erreurs sont traduites dans les codes déjà gérés : `rate_limited`, `invalid_json`, `refused`, `prompt_too_large`, `image_rejected`, `not_granted` (pas de clé) et `session_expired`.
- **`POST /api/veille`**
  - Déclencheurs :
    - la tâche planifiée Vercel, le lundi à 00 h et à 01 h UTC ; la règle `doit-tourner` ne garde que le dimanche à 20 h locale ;
    - le bouton « Relancer la veille », qui force l'exécution.
  - Étapes :
    1. lire le profil, les fiches, le bulletin et les relevés ;
    2. demander à Claude les tendances et les idées, avec l'outil de recherche web et les consignes de `src/claude/veille.md` adaptées ;
    3. appeler `construireVeille` (inchangée) ;
    4. écrire les fiches et le bulletin dans Supabase avec la clé de service, en une seule transaction (fonction SQL `appliquer_veille`). Une idée à remplacer n'est supprimée que si elle n'a pas changé depuis sa lecture.
  - Les règles de relance et de non-duplication ne changent pas.
  - Sans clé, la fonction répond `not_granted` et n'écrit rien.
  - `config/veille` n'est plus nécessaire : le bouton appelle directement la fonction.
- **Sans clé, côté page** :
  - « Évaluer » est masqué. C'est le comportement existant quand `sample` vaut `null`.
  - L'onglet Bulletin affiche « La veille n’est pas encore configurée. », sans bouton.

## 7. Export et restauration

- `telechargement.js` expose `save({ filename, data })`. Il crée un fichier dans le navigateur et déclenche son téléchargement. Il renvoie `{ status: 'saved' }`.
- Le reste du plan 6 ne change pas.

## 8. Environnements et secrets

| Variable | Où | Rôle |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Vercel (build), publiques | Connexion de la page |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (fonctions), **secrète** | Écritures de la veille |
| `CRON_SECRET` | Vercel, **secrète** | Authentifie la tâche planifiée |
| `ANTHROPIC_API_KEY` | Vercel, **secrète**, facultative | Active l'évaluation et la veille |
| `MODELE_CLAUDE` | Vercel, facultative | Modèle utilisé (par défaut `claude-opus-4-8`) |

- **Deux projets Supabase** : un de test, utilisé par les déploiements de prévisualisation Vercel, et un réel, utilisé par la production.
- Aucune de ces valeurs ne se trouve dans git. Un fichier `.env.example` liste leurs noms, sans valeurs. `.env*` est ignoré par git.
- C'est Jean qui crée les comptes et les projets et qui saisit les clés. Le dépôt contient la marche à suivre.

## 9. Bascule

1. Jean crée les projets et les variables d'environnement, en suivant la marche à suivre (`docs/mise-en-service-vercel-supabase.md`).
2. Le schéma SQL est appliqué aux deux projets.
3. Les données de chaque studio sont exportées (depuis la page, ou lues directement dans la base de l'Artifact si l'export échoue), puis restaurées dans le projet Supabase correspondant. Les visuels sont copiés.
4. Jean et la créatrice vérifient le studio réel.
5. La routine cloud de veille actuelle est désactivée. Les Artifacts restent en archive.

## 10. Erreurs et cas limites

- **Réseau coupé** : les écritures de fiches gardent le mécanisme actuel (indicateur « Échec de l’enregistrement », nouvelle tentative).
- **Realtime déconnecté** : la page relit les données à la reconnexion.
- **Lien magique ouvert sur un autre appareil** : la session s'ouvre sur cet appareil-là. C'est le comportement normal de Supabase, et la marche à suivre le signale.
- **Tâche planifiée sur l'offre gratuite de Vercel** : l'heure de déclenchement est approximative, dans l'heure. La règle `doit-tourner` l'accepte déjà.

## 11. Tests

- Les 474 tests existants restent verts.
- **`base-supabase.js`** : testé contre un faux client Supabase, qui reproduit les requêtes et les événements Realtime. Les tests de `depot.js` sont rejoués sur cet adaptateur.
- **`visuels-supabase.js`, `evaluation-api.js`, `telechargement.js`, `connexion.js`** : tests unitaires avec des doubles.
- **Fonctions `api/`** : tests avec de faux appels à Claude et un faux client Supabase. Cas couverts : sans clé, session invalide, réponse malformée, relance de la veille sans doublon.
- **Vérification manuelle** sur le projet de test : connexion, création et déplacement d'une fiche, visuel, relevé, export puis restauration.
