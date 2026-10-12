# Plan 9 : catégories, aperçu et validation libre : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ranger chaque contenu dans une des six catégories de l'entonnoir, les voir en couleur dans le calendrier et dans une nouvelle vue « Aperçu » filtrable par format, valider sans être bloquée, et adapter l'analyse par dossier à la catégorie et au format.

**Architecture:** Une nouvelle logique pure `src/logique/categories.js` (catégories, couleurs, proposition, contrôle par semaine) alimente la fiche, le calendrier, l'aperçu et le dossier. La validation devient libre dans `src/logique/fiche.js` et `src/logique/parcours.js`, avec une liste d'avertissements. Les définitions, cibles et grilles viennent du profil (section `categories_de_contenu`), jamais du code.

**Tech Stack:** JavaScript vanilla (modules ES), DOM via `h()`, Vitest + happy-dom, esbuild. Aucune dépendance nouvelle.

**Spec:** `docs/superpowers/specs/2026-10-12-plan-9-categories-apercu-design.md`

## Global Constraints

- Branche `plan-9-categories-apercu`, créée depuis `main`.
- Aucune donnée réelle, aucun secret, aucune adresse de projet dans le code, les tests ou la documentation ; aucune définition, grille ou cible chiffrée de la créatrice dans le dépôt. N'ouvrir aucun `.env*` autre que `.env.example` ; ne rien lire dans `data/`.
- Interface en français, tutoiement, sans emoji ; apostrophe typographique ’ dans les messages affichés.
- `h()` aplatit et ignore null/false ; `Element.replaceChildren` natif non : seulement des nœuds.
- Clés de catégorie fixes : `attraction`, `autorite`, `connexion`, `desir`, `preuve`, `conversion` ; noms : Attraction, Autorité, Connexion, Désir, Preuve, Conversion ; couleurs par défaut : `#d9622b`, `#4a5be0`, `#0b8574`, `#b3125a`, `#a07800`, `#7a2fb5`.
- La catégorie n'entre pas dans `empreinte(f)`.
- Un profil sans `categories_de_contenu` garde exactement le comportement d'avant le plan 9 (hors validation libre).
- Aucune dépendance nouvelle.

## Review Focus

