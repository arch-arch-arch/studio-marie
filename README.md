# Studio Contenu

Outil de planification, de génération et de pilotage de contenu Instagram.

## Objectif

Aider la créatrice à savoir **quoi poster** et à **organiser et publier** avec régularité,
au service de trois objectifs : tunnel vers ses plateformes, croissance d'audience
et image de marque.

## Approche retenue : hybride, puis automatique

**Phase 1, hybride (en cours de conception)**

- **Studio Contenu** : page web privée (hébergée sur claude.ai) avec des données partagées.
  - Profil de marque (persona, niche, piliers, ton, limites Instagram)
  - Calendrier jour / semaine / mois, avec les statuts Idée → Brouillon → Validé → Programmé → Publié
  - Fiche contenu : caption, hashtags, recommandations et score sur 100
    (Tunnel · Croissance · Marque · Conformité Instagram)
  - Bulletin tendances hebdomadaire
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
scripts/build.mjs         Assemble dist/studio.html
src/logique/              Règles métier pures (testées)
src/donnees/              Accès à la base du studio
src/interface/            Vues et panneau de fiche
tests/                    Tests Vitest
publisher/                Phase 2 : publication automatique
```

Commandes : `npm test` (tests) et `npm run build` (page à publier).

## Statut

- [x] Choix de l'approche (hybride, puis automatique)
- [x] Architecture d'ensemble validée
- [x] Conception détaillée (données, score, veille, interface)
- [x] Spec écrite et validée
- [x] Plan 1 : fondations et calendrier (studio de test publié)
- [ ] Plan 2 : évaluation par Claude et studio réel
- [ ] Plan 3 : veille hebdo
- [ ] Plan 4 : relevés de stats et tableau de bord

> ⚠️ Dépôt **privé** : ne jamais y commiter de tokens, de mots de passe ni de médias.
