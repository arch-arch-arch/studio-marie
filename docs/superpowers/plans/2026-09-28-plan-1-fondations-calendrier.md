# Plan 1 : fondations et calendrier : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer un studio de test publié sur claude.ai qui permet de planifier des contenus. Il comprend :
- les vues Semaine, Mois et Jour ;
- le contrôle de semaine ;
- les créneaux libres ;
- le glisser-déposer ;
- la fiche en panneau latéral, avec le visuel, les textes, le statut et le bouton « Copier » ;
- l'import du profil.

**Architecture:**
- Une seule page HTML est publiée comme Artifact. Elle utilise les capacités `db` (données) et `assets` (visuels).
- La logique métier est en JavaScript pur dans `src/logique/` et testée avec Vitest.
- L'accès à la base passe par un dépôt (`src/donnees/`) qui sérialise les écritures fiche par fiche.
- L'interface est en DOM natif, sans framework (`src/interface/`). esbuild assemble le tout dans `dist/studio.html`.

**Tech Stack:** Node 24, JavaScript (modules ES), Vitest, happy-dom (tests d'interface), esbuild.

**Spec:** `docs/superpowers/specs/2026-09-27-studio-contenu-design.md`

**Découpage en plans :**
- Ce plan est le 1 sur 4.
- Suivront : le plan 2 (évaluation par Claude via `sample`, règles calculées, verrou de conformité, jeu de référence, publication du studio réel), le plan 3 (veille hebdo : consignes, routine cloud, vue Bulletin) et le plan 4 (relevés de stats et tableau de bord).
- À la fin du plan 1, seul le **studio de test** (profil fictif) est publié.

## Global Constraints

- Dépôt privé et anonymisé : **aucune donnée réelle de la créatrice** dans git (nom, pseudo, e-mail, plateformes, statistiques, contenus, visuels, URL des studios). Les exemples et fixtures sont fictifs.
- `.gitignore` bloque `*profil_marque*.json`, `data/`, `media/`, `dist/`, `.studio.local.json` et les secrets.
- Toute l'interface est en français. On tutoie la personne qui utilise le studio. Pas d'emoji comme marqueurs.
- Les dates sont stockées en UTC (chaînes `toISOString()`, par exemple `2026-09-28T10:00:00.000Z`) et affichées dans le fuseau `regles_studio.fuseau` du profil.
- Les statuts, dans l'ordre : `idee` → `brouillon` → `valide` → `programme` → `publie` (libellés : Idée, Brouillon, Validé, Programmé, Publié).
- Les formats : `reel`, `carrousel`, `story`, `post`.
- Les valeurs cibles (cadence, part d'appels à l'action, rôles, ragebait, stories vers la porte, créneaux) sont lues dans `profil.regles_studio`. **Aucune n'est codée en dur.**
- Une page d'Artifact : pas de `<html>`, `<head>` ni `<body>` dans le fichier publié. Il commence par `<title>`. Polices chargées uniquement depuis Google Fonts. Tout le JavaScript est inclus dans la page.
- Chaque commit se termine par la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Écarts assumés par rapport à la spec

Ils sont reportés dans la spec à la Task 2.

- **Bloc `regles_studio` dans le profil.** Le profil contient un bloc `regles_studio`, lisible par la machine (fuseau, piliers avec couleur, cadence, seuils, créneaux, mots à éviter, hashtags, longueur maximale de l'accroche). Le profil réel devra recevoir ce bloc avant d'être importé : c'est un travail fait hors dépôt, au plan 2.
- **Nouveaux champs d'une fiche :**
  - `porte` : une story qui mène à la porte, nécessaire au contrôle de semaine ;
  - `visuel_type` : `image` ou `video`.
- **Anciennes versions du profil.** Le profil courant est le document `profil/courant`, et les versions précédentes sont archivées dans `profil_archives/v<n>`.
- **Validation d'une fiche.** Passer en `valide`, `programme` ou `publie` exige :
  - un visuel ;
  - une caption, sauf pour une story ;
  - un score ;
  - une conformité qui n'est pas au rouge ;
  - un score qui n'est pas « à réévaluer ».

  Tant que le plan 2 n'est pas livré, aucune fiche ne peut donc être validée. C'est voulu : aucun contenu ne doit passer en « Validé » sans score.

## Review Focus

1. **Import d'un profil sans `regles_studio`, ou mal formé.** L'import est refusé avec la liste des erreurs, et le profil en place reste intact : aucune écriture en base. *(Task 7)*
2. **Semaine du changement d'heure** (fin octobre, Europe/Paris) :
   - les 7 jours sont justes ;
   - une story du dimanche à 23 h 30 compte dans la bonne semaine ;
   - l'heure locale est conservée quand on déplace une carte. *(Tasks 3, 4 et 5)*
3. **Saisie rapide suivie d'un glisser-déposer ou d'un changement de statut avant la fin de l'enregistrement :**
   - une seule écriture à la fois par fiche ;
   - aucune écriture ne remplace une version plus récente par une plus ancienne ;
   - un instantané de la base qui arrive entre-temps n'efface pas la saisie locale. *(Tasks 7 et 8)*
4. **Base ou stockage indisponible dans la vue** (`claude.use` renvoie `null`) : un message clair plutôt qu'une page blanche, et la zone du visuel remplacée par une explication. *(Tasks 8 et 10)*
5. **Fermer le panneau ou changer de période juste après avoir tapé** : la dernière saisie est enregistrée. *(Task 8)*

---

## Structure des fichiers

```
package.json, package-lock.json, vitest.config.js
scripts/build.mjs                 assemble dist/studio.html (esbuild + gabarit)
exemples/profil-fictif.json       profil fictif avec regles_studio
src/logique/profil.js             validerProfil, fuseauValide
src/logique/dates.js              fuseaux, semaines, mois, clés de jour
src/logique/fiche.js              modèle de fiche, empreinte, statuts, déplacement, hashtags
src/logique/controle.js           fichesDeLaSemaine, controlerSemaine
src/logique/creneaux.js           creneauxLibres
src/donnees/depot.js              accès à la base (fiches, profil)
src/donnees/enregistreur.js       écritures regroupées et sérialisées par fiche
src/interface/h.js                fabrique d'éléments DOM
src/interface/etat.js             état observable
src/interface/controleur.js       actions de l'utilisateur, plageDeVue, fusionnerInstantane
src/interface/carte.js            carte d'un contenu, badge de score
src/interface/vue-semaine.js      bandeau + 7 colonnes
src/interface/vue-mois.js
src/interface/vue-jour.js
src/interface/vue-profil.js
src/interface/panneau-fiche.js
src/interface/rendu.js            barre, zones, choix de la vue
src/interface/app.js              demarrer(racine, claude)
src/interface/main.js             point d'entrée du build
src/interface/page.html           gabarit de la page
src/interface/styles.css
tests/...                         miroir de src/, plus tests/aides/fausseBase.js
```

---

### Task 1 : outillage, build et page minimale

**Files:**
- Create : `package.json`, `vitest.config.js`, `scripts/build.mjs`, `src/interface/page.html`, `src/interface/styles.css`, `src/interface/main.js`, `tests/build.test.js`
- Modify : `.gitignore`, `README.md`

**Interfaces:**
- Produces : `construire(): Promise<string>`, exporté par `scripts/build.mjs`. `npm test` lance Vitest et `npm run build` écrit `dist/studio.html`.

- [ ] **Step 1 : créer `package.json` et installer les dépendances**

```json
{
  "name": "studio-contenu",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "build": "node scripts/build.mjs"
  }
}
```

Run : `npm install -D vitest happy-dom esbuild`
Expected : `package-lock.json` créé, sans erreur.

- [ ] **Step 2 : créer `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.js'] },
});
```

- [ ] **Step 3 : compléter `.gitignore`**

Ajouter à la fin :

```
# Build et adresses locales des studios
dist/
.studio.local.json
```

- [ ] **Step 4 : écrire le test du build**

`tests/build.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { construire } from '../scripts/build.mjs';

describe('construire', () => {
  it('produit une page unique, sans squelette html, avec styles et script inclus', async () => {
    const html = await construire();
    expect(html.startsWith('<title>Studio Contenu</title>')).toBe(true);
    expect(html).not.toMatch(/<html|<body|<!doctype/i);
    expect(html).toContain('<div id="app"></div>');
    expect(html).not.toContain('/*SCRIPT*/');
    expect(html).not.toContain('/*STYLES*/');
    expect(html).toContain('--fond');
  });
});
```

- [ ] **Step 5 : lancer le test pour vérifier qu'il échoue**

Run : `npx vitest run tests/build.test.js`
Expected : FAIL (`Cannot find module '../scripts/build.mjs'`).

- [ ] **Step 6 : écrire le gabarit, les styles de base, le point d'entrée et le build**

`src/interface/page.html` :

```html
<title>Studio Contenu</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>/*STYLES*/</style>
<div id="app"></div>
<script>/*SCRIPT*/</script>
```

`src/interface/styles.css` (les tokens et la base ; les composants arrivent à la Task 8) :

```css
:root {
  --fond: #f7f5f8; --surface: #ffffff; --surface-2: #efebf1;
  --texte: #1c1720; --texte-2: #5f5766; --trait: #ddd6e1;
  --accent: #b3125a; --accent-texte: #ffffff;
  --vert: #1f7a4d; --orange: #9a5b00; --rouge: #c0262d;
  --reel: #b3125a; --carrousel: #4a5be0; --story: #0b8574; --post: #7a7180;
  --rayon: 8px;
  --police: 'Figtree', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --mono: 'IBM Plex Mono', ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --fond: #141116; --surface: #1d1920; --surface-2: #26212a;
    --texte: #f1ecf3; --texte-2: #a89fae; --trait: #353039;
    --accent: #ff5c9d; --accent-texte: #1a0c12;
    --vert: #52c98a; --orange: #f0a53a; --rouge: #ff6b6b;
    --reel: #ff5c9d; --carrousel: #8f9bff; --story: #3fd1bb; --post: #a89fae;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --fond: #141116; --surface: #1d1920; --surface-2: #26212a;
  --texte: #f1ecf3; --texte-2: #a89fae; --trait: #353039;
  --accent: #ff5c9d; --accent-texte: #1a0c12;
  --vert: #52c98a; --orange: #f0a53a; --rouge: #ff6b6b;
  --reel: #ff5c9d; --carrousel: #8f9bff; --story: #3fd1bb; --post: #a89fae;
  color-scheme: dark;
}
body { background: var(--fond); color: var(--texte); font: 15px/1.45 var(--police); }
#app { padding-inline: 16px; padding-block: 12px 32px; max-width: 1440px; margin: 0 auto; }
button, input, select, textarea { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
```

`src/interface/main.js` (provisoire, remplacé à la Task 8) :

```js
document.getElementById('app').textContent = 'Studio Contenu';
```

`scripts/build.mjs` :

```js
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function construire() {
  const resultat = await build({
    entryPoints: [path.join(racine, 'src/interface/main.js')],
    bundle: true,
    format: 'iife',
    write: false,
    minify: true,
    target: 'es2020',
  });
  const script = resultat.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const gabarit = await readFile(path.join(racine, 'src/interface/page.html'), 'utf8');
  const styles = await readFile(path.join(racine, 'src/interface/styles.css'), 'utf8');
  return gabarit.replace('/*STYLES*/', () => styles).replace('/*SCRIPT*/', () => script);
}

const lanceDirectement = process.argv[1]
  && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (lanceDirectement) {
  const html = await construire();
  await mkdir(path.join(racine, 'dist'), { recursive: true });
  await writeFile(path.join(racine, 'dist/studio.html'), html);
  console.log(`dist/studio.html (${Math.round(html.length / 1024)} Ko)`);
}
```

- [ ] **Step 7 : lancer le test et le build**

Run : `npx vitest run tests/build.test.js`
Expected : PASS.
Run : `npm run build`
Expected : `dist/studio.html (… Ko)`.

- [ ] **Step 8 : mettre à jour la section Structure du README**

Dans `README.md`, remplacer le bloc de code de la section « Structure » par :

````markdown
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
````

- [ ] **Step 9 : commit**

```bash
git add package.json package-lock.json vitest.config.js scripts src tests .gitignore README.md
git commit -m "Outillage : Vitest, build esbuild et page minimale

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2 : profil fictif et validation du profil

**Files:**
- Create : `exemples/profil-fictif.json`, `src/logique/profil.js`, `tests/logique/profil.test.js`
- Modify : `docs/superpowers/specs/2026-09-27-studio-contenu-design.md` (§4)

**Interfaces:**
- Produces :
  - `validerProfil(profil: object): { ok: boolean, erreurs: string[] }` ;
  - `fuseauValide(fuseau: string): boolean` ;
  - la forme de `regles_studio`, utilisée par toutes les tâches suivantes :

```
regles_studio: {
  fuseau: string,                                   // ex. "Europe/Paris"
  piliers: [{ cle: string, nom: string, couleur: "#rrggbb" }],
  cadence: { reel: int, carrousel: int, story_par_jour: int },
  cta_ratio_max: number (0..1),
  roles_caption: { engagement: int, cta: int, deadpan: int },
  ragebait_max: int,
  stories_porte: { min: int, max: int },
  creneaux: [{ jours: int[] (1 = lundi … 7 = dimanche), debut: "HH:MM", fin: "HH:MM" }],
  mots_a_eviter: string[],
  hashtags: { min: int, max: int },
  accroche_mots_max: int
}
```

- [ ] **Step 1 : créer le profil fictif**

`exemples/profil-fictif.json` :

```json
{
  "meta": { "document": "profil_marque_instagram", "fictif": true },
  "identite_de_marque": {
    "positionnement": "Créatrice fictive : chroniques nocturnes, humour sec, regard de sociologue amatrice.",
    "piliers": ["socio", "nuit", "humour_sec", "pont_offre"]
  },
  "ton_et_voix": {
    "registre": "sec, ironique, jamais moralisateur",
    "test": "Si un coach pourrait le dire, réécrire."
  },
  "regles_studio": {
    "fuseau": "Europe/Paris",
    "piliers": [
      { "cle": "socio", "nom": "Socio", "couleur": "#4a5be0" },
      { "cle": "nuit", "nom": "Nuit", "couleur": "#0b8574" },
      { "cle": "humour_sec", "nom": "Humour sec", "couleur": "#b07d00" },
      { "cle": "pont_offre", "nom": "Pont vers l'offre", "couleur": "#b3125a" }
    ],
    "cadence": { "reel": 4, "carrousel": 2, "story_par_jour": 1 },
    "cta_ratio_max": 0.25,
    "roles_caption": { "engagement": 2, "cta": 1, "deadpan": 1 },
    "ragebait_max": 1,
    "stories_porte": { "min": 2, "max": 3 },
    "creneaux": [{ "jours": [1, 2, 4], "debut": "12:00", "fin": "15:00" }],
    "mots_a_eviter": ["mindset", "link in bio", "bienveillance"],
    "hashtags": { "min": 3, "max": 5 },
    "accroche_mots_max": 15
  }
}
```

- [ ] **Step 2 : écrire les tests**

`tests/logique/profil.test.js` :

```js
import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { validerProfil, fuseauValide } from '../../src/logique/profil.js';

const avec = modif => { const p = structuredClone(fictif); modif(p.regles_studio, p); return p; };

describe('fuseauValide', () => {
  it('accepte un fuseau IANA et refuse le reste', () => {
    expect(fuseauValide('Europe/Paris')).toBe(true);
    expect(fuseauValide('Mars/Olympus')).toBe(false);
    expect(fuseauValide('')).toBe(false);
    expect(fuseauValide(undefined)).toBe(false);
  });
});

describe('validerProfil', () => {
  it('accepte le profil fictif', () => {
    expect(validerProfil(fictif)).toEqual({ ok: true, erreurs: [] });
  });

  it('refuse ce qui n’est pas un objet', () => {
    for (const v of [null, [], 'texte', 3]) {
      expect(validerProfil(v)).toEqual({ ok: false, erreurs: ['Le fichier doit contenir un objet JSON.'] });
    }
  });

  it('explique qu’il manque regles_studio', () => {
    const p = structuredClone(fictif); delete p.regles_studio;
    const r = validerProfil(p);
    expect(r.ok).toBe(false);
    expect(r.erreurs[0]).toContain('regles_studio');
  });

  it('signale un fuseau inconnu', () => {
    const r = validerProfil(avec(rs => { rs.fuseau = 'Mars/Olympus'; }));
    expect(r.erreurs).toContain('regles_studio.fuseau : fuseau horaire inconnu (ex. « Europe/Paris »).');
  });

  it('signale une couleur de pilier invalide', () => {
    const r = validerProfil(avec(rs => { rs.piliers[1].couleur = 'rouge'; }));
    expect(r.erreurs).toContain('regles_studio.piliers[1].couleur doit être au format #rrggbb.');
  });

  it('signale un créneau incohérent', () => {
    const r = validerProfil(avec(rs => { rs.creneaux = [{ jours: [0], debut: '15:00', fin: '12:00' }]; }));
    expect(r.erreurs).toContain('regles_studio.creneaux[0].jours : liste de jours de 1 (lundi) à 7 (dimanche).');
    expect(r.erreurs).toContain('regles_studio.creneaux[0] : debut et fin au format HH:MM, avec debut < fin.');
  });

  it('signale stories_porte avec min > max', () => {
    const r = validerProfil(avec(rs => { rs.stories_porte = { min: 4, max: 2 }; }));
    expect(r.erreurs).toContain('regles_studio.stories_porte : min et max entiers, avec min ≤ max.');
  });

  it('remonte toutes les erreurs d’un coup', () => {
    const r = validerProfil(avec(rs => { rs.cadence.reel = -1; rs.cta_ratio_max = 2; rs.accroche_mots_max = 0; }));
    expect(r.ok).toBe(false);
    expect(r.erreurs).toHaveLength(3);
  });
});
```

- [ ] **Step 3 : lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run tests/logique/profil.test.js`
Expected : FAIL (module introuvable).

- [ ] **Step 4 : implémenter**

`src/logique/profil.js` :

```js
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
const COULEUR = /^#[0-9a-fA-F]{6}$/;
const entier = (v, min = 0) => Number.isInteger(v) && v >= min;

export function fuseauValide(fuseau) {
  if (typeof fuseau !== 'string' || !fuseau) return false;
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: fuseau });
    return true;
  } catch {
    return false;
  }
}

export function validerProfil(profil) {
  if (!profil || typeof profil !== 'object' || Array.isArray(profil)) {
    return { ok: false, erreurs: ['Le fichier doit contenir un objet JSON.'] };
  }
  const r = profil.regles_studio;
  if (!r || typeof r !== 'object') {
    return { ok: false, erreurs: ['Il manque le bloc « regles_studio » (voir exemples/profil-fictif.json).'] };
  }
  const erreurs = [];
  if (!fuseauValide(r.fuseau)) erreurs.push('regles_studio.fuseau : fuseau horaire inconnu (ex. « Europe/Paris »).');

  if (!Array.isArray(r.piliers) || r.piliers.length === 0) {
    erreurs.push('regles_studio.piliers : au moins un pilier est requis.');
  } else {
    r.piliers.forEach((p, i) => {
      if (!p || typeof p.cle !== 'string' || !p.cle) erreurs.push(`regles_studio.piliers[${i}].cle manquante.`);
      if (!p || typeof p.nom !== 'string' || !p.nom) erreurs.push(`regles_studio.piliers[${i}].nom manquant.`);
      if (!p || !COULEUR.test(p.couleur ?? '')) erreurs.push(`regles_studio.piliers[${i}].couleur doit être au format #rrggbb.`);
    });
  }

  const c = r.cadence ?? {};
  for (const k of ['reel', 'carrousel', 'story_par_jour']) {
    if (!entier(c[k])) erreurs.push(`regles_studio.cadence.${k} doit être un entier positif ou nul.`);
  }
  if (typeof r.cta_ratio_max !== 'number' || r.cta_ratio_max < 0 || r.cta_ratio_max > 1) {
    erreurs.push('regles_studio.cta_ratio_max doit être compris entre 0 et 1.');
  }
  const rc = r.roles_caption ?? {};
  for (const k of ['engagement', 'cta', 'deadpan']) {
    if (!entier(rc[k])) erreurs.push(`regles_studio.roles_caption.${k} doit être un entier positif ou nul.`);
  }
  if (!entier(r.ragebait_max)) erreurs.push('regles_studio.ragebait_max doit être un entier positif ou nul.');

  const sp = r.stories_porte ?? {};
  if (!entier(sp.min) || !entier(sp.max) || sp.min > sp.max) {
    erreurs.push('regles_studio.stories_porte : min et max entiers, avec min ≤ max.');
  }

  if (!Array.isArray(r.creneaux)) {
    erreurs.push('regles_studio.creneaux doit être une liste.');
  } else {
    r.creneaux.forEach((cr, i) => {
      if (!Array.isArray(cr?.jours) || cr.jours.length === 0 || !cr.jours.every(j => Number.isInteger(j) && j >= 1 && j <= 7)) {
        erreurs.push(`regles_studio.creneaux[${i}].jours : liste de jours de 1 (lundi) à 7 (dimanche).`);
      }
      if (!HEURE.test(cr?.debut ?? '') || !HEURE.test(cr?.fin ?? '') || cr.debut >= cr.fin) {
        erreurs.push(`regles_studio.creneaux[${i}] : debut et fin au format HH:MM, avec debut < fin.`);
      }
    });
  }

  if (!Array.isArray(r.mots_a_eviter) || !r.mots_a_eviter.every(m => typeof m === 'string')) {
    erreurs.push('regles_studio.mots_a_eviter doit être une liste de textes.');
  }
  const hs = r.hashtags ?? {};
  if (!entier(hs.min) || !entier(hs.max) || hs.min > hs.max) {
    erreurs.push('regles_studio.hashtags : min et max entiers, avec min ≤ max.');
  }
  if (!entier(r.accroche_mots_max, 1)) erreurs.push('regles_studio.accroche_mots_max doit être un entier supérieur à 0.');

  return { ok: erreurs.length === 0, erreurs };
}
```

- [ ] **Step 5 : lancer les tests**

Run : `npx vitest run tests/logique/profil.test.js`
Expected : PASS.

- [ ] **Step 6 : reporter les écarts dans la spec**

Dans `docs/superpowers/specs/2026-09-27-studio-contenu-design.md`, §4 :
- dans le tableau, ligne `profil`, remplacer le texte par : « Document `profil/courant` : le profil de marque importé (JSON, avec un bloc `regles_studio` lisible par la machine, voir `exemples/profil-fictif.json`) et son numéro de `version`. Les versions précédentes sont archivées dans `profil_archives/v<n>`. Chaque score garde la version utilisée. » ;
- dans « Champs d'une fiche », ligne **type de contenu**, ajouter `porte` (booléen, story qui mène à la porte) ;
- ligne **contenu**, ajouter `visuel_type` (`image` ou `video`).

- [ ] **Step 7 : commit**

```bash
git add exemples src/logique/profil.js tests/logique/profil.test.js docs/superpowers/specs
git commit -m "Profil fictif et validation du bloc regles_studio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3 : dates et fuseaux

