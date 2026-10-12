# Studio Contenu

Outil de planification, de génération et de pilotage de contenu Instagram.

## Objectif

Aider la créatrice à savoir **quoi poster** et à **organiser et publier** avec régularité,
au service de trois objectifs : tunnel vers ses plateformes, croissance d'audience
et image de marque.

## Approche retenue : hybride, puis automatique

**Phase 1, hybride (en cours de conception)**

- **Studio Contenu** : page web statique hébergée sur Vercel, avec une base Supabase (connexion par lien magique ou mot de passe, accès réservé aux comptes créés par Jean).
  - Profil de marque (persona, niche, piliers, ton, limites Instagram)
  - Calendrier jour / semaine / mois, avec les statuts Idée → Brouillon → Validé → Programmé → Publié
  - Fiche contenu : caption, hashtags, recommandations et score sur 100
    (Tunnel · Croissance · Marque · Conformité Instagram)
  - Bulletin tendances hebdomadaire, avec rétrospective des relevés
  - Tableau de bord : taux d'abonnés par vue, partages et envois, croissance nette, clics sur la porte
- **Veille hebdo** : tâche Claude programmée qui recherche les tendances Instagram
  et dépose des idées en brouillon dans le calendrier.
- **Publication** : manuelle via Meta Business Suite.

**Phase 2, automatique (plus tard)**

- `publisher/` : module qui publie les fiches « Validé » via l'API officielle
  Instagram (compte Créateur).

## Structure

```
docs/superpowers/specs/   Spécifications de conception
docs/superpowers/plans/   Plans d'implémentation
exemples/                 Profil fictif et fixtures (aucune donnée réelle)
api/                      Fonctions serveur Vercel (capacités, évaluation, veille)
supabase/                 Schéma SQL et règles d'accès
scripts/build.mjs         Construit public/index.html et public/dossier.js
scripts/veille.mjs        Outil de la veille (plage, doit-tourner, construire)
scripts/migrer.mjs        Migration des données de l'ancien studio vers Supabase
src/claude/               Consignes et contrats pour Claude (évaluation, veille)
src/logique/              Règles métier pures (testées)
src/socle/                Adaptateurs Supabase (base, visuels, connexion, évaluation)
src/donnees/              Accès à la base du studio
src/interface/            Vues et panneau de fiche
tests/                    Tests Vitest
publisher/                Phase 2 : publication automatique
```

Commandes :

- `npm test` : lance les tests.
- `npm run build` : construit `public/index.html` et `public/dossier.js`. Il lit `SUPABASE_URL` et `SUPABASE_ANON_KEY` dans l'environnement (valeurs publiques par nature).
- Mise en service : suis `docs/mise-en-service-vercel-supabase.md` (projets Supabase, variables Vercel, adresses de retour, utilisateurs, migration des données).

Analyse par dossier : elle ne demande aucune clé. Le module `/dossier.js` est construit avec la page et chargé à la demande.

Évaluation directe et veille : elles passent par l'API Anthropic et restent éteintes tant que `ANTHROPIC_API_KEY` n'est pas définie dans Vercel. Sans clé, le bouton « Évaluer » est masqué et la liste « À faire cette semaine » propose « Analyser la semaine » à la place.

L'ancienne version Artifact claude.ai reste en lecture seule le temps de la bascule.

## Statut

- [x] Choix de l'approche (hybride, puis automatique)
- [x] Architecture d'ensemble validée
- [x] Conception détaillée (données, score, veille, interface)
- [x] Spec écrite et validée
- [x] Plan 1 : fondations et calendrier (studio de test publié)
- [x] Plan 2 : évaluation par Claude et studio réel
- [x] Plan 3 : veille hebdo (outil et consignes ; désormais sur Vercel, éteinte sans clé)
- [x] Plan 4 : relevés de stats et tableau de bord
- [x] Plan 5 : parcours d'une fiche (prochaine action, confirmations datées)
- [x] Plan 6 : confiance dans les données (avis de Claude détaillé, tableau de bord à faible volume, export et restauration)
- [x] Plan 7 : hébergement sur Vercel, base et connexion Supabase (évaluation directe et veille éteintes sans clé)
- [x] Plan 8 : analyse par dossier (PDF à joindre dans Claude ou ChatGPT, retour collé dans le studio)

> ⚠️ Dépôt **privé** : ne jamais y commiter de tokens, de mots de passe ni de médias.