1. **Profil sans la section, ou section partielle** (catégorie sans cible, grilles d'un seul format) : rien ne casse, rien d'inventé. (Tasks 1, 3, 5.)
2. **Ancienne fiche sans les champs `categorie` / `categorie_proposee`** : elle s'affiche, se range, s'exporte. (Task 1, test « fiche ancienne ».)
3. **Fiche validée puis modifiée, ou analyse avec blocage arrivant sur une fiche validée** : elle reste validée. (Task 2.)
4. **Aperçu sur téléphone avec beaucoup de visuels lourds ou introuvables** : grille sans défilement horizontal, visuels chargés au fil, un visuel introuvable n'empêche pas les autres. (Task 4.)
5. **Catégorie renvoyée par l'assistant avec accents, majuscules ou inconnue** : lue avec tolérance, jamais écrasant un choix. (Task 5.)

---

### Task 1 : logique des catégories et section du profil

**Files:**
- Create: `src/logique/categories.js`
- Modify: `src/logique/profil.js` (`validerProfil`), `src/logique/fiche.js` (`nouvelleFiche`), `exemples/profil-fictif.json`
- Test: `tests/logique/categories.test.js`, `tests/logique/profil.test.js`, `tests/logique/fiche.test.js`

**Interfaces:**
- Produces:
  - `CATEGORIES` : liste ordonnée `[{ cle, nom, couleur }]` des six catégories (valeurs des Global Constraints).
  - `categoriesDuProfil(profil)` → même forme, plus `cible_fil` (entier ou `null`) et `cible_stories` (`{ min, max }` ou `null`), couleur du profil si fournie, sinon par défaut. Toujours les six, dans l'ordre de `CATEGORIES`.
  - `normaliserCategorie(valeur)` → une clé ou `null` (casse, accents, espaces : « Autorité » → `autorite`, « DÉSIR » → `desir`, « inconnue » → `null`).
  - `propositionCategorie(fiche)` → `{ cle, source: 'analyse' | 'regle', raison }` ou `null`. Ordre : `fiche.categorie_proposee` valide (source `analyse`, raison « proposée par l’analyse ») ; sinon `porte` ou `cta` → `conversion` (raison « règle : mène vers l’offre ») ; sinon `ragebait` → `attraction` (raison « règle : ragebait ») ; sinon `null`. Toujours `null` si `fiche.categorie` est une clé valide.
  - `categorieAffichee(fiche)` → `{ cle, etat: 'choisie' | 'proposee', source? }` ou `{ cle: null, etat: 'non_rangee' }`.
  - `controlerCategories(fiches, profil, debutIso)` → liste de pastilles `{ cle, libelle, valeur, etat }` pour la semaine qui commence à `debutIso` (mêmes bornes que `fichesDeLaSemaine`) : une par catégorie qui a une cible, puis `{ cle: 'non_rangees', libelle: 'Non rangées', valeur: 'N', etat: 'orange' }` si N > 0. Seule la catégorie **choisie** compte. Fil = formats `reel`, `carrousel`, `post`. Libellés : « Attraction : 1 sur 3 contenus du fil », « Conversion : 2 stories, objectif 2 à 3 ». États : fil → vert si compte ≥ cible, orange si cible − 1, rouge sinon ; stories → vert entre min et max, orange à un d'écart, rouge au-delà. Une catégorie avec les deux cibles donne deux pastilles.
  - `validerProfil` accepte la section facultative `categories_de_contenu` (forme dans la spec §2.2) et rend une erreur par défaut : clé de catégorie inconnue, doublon de clé, couleur hors `#rrggbb`, `cible_fil` non entier ou négatif, `cible_stories` sans `min`/`max` entiers ou avec `min > max`, clé de `grilles.par_format` hors `reel`/`carrousel`/`story`/`post`, clé de `grilles.par_categorie` inconnue, valeur de grille qui n'est pas une liste de textes. Messages en français, préfixés du chemin (par exemple `categories_de_contenu.categories[2].couleur : …`).
  - `nouvelleFiche` crée `categorie: null` et `categorie_proposee: null`.

- [ ] **Step 1: Write the failing tests** — dans `tests/logique/categories.test.js` :
  - `CATEGORIES` : six entrées, clés, noms et couleurs exacts.
  - `categoriesDuProfil` : profil sans section → six catégories, couleurs par défaut, cibles `null` ; profil avec une catégorie colorée et ciblée → elle seule change.
  - `normaliserCategorie` : `'Autorité'` → `autorite`, `' DÉSIR '` → `desir`, `'conversion'` → `conversion`, `'inconnue'`, `''`, `null`, `3` → `null`.
  - `propositionCategorie` : chaque branche dans l'ordre ; catégorie choisie → `null` ; `categorie_proposee` invalide ignorée.
  - **fiche ancienne** : un objet fiche sans `categorie` ni `categorie_proposee` → `categorieAffichee` donne `non_rangee` sans lever.
  - `controlerCategories` : semaine avec 1 Attraction (Reel), 2 stories Conversion, 1 fiche non rangée, profil avec `attraction.cible_fil = 3` et `conversion.cible_stories = {min:2,max:3}` → pastilles exactes (libellés, valeurs, états) ; fiche proposée mais non choisie non comptée ; fiche hors semaine non comptée ; profil sans section → `[]` (et la pastille « Non rangées » seulement s'il y a une section).
  - dans `tests/logique/profil.test.js` : section absente valide ; section complète valide ; chaque erreur listée ci-dessus avec son message.
  - dans `tests/logique/fiche.test.js` : `nouvelleFiche` a les deux champs à `null` ; `empreinte` inchangée quand seule `categorie` change.
- [ ] **Step 2: Run** `npx vitest run tests/logique` — Expected: FAIL.
- [ ] **Step 3: Implement** `src/logique/categories.js` et les ajouts à `profil.js` et `fiche.js`. `normaliserCategorie` : minuscules, suppression des diacritiques (`normalize('NFD')` puis retrait des marques), espaces retirés, comparaison aux clés.
- [ ] **Step 4: Add to `exemples/profil-fictif.json`** une section `categories_de_contenu` d'exemple, neutre et inventée (principe, test de rangement en 6 lignes génériques, les six catégories avec des cibles d'exemple, une grille courte par format et par catégorie). Aucun texte repris de la stratégie réelle.
- [ ] **Step 5: Run** `npx vitest run tests/logique`, puis `npm test` — Expected: PASS.
- [ ] **Step 6: Commit** — « Catégories : logique, proposition, contrôle et section du profil ».

---

### Task 2 : validation libre

**Files:**
- Modify: `src/logique/fiche.js` (`peutPasserA`, `modifierFiche`, `appliquerEvaluation`), `src/logique/parcours.js` (`prochaineAction`), `src/interface/controleur.js` (`verrouillerSiRouge` et ses appels)
- Test: `tests/logique/fiche.test.js`, `tests/logique/parcours.test.js`, `tests/interface/controleur.test.js`

**Interfaces:**
- Produces:
  - `avertissementsFiche(fiche, regles)` (dans `fiche.js`) → liste de textes, dans cet ordre : « Pas de visuel », « Pas de caption » (sauf story), un texte par cause de `verifierRegles(fiche, regles).conformite.causes` (tel quel), « Pas encore analysée » (pas de `score`), « Analyse dépassée : la fiche a changé depuis » (`aReevaluer`).
  - `peutPasserA(f, cible)` → `{ ok: true }` pour tout statut connu ; `{ ok: false, raison }` seulement pour un statut inconnu.
  - `modifierFiche` et `appliquerEvaluation` ne changent plus jamais le statut.
  - `prochaineAction` pour `idee` et `brouillon` → `{ cle: 'valider', libelle: 'Valider la fiche', detail: avertissements joints par « ; », retard: passee }`. Les autres statuts inchangés. `prochaineAction` reçoit les règles : nouvelle signature `prochaineAction(fiche, releves, maintenant, fuseau, regles)` ; mets à jour ses appelants (`vue-semaine.js`, `vue-jour.js` s'il l'appelle, `carte.js` s'il l'appelle).
  - Le contrôleur n'appelle plus `verrouillerSiRouge` (supprime la fonction).

- [ ] **Step 1: Write the failing tests**
  - `peutPasserA` : fiche sans visuel, sans caption, sans score, avec conformité rouge, avec analyse dépassée → `ok: true` vers `valide`, `programme`, `publie` ; statut `'inconnu'` → `ok: false`.
  - `modifierFiche` sur une fiche `valide` avec score, en changeant l'accroche → reste `valide`, `programme_pour` inchangé.
  - `appliquerEvaluation` avec un score rouge sur une fiche `programme` → reste `programme`.
  - `avertissementsFiche` : fiche vide (story sans visuel → pas d'avertissement caption), fiche complète analysée → `[]`, mot à éviter → la cause exacte, analyse dépassée.
  - `prochaineAction` : brouillon sans visuel → `valider` avec détail « Pas de visuel ; Pas de caption ; Pas encore analysée » ; brouillon complet analysé → `valider` sans détail.
  - contrôleur : une analyse (évaluation ordinaire ou retour de dossier) avec blocage rouge sur une fiche validée la laisse validée.
  - Adapte les tests existants qui attendaient un refus de validation ou un retour en brouillon : ils expriment l'ancienne règle, remplace leurs assertions par la nouvelle et liste-les dans le rapport.
- [ ] **Step 2: Run** `npx vitest run tests/logique tests/interface` — Expected: FAIL.
- [ ] **Step 3: Implement** les changements listés.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — « Validation libre : avertissements au lieu de blocages ».

---

### Task 3 : fiche et calendrier en couleur de catégorie

**Files:**
- Modify: `src/interface/panneau-fiche.js`, `src/interface/carte.js`, `src/interface/vue-semaine.js`, `src/interface/vue-mois.js`, `src/interface/styles.css`, `src/interface/controleur.js` (si une action manque)
- Test: `tests/interface/panneau-fiche.test.js`, `tests/interface/vue-semaine.test.js`, `tests/interface/vue-mois-jour.test.js`

**Interfaces:**
- Consumes: Task 1 (`categoriesDuProfil`, `propositionCategorie`, `categorieAffichee`, `controlerCategories`), Task 2 (`avertissementsFiche`).

- [ ] **Step 1: Write the failing tests**
  - Panneau de fiche : un menu « Catégorie » (`select[name="categorie"]`) avec « Non rangée » puis les six noms ; choisir « Désir » enregistre `categorie: 'desir'` par l'action de modification existante.
  - Proposition : fiche `porte: true` sans catégorie → texte « Proposée : Conversion (règle : mène vers l’offre) » et bouton « Confirmer » qui enregistre `categorie: 'conversion'` ; fiche avec `categorie_proposee` d'analyse → « (proposée par l’analyse) » ; fiche rangée → aucune proposition.
  - Avertissements : une liste « À vérifier avant de publier » avec les textes de `avertissementsFiche`, absente quand elle est vide ; « Passer en Validé » toujours actif.
  - Carte : `style` porte `--categorie` = couleur de la catégorie choisie, ou `var(--trait)` si non rangée ou seulement proposée ; le nom du pilier reste affiché sur la carte (ajoute-le s'il n'y est pas).
  - Vue Mois : chaque point porte la couleur de la catégorie choisie (même règle).
  - Vue Semaine : les pastilles de `controlerCategories` s'ajoutent au contrôle de la semaine, après les pastilles existantes ; une légende « Catégories » avec les six noms et couleurs est affichée sous le contrôle quand le profil a la section ; profil sans section → aucune pastille ni légende nouvelles.
- [ ] **Step 2: Run** `npx vitest run tests/interface` — Expected: FAIL.
- [ ] **Step 3: Implement.** Le bord coloré des cartes utilise `--categorie` à la place de `--pilier` dans `styles.css` ; garde un contraste lisible en thème sombre.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — « Catégories : menu de la fiche, couleurs du calendrier, contrôle de la semaine ».

---

### Task 4 : vue « Aperçu »

**Files:**
- Create: `src/interface/vue-apercu.js`
- Modify: `src/interface/rendu.js` (onglet entre « Mois » et « Jour », `contenuVue`, reconstruction), `src/interface/controleur.js` (`plageDeVue('apercu', …)` = même plage que `'mois'` ; actions `changerPeriodeApercu('semaine' | 'mois')` et `changerFiltresApercu(filtres)`), `src/interface/app.js` (état initial `apercu: { periode: 'semaine', filtres: { story: true, reel: true, post: true } }`), `src/interface/styles.css`
- Test: `tests/interface/vue-apercu.test.js`, `tests/interface/controleur.test.js`

**Interfaces:**
- Consumes: Task 1 (`categoriesDuProfil`, `categorieAffichee`), action existante `urlVisuel(id)`.
- Produces: `vueApercu(etat, actions)` → élément ; `filtrerApercu(fiches, { periode, debut, fin }, filtres)` (pure, exportée) → fiches de la période, filtrées, triées par `datePublication(f)` puis `id`. Le filtre « post » couvre `carrousel` et `post`.

- [ ] **Step 1: Write the failing tests**
  - `filtrerApercu` : ordre par date de publication (une fiche publiée se place à `publie_le`) ; filtres story seul, reel seul, post seul (carrousel + post) ; publiées incluses ; hors période exclues.
  - Vue : choix « Semaine » / « Mois » ; cases « Tout », « Stories », « Reels », « Posts » ; « Tout » coche ou décoche les trois ; aucune case → « Coche au moins un format. » ; période vide → « Rien de prévu sur cette période. ».
  - Miniature : `button.miniature` avec la bordure `--categorie` (neutre si non rangée), la date courte (« lun. 12/10 »), le format, « Publié » pour une fiche publiée ; une image (`img` avec `loading="lazy"`) pour un visuel image, une vidéo (`video` muette, `preload="metadata"`, `playsinline`) avec une marque de lecture pour un visuel vidéo ; sans visuel → case vide avec l'accroche ou « Sans visuel » ; `urlVisuel` qui rejette → « Visuel indisponible » sur cette seule miniature ; toucher une miniature appelle `ouvrirFiche(id)`.
  - Légende des six catégories et compte par catégorie (plus « Non rangées ») pour la sélection affichée.
  - Chargement : au plus 4 demandes `urlVisuel` en cours à la fois (test avec des promesses en attente).
  - Contrôleur : `plageDeVue('apercu', …)` égal à `plageDeVue('mois', …)` ; les deux actions modifient `etat.apercu`.
  - Rendu : l'onglet « Aperçu » existe et ouvre la vue ; les flèches de période fonctionnent dans cette vue.
- [ ] **Step 2: Run** `npx vitest run tests/interface` — Expected: FAIL.
- [ ] **Step 3: Implement.** Grille CSS `repeat(auto-fill, minmax(104px, 1fr))`, miniatures carrées (`aspect-ratio: 1`), `object-fit: cover`, `min-width: 0`, aucun défilement horizontal à 375 px. Bordure de 3 px.
- [ ] **Step 4: Run** `npm test`, puis le build avec `SUPABASE_URL=https://projet.test SUPABASE_ANON_KEY=cle npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** — « Aperçu : miniatures de la période, filtres par format, couleurs de catégorie ».

---

### Task 5 : analyse par catégorie et par format

**Files:**
- Modify: `src/logique/dossier.js`, `src/logique/retour-dossier.js`, `src/interface/controleur.js` (application du retour), `src/interface/panneau-analyse.js` (compte rendu)
- Test: `tests/logique/dossier.test.js`, `tests/logique/retour-dossier.test.js`, `tests/interface/controleur.test.js`, `tests/interface/panneau-analyse.test.js`

**Interfaces:**
- Consumes: Task 1 (`categoriesDuProfil`, `categorieAffichee`, `normaliserCategorie`).
- Produces:
  - `contenuDossier` : la section `categories_de_contenu` du profil apparaît dans `strategie` (rendue comme les autres) ; chaque bloc de fiche porte, après « pilier », une ligne `catégorie : Connexion (choisie)` / `… (proposée)` / `catégorie : non rangée` ; nouveau champ `rangement` (liste de lignes) : en-tête « Rangement actuel, à vérifier. Ces lignes ne sont pas des états de cadence. », puis une ligne par catégorie (`Attraction : F01, F03 · cible : 3 contenus du fil` ; « aucune » s'il n'y en a pas ; cible omise si absente), puis `Non rangées : F02` ; la consigne gagne, quand le profil a des `grilles` : la demande de ranger chaque fiche avec le test de rangement, de justifier un changement en une phrase ou d'écrire « non déterminable », de juger avec la grille du format et celle de la catégorie (les grilles du profil y sont recopiées, format par format puis catégorie par catégorie), de commencer chaque fiche par « Catégorie : … · Format : … » et de finir par le rangement comparé aux cibles ; dans tous les cas, le bloc JSON d'exemple gagne `"categorie": "connexion"` et la contrainte « "categorie" parmi attraction, autorite, connexion, desir, preuve, conversion, ou null ».
  - `assemblerPdf` (dans `src/dossier/pdf.js`) affiche `contenu.rangement` après les règles de la période, sous le titre « Rangement par catégorie » ; vide → rien.
  - `validerRetour` : chaque fiche valide porte `categorie` (clé normalisée) ou `null` ; une valeur non vide inconnue ajoute la remarque « catégorie inconnue ignorée : <valeur> ».
  - Application : si la fiche n'a pas de catégorie choisie, `categorie_proposee = { cle, source: 'analyse' }` est écrit avec le reste ; une catégorie choisie n'est jamais modifiée ; `null` ne change rien. Le résultat de `enregistrerRetour` gagne `categoriesProposees: [{ ref, cle }]`, et le panneau affiche « Catégories proposées : F01 Connexion, F02 Attraction ».
- [ ] **Step 1: Write the failing tests** — pour chaque point ci-dessus, avec le profil fictif (section d'exemple de la Task 1) et un profil sans section (aucune ligne de rangement par catégorie hors « Non rangées », consigne sans grilles, mais champ `categorie` dans l'exemple JSON) ; `normaliserCategorie` appliquée (« Autorité ») ; choix jamais écrasé ; texte de la consigne qui recopie une grille du profil d'exemple.
- [ ] **Step 2: Run** `npx vitest run tests/logique tests/interface tests/dossier` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` et le build — Expected: PASS.
- [ ] **Step 5: Commit** — « Analyse par dossier : catégories, rangement et grilles du profil ».

---

### Task 6 : profil réel, mise en ligne et essai

Fait par le contrôleur avec Jean.

- [ ] **Step 1:** Rédiger, hors du dépôt (dans `data/`), la section `categories_de_contenu` de la créatrice à partir du document qu'elle a retravaillé ; la faire valider par Jean.
- [ ] **Step 2:** Avec l'accord de Jean, l'ajouter au profil courant et l'importer comme nouvelle version (onglet Profil, ou écriture en base).
- [ ] **Step 3:** Relecture finale de la branche, fusion dans `main` (production déployée par le push), vérification de l'adresse de production.
- [ ] **Step 4:** Essai par Jean ou la créatrice : ranger trois fiches, voir les couleurs, l'aperçu filtré, valider une fiche sans analyse, lancer une analyse et vérifier les catégories proposées.
- [ ] **Step 5:** Mettre à jour la notice (doc « Studio Contenu : mode d'emploi »), le README et la passation.