**Files:**
- Create : `src/logique/dates.js`, `tests/logique/dates.test.js`

**Interfaces:**
- Produces (toutes les dates en entrée et en sortie sont des chaînes ISO UTC, sauf mention contraire) :
  - `partiesLocales(iso, fuseau): { annee, mois, jour, heure, minute, jourSemaine /* 1 = lundi */ }`
  - `versUtc({ annee, mois, jour, heure = 0, minute = 0 }, fuseau): string`
  - `ajouterJours(iso, n, fuseau): string` : garde l'heure locale.
  - `debutJour(iso, fuseau): string`, `debutSemaine(iso, fuseau): string` (lundi, 00 h 00 locale)
  - `joursDeLaSemaine(debutIso, fuseau): string[7]`
  - `debutMois(iso, fuseau)`, `ajouterMois(iso, n, fuseau)`, `semainesDuMois(iso, fuseau): string[]` : les lundis qui couvrent le mois.
  - `cleJour(iso, fuseau): 'YYYY-MM-DD'`, `heureLocale(iso, fuseau): 'HH:MM'`
  - `depuisSaisieLocale('YYYY-MM-DD', 'HH:MM', fuseau): string`
  - `libelleJour(iso, fuseau): string` (par exemple « lun. 28 »)

- [ ] **Step 1 : écrire les tests**

`tests/logique/dates.test.js` :

```js
import { describe, it, expect } from 'vitest';
import {
  partiesLocales, versUtc, ajouterJours, debutJour, debutSemaine, joursDeLaSemaine,
  debutMois, ajouterMois, semainesDuMois, cleJour, heureLocale, depuisSaisieLocale, libelleJour,
} from '../../src/logique/dates.js';

const FZ = 'Europe/Paris';

describe('conversions', () => {
  it('lit les parties locales (heure d’été)', () => {
    expect(partiesLocales('2026-09-28T10:00:00.000Z', FZ)).toEqual({ annee: 2026, mois: 9, jour: 28, heure: 12, minute: 0, jourSemaine: 1 });
  });
  it('convertit une heure locale en UTC, été comme hiver', () => {
    expect(versUtc({ annee: 2026, mois: 9, jour: 28, heure: 12 }, FZ)).toBe('2026-09-28T10:00:00.000Z');
    expect(versUtc({ annee: 2026, mois: 12, jour: 1, heure: 12 }, FZ)).toBe('2026-12-01T11:00:00.000Z');
  });
  it('fait l’aller-retour saisie locale ↔ UTC', () => {
    const iso = depuisSaisieLocale('2026-10-01', '13:45', FZ);
    expect(iso).toBe('2026-10-01T11:45:00.000Z');
    expect(cleJour(iso, FZ)).toBe('2026-10-01');
    expect(heureLocale(iso, FZ)).toBe('13:45');
  });
  it('rattache 23 h 30 locale au bon jour', () => {
    expect(cleJour('2026-10-25T22:30:00.000Z', FZ)).toBe('2026-10-25');
  });
});

describe('semaines et jours', () => {
  it('trouve le lundi 00 h 00 local', () => {
    expect(debutSemaine('2026-10-01T15:00:00.000Z', FZ)).toBe('2026-09-27T22:00:00.000Z');
    expect(debutJour('2026-10-01T15:00:00.000Z', FZ)).toBe('2026-09-30T22:00:00.000Z');
  });
  it('garde l’heure locale en traversant le changement d’heure', () => {
    expect(ajouterJours('2026-10-24T10:00:00.000Z', 1, FZ)).toBe('2026-10-25T11:00:00.000Z');
  });
  it('liste 7 jours justes pendant la semaine du changement d’heure', () => {
    const debut = debutSemaine('2026-10-21T10:00:00.000Z', FZ);
    expect(debut).toBe('2026-10-18T22:00:00.000Z');
    const jours = joursDeLaSemaine(debut, FZ);
    expect(jours).toHaveLength(7);
    expect(jours.map(j => cleJour(j, FZ))).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    expect(ajouterJours(debut, 7, FZ)).toBe('2026-10-25T23:00:00.000Z');
  });
  it('libelle un jour en français', () => {
    expect(libelleJour('2026-09-28T10:00:00.000Z', FZ)).toMatch(/^lun\.? 28$/);
  });
});

describe('mois', () => {
  it('calcule le début du mois et le mois suivant', () => {
    expect(debutMois('2026-10-15T10:00:00.000Z', FZ)).toBe('2026-09-30T22:00:00.000Z');
    expect(ajouterMois('2026-10-15T10:00:00.000Z', 1, FZ)).toBe('2026-10-31T23:00:00.000Z');
    expect(ajouterMois('2026-12-15T10:00:00.000Z', 1, FZ)).toBe('2026-12-31T23:00:00.000Z');
  });
  it('liste les lundis qui couvrent octobre 2026', () => {
    const s = semainesDuMois('2026-10-15T10:00:00.000Z', FZ);
    expect(s).toHaveLength(5);
    expect(s[0]).toBe('2026-09-27T22:00:00.000Z');
    expect(s[4]).toBe('2026-10-25T23:00:00.000Z');
  });
});
```

- [ ] **Step 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run tests/logique/dates.test.js`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : implémenter**

`src/logique/dates.js` :

```js
const deux = n => String(n).padStart(2, '0');
const JOURS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const formateurs = new Map();

function formateur(fuseau) {
  if (!formateurs.has(fuseau)) {
    formateurs.set(fuseau, new Intl.DateTimeFormat('en-US', {
      timeZone: fuseau, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short',
    }));
  }
  return formateurs.get(fuseau);
}

export function partiesLocales(iso, fuseau) {
  const p = Object.fromEntries(formateur(fuseau).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return { annee: +p.year, mois: +p.month, jour: +p.day, heure: +p.hour % 24, minute: +p.minute, jourSemaine: JOURS[p.weekday] };
}

export function versUtc({ annee, mois, jour, heure = 0, minute = 0 }, fuseau) {
  const voulu = Date.UTC(annee, mois - 1, jour, heure, minute);
  let t = voulu;
  for (let i = 0; i < 3; i++) {
    const p = partiesLocales(new Date(t).toISOString(), fuseau);
    const obtenu = Date.UTC(p.annee, p.mois - 1, p.jour, p.heure, p.minute);
    if (obtenu === voulu) break;
    t += voulu - obtenu;
  }
  return new Date(t).toISOString();
}

const dateUtc = (a, m, j) => new Date(Date.UTC(a, m - 1, j));

function decaler(iso, jours, fuseau, garderHeure) {
  const p = partiesLocales(iso, fuseau);
  const d = dateUtc(p.annee, p.mois, p.jour + jours);
  return versUtc({
    annee: d.getUTCFullYear(), mois: d.getUTCMonth() + 1, jour: d.getUTCDate(),
    heure: garderHeure ? p.heure : 0, minute: garderHeure ? p.minute : 0,
  }, fuseau);
}

export const ajouterJours = (iso, n, fuseau) => decaler(iso, n, fuseau, true);
export const debutJour = (iso, fuseau) => decaler(iso, 0, fuseau, false);
export const debutSemaine = (iso, fuseau) => decaler(iso, 1 - partiesLocales(iso, fuseau).jourSemaine, fuseau, false);
export const joursDeLaSemaine = (debutIso, fuseau) => Array.from({ length: 7 }, (_, i) => ajouterJours(debutIso, i, fuseau));

export function debutMois(iso, fuseau) {
  const p = partiesLocales(iso, fuseau);
  return versUtc({ annee: p.annee, mois: p.mois, jour: 1 }, fuseau);
}

export function ajouterMois(iso, n, fuseau) {
  const p = partiesLocales(iso, fuseau);
  const d = dateUtc(p.annee, p.mois + n, 1);
  return versUtc({ annee: d.getUTCFullYear(), mois: d.getUTCMonth() + 1, jour: 1 }, fuseau);
}

export function semainesDuMois(iso, fuseau) {
  const debut = debutMois(iso, fuseau);
  const fin = ajouterMois(debut, 1, fuseau);
  const semaines = [];
  for (let s = debutSemaine(debut, fuseau); s < fin; s = ajouterJours(s, 7, fuseau)) semaines.push(s);
  return semaines;
}

export function cleJour(iso, fuseau) {
  const p = partiesLocales(iso, fuseau);
  return `${p.annee}-${deux(p.mois)}-${deux(p.jour)}`;
}

export function heureLocale(iso, fuseau) {
  const p = partiesLocales(iso, fuseau);
  return `${deux(p.heure)}:${deux(p.minute)}`;
}

export function depuisSaisieLocale(date, heure, fuseau) {
  const [annee, mois, jour] = date.split('-').map(Number);
  const [h, m] = heure.split(':').map(Number);
  return versUtc({ annee, mois, jour, heure: h, minute: m }, fuseau);
}

export function libelleJour(iso, fuseau) {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: fuseau, weekday: 'short', day: 'numeric' }).format(new Date(iso));
}
```

- [ ] **Step 4 : lancer les tests**

Run : `npx vitest run tests/logique/dates.test.js`
Expected : PASS.

- [ ] **Step 5 : commit**

```bash
git add src/logique/dates.js tests/logique/dates.test.js
git commit -m "Dates et fuseaux : semaines, mois, changement d'heure

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4 : modèle de fiche

**Files:**
- Create : `src/logique/fiche.js`, `tests/logique/fiche.test.js`

**Interfaces:**
- Consumes : `partiesLocales`, `versUtc` (Task 3).
- Produces :
  - constantes `FORMATS`, `LIBELLES_FORMAT`, `STATUTS`, `LIBELLES_STATUT` ;
  - `nouvelId(): string` ;
  - `nouvelleFiche({ id, format, date_heure, pilier = '', maintenant, origine = { type: 'manuelle' } }): Fiche` ;
  - `empreinte(fiche): string` (8 caractères hexadécimaux, calculée sur l'accroche, la caption, le visuel et les hashtags) ;
  - `aReevaluer(fiche): boolean` ;
  - `modifierFiche(fiche, changements, maintenant): Fiche` (passe `modifiee_depuis_creation` à `true`) ;
  - `peutPasserA(fiche, cible): { ok: true } | { ok: false, raison: string }` ;
  - `changerStatut(fiche, cible, maintenant): Fiche` (lève une erreur si la transition est refusée) ;
  - `deplacerFiche(fiche, jourIso, fuseau, maintenant): Fiche` (garde l'heure locale) ;
  - `analyserHashtags(texte): string[]`, `formaterHashtags(tags): string`, `texteAPublier(fiche): string`.
- Forme d'une fiche (`id` exclu une fois en base) :

```
{ id, format, pilier, format_valide: '', role_caption: null|'engagement'|'cta'|'deadpan',
  cta: false, ragebait: false, porte: false, date_heure, statut: 'idee',
  visuel: null, visuel_type: null, accroche: '', caption: '', variantes: [], hashtags: [], geotag: '',
  score: null, recommandations: [], origine: { type: 'manuelle'|'veille'|'banque', bulletin? },
  modifiee_depuis_creation: false, cree_le, maj_le }
```

Forme de `score` (remplie au plan 2) : `{ total, criteres: [{ nom, points, max, phrase }], conformite: { etat: 'vert'|'orange'|'rouge', causes: string[] }, version_profil, evalue_le, empreinte }`.

- [ ] **Step 1 : écrire les tests**

`tests/logique/fiche.test.js` :

```js
import { describe, it, expect } from 'vitest';
import {
  FORMATS, STATUTS, nouvelId, nouvelleFiche, empreinte, aReevaluer, modifierFiche, peutPasserA,
  changerStatut, deplacerFiche, analyserHashtags, formaterHashtags, texteAPublier,
} from '../../src/logique/fiche.js';

const T0 = '2026-09-27T20:00:00.000Z';
const base = () => nouvelleFiche({ id: 'f1', format: 'reel', date_heure: '2026-09-28T10:00:00.000Z', pilier: 'socio', maintenant: T0 });
const prete = () => {
  const f = { ...base(), visuel: 'a1', visuel_type: 'image', caption: 'Une caption.' };
  return { ...f, score: { total: 72, criteres: [], conformite: { etat: 'vert', causes: [] }, empreinte: empreinte(f) } };
};

describe('nouvelleFiche', () => {
  it('crée une idée vierge', () => {
    const f = base();
    expect(f).toMatchObject({ id: 'f1', format: 'reel', statut: 'idee', pilier: 'socio', score: null, modifiee_depuis_creation: false, cree_le: T0, maj_le: T0, origine: { type: 'manuelle' } });
    expect(FORMATS).toEqual(['reel', 'carrousel', 'story', 'post']);
    expect(STATUTS).toEqual(['idee', 'brouillon', 'valide', 'programme', 'publie']);
  });
  it('refuse un format inconnu', () => {
    expect(() => nouvelleFiche({ id: 'x', format: 'tiktok', date_heure: T0, maintenant: T0 })).toThrow('Format inconnu : tiktok');
  });
  it('produit des identifiants distincts', () => {
    expect(nouvelId()).not.toBe(nouvelId());
    expect(nouvelId()).toMatch(/^f-[a-z0-9]+$/);
  });
});

describe('empreinte et réévaluation', () => {
  it('ne dépend que du contenu évalué', () => {
    const f = base();
    expect(empreinte(f)).toMatch(/^[0-9a-f]{8}$/);
    expect(empreinte({ ...f, statut: 'brouillon' })).toBe(empreinte(f));
    expect(empreinte({ ...f, caption: 'autre' })).not.toBe(empreinte(f));
    expect(empreinte({ ...f, visuel: 'a2' })).not.toBe(empreinte(f));
  });
  it('marque à réévaluer quand le contenu change après le score', () => {
    const f = prete();
    expect(aReevaluer(f)).toBe(false);
    expect(aReevaluer({ ...f, caption: 'changée' })).toBe(true);
    expect(aReevaluer(base())).toBe(false);
  });
});

describe('modifierFiche', () => {
  it('applique les changements et note la modification', () => {
    const g = modifierFiche(base(), { accroche: 'Salut' }, '2026-09-27T21:00:00.000Z');
    expect(g).toMatchObject({ accroche: 'Salut', modifiee_depuis_creation: true, maj_le: '2026-09-27T21:00:00.000Z' });
  });
});

describe('statuts', () => {
  it('laisse passer librement entre idée et brouillon', () => {
    expect(peutPasserA(base(), 'brouillon')).toEqual({ ok: true });
    expect(peutPasserA(base(), 'idee')).toEqual({ ok: true });
  });
  it('exige visuel, caption, score, conformité et score à jour pour valider', () => {
    expect(peutPasserA(base(), 'valide')).toEqual({ ok: false, raison: 'Ajoute un visuel avant de valider.' });
    expect(peutPasserA({ ...base(), visuel: 'a1' }, 'valide')).toEqual({ ok: false, raison: 'Ajoute une caption avant de valider.' });
    expect(peutPasserA({ ...base(), format: 'story', visuel: 'a1' }, 'valide')).toEqual({ ok: false, raison: 'Évalue la fiche avant de la valider.' });
    const rouge = { ...prete(), score: { ...prete().score, conformite: { etat: 'rouge', causes: ['mot « mindset »'] } } };
    expect(peutPasserA(rouge, 'programme')).toEqual({ ok: false, raison: 'Conformité au rouge : mot « mindset ».' });
    expect(peutPasserA({ ...prete(), caption: 'modifiée' }, 'valide')).toEqual({ ok: false, raison: 'La fiche a changé depuis son évaluation : réévalue-la.' });
    expect(peutPasserA(prete(), 'publie')).toEqual({ ok: true });
  });
  it('refuse un statut inconnu', () => {
    expect(peutPasserA(base(), 'archive')).toEqual({ ok: false, raison: 'Statut inconnu : archive' });
  });
  it('changerStatut applique ou lève la raison', () => {
    expect(changerStatut(base(), 'brouillon', T0).statut).toBe('brouillon');
    expect(() => changerStatut(base(), 'valide', T0)).toThrow('Ajoute un visuel avant de valider.');
  });
});

describe('deplacerFiche', () => {
  it('change le jour et garde l’heure locale, même au changement d’heure', () => {
    const f = { ...base(), date_heure: '2026-10-24T10:00:00.000Z' };
    const g = deplacerFiche(f, '2026-10-24T22:00:00.000Z', 'Europe/Paris', T0);
    expect(g.date_heure).toBe('2026-10-25T11:00:00.000Z');
    expect(g.modifiee_depuis_creation).toBe(true);
  });
});

describe('hashtags et texte à publier', () => {
  it('analyse un texte libre', () => {
    expect(analyserHashtags('#nuit, #Socio  socio ##humour;#nuit')).toEqual(['nuit', 'Socio', 'humour']);
    expect(analyserHashtags('')).toEqual([]);
  });
  it('formate et assemble', () => {
    expect(formaterHashtags(['nuit', 'socio'])).toBe('#nuit #socio');
    expect(texteAPublier({ caption: ' Bonsoir. ', hashtags: ['nuit'] })).toBe('Bonsoir.\n\n#nuit');
    expect(texteAPublier({ caption: '', hashtags: [] })).toBe('');
  });
});
```

- [ ] **Step 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run tests/logique/fiche.test.js`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : implémenter**

`src/logique/fiche.js` :

```js
import { partiesLocales, versUtc } from './dates.js';

export const FORMATS = ['reel', 'carrousel', 'story', 'post'];
export const LIBELLES_FORMAT = { reel: 'Reel', carrousel: 'Carrousel', story: 'Story', post: 'Post' };
export const STATUTS = ['idee', 'brouillon', 'valide', 'programme', 'publie'];
export const LIBELLES_STATUT = { idee: 'Idée', brouillon: 'Brouillon', valide: 'Validé', programme: 'Programmé', publie: 'Publié' };
const EXIGE_EVALUATION = new Set(['valide', 'programme', 'publie']);

export function nouvelId() {
  return `f-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function nouvelleFiche({ id, format, date_heure, pilier = '', maintenant, origine = { type: 'manuelle' } }) {
  if (!FORMATS.includes(format)) throw new Error(`Format inconnu : ${format}`);
  return {
    id, format, pilier, format_valide: '', role_caption: null, cta: false, ragebait: false, porte: false,
    date_heure, statut: 'idee', visuel: null, visuel_type: null, accroche: '', caption: '', variantes: [],
    hashtags: [], geotag: '', score: null, recommandations: [], origine,
    modifiee_depuis_creation: false, cree_le: maintenant, maj_le: maintenant,
  };
}

export function empreinte(f) {
  const texte = [f.accroche ?? '', f.caption ?? '', f.visuel ?? '', (f.hashtags ?? []).join(' ')].join('␞');
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export const aReevaluer = f => !!f.score && f.score.empreinte !== empreinte(f);

export function modifierFiche(fiche, changements, maintenant) {
  return { ...fiche, ...changements, modifiee_depuis_creation: true, maj_le: maintenant };
}

export function peutPasserA(f, cible) {
  if (!STATUTS.includes(cible)) return { ok: false, raison: `Statut inconnu : ${cible}` };
  if (!EXIGE_EVALUATION.has(cible)) return { ok: true };
  if (!f.visuel) return { ok: false, raison: 'Ajoute un visuel avant de valider.' };
  if (f.format !== 'story' && !f.caption?.trim()) return { ok: false, raison: 'Ajoute une caption avant de valider.' };
  if (!f.score) return { ok: false, raison: 'Évalue la fiche avant de la valider.' };
  if (f.score.conformite?.etat === 'rouge') {
    const causes = (f.score.conformite.causes ?? []).join(' ; ') || 'cause non précisée';
    return { ok: false, raison: `Conformité au rouge : ${causes}.` };
  }
  if (aReevaluer(f)) return { ok: false, raison: 'La fiche a changé depuis son évaluation : réévalue-la.' };
  return { ok: true };
}

export function changerStatut(fiche, cible, maintenant) {
  const v = peutPasserA(fiche, cible);
  if (!v.ok) throw new Error(v.raison);
  return { ...fiche, statut: cible, maj_le: maintenant };
}

export function deplacerFiche(fiche, jourIso, fuseau, maintenant) {
  const h = partiesLocales(fiche.date_heure, fuseau);
  const j = partiesLocales(jourIso, fuseau);
  const date_heure = versUtc({ annee: j.annee, mois: j.mois, jour: j.jour, heure: h.heure, minute: h.minute }, fuseau);
  return modifierFiche(fiche, { date_heure }, maintenant);
}

export function analyserHashtags(texte) {
  const vus = new Set();
  const tags = [];
  for (const brut of (texte ?? '').split(/[\s,;]+/)) {
    const tag = brut.replace(/^#+/, '').trim();
    if (!tag || vus.has(tag.toLowerCase())) continue;
    vus.add(tag.toLowerCase());
    tags.push(tag);
  }
  return tags;
}

export const formaterHashtags = tags => (tags ?? []).map(t => `#${t}`).join(' ');

export const texteAPublier = f => [f.caption?.trim(), formaterHashtags(f.hashtags)].filter(Boolean).join('\n\n');
```

- [ ] **Step 4 : lancer les tests**

Run : `npx vitest run tests/logique/fiche.test.js`
Expected : PASS.

- [ ] **Step 5 : commit**

```bash
git add src/logique/fiche.js tests/logique/fiche.test.js
git commit -m "Modèle de fiche : statuts, empreinte, déplacement, hashtags

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5 : contrôle de semaine

**Files:**
- Create : `src/logique/controle.js`, `tests/logique/controle.test.js`

**Interfaces:**
- Consumes : `ajouterJours`, `cleJour` (Task 3).
- Produces :
  - `fichesDeLaSemaine(fiches, debutIso, fuseau): Fiche[]` ;
  - `controlerSemaine(fiches, regles, debutIso): Pastille[]`, avec `Pastille = { cle, libelle, valeur: string, etat: 'vert'|'orange'|'rouge' }`, dans l'ordre : `reels`, `carrousels`, `stories`, `cta`, `roles`, `ragebait`, `porte`, `piliers`.

**Seuils retenus** (la spec dit « pastilles vertes, orange ou rouges » sans chiffres ; ces seuils sont une décision de ce plan) :

| Pastille | Vert | Orange | Rouge |
|---|---|---|---|
| Reels / carrousels | n ≥ cible | n = cible − 1 | sinon |
| Jours avec stories (≥ `story_par_jour`) | 7/7 | 5 ou 6 | ≤ 4 |
| Appels à l'action, sur le feed (Reel, carrousel, post) | part ≤ `cta_ratio_max` | part ≤ max + 0,15, **ou** aucun appel à l'action avec au moins 4 contenus dans le feed | sinon |
| Rôles des captions (feed) | aucun manque par rapport aux cibles | 1 manque en tout | 2 manques ou plus |
| Ragebait | n ≤ max | — | n > max |
| Stories vers la porte | min ≤ n ≤ max | n = min − 1 ou max + 1 | sinon |
| Piliers (feed) | tous présents et aucun au-dessus de 50 % (dès 4 contenus) | un seul de ces deux défauts | les deux |

- [ ] **Step 1 : écrire les tests**

`tests/logique/controle.test.js` :

```js
import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { depuisSaisieLocale } from '../../src/logique/dates.js';
import { nouvelleFiche } from '../../src/logique/fiche.js';
import { controlerSemaine, fichesDeLaSemaine } from '../../src/logique/controle.js';

const R = fictif.regles_studio;
const FZ = R.fuseau;
const LUNDI = '2026-09-27T22:00:00.000Z';
let n = 0;
const fiche = (format, jour, extra = {}, heure = '12:00') => ({
  ...nouvelleFiche({ id: `t${n++}`, format, date_heure: depuisSaisieLocale(jour, heure, FZ), maintenant: LUNDI }),
  ...extra,
});
const JOURS = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
const etats = pastilles => Object.fromEntries(pastilles.map(p => [p.cle, p.etat]));
const valeurs = pastilles => Object.fromEntries(pastilles.map(p => [p.cle, p.valeur]));

function semaineIdeale() {
  return [
    fiche('reel', JOURS[0], { role_caption: 'engagement', pilier: 'socio' }),
    fiche('reel', JOURS[1], { role_caption: 'engagement', pilier: 'nuit' }),
    fiche('reel', JOURS[3], { role_caption: 'cta', cta: true, pilier: 'pont_offre' }),
    fiche('reel', JOURS[4], { role_caption: 'deadpan', pilier: 'humour_sec', ragebait: true }),
    fiche('carrousel', JOURS[2], { role_caption: 'engagement', pilier: 'socio' }),
    fiche('carrousel', JOURS[5], { role_caption: 'engagement', pilier: 'nuit' }),
    ...JOURS.map((j, i) => fiche('story', j, { porte: i < 2 }, '19:00')),
  ];
}

describe('controlerSemaine', () => {
  it('semaine vide', () => {
    const p = controlerSemaine([], R, LUNDI);
    expect(p.map(x => x.cle)).toEqual(['reels', 'carrousels', 'stories', 'cta', 'roles', 'ragebait', 'porte', 'piliers']);
    expect(etats(p)).toEqual({ reels: 'rouge', carrousels: 'rouge', stories: 'rouge', cta: 'vert', roles: 'rouge', ragebait: 'vert', porte: 'rouge', piliers: 'orange' });
    expect(valeurs(p)).toMatchObject({ reels: '0/4', carrousels: '0/2', stories: '0/7', cta: '0/0' });
  });

  it('semaine idéale : tout au vert', () => {
    const p = controlerSemaine(semaineIdeale(), R, LUNDI);
    expect(Object.values(etats(p))).toEqual(Array(8).fill('vert'));
    expect(valeurs(p)).toMatchObject({ reels: '4/4', cta: '1/6', roles: '4/1/1', porte: '2', piliers: '4/4' });
  });

  it('ignore les fiches hors de la semaine', () => {
    const p = controlerSemaine([...semaineIdeale(), fiche('reel', '2026-10-05')], R, LUNDI);
    expect(valeurs(p).reels).toBe('4/4');
  });

  it('juge la part d’appels à l’action', () => {
    const feed = k => Array.from({ length: k }, (_, i) => fiche('reel', JOURS[i]));
    const cta = (fiches, k) => fiches.map((f, i) => ({ ...f, cta: i < k }));
    expect(etats(controlerSemaine(cta(feed(5), 2), R, LUNDI)).cta).toBe('orange');
    expect(etats(controlerSemaine(cta(feed(4), 3), R, LUNDI)).cta).toBe('rouge');
    expect(etats(controlerSemaine(cta(feed(4), 0), R, LUNDI)).cta).toBe('orange');
    expect(etats(controlerSemaine(cta(feed(4), 1), R, LUNDI)).cta).toBe('vert');
  });

  it('juge les stories, le ragebait et la porte', () => {
    const cinqJours = JOURS.slice(0, 5).map(j => fiche('story', j));
    expect(etats(controlerSemaine(cinqJours, R, LUNDI)).stories).toBe('orange');
    const deuxRage = [fiche('reel', JOURS[0], { ragebait: true }), fiche('reel', JOURS[1], { ragebait: true })];
    expect(etats(controlerSemaine(deuxRage, R, LUNDI)).ragebait).toBe('rouge');
    const portes = k => JOURS.slice(0, 7).map((j, i) => fiche('story', j, { porte: i < k }));
    expect(etats(controlerSemaine(portes(1), R, LUNDI)).porte).toBe('orange');
    expect(etats(controlerSemaine(portes(4), R, LUNDI)).porte).toBe('orange');
    expect(etats(controlerSemaine(portes(5), R, LUNDI)).porte).toBe('rouge');
  });

  it('juge l’équilibre des piliers', () => {
    const domine = ['socio', 'socio', 'socio', 'nuit'].map((p, i) => fiche('reel', JOURS[i], { pilier: p }));
    expect(etats(controlerSemaine(domine, R, LUNDI)).piliers).toBe('rouge');
  });
});

describe('fichesDeLaSemaine', () => {
  it('garde une story du dimanche 23 h 30 dans la semaine du changement d’heure', () => {
    const debut = '2026-10-18T22:00:00.000Z';
    const dimanche = fiche('story', '2026-10-25', {}, '23:30');
    const lundiSuivant = fiche('story', '2026-10-26', {}, '00:10');
    expect(fichesDeLaSemaine([dimanche, lundiSuivant], debut, FZ).map(f => f.id)).toEqual([dimanche.id]);
  });
});
```

- [ ] **Step 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run tests/logique/controle.test.js`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : implémenter**

`src/logique/controle.js` :

```js
import { ajouterJours, cleJour } from './dates.js';

const FEED = new Set(['reel', 'carrousel', 'post']);
const TOLERANCE = 1e-9;

export function fichesDeLaSemaine(fiches, debutIso, fuseau) {
  const fin = ajouterJours(debutIso, 7, fuseau);
  return fiches.filter(f => f.date_heure >= debutIso && f.date_heure < fin);
}

const selonCible = (n, cible) => (n >= cible ? 'vert' : n === cible - 1 ? 'orange' : 'rouge');

export function controlerSemaine(fiches, regles, debutIso) {
  const fz = regles.fuseau;
  const semaine = fichesDeLaSemaine(fiches, debutIso, fz);
  const feed = semaine.filter(f => FEED.has(f.format));
  const stories = semaine.filter(f => f.format === 'story');
  const pastilles = [];

  const nReel = semaine.filter(f => f.format === 'reel').length;
  const nCarrousel = semaine.filter(f => f.format === 'carrousel').length;
  pastilles.push({ cle: 'reels', libelle: 'Reels', valeur: `${nReel}/${regles.cadence.reel}`, etat: selonCible(nReel, regles.cadence.reel) });
  pastilles.push({ cle: 'carrousels', libelle: 'Carrousels', valeur: `${nCarrousel}/${regles.cadence.carrousel}`, etat: selonCible(nCarrousel, regles.cadence.carrousel) });

  const parJour = new Map();
  for (const f of stories) {
    const k = cleJour(f.date_heure, fz);
    parJour.set(k, (parJour.get(k) ?? 0) + 1);
  }
  const joursCouverts = regles.cadence.story_par_jour === 0
    ? 7
    : [...parJour.values()].filter(k => k >= regles.cadence.story_par_jour).length;
  pastilles.push({ cle: 'stories', libelle: 'Jours avec stories', valeur: `${joursCouverts}/7`, etat: joursCouverts === 7 ? 'vert' : joursCouverts >= 5 ? 'orange' : 'rouge' });

  const nCta = feed.filter(f => f.cta).length;
  const part = feed.length ? nCta / feed.length : 0;
  let etatCta = part <= regles.cta_ratio_max + TOLERANCE ? 'vert' : part <= regles.cta_ratio_max + 0.15 + TOLERANCE ? 'orange' : 'rouge';
  if (etatCta === 'vert' && feed.length >= 4 && nCta === 0) etatCta = 'orange';
  pastilles.push({ cle: 'cta', libelle: "Appels à l'action", valeur: `${nCta}/${feed.length}`, etat: etatCta });

  const roles = { engagement: 0, cta: 0, deadpan: 0 };
  for (const f of feed) if (f.role_caption in roles) roles[f.role_caption]++;
  const manques = Object.keys(roles).reduce((t, k) => t + Math.max(0, regles.roles_caption[k] - roles[k]), 0);
  pastilles.push({ cle: 'roles', libelle: 'Rôles des captions', valeur: `${roles.engagement}/${roles.cta}/${roles.deadpan}`, etat: manques === 0 ? 'vert' : manques === 1 ? 'orange' : 'rouge' });

  const nRage = semaine.filter(f => f.ragebait).length;
  pastilles.push({ cle: 'ragebait', libelle: 'Ragebait', valeur: `${nRage}/${regles.ragebait_max}`, etat: nRage <= regles.ragebait_max ? 'vert' : 'rouge' });

  const nPorte = stories.filter(f => f.porte).length;
  const { min, max } = regles.stories_porte;
  const etatPorte = nPorte >= min && nPorte <= max ? 'vert' : nPorte === min - 1 || nPorte === max + 1 ? 'orange' : 'rouge';
  pastilles.push({ cle: 'porte', libelle: 'Stories vers la porte', valeur: String(nPorte), etat: etatPorte });

  const parPilier = new Map(regles.piliers.map(p => [p.cle, 0]));
  for (const f of feed) if (parPilier.has(f.pilier)) parPilier.set(f.pilier, parPilier.get(f.pilier) + 1);
  const absents = [...parPilier.values()].filter(k => k === 0).length;
  const dominant = feed.length >= 4 && [...parPilier.values()].some(k => k / feed.length > 0.5);
  pastilles.push({
    cle: 'piliers', libelle: 'Piliers', valeur: `${regles.piliers.length - absents}/${regles.piliers.length}`,
    etat: !absents && !dominant ? 'vert' : absents && dominant ? 'rouge' : 'orange',
  });

  return pastilles;
}
```

- [ ] **Step 4 : lancer les tests**

Run : `npx vitest run tests/logique/controle.test.js`
Expected : PASS.

- [ ] **Step 5 : commit**

```bash
git add src/logique/controle.js tests/logique/controle.test.js
git commit -m "Contrôle de semaine : cadence, appels à l'action, rôles, porte, piliers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6 : créneaux libres

**Files:**
- Create : `src/logique/creneaux.js`, `tests/logique/creneaux.test.js`

**Interfaces:**
- Consumes : `ajouterJours`, `cleJour`, `heureLocale`, `depuisSaisieLocale` (Task 3), `fichesDeLaSemaine` (Task 5).
- Produces : `creneauxLibres(fiches, regles, debutIso): { date_heure: string, format: 'reel'|'carrousel' }[]`, triés par date. Un créneau est libre si aucun contenu du feed ne tombe dans sa plage horaire ce jour-là. Les formats à placer sont les Reels manquants, puis les carrousels manquants, par rapport à la cadence. Il y a autant de créneaux proposés que de contenus manquants, au plus.

- [ ] **Step 1 : écrire les tests**

`tests/logique/creneaux.test.js` :

```js
import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { depuisSaisieLocale } from '../../src/logique/dates.js';
import { nouvelleFiche } from '../../src/logique/fiche.js';
import { creneauxLibres } from '../../src/logique/creneaux.js';

const R = fictif.regles_studio;
const LUNDI = '2026-09-27T22:00:00.000Z';
let n = 0;
const fiche = (format, jour, heure) => nouvelleFiche({ id: `c${n++}`, format, date_heure: depuisSaisieLocale(jour, heure, R.fuseau), maintenant: LUNDI });

describe('creneauxLibres', () => {
  it('propose lundi, mardi et jeudi à midi sur une semaine vide', () => {
    expect(creneauxLibres([], R, LUNDI)).toEqual([
      { date_heure: '2026-09-28T10:00:00.000Z', format: 'reel' },
      { date_heure: '2026-09-29T10:00:00.000Z', format: 'reel' },
      { date_heure: '2026-10-01T10:00:00.000Z', format: 'reel' },
    ]);
  });
  it('considère un créneau occupé par un contenu dans la plage', () => {
    const r = creneauxLibres([fiche('reel', '2026-09-29', '13:00')], R, LUNDI);
    expect(r.map(c => c.date_heure)).toEqual(['2026-09-28T10:00:00.000Z', '2026-10-01T10:00:00.000Z']);
  });
  it('ne compte pas un contenu hors de la plage horaire', () => {
    const r = creneauxLibres([fiche('reel', '2026-09-29', '16:00')], R, LUNDI);
    expect(r).toHaveLength(3);
  });
  it('ne compte pas les stories comme occupant un créneau', () => {
    expect(creneauxLibres([fiche('story', '2026-09-28', '12:30')], R, LUNDI)).toHaveLength(3);
  });
  it('ne propose rien quand la cadence est atteinte', () => {
    const pleins = [
      fiche('reel', '2026-09-30', '18:00'), fiche('reel', '2026-10-02', '18:00'),
      fiche('reel', '2026-10-03', '18:00'), fiche('reel', '2026-10-04', '18:00'),
      fiche('carrousel', '2026-10-02', '09:00'), fiche('carrousel', '2026-10-03', '09:00'),
    ];
    expect(creneauxLibres(pleins, R, LUNDI)).toEqual([]);
  });
  it('propose un carrousel une fois les Reels atteints', () => {
    const reels = ['2026-09-30', '2026-10-02', '2026-10-03', '2026-10-04'].map(j => fiche('reel', j, '18:00'));
    expect(creneauxLibres(reels, R, LUNDI).map(c => c.format)).toEqual(['carrousel', 'carrousel']);
  });
});
```

- [ ] **Step 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run tests/logique/creneaux.test.js`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : implémenter**

`src/logique/creneaux.js` :

```js
import { ajouterJours, cleJour, heureLocale, depuisSaisieLocale } from './dates.js';
import { fichesDeLaSemaine } from './controle.js';

const FEED = new Set(['reel', 'carrousel', 'post']);

export function creneauxLibres(fiches, regles, debutIso) {
  const fz = regles.fuseau;
  const feed = fichesDeLaSemaine(fiches, debutIso, fz).filter(f => FEED.has(f.format));
  const manque = format => Math.max(0, regles.cadence[format] - feed.filter(f => f.format === format).length);
  const aPlacer = [...Array(manque('reel')).fill('reel'), ...Array(manque('carrousel')).fill('carrousel')];
  if (aPlacer.length === 0) return [];

  const libres = [];
  for (let i = 0; i < 7; i++) {
    const cle = cleJour(ajouterJours(debutIso, i, fz), fz);
    for (const cr of regles.creneaux) {
      if (!cr.jours.includes(i + 1)) continue;
      const occupe = feed.some(f => {
        if (cleJour(f.date_heure, fz) !== cle) return false;
        const h = heureLocale(f.date_heure, fz);
        return h >= cr.debut && h < cr.fin;
      });
      if (!occupe) libres.push(depuisSaisieLocale(cle, cr.debut, fz));
    }
  }
  return libres.sort().slice(0, aPlacer.length).map((date_heure, i) => ({ date_heure, format: aPlacer[i] }));
}
```

- [ ] **Step 4 : lancer les tests**

Run : `npx vitest run tests/logique/creneaux.test.js`
Expected : PASS.

- [ ] **Step 5 : commit**

```bash
git add src/logique/creneaux.js tests/logique/creneaux.test.js
git commit -m "Créneaux libres selon la cadence et les plages du profil

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7 : accès à la base et enregistrement sérialisé

**Files:**
- Create : `tests/aides/fausseBase.js`, `src/donnees/depot.js`, `src/donnees/enregistreur.js`, `tests/donnees/depot.test.js`, `tests/donnees/enregistreur.test.js`

**Interfaces:**
- Consumes : `validerProfil` (Task 2). L'API `db` de la page, dont on utilise `db.doc(path).get/set/delete/onSnapshot` et `db.collection(path).where(...).onSnapshot(next, error)` ; `snap.docs[i].id` et `.data()`.
- Produces :
  - `creerDepot(db)` → `{ ecouterFiches(debutIso, finIso, rappel, erreur): () => void, enregistrerFiche(fiche): Promise, supprimerFiche(id): Promise, ecouterProfil(rappel, erreur): () => void, importerProfil(profil, maintenant): Promise<{ ok, erreurs, version? }> }`
  - `creerEnregistreur(enregistrer, delaiMs = 600, surErreur = () => {})` → `{ planifier(fiche), vider(id): Promise, viderTout(): Promise, annuler(id): Promise, estEnAttente(id): boolean }`
  - `creerFausseBase()` (tests seulement) : même surface que `db`, plus `ecritures: string[]`.

- [ ] **Step 1 : écrire la fausse base**

`tests/aides/fausseBase.js` :

```js
export function creerFausseBase() {
  const docs = new Map();
  const ecouteurs = new Set();
  const notifier = () => { for (const e of [...ecouteurs]) e(); };
  const instantane = chemin => ({
    id: chemin.split('/').pop(),
    exists: docs.has(chemin),
    data: () => (docs.has(chemin) ? structuredClone(docs.get(chemin)) : undefined),
    metadata: { fromCache: false, hasPendingWrites: false },
  });

  const base = {
    ecritures: [],
    _docs: docs,
    doc: chemin => ({
      id: chemin.split('/').pop(),
      path: chemin,
      async get() { return instantane(chemin); },
      async set(corps) { base.ecritures.push(chemin); docs.set(chemin, structuredClone(corps)); notifier(); },
      async delete() { base.ecritures.push(`suppression:${chemin}`); docs.delete(chemin); notifier(); },
      onSnapshot(suivant) { const e = () => suivant(instantane(chemin)); ecouteurs.add(e); e(); return () => ecouteurs.delete(e); },
    }),
    collection: chemin => requete(chemin, []),
  };

  function requete(collection, filtres) {
    const profondeur = collection.split('/').length + 1;
    const executer = () => [...docs.keys()]
      .filter(c => c.startsWith(`${collection}/`) && c.split('/').length === profondeur)
      .sort()
      .map(instantane)
      .filter(s => filtres.every(([champ, op, v]) => {
        const x = s.data()[champ];
        return op === '>=' ? x >= v : op === '<' ? x < v : op === '==' ? x === v : false;
      }));
    const resultat = () => { const d = executer(); return { docs: d, size: d.length, empty: d.length === 0 }; };
    return {
      where: (champ, op, v) => requete(collection, [...filtres, [champ, op, v]]),
      async get() { return resultat(); },
      onSnapshot(suivant) { const e = () => suivant(resultat()); ecouteurs.add(e); e(); return () => ecouteurs.delete(e); },
      doc: id => base.doc(`${collection}/${id}`),
    };
  }

  return base;
}
```

- [ ] **Step 2 : écrire les tests du dépôt**

`tests/donnees/depot.test.js` :

```js
import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { creerFausseBase } from '../aides/fausseBase.js';
import { creerDepot } from '../../src/donnees/depot.js';

const T = '2026-09-27T20:00:00.000Z';

describe('fiches', () => {
  it('enregistre sans l’id et écoute une plage de dates', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    await depot.enregistrerFiche({ id: 'a', date_heure: '2026-09-28T10:00:00.000Z', format: 'reel' });
    await depot.enregistrerFiche({ id: 'b', date_heure: '2026-10-06T10:00:00.000Z', format: 'reel' });
    expect(db._docs.get('fiches/a')).toEqual({ date_heure: '2026-09-28T10:00:00.000Z', format: 'reel' });
    const recues = [];
    const stop = depot.ecouterFiches('2026-09-27T22:00:00.000Z', '2026-10-04T22:00:00.000Z', f => recues.push(f));
    expect(recues.at(-1)).toEqual([{ id: 'a', date_heure: '2026-09-28T10:00:00.000Z', format: 'reel' }]);
    stop();
  });
  it('supprime', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    await depot.enregistrerFiche({ id: 'a', date_heure: T });
    await depot.supprimerFiche('a');
    expect(db._docs.has('fiches/a')).toBe(false);
  });
});

describe('profil', () => {
  it('refuse un profil invalide sans rien écrire', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    const r = await depot.importerProfil({ meta: {} }, T);
    expect(r.ok).toBe(false);
    expect(r.erreurs[0]).toContain('regles_studio');
    expect(db.ecritures).toEqual([]);
  });
  it('versionne et archive les imports successifs', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    const vus = [];
    depot.ecouterProfil(p => vus.push(p));
    expect(vus[0]).toBeNull();
    expect(await depot.importerProfil(fictif, T)).toEqual({ ok: true, erreurs: [], version: 1 });
    expect(await depot.importerProfil(fictif, T)).toEqual({ ok: true, erreurs: [], version: 2 });
    expect(vus.at(-1)).toMatchObject({ version: 2, importe_le: T });
    expect(db._docs.get('profil_archives/v1')).toMatchObject({ version: 1 });
  });
  it('laisse le profil courant intact quand un nouvel import est refusé', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    await depot.importerProfil(fictif, T);
    await depot.importerProfil({ regles_studio: { fuseau: 'Mars/Olympus' } }, T);
    expect(db._docs.get('profil/courant')).toMatchObject({ version: 1 });
  });
});
```

- [ ] **Step 3 : écrire les tests de l'enregistreur**

`tests/donnees/enregistreur.test.js` :

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { creerEnregistreur } from '../../src/donnees/enregistreur.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const differe = () => { let resoudre; const p = new Promise(r => { resoudre = r; }); return { p, resoudre }; };

describe('creerEnregistreur', () => {
  it('regroupe une saisie rapide en une seule écriture de la dernière valeur', async () => {
    const enregistrer = vi.fn(async () => {});
    const e = creerEnregistreur(enregistrer, 600);
    for (const t of ['a', 'ab', 'abc']) e.planifier({ id: 'f1', accroche: t });
    expect(e.estEnAttente('f1')).toBe(true);
    await vi.advanceTimersByTimeAsync(600);
    expect(enregistrer).toHaveBeenCalledTimes(1);
    expect(enregistrer).toHaveBeenCalledWith({ id: 'f1', accroche: 'abc' });
    expect(e.estEnAttente('f1')).toBe(false);
  });

  it('n’écrit jamais deux fois en même temps pour une fiche, et finit par la plus récente', async () => {
    const premiere = differe();
    const appels = [];
    const enregistrer = vi.fn(f => { appels.push(f.accroche); return appels.length === 1 ? premiere.p : Promise.resolve(); });
    const e = creerEnregistreur(enregistrer, 600);
    e.planifier({ id: 'f1', accroche: 'v1' });
    await vi.advanceTimersByTimeAsync(600);
    e.planifier({ id: 'f1', accroche: 'v2' });
    await vi.advanceTimersByTimeAsync(600);
    expect(appels).toEqual(['v1']);
    expect(e.estEnAttente('f1')).toBe(true);
    premiere.resoudre();
    await vi.advanceTimersByTimeAsync(0);
    expect(appels).toEqual(['v1', 'v2']);
  });

  it('vider écrit tout de suite, sans attendre le délai', async () => {
    const enregistrer = vi.fn(async () => {});
    const e = creerEnregistreur(enregistrer, 600);
    e.planifier({ id: 'f1', accroche: 'x' });
    await e.vider('f1');
    expect(enregistrer).toHaveBeenCalledWith({ id: 'f1', accroche: 'x' });
  });

  it('annuler abandonne l’écriture en attente', async () => {
    const enregistrer = vi.fn(async () => {});
    const e = creerEnregistreur(enregistrer, 600);
    e.planifier({ id: 'f1', accroche: 'x' });
    await e.annuler('f1');
    await vi.advanceTimersByTimeAsync(600);
    expect(enregistrer).not.toHaveBeenCalled();
    expect(e.estEnAttente('f1')).toBe(false);
  });

  it('signale un échec et retente à la prochaine vidange', async () => {
    const surErreur = vi.fn();
    const enregistrer = vi.fn().mockRejectedValueOnce({ code: 'unavailable' }).mockResolvedValue();
    const e = creerEnregistreur(enregistrer, 600, surErreur);
    e.planifier({ id: 'f1', accroche: 'x' });
    await e.vider('f1');
    expect(surErreur).toHaveBeenCalledWith({ code: 'unavailable' }, { id: 'f1', accroche: 'x' });
    expect(e.estEnAttente('f1')).toBe(true);
    await e.vider('f1');
    expect(enregistrer).toHaveBeenCalledTimes(2);
    expect(e.estEnAttente('f1')).toBe(false);
  });

  it('viderTout vide toutes les fiches', async () => {
    const enregistrer = vi.fn(async () => {});
    const e = creerEnregistreur(enregistrer, 600);
    e.planifier({ id: 'a' });
    e.planifier({ id: 'b' });
    await e.viderTout();
    expect(enregistrer).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 4 : lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run tests/donnees`
Expected : FAIL (modules introuvables).

- [ ] **Step 5 : implémenter le dépôt**

`src/donnees/depot.js` :

```js
import { validerProfil } from '../logique/profil.js';

export function creerDepot(db) {
  return {
    ecouterFiches(debutIso, finIso, rappel, erreur) {
      return db.collection('fiches')
        .where('date_heure', '>=', debutIso)
        .where('date_heure', '<', finIso)
        .onSnapshot(snap => rappel(snap.docs.map(d => ({ id: d.id, ...d.data() }))), erreur);
    },

    async enregistrerFiche(fiche) {
      const { id, ...corps } = fiche;
      await db.doc(`fiches/${id}`).set(corps);
    },

    async supprimerFiche(id) {
      await db.doc(`fiches/${id}`).delete();
    },

    ecouterProfil(rappel, erreur) {
      return db.doc('profil/courant').onSnapshot(s => rappel(s.exists ? s.data() : null), erreur);
    },

    async importerProfil(profil, maintenant) {
      const verification = validerProfil(profil);
      if (!verification.ok) return verification;
      const actuel = await db.doc('profil/courant').get();
      const ancienne = actuel.exists ? actuel.data() : null;
      const version = (ancienne?.version ?? 0) + 1;
      if (ancienne) await db.doc(`profil_archives/v${ancienne.version ?? 0}`).set(ancienne);
      await db.doc('profil/courant').set({ ...profil, version, importe_le: maintenant });
      return { ok: true, erreurs: [], version };
    },
  };
}
```

- [ ] **Step 6 : implémenter l'enregistreur**

`src/donnees/enregistreur.js` :

```js
// Regroupe les modifications d'une fiche et garantit une seule écriture à la fois par fiche.
export function creerEnregistreur(enregistrer, delaiMs = 600, surErreur = () => {}) {
  const dernier = new Map();
  const minuteries = new Map();
  const chaines = new Map();
  const enVol = new Map();

  function lancer(id) {
    clearTimeout(minuteries.get(id));
    minuteries.delete(id);
    const precedente = chaines.get(id) ?? Promise.resolve();
    if (!dernier.has(id)) return precedente;
    const suivante = precedente.then(async () => {
      if (!dernier.has(id)) return;
      const fiche = dernier.get(id);
      dernier.delete(id);
      enVol.set(id, (enVol.get(id) ?? 0) + 1);
      try {
        await enregistrer(fiche);
      } catch (e) {
        if (!dernier.has(id)) dernier.set(id, fiche);
        surErreur(e, fiche);
      } finally {
        const reste = enVol.get(id) - 1;
        if (reste > 0) enVol.set(id, reste); else enVol.delete(id);
      }
    });
    chaines.set(id, suivante);
    return suivante;
  }

  return {
    planifier(fiche) {
      dernier.set(fiche.id, fiche);
      clearTimeout(minuteries.get(fiche.id));
      minuteries.set(fiche.id, setTimeout(() => lancer(fiche.id), delaiMs));
    },
    vider: id => lancer(id),
    viderTout: () => Promise.all([...new Set([...dernier.keys(), ...chaines.keys()])].map(lancer)),
    annuler(id) {
      clearTimeout(minuteries.get(id));
      minuteries.delete(id);
      dernier.delete(id);
      return chaines.get(id) ?? Promise.resolve();
    },
    estEnAttente: id => dernier.has(id) || enVol.has(id),
  };
}
```

- [ ] **Step 7 : lancer les tests**

Run : `npx vitest run tests/donnees`
Expected : PASS.

- [ ] **Step 8 : commit**

```bash
git add src/donnees tests/donnees tests/aides
git commit -m "Accès à la base : fiches, profil versionné, écritures sérialisées

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8 : squelette de l'interface, contrôleur et démarrage

**Files:**
- Create : `src/interface/h.js`, `src/interface/etat.js`, `src/interface/controleur.js`, `src/interface/rendu.js`, `src/interface/app.js`, `tests/interface/h.test.js`, `tests/interface/controleur.test.js`, `tests/interface/app.test.js`
- Modify : `src/interface/main.js`, `src/interface/styles.css`

À cette étape, `rendu.js` importe des vues qui n'existent pas encore. Elles sont créées ici **en version minimale** (un seul élément), puis complétées aux Tasks 9 à 12 :
- `src/interface/vue-semaine.js`, `vue-mois.js`, `vue-jour.js` : `h('div', { class: '…' })` ;
- `vue-profil.js` : fonctionnelle dès cette tâche ;
- `panneau-fiche.js` : `h('aside', { class: 'panneau' })`.

**Interfaces:**
- Consumes : tout ce qui précède.
- Produces :
  - `h(tag, props, ...enfants): HTMLElement` ;
  - `creerEtat(initial)` → `{ lire(), modifier(changements), abonner(fn): () => void }` ;
  - état de l'application : `{ profil: undefined|null|Profil, fiches: Fiche[], vue: 'semaine'|'mois'|'jour'|'profil', ancre: iso, ficheOuverte: id|null, erreur: string|null, sauvegarde: 'ok'|'en_cours'|'erreur' }` ;
  - `plageDeVue(vue, ancre, fuseau): [debutIso, finIso]` ;
  - `fusionnerInstantane(recues, locales, estEnAttente): Fiche[]` ;
  - `creerControleur({ etat, depot, enregistreur, assets, horloge, idAleatoire })` → actions `{ ouvrirFiche(id), fermerPanneau(), creerFiche({ format, date_heure }), modifierFiche(id, changements), deplacerFiche(id, jourIso), changerStatut(id, cible) → { ok, raison? }, supprimerFiche(id), televerserVisuel(id, fichier) → { ok, id?, type?, raison? }, changerVue(vue, ancre?), naviguer(delta), allerAujourdhui(), effacerErreur(), importerProfil(texte) → { ok, erreurs } }` ;
  - `demarrer(racine, claude, { horloge, delaiEnregistrement })` → `Promise<{ etat, actions } | null>`.
- Signatures des vues, pour les Tasks 9 à 12 :
  - `vueSemaine(etat, actions)`, `vueMois(etat, actions)`, `vueJour(etat, actions)` et `vueProfil(etat, actions)` renvoient un élément ;
  - `panneauFiche(fiche, profil, actions, capacites: { assets: boolean })` renvoie un élément.

- [ ] **Step 1 : écrire les tests de `h`**

`tests/interface/h.test.js` :

```js
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { h } from '../../src/interface/h.js';

describe('h', () => {
  it('crée un élément avec classe, attributs et enfants aplatis', () => {
    const el = h('div', { class: 'boite', 'data-id': 'x', title: 'Titre' }, 'a', [h('span', {}, 'b'), null, false, ['c']]);
    expect(el.className).toBe('boite');
    expect(el.getAttribute('data-id')).toBe('x');
    expect(el.title).toBe('Titre');
    expect(el.textContent).toBe('abc');
  });
  it('branche les écouteurs et ignore les props nulles ou fausses', () => {
    const clic = vi.fn();
    const el = h('button', { onclick: clic, disabled: false, 'aria-current': null }, 'ok');
    el.click();
    expect(clic).toHaveBeenCalledTimes(1);
    expect(el.disabled).toBe(false);
    expect(el.hasAttribute('aria-current')).toBe(false);
  });
  it('accepte un objet de style et les variables CSS', () => {
    const el = h('div', { style: { color: 'red', '--pilier': '#123456' } });
    expect(el.style.color).toBe('red');
    expect(el.style.getPropertyValue('--pilier')).toBe('#123456');
  });
});
```

- [ ] **Step 2 : écrire les tests du contrôleur**

`tests/interface/controleur.test.js` :

```js
import { describe, it, expect, vi } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { creerFausseBase } from '../aides/fausseBase.js';
import { creerDepot } from '../../src/donnees/depot.js';
import { creerEnregistreur } from '../../src/donnees/enregistreur.js';
import { creerEtat } from '../../src/interface/etat.js';
import { creerControleur, plageDeVue, fusionnerInstantane } from '../../src/interface/controleur.js';

const T = '2026-09-28T08:00:00.000Z';
const FZ = 'Europe/Paris';

function monter({ assets = null } = {}) {
  const db = creerFausseBase();
  const depot = creerDepot(db);
  const enregistreur = creerEnregistreur(f => depot.enregistrerFiche(f), 600);
  const etat = creerEtat({ profil: { ...fictif, version: 1 }, fiches: [], vue: 'semaine', ancre: T, ficheOuverte: null, erreur: null, sauvegarde: 'ok' });
  let n = 0;
  const actions = creerControleur({ etat, depot, enregistreur, assets, horloge: () => T, idAleatoire: () => `f${++n}` });
  return { db, etat, actions, enregistreur };
}

describe('plageDeVue', () => {
  it('couvre la semaine, le mois et le jour', () => {
    expect(plageDeVue('semaine', T, FZ)).toEqual(['2026-09-27T22:00:00.000Z', '2026-10-04T22:00:00.000Z']);
    expect(plageDeVue('jour', T, FZ)).toEqual(['2026-09-27T22:00:00.000Z', '2026-09-28T22:00:00.000Z']);
    expect(plageDeVue('mois', '2026-10-15T10:00:00.000Z', FZ)).toEqual(['2026-09-27T22:00:00.000Z', '2026-11-01T23:00:00.000Z']);
  });
});

describe('fusionnerInstantane', () => {
  it('garde la version locale des fiches en cours d’enregistrement', () => {
    const recues = [{ id: 'a', accroche: 'ancienne' }, { id: 'b', accroche: 'b' }];
    const locales = [{ id: 'a', accroche: 'nouvelle' }, { id: 'c', accroche: 'pas encore en base' }];
    const enAttente = id => id === 'a' || id === 'c';
    expect(fusionnerInstantane(recues, locales, enAttente)).toEqual([
      { id: 'a', accroche: 'nouvelle' }, { id: 'b', accroche: 'b' }, { id: 'c', accroche: 'pas encore en base' },
    ]);
  });
});

describe('creerControleur', () => {
  it('crée une fiche, l’enregistre et l’ouvre', async () => {
    const { db, etat, actions } = monter();
    const f = await actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    expect(f).toMatchObject({ id: 'f1', pilier: 'socio', statut: 'idee' });
    expect(etat.lire().ficheOuverte).toBe('f1');
    expect(db._docs.has('fiches/f1')).toBe(true);
  });

  it('fermer le panneau enregistre la dernière saisie', async () => {
    const { db, actions } = monter();
    await actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    actions.modifierFiche('f1', { accroche: 'dernière saisie' });
    await actions.fermerPanneau();
    expect(db._docs.get('fiches/f1').accroche).toBe('dernière saisie');
  });

  it('changer de période enregistre aussi la saisie en cours', async () => {
    const { db, actions, etat } = monter();
    await actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    actions.modifierFiche('f1', { caption: 'tapée juste avant' });
    await actions.naviguer(1);
    expect(db._docs.get('fiches/f1').caption).toBe('tapée juste avant');
    expect(etat.lire().ancre).toBe('2026-10-05T08:00:00.000Z');
    expect(etat.lire().ficheOuverte).toBeNull();
  });

  it('un déplacement juste après une saisie garde la saisie et la nouvelle date', async () => {
    const { db, actions } = monter();
    await actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    actions.modifierFiche('f1', { accroche: 'saisie' });
    await actions.deplacerFiche('f1', '2026-09-29T22:00:00.000Z');
    expect(db._docs.get('fiches/f1')).toMatchObject({ accroche: 'saisie', date_heure: '2026-09-30T10:00:00.000Z' });
  });

  it('refuse une validation impossible et affiche la raison', async () => {
    const { etat, actions } = monter();
    await actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    const r = await actions.changerStatut('f1', 'valide');
    expect(r).toEqual({ ok: false, raison: 'Ajoute un visuel avant de valider.' });
    expect(etat.lire().erreur).toBe('Ajoute un visuel avant de valider.');
    expect(etat.lire().fiches[0].statut).toBe('idee');
  });

  it('supprime sans qu’une écriture en attente ne ressuscite la fiche', async () => {
    const { db, actions, etat } = monter();
    await actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    actions.modifierFiche('f1', { accroche: 'x' });
    await actions.supprimerFiche('f1');
    await new Promise(r => setTimeout(r, 650));
    expect(db._docs.has('fiches/f1')).toBe(false);
    expect(etat.lire().fiches).toEqual([]);
    expect(etat.lire().ficheOuverte).toBeNull();
  });

  it('téléverse un visuel ou explique pourquoi c’est impossible', async () => {
    const sans = monter();
    await sans.actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    expect(await sans.actions.televerserVisuel('f1', { type: 'image/png' })).toEqual({ ok: false, raison: 'Le téléversement n’est pas disponible dans cette vue.' });

    const assets = { upload: vi.fn(async () => ({ id: 'asset1', url: '/_blob/asset1' })) };
    const avec = monter({ assets });
    await avec.actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    expect(await avec.actions.televerserVisuel('f1', { type: 'video/mp4' })).toEqual({ ok: true, id: 'asset1', type: 'video' });
    expect(avec.etat.lire().fiches[0]).toMatchObject({ visuel: 'asset1', visuel_type: 'video' });
  });

  it('importe un profil depuis du texte et signale le JSON invalide', async () => {
    const { actions, db } = monter();
    expect((await actions.importerProfil('{pas du json')).erreurs[0]).toMatch(/^Ce texte n’est pas du JSON valide/);
    expect(await actions.importerProfil(JSON.stringify(fictif))).toMatchObject({ ok: true, version: 1 });
    expect(db._docs.get('profil/courant')).toMatchObject({ version: 1 });
  });
});
```

- [ ] **Step 3 : écrire les tests du démarrage**

`tests/interface/app.test.js` :

```js
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { creerFausseBase } from '../aides/fausseBase.js';
import { demarrer } from '../../src/interface/app.js';

const horloge = () => '2026-09-28T08:00:00.000Z';

describe('demarrer', () => {
  it('affiche un message clair quand la base est indisponible', async () => {
    const racine = document.createElement('div');
    expect(await demarrer(racine, { use: async () => null }, { horloge })).toBeNull();
    expect(racine.textContent).toContain('La base du studio n’est pas accessible depuis cette vue.');
  });

  it('affiche aussi le message quand window.claude est absent', async () => {
    const racine = document.createElement('div');
    await demarrer(racine, undefined, { horloge });
    expect(racine.textContent).toContain('pas accessible');
  });

  it('ouvre l’onglet Profil tant qu’aucun profil n’est importé, puis la semaine', async () => {
    const db = creerFausseBase();
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    expect(app.etat.lire().vue).toBe('profil');
    expect(racine.querySelector('#profil-json')).not.toBeNull();
    await app.actions.importerProfil(JSON.stringify(fictif));
    expect(app.etat.lire().vue).toBe('semaine');
    expect(racine.querySelector('.barre .titre').textContent).toBe('Studio');
  });
});
```

- [ ] **Step 4 : lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run tests/interface`
Expected : FAIL (modules introuvables).

- [ ] **Step 5 : implémenter `h` et l'état**

`src/interface/h.js` :

```js
export function h(tag, props = {}, ...enfants) {
  const el = document.createElement(tag);
  for (const [cle, valeur] of Object.entries(props ?? {})) {
    if (valeur == null || valeur === false) continue;
    if (cle.startsWith('on') && typeof valeur === 'function') el.addEventListener(cle.slice(2).toLowerCase(), valeur);
    else if (cle === 'class') el.className = valeur;
    else if (cle === 'style' && typeof valeur === 'object') {
      for (const [p, v] of Object.entries(valeur)) {
        if (p.startsWith('--')) el.style.setProperty(p, v); else el.style[p] = v;
      }
    } else if (cle in el && !cle.includes('-')) el[cle] = valeur;
    else el.setAttribute(cle, valeur === true ? '' : valeur);
  }
  for (const enfant of enfants.flat(Infinity)) {
    if (enfant == null || enfant === false) continue;
    el.append(enfant instanceof Node ? enfant : String(enfant));
  }
  return el;
}
```

`src/interface/etat.js` :

```js
export function creerEtat(initial) {
  let etat = initial;
  const abonnes = new Set();
  return {
    lire: () => etat,
    modifier(changements) {
      etat = { ...etat, ...changements };
      for (const abonne of [...abonnes]) abonne(etat);
    },
    abonner(fn) {
      abonnes.add(fn);
      return () => abonnes.delete(fn);
    },
  };
}
```

- [ ] **Step 6 : implémenter le contrôleur**

`src/interface/controleur.js` :

```js
import {
  nouvelId, nouvelleFiche, modifierFiche as appliquer, peutPasserA, changerStatut as appliquerStatut, deplacerFiche as deplacer,
} from '../logique/fiche.js';
import { ajouterJours, ajouterMois, debutJour, debutSemaine, semainesDuMois } from '../logique/dates.js';

export function plageDeVue(vue, ancre, fuseau) {
  if (vue === 'mois') {
    const semaines = semainesDuMois(ancre, fuseau);
    return [semaines[0], ajouterJours(semaines[semaines.length - 1], 7, fuseau)];
  }
  if (vue === 'jour') {
    const d = debutJour(ancre, fuseau);
    return [d, ajouterJours(d, 1, fuseau)];
  }
  const d = debutSemaine(ancre, fuseau);
  return [d, ajouterJours(d, 7, fuseau)];
}

export function fusionnerInstantane(recues, locales, estEnAttente) {
  const parId = new Map(locales.map(f => [f.id, f]));
  const resultat = recues.map(f => (estEnAttente(f.id) && parId.has(f.id) ? parId.get(f.id) : f));
  const vues = new Set(resultat.map(f => f.id));
  for (const f of locales) if (!vues.has(f.id) && estEnAttente(f.id)) resultat.push(f);
  return resultat;
}

export function creerControleur({ etat, depot, enregistreur, assets, horloge, idAleatoire = nouvelId }) {
  const trouver = id => etat.lire().fiches.find(f => f.id === id);
  const fuseau = () => etat.lire().profil.regles_studio.fuseau;
  const remplacer = f => etat.modifier({ fiches: etat.lire().fiches.map(x => (x.id === f.id ? f : x)) });
  const ecrireMaintenant = async f => { enregistreur.planifier(f); await enregistreur.vider(f.id); };

  async function fermerPanneau() {
    const id = etat.lire().ficheOuverte;
    etat.modifier({ ficheOuverte: null });
    if (id) await enregistreur.vider(id);
  }

  function modifierFiche(id, changements) {
    const f = trouver(id);
    if (!f) return null;
    const g = appliquer(f, changements, horloge());
    remplacer(g);
    enregistreur.planifier(g);
    return g;
  }

  async function changerAncre(vue, ancre) {
    await fermerPanneau();
    etat.modifier({ vue, ancre });
  }

  return {
    ouvrirFiche: id => etat.modifier({ ficheOuverte: id, erreur: null }),
    fermerPanneau,
    modifierFiche,

    async creerFiche({ format, date_heure }) {
      await fermerPanneau();
      const { profil, fiches } = etat.lire();
      const f = nouvelleFiche({ id: idAleatoire(), format, date_heure, pilier: profil.regles_studio.piliers[0].cle, maintenant: horloge() });
      etat.modifier({ fiches: [...fiches, f], ficheOuverte: f.id });
      await ecrireMaintenant(f);
      return f;
    },

    async deplacerFiche(id, jourIso) {
      const f = trouver(id);
      if (!f) return;
      const g = deplacer(f, jourIso, fuseau(), horloge());
      remplacer(g);
      await ecrireMaintenant(g);
    },

    async changerStatut(id, cible) {
      const f = trouver(id);
      if (!f) return { ok: false, raison: 'Fiche introuvable.' };
      const verification = peutPasserA(f, cible);
      if (!verification.ok) {
        etat.modifier({ erreur: verification.raison });
        return verification;
      }
      const g = appliquerStatut(f, cible, horloge());
      remplacer(g);
      etat.modifier({ erreur: null });
      await ecrireMaintenant(g);
      return verification;
    },

    async supprimerFiche(id) {
      await enregistreur.annuler(id);
      etat.modifier({ fiches: etat.lire().fiches.filter(f => f.id !== id), ficheOuverte: null });
      await depot.supprimerFiche(id);
    },

    async televerserVisuel(id, fichier) {
      if (!assets) return { ok: false, raison: 'Le téléversement n’est pas disponible dans cette vue.' };
      try {
        const resultat = await assets.upload(fichier);
        const type = fichier.type?.startsWith('video/') ? 'video' : 'image';
        modifierFiche(id, { visuel: resultat.id, visuel_type: type });
        return { ok: true, id: resultat.id, type };
      } catch (e) {
        return { ok: false, raison: `Échec du téléversement (${e?.code ?? 'erreur inconnue'}).` };
      }
    },

    changerVue: (vue, ancre) => changerAncre(vue, ancre ?? etat.lire().ancre),

    naviguer(delta) {
      const { vue, ancre } = etat.lire();
      const fz = fuseau();
      const suivante = vue === 'mois' ? ajouterMois(ancre, delta, fz) : vue === 'jour' ? ajouterJours(ancre, delta, fz) : ajouterJours(ancre, 7 * delta, fz);
      return changerAncre(vue, suivante);
    },

    allerAujourdhui: () => changerAncre(etat.lire().vue, horloge()),

    effacerErreur: () => etat.modifier({ erreur: null }),

    async importerProfil(texte) {
      let profil;
      try {
        profil = JSON.parse(texte);
      } catch (e) {
        return { ok: false, erreurs: [`Ce texte n’est pas du JSON valide : ${e.message}`] };
      }
      const resultat = await depot.importerProfil(profil, horloge());
      if (resultat.ok) etat.modifier({ vue: 'semaine' });
      return resultat;
    },
  };
}
```

- [ ] **Step 7 : créer les vues minimales et la vue Profil**

`src/interface/vue-semaine.js` :

```js
import { h } from './h.js';
export function vueSemaine() { return h('div', { class: 'semaine' }); }
```

`src/interface/vue-mois.js` :

```js
import { h } from './h.js';
export function vueMois() { return h('div', { class: 'mois' }); }
```

`src/interface/vue-jour.js` :

```js
import { h } from './h.js';
export function vueJour() { return h('div', { class: 'jour-vue' }); }
```

`src/interface/panneau-fiche.js` :

```js
import { h } from './h.js';
export function panneauFiche() { return h('aside', { class: 'panneau' }); }
```

`src/interface/vue-profil.js` (version complète dès maintenant) :

```js
import { h } from './h.js';

export function vueProfil({ profil }, actions) {
  const erreurs = h('ul', { class: 'erreurs', 'aria-live': 'polite' });
  const zone = h('textarea', { id: 'profil-json', rows: 12, placeholder: 'Colle ici le JSON du profil de marque.' });
  const fichier = h('input', {
    type: 'file', accept: '.json,application/json',
    onchange: async e => { const f = e.target.files?.[0]; if (f) zone.value = await f.text(); },
  });
  const importer = async () => {
    erreurs.replaceChildren();
    const r = await actions.importerProfil(zone.value);
    if (!r.ok) erreurs.replaceChildren(...r.erreurs.map(m => h('li', {}, m)));
  };

  return h('div', { class: 'profil' },
    profil ? resume(profil) : h('p', { class: 'aide' }, 'Aucun profil pour l’instant. Importe le profil de marque pour commencer.'),
    h('section', { class: 'import' },
      h('h2', {}, profil ? 'Importer une nouvelle version' : 'Importer le profil'),
      h('label', { class: 'champ' }, h('span', { class: 'champ-libelle' }, 'Fichier JSON'), fichier),
      h('label', { class: 'champ' }, h('span', { class: 'champ-libelle' }, 'Ou colle le JSON'), zone),
      h('button', { type: 'button', class: 'bouton-principal', onclick: importer }, 'Importer cette version'),
      erreurs));
}

function resume(profil) {
  const r = profil.regles_studio;
  const date = profil.importe_le ? new Date(profil.importe_le).toLocaleString('fr-FR', { timeZone: r.fuseau }) : '—';
  const jours = ['', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  return h('section', { class: 'resume' },
    h('h2', {}, `Profil, version ${profil.version}`),
    h('p', { class: 'aide' }, `Importé le ${date}. Fuseau : ${r.fuseau}.`),
    h('dl', { class: 'regles' },
      h('dt', {}, 'Piliers'), h('dd', {}, r.piliers.map(p => h('span', { class: 'puce-pilier', style: { '--pilier': p.couleur } }, p.nom))),
      h('dt', {}, 'Cadence'), h('dd', {}, `${r.cadence.reel} Reels, ${r.cadence.carrousel} carrousels, ${r.cadence.story_par_jour} story par jour`),
      h('dt', {}, 'Créneaux'), h('dd', {}, r.creneaux.map(c => `${c.jours.map(j => jours[j]).join(' ')} ${c.debut}–${c.fin}`).join(' · ')),
      h('dt', {}, "Appels à l'action"), h('dd', {}, `au plus ${Math.round(r.cta_ratio_max * 100)} % du feed`),
      h('dt', {}, 'Stories vers la porte'), h('dd', {}, `${r.stories_porte.min} à ${r.stories_porte.max} par semaine`)));
}
```

- [ ] **Step 8 : implémenter le rendu et le démarrage**

`src/interface/rendu.js` :

```js
import { h } from './h.js';
import { debutSemaine, ajouterJours } from '../logique/dates.js';
import { vueSemaine } from './vue-semaine.js';
import { vueMois } from './vue-mois.js';
import { vueJour } from './vue-jour.js';
import { vueProfil } from './vue-profil.js';
import { panneauFiche } from './panneau-fiche.js';

const LIBELLES_SAUVEGARDE = { ok: 'Enregistré', en_cours: 'Enregistrement…', erreur: 'Échec de l’enregistrement : nouvel essai à la prochaine modification' };

function libellePeriode(vue, ancre, fz) {
  const f = options => new Intl.DateTimeFormat('fr-FR', { timeZone: fz, ...options });
  if (vue === 'mois') return f({ month: 'long', year: 'numeric' }).format(new Date(ancre));
  if (vue === 'jour') return f({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ancre));
  const debut = debutSemaine(ancre, fz);
  const fin = ajouterJours(debut, 6, fz);
  return `${f({ day: 'numeric', month: 'short' }).format(new Date(debut))} – ${f({ day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(fin))}`;
}

function barre(e, actions) {
  const aProfil = !!e.profil;
  const onglet = (cle, libelle) => h('button', {
    type: 'button', class: 'onglet', 'aria-current': e.vue === cle ? 'page' : null,
    disabled: !aProfil && cle !== 'profil', onclick: () => actions.changerVue(cle),
  }, libelle);
  const elements = [
    h('h1', { class: 'titre' }, 'Studio'),
    h('nav', { class: 'onglets', 'aria-label': 'Vues' }, onglet('semaine', 'Semaine'), onglet('mois', 'Mois'), onglet('jour', 'Jour'), onglet('profil', 'Profil')),
  ];
  if (aProfil && e.vue !== 'profil') {
    elements.push(h('div', { class: 'periode' },
      h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Période précédente', onclick: () => actions.naviguer(-1) }, '‹'),
      h('button', { type: 'button', class: 'bouton-secondaire', onclick: () => actions.allerAujourdhui() }, "Aujourd'hui"),
      h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Période suivante', onclick: () => actions.naviguer(1) }, '›'),
      h('span', { class: 'periode-libelle' }, libellePeriode(e.vue, e.ancre, e.profil.regles_studio.fuseau))));
  }
  elements.push(h('span', { class: `sauvegarde sauvegarde-${e.sauvegarde}`, role: 'status' }, LIBELLES_SAUVEGARDE[e.sauvegarde]));
  return elements;
}

function contenuVue(e, actions) {
  if (!e.profil || e.vue === 'profil') return vueProfil(e, actions);
  if (e.vue === 'mois') return vueMois(e, actions);
  if (e.vue === 'jour') return vueJour(e, actions);
  return vueSemaine(e, actions);
}

export function creerRendu(racine, actions, capacites) {
  const tete = h('header', { class: 'barre' });
  const zoneErreur = h('div', { class: 'zone-erreur' });
  const vue = h('main', { class: 'vue' });
  const panneau = h('div', { class: 'zone-panneau' });
  racine.replaceChildren(tete, zoneErreur, h('div', { class: 'corps' }, vue, panneau));
  let memo = {};

  return function rendre(e) {
    if (e.profil === undefined) {
      vue.replaceChildren(h('p', { class: 'aide' }, 'Chargement du studio…'));
      return;
    }
    tete.replaceChildren(...barre(e, actions));
    zoneErreur.replaceChildren(e.erreur
      ? h('p', { class: 'erreur-bandeau', role: 'alert' }, e.erreur, ' ', h('button', { type: 'button', class: 'bouton-lien', onclick: () => actions.effacerErreur() }, 'Fermer'))
      : '');
    if (memo.profil !== e.profil || memo.fiches !== e.fiches || memo.vue !== e.vue || memo.ancre !== e.ancre) {
      vue.replaceChildren(contenuVue(e, actions));
    }
    const ouverte = e.profil && e.ficheOuverte ? e.fiches.find(f => f.id === e.ficheOuverte) : null;
    const panneauChange = memo.ficheOuverte !== e.ficheOuverte || memo.profil !== e.profil || (!!ouverte !== memo.panneauAffiche);
    if (panneauChange) panneau.replaceChildren(ouverte ? panneauFiche(ouverte, e.profil, actions, capacites) : '');
    racine.classList.toggle('avec-panneau', !!ouverte);
    memo = { profil: e.profil, fiches: e.fiches, vue: e.vue, ancre: e.ancre, ficheOuverte: e.ficheOuverte, panneauAffiche: !!ouverte };
  };
}
```

`src/interface/app.js` :

```js
import { h } from './h.js';
import { creerEtat } from './etat.js';
import { creerControleur, plageDeVue, fusionnerInstantane } from './controleur.js';
import { creerRendu } from './rendu.js';
import { creerDepot } from '../donnees/depot.js';
import { creerEnregistreur } from '../donnees/enregistreur.js';

function messageErreurBase(e) {
  if (e?.code === 'revoked') return 'L’accès au studio a été retiré pour cette vue.';
  if (e?.code === 'quota_exceeded') return 'La base du studio est pleine : supprime d’anciennes fiches avant d’en créer d’autres.';
  return 'La base du studio ne répond pas. Recharge la page dans un instant.';
}

export async function demarrer(racine, claude, { horloge = () => new Date().toISOString(), delaiEnregistrement = 600 } = {}) {
  racine.replaceChildren(h('p', { class: 'aide' }, 'Chargement du studio…'));
  const db = (await claude?.use?.('db')) ?? null;
  if (!db) {
    racine.replaceChildren(h('div', { class: 'indisponible' },
      h('h1', {}, 'Studio Contenu'),
      h('p', {}, 'La base du studio n’est pas accessible depuis cette vue. Ouvre le studio sur claude.ai avec un compte qui y a accès.')));
    return null;
  }
  const assets = (await claude.use('assets')) ?? null;
  const depot = creerDepot(db);
  const etat = creerEtat({ profil: undefined, fiches: [], vue: 'semaine', ancre: horloge(), ficheOuverte: null, erreur: null, sauvegarde: 'ok' });
  const enregistreur = creerEnregistreur(
    async fiche => {
      etat.modifier({ sauvegarde: 'en_cours' });
      await depot.enregistrerFiche(fiche);
      etat.modifier({ sauvegarde: 'ok' });
    },
    delaiEnregistrement,
    () => etat.modifier({ sauvegarde: 'erreur' }),
  );
  const actions = creerControleur({ etat, depot, enregistreur, assets, horloge });
  const rendre = creerRendu(racine, actions, { assets: !!assets });

  let arreterFiches = null;
  let plageCourante = '';
  etat.abonner(e => {
    if (e.profil) {
      const [debut, fin] = plageDeVue(e.vue, e.ancre, e.profil.regles_studio.fuseau);
      if (`${debut}|${fin}` !== plageCourante) {
        plageCourante = `${debut}|${fin}`;
        arreterFiches?.();
        arreterFiches = depot.ecouterFiches(debut, fin,
          recues => etat.modifier({ fiches: fusionnerInstantane(recues, etat.lire().fiches, enregistreur.estEnAttente) }),
          err => etat.modifier({ erreur: messageErreurBase(err) }));
      }
    }
    rendre(etat.lire());
  });

  depot.ecouterProfil(
    profil => etat.modifier({ profil, vue: profil ? etat.lire().vue : 'profil' }),
    err => etat.modifier({ erreur: messageErreurBase(err) }),
  );
  if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { enregistreur.viderTout(); });
  rendre(etat.lire());
  return { etat, actions };
}
```

`src/interface/main.js` (remplace la version provisoire) :

```js
import { demarrer } from './app.js';

demarrer(document.getElementById('app'), window.claude);
```

- [ ] **Step 9 : ajouter les styles des composants**

Ajouter à la fin de `src/interface/styles.css` :

```css
/* Barre et zones */
.barre { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; padding-block: 8px 12px; border-bottom: 1px solid var(--trait); }
.titre { font-size: 20px; font-weight: 700; margin: 0; letter-spacing: -0.01em; }
.onglets { display: flex; gap: 4px; }
.onglet { background: none; border: 0; padding: 6px 10px; border-radius: var(--rayon); cursor: pointer; color: var(--texte-2); font-weight: 600; }
.onglet[aria-current="page"] { background: var(--surface-2); color: var(--texte); }
.onglet:disabled { opacity: .45; cursor: not-allowed; }
.periode { display: flex; align-items: center; gap: 6px; }
.periode-libelle { font-weight: 600; margin-left: 6px; }
.sauvegarde { margin-left: auto; font-size: 13px; color: var(--texte-2); }
.sauvegarde-erreur { color: var(--rouge); }
.corps { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; padding-top: 12px; }
#app.avec-panneau .corps { grid-template-columns: minmax(0, 1fr) minmax(320px, 400px); }
@media (max-width: 900px) { #app.avec-panneau .corps { grid-template-columns: minmax(0, 1fr); } }
.erreur-bandeau { background: color-mix(in srgb, var(--rouge) 12%, var(--surface)); border: 1px solid var(--rouge); border-radius: var(--rayon); padding: 8px 12px; margin: 12px 0 0; }
.indisponible { max-width: 560px; padding-block: 48px; }
.aide { color: var(--texte-2); margin: 0; }

/* Boutons */
.bouton-principal, .bouton-secondaire, .bouton-danger, .bouton-icone { border-radius: var(--rayon); padding: 6px 12px; cursor: pointer; border: 1px solid var(--trait); background: var(--surface); }
.bouton-principal { background: var(--accent); color: var(--accent-texte); border-color: var(--accent); font-weight: 600; }
.bouton-danger { background: var(--rouge); color: #fff; border-color: var(--rouge); }
.bouton-icone { padding: 4px 10px; font-size: 18px; line-height: 1; }
.bouton-lien { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; text-decoration: underline; }

/* Bandeau de contrôle */
.bandeau { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.pastille { display: inline-flex; align-items: center; gap: 8px; padding: 4px 10px; border-radius: 999px; background: var(--surface); border: 1px solid var(--trait); font-size: 13px; }
.pastille::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--etat); }
.pastille-vert { --etat: var(--vert); } .pastille-orange { --etat: var(--orange); } .pastille-rouge { --etat: var(--rouge); }
.pastille-valeur { font-family: var(--mono); font-variant-numeric: tabular-nums; }

/* Semaine */
.colonnes { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
@media (max-width: 700px) { .colonnes { grid-template-columns: minmax(0, 1fr); } }
.jour { background: var(--surface-2); border-radius: var(--rayon); padding: 8px; display: flex; flex-direction: column; gap: 6px; min-height: 180px; }
.jour.survol { outline: 2px dashed var(--accent); }
.jour-titre { font-size: 13px; font-weight: 600; margin: 0 0 2px; text-transform: capitalize; color: var(--texte-2); }
.carte { background: var(--surface); border: 1px solid var(--trait); border-left: 4px solid var(--pilier); border-radius: 6px; padding: 6px 8px; cursor: grab; display: grid; gap: 4px; }
.carte.statut-publie { opacity: .7; }
.carte-tete, .carte-pied { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 12px; color: var(--texte-2); }
.format { font-weight: 600; color: var(--texte); }
.heure { font-family: var(--mono); }
.carte-accroche { margin: 0; font-size: 13px; overflow-wrap: anywhere; }
.badge { font-family: var(--mono); font-size: 12px; padding: 1px 6px; border-radius: 4px; background: var(--surface-2); display: inline-flex; align-items: center; gap: 4px; }
.badge-bloque { background: color-mix(in srgb, var(--rouge) 18%, var(--surface)); color: var(--rouge); }
.badge .point { width: 6px; height: 6px; border-radius: 50%; background: var(--orange); }
.creneau-vide, .ajouter { border: 1px dashed var(--trait); background: none; border-radius: 6px; padding: 6px; font-size: 12px; color: var(--texte-2); cursor: pointer; text-align: left; }
.ajouter { border-color: transparent; }

/* Mois */
.mois-entetes, .mois-semaine { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.mois-entetes { font-size: 12px; color: var(--texte-2); margin-bottom: 4px; }
.mois-semaine { margin-bottom: 4px; }
.mois-jour { background: var(--surface); border: 1px solid var(--trait); border-radius: 6px; min-height: 72px; padding: 6px; text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 6px; }
.mois-jour.hors-mois { opacity: .45; }
.mois-num { font-family: var(--mono); font-size: 12px; }
.points { display: flex; flex-wrap: wrap; gap: 3px; }
.point-format { width: 8px; height: 8px; border-radius: 50%; }
.format-reel { background: var(--reel); } .format-carrousel { background: var(--carrousel); } .format-story { background: var(--story); } .format-post { background: var(--post); }

/* Jour */
.frise { list-style: none; margin: 0 0 12px; padding: 0; display: grid; gap: 8px; max-width: 640px; }
.frise-ligne { display: grid; grid-template-columns: 56px minmax(0, 1fr); gap: 12px; align-items: start; }
.frise-heure { font-family: var(--mono); color: var(--texte-2); padding-top: 6px; }

/* Panneau de fiche */
.panneau { background: var(--surface); border: 1px solid var(--trait); border-radius: var(--rayon); padding: 12px 16px 16px; display: grid; gap: 14px; align-self: start; position: sticky; top: env(safe-area-inset-top, 0px); max-height: 100vh; overflow-y: auto; }
.panneau-tete { display: flex; justify-content: space-between; align-items: center; }
.panneau-tete h2 { margin: 0; font-size: 18px; }
.fermer { background: none; border: 0; font-size: 22px; cursor: pointer; color: var(--texte-2); }
.statuts { display: flex; flex-wrap: wrap; gap: 4px; }
.statut-bouton { border: 1px solid var(--trait); background: var(--surface); border-radius: 999px; padding: 3px 10px; font-size: 13px; cursor: pointer; }
.statut-bouton.actif { background: var(--texte); color: var(--fond); border-color: var(--texte); }
.grille-champs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.champ { display: grid; gap: 4px; }
.champ-libelle { font-size: 12px; font-weight: 600; color: var(--texte-2); text-transform: uppercase; letter-spacing: .04em; }
.champ input, .champ select, .champ textarea { border: 1px solid var(--trait); background: var(--fond); border-radius: 6px; padding: 6px 8px; width: 100%; box-sizing: border-box; }
.cases { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 12px; font-size: 14px; }
.case { display: inline-flex; gap: 6px; align-items: center; }
.textes { display: grid; gap: 10px; }
.zone-visuel { border: 1px dashed var(--trait); border-radius: var(--rayon); padding: 10px; display: grid; gap: 8px; justify-items: start; }
.zone-visuel input[type="file"] { display: block; margin-top: 6px; }
.apercu { max-width: 100%; max-height: 240px; border-radius: 6px; }
.score h3 { margin: 0 0 4px; font-size: 15px; }
.score ul { margin: 0; padding-left: 18px; font-size: 14px; }
.panneau-message { margin: 0; font-size: 14px; color: var(--texte-2); min-height: 1.2em; }
.secours-copie { width: 100%; margin-top: 6px; }
.suppression { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 14px; }

/* Profil */
.profil { display: grid; gap: 24px; max-width: 720px; }
.resume h2, .import h2 { margin: 0 0 6px; font-size: 18px; }
.regles { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 16px; margin: 12px 0 0; }
.regles dt { font-weight: 600; color: var(--texte-2); }
.regles dd { margin: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.puce-pilier { border-left: 4px solid var(--pilier); padding: 1px 8px; background: var(--surface-2); border-radius: 4px; }
.import { display: grid; gap: 10px; }
.erreurs { color: var(--rouge); margin: 0; padding-left: 18px; }
```

- [ ] **Step 10 : lancer tous les tests**

Run : `npm test`
Expected : PASS (tous les fichiers, y compris `tests/build.test.js`).

- [ ] **Step 11 : commit**

```bash
git add src/interface tests/interface
git commit -m "Interface : état, contrôleur, démarrage, vue Profil et styles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9 : vue Semaine (bandeau, cartes, créneaux, glisser-déposer)

**Files:**
- Create : `src/interface/carte.js`, `tests/interface/vue-semaine.test.js`
- Modify : `src/interface/vue-semaine.js`

**Interfaces:**
- Consumes : `controlerSemaine`, `fichesDeLaSemaine` (Task 5), `creneauxLibres` (Task 6), les dates (Task 3), `LIBELLES_FORMAT`, `LIBELLES_STATUT` et `aReevaluer` (Task 4), et les actions `ouvrirFiche`, `creerFiche`, `deplacerFiche` (Task 8).
- Produces : `carte(fiche, regles, actions): HTMLElement`, `badgeScore(fiche): HTMLElement` et `bandeau(pastilles): HTMLElement`, tous exportés par `carte.js`.

- [ ] **Step 1 : écrire les tests**

`tests/interface/vue-semaine.test.js` :

```js
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { nouvelleFiche, empreinte } from '../../src/logique/fiche.js';
import { vueSemaine } from '../../src/interface/vue-semaine.js';

const ANCRE = '2026-09-30T10:00:00.000Z';
const actionsFactices = () => ({ ouvrirFiche: vi.fn(), creerFiche: vi.fn(), deplacerFiche: vi.fn() });
const reel = (id, date_heure, extra = {}) => ({ ...nouvelleFiche({ id, format: 'reel', date_heure, pilier: 'nuit', maintenant: ANCRE }), ...extra });

describe('vueSemaine', () => {
  it('affiche le bandeau et 7 colonnes', () => {
    const el = vueSemaine({ profil: fictif, fiches: [], ancre: ANCRE }, actionsFactices());
    expect(el.querySelectorAll('.bandeau .pastille')).toHaveLength(8);
    expect([...el.querySelectorAll('.jour')].map(j => j.dataset.jour)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  });

  it('place une carte dans la bonne colonne et l’ouvre au clic', () => {
    const actions = actionsFactices();
    const el = vueSemaine({ profil: fictif, fiches: [reel('a', '2026-10-01T16:00:00.000Z', { accroche: 'Ma phrase' })], ancre: ANCRE }, actions);
    const colonne = el.querySelector('[data-jour="2026-10-01"]');
    const c = colonne.querySelector('.carte');
    expect(c.textContent).toContain('Ma phrase');
    expect(c.textContent).toContain('18:00');
    expect(c.style.getPropertyValue('--pilier')).toBe('#0b8574');
    c.click();
    expect(actions.ouvrirFiche).toHaveBeenCalledWith('a');
  });

  it('propose les créneaux vides et crée la fiche correspondante', () => {
    const actions = actionsFactices();
    const el = vueSemaine({ profil: fictif, fiches: [], ancre: ANCRE }, actions);
    const vides = el.querySelectorAll('.creneau-vide');
    expect(vides).toHaveLength(3);
    expect(vides[0].textContent).toBe('+ Reel · 12:00');
    vides[0].click();
    expect(actions.creerFiche).toHaveBeenCalledWith({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
  });

  it('déplace une carte déposée sur un autre jour', () => {
    const actions = actionsFactices();
    const el = vueSemaine({ profil: fictif, fiches: [reel('a', '2026-09-28T10:00:00.000Z')], ancre: ANCRE }, actions);
    const cible = el.querySelector('[data-jour="2026-10-02"]');
    const evt = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(evt, 'dataTransfer', { value: { getData: () => 'a' } });
    cible.dispatchEvent(evt);
    expect(actions.deplacerFiche).toHaveBeenCalledWith('a', '2026-10-01T22:00:00.000Z');
  });

  it('montre le cadenas et le point à réévaluer sur le badge', () => {
    const f = reel('a', '2026-09-28T10:00:00.000Z', { caption: 'x' });
    const bloquee = { ...f, score: { total: 38, conformite: { etat: 'rouge', causes: ['lien'] }, empreinte: empreinte(f) } };
    const perimee = { ...f, id: 'b', caption: 'changée', score: { total: 70, conformite: { etat: 'vert', causes: [] }, empreinte: empreinte(f) } };
    const el = vueSemaine({ profil: fictif, fiches: [bloquee, perimee], ancre: ANCRE }, actionsFactices());
    const badges = el.querySelectorAll('.badge');
    expect(badges[0].classList.contains('badge-bloque')).toBe(true);
    expect(badges[0].querySelector('svg')).not.toBeNull();
    expect(badges[1].querySelector('.point')).not.toBeNull();
  });
});
```

- [ ] **Step 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run tests/interface/vue-semaine.test.js`
Expected : FAIL (colonnes et cartes absentes).

- [ ] **Step 3 : implémenter la carte, le badge et le bandeau**

`src/interface/carte.js` :

```js
import { h } from './h.js';
import { LIBELLES_FORMAT, LIBELLES_STATUT, aReevaluer } from '../logique/fiche.js';
import { heureLocale } from '../logique/dates.js';

const LIBELLES_ETAT = { vert: 'conforme à la cible', orange: 'à surveiller', rouge: 'hors cible' };

function cadenas() {
  const span = h('span', { 'aria-hidden': 'true' });
  span.innerHTML = '<svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><rect x="0" y="5" width="10" height="7" rx="1.5"/><path d="M2.5 5V3.5a2.5 2.5 0 0 1 5 0V5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
  return span;
}

export function badgeScore(f) {
  if (!f.score) return h('span', { class: 'badge', title: 'Pas encore évaluée' }, '—');
  const bloquee = f.score.conformite?.etat === 'rouge';
  const perimee = aReevaluer(f);
  const titre = bloquee ? 'Conformité au rouge' : perimee ? 'À réévaluer' : 'Score';
  return h('span', { class: bloquee ? 'badge badge-bloque' : 'badge', title: titre },
    bloquee ? cadenas() : null,
    String(f.score.total),
    perimee ? h('span', { class: 'point', 'aria-label': 'à réévaluer' }) : null);
}

export function carte(f, regles, actions) {
  const pilier = regles.piliers.find(p => p.cle === f.pilier);
  return h('article', {
    class: `carte statut-${f.statut}`, draggable: true, tabindex: '0', 'data-id': f.id,
    style: { '--pilier': pilier?.couleur ?? 'var(--trait)' },
    ondragstart: e => e.dataTransfer?.setData('text/plain', f.id),
    onclick: () => actions.ouvrirFiche(f.id),
    onkeydown: e => { if (e.key === 'Enter') actions.ouvrirFiche(f.id); },
  },
  h('div', { class: 'carte-tete' },
    h('span', { class: 'format' }, LIBELLES_FORMAT[f.format]),
    h('span', { class: 'heure' }, heureLocale(f.date_heure, regles.fuseau))),
  h('p', { class: 'carte-accroche' }, f.accroche || 'Sans accroche'),
  h('div', { class: 'carte-pied' },
    h('span', {}, LIBELLES_STATUT[f.statut]),
    badgeScore(f)));
}

export function bandeau(pastilles) {
  return h('ul', { class: 'bandeau', 'aria-label': 'Contrôle de la semaine' },
    pastilles.map(p => h('li', { class: `pastille pastille-${p.etat}`, title: LIBELLES_ETAT[p.etat] },
      h('span', {}, p.libelle),
      h('span', { class: 'pastille-valeur' }, p.valeur))));
}
```

- [ ] **Step 4 : implémenter la vue Semaine**

`src/interface/vue-semaine.js` (remplace la version minimale) :

```js
import { h } from './h.js';
import { carte, bandeau } from './carte.js';
import { controlerSemaine, fichesDeLaSemaine } from '../logique/controle.js';
import { creneauxLibres } from '../logique/creneaux.js';
import { debutSemaine, joursDeLaSemaine, cleJour, heureLocale, libelleJour, depuisSaisieLocale } from '../logique/dates.js';
import { LIBELLES_FORMAT } from '../logique/fiche.js';

export function vueSemaine({ profil, fiches, ancre }, actions) {
  const r = profil.regles_studio;
  const debut = debutSemaine(ancre, r.fuseau);
  const semaine = fichesDeLaSemaine(fiches, debut, r.fuseau);
  const libres = creneauxLibres(fiches, r, debut);
  return h('div', { class: 'semaine' },
    bandeau(controlerSemaine(fiches, r, debut)),
    h('div', { class: 'colonnes' }, joursDeLaSemaine(debut, r.fuseau).map(jour => colonne(jour, semaine, libres, r, actions))));
}

function colonne(jour, semaine, libres, r, actions) {
  const fz = r.fuseau;
  const cle = cleJour(jour, fz);
  const duJour = semaine.filter(f => cleJour(f.date_heure, fz) === cle).sort((a, b) => a.date_heure.localeCompare(b.date_heure));
  const vides = libres.filter(c => cleJour(c.date_heure, fz) === cle);
  const el = h('section', {
    class: 'jour', 'data-jour': cle,
    ondragover: e => { e.preventDefault(); el.classList.add('survol'); },
    ondragleave: () => el.classList.remove('survol'),
    ondrop: e => {
      e.preventDefault();
      el.classList.remove('survol');
      const id = e.dataTransfer?.getData('text/plain');
      if (id) actions.deplacerFiche(id, jour);
    },
  },
  h('h3', { class: 'jour-titre' }, libelleJour(jour, fz)),
  duJour.map(f => carte(f, r, actions)),
  vides.map(c => h('button', {
    type: 'button', class: 'creneau-vide',
    onclick: () => actions.creerFiche({ format: c.format, date_heure: c.date_heure }),
  }, `+ ${LIBELLES_FORMAT[c.format]} · ${heureLocale(c.date_heure, fz)}`)),
  h('button', {
    type: 'button', class: 'ajouter',
    onclick: () => actions.creerFiche({ format: 'reel', date_heure: depuisSaisieLocale(cle, '12:00', fz) }),
  }, '+ Ajouter'));
  return el;
}
```

- [ ] **Step 5 : lancer les tests**

Run : `npx vitest run tests/interface/vue-semaine.test.js`
Expected : PASS.

- [ ] **Step 6 : commit**

```bash
git add src/interface/carte.js src/interface/vue-semaine.js tests/interface/vue-semaine.test.js
git commit -m "Vue Semaine : bandeau, cartes, créneaux libres, glisser-déposer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10 : panneau de fiche

**Files:**
- Create : `tests/interface/panneau-fiche.test.js`
- Modify : `src/interface/panneau-fiche.js`

**Interfaces:**
- Consumes : les actions `modifierFiche`, `changerStatut`, `televerserVisuel`, `supprimerFiche`, `fermerPanneau` (Task 8) ; `FORMATS`, `LIBELLES_FORMAT`, `STATUTS`, `LIBELLES_STATUT`, `analyserHashtags`, `formaterHashtags`, `texteAPublier`, `aReevaluer` (Task 4) ; `cleJour`, `heureLocale`, `depuisSaisieLocale` (Task 3).
- Produces : `panneauFiche(fiche, profil, actions, capacites: { assets: boolean }): HTMLElement`. Le panneau garde sa propre copie de travail (`brouillon`) : un nouvel instantané de la base ne l'écrase pas pendant la saisie.

- [ ] **Step 1 : écrire les tests**

`tests/interface/panneau-fiche.test.js` :

```js
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { nouvelleFiche } from '../../src/logique/fiche.js';
import { panneauFiche } from '../../src/interface/panneau-fiche.js';

const fiche = (extra = {}) => ({ ...nouvelleFiche({ id: 'f1', format: 'reel', date_heure: '2026-09-28T10:00:00.000Z', pilier: 'socio', maintenant: 'x' }), ...extra });
const actionsFactices = () => ({
  modifierFiche: vi.fn(), fermerPanneau: vi.fn(), supprimerFiche: vi.fn(),
  changerStatut: vi.fn(async () => ({ ok: false, raison: 'Ajoute un visuel avant de valider.' })),
  televerserVisuel: vi.fn(async () => ({ ok: true, id: 'as1', type: 'image' })),
});
const saisir = (el, valeur, evenement = 'input') => { el.value = valeur; el.dispatchEvent(new Event(evenement, { bubbles: true })); };
const bouton = (racine, texte) => [...racine.querySelectorAll('button')].find(b => b.textContent === texte);

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(async () => {}) } });
});

describe('panneauFiche', () => {
  it('transmet chaque saisie', () => {
    const actions = actionsFactices();
    const p = panneauFiche(fiche(), fictif, actions, { assets: true });
    saisir(p.querySelector('textarea[name="accroche"]'), 'Nouvelle accroche');
    expect(actions.modifierFiche).toHaveBeenCalledWith('f1', { accroche: 'Nouvelle accroche' });
    saisir(p.querySelector('input[name="hashtags"]'), '#nuit socio', 'change');
    expect(actions.modifierFiche).toHaveBeenCalledWith('f1', { hashtags: ['nuit', 'socio'] });
  });

  it('convertit la date et l’heure locales en UTC', () => {
    const actions = actionsFactices();
    const p = panneauFiche(fiche(), fictif, actions, { assets: true });
    saisir(p.querySelector('input[type="time"]'), '18:30', 'change');
    expect(actions.modifierFiche).toHaveBeenCalledWith('f1', { date_heure: '2026-09-28T16:30:00.000Z' });
  });

  it('n’affiche « Mène à la porte » que pour une story', () => {
    const actions = actionsFactices();
    const p = panneauFiche(fiche(), fictif, actions, { assets: true });
    expect(p.textContent).not.toContain('Mène à la porte');
    saisir(p.querySelector('select[name="format"]'), 'story', 'change');
    expect(p.textContent).toContain('Mène à la porte');
  });

  it('affiche la raison d’un changement de statut refusé', async () => {
    const actions = actionsFactices();
    const p = panneauFiche(fiche(), fictif, actions, { assets: true });
    bouton(p, 'Validé').click();
    await vi.waitFor(() => expect(p.querySelector('.panneau-message').textContent).toBe('Ajoute un visuel avant de valider.'));
    expect(actions.changerStatut).toHaveBeenCalledWith('f1', 'valide');
  });

  it('copie la caption et les hashtags', async () => {
    const p = panneauFiche(fiche({ caption: 'Bonsoir.', hashtags: ['nuit'] }), fictif, actionsFactices(), { assets: true });
    bouton(p, 'Copier la caption et les hashtags').click();
    await vi.waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Bonsoir.\n\n#nuit'));
  });

  it('demande confirmation avant de supprimer', () => {
    const actions = actionsFactices();
    const p = panneauFiche(fiche(), fictif, actions, { assets: true });
    bouton(p, 'Supprimer la fiche').click();
    expect(actions.supprimerFiche).not.toHaveBeenCalled();
    bouton(p, 'Oui, supprimer').click();
    expect(actions.supprimerFiche).toHaveBeenCalledWith('f1');
  });

  it('explique l’absence de téléversement', () => {
    const p = panneauFiche(fiche(), fictif, actionsFactices(), { assets: false });
    expect(p.textContent).toContain('Le téléversement de visuels n’est pas disponible dans cette vue.');
    expect(p.querySelector('input[type="file"]')).toBeNull();
  });

  it('refuse un fichier qui n’est ni image ni vidéo', async () => {
    const actions = actionsFactices();
    const p = panneauFiche(fiche(), fictif, actions, { assets: true });
    const zone = p.querySelector('.zone-visuel');
    const evt = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(evt, 'dataTransfer', { value: { files: [{ type: 'application/pdf' }] } });
    zone.dispatchEvent(evt);
    await vi.waitFor(() => expect(p.querySelector('.panneau-message').textContent).toBe('Choisis une image ou une vidéo.'));
    expect(actions.televerserVisuel).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run tests/interface/panneau-fiche.test.js`
Expected : FAIL (champs absents).

- [ ] **Step 3 : implémenter le panneau**

`src/interface/panneau-fiche.js` (remplace la version minimale) :

```js
import { h } from './h.js';
import {
  FORMATS, LIBELLES_FORMAT, STATUTS, LIBELLES_STATUT, analyserHashtags, formaterHashtags, texteAPublier, aReevaluer,
} from '../logique/fiche.js';
import { cleJour, heureLocale, depuisSaisieLocale } from '../logique/dates.js';

const ROLES = [['', '—'], ['engagement', 'Engagement'], ['cta', "Appel à l'action"], ['deadpan', 'Deadpan']];

export function panneauFiche(fiche, profil, actions, capacites) {
  const r = profil.regles_studio;
  const fz = r.fuseau;
  const id = fiche.id;
  let brouillon = { ...fiche };
  const racine = h('aside', { class: 'panneau', 'aria-label': 'Fiche contenu' });
  const message = h('p', { class: 'panneau-message', role: 'status' });
  const afficher = texte => { message.replaceChildren(texte ?? ''); };
  const changer = changements => {
    brouillon = { ...brouillon, ...changements };
    actions.modifierFiche(id, changements);
  };

  const champ = (libelle, controle) => h('label', { class: 'champ' }, h('span', { class: 'champ-libelle' }, libelle), controle);
  const selection = (nom, valeur, options, surChange) => h('select', { name: nom, onchange: e => surChange(e.target.value) },
    options.map(([v, t]) => h('option', { value: v, selected: v === (valeur ?? '') }, t)));
  const caseACocher = (libelle, cle) => h('label', { class: 'case' },
    h('input', { type: 'checkbox', name: cle, checked: !!brouillon[cle], onchange: e => changer({ [cle]: e.target.checked }) }),
    libelle);

  async function copier() {
    const texte = texteAPublier(brouillon);
    try {
      await navigator.clipboard.writeText(texte);
      afficher('Copié. Colle-le dans Meta Business Suite.');
    } catch {
      const secours = h('textarea', { class: 'secours-copie', readonly: true, rows: 5, value: texte });
      message.replaceChildren('La copie automatique est bloquée : sélectionne le texte ci-dessous.', secours);
      secours.select();
    }
  }

  async function envoyer(fichier) {
    if (!fichier) return;
    if (!/^(image|video)\//.test(fichier.type ?? '')) { afficher('Choisis une image ou une vidéo.'); return; }
    afficher('Téléversement…');
    const resultat = await actions.televerserVisuel(id, fichier);
    if (!resultat.ok) { afficher(resultat.raison); return; }
    brouillon = { ...brouillon, visuel: resultat.id, visuel_type: resultat.type };
    construire();
    afficher('Visuel ajouté.');
  }

  const sectionStatut = () => h('div', { class: 'statuts', role: 'group', 'aria-label': 'Statut' },
    STATUTS.map(s => h('button', {
      type: 'button', class: s === brouillon.statut ? 'statut-bouton actif' : 'statut-bouton', 'aria-pressed': String(s === brouillon.statut),
      onclick: async () => {
        const v = await actions.changerStatut(id, s);
        if (!v.ok) { afficher(v.raison); return; }
        brouillon = { ...brouillon, statut: s };
        construire();
        afficher('');
      },
    }, LIBELLES_STATUT[s])));

  const sectionType = () => h('div', { class: 'grille-champs' },
    champ('Format', selection('format', brouillon.format, FORMATS.map(f => [f, LIBELLES_FORMAT[f]]), v => {
      changer(v === 'story' ? { format: v } : { format: v, porte: false });
      construire();
    })),
    champ('Pilier', selection('pilier', brouillon.pilier, r.piliers.map(p => [p.cle, p.nom]), v => changer({ pilier: v }))),
    champ('Format validé', h('input', { type: 'text', name: 'format_valide', value: brouillon.format_valide, oninput: e => changer({ format_valide: e.target.value }) })),
    champ('Rôle de la caption', selection('role_caption', brouillon.role_caption, ROLES, v => changer({ role_caption: v || null }))),
    h('div', { class: 'cases' },
      caseACocher("Appel à l'action", 'cta'),
      caseACocher('Ragebait', 'ragebait'),
      brouillon.format === 'story' ? caseACocher('Mène à la porte', 'porte') : null));

  const sectionDate = () => {
    const date = h('input', { type: 'date', name: 'date', value: cleJour(brouillon.date_heure, fz), required: true });
    const heure = h('input', { type: 'time', name: 'heure', value: heureLocale(brouillon.date_heure, fz), required: true });
    const maj = () => { if (date.value && heure.value) changer({ date_heure: depuisSaisieLocale(date.value, heure.value, fz) }); };
    date.addEventListener('change', maj);
    heure.addEventListener('change', maj);
    return h('div', { class: 'grille-champs' }, champ('Date', date), champ(`Heure (${fz})`, heure));
  };

  const sectionVisuel = () => {
    if (!capacites.assets) return h('p', { class: 'aide' }, 'Le téléversement de visuels n’est pas disponible dans cette vue.');
    const source = brouillon.visuel ? `/_blob/${brouillon.visuel}` : null;
    const apercu = !source ? null : brouillon.visuel_type === 'video'
      ? h('video', { class: 'apercu', src: source, controls: true })
      : h('img', { class: 'apercu', src: source, alt: 'Visuel de la fiche' });
    return h('div', {
      class: 'zone-visuel',
      ondragover: e => e.preventDefault(),
      ondrop: e => { e.preventDefault(); e.stopPropagation(); envoyer(e.dataTransfer?.files?.[0]); },
    },
    apercu,
    h('label', { class: 'bouton-secondaire' },
      brouillon.visuel ? 'Remplacer le visuel' : 'Glisse un visuel ici ou choisis un fichier',
      h('input', { type: 'file', accept: 'image/*,video/*', onchange: e => envoyer(e.target.files?.[0]) })));
  };

  const sectionTexte = () => h('div', { class: 'textes' },
    champ('Accroche', h('textarea', { name: 'accroche', rows: 2, value: brouillon.accroche, oninput: e => changer({ accroche: e.target.value }) })),
    champ('Caption', h('textarea', { name: 'caption', rows: 6, value: brouillon.caption, oninput: e => changer({ caption: e.target.value }) })),
    champ('Hashtags', h('input', { type: 'text', name: 'hashtags', placeholder: '#mot #autre', value: formaterHashtags(brouillon.hashtags), onchange: e => changer({ hashtags: analyserHashtags(e.target.value) }) })),
    champ('Géotag (ville)', h('input', { type: 'text', name: 'geotag', value: brouillon.geotag, oninput: e => changer({ geotag: e.target.value }) })),
    h('button', { type: 'button', class: 'bouton-principal', onclick: copier }, 'Copier la caption et les hashtags'));

  const sectionScore = () => {
    const s = brouillon.score;
    if (!s) return h('section', { class: 'score' }, h('h3', {}, 'Score'), h('p', { class: 'aide' }, 'Pas encore évaluée.'));
    return h('section', { class: 'score' },
      h('h3', {}, `Score : ${s.total}/100`),
      aReevaluer(brouillon) ? h('p', { class: 'aide' }, 'La fiche a changé depuis son évaluation.') : null,
      h('ul', {}, (s.criteres ?? []).map(c => h('li', {}, `${c.nom} : ${c.points}/${c.max}. ${c.phrase ?? ''}`))));
  };

  const sectionSuppression = () => {
    const zone = h('div', { class: 'suppression' });
    const initial = () => h('button', { type: 'button', class: 'bouton-lien', onclick: demander }, 'Supprimer la fiche');
    function demander() {
      zone.replaceChildren(
        h('span', {}, 'Supprimer définitivement cette fiche ?'),
        h('button', { type: 'button', class: 'bouton-danger', onclick: () => actions.supprimerFiche(id) }, 'Oui, supprimer'),
        h('button', { type: 'button', class: 'bouton-secondaire', onclick: () => zone.replaceChildren(initial()) }, 'Annuler'));
    }
    zone.append(initial());
    return zone;
  };

  function construire() {
    racine.replaceChildren(
      h('header', { class: 'panneau-tete' },
        h('h2', {}, LIBELLES_FORMAT[brouillon.format]),
        h('button', { type: 'button', class: 'fermer', 'aria-label': 'Fermer la fiche', onclick: () => actions.fermerPanneau() }, '×')),
      sectionStatut(), sectionType(), sectionDate(), sectionVisuel(), sectionTexte(), sectionScore(), message, sectionSuppression());
  }

  construire();
  return racine;
}
```

- [ ] **Step 4 : lancer les tests**

Run : `npx vitest run tests/interface/panneau-fiche.test.js`
Expected : PASS.

- [ ] **Step 5 : commit**

```bash
git add src/interface/panneau-fiche.js tests/interface/panneau-fiche.test.js
git commit -m "Panneau de fiche : champs, visuel, statut, copie, suppression

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11 : vues Mois et Jour

**Files:**
- Create : `tests/interface/vue-mois-jour.test.js`
- Modify : `src/interface/vue-mois.js`, `src/interface/vue-jour.js`

**Interfaces:**
- Consumes : `semainesDuMois`, `joursDeLaSemaine`, `debutMois`, `partiesLocales`, `cleJour`, `heureLocale`, `depuisSaisieLocale` (Task 3), `carte` (Task 9), les actions `changerVue`, `creerFiche`, `ouvrirFiche` (Task 8).
- Produces : `vueMois(etat, actions)` et `vueJour(etat, actions)`.

- [ ] **Step 1 : écrire les tests**

`tests/interface/vue-mois-jour.test.js` :

```js
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { nouvelleFiche } from '../../src/logique/fiche.js';
import { vueMois } from '../../src/interface/vue-mois.js';
import { vueJour } from '../../src/interface/vue-jour.js';

const f = (id, format, date_heure, accroche = '') => ({ ...nouvelleFiche({ id, format, date_heure, pilier: 'socio', maintenant: 'x' }), accroche });
const actionsFactices = () => ({ changerVue: vi.fn(), creerFiche: vi.fn(), ouvrirFiche: vi.fn() });

describe('vueMois', () => {
  it('affiche 5 semaines pour octobre 2026, avec des points par format', () => {
    const actions = actionsFactices();
    const el = vueMois({ profil: fictif, fiches: [f('a', 'reel', '2026-10-01T10:00:00.000Z'), f('b', 'story', '2026-10-01T17:00:00.000Z')], ancre: '2026-10-15T10:00:00.000Z' }, actions);
    expect(el.querySelectorAll('.mois-semaine')).toHaveLength(5);
    const jours = el.querySelectorAll('.mois-jour');
    expect(jours).toHaveLength(35);
    expect(jours[0].classList.contains('hors-mois')).toBe(true);
    const premierOctobre = jours[3];
    expect(premierOctobre.querySelector('.mois-num').textContent).toBe('1');
    expect([...premierOctobre.querySelectorAll('.point-format')].map(p => p.className)).toEqual(['point-format format-reel', 'point-format format-story']);
    premierOctobre.click();
    expect(actions.changerVue).toHaveBeenCalledWith('jour', '2026-09-30T22:00:00.000Z');
  });
});

describe('vueJour', () => {
  it('liste les contenus du jour dans l’ordre des heures', () => {
    const el = vueJour({ profil: fictif, fiches: [f('b', 'story', '2026-09-28T17:00:00.000Z', 'soir'), f('a', 'reel', '2026-09-28T10:00:00.000Z', 'midi'), f('c', 'reel', '2026-09-29T10:00:00.000Z', 'lendemain')], ancre: '2026-09-28T08:00:00.000Z' }, actionsFactices());
    expect([...el.querySelectorAll('.frise-heure')].map(x => x.textContent)).toEqual(['12:00', '19:00']);
    expect(el.textContent).not.toContain('lendemain');
  });
  it('indique un jour vide et permet d’ajouter', () => {
    const actions = actionsFactices();
    const el = vueJour({ profil: fictif, fiches: [], ancre: '2026-09-28T08:00:00.000Z' }, actions);
    expect(el.textContent).toContain('Rien de prévu ce jour-là.');
    el.querySelector('button').click();
    expect(actions.creerFiche).toHaveBeenCalledWith({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
  });
});
```

- [ ] **Step 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run tests/interface/vue-mois-jour.test.js`
Expected : FAIL.

- [ ] **Step 3 : implémenter**

`src/interface/vue-mois.js` (remplace la version minimale) :

```js
import { h } from './h.js';
import { semainesDuMois, joursDeLaSemaine, debutMois, partiesLocales, cleJour } from '../logique/dates.js';
import { LIBELLES_FORMAT } from '../logique/fiche.js';

const ENTETES = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

export function vueMois({ profil, fiches, ancre }, actions) {
  const fz = profil.regles_studio.fuseau;
  const moisCourant = partiesLocales(debutMois(ancre, fz), fz).mois;
  return h('div', { class: 'mois' },
    h('div', { class: 'mois-entetes', 'aria-hidden': 'true' }, ENTETES.map(j => h('span', {}, j))),
    semainesDuMois(ancre, fz).map(semaine => h('div', { class: 'mois-semaine' },
      joursDeLaSemaine(semaine, fz).map(jour => {
        const cle = cleJour(jour, fz);
        const p = partiesLocales(jour, fz);
        const duJour = fiches.filter(f => cleJour(f.date_heure, fz) === cle).sort((a, b) => a.date_heure.localeCompare(b.date_heure));
        return h('button', {
          type: 'button', class: p.mois === moisCourant ? 'mois-jour' : 'mois-jour hors-mois',
          'aria-label': `${cle}, ${duJour.length} contenu${duJour.length > 1 ? 's' : ''}`,
          onclick: () => actions.changerVue('jour', jour),
        },
        h('span', { class: 'mois-num' }, String(p.jour)),
        h('span', { class: 'points' }, duJour.map(f => h('span', {
          class: `point-format format-${f.format}`, title: `${LIBELLES_FORMAT[f.format]} · ${f.accroche || 'sans accroche'}`,
        }))));
      }))));
}
```

`src/interface/vue-jour.js` (remplace la version minimale) :

```js
import { h } from './h.js';
import { carte } from './carte.js';
import { cleJour, heureLocale, depuisSaisieLocale } from '../logique/dates.js';

export function vueJour({ profil, fiches, ancre }, actions) {
  const r = profil.regles_studio;
  const cle = cleJour(ancre, r.fuseau);
  const duJour = fiches.filter(f => cleJour(f.date_heure, r.fuseau) === cle).sort((a, b) => a.date_heure.localeCompare(b.date_heure));
  return h('div', { class: 'jour-vue' },
    duJour.length
      ? h('ol', { class: 'frise' }, duJour.map(f => h('li', { class: 'frise-ligne' },
        h('span', { class: 'frise-heure' }, heureLocale(f.date_heure, r.fuseau)),
        carte(f, r, actions))))
      : h('p', { class: 'aide' }, 'Rien de prévu ce jour-là.'),
    h('button', {
      type: 'button', class: 'bouton-secondaire',
      onclick: () => actions.creerFiche({ format: 'reel', date_heure: depuisSaisieLocale(cle, '12:00', r.fuseau) }),
    }, '+ Ajouter un contenu'));
}
```

- [ ] **Step 4 : lancer tous les tests et le build**

Run : `npm test`
Expected : PASS.
Run : `npm run build`
Expected : `dist/studio.html (… Ko)`.

- [ ] **Step 5 : commit**

```bash
git add src/interface/vue-mois.js src/interface/vue-jour.js tests/interface/vue-mois-jour.test.js
git commit -m "Vues Mois et Jour

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12 : publication du studio de test et vérification manuelle

Cette tâche est faite par Claude dans une session qui a l'outil `Artifact`, et non par un sous-agent sans cet outil.

**Files:**
- Create (non versionné) : `.studio.local.json`
- Modify : `README.md` (section Statut), `docs/superpowers/HANDOFF-brainstorming.md` (Reste à faire)

- [ ] **Step 1 : construire la page**

Run : `npm test && npm run build`
Expected : tous les tests PASS, puis `dist/studio.html (… Ko)`.

- [ ] **Step 2 : publier le studio de test**

Avant de publier, charger les skills `artifact-design` et `artifact-capabilities` (c'est une règle de l'outil Artifact). Publier ensuite avec l'outil `Artifact` :
- `file_path` : `dist/studio.html` ;
- `icon` : `calendar` ;
- `description` : « Studio de test : planification de contenus Instagram avec un profil fictif. » ;
- `capabilities` : `{"db": {}, "assets": {}}`.

Noter l'URL obtenue dans `.studio.local.json` (déjà ignoré par git) :

```json
{ "test": "https://claude.ai/artifact/<id>" }
```

- [ ] **Step 3 : vérifier la base après publication**

Avec l'outil `ArtifactData`, action `list` sur la collection `profil`, avec l'URL du studio de test.
Expected : la collection est vide (aucun profil).

- [ ] **Step 4 : dérouler la checklist sur la page publiée**

Ouvrir la page (`Artifact`, action `open`), puis vérifier dans l'ordre :

1. L'onglet Profil s'affiche seul, et les autres onglets sont désactivés.
2. Coller le contenu de `exemples/profil-fictif.json` et cliquer sur « Importer cette version ». La vue Semaine apparaît, avec le bandeau et 7 colonnes.
3. Cliquer sur un créneau « + Reel · 12:00 ». Le panneau s'ouvre et la carte apparaît dans la colonne.
4. Taper une accroche, fermer le panneau, recharger la page. L'accroche est toujours là.
5. Glisser la carte vers un autre jour. Elle garde son heure, et le bandeau se met à jour.
6. Cliquer sur « Validé ». Le message « Ajoute un visuel avant de valider. » s'affiche.
7. Glisser une image depuis le Finder dans la zone du visuel. L'aperçu s'affiche.
8. Remplir la caption et les hashtags, puis cliquer sur « Copier la caption et les hashtags ». Coller dans un éditeur : le texte est correct.
9. Onglet Mois : les points apparaissent. Cliquer sur un jour ouvre la vue Jour de ce jour.
10. Supprimer la fiche, avec la confirmation. Elle disparaît.
11. Vérifier les deux thèmes, clair et sombre. Vérifier aussi une largeur de téléphone (environ 400 px) : les colonnes s'empilent et il n'y a pas de défilement horizontal.

Puis, avec `ArtifactData` en action `list` sur `fiches` : la fiche supprimée est absente, et les fiches restantes n'ont pas de champ `id` dans leur corps.

- [ ] **Step 5 : corriger ce que la checklist révèle**

Pour chaque point qui échoue : écrire d'abord un test qui reproduit le problème (dans le fichier de test de la tâche concernée), corriger, relancer `npm test`, reconstruire, republier au **même** `file_path` (l'URL ne change pas), puis refaire le point de la checklist.

- [ ] **Step 6 : mettre à jour le statut du projet**

Dans `README.md`, section « Statut », remplacer les lignes « Spec écrite et validée », « Plan d'implémentation » et « Construction de la phase 1 » par :

```markdown
- [x] Spec écrite et validée
- [x] Plan 1 : fondations et calendrier (studio de test publié)
- [ ] Plan 2 : évaluation par Claude et studio réel
- [ ] Plan 3 : veille hebdo
- [ ] Plan 4 : relevés de stats et tableau de bord
```

Dans `docs/superpowers/HANDOFF-brainstorming.md`, remplacer la section « Reste à faire » par :

```markdown
## Reste à faire

1. Plan 2 : évaluation par Claude (`sample`), règles calculées, verrou de conformité, jeu de référence ; ajouter `regles_studio` au profil réel (hors dépôt) et publier le studio réel.
2. Plan 3 : veille hebdo (consignes `src/claude/veille.md`, routine cloud, vue Bulletin).
3. Plan 4 : relevés de stats et tableau de bord.
```

- [ ] **Step 7 : commit**

```bash
git add README.md docs/superpowers/HANDOFF-brainstorming.md
git commit -m "Plan 1 livré : studio de test publié

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
